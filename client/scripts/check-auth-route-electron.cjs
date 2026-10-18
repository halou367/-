// Real Electron main/preload/partitions/IPC. All HTTP(S), including probe partitions, is intercepted.
// No real Brana account, node, CAPTCHA or credentials are used.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-auth-route-'));
app.setPath('userData', root);
const first = 'auth-route-a', second = 'auth-route-b';
const accounts = [first, second].map(id => ({ id, name: id, email: id + '@example.invalid', proxy: '127.0.0.1:9', proxyIp: '', region: 'JP', routeMode: 'proxy', routeAuto: false }));
fs.writeFileSync(path.join(root, 'accounts.json'), JSON.stringify({ accounts, open: [first, second], shared: { prefs: { theme: 'dark', notify: false, pinOn: false, ipPoll: 120, keepAlive: false, autoTitle: false } } }));
let stage = 'startup'; const passed = [], errors = [], requests = [], states = new WeakMap(), installed = new WeakSet();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const timer = setTimeout(() => { console.error('TIMEOUT', stage, errors); app.exit(1); }, 120000);
process.on('unhandledRejection', e => errors.push(String(e?.stack || e)));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function intercept(ses) {
  if (installed.has(ses)) return; installed.add(ses);
  const handler = request => {
    const u = new URL(request.url), state = states.get(ses) || { ip: '203.0.113.9', user: null };
    requests.push({ path: u.pathname, method: request.method, cookie: request.headers.get('cookie') || '' });
    if (u.pathname === '/cdn-cgi/trace') return new Response('ip=' + state.ip + '\nloc=JP\ncolo=NRT');
    if (u.pathname === '/api/me') return json({ user: state.user });
    if (u.pathname.includes('/realtime/v1/sessions/')) return json({ error: 'fixture invalid session' }, 404);
    if (u.pathname === '/api/history/unified') return json({ entries: [], pagination: { hasMore: false, cursor: null } });
    if (u.pathname === '/api/me/pulse') return json({ pulse: 100 });
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/nextjs-api/')) return json({});
    if (u.pathname === '/robots.txt') return new Response('<!doctype html><html><body>isolated native auth/route fixture</body></html>', { headers: { 'content-type': 'text/html' } });
    return json({ version: require('../package.json').version, files: {} });
  };
  ses.protocol.handle('https', handler); ses.protocol.handle('http', handler);
}
app.on('session-created', intercept);
app.whenReady().then(() => {
  for (const id of [first, second]) {
    const ses = session.fromPartition('persist:acct-' + id); intercept(ses);
    states.set(ses, { ip: '203.0.113.9', user: { id, email: id + '@example.invalid' } });
  }
  void run().catch(e => { console.error('FAIL', stage, e, errors); app.exit(1); });
});
require('../src/main');
async function wait(check, ms = 30000) {
  const until = Date.now() + ms; let last;
  do { try { if (await check()) return; } catch (e) { last = e; } await sleep(100); } while (Date.now() < until);
  throw Error('Timeout at ' + stage + (last ? ': ' + last.message : ''));
}
const findWindow = id => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.getTitle().includes(id));
const db = () => JSON.parse(fs.readFileSync(path.join(root, 'accounts.json'), 'utf8'));
const ok = name => { passed.push(name); console.log('PASS', name); };
async function run() {
  await wait(() => findWindow(first) && findWindow(second));
  const a = findWindow(first), b = findWindow(second), wc = a.webContents, ses = wc.session;
  await wait(() => wc.getURL().startsWith('https://arena.ai/robots.txt') && wc.executeJavaScript('!!window.__anc?.UI.authed'));
  await wait(() => b.webContents.executeJavaScript('!!window.__anc?.UI.authed'));
  const call = (method, value) => wc.executeJavaScript('BranaHost[' + JSON.stringify(method) + '](' + JSON.stringify(value) + ')');
  stage = 'native auth prepare';
  const task = await wc.executeJavaScript('__anc.AuthEnv.begin("login", "auth-route-a@example.invalid")');
  assert.equal(task.locked, true); assert.equal(db().accounts.find(x => x.id === first).routeAuth.ip, '203.0.113.9');
  const denied = await wc.executeJavaScript('BranaHost.saveAccount({id:"auth-route-a",proxy:"127.0.0.1:10"}).then(()=>"unexpected",e=>e.message)');
  assert.match(denied, /认证|锁定/); assert.equal(db().accounts.find(x => x.id === first).proxy, '127.0.0.1:9');
  ok('real IPC persists the lease and blocks an auth-time route change');
  stage = 'identity validation';
  const environment = await wc.executeJavaScript('__anc.AuthEnv.environment()');
  const finish = { op: 'finish', ticket: task.ticket, email: first + '@example.invalid', ip: '203.0.113.9', environment };
  states.get(ses).user = { id: 'wrong', email: 'wrong@example.invalid' };
  const wrong = await call('authTask', finish); assert.equal(wrong.ok, false); assert.equal((await call('authTask', { op: 'status' })).locked, true);
  ok('main process independently rejects a wrong live service identity');
  states.get(ses).user = { id: first, email: first + '@example.invalid' }; states.get(ses).ip = '203.0.113.88';
  const drift = await call('authTask', finish); assert.equal(drift.ok, false); assert.equal((await call('authTask', { op: 'status' })).locked, true);
  ok('main process independently detects egress drift instead of trusting renderer IP');
  states.get(ses).ip = '203.0.113.9';
  assert.equal((await call('authTask', finish)).ok, true); assert.equal((await call('authTask', { op: 'status' })).locked, false);
  await wc.executeJavaScript('__anc.AuthEnv.restore()');
  ok('matching live identity and egress finish the real native lease');

  stage = 'canonical login identity';
  const canonical = await wc.executeJavaScript(`(async()=>{
    const lease=await __anc.AuthEnv.begin('login','first.last@icloud.com');
    return __anc.AuthEnv.finish({id:'auth-route-a',email:'auth-route-a@example.invalid'},lease);
  })()`);
  assert.equal(canonical.email, first + '@example.invalid');
  assert.equal((await call('authTask', { op: 'status' })).locked, false);
  ok('renderer and native lease accept the live canonical email after alias login');

  stage = 'target editor';
  const before = db().accounts.find(x => x.id === first).proxy;
  const opened = await call('routeDraft', { op: 'open', id: second }); assert.equal(opened.ok, true);
  const route = { proxy: 'http://127.0.0.1:10', proxyIp: '', nodeId: '', region: 'JP', kind: 'manual', draft: opened.draft };
  const measured = await call('routeProbe', route); assert.equal(measured.ok, true, measured.error); assert.ok(measured.ticket);
  assert.equal(db().accounts.find(x => x.id === second).proxy, '127.0.0.1:9');
  const wrongTarget = await call('routeSave', { draft: opened.draft, ticket: measured.ticket, account: { id: first, proxy: route.proxy, proxyIp: '', nodeId: '', region: 'JP', routeMode: 'proxy' } });
  assert.equal(wrongTarget.ok, false);
  const saved = await call('routeSave', { draft: opened.draft, ticket: measured.ticket, account: { id: second, proxy: route.proxy, proxyIp: '', nodeId: '', region: 'JP', routeMode: 'proxy' } });
  assert.equal(saved.ok, true, saved.error); assert.equal(saved.account.id, second); assert.equal(db().accounts.find(x => x.id === first).proxy, before);
  assert.equal(db().accounts.find(x => x.id === second).proxy, route.proxy);
  ok('real draft receipt applies only to its bound target, not to the calling account');

  stage = 'new profile';
  const fresh = await call('routeDraft', { op: 'open' }); assert.equal(fresh.ok, true); assert.equal(db().accounts.length, 2);
  const probe = await call('routeProbe', { ...route, draft: fresh.draft }); assert.equal(probe.ok, true, probe.error);
  const request = { draft: fresh.draft, ticket: probe.ticket, account: { email: 'new-profile@example.invalid', name: 'new profile', proxy: route.proxy, proxyIp: '', nodeId: '', region: 'JP', routeMode: 'proxy' } };
  const created = await call('routeSave', request); assert.equal(created.ok, true, created.error); assert.equal(db().accounts.length, 3);
  const repeated = await call('routeSave', request); assert.equal(repeated.ok, true); assert.equal(repeated.account.id, created.account.id); assert.equal(db().accounts.length, 3);
  assert.equal(db().accounts.find(x => x.id === first).proxy, before);
  ok('new target is created only on successful commit and an identical retry creates no duplicate');

  stage = 'authority';
  await wc.executeJavaScript('location.href="https://arena.ai/not-the-client"');
  await wait(() => wc.getURL().includes('/not-the-client') && !wc.isLoading());
  const deniedPage = await call('routeDraft', { op: 'open', id: first }); assert.equal(deniedPage.ok, false);
  ok('non-client top-level pages cannot authorize a route editor');
  assert.deepEqual(errors, []); assert.equal(requests.filter(x => x.method === 'POST').length, 0);
  clearTimeout(timer); console.log(JSON.stringify({ passed: passed.length, electron: process.versions.electron, platform: process.platform, interceptedRequests: requests.length, liveTraffic: false })); app.exit(0);
}
