import {one,fail} from './db.js';
import {partnerState} from './diamonds.js';
import {splitGift} from '../shared/gifts.js';

// Purchased and stored gifts resolve the same performer/creator and monetary split.
export async function giftSettlement(env,track,net){
 const cover=track.kind==='cover';
 const original=cover?await one(env,'SELECT producer_id FROM tracks WHERE id=?',track.original_id):null;
 if(cover&&!original)fail(409,'원곡 제작자 정보를 확인할 수 없어요.');
 const share=splitGift(track.kind||'original',net,(await partnerState(env,track.user_id)).tier==='partner');
 return {singerProfile:cover?track.producer_id:null,creatorProfile:cover?original.producer_id:track.producer_id,...share};
}
