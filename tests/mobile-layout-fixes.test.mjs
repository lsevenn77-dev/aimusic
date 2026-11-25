import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectGifts from '../shared/gifts.js';
import {publicPage} from '../server/public-pages.js';

const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const css=read('secondary-pages.css');

test('gift shop renders every approved silver and gold choice for guests and members',()=>{
 const ctx=nicknameContext({AifectGifts,shopPrice:(value,code)=>value+" "+code.toLowerCase(),esc:String,number:n=>String(n||0),icon:()=>''});vm.runInContext(read('gifts.js'),ctx);
 for(const wallet of [null,{balance:1000,free:{balance:50},gifts:AifectGifts.GIFT_CATALOG,silver_gifts:AifectGifts.SILVER_GIFT_CATALOG}]){
  const html=ctx.giftShopHTML(wallet);
  for(const g of [...AifectGifts.GIFT_CATALOG,...AifectGifts.SILVER_GIFT_CATALOG])assert.ok(html.includes('data-gift-buy="'+g.id+'"'),g.id);
  assert.equal((html.match(/data-gift-buy=/g)||[]).length,19);
 }
});

test('gift sheet keeps all choices and detailed policy inside one scroll region, with checkout outside',async()=>{
 let html='';
 const form={isConnected:true,querySelectorAll:()=>[],querySelector:()=>null},send={attributes:{},setAttribute(key,value){this.attributes[key]=value;}},nodes={'#dialog':{open:true,classList:{add(){}}},'#gift-form':form,'#gift-send-summary':{},'#gift-send':send,'#gift-quantity':{value:'1'}};
 const context=nicknameContext({bindGiftCategoryTabs:async()=>{},AifectGifts,shopPrice:(value,code)=>value+" "+code.toLowerCase(),crypto,me:{id:'self'},accountReady:Promise.resolve(),esc:String,number:String,icon:()=>'',
  $:selector=>nodes[selector]||null,dialog:content=>{html=content;},remember(){},busyForm:()=>()=>{},
  api:async path=>path==='/api/me/gift-inventory'?{items:[]}:path==='/api/gold'?{balance:500,free:{balance:3},gifts:AifectGifts.GIFT_CATALOG}:{profile:{user_id:'other',name:'긴 이름의 친구'}}});
 vm.runInContext(read('gifts.js'),context);
 await context.giftDialog('other','star',true);
 assert.match(html,/role="region" aria-label="선물 선택"/);
 const options=html.slice(html.indexOf('class="gift-options gift-dialog-scroll"'),html.indexOf('class="gift-checkout gift-dialog-footer"'));
 for(const gift of [...AifectGifts.SILVER_GIFT_CATALOG,...AifectGifts.GIFT_CATALOG])assert.ok(options.includes('data-gift-type="'+gift.id+'"'));
 assert.ok(options.includes(AifectGifts.GIFT_SETTLEMENT_NOTICE));
 assert.match(options,/<details class="gift-policy-details">/);
 const checkout=html.slice(html.indexOf('class="gift-checkout gift-dialog-footer"'));
 assert.doesNotMatch(checkout,/gift-own(ed)?-cancel/);
 assert.match(checkout,/선물하기/);assert.equal(nodes['#gift-send'].attributes['aria-label'],'손편지 1개 선물하기');
 assert.match(checkout,/<select id="gift-quantity"/);assert.equal((checkout.match(/<option value=/g)||[]).length,100);
 const controls=['gift-balance-g','gift-charge-button','gift-quantity','gift-balance-s','gift-silver-button','gift-send-button'].map(name=>checkout.indexOf(name));
 assert.ok(controls.every((position,index)=>position>=0&&(!index||position>controls[index-1])));
 assert.equal(nodes['#gift-send'].disabled,false);
 assert.match(css,/\.gift-sheet \.gift-options\{flex:1;/);
 assert.match(css,/\.gift-sheet \.gift-checkout\{flex-shrink:0;/);
});

test('pricing and terms wrap every table in an independently scrollable keyboard region',()=>{
 for(const path of ['/pricing','/terms']){
  const html=publicPage(path);
  const tables=[...html.matchAll(/<table\b/g)];
  const regions=[...html.matchAll(/<div class="(?:legal-table-wrap|table-scroll)" tabindex="0" role="region" aria-label="[^"]+"><table/g)];
  assert.ok(tables.length>0,path);assert.equal(regions.length,tables.length,path);
 }
 assert.match(read('policies.css'),/\.legal-content :is\(\.legal-table-wrap,\.table-scroll\)\{[^}]*overflow-x:auto/);
});

test('mobile names, profile rows and shortcuts have their own reading space',()=>{
 assert.match(css,/\.dm-thread-person>div:not\(\.artist-portrait\)/);
 assert.match(css,/\.dm-thread-person>\.artist-portrait\{[^}]*flex:0 0 40px/);
 assert.match(css,/\.dm-thread-actions\{grid-column:1\/-1/);
 assert.match(css,/\.social-profile-identity p\{grid-column:1\/-1/);
 assert.match(css,/\.social-profile-square \.music-profile-stats\{grid-column:1\/-1/);
 assert.match(css,/main \.browse-shortcuts a\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.sidebar \.nav-link\{white-space:nowrap/);
});

test('art buttons reset native padding and size their image to the hit area',()=>{
 assert.match(css,/main :is\(\.track-art,\.cover-ranked-art\)\{[^}]*padding:0;[^}]*overflow:hidden/);
 assert.match(css,/main :is\(\.track-art,\.cover-ranked-art\)>\.mini-cover\{[^}]*width:100%;height:100%/);
});

test('mobile cover chart reserves a separate row for positioned social actions',()=>{
 assert.match(css,/\.chart-page-results \.cover-ranked-row\{padding-bottom:64px\}/);
 assert.match(css,/\.chart-page-results \.cover-ranked-actions\{right:12px;bottom:10px;gap:8px\}/);
});
