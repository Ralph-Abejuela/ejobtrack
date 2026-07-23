// ── Dev-only logger ───────────────────────────────────────────────────────
// All log calls become no-ops in production builds (Vite tree-shakes
// dead code when import.meta.env.DEV is inlined at build time).

const DEV = import.meta.env.DEV;

export const logger = {
	log: DEV
		? (tag: string, ...args: unknown[]) => console.log(`[${tag}]`, ...args)
		: () => {},
	warn: DEV
		? (tag: string, ...args: unknown[]) => console.warn(`[${tag}]`, ...args)
		: () => {},
	error: DEV
		? (tag: string, ...args: unknown[]) => console.error(`[${tag}]`, ...args)
		: () => {},
};
