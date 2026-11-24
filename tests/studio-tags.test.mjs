import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/studio-tags.js',import.meta.url),'utf8');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=value=>value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

class FakeEvent{
 constructor(type,options={}){this.type=type;Object.assign(this,options);}
}
class Element{
 constructor(tag='div',attrs={}){
  this.tag=tag;this.attrs={};this.dataset={};this.children=[];this.listeners=new Map();this.isConnected=true;
  this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.classes=new Set();
  this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
  for(const [key,value] of Object.entries(attrs))this.setAttribute(key,value);
 }
 setAttribute(name,value){this.attrs[name]=String(value);if(name==='class')this.classes=new Set(String(value).split(' '));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 hasAttribute(name){return Object.hasOwn(this.attrs,name);}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}return this;}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 matches(selector){return selector.split(',').some(part=>{
  const s=part.trim();if(s.startsWith('#'))return this.attrs.id===s.slice(1);
  if(s.startsWith('.'))return this.classes.has(s.slice(1));
  const attr=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/u);
  return attr?this.hasAttribute(attr[1])&&(attr[2]===undefined||this.attrs[attr[1]]===attr[2]):this.tag===s;
 });}
 closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){
  if(selector==='#lyrics-rows .lyric-text-input')return this.querySelector('#lyrics-rows')?.querySelectorAll('.lyric-text-input')||[];
  return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 set innerHTML(value){
  this.html=value;this.children=[];
  for(const match of value.matchAll(/<button\b([^>]*)>/gu)){
   const attrs={};for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/gu))attrs[attr[1]]=decode(attr[2]);
   this.append(new Element('button',attrs));
  }
 }
 get innerHTML(){return this.html||'';}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==fn));}
 dispatchEvent(event){
  if(!event.target)event.target=this;
  this['on'+event.type]?.(event);
  for(const fn of [...this.listeners.get(event.type)||[]])fn(event);
  if(event.bubbles&&this.parent)this.parent.dispatchEvent(event);
  return true;
 }
 focus(){this.focused=true;}
}
function clock(){
 let now=0,serial=0;const jobs=new Map();
 return {setTimeout:(fn,delay=0)=>{const id=++serial;jobs.set(id,{at:now+delay,fn});return id;},clearTimeout:id=>jobs.delete(id),
  tick(duration){const end=now+duration;let guard=0;while(true){const next=[...jobs.entries()].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++guard>100)throw Error('Timer loop');now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=end;}};
}
function harness({title='',lyrics='',tags='',mode='auto',rows=[]}={}){
 const timers=clock(),requests=[],observers=[];
 const html=new Element('html'),form=new Element('form'),field=new Element('div',{'data-song-tags':''});
 const input=new Element('input',{name:'tags'});input.value=tags;input.maxLength=300;
 const titleInput=new Element('input',{name:'title'});titleInput.value=title;
 const selected=new Element('div',{'data-song-tag-selected':''}),suggestions=new Element('div',{'data-song-tag-suggestions':''});
 const refresh=new Element('button',{'data-song-tag-refresh':''}),status=new Element('p',{'data-song-tag-status':''});
 field.append(input,selected,suggestions,refresh,status);
 const lyricRoot=new Element('section',{id:'lyrics-editor'}),lyricMode=new Element('select',{id:'lyrics-mode'});lyricMode.value=mode;
 const auto=new Element('textarea',{id:'auto-lyrics-source'});auto.value=lyrics;
 const manual=new Element('textarea',{id:'lyrics-source'});manual.value=lyrics;
 const rowBox=new Element('div',{id:'lyrics-rows'});rowBox.append(...rows.map(value=>{const el=new Element('input',{class:'lyric-text-input'});el.value=value;return el;}));
 const alignmentStatus=new Element('div',{id:'alignment-status'}),aiTool=new Element('input',{name:'ai_tool'});aiTool.value='AI 사용 안 함';
 const autoFile=new Element('input',{id:'auto-lyrics-file'});let finishImport;
 autoFile.onchange=async()=>{auto.value=await new Promise(resolve=>{finishImport=resolve;});};
 lyricRoot.append(lyricMode,auto,manual,rowBox,alignmentStatus,autoFile);form.append(titleInput,field,lyricRoot,aiTool);html.append(form);
 const document={documentElement:html,querySelectorAll:selector=>html.querySelectorAll(selector)};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const context=vm.createContext({document,esc:escape,Event:FakeEvent,AbortController,MutationObserver:Observer,...timers,
  lyricEditor:{root:lyricRoot,dirty:false},api:(path,method,body,options)=>new Promise((resolve,reject)=>requests.push({path,method,body,signal:options.signal,resolve,reject}))});
 vm.runInContext(source,context);context.bindSongTagSuggestions();
 const emit=(node,type,props={})=>node.dispatchEvent(new FakeEvent(type,{bubbles:true,...props}));
 const edit=(node,value,props={})=>{node.value=value;emit(node,'input',props);};
 const mutate=target=>{for(const observer of observers)if(!observer.disconnected)observer.callback([{target}]);};
 const clickAdd=tag=>{const button=suggestions.querySelectorAll('[data-song-tag-add]').find(node=>node.dataset.songTagAdd===tag);assert.ok(button,`Suggestion ${tag} is visible`);emit(button,'click');};
 return {context,timers,requests,observers,document,html,form,field,input,titleInput,selected,suggestions,refresh,status,lyricRoot,lyricMode,auto,manual,rowBox,alignmentStatus,autoFile,finishAutoImport:value=>finishImport(value),aiTool,emit,edit,mutate,clickAdd};
}

test('HTML retains the named comma-separated input, 300 character limit and safe legacy value',()=>{
 const e=harness(),html=e.context.songTagFieldHTML('Love, <script>" #밤');
 assert.match(html,/name="tags" maxlength="300"/u);assert.match(html,/태그 \(쉼표로 구분\)/u);
 assert.match(html,/Love, &lt;script&gt;&quot; #밤/u);assert.match(html,/제목이나 가사를 입력하면 어울리는 태그를 추천합니다\./u);
 assert.doesNotMatch(html,/name="ai_tool"/u);
});

test('empty inputs never request suggestions and automatic requests debounce for 1.2 seconds',()=>{
 const e=harness();e.timers.tick(5000);assert.equal(e.requests.length,0);assert.equal(e.refresh.disabled,true);
 e.edit(e.titleInput,'첫 제목');e.timers.tick(1100);assert.equal(e.requests.length,0);
 e.edit(e.titleInput,'완성한 제목');e.timers.tick(1199);assert.equal(e.requests.length,0);
 e.timers.tick(1);assert.equal(e.requests.length,1);assert.equal(e.requests[0].path,'/api/studio/tag-suggestions');
 assert.equal(e.requests[0].method,'POST');assert.equal(e.requests[0].body.title,'완성한 제목');assert.equal(e.refresh.disabled,true);
});

test('existing tags survive binding; only clicked suggestions are saved and duplicates are normalized',async()=>{
 const e=harness({title:'너에게',tags:'  LOVE, #밤  '});assert.equal(e.input.value,'  LOVE, #밤  ');
 e.timers.tick(1200);e.requests[0].resolve({tags:['love','#밤','그리움','새로운 시작','여행','도시','비','꿈','희망','추가'],source:'ai'});await flush();
 assert.equal(e.suggestions.querySelectorAll('[data-song-tag-add]').length,8);assert.equal(e.input.value,'  LOVE, #밤  ');
 e.clickAdd('love');e.clickAdd('밤');assert.equal(e.input.value,'  LOVE, #밤  ');
 e.clickAdd('그리움');assert.equal(e.input.value,'LOVE, 밤, 그리움');assert.doesNotMatch(e.input.value,/새로운 시작/u);
 const remove=e.selected.querySelectorAll('[data-song-tag-remove]').find(button=>button.dataset.songTagRemove==='밤');e.emit(remove,'click');
 assert.equal(e.input.value,'LOVE, 그리움');assert.equal(e.aiTool.value,'AI 사용 안 함');
 e.edit(e.input,'Love, #love, 밤,  밤 ');e.emit(e.input,'change');assert.equal(e.input.value,'Love, 밤');
});

test('tag limit failure leaves the existing input intact and does not block manual editing',async()=>{
 const e=harness({title:'밤',tags:'가'.repeat(299)});e.timers.tick(1200);
 e.requests[0].resolve({tags:['그리움'],source:'text'});await flush();e.clickAdd('그리움');
 assert.equal(e.input.value.length,299);assert.match(e.status.textContent,/300자/u);
 e.edit(e.input,'직접 입력');assert.equal(e.input.value,'직접 입력');assert.doesNotMatch(e.status.textContent,/300자/u);
 assert.equal(e.aiTool.value,'AI 사용 안 함');
});

test('out-of-order and aborted responses never replace suggestions for the current title',async()=>{
 const e=harness({title:'이별'});e.timers.tick(1200);const first=e.requests[0];
 e.edit(e.titleInput,'새로운 시작');assert.equal(first.signal.aborted,true);e.timers.tick(1200);
 e.requests[1].resolve({tags:['희망'],source:'ai'});await flush();
 first.resolve({tags:['이별'],source:'ai'});await flush();
 assert.match(e.suggestions.innerHTML,/희망/u);assert.doesNotMatch(e.suggestions.innerHTML,/이별/u);assert.equal(e.input.value,'');
});

test('sync lyrics use edited row words or dirty source text and ignore timestamp-only edits',()=>{
 const e=harness({title:'곡',mode:'synced',lyrics:'[00:01.000]이전 가사',rows:['현재 가사']});
 e.timers.tick(1200);assert.equal(e.requests[0].body.lyrics,'현재 가사');
 e.context.lyricEditor.dirty=true;e.edit(e.manual,'[00:11.120][Verse]새 가사\n[00:20.000]이어지는 가사');e.timers.tick(1200);
 assert.equal(e.requests[1].body.lyrics,'새 가사\n이어지는 가사');
 e.edit(e.manual,'[00:14.500][Verse]새 가사\n[00:23.000]이어지는 가사');e.timers.tick(1200);assert.equal(e.requests.length,2);
 e.context.lyricEditor.dirty=false;e.edit(e.rowBox.children[0],'행에서 바꾼 가사');e.timers.tick(1200);assert.equal(e.requests[2].body.lyrics,'행에서 바꾼 가사');
});

test('automatic lyrics ignore hidden sync text and detect asynchronously imported files',()=>{
 const e=harness({mode:'auto',lyrics:'처음 가사'});e.timers.tick(1200);assert.equal(e.requests[0].body.lyrics,'처음 가사');
 e.edit(e.manual,'숨겨진 직접 싱크 가사');e.timers.tick(1200);assert.equal(e.requests.length,1);
 e.auto.value='파일에서 불러온 가사';e.mutate(e.alignmentStatus);e.timers.tick(1200);assert.equal(e.requests[1].body.lyrics,'파일에서 불러온 가사');
 e.lyricMode.value='none';e.emit(e.lyricMode,'change');e.timers.tick(1200);assert.equal(e.requests.length,2);assert.equal(e.refresh.disabled,true);
});

test('TXT import completion is detected when assigning a textarea produces no DOM mutation',async()=>{
 const e=harness();e.emit(e.autoFile,'change');e.timers.tick(1500);assert.equal(e.requests.length,0);
 e.finishAutoImport('파일로 가져온 노랫말');await flush();e.timers.tick(1199);assert.equal(e.requests.length,0);
 e.timers.tick(1);assert.equal(e.requests.length,1);assert.equal(e.requests[0].body.lyrics,'파일로 가져온 노랫말');
});

test('Korean composition waits for completion and refresh reuses the latest complete input',()=>{
 const e=harness();e.emit(e.titleInput,'compositionstart');e.edit(e.titleInput,'사',{isComposing:true});e.timers.tick(1500);assert.equal(e.requests.length,0);
 e.titleInput.value='사랑';e.emit(e.titleInput,'compositionend');e.timers.tick(1200);assert.equal(e.requests.length,1);assert.equal(e.requests[0].body.title,'사랑');
});

test('request errors allow retry and never clear typed tags or modify creation credits',async()=>{
 const e=harness({title:'기다림',tags:'내 태그'});e.timers.tick(1200);e.edit(e.input,'직접 고른 태그');
 e.requests[0].reject(new Error('Offline'));await flush();assert.match(e.status.textContent,/직접 입력하거나 다시 시도/u);assert.equal(e.refresh.disabled,false);
 e.emit(e.refresh,'click');assert.equal(e.requests.length,2);e.requests[1].resolve({tags:['기다림'],source:'text'});await flush();
 assert.equal(e.input.value,'직접 고른 태그');assert.equal(e.aiTool.value,'AI 사용 안 함');assert.match(e.suggestions.innerHTML,/기다림/u);
});

test('timeout aborts the request, offers retry and ignores a late successful response',async()=>{
 const e=harness({title:'새벽'});e.timers.tick(1200);const first=e.requests[0];e.timers.tick(20000);
 assert.equal(first.signal.aborted,true);assert.equal(e.refresh.disabled,false);assert.match(e.status.textContent,/다시 시도/u);
 first.resolve({tags:['늦은 응답'],source:'ai'});await flush();assert.doesNotMatch(e.suggestions.innerHTML,/늦은 응답/u);
 e.emit(e.refresh,'click');assert.equal(e.requests.length,2);
});

test('repeated binding is harmless and unmounting aborts pending work and drops late results',async()=>{
 const e=harness({title:'떠나기'});e.context.bindSongTagSuggestions();e.timers.tick(1200);assert.equal(e.requests.length,1);
 e.field.isConnected=false;e.mutate(e.html);assert.equal(e.requests[0].signal.aborted,true);assert.equal(e.observers[0].disconnected,true);
 const previous=e.suggestions.innerHTML;e.requests[0].resolve({tags:['남은 응답'],source:'ai'});await flush();assert.equal(e.suggestions.innerHTML,previous);
});

test('a response checks current source values even when a programmatic update emitted no input event',async()=>{
 const e=harness({title:'전 제목'});e.timers.tick(1200);e.titleInput.value='바뀐 제목';
 e.requests[0].resolve({tags:['전 태그'],source:'ai'});await flush();assert.doesNotMatch(e.suggestions.innerHTML,/전 태그/u);
 e.timers.tick(1200);assert.equal(e.requests.length,2);assert.equal(e.requests[1].body.title,'바뀐 제목');
});
