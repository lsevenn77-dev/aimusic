import catalog from './chat-sticker-catalog.json' with {type: 'json'};

const stickers = new Map(catalog.map(item => [item.key, item]));
const groups = {basic: '고양이 표정', hand: '손 제스처', text: '텍스트', prop: '소품·효과'};
const tabs = {basic: '기본', text: '텍스트', prop: '소품·효과'};
const token = key => '[aifect:' + key + ']';

function image(key, className = '', decorative = false) {
  const {group, label} = stickers.get(key);
  return `<img class="${className}" src="/assets/chat-stickers/v1/${group}/${key}.webp" alt="${decorative ? '' : label}" draggable="false">`;
}

// Only catalog keys resolve to images. Every other part goes through the chat's
// existing text renderer, including old messages, unknown keys and invitations.
export function render(body, renderText) {
  const matches = body.matchAll(/\[aifect:(cat_[a-z_]+)\]/g);
  let html = '', end = 0, run = '';
  const flush = () => {
    if (run) html += '<span class="cat-chat-run">' + run + '</span>';
    run = '';
  };
  for (const match of matches) {
    if (!stickers.has(match[1])) continue;
    if (match.index > end) {
      flush();
      html += renderText(body.slice(end, match.index));
    }
    run += image(match[1], stickers.get(match[1]).group === 'text' ? 'cat-chat-sticker cat-word' : 'cat-chat-sticker');
    end = match.index + match[0].length;
  }
  flush();
  return html + renderText(body.slice(end));
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

function choices(group) {
  const items = catalog.filter(item => item.group === group).map(({key, label}) =>
    `<button type="button" class="cat-tile" data-cat-key="${key}" aria-label="${groups[group]} · ${label}" title="${label}" aria-pressed="false">
       ${image(key, '', true)}<span class="cat-quantity" hidden></span>
     </button>`).join('');
  return `<section aria-label="${groups[group]}">${['basic','hand'].includes(group) ? '<h3>' + groups[group] + '</h3>' : ''}
    <div class="cat-grid">${items}</div></section>`;
}

// Selection lives with the composer. Closing the dialog keeps the draft.
export function bind({picker, form, input, toggle, selected = [], close, glyph}) {
  const limit = input.maxLength, required = input.required;
  const events = new AbortController(), options = {signal: events.signal};
  picker.innerHTML = `<header class="cat-head"><strong>고양이 미니이모티콘</strong>
      <button type="button" class="cat-close" data-cat-close aria-label="이모티콘 닫기">${glyph('close')}</button></header>
    <nav class="cat-tabs" aria-label="이모티콘 카테고리">${Object.entries(tabs).map(([key,label]) =>
      '<button type="button" data-cat-tab="' + key + '" aria-pressed="' + (key === 'basic') + '">' + label + '</button>').join('')}</nav>
    <div class="cat-picker-scroll" tabindex="0" aria-label="이모티콘 목록"></div>
    <footer class="cat-footer"><div class="cat-tray" aria-label="선택한 이모티콘"></div>
      <div class="cat-actions"><span class="cat-status" role="status" aria-live="polite"></span>
      <button type="button" class="primary-button cat-send" data-cat-send>보내기</button></div></footer>`;
  const scroll = picker.querySelector('.cat-picker-scroll');
  const tray = picker.querySelector('.cat-tray');
  const status = picker.querySelector('.cat-status');
  const send = picker.querySelector('[data-cat-send]');

  function sync() {
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
      `<button type="button" data-cat-remove="${index}" aria-label="${index + 1}번째 ${stickers.get(key).label} 선택 취소" title="선택 취소">${image(key, '', true)}</button>`).join('');
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
    scroll.innerHTML = choices(key) + (key === 'basic' ? choices('hand') : '');
    scroll.scrollTop = 0;
    sync();
  }
  picker.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || input.disabled) return;
    if (button.hasAttribute('data-cat-close')) return close();
    if (button.dataset.catTab) return showTab(button.dataset.catTab);
    if (form._busy || form.dataset.uploading) return;
    if (button.hasAttribute('data-cat-send')) return form.requestSubmit();
    if (button.dataset.catKey) {
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
  input.addEventListener('input', () => {send.disabled = !selected.length && !input.value.trim();}, options);
  showTab('basic');
  return {
    body: () => message(input.value, selected),
    clear() {selected.length = 0; sync();},
    destroy() {events.abort(); input.maxLength = limit; input.required = required;}
  };
}
