// ── Job Application types ──────────────────────────────────────────────────

export const JobStatus = {
	APPLIED: "applied",
	VIEWED: "viewed",
	INTERVIEW: "interview",
	OFFER: "offer",
	REJECTED: "rejected",
	UNKNOWN: "unknown",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobPlatform = {
	JOBSTREET: "jobstreet",
	LINKEDIN: "linkedin",
	INDEED: "indeed",
} as const;

export type JobPlatform = (typeof JobPlatform)[keyof typeof JobPlatform];

export interface JobStatusChange {
	status: JobStatus;
	date: string; // ISO date string
	emailId: string;
}

export interface JobApplication {
	/** Unique id: `${userEmail}:${platform}:${normalisedCompany}:${normalisedJobTitle}` */
	id: string;
	/** The Google account that owns this data */
	userEmail: string;
	/** Known platforms: JobPlatform enum values. Generic matches: sender email domain. */
	platform: string;
	jobTitle: string;
	company: string;
	status: JobStatus;
	/** Full email body (cached after first fetch) */
	body: string;
	snippet: string;
	/** Email subject */
	subject: string;
	/** Email from address */
	from: string;
	/** Job posting URL extracted from email body */
	url: string;
	/** ISO date string of latest email */
	date: string;
	/** Email message id (latest email) */
	emailId: string;
	/** Soft-deleted — hidden from the UI but still in DB */
	deleted?: boolean;
	/** When first detected (epoch ms) */
	createdAt: number;
	/** When last updated (epoch ms) */
	updatedAt: number;
	/** History of status changes */
	history: JobStatusChange[];
}

// ── Parser interface ──────────────────────────────────────────────────────

export interface JobPlatformParser {
	/** Unique platform key */
	platform: string;
	/** Email addresses this parser handles */
	fromAddresses: string[];
	/**
	 * Subject/snippet patterns that indicate non-job emails to skip entirely.
	 * If any match, the email is ignored (no fallback to generic parser).
	 */
	ignorePatterns?: RegExp[];
	/**
	 * Parse a full email body + snippet into one or more JobApplication records.
	 * Return null if this email isn't a job application update.
	 * Return an array for bulk emails (e.g. weekly activity summaries with multiple jobs).
	 */
	parse(email: {
		from: string;
		subject: string;
		snippet: string;
		body: string;
		bodyHtml?: string;
		/** html-to-text of bodyHtml — rich content even for emails with text/plain */
		bodyClean?: string;
		id: string;
		internalDate: string;
	}):
		| Omit<
				JobApplication,
				"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
		  >[]
		| null;
}
