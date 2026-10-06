# Android push notifications

Implemented: authenticated FCM device registration, DM/comment/gift transactional outbox,
account-scoped settings, expired/revoked session filtering, invalid-token cleanup, retry leases,
private notification previews and account-validated navigation to the conversation/song.
No notification or user data goes through public FCM topics.

## Active configuration (2026-10-06)

AIFECT Firebase project `aifect`, Android application `kr.co.aifect.app` registered.
FCM HTTP v1 and Firebase Installations enabled; sending-only service account stored in
the production `FCM_SERVICE_ACCOUNT` secret. Migration and backend deployed as Site version 82.
Android 2.5.28 (41) installed as an update on the connected owner phone. Device registration,
FCM accepted test send, Android notification posting, and song destination intent verified.
The destination test exercised the notification intent; it did not physically tap the notification.
DM/comment/gift event filtering and retry behavior passed three focused server tests.

## Setup for another environment

1. Register `kr.co.aifect.app` in the AIFECT Firebase project. Place its downloaded
   `google-services.json` in `app/android/app/`. Do not use another application's config.
2. Enable FCM HTTP v1. Configure a service account with only the Firebase Cloud Messaging
   sending role and put its JSON in the hosted **secret** `FCM_SERVICE_ACCOUNT`.
   Never commit the service-account file or package it in Android.
3. Deploy migration `0030_push_notifications` and backend, then build an updated APK.
4. Test on the connected owner device: permission granted, authenticated token registration,
   notification receipt while backgrounded, correct DM/song navigation and logout isolation.

The app compiles without Firebase config for development, but **cannot receive actual pushes**
until step 1 is complete. The server dispatches only when the hosted secret is configured.
Do not release a configuration-free build as a finished push update.

Retries are triggered by subsequent API traffic, throttled to once per worker isolate per
30 seconds; immediate sends follow successful message/comment/gift writes. No scheduled
retry worker is configured. Pending events expire after 24 hours; delivery is best effort.

Validation: `node --test tests/push.test.mjs`; Android `:app:assembleDebug`.
Tests use generated local test keys and mocked FCM; they are not proof of phone delivery.
