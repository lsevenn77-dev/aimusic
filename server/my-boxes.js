import {one,rows,query,now,id,str,fail,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {VISIBLE,trackList} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {dubbingPosterSQL} from './dubbing-poster.js';
import {libraryTransaction,pageParams} from './library-transactions.js';

const blocked=(alias,column)=>`NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=${alias}.${column}) OR (b.blocked_id=? AND b.user_id=${alias}.${column}))`;
const dubScope=()=>`${dubbingVisibleSQL()} AND (p.visibility='public' OR p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?)) AND ${blocked('p','owner_id')} AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.owner_id AND u.provider!='deleted')`;
const itemInput=b=>{if(!b||!['original','cover','dubbing'].includes(b.kind)||typeof b.content_id!=='string'||!b.content_id||b.content_id.length>100)fail(400,'담을 콘텐츠를 확인해주세요.');return {kind:b.kind,content_id:b.content_id};};
const contentCondition=(item,uid)=>item.kind==='dubbing'?[`EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=? AND ${dubScope()})`,[item.content_id,uid,uid,uid,uid]]:[`EXISTS(SELECT 1 FROM tracks t WHERE t.id=? AND t.kind=? AND ${VISIBLE()} AND ${blocked('t','user_id')})`,[item.content_id,item.kind,uid,uid]];
const itemKey=i=>i.kind+':'+i.content_id;
async function contentAllowed(env,item,uid){const [sql,args]=contentCondition(item,uid);if(!(await one(env,`SELECT (${sql}) ok`,...args)).ok)fail(404,'담을 수 있는 콘텐츠를 찾을 수 없어요.');return [sql,args];}
const touch=(env,box)=>query(env,'UPDATE my_boxes SET updated=?,revision=revision+1 WHERE id=?',now(),box.id);
const addItem=(env,bid,item)=>query(env,'INSERT OR IGNORE INTO my_box_items(box_id,kind,content_id,position,created) SELECT ?,?,?,COALESCE(MAX(position)+1,0),? FROM my_box_items WHERE box_id=?',bid,item.kind,item.content_id,now(),bid);
async function box(env,bid,user){requireUser(user);const value=await one(env,'SELECT * FROM my_boxes WHERE id=? AND user_id=?',bid,user.id);if(!value)fail(404,'마이박스를 찾을 수 없습니다.');return value;}
export async function boxSummaries(env,uid,params=new URLSearchParams()){
 const {limit,offset}=pageParams(params),q=(params.get('q')||'').trim().slice(0,100),where='b.user_id=? AND instr(lower(b.name),lower(?))>0',args=[uid,q];
 const total=(await one(env,`SELECT count(*) n FROM my_boxes b WHERE ${where}`,...args)).n;
 const order=params.get('sort')==='title'?'b.name COLLATE NOCASE,b.id':params.get('sort')==='oldest'?'b.created,b.id':'b.updated DESC,b.id';
 const items=await rows(env,`SELECT b.id,b.name,b.created,b.updated,b.revision,
 (SELECT count(*) FROM my_box_items i WHERE i.box_id=b.id AND i.kind='original') originals,
 (SELECT count(*) FROM my_box_items i WHERE i.box_id=b.id AND i.kind='cover') covers,
 (SELECT count(*) FROM my_box_items i WHERE i.box_id=b.id AND i.kind='dubbing') dubbings
 FROM my_boxes b WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,...args,limit,offset);
 // One bounded content hydration for all cards, never one query per card.
 const representatives=items.length?await rows(env,`SELECT i.* FROM my_box_items i WHERE i.box_id IN (SELECT value FROM json_each(?)) AND i.rowid=(SELECT first.rowid FROM my_box_items first WHERE first.box_id=i.box_id ORDER BY first.position,first.kind,first.content_id LIMIT 1)`,JSON.stringify(items.map(b=>b.id))):[];
 const contained=params.get('contains')&&items.length?new Set((await rows(env,'SELECT box_id FROM my_box_items WHERE content_id=? AND kind=? AND box_id IN (SELECT value FROM json_each(?))',params.get('contains'),params.get('kind')||'',JSON.stringify(items.map(b=>b.id)))).map(x=>x.box_id)):new Set();
 const hydrated=await hydrate(env,uid,representatives),art=new Map(hydrated.map(x=>[x.box_id,x.available?x.content:null]));
 return {items:items.map(b=>({...b,contains:contained.has(b.id),representative:art.get(b.id)||null,is_private:true})),total,nextOffset:offset+items.length<total?offset+items.length:null};
}
async function hydrate(env,uid,items){
 const tids=items.filter(i=>i.kind!=='dubbing').map(i=>i.content_id),dids=items.filter(i=>i.kind==='dubbing').map(i=>i.content_id);
 const [tracks,dubs]=await Promise.all([
  tids.length?trackList(env,`${VISIBLE()} AND t.id IN (SELECT value FROM json_each(?)) AND ${blocked('t','user_id')}`,[JSON.stringify(tids),uid,uid],'t.id',50):[],
  dids.length?rows(env,`SELECT p.id,p.title,'dubbing' kind,${dubbingPosterSQL} posterUrl,p.state FROM dubbing_projects p WHERE p.id IN (SELECT value FROM json_each(?)) AND ${dubScope()}`,JSON.stringify(dids),uid,uid,uid,uid):[]
 ]);
 const map=new Map([...tracks,...dubs].map(t=>[t.kind+':'+t.id,t]));
 return items.map(i=>{const content=map.get(itemKey(i));return {...i,available:!!content,content:content||null};});
}
export async function myBoxesRoute(req,env,path,user){
 if(!/^\/api\/my-boxes(?:\/|$)/.test(path))return null;requireUser(user);
 const method=req.method,params=new URL(req.url).searchParams;
 if(path==='/api/my-boxes'){
  if(method==='GET')return json(await boxSummaries(env,user.id,params));
  if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json();if('is_public' in b||'visibility' in b)fail(400,'마이박스는 비공개 전용입니다.');
  const name=str(b.name,80),item=b.item?itemInput(b.item):null,rid=b.request_id?str(b.request_id,100):id(),fingerprint=await hash(JSON.stringify({type:'mybox',name,item}));
  const replay=async()=>{const prior=await one(env,'SELECT * FROM library_requests WHERE user_id=? AND request_id=?',user.id,rid);if(prior&&prior.fingerprint!==fingerprint)fail(409,'같은 요청 식별자로 다른 내용을 저장할 수 없습니다.');return prior;};
  const prior=await replay();if(prior)return json({id:prior.result_id,replayed:true});
  await rate(env,'mybox-create:'+user.id,30,60);const conditions=item?[await contentAllowed(env,item,user.id)]:[],bid=id(),at=now();
  try{await libraryTransaction(env,conditions,[query(env,'INSERT INTO my_boxes(id,user_id,name,created,updated) VALUES(?,?,?,?,?)',bid,user.id,name,at,at),...(item?[addItem(env,bid,item)]:[]),query(env,'INSERT INTO library_requests VALUES(?,?,?,?,?)',user.id,rid,fingerprint,bid,at)]);}catch(e){const raced=await replay();if(raced)return json({id:raced.result_id,replayed:true});throw e;}
  return json({id:bid},201);
 }
 const m=path.match(/^\/api\/my-boxes\/([\w-]+)(?:\/(items|order|move|copy))?$/);if(!m)fail(404,'마이박스 기능을 찾을 수 없습니다.');
 const [,bid,action]=m,b=await box(env,bid,user),conditions=[['EXISTS(SELECT 1 FROM my_boxes WHERE id=? AND user_id=? AND revision=?)',[bid,user.id,b.revision]]],statements=[];
 if(!action&&method==='GET'){
  const {limit,offset}=pageParams(params),filter=params.get('filter')||'all',q=(params.get('q')||'').trim().slice(0,100);
  if(!['all','original','cover','dubbing'].includes(filter))fail(400,'콘텐츠 필터를 확인해주세요.');
  const where=`i.box_id=?${filter==='all'?'':' AND i.kind=?'}${q?` AND ((i.kind IN ('original','cover') AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=i.content_id AND instr(lower(t.title),lower(?))>0 AND ${VISIBLE()} AND ${blocked('t','user_id')})) OR (i.kind='dubbing' AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=i.content_id AND instr(lower(p.title),lower(?))>0 AND ${dubScope()})))`:''}`,args=[bid,...(filter==='all'?[]:[filter]),...(q?[q,user.id,user.id,q,user.id,user.id,user.id,user.id]:[])];
  const total=(await one(env,`SELECT count(*) n FROM my_box_items i WHERE ${where}`,...args)).n;
  const items=await hydrate(env,user.id,await rows(env,`SELECT i.* FROM my_box_items i WHERE ${where} ORDER BY i.position,i.kind,i.content_id LIMIT ? OFFSET ?`,...args,limit,offset));
  const counts=await one(env,"SELECT count(*) total,COALESCE(sum(kind='original'),0) originals,COALESCE(sum(kind='cover'),0) covers,COALESCE(sum(kind='dubbing'),0) dubbings FROM my_box_items WHERE box_id=?",bid);
  return json({box:{id:bid,name:b.name,revision:b.revision,is_private:true,...counts},items,total,nextOffset:offset+items.length<total?offset+items.length:null});
 }
 if(!action&&method==='DELETE')statements.push(query(env,'DELETE FROM my_boxes WHERE id=?',bid));
 else if(!action&&method==='PATCH'){
  const body=await req.json();if('is_public' in body||'visibility' in body)fail(400,'마이박스는 비공개 전용입니다.');
  if(body.revision!==undefined&&body.revision!==b.revision)fail(409,'마이박스가 변경됐어요. 다시 열어주세요.');
  statements.push(query(env,'UPDATE my_boxes SET name=? WHERE id=?',str(body.name,80),bid));
 }else if(action==='items'&&['PUT','DELETE'].includes(method)){
  const item=itemInput(await req.json());
  if(method==='PUT'){
   conditions.push(await contentAllowed(env,item,user.id));
   if(await one(env,'SELECT content_id FROM my_box_items WHERE box_id=? AND kind=? AND content_id=?',bid,item.kind,item.content_id))return json({ok:true,already_added:true});
   statements.push(addItem(env,bid,item));
  }else statements.push(query(env,'DELETE FROM my_box_items WHERE box_id=? AND kind=? AND content_id=?',bid,item.kind,item.content_id));
 }else if(action==='copy'&&method==='POST'){
  const body=await req.json(),item=itemInput(body),target=await box(env,str(body.target_id,100),user);
  if(!await one(env,'SELECT content_id FROM my_box_items WHERE box_id=? AND kind=? AND content_id=?',bid,item.kind,item.content_id))fail(404,'마이박스의 항목을 찾을 수 없습니다.');
  conditions.push(await contentAllowed(env,item,user.id),['EXISTS(SELECT 1 FROM my_boxes WHERE id=? AND user_id=? AND revision=?)',[target.id,user.id,target.revision]]);
  statements.push(addItem(env,target.id,item),touch(env,target));
 }else if(action==='move'&&method==='PUT'){
  const body=await req.json(),item=itemInput(body),direction=body.direction;if(![-1,1].includes(direction))fail(400,'순서를 확인해주세요.');
  const current=await one(env,'SELECT * FROM my_box_items WHERE box_id=? AND kind=? AND content_id=?',bid,item.kind,item.content_id);if(!current)fail(404,'항목을 찾을 수 없습니다.');
  const neighbor=await one(env,`SELECT * FROM my_box_items WHERE box_id=? AND position${direction<0?'<':'>'}? ORDER BY position ${direction<0?'DESC':'ASC'} LIMIT 1`,bid,current.position);
  if(neighbor)statements.push(query(env,'UPDATE my_box_items SET position=CASE WHEN kind=? AND content_id=? THEN ? ELSE ? END WHERE box_id=? AND ((kind=? AND content_id=?) OR (kind=? AND content_id=?))',item.kind,item.content_id,neighbor.position,current.position,bid,item.kind,item.content_id,neighbor.kind,neighbor.content_id));
 }else if(action==='order'&&method==='PUT'){
  const body=await req.json();if(!Array.isArray(body.items)||body.items.length>500)fail(400,'순서를 확인해주세요.');const items=body.items.map(itemInput),keys=items.map(itemKey),stored=await rows(env,'SELECT kind,content_id FROM my_box_items WHERE box_id=?',bid);
  if(new Set(keys).size!==keys.length||stored.length!==keys.length||stored.some(i=>!keys.includes(itemKey(i))))fail(409,'마이박스가 변경됐어요. 다시 열어주세요.');
  statements.push(query(env,"UPDATE my_box_items SET position=(SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE json_extract(value,'$.kind')=my_box_items.kind AND json_extract(value,'$.content_id')=my_box_items.content_id) WHERE box_id=?",JSON.stringify(items),bid));
 }else fail(405,'지원하지 않는 요청입니다.');
 statements.push(touch(env,b));await libraryTransaction(env,conditions,statements);return json({ok:true});
}
