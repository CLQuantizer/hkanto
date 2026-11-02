/**
 * Dictionary tone distributions from the combined LSHK Jyutping table and
 * Unicode Unihan kCantonese list. Each character–reading row is counted once.
 *
 * Sources and licences are stated on /tones. This is not usage frequency.
 */

const SYLLABIC = /^(m|ng)([1-6])$/;
const SYLLABLE = /^(ng|gw|kw|[bpmfdtnlgkhwzcsj])?([a-z]+)([1-6])$/;
const VOWEL_FINAL = /^[aeiouy]+$/;
const CODA_FINAL = /^[aeiouy]+(ng|m|n|p|t|k)$/;
const CODA_ENDING = /(ng|m|n|p|t|k)$/;

export const VOWEL_EXAMPLES = {
	ai: ['西', 'sai1'],
	au: ['九', 'gau2'],
	ou: ['好', 'hou2'],
	i: ['詩', 'si1'],
	ei: ['你', 'nei5'],
	eoi: ['水', 'seoi2'],
	iu: ['笑', 'siu3'],
	aa: ['媽', 'maa1'],
	o: ['多', 'do1'],
	aai: ['買', 'maai5'],
	yu: ['魚', 'jyu4'],
	u: ['夫', 'fu1'],
	oi: ['愛', 'oi3'],
	aau: ['教', 'gaau3'],
	ui: ['杯', 'bui1'],
	e: ['車', 'ce1'],
	oe: ['靴', 'hoe1'],
	eu: ['掉', 'deu6']
};

export const CONSONANT_EXAMPLES = {
	m: ['心', 'sam1'],
	n: ['山', 'saan1'],
	ng: ['香', 'hoeng1'],
	p: ['十', 'sap6'],
	t: ['七', 'cat1'],
	k: ['六', 'luk6'],
	'syllabic m': ['唔', 'm4'],
	'syllabic ng': ['五', 'ng5']
};

export const CONSONANT_ORDER = ['m', 'n', 'ng', 'p', 't', 'k', 'syllabic m', 'syllabic ng'];

/** @param {string} jyutping */
export function classifyReading(jyutping) {
	const reading = String(jyutping).trim().toLowerCase();
	const syllabic = SYLLABIC.exec(reading);
	if (syllabic) {
		return { bucket: 'consonant', key: `syllabic ${syllabic[1]}`, tone: Number(syllabic[2]) };
	}

	const match = SYLLABLE.exec(reading);
	if (!match) return null;

	// LSHK spells this final -oeng. A stray -eung is the same ending.
	const final = match[2] === 'eung' ? 'oeng' : match[2];
	const tone = Number(match[3]);
	if (VOWEL_FINAL.test(final)) {
		if (final === 'oei') return null;
		return { bucket: 'vowel', key: final, tone };
	}
	if (!CODA_FINAL.test(final)) return null;
	const ending = CODA_ENDING.exec(final);
	if (!ending) return null;
	return { bucket: 'consonant', key: ending[1], tone };
}

function emptyCounts() {
	return [0, 0, 0, 0, 0, 0];
}

/**
 * @param {Array<{ char: string, jyutping: string }>} rows
 */
export function buildDistribution(rows) {
	/** @type {Map<string, number[]>} */
	const vowels = new Map();
	/** @type {Map<string, number[]>} */
	const consonants = new Map();
	let skipped = 0;

	for (const row of rows) {
		const parsed = classifyReading(row.jyutping);
		if (!parsed) {
			skipped += 1;
			continue;
		}
		const table = parsed.bucket === 'vowel' ? vowels : consonants;
		const counts = table.get(parsed.key) ?? emptyCounts();
		counts[parsed.tone - 1] += 1;
		table.set(parsed.key, counts);
	}

	const vowelRows = [...vowels.entries()]
		.map(([key, counts]) => toRow(key, `-${key}`, VOWEL_EXAMPLES[key], counts))
		.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));

	const consonantRows = CONSONANT_ORDER.filter((key) => consonants.has(key)).map((key) => {
		const counts = consonants.get(key) ?? emptyCounts();
		const label = key.startsWith('syllabic ') ? `${key.slice('syllabic '.length)} alone` : `-${key}`;
		return toRow(key, label, CONSONANT_EXAMPLES[key], counts);
	});

	return {
		readings: rows.length,
		skipped,
		vowelReadings: vowelRows.reduce((sum, row) => sum + row.n, 0),
		consonantReadings: consonantRows.reduce((sum, row) => sum + row.n, 0),
		vowels: vowelRows,
		consonants: consonantRows
	};
}

function toRow(id, label, example, counts) {
	if (!example) throw new Error(`Missing example for ${id}`);
	return {
		id,
		label,
		example: { char: example[0], jyutping: example[1] },
		n: counts.reduce((sum, count) => sum + count, 0),
		counts
	};
}

/** @param {string} csv */
export function parseJyutpingCsv(csv) {
	const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0);
	const header = lines[0].split(',');
	const columns = {
		char: header.indexOf('char'),
		jyutping: header.indexOf('jyutping')
	};
	if (columns.char < 0 || columns.jyutping < 0) throw new Error('Jyutping CSV is missing char or jyutping.');
	return lines.slice(1).map((line) => {
		const fields = line.split(',');
		return { char: fields[columns.char] ?? '', jyutping: fields[columns.jyutping] ?? '' };
	});
}
