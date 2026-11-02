# Technical notes

The working manual for this repo, written for coding agents and useful to humans. The README is the front door; this file is the engine room.

## Stack

- SvelteKit (Svelte 5, TypeScript) on Cloudflare Workers via `@sveltejs/adapter-cloudflare`, styled with Tailwind CSS 4.
- Package manager: pnpm. Node version: `.nvmrc`.
- Bindings (declared in `cloudflare.config.ts` and `wrangler.jsonc`): D1 `HK_DB`, KV `HK_KV`, R2 `HK_R2`, Workers AI `AI`, Email Service `EMAIL` (sends as `MAIL_FROM`), static `ASSETS`.
- Workers AI models: `WORKERS_AI_MODEL` (`@cf/deepseek-ai/deepseek-v4.1-flash-1017`) with `WORKERS_AI_FALLBACK_MODEL` (`@cf/zai-org/glm-5.3-flash`).
- Svelte work: use the Svelte MCP server (`.mcp.json`) and run its `svelte-autofixer` on every changed component until it reports nothing. See `CLAUDE.md`.

## Commands

```sh
pnpm install
pnpm dev                 # local dev server
pnpm check               # wrangler types --check + svelte-check
pnpm build               # wrangler types + vite build
pnpm run deploy          # build, then deploy with the Cloudflare CLI (`cf`)
pnpm build:tones         # rebuild src/lib/tones/distribution.json
pnpm test:tones
node scripts/test-auth.mjs   # accounts, sessions, history, email links
pnpm build:reading-seed  # write data/reading-seed.batch.json
pnpm enrich:reading      # optional: Workers AI Jyutping for sentences that have none
```

Deploys run from a local machine with the `cf` CLI logged in. `wrangler.jsonc` and `cloudflare.config.ts` are committed, including the account, D1 and KV IDs. Those IDs are identifiers, not credentials.

## Secrets

Worker secrets are set once on the Worker and persist across deploys. Never commit them. For local development, put them in `.dev.vars` (see `.env.example`).

| Secret | Purpose |
| --- | --- |
| `GEMS_SESSION_SECRET` | Signs account, Gems admin and site admin sessions |
| `ADMIN_PASSWORD` | Password for `/admin` |
| `GEMS_ADMIN_PASSWORD` | Password for `/gems/admin` |
| `MOONSHOT_API_KEY`, `OPENAI_API_KEY` | Declared bindings; translation currently uses Workers AI only |

Set one with `cf workers secrets update <NAME> --worker hk --type secret_text --text <value>`.

## Routes

| Path | What it is |
| --- | --- |
| `/` | Translator (left column: input, results, history) and the top 4 reading articles (right column) |
| `/reading`, `/reading/[slug]` | Reading room: Jyutping/Yale toggle, per-sentence translation, pronunciation reports, likes |
| `/tones` | Tone distribution charts |
| `/login` | Sign in with a passkey or a password |
| `/signup` | Create an account: username and password, optional email |
| `/account` | Email (add, change, remove), password, passkeys, sign out |
| `/reset`, `/reset/[token]` | Request a password reset email; choose a new password |
| `/verify-email/[token]` | Confirms an email address from its link |
| `/admin` | Pronunciation reports and Jyutping editing (6-month session) |
| `/gems`, `/gems/admin` | Markdown articles CMS |
| `/api/translate`, `/api/history` | Translator API and per-account history |
| `/api/reading/translate`, `/report`, `/like` | Reading APIs |

The site header (`src/lib/components/SiteHeader.svelte`) is rendered once in `src/routes/+layout.svelte`. The layout server load provides `user` to every page. Do not add per-page navs.

## Reading room

### Data model (D1)

- `reading_articles`: `slug`, `title`, `genre`, `source_path`, `content_hash`, `sort_rank`
- `reading_sentences`: `id` (SHA-256 of `yue-Hant:v1\n<sentence>`), `cantonese`, `jyutping`, `yale`, `translations` (JSON keyed by `BASE_LANG` in `src/lib/reading.ts`), `annotation_model`
- `reading_article_sentences`: article order and paragraph breaks
- `reading_sentence_reports`: reader reports. Saving in `/admin` resolves them.
- `reading_article_likes`: one row per article and liker. The liker is `user:<id>` when signed in, otherwise `visitor:<uuid>` from the `hk_visitor` cookie.

Articles sort by like count, then `sort_rank` (the default featured order), then newest.

### Romanization rules

- Jyutping is the source of truth. Yale is always derived with `jyutpingToYale` in `src/lib/romanization.ts`. Never hand-write or generate Yale.
- Romanize what a Hong Kong speaker says, not the dictionary reading of a nonstandard character: 果 (嗰) `go2`, 既/GE (嘅) `ge3`, D (啲) `di1`, 係 meaning 喺 `hai2`, 核突 `wat6 dat6`.
- One toned syllable per Han character. Latin tokens stay as written, except that letters followed by a digit are spoken out (`MP3` → `MP saam1`), because tokens like `HX1` would otherwise be parsed as Jyutping.
- `annotation_model` values: `reviewed` is hand-checked and in `data/reading-annotations.json`. `admin` means edited in `/admin` and exists only in D1; the seed never overwrites these rows.

### Adding an article

1. Put the Markdown in `data/chiuman/`. Clean it first: footnote markers, title or date lines, typos, ASCII quotes inside Chinese text, `???` runs, emoticons.
2. Register it in `ARTICLES` in `scripts/reading-data.mjs` with a toneless Jyutping slug (never pinyin, e.g. 徐庶 → `ceoi-syu`). An optional `rank` puts it in the featured order.
3. Write Jyutping for every new sentence into `data/reading-annotations.json` with `model: "reviewed"`. `pnpm enrich:reading` can draft missing ones with Workers AI, but check every syllable before seeding.
4. Run `pnpm build:reading-seed`, then `pnpm exec cf d1 query <database_id> --batch @data/reading-seed.batch.json`. The seed is idempotent, keeps saved translations and skips `admin` rows.
5. Apply new migrations before seeding: `pnpm exec cf d1 migrations apply <database_id> --dir migrations`.

The splitter in `scripts/reading-data.mjs` ends a sentence at 。！？!?…, keeps closing quotes with their sentence, treats each line as a sentence, and merges a fragment that starts with a comma back into the sentence before it.

## Accounts and history

Anyone can translate without an account, but those translations are not saved. Signed-in history is private to its account. Sign-in is by passkey (discoverable credentials) or by username/email and password. Passwords are stored as PBKDF2-SHA-256 hashes, capped at the Workers iteration limit. Passkeys work on `http://localhost` and on HTTPS, on the same host.

Sign-up asks only for a username and password (or a passkey). The display name starts as the username.

### Email and password reset

- Email is optional. An address entered at sign-up or on `/account` is saved to `passkey_users.email` only after its owner opens the confirmation link, so nobody can attach someone else's address.
- `account_tokens` stores single-use links as SHA-256 hashes. Reset links last 1 hour and email links last 24 hours. Each account can create at most 3 per hour for each purpose. A successful reset revokes the account's other reset links and signs the user in.
- `/reset` gives the same reply whether or not an account exists or has an email.
- Email goes out through the `EMAIL` binding (`src/lib/server/mailer.ts`). `mywords.io` is onboarded as a sending domain. Its DNS records are on `cf-bounce.mywords.io` and `_dmarc.mywords.io`. To set up another domain: `cf email-sending subdomains create --zone <domain> --name <domain>`, then `cf email-sending subdomains dns fix <id> --zone <domain>`; check with `dns status`. The account quota is at `cf email-sending limits get`. Failed sends are logged as `email_send_failed` and the page shows a calm message instead.

## Tone charts

`/tones` reads `src/lib/tones/distribution.json`, built from `data/jyutping.csv`, which combines the LSHK Jyutping table (CC BY 4.0) and Unicode Unihan `kCantonese` (Unicode License v3). The counts are dictionary readings, not spoken frequency, and there is no tone sandhi.

## Conventions

- The frontend never mentions Mandarin. The backend still accepts Mandarin input (`zh-Mandarin`).
- Slugs, URLs and labels use Jyutping or English, never pinyin.
- Light, generous, Cantonese-first design. See the design context in `CLAUDE.md`.
