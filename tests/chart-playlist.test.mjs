import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as policy from '../shared/playlist-policy.js';
import {fixture} from './fixture.mjs';

const source=file=>readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
const browse=source('browse.js');
const actions=source('actions.js');
const items=(...ids)=>ids.map(content_id=>({kind:'original',content_id}));
const endpoint='/api/playlists/from-chart';

function client({user={id:'owner'},post,quota=true}={}){
 const calls=[],messages=[],plays=[],input={value:'초기 제목',readOnly:false},close={disabled:false},error={scrollIntoView(){}};
 const button={innerHTML:'전체 담기',setAttribute(){},removeAttribute(){}};
 const form={elements:{name:input},isConnected:true,querySelector:s=>s==='[type="submit"]'?button:s.includes('form-error')?error:null};
 const modal={open:false,addEventListener(){},removeEventListener(){},close(){this.open=false;}};
 const c=nicknameContext({
  renderId:0,crypto:globalThis.crypto,me:user,location:{hash:'#charts?period=month'},icon:name=>'<svg data-test-icon="'+name+'"></svg>',
  formField:(label,key,type,value)=>'<label>'+label+'<input type="'+type+'" name="'+key+'" value="'+value+'"></label>',
  number:String,esc:String,URLSearchParams,accountReady:Promise.resolve(),shuffle:true,AifectPlaylist:policy,
  toast:s=>messages.push(s),window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},
  $:s=>({'#dialog':modal,'#dialog-close':close,'#chart-playlist-form':form,'#shuffle':{click(){c.shuffle=false;}}})[s],
  dialog(html){modal.open=true;c.html=html;input.value=html.match(/name="name" value="([^"]+)"/)[1];},
  askLogin(){calls.push('login');},refreshLibrary:async()=>{},canCreatePlaylist:()=>quota,formError:()=>error,uploadStage(){},
  FormData:class{get(){return input.value;}},
  api:async(path,method,body)=>{calls.push({path,method,body});return post?post():{id:'created'};},
  play:async(id,tracks)=>{plays.push({id,ids:Array.from(tracks,t=>t.id)});}
 });
 vm.runInContext(browse.slice(browse.indexOf('const chartPeriodLabels='),browse.indexOf('async function popularChartView(')),c);
 vm.runInContext(actions.slice(actions.indexOf('function busyForm('),actions.indexOf('function bindUploadForm(')),c);
 const tracks=Array.from({length:113},(_,i)=>({id:'track-'+i,kind:'original',duration:180}));
 return {c,calls,messages,plays,form,modal,button,input,close,error,view:{tracks,chartPeriod:'month',chartGenre:'Rock'},event:()=>({preventDefault(){},submitter:button})};
}

test('opening after navigation discards the previous chart',async()=>{
 const h=client();let finish;h.c.refreshLibrary=()=>new Promise(resolve=>finish=resolve);
 const opening=h.c.chartPlaylistDialog(h.view);h.c.renderId++;finish();await opening;
 assert.equal(h.modal.open,false);assert.equal(h.calls.length,0);
});

test('chart save shows only the full chart form, retains rank, and refreshes without navigating',async()=>{
 let finish,refreshes=0;
 const h=client({post:()=>new Promise(resolve=>finish=resolve)});
 h.c.refreshLibrary=async()=>{refreshes++;};
 await h.c.chartPlaylistDialog({...h.view,tracks:[...h.view.tracks,h.view.tracks[0]]});
 assert.match(h.c.html,/월간 · Rock · 전체 113곡/);
 assert.match(h.c.html,/인기차트 · 월간 · \d\d\.\d\d\.\d\d/);
 assert.match(h.c.html,/전체 113곡 담기/);
 assert.doesNotMatch(h.c.html,/checkbox|radio|type="search"|선택 지정|name="is_public"/);
 h.input.value='  ';h.form.oninput();assert.equal(h.button.disabled,true);
 h.input.value='같은 제목';h.form.oninput();assert.equal(h.button.disabled,false);
 const saving=h.form.onsubmit(h.event());await h.form.onsubmit(h.event());
 assert.equal(h.button.disabled,true);assert.equal(h.close.disabled,true);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].path,endpoint);
 assert.equal(h.calls[0].body.name,'같은 제목');
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].body.items)),items(...h.view.tracks.map(track=>track.id)));
 h.view.tracks.reverse();
 finish({id:'new-playlist'});await saving;
 assert.equal(h.c.location.hash,'#charts?period=month');
 assert.equal(h.modal.open,false);assert.equal(h.calls.length,1);assert.equal(refreshes,2);
 assert.match(h.messages[0],/저장했습니다/);
});

test('unconfirmed delivery retries the same request; a new modal can intentionally save the same name',async()=>{
 let requests=0;const h=client({post:()=>{if(++requests===1)throw TypeError('network');return {id:'saved'};}});
 await h.c.chartPlaylistDialog(h.view);
 const originalName=h.input.value;
 await h.form.onsubmit(h.event());
 assert.equal(h.modal.open,true);assert.equal(h.input.value,originalName);
 assert.match(h.error.textContent,/저장 결과/);assert.equal(h.input.readOnly,true);
 await h.form.onsubmit(h.event());
 assert.equal(h.calls[1].body.request_id,h.calls[0].body.request_id);assert.equal(h.modal.open,false);
 await h.c.chartPlaylistDialog(h.view);h.input.value=originalName;h.form.oninput();await h.form.onsubmit(h.event());
 assert.equal(h.calls[2].body.name,originalName);
 assert.notEqual(h.calls[2].body.request_id,h.calls[0].body.request_id);
});

test('known failures keep the title editable and a stale chart cannot submit',async()=>{
 const h=client({post:()=>{throw Object.assign(Error('차트에 현재 담을 수 없는 곡이 있습니다.'),{status:404});}});
 await h.c.chartPlaylistDialog(h.view);h.input.value='직접 입력';h.form.oninput();
 await h.form.onsubmit(h.event());
 assert.equal(h.modal.open,true);assert.equal(h.input.readOnly,false);assert.equal(h.input.value,'직접 입력');
 assert.match(h.error.textContent,/담을 수 없는 곡/);
 h.c.renderId++;await h.form.onsubmit(h.event());assert.equal(h.calls.length,1);
 assert.match(h.error.textContent,/차트 또는 계정/);
});

test('eligibility, empty snapshots and existing maximum are shown without silently truncating',async()=>{
 const guest=client({user:null});await guest.c.chartPlaylistDialog(guest.view);assert.deepEqual(guest.calls,['login']);
 const limited=client({quota:false});await limited.c.chartPlaylistDialog(limited.view);assert.equal(limited.modal.open,false);
 for(const count of [0,501]){
  const h=client();
  await h.c.chartPlaylistDialog({tracks:Array.from({length:count},(_,i)=>({id:String(i),kind:'original'})),chartKind:'releases'});
  assert.equal(h.button.disabled,true);
  assert.doesNotMatch(h.c.html,/undefined|주간|월간/);
  assert.match(h.c.html,count?/최대 500곡/:/담을 곡 없음/);
  await h.form.onsubmit(h.event());assert.equal(h.calls.length,0);
 }
 const h=client();
 await h.c.chartPlaylistDialog({chartKind:'covers',tracks:[{id:'cover',kind:'cover'},{id:'unsupported',kind:'unsupported'}]});
 assert.match(h.c.html,/커버차트/);assert.match(h.c.html,/저장 가능 1곡/);assert.match(h.c.html,/2곡 중 1곡은 현재 담을 수 없습니다/);
 await h.form.onsubmit(h.event());
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].body.items)),[{kind:'cover',content_id:'cover'}]);
});

test('both playback actions use the complete available chart once and do not change the chart order',async()=>{
 const h=client();
 const control=Object.fromEntries(['[data-chart-play-all]','[data-chart-shuffle]','[data-chart-playlist]'].map(key=>[key,{}]));
 const toolbar={querySelector:key=>control[key],isConnected:true},tracks=h.view.tracks;
 h.c.routeTracks=tracks.slice(0,8);
 h.c.bindChartToolbar({tracks:[...tracks,tracks[0],{id:'blocked',playable:false,duration:180}]},toolbar);
 await control['[data-chart-play-all]'].onclick();
 assert.deepEqual(h.plays[0],{id:tracks[0].id,ids:tracks.map(track=>track.id)});assert.equal(h.c.shuffle,false);
 await control['[data-chart-shuffle]'].onclick();
 assert.equal(h.plays[1].id,h.plays[1].ids[0]);assert.equal(h.plays[1].ids.length,113);
 assert.deepEqual(new Set(h.plays[1].ids),new Set(h.plays[0].ids));
 assert.equal(tracks[0].id,'track-0');
});

for(const kind of ['listens','covers','new'])for(const period of ['week','month','all'])test(`${kind}/${period}: scoped full chart saves all ranks atomically`,async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 const seed=f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,first_published_at,status,kind) VALUES(?,'owner','artist','producer',?,?,'QA',1,'wav',128,?,?,'published','original')");
 for(let i=0;i<115;i++)seed.run('rank-'+i,'RANK '+i,'Rock',at-i,at-i);
 seed.run('excluded','OTHER','Pop',at,at);
 const path=`/api/catalog?section=tracks&chart=${kind}&period=${period}&genre=Rock`;
 const partial=(await f.call(path)).body.tracks;
 const full=await f.call(path+'&full=1');assert.equal(full.status,200);
 const tracks=full.body.tracks;
 assert.ok(partial.length<=100);assert.ok(tracks.length>100);assert.ok(!tracks.some(t=>t.id==='excluded'));
 const payload={name:'차트',items:tracks.map(t=>({kind:t.kind,content_id:t.id})),request_id:'full-snapshot',is_public:true};
 const r=await f.call(endpoint,'POST',payload);assert.equal(r.status,201);
 const saved=await f.call('/api/playlists/'+r.body.id);
 assert.deepEqual(saved.body.tracks.map(t=>t.id),tracks.map(t=>t.id));assert.equal(saved.body.playlist.is_public,0);
 assert.equal(saved.body.playlist.item_count,tracks.length);
 assert.ok((await f.call('/api/me/music-library?section=playlists&filter=mine')).body.items.some(p=>p.id===r.body.id));
 assert.equal((await f.call('/api/playlists/'+r.body.id,'GET',null,'other')).status,404);
});

test('chart retries are atomic and same-title saves with different request IDs remain separate',async t=>{
 const f=await fixture(t),name='같은 차트';
 const save=(requestId,selection=items('one','three'),user='owner')=>f.call(endpoint,'POST',{name,items:selection,request_id:requestId},user);
 const results=await Promise.all([save('same'),save('same')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].body.id,results[1].body.id);
 assert.equal((await save('same',items('three'))).status,409);
 const another=await save('another');assert.equal(another.status,201);assert.notEqual(another.body.id,results[0].body.id);
 assert.equal((await save('changed',items('one','hidden'))).status,404);
 assert.equal((await save('empty',[])).status,400);
 assert.equal((await save('guest',items('one'),null)).status,401);
 assert.equal((await f.call(endpoint,'POST',{name,items:items('one')})).status,400);
 f.sql.exec("CREATE TRIGGER break_chart BEFORE INSERT ON playlist_tracks WHEN NEW.track_id='three' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.equal((await save('batch-failed')).status,500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,2);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,4);
 f.sql.exec("DROP TRIGGER break_chart; UPDATE tracks SET kind='cover' WHERE id='three';");
 const cover=await save('cover',[{kind:'cover',content_id:'three'}]);assert.equal(cover.status,201);
 assert.equal((await f.call('/api/playlists/'+cover.body.id,'PATCH',{is_public:true})).status,400);
});

test('default names use the Korean creation day at midnight and omit a missing period',()=>{
 const {c}=client();
 assert.equal(c.chartDate(new Date('2026-10-31T14:59:59Z'),true),'26.10.31');
 assert.equal(c.chartDate(new Date('2026-10-31T15:00:00Z'),true),'26.11.01');
 assert.match(c.chartDefaultName({chartKind:'releases'}),/^신곡차트 · \d\d\.\d\d\.\d\d$/);
});
