import {publicNameSQL,producerNameSQL} from './identity.js';
import {rows,fail,json} from './db.js';
import {directoryRoomThemes} from './room-decorations.js';

export async function talkingRoomPage(env,user,params,readDirectory){
 const limit=Number(params.get('limit')),search=(params.get('q')||'').trim().toLowerCase(),cursor=params.get('cursor')||null;
 if(!Number.isInteger(limit)||limit<1||limit>24||search.length>100||(cursor&&!/^\d{1,15}:[\w-]{1,80}$/.test(cursor)))fail(400,'검색 조건을 확인해주세요.');
 // Older directory rows contain host IDs, not nicknames. Join only this
 // indexed window to the site's privacy-safe public identities.
 const page=await readDirectory('candidates',{cursor,size:search?96:24});
 const hosts=page.rooms.length?await rows(env,`SELECT u.id,${publicNameSQL()} name FROM users u
  WHERE u.id IN (SELECT value FROM json_each(?)) AND u.provider!='deleted'`,JSON.stringify([...new Set(page.rooms.map(r=>r.host_id))])):[];
 const names=new Map(hosts.map(h=>[h.id,h.name]));
 const matches=r=>!search||(r.title+' '+(names.get(r.host_id)||'')).toLowerCase().includes(search);
 const selected=page.rooms.filter(matches).slice(0,limit);
 const last=selected.length===limit?selected.at(-1):page.rooms.at(-1);
 const next=last&&(page.more||last!==page.rooms.at(-1))?last.created+':'+last.id:null;
 const {rooms}=selected.length?await readDirectory('cards',{ids:selected.map(r=>r.id),members:!!user}):{rooms:[]};
 const visible=rooms.filter(matches);
 const memberIds=user?[...new Set(visible.flatMap(r=>r.member_ids))]:[];
 const [themes,profiles]=await Promise.all([
  directoryRoomThemes(env,visible),
  memberIds.length?rows(env,`SELECT p.user_id,p.id profile_id,${producerNameSQL()} name,p.image_version
   FROM producers p JOIN follows f ON f.kind='producer' AND f.target_id=p.id AND f.user_id=?
   JOIN users u ON u.id=p.user_id WHERE u.provider!='deleted' AND p.user_id IN (SELECT value FROM json_each(?))
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.user_id) OR (b.blocked_id=? AND b.user_id=p.user_id))`,user.id,JSON.stringify(memberIds),user.id,user.id):[]
 ]);
 const followed=new Map(profiles.map(({user_id,...profile})=>[user_id,profile]));
 return json({enabled:true,rooms:visible.map(({member_ids,host_id,...room})=>{
  const people=member_ids.map(id=>followed.get(id)).filter(Boolean);
  return {...room,host_name:names.get(host_id)||'',theme:themes.get(room.id),followed_profiles:people.slice(0,3),followed_count:people.length};
 }),next_cursor:next,crews:[]});
}
