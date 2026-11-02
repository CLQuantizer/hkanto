<script lang="ts">
	import { enhance } from '$app/forms';
	import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
	import { passkeyError, readJson } from '$lib/passkey-client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
	let message = $state('');
	let editingEmail = $state(false);

	const submitting = () => { busy = true; return async ({ update }: { update: () => Promise<void> }) => { try { await update(); } finally { busy = false; } }; };

	async function addPasskey() {
		if (!browserSupportsWebAuthn()) {
			message = 'Passkeys aren’t available in this browser.';
			return;
		}
		busy = true;
		message = '';
		try {
			const payload = (await readJson(await fetch('/api/passkeys/register/options', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			}))) as { ceremonyId: string; options: PublicKeyCredentialCreationOptionsJSON };
			const credential = await startRegistration({ optionsJSON: payload.options });
			await readJson(await fetch('/api/passkeys/register/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ceremonyId: payload.ceremonyId, response: credential })
			}));
			window.location.reload();
		} catch (err) {
			message = passkeyError(err, 'Could not create the passkey.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Account · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="auth-shell">
	<h1>{data.account.displayName}</h1>
	<p class="auth-copy">@{data.account.username}</p>
	{#if data.notice}<p class="auth-message" role="status">{data.notice}</p>{/if}

	<section class="auth-section" aria-labelledby="email-heading">
		<h2 id="email-heading">Email</h2>
		{#if data.account.email && !editingEmail}
			<p class="auth-value">{data.account.email}</p>
			<div class="auth-row">
				<button class="auth-text-button" type="button" onclick={() => (editingEmail = true)}>Change</button>
				<form method="POST" action="?/removeEmail" use:enhance={submitting}><button class="auth-text-button" type="submit" disabled={busy}>Remove</button></form>
			</div>
		{:else}
			<p class="auth-hint">Optional. Add one to reset your password by email. We’ll send a link to confirm it.</p>
			<form class="auth-form" method="POST" action="?/requestEmail" use:enhance={submitting}>
				<label>Email<input name="email" type="email" value={form && 'email' in form ? (form.email ?? '') : ''} autocomplete="email" maxlength="254" required spellcheck="false" /></label>
				<button class="auth-secondary" type="submit" disabled={busy}>Send confirmation link</button>
			</form>
		{/if}
		{#if form?.formId === 'email' && form.message}<p class="auth-message error" role="alert">{form.message}</p>{/if}
	</section>

	<section class="auth-section" aria-labelledby="password-heading">
		<h2 id="password-heading">{data.account.hasPassword ? 'Change password' : 'Add a password'}</h2>
		<form class="auth-form" method="POST" action="?/savePassword" use:enhance={submitting}>
			{#if data.account.hasPassword}
				<label>Current password<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required /></label>
			{/if}
			<label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
			<label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
			<button class="auth-secondary" type="submit" disabled={busy}>Save password</button>
		</form>
		{#if form?.formId === 'password' && form.message}<p class="auth-message error" role="alert">{form.message}</p>{/if}
	</section>

	<section class="auth-section" aria-labelledby="passkey-heading">
		<h2 id="passkey-heading">Passkeys</h2>
		<p class="auth-hint">{data.account.hasPasskey ? 'You can sign in with a passkey.' : 'Sign in with your fingerprint, face or device PIN.'}</p>
		<button class="auth-secondary" type="button" disabled={busy} onclick={addPasskey}>{data.account.hasPasskey ? 'Add another passkey' : 'Add a passkey'}</button>
		{#if message}<p class="auth-message error" role="alert">{message}</p>{/if}
	</section>

	<form class="auth-section" method="POST" action="?/logout"><button class="auth-text-button" type="submit">Sign out</button></form>
</main>
