import { describe, it, expect } from "vitest";
import { jobstreetParser } from "./jobstreet";
import { JobStatus } from "./types";
import jsApplyData from "./__test__/jobstreet.apply.scrubbed.json";
import jsRejectData from "./__test__/jobstreet.reject.scrubbed.json";
import jsViewData from "./__test__/jobstreet.view.scrubbed.json";
import jsIgnoreData from "./__test__/jobstreet.ignore.scrubbed.json";
import jsBulkData from "./__test__/jobstreet.bulk-process.scrubbed.json";

describe("jobstreetParser", () => {
	it.each(
		jsApplyData,
	)("parses application submitted [%#]: $subject", (email) => {
		const result = jobstreetParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.APPLIED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it.each(jsRejectData)("parses rejection [%#]: $subject", (email) => {
		const result = jobstreetParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.REJECTED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it.each(jsViewData)("parses viewed [%#]: $subject", (email) => {
		const result = jobstreetParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.VIEWED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it.each(jsIgnoreData)("returns null for [%#]: $subject", (email) => {
		const result = jobstreetParser.parse(email);
		expect(result).toBeNull();
	});

	it.each(jsBulkData)("parses bulk activity [%#]: $subject", (email) => {
		const result = jobstreetParser.parse(email);
		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(2);
		expect(result![0].status).toBe(JobStatus.VIEWED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
		const last = result![result!.length - 1];
		expect(last.status).toBe(JobStatus.REJECTED);
	});

	it("ignores non-job patterns like application started", () => {
		const email = {
			from: "Jobstreet <noreply@e.jobstreet.com>",
			subject: "Don't forget to submit your application",
			snippet: "Complete the application you have started",
			body: "",
			id: "msg-ignore-pat",
			internalDate: "1700000000000",
		};
		const result = jobstreetParser.parse(email);
		expect(result).toBeNull();
	});
});
