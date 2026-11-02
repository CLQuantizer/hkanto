import { error, json } from '@sveltejs/kit';
import { DEFAULT_WORKERS_AI_MODEL, translateToCantoneseWithFallback } from '$lib/server/cantonese';
import { saveUserHistory } from '$lib/server/history';
import { getTranslationProviders } from '$lib/server/llm-router';
import type { RequestHandler } from './$types';

const MAX_CHARACTERS = 500;
const MAX_WORDS = 80;

function countWords(value: string): number {
	return value.match(/\S+/gu)?.length ?? 0;
}

function toJyutpingText(characters: Array<{ jyutping: string | null }>): string {
	return characters
		.map(({ jyutping }) => jyutping)
		.filter((syllable): syllable is string => Boolean(syllable))
		.join(' ');
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const workersAiModel = platform?.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;

	console.info({
		event: 'translate_request_received',
		cfCountry: platform?.cf?.country?.toUpperCase() ?? null,
		workersAiConfigured: Boolean(platform?.env.AI),
		workersAiModel
	});

	const body = await request.json().catch(() => null);
	const sentence = body && typeof body === 'object' ? (body as { sentence?: unknown }).sentence : undefined;

	if (typeof sentence !== 'string' || !sentence.trim()) {
		error(400, 'Missing "sentence" string in request body.');
	}

	const source = sentence.trim();
	if (source.length > MAX_CHARACTERS || countWords(source) > MAX_WORDS) {
		error(400, `Keep the request within ${MAX_WORDS} words and ${MAX_CHARACTERS} characters.`);
	}

	const db = platform?.env.HK_DB;
	if (!db) {
		error(500, 'HK_DB is not configured.');
	}

	try {
		const result = await translateToCantoneseWithFallback(
			getTranslationProviders(platform?.env.AI, workersAiModel, platform?.env.WORKERS_AI_FALLBACK_MODEL),
			source
		);

		console.info({
			event: 'translate_succeeded',
			provider: result.provider,
			model: result.model,
			sourceLanguage: result.sourceLanguage
		});

		if (locals.passkeyUserId) {
			try {
				await saveUserHistory(db, locals.passkeyUserId, {
					source: result.source,
					sourceLanguage: result.sourceLanguage,
					translationOne: result.translations[0].cantonese,
					translationTwo: result.translations[1].cantonese,
					jyutpingOne: toJyutpingText(result.translations[0].characters),
					jyutpingTwo: toJyutpingText(result.translations[1].characters)
				});
			} catch (err) {
				console.error({ event: 'history_save_failed', error: err instanceof Error ? err.message : String(err) });
			}
		}

		const { provider: _provider, model: _model, ...payload } = result;
		return json(payload);
	} catch (err) {
		console.error(err);
		error(502, 'Failed to generate a Cantonese translation.');
	}
};
