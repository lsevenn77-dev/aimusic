import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/community.js',import.meta.url),'utf8');
function context(api=async()=>({tracks:[],singers:[]})){
 const calls=[],played=[],remembered=[];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({URLSearchParams,genres:['전체','K-POP','Ballad','R&B'],esc,number:n=>String(n||0),icon:()=>'',cover:()=>'',portrait:()=>'',liked:()=>false,followed:()=>false,
  me:null,location:{hash:'#community'},heading:s=>'<h1>'+s+'</h1>',gate:()=>'<p>LOGIN</p>',communityFeed:()=>'<p>FEED</p>',renderId:1,routeTracks:[],
  remember:items=>remembered.push(...items),accountReady:Promise.resolve(),play:async(id,queue)=>played.push({id,queue}),toast:()=>{},
  api:async path=>{calls.push(path);return api(path);}
 });
 vm.runInContext(source,c);
 return {c,calls,played,remembered};
}
function host(){return {isConnected:true,innerHTML:'',attributes:{},button:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return this.button;}};}
const track=(id='one')=>({id,title:'Cover '+id,producer_id:'person',producer:'Singer',genre:'Ballad',rank:1,rank_likes:3,comments:2,original_title:'Original'});

test('cover deep links validate values and preserve Unicode query, genre and original across periods',()=>{
 const {c}=context();
 const o=c.coverRankOptions('community/rankings?period=week&kind=singers&genre=R%26B&q=한+곡&original_id=original-1');
 assert.equal(o.period,'week');assert.equal(o.kind,'singers');assert.equal(o.genre,'R&B');assert.equal(o.q,'한 곡');
 const q=new URLSearchParams(c.coverRankHref(o,{period:'month'}).split('?')[1]);
 assert.equal(q.get('period'),'month');assert.equal(q.get('kind'),'singers');assert.equal(q.get('genre'),'R&B');assert.equal(q.get('original_id'),'original-1');
 const invalid=c.coverRankOptions('community/rankings?period=no&kind=admin&genre=no&original_id=%3Cscript%3E');
 assert.equal(invalid.period,'today');assert.equal(invalid.kind,'tracks');assert.equal(invalid.genre,'전체');assert.equal(invalid.original_id,'');
});
test('community entry renders all four ranking links without blocking on four ranking requests',async()=>{
 const {c,calls}=context(async()=>({tracks:[]}));
 const home=await c.communityView('community',undefined,'community');
 for(const period of ['today','week','month','all'])assert.match(home.html,new RegExp('period='+period));
 assert.equal(home.coverRanking.limit,5);
 assert.deepEqual(calls,['/api/community']);
 const rank=await c.communityView('community','rankings','community/rankings?period=all');
 assert.equal(rank.coverRanking.limit,50);assert.deepEqual(calls,['/api/community']);
});
test('ranking requests use the shared API filters and playback uses ranked songs only',async()=>{
 const items=[track('two'),track('one')],{c,calls,played}=context(async()=>({tracks:items}));
 c.routeTracks=[track('latest')];const el=host(),o={...c.coverRankOptions('community?period=month&genre=Ballad&q=Singer&original_id=original'),limit:5};
 await c.loadCoverRanking(el,o,1);
 assert.equal(calls[0],'/api/cover-rankings?period=month&kind=tracks&genre=Ballad&q=Singer&original_id=original&limit=5');
 assert.equal(el.attributes['aria-busy'],'false');assert.match(el.innerHTML,/커버 랭킹 더 보기/);
 await el.button.onclick();assert.deepEqual(Array.from(played[0].queue,t=>t.id),['two','one']);
 assert.deepEqual(Array.from(c.routeTracks,t=>t.id),['two','one','latest']);
 assert.match(el.innerHTML,/#song\/two\?comments=1/);assert.match(el.innerHTML,/#producer\/person\?tab=covers/);
});
test('late responses cannot overwrite a newer filter or a departed route',async()=>{
 const pending=[],{c}=context(()=>new Promise(resolve=>pending.push(resolve))),el=host(),o=c.coverRankOptions();
 const first=c.loadCoverRanking(el,o,1),second=c.loadCoverRanking(el,o,1);
 pending[1]({tracks:[track('new')]});await second;pending[0]({tracks:[track('stale')]});await first;
 assert.match(el.innerHTML,/Cover new/);assert.doesNotMatch(el.innerHTML,/stale/);assert.equal(c.routeTracks[0].id,'new');
 const departed=c.loadCoverRanking(el,o,1);c.renderId=2;pending[2]({tracks:[track('departed')]});await departed;
 assert.doesNotMatch(el.innerHTML,/departed/);
});
test('empty and failed ranking states do not fabricate ranks and failure can be retried',async()=>{
 let fail=true;const {c}=context(async()=>{if(fail)throw Error('network');return {tracks:[]};}),el=host(),o=c.coverRankOptions();
 await c.loadCoverRanking(el,o,1);assert.match(el.innerHTML,/다시 시도/);assert.equal(el.attributes['aria-busy'],'false');
 fail=false;await c.loadCoverRanking(el,o,1);assert.match(el.innerHTML,/아직 순위가 정해지지/);assert.doesNotMatch(el.innerHTML,/cover-position/);assert.match(el.innerHTML,/#community\/covers/);
});
test('ranked track and singer text is escaped; singer profiles open covers and offer follow',()=>{
 const {c}=context(),injected='<img src=x onerror=alert(1)>';
 const html=c.coverRankTracksHTML([{...track(),title:injected,producer:injected}])+c.coverRankSingersHTML([{id:'singer',name:injected,bio:injected,rank:1,rank_likes:4}]);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
 assert.match(html,/#producer\/singer\?tab=covers/);assert.match(html,/data-follow="producer\/singer"/);
});
