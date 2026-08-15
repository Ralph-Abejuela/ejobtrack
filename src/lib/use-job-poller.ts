import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
	listMessages,
	getMessage,
	parseMessage,
	RateLimitError,
} from "@/lib/gmail";
import { getAllJobs, getStatusCounts } from "@/lib/jobs-db";
import { markScanned, isScanned, getScannedCount } from "@/lib/jobs-cache";
import { enqueue, clearQueue, getQueueSize } from "@/lib/retry-queue";
import { useRetryLoop } from "@/lib/use-retry-loop";
import { ingestEmail } from "@/lib/jobs/ingest";
import type { JobApplication } from "@/lib/jobs/types";
import { toast } from "sonner";
import { capture } from "./analytics";
import { logger } from "./logger";
import { storeEmails } from "@/lib/email-cache";

const PAGE_SIZE = 25;
/** Gate for the new-email pass: run only if last sync was >15 min ago. */
const FORWARD_INTERVAL_MS = 15 * 60 * 1000;
/** Pagination cursor lifetime — Gmail pageTokens go stale, re-derive after 2h. */
const CURSOR_TTL_MS = 2 * 60 * 60 * 1000;
/** ponytail: runaway guard for the new-email walk (1250 emails max per pass). */
const MAX_FORWARD_PAGES = 50;

interface JobPollerState {
	syncing: boolean;
	lastSyncTime: number;
	newCount: number;
	syncError: string | null;
	/** Total emails ever scanned (from Dexie) */
	scannedCount: number;
	/** Oldest scanned email date as ISO string */
	oldestScanned: string | null;
	/** Progress: emails processed in current batch */
	batchProcessed: number;
	/** Progress: total emails in current batch */
	batchTotal: number;
	/** Number of pending retries in the queue */
	queueSize: number;
	/** Retry loop is actively processing */
	retryInProgress: boolean;
	/** No more older emails to load — reached inbox beginning */
	atEnd: boolean;
}

/** Epoch ms → YYYY/MM/DD for Gmail search. */
function tsToGmailDate(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a list of Gmail messages for job applications and store results.
 *  Returns new job count plus date boundaries of fetched emails. */
async function processEmails(
	accessToken: string,
	userEmail: string,
	ids: string[],
	onProgress?: (processed: number, total: number) => void,
	onUnauthorized?: () => Promise<string | null>,
): Promise<{
	newJobs: number;
	oldestTs: number | null;
	newestTs: number | null;
}> {
	const rateLimitedIds: string[] = [];

	const results = await Promise.all(
		ids.map(async (id) => {
			try {
				const email = parseMessage(
					await getMessage(accessToken, id, "full", undefined, onUnauthorized),
				);
				return { type: "success" as const, email };
			} catch (err) {
				if (err instanceof RateLimitError) {
					rateLimitedIds.push(id);
					return { type: "rate_limited" as const };
				}
				return { type: "error" as const };
			}
		}),
	);

	// Enqueue serially to avoid localStorage write races
	for (const id of rateLimitedIds) {
		logger.log("retry", `${id} rate-limited, queued`);
		enqueue(userEmail, id, "rate limited");
	}

	const emails = results
		.filter((r) => r.type === "success")
		.map((r) => r.email);

	// Compute date boundaries from fetched emails (eliminates double-fetch in callers)
	let oldestTs: number | null = null;
	let newestTs: number | null = null;
	if (emails.length > 0) {
		const ts = emails
			.map((e) => Number(e.internalDate))
			.filter((t) => !isNaN(t));
		if (ts.length > 0) {
			oldestTs = Math.min(...ts);
			newestTs = Math.max(...ts);
		}
	}

	// Cache fetched emails so timeline viewer doesn't re-fetch
	await storeEmails(userEmail, emails);

	await capture("emails_fetched", {
		count: emails.length,
		user: userEmail,
	});

	let newJobs = 0;
	const scannedIds: string[] = [];
	const total = emails.length;

	// Load once, dedup against a mutable map so within-batch dups are caught
	const jobsById = new Map((await getAllJobs(userEmail)).map((j) => [j.id, j]));

	for (let i = 0; i < total; i++) {
		const email = emails[i];
		onProgress?.(i + 1, total);
		logger.log("poller", email);
		if (await isScanned(userEmail, email.id)) continue;
		scannedIds.push(email.id);

		const { newJobs: nj } = await ingestEmail(email, userEmail, jobsById);
		newJobs += nj;
	}

	if (scannedIds.length > 0) {
		await markScanned(userEmail, scannedIds);
	}

	await capture("batch_processed", {
		emails_processed: scannedIds.length,
		new_jobs: newJobs,
	});

	return { newJobs, oldestTs, newestTs };
}

export function useJobPoller() {
	const { user, accessToken, refreshToken } = useAuth();
	const userEmail = user?.email ?? "";

	const [jobs, setJobs] = useState<JobApplication[]>([]);
	const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
	const [loaded, setLoaded] = useState(false);
	const [state, setState] = useState<JobPollerState>({
		syncing: false,
		lastSyncTime: 0,
		newCount: 0,
		syncError: null,
		scannedCount: 0,
		oldestScanned: null,
		batchProcessed: 0,
		batchTotal: 0,
		queueSize: 0,
		retryInProgress: false,
		atEnd: false,
	});

	const pollingRef = useRef(false);
	const lastEmailRef = useRef<string | null>(null);

	// Keep ref in sync so sign-out cleanup can access the last email
	lastEmailRef.current = userEmail;

	const loadJobs = useCallback(async () => {
		if (!userEmail) return;
		setJobs(await getAllJobs(userEmail));
		setStatusCounts(await getStatusCounts(userEmail));
		setLoaded(true);
	}, [userEmail]);

	const loadScanStats = useCallback(async () => {
		if (!userEmail) return;
		const [count, crawled] = await Promise.all([
			getScannedCount(userEmail),
			getCrawlState(userEmail),
		]);
		setState((s) => ({
			...s,
			scannedCount: count,
			oldestScanned: crawled.oldestTs
				? new Date(crawled.oldestTs).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					})
				: null,
		}));
	}, [userEmail]);

	useEffect(() => {
		loadJobs();
		loadScanStats();
	}, [loadJobs, loadScanStats]);

	/** Shared post-batch state reset — loads jobs, refreshes stats, clears syncing. */
	const finalizeBatch = useCallback(
		async (
			userEmail: string,
			newJobs: number,
			extraState?: Partial<Pick<JobPollerState, "oldestScanned" | "atEnd">>,
		) => {
			await loadJobs();
			const [scannedCount] = await Promise.all([getScannedCount(userEmail)]);
			const nowMs = Date.now();
			localStorage.setItem(`job_sync_ms_${userEmail}`, String(nowMs));
			setState((s) => ({
				...s,
				syncing: false,
				batchProcessed: 0,
				batchTotal: 0,
				lastSyncTime: nowMs,
				newCount: newJobs,
				scannedCount,
				queueSize: getQueueSize(userEmail),
				...extraState,
			}));
		},
		[loadJobs],
	);

	/**
	 * Fetch latest 50 emails (initial popup).
	 * Re-fetches on first call or when oldestTs is null.
	 */
	const initialSync = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		try {
			// Single page on initial sync — rest fetched progressively via loadMore
			const listRes = await listMessages(accessToken, {
				maxResults: PAGE_SIZE,
				onUnauthorized: refreshToken ?? undefined,
			});
			const ids = listRes.messages.map((m) => m.id);
			const { newJobs, oldestTs, newestTs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
				refreshToken ?? undefined,
			);

			await setCrawlState(userEmail, {
				newestTs,
				oldestTs,
				nextPageToken: listRes.nextPageToken ?? null,
				nextPageTokenExpiresAt: listRes.nextPageToken
					? Date.now() + CURSOR_TTL_MS
					: null,
			});

			await finalizeBatch(userEmail, newJobs, {
				oldestScanned: oldestTs
					? new Date(oldestTs).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: null,
			});
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				queueSize: getQueueSize(userEmail),
				syncError: err instanceof Error ? err.message : "Sync failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

	/**
	 * Check for new emails since newestTs.
	 * Callers manage their own throttle; this only guards against concurrent runs.
	 */
	const checkNewEmails = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		const crawl = await getCrawlState(userEmail);
		if (!crawl?.newestTs) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		try {
			// +1 day buffer so same-day emails after newestTs aren't missed
			const listRes = await listMessages(accessToken, {
				maxResults: PAGE_SIZE,
				q: `after:${tsToGmailDate(crawl.newestTs - 86400000)}`,
				onUnauthorized: refreshToken ?? undefined,
			});

			const ids = listRes.messages.map((m) => m.id);
			const { newJobs, newestTs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
				refreshToken ?? undefined,
			);

			if (newestTs !== null) {
				await setCrawlState(userEmail, {
					newestTs: Math.max(crawl.newestTs, newestTs),
				});
			}

			await finalizeBatch(userEmail, newJobs);
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				queueSize: getQueueSize(userEmail),
				syncError:
					err instanceof Error ? err.message : "New email check failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

	/**
	 * Load more: two-pass sync.
	 *
	 * Pass 1 (new): if >15 min since last sync, walk pages of 25 from the
	 * newest API email down to the newest email already in the DB (anchor =
	 * crawl.newestTs). Stops when a page contains an already-scanned email
	 * (the anchor is always scanned), so no overlap and no missed emails.
	 *
	 * Pass 2 (older): one page of 25 older emails via cursor. Tries
	 * nextPageToken first (2h TTL); expired/missing → before:date query using
	 * the oldest known email timestamp. Marks exhausted when no more results.
	 */
	const loadMore = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		const crawl = getCrawlState(userEmail);
		if (crawl.exhausted) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		let newJobs = 0;

		try {
			// ── Pass 1: new emails — only if >15 min since last sync ──
			const lastSyncMs = Number(
				localStorage.getItem(`job_sync_ms_${userEmail}`) ?? "0",
			);
			if (Date.now() - lastSyncMs >= FORWARD_INTERVAL_MS) {
				// Anchor: newest email already in the DB (by received date)
				const anchorTs = crawl.newestTs;
				let pageToken: string | null = null;
				let hitAnchor = false;
				let pages = 0;

				while (!hitAnchor && pages < MAX_FORWARD_PAGES) {
					pages++;
					const res = await listMessages(accessToken, {
						maxResults: PAGE_SIZE,
						pageToken,
						onUnauthorized: refreshToken ?? undefined,
					});
					const ids = res.messages.map((m) => m.id);
					if (ids.length === 0) break;

					// Skip pages already fully known — the anchor lives in one of them
					const scannedFlags = await Promise.all(
						ids.map((id) => isScanned(userEmail, id)),
					);
					const newIds = ids.filter((_, i) => !scannedFlags[i]);
					if (newIds.length > 0) {
						const { newJobs: nj, newestTs } = await processEmails(
							accessToken,
							userEmail,
							newIds,
							(processed, total) =>
								setState((s) => ({
									...s,
									batchProcessed: processed,
									batchTotal: total,
								})),
							refreshToken ?? undefined,
						);
						newJobs += nj;
						if (newestTs !== null) {
							await setCrawlState(userEmail, {
								newestTs: Math.max(anchorTs ?? 0, newestTs),
							});
						}
					}

					// First already-scanned email in newest→oldest order = the anchor
					if (scannedFlags.some(Boolean)) hitAnchor = true;
					pageToken = res.nextPageToken;
					if (!pageToken) break;
				}
				// Keep the 15-min background poller in sync with this manual pass
				localStorage.setItem(`job_forward_ms_${userEmail}`, String(Date.now()));
			}

			// ── Pass 2: older emails — one page via cursor (2h TTL) or before:date ──
			let listRes;
			let usedFallback = false;
			const cursorValid =
				crawl.nextPageToken &&
				crawl.nextPageTokenExpiresAt &&
				Date.now() < crawl.nextPageTokenExpiresAt;

			// 1. Try pageToken first (efficient, no overlap) — only if unexpired
			if (cursorValid) {
				try {
					listRes = await listMessages(accessToken, {
						maxResults: PAGE_SIZE,
						pageToken: crawl.nextPageToken,
						onUnauthorized: refreshToken ?? undefined,
					});
				} catch (err) {
					// Non-429 error → likely expired token, fall back to date-based
					if (!(err instanceof RateLimitError)) {
						if (crawl.oldestTs) {
							// Use next-day boundary so same-day older emails aren't missed
							listRes = await listMessages(accessToken, {
								maxResults: PAGE_SIZE,
								q: `before:${tsToGmailDate(crawl.oldestTs + 86400000)}`,
								onUnauthorized: refreshToken ?? undefined,
							});
							usedFallback = true;
						} else {
							throw err;
						}
					} else {
						throw err;
					}
				}
			} else if (crawl.oldestTs) {
				// 2. No valid cursor but have oldestTs → date-based direct
				listRes = await listMessages(accessToken, {
					maxResults: PAGE_SIZE,
					q: `before:${tsToGmailDate(crawl.oldestTs + 86400000)}`,
					onUnauthorized: refreshToken ?? undefined,
				});
				usedFallback = true;
			} else {
				// 3. No cursor and no oldestTs — nothing to load
				setCrawlState(userEmail, { exhausted: true });
				await finalizeBatch(userEmail, newJobs, { atEnd: true });
				return;
			}

			const ids = listRes.messages.map((m) => m.id);

			// No more emails — mark exhausted
			if (ids.length === 0) {
				setCrawlState(userEmail, { exhausted: true });
				await finalizeBatch(userEmail, 0, { atEnd: true });
				return;
			}

			const { newJobs: olderJobs, oldestTs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
				refreshToken ?? undefined,
			);
			newJobs += olderJobs;

			// When using fallback, don't store the returned pageToken (it will also expire).
			// Next click uses before:date again (dedup via isScanned handles overlap).
			const noMorePages = usedFallback
				? !listRes.nextPageToken
				: !listRes.nextPageToken &&
					(oldestTs === null || oldestTs < 4102444800000); // before ~2100

			// Notify when inbox fully loaded
			if (noMorePages) {
				toast("Reached beginning of inbox", {
					position: "bottom-right",
				});
			}

			await setCrawlState(userEmail, {
				// Fresh cursor gets a 2h TTL; fallback drops it entirely
				nextPageToken: usedFallback ? null : (listRes.nextPageToken ?? null),
				nextPageTokenExpiresAt: usedFallback
					? null
					: listRes.nextPageToken
						? Date.now() + CURSOR_TTL_MS
						: null,
				oldestTs:
					oldestTs !== null
						? Math.min(crawl.oldestTs ?? Infinity, oldestTs)
						: crawl.oldestTs,
				exhausted: noMorePages,
			});

			await finalizeBatch(userEmail, newJobs, {
				oldestScanned: oldestTs
					? new Date(crawl.oldestTs ?? oldestTs).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: null,
				atEnd: noMorePages,
			});
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				queueSize: getQueueSize(userEmail),
				syncError: err instanceof Error ? err.message : "Load more failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

	// --- Initial sync on mount if never synced ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		const crawl = getCrawlState(userEmail);
		if (!crawl.oldestTs) {
			initialSync();
		}
	}, [accessToken, userEmail, initialSync]);

	// 15-min interval for new-email polling (manages its own cooldown)
	// ponytail: skip when tab hidden — no Gmail API calls in background
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		const id = setInterval(
			() => {
				if (document.visibilityState === "hidden") return;
				const lastCheck = Number(
					localStorage.getItem(`job_forward_ms_${userEmail}`) ?? "0",
				);
				if (Date.now() - lastCheck < 15 * 60 * 1000) return;
				localStorage.setItem(`job_forward_ms_${userEmail}`, String(Date.now()));
				checkNewEmails();
			},
			15 * 60 * 1000,
		);
		return () => clearInterval(id);
	}, [accessToken, userEmail, checkNewEmails]);

	// Check for new emails when tab regains focus (1-min ref throttle)
	const focusCheckRef = useRef(0);
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		const onFocus = () => {
			if (document.visibilityState !== "visible") return;
			if (Date.now() - focusCheckRef.current < 60_000) return;
			focusCheckRef.current = Date.now();
			localStorage.setItem(`job_forward_ms_${userEmail}`, String(Date.now()));
			checkNewEmails();
		};
		document.addEventListener("visibilitychange", onFocus);
		return () => document.removeEventListener("visibilitychange", onFocus);
	}, [accessToken, userEmail, checkNewEmails]);

	// Retry loop — background processor for rate-limited message fetches
	useRetryLoop(
		accessToken,
		userEmail,
		{
			onProgress: (processed, total) =>
				setState((s) => ({
					...s,
					batchProcessed: processed,
					batchTotal: total,
					retryInProgress: true,
				})),
			onDone: () => {
				loadJobs();
				loadScanStats();
				setState((s) => ({
					...s,
					batchProcessed: 0,
					batchTotal: 0,
					retryInProgress: false,
				}));
			},
		},
		refreshToken ?? undefined,
	);

	// Clear retry queue on sign-out
	useEffect(() => {
		if (!userEmail && lastEmailRef.current) {
			clearQueue(lastEmailRef.current);
		}
	}, [userEmail]);

	return {
		jobs,
		statusCounts,
		loaded,
		state,
		/** Load next batch — new emails first (if stale), then older emails */
		loadMore,
		/** Check for new emails (hourly poll calls this) */
		checkNewEmails,
		/** Initial fetch on mount */
		initialSync,
		reload: loadJobs,
		/** Number of pending retries in the queue */
		queueSize: state.queueSize,
	};
}

interface CrawlState {
	userEmail: string;
	newestTs: number | null;
	oldestTs: number | null;
	nextPageToken: string | null;
	/** Cursor expiry (epoch ms) — pageTokens go stale after 2h. */
	nextPageTokenExpiresAt: number | null;
	totalJobs: number;
	totalEstimate: number;
	exhausted: boolean;
}

function getCrawlState(userEmail: string): CrawlState {
	try {
		const raw = localStorage.getItem(`job_crawl_${userEmail}`);
		if (raw) return JSON.parse(raw) as CrawlState;
	} catch {
		console.warn("[poller] Failed to read crawl state");
	}
	return {
		userEmail,
		newestTs: null,
		oldestTs: null,
		nextPageToken: null,
		nextPageTokenExpiresAt: null,
		totalJobs: 0,
		totalEstimate: 0,
		exhausted: false,
	};
}

function setCrawlState(
	userEmail: string,
	partial: Partial<
		Pick<
			CrawlState,
			| "newestTs"
			| "oldestTs"
			| "nextPageToken"
			| "nextPageTokenExpiresAt"
			| "totalJobs"
			| "totalEstimate"
			| "exhausted"
		>
	>,
): void {
	const existing = getCrawlState(userEmail);
	const merged = { ...existing, ...partial, userEmail };
	localStorage.setItem(`job_crawl_${userEmail}`, JSON.stringify(merged));
}
