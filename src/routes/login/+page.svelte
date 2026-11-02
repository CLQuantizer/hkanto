<script lang="ts">
	import { enhance } from '$app/forms';
	import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
	import { passkeyError, readJson } from '$lib/passkey-client';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let busy = $state(false);
	let message = $state('');

	async function signInWithPasskey() {
		if (!browserSupportsWebAuthn()) {
			message = 'Passkeys aren’t available in this browser. Use your password instead.';
			return;
		}
		busy = true;
		message = '';
		try {
			const payload = (await readJson(await fetch('/api/passkeys/authenticate/options', { method: 'POST' }))) as {
				ceremonyId: string;
				options: PublicKeyCredentialRequestOptionsJSON;
			};
			const credential = await startAuthentication({ optionsJSON: payload.options });
			await readJson(await fetch('/api/passkeys/authenticate/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ceremonyId: payload.ceremonyId, response: credential })
			}));
			window.location.assign('/');
		} catch (err) {
			message = passkeyError(err, 'Could not sign in with a passkey.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>Sign in</h1>
	<p class="auth-copy">Your translation history stays on your account.</p>

	<button class="auth-primary" type="button" disabled={busy} onclick={signInWithPasskey}>Sign in with a passkey</button>
	{#if message}<p class="auth-message error" role="alert">{message}</p>{/if}

	<div class="auth-divider"><span>or</span></div>

	<form class="auth-form" method="POST" use:enhance={() => { busy = true; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
		<label>Username or email<input name="identifier" value={form?.identifier ?? ''} autocomplete="username" required spellcheck="false" /></label>
		<label>Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required /></label>
		<button class="auth-secondary" type="submit" disabled={busy}>Sign in with password</button>
		{#if form?.message}<p class="auth-message error" role="alert">{form.message}</p>{/if}
	</form>

	<p class="auth-links"><a href="/reset">Forgot your password?</a></p>
	<p class="auth-links">New here? <a href="/signup">Create an account</a></p>
</main>
