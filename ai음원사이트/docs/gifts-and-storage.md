# Gifts and original storage — 2026-09-28

## Gifts
- The public gift catalog uses the six approved prices: note 10G, heart 50G, rose 100G, coffee 300G, microphone 500G, crown 1,000G. 1G is 10 KRW. Gold checkout remains disabled until its payment integration is ready.
- Free stars are earned, never purchased or converted to gold. Korea calendar days: check-in 3, publishing a cover 2 once, listening to five different songs for at least 60% each 2 once, and comments of at least three characters 1 each up to three. Removed comments do not qualify for unclaimed rewards. Stars accumulate in a separate wallet.
- Song/profile support ranks add gold and stars at one point each and show both components. Cover gift sorting uses the same weight. Like-based community charts remain separate. Free stars do not create purchase lots, revenue, or payouts.
- Claims and gifts use atomic D1 batches, uniqueness constraints and nonnegative wallets. Typed gifts use server prices and retry IDs. The legacy native gold API remains compatible.
- Desktop has a gift picker beside the support rank; mobile stacks them. Player, song menu, community, profile and gift-shop entries lead to the same confirmation dialog.

## Image uploads
All website uploadFile image paths encode JPEG/PNG/WebP to actual WebP, longest edge 1,600px, without upscaling. Unsupported conversion fails visibly. Audio uploads are untouched. Existing images and separate native upload implementations are not backfilled by this change.

## Lossless originals
Migration 0015 adds a private archive ledger and optional original_key. The transcoder gives new uploads priority, then archives existing/new published or hidden WAVs in the background.
Only single-stream mono/stereo integer PCM 8/16/24-bit WAVs are candidates. Float/32-bit or multi-stream files remain WAV. FLAC keeps the original sample rate/channel count. The worker compares SHA-256 of decoded PCM, requires smaller output, uploads with an R2-validated SHA-256, and downloads it to verify the stored file. It then atomically switches the original pointer. Only a committed job with a matching stored checksum can delete the old WAV. AAC streams, previews and MR are unaffected.
Lease-specific output keys prevent old workers from overwriting new originals. Interrupted cleanup resumes separately. Failed conversion preserves WAV, with at most three encoding attempts; skipped files are retained. A crash before cleanup may temporarily leave extra bytes, never an intentionally missing source. Do not downgrade past 0015 without teaching the old worker to use original_key.

Validation: fixture/API tests cover balances, repeat claims, weighted ranks, concurrent gifts, original pointer transactions, lease expiry and failed cleanup. Native FFmpeg tests cover 8/16/24-bit round trips and float/32-bit preservation. Local workerd/R2 validates upload checksums, readback and cleanup.

R2 checksum API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
