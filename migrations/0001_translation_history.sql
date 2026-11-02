CREATE TABLE IF NOT EXISTS translation_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	english TEXT NOT NULL,
	translation_one TEXT NOT NULL,
	translation_two TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_translation_history_created_at
	ON translation_history (created_at DESC, id DESC);
