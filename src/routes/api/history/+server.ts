import { error, json } from '@sveltejs/kit';
import { listUserHistory } from '$lib/server/history';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.passkeyUserId) error(401, 'Sign in to view your translation history.');
	const db = platform?.env.HK_DB;
	if (!db) error(500, 'HK_DB is not configured.');

	const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);

	try {
		return json(await listUserHistory(db, locals.passkeyUserId, requestedPage));
	} catch (err) {
		console.error(err);
		error(500, 'Failed to load translation history.');
	}
};
