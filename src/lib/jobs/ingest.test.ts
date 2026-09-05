import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jobs/registry", () => ({
	parseEmailPlatform: vi.fn(),
	parseEmail: vi.fn(),
	isIgnoredSender: vi.fn(() => false),
}));

vi.mock("@/lib/classify-email", () => ({
	classifyEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/jobs-db", () => ({
	storeJob: vi.fn(),
	addToDuplicateIndex: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
	stringSimilarity: vi.fn(() => 0),
	COMPANY_SIMILARITY_THRESHOLD: 0.8,
}));

import { ingestEmail } from "./ingest";
import { parseEmailPlatform } from "./registry";
import { classifyEmail } from "@/lib/classify-email";
import { storeJob } from "@/lib/jobs-db";
import type { ParsedEmail } from "@/lib/gmail";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
	return {
		id: "msg1",
		threadId: "thread1",
		subject: "Re: Your application to Acme",
		from: "Job Seeker <jane@example.com>",
		to: "jobs@acme.com",
		date: "Thu, 1 Jan 2026 10:00:00 +0000",
		snippet: "Thanks for your interest",
		body: "Here is my resume. On Tue, the Acme team wrote: Your application to Software Engineer at Acme...",
		bodyType: "text/plain",
		labelIds: [],
		internalDate: "1767247200000",
		...overrides,
	};
}

describe("ingestEmail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips email sent by the current user (reply quoting job email)", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue(null);

		const result = await ingestEmail(
			makeEmail({ from: "Jane Doe <jane@example.com>" }),
			"jane@example.com",
			new Map(),
		);

		expect(result.newJobs).toBe(0);
		expect(storeJob).not.toHaveBeenCalled();
		expect(classifyEmail).not.toHaveBeenCalled();
	});

	it("skips email labeled SENT", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue(null);

		const result = await ingestEmail(
			makeEmail({ labelIds: ["SENT", "INBOX"] }),
			"jane@example.com",
			new Map(),
		);

		expect(result.newJobs).toBe(0);
		expect(storeJob).not.toHaveBeenCalled();
	});

	it("still ingests emails from job platforms for other senders", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue([
			{
				platform: "linkedin",
				jobTitle: "Software Engineer",
				company: "Acme",
				status: "applied",
				body: "",
				snippet: "",
				subject: "",
				from: "jobs-noreply@linkedin.com",
				url: "",
				date: "2026-01-01T10:00:00.000Z",
				emailId: "msg1",
			},
		]);

		const result = await ingestEmail(
			makeEmail({ from: "LinkedIn <jobs-noreply@linkedin.com>" }),
			"jane@example.com",
			new Map(),
		);

		expect(result.newJobs).toBe(1);
		expect(storeJob).toHaveBeenCalledTimes(1);
	});
});

describe("ingestEmail dedup (white-box: branch coverage)", () => {
	const baseJob = {
		id: "jane@example.com:linkedin:acme:software engineer",
		userEmail: "jane@example.com",
		platform: "linkedin",
		jobTitle: "Software Engineer",
		company: "Acme",
		status: "applied" as const,
		body: "old body",
		snippet: "old snippet",
		subject: "old subject",
		from: "jobs-noreply@linkedin.com",
		url: "",
		date: "2026-01-01T10:00:00.000Z",
		emailId: "old-email",
		createdAt: 1,
		updatedAt: 1,
		history: [],
	};

	const appliedResult = {
		platform: "linkedin",
		jobTitle: "Software Engineer",
		company: "Acme",
		status: "applied" as const,
		body: "",
		snippet: "",
		subject: "",
		from: "jobs-noreply@linkedin.com",
		url: "",
		date: "2026-01-02T10:00:00.000Z",
		emailId: "msg1",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("exact-match dup: appends history, updates newer fields, stores", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue([appliedResult]);
		const jobsById = new Map([[baseJob.id, { ...baseJob }]]);

		const result = await ingestEmail(
			makeEmail({
				from: "LinkedIn <jobs-noreply@linkedin.com>",
				id: "msg1",
				internalDate: "1767420000000", // 2026-01-02
				body: "new body",
			}),
			"jane@example.com",
			jobsById,
		);

		expect(result.newJobs).toBe(0);
		expect(storeJob).toHaveBeenCalledTimes(1);
		const stored = vi.mocked(storeJob).mock.calls[0][0];
		expect(stored.history).toHaveLength(1);
		expect(stored.body).toBe("new body");
		expect(stored.emailId).toBe("msg1");
		expect(stored.status).toBe("applied");
	});

	it("exact-match dup with SAME emailId: skips store entirely", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue([appliedResult]);
		const dupJob = { ...baseJob, emailId: "msg1" };
		const jobsById = new Map([[baseJob.id, dupJob]]);

		const result = await ingestEmail(
			makeEmail({
				from: "LinkedIn <jobs-noreply@linkedin.com>",
				id: "msg1",
			}),
			"jane@example.com",
			jobsById,
		);

		expect(result.newJobs).toBe(0);
		expect(storeJob).not.toHaveBeenCalled();
	});

	it("exact-match dup with OLDER email: history only, fields untouched", async () => {
		vi.mocked(parseEmailPlatform).mockReturnValue([appliedResult]);
		const jobsById = new Map([[baseJob.id, { ...baseJob }]]);

		const result = await ingestEmail(
			makeEmail({
				from: "LinkedIn <jobs-noreply@linkedin.com>",
				id: "msg1",
				internalDate: "1767250000000", // 2026-01-01 earlier than job date
			}),
			"jane@example.com",
			jobsById,
		);

		expect(result.newJobs).toBe(0);
		const stored = vi.mocked(storeJob).mock.calls[0][0];
		expect(stored.history).toHaveLength(1);
		expect(stored.body).toBe("old body"); // not overwritten by older email
		expect(stored.emailId).toBe("old-email");
	});

	it("fuzzy-match dup: similar company merges, fuller name kept", async () => {
		const { stringSimilarity } = await import("@/lib/utils");
		vi.mocked(stringSimilarity).mockReturnValue(0.9); // above threshold
		vi.mocked(parseEmailPlatform).mockReturnValue([
			{ ...appliedResult, company: "Acme Corporation" },
		]);
		const jobsById = new Map([[baseJob.id, { ...baseJob }]]);

		const result = await ingestEmail(
			makeEmail({ from: "LinkedIn <jobs-noreply@linkedin.com>" }),
			"jane@example.com",
			jobsById,
		);

		expect(result.newJobs).toBe(0); // merged, not new
		const stored = vi.mocked(storeJob).mock.calls[0][0];
		expect(stored.company).toBe("Acme Corporation"); // fuller name wins
	});

	it("fuzzy-match with unrelated company: creates NEW job", async () => {
		const { stringSimilarity } = await import("@/lib/utils");
		vi.mocked(stringSimilarity).mockReturnValue(0.1); // below threshold
		vi.mocked(parseEmailPlatform).mockReturnValue([
			{ ...appliedResult, company: "Zebra Technologies" },
		]);
		const jobsById = new Map([[baseJob.id, { ...baseJob }]]);

		const result = await ingestEmail(
			makeEmail({ from: "LinkedIn <jobs-noreply@linkedin.com>" }),
			"jane@example.com",
			jobsById,
		);

		expect(result.newJobs).toBe(1);
		expect(storeJob).toHaveBeenCalledTimes(1);
	});
});
