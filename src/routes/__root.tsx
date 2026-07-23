import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GmailAuthModal from "@/components/GmailAuthModal";
import { Toaster } from "@/components/ui/sonner";

function RootLayout() {
	return (
		<AuthProvider>
			<div className="flex min-h-dvh flex-col">
				<Header />
				<main className="relative flex flex-1 flex-col grid-pattern">
					<Outlet />
				</main>
				<Footer />
			</div>
			<GmailAuthModal />
			<Toaster closeButton />
		</AuthProvider>
	);
}

export const Route = createRootRoute({ component: RootLayout });
