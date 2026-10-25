// Authentication contracts shared by the UI and desktop host. Never persists secrets.
const AuthFlow = (() => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = value => String(value || '').trim();
  const emailKey = value => email(value).toLowerCase();
  const canonMailbox = value => {
    const raw = emailKey(value);
    const [local, domain] = raw.split('@');
    return domain ? local.replace(/\+.*$/, '').replace(/[.,\-_]/g, '') + '@' + domain : raw;
  };
  const isFixtureEmail = value => /@example\.invalid$/i.test(email(value));
  const sameMailbox = (a, b) => {
    const ka = emailKey(a), kb = emailKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    if (isFixtureEmail(a) || isFixtureEmail(b)) return false;
    const ca = canonMailbox(a), cb = canonMailbox(b);
    return Boolean(ca && ca === cb);
  };
  const pickRichEmail = (savedEmail, serverEmail) => {
    const s = email(savedEmail);
    const m = email(serverEmail);
    if (!s || !EMAIL.test(s)) return m || s;
    if (!m || !EMAIL.test(m)) return s;
    if (sameMailbox(s, m)) {
      const sPunct = (s.split('@')[0].match(/[.,\-_+]/g) || []).length;
      const mPunct = (m.split('@')[0].match(/[.,\-_+]/g) || []).length;
      return sPunct >= mPunct ? s : m;
    }
    return m;
  };
  const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
  const sameEmail = (a, b) => {
    if (!email(a) || !email(b)) return false;
    if (emailKey(a) === emailKey(b)) return true;
    if (isFixtureEmail(a) || isFixtureEmail(b)) return false;
    return sameMailbox(a, b);
  };
  function identity(user, expected) {
    if (!user || typeof user !== 'object' || Array.isArray(user) || !EMAIL.test(email(user.email)))
      throw fail('AUTH_SESSION_MISSING', '尚未确认登录会话，请完成网页登录或刷新账号状态；这不等于 Cookie 被拦截');
    if (user.emailConfirmed === false || user.userState === 'provisional')
      throw fail('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未完成验证，请先完成官方邮箱验证');
    if (!sameEmail(user.email, expected))
      throw fail('AUTH_IDENTITY_MISMATCH', '当前登录账号与本次输入的邮箱不一致，未保存账号信息；请检查账号或退出旧会话');
    return user;
  }
  // The sign-in service owns email canonicalization. Bind the fresh session to
  // its returned user ID, never to a client-side guess about dots or aliases.
  function loginIdentity(user, signedIn) {
    const live = identity(user, user?.email);
    if (signedIn) {
      if (signedIn.emailConfirmed === false || signedIn.userState === 'provisional')
        throw fail('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未完成验证，请先完成官方邮箱验证');
      if (typeof signedIn.id !== 'string' || !signedIn.id || live.id !== signedIn.id)
        throw fail('AUTH_IDENTITY_MISMATCH', '登录返回的账号与当前会话不一致，请刷新状态或在网页中重新登录');
    }
    return live;
  }
  function sessionError(error) {
    if (error?.code?.startsWith('AUTH_')) return error;
    const verification = error?.responseFormat || error?.status === 403;
    const message = verification ? '登录请求已提交，但账号状态需要网页验证，请完成后再刷新' :
      error?.status === 401 ? '登录请求已提交，但尚未确认登录会话，请完成网页登录后刷新' :
      '登录请求已提交，但账号状态核对失败' + (error?.status ? '（HTTP ' + error.status + '）' : '') + '；请先刷新状态，不要重复登录';
    return fail('AUTH_SESSION_CHECK_FAILED', message, { status: error?.status, sessionPending: true, responseFormat: !!verification, retryAfterMs: error?.retryAfterMs || 0 });
  }
  function signupIntent(value, account, at = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !account?.id || !EMAIL.test(email(value.email))) return null;
    if (!sameEmail(value.email, account.email)) return null;
    if (!Number.isFinite(value.at) || value.at > at + 60000 || at - value.at > 30 * 60000) return null;
    return { email: email(value.email), at: value.at }; // Drop all unrelated fields, especially secrets.
  }
  function verificationIntent(value, account, at = Date.now()) {
    if (!value || !account?.id || value.accountId !== account.id || !['signup', 'forgot'].includes(value.kind) || !EMAIL.test(email(value.email))) return null;
    if (!Number.isFinite(value.at) || value.at > at + 60000 || at - value.at > 30 * 60000) return null;
    return { accountId: account.id, kind: value.kind, email: email(value.email), at: value.at };
  }
  function authURL(value) {
    let u;
    try { u = new URL(String(value)); } catch { throw fail('AUTH_LINK_INVALID', '没有识别到有效的 HTTPS 验证链接'); }
    if (u.protocol !== 'https:' || !['arena.ai', 'auth.arena.ai'].includes(u.hostname.toLowerCase()) || u.username || u.password || (u.port && u.port !== '443'))
      throw fail('AUTH_LINK_ORIGIN', '仅支持 Brana 官方认证域名的 HTTPS 原始链接；请勿粘贴第三方跳转或取件网页地址');
    return u;
  }
  function createDrafts() {
    const drafts = new Map();
    return {
      get(account = {}, opt = {}) {
        const key = String(account.id || 'current');
        if (!drafts.has(key)) drafts.set(key, { email: email(account.email), password: '', name: '', remember: true, passwordSource: '', passwordEmail: '' });
        const d = drafts.get(key);
        if (typeof opt.email === 'string' && opt.email !== d.email) this.setEmail(d, opt.email);
        return d;
      },
      setEmail(d, value) {
        d.email = String(value || '');
        if (d.passwordSource === 'stored' && !sameEmail(d.email, d.passwordEmail)) { d.password = ''; d.passwordSource = ''; d.passwordEmail = ''; }
      },
      clear(account) { drafts.delete(String(account?.id || 'current')); },
    };
  }
  // One request, whole-response deadline, no implicit POST replay. Rate limits are honored per endpoint.
  function createPoster({ fetch, deadline, now = Date.now, retryAfter = () => 0 }) {
    const cooldown = new Map();
    return async function post(path, body, opt = {}) {
      const until = cooldown.get(path) || 0;
      if (until > now()) throw fail('AUTH_RATE_LIMIT', '操作过于频繁，请等待 ' + Math.ceil((until - now()) / 1000) + ' 秒后再试', { status: 429, retryAfterMs: until - now() });
      let response, text;
      try {
        await deadline(async signal => {
          response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal });
          // Failure status is already definitive; a broken body must not erase a 429/503 diagnosis.
          if (response.status === 429 || response.status >= 500) {
            try { response.body?.cancel?.()?.catch?.(() => {}); } catch {}
            text = ''; return;
          }
          text = await response.text();
        }, { timeout: opt.timeout ?? 30000, signal: opt.signal });
      } catch (e) {
        if (opt.signal?.aborted) throw fail('AUTH_CANCELLED', '已取消本次认证请求', { name: 'AbortError' });
        const rawErr = String(e?.message || e || '');
        if (e?.proxyFailed || /PROXY_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|SOCKET_NOT_CONNECTED|CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|SSL_PROTOCOL_ERROR|EMPTY_RESPONSE/i.test(rawErr)) {
          throw fail('AUTH_PROXY_FAILED', '当前 ProxyIP 线路连接失败（' + rawErr.replace(/^Error:s*/i, '').slice(0, 120) + '）', { proxyFailed: true, uncertain: true });
        }
        throw fail('AUTH_REQUEST_UNCONFIRMED', '认证请求结果尚未确认（网络异常或超时：' + rawErr.replace(/^Error:s*/i, '').slice(0, 80) + '）', { proxyFailed: true, uncertain: true });
      }
      const status = response.status;
      if (status === 429) {
        const wait = Math.max(1000, retryAfter(response.headers?.get?.('retry-after'), now()) || 60000);
        cooldown.set(path, now() + wait);
        throw fail('AUTH_RATE_LIMIT', '操作过于频繁，请等待 ' + Math.ceil(wait / 1000) + ' 秒后再试', { status, retryAfterMs: wait });
      }
      if (status >= 500) throw fail('AUTH_SERVICE_UNAVAILABLE', 'Brana 服务暂时不可用（HTTP ' + status + '），请稍后检查状态', { status });
      if (/text\/html/i.test(response.headers?.get?.('content-type') || '') || /^\s*</.test(text))
        throw fail('AUTH_VERIFICATION_REQUIRED', 'Brana 返回了网页或验证页面，不能确认本次操作成功；请使用网页登录完成验证', { status, responseFormat: true });
      let data;
      try { data = JSON.parse(text); } catch {}
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length)
        throw fail('AUTH_RESPONSE_INVALID', '认证响应格式无法识别，尚未确认成功；请检查邮箱或刷新状态，避免重复提交', { status, responseFormat: true });
      // 发送注册 / 重置邮件时，「需要验证」正是成功的回应（邮件已发出），不能当成失败
      if (opt.mailRequest && response.ok && data.success !== false && !data.error && (data.requiresVerification || data.user?.emailConfirmed === false)) { opt.onResponse?.(response); return data; }
      if (data.requiresVerification || data.user?.emailConfirmed === false)
        throw fail('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未验证，请先到邮箱完成官方验证', { status });
      if (!response.ok || data.success === false || data.error || (opt.requireSuccess && data.success !== true)) {
        const message = typeof data.error === 'string' ? data.error : String(data.error?.message || data.message || '');
        if (/invalid.*(credential|password)|incorrect|wrong/i.test(message)) throw fail('AUTH_CREDENTIALS', '邮箱或密码错误（这个邮箱如果是用邮件链接或 Google 注册的，可能还没有设置过密码）', { status, wrong: true });
        if (/already|exist|registered/i.test(message)) throw fail('AUTH_ACCOUNT_EXISTS', '这个邮箱已经注册过，请直接登录或找回密码', { status });
        if (/expired|invalid.*code|otp/i.test(message)) throw fail('AUTH_LINK_EXPIRED', '链接已失效，请重新发送邮件', { status });
        if (/captcha|verification|bot/i.test(message) || status === 403) throw fail('AUTH_VERIFICATION_REQUIRED', 'Brana 要求网页验证，请在当前账号窗口完成后重试', { status });
        throw fail('AUTH_REJECTED', message || '认证未成功（HTTP ' + status + '）', { status });
      }
      opt.onResponse?.(response);
      return data;
    };
  }
  return { EMAIL, email, canonMailbox, sameMailbox, pickRichEmail, sameEmail, identity, loginIdentity, sessionError, signupIntent, verificationIntent, authURL, createDrafts, createPoster };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AuthFlow;
