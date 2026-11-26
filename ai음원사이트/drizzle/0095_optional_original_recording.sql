ALTER TABLE `dubbing_casting_drafts` ADD `base_recording_id` text;
--> statement-breakpoint
-- Existing new-combination drafts were created with the original take selected.
-- Keep that selection; newly created empty drafts deliberately store NULL.
UPDATE dubbing_casting_drafts SET base_recording_id=(
 SELECT r.id FROM dubbing_recordings r JOIN dubbing_projects p ON p.id=r.project_id
 JOIN dubbing_recording_permissions v ON v.recording_id=r.id
 WHERE r.project_id=dubbing_casting_drafts.root_id AND r.user_id=p.owner_id
 AND r.state='submitted' AND v.visibility='public' AND v.license_version='casting-2026-11-01'
 ORDER BY r.created LIMIT 1
) WHERE target_id IS NULL AND committed_id IS NULL;
