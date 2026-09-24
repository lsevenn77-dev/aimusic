# AIFECT

Public AI music MVP at https://aifect.co.kr. The approved static design now uses a Cloudflare Worker, Sites-managed D1 (`DB`) and a private R2 binding (`BUCKET`). Originals never have a public route. The separate transcoder on the existing server produces AAC 128kbps M4A and a 60-second preview. Images use versioned R2 objects; legacy transcoder JPEG covers remain supported.

## Local development

Use Node 22+ and install the package-lock dependencies. Create an ignored `.dev.vars` with a random `AUTH_PEPPER` and `TRANSCODER_TOKEN`. Generate schema changes with `npm run db:generate`, build with `npm run build`, apply `wrangler d1 migrations apply DB --local`, then `npm run dev` (port 4174). The browser source is `dist/index.html`, `dist/app.js`, `dist/views.js`, `dist/actions.js`, `dist/icons.js`, `dist/style.css`, and existing assets. Build copies these into `dist/client` and bundles the Worker into `dist/server/index.js`.

`npm test` includes isolated fixture tests and an integration suite in `tests/api.test.mjs` that targets localhost:4174. It creates disposable local accounts and verifies auth, CSRF, ownership, upload transitions, private playlists, R2 range responses and guest/full-track access. Test fixtures are never seeded into production.

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

TOP100 uses qualified unique listener-days plus likes/comments; rising ranks the last 7 days' unique listeners; newcomers require recent producers with fewer than 1,000 followers. Qualification requires 30 seconds or 60% of a short song and is bounded by elapsed server time. These are initial transparent rules, not a mature fraud detector. Direct NICEPAY monthly subscription code is implemented but checkout remains disabled pending the merchant review process. Tips, licensing, music generation and native mobile apps are outside this web MVP. See `docs/NICEPAY-제출현황.md` for the latest submission status.

## Lyrics and personal library

Creators can import UTF-8 LRC/TXT lyrics in upload or track editing, or paste lyrics and stamp each line against the audio preview. Synced lyrics require valid line timestamps. The shared parser normalizes LRC metadata, offsets and repeated timestamps, with a 12,000-character limit. Creators can also request automatic synchronization of their supplied lyrics. `alignment/` runs the separate alignment worker, and Studio lets the creator review and apply the result. Generated timing may need manual correction. During playback the current line highlights and follows the audio, including seeks and repeats; clicking a line seeks to its timestamp. Guests remain limited to the 60-second preview. Migration `0002_silly_terrax.sql` adds the optional lyrics fields.

Song cards and lists show real qualified play, like and comment counts publicly. Comment counts link to the discussion. Artist and producer cards retain compact widths even with one result.

Likes and personal playlists are stored per account in the library. Users can select liked tracks together, create named mood playlists, add songs directly from a song, rename lists, remove members, and save the playback order. Lists default to private, with optional public links. Migration `0003_steep_speed.sql` backfills stable playlist positions. Playlist creation with selected songs is atomic; order edits require ownership and matching membership and preserve hidden tracks for later republication. SQLite-backed tests verify ordering, privacy, ownership, invalid selections and hidden members; local browser QA covers creation, playback and responsive layouts.

## Karaoke MR

Uploads require the karaoke clause (`KARAOKE_TERMS_VERSION`); each track stores the accepted version and time, and earlier tracks opt in from track editing. After a consented track is transcoded, `karaoke_jobs` queues a build: the `alignment/` worker separates vocals with htdemucs, stores `karaoke/{track}/mr.m4a` and `vocals.m4a` in private R2, then aligns the creator's synced lyrics on the separated vocals and keeps word timings. The same worker handles lyric jobs first, then karaoke builds, strictly one song at a time. Lyric edits re-align words on the kept MR; a new transcode rebuilds the MR. Creators can listen to the MR in Studio, regenerate it, or replace it with their own WAV/FLAC/MP3 of matching length (±3 s). Songs over 10 minutes are refused. Migrations `0008_karaoke_consent.sql` and `0009_karaoke_jobs.sql`; plan and revenue decisions in `docs/노래방-기획.md`.

## Discovery and listening controls

Discovery supports genre filters, six mood/activity tags and releases from followed artists or producers. Mood membership comes from creator tags; recommendation order uses actual plays and likes. Search separates tracks, artists, producers and public playlists. Public playlist browsing supports name/description/creator search and save-count or newest sorting.

Users can bookmark public playlists, which stay linked to the owner's current selections. Private lists and hidden tracks are excluded from other users' search, library summaries and cover collages. The library supports search, own/saved filters, per-user pins and persisted custom playlist order. Playlists have descriptions and automatic cover collages; song selection supports likes, recent history and search with duplicate prevention. Migration `0004_even_red_skull.sql` adds descriptions, bookmarks and per-user library preferences.

Song menus support play-next and queue append. The active queue supports move, remove and clear-waiting controls without changing a saved playlist. Queue IDs and minimal display metadata persist for the browser tab session; playback fetches current server permissions. Queue helpers are tested alongside SQLite routing tests for public visibility, bookmarking, ordering and discovery.

## Publishing

Keep the existing Sites project in `.openai/hosting.json`, with `d1: "DB"` and `r2: "BUCKET"`. Generate and inspect Drizzle migrations; never edit an applied migration. Build, commit/push the exact source, use the official Sites packager and native Sites version/deploy tools, preserving public access and the custom domain. D1 and R2 are provisioned by Sites; do not run Wrangler remote deployment against a different account.

## Git snapshot

This project is stored under `ai음원사이트/`. Run commands from this directory. Source, migrations, tests, deployment configuration and the submitted NICEPAY payment-flow PDF are included. Runtime secrets, local databases, uploaded user media and generated build outputs are excluded. See `docs/인수인계.md`.


## 커버 랭킹과 댓글 관리 (Android 2.3.0)

`0013_cover_rankings_moderation.sql`을 API 배포 전에 적용한다. 기존 데이터 삭제 없이 댓글 삭제 상태, 신고 내역과 좋아요 시간 인덱스를 추가한다.

- `GET /api/cover-rankings?period=today|week|month|all&kind=tracks|singers`: 한국 시간의 오늘 0시, 월요일 0시, 이달 1일 0시 이후 **받은** 현재 유효한 좋아요를 집계한다. 명예의 전당은 누적이다. 0표는 순위에서 제외하며 재생수/댓글수는 점수에 넣지 않는다. 동점은 누적 좋아요, 최신 게시, ID 순이다. 가수는 공개 커버의 합계이며 동점은 누적 좋아요, 프로필 ID 순이다.
- 선택 필터 `genre`, `q`(곡/가수 이름의 리터럴 검색), `original_id`; 기본 50개, 최대 100개. 검색 결과 내 순위다. 원곡 비공개/노래방 제공 동의 철회 시 관련 커버는 즉시 집계에서 제외된다.
- 댓글 GET은 `can_delete`, `can_report`, `reported`, `deleted_at`을 제공한다. 댓글 작성자는 자기 댓글을, 커버 업로더는 해당 커버의 댓글을 삭제할 수 있다. 다른 사람의 댓글 수정은 금지한다. 삭제 후 복구/좋아요/신고는 거부하고 본문은 삭제 안내로 대체한다.
- `POST /api/comments/:id/report`의 JSON은 `{reason,details}`. 사유는 `abuse|spam|privacy|sexual|other`, 설명은 최대 500자다. 로그인 필요, 자기 댓글 신고 불가, 계정당 댓글별 1건, 시간당 20건 제한. 신고 당시 본문은 운영 확인을 위해 비공개 보관한다.
- 운영자는 기존 `ADMIN_USER_IDS` 권한으로 `GET /api/admin/comment-reports?status=pending|dismissed|removed`를 조회하고 `PATCH /api/admin/comment-reports/:id`에 `{status:"dismissed"|"removed"}`를 전송해 처리한다. 삭제·상태 변경·감사 기록은 원자적으로 처리하며 미처리 목록은 오래된 순 100건씩 반환한다. 신고만으로 댓글을 자동 삭제하지 않는다.

회귀 검증은 새로운 SQL 마이그레이션을 적용한 별도 로컬 DB에서 실행한다. `AIFECT_TEST_ORIGIN`으로 서버 주소를 지정할 수 있으며 운영 데이터에는 테스트를 생성하지 않는다.
