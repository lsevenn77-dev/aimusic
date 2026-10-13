# AIFECT UI direction (design-only)

This branch introduces a shared, restrained navy/pink visual layer without modifying audio, payment, follow, gifting, cover, messaging, or account behavior.

## Selected design references
- Music detail: concept 2, keep the navigation rail, lyrics and gifts visible, show cover cards from existing profile photos; compact empty state when no covers.
- Singing: concept 3 as the content-rich destination, keep empty states sparse until data exists.
- Gifts: concept 1; use existing gift products and prices, retain the existing daily free-star entry.
- Messages: concept 1, existing conversation actions only.
- Received-support panel: concept 1 plus free-star reward link already provided by the product.
- Library: concept 2; keep liked tracks/playlists/listening history here rather than duplicating these on the public profile.
- Public profile/My: personal photo/gallery-driven music home, uploaded tracks, covers, followers/following, introduction, guestbook only when supported by existing routes. Keep gold, payouts, subscriptions and account actions private.
- Main listening home: preserve the long, content-rich scrolling discovery structure. Quiet cards, legible type, generous columns; no additional decorative promo blocks.

## Scope / safeguard
- `dist/unified-ui.css` is a reversible presentation-only layer, loaded last in `dist/index.html` and copied to the deployed client by `scripts/build.mjs`.
- No new links, routes, prices, reward eligibility rules, gallery endpoints or platform features are invented.
- Additional pixel-level page-by-page implementation should be validated by Codex against live content density and existing functional behavior before deployment.

## Verification
- `npm run build`: passed on 2026-10-13.
- `npm test`: returns nonzero, including `playerAvatarClass is not defined` in music-experience test and social-priority DM avatar assertion; baseline not independently verified. Review before deployment.
