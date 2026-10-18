'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const SiteLogins = require('../src/site-logins');
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const gh = (name, value = 'x', domain = '.github.com') => ({ name, value, domain });
test('GitHub counts as signed in only with a live user_session that was not followed by a sign-out', () => {
  const on = cookies => SiteLogins.detect(cookies).github;
  assert.equal(on([gh('user_session', 'abc'), gh('logged_in', 'yes')]), true);
  assert.equal(on([gh('user_session', 'abc')]), true, 'logged_in flag is optional');
  assert.equal(on([gh('user_session', 'abc', 'github.com')]), true, 'host-only domain form');
  assert.equal(on([gh('user_session', 'abc', 'gist.github.com')]), true, 'subdomains belong to the site');
  assert.equal(on([gh('user_session', 'abc'), gh('logged_in', 'no')]), false, 'explicit sign-out wins');
  assert.equal(on([gh('logged_in', 'yes')]), false, 'a stale logged_in flag without the session is not a login');
  assert.equal(on([gh('user_session', '')]), false);
  assert.equal(on([gh('user_session', 'abc', 'notgithub.com'), gh('user_session', 'abc', 'github.com.evil.test')]), false, 'look-alike hosts never match');
  assert.equal(on([{ name: 'arena-auth-prod-v1', value: 'x', domain: 'arena.ai' }]), false);
  assert.equal(on(null), false);
});
test('publish only exposes booleans for known sites; relevance filters cookie change events', () => {
  assert.deepEqual(SiteLogins.publish({ github: true, secret: 'value' }), { github: true });
  assert.deepEqual(SiteLogins.publish({ github: 'yes' }), { github: false });
  assert.equal(SiteLogins.publish(null), null); assert.equal(SiteLogins.publish('github'), null);
  assert.equal(SiteLogins.relevant(gh('x')), true); assert.equal(SiteLogins.relevant({ domain: 'arena.ai' }), false); assert.equal(SiteLogins.relevant(null), false);
});
function fakeSession(initial) {
  const listeners = []; let jar = initial;
  const ses = { gets: 0, cookies: { on: (_n, fn) => listeners.push(fn), get: async filter => { ses.gets++; assert.equal(filter.domain, 'github.com'); return jar; } } };
  ses.set = (cookies, changed = cookies[0] || gh('user_session')) => { jar = cookies; listeners.forEach(fn => fn({}, changed, 'explicit', false)); };
  return ses;
}
function tracker(store = {}) {
  const writes = [];
  const t = SiteLogins.createSiteLogins({ delayMs: 2, read: id => store[id], write: (id, sites) => { store[id] = sites; writes.push([id, sites]); } });
  return { t, writes, store };
}
test('watching a partition scans it immediately and records the GitHub state on the account', async () => {
  const { t, writes, store } = tracker(); const ses = fakeSession([gh('user_session', 'abc')]);
  assert.equal(t.watch('a', ses), true); assert.equal(t.watch('a', ses), true);
  await tick(5);
  assert.deepEqual(writes, [['a', { github: true }]]); assert.deepEqual(store.a, { github: true });
  ses.set([gh('user_session', 'abc'), gh('logged_in', 'no')]); await tick(10);
  assert.deepEqual(store.a, { github: false }); assert.equal(writes.length, 2);
});
test('unchanged state is not rewritten and unrelated cookie churn does not trigger a scan', async () => {
  const { t, writes } = tracker({ a: { github: false } }); const ses = fakeSession([]);
  t.watch('a', ses); await tick(5); assert.equal(writes.length, 0, 'persisted record already matched'); assert.equal(ses.gets, 1);
  ses.set([], { name: 'arena-auth-prod-v1', domain: 'arena.ai' }); await tick(10); assert.equal(ses.gets, 1, 'arena cookies are not GitHub');
  ses.set([gh('user_session', 'abc')]); ses.set([gh('user_session', 'abc')]); await tick(10); assert.equal(ses.gets, 2, 'bursts are coalesced'); assert.deepEqual(writes, [['a', { github: true }]]);
});
test('scan failures are logged and leave the stored state untouched; forget stops the watcher', async () => {
  const log = []; const store = { a: { github: true } };
  const t = SiteLogins.createSiteLogins({ delayMs: 1, read: id => store[id], write: () => { throw Error('must not write'); }, log: (k, v) => log.push([k, v]) });
  const ses = fakeSession([]); ses.cookies.get = async () => { throw Object.assign(Error('gone'), { code: 'ERR_SESSION' }); };
  t.watch('a', ses); await tick(5);
  assert.deepEqual(log, [['site-login-scan-failed', { code: 'ERR_SESSION', kind: 'Error' }]]); assert.deepEqual(store.a, { github: true });
  t.forget('a'); assert.equal(t.watching('a'), false); assert.equal(await t.refresh('a'), null);
  assert.equal(t.watch('', ses), false); assert.equal(t.watch('b', {}), false);
  assert.throws(() => SiteLogins.createSiteLogins({}), /read\/write/);
});
