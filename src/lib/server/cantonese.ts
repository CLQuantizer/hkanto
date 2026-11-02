import ToJyutping from 'to-jyutping';
import { z } from 'zod';

export const DEFAULT_WORKERS_AI_MODEL = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';
export const FALLBACK_WORKERS_AI_MODEL = '@cf/zai-org/glm-5.3-flash';

export type ProviderName = 'workers-ai';

export type TranslationProvider = {
	name: 'workers-ai';
	api: 'workers-ai';
	ai: Ai;
	model: keyof AiModels;
};

const CantoneseResponse = z.object({
	source_language: z.enum(['en', 'zh-Mandarin']),
	translations: z.array(z.string()).length(2)
});

const CANTONESE_JSON_SCHEMA = {
	type: 'object',
	properties: {
		source_language: {
			type: 'string',
			enum: ['en', 'zh-Mandarin']
		},
		translations: {
			type: 'array',
			items: { type: 'string' },
			minItems: 2,
			maxItems: 2
		}
	},
	required: ['source_language', 'translations']
} as const;

const BANNED_PHRASES = ['食屎啦你', '屈machine', '廢青', '收皮'];

const SYSTEM_PROMPT =
	'Translate the English or Mandarin Chinese sentence into spoken Hong Kong Cantonese (港式廣東話口語), in ' +
	'Traditional Chinese characters. Keep English terms that Hong Kong Cantonese speakers naturally ' +
	'use without translation, such as flat white, product names, and proper names. Keep the exact same meaning, ' +
	'nothing added or removed. Provide exactly two distinct, natural translations suitable for ' +
	'everyday conversation in Hong Kong. Prefer common spoken words over bookish ones (e.g. 冷氣 not 空調). ' +
	'Never use these phrases: ' +
	BANNED_PHRASES.join('、') +
	'. Identify whether the source is English (en) or Mandarin Chinese (zh-Mandarin).';

const FALLBACK_PROMPT =
	'You translate English or Mandarin Chinese into natural, colloquial spoken Hong Kong Cantonese (粵語口語), ' +
	'written in Traditional Chinese characters as commonly used in Hong Kong. ' +
	'Keep English terms that are naturally used as-is in everyday Hong Kong Cantonese. ' +
	'Do not translate into Standard Written Chinese or Mandarin phrasing. ' +
	'Translate every clause — do not drop or add information. ' +
	'Identify the source as en or zh-Mandarin and provide exactly two distinct translations with no explanations.';

export interface JyutpingChar {
	char: string;
	jyutping: string | null;
}

export interface CantoneseAlternative {
	cantonese: string;
	characters: JyutpingChar[];
}

export interface CantoneseTranslation {
	source: string;
	sourceLanguage: 'en' | 'zh-Mandarin';
	translations: CantoneseAlternative[];
	provider: ProviderName;
	model: string;
}

type GeneratedTranslations = {
	sourceLanguage: 'en' | 'zh-Mandarin';
	translations: string[];
};

function getPronunciationUnits(text: string): JyutpingChar[] {
	const units: JyutpingChar[] = [];
	let englishWord = '';

	function flushEnglishWord() {
		if (!englishWord) return;
		units.push({ char: englishWord, jyutping: englishWord });
		englishWord = '';
	}

	for (const [char, jyutping] of ToJyutping.getJyutpingList(text)) {
		if (/^[A-Za-z0-9]$/.test(char) || (englishWord && /^[.'&+’-]$/.test(char))) {
			englishWord += char;
			continue;
		}

		flushEnglishWord();
		units.push({ char, jyutping });
	}

	flushEnglishWord();
	return units;
}

export async function translateToCantonese(
	provider: TranslationProvider,
	source: string
): Promise<CantoneseTranslation> {
	let generated = await generateTranslations(provider, SYSTEM_PROMPT, source);

	if (!isValidResponse(generated?.translations ?? null)) {
		generated = await generateTranslations(provider, FALLBACK_PROMPT, source);
	}

	if (!generated || !isValidResponse(generated.translations)) {
		throw new Error('Failed to generate two Cantonese translations.');
	}

	const alternatives = generated.translations.map((cantonese) => ({
		cantonese,
		characters: getPronunciationUnits(cantonese)
	}));

	return {
		source,
		sourceLanguage: generated.sourceLanguage,
		translations: alternatives,
		provider: provider.name,
		model: provider.model
	};
}

export async function translateToCantoneseWithFallback(
	providers: TranslationProvider[], source: string
): Promise<CantoneseTranslation> {
	let lastError: unknown;
	for (const provider of providers) {
		try {
			return await translateToCantonese(provider, source);
		} catch (error) {
			lastError = error;
			console.warn('translate_model_failed', { model: provider.model, error: String(error) });
		}
	}
	throw lastError ?? new Error('No Workers AI provider is configured.');
}

function containsBannedPhrase(text: string): boolean {
	return BANNED_PHRASES.some((phrase) => text.includes(phrase));
}

function isValidResponse(translations: string[] | null): translations is [string, string] {
	return Boolean(
		translations &&
			translations.length === 2 &&
			translations[0] !== translations[1] &&
			translations.every((translation) => translation && !containsBannedPhrase(translation))
	);
}

function parseCantonesePayload(decoded: unknown): GeneratedTranslations | null {
	const validation = CantoneseResponse.safeParse(decoded);
	if (!validation.success) return null;

	const translations = validation.data.translations.map((item) => item.trim());
	return translations.every(Boolean)
		? { sourceLanguage: validation.data.source_language, translations }
		: null;
}

function extractWorkersAiPayload(raw: unknown): unknown {
	if (raw == null) return null;

	if (typeof raw === 'object') {
		const record = raw as Record<string, unknown>;

		if ('response' in record) {
			const response = record.response;
			if (typeof response === 'string') {
				try {
					return JSON.parse(response);
				} catch {
					return null;
				}
			}
			return response;
		}

		if (Array.isArray(record.choices)) {
			const content = (record.choices[0] as { message?: { content?: unknown } } | undefined)?.message
				?.content;
			if (typeof content === 'string') {
				try {
					return JSON.parse(content);
				} catch {
					return null;
				}
			}
			if (content && typeof content === 'object') return content;
		}

		if ('source_language' in record && 'translations' in record) {
			return record;
		}
	}

	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	return null;
}

async function generateTranslations(
	provider: TranslationProvider,
	systemPrompt: string,
	userContent: string
): Promise<GeneratedTranslations | null> {
	const result = await provider.ai.run(provider.model, {
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userContent }
		],
		response_format: {
			type: 'json_schema',
			json_schema: CANTONESE_JSON_SCHEMA
		},
		max_tokens: 1024,
		temperature: 0.4,
		...({ reasoning_effort: String(provider.model) === FALLBACK_WORKERS_AI_MODEL ? 'low' : 'none' } as Record<string, unknown>)
	});

	return parseCantonesePayload(extractWorkersAiPayload(result));
}
