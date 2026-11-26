import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaImageRequest, mediaImageResponse} from '../shared/media-image-response.js';

const origin = 'https://aifect.co.kr';
const pullOrigin = 'https://lseven7.ext1.cache.iwinv.net';
const hash = 'a'.repeat(64);
const pushUrl = 'https://lseven7.cache.iwinv.net/Image/' + hash + '.bin';
const push = (mime = 'image/webp') => new Response('origin', {headers:{'content-type':mime}});
const request = (path = '/media/song/cover?artwork=track&v=123', extra = {}) => ({
  url: origin + path, method:'GET', destination:'image', credentials:'include', headers:new Headers(), ...extra
});

test('only actual same-origin media image routes and complete image GETs negotiate', () => {
  for (const path of ['/media/one/cover','/media/dm/private?v=id','/media/artist-banner/alice','/media/playlist/private/image?v=7','/media/crew-notice/i']) {
    assert.equal(mediaImageRequest(request(path),origin),true);
  }
  for (const r of [request('/media/one/stream'), request('/media/one/preview'),request('/media/one/premium'),
    request('/media/one/mr'), request('/api/crews/one'), request('/media/new-feature/id'),
    request('',{url:'https://elsewhere.example/media/a/cover'}),request('/media/one/cover',{method:'HEAD'}),
    request('/media/one/cover',{destination:'document'}),request('/media/one/cover',{headers:new Headers({range:'bytes=0-8'})})]) {
    assert.equal(mediaImageRequest(r,origin),false);
  }
});

test('ordinary already-authorized image is returned directly with zero duplicate or CDN requests', async () => {
  const r=request('/media/dm/pic?v=7',{headers:new Headers({'If-None-Match':'"old"','Authorization':'Bearer app'})});
  const original = push();
  let n=0;
  const result=await mediaImageResponse(r, '', async (target,options)=>{
    n++;
    assert.equal(target,r);
    assert.equal(options.mode,'same-origin');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'default');
    assert.equal(options.headers.has('if-none-match'),false);
    assert.equal(options.headers.get('authorization'),'Bearer app');
    assert.equal(options.headers.get('X-Aifect-Image-Mirror'),'1');
    return original;
  });
  assert.equal(result,original);
  assert.equal(n,1);
});

test('access denial and missing origin object make no alternate request', async () => {
  for (const status of [401,403,404]) {
    let calls=0;
    const r=request('/media/dm/not-mine');
    const result=await mediaImageResponse(r, pullOrigin, async target=>{
      assert.equal(++calls,1);
      assert.equal(target,r);
      return new Response(null,{status,headers:{'content-type':'application/json'}});
    });
    assert.equal(result.status,status);
  }
});

async function fixture() {
  const iv=crypto.getRandomValues(new Uint8Array(12)), raw=crypto.getRandomValues(new Uint8Array(32));
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  const bytes=Buffer.from('illustration bytes');
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);
  return {bytes, payload:Buffer.concat([iv,Buffer.from(encrypted)]), grant:{key:Buffer.from(raw).toString('base64url'),type:'image/webp',url:pushUrl}};
}

test('verified push and explicitly configured pull ciphertext is decrypted without leaking auth, key or referrer', async () => {
  const {grant,payload,bytes}=await fixture();
  for (const url of [pushUrl, pullOrigin + '/mirror/v1/' + 'b'.repeat(52) + '/' + hash + '.bin']) {
    const r=request(), calls=[];
    const result=await mediaImageResponse(r,pullOrigin, async (target,options)=>{
      calls.push(target);
      if (target===r) return Response.json({...grant,url},{headers:{'cache-control':'private, no-store'}});
      assert.equal(options.credentials,'omit');
      assert.equal(options.mode,'cors');
      assert.equal(options.redirect,'error');
      assert.equal(options.referrerPolicy,'no-referrer');
      assert.equal(options.headers,undefined);
      return new Response(payload);
    });
    assert.deepEqual(calls,[r,url]);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
    assert.equal(result.headers.get('cache-control'),'private, no-store');
    assert.equal(result.headers.get('content-type'),'image/webp');
    assert.equal(result.headers.get('x-content-type-options'),'nosniff');
  }
});

test('only exact CDN account, path and approved raster grant can make a CDN request', async () => {
  const {grant}=await fixture();
  for (const entry of [
    {url:pushUrl+'?secret=1'}, {url:pushUrl+'#abc'}, {url:pushUrl.replace('https:','http:')},
    {url:pushUrl.replace('lseven7.','other.')}, {url:pushUrl.replace('/Image/','/../Image/')},
    {url:pullOrigin.replace('ext1','ext2')+'/mirror/v1/h/'+hash+'.bin'},
    {url:pullOrigin+'/mirror/v1/%2F/'+hash+'.bin'}, {url:pullOrigin+'/Image/'+hash+'.bin'},
    {type:'image/svg+xml'}, {key:'short'}, {url:'https://user@lseven7.cache.iwinv.net/Image/'+hash+'.bin'}
  ]) {
    const r=request(), calls=[];
    const result=await mediaImageResponse(r,pullOrigin,async(target,opts)=>{
      calls.push(target);
      if(calls.length===1) return Response.json({...grant,...entry});
      assert.equal(opts.cache,'no-store');
      return push();
    });
    assert.deepEqual(calls,[r,r]);
    assert.equal(await result.text(),'origin');
  }
});

test('tampered or missing ciphertext, invalid JSON and transport failures fall back to a fresh authorized read', async () => {
  const {grant,payload}=await fixture(), tampered=Buffer.from(payload);
  tampered[tampered.length-1]^=1;
  for (const mode of ['corrupt','404','json','oversize','offline','grant500','grantOffline']) {
    const r=request(),calls=[];
    const result=await mediaImageResponse(r,'',async(target,options)=>{
      calls.push(target);
      if (target === r && calls.length===1) {
        if(mode==='grantOffline') throw new Error('Offline');
        if(mode==='grant500') return new Response(null,{status:500});
        if(mode==='json') return new Response('{',{headers:{'content-type':'application/json'}});
        return Response.json(grant);
      }
      if (target===pushUrl) {
        if(mode==='404') return new Response(null,{status:404});
        if(mode==='offline') throw new Error('Offline');
        if(mode==='oversize') return new Response(null,{headers:{'content-length':String(30*1024*1024)}});
        return new Response(tampered);
      }
      assert.equal(target,r);
      assert.equal(options.cache,'no-store');
      assert.equal(options.headers,undefined);
      return new Response(null,{status:403});
    });
    assert.equal(calls.at(-1),r);
    assert.equal(result.status,403);
  }
});
