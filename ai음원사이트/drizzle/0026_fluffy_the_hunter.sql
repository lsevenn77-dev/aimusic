CREATE TABLE `account_handles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`normalized` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_handles_normalized` ON `account_handles` (`normalized`);
--> statement-breakpoint
INSERT OR IGNORE INTO account_handles(user_id,normalized) SELECT u.id,lower(trim(COALESCE((SELECT CASE WHEN identity_profile.id IS NULL THEN NULL WHEN identity_profile.nickname_confirmed=1 OR NOT EXISTS(SELECT 1 FROM users identity_user WHERE identity_user.id=identity_profile.user_id AND identity_user.provider!='email' AND identity_user.name=identity_profile.name) OR EXISTS(SELECT 1 FROM tracks identity_track WHERE identity_track.producer_id=identity_profile.id AND identity_track.kind='original') THEN identity_profile.name ELSE '리스너 '||substr(identity_profile.user_id,1,8) END FROM producers identity_profile WHERE identity_profile.user_id=u.id),CASE WHEN u.provider='email' THEN u.name ELSE '리스너 '||substr(u.id,1,8) END))) FROM users u ORDER BY u.created,u.id;
