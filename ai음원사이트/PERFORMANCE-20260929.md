# AIFECT response-time improvements — 2026-09-29

The previous page stayed visible until all route data arrived, and startup blocked menus and actions on a complete library download. Account/profile checks and several screens also performed independent database reads sequentially.

## Changes
- Show the selected route and its loading state immediately. Keep the final playback queue tied to the latest navigation so late responses cannot replace it.
- Resolve public nickname and session validity in one database read on every authenticated request, preserving session revocation and OAuth-name privacy.
- Return lightweight like/follow state with web startup. Load the full library independently; playback and navigation no longer wait for it.
- Deduplicate concurrent GET requests. Reuse selected discovery/library responses for at most 10 seconds in account-scoped memory, capped at 60 entries. Invalidate at mutation start and completion. Wallets, payouts, authentication, crew permissions and conversations are never retained as completed cache entries.
- Update likes immediately, block duplicate submissions, and roll back errors. Avoid downloading the full library after a like.
- Fetch playback metadata and playback authorization concurrently; do not block the next track on listening-report completion.
- Batch crew XP synchronization, remove duplicate crew lookups, and run independent crew/profile/track/search/gift queries together.
- Fetch reward progress and balance in one query. Keep financial mutations and reward qualification rules unchanged.
- Preserve chat DOM when polling returns unchanged messages; avoid the immediate duplicate DM history request.

## Verification
- All 166 server/client automated tests pass, including privacy, permissions, financial accounting, rewards, cache isolation/invalidation and optimistic-like rollback.
- Local Chrome desktop/mobile checks: first navigation feedback 28 ms with a deliberately delayed endpoint; repeat cached menu 6 ms; like feedback 32 ms before its held response. These are local interaction timings, not production page-load guarantees.
- Tested navigation: charts, search, artists, following, gifts, library, rewards, payouts, DM, community, karaoke and crew. Startup navigates while library response is deliberately held. Unchanged chat polling preserves the message node. No JavaScript errors; 390px layout has no horizontal overflow.
- Existing follow-up browser regression also passed after the initial optimization (follow feedback 37 ms).
- Controlled server benchmark with 40 ms added to each database round trip: crew detail 475 to 143 ms; crew listing 380 to 190 ms; chat history 285 to 143 ms; song detail 284 to 143 ms; own profile 331 to 143 ms. These compare the dependency chains, not internet latency.
- No database migration, Android package/signing change, or production test messages/payments were required. Backend improvements also apply to the existing Android app's API requests.
