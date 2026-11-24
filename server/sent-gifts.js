import * as AifectMessages from '../shared/system-messages.js';
import {rows,json,fail} from './db.js';
import {requireUser} from './auth.js';

// Receipt IDs, not wallet debits or purchase rows: an inventory gift appears once.
export async function sentGifts(req,env,user){
 requireUser(user);
 if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
 const params=new URL(req.url).searchParams,offset=Number(params.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail(400,'내역 위치를 확인해 주세요.');
 const items=await rows(env,`SELECT g.*,COALESCE(s.source_type,CASE WHEN g.track_id IS NOT NULL THEN 'work' ELSE 'profile' END) target_type,
  COALESCE(s.source_id,g.track_id,g.recipient_profile_id) target_id,s.work_kind,
  COALESCE(s.source_title,t.title,p.name,'삭제된 대상') target_name,p.name recipient_name
  FROM (
   SELECT 'gold' currency,id,sender_id,track_id,COALESCE(singer_profile_id,creator_profile_id) recipient_profile_id,gift_name,quantity,gold value,created FROM gifts
   UNION ALL SELECT 'silver',id,sender_id,track_id,recipient_profile_id,gift_name,quantity,silver,created FROM free_gifts
  ) g LEFT JOIN gift_sources s ON s.currency=g.currency AND s.gift_id=g.id
  LEFT JOIN tracks t ON t.id=g.track_id LEFT JOIN producers p ON p.id=COALESCE(g.recipient_profile_id,t.producer_id)
  WHERE g.sender_id=? ORDER BY g.created DESC,g.currency,g.id DESC LIMIT 51 OFFSET ?`,user.id,offset);
 return json({items:items.slice(0,50),offset,next_offset:items.length>50?offset+50:null});
}
