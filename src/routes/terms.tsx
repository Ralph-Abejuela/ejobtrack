import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
	component: TermsPage,
});

function TermsPage() {
	return (
		<div className="mx-auto max-w-2xl space-y-6 py-8">
			<Link
				to="/"
				className="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Back to ejobtrack
			</Link>

			<h1 className="text-2xl font-bold">Terms of Service</h1>
			<p className="text-sm text-muted-foreground">Last updated: July 2026</p>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">1. Acceptance</h2>
				<p>
					By using ejobtrack, you agree to these terms. If you do not agree, do
					not use the service.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">2. What ejobtrack Is</h2>
				<p>
					ejobtrack is a client-side web application that connects to your Gmail
					inbox to automatically detect and track job application emails. It has
					no backend server. All data processing and storage happens locally in
					your browser.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">3. Your Google Account</h2>
				<p>
					ejobtrack uses Google sign-in and requests read-only access to your
					Gmail inbox. You grant this access explicitly through Google's OAuth
					consent screen. You can revoke this access at any time through your
					Google Account settings.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">4. Open Source</h2>
				<p>
					ejobtrack is open source under the MIT License. The source code is
					available at
					<a
						href="https://github.com/Ralph-Abejuela/ejobtrack"
						className="text-primary hover:underline"
					>
						{" "}
						GitHub
					</a>
					. You are free to inspect, modify, and self-host the code.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">5. Disclaimer of Warranties</h2>
				<p>
					ejobtrack is provided "as is" without warranty of any kind. The email
					parsing may not catch every job application or status change. Accuracy
					depends on the format of emails from job platforms, which may change
					without notice.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">6. Limitation of Liability</h2>
				<p>
					The authors of ejobtrack are not liable for any damages arising from
					the use or inability to use this software. This includes missed job
					opportunities due to parsing errors or service unavailability.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">7. Third-Party Services</h2>
				<p>
					ejobtrack relies on Google's Gmail API and Identity Services. Your use
					of those services is governed by Google's own terms of service.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">8. Changes</h2>
				<p>
					These terms may be updated. Continued use after changes constitutes
					acceptance of the new terms.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">9. Contact</h2>
				<p>
					For questions, open an issue on the
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
