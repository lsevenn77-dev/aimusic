import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectGifts from '../shared/gifts.js';
const source=readFileSync(new URL('../dist/notifications.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const requests=[],badge={setAttribute(){}},error={},root={isConnected:true,querySelectorAll:()=>[],querySelector:s=>s==='[data-activity-settings]'?null:error},listeners={};
 const c=vm.createContext({me:{id:'owner'},document:{hidden:false,querySelectorAll:()=>[badge],addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener(){}},window:{addEventListener(){}},setInterval(){},$:()=>root,location:{hash:'#notifications'},toast(){},api:async(path,method,body)=>{requests.push({path,method,body});return {unread:0};}});
 vm.runInContext(source,c);c.view={activity:{account:'owner',unread:2,items:[{id:'one',read_at:0},{id:'two',read_at:0}]}};
 return {c,badge,error,requests,root,listeners,run:s=>vm.runInContext(s,c)};
}
test('entry and visibility do not acknowledge any notification',async()=>{
 const t=setup();t.run('bindNotifications(view)');await tick();assert.equal(t.requests.length,0);assert.equal(t.badge.hidden,false);assert(t.c.view.activity.items.every(n=>!n.read_at));
});
test('selecting a row acknowledges only that ID before resolving navigation',async()=>{
 const t=setup();t.run('bindNotifications(view)');const b={dataset:{activityOpen:'one'},setAttribute(){},removeAttribute(){},hasAttribute(){return false;}};
 await t.root.onclick({target:{closest:()=>b},preventDefault(){}});
 assert.deepEqual([...t.requests[0].body.ids],['one']);assert.equal(t.requests[1].path,'/api/notifications/one/open');assert(t.c.view.activity.items[0].read_at);assert.equal(t.c.view.activity.items[1].read_at,0);
});
test('failed read does not navigate or clear unread status',async()=>{
 const t=setup();t.c.api=async()=>{throw Error('offline');};t.run('bindNotifications(view)');const b={dataset:{activityOpen:'one'},setAttribute(){},removeAttribute(){},hasAttribute(){return false;}};
 await t.root.onclick({target:{closest:()=>b},preventDefault(){}});assert.equal(t.c.location.hash,'#notifications');assert.equal(t.c.view.activity.items[0].read_at,0);assert.match(t.error.textContent,/offline/);
});
test('account switch does not acknowledge another account or paint an old response',async()=>{
 const t=setup();t.c.me={id:'other'};t.run('bindNotifications(view)');await tick();assert.equal(t.requests.length,0);
});

test('all registered gifts use their existing product art and a receipt source link, without the removed button',()=>{
 const t=setup();Object.assign(t.c,{AifectGifts,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),number:n=>String(n),icon:()=>''});
 for(const product of [...AifectGifts.GIFT_CATALOG,...AifectGifts.SILVER_GIFT_CATALOG,AifectGifts.FREE_GIFT,AifectGifts.giftById('note')]){
  t.c.n={id:'receipt',kind:'gift',gift_type:product.id,gift_name:product.name,quantity:3,currency:product.free||product.id==='star'?'silver':'gold',amount:150,created:1,read_at:1,actor_name:'코코',available:1,gift_source_kind:'song',gift_source_target:'real target',gift_source_title:'노래 <제목>'};
  const html=t.run('activityRowHTML(n)');assert.ok(html.includes(`src="${product.image}"`));assert.match(html,/× 3개/);assert.match(html,/href="#song\/real%20target"/);assert.match(html,/곡 이야기 · 노래 &lt;제목>/);assert.doesNotMatch(html,/선물 가치|받은 경로|class="activity-open"/);
 }
 t.c.n.available=0;assert.doesNotMatch(t.run('activityRowHTML(n)'),/href="#song/);
 t.c.n.gift_source_kind='producer';t.c.n.gift_source_title='음악가';t.c.n.available=1;
 assert.match(t.run('activityRowHTML(n)'),/프로필 · 음악가/);
 t.c.n.gift_type='unregistered';t.c.n.gift_name='과거 선물';const legacy=t.run('activityRowHTML(n)');assert.doesNotMatch(legacy,/activity-gift-art/);assert.match(legacy,/과거 선물/);
});

test('unavailable content links preserve the real notification ID for server revalidation',()=>{
 const t=setup();Object.assign(t.c,{esc:s=>String(s??''),number:n=>String(n),icon:()=>''});t.c.n={id:'unavailable-id',kind:'dubbing_complete',created:1,read_at:1,actor_name:'음악가',available:0,href:''};const html=t.run('activityRowHTML(n)');assert.match(html,/data-activity-open="unavailable-id"/);assert.doesNotMatch(html,/\$\{/);
});
