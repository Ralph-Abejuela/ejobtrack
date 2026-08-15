import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCapture, mockIdentify } = vi.hoisted(() => ({
	mockCapture: vi.fn(),
	mockIdentify: vi.fn(),
}));

vi.mock("posthog-js", () => ({
	posthog: {
		capture: mockCapture,
		identify: mockIdentify,
	},
}));

// Analytics reads VITE_POSTHOG_KEY at module load
vi.stubEnv("VITE_POSTHOG_KEY", "test-key");

import { hashId, capture, identifyUser, analyticsEnabled } from "./analytics";

describe("analytics (white-box)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("is enabled when key present", () => {
		expect(analyticsEnabled).toBe(true);
	});

	it("hashId produces a 64-char hex SHA-256", async () => {
		const hash = await hashId("jane@example.com");
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("hashId is deterministic and differs across inputs", async () => {
		const a = await hashId("jane@example.com");
		const b = await hashId("jane@example.com");
		const c = await hashId("john@example.com");
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it("identifyUser sends hashed email, not raw", async () => {
		await identifyUser("jane@example.com");
		expect(mockIdentify).toHaveBeenCalledTimes(1);
		const [id] = mockIdentify.mock.calls[0];
		expect(id).not.toContain("jane@example.com");
		expect(id).toMatch(/^[0-9a-f]{64}$/);
	});

	it("capture hashes email/user properties", async () => {
		await capture("job_synced", {
			email: "jane@example.com",
			count: 5,
			platform: "linkedin",
		});
		const [, props] = mockCapture.mock.calls[0];
		expect(props.email).toMatch(/^[0-9a-f]{64}$/);
		expect(props.email).not.toContain("jane");
		expect(props.count).toBe(5);
		expect(props.platform).toBe("linkedin");
	});

	it("capture does not hash non-identifying properties", async () => {
		await capture("view", { count: 3 });
		const [, props] = mockCapture.mock.calls[0];
		expect(props.count).toBe(3);
	});
});
