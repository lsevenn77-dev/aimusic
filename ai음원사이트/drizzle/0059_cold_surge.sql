CREATE TABLE `dubbing_provider_usage` (
	`job_id` text NOT NULL,
	`cue_id` text NOT NULL,
	`provider_id` text,
	`state` text NOT NULL,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`billing_json` text DEFAULT '{}' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`job_id`, `cue_id`)
);
--> statement-breakpoint
CREATE INDEX `dubbing_provider_usage_time` ON `dubbing_provider_usage` (`created`);
--> statement-breakpoint
INSERT INTO dubbing_provider_usage(job_id,cue_id,provider_id,state,usage_json,billing_json,created,updated)
SELECT a.job_id,a.cue_id,a.provider_id,a.state,a.usage_json,a.billing_json,j.created,a.updated
FROM dubbing_sound_assets a JOIN dubbing_sound_jobs j ON j.id=a.job_id WHERE a.state!='pending';
