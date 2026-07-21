import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { fetchEmailsPage, type ParsedEmail } from "@/lib/gmail";
import {
	Mail,
	MailOpen,
	ChevronDown,
	ChevronUp,
	Loader2,
	AlertCircle,
} from "lucide-react";

const PAGE_SIZE = 50;

export default function GmailReader() {
	const { user, accessToken, requestingScope, requestGmailScope } = useAuth();

	const [emails, setEmails] = useState<ParsedEmail[]>([]);
	const [nextPageToken, setNextPageToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [hasLoaded, setHasLoaded] = useState(false);

	// --- Load initial page ---
	const loadEmails = useCallback(
		async (pageToken?: string | null) => {
			const token = accessToken;
			if (!token || !user) return;

			const isMore = !!pageToken;
			if (isMore) setLoadingMore(true);
			else setLoading(true);

			setError(null);

			try {
				const { emails: newEmails, nextPageToken: nextToken } =
					await fetchEmailsPage(token, {
						maxResults: PAGE_SIZE,
						pageToken,
					});
				setEmails((prev) => (isMore ? [...prev, ...newEmails] : newEmails));
				setNextPageToken(nextToken);
				if (!isMore) setHasLoaded(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load emails");
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[accessToken, user],
	);

	// --- Grant Gmail scope on first access ---
	const handleGrantAccess = useCallback(async () => {
		setError(null);
		const token = await requestGmailScope();
		if (!token) {
			setError("Gmail access denied — consent required to read emails.");
			return;
		}
		// Token was set in auth context, component will re-render with accessToken
		// Need to wait for state to settle, then load
		await loadEmails();
	}, [requestGmailScope, loadEmails]);

	// --- Load more (next page) ---
	const handleLoadMore = useCallback(() => {
		if (nextPageToken && !loadingMore) {
			loadEmails(nextPageToken);
		}
	}, [nextPageToken, loadingMore, loadEmails]);

	// --- Toggle body expand ---
	const toggleExpand = useCallback((id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	}, []);

	// === Not authed ===
	if (!user) return null;

	// === Authed but no Gmail scope yet ===
	if (!accessToken) {
		return (
			<div className="mt-8 space-y-4">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Mail className="size-5" /> Gmail Inbox
				</h2>
				<p className="text-muted-foreground text-sm">
					Grant read-only access to your Gmail to view and process emails.
				</p>
				<button
					onClick={handleGrantAccess}
					disabled={requestingScope}
					className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{requestingScope && <Loader2 className="size-4 animate-spin" />}
					Connect Gmail
				</button>
			</div>
		);
	}

	// === Scope granted, show reader ===
	return (
		<div className="mt-8 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Mail className="size-5" /> Gmail Inbox
				</h2>
				{hasLoaded && (
					<span className="text-xs text-muted-foreground">
						{emails.length} email{emails.length !== 1 ? "s" : ""}
						{nextPageToken && " · more available"}
					</span>
				)}
			</div>

			{/* Error */}
			{error && (
				<div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{error}</span>
				</div>
			)}

			{/* Initial load button */}
			{!hasLoaded && !loading && (
				<button
					onClick={() => loadEmails()}
					className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
				>
					Load Inbox
				</button>
			)}

			{/* Loading spinner */}
			{loading && (
				<div className="flex items-center gap-2 text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span className="text-sm">Loading emails…</span>
				</div>
			)}

			{/* Email list */}
			{emails.length > 0 && (
				<ul className="divide-y divide-border rounded-lg border">
					{emails.map((email) => {
						const isExpanded = expandedId === email.id;
						return (
							<li key={email.id}>
								<button
									onClick={() => toggleExpand(email.id)}
									className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
								>
									<span className="mt-0.5 shrink-0">
										{isExpanded ? (
											<MailOpen className="size-4 text-primary" />
										) : (
											<Mail className="size-4 text-muted-foreground" />
										)}
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline justify-between gap-2">
											<span className="truncate text-sm font-medium">
												{email.from}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{formatDate(email.date)}
											</span>
										</div>
										<p className="truncate text-sm text-foreground">
											{email.subject || "(no subject)"}
										</p>
										{!isExpanded && email.snippet && (
											<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
												{email.snippet}
											</p>
										)}
									</div>
									<span className="mt-1 shrink-0 text-muted-foreground">
										{isExpanded ? (
											<ChevronUp className="size-4" />
										) : (
											<ChevronDown className="size-4" />
										)}
									</span>
								</button>

								{/* Expanded body */}
								{isExpanded && (
									<div className="border-t border-border px-4 pb-3 pt-2">
										<div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
											<span>
												<strong>To:</strong> {email.to}
											</span>
											<span>
												<strong>Date:</strong> {email.date}
											</span>
											<span>
												<strong>Labels:</strong> {email.labelIds.join(", ")}
											</span>
										</div>
										<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-sans text-sm leading-relaxed">
											{email.body || "(no plain-text body)"}
										</pre>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{/* Load more */}
			{nextPageToken && (
				<div className="flex justify-center">
					<button
						onClick={handleLoadMore}
						disabled={loadingMore}
						className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
					>
						{loadingMore && <Loader2 className="size-4 animate-spin" />}
						{loadingMore ? "Loading…" : "Load More"}
					</button>
				</div>
			)}
		</div>
	);
}

// ── Date formatting ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	try {
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return dateStr;
	}
}
