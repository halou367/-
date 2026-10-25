const ReadLimit = {
  until: 0, inflight: 0, lastAt: 0,
  hit(ms) { this.until = Math.max(this.until, now() + Math.max(30000, Math.min(ms || 0, 600000))); },
  active() { return now() < this.until; },
  canPrefetch() { return !this.active() && this.inflight < 1 && now() - this.lastAt >= 5000; },
  // 后台 /api/ 读请求（预读、定时刷新）排队：相邻两条至少隔 GAP 毫秒，不和前台抢、不连发。
  // 限流冷却期间：后台读（预读、定时刷新）直接放弃；前台读（点开对话）等到冷却结束再发，冷却超过 60 秒就直接报错，不硬等也不换 IP。
  GAP: 250, readAt: 0, q: Promise.resolve(),
  async take(bg) {
    const wait = this.until - now();
    if (wait > 0) {
      if (bg || wait > 60000) throw Object.assign(new Error('请求过于频繁（429），冷却中，约 ' + Math.ceil(wait / 1000) + ' 秒后再试'), { status: 429, retryAfterMs: wait, rateLimitedLocally: true });
      await new Promise(r => setTimeout(r, wait));
    }
    if (!bg) { this.readAt = now(); return; }   // 前台读（用户正在看的）不人为延迟
    const p = this.q.then(async () => { const w = this.readAt + this.GAP - now(); if (w > 0) await new Promise(r => setTimeout(r, w)); this.readAt = now(); });
    this.q = p.catch(() => {});
    return p;
  },
};
async function api(path, opt = {}) {
  const init = { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } };
  if (opt.json !== undefined) { init.body = JSON.stringify(opt.json); init.method = init.method || 'POST'; delete init.json; }
  const retryCnt = Number(opt._retryCount) || (opt._retried ? 1 : 0);
  const onProgress = typeof opt.onProgress === 'function' ? opt.onProgress : null;
  const noApiRetry = !!opt.noApiRetry;
  const allowDirectFallback = !!opt.allowDirectFallback;
  if (allowDirectFallback && ReadLimit.active()) opt = { ...opt, bg: true };
  const isBg = !!opt.bg;
  delete init.noRelogin; delete init.timeout; delete init.bg; delete init._retried; delete init._retryCount; delete init._retried409; delete init.onProgress; delete init.noApiRetry; delete init.allowDirectFallback;
  const mark = NetHealth.mark(), read = /^(GET|HEAD)$/i.test(init.method || 'GET');
  const isCost = /\/(?:api|nextjs-api)\/(?:chat|evaluation)\/[^/]+\/cost\b/i.test(path);
  const isChatRead = read && !isCost && /^\/api\/chat\/[^/?#]+(?:\/messages)?(?:\?|$)/i.test(path);
  if (!isCost && typeof Pin !== 'undefined' && typeof Pin.drop === 'function' && typeof document !== 'undefined' && String(document.cookie || '').includes('__vdpl=') && (!Pin.on?.() || (!Pin.lockedDpl?.() && Prefs.pinOn !== true))) {
    try { Pin.drop(); } catch {}
  }
  if (read && /^\/api\//.test(path)) await ReadLimit.take(!!opt.bg);
  const fault = e => { if (!isBg && !isCost && !opt.signal?.aborted && NetHealth.failed(e, mark)) Bus.emit('neterr', path); };
  const baseTimeout = opt.timeout ?? (read ? (isChatRead ? 35000 : NetPolicy.READ_MS) : 0);
  const streamIdleMs = isChatRead ? Math.max(Number(baseTimeout) || 0, 45000) : Math.max(Number(baseTimeout) || 0, NetPolicy.READ_MS || 25000);
  let res, text = '', headersReceived = false, bytesReceived = 0;
  try {
    await NetPolicy.deadline(async signal => {
      res = await rawFetch(path, { ...init, signal, _selfTrackDown: true });
      headersReceived = true;
      if (isChatRead && res && res.ok) signal?.touch?.(streamIdleMs);
      if (res && res.body && !res.bodyUsed && typeof res.body.getReader === 'function' && typeof TextDecoder !== 'undefined') {
        const rd = res.body.getReader();
        const dec = new TextDecoder();
        const chunks = [];
        const kd = typeof Traffic !== 'undefined' && typeof Traffic.kind === 'function' ? Traffic.kind(path) : null;
        try {
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            const k = value && value.byteLength || 0;
            if (k > 0) {
              bytesReceived += k;
              signal?.touch?.(streamIdleMs);
              if (typeof Traffic !== 'undefined' && kd) {
                Traffic.down += k; Traffic.lastDownAt = now(); Traffic.add(kd, 0, k, false);
              }
              chunks.push(dec.decode(value, { stream: true }));
              if (onProgress) {
                try { onProgress(bytesReceived); } catch {}
              }
            }
          }
          const tail = dec.decode();
          if (tail) chunks.push(tail);
          text = chunks.join('');
        } finally {
          try { rd.releaseLock(); } catch {}
        }
      } else {
        text = await res.text();
        if (text && typeof Traffic !== 'undefined' && typeof Traffic.kind === 'function') {
          const k = text.length;
          Traffic.down += k; Traffic.lastDownAt = now(); Traffic.add(Traffic.kind(path), 0, k, false);
        }
      }
    }, { timeout: baseTimeout, signal: opt.signal });
  } catch (e) {
    if (read && !isCost && !noApiRetry && retryCnt < (isChatRead ? 1 : 2) && !opt.signal?.aborted && typeof Host !== 'undefined' && typeof Host.info === 'function' && !e?.status && (e?.routeTimeout || /failed to fetch|fetch failed|network|ERR_|socket|eof|reset|closed/i.test(String(e?.message || e)))) {
      if (!isBg && retryCnt >= 1 && e?.routeTimeout && !headersReceived && bytesReceived === 0 && !isChatRead && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) void AutoRoute.onErrorSwitch(e, path);
      const isSwitching = () => (typeof NodeRoutes !== 'undefined' && NodeRoutes.manual > 0) || (typeof AutoRoute !== 'undefined' && AutoRoute.busy) || (typeof Pool !== 'undefined' && Pool.switching?.size > 0);
      if (isSwitching()) {
        for (let w = 0; w < 8 && isSwitching() && !opt.signal?.aborted; w++) await new Promise(r => setTimeout(r, 250));
      }
      await new Promise(r => setTimeout(r, retryCnt === 0 ? 500 : 900));
      const nextTimeout = isChatRead ? Math.max(Number(opt.timeout) || 0, 45000) : opt.timeout;
      if (!opt.signal?.aborted) return api(path, { ...opt, timeout: nextTimeout, onProgress, _retried: true, _retryCount: retryCnt + 1 });
    }
    fault(e);
    throw e;
  }
  // HTML/challenge responses are not JSON, connectivity proof, or proof of logout.
  const html = /text\/html/i.test(res.headers?.get?.('content-type') || '') || /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(text);
  if (html) {
    if (res.status >= 500) { const error = new HttpError(res.status, 'Brana 服务暂时不可用', res); fault(error); throw error; }
    // Cloudflare 的限流页（网页版 429）：和纯文本 429 一样是出口 IP 被限流
    if (res.status === 429 && read && /^\/api\/chat\//.test(path) && !isCost) {
      const error = Object.assign(new HttpError(429, '出口 IP 被限流（429）', res), { ipLimited: true });
      ReadLimit.hit(error.retryAfterMs); IPRep.note('l'); Bus.emit('limited', { path, ip: true, retryAfterMs: NetPolicy.retryAfter(res.headers?.get('retry-after')) }); throw error;
    }
    throw Object.assign(new HttpError(res.status, 'Brana 返回了网页或验证页面，请用网页登录检查', res), { responseFormat: true });
  }
  if (res.status === 401 && !opt.noRelogin && await Auth.relogin()) return api(path, { ...opt, noRelogin: true });
  if (res.status === 409 && !isCost && !opt._retried409 && typeof Pin !== 'undefined' && typeof Pin.drop === 'function') {
    try { Pin.drop(); } catch {}
    return api(path, { ...opt, _retried409: true });
  }
  if (!res.ok) {
    let msg = text; try { const j = JSON.parse(text); msg = j.error?.message || j.error || j.message || text; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch {}
    const error = new HttpError(res.status, msg, res); fault(error);
    // 429 / 404 不触发自动换 IP（防止把用户手动选择的未限流 IP 误切换走）；仅网关/传输故障才交由 AutoRoute
    const ipLimited = !isCost && res.status === 429 && (read || /^\/(?:api|nextjs-api)\//.test(path));
    if (ipLimited) error.ipLimited = true;
    const prevRl = ReadLimit.until; if (res.status === 429 && (read || /^\/api\/chat\//.test(path))) ReadLimit.hit(error.retryAfterMs); if (!read) ReadLimit.until = prevRl; if (isCost || /^\/api\/me\/pulse\b/i.test(path)) ReadLimit.until = prevRl;
    if (!isBg && !isCost && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [408, 502, 503, 504, 520, 522, 524].includes(res.status)) void AutoRoute.onErrorSwitch(error, path);
    throw error;
  }
  let value; try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  if (path === '/api/me') NetPolicy.sessionValue(value);
  // Only completed first-party API responses count; static pages and IP probes do not.
  if (/^\/(?:api|nextjs-api)\//.test(path) && (value === null || typeof value === 'object')) {
    NetHealth.good('api');
    if (isChatRead) { if (!opt.bg && ReadLimit.until > 0) ReadLimit.until = 0; }
  }
  // A slow but successful response is proof the route works: never a reason to switch node/IP.
  return value;
}

// ---------- 登录：邮箱 + 密码直接调用 Brana 登录接口（与 Brana 登录页同一接口，不打开网页）----------
// 成功后服务端用 Set-Cookie 写入 arena-auth-prod-v1，落在本账号自己的会话分区里，并经过本账号的代理（IP）。
const Auth = {
  busy: null, lastErr: '',
  async post(path, body, opt) {
    const kind = path === '/nextjs-api/sign-up/magic-link' ? 'signup' : path === '/nextjs-api/reset-password/request' ? 'forgot' : '';
    if (kind && (this.interactive || AuthEnv.operations)) throw Error('另一认证步骤正在进行，请等待结果');
    if (kind) await AuthEnv.begin(kind, body.email);
    if (/^\/nextjs-api\/(sign-up|sign-in|reset-password|resend-verification)/.test(path)) Pin.hold(true);
    this.poster ||= AuthFlow.createPoster({ fetch: rawFetch, deadline: (work, options) => NetPolicy.deadline(work, options), now, retryAfter: NetPolicy.retryAfter });
    AuthEnv.operations++; AuthEnv.paint();
    try { const result = await this.poster(path, body, kind ? { ...(opt || {}), mailRequest: true } : opt); if (kind) await AuthEnv.mail(kind); return result; }
    finally { AuthEnv.operations--; AuthEnv.paint(); }
  },
  async sendMagicLink(email, fullName = '', cc = undefined) {
    const inTestFixture = Boolean(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch));
    const payload = { email, fullName: fullName || email.split('@')[0], shouldLinkHistory: false, marketingConsent: false, ...(cc ? { registeredCountryCode: cc } : {}) };
    if (!inTestFixture && typeof Host !== 'undefined' && typeof Host.sendMagicLinkAccount === 'function' && UI?.host?.account?.id) {
      const token = await this.captcha('signup_magic_link');
      if (!token) {
        const r = await Host.sendMagicLinkAccount(UI.host.account.id, email, fullName);
        if (r?.ok) {
          await AuthEnv.mail('signup');
          return r.data || { success: true };
        }
      }
    }
    return this.post('/nextjs-api/sign-up/magic-link', payload, 'signup');
  },
  async signIn(email, password) {
    email = AuthFlow.email(email);
    if (!AuthFlow.EMAIL.test(email)) throw new Error('邮箱格式不正确');
    if (!password) throw new Error('请输入密码');
    if (this.interactive || AuthEnv.operations) throw Error('另一认证步骤正在进行，请等待结果');
    this.interactive = true; AuthEnv.operations++; AuthEnv.paint();
    try {
      const environment = await AuthEnv.begin('login', email);
      const signedIn = await this.post('/nextjs-api/sign-in/email', { email, password, shouldLinkHistory: false }, { requireSuccess: true });
      const inTestFixture = Boolean(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch));
      let me;
      try {
        me = await api('/api/me', { noRelogin: true, timeout: 10000, tries: 1 });
      } catch (e) {
        if (!inTestFixture && signedIn?.user?.id && signedIn?.user?.email && !(e instanceof HttpError && (e.status === 401 || e.status === 403))) {
          me = { user: signedIn.user };
        } else {
          throw AuthFlow.sessionError(e);
        }
      }
      const liveUser = AuthFlow.loginIdentity(me?.user, signedIn.user);
      if (liveUser && typeof liveUser === 'object') {
        liveUser.email = AuthFlow.pickRichEmail(email, liveUser.email);
      }
      return await AuthEnv.finish(liveUser, environment);
    } catch (e) { await AuthEnv.drop(); throw e; }   // 登录失败：放掉认证环境锁，下次直接重试
    finally { this.interactive = false; AuthEnv.operations--; AuthEnv.paint(); }
  },
  // 官方 Google 登录：和 arena.ai 登录页同一个入口 /nextjs-api/sign-in/google，在本账号自己的窗口里跳到 Google（走本账号的 IP），
  // 登录完 Brana 把登录状态写进本账号的会话，再跳回客户端界面（?glogin=1）。
  // 这个入口要求先有一个会话：没有就像官网一样先建访客会话（首页里的访客 ID + reCAPTCHA v3「sign_up」）。
  // 访客 ID：首页 HTML 里的 provisional userId；边下载边找，找到就停（不用等整页下完）
  async pidFetch() {
    const re = /userId\\?":\\?"([0-9a-f-]{36})\\?",\\?"userState\\?":\\?"provisional/;
    let r;
    try { r = await rawFetch('/', { credentials: 'same-origin', cache: 'no-store' }); } catch (e) { throw Object.assign(new Error('无法连接 Brana（检查 IP / 代理）：' + (e.message || e)), { net: true }); }
    if (r.body?.getReader) {
      const rd = r.body.getReader(), dec = new TextDecoder(); let t = '';
      try {
        for (;;) { const { done, value } = await rd.read(); if (done) break; t += dec.decode(value, { stream: true }); const m = t.match(re); if (m) { rd.cancel().catch(() => {}); return m[1]; } if (t.length > 2e6) break; }
      } catch (e) { const m = t.match(re); if (m) return m[1]; throw Object.assign(new Error('无法连接 Brana（检查 IP / 代理）：' + (e.message || e)), { net: true }); }
      return (t.match(re) || [])[1] || '';
    }
    return ((await r.text()).match(re) || [])[1] || '';
  },
  // 建访客会话（Google 登录入口要求先有会话）：首页访客 ID 和 reCAPTCHA「sign_up」令牌同时取（令牌可由添加账号的窗口提前备好）
  async anonSession(token, email = '') {
    await AuthEnv.begin('google', email);
    const tokP = token ? Promise.resolve(token) : Recaptcha.v3('sign_up'); tokP.catch(() => {});
    const pid = await this.pidFetch();
    if (!pid) return false;   // 页面里不是访客（已有会话）
    const tk = await tokP;
    let r;
    try { r = await rawFetch('/nextjs-api/sign-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recaptchaToken: tk, provisionalUserId: pid }), credentials: 'same-origin', cache: 'no-store' }); }
    catch (e) { throw Object.assign(new Error('无法连接 Brana（检查 IP / 代理）：' + (e.message || e)), { net: true }); }
    if (r.status === 429) throw new Error('建会话请求被限流（429），请等待 Retry-After / 退避后再试，保持节点和 IP');
    if (!r.ok) throw new Error('准备 Google 登录失败（HTTP ' + r.status + '），请稍后再试');
    this.anonAt = now();
    return true;
  },
  // Load only the CAPTCHA script. Never create a background visitor session before the user chooses a route.
  prewarm() { void Recaptcha.load().catch(() => {}); },
  // 提速：reCAPTCHA 一开始就并行加载；新建的 Google 账号（fresh）不再先问 /api/me；访客会话已提前建好就直接跳 Google
  async google(opt = {}) {
    if (this.interactive || AuthEnv.operations) throw Error('另一认证步骤正在进行，请等待结果');
    this.interactive = true; AuthEnv.operations++; AuthEnv.paint();
    try {
    const proposed = AuthFlow.email(opt.email || UI.authDraft(UI.host?.account || {}).email || '');
    const email = AuthFlow.EMAIL.test(proposed) ? proposed : '';
    await AuthEnv.begin('google', email);
    const log = t => { try { opt.log?.(t); } catch {} };
    Recaptcha.load().catch(() => {});
    if (this.warmP) { log('正在准备…'); await this.warmP; }
    let ready = now() - (this.anonAt || 0) < 10 * 60e3;
    if (!ready && !opt.fresh) {
      log('正在检查登录状态…');
      let me = null;
      try { me = await api('/api/me', { noRelogin: true, timeout: 12000 }); } catch (e) { if (e.status !== 401 && e.status !== 403) throw Object.assign(new Error('无法连接 Brana（检查 IP / 代理）：' + describe(e)), { net: true }); }
      ready = !!me?.user;
    }
    if (!ready) {
      log('正在建立访客会话（后台自动人机验证）…');
      const made = await this.anonSession(undefined, email); // Tokens are generated inside this account, never imported from another account's prewarm.
      if (!made) {
        const m2 = await api('/api/me', { noRelogin: true, timeout: 12000 }).catch(() => null);
        if (!m2?.user) throw new Error('Brana 没有返回访客 ID，请在当前账号原线路中完成网页验证，不自动换 IP');
      }
    }
    log('正在打开 Google…');
    Store.set('glogin', now());
    const q = new URLSearchParams({ shouldLinkHistory: 'false', returnTo: '/robots.txt?glogin=1' });
    const target = '/nextjs-api/sign-in/google?' + q;
    // 电脑版：内置浏览器会被 Google 拦下（「此浏览器或应用可能不安全」），改用本机的 Chrome / Edge 登录，完成后自动带回登录状态
    // 本流程自己加的「google」认证锁不挡本机浏览器（v0.13.117 起锁一直在，这里被挡掉，Google 登录就只剩内置窗口、被 Google 拦下）；其他认证任务的锁仍要求在内置窗口完成
    if (Host.gbStart && !opt.inWindow && (!AuthEnv.state?.locked || AuthEnv.state.kind === 'google')) {
      log('正在用本机浏览器打开 Google…');
      const r = await Host.gbStart({ path: target }).catch(e => ({ fallback: true, reason: String(e.message || e) }));
      if (r?.started) {
        const res = await this.gbWaitUi(r.name);
        if (res?.ok) { log('Google 登录完成，正在进入…'); location.href = res.back || '/robots.txt?glogin=1'; return; }
        if (res?.inWindow) { log('正在打开 Google…'); location.href = target; return; }
        if (res?.cancel) { Store.del?.('glogin'); throw Object.assign(new Error('已取消 Google 登录'), { cancelled: true }); }
        throw new Error(res?.error || res?.reason || 'Google 登录没有完成');
      }
      if (r?.error) throw new Error(r.error);
      log((r?.reason || '没有找到 Chrome / Edge') + '，改用内置窗口…');
    }
    if (AuthEnv.state?.locked && AuthEnv.state.kind !== 'google') log('为保持同一会话和指纹，在本账号内置窗口完成；若 Google 拒绝内嵌浏览器，请改用邮箱登录');
    location.href = target;
    } catch (e) { await AuthEnv.drop(['google']); throw e; }   // 取消 / 失败：放掉认证锁（去内置窗口的跳转不会走到这里，锁保留到回来复核）
    finally { this.interactive = false; AuthEnv.operations--; AuthEnv.paint(); }
  },
  // 等本机浏览器里的 Google 登录：客户端这边显示一个提示框（可取消 / 改用内置窗口）
  gbWaitUi(name) {
    return new Promise(res => {
      const back = h('div', { class: 'dlg-back gb-wait' }); let fin = false;
      const done = v => { if (fin) return; fin = true; back.remove(); res(v); };
      back.append(h('div', { class: 'dlg', role: 'dialog' },
        h('div', { class: 'dlg-t' }, '在 ' + (name || '浏览器') + ' 中完成 Google 登录'),
        h('div', { class: 'dlg-h' }, '已在本机的 ' + (name || '浏览器') + ' 打开 Google 登录窗口（独立资料夹；沿用账号的代理配置；外部浏览器与内置浏览器仍可能存在指纹差异）。\n登录完成后会自动回到客户端，浏览器窗口自动关闭。'),
        h('div', { class: 'dlg-row' },
          h('button', { class: 'btn ghost sm', title: '不用本机浏览器，在客户端窗口里打开 Google（可能被 Google 拦下）', onclick: () => { Host.gbCancel().catch(() => {}); done({ inWindow: true }); } }, '改用内置窗口'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn ghost', onclick: () => { Host.gbCancel().catch(() => {}); done({ cancel: true }); } }, '取消'))));
      document.body.append(back);
      Host.gbWait().then(done, e => done({ error: String(e.message || e) }));
    });
  },
  // 访客会话（没有邮箱）不算登录
  real(u) { return u && u.email ? u : null; },
  // 会话失效（401）时用本账号保存的密码自动重新登录；同一时间只登录一次，成功后 30 秒内不重复，失败后允许快速重试
  relogin(opt = {}) {
    if (AuthEnv.starting || AuthEnv.operations || this.interactive) return Promise.resolve(false);
    if (opt?.force && this.busy && !this._reloginInFlight) this.busy = null;
    return this.busy ||= (async () => {
      this._reloginInFlight = true;
      let ok = false;
      try {
        if (AuthEnv.state?.locked && (AuthEnv.state.kind === 'login' || AuthEnv.state.expired)) {
          await AuthEnv.drop(['login']).catch(() => {});
        }
        if (AuthEnv.state?.locked) return false;
        const c = await Host.getCred().catch(() => null); if (!c?.email || !c?.password) return false;
        const liveUser = await this.signIn(c.email, c.password); this.lastErr = '';
        ok = true;
        if (liveUser && typeof UI !== 'undefined') {
          window.__BRANA_BROWSE_MODE = false;
          UI.me = liveUser;
          UI.authed = true;
          try { Store.set('me:u', liveUser); } catch {}
          try { UI.renderAcct?.(); } catch {}
          try { Acct.report?.(); } catch {}
        }
        if (typeof History !== 'undefined' && History.err) {
          History.err = null;
          History.blocked = false;
        }
        Bus.emit('relogin'); return true;
      } catch (e) { this.lastErr = e.message || String(e); return false; }
      finally {
        this._reloginInFlight = false;
        setTimeout(() => { this.busy = null; }, ok ? 30000 : 2000);
      }
    })();
  },
};

// Pulse is the only account quota indicator. Dollar balance collection is retired.
const Pulse = {
  v: Store.get('pulse', null), usd: null, t: 0, lastAttempt: Store.get('pulse:lastAttempt',0), nextAt: Store.get('pulse:nextAt',0), failures:0,
  poll() {
    if(this.polling)return this.polling;
    if(now()<this.nextAt || (this.lastAttempt>0 && now()-this.lastAttempt<300000))return Promise.resolve(this.v);
    this.lastAttempt=now();Store.set('pulse:lastAttempt',this.lastAttempt);
    return this.polling=this.pollNow().finally(()=>{this.polling=null;});
  },
  async pollNow() {
    const owner = String(UI.host?.account?.id || UI.me?.id || UI.host?.account?.email || UI.me?.email || '');
    try {
      const j=await api('/api/me/pulse',{noRelogin:true});
      if (owner !== String(UI.host?.account?.id || UI.me?.id || UI.host?.account?.email || UI.me?.email || '')) return this.v;
      if(!Number.isFinite(j?.pulse))throw Error('Pulse 响应无效');
      this.v={pulse:Math.max(0,Math.min(100,j.pulse)),at:now(),account:owner};this.failures=0;this.nextAt=now()+300000;
      Store.set('pulse',this.v);Bus.emit('pulse');Acct.report();return this.v;
    }catch(error){
      this.failures++;this.nextAt=now()+([401,403,404,429].includes(error?.status)?1800000:Math.min(1800000,300000*2**Math.min(this.failures,3)));
    }finally{Store.set('pulse:nextAt',this.nextAt);}
  },
  noteUsd() {}, // Compatibility for old imported trace records; never persist/display balances.
  loop() {clearTimeout(this.t);this.t=setTimeout(()=>{if(!document.hidden)this.poll();this.loop();},300000+Math.floor(Math.random()*30000));},
};
Store.del('usd');
// 把本账号的状态（额度、IP、登录）报给宿主，账号切换面板里显示每个账号的最近记录
const Acct = {
  t: 0,
  report() {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      const q = Quota.chat, p = Pulse.v;
      const isCached = Boolean(UI.me?.cached);
      const isReal = Boolean(UI.me && !isCached && !UI.me.browseOnly && !(typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE));
      Host.noteAccount({
        email: UI.me?.email && !UI.me?.browseOnly ? (UI.host?.account?.email || UI.me.email) : undefined,
        ...(isCached ? {} : { loggedIn: isReal }),
        ip: IP.ip || undefined, loc: IP.loc || undefined,
        quota: { pulse: p?.pulse ?? null, pulseAt: p?.at || null, usd: null, allowance: null, usdAt: null, chatRemaining: q?.remaining ?? null, chatLimit: q?.limit ?? null, blockedUntil: Quota.blockedUntil() || null, at: now() },
      })?.catch?.(() => {});
    }, 800);
  },
};

// ---------- reCAPTCHA ----------
const Recaptcha = (() => {
  let loading = null;
  // 人机验证（v2 勾选框 / 图片题）的界面语言：设置里选；空 = 跟随系统（不带 hl，和以前完全一样）。只改验证组件的显示语言，不改浏览器语言 / 时区 / 指纹
  const LANGS = [['', '跟随系统'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский']];
  const hl = () => { const v = String(Prefs.rcLang === undefined ? 'zh-CN' : (Prefs.rcLang || 'zh-CN')); return LANGS.some(x => x[0] === v) ? v : 'zh-CN'; };
  // hl 是 reCAPTCHA 的渲染参数（和 sitekey / theme / size 同一张参数表），页面已加载过脚本也能逐个组件指定语言
  const load = () => loading ||= new Promise((res, rej) => {
    if (window.grecaptcha?.enterprise?.execute) return res();
    const s = document.createElement('script');
    const h = hl(); s.src = `https://www.google.com/recaptcha/enterprise.js?render=${RC_V3}${h ? '&hl=' + encodeURIComponent(h) : ''}`; s.async = true;
    s.onload = () => { const t0 = now(); (function w() { if (window.grecaptcha?.enterprise?.ready) grecaptcha.enterprise.ready(res); else if (now() - t0 > 15000) rej(new Error('reCAPTCHA 加载超时')); else setTimeout(w, 50); })(); };
    s.onerror = () => { loading = null; rej(new Error('reCAPTCHA 加载失败（检查代理）')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.grecaptcha?.enterprise?.execute) { loading = null; s.remove(); rej(new Error('reCAPTCHA 加载超时（检查代理能否访问 google.com）')); } }, 20000);
  });
  // 加载失败时（多半是节点 + ProxyIP 连不上 Google）：让用户选「本机网络 / 备用代理」只给验证码域名改线路，保存后重试一次
  async function loadOrFallback() {
    try { return await load(); }
    catch (e) {
      loading = null;
      if (typeof CapRoute === 'undefined' || !await CapRoute.offer(e).catch(() => false)) throw e;
      await sleep(1500); return load();
    }
  }
  const RC_CO = 'aHR0cHM6Ly9hcmVuYS5haTo0NDM.';
  const RC_VER = '4EDjxXf4knsx6UBM1L2V6cv8';
  // 纯协议获取 Google reCAPTCHA Enterprise v3 令牌（anchor -> reload），无需加载 DOM 脚本，失败自动回退浏览器执行
  async function protoV3(action = 'sign_up') {
    try {
      if (typeof Host !== 'undefined' && typeof Host.recaptchaV3 === 'function') {
        const hr = await Host.recaptchaV3({ action, siteKey: RC_V3 });
        if (hr && hr.token) return hr.token;
      }
      if (typeof Host === 'undefined' || typeof Host.fetchText !== 'function') return null;
      const anchorUrl = `https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=${RC_V3}&co=${RC_CO}&hl=en&v=${RC_VER}&size=invisible`;
      const r1 = await Host.fetchText(anchorUrl, {
        headers: { Referer: 'https://arena.ai/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
      });
      const t1 = String(r1 && r1.text || '');
      const m1 = t1.match(/id="recaptcha-token"\s+value="([^"]+)"/) || t1.match(/value="([^"]+)"\s+id="recaptcha-token"/);
      if (!m1) return null;
      const anchorToken = m1[1];
      const reloadUrl = `https://www.google.com/recaptcha/enterprise/reload?k=${RC_V3}`;
      const payload = `v=${RC_VER}&reason=q&c=${encodeURIComponent(anchorToken)}&k=${RC_V3}&co=${RC_CO}&hl=en&size=invisible&sa=${encodeURIComponent(action)}`;
      const r2 = await Host.fetchText(reloadUrl, {
        method: 'POST',
        type: 'application/x-www-form-urlencoded',
        body: payload,
        headers: { Referer: anchorUrl, Origin: 'https://www.google.com' }
      });
      const t2 = String(r2 && r2.text || '');
      const m2 = t2.match(/"rresp"\s*,\s*"([^"]+)"/);
      return m2 ? m2[1] : null;
    } catch {
      return null;
    }
  }
  let v3Chain = Promise.resolve(), lastV3At = 0;
  function emitHumanTelemetryBurst() {
    try {
      if (typeof document === 'undefined' || typeof window === 'undefined' || typeof Event !== 'function') return;
      const w = Math.max(360, window.innerWidth || 1280), h = Math.max(360, window.innerHeight || 800);
      let x = Math.floor(w * (0.25 + Math.random() * 0.5)), y = Math.floor(h * (0.25 + Math.random() * 0.5));
      const steps = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < steps; i++) {
        x = Math.max(12, Math.min(w - 12, x + Math.floor((Math.random() - 0.48) * 42)));
        y = Math.max(12, Math.min(h - 12, y + Math.floor((Math.random() - 0.48) * 34)));
        if (typeof MouseEvent === 'function') {
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x + 20, screenY: y + 60 }));
        }
        if (typeof PointerEvent === 'function') {
          document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse' }));
        }
      }
      if (typeof KeyboardEvent === 'function') {
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
        document.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
      }
    } catch {}
  }
  async function v3(action = 'chat_submit') {
    // 防风控节流队列：限制相邻两次 v3 调用间隔 >= 1.1~1.6s。
    // 重要：发消息/建对话（chat_submit / agentic_chat_submit / chat_retry / chat_rerun）必须优先走真实浏览器 grecaptcha.enterprise.execute（携带完整 DOM bg 遥测，0.9 高分）；
    // 纯协议 protoV3（reason=q 无 bg 遥测）在发消息接口会被评为 0.1 分机器人并触发无限人机锁死，仅用于 sign_up 或 DOM 加载失败时兜底。
    const prev = v3Chain;
    let release;
    v3Chain = new Promise(r => { release = r; });
    try {
      await prev.catch(() => {});
      const gap = (1100 + Math.floor(Math.random() * 550)) - (now() - (lastV3At || 0));
      if (gap > 0) await sleep(gap);
      lastV3At = now();
      if (action === 'sign_up') {
        const pTok = await protoV3(action);
        if (pTok) return pTok;
      }
      try {
        await load();
        emitHumanTelemetryBurst();
        const domTok = await Promise.race([grecaptcha.enterprise.execute(RC_V3, { action }), sleep(9000).then(() => { throw new Error('reCAPTCHA 超时'); })]);
        if (domTok) return domTok;
      } catch (err) {
        // 切线后旧 anchor 连接可能断开：先重置并重载一次真实 DOM 脚本以保留完整 bg 遥测高分，避免退回 0.1 分的 protoV3
        try {
          loading = null;
          await load();
          emitHumanTelemetryBurst();
          const retryDomTok = await Promise.race([grecaptcha.enterprise.execute(RC_V3, { action }), sleep(7000).then(() => { throw new Error('reCAPTCHA 重试超时'); })]);
          if (retryDomTok) return retryDomTok;
        } catch {}
        const pTok = await protoV3(action).catch(() => null);
        if (pTok) return pTok;
        if (action === 'sign_up') throw err;
        return null;
      }
      return await protoV3(action);
    } finally {
      lastV3At = now();
      release();
    }
  }
  // 人工验证（v2 复选框）：只弹出官方组件，由用户自己完成。
  // - 弹窗放在最上层（抽卡面板 / 选账号页之上），手机上图片验证框自动缩放居中、完整放进屏幕
  // - 完成后即使回调没触发（手机 WebView 偶发），也会轮询令牌自动继续；随时可以「重新验证」或「取消」
  let v2Open = null, v2Cancel = null, stopV2Janitor = () => {};
  function v2() {
    if (v2Open) return v2Open;
    stopV2Janitor(); // An old completed widget may never clean a newer challenge.
    return v2Open = loadOrFallback().then(() => new Promise((res, rej) => {
      // Only new v2 layers belonging to this invocation may be fitted or removed.
      const beforeFrames = new Set(document.querySelectorAll('iframe')), beforeRoots = new Set(document.body.children);
      const ownFrames = new Set(), ownRoots = new Set(), detachedParents = new Map();
      const wrap = document.createElement('div'); wrap.className = 'modal-back rc-back'; wrap.dataset.noghost = '1';
      wrap.innerHTML = `<div class="modal small rc-modal"><div class="modal-h">人机验证</div><div class="modal-b"><p class="muted rc-why">Brana 判定需要人工验证：勾选下面的方框，按提示完成即可自动继续。</p><div class="rc-box"></div><p class="rc-st dim"></p></div><div class="modal-f"><button class="btn ghost" data-r>重新验证</button><button class="btn ghost" data-route title="验证图片 / 验证框加载不出来时：只给 Google 验证码换线路">换线路</button><span class="grow"></span><button class="btn ghost" data-x>取消</button></div></div>`;
      document.body.appendChild(wrap);
      const box = wrap.querySelector('.rc-box'), stEl = wrap.querySelector('.rc-st');
      try { if (typeof Gacha !== 'undefined' && Gacha.run?.needCaptcha) wrap.querySelector('.rc-why').textContent = '抽卡已暂停' + (Gacha.run.capAuto ? '（已自动冷却重试 ' + Gacha.run.capAuto + ' 次仍未通过）' : '') + '：勾选下面的方框完成官方验证，通过后自动从断点继续抽卡；不操作也会每 4 分钟自动再试。'; } catch {}
      let wid = null, fin = false, poll = 0, mo = null, raf = 0, generation = 0;
      // 图片验证框上方的常驻操作条：图片框会盖住下面弹窗的按钮，卡住时在这里「重新验证 / 取消」
      const bar = document.createElement('div'); bar.className = 'rc-bar'; bar.hidden = true;
      bar.innerHTML = '<span>人机验证 · 卡住不动时</span><button type="button" data-r2>重新验证</button><button type="button" data-route2>换线路</button><button type="button" data-x2>取消</button>';
      document.body.appendChild(bar);
      // 顺便显示图片是走本机网络还是走节点（走节点时图片常加载不出来 / 点验证没反应）
      Host.gnet?.()?.then?.(r => { const sp = bar.querySelector('span'); if (sp && r) sp.textContent = '人机验证 · ' + (r.on ? '本机网络' : '经节点') + ' · 卡住时'; })?.catch?.(() => {});
      const isV2Frame = f => {
        try { const u = new URL(f.src); return ['www.google.com', 'google.com', 'www.recaptcha.net', 'recaptcha.net'].includes(u.hostname) && /\/recaptcha\/(?:enterprise|api2)\/bframe$/.test(u.pathname) && u.searchParams.get('k') === RC_V2; } catch { return false; }
      };
      // Track the outermost new, exclusively owned ancestor, not merely the nearest high-z div.
      // Retain ownership even if Google detaches its iframe before invoking the completion callback.
      const trackFrame = (f, parent) => {
        if (beforeFrames.has(f) || !isV2Frame(f) || wrap.contains(f)) return null;
        ownFrames.add(f); let layer = null, root = f; const visited = new Set();
        for (let el = f.parentElement || parent || detachedParents.get(f); el && el !== document.body; el = el.parentElement || detachedParents.get(el)) {
          if (visited.has(el) || visited.size >= 32) break; visited.add(el);
          if (beforeRoots.has(el) || el === wrap || el === bar || el.contains(wrap)) break;
          if ([...el.querySelectorAll('iframe')].some(other => beforeFrames.has(other) || !isV2Frame(other))) break;
          root = el; if (!layer && +(el.style.zIndex || 0) >= 1e9) layer = el;
        }
        ownRoots.add(root); return layer;
      };
      const captureMutations = records => {
        // takeRecords also covers add/remove/callback occurring in the same JavaScript turn.
        for (const record of records) if (record.type === 'childList') for (const node of record.removedNodes) if (node.nodeType === 1) detachedParents.set(node, record.target);
        for (const record of records) if (record.type === 'childList') for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== 1) continue;
          const frames = node.tagName === 'IFRAME' ? [node] : [...node.querySelectorAll('iframe')];
          for (const frame of frames) trackFrame(frame, frame === node ? record.target : undefined);
        }
        detachedParents.clear();
      };
      const chal = () => {
        const fitLayers = new Set();
        for (const f of document.querySelectorAll('iframe[src*="/bframe"]')) { const layer = trackFrame(f); if (layer) fitLayers.add(layer); }
        return [...fitLayers];
      };
      const clearChal = () => {
        chal();
        for (const el of ownRoots) {
          if ([...el.querySelectorAll('iframe')].some(f => !ownFrames.has(f))) continue;
          el.remove();
        }
        for (const f of ownFrames) f.remove();
        const owned = { roots: [...ownRoots], frames: [...ownFrames] };
        ownRoots.clear(); ownFrames.clear(); detachedParents.clear(); return owned;
      };
      const done = (ok, value) => {
        if (fin) return;
        captureMutations(mo?.takeRecords() || []);
        fin = true; clearInterval(poll); mo?.disconnect(); cancelAnimationFrame(raf); raf = 0;
        removeEventListener('resize', fit); const owned = clearChal(); wrap.remove(); bar.remove();
        // Google may reattach the completed widget while its close animation finishes.
        // Only already-owned DOM references are removed, for a bounded interval.
        const cleanLate = () => {
          for (const root of owned.roots) if (root.isConnected && ![...root.querySelectorAll('iframe')].some(f => !owned.frames.includes(f))) root.remove();
          for (const frame of owned.frames) if (frame.isConnected) frame.remove();
        };
        let grace; const late = new MutationObserver(cleanLate);
        const stop = () => { late.disconnect(); clearTimeout(grace); if (stopV2Janitor === stop) stopV2Janitor = () => {}; };
        stopV2Janitor = stop; late.observe(document.body, { childList: true, subtree: true }); grace = setTimeout(stop, 1500);
        ok ? res(value) : rej(new Error('已取消验证'));
      };
      // 缩放用 CSS zoom，不用 transform：图片框被 transform 缩小后，Google 会判定它「被遮挡 / 变形」，最后点「验证」没反应、一直卡住。
      // 只在尺寸真的变了才写样式（以前每次都写，自己触发自己，每帧都在重算）
      // 手机上：图片框固定在顶部操作条下面（不再上下居中：Google 换题 / 显示「请重试」时框的高度会变，居中会整块往上跳），
      // 按屏幕宽高缩放、避开状态栏和底部手势条；不用 transform（带 transform 的祖先会让 Google 的点击 / 可见性判断出问题）。
      // 位置写在 CSS 变量里、样式表用 !important 生效：Google 自己改 top / left 也不会被顶走；尺寸位置没变就什么都不写
      function fit() {
        if (fin) return;
        const L = chal(), open = L.some(el => el.style.visibility !== 'hidden' && parseFloat(el.style.top || '0') > -1000);
        if (bar.hidden === open) bar.hidden = !open;
        if (!isMob() && innerWidth > 460 && innerHeight > 640) return;
        const rs = getComputedStyle(document.documentElement), saT = parseFloat(rs.getPropertyValue('--sa-top')) || 0, saB = parseFloat(rs.getPropertyValue('--sa-bottom')) || 0;
        const top0 = saT + 58, availW = innerWidth - 8, availH = innerHeight - top0 - saB - 8;
        for (const el of L) {
          const f = el.querySelector('iframe'); if (!f) continue;
          // Google 收起图片框（隐藏 / 移到屏幕外）：去掉我们的定位，别把它硬留在屏幕上
          if (el.style.visibility === 'hidden' || parseFloat(el.style.top || '0') < -1000) { if (el.classList.contains('rc-fit')) { el.classList.remove('rc-fit'); delete el.dataset.rck; } continue; }
          const w = (parseFloat(f.getAttribute('width') || f.style.width) || f.offsetWidth || 400) + 2, hh = (parseFloat(f.getAttribute('height') || f.style.height) || f.offsetHeight || 580) + 2;
          const z = Math.max(0.5, Math.min(1, availW / w, availH / hh)), lx = Math.max(4, (innerWidth - w * z) / 2);
          const key = z.toFixed(3) + '|' + Math.round(lx) + '|' + Math.round(top0);
          if (el.dataset.rck === key && el.classList.contains('rc-fit')) continue;
          el.dataset.rck = key; el.classList.add('rc-fit'); el.style.setProperty('--rcs', z.toFixed(3));
          // zoom 会不会连 left / top 一起缩放（新旧内核不同）：先按会缩放写，量一下不对再改
          el.style.setProperty('--rcl', (lx / z).toFixed(1) + 'px'); el.style.setProperty('--rct', (top0 / z).toFixed(1) + 'px');
          const r = el.getBoundingClientRect();
          if (Math.abs(r.left - lx) > 2) { el.style.setProperty('--rcl', lx.toFixed(1) + 'px'); el.style.setProperty('--rct', top0.toFixed(1) + 'px'); }
        }
      }
      function unfit() { for (const el of chal()) { el.classList.remove('rc-fit'); delete el.dataset.rck; for (const k of ['--rcs', '--rcl', '--rct']) el.style.removeProperty(k); } }
      mo = new MutationObserver(records => { if (fin) return; captureMutations(records); if (!wrap.isConnected) { done(false); return; } chal(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; fit(); }); });
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      addEventListener('resize', fit);
      const render = () => {
        if (fin) return;
        const gen = ++generation;
        box.replaceChildren(); const el = document.createElement('div'); box.appendChild(el);
        try {
          wid = grecaptcha.enterprise.render(el, { sitekey: RC_V2, ...(hl() ? { hl: hl() } : {}), theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', size: innerWidth < 340 ? 'compact' : 'normal',
            callback: t => { if (gen === generation && typeof t === 'string' && t) done(true, t); },
            'expired-callback': () => { if (fin || gen !== generation) return; stEl.textContent = '验证已过期，请重新勾选'; try { grecaptcha.enterprise.reset(wid); } catch {} },
            'error-callback': () => { if (fin || gen !== generation) return; stEl.textContent = '验证组件出错（多半是网络 / 代理），点「重新验证」再试'; } });
        } catch (e) { stEl.textContent = '验证组件加载失败：' + (e.message || e); }
        if (fin) { clearChal(); return; } fit();
      };
      wrap.querySelector('[data-x]').onclick = () => done(false);
      v2Cancel = () => done(false);   // 抽卡自动重试已通过：代码关掉还开着的验证框
      bar.querySelector('[data-x2]').onclick = () => done(false);
      const restart = () => {
        if (fin) return;
        captureMutations(mo?.takeRecords() || []); generation++; unfit();
        try { if (wid != null) grecaptcha.enterprise.reset(wid); } catch {}
        clearChal(); wid = null; bar.hidden = true; render();
        stEl.textContent = '已重置：请重新勾选上面的方框';
      };
      bar.querySelector('[data-r2]').onclick = restart;
      // 验证框 / 图片加载不出来：只给 Google 验证码换线路（本机网络 / 备用代理），保存后自动重置验证
      const reroute = async () => { if (fin) return; if (await CapRoute.offer().catch(() => false)) { await sleep(1200); restart(); } };
      wrap.querySelector('[data-route]').onclick = reroute; bar.querySelector('[data-route2]').onclick = reroute;
      wrap.querySelector('[data-r]').onclick = restart;
      render();
      // 兜底：回调没触发但已经拿到令牌 → 直接继续
      if (!fin) poll = setInterval(() => { if (fin) return; try { const t = wid != null && grecaptcha.enterprise.getResponse(wid); if (t) done(true, t); } catch {} if (!wrap.isConnected) done(false); }, 600);
    })).finally(() => { v2Open = null; v2Cancel = null; });
  }
  const v2Close = () => { try { v2Cancel?.(); } catch {} };
  const v2Showing = () => !!v2Open;
  // 预取：开始打字时就先拿好一个 v3 令牌（2 分钟内有效、只能用一次），按发送时直接用，省掉发送时等 reCAPTCHA 的几秒
  let cache = null, warming = null, routeEpoch = 0;
  const cachePool = {}, warmingPool = {};
  const curRouteTag = () => {
    try {
      const a = typeof UI !== 'undefined' ? UI.host?.account : null;
      const ip = (typeof IP !== 'undefined' && IP.ip) || a?.status?.ip || '';
      const px = a?.proxy || '';
      const pip = a?.proxyIp || a?.route?.proxyIp || '';
      const nid = a?.nodeId || '';
      return `${ip}|${px}|${pip}|${nid}`;
    } catch { return ''; }
  };
  function clearCache(action = '') {
    routeEpoch++;
    if (action) {
      delete cachePool[action];
      delete warmingPool[action];
      if (action === 'chat_submit') { cache = null; warming = null; }
      return;
    }
    for (const k of Object.keys(cachePool)) delete cachePool[k];
    for (const k of Object.keys(warmingPool)) delete warmingPool[k];
    cache = null;
    warming = null;
  }
  function warm(action = 'chat_submit') {
    const slot = cachePool[action];
    const rTag = curRouteTag();
    if (warmingPool[action] || (slot && now() - slot.at < 90000 && (!slot.rTag || !rTag || slot.rTag === rTag))) return;
    const ep = routeEpoch;
    const rTag0 = rTag;
    warmingPool[action] = v3(action).then(t => {
      if (t && ep === routeEpoch) {
        const rTagNow = curRouteTag() || rTag0;
        if (!rTag0 || !rTagNow || rTag0 === rTagNow) {
          cachePool[action] = { t, at: now(), action, rTag: rTagNow };
          if (action === 'chat_submit') cache = cachePool[action];
        }
      }
    }).catch(() => {}).finally(() => { if (ep === routeEpoch) { warmingPool[action] = null; if (action === 'chat_submit') warming = null; } });
    if (action === 'chat_submit') warming = warmingPool[action];
  }
  async function take(action = 'chat_submit') {
    const rTag = curRouteTag();
    const slot = cachePool[action];
    if (slot) {
      delete cachePool[action];
      if (action === 'chat_submit') cache = null;
      if (now() - slot.at < 100000 && (!slot.rTag || !rTag || slot.rTag === rTag)) {
        setTimeout(() => warm(action), 450);
        return slot.t;
      }
    }
    if (cache && now() - cache.at < 100000 && cache.action === action && (!cache.rTag || !rTag || cache.rTag === rTag)) {
      const t = cache.t;
      cache = null;
      return t;
    }
    cache = null;
    if (warmingPool[action]) {
      await Promise.race([warmingPool[action], sleep(8000)]);
      const ready = cachePool[action];
      const rTagAfter = curRouteTag();
      if (ready) {
        delete cachePool[action];
        if (action === 'chat_submit') cache = null;
        if (now() - ready.at < 100000 && (!ready.rTag || !rTagAfter || ready.rTag === rTagAfter)) {
          return ready.t;
        }
      }
    }
    const tok = await v3(action);
    setTimeout(() => warm(action), 650);
    return tok;
  }
  function resetSession() { clearCache(); lastV3At = 0; }
  return { load, protoV3, v3, v2, v2Close, v2Showing, warm, take, clearCache, resetSession, LANGS, hl };
})();

// ---------- 限流记录 ----------
const Quota = {
  chat: Store.get('quota:chat', null),
  note(res) {
    try {
      const limited = res.status === 429, success = res.status >= 200 && res.status < 300;
      if (!limited && !success) return;
      const h = k => res.headers.get(k), number = value => value != null && String(value).trim() && Number.isFinite(+value) && +value >= 0 ? +value : null;
      const lim = number(h('ratelimit-limit')), rem = number(h('ratelimit-remaining')), reset = number(h('ratelimit-reset')), ra = h('retry-after');
      if (success && lim == null && rem == null && reset == null && ra == null) { if (this.chat) this.clear(); return; }
      const at = now(), srv = Date.parse(h('date') || '') || at;
      const resetAt = reset == null ? null : at + Math.max(0, reset > 1e9 ? reset * 1000 - srv : reset * 1000);
      const retryMs = limited ? NetPolicy.retryAfter(ra, srv) : 0;
      const retryAt = retryMs > 0 ? at + retryMs : null;
      const hasDeadline = retryAt > at || (rem === 0 && resetAt > at);
      this.chat = { limit:lim, remaining:rem, reset:resetAt, retryAt, rateLimited:limited,
        backoffUntil:limited && !hasDeadline ? at + 30000 : null, ip:IP.ip || null, at };
      Store.set('quota:chat', this.chat); Bus.emit('quota'); Acct.report();
    } catch {}
  },
  // Only a rejected request establishes a limit. Headerless fallback is for automation only.
  blockedUntil(automatic = false) {
    const q = this.chat; if (!q || q.rateLimited !== true) return 0; const t = now();
    const until = Math.max(q.retryAt || 0, q.remaining === 0 ? q.reset || 0 : 0, automatic ? q.backoffUntil || 0 : 0);
    return until > t ? until : 0;
  },
  clear() { this.chat = null; Store.del('quota:chat'); Bus.emit('quota'); try { Acct.report(); } catch {} },
};

// ---------- Trigger（模型识别）----------
