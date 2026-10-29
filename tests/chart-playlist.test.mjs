import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=n=>readFileSync(new URL('../dist/'+n,import.meta.url),'utf8');
function client({user={id:'owner'},range='top20',post,quota=true}={}){
 const calls=[],messages=[],button={innerHTML:'만들기',setAttribute(){},removeAttribute(){}},cancel={},error={scrollIntoView(){}},values=new Map([['name','월간 인기 차트'],['range',range]]);
 let shown=false;
 const form={querySelector:s=>s==='[data-chart-cancel]'?cancel:s.includes('form-error')?error:null},modal={open:false,addEventListener(){},removeEventListener(){},close(){this.open=false;}};
 const c=vm.createContext({renderId:0,me:user,location:{hash:'#charts?period=month'},chartTabs:()=>'',icon:()=>'',number:String,esc:String,formField:()=>'',formError:()=>error,uploadStage(){},toast:s=>messages.push(s),window:{addEventListener(){},removeEventListener(){}},
  $:s=>s==='#dialog'?modal:s==='#chart-playlist-form'&&shown?form:null,
  dialog(html){shown=true;modal.open=true;c.html=html;},askLogin(){calls.push('login');},refreshLibrary:async()=>{},canCreatePlaylist:()=>quota,
  FormData:class{get(k){return values.get(k);}},api:async(path,method,body)=>{calls.push({path,method,body});return post?post():{id:'created'};}
 });
 const b=source('browse.js');vm.runInContext(b.slice(b.indexOf('const chartPeriodLabels='),b.indexOf('async function popularChartView(')),c);
 const a=source('actions.js');vm.runInContext(a.slice(a.indexOf('function busyForm('),a.indexOf('function bindUploadForm(')),c);
 return {c,calls,messages,form,modal,button,event:()=>({preventDefault(){},submitter:button}),tracks:Array.from({length:113},(_,i)=>({id:'track-'+i})),values};
}
test('an old chart dialog is discarded when its library read finishes after navigation',async()=>{
 const h=client();let finish;h.c.refreshLibrary=()=>new Promise(resolve=>finish=resolve);
 const opening=h.c.chartPlaylistDialog({tracks:h.tracks,chartPeriod:'week'});h.c.renderId++;finish();await opening;
 assert.equal(h.modal.open,false);assert.equal(h.calls.length,0);
});

test('chart playlist snapshots rank order and submits once under repeated create clicks',async()=>{
 let finish;const h=client({post:()=>new Promise(r=>finish=r)});
 await h.c.chartPlaylistDialog({tracks:h.tracks,chartKind:'',chartPeriod:'month'});
 assert.match(h.c.html,/상위 20곡/);assert.match(h.c.html,/차트 전체/);assert.match(h.c.html,/113곡/);
 const p=h.form.onsubmit(h.event()),duplicate=h.form.onsubmit(h.event());
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.is_public,false);assert.deepEqual(Array.from(h.calls[0].body.track_ids),h.tracks.slice(0,20).map(t=>t.id));
 finish({id:'new-playlist'});await Promise.all([p,duplicate]);assert.equal(h.c.location.hash,'#playlist/new-playlist');assert.equal(h.modal.open,false);assert.equal(h.calls.length,1);
});
test('all selected chart songs keep order; cancellation and unauthenticated access never create',async()=>{
 const h=client({range:'all'});await h.c.chartPlaylistDialog({tracks:h.tracks,chartKind:'releases',chartPeriod:'all'});
 h.tracks.reverse();await h.form.onsubmit(h.event());assert.deepEqual(Array.from(h.calls[0].body.track_ids),Array.from({length:113},(_,i)=>'track-'+i));
 const cancel=client();await cancel.c.chartPlaylistDialog({tracks:cancel.tracks,chartPeriod:'week'});cancel.form.querySelector('[data-chart-cancel]').onclick();assert.equal(cancel.modal.open,false);assert.equal(cancel.calls.length,0);
 const guest=client({user:null});await guest.c.chartPlaylistDialog({tracks:guest.tracks,chartPeriod:'week'});assert.deepEqual(guest.calls,['login']);
});
test('quota, empty charts and existing 500-song limit fail without creating or silently truncating',async()=>{
 const limited=client({quota:false});await limited.c.chartPlaylistDialog({tracks:limited.tracks,chartPeriod:'week'});assert.equal(limited.calls.length,0);
 for(const count of [0,501]){const h=client({range:'all'});await h.c.chartPlaylistDialog({tracks:Array.from({length:count},(_,i)=>({id:String(i)})),chartPeriod:'week'});await h.form.onsubmit(h.event());assert.equal(h.calls.length,0);assert.ok(h.messages.length||h.form.querySelector('.form-error').textContent);}
});
test('existing playlist API creates top20 and complete chart atomically with original order and ownership',async t=>{
 const f=await fixture(t);
 for(let i=0;i<30;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,?,'published')").run('song'+i,'song'+i,i);
 const chart=(await f.call('/api/catalog?section=tracks&chart=top&period=month&full=1')).body.tracks;
 for(const ids of [chart.slice(0,20).map(t=>t.id),chart.map(t=>t.id)]){
  const r=await f.call('/api/playlists','POST',{name:'AIFECT 월간',track_ids:ids,is_public:false});assert.equal(r.status,201);
  const p=await f.call('/api/playlists/'+r.body.id);assert.deepEqual(p.body.tracks.map(t=>t.id),ids);assert.equal(p.body.playlist.user_id,'owner');assert.equal((await f.call('/api/playlists/'+r.body.id,'GET',undefined,'other')).status,404);
 }
 const before=f.sql.prepare('SELECT * FROM playlist_tracks ORDER BY playlist_id,position').all();
 assert.equal((await f.call('/api/playlists','POST',{name:'over quota',track_ids:['one']})).status,409);
 assert.deepEqual(f.sql.prepare('SELECT * FROM playlist_tracks ORDER BY playlist_id,position').all(),before);
 assert.equal((await f.call('/api/playlists','POST',{name:'guest'},null)).status,401);
});
test('chart period selection reaches every ranked API without changing seven-day growth or scoring weights',async t=>{
 const f=await fixture(t);
 for(const kind of ['top','rising','releases'])for(const period of ['week','month','all']){
  const r=await f.call(`/api/catalog?section=tracks&chart=${kind}&period=${period}&full=1`);assert.equal(r.status,200);assert.equal(r.body.chart.period,period);assert.deepEqual(r.body.chart.weights,{plays:55,reactions:25,covers:20});
 }
 assert.equal((await f.call('/api/catalog?chart=rising&period=invalid')).status,400);
});
