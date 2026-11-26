ALTER TABLE `crew_growth_events` ADD `credited` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Historical XP and credits remain intact. New publication rewards share one KST-day cap.
CREATE TRIGGER player_publication_daily_cap BEFORE INSERT ON player_xp
WHEN NEW.kind IN ('publish','cover') AND (
 SELECT count(*) FROM player_xp WHERE user_id=NEW.user_id AND kind IN ('publish','cover')
 AND created>=CAST((NEW.created+32400)/86400 AS INTEGER)*86400-32400
 AND created<CAST((NEW.created+32400)/86400 AS INTEGER)*86400+54000
)>=3 BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
-- Keep over-limit evidence so retries, republishing and moving crews cannot earn it tomorrow.
CREATE TRIGGER crew_publication_daily_cap AFTER INSERT ON crew_growth_events
WHEN NEW.kind IN ('work','activity') BEGIN
 UPDATE crew_growth_events SET credited=CASE
 WHEN EXISTS(SELECT 1 FROM crew_growth_events e WHERE e.id!=NEW.id AND e.user_id=NEW.user_id AND e.source_id=NEW.source_id AND e.kind IN ('work','activity') AND e.credited=1) THEN 1
 WHEN EXISTS(SELECT 1 FROM crew_growth_events e WHERE e.id!=NEW.id AND e.user_id=NEW.user_id AND e.source_id=NEW.source_id AND e.kind IN ('work','activity') AND e.credited=0) THEN 0
 WHEN (SELECT count(DISTINCT e.source_id) FROM crew_growth_events e WHERE e.id!=NEW.id AND e.user_id=NEW.user_id AND e.kind IN ('work','activity') AND e.credited=1
 AND e.created>=CAST((NEW.created+32400)/86400 AS INTEGER)*86400-32400
 AND e.created<CAST((NEW.created+32400)/86400 AS INTEGER)*86400+54000)>=5 THEN 0 ELSE 1 END
 WHERE id=NEW.id;
END;
