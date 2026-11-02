import { readFileSync, writeFileSync } from 'node:fs';
import { buildDistribution, parseJyutpingCsv } from './tones-distribution.mjs';

const csv = readFileSync(new URL('../data/jyutping.csv', import.meta.url), 'utf8');
const distribution = buildDistribution(parseJyutpingCsv(csv));
const target = new URL('../src/lib/tones/distribution.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(distribution, null, 2)}\n`);
console.log(
	`Wrote ${distribution.vowels.length} vowel rows (${distribution.vowelReadings}) and ${distribution.consonants.length} consonant rows (${distribution.consonantReadings}). Skipped ${distribution.skipped}.`
);
