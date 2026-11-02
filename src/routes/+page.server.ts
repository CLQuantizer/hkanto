import { listReadingArticles } from '$lib/server/reading';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.HK_DB;
	return { articles: db ? await listReadingArticles(db, 4) : [] };
};
