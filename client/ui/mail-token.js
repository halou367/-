// Mail verification connector: supports standard webhook JSON endpoints and OAuth2 IMAP/REST mail readers
const MailToken = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
  const URL_CID = '00000000-0000-4000-8000-000000000000';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const HTTP_URL = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
  const ERR_CODES = new Set(['no_code', 'mailbox_busy', 'no_recent_message', 'invalid_api_key', 'unauthorized', 'not_found', 'error', 'failed', 'timeout']);

  function isUrl(tok) {
    return !!(tok && (tok.kind === 'url' || HTTP_URL.test(String(tok.apiUrl || tok.refreshToken || '').trim())));
  }
  function urlOf(tok) {
    return String(tok?.apiUrl || (HTTP_URL.test(String(tok?.refreshToken || '')) ? tok.refreshToken : '') || '').trim();
  }
  function parseOneLine(rawLine) {
    const raw = String(rawLine || '').trim();
    if (!raw) throw Error('请粘贴邮箱令牌（邮箱----收件地址 或 邮箱----密码----clientId----刷新令牌）');
    let parts = raw.includes('----') ? raw.split('----').map(x => x.trim()) : raw.split(/[\t |]+/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 3 && HTTP_URL.test(parts[parts.length - 1])) {
      const email = parts[0], apiUrl = parts[parts.length - 1].split(/\s+/)[0];
      if (!EMAIL.test(email)) throw Error('令牌里的邮箱无效');
      let u; try { u = new URL(apiUrl); } catch { throw Error('令牌里的收件地址无效'); }
      if (!/^https?:$/i.test(u.protocol)) throw Error('令牌里的收件地址仅支持 HTTP/HTTPS');
      return {
        kind: 'url',
        email: email.toLowerCase(),
        password: parts.length === 3 ? parts[1] : '',
        apiUrl: u.href,
        clientId: URL_CID,
        refreshToken: u.href,
      };
    }
    if (parts.length < 4) throw Error('令牌格式应为：邮箱----收件地址(https://…) 或 邮箱----密码----clientId----刷新令牌');
    const [email, password, clientId] = parts, refreshToken = parts.slice(3).join('----').split(/\s+/)[0];
    if (!EMAIL.test(email)) throw Error('令牌里的邮箱无效');
    if (!UUID.test(clientId)) throw Error('令牌里的 clientId 无效');
    if (!refreshToken || refreshToken.length < 20) throw Error('刷新令牌无效');
    return { kind: 'oauth', email: email.toLowerCase(), password, clientId, refreshToken };
  }
  function parse(line) {
    const lines = String(line || '').trim().split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const target = lines.find(x => x.includes('----')) || lines[0] || '';
    return parseOneLine(target);
  }
  function isTokenLine(line) {
    try { return !!parseOneLine(line); } catch { return false; }
  }
  function parseBatch(text) {
    const rawLines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
    if (!rawLines.length) return { list: [], items: [], bad: [], errors: [], error: '请先粘贴令牌列表（每行一个：邮箱----收件地址）' };
    const byEmail = new Map(), bad = [];
    for (const raw of rawLines) {
      try {
        const tok = parseOneLine(raw);
        byEmail.set(tok.email, { ...tok, raw });
      } catch (e) {
        bad.push({ raw, error: String(e?.message || e) });
      }
    }
    const list = [...byEmail.values()];
    return {
      list,
      items: list,
      bad,
      errors: bad,
      error: list.length ? '' : ('没有识别到有效令牌：' + (bad[0]?.error || '格式应为 邮箱----https://…')),
    };
  }
  const mask = t => {
    if (!t) return '';
    if (isUrl(t)) {
      let host = '收件接口';
      try { host = new URL(urlOf(t)).host; } catch {}
      return t.email + ' · ' + host;
    }
    return t.email + ' · ' + String(t.clientId || '').slice(0, 8) + '…';
  };
  async function http(url, opt) {
    if (typeof Host === 'undefined' || !Host.fetchText) throw Error('当前环境不支持取件（需要客户端）');
    const r = await Host.fetchText(url, opt);
    if (r?.error) { let why = r.error; try { const j = JSON.parse(r.body || ''); why = j.error_description || j.error?.message || j.error || j.message || j.detail || why; } catch {} throw Error(String(why).split(/\r?\n/)[0].slice(0, 200)); }
    try { return JSON.parse(r.text); } catch { throw Error('微软接口返回格式异常'); }
  }
  async function rawHttp(url, opt = {}) {
    if (typeof Host === 'undefined' || !Host.fetchText) throw Error('当前环境不支持取件（需要客户端）');
    const r = await Host.fetchText(url, { direct: true, timeout: 10000, browserUa: true, ...opt });
    const text = String(r?.text ?? r?.body ?? '');
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: !r?.error, error: r?.error || '', text, json, contentType: r?.contentType || '' };
  }
  const decodeOnce = s => String(s || '')
    .replace(/\\u0026/gi, '&').replace(/\\u003d/gi, '=').replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&').replace(/&#x3D;/gi, '=').replace(/&#61;/gi, '=')
    .replace(/&quot;/gi, '"').replace(/&#34;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const decode = s => decodeOnce(decodeOnce(s));
  // 只取官方认证域名的链接（arena.ai / auth.arena.ai），退订、隐私等链接排除
  function links(html) {
    const out = [];
    for (const m of decode(html).matchAll(/https:\/\/(?:auth\.)?arena\.ai\/[^\s"'<>\\)]+/gi)) {
      const u = m[0].replace(/[.,;]+$/, '');
      if (/unsubscribe|privacy|terms|preferences|\/blog|\/leaderboard/i.test(u)) continue;
      if (!out.includes(u)) out.push(u);
    }
    return out.sort((a, b) => score(b) - score(a));
  }
  const score = u => (/verify|confirm|token=|code=|auth=|magic|callback|reset/i.test(u) ? 10 : 0) + (/auth\.arena\.ai/i.test(u) ? 2 : 0);

  function extractMailPayload(res) {
    const { ok, error, text, json } = res || {};
    const detailObj = json?.detail && typeof json.detail === 'object' ? json.detail : null;
    const errObj = json?.error && typeof json.error === 'object' ? json.error : null;
    const msg = String(
      json?.message || detailObj?.message || (typeof json?.detail === 'string' ? json.detail : '')
      || json?.error_description || errObj?.message || (typeof json?.error === 'string' ? json.error : '')
      || error || ''
    ).trim();
    const errCode = String(json?.code || detailObj?.code || errObj?.code || '').trim().toLowerCase();
    // 判断是否为待收信 / 同步中状态
    const busyOrEmpty = errCode === 'mailbox_busy' || errCode === 'no_code' || errCode === 'no_recent_message'
      || /HTTP 503/i.test(error)
      || (json && json.retryable === true && json.success === false)
      || /暂未收到|没有收到|未收到|正在保存|正在同步|稍后重试/i.test(msg);
    // 判断是否为令牌本身无效 / 过期 / 401 / 403 / 404 / 422 / IMAP 认证拒绝
    const tokenInvalid = !busyOrEmpty && (
      /HTTP (401|403|404|410|422)\b/i.test(error)
      || ['invalid_api_key', 'unauthorized', 'forbidden', 'imap_authentication_rejected', 'authenticationfailed', 'invalid_credentials', 'account_not_found', 'mailbox_not_found'].includes(errCode)
      || (json && json.success === false && json.retryable === false)
      || (json && json.status === 'error' && /invalid|expired|auth|token|not.?found|不存在|无效|过期/i.test(msg))
      || /取码地址无效|API\s*Key\s*错误|令牌.*(无效|失效|过期)|已停用|已删除|invalid.*(key|token|credential)|imap.*authentication.*failed|authenticationfailed|not\s*found/i.test(msg)
      || (!json && /<title>[^<]*登录/i.test(text))
    );
    if (tokenInvalid) {
      return { tokenInvalid: true, error: msg || error || '收件令牌无效或已失效', links: [], code: '' };
    }
    const networkError = Boolean(!ok && error && !busyOrEmpty);
    const bag = [text];
    const collect = o => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const x of o) collect(x); return; }
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && v) bag.push(v);
        else if (v && typeof v === 'object') collect(v);
      }
    };
    collect(json);
    const foundLinks = links(bag.join('\n'));
    let code = '';
    const candCodes = [
      json?.code, json?.verification_code, json?.otp, json?.data?.code,
      json?.login_url, json?.verify_url, json?.url, json?.link,
      json?.data?.login_url, json?.data?.url,
    ];
    for (const c of candCodes) {
      const s = String(c || '').trim();
      if (!s || ERR_CODES.has(s.toLowerCase())) continue;
      if (/^https:\/\/(?:auth\.)?arena\.ai\//i.test(s)) {
        if (!foundLinks.includes(s)) foundLinks.unshift(s);
        try { const cu = new URL(s); code ||= cu.searchParams.get('code') || cu.searchParams.get('token') || ''; } catch {}
      } else if (/^[0-9a-zA-Z_-]{4,128}$/.test(s) && (json?.success !== false)) {
        code ||= s;
      }
    }
    if (!code) {
      const mHtmlCode = decode(text).match(/class="[^"]*mail-code[^"]*"[^>]*>\s*([0-9A-Za-z_-]{4,64})\s*</i);
      if (mHtmlCode && !ERR_CODES.has(mHtmlCode[1].toLowerCase())) code = mHtmlCode[1].trim();
    }
    if (!code && foundLinks[0]) {
      try { const cu = new URL(foundLinks[0]); code = cu.searchParams.get('code') || cu.searchParams.get('token') || ''; } catch {}
    }
    if (!foundLinks.length && code && /^[0-9a-f-]{16,128}$/i.test(code)) {
      foundLinks.push('https://arena.ai/?auth=reset-password&code=' + encodeURIComponent(code));
    }
    const subject = String(json?.subject || json?.data?.subject || '').trim();
    return { tokenInvalid: false, networkError, busyOrEmpty, links: foundLinks, code, subject, msg: msg || error };
  }

  function candidateUrls(u) {
    const list = [u];
    const m = /^(https?:\/\/[^/]+\/api\/v\d+\/access\/[^/]+\/mailboxes\/[^/]+)\/(code|content|view)(?:\?.*)?$/i.exec(u);
    if (m) {
      const base = m[1];
      for (const sfx of ['/code', '/content', '/view?refresh=1']) {
        const cand = base + sfx;
        if (!list.includes(cand)) list.push(cand);
      }
    }
    return list;
  }

  async function pollUrlOnce(tok) {
    const u = urlOf(tok);
    if (!u) throw Object.assign(Error('缺少收件地址'), { mailFailed: true, tokenInvalid: true });
    const urls = candidateUrls(u);
    const allLinks = [];
    let bestCode = '', bestSubj = '', lastErr = '', lastNetErr = '', sawInvalid = false, sawValidEndpoint = false;
    for (const target of urls) {
      const res = await rawHttp(target, { headers: { Accept: 'application/json, text/plain, */*' } });
      const parsed = extractMailPayload(res);
      if (parsed.tokenInvalid) {
        sawInvalid = true;
        lastErr = parsed.error || lastErr;
        continue;
      }
      if (parsed.networkError) {
        lastNetErr = parsed.msg || res.error || lastNetErr;
        continue;
      }
      sawValidEndpoint = true;
      for (const lk of parsed.links) if (!allLinks.includes(lk)) allLinks.push(lk);
      if (!bestCode && parsed.code) bestCode = parsed.code;
      if (!bestSubj && parsed.subject) bestSubj = parsed.subject;
      if (allLinks.length) break;
    }
    if (!sawValidEndpoint && sawInvalid) {
      throw Object.assign(Error('收件令牌失效：' + (lastErr || '无法读取收件接口')), { mailFailed: true, tokenInvalid: true });
    }
    return { links: allLinks, code: bestCode, subject: bestSubj, networkError: !sawValidEndpoint && !!lastNetErr, error: lastNetErr };
  }

  // 预记录邮箱里已有的旧链接/旧验证码，确保后续只消费新收到的验证邮件
  async function snapshot(tok) {
    if (!tok) return;
    tok._seen = tok._seen instanceof Set ? tok._seen : new Set();
    if (!isUrl(tok)) return;
    try {
      const cur = await pollUrlOnce(tok);
      for (const lk of cur.links || []) tok._seen.add(lk);
      if (cur.code) tok._seen.add('code:' + cur.code);
    } catch (e) {
      if (e?.tokenInvalid) throw e;
    }
  }

  // 刷新令牌换访问令牌；收件 URL 令牌则直接校验接口可用性
  async function access(tok) {
    if (isUrl(tok)) {
      const u = urlOf(tok);
      if (!HTTP_URL.test(u)) throw Object.assign(Error('收件地址格式无效'), { mailFailed: true, tokenInvalid: true });
      const res = await rawHttp(u, { headers: { Accept: 'application/json, text/plain, */*' } });
      const parsed = extractMailPayload(res);
      if (parsed.tokenInvalid) {
        throw Object.assign(Error('收件令牌失效：' + (parsed.error || '取码地址无效')), { mailFailed: true, tokenInvalid: true });
      }
      tok._seen = tok._seen instanceof Set ? tok._seen : new Set();
      tok._initialLinks = Array.isArray(parsed.links) ? parsed.links : [];
      tok._initialCode = parsed.code || '';
      tok._initialSubject = parsed.subject || '';
      return { bearer: '', api: 'url', url: u, at: Date.now(), ttl: 3600 * 1000, links: tok._initialLinks, code: tok._initialCode, subject: tok._initialSubject };
    }
    const body = new URLSearchParams({ client_id: tok.clientId, grant_type: 'refresh_token', refresh_token: tok.refreshToken }).toString();
    let j;
    try {
      j = await http(TOKEN_URL, { method: 'POST', body, type: 'application/x-www-form-urlencoded' });
    } catch (e) {
      throw Object.assign(Error('令牌刷新失败：' + (e?.message || e)), { mailFailed: true, tokenInvalid: true });
    }
    if (!j.access_token) throw Object.assign(Error('令牌刷新失败：' + (j.error_description || j.error || '没有访问令牌')), { mailFailed: true, tokenInvalid: true });
    if (j.refresh_token) tok.refreshToken = j.refresh_token;
    const graph = /graph\.microsoft\.com/i.test(j.scope || '') && /Mail\.Read/i.test(j.scope || '');
    return { bearer: j.access_token, api: graph ? 'graph' : 'outlook', at: Date.now(), ttl: (+j.expires_in || 3000) * 1000 };
  }
  async function messages(tok, a) {
    const sel = a.api === 'graph'
      ? 'https://graph.microsoft.com/v1.0/me/messages?$top=25&$orderby=receivedDateTime%20desc&$select=subject,from,receivedDateTime,body'
      : 'https://outlook.office.com/api/v2.0/me/messages?$top=25&$orderby=ReceivedDateTime%20desc&$select=Subject,From,ReceivedDateTime,Body';
    const j = await http(sel, { bearer: a.bearer });
    return (j.value || []).map(m => ({
      subject: m.subject ?? m.Subject ?? '',
      from: (m.from || m.From)?.emailAddress?.address || (m.from || m.From)?.EmailAddress?.Address || '',
      at: Date.parse(m.receivedDateTime || m.ReceivedDateTime || '') || 0,
      html: (m.body || m.Body)?.content || (m.body || m.Body)?.Content || '',
    }));
  }
  // 轮询收件接口或收件箱，返回最新验证链接 / 验证码
  async function waitLink(tok, { since = Date.now() - 60e3, timeout = 120e3, pollMs = 3500, kind = '', exclude = null, log = () => {}, cancelled = () => false, onToken = () => {} } = {}) {
    const end = Date.now() + timeout;
    const seen = new Set([...(tok?._seen instanceof Set ? tok._seen : []), ...(exclude instanceof Set ? exclude : Array.isArray(exclude) ? exclude : [])]);
    const waitCancelable = async ms => {
      const until = Date.now() + Math.max(0, ms);
      while (Date.now() < until) {
        if (cancelled()) throw Object.assign(Error('已取消'), { cancelled: true, aborted: true });
        await sleep(Math.min(180, until - Date.now()));
      }
      if (cancelled()) throw Object.assign(Error('已取消'), { cancelled: true, aborted: true });
    };
    let a = null, n = 0;
    if (isUrl(tok)) {
      while (Date.now() < end) {
        if (cancelled()) throw Object.assign(Error('已取消'), { cancelled: true, aborted: true });
        n++;
        const r = await pollUrlOnce(tok);
        if (cancelled()) throw Object.assign(Error('已取消'), { cancelled: true, aborted: true });
        const freshLinks = (r.links || []).filter(lk => !seen.has(lk));
        const pick = kind === 'reset'
          ? (freshLinks.find(lk => /reset|recovery|password/i.test(lk)) || (/reset|recovery|password|密码/i.test(r.subject || '') ? (freshLinks[0] || '') : ''))
          : (freshLinks[0] || '');
        const freshCode = r.code && !seen.has('code:' + r.code) ? r.code : '';
        if (pick || freshCode) {
          if (pick) { seen.add(pick); (tok._seen ||= new Set()).add(pick); }
          if (freshCode) { seen.add('code:' + freshCode); (tok._seen ||= new Set()).add('code:' + freshCode); }
          const finalLink = pick || ('https://arena.ai/?auth=reset-password&code=' + encodeURIComponent(freshCode));
          return { link: finalLink, code: freshCode, subject: r.subject || '验证邮件', at: Date.now() };
        }
        log('正在通过收件接口获取验证邮件…（第 ' + n + ' 次，' + Math.max(0, Math.round((end - Date.now()) / 1000)) + ' 秒后超时）');
        await waitCancelable(pollMs);
      }
      throw Object.assign(Error('等待验证邮件超时（收件接口正常但未收到新验证邮件，请稍后重试）'), { mailFailed: true, tokenInvalid: false });
    }
    while (Date.now() < end) {
      if (cancelled()) throw Error('已取消');
      if (!a || Date.now() - a.at > a.ttl - 60e3) { a = await access(tok); onToken(tok); }
      const list = await messages(tok, a); n++;
      const hit = list.filter(m => m.at >= since - 90e3 && (/arena/i.test(m.from) || /arena/i.test(m.subject)))
        .filter(m => !kind || kind !== 'reset' || /reset|password|密码/i.test(m.subject + m.html))
        .map(m => ({ ...m, links: links(m.html).filter(lk => !seen.has(lk)) })).find(m => m.links.length);
      if (hit) {
        const lk = hit.links[0];
        seen.add(lk); (tok._seen ||= new Set()).add(lk);
        let code = '';
        try { const cu = new URL(lk); code = cu.searchParams.get('code') || cu.searchParams.get('token') || ''; } catch {}
        return { link: lk, code, subject: hit.subject, at: hit.at };
      }
      log('正在收取验证邮件…（第 ' + n + ' 次，' + Math.max(0, Math.round((end - Date.now()) / 1000)) + ' 秒后放弃）');
      await sleep(5000);
    }
    throw Object.assign(Error('等待验证邮件超时：收不到验证邮件，令牌可能已失效'), { mailFailed: true, tokenInvalid: true });
  }
  const store = id => 'mailtok@' + id;
  async function save(id, tok) {
    if (!id || !tok || !Host.shared) return false;
    const rt = isUrl(tok) ? urlOf(tok) : tok.refreshToken;
    const cid = tok.clientId && UUID.test(tok.clientId) ? tok.clientId : URL_CID;
    return await Host.shared(store(id), { email: tok.email, clientId: cid, refreshToken: rt, pw: tok.pw || '' });
  }
  async function load(id) {
    if (!id || !Host.shared) return null;
    const v = await Host.shared(store(id)).catch(() => null);
    if (!v || !v.refreshToken) return null;
    if (HTTP_URL.test(v.refreshToken) || v.clientId === URL_CID) {
      return { ...v, kind: 'url', apiUrl: v.refreshToken };
    }
    return { ...v, kind: 'oauth' };
  }
  return { URL_CID, isUrl, urlOf, isTokenLine, parse, parseBatch, mask, access, snapshot, links, extractMailPayload, messages, waitLink, save, load };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MailToken;