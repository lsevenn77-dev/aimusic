import {fail,one} from './db.js';
import {producerNameSQL} from './identity.js';
import {assertUnblocked} from './account-safety.js';
import {assertArtistInteraction} from './follow-management.js';
import {artistGiftSource,giftTargetSource} from './gift-source.js';
import {assertDubbingGiftContext,giftBlockReason} from './gift-eligibility.js';


export function selectedInventoryIds(first,body){
 const ids=body.inventory_ids===undefined?[first]:body.inventory_ids;
 if(!Array.isArray(ids)||ids[0]!==first||ids.some(id=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))||
   new Set(ids).size!==ids.length||(body.quantity!==undefined&&body.quantity!==ids.length)){
  fail(400,'선물할 보유 아이템과 수량을 다시 선택해 주세요.');
 }
 return ids;
}

// The first unit retains the existing, externally supplied request ID. The colon
// is reserved for its siblings and cannot occur in client-provided request IDs.
export function unitRequestKey(key,index){return index===0?key:key+':'+index;}

// Recheck the recipient inside the write transaction in case a block or account
// deletion commits between the read and the debit. A failed guard rolls back.
export const recipientAllowedSQL=`EXISTS(SELECT 1 FROM users receiver WHERE receiver.id=?
 AND receiver.provider!='deleted' AND receiver.account_type='human'
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
 (b.user_id=? AND b.blocked_id=receiver.id) OR (b.blocked_id=? AND b.user_id=receiver.id)))`;

export async function inventoryTarget(env,user,b){
 if(typeof b.profile_id!=='string')fail(400,'받는 회원을 확인해 주세요.');
 const p=await one(env,`SELECT p.id,p.user_id,${producerNameSQL()} name FROM producers p JOIN users u ON u.id=p.user_id
  WHERE p.id=? AND u.provider!='deleted' AND u.account_type='human'`,b.profile_id);
 if(!p||p.user_id===user.id)fail(400,'선물할 다른 회원을 선택해 주세요.');
 assertUnblocked(env,p.user_id);
 if(await one(env,'SELECT 1 FROM user_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)',user.id,p.user_id,p.user_id,user.id))fail(403,'차단한 관계의 회원에게 선물할 수 없습니다.');
 if([b.artist_id,b.track_id,b.dubbing_id].filter(x=>x!=null).length>1)fail(400,'선물 대상을 다시 확인해 주세요.');
 const artist=await artistGiftSource(env,b.artist_id,p.id,user.id);
 const dubbing=await assertDubbingGiftContext(env,user.id,p.id,b.dubbing_id);
 const track=b.track_id?await (await import('./catalog.js')).published(env,b.track_id):null;
 if(track){
  if(track.kind==='original')await assertArtistInteraction(env,track.artist_id,user.id);
  if(track.producer_id!==p.id)fail(400,'작품의 수신자를 확인해 주세요.');
  const reason=await giftBlockReason(env,user.id,track);if(reason)fail(400,reason);
 }
 const source=artist||(track||dubbing||b.from_profile===true?giftTargetSource(track||{producer_id:p.id,title:p.name},dubbing):
  b.from_message===true?{type:'message',id:p.id,title:p.name}:null);
 return {profile:p,track,source};
}
