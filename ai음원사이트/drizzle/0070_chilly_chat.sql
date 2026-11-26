ALTER TABLE `tracks` ADD `first_published_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Preserve legacy dates; future first publication is recorded independently of draft creation.
UPDATE tracks SET first_published_at=created WHERE status IN ('published','hidden','removed','deleted');
--> statement-breakpoint
CREATE TRIGGER track_first_publication_update AFTER UPDATE OF status ON tracks
WHEN NEW.status='published' AND OLD.status!='published' AND OLD.first_published_at=0
BEGIN UPDATE tracks SET first_published_at=unixepoch() WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER track_first_publication_insert AFTER INSERT ON tracks
WHEN NEW.status='published' AND NEW.first_published_at=0
BEGIN UPDATE tracks SET first_published_at=NEW.created WHERE id=NEW.id; END;
