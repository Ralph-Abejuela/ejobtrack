import { describe, it, expect } from "vitest";
import {
	cn,
	formatDate,
	stringSimilarity,
	formatTimeAgo,
	COMPANY_SIMILARITY_THRESHOLD,
} from "./utils";

describe("stringSimilarity (unit)", () => {
	it("returns 1 for identical strings", () => {
		expect(stringSimilarity("Acme Corp", "Acme Corp")).toBe(1);
	});

	it("returns high score for near-identical strings", () => {
		const score = stringSimilarity(
			"Google Philippines",
			"Google Philippines Inc",
		);
		expect(score).toBeGreaterThan(0.5);
	});

	it("returns low score for unrelated strings", () => {
		const score = stringSimilarity("Google", "Microsoft");
		expect(score).toBeLessThan(0.5);
	});

	it("is symmetric (a,b) === (b,a)", () => {
		expect(stringSimilarity("Acme", "Acm")).toBe(
			stringSimilarity("Acm", "Acme"),
		);
	});

	it("correctly classifies threshold boundary companies", () => {
		const similar = stringSimilarity("JPMorganChase", "JPMorgan Chase");
		expect(similar).toBeGreaterThanOrEqual(COMPANY_SIMILARITY_THRESHOLD);
	});
});

describe("stringSimilarity (robustness)", () => {
	it("returns 0 for empty strings", () => {
		expect(stringSimilarity("", "")).toBe(1); // same === both empty
		expect(stringSimilarity("", "Acme")).toBe(0);
	});

	it("returns 0 for single-char strings (no bigrams)", () => {
		expect(stringSimilarity("a", "a")).toBe(1); // equality short-circuits
		expect(stringSimilarity("a", "b")).toBe(0);
	});

	it("handles unicode and whitespace-heavy input", () => {
		expect(stringSimilarity("Café 東京", "Café 東京")).toBe(1);
		expect(stringSimilarity("   Acme   ", "Acme")).toBeGreaterThan(0);
	});

	it("does not crash on very long input", () => {
		const long = "x".repeat(10_000);
		const score = stringSimilarity(long, long);
		expect(score).toBe(1);
	});
});

describe("formatTimeAgo (unit + robustness)", () => {
	it("formats recent timestamps", () => {
		expect(formatTimeAgo(Date.now() - 30_000)).toBe("just now");
		expect(formatTimeAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
		expect(formatTimeAgo(Date.now() - 3 * 3_600_000)).toBe("3h ago");
		expect(formatTimeAgo(Date.now() - 2 * 86_400_000)).toBe("2d ago");
	});

	it("handles boundary values without crashing", () => {
		expect(formatTimeAgo(Date.now())).toBe("just now"); // 0 delta
		expect(formatTimeAgo(Date.now() + 60_000)).toBe("just now"); // future
		expect(formatTimeAgo(NaN)).toBe("just now");
		expect(formatTimeAgo(0)).toBe("20680d ago"); // epoch is 20680 days back
	});
});

describe("formatDate (unit + robustness)", () => {
	it("formats valid dates", () => {
		expect(formatDate("2026-07-14T00:00:00.000Z")).toMatch(/Jul/);
		expect(formatDate("2026-07-14T00:00:00.000Z")).toMatch(/2026/);
	});

	it("returns input unchanged for garbage", () => {
		expect(formatDate("")).toBe("");
		expect(formatDate("not a date")).toBe("not a date");
		expect(formatDate("garbage!!!")).toBe("garbage!!!");
	});

	it("returns input unchanged for invalid date strings", () => {
		expect(formatDate("2026-13-99")).toBe("2026-13-99");
		expect(formatDate("undefined")).toBe("undefined");
	});

	it("does not crash on nullish input", () => {
		expect(formatDate(null as unknown as string)).toBe("");
		expect(formatDate(undefined as unknown as string)).toBe("");
	});
});

describe("cn (unit)", () => {
	it("merges conditional classes", () => {
		expect(cn("a", "b")).toBe("a b");
		const skip = false;
		expect(cn("a", skip && "b")).toBe("a");
		expect(cn("a", null, undefined, "b")).toBe("a b");
	});

	it("drops duplicate tailwind classes (twMerge)", () => {
		expect(cn("p-4", "p-2")).toBe("p-2");
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
	});
});
