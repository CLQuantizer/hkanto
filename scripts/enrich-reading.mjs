import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readArticles } from './reading-data.mjs';
import { invalidJyutpingSyllables, jyutpingToYale } from '../src/lib/romanization.ts';

// Usage: node scripts/enrich-reading.mjs [--review]
// Without --review, only sentences without Jyutping are romanized.
// With --review, every model-generated sentence is checked again and proposed changes go to data/reading-review.json.
const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'data/reading-annotations.json');
const REVIEW_OUTPUT = resolve(ROOT, 'data/reading-review.json');
const MODELS = ['@cf/deepseek-ai/deepseek-v4.1-flash-1017', '@cf/zai-org/glm-5.3-flash'];
const REVIEW = process.argv.includes('--review');
const CONCURRENCY = 6;

const SYSTEM_PROMPT = `You write Jyutping for Hong Kong Cantonese text taken from internet posts (潮文). Romanize how a native Hong Kong speaker reads the sentence aloud.
Rules:
- Exactly one toned Jyutping syllable (tone 1-6) for every Chinese character, in order. Never skip, merge or add characters.
- Writers often use homophones and nonstandard characters. Romanize the intended spoken word, for example: 既 or GE meaning 嘅 → ge3; 果 meaning 嗰 (果個, 果度, 果批) → go2; D or d meaning 啲 → di1; 0架 → gaa3; 甘 meaning 咁 → gam3.
- 咁 is gam3 for degree (咁多, 咁靚) and gam2 for manner or "so then" (咁樣, 咁就, 咁我).
- Prefer colloquial readings where speakers use them (核突 wat6 dat6, 傾偈 king1 gai2). Use literary readings in literary words.
- Standard written Chinese passages are read aloud in Cantonese, character by character.
- Romanize profanity and slang as spoken (屌 diu2, 撚 lan2, 鳩 gau1, 柒 cat6). Do not censor or rewrite.
- Keep English words, numbers and punctuation exactly as written. Separate syllables with spaces.
- Use standard LSHK Jyutping spelling (eo/oe, jyu, z/c/s initials).
Return only JSON: {"jyutping": "..."}`;

const articles = await readArticles();
const sentences = [...new Map(articles.flatMap((article) => article.occurrences).map((item) => [item.id, item])).values()];
const saved = JSON.parse(await readFile(OUTPUT, 'utf8').catch(() => '{}'));
const review = REVIEW ? JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8').catch(() => '{}')) : {};
// Hand corrections are marked 'admin' and are never regenerated or reviewed.
const pending = sentences.filter((sentence) => {
	const entry = saved[sentence.id];
	if (entry?.model === 'admin') return false;
	if (REVIEW) return entry?.jyutping && !review[sentence.id];
	return !entry?.jyutping;
});
console.log(`${sentences.length} unique sentences; ${pending.length} to ${REVIEW ? 'review' : 'romanize'}.`);

const HAN = /\p{Script=Han}/gu;

// Each Han character is one syllable; a Latin token like D or GE may also be read as one.
function checkSyllables(cantonese, jyutping) {
	const invalid = invalidJyutpingSyllables(jyutping);
	if (invalid.length) return `invalid syllables: ${invalid.join(' ')}`;
	const han = cantonese.match(HAN)?.length ?? 0;
	const latin = cantonese.match(/[A-Za-z]+/g)?.length ?? 0;
	const toned = jyutping.match(/[A-Za-z]+[1-6]/g)?.length ?? 0;
	if (toned < han || toned > han + latin) return `expected ${han} syllables, got ${toned}`;
	return null;
}

function extract(raw, sentence) {
	const result = JSON.parse(raw);
	const value = result.response ?? result.choices?.[0]?.message?.content;
	const parsed = typeof value === 'string' ? JSON.parse(value.trim()) : value;
	const jyutping = typeof parsed?.jyutping === 'string' ? parsed.jyutping.trim().replace(/\s+/g, ' ') : '';
	if (!jyutping || /\p{Script=Han}/u.test(jyutping)) throw new Error('Model returned invalid Jyutping.');
	const problem = checkSyllables(sentence.cantonese, jyutping);
	if (problem) throw new Error(problem);
	return jyutping;
}

async function romanize(sentence, draft) {
	const request = {
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: draft
				? `Sentence: ${sentence.cantonese}\nDraft Jyutping, which may contain errors: ${draft}\nCheck every syllable and tone against the rules and return the corrected Jyutping.`
				: sentence.cantonese }
		],
		response_format: { type: 'json_schema', json_schema: { type: 'object', properties: { jyutping: { type: 'string' } }, required: ['jyutping'] } },
		max_tokens: 4000,
		temperature: 0.1
	};
	let lastError;
	for (const model of MODELS) {
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				const body = JSON.stringify({ ...request, reasoning_effort: 'low' });
				const { stdout } = await execFileAsync('cf', ['ai', 'run', model, '--body', body], { cwd: ROOT, maxBuffer: 4_000_000, timeout: 180_000 });
				return { jyutping: extract(stdout, sentence), model };
			} catch (error) { lastError = error; }
		}
	}
	throw new Error(`Failed ${sentence.id.slice(0, 8)} ${sentence.cantonese.slice(0, 20)}: ${lastError?.message}`);
}

let cursor = 0;
let done = 0;
let writeQueue = Promise.resolve();
const failures = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
	while (cursor < pending.length) {
		const sentence = pending[cursor++];
		try {
			const { jyutping, model } = await romanize(sentence, REVIEW ? saved[sentence.id].jyutping : null);
			if (REVIEW) review[sentence.id] = { cantonese: sentence.cantonese, before: saved[sentence.id].jyutping, after: jyutping, model };
			else saved[sentence.id] = { jyutping, yale: jyutpingToYale(jyutping), model };
		} catch (error) {
			failures.push(error.message);
			console.error(error.message);
			continue;
		}
		writeQueue = writeQueue.then(() => REVIEW
			? writeFile(REVIEW_OUTPUT, JSON.stringify(review, null, 2) + '\n')
			: writeFile(OUTPUT, JSON.stringify(saved, null, 2) + '\n'));
		await writeQueue;
		console.log(`${++done}/${pending.length} ${sentence.id.slice(0, 8)}`);
	}
}));
console.log(`Finished with ${failures.length} failures.`);
