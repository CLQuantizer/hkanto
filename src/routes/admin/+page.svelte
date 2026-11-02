<script lang="ts">
	import SentenceCard from './SentenceCard.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const savedId = $derived(form && 'saved' in form ? (form.saved ?? null) : null);
	const errorFor = (id: string) => (form && 'error' in form && 'id' in form && form.id === id ? (form.error ?? null) : null);
</script>

<svelte:head>
	<title>Admin · 講粵語</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main id="main-content" class="site-admin">
	{#if !data.authenticated}
		<section class="admin-login">
			<h1>Admin</h1>
			<form method="POST" action="?/login">
				<label for="password">Password</label>
				<input id="password" name="password" type="password" autocomplete="current-password" required />
				{#if form && 'loginError' in form}<p class="admin-error" role="alert">{form.loginError}</p>{/if}
				<button class="primary-button" type="submit">Sign in</button>
			</form>
		</section>
	{:else}
		<header class="site-admin-header">
			<div>
				<h1>Pronunciation reports</h1>
				<p>{data.stats.open_reports} open reports · {data.stats.edited} edited · {data.stats.sentences} sentences</p>
			</div>
			<form method="POST" action="?/logout"><button class="copy-button" type="submit">Sign out</button></form>
		</header>

		<form class="admin-search" method="GET" role="search">
			<label for="q">Find any sentence</label>
			<div>
				<input id="q" name="q" type="search" value={data.query} placeholder="Characters, Jyutping or Yale" />
				<button class="copy-button" type="submit">Search</button>
			</div>
		</form>

		{#if data.query}
			<section aria-labelledby="search-heading">
				<h2 id="search-heading">{data.found.length} matching “{data.query}”</h2>
				{#each data.found as sentence (sentence.id)}<SentenceCard {sentence} {savedId} error={errorFor(sentence.id)} />{:else}<p class="admin-empty">No sentences match.</p>{/each}
			</section>
		{/if}

		<section aria-labelledby="reported-heading">
			<h2 id="reported-heading">Reported</h2>
			{#each data.reported as sentence (sentence.id)}<SentenceCard {sentence} {savedId} error={errorFor(sentence.id)} />{:else}<p class="admin-empty">No open reports.</p>{/each}
		</section>
	{/if}
</main>

<style>
	.site-admin { width: min(100% - 2rem, 60rem); margin-inline: auto; padding-block: 0.5rem 4rem; }
	h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); font-weight: 650; letter-spacing: -0.04em; }
	h2 { margin-top: 2rem; border-bottom: 1px solid var(--line-strong); padding-bottom: 0.6rem; font-size: 1.05rem; font-weight: 650; }
	.admin-login { max-width: 24rem; padding-block: 2rem; }
	.admin-login form { display: grid; gap: 0.6rem; margin-top: 1.2rem; }
	label { display: grid; gap: 0.3rem; color: var(--ink-muted); font-size: 0.78rem; font-weight: 650; }
	input { border: 1px solid var(--line-strong); background: var(--paper-raised); padding: 0.55rem 0.7rem; color: var(--ink); font: inherit; font-size: 0.95rem; }
	input:focus-visible, .primary-button:focus-visible, .copy-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
	.site-admin-header { display: flex; justify-content: space-between; align-items: end; gap: 1rem; padding-block: 1rem; }
	.site-admin-header p { margin-top: 0.3rem; color: var(--ink-muted); font-size: 0.85rem; }
	.admin-search div { display: flex; gap: 0.5rem; }
	.admin-search input { flex: 1; min-width: 0; }
	.admin-error { color: var(--accent-dark); font-weight: 650; }
	.admin-empty { padding-block: 1rem; color: var(--ink-muted); }
</style>
