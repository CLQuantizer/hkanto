import { error, json } from '@sveltejs/kit';
import { isBaseLang } from '$lib/reading';
import { translateReadingSentence } from '$lib/server/reading-llm';
import type { RequestHandler } from './$types';

interface SentenceRow { cantonese: string; translations: string }

export const POST: RequestHandler = async ({ request, platform }) => {
	const body = await request.json().catch(() => null);
	const id = body && typeof body === 'object' ? (body as { id?: unknown }).id : null;
	const lang = body && typeof body === 'object' ? (body as { lang?: unknown }).lang : null;
	if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !isBaseLang(lang)) {
		error(400, 'Invalid sentence or language.');
	}
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');
	const row = await db.prepare('SELECT cantonese, translations FROM reading_sentences WHERE id = ?1')
		.bind(id).first<SentenceRow>();
	if (!row) error(404, 'Sentence not found.');
	const saved = JSON.parse(row.translations) as Record<string, unknown>;
	if (typeof saved[lang] === 'string' && saved[lang]) return json({ translation: saved[lang] });
	if (!platform?.env.AI) error(503, 'Translation is unavailable.');

	let translation: string;
	try {
		translation = await translateReadingSentence(platform.env.AI, platform.env.WORKERS_AI_MODEL, platform.env.WORKERS_AI_FALLBACK_MODEL, row.cantonese, lang);
	} catch (cause) {
		console.error('reading_translation_failed', cause);
		error(502, 'Could not translate this sentence. Please try again.');
	}
	await db.prepare(
		`UPDATE reading_sentences
		 SET translations = json_set(translations, ?2, ?3),
		     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE id = ?1 AND json_extract(translations, ?2) IS NULL`
	).bind(id, `$.${lang}`, translation).run();
	const latest = await db.prepare('SELECT json_extract(translations, ?2) AS translation FROM reading_sentences WHERE id = ?1')
		.bind(id, `$.${lang}`).first<{ translation: string }>();
	return json({ translation: latest?.translation ?? translation });
};
