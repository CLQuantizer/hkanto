CREATE TABLE IF NOT EXISTS reading_sentence_reports (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sentence_id TEXT NOT NULL REFERENCES reading_sentences(id),
	article_slug TEXT,
	romanization TEXT NOT NULL CHECK (romanization IN ('jyutping', 'yale')),
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reading_sentence_reports_open
	ON reading_sentence_reports (resolved_at, sentence_id);
