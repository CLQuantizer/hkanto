<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidJyutpingSyllables, jyutpingToYale } from '$lib/romanization';
	import type { AdminSentence } from './+page.server';

	let { sentence, savedId, error }: { sentence: AdminSentence; savedId: string | null; error: string | null } = $props();

	// Writable derived: edits are local, and saved data resets the field.
	let jyutping = $derived(sentence.jyutping ?? '');
	const invalid = $derived(invalidJyutpingSyllables(jyutping));
	const yalePreview = $derived(jyutpingToYale(jyutping));
	const dateFormat = new Intl.DateTimeFormat('en-HK', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<article class="admin-sentence">
	<p class="admin-cantonese" lang="yue-Hant">{sentence.cantonese}</p>
	<p class="admin-meta">
		{#each sentence.articles as slug (slug)}<a href={`/reading/${slug}`}>{slug}</a>{/each}
		<span>{sentence.annotation_model === 'admin' ? 'Edited by admin' : (sentence.annotation_model ?? 'No model')}</span>
	</p>
	{#if sentence.reports.length}
		<ul class="admin-reports" aria-label="Reports">
			{#each sentence.reports as report, index (index)}
				<li><strong>{report.romanization === 'yale' ? 'Yale' : 'Jyutping'}</strong> · {dateFormat.format(new Date(report.created_at))}{#if report.note}: {report.note}{/if}</li>
			{/each}
		</ul>
	{/if}
	<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<input type="hidden" name="id" value={sentence.id} />
		<label>Jyutping<textarea name="jyutping" rows="2" lang="yue-Latn" required bind:value={jyutping}></textarea></label>
		<p class="admin-yale"><span>Yale</span> <span lang="yue-Latn">{yalePreview}</span></p>
		{#if invalid.length}<p class="admin-error" role="alert">Not valid Jyutping: {invalid.join(', ')}</p>{/if}
		<div class="admin-actions">
			<button class="primary-button" type="submit" disabled={invalid.length > 0}>{sentence.reports.length ? 'Save and resolve' : 'Save'}</button>
			{#if sentence.reports.length}
				<button class="copy-button" type="submit" formaction="?/dismiss" formnovalidate>Dismiss reports</button>
			{/if}
			{#if savedId === sentence.id}<span role="status">Saved.</span>{/if}
			{#if error}<span class="admin-error" role="alert">{error}</span>{/if}
		</div>
	</form>
</article>

<style>
	.admin-sentence { display: grid; gap: 0.6rem; border-bottom: 1px solid var(--line); padding-block: 1.2rem; }
	.admin-cantonese { font-family: "Noto Sans HK", "PingFang HK", sans-serif; font-size: 1.3rem; line-height: 1.55; overflow-wrap: anywhere; }
	.admin-meta { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; color: var(--ink-faint); font-size: 0.75rem; }
	.admin-meta a { color: var(--accent-dark); }
	.admin-reports { display: grid; gap: 0.2rem; border-left: 2px solid var(--accent); padding-left: 0.8rem; color: var(--ink-muted); font-size: 0.85rem; }
	form { display: grid; gap: 0.6rem; }
	label { display: grid; gap: 0.3rem; color: var(--ink-muted); font-size: 0.78rem; font-weight: 650; }
	textarea { resize: vertical; border: 1px solid var(--line-strong); background: var(--paper-raised); padding: 0.55rem 0.7rem; color: var(--ink); font: inherit; font-size: 0.9rem; line-height: 1.5; }
	textarea:focus-visible, .primary-button:focus-visible, .copy-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.admin-yale { color: var(--ink-muted); font-size: 0.9rem; line-height: 1.5; overflow-wrap: anywhere; }
	.admin-yale span:first-child { color: var(--ink-faint); font-size: 0.75rem; font-weight: 650; }
	.admin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; font-size: 0.85rem; }
	.admin-error { color: var(--accent-dark); font-weight: 650; }
</style>
