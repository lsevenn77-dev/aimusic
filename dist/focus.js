// Native dialogs can match :focus-visible on controls autofocused after a pointer opens them.
(() => {
  const root = document.documentElement;
  window.addEventListener('pointerdown', () => {
    root.dataset.aifectInput = 'pointer';
  }, { capture: true, passive: true });
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
    root.dataset.aifectInput = 'keyboard';
  }, true);
})();
