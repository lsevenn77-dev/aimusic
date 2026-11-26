-- Preserve the old Worker's table and rows during the rollout.
CREATE TABLE `__new_playlist_title_claims` (
	`key` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_playlist_title_claims`("key") SELECT "key" FROM `playlist_title_claims`;--> statement-breakpoint
DROP TABLE `playlist_title_claims`;--> statement-breakpoint
ALTER TABLE `__new_playlist_title_claims` RENAME TO `playlist_title_claims`;
