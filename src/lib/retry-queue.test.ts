import { describe, it, expect, beforeEach } from "vitest";
import {
	enqueue,
	bumpRetry,
	removeEntry,
	clearQueue,
	getQueueSize,
	clearAllQueues,
} from "./retry-queue";
import type { RetryEntry } from "./retry-queue";

const TEST_USER = "test-user@example.com";

function readQueueRaw(user: string): RetryEntry[] {
	const raw = localStorage.getItem(`gmail_retry_queue_${user}`);
	return raw ? JSON.parse(raw) : [];
}

beforeEach(() => {
	const keys = Object.keys(localStorage).filter((k) =>
		k.startsWith("gmail_retry_queue_"),
	);
	for (const key of keys) localStorage.removeItem(key);
});

describe("retry-queue", () => {
	it("enqueue adds entry and size shows it", () => {
		enqueue(TEST_USER, "email-1", "rate limited");
		expect(getQueueSize(TEST_USER)).toBe(1);
	});

	it("duplicate enqueue keeps queue size at 1", () => {
		enqueue(TEST_USER, "email-1", "rate limited");
		enqueue(TEST_USER, "email-1", "rate limited again");
		expect(getQueueSize(TEST_USER)).toBe(1);
	});

	it("bumpRetry increases retry count and backoff", () => {
		enqueue(TEST_USER, "email-1", "rate limited");

		// Retry 2: backoff 2min
		bumpRetry(TEST_USER, "email-1", "still rate limited");
		let raw = readQueueRaw(TEST_USER);
		let entry = raw.find((e) => e.emailId === "email-1")!;
		expect(entry.retryCount).toBe(2);
		const delay2 = new Date(entry.nextAttempt).getTime() - Date.now();
		expect(delay2).toBeGreaterThan(60_000);
		expect(delay2).toBeLessThan(180_000);

		// Retry 3: backoff 10min
		bumpRetry(TEST_USER, "email-1", "still rate limited");
		raw = readQueueRaw(TEST_USER);
		entry = raw.find((e) => e.emailId === "email-1")!;
		expect(entry.retryCount).toBe(3);
		const delay3 = new Date(entry.nextAttempt).getTime() - Date.now();
		expect(delay3).toBeGreaterThan(300_000);
		expect(delay3).toBeLessThan(900_000);

		// Retry 4: backoff 30min (extended)
		bumpRetry(TEST_USER, "email-1", "still rate limited");
		raw = readQueueRaw(TEST_USER);
		entry = raw.find((e) => e.emailId === "email-1")!;
		expect(entry.retryCount).toBe(4);
		const delay4 = new Date(entry.nextAttempt).getTime() - Date.now();
		expect(delay4).toBeGreaterThan(1_500_000);
		expect(delay4).toBeLessThan(3_600_000);

		// Queue size stays 1 throughout
		expect(getQueueSize(TEST_USER)).toBe(1);
	});

	it("removeEntry clears entry and queue size goes to 0", () => {
		enqueue(TEST_USER, "email-1", "rate limited");
		removeEntry(TEST_USER, "email-1");
		expect(getQueueSize(TEST_USER)).toBe(0);
	});

	it("clearQueue empties all entries for user", () => {
		enqueue(TEST_USER, "email-1", "rate limited");
		enqueue(TEST_USER, "email-2", "rate limited");
		expect(getQueueSize(TEST_USER)).toBe(2);

		clearQueue(TEST_USER);
		expect(getQueueSize(TEST_USER)).toBe(0);
	});

	it("clearAllQueues removes all gmail_retry_queue_ keys", () => {
		enqueue(TEST_USER, "email-1", "rate limited");
		enqueue("other@user.com", "email-2", "rate limited");

		clearAllQueues();

		expect(getQueueSize(TEST_USER)).toBe(0);
		expect(getQueueSize("other@user.com")).toBe(0);
	});
});
