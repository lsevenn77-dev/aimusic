CREATE TABLE `crew_participation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`crew_id` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`track_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crew_requests_recipient` ON `crew_participation_requests` (`recipient`,`created`);--> statement-breakpoint
CREATE TABLE `notification_digests` (
	`recipient` text NOT NULL,
	`day` text NOT NULL,
	`cutoff` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`recipient`, `day`),
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activity_notifications` ADD `target_kind` text DEFAULT 'song' NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_notifications` ADD `entity_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_notifications` ADD `artist_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_notifications` ADD `detail` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `artist_fan_posts` ADD `reply_to_id` text;--> statement-breakpoint
ALTER TABLE `dubbing_projects` ADD `last_submitted_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_outbox` ADD `delivered_devices` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `fan_comment` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `participation` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `artist_follower` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `artist_release` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `crew_important` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_preferences` ADD `work_status` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- No historical replay: only committed events after this migration notify.
CREATE TRIGGER activity_recipient_guard BEFORE INSERT ON activity_notifications WHEN
 NEW.recipient=NEW.actor_id OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.recipient AND provider!='deleted')
 OR (NEW.actor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND provider!='deleted'))
 OR EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=NEW.recipient AND blocked_id=NEW.actor_id) OR (user_id=NEW.actor_id AND blocked_id=NEW.recipient))
 BEGIN SELECT RAISE(IGNORE); END;

--> statement-breakpoint
CREATE TRIGGER activity_fan_post AFTER INSERT ON artist_fan_posts WHEN NEW.kind='lounge' AND NEW.deleted=0 BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,entity_id,artist_id,source_title,created)
 SELECT 'fan:'||NEW.id||':'||f.user_id,f.user_id,NEW.user_id,'fan_comment',NEW.id,'fan',NEW.parent_id,NEW.artist_id,a.name,NEW.created
 FROM artist_fan_posts f JOIN artists a ON a.id=NEW.artist_id WHERE f.id IN (NEW.parent_id,NEW.reply_to_id) AND f.deleted=0;
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,entity_id,artist_id,source_title,created)
 SELECT 'fan-post:'||NEW.id||':'||p.user_id,p.user_id,NEW.user_id,'fan_post',NEW.id,'fan',NEW.id,NEW.artist_id,a.name,NEW.created
 FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=NEW.artist_id AND NEW.parent_id IS NULL;
END;

--> statement-breakpoint
CREATE TRIGGER activity_artist_follow AFTER INSERT ON follows WHEN NEW.kind='artist' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,artist_id,source_title,created)
 SELECT 'artist-follow:'||a.id||':'||NEW.user_id,p.user_id,NEW.user_id,'artist_follower',a.id,'artist',a.id,a.name,NEW.created
 FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=NEW.target_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_artist_release AFTER UPDATE OF status ON tracks WHEN NEW.status='published' AND OLD.status!='published' AND NEW.kind='original' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,artist_id,source_title,created)
 SELECT 'artist-release:'||NEW.id||':'||f.user_id,f.user_id,NEW.user_id,'artist_release',NEW.id,NEW.artist_id,NEW.title,unixepoch()
 FROM follows f WHERE f.kind='artist' AND f.target_id=NEW.artist_id;
END;

--> statement-breakpoint
-- Replace the legacy participation trigger; keep its stable recipient key.
DROP TRIGGER activity_cover_published;

--> statement-breakpoint
CREATE TRIGGER activity_cover_published AFTER UPDATE OF status ON tracks WHEN NEW.status='published' AND OLD.status!='published' AND NEW.kind='cover' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created)
 SELECT 'participation:'||NEW.id||':'||p.user_id,p.user_id,NEW.user_id,'duet',NEW.id,NEW.title,unixepoch()
 FROM tracks p WHERE p.id=NEW.duet_parent_id AND p.status='published';
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created)
 SELECT 'participation:'||NEW.id||':'||o.user_id,o.user_id,NEW.user_id,'cover',NEW.id,NEW.title,unixepoch()
 FROM tracks o WHERE o.id=NEW.original_id AND o.status='published';
END;

--> statement-breakpoint
CREATE TRIGGER activity_crew_invite AFTER INSERT ON direct_messages WHEN NEW.crew_invite_id IS NOT NULL BEGIN
 DELETE FROM push_outbox WHERE id='dm:'||NEW.id;
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,entity_id,source_title,created)
 SELECT 'crew-invite:'||NEW.id,NEW.recipient_id,NEW.sender_id,'crew_invite',c.id,'crew',NEW.id,c.name,NEW.created FROM crews c WHERE c.id=NEW.crew_invite_id;
END;

--> statement-breakpoint
DROP TRIGGER push_dm;

--> statement-breakpoint
CREATE TRIGGER push_dm AFTER INSERT ON direct_messages WHEN NEW.sender_id<>NEW.recipient_id AND NEW.crew_invite_id IS NULL BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) SELECT 'dm:'||NEW.id,NEW.recipient_id,'dm',p.id,NEW.created FROM producers p WHERE p.user_id=NEW.sender_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_crew_approved AFTER INSERT ON crew_audit WHEN NEW.action='application_approved' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,source_title,created)
 SELECT 'crew-approved:'||NEW.id,NEW.detail,NEW.actor_id,'crew_approved',c.id,'crew',c.name,NEW.created FROM crews c WHERE c.id=NEW.crew_id
 AND EXISTS(SELECT 1 FROM crew_members WHERE crew_id=c.id AND user_id=NEW.detail);
END;

--> statement-breakpoint
CREATE TRIGGER activity_crew_request AFTER INSERT ON crew_participation_requests BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,entity_id,source_title,created)
 SELECT 'crew-request:'||NEW.id,NEW.recipient,NEW.sender,'crew_request',NEW.crew_id,'crew',NEW.id,t.title,NEW.created FROM tracks t WHERE t.id=NEW.track_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_dubbing_complete AFTER UPDATE OF state,visibility ON dubbing_projects
 WHEN NEW.state='complete' AND NEW.visibility='public' AND NEW.deleted_at=0 AND (OLD.state!='complete' OR OLD.visibility!='public') BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,source_title,created)
 SELECT 'dubbing-complete:'||NEW.id||':'||r.user_id,r.user_id,
 NULLIF(NEW.last_submitted_by,''),
 'dubbing_complete',NEW.id,'dubbing',NEW.title,unixepoch() FROM dubbing_recordings r WHERE r.project_id=NEW.id AND r.state='submitted' AND NEW.last_submitted_by!='';
 INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,source_title,created)
 SELECT 'dubbing-complete:'||NEW.id||':'||root.owner_id,root.owner_id,NEW.owner_id,'dubbing_participation',NEW.id,'dubbing',NEW.title,unixepoch()
 FROM dubbing_projects root WHERE root.id=NEW.root_id AND root.deleted_at=0;
END;

--> statement-breakpoint
CREATE TRIGGER activity_track_status AFTER UPDATE OF status ON tracks WHEN NEW.status IN ('failed','rejected','removed') AND OLD.status!=NEW.status BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,kind,target,target_kind,entity_id,source_title,detail,created)
 VALUES('work-status:'||NEW.id||':'||NEW.status,NEW.user_id,'work_status',NEW.id,'work',NEW.status,NEW.title,COALESCE(NEW.error,'공개 처리 결과를 작품 관리에서 확인해주세요.'),unixepoch());
END;

--> statement-breakpoint
CREATE TRIGGER activity_dubbing_restricted AFTER UPDATE OF status ON track_reports WHEN NEW.dubbing_id IS NOT NULL AND NEW.status IN ('removed','upheld') AND OLD.status!=NEW.status BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,kind,target,target_kind,entity_id,source_title,detail,created)
 SELECT 'dubbing-status:'||NEW.id||':'||NEW.status,p.owner_id,'work_status',p.id,'dubbing_manage',NEW.status,p.title,COALESCE(NULLIF(NEW.decision,''),'이용 제한 내용을 확인하고 이의신청할 수 있어요.'),unixepoch() FROM dubbing_projects p WHERE p.id=NEW.dubbing_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_dubbing_final_jobs_failed AFTER UPDATE OF state ON dubbing_final_jobs WHEN NEW.state='failed' AND OLD.state!='failed' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,kind,target,target_kind,entity_id,source_title,detail,created)
 SELECT 'work-failed:dubbing_final_jobs:'||NEW.id,p.owner_id,'work_status',p.id,'dubbing_manage','failed',p.title,NEW.error,unixepoch() FROM dubbing_projects p WHERE p.id=NEW.project_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_dubbing_sound_jobs_failed AFTER UPDATE OF state ON dubbing_sound_jobs WHEN NEW.state='failed' AND OLD.state!='failed' BEGIN
 INSERT OR IGNORE INTO activity_notifications(id,recipient,kind,target,target_kind,entity_id,source_title,detail,created)
 SELECT 'work-failed:dubbing_sound_jobs:'||NEW.id,p.owner_id,'work_status',p.id,'dubbing_manage','failed',p.title,NEW.error,unixepoch() FROM dubbing_projects p WHERE p.id=NEW.project_id;
END;

--> statement-breakpoint
CREATE TRIGGER activity_immediate_push AFTER INSERT ON activity_notifications WHEN NEW.kind IN ('fan_comment','crew_invite','crew_approved','crew_request','dubbing_complete','dubbing_participation','work_status') BEGIN
 INSERT OR IGNORE INTO push_outbox(id,recipient,kind,target,created) VALUES(NEW.id,NEW.recipient,NEW.kind,NEW.target,NEW.created);
END;

--> statement-breakpoint
-- Preserve pre-existing participation mute behaviour when adding its separate switch.
UPDATE push_preferences SET participation=comment;

--> statement-breakpoint
-- Preserve real submit order, including submissions in the same second.
CREATE TRIGGER activity_dubbing_submitter AFTER UPDATE OF state ON dubbing_recordings WHEN NEW.state='submitted' AND OLD.state!='submitted' BEGIN UPDATE dubbing_projects SET last_submitted_by=NEW.user_id WHERE id=NEW.project_id; END;
