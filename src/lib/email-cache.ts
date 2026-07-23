import Dexie, { type EntityTable } from "dexie";
import type { ParsedEmail } from "./gmail";

export interface EmailRecord extends ParsedEmail {
	/** Primary key — same as message id */
	id: string;
	/** The Google account email that fetched this message */
	userEmail: string;
	/** Cached at timestamp (epoch ms) */
	cachedAt: number;
}

const DB_NAME = "ejobtrack";
const MAX_EMAILS_PER_USER = 10_000;

const db = new Dexie(DB_NAME) as Dexie & {
	emails: EntityTable<EmailRecord, "id">;
};

// Schema version 2 — added userEmail for per-account isolation
db.version(2).stores({
	emails: "id, internalDate, cachedAt, userEmail, [userEmail+internalDate]",
});

// ── Cache operations ──────────────────────────────────────────────────────

/** Insert or update emails in cache for a specific user, then evict oldest if over limit. */
export async function storeEmails(
	userEmail: string,
	emails: ParsedEmail[],
): Promise<void> {
	const now = Date.now();
	const records: EmailRecord[] = emails.map((e) => ({
		...e,
		userEmail,
		cachedAt: now,
	}));

	await db.transaction("rw", db.emails, async () => {
		for (const rec of records) {
			await db.emails.put(rec);
		}

		// Evict oldest for THIS user if over MAX_EMAILS_PER_USER
		const count = await db.emails.where({ userEmail }).count();
		if (count > MAX_EMAILS_PER_USER) {
			const excess = count - MAX_EMAILS_PER_USER;
			const toDelete = await db.emails
				.where({ userEmail })
				.sortBy("internalDate") // oldest first
				.then((sorted) => sorted.slice(0, excess))
				.then((records) => records.map((r) => r.id));

			if (toDelete.length > 0) {
				await db.emails.bulkDelete(toDelete);
			}
		}
	});
}

export { db };
