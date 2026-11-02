import type { Cookies } from '@sveltejs/kit';

const VISITOR_COOKIE = 'hk_visitor';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365 * 2;

/** Signed-in accounts like as themselves; anonymous readers get a long-lived random visitor id. */
export function likerId(passkeyUserId: string | null, cookies: Cookies, create: boolean, secure: boolean): string | null {
	if (passkeyUserId) return `user:${passkeyUserId}`;
	let visitor = cookies.get(VISITOR_COOKIE);
	if (!visitor || !/^[a-f0-9-]{36}$/.test(visitor)) {
		if (!create) return null;
		visitor = crypto.randomUUID();
		cookies.set(VISITOR_COOKIE, visitor, { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: VISITOR_MAX_AGE });
	}
	return `visitor:${visitor}`;
}
