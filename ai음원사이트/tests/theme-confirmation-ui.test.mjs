import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/decorations.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function decorationRemaining('),source.indexOf('async function decorationShopView('))+source.slice(source.indexOf('function fillRoomThemeChoices('),source.indexOf("document.addEventListener('click',e=>{const b=e.target.closest('[data-decoration]')"));
function harness(status='UNUSED'){
 let modal,elapsed=0;
 const events=new EventTarget(),choice={sku:'theme_christmas',inventory_id:'real-stock',name:'크리스마스 테마',status,paid:true,selectable:true,period_code:'P7D',expires_at:status==='ACTIVE'?10060:0,assetPaths:{roomCard:'/assets/themes/christmas/card.webp'}};
 const target={innerHTML:''},form={_themeChoices:[choice],_themeServerNow:10000,_themeReceivedAt:0,querySelector:s=>s==='.voice-backgrounds'?target:{dataset:{themeIndex:'0'}}};
 const context=vm.createContext({performance:{now:()=>elapsed},location:{hash:'#community'},URLSearchParams,esc:String,Date,
  window:events,document:{body:{append:m=>{modal=m;}},createElement:()=>Object.assign(new EventTarget(),{returnValue:'',setAttribute(){},showModal(){this.open=true;},close(value){this.returnValue=value;this.open=false;this.dispatchEvent(new Event('close'));},remove(){this.removed=true;},getBoundingClientRect:()=>({left:0,right:390,top:550,bottom:844})})}});
 vm.runInContext(code,context);return {context,form,choice,target,get modal(){return modal;},advance:ms=>{elapsed+=ms;},navigate:()=>events.dispatchEvent(new Event('hashchange'))};
}
test('selection and preview do not show confirmation or mutate an unused rental',()=>{
 const h=harness(),before=structuredClone(h.choice);h.context.fillRoomThemeChoices(h.form,{themes:[h.choice],server_now:10000},h.choice.sku,h.choice.inventory_id);
 assert.equal(h.modal,undefined);assert.deepEqual(h.choice,before);assert.match(h.target.innerHTML,/data-theme-index="0" checked/);assert.match(h.target.innerHTML,/미사용/);
});
for(const action of ['cancel','navigation'])test(action+' dismisses first-use confirmation without activation',async()=>{
 const h=harness(),pending=h.context.confirmRoomTheme(h.form);assert.ok(h.modal.open);assert.doesNotMatch(h.modal.innerHTML,/닫기|class="close|×/);
 action==='cancel'?h.modal.close('cancel'):h.navigate();assert.equal(await pending,null);assert.equal(h.choice.status,'UNUSED');assert.ok(h.modal.removed);
});
test('confirmation returns the exact ownership ID; active rentals bypass the popup',async()=>{
 const h=harness(),pending=h.context.confirmRoomTheme(h.form);h.modal.close('start');
 assert.deepEqual(JSON.parse(JSON.stringify(await pending)),{theme_sku:'theme_christmas',inventory_id:'real-stock',activate_theme:true});assert.equal(h.choice.status,'UNUSED','the server alone starts the rental');
 const active=harness('ACTIVE'),payload=await active.context.confirmRoomTheme(active.form);assert.equal(payload.inventory_id,'real-stock');assert.equal(payload.activate_theme,undefined);assert.equal(active.modal,undefined);
});
test('a theme that expires while the picker stays open cannot be confirmed',async()=>{
 const h=harness('ACTIVE');h.advance(61000);await assert.rejects(h.context.confirmRoomTheme(h.form),/사용 기간이 종료/);assert.equal(h.modal,undefined);
});
test('audio snapshots preserve verified theme ownership only for the same owner and settings revision',()=>{
 const roomSource=readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8');
 const method=roomSource.slice(roomSource.indexOf(' acceptState(state){'),roomSource.indexOf(' status(message,'));
 const client=vm.runInNewContext('new (class {'+method+'})()');Object.assign(client,{generation:'g',paint(){},receive(){}});
 const base={generation:'g',revision:1,room:{id:'room',host_id:'owner',settings_revision:2,theme:{sku:'theme_christmas',inventory_id:'own-id'}}};
 client.acceptState(structuredClone(base));const audio=structuredClone(base);delete audio.room.theme;audio.room.theme_sku='basic_dark';audio.revision++;
 client.acceptState(audio);assert.equal(client.state.room.theme.inventory_id,'own-id');assert.equal(client.state.room.background,'theme_christmas');
 const changed=structuredClone(audio);delete changed.room.theme;changed.room.settings_revision++;changed.revision++;client.acceptState(changed);assert.equal(client.state.room.theme,undefined);
 client.acceptState({...base,revision:10});const handoff=structuredClone(audio);delete handoff.room.theme;handoff.revision=11;handoff.room.host_id='successor';client.acceptState(handoff);assert.equal(client.state.room.theme,undefined);
});
