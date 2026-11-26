import * as AifectMessages from '../shared/system-messages.js';
import {one,query,fail,json,now} from './db.js';
import {requireUser} from './auth.js';
import {published,VISIBLE,trackList} from './catalog.js';

export const completedCoverSQL=(t='t')=>`${t}.kind='cover' AND (${t}.cover_mode='solo' OR (${t}.cover_mode='duet' AND ${t}.duet_parent_id IS NOT NULL AND ${t}.duet_open=0))`;
// Existing producer ownership plus track management ownership. There is no
// co-composer grant in the schema; uploader identity alone is insufficient.
export const pickOwnerSQL=(o='o')=>`${o}.kind='original' AND ${o}.user_id=? AND EXISTS(SELECT 1 FROM producers p WHERE p.id=${o}.producer_id AND p.user_id=?)`;
export async function songCoverPick(env,detail,user){
 const [selection,owner]=await Promise.all([
  one(env,'SELECT cover_id,revision FROM song_cover_picks WHERE original_id=?',detail.id),
  user?one(env,`SELECT 1 FROM tracks o WHERE o.id=? AND ${pickOwnerSQL()}`,detail.id,user.id,user.id):null
 ]);
 // Viewer blocks only affect projection. Never clear stored picks on reads.
 const picked=selection?.cover_id?(await trackList(env,`t.id=? AND t.original_id=? AND ${VISIBLE()} AND ${completedCoverSQL()}`,[selection.cover_id,detail.id],'t.id',1))[0]:null;
 return {cover_id:picked?.id||null,cover:picked||null,has_pick:!!selection?.cover_id,revision:selection?.revision||0,can_manage:!!owner};
}
export async function coverPickRoute(req,env,tid,user){
 const detail=await published(env,tid);
 if(req.method==='GET')return json(await songCoverPick(env,detail,user));
 if(req.method!=='PUT')fail(405,AifectMessages.unsupportedRequest);
 requireUser(user);
 if(!(await one(env,`SELECT 1 FROM tracks o WHERE o.id=? AND ${pickOwnerSQL()}`,tid,user.id,user.id)))fail(403,'이 곡의 작곡가만 PICK을 변경할 수 있습니다.');
 const b=await req.json(),coverId=b.cover_id,revision=b.expected_revision;
 if(!(coverId===null||typeof coverId==='string'&&/^[\w-]{1,100}$/.test(coverId))||!Number.isSafeInteger(revision)||revision<0)fail(400,'PICK 요청을 확인해 주세요.');
 if(coverId){
  const target=await published(env,coverId);
  if(target.original_id!==tid||!(await one(env,`SELECT 1 FROM tracks t WHERE t.id=? AND ${completedCoverSQL()}`,coverId)))fail(400,'같은 원곡의 공개된 완성 커버만 PICK으로 선택할 수 있습니다.');
 }
 // The INSERT SELECT repeats authorization and eligibility inside the one
 // atomic write, closing races with moderation, deletion and ownership edits.
 const result=await query(env,`INSERT INTO song_cover_picks(original_id,cover_id,revision,updated_by,updated)
  SELECT o.id,?,1,?,? FROM tracks o WHERE o.id=? AND ${pickOwnerSQL()} AND ${VISIBLE('o')}
   AND (? IS NULL OR EXISTS(SELECT 1 FROM tracks t WHERE t.id=? AND t.original_id=o.id AND ${VISIBLE()} AND ${completedCoverSQL()}))
   AND (?=0 OR EXISTS(SELECT 1 FROM song_cover_picks sp WHERE sp.original_id=o.id AND sp.revision=?))
  ON CONFLICT(original_id) DO UPDATE SET cover_id=excluded.cover_id,revision=song_cover_picks.revision+1,updated_by=excluded.updated_by,updated=excluded.updated
   WHERE song_cover_picks.revision=? RETURNING revision`,coverId,user.id,now(),tid,user.id,user.id,coverId,coverId,revision,revision,revision).all();
 if(!result.results.length)fail(409,'PICK 또는 공개 상태가 변경되었습니다. 목록을 새로 확인한 뒤 다시 선택해 주세요.');
 return json(await songCoverPick(env,detail,user));
}
