'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createCookiePersistence } = require('../src/session-persistence');
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
function fakeSession({ fail = 0 } = {}) {
  const listeners = [];
  const ses = { flushes: 0, cookies: {
    on: (name, fn) => { assert.equal(name, 'changed'); listeners.push(fn); },
    flushStore: async () => { ses.flushes++; if (fail > 0) { fail--; throw Object.assign(Error('store busy'), { code: 'EBUSY' }); } },
  } };
  ses.change = (cookie = { name: 'user_session', domain: '.github.com' }, cause = 'explicit') => listeners.forEach(fn => fn({}, cookie, cause, false));
  ses.listeners = listeners;
  return ses;
}
test('a burst of cookie changes flushes the store once, and continuous churn cannot postpone the write forever', async () => {
  const ses = fakeSession(), cp = createCookiePersistence({ delayMs: 15 });
  assert.equal(cp.watch(ses), true); assert.equal(cp.watch(ses), true); assert.equal(ses.listeners.length, 1, 'watch is idempotent');
  ses.change(); ses.change(); ses.change({ name: 'logged_in', domain: '.github.com' }, 'overwrite');
  assert.equal(cp.pending(ses), true); assert.equal(ses.flushes, 0);
  const churn = setInterval(() => ses.change(), 2);
  await tick(40); clearInterval(churn);
  assert.ok(ses.flushes >= 1 && ses.flushes <= 3, 'flushed despite churn, but throttled: ' + ses.flushes);
  await tick(40); const settled = ses.flushes; await tick(20); assert.equal(ses.flushes, settled, 'quiet jar: no further writes'); assert.equal(cp.pending(ses), false);
});
test('a change arriving during a flush schedules exactly one more flush', async () => {
  const ses = fakeSession(), releases = [];
  ses.cookies.flushStore = () => new Promise(resolve => { ses.flushes++; releases.push(resolve); });
  const cp = createCookiePersistence({ delayMs: 1 }); cp.watch(ses);
  const first = cp.flush(ses); await tick(0); assert.equal(ses.flushes, 1);
  const second = cp.flush(ses), third = cp.flush(ses);   // both only mark the running flush dirty
  await tick(0); assert.equal(ses.flushes, 1);
  releases[0](); await tick(0); await tick(0);
  assert.equal(ses.flushes, 2, 'one follow-up flush after the running one');
  releases[1](); assert.equal(await first, true); assert.equal(await second, true); assert.equal(await third, true);
  await tick(5); assert.equal(ses.flushes, 2);
});
test('flushAll covers every watched partition, reports failures and never throws', async () => {
  const log = []; const a = fakeSession(), b = fakeSession({ fail: 1 }), cp = createCookiePersistence({ delayMs: 1000, log: (k, v) => log.push([k, v]) });
  cp.watch(a); cp.watch(b);
  const r = await cp.flushAll();
  assert.deepEqual(r, { flushed: 1, failed: 1, timedOut: false }); assert.equal(a.flushes, 1); assert.equal(b.flushes, 1);
  assert.deepEqual(log, [['cookie-flush-failed', { code: 'EBUSY', kind: 'Error' }]]);
  assert.deepEqual(await createCookiePersistence().flushAll(), { flushed: 0, failed: 0, timedOut: false });
});
test('flushAll is bounded so a wedged cookie store cannot block quitting', async () => {
  const ses = fakeSession(); ses.cookies.flushStore = () => new Promise(() => {});
  const log = []; const cp = createCookiePersistence({ timeoutMs: 5, log: (k, v) => log.push(k) }); cp.watch(ses);
  const r = await cp.flushAll();
  assert.equal(r.timedOut, true); assert.deepEqual(log, ['cookie-flush-timeout']);
});
test('flushing a pending partition cancels its timer; sessions without a cookie API are ignored', async () => {
  const ses = fakeSession(), cp = createCookiePersistence({ delayMs: 5 }); cp.watch(ses); ses.change();
  assert.equal(await cp.flush(ses), true); assert.equal(cp.pending(ses), false); await tick(10); assert.equal(ses.flushes, 1);
  assert.equal(cp.watch(null), false); assert.equal(cp.watch({}), false); assert.equal(cp.size(), 1);
});
