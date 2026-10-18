'use strict';
// Browser-mode login persistence + "signed in to GitHub" badge: wiring between main.js, the picker and the card.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const main = read('src/main.js'), picker = read('ui/account-picker.js'), accounts = read('ui/accounts.js'), view = read('ui/view.js'), css = read('ui/app.css');
const slice = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); };
const tick = () => new Promise(r => setTimeout(r, 0));
function fakeH() {
  const h = (tag, attrs = {}, ...kids) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs || {}).filter(([, v]) => v != null && v !== false)), kids: kids.flat().filter(k => k != null && k !== false) });
  return { h, icon: n => ({ tag: 'svg', icon: n }) };
}
function pickerEnv() {
  const env = { now: () => 1000, fmtClock: () => '12:30', emailUser: a => a?.email?.split('@')[0] || a?.name || '账号', ...fakeH() };
  vm.createContext(env); vm.runInContext(picker + '\nthis.picker=AccountPicker;', env); return env.picker;
}
test('picker renders one badge per signed-in site and nothing when the account record has no site state', () => {
  const p = pickerEnv();
  assert.equal(p.siteBadges({ id: 'a' }), null); assert.equal(p.siteBadges({ sites: null }), null); assert.equal(p.siteBadges({ sites: { github: false } }), null);
  assert.equal(p.siteBadges({ sites: 'github' }), null, 'only the main-process shape counts');
  const badge = p.siteBadges({ sites: { github: true, unknownSite: true } });
  assert.equal(badge.attrs.class, 'acct-sites'); assert.equal(badge.kids.length, 1, 'unknown sites are ignored');
  assert.equal(badge.kids[0].attrs.class, 'site-ic'); assert.equal(badge.kids[0].attrs.title, '此账号已登录 GitHub'); assert.equal(badge.kids[0].attrs['aria-label'], '已登录 GitHub'); assert.equal(badge.kids[0].attrs.role, 'img');
  assert.equal(badge.kids[0].kids[0].icon, 'github');
  assert.equal(p.sites({ sites: { github: 'yes' } }).length, 0, 'strings never count as signed in');
});
test('card wiring: badge sits in the heading, the picker re-renders when the GitHub state flips, icon and styles exist', () => {
  assert.match(accounts, /AccountPicker\.editButton\(a, onrename\), AccountPicker\.siteBadges\(a\), h\('span', \{ class: 'acct-card-tags'/);
  assert.equal(picker.split('a.status?.loc, a.region, a.sites?.github]').length - 1, 2, 'both sides of the change signature');
  assert.match(view, /^ICON\.github = '<path fill="currentColor" stroke="none" d="M12 \.297c-6\.63 0-12 5\.373-12 12/m);
  assert.match(css, /\.acct-heading \.acct-sites\{display:inline-flex;align-items:center;gap:3px;flex:none\}/); assert.match(css, /\.acct-sites \.site-ic \.ic\{width:14px;height:14px\}/);
  assert.match(main, /xray: !!xrayBin\(\), sites: SiteLogins\.publish\(a\.sites\) \};/, 'public account objects carry the site state');
});
function mainEnv(code, extra) { const env = { console, Date, Promise, setTimeout, clearTimeout, ipcMain: { handle: (name, fn) => { env.handlers = env.handlers || {}; env.handlers[name] = fn; } }, ...extra }; vm.createContext(env); vm.runInContext(code, env); return env; }
test('host:logout removes only Arena cookies, flushes the store and keeps GitHub signed in', async () => {
  const jar = [
    { name: 'arena-auth-prod-v1', domain: 'arena.ai', path: '/', secure: true }, { name: 'arena-auth-prod-v1.0', domain: '.arena.ai', path: '/', secure: true },
    { name: 'sid', domain: 'auth.arena.ai', path: '/login', secure: false }, { name: 'user_session', domain: '.github.com', path: '/', secure: true },
    { name: 'logged_in', domain: 'github.com', path: '/', secure: true }, { name: 'SID', domain: '.google.com', path: '/', secure: true }, { name: 'x', domain: 'notarena.ai', path: '/', secure: true },
  ];
  const removed = [], ses = { flushes: 0, cookies: { get: async f => { assert.equal(Object.keys(f).length, 0, 'whole jar is listed, filtered by domain here'); return jar; }, remove: async (url, name) => { removed.push(url + ' ' + name); if (name === 'sid') throw Error('already gone'); }, flushStore: async () => { ses.flushes++; } }, clearStorageData: () => { throw Error('must not wipe the whole partition'); } };
  const account = { id: 'a', status: { loggedIn: true } }, saved = [];
  const env = mainEnv(slice(main, "ipcMain.handle('host:logout'", "ipcMain.handle('host:setTitle'"), { winAcct: () => account, session: { fromPartition: p => { assert.equal(p, 'persist:acct-a'); return ses; } }, partOf: id => 'persist:acct-' + id, saveDB: () => saved.push(1), navigateAccount: () => Promise.resolve() });
  assert.equal(await env.handlers['host:logout']({ sender: {} }), true);
  assert.deepEqual(removed, ['https://arena.ai/ arena-auth-prod-v1', 'https://arena.ai/ arena-auth-prod-v1.0', 'http://auth.arena.ai/login sid']);
  assert.equal(ses.flushes, 1); assert.equal(account.noAuto, true); assert.equal(account.status.loggedIn, false); assert.equal(saved.length, 1);
  const none = mainEnv(slice(main, "ipcMain.handle('host:logout'", "ipcMain.handle('host:setTitle'"), { winAcct: () => null, session: {}, partOf: () => '', saveDB: () => {}, navigateAccount: () => {} });
  assert.equal(await none.handlers['host:logout']({ sender: {} }), false);
});
test('preparing an account partition starts cookie persistence and site detection exactly once', () => {
  const calls = [], ses = { webRequest: { onBeforeRequest() {}, onHeadersReceived() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
  const env = mainEnv(slice(main, 'function prepSession(a) {', '\n}\n') + '\n}\nthis.prepSession = prepSession;', { session: { fromPartition: () => ses }, partOf: id => 'persist:acct-' + id, applyFp: () => {}, cookiePersistence: { watch: s => calls.push(['cookies', s === ses]) }, siteLogins: { watch: (id, s) => calls.push(['sites', id, s === ses]) } });
  assert.equal(env.prepSession({ id: 'a' }), ses); assert.equal(env.prepSession({ id: 'a' }), ses);
  assert.deepEqual(calls, [['cookies', true], ['sites', 'a', true]]);
  assert.match(main, /destroyWindow\(wins\.get\(id\)\); stopTunnel\(id\); siteLogins\.forget\(id\);/, 'removing an account stops its watcher');
});
test('quit paths flush every watched partition before the process goes away', async () => {
  const code = slice(main, 'let storageClosing=false', 'const extensionStore =');
  const log = [], app = { quits: 0, on: (name, fn) => { assert.equal(name, 'before-quit'); app.fn = fn; }, quit: () => app.quits++ };
  mainEnv(code, { app, extensionStorage: { close: async () => log.push('ext') }, cookiePersistence: { flushAll: async () => { log.push('cookies'); return { flushed: 2 }; } }, runtimeLog: () => log.push('log') });
  let prevented = 0; const event = { preventDefault: () => prevented++ };
  app.fn(event); app.fn(event); await tick(); await tick();
  assert.deepEqual(log.sort(), ['cookies', 'ext']); assert.equal(prevented, 2); assert.equal(app.quits, 1);
  app.fn(event); assert.equal(prevented, 2, 'second pass after the flush lets Electron quit');
  const exits = main.split('await cookiePersistence.flushAll().catch(() => {}); for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); app.exit(0);').length - 1;
  assert.equal(exits, 2, 'both update-install exits flush first'); assert.equal(main.split('app.exit(0)').length - 1, 2);
});
