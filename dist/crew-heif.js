// Load only after the browser's own decoders have rejected a HEIC/HEIF file.
export function decodeCrewHeif(file, { signal } = {}) {
  const cancelled = () => new DOMException('사진 편집을 취소했어요.', 'AbortError');
  if (signal?.aborted) return Promise.reject(cancelled());

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./crew-heif-worker.js', import.meta.url), { type: 'module' });
    function dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    }
    function fail(error) {
      dispose();
      reject(error);
    }
    const abort = () => fail(cancelled());
    const timer = setTimeout(() => fail(new Error('HEIC 변환 시간이 초과됐어요. 더 작은 사진이나 JPG 사진을 선택해주세요.')), 90000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => fail(new Error('HEIC 변환기를 실행할 수 없어요. 사진을 다시 선택하거나 JPG로 저장해 시도해주세요.'));
    worker.onmessageerror = worker.onerror;
    worker.onmessage = ({ data }) => {
      dispose();
      if (data.error) return reject(new Error(data.error));
      try {
        const source = document.createElement('canvas');
        source.width = data.width;
        source.height = data.height;
        const ctx = source.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height), 0, 0);
        resolve({ source, width: source.width, height: source.height, close() { source.width = source.height = 1; } });
      } catch {
        reject(new Error('HEIC 미리보기를 만들 메모리가 부족해요. 크기가 더 작은 사진을 선택해주세요.'));
      }
    };
    try { worker.postMessage(file); } catch (error) { fail(error); }
  });
}
