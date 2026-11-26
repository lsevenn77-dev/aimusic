-- The four reviewed public originals and their participations are withdrawn from discovery.
-- Root tombstones are the service's deletion mechanism for an original (including private reads
-- of its descendants). Keep all takes, social history, accounting rows and official audio intact.
WITH candidates(id, owner_id, title) AS (VALUES
 ('7e5fcdff-ab44-4875-9530-616b0ca6b938','73f48adc-663c-4700-b96c-c149c4ef9e12','닫힌 병동의 세 번째 노크'),
 ('e3afdff2-5b5c-4456-9ad5-32075841bf52','d66d4dcd-d7d8-4dd8-9501-d60155f61b17','누구를 부르는 신호'),
 ('00d44caf-d9d6-48b6-bce2-6934e46eaf93','d66d4dcd-d7d8-4dd8-9501-d60155f61b17','불 꺼'),
 ('47bad7d6-14cc-4363-8127-b7ea4e4d4bee','73f48adc-663c-4700-b96c-c149c4ef9e12','먹빛 속의 어명')
)
INSERT INTO admin_audit (id, admin_id, action, target, created)
SELECT 'dubbing-original01-catalog-cleanup:' || p.id, 'migration:official-original01',
 'dubbing-catalog-retire-original', json_object('projectId',p.id,'ownerId',p.owner_id,'title',p.title,
 'visibility',p.visibility,'revision',p.revision,'updated',p.updated,'deletedAt',p.deleted_at), unixepoch()
FROM candidates c JOIN dubbing_projects p ON p.id=c.id AND p.owner_id=c.owner_id AND p.title=c.title
WHERE p.root_id IS NULL AND p.deleted_at=0 AND p.visibility='public'
AND EXISTS (
 SELECT 1 FROM dubbing_projects root JOIN dubbing_projects edition ON edition.root_id=root.id
 JOIN dubbing_final_jobs audio ON audio.project_id=edition.id AND audio.script_key=edition.script_key
 WHERE root.id='512fb824-036c-452a-b603-c883b0619a29'
  AND edition.id='b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899'
  AND root.owner_id='de9247b5-de49-458b-b048-da61f9b5f75b' AND edition.owner_id=root.owner_id
  AND root.deleted_at=0 AND edition.deleted_at=0 AND root.visibility='public' AND edition.visibility='public'
  AND edition.state='complete' AND audio.state='ready' AND COALESCE(audio.output_key,'')!=''
)
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
UPDATE dubbing_projects AS p
SET deleted_at=a.created, visibility='private', revision=p.revision+1, updated=a.created
FROM admin_audit a
WHERE a.id='dubbing-original01-catalog-cleanup:' || p.id AND a.action='dubbing-catalog-retire-original'
 AND a.admin_id='migration:official-original01' AND p.root_id IS NULL AND p.deleted_at=0
 AND p.visibility=json_extract(a.target,'$.visibility') AND p.revision=json_extract(a.target,'$.revision')
 AND p.owner_id=json_extract(a.target,'$.ownerId') AND p.title=json_extract(a.target,'$.title');
