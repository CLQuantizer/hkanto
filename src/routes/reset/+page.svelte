<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Reset password · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>Reset password</h1>
	{#if form?.requested}
		<p class="auth-copy" role="status">If that account has a confirmed email, a reset link is on its way. It works for one hour.</p>
		<p class="auth-hint">No email on your account? Sign in with a passkey instead, then set a new password from your account page.</p>
	{:else}
		<p class="auth-copy">We’ll email a reset link to the address confirmed on your account.</p>
		<form class="auth-form" method="POST" use:enhance={() => { busy = true; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
			<label>Username or email<input name="identifier" autocomplete="username" required spellcheck="false" /></label>
			<button class="auth-primary" type="submit" disabled={busy}>Send reset link</button>
		</form>
	{/if}
	<p class="auth-links"><a href="/login">Back to sign in</a></p>
</main>
