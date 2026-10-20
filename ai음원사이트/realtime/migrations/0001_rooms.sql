CREATE TABLE voice_rooms (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, host_id TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('public','private','crew')),
 crew_id TEXT, created INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX voice_rooms_directory ON voice_rooms(closed,visibility,created);
CREATE TABLE voice_room_events (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, target_id TEXT, created INTEGER NOT NULL
);
CREATE INDEX voice_room_events_room ON voice_room_events(room_id,created);
