# Zenopher backend (free-tier MVP)

Cloudflare Worker (TypeScript, Hono) with D1, R2 and a cron trigger, built from `ZENOPHER_BACKEND_-FREE.pdf`.
One codebase, two entry points: `fetch` and `scheduled`. The server stores and checks; it never processes pixels.

```
migrations/    0001 = the spec's schema, 0002 = learning_aggregates (needed by the spec's cron job, absent from its schema)
src/           app.ts (headers, CORS, errors, auth) · session.ts · crypto.ts (envelope encryption) · routes/* · services/* · cron/*
test/          51 tests on in-memory D1 (node:sqlite) and R2 doubles
scripts/       build-catalog.mjs: profile -> hashed catalog files for R2
web/_headers   strict CSP and security headers for the static app
```

## Deploy
```
npm i
wrangler d1 create zenopher            # put the id in wrangler.toml
wrangler r2 bucket create zenopher
npm run migrate:remote
openssl rand -base64 32 | wrangler secret put ZPH_MASTER_KEY
wrangler secret put MUSE_API_KEY; wrangler secret put EMAIL_API_KEY; wrangler secret put GOOGLE_CLIENT_SECRET; wrangler secret put TURNSTILE_SECRET
# fill the [vars] in wrangler.toml, then:
npm run deploy
node scripts/build-catalog.mjs styles/*.json --out catalog-dist   # then upload catalog-dist/catalog/** to R2 (see the script header)
```
**Back up `ZPH_MASTER_KEY` somewhere other than Cloudflare.** Every design key is wrapped by it. Lose it and all designs are unreadable.

## Endpoints (`/v1`)
| Area | Routes |
|---|---|
| Auth | `POST auth/magic` · `auth/verify` · `auth/google` · `auth/refresh` · `auth/signout` · `auth/signout-all` |
| Designs | `POST/GET designs` · `GET designs/shared` · `GET/PATCH/DELETE designs/:id` · `POST designs/:id/trash` `/restore` · `POST designs/:id/versions` · `GET designs/:id/content[?version=]` `/versions` · `PUT/GET designs/:id/thumbnail` |
| Assets | `POST assets` · `GET/DELETE assets/:id` |
| Sharing | `POST/GET designs/:id/shares` · `DELETE designs/:id/shares/:shareId` · `GET shared/design` `shared/content` (header `X-Share-Token`) |
| Catalog | `GET catalog/index` · `catalog/styles/:id/:version` · `catalog/examples/:style/:file` |
| Critique | `POST critique` (multipart `image` + `meta`) |
| Consent, learning | `GET/POST consent` · `POST learning/events` |
| Account | `GET/PATCH account` · `POST account/export` · `GET account/export/:job[/download]` · `POST account/delete` `/delete/cancel` |
| Other | `GET config` |

Save a version: `POST designs/:id/versions`, body = gzip bytes, headers `X-Base-Version`, `X-Content-Hash` (SHA-256 hex of the body), optional `Idempotency-Key`. 409 returns `current_version`.

## Where the spec was followed exactly
Schema; envelope encryption (AES-256-GCM, 96-bit nonces, AAD = design id / design id + version); save flow with the single D1 batch (the insert is `... WHERE changes() = 1`, so a version row can never exist without the pointer moving; tested with a simulated race); refresh rotation with family revocation; 404 for both not-found and forbidden; upload allow-list, magic bytes, declared size first, server-made keys, `nosniff`/`attachment`/CSP on user files; critique flow and the one-statement reservation; log fields limited by type; secrets as Worker secrets; cron jobs.

## Decisions where the spec was silent (change freely)
- **Access token.** The spec lists no signing secret, so access tokens are HMAC-signed with a key derived (HKDF) from `ZPH_MASTER_KEY`. 15 minutes; the session family is still checked on every request, so sign-out takes effect at once.
- **Refresh rows.** Rotation inserts a new row in the same `family_id` and revokes the old one. A replay within 10 s is treated as two tabs racing (refused, family kept); later it revokes the family.
- **Magic link** is in the URL fragment and redeemed with a POST, so mail scanners and logs cannot burn or see it. `purpose = 'verify'` is unused: both sign-in methods produce verified emails.
- **Sharing:** link tokens travel in `X-Share-Token`. Granting by email always answers 202, so it cannot be used to find out who has an account. Grantees see the current version only. Shared viewers can read any asset of the owner (ids are unguessable); the schema has no design-to-asset link to check against. The `comment` permission is stored but there is no comments feature yet, and there is no edit grant.
- **Learning events:** the spec's `command_id` column holds the teacher's rule id. Withdrawing learning consent queues a job that deletes the events and the pseudonym link.
- **Export** is a `.tar` (no per-file CRC, which matters for CPU), latest version of each design decrypted, plus assets, consents, learning events. Capped at 64 MB. Download links expire after 7 days.
- **Account deletion:** 14-day grace (`DELETION_GRACE_DAYS`); writes are refused while pending; signing in and cancelling restores it.
- **Quotas the spec did not ask for:** 200 MB of assets per user, 20 active shares per design, 60 design creations per hour.
- **Version history is never pruned.** Add a retention rule before storage matters.
- **Email** uses a Resend-style JSON API (`EMAIL_API_URL`). Swap `services/email.ts` for another provider.

## Things to check before launch
1. **Muse is unverified, as your spec says (9.1).** `services/muse.ts` assumes `POST {url}` with `{model, prompt, image}` and a reply with `text` and `usage.credits`. Only that file changes when you confirm the real API. Set `CRITIQUE_COST_PER_REVIEW` from your 5 test calls (usable reviews = `floor((150 - 10) / cost)`), and `MUSE_ACCEPTS_IMAGES=false` for text-only mode.
2. **Free-plan CPU.** Workers Free allows about 10 ms of CPU per request. Encrypting a 25 MB save or building a large export will probably exceed it; small designs (assets are stored separately) should be fine. Measure with `wrangler tail`, and lower `MAX_VERSION_BYTES` or move to the paid plan if you see `exceeded CPU` errors. D1 free limits (writes/day) apply too.
3. **Same site.** The refresh cookie is `SameSite=Strict`, so the app and API must share a registrable domain (`app.example.com` + `api.example.com`). On `pages.dev` + `workers.dev` the cookie will not be sent.
4. **Gzip bombs.** The server only checks the gzip header, per spec. A shared design can decompress to something huge in a viewer's browser; cap decompressed size in the engine's loader.
5. **Tests are not workerd.** They run on in-memory doubles for D1 and R2. Before launch, run `wrangler dev --local` after `npm run migrate:local` and click through sign-in, a save and a critique once. I bundled with `wrangler deploy --dry-run` but did not deploy.
6. **Backups** dump up to 100,000 rows in one invocation. Fine for the MVP; at scale use D1 Time Travel or export in pages.
7. Workers log retention is Cloudflare's own. Record it in the privacy notice (spec 8.8).

## Teacher compatibility
The teacher shell's `CatalogSync`, `EventRecorder` and `CritiqueClient` call these routes as written. The critique reply is `{ text, cached }` where `text` is the validated JSON string. Style files from `build-catalog.mjs` pass the Rust loader's hash check (cross-checked).
