# Mixed-duet lyric colors

Original karaoke songs share one MR. `karaoke_vocal_parts` stores lyric roles separately from audio and from user-recorded duet A/B guides. A complete original audio file and existing timed lyrics go to the configured Gemini music integration after karaoke preparation. The analysis is also queued for older eligible originals. Covers inherit their original's lyric roles through the singing API; their recorded partner guide is unchanged.

Only confident mixed male-role/female-role lead arrangements get blue/pink line labels. Solo, instrumental, and same-gender groups get no gender division. Simultaneous or within-line mixed parts use `both`; uncertain lines stay neutral. These labels describe musical performance roles, not a performer's identity. The current lyric is white for every song.

## Queue and limits

- Eligible: original, published/hidden, opted in to karaoke, ready MR and nonempty timed lyrics.
- A karaoke job ID and analysis version identify one analysis revision. Reloading does not reset completed jobs. Rebuilding lyrics/MR invalidates previous roles.
- Jobs run on authenticated transcoder claim/finish, studio/karaoke list reads, and existing scheduled worker ticks. These paths process at most one claimed job each.
- Exclusive two-minute leases, three attempts, one-minute retry delay, default 100 analyses/day (`GEMINI_VOCAL_PARTS_DAILY_LIMIT`). Provider timeout is 24 seconds. Secrets never go to the client.
- Use full `stream/<id>.m4a` only, at most 14 MiB. Never infer whole-song parts from a short preview. Missing/oversized audio is a terminal failure; the song and MR remain available.
- No data is seeded in migrations; the durable idempotent queue performs the backfill.
- Public karaoke list exposes state only (`pending`, `queued`, `processing`, `done`, `excluded`, `review`, `failed`). The signed-in singing API exposes normalized roles only, never model output, provider keys or analysis usage.

## Verification

`node --test tests/vocal-parts.test.mjs tests/karaoke-build.test.mjs tests/karaoke-sing.test.mjs tests/duets.test.mjs tests/duet-guide.test.mjs tests/recording-ui.test.mjs tests/page-redesign.test.mjs`

Tests cover classification exclusion, invalid ranges, uncertain lines, full audio requirements, retry bounds, concurrent claims, stale/deleted revisions, login boundaries and unchanged MR/timings. `tests/preview-recording.mjs` adds explicitly artificial mixed/group fixtures for browser color checks; it is never bundled into the deployed app.
