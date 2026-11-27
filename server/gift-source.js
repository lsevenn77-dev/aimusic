import {one,query,fail} from './db.js';

import {namedArtistSQL} from './artist-identity.js';
import {assertArtistInteraction} from './follow-management.js';

// The recipient is the existing creator profile. An artist identifies the entry point only.
export async function artistGiftSource(env,artistId,profileId,viewer){
 if(artistId==null)return null;
 if(typeof artistId!=='string')fail(400,'아티스트를 확인해 주세요.');
 const artist=await one(env,`SELECT a.id,a.name FROM artists a JOIN producers p ON p.id=a.producer_id JOIN users u ON u.id=p.user_id
  WHERE a.id=? AND p.id=? AND u.provider!='deleted' AND ${namedArtistSQL()}`,artistId,profileId);
 if(!artist)fail(400,'아티스트의 소속 제작자를 확인해 주세요.');
 await assertArtistInteraction(env,artist.id,viewer);
 return {type:'artist',id:artist.id,title:artist.name};
}
export async function checkArtistGiftReplay(env,currency,giftId,source){
 const prior=await one(env,"SELECT source_type,source_id,work_kind FROM gift_sources WHERE currency=? AND gift_id=? AND (source_type='artist' OR work_kind='dubbing')",currency,giftId);
 const contextual=source?.type==='artist'||source?.workKind==='dubbing';
 if(contextual?(prior?.source_type!==source.type||prior.source_id!==source.id||(prior.work_kind||null)!==(source.workKind||null)):!!prior)
  fail(409,'이미 다른 선물에 사용한 요청입니다.');
}

// Callers construct this from a verified route target, never from a client label.
export function giftSourceEntry(env,currency,giftId,source){
 // The two wallets have separate request indexes. Check the opposite ledger inside
 // the same batch so a retried artist gift cannot settle in both currencies.
 if(source.type==='artist'&&(currency==='gold'||currency==='silver')){
  const [current,other]=currency==='gold'?['gifts','free_gifts']:['free_gifts','gifts'];
  return query(env,`INSERT INTO gift_sources(currency,gift_id,source_type,source_id,source_title)
   SELECT ?,?,?,CASE WHEN NOT EXISTS(
    SELECT 1 FROM ${current} g JOIN ${other} previous ON previous.sender_id=g.sender_id AND previous.request_id=g.request_id WHERE g.id=?
   ) THEN ? END,?`,currency,giftId,source.type,giftId,source.id,source.title);
 }
 return query(env,'INSERT INTO gift_sources(currency,gift_id,source_type,source_id,source_title,work_kind) VALUES(?,?,?,?,?,?)',
  currency,giftId,source.type,source.id,source.title,source.workKind??null);
}

export function giftTargetSource(track,dubbing){
 if(dubbing)return {type:'work',id:dubbing.id,title:dubbing.title,workKind:'dubbing'};
 if(track.id)return {type:'work',id:track.id,title:track.title,workKind:'song'};
 return {type:'profile',id:track.producer_id,title:track.title};
}
