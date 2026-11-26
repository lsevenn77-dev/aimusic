import editions from './dubbing-original-editions.json' with {type:'json'};
import {requireUser} from './auth.js';
import {query,one,now,id,json,fail} from './db.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {officialDubbingProducerId as owner} from '../shared/dubbing-official.js';
import {dubbingTimeline,validateDubbingScript} from '../shared/dubbing.js';
import {dubbingRecordingWindows,validateDubbingTake} from '../shared/dubbing-recording.js';
import {closeDeletedContentReports} from './deleted-content-reports.js';

const privateMeta=type=>({httpMetadata:{contentType:type,cacheControl:'private, no-store'}});
const countGuard='SELECT CASE WHEN changes()=1 THEN 1 ELSE abs(-9223372036854775808) END';
const approved=(env)=>query(env,countGuard);
const contentRoot=c=>'dubbing/'+owner+'/'+c.edition+'/approved/'+c.hash+'/';
const assetKey=(c,k,m)=>contentRoot(c)+m.items[k].hash+(k==='bed'||k==='master'?'.m4a':'.wav');
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
function checked(ok){if(!ok)fail(409,'확인된 공식 교체본과 일치하지 않습니다.');}
async function bytesOf(req,size) {
 if(Number(req.headers.get('content-length'))!==size||!req.body||size>12*1024*1024)fail(400,'파일 크기 불일치');
 const reader=req.body.getReader(),buf=new Uint8Array(size);let off=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(off+value.length>size){await reader.cancel();fail(413,'파일 크기 초과');}buf.set(value,off);off+=value.length;}}finally{reader.releaseLock();}
 checked(off===size);return buf;
}
// Back up only the four originals and their recording relationships. Other users' takes stay in place.
// The snapshot stays in private object storage. The producer's HTTP receipt exposes counts and digest only.
async function snapshot(env,c) {
 const family='SELECT id FROM dubbing_projects WHERE id=? OR root_id=?';
 const sql=[
 ['projects','SELECT id,root_id,owner_id,script_key,poster_version,state,revision,visibility,deleted_at FROM dubbing_projects WHERE id=? OR root_id=?'],
 ['official','SELECT * FROM dubbing_projects WHERE id IN (?,?)'],
 ['claims','SELECT * FROM dubbing_role_claims WHERE project_id IN ('+family+')'],
 ['recordings','SELECT id,project_id,role_id,user_id,state,revision,script_key FROM dubbing_recordings WHERE project_id IN ('+family+')'],
 ['takes','SELECT l.recording_id,l.line_id,l.take_id,l.audio_hash,l.audio_key,l.bytes,l.duration FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id IN ('+family+')'],
 ['permissions','SELECT v.* FROM dubbing_recording_permissions v JOIN dubbing_recordings r ON r.id=v.recording_id WHERE r.project_id IN ('+family+')'],
 ['drafts','SELECT * FROM dubbing_casting_drafts WHERE root_id=?'],
 ['combinations','SELECT * FROM dubbing_combinations WHERE root_id=?'],
 ['sounds','SELECT * FROM dubbing_sound_jobs WHERE project_id IN (?,?)'],
 ['finals','SELECT * FROM dubbing_final_jobs WHERE project_id IN (?,?)']
 ];
 const stmts=sql.map(([name,sql])=>query(env,sql,...(['drafts','combinations'].includes(name)?[c.oldRoot]:['sounds','finals','official'].includes(name)?[c.oldRoot,c.oldEdition]:[c.oldRoot,c.oldRoot])));
 const results=await env.DB.batch(stmts);const obj=Object.fromEntries(sql.map(([k],i)=>[k,results[i].results]));
 const buf=new TextEncoder().encode(JSON.stringify(obj));const hash=await sha(buf);
 const key='dubbing/'+owner+'/'+c.oldRoot+'/edition-backups/'+hash+'.json';
 await env.BUCKET.put(key,buf,privateMeta('application/json'));
 return {hash,key,counts:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,v.length]))};
}
export async function officialRebuild(req,env,root,user,operation) {
 requireUser(user);const c=editions.find(e=>e.oldRoot===root.id);
 if(!c||root.owner_id!==owner||user.id!==owner)fail(403,'공식 제작자만 사용할 수 있습니다.');
 const [step,name]=operation.split('/');
 if(step==='snapshot'&&req.method==='POST')return json(await snapshot(env,c));
 if(!c.hash)fail(409,'최종 검수가 끝나지 않았습니다.');
 const prefix=contentRoot(c),key=prefix+'manifest.json';
 const completed=await one(env,"SELECT id FROM dubbing_projects WHERE id=? AND root_id=? AND owner_id=? AND visibility='public' AND state='complete' AND deleted_at=0",c.edition,c.root,owner);
 if(completed)return json({public:true,id:c.edition});
 checked(root.visibility==='public'&&root.revision>=c.rootRevision);
 if(root.revision!==c.rootRevision){
  // Joining an existing role legitimately increments revision during a long audio upload.
  // Compare the backed-up editorial content before accepting that independent change.
  const original=[root.title,root.source,JSON.parse(root.options_json),JSON.parse(root.script_json),root.poster_version||''];
  checked(await sha(new TextEncoder().encode(JSON.stringify(original)))===c.sourceDigest);
 }
 const old=await one(env,"SELECT p.id FROM dubbing_projects p WHERE p.id=? AND p.root_id=? AND p.owner_id=? AND p.revision=? AND p.state='complete' AND p.visibility='public' AND "+dubbingVisibleSQL(),c.oldEdition,c.oldRoot,owner,c.editionRevision);
 checked(old);
 if(step==='manifest'&&req.method==='PUT'){
  const size=Number(req.headers.get('content-length'));checked(size>64&&size<=280000);const b=await bytesOf(req,size);checked(await sha(b)===c.hash);
  await env.BUCKET.put(key,b,privateMeta('application/json'));return json({ok:true});
 }
 const obj=await env.BUCKET.get(key);checked(obj);const m=await obj.json();
 if(step==='asset'&&req.method==='PUT'){
  const f=Object.hasOwn(m.items,name)&&m.items[name];checked(f);
  const k=assetKey(c,name,m);const prior=await env.BUCKET.head(k);
  if(prior?.size===f.bytes&&prior.customMetadata?.sha256===f.hash)return json({saved:true});
  const b=await bytesOf(req,f.bytes);checked(await sha(b)===f.hash);
  const audio=name==='bed'||name==='master';
  if(!audio){const line=m.script.lines.find(l=>l.id===name);checked(line&&line.roleId===f.role);validateDubbingTake(b,line.durationSeconds);}
  else checked(String.fromCharCode(...b.subarray(4,8))==='ftyp');
  await env.BUCKET.put(k,b,{...privateMeta(audio?'audio/mp4':'audio/wav'),customMetadata:{sha256:f.hash}});return json({saved:true});
 }
 const assets=Object.keys(m.items),groups=Math.ceil(assets.length/15);
 if(step==='verify'&&req.method==='POST'){
  const g=Number(name);checked(Number.isInteger(g)&&g>=0&&g<groups);
  const batch=assets.slice(g*15,g*15+15);await Promise.all(batch.map(async k=>{const f=m.items[k],o=await env.BUCKET.head(assetKey(c,k,m));checked(o&&o.size===f.bytes&&o.customMetadata?.sha256===f.hash);}));
  await env.BUCKET.put(prefix+'verified-'+g,c.hash,privateMeta('text/plain'));return json({verified:batch.length});
 }
 if(step==='stage'&&req.method==='POST'){
  const prior=await one(env,'SELECT id,root_id,owner_id,state,visibility FROM dubbing_projects WHERE id=?',c.edition);
  if(prior){checked(prior.root_id===c.root&&prior.owner_id===owner&&prior.state==='complete'&&prior.visibility==='private');return json({private:true,id:c.edition});}
  for(let g=0;g<groups;g++)checked(await env.BUCKET.head(prefix+'verified-'+g));
  const snap=await snapshot(env,c);const options=JSON.parse(root.options_json);
  if(m.idea)options.idea=m.idea;
  const script=validateDubbingScript(m.script,options);checked(script.title===root.title&&script.lines.every(l=>m.items[l.id]?.role===l.roleId));
  const timeline=dubbingTimeline(script);const scriptKey=prefix+'script.json';
  const bg=assetKey(c,'bed',m),master=assetKey(c,'master',m),at=now(),roles=new Map(script.roles.map(r=>[r.id,id()]));
  const takes=script.lines.map(l=>({id:l.id,rid:roles.get(l.roleId),tid:id(),key:assetKey(c,l.id,m),...m.items[l.id]}));
  const takesById=new Map(takes.map(t=>[t.id,t]));const windows=dubbingRecordingWindows(script,timeline);
  const final={duration:timeline.duration,background:bg,lines:windows.lines.map(l=>{const t=takesById.get(l.id);return {id:l.id,start:l.start,end:l.recordEnd,key:t.key,takeId:t.tid,userId:owner};})};
  await env.BUCKET.put(scriptKey,JSON.stringify({script,soundPlan:script.soundCues,timeline}),privateMeta('application/json'));
  if(root.poster_version){const oldPoster=await env.BUCKET.get('dubbing/'+owner+'/'+root.id+'/posters/'+root.poster_version+'.webp');checked(oldPoster);
   await env.BUCKET.put('dubbing/'+owner+'/'+c.root+'/posters/'+root.poster_version+'.webp',oldPoster.body,privateMeta('image/webp'));}
  const statements=[];
  for(const [pid,parent,state] of [[c.root,null,'recruiting'],[c.edition,c.root,'complete']]){
   statements.push(query(env,`INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,source,state,visibility,root_id,role_count,duration,write_token,rights_at,created,updated,first_recorded_at,poster_version)
    VALUES(?,?,?,?,?,?,?,? ,?,'private',?,?,?,?,?,?,?,?,?)`,pid,owner,root.title,JSON.stringify(options),JSON.stringify(script),scriptKey,c.hash,root.source,state,parent,roles.size,timeline.duration,id(),at,at,at,parent?at:0,parent?'':root.poster_version));
   statements.push(query(env,"INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,output_meta,created,updated) VALUES(?,?,?,'ai',?,'ready',?,?,?,?)",id(),pid,scriptKey,JSON.stringify(timeline),bg,JSON.stringify({sha256:m.items.bed.hash,bytes:m.items.bed.bytes,duration:timeline.duration,sampleRate:48000}),at,at));
  }
  for(const [role,rid] of roles){
   statements.push(query(env,'INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES(?,?,?,?)',c.edition,role,owner,at),
    query(env,"INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,revision,write_token,rights_at,created,updated) VALUES(?,?,?,?,?,'submitted',1,?,?,?,?)",rid,c.edition,role,owner,scriptKey,id(),at,at,at),
    query(env,"INSERT INTO dubbing_recording_permissions(recording_id,visibility,license_version,accepted_at) VALUES(?,'public','casting-2026-11-01',?)",rid,at));
  }
  statements.push(query(env,`INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated)
   SELECT value->>'$.rid',value->>'$.id',value->>'$.tid',value->>'$.key',value->>'$.hash',value->>'$.duration',value->>'$.bytes',? FROM json_each(?)`,at,JSON.stringify(takes)),
   query(env,"INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,manifest_json,output_key,output_meta,created,updated) VALUES(?,?,?,'ready',?,?,?,?,?)",id(),c.edition,scriptKey,JSON.stringify(final),master,JSON.stringify({sha256:m.items.master.hash,bytes:m.items.master.bytes,peakDb:m.peak,duration:timeline.duration,sampleRate:48000,playTracking:1}),at,at),
   query(env,'INSERT INTO dubbing_combinations(project_id,root_id,last_participation,render_requested) VALUES(?,?,?,1)',c.edition,c.root,at),
   query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',c.edition+':staged',owner,'dubbing_edition_stage',JSON.stringify({backup:snap.key,hash:c.hash}),at));
  await env.DB.batch(statements);return json({private:true,id:c.edition,root:c.root,backup:snap.hash});
 }
 if(step==='publish'&&req.method==='POST'){
  const receipt=await req.json();checked(receipt.master===m.items.master.hash&&receipt.bed===m.items.bed.hash);
  const at=now();const checkedWrite=(sql,...args)=>[query(env,sql,...args),approved(env)];
  await env.DB.batch([
   ...checkedWrite("UPDATE dubbing_projects SET deleted_at=?,visibility='private',revision=revision+1,updated=? WHERE id=? AND owner_id=? AND root_id=? AND revision=? AND deleted_at=0 AND state='complete' AND visibility='public'",at,at,c.oldEdition,owner,c.oldRoot,c.editionRevision),
   ...closeDeletedContentReports(env,'dubbing','t.id=?',[c.oldEdition],owner,at),
   ...checkedWrite("UPDATE dubbing_projects SET visibility='public',revision=revision+1,updated=? WHERE id=? AND owner_id=? AND root_id IS NULL AND visibility='private' AND deleted_at=0 AND creation_hash=?",at,c.root,owner,c.hash),
   ...checkedWrite("UPDATE dubbing_projects SET visibility='public',revision=revision+1,updated=? WHERE id=? AND owner_id=? AND root_id=? AND state='complete' AND deleted_at=0 AND visibility='private' AND creation_hash=?",at,c.edition,owner,c.root,c.hash),
   query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',c.oldRoot+':original-retired',owner,'dubbing_edition_replace',JSON.stringify({oldEdition:c.oldEdition,oldRoot:c.oldRoot,edition:c.edition,root:c.root,hash:c.hash}),at)
  ]);return json({public:true,id:c.edition});
 }
 fail(404,'공식 운영 작업을 찾을 수 없습니다.');
}

