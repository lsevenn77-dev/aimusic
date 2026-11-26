import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').split('function remember(')[0];
const wallet='/api/gold/balance',catalog='/api/catalog?section=tracks',buy='/api/me/gift-inventory/buy';
const idle=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
function browser(load){
 const calls=[],events=[],balances=[],ranking=[],history=[];
 const nodes=['G','S'].map(walletCurrency=>({dataset:{walletCurrency},innerHTML:''}));
 const nodesBySelector={'#gift-form':{_giftUI:{updateBalance:value=>balances.push(value)}}};
 const c=vm.createContext({AifectGenres:{GENRES:[]},AifectMessages:{retry:'try again'},Audio:class{},structuredClone,CustomEvent,
  document:{querySelector:key=>nodesBySelector[key],querySelectorAll:()=>nodes},
  window:{dispatchEvent:event=>events.push(event.detail.kind)},shopPrice:(amount,unit)=>unit+' '+amount,
  clearNavigationSnapshots(){assert.fail('trade invalidated navigation');},
  refreshSongGiftRanking:async id=>ranking.push(id),refreshSentGiftHistory:async()=>history.push(true),
  fetch(path,{method}){calls.push([method,path]);return load(path,method);}
 });
 vm.runInContext(source+'\nme={id:"owner"};',c);
 return {api:c.api,calls,events,nodes,balances,ranking,history};
}

test('confirmed purchase retries only the balance read and preserves the browsing cache',async()=>{
 let paid=false,readFailures=0;
 const b=browser(async(path,method)=>{
  if(method==='POST'){paid=true;return response({items:[{id:'stock'}]},201);}
  if(path===wallet)return paid&&readFailures++===0?response({error:'unavailable'},503):response({balance:paid?120:150,silver_balance:9});
  return response({tracks:['one']});
 });
 await b.api(catalog);await b.api(wallet);
 const result=await b.api(buy,'POST',{gift_type:'heart',request_id:'purchase-fixture-id'});
 assert.equal(result.items[0].id,'stock');
 await idle();
 assert.deepEqual(b.events,['gifts']);
 assert.deepEqual(b.nodes.map(n=>n.innerHTML),['G 120','S 9']);
 assert.equal(b.balances.at(-1).balance,120);
 assert.equal(b.calls.filter(([method])=>method==='POST').length,1);
 assert.equal(b.calls.filter(([,path])=>path===wallet).length,3);
 assert.deepEqual(await b.api(catalog),{tracks:['one']});
 assert.equal(b.calls.filter(([,path])=>path===catalog).length,1);
});

test('a failed sale leaves balances alone and delayed pre-gift reads cannot overwrite confirmed balances',async()=>{
 const pending=[];
 const b=browser((path,method)=>{
  if(method==='GET')return new Promise(resolve=>pending.push(resolve));
  return Promise.resolve(path===buy?response({error:'품절'},409):response({gift:{id:'gift-id'},balance:70},201));
 });
 const initial=b.api(wallet);pending.shift()(response({balance:100,silver_balance:12}));await initial;
 await assert.rejects(b.api(buy,'POST',{}),/품절/);
 assert.equal(pending.length,0);assert.deepEqual(b.events,[]);
 assert.deepEqual(b.nodes.map(n=>n.innerHTML),['G 100','S 12']);
 const beforeGift=b.api(wallet);
 await b.api('/api/tracks/cover-one/gifts','POST',{gift_type:'heart'});
 assert.deepEqual(b.ranking,['cover-one']);assert.deepEqual(b.history,[true]);
 assert.equal(pending.length,2);
 pending.pop()(response({balance:70,silver_balance:12}));await idle();
 pending.shift()(response({balance:100,silver_balance:12}));await beforeGift;
 assert.deepEqual(b.nodes.map(n=>n.innerHTML),['G 70','S 12']);
});
