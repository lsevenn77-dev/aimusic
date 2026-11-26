CREATE TABLE IF NOT EXISTS `public_member_ids` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT "public_member_ids_positive" CHECK("public_member_ids"."number">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `public_member_ids_user` ON `public_member_ids` (`user_id`);
--> statement-breakpoint
-- Preserve already issued numbers. SQLite serializes writes and AUTOINCREMENT
-- reserves numbers beyond the high-water mark, even after account deletion.
INSERT OR IGNORE INTO public_member_ids(user_id)
 SELECT id FROM users WHERE NOT EXISTS (SELECT 1 FROM public_member_ids m WHERE m.user_id=users.id)
 ORDER BY created,id;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS users_public_number AFTER INSERT ON users BEGIN
 INSERT INTO public_member_ids(user_id) VALUES(NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS public_member_ids_immutable BEFORE UPDATE ON public_member_ids BEGIN
 SELECT RAISE(ABORT,'Public member identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS public_member_ids_reserved BEFORE DELETE ON public_member_ids BEGIN
 SELECT RAISE(ABORT,'Public member numbers remain reserved');
END;
