import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/render-state.js','utf8');
function boot(){
 const handlers=new Map(),timers=new Map(),nodes=new Map();let sequence=0,reloads=0;
 const root={dataset:{}},main={inert:false,setAttribute(){},removeAttribute(){}};
 for(const id of ['route-pending-message','route-pending-actions','route-retry'])nodes.set(id,{});nodes.set('main',main);
 const context=vm.createContext({document:{documentElement:root,getElementById:id=>nodes.get(id)},location:{reload(){reloads++;}},window:{addEventListener(name,fn){handlers.set(name,fn);}},setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 vm.runInContext(source,context);const api=context.window.AifectRender;
 return {api,root,main,nodes,handlers,tick(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());},get reloads(){return reloads;},get timers(){return timers.size;}};
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
