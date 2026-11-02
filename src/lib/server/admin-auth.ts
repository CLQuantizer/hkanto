import { createSessionToken, verifySessionToken } from '$lib/server/gems-auth';

export const ADMIN_COOKIE = 'hk_admin';
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 183;

// A separate signing key keeps a gems session from being replayed as a site admin session.
const adminKey = (secret: string) => `${secret}:hk-admin`;

export function createAdminSession(secret: string): Promise<string> {
	return createSessionToken(adminKey(secret), ADMIN_SESSION_MAX_AGE);
}

export function verifyAdminSession(token: string | undefined, secret: string | undefined): Promise<boolean> {
	return verifySessionToken(token, secret ? adminKey(secret) : undefined);
}
