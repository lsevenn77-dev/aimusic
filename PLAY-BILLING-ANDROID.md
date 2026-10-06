# Android Google Play billing

- Package: `kr.co.aifect.app`; billing build: 2.5.30 / 43.
- Subscription: `aifect_premium_monthly`, auto-renewing base plan `monthly`, KRW 5,900/month.
- Consumable gold: `aifect_gold_500`, `aifect_gold_1000`, `aifect_gold_5000`, `aifect_gold_10000`.
- Android uses the store's displayed price, obfuscated AIFECT account binding, and server-side purchase verification. Pending payments do not grant benefits. Purchase restoration runs on foreground entry and is available in the sheet.
- Server commits entitlements before acknowledgement/consumption. Token hashing and unique purchase IDs prevent replay credits. Refunded gold remainders cannot be spent; existing paid-out gift amounts need operator reconciliation rather than silently changing historical settlements.
- Web and Play entitlements are combined; neither channel should shorten the other channel's active entitlement. Existing gift splits and Premium net revenue allocation policy are reused.
- `/api/play/notifications` verifies Google-signed OIDC tokens, exact audience and notification service account; it never infers an owner for an unknown purchase token.
- Secrets: `PLAY_SERVICE_ACCOUNT`; configuration: `PLAY_NOTIFICATION_AUDIENCE`, `PLAY_NOTIFICATION_EMAIL`, `PLAY_BILLING_ENABLED`. Keep disabled until Play products, permissions and RTDN are ready. Never commit service-account keys.
- RTDN topic: `projects/aifect/topics/aifect-play-rtdn`; push subscription: `aifect-play-server`.
- Dedicated verification service account: `aifect-play-billing@aifect.iam.gserviceaccount.com`, restricted to AIFECT in Play Console. Push authentication service account: `aifect-play-notifications@aifect.iam.gserviceaccount.com`.
- Tests: `node --test tests/play-billing.test.mjs tests/billing.test.mjs tests/gifts.test.mjs` (28 passed). Android debug/release bundle, release unit tests and lint passed; signing uses the existing upload key.
- Real purchase tests must use an eligible Play test-track installation and licensed test account. A sideloaded debug APK is not proof that store purchases succeed. No real-money purchase was made by the agent.

- Catalog activated in Play Console for KR only: Premium KRW 5,900; gold 500/1,000/5,000/10,000 at KRW 5,000/10,000/50,000/100,000. Purchase option buy, single quantity. Production billing enabled on 2026-10-06. Closed testing build 43 submitted for review; real Play purchase remains to be tested.
