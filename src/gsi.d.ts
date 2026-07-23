// Type declarations for Google Identity Services OAuth2 client library
// Loaded via <script src="https://accounts.google.com/gsi/client" async>

declare namespace google.accounts.oauth2 {
	interface GoogleOAuthError {
		type: string;
		message: string;
		stack?: string;
	}

	interface TokenClientConfig {
		client_id: string;
		scope: string;
		callback: (response: TokenResponse) => void;
		error_callback?: (error: GoogleOAuthError) => void;
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
		oauth2: typeof google.accounts.oauth2;
	};
}
