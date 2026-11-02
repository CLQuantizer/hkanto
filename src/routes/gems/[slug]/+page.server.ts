import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

interface GemRow {
	slug: string;
	title: string;
	markdown: string;
	updated_at: string;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const gem = await db.prepare(
		'SELECT slug, title, markdown, updated_at FROM gems WHERE slug = ?1 LIMIT 1'
	).bind(params.slug).first<GemRow>();
	if (!gem) error(404, 'Article not found.');
	return { gem: { ...gem, html: await renderMarkdown(gem.markdown) } };
};
