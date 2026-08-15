import { useEffect, useRef, useCallback } from "react";
import { getMessage, parseMessage, RateLimitError } from "@/lib/gmail";
import { getAllJobs } from "@/lib/jobs-db";
import { markScanned, isScanned } from "@/lib/jobs-cache";
import { ingestEmail } from "@/lib/jobs/ingest";
import { storeEmails } from "@/lib/email-cache";
import { getPendingEntries, removeEntry, bumpRetry } from "@/lib/retry-queue";
import { capture } from "./analytics";
import { logger } from "./logger";

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
	onUnauthorized?: () => Promise<string | null>,
): void {
	const processingRef = useRef(false);

	const processPending = useCallback(async () => {
		if (!accessToken || !userEmail) return;
		if (processingRef.current) return;
		// ponytail: don't make Gmail API calls while tab is hidden —
		// token refresh popups in background tabs are confusing
		if (document.visibilityState === "hidden") return;

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
			const jobsById = new Map(
				(await getAllJobs(userEmail)).map((j) => [j.id, j]),
			);

			let doneCount = 0;

			for (const entry of pending) {
				doneCount++;
				opts.onProgress(doneCount, pending.length);

				try {
					const msg = await getMessage(
						accessToken,
						entry.emailId,
						"full",
						undefined,
						onUnauthorized,
					);
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

					// Shared pipeline: parse → ignore → ML → dedup → store
					await ingestEmail(email, userEmail, jobsById);

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

		// Resume processing when tab becomes visible again
		const onVisible = () => {
			if (document.visibilityState === "visible") processPending();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			clearTimeout(initialTimer);
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [accessToken, userEmail, processPending]);
}
