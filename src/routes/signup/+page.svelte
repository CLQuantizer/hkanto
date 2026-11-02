<script lang="ts">
	import { enhance } from '$app/forms';
	import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
	import { passkeyError, readJson } from '$lib/passkey-client';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let username = $derived(form?.username ?? '');
	let busy = $state(false);
	let message = $state('');

	async function signUpWithPasskey() {
		if (!username.trim()) {
			message = 'Choose a username first.';
			return;
		}
		if (!browserSupportsWebAuthn()) {
			message = 'Passkeys aren’t available in this browser. Use a password instead.';
			return;
		}
		busy = true;
		message = '';
		try {
			const payload = (await readJson(await fetch('/api/passkeys/register/options', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username })
			}))) as { ceremonyId: string; options: PublicKeyCredentialCreationOptionsJSON };
			const credential = await startRegistration({ optionsJSON: payload.options });
			await readJson(await fetch('/api/passkeys/register/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ceremonyId: payload.ceremonyId, response: credential })
			}));
			window.location.assign('/account');
		} catch (err) {
			message = passkeyError(err, 'Could not create the passkey.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Create an account · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>Create an account</h1>
	<p class="auth-copy">Save your translation history. A username and password are all you need.</p>

	<form class="auth-form" method="POST" use:enhance={() => { busy = true; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
		<label>Username<input name="username" bind:value={username} autocomplete="username" minlength="3" maxlength="32" required spellcheck="false" /></label>
		<label>Password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
		<label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
		<label>Email <span>optional</span><input name="email" type="email" value={form?.email ?? ''} autocomplete="email" maxlength="254" spellcheck="false" /></label>
		<p class="auth-hint">Only used to reset your password. We’ll send a link to confirm it.</p>
		<button class="auth-primary" type="submit" disabled={busy}>Create account</button>
		{#if form?.message}<p class="auth-message error" role="alert">{form.message}</p>{/if}
	</form>

	<div class="auth-divider"><span>or</span></div>
	<button class="auth-secondary" type="button" disabled={busy} onclick={signUpWithPasskey}>Use a passkey instead</button>
	<p class="auth-hint">Uses the username above. No password needed.</p>
	{#if message}<p class="auth-message error" role="alert">{message}</p>{/if}

	<p class="auth-links">Already have an account? <a href="/login">Sign in</a></p>
</main>
