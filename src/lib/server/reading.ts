import type { SentenceTranslations } from '$lib/reading';

export interface ReadingArticle {
	slug: string;
	title: string;
	genre: string;
	created_at: string;
	sentence_count: number;
	like_count: number;
}

export interface ReadingSentence {
	id: string;
	cantonese: string;
	jyutping: string | null;
	yale: string | null;
	paragraph_index: number;
	position: number;
	translations: SentenceTranslations;
}

interface ReadingSentenceRow extends Omit<ReadingSentence, 'translations'> {
	translations: string;
}

// Most liked first; sort_rank orders articles that have the same number of likes.
export async function listReadingArticles(db: D1Database, limit = 500): Promise<ReadingArticle[]> {
	const rows = await db.prepare(
		`SELECT a.slug, a.title, a.genre, a.created_at,
		        (SELECT COUNT(*) FROM reading_article_sentences o WHERE o.article_slug = a.slug) AS sentence_count,
		        (SELECT COUNT(*) FROM reading_article_likes l WHERE l.article_slug = a.slug) AS like_count
		 FROM reading_articles a
		 ORDER BY like_count DESC, a.sort_rank, a.created_at DESC, a.title LIMIT ?1`
	).bind(limit).all<ReadingArticle>();
	return rows.results;
}

export async function getArticleLikes(db: D1Database, slug: string, liker: string | null) {
	const row = await db.prepare(
		`SELECT (SELECT COUNT(*) FROM reading_article_likes WHERE article_slug = ?1) AS count,
		        EXISTS (SELECT 1 FROM reading_article_likes WHERE article_slug = ?1 AND liker_id = ?2) AS liked`
	).bind(slug, liker ?? '').first<{ count: number; liked: number }>();
	return { count: row?.count ?? 0, liked: Boolean(row?.liked) };
}

export async function getReadingArticle(db: D1Database, slug: string) {
	const article = await db.prepare(
		'SELECT slug, title, genre, created_at FROM reading_articles WHERE slug = ?1'
	).bind(slug).first<Omit<ReadingArticle, 'sentence_count'>>();
	if (!article) return null;
	const rows = await db.prepare(
		`SELECT s.id, s.cantonese, s.jyutping, s.yale, s.translations,
		        o.paragraph_index, o.position
		 FROM reading_article_sentences o JOIN reading_sentences s ON s.id = o.sentence_id
		 WHERE o.article_slug = ?1 ORDER BY o.position`
	).bind(slug).all<ReadingSentenceRow>();
	return {
		article,
		sentences: rows.results.map((row) => ({ ...row, translations: JSON.parse(row.translations) as SentenceTranslations }))
	};
}
