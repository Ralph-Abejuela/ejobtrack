import Dexie, { type EntityTable } from "dexie";

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobScannedEmail {
	/** Primary key = Gmail message id */
	id: string;
	userEmail: string;
}

// ponytail: crawl state (newestTs/oldestTs/cursor) lives in localStorage
// (job_crawl_${userEmail} in use-job-poller.ts), not in this Dexie DB.
const db = new Dexie("ejobtrack_job_crawl") as Dexie & {
	scanned: EntityTable<JobScannedEmail, "id">;
};

// Version 1: scanned dedup table.
// Version 2: cleared old scanned data — id key now includes userEmail prefix.
// Version 3: dropped the unused `state` table (crawl state moved to localStorage).
db.version(1).stores({
	scanned: "id, userEmail",
});

db.version(2)
	.stores({
		scanned: "id, userEmail",
	})
	.upgrade(async (tx) => {
		await tx.table("scanned").clear();
	});

db.version(3).stores({
	state: null, // drop dead table
	scanned: "id, userEmail",
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
