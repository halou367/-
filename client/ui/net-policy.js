// Connection evidence is account-local and never substitutes for authentication.
// No cookies, tokens, message bodies or URLs are stored in this policy.
const NetPolicy = (() => {
  const READ_MS = 25000, SESSION_MS = 30000, CONNECT_MS = 30000, IDLE_MS = 75000;
  const abortError = () => Object.assign(new Error('请求已取消'), { name: 'AbortError' });
  const transportError = e => !e?.responseFormat && (!e?.status
    ? e?.name !== 'AbortError' || !!e?.routeTimeout
    : [408, 502, 503, 504].includes(+e.status));

  // The deadline covers headers AND body consumption, including caller-owned signals.
  // Racing also bounds a bridge/body reader which fails to reject on abort.
  async function deadline(work, { timeout = READ_MS, signal, timer = setTimeout, clear = clearTimeout } = {}) {
    if (signal?.aborted) throw signal.reason || abortError();
    const ctl = new AbortController();
    let tm, listener, rejectWait;
    const waiting = new Promise((_, reject) => { rejectWait = reject; });
    const abort = error => { rejectWait(error); ctl.abort(error); };
    if (signal) {
      listener = () => abort(signal.reason || abortError());
      signal.addEventListener('abort', listener, { once: true });
    }
    if (Number.isFinite(+timeout) && +timeout > 0) tm = timer(() => abort(Object.assign(
      new Error('请求超时（' + Math.ceil(timeout / 1000) + ' 秒）'), { routeTimeout: true }
    )), +timeout);
    try {
      return await Promise.race([Promise.resolve().then(() => {
        if (ctl.signal.aborted) throw ctl.signal.reason || abortError();
        return work(ctl.signal);
      }), waiting]);
    } finally {
      if (tm !== undefined) clear(tm);
      if (listener) signal.removeEventListener('abort', listener);
    }
  }

  function retryAfter(value, at = Date.now()) {
    if (!value) return 0;
    const seconds = Number(value), ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - at;
    return Number.isFinite(ms) ? Math.max(0, Math.min(ms, 24 * 3600000)) : 0;
  }
  function retryDelay(error, attempt, random = Math.random) {
    const base = error?.status === 403 || error?.responseFormat ? 60000
      : error?.status === 429 ? 30000
      : [2000, 5000, 10000, 20000, 30000][Math.min(Math.max(0, attempt - 1), 4)];
    return Math.max(Math.round(base * (0.9 + random() * 0.2)), +error?.retryAfterMs || 0);
  }
  function sessionValue(value) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'user')
      || (value.user !== null && (typeof value.user !== 'object' || Array.isArray(value.user) || !value.user.id))) {
      throw Object.assign(new Error('账号状态接口返回格式异常，请用网页登录检查'), { responseFormat: true });
    }
    return value;
  }

  class Health {
    constructor({ clock = Date.now, online = () => true, changed = () => {} } = {}) {
      this.clock = clock; this.online = online; this.changed = changed;
      this.lastGood = null; this.lastStream = null; this.proof = 0; this.failures = [];
    }
    recent(ms = 45000) { return this.lastGood !== null && this.clock() - this.lastGood < ms; }
    streamRecent(ms = 45000) { return this.lastStream !== null && this.clock() - this.lastStream < ms; }
    mark() { return { at: this.clock(), proof: this.proof }; }
    good(kind = 'api') {
      const notify = !this.recent() || this.failures.length > 0;
      this.lastGood = this.clock(); this.proof++; this.failures = [];
      if (kind === 'stream') this.lastStream = this.lastGood;
      if (notify) this.changed();
    }
    failed(error, mark = this.mark()) {
      if (!transportError(error) || this.proof > mark.proof) return false;
      const t = this.clock();
      this.failures = this.failures.filter(at => t - at < 90000);
      this.failures.push(t); this.failures = this.failures.slice(-8);
      this.changed();
      // A single slow metadata call cannot outweigh live chat/API traffic.
      return this.online() && this.failures.length >= 2 && !this.recent();
    }
  }

  // Exactly one session read and one retry timer. Wakeups never start parallel reads.
  // Only a real 401 (not a 403/challenge/HTML page) resolves to unauthenticated.
  class SessionCheck {
    constructor(io) {
      this.io = io; this.clock = io.clock || Date.now; this.timer = io.timer || setTimeout;
      this.clear = io.clear || clearTimeout; this.phase = 'idle'; this.attempt = 0;
      this.error = null; this.retryAt = 0; this.lastTry = -Infinity; this.cancelled = false;
    }
    snapshot() { return { phase: this.phase, attempt: this.attempt, error: this.error, retryAt: this.retryAt }; }
    publish() { this.io.changed?.(this.snapshot()); }
    run() { return this.job ||= this.loop().finally(() => { this.phase = 'done'; this.releaseWait?.(); this.publish(); }); }
    async loop() {
      while (!this.cancelled) {
        if (this.io.online?.() === false) { await this.wait(0, 'offline'); continue; }
        this.phase = 'checking'; this.retryAt = 0; this.lastTry = this.clock();
        this.ctl = new AbortController(); this.publish();
        try {
          const value = sessionValue(await this.io.read(this.ctl.signal));
          if (!this.cancelled) return { value };
        } catch (error) {
          if (this.cancelled) break;
          if (error?.status === 401 && !error.responseFormat) return { value: { user: null } };
          this.error = error; this.attempt++;
          await this.wait(retryDelay(error, this.attempt, this.io.random), 'waiting');
        } finally { this.ctl = null; }
      }
      return { manual: true, error: this.error };
    }
    wait(ms, phase) {
      this.phase = phase; this.retryAt = ms ? this.clock() + ms : 0;
      return new Promise(resolve => {
        let tm, done = false;
        this.releaseWait = () => {
          if (done) return; done = true;
          if (tm !== undefined) this.clear(tm);
          this.releaseWait = null; resolve();
        };
        if (ms) tm = this.timer(this.releaseWait, ms);
        this.publish();
      });
    }
    wake(manual = false) {
      if (this.cancelled || this.phase === 'done' || !this.releaseWait || this.io.online?.() === false) return false;
      // Do not defeat server Retry-After or repeatedly hit a verification page on focus.
      if (!manual && this.phase !== 'offline' && (this.error?.status === 429 || this.error?.status === 403 || this.error?.responseFormat
        || this.clock() - this.lastTry < 5000)) return false;
      if (manual && this.error?.retryAfterMs && this.clock() < this.retryAt) return false;
      this.releaseWait(); return true;
    }
    cancel() {
      if (this.phase === 'done') return;
      this.cancelled = true; this.ctl?.abort(); this.releaseWait?.();
    }
  }

  function notice(state, health, cached, at = Date.now()) {
    if (state.phase === 'done') return null;
    if (state.phase === 'offline') return { text: '设备当前离线，网络恢复后自动继续核对账号', busy: false, retry: false };
    const e = state.error, checking = state.phase === 'checking';
    const left = Math.max(1, Math.ceil((state.retryAt - at) / 1000));
    const tail = checking ? '正在重新核对…' : left + ' 秒后自动重试';
    if (!e) return cached ? null : { text: '正在核对 Brana 登录状态…', busy: true, retry: false };
    let text;
    if (e.status === 403 || e.responseFormat) text = '账号状态接口需要验证或返回异常，请用网页登录检查';
    else if (e.status === 429) text = '账号状态接口限流（429）';
    else {
      if (cached && (health.recent() || state.attempt < 2)) return null;
      text = e.status >= 500 ? 'Brana 账号状态服务暂时不可用（HTTP ' + e.status + '）'
        : e.routeTimeout ? '账号状态核对较慢，保留当前对话' : '账号状态暂未核对成功，保留当前对话';
    }
    return { text: text + ' · ' + tail, busy: checking,
      retry: !checking && !(e.retryAfterMs && at < state.retryAt) };
  }
  return { READ_MS, SESSION_MS, CONNECT_MS, IDLE_MS, deadline, retryAfter, retryDelay, sessionValue, transportError, Health, SessionCheck, notice };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetPolicy;
