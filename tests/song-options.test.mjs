import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function menu(user='owner',liked=false){
 const listeners={},c=vm.createContext({me:user?{id:user}:null,trackMap:new Map([['one',{id:'one',user_id:'owner',title:'<Song "title">',kind:'original'}]]),esc,icon:n=>`<svg data-icon="${n}"></svg>`,liked:()=>liked,dialog:html=>{c.html=html;},paintInteractions:()=>{},$:()=>({addEventListener:(name,fn)=>listeners[name]=fn})});
 vm.runInContext(source('gifts.js').split('\n').slice(0,2).join('\n'),c);
 const text=source('explorer.js');vm.runInContext(text.slice(text.indexOf('function trackMenu('),text.indexOf('function queueDialog(')),c);
 c.trackMenu('one');return {c,listeners};
}
test('shared menu keeps action contracts, order, ownership and escaped confirmation metadata',()=>{
 const own=menu().c.html,other=menu('other',true).c.html,guest=menu(null).c.html;
 assert.doesNotMatch(own,/<h[1-6]|<img|<header/);
 assert.match(own,/data-delete-track="one" data-track-title="&lt;Song &quot;title&quot;&gt;"/);
 assert.doesNotMatch(other,/data-delete-track/);assert.doesNotMatch(guest,/data-delete-track/);
 assert.match(other,/aria-pressed="true"/);assert.match(other,/좋아요 해제/);assert.match(own,/좋아요<\/span>/);
 const attrs=['data-play=','data-queue-insert=','data-placement="last"','data-add=','data-like=','data-gift=','href="#song/one"'];
 let previous=-1;for(const attr of attrs){const position=other.indexOf(attr);assert.ok(position>previous,attr);previous=position;}
 assert.ok(own.indexOf('data-delete-track')>own.indexOf('href="#song/one"'));
 // Existing self-gift policy stays intact.
 assert.doesNotMatch(own,/data-gift/);assert.match(guest,/data-gift/);
});
test('backdrop closes options only when clicking outside its bounds',()=>{
 const {listeners}=menu();let closed=0;const modal={querySelector:()=>true,getBoundingClientRect:()=>({left:20,right:380,top:100,bottom:450}),close:()=>closed++};
 for(const [x,y] of [[30,110],[0,0]])listeners.click({currentTarget:modal,target:modal,clientX:x,clientY:y});
 assert.equal(closed,1);
 modal.querySelector=()=>false;listeners.click({currentTarget:modal,target:modal,clientX:0,clientY:0});assert.equal(closed,1);
});

test('chart menu reuses existing song actions in an anchored popover, never adds chart playlist creation',()=>{
 const {c}=menu('other');let anchorReceived;
 c.chartTrackPopover=(html,anchor)=>{c.html=html;anchorReceived=anchor;};const anchor={};c.trackMenu('one',anchor);
 assert.equal(anchorReceived,anchor);
 for(const action of ['data-play="one"','data-add="one"','data-share="one"','data-report-track="one"','data-queue-insert="one"'])assert.ok(c.html.includes(action));
 assert.doesNotMatch(c.html,/data-chart-playlist|플리 만들기|data-delete-track/);
});
function deletion(fail=false){
 const calls=[],form={},removed=[],c=vm.createContext({esc,dialog:html=>{c.html=html;},$:selector=>selector==='#delete-track-form'?form:{close:()=>calls.push('close')},busyForm:(_,fn)=>fn,uploadRequest:async()=>{calls.push('delete');if(fail)throw Error('삭제 실패');},invalidateReads:()=>calls.push('invalidate'),current:{id:'cover',original_id:'one'},closePlayer:()=>calls.push('stop'),queue:['one','cover','safe'],trackMap:new Map([['one',{id:'one'}],['cover',{id:'cover',original_id:'one'}],['safe',{id:'safe'}]]),routeTracks:[{id:'one'},{id:'cover',original_id:'one'},{id:'safe'}],library:{likes:[{id:'one'},{id:'safe'}]},pendingResume:{id:'cover'},sessionStorage:{removeItem:key=>removed.push(key)},saveQueue:()=>calls.push('queue'),toast:()=>{},refreshLibrary:async fresh=>calls.push('library:'+fresh),render:async()=>calls.push('render')});
 const text=source('actions.js');vm.runInContext(text.slice(text.indexOf('function deleteTrackDialog('),text.indexOf('async function uploadFile(')),c);c.deleteTrackDialog('one','<Song>','original');return {c,calls,form,removed};
}
test('deletion waits for confirmation, invalidates dependent reads and removes unavailable queue entries',async()=>{
 const {c,calls,form,removed}=deletion();assert.equal(calls.length,0);assert.match(c.html,/&lt;Song&gt;/);assert.match(c.html,/정산 내역은 유지/);assert.match(c.html,/data-close-dialog>취소/);
 await form.onsubmit();assert.deepEqual([...c.queue],['safe']);assert.deepEqual([...c.trackMap.keys()],['safe']);assert.equal(c.routeTracks.length,1);assert.equal(c.library.likes.length,1);assert.equal(c.pendingResume,null);assert.equal(removed.length,1);assert.ok(calls.indexOf('invalidate')>calls.indexOf('delete'));assert.ok(calls.includes('stop'));assert.ok(calls.includes('library:true'));assert.ok(calls.includes('render'));
});
test('failed deletion leaves player, queue and caches untouched for existing form error handling',async()=>{
 const {c,calls,form}=deletion(true);await assert.rejects(form.onsubmit(),/삭제 실패/);assert.deepEqual(calls,['delete']);assert.equal(c.queue.length,3);assert.equal(c.trackMap.size,3);
});
test('deleting a song retains other users participation, social references and accounting records',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; UPDATE tracks SET kind='cover',original_id='one',user_id='other',cover_mode='duet' WHERE id='two'");
 await f.call('/api/tracks/one/like','PUT',undefined,'other');
 await f.call('/api/tracks/one/comments','POST',{body:'Keep this history'},'other');
 const playlist=await f.call('/api/playlists','POST',{name:'Keep playlist',track_ids:['one','two']},'other');assert.equal(playlist.status,201);
 f.sql.exec("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('retained','other','one',10,100000,'producer',80000,20000,'2026-09',0)");
 const tables=['tracks','comments','likes','playlist_tracks','gifts','dubbing_projects','dubbing_recordings'];
 const counts=()=>tables.map(name=>f.sql.prepare('SELECT count(*) n FROM '+name).get().n),before=counts();
 assert.equal((await f.call('/api/uploads/one','DELETE',undefined,null)).status,401);
 assert.equal((await f.call('/api/uploads/one','DELETE',undefined,'other')).status,404);assert.deepEqual(counts(),before);
 assert.equal((await f.call('/api/uploads/one','DELETE')).status,200);assert.deepEqual(counts(),before);
 const participation=f.sql.prepare("SELECT user_id,status FROM tracks WHERE id='two'").get();assert.equal(participation.user_id,'other');assert.equal(participation.status,'published');
 assert.equal((await f.call('/api/tracks/two')).status,404,'Existing original visibility policy still blocks playback');
 assert.equal((await f.call('/api/uploads/missing','DELETE')).status,404);
});
