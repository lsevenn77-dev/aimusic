// Optional integration check against TWO already-running LOCAL Wrangler workers.
// Creates disposable accounts/rooms only in the local D1 stores. Does not test audio.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import WebSocket from 'ws';
const origin='http://127.0.0.1:4205';
await mkdir('.sites-runtime',{recursive:true});
let accounts;
try{accounts=JSON.parse(await readFile('.sites-runtime/voice-local-accounts.json','utf8'));}
catch{accounts=['host','guest'].map((role,i)=>({email:`voice-${role}@example.test`,name:i?'게스트테스트':'라운지테스트',password:crypto.randomUUID()}));await writeFile('.sites-runtime/voice-local-accounts.json',JSON.stringify(accounts));}
async function call(account,path,body,method=body?'POST':'GET',expected=200){
 const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(account?.cookie?{cookie:account.cookie}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);
 if(r.headers.has('set-cookie'))account.cookie=r.headers.get('set-cookie').split(';')[0];return data;
}
for(const a of accounts){
 const exists=await fetch(origin+'/api/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(a)});
 assert.ok([200,409].includes(exists.status),await exists.text());
 await call(a,'/api/auth/login',a);a.user=(await call(a,'/api/me/profile',{name:a.name,bio:'로컬 기능 검증용 계정'},'PUT')).user;
}
const [host,guest]=accounts,room=crypto.randomUUID(),path='/api/voice/rooms/'+room+'/';
await call(host,'/api/voice/rooms',{request_id:room,title:'음악을 나누는 라운지',visibility:'private'},'POST',201);
const a=await call(host,path+'join',{request_id:crypto.randomUUID()});
await call(guest,path+'join',{request_id:crypto.randomUUID()},'POST',403);
await call(host,path+'invite',{generation:a.generation,profile_id:guest.user.profile_id,request_id:crypto.randomUUID()},'POST',201);
await call(host,path+'chat',{generation:a.generation,body:'입장 전 대화',request_id:crypto.randomUUID()});
const b=await call(guest,path+'join',{request_id:crypto.randomUUID()});
assert.deepEqual(b.chat,[]);
const ws=new WebSocket(origin.replace('http','ws')+path+'socket',{headers:{cookie:guest.cookie,origin}});
try{
 await once(ws,'open',{signal:AbortSignal.timeout(8000)});
 const changed=once(ws,'message',{signal:AbortSignal.timeout(8000)});
 await call(host,path+'chat',{generation:a.generation,body:'함께 음악 이야기해요 🎵',request_id:crypto.randomUUID()});
 assert.equal(JSON.parse((await changed)[0]).type,'changed');
 assert.equal((await call(guest,path+'heartbeat',{generation:b.generation})).chat.at(-1).body,'함께 음악 이야기해요 🎵');
 await call(guest,path+'request-mic',{generation:b.generation});
 const approved=await call(host,path+'approve-mic',{generation:a.generation,target_id:guest.user.id});
 assert.equal(approved.members.find(m=>m.id===guest.user.id).seat,0);
 await call(guest,path+'moderate',{generation:b.generation,target_id:host.user.id,operation:'kick'},'POST',403);
 await call(host,path+'moderate',{generation:a.generation,target_id:guest.user.id,operation:'mute'});
 assert.equal((await call(guest,path+'heartbeat',{generation:b.generation})).members.find(m=>m.id===guest.user.id).locked,true);
 await call(host,path+'close',{generation:a.generation});
 await call(guest,path+'heartbeat',{generation:b.generation},'POST',404);
 console.log('PASS: local D1 + Durable Object + authenticated WebSocket + private invite + admission-only chat + seats + moderation + close. No real audio tested.');
}finally{ws.terminate();}
// A public room remains while a listener is present, and disappears on final departure.
const review=crypto.randomUUID(),reviewPath='/api/voice/rooms/'+review+'/';
await call(host,'/api/voice/rooms',{request_id:review,title:'토킹룸 종료 확인',visibility:'public'},'POST',201);
const first=await call(host,reviewPath+'join',{request_id:crypto.randomUUID()}),second=await call(guest,reviewPath+'join',{request_id:crypto.randomUUID()});
await call(host,reviewPath+'leave',{generation:first.generation});
assert.ok((await call(guest,'/api/voice/rooms')).rooms.some(r=>r.id===review));
await call(guest,reviewPath+'leave',{generation:second.generation});
assert.ok(!(await call(host,'/api/voice/rooms')).rooms.some(r=>r.id===review));
await call(host,reviewPath+'join',{request_id:crypto.randomUUID()},'POST',404);
console.log('PASS: final departure closes the public room and removes it from the directory.');
