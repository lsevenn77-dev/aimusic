# Android 2.5.79 (92)

The account menu now exposes blocked users and permanent account deletion. Blocking uses a user ID rather than a producer/profile ID. The final removal request verifies the current account ID and the confirmation text. Track quality reports and comment reports use their respective APIs; user reports open an addressed support email for the user to send. No DM body is included.

Playback segments are stored in a 64 MiB LRU cache after server authorization. Session, quality, source, duration and hour distinguish keys. Only the two guest catalog lists have a disk fallback (up to 24 hours); offline playback is not a new entitlement. The app observes audio focus and carrier call audio mode without requesting phone state. The payout screen uses the host window's secure flag.

The canonical song link is `https://aifect.co.kr/music/{id}`. Verify the Play signing fingerprint, not the workstation upload or debug key, against `/.well-known/assetlinks.json`. The policy endpoint `/api/android/release-policy` defaults to a minimum version of 1. A flexible Play update is offered only when Play reports one for this install. Native crash and ANR monitoring for this release uses Play Console Android vitals and the included R8 mapping. No Firebase Crashlytics collection was added.

Build from `app/android` with JDK 21: `gradlew :app:bundleRelease :app:assembleRelease :app:testReleaseUnitTest :app:lintRelease`. Test fixtures use `-PaifectTest`. The keyboard test expects a disposable instance of the web repository's `tests/preview-live-karaoke.mjs`, an adb reverse mapping, and instrumentation arguments `karaokeFixtureOrigin`, `karaokeFixtureRoom`. The manually selected baseline profile covers app startup, catalog and playback entry points; it is not a measured startup speedup.

The upload key remains outside Git. For runtime checks, sign the release APK with the emulator's existing install identity. Its signature is unrelated to Play website association.

