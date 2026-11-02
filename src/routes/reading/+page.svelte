<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Read Cantonese · 講粵語</title>
	<meta name="description" content="Read Hong Kong Cantonese articles with Jyutping or Yale pronunciation and sentence translations." />
</svelte:head>

<main class="reading-shell">
	<header class="reading-hero">
		<p class="reading-eyebrow">Reading room</p>
		<h1>Read it in Cantonese.</h1>
		<p>Real Cantonese writing, with pronunciation when you want it and translations one sentence at a time.</p>
	</header>
	<section aria-labelledby="reading-list-heading">
		<div class="reading-list-heading"><h2 id="reading-list-heading">Articles</h2><span>{data.articles.length} available</span></div>
		{#each data.articles as article (article.slug)}
			<a class="reading-card" href={`/reading/${article.slug}`}>
				<div><span class="reading-genre">{article.genre}</span><h3>{article.title}</h3><p>{article.sentence_count} sentences · {article.like_count} {article.like_count === 1 ? 'like' : 'likes'}</p></div>
				<span aria-hidden="true">↗</span>
			</a>
		{:else}
			<p class="reading-empty">The first articles are on their way.</p>
		{/each}
	</section>
</main>

<style>
	.reading-shell { width: min(100% - 2.5rem, 60rem); margin-inline: auto; padding-block: 1rem 4rem; }
	.reading-hero { padding-block: clamp(2rem, 5vw, 3.5rem); }
	.reading-eyebrow, .reading-genre { color: var(--accent); font-size: 0.72rem; font-weight: 750; letter-spacing: 0.13em; text-transform: uppercase; }
	h1 { margin-top: 0.5rem; font-size: clamp(2.5rem, 6vw, 4rem); line-height: 1.05; font-weight: 650; letter-spacing: -0.05em; }
	.reading-hero > p:last-child { max-width: 38rem; margin-top: 0.75rem; color: var(--ink-muted); font-size: 0.98rem; line-height: 1.55; }
	.reading-list-heading { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--line-strong); padding-bottom: 1rem; }
	.reading-list-heading h2 { font-size: 1.25rem; font-weight: 650; }
	.reading-list-heading span, .reading-card p { color: var(--ink-faint); font-size: 0.82rem; }
	.reading-card { display: flex; justify-content: space-between; gap: 2rem; align-items: center; border-bottom: 1px solid var(--line); padding-block: 1rem; }
	.reading-card h3 { margin-block: 0.2rem; font-size: clamp(1.2rem, 2.5vw, 1.55rem); font-weight: 650; }
	.reading-card > span { color: var(--accent); font-size: 1.5rem; }
	.reading-card:hover h3 { color: var(--accent-dark); }
	.reading-empty { padding-block: 3rem; color: var(--ink-faint); }
</style>
