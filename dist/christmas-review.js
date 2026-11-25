// Animate only the active, server-resolved Christmas room product.
(() => {
  const native = window.Capacitor?.isNativePlatform?.();
  const root = '/assets/themes/christmas-v61/';
  const landscape = matchMedia('(min-width: 801px) and (min-height: 480px) and (orientation: landscape)');
  const portrait = matchMedia('(orientation: portrait)');
  const roomProfile = () => !native && landscape.matches ? 'landscape' : portrait.matches ? 'portrait' : null;
  const isChristmas = sku => sku === 'theme_christmas';
  const roomSkin = room => room?.theme?.sku || room?.theme_sku || room?.background;
  const widths = [256, 512, 768, 1024, 1254];
  const srcset = widths.map(w => root + 'assets/christmas-tree-card-' + w + '.webp ' + w + 'w').join(', ');
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  function picture(className, landscapeOnly = true) {
    const media = landscapeOnly ? ' media="' + landscape.media + '"' : '';
    return '<picture class="' + className + '"><source' + media + ' srcset="' + srcset +
      '" sizes="(min-width: 1900px) 300px, 220px"><img alt="" loading="lazy" decoding="async" src="' + blank + '"></picture>';
  }
  document.addEventListener('error', event => {
    const cover = event.target.closest?.('.af-review-cover,.af-review-shop-art');
    if (cover) (cover.closest('[data-christmas-shop]') || cover).remove();
  }, true);

  function bindRoom(host, signal, room) {
    let fx, generation = 0, skin = host.dataset.themeSku || roomSkin(room), maskFrame = 0;
    let profile = null;
    const isEditing = element => element?.matches?.('input,textarea,[contenteditable="true"]');
    const protectedNodes = host.querySelectorAll('.room-header,.voice-chat-panel,#voice-music-player,.talk-seat-controls,#live-current');
    const refreshMask = () => {
      if (!fx?.ready || maskFrame) return;
      maskFrame = requestAnimationFrame(() => {
        maskFrame = 0;
        if (fx?.particleScale) fx.refreshProtection();
      });
    };
    const observer = new ResizeObserver(refreshMask);
    function clear() {
      generation++;
      observer.disconnect();
      cancelAnimationFrame(maskFrame);
      maskFrame = 0;
      fx?.destroy();
      fx = null;
      profile = null;
      for (const node of protectedNodes) node.removeAttribute('data-theme-protect');
      delete host.dataset.christmasReview;
      delete host.dataset.themeAssetState;
    }
    function lockWhileEditing(element) {
      if (fx?.w && !fx.layoutLock && isEditing(element)) fx.setLayoutLock({width:fx.w, height:fx.h});
    }
    async function sync(next = roomProfile()) {
      clear();
      if (!isChristmas(skin) || !next || signal.aborted) return;
      profile = next;
      const token = generation;
      try {
        const { AifectChristmasTheme } = await import('/assets/themes/christmas-v61/src/christmas-theme.js');
        if (token !== generation || signal.aborted || !host.isConnected) return;
        for (const node of protectedNodes) {
          node.dataset.themeProtect = '0.3';
          observer.observe(node);
        }
        host.dataset.christmasReview = 'loading';
        fx = new AifectChristmasTheme(host, {roomProfile: next});
        await fx.initialized;
        if (token !== generation || signal.aborted) return;
        if (fx.metrics.error) { clear(); return; }
        if (host.contains(document.activeElement)) lockWhileEditing(document.activeElement);
        host.dataset.christmasReview = 'active';
      } catch { if (token === generation) clear(); }
    }
    const controls = new AbortController();
    const options = { signal: controls.signal };
    const themeObserver = new MutationObserver(() => {
      const next = host.dataset.themeSku;
      if (!next || skin === next) return;
      const needsSync = isChristmas(next) !== isChristmas(skin);
      skin = next;
      if (needsSync) void sync();
    });
    themeObserver.observe(host, { attributes: true, attributeFilter: ['data-theme-sku'] });
    function end() { controls.abort(); themeObserver.disconnect(); clear(); }
    function screenChanged() {
      // A keyboard can flip the viewport media query without rotating the device.
      const next = roomProfile();
      const lock = fx?.layoutLock;
      if (lock) {
        const sameWidth = Math.abs(host.getBoundingClientRect().width - lock.width) <= 2;
        const active = document.activeElement;
        const input = window.AifectMobileInput;
        // Focus can leave before the OS restores the viewport to portrait height.
        const closingKeyboard = profile === 'portrait' && next !== profile && input?.isMobile?.();
        if (sameWidth && (closingKeyboard || (host.contains(active) && isEditing(active)) || input?.measure?.().keyboard)) return;
        fx.setLayoutLock(null);
      }
      if (isChristmas(skin) && next !== profile) void sync(next);
    }
    signal.addEventListener('abort', end, { once: true });
    host.addEventListener('aifect-theme-error', end, options);
    host.addEventListener('focusin', event => lockWhileEditing(event.target), options);
    host.addEventListener('focusout', () => { if (fx?.layoutLock) queueMicrotask(screenChanged); }, options);
    window.addEventListener('aifect:topbar-layout', refreshMask, options);
    window.addEventListener('aifect:input-viewport', screenChanged, options);
    window.addEventListener('resize', screenChanged, options);
    landscape.addEventListener('change', screenChanged, options);
    portrait.addEventListener('change', screenChanged, options);
    void sync();
  }
  globalThis.AifectChristmasReview = {
    bindRoom, landscape,
    roomArt: room => !native && isChristmas(roomSkin(room)) ? picture('af-review-cover') : ''
  };
})();
