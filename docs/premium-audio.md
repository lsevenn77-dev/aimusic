# AAC 256 Premium playback

Free full streams and previews remain AAC 128. `/api/playback/:id` returns an explicit
Premium URL only after the separate AAC 256 object is verified. Every media request,
including HEAD/range, checks current membership and track visibility. Responses are
private/no-store. Pending or missing high-quality objects use AAC 128 and expose
`high_quality_pending`; the player displays the actual selected bitrate.

Migration 0022 adds an independent queue. The authenticated encoder claims regular
uploads first, then Premium jobs, then lossless archive work. Claiming discovers
both old and new published/hidden tracks without changing their publication or MR.
Input is always the uploaded original or its lossless FLAC archive. Existing AAC 128
streams are never used as the encoding source. Existing low-quality uploaded sources
cannot regain lost detail through this conversion.

The encoder checks AAC/stereo/44.1 kHz and duration, uploads a lease-specific object
with SHA-256 validation, and atomically marks it ready after storage verification.
Leases last 15 minutes, expire safely and retry at most three times. A regular
owner-requested reprocess clears the derived Premium job and queues a fresh version.
Deleted/private originals remain governed by normal visibility rules.

Deploy the Site migration/API first, then copy `worker.py`, `premium.py`, and
`Dockerfile` to the existing `/root/aifect` encoder directory. Preserve `.env` and
all unrelated services. Run `docker compose -p aifect -f compose.yml up -d --build
--no-deps transcoder` without `--remove-orphans`. Observe `premium_ready` events
and the `premium_audio_jobs` state before reporting backfill complete.

Verification: `node --test tests/premium-audio.test.mjs`; with FFmpeg available,
`python -m unittest discover -s transcoder -p test_premium.py` also checks actual
WAV/FLAC to AAC 256 encoding and output bitrates.
