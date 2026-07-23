import { useEffect, useRef, useCallback } from "react";
import { getMessage, parseMessage, RateLimitError } from "@/lib/gmail";
import { parseEmail, parseEmailPlatform } from "@/lib/jobs/registry";
import { getAllJobs, storeJob, addToDuplicateIndex } from "@/lib/jobs-db";
import { markScanned, isScanned } from "@/lib/jobs-cache";
import { classifyEmail } from "@/lib/classify-email";
import { storeEmails } from "@/lib/email-cache";
import { stringSimilarity, COMPANY_SIMILARITY_THRESHOLD } from "@/lib/utils";
import { getPendingEntries, removeEntry, bumpRetry } from "@/lib/retry-queue";
import { capture } from "./analytics";
import { logger } from "./logger";
import type { JobApplication } from "@/lib/jobs/types";

const POLL_INTERVAL_MS = 10_000; // check queue every 10s

/**
 * Hook that runs a separate background loop to retry rate-limited
 * Gmail message fetches. Calls onBatchProcessed when jobs change so
 * the parent hook can reload.
 */
export function useRetryLoop(
	accessToken: string | null,
	userEmail: string,
	opts: {
		onProgress: (processed: number, total: number) => void;
		onDone: () => void;
	},
): void {
	const processingRef = useRef(false);

	const processPending = useCallback(async () => {
		if (!accessToken || !userEmail) return;
		if (processingRef.current) return;

		const pending = getPendingEntries(userEmail);
		if (pending.length === 0) return;

		logger.log(
			"retry",
			`processing ${pending.length} pending email(s)`,
			pending.map((e) => ({
				id: e.emailId,
				retry: e.retryCount,
				nextAttempt: e.nextAttempt,
			})),
		);

		opts.onProgress(0, pending.length);

		processingRef.current = true;

		try {
			const existing = await getAllJobs(userEmail);

			let doneCount = 0;

			for (const entry of pending) {
				doneCount++;
				opts.onProgress(doneCount, pending.length);

				try {
					const msg = await getMessage(accessToken, entry.emailId, "full");
					const email = parseMessage(msg);

					logger.log(
						"retry",
						`processing ${entry.emailId} (retry #${entry.retryCount})`,
					);

					// Cache so timeline viewer doesn't re-fetch
					await storeEmails(userEmail, [email]);

					if (await isScanned(userEmail, email.id)) {
						logger.log("retry", `${entry.emailId} already scanned, removing`);
						removeEntry(userEmail, entry.emailId);
						continue;
					}

					// 1. Try platform-specific parsers first
					let results = parseEmailPlatform(email);

					// 2. No platform match — use ML
					if (!results) {
						const isJob = await classifyEmail(email.subject, email.body);
						if (isJob === false) {
							logger.log("retry", `${entry.emailId} not a job, skipping`);
							await markScanned(userEmail, [email.id]);
							removeEntry(userEmail, entry.emailId);
							continue;
						}
						results = parseEmail(email);
					}
					if (!results) {
						await markScanned(userEmail, [email.id]);
						removeEntry(userEmail, entry.emailId);
						continue;
					}

					for (const result of results) {
						const normalizedCompany = result.company
							.toLowerCase()
							.replace(/\s+/g, " ");
						const normalizedTitle = result.jobTitle
							.toLowerCase()
							.replace(/\s+/g, " ");
						const jobId = `${userEmail}:${result.platform}:${normalizedCompany}:${normalizedTitle}`;

						// Exact match by ID
						let dup = existing.find((j) => j.id === jobId);

						// Fuzzy match: same platform + same title, similar company
						if (!dup) {
							const fuzzy = existing.filter(
								(j) =>
									j.platform === result.platform &&
									j.jobTitle.toLowerCase().replace(/\s+/g, " ") ===
										normalizedTitle &&
									j.id !== jobId &&
									stringSimilarity(j.company, result.company) >=
										COMPANY_SIMILARITY_THRESHOLD,
							);
							if (fuzzy.length > 0) {
								fuzzy.sort((a, b) => b.company.length - a.company.length);
								dup = fuzzy[0];
								dup.company =
									result.company.length > dup.company.length
										? result.company
										: dup.company;
							}
						}

						if (dup) {
							if (dup.emailId === email.id) continue;

							const newTs = Number(email.internalDate);
							const oldTs = new Date(dup.date).getTime();
							const isNewer = newTs > oldTs;

							dup.history = [
								...dup.history,
								{
									status: result.status,
									date: new Date(newTs).toISOString(),
									emailId: email.id,
								},
							];

							if (isNewer) {
								dup.status = result.status;
								dup.date = new Date(newTs).toISOString();
								dup.emailId = email.id;
								dup.subject = email.subject;
								dup.snippet = email.snippet;
								if (email.body) dup.body = email.body;
								if (result.url) dup.url = result.url;
							}

							dup.updatedAt = Date.now();
							await storeJob(dup);
							await addToDuplicateIndex(userEmail, {
								id: dup.id,
								jobTitle: dup.jobTitle,
							});
						} else {
							const newJob: JobApplication = {
								...result,
								id: jobId,
								userEmail,
								createdAt: Date.now(),
								updatedAt: Date.now(),
								history: [
									{
										status: result.status,
										date: new Date(Number(email.internalDate)).toISOString(),
										emailId: email.id,
									},
								],
							} as JobApplication;
							await storeJob(newJob);
							await addToDuplicateIndex(userEmail, {
								id: newJob.id,
								jobTitle: newJob.jobTitle,
							});
						}
					}

					await markScanned(userEmail, [email.id]);
					removeEntry(userEmail, entry.emailId);

					logger.log("retry", `${entry.emailId} done`);

					await capture("retry_success", {
						email_id: entry.emailId,
						retries: entry.retryCount,
						user: userEmail,
					});
				} catch (err) {
					if (err instanceof RateLimitError) {
						logger.log(
							"retry",
							`${entry.emailId} rate-limited again, scheduling retry #${entry.retryCount + 1}`,
						);
						bumpRetry(userEmail, entry.emailId, err.message);
					} else {
						logger.log(
							"retry",
							`${entry.emailId} non-retriable error, giving up`,
						);
						// Non-retriable error — give up
						removeEntry(userEmail, entry.emailId);
					}
				}
			}
		} finally {
			processingRef.current = false;
		}

		opts.onDone();
	}, [accessToken, userEmail, opts]);

	useEffect(() => {
		if (!accessToken || !userEmail) return;

		// Initial check shortly after mount
		const initialTimer = setTimeout(() => processPending(), 15_000);
		const interval = setInterval(processPending, POLL_INTERVAL_MS);

		return () => {
			clearTimeout(initialTimer);
			clearInterval(interval);
		};
	}, [accessToken, userEmail, processPending]);
}
