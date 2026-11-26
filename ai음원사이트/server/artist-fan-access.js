import {one} from './db.js';
// Only the owning creator can approve/revoke a fanpage operator.
export async function canManageArtist(env,aid,user){
 if(!user)return false;
 return !!await one(env,'SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=? AND (p.user_id=? OR EXISTS(SELECT 1 FROM artist_fan_operators o WHERE o.artist_id=a.id AND o.user_id=?))',aid,user.id,user.id);
}
