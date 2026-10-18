const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const S = require('../ui/route-state');
const { createAuthRouteGuard } = require('../src/auth-route-guard');
const account = () => ({ id: 'a', email: 'a@example.invalid', proxy: 'vless://a', proxyIp: '203.0.113.2', nodeId: 'a', region: 'JP', fp: { timezone: 'Asia/Tokyo', ua: 'fixture' } });
const begin = (a, kind = 'signup') => S.begin(a, { kind, email: 'a@example.invalid' }, { now: 10000, ticket: 'local-auth-task' });
test('route strategy is independent of effective configuration and failure recovery', () => {
  const a = account(); Object.assign(a, S.prefs('node'));
  assert.equal(S.mode(a), 'node'); assert.equal(a.routeAuto, false); assert.equal(S.canRecover(a), true);
  a.nodeFailover = false; assert.equal(S.canRecover(a), false);
  Object.assign(a, S.prefs('auto')); assert.equal(S.canRecover(a), true);
  for (const mode of ['proxy', 'direct']) { Object.assign(a, S.prefs(mode), { routeAuto: true }); assert.equal(S.canRecover(a), false); }
});
test('legacy fixed nodes are not silently opted into failover before an explicit choice', () => {
  const a = { ...account(), routeAuto: false };
  assert.equal(S.mode(a), 'node'); assert.equal(S.canRecover(a), false);
  Object.assign(a, S.prefs('node')); assert.equal(S.canRecover(a), true);
});
test('invalid strategy values cannot be persisted through the policy helper', () => {
  for (const mode of ['unknown', '', null]) assert.throws(() => S.prefs(mode), { code: 'ROUTE_MODE_INVALID' });
});
test('all config and fingerprint fields participate in the authentication snapshot', () => {
  const a = account(), signature = S.signature(a);
  for (const field of S.critical) assert.notEqual(S.signature({ ...a, [field]: field === 'fp' ? { ua: 'changed' } : 'changed' }), signature);
  assert.equal(S.signature(a), S.signature({ ...a, fp: { ua: 'fixture', timezone: 'Asia/Tokyo' } }));
  assert.equal(S.signature(a), S.signature({ ...a, name: 'different label', password: 'not used' }));
});
test('lease stores task metadata, not service credentials or the request payload', () => {
  const a = account(); S.begin(a, { kind: 'signup', email: 'a@example.invalid', password: 'secret', token: 'secret' }, { now: 10000, ticket: 'task' });
  assert.equal(a.routeAuth.password, undefined); assert.equal(a.routeAuth.token, undefined);
  assert.equal(S.locked(a), true); assert.equal(S.canRecover(a), false);
  assert.equal(S.status(a, 10000).expired, false);
});
test('a public lock flag also prevents renderer-side automatic failover', () => {
  const a = { ...account(), ...S.prefs('node'), authLocked: true, authExpires: 10000 };
  assert.equal(S.canRecover(a), false); assert.equal(S.status(a, 11000).expired, true);
});
test('authentication expiry never silently enables a different network environment', () => {
  const a = account(); begin(a);
  assert.equal(S.status(a, 2000000).expired, true); assert.equal(S.locked(a), true); assert.equal(S.canRecover(a), false);
  assert.throws(() => S.begin(a, { kind: 'login', email: a.email }, { now: 2000000, ticket: 'other' }), { code: 'AUTH_TASK_EXPIRED' });
  assert.throws(() => S.finish(a, { ticket: 'local-auth-task', email: a.email }, 2000000), { code: 'AUTH_TASK_EXPIRED' });
  S.cancel(a, 'local-auth-task'); assert.equal(S.locked(a), false);
});
test('a pending signup can continue with the same identity and environment', () => {
  const a = account(), first = begin(a);
  const second = S.begin(a, { kind: 'verify', email: 'A@example.invalid' }, { now: 20000, ticket: 'new-unused' });
  assert.equal(first.ticket, second.ticket); assert.equal(a.routeAuth.kind, 'signup');
});
test('different email, stale completion and stale cancellation cannot replace a task', () => {
  const a = account(); begin(a);
  assert.throws(() => S.begin(a, { kind: 'login', email: 'b@example.invalid' }, { now: 20000, ticket: 'different' }), { code: 'AUTH_TASK_CONFLICT' });
  assert.throws(() => S.finish(a, { ticket: 'other', email: a.email }, 20000), { code: 'AUTH_TASK_STALE' });
  assert.throws(() => S.cancel(a, 'other'), { code: 'AUTH_TASK_STALE' }); assert.equal(S.locked(a), true);
});
test('identity mismatch cannot finish the lease, even with the right local task ID', () => {
  const a = account(); begin(a);
  assert.throws(() => S.finish(a, { ticket: 'local-auth-task', email: 'b@example.invalid' }, 20000), { code: 'AUTH_IDENTITY_MISMATCH' });
  assert.equal(S.locked(a), true); S.finish(a, { ticket: 'local-auth-task', email: a.email }, 20000); assert.equal(S.locked(a), false);
});
test('critical writes from any caller are rejected while unrelated metadata remains writable', () => {
  const a = account(); begin(a);
  for (const field of S.critical) assert.throws(() => S.assertChange(a, { [field]: 'changed' }), { code: 'AUTH_ROUTE_LOCKED' });
  assert.throws(() => S.assertChange(a, { routeMode: 'direct' }), { code: 'AUTH_ROUTE_LOCKED' });
  assert.doesNotThrow(() => S.assertChange(a, { email: 'a@example.invalid', name: 'label', clearPassword: true }));
  assert.doesNotThrow(() => S.assertChange(a, { routeMode: 'auto', routeAuto: true, nodeFailover: false }));
});
test('an out-of-band changed environment cannot continue or finish an authentication task', () => {
  const a = account(); begin(a); a.proxyIp = '203.0.113.99';
  assert.throws(() => S.begin(a, { kind: 'login', email: a.email }, { now: 20000, ticket: 'fresh' }), { code: 'AUTH_ENV_CHANGED' });
  assert.throws(() => S.finish(a, { ticket: 'local-auth-task', email: a.email }, 20000), { code: 'AUTH_ENV_CHANGED' });
});
test('host guard confirms durable begin/finish and does not persist on read', () => {
  const a = account(); let writes = 0;
  const g = createAuthRouteGuard({ find: id => id === a.id ? a : null, persist: () => writes++, now: () => 10000, nonce: () => 'task' });
  assert.equal(g.task('a', { op: 'status' }).locked, false); assert.equal(writes, 0);
  assert.equal(g.task('a', { op: 'begin', kind: 'login', email: a.email }).ticket, 'task'); assert.equal(writes, 1);
  assert.equal(g.task('a', { op: 'finish', ticket: 'task', email: a.email }).locked, false); assert.equal(writes, 2);
});
test('disk failure rolls back both acquiring and releasing the native lock', () => {
  const a = account(), g = createAuthRouteGuard({ find: () => a, persist: () => { throw Error('disk full'); }, now: () => 10000, nonce: () => 'task' });
  assert.throws(() => g.task('a', { op: 'begin', kind: 'login', email: a.email }), /disk full/); assert.equal(S.locked(a), false);
  begin(a); assert.throws(() => g.task('a', { op: 'cancel', ticket: 'local-auth-task' }), /disk full/); assert.equal(S.locked(a), true);
});
test('host refuses acquisition while the physical route is still changing', () => {
  const a = account(), g = createAuthRouteGuard({ find: () => a, persist() {}, busy: () => true });
  assert.throws(() => g.task('a', { op: 'begin', kind: 'login', email: a.email }), /线路正在切换/); assert.equal(S.locked(a), false);
});
test('same-route navigation preserves a locked desktop environment without closing connections', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('async function applyProxy('), end = source.indexOf('// ---------- 指纹', start);
  const a = account(); begin(a); let closes = 0;
  const ses = { __routeReadySignature: S.signature(a), __routeBlocked: false, closeAllConnections: async () => { closes++; } };
  const context = vm.createContext({ Promise, Error, setTimeout, RouteState: S, acct: () => a, prepSession: () => ses,
    proxyStr: x => x.proxy, tunnels: new Map([['a', { proc: { exitCode: null } }]]), wins: new Map() });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(await context.applyProxy(a), ses); assert.equal(closes, 0);
  await assert.rejects(context.applyProxy(a,{force:true}),/禁止强制/);assert.equal(closes,0);
  await assert.rejects(context.applyProxy({ ...a, proxy: 'vless://other' }), { code: 'AUTH_ROUTE_LOCKED' }); assert.equal(closes, 0);
});

test('a completed password login accepts the server canonical email without changing its route', () => {
  const a = account(); begin(a, 'login');
  const route = S.signature(a);
  S.finish(a, { ticket: 'local-auth-task', email: 'canonical@example.invalid' }, 20000);
  assert.equal(S.locked(a), false); assert.equal(S.signature(a), route);
});
