CREATE TABLE `ai_bot_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`bot_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`day` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_activity_job` ON `ai_bot_activities` (`job_id`);--> statement-breakpoint
CREATE INDEX `ai_activity_day` ON `ai_bot_activities` (`day`,`action`);--> statement-breakpoint
CREATE INDEX `ai_activity_bot_day` ON `ai_bot_activities` (`bot_id`,`day`);--> statement-breakpoint
CREATE INDEX `ai_activity_owner_day` ON `ai_bot_activities` (`owner_id`,`day`);--> statement-breakpoint
CREATE INDEX `ai_activity_target` ON `ai_bot_activities` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `ai_bot_assets` (
	`sha` text PRIMARY KEY NOT NULL,
	`bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_bot_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_audit_created` ON `ai_bot_audit` (`created`);--> statement-breakpoint
CREATE TABLE `ai_bot_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`slot` integer DEFAULT 0 NOT NULL,
	`due` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_job_target` ON `ai_bot_jobs` (`target_type`,`target_id`,`action`,`slot`);--> statement-breakpoint
CREATE INDEX `ai_jobs_due` ON `ai_bot_jobs` (`state`,`due`);--> statement-breakpoint
CREATE INDEX `ai_jobs_owner` ON `ai_bot_jobs` (`owner_id`,`created`);--> statement-breakpoint
CREATE TABLE `ai_bot_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_bot_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`style` text DEFAULT 'warm' NOT NULL,
	`body` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_template_body` ON `ai_bot_templates` (`body`);--> statement-breakpoint
CREATE INDEX `ai_template_category` ON `ai_bot_templates` (`category`,`active`,`style`);--> statement-breakpoint
CREATE TABLE `ai_bots` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`image_sha` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`style` text DEFAULT 'warm' NOT NULL,
	`emoji` text DEFAULT '✨' NOT NULL,
	`daily_limit` integer DEFAULT 10 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	CONSTRAINT "ai_bot_daily" CHECK("ai_bots"."daily_limit" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_bots_user` ON `ai_bots` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_bots_source` ON `ai_bots` (`source_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_bots_image` ON `ai_bots` (`image_sha`);--> statement-breakpoint
CREATE INDEX `ai_bots_active` ON `ai_bots` (`active`,`number`);--> statement-breakpoint
CREATE TABLE `ai_support_gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`cash_value` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	CONSTRAINT "ai_gift_zero_value" CHECK("ai_support_gifts"."cash_value"=0),
	CONSTRAINT "ai_gift_quantity" CHECK("ai_support_gifts"."quantity" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_gift_job` ON `ai_support_gifts` (`job_id`);--> statement-breakpoint
CREATE INDEX `ai_gift_target` ON `ai_support_gifts` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `ai_gift_owner` ON `ai_support_gifts` (`owner_id`,`created`);--> statement-breakpoint
ALTER TABLE `users` ADD `account_type` text DEFAULT 'human' NOT NULL;
--> statement-breakpoint
INSERT INTO ai_bot_settings(id,json,updated) VALUES(1,'{"enabled":false,"comments":1,"probability":100,"gifts":true,"giftMin":1,"giftMax":2,"commentMin":300,"commentMax":900,"giftDelayMin":600,"giftDelayMax":1800,"dailyComments":100,"dailyGifts":200,"creatorDaily":2,"humanThreshold":3,"newOnly":false,"newPriority":true,"kinds":["original","solo","duet","dubbing"]}',unixepoch());
INSERT INTO ai_bot_templates(id,category,style,body,updated) VALUES
('seed-first-0-0','first','warm','첫 작품 공개를 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-first-0-1','first','polite','첫 작품 공개를 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-first-0-2','first','cheerful','첫 작품 공개를 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-first-0-3','first','warm','첫 작품 공개를 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-first-1-0','first','polite','첫 창작 활동의 시작을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-first-1-1','first','cheerful','첫 창작 활동의 시작을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-first-1-2','first','warm','첫 창작 활동의 시작을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-first-1-3','first','polite','첫 창작 활동의 시작을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-first-2-0','first','cheerful','첫 작품을 등록해주셔서 반가워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-first-2-1','first','warm','첫 작품을 등록해주셔서 반가워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-first-2-2','first','polite','첫 작품을 등록해주셔서 반가워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-first-2-3','first','cheerful','첫 작품을 등록해주셔서 반가워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-first-3-0','first','warm','AIFECT에서의 첫걸음을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-first-3-1','first','polite','AIFECT에서의 첫걸음을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-first-3-2','first','cheerful','AIFECT에서의 첫걸음을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-first-3-3','first','warm','AIFECT에서의 첫걸음을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-first-4-0','first','polite','첫 공개를 함께 축하할게요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-first-4-1','first','cheerful','첫 공개를 함께 축하할게요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-first-4-2','first','warm','첫 공개를 함께 축하할게요. 새로운 도전을 축하해요!',unixepoch()),
('seed-first-4-3','first','polite','첫 공개를 함께 축하할게요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-original-0-0','original','warm','새 음원 공개를 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-original-0-1','original','polite','새 음원 공개를 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-original-0-2','original','cheerful','새 음원 공개를 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-original-0-3','original','warm','새 음원 공개를 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-original-1-0','original','polite','새로운 음악 소식이 도착했네요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-original-1-1','original','cheerful','새로운 음악 소식이 도착했네요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-original-1-2','original','warm','새로운 음악 소식이 도착했네요. 새로운 도전을 축하해요!',unixepoch()),
('seed-original-1-3','original','polite','새로운 음악 소식이 도착했네요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-original-2-0','original','cheerful','음악을 공개해주셔서 고마워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-original-2-1','original','warm','음악을 공개해주셔서 고마워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-original-2-2','original','polite','음악을 공개해주셔서 고마워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-original-2-3','original','cheerful','음악을 공개해주셔서 고마워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-original-3-0','original','warm','새 작품 등록을 환영해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-original-3-1','original','polite','새 작품 등록을 환영해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-original-3-2','original','cheerful','새 작품 등록을 환영해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-original-3-3','original','warm','새 작품 등록을 환영해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-original-4-0','original','polite','또 하나의 음악 기록을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-original-4-1','original','cheerful','또 하나의 음악 기록을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-original-4-2','original','warm','또 하나의 음악 기록을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-original-4-3','original','polite','또 하나의 음악 기록을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-solo-0-0','solo','warm','새 솔로 커버 등록을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-solo-0-1','solo','polite','새 솔로 커버 등록을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-solo-0-2','solo','cheerful','새 솔로 커버 등록을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-solo-0-3','solo','warm','새 솔로 커버 등록을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-solo-1-0','solo','polite','새로운 커버 소식이 반가워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-solo-1-1','solo','cheerful','새로운 커버 소식이 반가워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-solo-1-2','solo','warm','새로운 커버 소식이 반가워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-solo-1-3','solo','polite','새로운 커버 소식이 반가워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-solo-2-0','solo','cheerful','솔로 커버 활동을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-solo-2-1','solo','warm','솔로 커버 활동을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-solo-2-2','solo','polite','솔로 커버 활동을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-solo-2-3','solo','cheerful','솔로 커버 활동을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-solo-3-0','solo','warm','커버를 공개해주셔서 고마워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-solo-3-1','solo','polite','커버를 공개해주셔서 고마워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-solo-3-2','solo','cheerful','커버를 공개해주셔서 고마워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-solo-3-3','solo','warm','커버를 공개해주셔서 고마워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-solo-4-0','solo','polite','나만의 커버 기록을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-solo-4-1','solo','cheerful','나만의 커버 기록을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-solo-4-2','solo','warm','나만의 커버 기록을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-solo-4-3','solo','polite','나만의 커버 기록을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-duet-0-0','duet','warm','듀엣 완성을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-duet-0-1','duet','polite','듀엣 완성을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-duet-0-2','duet','cheerful','듀엣 완성을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-duet-0-3','duet','warm','듀엣 완성을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-duet-1-0','duet','polite','함께 만든 듀엣의 공개를 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-duet-1-1','duet','cheerful','함께 만든 듀엣의 공개를 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-duet-1-2','duet','warm','함께 만든 듀엣의 공개를 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-duet-1-3','duet','polite','함께 만든 듀엣의 공개를 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-duet-2-0','duet','cheerful','두 사람의 창작 활동을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-duet-2-1','duet','warm','두 사람의 창작 활동을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-duet-2-2','duet','polite','두 사람의 창작 활동을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-duet-2-3','duet','cheerful','두 사람의 창작 활동을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-duet-3-0','duet','warm','새 듀엣 소식이 반가워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-duet-3-1','duet','polite','새 듀엣 소식이 반가워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-duet-3-2','duet','cheerful','새 듀엣 소식이 반가워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-duet-3-3','duet','warm','새 듀엣 소식이 반가워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-duet-4-0','duet','polite','함께 완성한 작품 등록을 환영해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-duet-4-1','duet','cheerful','함께 완성한 작품 등록을 환영해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-duet-4-2','duet','warm','함께 완성한 작품 등록을 환영해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-duet-4-3','duet','polite','함께 완성한 작품 등록을 환영해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-dubbing-0-0','dubbing','warm','더빙 완성을 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-dubbing-0-1','dubbing','polite','더빙 완성을 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-dubbing-0-2','dubbing','cheerful','더빙 완성을 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-dubbing-0-3','dubbing','warm','더빙 완성을 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-dubbing-1-0','dubbing','polite','새 더빙 공개를 축하해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-dubbing-1-1','dubbing','cheerful','새 더빙 공개를 축하해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-dubbing-1-2','dubbing','warm','새 더빙 공개를 축하해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-dubbing-1-3','dubbing','polite','새 더빙 공개를 축하해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-dubbing-2-0','dubbing','cheerful','함께한 더빙 작업을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-dubbing-2-1','dubbing','warm','함께한 더빙 작업을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-dubbing-2-2','dubbing','polite','함께한 더빙 작업을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-dubbing-2-3','dubbing','cheerful','함께한 더빙 작업을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-dubbing-3-0','dubbing','warm','더빙 작품 등록이 반가워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-dubbing-3-1','dubbing','polite','더빙 작품 등록이 반가워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-dubbing-3-2','dubbing','cheerful','더빙 작품 등록이 반가워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-dubbing-3-3','dubbing','warm','더빙 작품 등록이 반가워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-dubbing-4-0','dubbing','polite','새로운 이야기의 공개를 환영해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-dubbing-4-1','dubbing','cheerful','새로운 이야기의 공개를 환영해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-dubbing-4-2','dubbing','warm','새로운 이야기의 공개를 환영해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-dubbing-4-3','dubbing','polite','새로운 이야기의 공개를 환영해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-general-0-0','general','warm','오늘의 창작 활동을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-general-0-1','general','polite','오늘의 창작 활동을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-general-0-2','general','cheerful','오늘의 창작 활동을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-general-0-3','general','warm','오늘의 창작 활동을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-general-1-0','general','polite','새 작품 소식을 반갑게 맞이해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-general-1-1','general','cheerful','새 작품 소식을 반갑게 맞이해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-general-1-2','general','warm','새 작품 소식을 반갑게 맞이해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-general-1-3','general','polite','새 작품 소식을 반갑게 맞이해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-general-2-0','general','cheerful','창작의 기록을 남겨주셔서 고마워요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-general-2-1','general','warm','창작의 기록을 남겨주셔서 고마워요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-general-2-2','general','polite','창작의 기록을 남겨주셔서 고마워요. 새로운 도전을 축하해요!',unixepoch()),
('seed-general-2-3','general','cheerful','창작의 기록을 남겨주셔서 고마워요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-general-3-0','general','warm','앞으로의 활동도 응원할게요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-general-3-1','general','polite','앞으로의 활동도 응원할게요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-general-3-2','general','cheerful','앞으로의 활동도 응원할게요. 새로운 도전을 축하해요!',unixepoch()),
('seed-general-3-3','general','warm','앞으로의 활동도 응원할게요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch()),
('seed-general-4-0','general','polite','꾸준한 창작의 즐거움을 응원해요. 다음 창작도 즐겁게 이어가세요!',unixepoch()),
('seed-general-4-1','general','cheerful','꾸준한 창작의 즐거움을 응원해요. 창작하는 하루를 응원할게요!',unixepoch()),
('seed-general-4-2','general','warm','꾸준한 창작의 즐거움을 응원해요. 새로운 도전을 축하해요!',unixepoch()),
('seed-general-4-3','general','polite','꾸준한 창작의 즐거움을 응원해요. AIFECT 공식 응원단이 마음을 전해요!',unixepoch());
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_track_insert AFTER INSERT ON tracks
WHEN NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0) AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:track:'||NEW.id||':'||action||':'||slot,'track',NEW.id,NEW.user_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.user_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.user_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||(CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) ELSE (CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END);
END;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_track_update AFTER UPDATE ON tracks
WHEN NEW.status='published' AND (NEW.kind='original' OR NEW.duet_open=0) AND (OLD.status!='published' OR OLD.duet_open!=0) AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:track:'||NEW.id||':'||action||':'||slot,'track',NEW.id,NEW.user_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.user_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.user_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||(CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) ELSE (CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END) END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value=CASE WHEN NEW.kind='original' THEN 'original' WHEN NEW.cover_mode='duet' THEN 'duet' ELSE 'solo' END);
END;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_dubbing_insert AFTER INSERT ON dubbing_projects
WHEN NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0 AND EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:dubbing:'||NEW.id||':'||action||':'||slot,'dubbing',NEW.id,NEW.owner_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.owner_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.owner_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||('dubbing') ELSE ('dubbing') END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value='dubbing');
END;
--> statement-breakpoint
CREATE TRIGGER ai_enqueue_dubbing_update AFTER UPDATE ON dubbing_projects
WHEN NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0 AND (OLD.state!='complete' OR OLD.visibility!='public') AND EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') AND EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND json_extract(json,'$.enabled')=1)
BEGIN
 INSERT OR IGNORE INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated)
 SELECT 'ai:dubbing:'||NEW.id||':'||action||':'||slot,'dubbing',NEW.id,NEW.owner_id,CASE WHEN (SELECT count(*) FROM tracks WHERE user_id=NEW.owner_id AND (status='published' OR first_published_at>0))+(SELECT count(*) FROM dubbing_projects WHERE owner_id=NEW.owner_id AND state='complete' AND visibility='public')<=1 THEN 'first:'||('dubbing') ELSE ('dubbing') END,action,slot,
 unixepoch()+CASE action WHEN 'comment' THEN json_extract(s.json,'$.commentMin')+abs(random()%max(1,json_extract(s.json,'$.commentMax')-json_extract(s.json,'$.commentMin')+1)) ELSE json_extract(s.json,'$.giftDelayMin')+abs(random()%max(1,json_extract(s.json,'$.giftDelayMax')-json_extract(s.json,'$.giftDelayMin')+1)) END,'pending',unixepoch(),unixepoch()
 FROM ai_bot_settings s CROSS JOIN (SELECT 'comment' action,0 slot UNION ALL SELECT 'comment',1 UNION ALL SELECT 'gift',0) options
 WHERE s.id=1 AND ((action='comment' AND slot<json_extract(s.json,'$.comments')) OR (action='gift' AND json_extract(s.json,'$.gifts')=1))
 AND EXISTS(SELECT 1 FROM json_each(s.json,'$.kinds') WHERE value='dubbing');
END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_sessions BEFORE INSERT ON sessions WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_listens BEFORE INSERT ON listens WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_likes BEFORE INSERT ON likes WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_follows BEFORE INSERT ON follows WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_gold_purchases BEFORE INSERT ON gold_purchases WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_gifts BEFORE INSERT ON gifts WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.sender_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_free_gifts BEFORE INSERT ON free_gifts WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.sender_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_free_gift_wallets BEFORE INSERT ON free_gift_wallets WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_gift_inventory BEFORE INSERT ON gift_inventory WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_tracks BEFORE INSERT ON tracks WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_dubbing_projects BEFORE INSERT ON dubbing_projects WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_crew_members BEFORE INSERT ON crew_members WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_payout_accounts BEFORE INSERT ON payout_accounts WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot perform member activity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_identity_credentials BEFORE INSERT ON users WHEN NEW.account_type NOT IN ('human','ai_bot') OR (NEW.account_type='ai_bot' AND (NEW.password IS NOT NULL OR NEW.subject IS NOT NULL OR NEW.provider!='ai_service' OR NEW.id NOT GLOB 'ai_[0-9]*')) BEGIN SELECT RAISE(ABORT,'Invalid service identity'); END;
--> statement-breakpoint
CREATE TRIGGER ai_identity_immutable BEFORE UPDATE OF account_type,password,provider,subject ON users WHEN NEW.account_type!=OLD.account_type OR (OLD.account_type='ai_bot' AND (NEW.password IS NOT NULL OR NEW.subject IS NOT NULL OR NEW.provider!='ai_service')) BEGIN SELECT RAISE(ABORT,'Service identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ai_deny_xp BEFORE INSERT ON player_xp WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_type='ai_bot') BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
CREATE TRIGGER ai_support_identity_guard BEFORE INSERT ON ai_support_gifts WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.sender_id AND account_type='ai_bot') OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND account_type='human') OR NEW.sender_id=NEW.owner_id BEGIN SELECT RAISE(ABORT,'Official support requires AI sender and human recipient'); END;
--> statement-breakpoint
CREATE TRIGGER ai_no_paid_recipient BEFORE INSERT ON gifts WHEN EXISTS(SELECT 1 FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id IN (NEW.creator_profile_id,NEW.singer_profile_id) AND u.account_type='ai_bot') BEGIN SELECT RAISE(ABORT,'AI service account cannot receive paid gifts'); END;
