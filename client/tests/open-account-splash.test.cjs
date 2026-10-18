'use strict';
// Opening another account while Brana is already running must not flash an empty window: the startup splash is
// reused and the main window stays hidden until the UI reports host:ready (or the existing fallbacks fire).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const code = main.slice(main.indexOf('async function openAccount(id, opt = {}) {'), main.indexOf('// Navigation failures are handled at their source'));
class Emitter { constructor() { this.h = new Map(); } on(n, f) { (this.h.get(n) || this.h.set(n, []).get(n)).push(f); return this; } once(n, f) { const g = (...a) => { this.off(n, g); f(...a); }; return this.on(n, g); } off(n, f) { this.h.set(n, (this.h.get(n) || []).filter(x => x !== f)); } emit(n, ...a) { for (const f of [...(this.h.get(n) || [])]) f(...a); } removeListener(n, f) { this.off(n, f); } }
function env() {
  const timers = [], log = [];
  const e = { console, Promise, Date, JSON, Set, Map, String, Number, URL, Error, Object, Array, RegExp, Boolean, Math, APP_TITLE: require('../src/extension-test-identity').TITLE,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    acct: id => id === 'a' ? e.account : null, account: { id: 'a', email: 'a@example.test', name: '账号', proxy: '', fp: { seed: 1 } }, wins: new Map(), DB: { open: [], last: '' }, saveDB: () => {}, shownIds: () => [],
    pub: a => ({ id: a.id }), prepSession: () => e.session, session: { __routeBlocked: false }, ICON: 'icon', themeBg: () => '#111', themeOverlay: () => ({}), partOf: id => 'persist:acct-' + id, path: { join: (...p) => p.join('/') }, __dirname: '/app', process: { platform: 'win32', env: {} },
    keepRound: () => {}, keepViewport: () => {}, createFailureOwner: () => ({ begin: () => 1, end() {}, redirect() {}, started() {}, event: f => f, rejected: (_, err) => ({ url: '', code: err.code, desc: err.message }) }), createRetryTarget: url => ({ remember() {}, get: () => url }),
    UI_URL: 'https://arena.ai/robots.txt', OFFLINE: '/app/offline.html', safeNavigationURL: u => u, runtimeLog: (k, v) => log.push(v?.code ? k + ':' + v.code : k), RouteState: { locked: () => false }, extAuth: () => false, extFail: () => {},
    extensionStore: { ready: async () => {} }, applyProxy: async () => e.session, loadURLAlive: async wc => { wc.url = 'https://arena.ai/robots.txt'; wc.emit('dom-ready'); }, proxyStr: () => '', isDirect: () => true,
    BUNDLE: '/*bundle*/', WEBBAR: '', WEBBAR_PAD: 0, barTheme: () => ({}), quitting: false, mgr: null, destroyWindow: () => {}, releaseWindow: () => {},
    splash: null, splashCalls: [], showSplash: () => { if (!e.splash) { e.splash = { isDestroyed: () => false }; e.splashCalls.push('show'); } }, splashText: t => e.splashCalls.push('text:' + t), closeSplash: () => { e.splashCalls.push('close'); e.splash = null; },
    timers, log,
  };
  e.BrowserWindow = class extends Emitter {
    constructor(opts) { super(); this.opts = opts; this.shown = false; this.destroyed = false; const wc = this.webContents = new Emitter(); wc.id = 7; wc.url = ''; wc.session = e.session; wc.getURL = () => wc.url; wc.isDestroyed = () => false; wc.executeJavaScript = async () => {}; wc.insertCSS = async () => {}; wc.setWindowOpenHandler = () => {}; wc.loadFile = async () => {}; wc.debugger = { isAttached: () => false }; }
    show() { this.shown = true; } isDestroyed() { return this.destroyed; } isMinimized() { return false; } focus() {} restore() {}
  };
  vm.createContext(e); vm.runInContext(code + '\nthis.openAccount = openAccount;', e); return e;
}
const settle = () => new Promise(r => setImmediate(r));
test('a visible window opened while running gets the connecting splash and stays hidden until host:ready', async () => {
  const e = env(); assert.equal(e.splash, null, 'no startup splash: app already running');
  await e.openAccount('a'); await settle(); await settle();
  const w = e.wins.get('a'); assert.ok(w); assert.equal(w.opts.show, false);
  assert.deepEqual(e.splashCalls.slice(0, 2), ['show', 'text:连接 arena.ai（直连）…']);
  w.emit('ready-to-show'); assert.equal(w.shown, false, 'ready-to-show alone no longer reveals an empty window');
  assert.ok(!e.timers.some(t => t.ms === 4000), 'the 4 s blind reveal is not armed'); assert.ok(e.timers.some(t => t.ms === 20000), 'startup-style 20 s safety reveal is armed');
  w.__reveal(); assert.equal(w.shown, true); assert.equal(e.splashCalls.at(-1), 'close'); assert.equal(e.splash, null);
});
test('background (hidden) windows never create a splash', async () => {
  const e = env(); await e.openAccount('a', { hidden: true }); await settle();
  assert.deepEqual(e.splashCalls, []); assert.equal(e.wins.get('a').__hidden, true);
});
test('an already open account is focused without a new splash', async () => {
  const e = env(); await e.openAccount('a'); await settle(); const first = e.wins.get('a'); e.splashCalls.length = 0; e.splash = null;
  await e.openAccount('a'); assert.equal(e.wins.get('a'), first); assert.deepEqual(e.splashCalls, []);
});
test('a stage that takes too long is recorded with its name, and a normal load leaves no trace', async () => {
  const e = env(); let release; e.applyProxy = () => new Promise(r => { release = r; });
  await e.openAccount('a'); await settle();
  const slow = e.timers.find(t => t.ms === 20000 && String(t.fn).includes('navigation-slow')) || e.timers.find(t => t.ms === 20000);
  assert.ok(slow); slow.fn(); assert.deepEqual(e.log.filter(k => k.startsWith('navigation-slow')), ['navigation-slow:route'], 'names the stage that is still pending');
  release(e.session); await settle(); await settle();
  const quick = env(); await quick.openAccount('a'); await settle(); await settle();
  assert.ok(!quick.log.some(k => k.startsWith('navigation-slow')));
});

test('extension test account windows are clearly labeled as the independent test build',async()=>{const e=env();await e.openAccount('a');await settle();assert.ok(e.wins.get('a').opts.title.startsWith(require('../src/extension-test-identity').TITLE));});
