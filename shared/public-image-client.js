// The worker must know which image manifest belongs to this document before it serves an image.
(() => {
  const fallback = image => {
    if (!(image instanceof HTMLImageElement)) return;
    const origin = image.dataset.aifectImageOrigin;
    if (!origin?.startsWith('/assets/')) return;
    delete image.dataset.aifectImageOrigin;
    image.src = origin;
  };
  document.addEventListener('error', event => fallback(event.target), true);
  // An async script may arrive after a parser-discovered logo already failed to load.
  for (const element of document.querySelectorAll('img[data-aifect-image-origin]')) {
    if (element.complete && !element.naturalWidth) fallback(element);
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const {revision, enabled} = document.currentScript.dataset;
  const workers = navigator.serviceWorker;
  // An empty release still updates a previous worker so that rollbacks stop routing.
  if (enabled !== 'true' && !workers.controller) return;
  const announce = () => workers.controller?.postMessage({type: 'aifect-image-release', revision});
  workers.addEventListener('controllerchange', announce);
  workers.addEventListener('message', event => {
    if (event.source === workers.controller && event.data?.type === 'aifect-image-release-request') announce();
  });
  window.addEventListener('pageshow', announce);
  announce();
  workers.register('/public-image-worker.js', {updateViaCache: 'none'}).catch(() => {});
})();
