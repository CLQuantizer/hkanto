import { error } from '@sveltejs/kit';
import { listReadingArticles } from '$lib/server/reading';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	return { articles: await listReadingArticles(db) };
};
