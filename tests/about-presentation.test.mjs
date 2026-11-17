import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMusicRoute} from '../server/public-music.js';
import {brandPublicDocument} from '../shared/web-brand.js';
import {aboutPresentation} from '../server/about-presentation.js';

test('anonymous about skin preserves renderer-owned metadata, navigation, copy and legal footer', async () => {
  const request = new Request('https://aifect.co.kr/about');
  const original = brandPublicDocument(await (await publicMusicRoute(request, {}, '/about')).text());
  const page = aboutPresentation(original);
  assert.match(page, /<body class="legal-site about-page">/);
  assert.equal(page.match(/<h1\b/g).length, 1);
  assert.equal(page.match(/<li class="about-card">/g).length, 4);
  const part = (html, re) => [...html.matchAll(re)].map(m => m[0]);
  for (const re of [/<title>.*?<\/title>/g, /<meta\b[^>]+>/g, /<link rel="canonical"[^>]+>/g, /<h2>.*?<\/h2>/g, /<footer[\s\S]*?<\/footer>/g]) {
    assert.deepEqual(part(page, re), part(original, re));
  }
  const links = html => new Set([...html.matchAll(/<a\b[^>]*?href="([^"]+)"/g)].map(m => m[1]));
  assert.deepEqual(links(page), links(original));
  const originalList = [...original.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
  for (const copy of originalList) assert.ok(page.includes('<p>' + copy + '</p>'));
  for (const id of ['콘텐츠와 권리', '운영 및 이용 안내']) {
    const originalInfo = original.match(new RegExp('<h2>' + id + '</h2>(<p>.*?</p>)'))[1];
    assert.ok(page.includes(originalInfo));
  }
  const changed = original.replace('<h2>콘텐츠와 권리', '<h2>추가 안내</h2><p>새 안내</p><h2>콘텐츠와 권리');
  assert.equal(aboutPresentation(changed), changed);
});
