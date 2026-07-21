// ── Gmail API client ───────────────────────────────────────────────────────
// Uses OAuth access token from AuthContext for authenticated REST calls.

const BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GmailMessageListItem {
	id: string;
	threadId: string;
}

export interface GmailMessageHeader {
	name: string;
	value: string;
}

export interface GmailMessagePart {
	mimeType: string;
	filename: string;
	headers: GmailMessageHeader[];
	body: { size: number; data?: string; attachmentId?: string };
	parts?: GmailMessagePart[];
}

export interface GmailMessage {
	id: string;
	threadId: string;
	labelIds: string[];
	snippet: string;
	payload: GmailMessagePart;
	internalDate: string;
	sizeEstimate: number;
}

export interface GmailListResponse {
	messages: GmailMessageListItem[];
	nextPageToken: string | null;
	resultSizeEstimate: number;
}

export interface ParsedEmail {
	id: string;
	threadId: string;
	subject: string;
	from: string;
	to: string;
	date: string;
	snippet: string;
	body: string;
	bodyType: "text/plain" | "text/html" | "unknown";
	labelIds: string[];
	internalDate: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getHeader(headers: GmailMessageHeader[], name: string): string {
	return (
		headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
		""
	);
}

function decodeBase64(data: string): string {
	try {
		// Gmail uses URL-safe base64
		const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
		const padding = normalized.length % 4;
		const padded = padding ? normalized + "=".repeat(4 - padding) : normalized;
		return atob(padded);
	} catch {
		return "";
	}
}

/** Recursively extract text/plain body from message parts. */
function extractBody(part: GmailMessagePart): {
	body: string;
	type: "text/plain" | "text/html" | "unknown";
} {
	// Direct body
	if (
		part.body?.data &&
		(part.mimeType === "text/plain" || part.mimeType === "text/html")
	) {
		return {
			body: decodeBase64(part.body.data),
			type: part.mimeType === "text/plain" ? "text/plain" : "text/html",
		};
	}

	// Multipart: search parts recursively
	if (part.parts) {
		// Prefer text/plain
		for (const p of part.parts) {
			const result = extractBody(p);
			if (result.body && result.type === "text/plain") return result;
		}
		// Fallback to text/html
		for (const p of part.parts) {
			const result = extractBody(p);
			if (result.body) return result;
		}
	}

	return { body: "", type: "unknown" };
}

/** Strip HTML tags for a clean plain-text view (basic). */
function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<\/div>/gi, "\n")
		.replace(/<\/tr>/gi, "\n")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Parse a full Gmail message into a usable email object. */
export function parseMessage(msg: GmailMessage): ParsedEmail {
	const headers = msg.payload.headers;
	const { body, type } = extractBody(msg.payload);
	const cleanBody = type === "text/html" ? stripHtml(body) : body;

	return {
		id: msg.id,
		threadId: msg.threadId,
		subject: getHeader(headers, "Subject"),
		from: getHeader(headers, "From"),
		to: getHeader(headers, "To"),
		date: getHeader(headers, "Date"),
		snippet: msg.snippet,
		body: cleanBody,
		bodyType: type,
		labelIds: msg.labelIds,
		internalDate: msg.internalDate,
	};
}

// ── API calls ──────────────────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
	return {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
	};
}

/**
 * List messages with pagination.
 * @param accessToken - OAuth access token
 * @param opts - Optional filters and pagination
 * @returns Messages list with nextPageToken
 */
export async function listMessages(
	accessToken: string,
	opts: {
		maxResults?: number;
		pageToken?: string | null;
		q?: string;
		labelIds?: string[];
	} = {},
): Promise<GmailListResponse> {
	const params = new URLSearchParams();
	if (opts.maxResults) params.set("maxResults", String(opts.maxResults));
	if (opts.pageToken) params.set("pageToken", opts.pageToken);
	if (opts.q) params.set("q", opts.q);
	if (opts.labelIds?.length) {
		opts.labelIds.forEach((id) => params.append("labelIds", id));
	}

	const url = `${BASE_URL}/messages?${params.toString()}`;
	const res = await fetch(url, { headers: authHeaders(accessToken) });

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gmail API list failed: ${res.status} — ${err}`);
	}

	const data = await res.json();
	return {
		messages: data.messages ?? [],
		nextPageToken: data.nextPageToken ?? null,
		resultSizeEstimate: data.resultSizeEstimate ?? 0,
	};
}

/**
 * Get full message details including body.
 * format=full returns the complete RFC 2822 message.
 */
export async function getMessage(
	accessToken: string,
	messageId: string,
	format: "full" | "metadata" | "minimal" | "raw" = "full",
): Promise<GmailMessage> {
	const url = `${BASE_URL}/messages/${messageId}?format=${format}`;
	const res = await fetch(url, { headers: authHeaders(accessToken) });

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gmail API get failed: ${res.status} — ${err}`);
	}

	return res.json() as Promise<GmailMessage>;
}

/**
 * Batch-fetch full message details for a list of message IDs.
 * Runs up to `concurrency` requests in parallel.
 */
export async function getMessages(
	accessToken: string,
	messageIds: string[],
	concurrency = 6,
): Promise<ParsedEmail[]> {
	const results: ParsedEmail[] = [];

	// Process in chunks for controlled concurrency
	for (let i = 0; i < messageIds.length; i += concurrency) {
		const chunk = messageIds.slice(i, i + concurrency);
		const promises = chunk.map((id) =>
			getMessage(accessToken, id)
				.then(parseMessage)
				.catch((err) => {
					console.error(`Failed to fetch message ${id}:`, err);
					return null as ParsedEmail | null;
				}),
		);
		const chunkResults = await Promise.all(promises);
		results.push(...chunkResults.filter((r): r is ParsedEmail => r !== null));
	}

	return results;
}

/**
 * One-shot: list + fetch all messages for a given page.
 * @returns Parsed emails plus nextPageToken for pagination.
 */
export async function fetchEmailsPage(
	accessToken: string,
	opts: {
		maxResults?: number;
		pageToken?: string | null;
		q?: string;
		labelIds?: string[];
	} = {},
): Promise<{ emails: ParsedEmail[]; nextPageToken: string | null }> {
	const listRes = await listMessages(accessToken, opts);
	const ids = listRes.messages.map((m) => m.id);
	const emails = ids.length > 0 ? await getMessages(accessToken, ids) : [];
	return { emails, nextPageToken: listRes.nextPageToken };
}
