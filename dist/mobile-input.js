/* Keyboard geometry is presentation only: never replace controls, values or focus. */
(() => {
  const root = document.documentElement;
  const mobile = matchMedia('(max-width: 800px), (max-width: 1100px) and (pointer: coarse)');
  const editableSelector = 'textarea,select,input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=color]):not([type=image]),[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';
  const editable = element => element?.matches?.(editableSelector) && !element.disabled && !element.readOnly;
  let baseline = innerHeight, previousWidth = innerWidth, orientation = innerWidth > innerHeight, active = null;
  let surface = null, frame = 0, revealTimer = 0, blurTimer = 0, listening = false;
  const viewport = window.visualViewport;

  function measure() {
    const height = viewport?.height || innerHeight;
    const top = viewport?.offsetTop || 0;
    const scaled = Math.abs((viewport?.scale || 1) - 1) > 0.05;
    const keyboard = mobile.matches && !scaled && baseline - height > Math.max(120, baseline * 0.18);
    return {height, top, bottom: top + height, keyboard, scaled};
  }
  function clearSurface() {
    if (!surface) return;
    surface.removeAttribute('data-input-viewport');
    surface.style.removeProperty('--input-viewport-top');
    surface.style.removeProperty('--input-viewport-height');
    surface = null;
  }
  function reveal() {
    if (!editable(active) || !active.isConnected || !surface) return;
    // Native page scrolling owns ordinary fields. Only correct an obscured field
    // inside a constrained popup, once after keyboard geometry has settled.
    const owner = active.closest('.crew-action-body') || active.closest('#dialog-content') || surface;
    if (owner.scrollHeight <= owner.clientHeight) return;
    const field = active.getBoundingClientRect(), box = owner.getBoundingClientRect();
    const top = box.top + 48, bottom = box.bottom - 12;
    const delta = field.bottom > bottom ? Math.min(field.bottom - bottom, field.top - top) : field.top < top ? field.top - top : 0;
    if (Math.abs(delta) > 1) owner.scrollTop += delta;
  }
  function update() {
    frame = 0;
    if (!mobile.matches) { stop(); return; }
    const geometry = measure();
    const keyboard = geometry.keyboard && !!active?.isConnected;
    root.toggleAttribute('data-mobile-keyboard', keyboard);
    root.toggleAttribute('data-mobile-keyboard-compact', keyboard && geometry.height < 400);
    root.style.setProperty('--mobile-input-top', geometry.top + 'px');
    root.style.setProperty('--mobile-input-height', geometry.height + 'px');
    const next = keyboard ? active.closest('dialog[open],.voice-sheet') : null;
    if (next !== surface) { clearSurface(); surface = next; }
    if (surface) {
      surface.setAttribute('data-input-viewport', '');
      surface.style.setProperty('--input-viewport-top', geometry.top + 8 + 'px');
      surface.style.setProperty('--input-viewport-height', Math.max(0, geometry.height - 16) + 'px');
    }
    window.dispatchEvent(new Event('aifect:input-viewport'));
  }
  function schedule(event) {
    if (!frame) frame = requestAnimationFrame(update);
    // VisualViewport scroll events are Safari panning, not a request to scroll
    // the input again. Never fight a user scrolling a popup while typing.
    if (event?.type !== 'scroll') {
      clearTimeout(revealTimer);
      revealTimer = setTimeout(reveal, 180);
    }
  }
  function stop() {
    clearTimeout(blurTimer); clearTimeout(revealTimer); cancelAnimationFrame(frame); frame = 0;
    if (listening) {
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('scroll', schedule);
      listening = false;
    }
    active = null; clearSurface(); root.removeAttribute('data-mobile-keyboard'); root.removeAttribute('data-mobile-keyboard-compact');
    root.style.removeProperty('--mobile-input-top'); root.style.removeProperty('--mobile-input-height');
  }
  function focus(event) {
    if (!mobile.matches || !editable(event.target)) return;
    clearTimeout(blurTimer); active = event.target;
    if (!listening) {
      viewport?.addEventListener('resize', schedule, {passive: true});
      viewport?.addEventListener('scroll', schedule, {passive: true});
      window.addEventListener('scroll', schedule, {passive: true});
      listening = true;
    }
    schedule();
  }
  function resize() {
    // Use screen orientation where available: a resized Android layout viewport
    // must not be mistaken for rotating the device when its keyboard opens.
    const nextOrientation = screen.orientation?.type?.startsWith('landscape') ?? (innerWidth !== previousWidth ? innerWidth > innerHeight : orientation);
    if (nextOrientation !== orientation) { orientation = nextOrientation; baseline = Math.max(innerHeight, previousWidth); }
    previousWidth = innerWidth;
    if (!active) baseline = Math.max(baseline, innerHeight, viewport?.height || 0);
    if (active) schedule();
  }
  orientation = screen.orientation?.type?.startsWith('landscape') ?? orientation;
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => { if (!editable(document.activeElement)) { stop(); window.dispatchEvent(new Event('aifect:input-viewport')); } }, 350);
  });
  window.addEventListener('resize', resize, {passive: true});
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => { baseline = innerHeight; resize(); if (editable(document.activeElement)) focus({target: document.activeElement}); });
  mobile.addEventListener('change', () => { stop(); baseline = innerHeight; if (editable(document.activeElement)) focus({target: document.activeElement}); });
  window.AifectMobileInput = {measure, isMobile: () => mobile.matches};
})();
