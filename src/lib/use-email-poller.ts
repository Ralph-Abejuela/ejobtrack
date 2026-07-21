import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchEmailsPageMeta } from "@/lib/gmail";
import {
	storeEmails,
	getLastSyncTime,
	setLastSyncTime,
	shouldRefresh,
	getCachedEmails,
	loadNextBatch,
	countCached,
	clearUserCache,
	type EmailRecord,
} from "@/lib/email-cache";

const POLL_INTERVAL_MS = 60 * 60 * 1000;
const PAGE_SIZE = 50;

/** Convert epoch ms to Gmail search date format (YYYY/MM/DD). */
function tsToGmailDate(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}/${m}/${day}`;
}

interface PollState {
	syncing: boolean;
	lastSyncTime: number;
	newCount: number;
	syncError: string | null;
}

export function useEmailPoller() {
	const { user, accessToken } = useAuth();
	const userEmail = user?.email ?? "";

	const [cachedEmails, setCachedEmails] = useState<EmailRecord[]>([]);
	const [cachedTotal, setCachedTotal] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [poll, setPoll] = useState<PollState>({
		syncing: false,
		lastSyncTime: getLastSyncTime(userEmail),
		newCount: 0,
		syncError: null,
	});

	const pollingRef = useRef(false);
	const oldestTsRef = useRef<number | null>(null);

	// --- Load first page from cache ---
	const loadCache = useCallback(async () => {
		if (!userEmail) return;
		const { emails, total } = await getCachedEmails(userEmail, 1, PAGE_SIZE);
		setCachedEmails(emails);
		setCachedTotal(total);
		if (emails.length > 0) {
			oldestTsRef.current = Number(emails[emails.length - 1].internalDate);
		}
	}, [userEmail]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadCache();
	}, [loadCache]);

	// --- Sync: fetch NEW email metadata since last sync ---
	const sync = useCallback(
		async (tokenOverride?: string) => {
			const token = tokenOverride ?? accessToken;
			if (!token || !userEmail || pollingRef.current) return;

			pollingRef.current = true;
			setPoll((p) => ({ ...p, syncing: true, syncError: null }));

			try {
				const lastSync = getLastSyncTime(userEmail);
				// Use epoch seconds for after: (docs: "pass the value in seconds instead")
				const since = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
				const q = lastSync > 0 ? `after:${since}` : undefined;

				const { emails: newEmails, nextPageToken } = await fetchEmailsPageMeta(
					token,
					{
						maxResults: PAGE_SIZE,
						q,
					},
				);

				if (newEmails.length > 0) {
					await storeEmails(userEmail, newEmails);
					await loadCache();
				}

				const now = Date.now();
				setLastSyncTime(userEmail, now);
				setPoll((p) => ({
					...p,
					syncing: false,
					lastSyncTime: now,
					newCount: newEmails.length,
				}));

				if (nextPageToken && !q) setHasMore(true);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Sync failed";
				setPoll((p) => ({ ...p, syncing: false, syncError: msg }));
			} finally {
				pollingRef.current = false;
			}
		},
		[accessToken, userEmail, loadCache],
	);

	// --- Initial stale sync ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		if (shouldRefresh(userEmail)) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			sync();
		}
	}, [accessToken, userEmail, sync]);

	// --- Hourly poll ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;

		const onInterval = () => {
			if (document.visibilityState === "visible") sync();
		};

		const id = setInterval(onInterval, POLL_INTERVAL_MS);
		return () => clearInterval(id);
	}, [accessToken, userEmail, sync]);

	// --- Tab focus refresh ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;

		const onVisibility = () => {
			if (document.visibilityState === "visible" && shouldRefresh(userEmail))
				sync();
		};

		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, [accessToken, userEmail, sync]);

	// --- Manual refresh ---
	const refresh = useCallback(
		async (tokenOverride?: string) => {
			await sync(tokenOverride);
		},
		[sync],
	);

	// --- Load more: serve from cache; fetch EXACT count needed from API ---
	const loadMore = useCallback(async () => {
		if (!userEmail || !accessToken || pollingRef.current) return;

		// 1. Try cache first
		const batch = await loadNextBatch(
			userEmail,
			cachedEmails.length,
			PAGE_SIZE,
		);

		if (batch.length >= PAGE_SIZE) {
			setCachedEmails((prev) => [...prev, ...batch]);
			return;
		}

		// 2. Cache has partial batch — figure out how many more API items needed
		const needed = PAGE_SIZE - batch.length;
		setLoadingMore(true);
		pollingRef.current = true;
		setPoll((p) => ({ ...p, syncing: true }));

		try {
			const ts = oldestTsRef.current;
			const q = ts != null ? `before:${tsToGmailDate(ts)}` : undefined;

			const { emails: apiEmails, nextPageToken } = await fetchEmailsPageMeta(
				accessToken,
				{
					maxResults: needed,
					q,
				},
			);

			if (apiEmails.length > 0) {
				await storeEmails(userEmail, apiEmails);

				// Now load the full batch from cache (includes cached partial + new)
				const fullBatch = await loadNextBatch(
					userEmail,
					cachedEmails.length,
					PAGE_SIZE,
				);
				setCachedEmails((prev) => [...prev, ...fullBatch]);
				const freshTotal = await countCached(userEmail);
				setCachedTotal(freshTotal);

				if (fullBatch.length > 0) {
					oldestTsRef.current = Number(
						fullBatch[fullBatch.length - 1].internalDate,
					);
				}
			}

			if (!nextPageToken) setHasMore(false);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Load failed";
			setPoll((p) => ({ ...p, syncError: msg }));
		} finally {
			setLoadingMore(false);
			pollingRef.current = false;
			setPoll((p) => ({ ...p, syncing: false }));
		}
	}, [accessToken, userEmail, cachedEmails.length]);

	// --- Clear only this user's cache ---
	const clearMyCache = useCallback(async () => {
		if (!userEmail) return;
		await clearUserCache(userEmail);
		setHasMore(true);
		oldestTsRef.current = null;
		await loadCache();
	}, [userEmail, loadCache]);

	return {
		cachedEmails,
		cachedTotal,
		loadMore,
		allLoaded: !hasMore || cachedEmails.length === 0,
		loadingMore,
		poll,
		refresh,
		clearMyCache,
		reloadCache: loadCache,
	};
}
