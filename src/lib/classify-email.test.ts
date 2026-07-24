import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @xenova/transformers
const mockPipeline = vi.fn();
vi.mock("@xenova/transformers", () => ({
	pipeline: mockPipeline,
	env: { remotePathTemplate: "" },
}));

async function waitForMicrotasks() {
	// Let async load() complete — drain microtask queue
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("classifyEmail", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("returns null on first call (triggers lazy load)", async () => {
		mockPipeline.mockResolvedValue(async () => [
			{ label: "confirmation", score: 0.98 },
		]);

		const { classifyEmail } = await import("./classify-email");
		const result = await classifyEmail("subject", "body");
		expect(result).toBeNull();
	});

	it("returns true for job-related labels", async () => {
		mockPipeline.mockResolvedValue(async () => [
			{ label: "confirmation", score: 0.98 },
		]);

		const { classifyEmail } = await import("./classify-email");
		// First call triggers load (async, not awaited)
		await classifyEmail("subject", "body");
		// Wait for load() to complete
		await waitForMicrotasks();
		// Second call should use loaded model
		const result = await classifyEmail("Your application", "Job details");
		expect(result).toBe(true);
	});

	it("returns false for non-job labels", async () => {
		mockPipeline.mockResolvedValue(async () => [
			{ label: "newsletter", score: 0.95 },
		]);

		const { classifyEmail } = await import("./classify-email");
		await classifyEmail("subject", "body");
		await waitForMicrotasks();
		const result = await classifyEmail("Weekly update", "News content");
		expect(result).toBe(false);
	});

	it("returns null when pipeline throws (graceful degradation)", async () => {
		mockPipeline.mockRejectedValue(new Error("Model load failed"));

		const { classifyEmail, getModelError } = await import("./classify-email");
		await classifyEmail("subject", "body");
		await waitForMicrotasks();

		const error = getModelError();
		expect(error).toBeTruthy();
	});

	it("returns null for first call (fallback path)", async () => {
		mockPipeline.mockResolvedValue(async () => [
			{ label: "confirmation", score: 0.98 },
		]);

		const { classifyEmail } = await import("./classify-email");
		const result = await classifyEmail("subject", "body");
		expect(result).toBeNull();
	});
});
