CREATE TABLE IF NOT EXISTS voice_music_permissions (
 track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES users(id),
 terms TEXT NOT NULL,
 accepted_at INTEGER NOT NULL
);
