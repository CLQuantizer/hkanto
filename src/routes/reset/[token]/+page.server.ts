import { fail, redirect } from '@sveltejs/kit';
import { resetAccountPassword } from '$lib/server/accounts';
import { consumeAccountToken, peekAccountToken, revokeAccountTokens } from '$lib/server/account-tokens';
import { startAccountSession } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.HK_DB;
	return { valid: Boolean(db) && await peekAccountToken(db!, params.token, 'reset_password') };
};

export const actions: Actions = {
	default: async ({ params, request, platform, cookies, url }) => {
		const db = platform?.env.HK_DB;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		if (!db || !secret) return fail(500, { message: 'Password reset is not configured on this server.' });
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmPassword = String(form.get('confirmPassword') ?? '');
		if (password !== confirmPassword) return fail(400, { message: 'Those passwords don’t match.' });
		const token = await consumeAccountToken(db, params.token, 'reset_password');
		if (!token) return fail(410, { message: 'This link has expired or was already used. Ask for a new one.' });
		const result = await resetAccountPassword(db, token.userId, { password, confirmPassword });
		if (!result.ok) return fail(result.status, { message: result.message });
		await revokeAccountTokens(db, token.userId, 'reset_password');
		await startAccountSession(cookies, token.userId, secret, url);
		redirect(303, '/account?password=reset');
	}
};
