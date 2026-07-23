import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/** Google "G" logo icon — Google's pre-approved branding asset. */
function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 40 40"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M20 0.5C30.7696 0.5 39.5 9.23045 39.5 20C39.5 30.7696 30.7696 39.5 20 39.5C9.23045 39.5 0.5 30.7696 0.5 20C0.5 9.23045 9.23045 0.5 20 0.5Z"
				fill="white"
			/>
			<path
				d="M20 0.5C30.7696 0.5 39.5 9.23045 39.5 20C39.5 30.7696 30.7696 39.5 20 39.5C9.23045 39.5 0.5 30.7696 0.5 20C0.5 9.23045 9.23045 0.5 20 0.5Z"
				stroke="#747775"
				strokeWidth="1"
			/>
			<path
				d="M29.3987 18.1814H19.9849V22.0445H25.3598C25.1286 23.294 24.4294 24.3596 23.3676 25.0712C22.4746 25.6716 21.3266 26.0211 19.9849 26.0211C17.3864 26.0211 15.1823 24.2666 14.3947 21.9004C14.1952 21.2989 14.0853 20.6599 14.0853 19.9983C14.0853 19.3367 14.1952 18.6966 14.3947 18.0962C15.1823 15.7311 17.3864 13.9755 19.9849 13.9755C21.4524 13.9755 22.767 14.4816 23.8039 15.4713L26.6653 12.6057C24.936 10.9908 22.6786 10 19.9849 10C16.0832 10 12.705 12.2414 11.0618 15.5076C10.383 16.8592 10 18.3834 10 19.9994C10 21.6155 10.383 23.1396 11.0618 24.4913C12.705 27.7597 16.0832 30 19.9849 30C22.6797 30 24.9485 29.1137 26.6018 27.5861C28.4887 25.8452 29.5732 23.2702 29.5732 20.2275C29.5732 19.5182 29.5131 18.835 29.3987 18.1825V18.1814Z"
				fill="#4285F4"
			/>
		</svg>
	);
}

/**
 * Google-branded sign-in button using pre-approved assets.
 * Follows Google Identity Services branding guidelines:
 * - Light: #FFFFFF fill, #747775 stroke, #1F1F1F text
 * - Dark:  #131314 fill, #8E918F stroke, #E3E3E3 text
 * - Font: Google Sans Medium, 14/20
 */
export default function GoogleSignInButton() {
	const { loading, signIn } = useAuth();

	return (
		<Button
			onClick={signIn}
			disabled={loading}
			className={
				"gap-2.5 h-auto px-6 py-[10px] " +
				"bg-white text-[#1F1F1F] " +
				"border border-[#747775] " +
				"font-['Google_Sans',system-ui,sans-serif] font-medium " +
				"text-sm leading-5 " +
				"hover:bg-[#F8F8F8] hover:text-[#1F1F1F] " +
				"dark:bg-[#131314] dark:text-[#E3E3E3] dark:border-[#8E918F] " +
				"dark:hover:bg-[#1A1A1A] dark:hover:text-[#E3E3E3] " +
				"shadow-none"
			}
		>
			{loading ? (
				<Loader2 className="size-5 animate-spin" />
			) : (
				<GoogleIcon className="size-5 shrink-0" />
			)}
			{loading ? "Signing in…" : "Sign in with Google"}
		</Button>
	);
}
