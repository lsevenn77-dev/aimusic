# Live karaoke search, invitations and layout

This candidate preserves the existing Sites identity, storage bindings, room themes and talking-room implementation. No DB migration is required.

## Behavior

- Song search returns up to 40 eligible public songs with lean title/artist metadata. It retains rights, MR/lyrics, visibility and blocked-creator checks, without querying listening/comment/gift aggregates or decorating room inventory for the search permission check.
- The stage uses the selected room background. Chat/participants remain on the right on desktop; the song-request entry and horizontally scrolling queue sit below the stage. Mobile stacks these regions. The supplied starry background was a layout example, not an asset request.
- Reservations advance automatically in FIFO order. The current singer has 15 seconds to press Start. The same click opens microphone setup and starts the three-second countdown once the microphone publishes and MR is ready. A separate 15-second setup deadline allows the queue to advance if permission or audio never becomes ready.
- The host may switch between talking and karaoke in room settings. Saving a different type immediately stops playback and clears queued songs, seat requests and live media. The room ID, host, membership and chat are retained.

## Matched rollout and rollback

1. Under the user’s 2026-11-01 standing authorization, publish after all required validation succeeds. There is no DB change.
2. Publish the saved Sites version first. The client tolerates the previous Worker's ready phase. Verify the published client assets.
3. Refresh existing karaoke tabs before the Worker switch: previously loaded clients do not have the invitation acceptance button. Avoid switching during an active karaoke performance. Capture the current deployed Worker version for rollback.
4. Deploy with **realtime/wrangler.jsonc**. Its main is **worker-live-karaoke.js**, the operational entrypoint for both room types. Preserve the current account, ROOMS Durable Object namespace, ROOM_DB and secrets.
5. Verify song request, invitation acceptance/expiry and audio with two real devices. Local fixtures verify server state and UI, but do not replace real SFU/microphone/MR validation.
6. On failure, restore the recorded prior realtime Worker version and the prior Sites deployment (362 at implementation start). Existing persisted ready/singing state is preserved; invitation state is additive. Have affected karaoke rooms re-enter/recreate if rolling back an in-flight invitation. Never restore/delete user/payment data as part of this rollback.

## Local verification

## Payment review entry correction

Gold and Premium review-account buttons navigate to the existing isolated Toss TEST order pages before any NICEPAY order, SDK or card-entry flow. Normal payment processing is unchanged. The production Premium TEST configuration is available; Gold TEST configuration is still unavailable until the separate merchant test keys are connected. This candidate does not configure keys, charge cards, issue Gold or change payment records.

## Validation commands

`npm run release:prepare` executes the complete regression suite and production build. `npm run release:check` validates unchanged source/build hashes before packaging. Focused tests cover visibility and search bounds, invitation nonce/deadline/retry/restart/leave, unchanged talking-room operations, route cleanup and client controls.

`node tests/preview-live-karaoke.mjs` runs the actual UI/router with a disposable local database. `/qa-layout?width=1440` and widths 390, 320, 768 provide responsive checks. `before=1` displays the previous client from commit 22e487ce3095d09b9df8b51b5a5942571b3db5d3. All displayed accounts/content are local fixtures. Local media intentionally has no R2/MR data and the Node fixture uses heartbeat fallback rather than an upgraded WebSocket.

## 2026-11-01 chat and preparation refinement

- “노래 포기” cancels the current turn and invites the next eligible reservation. Invitation IDs protect the next singer from stale repeated commands.
- The inline emoji picker sits above the chat composer in talking rooms and karaoke. Selection and sending keep it open; the close button, toggle or Escape hides it. Multiple selections preserve cursor position and the 500-character limit.
- Local clock-driven tests cover deadline boundaries, restart, microphone cleanup and stale commands. Physical microphone/network timing still requires a real-device check.
