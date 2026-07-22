import { createFileRoute } from "@tanstack/react-router";
import SignInButton from "@/components/SignInButton";

export const Route = createFileRoute("/")({
	component: HeroPage,
});

function HeroPage() {
	return (
		<div className="mx-auto max-w-xl space-y-8 py-12 text-center">
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">
					Track your job applications from Gmail
				</h1>
				<p className="text-muted-foreground">
					ejobtrack connects to your inbox and automatically builds a dashboard
					of every job application. No backend. No setup. Your data stays in
					your browser.
				</p>
			</div>

			<SignInButton />

			<div className="grid grid-cols-2 gap-3 text-left text-sm">
				<div className="rounded-lg border p-3">
					<div className="font-medium">Auto-scan inbox</div>
					<div className="text-muted-foreground">
						Detects application emails from JobStreet, LinkedIn, Indeed and more
					</div>
				</div>
				<div className="rounded-lg border p-3">
					<div className="font-medium">Status timeline</div>
					<div className="text-muted-foreground">
						Tracks every status change from applied through to offer or
						rejection
					</div>
				</div>
				<div className="rounded-lg border p-3">
					<div className="font-medium">Duplicate handling</div>
					<div className="text-muted-foreground">
						Auto-detects duplicates with merge and undo support
					</div>
				</div>
				<div className="rounded-lg border p-3">
					<div className="font-medium">On-device AI</div>
					<div className="text-muted-foreground">
						Runs a transformer ML model locally to classify emails
					</div>
				</div>
			</div>

			<div className="text-xs text-muted-foreground space-x-4">
				<a
					href="/privacy"
					className="hover:text-foreground underline underline-offset-2"
				>
					Privacy
				</a>
				<a
					href="/terms"
					className="hover:text-foreground underline underline-offset-2"
				>
					Terms
				</a>
				<a
					href="https://github.com/Ralph-Abejuela/ejobtrack"
					className="hover:text-foreground underline underline-offset-2"
				>
					GitHub
				</a>
			</div>
		</div>
	);
}
