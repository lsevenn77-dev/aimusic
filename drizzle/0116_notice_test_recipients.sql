CREATE TABLE `notice_test_recipients` (
	`public_id` text PRIMARY KEY NOT NULL,
	`selected` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`public_id`) REFERENCES `public_profile_ids`(`code`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notice_test_recipient_selected" CHECK("notice_test_recipients"."selected" IN (0,1))
);
--> statement-breakpoint
-- Preserve the operator's current selection and register the original default when eligible.
WITH eligible_codes AS (
 SELECT m.code FROM public_profile_ids m JOIN users u ON u.id=m.user_id
 WHERE m.code IN ('RGT4228',(SELECT public_id FROM notice_test_settings WHERE id='default'))
 AND u.account_type='human' AND u.provider<>'deleted'
), previous AS (
 SELECT s.public_id,s.updated_by,s.updated FROM notice_test_settings s JOIN eligible_codes e ON e.code=s.public_id
 WHERE s.id='default'
)
INSERT INTO notice_test_recipients(public_id,selected,updated_by,updated)
SELECT e.code,e.code=COALESCE((SELECT public_id FROM previous),'RGT4228'),
 COALESCE(p.updated_by,'system:notice'),COALESCE(p.updated,unixepoch())
FROM eligible_codes e LEFT JOIN previous p ON p.public_id=e.code;
