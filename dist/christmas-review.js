// Animate only the active, server-resolved Christmas room product.
(() => {
  if (window.Capacitor?.isNativePlatform?.()) return;

  const root = '/assets/themes/christmas-v61/';
  const landscape = matchMedia('(min-width: 801px) and (min-height: 480px) and (orientation: landscape)');
  const portrait = matchMedia('(orientation: portrait)');
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
      for (const node of protectedNodes) node.removeAttribute('data-theme-protect');
      delete host.dataset.christmasReview;
      delete host.dataset.themeAssetState;
    }
    async function sync() {
      clear();
      if (!isChristmas(skin)) return;
      if (!landscape.matches) {
        // Small screens keep the product's static, UI-free photograph.
        return;
      }
      const token = generation;
      try {
        const { AifectChristmasTheme } = await import('/assets/themes/christmas-v61/src/christmas-theme.js');
        if (token !== generation || signal.aborted || !host.isConnected) return;
        for (const node of protectedNodes) {
          node.dataset.themeProtect = '0.3';
          observer.observe(node);
        }
        host.dataset.christmasReview = 'loading';
        fx = new AifectChristmasTheme(host);
        await fx.initialized;
        if (token !== generation || signal.aborted) return;
        if (fx.metrics.error) { clear(); return; }
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
      // A landscape tablet's on-screen keyboard can cross the minimum height.
      // Keep the pre-focus backdrop until the keyboard closes or the width changes.
      const lock = fx?.layoutLock;
      if (lock && !portrait.matches && Math.abs(host.getBoundingClientRect().width - lock.width) < 2) return;
      void sync();
    }
    signal.addEventListener('abort', end, { once: true });
    host.addEventListener('aifect-theme-error', end, options);
    host.addEventListener('focusin', event => {
      if (fx?.w && event.target.matches('input,textarea,[contenteditable="true"]')) fx.setLayoutLock({width:fx.w, height:fx.h});
    }, options);
    host.addEventListener('focusout', () => {
      if (!fx?.layoutLock) return;
      fx.setLayoutLock(null);
      if (!landscape.matches) void sync();
    }, options);
    window.addEventListener('aifect:topbar-layout', refreshMask, options);
    landscape.addEventListener('change', screenChanged, options);
    portrait.addEventListener('change', () => { if (!landscape.matches) screenChanged(); }, options);
    void sync();
  }
  globalThis.AifectChristmasReview = {
    bindRoom, landscape,
    roomArt: room => isChristmas(roomSkin(room)) ? picture('af-review-cover') : ''
  };
})();
