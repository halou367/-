'use strict';
// Which third-party websites an account's browser partition is currently signed in to.
// Detection only looks at the account's own cookie jar from the main process: no network requests, no password or
// token access, and only a boolean per site ever leaves this module (nothing about the cookie values).
// The result is stored on the account record so the switcher can show it before a window for that account exists;
// it is re-evaluated as soon as the partition is prepared and whenever a relevant cookie changes.
const SITES = Object.freeze({
  github: Object.freeze({
    label: 'GitHub', host: 'github.com',
    // GitHub keeps `user_session` (HttpOnly, 2-week expiry) while signed in and rewrites `logged_in` to `no` on sign-out.
    signedIn: cookies => {
      const session = cookies.some(c => c.name === 'user_session' && String(c.value || '').length > 0);
      const flag = cookies.find(c => c.name === 'logged_in');
      return session && (!flag || String(flag.value).toLowerCase() === 'yes');
    },
  }),
});
const hostOf = cookie => String(cookie?.domain || '').replace(/^\./, '').toLowerCase();
const onHost = (cookie, host) => { const d = hostOf(cookie); return d === host || d.endsWith('.' + host); };
const relevant = cookie => Object.values(SITES).some(site => onHost(cookie, site.host));
// cookies: Electron cookie objects (name/value/domain) from any mix of hosts.
function detect(cookies) {
  const list = Array.isArray(cookies) ? cookies : [];
  const out = {};
  for (const [id, site] of Object.entries(SITES)) out[id] = !!site.signedIn(list.filter(c => onHost(c, site.host)));
  return out;
}
const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
// Public account shape: only known sites, only booleans. Unknown (never scanned) stays null.
function publish(sites) {
  if (!sites || typeof sites !== 'object') return null;
  const out = {}; for (const id of Object.keys(SITES)) out[id] = sites[id] === true;
  return out;
}
function createSiteLogins({ read, write, delayMs = 800, setTimer = setTimeout, clearTimer = clearTimeout, log = () => {} }) {
  if (typeof read !== 'function' || typeof write !== 'function') throw Error('site logins need read/write for the account record');
  const watched = new Map();   // account id -> { ses, timer, running, again }
  async function refresh(id) {
    const w = watched.get(id); if (!w) return null;
    if (w.running) { w.again = true; return w.running; }
    w.running = (async () => {
      try {
        const all = [];
        for (const site of Object.values(SITES)) all.push(...await w.ses.cookies.get({ domain: site.host }));
        const next = detect(all), prev = publish(read(id));
        if (!same(prev, next)) write(id, next);
        return next;
      } catch (error) { log('site-login-scan-failed', { code: error?.code, kind: error?.name }); return null; }
      finally { w.running = null; }
    })();
    const result = await w.running;
    if (w.again) { w.again = false; return refresh(id); }
    return result;
  }
  function schedule(id, ms = delayMs) {
    const w = watched.get(id); if (!w) return;
    if (w.timer) clearTimer(w.timer);
    w.timer = setTimer(() => { w.timer = 0; void refresh(id); }, ms);
  }
  function watch(id, ses) {
    if (!id || !ses?.cookies || typeof ses.cookies.on !== 'function' || typeof ses.cookies.get !== 'function') return false;
    if (watched.has(id)) return true;
    watched.set(id, { ses, timer: 0, running: null, again: false });
    ses.cookies.on('changed', (_event, cookie) => { if (relevant(cookie)) schedule(id); });
    schedule(id, 0);
    return true;
  }
  function forget(id) { const w = watched.get(id); if (!w) return; if (w.timer) clearTimer(w.timer); watched.delete(id); }
  return { watch, refresh, forget, watching: id => watched.has(id) };
}
module.exports = { SITES, detect, publish, relevant, hostOf, createSiteLogins };
