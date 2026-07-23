import Dexie, { type EntityTable } from "dexie";

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobCrawlState {
	/** Primary key = userEmail */
	userEmail: string;
	/** Newest email internalDate seen (epoch ms) */
	newestTs: number | null;
	/** Oldest email internalDate seen (epoch ms) */
	oldestTs: number | null;
	/** Total unique jobs found across all cycles */
	totalJobs: number;
	/** When this cycle began (epoch ms) */
	cycleStartedAt: number;
	/** Emails scanned in the current cycle */
	cycleScanned: number;
}

export interface JobScannedEmail {
	/** Primary key = Gmail message id */
	id: string;
	userEmail: string;
}

const db = new Dexie("ejobtrack_job_crawl") as Dexie & {
	state: EntityTable<JobCrawlState, "userEmail">;
	scanned: EntityTable<JobScannedEmail, "id">;
};

db.version(1).stores({
	state: "userEmail",
	scanned: "id, userEmail",
});

// Version 2: clear old scanned data — id key now includes userEmail prefix
db.version(2)
	.stores({
		state: "userEmail",
		scanned: "id, userEmail",
	})
	.upgrade(async (tx) => {
		await tx.table("scanned").clear();
	});

/** Build a scoped primary key for scanned emails. */
function scannedKey(userEmail: string, emailId: string): string {
	return `${userEmail}:${emailId}`;
}

export { db };

// ── Scanned email dedup ────────────────────────────────────────────────────

export async function markScanned(
	userEmail: string,
	ids: string[],
): Promise<void> {
	await db.transaction("rw", db.scanned, async () => {
		for (const id of ids) {
			await db.scanned.put({ id: scannedKey(userEmail, id), userEmail });
		}
	});
}

export async function isScanned(
	userEmail: string,
	id: string,
): Promise<boolean> {
	return !!(await db.scanned.get(scannedKey(userEmail, id)));
}

export async function getScannedCount(userEmail: string): Promise<number> {
	return db.scanned.where({ userEmail }).count();
}
