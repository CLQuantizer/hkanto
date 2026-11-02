-- Single-use links for password resets and email verification. Only a SHA-256 hash of each token is stored.
CREATE TABLE IF NOT EXISTS account_tokens (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES passkey_users(id) ON DELETE CASCADE,
	purpose TEXT NOT NULL CHECK (purpose IN ('reset_password', 'verify_email')),
	email TEXT,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_account_tokens_user_purpose
	ON account_tokens (user_id, purpose, created_at);
