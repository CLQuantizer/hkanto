import { fail, redirect } from '@sveltejs/kit';
import { emailError, emailTakenBySomeoneElse, loadCurrentAccount, normalizeEmail, removeAccountEmail, saveAccountPassword } from '$lib/server/accounts';
import { createAccountToken } from '$lib/server/account-tokens';
import { sendLinkEmail } from '$lib/server/mailer';
import { PASSKEY_SESSION_COOKIE } from '$lib/server/passkeys';
import type { Actions, PageServerLoad } from './$types';

const NOTICES: Record<string, string> = {
	'verify=sent': 'Check your inbox. Your email is saved once you click the link we sent.',
	'verify=failed': 'We couldn’t send the confirmation email. Try adding your email again in a little while.',
	'verify=taken': 'That email is already used by another account, so it wasn’t added.',
	'password=saved': 'Password saved.',
	'password=reset': 'Your password was reset. You’re signed in.',
	'email=removed': 'Email removed.'
};

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const user = await loadCurrentAccount(locals.passkeyUserId, platform?.env.HK_DB);
	if (!user) redirect(303, '/login');
	const notice = [...url.searchParams].map(([key, value]) => NOTICES[`${key}=${value}`]).find(Boolean) ?? null;
	return { account: user, notice };
};

export const actions: Actions = {
	requestEmail: async ({ request, locals, platform, url }) => {
		const db = platform?.env.HK_DB;
		if (!locals.passkeyUserId || !db) return fail(401, { formId: 'email', message: 'Sign in again to add an email.' });
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		const problem = emailError(email) ?? (email ? null : 'Enter an email address.');
		if (problem) return fail(400, { formId: 'email', message: problem, email });
		if (await emailTakenBySomeoneElse(db, email, locals.passkeyUserId)) {
			return fail(409, { formId: 'email', message: 'That email is already used by another account.', email });
		}
		const token = await createAccountToken(db, locals.passkeyUserId, 'verify_email', email);
		if (!token) return fail(429, { formId: 'email', message: 'Too many emails sent. Try again in an hour.', email });
		const sent = await sendLinkEmail(platform?.env, {
			to: email,
			subject: 'Confirm your email for 講粵語',
			intro: 'Confirm this address so you can reset your password if you ever forget it.',
			linkLabel: 'Confirm email',
			link: `${url.origin}/verify-email/${token}`,
			outro: 'The link works for 24 hours. If you didn’t ask for this, ignore this email.'
		});
		redirect(303, `/account?verify=${sent ? 'sent' : 'failed'}`);
	},

	removeEmail: async ({ locals, platform }) => {
		const db = platform?.env.HK_DB;
		if (!locals.passkeyUserId || !db) return fail(401, { formId: 'email', message: 'Sign in again.' });
		await removeAccountEmail(db, locals.passkeyUserId);
		redirect(303, '/account?email=removed');
	},

	savePassword: async ({ request, locals, platform }) => {
		const db = platform?.env.HK_DB;
		if (!locals.passkeyUserId || !db) return fail(401, { formId: 'password', message: 'Sign in again to update your password.' });
		const form = await request.formData();
		const result = await saveAccountPassword(db, locals.passkeyUserId, {
			currentPassword: String(form.get('currentPassword') ?? ''),
			password: String(form.get('password') ?? ''),
			confirmPassword: String(form.get('confirmPassword') ?? '')
		});
		if (!result.ok) return fail(result.status, { formId: 'password', message: result.message });
		redirect(303, '/account?password=saved');
	},

	logout: async ({ cookies, url }) => {
		cookies.delete(PASSKEY_SESSION_COOKIE, { path: '/', sameSite: 'strict', secure: url.protocol === 'https:' });
		redirect(303, '/');
	}
};
