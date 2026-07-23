import { Link } from "@tanstack/react-router";
import { siGithub } from "simple-icons";

export default function Footer() {
	return (
		<footer className="border-t py-4 text-center text-xs text-muted-foreground">
			<div className="flex items-center justify-center gap-4">
				<Link to="/privacy" className="hover:underline">
					Privacy Policy
				</Link>
				<Link to="/terms" className="hover:underline">
					Terms of Service
				</Link>
				<a
					href="https://github.com/Ralph-Abejuela/ejobtrack"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:underline flex items-center gap-1"
				>
					<svg
						viewBox="0 0 24 24"
						className="size-3.5 fill-current"
						aria-hidden="true"
					>
						<path d={siGithub.path} />
					</svg>
					GitHub
				</a>
			</div>
		</footer>
	);
}
