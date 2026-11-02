<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Choose a new password · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>New password</h1>
	{#if data.valid}
		<form class="auth-form" method="POST" use:enhance={() => { busy = true; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
			<label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
			<label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
			<button class="auth-primary" type="submit" disabled={busy}>Save and sign in</button>
			{#if form?.message}<p class="auth-message error" role="alert">{form.message}</p>{/if}
		</form>
	{:else}
		<p class="auth-copy">This link has expired or was already used.</p>
		<p class="auth-links"><a href="/reset">Ask for a new link</a></p>
	{/if}
</main>
