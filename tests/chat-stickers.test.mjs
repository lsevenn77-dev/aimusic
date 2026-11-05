import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import catalog from '../shared/chat-sticker-catalog.json' with {type:'json'};
import {message, preview, render} from '../shared/chat-stickers.js';
import {fixture} from './fixture.mjs';

const escapeText = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

test('every stable mini-sticker key resolves to its separate WebP', () => {
  assert.equal(new Set(catalog.map(item => item.key)).size, 65);
  for (const [group, count] of Object.entries({basic:33,hand:9,text:8,prop:15})) {
    assert.equal(catalog.filter(item => item.group === group).length, count);
  }
  for (const {key, label, group} of catalog) {
    const file = 'assets/chat-stickers/' + (group === 'text' ? 'v2/' : 'v1/') + group + '/' + key + '.webp';
    const bytes = readFileSync(new URL('../dist/' + file, import.meta.url));
    assert.equal(bytes.toString('ascii',8,12), 'WEBP');
    const html = render(message('', [key]), escapeText);
    assert.ok(html.includes('src="/' + file + '"'));
    assert.ok(html.includes('alt="' + label + '"'));
  }
});

test('stored message bodies keep text, sticker order and repetitions on replay', () => {
  const body = message('응원해요 🎶\n', ['cat_basic_laugh','cat_text_nice','cat_basic_laugh']);
  const html = render(body, escapeText);
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.equal((html.match(/cat-after-sticker/g) || []).length, 2);
  assert.match(html, /응원해요 🎶\n.*cat_basic_laugh\.webp.*cat_text_nice\.webp.*cat_basic_laugh\.webp/);
  assert.equal(preview(body), '응원해요 🎶\n[웃음][Nice][웃음]');
});

test('unknown or malformed keys stay safe text, including alongside valid stickers', () => {
  const text = '💜 [aifect:cat_unknown] [aifect:../../x] <img onerror=oops>';
  assert.equal(render(text, escapeText), escapeText(text));
  const mixed = render(text + message('', ['cat_prop_cloud']) + text, escapeText);
  assert.equal((mixed.match(/<img /g) || []).length, 1);
  assert.ok(mixed.startsWith(escapeText(text)) && mixed.endsWith(escapeText(text)));
});

test('DM history returns the same interleaved body to both accounts after sending', async t => {
  const f = await fixture(t);
  f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Friend',0)");
  const cats = ['cat_basic_laugh','cat_text_wa','cat_basic_smile','cat_text_nice','cat_prop_star'];
  const body = '첫 줄' + message('', cats) + '사이\n\n둘째 줄' + message('', ['cat_text_wow']);
  const sent = await f.call('/api/dm/friend','POST',{body,request_id:crypto.randomUUID()});
  assert.ok([200,201].includes(sent.status), JSON.stringify(sent.body));
  for (const [sender,peer] of [['owner','friend'],['other','producer']]) {
    const response = await f.call('/api/dm/'+peer,'GET',undefined,sender);
    const stored = response.body.messages.at(-1).body;
    assert.equal(stored, body);
    const html = render(stored, escapeText);
    assert.equal((html.match(/cat-after-sticker/g)||[]).length, 4);
    assert.equal((html.match(/cat-after-text/g)||[]).length, 2);
    assert.equal((html.match(/cat-before-text/g)||[]).length, 1);
    assert.ok(html.includes('사이\n\n둘째 줄'));
  }
});
