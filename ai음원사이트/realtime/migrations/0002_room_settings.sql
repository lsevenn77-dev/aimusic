-- Rebuild only the directory table to widen its CHECK; preserve every room and audit event.
CREATE TABLE voice_rooms_next (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, host_id TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('public','private','crew','followers')),
 crew_id TEXT, created INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0,
 max_members INTEGER NOT NULL DEFAULT 30, background TEXT NOT NULL DEFAULT 'navy',
 announcement TEXT NOT NULL DEFAULT ''
);
INSERT INTO voice_rooms_next(id,title,host_id,visibility,crew_id,created,closed)
 SELECT id,title,host_id,visibility,crew_id,created,closed FROM voice_rooms;
DROP TABLE voice_rooms;
ALTER TABLE voice_rooms_next RENAME TO voice_rooms;
CREATE INDEX voice_rooms_directory ON voice_rooms(closed,visibility,created);
