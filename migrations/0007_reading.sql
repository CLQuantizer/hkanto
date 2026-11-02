CREATE TABLE IF NOT EXISTS reading_articles (
	slug TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	genre TEXT NOT NULL,
	source_path TEXT NOT NULL UNIQUE,
	content_hash TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reading_articles_genre ON reading_articles (genre, title);

CREATE TABLE IF NOT EXISTS reading_sentences (
	id TEXT PRIMARY KEY CHECK (length(id) = 64),
	cantonese TEXT NOT NULL,
	jyutping TEXT,
	yale TEXT,
	translations TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(translations)),
	annotation_model TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reading_article_sentences (
	article_slug TEXT NOT NULL REFERENCES reading_articles(slug) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	paragraph_index INTEGER NOT NULL,
	sentence_id TEXT NOT NULL REFERENCES reading_sentences(id),
	PRIMARY KEY (article_slug, position)
);

CREATE INDEX IF NOT EXISTS idx_reading_article_sentences_sentence
	ON reading_article_sentences (sentence_id);
