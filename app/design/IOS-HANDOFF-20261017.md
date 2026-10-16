# AIFECT web / Android handoff — 2026-10-17

Android 2.5.47 (versionCode 60) was submitted to the existing Google Play **비공테** closed-testing track. Review is pending; submission does not mean the update is already available to testers. iOS has not been built or submitted from this Windows checkout.

## Current source

- Branch: `codex/android-native-app`.
- `ai음원사이트/` contains the deployed web application, assets, APIs, schema and migrations through Sites source commit `a1f5e12587f31b81375a2d47ce76eb1216afe12e` (production version 147).
- The mirror preserves its own hosting/Git configuration. Do not overwrite production settings or replay migrations without checking the target environment.
- Production: https://aifect.co.kr

## iPhone implementation reference

- Gift catalog matches the confirmed web design: 9 silver gifts / 10 gold gifts. Display **실버 / 골드**, units **S / G**. Quantity 1–100, total cost, balance confirmation and duplicate-request protection are implemented in Android `GiftSelection.kt`, `GiftScreens.kt` and the web gift APIs.
- Activity notifications show who participated in a cover/duet or sent a gift, with date, quantity and total. The entry is available under Messages, after the pinned crew conversation, plus the profile and header notification badge. See `ActivityScreens.kt` and `/api/notifications` in the mirrored server.
- Cover artwork uses the uploader's profile; originals retain their registered album artwork. Original-song cover tabs are solo, duet and ranking by actual views.
- Owners can change original album artwork and playlist artwork. My page shows silver/gold balances and a creator-studio entry.
- Original-song upload allowance is free **3 per month**, Premium **10 per month**. Existing pricing, diamond settlement and crew/player-frame policies are retained.
- Home, community, genre images and compact song lists follow the updated web design. Community cards do not include decorative waveform bars.
- Android compact player has the current lyric, shuffle, repeat, playback controls, queue and collapse. Detailed gift/save/sing/comment actions stay in the song view.
- **The latest lyric request specifically concerns mobile web:** desktop web defaults to two lyric lines, mobile web to one. The desktop lyric toggle remains available. Screenshots below are from the deployed site, at desktop and 390px mobile viewport sizes.
- Solo recording uses white for the current line and gray for other lines. Duet parts retain three roles/colors and manual line assignment. Pitch correction is removed from the user flow; vocal tone/effect controls remain.
- Android backing-track key changes allow repeated taps without waiting for each intermediate conversion: the most recent selection wins. Key range is -6 to +6 semitones with tempo retained; selection survives activity recreation. Existing duet participation inherits the source key. `karaoke/BackingKey.java` and `KaraokeActivity.java` provide the implementation reference.

## Validation and limitations

- Release build and signed AAB verification succeeded.
- 61 release unit tests passed. Device checks cover gift quantity/cost, activity history, images/cover tabs, mini-player/queue, and recording-key behavior. Two failures in the initial device run were fixed and both passed on rerun; the final rapid-key/activity-recreation check also passed.
- Backing-key tests verify expected pitch changes, unchanged duration/source samples and cancellation cleanup. Human vocal quality was not assessed by these automated tests.
- Android release lint: 0 errors, 116 warnings. Existing warnings are not a claim of a warning-free project.
- Web focused tests: 31 passed; final public-catalog artwork correction: 2 passed. The mirrored files are copied from that validated source.
- AdSense rejection reason was **가치가 별로 없는 콘텐츠**. Public music/catalog/detail/about content and navigation were improved, deployed, and resubmitted. Approval remains pending.

## Build artifact

- `AIFECT-2.5.47-60-play.aab`
- SHA-256: `7F1B611EDE368EC41C8EB75D31DF42113DD7CA8E68DC5EDFA31EA9838822B5ED`
- The signed binary and signing credentials are not committed. Google Play has the submitted bundle.

## Screens

Android screenshots below use isolated emulator fixtures, not production users or transactions.

![Silver gift catalog](android-2.5.47/40-silver-gifts.png)
![Gift quantity](android-2.5.47/41-gift-quantity.png)
![Activity notifications](android-2.5.47/42-activity-history.png)
![Mini player](android-2.5.47/45-mini-player.png)
![Queue](android-2.5.47/46-player-queue.png)
![Backing key selection](android-2.5.47/backing-key.png)
![Desktop web lyrics](android-2.5.47/web-desktop-lyrics.png)
![Mobile web lyrics](android-2.5.47/web-mobile-lyrics.png)
