import type { JobPlatformParser, JobApplication } from "./types";
import { jobstreetParser } from "./jobstreet";
import { linkedinParser } from "./linkedin";
import { genericParser, extractEmail } from "./generic";

/** Registry of all platform-specific parsers. Add new parsers here. */
const platformParsers: JobPlatformParser[] = [jobstreetParser, linkedinParser];

/** Map from email from-address to the matching parser. */
const fromMap = new Map<string, JobPlatformParser>();
for (const p of platformParsers) {
	for (const addr of p.fromAddresses) {
		fromMap.set(addr.toLowerCase(), p);
	}
}

/** Find a platform-specific parser by email address. */
function findPlatformParser(emailAddr: string): JobPlatformParser | undefined {
	return fromMap.get(emailAddr.toLowerCase());
}

/**
 * Run platform-specific parsers first, then fall back to generic parser.
 * Returns the first match or null.
 */
export function parseEmail(email: {
	from: string;
	subject: string;
	snippet: string;
	body: string;
	id: string;
	internalDate: string;
}):
	| Omit<
			JobApplication,
			"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
	  >[]
	| null {
	const emailAddr = extractEmail(email.from);
	if (!emailAddr) return null;

	// 1. Try platform-specific parsers
	const platformParser = findPlatformParser(emailAddr);
	if (platformParser) {
		// Check ignore patterns before parsing
		const ignoreText = `${email.subject} ${email.snippet}`;
		if (platformParser.ignorePatterns?.some((p) => p.test(ignoreText))) {
			return null;
		}
		const result = platformParser.parse(email);
		if (result && result.length > 0) return result;
	}

	// 2. Fall back to generic parser
	const result = genericParser.parse(email);
	if (result && result.length > 0) return result;
	return null;
}

export { platformParsers as parsers };
