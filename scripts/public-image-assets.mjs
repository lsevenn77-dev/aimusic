import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';

const imageDirectories = ['assets', 'crew-fishing', 'crew-jump-art', 'crew-racing', 'crew-rhythm'];
const imageSuffix = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

async function* walk(directory, prefix) {
  const entries = await readdir(directory, {withFileTypes: true});
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const url = prefix + '/' + encodeURIComponent(entry.name);
    if (entry.isDirectory()) yield* walk(path, url);
    else if (entry.isFile()) yield [url, path];
  }
}

export async function publicImageRoutes(verified, source = 'dist', client = 'dist/client', products = 'assets/products/bunnies-v1') {
  if (!/^Image(?:\/[a-zA-Z0-9_-]+)*$/.test(verified.directory) || !Array.isArray(verified.objects) ||
      !verified.objects.every(name => /^[a-f0-9]{64}\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(name))) {
    throw new Error('Invalid iwinv static image verification list');
  }
  const objects = new Set(verified.objects);
  const matches = new Map();
  // Walk the current build inputs. Incremental builds may leave removed images in dist/client.
  const roots = imageDirectories.map(name => [join(source, name), '/' + name]);
  roots.push([products, '/assets/products/bunnies-v1']);
  if (objects.size) for (const [directory, prefix] of roots) {
    for await (const [url] of walk(directory, prefix)) {
      const suffix = url.match(imageSuffix);
      if (!suffix) continue;
      const bytes = await readFile(join(client, decodeURIComponent(url)));
      const name = createHash('sha256').update(bytes).digest('hex') + suffix[0].toLowerCase();
      if (objects.has(name)) matches.set(url, name);
    }
  }
  return Object.fromEntries([...matches].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

// Accept only version queries that this release actually references on an approved public path.
export function addVersionedRoutes(routes, source) {
  for (const match of source.matchAll(/(\/assets\/[\w.\/-]+)\?v=([\w-]+)(?=["'`\s)])/g)) {
    if (Object.hasOwn(routes, match[1])) routes[match[0]] = routes[match[1]];
  }
}

// A few authored shell images are requested by the HTML parser before a new worker can take control.
// Limit direct URLs to verified site-owned branding and banners. Pages retain an origin fallback.
export function directShellImages(html, base, routes) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    if (/\s(?:srcset|crossorigin|referrerpolicy|data-aifect-image-origin)\s*=/i.test(tag)) return tag;
    const source = tag.match(/\ssrc="(\/assets\/(?:aifect-(?:wordmark|symbol)\.svg|play-banners\/[\w./-]+\.webp)(?:\?v=[\w-]+)?)"/);
    if (!source || !Object.hasOwn(routes, source[1])) return tag;
    return tag.replace(source[0], ' src="' + base + routes[source[1]] + '" data-aifect-image-origin="' +
      source[1] + '" referrerpolicy="no-referrer" crossorigin="anonymous"');
  });
}

export async function buildPublicImageAssets(html) {
  const verified = JSON.parse(await readFile('ops/iwinv/static-images.json', 'utf8'));
  const routes = await publicImageRoutes(verified);
  addVersionedRoutes(routes, html + await readFile('dist/admin.html', 'utf8') + await readFile('dist/icons.js', 'utf8'));
  const ids = JSON.parse(await readFile('server/data/iwinv-image-mirror.json', 'utf8'));
  const mediaPullOrigin = verified.mediaPullOrigin || '';
  if (mediaPullOrigin && !/^https:\/\/lseven7\.ext[1-5]\.cache\.iwinv\.net$/.test(mediaPullOrigin)) {
    throw new Error('Unexpected iwinv pull origin');
  }
  const mediaMirror = verified.mediaMirror === true || Boolean(ids.length || mediaPullOrigin);
  const base = 'https://lseven7.cache.iwinv.net/' + verified.directory + '/';
  const config = {base, routes, mediaMirror, mediaPullOrigin};
  const connectSources = [new URL(base).origin, mediaPullOrigin].filter(Boolean).join(' ');
  await writeFile('dist/client/_headers', [
    '/assets/products/bunnies-v1/*', '  Cache-Control: public, max-age=31536000, immutable',
    '/public-image-worker.js', '  Cache-Control: no-cache',
    "  Content-Security-Policy: default-src 'none'; connect-src 'self' " + connectSources, ''
  ].join('\n'));
  const revision = createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 24);
  await build({
    entryPoints: ['shared/public-image-worker.js'],
    outfile: 'dist/client/public-image-worker.js',
    bundle: true, format: 'iife', target: 'es2022',
    define: {__IMAGE_CONFIG__: JSON.stringify(config), __IMAGE_REVISION__: JSON.stringify(revision)}
  });
  const enabled = mediaMirror || Object.keys(routes).length > 0;
  const tag = '<script async src="/public-image-client.js" data-revision="' + revision + '" data-enabled="' + enabled + '"></script>';
  const addClient = page => page.replace(/<head(?:\s[^>]*)?>/i, head => head + tag);
  for (const page of ['admin/dashboard.html', 'crew-fishing/index.html', 'crew-fishing/design.html',
                       'crew-racing/index.html', 'crew-rhythm/index.html']) {
    const file = join('dist/client', page);
    await writeFile(file, addClient(await readFile(file, 'utf8')));
  }
  return addClient(directShellImages(html, base, routes));
}
