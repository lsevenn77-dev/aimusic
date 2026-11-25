import {effectiveUntilSQL} from './premium-event.js';

// Bounded public display permission prevents public profile data from exposing a billing date.
export function appearanceDeadlineSQL(alias) {
 const until = effectiveUntilSQL.replaceAll('u.', alias + '.');
 return `CASE WHEN ${alias}.account_type='human' AND ${alias}.provider!='deleted' AND ${until}>unixepoch()
   THEN MIN(${until},unixepoch()+86400) ELSE 0 END`;
}

// A saved NULL is the member's explicit "no frame" choice. Inventory is never mutated.
export const defaultFrameSQL = uid => `NOT EXISTS(SELECT 1 FROM player_equipment choice WHERE choice.user_id=${uid})`;
export const appearanceColumnsSQL = uid => `COALESCE((SELECT ${appearanceDeadlineSQL('appearance_member')}
 FROM users appearance_member WHERE appearance_member.id=${uid}),0) premium_style_until,
 ${defaultFrameSQL(uid)} premium_default_frame`;
