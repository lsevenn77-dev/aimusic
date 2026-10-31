import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 let sent=0;const attrs={},picker={hidden:true},button={setAttribute(k,v){attrs[k]=v;},focus(){}},input={value:'',selectionStart:0,selectionEnd:0,maxLength:500,focus(){},dispatchEvent(){},setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.selectionStart=this.selectionEnd=start+text.length;}};
 const nodes={'#voice-emoji-picker':picker,'#voice-message':input,'#voice-chat-form':{requestSubmit(){sent++;input.value='';input.selectionStart=input.selectionEnd=0;}}};
 const c=vm.createContext({VoiceRoomClient:class{},Event,$:s=>nodes[s]});vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8')+';this.client=new VoiceRoomClient();',c);
 c.client.host={querySelector:()=>button};return {client:c.client,input,picker,attrs,sent:()=>sent};
}
test('chat emoji picker stays open through repeated choices, message sending and another choice',async()=>{
 const f=fixture();await f.client.finalAction('emoji');assert.equal(f.picker.hidden,false);assert.equal(f.attrs['aria-expanded'],'true');
 for(const emoji of ['😀','💜','👏'])await f.client.finalAction('insert-emoji',emoji);
 assert.equal(f.input.value,'😀💜👏');assert.equal(f.picker.hidden,false);assert.equal(f.sent(),0);
 await f.client.finalAction('send-chat');assert.equal(f.sent(),1);assert.equal(f.picker.hidden,false);
 await f.client.finalAction('insert-emoji','✨');assert.equal(f.input.value,'✨');
 await f.client.finalAction('emoji-close');assert.equal(f.picker.hidden,true);assert.equal(f.attrs['aria-expanded'],'false');
});
test('emoji insertion replaces the selection and cannot exceed the chat length limit or split an emoji',async()=>{
 const f=fixture();f.input.value='좋은 노래';f.input.selectionStart=3;f.input.selectionEnd=5;
 await f.client.finalAction('insert-emoji','💜');assert.equal(f.input.value,'좋은 💜');assert.equal(f.input.selectionStart,5);
 f.input.value='a'.repeat(499);f.input.selectionStart=f.input.selectionEnd=499;await f.client.finalAction('insert-emoji','😀');assert.equal(f.input.value.length,499);
 f.input.selectionStart=498;f.input.selectionEnd=499;await f.client.finalAction('insert-emoji','😀');assert.equal(f.input.value.length,500);assert.ok(f.input.value.endsWith('😀'));
});
