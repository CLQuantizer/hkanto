import { error, json } from '@sveltejs/kit';
import { likerId } from '$lib/server/likes';
import { getArticleLikes } from '$lib/server/reading';
import type { RequestHandler } from './$types';

// Toggles the reader's like, so each reader counts at most once per article.
export const POST: RequestHandler = async ({ request, platform, locals, cookies, url }) => {
	const body = (await request.json().catch(() => null)) as { slug?: unknown; liked?: unknown } | null;
	const slug = body?.slug;
	if (typeof slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(slug) || typeof body?.liked !== 'boolean') {
		error(400, 'Invalid like.');
	}
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const exists = await db.prepare('SELECT 1 FROM reading_articles WHERE slug = ?1').bind(slug).first();
	if (!exists) error(404, 'Article not found.');
	const liker = likerId(locals.passkeyUserId, cookies, true, url.protocol === 'https:')!;
	await db.prepare(body.liked
		? 'INSERT OR IGNORE INTO reading_article_likes (article_slug, liker_id) VALUES (?1, ?2)'
		: 'DELETE FROM reading_article_likes WHERE article_slug = ?1 AND liker_id = ?2'
	).bind(slug, liker).run();
	return json(await getArticleLikes(db, slug, liker));
};
