import {rows, fail, json} from './db.js';
import {trackList, VISIBLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {dubbingPosterSQL} from './dubbing-poster.js';
import {songTextMatch,searchText} from './search-match.js';
import {trackBlockScope} from './block-policy.js';
import {requireUser} from './auth.js';

export {restrictedSQL,publicPlaylistSQL} from './playlist-visibility.js';
export const itemKey = item => item.kind+':'+item.content_id;
const blocked = column => `NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=${column}) OR (b.blocked_id=? AND b.user_id=${column}))`;
const dubScope = `${dubbingVisibleSQL()} AND (p.visibility='public' OR p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?)) AND ${blocked('p.owner_id')} AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.owner_id AND u.provider!='deleted')`;

export function typedItems(input) {
 if(!Array.isArray(input))fail(400,'콘텐츠 목록을 확인해 주세요.');
 const items=input.map(item=>{
  if(!item || !['original','cover','dubbing'].includes(item.kind) || typeof item.content_id!=='string' || !item.content_id || item.content_id.length>100)fail(400,'콘텐츠 종류와 식별자를 확인해 주세요.');
  return {kind:item.kind,content_id:item.content_id};
 });
 if(new Set(items.map(itemKey)).size!==items.length)fail(400,'같은 콘텐츠가 두 번 포함되어 있습니다.');
 return items;
}

export async function legacyItems(env,ids) {
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail(400,'곡 목록을 확인해 주세요.');
 const tracks=await rows(env,'SELECT id,kind FROM tracks WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(ids));
 const byId=new Map(tracks.map(t=>[t.id,t.kind]));
 return typedItems(ids.map(content_id=>({kind:byId.get(content_id),content_id})));
}

export async function storedItems(env,pid) {
 // My Box used the type and content ID to break equal positions. Existing
 // playlists used insertion time, then track ID. Keep both historical orders.
 const order=pid.startsWith('from-box-')?'position,kind,content_id':'position,created,content_id,kind';
 return rows(env,`SELECT kind,content_id,created,position FROM playlist_items WHERE playlist_id=? ORDER BY ${order}`,pid);
}

// Check new memberships again in the same D1 transaction as the write. One
// JSON bind per list keeps even a full editor save below SQLite's bind limit.
export function newItemsCondition(env,uid,items) {
 const block=trackBlockScope(env);
 return [`NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE
  (json_extract(j.value,'$.kind') IN ('original','cover') AND NOT EXISTS(SELECT 1 FROM tracks t WHERE t.id=json_extract(j.value,'$.content_id') AND t.kind=json_extract(j.value,'$.kind') AND ${VISIBLE()} AND ${blocked('t.user_id')}${block.sql}))
  OR (json_extract(j.value,'$.kind')='dubbing' AND NOT EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=json_extract(j.value,'$.content_id') AND ${dubScope})))`,
  [JSON.stringify(items),uid,uid,...block.args,uid,uid,uid,uid]];
}

export async function hydrateItems(env,uid,items,publicDetail=false) {
 const audio=items.filter(i=>i.kind!=='dubbing').map(i=>i.content_id),dub=items.filter(i=>i.kind==='dubbing').map(i=>i.content_id);
 const [tracks,dubs]=await Promise.all([
  audio.length?trackList(env,`${VISIBLE()} AND t.id IN (SELECT value FROM json_each(?))${publicDetail?'':' AND '+blocked('t.user_id')}`,[JSON.stringify(audio),...(publicDetail?[]:[uid,uid])],'t.id',audio.length):[],
  dub.length?rows(env,`SELECT p.id,p.title,'dubbing' kind,${dubbingPosterSQL} posterUrl,p.state,p.owner_id,p.duration FROM dubbing_projects p WHERE p.id IN (SELECT value FROM json_each(?)) AND ${dubScope}`,JSON.stringify(dub),uid,uid,uid,uid):[]
 ]);
 const details=new Map([...tracks,...dubs].map(t=>[t.kind+':'+t.id,t]));
 return items.map(item=>{const content=details.get(itemKey(item))||null;return {...item,available:!!content,content};});
}

export async function playlistCandidates(req,env,user) {
 requireUser(user);
 const params=new URL(req.url).searchParams,source=params.get('source')||'search',uid=user.id;
 const q=searchText(params.get('q')),limit=Math.max(1,Math.min(500,Math.floor(Number(params.get('limit'))||500))),offset=Math.max(0,Math.trunc(Number(params.get('offset'))||0));
 if(!['search','likes','history'].includes(source))fail(400,'곡 목록을 확인해 주세요.');
 const block=trackBlockScope(env),args=[uid,uid,...block.args];
 let match=`${VISIBLE()} AND t.kind IN ('original','cover') AND ${blocked('t.user_id')}${block.sql}`;
 if(q){const search=songTextMatch(q);match+=' AND '+search.sql;args.push(...search.args);}
 if(source==='likes'){match+=' AND EXISTS(SELECT 1 FROM likes l WHERE l.track_id=t.id AND l.user_id=?)';args.push(uid);}
 if(source==='history'){match+=' AND EXISTS(SELECT 1 FROM listens l WHERE l.track_id=t.id AND l.user_id=?)';args.push(uid);}
 const sort=source==='history'?'(SELECT max(l.started) FROM listens l WHERE l.track_id=t.id AND l.user_id=?)':'t.created';
 const select=`SELECT t.kind,t.id content_id,${sort} stamp FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id WHERE ${match}`;
 const dubs=source==='search'?` UNION ALL SELECT 'dubbing',p.id,p.created FROM dubbing_projects p WHERE ${dubScope} AND instr(lower(p.title),lower(?))>0`:'';
 const candidates=await rows(env,`SELECT kind,content_id FROM (${select}${dubs}) ORDER BY stamp DESC,kind,content_id LIMIT ? OFFSET ?`,...(source==='history'?[uid]:[]),...args,...(dubs?[uid,uid,uid,uid,q]:[]),limit+1,offset);
 const nextOffset=candidates.length>limit?offset+limit:null;
 const items=await hydrateItems(env,uid,candidates.slice(0,limit));
 return json({items,tracks:items.filter(i=>i.available&&i.kind!=='dubbing').map(i=>i.content),nextOffset});
}
