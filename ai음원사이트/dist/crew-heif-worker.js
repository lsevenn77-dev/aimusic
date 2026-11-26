import buildLibheif from './vendor/heif/libheif-1.23.7.js';

// This worker serves one photo and is terminated on completion or cancellation.
// Keep the preview below Safari's canvas area limit even for a 48 MP phone image.
const MAX_PIXELS = 64000000;
const MAX_PREVIEW_EDGE = 3200;
const invalid = 'HEIC/HEIF 사진을 해독할 수 없습니다. 손상된 파일이거나 지원하지 않는 압축 방식입니다. JPG로 저장해 다시 시도해 주세요.';

self.onmessage = async ({ data: file }) => {
  try {
    const codec = buildLibheif();
    const decoder = new codec.HeifDecoder();
    const images = decoder.decode(await file.arrayBuffer());
    const image = images.find(item => item.is_primary()) || images[0];
    if (!image) throw new Error(invalid);
    const w = image.get_width(), h = image.get_height();
    if (w <= 0 || h <= 0 || w * h > MAX_PIXELS) {
      throw new Error('HEIC 사진의 해상도가 너무 큽니다. 6,400만 화소 이하로 줄여 주세요.');
    }
    const decoded = await codec.heif_js_decode_image2(image.handle, codec.heif_colorspace_RGB, codec.heif_chroma_interleaved_RGBA);
    const plane = decoded?.channels?.find(item => item.id === codec.heif_channel_interleaved);
    if (!plane || plane.width !== w || plane.height !== h || plane.stride < w * 4 ||
        plane.data.length < (h - 1) * plane.stride + w * 4) throw new Error(invalid);

    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const row = Math.min(h - 1, Math.floor((y + .5) * h / height)) * plane.stride;
      if (width === w) {
        pixels.set(plane.data.subarray(row, row + w * 4), y * width * 4);
      } else {
        for (let x = 0; x < width; x++) {
          const at = row + Math.min(w - 1, Math.floor((x + .5) * w / width)) * 4;
          const to = (y * width + x) * 4;
          for (let c = 0; c < 4; c++) pixels[to + c] = plane.data[at + c];
        }
      }
    }
    self.postMessage({ pixels: pixels.buffer, width, height }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message?.startsWith('HEIC') ? error.message : invalid });
  }
};
