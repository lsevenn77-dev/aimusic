// Measure the natural footer position so header height, page padding and long
// content are counted once. Fullscreen rooms/recording keep their own policy.
(() => {
  const main = document.querySelector('#main, .legal-content');
  const footer = document.querySelector('.page-wrap > .page-footer, .legal-site > .page-footer');
  if (!main || !footer) return;
  const overlays = [...document.querySelectorAll('.player, .mobile-navigation, .social-mobile-navigation')];
  const header = document.querySelector('.topbar, .legal-header');
  const set = (element, name, value) => {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  };
  let frame;
  function align() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const fullscreen = main.hasAttribute('data-room-focus') || footer.parentElement.hasAttribute('data-room-focus')
        || /^sing\//.test(main.dataset.route || '') || !!main.querySelector('#sing.web-studio, .dubbing-record-layout, .voice-room.talking-room');
      if (fullscreen) {
        footer.style.removeProperty('--footer-content-end');
        return;
      }
      // Routing briefly unmounts the old page; never persist zero geometry.
      if (!main.getClientRects().length) return;
      const style = getComputedStyle(main);
      const rect = main.getBoundingClientRect();
      if (main.id === 'main') {
        const parent = footer.parentElement.getBoundingClientRect();
        set(footer, '--footer-width', `${rect.width}px`);
        set(footer, '--footer-offset', `${rect.left - parent.left}px`);
        set(footer, '--footer-left', style.paddingLeft);
        set(footer, '--footer-right', style.paddingRight);
        set(main, '--footer-main-top', `${rect.top + window.scrollY}px`);
      }
      const naturalTop = footer.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(footer).marginTop) || 0);
      set(footer, '--footer-content-end', `${Math.max(0, naturalTop)}px`);
      const covered = Math.max(0, ...overlays.map(element => {
        const css = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return css.position === 'fixed' && box.height && css.display !== 'none' && css.visibility !== 'hidden'
          ? Math.max(0, window.innerHeight - box.top) : 0;
      }));
      const reserved = (parseFloat(getComputedStyle(footer.parentElement).paddingBottom) || 0)
        + (footer.parentElement === document.body ? 0 : parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
      set(footer, '--footer-clearance', `${Math.max(0, covered - reserved)}px`);
    });
  }
  const sizes = new ResizeObserver(align);
  sizes.observe(main);
  if (header) sizes.observe(header);
  overlays.forEach(element => sizes.observe(element));
  const visibility = new MutationObserver(align);
  overlays.forEach(element => visibility.observe(element, {attributes:true}));
  visibility.observe(document.body, {attributes:true, attributeFilter:['class','style']});
  visibility.observe(footer.parentElement, {attributes:true, attributeFilter:['class','style','data-room-focus']});
  new MutationObserver(align).observe(main, {attributes:true, childList:true, subtree:true, attributeFilter:['class','data-route','data-room-focus']});
  window.addEventListener('resize', align, {passive:true});
  window.visualViewport?.addEventListener('resize', align, {passive:true});
  window.addEventListener('hashchange', align);
  document.fonts?.ready.then(align);
  align();
})();
