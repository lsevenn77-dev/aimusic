import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const layout=await readFile(new URL('../dist/footer-layout.js',import.meta.url),'utf8');

function fixture({shell=true,native=false,userAgent=''}={}){
  let align;
  const main={id:'main',dataset:{},hasAttribute:()=>false,querySelector:()=>null,getClientRects:()=>[]};
  const parent={hasAttribute:()=>false};
  let child=null;
  const footer={
    get isConnected(){return child===this;},
    parentElement:parent,
    remove(){if(this.isConnected)child=null;},
  };
  const slot={content:{firstElementChild:footer},parentElement:parent,after(node){child=node;}};
  if(!shell)child=footer;
  class Observer {observe(){}}
  const window={
    Capacitor:{isNativePlatform:()=>native},navigator:{userAgent},
    addEventListener(type,fn){if(type==='resize')align=fn;},
  };
  vm.runInNewContext(layout,{
    document:{
      getElementById:id=>id==='app-footer'&&shell?slot:null,
      querySelector:s=>s.includes('#main')?main:s.includes('.page-footer')&&!shell?footer:null,
      querySelectorAll:()=>[],body:{},
    },
    window,
    ResizeObserver:Observer,MutationObserver:Observer,
    requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},
  });
  return {window,footer,align};
}

test('the web shell mounts the existing footer only on the home route',()=>{
  const {window,footer,align}=fixture();
  assert.equal(footer.isConnected,false);
  for(const hash of ['','#home','#/home']){
    window.AifectPageFooter(hash);
    assert.equal(footer.isConnected,true,hash);
  }
  for(const hash of ['#voice/123','#live/123?from=invite','#account','#community','#home/other','#unknown']){
    window.AifectPageFooter(hash);
    assert.equal(footer.isConnected,false,hash);
    align();
    assert.equal(footer.isConnected,false,hash);
    window.AifectPageFooter('#home');
    assert.equal(footer.isConnected,true);
  }
});

test('native shells and standalone documents keep their existing footer',()=>{
  for(const options of [{native:true},{userAgent:'AIFECT-Mobile/1.0'},{shell:false}]){
    const {window,footer,align}=fixture(options);
    assert.equal(window.AifectPageFooter,undefined);
    align();
    assert.equal(footer.isConnected,true);
  }
});

test('the shared router updates the footer before navigation completes and after a guard restores the URL',async()=>{
  const calls=[],location={hash:'#studio'};
  let finish;
  const context={window:{AifectPageFooter:hash=>calls.push(hash)},document:{addEventListener(){}},location,pending:new Promise(resolve=>{finish=resolve;})};
  const source=await readFile(new URL('../dist/views.js',import.meta.url),'utf8');
  vm.runInNewContext(source+`\nasync function renderNavigation(){await pending;location.hash='#home';}`,context);
  const transition=context.render();
  assert.deepEqual(calls,['#studio']);
  finish();
  await transition;
  assert.deepEqual(calls,['#studio','#home']);
});
