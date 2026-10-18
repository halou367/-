const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Flow = require('../ui/auth-flow');
const Policy = require('../ui/net-policy');
const { createAccountSignIn } = require('../src/account-auth');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const poster = (fetch, extra = {}) => Flow.createPoster({ fetch, deadline: Policy.deadline, retryAfter: Policy.retryAfter, ...extra });
const account = { id: 'fixture', email: 'expected@example.invalid' };
const user = { id: 'fixture-user', email: account.email };

test('identity accepts whitespace/case, but never aliases or another email', () => {
  assert.equal(Flow.identity(user, ' EXPECTED@example.invalid '), user);
  for (const email of ['other@example.invalid', 'expected+tag@example.invalid', 'ex.pected@example.invalid', ''])
    assert.throws(() => Flow.identity(user, email), { code: 'AUTH_IDENTITY_MISMATCH' });
});
for (const value of [null, {}, { email: 'invalid' }, ['expected@example.invalid']]) test('missing session is not silently authenticated: ' + JSON.stringify(value), () => {
  assert.throws(() => Flow.identity(value, account.email), { code: 'AUTH_SESSION_MISSING' });
});
for (const state of [{ emailConfirmed: false }, { userState: 'provisional' }]) test('unverified session cannot complete login: ' + JSON.stringify(state), () => {
  assert.throws(() => Flow.identity({ ...user, ...state }, account.email), { code: 'AUTH_EMAIL_UNVERIFIED' });
});
test('signup task is account-bound, short-lived, metadata only', () => {
  const at = 10000000, valid = { email: ' EXPECTED@example.invalid ', at, password: 'must-not-persist', extra: true };
  assert.deepEqual(Flow.signupIntent(valid, account, at), { email: 'EXPECTED@example.invalid', at });
  for (const value of [null, 'text', [], { ...valid, email: 'other@example.invalid' }, { ...valid, at: at - 1800001 }, { ...valid, at: at + 60001 }, { ...valid, at: '10000000' }])
    assert.equal(Flow.signupIntent(value, account, at), null);
  assert.equal(Flow.signupIntent(valid, { email: account.email }, at), null);
});
test('verification-return metadata cannot cross accounts or outlive its task', () => {
  const at = Date.now(), data = { accountId: account.id, email: 'new@example.invalid', kind: 'signup', at };
  assert.equal(Flow.verificationIntent(data, account).email, data.email);
  for (const patch of [{ accountId: 'other' }, { kind: 'anything' }, { at: at - 1800001 }, { email: 'invalid' }])
    assert.equal(Flow.verificationIntent({ ...data, ...patch }, account, at), null);
});
test('drafts survive tab changes but remain isolated by account', () => {
  const drafts = Flow.createDrafts(), a = drafts.get(account);
  drafts.setEmail(a, 'new@example.invalid'); a.password = 'manually-entered'; a.passwordSource = 'user';
  assert.equal(drafts.get(account), a);
  assert.equal(drafts.get({ id: 'other', email: 'other@example.invalid' }).password, '');
  assert.equal(drafts.get(account).email, 'new@example.invalid');
  drafts.clear(account); assert.equal(drafts.get(account).password, '');
});
test('changing email removes only an account-bound stored password', () => {
  const drafts = Flow.createDrafts(), d = drafts.get(account);
  Object.assign(d, { password: 'stored', passwordSource: 'stored', passwordEmail: account.email });
  drafts.setEmail(d, ' EXPECTED@example.invalid '); assert.equal(d.password, 'stored');
  drafts.setEmail(d, 'different@example.invalid'); assert.equal(d.password, '');
});
for (const url of ['https://arena.ai/?auth=reset-password&code=fixture', 'https://auth.arena.ai/verify?code=fixture']) test('official verification URL accepted: ' + new URL(url).host, () => {
  assert.equal(Flow.authURL(url).href, url);
});
for (const url of ['https://arena.ai.example.invalid/?code=x', 'http://arena.ai/', 'javascript:alert(1)', 'https://user@arena.ai/', 'https://arena.ai:444/', 'https://email.nloop.cc/', 'https://evil.invalid/?auth=reset-password&code=x']) test('unsafe verification URL rejected: ' + url, () => {
  assert.throws(() => Flow.authURL(url), e => /^AUTH_LINK_/.test(e.code));
});
test('HTML 200 is verification, not signup success', async () => {
  let count = 0;
  const post = poster(async () => { count++; return new Response('<html>Challenge</html>', { headers: { 'content-type': 'text/html' } }); });
  await assert.rejects(post('/signup', {}), { code: 'AUTH_VERIFICATION_REQUIRED' }); assert.equal(count, 1);
});
for (const text of ['not-json', 'null', '[]', '"ok"', '{}']) test('unusable response is not success: ' + text, async () => {
  const post = poster(async () => new Response(text, { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(post('/signup', {}), { code: 'AUTH_RESPONSE_INVALID' });
});
test('HTTP 503 preserves service diagnosis even for an HTML body', async () => {
  await assert.rejects(poster(async () => new Response('<html>error</html>', { status: 503 }))('/signup', {}), e => e.status === 503 && !/Cookie|密码错误/.test(e.message));
});
test('whole-body auth deadline bounds a reader that ignores abort; never replays POST', async () => {
  let count = 0, signal;
  const post = poster(async (_, init) => { count++; signal = init.signal; return { status: 200, ok: true, text: () => new Promise(() => {}) }; });
  await assert.rejects(post('/signup', {}, { timeout: 8 }), e => e.code === 'AUTH_REQUEST_UNCONFIRMED' && e.uncertain && !e.net);
  assert.equal(count, 1); assert.equal(signal.aborted, true);
});
test('auth header timeout and transport error are uncertain, not credentials failure', async () => {
  await assert.rejects(poster(() => new Promise(() => {}))('/signup', {}, { timeout: 8 }), { code: 'AUTH_REQUEST_UNCONFIRMED' });
  await assert.rejects(poster(async () => { throw new TypeError('Failed to fetch'); })('/signup', {}), e => e.uncertain && !e.wrong && !e.net);
});
test('caller cancellation does not get diagnosed as a timeout', async () => {
  const ctl = new AbortController(); ctl.abort();
  let calls = 0;
  await assert.rejects(poster(async () => { calls++; })('/signup', {}, { signal: ctl.signal }), { code: 'AUTH_CANCELLED' });
  assert.equal(calls, 0);
});
test('429 honors Retry-After across repeated manual submits and never changes route', async () => {
  let at = 100000, calls = 0;
  const post = poster(async () => { calls++; return json({ error: 'rate limited' }, 429, { 'retry-after': '90' }); }, { now: () => at });
  for (let i = 0; i < 10; i++) await assert.rejects(post('/signup', {}), e => e.status === 429 && e.retryAfterMs === 90000);
  assert.equal(calls, 1); at += 90001;
  await assert.rejects(post('/signup', {}), { code: 'AUTH_RATE_LIMIT' }); assert.equal(calls, 2);
});
test('429 date header uses the same injected clock', async () => {
  const at = Date.parse('2026-10-05T00:00:00Z');
  const post = poster(async () => json({}, 429, { 'retry-after': new Date(at + 120000).toUTCString() }), { now: () => at });
  await assert.rejects(post('/signup', {}), e => e.retryAfterMs === 120000);
});
test('sign-in requires an explicit success result', async () => {
  await assert.rejects(poster(async () => json({ message: 'pending' }))('/login', {}, { requireSuccess: true }), { code: 'AUTH_REJECTED' });
  assert.deepEqual(await poster(async () => json({ success: true }))('/login', {}, { requireSuccess: true }), { success: true });
});
test('credential and email-verification errors remain distinct', async () => {
  await assert.rejects(poster(async () => json({ error: 'Invalid credentials' }, 401))('/login', {}), e => e.code === 'AUTH_CREDENTIALS' && e.wrong);
  await assert.rejects(poster(async () => json({ requiresVerification: true }))('/login', {}), { code: 'AUTH_EMAIL_UNVERIFIED' });
});
test('failed session check keeps the true status rather than alleging Cookie failure', () => {
  const error = Flow.sessionError({ status: 503 }); assert.equal(error.status, 503); assert.match(error.message, /503/); assert.doesNotMatch(error.message, /Cookie/);
  const mismatch = Object.assign(Error('mismatch'), { code: 'AUTH_IDENTITY_MISMATCH' }); assert.equal(Flow.sessionError(mismatch), mismatch);
});

function nativeFixture(extra = {}) {
  const a = { ...account, noAuto: true, status: { loggedIn: true, me: 'cached@example.invalid' } };
  let saves = 0, navigations = 0, posts = 0, syncs = 0;
  const ses = { fetch: async () => { posts++; return json({ success: true, user }); } };
  const fn = createAccountSignIn({ find: id => id === a.id ? a : null, password: () => 'fixture-password', session: () => ses,
    prepare: async () => {}, syncCookies: async () => { syncs++; }, save: () => { saves++; }, navigate: () => { navigations++; },
    read: async () => json({ user }), ...extra });
  return { a, ses, fn, stats: () => ({ saves, navigations, posts, syncs }) };
}
test('background login validates live identity before saving or navigation', async () => {
  const x = nativeFixture({ read: async () => json({ user: { id: 'other', email: 'other@example.invalid' } }) });
  await assert.rejects(x.fn(account.id), { code: 'AUTH_IDENTITY_MISMATCH' });
  assert.deepEqual(x.stats(), { saves: 0, navigations: 0, posts: 1, syncs: 1 }); assert.equal(x.a.noAuto, true);
});
test('cached loggedIn cannot mask a failed background identity check', async () => {
  const x = nativeFixture({ read: async () => json({ error: 'temporary' }, 503) });
  await assert.rejects(x.fn(account.id), e => e.status === 503 && !/Cookie|Cloudflare/.test(e.message)); assert.equal(x.stats().saves, 0);
});
test('background login is single-flight, confirmed and only then persisted', async () => {
  let release;
  const x = nativeFixture({ prepare: () => new Promise(resolve => { release = resolve; }) });
  const first = x.fn(account.id), second = x.fn(account.id); assert.equal(first, second);
  release(); assert.equal((await first).email, account.email);
  assert.deepEqual(x.stats(), { saves: 1, navigations: 1, posts: 1, syncs: 1 }); assert.equal(x.a.noAuto, false);
});
test('account changes while authenticating prevent stale persistence', async () => {
  let release;
  const x = nativeFixture({ read: () => new Promise(resolve => { release = () => resolve(json({ user })); }) });
  const job = x.fn(account.id);
  for (let i = 0; i < 30 && !release; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(release); x.a.email = 'changed@example.invalid'; release();
  await assert.rejects(job, /配置已变化/); assert.equal(x.stats().saves, 0);
});
test('background login rejects HTML before cookie fallback and session probing', async () => {
  const x = nativeFixture(); x.ses.fetch = async () => new Response('<html>challenge</html>');
  await assert.rejects(x.fn(account.id), { code: 'AUTH_VERIFICATION_REQUIRED' }); assert.equal(x.stats().syncs, 0);
});
test('background local persistence failure restores prior authentication metadata', async () => {
  const x = nativeFixture({ save: () => { throw Error('disk full'); } });
  await assert.rejects(x.fn(account.id), /disk full/); assert.equal(x.a.noAuto, true); assert.equal(x.a.status.me, 'cached@example.invalid');
});

function sharedHandler({ diskFail = false } = {}) {
  const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = src.indexOf("ipcMain.handle('host:shared',"), end = src.indexOf('// 有窗口在抽卡', start);
  assert.ok(start >= 0 && end > start);
  let handler, writes = 0;
  const env = { ipcMain: { handle: (_, fn) => { handler = fn; } }, DB: { shared: {} }, acct: id => id === account.id ? account : null,
    require: name => { assert.equal(name, '../ui/auth-flow'); return Flow; }, saveSoon() {},
    saveDB: strict => { assert.equal(strict, true); writes++; if (diskFail) throw Error('disk full'); } };
  vm.runInNewContext(src.slice(start, end), env);
  return { handler, db: env.DB, writes: () => writes };
}
test('actual desktop shared handler durably accepts and clears signup metadata', () => {
  const x = sharedHandler(), intent = { email: account.email, at: Date.now(), password: 'not persisted' }, key = 'signup@' + account.id;
  assert.equal(x.handler({}, key, intent), true); assert.equal(x.writes(), 1);
  assert.deepEqual(x.handler({}, key), { email: account.email, at: intent.at });
  assert.equal(x.handler({}, key, null), true); assert.equal(x.handler({}, key), null);
});
test('desktop shared handler rejects invalid/foreign tasks and rolls back a failed disk write', () => {
  const x = sharedHandler(), key = 'signup@' + account.id;
  assert.equal(x.handler({}, 'signup@../../file', {}), null);
  assert.ok(x.handler({}, 'signup@missing', { email: account.email, at: Date.now() }).error);
  assert.ok(x.handler({}, key, { email: 'other@example.invalid', at: Date.now() }).error); assert.equal(x.writes(), 0);
  const y = sharedHandler({ diskFail: true });
  assert.throws(() => y.handler({}, key, { email: account.email, at: Date.now() }), /disk full/); assert.equal(Object.hasOwn(y.db.shared, key), false);
});
test('Android bridge declares both signup prefixes and confirms a metadata-only durable write', () => {
  const src = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  const part = src.slice(src.indexOf('@JavascriptInterface public String sharedGet'), src.indexOf('@JavascriptInterface public String exportAccounts'));
  assert.equal((part.match(/gacha\|draft\|gtok\|signup/g) || []).length, 2);
  assert.match(part, /find\(k\.substring\(7\)\)/); assert.match(part, /email\.equalsIgnoreCase/);
  assert.match(part, /new JSONObject\(\)\.put\("email", email\)\.put\("at", at\)/);
  assert.match(part, /putString\("shared_" \+ k, clean\)\.commit\(\) \? "true" : "false"/);
});

for (const status of [429, 503]) test('failed status survives a hung response body: ' + status, async () => {
  const post = poster(async () => ({ status, ok: false, headers: new Headers({ 'retry-after': '90' }), text: () => new Promise(() => {}) }));
  await assert.rejects(post('/signup', {}, { timeout: 8 }), e => e.status === status && !e.uncertain);
});
function saveHandler() {
  const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = src.indexOf("ipcMain.handle('host:saveAccount',"), end = src.indexOf('// A name-only update', start);
  assert.ok(start >= 0 && end > start);
  let handler, applications = 0;
  const a = { ...account, name: 'fixture', proxy: 'vless://fixture', proxyIp: '203.0.113.5', nodeId: 'node-1', region: 'JP', pw: 'old-encrypted', noAuto: false };
  const env = { ipcMain: { handle: (_, fn) => { handler = fn; } }, DB: { accounts: [a] }, acct: () => a, byEmail: () => a,
    RouteState: require('../ui/route-state'), applyRoute: { busy: new Set() }, validProxy: () => true, wins: new Map(), encPw: s => 'encrypted:' + s,
    applyProxy: async () => { applications++; }, saveDB() {}, pub: x => ({ ...x }) };
  vm.runInNewContext(src.slice(start, end), env);
  return { handler, a, applications: () => applications };
}
test('desktop metadata save preserves route and legacy empty-password behavior', async () => {
  const x = saveHandler(); await x.handler({}, { id: account.id, email: account.email, password: '' });
  assert.equal(x.a.pw, 'old-encrypted'); assert.equal(x.a.proxy, 'vless://fixture'); assert.equal(x.a.proxyIp, '203.0.113.5'); assert.equal(x.applications(), 0);
});
test('desktop explicit forget-password clears old credentials without changing the route', async () => {
  const x = saveHandler(); await x.handler({}, { id: account.id, clearPassword: true });
  assert.equal(x.a.pw, undefined); assert.equal(x.a.noAuto, true); assert.equal(x.applications(), 0);
});
test('Android metadata update preserves an omitted proxy and supports explicit credential removal', () => {
  const src = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  const part = src.slice(src.indexOf('String saveAccount0('), src.indexOf('@JavascriptInterface public String removeAccount'));
  assert.match(part, /in.has\("proxy"\).*a.optString\("proxy", ""\)/);
  assert.match(part, /in.optBoolean\("clearPassword", false\)\) \{ a.remove\("pw"\); a.put\("noAuto", true\);/);
});

test('failed password login releases the auth lease instead of leaving a lock the user must cancel', async () => {
  const released = [];
  const x = nativeFixture({ begin: async () => ({ ticket: 'T1' }), release: async (a, lease) => { released.push(lease.ticket); }, read: async () => json({ error: 'temporary' }, 503) });
  await assert.rejects(x.fn(account.id), e => e.status === 503);
  assert.deepEqual(released, ['T1']);
});
test('successful password login finishes the lease and does not release it', async () => {
  const released = [], finished = [];
  const x = nativeFixture({ begin: async () => ({ ticket: 'T2' }), finish: async (a, u, s, lease) => { finished.push(lease.ticket); }, release: async (a, lease) => { released.push(lease.ticket); } });
  assert.equal((await x.fn(account.id)).email, account.email);
  assert.deepEqual(finished, ['T2']); assert.deepEqual(released, []);
});
test('a failing release does not hide the real login error', async () => {
  const x = nativeFixture({ begin: async () => ({ ticket: 'T3' }), release: async () => { throw Error('release failed'); }, read: async () => json({ error: 'x' }, 503) });
  await assert.rejects(x.fn(account.id), e => e.status === 503);
});
test('UI + host: login-kind locks are dropped on failure / stale, other kinds untouched', () => {
  const fs = require('node:fs'), p = f => fs.readFileSync(require('node:path').join(__dirname, '..', f), 'utf8');
  const env = p('ui/auth-environment.js'), core = p('ui/core.js'), main = p('src/main.js');
  assert.match(env, /!kinds\.includes\(task\.kind\)\|\|task\.stage/);
  assert.match(core, /catch \(e\) \{ await AuthEnv\.drop\(\); throw e; \}/);
  assert.match(main, /x\.kind === 'login' && !x\.stage/);
  assert.match(main, /release: async \(a, lease\)/);
});

test('Google login: the flow\'s own google lock does not block the local Chrome/Edge path (regression from 0.13.117)', () => {
  const fs = require('node:fs'), p = f => fs.readFileSync(require('node:path').join(__dirname, '..', f), 'utf8');
  const core = p('ui/core.js'), main = p('src/main.js'), env = p('ui/auth-environment.js');
  assert.match(core, /Host\.gbStart && !opt\.inWindow && \(!AuthEnv\.state\?\.locked \|\| AuthEnv\.state\.kind === 'google'\)/);
  assert.match(main, /RouteState\.locked\(a\) && a\.routeAuth\?\.kind !== 'google'/);
  assert.match(core, /catch \(e\) \{ await AuthEnv\.drop\(\['google'\]\); throw e; \}/);
  assert.match(env, /k==='google'&&!gReturn/);
});

for (const input of ['first.last@icloud.com', 'alias@example.invalid']) test('password login accepts server canonical email for ' + input, async () => {
  let sent;
  const x = nativeFixture(); x.a.email = input;
  x.ses.fetch = async (_, init) => { sent = JSON.parse(init.body); return json({ success: true, user: { id: user.id, emailConfirmed: true } }); };
  assert.equal((await x.fn(account.id)).email, user.email);
  assert.equal(sent.email, input); assert.equal(sent.password, 'fixture-password');
  assert.equal(x.a.email, input); assert.equal(x.a.status.me, user.email);
  assert.equal(x.stats().saves, 1);
});
test('login canonicalization never accepts another server user ID', () => {
  assert.throws(() => Flow.loginIdentity(user, { id: 'other', emailConfirmed: true }), { code: 'AUTH_IDENTITY_MISMATCH' });
  assert.throws(() => Flow.loginIdentity(user, { emailConfirmed: true }), { code: 'AUTH_IDENTITY_MISMATCH' });
  assert.throws(() => Flow.loginIdentity(user, { id: user.id, emailConfirmed: false }), { code: 'AUTH_EMAIL_UNVERIFIED' });
});
