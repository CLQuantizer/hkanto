import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

export const PASSKEY_SESSION_COOKIE = 'passkey_session';
export const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;
export const PASSKEY_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export interface ChallengeRow {
	id: string;
	challenge: string;
	type: 'registration' | 'authentication';
	origin: string;
	rp_id: string;
	user_id: string | null;
	expires_at: number;
	authenticated?: number;
}

export interface PasskeyRow {
	id: string;
	user_id: string;
	public_key: ArrayBuffer;
	counter: number;
	transports: string;
	device_type: string;
	backed_up: number;
}

const TRANSPORTS = new Set<AuthenticatorTransportFuture>(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

export function getRelyingParty(url: URL) {
	return { origin: url.origin, rpID: url.hostname };
}

export function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
	copy.set(value);
	return copy;
}

export function readBytes(value: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
	if (value instanceof Uint8Array) return copyBytes(value);
	return new Uint8Array(value);
}

export function parseTransports(value: string): AuthenticatorTransportFuture[] {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is AuthenticatorTransportFuture => typeof item === 'string' && TRANSPORTS.has(item as AuthenticatorTransportFuture));
	} catch {
		return [];
	}
}

export function userHandleMatches(userHandle: string | undefined, userId: string): boolean {
	if (!userHandle) return true;
	try {
		return new TextDecoder().decode(decodeBase64Url(userHandle)) === userId;
	} catch {
		return false;
	}
}

export async function saveChallenge(
	db: D1Database,
	type: ChallengeRow['type'],
	challenge: string,
	origin: string,
	rpID: string,
	userID: string | null = null,
	authenticated = false
) {
	const id = crypto.randomUUID();
	const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_MAX_AGE_SECONDS;
	await db.batch([
		db.prepare('DELETE FROM passkey_challenges WHERE expires_at <= ?1').bind(Math.floor(Date.now() / 1000)),
		db.prepare(
			`INSERT INTO passkey_challenges (id, challenge, type, origin, rp_id, user_id, expires_at, authenticated)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
		).bind(id, challenge, type, origin, rpID, userID, expiresAt, authenticated ? 1 : 0)
	]);
	return id;
}

function encodeBase64Url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
	return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function getSessionKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createPasskeySession(userID: string, secret: string): Promise<string> {
	const expiresAt = Math.floor(Date.now() / 1000) + PASSKEY_SESSION_MAX_AGE;
	const payload = `${userID}:${expiresAt}`;
	const signature = await crypto.subtle.sign('HMAC', await getSessionKey(secret), encoder.encode(payload));
	return `${encodeBase64Url(encoder.encode(payload).buffer)}.${encodeBase64Url(signature)}`;
}

export async function verifyPasskeySession(token: string | undefined, secret: string | undefined): Promise<string | null> {
	if (!token || !secret) return null;
	const [payloadPart, signaturePart, ...extra] = token.split('.');
	if (!payloadPart || !signaturePart || extra.length) return null;
	try {
		const payloadBytes = decodeBase64Url(payloadPart);
		const payload = new TextDecoder().decode(payloadBytes);
		const separator = payload.lastIndexOf(':');
		const userID = payload.slice(0, separator);
		const expiresAt = Number(payload.slice(separator + 1));
		if (!userID || !Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
		const valid = await crypto.subtle.verify(
			'HMAC',
			await getSessionKey(secret),
			decodeBase64Url(signaturePart),
			payloadBytes
		);
		return valid ? userID : null;
	} catch {
		return null;
	}
}

export async function consumeChallenge(
	db: D1Database,
	id: string,
	type: ChallengeRow['type']
): Promise<ChallengeRow | null> {
	const challenge = await db.prepare(
		`SELECT id, challenge, type, origin, rp_id, user_id, expires_at, authenticated
		 FROM passkey_challenges WHERE id = ?1 AND type = ?2`
	).bind(id, type).first<ChallengeRow>();
	await db.prepare('DELETE FROM passkey_challenges WHERE id = ?1').bind(id).run();
	if (!challenge || challenge.expires_at <= Math.floor(Date.now() / 1000)) return null;
	return challenge;
}

export function setPasskeySessionCookie(
	cookies: RequestEvent['cookies'],
	token: string,
	secure: boolean,
	maxAge: number
) {
	cookies.set(PASSKEY_SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge
	});
}
