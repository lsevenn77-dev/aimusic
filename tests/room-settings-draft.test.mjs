import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

// Model browser form values and successful controls, rather than replacing the
// settings methods with a separate implementation. The real methods run in vm.
function settingsForm(){
 const form=new EventTarget(),elements=[];form.elements=elements;form.isConnected=true;
 const field=(name,initial='',type='text')=>{
  const control=new EventTarget();let value=String(initial);
  Object.assign(control,{name,type,disabled:false,dataset:{},form});
  Object.defineProperty(control,'value',{get:()=>value,set:next=>{value=String(next);}});
  elements.push(control);elements[name]=control;return control;
 };
 const radios=(name,choices)=>{
  const controls=choices.map((value,index)=>{const control=field(name,value,'radio');control.checked=index===0;return control;});
  elements[name]={get value(){return controls.find(c=>c.checked)?.value||'';},set value(value){for(const c of controls)c.checked=c.value===String(value);}};
  return controls;
 };
 radios('mode',['karaoke','talk']);field('title');const visibility=radios('visibility',['public','private','crew','followers']);
 field('crew_id','','hidden');field('max_members','30','number');field('announcement');radios('background',['basic_dark','basic_light']);
 const dismiss=field('','','button'),submit=field('','','submit');dismiss.dataset.voice='dismiss';
 const error={textContent:''},crew={textContent:'',hidden:false},backgrounds={textContent:''},output={textContent:''};
 const nodes={'[data-voice=dismiss]':dismiss,'[type=submit]':submit,'.form-error':error,'.voice-crew-setting':crew,'.voice-backgrounds':backgrounds,'output':output,'[name=visibility][value=crew]':visibility.find(c=>c.value==='crew')};
 form.querySelector=selector=>nodes[selector]||null;form.querySelectorAll=()=>[];
 return form;
}
class SuccessfulFormData{
 constructor(form){this.entries=form.elements.filter(c=>c.name&&!c.disabled&&!['button','submit'].includes(c.type)&&(c.type!=='radio'||c.checked)).map(c=>[c.name,c.value]);}
 [Symbol.iterator](){return this.entries[Symbol.iterator]();}
}

function harness({mode='karaoke',owner=true,room={},options}={}){
 const form=settingsForm(),requests=[],commands=[],accepted=[],events=[],toasts=[],sheets=new Map();
 const standardOptions={crews:[{id:'current-crew',name:'현재 크루'}],themes:[{sku:'basic_dark',selectable:true},{sku:'basic_light',selectable:true}]};
 let nextOptions=options||(()=>Promise.resolve(standardOptions)),commandReply,client;
 function makeSheet(id){
  const sheet={id,open:false,isConnected:true,closedCount:0,classList:{contains:()=>false},
   close(){if(!this.open)return;this.open=false;this.closedCount++;if(client?.talkPopup===this){client.talkPopup=null;client.settingsTicket=(client.settingsTicket||0)+1;}},
   show(){this.open=true;}};
  sheets.set(id,sheet);return sheet;
 }
 const sheet=makeSheet('voice-room-settings');
 const context=vm.createContext({
  VoiceRoomClient:class{},Event,CustomEvent,crypto,FormData:SuccessfulFormData,
  $:selector=>selector==='#voice-settings-form'?form:sheets.get(selector.slice(1)),
  voiceRequest:path=>{requests.push(path);return nextOptions(path);},
  fillRoomThemeChoices:(target,data,selected)=>{target.elements.background.value=data.themes?.some(t=>t.sku===selected&&t.selectable)?selected:'basic_dark';},
  busyForm:(_form,work)=>work,
  window:{dispatchEvent:event=>events.push(event)},toast:message=>toasts.push(message)
 });
 vm.runInContext(source,context);client=new context.VoiceRoomClient();
 client.state={self:owner?'owner':'other',members:[{id:'owner',role:'host'},{id:'other',role:'listener'}],room:{id:'same-room',host_id:'owner',mode,title:'유지할 방 제목',visibility:'crew',crew_id:'original-crew',max_members:30,announcement:'유지할 공지',background:'basic_dark',theme:{sku:'expired-theme'},settings_revision:7,...room}};
 client.liveMode=mode==='karaoke';client.closed=false;
 client.host={querySelector:selector=>sheets.get(selector.slice(1))};
 client.showSheet=id=>{client.talkPopup?.close();client.settingsTicket=(client.settingsTicket||0)+1;client.talkPopup=sheets.get(id);client.talkPopup.show();};
 client.command=(action,body)=>{assert.match(body.request_id,/^[0-9a-f-]{36}$/);const {request_id,...changes}=body;commands.push({action,body:plain(changes)});return commandReply?commandReply(action,body):Promise.resolve({...client.state,room:{...client.state.room,...body,settings_revision:client.state.room.settings_revision+1}});};
 client.acceptState=state=>{accepted.push(state);client.state=state;};
 client.bindRoomSettings();
 return {client,form,sheet,requests,commands,accepted,events,toasts,makeSheet,standardOptions,setOptions:callback=>{nextOptions=callback;},setCommand:callback=>{commandReply=callback;}};
}

for(const mode of ['talk','karaoke'])test(mode+' settings open from server state; selection and dismissal do not change the room',async()=>{
 const h=harness({mode}),before=plain(h.client.state);
 await h.client.openSettings();
 assert.equal(h.form.elements.mode.value,mode);assert.equal(h.form.elements.title.value,before.room.title);
 assert.equal(h.form.elements.crew_id.value,'original-crew');
 h.form.elements.mode.value=mode==='talk'?'karaoke':'talk';h.form.elements.title.value='저장하지 않은 제목';
 h.form.dispatchEvent(new Event('input'));
 assert.deepEqual(plain(h.client.state),before);assert.equal(h.commands.length,0);
 await h.client.openSettings();assert.equal(h.sheet.open,false,'same settings button dismisses the draft');
 await h.client.openSettings();assert.equal(h.form.elements.mode.value,mode);assert.equal(h.form.elements.title.value,before.room.title);
 h.form.elements.mode.value=mode==='talk'?'karaoke':'talk';h.client.closeRoomPopup();
 await h.client.openSettings();assert.equal(h.form.elements.mode.value,mode);assert.equal(h.commands.length,0);
});

test('type-only save sends only mode and revision, preserving option fallbacks and common room fields',async()=>{
 const h=harness();await h.client.openSettings();
 assert.equal(h.form.elements.background.value,'basic_dark','unavailable theme falls back only inside the rendered form');
 h.form.elements.mode.value='talk';
 await h.form.onsubmit();
 assert.deepEqual(h.commands,[{action:'settings',body:{mode:'talk',revision:7}}]);
 assert.equal(h.client.state.room.title,'유지할 방 제목');assert.equal(h.client.state.room.crew_id,'original-crew');
 assert.equal(h.client.state.room.theme.sku,'expired-theme');assert.equal(h.client.state.room.id,'same-room');
 assert.equal(h.client.state.room.mode,'talk');assert.equal(h.sheet.open,false);assert.equal(h.accepted.length,1);
});

test('explicit field edits are saved as changes with numeric capacity; an unchanged form performs no request',async()=>{
 const h=harness();await h.client.openSettings();await h.client.saveTalkSettings(h.form);
 assert.equal(h.commands.length,0);assert.equal(h.sheet.open,false);
 await h.client.openSettings();h.form.elements.title.value='직접 바꾼 제목';h.form.elements.max_members.value='15';h.form.elements.background.value='basic_light';
 await h.client.saveTalkSettings(h.form);
 assert.deepEqual(h.commands,[{action:'settings',body:{title:'직접 바꾼 제목',max_members:15,background:'basic_light',revision:7}}]);
});

test('non-host or a host who lost ownership cannot submit settings',async()=>{
 const h=harness({owner:false});await h.client.openSettings();
 assert.ok(h.form.elements.filter(c=>c.dataset.voice!=='dismiss').every(c=>c.disabled));
 assert.equal(h.form.querySelector('[data-voice=dismiss]').disabled,false);
 h.form.elements.mode.value='talk';await h.client.saveTalkSettings(h.form);assert.equal(h.commands.length,0);
 const owner=harness();await owner.client.openSettings();owner.form.elements.mode.value='talk';owner.client.state.room.host_id='other';
 await owner.client.saveTalkSettings(owner.form);assert.equal(owner.commands.length,0);
});

test('a dismissed options request cannot overwrite a newer settings draft',async()=>{
 const old=deferred(),fresh=deferred(),h=harness({options:()=>old.promise});
 const pending=h.client.openSettings();assert.equal(h.client.settingsLoading,true);
 h.client.closeRoomPopup();h.setOptions(()=>fresh.promise);const reopened=h.client.openSettings();
 fresh.resolve(h.standardOptions);await reopened;h.form.elements.mode.value='talk';
 const draft=h.client.settingsDraft,ticket=h.client.settingsTicket;
 old.resolve({crews:[],themes:[{sku:'basic_light',selectable:true}]});await pending;
 assert.equal(h.client.settingsTicket,ticket);assert.equal(h.client.settingsDraft,draft);assert.equal(h.form.elements.mode.value,'talk');assert.equal(h.client.settingsLoading,false);
 await h.client.saveTalkSettings(h.form);assert.deepEqual(h.commands[0].body,{mode:'talk',revision:7});
});

for(const newer of ['settings','sound','replaced-view'])test('a late settings save accepts server state without closing '+newer,async()=>{
 const h=harness(),response=deferred();await h.client.openSettings();h.form.elements.mode.value='talk';
 h.setCommand(()=>response.promise);const saving=h.client.saveTalkSettings(h.form);
 await h.client.saveTalkSettings(h.form);assert.equal(h.commands.length,1,'double submit is guarded');
 let current;
 if(newer==='settings'){
  h.client.closeRoomPopup();await h.client.openSettings();h.form.elements.title.value='새 수정 중';current=h.sheet;
 }else if(newer==='sound'){
  current=h.makeSheet('voice-sound');h.client.showSheet('voice-sound');
 }else{
  h.sheet.isConnected=false;current=h.makeSheet('voice-room-settings');current.open=true;h.client.talkPopup=current;
 }
 const closes=current.closedCount;
 response.resolve({...h.client.state,room:{...h.client.state.room,mode:'talk',settings_revision:8}});await saving;
 assert.equal(h.client.state.room.mode,'talk');assert.equal(h.accepted.length,1);assert.equal(current.open,true);assert.equal(current.closedCount,closes);
 assert.equal(h.client.savingTalkSettings,false);if(newer==='settings')assert.equal(h.form.elements.title.value,'새 수정 중');
});

test('failed saving keeps the draft open, resets the pending guard and permits a retry',async()=>{
 const h=harness();await h.client.openSettings();h.form.elements.mode.value='talk';
 h.setCommand(async()=>{throw Error('저장 실패');});
 await assert.rejects(h.client.saveTalkSettings(h.form),/저장 실패/);
 assert.equal(h.sheet.open,true);assert.equal(h.form.elements.mode.value,'talk');assert.equal(h.client.state.room.mode,'karaoke');assert.equal(h.accepted.length,0);assert.equal(h.toasts.length,0);assert.equal(h.client.savingTalkSettings,false);
 h.setCommand(null);await h.client.saveTalkSettings(h.form);
 assert.equal(h.commands.length,2);assert.equal(h.client.state.room.mode,'talk');assert.equal(h.sheet.open,false);
});

test('missing or stale drafts and invalid capacity never submit settings',async()=>{
 const h=harness();await h.client.openSettings();h.form.elements.mode.value='talk';
 const draft=h.client.settingsDraft;h.client.settingsDraft=null;await h.client.saveTalkSettings(h.form);
 h.client.settingsDraft={...draft,ticket:draft.ticket-1};await h.client.saveTalkSettings(h.form);assert.equal(h.commands.length,0);
 h.client.settingsDraft=draft;h.form.elements.max_members.value='1';await assert.rejects(h.client.saveTalkSettings(h.form),/현재 참여 인원 이상/);assert.equal(h.commands.length,0);assert.equal(h.sheet.open,true);
});
