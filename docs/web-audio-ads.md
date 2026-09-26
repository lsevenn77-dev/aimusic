# Web audio advertising

The web player uses Google IMA HTML5 with an audio-only Google Ad Manager VAST
tag. There are no AdSense display banners or auto ads in this implementation.
The existing ads.txt seller authorization and AdSense ownership meta tag remain.

## Current activation status

On 2026-09-26 the publisher account lsevenn88@gmail.com was verified in AdSense.
Ad Manager signup returned `uncheckedAdsenseAccount`: the AdSense account
application must be approved first. No production audio inventory/tag has been
issued. `WEB_AUDIO_AD_TAG_URL` remains unset; production does **not** request an
ad SDK or serve placeholder advertising in this state.

After approval, create Audio inventory in the same Ad Manager account, link an
approved audio demand source, configure a single-ad VAST tag, and set its exact
URL in the server environment as `WEB_AUDIO_AD_TAG_URL`. Never use an AdMob ID,
AdSense display slot, or Google's sample VAST tag. Enablement requires actual
audio inventory and demand, not merely account signup. Test the tag in Google's
test tooling before activation. The server enforces `ad_type=audio`,
`env=instream` and `vpmute=0`.

The initial region gate permits Korean traffic only. Unknown/other countries
remain disabled until a Google-certified IMA consent integration is deployed
and verified there. The earlier AdSense display CMP publication alone does not
verify consent handling for IMA. Premium and signed-out listeners are excluded
server-side. Entitlement is checked again before each ad request.

## Playback behavior

- Five ended songs with at least 80% actually played make one ad break due.
  Native audio played ranges avoid background timer throttling and skip jumps.
- The break runs before the next song (including repeat); a queue ending retains
  the due break for the next play. Session storage is scoped to the account.
- The existing player displays the ad label, remaining time, pause/resume,
  volume and an SDK-authorized skip control. It does not show a banner.
- No fill, blocked SDK, network timeout or IMA error continues music. A failed
  request does not repeatedly retry at each following song. Closing playback,
  logout, starting karaoke and Premium activation cancel an active break.
- Music listening counts and lyrics ignore ad playback. Headset controls use
  IMA during ads. Concurrent song selections share a break, and the latest
  selection wins once playback resumes.
- IMA initialization uses a trusted click. Until it is initialized, or while
  sound is muted, music continues without forcing an ad or permission popup.

## Verification

`node --test tests/audio-ads.test.mjs` covers cadence, entitlement/configuration,
no fill, timeout, concurrency, cancellation, Premium, progress and SDK controls
using a deterministic IMA double. It does not prove live ad fill. Production
tag playback on desktop and Android browser remains an activation check after
the publisher receives actual audio inventory.

Official integration references:
- https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/audio
- https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/get-started
- https://support.google.com/admanager/answer/7642796

Android's existing AdMob interstitial integration is separate from this web
audio adapter and requires separate account/device diagnostics.
