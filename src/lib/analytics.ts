/**
 * Analytics module — thin wrapper around PostHog.
 * Import where needed, call capture() directly.
 */
import { posthog } from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

/** True when PostHog is configured and ready. */
export const analyticsEnabled = !!POSTHOG_KEY;

/** Identify user (call after successful auth). */
export function identifyUser(email: string, name?: string) {
	if (!analyticsEnabled) return;
	posthog.identify(email, { email, name });
}

/** Track a custom event with optional properties. */
export function capture(
	event: string,
	properties?: Record<string, string | number | boolean>,
) {
	if (!analyticsEnabled) return;
	posthog.capture(event, properties);
}
