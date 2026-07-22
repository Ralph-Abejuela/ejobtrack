import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import GmailReader from "@/components/GmailReader";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
	const { user, loading } = useAuth();

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20 text-muted-foreground">
				<p className="text-sm">Loading…</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="space-y-2">
				<h1 className="text-2xl font-bold tracking-tight">
					{user
						? `Welcome, ${user.given_name || user.name}!`
						: "Welcome to ejobtrack"}
				</h1>
				<p className="text-muted-foreground">
					{user
						? "Signed in with Google. Your Gmail inbox is below."
						: "Sign in with Google to view and process your emails."}
				</p>
			</section>

			{user && <GmailReader />}
		</div>
	);
}
