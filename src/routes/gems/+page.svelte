<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Cantonese Gems · 講粵語</title>
	<meta name="description" content="Practical notes on everyday Hong Kong Cantonese." />
</svelte:head>

<main class="gems-shell">

	<header class="gems-hero">
		<p class="eyebrow">Cantonese Gems</p>
		<h1>Notes for sounding<br />more like Hong Kong.</h1>
		<p>Short, practical articles about the words, rhythms, and habits of everyday Cantonese.</p>
	</header>

	<section aria-labelledby="articles-heading">
		<div class="section-heading">
			<h2 id="articles-heading">Latest articles</h2>
			<span>{data.gems.length} {data.gems.length === 1 ? 'article' : 'articles'}</span>
		</div>
		{#if data.gems.length}
			<div class="gems-list">
				{#each data.gems as gem, index (gem.slug)}
					<a href={`/gems/${gem.slug}`} class="gem-row">
						<span class="gem-number">{String(index + 1).padStart(2, '0')}</span>
						<div><h3>{gem.title}</h3><p>{gem.excerpt}</p></div>
						<time datetime={gem.updated_at}>{new Date(gem.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
						<span class="gem-arrow" aria-hidden="true">→</span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="gems-empty">The first gem is being polished. Check back soon.</p>
		{/if}
	</section>
</main>
