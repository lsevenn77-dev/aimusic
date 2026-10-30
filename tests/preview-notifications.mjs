// Real application with disposable local D1/R2 and synthetic accounts only.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {fixture} from './fixture.mjs';

const before=process.argv.includes('--before'),base=resolve(before?'work/before-source':'.'),port=before?4199:4198;
const config=JSON.parse(readFileSync(resolve(base,'dist/server/wrangler.json'),'utf8'));
const cleanup=[],f=await fixture({after(fn){cleanup.push(fn);}}),at=Math.floor(Date.now()/1000);
f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','로컬 검증 음악가',0);UPDATE producers SET name='로컬 검증 계정' WHERE id='producer';UPDATE artists SET name='로컬 검증 아티스트';UPDATE tracks SET title='아주 긴 작품 제목도 작은 화면에서 자연스럽게 표시되는지 확인하는 로컬 검증용 노래',duration=60;INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','로컬 검증 크루',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0)");
const kinds=[['fan_comment','fan','reply'],['fan_post','fan','post'],['artist_follower','artist','artist'],['artist_release','song','one'],['cover','song','two'],['duet','song','three'],['crew_invite','crew','crew'],['crew_approved','crew','crew'],['crew_request','crew','crew'],['dubbing_complete','dubbing','unavailable-dub'],['work_status','work','hidden'],['comment','song','one'],['follow','song','friend']];
f.sql.prepare("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,body,request_id,created) VALUES('post','artist','owner','lounge','로컬 검증 응원글','post',?)").run(at);
f.sql.prepare("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,body,parent_id,reply_to_id,request_id,created) VALUES('reply','artist','other','lounge','로컬 검증 댓글입니다. 정확한 댓글 위치로 이동해야 합니다.','post','post','reply',?)").run(at);
f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('qa-comment','one','other','로컬 검증 음악 댓글',?)").run(at);
f.sql.prepare("INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created,crew_invite_id) VALUES('qa-invite','other','owner','로컬 검증 크루 초대','qa-invite',?,'crew')").run(at);
f.sql.prepare("INSERT INTO crew_participation_requests(id,crew_id,sender,recipient,track_id,created) VALUES('qa-request','crew','other','owner','one',?)").run(at);
f.sql.exec('DELETE FROM activity_notifications;DELETE FROM push_outbox');
for(const [i,[kind,targetKind,target]] of kinds.entries())f.sql.prepare('INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,entity_id,artist_id,source_title,detail,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('qa-'+i,'owner',kind==='work_status'?null:'other',kind,target,targetKind,kind==='crew_request'?'qa-request':kind==='crew_invite'?'qa-invite':kind==='comment'?'qa-comment':'post','artist','로컬 검증 · 긴 작품명과 아티스트 이름 표시 확인',kind==='work_status'?'처리 결과 안내와 조치 방법이 자연스럽게 줄바꿈되는지 확인합니다.':'',at-i*60);
f.sql.prepare("INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,gift_name,quantity,currency,amount,created) VALUES('qa-gift','owner','other','gift','one','왕관',1,'gold',777,?)").run(at-900);
f.sql.exec('DELETE FROM push_outbox');

const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,scriptPath:resolve(base,'dist/server/index.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:['nodejs_compat'],port:0,host:'127.0.0.1',d1Databases:['DB'],r2Buckets:['BUCKET'],assets:{...config.assets,directory:resolve(base,'dist/client'),routerConfig:{has_user_worker:true}}}),handleStructuredLogs:e=>console.log(JSON.stringify(e))});
await mf.ready;const db=await mf.getD1Database('DB');
const schema=f.sql.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all();
for(const {sql} of schema)await db.prepare(sql).run();
const triggers=f.sql.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
for(const {name} of triggers)await db.prepare('DROP TRIGGER "'+name.replaceAll('"','""')+'"').run();
const inserts=[];
for(const {name} of f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())for(const row of f.sql.prepare('SELECT * FROM "'+name+'"').all()){
 const keys=Object.keys(row);inserts.push(db.prepare('INSERT INTO "'+name+'"('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])));
}
await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...inserts]);
for(const {sql} of triggers)await db.prepare(sql).run();
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/__qa/login'){res.writeHead(302,{'Set-Cookie':'aifect_session=owner; Path=/; HttpOnly; SameSite=Strict',Location:'/#notifications'});res.end();return;}
  const parts=[];for await(const p of req)parts.push(p);
  const response=await mf.dispatchFetch('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,...(parts.length?{body:Buffer.concat(parts)}:{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500,{'content-type':'text/plain'});res.end(String(e));}
});
await new Promise(r=>server.listen(port,'127.0.0.1',r));console.log('Local notification QA '+(before?'BEFORE':'AFTER')+': http://127.0.0.1:'+port+'/__qa/login');
const stop=async()=>{await new Promise(r=>server.close(r));await mf.dispose();cleanup.forEach(fn=>fn());};
process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
