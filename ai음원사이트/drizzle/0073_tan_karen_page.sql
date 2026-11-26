CREATE TABLE `ai_support_follows` (
	`bot_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`bot_id`, `owner_id`)
);
--> statement-breakpoint
CREATE INDEX `ai_follow_owner` ON `ai_support_follows` (`owner_id`,`created`);
--> statement-breakpoint
CREATE TRIGGER ai_support_follow_valid BEFORE INSERT ON ai_support_follows BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_bots b JOIN users u ON u.id=b.user_id WHERE b.user_id=NEW.bot_id AND u.account_type='ai_bot' AND u.provider='ai_service') THEN RAISE(ABORT,'Official AI account required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.owner_id AND u.account_type='human' AND u.provider!='deleted') THEN RAISE(ABORT,'Human creator required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_bot_activities a JOIN ai_bot_jobs j ON j.id=a.job_id WHERE a.id=NEW.activity_id AND a.bot_id=NEW.bot_id AND a.owner_id=NEW.owner_id AND j.state='done') THEN RAISE(ABORT,'Successful support activity required') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_support_follow_audit AFTER INSERT ON ai_support_follows BEGIN
 INSERT INTO ai_bot_audit(id,actor,action,details,created) VALUES('follow:'||NEW.bot_id||':'||NEW.owner_id,NEW.bot_id,'follow',json_object('owner_id',NEW.owner_id,'activity_id',NEW.activity_id,'official_ai',1),NEW.created);
END;
--> statement-breakpoint
-- Existing successful support recipients only; no new comments/gifts or human follows.
INSERT OR IGNORE INTO ai_support_follows(bot_id,owner_id,activity_id,created)
SELECT a.bot_id,a.owner_id,a.id,a.created FROM ai_bot_activities a
JOIN ai_bot_jobs j ON j.id=a.job_id JOIN ai_bots b ON b.user_id=a.bot_id
JOIN users u ON u.id=a.owner_id JOIN users bot ON bot.id=a.bot_id
WHERE j.state='done' AND u.account_type='human' AND u.provider!='deleted' AND bot.account_type='ai_bot' AND bot.provider='ai_service'
AND NOT EXISTS(SELECT 1 FROM user_blocks x WHERE (x.user_id=a.bot_id AND x.blocked_id=a.owner_id) OR (x.user_id=a.owner_id AND x.blocked_id=a.bot_id))
ORDER BY a.created,a.id;
