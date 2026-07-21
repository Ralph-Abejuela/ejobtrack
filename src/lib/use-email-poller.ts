import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchEmailsPage } from "@/lib/gmail";
import {
	storeEmails,
	getLastSyncTime,
	setLastSyncTime,
	shouldRefresh,
	getCachedEmails,
	clearUserCache,
	type EmailRecord,
} from "@/lib/email-cache";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PAGE_SIZE = 50;

interface PollState {
	/** True while a fetch is in progress */
	syncing: boolean;
	/** When the last successful sync completed */
	lastSyncTime: number;
	/** New emails discovered since last poll */
	newCount: number;
	/** Error from last sync attempt */
	syncError: string | null;
}

/**
 * Hook that:
 * 1. Loads cached emails from IndexedDB on mount (scoped to current user)
 * 2. Polls Gmail API every hour (respects Page Visibility)
 * 3. Fetches only new emails since last sync using `after:` query
 * 4. Merges into IndexedDB cache under the current user's email
 * 5. Evicts oldest emails when >10k per user
 */
export function useEmailPoller() {
	const { user, accessToken } = useAuth();
	const userEmail = user?.email ?? "";

	const [cachedEmails, setCachedEmails] = useState<EmailRecord[]>([]);
	const [cachedTotal, setCachedTotal] = useState(0);
	const [poll, setPoll] = useState<PollState>({
		syncing: false,
		lastSyncTime: getLastSyncTime(userEmail),
		newCount: 0,
		syncError: null,
	});

	const pollingRef = useRef(false);

	// --- Load cached emails from IndexedDB (scoped to user) ---
	const loadCache = useCallback(async () => {
		if (!userEmail) return;
		const { emails, total } = await getCachedEmails(userEmail, 1, PAGE_SIZE);
		setCachedEmails(emails);
		setCachedTotal(total);
	}, [userEmail]);

	// Load cache on mount
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadCache();
	}, [loadCache]);

	// --- Fetch new emails from Gmail API (scoped to user) ---
	const sync = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		pollingRef.current = true;
		setPoll((p) => ({ ...p, syncing: true, syncError: null }));

		try {
			const lastSync = getLastSyncTime(userEmail);

			// Query for messages newer than last sync
			const q =
				lastSync > 0 ? `after:${Math.floor(lastSync / 1000)}` : undefined;

			const { emails: newEmails } = await fetchEmailsPage(accessToken, {
				maxResults: PAGE_SIZE,
				q,
			});

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
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Sync failed";
			setPoll((p) => ({ ...p, syncing: false, syncError: msg }));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadCache]);

	// --- Initial background sync if stale (for this user) ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		if (shouldRefresh(userEmail)) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			sync();
		}
	}, [accessToken, userEmail, sync]);

	// --- Polling interval (only when tab visible) ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;

		const onInterval = () => {
			if (document.visibilityState === "visible") {
				sync();
			}
		};

		const id = setInterval(onInterval, POLL_INTERVAL_MS);
		return () => clearInterval(id);
	}, [accessToken, userEmail, sync]);

	// --- Refresh on tab focus if stale (for this user) ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;

		const onVisibility = () => {
			if (document.visibilityState === "visible" && shouldRefresh(userEmail)) {
				sync();
			}
		};

		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, [accessToken, userEmail, sync]);

	// --- Manual refresh ---
	const refresh = useCallback(async () => {
		await sync();
	}, [sync]);

	// --- Load more from cache (scoped to user) ---
	const loadMore = useCallback(async () => {
		if (!userEmail) return;
		const nextPage = Math.floor(cachedEmails.length / PAGE_SIZE) + 1;
		const { emails: more } = await getCachedEmails(
			userEmail,
			nextPage,
			PAGE_SIZE,
		);
		if (more.length > 0) {
			setCachedEmails((prev) => [...prev, ...more]);
		}
	}, [userEmail, cachedEmails.length]);

	// --- Clear only this user's cache ---
	const clearMyCache = useCallback(async () => {
		if (!userEmail) return;
		await clearUserCache(userEmail);
		await loadCache();
	}, [userEmail, loadCache]);

	// --- Return both cached data and poller controls ---
	return {
		/** Emails loaded from cache (call loadMore to append next page) */
		cachedEmails,
		/** Total cached emails for this user */
		cachedTotal,
		/** Load next page of cached emails into cachedEmails */
		loadMore,
		/** True if all cached emails have been loaded */
		allLoaded: cachedEmails.length >= cachedTotal,
		/** Poller state */
		poll,
		/** Manual refresh */
		refresh,
		/** Clear only this user's cache */
		clearMyCache,
		/** Reload cache from IndexedDB */
		reloadCache: loadCache,
	};
}
