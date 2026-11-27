# Playlist eligibility

The 2026-11-24 unified library accepts original tracks, covers and dubbing projects. Only nonempty original-only playlists can be made public. All additions use the stored content type and current access rules. Empty and original-only playlists reserve a normalized title. Mixed lists remain private and may share a title. See `server/playlists.js` and `server/playlist-visibility.js`.

The November 6 original-only maintenance job has been retired. Its historical snapshots and counts remain in `admin_audit`. The current `playlist_cleanup` admin result is read-only. The following records describe the previous release.

## Historical playlist eligibility — 2026-11-06

The authoritative discriminator is `tracks.kind`. Only `original` is eligible.
Titles, display labels, `original_id`, performance mode and cover artwork never
promote a cover/work into a produced song. Missing or unknown types fail closed.
Produced songs stay eligible regardless of whether they offer duet karaoke.
Publication, ownership, block lists, membership and privacy checks still apply.

`shared/playlist-policy.js` is imported by the server and bundled as
`AifectPlaylist` for the existing classic-script client. All single additions and
playlist creation validate stored IDs. `/api/playlists/candidates` filters search,
likes and listening history in SQL before returning results. Playlist summaries,
home recommendations, detail and reordering apply the same predicate. Ordinary
likes/history and the temporary player queue continue accepting covers.

## Authorized legacy cleanup

The owner requested removal of all non-original playlist memberships on
2026-11-06. No schema migration, track deletion or media deletion is involved.
An existing authenticated transcoder heartbeat (`POST /internal/jobs/claim`)
queues `server/playlist-cleanup.js`; public reads cannot trigger this maintenance.

1. Commit an immutable type/mode/state count report to `admin_audit`, ID
   `playlist-originals:20261106:plan`, action `playlist:originals:plan`.
2. Commit up to 100 membership backups per heartbeat, action
   `playlist:originals:backup`. The JSON retains playlist/track IDs, creation time,
   position and original stored type/mode. Reordered memberships are resnapshotted.
3. In a D1 batch, recheck the stored type and remove only backed-up non-original
   memberships. Record the exact `changes()` count as `playlist:originals:removed`.
   A failed batch rolls back deletion and count together. Retries are safe.
4. Stop when no invalid membership remains. Originals, including hidden ones,
   are never part of the deletion predicate. Gaps in positions are safe; the
   existing order editor renumbers them when used.

The authenticated `aifect_admin_stats` response includes `playlist_cleanup` with
the initial report, cumulative removed membership count and remaining count.
Existing `aifect_audit_history` reads the durable logs. Backups remain available
for operator investigation; restoring excluded types would require an explicit
policy rollback and fresh authorization. Never restore them through the add API.

Validation: isolated SQLite fixtures exercise direct forged requests, atomic
creation rejection, candidates, legacy summaries, ordering and cleanup safety.
The repository release preparation runs the complete suite, build and local
Worker/assets smoke checks. Real PC/mobile browser tests use disposable local
fixtures, never production test songs or playlists.
