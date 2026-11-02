CREATE TABLE passkey_users (
	id TEXT PRIMARY KEY,
	username TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE passkeys (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES passkey_users(id) ON DELETE CASCADE,
	public_key BLOB NOT NULL,
	counter INTEGER NOT NULL DEFAULT 0,
	transports TEXT NOT NULL DEFAULT '[]',
	device_type TEXT NOT NULL,
	backed_up INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	last_used_at TEXT
);

CREATE TABLE passkey_challenges (
	id TEXT PRIMARY KEY,
	challenge TEXT NOT NULL,
	type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
	origin TEXT NOT NULL,
	rp_id TEXT NOT NULL,
	user_id TEXT,
	expires_at INTEGER NOT NULL
);

CREATE INDEX idx_passkey_challenges_expires_at ON passkey_challenges (expires_at);
