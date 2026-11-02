export type TokenPurpose = 'reset_password' | 'verify_email';

const TOKEN_LIFETIME_MS: Record<TokenPurpose, number> = {
	reset_password: 60 * 60 * 1000,
	verify_email: 24 * 60 * 60 * 1000
};
const MAX_TOKENS_PER_HOUR = 3;

async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** Returns a new raw token, or null when this account has asked for too many in the last hour. */
export async function createAccountToken(db: D1Database, userId: string, purpose: TokenPurpose, email: string | null = null): Promise<string | null> {
	const recent = await db.prepare(
		`SELECT COUNT(*) AS n FROM account_tokens
		 WHERE user_id = ?1 AND purpose = ?2 AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`
	).bind(userId, purpose).first<{ n: number }>();
	if ((recent?.n ?? 0) >= MAX_TOKENS_PER_HOUR) return null;
	const token = randomToken();
	const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS[purpose]).toISOString();
	await db.prepare(
		'INSERT INTO account_tokens (token_hash, user_id, purpose, email, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)'
	).bind(await hashToken(token), userId, purpose, email, expiresAt).run();
	return token;
}

/** Checks a token without using it, for showing the reset form. */
export async function peekAccountToken(db: D1Database, token: string, purpose: TokenPurpose): Promise<boolean> {
	if (!token || token.length > 100) return false;
	const row = await db.prepare(
		`SELECT 1 FROM account_tokens
		 WHERE token_hash = ?1 AND purpose = ?2 AND used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
	).bind(await hashToken(token), purpose).first();
	return Boolean(row);
}

/** Marks a valid token used and returns its account. Each token works once. */
export async function consumeAccountToken(db: D1Database, token: string, purpose: TokenPurpose): Promise<{ userId: string; email: string | null } | null> {
	if (!token || token.length > 100) return null;
	const row = await db.prepare(
		`UPDATE account_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE token_hash = ?1 AND purpose = ?2 AND used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 RETURNING user_id, email`
	).bind(await hashToken(token), purpose).first<{ user_id: string; email: string | null }>();
	return row ? { userId: row.user_id, email: row.email } : null;
}

export async function revokeAccountTokens(db: D1Database, userId: string, purpose: TokenPurpose) {
	await db.prepare(
		`UPDATE account_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE user_id = ?1 AND purpose = ?2 AND used_at IS NULL`
	).bind(userId, purpose).run();
}
