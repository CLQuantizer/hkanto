<script lang="ts">
	import { enhance } from '$app/forms';
	import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let username = $state('');
	let displayName = $state('');
	let email = $state('');
	let busy = $state(false);
	let message = $state('');
	let isError = $state(false);

	async function readResponse(response: Response) {
		const payload = (await response.json().catch(() => null)) as { message?: string } | null;
		if (!response.ok) throw new Error(payload?.message ?? `Request failed (${response.status})`);
		return payload;
	}

	function passkeyError(err: unknown, fallback: string) {
		if (err instanceof Error) {
			if (err.name === 'NotAllowedError') return 'The passkey prompt was closed, or this device has no passkey for this site. You can use a password instead.';
			if (err.name === 'InvalidStateError') return 'That passkey is already saved on this account.';
			if (err.name === 'SecurityError') return 'Passkeys need localhost or HTTPS.';
			if (err.message) return err.message;
		}
		return fallback;
	}

	async function registerPasskey() {
		if (!browserSupportsWebAuthn()) {
			isError = true;
			message = 'Passkeys aren’t available in this browser. Create the account with a password instead.';
			return;
		}
		busy = true;
		message = '';
		isError = false;
		try {
			const optionResponse = await fetch('/api/passkeys/register/options', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(data.user ? {} : { username, displayName, email })
			});
			const payload = (await readResponse(optionResponse)) as unknown as {
				ceremonyId: string;
				options: PublicKeyCredentialCreationOptionsJSON;
			};
			const credential = await startRegistration({ optionsJSON: payload.options });
			const verifyResponse = await fetch('/api/passkeys/register/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ceremonyId: payload.ceremonyId, response: credential })
			});
			await readResponse(verifyResponse);
			window.location.assign('/');
		} catch (err) {
			isError = true;
			message = passkeyError(err, 'Could not create the passkey.');
		} finally {
			busy = false;
		}
	}

	async function signInWithPasskey() {
		if (!browserSupportsWebAuthn()) {
			isError = true;
			message = 'Passkeys aren’t available in this browser. Sign in with a password.';
			return;
		}
		busy = true;
		message = '';
		isError = false;
		try {
			const optionResponse = await fetch('/api/passkeys/authenticate/options', { method: 'POST' });
			const payload = (await readResponse(optionResponse)) as unknown as {
				ceremonyId: string;
				options: PublicKeyCredentialRequestOptionsJSON;
			};
			const credential = await startAuthentication({ optionsJSON: payload.options });
			const verifyResponse = await fetch('/api/passkeys/authenticate/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ceremonyId: payload.ceremonyId, response: credential })
			});
			await readResponse(verifyResponse);
			window.location.assign('/');
		} catch (err) {
			isError = true;
			message = passkeyError(err, 'Could not sign in with a passkey.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{data.user ? 'Account' : 'Sign in'} · 講粵語</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="login-shell">
	<a class="login-mark" href="/" aria-label="Back to translator">講</a>
	<section class="account-panel" aria-labelledby="login-heading">
		<p class="login-kicker">Hong Kong Cantonese</p>
		<h1 id="login-heading">{data.user ? 'Account' : 'Sign in'}</h1>

		{#if data.user}
			<p class="login-copy">Signed in as <strong>{data.user.displayName}</strong> <span>@{data.user.username}</span></p>
			{#if data.user.email}<p class="login-meta">{data.user.email}</p>{/if}
			{#if data.passwordSaved}<p class="login-message" role="status">Password saved.</p>{/if}

			<div class="login-actions">
				<button class="login-primary" type="button" disabled={busy} onclick={registerPasskey}>
					{busy ? 'Waiting for passkey…' : data.user.hasPasskey ? 'Add another passkey' : 'Add a passkey'}
				</button>
			</div>

			<form class="login-form" method="POST" action="?/savePassword" use:enhance={() => { busy = true; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
				<h2>{data.user.hasPassword ? 'Change password' : 'Password backup'}</h2>
				{#if !data.user.hasPassword}
					<p class="login-hint">Set a password so you can sign in when a passkey isn’t available.</p>
				{/if}
				{#if data.user.hasPassword}
					<label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required /></label>
				{/if}
				<label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
				<label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
				<button class="login-secondary" type="submit" disabled={busy}>{data.user.hasPassword ? 'Update password' : 'Save password'}</button>
				{#if form?.formId === 'password-save' && form.message}<p class="login-message error" role="alert">{form.message}</p>{/if}
			</form>

			<form method="POST" action="?/logout"><button class="login-secondary" type="submit">Sign out</button></form>
		{:else}
			<p class="login-copy">Use a passkey, or a username and password. History stays on your account.</p>
			<div class="login-actions">
				<button class="login-primary" type="button" disabled={busy} onclick={signInWithPasskey}>Sign in with a passkey</button>
			</div>

			<div class="login-divider"><span>Password</span></div>
			<form method="POST" action="?/signInWithPassword" use:enhance={() => { busy = true; message = ''; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
				<label>Username or email<input name="identifier" autocomplete="username" required /></label>
				<label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required /></label>
				<button class="login-secondary" type="submit" disabled={busy}>Sign in with password</button>
				{#if form?.formId === 'password-login' && form.message}<p class="login-message error" role="alert">{form.message}</p>{/if}
			</form>

			<div class="login-divider"><span>New account</span></div>
			<form method="POST" action="?/register" use:enhance={() => { busy = true; message = ''; return async ({ update }) => { try { await update(); } finally { busy = false; } }; }}>
				<label>Username<input name="username" bind:value={username} autocomplete="username" minlength="3" maxlength="32" required spellcheck="false" /></label>
				<label>Display name<input name="displayName" bind:value={displayName} autocomplete="name" maxlength="60" required /></label>
				<label>Email <span>optional</span><input name="email" type="email" bind:value={email} autocomplete="email" maxlength="254" spellcheck="false" /></label>
				<label>Password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
				<label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></label>
				<button class="login-primary" type="submit" disabled={busy}>Create account</button>
				<button class="login-secondary" type="button" disabled={busy} onclick={registerPasskey}>
					{busy ? 'Waiting for passkey…' : 'Create account with a passkey'}
				</button>
				{#if form?.formId === 'register' && form.message}<p class="login-message error" role="alert">{form.message}</p>{/if}
			</form>
		{/if}

		{#if message}<p class:error={isError} class="login-message" role="status">{message}</p>{/if}
	</section>
</main>

<style>
	.login-shell { min-height: 100vh; padding: clamp(1.25rem, 5vw, 4rem); background: var(--paper); color: var(--ink); }
	.login-mark { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; background: var(--accent); color: var(--paper); font-family: "Noto Sans HK", sans-serif; font-weight: 700; }
	.account-panel { width: min(100%, 31rem); margin-top: clamp(3rem, 10vh, 7rem); }
	.login-kicker { color: var(--accent); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin-top: 0.45rem; font-size: clamp(2.4rem, 8vw, 4.5rem); font-weight: 650; line-height: 0.95; letter-spacing: -0.055em; }
	h2 { font-size: 1rem; font-weight: 650; letter-spacing: -0.02em; }
	.login-copy { margin-top: 1.5rem; color: var(--ink-muted); line-height: 1.7; }
	.login-copy span, .login-meta, .login-hint, label span { color: var(--ink-faint); }
	.login-meta { margin-top: 0.35rem; font-size: 0.875rem; }
	.login-hint { margin-top: 0.4rem; font-size: 0.875rem; line-height: 1.5; }
	.login-actions, form { margin-top: 1.75rem; }
	.login-form { display: grid; }
	.login-primary, .login-secondary { min-height: 3rem; width: 100%; padding: 0.7rem 1rem; font-weight: 650; }
	.login-primary { background: var(--ink); color: var(--paper); }
	.login-secondary { border: 1px solid var(--line-strong); color: var(--ink); background: transparent; }
	form .login-secondary, form .login-primary { margin-top: 1rem; }
	button:disabled { opacity: 0.4; }
	.login-divider { display: flex; align-items: center; gap: 1rem; margin-block: 1.75rem; color: var(--ink-faint); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; }
	.login-divider::before, .login-divider::after { height: 1px; flex: 1; background: var(--line); content: ''; }
	label { display: grid; gap: 0.45rem; margin-top: 1rem; color: var(--ink-muted); font-size: 0.8rem; font-weight: 650; }
	label span { font-weight: 500; }
	input { min-height: 3rem; width: 100%; border: 1px solid var(--line-strong); background: var(--paper-raised); padding: 0.65rem 0.8rem; color: var(--ink); font-size: 1rem; font-weight: 500; }
	input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	.login-message { margin-top: 1rem; color: var(--ink-muted); font-size: 0.875rem; line-height: 1.5; }
	.login-message.error { color: var(--accent-dark); }
</style>
