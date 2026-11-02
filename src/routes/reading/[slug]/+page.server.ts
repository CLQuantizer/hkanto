import { error } from '@sveltejs/kit';
import { getArticleLikes, getReadingArticle } from '$lib/server/reading';
import { likerId } from '$lib/server/likes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, locals, cookies, url }) => {
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const reading = await getReadingArticle(db, params.slug);
	if (!reading) error(404, 'Article not found.');
	const likes = await getArticleLikes(db, params.slug, likerId(locals.passkeyUserId, cookies, false, url.protocol === 'https:'));
	return { ...reading, likes };
};
