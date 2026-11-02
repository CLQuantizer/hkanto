import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { hashPassword, verifyStoredPassword } from '$lib/server/passwords';
import { parseTransports } from '$lib/server/passkeys';

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 60;

export interface PublicAccount {
	username: string;
	displayName: string;
	email: string | null;
	hasPassword: boolean;
	hasPasskey: boolean;
}

export type AccountResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

interface AccountRow {
	id: string;
	username: string;
	display_name: string;
	email: string | null;
	password_hash: string | null;
	has_password: number;
	has_passkey: number;
}

function failure(status: number, message: string): AccountResult<never> {
	return { ok: false, status, message };
}

export function normalizeUsername(value: string): string {
	return value.trim().toLowerCase();
}

export function normalizeDisplayName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

export function usernameError(username: string): string | null {
	if (!USERNAME_PATTERN.test(username)) {
		return 'Use a username of 3–32 characters: letters, numbers, dots, underscores, or hyphens.';
	}
	return null;
}

export function displayNameError(displayName: string): string | null {
	if (!displayName || displayName.length > DISPLAY_NAME_MAX_LENGTH) return 'Add a display name up to 60 characters.';
	return null;
}

export function emailError(email: string): string | null {
	if (!email) return null;
	if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
	return null;
}

export function passwordError(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
		return `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
	}
	return null;
}

function isUniqueConstraint(err: unknown): boolean {
	return err instanceof Error && err.message.includes('UNIQUE constraint failed');
}

export async function getAccount(db: D1Database, userId: string): Promise<PublicAccount | null> {
	const row = await db
		.prepare(
			`SELECT username, display_name, email,
				password_hash IS NOT NULL AS has_password,
				EXISTS(SELECT 1 FROM passkeys WHERE user_id = passkey_users.id) AS has_passkey
			 FROM passkey_users WHERE id = ?1`
		)
		.bind(userId)
		.first<Pick<AccountRow, 'username' | 'display_name' | 'email' | 'has_password' | 'has_passkey'>>();
	if (!row) return null;
	return {
		username: row.username,
		displayName: row.display_name,
		email: row.email,
		hasPassword: Boolean(row.has_password),
		hasPasskey: Boolean(row.has_passkey)
	};
}

export async function loadCurrentAccount(userId: string | null, db: D1Database | undefined): Promise<PublicAccount | null> {
	if (!userId || !db) return null;
	try {
		return await getAccount(db, userId);
	} catch (err) {
		console.error({ event: 'account_lookup_failed', error: err instanceof Error ? err.message : String(err) });
		return null;
	}
}

async function emailTakenBySomeoneElse(db: D1Database, email: string, userId: string): Promise<boolean> {
	const owner = await db
		.prepare('SELECT id FROM passkey_users WHERE email = ?1 AND id != ?2')
		.bind(email, userId)
		.first<{ id: string }>();
	return Boolean(owner);
}

/**
 * Creates a new account or reuses an abandoned sign-up that never received a passkey or password.
 * Accounts that can already sign in are left untouched.
 */
async function claimAccount(
	db: D1Database,
	username: string,
	displayName: string,
	email: string,
	passwordHash: string | null
): Promise<AccountResult<{ userId: string }>> {
	const existing = await db
		.prepare(
			`SELECT id,
				password_hash IS NOT NULL AS has_password,
				EXISTS(SELECT 1 FROM passkeys WHERE user_id = passkey_users.id) AS has_passkey
			 FROM passkey_users WHERE username = ?1`
		)
		.bind(username)
		.first<{ id: string; has_password: number; has_passkey: number }>();

	if (existing?.has_password || existing?.has_passkey) {
		return failure(409, 'That username is already registered. Sign in instead.');
	}

	const userId = existing?.id ?? crypto.randomUUID();
	if (email && (await emailTakenBySomeoneElse(db, email, userId))) {
		return failure(409, 'That email is already registered. Sign in instead.');
	}

	try {
		if (existing) {
			await db
				.prepare(
					`UPDATE passkey_users
					 SET display_name = ?1,
						 email = COALESCE(?2, email),
						 password_hash = COALESCE(?3, password_hash)
					 WHERE id = ?4`
				)
				.bind(displayName, email || null, passwordHash, userId)
				.run();
		} else {
			await db
				.prepare(
					`INSERT INTO passkey_users (id, username, display_name, email, password_hash)
					 VALUES (?1, ?2, ?3, ?4, ?5)`
				)
				.bind(userId, username, displayName, email || null, passwordHash)
				.run();
		}
	} catch (err) {
		if (isUniqueConstraint(err)) return failure(409, 'That username or email is already registered. Sign in instead.');
		throw err;
	}

	return { ok: true, value: { userId } };
}

export async function registerWithPassword(
	db: D1Database,
	input: { username: string; displayName: string; email: string; password: string; confirmPassword: string }
): Promise<AccountResult<{ userId: string }>> {
	const username = normalizeUsername(input.username);
	const displayName = normalizeDisplayName(input.displayName);
	const email = normalizeEmail(input.email);
	const problem = usernameError(username) ?? displayNameError(displayName) ?? emailError(email) ?? passwordError(input.password);
	if (problem) return failure(400, problem);
	if (input.password !== input.confirmPassword) return failure(400, 'Those passwords don’t match.');
	return claimAccount(db, username, displayName, email, await hashPassword(input.password));
}

export async function authenticateWithPassword(
	db: D1Database,
	identifier: string,
	password: string
): Promise<AccountResult<{ userId: string }>> {
	const normalized = identifier.trim().toLowerCase();
	if (!normalized || !password || password.length > PASSWORD_MAX_LENGTH) {
		return failure(400, 'Enter your username or email and password.');
	}
	const lookup = normalized.includes('@')
		? db.prepare('SELECT id, password_hash FROM passkey_users WHERE email = ?1')
		: db.prepare('SELECT id, password_hash FROM passkey_users WHERE username = ?1');
	const user = await lookup.bind(normalized).first<{ id: string; password_hash: string | null }>();
	const matches = await verifyStoredPassword(password, user?.password_hash ?? null);
	if (!user?.password_hash || !matches) return failure(400, 'Those details don’t match an account.');
	return { ok: true, value: { userId: user.id } };
}

export async function saveAccountPassword(
	db: D1Database,
	userId: string,
	input: { currentPassword: string; password: string; confirmPassword: string }
): Promise<AccountResult<{ userId: string }>> {
	const account = await db
		.prepare('SELECT password_hash FROM passkey_users WHERE id = ?1')
		.bind(userId)
		.first<{ password_hash: string | null }>();
	if (!account) return failure(401, 'Sign in again to update your password.');
	const problem = passwordError(input.password);
	if (problem) return failure(400, problem);
	if (input.password !== input.confirmPassword) return failure(400, 'Those passwords don’t match.');
	if (account.password_hash) {
		const matches = await verifyStoredPassword(input.currentPassword, account.password_hash);
		if (!matches) return failure(400, 'Current password is incorrect.');
	}
	await db.prepare('UPDATE passkey_users SET password_hash = ?1 WHERE id = ?2').bind(await hashPassword(input.password), userId).run();
	return { ok: true, value: { userId } };
}

export async function preparePasskeyAccount(
	db: D1Database,
	input: { signedInUserId: string | null; username: string; displayName: string; email: string }
): Promise<AccountResult<{ userId: string; username: string; displayName: string }>> {
	if (input.signedInUserId) {
		const account = await getAccount(db, input.signedInUserId);
		if (!account) return failure(401, 'Sign in again to add a passkey.');
		return { ok: true, value: { userId: input.signedInUserId, username: account.username, displayName: account.displayName } };
	}

	const username = normalizeUsername(input.username);
	const displayName = normalizeDisplayName(input.displayName);
	const email = normalizeEmail(input.email);
	const problem = usernameError(username) ?? displayNameError(displayName) ?? emailError(email);
	if (problem) return failure(400, problem);
	const claimed = await claimAccount(db, username, displayName, email, null);
	if (!claimed.ok) return claimed;
	return { ok: true, value: { userId: claimed.value.userId, username, displayName } };
}

export async function listPasskeyDescriptors(db: D1Database, userId: string) {
	const rows = await db
		.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?1')
		.bind(userId)
		.all<{ id: string; transports: string }>();
	return (rows.results ?? []).map((row) => ({
		id: row.id,
		transports: parseTransports(row.transports) as AuthenticatorTransportFuture[]
	}));
}

/** A logged-out passkey ceremony may finish only while the account still cannot sign in. */
export async function registrationMayContinue(db: D1Database, userId: string, authenticated: boolean): Promise<boolean> {
	if (authenticated) return true;
	const row = await db
		.prepare(
			`SELECT password_hash IS NOT NULL AS has_password,
				EXISTS(SELECT 1 FROM passkeys WHERE user_id = passkey_users.id) AS has_passkey
			 FROM passkey_users WHERE id = ?1`
		)
		.bind(userId)
		.first<{ has_password: number; has_passkey: number }>();
	if (!row) return false;
	return !row.has_password && !row.has_passkey;
}

export async function deleteIncompleteAccount(db: D1Database, userId: string) {
	await db
		.prepare(
			`DELETE FROM passkey_users
			 WHERE id = ?1
				 AND password_hash IS NULL
				 AND NOT EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1)`
		)
		.bind(userId)
		.run();
}
