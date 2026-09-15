import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRange} from '../server/media.js';
const origin='http://127.0.0.1:4174';
const stamp=Date.now();
async function call(path,{method='GET',body,cookie,headers={}}={}){const r=await fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const data=await r.json();return {r,data};}
async function register(n){const {r,data}=await call('/api/auth/register',{method:'POST',body:{name:'테스트 '+n,email:`qa-${stamp}-${n}@example.test`,password:'Aifect-local-test-2026'}});assert.equal(r.status,200,JSON.stringify(data));return {cookie:r.headers.get('set-cookie').split(';')[0],user:data.user};}
test('range parsing rejects invalid/multiple/out-of-bounds and supports suffix',()=>{assert.deepEqual(parseRange('bytes=2-5',10),{offset:2,length:4});assert.deepEqual(parseRange('bytes=-3',10),{offset:7,length:3});assert.deepEqual(parseRange('bytes=5-',10),{offset:5,length:5});assert.equal(parseRange('bytes=10-',10),false);assert.equal(parseRange('bytes=0-1,3-4',10),false);assert.equal(parseRange('bytes=-',10),false);});
test('real API: sessions, ownership, R2, preview, likes, comments, follows, playlists',async()=>{
 const owner=await register('owner'),other=await register('other');let out;
 assert.equal((await call('/api/me',{cookie:owner.cookie})).data.user.id,owner.user.id);
 assert.equal((await call('/api/library')).r.status,401);
 assert.equal((await call('/api/playlists',{method:'POST',body:{name:'CSRF'},cookie:owner.cookie,headers:{Origin:'https://evil.invalid'}})).r.status,403);
 const upload={title:'API 검증용 신호',artist:'검증 아티스트',producer:'검증 제작자',genre:'Instrumental',tags:'test',description:'Local test fixture',ai_tool:'Test fixture',participation:'',rights:true,is_ai:true,extension:'wav',bytes:128};
 assert.equal((await call('/api/uploads',{method:'POST',cookie:owner.cookie,body:{...upload,rights:false}})).r.status,400);
 out=await call('/api/uploads',{method:'POST',cookie:owner.cookie,body:upload});assert.equal(out.r.status,201,JSON.stringify(out.data));const tid=out.data.id;
 assert.equal((await call(`/api/uploads/${tid}/complete`,{method:'POST',cookie:other.cookie})).r.status,404);
 let r=await fetch(origin+`/api/uploads/${tid}/audio`,{method:'PUT',headers:{Origin:origin,Cookie:owner.cookie,'Content-Type':'audio/wav'},body:new Uint8Array(128)});assert.equal(r.status,200,await r.text());
 assert.equal((await call(`/api/uploads/${tid}/complete`,{method:'POST',cookie:owner.cookie})).r.status,200);
 const internal={Authorization:'Bearer local-transcoder-test'};
 out=await call('/internal/jobs/claim',{method:'POST',body:{},headers:internal});assert.equal(out.data.job.id,tid);const token=out.data.job.lease_token;
 for(const kind of ['stream','preview']){r=await fetch(origin+`/internal/jobs/${tid}/${kind}`,{method:'PUT',headers:{...internal,'x-job-token':token},body:new Uint8Array(kind==='stream'?2000:1000)});assert.equal(r.status,200,await r.text());}
 out=await call(`/internal/jobs/${tid}/finish`,{method:'POST',body:{duration:70},headers:{...internal,'x-job-token':token}});assert.equal(out.r.status,200,JSON.stringify(out.data));
 const tr=(await call('/api/tracks/'+tid)).data.track;
 assert.equal((await call(`/media/${tid}/stream`)).r.status,401);
 r=await fetch(origin+`/media/${tid}/preview`,{headers:{Range:'bytes=0-99'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,100);assert.equal(r.headers.get('content-range'),'bytes 0-99/1000');
 assert.equal((await fetch(origin+`/media/${tid}/stream`,{headers:{Cookie:owner.cookie}})).status,200);
 for(let i=0;i<2;i++)assert.equal((await call(`/api/tracks/${tid}/like`,{method:'PUT',cookie:owner.cookie})).r.status,200);
 assert.equal((await call('/api/tracks/'+tid)).data.track.likes,1);
 assert.equal((await call(`/api/artists/${tr.artist_id}/follow`,{method:'PUT',cookie:owner.cookie})).r.status,200);
 out=await call(`/api/tracks/${tid}/comments`,{method:'POST',cookie:owner.cookie,body:{body:'첫 댓글',timestamp:20}});assert.equal(out.r.status,201);const cid=out.data.id;
 assert.equal((await call(`/api/comments/${cid}`,{method:'PATCH',cookie:other.cookie,body:{body:'탈취'}})).r.status,403);
 assert.equal((await call(`/api/comments/${cid}`,{method:'PATCH',cookie:owner.cookie,body:{body:'수정 댓글'}})).r.status,200);
 assert.equal((await call(`/api/tracks/${tid}/comments`,{method:'POST',cookie:other.cookie,body:{body:'답글',parent_id:cid}})).r.status,201);
 assert.equal((await call(`/api/tracks/${tid}/comments`)).data.comments.length,2);
 out=await call('/api/playlists',{method:'POST',cookie:owner.cookie,body:{name:'내 비공개 목록',is_public:false}});assert.equal(out.r.status,201);const pid=out.data.id;
 assert.equal((await call(`/api/playlists/${pid}/tracks/${tid}`,{method:'PUT',cookie:owner.cookie})).r.status,200);
 assert.equal((await call('/api/playlists/'+pid,{cookie:other.cookie})).r.status,404);
 assert.equal((await call('/api/playlists/'+pid,{method:'PATCH',cookie:owner.cookie,body:{name:'공개 목록',is_public:true}})).r.status,200);
 assert.equal((await call('/api/playlists/'+pid)).data.tracks.length,1);
 assert.equal((await call('/api/playlists/'+pid,{method:'DELETE',cookie:other.cookie})).r.status,403);
 out=await call(`/api/playback/${tid}`,{method:'POST'});assert.equal(out.data.preview,true);assert.equal(out.data.src,`/media/${tid}/preview`);
 assert.equal((await call(`/api/listens/${out.data.id}`,{method:'PATCH',body:{seconds:65}})).r.status,400);
 assert.equal((await call(`/api/uploads/${tid}/unpublish`,{method:'POST',cookie:owner.cookie})).r.status,200);
 assert.equal((await fetch(origin+`/media/${tid}/preview`)).status,404);
 assert.equal((await call('/api/auth/logout',{method:'POST',cookie:owner.cookie})).r.status,200);
 assert.equal((await call('/api/me',{cookie:owner.cookie})).data.user,null);
});
