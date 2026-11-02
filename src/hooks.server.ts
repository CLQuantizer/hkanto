import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifySessionToken } from '$lib/server/gems-auth';
import { ADMIN_COOKIE, verifyAdminSession } from '$lib/server/admin-auth';
import { PASSKEY_SESSION_COOKIE, verifyPasskeySession } from '$lib/server/passkeys';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.isGemsAdmin = await verifySessionToken(
		event.cookies.get(SESSION_COOKIE),
		event.platform?.env.GEMS_SESSION_SECRET
	);
	event.locals.isAdmin = await verifyAdminSession(
		event.cookies.get(ADMIN_COOKIE),
		event.platform?.env.GEMS_SESSION_SECRET
	);
	event.locals.passkeyUserId = await verifyPasskeySession(
		event.cookies.get(PASSKEY_SESSION_COOKIE),
		event.platform?.env.GEMS_SESSION_SECRET
	);
	return resolve(event);
};
