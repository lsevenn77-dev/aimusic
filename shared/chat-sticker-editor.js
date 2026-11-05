import {dmBodyStats,fitDmInsertion,DM_BODY_LIMIT,lengthWarning,parts,stickers} from './chat-sticker-body.js';

// The live DOM contains editable text and atomic images. Only the chat's existing
// plain-string body crosses the draft, clipboard and transport boundaries.
export function createStickerEditor(element, {fragment, token, spacing, limit, onWarning}) {
  const events = new AbortController();
  const options = {signal: events.signal};
  let caret = null, accepted = '', composing = false;
  const keyOf = node => node.nodeType === Node.ELEMENT_NODE && node.dataset?.catSticker;
  // A trailing LF needs a caret box for the next typed character. The direct composer keeps one
  // presentational break after it, outside the serialized draft and selection.
  const direct = !!element.closest('.dm-inline-field');
  const dm = direct || !!element.closest('.room-dm-composer');
  const counter = dm ? document.createElement('span') : null;
  let notice = '', editStart = 0, editEnd = 0;
  if (counter) {
    counter.className = 'dm-length';
    element.after(counter);
    updateCounter(0);
  }
  function updateCounter(length) {
    if (!counter) return;
    counter.textContent = length.toLocaleString('ko-KR') + ' / 2,000';
    counter.dataset.state = length >= DM_BODY_LIMIT ? 'full' : length >= 1800 ? 'near' : 'normal';
    counter.setAttribute('aria-label','메시지 글자 수 ' + counter.textContent);
  }
  function syncCaretBreak(value) {
    if (!direct) return;
    const marker = element.querySelector('br[data-dm-caret]');
    if (!value.endsWith('\n')) { marker?.remove(); return; }
    if (marker && marker === element.lastChild) return;
    const br = marker || document.createElement('br');
    br.setAttribute('data-dm-caret', '');
    element.append(br);
  }
  function read(root) {
    if (root.childNodes.length === 1 && root.firstChild.nodeName === 'BR') return '';
    let value = '', previousBlock = false;
    for (const node of root.childNodes) {
      const block = ['DIV','P'].includes(node.nodeName);
      if (node.previousSibling && (block || previousBlock)) value += '\n';
      if (node.nodeType === Node.TEXT_NODE) value += node.textContent;
      else if (keyOf(node)) value += token(keyOf(node));
      else if (node.nodeName === 'BR') value += node.hasAttribute('data-dm-caret') ? '' : '\n';
      else value += read(node);
      previousBlock = block;
    }
    return value;
  }
  function adjacent(node, direction) {
    let next = node[direction];
    while (next && next.nodeType === Node.TEXT_NODE && !next.textContent) next = next[direction];
    if (next && keyOf(next)) return {key:keyOf(next)};
    return {text:next?.textContent || ''};
  }
  function layout() {
    for (const img of element.querySelectorAll('img[data-cat-sticker]')) {
      img.className = spacing(keyOf(img), adjacent(img,'previousSibling'), adjacent(img,'nextSibling'));
    }
  }
  function currentRange() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return element.contains(range.commonAncestorContainer) ? range : null;
  }
  function endRange() {
    const range = document.createRange();
    range.selectNodeContents(element);
    if (direct && element.lastElementChild?.matches('br[data-dm-caret]')) range.setEndBefore(element.lastElementChild);
    range.collapse(false);
    return range;
  }
  function remember() {
    const range = currentRange();
    if (range) caret = range.cloneRange();
  }
  function restore(range) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function surrounding(range) {
    const left = document.createRange(), right = document.createRange();
    left.selectNodeContents(element); right.selectNodeContents(element);
    left.setEnd(range.startContainer,range.startOffset);
    right.setStart(range.endContainer,range.endOffset);
    return {before:read(left.cloneContents()),after:read(right.cloneContents())};
  }
  function saveEditRange() {
    const {before,after} = surrounding(currentRange() || endRange());
    editStart = before.length;
    editEnd = accepted.length - after.length;
  }
  // After rebuilding canonical text/image nodes, restore the caret in stored
  // body offsets. A sticker is a single selectable atom.
  function position(offset) {
    const range = endRange();
    for (const node of element.childNodes) {
      const key = keyOf(node);
      const size = key ? token(key).length : node.textContent.length;
      if (offset <= size) {
        if (node.nodeType === Node.TEXT_NODE) range.setStart(node,offset);
        else if (offset) range.setStartAfter(node);
        else range.setStartBefore(node);
        range.collapse(true); break;
      }
      offset -= size;
    }
    return range;
  }
  function restoreEdit(start,end=start) {
    caret = position(start);
    const tail = position(Math.max(start,end));
    caret.setEnd(tail.startContainer,tail.startOffset);
    restore(caret);
  }
  function set(value) {
    element.replaceChildren(fragment(value));
    syncCaretBreak(value);
    accepted = value;
    caret = endRange();
    if (dm) updateCounter(dmBodyStats(value).length);
  }
  function changed() {
    if (composing) return;
    const value = read(element);
    const stats = dm ? dmBodyStats(value) : null;
    // Existing drafts may precede the sticker limit. Let the user remove
    // content from them, while validating any new send independently.
    if (stats?.warning) {
      const prior = dmBodyStats(accepted);
      const reducing = prior.warning && stats.count <= prior.count && stats.length <= prior.length && value.length < accepted.length;
      if (!reducing) {
        const before = accepted.slice(0,editStart), after = accepted.slice(editEnd);
        const incoming = value.startsWith(before) && value.endsWith(after)
          ? value.slice(before.length,value.length-after.length) : '';
        const fit = fitDmInsertion(before,incoming,after);
        if (fit.value) {set(before + fit.value + after);restoreEdit(before.length + fit.value.length);}
        else {set(accepted);restoreEdit(editStart,editEnd);}
        onWarning(stats.warning);
        return;
      }
    } else if (!dm && value.length > limit) {
      set(accepted);restore(caret);
      return;
    }
    if (dm && stats.count !== element.querySelectorAll('img[data-cat-sticker]').length) {
      const offset = surrounding(currentRange() || endRange()).before.length;
      set(value);
      restoreEdit(offset);
    }
    accepted = value;
    if (!value && element.childNodes.length) element.replaceChildren();
    syncCaretBreak(value);
    layout();
    if (dm) updateCounter(stats.length);
    if (document.activeElement === element) remember();
  }
  function insert(value, focus = false, fromPicker = false) {
    if (element.contentEditable === 'false' || composing) return false;
    const range = (document.activeElement === element && currentRange()) || (caret && element.contains(caret.commonAncestorContainer) ? caret : endRange());
    notice = '';
    if (dm && value) {
      const {before,after} = surrounding(range);
      const fit = fitDmInsertion(before,value,after);
      notice = fit.warning;
      if (notice && !fromPicker) onWarning(notice);
      if (!fit.value) return false;
      value = fit.value;
    } else if (read(element).length - read(range.cloneContents()).length + value.length > limit && value) return false;
    const part = fragment(value), last = part.lastChild;
    range.deleteContents();
    range.insertNode(part);
    if (direct && last?.nodeType === Node.TEXT_NODE) {
      syncCaretBreak(read(element));
      range.setStart(last, last.length);
    } else if (last) range.setStartAfter(last);
    range.collapse(true);
    caret = range.cloneRange();
    if (focus || document.activeElement === element) restore(range);
    element.dispatchEvent(new Event('input', {bubbles:true}));
    // The picker holds focus. Reveal the inserted image inside the scrollable
    // editor without moving the page, changing the selection or reopening IME.
    if (fromPicker) revealSticker(last);
    return true;
  }
  function revealSticker(img) {
    if (dm && img instanceof HTMLImageElement && element.contains(img) && element.scrollHeight > element.clientHeight) {
      const viewportTop = element.getBoundingClientRect().top + element.clientTop;
      const padding = getComputedStyle(element);
      const top = viewportTop + parseFloat(padding.paddingTop);
      const bottom = viewportTop + element.clientHeight - parseFloat(padding.paddingBottom);
      const art = img.getBoundingClientRect();
      if (art.top < top) element.scrollTop -= Math.ceil(top - art.top);
      else if (art.bottom > bottom) element.scrollTop += Math.ceil(art.bottom - bottom);
    }
  }
  function removeSticker(event, backwards) {
    const range = currentRange();
    if (!range?.collapsed) return;
    let node = range.startContainer;
    const offset = range.startOffset, direction = backwards ? 'previousSibling' : 'nextSibling';
    if (node.nodeType === Node.TEXT_NODE) {
      if (offset !== (backwards ? 0 : node.textContent.length)) return;
      node = node[direction];
    } else {
      node = node.childNodes[offset - (backwards ? 1 : 0)];
    }
    while (node && node.nodeType === Node.TEXT_NODE && !node.textContent) node = node[direction];
    if (!node || !keyOf(node)) return;
    event.preventDefault();
    range.setStartBefore(node);
    range.collapse(true);
    node.parentNode.removeChild(node);
    restore(range);
    element.dispatchEvent(new Event('input', {bubbles:true}));
  }
  element.addEventListener('input', changed, options);
  element.addEventListener('compositionstart', () => {if (dm) saveEditRange(); composing = true;}, options);
  element.addEventListener('compositionend', () => {
    composing = false;
    if (dm) element.dispatchEvent(new Event('input',{bubbles:true}));
    else changed();
  }, options);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === element) remember();
  }, options);
  element.addEventListener('blur', remember, options);
  element.addEventListener('beforeinput', event => {
    if (composing || event.isComposing) return;
    if (dm) saveEditRange();
    if (['insertParagraph','insertLineBreak'].includes(event.inputType)) {
      event.preventDefault(); insert('\n', true);
    } else if (['deleteContentBackward','deleteContentForward'].includes(event.inputType)) {
      removeSticker(event, event.inputType === 'deleteContentBackward');
    } else if (event.inputType.startsWith('format') || event.inputType === 'insertFromDrop') {
      event.preventDefault();
    } else if (dm && event.data && event.cancelable) {
      const {before,after} = surrounding(currentRange() || endRange());
      if (dmBodyStats(before + event.data + after).warning) {
        event.preventDefault(); insert(event.data,true);
      }
    } else if (!dm && event.data && read(element).length - read((currentRange() || endRange()).cloneContents()).length + event.data.length > limit) {
      event.preventDefault();
    }
  }, options);
  element.addEventListener('paste', event => {
    event.preventDefault();
    const text = (dm && event.clipboardData.getData('application/x-aifect-dm')) || event.clipboardData.getData('text/plain');
    if (text) insert(text.replace(/\r\n?/g,'\n'), true);
  }, options);
  element.addEventListener('drop', event => event.preventDefault(), options);
  for (const type of ['copy','cut']) {
    element.addEventListener(type, event => {
      const range = currentRange();
      if (!range || range.collapsed) return;
      event.preventDefault();
      const body = read(range.cloneContents());
      if (dm) {
        event.clipboardData.setData('text/plain',parts(body).map(p=>p.key?'['+stickers.get(p.key).label+']':p.text).join(''));
        event.clipboardData.setData('application/x-aifect-dm',body);
      } else event.clipboardData.setData('text/plain',body);
      if (type === 'cut') insert('', true);
    }, options);
  }
  return {get:() => composing && dm ? accepted : read(element), set, insertSticker:key => insert(token(key),false,true), remember,
    insertionWarning:()=>notice || lengthWarning,
    canSend() {if (!dm) return true; if (composing) return false; const {warning}=dmBodyStats(read(element)); if (warning) onWarning(warning); return !warning;},
    focus() {
      element.focus({preventScroll:true});
      if (!caret) return;
      restore(caret);
      // Mobile WebKit scrolls to the caret when focus returns from the picker.
      // Keep the whole image preceding that caret visible after native layout.
      if (dm) requestAnimationFrame(() => {
        const range = currentRange();
        if (document.activeElement === element && range?.collapsed)
          revealSticker(range.startContainer.childNodes[range.startOffset-1]);
      });
    },
    disable() {element.contentEditable = 'false'; element.setAttribute('aria-disabled','true');},
    destroy() {events.abort();counter?.remove();}
  };
}
