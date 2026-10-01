ALTER TABLE tracks ADD cover_mode text NOT NULL DEFAULT 'solo' CHECK (cover_mode IN ('solo','duet'));
--> statement-breakpoint
ALTER TABLE tracks ADD duet_parent_id text REFERENCES tracks(id);
--> statement-breakpoint
ALTER TABLE tracks ADD duet_part text NOT NULL DEFAULT '' CHECK (duet_part IN ('','male','female'));
--> statement-breakpoint
ALTER TABLE tracks ADD duet_open integer NOT NULL DEFAULT 0 CHECK (duet_open IN (0,1));
--> statement-breakpoint
CREATE INDEX tracks_duet_parent ON tracks(duet_parent_id,status);
--> statement-breakpoint
CREATE INDEX tracks_duet_open ON tracks(cover_mode,duet_open,status,created);
