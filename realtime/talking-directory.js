import {fault,identifier,reply} from './protocol.js';

// The directory index and room presence live in different stores. Narrow the
// candidates by title/public host name before waking any room objects.
export async function talkingDirectory(env,action,input,actor,stamp){
 if(action==='candidates'){
  const size=input.size;
  if(![24,96].includes(size))fault(400,'목록 크기를 확인해주세요.');
  let where="closed=0 AND visibility='public'",args=[];
  if(input.cursor){
   const m=/^(\d{1,15}):([\w-]{1,80})$/.exec(input.cursor);
   if(!m)fault(400,'목록 위치를 확인해주세요.');
   where+=' AND (created,id)<(?,?)';args=[Number(m[1]),m[2]];
  }
  const {results}=await env.ROOM_DB.prepare('SELECT id,title,host_id,created FROM voice_rooms WHERE '+where+' ORDER BY created DESC,id DESC LIMIT ?').bind(...args,size+1).all();
  return reply({rooms:results.slice(0,size),more:results.length>size});
 }
 if(!Array.isArray(input.ids)||input.ids.length>24)fault(400,'목록 크기를 확인해주세요.');
 const rooms=await Promise.all(input.ids.map(async raw=>{
  const id=identifier(raw),room=env.ROOMS.get(env.ROOMS.idFromName(id));
  const response=await room.fetch(new Request('https://room/directory-card',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor,stamp,roomId:id,input:{members:!!input.members}})}));
  if(!response.ok)fault(503,'토킹룸 목록을 다시 불러와주세요.');
  return response.json();
 }));
 return reply({rooms:rooms.filter(Boolean)});
}

// Called after the room's usual lease expiry pass. Only the signed Site bridge
// receives the IDs needed to intersect presence with the viewer's follows.
export function talkingDirectoryCard(data,includeMembers){
 const r=data.config,members=Object.values(data.members);
 if(!r||r.closed||r.visibility!=='public'||r.mode==='karaoke'||!members.length)return null;
 return {id:r.id,title:r.title,host_id:r.host_id,max_members:r.max_members||30,background:r.background,
  theme_sku:r.theme_sku,settings_revision:r.settings_revision,member_count:members.length,member_ids:includeMembers?members.map(m=>m.id):[]};
}
