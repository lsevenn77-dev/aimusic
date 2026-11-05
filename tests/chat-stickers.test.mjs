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
  for (const {key, label, group, assetVersion} of catalog) {
    const file = 'assets/chat-stickers/' + (assetVersion ?? (group === 'text' ? 'v2' : 'v1')) + '/' + group + '/' + key + '.webp';
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

test('message size classes follow the catalog groups and preserve the three compact hands', () => {
  const compact = new Set(['cat_hand_thumbsup','cat_hand_ok','cat_hand_peace']);
  for (const {key, group} of catalog) {
    const html = render(message('가', [key]) + '나', escapeText);
    assert.equal(html.includes('cat-message-hand'), group === 'hand', key);
    assert.equal(html.includes('cat-message-prop'), group === 'prop', key);
    assert.equal(html.includes('cat-compact-hand'), compact.has(key), key);
    assert.equal(html.includes('cat-word-ink'), group === 'text', key);
    assert.equal(html.includes('--cat-below-ink'), group === 'text', key);
  }
});

test('only the requested word stickers shrink, and each run shares its own line metrics', () => {
  const words = catalog.filter(item => item.group === 'text');
  const scales = {cat_text_gamdong:0.9, cat_text_onepick:0.81, cat_text_best:0.9, cat_text_wa:0.9};
  for (const {key} of words) {
    const slot = render(message('', [key]), escapeText);
    const width = Number(slot.match(/--cat-slot-width:([\d.]+)px/)[1]);
    assert.equal(width, 62.7 * (scales[key] ?? 1));
  }
  const run = message('',words.map(item => item.key));
  const html = render(run + '\n' + message('', ['cat_text_wow']), escapeText);
  const heights = [...html.matchAll(/--cat-slot-height:([\d.]+)px/g)].map(match => Number(match[1]));
  assert.equal(heights.length,9);
  assert.equal(new Set(heights.slice(0,8)).size,1);
  assert.ok(heights[8] < heights[0]);
  const best = render(message('', ['cat_text_best']), escapeText);
  assert.match(best,/--cat-art-height:29.7px/);
  assert.ok(readFileSync(new URL('../dist/assets/chat-stickers/v2/text/cat_text_best.webp',import.meta.url)).length);
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
