# Reference UI implementation — 2.5.70 (83)

Based on the five user-supplied references on 2026-10-28. Source baseline is 2.5.69 (82), not the older 2.5.54 checkout. Existing logo, APIs, authentication, payments, audio engines and account data retained.

## Changes
- Shared native destination backgrounds and headers: quiet navy, restrained lavender wash, consistent readable headings. Shared tabs use lavender-to-mint underlines.
- Messages: equal-width All/Unread/Crew/Notice tabs, roomier avatar rows, dividers, original search and conversation actions.
- My: Works/Activity/Library tabs, primary Studio action, lighter borderless content sections, real notifications in Activity and account-scoped library cards. Gallery, edit, shop, wallet and account actions preserved.
- Song detail: large centered album, blurred album ambience on Android 12+, playback/seek/shuffle/repeat, save/like/sing/gift, description, current lyrics, existing covers/comments and management actions.
- Talking room: header/title before music selector, larger seats, clearer muted identities; existing room settings, seating, gift, voice and chat flows preserved.
- No generated sample people/messages were written to the live service. Test fixtures remain emulator-only.

## Validation
- Final APK build, unit tests: 74 tests, no failures. Lint: no errors (existing warnings retained).
- New route/section/playback UI test passed at 390dp and 320dp.
- Existing listener/chat, room music/profile/playlist and dubbing countdown/save/recovery instrumentation tests passed (3).
- UI captures in `390/` are isolated test fixtures, not production account screenshots. Captures precede the final subtle backdrop/lyrics addition; those additions passed the final compilation/lint/unit checks.
- Existing installation signature matched. Updated physical Samsung R5CY72CLAPW in place; version 2.5.70 (83) verified and process running. No uninstall/data clear, website deployment, store release or database migration.
- The phone was locked during installation; a full manual visual/touch sweep of every secondary screen on the physical phone remains unverified. Recording/audio regressions were exercised using isolated emulator fixtures, not a new live recording.

APK: `C:/Users/lseve/Desktop/AIFECT-2.5.70.apk`.
