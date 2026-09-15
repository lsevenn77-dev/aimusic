# AIFECT

Public AI music MVP at https://aifect.co.kr. The approved static design now uses a Cloudflare Worker, Sites-managed D1 (`DB`) and a private R2 binding (`BUCKET`). Originals never have a public route. The separate transcoder on the existing server produces AAC 128kbps M4A and a 60-second preview. Images use versioned R2 objects; legacy transcoder JPEG covers remain supported.

## Local development

Use Node 22+ and install the package-lock dependencies. Create an ignored `.dev.vars` with a random `AUTH_PEPPER` and `TRANSCODER_TOKEN`. Generate schema changes with `npm run db:generate`, build with `npm run build`, apply `wrangler d1 migrations apply DB --local`, then `npm run dev` (port 4174). The browser source is `dist/index.html`, `dist/app.js`, `dist/views.js`, `dist/actions.js`, `dist/icons.js`, `dist/style.css`, and existing assets. Build copies these into `dist/client` and bundles the Worker into `dist/server/index.js`.

`npm test` targets only localhost:4174. It creates disposable local accounts and verifies auth, CSRF, ownership, upload transitions, private playlists, R2 range responses and guest/full-track access. Test fixtures are never seeded into production.

## Authentication

Email uses salted PBKDF2-SHA256 (100,000 iterations, native Workers limit), an environment-only pepper, per-IP/per-email throttles, and 30-day random HttpOnly/Secure/SameSite cookies. Session tokens are hashed in D1. Email verification and self-service email password recovery are not yet configured (requires a transactional email service).

Google uses Google Identity Services with server signature/issuer/audience/nonce verification. Configure `GOOGLE_CLIENT_ID` and authorize `https://aifect.co.kr` as a JavaScript origin. No Google client secret is needed by this flow.

Kakao uses authorization code with browser-bound one-use state. Configure `KAKAO_CLIENT_ID` (REST API key), optional `KAKAO_CLIENT_SECRET` according to the developer console, and redirect `https://aifect.co.kr/api/auth/kakao/callback`.

Apple requires a web Services ID in `APPLE_CLIENT_ID`, its configured return URL `https://aifect.co.kr/api/auth/apple/callback`, and `APPLE_PRIVATE_KEY`, `APPLE_KEY_ID`, `APPLE_TEAM_ID`. The backend signs a fresh five-minute client secret for each exchange. A static `APPLE_CLIENT_SECRET` remains supported as a legacy fallback, with operator-managed expiry. Native App Store API keys and mobile bundle IDs are not substitutes. OAuth provider identities are separate; matching email alone never links accounts.

Unconfigured providers show an explicit disabled state. Store all runtime values in Sites environment variables, never the hosting manifest or browser bundle.

## Media worker

Deploy only `transcoder/` to `/root/aifect` on the existing server, with `.env` containing `AIFECT_ORIGIN` and `TRANSCODER_TOKEN`. `docker compose -p aifect up -d --build` starts one isolated worker, no inbound ports, non-root/read-only, memory/CPU/PID limits. It does not share Saigram's database, R2 bucket or service configuration. R2 private originals remain unchanged; the worker can only claim jobs and access objects belonging to its unexpired lease. Failed jobs remain visible with an owner retry action. Publication follows successful outputs.

Limits: WAV/FLAC/MP3 up to 80MB; JPEG/PNG/WebP cover up to 5MB; 5 seconds–20 minutes. Guests only receive the physically truncated preview. Members can stream the full encoded version, never the private original. Tracks can be unpublished from Studio, invalidating media access. There is no public admin endpoint.

## Charts and scope

Upload includes an album/single cover, AI artist photo/name/bio, and composer/producer photo/name/bio. Existing owned artists can be selected for another release. Shared profiles can be edited in Studio; track metadata and covers can be changed without retranscoding audio or interrupting publication. Images are optional JPEG/PNG/WebP, up to 5MB each, with browser previews and server body-size/signature checks. Artist/producer introductions support 1,000 characters; track descriptions support 4,000. Owner-only image routes accept uploads; private R2 files become readable only for the owner or an associated published track. Versioned URLs refresh replaced artwork. Prior versions are retained in private storage.

Migration `0001_gigantic_spectrum.sql` adds profile image and cover version/type fields without changing existing rows. `dist/studio.js` and `dist/studio.css` hold creator forms and styling. The real local API suite verifies image storage/reads, ownership, hidden images, forged types, size limits, and metadata changes in addition to the authentication tests.

TOP100 uses qualified unique listener-days plus likes/comments; rising ranks the last 7 days' unique listeners; newcomers require recent producers with fewer than 1,000 followers. Qualification requires 30 seconds or 60% of a short song and is bounded by elapsed server time. These are initial transparent rules, not a mature fraud detector. Payments, tips, licensing, generation and mobile apps are intentionally outside this MVP.

## Publishing

Keep the existing Sites project in `.openai/hosting.json`, with `d1: "DB"` and `r2: "BUCKET"`. Generate and inspect Drizzle migrations; never edit an applied migration. Build, commit/push the exact source, use the official Sites packager and native Sites version/deploy tools, preserving public access and the custom domain. D1 and R2 are provisioned by Sites; do not run Wrangler remote deployment against a different account.
