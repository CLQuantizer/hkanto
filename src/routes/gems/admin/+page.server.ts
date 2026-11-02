import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	createSessionToken,
	passwordsMatch
} from '$lib/server/gems-auth';
import { excerptFromMarkdown, slugify, titleFromMarkdown } from '$lib/server/markdown';
import type { Actions, PageServerLoad } from './$types';

const MAX_MARKDOWN_SIZE = 256 * 1024;

interface AdminGem {
	id: number;
	slug: string;
	title: string;
	updated_at: string;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.isGemsAdmin) return { authenticated: false, gems: [] as AdminGem[] };
	const result = await platform!.env.HK_DB.prepare(
		'SELECT id, slug, title, updated_at FROM gems ORDER BY updated_at DESC, id DESC'
	).all<AdminGem>();
	return { authenticated: true, gems: result.results };
};

export const actions: Actions = {
	login: async ({ request, cookies, platform }) => {
		const form = await request.formData();
		const password = form.get('password');
		const expected = platform?.env.GEMS_ADMIN_PASSWORD;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		if (typeof password !== 'string' || !expected || !secret) {
			return fail(400, { loginError: 'Admin authentication is not configured.' });
		}
		if (!(await passwordsMatch(password, expected, secret))) {
			return fail(401, { loginError: 'Incorrect password.' });
		}
		cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
			path: '/', httpOnly: true, secure: !dev, sameSite: 'strict', maxAge: SESSION_MAX_AGE
		});
		redirect(303, '/gems/admin');
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/gems/admin');
	},

	upload: async ({ request, locals, platform }) => {
		if (!locals.isGemsAdmin) return fail(401, { uploadError: 'Please sign in again.' });
		const form = await request.formData();
		const file = form.get('article');
		const customSlug = form.get('slug');
		if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.md')) {
			return fail(400, { uploadError: 'Choose a Markdown (.md) file.' });
		}
		if (file.size === 0 || file.size > MAX_MARKDOWN_SIZE) {
			return fail(400, { uploadError: 'Markdown files must be between 1 byte and 256 KB.' });
		}
		const markdown = await file.text();
		const fallbackTitle = file.name.replace(/\.md$/i, '').replaceAll(/[-_]+/g, ' ');
		const title = titleFromMarkdown(markdown, fallbackTitle);
		const slug = slugify(typeof customSlug === 'string' && customSlug.trim() ? customSlug : title);
		await platform!.env.HK_DB.prepare(
			`INSERT INTO gems (slug, title, excerpt, markdown)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT(slug) DO UPDATE SET
				title = excluded.title,
				excerpt = excluded.excerpt,
				markdown = excluded.markdown,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		).bind(slug, title, excerptFromMarkdown(markdown), markdown).run();
		redirect(303, '/gems/admin?uploaded=1');
	},

	delete: async ({ request, locals, platform }) => {
		if (!locals.isGemsAdmin) return fail(401, { deleteError: 'Please sign in again.' });
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { deleteError: 'Invalid article.' });
		await platform!.env.HK_DB.prepare('DELETE FROM gems WHERE id = ?1').bind(id).run();
		redirect(303, '/gems/admin');
	}
};
