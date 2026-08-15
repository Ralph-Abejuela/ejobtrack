import { describe, it, expect } from "vitest";
import { isIgnoredSender, parseEmail, parseEmailPlatform } from "./registry";
import linkedinApply from "./__test__/linkedin.apply.scrubbed.json";
import linkedinIgnore from "./__test__/linkedin.ignore.scrubbed.json";
import jobstreetApply from "./__test__/jobstreet.apply.scrubbed.json";

type EmailShape = Parameters<typeof parseEmail>[0];

describe("isIgnoredSender (unit — 3-mode matching)", () => {
	it("matches full header string with angle brackets", () => {
		expect(isIgnoredSender("LinkedIn <jobs-listings@linkedin.com>")).toBe(true);
	});

	it("matches regex entries like .*<invitations@linkedin.com>", () => {
		expect(isIgnoredSender("John Doe <invitations@linkedin.com>")).toBe(true);
		expect(
			isIgnoredSender("LinkedIn Invitations <invitations@linkedin.com>"),
		).toBe(true);
	});

	it("matches plain string against extracted email address (SEEK IGNORE_SENDERS)", () => {
		// Plain string entries match via includes() on the extracted address
		expect(isIgnoredSender("SEEK Pass Support <support@seekpass.co>")).toBe(
			true,
		);
	});

	it("does NOT match non-ignored senders", () => {
		expect(isIgnoredSender("Acme <jobs@acme.com>")).toBe(false);
		expect(isIgnoredSender("jobs-noreply@linkedin.com")).toBe(false); // parser, not ignore
	});

	it("is case-insensitive", () => {
		expect(isIgnoredSender("John Doe <Invitations@LinkedIn.com>")).toBe(true);
	});
});

describe("isIgnoredSender (robustness)", () => {
	it("returns false for empty/garbage from headers", () => {
		expect(isIgnoredSender("")).toBe(false);
		expect(isIgnoredSender("   ")).toBe(false);
		expect(isIgnoredSender("<<<>>>")).toBe(false);
	});

	it("returns false for header with only display name, no email", () => {
		expect(isIgnoredSender("John Doe")).toBe(false);
	});

	it("returns false for malformed angle brackets", () => {
		expect(isIgnoredSender("invitations@linkedin.com>")).toBe(false);
		expect(isIgnoredSender("<invitations@linkedin.com")).toBe(false);
	});

	it("returns false for nullish input without crashing", () => {
		expect(isIgnoredSender(null as unknown as string)).toBe(false);
		expect(isIgnoredSender(undefined as unknown as string)).toBe(false);
	});
});

describe("parseEmailPlatform (integration — real parsers + fixtures)", () => {
	it("routes LinkedIn apply email to linkedin parser", () => {
		const email = linkedinApply[0] as EmailShape;
		const result = parseEmailPlatform(email);
		expect(result).not.toBeNull();
		expect(result![0].platform).toBe("linkedin");
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it("routes JobStreet apply email to jobstreet parser", () => {
		const email = jobstreetApply[0] as EmailShape;
		const result = parseEmailPlatform(email);
		expect(result).not.toBeNull();
		expect(result![0].platform).toBe("jobstreet");
	});

	it("returns null for ignored LinkedIn sender", () => {
		const email = linkedinIgnore[0] as EmailShape;
		expect(parseEmailPlatform(email)).toBeNull();
	});

	it("returns null for unknown sender with no platform match", () => {
		const email: EmailShape = {
			id: "x1",
			from: "Unknown <hello@unknown-domain.com>",
			subject: "Hello there",
			snippet: "",
			body: "Just a greeting.",
			internalDate: "1700000000000",
		};
		expect(parseEmailPlatform(email)).toBeNull();
	});
});

describe("parseEmail (integration — platform → generic fallback)", () => {
	it("parses full LinkedIn application via platform parser", () => {
		const email = linkedinApply[0] as EmailShape;
		const result = parseEmail(email);
		expect(result).not.toBeNull();
		expect(result![0].platform).toBe("linkedin");
	});

	it("falls back to generic parser for unknown ATS senders", () => {
		const email: EmailShape = {
			id: "x2",
			from: "Greenhouse <notifications@greenhouse.io>",
			subject: "Application status update from Acme Corp",
			snippet: "Thank you for your interest",
			body: "Thank you for your interest in the Software Engineer position at Acme Corp. Unfortunately, we will not be moving forward with your application.",
			internalDate: "1700000000000",
		};
		const result = parseEmail(email);
		expect(result).not.toBeNull();
		expect(result![0].company).toBe("Acme Corp");
		expect(result![0].status).toBe("rejected");
	});

	it("returns null for non-job email (newsletter)", () => {
		const email: EmailShape = {
			id: "x3",
			from: "Newsletter <news@techdaily.com>",
			subject: "Your weekly tech roundup",
			snippet: "Top stories this week",
			body: "Here are this week's top tech stories.",
			internalDate: "1700000000000",
		};
		expect(parseEmail(email)).toBeNull();
	});
});

describe("parseEmail (robustness — garbage/boundary inputs)", () => {
	it("returns null for empty body and subject", () => {
		const email: EmailShape = {
			id: "r1",
			from: "Acme <jobs@acme.com>",
			subject: "",
			snippet: "",
			body: "",
			internalDate: "1700000000000",
		};
		expect(parseEmail(email)).toBeNull();
	});

	it("does not crash on garbled body text", () => {
		const email: EmailShape = {
			id: "r2",
			from: "Acme <jobs@acme.com>",
			subject: "=??===",
			snippet: "\u0000\u0001\u0002",
			body: "!!!@@@###\u00a0\u200b\ufffe\u0000".repeat(50),
			internalDate: "1700000000000",
		};
		const result = parseEmail(email);
		// Either null or a parse — must not throw
		expect(result === null || Array.isArray(result)).toBe(true);
	});

	it("handles missing optional fields (no bodyHtml)", () => {
		const email: EmailShape = {
			id: "r3",
			from: "LinkedIn <jobs-noreply@linkedin.com>",
			subject: "Jane, your application was sent to Acme",
			snippet: "",
			body: "Your application was sent to Acme",
			internalDate: "1700000000000",
		};
		const result = parseEmail(email);
		expect(result === null || Array.isArray(result)).toBe(true);
	});

	it("does not crash on extreme internalDate", () => {
		const email: EmailShape = {
			id: "r4",
			from: "Acme <jobs@acme.com>",
			subject: "Application update",
			snippet: "",
			body: "Your application to Engineer at Acme",
			internalDate: "0",
		};
		expect(() => parseEmail(email)).not.toThrow();
	});

	it("does not crash on enormous subject line", () => {
		const email: EmailShape = {
			id: "r5",
			from: "Acme <jobs@acme.com>",
			subject: "Application ".repeat(2000),
			snippet: "",
			body: "position as Engineer at Acme",
			internalDate: "1700000000000",
		};
		expect(() => parseEmail(email)).not.toThrow();
	});
});
