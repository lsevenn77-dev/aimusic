# Dubbing and cover management, 2026-10-20

- AI script quota is enforced atomically from the current Google/web or Apple Premium entitlement: normal 1/day, Premium 3/day, reset at Korean midnight. Existing ad reward limits remain separate.
- Story suggestions use local genre/cast/duration templates and do not consume Gold or AI quota.
- Manual editing defaults to `A: dialogue` and `B: dialogue`, with detailed settings still available. Unchanged lines retain IDs, timing and sound anchors.
- Dubbing tabs replace only the results area. Open shows reusable public scripts; complete/latest/popular show completed performances; mine uses ownership/participation.
- A public script can start independent performances. A new performance copies the script/background, reserves one chosen role and keeps other roles open. Existing recordings are never copied.
- Only the uploader can delete a script/performance. A deleted root hides its performances; recordings and financial records remain retained internally.
- My profile links directly to My Covers. Selecting an owned cover reveals Delete; the existing owner-authorized upload deletion endpoint is used. Public profile cover cards and cover detail also expose the owner's control.
- Admin whole-cover deletion requires a server snapshot/count, affects only `kind=cover`, invalidates processing jobs, and records the affected IDs/statuses in admin audit. Originals, dubbing projects and financial ledgers are excluded.
- Pika submission now distinguishes confirmed HTTP rejection from an unknown response and logs only safe status/code identifiers. Admin read-only Pika authentication diagnostics do not create media or spend provider credit.

## Verification

- Focused suite: 93 passed, 1 skipped (environment-dependent recorder test), 0 failed.
- Full initial run: 644 passed, 28 failed, 1 skipped. A clean v176 comparison had 23 failures. Five new VM-only failures from an unguarded document listener were corrected; the focused singing tests pass after correction.
- Existing baseline failures include stale test doubles and fixtures (such as three-column likes inserts after dubbing support added a fourth column). They are not reported as passing.
- Build succeeded.
- Browser local fixture: random idea populated, A/B text saved as three separate role lines, completed tab replaced results without replacing header, My Covers selection revealed Delete and deletion returned the empty state.
- Pika root cause: Cloudflare Workers rejects fetch redirect:error before sending HTTP. Submission, polling and the read-only diagnostic now use redirect:manual. The deployed authenticated probe returned HTTP 404 for a deliberately nonexistent job (no media created). The old unsubmitted attempt was detached from the current script with an admin audit; its 50G refund and accounting history remain unchanged. Production UI again offers the 50G generation button. Actual paid generation/audio output remains unverified.
- No native Android/iOS build or physical-device audio check is included in this web change.

## Production outcome (2026-10-21 KST)

- v178 deployed successfully, commit `180c89a0e33e1a2228257bfc2b22126cc67ffefe`.
- After the user explicitly confirmed site-wide scope including other members, admin preview showed 3 covers: 널 사랑하지 않아 and two 물수제비 covers. All 3 were deleted; originals and dubbing were excluded. The server keeps an audit with exact IDs, original statuses and owner IDs.
- Production My Covers now displays the empty state. Evidence: `work/covers-production-empty.png`.
- Select-then-delete UI evidence from the disposable local fixture: `work/my-covers-delete-selected.png`.
- Web and responsive mobile-web share the same ownership-checked controls. No separate native app build/install was performed.
