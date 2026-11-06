import {publicNameSQL,producerNameSQL} from './identity.js';
import {rows,fail,json} from './db.js';
import {directoryRoomThemes} from './room-decorations.js';
import {viewerBlockedIds} from './auth.js';

async function directoryHosts(env,rooms){
 if(!rooms.length)return new Map();
 const ids=JSON.stringify([...new Set(rooms.map(r=>r.host_id))]);
 const hosts=await rows(env,`SELECT u.id,u.id user_id,${publicNameSQL()} name,p.id profile_id,p.image_version
  FROM users u LEFT JOIN producers p ON p.user_id=u.id
  WHERE u.id IN (SELECT value FROM json_each(?)) AND u.provider!='deleted'`,ids);
 return new Map(hosts.map(({id,...profile})=>[id,profile]));
}

export async function talkingRoomPage(env,user,params,readDirectory){
 const limit=Number(params.get('limit')),search=(params.get('q')||'').trim().toLowerCase(),cursor=params.get('cursor')||null;
 if(!Number.isInteger(limit)||limit<1||limit>24||search.length>100||(cursor&&!/^\d{1,15}:[\w-]{1,80}$/.test(cursor)))fail(400,'검색 조건을 확인해주세요.');
 // Older directory rows contain host IDs, not nicknames. Join only this
 // indexed window to the site's privacy-safe public identities.
 const mode=params.get('mode')||'talk';
 if(!['all','talk','karaoke'].includes(mode))fail(400,'방 유형을 확인해주세요.');
 const blocked=new Set(user?viewerBlockedIds(user):[]);
 const matches=(r,hosts)=>!blocked.has(r.host_id)&&(!search||(r.title+' '+(hosts.get(r.host_id)?.name||'')).toLowerCase().includes(search));
 let ids,next=null;
 if(params.has('ids')){
  ids=[...new Set(params.get('ids').split(','))];
  if(cursor||ids.length>limit||ids.some(id=>!/^[-\w]{1,80}$/.test(id)))fail(400,'방 목록을 확인해주세요.');
 }else{
  const page=await readDirectory('candidates',{cursor,size:search?96:24});
  const hosts=search?await directoryHosts(env,page.rooms):null;
  const selected=page.rooms.filter(r=>matches(r,hosts)).slice(0,limit);
  const last=selected.length===limit?selected.at(-1):page.rooms.at(-1);
  next=last&&(page.more||last!==page.rooms.at(-1))?last.created+':'+last.id:null;
  ids=selected.map(r=>r.id);
 }
 const {rooms}=ids.length?await readDirectory('cards',{ids,members:!!user,mode}):{rooms:[]};
 const hosts=await directoryHosts(env,rooms);
 const visible=rooms.filter(r=>matches(r,hosts));
 const memberIds=user?[...new Set(visible.flatMap(r=>r.member_ids))]:[];
 const [themes,profiles]=await Promise.all([
  directoryRoomThemes(env,visible),
  memberIds.length?rows(env,`SELECT p.user_id,p.id profile_id,${producerNameSQL()} name,p.image_version
   FROM producers p JOIN follows f ON f.kind='producer' AND f.target_id=p.id AND f.user_id=?
   JOIN users u ON u.id=p.user_id WHERE u.provider!='deleted' AND p.user_id!=f.user_id AND p.user_id IN (SELECT value FROM json_each(?))
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.user_id) OR (b.blocked_id=? AND b.user_id=p.user_id))`,user.id,JSON.stringify(memberIds),user.id,user.id).catch(()=>[]):[]
 ]);
 const followed=new Map(profiles.map(({user_id,...profile})=>[user_id,profile]));
 return json({enabled:true,rooms:visible.map(({member_ids,host_id,...room})=>{
  const people=[...new Set(member_ids)].map(id=>followed.get(id)).filter(Boolean);
  const host=hosts.get(host_id);
  return {...room,host_name:host?.name||'',host_profile:host||null,theme:themes.get(room.id),followed_profiles:people.slice(0,3),followed_count:people.length};
 }),next_cursor:next,crews:[]});
}
