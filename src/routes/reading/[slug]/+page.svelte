<script lang="ts">
	import { onMount } from 'svelte';
	import { BASE_LANG, LANGUAGE_LABELS, LANGUAGE_LOCALES, type BaseLang } from '$lib/reading';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Sentence = PageData['sentences'][number];
	type Romanization = 'jyutping' | 'yale';
	let romanization = $state<Romanization>('jyutping');
	let showRomanization = $state(true);
	let language = $state<BaseLang>('en');
	let expandedPosition = $state<number | null>(null);
	let loadingKey = $state<string | null>(null);
	let translationError = $state<{ key: string; message: string } | null>(null);
	let fetched = $state<Record<string, Partial<Record<BaseLang, string>>>>({});
	let reportingPosition = $state<number | null>(null);
	let reportNote = $state('');
	let reportSending = $state(false);
	let reportError = $state<string | null>(null);
	let reportedIds = $state<Record<string, boolean>>({});
	let likeOverride = $state<{ slug: string; count: number; liked: boolean } | null>(null);
	let likeSending = $state(false);
	const likes = $derived(likeOverride?.slug === data.article.slug ? likeOverride : data.likes);

	async function toggleLike() {
		if (likeSending) return;
		likeSending = true;
		const slug = data.article.slug;
		try {
			const response = await fetch('/api/reading/like', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slug, liked: !likes.liked })
			});
			if (response.ok) likeOverride = { slug, ...(await response.json() as { count: number; liked: boolean }) };
		} finally {
			likeSending = false;
		}
	}

	const paragraphs = $derived(data.sentences.reduce<Sentence[][]>((groups, sentence) => {
		const group = groups[sentence.paragraph_index] ?? [];
		group.push(sentence);
		groups[sentence.paragraph_index] = group;
		return groups;
	}, []));

	onMount(() => {
		const savedRomanization = localStorage.getItem('reading-romanization');
		if (savedRomanization === 'yale' || savedRomanization === 'jyutping') romanization = savedRomanization;
		showRomanization = localStorage.getItem('reading-show-romanization') !== 'false';
		const savedLanguage = localStorage.getItem('reading-language');
		if (BASE_LANG.some((value) => value === savedLanguage)) language = savedLanguage as BaseLang;
	});

	function setRomanization(value: Romanization) {
		romanization = value;
		showRomanization = true;
		localStorage.setItem('reading-romanization', value);
		localStorage.setItem('reading-show-romanization', 'true');
	}

	function toggleRomanization() {
		showRomanization = !showRomanization;
		localStorage.setItem('reading-show-romanization', String(showRomanization));
	}

	function getTranslation(sentence: Sentence) {
		return fetched[sentence.id]?.[language] ?? sentence.translations[language];
	}

	async function loadTranslation(sentence: Sentence) {
		if (getTranslation(sentence)) return;
		const requestedLanguage = language;
		const key = `${sentence.id}:${requestedLanguage}`;
		if (loadingKey === key) return;
		loadingKey = key;
		translationError = null;
		try {
			const response = await fetch('/api/reading/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: sentence.id, lang: requestedLanguage })
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { message?: string } | null;
				throw new Error(body?.message ?? 'Translation is unavailable.');
			}
			const { translation } = await response.json() as { translation: string };
			fetched = { ...fetched, [sentence.id]: { ...fetched[sentence.id], [requestedLanguage]: translation } };
		} catch (cause) {
			if (loadingKey === key) translationError = {
				key, message: cause instanceof Error ? cause.message : 'Translation is unavailable.'
			};
		} finally {
			if (loadingKey === key) loadingKey = null;
		}
	}

	function selectLanguage(value: BaseLang) {
		language = value;
		localStorage.setItem('reading-language', value);
		const sentence = data.sentences.find((item) => item.position === expandedPosition);
		if (sentence) void loadTranslation(sentence);
	}

	function toggleReport(sentence: Sentence) {
		reportingPosition = reportingPosition === sentence.position ? null : sentence.position;
		reportNote = '';
		reportError = null;
	}

	async function sendReport(event: SubmitEvent, sentence: Sentence) {
		event.preventDefault();
		if (reportSending) return;
		reportSending = true;
		reportError = null;
		try {
			const response = await fetch('/api/reading/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: sentence.id, slug: data.article.slug, romanization, note: reportNote })
			});
			if (!response.ok) throw new Error('Could not send the report. Please try again.');
			reportedIds = { ...reportedIds, [sentence.id]: true };
			reportingPosition = null;
		} catch (cause) {
			reportError = cause instanceof Error ? cause.message : 'Could not send the report. Please try again.';
		} finally {
			reportSending = false;
		}
	}

	function toggleTranslation(sentence: Sentence) {
		expandedPosition = expandedPosition === sentence.position ? null : sentence.position;
		if (expandedPosition !== null) void loadTranslation(sentence);
	}
</script>

<svelte:head><title>{data.article.title} · Read Cantonese</title></svelte:head>

<main class="reader-shell">
	<header class="reader-header">
		<p class="reader-eyebrow">{data.article.genre} · Reading room</p>
		<div class="reader-title-row">
			<h1>{data.article.title}</h1>
			<button class={['like-button', { liked: likes.liked }]} type="button" aria-pressed={likes.liked} disabled={likeSending} onclick={toggleLike}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" /></svg>
				<span>{likes.liked ? 'Liked' : 'Like'}</span>
				<span class="like-count" aria-label={`${likes.count} likes`}>{likes.count}</span>
			</button>
		</div>
		<p>Choose a pronunciation system, or hide it and practise reading on your own.</p>
	</header>
	<div class="reader-toolbar" aria-label="Reading controls">
		<div class="reader-toggle" aria-label="Pronunciation system">
			<button type="button" class={{ active: romanization === 'jyutping' && showRomanization }} aria-pressed={romanization === 'jyutping' && showRomanization} onclick={() => setRomanization('jyutping')}>Jyutping</button>
			<button type="button" class={{ active: romanization === 'yale' && showRomanization }} aria-pressed={romanization === 'yale' && showRomanization} onclick={() => setRomanization('yale')}>Yale</button>
			<button type="button" class={{ active: !showRomanization }} aria-pressed={!showRomanization} onclick={toggleRomanization}>Hide</button>
		</div>
		<label>Translation language
			<select value={language} onchange={(event) => selectLanguage(event.currentTarget.value as BaseLang)}>
				{#each BASE_LANG as value (value)}<option value={value}>{LANGUAGE_LABELS[value]}</option>{/each}
			</select>
		</label>
	</div>
	<article class="reader-article" lang="yue-Hant">
		{#each paragraphs as paragraph, paragraphIndex (paragraphIndex)}
			<div class="reader-paragraph">
				{#each paragraph as sentence (sentence.position)}
					<section class="reader-sentence" aria-label={`Sentence ${sentence.position + 1}`}>
						<p class="reader-cantonese">{sentence.cantonese}</p>
						<div class="romanization-slot" aria-hidden={!showRomanization}>
							<p class={{ concealed: !showRomanization || romanization !== 'jyutping' }} lang="yue-Latn">{sentence.jyutping ?? 'Pronunciation pending'}</p>
							<p class={{ concealed: !showRomanization || romanization !== 'yale' }} lang="yue-Latn">{sentence.yale ?? 'Pronunciation pending'}</p>
						</div>
						<div class="sentence-actions">
							<button class="translation-action" type="button" aria-expanded={expandedPosition === sentence.position} onclick={() => toggleTranslation(sentence)}>{expandedPosition === sentence.position ? 'Hide translation' : 'Translate sentence'} <span aria-hidden="true">↗</span></button>
							{#if reportedIds[sentence.id]}
								<span class="report-done" role="status">Reported. Thank you.</span>
							{:else}
								<button class="report-action" type="button" aria-expanded={reportingPosition === sentence.position} onclick={() => toggleReport(sentence)}>Report pronunciation</button>
							{/if}
						</div>
						{#if reportingPosition === sentence.position}
							<form class="report-form" onsubmit={(event) => sendReport(event, sentence)}>
								<label for={`report-${sentence.position}`}>What is wrong with the {romanization === 'yale' ? 'Yale' : 'Jyutping'}? <span>Optional</span></label>
								<div>
									<input id={`report-${sentence.position}`} bind:value={reportNote} maxlength="500" placeholder="e.g. 核突 should be wat6 dat6" />
									<button type="submit" disabled={reportSending}>{reportSending ? 'Sending…' : 'Send report'}</button>
								</div>
								{#if reportError}<p role="alert">{reportError}</p>{/if}
							</form>
						{/if}
						{#if expandedPosition === sentence.position}
							<div class="sentence-translation" lang={LANGUAGE_LOCALES[language]} aria-live="polite">
								{#if getTranslation(sentence)}<p>{getTranslation(sentence)}</p>
								{:else if loadingKey === `${sentence.id}:${language}`}<p>Translating…</p>
								{:else if translationError?.key === `${sentence.id}:${language}`}<p role="alert">{translationError.message}</p>{/if}
							</div>
						{/if}
					</section>
				{/each}
			</div>
		{/each}
	</article>
	<footer class="reader-footer"><a href="/reading">← All articles</a></footer>
</main>

<style>
	.reader-shell { width: min(100% - 2.5rem, 52rem); margin-inline: auto; padding-block: 1rem 4rem; }
	.reader-header { padding-block: clamp(1.8rem, 5vw, 3rem) 1.4rem; }
	.reader-title-row { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.8rem 1.2rem; }
	.like-button { display: inline-flex; min-height: 2.5rem; align-items: center; gap: 0.45rem; border: 1px solid var(--line-strong); background: var(--paper-raised); padding: 0.4rem 0.8rem; color: var(--ink-muted); font-size: 0.82rem; font-weight: 650; }
	.like-button svg { width: 1.05rem; fill: none; stroke: currentColor; stroke-width: 1.8; }
	.like-button.liked { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent-dark); }
	.like-button.liked svg { fill: currentColor; }
	.like-button:disabled { opacity: 0.7; }
	.like-count { border-left: 1px solid var(--line); padding-left: 0.45rem; font-variant-numeric: tabular-nums; }
	.reader-eyebrow { color: var(--accent); font-size: 0.72rem; font-weight: 750; letter-spacing: 0.13em; text-transform: uppercase; }
	h1 { margin-top: 0.45rem; font-size: clamp(2.2rem, 5.5vw, 3.5rem); line-height: 1.12; font-weight: 650; letter-spacing: -0.045em; }
	.reader-header > p:last-child { margin-top: 0.7rem; color: var(--ink-muted); font-size: 0.9rem; line-height: 1.5; }
	.reader-toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; align-items: center; border-block: 1px solid var(--line-strong); padding-block: 0.85rem; }
	.reader-toggle { display: flex; gap: 0.2rem; border: 1px solid var(--line); padding: 0.2rem; }
	.reader-toggle button { min-height: 2.5rem; padding: 0.4rem 0.8rem; color: var(--ink-muted); font-size: 0.8rem; font-weight: 650; }
	.reader-toggle button.active { background: var(--ink); color: var(--paper); }
	.reader-toolbar label { display: flex; align-items: center; gap: 0.7rem; color: var(--ink-muted); font-size: 0.78rem; font-weight: 650; }
	select { min-height: 2.5rem; border: 1px solid var(--line); background: var(--paper-raised); padding-inline: 0.6rem; color: var(--ink); }
	.reader-article { padding-block: 1.6rem; }
	.reader-paragraph + .reader-paragraph { margin-top: 1.7rem; }
	.reader-sentence + .reader-sentence { margin-top: 0.4rem; }
	.reader-cantonese { font-family: "Noto Sans HK", "PingFang HK", sans-serif; font-size: clamp(1.25rem, 2.6vw, 1.5rem); line-height: 1.6; overflow-wrap: anywhere; }
	.romanization-slot { display: grid; margin-top: 0.05rem; color: var(--ink-faint); font-size: 0.83rem; line-height: 1.5; overflow-wrap: anywhere; }
	.romanization-slot p { grid-area: 1 / 1; }
	.romanization-slot .concealed { visibility: hidden; }
	.translation-action { margin-top: 0.1rem; color: var(--accent-dark); font-size: 0.73rem; font-weight: 700; }
	.translation-action span { margin-left: 0.15rem; }
	.sentence-actions { display: flex; flex-wrap: wrap; gap: 0.1rem 1rem; }
	.report-action { margin-top: 0.1rem; color: var(--ink-faint); font-size: 0.73rem; font-weight: 650; }
	.report-action:hover { color: var(--accent-dark); }
	.report-done { margin-top: 0.1rem; color: var(--ink-muted); font-size: 0.73rem; font-weight: 650; }
	.report-form { display: grid; gap: 0.35rem; margin-top: 0.5rem; border-left: 2px solid var(--line-strong); padding: 0.4rem 0.9rem; }
	.report-form label { color: var(--ink-muted); font-size: 0.78rem; font-weight: 650; }
	.report-form label span { color: var(--ink-faint); font-weight: 500; }
	.report-form div { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.report-form input { flex: 1 1 14rem; min-width: 0; min-height: 2.5rem; border: 1px solid var(--line-strong); background: var(--paper-raised); padding-inline: 0.6rem; color: var(--ink); font-size: 0.9rem; }
	.report-form button { min-height: 2.5rem; background: var(--ink); padding-inline: 0.9rem; color: var(--paper); font-size: 0.8rem; font-weight: 650; }
	.report-form button:disabled { opacity: 0.5; }
	.report-form p { color: var(--accent-dark); font-size: 0.8rem; font-weight: 650; }
	.sentence-translation { margin-top: 0.5rem; border-left: 2px solid var(--accent); padding: 0.4rem 0.9rem; color: var(--ink-muted); font-size: 0.98rem; line-height: 1.6; }
	.reader-footer { border-top: 1px solid var(--line); padding-top: 1.4rem; color: var(--accent-dark); font-weight: 650; }
	button:focus-visible, select:focus-visible, a:focus-visible, .report-form input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
