// The live DOM contains editable text and atomic images. Only the chat's existing
// plain-string body crosses the draft, clipboard and transport boundaries.
export function createStickerEditor(element, {fragment, token, spacing, limit}) {
  const events = new AbortController();
  const options = {signal: events.signal};
  let caret = null, accepted = '', composing = false;
  const keyOf = node => node.nodeType === Node.ELEMENT_NODE && node.dataset?.catSticker;
  function read(root) {
    if (root.childNodes.length === 1 && root.firstChild.nodeName === 'BR') return '';
    let value = '', previousBlock = false;
    for (const node of root.childNodes) {
      const block = ['DIV','P'].includes(node.nodeName);
      if (node.previousSibling && (block || previousBlock)) value += '\n';
      if (node.nodeType === Node.TEXT_NODE) value += node.textContent;
      else if (keyOf(node)) value += token(keyOf(node));
      else if (node.nodeName === 'BR') value += '\n';
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
  function set(value) {
    element.replaceChildren(fragment(value));
    accepted = value;
    caret = endRange();
  }
  function changed() {
    if (composing) return;
    const value = read(element);
    if (value.length > limit) {
      set(accepted);
      restore(caret);
      return;
    }
    accepted = value;
    if (!value && element.childNodes.length) element.replaceChildren();
    layout();
    if (document.activeElement === element) remember();
  }
  function insert(value, focus = false) {
    if (element.contentEditable === 'false' || composing) return false;
    const range = (document.activeElement === element && currentRange()) || (caret && element.contains(caret.commonAncestorContainer) ? caret : endRange());
    if (read(element).length - read(range.cloneContents()).length + value.length > limit) return false;
    const part = fragment(value), last = part.lastChild;
    range.deleteContents();
    range.insertNode(part);
    if (last) range.setStartAfter(last);
    range.collapse(true);
    caret = range.cloneRange();
    if (focus || document.activeElement === element) restore(range);
    element.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
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
  element.addEventListener('compositionstart', () => {composing = true;}, options);
  element.addEventListener('compositionend', () => {composing = false; changed();}, options);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === element) remember();
  }, options);
  element.addEventListener('blur', remember, options);
  element.addEventListener('beforeinput', event => {
    if (composing || event.isComposing) return;
    if (['insertParagraph','insertLineBreak'].includes(event.inputType)) {
      event.preventDefault(); insert('\n', true);
    } else if (['deleteContentBackward','deleteContentForward'].includes(event.inputType)) {
      removeSticker(event, event.inputType === 'deleteContentBackward');
    } else if (event.inputType.startsWith('format') || event.inputType === 'insertFromDrop') {
      event.preventDefault();
    } else if (event.data && read(element).length - read((currentRange() || endRange()).cloneContents()).length + event.data.length > limit) {
      event.preventDefault();
    }
  }, options);
  element.addEventListener('paste', event => {
    event.preventDefault();
    insert(event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'), true);
  }, options);
  element.addEventListener('drop', event => event.preventDefault(), options);
  for (const type of ['copy','cut']) {
    element.addEventListener(type, event => {
      const range = currentRange();
      if (!range || range.collapsed) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', read(range.cloneContents()));
      if (type === 'cut') insert('', true);
    }, options);
  }
  return {get:() => read(element), set, insertSticker:key => insert(token(key)), remember,
    focus() {element.focus({preventScroll:true}); if (caret) restore(caret);},
    disable() {element.contentEditable = 'false'; element.setAttribute('aria-disabled','true');},
    destroy() {events.abort();}
  };
}
