// A persistent shell controller. No routing, media, or message acknowledgement.
(() => {
  const root = document.documentElement;
  const header = document.querySelector('.page-wrap > .topbar');
  const content = document.getElementById('common-topbar-content');
  const toggle = document.getElementById('mobile-topbar-toggle');
  if (!header || !content || !toggle) return;
  const mobile = matchMedia('(max-width:800px)');
  const key = 'aifect-mobile-topbar-collapsed';
  let collapsed = root.hasAttribute('data-mobile-topbar-collapsed');
  let animationTimer, scrollAnchor = null;

  function paint() {
    root.toggleAttribute('data-mobile-topbar-collapsed', collapsed);
    content.inert = mobile.matches && collapsed;
    if (content.inert) content.setAttribute('aria-hidden', 'true');
    else content.removeAttribute('aria-hidden');
    toggle.setAttribute('aria-expanded', String(!content.inert));
    toggle.setAttribute('aria-label', content.inert ? '상단바 펼치기' : '상단바 접기');
    toggle.title = toggle.getAttribute('aria-label');
  }
  function measure() {
    const css = getComputedStyle(header);
    // 44 menu + 86 official wordmark + 44 toggle + four 44px actions.
    const available = header.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    header.toggleAttribute('data-compact-brand', mobile.matches && available < 350);
    const height = header.getBoundingClientRect().height;
    header.parentElement.style.setProperty('--topbar-height', height + 'px');
    root.style.setProperty('--common-topbar-height', height + 'px');
    if (scrollAnchor?.element.isConnected) {
      const delta = scrollAnchor.element.getBoundingClientRect().top - scrollAnchor.top;
      if (Math.abs(delta) > .5) window.scrollBy({top:delta, behavior:'instant'});
    }
    window.dispatchEvent(new Event('aifect:topbar-layout'));
  }
  function unread() {
    const hasUnread = !!content.querySelector('.activity-badge:not([hidden]), .nav-message-badge:not([hidden])');
    toggle.toggleAttribute('data-unread', hasUnread);
    if (hasUnread) toggle.setAttribute('aria-describedby', 'mobile-topbar-unread');
    else toggle.removeAttribute('aria-describedby');
  }
  toggle.addEventListener('click', () => {
    if (!mobile.matches) return;
    // Native scroll anchoring handles most lists. Preserve a visible item too
    // when the browser excludes it from its anchor candidates; top stays top.
    scrollAnchor = null;
    if (window.scrollY > 56) {
      const element = document.elementFromPoint(innerWidth / 2, Math.max(0, header.getBoundingClientRect().bottom) + 48);
      if (element?.closest('#main')) scrollAnchor = {element, top:element.getBoundingClientRect().top};
    }
    root.setAttribute('data-topbar-animate', '');
    collapsed = !collapsed;
    // Keyboard activation has no pointerdown to dismiss the existing drawer.
    if (collapsed && document.getElementById('menu-toggle')?.getAttribute('aria-expanded') === 'true') document.getElementById('menu-backdrop')?.click();
    try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch { /* In-memory choice still works. */ }
    paint();
    clearTimeout(animationTimer);
    animationTimer = setTimeout(() => { measure(); scrollAnchor = null; root.removeAttribute('data-topbar-animate'); }, 240);
  });
  mobile.addEventListener('change', () => {
    clearTimeout(animationTimer); scrollAnchor = null; root.removeAttribute('data-topbar-animate');
    paint(); measure();
  });
  window.addEventListener('pageshow', () => { paint(); measure(); });
  window.addEventListener('resize', measure, {passive:true});
  // Existing badge painters remain the source of truth, including logout/read.
  new MutationObserver(unread).observe(content, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden']});
  new ResizeObserver(measure).observe(header);
  paint(); unread(); measure();
})();
