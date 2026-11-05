const types = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml'
};

export function publicImageObject(request, origin, routes) {
  if (request.method !== 'GET' || request.destination !== 'image' ||
      request.headers.has('range') || request.headers.has('authorization')) return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  const route = url.pathname + url.search;
  return Object.hasOwn(routes, route) ? routes[route] : null;
}

export async function publicImageResponse(request, base, object, fetcher = fetch) {
  const [hash, suffix] = object.split('.');
  const digest = btoa(String.fromCharCode(...hash.match(/../g).map(byte => parseInt(byte, 16))));
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 3500);
  try {
    const response = await fetcher(base + object, {
      mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      integrity: 'sha256-' + digest, signal: timeout.signal
    });
    const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (response.status === 200 && type === types[suffix]) {
      // A new same-origin response preserves CSS masks, relative SVG refs and canvas pixel reads.
      return new Response(response.body, {headers: {'Content-Type': type, 'X-Content-Type-Options': 'nosniff'}});
    }
  } catch {
    // Includes digest mismatches, DNS/CORS errors, timeouts and removed CDN objects.
  } finally {
    clearTimeout(timer);
  }
  return fetcher(request);
}
