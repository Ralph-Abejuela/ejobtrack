// ── Gmail API client ───────────────────────────────────────────────────────

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
		const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
		const padding = normalized.length % 4;
		const padded = padding ? normalized + "=".repeat(4 - padding) : normalized;
		return atob(padded);
	} catch {
		return "";
	}
}

function extractBody(part: GmailMessagePart): {
	body: string;
	type: "text/plain" | "text/html" | "unknown";
} {
	if (
		part.body?.data &&
		(part.mimeType === "text/plain" || part.mimeType === "text/html")
	) {
		return {
			body: decodeBase64(part.body.data),
			type: part.mimeType === "text/plain" ? "text/plain" : "text/html",
		};
	}
	if (part.parts) {
		for (const p of part.parts) {
			const result = extractBody(p);
			if (result.body && result.type === "text/plain") return result;
		}
		for (const p of part.parts) {
			const result = extractBody(p);
			if (result.body) return result;
		}
	}
	return { body: "", type: "unknown" };
}

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

/** Parse a minimal message into ParsedEmail with empty body. */
export function parseMessageMeta(msg: GmailMessage): ParsedEmail {
	const headers = msg.payload.headers;
	return {
		id: msg.id,
		threadId: msg.threadId,
		subject: getHeader(headers, "Subject"),
		from: getHeader(headers, "From"),
		to: getHeader(headers, "To"),
		date: getHeader(headers, "Date"),
		snippet: msg.snippet,
		body: "",
		bodyType: "unknown",
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

/** List message IDs with pagination. */
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

/** Get a single message (any format). */
export async function getMessage(
	accessToken: string,
	messageId: string,
	format: "full" | "metadata" | "minimal" | "raw" = "full",
	metadataHeaders?: string[],
): Promise<GmailMessage> {
	const params = new URLSearchParams({ format });
	if (metadataHeaders?.length) {
		metadataHeaders.forEach((h) => params.append("metadataHeaders", h));
	}
	const url = `${BASE_URL}/messages/${messageId}?${params.toString()}`;
	const res = await fetch(url, { headers: authHeaders(accessToken) });

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gmail API get failed: ${res.status} — ${err}`);
	}

	return res.json() as Promise<GmailMessage>;
}

/**
 * Fetch messages with metadata only (no body).
 * Uses format=metadata which returns headers + snippet.
 */
export async function fetchMessagesMeta(
	accessToken: string,
	messageIds: string[],
	concurrency = 6,
): Promise<ParsedEmail[]> {
	const results: ParsedEmail[] = [];
	const headerFilter = ["Subject", "From", "To", "Date"];
	for (let i = 0; i < messageIds.length; i += concurrency) {
		const chunk = messageIds.slice(i, i + concurrency);
		const promises = chunk.map((id) =>
			getMessage(accessToken, id, "metadata", headerFilter)
				.then(parseMessageMeta)
				.catch(() => null),
		);
		const chunkResults = await Promise.all(promises);
		results.push(...chunkResults.filter((r): r is ParsedEmail => r !== null));
	}
	return results;
}

/**
 * List + fetch metadata for a page of messages (no body).
 */
export async function fetchEmailsPageMeta(
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
	const emails =
		ids.length > 0 ? await fetchMessagesMeta(accessToken, ids) : [];
	return { emails, nextPageToken: listRes.nextPageToken };
}

/**
 * Fetch the full body for a single message.
 * Returns just the parsed body string.
 */
export async function fetchMessageBody(
	accessToken: string,
	messageId: string,
): Promise<{ body: string; bodyType: "text/plain" | "text/html" | "unknown" }> {
	const msg = await getMessage(accessToken, messageId, "full");
	const { body, type } = extractBody(msg.payload);
	const cleanBody = type === "text/html" ? stripHtml(body) : body;
	return { body: cleanBody, bodyType: type };
}
