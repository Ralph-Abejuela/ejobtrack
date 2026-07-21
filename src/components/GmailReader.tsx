import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useEmailPoller } from "@/lib/use-email-poller";
import {
	Mail,
	MailOpen,
	ChevronDown,
	ChevronUp,
	Loader2,
	AlertCircle,
	RefreshCw,
	Trash2,
} from "lucide-react";

export default function GmailReader() {
	const { user, accessToken, requestingScope, requestGmailScope } = useAuth();
	const {
		cachedEmails,
		cachedTotal,
		loadMore,
		allLoaded,
		poll,
		refresh,
		clearMyCache,
	} = useEmailPoller();

	const [expandedId, setExpandedId] = useState<string | null>(null);

	// --- Grant Gmail scope on first access ---
	const handleGrantAccess = useCallback(async () => {
		const token = await requestGmailScope();
		if (!token) return;
		await refresh();
	}, [requestGmailScope, refresh]);

	// --- Toggle body expand ---
	const toggleExpand = useCallback((id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	}, []);

	// --- Clear cache for current user only ---
	const handleClearCache = useCallback(async () => {
		await clearMyCache();
	}, [clearMyCache]);

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

	// ── Derived state ────────────────────────────────────────────────────────
	const hasCachedData = cachedTotal > 0;
	const lastSyncStr = poll.lastSyncTime
		? formatTimeAgo(poll.lastSyncTime)
		: null;

	// === Scope granted, show reader ===
	return (
		<div className="mt-8 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Mail className="size-5" /> Gmail Inbox
				</h2>

				<div className="flex items-center gap-3">
					{/* Sync status */}
					{poll.syncing && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<Loader2 className="size-3 animate-spin" /> Syncing…
						</span>
					)}
					{lastSyncStr && !poll.syncing && (
						<span className="text-xs text-muted-foreground">
							Synced {lastSyncStr}
						</span>
					)}

					{/* Refresh button */}
					<button
						onClick={refresh}
						disabled={poll.syncing}
						className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
						title="Sync now"
					>
						<RefreshCw
							className={`size-3 ${poll.syncing ? "animate-spin" : ""}`}
						/>
						Sync
					</button>

					{/* Clear cache */}
					{hasCachedData && (
						<button
							onClick={handleClearCache}
							className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
							title="Clear cached emails"
						>
							<Trash2 className="size-3" />
							Clear cache
						</button>
					)}
				</div>
			</div>

			{/* Sync error */}
			{poll.syncError && (
				<div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{poll.syncError}</span>
				</div>
			)}

			{/* New emails badge */}
			{poll.newCount > 0 && (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
					{poll.newCount} new email{poll.newCount !== 1 ? "s" : ""} synced
				</div>
			)}

			{/* Initial empty state */}
			{!hasCachedData && !poll.syncing && (
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						No emails cached yet. Sync to load your inbox.
					</p>
					<button
						onClick={refresh}
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
					>
						<RefreshCw className="size-4" />
						Sync Inbox
					</button>
				</div>
			)}

			{/* Cache summary */}
			{hasCachedData && (
				<p className="text-xs text-muted-foreground">
					{cachedTotal} email{cachedTotal !== 1 ? "s" : ""} cached
					{cachedEmails.length < cachedTotal &&
						` · showing ${cachedEmails.length}`}
					{allLoaded && " · all loaded"}
				</p>
			)}

			{/* Email list */}
			{cachedEmails.length > 0 && (
				<ul className="divide-y divide-border rounded-lg border">
					{cachedEmails.map((email) => {
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

			{/* Load more (from cache) */}
			{!allLoaded && (
				<div className="flex justify-center">
					<button
						onClick={loadMore}
						className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
					>
						Load More ({cachedTotal - cachedEmails.length} remaining)
					</button>
				</div>
			)}
		</div>
	);
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function formatTimeAgo(ms: number): string {
	const delta = Date.now() - ms;
	const mins = Math.floor(delta / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
