import { fail, redirect } from '@sveltejs/kit';
import { authenticateWithPassword, loadCurrentAccount, registerWithPassword, saveAccountPassword } from '$lib/server/accounts';
import { PASSKEY_SESSION_COOKIE, PASSKEY_SESSION_MAX_AGE, createPasskeySession, setPasskeySessionCookie } from '$lib/server/passkeys';
import type { Actions, PageServerLoad } from './$types';

function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

async function startSession(cookies: Parameters<typeof setPasskeySessionCookie>[0], userId: string, secret: string, url: URL) {
	const token = await createPasskeySession(userId, secret);
	setPasskeySessionCookie(cookies, token, url.protocol === 'https:', PASSKEY_SESSION_MAX_AGE);
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const user = await loadCurrentAccount(locals.passkeyUserId, platform?.env.HK_DB);
	return { user, passwordSaved: url.searchParams.get('password') === 'saved' };
};

export const actions: Actions = {
	signInWithPassword: async ({ request, cookies, platform, url }) => {
		const db = platform?.env.HK_DB;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		const form = await request.formData();
		const identifier = field(form, 'identifier');
		if (!db || !secret) return fail(500, { formId: 'password-login', message: 'Sign-in is not configured on this server.', identifier });
		const result = await authenticateWithPassword(db, identifier, field(form, 'password'));
		if (!result.ok) return fail(result.status, { formId: 'password-login', message: result.message, identifier });
		await startSession(cookies, result.value.userId, secret, url);
		redirect(303, '/');
	},

	register: async ({ request, cookies, platform, url, locals }) => {
		if (locals.passkeyUserId) return fail(400, { formId: 'register', message: 'Sign out before creating another account.' });
		const db = platform?.env.HK_DB;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		const form = await request.formData();
		const username = field(form, 'username');
		const displayName = field(form, 'displayName');
		const email = field(form, 'email');
		const values = { formId: 'register' as const, username, displayName, email };
		if (!db || !secret) return fail(500, { ...values, message: 'Sign-in is not configured on this server.' });
		const result = await registerWithPassword(db, {
			username,
			displayName,
			email,
			password: field(form, 'password'),
			confirmPassword: field(form, 'confirmPassword')
		});
		if (!result.ok) return fail(result.status, { ...values, message: result.message });
		await startSession(cookies, result.value.userId, secret, url);
		redirect(303, '/');
	},

	savePassword: async ({ request, locals, platform, url }) => {
		const db = platform?.env.HK_DB;
		if (!locals.passkeyUserId || !db) return fail(401, { formId: 'password-save', message: 'Sign in again to update your password.' });
		const form = await request.formData();
		const result = await saveAccountPassword(db, locals.passkeyUserId, {
			currentPassword: field(form, 'currentPassword'),
			password: field(form, 'password'),
			confirmPassword: field(form, 'confirmPassword')
		});
		if (!result.ok) return fail(result.status, { formId: 'password-save', message: result.message });
		redirect(303, '/login?password=saved');
	},

	logout: async ({ cookies, url }) => {
		cookies.delete(PASSKEY_SESSION_COOKIE, { path: '/', sameSite: 'strict', secure: url.protocol === 'https:' });
		redirect(303, '/login');
	}
};
