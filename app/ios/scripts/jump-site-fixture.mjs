// Full, authenticated site bootstrap for the iOS Jump entry regression test.
// Usage: node jump-site-fixture.mjs /absolute/path/to/the/web/checkout
// All sessions/data are disposable SQLite fixtures; mutations are blocked.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

if (!process.argv[2]) throw new Error('Pass the web checkout containing built dist/client assets.');
const checkout = path.resolve(process.argv[2]);
const load = relative => import(pathToFileURL(path.join(checkout, relative)).href);
const [{default: worker}, {fixture}, {seasonTime}] = await Promise.all([
  load('server/index.js'), load('tests/fixture.mjs'), load('server/crew-jump.js')
]);
const db = await fixture({after() {}});
db.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('preview','owner','별빛 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('preview','owner','leader',0)");
const origin = 'http://127.0.0.1:4188';
const assets = path.join(checkout, 'dist/client');
// Optional exact render gate extracted from the public production HTML. This
// reproduces deployed shell timing while keeping account/game data local.
const gateFile = process.argv[3];
const renderGate = gateFile ? await fs.readFile(path.resolve(gateFile), 'utf8') : null;
if (renderGate && !renderGate.includes('window.AifectRender=')) throw new Error('Expected an AIFECT render gate');
const env = {DB: db.DB, CREW_JUMP_START_MONDAY: seasonTime(Date.now(), {}).week};
const mime = {'.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.html':'text/html', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2'};
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== '127.0.0.1:4188' || (req.headers.origin && req.headers.origin !== origin)) {
      res.writeHead(403).end(); return;
    }
    if (req.method !== 'GET') { res.writeHead(405).end('Fixture blocks writes'); return; }
    const url = new URL(req.url, origin);
    if (url.pathname === '/preview') {
      res.writeHead(302, {'set-cookie':'aifect_session=owner; HttpOnly; SameSite=Strict; Path=/', location:'/#crew-jump/preview'}).end(); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const response = await worker.fetch(new Request(url, {headers:req.headers}), env, {waitUntil(p) {p.catch(() => {});}});
      res.writeHead(response.status, Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer())); return;
    }
    const file = path.resolve(assets, '.' + (url.pathname === '/' ? '/aifect-shell.txt' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(assets + path.sep)) { res.writeHead(403).end(); return; }
    let data = await fs.readFile(file);
    if (url.pathname === '/' && renderGate) {
      let count = 0;
      const html = data.toString().replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, script => {
        if (!script.includes('window.AifectRender=')) return script;
        ++count; return '<script>' + renderGate + '</script>';
      });
      if (count !== 1) throw new Error('Expected one inline render gate');
      data = Buffer.from(html);
    }
    res.writeHead(200, {'content-type':url.pathname === '/' ? 'text/html; charset=utf-8' : mime[path.extname(file)] || 'application/octet-stream'}).end(data);
  } catch { res.writeHead(404).end(); }
});
server.listen(4188, '127.0.0.1', () => console.log(origin + '/preview'));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close(() => {db.sql.close(); process.exit(0);}));
