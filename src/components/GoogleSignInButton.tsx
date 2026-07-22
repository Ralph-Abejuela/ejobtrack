import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Google Sign-In button rendered via GSI library.
 * Uses FedCM (use_fedcm_for_button: true) for credential persistence.
 */
export default function GoogleSignInButton() {
	const buttonRef = useRef<HTMLDivElement>(null);
	const renderedRef = useRef(false);
	const { user, gsiReady } = useAuth();

	useEffect(() => {
		// Don't render if already signed in, already rendered, or GSI not ready
		if (user || renderedRef.current || !gsiReady) return;

		const render = () => {
			if (
				typeof google === "undefined" ||
				!google.accounts?.id ||
				!buttonRef.current
			)
				return;
			renderedRef.current = true;
			google.accounts.id.renderButton(buttonRef.current, {
				type: "standard",
				theme: "outline",
				size: "large",
				text: "signin_with",
				shape: "rectangular",
				width: 250,
			});
		};

		// Small delay to ensure DOM is ready
		const id = setTimeout(render, 50);
		return () => clearTimeout(id);
	}, [user, gsiReady]);

	return <div ref={buttonRef} className="min-h-10" />;
}
