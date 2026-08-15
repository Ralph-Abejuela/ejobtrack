import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

function PrivacyPage() {
	return (
		<div className="mx-auto max-w-2xl space-y-6 py-8">
			<Link
				to="/"
				className="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Back to ejobtrack
			</Link>

			<h1 className="text-2xl font-bold">Privacy Policy</h1>
			<p className="text-sm text-muted-foreground">Last updated: July 2026</p>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Data Collection</h2>
				<p>
					ejobtrack is a browser-only application. No backend server stores or
					processes your data. All information retrieved from your Gmail account
					is stored exclusively in your browser's IndexedDB and never
					transmitted to any server.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">
					Google User Data Access (gmail.readonly)
				</h2>
				<p>
					ejobtrack requests the Google API scope{" "}
					<code className="rounded bg-muted px-1.5 py-0.5 text-xs">
						https://www.googleapis.com/auth/gmail.readonly
					</code>{" "}
					(read-only access to your Gmail messages). This is a restricted scope.
					With your explicit consent, ejobtrack accesses the following Google
					user data:
				</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>Email metadata and headers (sender, recipient, date, subject)</li>
					<li>Email snippets (preview text shown in message lists)</li>
					<li>Email message bodies, fetched only when you expand an email</li>
					<li>
						Your Google account email address (used to scope your local data)
					</li>
				</ul>
				<p>
					ejobtrack does <strong>not</strong> access: your Gmail settings, other
					Google products (Drive, Contacts, Calendar, Photos), or any data from
					accounts other than the one you signed in with.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">How Google User Data Is Used</h2>
				<p>
					The Google user data accessed via the gmail.readonly scope is used
					solely to provide the core functionality you request: identifying and
					tracking job applications in your inbox. Specifically, ejobtrack uses
					this data to:
				</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>Scan incoming email for job application confirmations</li>
					<li>
						Track status changes (application received, viewed, interview,
						offer, rejection)
					</li>
					<li>Build and display your personal job application dashboard</li>
					<li>
						Show email content in the timeline view when you expand an email
					</li>
				</ul>
				<p>
					Your Gmail data is <strong>never</strong> used for advertising, never
					sold, never shared with third parties, and never used to train AI or
					machine learning models.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Data Protection Mechanisms</h2>
				<p>
					ejobtrack applies the following protections to your Google user data:
				</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>
						<strong>No backend server.</strong> ejobtrack has no server
						component. Your email data is never transmitted to or stored on any
						server owned or operated by ejobtrack.
					</li>
					<li>
						<strong>Encryption in transit.</strong> All communication with
						Google services uses HTTPS/TLS. The app itself is served over HTTPS.
					</li>
					<li>
						<strong>Local-only storage.</strong> Retrieved emails are stored
						only in your browser's IndexedDB, isolated per Google account, and
						never leave your device.
					</li>
					<li>
						<strong>On-device processing.</strong> Email classification runs an
						ML model entirely in your browser; no email content is sent to
						external AI services.
					</li>
					<li>
						<strong>Anonymized analytics.</strong> If analytics are enabled,
						email addresses are SHA-256 hashed before transmission to PostHog;
						no email content is included.
					</li>
					<li>
						<strong>Revocation.</strong> You can revoke ejobtrack's access at
						any time from your Google Account security settings, or by signing
						out in the app.
					</li>
				</ul>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Google Limited Use Disclosure</h2>
				<p>
					ejobtrack's use and transfer of information received from Google APIs
					will adhere to the{" "}
					<a
						href="https://developers.google.com/terms/api-services-user-data-policy"
						className="text-primary hover:underline"
						target="_blank"
						rel="noreferrer"
					>
						Google API Services User Data Policy
					</a>
					, including the Limited Use requirements. Your data is used only to
					provide and improve the features described in this policy, is never
					transferred to any third party, and is never used for advertising or
					other unrelated purposes.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Gmail Access</h2>
				<p>
					With your explicit consent, ejobtrack requests read-only access to
					your Gmail inbox to scan for job application emails. This access is
					used solely to:
				</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>Identify and parse job application confirmation emails</li>
					<li>
						Track status changes (application received, viewed, interview,
						offer, rejection)
					</li>
					<li>Display a dashboard of your job applications</li>
				</ul>
				<p>
					Full email bodies are fetched only when you expand an email in the
					timeline view. No email content is sent to any external service.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">On-Device AI</h2>
				<p>
					Email classification uses a transformer ML model that runs entirely in
					your browser. No email data is sent to external AI services or APIs.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Analytics</h2>
				<p>
					ejobtrack uses PostHog for anonymous usage analytics (page views,
					feature usage). All identifying information (email addresses) is
					SHA-256 hashed before transmission. You can opt out by removing the
					VITE_POSTHOG_KEY environment variable.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Third-Party Services</h2>
				<p>The only external services ejobtrack communicates with are:</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>
						<strong>Google Gmail API</strong> -- for reading email metadata
						(read-only scope)
					</li>
					<li>
						<strong>Google Identity Services</strong> -- for authentication
					</li>
					<li>
						<strong>PostHog</strong> -- anonymized analytics (optional)
					</li>
				</ul>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Data Deletion</h2>
				<p>
					Since all data is stored locally in your browser's IndexedDB, you can
					delete it at any time by clearing your browser data for this site. No
					data exists on any server to request deletion from.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Contact</h2>
				<p>
					For questions about this privacy policy, open an issue on the
					<a
						href="https://github.com/Ralph-Abejuela/ejobtrack"
						className="text-primary hover:underline"
					>
						{" "}
						GitHub repository
					</a>
					.
				</p>
			</section>
		</div>
	);
}
