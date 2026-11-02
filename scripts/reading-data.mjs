import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
export const ARTICLES = [
	{ slug: 'fei-po-sik-jung-faat', filename: '肥婆食用法.md', genre: 'Chiuman' },
	{ slug: 'investing-5000', rank: 3, filename: '得四五千如何投資好？.md', genre: 'Chiuman' },
	{ slug: 'ceoi-syu', rank: 1, filename: '徐庶.md', genre: 'Chiuman' },
	{ slug: 'jan-zi-to', filename: '人字拖.md', genre: 'Chiuman' },
	{ slug: 'bou-ging', filename: '報警.md', genre: 'Chiuman' },
	{ slug: 'ling-naam-ciu-man', filename: '嶺南潮文.md', genre: 'Chiuman' },
	{ slug: 'ngo-wui-zou-hou-ni-fan-gung', filename: '我會做好呢份工.md', genre: 'Chiuman' },
	{ slug: 'jat-bun-saam-gwan-haak-ciu-man', filename: '日本三棍客潮文.md', genre: 'Chiuman' },
	{ slug: 'gik-cuk-cyun-syut', rank: 2, filename: '極速傳說.md', genre: 'Chiuman' },
	{ slug: 'fei-si-jyun-zeoi', filename: '肥是原罪.md', genre: 'Chiuman' },
	{ slug: 'ho-laan-saam-gwan-haak-ciu-man', filename: '荷蘭三棍客潮文.md', genre: 'Chiuman' },
	{ slug: 'sai-baak-lei-aa-ciu-man', filename: '西伯利亞潮文.md', genre: 'Chiuman' },
	{ slug: 'diu-jyu', filename: '釣魚.md', genre: 'Chiuman' },
	{ slug: 'android', filename: 'Android.md', genre: 'Chiuman' },
	{ slug: 'come-on-james', filename: 'Come on James.md', genre: 'Chiuman' },
	{ slug: 'zeoi-jau-jing-hoeng-lik-dik-jan', filename: '最有影響力的人.md', genre: 'Chiuman' }
];

export function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

export async function readArticles() {
	return Promise.all(ARTICLES.map(async (item) => {
		const sourcePath = `data/chiuman/${item.filename}`;
		const markdown = await readFile(resolve(ROOT, sourcePath), 'utf8');
		const paragraphs = markdown.trim().split(/\n\s*\n/u).filter(Boolean);
		const occurrences = [];
		let position = 0;
		for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
			// Each line ends a sentence. Sentence-final punctuation, ellipses and closing quotes stay with their sentence.
			const sentences = paragraph.split('\n').flatMap((line) =>
				line.match(/[^。！？!?…]+(?:[。！？!?…]+[」』”’）)]*)+|[^。！？!?…]+$/gu) ?? []
			).map((part) => part.trim()).filter(Boolean)
				// A quote ending in ！ or ？ can be followed by a comma that continues the same sentence.
				.reduce((merged, part) => {
					if (merged.length && /^[，、；：,]/u.test(part)) merged[merged.length - 1] += part;
					else merged.push(part);
					return merged;
				}, []);
			if (sentences.join('').replace(/\s/gu, '') !== paragraph.replace(/\s/gu, '')) {
				throw new Error(`Sentence split lost text in ${sourcePath}, paragraph ${paragraphIndex + 1}`);
			}
			for (const cantonese of sentences) {
				const id = digest(`yue-Hant:v1\n${cantonese.normalize('NFC')}`);
				occurrences.push({ id, cantonese, paragraphIndex, position: position++ });
			}
		}
		return { ...item, sourcePath, title: item.filename.slice(0, -3), contentHash: digest(markdown), occurrences };
	}));
}
