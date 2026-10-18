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
      if (!posters.has(ses)) posters.set(ses, AuthFlow.createPoster({
        fetch: (url, init) => ses.fetch(url, { ...init, credentials: 'include', headers: { ...init.headers, origin: 'https://arena.ai', referer: 'https://arena.ai/' } }),
        deadline, retryAfter: NetPolicy.retryAfter,
      }));
      let response;
      const signedIn = await posters.get(ses)('https://arena.ai/nextjs-api/sign-in/email', { email: expected, password: secret, shouldLinkHistory: false }, { requireSuccess: true, onResponse: r => { response = r; } });
      current();
      await syncCookies(ses, response); // Only the real server's Set-Cookie values, never a fabricated session.
      let data;
      try {
        const r = await read(ses, 'https://arena.ai/api/me', {}, 30000);
        if (!r.ok) throw Object.assign(Error('HTTP ' + r.status), { status: r.status });
        try { data = await r.json(); } catch { throw Object.assign(Error('账号状态响应格式异常'), { responseFormat: true }); }
        NetPolicy.sessionValue(data);
      } catch (e) { throw AuthFlow.sessionError(e); }
      const user = AuthFlow.loginIdentity(data.user, signedIn.user);
      current();
      await finish?.(a, user, ses, lease); current();
      const previous = { noAuto: a.noAuto, status: a.status };
      a.noAuto = false; a.status = { ...(a.status || {}), loggedIn: true, me: user.email, at: Date.now() };
      try { save(); } catch (e) { a.noAuto = previous.noAuto; a.status = previous.status; throw e; }
      navigate?.(a);
      return { ok: true, email: user.email, ip: a.status.ip || '' };
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
        url = next.href;
        continue;
      }
      await r.text().catch(() => {});
      return { final: url, status: r.status, hops };
    }
    return { final: url, hops, error: '跳转次数过多' };
  }

  async function warmAndProvisional(ses, ua, sync) {
    const re = /userId\\?":\\?"([0-9a-f-]{36})\\?",\\?"userState\\?":\\?"provisional/;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 18000);
    let pid = '';
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
      pid = (html.match(re) || [])[1] || '';
    } finally {
      clearTimeout(t);
    }
    const rcTok = await protoRecaptchaV3(ses, { action: 'sign_up', ua, syncCookies: sync }).catch(() => null);
    if (pid && rcTok) {
      const ctl2 = new AbortController(), t2 = setTimeout(() => ctl2.abort(), 18000);
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
      } finally {
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
      return d?.user || null;
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

    const ses = session(a);
    await prepare(a);
    const ua = a?.fp?.ua || DEFAULT_UA;

    // Bind a per-session MailToken fetcher that uses this account's session
    const fetchTextInSes = async (url, fOpt = {}) => {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
      try {
        const post = fOpt?.method === 'POST';
        const r = await ses.fetch(url, {
          method: post ? 'POST' : 'GET',
          body: post ? String(fOpt.body || '') : undefined,
          signal: ctl.signal,
          cache: 'no-store',
          headers: {
            'User-Agent': ua,
            Accept: 'application/json, text/plain, */*',
            ...(fOpt?.bearer ? { Authorization: 'Bearer ' + fOpt.bearer } : {}),
            ...(post ? { 'Content-Type': String(fOpt.type || 'application/json') } : {}),
            ...(fOpt?.headers || {}),
          },
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

    // Check exit IP & country
    let ip = a.status?.ip || '', loc = a.region || a.status?.loc || '';
    try {
      const tr = await read(ses, 'https://arena.ai/cdn-cgi/trace', {}, 12000);
      if (tr.ok) {
        const tt = await tr.text();
        ip = /^ip=([\da-fA-F:.]+)\s*$/m.exec(tt)?.[1] || ip;
        loc = /^loc=([A-Z]{2})\s*$/m.exec(tt)?.[1] || loc;
      }
    } catch {}

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

    // Step 1 & 2 & 3: Warm up session + pure-protocol reCAPTCHA Enterprise ('sign_up') + provisional session
    await warmAndProvisional(ses, ua, syncCookies);

    // Step 4: Send magic-link signup request (or login/reset if account already exists)
    const sentAt = Date.now();
    let needResetConfirm = false;
    try {
      let resp;
      await poster('https://arena.ai/nextjs-api/sign-up/magic-link', {
        email: expected,
        fullName: opt.fullName || randomNick(),
        shouldLinkHistory: false,
        marketingConsent: false,
        ...(/^[A-Z]{2}$/.test(loc) ? { registeredCountryCode: loc } : {}),
      }, { mailRequest: true, onResponse: r => { resp = r; } });
      if (resp && syncCookies) await syncCookies(ses, resp);
    } catch (err) {
      if (err?.code === 'AUTH_ACCOUNT_EXISTS') {
        // Already registered: try direct password login with fixed password first
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
          a.email = expected;
          a.name = a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : expected;
          setPassword?.(a, secret);
          a.noAuto = false;
          a.status = { ...(a.status || {}), loggedIn: true, me: verifiedUser.email, ip, loc, at: Date.now() };
          save();
          navigate?.(a);
          return { ok: true, email: verifiedUser.email, ip, loc, mode: 'login' };
        } catch (loginErr) {
          // Password not set or different: send password reset email
          let resetResp;
          await poster('https://arena.ai/nextjs-api/reset-password/request', {
            email: expected,
            shouldLinkHistory: false,
          }, { mailRequest: true, onResponse: r => { resetResp = r; } });
          if (resetResp && syncCookies) await syncCookies(ses, resetResp);
          needResetConfirm = true;
        }
      } else {
        throw err;
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
    let resetCode = (finalUrl?.searchParams.get('auth') === 'reset-password' ? finalUrl?.searchParams.get('code') : '') || (needResetConfirm ? mailHit.code : '');

    if (resetCode) {
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
        const resetSentAt = Date.now();
        let rResp;
        await poster('https://arena.ai/nextjs-api/reset-password/request', {
          email: expected,
          shouldLinkHistory: false,
        }, { mailRequest: true, onResponse: r => { rResp = r; } });
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
    a.email = expected;
    a.name = a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : expected;
    setPassword?.(a, secret);
    a.noAuto = false;
    a.status = { ...(a.status || {}), loggedIn: true, me: checked.email, ip, loc, at: Date.now() };
    save();
    navigate?.(a);
    return { ok: true, email: checked.email, ip, loc, mode: 'signup' };
  }

  return (id, opt) => {
    if (jobs.has(id)) return jobs.get(id);
    const job = run(id, opt).finally(() => jobs.delete(id));
    jobs.set(id, job);
    return job;
  };
}

module.exports = { createAccountSignIn, protoRecaptchaV3, createAccountTokenRegistrar };