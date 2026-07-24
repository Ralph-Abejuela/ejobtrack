/**
 * One-time scrubber for test data JSON files.
 * Walks parsed JSON values, strips personal info + all URLs.
 *
 * Run: npx tsx scripts/scrub-test-data.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, "..", "src", "lib", "jobs", "__test__");

const files = readdirSync(TEST_DIR).filter(
	(f) => f.endsWith(".json") && !f.includes(".scrubbed."),
);

let urlCount = 0;

for (const file of files) {
	const srcPath = join(TEST_DIR, file);
	const raw = readFileSync(srcPath, "utf8");

	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (e) {
		console.error(`PARSE ERROR ${file}: ${e}`);
		continue;
	}

	function walk(v: unknown): unknown {
		if (typeof v === "string") {
			let s = v;
			// Personal info — case-insensitive
			s = s.replace(/Ralph|ralph/gi, "Jane");
			s = s.replace(/Luis|luis/gi, "Doe");
			s = s.replace(/Abejuela|abejuela/gi, "Doe");
			s = s.replace(/balatucan/gi, "example");
			// All URLs → sequential example.com/N
			s = s.replace(/https?:\/\/[^\s"')\]}]+/g, () => {
				urlCount++;
				return `https://example.com/${urlCount}`;
			});
			return s;
		}
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === "object") {
			const o: Record<string, unknown> = {};
			for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
				o[k] = walk(val);
			}
			return o;
		}
		return v;
	}

	data = walk(data);

	const outName = file.replace(".json", ".scrubbed.json");
	writeFileSync(join(TEST_DIR, outName), JSON.stringify(data, null, 2), "utf8");
	console.log(`${file} → ${outName}`);
}

console.log(`\nTotal URLs replaced: ${urlCount}`);
