CREATE TABLE IF NOT EXISTS `nickname_changes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_profile_ids` (
	`user_id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	CONSTRAINT "public_profile_ids_format" CHECK(length("public_profile_ids"."code")=7 AND "public_profile_ids"."code" GLOB '[A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `public_profile_ids_code` ON `public_profile_ids` (`code`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS users_public_profile_id AFTER INSERT ON users BEGIN
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id);
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.id) THEN RAISE(ABORT,'public_id_allocation_exhausted') END;
END;
--> statement-breakpoint
-- Backfill through a short-lived queue so collisions retry per user, without updating users.
CREATE TABLE IF NOT EXISTS public_profile_id_backfill(user_id TEXT PRIMARY KEY);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS public_profile_id_backfill_allocate AFTER INSERT ON public_profile_id_backfill BEGIN
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 INSERT OR IGNORE INTO public_profile_ids(user_id,code) SELECT NEW.user_id,char(65+abs(random()%26))||char(65+abs(random()%26))||char(65+abs(random()%26))||printf('%04d',abs(random()%10000)) WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id);
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public_profile_ids WHERE user_id=NEW.user_id) THEN RAISE(ABORT,'public_id_allocation_exhausted') END;
END;
--> statement-breakpoint
INSERT OR IGNORE INTO public_profile_id_backfill(user_id) SELECT id FROM users WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids m WHERE m.user_id=users.id) ORDER BY created,id;
--> statement-breakpoint
DROP TABLE IF EXISTS public_profile_id_backfill;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS public_profile_ids_immutable BEFORE UPDATE ON public_profile_ids BEGIN SELECT RAISE(ABORT,'Public profile identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS public_profile_ids_reserved BEFORE DELETE ON public_profile_ids BEGIN SELECT RAISE(ABORT,'Public profile identity remains reserved'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS nickname_changes_cooldown BEFORE UPDATE ON nickname_changes WHEN NEW.changed_at < OLD.changed_at+2592000 BEGIN SELECT RAISE(ABORT,'nickname_cooldown'); END;
