// Collapsing changes only the presentation, never the audio or playback queue.
(() => {
  const player = document.querySelector('.player');
  const toggle = document.querySelector('#player-collapse');
  if (!player || !toggle) return;
  const paint = collapsed => {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? '재생바 펼치기' : '재생바 접기';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  };
  toggle.addEventListener('click', () => paint(player.classList.toggle('is-collapsed')));
  // Keep the ad disclosure and any skip control visible throughout an audio ad.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const ad = player.classList.contains('audio-ad-active');
      toggle.disabled = ad;
      if (ad && player.classList.contains('is-collapsed')) { player.classList.remove('is-collapsed'); paint(false); }
    }).observe(player, {attributes:true, attributeFilter:['class']});
  }
})();
