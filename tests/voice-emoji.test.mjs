import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 let sent=0;const attrs={},picker={hidden:true,open:false,close(){this.open=false;}},button={setAttribute(k,v){attrs[k]=v;},focus(){}},input={value:'',selectionStart:0,selectionEnd:0,maxLength:500,focus(){},dispatchEvent(){},setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.selectionStart=this.selectionEnd=start+text.length;}};
 const nodes={'#voice-emoji-picker':picker,'#voice-message':input,'#voice-chat-form':{requestSubmit(){sent++;input.value='';input.selectionStart=input.selectionEnd=0;}}};
 const c=vm.createContext({VoiceRoomClient:class{},Event,$:s=>nodes[s]});vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8')+';this.client=new VoiceRoomClient();',c);
 c.client.adoptRoomPopup=sheet=>{sheet.open=true;};c.client.host={querySelector:()=>button};return {client:c.client,input,picker,attrs,sent:()=>sent};
}
test('chat emoji picker stays open while composing repeated choices and supports explicit close',async()=>{
 const f=fixture();await f.client.finalAction('emoji');assert.equal(f.picker.hidden,false);assert.equal(f.attrs['aria-expanded'],'true');
 for(const emoji of ['😀','💜','👏'])await f.client.finalAction('insert-emoji',emoji);
 assert.equal(f.input.value,'😀💜👏');assert.equal(f.picker.hidden,false);assert.equal(f.sent(),0);
 await f.client.finalAction('emoji-close');assert.equal(f.picker.hidden,true);assert.equal(f.attrs['aria-expanded'],'false');
});
test('emoji insertion replaces the selection and cannot exceed the chat length limit or split an emoji',async()=>{
 const f=fixture();f.input.value='좋은 노래';f.input.selectionStart=3;f.input.selectionEnd=5;
 await f.client.finalAction('insert-emoji','💜');assert.equal(f.input.value,'좋은 💜');assert.equal(f.input.selectionStart,5);
 f.input.value='a'.repeat(499);f.input.selectionStart=f.input.selectionEnd=499;await f.client.finalAction('insert-emoji','😀');assert.equal(f.input.value.length,499);
 f.input.selectionStart=498;f.input.selectionEnd=499;await f.client.finalAction('insert-emoji','😀');assert.equal(f.input.value.length,500);assert.ok(f.input.value.endsWith('😀'));
});

function boundChat(liveMode,command,refresh=async()=>{}){
 const nodes=new Map(),attrs={},picker={hidden:true,open:false,close(){this.open=false;}},button={setAttribute(key,value){attrs[key]=value;},focus(){}};
 const input={value:'😀💜👏',selectionStart:6,selectionEnd:6,maxLength:500,focus(){},dispatchEvent(){}};
 const form={elements:{body:input},reset(){input.value='';},requestSubmit(){this.pending=this.onsubmit();}};
 nodes.set('#voice-chat-form',form);nodes.set('#voice-message',input);nodes.set('#voice-emoji-picker',picker);
 const get=selector=>{
  if(selector==='[data-voice="emoji"]')return button;
  if(!nodes.has(selector))nodes.set(selector,{value:'',elements:{},addEventListener(){}});
  return nodes.get(selector);
 };
 const context=vm.createContext({Event,crypto,navigator:{mediaDevices:{}},localStorage:{getItem:()=>null},
  window:{innerWidth:390,innerHeight:844,addEventListener(){},removeEventListener(){}},
  document:{addEventListener(){}},$:get,busyForm:(element,callback)=>callback});
 vm.runInContext(readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8')+'\nthis.client=new VoiceRoomClient("test-room");',context);
 const client=context.client;
 Object.assign(client,{liveMode,command,refresh,bindTalkViews(){},adoptRoomPopup(sheet){sheet.open=true;},joinAttempted:true,resumeSound(){},bindAudioSettings(){},giftSummary(){}});
 client.bind({isConnected:false,querySelector:get,addEventListener(){}});
 return {client,input,form,picker,attrs};
}

for(const liveMode of [false,true]){
 const mode=liveMode?'live karaoke':'talking room';
 test(mode+' closes the emoji picker only after successful send, for button and Enter',async()=>{
  for(const entry of ['button','enter']){
   let acknowledge;
   const received=new Promise(resolve=>{acknowledge=resolve;});
   const calls=[],f=boundChat(liveMode,async(action,payload)=>{calls.push({action,payload});await received;});
   await f.client.finalAction('emoji');
   if(entry==='button')await f.client.finalAction('send-chat');
   else f.input.onkeydown({key:'Enter',preventDefault(){}});
   assert.equal(f.picker.hidden,false,'pending delivery must keep the picker open');
   acknowledge();await f.form.pending;
   assert.equal(calls.length,1);assert.equal(calls[0].action,'chat');assert.equal(calls[0].payload.body,'😀💜👏');
   assert.equal(f.picker.hidden,true);assert.equal(f.attrs['aria-expanded'],'false');assert.equal(f.input.value,'');
  }
 });
 test(mode+' preserves the picker, message and idempotency key when delivery fails',async()=>{
  const requests=[];let fail=true;
  const f=boundChat(liveMode,async(action,payload)=>{requests.push(payload);if(fail)throw Error('offline');});
  await f.client.finalAction('emoji');f.form.requestSubmit();await assert.rejects(f.form.pending,/offline/);
  assert.equal(f.picker.hidden,false);assert.equal(f.attrs['aria-expanded'],'true');assert.equal(f.input.value,'😀💜👏');
  fail=false;f.form.requestSubmit();await f.form.pending;
  assert.equal(requests[0].request_id,requests[1].request_id);assert.equal(f.picker.hidden,true);assert.equal(f.input.value,'');
 });
 test(mode+' keeps the picker closed when only the post-send refresh fails',async()=>{
  const f=boundChat(liveMode,async()=>{},async()=>{throw Error('refresh failed');});
  await f.client.finalAction('emoji');f.form.requestSubmit();await assert.rejects(f.form.pending,/refresh failed/);
  assert.equal(f.picker.hidden,true);assert.equal(f.attrs['aria-expanded'],'false');assert.equal(f.input.value,'');assert.equal(f.client.chatPending,null);
 });
}
