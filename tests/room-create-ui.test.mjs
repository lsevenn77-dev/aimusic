import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const source=readFileSync(new URL('../dist/community-v3.js',import.meta.url),'utf8');
const binding=source.slice(source.indexOf('function bindVoiceLobby(){'),source.indexOf('\nasync function playBrowseV3'));
const suggestions={talk:'오늘의 이야기를 나눠요',karaoke:'함께 한 곡 불러요'};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Exercise the actual event handlers without network, audio or live account data.
function lobby({mode='talk',filter='all',crews=[{id:'my-crew',name:'우리 크루'}]}={}){
 const control=()=>({value:'',get valueAsNumber(){return this.value.trim()===''?NaN:Number(this.value);}});
 const fields=Object.fromEntries(['mode','title','visibility','max_members','background','crew_id','announcement'].map(name=>[name,control()]));
 const generate={disabled:false},error={textContent:''},crewInfo={hidden:true,textContent:''},crewLabel={title:''},crewChoice={disabled:false,closest:()=>crewLabel},notice={textContent:''},close={};
 const capacityButtons=[8,15,30].map(value=>({dataset:{capacity:String(value)},attributes:{},setAttribute(name,value){this.attributes[name]=value;}}));
 const selectors=new Map([['[data-auto-title]',generate],['.form-error',error],['[name="visibility"][value="crew"]',crewChoice],['.voice-crew-setting',crewInfo],['#voice-notice-length',notice]]);
 const form={elements:fields,isConnected:true,reset(){for(const field of Object.values(fields))field.value='';},querySelector:selector=>selectors.get(selector),querySelectorAll:selector=>selector==='[data-capacity]'?capacityButtons:[]};
 const modal={open:false,querySelector:selector=>selector==='form'?form:selector==='#v3-close-create'?close:null,showModal(){this.open=true;},close(){this.open=false;}};
 const open={dataset:{},isConnected:true,disabled:false,focus(){}};
 const root={dataset:{filter,defaultMode:mode,enabled:'true'},isConnected:true,querySelector:selector=>selector==='#v3-create-room'?open:selector==='#v3-room-create'?modal:null};
 const calls=[],cleanups=[],toasts=[],listeners=new Map();let autoResponse=async()=>({suggested_titles:{...suggestions,talk:'새로운 대화',karaoke:'새로운 노래'}}),listening=0;
 const history={state:null,pushState(state){this.state=state;},back(){this.state=null;listeners.get('popstate')?.();}};
 const location={hash:'#community',replace(route){this.hash=route;}};
 const context=vm.createContext({
  document:{querySelector:selector=>selector==='.talk-directory'?root:null},window:{addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}},
  me:{id:'local-user'},crypto:{randomUUID},URLSearchParams,history,location,requestAnimationFrame:fn=>fn(),toast:message=>toasts.push(message),
  voiceRequest:async(path,payload)=>{calls.push({path,payload});if(path==='options')return {crews,themes:[],suggested_titles:suggestions,suggested_title:suggestions.talk};if(path.startsWith('options?'))return autoResponse(path);if(path==='rooms')return {room:{id:'created-room',mode:payload.mode}};throw Error('Unexpected request: '+path);},
  fillRoomThemeChoices(){},registerRouteCleanup:fn=>cleanups.push(fn),bindTalkingDirectory(){},prepareVoiceListening(){listening++;},
  busyForm:(_form,work)=>()=>work(new Map(Object.entries(fields).map(([name,field])=>[name,field.value])))
 });
 vm.runInContext(binding+'\nbindVoiceLobby();',context);
 return {fields,form,modal,open,generate,error,crewInfo,crewChoice,crewLabel,capacityButtons,calls,toasts,location,
  start:()=>open.onclick(),setAutoResponse:fn=>{autoResponse=fn;},get listening(){return listening;},
  changeMode(value){fields.mode.value=value;form.onchange({target:{name:'mode'}});},
  typeTitle(value){fields.title.value=value;fields.title.oninput();},
  typeCapacity(value){fields.max_members.value=value;fields.max_members.oninput();},
  changeVisibility(value){fields.visibility.value=value;form.onchange({target:{name:'visibility'}});},
  dispose(){for(const cleanup of cleanups)cleanup();form.isConnected=false;root.isConnected=false;}
 };
}

test('room creation prefills each type and keeps separate manually edited titles',async()=>{
 for(const mode of ['talk','karaoke']){
  const ui=lobby({mode});await ui.start();
  assert.deepEqual(ui.toasts,[]);assert.equal(ui.modal.open,true);
  assert.equal(ui.fields.title.value,suggestions[mode]);
  assert.equal(ui.fields.title.required,mode==='karaoke');
  const other=mode==='talk'?'karaoke':'talk';
  ui.typeTitle('내가 작성한 '+mode);ui.changeMode(other);
  assert.equal(ui.fields.title.value,suggestions[other]);
  ui.typeTitle('내가 작성한 '+other);ui.changeMode(mode);
  assert.equal(ui.fields.title.value,'내가 작성한 '+mode);
  ui.changeMode(other);assert.equal(ui.fields.title.value,'내가 작성한 '+other);
 }
 const filtered=lobby({mode:'talk',filter:'karaoke'});await filtered.start();
 assert.equal(filtered.fields.title.value,suggestions.karaoke);
});

test('auto title requests the selected type and excludes its current title',async()=>{
 const ui=lobby({mode:'karaoke'});await ui.start();
 await ui.generate.onclick();
 let params=new URLSearchParams(ui.calls.at(-1).path.split('?')[1]);
 assert.equal(params.get('mode'),'karaoke');assert.equal(params.get('exclude'),suggestions.karaoke);
 assert.equal(ui.fields.title.value,'새로운 노래');assert.equal(ui.generate.disabled,false);
 ui.changeMode('talk');await ui.generate.onclick();
 params=new URLSearchParams(ui.calls.at(-1).path.split('?')[1]);
 assert.equal(params.get('mode'),'talk');assert.equal(params.get('exclude'),suggestions.talk);
 assert.equal(ui.fields.title.value,'새로운 대화');
 ui.changeMode('karaoke');assert.equal(ui.fields.title.value,'새로운 노래');
});

test('late title results cannot overwrite typing, another tab, or a reopened popup',async()=>{
 const ui=lobby();await ui.start();
 const typed=deferred();ui.setAutoResponse(()=>typed.promise);
 const first=ui.generate.onclick();assert.equal(ui.generate.disabled,true);
 ui.typeTitle('작성 중인 제목');typed.resolve({suggested_title:'늦은 자동 제목'});await first;
 assert.equal(ui.fields.title.value,'작성 중인 제목');
 const switched=deferred();ui.setAutoResponse(()=>switched.promise);
 const second=ui.generate.onclick();ui.changeMode('karaoke');switched.resolve({suggested_title:'늦은 토킹룸 제목'});await second;
 assert.equal(ui.fields.title.value,suggestions.karaoke);
 ui.changeMode('talk');assert.equal(ui.fields.title.value,'작성 중인 제목');
 const closed=deferred();ui.setAutoResponse(()=>closed.promise);
 const third=ui.generate.onclick();ui.modal.oncancel({preventDefault(){}});assert.equal(ui.modal.open,false);
 await ui.start();closed.resolve({suggested_title:'이전 팝업 제목'});await third;
 assert.equal(ui.fields.title.value,suggestions.talk);assert.equal(ui.generate.disabled,false);
});

test('an earlier title request cannot enable the button while a newer request is pending',async()=>{
 const ui=lobby();await ui.start();
 const older=deferred(),newer=deferred();ui.setAutoResponse(()=>older.promise);
 const first=ui.generate.onclick();ui.typeTitle('새로 작성');
 ui.setAutoResponse(()=>newer.promise);const second=ui.generate.onclick();
 older.resolve({suggested_title:'오래된 응답'});await first;
 assert.equal(ui.generate.disabled,true);assert.equal(ui.fields.title.value,'새로 작성');
 newer.resolve({suggested_title:'최근 응답'});await second;
 assert.equal(ui.generate.disabled,false);assert.equal(ui.fields.title.value,'최근 응답');
});

test('capacity presets and direct numeric input stay synchronized without coercing an empty field',async()=>{
 const ui=lobby();await ui.start();
 const pressed=()=>ui.capacityButtons.filter(button=>button.attributes['aria-pressed']==='true').map(button=>button.dataset.capacity);
 assert.equal(ui.fields.max_members.value,'30');assert.deepEqual(pressed(),['30']);
 for(const button of ui.capacityButtons){button.onclick();assert.equal(ui.fields.max_members.value,button.dataset.capacity);assert.deepEqual(pressed(),[button.dataset.capacity]);}
 ui.typeCapacity('12');assert.deepEqual(pressed(),[]);
 ui.typeCapacity('15');assert.deepEqual(pressed(),['15']);
 ui.typeCapacity('');assert.equal(ui.fields.max_members.value,'');assert.deepEqual(pressed(),[]);
 for(const invalid of ['', '1', '31', '-8', '3.5', 'abc']){
  ui.typeCapacity(invalid);await assert.rejects(ui.form.onsubmit(),/2~30명 사이의 정수/);
 }
 assert.equal(ui.calls.some(call=>call.path==='rooms'),false);assert.equal(ui.listening,0);
 ui.typeCapacity('12');await ui.form.onsubmit();
 assert.equal(ui.calls.at(-1).payload.max_members,12);assert.equal(typeof ui.calls.at(-1).payload.max_members,'number');
});

test('crew visibility uses the sole membership and rejects missing or ambiguous membership',async()=>{
 const joined=lobby();await joined.start();
 assert.equal(joined.crewChoice.disabled,false);assert.equal(joined.fields.crew_id.value,'my-crew');assert.equal(joined.crewInfo.hidden,true);
 joined.changeVisibility('crew');assert.equal(joined.crewInfo.hidden,false);assert.match(joined.crewInfo.textContent,/우리 크루/);
 joined.fields.crew_id.value='forged-crew';await joined.form.onsubmit();
 assert.equal(joined.calls.at(-1).payload.crew_id,'my-crew');
 for(const crews of [[],[{id:'one',name:'첫째'},{id:'two',name:'둘째'}]]){
  const ui=lobby({crews});await ui.start();
  assert.equal(ui.crewChoice.disabled,true);assert.equal(ui.fields.crew_id.value,'');assert.equal(ui.crewInfo.hidden,false);assert.match(ui.crewLabel.title,/크루/);
  ui.changeVisibility('crew');await assert.rejects(ui.form.onsubmit(),/크루/);
  assert.equal(ui.calls.some(call=>call.path==='rooms'),false);assert.equal(ui.listening,0);
 }
});
