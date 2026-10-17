# Crew names, invitations and compact lyrics — 2026-10-17

## Crew name changes

- The owner edits the name in **크루 정보 수정**. Existing crews may make their first change immediately.
- A successful name change starts a 30 × 24-hour cooldown. The API returns `name_changed_at`, `name_change_available_at` (Unix seconds) and `can_rename` on crew objects.
- The editor locks only the name during the cooldown and shows the remaining days and exact next change time. Description, interests, recruitment and image edits remain available.
- `PATCH /api/crews/:id` accepts `name`. Ownership, unique names and the cooldown are enforced by the server and conditional database update. Saving an unchanged name does not reset the cooldown.

## Crew invitation DM

- A member viewing another person's public profile sees **내 크루에 초대**. It is omitted for self, AI artists, the same crew and recipients banned from the sender's crew.
- `POST /api/dm/:profileId/crew-invite` takes `{crew_id, request_id}`. Use a stable UUID request ID for retries.
- The sender must belong to the crew; the crew must be recruiting with free capacity. Self-invites, blocked contacts and banned/current crew members are rejected.
- A successful response includes `peer_id` and `message_id`; open that DM. The recipient gets an ordinary unread DM and the existing DM notification respects their mute preferences. Sending an invitation never joins the recipient automatically.
- DM records include nullable `crew_invite_id`. The web renders a **초대받은 크루 보기** link. The message body retains a full public crew URL for older native clients. Deleting a crew clears the structured link and preserves message history.
- Apply migration `0049_crew_names_and_invites.sql` through the normal deployment migration flow. Native clients can add the same profile action/API call; this change does not itself rebuild a native app.

## Lyrics and validation

- Desktop lyric banner fits its two text lines, centered above the player, with a 160px minimum and 550px maximum width. Mobile web remains one line.
- 42 focused server/client tests passed: crew rename ownership/cooldown/concurrency, DM idempotency/blocking/capacity/push, existing crew loading/ranking/wallet/catalog/chat streams.
- Local in-memory browser verification covered invitation send → DM → crew link, first rename → locked editor with 30-day notice, desktop two-line fit and mobile single-line display. No production crew was renamed and no production invitation was sent for testing.
