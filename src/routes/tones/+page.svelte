<script lang="ts">
	import ToneChart from '$lib/components/ToneChart.svelte';
	import distribution from '$lib/tones/distribution.json';
	const numberFormat = new Intl.NumberFormat('en-HK');

	function row(id: string, rows: typeof distribution.vowels) {
		const found = rows.find((item) => item.id === id);
		if (!found) throw new Error(`Missing tone row ${id}`);
		return found;
	}

	const vowelU = row('u', distribution.vowels);
	const vowelOe = row('oe', distribution.vowels);
	const vowelEu = row('eu', distribution.vowels);
	const charted = distribution.vowelReadings + distribution.consonantReadings;
</script>

<svelte:head>
	<title>聲調 · Cantonese tones</title>
	<meta name="description" content="Share of each Cantonese tone by syllable ending, counted once per dictionary reading." />
</svelte:head>

<main id="main-content" class="mx-auto min-h-screen w-full max-w-5xl px-5 pt-4 pb-6 sm:px-8 sm:pt-8 sm:pb-16 lg:pb-12">
	<header class="mb-8 sm:mb-12">
		<p class="eyebrow" lang="zh-HK">粵語聲調</p>
		<h1 class="mt-3 max-w-3xl text-[2.15rem] leading-none font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-5xl sm:tracking-[-0.05em]">Cantonese tones</h1>
		<p class="mt-5 max-w-2xl text-lg leading-7 text-[var(--ink-muted)]">Every vowel ending and every consonant ending, and the share of each of the six tones.</p>
	</header>

	<aside class="border border-[var(--line-strong)] bg-[var(--paper-raised)] px-5 py-5 sm:px-6" aria-label="How to read these charts">
		<p class="text-base leading-7 text-[var(--ink)]">These are dictionary reading counts. Each character with one Jyutping reading is counted once. This is not how often a tone is spoken or written. The charts do not analyse tone sandhi.</p>
		<p class="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
			The combined list has {numberFormat.format(distribution.readings)} readings.
			The charts use {numberFormat.format(charted)} of them.
			{numberFormat.format(distribution.skipped)} are left out: two-syllable entries, the final <span lang="yue-Latn">oei</span>, and a few syllabic consonants other than <span lang="yue-Latn">m</span> and <span lang="yue-Latn">ng</span>.
			A reading is an optional initial, a final, and a tone from 1 to 6. Each row is the share of tones for that final. Percentages are rounded, so a row may not add up to 100. The outline marks the most common tone by the raw count.
		</p>
	</aside>

	<nav class="mt-6 flex flex-wrap gap-2" aria-label="Charts">
		<a class="nav-link" href="#vowel-endings">Vowel endings</a>
		<a class="nav-link" href="#consonant-endings">Consonant endings</a>
	</nav>

	<ToneChart
		id="vowel-endings"
		title="Every vowel ending, every tone"
		description={`Share of each tone by final, sorted by how many characters use it. ${numberFormat.format(distribution.vowelReadings)} readings.`}
		rows={distribution.vowels}
	>
		<p>
			The outline is the most common tone for that ending, chosen before rounding.
			Tone 5 is a thin slice on most vowel endings.
			<span lang="yue-Latn">-u</span> has {vowelU.counts[4]} readings in tone 5 out of {numberFormat.format(vowelU.n)}.
			<span lang="yue-Latn">-oe</span> and <span lang="yue-Latn">-eu</span> are rare finals, with {vowelOe.n} and {vowelEu.n} readings.
		</p>
	</ToneChart>

	<ToneChart
		id="consonant-endings"
		title="Every consonant ending, every tone"
		description={`Share of each tone by final consonant, plus syllabic m and ng. ${numberFormat.format(distribution.consonantReadings)} readings.`}
		rows={distribution.consonants}
	>
		<p>
			The outline is the most common tone.
			<span lang="yue-Latn">-p</span>, <span lang="yue-Latn">-t</span>, and <span lang="yue-Latn">-k</span> cluster on tones 1, 3, and 6.
			Tone 5 does not appear on those endings. Tones 2 and 4 are rare.
			Nasals <span lang="yue-Latn">-m</span>, <span lang="yue-Latn">-n</span>, and <span lang="yue-Latn">-ng</span> use all six tones.
		</p>
	</ToneChart>

	<footer class="mt-16 max-w-2xl border-t border-[var(--line-strong)] pt-6 text-sm leading-6 text-[var(--ink-muted)]">
		<h2 class="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">Sources</h2>
		<p class="mt-3">
			Counts come from the <a class="text-[var(--accent-dark)] underline underline-offset-4" href="https://github.com/lshk-org/jyutping-table">LSHK Jyutping table</a>
			(<a class="text-[var(--accent-dark)] underline underline-offset-4" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)
			and Unicode Unihan <a class="text-[var(--accent-dark)] underline underline-offset-4" href="https://www.unicode.org/reports/tr38/">kCantonese</a>
			under the <a class="text-[var(--accent-dark)] underline underline-offset-4" href="https://www.unicode.org/license.txt">Unicode License v3</a>.
			Each character–reading pair in that combined list is counted once.
		</p>
	</footer>
</main>
