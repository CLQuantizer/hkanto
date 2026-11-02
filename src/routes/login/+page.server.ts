import { fail, redirect } from '@sveltejs/kit';
import { authenticateWithPassword } from '$lib/server/accounts';
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
		const identifier = String(form.get('identifier') ?? '');
		if (!db || !secret) return fail(500, { message: 'Sign-in is not configured on this server.', identifier });
		const result = await authenticateWithPassword(db, identifier, String(form.get('password') ?? ''));
		if (!result.ok) return fail(result.status, { message: result.message, identifier });
		await startAccountSession(cookies, result.value.userId, secret, url);
		redirect(303, '/');
	}
};
