export const HISTORY_PAGE_SIZE = 10;

export interface HistoryRow {
	id: number;
	source_text: string;
	source_language: 'en' | 'zh-Mandarin';
	translation_one: string;
	translation_two: string;
	jyutping_one: string | null;
	jyutping_two: string | null;
	created_at: string;
}

export interface HistoryEntry {
	source: string;
	sourceLanguage: 'en' | 'zh-Mandarin';
	translationOne: string;
	translationTwo: string;
	jyutpingOne: string;
	jyutpingTwo: string;
}

interface CountRow {
	total: number;
}

export async function listUserHistory(db: D1Database, userId: string, requestedPage: number) {
	const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
	const offset = (page - 1) * HISTORY_PAGE_SIZE;
	const [historyResult, countResult] = await db.batch([
		db
			.prepare(
				`SELECT id, source_text, source_language, translation_one, translation_two, jyutping_one, jyutping_two, created_at
				 FROM translation_history
				 WHERE user_id = ?1
				 ORDER BY created_at DESC, id DESC
				 LIMIT ?2 OFFSET ?3`
			)
			.bind(userId, HISTORY_PAGE_SIZE, offset),
		db.prepare('SELECT COUNT(*) AS total FROM translation_history WHERE user_id = ?1').bind(userId)
	]);

	const items = (historyResult.results ?? []) as HistoryRow[];
	const count = (countResult.results?.[0] ?? { total: 0 }) as CountRow;
	const total = Number(count.total);
	const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
	return { items, page, pageSize: HISTORY_PAGE_SIZE, total, totalPages };
}

export async function saveUserHistory(db: D1Database, userId: string, entry: HistoryEntry) {
	const owner = await db.prepare('SELECT 1 AS ok FROM passkey_users WHERE id = ?1').bind(userId).first<{ ok: number }>();
	if (!owner) return;
	await db
		.prepare(
			`INSERT INTO translation_history
				(english, source_text, source_language, translation_one, translation_two, jyutping_one, jyutping_two, user_id)
			 VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)`
		)
		.bind(entry.source, entry.sourceLanguage, entry.translationOne, entry.translationTwo, entry.jyutpingOne, entry.jyutpingTwo, userId)
		.run();
}
