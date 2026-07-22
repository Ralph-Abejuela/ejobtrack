// Cloudflare Worker — reverse proxy for PostHog
// Route: ph.ejobtrack.ralphabejuela.com/* → us.i.posthog.com/*
export default {
	async fetch(request) {
		const url = new URL(request.url);
		url.hostname = "us.i.posthog.com";
		return fetch(url, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		});
	},
};
