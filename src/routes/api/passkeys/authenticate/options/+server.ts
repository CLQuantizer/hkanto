import { error, json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRelyingParty, saveChallenge } from '$lib/server/passkeys';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, url }) => {
	const db = platform?.env.HK_DB;
	if (!db || !platform?.env.GEMS_SESSION_SECRET) error(500, 'Passkey login is not configured.');
	const { origin, rpID } = getRelyingParty(url);
	// Discoverable passkeys only. Listing every credential would expose other accounts and break once the list grows.
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'required'
	});
	const ceremonyId = await saveChallenge(db, 'authentication', options.challenge, origin, rpID);
	return json({ ceremonyId, options });
};
