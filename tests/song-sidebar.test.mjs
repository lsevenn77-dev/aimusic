import * as AifectProductionCredits from '../shared/production-credits.js';
import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/views.js',import.meta.url),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(){const c=nicknameContext({AifectProductionCredits,me:{id:'viewer'},esc,number:n=>String(n??0),icon:()=>'',avatarImage:r=>'<img src="/media/producer/'+esc(r.profile_id)+'?v='+esc(r.image_version)+'" alt="">',AifectGenres:{MOODS:[{id:'night',name:'밤'}]}});vm.runInContext(source.split('\n')[0],c);vm.runInContext(source.slice(source.indexOf('function songCreditCardHTML('),source.indexOf('function trackModerationToolsHTML(')),c);return c;}
test('song support shows five DB-ranked names and gift details with existing profile and gift links',()=>{const c=context(),g={ranking:Array.from({length:7},(_,i)=>({name:i===0?'<Fan>':'Fan '+i,profile_id:'p'+i,image_version:'v1',gold:1,stars:6-i,score:7-i}))};const html=c.giftsPanelHTML(g,'응원',{track:{id:'song',user_id:'owner'}});assert.equal((html.match(/song-support-position/g)||[]).length,5);assert.match(html,/&lt;Fan&gt;/);assert.match(html,/실버 6S · 골드 1G/);assert.match(html,/#producer\/p0/);assert.match(html,/href="#gifts"/);assert.match(html,/#rewards/);assert.doesNotMatch(html,/gift-total|gift-quick-grid|Fan 5|Fan 6|song-support-avatar|7점/);});
test('sidebar cards keep accessible gift-hub and reward links for visitors and owners',()=>{
 const c=context();
 for(const viewer of [null,{id:'viewer'},{id:'owner'}]){
  c.me=viewer;const html=c.giftsPanelHTML({ranking:[]},'응원',{track:{id:'own',user_id:'owner'}});
  assert.match(html,/아직 받은 선물이 없습니다/);
  assert.match(html,/<a\b[^>]*href="#gifts"[^>]*>[\s\S]*?<strong>선물로 마음 전하기<\/strong>[\s\S]*?상점 둘러보기[\s\S]*?<\/a>/);
  assert.match(html,/<a\b[^>]*href="#rewards"[^>]*>[\s\S]*?<strong>무료 실버 받기<\/strong>[\s\S]*?출석·활동으로 실버를 모읍니다\.[\s\S]*?<\/a>/);
  assert.equal((html.match(/href="#gifts"/g)||[]).length,1);assert.equal((html.match(/href="#rewards"/g)||[]).length,1);
  assert.doesNotMatch(html,/disabled|data-gift=|song-gift-heart-banner|song-silver-button/);
 }
 assert.equal(c.giftsPanelHTML(null,'응원',{track:{}}),'');
});
test('credits escape actual metadata, translate moods and provide all five missing values',()=>{const c=context();const html=c.songCreditCardHTML({ai_tool:'<suno>',genres:['K-POP','Synth Pop','Dance'],moods:['night'],tags:['태그','태그2']});assert.match(html,/&lt;suno&gt;/);assert.match(html,/K-POP · Synth Pop · Dance/);assert.match(html,/>밤</);assert.match(html,/태그 · 태그2/);assert.equal((c.songCreditCardHTML({}).match(/<dd>—<\/dd>/g)||[]).length,5);});

test('song support combines ranked senders without separate account labels or zero currencies',()=>{
 const c=context(),html=c.giftsPanelHTML({ranking:[{profile_id:'human',name:'팬',stars:1,gold:0,score:1}],support_ranking:[{profile_id:'ai_000001',name:'임혜원',official_stars:2,stars:0,gold:0,score:2},{profile_id:'human',name:'팬',official_stars:0,stars:1,gold:0,score:1}],official_ai:{quantity:2,gifts:[{profile_id:'ai_000001',name:'임혜원',quantity:2}]}},'응원',{track:{id:'song',user_id:'owner'}});
 assert.equal((html.match(/song-support-position/g)||[]).length,2);
 assert.match(html,/#producer\/ai_000001/);assert.match(html,/응원별 ×2/);assert.match(html,/실버 1S/);
 assert.ok(html.indexOf('임혜원')<html.indexOf('title="팬"'));
 assert.equal((html.match(/href="#producer\/ai_000001"/g)||[]).length,1);
 assert.doesNotMatch(html,/공식|ai-account-badge|official-ai-support|실제 회원|골드 0G|실버 0S|응원별 ×0|2점/);
});
