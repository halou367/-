// Keep the deadline active until the response body has been read, not just its headers.
async function fetchAccountResponse(ses, url, init = {}, ms = 15000) {
  const controller = new AbortController(); let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => ses.fetch(url, { credentials: 'include', cache: 'no-store', ...init, signal: controller.signal })).then(async r => {
        const text = await r.text(); if (text.length > 2000000) throw Error('状态响应过大');
        return { ok: r.ok, status: r.status, text: async () => text, json: async () => JSON.parse(text) };
      }),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('状态读取超时（检查该账号线路）')); }, ms); }),
    ]);
  } finally { clearTimeout(timer); }
}
// Read-only account refresh. No login, messages, window reload, or shared credentials.
async function refreshAccountStatus(a, ses, { fetch, exists = () => true, save = () => {}, now = Date.now }) {
  const patch = {}, quota = {}, errors = [];
  await Promise.all([
    (async () => {
      try { const r = await fetch(ses, 'https://arena.ai/cdn-cgi/trace', {}, 12000); if (!r.ok) throw Error('HTTP ' + r.status);
        const kv = Object.fromEntries((await r.text()).trim().split('\n').map(l => l.split('=')));
        if (!kv.ip) throw Error('未返回出口 IP'); patch.ip = kv.ip; patch.loc = kv.loc || ''; patch.ipErr = '';
      } catch (e) { patch.ipErr = String(e.message || e).slice(0, 160); errors.push('IP：' + patch.ipErr); }
    })(),
    (async () => {
      try { const r = await fetch(ses, 'https://arena.ai/api/me', {}, 15000);
        if (r.status === 401 || r.status === 403) { patch.loggedIn = false; return; }
        if (!r.ok) throw Error('HTTP ' + r.status); const j = await r.json();
        if (!j || typeof j !== 'object' || !Object.hasOwn(j, 'user')) throw Error('登录状态响应无效');
        const isProv = j.user && (j.user.userState === 'provisional' || j.user.isAnonymous === true || j.user.emailConfirmed === false || (!j.user.email && !j.user.name));
        patch.loggedIn = Boolean(j.user && !isProv);
        if (j.user?.email) {
          const AuthFlow = require('../ui/auth-flow');
          patch.me = AuthFlow.pickRichEmail(a?.email || a?.name, j.user.email);
        }
      } catch (e) { errors.push('登录状态：' + String(e.message || e).slice(0, 160)); }
    })(),
    (async () => {
      if(a.status?.quota?.pulseAt && now()-a.status.quota.pulseAt<300000)return;
      if(a._pulseNextAt && now()<a._pulseNextAt)return;
      if(a._pulseAttempt && now()-a._pulseAttempt<300000)return;
      a._pulseAttempt=now();
      try { const r = await fetch(ses, 'https://arena.ai/api/me/pulse', {}, 15000);
        if([401,403,404,429].includes(r.status))a._pulseNextAt=now()+1800000;
        if (r.status === 401 || r.status === 403) return; // /api/me is authoritative for login state.
        if (!r.ok) throw Error('HTTP ' + r.status); const j = await r.json();
        if (!Number.isFinite(j?.pulse)) throw Error('额度响应无效'); quota.pulse = j.pulse; quota.pulseAt = now();
      } catch (e) { errors.push('额度：' + String(e.message || e).slice(0, 160)); }
    })(),
  ]);
  if (!exists(a)) return null;
  // Merge at completion, not from a pre-request snapshot: live gacha/stats/billing may have advanced.
  const current = a.status || {};
  a.status = { ...current, ...patch, quota: { ...(current.quota || {}), ...quota }, at: now(), refreshAt: now(), refreshErrors: errors };
  save(); return a.status;
}
function createAccountRefresh({ accounts, exists, session, prepare, refresh, save, concurrency = 4 }) {
  let active = null;
  return () => {
    if (active) return active;
    active = (async () => {
      const targets = accounts().slice(), errors = []; let index = 0, completed = 0, skipped = 0;
      const worker = async () => { for (;;) {
        const a = targets[index++]; if (!a) return;
        if (!exists(a)) { skipped++; continue; }
        try { const ses = session(a); await prepare(a); if (!exists(a)) { skipped++; continue; }
          const st = await refresh(a, ses); if (!st) { skipped++; continue; }
          if (st.refreshErrors?.length) errors.push({ id: a.id, message: st.refreshErrors.join('；') });
        } catch (e) { errors.push({ id: a.id, message: String(e.message || e).slice(0, 300) }); }
        completed++;
      } };
      await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), targets.length) }, worker)); save();
      return { ok: !errors.length, total: targets.length, completed, skipped, errors, balanceSource: 'pulse' };
    })().finally(() => { active = null; }); return active;
  };
}
// Guard deletion before touching a window/profile. Persistence failure must not delete data.
function createAccountRemoval({ accounts, find, windowFor, caller, open, persistRemoval, cleanup }) {
  let busy = false;
  return async (event, id) => {
    if (busy) throw Error('有账号正在删除，请稍后再试');
    const a = find(id); if (!a) return false;
    if (accounts().length <= 1) throw Error('至少保留一个账号，请先添加其他账号');
    busy = true;
    try {
      const w = windowFor(id), other = accounts().find(x => x.id !== id);
      const visibleOther = accounts().some(x => { const v = x.id !== id && windowFor(x.id); return v && !v.isDestroyed() && !v.__hidden; });
      if (w && !w.isDestroyed() && (caller(event)?.id === id || !visibleOther)) {
        await open(other.id); const next = windowFor(other.id);
        if (!next || next.isDestroyed()) throw Error('无法切换到其他账号，未删除');
      }
      if (find(id) !== a) return false;
      persistRemoval(id); // Strict atomic persistence before closing the target window.
      await cleanup(id); return true;
    } finally { busy = false; }
  };
}
module.exports = { fetchAccountResponse, refreshAccountStatus, createAccountRefresh, createAccountRemoval };
