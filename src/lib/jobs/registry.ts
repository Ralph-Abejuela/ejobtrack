import type { JobPlatformParser, JobApplication } from "./types";
import { jobstreetParser } from "./jobstreet";
import { linkedinParser } from "./linkedin";
import { indeedParser } from "./indeed";
import { genericParser, extractEmail } from "./generic";

// ── Global ignore list (senders not tied to any specific platform parser) ──

/**
 * Non-job senders that don't belong to any platform parser.
 * Platform-specific ignores should go in each parser's ignoreAddresses.
 */
const IGNORE_SENDERS = [
	"SEEK Pass Support <support@seekpass.co>",
	"DigitalOcean <team@info.digitalocean.com>",
];

// ── Parser registry ────────────────────────────────────────────────────────

/** Registry of all platform-specific parsers. Add new parsers here. */
const platformParsers: JobPlatformParser[] = [
	jobstreetParser,
	linkedinParser,
	indeedParser,
];

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

// ── Ignore-sender matching ─────────────────────────────────────────────────

// ponytail: ignore entries are static — computed once at module load
const ALL_IGNORE_ENTRIES: (string | RegExp)[] = [
	...IGNORE_SENDERS,
	...platformParsers.flatMap((p) => p.ignoreAddresses ?? []),
	...(genericParser.ignoreAddresses ?? []),
];

/**
 * Check whether a given From header matches any ignore entry.
 *
 * Matching rules per entry:
 *   - RegExp:        test against the full from header
 *   - string with a space: treat as a regex string, test against full from header
 *   - plain string:  extract email address from from, check with includes()
 */
export function isIgnoredSender(from: string): boolean {
	const entries = ALL_IGNORE_ENTRIES;
	const trimmed = from.trim();
	const emailAddr = extractEmail(trimmed);

	return entries.some((entry) => {
		if (entry instanceof RegExp) {
			return entry.test(trimmed);
		}
		if (typeof entry === "string") {
			// Contains a space → full "Name <email>" format → regex test
			if (entry.includes(" ")) {
				try {
					return new RegExp(entry, "i").test(trimmed);
				} catch {
					// ponytail: fallback to exact full-header include if regex fails
					return trimmed.toLowerCase().includes(entry.toLowerCase());
				}
			}
			// Plain string — match against extracted email address via includes
			if (emailAddr) {
				return emailAddr.toLowerCase().includes(entry.toLowerCase());
			}
			// Last resort: match against full header
			return trimmed.toLowerCase().includes(entry.toLowerCase());
		}
		return false;
	});
}

// ── Public email parsing functions ─────────────────────────────────────────

/**
 * Run only platform-specific parsers by known email address.
 * Returns results if a known sender had job data, null otherwise.
 * Does NOT fall through to generic parser — use parseEmail for that.
 */
export function parseEmailPlatform(email: {
	from: string;
	subject: string;
	snippet: string;
	body: string;
	bodyHtml?: string;
	id: string;
	internalDate: string;
}):
	| Omit<
			JobApplication,
			"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
	  >[]
	| null {
	if (isIgnoredSender(email.from)) return null;

	const emailAddr = extractEmail(email.from);
	if (!emailAddr) return null;

	// Try platform-specific parsers only
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

	return null;
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
	bodyHtml?: string;
	id: string;
	internalDate: string;
}):
	| Omit<
			JobApplication,
			"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
	  >[]
	| null {
	if (isIgnoredSender(email.from)) return null;

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
