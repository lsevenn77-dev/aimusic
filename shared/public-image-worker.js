import {mediaImageRequest, mediaImageResponse} from './media-image-response.js';
import {publicImageObject, publicImageResponse} from './public-image-response.js';

const config = __IMAGE_CONFIG__;
const clientsByRelease = new Map();

function remember(id, approved) {
  // Client IDs change on navigation. Bound lifetime and memory for long-running workers.
  if (clientsByRelease.size >= 256) clientsByRelease.delete(clientsByRelease.keys().next().value);
  clientsByRelease.set(id, approved);
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.source?.type === 'window' && event.data?.type === 'aifect-image-release') {
    remember(event.source.id, event.data.revision === __IMAGE_REVISION__);
  }
});

self.addEventListener('fetch', event => {
  const object = publicImageObject(event.request, self.location.origin, config.routes);
  const media = config.mediaMirror && mediaImageRequest(event.request, self.location.origin);
  if (!event.clientId || !(object || media)) return;
  if (!clientsByRelease.has(event.clientId)) {
    // The worker may have restarted since the document loaded. The first request uses the origin.
    remember(event.clientId, false);
    event.waitUntil(self.clients.get(event.clientId).then(client => client?.postMessage({type: 'aifect-image-release-request'})));
    return;
  }
  if (clientsByRelease.get(event.clientId)) {
    event.respondWith(media ? mediaImageResponse(event.request, config.mediaPullOrigin)
      : publicImageResponse(event.request, config.base, object));
  }
});
