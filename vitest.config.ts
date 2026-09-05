import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			include: ["src/lib/**/*.ts", "src/lib/jobs/**/*.ts"],
			exclude: [
				"src/lib/**/*.test.ts",
				"src/lib/jobs/__test__/**",
				"src/lib/jobs/types.ts",
				// Dexie/hook modules need IndexedDB + DOM — not covered in jsdom
				"src/lib/classify-email.ts",
				"src/lib/email-cache.ts",
				"src/lib/jobs-cache.ts",
				"src/lib/jobs-db.ts",
				"src/lib/use-retry-loop.ts",
				"src/lib/use-job-poller.ts",
				"src/lib/use-theme.ts", // 3-line React context hook, provider-render only
			],
			thresholds: {
				statements: 75,
				branches: 55,
				functions: 75,
				lines: 78,
			},
		},
	},
});
