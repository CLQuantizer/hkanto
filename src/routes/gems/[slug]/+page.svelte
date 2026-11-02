<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.gem.title} · Cantonese Gems</title>
</svelte:head>

<main class="article-shell">
	<header class="article-header">
		<p class="eyebrow">Cantonese Gems</p>
		<h1>{data.gem.title}</h1>
		<time datetime={data.gem.updated_at}>Updated {new Date(data.gem.updated_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</time>
	</header>
	<article class="gem-prose">{@html data.gem.html}</article>
	<footer class="article-footer"><a href="/gems">← Back to all gems</a></footer>
</main>
