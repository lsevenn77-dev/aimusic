/** All coordinates are CSS pixels; never mix device pixels into scene geometry. */
export function coverTransform(sw, sh, width, height, position = [0.5, 0.5]) {
  for (const n of [sw, sh, width, height]) if (!Number.isFinite(n) || n <= 0) throw new RangeError('Image and container dimensions must be positive.');
  const scale = Math.max(width / sw, height / sh);
  const rw = sw * scale, rh = sh * scale;
  return { scale, x: (width - rw) * position[0], y: (height - rh) * position[1], width: rw, height: rh };
}
export const project = (p, g, sw, sh) => ({ x: g.x + p.x * sw * g.scale, y: g.y + p.y * sh * g.scale });
export const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const modulo = (x, n) => ((x % n) + n) % n;
export function chooseRaster(sources, required) {
  if (!sources?.length) throw new Error('No UI-free image source registered.');
  const sorted = [...sources].sort((a,b) => a.width - b.width);
  return sorted.find(s => s.width >= required) || sorted[sorted.length - 1];
}
export function canvasBudget(width, height, dpr, pixelLimit, dprLimit) {
  const ratio = Math.max(.35, Math.min(dpr || 1, dprLimit, Math.sqrt(pixelLimit / (width * height))));
  return { ratio, width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
export function referenceViewport(width, height) {
  // Preserve the v5 particle's visual scale relative to the short screen edge.
  // Large displays grow the scene, not the circle size without bound.
  const scale = Math.min(width / 940, height / 1672);
  const readableScale = Math.min(width / 940, height / 940, 1.15);
  return { scale: Math.max(scale, Math.min(readableScale, scale * 1.8)), width, height };
}
