# Upload advertising

- Free members: one display placement when original audio transfer starts;
  one after a cover has successfully completed upload.
- Premium and signed-out users are excluded. The server checks membership again.
- Each upload ID is attempted once per account and browser session. Retries and
  duplicate completion callbacks do not trigger another ad.
- Web uses an in-page, labelled AdSense slot, separated from upload controls.
  It never opens an overlay, pauses the player, or waits before uploading.
  Cover ads wait until the studio route has mounted. Route/account changes
  cancel stale requests; no fill, SDK failure or timeout removes the blank slot.
- Native Android uses the existing AdMob interstitial only after cover success.
  Original uploads open the web studio and therefore use its display placement.
- Native listening transitions continue immediately while audio inventory is
  being prepared. AdMob display ads must never substitute for listening audio.

## Activation

On 2026-10-06 AdSense still showed the website under review. Keep
`WEB_UPLOAD_ADS_ENABLED=false` (or unset) until the site is approved, then set
`WEB_UPLOAD_AD_CLIENT` to its exact `ca-pub-…` publisher ID and
`WEB_UPLOAD_AD_SLOT` to a real approved responsive display unit ID. Finally
enable the flag. Never reuse an AdMob unit or an audio VAST tag here.
Unknown/non-KR traffic stays disabled until an appropriate consent flow is
integrated. Embedded app WebViews do not request web display inventory.

This adapter does not guarantee fill or approval. Android debug builds use the
official AdMob test unit; release builds retain the configured live unit.

Official references:
- https://support.google.com/adsense/answer/1346295
- https://support.google.com/adsense/answer/9183363
- https://support.google.com/adsense/answer/10762946
