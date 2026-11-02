<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const MAX_CHARACTERS = 500;
	const MAX_WORDS = 80;

	interface JyutpingChar { char: string; jyutping: string | null; }
	interface TranslationResult {
		source: string;
		sourceLanguage: 'en' | 'zh-Mandarin';
		translations: Array<{ cantonese: string; characters: JyutpingChar[] }>;
	}
	interface HistoryItem {
		id: number;
		source_text: string;
		source_language: 'en' | 'zh-Mandarin';
		translation_one: string;
		translation_two: string;
		jyutping_one: string | null;
		jyutping_two: string | null;
		created_at: string;
	}
	interface HistoryResponse {
		items: HistoryItem[];
		page: number;
		total: number;
		totalPages: number;
	}

	let sentence = $state('');
	let loading = $state(false);
	let errorMessage = $state('');
	let result = $state<TranslationResult | null>(null);
	let copiedIndex = $state<number | null>(null);
	let historyAction = $state<{ key: string; label: 'Copied' | 'Shared' } | null>(null);
	let copyChineseOnly = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
	let historyActionResetTimer: ReturnType<typeof setTimeout> | undefined;
	let cardTranslation = $state<TranslationResult['translations'][number] | null>(null);
	let cardPreviewUrl = $state('');
	let cardBlob = $state<Blob | null>(null);
	let cardBusy = $state(false);
	let history = $state<HistoryItem[]>([]);
	let historyPage = $state(1);
	let historyTotal = $state(0);
	let historyTotalPages = $state(1);
	let historyLoading = $state(true);
	let historyError = $state('');
	let characterCount = $derived(sentence.length);
	let wordCount = $derived(sentence.trim().match(/\S+/gu)?.length ?? 0);
	let inputTooLong = $derived(characterCount > MAX_CHARACTERS || wordCount > MAX_WORDS);

	onMount(() => {
		copyChineseOnly = localStorage.getItem('copy-chinese-only') === 'true';
		if (data.user) void loadHistory(1);
		else historyLoading = false;
	});

	function setCopyPreference(chineseOnly: boolean) {
		copyChineseOnly = chineseOnly;
		localStorage.setItem('copy-chinese-only', String(copyChineseOnly));
	}

	function getCopyText(translation: TranslationResult['translations'][number]) {
		if (copyChineseOnly) return translation.cantonese;

		const jyutping = translation.characters
			.map(({ jyutping }) => jyutping)
			.filter((syllable): syllable is string => Boolean(syllable))
			.join(' ');

		return jyutping ? `${translation.cantonese} ${jyutping}` : translation.cantonese;
	}

	function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
		const units = text.includes(' ') ? text.split(' ') : Array.from(text);
		const joiner = text.includes(' ') ? ' ' : '';
		const lines: string[] = [];
		let line = '';
		for (const unit of units) {
			const candidate = line ? `${line}${joiner}${unit}` : unit;
			if (line && context.measureText(candidate).width > maxWidth) {
				lines.push(line);
				line = unit;
			} else {
				line = candidate;
			}
		}
		if (line) lines.push(line);
		return lines;
	}

	async function makeCard(translation: TranslationResult['translations'][number]) {
		cardBusy = true;
		cardTranslation = translation;
		await document.fonts.ready;

		const canvas = document.createElement('canvas');
		canvas.width = 1080;
		canvas.height = 1350;
		const context = canvas.getContext('2d');
		if (!context) {
			cardBusy = false;
			return;
		}

		context.fillStyle = '#f7f2e8';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = '#aa3529';
		context.fillRect(72, 72, 92, 92);
		context.fillStyle = '#f7f2e8';
		context.font = '600 48px "Noto Sans HK", "PingFang HK", sans-serif';
		context.textAlign = 'center';
		context.fillText('講', 118, 137);
		context.textAlign = 'left';
		context.fillStyle = '#6a5d52';
		context.font = '600 25px "Avenir Next", sans-serif';
		context.fillText('HONG KONG CANTONESE', 190, 130);

		context.textAlign = 'center';
		context.fillStyle = '#2d2823';
		context.font = '600 86px "Noto Sans HK", "PingFang HK", sans-serif';
		const chineseLines = wrapCanvasText(context, translation.cantonese, 880);
		const chineseStart = 520 - ((chineseLines.length - 1) * 110) / 2;
		chineseLines.forEach((line, index) => context.fillText(line, 540, chineseStart + index * 110));

		const jyutping = translation.characters.map(({ jyutping }) => jyutping).filter(Boolean).join(' ');
		context.fillStyle = '#75685d';
		context.font = '500 31px "Avenir Next", sans-serif';
		const jyutpingLines = wrapCanvasText(context, jyutping, 820);
		const jyutpingStart = chineseStart + chineseLines.length * 110 + 45;
		jyutpingLines.forEach((line, index) => context.fillText(line, 540, jyutpingStart + index * 46));

		context.fillStyle = '#b7a99a';
		context.fillRect(72, 1215, 936, 2);
		context.textAlign = 'left';
		context.fillStyle = '#75685d';
		context.font = '500 24px "Avenir Next", sans-serif';
		context.fillText('hk.mywords.io', 72, 1270);

		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		if (blob) {
			if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
			cardBlob = blob;
			cardPreviewUrl = URL.createObjectURL(blob);
		}
		cardBusy = false;
	}

	async function shareCard() {
		if (!cardBlob || !cardTranslation) return;
		const file = new File([cardBlob], 'cantonese-card.png', { type: 'image/png' });
		try {
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({ files: [file], title: cardTranslation.cantonese });
				return;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
		}
		downloadCard();
	}

	function downloadCard() {
		if (!cardPreviewUrl) return;
		const link = document.createElement('a');
		link.href = cardPreviewUrl;
		link.download = 'cantonese-card.png';
		link.click();
	}

	async function loadHistory(page: number) {
		historyLoading = true;
		historyError = '';
		try {
			const response = await fetch(`/api/history?page=${page}`);
			if (response.status === 401) {
				history = [];
				historyTotal = 0;
				historyTotalPages = 1;
				historyError = 'Sign in to view your translation history.';
				return;
			}
			if (!response.ok) throw new Error('History request failed.');
			const data = (await response.json()) as HistoryResponse;
			history = data.items;
			historyPage = data.page;
			historyTotal = data.total;
			historyTotalPages = data.totalPages;
		} catch {
			historyError = 'Could not load recent translations.';
		} finally {
			historyLoading = false;
		}
	}

	async function pasteFromClipboard() {
		try {
			sentence = await navigator.clipboard.readText();
			errorMessage = '';
		} catch {
			errorMessage = 'Clipboard access was blocked. Paste into the box manually.';
		}
	}

	async function copyTranslation(text: string, index: number) {
		try {
			await navigator.clipboard.writeText(text);
			copiedIndex = index;
			clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => (copiedIndex = null), 1800);
		} catch {
			errorMessage = 'Could not copy that translation. Select the text and copy it manually.';
		}
	}

	function getHistoryCopyText(cantonese: string, jyutping: string | null) {
		return !copyChineseOnly && jyutping ? `${cantonese} ${jyutping}` : cantonese;
	}

	function showHistoryAction(key: string, label: 'Copied' | 'Shared') {
		historyAction = { key, label };
		clearTimeout(historyActionResetTimer);
		historyActionResetTimer = setTimeout(() => (historyAction = null), 1800);
	}

	async function copyHistoryTranslation(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			showHistoryAction(key, 'Copied');
		} catch {
			errorMessage = 'Could not copy that translation. Select the text and copy it manually.';
		}
	}

	async function shareHistoryTranslation(text: string, english: string, key: string) {
		if (navigator.share) {
			try {
				await navigator.share({ title: english, text });
				showHistoryAction(key, 'Shared');
				return;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
			}
		}

		await copyHistoryTranslation(text, key);
	}

	async function downloadHistoryCard(cantonese: string, jyutping: string | null) {
		await makeCard({
			cantonese,
			characters: [{ char: cantonese, jyutping }]
		});
		downloadCard();
	}

	function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = sentence.trim();
		if (!trimmed || loading) return;
		if (inputTooLong) {
			errorMessage = `Keep the request within ${MAX_WORDS} words and ${MAX_CHARACTERS} characters.`;
			return;
		}
		loading = true;
		errorMessage = '';
		result = null;
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 30_000);

		try {
			const response = await fetch('/api/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sentence: trimmed }),
				signal: controller.signal
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? `Request failed (${response.status})`);
			}
			result = await response.json();
			if (data.user) await loadHistory(1);
		} catch (err) {
			errorMessage =
				err instanceof DOMException && err.name === 'AbortError'
					? 'Translation timed out. Please try again.'
					: err instanceof Error
						? err.message
						: 'Something went wrong.';
		} finally {
			window.clearTimeout(timeout);
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>講粵語 · Translate and read Cantonese</title>
	<meta name="description" content="Translate into natural Hong Kong Cantonese and read articles with Jyutping or Yale." />
</svelte:head>

<main id="main-content" class="mx-auto min-h-screen w-full max-w-6xl px-4 pb-4 sm:px-7 sm:pb-6">
	<header class="mb-5 sm:mb-6">
		<h1 class="text-[2rem] leading-tight font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[2.7rem]">Speak it. Read it.</h1>
		<p class="mt-1 text-sm leading-6 text-[var(--ink-muted)] sm:text-base">Translate a sentence or explore everyday Hong Kong Cantonese in context.</p>
	</header>

	<div class="home-workspace">
	<section class="home-area-translate" aria-labelledby="translator-heading">
		<h2 id="translator-heading" class="home-panel-heading">Translate</h2>
	<form class="input-panel" onsubmit={handleSubmit}>
		<div class="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2 sm:px-5">
			<label for="sentence" class="text-sm font-semibold text-[var(--ink)]">Your sentence</label>
			<div class="flex items-center gap-1">
				{#if sentence}<button class="utility-button" type="button" onclick={() => (sentence = '')}>Clear</button>{/if}
				<button class="utility-button" type="button" onclick={pasteFromClipboard}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5h6M9 3h6v4H9V3Zm-2 2H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17" /></svg>
					Paste
				</button>
			</div>
		</div>
		<textarea id="sentence" bind:value={sentence} onkeydown={handleKeydown} rows="3" maxlength={MAX_CHARACTERS} placeholder="Where is the nearest MTR station？" aria-describedby="input-hint input-count"></textarea>
		<div class="flex flex-col gap-2 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
			<div class="input-guidance">
				<p id="input-hint">⌘ Enter to translate</p>
				<p id="input-count" class={{ 'limit-exceeded': inputTooLong }}>{wordCount}/{MAX_WORDS} words · {characterCount}/{MAX_CHARACTERS} characters</p>
			</div>
			<button class="primary-button" type="submit" disabled={loading || !sentence.trim() || inputTooLong}>
				{#if loading}<span class="loading-mark" aria-hidden="true"></span>{/if}
				{loading ? 'Translating' : 'Translate to Cantonese'}
				{#if !loading}<span aria-hidden="true">→</span>{/if}
			</button>
		</div>
	</form>
	</section>
	<div class="home-activity">
	{#if errorMessage}<p class="mt-4 border-l-2 border-[var(--accent)] pl-4 text-sm text-[var(--accent-dark)]" role="alert">{errorMessage}</p>{/if}

	{#if result}
		<section class="results mt-10 sm:mt-12" aria-live="polite">
			<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div>
					<p class="mb-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">Translation</p>
					<h2 class="text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">Two ways to say it</h2>
				</div>
				<div class="copy-preference" aria-label="Copy format">
					<span class="copy-preference-label">Copy format</span>
					<div class="copy-format-options">
						<button
							type="button"
							class={{ active: copyChineseOnly }}
							aria-pressed={copyChineseOnly}
							onclick={() => setCopyPreference(true)}>Chinese only</button
						>
						<button
							type="button"
							class={{ active: !copyChineseOnly }}
							aria-pressed={!copyChineseOnly}
							onclick={() => setCopyPreference(false)}>Chinese + Jyutping</button
						>
					</div>
					<span class="copy-format-status" aria-live="polite">
						Current: {copyChineseOnly ? 'Chinese only' : 'Chinese + Jyutping'}
					</span>
				</div>
			</div>
			<div class="divide-y divide-[var(--line)] border-y border-[var(--line-strong)]">
				{#each result.translations as translation, translationIndex (translationIndex)}
					<article class="translation-row">
						<div class="translation-number">0{translationIndex + 1}</div>
						<p class="cantonese-line" lang="zh-HK">
							{#each translation.characters as { char, jyutping }, characterIndex (`${translationIndex}-${characterIndex}`)}
								{#if jyutping === char}
									<span class="english-word" lang="en">{char}</span>
								{:else if jyutping}
									<ruby>{char}<rt>{jyutping}</rt></ruby>
								{:else}
									<span>{char}</span>
								{/if}
							{/each}
						</p>
						<div class="translation-actions">
						<button class={['copy-button', { copied: copiedIndex === translationIndex }]} type="button" onclick={() => copyTranslation(getCopyText(translation), translationIndex)} aria-label={`Copy translation ${translationIndex + 1}${copyChineseOnly ? ' in Chinese only' : ' with Jyutping'}`}>
							{#if copiedIndex === translationIndex}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> Copied
							{:else}
								<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg> Copy
							{/if}
						</button>
						<button class="copy-button" type="button" onclick={() => makeCard(translation)} disabled={cardBusy}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l4-4 3 3 2-2 7 7M16 9h.01" /></svg>
							{cardBusy && cardTranslation === translation ? 'Making' : 'Make card'}
						</button>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if cardPreviewUrl && cardTranslation}
		<section class="card-maker mt-8" aria-labelledby="card-heading">
			<div>
				<p class="mb-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">Share card</p>
				<h2 id="card-heading" class="text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">Ready for Instagram</h2>
				<p class="mt-2 max-w-sm text-sm leading-6 text-[var(--ink-muted)]">Share the image from your phone and choose Instagram, or download it for later.</p>
				<div class="mt-5 flex flex-wrap gap-2">
					<button class="primary-button" type="button" onclick={shareCard}>Share image <span aria-hidden="true">↗</span></button>
					<button class="copy-button" type="button" onclick={downloadCard}>Download PNG</button>
				</div>
			</div>
			<img src={cardPreviewUrl} alt={`Share card for ${cardTranslation.cantonese}`} />
		</section>
	{/if}

	<section class="history-section mt-10 sm:mt-14" aria-labelledby="history-heading">
		<div class="mb-6 flex items-end justify-between gap-4">
			<div>
				<p class="mb-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">Recent</p>
				<h2 id="history-heading" class="text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">Translation history</h2>
				{#if data.user}<p class="mt-1 text-sm text-[var(--ink-faint)]">Only visible on this account.</p>{/if}
			</div>
			{#if data.user && historyTotal > 0}<p class="text-sm text-[var(--ink-faint)]">{historyTotal} total</p>{/if}
		</div>

		{#if !data.user}
			<div class="history-status">
				<p class="history-private-note"><a href="/login">Sign in</a> to keep a private history. Translations you make while signed out stay on this page only.</p>
			</div>
		{:else}

		{#if historyLoading}
			<div class="history-status"><span class="loading-mark" aria-hidden="true"></span> Loading history</div>
		{:else if historyError}
			<div class="history-status">
				<span>{historyError}</span>
				<button class="text-button" type="button" onclick={() => loadHistory(historyPage)}>Try again</button>
			</div>
		{:else if history.length === 0}
			<p class="history-status">Your latest translations will appear here.</p>
		{:else}
			<div class="history-list">
				{#each history as item (item.id)}
					<article class="history-row">
						<div class="history-meta">
							<p>{item.source_text}</p>
							<span class="history-language">{item.source_language === 'zh-Mandarin' ? 'Chinese' : 'English'}</span>
							<time datetime={item.created_at}>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
						</div>
						<div class="history-translations" lang="zh-HK">
							{#each [
								{ cantonese: item.translation_one, jyutping: item.jyutping_one, key: `${item.id}-1` },
								{ cantonese: item.translation_two, jyutping: item.jyutping_two, key: `${item.id}-2` }
							] as translation (translation.key)}
								<div class="history-translation">
									<div>
										<p>{translation.cantonese}</p>
										{#if translation.jyutping}<p class="history-jyutping" lang="yue-Latn">{translation.jyutping}</p>{/if}
									</div>
									<div class="history-actions">
										<button
											class="history-action-button"
											type="button"
											onclick={() => copyHistoryTranslation(getHistoryCopyText(translation.cantonese, translation.jyutping), translation.key)}
											aria-label={`Copy ${translation.cantonese}`}
										>
											{historyAction?.key === translation.key && historyAction.label === 'Copied' ? 'Copied' : 'Copy'}
										</button>
										<button
											class="history-action-button"
											type="button"
											onclick={() => shareHistoryTranslation(getHistoryCopyText(translation.cantonese, translation.jyutping), item.source_text, translation.key)}
											aria-label={`Share ${translation.cantonese}`}
										>
											{historyAction?.key === translation.key && historyAction.label === 'Shared' ? 'Shared' : 'Share'}
										</button>
										<button
											class="history-action-button"
											type="button"
											disabled={cardBusy}
											onclick={() => downloadHistoryCard(translation.cantonese, translation.jyutping)}
											aria-label={`Download ${translation.cantonese} as a PNG card`}
										>PNG</button>
									</div>
								</div>
							{/each}
						</div>
					</article>
				{/each}
			</div>

			<nav class="pagination" aria-label="Translation history pages">
				<button type="button" disabled={historyPage <= 1 || historyLoading} onclick={() => loadHistory(historyPage - 1)} aria-label="Previous page">← Previous</button>
				<span>Page {historyPage} of {historyTotalPages}</span>
				<button type="button" disabled={historyPage >= historyTotalPages || historyLoading} onclick={() => loadHistory(historyPage + 1)} aria-label="Next page">Next →</button>
			</nav>
		{/if}
		{/if}
	</section>
	</div>
	<section class="home-reading home-area-read" aria-labelledby="home-reading-heading">
		<div class="home-reading-header"><h2 id="home-reading-heading" class="home-panel-heading">Read</h2><a href="/reading">All articles →</a></div>
		<div class="home-reading-list">
			{#each data.articles as article (article.slug)}
				<a href={`/reading/${article.slug}`} class="home-reading-link">
					<span class="home-reading-genre">{article.genre} · {article.sentence_count} sentences · {article.like_count} {article.like_count === 1 ? 'like' : 'likes'}</span>
					<span class="home-reading-title">{article.title}</span>
					<span class="home-reading-arrow" aria-hidden="true">↗</span>
				</a>
			{:else}
				<p class="home-reading-empty">New reading is coming soon.</p>
			{/each}
		</div>
	</section>
	</div>

	<footer class="mt-10 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-faint)] sm:mt-14">Jyutping romanisation · Traditional Chinese</footer>
</main>
