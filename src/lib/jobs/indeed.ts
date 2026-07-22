import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for Indeed job emails — handles both confirmation and rejection/status-update emails.
 *
 * Confirmation: from indeedapply@indeed.com
 *   Subject: "Indeed Application: {Job Title}"
 *   BodyHtml: job title in <h1><a>, company in <strong><a> after the h1.
 *   Status: APPLIED
 *
 * Status update / rejection: from noreply@indeed.com
 *   Subject: "An update on your application from {Company}"
 *   Body: "Thank you for applying to the {Job Title} position at {Company}"
 *   Status: REJECTED when body contains "not selected" / "moved to the next step"
 */
export const indeedParser: JobPlatformParser = {
	platform: JobPlatform.INDEED,
	fromAddresses: ["indeedapply@indeed.com", "noreply@indeed.com"],

	parse(email) {
		const { subject } = email;

		const rawEmail = email.from.match(/<([^>]+)>/)?.[1] ?? email.from;
		const isFromNoreply = rawEmail.toLowerCase().includes("noreply@indeed.com");

		// ── Confirmation email (indeedapply@indeed.com) ──
		const indeedMatch = subject.match(/^Indeed Application:\s*(.+)/i);
		if (indeedMatch) {
			return parseConfirmation(email, indeedMatch[1].trim());
		}

		// ── Status update / rejection email (noreply@indeed.com) ──
		if (isFromNoreply) {
			return parseStatusUpdate(email);
		}

		return null;
	},
};

/** Parse Indeed application confirmation email (indeedapply@indeed.com). */
function parseConfirmation(
	email: Parameters<JobPlatformParser["parse"]>[0],
	subjectTitle: string,
) {
	const { bodyHtml } = email;

	// ── Extract job title ──
	let jobTitle = "";
	if (bodyHtml) {
		const h1Match = bodyHtml.match(
			/<h1[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h1>/i,
		);
		if (h1Match) {
			jobTitle = h1Match[1].replace(/<[^>]*>/g, "").trim();
		}
	}
	if (!jobTitle) jobTitle = subjectTitle;

	// ── Extract company ──
	let company = "";
	if (bodyHtml) {
		const afterH1 = bodyHtml.split("</h1>")[1];
		if (afterH1) {
			const strongMatch = afterH1.match(
				/<strong[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/strong>/i,
			);
			if (strongMatch) {
				company = strongMatch[1].replace(/<[^>]*>/g, "").trim();
			}
		}
	}
	if (!company) company = "Unknown Company";

	const url = extractIndeedUrl(bodyHtml ?? email.bodyClean ?? email.body);

	return [
		{
			platform: JobPlatform.INDEED,
			jobTitle,
			company,
			status: JobStatus.APPLIED,
			body: email.body,
			snippet: email.snippet,
			subject: email.subject,
			from: email.from,
			url,
			date: new Date(Number(email.internalDate)).toISOString(),
			emailId: email.id,
		},
	];
}

/** Parse Indeed status update / rejection email (noreply@indeed.com). */
function parseStatusUpdate(email: Parameters<JobPlatformParser["parse"]>[0]) {
	const { subject, bodyHtml, bodyClean, body, snippet } = email;

	// Skip non-status-update emails sent from noreply (e.g. irrelevant Indeed mail)
	if (!/update on your application/i.test(subject)) return null;

	const richText = bodyClean ?? body ?? "";

	// ── Extract company from subject: "An update on your application from {Company}" ──
	let company = "";
	const companySubjectMatch = subject.match(/from\s+(.+?)\s*$/i);
	if (companySubjectMatch) {
		company = companySubjectMatch[1].trim();
	}

	// ── Extract job title + company from body: "Thank you for applying to the {Title} position at {Company}" ──
	let jobTitle = "";
	const applyMatch = richText.match(
		/thank you for applying to the (.+?)\s+(?:position|job|role)\s+at\s+(.+?)(?:[.,!\n]|$)/i,
	);
	if (applyMatch) {
		jobTitle = applyMatch[1].trim();
		if (!company) company = applyMatch[2].trim();
	}

	// ── Also try from bodyHtml: <p>Thank you for applying to the {Title} position at {Company}</p> ──
	if (!jobTitle && bodyHtml) {
		const htmlApplyMatch = bodyHtml.match(
			/<p[^>]*>thank you for applying to the (.+?)\s+(?:position|job|role)\s+at\s+(.+?)(?:[.,!<]|$)/i,
		);
		if (htmlApplyMatch) {
			jobTitle = htmlApplyMatch[1].trim();
			if (!company) company = htmlApplyMatch[2].trim();
		}
	}

	// ── Detect status ──
	const allText = `${subject} ${richText} ${snippet}`;
	let status = JobStatus.APPLIED;

	if (
		/not selected|will not be moving forward|not moving forward|regret to inform|unsuccessful|application was not selected/i.test(
			allText,
		)
	) {
		status = JobStatus.REJECTED;
	} else if (
		/interview|schedule a time|phone screen|would like to meet/i.test(allText)
	) {
		status = JobStatus.INTERVIEW;
	}

	if (!company) company = "Unknown Company";
	if (!jobTitle) jobTitle = "Unknown Position";

	const url = extractIndeedUrl(bodyHtml ?? bodyClean ?? body);

	return [
		{
			platform: JobPlatform.INDEED,
			jobTitle,
			company,
			status,
			body: email.body,
			snippet: email.snippet,
			subject: email.subject,
			from: email.from,
			url,
			date: new Date(Number(email.internalDate)).toISOString(),
			emailId: email.id,
		},
	];
}

/** Extract Indeed job posting URL from email body/HTML. */
function extractIndeedUrl(text: string): string {
	// 1. Prefer the `next` query param in the viewjob link (URL-encoded)
	const nextMatch = text.match(/[?&]next=(https?%3A%2F%2F[^&\s"']+)/i);
	if (nextMatch) {
		try {
			return decodeURIComponent(nextMatch[1]);
		} catch {
			// fall through
		}
	}

	// 2. Direct indeed.com/viewjob URL
	const directMatch = text.match(
		/(?:https?:\/\/)?(?:[a-z]+\.)?indeed\.com\/viewjob\?jk=\d+/i,
	);
	if (directMatch) {
		let url = directMatch[0];
		if (!url.startsWith("http")) url = "https://" + url;
		return url;
	}

	return "";
}
