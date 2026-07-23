/**
 * NO LONGER NEEDED.
 *
 * Previously showed a blocking modal asking users to authorize Gmail access
 * after Google Sign-In. With unified OAuth (openid + gmail.readonly in one
 * popup), both auth and authorization happen in a single consent screen.
 *
 * This file kept as a stub to avoid import errors. Remove the import from
 * __root.tsx once confirmed nothing else references it.
 */
export default function GmailAuthModal() {
	return null;
}
