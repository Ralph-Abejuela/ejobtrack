/* eslint-disable react-refresh/only-export-components */

import {
	createContext,
	useContext,
	useState,
	useCallback,
	type ReactNode,
	useRef,
	useEffect,
} from "react";
import { setOnUnauthorized } from "./gmail";
import { capture, identifyUser } from "./analytics";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GoogleUser {
	sub: string;
	email: string;
	name: string;
	picture: string;
	given_name: string;
	family_name: string;
}

interface AuthState {
	/** Decoded user profile */
	user: GoogleUser | null;
	/** OAuth access token for Gmail API */
	accessToken: string | null;
	/** True while sign-in popup is open */
	loading: boolean;
}

interface AuthContextValue extends AuthState {
	signOut: () => void;
	/** Sign in with Google — single OAuth popup for both auth + Gmail scope */
	signIn: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── JWT decode helper (legacy session migration only) ─────────────────────

function decodeJwtPayload(token: string): GoogleUser | null {
	try {
		const base64 = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
		const json = atob(base64);
		return JSON.parse(json) as GoogleUser;
	} catch {
		console.warn("[auth] Failed to decode JWT token");
		return null;
	}
}

// ── Fetch user info from Google UserInfo API ──────────────────────────────

async function fetchUserInfo(accessToken: string): Promise<GoogleUser | null> {
	try {
		const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) {
			console.warn(`[auth] UserInfo API returned ${res.status}`);
			return null;
		}
		const data = await res.json();
		return {
			sub: data.sub,
			email: data.email,
			name: data.name,
			picture: data.picture,
			given_name: data.given_name,
			family_name: data.family_name,
		};
	} catch (err) {
		console.warn("[auth] UserInfo API call failed", err);
		return null;
	}
}

// ── Provider ──────────────────────────────────────────────────────────────

const SESSION_KEY = "ejobtrack_session";

function restoreSession(): AuthState {
	try {
		const saved = sessionStorage.getItem(SESSION_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// New format: { user, accessToken }
			if (parsed.user?.email && parsed.accessToken) {
				return {
					user: parsed.user,
					accessToken: parsed.accessToken,
					loading: false,
				};
			}
			// Legacy format from old GSI flow: { idToken, accessToken } — migrate
			if (parsed.idToken) {
				const user = decodeJwtPayload(parsed.idToken);
				if (user && parsed.accessToken) {
					const migrated = { user, accessToken: parsed.accessToken };
					sessionStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
					return { user, accessToken: parsed.accessToken, loading: false };
				}
			}
		}
	} catch {
		console.warn("[auth] Corrupt session, ignoring");
	}
	return { user: null, accessToken: null, loading: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>(restoreSession);

	// --- Persist to sessionStorage ---
	const persist = useCallback((user: GoogleUser, accessToken: string) => {
		sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, accessToken }));
	}, []);

	// --- Unified sign-in: one OAuth popup for auth + Gmail scope ---
	const signIn = useCallback(async (): Promise<string | null> => {
		if (typeof google === "undefined" || !google.accounts?.oauth2) {
			console.warn("[auth] GIS library not loaded yet");
			return null;
		}

		setState((prev) => ({ ...prev, loading: true }));

		return new Promise<string | null>((resolve) => {
			const client = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope:
					"openid email profile https://www.googleapis.com/auth/gmail.readonly",
				error_callback: () => {
					console.warn("[auth] OAuth popup closed by user");
					setState((prev) => ({ ...prev, loading: false }));
					resolve(null);
				},
				callback: async (response: google.accounts.oauth2.TokenResponse) => {
					if (!response.access_token) {
						console.warn("[auth] OAuth popup cancelled or failed");
						setState((prev) => ({ ...prev, loading: false }));
						resolve(null);
						return;
					}

					// Fetch user profile from Google UserInfo API using the access token
					// This guarantees the user matches the account that granted Gmail access
					const user = await fetchUserInfo(response.access_token);
					if (!user) {
						console.warn(
							"[auth] Got access token but failed to fetch user info",
						);
						setState((prev) => ({ ...prev, loading: false }));
						resolve(null);
						return;
					}

					setState({
						user,
						accessToken: response.access_token,
						loading: false,
					});
					persist(user, response.access_token);
					identifyUser(user.email);
					capture("user_signed_in", { email: user.email });
					resolve(response.access_token);
				},
			});
			client.requestAccessToken();
		});
	}, [persist]);

	// --- Sign out ---
	const signOut = useCallback(() => {
		sessionStorage.removeItem(SESSION_KEY);
		setOnUnauthorized(null);

		// Revoke OAuth tokens
		if (state.accessToken && typeof google !== "undefined") {
			try {
				google.accounts.oauth2.revoke(state.accessToken, () => {});
			} catch {
				// Best-effort revoke
			}
		}

		setState({ user: null, accessToken: null, loading: false });
	}, [state.accessToken]);

	// --- Silent token refresh (triggered by 401 from Gmail API) ---
	const refreshingRef = useRef(false);
	const refreshResultRef = useRef<Promise<string | null> | null>(null);

	const refreshAccessToken = useCallback(async (): Promise<string | null> => {
		if (refreshingRef.current && refreshResultRef.current) {
			return refreshResultRef.current;
		}

		const promise = new Promise<string | null>((resolve) => {
			refreshingRef.current = true;

			const timeout = setTimeout(() => {
				console.warn("[auth] Token refresh timed out — signing out");
				refreshingRef.current = false;
				refreshResultRef.current = null;
				signOut();
				resolve(null);
			}, 5_000);

			const refreshClient = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope:
					"openid email profile https://www.googleapis.com/auth/gmail.readonly",
				prompt: "", // silent — no popup if user already granted
				callback: (tokenResponse) => {
					clearTimeout(timeout);
					refreshingRef.current = false;
					refreshResultRef.current = null;

					if (tokenResponse?.access_token) {
						setState((prev) => ({
							...prev,
							accessToken: tokenResponse.access_token,
						}));
						setState((prev) => {
							if (prev.user) persist(prev.user, tokenResponse.access_token!);
							return prev;
						});
						resolve(tokenResponse.access_token);
					} else {
						console.warn("[auth] Silent token refresh failed — signing out");
						signOut();
						resolve(null);
					}
				},
			});
			refreshClient.requestAccessToken();
		});

		refreshResultRef.current = promise;
		return promise;
	}, [signOut, persist]);

	useEffect(() => {
		setOnUnauthorized(refreshAccessToken);
	}, [refreshAccessToken]);

	return (
		<AuthContext.Provider value={{ ...state, signOut, signIn }}>
			{children}
		</AuthContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
	return ctx;
}
