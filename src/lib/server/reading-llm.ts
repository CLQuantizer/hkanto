import { z } from 'zod';
import type { BaseLang } from '$lib/reading';
import { DEFAULT_WORKERS_AI_MODEL, FALLBACK_WORKERS_AI_MODEL } from '$lib/server/cantonese';

const TranslationResponse = z.object({ translation: z.string().trim().min(1) });
const JSON_SCHEMA = {
	type: 'object',
	properties: { translation: { type: 'string' } },
	required: ['translation']
} as const;

const LANGUAGE_NAMES: Record<BaseLang, string> = {
	en: 'English', fr: 'French', it: 'Italian', zhcn: 'Simplified Chinese',
	zhtw: 'Traditional Standard Written Chinese', es: 'Spanish', de: 'German'
};

function decodeResponse(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	const value = record.response ?? (Array.isArray(record.choices)
		? (record.choices[0] as { message?: { content?: unknown } })?.message?.content : null);
	if (typeof value === 'string') {
		try { return JSON.parse(value); } catch { return null; }
	}
	return value;
}

export async function translateReadingSentence(ai: Ai, model: string | undefined, fallbackModel: string | undefined, sentence: string, language: BaseLang) {
	let lastError: unknown;
	for (const candidate of new Set([model || DEFAULT_WORKERS_AI_MODEL, fallbackModel || FALLBACK_WORKERS_AI_MODEL])) {
		try { return await translateWithModel(ai, candidate, sentence, language); }
		catch (error) { lastError = error; console.warn('reading_translation_model_failed', { model: candidate, error: String(error) }); }
	}
	throw lastError ?? new Error('No Workers AI model is configured.');
}

async function translateWithModel(ai: Ai, model: string, sentence: string, language: BaseLang) {
	const result = await ai.run(model as keyof AiModels, {
		messages: [
			{ role: 'system', content: `/no_think Translate this Cantonese sentence into ${LANGUAGE_NAMES[language]}. Preserve its meaning, tone, slang and explicit content faithfully. Return only JSON with one translation field. Do not add explanation.` },
			{ role: 'user', content: sentence }
		],
		response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
		max_tokens: 1200,
		temperature: 0.2,
		...({ reasoning_effort: model === FALLBACK_WORKERS_AI_MODEL ? 'low' : 'none' } as Record<string, unknown>)
	});
	const parsed = TranslationResponse.safeParse(decodeResponse(result));
	if (!parsed.success) throw new Error('Invalid reading translation from Workers AI.');
	return parsed.data.translation;
}
