import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {objectResponse} from '../server/storage.js';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

function bucket(){
 const files=new Map(),reads=[];
 return {files,reads,async head(key){const body=files.get(key);return body?{size:body.length,httpEtag:`"${createHash('sha256').update(body).digest('hex')}"`}:null;},async get(key,options){reads.push(key);const body=files.get(key),r=options?.range;return body?{body:r?body.subarray(r.offset,r.offset+r.length):body}:null;}};
}
const immutable='public, max-age=2592000, immutable';
const request=(version,headers={},method='GET')=>new Request('https://aifect.test/media/one/cover'+(version===undefined?'':'?v='+version),{method,headers});

test('only the current public image URL is immutable; stale and legacy URLs remain refreshable',async()=>{
 const BUCKET=bucket();BUCKET.files.set('image',Buffer.from('first photo'));
 const response=(v,version='current',isPublic=true,type='image/png')=>objectResponse(request(v),{BUCKET},'image',type,isPublic,{imageVersion:version});
 assert.equal((await response('current')).headers.get('cache-control'),immutable);
 for(const v of [undefined,''])assert.equal((await response(v)).headers.get('cache-control'),'public, max-age=3600');
 for(const v of ['old','original'])assert.equal((await response(v)).headers.get('cache-control'),'public, max-age=0, must-revalidate');
 assert.equal((await response('arbitrary',null)).headers.get('cache-control'),'public, max-age=3600');
 const privatePhoto=await response('current','current',false);assert.equal(privatePhoto.headers.get('cache-control'),'private, no-store');assert.equal(privatePhoto.headers.get('etag'),null);
 assert.equal((await response('current','current',false,'audio/mp4')).headers.get('cache-control'),'private, no-store');
 assert.equal((await response('current','current',true,'audio/mp4')).headers.get('cache-control'),'public, max-age=3600');
});

test('public validators skip body reads, retain cache policy and detect replaced bytes',async()=>{
 const BUCKET=bucket();BUCKET.files.set('image',Buffer.from('first photo'));
 const serve=(headers={},method='GET',isPublic=true)=>objectResponse(request('current',headers,method),{BUCKET},'image','image/png',isPublic,{imageVersion:'current'});
 const first=await serve(),etag=first.headers.get('etag');assert.ok(etag);assert.equal(BUCKET.reads.length,1);
 for(const value of [etag,'W/'+etag,'"another", W/'+etag,'*']){
  const r=await serve({'If-None-Match':value});assert.equal(r.status,304);assert.equal(await r.text(),'');assert.equal(r.headers.get('cache-control'),immutable);assert.equal(r.headers.get('etag'),etag);assert.equal(r.headers.get('content-length'),null);assert.equal(r.headers.get('content-range'),null);
 }
 assert.equal((await serve({'If-None-Match':etag},'HEAD')).status,304);assert.equal(BUCKET.reads.length,1);
 BUCKET.files.set('image',Buffer.from('updated photo'));
 const updated=await serve({'If-None-Match':etag});assert.equal(updated.status,200);assert.notEqual(updated.headers.get('etag'),etag);assert.equal(await updated.text(),'updated photo');
 const privatePhoto=await serve({'If-None-Match':'*'},'GET',false);assert.equal(privatePhoto.status,200);assert.equal(privatePhoto.headers.get('etag'),null);
});

test('image HEAD, byte ranges and missing objects keep their existing behavior',async()=>{
 const BUCKET=bucket();BUCKET.files.set('image',Buffer.from('0123456789'));
 const serve=(headers={},method='GET')=>objectResponse(request('current',headers,method),{BUCKET},'image','image/png',true,{imageVersion:'current'});
 const head=await serve({},'HEAD');assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');assert.equal(BUCKET.reads.length,0);
 const range=await serve({Range:'bytes=2-5'});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 2-5/10');assert.equal(await range.text(),'2345');
 const invalid=await serve({Range:'bytes=10-20'});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('cache-control'),'private, no-store');
 BUCKET.files.delete('image');await assert.rejects(serve({'If-None-Match':'*'}),error=>error.status===404);
});

test('real media routes version cover, profile and banner images, and check visibility before validators',async t=>{
 const BUCKET=bucket(),f=await fixture(t,{BUCKET});
 f.sql.exec("UPDATE tracks SET cover_version='cover-one',cover_type='image/png' WHERE id='one'; UPDATE producers SET image_version='profile-one',image_type='image/png',banner_version='banner-one',banner_type='image/png' WHERE id='producer'; UPDATE artists SET image_version='artist-one',image_type='image/png' WHERE id='artist'");
 for(const key of ['images/track/one/cover-one','images/producer/producer/profile-one','images/banner/producer/banner-one','images/artist/artist/artist-one'])BUCKET.files.set(key,Buffer.from(key));
 const fetchImage=(path,user=null,headers={})=>worker.fetch(new Request('https://aifect.test'+path,{headers:{...headers,...(user?{Cookie:'aifect_session='+user}:{})}}),{DB:f.DB,BUCKET},{waitUntil(){}});
 for(const path of ['/media/one/cover?v=cover-one','/media/producer/producer?v=profile-one','/media/banner/producer?v=banner-one','/media/artist/artist?v=artist-one']){
  const r=await fetchImage(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('cache-control'),immutable);assert.equal((await fetchImage(path,null,{'If-None-Match':r.headers.get('etag')})).status,304,path);
 }
 // A newly uploaded version must have a new URL, while an old URL serves fresh bytes without a long lifetime.
 f.sql.exec("UPDATE producers SET image_version='profile-two' WHERE id='producer'");BUCKET.files.set('images/producer/producer/profile-two',Buffer.from('new photo'));
 const fresh=await fetchImage('/media/producer/producer?v=profile-two');assert.equal(fresh.headers.get('cache-control'),immutable);assert.equal(await fresh.text(),'new photo');
 const stale=await fetchImage('/media/producer/producer?v=profile-one');assert.equal(stale.headers.get('cache-control'),'public, max-age=0, must-revalidate');assert.equal(await stale.text(),'new photo');
 f.sql.exec("UPDATE tracks SET status='hidden'");
 for(const path of ['/media/one/cover?v=cover-one','/media/artist/artist?v=artist-one']){
  const anonymous=await fetchImage(path,null,{'If-None-Match':'*'});assert.equal(anonymous.status,404,path);assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
  const stranger=await fetchImage(path,'other',{'If-None-Match':'*'});assert.equal(stranger.status,404,path);
  const owner=await fetchImage(path,'owner',{'If-None-Match':'*'});assert.equal(owner.status,200,path);assert.equal(owner.headers.get('cache-control'),'private, no-store');assert.equal(owner.headers.get('etag'),null);
 }
 assert.equal((await fetchImage('/media/producer/producer?v=profile-two')).headers.get('cache-control'),immutable,'public user avatars remain public');
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='one'");assert.equal((await fetchImage('/media/one/cover?v=cover-one','owner',{'If-None-Match':'*'})).status,404);
 const missing=await fetchImage('/media/producer/unknown?v=profile-one');assert.equal(missing.status,404);assert.equal(missing.headers.get('cache-control'),'private, no-store');
});
