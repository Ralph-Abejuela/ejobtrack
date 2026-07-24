import { describe, it, expect } from "vitest";
import { linkedinParser } from "./linkedin";
import { JobStatus } from "./types";
import linkApplyData from "./__test__/linkedin.apply.scrubbed.json";
import linkRejectData from "./__test__/linkedin.reject.scrubbed.json";
import linkIgnoreData from "./__test__/linkedin.ignore.scrubbed.json";

describe("linkedinParser", () => {
	it.each(linkApplyData)("parses application sent [%#]: $subject", (email) => {
		const result = linkedinParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.APPLIED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it.each(linkRejectData)("parses rejection [%#]: $subject", (email) => {
		const result = linkedinParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.REJECTED);
		expect(result![0].company).toBeTruthy();
		expect(result![0].jobTitle).toBeTruthy();
	});

	it.each(linkIgnoreData)("returns null for [%#]: $subject", (email) => {
		const result = linkedinParser.parse(email);
		expect(result).toBeNull();
	});

	it("parses application viewed email", () => {
		const email = {
			from: "LinkedIn <jobs-noreply@linkedin.com>",
			subject: "Your application was viewed by Google",
			snippet: "",
			body: "",
			bodyClean: "",
			id: "msg-view",
			internalDate: "1700000000000",
		};
		const result = linkedinParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.VIEWED);
		expect(result![0].company).toBe("google");
	});

	it("parses resume downloaded email", () => {
		const email = {
			from: "LinkedIn <jobs-noreply@linkedin.com>",
			subject: "Your resume was downloaded by Spotify",
			snippet: "",
			body: "",
			id: "msg-dl",
			internalDate: "1700000000000",
		};
		const result = linkedinParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.VIEWED);
		expect(result![0].company).toBe("spotify");
	});

	it("ignores People You May Know pattern", () => {
		const email = {
			from: "LinkedIn <jobs-noreply@linkedin.com>",
			subject: "People you may know on LinkedIn",
			snippet: "Connect with professionals you may know",
			body: "",
			id: "msg-ignore-pat",
			internalDate: "1700000000000",
		};
		const result = linkedinParser.parse(email);
		expect(result).toBeNull();
	});

	it("parses interview from body signal", () => {
		const email = {
			from: "LinkedIn <jobs-noreply@linkedin.com>",
			subject: "Your application to Software Engineer at Meta",
			snippet: "would like to meet",
			body: "We would like to meet with you to discuss the position.",
			id: "msg-int",
			internalDate: "1700000000000",
		};
		const result = linkedinParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].status).toBe(JobStatus.INTERVIEW);
		expect(result![0].company).toBe("meta");
	});
});
