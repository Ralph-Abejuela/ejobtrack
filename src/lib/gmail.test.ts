import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	parseMessage,
	listMessages,
	getMessage,
	RateLimitError,
	type GmailMessage,
} from "./gmail";

/** UTF-8-safe base64 (btoa chokes on non-Latin1). */
function b64(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function makeMessage(overrides: Partial<GmailMessage> = {}): GmailMessage {
	return {
		id: "msg1",
		threadId: "thread1",
		labelIds: ["INBOX"],
		snippet: "Your application was sent",
		internalDate: "1767247200000",
		sizeEstimate: 1000,
		payload: {
			mimeType: "text/plain",
			filename: "",
			headers: [
				{ name: "Subject", value: "Your application to Acme" },
				{ name: "From", value: "Acme <jobs@acme.com>" },
				{ name: "To", value: "Jane <jane@example.com>" },
				{ name: "Date", value: "Wed, 01 Jan 2026 10:00:00 +0000" },
			],
			body: { size: 0 },
		},
		...overrides,
	};
}

function mockFetchResponse(
	status: number,
	body: unknown,
	headers?: Record<string, string>,
): void {
	const res = {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get: (name: string) => headers?.[name] ?? null,
		},
		json: async () => body,
		text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
	};
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

const TOKEN = "test-token";

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("listMessages (white-box: happy path + pagination)", () => {
	it("builds query params and returns messages + nextPageToken", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({
				messages: [{ id: "m1", threadId: "t1" }],
				nextPageToken: "tok123",
				resultSizeEstimate: 50,
			}),
			text: async () => "",
		});

		const res = await listMessages(TOKEN, { maxResults: 25 });

		expect(res.messages).toEqual([{ id: "m1", threadId: "t1" }]);
		expect(res.nextPageToken).toBe("tok123");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("maxResults=25");
		expect(url).toContain("users/me/messages");
	});

	it("passes pageToken, q, and labelIds through to the API", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({ messages: [], nextPageToken: null }),
			text: async () => "",
		});

		await listMessages(TOKEN, {
			pageToken: "tok9",
			q: "after:2026/01/01",
			labelIds: ["INBOX"],
		});

		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("pageToken=tok9");
		expect(url).toContain("q=after%3A2026%2F01%2F01");
		expect(url).toContain("labelIds=INBOX");
	});

	it("sets Bearer auth header", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({ messages: [] }),
			text: async () => "",
		});

		await listMessages(TOKEN, {});

		const opts = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = opts.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("returns empty messages array when API omits it", async () => {
		mockFetchResponse(200, {});
		const res = await listMessages(TOKEN, {});
		expect(res.messages).toEqual([]);
		expect(res.nextPageToken).toBeNull();
	});
});

describe("listMessages (white-box: error paths)", () => {
	it("throws RateLimitError on 429 with Retry-After header", async () => {
		mockFetchResponse(429, "rate limited", { "Retry-After": "120" });

		await expect(listMessages(TOKEN, {})).rejects.toThrow(RateLimitError);
		await expect(listMessages(TOKEN, {})).rejects.toMatchObject({
			retryAfter: "120",
		});
	});

	it("throws generic Error on non-OK status", async () => {
		mockFetchResponse(500, "boom");

		await expect(listMessages(TOKEN, {})).rejects.toThrow(
			"Gmail API list failed",
		);
	});

	it("retries once with new token on 401 when onUnauthorized provided", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				headers: { get: () => null },
				json: async () => ({}),
				text: async () => "unauthorized",
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () => ({ messages: [{ id: "m1" }] }),
				text: async () => "",
			});

		const onUnauthorized = vi.fn().mockResolvedValue("new-token");
		const res = await listMessages(TOKEN, { onUnauthorized });

		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(res.messages).toHaveLength(1);
		// Second call must use the refreshed token
		const secondCallHeaders = fetchMock.mock.calls[1][1].headers as Record<
			string,
			string
		>;
		expect(secondCallHeaders.Authorization).toBe("Bearer new-token");
	});

	it("does NOT retry on 401 when no onUnauthorized provided", async () => {
		mockFetchResponse(401, "unauthorized");

		await expect(listMessages(TOKEN, {})).rejects.toThrow(
			"Gmail API list failed: 401",
		);
	});
});

describe("getMessage (white-box)", () => {
	it("requests format=full by default and returns parsed JSON", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({ id: "m1", snippet: "hi" }),
			text: async () => "",
		});

		const msg = await getMessage(TOKEN, "m1");
		expect(msg.id).toBe("m1");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/messages/m1");
		expect(url).toContain("format=full");
	});

	it("requests format=minimal when asked", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({ id: "m1" }),
			text: async () => "",
		});

		await getMessage(TOKEN, "m1", "minimal");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("format=minimal");
	});

	it("passes metadataHeaders when provided", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => ({ id: "m1" }),
			text: async () => "",
		});

		await getMessage(TOKEN, "m1", "metadata", ["Subject", "From"]);
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("metadataHeaders=Subject");
		expect(url).toContain("metadataHeaders=From");
	});

	it("throws RateLimitError on 429", async () => {
		mockFetchResponse(429, "slow down", { "Retry-After": "60" });
		await expect(getMessage(TOKEN, "m1")).rejects.toThrow(RateLimitError);
	});

	it("throws generic Error on non-OK", async () => {
		mockFetchResponse(403, "forbidden");
		await expect(getMessage(TOKEN, "m1")).rejects.toThrow(
			"Gmail API get failed: 403",
		);
	});

	it("retries with refreshed token on 401", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				headers: { get: () => null },
				json: async () => ({}),
				text: async () => "unauthorized",
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () => ({ id: "m1" }),
				text: async () => "",
			});

		const onUnauthorized = vi.fn().mockResolvedValue("fresh");
		await getMessage(TOKEN, "m1", "full", undefined, onUnauthorized);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const secondHeaders = fetchMock.mock.calls[1][1].headers as Record<
			string,
			string
		>;
		expect(secondHeaders.Authorization).toBe("Bearer fresh");
	});
});

describe("parseMessage (unit)", () => {
	it("extracts headers and metadata", () => {
		const email = parseMessage(makeMessage());

		expect(email.id).toBe("msg1");
		expect(email.subject).toBe("Your application to Acme");
		expect(email.from).toBe("Acme <jobs@acme.com>");
		expect(email.to).toBe("Jane <jane@example.com>");
		expect(email.date).toBe("Wed, 01 Jan 2026 10:00:00 +0000");
		expect(email.labelIds).toEqual(["INBOX"]);
		expect(email.internalDate).toBe("1767247200000");
	});

	it("decodes base64 text/plain body", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [{ name: "Subject", value: "x" }],
					body: { size: 10, data: b64("Your application was sent to Acme") },
				},
			}),
		);
		expect(email.body).toContain("sent to Acme");
		expect(email.bodyType).toBe("text/plain");
	});

	it("decodes UTF-8 base64 correctly (not latin1-mangled)", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [{ name: "Subject", value: "x" }],
					body: { size: 10, data: b64("Café — 東京 branch") },
				},
			}),
		);
		expect(email.body).toBe("Café — 東京 branch");
	});

	it("extracts bodyClean from HTML payload via html-to-text", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/html",
					filename: "",
					headers: [{ name: "Subject", value: "x" }],
					body: {
						size: 10,
						data: b64("<p>YOUR APPLICATION WAS SENT TO <b>ACME</b></p>"),
					},
				},
			}),
		);
		expect(email.bodyClean).toMatch(/APPLICATION WAS SENT TO ACME/i);
		expect(email.bodyType).toBe("text/html");
	});

	it("walks nested multipart parts to find text bodies", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "multipart/alternative",
					filename: "",
					headers: [{ name: "Subject", value: "x" }],
					body: { size: 0 },
					parts: [
						{
							mimeType: "text/plain",
							filename: "",
							headers: [],
							body: { size: 10, data: b64("plain body here") },
						},
						{
							mimeType: "text/html",
							filename: "",
							headers: [],
							body: { size: 10, data: b64("<p>html body here</p>") },
						},
					],
				},
			}),
		);
		// Prefers rich HTML content
		expect(email.body).toContain("html body here");
		expect(email.bodyClean).toContain("html body here");
	});

	it("returns empty body for unknown mime types", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "application/pdf",
					filename: "resume.pdf",
					headers: [{ name: "Subject", value: "x" }],
					body: { size: 999 },
				},
			}),
		);
		expect(email.body).toBe("");
		expect(email.bodyType).toBe("unknown");
	});
});

describe("parseMessage (robustness)", () => {
	it("does not crash on malformed base64", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [{ name: "Subject", value: "x" }],
					body: { size: 10, data: "%%%not-base64%%%" },
				},
			}),
		);
		expect(email.body).toBe("");
	});

	it("returns empty strings for missing headers", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [],
					body: { size: 0 },
				},
			}),
		);
		expect(email.subject).toBe("");
		expect(email.from).toBe("");
		expect(email.to).toBe("");
		expect(email.date).toBe("");
	});

	it("handles case-insensitive header names", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [{ name: "SUBJECT", value: "Uppercase name" }],
					body: { size: 0 },
				},
			}),
		);
		expect(email.subject).toBe("Uppercase name");
	});

	it("does not crash on missing payload.body.data", () => {
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [],
					body: { size: 0 },
				},
			}),
		);
		expect(email.body).toBe("");
	});

	it("does not crash on URL-safe base64 (- and _)", () => {
		// URL-safe variant of "a+b/c" → "a-b_c" padding stripped
		const email = parseMessage(
			makeMessage({
				payload: {
					mimeType: "text/plain",
					filename: "",
					headers: [],
					body: { size: 10, data: "YS1iX2M" },
				},
			}),
		);
		expect(email.body).toBe("a-b_c");
	});
});
