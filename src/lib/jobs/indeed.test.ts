import { describe, it, expect } from "vitest";
import { indeedParser } from "./indeed";
import { JobStatus } from "./types";
import indeedApplyData from "./__test__/indeed.apply.scrubbed.json";
import indeedRejectData from "./__test__/indeed.reject.scrubbed.json";
import indeedIgnoreData from "./__test__/indeed.ignore.scrubbed.json";

describe("indeedParser", () => {
	it.each(
		indeedApplyData,
	)("returns null for unmatched sender [%#]: $subject", (email) => {
		const result = indeedParser.parse(email);
		expect(result).toBeNull();
	});

	it.each(indeedRejectData)("parses rejection [%#]: $subject", (email) => {
		const result = indeedParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.REJECTED);
		expect(result![0].company).toBeTruthy();
	});

	it.each(
		indeedIgnoreData,
	)("returns null for non-application [%#]: $subject", (email) => {
		const result = indeedParser.parse(email);
		expect(result).toBeNull();
	});

	it("parses standard application confirmation (inline)", () => {
		const email = {
			from: "Indeed Apply <indeedapply@indeed.com>",
			subject: "Indeed Application: Software Engineer",
			snippet: "",
			body: "",
			bodyHtml: [
				'<h1><a href="https://www.indeed.com/viewjob?jk=123">Software Engineer</a></h1>',
				"<strong><a>Acme Corp</a></strong>",
			].join("\n"),
			id: "msg-confirm",
			internalDate: "1700000000000",
		};
		const result = indeedParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.APPLIED);
		expect(result![0].jobTitle).toBe("Software Engineer");
		expect(result![0].company).toBe("Acme Corp");
	});
});
