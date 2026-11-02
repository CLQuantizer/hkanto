const INITIALS = ['gw', 'kw', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'w', 'z', 'c', 's', 'j'];
const YALE_INITIALS: Record<string, string> = { z: 'j', c: 'ch', j: 'y' };
const FINALS = new Set([
	'aa', 'aai', 'aau', 'aam', 'aan', 'aang', 'aap', 'aat', 'aak',
	'ai', 'au', 'am', 'an', 'ang', 'ap', 'at', 'ak',
	'e', 'ei', 'eu', 'em', 'en', 'eng', 'ep', 'et', 'ek',
	'i', 'iu', 'im', 'in', 'ing', 'ip', 'it', 'ik',
	'o', 'oi', 'ou', 'on', 'ong', 'ot', 'ok',
	'oe', 'oeng', 'oet', 'oek', 'eoi', 'eon', 'eot',
	'u', 'ui', 'un', 'ung', 'ut', 'uk',
	'yu', 'yun', 'yut',
	'm', 'ng'
]);
// Yale marks the first vowel: macron for tone 1, acute for 2 and 5, grave for 4. Tones 4 to 6 add h.
const TONE_MARKS = ['', '\u0304', '\u0301', '', '\u0300', '\u0301', ''];

export interface JyutpingSyllable { initial: string; final: string; tone: number }

export function parseJyutpingSyllable(syllable: string): JyutpingSyllable | null {
	const match = /^([a-z]+)([1-6])$/.exec(syllable.toLowerCase());
	if (!match) return null;
	const [, body, tone] = match;
	for (const initial of ['', ...INITIALS]) {
		const final = body.slice(initial.length);
		if (body.startsWith(initial) && FINALS.has(final)) return { initial, final, tone: Number(tone) };
	}
	return null;
}

function syllableToYale({ initial, final, tone }: JyutpingSyllable): string {
	let yaleFinal = final === 'aa' ? 'a' : final.replace(/^oe|^eo/, 'eu');
	let yaleInitial = YALE_INITIALS[initial] ?? initial;
	if (yaleInitial === 'y' && yaleFinal.startsWith('yu')) yaleInitial = '';
	if (yaleFinal === 'm' || yaleFinal === 'ng') {
		return `${yaleInitial}${yaleFinal[0]}${TONE_MARKS[tone]}${yaleFinal.slice(1)}${tone >= 4 ? 'h' : ''}`;
	}
	const vowels = /^(y?)([aeiou]+)(.*)$/.exec(yaleFinal);
	if (!vowels) return yaleInitial + yaleFinal;
	const [, glide, nucleus, coda] = vowels;
	const marked = nucleus[0] + TONE_MARKS[tone] + nucleus.slice(1);
	yaleFinal = `${glide}${marked}${tone >= 4 ? 'h' : ''}${coda}`;
	return yaleInitial + yaleFinal;
}

/** Converts every toned Jyutping syllable to Yale; English words, numbers and punctuation pass through. */
export function jyutpingToYale(jyutping: string): string {
	return jyutping.replace(/[A-Za-z]+[1-6]/g, (token) => {
		const parsed = parseJyutpingSyllable(token);
		return parsed ? syllableToYale(parsed) : token;
	}).normalize('NFC');
}

/** Toned tokens that are not valid Jyutping syllables, for spotting typos. */
export function invalidJyutpingSyllables(jyutping: string): string[] {
	return (jyutping.match(/[A-Za-z]+[1-6]/g) ?? []).filter((token) => !parseJyutpingSyllable(token));
}
