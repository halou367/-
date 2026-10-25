// Background email login and pure-protocol token registration use the same response/identity contract as the visible form.
const AuthFlow = require('../ui/auth-flow');
const NetPolicy = require('../ui/net-policy');
const MailToken = require('../ui/mail-token');
const { fetchAccountResponse } = require('./account-operations');

const RC_V3_KEY = '6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0';
const RC_CO = 'aHR0cHM6Ly9hcmVuYS5haTo0NDM.';
const DEFAULT_RC_VER = '4EDjxXf4knsx6UBM1L2V6cv8';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// Pure-protocol Google reCAPTCHA Enterprise v3 token acquisition (anchor -> reload)
async function protoRecaptchaV3(ses, { siteKey = RC_V3_KEY, co = RC_CO, version = DEFAULT_RC_VER, action = 'sign_up', ua = '', syncCookies } = {}) {
  const fetchFn = typeof ses === 'function' ? ses : (u, o) => ses.fetch(u, o);
  const headersBase = ua ? { 'User-Agent': ua } : {};
  const anchorUrl = `https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=${siteKey}&co=${co}&hl=en&v=${version}&size=invisible`;
  const ctl1 = new AbortController(), t1 = setTimeout(() => ctl1.abort(), 12000);
  let anchorText = '';
  try {
    const anchorRes = await fetchFn(anchorUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: ctl1.signal,
      headers: {
        ...headersBase,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://arena.ai/',
      },
    });
    if (syncCookies && ses?.cookies) try { await syncCookies(ses, anchorRes); } catch {}
    anchorText = await anchorRes.text();
  } finally {
    clearTimeout(t1);
  }
  const anchorMatch = anchorText.match(/id="recaptcha-token"\s+value="([^"]+)"/) || anchorText.match(/value="([^"]+)"\s+id="recaptcha-token"/);
  if (!anchorMatch) return null;
  const anchorToken = anchorMatch[1];

  const reloadUrl = `https://www.google.com/recaptcha/enterprise/reload?k=${siteKey}`;
  const payload = `v=${version}&reason=q&c=${encodeURIComponent(anchorToken)}&k=${siteKey}&co=${co}&hl=en&size=invisible&sa=${encodeURIComponent(action)}`;
  const ctl2 = new AbortController(), t2 = setTimeout(() => ctl2.abort(), 12000);
  let reloadText = '';
  try {
    const reloadRes = await fetchFn(reloadUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: ctl2.signal,
      headers: {
        ...headersBase,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: anchorUrl,
        Origin: 'https://www.google.com',
      },
      body: payload,
    });
    if (syncCookies && ses?.cookies) try { await syncCookies(ses, reloadRes); } catch {}
    reloadText = await reloadRes.text();
  } finally {
    clearTimeout(t2);
  }
  const rrespMatch = reloadText.match(/"rresp"\s*,\s*"([^"]+)"/);
  return rrespMatch ? rrespMatch[1] : null;
}

function createAccountSignIn({ find, password, session, prepare, syncCookies, save, navigate, begin, finish, release, read = fetchAccountResponse, deadline = NetPolicy.deadline }) {
  const jobs = new Map(), posters = new WeakMap();
  const routeKey = a => JSON.stringify([a.proxy || '', a.proxyIp || '', a.nodeId || '', a.region || '']);
  async function run(id) {
    const a = find(id);
    if (!a) throw Error('账号不存在');
    const expected = AuthFlow.email(a.email), secret = password(a);
    if (!AuthFlow.EMAIL.test(expected)) throw Error('没有填写有效邮箱');
    if (!secret) throw Error('没有保存密码');
    const route = routeKey(a);
    const current = () => {
      if (find(id) !== a || !AuthFlow.sameEmail(a.email, expected) || routeKey(a) !== route || password(a) !== secret)
        throw Error('认证期间账号或线路配置已变化，未确认登录；请检查后重试');
    };
    const ses = session(a);
    await prepare(a); current();
    let lease;
    try {
      lease = await begin?.(a, expected, ses); current();
      const ua = a.fp?.ua || DEFAULT_UA;
      const lang = a.fp?.lang || 'en-US,en;q=0.9';
      if (!posters.has(ses)) posters.set(ses, AuthFlow.createPoster({
        fetch: (url, init) => ses.fetch(url, { ...init, credentials: 'include', headers: { ...init.headers, origin: 'https://arena.ai', referer: 'https://arena.ai/', 'user-agent': ua, 'accept-language': lang } }),
        deadline, retryAfter: NetPolicy.retryAfter,
      }));
      let response;
      const signedIn = await posters.get(ses)('https://arena.ai/nextjs-api/sign-in/email', { email: expected, password: secret, shouldLinkHistory: false }, { requireSuccess: true, onResponse: r => { response = r; } });
      current();
      await syncCookies(ses, response); // Only the real server's Set-Cookie values, never a fabricated session.
      let data;
      try {
        const r = await read(ses, 'https://arena.ai/api/me', { headers: { 'user-agent': ua, 'accept-language': lang } }, 15000);
        if (!r.ok) throw Object.assign(Error('HTTP ' + r.status), { status: r.status });
        try { data = await r.json(); } catch { throw Object.assign(Error('账号状态响应格式异常'), { responseFormat: true }); }
        NetPolicy.sessionValue(data);
      } catch (e) { throw AuthFlow.sessionError(e); }
      const user = AuthFlow.loginIdentity(data.user, signedIn.user);
      const richEmail = AuthFlow.pickRichEmail(expected || a.email || a.name, user.email);
      user.email = richEmail;
      current();
      await finish?.(a, user, ses, lease); current();
      const previous = { noAuto: a.noAuto, status: a.status, provisionalReg: a.provisionalReg };
      delete a.provisionalReg;
      a.noAuto = false; a.status = { ...(a.status || {}), loggedIn: true, me: richEmail, at: Date.now() };
      try { save(); } catch (e) { a.noAuto = previous.noAuto; a.status = previous.status; throw e; }
      navigate?.(a);
      return { ok: true, email: richEmail, ip: a.status.ip || '' };
    } catch (e) {
      // 密码登录没有「等邮件」这一步：失败就把认证环境锁放掉，不留一个必须手动取消的任务
      if (lease) { try { await release?.(a, lease); } catch {} }
      throw e;
    }
  }
  return id => {
    if (jobs.has(id)) return jobs.get(id);
    const job = run(id).finally(() => jobs.delete(id)); jobs.set(id, job); return job;
  };
}

function randomNick() {
  const F = ['Emma', 'Olivia', 'Ava', 'Mia', 'Lucas', 'Noah', 'Liam', 'Ethan', 'Grace', 'Chloe', 'Ella', 'Leo', 'Owen', 'Ryan', 'Nora', 'Ivy', 'Jack', 'Henry', 'Zoe', 'Lily', 'Max', 'Sam', 'Ruby', 'Adam', 'Clara', 'Daniel', 'Hannah', 'Isaac', 'Julia', 'Kevin'];
  const L = 'ABCDEFGHJKLMNPRSTW';
  return F[Math.floor(Math.random() * F.length)] + ' ' + L[Math.floor(Math.random() * L.length)] + '.';
}

// Pure-protocol Token Registration & Login (warm-up -> pure-protocol reCAPTCHA -> magic-link/reset -> mail API code/link -> set fixed password -> save & add to login cards)
function createAccountTokenRegistrar({ find, password, setPassword, session, prepare, syncCookies, save, navigate, read = fetchAccountResponse, deadline = NetPolicy.deadline }) {
  const jobs = new Map();

  async function followVerifyLink(ses, rawUrl, sync) {
    let url = AuthFlow.authURL(String(rawUrl)).href;
    const hops = [];
    for (let i = 0; i < 8; i++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
      let r;
      try {
        r = await ses.fetch(url, {
          credentials: 'include',
          redirect: 'manual',
          cache: 'no-store',
          signal: ctl.signal,
          headers: { Referer: 'https://arena.ai/' },
        });
      } finally {
        clearTimeout(t);
      }
      if (sync) try { await sync(ses, r); } catch {}
      hops.push(r.status);
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, url);
        if (next.protocol !== 'https:' || !['arena.ai', 'auth.arena.ai'].includes(next.hostname.toLowerCase())) {
          return { final: next.href, hops, external: true };
        }
        if ((/\/auth\/set-password/i.test(next.pathname) && next.searchParams.get('token')) || (next.searchParams.get('auth') === 'reset-password' && next.searchParams.get('code'))) {
          return { final: next.href, status: r.status, hops };
        }
        url = next.href;
        continue;
      }
      try {
        if (r.body?.cancel) await r.body.cancel();
        else await Promise.race([r.text(), new Promise(res => setTimeout(res, 1500))]);
      } catch {}
      return { final: url, status: r.status, hops };
    }
    return { final: url, hops, error: '跳转次数过多' };
  }

  async function warmAndProvisional(ses, ua, sync) {
    const re = /userId\\?":\\?"([0-9a-f-]{36})\\?",\\?"userState\\?":\\?"provisional/;
    const fetchHome = (async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6500);
      try {
        const r = await ses.fetch('https://arena.ai/', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: ctl.signal,
          headers: {
            ...(ua ? { 'User-Agent': ua } : {}),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        if (sync) try { await sync(ses, r); } catch {}
        const html = await r.text();
        return (html.match(re) || [])[1] || '';
      } catch {
        return '';
      } finally {
        clearTimeout(t);
      }
    })();
    const [pid, rcTok] = await Promise.all([
      fetchHome,
      protoRecaptchaV3(ses, { action: 'sign_up', ua, syncCookies: sync }).catch(() => null),
    ]);
    if (pid && rcTok) {
      const ctl2 = new AbortController(), t2 = setTimeout(() => ctl2.abort(), 9000);
      try {
        const r2 = await ses.fetch('https://arena.ai/nextjs-api/sign-up', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          signal: ctl2.signal,
          headers: {
            ...(ua ? { 'User-Agent': ua } : {}),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Origin: 'https://arena.ai',
            Referer: 'https://arena.ai/',
          },
          body: JSON.stringify({ recaptchaToken: rcTok, provisionalUserId: pid }),
        });
        if (sync) try { await sync(ses, r2); } catch {}
        await r2.text().catch(() => {});
      } catch {} finally {
        clearTimeout(t2);
      }
    }
    return { pid, rcTok: !!rcTok };
  }

  async function readMeUser(ses) {
    try {
      const r = await read(ses, 'https://arena.ai/api/me', {}, 20000);
      if (!r.ok) return null;
      const d = await r.json().catch(() => null);
      const u = d?.user;
      if (!u || !u.email || u.emailConfirmed === false || u.userState === 'provisional') return null;
      return u;
    } catch {
      return null;
    }
  }

  async function run(id, opt = {}) {
    const a = find(id);
    if (!a) throw Error('账号不存在');
    let tok = opt.tok || null;
    if (!tok && opt.tokenLine) tok = MailToken.parse(opt.tokenLine);
    if (!tok && opt.apiUrl) tok = MailToken.parse((opt.email || a.email) + '----' + opt.apiUrl);
    if (!tok) throw Object.assign(Error('缺少收件令牌或收件地址'), { mailFailed: true, tokenInvalid: true });

    const expected = AuthFlow.email(tok.email || opt.email || a.email);
    const secret = String(opt.password || password?.(a) || '').trim();
    if (!AuthFlow.EMAIL.test(expected)) throw Error('没有填写有效邮箱');
    if (!secret || secret.length < 8) throw Error('请先设置合规的固定密码（至少 8 位，含大小写字母与符号）');

    const rawSes = session(a);
    await prepare(a);
    const ua = a?.fp?.ua || DEFAULT_UA;
    const isProxyErrMsg = msg => /PROXY_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|SOCKET_NOT_CONNECTED|CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|SSL_PROTOCOL_ERROR|EMPTY_RESPONSE/i.test(String(msg || ''));
    const sesFetch = async (url, init = {}) => {
      try {
        return await rawSes.fetch(url, init);
      } catch (err) {
        const em = String(err?.message || err || '');
        if (/PROXY_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|SOCKET_NOT_CONNECTED|CONNECTION_REFUSED/i.test(em)) {
          await prepare(a, { force: true }).catch(() => {});
          try {
            return await rawSes.fetch(url, init);
          } catch (err2) {
            if (isProxyErrMsg(err2?.message || err2)) err2.proxyFailed = true;
            throw err2;
          }
        }
        if (isProxyErrMsg(em)) err.proxyFailed = true;
        throw err;
      }
    };
    const ses = new Proxy(rawSes, {
      get(target, prop) {
        if (prop === 'fetch') return sesFetch;
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });

    // Bind a per-session MailToken fetcher: mail gateway APIs go direct first (faster & avoids ProxyIP connection resets), falling back to ses.fetch
    const fetchTextInSes = async (url, fOpt = {}) => {
      const post = fOpt?.method === 'POST';
      const reqHeaders = {
        'User-Agent': ua,
        Accept: 'application/json, text/plain, */*',
        ...(fOpt?.bearer ? { Authorization: 'Bearer ' + fOpt.bearer } : {}),
        ...(post ? { 'Content-Type': String(fOpt.type || 'application/json') } : {}),
        ...(fOpt?.headers || {}),
      };
      const tryOnce = async (fetcher, tmMs) => {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), tmMs);
        try {
          const r = await fetcher(url, {
            method: post ? 'POST' : 'GET',
            body: post ? String(fOpt.body || '') : undefined,
            signal: ctl.signal,
            cache: 'no-store',
            headers: reqHeaders,
          });
          const text = await r.text();
          if (!r.ok) return { error: 'HTTP ' + r.status, body: text.slice(0, 4000), text: text.slice(0, 4000) };
          return { text: text.slice(0, 4e6), contentType: r.headers.get('content-type') || '' };
        } catch (err) {
          return { error: err?.name === 'AbortError' ? '超时' : String(err?.message || err) };
        } finally {
          clearTimeout(tm);
        }
      };
      const rSes = await tryOnce((u, o) => ses.fetch(u, o), 10000);
      if (rSes && !rSes.error) return rSes;
      if (typeof globalThis.fetch === 'function' && /ERR_PROXY|ERR_SOCKS|ERR_CONNECTION|ERR_TUNNEL|fetch failed|超时/i.test(String(rSes?.error || '')) && !/127\.0\.0\.1:(?:1|9|10)\b/.test(String(url))) {
        const rDirect = await tryOnce((u, o) => globalThis.fetch(u, o), 8000);
        if (rDirect && !rDirect.error) return rDirect;
      }
      return rSes;
    };

    // Check exit IP & country (and fail fast if ProxyIP cannot reach Arena)
    const isFixtureAcct = /@example\.invalid$/i.test(expected) || /127\.0\.0\.1:(?:1|9|10)\b/.test(String(a?.proxy || ''));
    if (!isFixtureAcct && a.tunErr) {
      throw Object.assign(new Error('当前代理隧道启动失败（' + a.tunErr + '）'), { proxyFailed: true });
    }
    let ip = a.status?.ip || '', loc = a.region || a.status?.loc || '';
    let traceOk = false, traceErrMsg = '';
    for (let tTry = 0; tTry < 2 && !traceOk; tTry++) {
      try {
        if (tTry > 0) await prepare(a, { force: true }).catch(() => {});
        const tr = await read(ses, 'https://arena.ai/cdn-cgi/trace', {}, 8000);
        if (tr.ok) {
          const tt = await tr.text();
          const gotIp = /^ip=([\da-fA-F:.]+)\s*$/m.exec(tt)?.[1] || '';
          const gotLoc = /^loc=([A-Z]{2})\s*$/m.exec(tt)?.[1] || '';
          if (gotIp) {
            ip = gotIp;
            loc = gotLoc || loc;
            traceOk = true;
          }
        } else {
          traceErrMsg = 'HTTP ' + tr.status;
        }
      } catch (tErr) {
        traceErrMsg = String(tErr?.message || tErr || '连接超时');
      }
    }
    if (!isFixtureAcct && !traceOk) {
      throw Object.assign(
        new Error('ProxyIP (' + (a.proxyIp || '当前出口') + ') 无法连通 Arena（' + (traceErrMsg || '连接失败') + '）'),
        { proxyFailed: true }
      );
    }

    // Validate mail token & snapshot pre-existing links before sending mail
    const prevHost = globalThis.Host;
    const scopedMailCall = async fn => {
      const oldFetch = globalThis.Host?.fetchText;
      globalThis.Host = { ...(globalThis.Host || {}), fetchText: fetchTextInSes };
      try { return await fn(); }
      finally {
        if (prevHost === undefined) delete globalThis.Host;
        else if (oldFetch) globalThis.Host.fetchText = oldFetch;
      }
    };

    await scopedMailCall(async () => {
      await MailToken.access(tok);
      await MailToken.snapshot(tok);
    });

    const poster = AuthFlow.createPoster({
      fetch: (url, init) => ses.fetch(url, {
        ...init,
        credentials: 'include',
        headers: { ...(ua ? { 'User-Agent': ua } : {}), ...init.headers, origin: 'https://arena.ai', referer: 'https://arena.ai/' },
      }),
      deadline,
      retryAfter: NetPolicy.retryAfter,
    });

    const sleepMs = typeof opt.sleep === 'function' ? opt.sleep : (ms => new Promise(r => setTimeout(r, ms)));
    const extractCooldownMs = err => {
      const msg = String(err?.message || err || '');
      const m = /after\s+(\d+)\s*seconds?|等待\s*(\d+)\s*秒/i.exec(msg);
      if (m) return (Math.min(75, Math.max(1, Number(m[1] || m[2]))) + 2) * 1000;
      if (err?.code === 'AUTH_RATE_LIMIT' && err?.retryAfterMs > 0 && err.retryAfterMs <= 75000) return err.retryAfterMs + 1500;
      return 0;
    };
    const postMailWithCooldown = async (url, body, pOpt = {}) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await poster(url, body, pOpt);
        } catch (err) {
          const waitMs = extractCooldownMs(err);
          if (waitMs > 0 && attempt < 2) {
            try { opt.onStep?.('等待官方发信安全冷却（' + Math.ceil(waitMs / 1000) + ' 秒）后自动继续…'); } catch {}
            await sleepMs(waitMs);
            continue;
          }
          throw err;
        }
      }
    };

    // Step 1 & 2 & 3: Warm up session + pure-protocol reCAPTCHA Enterprise ('sign_up') + provisional session
    await warmAndProvisional(ses, ua, syncCookies);

    // Step 4: Send magic-link signup request (or login/reset if account already exists)
    let sentAt = Date.now();
    let needResetConfirm = false;
    try {
      let resp;
      await postMailWithCooldown('https://arena.ai/nextjs-api/sign-up/magic-link', {
        email: expected,
        fullName: opt.fullName || randomNick(),
        shouldLinkHistory: false,
        marketingConsent: false,
        ...(/^[A-Z]{2}$/.test(loc) ? { registeredCountryCode: loc } : {}),
      }, { mailRequest: true, onResponse: r => { resp = r; } });
      if (resp && syncCookies) await syncCookies(ses, resp);
    } catch (err) {
      // Try direct password login with fixed password first (e.g. if already registered or rate-limited right after password setup)
      try {
        let loginResp;
        const signedIn = await poster('https://arena.ai/nextjs-api/sign-in/email', {
          email: expected,
          password: secret,
          shouldLinkHistory: false,
        }, { requireSuccess: true, onResponse: r => { loginResp = r; } });
        if (loginResp && syncCookies) await syncCookies(ses, loginResp);
        const meNow = await readMeUser(ses);
        const verifiedUser = AuthFlow.loginIdentity(meNow || signedIn.user, signedIn.user);
        const richEmail = AuthFlow.pickRichEmail(expected || a.email || a.name, verifiedUser.email);
        a.email = richEmail;
        a.name = a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : richEmail;
        setPassword?.(a, secret);
        delete a.provisionalReg;
        a.noAuto = false;
        a.status = { ...(a.status || {}), loggedIn: true, me: richEmail, ip, loc, at: Date.now() };
        save();
        navigate?.(a);
        return { ok: true, email: richEmail, ip, loc, mode: 'login' };
      } catch (loginErr) {
        if (err?.code === 'AUTH_ACCOUNT_EXISTS') {
          // Password not set or different: snapshot existing mail & send password reset email
          await scopedMailCall(() => MailToken.snapshot(tok)).catch(() => {});
          sentAt = Date.now();
          let resetResp;
          await postMailWithCooldown('https://arena.ai/nextjs-api/reset-password/request', {
            email: expected,
            shouldLinkHistory: false,
          }, { mailRequest: true, onResponse: r => { resetResp = r; } });
          if (resetResp && syncCookies) await syncCookies(ses, resetResp);
          needResetConfirm = true;
        } else {
          throw err;
        }
      }
    }

    // Step 5: Poll Mail API for verification link / code
    const mailHit = await scopedMailCall(() => MailToken.waitLink(tok, {
      since: sentAt,
      timeout: opt.mailTimeoutMs || 110000,
      pollMs: opt.pollMs || 3500,
      kind: needResetConfirm ? 'reset' : '',
    }));

    // Step 6: Follow verification link in account's session
    const hopRes = await followVerifyLink(ses, mailHit.link, syncCookies);
    let finalUrl = null;
    try { finalUrl = hopRes?.final ? new URL(hopRes.final) : null; } catch {}
    let linkUrl = null;
    try { linkUrl = mailHit?.link ? new URL(mailHit.link) : null; } catch {}
    const setPwToken =
      ((/\/auth\/set-password/i.test(finalUrl?.pathname || '') && finalUrl?.searchParams.get('token')) ||
       (/\/auth\/set-password/i.test(linkUrl?.pathname || '') && linkUrl?.searchParams.get('token')) ||
       '');
    let resetCode = (finalUrl?.searchParams.get('auth') === 'reset-password' ? finalUrl?.searchParams.get('code') : '') || (needResetConfirm ? mailHit.code : '');

    if (setPwToken) {
      let spResp;
      await poster('https://arena.ai/nextjs-api/auth/set-password', {
        password: secret,
        token: setPwToken,
      }, { onResponse: r => { spResp = r; } });
      if (spResp && syncCookies) await syncCookies(ses, spResp);
    } else if (resetCode) {
      let cResp;
      await poster('https://arena.ai/nextjs-api/reset-password/confirm', {
        password: secret,
        code: resetCode,
        shouldLinkHistory: false,
      }, { onResponse: r => { cResp = r; } });
      if (cResp && syncCookies) await syncCookies(ses, cResp);
    } else {
      // Signup magic link logged in directly; now set the fixed password via protocol
      let directOk = false;
      try {
        const dr = await ses.fetch('https://arena.ai/nextjs-api/account/password', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { ...(ua ? { 'User-Agent': ua } : {}), 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://arena.ai', Referer: 'https://arena.ai/' },
          body: JSON.stringify({ password: secret, newPassword: secret }),
        });
        if (dr.ok) {
          if (syncCookies) await syncCookies(ses, dr);
          directOk = true;
        }
      } catch {}

      if (!directOk) {
        try {
          await scopedMailCall(() => MailToken.snapshot(tok)).catch(() => {});
          let resetSentAt = Date.now();
          let rResp;
          await postMailWithCooldown('https://arena.ai/nextjs-api/reset-password/request', {
            email: expected,
            shouldLinkHistory: false,
          }, { mailRequest: true, onResponse: r => { resetSentAt = Date.now() - 3000; rResp = r; } });
          if (rResp && syncCookies) await syncCookies(ses, rResp);

          const resetHit = await scopedMailCall(() => MailToken.waitLink(tok, {
            since: resetSentAt,
            timeout: opt.mailTimeoutMs || 110000,
            pollMs: opt.pollMs || 3500,
            kind: 'reset',
          }));
          const hop2 = await followVerifyLink(ses, resetHit.link, syncCookies);
          let f2 = null;
          try { f2 = hop2?.final ? new URL(hop2.final) : null; } catch {}
          const code2 = f2?.searchParams.get('code') || resetHit.code;
          if (!code2) throw Error('未能从重置密码链接中提取验证码');
          let cResp2;
          await poster('https://arena.ai/nextjs-api/reset-password/confirm', {
            password: secret,
            code: code2,
            shouldLinkHistory: false,
          }, { onResponse: r => { cResp2 = r; } });
          if (cResp2 && syncCookies) await syncCookies(ses, cResp2);
        } catch (pwSetupErr) {
          const alreadyLogged = await readMeUser(ses);
          if (!alreadyLogged || !AuthFlow.sameEmail(alreadyLogged.email, expected)) {
            throw pwSetupErr;
          }
        }
      }
    }

    // Step 7: Verify session via /api/me (or sign in with fixed password) and persist account + password
    let user = await readMeUser(ses);
    if (!user || !user.email || user.emailConfirmed === false) {
      let sResp;
      const signedIn = await poster('https://arena.ai/nextjs-api/sign-in/email', {
        email: expected,
        password: secret,
        shouldLinkHistory: false,
      }, { requireSuccess: true, onResponse: r => { sResp = r; } });
      if (sResp && syncCookies) await syncCookies(ses, sResp);
      user = (await readMeUser(ses)) || signedIn.user;
    }
    const checked = AuthFlow.identity(user, expected);
    const richEmail = AuthFlow.pickRichEmail(expected || a.email || a.name, checked.email);
    a.email = richEmail;
    a.name = a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : richEmail;
    setPassword?.(a, secret);
    delete a.provisionalReg;
    a.noAuto = false;
    a.status = { ...(a.status || {}), loggedIn: true, me: richEmail, ip, loc, at: Date.now() };
    save();
    navigate?.(a);
    return { ok: true, email: richEmail, ip, loc, mode: 'signup' };
  }

  return (id, opt) => {
    if (jobs.has(id)) return jobs.get(id);
    const job = run(id, opt).finally(() => jobs.delete(id));
    jobs.set(id, job);
    return job;
  };
}

function createAccountMagicLinkSender({ find, session, prepare }) {
  if (typeof find !== 'function' || typeof session !== 'function' || typeof prepare !== 'function') {
    throw TypeError('account magic-link sender requires find, session, and prepare');
  }
  const deadline = NetPolicy.deadline;
  const read = (ses, url, init = {}, timeout = 20000) => deadline(signal => ses.fetch(url, {
    ...init,
    credentials: 'include',
    redirect: init.redirect || 'manual',
    cache: 'no-store',
    signal,
    headers: { accept: 'application/json, text/plain, */*', referer: 'https://arena.ai/', ...(init.headers || {}) },
  }), { timeout });

  return async function sendMagicLinkAccount(id, rawEmail, fullName = '') {
    const a = find(id);
    if (!a) throw Error('目标账号不存在');
    const email = AuthFlow.email(rawEmail || a.email);
    if (!AuthFlow.EMAIL.test(email)) throw Error('请填写有效邮箱');
    const ses = session(a);
    await prepare(a);
    const ua = a.fp?.ua || DEFAULT_UA;
    const lang = a.fp?.lang || 'en-US,en;q=0.9';
    const baseHdr = { 'user-agent': ua, 'accept-language': lang };
    try {
      const wr = await read(ses, 'https://arena.ai/', { headers: { ...baseHdr, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }, 12000);
      const html = await wr.text().catch(() => '');
      const pid = (html.match(/userId\\?":\\?"([0-9a-f-]{36})\\?",\\?"userState\\?":\\?"provisional/) || [])[1] || '';
      if (pid) {
        const wTok = await protoRecaptchaV3(ses, { action: 'sign_up', ua }).catch(() => null);
        if (wTok) {
          await read(ses, 'https://arena.ai/nextjs-api/sign-up', {
            method: 'POST',
            headers: { ...baseHdr, 'content-type': 'application/json', origin: 'https://arena.ai' },
            body: JSON.stringify({ recaptchaToken: wTok, provisionalUserId: pid }),
          }, 12000).catch(() => {});
        }
      }
    } catch {}
    const rcToken = await protoRecaptchaV3(ses, { action: 'signup_magic_link', ua }).catch(() => null);
    const name = String(fullName || a.name || email.split('@')[0]).trim();
    const cc = /^[A-Z]{2}$/.test(a.region || '') ? a.region : undefined;
    const sendResp = await read(ses, 'https://arena.ai/nextjs-api/sign-up/magic-link', {
      method: 'POST',
      headers: {
        ...baseHdr,
        'content-type': 'application/json',
        origin: 'https://arena.ai',
        ...(rcToken ? { 'x-recaptcha-token': rcToken } : {}),
      },
      body: JSON.stringify({
        email,
        fullName: name,
        shouldLinkHistory: false,
        marketingConsent: false,
        ...(cc ? { registeredCountryCode: cc } : {}),
        ...(rcToken ? { recaptchaToken: rcToken, recaptchaAction: 'signup_magic_link' } : {}),
      }),
    }, 20000);
    const sendText = await sendResp.text().catch(() => '');
    let sendData = null;
    try { sendData = sendText ? JSON.parse(sendText) : null; } catch {}
    if (!sendResp.ok) {
      throw Error(sendData?.error || sendData?.message || ('注册邮件发送失败（HTTP ' + sendResp.status + '）'));
    }
    if (/^\s*</.test(sendText) || !sendData || (sendData.success !== true && sendData.ok !== true && !sendData.user && !sendData.emailSent)) {
      throw Error('注册接口返回了验证页或非确认响应，不能确认邮件已发出');
    }
    return { ok: true, id: a.id, email, data: sendData };
  };
}

module.exports = { createAccountSignIn, protoRecaptchaV3, createAccountTokenRegistrar, createAccountMagicLinkSender };