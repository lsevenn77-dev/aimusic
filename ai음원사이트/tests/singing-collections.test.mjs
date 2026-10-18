import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function setup(data={}){
 const calls=[],esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const c=vm.createContext({me:{id:'owner'},esc,icon:()=>'',cover:t=>'<img alt="'+esc(t.title)+'">',credits:t=>esc(t.producer),time:String,number:String,moodOptions:[],remember(){},api:async(...args)=>{calls.push(args);if(!data[args[0]])throw Error('Unexpected API');return data[args[0]];}});
 for(const name of ['music-ui.js','singing-hub.js','browse.js'])vm.runInContext(read(name),c);
 return {c,calls};
}
const original={id:'original',title:'별빛',genre:'Pop',producer:'음악가',created:10};
const duet={...original,id:'half',original_id:'original',kind:'cover',cover_mode:'duet',duet_open:1,user_id:'partner',producer_id:'person'};
test('singing shortcuts and tabs navigate to dedicated pages instead of scrolling',()=>{
 const {c}=setup(),html=c.singingHubHTML([original],[],[duet]);
 assert.match(html,/<a class="hub-quick original" href="#karaoke\/songs"/);
 assert.match(html,/<a class="hub-quick duet" href="#karaoke\/duets"/);
 assert.match(html,/<a href="#karaoke\/duets" >듀엣/);
 assert.doesNotMatch(html,/data-hub-tab/);
});
test('duet page reads open halves only and retains the exact original and parent IDs',async()=>{
 const {c,calls}=setup({'/api/duets':{tracks:[duet,{...duet,id:'own',user_id:'owner'},{...duet,id:'closed',duet_open:0},{...duet,id:'complete',duet_parent_id:'half'},{...duet,id:'solo',cover_mode:'solo'}]}});
 const view=await c.browseView('karaoke','duets');
 assert.deepEqual(calls.map(c=>c[0]),['/api/duets']);assert.equal(calls[0][3].fresh,true);
 assert.deepEqual(Array.from(view.tracks,t=>t.id),['half','own']);
 assert.match(view.html,/data-play="half"/);assert.match(view.html,/#sing\/original\?duet=half/);
 assert.match(view.html,/href="#song\/own" aria-label="별빛 내 반곡 보기"/);assert.doesNotMatch(view.html,/\?duet=own|\?duet=complete/);
 assert.equal(view.singingCollection,'duets');
});
test('direct singing page uses only the MR catalog and opens a solo recording',async()=>{
 const {c,calls}=setup({'/api/karaoke':{tracks:[original]}}),view=await c.browseView('karaoke','songs');
 assert.deepEqual(calls.map(c=>c[0]),['/api/karaoke']);assert.match(view.html,/#sing\/original\?mode=solo/);assert.match(view.html,/원곡 듣기/);assert.equal(view.singingCollection,'songs');
});
test('search, genre and sorting preserve source data and the correct playback IDs',()=>{
 const {c}=setup(),tracks=[{...duet,id:'old',producer:'Evening',plays:3,created:1},{...duet,id:'new',genre:'Rock',producer:'Morning',plays:7,created:5}];
 assert.deepEqual(Array.from(c.filterSingingCollection(tracks,{q:' evening ',genre:'Pop'},true),t=>t.id),['old']);
 assert.deepEqual(Array.from(c.filterSingingCollection(tracks,{order:'popular'},true),t=>t.id),['new','old']);
 assert.deepEqual(Array.from(c.filterSingingCollection(tracks,{order:'recent'},true),t=>t.id),['new','old']);
 assert.deepEqual(Array.from(c.filterSingingCollection(tracks,{order:'popular'},false),t=>t.id),['old','new']);
 assert.deepEqual(tracks.map(t=>t.id),['old','new']);
});
test('card text is escaped and empty filters offer a reset',()=>{
 const {c}=setup(),html=c.singingCollectionCards([{...duet,title:'<script>x</script>',producer:'" onload="bad',genre:'<img>'}],true);
 assert.doesNotMatch(html,/<script>|<img>|onload="bad/);assert.match(html,/&lt;script&gt;/);
 assert.match(c.singingCollectionHTML([],'duets'),/아직 참여를 기다리는 반곡이 없어요/);
 assert.match(c.singingCollectionEmpty(true,true),/data-sing-filter-reset/);
});
