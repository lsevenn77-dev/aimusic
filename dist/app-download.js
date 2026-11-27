(() => {
  // iPadOS can identify as a desktop Mac; real Macs have no multitouch screen.
  const isIPad = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  if (isIPad) {
    location.replace('https://apps.apple.com/kr/app/id6819654764');
    return;
  }
  document.getElementById('copy-download-link')?.addEventListener('click', async () => {
    const input = document.getElementById('download-url');
    const status = document.getElementById('download-status');
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = '링크를 복사했습니다. 휴대폰에 공유해 주세요.';
    } catch {
      input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
      status.textContent = '선택된 링크를 복사해 휴대폰에서 열어 주세요.';
    }
  });
})();
