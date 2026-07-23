import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { defaultJobsSearchData } from "@/routes/jobs";

/**
 * Shadcn-styled "Get started" button.
 * Navigates to /jobs which triggers Google sign-in if not authenticated.
 */
export default function SignInButton() {
	const navigate = useNavigate();

	return (
		<Button
			size="lg"
			onClick={() =>
				navigate({
					to: "/jobs",
					search: (prev) => ({...defaultJobsSearchData, ...prev}),
				})
			}
			className="gap-2 text-base"
		>
			<LogIn className="size-5" />
			Get started
		</Button>
	);
}
