// ── Gmail 429 rate-limit retry queue ─────────────────────────────────────
// Persisted in localStorage per user. Message-level granularity — only
// getMessage() failures go in here. The retry loop runs in a separate hook.

const COOLDOWN_MS = 120_000; // 2 minutes

/** Backoff intervals by retry index (0-based). */
const BACKOFF_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min
const EXTENDED_BACKOFF_MS = 1_800_000; // 30min after 3+ retries

export interface RetryEntry {
	/** Gmail message ID */
	emailId: string;
	/** ISO timestamp of next allowed retry */
	nextAttempt: string;
	/** How many times we've retried so far (starts at 1) */
	retryCount: number;
	/** When this entry was first created (epoch ms) */
	createdAt: number;
	/** Last error message (for debugging) */
	lastError: string;
}

function queueKey(userEmail: string): string {
	return `gmail_retry_queue_${userEmail}`;
}

function cooldownKey(userEmail: string): string {
	return `gmail_batch_last_ms_${userEmail}`;
}

// ── Queue read / write ────────────────────────────────────────────────────

function readQueue(userEmail: string): RetryEntry[] {
	try {
		const raw = localStorage.getItem(queueKey(userEmail));
		return raw ? JSON.parse(raw) : [];
	} catch {
		console.warn("[retry-queue] Failed to read queue");
		return [];
	}
}

function writeQueue(userEmail: string, entries: RetryEntry[]): void {
	try {
		localStorage.setItem(queueKey(userEmail), JSON.stringify(entries));
	} catch {
		console.warn("[retry-queue] Failed to write queue");
	}
}

// ── Public API ────────────────────────────────────────────────────────────

/** Add a rate-limited email to the retry queue. No-op if already queued. */
export function enqueue(
	userEmail: string,
	emailId: string,
	error: string,
): void {
	const entries = readQueue(userEmail);
	if (entries.some((e) => e.emailId === emailId)) return;

	const now = Date.now();
	entries.push({
		emailId,
		nextAttempt: new Date(now + BACKOFF_MS[0]).toISOString(),
		retryCount: 1,
		createdAt: now,
		lastError: error,
	});
	writeQueue(userEmail, entries);
}

/** Get entries whose nextAttempt has passed, sorted soonest-first. */
export function getPendingEntries(userEmail: string): RetryEntry[] {
	const now = Date.now();
	return readQueue(userEmail)
		.filter((e) => new Date(e.nextAttempt).getTime() <= now)
		.sort(
			(a, b) =>
				new Date(a.nextAttempt).getTime() - new Date(b.nextAttempt).getTime(),
		);
}

/** Remove an entry from the queue (success or non-retriable error). */
export function removeEntry(userEmail: string, emailId: string): void {
	const entries = readQueue(userEmail).filter((e) => e.emailId !== emailId);
	writeQueue(userEmail, entries);
}

/**
 * Increment retry count and recalculate nextAttempt with backoff.
 * After 3 retries, escalates to 30min intervals indefinitely.
 */
export function bumpRetry(
	userEmail: string,
	emailId: string,
	error: string,
): void {
	const entries = readQueue(userEmail);
	const idx = entries.findIndex((e) => e.emailId === emailId);
	if (idx === -1) {
		console.warn("[retry-queue] bumpRetry: entry not found:", emailId);
		return;
	}

	const entry = entries[idx];
	const nextRetry = entry.retryCount + 1;
	const delayMs =
		nextRetry - 1 < BACKOFF_MS.length
			? BACKOFF_MS[nextRetry - 1]
			: EXTENDED_BACKOFF_MS;

	entries[idx] = {
		...entry,
		retryCount: nextRetry,
		nextAttempt: new Date(Date.now() + delayMs).toISOString(),
		lastError: error,
	};
	writeQueue(userEmail, entries);
}

/** Total entries in the queue. */
export function getQueueSize(userEmail: string): number {
	return readQueue(userEmail).length;
}

/** Clear all pending retries for a user (used on sign-out). */
export function clearQueue(userEmail: string): void {
	localStorage.removeItem(queueKey(userEmail));
}

/** Clear all retry queues across all users (used when no email known). */
export function clearAllQueues(): void {
	const keys = Object.keys(localStorage).filter((k) =>
		k.startsWith("gmail_retry_queue_"),
	);
	for (const key of keys) localStorage.removeItem(key);
}

// ── Batch cooldown tracking ──────────────────────────────────────────────
// Prevents retry loop from running right after a main poller batch, which
// would double-dip into Gmail rate limits.

/** Record that a main poller batch just finished. */
export function markBatchCompleted(userEmail: string): void {
	localStorage.setItem(cooldownKey(userEmail), String(Date.now()));
}

/** Check if we're still in the cooldown window after a batch. */
export function isInCooldown(userEmail: string): boolean {
	const lastBatch = Number(localStorage.getItem(cooldownKey(userEmail)) ?? "0");
	return Date.now() - lastBatch < COOLDOWN_MS;
}
