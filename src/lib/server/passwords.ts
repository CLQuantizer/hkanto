const encoder = new TextEncoder();

/**
 * PBKDF2-HMAC-SHA256 iterations for new passwords.
 * Cloudflare Workers WebCrypto rejects counts above 100,000, so this is the strongest hash this Worker can create.
 * The previous 600,000 target throws before the account row is written, so production never stored one.
 */
export const PASSWORD_HASH_ITERATIONS = 100_000;
/** Refuse stored hashes weaker than the Workers ceiling. */
const MIN_PASSWORD_HASH_ITERATIONS = 100_000;
/**
 * Highest iteration count a stored hash may ask us to run.
 * Hashes encode their own count. 600,000 is the old value and still verifies where the runtime allows it.
 */
const MAX_STORED_PASSWORD_HASH_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const HASH_PREFIX = 'pbkdf2-sha256';

type SubtleWithTimingSafeEqual = SubtleCrypto & {
	timingSafeEqual?: (left: BufferSource, right: BufferSource) => boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array<ArrayBuffer> | null {
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(new ArrayBuffer(binary.length));
		for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
		return bytes;
	} catch {
		return null;
	}
}

function timingSafeEqual(left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean {
	const subtle = crypto.subtle as SubtleWithTimingSafeEqual;
	if (left.byteLength === right.byteLength && typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(left, right);
	}
	const length = Math.max(left.byteLength, right.byteLength);
	let difference = left.byteLength ^ right.byteLength;
	for (let index = 0; index < length; index += 1) {
		difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return difference === 0;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		HASH_BYTES * 8
	);
	return new Uint8Array(bits);
}

/** Workers raises NotSupportedError instead of deriving when the stored count is above its cap. */
function isPbkdf2IterationLimit(err: unknown): boolean {
	return err instanceof Error && err.name === 'NotSupportedError' && /iteration counts above/i.test(err.message);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
	const hash = await derivePassword(password, salt, PASSWORD_HASH_ITERATIONS);
	return `${HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [prefix, iterationText, saltText, hashText, extra] = stored.split('$');
	const iterations = Number(iterationText);
	if (
		prefix !== HASH_PREFIX ||
		extra !== undefined ||
		!Number.isInteger(iterations) ||
		iterations < MIN_PASSWORD_HASH_ITERATIONS ||
		iterations > MAX_STORED_PASSWORD_HASH_ITERATIONS
	) {
		return false;
	}
	const salt = saltText ? bytesFromBase64(saltText) : null;
	const expected = hashText ? bytesFromBase64(hashText) : null;
	if (!salt || !expected || salt.byteLength < SALT_BYTES || expected.byteLength !== HASH_BYTES) return false;
	try {
		const actual = await derivePassword(password, salt, iterations);
		return timingSafeEqual(actual, expected);
	} catch (err) {
		if (isPbkdf2IterationLimit(err)) return false;
		throw err;
	}
}

let dummyHash: Promise<string> | undefined;

/** Runs a real hash comparison even when the account has no password, so missing users are harder to time. */
export async function verifyStoredPassword(password: string, passwordHash: string | null): Promise<boolean> {
	if (!passwordHash) {
		dummyHash ??= hashPassword('not-a-real-password');
		await verifyPassword(password, await dummyHash);
		return false;
	}
	return verifyPassword(password, passwordHash);
}
