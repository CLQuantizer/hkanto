import { DEFAULT_WORKERS_AI_MODEL, FALLBACK_WORKERS_AI_MODEL, type TranslationProvider } from '$lib/server/cantonese';

export function getTranslationProviders(ai: Ai | undefined, workersAiModel?: string, fallbackModel?: string): TranslationProvider[] {
	if (!ai) {
		throw new Error('Workers AI is not configured.');
	}
	return [...new Set([workersAiModel || DEFAULT_WORKERS_AI_MODEL, fallbackModel || FALLBACK_WORKERS_AI_MODEL])]
		.map((model) => ({ name: 'workers-ai', ai, model: model as keyof AiModels, api: 'workers-ai' }));
}
