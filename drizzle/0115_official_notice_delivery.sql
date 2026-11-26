CREATE TABLE `notice_delivery_items` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`sent_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `notice_delivery_jobs`(`campaign_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notice_delivery_item_state_valid" CHECK("notice_delivery_items"."state" IN ('pending','sent','failed'))
);
--> statement-breakpoint
CREATE INDEX `notice_delivery_item_state` ON `notice_delivery_items` (`campaign_id`,`state`,`user_id`);--> statement-breakpoint
CREATE TABLE `notice_delivery_jobs` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`check_id` text NOT NULL,
	`requested` integer NOT NULL,
	`push` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`finished_at` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `welcome_campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notice_delivery_check` ON `notice_delivery_jobs` (`check_id`);--> statement-breakpoint
CREATE INDEX `notice_delivery_pending` ON `notice_delivery_jobs` (`finished_at`,`created`);--> statement-breakpoint
CREATE TABLE `notice_signup_deliveries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`created` integer NOT NULL,
	`state` text NOT NULL,
	`reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notice_signup_delivery_state_valid" CHECK("notice_signup_deliveries"."state" IN ('pending','sent','failed','disabled','already_delivered'))
);
--> statement-breakpoint
CREATE INDEX `notice_signup_delivery_state` ON `notice_signup_deliveries` (`state`,`updated`);--> statement-breakpoint
CREATE INDEX `notice_signup_delivery_campaign` ON `notice_signup_deliveries` (`campaign_id`,`state`);--> statement-breakpoint
CREATE TABLE `notice_test_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
-- The account and its chosen welcome template are committed together for all signup paths.
CREATE TRIGGER notice_signup_queue AFTER INSERT ON users
WHEN NEW.account_type='human' AND NEW.provider<>'deleted'
BEGIN
 INSERT INTO notice_signup_deliveries(user_id,campaign_id,created,state,updated)
 SELECT NEW.id,COALESCE(s.campaign_id,'welcome-guide-20261108-v1'),NEW.created,
  CASE WHEN s.enabled=0 THEN 'disabled' ELSE 'pending' END,unixepoch()
 FROM (SELECT 1) seed LEFT JOIN notice_welcome_settings s ON s.id='signup'
 ON CONFLICT(user_id) DO NOTHING;
END;
--> statement-breakpoint
INSERT INTO notice_test_settings(id,public_id,updated_by,updated)
SELECT 'default',m.code,'system:notice',unixepoch()
FROM public_profile_ids m JOIN users u ON u.id=m.user_id
WHERE m.code='RGT4228' AND u.account_type='human' AND u.provider<>'deleted'
ON CONFLICT(id) DO NOTHING;
