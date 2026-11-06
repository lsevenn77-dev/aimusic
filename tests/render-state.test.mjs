import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/render-state.js','utf8');
function boot({marker=null,hash='#home',route='home'}={}){
 const handlers=new Map(),timers=new Map(),nodes=new Map();let sequence=0,reloads=0,replacements=0;
 const root={dataset:{},toggleAttribute(name,on){this[name]=on;}},main={dataset:{route},inert:false,setAttribute(){},removeAttribute(){}};
 for(const id of ['route-pending-message','route-pending-actions','route-retry'])nodes.set(id,{});nodes.set('main',main);
 const location={hash,pathname:'/',search:'',href:'https://aifect.test/'+hash,reload(){reloads++;},replace(){replacements++;if(marker)marker.targeted=true;}};
 const history={state:{retained:true},replaceState(state,title,url){this.state=state;location.href='https://aifect.test'+url;location.hash=url.slice(url.indexOf('#'));}};
 const context=vm.createContext({URLSearchParams,document:{documentElement:root,getElementById:id=>nodes.get(id),querySelector:()=>marker},location,history,window:{addEventListener(name,fn){handlers.set(name,fn);}},setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 vm.runInContext(source,context);const api=context.window.AifectRender;
 return {api,root,main,nodes,handlers,location,history,win:context.window,get replacements(){return replacements;},tick(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());},get reloads(){return reloads;},get timers(){return timers.size;}};
}
test('head establishes loading before any body or application request',()=>{
 const c=boot();assert.equal(c.root.dataset.renderState,'loading');c.api.mount();assert.equal(c.main.inert,true);
 const template=readFileSync('dist/index.html','utf8');assert.ok(template.indexOf('<!--INITIAL_RENDER_HEAD-->')<template.indexOf('<script src='));assert.doesNotMatch(template,/route-initial-content/);
 assert.match(template,/<main id="main"[\s\S]*?公開|<main id="main"[\s\S]*?공개 음악/);
 const css=readFileSync('dist/render-state.css','utf8');assert.match(css,/loading"\] #main[^}]*display:none!important/);assert.match(css,/#route-pending\{display:none\}/);
});
test('only the current completed render can reveal content',()=>{
 const c=boot();const first=c.api.begin('home',undefined,()=>{}),next=c.api.begin('community','home',()=>{});
 c.api.ready(first);assert.equal(c.root.dataset.renderState,'loading');c.api.ready(next);assert.equal(c.root.dataset.renderState,'ready');assert.equal(c.main.inert,false);assert.equal(c.timers,0);
});
test('timeout cancels work, displays retry and rejects late completion',()=>{
 const c=boot();let cancelled=0,retried=0;c.api.connect(()=>retried++);
 const id=c.api.begin('profile','home',()=>cancelled++);c.tick();assert.equal(cancelled,1);assert.equal(c.root.dataset.renderState,'error');assert.equal(c.nodes.get('route-pending-actions').hidden,false);
 c.api.ready(id);assert.equal(c.root.dataset.renderState,'error');c.nodes.get('route-retry').onclick();assert.equal(c.reloads,1,'failed bootstrap reloads all assets');
 const next=c.api.begin('home','profile',()=>{});c.api.ready(next);c.api.fail();c.nodes.get('route-retry').onclick();assert.equal(retried,1);
});
test('stylesheet or script failure remains actionable even if rendering resolves',()=>{
 const c=boot(),id=c.api.begin('home',undefined,()=>{});c.handlers.get('error')({target:{matches:()=>true,getAttribute:()=>'/aifect-app-1234567890abcdef.js'}});c.api.ready(id);assert.equal(c.root.dataset.renderState,'error');c.nodes.get('route-retry').onclick();assert.equal(c.reloads,1);
});
test('back-forward cache restores interrupted work and same-route updates retain content',()=>{
 const c=boot();let retried=0;c.api.connect(()=>retried++);c.handlers.get('pageshow')({persisted:true});assert.equal(retried,1);
 const id=c.api.begin('home',undefined,()=>{});c.api.ready(id);const update=c.api.begin('home','home',()=>{});assert.equal(c.root.dataset.renderState,'ready');c.api.ready(update);
});

test('optional external resource failure cannot hide a running app',()=>{
 const c=boot(),id=c.api.begin('home',undefined,()=>{});c.api.ready(id);
 c.handlers.get('error')({target:{matches:()=>true,getAttribute:()=> 'https://optional.example/script.js'}});
 assert.equal(c.root.dataset.renderState,'ready');
});

test('ready retargets a hidden fragment marker without adding a history entry',()=>{
 const marker={id:'',targeted:false,matches(){return this.targeted;}},c=boot({marker,hash:'#search/%ED%95%9C%EA%B8%80',route:'search/%ED%95%9C%EA%B8%80'});
 const id=c.api.begin('search/%ED%95%9C%EA%B8%80','home',()=>{});c.api.ready(id);
 assert.equal(marker.id,'search/한글');assert.equal(c.replacements,1);assert.equal(c.root.dataset.renderState,'ready');
 c.api.syncTarget();assert.equal(c.replacements,1,'an already targeted marker must not navigate again');
});
test('a stale completed route cannot retarget or reveal another URL',()=>{
 const marker={id:'home',targeted:false,matches(){return this.targeted;}},c=boot({marker,hash:'#community',route:'home'});
 const id=c.api.begin('community','home',()=>{});c.api.ready(id);
 assert.equal(c.root.dataset.renderState,'loading');assert.equal(marker.id,'home');assert.equal(c.replacements,0);
});
test('bare home URL is normalized without pushing history and no-JS fallback remains outside the gate',()=>{
 const marker={id:'',targeted:false,matches(){return this.targeted;}},c=boot({marker,hash:''});
 const id=c.api.begin('home',undefined,()=>{});c.api.ready(id);assert.equal(c.location.hash,'#home');assert.deepEqual(c.history.state,{retained:true});
 const html=readFileSync('dist/index.html','utf8'),css=readFileSync('dist/render-state.css','utf8');
 assert.ok(html.indexOf('data-render-target hidden')<html.indexOf('<main id="main"'));
 assert.match(css,/html\[data-render-state="ready"\]:not\(:has\(\[data-render-target\]:target\)\) #main\{display:none!important\}/);
});

test('malformed UTF-8 fragments use the browser tolerant decoding and keep literal plus signs',()=>{
 const marker={id:'',targeted:false,matches(){return this.targeted;}},raw='search/%E0%A4%A+tag&filter=all',c=boot({marker,hash:'#'+raw,route:raw});
 c.api.ready(c.api.begin(raw,'home',()=>{}));assert.equal(marker.id,'search/�%A+tag&filter=all');assert.equal(c.root.dataset.renderState,'ready');
});

test('browser resize delivery notices during bootstrap do not mask a valid route or suppress real exceptions',()=>{
 for(const message of ['ResizeObserver loop completed with undelivered notifications.','ResizeObserver loop limit exceeded']){
  const c=boot(),epoch=c.api.begin('home','',()=>{});c.handlers.get('error')({target:c.win,message,error:null});c.api.ready(epoch);assert.equal(c.root.dataset.renderState,'ready');
 }
 const c=boot();c.handlers.get('error')({target:c.win,message:'Uncaught TypeError',error:new TypeError('bad bootstrap')});assert.equal(c.root.dataset.renderState,'error');
});
