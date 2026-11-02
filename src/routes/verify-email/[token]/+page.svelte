<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Confirm email · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>{data.ok ? 'Email confirmed' : 'Link not valid'}</h1>
	<p class="auth-copy" role="status">{data.message}</p>
	<p class="auth-links"><a href="/account">Go to your account</a></p>
</main>
