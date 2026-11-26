import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../dist/visitor.js',import.meta.url),'utf8');
async function open(href,referrer='',cookie='') {
  let sent;
  const document={cookie,referrer,visibilityState:'visible',addEventListener(){}};
  const window={addEventListener(){}};window.top=window;
  vm.runInNewContext(script,{URL,URLSearchParams,location:new URL(href),navigator:{userAgent:'Mozilla'},document,window,
    crypto,AbortSignal,localStorage:{getItem(){},setItem(){}},setInterval(){},
    fetch:async (_,options)=>{sent=JSON.parse(options.body);return {ok:false}}});
  return {source:sent.source,cookie:document.cookie};
}
test('web daily source and first signup attribution',async()=>{
  const base='https://aifect.co.kr/';
  assert.equal((await open(base)).source,'no_referrer');
  assert.equal((await open(base,'https://m.search.naver.com/')).source,'naver');
  assert.equal((await open(base,'https://naver.com.example.org/')).source,'other_referral');
  assert.equal((await open(base,'https://accounts.google.com/')).source,'internal');
  assert.equal((await open(base+'#song/abc?utm_source=ig','https://youtu.be/')).source,'ig');
  const returning=await open(base+'?src=yt_v','https://google.com/','aifect_src=ig');
  assert.equal(returning.source,'yt_v');assert.equal(returning.cookie,'aifect_src=ig');
});

