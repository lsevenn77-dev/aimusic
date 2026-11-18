import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

function followButton(key,{profile=true,followsViewer=false,fixedLabel='',span=true}={}){
 const attributes=new Map(),label={dataset:{followLabel:fixedLabel},textContent:'팔로우'};
 const button={
  dataset:{follow:key,...(profile?{followPresentation:'profile',followsViewer:String(followsViewer)}:{})},
  disabled:false,textContent:'팔로우',label:span?label:null,
  querySelector:selector=>selector==='[data-follow-label]'&&span?label:null,
  closest:()=>({querySelector:()=>({textContent:'Target'})}),
  setAttribute(name,value){attributes.set(name,String(value));},
  getAttribute:name=>attributes.get(name),
  classList:{toggle(){}},
 };
 return button;
}

function client({follows=[],reverse=false}={}){
 const page=followButton('producer/target',{followsViewer:reverse});
 const popup=followButton('producer/target',{followsViewer:reverse});
 const legacy=followButton('producer/target',{profile:false,span:false});
 const unrelated=followButton('producer/unrelated');
 const buttons=[page,popup,legacy,unrelated],requests=[],events=[];
 const countLabel={textContent:'7'},counter={dataset:{followers:'producer/target',count:'7'},querySelector:selector=>selector==='[data-follow-count]'?countLabel:null};
 const document={addEventListener(){},querySelectorAll(selector){
  if(selector==='[data-follow]')return buttons;
  if(selector==='[data-followers]')return [counter];
  return [];
 }};
 const context=vm.createContext({
  fetch:async(path,options)=>{const held=deferred();requests.push({path,method:options.method,finish:held.resolve});return held.promise;},
  structuredClone,URL,Map,Date,console,AifectGenres:{GENRES:[]},Audio:class{},
  sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},document,
  window:{dispatchEvent:event=>events.push(event)},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  initialFollows:follows,
 });
 vm.runInContext(source,context);
 vm.runInContext("me={id:'viewer'};library.follows=initialFollows;toast=()=>{};",context);
 const run=code=>vm.runInContext(code,context);
 return {context,run,page,popup,legacy,unrelated,buttons,counter,countLabel,requests,events,
  toggle:button=>context.toggleFollow(button),
  paint:(...args)=>context.paintFollowState(...args),
  finish(body,status=200){const request=requests.at(-1);assert.ok(request,'a follow request must be pending');request.finish(response(body,status));},
 };
}

function assertButton(button,{text,following,busy=false}){
 assert.equal(button.label?.textContent??button.textContent,text);
 assert.equal(button.getAttribute('aria-pressed'),String(following));
 assert.equal(button.getAttribute('aria-busy'),String(busy));
 assert.equal(button.disabled,busy,'only an in-flight request disables toggling');
}

test('profile button labels and state stay synchronized without changing other follow surfaces',()=>{
 const c=client();
 c.paint('producer/target',true,false,8,false);
 for(const button of [c.page,c.popup])assertButton(button,{text:'팔로우중',following:true});
 assertButton(c.legacy,{text:'팔로잉',following:true});
 assert.equal(c.unrelated.getAttribute('aria-pressed'),undefined,'a different person is untouched');
 c.paint('producer/target',true,false,8,true);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true});
 c.paint('producer/target',true,false);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true});
 c.paint('producer/target',false,false,7);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔로우',following:false});
 assertButton(c.legacy,{text:'팔로우',following:false});
 assert.equal(c.counter.dataset.count,'7');assert.equal(c.countLabel.textContent,'7');
});

test('artist buttons show the followed caption independently of personal follow-back metadata',()=>{
 const c=client(),artist=followButton('artist/target',{followsViewer:true,fixedLabel:'팔로우'});
 c.buttons.push(artist);
 c.paint('artist/target',true,false,undefined,true);
 assertButton(artist,{text:'팔로우중',following:true});
 c.paint('artist/target',false,false,undefined,false);
 assertButton(artist,{text:'팔로우',following:false});
});

test('follow and unfollow update both open surfaces immediately, ignore duplicate clicks, and use server mutual state',async()=>{
 const c=client(),follow=c.toggle(c.page);
 assert.equal(c.run("followed('producer','target')"),true);
 for(const button of [c.page,c.popup])assertButton(button,{text:'팔로우중',following:true,busy:true});
 assert.equal(c.countLabel.textContent,'8');
 await c.toggle(c.popup);assert.equal(c.requests.length,1,'the popup cannot submit the same pending follow twice');
 assert.deepEqual(c.requests.map(({path,method})=>({path,method})),[{path:'/api/producers/target/follow',method:'PUT'}]);
 c.finish({following:true,follows_viewer:true,followers:8,profile:{id:'target',name:'Target'}});await follow;
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true});
 assert.equal(c.run('pendingFollows.size'),0);
 assert.equal(c.events.length,1);assert.equal(c.events[0].type,'aifect:follow-saved');
 const unfollow=c.toggle(c.popup);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔로우',following:false,busy:true});
 assert.equal(c.countLabel.textContent,'7');assert.equal(c.requests[1].method,'DELETE');
 c.finish({following:false,follows_viewer:true,followers:7,profile:{id:'target'}});await unfollow;
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔로우',following:false});
 assert.equal(c.run("followed('producer','target')"),false);assert.equal(c.events.length,2);
});

test('a server response clears an outdated mutual label and a later repaint keeps it cleared',async()=>{
 const c=client({reverse:true}),pending=c.toggle(c.page);
 assertButton(c.page,{text:'맞팔중',following:true,busy:true});
 c.finish({following:true,follows_viewer:false,followers:8,profile:{id:'target'}});await pending;
 for(const button of [c.page,c.popup])assertButton(button,{text:'팔로우중',following:true});
 c.run('paintInteractions()');
 for(const button of [c.page,c.popup])assertButton(button,{text:'팔로우중',following:true});
});

test('failed follow restores the prior state and follower count on the page and popup',async()=>{
 const c=client({reverse:true}),pending=c.toggle(c.popup);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true,busy:true});
 c.finish({error:'offline'},503);await assert.rejects(pending,/offline/);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔로우',following:false});
 assertButton(c.legacy,{text:'팔로우',following:false});
 assert.equal(c.run("followed('producer','target')"),false);assert.equal(c.run('pendingFollows.size'),0);
 assert.equal(c.countLabel.textContent,'7');assert.equal(c.events.length,0);
 assert.equal(c.requests.length,1,'failure does not fetch or replace the library');
});

test('failed unfollow restores the mutual state and leaves the button usable for retry',async()=>{
 const c=client({follows:[{kind:'producer',target_id:'target',name:'Target'}],reverse:true});
 c.paint('producer/target',true,false);
 const pending=c.toggle(c.page);
 assertButton(c.popup,{text:'맞팔로우',following:false,busy:true});
 c.finish({error:'offline'},503);await assert.rejects(pending,/offline/);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true});
 assert.equal(c.run("followed('producer','target')"),true);assert.equal(c.run('pendingFollows.size'),0);
 assert.equal(c.countLabel.textContent,'7');assert.equal(c.events.length,0);
 const retry=c.toggle(c.popup);assert.equal(c.requests.length,2);assert.equal(c.requests[1].method,'DELETE');
 c.finish({following:false,follows_viewer:false,followers:6,profile:{id:'target'}});await retry;
 for(const button of [c.page,c.popup])assertButton(button,{text:'팔로우',following:false});
 assert.equal(c.countLabel.textContent,'6');
});

test('a delayed profile preview cannot undo a completed page follow and retries with the current relationship',async()=>{
 const c=client(),renders=[],updates=[],errors=[],panels=[];
 c.context.location={hash:'#producer/target'};
 c.context.window.addEventListener=()=>{};
 Object.assign(c.context.document,{
  body:{style:{overflow:''},append:panel=>panels.push(panel)},
  createElement:()=>({
   setAttribute(){},querySelectorAll:()=>[],querySelector:()=>({focus(){}}),
   showModal(){this.open=true;},close(){this.open=false;},remove(){},addEventListener(){},
  }),
 });
 vm.runInContext(readFileSync(new URL('../dist/profile-preview.js',import.meta.url),'utf8'),c.context);
 c.context.profilePreviewHTML=data=>{renders.push(data);return '<section>Profile</section>';};
 c.context.toast=message=>errors.push(message);
 const originalUpdate=c.context.updateFollowLocal;
 c.context.updateFollowLocal=(...args)=>{updates.push(args);return originalUpdate(...args);};
 const preview=c.context.openProfilePreview('target',null);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.requests.length,1);assert.equal(c.requests[0].path,'/api/producers/target/preview');
 const follow=c.toggle(c.page);
 c.requests[1].finish(response({following:true,follows_viewer:true,followers:8,profile:{id:'target',name:'Target'}}));
 await follow;
 const savedUpdates=updates.length;
 assert.equal(c.run("followed('producer','target')"),true);
 assertButton(c.page,{text:'맞팔중',following:true});
 c.requests[0].finish(response({following:false,follows_viewer:false,followers:7,profile:{id:'target',name:'Target'}}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.requests.length,3,'the obsolete preview response must trigger one fresh preview read');
 assert.equal(c.requests[2].path,'/api/producers/target/preview');assert.equal(c.requests[2].method,'GET');
 assert.equal(updates.length,savedUpdates,'the obsolete response must not write shared follow state');
 assert.equal(renders.length,0,'the obsolete profile must not be displayed');
 assert.equal(c.run("followed('producer','target')"),true);
 c.requests[2].finish(response({following:true,follows_viewer:true,followers:8,profile:{id:'target',name:'Target'}}));
 await preview;
 assert.equal(updates.length,savedUpdates+1);assert.equal(renders.length,1);assert.equal(renders[0].following,true);
 assert.equal(panels.length,1);assert.equal(panels[0].open,true);assert.deepEqual(errors,[]);
 for(const button of [c.page,c.popup])assertButton(button,{text:'맞팔중',following:true});
 assert.equal(c.run("followed('producer','target')"),true);
});
