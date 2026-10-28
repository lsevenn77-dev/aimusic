// Follow the actual route container without changing content or player layout.
(() => {
  const main = document.querySelector('#main');
  const footer = document.querySelector('.page-wrap > .page-footer');
  if (!main || !footer) return;
  const overlays = [...document.querySelectorAll('.player, .mobile-navigation, .social-mobile-navigation')];
  let frame;
  function align() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const style = getComputedStyle(main);
      const rect = main.getBoundingClientRect();
      const parent = footer.parentElement.getBoundingClientRect();
      footer.style.setProperty('--footer-width', `${rect.width}px`);
      footer.style.setProperty('--footer-offset', `${rect.left - parent.left}px`);
      footer.style.setProperty('--footer-left', style.paddingLeft);
      footer.style.setProperty('--footer-right', style.paddingRight);
      const covered = Math.max(0, ...overlays.map(element => {
        const css = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return css.position === 'fixed' && box.height && css.display !== 'none'
          ? Math.max(0, window.innerHeight - box.top) : 0;
      }));
      const reserved = parseFloat(getComputedStyle(footer.parentElement).paddingBottom) + parseFloat(getComputedStyle(document.body).paddingBottom);
      footer.style.setProperty('--footer-clearance', `${Math.max(0, covered - reserved)}px`);
    });
  }
  const sizes = new ResizeObserver(align);
  sizes.observe(main);
  overlays.forEach(element => sizes.observe(element));
  const visibility = new MutationObserver(align);
  overlays.forEach(element => visibility.observe(element, {attributes:true}));
  visibility.observe(document.body, {attributes:true, attributeFilter:['class']});
  new MutationObserver(align).observe(main, {attributes:true, childList:true});
  window.addEventListener('resize', align, {passive:true});
  align();
})();
