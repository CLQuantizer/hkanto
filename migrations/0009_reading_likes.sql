ALTER TABLE reading_articles ADD COLUMN sort_rank INTEGER NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS reading_article_likes (
	article_slug TEXT NOT NULL REFERENCES reading_articles(slug) ON DELETE CASCADE,
	liker_id TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (article_slug, liker_id)
);
