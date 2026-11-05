import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
import {publicImageRoutes, addVersionedRoutes, directShellImages} from '../scripts/public-image-assets.mjs';
import {publicImageObject, publicImageResponse} from '../shared/public-image-response.js';

const origin = 'https://aifect.co.kr';
const directory = 'https://lseven7.cache.iwinv.net/Image/';
const hash = createHash('sha256').update('example').digest('hex');
const object = hash + '.webp';
const routes = {'/assets/banner.webp': object};
const image = (path = '/assets/banner.webp', changes = {}) => ({
  url: origin + path, method: 'GET', destination: 'image', headers: new Headers(), ...changes
});

test('only plain same-origin GET image requests for known public paths can be routed', () => {
  assert.equal(publicImageObject(image(), origin, routes), object);
  for (const req of [
    image('/media/secret/cover'), image('/api/attachments/image'), image('/assets/banner.webp?token=a'),
    image('/assets/removed.webp'), image('/audio/track'), image('', {url: 'https://elsewhere.example/assets/banner.webp'}),
    image('', {method: 'HEAD'}), image('', {destination: 'document'}),
    image('', {headers: new Headers({Range: 'bytes=1-10'})}),
    image('', {headers: new Headers({Authorization: 'Bearer private'})})
  ]) assert.equal(publicImageObject(req, origin, routes), null);
});

test('CDN requests are anonymous, integrity checked, and return a new same-origin image response', async () => {
  const req = image(), seen = [];
  const result = await publicImageResponse(req, directory, object, async (url, init) => {
    seen.push(url);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.mode, 'cors');
    assert.equal(init.redirect, 'error');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.integrity, 'sha256-' + Buffer.from(hash, 'hex').toString('base64'));
    return new Response('example', {headers: {'content-type': 'image/webp', 'x-provider-header': 'omitted'}});
  });
  assert.deepEqual(seen, [directory + object]);
  assert.equal(result.url, '');
  assert.equal(result.headers.get('x-provider-header'), null);
  assert.equal(await result.text(), 'example');
});

test('failed integrity, missing files, redirects or invalid MIME use the original request', async () => {
  for (const remote of [() => { throw new TypeError('failed integrity'); },
    () => new Response(null, {status: 404}), () => new Response(null, {status: 302}),
    () => new Response('login', {headers: {'content-type':'text/html'}})]) {
    const original = image();
    const response = await publicImageResponse(original, directory, object, async request => {
      if (request === original) return new Response('origin');
      return remote();
    });
    assert.equal(await response.text(), 'origin');
  }
});

test('the release list must match current source assets and the exact built bytes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aifect-image-test-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  for (const dir of ['assets','crew-racing','crew-rhythm','crew-jump-art','crew-fishing']) {
    await mkdir(join(root, 'source', dir), {recursive:true});
  }
  await mkdir(join(root,'client/assets'),{recursive:true});
  await mkdir(join(root,'products'));
  for (const [name,bytes] of [['banner.webp','example'], ['changed.webp','new'], ['unverified.webp','other']]) {
    await writeFile(join(root,'source/assets',name),bytes);
    await writeFile(join(root,'client/assets',name),bytes);
  }
  await writeFile(join(root,'client/assets/removed.webp'),'example');
  const generate = config => publicImageRoutes(config, join(root,'source'), join(root,'client'), join(root,'products'));
  assert.deepEqual(await generate({directory:'Image', objects:[]}), {});
  assert.deepEqual(await generate({directory:'Image', objects:[object]}), routes);
  await assert.rejects(generate({directory:'Image/../private', objects:[object]}));
});

test('restarted workers re-check the document release; stale or unknown clients use the origin', async () => {
  const listeners = {}, messages = [];
  const scope = {
    location: {origin}, clients: {get: async () => ({postMessage: msg => messages.push(msg)})},
    addEventListener: (type, callback) => { listeners[type] = callback; }
  };
  const result = await build({entryPoints:['shared/public-image-worker.js'], bundle:true, write:false, format:'iife',
    define:{__IMAGE_CONFIG__:JSON.stringify({base:directory,routes}),__IMAGE_REVISION__:JSON.stringify('current')}});
  vm.runInNewContext(result.outputFiles[0].text, {self:scope,URL,Response,Headers,AbortController,btoa,setTimeout,clearTimeout,
    fetch:async () => new Response('cdn',{headers:{'content-type':'image/webp'}})});
  const dispatch = async () => {
    let pending, response;
    listeners.fetch({request:image(),clientId:'doc', waitUntil: p => {pending=p;}, respondWith: p => {response=p;}});
    await pending;
    return response;
  };
  const announce = revision => listeners.message({source:{id:'doc',type:'window'},data:{type:'aifect-image-release',revision}});
  assert.equal(await dispatch(), undefined);
  assert.deepEqual(messages.map(m=>m.type), ['aifect-image-release-request']);
  announce('stale');
  assert.equal(await dispatch(), undefined);
  announce('current');
  assert.equal(await (await dispatch()).text(), 'cdn');
});

test('only cache-buster URLs in this release can use a verified image', () => {
  const current = {...routes};
  addVersionedRoutes(current,'<img src="/assets/banner.webp?v=2026-release"> <img src="/assets/missing.webp?v=ignored">');
  assert.equal(publicImageObject(image('/assets/banner.webp?v=2026-release'),origin,current),object);
  assert.equal(publicImageObject(image('/assets/banner.webp?v=old'),origin,current),null);
  assert.equal(publicImageObject(image('/assets/banner.webp?v=2026-release&token=bad'),origin,current),null);
  assert.equal(publicImageObject(image('/assets/missing.webp?v=ignored'),origin,current),null);
});

test('pre-worker shell URLs change only for approved authored logos/banners with the same-origin fallback', () => {
  const logo='/assets/aifect-symbol.svg?v=2026', src=' src="'+logo+'"';
  const html='<img'+src+' alt="site"><img src="/media/artist/private"><img src="/assets/play-banners/new.webp"><img'+src+' srcset="high 2x">';
  const mapped=directShellImages(html,directory,{[logo]:object});
  assert.equal((mapped.match(/data-aifect-image-origin=/g)||[]).length,1);
  assert.ok(mapped.includes('src="'+directory+object+'" data-aifect-image-origin="'+logo+'"'));
  assert.ok(mapped.includes('<img src="/media/artist/private">'));
  assert.ok(mapped.includes('<img src="/assets/play-banners/new.webp">'));
  assert.ok(mapped.includes('<img'+src+' srcset="high 2x">'));
  assert.equal(directShellImages(html,directory,{}),html);
});
