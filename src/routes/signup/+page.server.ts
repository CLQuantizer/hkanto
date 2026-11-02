import { fail, redirect } from '@sveltejs/kit';
import { emailError, emailTakenBySomeoneElse, normalizeEmail, registerWithPassword } from '$lib/server/accounts';
import { createAccountToken } from '$lib/server/account-tokens';
import { sendLinkEmail } from '$lib/server/mailer';
import { startAccountSession } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.passkeyUserId) redirect(303, '/account');
};

export const actions: Actions = {
	default: async ({ request, cookies, platform, url }) => {
		const db = platform?.env.HK_DB;
		const secret = platform?.env.GEMS_SESSION_SECRET;
		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const email = normalizeEmail(String(form.get('email') ?? ''));
		if (!db || !secret) return fail(500, { message: 'Sign-up is not configured on this server.', username, email });
		const problem = emailError(email);
		if (problem) return fail(400, { message: problem, username, email });
		const result = await registerWithPassword(db, {
			username,
			password: String(form.get('password') ?? ''),
			confirmPassword: String(form.get('confirmPassword') ?? '')
		});
		if (!result.ok) return fail(result.status, { message: result.message, username, email });
		await startAccountSession(cookies, result.value.userId, secret, url);

		// The email is saved only after its owner clicks the link we send.
		if (!email) redirect(303, '/account');
		if (await emailTakenBySomeoneElse(db, email, result.value.userId)) redirect(303, '/account?verify=taken');
		const token = await createAccountToken(db, result.value.userId, 'verify_email', email);
		const sent = token !== null && await sendLinkEmail(platform?.env, {
			to: email,
			subject: 'Confirm your email for 講粵語',
			intro: 'Confirm this address so you can reset your password if you ever forget it.',
			linkLabel: 'Confirm email',
			link: `${url.origin}/verify-email/${token}`,
			outro: 'The link works for 24 hours. If you didn’t sign up, ignore this email.'
		});
		redirect(303, `/account?verify=${sent ? 'sent' : 'failed'}`);
	}
};
