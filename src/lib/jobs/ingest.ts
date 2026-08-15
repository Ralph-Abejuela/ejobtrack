import type { ParsedEmail } from "@/lib/gmail";
import type { JobApplication } from "./types";
import { parseEmail, parseEmailPlatform, isIgnoredSender } from "./registry";
import { classifyEmail } from "@/lib/classify-email";
import { storeJob, addToDuplicateIndex } from "@/lib/jobs-db";
import { stringSimilarity, COMPANY_SIMILARITY_THRESHOLD } from "@/lib/utils";

/**
 * Single source of truth for the email → job pipeline:
 * platform parse → ignore check → ML → dedup → store.
 *
 * Shared by use-job-poller.ts (batch sync) and use-retry-loop.ts (retries),
 * so dedup/store logic can't drift between the two paths.
 *
 * @param jobsById Mutable map of known jobs (id → job), seeded by the caller
 *   with getAllJobs(). Updated in place so within-batch duplicates are caught
 *   without re-fetching the whole table per email.
 */
export async function ingestEmail(
	email: ParsedEmail,
	userEmail: string,
	jobsById: Map<string, JobApplication>,
): Promise<{ newJobs: number }> {
	// 1. Try platform-specific parsers (known job senders) first
	let results = parseEmailPlatform(email);

	// 2. No platform match — skip known non-job senders, then try ML
	if (!results) {
		if (isIgnoredSender(email.from)) {
			return { newJobs: 0 };
		}
		const isJob = await classifyEmail(email.subject, email.body);
		if (isJob === false) {
			return { newJobs: 0 };
		}
		// ML says it's a job — use generic/fallback parser
		results = parseEmail(email);
	}
	if (!results) return { newJobs: 0 };

	let newJobs = 0;

	for (const result of results) {
		const normalizedCompany = result.company.toLowerCase().replace(/\s+/g, " ");
		const normalizedTitle = result.jobTitle.toLowerCase().replace(/\s+/g, " ");
		const jobId = `${userEmail}:${result.platform}:${normalizedCompany}:${normalizedTitle}`;

		// 1. Exact match by ID
		let dup = jobsById.get(jobId);

		// 2. Fuzzy match: same platform + same title, different but similar company
		if (!dup) {
			const fuzzy = [...jobsById.values()].filter(
				(j) =>
					j.platform === result.platform &&
					j.jobTitle.toLowerCase().replace(/\s+/g, " ") === normalizedTitle &&
					j.id !== jobId &&
					stringSimilarity(j.company, result.company) >=
						COMPANY_SIMILARITY_THRESHOLD,
			);
			if (fuzzy.length > 0) {
				// Use the more complete company name
				fuzzy.sort((a, b) => b.company.length - a.company.length);
				dup = fuzzy[0];
				// Update existing record with fuller company name
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

			// Always add to history
			dup.history = [
				...dup.history,
				{
					status: result.status,
					date: new Date(newTs).toISOString(),
					emailId: email.id,
				},
			];

			if (isNewer) {
				// Newer email — update status and fields
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
			// Ensure duplicate index has this job
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
			};
			await storeJob(newJob);
			await addToDuplicateIndex(userEmail, {
				id: newJob.id,
				jobTitle: newJob.jobTitle,
			});
			// Track in map so later emails in the same batch dedup against it
			jobsById.set(newJob.id, newJob);
			newJobs++;
		}
	}

	return { newJobs };
}
