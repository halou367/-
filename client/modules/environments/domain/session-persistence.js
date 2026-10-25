'use strict';
// Chromium writes cookies to disk lazily (batched, roughly every 30 s) and Electron's quit path does not reliably
// wait for that batch. Brana only forced Arena's own login cookies onto disk (cookies.flushStore after sign-in) and
// re-signs Arena in from the saved password anyway, so Arena looked "kept" while GitHub and every other website
// visited in browser mode lost its login whenever the app exited before the batch landed.
// This module flushes a watched partition shortly after any cookie change and once more right before quitting.
// It never reads cookie values, never changes cookie attributes and does not touch session-only cookies: sites that
// deliberately log out when the browser closes still do, exactly as in Chrome.
function createCookiePersistence({ delayMs = 2000, timeoutMs = 4000, setTimer = setTimeout, clearTimer = clearTimeout, log = () => {} } = {}) {
  const watched = new Map();   // session -> { timer, dirty, flushing }
  const stateOf = ses => { let s = watched.get(ses); if (!s) { s = { timer: 0, dirty: false, flushing: null }; watched.set(ses, s); } return s; };
  async function flush(ses) {
    const s = stateOf(ses);
    if (s.timer) { clearTimer(s.timer); s.timer = 0; }
    if (s.flushing) { s.dirty = true; return s.flushing; }   // a flush is running: run once more afterwards
    s.dirty = false;
    s.flushing = (async () => {
      try { await ses.cookies.flushStore(); return true; }
      catch (error) { log('cookie-flush-failed', { code: error?.code, kind: error?.name }); return false; }
      finally { s.flushing = null; }
    })();
    const ok = await s.flushing;
    if (s.dirty) return flush(ses);
    return ok;
  }
  // Trailing throttle, not a debounce: a page that rewrites cookies continuously still gets its first write
  // within delayMs, and whatever changed while the timer ran is included because flushStore commits everything pending.
  function schedule(ses) {
    const s = stateOf(ses);
    if (s.timer) return;
    s.timer = setTimer(() => { s.timer = 0; void flush(ses); }, delayMs);
  }
  function watch(ses) {
    if (!ses || !ses.cookies || typeof ses.cookies.on !== 'function') return false;
    if (watched.has(ses)) return true;
    stateOf(ses);
    // Any cause (explicit set, overwrite, expiry, eviction) changes the on-disk truth; the write is coalesced.
    ses.cookies.on('changed', () => schedule(ses));
    return true;
  }
  // Used from before-quit / before app.exit: bounded so a wedged store cannot keep the app alive forever.
  async function flushAll() {
    const sessions = [...watched.keys()];
    if (!sessions.length) return { flushed: 0, failed: 0, timedOut: false };
    let timer = 0;
    const timeout = new Promise(resolve => { timer = setTimer(() => resolve('timeout'), timeoutMs); });
    const work = Promise.all(sessions.map(ses => flush(ses)));
    const result = await Promise.race([work, timeout]);
    if (timer) clearTimer(timer);
    if (result === 'timeout') { log('cookie-flush-timeout', { sessions: sessions.length }); return { flushed: 0, failed: 0, timedOut: true }; }
    const flushed = result.filter(Boolean).length;
    return { flushed, failed: result.length - flushed, timedOut: false };
  }
  return { watch, flush, flushAll, schedule, size: () => watched.size, pending: ses => !!watched.get(ses)?.timer };
}
module.exports = { createCookiePersistence };
