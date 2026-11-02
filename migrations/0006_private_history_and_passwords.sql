ALTER TABLE passkey_users ADD COLUMN email TEXT;
ALTER TABLE passkey_users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_users_email ON passkey_users (email);

ALTER TABLE translation_history ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_translation_history_user_created
	ON translation_history (user_id, created_at DESC, id DESC);

ALTER TABLE passkey_challenges ADD COLUMN authenticated INTEGER NOT NULL DEFAULT 0;
