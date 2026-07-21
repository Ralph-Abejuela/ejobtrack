import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { LogOut, User } from "lucide-react";

export default function Header() {
	const { user, signOut } = useAuth();

	return (
		<header className="flex items-center justify-between border-b px-4 py-3">
			<div className="flex items-center gap-4">
				<Link to="/" className="text-lg font-bold tracking-tight">
					ejobtrack
				</Link>
			</div>

			<div className="flex items-center gap-3">
				{user ? (
					<>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<User className="size-4" />
							<span className="hidden sm:inline">{user.email}</span>
						</div>
						<button
							onClick={signOut}
							className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
						>
							<LogOut className="size-4" />
							<span className="hidden sm:inline">Sign out</span>
						</button>
					</>
				) : (
					<GoogleSignInButton />
				)}
			</div>
		</header>
	);
}
