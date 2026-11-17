import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const deployed = readFileSync(new URL('./fixtures/render-state-deployed-20261117.js', import.meta.url), 'utf8');
const swift = readFileSync(new URL('../AIFECT/PlatformControls.swift', import.meta.url), 'utf8');
const bridge = swift.match(/static let gameRenderCompatibilityScript = """\n([\s\S]*?)\n\s*"""/)[1];

function boot({compatibility = true, tab = false, synchronous = false} = {}) {
  const timers = new Map(), handlers = new Map();
  let timerID = 0, replacements = 0, pending = [];
  const target = id => ({id, targeted: false, matches() { return this.targeted; }, removeAttribute() { this.id = ''; }});
  const marker = target(''), tabs = tab ? [target('crew-jump/preview')] : [];
  const root = {dataset: {}, toggleAttribute() {}}, main = {dataset: {route: 'crew-jump/preview'}, setAttribute() {}, removeAttribute() {}};
  const nodes = new Map([['main', main], ...['route-pending-message','route-pending-actions','route-retry'].map(id => [id, {}])]);
  const location = {hash: '#crew-jump/preview', pathname: '/', search: '', href: 'https://aifect.test/#crew-jump/preview', replace() {
    ++replacements;
    const apply = () => { marker.targeted = !tab; tabs.forEach(node => { node.targeted = true; }); };
    if (synchronous) apply(); else pending.push(apply);
  }};
  const context = vm.createContext({URLSearchParams, location, document: {
    documentElement: root, getElementById: id => nodes.get(id), querySelector: () => marker,
    querySelectorAll: selector => selector.includes('[data-render-target]') ? [marker, ...tabs] : tabs
  }, window: {addEventListener(name, fn) { handlers.set(name, fn); }}, setTimeout(fn, delay) { const id = ++timerID; timers.set(id, {fn, delay}); return id; }, clearTimeout(id) { timers.delete(id); }});
  vm.runInContext(deployed, context);
  if (compatibility) vm.runInContext(bridge, context);
  const api = context.window.AifectRender;
  return {api, root, main, location, handlers, context,
    start() { const epoch = api.begin('crew-jump/preview', '', () => {}); api.ready(epoch); return epoch; },
    commit() { pending.splice(0).forEach(fn => fn()); },
    tick(delay = 16) { for (const [id, task] of [...timers]) if (task.delay === delay) { timers.delete(id); task.fn(); } },
    get replacements() { return replacements; }, get timerCount() { return timers.size; }
  };
}

test('deployed gate reproduces a hidden game after native fragment completion', () => {
  const c = boot({compatibility: false}); c.start(); c.commit(); c.tick();
  assert.equal(c.root.dataset.renderState, 'loading'); assert.equal(c.main.inert, true);
});
for (const tab of [false, true]) test(`native bridge resumes only after active target (tab=${tab})`, () => {
  const c = boot({tab}); c.start(); c.tick(); c.tick();
  assert.equal(c.main.inert, true); assert.equal(c.replacements, 1);
  c.commit(); c.tick();
  assert.equal(c.root.dataset.renderState, 'ready'); assert.equal(c.main.inert, false); assert.equal(c.timerCount, 0);
});
test('immediate readiness is unchanged and installing twice does not wrap again', () => {
  const c = boot({synchronous: true}), ready = c.api.ready;
  vm.runInContext(bridge, c.context); assert.equal(c.api.ready, ready);
  c.start(); assert.equal(c.root.dataset.renderState, 'ready'); assert.equal(c.timerCount, 0);
});
test('navigation and a stale ready callback cannot expose the next route', () => {
  const c = boot(), stale = c.start();
  c.location.hash = '#home'; c.location.href = 'https://aifect.test/#home';
  c.api.begin('home', 'crew-jump/preview', () => {}); c.main.dataset.route = 'home';
  c.commit(); c.tick(); c.api.ready(stale);
  assert.equal(c.root.dataset.renderState, 'loading'); assert.equal(c.main.inert, true);
});
test('asset failure cannot be turned into a successful game screen', () => {
  const c = boot(); c.start();
  c.handlers.get('error')({target: {matches: () => true, getAttribute: () => '/aifect-app-1234567890abcdef.js'}});
  c.commit(); c.tick();
  assert.equal(c.root.dataset.renderState, 'error'); assert.equal(c.main.inert, true); assert.equal(c.timerCount, 0);
});
test('stale failure cannot cancel the current page readiness retry', () => {
  const c = boot(), stale = c.start();
  c.start(); c.api.fail(stale); c.commit(); c.tick();
  assert.equal(c.root.dataset.renderState, 'ready'); assert.equal(c.main.inert, false);
});
test('timeout and document teardown stop pending readiness', () => {
  const c = boot(); c.start(); c.tick(20000); c.commit(); c.tick();
  assert.equal(c.root.dataset.renderState, 'error'); assert.equal(c.timerCount, 0);
  const d = boot(); d.start(); d.handlers.get('pagehide')(); d.commit(); d.tick();
  assert.equal(d.root.dataset.renderState, 'loading');
});
