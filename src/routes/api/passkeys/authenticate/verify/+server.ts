import { error, isHttpError, json } from '@sveltejs/kit';
import { verifyAuthenticationResponse, type AuthenticationResponseJSON, type WebAuthnCredential } from '@simplewebauthn/server';
import {
	consumeChallenge,
	createPasskeySession,
	parseTransports,
	PASSKEY_SESSION_MAX_AGE,
	readBytes,
	setPasskeySessionCookie,
	userHandleMatches,
	type PasskeyRow
} from '$lib/server/passkeys';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const db = platform?.env.HK_DB;
	const secret = platform?.env.GEMS_SESSION_SECRET;
	if (!db || !secret) error(500, 'Passkey login is not configured.');
	const body = (await request.json().catch(() => null)) as { ceremonyId?: unknown; response?: unknown } | null;
	if (typeof body?.ceremonyId !== 'string' || !body.response || typeof body.response !== 'object') {
		error(400, 'Invalid authentication response.');
	}
	const response = body.response as AuthenticationResponseJSON;
	const challenge = await consumeChallenge(db, body.ceremonyId, 'authentication');
	if (!challenge) error(400, 'Authentication challenge expired.');
	const stored = await db
		.prepare(
			`SELECT id, user_id, public_key, counter, transports, device_type, backed_up
			 FROM passkeys WHERE id = ?1`
		)
		.bind(response.id)
		.first<PasskeyRow>();
	if (!stored || !userHandleMatches(response.response?.userHandle, stored.user_id)) error(401, 'Passkey is not registered.');

	try {
		const credential: WebAuthnCredential = {
			id: stored.id,
			publicKey: readBytes(stored.public_key),
			counter: Number(stored.counter),
			transports: parseTransports(stored.transports)
		};
		const verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: challenge.origin,
			expectedRPID: challenge.rp_id,
			credential,
			requireUserVerification: true
		});
		if (!verification.verified) error(401, 'Passkey login was not verified.');
		await db
			.prepare(`UPDATE passkeys SET counter = ?1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2`)
			.bind(verification.authenticationInfo.newCounter, stored.id)
			.run();
		const token = await createPasskeySession(stored.user_id, secret);
		setPasskeySessionCookie(cookies, token, challenge.origin.startsWith('https://'), PASSKEY_SESSION_MAX_AGE);
		return json({ verified: true });
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error({ event: 'passkey_authentication_failed', error: err instanceof Error ? err.message : String(err) });
		error(401, 'Passkey login failed.');
	}
};
