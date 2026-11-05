import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import catalog from '../shared/chat-sticker-catalog.json' with {type:'json'};
import {message, preview, render} from '../shared/chat-stickers.js';

const escapeText = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

test('every stable mini-sticker key resolves to its separate WebP', () => {
  assert.equal(new Set(catalog.map(item => item.key)).size, 65);
  for (const [group, count] of Object.entries({basic:33,hand:9,text:8,prop:15})) {
    assert.equal(catalog.filter(item => item.group === group).length, count);
  }
  for (const {key, label, group} of catalog) {
    const file = 'assets/chat-stickers/v1/' + group + '/' + key + '.webp';
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
  assert.equal((html.match(/cat-chat-run/g) || []).length, 1);
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
