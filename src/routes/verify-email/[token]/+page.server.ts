import { setVerifiedEmail } from '$lib/server/accounts';
import { consumeAccountToken } from '$lib/server/account-tokens';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.HK_DB;
	const token = db ? await consumeAccountToken(db, params.token, 'verify_email') : null;
	if (!db || !token?.email) return { ok: false, message: 'This link has expired or was already used.' };
	const result = await setVerifiedEmail(db, token.userId, token.email);
	return result.ok
		? { ok: true, message: `${result.value.email} is confirmed. You can now reset your password by email.` }
		: { ok: false, message: result.message };
};
