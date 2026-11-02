<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import SiteHeader from '$lib/components/SiteHeader.svelte';

	let { data, children } = $props();

	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/') return 'home';
		if (path.startsWith('/reading')) return 'reading';
		if (path.startsWith('/tones')) return 'tones';
		return null;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-7 sm:pt-6">
	<SiteHeader user={data.user} {current} />
</div>
{@render children()}
