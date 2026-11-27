import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import {crewGameCatalog} from '../server/crew-game-catalog.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const crew={id:'crew',name:'Music crew',members:2,capacity:10,level:1,xp:2,recruiting:1};
const detail={growth:{level:1,xp:0,next_xp:300,next_capacity:15,progress:0,missions:[]},crew,membership:{role:'member'},members:[{id:'peer-profile',name:'Singer',role:'manager'}],tracks:[]};
const home='/api/crews?q=&summary=1&home=1&web=1',workDetail='/api/crews/crew?web=1';
function fixture(responses={}){
 const calls=[],context=nicknameContext({me:{id:'self-user'},apiRevision:0,structuredClone,Date,URLSearchParams,esc:escape,number:n=>String(n||0),icon:()=>'',avatarImage:()=>'<img>',playerBadgeHTML:()=>'',portrait:p=>'<img alt="'+escape(p.name)+'">',heading:t=>'<h1>'+escape(t)+'</h1>',section:t=>'<h2>'+escape(t)+'</h2>',communityFeed:()=>'<div>MUSIC</div>',communityNavigation:()=>'<nav>COMMUNITY</nav>',document:{addEventListener(){}},api:async p=>{calls.push(p);if(!(p in responses))throw Error('Unexpected '+p);return typeof responses[p]==='function'?responses[p]():responses[p];}});
 Object.assign(context,{followed:()=>false,window:{addEventListener(){}},setInterval(){},cover:()=>'',trackStats:()=>''});
 for(const file of ['artist-directory.js','chat-features.js','social-chat.js','social-layouts.js','improvements.js','release-refinements.js','community-v3.js','crew-integrated.js','crew-settings.js','work-feed.js','crew-page.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 return {context,calls};
}
test('joined crew landing shows music and discovery without a header chat shortcut',async()=>{
 const {context:c,calls}=fixture({[home]:{mine:'crew',detail},[workDetail]:detail});
 const view=await c.improvementsView('community','crews','community/crews');
 assert.equal(view.chat,null);assert.doesNotMatch(view.html,/#dm\/crew\/crew|tab=manage/);
 assert.doesNotMatch(view.html,/id="crew-search"|data-create-crew|id="chat-compose"/);
 assert.match(view.html,/#community\/crews\?browse=1/);assert.match(view.html,/#crew\/crew\?tab=members/);
 assert.deepEqual(calls,[home]);
});

test('the crew tab resolves current membership on direct entry and reentry',async()=>{
 const responses={[home]:{mine:crew.id,detail}};
 const {context:c,calls}=fixture(responses);
 assert.match((await c.improvementsView('crew',undefined,'crew')).html,/data-current-crew="crew"/);
 responses[home]={mine:null,crews:[crew]};
 const browse=await c.improvementsView('crew',undefined,'crew');
 assert.match(browse.html,/id="crew-search"/);
 assert.doesNotMatch(browse.html,/data-current-crew=/);
 assert.deepEqual(calls,[home,home]);
});

test('crew settings follow live staff roles and legacy management links land on works',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-09T00:00:00+09:00')});
 const {context:c}=fixture();
 vm.runInContext(readFileSync(new URL('../dist/menu-integration.js',import.meta.url),'utf8'),c);
 assert.equal(c.menuAlias('#crew/crew?tab=manage'),'#crew/crew?tab=music');
 for(const role of ['owner','deputy','manager','operator','member',null]){
  const view=c.crewDetailView({...detail,membership:role?{role,game_catalog:await crewGameCatalog({CREW_GAME_VISIBLE_IDS:'jump'},'crew')}:null},'crew','manage');
  assert.equal(view.html.includes('aria-label="크루 설정"'),['owner','deputy','manager','operator'].includes(role));
  assert.equal(view.crewTab,'music');
  assert.match(view.html,/data-crew-panel="music" aria-labelledby="crew-tab-music">/);
  const header=view.html.match(/<header class="crew-detail-header[\s\S]*?<\/header>/)[0];
  assert.equal(header.includes('href="#crew-jump/crew"'),!!role);
  assert.match(header,/멤버 2 \/ 10명 · Lv\.1/);
  assert.match(header,/<a class="crew-find-link" href="#community\/crews\?browse=1"/);
  assert.doesNotMatch(header.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)[0],/Lv\./);
  assert.doesNotMatch(view.html,/크루 소식|data-crew-news|tab=manage|data-crew-member=|crew-cover-bg/);
  const nav=view.html.match(/<nav class="crew-room-tabs"[^>]*>(.*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),[
   '#crew/crew?tab=music','#crew/crew?tab=members','#crew/crew?tab=notice','#crew/crew?tab=about',
  ]);
  assert.equal((nav.match(/class="secondary-button"/g)||[]).length,4);
  assert.match(view.html,/<\/nav><div class="crew-detail-xp">/);
  assert.equal((view.html.match(/<progress\b/g)||[]).length,1);
 }
});

test('the crew gauge uses server level progress, including later tiers and a capped level',()=>{
 const {context:c}=fixture();
 for(const [xp,next_xp,progress,hint] of [
  [0,300,0,'다음 레벨까지 300 XP'],[85,300,85/300,'다음 레벨까지 215 XP'],
  [350,800,.1,'다음 레벨까지 450 XP'],[300,300,1,'다음 레벨까지 0 XP'],[30000,null,1,'최고 레벨 달성']
 ]){
  const html=c.crewExperienceHTML({xp,next_xp,progress});
  assert.ok(html.includes('value="'+progress+'"'));
  assert.ok(html.includes(xp+' / '+(next_xp??'MAX')+' XP'));
  assert.ok(html.includes(hint));
 }
});

test('a known crew skips discovery on reentry while membership is always rechecked',async()=>{
 const responses={[home]:{mine:'crew',detail},[workDetail]:detail},{context:c,calls}=fixture(responses);
 await c.improvementsView('community','crews','community/crews');calls.length=0;
 const opening=c.improvementsView('community','crews','community/crews');
 assert.deepEqual(calls,[workDetail]);assert.equal((await opening).chat,null);
 responses[workDetail]={...detail,membership:null};
 const kicked=await c.improvementsView('community','crews','community/crews');
 assert.equal(kicked.chat,null);assert.doesNotMatch(kicked.html,/id="chat-compose"/);
 assert.equal(c.peekCrewNavigation('discovery').mine,null);
});

test('pending crew chrome contains public metadata without restoring private history or actions',async()=>{
 const {context:c}=fixture({[workDetail]:{...detail,membership:{role:'owner',joined_sequence:1}}});
 await c.improvementsView('crew','crew','crew/crew');
 const pending=c.crewPendingView('crew','crew','crew/crew');
 assert.match(pending.html,/Music crew/);assert.match(pending.html,/불러오는 중/);
 assert.doesNotMatch(pending.html,/chat-compose|data-crew-member|data-edit-crew|data-leave-crew|data-join-crew/);
 const cached=c.peekCrewNavigation('crew');assert.equal(cached.membership,undefined);assert.equal(cached.messages,undefined);
 c.me={id:'another-user'};assert.equal(c.peekCrewNavigation('crew'),null);
 assert.doesNotMatch(c.crewPendingView('crew','crew','crew/crew').html,/Music crew/);
 c.me={id:'self-user'};c.apiRevision++;assert.equal(c.peekCrewNavigation('crew'),null);
});

test('late crew responses cannot warm another account or mutation revision',async()=>{
 let release;const {context:c}=fixture({[workDetail]:()=>new Promise(resolve=>release=resolve)});
 const loading=c.improvementsView('crew','crew','crew/crew');c.me={id:'another-user'};release(detail);await loading;
 assert.equal(c.peekCrewNavigation('crew'),null);assert.equal(c.peekCrewNavigation('discovery'),null);
 const next=c.improvementsView('crew','crew','crew/crew');c.apiRevision++;release(detail);await next;
 assert.equal(c.peekCrewNavigation('crew'),null);
});

test('the crew feed merges open and completed works, retaining versions and only eligible participation links',()=>{
 const {context:c}=fixture();
 const open={id:'open',original_id:'song',kind:'cover',cover_mode:'duet',recruiting:true,can_join:true,completions:1,created:10};
 const version={id:'complete',kind:'cover',cover_mode:'duet',duet_parent_id:open.id,popular_rank:0};
 const closed={id:'closed',kind:'cover',cover_mode:'duet',completions:0,recruiting:false};
 const reserved={id:'reserved',kind:'dubbing',state:'recruiting',recruiting:true,can_join:false,created:3};
 const groups=c.crewWorkCatalog({tracks:[open,version,closed,open],dubbings:[reserved]});
 assert.deepEqual(Array.from(groups,g=>g.key),['duet:open','dubbing:reserved','duet:closed']);
 assert.equal(groups[0].work.id,open.id);
 assert.equal(groups[0].versions[0].id,version.id);
 assert.match(c.crewWorkJoin(groups[0]),/#sing\/song\?duet=open/);
 assert.equal(c.crewWorkJoin(groups[1]),'');
 assert.deepEqual(Array.from(groups.filter(item=>c.workFeedMatches(item,'recruit')),item=>item.key),['duet:open','dubbing:reserved']);
});
test('member and music views avoid fetching or subscribing to hidden chat panels',async()=>{
 const {context:c}=fixture({[workDetail]:detail});
 for(const tab of ['members','music','about']){const view=await c.improvementsView('crew','crew','crew/crew?tab='+tab);assert.equal(view.chat,null);assert.doesNotMatch(view.html,/id="chat-compose"/);}
 const row=c.crewMemberRow({id:'peer-profile',user_id:'peer',name:'Singer',role:'manager'},detail.membership);
 assert.match(row,/#producer\/peer-profile/);assert.match(row,/#dm\/peer-profile/);
});
test('non-members and an explicit browse route retain search while join access stays gated',async()=>{
 const {context:c,calls}=fixture({'/api/crews?q=&summary=1':{mine:'crew',crews:[crew]},[workDetail]:{...detail,membership:null}});
 assert.match((await c.improvementsView('community','crews','community/crews?browse=1')).html,/id="crew-search"/);
 assert.deepEqual(calls,['/api/crews?q=&summary=1']);
 const visitor=await c.improvementsView('crew','crew','crew/crew');assert.equal(visitor.chat,null);assert.match(visitor.html,/data-join-crew/);assert.doesNotMatch(visitor.html,/id="chat-compose"/);
});
test('DM avatars use producer profile IDs while messages use account IDs for ownership',()=>{
 const {context:c}=fixture(),peer={id:'peer-profile',user_id:'peer-user',name:'Singer'};
 const list=c.conversationListHTML([{...peer,updated:1,unread:1}]);assert.match(list,/#producer\/peer-profile/);assert.match(list,/#dm\/peer-profile/);assert.doesNotMatch(list,/#producer\/peer-user/);
 const html=c.chatHTML([{id:'a',sender_id:'peer-user',body:'<script>hi</script>',created:1},{id:'b',sender_id:'self-user',body:'reply',created:2}],peer);
 assert.match(html,/dm-message mine/);assert.match(html,/#producer\/peer-profile/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 const crewHtml=c.chatHTML([{id:'c',user_id:'peer-user',name:'Singer',role:'manager',body:'hello',created:1}],null,{id:'crew'});assert.match(crewHtml,/Singer\(매니저\)/);assert.match(crewHtml,/dm-bubble/);
});
