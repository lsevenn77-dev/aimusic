import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('the shared footer detaches only on desktop room details and returns on navigation or resize',async()=>{
  let desktop=true,align;
  const main={id:'main',dataset:{},hasAttribute:()=>false,querySelector:()=>null,getClientRects:()=>[]};
  const parent={hasAttribute:()=>false};
  let child;
  function node(){
    return {
      get isConnected(){return child===this;},
      get parentElement(){return this.isConnected?parent:null;},
      replaceWith(next){assert.equal(child,this);child=next;},
    };
  }
  const footer=child=node();
  class Observer {observe(){}}
  const context={
    document:{
      querySelector:s=>s.includes('#main')?main:s.includes('.page-footer')?footer:null,
      querySelectorAll:()=>[],createComment:node,body:{},
    },
    location:{hash:'#home'},roomUsesDesktopControls:()=>desktop,
    window:{addEventListener(type,fn){if(type==='resize')align=fn;}},
    ResizeObserver:Observer,MutationObserver:Observer,
    requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},
  };
  vm.runInNewContext(await readFile(new URL('../dist/footer-layout.js',import.meta.url),'utf8'),context);
  function navigate(route){
    main.dataset.route=route;
    align();
  }
  for(const route of ['voice/123','live/123?from=invite']){
    navigate(route);assert.notEqual(child,footer);
    desktop=false;align();assert.equal(child,footer);
    desktop=true;align();assert.notEqual(child,footer);
  }
  for(const route of ['voice','live','home','account']){
    navigate(route);assert.equal(child,footer);
  }
});
