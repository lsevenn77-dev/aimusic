const rasterTypes = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/avif']);
const pushUrl = /^https:\/\/lseven7\.cache\.iwinv\.net\/Image\/[a-f0-9]{64}\.bin$/;
const pullPath = /^\/mirror\/v1\/[A-Za-z0-9_-]{39,750}\/[a-f0-9]{64}\.bin$/;
const mediaPath = /^\/media\/(?:[\w-]+\/cover|playlist\/[\w-]+\/image|(?:artist|producer|banner|artist-banner|artist-gallery|profile-gallery|crew|crew-chat|crew-notice|dm)\/[\w-]+)$/;
const maxCipherBytes = 16 * 1024 * 1024 + 28;

export function mediaImageRequest(request, origin) {
  if (request.method !== 'GET' || request.destination !== 'image' || request.headers.has('range')) return false;
  const url = new URL(request.url);
  return url.origin === origin && mediaPath.test(url.pathname);
}

function validGrant(grant, pullOrigin) {
  if (!grant || typeof grant.url !== 'string' || typeof grant.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(grant.key) || !rasterTypes.has(grant.type)) return false;
  if (pushUrl.test(grant.url)) return true;
  if (!pullOrigin || !grant.url.startsWith(pullOrigin + '/')) return false;
  return pullPath.test(grant.url.slice(pullOrigin.length));
}

async function decryptImage(grant, pullOrigin, signal, fetcher) {
  if (!validGrant(grant, pullOrigin)) throw new Error('Invalid image grant');
  const encrypted = await fetcher(grant.url, {
    credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', redirect: 'error', signal
  });
  if (encrypted.status !== 200 || Number(encrypted.headers.get('content-length')) > maxCipherBytes) {
    throw new Error('Unavailable image ciphertext');
  }
  const ciphertext = new Uint8Array(await encrypted.arrayBuffer());
  if (ciphertext.length <= 28 || ciphertext.length > maxCipherBytes) throw new Error('Invalid ciphertext size');
  const raw = Uint8Array.from(atob(grant.key.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const image = await crypto.subtle.decrypt({name: 'AES-GCM', iv: ciphertext.subarray(0, 12)}, key, ciphertext.subarray(12));
  return new Response(image, {headers: {
    'content-type': grant.type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'
  }});
}

export async function mediaImageResponse(request, pullOrigin, fetcher = fetch) {
  // Construct the grant request from the original to retain credentials mode, URL/version and auth.
  const headers = new Headers(request.headers);
  headers.set('X-Aifect-Image-Mirror', '1');
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  let timeout;
  try {
    const authorized = await fetcher(request, {mode: 'same-origin', cache: 'no-store', redirect: 'error', headers});
    // In particular, never try a previous grant or the CDN after an authorization error.
    if (authorized.status < 500 && (authorized.status !== 200 ||
        authorized.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json')) return authorized;
    if (authorized.status === 200) {
      const grant = await authorized.json();
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);
      return await decryptImage(grant, pullOrigin, controller.signal, fetcher);
    }
  } catch {
    // Missing or invalid ciphertext, unsupported crypto, and transport errors use the normal authorized route.
  } finally {
    clearTimeout(timeout);
  }
  return fetcher(request, {cache: 'no-store'});
}
