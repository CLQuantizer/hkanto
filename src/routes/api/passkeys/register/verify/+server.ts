import { error, isHttpError, json } from '@sveltejs/kit';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { deleteIncompleteAccount, registrationMayContinue } from '$lib/server/accounts';
import {
	consumeChallenge,
	copyBytes,
	createPasskeySession,
	PASSKEY_SESSION_MAX_AGE,
	setPasskeySessionCookie
} from '$lib/server/passkeys';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const db = platform?.env.HK_DB;
	const secret = platform?.env.GEMS_SESSION_SECRET;
	if (!db || !secret) error(500, 'Passkey registration is not configured.');
	const body = (await request.json().catch(() => null)) as { ceremonyId?: unknown; response?: unknown } | null;
	if (typeof body?.ceremonyId !== 'string' || !body.response || typeof body.response !== 'object') {
		error(400, 'Invalid registration response.');
	}

	const challenge = await consumeChallenge(db, body.ceremonyId, 'registration');
	if (!challenge?.user_id) error(400, 'Registration challenge expired.');
	const userId = challenge.user_id;
	if (!(await registrationMayContinue(db, userId, Boolean(challenge.authenticated)))) {
		error(409, 'That username is already registered. Sign in instead.');
	}
	let passkeySaved = false;

	try {
		const verification = await verifyRegistrationResponse({
			response: body.response as RegistrationResponseJSON,
			expectedChallenge: challenge.challenge,
			expectedOrigin: challenge.origin,
			expectedRPID: challenge.rp_id,
			requireUserVerification: true,
			supportedAlgorithmIDs: [-7, -257]
		});
		if (!verification.verified) error(400, 'Passkey registration was not verified.');
		const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
		await db
			.prepare(
				`INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
			)
			.bind(
				credential.id,
				userId,
				copyBytes(credential.publicKey),
				credential.counter,
				JSON.stringify(credential.transports ?? []),
				credentialDeviceType,
				credentialBackedUp ? 1 : 0
			)
			.run();
		passkeySaved = true;
		const token = await createPasskeySession(userId, secret);
		setPasskeySessionCookie(cookies, token, challenge.origin.startsWith('https://'), PASSKEY_SESSION_MAX_AGE);
		return json({ verified: true });
	} catch (err) {
		if (!passkeySaved) await deleteIncompleteAccount(db, userId);
		if (isHttpError(err)) throw err;
		console.error({ event: 'passkey_registration_failed', error: err instanceof Error ? err.message : String(err) });
		error(400, 'Passkey registration failed.');
	}
};
