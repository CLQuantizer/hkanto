import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_NOTE_LENGTH = 500;
const MAX_OPEN_REPORTS_PER_SENTENCE = 50;

export const POST: RequestHandler = async ({ request, platform }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const id = body?.id;
	const slug = body?.slug;
	const romanization = body?.romanization;
	const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
	if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)
		|| typeof slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(slug)
		|| (romanization !== 'jyutping' && romanization !== 'yale')) {
		error(400, 'Invalid report.');
	}
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const exists = await db.prepare('SELECT 1 FROM reading_sentences WHERE id = ?1').bind(id).first();
	if (!exists) error(404, 'Sentence not found.');
	// Cap open reports per sentence so repeated clicks cannot flood the admin queue.
	await db.prepare(
		`INSERT INTO reading_sentence_reports (sentence_id, article_slug, romanization, note)
		 SELECT ?1, ?2, ?3, ?4
		 WHERE (SELECT COUNT(*) FROM reading_sentence_reports WHERE sentence_id = ?1 AND resolved_at IS NULL) < ?5`
	).bind(id, slug, romanization, note || null, MAX_OPEN_REPORTS_PER_SENTENCE).run();
	return json({ reported: true });
};
