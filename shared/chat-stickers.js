import {createStickerEditor} from './chat-sticker-editor.js';
import catalog from './chat-sticker-catalog.json' with {type: 'json'};

const stickers = new Map(catalog.map(item => [item.key, item]));
const groups = {basic: '고양이 표정', hand: '손 제스처', text: '텍스트', prop: '소품·효과'};
const tabs = {basic: '기본', text: '텍스트', prop: '소품·효과'};
const token = key => '[aifect:' + key + ']';
const compactHands = new Set(['cat_hand_thumbsup','cat_hand_ok','cat_hand_peace']);

function image(key, className = '', surface = 'picker') {
  const {group, label, lettering} = stickers.get(key);
  let metrics = '';
  if (surface === 'message' && compactHands.has(key)) className += ' cat-compact-hand';
  if (surface === 'message' && lettering) {
    // Top and bottom bound the glyphs within the source image, excluding decorations.
    const {width, height, top, bottom} = lettering;
    const belowCentre = (height - (top + bottom) / 2) / height;
    className += ' cat-word-ink';
    metrics = ` style="--cat-art-aspect:${height / width};--cat-below-ink:${belowCentre}"`;
  }
  return `<img class="${className}"${metrics} src="/assets/chat-stickers/${group === 'text' ? 'v2' : 'v1'}/${group}/${key}.webp" alt="${surface === 'picker' ? '' : label}" draggable="false">`;
}

// A known token is one atom in both history and the editor. Unknown tokens
// remain ordinary text, including messages written before this catalog existed.
function parts(body) {
  const result = [];
  let end = 0;
  for (const match of body.matchAll(/\[aifect:(cat_[a-z_]+)\]/g)) {
    if (!stickers.has(match[1])) continue;
    if (match.index > end) result.push({text:body.slice(end,match.index)});
    result.push({key:match[1]});
    end = match.index + match[0].length;
  }
  if (end < body.length) result.push({text:body.slice(end)});
  return result;
}

function spacing(key, before, after) {
  const classes = ['cat-chat-sticker'];
  if (stickers.get(key).group === 'text') classes.push('cat-word');
  if (before?.key) classes.push('cat-after-sticker');
  else if (before?.text && !before.text.endsWith('\n')) classes.push('cat-after-text');
  if (after?.text && !after.text.startsWith('\n')) classes.push('cat-before-text');
  return classes.join(' ');
}

export function render(body, renderText) {
  return parts(body).map((part, i, all) => part.key
    ? image(part.key, spacing(part.key, all[i-1], all[i+1]), 'message')
    : renderText(part.text)).join('');
}

export function editor(element) {
  function fragment(body) {
    const dom = document.createDocumentFragment();
    const all = parts(body);
    all.forEach((part, i) => {
      if (!part.key) { dom.append(part.text); return; }
      const template = document.createElement('template');
      template.innerHTML = image(part.key, spacing(part.key, all[i-1], all[i+1]), 'editor');
      const img = template.content.querySelector('img');
      img.dataset.catSticker = part.key;
      dom.append(img);
    });
    return dom;
  }
  return createStickerEditor(element,{fragment,token,spacing,limit:Number(element.dataset.limit)});
}

export function preview(body) {
  return body.replace(/\[aifect:(cat_[a-z_]+)\]/g, (raw, key) => {
    const item = stickers.get(key);
    return item ? '[' + item.label + ']' : raw;
  });
}

export function message(text, selected) {
  return text + selected.map(token).join('');
}

function choices(group, inline) {
  const items = catalog.filter(item => item.group === group).map(({key, label}) =>
    `<button type="button" class="cat-tile" data-cat-key="${key}" aria-label="${groups[group]} · ${label}" title="${label}" ${inline ? '' : 'aria-pressed="false"'}>
       ${image(key)}<span class="cat-quantity" hidden></span>
     </button>`).join('');
  return `<section aria-label="${groups[group]}">${['basic','hand'].includes(group) ? '<h3>' + groups[group] + '</h3>' : ''}
    <div class="cat-grid">${items}</div></section>`;
}

// Selection lives with the composer. Closing the dialog keeps the draft.
export function bind({picker, form, input, toggle, selected = [], close, glyph, inline = null}) {
  const limit = input.maxLength, required = input.required;
  const events = new AbortController(), options = {signal: events.signal};
  picker.innerHTML = `<nav class="cat-tabs" aria-label="이모티콘 카테고리">${Object.entries(tabs).map(([key,label]) =>
      '<button type="button" data-cat-tab="' + key + '" aria-pressed="' + (key === 'basic') + '">' + label + '</button>').join('')}</nav>
    <div class="cat-picker-scroll" tabindex="0" aria-label="이모티콘 목록"></div>
    ${inline ? '<span class="cat-status" role="status"></span>' : `<footer class="cat-footer"><div class="cat-tray" aria-label="선택한 이모티콘"></div>
      <div class="cat-actions"><span class="cat-status" role="status" aria-live="polite"></span>
      <button type="button" class="primary-button cat-send" data-cat-send>보내기</button></div></footer>`}`;
  const scroll = picker.querySelector('.cat-picker-scroll');
  const tray = picker.querySelector('.cat-tray');
  const status = picker.querySelector('.cat-status');
  const send = picker.querySelector('[data-cat-send]');

  function sync() {
    if (inline) return;
    const counts = new Map();
    for (const key of selected) counts.set(key, (counts.get(key) || 0) + 1);
    for (const tile of scroll.querySelectorAll('[data-cat-key]')) {
      const count = counts.get(tile.dataset.catKey) || 0;
      tile.setAttribute('aria-pressed', String(count > 0));
      const badge = tile.querySelector('.cat-quantity');
      badge.hidden = !count;
      badge.textContent = count || '';
    }
    const length = selected.length;
    tray.hidden = !length;
    tray.innerHTML = selected.map((key, index) =>
      `<button type="button" data-cat-remove="${index}" aria-label="${index + 1}번째 ${stickers.get(key).label} 선택 취소" title="선택 취소">${image(key)}</button>`).join('');
    toggle.dataset.catCount = length || '';
    toggle.setAttribute('aria-label', length ? '이모티콘 · ' + length + '개 선택' : '이모티콘');
    input.required = required && !length;
    input.maxLength = limit - message('', selected).length;
    status.textContent = length ? length + '개 선택' : '이모티콘을 골라 주세요';
    send.disabled = !length && !input.value.trim();
  }
  function showTab(key) {
    for (const button of picker.querySelectorAll('[data-cat-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.catTab === key));
    }
    scroll.innerHTML = choices(key, inline) + (key === 'basic' ? choices('hand', inline) : '');
    scroll.scrollTop = 0;
    sync();
  }
  picker.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || input.disabled || input.contentEditable === 'false') return;
    if (button.hasAttribute('data-cat-close')) return close();
    if (button.dataset.catTab) return showTab(button.dataset.catTab);
    if (form._busy || form.dataset.uploading) return;
    if (button.hasAttribute('data-cat-send')) return form.requestSubmit();
    if (button.dataset.catKey) {
      if (inline) {
        status.textContent = inline.insertSticker(button.dataset.catKey) ? '' : '메시지 길이 제한에 도달했어요.';
        return;
      }
      if (input.value.length + token(button.dataset.catKey).length > input.maxLength) {
        status.textContent = '메시지 길이 제한에 도달했어요.';
        return;
      }
      selected.push(button.dataset.catKey);
      sync();
      tray.scrollLeft = tray.scrollWidth;
    } else if (button.hasAttribute('data-cat-remove')) {
      const index = Number(button.dataset.catRemove);
      selected.splice(index, 1);
      sync();
      const focus = tray.children[Math.min(index, selected.length - 1)] || picker.querySelector('[data-cat-tab][aria-pressed=true]');
      focus.focus({preventScroll:true});
    }
  }, options);
  if (!inline) input.addEventListener('input', () => {send.disabled = !selected.length && !input.value.trim();}, options);
  showTab('basic');
  return {
    body: () => inline ? inline.get() : message(input.value, selected),
    clear() {selected.length = 0; sync();},
    destroy() {events.abort(); if (!inline) {input.maxLength = limit; input.required = required;}}
  };
}
