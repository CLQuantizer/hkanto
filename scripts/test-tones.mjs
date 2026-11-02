import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';
import { buildDistribution, classifyReading, parseJyutpingCsv } from './tones-distribution.mjs';

const csv = readFileSync(new URL('../data/jyutping.csv', import.meta.url), 'utf8');
const built = buildDistribution(parseJyutpingCsv(csv));
const committed = JSON.parse(readFileSync(new URL('../src/lib/tones/distribution.json', import.meta.url), 'utf8'));

test('classifier drops oei, spells eung as oeng, and keeps syllabic nasals', () => {
	assert.equal(classifyReading('coei1'), null);
	assert.deepEqual(classifyReading('heung1'), { bucket: 'consonant', key: 'ng', tone: 1 });
	assert.deepEqual(classifyReading('hoeng1'), { bucket: 'consonant', key: 'ng', tone: 1 });
	assert.deepEqual(classifyReading('m4'), { bucket: 'consonant', key: 'syllabic m', tone: 4 });
	assert.deepEqual(classifyReading('ng5'), { bucket: 'consonant', key: 'syllabic ng', tone: 5 });
	assert.deepEqual(classifyReading('sai1'), { bucket: 'vowel', key: 'ai', tone: 1 });
	assert.equal(classifyReading('saa1 aa6'), null);
});

test('committed chart JSON matches the Jyutping list', () => {
	assert.deepEqual(committed, built);
	assert.equal(built.readings, 41350);
	assert.equal(built.vowelReadings, 17529);
	assert.equal(built.consonantReadings, 23809);
	assert.equal(built.vowels.some((row) => row.id === 'oei' || row.id === 'eung'), false);
	assert.deepEqual(built.vowels.map((row) => row.id)[0], 'ai');
	assert.deepEqual(
		built.consonants.map((row) => row.id),
		['m', 'n', 'ng', 'p', 't', 'k', 'syllabic m', 'syllabic ng']
	);

	const ai = built.vowels.find((row) => row.id === 'ai');
	assert.equal(ai.n, 2002);
	assert.deepEqual(ai.counts, [336, 224, 441, 373, 176, 452]);
	const u = built.vowels.find((row) => row.id === 'u');
	assert.equal(u.counts[4], 3);
	assert.equal(u.n, 697);

	for (const id of ['p', 't', 'k']) {
		const row = built.consonants.find((item) => item.id === id);
		assert.equal(row.counts[4], 0);
	}
	for (const id of ['m', 'n', 'ng']) {
		const row = built.consonants.find((item) => item.id === id);
		assert.equal(row.counts.every((count) => count > 0), true);
	}
});

test('the tones page states dictionary counts and credits', async () => {
	const pageSource = readFileSync(new URL('../src/routes/tones/+page.svelte', import.meta.url), 'utf8');
	assert.equal(pageSource.includes('jyutping.csv'), false);

	const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
	try {
		const { render } = await vite.ssrLoadModule('svelte/server');
		const page = await vite.ssrLoadModule('/src/routes/tones/+page.svelte');
		const html = render(page.default, { props: { data: { user: null } } }).body;
		assert.match(html, /dictionary reading counts/);
		assert.match(html, /not how often a tone is spoken or written/);
		assert.match(html, /do not analyse tone sandhi/);
		assert.match(html, /CC BY 4\.0/);
		assert.match(html, /Unicode License v3/);
		assert.match(html, /LSHK Jyutping table/);
		assert.match(html, /17,529 readings/);
		assert.match(html, /23,809 readings/);
		assert.match(html, /-ai/);
		assert.match(html, /m alone/);
		assert.match(html, /3 readings in tone 5 out of 697/);
		assert.match(html, /href="\/tones"/);
		assert.match(html, /href="\/login"/);
		assert.match(html, />Sign in</);
		assert.match(html, /class="tone-cell[^"]*\bmode\b/);
		assert.match(html, /-ai, tone 6, 23 percent, 452 of 2,002 readings, most common/);
		assert.match(html, /-n, tone 1, 24 percent, 1,656 of 6,809 readings, most common/);
		const signedIn = render(page.default, {
			props: { data: { user: { username: 'ada', displayName: 'Ada Wong' } } }
		}).body;
		assert.match(signedIn, /Ada Wong/);
	} finally {
		await vite.close();
	}
});
