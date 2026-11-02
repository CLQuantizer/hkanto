import type { Cookies } from '@sveltejs/kit';
import { PASSKEY_SESSION_MAX_AGE, createPasskeySession, setPasskeySessionCookie } from '$lib/server/passkeys';

export async function startAccountSession(cookies: Cookies, userId: string, secret: string, url: URL) {
	const token = await createPasskeySession(userId, secret);
	setPasskeySessionCookie(cookies, token, url.protocol === 'https:', PASSKEY_SESSION_MAX_AGE);
}
