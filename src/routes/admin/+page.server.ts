import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE, createAdminSession } from '$lib/server/admin-auth';
import { passwordsMatch } from '$lib/server/gems-auth';
import { invalidJyutpingSyllables, jyutpingToYale } from '$lib/romanization';
import type { Actions, PageServerLoad } from './$types';

const MAX_ROMANIZATION_LENGTH = 4000;
const SENTENCE_ID = /^[a-f0-9]{64}$/;

interface SentenceReport { romanization: 'jyutping' | 'yale'; note: string | null; created_at: string }

interface AdminSentenceRow {
	id: string;
	cantonese: string;
	jyutping: string | null;
	yale: string | null;
	annotation_model: string | null;
	articles: string | null;
	reports: string;
}

export interface AdminSentence extends Omit<AdminSentenceRow, 'articles' | 'reports'> {
	articles: string[];
	reports: SentenceReport[];
}

const SENTENCE_COLUMNS = `s.id, s.cantonese, s.jyutping, s.yale, s.annotation_model,
	(SELECT group_concat(DISTINCT o.article_slug) FROM reading_article_sentences o WHERE o.sentence_id = s.id) AS articles`;

function toSentence(row: AdminSentenceRow): AdminSentence {
	return {
		...row,
		articles: row.articles ? row.articles.split(',') : [],
		reports: (JSON.parse(row.reports) as (SentenceReport | null)[]).filter((report): report is SentenceReport => Boolean(report))
	};
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (!locals.isAdmin) return { authenticated: false as const, query };
	const db = platform!.env.HK_DB;
	const [reported, found, stats] = await Promise.all([
		db.prepare(
			`SELECT ${SENTENCE_COLUMNS},
			        json_group_array(json_object('romanization', r.romanization, 'note', r.note, 'created_at', r.created_at)) AS reports
			 FROM reading_sentence_reports r JOIN reading_sentences s ON s.id = r.sentence_id
			 WHERE r.resolved_at IS NULL
			 GROUP BY s.id ORDER BY MAX(r.created_at) DESC LIMIT 100`
		).all<AdminSentenceRow>(),
		query
			? db.prepare(
				`SELECT ${SENTENCE_COLUMNS}, '[]' AS reports FROM reading_sentences s
				 WHERE instr(s.cantonese, ?1) > 0 OR instr(lower(s.jyutping), lower(?1)) > 0 OR instr(lower(s.yale), lower(?1)) > 0
				 ORDER BY s.cantonese LIMIT 50`
			).bind(query).all<AdminSentenceRow>()
			: Promise.resolve({ results: [] as AdminSentenceRow[] }),
		db.prepare(
			`SELECT (SELECT COUNT(*) FROM reading_sentences) AS sentences,
			        (SELECT COUNT(*) FROM reading_sentences WHERE annotation_model = 'admin') AS edited,
			        (SELECT COUNT(*) FROM reading_sentence_reports WHERE resolved_at IS NULL) AS open_reports`
		).first<{ sentences: number; edited: number; open_reports: number }>()
	]);
	return {
		authenticated: true as const,
		query,
		reported: reported.results.map(toSentence),
		found: found.results.map(toSentence),
		stats: stats ?? { sentences: 0, edited: 0, open_reports: 0 }
	};
};

export const actions: Actions = {
	login: async ({ request, cookies, platform }) => {
		const password = (await request.formData()).get('password');
		const expected = platform?.env.ADMIN_PASSWORD;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		if (typeof password !== 'string' || !expected || !secret) {
			return fail(400, { loginError: 'Admin sign-in is not configured.' });
		}
		if (!(await passwordsMatch(password, expected, secret))) {
			return fail(401, { loginError: 'Incorrect password.' });
		}
		cookies.set(ADMIN_COOKIE, await createAdminSession(secret), {
			path: '/', httpOnly: true, secure: !dev, sameSite: 'strict', maxAge: ADMIN_SESSION_MAX_AGE
		});
		redirect(303, '/admin');
	},

	logout: async ({ cookies }) => {
		cookies.delete(ADMIN_COOKIE, { path: '/' });
		redirect(303, '/admin');
	},

	save: async ({ request, locals, platform }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Please sign in again.' });
		const form = await request.formData();
		const id = form.get('id');
		const rawJyutping = form.get('jyutping');
		if (typeof id !== 'string' || !SENTENCE_ID.test(id)) return fail(400, { error: 'Invalid sentence.' });
		if (typeof rawJyutping !== 'string' || !rawJyutping.trim() || rawJyutping.length > MAX_ROMANIZATION_LENGTH) {
			return fail(400, { error: 'Jyutping is required.', id });
		}
		const jyutping = rawJyutping.trim().replace(/\s+/g, ' ');
		const invalid = invalidJyutpingSyllables(jyutping);
		if (invalid.length) return fail(400, { error: `Not valid Jyutping: ${invalid.join(', ')}`, id });
		// Yale is always derived from Jyutping so the two systems cannot disagree.
		const yale = jyutpingToYale(jyutping);
		const db = platform!.env.HK_DB;
		await db.batch([
			db.prepare(
				`UPDATE reading_sentences SET jyutping = ?2, yale = ?3, annotation_model = 'admin',
				 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1`
			).bind(id, jyutping, yale),
			db.prepare(
				`UPDATE reading_sentence_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
				 WHERE sentence_id = ?1 AND resolved_at IS NULL`
			).bind(id)
		]);
		return { saved: id };
	},

	dismiss: async ({ request, locals, platform }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Please sign in again.' });
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || !SENTENCE_ID.test(id)) return fail(400, { error: 'Invalid sentence.' });
		await platform!.env.HK_DB.prepare(
			`UPDATE reading_sentence_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE sentence_id = ?1 AND resolved_at IS NULL`
		).bind(id).run();
		return { dismissed: id };
	}
};
