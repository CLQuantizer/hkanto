import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test, { describe, before, after } from 'node:test';
import { createServer } from 'vite';
import { isHttpError, isRedirect } from '@sveltejs/kit';

const secret = 'test-session-secret-0123456789';

/** @type {import('vite').ViteDevServer} */
let vite;
/** @type {DatabaseSync} */
let sqlite;
/** @type {any} */
let db;
/** @type {Record<string, any>} */
let accounts;
/** @type {Record<string, any>} */
let passkeys;
/** @type {Record<string, any>} */
let history;
/** @type {any} */
let historyRoute;
/** @type {any} */
let passkeyOptions;
/** @type {any} */
let passkeyRegisterOptions;
/** @type {any} */
let passkeyRegisterVerify;
/** @type {any} */
let login;

function createDb(database) {
	function expand(sql, params) {
		const ordered = [];
		const rewritten = sql.replace(/\?(\d+)/g, (_match, number) => {
			ordered.push(params[Number(number) - 1]);
			return '?';
		});
		return { sql: rewritten, params: ordered };
	}

	function run(sql, params, mode) {
		const expanded = expand(sql, params);
		const statement = database.prepare(expanded.sql);
		params = expanded.params;
		if (mode === 'run') {
			statement.run(...params);
			return { success: true, meta: {} };
		}
		const rows = statement.all(...params);
		if (mode === 'first') return rows[0] ?? null;
		return { success: true, results: rows };
	}

	function statement(sql, params) {
		return {
			sql,
			params,
			bind(...next) {
				return statement(sql, next);
			},
			first() {
				return Promise.resolve(run(sql, params, 'first'));
			},
			run() {
				return Promise.resolve(run(sql, params, 'run'));
			},
			all() {
				return Promise.resolve(run(sql, params, 'all'));
			}
		};
	}

	return {
		prepare(sql) {
			return statement(sql, []);
		},
		batch(statements) {
			return Promise.resolve(statements.map((entry) => run(entry.sql, entry.params, 'all')));
		},
		exec(sql) {
			database.exec(sql);
			return Promise.resolve({ count: 0, duration: 0 });
		}
	};
}

function applyMigrations(database) {
	database.exec('PRAGMA foreign_keys = ON;');
	const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort();
	for (const file of files) {
		database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
	}
}

function cookieJar() {
	/** @type {string | undefined} */
	let token;
	return {
		cookies: {
			set(_name, value) {
				token = value;
			},
			get() {
				return token;
			},
			delete() {
				token = undefined;
			}
		},
		read() {
			return token;
		}
	};
}

function formRequest(fields) {
	return new Request('http://localhost/login?/register', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
		body: new URLSearchParams(fields)
	});
}

describe('private history and accounts', { concurrency: 1 }, () => {
before(async () => {
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
	accounts = await vite.ssrLoadModule('/src/lib/server/accounts.ts');
	passkeys = await vite.ssrLoadModule('/src/lib/server/passkeys.ts');
	history = await vite.ssrLoadModule('/src/lib/server/history.ts');
	historyRoute = await vite.ssrLoadModule('/src/routes/api/history/+server.ts');
	passkeyOptions = await vite.ssrLoadModule('/src/routes/api/passkeys/authenticate/options/+server.ts');
	passkeyRegisterOptions = await vite.ssrLoadModule('/src/routes/api/passkeys/register/options/+server.ts');
	passkeyRegisterVerify = await vite.ssrLoadModule('/src/routes/api/passkeys/register/verify/+server.ts');
	login = await vite.ssrLoadModule('/src/routes/login/+page.server.ts');
	sqlite = new DatabaseSync(':memory:');
	applyMigrations(sqlite);
	db = createDb(sqlite);
});

after(async () => {
	sqlite?.close();
	await vite?.close();
});

function bytesToBase64(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

async function pbkdf2Record(password, iterations) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
	return `pbkdf2-sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

test('passwords hash and reject the wrong password', async () => {
	const passwords = await vite.ssrLoadModule('/src/lib/server/passwords.ts');
	assert.equal(passwords.PASSWORD_HASH_ITERATIONS, 100_000);
	const hash = await passwords.hashPassword('correct horse');
	assert.match(hash, /^pbkdf2-sha256\$100000\$[^$]+\$[^$]+$/);
	assert.equal(await passwords.verifyPassword('correct horse', hash), true);
	assert.equal(await passwords.verifyPassword('wrong horse', hash), false);
	assert.equal(await passwords.verifyStoredPassword('correct horse', null), false);

	// Verification uses the iteration count stored in the hash, not the count used for new passwords.
	const legacy = await pbkdf2Record('correct horse', 600_000);
	assert.equal(await passwords.verifyPassword('correct horse', legacy), true);
	assert.equal(await passwords.verifyPassword('wrong horse', legacy), false);
	const relabeled = hash.replace('$100000$', '$600000$');
	assert.equal(await passwords.verifyPassword('correct horse', relabeled), false);
	const weak = await pbkdf2Record('correct horse', 1_000);
	assert.equal(await passwords.verifyPassword('correct horse', weak), false);

	const deriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
	crypto.subtle.deriveBits = () => {
		throw new DOMException(
			'Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000).',
			'NotSupportedError'
		);
	};
	try {
		assert.equal(await passwords.verifyPassword('correct horse', legacy), false);
	} finally {
		crypto.subtle.deriveBits = deriveBits;
	}
});

test('session tokens fail closed', async () => {
	const token = await passkeys.createPasskeySession('user-1', secret);
	assert.equal(await passkeys.verifyPasskeySession(token, secret), 'user-1');
	assert.equal(await passkeys.verifyPasskeySession(token, 'other-secret'), null);
	assert.equal(await passkeys.verifyPasskeySession(`${token}x`, secret), null);
	assert.equal(await passkeys.verifyPasskeySession(undefined, secret), null);
	const userId = '11111111-1111-1111-1111-111111111111';
	const handle = btoa(userId).replaceAll('=', '');
	assert.equal(passkeys.userHandleMatches(handle, userId), true);
	assert.equal(passkeys.userHandleMatches(btoa('someone-else').replaceAll('=', ''), userId), false);
	assert.equal(passkeys.userHandleMatches(undefined, userId), true);
});

test('password registration and login stay on that account', async () => {
	const registered = await accounts.registerWithPassword(db, {
		username: 'Ada',
		password: 'supersecret',
		confirmPassword: 'supersecret'
	});
	assert.equal(registered.ok, true);
	assert.equal((await accounts.getAccount(db, registered.value.userId)).email, null);
	assert.equal((await accounts.setVerifiedEmail(db, registered.value.userId, 'Ada@Example.com')).ok, true);
	const byEmail = await accounts.authenticateWithPassword(db, 'ada@example.com', 'supersecret');
	const byName = await accounts.authenticateWithPassword(db, 'ada', 'supersecret');
	assert.equal(byEmail.ok && byEmail.value.userId, registered.value.userId);
	assert.equal(byName.ok && byName.value.userId, registered.value.userId);
	const wrong = await accounts.authenticateWithPassword(db, 'ada', 'not-the-password');
	const missing = await accounts.authenticateWithPassword(db, 'nobody', 'not-the-password');
	assert.equal(wrong.ok, false);
	assert.equal(missing.ok, false);
	assert.equal(wrong.message, missing.message);
	const duplicate = await accounts.registerWithPassword(db, {
		username: 'ada',
		password: 'supersecret',
		confirmPassword: 'supersecret'
	});
	assert.equal(duplicate.ok, false);
	assert.equal(duplicate.status, 409);
});

test('a passkey cannot be attached to someone else’s password account', async () => {
	const taken = await accounts.preparePasskeyAccount(db, {
		signedInUserId: null,
		username: 'ada',
		displayName: 'Intruder',
		email: ''
	});
	assert.equal(taken.ok, false);
	assert.equal(taken.status, 409);

	const ada = await accounts.authenticateWithPassword(db, 'ada', 'supersecret');
	const own = await accounts.preparePasskeyAccount(db, {
		signedInUserId: ada.value.userId,
		username: 'intruder',
		displayName: 'Intruder',
		email: 'intruder@example.com'
	});
	assert.equal(own.ok, true);
	assert.equal(own.value.username, 'ada');
	assert.equal(own.value.displayName, 'ada');
});

test('history is private to the signed-in user', async () => {
	const bob = await accounts.registerWithPassword(db, {
		username: 'bob',
		password: 'bob-password',
		confirmPassword: 'bob-password'
	});
	await accounts.setVerifiedEmail(db, bob.value.userId, 'bob@example.com');
	const ada = await accounts.authenticateWithPassword(db, 'ada', 'supersecret');
	await history.saveUserHistory(db, ada.value.userId, {
		source: 'Ada private',
		sourceLanguage: 'en',
		translationOne: '艾達',
		translationTwo: '艾達二',
		jyutpingOne: 'ngaai6 daat6',
		jyutpingTwo: 'ngaai6 daat6 ji6'
	});
	await history.saveUserHistory(db, bob.value.userId, {
		source: 'Bob private',
		sourceLanguage: 'en',
		translationOne: '鮑伯',
		translationTwo: '鮑伯二',
		jyutpingOne: 'baau1 baak3',
		jyutpingTwo: 'baau1 baak3 ji6'
	});
	sqlite.prepare(
		`INSERT INTO translation_history (english, source_text, source_language, translation_one, translation_two)
		 VALUES ('public', 'public', 'en', '公開', '公開二')`
	).run();
	await history.saveUserHistory(db, 'missing-user', {
		source: 'ghost',
		sourceLanguage: 'en',
		translationOne: '鬼',
		translationTwo: '鬼二',
		jyutpingOne: '',
		jyutpingTwo: ''
	});

	const adaHistory = await history.listUserHistory(db, ada.value.userId, 1);
	assert.deepEqual(adaHistory.items.map((item) => item.source_text), ['Ada private']);
	assert.equal(adaHistory.total, 1);
	const bobHistory = await history.listUserHistory(db, bob.value.userId, 1);
	assert.deepEqual(bobHistory.items.map((item) => item.source_text), ['Bob private']);

	await assert.rejects(() => historyRoute.GET({ url: new URL('http://localhost/api/history'), locals: { passkeyUserId: null }, platform: { env: { HK_DB: db } } }), (err) => {
		assert.equal(isHttpError(err), true);
		assert.equal(err.status, 401);
		return true;
	});

	const response = await historyRoute.GET({
		url: new URL('http://localhost/api/history?page=1'),
		locals: { passkeyUserId: ada.value.userId },
		platform: { env: { HK_DB: db } }
	});
	const body = await response.json();
	assert.deepEqual(body.items.map((item) => item.source_text), ['Ada private']);
	assert.equal(JSON.stringify(body).includes('Bob private'), false);
	assert.equal(JSON.stringify(body).includes('公開'), false);
});

test('passkey options do not list other accounts', async () => {
	const response = await passkeyOptions.POST({
		url: new URL('http://localhost/api/passkeys/authenticate/options'),
		platform: { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } }
	});
	const body = await response.json();
	assert.equal(typeof body.ceremonyId, 'string');
	assert.equal(body.options.rpId, 'localhost');
	assert.equal(body.options.allowCredentials?.length ?? 0, 0);
	const source = readFileSync(new URL('../src/routes/api/passkeys/authenticate/options/+server.ts', import.meta.url), 'utf8');
	assert.equal(source.includes('FROM passkeys'), false);
	const translate = readFileSync(new URL('../src/routes/api/translate/+server.ts', import.meta.url), 'utf8');
	assert.equal(translate.includes('locals.passkeyUserId'), true);
	assert.equal(translate.includes('INSERT INTO translation_history'), false);
});

test('failed passkey registration keeps a password account', async () => {
	const ada = await accounts.getAccount(db, (await accounts.authenticateWithPassword(db, 'ada', 'supersecret')).value.userId);
	assert.equal(ada.hasPassword, true);
	const optionsResponse = await passkeyRegisterOptions.POST({
		request: new Request('http://localhost/api/passkeys/register/options', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({})
		}),
		url: new URL('http://localhost/api/passkeys/register/options'),
		locals: { passkeyUserId: (await accounts.authenticateWithPassword(db, 'ada', 'supersecret')).value.userId },
		platform: { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } }
	});
	const options = await optionsResponse.json();
	const jar = cookieJar();
	await assert.rejects(
		() =>
			passkeyRegisterVerify.POST({
				request: new Request('http://localhost/api/passkeys/register/verify', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ ceremonyId: options.ceremonyId, response: { id: 'bad', rawId: 'bad', type: 'public-key', response: {}, clientExtensionResults: {} } })
				}),
				platform: { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } },
				cookies: jar.cookies
			}),
		(err) => isHttpError(err) && err.status === 400
	);
	const stillThere = await accounts.authenticateWithPassword(db, 'ada', 'supersecret');
	assert.equal(stillThere.ok, true);
});

test('a finished password signup blocks an earlier passkey ceremony', async () => {
	const optionsResponse = await passkeyRegisterOptions.POST({
		request: new Request('http://localhost/api/passkeys/register/options', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ username: 'cara', displayName: 'Cara' })
		}),
		url: new URL('http://localhost/api/passkeys/register/options'),
		locals: { passkeyUserId: null },
		platform: { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } }
	});
	const options = await optionsResponse.json();
	const registered = await accounts.registerWithPassword(db, {
		username: 'cara',
		password: 'cara-password',
		confirmPassword: 'cara-password'
	});
	assert.equal(registered.ok, true);
	await assert.rejects(
		() =>
			passkeyRegisterVerify.POST({
				request: new Request('http://localhost/api/passkeys/register/verify', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						ceremonyId: options.ceremonyId,
						response: { id: 'bad', rawId: 'bad', type: 'public-key', response: {}, clientExtensionResults: {} }
					})
				}),
				platform: { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } },
				cookies: cookieJar().cookies
			}),
		(err) => isHttpError(err) && err.status === 409
	);
	const signIn = await accounts.authenticateWithPassword(db, 'cara', 'cara-password');
	assert.equal(signIn.ok, true);
	const account = await accounts.getAccount(db, signIn.value.userId);
	assert.equal(account.hasPasskey, false);
	assert.equal(account.hasPassword, true);
});

test('login actions set a session and reject a bad password', async () => {
	const jar = cookieJar();
	const platform = { env: { HK_DB: db, GEMS_SESSION_SECRET: secret } };
	await assert.rejects(
		() =>
			login.actions.default({
				request: formRequest({ identifier: 'bob@example.com', password: 'bob-password' }),
				cookies: jar.cookies,
				platform,
				url: new URL('http://localhost/login'),
				locals: { passkeyUserId: null }
			}),
		(err) => {
			assert.equal(isRedirect(err), true);
			assert.equal(err.status, 303);
			assert.equal(err.location, '/');
			return true;
		}
	);
	assert.equal(await passkeys.verifyPasskeySession(jar.read(), secret), (await accounts.authenticateWithPassword(db, 'bob', 'bob-password')).value.userId);

	const rejected = await login.actions.default({
		request: formRequest({ identifier: 'bob', password: 'nope-nope' }),
		cookies: cookieJar().cookies,
		platform,
		url: new URL('http://localhost/login'),
		locals: { passkeyUserId: null }
	});
	assert.equal(rejected.status, 400);
	assert.equal(rejected.data.message, 'Those details don’t match an account.');
});

test('signed-out pages hide history and show sign-in', async () => {
	const { render } = await vite.ssrLoadModule('svelte/server');
	const home = await vite.ssrLoadModule('/src/routes/+page.svelte');
	const header = await vite.ssrLoadModule('/src/lib/components/SiteHeader.svelte');
	const loginPage = await vite.ssrLoadModule('/src/routes/login/+page.svelte');
	const signupPage = await vite.ssrLoadModule('/src/routes/signup/+page.svelte');
	const accountPage = await vite.ssrLoadModule('/src/routes/account/+page.svelte');

	const headerOut = render(header.default, { props: { user: null, current: 'home' } }).body;
	assert.match(headerOut, /href="\/login"/);
	assert.match(headerOut, />Sign in</);
	assert.match(headerOut, />Tones</);
	const headerIn = render(header.default, { props: { user: { displayName: 'Ada Wong' }, current: 'home' } }).body;
	assert.match(headerIn, /href="\/account"/);
	assert.match(headerIn, /Ada Wong/);

	const signedOut = render(home.default, { props: { data: { user: null, articles: [] } } }).body;
	assert.match(signedOut, /private history/);
	assert.equal(signedOut.includes('total'), false);
	const signedIn = render(home.default, { props: { data: { user: { username: 'ada', displayName: 'Ada Wong' }, articles: [] } } }).body;
	assert.match(signedIn, /Only visible on this account/);
	assert.match(signedIn, /Loading history/);

	// Sign in and sign up are separate, simple pages.
	const loginOut = render(loginPage.default, { props: { form: null } }).body;
	assert.match(loginOut, /Sign in with a passkey/);
	assert.match(loginOut, /Sign in with password/);
	assert.match(loginOut, /name="identifier"/);
	assert.match(loginOut, /href="\/signup"/);
	assert.match(loginOut, /href="\/reset"/);
	assert.equal(loginOut.includes('name="confirmPassword"'), false);

	const signupOut = render(signupPage.default, { props: { form: null } }).body;
	assert.match(signupOut, /name="username"/);
	assert.match(signupOut, /name="email"/);
	assert.match(signupOut, /optional/);
	assert.match(signupOut, /Use a passkey instead/);
	assert.equal(signupOut.includes('name="displayName"'), false);

	const accountOut = render(accountPage.default, {
		props: {
			data: { account: { username: 'ada', displayName: 'Ada Wong', email: null, hasPassword: false, hasPasskey: true }, notice: null },
			form: null
		}
	}).body;
	assert.match(accountOut, /Send confirmation link/);
	assert.match(accountOut, /Add a password/);
	assert.match(accountOut, /Add another passkey/);
	assert.match(accountOut, /Sign out/);
});

test('account tokens work once, expire, and are rate limited', async () => {
	const tokens = await vite.ssrLoadModule('/src/lib/server/account-tokens.ts');
	const dee = await accounts.registerWithPassword(db, { username: 'dee', password: 'dee-password', confirmPassword: 'dee-password' });
	const userId = dee.value.userId;
	const token = await tokens.createAccountToken(db, userId, 'reset_password');
	assert.equal(await tokens.peekAccountToken(db, token, 'reset_password'), true);
	assert.equal(await tokens.peekAccountToken(db, token, 'verify_email'), false);
	assert.deepEqual(await tokens.consumeAccountToken(db, token, 'reset_password'), { userId, email: null });
	assert.equal(await tokens.consumeAccountToken(db, token, 'reset_password'), null);
	assert.notEqual(await tokens.createAccountToken(db, userId, 'reset_password'), null);
	assert.notEqual(await tokens.createAccountToken(db, userId, 'reset_password'), null);
	assert.equal(await tokens.createAccountToken(db, userId, 'reset_password'), null);
	const stored = await db.prepare('SELECT token_hash FROM account_tokens LIMIT 1').first();
	assert.equal(stored.token_hash.includes(token), false);
	await db.prepare("UPDATE account_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?1").bind(userId).run();
	const verify = await tokens.createAccountToken(db, userId, 'verify_email', 'dee@example.com');
	await db.prepare("UPDATE account_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE purpose = 'verify_email'").run();
	assert.equal(await tokens.consumeAccountToken(db, verify, 'verify_email'), null);
});

test('emails are saved only after the link is clicked, and resets sign you in', async () => {
	const sent = [];
	const env = { HK_DB: db, GEMS_SESSION_SECRET: secret, EMAIL: { send: async (message) => { sent.push(message); return { messageId: 'm' }; } } };
	const signup = await vite.ssrLoadModule('/src/routes/signup/+page.server.ts');
	const reset = await vite.ssrLoadModule('/src/routes/reset/+page.server.ts');
	const resetToken = await vite.ssrLoadModule('/src/routes/reset/[token]/+page.server.ts');
	const verify = await vite.ssrLoadModule('/src/routes/verify-email/[token]/+page.server.ts');
	const tokenFrom = (message) => message.text.match(/\/(?:reset|verify-email)\/([A-Za-z0-9_-]+)/)[1];

	const jar = cookieJar();
	await assert.rejects(
		() => signup.actions.default({
			request: formRequest({ username: 'eve', password: 'eve-password', confirmPassword: 'eve-password', email: 'Eve@Example.com' }),
			cookies: jar.cookies, platform: { env }, url: new URL('http://localhost/signup'), locals: { passkeyUserId: null }
		}),
		(err) => isRedirect(err) && err.location === '/account?verify=sent'
	);
	const eveId = await passkeys.verifyPasskeySession(jar.read(), secret);
	assert.equal((await accounts.getAccount(db, eveId)).email, null);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'eve@example.com');

	// Without a confirmed email there is nothing to reset, and the reply does not say so.
	const quiet = await reset.actions.default({ request: formRequest({ identifier: 'eve' }), platform: { env }, url: new URL('http://localhost/reset') });
	const unknown = await reset.actions.default({ request: formRequest({ identifier: 'nobody' }), platform: { env }, url: new URL('http://localhost/reset') });
	assert.deepEqual(quiet, unknown);
	assert.equal(sent.length, 1);

	const confirmed = await verify.load({ params: { token: tokenFrom(sent[0]) }, platform: { env } });
	assert.equal(confirmed.ok, true);
	assert.equal((await accounts.getAccount(db, eveId)).email, 'eve@example.com');
	assert.equal((await verify.load({ params: { token: tokenFrom(sent[0]) }, platform: { env } })).ok, false);

	await reset.actions.default({ request: formRequest({ identifier: 'eve@example.com' }), platform: { env }, url: new URL('http://localhost/reset') });
	assert.equal(sent.length, 2);
	const token = tokenFrom(sent[1]);
	assert.equal((await resetToken.load({ params: { token }, platform: { env } })).valid, true);
	const mismatch = await resetToken.actions.default({
		params: { token }, request: formRequest({ password: 'new-password', confirmPassword: 'other-password' }),
		platform: { env }, cookies: cookieJar().cookies, url: new URL('http://localhost/reset/x')
	});
	assert.equal(mismatch.status, 400);
	const resetJar = cookieJar();
	await assert.rejects(
		() => resetToken.actions.default({
			params: { token }, request: formRequest({ password: 'new-password', confirmPassword: 'new-password' }),
			platform: { env }, cookies: resetJar.cookies, url: new URL('http://localhost/reset/x')
		}),
		(err) => isRedirect(err) && err.location === '/account?password=reset'
	);
	assert.equal(await passkeys.verifyPasskeySession(resetJar.read(), secret), eveId);
	assert.equal((await accounts.authenticateWithPassword(db, 'eve', 'new-password')).ok, true);
	assert.equal((await accounts.authenticateWithPassword(db, 'eve', 'eve-password')).ok, false);
	const reused = await resetToken.actions.default({
		params: { token }, request: formRequest({ password: 'third-password', confirmPassword: 'third-password' }),
		platform: { env }, cookies: cookieJar().cookies, url: new URL('http://localhost/reset/x')
	});
	assert.equal(reused.status, 410);
});
});
