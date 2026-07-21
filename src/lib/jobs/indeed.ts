import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for Indeed job application confirmation emails (noreply@indeedapply.com).
 *
 * Indeed's text/plain is generic ("Your application has been submitted.")
 * while text/html has the actual job details. Falls back to bodyHtml when
 * the plain body lacks job-specific content.
 *
 * Status: "Application submitted" → APPLIED
 */
export const indeedParser: JobPlatformParser = {
	platform: JobPlatform.INDEED,
	fromAddresses: ["noreply@indeedapply.com"],

	parse(email) {
		const { subject, body, bodyHtml } = email;

		const lowerSubject = subject.toLowerCase();

		// Confirm it's an Indeed application email
		if (
			!/application (?:has been submitted|submitted|was sent|was submitted|received|confirmation)/i.test(
				lowerSubject,
			)
		) {
			return null;
		}

		// ── Extract job title ──
		const jobTitle = extractTitle(body, bodyHtml, lowerSubject);

		if (!jobTitle) return null;

		// ── Extract company ──
		let company = extractCompany(body, bodyHtml, lowerSubject, email.from);
		if (!company) company = "Unknown Company";

		// ── Extract URL ──
		const url = extractIndeedUrl(body + (bodyHtml ?? ""));

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
	},
};

function extractTitle(
	body: string,
	bodyHtml: string | undefined,
	lowerSubject: string,
): string {
	// 1. Try bodyHtml <h1><a>...</a></h1>
	if (bodyHtml) {
		const h1Match = bodyHtml.match(
			/<h1[^>]*>.*?<a[^>]*>([\s\S]*?)<\/a>.*?<\/h1>/i,
		);
		if (h1Match) {
			const title = h1Match[1].replace(/<[^>]*>/g, "").trim();
			if (title && title.length > 2) return title;
		}
	}

	// 2. Try subject: "Your application to {Title} at {Company}"
	const subjMatch = lowerSubject.match(
		/your application (?:for|to) (.+?)(?:\s+at\s+|has|\s*$)/i,
	);
	if (subjMatch) {
		const title = subjMatch[1].trim();
		if (title.length > 2) return title;
	}

	// 3. Try bodyHtml <h1> content (non-linked)
	if (bodyHtml) {
		const h1Text = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
		if (h1Text) {
			const title = h1Text[1].replace(/<[^>]*>/g, "").trim();
			if (title && title.length > 2) return title;
		}
	}

	// 4. Try plain body: line after "Application submitted"
	const lines = body
		.split(/\n+/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const submittedIdx = lines.findIndex((l) =>
		/application\s+(?:submitted|sent|received)/i.test(l),
	);
	if (submittedIdx >= 0 && submittedIdx + 1 < lines.length) {
		const candidate = lines[submittedIdx + 1];
		// Filter out footer-like candidates
		if (candidate.length > 2 && !candidate.includes("Indeed")) {
			return candidate;
		}
	}

	// 5. Generic body pattern
	const bodyMatch = body.match(
		/your application (?:for|to) (.+?)(?:\s+(?:at|with)\s+|has|\.|$)/i,
	);
	if (bodyMatch) {
		const title = bodyMatch[1].trim();
		if (title.length > 2) return title;
	}

	return "";
}

function extractCompany(
	body: string,
	bodyHtml: string | undefined,
	lowerSubject: string,
	from: string,
): string {
	// 1. Try bodyHtml <strong> tag (Indeed puts company in <strong>)
	if (bodyHtml) {
		const strongMatch = bodyHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
		if (strongMatch) {
			const company = strongMatch[1].replace(/<[^>]*>/g, "").trim();
			if (company && company.length > 1 && company.length < 80) return company;
		}
	}

	// 2. Try subject: "at {Company}"
	const atSubj = lowerSubject.match(/at\s+(.+?)(?:\s*$|has)/i);
	if (atSubj) {
		const company = atSubj[1].trim();
		if (company.length > 1 && company.length < 80) return company;
	}

	// 3. Try body: line after job title / "at {Company}"
	const atBody = body.match(
		/your application (?:for|to) .+?\s+at\s+(.+?)(?:\.|\s*$|has)/i,
	);
	if (atBody) {
		const company = atBody[1].trim();
		if (company.length > 1 && company.length < 80) return company;
	}

	// 4. Try sender display name
	const fromDisplay = from.match(/^([^<]+)</);
	if (fromDisplay) {
		const name = fromDisplay[1].trim();
		if (name.length > 2 && name.length < 60) return name;
	}

	return "";
}

/** Extract Indeed job posting URL from email body/HTML. */
function extractIndeedUrl(text: string): string {
	const match = text.match(
		/(?:https?:\/\/)?(?:[a-z]+\.)?indeed\.com\/viewjob\?jk=\d+/i,
	);
	if (match) {
		let url = match[0];
		if (!url.startsWith("http")) url = "https://" + url;
		return url;
	}
	return "";
}
