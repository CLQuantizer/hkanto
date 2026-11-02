import { loadCurrentAccount } from '$lib/server/accounts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const account = await loadCurrentAccount(locals.passkeyUserId, platform?.env.HK_DB);
	return {
		user: account ? { username: account.username, displayName: account.displayName } : null
	};
};
