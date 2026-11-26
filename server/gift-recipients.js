import { rows } from './db.js';
import { producerNameSQL } from './identity.js';

export function giftRecipientRecommendations(env, sender) {
  return rows(env, `WITH gift_events AS (
    SELECT p.user_id, g.request_id, g.id, g.created, 'gold' ledger
    FROM gifts g JOIN producers p ON p.id=COALESCE(g.singer_profile_id,g.creator_profile_id)
    WHERE g.sender_id=?1
    UNION ALL
    SELECT p.user_id, g.request_id, g.id, g.created, 'silver'
    FROM free_gifts g LEFT JOIN tracks t ON t.id=g.track_id
    JOIN producers p ON p.id=COALESCE(g.recipient_profile_id,t.producer_id)
    WHERE g.sender_id=?1
    UNION ALL
    SELECT recipient_id, request_id, id, created, 'decoration'
    FROM decoration_transfers WHERE sender_id=?1
  ), gift_history AS (
    -- Bulk inventory transfers suffix their per-unit receipt keys with ":N".
    SELECT user_id, max(created) last_gift, count(DISTINCT CASE
      WHEN request_id IS NULL THEN ledger||':'||id
      WHEN instr(request_id,':')>0 THEN substr(request_id,1,instr(request_id,':')-1)
      ELSE request_id END) sends
    FROM gift_events GROUP BY user_id
  ), follow_history AS (
    SELECT CASE WHEN f.kind='member' THEN f.target_id ELSE p.user_id END user_id,
      max(f.created) last_follow
    FROM follows f LEFT JOIN producers p ON f.kind='producer' AND p.id=f.target_id
    WHERE f.user_id=?1 AND f.kind IN ('producer','member') GROUP BY 1
  ), messages AS (
    SELECT recipient_id user_id, rowid sequence, created FROM direct_messages WHERE sender_id=?1
    UNION ALL
    SELECT sender_id, rowid, created FROM direct_messages WHERE recipient_id=?1
  ), conversation_history AS (
    SELECT d.user_id, max(d.created) last_message FROM messages d
    LEFT JOIN dm_settings s ON s.user_id=?1 AND s.peer_id=d.user_id
    WHERE d.sequence>COALESCE(s.cleared_sequence,0) GROUP BY d.user_id
  ), contacts AS (
    SELECT user_id FROM gift_history
    UNION SELECT user_id FROM follow_history
    UNION SELECT user_id FROM conversation_history
  ), ranked AS (
    SELECT p.id, ${producerNameSQL()} name, p.image_version, m.number public_number,
      ids.code public_id, COALESCE(g.sends,0) sends,
      CASE WHEN g.sends>1 THEN 0 WHEN f.last_follow IS NOT NULL THEN 1
        WHEN g.last_gift IS NOT NULL THEN 2 ELSE 3 END priority,
      CASE WHEN g.sends>1 THEN g.last_gift ELSE COALESCE(f.last_follow,g.last_gift,d.last_message) END recent
    FROM contacts c JOIN users u ON u.id=c.user_id JOIN producers p ON p.user_id=u.id
    LEFT JOIN gift_history g ON g.user_id=u.id
    LEFT JOIN follow_history f ON f.user_id=u.id
    LEFT JOIN conversation_history d ON d.user_id=u.id
    LEFT JOIN public_member_ids m ON m.user_id=u.id
    LEFT JOIN public_profile_ids ids ON ids.user_id=u.id
    WHERE u.id<>?1 AND u.provider<>'deleted' AND u.account_type='human'
      AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=?1 AND b.blocked_id=u.id)
        OR (b.user_id=u.id AND b.blocked_id=?1))
  )
  SELECT id,name,image_version,public_number,public_id FROM ranked
  ORDER BY priority, CASE WHEN priority=0 THEN sends ELSE 0 END DESC, recent DESC, id
  LIMIT 6`, sender);
}
