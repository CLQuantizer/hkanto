const SESSION_COOKIE = 'gems_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
	return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function passwordsMatch(provided: string, expected: string, secret: string): Promise<boolean> {
	const key = await getHmacKey(secret);
	const [providedHash, expectedHash] = await Promise.all([
		crypto.subtle.sign('HMAC', key, encoder.encode(provided)),
		crypto.subtle.sign('HMAC', key, encoder.encode(expected))
	]);
	const providedBytes = new Uint8Array(providedHash);
	const expectedBytes = new Uint8Array(expectedHash);
	let difference = providedBytes.length ^ expectedBytes.length;
	for (let index = 0; index < providedBytes.length; index += 1) {
		difference |= providedBytes[index] ^ (expectedBytes[index] ?? 0);
	}
	return difference === 0;
}

export async function createSessionToken(secret: string, maxAge = SESSION_MAX_AGE): Promise<string> {
	const expiresAt = Math.floor(Date.now() / 1000) + maxAge;
	const payload = String(expiresAt);
	const signature = await crypto.subtle.sign('HMAC', await getHmacKey(secret), encoder.encode(payload));
	return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined): Promise<boolean> {
	if (!token || !secret) return false;
	const [payload, encodedSignature, ...extra] = token.split('.');
	if (!payload || !encodedSignature || extra.length > 0) return false;
	const expiresAt = Number(payload);
	if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
	try {
		return await crypto.subtle.verify(
			'HMAC',
			await getHmacKey(secret),
			fromBase64Url(encodedSignature),
			encoder.encode(payload)
		);
	} catch {
		return false;
	}
}

export { SESSION_COOKIE };
