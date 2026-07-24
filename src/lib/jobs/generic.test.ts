import { describe, it, expect } from "vitest";
import { genericParser } from "./generic";

function makeEmail(overrides: Record<string, unknown> = {}) {
	return {
		from: "Greenhouse <notifications@greenhouse.io>",
		subject: "",
		snippet: "",
		body: "",
		bodyClean: "",
		id: "msg789",
		internalDate: "1700000000000",
		...overrides,
	};
}

describe("genericParser", () => {
	it("parses Greenhouse ATS rejection", () => {
		const email = makeEmail({
			from: "Greenhouse <notifications@greenhouse.io>",
			subject: "Application status update from Acme Corp",
			body: "Thank you for your interest in the Software Engineer position at Acme Corp. After careful consideration, we have decided to pursue other candidates.",
		});

		const result = genericParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].jobTitle).toBeTruthy();
		expect(result![0].company).toBeTruthy();
	});

	it("parses Lever ATS application confirmation", () => {
		const email = makeEmail({
			from: "Lever <notifications@lever.co>",
			subject: "Thank you for applying to Frontend Developer at Acme Corp",
			body: "Thank you for your interest in the Frontend Developer position at Acme Corp. We have received your application.",
		});

		const result = genericParser.parse(email);
		expect(result).not.toBeNull();
		expect(result![0].jobTitle).toBeTruthy();
		expect(result![0].company).toBeTruthy();
	});

	it("returns null for non-job email (newsletter)", () => {
		const email = makeEmail({
			from: "Newsletter <newsletter@example.com>",
			subject: "Your weekly tech roundup",
			body: "Here are this week's top tech stories.",
		});

		const result = genericParser.parse(email);
		expect(result).toBeNull();
	});

	it("returns null for shipping notification", () => {
		const email = makeEmail({
			from: "Shop <orders@shop.example.com>",
			subject: "Your package has shipped",
			body: "Your order has been shipped and will arrive soon.",
		});

		const result = genericParser.parse(email);
		expect(result).toBeNull();
	});
});
