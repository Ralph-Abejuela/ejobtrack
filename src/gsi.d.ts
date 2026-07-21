// Type declarations for Google Identity Services (GSI) client library
// Loaded via <script src="https://accounts.google.com/gsi/client" async>

declare namespace google.accounts.id {
	interface IdConfiguration {
		client_id: string;
		auto_select?: boolean;
		callback: (response: CredentialResponse) => void;
		cancel_on_tap_outside?: boolean;
		prompt_parent_id?: string;
		nonce?: string;
		context?: "signin" | "signup" | "use";
		state_cookie_domain?: string;
		ux_mode?: "popup" | "redirect";
		allowed_parent_origin?: string | string[];
		intermediate_iframe_close_callback?: () => void;
		itp_support?: boolean;
		login_hint?: string;
		hd?: string;
		use_fedcm_for_button?: boolean;
		button_auto_select?: boolean;
	}

	interface CredentialResponse {
		credential: string;
		select_by: string;
		state?: string;
	}

	interface PromptMomentNotification {
		isDisplayMoment(): boolean;
		isDisplayed(): boolean;
		isNotDisplayed(): boolean;
		getNotDisplayedReason(): string;
		isSkippedMoment(): boolean;
		getSkippedReason(): string;
		isDismissedMoment(): boolean;
		getDismissedReason(): string;
		getMomentType(): string;
	}

	interface GsiButtonConfiguration {
		type?: "standard" | "icon";
		theme?: "outline" | "filled_blue" | "filled_black";
		size?: "small" | "medium" | "large";
		text?: "signin_with" | "signup_with" | "continue_with" | "signin";
		shape?: "rectangular" | "pill" | "circle" | "square";
		logo_alignment?: "left" | "center";
		width?: number;
		locale?: string;
		click_listener?: () => void;
		state?: string;
	}

	function initialize(config: IdConfiguration): void;
	function prompt(
		momentListener?: (notification: PromptMomentNotification) => void,
	): void;
	function renderButton(
		parent: HTMLElement,
		options: GsiButtonConfiguration,
	): void;
	function disableAutoSelect(): void;
	function revoke(idToken: string, done: () => void): void;
	function storeCredential(credential: string, callback: () => void): void;
	function cancel(): void;
	function onGoogleLibraryLoad(): void;
}

declare namespace google.accounts.oauth2 {
	interface TokenClientConfig {
		client_id: string;
		scope: string;
		callback: (response: TokenResponse) => void;
		include_granted_scopes?: boolean;
		enable_serial_consent?: boolean;
		prompt?: string;
		state?: string;
		login_hint?: string;
		hd?: string;
	}

	interface OverridableTokenClientConfig {
		scope?: string;
		include_granted_scopes?: boolean;
		enable_serial_consent?: boolean;
		prompt?: string;
		state?: string;
		login_hint?: string;
		hd?: string;
	}

	interface TokenClient {
		requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void;
	}

	interface TokenResponse {
		access_token: string;
		token_type: string;
		expires_in: number;
		scope: string;
		/** Only present if prompt=consent was used */
		refresh_token?: string;
	}

	function initTokenClient(config: TokenClientConfig): TokenClient;
	function hasGrantedAllScopes(
		tokenResponse: TokenResponse,
		...scopes: string[]
	): boolean;
	function hasGrantedAnyScope(
		tokenResponse: TokenResponse,
		...scopes: string[]
	): boolean;
	function revoke(
		accessToken: string,
		done: (response: {
			successful: boolean;
			error?: string;
			error_description?: string;
		}) => void,
	): void;
}

declare namespace google {
	const accounts: {
		id: typeof google.accounts.id;
		oauth2: typeof google.accounts.oauth2;
	};
}
