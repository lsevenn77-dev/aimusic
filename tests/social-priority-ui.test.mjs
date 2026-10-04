import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const crew={id:'crew',name:'Music crew',members:2,capacity:10,level:1,xp:2,recruiting:1};
const detail={crew,membership:{role:'member'},members:[{id:'peer-profile',name:'Singer',role:'manager'}],tracks:[]};
function fixture(responses={}){
 const calls=[],context=vm.createContext({me:{id:'self-user'},Date,URLSearchParams,esc:escape,number:n=>String(n||0),icon:()=>'',portrait:p=>'<img alt="'+escape(p.name)+'">',heading:t=>'<h1>'+escape(t)+'</h1>',section:t=>'<h2>'+escape(t)+'</h2>',communityFeed:()=>'<div>MUSIC</div>',communityNavigation:()=>'<nav>COMMUNITY</nav>',document:{addEventListener(){}},api:async p=>{calls.push(p);if(!(p in responses))throw Error('Unexpected '+p);return responses[p];}});
 for(const file of ['social-chat.js','improvements.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 return {context,calls};
}
test('joined crew landing loads my chat directly and keeps discovery as a secondary route',async()=>{
 const {context:c,calls}=fixture({'/api/crews?q=':{mine:'crew',crews:[crew]},'/api/crews/crew':detail});
 const view=await c.improvementsView('community','crews','community/crews');
 assert.equal(view.chat.path,'/api/crews/crew/messages');assert.match(view.html,/id="chat-compose"/);
 assert.doesNotMatch(view.html,/id="crew-search"|data-create-crew|data-leave-crew/);
 assert.match(view.html,/#community\/crews\?browse=1/);assert.match(view.html,/#crew\/crew\?tab=members/);
 assert.deepEqual(calls,['/api/crews?q=','/api/crews/crew']);
});
test('member and music views avoid fetching or subscribing to hidden chat panels',async()=>{
 const {context:c}=fixture({'/api/crews/crew':detail});
 for(const tab of ['members','music','about']){const view=await c.improvementsView('crew','crew','crew/crew?tab='+tab);assert.equal(view.chat,null);assert.doesNotMatch(view.html,/id="chat-compose"/);}
 assert.match((await c.improvementsView('crew','crew','crew/crew?tab=members')).html,/#producer\/peer-profile/);
});
test('non-members and an explicit browse route retain search while join access stays gated',async()=>{
 const {context:c}=fixture({'/api/crews?q=':{mine:'crew',crews:[crew]},'/api/crews/crew':{...detail,membership:null}});
 assert.match((await c.improvementsView('community','crews','community/crews?browse=1')).html,/id="crew-search"/);
 const visitor=await c.improvementsView('crew','crew','crew/crew');assert.equal(visitor.chat,null);assert.match(visitor.html,/data-join-crew/);assert.doesNotMatch(visitor.html,/id="chat-compose"/);
});
test('DM avatars use producer profile IDs while messages use account IDs for ownership',()=>{
 const {context:c}=fixture(),peer={id:'peer-profile',user_id:'peer-user',name:'Singer'};
 const list=c.conversationListHTML([{...peer,updated:1,unread:1}]);assert.match(list,/#producer\/peer-profile/);assert.match(list,/#dm\/peer-profile/);assert.doesNotMatch(list,/#producer\/peer-user/);
 const html=c.chatHTML([{id:'a',sender_id:'peer-user',body:'<script>hi</script>',created:1},{id:'b',sender_id:'self-user',body:'reply',created:2}],peer);
 assert.match(html,/dm-message mine/);assert.match(html,/#producer\/peer-profile/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 const crewHtml=c.chatHTML([{id:'c',user_id:'peer-user',name:'Singer',role:'manager',body:'hello',created:1}],null,{id:'crew'});assert.match(crewHtml,/Singer\(매니저\)/);assert.doesNotMatch(crewHtml,/dm-bubble/);
});
