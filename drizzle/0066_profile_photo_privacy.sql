CREATE TABLE `profile_photo_privacy` (
	`photo_id` text PRIMARY KEY NOT NULL,
	`is_public` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `profile_photos`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "profile_photo_privacy_boolean" CHECK("profile_photo_privacy"."is_public" IN (0,1))
);
