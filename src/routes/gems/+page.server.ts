import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface GemSummary {
	slug: string;
	title: string;
	excerpt: string;
	updated_at: string;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const result = await db.prepare(
		`SELECT slug, title, excerpt, updated_at
		 FROM gems ORDER BY updated_at DESC, id DESC`
	).all<GemSummary>();
	return { gems: result.results };
};
