import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
import {searchGenres,canonicalGenre} from '../shared/genres.js';
import {ORIGINAL_UPLOAD_TERMS_VERSION} from '../shared/site-info.js';

const upload={title:'검증 제작곡',producer:'QA',artist_id:'none',genres:['록','Custom Fusion','rock','Jazz'],moods:['drive'],classification_mode:'manual',ai_tool:'AI 사용 안 함',is_ai:false,rights:true,karaoke:true,upload_consent_version:ORIGINAL_UPLOAD_TERMS_VERSION,extension:'wav',bytes:128};
const key=(id,part)=>'/api/uploads/'+id+'/'+part;
const track=(sql,id)=>sql.prepare('SELECT * FROM tracks WHERE id=?').get(id);
const job=(sql,id)=>sql.prepare('SELECT * FROM lyric_jobs WHERE track_id=?').get(id);

test('registration stores deduplicated genre order and requires a cover for the updated client',async t=>{
 const {call,sql}=await fixture(t,{BUCKET:{head:async()=>({size:128})}});
 assert.ok(searchGenres('힙합').includes('Hip-Hop'));assert.equal(canonicalGenre('케이 팝'),'K-POP');assert.ok(searchGenres('Gugak').includes('국악'));
 assert.equal((await call('/api/uploads','POST',{...upload,genres:[]})).status,400);
 const payload={...upload,request_id:crypto.randomUUID(),lyrics_mode:'no_lyrics'};
 const created=await call('/api/uploads','POST',payload);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.id;
 assert.equal((await call('/api/uploads','POST',payload)).body.id,id);
 let row=track(sql,id);
 assert.deepEqual([row.genre,JSON.parse(row.genres_json),row.classification_source],['Rock',['Rock','Custom Fusion','Jazz'],'manual']);
 assert.equal((await call(key(id,'complete'),'POST')).status,409);
 sql.prepare("UPDATE tracks SET has_cover=1,cover_version='test' WHERE id=?").run(id);
 assert.equal((await call(key(id,'complete'),'POST',{require_cover:true})).status,200);
 row=track(sql,id);
 assert.equal(row.status,'queued');assert.equal(job(sql,id),undefined);
 sql.prepare("UPDATE tracks SET status='published',duration=60 WHERE id=?").run(id);
 const detail=await call('/api/tracks/'+id);
 assert.deepEqual(detail.body.track.genres,['Rock','Custom Fusion','Jazz']);
 const catalog=await call('/api/catalog?genre=Custom%20Fusion');
 assert.ok(catalog.body.tracks.some(t=>t.id===id));
});

test('absent, deferred, manual and automatic lyrics have distinct server and Studio behavior',async t=>{
 const {call,sql}=await fixture(t),ids={};
 const legacy=track(sql,'one');
 for(const mode of ['no_lyrics','later','synced','auto']){
  const result=await call('/api/uploads','POST',{...upload,lyrics_mode:mode,
   lyrics:mode==='synced'?'[00:03]한 줄':'',lyrics_language:'ko',lyrics_source:'[후렴]\n한 줄\n한 줄'});
  assert.equal(result.status,201,JSON.stringify(result.body));ids[mode]=result.body.id;
  const resultTrack=track(sql,ids[mode]),alignment=job(sql,ids[mode]);
  if(mode==='auto'){assert.equal(alignment.state,'queued');assert.equal(alignment.source_text,'한 줄\n한 줄');}
  else{assert.equal(resultTrack.lyrics_mode,mode);assert.equal(alignment,undefined);}
 }
 const studio=(await call('/api/studio')).body.tracks;
 for(const mode of ['no_lyrics','later']){const row=studio.find(t=>t.id===ids[mode]);assert.equal(row.lyrics_mode,mode);assert.equal(row.alignment_state,null);}
 assert.equal(track(sql,ids.synced).lyrics,'[00:03.000]한 줄');
 assert.deepEqual(track(sql,'one'),legacy);
 const auto=ids.auto;
 sql.prepare("UPDATE lyric_jobs SET state='failed',error='fixture' WHERE track_id=?").run(auto);
 const change=await call('/api/studio/tracks/'+auto,'PUT',{title:'metadata only',artist_id:'none'});
 assert.equal(change.status,200,JSON.stringify(change.body));assert.equal(job(sql,auto).state,'failed');
 const later=ids.later;
 const newLyrics=await call('/api/studio/tracks/'+later,'PUT',{title:'new lyrics',artist_id:'none',lyrics_mode:'auto',lyrics_source:'이제 가사가 있습니다.'});
 assert.equal(newLyrics.status,200);assert.equal(job(sql,later).state,'queued');
});

test('explicit analysis uses the selected file and accepts no anonymous or invalid requests',async t=>{
 const f=await fixture(t);
 const env={DB:f.DB,GEMINI_API_KEY:'fixture-only'};
 const originalFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
  const payload=JSON.parse(init.body);
  const audio=payload.input.find(input=>input.type==='audio');
  assert.equal(audio.mime_type,'audio/wav');
  assert.equal(Buffer.from(audio.data,'base64').length,128);
  assert.equal(payload.store,false);
  return Response.json({output_text:JSON.stringify({genres:['Jazz','Soul'],moods:[],reason:'fixture',suggested_genre:''})});
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 const request=(ext,user)=>worker.fetch(new Request('https://aifect.test/api/studio/upload-genre-analysis?ext='+ext,{method:'POST',headers:{Origin:'https://aifect.test','Content-Length':'128',...(user?{Cookie:'aifect_session='+user}:{})},body:new Uint8Array(128)}),env,{waitUntil(){}});
 assert.equal((await request('wav')).status,401);
 assert.equal((await request('ogg','owner')).status,400);
 const response=await request('wav','owner');
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{genres:['Jazz','Soul']});assert.equal(calls,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM music_classification_jobs').get().n,0);
});

test('large upload streams to the model file service and cleans up its temporary file',async t=>{
 const f=await fixture(t),originalFetch=globalThis.fetch,originalStream=globalThis.FixedLengthStream;
 const length=14*1024*1024+1,api='https://generativelanguage.googleapis.com',fileUrl=api+'/v1beta/files/test-file',calls=[];
 globalThis.FixedLengthStream=class{
  constructor(expected){assert.equal(expected,length);const stream=new TransformStream();this.readable=stream.readable;this.writable=stream.writable;}
 };
 globalThis.fetch=async(raw,init)=>{
  const url=String(raw);calls.push([url,init.method]);
  if(url===api+'/upload/v1beta/files'){
   assert.equal(init.headers['x-goog-upload-header-content-type'],'audio/flac');
   assert.equal(init.headers['x-goog-upload-header-content-length'],String(length));
   return new Response(null,{headers:{'x-goog-upload-url':api+'/upload-session'}});
  }
  if(url===api+'/upload-session'){
   assert.equal(init.headers['x-goog-upload-command'],'upload, finalize');
   assert.equal((await new Response(init.body).arrayBuffer()).byteLength,length);
   return Response.json({file:{name:'files/test-file',uri:fileUrl,state:'ACTIVE'}});
  }
  if(url===api+'/v1beta/interactions'){
   assert.deepEqual(JSON.parse(init.body).input[1],{type:'audio',mime_type:'audio/flac',uri:fileUrl});
   return Response.json({output_text:JSON.stringify({genres:['Pop'],moods:[],reason:'fixture',suggested_genre:''})});
  }
  assert.equal(url,fileUrl);assert.equal(init.method,'DELETE');return new Response(null,{status:204});
 };
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.FixedLengthStream=originalStream;});
 const response=await worker.fetch(new Request('https://aifect.test/api/studio/upload-genre-analysis?ext=flac',{
  method:'POST',headers:{Origin:'https://aifect.test','Content-Length':String(length),Cookie:'aifect_session=owner'},body:new Uint8Array(length)
 }),{DB:f.DB,GEMINI_API_KEY:'fixture-only'},{waitUntil(){}});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{genres:['Pop']});
 assert.deepEqual(calls.map(([,method])=>method),['POST','POST','POST','DELETE']);
});
