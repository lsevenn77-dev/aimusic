// The review URL affects presentation in this tab only. The server still owns room themes.
(() => {
  if (new URLSearchParams(location.search).get('themePreview') !== 'christmas-v61') return;
  if (window.Capacitor?.isNativePlatform?.()) return;

  const root = '/assets/themes/christmas-v61/';
  const landscape = matchMedia('(min-width: 801px) and (min-height: 480px) and (orientation: landscape)');
  const portrait = matchMedia('(orientation: portrait)');
  const enabled = () => authConfig?.admin === true;
  const widths = [256, 512, 768, 1024, 1254];
  const srcset = widths.map(w => root + 'assets/christmas-tree-card-' + w + '.webp ' + w + 'w').join(', ');
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  function picture(className) {
    return '<picture class="' + className + '"><source media="' + landscape.media + '" srcset="' + srcset +
      '" sizes="(min-width: 1900px) 300px, 220px"><img alt="" loading="lazy" decoding="async" src="' + blank + '"></picture>';
  }
  document.addEventListener('error', event => {
    const cover = event.target.closest?.('.af-review-cover,.af-review-shop-art');
    if (cover) (cover.closest('[data-christmas-shop]') || cover).remove();
  }, true);

  function bindRoom(host, signal) {
    if (!enabled()) return;
    let fx, generation = 0, skin, maskFrame = 0;
    const protectedNodes = host.querySelectorAll('.room-header,.voice-chat-panel,#voice-music-player,.talk-central,#live-current');
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
      if (!landscape.matches) {
        if (portrait.matches) host.dataset.themeAssetState = 'portrait-source-required';
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
    function end() { controls.abort(); clear(); }
    signal.addEventListener('abort', end, { once: true });
    host.addEventListener('aifect-theme-error', end, options);
    window.addEventListener('aifect:room-theme', event => {
      const room = event.detail?.room;
      if (room?.id !== host.dataset.voiceRoom) return;
      const next = room.theme_sku || room.background || room.theme?.sku;
      if (skin && next && skin !== next) end();
      if (next) skin = next;
    }, options);
    host.addEventListener('focusin', event => {
      if (fx?.w && event.target.matches('input,textarea,[contenteditable="true"]')) fx.setLayoutLock({width:fx.w, height:fx.h});
    }, options);
    host.addEventListener('focusout', () => fx?.setLayoutLock(null), options);
    window.addEventListener('aifect:topbar-layout', refreshMask, options);
    landscape.addEventListener('change', sync, options);
    portrait.addEventListener('change', () => { if (!landscape.matches) sync(); }, options);
    void sync();
  }
  globalThis.AifectChristmasReview = {
    bindRoom, landscape,
    roomArt: () => enabled() ? picture('af-review-cover') : '',
    shopCard: () => enabled() ? '<article class="shop-card" data-christmas-shop data-shop-category="themes" data-shop-name="크리스마스 테마"><div class="shop-card-select">' +
      picture('af-review-shop-art') + '<strong class="shop-card-name">크리스마스 테마</strong></div><small>운영자 미리보기</small></article>' : ''
  };
})();
