// One persistent control for page content, including bounded browsing lists.
// Chat history, lyrics, editors and modal scroll areas keep their own controls.
(() => {
  const main = document.querySelector('#main, .legal-content');
  if (!main || document.getElementById('page-scroll-top')) return;
  const button = document.createElement('button');
  button.id = 'page-scroll-top';
  button.className = 'page-scroll-top';
  button.type = 'button';
  button.textContent = '▲UP';
  button.setAttribute('aria-label', '맨 위로');
  button.title = '맨 위로';
  button.hidden = true;
  document.body.append(button);

  const listSelector = '.live-directory .talk-scroll, #dm-conversations, #welcome-guide-scroll';
  const overlaySelector = '.player, #player-extension, #player-action-panel, #player-lyric';
  const observed = new Set();
  let frame = 0, lastScrolled = null, target = window;

  function visible(element) {
    if (!element?.isConnected || element.hidden) return false;
    const box = element.getBoundingClientRect(), css = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && css.display !== 'none' && css.visibility !== 'hidden';
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const overlaysChanged = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
  function observe(elements) {
    for (const element of observed) if (!element.isConnected) { sizes?.unobserve(element); observed.delete(element); }
    for (const element of elements) if (!observed.has(element)) {
      observed.add(element);
      sizes?.observe(element);
      if (element.matches(overlaySelector)) overlaysChanged?.observe(element, {attributes:true, attributeFilter:['hidden','class','style']});
    }
  }
  function update() {
    frame = 0;
    const immersive = main.hasAttribute('data-room-focus') || main.closest('[data-room-focus]')
      || main.querySelector('#sing.web-studio, .dubbing-record-layout, #dubbing-editor-root, .studio-edit-workspace, .studio-edit-panel');
    const lists = [...main.querySelectorAll(listSelector)].filter(visible);
    if (immersive || (!visible(main) && !lists.length)) { button.hidden = true; return; }
    const overlays = [...document.querySelectorAll(overlaySelector)];
    observe([main, ...lists, ...overlays]);
    const page = document.scrollingElement || document.documentElement;
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const isScrolled = element => element.scrollTop >= 500 && element.scrollHeight > element.clientHeight + 1;
    // The last scrolled reading/list pane wins; a normal page scroll returns ownership.
    target = lists.includes(lastScrolled) && isScrolled(lastScrolled) ? lastScrolled
      : isScrolled(page) ? window : lists.find(isScrolled) || window;
    const scroller = target === window ? page : target;
    if (!isScrolled(scroller)) { button.hidden = true; return; }
    const content = target === window ? main : target;
    button.dataset.scrollPane = content.closest('.message-workspace') ? 'messages' : 'page';
    const box = content.getBoundingClientRect();
    const inset = target === window ? parseFloat(getComputedStyle(content).paddingRight) || 0 : 12;
    const right = Math.max(16, viewportWidth - Math.min(viewportWidth, box.right - inset));
    const buttonRight = viewportWidth - right, buttonLeft = buttonRight - 68;
    let bottom = target === window ? 16 : Math.max(16, viewportHeight - box.bottom + 12);
    for (const overlay of overlays) if (visible(overlay)) {
      const rect = overlay.getBoundingClientRect();
      if (rect.left < buttonRight && rect.right > buttonLeft && rect.top < viewportHeight && rect.bottom > 0) {
        bottom = Math.max(bottom, viewportHeight - rect.top + 12);
      }
    }
    button.style.right = right + 'px';
    button.style.bottom = `max(${bottom}px, calc(env(safe-area-inset-bottom, 0px) + 16px))`;
    button.hidden = buttonLeft < 0 || viewportHeight - bottom - 44 < Math.max(16, target === window ? 16 : box.top + 12);
  }
  button.addEventListener('click', () => {
    if (button.hidden || (target !== window && !target.isConnected)) return;
    target.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    schedule();
  });
  document.addEventListener('scroll', event => {
    if (event.target === document || event.target === document.scrollingElement) lastScrolled = null;
    else if (event.target?.matches?.(listSelector) && main.contains(event.target)) lastScrolled = event.target;
    else return;
    schedule();
  }, {capture:true, passive:true});
  if (typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(main, {childList:true, subtree:true, attributes:true, attributeFilter:['class','hidden','data-route','data-room-focus']});
    new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:['class','style','data-room-focus']});
  }
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('hashchange', () => { lastScrolled = null; schedule(); });
  window.addEventListener('pageshow', schedule);
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  document.fonts?.ready.then(schedule);
  observe([main]);
  schedule();
})();
