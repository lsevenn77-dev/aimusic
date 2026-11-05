import {CREW_ROLES} from '../shared/crews.js';

// Some older system notices stored the qualified name inside their text. Ordinary
// chat, invitations and user-entered parentheses must be returned verbatim.
export function legacyCrewNoticeDisplaySQL(m) {
 const leave='님이 크루에서 나갔습니다.', kick='님이 크루에서 내보내졌습니다.';
 const role=Object.values(CREW_ROLES).map(r=>'님의 직책이 '+r+'(으)로 변경되었습니다.');
 const tails=[leave,kick,...role].map(s=>"'"+s+"'").join(',');
 const body=m+'.body', uid=m+'.user_id';
 // For moderation notices the sender is the operator, not the named member.
 // Verify the subject ID and the full stored name before removing any characters.
 return `CASE WHEN ${m}.kind='system' AND (${body} LIKE '%)님이 크루에서 %' OR ${body} LIKE '%)님의 직책이 %') THEN (
   SELECT p.name || substr(${body},length(p.name)+length(c.name)+3)
   FROM crews c JOIN producers p
   WHERE c.id=${m}.crew_id AND p.user_id IN (
     SELECT ${uid} WHERE ${body} LIKE '%)님이 크루에서 나갔습니다.'
     UNION ALL SELECT CASE WHEN a.action='role_changed' THEN substr(a.detail,1,instr(a.detail,':')-1) ELSE a.detail END
       FROM crew_audit a WHERE a.crew_id=c.id AND a.actor_id=${uid} AND a.created=${m}.created
       AND ((a.action='member_removed' AND ${body} LIKE '%)님이 크루에서 내보내졌습니다.')
         OR (a.action='role_changed' AND ${body} LIKE '%)님의 직책이 %')))
   AND substr(${body},1,length(p.name)+length(c.name)+2)=p.name||'('||c.name||')'
   AND substr(${body},length(p.name)+length(c.name)+3) IN (${tails})
   LIMIT 1) END`;
}
