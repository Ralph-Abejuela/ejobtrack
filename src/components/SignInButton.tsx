import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

/**
 * Shadcn-styled "Get started" button.
 * Navigates to /jobs which triggers Google sign-in if not authenticated.
 */
export default function SignInButton() {
	const navigate = useNavigate();

	return (
		<Button
			size="lg"
			onClick={() => navigate({ to: "/jobs" })}
			className="gap-2 text-base"
		>
			<LogIn className="size-5" />
			Get started
		</Button>
	);
}
