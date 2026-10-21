const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../ui/net-policy');
const read = name => fs.readFileSync(path.join(__dirname, '../ui', name + '.js'), 'utf8');
const core = read('core');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const timeoutError = () => Object.assign(new Error('请求超时'), { routeTimeout: true });
const abortError = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });
function clock() {
  let at = 100000, id = 0;
  const jobs = new Map();
  const add = (fn, ms, interval = false) => { const key = ++id; jobs.set(key, { fn, at: at + (+ms || 0), ms, interval }); return key; };
  const clear = id => jobs.delete(id);
  return {
    now: () => at, set: value => { at = value; }, jobs,
    timer: (fn, ms) => add(fn, ms), interval: (fn, ms) => add(fn, ms, true), clear,
    async tick(ms) {
      const end = at + ms; let n = 0; await flush();
      for (;;) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        assert.ok(++n < 10000, 'bounded timer work');
        const [key, task] = next; at = task.at;
        if (task.interval) task.at += task.ms; else jobs.delete(key);
        task.fn(); await flush();
      }
      at = end; await flush();
    },
  };
}
function policy(c) { return { ...P, deadline: (work, opt) => P.deadline(work, { ...opt, timer: c.timer, clear: c.clear }) }; }
function session(readSession, extra = {}) {
  const c = clock(), changes = [], io = { read: readSession, clock: c.now, timer: c.timer, clear: c.clear, online: () => true, random: () => 0.5, changed: s => changes.push(s), ...extra };
  const check = new P.SessionCheck(io);
  return { c, changes, check, io };
}

// Whole-response deadlines, caller cancellation and resource cleanup.
test('HTTP deadline covers a hung response body, even when the reader ignores abort', async () => {
  const c = clock(); let signal;
  const job = P.deadline(s => { signal = s; return new Promise(() => {}); }, { timeout: 30, timer: c.timer, clear: c.clear });
  const rejected = assert.rejects(job, e => e.routeTimeout && !/正在检查/.test(e.message));
  await c.tick(30); await rejected;
  assert.equal(signal.aborted, true); assert.equal(c.jobs.size, 0);
});
test('deadline composes a caller signal and removes its listener after success', async () => {
  const c = clock(), ctl = new AbortController(); let adds = 0, removes = 0, inner;
  const add = ctl.signal.addEventListener.bind(ctl.signal), remove = ctl.signal.removeEventListener.bind(ctl.signal);
  ctl.signal.addEventListener = (...args) => { adds++; return add(...args); };
  ctl.signal.removeEventListener = (...args) => { removes++; return remove(...args); };
  assert.equal(await P.deadline(signal => { inner = signal; return 9; }, { signal: ctl.signal, timeout: 100, timer: c.timer, clear: c.clear }), 9);
  assert.equal(adds, 1); assert.equal(removes, 1); assert.equal(c.jobs.size, 0);
  ctl.abort(); assert.equal(inner.aborted, false);
});
test('a caller-owned signal no longer disables the request deadline', async () => {
  const c = clock(), ctl = new AbortController(); let inner;
  const job = P.deadline(signal => { inner = signal; return new Promise(() => {}); }, { signal: ctl.signal, timeout: 30, timer: c.timer, clear: c.clear });
  const rejected = assert.rejects(job, e => e.routeTimeout); await c.tick(30); await rejected;
  assert.equal(inner.aborted, true); assert.equal(ctl.signal.aborted, false);
});
test('explicit timeout zero still permits caller cancellation without a timeout diagnosis', async () => {
  const c = clock(), ctl = new AbortController();
  const job = P.deadline(() => new Promise(() => {}), { signal: ctl.signal, timeout: 0, timer: c.timer, clear: c.clear });
  const rejected = assert.rejects(job, e => e.name === 'AbortError' && !e.routeTimeout);
  await c.tick(600000); assert.equal(c.jobs.size, 0); ctl.abort(); await rejected;
});
test('pre-cancelled requests never start work', async () => {
  const ctl = new AbortController(); ctl.abort(); let calls = 0;
  await assert.rejects(P.deadline(() => calls++, { signal: ctl.signal })); assert.equal(calls, 0);
});

test('one timeout and a late failed check cannot override newer live chat evidence', () => {
  const c = clock(), h = new P.Health({ clock: c.now });
  assert.equal(h.failed(timeoutError(), h.mark()), false);
  const old = h.mark(); c.set(c.now() + 1000); h.good('stream');
  assert.equal(h.failed(timeoutError(), old), false); assert.equal(h.failures.length, 0);
  assert.equal(h.recent(), true); assert.equal(h.streamRecent(), true);
});
test('genuine repeated failures trigger recovery after successful evidence has aged out', () => {
  const c = clock(), h = new P.Health({ clock: c.now }); h.good(); c.set(c.now() + 46000);
  assert.equal(h.failed(timeoutError(), h.mark()), false);
  assert.equal(h.failed(timeoutError(), h.mark()), true);
  h.good(); assert.equal(h.failures.length, 0);
});
test('health is isolated per account and excludes cancellation, login, limits and HTML', () => {
  const a = new P.Health(), b = new P.Health(); a.good('stream'); assert.equal(b.recent(), false);
  for (const e of [{ status: 401 }, { status: 403 }, { status: 429 }, { responseFormat: true }, { name: 'AbortError' }]) {
    assert.equal(b.failed(e), false); assert.equal(b.failures.length, 0);
  }
});
test('IP/static-page success is not wired as authenticated API/stream evidence', () => {
  const ip = core.slice(core.indexOf('const IP = {'));
  assert.doesNotMatch(ip, /NetHealth\.good/);
  assert.doesNotMatch(read('auto-route'), /probe.*NetHealth\.good/);
});

// Session checking never promotes cached data to a validated login.
test('session checks tolerate a 20-second first response without a retry', async () => {
  const d = deferred(); let calls = 0;
  const f = session(() => { calls++; return d.promise; }); const job = f.check.run();
  assert.equal(f.check.run(), job); await f.c.tick(20000);
  assert.equal(f.check.phase, 'checking'); assert.equal(f.check.wake(true), false); assert.equal(calls, 1);
  d.resolve({ user: { id: 'account', email: 'fixture@example.invalid' } });
  assert.equal((await job).value.user.id, 'account'); assert.equal(f.c.jobs.size, 0);
});
test('failed session verification is quiet while business requests continue working', async () => {
  const f = session(async () => { throw timeoutError(); }), health = new P.Health({ clock: f.c.now });
  const job = f.check.run(); await flush();
  assert.equal(P.notice(f.check.snapshot(), health, true, f.c.now()), null);
  await f.c.tick(2000); assert.equal(f.check.attempt, 2);
  assert.match(P.notice(f.check.snapshot(), health, true, f.c.now()).text, /账号状态核对较慢/);
  health.good('stream'); assert.equal(P.notice(f.check.snapshot(), health, true, f.c.now()), null);
  assert.equal(f.check.phase, 'waiting'); f.check.cancel(); assert.equal((await job).manual, true);
  assert.equal(f.c.jobs.size, 0);
});
test('repeated manual retry taps start only one new session request', async () => {
  let calls = 0; const d = deferred();
  const f = session(() => ++calls === 1 ? Promise.reject(timeoutError()) : d.promise);
  const job = f.check.run(); await flush();
  for (let i = 0; i < 30; i++) f.check.wake(true);
  await flush(); assert.equal(calls, 2);
  for (let i = 0; i < 30; i++) f.check.wake(true);
  assert.equal(calls, 2); d.resolve({ user: null }); await job; assert.equal(f.c.jobs.size, 0);
});
test('offline session verification makes no requests and wakes once on real online recovery', async () => {
  let online = false, calls = 0;
  const f = session(async () => { calls++; return { user: null }; }, { online: () => online });
  const job = f.check.run(); await f.c.tick(300000); assert.equal(calls, 0);
  assert.match(P.notice(f.check.snapshot(), new P.Health(), true).text, /设备当前离线/);
  online = true; f.check.wake(); await job; assert.equal(calls, 1); assert.equal(f.c.jobs.size, 0);
});
test('a real 401 resolves to a missing session rather than an endless network retry', async () => {
  const f = session(async () => { throw { status: 401 }; });
  assert.equal((await f.check.run()).value.user, null); assert.equal(f.c.jobs.size, 0);
});
test('403 and verification HTML never clear cached identity as if it were a logout', async () => {
  for (const error of [{ status: 403 }, { status: 401, responseFormat: true }, { responseFormat: true }]) {
    const f = session(async () => { throw error; }); const job = f.check.run(); await flush();
    assert.equal(f.check.phase, 'waiting'); assert.equal(f.check.wake(), false);
    assert.match(P.notice(f.check.snapshot(), new P.Health(), true, f.c.now()).text, /验证|异常/);
    f.check.cancel(); assert.equal((await job).manual, true);
  }
});
test('malformed successful session responses are not accepted as guests or real users', async () => {
  for (const value of [null, '<html>challenge</html>', {}, { user: undefined }, { user: [] }, { user: 'x' }]) {
    assert.throws(() => P.sessionValue(value), e => e.responseFormat);
  }
  assert.equal(P.sessionValue({ user: null }).user, null);
});
test('429 Retry-After survives focus, live traffic and repeated manual taps', async () => {
  let calls = 0; const f = session(async () => { calls++; throw { status: 429, retryAfterMs: 90000 }; });
  const job = f.check.run(); await flush();
  assert.equal(f.check.retryAt - f.c.now(), 90000);
  for (let i = 0; i < 20; i++) { f.check.wake(); f.check.wake(true); }
  await f.c.tick(89999); assert.equal(calls, 1); await f.c.tick(1); assert.equal(calls, 2);
  f.check.cancel(); await job;
});
test('Retry-After supports seconds and HTTP dates and ignores malformed values', () => {
  assert.equal(P.retryAfter('12'), 12000); assert.equal(P.retryAfter('invalid'), 0);
  assert.equal(P.retryAfter('Thu, 01 Oct 2026 00:01:00 GMT', Date.parse('2026-10-01T00:00:00Z')), 60000);
  assert.equal(P.retryAfter('-1'), 0);
});
test('cancel during an active verification aborts it and cleans all retry work', async () => {
  let signal; const f = session(s => { signal = s; return new Promise((_, reject) => s.addEventListener('abort', () => reject(abortError()))); });
  const job = f.check.run(); f.check.cancel(); assert.equal((await job).manual, true);
  assert.equal(signal.aborted, true); assert.equal(f.c.jobs.size, 0);
});

function apiFixture(fetch) {
  const c = clock(), events = [], routes = [], net = policy(c), navigator = { onLine: true };
  const env = vm.createContext({ console, AbortController, now: c.now, navigator, setTimeout: c.timer, clearTimeout: c.clear,
    NetPolicy: net, rawFetch: fetch, Bus: { emit: (...x) => events.push(x) }, Auth: { relogin: async () => false }, AutoRoute: { request: (...x) => routes.push(x) } });
  const a = core.indexOf('const NetHealth = '), b = core.indexOf('// ---------- 登录', a);
  vm.runInContext(core.slice(a, b) + ';this.api=api;this.health=NetHealth;', env);
  return { c, env, events, routes };
}
test('real api helper keeps caller-signal body deadlines and never replays POST on timeout', async () => {
  let calls = 0, signal;
  const f = apiFixture(async (_, opt) => { calls++; signal = opt.signal; return { text: () => new Promise(() => {}) }; });
  const ctl = new AbortController(), job = f.env.api('/api/fixture', { json: { value: 9 }, signal: ctl.signal, timeout: 30 });
  const rejected = assert.rejects(job, e => e.routeTimeout); await f.c.tick(30); await rejected;
  assert.equal(calls, 1); assert.equal(signal.aborted, true); assert.equal(f.events.filter(e => e[0] === 'neterr').length, 0);
});
test('real api helper differentiates verification HTML, service failures and malformed /api/me', async () => {
  let response; const f = apiFixture(async () => response);
  response = new Response('<html>challenge</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(f.env.api('/api/me'), e => e.responseFormat); assert.equal(f.env.health.recent(), false);
  response = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(f.env.api('/api/me'), e => e.responseFormat); assert.equal(f.env.health.recent(), false);
  response = new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
  await assert.rejects(f.env.api('/api/me'), e => e.status === 502 && !e.responseFormat);
  response = new Response('{"user":null}', { status: 200 }); await f.env.api('/api/me'); assert.equal(f.env.health.recent(), true);
});
test('slow /api/me does not itself initiate route scans', async () => {
  const d = deferred(), f = apiFixture(() => d.promise);
  const job = f.env.api('/api/me', { timeout: 30000 }); await f.c.tick(20000);
  d.resolve(new Response('{"user":null}')); await job; assert.equal(f.routes.length, 0);
});
test('concurrent HTTP successes prevent a stale failed read from announcing disconnection', async () => {
  const stale = deferred(); let response = stale.promise;
  const f = apiFixture(() => response); const old = f.env.api('/api/me'); const rejected = assert.rejects(old);
  await flush(); response = Promise.resolve(new Response('{"entries":[]}')); await f.env.api('/api/history/unified');
  stale.reject(new TypeError('Failed to fetch')); await rejected;
  assert.equal(f.events.filter(e => e[0] === 'neterr').length, 0); assert.equal(f.env.health.recent(), true);
});

function tokenFixture(api) {
  const env = vm.createContext({ api, now: () => 100000 });
  const a = core.indexOf('  ensureToken(force)'), b = core.indexOf('\n  load(force)', a);
  vm.runInContext('this.Chat=class { setToken(t){this.token=t;this.tokenExp=9999999;} ' + core.slice(a, b) + '};', env);
  return env.Chat;
}
test('send, stream and peek share one token refresh and different chats stay isolated', async () => {
  const d = deferred(); let calls = 0; const Chat = tokenFixture(() => { calls++; return d.promise; });
  const a = new Chat(), b = new Chat(); const one = a.ensureToken(), two = a.ensureToken(true), other = b.ensureToken();
  assert.equal(one, two); assert.notEqual(one, other); assert.equal(calls, 2);
  d.resolve({ token: 'fixture' }); await Promise.all([one, two, other]); assert.equal(a.tokenP, null);
});
test('failed and empty token responses clear the in-flight lock and do not reuse a rejected token', async () => {
  let calls = 0; const Chat = tokenFixture(async () => { calls++; return calls === 1 ? {} : { token: 'new' }; });
  const a = new Chat(); a.setToken('old'); await assert.rejects(a.ensureToken(true), /无法获取/);
  assert.equal(a.tokenP, null); assert.equal(await a.ensureToken(true), 'new'); assert.equal(calls, 2);
});

function streamFixture(fetch, extra = {}) {
  const c = clock(), faults = [], silent = [], health = new P.Health({ clock: c.now });
  const env = vm.createContext({ AbortController, TextDecoder, now: c.now, NetPolicy: P, NetHealth: health,
    setInterval: c.interval, clearInterval: c.clear, sleep: ms => new Promise(r => c.timer(r, ms)), rawFetch: fetch,
    AutoRoute: { streamFails: [], silent: chat => silent.push(chat), fault: (...x) => faults.push(x) },
    OUT: () => '/ai-proxy/fixture/out', describe: e => e.message || String(e.status),
    HttpError: class extends Error { constructor(status, body, res) { super(body); this.status = status; this.retryAfterMs = P.retryAfter(res?.headers?.get?.('retry-after'), c.now()); } },
    ...extra,
  });
  const a = core.indexOf('  restream() {'), b = core.indexOf('\n  // 服务器刚结束一轮时', a);
  vm.runInContext('this.Chat=class { constructor(){this.gen=0;this.streaming=false;this.busy=true;this.lastSeq="42";this.token="fixture";this.status="streaming";this.messages=[{text:"keep"}];this.awaitId="pending";} async ensureToken(){} emit(){} onRecord(r){this.lastSeq=String(r.seq_num);return "done";} ' + core.slice(a, b) + '};', env);
  const chat = new env.Chat(); return { c, env, chat, faults, silent, health };
}
function streamResponse(signal, text = null, cancel = () => {}) {
  return new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => { try { controller.error(abortError()); } catch {} });
      if (text != null) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); }
    }, cancel,
  }), { headers: { 'content-type': 'text/event-stream' } });
}
test('a 20-second SSE handshake stays connected instead of being aborted at 12 seconds', async () => {
  let calls = 0, signal, f;
  f = streamFixture((_, opt) => { calls++; signal = opt.signal; return new Promise(resolve => f.c.timer(() => resolve(streamResponse(signal, 'data: [DONE]\n\n')), 20000)); });
  const job = f.chat.stream({ peek: true }); await f.c.tick(13000); assert.equal(signal.aborted, false);
  await f.c.tick(7000); await job; assert.equal(calls, 1); assert.equal(f.faults.length, 0); assert.equal(f.health.recent(), true);
  assert.equal(f.c.jobs.size, 0); assert.equal(f.chat.lastSeq, '42');
});
test('stalled SSE handshakes remain bounded and preserve delivery IDs and displayed content', async () => {
  let calls = 0;
  const f = streamFixture((_, opt) => { calls++; return new Promise((_, reject) => opt.signal.addEventListener('abort', () => reject(abortError()))); });
  const messages = f.chat.messages, job = f.chat.stream(); await f.c.tick(31000);
  assert.equal(calls, 1); assert.equal(f.faults.length, 1); assert.equal(f.faults[0][0].routeTimeout, true);
  assert.equal(f.chat.messages, messages); assert.equal(f.chat.lastSeq, '42'); assert.equal(f.chat.awaitId, 'pending');
  f.chat.gen++; f.chat.ctl?.abort(); await f.c.tick(600); await job; assert.equal(f.c.jobs.size, 0);
});
test('quiet established SSE is not killed at 30 seconds and the 75-second idle watchdog owns recovery', async () => {
  const f = streamFixture(async (_, opt) => streamResponse(opt.signal)); const job = f.chat.stream();
  await f.c.tick(74000); assert.equal(f.faults.length, 0); assert.ok(f.silent.length > 0);
  await f.c.tick(2000); assert.equal(f.faults.length, 1);
  f.chat.gen++; f.chat.ctl?.abort(); await f.c.tick(600); await job;
});
test('superseded token acquisition never opens an obsolete stream', async () => {
  let calls = 0; const d = deferred(), f = streamFixture(async () => { calls++; }); f.chat.ensureToken = () => d.promise;
  const job = f.chat.stream(); f.chat.gen++; d.resolve(); await job;
  assert.equal(calls, 0); assert.equal(f.c.jobs.size, 0);
});
test('SSE authentication retries release response bodies and do not masquerade as transport errors', async () => {
  let calls = 0, cancelled = 0;
  const f = streamFixture(async (_, opt) => ++calls === 1
    ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 401 })
    : streamResponse(opt.signal, 'data: [DONE]\n\n'));
  await f.chat.stream({ peek: true }); assert.equal(calls, 2); assert.equal(cancelled, 1); assert.equal(f.faults.length, 0);
});
test('SSE non-event HTML is not accepted as successful chat traffic', async () => {
  const f = streamFixture(async () => new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }));
  await f.chat.stream(); assert.equal(f.health.recent(), false); assert.match(f.chat.error, /实时通道/);
  assert.equal(f.faults[0][0].responseFormat, true); assert.equal(f.c.jobs.size, 0);
});

function quietFixture() {
  let at = 100000, streams = 0, routes = 0;
  const env = vm.createContext({ now: () => at, Date, NetHealth: new P.Health() });
  vm.runInContext(read('auto-route') + ';this.route=AutoRoute;', env);
  env.route.enabled = () => false; env.route.request = () => { routes++; };
  const chat = { busy: true, gen: 1, lastSeq: '42', awaitId: 'pending', peekTurn: async () => ({ n: 0, last: 42 }), restream() { streams++; this.gen++; } };
  return { route: env.route, chat, time: value => { at = value; }, stats: () => ({ streams, routes }) };
}
test('quiet models/tools do not trigger route probes or destructive refreshes on Android', async () => {
  const f = quietFixture(); await f.route.silent(f.chat); assert.deepEqual(f.stats(), { streams: 0, routes: 0 });
  f.time(131000); f.chat.peekTurn = async () => null; await f.route.silent(f.chat); assert.deepEqual(f.stats(), { streams: 0, routes: 0 });
});
test('only proven missed records reconnect a quiet stream, without sending or replacing its cursor', async () => {
  const f = quietFixture(); f.chat.peekTurn = async () => ({ n: 2, last: 44 }); await f.route.silent(f.chat);
  assert.deepEqual(f.stats(), { streams: 1, routes: 0 }); assert.equal(f.chat.lastSeq, '42'); assert.equal(f.chat.awaitId, 'pending');
});
test('late quiet probes cannot restart a newer generation or a stopped turn', async () => {
  for (const change of [c => c.gen++, c => { c.stopReq = true; }, c => { c.lastSeq = '43'; }]) {
    const f = quietFixture(), d = deferred(); f.chat.peekTurn = () => d.promise;
    const job = f.route.silent(f.chat); change(f.chat); d.resolve({ n: 2, last: 44 }); await job;
    assert.deepEqual(f.stats(), { streams: 0, routes: 0 });
  }
});
test('concurrent quiet checks coalesce into one read-only probe', async () => {
  const f = quietFixture(), d = deferred(); let calls = 0;
  f.chat.peekTurn = () => { calls++; return d.promise; };
  const first = f.route.silent(f.chat); for (let i = 0; i < 20; i++) await f.route.silent(f.chat);
  assert.equal(calls, 1); d.resolve(null); await first; assert.equal(f.chat.routeSilentJob, null);
});
test('failed IP probes record attempt time so a failed endpoint cannot be polled every second', async () => {
  const c = clock(), env = vm.createContext({ now: c.now, NetPolicy: policy(c), rawFetch: async () => { throw new TypeError('offline'); }, describe: e => e.message, Bus: { emit() {} } });
  const a = core.indexOf('const IP = {'), b = core.indexOf('\nfunction describe', a);
  vm.runInContext(core.slice(a, b) + ';this.IP=IP;', env); await env.IP.poll();
  assert.equal(env.IP.checkedAt, c.now()); assert.equal(env.IP.at, 0); assert.equal(env.IP.failures, 1);
  assert.match(read('boot'), /Math\.max\(IP\.at, IP\.checkedAt/);
});
test('keepalive startup is idempotent and its transport logic no longer reloads a quiet established stream', () => {
  const source = read('keep'); let intervals = 0, listeners = 0;
  const env = vm.createContext({ setInterval: () => ++intervals, Bus: { on() {} }, document: { addEventListener() { listeners++; } }, addEventListener() { listeners++; } });
  vm.runInContext(source + ';this.keep=KeepAlive;', env); env.keep.start(); env.keep.start();
  assert.equal(intervals, 2); assert.equal(listeners, 3);
  assert.doesNotMatch(source, /重连后 .*仍没有数据|连接 .*没有任何数据（连心跳/);
});

test('new live traffic cancels an unissued network route change during candidate probing', async () => {
  const RoutePolicy = require('../ui/route-policy'), d = deferred(), callbacks = new Map(); let writes = 0;
  const Bus = { on: (name, fn) => callbacks.set(name, fn), emit: name => callbacks.get(name)?.() };
  const health = new P.Health({ changed: () => Bus.emit('connection') });
  const account = { id: 'own', proxy: 'vless://old', routeAuto: true };
  const adapter = { read: async () => ({ account, accounts: [account], nodes: [], pool: {}, enabled: true }), probe: () => d.promise, link: n => n.link, local: async () => [], apply: async () => { writes++; return { ok: true }; } };
  const env = vm.createContext({ NetHealth: health, RoutePolicy, RouteState: require('../ui/route-state'), RouteHost: { create: () => adapter }, Vless: {}, window: {},
    UI: { host: { account } }, Bus, addEventListener() {}, setInterval() {}, PoolGuard: {}, RegionAdvisor: {},
    Pool: { switching: new Set() }, navigator: { onLine: true }, now: Date.now, describe: e => e.message });
  vm.runInContext(read('auto-route') + ';this.route=AutoRoute;', env); env.route.paint = () => {}; env.route.init();
  const job = env.route.request('network'); await flush(); health.good('stream'); d.resolve({ ok: false });
  const result = await job; assert.equal(result.cancelled, true); assert.equal(writes, 0);
  assert.equal(env.route.busy, false); assert.equal(env.route.failed, false); assert.equal(env.Pool.switching.size, 0);
});
test('Android IP-only guardian retains a working chat route when trace alone fails', async () => {
  let probes = 0, writes = 0; const health = new P.Health(); health.good('stream');
  const env = vm.createContext({ NetHealth: health, UI: { host: { account: { id: 'a', proxyIp: 'fixture', region: 'JP' } } },
    IP: { err: 'trace timeout' }, navigator: { onLine: true },
    Pool: { load: async () => {}, canRotate: () => true, hostProbe: async () => { probes++; }, acquire: async () => { writes++; } } });
  const source = read('pool'), a = source.indexOf('const PoolGuard = {'), b = source.indexOf("\nBus.on('ip'", a);
  vm.runInContext(source.slice(a, b) + ';this.guard=PoolGuard;', env); await env.guard.check();
  assert.equal(probes, 0); assert.equal(writes, 0);
});

function keepFixture(parts) {
  let at = 100000;
  const chat = { sid: 'fixture', status: 'streaming', busy: true, loaded: true, streaming: true, streamOpenAt: at,
    sentAt: at, respAt: at, byteAt: at, messages: [{ id: 'a', role: 'assistant', parts }] };
  const env = vm.createContext({ now: () => at, document: { hidden: true }, Prefs: {}, UI: {},
    Bus: { on() {}, emit() {} }, Trace: { log: [] }, Hitl: { name: () => '', awaiting: () => false },
    AutoRoute: { enabled: () => false, silent() {} } });
  vm.runInContext(read('keep') + ';this.keep=KeepAlive;', env);
  const tick = ms => { at += ms; chat.byteAt = at; env.keep.check(chat); };
  tick(0); return { tick, chat, state: () => env.keep.state(chat) };
}
test('quiet reasoning with a working heartbeat is not destructively reloaded after 90 or 240 seconds', () => {
  const f = keepFixture([{ type: 'reasoning', state: 'streaming', text: '思考中' }]);
  f.tick(300000); assert.equal(f.state().plan, null);
});
test('waiting tools are not subjected to the text-stall reload deadline', () => {
  const f = keepFixture([{ type: 'text', state: 'streaming', text: '运行工具中' },
    { type: 'tool-bash', toolName: 'bash', toolCallId: 'tool-1', state: 'input-available', input: { timeout: 600 } }]);
  f.tick(120000); assert.equal(f.state().plan, null);
  const text = keepFixture([{ type: 'text', state: 'streaming', text: '中断的文字' }]);
  text.tick(100000); assert.equal(text.state().plan.kind, 'stream');
});
test('extra-long /api/chat/:id streaming transcripts extend deadline on chunk activity without false 20s timeout', async () => {
  const c = clock();
  let progressed = 0;
  const result = P.deadline(async signal => {
    for (let i = 0; i < 4; i++) {
      await new Promise(r => c.timer(r, 15000));
      signal.touch(30000);
      progressed++;
    }
    return 'ok-60s-stream';
  }, { timeout: 20000, timer: c.timer, clear: c.clear });
  await c.tick(60000);
  assert.equal(await result, 'ok-60s-stream');
  assert.equal(progressed, 4);
  assert.equal(c.jobs.size, 0);
});

