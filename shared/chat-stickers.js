import {createStickerEditor} from './chat-sticker-editor.js';
import catalog from './chat-sticker-catalog.json' with {type: 'json'};
import {parts,stickers,token} from './chat-sticker-body.js';

const groups = {basic: '고양이 표정', hand: '손 제스처', text: '텍스트', prop: '소품·효과'};
const tabs = {basic: '기본', text: '텍스트', prop: '소품·효과'};
// Final CSS heights, shared by the picker, editable images and sent messages.
// All picture stickers use the established props/effects height; CSS preserves
// each cropped asset's aspect ratio instead of fitting it into a square.
const sizes = {
  picture:22.8,
  // Keep all lettering and decorations inside the composer's 24px text line.
  text:{width:34.485,height:20.9}
};

// Fit to the established message box. A recropped asset keeps the source
// pixel scale of its original canvas so that its lettering does not grow.
const wordMetrics = new Map();
for (const {key, lettering, fitReference, messageScale = 1} of catalog) {
  if (!lettering) continue;
  const reference = fitReference ?? lettering;
  const scale = Math.min(sizes.text.width / reference.width, sizes.text.height / reference.height) * messageScale;
  const height = lettering.height * scale;
  const above = (lettering.top + lettering.bottom) * scale / 2;
  wordMetrics.set(key, {width:sizes.text.width * messageScale, height, above, below:height - above});
}

function image(key, className = '', surface = 'picker') {
  const {group, label, assetVersion} = stickers.get(key);
  const version = assetVersion ?? (group === 'text' ? 'v2' : 'v1');
  let style = '';
  if (group !== 'text') {
    style = `--cat-art-size:${sizes.picture}px`;
  } else if (surface === 'editor') {
    // Keep an editable word as one atomic image, with the same artwork box
    // and lettering baseline that its wrapper provides in a sent message.
    const word = wordMetrics.get(key);
    style = `--cat-slot-width:${word.width}px;--cat-art-height:${word.height}px;--cat-below-ink:${word.below}px`;
  }
  return `<img class="${className}" data-cat-art-group="${group}"${style ? ' style="'+style+'"' : ''} src="/assets/chat-stickers/${version}/${group}/${key}.webp" alt="${surface === 'picker' ? '' : label}" draggable="false">`;
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
  const all = parts(body);
  const html = [];
  const classes = i => spacing(all[i].key, all[i-1], all[i+1]);
  for (let i = 0; i < all.length;) {
    const {key, text} = all[i];
    if (!wordMetrics.has(key)) {
      html.push(key ? image(key, classes(i), 'message') : renderText(text));
      i++;
      continue;
    }
    // Adjacent words share just enough ascent and descent for their artwork.
    // Each stays an independent inline box, including at a soft wrap.
    const start = i;
    let above = 0, below = 0;
    while (i < all.length && wordMetrics.has(all[i].key)) {
      const metric = wordMetrics.get(all[i++].key);
      above = Math.max(above, metric.above);
      below = Math.max(below, metric.below);
    }
    for (let j = start; j < i; j++) {
      const word = wordMetrics.get(all[j].key);
      const style = `--cat-slot-width:${word.width}px;--cat-slot-height:${above + below}px;--cat-below-ink:${below}px;--cat-art-inset:${above - word.above}px;--cat-art-height:${word.height}px`;
      html.push(`<span class="cat-word-slot ${classes(j)}" style="${style}">${image(all[j].key, 'cat-chat-sticker cat-word-ink', 'message')}</span>`);
    }
  }
  return html.join('');
}

export function editor(element,onWarning = (_message) => {}) {
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
  return createStickerEditor(element,{fragment,token,spacing,limit:Number(element.dataset.limit),onWarning});
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

function tiles(group, inline, flat) {
  return catalog.filter(item => item.group === group).map(({key, label, lettering}) => {
    const ink = lettering ? ` style="--cat-width-per-ink-height:${lettering.width / (lettering.bottom - lettering.top)}"` : '';
    const name = flat ? label : groups[group] + ' · ' + label;
    return `<button type="button" class="cat-tile" data-cat-key="${key}" data-cat-group="${group}"${ink} aria-label="${name}" title="${label}" ${inline ? '' : 'aria-pressed="false"'}>
       ${image(key)}<span class="cat-quantity" hidden></span>
     </button>`;
  }).join('');
}

// Selection lives with the composer. Closing the dialog keeps the draft.
export function bind({picker, form, input, toggle, selected = [], close, glyph, inline = null, closeButton = false}) {
  const limit = input.maxLength, required = input.required;
  const events = new AbortController(), options = {signal: events.signal};
  picker.innerHTML = `<nav class="cat-tabs" aria-label="이모티콘 카테고리">${Object.entries(tabs).map(([key,label]) =>
      '<button type="button" data-cat-tab="' + key + '" aria-pressed="' + (key === 'basic') + '">' + label + '</button>').join('')}
    ${closeButton ? '<button type="button" class="cat-close" data-cat-close aria-label="이모티콘 닫기">' + glyph('close') + '</button>' : ''}</nav>
    <div class="cat-picker-scroll" tabindex="0" aria-label="이모티콘 목록"></div>
    ${inline ? '<span class="cat-status" role="status"></span>' : `<footer class="cat-footer"><div class="cat-tray" aria-label="선택한 이모티콘"></div>
      <div class="cat-actions"><span class="cat-status" role="status" aria-live="polite"></span>
      <button type="button" class="primary-button cat-send" data-cat-send>보내기</button></div></footer>`}`;
  const scroll = picker.querySelector('.cat-picker-scroll');
  const tray = picker.querySelector('.cat-tray');
  const status = picker.querySelector('.cat-status');
  const send = picker.querySelector('[data-cat-send]');
  let activeTab = 'basic', flatGroups = false;

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
      `<button type="button" data-cat-remove="${index}" data-cat-group="${stickers.get(key).group}" aria-label="${index + 1}번째 ${stickers.get(key).label} 선택 취소" title="선택 취소">${image(key)}</button>`).join('');
    toggle.dataset.catCount = length || '';
    toggle.setAttribute('aria-label', length ? '이모티콘 · ' + length + '개 선택' : '이모티콘');
    input.required = required && !length;
    input.maxLength = limit - message('', selected).length;
    status.textContent = length ? length + '개 선택' : '이모티콘을 골라 주세요';
    send.disabled = !length && !input.value.trim();
  }
  function showTab(key) {
    activeTab = key;
    for (const button of picker.querySelectorAll('[data-cat-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.catTab === key));
    }
    const tabGroups = key === 'basic' ? ['basic', 'hand'] : [key];
    if (flatGroups) {
      scroll.innerHTML = '<div class="cat-grid">' + tabGroups.map(group => tiles(group, inline, true)).join('') + '</div>';
    } else {
      scroll.innerHTML = tabGroups.map(group => {
        const title = ['basic','hand'].includes(group) ? '<h3>' + groups[group] + '</h3>' : '';
        return `<section aria-label="${groups[group]}">${title}<div class="cat-grid">${tiles(group, inline, false)}</div></section>`;
      }).join('');
    }
    scroll.scrollTop = 0;
    sync();
  }
  picker.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-cat-close')) return close();
    if (input.disabled || input.contentEditable === 'false') return;
    if (button.dataset.catTab) return showTab(button.dataset.catTab);
    if (form._busy || form.dataset.uploading) return;
    if (button.hasAttribute('data-cat-send')) return form.requestSubmit();
    if (button.dataset.catKey) {
      if (inline) {
        status.textContent = inline.insertSticker(button.dataset.catKey) ? '' : (inline.insertionWarning?.() || '메시지 길이 제한에 도달했습니다.');
        return;
      }
      if (input.value.length + token(button.dataset.catKey).length > input.maxLength) {
        status.textContent = '메시지 길이 제한에 도달했습니다.';
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
    setFlatGroups(flat) {
      if (flat === flatGroups) return;
      const focusedKey = scroll.contains(document.activeElement) ? document.activeElement.dataset.catKey : null;
      flatGroups = flat;
      showTab(activeTab);
      if (focusedKey) scroll.querySelector('[data-cat-key="' + focusedKey + '"]')?.focus({preventScroll:true});
    },
    clear() {selected.length = 0; sync();},
    destroy() {events.abort(); if (!inline) {input.maxLength = limit; input.required = required;}}
  };
}
