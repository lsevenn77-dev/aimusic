import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function fixture(){
 const classes=new Set(['unrelated-dialog-state']),listeners={};
 const modal={open:false,setAttribute(name,value){this[name]=value;},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},remove(name){classes.delete(name);}},showModal(){this.open=true;},addEventListener(type,fn){listeners[type]=fn;}};
 const content={innerHTML:'',querySelector(selector){
  if(selector==='.popup-prompt,h2'){const label=this.innerHTML.match(/<(?:h2|p class="popup-prompt")>([^<]+)</);return label?{textContent:label[1]}:null;}
  return selector.split(',').some(part=>part[0]==='.'?this.innerHTML.includes('class="'+part.slice(1)+'"'):this.innerHTML.includes('id="'+part.slice(1)+'"'))?{}:null;
 }};
 const c=vm.createContext({$:selector=>selector==='#dialog'?modal:content,decorateNativeAudioPlay(){}});
 vm.runInContext(app.slice(app.indexOf('function prepareCompactPopup('),app.indexOf('function dialog(html)')),c);
 vm.runInContext(app.split('\n').filter(line=>line.startsWith('function dialog(html)')||line.startsWith("$('#dialog').addEventListener('close'")).join('\n'),c);
 return {modal,classes,open:html=>c.dialog(html),close(){modal.open=false;listeners.close?.call(modal);},dispatchClose(){listeners.close?.call(modal);}};
}

test('a gift closed by any dismissal path leaves the following ordinary dialog unskinned',()=>{
 const f=fixture();f.open('<section class="gift-dialog">Gift</section>');
 assert.ok(f.classes.has('gift-sheet'));
 f.close();assert.ok(!f.classes.has('gift-sheet'));
 f.open('<form><h2>Playlist</h2></form>');
 assert.ok(f.modal.open);assert.ok(!f.classes.has('gift-sheet'));
 assert.ok(f.classes.has('unrelated-dialog-state'));
 assert.ok(f.classes.has('compact-popup'));
 assert.equal(f.modal['aria-label'],'Playlist');
});

test('an ordinary confirmation cannot leak its layout or accessible name into excluded gift flows',()=>{
 const f=fixture();
 for(const markup of ['<section class="gift-dialog">Gift</section>','<section class="gift-success">Sent</section>','<section class="shop-checkout">Purchase</section>','<section class="gift-recipient-dialog">Recipient</section>','<form id="mp-inventory-buy"></form>']){
  f.open('<p class="popup-prompt">이 작품을 비공개하시겠습니까?</p>');
  assert.ok(f.classes.has('compact-popup'));assert.equal(f.modal['aria-label'],'이 작품을 비공개하시겠습니까?');
  f.open(markup);assert.ok(!f.classes.has('compact-popup'));assert.equal(f.modal['aria-label'],'AIFECT');
 }
});

test('replacing an open gift with an ordinary dialog clears its surface immediately',()=>{
 const f=fixture();f.open('<section class="gift-dialog">Gift</section>');
 f.open('<h2>Artist settings</h2>');
 assert.ok(f.modal.open);assert.ok(!f.classes.has('gift-sheet'));
});

test('gift loading and success retain their intended surface',()=>{
 const f=fixture();
 for(const kind of ['gift-dialog','gift-success']){
  f.open('<section class="'+kind+'">Gift</section>');
  assert.ok(f.classes.has('gift-sheet'));
 }
});

test('a queued close event cannot strip the surface from a newly opened gift',()=>{
 const f=fixture();f.open('<h2>Ordinary dialog</h2>');f.modal.open=false;
 f.open('<section class="gift-dialog">New gift</section>');f.dispatchClose();
 assert.ok(f.modal.open);assert.ok(f.classes.has('gift-sheet'));
});
