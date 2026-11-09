import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/room-release.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function element(){
 const attributes=new Map();
 return {children:[],dataset:{},style:{setProperty(){}},classList:{toggle(){}},
  append(...children){this.children.push(...children);},after(){},closest(){return this;},
  setAttribute(name,value){attributes.set(name,String(value));},getAttribute:name=>attributes.get(name)??null,
  removeAttribute(name){attributes.delete(name);},hasAttribute:name=>attributes.has(name),
  toggleAttribute(name,force){if(force)attributes.set(name,'');else attributes.delete(name);}
 };
}
function harness(){
 const button=element(),sound=element(),extra=element(),preset=element(),requests=[],watchers=[],win=new EventTarget();
 sound.querySelector=selector=>selector==='.voice-audio-extra'?extra:null;preset.value='studio';
 const nodes={'[data-voice=inbox]':button,'#voice-sound':sound,'#voice-noise':element(),'#voice-preset':preset,'#voice-reverb':element(),'#voice-music-player':element()};
 const host={querySelector:selector=>nodes[selector]??null};
 const c=vm.createContext({
  me:{id:'member'},window:win,document:{createElement:element},VoiceRoomClient:class {},
  MutationObserver:class{observe(){}disconnect(){}},setInterval:()=>1,clearInterval(){},
  api(path,method,body,options){
   assert.equal(path,'/api/dm/summary');assert.equal(method,'GET');assert.equal(options.fresh,true);
   return new Promise((resolve,reject)=>requests.push({resolve,reject}));
  },
  watchSocialChat(query,changed,status,revoked){
   assert.equal(query,'');const watcher={changed,revoked,stopped:false};watchers.push(watcher);
   return ()=>{watcher.stopped=true;};
  }
 });
 vm.runInContext(source,c);
 const client=new c.VoiceRoomClient();Object.assign(client,{host,closed:false,talkViewEvents:new AbortController()});client.bindRoomRelease();
 return {c,button,client,requests,watchers,
  read(){win.dispatchEvent(new Event('aifect:dm-read'));},change(){watchers.at(-1).changed();},
  async resolve(index,direct_unread){requests[index].resolve({unread:direct_unread,direct_unread});await settle();},
  async reject(index){requests[index].reject(new Error('temporary network failure'));await settle();}
 };
}

test('a read during an older room summary queues a fresh read and cannot restore the cleared badge',async()=>{
 const h=harness();assert.equal(h.requests.length,1);
 h.button.toggleAttribute('data-unread-dm',true);
 h.read();h.read();h.change();
 // The shared message badge refresh can finish before this room's older request.
 h.button.removeAttribute('data-unread-dm');h.button.setAttribute('aria-label','메시지');
 await h.resolve(0,1);
 assert.equal(h.button.hasAttribute('data-unread-dm'),false,'a stale summary must not relight a read notice');
 assert.equal(h.button.getAttribute('aria-label'),'메시지');
 assert.equal(h.requests.length,2,'read and SSE signals coalesce into one fresh summary');
 await h.resolve(1,0);
 assert.equal(h.button.hasAttribute('data-unread-dm'),false);assert.equal(h.requests.length,2);
});

test('the queued summary preserves other unread DMs and the accessible unread label',async()=>{
 const h=harness();h.read();await h.resolve(0,1);
 assert.equal(h.requests.length,2);await h.resolve(1,2);
 assert.equal(h.button.hasAttribute('data-unread-dm'),true);
 assert.equal(h.button.getAttribute('aria-label'),'메시지 · 안 읽은 DM 있음');
 h.change();await h.resolve(2,0);
 assert.equal(h.button.hasAttribute('data-unread-dm'),false);assert.equal(h.button.getAttribute('aria-label'),'메시지');
});

test('a failed old summary still runs the queued refresh',async()=>{
 const h=harness();h.read();await h.reject(0);
 assert.equal(h.requests.length,2);await h.resolve(1,0);
 assert.equal(h.button.hasAttribute('data-unread-dm'),false);
});

test('stale account and room cleanup block pending badge updates and queued requests',async t=>{
 for(const [name,stop] of [
  ['account change',h=>{h.c.me={id:'another-member'};}],
  ['signed out',h=>{h.c.me=null;}],
  ['room closed',h=>{h.client.closed=true;}],
  ['view aborted',h=>h.client.talkViewEvents.abort()],
  ['unread watcher stopped',h=>h.client.roomDMUnreadStop()],
  ['session revoked',h=>h.watchers[0].revoked()]
 ])await t.test(name,async()=>{
  const h=harness();h.read();stop(h);await h.resolve(0,1);h.read();h.change();await settle();
  assert.equal(h.button.hasAttribute('data-unread-dm'),false);
  assert.equal(h.requests.length,1,'a disposed room or account cannot start another summary');
 });
});

test('rebinding a room ignores its prior summary and uses only the new watcher',async()=>{
 const h=harness();h.read();h.client.bindRoomRelease();
 assert.equal(h.watchers[0].stopped,true);assert.equal(h.requests.length,2);
 await h.resolve(1,0);await h.resolve(0,1);
 assert.equal(h.button.hasAttribute('data-unread-dm'),false);assert.equal(h.requests.length,2);
 h.read();assert.equal(h.requests.length,3);await h.resolve(2,1);
 assert.equal(h.button.hasAttribute('data-unread-dm'),true);
});
