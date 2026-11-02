import { findResettableAccount } from '$lib/server/accounts';
import { createAccountToken } from '$lib/server/account-tokens';
import { sendLinkEmail } from '$lib/server/mailer';
import type { Actions } from './$types';

export const actions: Actions = {
	// The reply is the same whether or not the account exists, so this page cannot be used to find accounts.
	default: async ({ request, platform, url }) => {
		const db = platform?.env.HK_DB;
		const identifier = String((await request.formData()).get('identifier') ?? '');
		const account = db ? await findResettableAccount(db, identifier) : null;
		if (db && account) {
			const token = await createAccountToken(db, account.userId, 'reset_password');
			if (token) {
				await sendLinkEmail(platform?.env, {
					to: account.email,
					subject: 'Reset your 講粵語 password',
					intro: 'Someone asked to reset the password for your account. Choose a new one here:',
					linkLabel: 'Choose a new password',
					link: `${url.origin}/reset/${token}`,
					outro: 'The link works once, for one hour. If you didn’t ask for this, ignore this email; your password stays the same.'
				});
			}
		}
		return { requested: true };
	}
};
