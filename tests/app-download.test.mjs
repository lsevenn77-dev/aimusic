import test from 'node:test';
import assert from 'node:assert/strict';
import {appDownloadRoute, APP_STORE_URL, PLAY_STORE_URL} from '../server/app-download.js';

test('shared download link routes Apple and Android browsers to their published stores without cached cross-device redirects', async () => {
  for (const [agent, platform, destination] of [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', '', APP_STORE_URL],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', '', APP_STORE_URL],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', '', PLAY_STORE_URL],
    ['Mozilla/5.0', '"Android"', PLAY_STORE_URL],
    ['Mozilla/5.0', '"iOS"', APP_STORE_URL],
  ]) for (const method of ['GET', 'HEAD']) {
    const response = appDownloadRoute(new Request('https://aifect.co.kr/download/?next=https://example.com', {method, headers:{'user-agent':agent, 'sec-ch-ua-platform':platform}}));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('vary'), /User-Agent/);
    assert.equal(await response.text(), '');
  }
});

test('desktop and unknown devices get one share-link control instead of an arbitrary store', async () => {
  for (const agent of ['', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)']) {
    const response = appDownloadRoute(new Request('https://aifect.co.kr/download', {headers:{'user-agent':agent}}));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.match(html, /app-download\.js/);
    assert.match(html, /https:\/\/aifect\.co\.kr\/download/);
    assert.equal((html.match(/<button /g) || []).length, 1);
  }
  const head = appDownloadRoute(new Request('https://aifect.co.kr/download', {method:'HEAD'}));
  assert.equal(await head.text(), '');
  assert.equal(appDownloadRoute(new Request('https://aifect.co.kr/download', {method:'POST'})).status, 405);
  assert.equal(appDownloadRoute(new Request('https://aifect.co.kr/music')), null);
});
