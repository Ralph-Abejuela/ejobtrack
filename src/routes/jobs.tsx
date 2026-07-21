import { createFileRoute } from "@tanstack/react-router";
import { useJobPoller } from "@/lib/use-job-poller";
import { useAuth } from "@/lib/auth";
import {
	updateJobStatus,
	findPotentialDuplicates,
	mergeJobs,
	mergeIntoNew,
	undoMerge,
	unIgnoreGroup,
	getResolutionHistory,
	type DuplicateGroup,
	type ResolutionEntry,
} from "@/lib/jobs-db";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";
import { getMessage, parseMessage } from "@/lib/gmail";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
	Loader2,
	RefreshCw,
	Briefcase,
	CheckCircle2,
	Eye,
	CalendarCheck,
	Award,
	XCircle,
	HelpCircle,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	Merge,
	AlertTriangle,
	Square,
	CheckSquare,
	X,
} from "lucide-react";

export const Route = createFileRoute("/jobs")({
	component: JobsPage,
});

const STCFG: Record<
	string,
	{ label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
	[JobStatus.APPLIED]: {
		label: "Applied",
		icon: CheckCircle2,
		color: "text-blue-600 dark:text-blue-400",
		bg: "bg-blue-50 dark:bg-blue-950",
	},
	[JobStatus.VIEWED]: {
		label: "Viewed",
		icon: Eye,
		color: "text-purple-600 dark:text-purple-400",
		bg: "bg-purple-50 dark:bg-purple-950",
	},
	[JobStatus.INTERVIEW]: {
		label: "Interview",
		icon: CalendarCheck,
		color: "text-amber-600 dark:text-amber-400",
		bg: "bg-amber-50 dark:bg-amber-950",
	},
	[JobStatus.OFFER]: {
		label: "Offer",
		icon: Award,
		color: "text-green-600 dark:text-green-400",
		bg: "bg-green-50 dark:bg-green-950",
	},
	[JobStatus.REJECTED]: {
		label: "Rejected",
		icon: XCircle,
		color: "text-red-600 dark:text-red-400",
		bg: "bg-red-50 dark:bg-red-950",
	},
	[JobStatus.UNKNOWN]: {
		label: "Unknown",
		icon: HelpCircle,
		color: "text-gray-500",
		bg: "bg-gray-50 dark:bg-gray-950",
	},
};

const STATUS_ORDER = [
	JobStatus.APPLIED,
	JobStatus.VIEWED,
	JobStatus.INTERVIEW,
	JobStatus.OFFER,
	JobStatus.REJECTED,
	JobStatus.UNKNOWN,
];

function JobsPage() {
	const { user, accessToken } = useAuth();
	const { jobs, statusCounts, state, loadMore, reload } = useJobPoller();
	const [expandedJob, setExpandedJob] = useState<string | null>(null);
	const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
	const [showDuplicates, setShowDuplicates] = useState(false);
	const [merging, setMerging] = useState<string | null>(null);
	const [resolutionHistory, setResolutionHistory] = useState<ResolutionEntry[]>(
		() => getResolutionHistory(),
	);
	const [showHistory, setShowHistory] = useState(false);
	const [activeEmailId, setActiveEmailId] = useState<string | null>(null);
	const [selectedEmail, setSelectedEmail] = useState<{
		subject: string;
		from: string;
		body: string;
	} | null>(null);
	const [fetchingEmail, setFetchingEmail] = useState(false);
	const [toast, setToast] = useState<{
		id: string;
		msg: string;
		onUndo: () => void;
		undoLabel: string;
	} | null>(null);
	const [undoing, setUndoing] = useState(false);
	const [dismissed, setDismissed] = useState<Set<string>>(() => {
		try {
			const raw = localStorage.getItem("dismissed_dup_groups");
			return new Set<string>(raw ? JSON.parse(raw) : []);
		} catch {
			return new Set<string>();
		}
	});

	// Refresh duplicate detection when jobs change
	useEffect(() => {
		if (!user?.email) {
			setDuplicates([]);
			return;
		}
		findPotentialDuplicates(user.email).then(setDuplicates);
	}, [user?.email, jobs]);

	const handleDismiss = useCallback((groupKey: string) => {
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(groupKey);
			localStorage.setItem("dismissed_dup_groups", JSON.stringify([...next]));
			return next;
		});
		setResolutionHistory(getResolutionHistory());
		setToast({
			id: `ignore:${groupKey}`,
			msg: "Duplicate group ignored",
			onUndo: () => {
				unIgnoreGroup(groupKey);
				setDismissed((prev) => {
					const next = new Set(prev);
					next.delete(groupKey);
					return next;
				});
				setResolutionHistory(getResolutionHistory());
			},
			undoLabel: "Undo ignore",
		});
	}, []);

	const [selectedJobs, setSelectedJobs] = useState<Set<string>>(
		() => new Set(),
	);
	const [mergeNewModal, setMergeNewModal] = useState<{
		groupKey: string;
	} | null>(null);

	// Fetch selected timeline entry's email
	useEffect(() => {
		if (!activeEmailId || !accessToken) {
			setSelectedEmail(null);
			setFetchingEmail(false);
			return;
		}
		let cancelled = false;
		setFetchingEmail(true);
		getMessage(accessToken, activeEmailId)
			.then((msg) => {
				if (cancelled) return;
				const parsed = parseMessage(msg);
				setSelectedEmail({
					subject: parsed.subject,
					from: parsed.from,
					body: parsed.body || parsed.snippet || "(no body)",
				});
			})
			.catch(() => {
				if (cancelled) return;
				setSelectedEmail(null);
			})
			.finally(() => {
				if (!cancelled) setFetchingEmail(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeEmailId, accessToken]);

	// Filter out dismissed groups
	const visibleDuplicates = useMemo(
		() => duplicates.filter((g) => !dismissed.has(g.groupKey)),
		[duplicates, dismissed],
	);

	const toggleSelect = useCallback((jobId: string) => {
		setSelectedJobs((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) next.delete(jobId);
			else next.add(jobId);
			return next;
		});
	}, []);

	const handleMergeSelected = useCallback(
		async (groupKey: string) => {
			if (selectedJobs.size < 2) return;
			const ids = [...selectedJobs];
			setMerging(`selected:${groupKey}`);
			try {
				const ok = await mergeIntoNew(user!.email, ids);
				if (ok) {
					await reload();
					setResolutionHistory(getResolutionHistory());
					setSelectedJobs(new Set());
					const ts = getResolutionHistory()[0]?.timestamp;
					setToast({
						id: `merge-selected:${groupKey}:${Date.now()}`,
						msg: `Merged ${ids.length} records`,
						onUndo: () => {
							if (!ts) return;
							setUndoing(true);
							undoMerge(ts)
								.then((ok) => {
									if (ok) {
										setResolutionHistory(getResolutionHistory());
										reload();
									}
								})
								.finally(() => setUndoing(false));
						},
						undoLabel: "Undo merge",
					});
				}
			} finally {
				setMerging(null);
			}
		},
		[selectedJobs, user, reload],
	);

	const handleMergeNew = useCallback(
		async (groupKey: string, company: string, title: string) => {
			const ids = [...selectedJobs];
			if (ids.length < 2) return;
			setMerging(`new:${groupKey}`);
			try {
				const ok = await mergeIntoNew(user!.email, ids, company, title);
				if (ok) {
					await reload();
					setResolutionHistory(getResolutionHistory());
					setSelectedJobs(new Set());
					setMergeNewModal(null);
					const ts = getResolutionHistory()[0]?.timestamp;
					setToast({
						id: `merge-new:${groupKey}:${Date.now()}`,
						msg: `Merged into "${company}"`,
						onUndo: () => {
							if (!ts) return;
							setUndoing(true);
							undoMerge(ts)
								.then((ok) => {
									if (ok) {
										setResolutionHistory(getResolutionHistory());
										reload();
									}
								})
								.finally(() => setUndoing(false));
						},
						undoLabel: "Undo merge",
					});
				}
			} finally {
				setMerging(null);
			}
		},
		[selectedJobs, user, reload],
	);

	const handleMerge = useCallback(
		async (keepId: string, removeId: string) => {
			if (!user?.email) return;
			setMerging(`${keepId}:${removeId}`);
			try {
				const result = await mergeJobs(user.email, keepId, removeId);
				await reload();
				setResolutionHistory(getResolutionHistory());

				if (result) {
					const ts = getResolutionHistory()[0]?.timestamp;
					setToast({
						id: `merge:${keepId}:${removeId}`,
						msg: "Merged duplicate",
						onUndo: () => {
							if (!ts) return;
							setUndoing(true);
							undoMerge(ts)
								.then((ok) => {
									if (ok) {
										setResolutionHistory(getResolutionHistory());
										reload();
									}
								})
								.finally(() => setUndoing(false));
						},
						undoLabel: "Undo merge",
					});
				}
			} finally {
				setMerging(null);
			}
		},
		[user?.email, reload],
	);

	// Group jobs by status
	const grouped = useMemo(() => {
		const map: Record<string, JobApplication[]> = {};
		for (const s of STATUS_ORDER) map[s] = [];
		for (const j of jobs) {
			if (map[j.status]) map[j.status].push(j);
		}
		return map;
	}, [jobs]);

	const handleStatusUpdate = useCallback(
		async (jobId: string, newStatus: JobStatus) => {
			await updateJobStatus(jobId, newStatus, {
				date: new Date().toISOString(),
				emailId: "manual",
			});
			await reload();
		},
		[reload],
	);

	if (!user) {
		return (
			<div className="flex items-center justify-center py-20 text-muted-foreground">
				<p className="text-sm">Sign in to track your job applications.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
					<Briefcase className="size-6" /> Job Applications
				</h1>
				<div className="flex items-center gap-3">
					{state.syncing && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<Loader2 className="size-3 animate-spin" /> Syncing…
						</span>
					)}
					<button
						onClick={() => loadMore()}
						disabled={state.syncing}
						className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
					>
						<RefreshCw
							className={`size-4 ${state.syncing ? "animate-spin" : ""}`}
						/>
						Load Older Emails
					</button>
				</div>
			</div>

			{state.syncError && (
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
					{state.syncError}
				</div>
			)}

			{/* Potential Duplicates */}
			{visibleDuplicates.length > 0 && (
				<div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
					<button
						onClick={() => setShowDuplicates(!showDuplicates)}
						className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200"
					>
						<AlertTriangle className="size-4" />
						{visibleDuplicates.length} duplicate group
						{visibleDuplicates.length !== 1 ? "s" : ""} found
						{showDuplicates ? (
							<ChevronUp className="ml-auto size-4" />
						) : (
							<ChevronDown className="ml-auto size-4" />
						)}
					</button>

					{showDuplicates && (
						<div className="space-y-3 border-t border-amber-200 px-4 py-3 dark:border-amber-800">
							<p className="text-xs text-amber-700 dark:text-amber-300">
								Same job title, multiple company names — select records to merge
								or merge into a new entry.
							</p>
							{visibleDuplicates.map((group) => {
								const selCount = group.jobs.filter((j) =>
									selectedJobs.has(j.id),
								).length;
								return (
									<div
										key={group.groupKey}
										className="rounded-lg border border-amber-300 bg-white p-3 dark:border-amber-700 dark:bg-amber-900/30"
									>
										<div className="flex items-center justify-between gap-2">
											<p className="truncate text-xs font-medium text-amber-900 dark:text-amber-100">
												{group.jobs[0].jobTitle}
											</p>
											<button
												onClick={() => handleDismiss(group.groupKey)}
												className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-800"
											>
												Ignore
											</button>
										</div>
										<div className="mt-2 space-y-1">
											{group.jobs.map((j) => {
												const checked = selectedJobs.has(j.id);
												return (
													<div
														key={j.id}
														className="flex items-center gap-2 rounded px-2 py-1 text-xs"
													>
														<button
															onClick={() => toggleSelect(j.id)}
															className="shrink-0"
														>
															{checked ? (
																<CheckSquare className="size-4 text-amber-600" />
															) : (
																<Square className="size-4 text-amber-400" />
															)}
														</button>
														<button
															onClick={() => {
																setExpandedJob(
																	expandedJob === j.id ? null : j.id,
																);
																requestAnimationFrame(() => {
																	document
																		.getElementById(j.id)
																		?.scrollIntoView({
																			behavior: "smooth",
																			block: "center",
																		});
																});
															}}
															className="min-w-0 flex-1 truncate text-left hover:underline"
														>
															{j.company}
															{checked && (
																<span className="ml-1.5 text-[10px] text-amber-500">
																	selected
																</span>
															)}
														</button>
														<span className="shrink-0 text-muted-foreground">
															{STCFG[j.status]?.label ?? j.status}
														</span>
													</div>
												);
											})}
										</div>
										<div className="mt-2 flex items-center gap-2">
											<button
												onClick={() => handleMergeSelected(group.groupKey)}
												disabled={
													merging === `selected:${group.groupKey}` ||
													selCount < 2
												}
												className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:hover:bg-amber-800"
											>
												{merging === `selected:${group.groupKey}` ? (
													<Loader2 className="size-3 animate-spin" />
												) : (
													<Merge className="size-3" />
												)}
												Merge selected{selCount >= 2 ? ` (${selCount})` : ""}
											</button>
											<button
												onClick={() =>
													setMergeNewModal({
														groupKey: group.groupKey,
													})
												}
												disabled={selCount < 2}
												className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:hover:bg-amber-800"
											>
												Merge into new…
											</button>
										</div>
									</div>
								);
							})}

							{/* Resolution History */}
							<button
								onClick={() => setShowHistory(!showHistory)}
								className="flex w-full items-center gap-1.5 pt-2 text-[11px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
							>
								{showHistory ? (
									<ChevronUp className="size-3" />
								) : (
									<ChevronDown className="size-3" />
								)}
								History ({resolutionHistory.length})
							</button>
							{showHistory && (
								<div className="mt-2 space-y-1">
									{resolutionHistory.length === 0 && (
										<p className="text-[11px] text-amber-500">
											No history yet.
										</p>
									)}
									{resolutionHistory.map((r) => (
										<div
											key={r.timestamp}
											className="flex items-center gap-2 rounded px-2 py-1 text-[11px]"
										>
											<span
												className={
													r.action === "ignore"
														? "text-amber-500"
														: "text-emerald-500"
												}
											>
												{r.action === "ignore" || r.action === "ignore-undo"
													? "Ignored"
													: r.action === "merge-undo"
														? "Merge undone"
														: "Merged"}
											</span>
											<span className="text-amber-700 dark:text-amber-300">
												{r.groupKey.split(":")[1] ?? r.groupKey}
											</span>
											<span className="ml-auto text-amber-400">
												{formatTimeAgo(r.timestamp)}
											</span>
											{r.action === "merge" && (
												<button
													onClick={() => {
														setUndoing(true);
														undoMerge(r.timestamp)
															.then((ok) => {
																if (ok) {
																	setResolutionHistory(getResolutionHistory());
																	reload();
																}
															})
															.finally(() => setUndoing(false));
													}}
													disabled={undoing}
													className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-800"
												>
													{undoing ? (
														<Loader2 className="size-3 animate-spin" />
													) : (
														"Undo merge"
													)}
												</button>
											)}
											{(r.action === "ignore" || r.action === "merge-undo") && (
												<span className="text-[10px] text-amber-400">
													undone
												</span>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Toast */}
			{toast && (
				<div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg dark:bg-gray-900">
					<p className="text-sm">{toast.msg}</p>
					<button
						onClick={() => {
							toast.onUndo();
							setToast(null);
						}}
						className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
					>
						{toast.undoLabel}
					</button>
					<button
						onClick={() => setToast(null)}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Dismiss
					</button>
				</div>
			)}

			{/* Merge into New modal */}
			{mergeNewModal && (
				<MergeNewModal
					groupKey={mergeNewModal.groupKey}
					selectedJobs={selectedJobs}
					duplicates={duplicates}
					merging={merging}
					onMerge={handleMergeNew}
					onClose={() => setMergeNewModal(null)}
				/>
			)}

			{/* Summary cards */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
				{STATUS_ORDER.map((s) => {
					const cfg = STCFG[s];
					const Icon = cfg.icon;
					const count = statusCounts[s] ?? 0;
					return (
						<div key={s} className="rounded-lg border p-3">
							<div className="flex items-center gap-2">
								<Icon className={`size-4 ${cfg.color}`} />
								<span className="text-sm font-medium">{cfg.label}</span>
							</div>
							<p className={`mt-1 text-2xl font-bold ${cfg.color}`}>{count}</p>
						</div>
					);
				})}
			</div>

			{/* Grouped sections */}
			{jobs.length === 0 && !state.syncing && (
				<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
					No job applications tracked yet. Click Load Older Emails to fetch from
					your inbox.
				</div>
			)}

			{STATUS_ORDER.map((status) => {
				const sectionJobs = grouped[status];
				if (sectionJobs.length === 0) return null;
				const cfg = STCFG[status];
				const Icon = cfg.icon;

				return (
					<section key={status} className="space-y-2">
						<h2
							className={`flex items-center gap-2 text-sm font-semibold ${cfg.color}`}
						>
							<Icon className="size-4" />
							{cfg.label}
							<span className="text-xs text-muted-foreground font-normal">
								({sectionJobs.length})
							</span>
						</h2>

						<div className="divide-y rounded-lg border">
							{sectionJobs.map((job) => {
								const isExpanded = expandedJob === job.id;
								return (
									<div key={job.id} id={job.id}>
										<button
											onClick={() => setExpandedJob(isExpanded ? null : job.id)}
											className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">
													{job.jobTitle}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{job.company} ·{" "}
													<span className="capitalize">{job.platform}</span>
												</p>
											</div>
											<span className="shrink-0 text-xs text-muted-foreground">
												{formatDate(job.date)}
											</span>
											{isExpanded ? (
												<ChevronUp className="size-4 shrink-0 text-muted-foreground" />
											) : (
												<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
											)}
										</button>

										{isExpanded && (
											<div className="border-t px-4 pb-4 pt-3">
												{/* Timeline */}
												<Timeline
													history={job.history}
													selectedEmailId={activeEmailId}
													onSelect={setActiveEmailId}
												/>

												{/* Details */}
												<div className="mt-4 space-y-2 text-xs text-muted-foreground">
													{(() => {
														const selEntry = activeEmailId
															? job.history.find(
																	(h) => h.emailId === activeEmailId,
																)
															: null;
														return selEntry ? (
															<div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/30">
																<p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
																	Email from {formatDate(selEntry.date)}
																	{" · "}
																	{STCFG[selEntry.status]?.label ??
																		selEntry.status}
																</p>
															</div>
														) : null;
													})()}
													<div className="flex flex-wrap gap-x-4 gap-y-1">
														<span>
															<strong>Subject:</strong>{" "}
															{fetchingEmail ? (
																<Loader2 className="inline size-3 animate-spin" />
															) : (
																(selectedEmail?.subject ?? job.subject)
															)}
														</span>
														<span>
															<strong>From:</strong>{" "}
															{fetchingEmail ? (
																<Loader2 className="inline size-3 animate-spin" />
															) : (
																(selectedEmail?.from ?? job.from)
															)}
														</span>
														{job.url && (
															<a
																href={job.url}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex items-center gap-1 text-primary hover:underline"
															>
																<ExternalLink className="size-3" />
																View Job Posting
															</a>
														)}
														<a
															href={`https://mail.google.com/mail/u/0/#inbox/${activeEmailId ?? job.emailId}`}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center gap-1 text-primary hover:underline"
														>
															<ExternalLink className="size-3" />
															{activeEmailId
																? "Open this email in Gmail"
																: "Open latest email in Gmail"}
														</a>
													</div>

													<div className="flex items-center gap-2">
														<label className="text-xs text-muted-foreground">
															Status:
														</label>
														<select
															value={job.status}
															onChange={(e) =>
																handleStatusUpdate(
																	job.id,
																	e.target.value as JobStatus,
																)
															}
															className="rounded border px-2 py-1 text-xs"
														>
															{STATUS_ORDER.map((s) => (
																<option key={s} value={s}>
																	{STCFG[s]?.label ?? s}
																</option>
															))}
														</select>
													</div>
												</div>

												{/* Body */}
												<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-sans text-xs leading-relaxed">
													{fetchingEmail
														? "Loading…"
														: (selectedEmail?.body ??
															(job.body || "(no body)"))}
												</pre>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</section>
				);
			})}

			<p className="text-xs text-muted-foreground">
				{state.lastSyncTime > 0 &&
					`Last synced ${formatTimeAgo(state.lastSyncTime)}`}
				{state.newCount > 0 && ` · ${state.newCount} new updates`}
			</p>
		</div>
	);
}

/** Modal form for merging selected jobs into a new record. */
function MergeNewModal({
	groupKey,
	selectedJobs,
	duplicates,
	merging,
	onMerge,
	onClose,
}: {
	groupKey: string;
	selectedJobs: ReadonlySet<string>;
	duplicates: DuplicateGroup[];
	merging: string | null;
	onMerge: (groupKey: string, company: string, title: string) => void;
	onClose: () => void;
}) {
	const group = duplicates.find((g) => g.groupKey === groupKey);
	const selItems = group?.jobs.filter((j) => selectedJobs.has(j.id)) ?? [];
	const longestCompany = selItems.reduce(
		(a, b) => (a.company.length >= b.company.length ? a : b),
		{ company: "" } as JobApplication,
	).company;
	const title = selItems[0]?.jobTitle ?? "";

	const [company, setCompany] = useState(longestCompany);
	const [jobTitle, setJobTitle] = useState(title);

	const isMerging = merging === `new:${groupKey}`;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
			<div className="mx-4 w-full max-w-md rounded-lg border bg-white p-5 shadow-xl dark:bg-gray-900">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold">Merge into New Entry</h3>
					<button
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>

				<p className="mt-1 text-xs text-muted-foreground">
					{selItems.length} record{selItems.length !== 1 ? "s" : ""} selected.
					All history will be consolidated.
				</p>

				<div className="mt-4 space-y-3">
					<label className="block text-xs font-medium">
						Company
						<input
							value={company}
							onChange={(e) => setCompany(e.target.value)}
							className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
						/>
					</label>
					<label className="block text-xs font-medium">
						Job Title
						<input
							value={jobTitle}
							onChange={(e) => setJobTitle(e.target.value)}
							className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
						/>
					</label>
				</div>

				<div className="mt-5 flex items-center justify-end gap-2">
					<button
						onClick={onClose}
						disabled={isMerging}
						className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={() => onMerge(groupKey, company.trim(), jobTitle.trim())}
						disabled={isMerging || !company.trim() || !jobTitle.trim()}
						className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
					>
						{isMerging ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<Merge className="size-3" />
						)}
						Merge
					</button>
				</div>
			</div>
		</div>
	);
}

/** Horizontal timeline showing status progression left to right. */
function Timeline({
	history,
	selectedEmailId,
	onSelect,
}: {
	history: { status: string; date: string; emailId: string }[];
	selectedEmailId: string | null;
	onSelect: (emailId: string | null) => void;
}) {
	// Sort by date ascending (oldest first = leftmost)
	const sorted = [...history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	const handleClick = (h: (typeof sorted)[number]) => {
		if (selectedEmailId === h.emailId) {
			onSelect(null); // deselect
		} else {
			onSelect(h.emailId);
		}
	};

	if (sorted.length < 2) {
		// Single event — just show it as a single dot, still clickable
		const h = sorted[0];
		if (!h) return null;
		const cfg = STCFG[h.status] ?? STCFG.unknown;
		const Icon = cfg.icon;
		const isSelected = selectedEmailId === h.emailId;
		return (
			<button
				onClick={() => handleClick(h)}
				className={`flex w-full items-center justify-center gap-2 rounded py-2 transition-colors hover:bg-muted/40 ${isSelected ? "bg-amber-50 dark:bg-amber-950" : ""}`}
			>
				<div className={`rounded-full p-1.5 ${cfg.bg}`}>
					<Icon className={`size-4 ${cfg.color}`} />
				</div>
				<div className="text-xs">
					<span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
					<span className="ml-1.5 text-muted-foreground">
						{formatDate(h.date)}
					</span>
				</div>
			</button>
		);
	}

	return (
		<div className="flex items-center justify-center gap-0 py-3">
			{sorted.map((h, i) => {
				const cfg = STCFG[h.status] ?? STCFG.unknown;
				const Icon = cfg.icon;
				const isLast = i === sorted.length - 1;
				const isSelected = selectedEmailId === h.emailId;
				return (
					<button
						key={i}
						onClick={() => handleClick(h)}
						className={`flex items-center rounded p-1 transition-colors hover:bg-muted/40 ${isSelected ? "bg-amber-50 dark:bg-amber-950" : ""}`}
					>
						<div className="flex flex-col items-center gap-1">
							<div className={`rounded-full p-1.5 ${cfg.bg}`}>
								<Icon className={`size-3.5 ${cfg.color}`} />
							</div>
							<span
								className={`text-[10px] font-medium leading-tight ${cfg.color}`}
							>
								{cfg.label}
							</span>
							<span className="text-[10px] text-muted-foreground leading-tight">
								{formatDate(h.date)}
							</span>
						</div>
						{!isLast && <div className="mx-1 h-px w-8 bg-border sm:w-12" />}
					</button>
				);
			})}
		</div>
	);
}

function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	try {
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
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
