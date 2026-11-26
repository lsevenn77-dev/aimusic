import {effectiveUntilSQL} from './premium-event.js';

export const premiumFrameId = uid => 'premium-frame:'+uid;
export const memberFrameUntilSQL = alias => `CASE WHEN ${alias}.account_type='human' AND ${alias}.provider!='deleted'
 THEN ${effectiveUntilSQL.replaceAll('u.',alias+'.')} ELSE 0 END`;

// An explicit Premium selection overlays the saved regular frame until membership ends.
export const premiumFrameOverrideSQL = uid => `EXISTS(SELECT 1 FROM player_inventory chosen
 JOIN users holder ON holder.id=chosen.user_id WHERE chosen.id='premium-frame:'||${uid}
 AND chosen.user_id=${uid} AND chosen.source='premium' AND chosen.revoked=0
 AND ${memberFrameUntilSQL('holder')}>unixepoch())`;

// Bounded public display permission prevents public profile data from exposing a billing date.
export function appearanceDeadlineSQL(alias) {
 const until = effectiveUntilSQL.replaceAll('u.', alias + '.');
 return `CASE WHEN ${alias}.account_type='human' AND ${alias}.provider!='deleted' AND ${until}>unixepoch()
   THEN MIN(${until},unixepoch()+86400) ELSE 0 END`;
}

// A saved NULL keeps the frame off unless the member explicitly selects Premium.
export const defaultFrameSQL = uid => `(NOT EXISTS(SELECT 1 FROM player_equipment choice WHERE choice.user_id=${uid}) OR ${premiumFrameOverrideSQL(uid)})`;
export const appearanceColumnsSQL = uid => `COALESCE((SELECT ${appearanceDeadlineSQL('appearance_member')}
 FROM users appearance_member WHERE appearance_member.id=${uid}),0) premium_style_until,
 ${defaultFrameSQL(uid)} premium_default_frame`;
