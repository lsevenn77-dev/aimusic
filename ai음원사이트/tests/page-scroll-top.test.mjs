import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../dist/scroll-top.js', import.meta.url), 'utf8');

function fixture({reducedMotion = false, pageTop = 0} = {}) {
  const frames = new Map(), resizes = [], mutations = [], windowEvents = new Map(), documentEvents = new Map();
  let serial = 0;
  const listen = (events, name, callback) => {
    const listeners = events.get(name) || new Set();
    listeners.add(callback); events.set(name, listeners);
  };
  const dispatch = (events, name, event = {}) => {
    for (const callback of events.get(name) || []) callback(event);
  };
  class Element {
    constructor(selector = '', box = {}) {
      this.selectors = new Set([selector]);
      this.id = selector.startsWith('#') ? selector.slice(1) : '';
      this.attributes = new Map(); this.events = new Map(); this.children = [];
      this.style = {}; this.css = {}; this.dataset = {}; this.parentElement = null;
      this.hidden = false; this.isConnected = true;
      this.clientHeight = 550; this.scrollHeight = 2200; this.scrollTop = 0; this.scrolls = [];
      this.box = {left:300, right:1380, top:200, bottom:750, ...box};
    }
    matches(selector) { return selector.split(',').some(value => this.selectors.has(value.trim())); }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    hasAttribute(name) { return this.attributes.has(name); }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector === '[data-room-focus]' ? node.hasAttribute('data-room-focus') : node.matches(selector)) return node;
      }
      return null;
    }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelectorAll(selector) { return this.descendants().filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
      const box = {...this.box};
      return {...box, width:box.right - box.left, height:box.bottom - box.top};
    }
    addEventListener(name, callback) { listen(this.events, name, callback); }
    scrollTo(options) { this.scrolls.push({...options}); this.scrollTop = options.top; }
  }
  const page = new Element('html', {left:0, top:0, right:1440, bottom:900});
  page.clientHeight = 900; page.clientWidth = 1440; page.scrollHeight = 3000; page.scrollTop = pageTop;
  const body = new Element('body'), main = new Element('#main', {left:248, right:1440, top:88, bottom:2400});
  main.css.paddingRight = '48px'; body.append(main);
  const document = {
    body, documentElement:page, scrollingElement:page,
    querySelector:selector => main.matches(selector) ? main : body.querySelector(selector),
    querySelectorAll:selector => body.querySelectorAll(selector),
    getElementById:id => body.descendants().find(element => element.id === id) || null,
    createElement:() => new Element(),
    addEventListener:(name, callback) => listen(documentEvents, name, callback)
  };
  const window = {
    scrolls:[],
    addEventListener:(name, callback) => listen(windowEvents, name, callback),
    scrollTo(options) { this.scrolls.push({...options}); page.scrollTop = options.top; }
  };
  const observer = records => class {
    constructor(callback) { this.callback = callback; this.elements = new Map(); records.push(this); }
    observe(element, options = {}) { this.elements.set(element, options); }
    unobserve(element) { this.elements.delete(element); }
  };
  const context = vm.createContext({
    document, window, innerHeight:900, innerWidth:1440,
    requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
    getComputedStyle:element => ({display:'block', visibility:'visible', paddingRight:'0px', ...element.css}),
    matchMedia:() => ({matches:reducedMotion}),
    ResizeObserver:observer(resizes), MutationObserver:observer(mutations)
  });
  const flush = () => {
    let count = 0;
    while (frames.size) {
      assert.ok(++count < 20, 'layout must settle without a frame loop');
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback());
    }
  };
  const notify = (records, element) => {
    for (const record of records) if ([...record.elements].some(([target, options]) => target === element || options.subtree && target.contains(element))) record.callback([]);
    flush();
  };
  const run = () => { vm.runInContext(source, context); flush(); };
  run();
  return {
    page, main, body, document, window, run, flush, windowEvents, documentEvents, resizes, mutations,
    button:document.getElementById('page-scroll-top'),
    addPane(selector) { const pane = new Element(selector); main.append(pane); notify(mutations, main); return pane; },
    addOverlay(selector, box, hidden = false) { const overlay = new Element(selector, box); overlay.hidden = hidden; body.append(overlay); dispatch(windowEvents, 'resize'); flush(); return overlay; },
    scroll(element, top) { element.scrollTop = top; dispatch(documentEvents, 'scroll', {target:element === page ? document : element}); flush(); },
    click() { dispatch(document.getElementById('page-scroll-top').events, 'click'); flush(); },
    mutate:element => notify(mutations, element),
    resize:element => notify(resizes, element),
    navigate() { dispatch(windowEvents, 'hashchange'); flush(); }
  };
}

test('the shared page action appears at a useful depth and disappears when content becomes short', () => {
  const f = fixture();
  assert.equal(f.button.textContent, '▲UP');
  assert.equal(f.button.attributes.get('aria-label'), '맨 위로');
  assert.equal(f.button.hidden, true);
  f.scroll(f.page, 499); assert.equal(f.button.hidden, true);
  f.scroll(f.page, 500); assert.equal(f.button.hidden, false);
  f.page.scrollHeight = f.page.clientHeight;
  f.mutate(f.main);
  assert.equal(f.button.hidden, true, 'a shorter replacement page must not retain the previous control');
  f.page.scrollHeight = 3000; f.page.scrollTop = 1200;
  f.resize(f.main);
  assert.equal(f.button.hidden, false, 'restored/deferred content can show the action without another user scroll');
});

test('page clicks return to zero and respect the reduced-motion preference', () => {
  for (const reducedMotion of [false, true]) {
    const f = fixture({reducedMotion, pageTop:1200});
    f.click();
    assert.deepEqual(f.window.scrolls, [{top:0, behavior:reducedMotion ? 'instant' : 'smooth'}]);
    assert.equal(f.page.scrollTop, 0);
    assert.equal(f.button.hidden, true);
  }
});

test('live browsing, conversation lists and notice reading scroll their own pane without moving the document', () => {
  for (const selector of ['.live-directory .talk-scroll', '#dm-conversations', '#welcome-guide-scroll']) {
    const f = fixture(), pane = f.addPane(selector);
    f.scroll(pane, 700);
    assert.equal(f.button.hidden, false, selector);
    f.click();
    assert.deepEqual(pane.scrolls, [{top:0, behavior:'smooth'}]);
    assert.equal(f.window.scrolls.length, 0);
    assert.equal(f.page.scrollTop, 0);
    assert.equal(f.button.hidden, true);
  }
});

test('scroll ownership follows the active pane and route changes never move a detached old list', () => {
  const f = fixture({pageTop:900}), pane = f.addPane('.live-directory .talk-scroll');
  f.scroll(pane, 700); f.click();
  assert.equal(pane.scrolls.length, 1); assert.equal(f.window.scrolls.length, 0);
  f.scroll(pane, 700); f.scroll(f.page, 950); f.click();
  assert.equal(f.window.scrolls.length, 1, 'scrolling the document retakes ownership');
  f.scroll(pane, 700);
  pane.isConnected = false; f.main.children = []; f.page.scrollTop = 0;
  f.mutate(f.main); f.navigate(); f.click();
  assert.equal(f.button.hidden, true);
  assert.equal(pane.scrolls.length, 1);
  assert.equal(f.window.scrolls.length, 1);
});

test('the action clears visible player panels and responds when their size or visibility changes', () => {
  const f = fixture({pageTop:900});
  const player = f.addOverlay('.player', {left:248, right:1440, top:800, bottom:900});
  assert.match(f.button.style.bottom, /^max\(112px,/);
  const extension = f.addOverlay('#player-extension', {left:248, right:1440, top:620, bottom:800}, true);
  assert.match(f.button.style.bottom, /^max\(112px,/);
  extension.hidden = false; f.mutate(extension);
  assert.match(f.button.style.bottom, /^max\(292px,/);
  extension.css.visibility = 'hidden'; f.mutate(extension);
  assert.match(f.button.style.bottom, /^max\(112px,/);
  player.box.top = 770; f.resize(player);
  assert.match(f.button.style.bottom, /^max\(142px,/);
  f.addOverlay('#player-lyric', {left:0, right:100, top:200, bottom:700});
  assert.match(f.button.style.bottom, /^max\(142px,/, 'unrelated horizontal panes must not displace the control');
  extension.css.visibility = 'visible'; extension.box.top = 10; f.resize(extension);
  assert.equal(f.button.hidden, true, 'hide instead of positioning the action above the viewport');
});

test('room and recording workspaces suppress page actions and restore them after navigation', () => {
  const f = fixture({pageTop:900});
  f.main.setAttribute('data-room-focus', 'voice'); f.mutate(f.main);
  assert.equal(f.button.hidden, true);
  f.main.attributes.delete('data-room-focus'); f.body.setAttribute('data-room-focus', 'voice'); f.mutate(f.body);
  assert.equal(f.button.hidden, true);
  f.body.attributes.delete('data-room-focus'); f.mutate(f.body);
  assert.equal(f.button.hidden, false);
  const editor = f.addPane('#sing.web-studio');
  assert.equal(f.button.hidden, true);
  editor.isConnected = false; f.main.children = []; f.mutate(f.main); f.navigate();
  assert.equal(f.button.hidden, false);
});

test('executing the shared entry again keeps one button and one set of observers/listeners', () => {
  const f = fixture({pageTop:900});
  const before = [f.resizes.length, f.mutations.length, f.windowEvents.get('resize').size, f.documentEvents.get('scroll').size];
  f.run();
  assert.equal(f.body.descendants().filter(element => element.id === 'page-scroll-top').length, 1);
  assert.deepEqual([f.resizes.length, f.mutations.length, f.windowEvents.get('resize').size, f.documentEvents.get('scroll').size], before);
  f.click();
  assert.equal(f.window.scrolls.length, 1);
});

test('a fixed mobile message pane stays usable when its main wrapper has no height', () => {
  const f = fixture(), workspace = f.addPane('.message-workspace'), pane = f.addPane('#dm-conversations');
  f.main.children = [workspace]; workspace.append(pane);
  f.main.box.bottom = f.main.box.top;
  f.mutate(f.main); f.scroll(pane, 700);
  assert.equal(f.button.hidden, false);
  assert.equal(f.button.dataset.scrollPane, 'messages');
  f.click();
  assert.equal(pane.scrollTop, 0);
  assert.equal(f.window.scrolls.length, 0);
});
