import Dexie, { type EntityTable } from "dexie";
import type { JobApplication, JobStatus } from "@/lib/jobs/types";

const db = new Dexie("ejobtrack_jobs") as Dexie & {
	jobs: EntityTable<JobApplication, "id">;
};

db.version(1).stores({
	// id = `${userEmail}:${platform}:${normalisedCompany}:${normalisedJobTitle}`
	jobs: "id, userEmail, platform, status, company, jobTitle, date, createdAt, updatedAt, [platform+status], [userEmail+status]",
});

export { db };

// ── CRUD operations (ALL scoped by userEmail) ─────────────────────────────

export async function storeJob(job: JobApplication): Promise<void> {
	await db.jobs.put(job);
}

export async function getAllJobs(userEmail: string): Promise<JobApplication[]> {
	return db.jobs.where({ userEmail }).reverse().sortBy("date");
}

export async function getJobsByStatus(
	userEmail: string,
	status: JobStatus,
): Promise<JobApplication[]> {
	return db.jobs
		.where("[userEmail+status]")
		.equals([userEmail, status])
		.reverse()
		.sortBy("date");
}

export async function getJobsByPlatform(
	userEmail: string,
	platform: string,
): Promise<JobApplication[]> {
	return db.jobs.where({ userEmail, platform }).reverse().sortBy("date");
}

export async function getJob(id: string): Promise<JobApplication | undefined> {
	return db.jobs.get(id);
}

export async function updateJobStatus(
	id: string,
	status: JobStatus,
	change: { date: string; emailId: string },
): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job) return;

	job.status = status;
	job.updatedAt = Date.now();
	job.history = [
		...job.history,
		{ status, date: change.date, emailId: change.emailId },
	];

	await db.jobs.put(job);
}

export async function deleteJob(userEmail: string, id: string): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail) return;
	await db.jobs.delete(id);
}

export async function getStatusCounts(
	userEmail: string,
): Promise<Record<string, number>> {
	const jobs = await db.jobs.where({ userEmail }).toArray();
	const counts: Record<string, number> = {};
	for (const j of jobs) {
		counts[j.status] = (counts[j.status] ?? 0) + 1;
	}
	return counts;
}

export async function clearUserJobs(userEmail: string): Promise<void> {
	await db.jobs.where({ userEmail }).delete();
}

// ── Merge / Dedup ──────────────────────────────────────────────────────────

// ── Resolution history / Undo ──────────────────────────────────────────

const RESOLUTION_KEY = "resolution_history";
const REMOVED_PREFIX = "removed_job_";
const MAX_RESOLUTIONS = 20;

export interface ResolutionEntry {
	groupKey: string;
	action: "merge" | "ignore" | "merge-undo" | "ignore-undo";
	timestamp: number;
	keepId?: string;
	removeId?: string;
}

function getResolutions(): ResolutionEntry[] {
	try {
		const raw = localStorage.getItem(RESOLUTION_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveResolution(entry: ResolutionEntry): void {
	const all = getResolutions();
	all.unshift(entry);
	// Cap at MAX_RESOLUTIONS
	if (all.length > MAX_RESOLUTIONS) {
		const removed = all.splice(MAX_RESOLUTIONS);
		// Clean up old snapshot data
		for (const r of removed) {
			if (r.action === "merge") {
				localStorage.removeItem(`${REMOVED_PREFIX}${r.timestamp}`);
			}
		}
	}
	localStorage.setItem(RESOLUTION_KEY, JSON.stringify(all));
}

function clearResolutionSnapshots(): void {
	const all = getResolutions();
	for (const r of all) {
		if (r.action === "merge" || r.action === "merge-undo") {
			localStorage.removeItem(`${REMOVED_PREFIX}${r.timestamp}`);
		}
	}
	localStorage.removeItem(RESOLUTION_KEY);
}

/** Get past resolution actions for the user. */
export function getResolutionHistory(): ResolutionEntry[] {
	return getResolutions();
}

/** Dismiss all resolution history. */
export function clearResolutionHistory(): void {
	clearResolutionSnapshots();
}

/** Re-dismiss a group that was undo-unignored. */
export function reDismissGroup(groupKey: string): void {
	try {
		const raw = localStorage.getItem("dismissed_dup_groups");
		const set = new Set<string>(raw ? JSON.parse(raw) : []);
		set.add(groupKey);
		localStorage.setItem("dismissed_dup_groups", JSON.stringify([...set]));
	} catch {
		/* ignore */
	}
}

/** Remove a group from the dismissed set (undo ignore). */
export function unIgnoreGroup(groupKey: string): void {
	try {
		const raw = localStorage.getItem("dismissed_dup_groups");
		const set = new Set<string>(raw ? JSON.parse(raw) : []);
		set.delete(groupKey);
		localStorage.setItem("dismissed_dup_groups", JSON.stringify([...set]));
	} catch {
		/* ignore */
	}
}

/** Group of records that are likely the same job with slightly different names. */
export interface DuplicateGroup {
	groupKey: string; // `${platform}:${normalizedTitle}`
	canonicalCompany: string; // longest company name in the group
	jobs: JobApplication[];
}

/** Find jobs with same platform + title but similar-but-different company names. */
export async function findPotentialDuplicates(
	userEmail: string,
): Promise<DuplicateGroup[]> {
	const jobs = await db.jobs.where({ userEmail }).toArray();

	// Group by normalized job title
	const groups = new Map<string, JobApplication[]>();
	for (const j of jobs) {
		const key = j.jobTitle.toLowerCase().replace(/\s+/g, " ");
		const arr = groups.get(key) ?? [];
		arr.push(j);
		groups.set(key, arr);
	}

	const result: DuplicateGroup[] = [];
	for (const [groupKey, group] of groups) {
		if (group.length < 2) continue;

		// Sort by company name length (longest first) for canonical pick
		group.sort((a, b) => b.company.length - a.company.length);
		result.push({
			groupKey,
			canonicalCompany: group[0].company,
			jobs: group,
		});
	}

	return result;
}

/**
 * Merge two job records: transfer history from removeId into keepId, then delete removeId.
 * The kept record keeps its id, company, and latest status.
 * Saves snapshots to localStorage for undo support.
 */
export async function mergeJobs(
	userEmail: string,
	keepId: string,
	removeId: string,
): Promise<{
	keepId: string;
	removeId: string;
	groupKey: string;
} | null> {
	const keep = await db.jobs.get(keepId);
	const remove = await db.jobs.get(removeId);

	if (!keep || !remove) return null;
	if (keep.userEmail !== userEmail || remove.userEmail !== userEmail)
		return null;

	const groupKey = `${remove.platform}:${remove.jobTitle.toLowerCase().replace(/\s+/g, " ")}`;

	// Snapshot both records before mutating
	const keepSnapshot = { ...keep };
	const removeSnapshot = { ...remove };

	// Merge history: all from remove + existing from keep, sorted by date
	const merged = [...remove.history, ...keep.history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	// Keep the latest date/status/emailId from whichever is newer
	const keepDate = new Date(keep.date).getTime();
	const removeDate = new Date(remove.date).getTime();

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({
			...keep,
			history: merged,
			date: keepDate >= removeDate ? keep.date : remove.date,
			emailId: keepDate >= removeDate ? keep.emailId : remove.emailId,
			updatedAt: Date.now(),
		});
		await db.jobs.delete(removeId);
	});

	const entry: ResolutionEntry = {
		groupKey,
		action: "merge",
		timestamp: Date.now(),
		keepId,
		removeId,
	};
	// Store snapshots so we can undo
	try {
		localStorage.setItem(
			`${REMOVED_PREFIX}${entry.timestamp}`,
			JSON.stringify({ keepSnapshot, removeSnapshot }),
		);
	} catch {
		/* localStorage may be full — undo not available */
	}
	saveResolution(entry);

	return { keepId, removeId, groupKey };
}

/**
 * Merge multiple jobs into one. If newCompany/newTitle are provided, the
 * kept record gets those values; otherwise the longest company name and
 * the existing jobTitle are used. All selected jobs' history is consolidated.
 */
export async function mergeIntoNew(
	userEmail: string,
	jobIds: string[],
	newCompany?: string,
	newTitle?: string,
): Promise<boolean> {
	if (jobIds.length < 2) return false;

	const records = await Promise.all(jobIds.map((id) => db.jobs.get(id)));
	const valid = records.filter(
		(r): r is JobApplication => r !== undefined && r.userEmail === userEmail,
	);
	if (valid.length < 2) return false;

	// Pick keep: longest company name, or first if equal
	valid.sort((a, b) => b.company.length - a.company.length);
	const keep = valid[0];
	const toRemove = valid.slice(1);

	// Merge history from all, sorted by date
	const merged = toRemove
		.flatMap((r) => r.history)
		.concat(keep.history)
		.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

	// Keep the latest date/status/emailId
	const allDates = valid.map((r) => ({
		date: r.date,
		emailId: r.emailId,
		ts: new Date(r.date).getTime(),
	}));
	allDates.sort((a, b) => b.ts - a.ts);
	const latest = allDates[0];

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({
			...keep,
			company: newCompany ?? keep.company,
			jobTitle: newTitle ?? keep.jobTitle,
			history: merged,
			date: latest.date,
			emailId: latest.emailId,
			updatedAt: Date.now(),
		});
		for (const r of toRemove) {
			await db.jobs.delete(r.id);
		}
	});

	const groupKey = keep.jobTitle.toLowerCase().replace(/\s+/g, " ");
	const entry: ResolutionEntry = {
		groupKey,
		action: "merge",
		timestamp: Date.now(),
		keepId: keep.id,
		removeId: toRemove.map((r) => r.id).join(","),
	};
	saveResolution(entry);

	return true;
}

/**
 * Undo a previous merge: restore the removed record and revert the kept record
 * to its pre-merge state.
 */
export async function undoMerge(timestamp: number): Promise<boolean> {
	const all = getResolutions();
	const entry = all.find(
		(r) => r.timestamp === timestamp && r.action === "merge",
	);
	if (!entry || !entry.keepId || !entry.removeId) return false;

	// Retrieve snapshots
	try {
		const raw = localStorage.getItem(`${REMOVED_PREFIX}${timestamp}`);
		if (!raw) return false;
		const { keepSnapshot, removeSnapshot } = JSON.parse(raw);

		await db.transaction("rw", db.jobs, async () => {
			// Revert keep to pre-merge state
			await db.jobs.put(keepSnapshot);
			// Restore removed record
			await db.jobs.put(removeSnapshot);
		});

		// Remove snapshots
		localStorage.removeItem(`${REMOVED_PREFIX}${timestamp}`);
		// Mark as undone in history
		const updated = all.map((r) =>
			r.timestamp === timestamp ? { ...r, action: "merge-undo" as const } : r,
		);
		localStorage.setItem(RESOLUTION_KEY, JSON.stringify(updated));

		return true;
	} catch {
		return false;
	}
}
