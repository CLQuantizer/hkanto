import { error, json } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { listPasskeyDescriptors, preparePasskeyAccount } from '$lib/server/accounts';
import { getRelyingParty, saveChallenge } from '$lib/server/passkeys';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals, url }) => {
	const db = platform?.env.HK_DB;
	if (!db || !platform?.env.GEMS_SESSION_SECRET) error(500, 'Passkey registration is not configured.');

	const body = (await request.json().catch(() => null)) as {
		username?: unknown;
		displayName?: unknown;
		email?: unknown;
	} | null;
	const prepared = await preparePasskeyAccount(db, {
		signedInUserId: locals.passkeyUserId,
		username: typeof body?.username === 'string' ? body.username : '',
		displayName: typeof body?.displayName === 'string' ? body.displayName : '',
		email: typeof body?.email === 'string' ? body.email : ''
	});
	if (!prepared.ok) error(prepared.status, prepared.message);

	const { origin, rpID } = getRelyingParty(url);
	const options = await generateRegistrationOptions({
		rpName: '講粵語',
		rpID,
		userID: new TextEncoder().encode(prepared.value.userId),
		userName: prepared.value.username,
		userDisplayName: prepared.value.displayName,
		attestationType: 'none',
		excludeCredentials: await listPasskeyDescriptors(db, prepared.value.userId),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
		supportedAlgorithmIDs: [-7, -257]
	});

	const ceremonyId = await saveChallenge(
		db,
		'registration',
		options.challenge,
		origin,
		rpID,
		prepared.value.userId,
		Boolean(locals.passkeyUserId)
	);
	return json({ ceremonyId, options });
};
