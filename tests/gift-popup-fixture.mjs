import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import * as AifectGifts from '../shared/gifts.js';

const source = name => readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function element(dataset = {}) {
 const e = {dataset,hidden:false,disabled:false,isConnected:true,textContent:'',attributes:{},value:'',innerHTML:'',scrollTop:0,
  classList:{toggle(){},remove(){}},setAttribute(k,v){this.attributes[k]=String(v);},removeAttribute(k){delete this.attributes[k];},addEventListener(name,fn){this['on'+name+'Listener']=fn;},
  scrollIntoView(){},querySelector(){return null;},querySelectorAll(){return [];}};
 return e;
}
function controls(html) {
 return [...html.matchAll(/<button\b([^>]*)>/g)].map(match => {
  const data = {};
  for (const m of match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)) data[m[1].replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]=m[2];
  return element(data);
 });
}
export function giftBrowser(api,user={id:'owner'}) {
 const nodes = {}, reviews = [], notices = [], updates = [], decisions = [];
 let html='', form, buttons=[];
 const modal = nodes['#dialog'] = {open:true,close(){this.open=false;},addEventListener(){},removeEventListener(){}};
 nodes['#dialog-close']=element();
 const c=nicknameContext({AifectGifts,crypto,me:user,accountReady:Promise.resolve(),icon:()=>'',number:n=>Number(n||0).toLocaleString('en-US'),
  esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  $:s=>nodes[s]||null,api,remember(){},formError:f=>f.error,toast:t=>notices.push(t),askLogin(){},Event,
  window:{addEventListener(){},dispatchEvent(e){updates.push(e.type);}},document:{addEventListener(){}},updateAfterShopTransaction(){},
  shopPrice:(n,code)=>'<span aria-label="'+(code==='S'?'실버':'골드')+' '+n+'">'+n+'</span>',
  dialog(markup) {
   modal.open=true; html=markup;
   if(form) form.isConnected=false;
   if(!markup.includes('id="gift-form"')) return;
   form=nodes['#gift-form']=element(); form.error=element();
   const list=element(), extra=element(), ordinary=element(),stored=element(),footer=element(),section=element();
   buttons=controls(markup);
   const match=(key,items)=>items.filter(b=>key in b.dataset);
   section.querySelectorAll=()=>match('giftCategory',buttons);
   form.closest=()=>section; form.querySelectorAll=s=>s==='[data-owned-gift]'?match('ownedGift',buttons):s==='[data-gift-type]'?match('giftType',buttons):[];
   form.querySelector=s=>({'.gift-options':list,'.gift-checkout':footer,'.gift-owned':stored,'.form-error':form.error})[s]||null;
   list.querySelector=s=>({'.gift-ordinary-products':ordinary,'.gift-decoration-products':extra,'.gift-owned':stored})[s]||null;
   Object.defineProperty(extra,'innerHTML',{get(){return this.html||'';},set(value){this.html=value; this.buttons=controls(value);}});
   extra.querySelectorAll=()=>extra.buttons||[]; extra.querySelector=()=>element();
   form.extras=extra;form.footer=footer;
   for(const id of ['gift-detail','gift-send-summary','gift-send','gift-quantity','gift-decoration-detail','gift-recipient','gift-balance-g','gift-balance-s'])nodes['#'+id]=element();
   const sendLabel=element();nodes['#gift-send'].querySelector=()=>sendLabel;
   nodes['#gift-decoration-detail'].querySelector=()=>element();
  }});
 vm.runInContext(source('gifts.js'),c);
 const deco=source('decorations.js');
 vm.runInContext(deco.slice(deco.indexOf('async function bindGiftCategoryTabs('),deco.indexOf('// Shared by the wallet')),c);
 c.confirmGiftTransfer=async info=>{reviews.push({...info});return decisions.length?await decisions.shift():true;};
 return {c,nodes,reviews,notices,updates,decisions,get html(){return html;},get form(){return form;},get modal(){return modal;},
  open:(id='silver-letter')=>c.profileGiftDialog('friend',id),
  submit:()=>form.onsubmit({preventDefault(){}}),
  setQuantity(n){nodes['#gift-quantity'].value=String(n);nodes['#gift-quantity'].onchange();},
  async click(key,value){const b=[...buttons,...form.extras.querySelectorAll()].find(b=>b.dataset[key]===value);if(!b)throw Error('Missing '+key+': '+value);await b.onclick();b.onclickListener?.();},
  async tab(key){await this.click('giftCategory',key);}
 };
}
