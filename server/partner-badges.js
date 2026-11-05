import {rows} from './db.js';
import {PARTNER_MIN_KRW} from '../shared/gifts.js';

// Public discovery needs only the badge, not a wallet/settlement read per creator.
// Keep the earned/special and legacy-payout rules identical to partnerState.
export async function partnerBadgeUsers(env,userIds){
 const ids=[...new Set(userIds)];
 if(!ids.length)return new Set();
 const partners=await rows(env,`SELECT p.user_id FROM creator_partners p
 WHERE p.user_id IN (${ids.map(()=>'?').join(',')}) AND p.active!=0
 AND (p.basis='special' OR MAX(0,
  COALESCE((SELECT sum(d.eligible_mw) FROM diamond_ledger d WHERE d.user_id=p.user_id),0)
  +1000*COALESCE((SELECT sum(s.gross_krw) FROM payout_statements s WHERE s.user_id=p.user_id
   AND NOT EXISTS(SELECT 1 FROM diamond_ledger d WHERE d.id=s.id AND d.kind='payout')),0))>=${PARTNER_MIN_KRW*1000})`,...ids);
 return new Set(partners.map(p=>p.user_id));
}
