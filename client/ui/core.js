// 核心层：宿主桥接、存储、Brana 接口、实时流、模型识别
const VERSION = '__VERSION__';
const ORIGIN = 'https://arena.ai';
const RC_V3 = '6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0';
const RC_V2 = '6Le3_cYsAAAAAGwWOK2RLDgNI15Bh8C0yLBOL1yL';
const currentTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }; // Read at send time: region may change while the page stays open.
const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const _rawFetch = window.fetch.bind(window);
// 流量统计（右下角 IP 徽标悬停时显示）：只数经过 rawFetch 的应用数据（对话、列表、下载…），不含 8 秒一次的延迟探测。
// 用来区分「有延迟但没速度」和「线路真的不通」：有请求在等、却长时间一个字节都没收到，就是联通但没速度。
const Traffic = {
  up: 0, down: 0, reqs: 0, errs: 0, since: Date.now(), lastDownAt: 0, lastUpAt: 0, pend: new Map(), seq: 0, hist: [], by: new Map(),
  // 按用途分类累计（鼠标移到右下角 IP 上可看「流量去向」），方便找出谁最费流量
  kind(url) {
    const u = String(url || '');
    if (/\/realtime\/v1\/sessions\//.test(u)) return '实时回复流';
    if (/\/api\/v1\/runs\//.test(u)) return '运行记录 Trace';
    if (/\/workspace\//.test(u)) return '工作区文件';
    if (/\/api\/chat\/[^/?]+\/messages/.test(u)) return '更早的消息';
    if (/\/api\/(stream|chat)\b[^?]*\/(create|evaluat|messages\/)|\/nextjs-api\/stream/.test(u)) return '发送 / 生成';
    if (/\/api\/chat\//.test(u)) return '读取对话';
    if (/\/api\/history\//.test(u)) return '对话列表';
    if (/\/api\/connectors/.test(u)) return '连接器';
    if (/recaptcha|gstatic\.com\/recaptcha/.test(u)) return '人机验证';
    try { const x = new URL(u, location.href); return x.host === location.host ? x.pathname.split('/').slice(0, 3).join('/') || '/' : x.host; } catch { return '其它'; }
  },
  add(k, up, down, req) { const v = this.by.get(k) || { up: 0, down: 0, n: 0 }; v.up += up; v.down += down; if (req) v.n++; this.by.set(k, v); },
  top(n = 5) { return [...this.by.entries()].map(([k, v]) => ({ k, ...v, t: v.up + v.down })).sort((a, b) => b.t - a.t).slice(0, n); },
  size(b) {
    try {
      if (b == null) return 0;
      if (typeof b === 'string') return b.length > 2e5 ? b.length : new TextEncoder().encode(b).length;
      if (typeof Blob !== 'undefined' && b instanceof Blob) return b.size;
      if (b.byteLength != null) return b.byteLength;
      if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString().length;
    } catch {}
    return 0;
  },
  track(u, o, p) {
    try {
      const url = String(u && u.url || u || ''); if (/\/cdn-cgi\/trace(?:[?#]|$)/.test(url)) return;
      const n = this.size(o && o.body); if (n) { this.up += n; this.lastUpAt = now(); }
      const kd = this.kind(url); this.add(kd, n, 0, true);
      const id = ++this.seq; this.reqs++; this.pend.set(id, now());
      const end = () => { this.pend.delete(id); };
      p.then(r => {
        try {
          if ((o && o._selfTrackDown) || !r || !r.body || typeof r.clone !== 'function') return end();
          const rd = r.clone().body.getReader();
          const pump = () => rd.read().then(x => { if (x.done) return end(); const k = x.value && x.value.byteLength || 0; if (k) { this.down += k; this.lastDownAt = now(); this.add(kd, 0, k); } return pump(); });
          pump().catch(end);
        } catch { end(); }
      }, () => { this.errs++; end(); });
    } catch {}
  },
  // 每秒记一个点；速度 = 最近几秒的平均
  tick() { const t = now(); this.hist.push({ t, up: this.up, down: this.down }); while (this.hist.length > 20) this.hist.shift(); },
  rate(sec = 3) {
    const h = this.hist; if (h.length < 2) return { up: 0, down: 0 };
    const last = h[h.length - 1]; let a = h[0];
    for (let i = h.length - 2; i >= 0; i--) if (last.t - h[i].t >= sec * 1000) { a = h[i]; break; }
    const dt = Math.max(1, (last.t - a.t) / 1000); return { up: (last.up - a.up) / dt, down: (last.down - a.down) / dt };
  },
  fmt(n) { n = Math.max(0, +n || 0); return n < 1024 ? Math.round(n) + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; },
  // 判断：返回 { kind: 'ok'|'idle'|'wait'|'down', text }
  verdict() {
    const t = now(), r = this.rate(3), oldest = this.pend.size ? Math.min(...this.pend.values()) : 0, sinceData = Math.max(this.lastDownAt, oldest);
    if (IP.rttFail && !IP.rtt && !IP.quietFail?.()) return { kind: 'down', text: '延迟探测超时：这条线路现在不通' };
    if (r.up + r.down >= 1) return { kind: 'ok', text: '正在传输数据' };
    if (this.pend.size && sinceData && t - sinceData > 8000) return { kind: 'wait', text: this.pend.size + ' 个请求在等数据，已 ' + Math.round((t - sinceData) / 1000) + ' 秒没收到字节：联通但没有速度（模型思考时也会这样，一直不动才是没速度）' };
    if (this.pend.size) return { kind: 'ok', text: this.pend.size + ' 个请求进行中' };
    return { kind: 'idle', text: '空闲：没有请求在进行，速度为 0 是正常的' };
  },
};
// 抓日志（诊断）开着时经过 Cap 记录请求和响应；平时直接走原生 fetch
// 每个请求前确认旧版固定 cookie 还在（见 Pin），响应里记下接口的 trigger 版本
// 透传给页面当前 window.fetch（使未修改的 Chrome 扩展 inject.js 钩子能直接捕获客户端模式的全部请求与 /out SSE 流）
const _costFetchCache = new Map();
const _doExtFetch = (u, o) => {
  const absU = typeof u === 'string' && u.startsWith('/') ? ORIGIN + u : u;
  const wf = window.fetch;
  if (typeof wf === 'function' && wf !== window.__ancPinFetchFn && !window.__ancInExtFetch) {
    window.__ancInExtFetch = true;
    try { return wf.call(window, absU, o); }
    finally { window.__ancInExtFetch = false; }
  }
  return _rawFetch(absU, o);
};
const _extFetch = (u, o) => {
  const uStr = typeof u === 'string' ? u : (u?.url || String(u || ''));
  const mCost = /\/api\/chat\/([0-9a-f-]{20,})\/cost\b/i.exec(uStr);
  if (!mCost) return _doExtFetch(u, o);
  try { window.__ancPin?.ensureBillingFlags?.(false); } catch {}
  const activeDpl = (typeof window !== 'undefined' && window.__ancPin?.dpl?.()) || 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
  const mDpl = /[?&]dpl=(dpl_[A-Za-z0-9]{16,48})\b/i.exec(uStr);
  const effDpl = (mDpl && mDpl[1] !== 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x') ? mDpl[1] : activeDpl;
  const effU = uStr.replace(/([?&])dpl=dpl_[A-Za-z0-9]{16,48}(?:&|$)/gi, (m, p1) => (m.endsWith('&') ? p1 : '')).replace(/[?&]$/, '');
  const effHeaders = Object.assign(
    { 'x-deployment-id': effDpl },
    (o && o.headers && typeof o.headers === 'object') ? o.headers : {}
  );
  delete effHeaders['x-arena-web-deployment'];
  const effOpts = Object.assign({}, o || {}, { headers: effHeaders });
  const sid = mCost[1].toLowerCase();
  const cacheKey = sid + ':' + effDpl;
  const tNow = now();
  let c = _costFetchCache.get(cacheKey) || _costFetchCache.get(sid);
  if (!c) { c = { pending: null, at: 0, backoffUntil: 0, snap: null }; }
  _costFetchCache.set(cacheKey, c);
  if (c.pending) return c.pending.then(s => new Response(s.body, { status: s.status, statusText: s.statusText, headers: s.headers }));
  if (c.snap && ((c.snap.status === 200 && tNow - c.at < 4000) || (tNow < c.backoffUntil))) {
    return Promise.resolve(new Response(c.snap.body, { status: c.snap.status, statusText: c.snap.statusText, headers: c.snap.headers }));
  }
  const runOnce = (targetU, targetO) => _doExtFetch(targetU, targetO).then(async r => {
    const body = await r.clone().text().catch(() => '');
    const headers = {};
    try { r.headers?.forEach?.((v, k) => { headers[k] = v; }); } catch {}
    return { body, status: r.status, statusText: r.statusText || '', headers };
  });
  const p = runOnce(effU, effOpts).then(async snap => {
    // 403/409 单次重放恢复：自愈覆写后立即重放一次
    if (snap.status === 403 || snap.status === 409) {
      try { window.__ancPin?.ensure?.(true); } catch {}
      const replayDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      const replayHeaders = Object.assign({}, effHeaders, { 'x-deployment-id': replayDpl });
      delete replayHeaders['x-arena-web-deployment'];
      const replayOpts = Object.assign({}, effOpts, { headers: replayHeaders });
      snap = await runOnce(effU, replayOpts);
    }
    if (snap.status === 200 && snap.body.includes('"messages"')) {
      c.snap = snap;
      c.at = now();
      c.backoffUntil = 0;
      _costFetchCache.set(sid, c);
    } else if (snap.status === 429) {
      c.snap = snap;
      c.at = now();
      c.backoffUntil = now() + 45000;
    } else if (snap.status === 403) {
      c.snap = snap;
      c.at = now();
      c.backoffUntil = now() + 15000;
    }
    return snap;
  }).finally(() => { c.pending = null; });
  c.pending = p;
  return p.then(s => new Response(s.body, { status: s.status, statusText: s.statusText, headers: s.headers }));
};
const rawFetch = (u, o) => {
  try { window.__ancPin?.ensure(); } catch {}
  const p = window.__capFetch ? window.__capFetch(u, o, _extFetch) : _extFetch(u, o);
  p.then(r => { try { window.__ancPin?.seen(r, u); } catch {} }, () => {});
  Traffic.track(u, o, p);
  return p;
};
// 安卓熄屏 / 切到后台：系统会把隐藏页面的定时器压到一分钟才跑一次（抽卡、队列发送、保活都会卡住）。
// 这里记下每个定时器的到期时间，App 在后台时每秒调用一次 __ancPump()，把已经到期、却被压住的定时器立即执行。
if (window.BranaAndroid && !window.__ancPump) (() => {
  const W = window, st = W.setTimeout.bind(W), ct = W.clearTimeout.bind(W), si = W.setInterval.bind(W), ci = W.clearInterval.bind(W), P = () => performance.now();
  const due = new Map();
  W.setTimeout = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return st(fn, ms, ...args);
    let id = 0; id = st(() => { if (due.delete(id)) fn(...args); }, ms);
    due.set(id, { t: P() + (+ms || 0), fn, args }); return id;
  };
  W.setInterval = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return si(fn, ms, ...args);
    const d = { t: P() + (+ms || 0), ms: Math.max(+ms || 0, 10), fn, args, iv: true };
    const id = si(() => { const t = P(); if (t - (d.last || -1e9) < d.ms / 2) return; d.last = t; d.t = t + d.ms; fn(...args); }, ms); due.set(id, d); return id;
  };
  W.clearTimeout = id => { due.delete(id); ct(id); };
  W.clearInterval = id => { due.delete(id); ci(id); };
  W.__ancPump = () => {
    if (!document.hidden || !due.size) return 0;
    const t = P(); let n = 0;
    for (const [id, d] of [...due]) {
      if (d.t > t || !due.has(id)) continue;
      if (d.iv) { d.t = t + d.ms; d.last = t; } else { due.delete(id); ct(id); }
      n++; try { d.fn(...d.args); } catch (e) { console.error(e); }
    }
    return n;
  };
})();

function uuid7() {
  const b = crypto.getRandomValues(new Uint8Array(16)), t = now();
  for (let i = 0; i < 6; i++) b[i] = Math.floor(t / 2 ** (8 * (5 - i))) & 255;
  b[6] = (b[6] & 15) | 0x70; b[8] = (b[8] & 63) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const jwt = t => { try { return JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
let _visitState = null;
function getOrCreateVisitId() {
  const t = now();
  const expired = v => !v || typeof v.id !== 'string' || !v.id || !(t - v.lastSeen < 1800000) || !(t - v.started < 43200000);
  if (expired(_visitState) && typeof document !== 'undefined') {
    try {
      const ck = typeof document.cookie === 'string' ? document.cookie : '';
      const m = ck.split(';').map(x => x.trim()).find(x => x.startsWith('arena_visit_id='));
      if (m) {
        const parsed = JSON.parse(decodeURIComponent(m.slice(15)));
        if (!expired(parsed)) _visitState = parsed;
      }
    } catch {}
  }
  if (expired(_visitState)) _visitState = { id: uuid7(), started: t, lastSeen: t };
  else _visitState = { ..._visitState, lastSeen: t };
  if (typeof document !== 'undefined' && typeof location !== 'undefined') {
    try {
      const sec = location.protocol === 'https:' ? '; Secure' : '';
      const dom = location.hostname === 'arena.ai' || String(location.hostname || '').endsWith('.arena.ai') ? '; Domain=.arena.ai' : '';
      document.cookie = `arena_visit_id=${encodeURIComponent(JSON.stringify(_visitState))}; Path=/; SameSite=Lax; Max-Age=1800${sec}${dom}`;
    } catch {}
  }
  return _visitState.id;
}
function rotateVisitId() {
  const t = now();
  _visitState = { id: uuid7(), started: t - Math.floor(18000 + Math.random() * 75000), lastSeen: t };
  if (typeof document !== 'undefined' && typeof location !== 'undefined') {
    try {
      const sec = location.protocol === 'https:' ? '; Secure' : '';
      const dom = location.hostname === 'arena.ai' || String(location.hostname || '').endsWith('.arena.ai') ? '; Domain=.arena.ai' : '';
      document.cookie = `arena_visit_id=${encodeURIComponent(JSON.stringify(_visitState))}; Path=/; SameSite=Lax; Max-Age=1800${sec}${dom}`;
      document.cookie = `__cf_bm=; Path=/; Max-Age=0${sec}${dom}`;
    } catch {}
  }
  return _visitState.id;
}
const VISIT = getOrCreateVisitId();

// 删除账号的返回值统一检查：Android 失败时返回 {error:原因}，旧版返回 false；只有明确的 true / {ok:true} 才算成功（以前 false 以外一律当成功）
function removeCheck(r) {
  if (r === true || r?.ok === true) return true;
  throw Error(r?.error || (r === false ? '账号不存在或已被删除，请刷新账号列表' : '宿主没有确认删除，请刷新账号列表后重试'));
}
// ---------- 宿主（Electron / Android）----------
const Host = (() => {
  if (window.BranaHost) return window.BranaHost;
  const A = window.BranaAndroid;
  if (A) {
    const call = (fn, ...a) => { try { const r = A[fn](...a.map(x => typeof x === 'string' ? x : JSON.stringify(x ?? null))); return Promise.resolve(r ? JSON.parse(r) : null); } catch (e) { return Promise.reject(e); } };
    const accountReads = new Map();
    const readAccounts = lite => {
      const key=lite?'lite':'full';if(accountReads.has(key))return accountReads.get(key);
      const job=(async()=>{
        if(typeof A.listAccountsStart!=='function')return call(lite&&typeof A.listAccountsLite==='function'?'listAccountsLite':'listAccounts');
        const id=A.listAccountsStart(lite?'1':'0');
        for(let i=0;i<150;i++){
          await sleep(100);const raw=A.probeGet(id);if(!raw)continue;
          const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error(rows?.error||'账号列表读取失败');return rows;
        }
        throw Error('账号列表读取超时，请重试');
      })().finally(()=>accountReads.delete(key));
      accountReads.set(key,job);return job;
    };
    return {
      platform: 'android',
      info: () => call('info'),
      listAccounts: readAccounts,
      saveAccount: a => call('saveAccount', a),
      renameAccount: typeof A.renameAccount === 'function' ? (id, name) => call('renameAccount', id, name) : null,
      removeAccount: id => call('removeAccount', id),
      openAccount: id => call('openAccount', id),
      enterAccount: typeof A.enterAccount === 'function' ? id => call('enterAccount', id) : null,
      takeEnter: () => { try { return typeof A.takeEnter === 'function' && String(A.takeEnter()) === '1'; } catch { return false; } },
      login: u => (u ? call('openAuth', String(u)) : call('login')).then(r => { if (r === false || r?.error) throw Error(r?.error || '原生窗口未确认打开'); return r; }),
      authTask: window.BranaRoute?.postMessage ? request => RouteHost.rpc(window.BranaRoute,'authTask',request) : null,
      back: () => call('back'),
      logout: () => call('logout'),
      setTitle: t => call('setTitle', t),
      openExternal: u => call('openExternal', u),
      copyImage: (b64, name, mime) => typeof A.copyImage === 'function' ? call('copyImage', name || 'image.png', mime || 'image/png', b64) : Promise.resolve({ error: '请更新 App' }),
      saveImage: (name, b64, mime) => typeof A.saveImage === 'function' ? call('saveImage', name || 'image.png', mime || 'image/png', b64) : Promise.resolve({ error: '请更新 App' }),
      saveFile: typeof A.saveFile === 'function' ? (name, mime, text) => call('saveFile', name || 'brana-log.json', mime || 'application/json', String(text ?? '')) : null,
      downloadStart: typeof A.downloadStart === 'function' ? (name,mime,size) => call('downloadStart',name,mime,String(size)) : null,
      downloadChunk: typeof A.downloadChunk === 'function' ? (id,b64) => call('downloadChunk',id,b64) : null,
      downloadFinish: typeof A.downloadFinish === 'function' ? id => call('downloadFinish',id) : null,
      downloadCancel: typeof A.downloadCancel === 'function' ? id => call('downloadCancel',id) : null,
      openFile: typeof A.openFile === 'function' ? (uri,mime) => call('openFile',uri,mime) : null,
      previewOpen: typeof A.previewOpen === 'function' ? o => call('previewOpen', o) : null,
      previewRespond: typeof A.previewRespond === 'function' ? o => call('previewRespond', o) : null,
      previewClose: typeof A.previewClose === 'function' ? id => call('previewClose', id) : null,
      shareFile: typeof A.shareFile === 'function' ? (uri, mime) => call('shareFile', uri, mime || 'application/json') : null,
      testIp: a => call('testIp', a),
      localScan: A.localScanStart ? async ports => { let id; try { id = A.localScanStart(JSON.stringify(ports || [])); } catch (e) { return { error: String(e.message || e) }; } for (let i = 0; i < 150; i++) { await sleep(400); let r; try { r = A.probeGet(id); } catch (e) { return { error: String(e.message || e) }; } if (r) { try { return JSON.parse(r); } catch { return { error: '解析失败' }; } } } return { error: '检测超时' }; } : null,
      // 节点延迟（Clash 式 URL Test）：每批最多 32 个出站共用一个 xray 进程
      urlTest: A.probeStart ? async o => {
        const items = Array.isArray(o?.items) ? o.items : [], out = [];
        const one = async x => { let id; try { id = A.probeStart(JSON.stringify(x)); } catch (e) { return { error: String(e.message || e) }; } for (let i = 0; i < 100; i++) { await sleep(300); let r; try { r = A.probeGet(id); } catch (e) { return { error: String(e.message || e) }; } if (r) { try { return JSON.parse(r); } catch { return { error: '解析失败' }; } } } return { error: '检测超时' }; };
        for (let i = 0; i < items.length; i += 32) {
          const part = items.slice(i, i + 32); let outs;
          try { outs = part.map(x => Vless.outbound(Vless.parse(x.link), x.pip || '')); } catch (e) { part.forEach(() => out.push({ ok: false, error: String(e.message || e) })); continue; }
          const r = await one({ outs, pips: part.map(() => ''), mode: 'delay', url: o.url || '', timeout: o.timeout || 5000 });
          if (!Array.isArray(r)) part.forEach(() => out.push({ ok: false, error: r?.error || '检测失败' })); else part.forEach((_, j) => out.push(r[j] || { ok: false, error: '无结果' }));
        }
        return out;
      } : null,
      probe: async o => { let id; try { id = A.probeStart(JSON.stringify(o)); } catch (e) { return { error: String(e.message || e) }; } for (let i = 0; i < 400; i++) { await sleep(400); let r; try { r = A.probeGet(id); } catch (e) { return { error: String(e.message || e) }; } if (r) return JSON.parse(r); } return { error: '检测超时' }; },
      updInfo: async () => { let d = {}; try { d = JSON.parse(A.deviceInfo ? A.deviceInfo() : '{}') || {}; } catch {} return { kind: 'apk', canInstall: !!A.updStart, device: d.id || '', devName: d.name || '' }; },
      updStart: A.updStart ? async o => JSON.parse(A.updStart(JSON.stringify(o))) : null,
      updStatus: A.updStatus ? async () => { try { return JSON.parse(A.updStatus() || '{}'); } catch { return {}; } } : null,
      updInstall: A.updInstall ? async () => JSON.parse(A.updInstall()) : null,
      updReady: A.updReady ? async () => { try { return JSON.parse(A.updReady() || '{}'); } catch { return {}; } } : null,
      fetchText: A.fetchStart ? async (url, o) => { let id; try { id = o?.bearer ? (A.fetchAuthStart ? A.fetchAuthStart(String(url), String(o.bearer)) : null) : o?.method === 'POST' ? (A.fetchPostStart ? A.fetchPostStart(String(url), String(o.body || ''), String(o.type || '')) : null) : o?.direct ? (A.fetchDirectStart ? A.fetchDirectStart(String(url)) : null) : A.fetchStart(String(url)); if (!id) return { error: '此版本不支持' }; } catch (e) { return { error: String(e.message || e) }; } for (let i = 0, n = o?.long ? 480 : 80; i < n; i++) { await sleep(250); let r; try { r = A.probeGet(id); } catch (e) { return { error: String(e.message || e) }; } if (r) { try { return JSON.parse(r); } catch { return { error: '解析失败' }; } } } return { error: '超时' }; } : null,
      protoFetch: typeof A.protoFetchStart === 'function' ? async (path, options) => {
        let id;
        try { id = A.protoFetchStart(String(path || ''), JSON.stringify(options || {})); if (!id) return { ok: false, status: 0, error: 'ANDROID_PROTO_NO_JOB' }; }
        catch (e) { return { ok: false, status: 0, error: String(e?.message || e) }; }
        const maxPolls = Math.max(80, Math.ceil((Number(options?.timeoutMs) || 20000) / 80));
        for (let i = 0; i < maxPolls; i++) {
          await sleep(i < 6 ? 25 : i < 18 ? 50 : 100);
          let r;
          try { r = A.probeGet(id); } catch (e) { return { ok: false, status: 0, error: String(e?.message || e) }; }
          if (r) { try { return JSON.parse(r); } catch { return { ok: false, status: 0, error: 'PARSE_ERROR' }; } }
        }
        return { ok: false, status: 0, error: 'TIMEOUT' };
      } : null,
      // 域名解析走原生（不经过 WebView 代理：代理没开也能解析 ProxyIP 域名）
      resolve: A.resolveStart ? async host => { let id; try { id = A.resolveStart(String(host)); } catch { return null; } for (let i = 0; i < 40; i++) { await sleep(250); let r; try { r = A.probeGet(id); } catch { return null; } if (r) { try { const x = JSON.parse(r); return Array.isArray(x) ? x : null; } catch { return null; } } } return null; } : null,
      getCred: () => call('getCred'),
      noteAccount: o => call('noteAccount', o),
      launchPick: () => { try { return typeof A.launchPick === 'function' && String(A.launchPick()) === '1'; } catch { return false; } },
      fingerprintStore: typeof A.fingerprintStart==='function' ? async (op,revision,payload) => {
        const id=A.fingerprintStart(String(op),String(revision??-1),typeof payload==='string'?payload:'');
        if(!id)throw Error('共享指纹库繁忙，请稍后重试');
        for(let i=0;i<900;i++){await sleep(100);const raw=A.probeGet(id);if(raw)return JSON.parse(raw);}
        throw Error('共享库操作未确认，请刷新检查；不要清除原数据');
      } : null,
      shared: (k, v) => v === undefined ? call('sharedGet', k) : call('sharedSet', k, v),
      exportAccounts: () => call('exportAccounts'),
      takeCmd: () => typeof A.takeCmd === 'function' ? call('takeCmd') : Promise.resolve(null),
      ...(typeof A.notify === 'function' ? { notify: o => call('notify', o), notifyPerm: ask => call('notifyPerm', ask ? '1' : '0'), takeOpen: () => call('takeOpen') } : {}),
      ...(typeof A.gachaSwitch === 'function' ? { gachaSwitch: id => call('gachaSwitch', id) } : {}),
      bgWork: w => typeof A.bgWork === 'function' ? call('bgWork', w) : Promise.resolve(null),
      bgStatus: () => typeof A.bgStatus === 'function' ? call('bgStatus') : Promise.resolve(null),
      ...(typeof A.gnet === 'function' ? { gnet: () => call('gnet') } : {}),
      bgAllow: k => typeof A.bgAllow === 'function' ? call('bgAllow', k || 'battery') : Promise.resolve(null),
      signInAccount: id => Promise.resolve({ deferred: true }),
      setCookies: (id, list) => call('setCookies', id, list),
      // 多账号后台运行（新版 App + 系统 WebView 支持多 Profile）：各账号后台抽卡、切换账号秒切
      ...(typeof A.multiOk === 'function' && String(A.multiOk()) === 'true' ? {
        gachaAccount: (id, cmd) => call('gachaAccount', id, cmd),
        onCmd: fn => { window.__ancCmd = m => { try { fn(m); } catch (e) { console.warn(e); } }; },
      } : {}),
      ready: () => typeof A.ready === 'function' ? call('ready') : Promise.resolve(null),
    };
  }
  // 纯浏览器调试模式
  return { platform: 'web', info: async () => ({ platform: 'web', account: { id: 'web', name: '浏览器', proxy: '' }, version: VERSION }), listAccounts: async () => [], saveAccount: async () => null, removeAccount: async () => null, openAccount: async () => null, login: async () => { location.href = '/'; }, back: async () => { location.href = '/robots.txt'; }, logout: async () => null, setTitle: async t => { document.title = t; }, openExternal: async u => window.open(u, '_blank'), testIp: async () => null, getCred: async () => null, noteAccount: async () => null, shared: async () => null, exportAccounts: async () => [], signInAccount: async () => ({ deferred: true }), setCookies: async () => null };
})();

// ---------- 本地存储（按账号分区天然隔离）----------
const Store = {
  get(k, d) { try { const v = localStorage.getItem('anc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  freeQuotaBloat(keepKey) {
    try {
      const target = 'anc:' + keepKey;
      if ('anc:cap' !== target) try { localStorage.removeItem('anc:cap'); } catch {}
      if ('anc:pelican-shots' !== target) {
        try {
          const ps = localStorage.getItem('anc:pelican-shots');
          if (ps && ps.length > 600000) localStorage.removeItem('anc:pelican-shots');
        } catch {}
      }
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const lk = localStorage.key(i);
        if (lk && lk !== target && (lk.startsWith('anc:trace:') || lk === 'anc:str:samples' || lk === 'anc:billing:costDocCache')) keys.push(lk);
      }
      for (const lk of keys) {
        try { localStorage.removeItem(lk); } catch {}
      }
    } catch {}
  },
  set(k, v) {
    const raw = JSON.stringify(v);
    try { localStorage.setItem('anc:' + k, raw); return true; } catch {
      this.freeQuotaBloat(k);
      try { localStorage.setItem('anc:' + k, raw); return true; } catch { return false; }
    }
  },
  del(k) { try { localStorage.removeItem('anc:' + k); } catch {} },
};
const Prefs = Object.assign({ autoTitle: false, notify: true, enterSend: true, theme: 'auto', ipPoll: 60, acctCheckHours: 6, rcLang: 'zh-CN', thinkStop: true, routePausePrompt: true }, Store.get('prefs', {}));
if (!Store.get('prefs:mig:20261016', false)) {
  Prefs.autoTitle = false;
  if (!Prefs.rcLang) Prefs.rcLang = 'zh-CN';
  Store.set('prefs:mig:20261016', true);
  Store.set('prefs', Prefs);
}
const savePrefs = () => Shared.push('prefs', Prefs);
// ---------- 旧版固定：新对话继续能读到运行令牌、识别真实型号 ----------
// 2026-09-30 约 09:50 UTC 起，arena.ai 新部署建的对话锁定 trigger 任务版本 20260930.20，实时通道不再下发运行令牌（读不到型号）。
// arena.ai 在 Vercel 上开着 Skew Protection：带 __vdpl=<部署编号> cookie 的请求（接口、create-chat）都由那个旧部署处理，
// dpl_DaEk6… 仍把新对话锁在 20260930.5，令牌照常下发。客户端不加载 Brana 网页，只有接口请求，所以只写 cookie 就够（没有新页面配旧接口的问题）。
// cookie 只是公开的部署编号，和账号无关；每个账号的 cookie 各自写入。旧部署被 Brana 删掉后自动失效，只能跟随新版。
const Pin = {
  NAME: '__vdpl',
  // Alive skew target: dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT -> dpl_BcGa9YULV843didEQWsFTd5taD4h (fallback dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x / dpl_8c25ZvCYXszwFU4s19PErXPLVCzn)
  ACTIVE_COST_DPL: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
  COST_DPL: 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  LEGACY: 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  POOL: [
    'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
    'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  ],
  ENDPOINTS: [
    '/api/chat/{sid}/cost?includeSession=true',
    '/api/chat/{sid}/cost',
    '/api/evaluation/{sid}/cost?includeSession=true',
    '/api/evaluation/{sid}/cost',
  ],
  EXPIRED: new Set(['dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct', 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x', 'dpl_ESfaucDQhCnPyQUz9QQZg82hdgNT', 'dpl_9gD8cB3xQ7eTwzU2jLmVpR5kHs1Y', 'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa', 'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC', 'dpl_6gJxa2MLrLxAx6KcYkVgvMmbV2EA', 'dpl_D2yWTJ2pjpQeiwvqpbtqDTpsZnY4', 'dpl_2W47bX6FpYa8XrFCCjzBA2JNNZ4V', 'dpl_BieRM8wzCXHw6R6ToLUsTdhu4ZBZ']),
  COST_TRIGGER: '20261017.19',
  TRIGGER: '20260930.5',
  OVERRIDES: { 'credit-system-m1': 'cost-shown', 'credit-system-m2': 'limits-enabled' },
  trigger: '', apiDpl: '', at: 0, fellBack: '',
  extractDpl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(s)) return s;
    const m = /\b(dpl_[A-Za-z0-9]{16,48})\b/.exec(s);
    return m ? m[1] : '';
  },
  lockedDpl() {
    try { return this.extractDpl(Prefs?.pinDpl); } catch { return ''; }
  },
  initSmartPool() {
    try {
      const locked = this.lockedDpl();
      if (locked && Prefs.pinDpl !== locked) Prefs.pinDpl = locked;
      const defaultDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      this.COST_DPL = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      if (locked) this.COST_DPL = locked;
      const protectedDpls = new Set([defaultDpl, 'dpl_BcGa9YULV843didEQWsFTd5taD4h', ...(locked ? [locked] : [])]);
      if (Array.isArray(Prefs.expiredCostDpls)) {
        const cleaned = Prefs.expiredCostDpls.filter(x => !protectedDpls.has(String(x || '').trim()));
        if (cleaned.length !== Prefs.expiredCostDpls.length) Prefs.expiredCostDpls = cleaned;
        for (const x of cleaned) if (/^dpl_[A-Za-z0-9]{16,48}$/.test(String(x || ''))) this.EXPIRED.add(String(x));
      }
      for (const p of protectedDpls) this.EXPIRED.delete(p);
      for (const exp of ['dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x', 'dpl_ESfaucDQhCnPyQUz9QQZg82hdgNT', 'dpl_9gD8cB3xQ7eTwzU2jLmVpR5kHs1Y', 'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa', 'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC']) {
        if (exp !== locked) this.EXPIRED.add(exp);
      }
      if (locked) {
        this.EXPIRED.delete(locked);
        Prefs.autoCostDpl = locked;
      } else if (Prefs.autoCostDpl && !protectedDpls.has(String(Prefs.autoCostDpl).trim())) {
        Prefs.autoCostDpl = defaultDpl;
      }
      if (Array.isArray(Prefs.autoCostPool)) {
        for (const x of Prefs.autoCostPool.slice().reverse()) {
          const id = String(x || '').trim();
          if (/^dpl_[A-Za-z0-9]{16,48}$/.test(id) && !this.EXPIRED.has(id)) {
            this.POOL = [id, ...this.POOL.filter(y => y !== id)];
          }
        }
      }
      const primary = locked || (Prefs.autoCostDpl && /^dpl_[A-Za-z0-9]{16,48}$/.test(String(Prefs.autoCostDpl)) && !this.EXPIRED.has(String(Prefs.autoCostDpl)) ? String(Prefs.autoCostDpl).trim() : this.COST_DPL);
      this.LEGACY = primary;
      this.POOL = [primary, defaultDpl, ...this.POOL.filter(y => y !== primary && y !== defaultDpl)];
      if (Prefs.autoCostEndpoint && typeof Prefs.autoCostEndpoint === 'string' && Prefs.autoCostEndpoint.includes('{sid}')) {
        this.ENDPOINTS = [Prefs.autoCostEndpoint, ...this.ENDPOINTS.filter(e => e !== Prefs.autoCostEndpoint)];
      }
    } catch {}
  },
  on() { return Prefs.pinOn !== false && !this.fellBack && !this.held(); },
  // 注册 / 登录 / 邮件验证全程不固定旧部署：认证请求、验证链接页面和随后的 /api/me 都由同一个（最新）部署处理，
  // 否则新版页面写下的登录会话旧部署可能认不出来 → 表现为「验证成功但客户端没登录，再登录又像新号」
  hold(on = true) { try { if (on) localStorage.setItem('anc-pin-hold', String(now() + 30 * 60e3)); else localStorage.removeItem('anc-pin-hold'); } catch {} if (on) this.drop(); else this.ensure(true); },
  held() { try { return +localStorage.getItem('anc-pin-hold') > now(); } catch { return false; } },
  dpl() {
    const locked = this.lockedDpl();
    if (locked) {
      this.EXPIRED.delete(locked);
      return locked;
    }
    if (Prefs.autoCostDpl && this.EXPIRED.has(String(Prefs.autoCostDpl).trim())) {
      try { Prefs.autoCostDpl = this.COST_DPL; if (typeof savePrefs === 'function') savePrefs(); } catch {}
    }
    const d = String(Prefs.autoCostDpl || '').trim();
    if (d && this.EXPIRED.has(d)) { try { Prefs.autoCostDpl = this.COST_DPL; if (typeof savePrefs === 'function') savePrefs(); } catch {} return this.COST_DPL; }
    return /^dpl_[A-Za-z0-9]{16,48}$/.test(d) ? d : (this.COST_DPL || this.LEGACY);
  },
  vals() { try { return document.cookie.split(/;\s*/).filter(x => x.startsWith(this.NAME + '=')).map(x => x.slice(this.NAME.length + 1)); } catch { return []; } },
  drop() { for (const dm of ['', '; domain=arena.ai', '; domain=.arena.ai']) try { document.cookie = this.NAME + '=; path=/; max-age=0; secure' + dm; } catch {} },
  ck: 0,
  // 6层幂等自愈注入：localStorage PostHog flags + ph-toolbar-overrides Cookie + arena_build_bucket=stable + window.posthog.featureFlags.override + __vdpl
  ensureBillingFlags(force = false) {
    if (typeof location === 'undefined' || location.hostname !== 'arena.ai') return;
    try {
      const ov = this.OVERRIDES || { 'credit-system-m1': 'cost-shown', 'credit-system-m2': 'limits-enabled' };
      // 1. localStorage PostHog 持久化对象深度合并
      let patchedLs = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^ph_.*_posthog$/.test(k)) continue;
        try {
          const obj = JSON.parse(localStorage.getItem(k) || '{}');
          if (obj && typeof obj === 'object') {
            const cur = obj.$override_feature_flags || {};
            if (force || cur['credit-system-m1'] !== 'cost-shown' || cur['credit-system-m2'] !== 'limits-enabled') {
              obj.$override_feature_flags = Object.assign({}, cur, ov);
              localStorage.setItem(k, JSON.stringify(obj));
            }
            patchedLs = true;
          }
        } catch {}
      }
      if (!patchedLs) {
        const fbKey = 'ph_phc_arena_posthog';
        try {
          const obj = JSON.parse(localStorage.getItem(fbKey) || '{}');
          const cur = obj.$override_feature_flags || {};
          if (force || cur['credit-system-m1'] !== 'cost-shown' || cur['credit-system-m2'] !== 'limits-enabled') {
            obj.$override_feature_flags = Object.assign({}, cur, ov);
            localStorage.setItem(fbKey, JSON.stringify(obj));
          }
        } catch {}
      }
      // 2. ph-toolbar-overrides Cookie + arena_build_bucket=stable
      const rawCookie = String(document.cookie || '');
      const hasPhOk = rawCookie.includes('ph-toolbar-overrides=') && rawCookie.includes('cost-shown') && rawCookie.includes('limits-enabled');
      if (force || !hasPhOk) {
        const val = encodeURIComponent(JSON.stringify(ov));
        document.cookie = `ph-toolbar-overrides=${val}; path=/; max-age=2592000; SameSite=Lax; Secure`;
      }
      if (force || !/(?:^|;\s*)arena_build_bucket=stable(?:;|$)/.test(rawCookie)) {
        document.cookie = 'arena_build_bucket=stable; path=/; max-age=31536000; SameSite=Lax; Secure';
      }
      // 3. PostHog 运行时实例直接注入
      if (typeof window !== 'undefined' && window.posthog?.featureFlags?.override) {
        try { window.posthog.featureFlags.override(ov); } catch {}
      }
    } catch {}
  },
  ensure(force) {
    if (location.hostname !== 'arena.ai') return;
    if (!force && now() - this.ck < 2000) return; this.ck = now();
    this.ensureBillingFlags(Boolean(force));
    const v = this.vals();
    if (!this.on() || (!this.lockedDpl() && Prefs.pinOn !== true)) { if (v.length) this.drop(); return; }
    const d = this.dpl(); if (!force && v.length === 1 && v[0] === d) return;
    if (v.length && (v.length > 1 || v[0] !== d)) this.drop();
    try { document.cookie = `${this.NAME}=${d}; path=/; max-age=31536000; secure; samesite=lax`; } catch {}
  },
  // 20260930.5 及更早 = 旧版（有运行令牌）；20261017.17 及更早 = 计费兼容版（支持 /cost 四通道账单）
  legacy(t = this.trigger) { const m = /^(\d{8})\.(\d+)$/.exec(t || ''), k = /^(\d{8})\.(\d+)$/.exec(this.TRIGGER); return !!m && (m[1] < k[1] || (m[1] === k[1] && +m[2] <= +k[2])); },
  costOk(t = this.trigger) { const m = /^(\d{8})\.(\d+)$/.exec(t || ''), k = /^(\d{8})\.(\d+)$/.exec(this.COST_TRIGGER); return !!m && (m[1] < k[1] || (m[1] === k[1] && +m[2] <= +k[2])); },
  learnDpl(d, verifiedCost = false) {
    const id = String(d || '').trim();
    if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) return;
    const locked = this.lockedDpl();
    if (verifiedCost) {
      this.EXPIRED.delete(id);
      const head = locked || id;
      this.POOL = [head, id, ...this.POOL.filter(x => x !== head && x !== id)];
      this.LEGACY = head;
      try {
        if (typeof Prefs === 'object') {
          let dirty = false;
          if (!locked && Prefs.autoCostDpl !== id) { Prefs.autoCostDpl = id; dirty = true; }
          const nextPool = this.POOL.filter(x => !this.EXPIRED.has(x)).slice(0, 16);
          if (JSON.stringify(Prefs.autoCostPool) !== JSON.stringify(nextPool)) { Prefs.autoCostPool = nextPool; dirty = true; }
          if (dirty && typeof savePrefs === 'function') savePrefs();
        }
      } catch {}
      this.ensure(true);
      return;
    }
    if (this.EXPIRED.has(id)) return;
    if (!this.POOL.includes(id)) this.POOL.push(id);
  },
  markBadDpl(d) {
    const id = String(d || '').trim();
    const locked = this.lockedDpl();
    if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(id) || id === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT' || (locked && id === locked)) return;
    this.EXPIRED.add(id);
    const remaining = this.POOL.filter(x => x !== id && !this.EXPIRED.has(x));
    if (remaining.length > 0) this.POOL = remaining;
    if (this.LEGACY === id) {
      this.LEGACY = locked || remaining[0] || 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
    }
    try {
      if (typeof Prefs === 'object') {
        let dirty = false;
        if (!locked && Prefs.autoCostDpl === id) { delete Prefs.autoCostDpl; dirty = true; }
        const expArr = [...this.EXPIRED].slice(-40);
        if (JSON.stringify(Prefs.expiredCostDpls) !== JSON.stringify(expArr)) { Prefs.expiredCostDpls = expArr; dirty = true; }
        if (dirty && typeof savePrefs === 'function') savePrefs();
      }
    } catch {}
    this.ensure(true);
  },
  lockCostDpl(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) {
      delete Prefs.pinDpl;
      Prefs.autoCostDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      this.initSmartPool();
      try { if (typeof _costFetchCache !== 'undefined') _costFetchCache.clear(); } catch {}
      if (typeof savePrefs === 'function') savePrefs();
      this.fellBack = '';
      this.ensure(true);
      try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.setSkewDpl === 'function') BillingProbe.setSkewDpl(this.dpl(), false); } catch {}
      Bus.emit('pin');
      return { ok: true, locked: false, dpl: this.dpl() };
    }
    const dpl = this.extractDpl(trimmed);
    if (!dpl) return { ok: false, error: '部署编号格式不对（应为 dpl_ 开头的 20~52 位编号，或包含 dpl_ 的链接）' };
    this.EXPIRED.delete(dpl);
    if (Array.isArray(Prefs.expiredCostDpls)) {
      Prefs.expiredCostDpls = Prefs.expiredCostDpls.filter(x => x !== dpl);
    }
    Prefs.pinDpl = dpl;
    Prefs.autoCostDpl = dpl;
    this.COST_DPL = dpl;
    this.LEGACY = dpl;
    this.POOL = [dpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', ...this.POOL.filter(x => x !== dpl && x !== 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT')];
    Prefs.autoCostPool = this.POOL.filter(x => !this.EXPIRED.has(x)).slice(0, 12);
    try { if (typeof _costFetchCache !== 'undefined') _costFetchCache.clear(); } catch {}
    if (typeof savePrefs === 'function') savePrefs();
    this.fellBack = '';
    this.ensure(true);
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.setSkewDpl === 'function') BillingProbe.setSkewDpl(dpl, true); } catch {}
    Bus.emit('pin');
    return { ok: true, locked: true, dpl };
  },
  learnEndpoint(tpl, verified = false) {
    const s = String(tpl || '').trim();
    if (!s || !s.startsWith('/') || !s.includes('{sid}')) return;
    if (verified) {
      this.ENDPOINTS = [s, ...this.ENDPOINTS.filter(x => x !== s)];
      try {
        if (typeof Prefs === 'object' && Prefs.autoCostEndpoint !== s) {
          Prefs.autoCostEndpoint = s;
          if (typeof savePrefs === 'function') savePrefs();
        }
      } catch {}
    } else if (!this.ENDPOINTS.includes(s)) {
      this.ENDPOINTS.push(s);
    }
  },
  discoverFromHtml(text) {
    const raw = String(text || '');
    if (!raw) return [];
    const found = [];
    const reList = [
      /[?&]dpl=(dpl_[A-Za-z0-9]{16,48})\b/g,
      /\\?"deploymentId\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
      /\\?"dpl\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
    ];
    for (const re of reList) {
      for (const m of raw.matchAll(re)) {
        const id = m[1];
        if (id && !this.EXPIRED.has(id) && !found.includes(id)) {
          found.push(id);
          this.learnDpl(id, false);
        }
      }
    }
    for (const m of raw.matchAll(/(\/(?:api|nextjs-api)\/(?:chat|evaluation|sessions)\/(?:\$\{[^}]+\}|[A-Za-z0-9_-]+)\/cost(?:\?[A-Za-z0-9=&_-]+)?)/g)) {
      const tpl = m[1].replace(/\$\{[^}]+\}/g, '{sid}');
      if (tpl.includes('{sid}')) this.learnEndpoint(tpl, false);
    }
    return found;
  },
  seen(r, u) {
    const same = typeof u === 'string' && (u.startsWith('/') || u.startsWith(ORIGIN)); if (!same || !r?.headers) return;
    const t = r.headers.get('x-arena-trigger-version'); if (t && t !== this.trigger) { this.trigger = t; this.at = now(); Bus.emit('pin'); } else if (t) this.at = now();
    const d = r.headers.get('x-arena-api-deployment');
    if (d) {
      this.apiDpl = d;
      if (r.status === 403 && d !== this.COST_DPL && d !== 'dpl_BcGa9YULV843didEQWsFTd5taD4h' && d !== 'dpl_9gD8cB3xQ7eTwzU2jLmVpR5kHs1Y') this.EXPIRED.add(d);
      else if (/\/cost\b/i.test(String(u || '')) && r.status === 200) this.learnDpl(d, false);
    }
    // 旧接口不接受当前请求（409 refresh_required）：这次运行改跟随新版，保证能正常发消息
    if (r.status === 409 && this.on()) r.clone().text().then(x => { if (/refresh_required/i.test(x)) this.fallback('旧部署要求刷新（409 refresh_required）'); }).catch(() => {});
  },
  fallback(why) { if (this.fellBack) return; this.fellBack = why || '旧部署不可用'; this.drop(); Bus.emit('pin'); try { toast('旧版固定暂时失效：' + this.fellBack + '，本次改跟随新版（新对话读不到型号）', 'err'); } catch {} },
  async check() {
    this.ensure(true);
    this.checkedAt=now();
    try { await Pulse.poll(); } catch {} // Version checks share the same quota request/cooldown.
    Bus.emit('pin'); return this.trigger;
  },
  set(p) {
    if (p && Object.hasOwn(p, 'pinDpl')) {
      const rest = { ...p };
      delete rest.pinDpl;
      if (Object.keys(rest).length) Object.assign(Prefs, rest);
      this.lockCostDpl(p.pinDpl);
      this.trigger = '';
      return this.check();
    }
    Object.assign(Prefs, p); savePrefs(); this.fellBack = ''; this.trigger = ''; this.ensure(true); Bus.emit('pin'); return this.check();
  },
  status() {
    if (Prefs.pinOn === false) return { st: 'off', text: '已关闭 · 跟随最新版本（新对话读不到运行令牌，只能按回复格式推测型号）' };
    if (this.fellBack) return { st: 'bad', text: '暂时失效 · ' + this.fellBack + '（关掉再打开或重启后重试）' };
    if (!this.trigger) return { st: 'wait', text: '已开启 · 正在检查接口版本…' };
    if (this.legacy()) return { st: 'ok', text: '已固定旧版 · 接口 trigger ' + this.trigger + ' · 新对话可识别型号' };
    if (this.costOk()) return { st: 'ok', text: '已固定计费兼容版 · 接口 trigger ' + this.trigger + ' · /cost 账单反推可用' };
    return { st: 'bad', text: '未生效 · 接口 trigger ' + this.trigger + '，旧部署可能已下线（可换部署编号）' };
  },
};
window.__ancPin = Pin;
try { Pin.initSmartPool(); Pin.ensureBillingFlags(true); } catch {}
// 10秒定时自愈守护（纯本地只读检查 localStorage PostHog 覆盖、ph-toolbar-overrides Cookie、arena_build_bucket=stable 与 __vdpl，零网络请求）
if (typeof window !== 'undefined' && !window.__ancCostWatchdog) {
  window.__ancCostWatchdog = setInterval(() => {
    try { if (location.hostname === 'arena.ai') Pin.ensure(false); } catch {}
  }, 10000);
}
// 官网页面（浏览器模式 / 网页注册 / 邮件验证链接）里：认证页面、或页面自己发注册 / 登录 / 验证请求时不固定旧部署——
// 否则注册邮件由旧部署发出、验证链接和「Create password」又由另一个部署处理，就会报 Session expired or not found
Pin.authUrl = u => { try { const x = new URL(String(u), location.href); return x.hostname === 'auth.arena.ai' || (x.hostname === 'arena.ai' && (/^\/(?:auth|login|signup|sign-up|sign-in|reset-password|verify|onboarding|create-password)/i.test(x.pathname) || /[?&](?:code|auth|token_hash|token)=/i.test(x.search))); } catch { return false; } };
if (location.pathname !== '/robots.txt' && Pin.authUrl(location.href)) Pin.hold(true); else Pin.ensure(true);
if (location.hostname === 'arena.ai' && location.pathname !== '/robots.txt' && typeof window.fetch === 'function' && !window.__ancPinFetch) {
  window.__ancPinFetch = true; const f0 = window.fetch;
  window.__ancPinFetchFn = window.fetch = function (input, init) { try { const u = new URL(typeof input === 'string' ? input : input?.url || String(input), location.href); if (u.hostname === 'arena.ai' && /^\/(?:nextjs-api|api)\/(?:sign-up|sign-in|signup|signin|reset-password|resend-verification|auth|magic-link|verify|set-password|create-password|onboarding)/i.test(u.pathname)) Pin.hold(true); } catch {} return f0.apply(this, arguments); };
}
// ---------- 所有账号共用的设置（宿主保存，localStorage 只做缓存）：主题等切换账号不丢；抽卡设置每个账号各自独立（见 Gacha）----------
const Shared = {
  keys: ['prefs'],
  async pull() {
    const prevGold = JSON.stringify([Prefs.goldMode || 'auto', Prefs.goldSet || [], Prefs.goldChats || []]);
    const prevGoldAt = Number(Prefs.goldAt || 0);
    await Promise.all(this.keys.map(async k => { try { const v = await Host.shared(k); if (v && typeof v === 'object') Store.set(k, v); else { const loc = Store.get(k, null); if (loc) Host.shared(k, loc); } } catch {} }));
    let sharedGold = null;
    try { sharedGold = await Host.shared('gold'); } catch {}
    const loadedPrefs = Store.get('prefs', {}) || {};
    Object.assign(Prefs, loadedPrefs);
    try { Pin.initSmartPool(); Pin.ensure(true); } catch {}
    if (sharedGold && typeof sharedGold === 'object' && (Number(sharedGold.at || 0) >= Number(Prefs.goldAt || 0) || !Prefs.goldMode)) {
      if (sharedGold.mode) Prefs.goldMode = sharedGold.mode;
      if (Array.isArray(sharedGold.set)) Prefs.goldSet = sharedGold.set;
      if (Array.isArray(sharedGold.chats)) Prefs.goldChats = sharedGold.chats;
      if (sharedGold.at) Prefs.goldAt = sharedGold.at;
      Store.set('prefs', Prefs);
    } else if (prevGoldAt > Number(Prefs.goldAt || 0)) {
      const old = JSON.parse(prevGold);
      Prefs.goldMode = old[0]; Prefs.goldSet = old[1]; Prefs.goldChats = old[2]; Prefs.goldAt = prevGoldAt;
      Store.set('prefs', Prefs);
    }
    const nextGold = JSON.stringify([Prefs.goldMode || 'auto', Prefs.goldSet || [], Prefs.goldChats || []]);
    if (prevGold !== nextGold) {
      try { if (typeof Gold !== 'undefined') { Gold._set = null; Gold._autoSet = null; } } catch {}
      try { Bus.emit('prefs'); Bus.emit('gold'); } catch {}
      try { if (typeof UI !== 'undefined' && UI.renderList) UI.renderList(); } catch {}
      try { if (typeof AcctStats !== 'undefined' && AcctStats.soon) AcctStats.soon(200); } catch {}
    }
  },
  push(k, v) { Store.set(k, v); try { Host.shared(k, v)?.catch?.(() => {}); } catch {} },
};
const Models = {
  all: (() => {
    const raw = Store.get('models', {}) || {};
    let dirty = false;
    for (const [k, m] of Object.entries(raw)) {
      if (m && (m.pendingConfirm || (m.guess && (m.habitInferred || m.reverseInferred || m.billingProbe || m.userCorrected)))) {
        if (Array.isArray(m.candidates) && m.candidates.length > 0) {
          const s0 = Number(m.candidates[0]?.score ?? m.candidates[0]?.confidence ?? 0);
          const s1 = Number(m.candidates[1]?.score ?? m.candidates[1]?.confidence ?? -1);
          if (m.candidates.length === 1 || s0.toFixed(1) !== s1.toFixed(1)) {
            m.name = m.candidates[0].id || m.candidateName || m.reverseLabel || m.name || '';
            m.pendingConfirm = false;
            m.guess = false;
            dirty = true;
          }
        } else {
          const validName = (m.name && !/^(未识别|未知型号|待定)$/.test(String(m.name).trim())) ? m.name : (m.candidateName || m.reverseLabel || '');
          if (validName && !/^(未识别|未知型号|待定)$/.test(String(validName).trim())) {
            m.name = validName;
            m.pendingConfirm = false;
            if (m.habitInferred || m.reverseInferred || m.billingProbe || m.userCorrected) {
              m.guess = false;
              if (Number(m.reverseMatch ?? m.confidence ?? 0) >= 75) m.sure = true;
            }
            dirty = true;
          }
        }
      }
    }
    if (dirty) try { Store.set('models', raw); } catch {}
    return raw;
  })(),
  get map() { return this.all; },
  get(sid) { return this.all[sid] || null; },
  set(sid, v) { if (v && typeof v.name === 'string' && typeof Strength !== 'undefined' && Strength.foldVer) {
      v = { ...v, name: Strength.canon ? Strength.canon(v.name) : Strength.foldVer(v.name) };
    }
    if (v && v.name && !/^(未识别|未知型号|待定)$/.test(String(v.name).trim()) && (v.habitInferred || v.reverseInferred || v.billingProbe || v.userCorrected)) {
      v = { ...v, pendingConfirm: false, guess: false };
    }
    this.all[sid] = { ...v, at: now() };
    const ks = Object.keys(this.all);
    if (ks.length > 3000) for (const k of ks.slice(0, ks.length - 3000)) delete this.all[k];
    Store.set('models', this.all);
    try { if (typeof MsgCache !== 'undefined' && MsgCache.putMeta) void MsgCache.putMeta('models', this.all); } catch {}
    Bus.emit('models', sid);
  },
};

// ---------- 国旗：国家 / 地区代码前面加小国旗（US → 🇺🇸 US）----------
const flagOf = cc => { cc = String(cc || '').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(cc) || cc === 'XX' || cc === 'T1') return ''; return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); };
const ccF = cc => { const f = flagOf(cc); return f ? f + ' ' + String(cc).toUpperCase() : String(cc || ''); };

// ---------- 事件总线 ----------
const Bus = (() => { const m = new Map(); return { on(e, f) { (m.get(e) || m.set(e, new Set()).get(e)).add(f); return () => m.get(e).delete(f); }, emit(e, ...a) { for (const f of m.get(e) || []) try { f(...a); } catch (err) { console.error(err); } } }; })();

// ---------- HTTP ----------
const NetHealth = new NetPolicy.Health({ clock: now, online: () => navigator.onLine !== false, changed: () => Bus.emit('connection') });
class HttpError extends Error {
  constructor(status, body, res) {
    super(`HTTP ${status}${body ? ' · ' + String(body).slice(0, 200) : ''}`);
    this.status = status; this.body = body; this.res = res;
    this.retryAfterMs = NetPolicy.retryAfter(res?.headers?.get?.('retry-after'), now());
  }
}
// 读对话（GET /api/chat/…）的限流状态：收到 429 后一段时间内不再做预读；预读同一时刻最多一条、两条之间留间隔——
// 网页不会因为鼠标划过列表就一口气拉很多个对话，客户端以前会（每张卡片停留 0.12 秒就预读一次），列表一划就是十几二十个请求。
const ReadLimit = {
  until: 0, inflight: 0, lastAt: 0,
  hit(ms) { this.until = Math.max(this.until, now() + Math.max(30000, Math.min(ms || 0, 600000))); },
  active() { return now() < this.until; },
  canPrefetch() { return !this.active() && this.inflight < 1 && now() - this.lastAt >= 700; },
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
  const isBg = !!opt.bg;
  delete init.noRelogin; delete init.timeout; delete init.bg; delete init._retried; delete init._retryCount; delete init._retried409; delete init.onProgress; delete init.noApiRetry;
  const mark = NetHealth.mark(), read = /^(GET|HEAD)$/i.test(init.method || 'GET');
  const isCost = /\/api\/chat\/[^/]+\/cost\b/i.test(path);
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
    const prevRl = ReadLimit.until; if (res.status === 429 && (read || /^\/api\/chat\//.test(path))) ReadLimit.hit(error.retryAfterMs); if (isCost) ReadLimit.until = prevRl;
    if (!isBg && !isCost && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [408, 502, 503, 504, 520, 522, 524].includes(res.status)) void AutoRoute.onErrorSwitch(error, path);
    throw error;
  }
  let value; try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  if (path === '/api/me') NetPolicy.sessionValue(value);
  // Only completed first-party API responses count; static pages and IP probes do not.
  if (/^\/(?:api|nextjs-api)\//.test(path) && (value === null || typeof value === 'object')) {
    NetHealth.good('api');
    if (!opt.bg && ReadLimit.until > 0) ReadLimit.until = 0;
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
  async signIn(email, password) {
    email = AuthFlow.email(email);
    if (!AuthFlow.EMAIL.test(email)) throw new Error('邮箱格式不正确');
    if (!password) throw new Error('请输入密码');
    if (this.interactive || AuthEnv.operations) throw Error('另一认证步骤正在进行，请等待结果');
    this.interactive = true; AuthEnv.operations++; AuthEnv.paint();
    try {
      const environment = await AuthEnv.begin('login', email);
      const signedIn = await this.post('/nextjs-api/sign-in/email', { email, password, shouldLinkHistory: false }, { requireSuccess: true });
      let me;
      try { me = await api('/api/me', { noRelogin: true }); }
      catch (e) { throw AuthFlow.sessionError(e); }
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
  // 会话失效（401）时用本账号保存的密码自动重新登录；同一时间只登录一次，30 秒内不重复
  relogin() {
    if (AuthEnv.state?.locked || AuthEnv.starting || AuthEnv.operations || this.interactive) return Promise.resolve(false);
    return this.busy ||= (async () => {
      try {
        const c = await Host.getCred().catch(() => null); if (!c?.email || !c?.password) return false;
        await this.signIn(c.email, c.password); this.lastErr = ''; Bus.emit('relogin'); return true;
      } catch (e) { this.lastErr = e.message || String(e); return false; }
      finally { setTimeout(() => { this.busy = null; }, 30000); }
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
      Host.noteAccount({
        email: UI.me?.email ? (UI.host?.account?.email || UI.me.email) : undefined, loggedIn: !!UI.me, ip: IP.ip || undefined, loc: IP.loc || undefined,
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
        const domTok = await Promise.race([grecaptcha.enterprise.execute(RC_V3, { action }), sleep(12000).then(() => { throw new Error('reCAPTCHA 超时'); })]);
        if (domTok) return domTok;
      } catch (err) {
        const pTok = await protoV3(action);
        if (pTok) return pTok;
        throw err;
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
  let cache = null, warming = null;
  const cachePool = {}, warmingPool = {};
  function warm(action = 'chat_submit') {
    const slot = cachePool[action];
    if (warmingPool[action] || (slot && now() - slot.at < 90000)) return;
    warmingPool[action] = v3(action).then(t => {
      if (t) {
        cachePool[action] = { t, at: now(), action };
        if (action === 'chat_submit') cache = cachePool[action];
      }
    }).catch(() => {}).finally(() => { warmingPool[action] = null; if (action === 'chat_submit') warming = null; });
    if (action === 'chat_submit') warming = warmingPool[action];
  }
  async function take(action = 'chat_submit') {
    const slot = cachePool[action];
    if (slot && now() - slot.at < 100000) {
      const t = slot.t;
      delete cachePool[action];
      if (action === 'chat_submit') cache = null;
      setTimeout(() => warm(action), 450);
      return t;
    }
    if (cache && now() - cache.at < 100000 && cache.action === action) { const t = cache.t; cache = null; return t; }
    if (warmingPool[action]) {
      await Promise.race([warmingPool[action], sleep(8000)]);
      const ready = cachePool[action];
      if (ready && now() - ready.at < 100000) {
        const t = ready.t;
        delete cachePool[action];
        if (action === 'chat_submit') cache = null;
        return t;
      }
    }
    const tok = await v3(action);
    setTimeout(() => warm(action), 650);
    return tok;
  }
  return { load, protoV3, v3, v2, v2Close, v2Showing, warm, take, LANGS, hl };
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
const Trigger = (() => {
  let gate = 0, useProxy = Store.get('td:proxy', 0) > now();
  async function get(path, tok, signal) {
    for (let i = 0; ; i++) {
      const w = gate - now(); if (w > 0) await NetPolicy.deadline(() => sleep(w), { timeout: w + 1000, signal }); gate = Math.max(now(), gate) + 120;
      const bases = useProxy ? [ORIGIN + '/ai-proxy', 'https://api.trigger.dev'] : [ORIGIN + '/ai-proxy', 'https://api.trigger.dev'];
      let res, lastErr;
      for (const b of bases) {
        try { res = await rawFetch(b + path, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal }); break; }
        catch (e) { if (signal?.aborted) throw e; lastErr = e; if (b.startsWith('https://api.trigger.dev')) { useProxy = true; Store.set('td:proxy', now() + 1800000); } }
      }
      if (!res) throw lastErr || new Error('网络错误');
      if (res.status === 429 && i < 4) { gate = now() + Math.max(30000, NetPolicy.retryAfter(res.headers?.get('retry-after')), Math.min(8000, 1500 * 2 ** i)); continue; }
      if (!res.ok) throw new HttpError(res.status, '', res);
      return res.json();
    }
  }
  const STREAM = /^ai\.streamText(\.doStream)?$/, USAGE = /^(token\.usage\.recorded|compaction\.context_usage)$/;
  const valid = n => typeof n === 'string' && /^[A-Za-z0-9][\w.\/:@+-]{1,80}$/.test(n.trim());
  const base = n => String(n || '').toLowerCase().replace(/-\d{4}-?\d{2}-?\d{2}$/, '').replace(/-(preview|latest|exp)$/, '');
  const apiOf = x => { const md = x?.p?.ai?.telemetry?.metadata || {}; const n = md.apiModelName || x?.p?.ai?.model?.id || x?.p?.gen_ai?.request?.model || null; return valid(n) ? n.trim() : null; };
  const respOf = x => { const r = x?.p?.ai?.response?.model || x?.p?.gen_ai?.response?.model || x?.p?.['ai.response.model'] || null; return valid(r) ? r.trim() : null; };
  // 型号系列：claude-opus-5.5-max-vertex / claude-opus-5-5 → claude-opus-5-5（去掉档位和平台后缀，比较是不是同一个模型）
  const fam = (...ns) => { for (const n of ns) { if (!n) continue; try { const f = Strength.parts(n).family; if (f) return f.replace(/^models\//, ''); } catch {} return base(n); } return ''; };
  const outTok = x => { const u = x?.p?.ai?.usage || {}, g = x?.p?.gen_ai?.usage || {}; return +(u.completionTokens ?? u.outputTokens ?? g.output_tokens ?? g.completion_tokens ?? 0) || 0; };
  function pickMain(ok, internal) {
    if (ok.length <= 1) return ok[0] || null;
    if (internal) { const f = fam(internal), hit = ok.filter(x => fam(apiOf(x)) === f || fam(respOf(x)) === f); if (hit.length) return hit.at(-1); }
    const g = new Map(); for (const x of ok) { const k = apiOf(x) || '?'; const v = g.get(k) || { n: 0, out: 0, last: x }; v.n++; v.out += outTok(x); v.last = x; g.set(k, v); }
    return [...g.values()].sort((a, b) => b.n - a.n || b.out - a.out)[0].last;
  }
  // 返回 { name, internal, request, provider, tier, routed }
  async function identify(runTok, signal, maxMs = 45000, onL1) {
    const runId = /read:runs:(run_\w+)/.exec(JSON.stringify(jwt(runTok)?.scopes || ''))?.[1];
    if (!runId) throw new Error('运行令牌无效');
    const det = new Map(), until = now() + maxMs; let l1 = null, l1At = 0, useAt = 0;
    while (now() < until) {
      if (signal?.aborted) throw new Error('已取消');
      let ev = []; try { ev = (await get('/api/v1/runs/' + runId + '/events', runTok, signal)).events || []; } catch (e) { if (e.status === 401 || e.status === 403) throw new Error('运行令牌已过期'); }
      const want = ev.filter(e => e?.spanId && !det.has(e.spanId) && (STREAM.test(e.message) || USAGE.test(e.message)));
      await Promise.all(want.slice(0, 4).map(async e => { try { const d = await get('/api/v1/runs/' + runId + '/spans/' + e.spanId, runTok, signal); det.set(e.spanId, { e, p: d?.properties || {}, err: !!(e.isError || d?.isError) }); } catch {} }));
      const all = [...det.values()], streams = all.filter(x => STREAM.test(x.e.message)).sort((a, b) => String(a.e.startTime).localeCompare(String(b.e.startTime)));
      const ok = streams.filter(x => !x.err);
      const use = k => all.find(x => x.e.message === k && valid(x.p?.modelName))?.p.modelName || null;
      const served = use('token.usage.recorded'), comp = use('compaction.context_usage');
      // 一轮里可能夹着 Brana 自己的辅助调用（例如 models/barium-bb-v2 这类内部模型），它常常排在最后：
      // 不再简单取最后一次调用，而是取「回答模型」——和用量记录里的内部名称同一系列的；没有用量记录时取调用次数最多、输出最多的那个
      const s = pickMain(ok, served || comp);
      const names = new Set(ok.map(apiOf).filter(Boolean));
      const routed = streams.some(x => x.err) || (names.size > 1 && !(served && s && fam(apiOf(s), respOf(s)) === fam(served)));
      if (s) { const md = s.p?.ai?.telemetry?.metadata || {}, apiName = md.apiModelName || s.p?.ai?.model?.id || s.p?.gen_ai?.request?.model || null; if (valid(apiName) && (!l1 || l1.api !== apiName)) { l1 = { api: apiName, provider: md.modelProvider || s.p?.ai?.model?.provider || '', adapter: s.p?.ai?.model?.provider || '' }; l1At ||= now(); try { onL1?.(apiName); } catch {} } }
      if (comp || served) useAt ||= now();
      let internal = served;
      if (!internal && comp && l1 && !routed && base(comp).startsWith(base(l1.api))) internal = comp;
      if (!internal && comp && now() - useAt > 6000) internal = comp;
      // 响应型号（ai.response.model）：代号模型（spirit / golem…）只有靠它才知道厂商和型号
      if (l1 && s) { const r = respOf(s) || ok.filter(x => apiOf(x) === l1.api).map(respOf).filter(Boolean).at(-1); if (r) l1.response = r; }
      if (internal) {
        const nm = Strength.compose({ request: l1?.api, response: l1?.response, internal });
        if (Brand.of(nm) || now() - useAt > 15000) return pack(internal, l1, routed, null);
        if (s && !respOf(s)) det.delete(s.e.spanId);   // 流还没结束，稍后重读这条 span 拿响应型号
      }
      if (l1 && now() - l1At > 20000) return pack(null, l1, routed, null);
      await sleep(500);
    }
    if (l1) return pack(null, l1, false);
    throw new Error('记录里没有模型信息');
  }
  function pack(internal, l1, routed, usd) {
    try { const head = n => String(n || '').replace(/^models\//i, '').split(/[-_]/)[0].toLowerCase(); for (const n of [l1?.response, l1?.api, internal && head(internal) === head(l1?.api) ? internal : null]) if (n) Brand.learn(n, l1?.provider, l1?.adapter); } catch {}
    const name = Strength.compose({ request: l1?.api, response: l1?.response, internal }) || (internal || l1?.api || '').trim();
    const p = Strength.parts(name), tier = p.tier || null;
    return { name, internal: internal || null, request: l1?.api || null, response: l1?.response || null, provider: l1?.provider || '', tier, routed: !!routed, partial: !internal, usd: usd || null };
  }
  return { identify, get, pickMain, apiOf };
})();

// ---------- 对话会话 ----------
// 从任意文本里找「本轮运行令牌」：JWT 且 scopes 里有 read:runs:run_…（记录头 / 记录内容 / 旧对话回放都用它）
function runTokIn(txt) {
  let best = null, bestExp = 0;
  for (const m of String(txt || '').matchAll(/eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g)) { const p = jwt(m[0]); if (p && /read:runs:run_/.test(JSON.stringify(p.scopes || '')) && (p.exp || 0) >= bestExp) { best = m[0]; bestExp = p.exp || 0; } }
  return best;
}
const ProtocolSchema = (() => {
  const DEF = { ver: 1, outTpl: '/ai-proxy/realtime/v1/sessions/{sid}/out', inTpl: '/ai-proxy/realtime/v1/sessions/{sid}/in/append', tokPath: '/api/chat/trigger-token', updatedAt: 0 };
  let cur = Object.assign({}, DEF, Store.get('proto:schema', {}) || {}), probing = null;
  const save = () => { try { Store.set('proto:schema', cur); } catch {} };
  const outUrl = sid => ORIGIN + String(cur.outTpl || DEF.outTpl).replace('{sid}', encodeURIComponent(sid));
  const inUrl = sid => ORIGIN + String(cur.inTpl || DEF.inTpl).replace('{sid}', encodeURIComponent(sid));
  function learnFromScript(txt) {
    if (!txt || typeof txt !== 'string') return false;
    let ch = false;
    const mOut = /\/ai-proxy\/realtime\/v\d+\/sessions\/(?:\$\{[^}]+\}|[a-zA-Z0-9_-]+)\/out/.exec(txt);
    if (mOut) { const tpl = mOut[0].replace(/\/sessions\/[^/]+\/out/, '/sessions/{sid}/out'); if (tpl && tpl !== cur.outTpl) { cur.outTpl = tpl; ch = true; } }
    const mIn = /\/ai-proxy\/realtime\/v\d+\/sessions\/(?:\$\{[^}]+\}|[a-zA-Z0-9_-]+)\/in\/[a-z-]+/.exec(txt);
    if (mIn) { const tpl = mIn[0].replace(/\/sessions\/[^/]+\/in\//, '/sessions/{sid}/in/'); if (tpl && tpl !== cur.inTpl) { cur.inTpl = tpl; ch = true; } }
    if (ch) { cur.updatedAt = now(); save(); }
    return ch;
  }
  async function autoSync(force = false) {
    if (probing) return probing;
    if (!force && cur.updatedAt && now() - cur.updatedAt < 6 * 3600e3) return false;
    return probing = (async () => {
      try {
        const res = await _rawFetch(ORIGIN + '/', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return false;
        const html = await res.text(); learnFromScript(html);
        const scripts = [...html.matchAll(/<script[^>]+src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g)].map(m => m[1]).slice(0, 4);
        for (const s of scripts) { try { const jr = await _rawFetch(ORIGIN + s, { credentials: 'same-origin' }); if (jr.ok) learnFromScript(await jr.text()); } catch {} }
        cur.updatedAt = now(); save(); return true;
      } catch { return false; } finally { probing = null; }
    })();
  }
  function noteError(status) { if (status === 404 || status === 410 || status === 422) void autoSync(true); }
  return { outUrl, inUrl, learnFromScript, autoSync, noteError, get current() { return cur; } };
})();
const OUT = sid => ProtocolSchema.outUrl(sid);
const IN = sid => ProtocolSchema.inUrl(sid);
// ---------- 人在回路（HITL）：ask_user / propose_plan / add_voice / generate_image ----------
const HITL_RE = /^(?:arena__)?(ask_user|add_voice|propose_plan|generate_image)$/;
const Hitl = {
  name(p) { if (!p || !p.toolCallId) return null; const m = HITL_RE.exec(p.toolName || String(p.type || '').replace(/^tool-/, '')); return m ? m[1] : null; },
  // 工具输出可能是对象、JSON 字符串，或 {type:'json', value} 包装：统一成对象再判断
  norm(o) {
    if (typeof o === 'string') { const t = o.trim(); if (/^[{[]/.test(t)) { try { o = JSON.parse(t); } catch {} } }
    if (o && typeof o === 'object' && o.type === 'json' && o.value && typeof o.value === 'object') o = o.value;
    return o;
  },
  awaitingOut(o) { o = Hitl.norm(o); return !!o && typeof o === 'object' && /^awaiting[_-]?user(?:[_-]?(?:response|input))?$/i.test(String(o.status || o.type || '')); },
  // 只有真正的回答才算「已回答」：等待标记、占位、报错对象都不算（否则卡片会被画成已回答「（空）」）
  isAnswer(n, o) {
    o = Hitl.norm(o); if (!o || typeof o !== 'object' || Hitl.awaitingOut(o)) return false;
    if (n === 'ask_user') return Array.isArray(o.answers) || o.skipped === true;
    if (n === 'propose_plan') return typeof o.decision === 'string';
    return o.selection_method != null || o.selected_index != null || o.voice_id != null;
  },
  // 实时流里提问工具偶尔带一个「工具响应格式错误」的报错，但服务器上这张卡片仍在等回答（网页照常显示面板）
  softErr(p) { return p.state === 'output-error' && /malformed|refresh and try again/i.test(String(p.errorText || '')); },
  awaiting(p) {
    const n = Hitl.name(p); if (!n) return false;
    if (p.state === 'output-available') return Hitl.awaitingOut(p.output) || (n === 'ask_user' && !Hitl.isAnswer(n, p.output));
    if (n === 'ask_user' && Hitl.softErr(p) && Array.isArray(Hitl.input(p)?.questions)) return true;
    return n === 'ask_user' && (p.state === 'input-available' || p.state === 'input-streaming');
  },
  input(p) {
    if (p.input !== undefined && p.input !== null) { if (typeof p.input !== 'string') return p.input; try { return JSON.parse(p.input); } catch {} }
    if (p.inputText) { try { return JSON.parse(p.inputText); } catch {} }
    return p.input === null ? undefined : p.input;
  },
  // 所有已提交的回答（来自后续用户消息里的 data-tool-results），加上本地暂存的
  answers(chat) {
    const m = new Map();
    if (!chat?.messages) return m;
    for (const msg of chat.messages) if (msg.role === 'user' && !msg.failed) for (const p of msg.parts || [])   // 没发出去（failed）的那条不算已回答：卡片回到「未回答」
      if (p.type === 'data-tool-results' && Array.isArray(p.data)) p.data.forEach(r => r?.toolCallId && m.set(r.toolCallId, r.output));
    (chat.hitlStage || new Map()).forEach((v, k) => { if (!m.has(k)) m.set(k, v.output); });
    return m;
  },
  answerOf(chat, p) { const a = Hitl.answers(chat).get(p.toolCallId); if (a !== undefined) return a; const n = Hitl.name(p); return p.state === 'output-available' && Hitl.isAnswer(n, p.output) ? Hitl.norm(p.output) : undefined; },
  // 最后一条助手消息里（最后一个 step 之后）等待用户回应的调用
  pending(chat) {
    const last = chat?.messages?.at(-1); if (!last || last.role !== 'assistant' || Hitl.blocked(chat)) return [];
    if (last.metadata?.feedback?.interruption === 'stop' || last.metadata?.aborted) return [];
    const ans = Hitl.answers(chat);
    return (last.parts || []).filter(p => Hitl.awaiting(p) && !(ans.has(p.toolCallId) && !chat.hitlStage?.has(p.toolCallId)));
  },
  // 交互卡片（提问 / 计划 / 选图 / 选声音）：用户没选而直接在输入框发下一条消息时，按官方 Skip 的结果一并提交，文字跟着一起发
  skipOut(p) {
    const n = Hitl.name(p); if (!n) return null;
    if (n === 'ask_user') return { skipped: true, answers: [] };
    if (n === 'propose_plan') return { decision: 'no_decision' };
    const raw = Hitl.norm(p.output), o = raw && typeof raw === 'object' ? raw : {};
    return n === 'add_voice' ? { status: 'completed', candidates: Array.isArray(o.candidates) ? o.candidates : [], selected_index: 0, selection_method: 'skip', ...(o.voice_id ? { voice_id: o.voice_id } : {}) } : { status: 'completed', selected_index: 0, selection_method: 'skip' };
  },
  // 待回应的交互卡片（提问 / 计划 / 选图 / 选声音，或已暂存回答）→ 返回这些卡片供直接发消息时自动跳过并附带提交
  skippable(chat) { if (!chat) return null; const l = Hitl.pending(chat); return l.length && l.every(p => chat.hitlStage?.has(p.toolCallId) || Hitl.skipOut(p)) ? l : null; },
  isPendingPart(chat, p) { return Hitl.pending(chat).includes(p); },
  // 最后一条助手消息停在「等用户回应」：服务器把它标成 pending，但这一轮其实已经结束（在等我们提交）
  idleWait(chat) {
    const last = chat?.messages?.at(-1);
    if (!last || last.role !== 'assistant' || last.metadata?.aborted) return false;
    const parts = last.parts || [];
    if (!chat.live) return parts.some(p => Hitl.awaiting(p));
    // 结束标记（turn-complete）迟到 / 丢失时：这一条已经 finish，或服务器已明确返回「等待用户回应」，提问卡片立即可用，不必刷新
    if (chat.live !== last) return false;
    return parts.some(p => Hitl.awaiting(p) && p.state !== 'input-streaming' && (last.metadata?.pending === false || (p.state === 'output-available' && Hitl.awaitingOut(p.output)) || (Hitl.name(p) === 'ask_user' && p.state === 'input-available')));
  },
  // 真的在跑（有回复在输出 / 刚发出等回复）才算忙；只是停在提问卡片上等回答的「streaming」不算
  blocked(chat) { return !!chat?.busy && !(chat.status === 'streaming' && Hitl.idleWait(chat)); },
};

// ---------- 对话本地缓存（IndexedDB，按账号分区）：打开对话时先秒开上次的内容，同时后台向服务器同步最新 ----------
const MsgCache = (() => {
  let dbp = null; const timers = new Map(), MAX = 5000, CAP = 20e6;
  const db = () => dbp ||= new Promise(res => { try { const r = indexedDB.open('anc-msgs', 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
  const idx = () => Store.get('mc:idx', {}) || {};
  async function get(sid) {
    const d = await db(); if (!d) return null;
    return new Promise(res => { try { const q = d.transaction('c').objectStore('c').get(sid); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
  }
  async function del(keys) { const d = await db(); if (!d || !keys.length) return; try { const st = d.transaction('c', 'readwrite').objectStore('c'); for (const k of keys) st.delete(k); } catch {} }
  function compactMsgs(rawMsgs) {
    const truncStr = (s, lim = 16000) => (typeof s === 'string' && s.length > lim) ? s.slice(0, lim) + '\n…[cached]' : s;
    const compactOut = (o, lim = 16000) => {
      if (!o) return o;
      if (typeof o === 'string') return o.length > lim ? truncStr(o, lim) : o;
      if (typeof o !== 'object' || Array.isArray(o)) return o;
      let oc = false;
      const next = { ...o };
      for (const k of ['stdout', 'stderr', 'content', 'text', 'raw']) {
        if (typeof next[k] === 'string' && next[k].length > lim) { next[k] = truncStr(next[k], lim); oc = true; }
        else if (next[k] && typeof next[k] === 'object' && !Array.isArray(next[k])) {
          let sc = false;
          const sub = { ...next[k] };
          for (const sk of ['stdout', 'stderr', 'content', 'text', 'raw']) {
            if (typeof sub[sk] === 'string' && sub[sk].length > lim) { sub[sk] = truncStr(sub[sk], lim); sc = true; }
          }
          if (sc) { next[k] = sub; oc = true; }
        }
      }
      return oc ? next : o;
    };
    let msgs = rawMsgs.filter(m => !m._local && !m.failed).slice(-200).map(({ v, ...m }) => m), js = JSON.stringify(msgs);
    if (js.length > 4e6) {
      msgs = msgs.map(m => ({ ...m, parts: (m.parts || []).map(p => {
        if (!p || !p.output) return p;
        const co = compactOut(p.output, 16000);
        return co === p.output ? p : { ...p, output: co };
      }) }));
      js = JSON.stringify(msgs);
    }
    if (js.length > CAP) {
      msgs = msgs.map(m => ({ ...m, parts: (m.parts || []).map(p => {
        if (!p || !p.output) return p;
        const co = compactOut(p.output, 4000);
        return co === p.output ? p : { ...p, output: co };
      }) }));
      js = JSON.stringify(msgs);
    }
    while (js.length > CAP && msgs.length > 2) { msgs = msgs.slice(Math.ceil(msgs.length / 2)); js = JSON.stringify(msgs); }
    return { msgs, js };
  }
  async function writeNow(chat, allowBusy = false) {
    const hasMsgs = Array.isArray(chat?.messages) && chat.messages.length > 0;
    if (!chat || (!chat.loaded && !hasMsgs) || (chat.busy && !allowBusy)) return;
    try { if (History.goneMap().has(chat.sid)) return; if (typeof Arch !== 'undefined' && Arch.has?.(chat.sid)) return; } catch {}
    const d = await db(); if (!d) return;
    const { msgs, js } = compactMsgs(chat.messages || []);
    if (js.length > CAP || !msgs.length) return;
    const histUpdatedAt = (typeof History !== 'undefined' && History.byId?.(chat.sid)?.updatedAt) || null;
    try { d.transaction('c', 'readwrite').objectStore('c').put({ at: now(), histUpdatedAt, messages: JSON.parse(js), more: chat.hasMore || msgs.length < chat.messages.length, lastSeq: chat.lastSeq || null, token: chat.token || null, tokenExp: chat.tokenExp || 0 }, chat.sid); } catch { return; }
    const ix = idx(); ix[chat.sid] = now(); const ks = Object.keys(ix);
    if (ks.length > MAX) { const old = ks.sort((a, b) => ix[a] - ix[b]).slice(0, ks.length - MAX); for (const k of old) delete ix[k]; del(old); }
    Store.set('mc:idx', ix);
    try { d.transaction('c', 'readwrite').objectStore('c').put(ix, '__meta__:mc:idx'); } catch {}
  }
  function put(chat) {
    if (!chat || (typeof Arch !== 'undefined' && Arch.has?.(chat.sid))) return;
    clearTimeout(timers.get(chat.sid));
    timers.set(chat.sid, setTimeout(() => { timers.delete(chat.sid); void writeNow(chat, false); }, 2000));
  }
  async function getMeta(key) {
    const d = await db(); if (!d) return null;
    return new Promise(res => { try { const q = d.transaction('c').objectStore('c').get('__meta__:' + key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
  }
  async function putMeta(key, val) {
    const d = await db(); if (!d) return;
    try { d.transaction('c', 'readwrite').objectStore('c').put(val, '__meta__:' + key); } catch {}
  }
  async function allKeys() {
    const memKeys = Object.keys(idx());
    const d = await db(); if (!d) return memKeys;
    return new Promise(res => {
      try {
        const q = d.transaction('c').objectStore('c').getAllKeys();
        q.onsuccess = () => {
          const idbKeys = (q.result || []).map(String).filter(k => k && !k.startsWith('__meta__:'));
          const all = [...new Set([...memKeys, ...idbKeys])];
          if (idbKeys.length > memKeys.length) {
            try {
              const ix = idx();
              const t = now();
              for (const k of idbKeys) if (!ix[k]) ix[k] = t;
              Store.set('mc:idx', ix);
            } catch {}
          }
          res(all);
        };
        q.onerror = () => res(memKeys);
      } catch { res(memKeys); }
    });
  }
  return { get, put, putNow: chat => writeNow(chat, true), keys: () => Object.keys(idx()), allKeys, getMeta, putMeta, del: sid => { clearTimeout(timers.get(sid)); timers.delete(sid); const ix = idx(); delete ix[sid]; Store.set('mc:idx', ix); del([sid]); } };
})();

const Chats = new Map();
const chatOf = sid => Chats.get(sid) || (Chats.set(sid, new Chat(sid)), Chats.get(sid));

class Chat {
  constructor(sid) {
    this.sid = sid; this.messages = []; this.status = 'idle'; this.error = null; this.token = null; this.tokenExp = 0;
    this.lastSeq = null; this.loaded = false; this.loading = null; this.hasMore = false; this.cursor = null;
    this.live = null; this.parts = new Map(); this.streaming = false; this.gen = 0; this.ctl = null;
    this.title = ''; this.v = 0; this.phase = ''; this.lastActivity = 0; this.runTok = null; this.identifying = false;
  }
  get busy() { return this.status === 'submitted' || this.status === 'streaming' || this.status === 'stopping'; }
  emit() { if (this._emitT) { clearTimeout(this._emitT); this._emitT = 0; } this._lastEmitAt = now(); this.v++; if (this.wCtl && (this.busy || this.streaming)) { try { this.wCtl.abort(); } catch {} this.wCtl = null; } Bus.emit('chat', this); if ((this.loaded || (Array.isArray(this.messages) && this.messages.length > 0)) && !this.busy) MsgCache.put(this); }
  emitStreamSoon(delay = 20) { if (this._emitT) return; const el = now() - (this._lastEmitAt || 0); if (el >= delay) { this.emit(); return; } this._emitT = setTimeout(() => { this._emitT = 0; this.emit(); }, Math.max(12, delay - el)); }
  // 鼠标移到侧栏卡片上就先把对话内容拉下来，点开时直接用（30 秒内有效）
  prefetch() {
    if (this.loaded || this.loading || this._preP || (this._pre && now() - this._pre.at < 30000) || now() - (this._preAt || 0) < 180000) return;   // 同一个对话 3 分钟内只预读一次（鼠标反复划过不重复下载）
    const curSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    if (curSid && curSid !== this.sid && Chats.get(curSid)?.loading) return;   // 当前正点开的对话在加载中：暂停预读让路
    if (!ReadLimit.canPrefetch()) return;   // 限流中 / 已有一条预读在途 / 离上一条太近：跳过，点开时再正常加载
    ReadLimit.inflight++; ReadLimit.lastAt = now(); this._preAt = now();
    this._preP = api('/api/chat/' + this.sid, { timeout: 30000, bg: true }).then(c => { this._pre = { c, at: now() }; return c; }).finally(() => { this._preP = null; ReadLimit.inflight = Math.max(0, ReadLimit.inflight - 1); });
    this._preP.catch(() => {});
  }
  // 预热（窗口切换器 / 相邻窗口）：先放本地缓存秒出，再后台拉服务器最新内容；点开时 30 秒内直接用这份，不再等网络
  async warm() {
    if (this.loaded || this.loading) return;
    if (!this.messages.length) { const x = await MsgCache.get(this.sid).catch(() => null); if (x?.messages?.length && !this.loaded && !this.loading && !this.messages.length) { this.messages = x.messages.map(m => ({ ...m, v: 0 })); this.cached = true; this.hasMore = !!x.more; this.emit(); } }
    if (this.loaded || this.loading) return;
    this.prefetch();
    const c = await (this._preP || Promise.resolve(this._pre?.c)).catch(() => null);
    if (!c?.messages?.length || this.loaded || this.loading || this.messages.some(m => m._local)) return;
    this.messages = c.messages.map(m => ({ ...m, v: 2 })); this.cached = true; this.hasMore = !!c.pagination?.hasMore; this.emit();
  }
  markBadToken(tok) {
    if (typeof tok === 'string' && tok.length > 20) (this._badToks ||= new Set()).add(tok);
    if (!tok || this.token === tok) { this.token = null; this.tokenExp = 0; }
  }
  setToken(t, exp) {
    if (!t || this._badToks?.has(t)) return;
    this.token = t;
    const jwtExp = (jwt(t)?.exp || 0) * 1000;
    this.tokenExp = Number(exp) > now() ? Number(exp) : (jwtExp || (now() + 8 * 60000));
    this.tokenAt = now();
  }
  async wakeSessionToken(force = false) {
    const prevTok = this.token, prevExp = this.tokenExp;
    const stale = !this.token || !this.tokenAt || (now() - this.tokenAt > 45000);
    if (!force && !stale && (this.tokenExp || 0) - 120000 > now()) return this.token;
    try {
      const j = await api('/api/chat/trigger-token', { json: { sessionId: this.sid }, timeout: 10000 });
      const tok = j?.token || j?.publicAccessToken;
      if (typeof tok === 'string' && tok) {
        const exp = Number(j?.expiresAt || j?.exp || 0);
        this.setToken(tok, exp > 1e12 ? exp : exp > 1e9 ? exp * 1000 : 0);
        return this.token;
      }
    } catch {}
    if (prevTok && !this._badToks?.has(prevTok) && (prevExp || 0) > now() + 15000) {
      this.token = prevTok;
      this.tokenExp = prevExp;
      return prevTok;
    }
    return this.ensureToken(force);
  }
  ensureToken(force) {
    if (this.tokenP) return this.tokenP;
    if (!force && this.token && !this._badToks?.has(this.token) && this.tokenExp - 120000 > now()) return Promise.resolve(this.token);
    if (force && this.token) { this.markBadToken?.(this.token); this.token = null; this.tokenExp = 0; }
    // Send, live stream and read-only reconciliation share this account/chat's refresh.
    this.tokenP = (async () => {
      const j = await api('/api/chat/trigger-token', { json: { sessionId: this.sid }, timeout: 20000 });
      const token = j?.token || j?.publicAccessToken;
      if (typeof token !== 'string' || !token) throw new Error('无法获取会话令牌');
      const exp = Number(j?.expiresAt || j?.exp || 0);
      this.setToken(token, exp > 1e12 ? exp : exp > 1e9 ? exp * 1000 : 0);
      return this.token;
    })().finally(() => { this.tokenP = null; });
    return this.tokenP;
  }
  load(force) {
    if (this.loaded && !force) return Promise.resolve();
    // 秒开（含从浏览器模式切回 Scheme B 及常规点击）：先显示本地缓存并恢复 lastSeq；若历史 updatedAt 未变或刚缓存过，直接 0ms 完成加载并转后台静默对账
    if (!this.messages.length) MsgCache.get(this.sid).then(x => {
      if (x?.messages?.length && !this.loaded && !this.messages.length) {
        this.messages = x.messages.map(m => {
          if (m?.role === 'assistant' && !m.metadata?.pending && Array.isArray(m.parts)) {
            for (const p of m.parts) {
              if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                p.state = 'output-error';
                if (!p.errorText) p.errorText = '未返回结果';
              }
            }
          }
          return { ...m, v: 0 };
        });
        this.cached = true; this.hasMore = !!x.more;
        if (x.lastSeq && !this.lastSeq) this.lastSeq = String(x.lastSeq);
        if (x.token && !this.token && (x.tokenExp || 0) > now() + 30000) { this.token = x.token; this.tokenExp = x.tokenExp; this.tokenAt = 0; }
        const histRow = typeof History !== 'undefined' ? History.byId?.(this.sid) : null;
        const lastCached = x.messages.at(-1);
        const isFastRet = Boolean(window.__ANC_FAST_RETURN);
        const isIdleComplete = lastCached?.role === 'assistant' && !lastCached?.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(lastCached)) && !this.busy;
        const isUnchangedByHist = Boolean(!isFastRet && isIdleComplete && histRow?.updatedAt && x.histUpdatedAt && histRow.updatedAt === x.histUpdatedAt);
        if (!force && (isUnchangedByHist || (isFastRet && now() - (x.at || 0) < 30 * 60e3))) {
          this.cached = false; this.loaded = true; this.error = null; this._lastSyncedHistAt = histRow?.updatedAt || x.histUpdatedAt || null; this.emit();
          if (isFastRet) {
            setTimeout(() => {
              try { if (typeof History !== 'undefined' && History.refresh) void History.refresh(); } catch {}
              if (this.loaded && !this.busy) void (this.resumeIncremental ? this.resumeIncremental('fast-return') : this.quickSync(true));
            }, 30);
          } else if (isUnchangedByHist) {
            setTimeout(() => { if (this.loaded && !this.busy && typeof this.reconcile === 'function') void this.reconcile(0).catch(() => {}); }, 80);
          } else {
            setTimeout(() => { if (this.loaded) this.quickSync(true); }, 20);
          }
          return;
        }
        this.emit();
      }
    }).catch(() => {});
    if (typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE && !force) {
      return this.loading ||= (async () => {
        try {
          if (!this.messages.length) {
            const x = await MsgCache.get(this.sid).catch(() => null);
            if (x?.messages?.length) { this.messages = x.messages.map(m => ({ ...m, v: 0 })); this.hasMore = !!x.more; }
          }
          this.cached = false; this.loaded = true; this.error = this.messages.length ? null : '本地暂无该对话的正文缓存'; this.emit();
        } finally { this.loading = null; }
      })();
    }
    return this.loading ||= (async () => {
      try {
        if (!this.messages.length) {
          const x = await MsgCache.get(this.sid).catch(() => null);
          if (this.loaded && !force) return;
          if (x?.messages?.length && !this.messages.length) {
            this.messages = x.messages.map(m => ({ ...m, v: 0 }));
            this.cached = true; this.hasMore = !!x.more;
            if (x.token && !this.token && (x.tokenExp || 0) > now() + 30000) { this.token = x.token; this.tokenExp = x.tokenExp; }
            const histRow = typeof History !== 'undefined' ? History.byId?.(this.sid) : null;
            const lastCached = x.messages.at(-1);
            const isFastRet = Boolean(window.__ANC_FAST_RETURN);
            const isIdleComplete = lastCached?.role === 'assistant' && !lastCached?.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(lastCached)) && !this.busy;
            const isUnchangedByHist = Boolean(!force && !isFastRet && isIdleComplete && histRow?.updatedAt && x.histUpdatedAt && histRow.updatedAt === x.histUpdatedAt);
            if (isUnchangedByHist) {
              this.cached = false; this.loaded = true; this.error = null; this._lastSyncedHistAt = histRow.updatedAt; this.emit();
              setTimeout(() => { if (this.loaded && !this.busy && typeof this.reconcile === 'function') void this.reconcile(0).catch(() => {}); }, 80);
              return;
            }
            this.emit();
          }
        }
        let c = null;
        if (!force && this._pre && now() - this._pre.at < 30000 && this._pre.c?.messages?.at(-1)?.role !== 'user') c = this._pre.c;
        else if (!force && this._preP) c = await this._preP.catch(() => null);
        this._pre = null;
        this.loadBytes = 0;
        let lastProgEmit = 0;
        const onProgress = bytes => {
          this.loadBytes = bytes;
          const tNow = now();
          if (bytes >= 65536 && tNow - lastProgEmit >= 350) {
            lastProgEmit = tNow;
            this.emit();
          }
        };
        // 超长上下文对话支持：追加 ?includeStreamToken=false&recoverRun=false 跳过服务端同步恢复与令牌签发阻塞（对齐官网 Web 行为），
        // 首次连接超时给足 35 秒，重试 45 秒，且一旦响应头或数据分片到达即自动续期（流式空闲 45 秒），彻底根治超长上下文对话卡 20 秒超时。
        for (let waits = 0, netWaits = 0, fastRetried = false; !c;) {
          try {
            const reqTimeout = (waits === 0 && netWaits === 0 && !fastRetried) ? 35000 : 45000;
            const chatQuery = (!this.busy && !this.streaming && !force && !window.__ANC_FAST_RETURN && fastRetried)
              ? '?includeStreamToken=false&recoverRun=false'
              : '?includeStreamToken=false';
            c = await api('/api/chat/' + this.sid + chatQuery, { timeout: reqTimeout, noApiRetry: true, onProgress });
          } catch (e) {
            if (!fastRetried && waits === 0 && netWaits === 0 && !e?.status && (e?.routeTimeout || /超时|failed to fetch|fetch failed|network|ERR_|socket|eof|reset|closed/i.test(String(e?.message || e)))) {
              fastRetried = true;
              continue;
            }
            if (!e?.status && netWaits < 2 && /failed to fetch|fetch failed|network|ERR_|socket|eof|reset|closed/i.test(String(e?.message || e))) {
              netWaits++;
              await sleep(800 * netWaits);
              continue;
            }
            if (e?.status !== 429) throw e;
            if (waits >= 3 || (e.retryAfterMs || 0) > 60000) throw e;
            const wait = Math.round(Math.max(e.retryAfterMs || 0, 3000 * 2 ** waits) * (0.9 + Math.random() * 0.2)); waits++;
            this.error = '请求过于频繁（429），' + Math.ceil(wait / 1000) + ' 秒后自动重试…'; this.emit(); await sleep(wait);
          }
        }
        this.loadBytes = 0;
        const wasCached = this.cached; this.cached = false;
        // 打开对话时顺便同步列表里的名称（别的设备改名 / 校准后，不用来回切换多次才更新）
        { const t = c?.title ?? c?.chat?.title, row = typeof History !== 'undefined' ? History.byId(this.sid) : null; if (typeof t === 'string' && t && row && row.title !== t) { row.title = t; const miNow = typeof Models !== 'undefined' ? Models.get(this.sid) : null; if (miNow?.name && !miNow.pendingConfirm && (!miNow.guess || miNow.userCorrected || miNow.habitInferred || miNow.reverseInferred || miNow.billingProbe) && typeof Titles !== 'undefined' && Titles.local) Titles.local(this.sid); else delete row.localTitle; History.saveSoon(); Bus.emit('history'); } }
        // 加载期间自己刚发出的消息（服务端还没有）保留在末尾，不被覆盖；替换掉缓存内容时强制重绘
        const srv = (c.messages || []).filter(m => !this._prunedDeadMsgIds?.has?.(m?.id)).map(m => ({ ...m, v: wasCached ? 1 : 0 })), ids = new Set(srv.map(m => m.id));
        if (!srv.length && this.messages.length) {
          // 服务端未返回有效消息时保留本地已缓存的正文，绝不清空
        } else if (this.messages.length && !wasCached && typeof this.mergeServer === 'function') this.mergeServer(srv, this.live);
        else {
          const byOld = new Map(this.messages.filter(m => m?.id).map(m => [m.id, m]));
          const oldAssts = this.messages.filter(m => m && m.role === 'assistant');
          const srvAssts = srv.filter(m => m && m.role === 'assistant');
          let asstOrd = 0;
          const firstSrvId = srv[0]?.id;
          const firstSrvIdx = firstSrvId ? this.messages.findIndex(m => m?.id === firstSrvId) : -1;
          const olderPrefix = firstSrvIdx > 0 ? this.messages.slice(0, firstSrvIdx).filter(m => m && !m._local && !ids.has(m.id)) : [];
          this.messages = [...olderPrefix, ...srv.map(m => {
            const curAsstIdx = m?.role === 'assistant' ? asstOrd++ : -1;
            const o = byOld.get(m.id) || (curAsstIdx >= 0 && oldAssts.length === srvAssts.length ? oldAssts[curAsstIdx] : null);
            if (!o) return m;
            let mergedParts = m.parts;
            if (o.role === 'assistant' && Array.isArray(o.parts) && Array.isArray(m.parts)) {
              const localReason = o.parts.filter(p => p && p.type === 'reasoning');
              const srvHasReason = m.parts.some(p => p && p.type === 'reasoning');
              if (localReason.length && !srvHasReason) mergedParts = [...localReason, ...m.parts];
              const lIds = { reasoning: o.parts.filter(p => p?.type === 'reasoning' && p.id), text: o.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
              mergedParts = mergedParts.map(sp => (sp && (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id) ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp);
            }
            const extra = {};
            if (o._fmt || m._fmt) extra._fmt = o._fmt || m._fmt;
            if (o._sseMeta || m._sseMeta) extra._sseMeta = o._sseMeta || m._sseMeta;
            if (o._sentAt || m._sentAt) extra._sentAt = o._sentAt || m._sentAt;
            if (!m.metadata?.pending && (o._finishedAt || m._finishedAt)) extra._finishedAt = o._finishedAt || m._finishedAt;
            if (o._turnModelLabel || m._turnModelLabel) extra._turnModelLabel = o._turnModelLabel || m._turnModelLabel;
            return (mergedParts !== m.parts || Object.keys(extra).length) ? { ...m, parts: mergedParts, ...extra } : m;
          }), ...this.messages.filter(m => m._local && !ids.has(m.id))];
        }
        this.hasMore = !!c.pagination?.hasMore; this.cursor = c.pagination?.cursor || null;
        this.setToken(c.publicAccessToken);
        const sending = this.busy && this.messages.some(m => m._local);   // 载入完成前就发了消息：别打乱发送流程
        if (!(sending && this.awaitId)) this.lastSeq = c.lastEventId != null ? String(c.lastEventId) : null;
        this.loaded = true; this.error = null;
        if (typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
        try {
          if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(this);
        } catch {}
        try { ExtCompat.replayChat(this); } catch {}
        const last = srv.at(-1); // a failed local input is not evidence that the server is generating
        // 停在提问卡片上等回答的那条也是 pending：它不是「正在回复」，不能当成忙（否则提交按钮一直不可用）
        const pend = !!last && (last.role === 'user' || (last.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)))) && !(last.role === 'assistant' && Hitl.idleWait(this));
        for (const m of this.messages) {
          if (m?.role !== 'assistant') continue;
          if (m.metadata?.pending && (!pend || m !== last)) m.metadata = { ...m.metadata, pending: false };
          if (!m.metadata?.pending && Array.isArray(m.parts)) {
            for (const p of m.parts) {
              if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                p.state = 'output-error';
                if (!p.errorText) p.errorText = '未返回结果';
              }
            }
          }
        }
        if (sending) this.srvBusy = pend;
        else if (pend) {
          this.status = 'streaming'; this.phase = '接收回复中';
          const curTail = this.messages.at(-1);
          if (curTail?.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(curTail))) {
            this.live = curTail;
            this.parts.clear();
            (curTail.parts || []).forEach(p => {
              if (!p) return;
              if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
              if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
            });
          } else {
            this.live = null; this.parts.clear();
          }
        } else if (!this.live) {
          this.status = 'idle'; this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || null;
        }
        this.emit();
        // 刷新 / 重新载入时服务器上有一轮正在跑：快速补齐（700ms 上限，不阻塞实时流连接）
        if (pend && !sending && !this.gacha) { this.lastSeq = c.lastEventId != null ? String(Math.max(0, +c.lastEventId - 4000)) : null; await Promise.race([this.drain(2500, { keepIfFinished: true }).catch(() => null), sleep(700)]); if (this.lastSeq == null && c.lastEventId != null) this.lastSeq = String(c.lastEventId); }
        this.stream({ peek: !pend || sending });
        // 更早的消息不再打开就全部拉下来（以前一个长对话会连发几十上百个请求）：滚动到顶部 / 点「加载更早的消息」时才加载，和网页一致
        if (!this.hasMore) setTimeout(() => { try { FingerprintReview?.auto?.(this); } catch {} }, 600);   // 没有指纹信息的对话：按历史里的指纹测试自动校准
      } catch (e) {
        if (!this.messages.length && !this.gacha) {
          const cached = await MsgCache.get(this.sid).catch(() => null);
          if (cached?.messages?.length) {
            this.messages = cached.messages.map(m => ({ ...m, v: 0 }));
            this.hasMore = !!cached.more;
          }
        }
        if (this.messages.length) {
          this.cached = false; this.loaded = true; this.error = null; this.emit();
          setTimeout(() => { if (this.loaded && !this.busy) this.quickSync?.(true); }, 3500);
          return;
        }
        if (e.status === 404) {
          try {
            const hRow = typeof History !== 'undefined' ? History.byId?.(this.sid) : null;
            if (hRow && (hRow._localRecovered || /^本地缓存对话(\s|$)/i.test(String(hRow.title || '').trim()))) {
              if (typeof LocalCache !== 'undefined' && LocalCache.drop) LocalCache.drop([this.sid]);
              if (typeof History !== 'undefined' && History.bury) History.bury([this.sid]);
            }
          } catch {}
        }
        this.error = e.status === 404 ? '对话不存在或已删除' : e.status === 429 ? '加载失败：请求过于频繁（429），已按服务器要求等待重试仍被限流' + ((e.retryAfterMs || 0) > 0 ? '，服务端要求等待约 ' + Math.ceil(e.retryAfterMs / 1000) + ' 秒' : '') + '；稍等一会儿点刷新' : '加载失败：' + e.message; this.emit(); throw e;
      }
      finally { this.loading = null; }
    })();
  }
  // 增量查漏补缺（不清空本地数百个已加载工具和消息，只按游标和 toolCallId 补齐缺失输出并续接实时流）
  async resumeIncremental(why) {
    if (!this.loaded || !this.messages.length) return this.reload(why, true);
    const wasBusy = this.busy, wasFake = this.fakeEnd, prevSeq = this.lastSeq != null ? +this.lastSeq : null;
    this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
    this.fakeEnd = null; this.midTurnStall = null; this.errAt = 0; this.reloadAt = now(); this.reloadWhy = why || '';
    const last = this.messages.at(-1);
    const lastIsHealthyAsst = Boolean(last && last.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)));
    if (lastIsHealthyAsst) {
      this.live = last; delete last._finishedAt;
      last.metadata = { ...(last.metadata || {}), pending: true };
      this.parts.clear();
      (last.parts || []).forEach(p => {
        if (!p) return;
        if (p.toolCallId) {
          this.parts.set('tool:' + p.toolCallId, p);
          if (p.state === 'output-error' && p.errorText === '未返回结果') { p.state = 'input-available'; delete p.errorText; }
        }
        if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
      });
      last.v = (last.v || 0) + 1;
    } else {
      this.live = null;
      this.parts.clear();
    }
    this.status = 'streaming'; this.phase = '增量同步'; this.emit();
    try {
      const needRecover = Boolean(wasBusy || wasFake || why);
      const incQuery = needRecover ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      const c = await api('/api/chat/' + this.sid + incQuery, { timeout: 35000, noApiRetry: true }).catch(() => null);
      if (c?.messages?.length) {
        const ch = this.mergeServer(c.messages, null);
        if (c.publicAccessToken) this.setToken(c.publicAccessToken);
        if (!this.gacha && typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
        const srvLast = c.messages.at(-1);
        const curLast = this.messages.at(-1);
        const hasNewEvents = c.lastEventId != null && prevSeq != null && +c.lastEventId > prevSeq;
        const staleFakePend = !wasBusy && !!wasFake && srvLast?.role === 'assistant' && srvLast.id === last?.id && !hasNewEvents && !ch;
        const dbLaggedBehindLive = wasBusy && ((this._srvLagged && !staleFakePend) || (curLast && srvLast && curLast.id !== srvLast.id));
        const srvPend = dbLaggedBehindLive || (!staleFakePend && !!srvLast && (srvLast.role === 'user' || (srvLast.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(srvLast)))) && !(srvLast.role === 'assistant' && Hitl.idleWait(this)));
        if (curLast && curLast.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(curLast))) {
          this.live = curLast;
          this.parts.clear();
          (curLast.parts || []).forEach(p => {
            if (!p) return;
            if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          });
        } else {
          this.live = null;
          this.parts.clear();
        }
        if (!srvPend && (why === 'fast-return' || why === 'server-active') && c.lastEventId != null) {
          this.lastSeq = String(Math.max(0, +c.lastEventId - 4000));
          const d = await Promise.race([this.drain(1800, { keepIfFinished: true }).catch(() => null), sleep(650)]);
          if (d?.open || d?.run) {
            this.status = 'streaming'; this.phase = '接收回复中'; this.emit();
            this.stream({ peek: false });
            return true;
          }
          if (this.lastSeq == null) this.lastSeq = String(c.lastEventId);
        }
        if (!srvPend) {
          if (c.lastEventId != null && (this.lastSeq == null || +c.lastEventId > +this.lastSeq)) this.lastSeq = String(c.lastEventId);
          let hadOpenTool = false;
          if (this.live && Array.isArray(this.live.parts)) {
            for (const p of this.live.parts) {
              if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                p.state = 'output-error'; p.errorText = '未返回结果'; hadOpenTool = true;
              }
            }
          }
          if (!hadOpenTool && srvLast?.role === 'assistant' && srvLast.metadata?.pending === false) {
            this.finAt = this.finAt || now();
            this.realTcAt = this.realTcAt || now();
          }
          this.finishTurn(this.runTok || null, true);
          if (!this.midTurnStall && !this.stopReq && !Hitl.idleWait(this)) {
            const st = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, curLast) : null;
            if (st) {
              this.midTurnStall = {
                at: now(),
                why: st.why || '假结束自动续接',
                key: st.key || ('fake-cont|' + (curLast?.id || '') + '|' + (curLast?.parts?.length || 0)),
              };
            }
          }
          return true;
        }
        this.status = 'streaming'; this.phase = '接收回复中'; this.emit();
        if ((!wasBusy || why === 'fast-return' || why === '手动重新载入') && c.lastEventId != null) {
          this.lastSeq = String(Math.max(0, +c.lastEventId - 4000));
          await Promise.race([this.drain(2000, { keepIfFinished: true }).catch(() => null), sleep(600)]);
          if (this.lastSeq == null) this.lastSeq = String(c.lastEventId);
        }
      } else if (!wasBusy) {
        if (lastIsHealthyAsst && last) last.metadata = { ...(last.metadata || {}), pending: false };
        this.live = null; this.parts.clear(); this.status = 'idle'; this.phase = ''; this.emit();
        this.stream({ peek: true });
        return true;
      }
      if (wasBusy && this.lastSeq != null && +this.lastSeq > 2) this.lastSeq = String(Math.max(0, +this.lastSeq - 2));
      this.stream({ peek: false });
      return true;
    } catch { this.stream({ peek: !wasBusy }); return false; }
  }
  async reload(why, forceFull = false) {
    if (!forceFull && this.loaded && this.messages.length) return this.resumeIncremental(why);
    this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
    this.live = null; this.parts.clear(); this.loaded = false; this.loading = null; this.fakeEnd = null; this.midTurnStall = null; this.errAt = 0;
    this.status = 'idle'; this.phase = '重新载入中'; this.reloadAt = now(); this.reloadWhy = why || ''; this.emit();
    try { await this.load(true); return true; } catch { return false; }
  }
  // 长对话：打开后在后台把更早的消息全部拉下来（完整上下文），刷新 / 重新载入后也一样
  async loadAll() {
    if (this.allLoading) return; this.allLoading = true;
    try { for (let i = 0, fail = 0; i < 300 && this.hasMore && this.cursor; i++) { const c0 = this.cursor; await this.loadOlder(true); if (this.cursor === c0 && this.hasMore) { if (++fail > 2) break; await sleep(1500); } else fail = 0; await sleep(150); } }
    finally { this.allLoading = false; }
    if (!this.hasMore) try { FingerprintReview?.auto?.(this); } catch {}   // 完整历史到手后再看有没有指纹测试可以校准
  }
  async loadOlder(quiet) {
    if (this.olderLoading) { if (!quiet) toast('正在加载更早的消息…'); return; }
    if (!this.hasMore) { if (!quiet) toast('已经是最早的消息了'); return; }
    // 缓存 / 预取的内容只带了「还有更多」，没有分页游标：先完整载入一次拿到游标（之前这里直接 return，按钮点了没反应）
    if (!this.cursor) {
      if (quiet) return;
      this.olderLoading = true; this.emit();
      try { await (this.loading || this.load(true)); } catch (e) { toast('加载更早消息失败：' + describe(e), 'err'); return; }
      finally { this.olderLoading = false; this.emit(); }
      if (!this.cursor) { if (this.hasMore) toast('服务器没有返回分页位置，请稍后重试', 'err'); return; }
      if (this.allLoading) return;   // 载入后台已开始自动补全
    }
    this.olderLoading = true; this.emit();
    try {
      const j = await api(`/api/chat/${this.sid}/messages?cursor=${encodeURIComponent(this.cursor)}&limit=20`, { timeout: 35000, noApiRetry: true });
      const have = new Set(this.messages.map(m => m.id));
      this.messages = [...(j.messages || []).filter(m => !have.has(m.id)).map(m => ({ ...m, v: 0 })), ...this.messages];
      const got = (j.messages || []).length;
      this.hasMore = !!j.pagination?.hasMore; this.cursor = j.pagination?.cursor || null;
      if (!quiet) toast(got ? '已加载 ' + got + ' 条更早的消息' + (this.hasMore ? '' : '（已到最早）') : '没有更早的消息了');
      if (!this.hasMore && !this.allLoading) setTimeout(() => { try { FingerprintReview?.auto?.(this); } catch {} }, 600);   // 手动翻到最早：完整历史到手，同样做指纹校准
    } catch (e) { if (!quiet) toast('加载更早消息失败：' + describe(e), 'err'); }
    finally { this.olderLoading = false; this.emit(); }
  }

  // ----- 发送 -----
  async append(bodyObj) {
    const body = JSON.stringify(bodyObj);
    for (let i = 0; i < 2; i++) {
      const usedTok = await this.ensureToken(i > 0);
      const ctl = new AbortController(); let expired = false; const tm = setTimeout(() => { expired = true; ctl.abort(); }, 25000);
      let res, t;
      try { res = await rawFetch(IN(this.sid), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + usedTok, 'x-trigger-source': 'sdk', 'X-Part-Id': crypto.randomUUID() }, body, cache: 'no-store', signal: ctl.signal }); t = await res.text(); }
      catch (e) { const error = expired ? Object.assign(new Error('发送确认超时，正在恢复连接；请勿重复发送'), { routeTimeout: true }) : e; if (typeof AutoRoute !== 'undefined') AutoRoute.fault(error); throw error; }
      finally { clearTimeout(tm); }
      const isRc403 = res.status === 403 && /recaptcha|人机|验证失败|verification required/i.test(t || '');
      if ((res.status === 401 || (res.status === 403 && !isRc403)) && i === 0) { this.markBadToken?.(usedTok); continue; }
      try { const d = Date.parse(res.headers.get('date') || ''); if (d) this.srvSkew = now() - d - 500; } catch {}
      if (!res.ok) { ProtocolSchema.noteError(res.status); if (!isRc403 && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [401, 403, 404, 408, 429, 500, 502, 503, 504, 520, 522, 524].includes(res.status)) void AutoRoute.onErrorSwitch({ status: res.status, ipLimited: res.status === 429 }, 'append'); throw new HttpError(res.status, t, res); }
      try { return JSON.parse(t); } catch { return t; }
    }
  }
  // 发送前发现服务器上有一轮正在跑：从那一轮开头接上实时流（显示成「之前的消息」的回复），等它结束
  async waitForeign(msg, di, fd0 = 0) {
    this.awaitId = msg.id; this.awaitFrom = 0; this.wakes = 0;   // 那一轮是发送前开始的：它的记录不能当成「旧记录」跳过
    if (di.runSeq != null) { this.lastSeq = String(di.runSeq - 1); this.fence = di.runSeq - 1; }
    this.turnInput = this.turnInput || di.runIn || '~other'; this.waitingForeign = true; this.foreignWaits = (this.foreignWaits || 0) + 1;
    // 还没真正发出：不放进对话区（否则它压在末尾、上一轮的回复在它上面继续长），改在输入框上方的队列条里显示；真正发出时再落到对话末尾
    msg._held = true; msg.v = (msg.v || 0) + 1;
    this.phase = '对话还在回复之前的消息（网页 / 其他设备发起），结束后自动发送这条'; this.emit();
    this.restream();
    const t0 = now(), tc0 = this.tcAt || 0; let chkAt = 0;
    try {
      while (now() - t0 < 20 * 60e3) {
        await sleep(400);
        if (this.stopReq) throw new Error('之前那一轮已停止，这条没有发送，可以点重试');
        if (this.awaitId !== msg.id || this.status === 'idle' || this.status === 'error') throw new Error('这条没有发送，可以点重试');
        if (((this.tcAt || 0) > tc0 || (this.fDone || 0) > fd0) && !this.live) break;
        // 很久没有任何记录：问一下服务器那一轮是不是其实已经结束了（漏了结束标记 / 服务器上早就停了）
        if (now() - Math.max(this.recAt || 0, t0) > 60000 && now() - (chkAt || 0) > 45000) {
          chkAt = now();
          const c = await api('/api/chat/' + this.sid, { timeout: 20000 }).catch(() => null), sl = c?.messages?.at(-1);
          if (sl && !(sl.role === 'user' && sl.id !== msg.id) && !sl.metadata?.pending) { if (c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = +c.lastEventId; } this.live = null; this.turnInput = null; break; }
        }
      }
    } finally { this.waitingForeign = false; if (msg._held) { delete msg._held; msg.v = (msg.v || 0) + 1; } }
    this.phase = '发送中'; this.emit();
  }
  packCx(textLen = 8, kind = 'enter') {
    try {
      const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : (typeof VISIT === 'string' && VISIT ? VISIT : 'local');
      const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; } return (h ^ (h >>> 16)) & 65535; };
      const salt = 48664;
      const len = Math.max(1, Math.min(255, Number(textLen) || 8));
      const kd = Math.min(15, Math.max(2, Math.min(len, 3 + Math.floor(Math.random() * 8))));
      const ku = Math.min(15, Math.max(2, kd));
      const inp = Math.min(15, Math.max(2, kd));
      const ptr = 2 + Math.floor(Math.random() * 5);
      const edit = Math.floor(Math.random() * 3);
      const dwell = Math.min(65535, 1400 + len * (65 + Math.floor(Math.random() * 55)) + Math.floor(Math.random() * 1800));
      const layout = [
        [2, kind === 'button' ? 1 : 0], [2, 2], [4, edit],
        [8, len], [4, kd], [4, ku],
        [1, 1], [1, 0], [4, inp], [3, ptr], [1, 1], [16, dwell],
        [3, kind === 'button' ? 3 : 0], [2, kind === 'button' ? 1 : 0], [2, 1],
        [2, 1], [2, 0], [2, 0], [1, 0],
        [16, fnv(String(vid || 'local'))], [16, Math.floor(now() / 60000) & 65535]
      ];
      let a = (0x5bd1e995 ^ salt) >>> 0;
      const rng = () => { let e = Math.imul((a = (a + 0x6d2b79f5) | 0) ^ (a >>> 15), 1 | a); return (((e ^= e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ (e >>> 14)) >>> 0); };
      const order = layout.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = rng() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
      const o = new Uint8Array(12); let s = 0;
      for (const idx of order) {
        const [bits, val] = layout[idx];
        for (let b = bits - 1; b >= 0; b--) { if ((val >>> b) & 1) o[s >> 3] |= 128 >>> (s & 7); s++; }
      }
      for (let i = 0; i < 12; i++) o[i] ^= (rng() & 255);
      const l = new Uint8Array(15); l[0] = 2; l[1] = salt >>> 8; l[2] = salt & 255; l.set(o, 3);
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let out = '';
      for (let i = 0; i < 15; i += 3) {
        const n = (l[i] << 16) | (l[i + 1] << 8) | l[i + 2];
        out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
      }
      return out;
    } catch { return undefined; }
  }
  metadata(inputId, v2, v3, textLen = 8) {
    const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : VISIT;
    const cx = this.packCx(textLen);
    return { originHost: 'arena.ai', timezone: currentTimezone(), arenaVisitId: vid, submissionSource: 'chat_input', timingBrowserAttemptId: uuid7(), ...(v2 ? { recaptchaV2Token: v2, recaptchaV3Token: null } : { recaptchaV3Token: v3 }), timingInputId: inputId, ...(cx ? { cx } : {}), ...(() => { const c = this.gacha || this.fpLocked || typeof Connectors === 'undefined' ? [] : Connectors.active(); return c.length ? { enabledConnectors: c } : {}; })() };
  }
  async send(text, opt = {}, _a2 = null, _a3 = null) {
    if (Array.isArray(opt)) opt = (_a3 && typeof _a3 === "object") ? _a3 : {};
    if(this.fpLocked&&!opt.fingerprint)throw Error('该对话正在批量测指纹，请等待或停止后发送');
    const command = Fingerprint.command(this, text, { attachments: !!(opt.files?.length || opt.filesP || opt.parts?.some(p => p.type !== 'text')) });
    if (command.handled) { if (!command.accepted) throw Error(command.error); return; }
    if (!opt.hitl && !opt.parts && !opt.retryOf && !opt.fingerprint && typeof Hitl !== 'undefined' && Hitl.skippable?.(this)) {
      return this.skipHitlSend(text, opt);
    }
    if (this.busy) throw new Error('上一轮还在进行中');
    if (!this.gacha && !opt.fingerprint) {
      try {
        this._gachaKept = true;
        if (typeof Gacha !== 'undefined' && Gacha.unmarkCreatedSid) Gacha.unmarkCreatedSid(this.sid);
      } catch {}
    }
    if (!this.gacha && !opt.autoContinue && (this.thinkStopped || this.routedThink || this._hadOpenThinkStop || (this.messages || []).some(m => m?.metadata?.openThinkStopped || (m?.role === 'assistant' && (m?.parts || []).some(p => p?.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || ''))))))) {
      this._hadOpenThinkStop = true;
      this._allowOpenThink = true;
    }
    const wasMidStall = !!(opt.autoContinue || opt.officialAutoResend || opt.retryOf?._streamRejected || this.fakeEnd || this.midTurnStall || (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled?.(this)));
    clearTimeout(this.tailT);
    if (this.streaming) { try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null; }
    if (!opt.retryOf && this.messages.length) {
      const prevTail = this.messages.at(-1);
      const prevU = prevTail?.role === 'assistant' ? this.messages.at(-2) : (prevTail?.role === 'user' ? prevTail : null);
      const prevErrTxt = String(this.errText || this.error || (prevTail?.role === 'assistant' && (prevTail.parts || []).find(p => p?.type === 'error')?.rawText) || (prevTail?.role === 'assistant' && (prevTail.parts || []).find(p => p?.type === 'error')?.text) || '');
      const prevGraphRej = /The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(prevErrTxt);
      if (prevU?.role === 'user' && !prevU.failed && !prevGraphRej && (prevU._appendAccepted || prevU._officialContinueParent || !prevU._local)) {
        prevU._officialContinueParent = true;
        delete prevU._streamRejected;
        if (prevTail?.role === 'assistant' && Array.isArray(prevTail.parts) && prevTail.parts.some(p => p?.type === 'error')) {
          const nonErr = prevTail.parts.filter(p => p && p.type !== 'error');
          if (!nonErr.filter(p => p.type !== 'step-start').length) {
            if (prevTail.id) (this._prunedDeadMsgIds ||= new Set()).add(prevTail.id);
            this.messages.pop();
          } else {
            prevTail.parts = nonErr;
            prevTail.v = (prevTail.v || 0) + 1;
          }
        }
      }
    }
    if (opt.retryOf && (opt.retryOf._appendAccepted || opt.retryOf._streamRejected)) {
      const oldId = opt.retryOf.id, newId = uuid7();
      opt.retryOf.id = newId;
      delete opt.retryOf._appendAccepted;
      delete opt.retryOf._streamRejected;
      try { Drafts.accepted?.(oldId); } catch {}
    }
    const id = opt.retryOf?.id || uuid7(), msg = opt.retryOf || { id, role: 'user', parts: opt.parts || [{ type: 'text', text }], metadata: opt.autoContinue ? { autoContinue: true } : {}, v: 0, _local: true, ...(opt.autoContinue ? { _autoContinue: true } : {}) };
    // 附件：消息立即显示（本地预览 + 上传进度），上传、工作区节点、会话令牌同时进行，全部就绪后再真正发送
    const hasFiles = !!(opt.files?.length || opt.filesP);
    if (opt.previews?.length) { msg._prev = opt.previews; for (const a of opt.previews) a.subs?.add(() => { msg.v = (msg.v || 0) + 1; this.emit(); }); }
    if (opt.files?.length) msg.metadata = Uploads.meta(opt.files, null);
    // Queue removal and outbox ownership are persisted in the same draft snapshot.
    // 自动续接（autoContinue）属于后台探针推进，不写入持久化待确认外发箱，也不弹出人机验证或残留红字气泡。
    if (!opt.autoContinue && Drafts.out(this, msg, text, opt) === false) throw Error('本地保存失败，输入未发送，请检查存储空间');
    if (!this.messages.includes(msg)) this.messages.push(msg);
    msg._sentAt = msg._sentAt || now();
    msg._local = true; msg.deliveryUnknown = false; if (opt.queueIds) msg._queued = true; if (opt.retryOf) this._qPaused = '';
    if (!this.gacha) Bus.emit('sent', this.sid, now());
    this.status = 'submitted'; this.error = null; this.phase = opt.filesP ? '上传附件' : '发送中'; this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.realTcAt = 0; this.endAt = 0; this.fakeEnd = null; this.midTurnStall = null; msg.failed = false;
    // 发出之前：自己这条已经在末尾，这期间服务器上出现的回复都放到它前面（preSend），结束标记也不会把这条的发送流程收掉
    this.awaitId = msg.id; this.turnInput = null; this.preSend = true; const fd0 = this.fDone || 0; let appendAttempted = false;
    try {
      opt.onPrepared?.(msg); this.emit();
      if (hasFiles) {
        const [files, node] = await Promise.all([opt.filesP || Promise.resolve(opt.files), Workspace.latest(this.sid, true).then(x => x?.node || null, () => Workspace.cache.get(this.sid)?.node || null), this.ensureToken().catch(() => null)]);
        msg.metadata = Uploads.meta(files, node); this.phase = '发送中'; this.emit();
      }
      // 人机验证令牌（多半已在打字 / 选附件时预取好）和会话令牌同时拿，不再一个等一个
      // 同时把实时通道读到最新（drain）：之前没读完的旧记录（上一轮的尾巴、多出来的 turn-complete）不会被当成这一轮的回复
      // 对话还没载入完（手机上刚切过来、显示的是缓存）：先等载入，拿到最新位置和状态再发
      if (!this.loaded && !this.gacha) { this.srvBusy = false; this.phase = '同步对话中'; msg._held = true; msg.v = (msg.v || 0) + 1; this.emit(); try { await Promise.race([(this.loading || this.load()).catch(() => {}), sleep(12000)]); } finally { delete msg._held; msg.v = (msg.v || 0) + 1; } this.phase = '发送中'; this.emit(); }
      const canSkipDrain = Boolean(this.loaded && this.lastSeq != null && !this.srvBusy && (this.gacha || opt.hitl || wasMidStall || ((this.tcAt || this.endAt || this.recAt) && now() - Math.max(this.tcAt || 0, this.endAt || 0, this.recAt || 0) < 180000)));
      let [v3, di] = await Promise.all([opt.v2 ? null : Recaptcha.take('chat_submit').catch(() => null), (this.wakeSessionToken ? this.wakeSessionToken() : this.ensureToken()).catch(() => null).then(() => canSkipDrain ? { max: +this.lastSeq, run: false } : this.drain(900))]);
      // 服务器上这个对话正有一轮在跑（网页 / 另一台设备 / 本机没在盯着的时候发起的）：先把那一轮接上显示出来，
      // 等它结束（再隔 2.5 秒）才发这条——回复中途插进去的消息服务器有时不会处理，一直显示「等待接单」
      // 实时通道没认出正在跑的一轮时，再用对话快照核对一次：最后一条助手消息还是 pending = 服务器仍在处理，不能把新消息塞进去（会被服务器排在后面、事后才冒出来）
      // 回应提问卡片（opt.hitl）：服务器上那一轮停在「等用户回应」，没有 turn-complete，会被误判成「别处发起、还在跑的一轮」，
      // 于是等它结束 → 重放时变成空闲 → 报「这条没有发送」，点多少次提交都一样。这条回答等的正是这一轮：不等，直接发，
      // 并把读取位置挪到最新，免得发送后把这一轮旧记录当成新回复重放一遍。
      if (opt.hitl || wasMidStall) { this.srvBusy = false; if (di?.max != null) { this.lastSeq = String(di.max); this.fence = di.max; } }
      if (!opt.hitl && !wasMidStall && !this.gacha && !this.srvBusy && !(di?.run && di.runSeq != null)) { const sb = await this.serverMidTurn(msg.id); if (sb) this.srvBusy = true; }
      if (!opt.hitl && !wasMidStall && !this.gacha && ((di?.run && di.runSeq != null) || this.srvBusy)) {
        const t0 = now(); this.srvBusy = false;
        await this.waitForeign(msg, di?.run ? di : { runSeq: null, runIn: null }, fd0);
        if (now() - t0 > 60000 && !opt.v2) v3 = await Recaptcha.take('chat_submit').catch(() => null);   // 人机验证令牌 2 分钟过期：等久了重新取
      }
      this.rcV3 = !!v3;   // 纯净度实测：这一轮用 v3 发的，开始回复 = v3 通过
      await this.settle();
      this.awaitFrom = this.sentAt;
      this.awaitId = msg.id; this.wakes = 0; this.baseSeq = this.lastSeq;
      const forceResetWs = !!this._forceResetWorkspaceBranch;
      const explicitTargetId = this._resetBranchTargetUserId || null;
      if (forceResetWs) {
        this._forceResetWorkspaceBranch = false;
        this._resetBranchTargetUserId = null;
        this._rejectedHealthyNodeIds?.clear?.();
      }
      if (!explicitTargetId && this.hasMore && this.cursor && typeof findHealthyLastUser === 'function' && !findHealthyLastUser(this.messages, msg, this._rejectedHealthyNodeIds) && typeof ensureHealthyHistoryLoaded === 'function') {
        await ensureHealthyHistoryLoaded(this).catch(() => {});
      }
      const prevUser = typeof findHealthyLastUser === 'function'
        ? findHealthyLastUser(this.messages, msg, this._rejectedHealthyNodeIds)
        : [...this.messages].filter(m => m && m !== msg && m.role === 'user' && !m.failed).at(-1);
      const lastUserMessageId = explicitTargetId || (prevUser ? (prevUser.metadata?.nodeId || prevUser.id || null) : null);
      this._lastSentParentUserId = lastUserMessageId;
      const msgMeta = forceResetWs
        ? (msg.metadata?.uploads ? { ...msg.metadata, lastUserMessageId, manifestNodeId: null } : { lastUserMessageId, manifestNodeId: null })
        : (msg.metadata?.uploads ? (lastUserMessageId ? { ...msg.metadata, lastUserMessageId } : msg.metadata) : (lastUserMessageId ? { lastUserMessageId } : null));
      const tLen = String(text || '').length || 8;
      const body = (a, b) => ({ kind: 'message', payload: { message: { parts: msg.parts, id: msg.id, role: 'user', ...(msgMeta ? { metadata: msgMeta } : {}) }, chatId: this.sid, trigger: 'submit-message', messageId: msg.id, metadata: this.metadata(msg.id, a, b, tLen) } });
      // 兜底「重新发送」用：同一条消息（同一个 id）、新的人机验证令牌
      this.reSend = { id: msg.id, fn: async () => this.append(body(null, await Recaptcha.take('chat_submit').catch(() => null))) };
      if (!opt.autoContinue && this._preSendNetErr && typeof AutoRoute !== 'undefined' && typeof AutoRoute.onErrorSwitch === 'function' && AutoRoute.enabled?.()) {
        const preErr = this._preSendNetErr || { routeTimeout: true, net: true, message: IP?.err || '实时连接超时' };
        this._preSendNetErr = null;
        this.phase = '当前线路超时，正在自动切换最优节点 / ProxyIP…'; this.emit();
        const sw = await AutoRoute.onErrorSwitch(preErr, 'pre-send').catch(() => null);
        if (sw?.changed) await this.ensureToken(true).catch(() => null);
        this.phase = '发送中'; this.emit();
      } else {
        this._preSendNetErr = null;
      }
      this.preSend = false;
      appendAttempted = true;
      let ar;
      try { ar = await this.append(body(opt.v2, v3)); }
      catch (e) {
        if (opt.autoContinue) throw e;
        const isNetTimeout = Boolean(e?.routeTimeout || (typeof NetPolicy !== 'undefined' && NetPolicy.transportError?.(e)));
        if (isNetTimeout && typeof AutoRoute !== 'undefined' && typeof AutoRoute.onErrorSwitch === 'function' && AutoRoute.enabled?.()) {
          this.phase = '发送超时，正在自动切换最优节点 / ProxyIP 并恢复发送…'; this.emit();
          const sw = await AutoRoute.onErrorSwitch(e, 'send-timeout').catch(() => null);
          if (sw?.ok) {
            const got = await this.inDb(msg.id, text, this.sentAt).catch(() => null);
            if (got === true) {
              ar = { ok: true, recovered: true };
            } else {
              await this.ensureToken().catch(() => null);
              this.phase = '已切换最优线路，正在自动重发…'; this.emit();
              ar = await this.append(body(opt.v2, v3));
            }
          } else {
            throw e;
          }
        } else {
          // 重复指令（429 prompt failed / verification required）或 v3 分数不足（403 recaptcha validation failed）：和网页 withRecaptchaV2Escalation 一致，弹人工验证后用 v2 令牌原样重发（同一条消息 id，不会重复）
          const eBody = String(e?.body || e?.message || '');
          const needV2 = promptFailed(e?.status, eBody) || (e?.status === 403 && /recaptcha|人机|验证失败/i.test(eBody)) || (e?.status === 429 && /verification required/i.test(eBody));
          if (opt.v2 || !needV2) throw e;
          if (this.rcV3 && e?.status === 403) { this.rcV3 = false; try { IPRep.note('rc'); } catch {} }
          this.phase = promptFailed(e?.status, eBody) ? 'Brana 要求人工验证（重复指令）' : 'Brana 要求人工验证（reCAPTCHA）'; this.emit();
          const tok = await Recaptcha.v2().catch(() => null);
          if (!tok) throw Object.assign(new Error('已取消人机验证，这条没有发送，可以点重试'), { status: 0 });
          this.phase = '发送中'; this.emit(); ar = await this.append(body(tok, null));
        }
      }
      this._pendingTimeoutMsg = null;
      msg._appendAccepted = true;
      if (!opt.autoContinue) { try { Drafts.accepted?.(msg.id); } catch {} }   // 服务器已收下这条（POST 成功）：之后只要有一轮结束，就不再挡队列
      this.awaitSeq = ar && typeof ar === 'object' && ar.seq != null ? +ar.seq : null;
      this.phase = '等待回复'; this.emit();
      this.armLost(msg);
      this.restream();
    } catch (e) {
      clearTimeout(this.lostT); this.preSend = false;
      if (opt.autoContinue) {
        const idx = this.messages.indexOf(msg);
        if (idx >= 0) this.messages.splice(idx, 1);
        this.rcV3 = false; this.stopPending = false; this.status = 'idle'; this.error = null; this.phase = ''; this.awaitId = null; this.awaitFrom = 0; this.emit();
        throw e;
      }
      if (this.rcV3 && e?.status === 403 && /recaptcha/i.test(e.body || '')) IPRep.note('rc'); else if (e?.status === 429 && !promptFailed(429, String(e.body || ''))) IPRep.note('l');
      this.rcV3 = false;
      const isUnknownTimeout = appendAttempted && (!e.status || e.status >= 500 || e.status === 408);
      if (isUnknownTimeout) this._pendingTimeoutMsg = { msg, text, at: this.sentAt || now() };
      this.stopPending = false; this.status = 'error'; msg.failed = true; msg.deliveryUnknown = isUnknownTimeout; this.error = describe(e); this.phase = ''; this.awaitId = null; this.awaitFrom = 0; this.emit(); throw e;
    }
  }
  // 回应 ask_user 等：新建一条只含 data-tool-results 的用户消息（和官方 submitHitlResponse 一致）
  async submitHitl(part, output, opt = {}) {
    const tool = Hitl.name(part); if (!tool) throw new Error('不是需要回应的工具');
    // 只是「等回答」卡住的 streaming 状态：收掉空转的实时流，按空闲处理
    if (this.busy && !Hitl.blocked(this)) {
      this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
      clearTimeout(this.hitlT);
      if (this.live) { const lm = this.live; lm.metadata = { ...lm.metadata, pending: false }; lm.parts.forEach(x => { if (x.state === 'streaming') x.state = 'done'; }); lm.v++; this.live = null; this.parts.clear(); }
      this.status = 'idle'; this.phase = ''; this.awaitId = null; this.awaitFrom = 0; this.turnInput = null;
    }
    if (this.busy) throw new Error('上一轮还在进行中，等它结束后再提交');
    (this.hitlStage ||= new Map()).set(part.toolCallId, { tool, output });
    const pend = Hitl.pending(this);
    const waiting = pend.filter(p => !this.hitlStage.has(p.toolCallId));
    if (waiting.length) { this.emit(); return { staged: true, left: waiting.length }; }
    const last = this.messages.at(-1);
    let nodeId = last?.metadata?.nodeId || null;
    const UU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!nodeId || !UU.test(nodeId)) {
      // 本地流里的消息 id 可能不是服务端节点 id：向服务端确认一次
      try {
        const j = await api(`/api/chat/${this.sid}/messages?limit=20`);
        const hit = [...(j.messages || [])].reverse().find(m => m.role === 'assistant' && (m.parts || []).some(x => x.toolCallId === part.toolCallId));
        if (hit) nodeId = hit.metadata?.nodeId || hit.id;
      } catch {}
      if (!nodeId || !UU.test(nodeId)) nodeId = UU.test(last?.id || '') ? last.id : nodeId;
    }
    const data = pend.map(p => ({ requestNodeId: nodeId, tool: this.hitlStage.get(p.toolCallId).tool, toolCallId: p.toolCallId, output: this.hitlStage.get(p.toolCallId).output }));
    const parts = [{ type: 'data-tool-results', data }];
    if (opt.text && String(opt.text).trim()) parts.push({ type: 'text', text: String(opt.text).trim() });
    const saved = new Map(this.hitlStage); this.hitlStage.clear();
    const pass = {}; for (const k of ['files', 'filesP', 'previews', 'queueIds', 'onPrepared']) if (opt[k] != null) pass[k] = opt[k];
    try { await this.send('', { ...pass, parts, v2: opt.v2, hitl: true }); }
    catch (e) {
      // 没发出去：卡片保持「未回答」（不再留在「已记下 / 已回答」状态）。选项草稿还在，直接再点一次提交即可；刷新后服务器上没有回答，同样是未回答。
      const m = this.messages.at(-1); if (m && m.role === 'user' && m.parts === parts) this.messages.pop();
      this.hitlStage.clear(); this.status = this.status === 'error' ? 'idle' : this.status; this.error = null;
      this.messages.forEach(x => x.v = (x.v || 0) + 1); this.emit(); throw e;
    }
    return { staged: false };
  }
  // 没点交互卡片直接发下一条消息：所有未回答的交互卡片（提问 / 计划 / 选图 / 选声音）自动按 Skip 记下，和这条文字（附件）一起提交
  async skipHitlSend(text, opt = {}) {
    const l = Hitl.skippable(this); if (!l) throw new Error('还有需要回答的提问');
    const todo = l.filter(p => !this.hitlStage?.has(p.toolCallId)), lastP = todo.at(-1) || l.at(-1);
    this.hitlStage ||= new Map();
    for (const p of l) { try { if (typeof UI !== 'undefined') UI.hitlDraft?.delete(p.toolCallId); } catch {} }
    for (const p of todo.slice(0, -1)) this.hitlStage.set(p.toolCallId, { tool: Hitl.name(p), output: Hitl.skipOut(p) });
    const out = todo.length ? Hitl.skipOut(lastP) : this.hitlStage.get(lastP.toolCallId)?.output;
    const r = await this.submitHitl(lastP, out, { ...opt, text });
    if (r?.staged) throw new Error('还有需要回答的提问');
    return r;
  }
  async regenerate(opt = {}) {
    if (this.busy) return;
    let idx = this.messages.length - 1; while (idx >= 0 && this.messages[idx].role !== 'assistant') idx--;
    const target = idx >= 0 ? this.messages[idx] : null;
    if (target) this.messages.splice(idx, 1);
    this.status = 'submitted'; this.error = null; this.phase = '重新生成'; this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.endAt = 0; this.fakeEnd = null; this.emit();
    try {
      const [v3] = await Promise.all([opt.v2 ? null : Recaptcha.take('chat_submit').catch(() => null), this.drain()]);
      this.rcV3 = !!v3;
      await this.settle();
      this.awaitFrom = this.sentAt;
      const lastUser = [...this.messages].reverse().find(m => m.role === 'user');
      this.awaitId = lastUser?.id || null; this.wakes = 0; this.baseSeq = this.lastSeq;
      const rBody = (a, b) => ({ kind: 'message', payload: { chatId: this.sid, trigger: 'regenerate-message', ...(target ? { messageId: target.id } : {}), metadata: this.metadata(lastUser?.id || uuid7(), a, b) } });
      try { await this.append(rBody(opt.v2, v3)); }
      catch (e) {
        const eBody = String(e?.body || e?.message || '');
        const needV2 = promptFailed(e?.status, eBody) || (e?.status === 403 && /recaptcha|人机|验证失败/i.test(eBody)) || (e?.status === 429 && /verification required/i.test(eBody));
        if (opt.v2 || !needV2) throw e;
        if (this.rcV3 && e?.status === 403) { this.rcV3 = false; try { IPRep.note('rc'); } catch {} }
        this.phase = 'Brana 要求人工验证（reCAPTCHA）'; this.emit();
        const tok = await Recaptcha.v2().catch(() => null);
        if (!tok) throw Object.assign(new Error('已取消人机验证，请点重试'), { status: 0 });
        this.phase = '重新生成'; this.emit();
        await this.append(rBody(tok, null));
      }
      this.phase = '等待回复'; this.emit(); this.armLost(null); this.restream();
    } catch (e) { clearTimeout(this.lostT); if (target) this.messages.splice(idx, 0, target); this.status = 'error'; this.error = describe(e); this.phase = ''; this.emit(); throw e; }
  }
  // 思考自动停止（模型信息 → 设置，默认开）：这个对话一直在调用工具（bash 等）、从来没出现过思考，
  // 突然出现有内容的思考时按用户开关停止；这不能证明开源或改派，已知闭源不误触发。一开始就有思考的对话不停。
  thinkGuard(p) {
    if ((typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(this)) || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(this))) return;
    if (Fingerprint.isRunning(this) || Prefs.thinkStop === false || this._allowOpenThink || this._hadOpenThinkStop || this.stopReq || this.thinkStopped || !this.busy) return;
    if ((this.live?.parts || []).some(lp => lp && lp.toolCallId && lp.state === 'output-available')) return;
    const priorMsgs = (this.messages || []).filter(m => m && m.role === 'assistant' && m !== this.live && !m.metadata?.pending);
    let priorHadClosed = false, priorHadOpenThink = false;
    const mName = String((typeof Models !== 'undefined' && Models.get(this.sid)?.name) || this._routeBaseline?.label || '');
    if (mName && !/开源|compat|qwen|deepseek|glm|kimi|minimax|llama|mistral|nemotron|inkling|beam|caveman|gemma/i.test(mName)) priorHadClosed = true;
    if (priorMsgs.length >= 1) {
      const firstAsst = priorMsgs[0];
      const firstHadOpen = Boolean(firstAsst?.metadata?.openThinkStopped || (firstAsst?.parts || []).some(pp => pp?.type === 'reasoning' && /[^\s.…·。]/.test(String(pp.text || ''))));
      if (!firstHadOpen) priorHadClosed = true;
    }
    for (const pm of priorMsgs) {
      if (pm?.metadata?.openThinkStopped) priorHadOpenThink = true;
      for (const pp of pm.parts || []) {
        if (pp.type === 'reasoning') {
          if (/[^\s.…·。]/.test(String(pp.text || ''))) priorHadOpenThink = true;
          else priorHadClosed = true;
        }
        if (pp.toolCallId && /^(?:toolu_|srvtoolu_|call_)/i.test(pp.toolCallId)) priorHadClosed = true;
      }
    }
    if (priorHadOpenThink && !this.gacha) {
      this._allowOpenThink = true;
      if (!priorHadClosed && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
        try { BillingProbe.markAsOpenSourceModel(this); } catch {}
      }
      return;
    }
    if (!priorHadClosed && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
      try { BillingProbe.markAsOpenSourceModel(this); } catch {}
    }
    this.thinkStopped = true; this.routedThink = true; this._routePaused = true; this._hadOpenThinkStop = true;
    if (this.live) this.live.metadata = { ...(this.live.metadata || {}), openThinkStopped: true };
    this.phase = '出现开源思考（路由开源模型），自动暂停';
    Trace.note?.(this.sid, '出现开源思考（路由开源模型），已立即自动暂停', 'warn');
    toast('「' + (History.byId?.(this.sid)?.title || this.title || '对话') + '」出现开源思考（路由开源模型），已立即自动暂停', 'err');
    setTimeout(() => this.stop(), 0);
  }
  checkMidStreamRoute(t, ch) {
    if (!this.busy || this.stopReq || this.gacha || this._midRoutePrompted || Fingerprint.isRunning(this)) return;
    const priorMsgs = (this.messages || []).filter(m => m && m.role === 'assistant' && m !== this.live && !m.metadata?.pending);
    let priorToolFam = '', priorHiddenThink = false;
    for (const pm of priorMsgs) {
      for (const pp of pm.parts || []) {
        if (pp.type === 'reasoning' && !/[^\s.…·。]/.test(String(pp.text || ''))) priorHiddenThink = true;
        if (pp.toolCallId) {
          if (/^(?:toolu_|srvtoolu_)/i.test(pp.toolCallId)) priorToolFam = 'claude';
          else if (/^call_/i.test(pp.toolCallId)) priorToolFam = 'openai';
        }
      }
    }
    if (!priorToolFam && this.live?.parts?.length) {
      for (const lp of this.live.parts) {
        if (lp?.toolCallId && lp.toolCallId !== ch?.toolCallId) {
          if (/^(?:toolu_|srvtoolu_)/i.test(lp.toolCallId)) { priorToolFam = 'claude'; break; }
          if (/^call_/i.test(lp.toolCallId)) { priorToolFam = 'openai'; break; }
        }
      }
    }
    if (!priorMsgs.length && !priorToolFam) return;
    const baseLabel = this._routeBaseline?.label || (typeof Models !== 'undefined' && Models.get(this.sid)?.name) || '';
    if (t === 'tool-input-start' && ch?.toolCallId && priorToolFam) {
      const curToolFam = /^(?:toolu_|srvtoolu_)/i.test(ch.toolCallId) ? 'claude' : (/^call_/i.test(ch.toolCallId) ? 'openai' : '');
      if (curToolFam && curToolFam !== priorToolFam) {
        this._midRoutePrompted = true;
        const fromLbl = baseLabel || (priorToolFam === 'claude' ? 'Claude 系列' : 'GPT 系列');
        const fmtGuess = this.fmt && typeof Fmt !== 'undefined' ? String(Fmt.guess(this.fmt)?.name || '').trim() : '';
        const toLbl = (fmtGuess && !/未知|compat/i.test(fmtGuess)) ? fmtGuess : (curToolFam === 'claude' ? 'Claude 系列' : 'GPT 系列');
        const liveTools = (this.live?.parts || []).filter(p => String(p?.type || '').startsWith('tool-') || p?.type === 'dynamic-tool');
        const liveBash = liveTools.filter(p => /^(bash|shell|run_command)$/i.test(String(p?.toolName || String(p?.type || '').replace(/^tool-/, '')))).length;
        const curToolPart = liveTools.find(p => p.toolCallId === ch.toolCallId) || liveTools.at(-1);
        const stepMeta = {
          toolIndex: Math.max(1, liveTools.length),
          bashIndex: liveBash,
          toolName: String(ch.toolName || 'bash'),
          fromLabel: fromLbl,
          toLabel: toLbl,
          routeType: 'model',
          stepText: liveBash > 0 ? `（自第 ${liveBash} 个 bash 起切换）` : `（自第 ${Math.max(1, liveTools.length)} 个工具起切换）`,
        };
        if (curToolPart) curToolPart._routeStart = stepMeta;
        if (this.live) {
          const turnIdx = priorMsgs.length + 1;
          this.live._routeStepInfo = stepMeta;
          this.live._routeNotice = {
            type: 'model',
            fromTurn: 1,
            toTurn: turnIdx,
            fromLabel: fromLbl,
            toLabel: toLbl,
            stepMeta,
            text: `路由提示：对话疑似 ${toLbl}`,
          };
        }
        if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          void RouteConfirm.askModelRoute(this, {
            routeType: 'model',
            fromLabel: fromLbl,
            toLabel: toLbl,
            reason: '实时工具调用前缀切换，检测到路由到其他模型' + stepMeta.stepText,
          });
        }
        return;
      }
    }
    if ((t === 'text-delta' || t === 'tool-input-start') && priorHiddenThink && this.live) {
      const hasReasonNow = (this.live.parts || []).some(p => p.type === 'reasoning') || (Number(this.fmt?.rBlocks || this.fmt?.rN) > 0);
      const textLenNow = (this.live.parts || []).reduce((n, p) => n + (p.type === 'text' ? String(p.text || '').length : 0), 0);
      if (!hasReasonNow && (textLenNow >= 180 || t === 'tool-input-start') && /opus-5[.-]5|fable-5[.-]1|argon|barium/i.test(baseLabel) && !/gpt-6[.-]1-sol|gpt-6-sol|gpt-6-astra/i.test(baseLabel)) {
        this._midRoutePrompted = true;
        const bClean = String(baseLabel).replace(/\s*\([^)]*\)\s*$/, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim() || '当前模型';
        const suspectedLbl = bClean + ' (Medium)';
        const liveTools = (this.live?.parts || []).filter(p => String(p?.type || '').startsWith('tool-') || p?.type === 'dynamic-tool');
        const liveBash = liveTools.filter(p => /^(bash|shell|run_command)$/i.test(String(p?.toolName || String(p?.type || '').replace(/^tool-/, '')))).length;
        const curToolPart = t === 'tool-input-start' ? (liveTools.find(p => p.toolCallId === ch?.toolCallId) || liveTools.at(-1)) : null;
        const stepMeta = curToolPart ? {
          toolIndex: Math.max(1, liveTools.length),
          bashIndex: liveBash,
          toolName: String(ch?.toolName || 'bash'),
          fromLabel: baseLabel,
          toLabel: suspectedLbl,
          routeType: 'effort',
          stepText: liveBash > 0 ? `（自第 ${liveBash} 个 bash 起切换）` : `（自第 ${Math.max(1, liveTools.length)} 个工具起切换）`,
        } : null;
        if (curToolPart && stepMeta) curToolPart._routeStart = stepMeta;
        this.live._routeStepInfo = stepMeta;
        this.live._routeNotice = {
          type: 'effort',
          fromTurn: 1,
          toTurn: priorMsgs.length + 1,
          fromLabel: baseLabel,
          toLabel: suspectedLbl,
          stepMeta,
          text: `路由提示：对话疑似 ${suspectedLbl}`,
        };
        if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          void RouteConfirm.askModelRoute(this, {
            routeType: 'effort',
            fromLabel: baseLabel,
            toLabel: suspectedLbl,
            reason: '前序轮次包含闭源思考块，本轮缺失思考直接输出',
          });
        }
      }
    }
  }
  async stop(opt = {}) {
    if (!this.busy) return;
    if (this.status === 'stopping') { if(opt.strict)this.strictStopAt=this.stopAt; return; }
    // 消息已发出、服务器还没接单：先记下，接单 / 开始输出的那一刻立刻停止（接单前就发停止，可能连这条消息一起丢掉）；再点一次 = 马上停
    if (!opt.strict && !this.stopPending && !this.preSend && this.status === 'submitted' && this.awaitId && !this.oursAt && !this.live) { this.stopPending = true; this.phase = '开始回复时立即停止（再点一次马上停）'; this.emit(); return; }
    this.stopPending = false;
    this.status = 'stopping'; this.phase = '正在停止'; this.stopReq = true; const tok = this.stopAt = now(); this.strictStopAt = opt.strict ? tok : 0;
    // 界面马上停：正在输出的部分收尾，之后到达的文字不再显示（服务器那边的完整内容下次打开时同步）
    const m = this.live; if (m) { m.parts.forEach(p => { if (p.state === 'streaming') p.state = 'done'; }); m.v++; }
    this.emit();
    try { await this.append({ kind: 'stop' }); } catch (e) { toast('停止失败：' + describe(e), 'err'); if (opt.strict) throw e; }
    // 结束记录迟迟不来（流断了 / 服务器已停但没推送）：主动查服务器，回复已经不在进行就直接收尾
    for (const d of [2500, 5500, 9000]) setTimeout(() => this.stopCheck(tok), d);
    if (!opt.strict) setTimeout(() => { if (this.status === 'stopping' && this.stopAt === tok && this.strictStopAt !== tok) { this.gen++; this.streaming = false; this.ctl?.abort(); this.finishTurn(null, true); } }, 15000);
  }
  async stopCheck(tok) {
    if (this.status !== 'stopping' || this.stopAt !== tok) return;
    try {
      const j = await api(`/api/chat/${this.sid}`, { timeout: 8000 }), last = Array.isArray(j?.messages) ? j.messages.at(-1) : null;
      if (this.status !== 'stopping' || this.stopAt !== tok) return;
      const own = (j?.messages || []).findIndex(m => m.id === this.awaitId);
      const current = this.live ? last?.id === this.live.id : own >= 0 && own < j.messages.length - 1;
      if (this.strictStopAt === tok && !current) return; // A stale completed assistant is not stop confirmation.
      if (last && last.role === 'assistant' && !last.metadata?.pending && (!this.live || last.id === this.live.id)) { this.gen++; this.streaming = false; this.ctl?.abort(); this.finishTurn(null, true); }
    } catch {}
  }

  // ----- 实时流 -----
  restream() { if (this.streaming) { this.gen++; this.ctl?.abort(); this.streaming = false; } this.stream(); }
  async stream({ peek = false } = {}) {
    if (this.streaming) return; this.streaming = true; this.peeking = !!peek;
    const my = ++this.gen; let backoff = 200, authFails = 0, idleLoops = 0, retryIdx = 0, failWindowStart = 0, totalReconnects = 0;
    const RETRY_STEPS = [300, 700, 1500, 3000, 6000, 12000], RETRY_BUDGET_MS = 600000, MAX_RECONNECTS = 300;
    try {
      while (my === this.gen) {
        if (++totalReconnects > MAX_RECONNECTS) break;
        const ctl = new AbortController(); this.ctl = ctl; this.streamOpenAt = 0;
        let lastByte = now(), turnDone = false, got = 0, sawDone = false, connecting = false, headers = false, routeTimeout = false;
        let rd = null, body = null, retryWait = 0, failed = false;
        const wd = setInterval(() => {
          if (my !== this.gen) { ctl.abort(); return; }
          if (headers && this.busy && !(this._officialTurnErrAt && now() - this._officialTurnErrAt < 60000) && now() - lastByte > 30000 && typeof AutoRoute !== 'undefined') void AutoRoute.silent(this);
          if (connecting && now() - lastByte > (headers ? NetPolicy.IDLE_MS : NetPolicy.CONNECT_MS)) { routeTimeout = true; ctl.abort(); }
        }, 1000);
        try {
          const usedTok = await this.ensureToken(authFails > 0);
          if (my !== this.gen || ctl.signal.aborted) break;
          const h = { Accept: 'text/event-stream', Authorization: 'Bearer ' + usedTok, 'Timeout-Seconds': '120', 'X-Session-Settled': 'true' };
          if (this.lastSeq != null) h['Last-Event-ID'] = String(this.lastSeq);
          if (peek) h['X-Peek-Settled'] = '1';
          this.connAt = lastByte = now(); connecting = true;
          const res = await rawFetch(OUT(this.sid), { headers: h, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
          body = res.body;
          if (my !== this.gen || ctl.signal.aborted) break;
          const cfMitigated = res.headers?.get?.('cf-mitigated') || '';
          if (/challenge/i.test(cfMitigated)) throw Object.assign(new HttpError(res.status || 403, 'Cloudflare 安全验证拦截（cf-mitigated: challenge），请切换代理或用网页模式通过验证', res), { responseFormat: true });
          if (res.status === 401 || res.status === 403) { this.markBadToken?.(usedTok); if (++authFails > 3) throw new HttpError(res.status, '实时通道拒绝访问', res); continue; }
          if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ''), res);
          const type = res.headers?.get?.('content-type') || '';
          if ((type && !/^text\/event-stream(?:\s*;|$)/i.test(type)) || !body?.getReader) throw Object.assign(new HttpError(res.status, '实时通道返回了非事件流，请检查官方验证', res), { responseFormat: true });
          authFails = 0; headers = true; lastByte = now(); this.streamOpenAt = lastByte;
          rd = body.getReader(); const dec = new TextDecoder(); let buf = '';
          for (;;) {
            const { done, value } = await rd.read(); if (done) break;
            if (my !== this.gen) { ctl.abort(); break; }
            lastByte = now(); this.byteAt = lastByte; this.netErr = '';
            if (value?.byteLength) NetHealth.good('stream');
            if (typeof AutoRoute !== 'undefined' && AutoRoute.streamFails.length) AutoRoute.streamFails = [];
            buf += dec.decode(value, { stream: true }); let i;
            while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
              const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
              const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
              if (!data) continue;
              if (data.trim() === '[DONE]') { sawDone = true; continue; }
              let j; try { j = JSON.parse(data); } catch { continue; }
              for (const rec of j.records || []) { got++; if (this.onRecord(rec) === 'done') turnDone = true; }
            }
            if (turnDone) { await sleep(25); break; }
          }
          // 丢弃断开时残留的半截未闭合行，重连后由 Last-Event-ID 重新拉取完整帧
          buf = '';
        } catch (e) {
          if (my !== this.gen) break;
          failed = true;
          this.dbg?.('stream-err', { e: String(e?.name === 'AbortError' ? 'Abort' : e?.message || e).slice(0, 100), st: e?.status || 0, route: routeTimeout });
          if (typeof AutoRoute !== 'undefined' && (routeTimeout || e.name !== 'AbortError')) AutoRoute.fault(routeTimeout ? Object.assign(new Error('实时连接超时'), { routeTimeout: true }) : e, headers && routeTimeout ? 'network' : 'stream');
          retryWait = Math.max(e.retryAfterMs || 0, e.status === 429 ? 30000 : 0);
          if (e.name !== 'AbortError') {
            this.netErr = describe(e);
            if (e.responseFormat || (e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408)) {
              this.error = '实时通道错误：' + describe(e); this.emit(); if (e.responseFormat || ++idleLoops > 3) break;
            }
          }
        } finally {
          clearInterval(wd); ctl.abort();
          // Release readers even on auth retries, a completed turn, peek and superseded streams.
          if (rd) { try { rd.cancel().catch(() => {}); rd.releaseLock(); } catch {} }
          else { try { body?.cancel()?.catch?.(() => {}); } catch {} }
        }
        if (headers && !failed && !got && !sawDone && this.busy && !peek && !routeTimeout && now() - this.connAt < 5000 && typeof AutoRoute !== 'undefined') AutoRoute.fault(new Error('实时连接提前断开'), 'stream');
        this.dbg?.('stream', { ev: 'end', got, sawDone, failed, turnDone, headers, peek, seq: this.lastSeq });
        if (turnDone || my !== this.gen) break;
        if (peek && sawDone && !got) { if (this.status === 'streaming' && !this.live) { this.status = 'idle'; this.phase = ''; this.emit(); } break; }
        if (!this.busy && peek) break;
        peek = false;
        if (got) { backoff = 200; retryIdx = 0; failWindowStart = 0; }
        else {
          if (!failWindowStart) failWindowStart = now();
          else if (now() - failWindowStart > RETRY_BUDGET_MS) { this.error = '实时连接连续中断超过 10 分钟，请点击重新载入'; this.emit(); break; }
        }
        if (this.busy && this.live && !turnDone && !sawDone && typeof this.reconcile === 'function' && now() - (this.recoAt || 0) > 4000) {
          void this.reconcile(0).catch(() => {});
        }
        if (!this.busy) { if (++idleLoops > 2) break; }
        await sleep(Math.max(backoff, retryWait));
        retryIdx = Math.min(retryIdx + 1, RETRY_STEPS.length - 1);
        backoff = RETRY_STEPS[retryIdx];
      }
    } finally { if (my === this.gen) { this.streaming = false; this.peeking = false; this.ctl = null; this.streamOpenAt = 0; } }
  }

  // 服务器刚结束一轮时（turn-complete 之后约 1 秒内）追加的消息会被「读到但不处理」：服务器一直不接单，直到下一条消息进来。
  // 实测：结束后 0.5~0.9 秒发送 → 每次都丢；1.6 秒以后发送 → 正常。所以发送前保证距离上一轮结束至少 2.5 秒
  // 对话快照里最后一条助手消息是否还在 pending（服务器还在处理）。网络错误 / 未知 = false（不阻塞，交给原有的实时通道判断）
  async serverMidTurn(selfId) {
    try {
      if (!this.live && (this.endAt || this.tcAt || this.finAt) && now() - Math.max(this.endAt || 0, this.tcAt || 0, this.finAt || 0) < 25000) return false;
      const j = await api('/api/chat/' + this.sid, { timeout: 6000, bg: true }), last = Array.isArray(j?.messages) ? j.messages.at(-1) : null;
      if (j?.publicAccessToken) this.setToken?.(j.publicAccessToken);
      if (Array.isArray(j?.messages) && Array.isArray(this.messages)) {
        for (const sm of j.messages) {
          if (sm?.role === 'user' && sm.metadata?.nodeId) {
            const lm = this.messages.find(x => x && x.id === sm.id);
            if (lm) lm.metadata = { ...(lm.metadata || {}), nodeId: sm.metadata.nodeId };
          }
        }
      }
      if (!last || last.id === selfId || last.role !== 'assistant' || !last.metadata?.pending || Hitl.idleWait(this)) return false;
      if (typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)) return false;
      const loc = (this.messages || []).find(m => m.id === last.id);
      if (loc && loc._finishedAt && now() - loc._finishedAt < 30000) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  async recoverPendingDelivery() {
    const pend = this._pendingTimeoutMsg;
    if (!pend || !pend.msg || !pend.msg.failed || this.busy || this.stopReq) return false;
    if (now() - (pend.at || 0) > 180000) { this._pendingTimeoutMsg = null; return false; }
    this._pendingTimeoutMsg = null;
    const { msg, text, at } = pend;
    try {
      this.status = 'streaming';
      this.error = null;
      this.phase = '线路已恢复，正在核对并自动恢复消息…';
      msg.failed = false; msg.deliveryUnknown = false; msg.v = (msg.v || 0) + 1;
      this.emit();
      const got = await this.inDb(msg.id, text, at).catch(() => null);
      if (got !== true && this.reSend && this.reSend.id === msg.id) {
        this.phase = '已切换最优节点 / ProxyIP，正在自动补发…';
        this.emit();
        await this.ensureToken().catch(() => null);
        const ar = await this.reSend.fn();
        this.awaitSeq = ar && typeof ar === 'object' && ar.seq != null ? +ar.seq : null;
      }
      msg._appendAccepted = true;
      try { Drafts.accepted?.(msg.id); } catch {}
      this.awaitFrom = at || now();
      this.awaitId = msg.id;
      this.phase = '等待回复';
      this.emit();
      this.armLost(msg);
      this.restream();
      return true;
    } catch (e) {
      this.status = 'error';
      msg.failed = true; msg.deliveryUnknown = true; msg.v = (msg.v || 0) + 1;
      this.error = describe(e);
      this.phase = '';
      this.awaitId = null;
      this.emit();
      return false;
    }
  }
  async settle(gap = 450) {
    const w = gap - (now() - (this.tcAt || 0));
    if (w > 0 && w <= gap) { this.phase = '等待服务器就绪'; this.emit(); await sleep(w); }
  }
  // 服务器上有没有这条用户消息（服务器接单时就会把用户消息存进对话；浏览器看到的也是这个）
  // 返回 true / false；网络错误、超时 = null（未知——未知时绝不能当成「没有」）
  // text：按内容兜底核对（服务器可能用了不同的消息 ID）——服务器上有同样内容的用户消息也算已收到
  // 服务器的对话记录里有没有这条：true / false / null（查不到）
  //   按 id → 去空白后的正文（含前后被加了内容）→ 发出时间之后的用户消息；最新一页已经早于发送时间却没有 → 确定没有（不再因为「还有更早的分页」一直未知）
  msgText(id) { const m = (this.messages || []).find(x => x.id === id); return m ? (m.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('') : ''; }
  async inDb(id, text, at = 0) {
    try {
      const j = await api(`/api/chat/${this.sid}`, { timeout: 15000, noApiRetry: true }); if (!Array.isArray(j?.messages)) return null;
      if (j?.publicAccessToken && typeof this.setToken === 'function') this.setToken(j.publicAccessToken);
      if (j.messages.some(m => m && (m.id === id || m.metadata?.nodeId === id))) return true;
      const parentId = this._lastSentParentUserId ? String(this._lastSentParentUserId) : '';
      const parentIdx = parentId ? j.messages.findIndex(m => m && (String(m.id || '') === parentId || String(m.metadata?.nodeId || '') === parentId)) : -1;
      let afterParentTurnIdx = parentIdx + 1;
      if (parentIdx >= 0) {
        while (afterParentTurnIdx < j.messages.length && j.messages[afterParentTurnIdx]?.role !== 'user') afterParentTurnIdx++;
      }
      const scope = parentIdx >= 0 ? j.messages.slice(afterParentTurnIdx) : j.messages;
      const norm = v => String(v || '').replace(/\s+/g, ' ').trim(), t = norm(text), body = m => norm((m.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('') || m.content || '');
      const users = scope.filter(m => m && m.role === 'user'), ts = m => Date.parse(m.createdAt || m.created_at || '') || (typeof idTime === 'function' ? idTime(m?.id) : 0) || 0;
      if (t && users.some(m => { const b = body(m); return b === t || (b.length > 8 && (b.includes(t) || t.includes(b))) || (t.length > 40 && b.slice(0, 40) === t.slice(0, 40)); })) return true;
      if (at && users.some(m => ts(m) >= at - (parentIdx >= 0 ? 2000 : 15000))) return true;
      if (at && scope.some(m => m && m.role === 'assistant' && !m.metadata?.pending && ts(m) >= at - (parentIdx >= 0 ? 1000 : 5000))) return true;
      if (parentIdx >= 0 || !j.pagination?.hasMore || (at > 0 && j.messages.length > 0)) return false;
      const first = j.messages.map(ts).filter(Boolean)[0];
      return at && first && first < at - 15000 ? false : null;
    } catch { return null; }
  }
  async verifyTurnForContinue(lastUser, origText = '') {
    if (!lastUser || typeof api !== 'function' || !this.sid) return { verified: true, mode: 'continue' };
    try {
      const j = await api(`/api/chat/${this.sid}?includeStreamToken=false&recoverRun=false`, { timeout: 6000, noApiRetry: true });
      if (!Array.isArray(j?.messages)) return { verified: true, mode: 'continue' };
      const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
      const body = m => norm((m?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('') || m?.content || '');
      const tNorm = norm(origText || body(lastUser));
      const uid = String(lastUser.id || ''), unode = String(lastUser.metadata?.nodeId || '');
      let uIdx = j.messages.findIndex(m => m && m.role === 'user' && (String(m.id || '') === uid || (unode && String(m.metadata?.nodeId || '') === unode) || (uid && String(m.metadata?.nodeId || '') === uid)));
      const parentId = this._lastSentParentUserId ? String(this._lastSentParentUserId) : '';
      const parentIdx = parentId ? j.messages.findIndex(m => m && (String(m.id || '') === parentId || String(m.metadata?.nodeId || '') === parentId)) : -1;
      if (uIdx < 0 && tNorm) {
        for (let i = j.messages.length - 1; i > parentIdx; i--) {
          const m = j.messages[i];
          if (!m || m.role !== 'user') continue;
          const b = body(m);
          if (b === tNorm || (b.length > 8 && (b.includes(tNorm) || tNorm.includes(b))) || (tNorm.length > 40 && b.slice(0, 40) === tNorm.slice(0, 40))) { uIdx = i; break; }
        }
      }
      if (uIdx >= 0) {
        const srvU = j.messages[uIdx];
        if (srvU.id && srvU.id !== lastUser.id) lastUser.id = srvU.id;
        if (srvU.metadata?.nodeId) lastUser.metadata = { ...(lastUser.metadata || {}), nodeId: srvU.metadata.nodeId };
        lastUser._appendAccepted = true;
        delete lastUser._local;
        const afterMsgs = j.messages.slice(uIdx + 1);
        const srvAsst = [...afterMsgs].reverse().find(m => m && m.role === 'assistant');
        const srvErrTxt = srvAsst ? String((srvAsst.parts || []).find(p => p?.type === 'error')?.rawText || (srvAsst.parts || []).find(p => p?.type === 'error')?.text || '') : '';
        if (/The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(srvErrTxt)) {
          return { verified: false, mode: 'rewind-resend', reason: 'graph-reject' };
        }
        if (srvAsst && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork(srvAsst) && !srvAsst.metadata?.pending && !srvErrTxt) {
          const stalled = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, srvAsst) : null;
          if (typeof this.mergeServer === 'function') this.mergeServer(j.messages, null);
          if (!stalled) {
            this.error = null; this.errText = ''; this._officialTurnErrAt = 0; this.emit();
            return { verified: true, mode: 'already-done', srvUser: srvU };
          }
        }
        if (srvAsst && srvAsst.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(srvAsst))) {
          if (typeof this.mergeServer === 'function') this.mergeServer(j.messages, null);
          this.error = null; this.errText = ''; this._officialTurnErrAt = 0;
          this.restream();
          return { verified: true, mode: 'server-busy', srvUser: srvU };
        }
        if (srvAsst && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork(srvAsst) && typeof this.mergeServer === 'function') {
          this.mergeServer(j.messages, null);
        }
        return { verified: true, mode: 'continue', srvUser: srvU };
      }
      const localHasWork = Boolean((this.messages || []).at(-1)?.role === 'assistant' && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork((this.messages || []).at(-1)));
      if (!localHasWork && (parentIdx >= 0 || !j.pagination?.hasMore)) {
        return { verified: false, mode: 'resend-orig', reason: 'not-in-db' };
      }
      return { verified: true, mode: 'continue' };
    } catch {
      return { verified: true, mode: 'continue' };
    }
  }
  // 直接问实时通道：从发送前的位置起，服务器写了哪些记录（只读已写入的，不等待）
  //   taken = 有分派记录且 inputId 是这条；busy = 有一轮正在进行（分派 / start 之后还没有 turn-complete）
  //   读不完整 / 出错 = null（未知）
  async peekTurn(base, id, maxMs = 9000, opt = {}) {
    const settleCheck = !!opt?.settleCheck || id == null;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), maxMs);
    try {
      await this.ensureToken();
      const hd = { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '1', 'X-Peek-Settled': '1' };
      if (base != null) hd['Last-Event-ID'] = String(base);
      const res = await rawFetch(OUT(this.sid), { headers: hd, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return null;
      let taken = false, busy = false, n = 0, done = false, last = null, buf = '';
      const rd = res.body.getReader(), dec = new TextDecoder();
      const eat = (blk) => {
        const data = blk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        if (!data) return;
        if (data.trim() === '[DONE]') { done = true; return; }
        let j; try { j = JSON.parse(data); } catch { return; }
        for (const rec of j.records || []) {
          n++; if (rec.seq_num != null) last = +rec.seq_num;
          const hm = rec.headers?.length ? Object.fromEntries(rec.headers) : {};
          if (hm['trigger-control'] === 'turn-complete') { busy = false; continue; }
          let bd = null; try { bd = rec.body ? JSON.parse(rec.body) : null; } catch {}
          if ([bd, bd?.data, bd?.chunk].some(x => x?.type === 'trigger:turn-complete')) { busy = false; continue; }
          const t = bd?.data?.type;
          if (t === 'finish' && bd?.data?.finishReason !== 'tool-calls') { busy = false; continue; }
          if (t === 'error' || t === 'abort') { busy = false; continue; }
          if (t === 'data-agent-dispatch') { busy = true; if (id && bd.data.data?.inputId === id) taken = true; }
          else if (t && /^(start|start-step|text-|reasoning-|tool-|source-|file)/.test(t)) busy = true;
        }
      };
      try {
        for (;;) {
          const { done: end, value } = await rd.read(); if (end) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { eat(buf.slice(0, i)); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ''); }
          if (taken || done) break;
        }
        if (buf.trim()) eat(buf);
      } catch (e) {
        if (buf.trim()) try { eat(buf); } catch {}
        if (!taken && !busy && !settleCheck) return null;
      }
      finally { try { ctl.abort(); } catch {} }
      if (taken) return { taken, busy: true, n, last };
      if (!done) return busy ? { taken: false, busy: true, n, last, partial: true } : (settleCheck ? { taken: false, busy: false, settled: true, n, last } : null);
      return { taken, busy, settled: !busy, n, last };
    } catch { return null; }
    finally { clearTimeout(tm); }
  }
  // 兜底：发出后迟迟没看到服务器接单（正常约 6.5 秒）。
  // 「停止」事件如果在服务器处理这一轮时到达，会直接打断这一轮（浏览器里显示 Stopped）——所以唤醒必须极其保守：
  //   1. 先直接问实时通道（从发送前的位置读已写入的记录）：已分派 / 有一轮在跑 → 只是本地漏了记录，重新接上，绝不发停止
  //   2. 再查对话记录里有没有这条：有 → 已接单，重新接上
  //   3. 任何一步出错 / 超时 / 结果未知 → 只重新接上，稍后再查，绝不发停止
  //   4. 只有连续两次（间隔 ≥ 6 秒、且发出已 ≥ 18 秒）实时通道和对话记录都明确「没有、服务器空闲」时，才发一个空的「停止」唤醒
  armLost(msg) {
    clearTimeout(this.lostT);
    const at = now(), id = this.awaitId, base = this.baseSeq; let n = 0, neg = 0, negAt = 0, unk = 0;
    this.appAt = at; this.oursAt = 0; this.dlv = 'sent';
    const alive = () => this.awaitId === id && this.busy && !this.live && !(this.oursAt > at);
    const taken = (why) => {
      this.oursAt = now(); this.dlv = 'taken'; this.phase = '服务器已接单，等待模型开始'; this.lostWhy = why; this.emit();
      if (!this.streaming || now() - Math.max(this.byteAt || 0, this.recAt || 0, this.streamOpenAt || 0) > 12000) this.restream();
      this.watchStart(id);
    };
    const tick = (ms) => {
      clearTimeout(this.lostT);
      this.lostT = setTimeout(async () => {
        if (!alive()) return;
        // 刚收到过记录（服务器在跑别的 / 本地通道正常）：再等等
        if (now() - (this.recAt || 0) < 5500) { tick(3500); return; }
        const pk = await this.peekTurn(base, id, 3500, { settleCheck: true });
        if (!alive()) return;
        if (pk?.taken) return taken('peek');
        if (pk?.busy) { neg = 0; this.restream(); tick(8000); return; }
        const db = pk ? await this.inDb(id, this.msgText(id), this.appAt || 0) : null;
        if (!alive()) return;
        if (db === true) return taken('db');
        if (!pk || db !== false) {
          // 未知：重新接上实时通道，稍后再查（多次未知只提示，不唤醒、不报错）
          neg = 0; unk++; this.restream();
          if (unk >= 3 && !this.oursAt) { this.phase = '已送达 · 暂时无法确认服务器状态（网络较慢），继续等待'; this.emit(); }
          tick(unk < 6 ? 6000 : 15000); return;
        }
        unk = 0;
        const minGap = msg?._queued ? 6000 : 3500;
        const minAge = msg?._queued ? 18000 : 8500;
        if (!neg) { neg = 1; negAt = now(); tick(Math.max(minGap, minAge - (now() - at))); return; }
        if (now() - negAt < minGap || now() - at < minAge) { tick(Math.max(2000, minGap - (now() - negAt), minAge - (now() - at))); return; }
        neg = 0;
        if (msg?._queued) {
          // 队列消息：服务器可能已收下（在输入流里排队）但没开始处理——只读核对 + 唤醒（空的「停止」，条件和普通发送一样苛刻：实时通道和对话记录都明确空闲）。
          // 绝不重发正文；不唤醒的话这条会一直躺在服务器输入流里，等下一次手动发送时才「夹」进去被处理。
          if (n >= 4) { this.status = 'error'; this.error = '队列消息服务器还没开始处理。它可能已被服务器收下，请先刷新核对，不要直接重发'; this.phase = ''; msg.failed = true; msg.deliveryUnknown = true; this.awaitId = null; this.awaitFrom = 0; this.emit(); return; }
          n++; this.wakes = (this.wakes || 0) + 1; this.dlv = 'wake';
          this.phase = '队列消息服务器还没开始处理，正在唤醒' + (n > 1 ? '（第 ' + n + ' 次）' : '') + '（不会重发正文）'; this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
          if (!this.streaming) this.stream();
          tick(15000); return;
        }
        if (n >= 4) {
          // 唤醒 4 次服务器上仍然没有这条消息：结束等待，报错让用户重试（队列会暂停，不会一直显示在等）
          this.status = 'error'; this.error = '服务器没有接收这条消息（已唤醒 4 次，服务器上也没有）。可以点重试'; this.phase = ''; this.dlv = '';
          if (msg) msg.failed = true; this.awaitId = null; this.awaitFrom = 0; this.emit(); return;
        }
        n++; this.wakes = (this.wakes || 0) + 1; this.dlv = 'wake';
        this.wakeLog = (this.wakeLog || []).concat({ at: now(), id, pk: pk && pk.n }).slice(-10);
        if (this.wakeSessionToken) { try { await this.wakeSessionToken(true); } catch {} }
        else if (this.ensureToken) { try { await this.ensureToken(true); } catch {} }
        if ((n === 1 || n === 2) && this.reSend?.id === id) {
          this.phase = n === 1 ? '服务器没接单，正在唤醒并重新投递' : '服务器没收到这条，正在重新发送'; this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
          try { await this.reSend.fn(); this.resent = (this.resent || 0) + 1; } catch {}
        } else {
          this.phase = '服务器没接单，正在唤醒' + (n > 1 ? '（第 ' + n + ' 次）' : ''); this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
        }
        if (!this.streaming) this.stream();
        tick(10000);
      }, ms);
    };
    tick(2800);
  }
  // 服务器已接单但迟迟没有开始输出：每 18 秒核对一次实时通道（漏了记录就补上），并在状态里显示已等待的时间
  watchStart(id) {
    clearTimeout(this.startT);
    this.startT = setTimeout(() => {
      if (this.awaitId !== id || !this.busy || this.live) return;
      if (!this.streaming || now() - Math.max(this.byteAt || 0, this.recAt || 0, this.streamOpenAt || 0) > 25000) this.restream();
      this.watchStart(id);
    }, 18000);
  }
  // 输入框上方 / 回复占位里显示的送达状态（让人知道到底发没发出去、服务器在不在处理）
  dlvText() {
    if (!this.busy || this.live) return '';
    const s = t => Math.max(0, Math.round((now() - t) / 1000)) + 's';
    if (!this.appAt || this.appAt < (this.sentAt || 0)) return this.phase || '发送中';
    if (this.dlv === 'wake') return this.phase + ' · ' + s(this.appAt);
    if (this.oursAt) return '服务器已接单 · 等待模型开始 ' + s(this.oursAt);
    if (this.turnInput && this.turnInput !== this.awaitId) return '已送达 · 服务器在处理之前的消息 ' + s(this.appAt);
    return '已送达 · 等待服务器接单 ' + s(this.appAt);
  }
  // 这一轮是不是在回答「之前」的消息（服务器落后了）：分派记录里的 inputId = 那条用户消息的 id
  foreignTurn() {
    const a = this.awaitId, t = this.turnInput;
    if (a && this.preSend) return true;   // 自己这条还没发出去：这时服务器上跑的任何一轮都是「之前的消息」
    if (!a || !t || t === a) return false;
    const it = this.messages.findIndex(m => m.id === t && m.role === 'user'), ia = this.messages.findIndex(m => m.id === a);
    // 本地没有的那条（别的设备发的 / 之前丢了的）也算「之前的消息」：它的回复不能当成自己这条的
    if (it < 0) return ia >= 0;
    return ia >= 0 && it < ia;
  }
  // 某条用户消息的回复应该插在哪：它后面、下一条用户消息之前
  slotAfter(uid) {
    const i = this.messages.findIndex(m => m.id === uid); if (i < 0) return -1;
    let j = i + 1; while (j < this.messages.length && this.messages[j].role !== 'user') j++;
    return j >= this.messages.length ? -1 : j;
  }
  // 补答之前消息的那一轮结束了：收尾那条回复，继续等自己这条；服务器卡住（已读取但没处理）时轻推一下
  foreignDone(hm) {
    this.fDone = (this.fDone || 0) + 1;
    const m = this.live;
    if (m) { m.metadata = { ...m.metadata, pending: false }; m.parts.forEach(p => { if (p.state === 'streaming') p.state = 'done'; }); m.v++; }
    this.live = null; this.parts.clear(); this.turnInput = null;
    this.status = 'submitted'; this.phase = '等待回复（服务器刚补答完之前的消息）';
    const E = +hm['session-in-event-id'], C = +hm['session-in-consumed-id'];
    // 服务器已经读取了后面的消息但没开始处理（consumed > event）：2.5 秒内没有新的分派，就发一个空的「停止」事件把它唤醒
    // （空闲时的停止不会影响任何回复；实测唤醒后会立刻处理积压的那条）
    if (Number.isFinite(E) && Number.isFinite(C) && C > E && (this.wakes || 0) < 5) {
      const at = now(), id = this.awaitId, base = this.lastSeq; clearTimeout(this.wakeT);
      // 同样保守：4 秒内没有新的分派 → 问实时通道 + 对话记录，都明确「没有、空闲」才唤醒；未知就交给 armLost 的兜底
      this.wakeT = setTimeout(async () => {
        const ok = () => this.awaitId === id && this.busy && !this.live && !((this.dispAt || 0) > at) && !(this.oursAt > at);
        if (!ok()) return;
        const pk = await this.peekTurn(base, id, 3500, { settleCheck: true }); if (!ok()) return;
        if (pk?.taken || pk?.busy) { this.restream(); return; }
        const db = pk ? await this.inDb(id, this.msgText(id), this.appAt || 0) : null; if (!ok()) return;
        if (db === true) { this.oursAt = now(); this.dlv = 'taken'; this.phase = '服务器已接单，等待模型开始'; this.emit(); this.restream(); this.watchStart(id); return; }
        if (!pk || db !== false) return;
        this.wakes = (this.wakes || 0) + 1; this.phase = '唤醒服务器处理积压的消息'; this.emit();
        try { await this.append({ kind: 'stop' }); } catch {}
        if (!this.streaming) this.stream();
      }, 4000);
    }
    this.emit();
  }
  // 把实时通道读到最新位置，只记位置、不显示内容；如果有一轮正在跑（有 start 没有 turn-complete），从这一轮开头接上
  async drain(maxMs = 1800, opt = {}) {
    if (this.gacha && this.lastSeq == null) return null;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), maxMs), t0 = now();
    try {
      await this.ensureToken();
      const hd = { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '1', 'X-Peek-Settled': '1' };
      if (this.lastSeq != null) hd['Last-Event-ID'] = String(this.lastSeq);
      const res = await rawFetch(OUT(this.sid), { headers: hd, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return null;
      // 边读边收：有一轮正在输出时服务器不会在 1 秒内结束这个请求（会一直推送），超时就用已经读到的完整记录（partial）
      let txt = '', partial = false;
      try { const rd = res.body.getReader(), dec = new TextDecoder(); for (;;) { const { done, value } = await rd.read(); if (done) break; txt += dec.decode(value, { stream: true }); } }
      catch { partial = true; const k = Math.max(txt.lastIndexOf('\n\n'), txt.lastIndexOf('\r\n\r\n')); txt = k >= 0 ? txt.slice(0, k) : ''; if (!txt) return null; }
      let max = this.lastSeq != null ? +this.lastSeq : -1, open = null, n = 0, act = null, run = null, runIn = null, lastRun = null, midChunk = null;
      for (const blk of txt.split(/\r?\n\r?\n/)) {
        const data = blk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        if (!data || data.trim() === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        for (const rec of j.records || []) {
          if (rec.seq_num == null) continue; const sq = +rec.seq_num; if (sq <= max) continue; max = sq; n++;
          const hm = rec.headers?.length ? Object.fromEntries(rec.headers) : {};
          if (hm['trigger-control'] === 'turn-complete') { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; const ts = +rec.timestamp; if (ts && this.srvSkew != null) this.tcAt = Math.max(this.tcAt || 0, Math.min(now(), ts + this.srvSkew)); continue; }
          let b = null; try { b = rec.body ? JSON.parse(rec.body) : null; } catch {}
          if ([b, b?.data, b?.chunk].some(x => x?.type === 'trigger:turn-complete')) { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; continue; }   // 新版：结束标记放在记录内容里
          const bty = b?.data?.type || b?.type || '';
          if ((bty === 'finish' && b?.data?.finishReason !== 'tool-calls') || bty === 'error' || bty === 'abort') { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; continue; }
          if (bty === 'start' && open == null) open = sq;
          if (act == null && (bty === 'start' || bty === 'data-agent-dispatch')) act = sq;
          // 最后一个结束标记之后的第一条分派 / start = 服务器上正在跑的一轮（可能是网页 / 别的设备发起的）
          if (run == null && (bty === 'start' || bty === 'data-agent-dispatch')) { run = sq; lastRun = sq; }
          if (runIn == null && bty === 'data-agent-dispatch') runIn = b?.data?.data?.inputId || '';
          if (midChunk == null && (bty === 'start-step' || bty === 'text-start' || bty === 'text-delta' || bty === 'reasoning-start' || bty === 'reasoning-delta' || bty === 'tool-input-start' || bty === 'tool-input-available')) midChunk = sq;
        }
      }
      const activeStart = open ?? run ?? midChunk;
      const pick = activeStart ?? (opt?.keepIfFinished ? (lastRun ?? act) : null);
      this.drainInfo = { n, ms: now() - t0, open: activeStart != null, act: act ?? lastRun ?? midChunk, run: (run ?? midChunk) != null, runSeq: run ?? open ?? midChunk, runIn, partial, max };
      if (pick != null) {
        this.lastSeq = String(Math.max(0, pick - 1)); this.fence = pick - 1;
        if (activeStart == null && opt?.keepIfFinished) this.reconcile(350);
      } else if (max >= 0) {
        this.lastSeq = String(max); this.fence = max;
        if (opt?.keepIfFinished) this.reconcile(250);
      }
      return this.drainInfo;
    } catch { return null; }
    finally { clearTimeout(tm); }
  }
  // 客户端自己的诊断轨迹（只存内存，每个对话最多 500 条；「抓记录」时一起导出）：记下每一步怎么处理实时记录——
  // 丢消息时能看出是记录没到、被当成重复 / 旧记录 / 尾巴跳过了，还是到了但没显示。
  dbg(k, o) {
    const r = this.trc || (this.trc = []); r.push({ t: now(), k, ...(o || {}) }); if (r.length > 500) r.splice(0, r.length - 450);
  }
  recTy(rec) { try { const b = rec.body ? JSON.parse(rec.body) : null; return b?.data?.type || b?.type || (rec.headers?.length && Object.fromEntries(rec.headers)['trigger-control']) || ''; } catch { return ''; } }
  dbgRec(rec, r) { const ty = this.recTy(rec); if (r !== 'ok' || !/^(text-delta|reasoning-delta|tool-input-delta)$/.test(ty)) this.dbg?.('rec', { seq: rec.seq_num, ty, r }); else this.trcN = (this.trcN || 0) + 1; }
  onRecord(rec) {
    // Reconnects may replay an inclusive cursor; never append the same event twice or rewind.
    if (rec.seq_num != null && this.lastSeq != null && +rec.seq_num <= +this.lastSeq) return;
    // 已经读过的（drain 读到的最新位置之前）直接跳过
    if (this.fence != null && rec.seq_num != null && +rec.seq_num <= this.fence) return;
    if (rec.seq_num != null) this.lastSeq = String(rec.seq_num);
    // 兜底：等这一轮回复时，发送前很久的旧记录（按服务器时间，已校正时钟差）不再当成这一轮——
    // 否则长对话后期会出现「回答的是上一次 / 上上次的问题」、真正的回复要等下次发送才出来
    if (this.awaitFrom && this.srvSkew != null && rec.timestamp && +rec.timestamp + (this.srvSkew || 0) < this.awaitFrom - 8000) { this.staleSkip = (this.staleSkip || 0) + 1; this.dbgRec?.(rec, 'stale'); return; }
    this.dbgRec?.(rec, 'ok');
    this.lastActivity = now(); this.recAt = now();
    if (rec.headers?.length) {
      const hm = Object.fromEntries(rec.headers);
      if (hm['trigger-control'] === 'turn-complete') {
        this.tcAt = this.realTcAt = now();
        if (this.foreignTurn()) { this.foreignDone(hm); return; }
        const lateTok = hm['public-access-token'] || runTokIn(rec.headers.map(x => x?.[1]).join(' ')) || runTokIn(rec.body) || null;
        if (!this.live && this.endAt && now() - this.endAt < 15000) {
          if (lateTok && lateTok !== this.idTok && /read:runs:run_/.test(JSON.stringify(jwt(lateTok)?.scopes || ''))) { this.runTok = lateTok; this.runAt = now(); Bus.emit('runtoken', this); this.identify(lateTok); }
          if (!this.busy) return 'done';
          if (!this.turnInput && this.sentAt >= this.endAt) return;
        }
        this.finishTurn(lateTok); return 'done';
      }
      // 运行一开始记录头里就带本轮运行令牌（read:runs）：立即开始识别模型，不等回复结束
      const hTok = hm['public-access-token'];
      if (typeof hTok === 'string' && hTok.length > 20) this.setToken(hTok);
      const tk = hTok || runTokIn(rec.headers.map(x => x?.[1]).join(' '));
      if (tk && tk !== this.runTok && /read:runs:run_/.test(JSON.stringify(jwt(tk)?.scopes || ''))) { this.runTok = tk; this.runAt = now(); Bus.emit('runtoken', this); this.identify(tk); }
    }
    if (!rec.body) return;
    // 新版传输：本轮运行令牌也可能放在记录内容里（例如 {type:'trigger:turn-complete', publicAccessToken}），不一定在记录头
    const rt = runTokIn(rec.body);
    if (rt && rt !== this.runTok) { this.runTok = rt; this.runAt = now(); Bus.emit('runtoken', this); this.identify(rt); }
    let b; try { b = JSON.parse(rec.body); } catch { return; }
    const tcc = [b, b?.data, b?.chunk].find(x => x?.type === 'trigger:turn-complete');
    if (tcc) {
      this.tcAt = this.realTcAt = now();
      if (this.foreignTurn()) { this.foreignDone({ 'public-access-token': tcc.publicAccessToken || rt || '' }); return; }
      const lateTok = tcc.publicAccessToken || rt || null;
      if (!this.live && this.endAt && now() - this.endAt < 15000) {
        if (lateTok && lateTok !== this.idTok && /read:runs:run_/.test(JSON.stringify(jwt(lateTok)?.scopes || ''))) { this.runTok = lateTok; this.runAt = now(); Bus.emit('runtoken', this); this.identify(lateTok); }
        if (!this.busy) return 'done';
        if (!this.turnInput && this.sentAt >= this.endAt) return;
      }
      this.finishTurn(lateTok); return 'done';
    }
    const ch = b?.data; if (ch?.type && !String(ch.type).startsWith('trigger:')) { this.recTs = +rec.timestamp || 0; try { this.apply(ch); } finally { this.recTs = 0; } }
  }
  liveMsg(create) {
    if (this.live) return this.live;
    // 在补答之前的消息（自己这条已经在末尾）：接到自己这条前面那条进行中的回复上，没有就插在自己这条前面
    if (this.foreignTurn()) {
      const ia = this.messages.findIndex(x => x.id === this.awaitId);
      if (ia > 0) {
        const pv = this.messages[ia - 1];
        if (pv.role === 'assistant' && pv.metadata?.pending) { this.live = pv; return pv; }
        if (!create) return null;
        const m = { id: uuid7(), role: 'assistant', parts: [], metadata: { pending: true }, v: 0 };
        this.messages.splice(ia, 0, m); this.live = m; return m;
      }
    }
    const last = this.messages.at(-1);
    if (last && last.role === 'assistant' && (last.metadata?.pending || this.busy)) { this.live = last; return last; }
    if (!create) return null;
    const m = { id: uuid7(), role: 'assistant', parts: [], metadata: { pending: true }, v: 0 };
    this.messages.push(m); this.live = m; return m;
  }
  apply(ch) {
    try { if (typeof BillingProbe !== 'undefined') BillingProbe.observe(this, ch); } catch {}
    const t = ch.type;
    if (t === 'start') {
      let m = ch.messageId ? this.messages.find(x => x.id === ch.messageId) : null;
      // 重放正在进行的一轮：服务器快照里的那条 pending 回复和流里的 messageId 可能不一致，复用它，避免出现两条回复
      if (!m && !this.foreignTurn()) { const lt = this.messages.at(-1); if (lt && lt.role === 'assistant' && lt.metadata?.pending && !lt._local) m = lt; }
      if (m) { if (!Array.isArray(m.parts)) m.parts = []; } else {
        m = { id: ch.messageId || uuid7(), role: 'assistant', parts: [], metadata: {}, v: 0 };
        // 服务器在补答之前的某条消息：放到那条消息后面，而不是当成最新这条的回复
        const fg = this.foreignTurn(); let at = fg ? this.slotAfter(this.turnInput) : -1;
        if (fg && at < 0) at = this.messages.findIndex(x => x.id === this.awaitId);   // 本地没有的那条：回复放在自己这条前面
        if (at >= 0) this.messages.splice(at, 0, m); else this.messages.push(m);
      }
      m.metadata = { ...(m.metadata || {}), ...(ch.messageMetadata || {}), pending: true };
      { const ts = this.recTs || now(), d = this.recTs ? this.dispTs : this.dispAt; this.fmt = Fmt.fresh(d && ts >= d && ts - d < 600000 ? d : ts); m._fmt = this.fmt; } this.fmtGuess = null;   // 回复格式识别：每一轮重新收集
      if (!this.foreignTurn()) { this.oursAt = this.oursAt || now(); clearTimeout(this.startT); if (this.stopPending) setTimeout(() => this.stop(), 0); }
      // 不是自己发起的这一轮（网页 / 别的设备提交了回答或发了消息）：把那条用户消息补进来，提问卡片同步成已回答
      if (!this.gacha && (!this.awaitId || this.foreignTurn())) this.reconcile(700);
      this.live = m; this._contentKey = ''; this.parts.clear();
      this._snapTextParts = []; this._snapReasonParts = [];
      for (const p of m.parts || []) {
        if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
        else if (p?.type === 'text') {
          if (p.id) { p._replayBuf = ''; this.parts.set('t:' + p.id, p); }
          else this._snapTextParts.push(p);
        } else if (p?.type === 'reasoning') {
          if (p.id) { p._replayBuf = ''; this.parts.set('r:' + p.id, p); }
          else this._snapReasonParts.push(p);
        }
      }
      this.status = this.status === 'stopping' ? 'stopping' : 'streaming'; this.phase = '生成中'; this.emit(); return;
    }
    if (t.startsWith('data-') && ch.transient) {
      if (t === 'data-agent-dispatch') {
        this.turnInput = ch.data?.inputId || (this.waitingForeign ? this.turnInput : null); this.dispAt = now(); this.dispTs = this.recTs || 0; clearTimeout(this.wakeT);
        if (this.foreignTurn()) { this.phase = '服务器在补答之前的消息'; this.emit(); return; }
        // 只有分派记录里的 inputId 就是自己这条，才算「已接单」；没有 inputId 的分派不当成接单（兜底唤醒继续有效）
        if (this.awaitId && this.turnInput === this.awaitId) { this.oursAt = now(); this.dlv = 'taken'; this.watchStart(this.awaitId); if (this.stopPending) setTimeout(() => this.stop(), 0); }
        if (!this.live) this.phase = this.oursAt ? '服务器已接单' : '服务器在处理'; if (this.status === 'submitted' && this.oursAt) this.status = 'streaming';
      }
      else if (t === 'data-workspace-save-status') this.phase = '保存工作区 · ' + (ch.data?.phase || '');
      this.emit(); return;
    }
    // 回复格式识别（拿不到运行记录时按格式推测厂商）
    if (this.fmt) { try { Fmt.feed(this.fmt, ch, this.recTs || now()); const g = Fmt.guess(this.fmt); if (g && (g.fam !== this.fmtGuess?.fam || g.sure !== this.fmtGuess?.sure)) { this.fmtGuess = g; Bus.emit('fmt', this, g); } } catch {} }
    // 空闲时收到的零散记录（上一轮结束后的尾巴）不新建回复消息，避免多出一条重复 / 错位的回复
    if (!this.live && ch?.toolCallId && /^(tool-input-delta|tool-input-available|tool-input-error|tool-output-available|tool-output-error|tool-output-denied|tool-approval-request)$/.test(t)) {
      const ownerM = [...(this.messages || [])].reverse().find(x => x?.role === 'assistant' && Array.isArray(x.parts) && x.parts.some(p => p && p.toolCallId === ch.toolCallId));
      if (ownerM) {
        if (ownerM === this.messages.at(-1) && !this.stopReq && !Hitl.idleWait(this)) {
          ownerM.metadata = { ...(ownerM.metadata || {}), pending: true };
          delete ownerM._finishedAt;
          this.live = ownerM;
          this.status = 'streaming'; this.phase = '生成中';
          this.parts.clear();
          for (const p of ownerM.parts || []) {
            if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            else if ((p?.type === 'text' || p?.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          }
        } else {
          const tp = ownerM.parts.find(p => p && p.toolCallId === ch.toolCallId);
          if (tp) {
            if (t === 'tool-input-delta' && tp.state !== 'output-available') tp.inputText = (tp.inputText || '') + (ch.inputTextDelta || '');
            else if (t === 'tool-input-available' || t === 'tool-input-error') { tp.input = ch.input; tp.state = t === 'tool-input-error' ? 'output-error' : 'input-available'; if (ch.errorText) tp.errorText = ch.errorText; }
            else if (t === 'tool-output-available') { tp.output = ch.output; tp.state = 'output-available'; tp.preliminary = !!ch.preliminary; delete tp.errorText; if (!tp.preliminary && tp._startAt && !tp._durMs) tp._durMs = Math.max(0, (this.recTs || now()) - tp._startAt); }
            else if (t === 'tool-output-error') { tp.errorText = ch.errorText; tp.state = 'output-error'; }
            else if (t === 'tool-output-denied') tp.state = 'output-denied';
            else if (t === 'tool-approval-request') tp.state = 'approval-requested';
            ownerM.v = (ownerM.v || 0) + 1;
            this.emit();
            return;
          }
        }
      }
    }
    if (!this.live && this.status === 'idle') {
      const lm = this.messages.at(-1);
      const isStreamChunk = (t === 'start-step' || t === 'text-start' || t === 'text-delta' || t === 'reasoning-start' || t === 'reasoning-delta' || t === 'tool-input-start' || t === 'tool-input-available' || t === 'tool-output-available');
      const canReopenTailAsst = Boolean(lm?.role === 'assistant' && !lm.metadata?.pending && !this.stopReq && !Hitl.idleWait(this) && isStreamChunk);
      if (canReopenTailAsst) {
        lm.metadata = { ...(lm.metadata || {}), pending: true };
        delete lm._finishedAt;
        this.live = lm;
        this.parts.clear();
        for (const p of lm.parts || []) {
          if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
          else if ((p?.type === 'text' || p?.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
        }
      }
      const canPromote = (lm?.role === 'user' || lm?.metadata?.pending || canReopenTailAsst) && !Hitl.idleWait(this) && isStreamChunk;
      if (canPromote) {
        this.status = 'streaming'; this.phase = '生成中';
        this.liveMsg(true);
      } else {
        this.dbg?.('drop', { ty: t, why: 'idle-no-live' }); return;
      }
    }
    // 已点停止：之后到达的输出不再显示（界面立刻停下，不跟着服务器再多吐几行）
    if (this.status === 'stopping' && /^(start-step|text-start|text-delta|reasoning-start|reasoning-delta|tool-input-start|tool-input-delta)$/.test(t)) return;
    const m = this.liveMsg(true); if (this.fmt && !m._fmt) m._fmt = this.fmt; m.v++;
    if (this.status === 'submitted') this.status = 'streaming';
    this.progAt = now();
    if (!/^(finish|finish-step|message-metadata|error|abort)$/.test(t)) {
      if (this.finAt) { this.finAt = 0; clearTimeout(this._finTurnT); this._finTurnT = 0; }
      if (this.sentAt && !(this.respAt >= this.sentAt)) { this.respAt = now(); if (this.rcV3) { this.rcV3 = false; IPRep.note('ok'); } }
    }
    const P = m.parts, find = id => this.parts.get(id);
    switch (t) {
      case 'start-step': if (P.at(-1)?.type !== 'step-start') P.push({ type: 'step-start' }); break;
      case 'finish-step': this.parts.forEach((p, k) => { if (!String(k).startsWith('tool:')) this.parts.delete(k); }); break;
      case 'text-start': case 'reasoning-start': {
        // 抽卡：正文后出现可见思考时按开关停止；不把它当作改派证明，已知闭源除外
        const pType = t.split('-')[0], key = t[0] + ':' + ch.id;
        let p = ch.id != null ? find(key) : null;
        if (!p) {
          const snapQ = pType === 'text' ? this._snapTextParts : this._snapReasonParts;
          if (snapQ?.length) {
            p = snapQ.shift();
            if (ch.id != null) p.id = String(ch.id);
            p.state = 'streaming';
            p._replayBuf = '';
          }
        } else if (p.text) {
          p._replayBuf = '';
          p.state = 'streaming';
        }
        if (!p) {
          p = { type: pType, text: '', state: 'streaming', ...(ch.id != null ? { id: String(ch.id) } : {}) };
          P.push(p);
        }
        this.parts.set(key, p);
        this.phase = t === 'text-start' ? '输出中' : '思考中';
        break;
      }
      case 'text-delta': case 'reasoning-delta': {
        const pType = t.split('-')[0], key = t[0] + ':' + ch.id;
        let p = find(key);
        if (!p) {
          const snapQ = pType === 'text' ? this._snapTextParts : this._snapReasonParts;
          if (snapQ?.length) {
            p = snapQ.shift();
            if (ch.id != null) p.id = String(ch.id);
            p.state = 'streaming';
            p._replayBuf = '';
          } else {
            p = { type: pType, text: '', state: 'streaming', ...(ch.id != null ? { id: String(ch.id) } : {}) };
            P.push(p);
          }
          this.parts.set(key, p);
        }
        if (p.type === 'reasoning' && /[^\s.…·。]/.test(String(ch.delta || ''))) { const firstVis = !/[^\s.…·。]/.test(p.text); const isClosed = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(this)) || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(this)); if (!isClosed) { if (firstVis) { this.thinkGuard(p); try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') BillingProbe.markAsOpenSourceModel(this); } catch {} } try { if (this.gacha?.skipCompatThinking && typeof Fingerprint !== 'undefined') Fingerprint.maybeStopCompat?.(this); } catch {} if (firstVis && this.gacha?.stopThink && !this.stopReq && P.some(x => x !== p && x.type === 'text' && String(x.text || '').trim())) { this.thinkStopped = true; this.routedThink = true; if (this.live) this.live.metadata = { ...(this.live.metadata || {}), openThinkStopped: true }; setTimeout(() => this.stop(), 0); } } }
        const dStr = ch.delta || '';
        if (typeof p._replayBuf === 'string') {
          p._replayBuf += dStr;
          if (p._replayBuf.length >= (p.text || '').length || !String(p.text || '').startsWith(p._replayBuf)) {
            p.text = p._replayBuf;
            delete p._replayBuf;
          }
        } else {
          p.text += dStr;
        }
        if (t === 'text-delta') this.checkMidStreamRoute(t, ch);
        break;
      }
      case 'text-end': case 'reasoning-end': { const p = find(t[0] + ':' + ch.id); if (p) { if (typeof p._replayBuf === 'string') { if (p._replayBuf.length >= (p.text || '').length) p.text = p._replayBuf; delete p._replayBuf; } p.state = 'done'; } break; }
      case 'tool-input-start': {
        let p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId);
        if (!p) {
          p = { type: ch.dynamic ? 'dynamic-tool' : 'tool-' + ch.toolName, toolName: ch.toolName, toolCallId: ch.toolCallId, state: 'input-streaming', inputText: '', _startAt: this.recTs || now() };
          P.push(p);
        } else if (p.state !== 'output-available') {
          p.inputText = '';
          p.state = 'input-streaming';
        }
        this.parts.set('tool:' + ch.toolCallId, p);
        this.phase = '调用 ' + ch.toolName;
        this.checkMidStreamRoute(t, ch);
        break;
      }
      case 'tool-input-delta': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p && p.state !== 'output-available') p.inputText = (p.inputText || '') + (ch.inputTextDelta || ''); break; }
      case 'tool-input-available': case 'tool-input-error': {
        let p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId);
        if (!p) { p = { type: ch.dynamic ? 'dynamic-tool' : 'tool-' + ch.toolName, toolName: ch.toolName, toolCallId: ch.toolCallId }; P.push(p); this.parts.set('tool:' + ch.toolCallId, p); }
        p.input = ch.input; p.state = t === 'tool-input-error' ? 'output-error' : 'input-available'; if (ch.errorText) p.errorText = ch.errorText;
        // 提问工具的参数能解析出题目：按「等待回答」显示面板（和网页一致），报错文字只留作诊断
        if (t === 'tool-input-error' && Hitl.name(p) === 'ask_user' && Array.isArray(Hitl.input(p)?.questions)) { p.state = 'input-available'; p.softError = ch.errorText || ''; }
        this.phase = '执行 ' + (ch.toolName || p.toolName || '工具'); break;
      }
      case 'tool-output-available': { const p = find('tool:' + ch.toolCallId) || P.find(x => x.toolCallId === ch.toolCallId); if (p) { p.output = ch.output; p.state = 'output-available'; p.preliminary = !!ch.preliminary; delete p.errorText; if (!p.preliminary && p._startAt && !p._durMs) p._durMs = Math.max(0, (this.recTs || now()) - p._startAt); } break; }
      case 'tool-output-error': { const p = find('tool:' + ch.toolCallId) || P.find(x => x.toolCallId === ch.toolCallId); if (p) { if (Hitl.name(p) === 'ask_user' && /malformed|refresh and try again/i.test(String(ch.errorText || '')) && Array.isArray(Hitl.input(p)?.questions)) { p.softError = ch.errorText; if (p.state !== 'output-available') p.state = 'input-available'; } else { p.errorText = ch.errorText; p.state = 'output-error'; } } break; }
      case 'tool-output-denied': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p) p.state = 'output-denied'; break; }
      case 'tool-approval-request': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p) p.state = 'approval-requested'; break; }
      case 'source-url': case 'source-document': case 'file': P.push({ ...ch }); break;
      case 'message-metadata': m.metadata = { ...m.metadata, ...(ch.messageMetadata || {}) }; break;
      case 'finish': {
        const fr = ch.finishReason || ch.messageMetadata?.finishReason || m.metadata?.finishReason || '';
        if (fr) m.metadata.finishReason = fr;
        const hasOpenTool = P.some(p => p.toolCallId && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '') && !Hitl.name(p));
        if (fr === 'tool-calls' || hasOpenTool) {
          this.finAt = 0;
          clearTimeout(this._finTurnT);
          this._finTurnT = 0;
          break;
        }
        this.finAt = now(); m._finishedAt = this.finAt;
        m.metadata = { ...m.metadata, ...(ch.messageMetadata || {}), pending: false };
        P.forEach(p => { if (p.state === 'streaming') p.state = 'done'; });
        this.phase = '收尾中';
        clearTimeout(this._finTurnT);
        const finMsg = m;
        this._finTurnT = setTimeout(() => {
          if (this.live === finMsg && this.busy && !this.stopReq && this.finAt) {
            const stillOpen = (finMsg.parts || []).some(p => p.toolCallId && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '') && !Hitl.name(p));
            if (!stillOpen) this.finishTurn(this.runTok || null, true);
          }
        }, 750);
        break;
      }
      case 'error': {
        // 「工具响应格式错误」但这一条里有等待回答的提问：网页照常显示面板，这里也不报错、不弹重试，以服务器记录为准
        const rawErr = String(ch.errorText || '未知错误');
        if (/malformed|refresh and try again/i.test(rawErr) && P.some(x => Hitl.awaiting(x))) { this.softErr = rawErr; break; }
        const isOfficial = isOfficialTransientError(rawErr);
        const displayErr = formatOfficialErrorText(rawErr);
        if (!P.some(x => x && x.type === 'error' && x.text === displayErr)) {
          P.push({ type: 'error', text: displayErr, ...(displayErr !== rawErr ? { rawText: rawErr } : {}) });
        }
        this.error = displayErr || '模型返回错误'; this.errAt = now(); this.errText = rawErr;
        this._officialTurnErrAt = isOfficial ? this.errAt : 0;
        const lastU = [...this.messages].filter(x => x && x.role === 'user').at(-1);
        const isGraphReject = /The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(rawErr);
        if (lastU) {
          if (isGraphReject) {
            lastU._streamRejected = true;
            delete lastU._officialContinueParent;
          } else if (isOfficial && (lastU._appendAccepted || this.oursAt || P.length > 1 || !lastU._local)) {
            lastU._officialContinueParent = true;
            delete lastU._streamRejected;
          } else if (!isHitlToolResultUserMsg(lastU)) {
            lastU._streamRejected = true;
          }
        }
        if (isGraphReject && this._lastSentParentUserId) {
          const rejPid = String(this._lastSentParentUserId);
          (this._rejectedHealthyNodeIds ||= new Set()).add(rejPid);
          const rejU = (this.messages || []).find(x => x && x.role === 'user' && (String(x.metadata?.nodeId || '') === rejPid || String(x.id || '') === rejPid));
          if (rejU) { delete rejU._officialContinueParent; rejU._streamRejected = true; }
        }
        if (this.busy && !this.stopReq) {
          clearTimeout(this._errTurnT);
          const errMsg = m;
          this._errTurnT = setTimeout(() => {
            if (this.live === errMsg && this.busy && !this.stopReq) {
              this.finishTurn(this.runTok || null, true);
            }
          }, isOfficial && !isGraphReject ? 600 : 1200);
        }
        break;
      }
      case 'abort': m.metadata = { ...m.metadata, aborted: true, pending: false }; try { Strength.markAborted(this.sid); } catch {} this.phase = '已中止'; break;
      default:
        if (t.startsWith('data-')) { const ex = ch.id ? P.find(x => x.type === t && x.id === ch.id) : null; if (ex) ex.data = ch.data; else P.push({ type: t, id: ch.id, data: ch.data }); }
    }
    ThinkingStatus.eventPhase(this, ch);
    try { Fingerprint.maybeStopCompat(this); Fingerprint.maybeGuardProbe(this); } catch {}
    if ((t === 'finish' || t === 'tool-output-available' || t === 'tool-input-available') && Hitl.idleWait(this)) this.armHitl();
    if (t === 'text-delta' || t === 'reasoning-delta' || t === 'tool-input-delta') this.emitStreamSoon(20);
    else this.emit();
  }
  // 提问卡片兜底：已经停在「等用户回应」，但结束标记迟迟没到（连接抖动 / 服务器没推）——4 秒内没有新记录就本地收尾，并和服务器对一次账
  armHitl() {
    clearTimeout(this.hitlT);
    const live = this.live;
    const waitMs = this.gacha ? 1600 : 4000;
    this.hitlT = setTimeout(() => {
      if (!live || this.live !== live || !Hitl.idleWait(this)) return;
      if (now() - (this.recAt || 0) < (this.gacha ? 1200 : 3500)) { this.armHitl(); return; }
      this.finishTurn(null, true);
    }, waitMs);
  }
  finishTurn(runTok, forced) {
    clearTimeout(this._finTurnT);
    clearTimeout(this._errTurnT);
    if (forced && this.streaming) { this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null; }
    const m = this.live;
    this.dbg?.('finish', { forced: !!forced, parts: m?.parts?.length ?? null, ask: !!m?.parts?.some(p => p.toolCallId && Hitl.name(p)), seq: this.lastSeq, n: this.trcN || 0 }); this.trcN = 0;
    this.endAt = now(); this.tcAt = Math.max(this.tcAt || 0, this.endAt); this.endStop = !!this.stopReq;
    if (m && typeof Budget !== 'undefined') try { Budget.turn(this, m); } catch {}   /* 记一笔估算花费，用来推断总额度 / 余额 */
    this.fakeEnd = null; this.midTurnStall = null;
    if (m && !this.stopReq) {
      const open = m.parts.filter(p => p.toolCallId && (/^(input-streaming|input-available)$/.test(p.state || '') || (p.state === 'output-available' && p.output && typeof p.output === 'object' && p.output.status === 'running')));
      const ask = open.some(p => Hitl.name(p) || /(^|[-_])(ask|question|confirm|approval|choice|select|form|clarif|human|user[-_]?input)/i.test(String(p.toolName || p.type || '')));
      const lastP = m.parts.filter(p => p.type !== 'step-start').at(-1);
      if (open.length && !ask) this.fakeEnd = { at: now(), why: (open[0].toolName || '工具') + ' 还没返回结果就结束了（假结束）', key: 'open|' + m.id + '|' + m.parts.length };
      else if (forced && !this.finAt && lastP && lastP.type === 'text' && lastP.state === 'streaming' && m.metadata?.pending !== false) this.fakeEnd = { at: now(), why: '回复写到一半就结束了（假结束）', key: 'cut|' + m.id + '|' + m.parts.length };
      if (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled) {
        const stall = KeepAlive.isMidTurnStalled(this, m);
        if (stall) this.midTurnStall = { at: now(), why: stall.why, key: stall.key };
      }
    }
    if (m) {
      m._finishedAt = now();
      m.metadata = { ...m.metadata, pending: false };
      if (!m.metadata.timing?.completedAt) m.metadata.timing = { ...(m.metadata.timing || {}), startedAt: m.metadata.timing?.startedAt || this.oursAt || this.dispAt || 0, completedAt: now() }; if (this.stopReq) { m.metadata.aborted = true; if (this.thinkStopped || this.routedThink) m.metadata.openThinkStopped = true; try { Strength.markAborted(this.sid); } catch {} }
      m.parts.forEach(p => {
        if (p.state === 'streaming') p.state = 'done';
        if (p.toolCallId && !(Hitl.name(p) && !this.stopReq) && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '')) {
          if (this.stopReq) { p.state = 'output-error'; p.errorText = '已停止'; }
          else { p.state = 'output-error'; if (!p.errorText) p.errorText = '未返回结果'; }
        }
        if (p.preliminary) p.preliminary = false;
      });
      if (!this.stopReq && !this.midTurnStall && typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled) {
        const stallAfter = KeepAlive.isMidTurnStalled(this, m);
        if (stallAfter) this.midTurnStall = { at: now(), why: stallAfter.why, key: stallAfter.key };
      }
      m.v++;
    } else {
      const lastA = (this.messages || []).at(-1);
      if (lastA?.role === 'assistant') {
        lastA._finishedAt = lastA._finishedAt || now();
        lastA.metadata = { ...(lastA.metadata || {}), pending: false };
      }
    }
    this.stopReq = false; this.stopPending = false;
    const was = this.status, identityInput = this.turnInput, doneAwaitId = this.awaitId;
    if (runTok && runTok !== this.runTok && /read:runs:run_/.test(JSON.stringify(jwt(runTok)?.scopes || ''))) { this.runTok = runTok; this.runAt = now(); Bus.emit('runtoken', this); }
    this.live = null; this.parts.clear(); this.phase = ''; this.status = this.error && !m ? 'error' : 'idle';
    this.awaitFrom = 0; this.awaitId = null; this.turnInput = null; clearTimeout(this.wakeT); clearTimeout(this.lostT); clearTimeout(this.startT); this.dlv = ''; this.oursAt = 0;
    if (this.status === 'idle' && (m || (this.messages || []).at(-1)?.role === 'assistant')) {
      for (const ackId of [doneAwaitId, identityInput]) {
        if (!ackId) continue;
        (this._oOk ||= new Set()).add(ackId);
        try { if (typeof Drafts !== 'undefined') Drafts.ack?.(ackId); } catch {}
      }
      if (Array.isArray(this.messages) && this.messages.length > 0) this.loaded = true;
    }
    this.emit();
    if (this.loaded && typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
    // 一轮结束后再看一眼实时通道：把尾巴读掉（位置保持最新），如果服务器接着又开了一轮（长任务续跑）就直接接上显示
    if (!this.gacha && !this.fakeEnd && !this.midTurnStall) { clearTimeout(this.tailT); this.tailT = setTimeout(() => { if (!this.busy && !this.streaming && !this.midTurnStall && !this.fakeEnd && this.loaded) this.stream({ peek: true }); }, 1500); }
    // 涉及提问卡片的一轮结束后，和服务器对一次账：回答（不管在哪提交的）、节点 id、卡片状态都以服务器为准
    // 每轮结束后都和服务器对一次账：漏掉的记录 / 别处的改动以服务器为准补齐（和网页一致，不必手动刷新）
    clearTimeout(this.hitlT);
    const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid);
    const recoDelay = this.messages.slice(-4).some(x => x.parts?.some(p => p.toolCallId && Hitl.name(p))) ? 900 : 1400;
    if (!this.gacha) this.reconcile(recoDelay);
    else if (isKeptOrActive) setTimeout(() => { if (!this.busy && !this.live && this.loaded) void this.reconcile(0).catch(() => {}); }, recoDelay);
    // 服务器记录有时比实时流晚几秒才写好：带提问卡片的一轮结束后再对一次账（卡片已经在就什么都不会变）
    if (isKeptOrActive && this.messages.slice(-2).some(x => x.role === 'assistant' && x.parts?.some(p => p.toolCallId && Hitl.name(p)))) setTimeout(() => { if (!this.live && !this.busy && !this.streaming && this.loaded) this.converge(); }, 5500);
    try { ExtCompat.replayChat(this, true); } catch {}
    if (was !== 'idle') Bus.emit('turn', this, { forced, fake: !!this.fakeEnd, midStall: !!this.midTurnStall });
    if (this.error && /recaptcha|captcha/i.test(this.error) && this.sentAt && now() - this.sentAt < 180000) { if (this.rcV3) { this.rcV3 = false; IPRep.note('rc'); } setTimeout(() => Bus.emit('captcha', this), 0); }
    if (runTok && (runTok !== this.idTok || (Models.get(this.sid)?.partial && !this.identifying))) { this.runTok = runTok; this.identify(runTok, { inputId: identityInput, messageId: m?.id }); }
    else if (m) this.guessModel();
    if (m) try { Calib.turn(this, m); } catch {}   // 强度分：已知型号的对话记成校准样本
    try { FmtAcc.turnEnd(this); } catch {}   // 格式推测核对：这一轮的推测和真实型号对一下
  }
  // 这一轮没有运行令牌（Brana 新建的对话不再下发）：按回复格式推测厂商；已经准确识别过的对话不覆盖
  guessModel(g) {
    // Format guesses are intermediate evidence during fingerprint tests, not a display identity.
    // Keep collecting fmt/fmtGuess (including the thinking-skip guard), but publish only the final fingerprint.
    if (this.gacha?.fingerprint || this.gacha?.mode === 'autoqa' || this.gacha?.mode === 'habit' || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning(this))) return null;
    try {
      const tsKind = typeof ThinkingStatus !== 'undefined' ? ThinkingStatus.of?.(this)?.kind : null;
      const openThink = tsKind === 'compat-thinking' || tsKind === 'open' || (tsKind !== 'closed-thinking' && !this.thinkStopped && !this.routedThink && Number(this.fmt?.rChars) > 0);
      const live = this.fmt && (this.fmt.ids.length || this.fmt.toolIds?.length || openThink);
      g = g || (live ? Fmt.guess({ ...this.fmt, done: true }) : null);
      if (openThink && (!g || ['gpt', 'claude', 'gemini', 'grok'].includes(g.fam))) {
        g = { fam: 'compat', sure: true, why: '思考块含可见思考文字（开源思考：仅匹配开源模型，绝不匹配闭源模型）' };
      }
      if (!g) return null;
      const old = Models.get(this.sid);
      const oldClosedOnOpen = openThink && tsKind !== 'closed-thinking' && !this.thinkStopped && !this.routedThink && old && /^(gpt|claude|gemini|grok|compat)/i.test(String(old.name || ''));
      if (!oldClosedOnOpen && (old?.fingerprint || old?.reverseInferred || old?.habitInferred || old?.userCorrected || old?.billingProbe || old?.pendingConfirm || (old && old.name && !old.guess))) return null;
      const lastUser = [...(this.messages || [])].reverse().find(x => x?.role === 'user'), std = Fmt.stdPrompt?.((lastUser?.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n'));
      const est = g.est || (live && !this.busy ? Fmt.est(this.fmt, g.fam, std) : null) || (old?.guess && old.name === Fmt.NAME[g.fam] ? old.est : null);
      const e = Fmt.entry(g, est);
      // 同步标题里已经有这个对话的测量结果（别的设备测过指纹 / 接口识别过）：以它为准，格式推测只是弱提示，不能把测过的型号打回「gpt / claude」。
      // 标题里不是测量结果、只是同厂商更具体的名字：同厂商才采用。两种情况都不再显示成「按回复格式推测」。
      try {
        const rm = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(this.sid) : null, tm = String(rm?.model || '').replace(/[（(]推测[）)]/g, '').trim();
        if (tm && !/^未/.test(tm)) {
          const measured = rm.source === 'fingerprint' || rm.source === 'api', sameVendor = typeof Brand !== 'undefined' && !!Brand.of(tm) && Brand.of(tm) === Brand.of(e.name);
          if ((measured || sameVendor) && tm.toLowerCase() !== String(e.name).toLowerCase()) {
            e.name = tm; e.fromTitle = true; e.why = ''; e.provider = '同步标题（另一台设备已测）'; e.sure = true; e.est = null;
          } else if ((measured || sameVendor)) { e.fromTitle = true; e.why = ''; e.provider = '同步标题（另一台设备已测）'; }
        }
      } catch {}
      if (old?.guess && old.name === e.name && old.sure === e.sure && JSON.stringify(old.est || null) === JSON.stringify(e.est || null)) return e;
      Models.set(this.sid, e); Bus.emit('model', this, e); this.emit(); return e;
    } catch { return null; }
  }
  // 识别本轮模型；返回 Promise（抽卡直接等它，不重复请求 Trigger）
  identify(tok, opt = {}) {
    if (this.identifying && this.idTok === tok) return this.idP;
    // A replay token alone does not identify the current turn. Do not attach it
    // to the last message or to a merely queued (not dispatched) input.
    const identityInput = opt.unscoped ? null : (opt.inputId || this.turnInput || null), identityMessage = opt.unscoped ? null : (opt.messageId || this.live?.id || null);
    this.identifying = true; this.idTok = tok; this.idErr = null; this.emit();
    const my = this.idP = (async () => {
      try {
        const r = await Trigger.identify(tok, null, 45000, n => { this.early = n; this.emit(); });
        // Account dollar-balance capture retired; per-call cost measurements remain available.
        if (r?.name && this.idTok === tok) {
          const old = Models.get(this.sid);
          // 已经有完整结果（带内部名称）时，不让这次只识别到一部分的结果覆盖掉；再用 Trace 补一次
          if (!(r.partial && old && !old.partial && !old.guess && old.name && ((identityInput && old.inputId === identityInput) || (identityMessage && old.messageId === identityMessage)))) { const entry={...r,inputId:identityInput,messageId:identityMessage||null,...(old?.fingerprint?.skipped?{fingerprint:old.fingerprint}:{})}; Models.set(this.sid, entry); Bus.emit('model', this, entry); }
          if (r.partial) { try { Trace.adopt(this.sid); const m2 = Models.get(this.sid); if (m2 && !m2.partial && m2.name !== r.name) Bus.emit('model', this, m2); } catch {} }
        }
        return r;
      } catch (e) { if (this.idTok === tok) this.idErr = describe(e); throw e; }
      finally { if (this.idP === my) { this.identifying = false; this.emit(); } }
    })();
    my.catch(() => {});
    return my;
  }
  // 旧对话：回放实时通道找到最近一轮的运行令牌（1 小时内有效）
  // 以往的对话补打分：打开时这个对话还没有强度分，就读一次实时通道回放，给最后一轮打分（识别结果不动）
  async scoreOld() {
    if (this.scoring || this.busy || this.gacha || Calib.last.get(this.sid) || (Calib.tried ||= new Set()).has(this.sid)) return;
    this.scoring = true; Calib.tried.add(this.sid);
    try {
      for (let i = 0; i < 20 && (!this.loaded || !this.lastSeq) && !this.busy; i++) await sleep(500);
      if (this.busy || !this.lastSeq || Calib.last.get(this.sid)) return;
      const m = [...(this.messages || [])].reverse().find(x => x.role === 'assistant'); if (!m) return;
      await this.ensureToken();
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '3', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +this.lastSeq - 1500)) }, signal: ctl.signal, cache: 'no-store' });
        const f = Fmt.lastTurn(await res.text());
        if (f && !this.busy && !Calib.last.get(this.sid)) Calib.turn(this, m, f);
      } finally { clearTimeout(tm); }
    } catch {} finally { this.scoring = false; }
  }
  async identifyOld() {
    if (this.identifying) return;
    this.identifying = true; this.idErr = null; this.emit();
    let tok = null;
    try {
      await this.ensureToken();
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
      try {
        const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '5', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +(this.lastSeq || 0) - 400)) }, signal: ctl.signal, cache: 'no-store' });
        const txt = await res.text();
        tok = runTokIn(txt);
        if (!tok || (jwt(tok)?.exp || 0) * 1000 < now()) { const lastAsst = [...(this.messages || [])].reverse().find(x => x?.role === 'assistant'); if (lastAsst && !lastAsst._fmt && typeof Fmt.lastTurn === 'function') lastAsst._fmt = Fmt.lastTurn(txt); const g = Fmt.fromReplay(txt); if (g && this.guessModel(g)) { tok = null; this.identifying = false; this.idErr = null; this.emit(); return; } }
      } finally { clearTimeout(tm); }
      if (!tok) throw new Error('没有找到运行记录');
      if ((jwt(tok)?.exp || 0) * 1000 < now()) throw new Error('运行令牌已过期（超过 1 小时），发送新消息后会自动识别');
    } catch (e) { this.idErr = describe(e); this.identifying = false; this.emit(); return; }
    this.identifying = false; await this.identify(tok, { unscoped: true });
  }
}

// ---------- 多设备同步：别的设备（手机 / 电脑 / 网页）在同一个对话里发消息、跑任务，这边实时看到 ----------
// 空闲时对打开着的对话挂一个长轮询（实时通道，从当前位置往后等）：一旦出现新一轮（分派 / start），
// 先从服务器拉最新消息（对方发的那条用户消息），再从这一轮的开头接上实时流 —— 和在那台设备上看到的一样，不用手动刷新
Object.assign(Chat.prototype, {
  watch() {
    if (this.watching || this.gacha) return; this.watching = true;
    const my = this.wGen = (this.wGen || 0) + 1;
    (async () => {
      let fails = 0;
      try {
        while (my === this.wGen) {
          if (!this.loaded || this.loading || this.busy || this.streaming || this.syncing || this.lastSeq == null) { await sleep(1200); continue; }
          const ctl = new AbortController(); this.wCtl = ctl; const tm = setTimeout(() => ctl.abort(), 75000);
          const from = this.lastSeq; let hit = null, cur = from, headerTimer = 0, headerTimeout = false;
          try {
            await this.ensureToken();
            if (my !== this.wGen || this.busy || this.streaming || this.lastSeq !== from) continue;
            headerTimer = setTimeout(() => { headerTimeout = true; ctl.abort(); }, 12000);
            const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '60', 'Last-Event-ID': String(from) }, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
            clearTimeout(headerTimer);
            if (res.status === 401 || res.status === 403) { this.tokenExp = 0; throw new HttpError(res.status, ''); }
            if (!res.ok) throw new HttpError(res.status, '');
            const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
            outer: for (;;) {
              const { done, value } = await rd.read(); if (done) break;
              if (my !== this.wGen || this.busy || this.streaming) { ctl.abort(); break; }
              buf += dec.decode(value, { stream: true }); let i;
              while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
                const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
                const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
                if (!data || data.trim() === '[DONE]') continue;
                let j; try { j = JSON.parse(data); } catch { continue; }
                for (const rec of j.records || []) {
                  if (rec.seq_num == null || +rec.seq_num <= +(this.lastSeq ?? -1)) continue;
                  let b = null; try { b = rec.body ? JSON.parse(rec.body) : null; } catch {}
                  const ty = b?.data?.type;
                  if (ty === 'start' || ty === 'data-agent-dispatch') { hit = { seq: +rec.seq_num, ty, input: b.data?.data?.inputId || null }; ctl.abort(); break outer; }
                  // 中途接上的一轮（没读到 start / 分派，只有后面的内容）：不能当成「尾巴」悄悄跳过——对账一次，把服务器上的内容补进来
                  if (/^(text-start|text-delta|reasoning-start|reasoning-delta|tool-input-start|tool-input-delta|tool-input-available|tool-output-available|start-step|finish|turn-complete)$/.test(ty || '')) { hit = { seq: +rec.seq_num, ty, mid: true }; ctl.abort(); break outer; }
                  // 上一轮的尾巴（保存工作区、多出来的结束标记）：只把位置往后挪
                  if (!this.busy && !this.streaming && this.lastSeq === cur) this.lastSeq = cur = String(rec.seq_num);
                }
              }
              if (this.lastSeq !== cur) { ctl.abort(); break; }   // 位置被别的流程挪了：用新位置重新挂
            }
            fails = 0; this.wFails = 0;
          } catch (e) { if (e?.name !== 'AbortError' || headerTimeout) { fails++; this.wFails = fails; } }
          finally { clearTimeout(headerTimer); clearTimeout(tm); if (this.wCtl === ctl) this.wCtl = null; }
          if (my !== this.wGen) break;
          if (hit && !this.busy && !this.streaming) { this.dbg?.('watch-hit', { seq: hit.seq, ty: hit.ty, mid: !!hit.mid }); this.remoteAt = now(); await this.remoteSync(hit).catch(() => {}); if (hit.mid) await sleep(2500); continue; }
          await sleep(fails ? Math.min(30000, 1500 * 2 ** Math.min(fails, 5)) : 250);
        }
      } finally { if (my === this.wGen) { this.watching = false; this.wCtl = null; } }
    })();
  },
  unwatch() { this.wGen = (this.wGen || 0) + 1; this.watching = false; try { this.wCtl?.abort(); } catch {} this.wCtl = null; },
  // 服务器上的消息合并进来：本地已有且内容一样的保持原对象（不重绘），变了的换成新的，本地还没发出去的保留在末尾
  mergeServer(list, keep) {
    const rawSrv = (list || []).filter(m => !this._prunedDeadMsgIds?.has?.(m?.id)); if (!rawSrv.length) return false;
    const uText = m => m?.role === 'user' ? (m.parts || []).filter(p => p?.type === 'text').map(p => String(p.text || '')).join('\n').replace(/\s+/g, ' ').trim() : '';
    const isErrOnlyAsst = m => m?.role === 'assistant' && Array.isArray(m.parts) && m.parts.length > 0 && m.parts.every(p => p && (p.type === 'error' || p.type === 'step-start'));
    const srv = [];
    for (let i = 0; i < rawSrv.length; i++) {
      const m = rawSrv[i];
      if (m?.role === 'user' && isErrOnlyAsst(rawSrv[i + 1]) && rawSrv[i + 2]?.role === 'user') {
        const t1 = uText(m), t2 = uText(rawSrv[i + 2]);
        if (t1 && t1 === t2) { i += 1; continue; }
      }
      if (m?.role === 'assistant' && Array.isArray(m.parts) && m.parts.some(p => p?.type === 'error' && p.text && formatOfficialErrorText(p.text) !== p.text)) {
        srv.push({ ...m, parts: m.parts.map(p => p?.type === 'error' && p.text ? { ...p, rawText: p.rawText || p.text, text: formatOfficialErrorText(p.text) } : p) });
      } else {
        srv.push(m);
      }
    }
    if (!srv.length) return false;
    const loc = new Map(this.messages.map((m, i) => [m.id, i]));
    const first = srv.findIndex(m => loc.has(m.id));
    let head;
    if (first < 0) head = this.messages.filter(m => !m._local && idTime(m.id) && idTime(m.id) < idTime(srv[0].id));
    else head = this.messages.slice(0, loc.get(srv[first].id)).filter(m => !srv.some(x => x.id === m.id));
    const sig = m => {
      const ps = m.parts || [], n = ps.length;
      let s = n + '|' + (m.metadata?.pending ? 1 : 0) + '|' + (m.metadata?.aborted ? 1 : 0);
      for (let i = Math.max(0, n - 8); i < n; i++) {
        const p = ps[i]; if (!p) continue;
        const oLen = p.output === undefined ? -1 : typeof p.output === 'string' ? p.output.length : (p.output?.stdout?.length || 0) + (p.output?.stderr?.length || 0);
        s += ';' + p.type + ':' + (p.state || '') + ':' + (p.text?.length || 0) + ':' + (p.inputText?.length || 0) + ':' + oLen + ':' + (p.errorText ? 1 : 0);
      }
      let openScore = 0;
      for (let i = 0; i < n; i++) { const p = ps[i]; if (p?.toolCallId && p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'output-denied') openScore += (i + 1); }
      return s + '|o:' + openScore;
    };
    const patchAssistantParts = (o, m) => {
      if (!Array.isArray(o.parts) || !Array.isArray(m.parts)) return false;
      const byTool = new Map(); for (const lp of o.parts) if (lp?.toolCallId) byTool.set(lp.toolCallId, lp);
      let patched = false;
      for (const sp of m.parts) {
        if (!sp) continue;
        if (sp.toolCallId && byTool.has(sp.toolCallId)) {
          const lp = byTool.get(sp.toolCallId);
          if (sp.output !== undefined && (lp.output === undefined || lp.state !== sp.state)) {
            lp.output = sp.output; lp.state = sp.state || 'output-available'; lp.preliminary = !!sp.preliminary; delete lp.errorText; patched = true;
          } else if (sp.input && !lp.input) {
            lp.input = sp.input; if (!lp.state || lp.state === 'input-streaming') lp.state = sp.state || 'input-available'; patched = true;
          }
        } else if (sp.toolCallId && !byTool.has(sp.toolCallId)) { o.parts.push(sp); byTool.set(sp.toolCallId, sp); patched = true; }
      }
      if (m.parts.length > o.parts.length) {
        for (const tp of m.parts.slice(o.parts.length)) {
          if (!tp || tp.type === 'step-start' || (tp.toolCallId && byTool.has(tp.toolCallId))) continue;
          if ((tp.type === 'text' || tp.type === 'reasoning') && o.parts.some(lp => lp?.type === tp.type && String(lp.text || '').trim() === String(tp.text || '').trim())) continue;
          o.parts.push(tp); patched = true;
        }
      }
      if (m.metadata) { const prevPend = o.metadata?.pending; o.metadata = { ...(o.metadata || {}), ...m.metadata }; if (prevPend !== o.metadata.pending) patched = true; }
      if (patched) o.v = (o.v || 0) + 1;
      return patched;
    };
    const partWeight = parts => (parts || []).reduce((acc, p) => {
      if (!p || p.type === 'step-start' || p.type === 'error') return acc;
      if (p.type === 'text' || p.type === 'reasoning') return acc + String(p.text || '').length + 10;
      if (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') return acc + 50 + (p.output !== undefined ? 50 : 0);
      return acc + 5;
    }, 0);
    let changed = false, lagged = false;
    const matchedLocal = new Set();
    const mid = srv.map((m, sIdx) => {
      let i = loc.get(m.id), o = i != null ? this.messages[i] : null;
      if (!o && m.role === 'assistant' && sIdx > 0) {
        const prevUi = loc.get(srv[sIdx - 1]?.id);
        const cand = prevUi != null ? this.messages[prevUi + 1] : null;
        if (cand && cand.role === 'assistant' && !srv.some(x => x.id === cand.id)) {
          const mTools = new Set((m.parts || []).map(p => p?.toolCallId).filter(Boolean));
          const cTools = (cand.parts || []).map(p => p?.toolCallId).filter(Boolean);
          const toolConflict = mTools.size > 0 && cTools.length > 0 && !cTools.some(id => mTools.has(id));
          if (!toolConflict) o = cand;
        }
      }
      if (o) matchedLocal.add(o);
      if (o && keep && o === keep) return o;
      if (o && o.role === 'assistant') {
        const hasNextUser = srv.slice(sIdx + 1).some(x => x && x.role === 'user');
        if (o._awaitingSnapshot) {
          if (!m.metadata?.aborted && !hasNextUser && (o.parts || []).some(p => Hitl.awaiting(p)) && !(m.parts || []).some(p => Hitl.awaiting(p))) {
            lagged = true; return o;
          }
          delete o._awaitingSnapshot;
        }
        const ow = partWeight(o.parts), mw = partWeight(m.parts);
        const recFin = o._finishedAt && (now() - o._finishedAt < 60000);
        if ((recFin && m.metadata?.pending && !o.metadata?.pending) || (recFin && ow > mw)) {
          lagged = true; patchAssistantParts(o, m); return o;
        }
        if (!o._local && sig(o) === sig(m)) return o;
        if ((m.metadata?.pending || ow > mw) && o.parts?.length >= 4 && patchAssistantParts(o, m)) { changed = true; return o; }
      }
      if (o && !o._local && sig(o) === sig(m)) return o;
      changed = true;
      let mergedParts = m.parts;
      if (o?.role === 'assistant' && Array.isArray(o.parts) && Array.isArray(m.parts)) {
        const localReason = o.parts.filter(p => p && p.type === 'reasoning');
        const srvHasReason = m.parts.some(p => p && p.type === 'reasoning');
        if (localReason.length && !srvHasReason) mergedParts = [...localReason, ...m.parts];
        const lIds = { reasoning: o.parts.filter(p => p?.type === 'reasoning' && p.id), text: o.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
        mergedParts = mergedParts.map(sp => (sp && (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id) ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp);
      }
      if (m.role === 'assistant' && !m.metadata?.pending && Array.isArray(mergedParts)) {
        mergedParts = mergedParts.map(sp => (sp?.toolCallId && !Hitl.name(sp) && /^(input-streaming|input-available)$/.test(sp.state || '')) ? { ...sp, state: 'output-error', errorText: sp.errorText || '未返回结果' } : sp);
      }
      return { ...m, parts: mergedParts, _autoContinue: o?._autoContinue || m.metadata?.autoContinue, _streamed: o?._streamed, _finishedAt: m.metadata?.pending ? undefined : o?._finishedAt, _fmt: o?._fmt, _sseMeta: o?._sseMeta, v: (o?.v || 0) + 1 };
    });
    const ids = new Set(srv.map(m => m.id));
    const srvLastTime = idTime(srv.at(-1)?.id) || 0;
    const tail = this.messages.filter((m, idx) => {
      if (ids.has(m.id) || matchedLocal.has(m)) return false;
      if (m._local || (keep && m === keep)) return true;
      if (m.role === 'assistant' && partWeight(m.parts) > 0) {
        if (m._awaitingSnapshot) {
          const srvLast = srv.at(-1);
          if (srvLast && srvLast.role === 'user' && srvLast.id !== this.messages[idx - 1]?.id) {
            delete m._awaitingSnapshot;
            return false;
          }
          lagged = true;
          return true;
        }
        if (idx < this.messages.length - 1 || srv.at(-1)?.role === 'assistant') return false;
        const recFin = m._finishedAt && (now() - m._finishedAt < 60000);
        const isTrailing = idx >= this.messages.length - 2;
        const mTime = idTime(m.id) || 0;
        if (recFin || (isTrailing && (!srvLastTime || !mTime || mTime >= srvLastTime))) {
          lagged = true;
          return true;
        }
      }
      return false;
    });
    this._srvLagged = lagged;
    const next = [...head, ...mid, ...tail];
    if (next.length !== this.messages.length) changed = true;
    this.messages = next; return changed;
  },
  // 和服务器对一次账（提问卡片的回答 / 别处提交的回答 / 别的设备发的消息）：正在输出的那条保持原对象不动
  reconcile(delay = 0) {
    const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid);
    if (delay > 0 && (!isKeptOrActive || !this.loaded)) return Promise.resolve(false);
    if (!this.sid) return Promise.resolve(false);
    if (this.recP) return this.recP;
    this.recoAt = now();
    const live0 = this.live, v0 = live0?.v || 0, gen0 = this.gen || 0;
    return this.recP = (async () => {
      if (delay) await sleep(delay);
      const isFg = typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid;
      const recQuery = (this.busy || this.live || this.fakeEnd || this.midTurnStall) ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      const c = await api('/api/chat/' + this.sid + recQuery, { timeout: 35000, bg: !isFg, noApiRetry: true }).catch(() => null);
      if (!c?.messages?.length || this.loading) return false;
      if ((this.gen || 0) !== gen0 || (live0 && (this.live !== live0 || (live0.v || 0) !== v0))) return false;
      if (this.busy && !this.live && this.status === 'submitted') return false;   // 自己刚发出、还没开始回复：交给发送流程
      this._srvLagged = false;
      const ch = this.mergeServer(c.messages, this.live);
      if (Array.isArray(this.messages) && this.messages.length > 0) this.loaded = true;
      const lagged = this._srvLagged;
      const last = c.messages.at(-1);
      const srvPend = !!last && (last.role === 'user' || last.metadata?.pending) && !(last.role === 'assistant' && Hitl.idleWait(this));
      this.dbg?.('reconcile', { n: c.messages.length, changed: !!ch, live: !!this.live, lagged, srvPend });
      if (c.publicAccessToken && !this.token) this.setToken(c.publicAccessToken);
      // 服务器说这一轮已经停在提问上（我们漏了结束标记）：别再显示「进行中」
      if (!this.live && this.status === 'streaming' && Hitl.idleWait(this)) { this.status = 'idle'; this.phase = ''; }
      else if (srvPend && !lagged && !this.busy && !this.streaming && !this.syncing) {
        if (last.role === 'assistant' && last.metadata?.pending) this.live = this.messages.find(m => m.id === last.id) || null;
        const baseSeq = c.lastEventId != null ? Math.max(1, +c.lastEventId - 4000) : 1;
        this._remoteSyncSnap = { at: now(), c };
        if (this.remoteSync) void this.remoteSync({ seq: baseSeq, rewind: true, pend: true });
      } else if (!srvPend && !this.busy && !this.streaming && c.lastEventId != null) {
        this.lastSeq = String(c.lastEventId); this.fence = Math.max(this.fence || 0, +c.lastEventId);
      }
      if (ch) {
        this.messages.forEach(m => { if (m.parts?.some(p => p.toolCallId && Hitl.name(p))) m.v = (m.v || 0) + 1; });
        this.saveCache?.();
      }
      this.emit();
      if (lagged && !this.busy && !this.live && typeof setTimeout === 'function') {
        if (typeof clearTimeout === 'function') clearTimeout(this._lagRecoT);
        this._lagRecoT = setTimeout(() => { if (!this.busy && !this.live && this.loaded) void this.reconcile(0); }, 4500);
      }
      return ch;
    })().finally(() => { this.recP = null; this.recDone = now(); });
  },
  // 对账：以服务器上的对话记录为最终依据。
  async converge() {
    if (this.convP) return this.convP;
    this.convAt = now();
    const live0 = this.live, v0 = live0?.v || 0, gen0 = this.gen || 0;
    return this.convP = (async () => {
      const isFg = typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid;
      const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || isFg;
      const convQuery = (this.busy || this.live || this.fakeEnd || this.midTurnStall) ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      const c = await api('/api/chat/' + this.sid + convQuery, { timeout: 35000, bg: !isFg, noApiRetry: true }).catch(() => null);
      if (!c?.messages?.length || this.loading || !isKeptOrActive) return false;
      if ((this.gen || 0) !== gen0 || (live0 && (this.live !== live0 || (live0.v || 0) !== v0))) return false;
      const live = this.live, last = c.messages.at(-1);
      const srvPend = !!last && (last.role === 'user' || last.metadata?.pending) && !(last.role === 'assistant' && Hitl.idleWait(this));
      this.dbg?.('converge', { n: c.messages.length, live: !!live, pending: !!last?.metadata?.pending, srvPend, leid: c.lastEventId ?? null });
      if (!live) {
        if (this.busy || this.streaming || this.syncing) return false;   // 这期间有别的流程在跑
        this._srvLagged = false;
        const ch = this.mergeServer(c.messages, null);
        const lagged = this._srvLagged;
        this.dbg?.('converge-merge', { changed: !!ch, srvPend, lagged });
        if (srvPend && !lagged) {
          if (last.role === 'assistant' && last.metadata?.pending) this.live = this.messages.find(m => m.id === last.id) || null;
          if (ch) this.saveCache?.();
          this.emit();
          const baseSeq = c.lastEventId != null ? Math.max(1, +c.lastEventId - 4000) : 1;
          this._remoteSyncSnap = { at: now(), c };
          if (this.remoteSync) void this.remoteSync({ seq: baseSeq, rewind: true, pend: true });
          return true;
        }
        if (!ch) {
          this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || this._lastSyncedHistAt || null;
          return false;
        }
        // 服务器已经停下：位置跟到快照，空闲监听不会再把这一轮当成「别处新开的」重放一遍
        if (!last?.metadata?.pending && c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = +c.lastEventId; }
        this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || null;
        this.messages.forEach(m => { if (m.parts?.some(p => p.toolCallId && Hitl.name(p))) m.v = (m.v || 0) + 1; });
        this.saveCache?.();
        this.emit(); return true;
      }
      const liveIdx = this.messages.indexOf(live);
      const prevLocalUser = liveIdx > 0 ? [...this.messages.slice(0, liveIdx)].reverse().find(x => x && x.role === 'user') : null;
      const prevUserInSrvIdx = prevLocalUser ? c.messages.findIndex(x => x && (x.id === prevLocalUser.id || (prevLocalUser.metadata?.nodeId && x.metadata?.nodeId === prevLocalUser.metadata.nodeId))) : -1;
      const lastIsOlderTurn = Boolean(last && this.messages.some(x => x && x !== live && (x.id === last.id || (x.metadata?.nodeId && x.metadata?.nodeId === last.metadata?.nodeId))));
      const canFallbackToLast = Boolean(last?.role === 'assistant' && !lastIsOlderTurn && (!prevLocalUser || (prevUserInSrvIdx >= 0 && prevUserInSrvIdx < c.messages.length - 1)));
      const sv = c.messages.find(x => x && (x.id === live.id || (live.metadata?.nodeId && x.metadata?.nodeId === live.metadata.nodeId))) || (canFallbackToLast ? last : null);
      if (!sv || sv.role !== 'assistant' || live !== this.live || this.stopReq) return false;
      const body = x => (x.parts || []).filter(p => p.type !== 'step-start'), lp = body(live), sp = body(sv);
      const hasQuestions = p => Array.isArray(Hitl.input(p)?.questions) && Hitl.input(p).questions.length > 0;
      const lpById = new Map(lp.filter(p => p.toolCallId).map(p => [p.toolCallId, p]));
      const srvAsk = sp.some(p => {
        if (!Hitl.awaiting(p)) return false;
        const cur = lpById.get(p.toolCallId);
        if (!cur) return true;
        if (cur.state === 'input-streaming' && p.state !== 'input-streaming') return true;
        if (Hitl.name(p) === 'ask_user' && hasQuestions(p) && !hasQuestions(cur)) return true;
        return false;
      });
      const srvDone = sv.metadata?.pending === false && (sp.length > lp.length || live.metadata?.pending !== false);
      const tail = lp.at(-1), localAsk = !!tail && Hitl.awaiting(tail) && tail.state !== 'input-streaming' && (Hitl.name(tail) !== 'ask_user' || hasQuestions(tail));
      if (!srvAsk && !srvDone && !localAsk) return false;
      this.dbg?.('converge-adopt', { srvAsk, srvDone, localAsk });
      if (srvAsk || srvDone) {
        live.id = sv.id;
        let nextParts = JSON.parse(JSON.stringify(sv.parts || []));
        if (Array.isArray(live.parts) && Array.isArray(nextParts)) {
          const localReason = live.parts.filter(p => p && p.type === 'reasoning');
          const srvHasReason = nextParts.some(p => p && p.type === 'reasoning');
          if (localReason.length && !srvHasReason) nextParts = [...localReason, ...nextParts];
          const lIds = { reasoning: live.parts.filter(p => p?.type === 'reasoning' && p.id), text: live.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
          nextParts = nextParts.map(sp => (sp && (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id) ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp);
        }
        if (srvDone && Array.isArray(nextParts)) {
          nextParts = nextParts.map(sp => (sp?.toolCallId && !Hitl.name(sp) && /^(input-streaming|input-available)$/.test(sp.state || '')) ? { ...sp, state: 'output-error', errorText: sp.errorText || '未返回结果' } : sp);
        }
        live.parts = nextParts;
        live.metadata = { ...(live.metadata || {}), ...(sv.metadata || {}), pending: false };
      }
      if (srvDone) { this.finAt = this.finAt || now(); this.realTcAt = this.realTcAt || now(); }
      this.parts.clear(); live.v = (live.v || 0) + 1;
      this.finishTurn(null, true); return true;
    })().finally(() => { this.convP = null; });
  },
  // 前台对话的对账节奏（Sync 每 3 秒调一次）：空闲 20 秒一次；输出中超过 20 秒没有新记录，按退避对账。若末尾是未回复的用户消息或未完成回复则 2.5 秒一次。
  tickConverge() {
    if (document.hidden || this.gacha || !this.loaded || this.loading || this.convP || this.syncing || ReadLimit.active()) return;
    const fgSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    if (fgSid && Chats.get(fgSid)?.loading) return;
    const t = now(); if (!this.convAt) { this.convAt = t; return; }
    if (this.live) { this.convGap = 0; if ((this.recAt || 0) > this.convAt) this.liveGap = 0; const lg = this.liveGap || 20000; if (t - (this.recAt || 0) > lg && t - this.convAt > lg) { this.liveGap = Math.min(60000, lg * 2); this.converge(); } return; }
    if (this.busy || this.streaming) { this.convGap = 0; return; }
    const lastMsg = this.messages.at(-1);
    const waitReply = !!lastMsg && (lastMsg.role === 'user' || lastMsg.metadata?.pending) && !Hitl.idleWait(this);
    const baseGap = waitReply ? 2500 : 20000;
    const gap = waitReply ? 2500 : Math.max(baseGap, this.convGap || baseGap), cap = this.watching && !this.wFails ? 900000 : 300000;
    if (t - this.convAt > gap) void this.converge().then(ch => { this.convGap = (ch || waitReply) ? (waitReply ? 2500 : baseGap) : Math.min(cap, gap * 2); }, () => { this.convGap = Math.min(cap, gap * 2); });
  },
  quickSync(force = false) {
    if (!this.loaded || this.loading || this.sending || this.sid.startsWith('local-') || window.__BRANA_BROWSE_MODE) return;
    const t = now();
    if (!force && t - (this._qSyncAt || 0) < 1000) return;
    this._qSyncAt = t;
    this.convGap = 20000;
    this.convAt = 1;
    if (!this.busy && !this.streaming && !this.syncing) {
      void this.converge();
      if (!this.watching) void this.watch();
    } else if (t - (this.recAt || this.evtAt || 0) > 3500) {
      void this.converge();
    }
  },
  // 发现别的设备开了新一轮：拉最新消息 → 这一轮还在跑就从开头接上实时流，已经跑完就直接显示结果
  async remoteSync(hit) {
    if (this.busy || this.syncing || this.gacha) return; this.syncing = true;
    try {
      const from = this.lastSeq;
      if (hit?.seq != null && (this.lastSeq == null || hit.rewind)) this.lastSeq = hit.seq > 0 ? String(hit.seq - 1) : null;
      const info = await this.drain(1500, { keepIfFinished: !!hit?.pend });
      const snap = (this._remoteSyncSnap && now() - (this._remoteSyncSnap.at || 0) < 5000) ? this._remoteSyncSnap.c : null;
      this._remoteSyncSnap = null;
      const c = hit?.chatSnap || snap || await api('/api/chat/' + this.sid + '?includeStreamToken=false', { timeout: 35000, noApiRetry: true }).catch(() => null);
      if (this.busy || this.streaming) return;   // 这期间自己发了消息：交给自己的流程
      if (c?.messages && !hit?.chatSnap && !snap) { this.mergeServer(c.messages); this.setToken(c.publicAccessToken); }
      else if (c?.publicAccessToken) this.setToken(c.publicAccessToken);
      const last = c?.messages?.at(-1);
      const srvPend = !!last && (last.role === 'user' || (last.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)))) && !(last.role === 'assistant' && Hitl.idleWait(this));
      const act = hit?.mid ? (info?.act ?? info?.runSeq ?? null) : (info?.runSeq ?? info?.act ?? (hit?.seq && this.lastSeq === from ? hit.seq : null));   // 中途接上的（mid）：没有开头可重放，只用服务器记录
      if (act != null || srvPend) {
        // drain 已经回放过的游标直接保持在 info.max，避免二次回退重放 4000 条记录与清空已挂载工具部件
        if (info?.max != null) {
          this.lastSeq = String(info.max); this.fence = info.max;
        } else {
          const startSeq = act != null ? act : (c?.lastEventId != null ? Math.max(1, +c.lastEventId - 3000) : 1);
          this.lastSeq = String(Math.max(0, startSeq - 1)); this.fence = startSeq - 1;
        }
        this.status = 'streaming'; this.phase = '接收回复中'; this.remote = true; this.error = null;
        this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.endAt = 0;
        const tailMsg = this.messages.at(-1);
        if (tailMsg?.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tailMsg))) {
          this.live = tailMsg;
          this.parts.clear();
          (tailMsg.parts || []).forEach(p => {
            if (!p) return;
            if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          });
        } else if (last?.role === 'assistant' && last?.metadata?.pending) {
          this.live = this.messages.find(m => m.id === last.id) || null;
        }
        this.emit(); this.restream();
      } else {
        if (!info && c?.lastEventId != null) this.lastSeq = String(c.lastEventId);
        else if (!info && this.lastSeq === from && hit?.seq) this.lastSeq = String(hit.seq);
        this.saveCache?.();
        this.emit();
      }
      Bus.emit('remote', this);
    } finally { this.syncing = false; }
  },
});
// 被「重复 / 已读过」跳过的记录也记进轨迹（不改 onRecord 本身：位置没动 = 被跳过）
{ const orig = Chat.prototype.onRecord; Chat.prototype.onRecord = function (rec) { const b = this.lastSeq, r = orig.call(this, rec); try { if (rec?.seq_num != null && r !== 'done' && this.lastSeq === b) this.dbgRec?.(rec, 'skip'); } catch {} return r; }; }
// 挂哪些对话：当前窗口一定挂；其它打开着的窗口（已加载过的）也挂，电脑最多 4 个、手机最多 2 个
const Sync = {
  start() {
    if (this.t) return;
    this.t = setInterval(() => this.tick(), 8000);
    this.ct = setInterval(() => { const c = typeof Tabs !== 'undefined' && Tabs.cur?.sid ? Chats.get(Tabs.cur.sid) : null; if (c) c.tickConverge(); }, 3000);
    const onWake = () => {
      if (document.hidden) return;
      this.kick();
      try { if (typeof History !== 'undefined' && now() - (History.attemptAt || 0) > 15000) void History.refresh?.({ bg: true }); } catch {}
      const c = typeof Tabs !== 'undefined' && Tabs.cur?.sid ? Chats.get(Tabs.cur.sid) : null;
      if (c && c.loaded) { c.convAt = 1; c.quickSync?.(); }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    Bus.on('chat', c => { if (c.loaded && !c.watching && !c.gacha && this.want().has(c.sid)) this.tick(); });
    setTimeout(() => this.tick(), 1500);
  },
  want() {
    const out = new Set(); if (typeof Tabs === 'undefined') return out;
    const max = isMob() ? 2 : 4, cur = Tabs.cur;
    if (cur?.sid) out.add(cur.sid);
    for (const t of Tabs.list) { if (out.size >= max) break; if (t.sid && !t.kind && Chats.get(t.sid)?.loaded) out.add(t.sid); }
    return out;
  },
  tick() {
    const w = this.want();
    for (const c of Chats.values()) { if (w.has(c.sid) && c.loaded && !c.gacha) c.watch(); else if (c.watching) c.unwatch(); }
  },
  // 回到前台：长轮询多半已经断了 → 立刻重挂（从上次的位置往后读，期间别的设备做的事马上补上）
  kick() { for (const c of Chats.values()) if (c.watching) { c.unwatch(); } this.tick(); },
};

// ---------- 附件上传（照官方流程）：sha256 → generate-agent-upload-url → PUT 到 R2 → 消息 metadata.uploads ----------
const Uploads = {
  MIME: { txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', html: 'text/html', css: 'text/css', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' },
  type(f) { return f.type || this.MIME[(/\.([\w]+)$/.exec(f.name || '')?.[1] || '').toLowerCase()] || 'application/octet-stream'; },
  async hash(buf) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); let s = ''; for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  findUrl(j) { if (!j || typeof j !== 'object') return null; for (const k of ['url', 'uploadUrl', 'signedUrl', 'presignedUrl', 'putUrl']) if (typeof j[k] === 'string' && /^https?:/.test(j[k])) return j[k]; for (const v of Object.values(j)) { if (typeof v === 'string' && /^https:\/\//.test(v)) return v; if (v && typeof v === 'object') { const u = this.findUrl(v); if (u) return u; } } return null; },
  // 和官方网页一致：sha256 → generate-agent-upload-url → 直接把文件（Blob，不再复制成 ArrayBuffer）PUT 到 R2；
  // 两步都自动重试 3 次（1s / 2s / 4s 退避，4xx 不重试）；上传用 XHR，能拿到实时进度
  // 返回 { key, filename, mediaType, size, hash, url }（url = 同源预览地址 /api/chat/workspace/cas/user/<hash>）
  webPath(hash) { return '/api/chat/workspace/cas/user/' + hash; },
  hashOfKey(key) { const m = /^cas\/users\/[^/]+\/([A-Za-z0-9_-]{43})$/.exec(String(key || '')); return m ? m[1] : null; },
  async retry(fn, tries = 4) {
    for (let i = 0; ; i++) {
      try { return await fn(i); }
      catch (e) { if (i >= tries - 1 || (e?.status >= 400 && e?.status < 500)) throw e; await sleep(1000 * 2 ** i); }
    }
  },
  put(url, file, mediaType, headers, onProg) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest(); x.open('PUT', url, true);
      x.setRequestHeader('Content-Type', mediaType);
      for (const [k, v] of Object.entries(headers || {})) if (!/^content-type$/i.test(k)) try { x.setRequestHeader(k, v); } catch {}
      x.upload.onprogress = e => { if (e.lengthComputable) onProg?.(e.loaded / e.total); };
      x.onload = () => x.status >= 200 && x.status < 300 ? res() : rej(new HttpError(x.status, '附件上传失败：' + String(x.responseText || '').slice(0, 200)));
      x.onerror = () => rej(new Error('附件上传失败：网络错误'));
      x.ontimeout = () => rej(new Error('附件上传超时'));
      x.timeout = Math.max(60000, file.size / 50);   // 至少 60 秒，大文件按 50KB/s 估
      x.send(file);
    });
  },
  async upload(file, onStage, onProg) {
    const mediaType = this.type(file);
    onStage?.('校验');
    const hash = await this.hash(await file.arrayBuffer());
    onStage?.('申请');
    const j = await this.retry(() => api('/api/storage/generate-agent-upload-url', { json: { hash, contentType: mediaType, size: file.size }, timeout: 20000 }));
    const uid = UI.me?.id || '';
    let key = (j && (j.key || j.objectKey || j.storageKey || j.data?.key)) || null;
    const url = this.findUrl(j);
    if (!key && url) { try { key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')); if (!/^cas\//.test(key)) key = null; } catch {} }
    if (!key) key = 'cas/users/' + uid + '/' + hash;
    key = String(key).replace(/^\/+/, '');
    if (url && !(j?.exists || j?.alreadyExists || j?.uploaded)) {
      onStage?.('上传'); onProg?.(0);
      await this.retry(() => this.put(url, file, mediaType, j?.headers && typeof j.headers === 'object' ? j.headers : null, onProg));
    }
    onProg?.(1);
    return { key, filename: file.name || 'file', mediaType, size: file.size, hash, url: this.webPath(hash) };
  },
  meta(files, node) { return files?.length ? { manifestNodeId: node || null, uploads: files.map(f => ({ key: f.key, filename: f.filename, mediaType: f.mediaType })) } : null; },
};

// ---------- 新建对话 ----------
// Brana 对「重复指令」的限流：HTTP 429 + {"error":"prompt failed"}。网页收到后不是等一分钟，而是弹 reCAPTCHA v2 人机验证，带着验证令牌原样重发（同一条消息 id）。
// 这不是新对话额度用完，所以不能记成 Quota 限流（以前记了 60 秒，客户端就一直显示「1 分钟后再试」）。
function promptFailed(status, body) {
  if (status !== 429) return false;
  let m = body; try { const j = JSON.parse(body); m = j?.error ?? body; } catch {}
  return typeof m === 'string' && /^\s*prompt failed\s*$/i.test(m);
}
function isOfficialTransientError(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/429|rate.?limit|too many|限流|频繁|quota|额度|recaptcha|captcha|人机验证|prompt failed|unauthori|401|403/i.test(s)) return false;
  return /\bFailed query:\s*select\b|\bagentic_session_nodes\b|The AI took too long to respond|The AI service rejected this request|An error occurred while generating|Something went wrong\.?\s*Please try again|Internal server error|database error|drizzle|postgres|deadlock detected|connection terminated unexpectedly|upstream.*(?:error|timeout|reset)|model.*(?:overloaded|timed out|unavailable)|service unavailable|bad gateway|gateway timeout/i.test(s);
}
function formatOfficialErrorText(raw) {
  const s = String(raw || '').trim();
  if (!s) return '未知错误';
  if (/\bFailed query:\s*select\b|\bagentic_session_nodes\b/i.test(s)) {
    return '官方服务响应超时（The AI took too long to respond. Please try again.）';
  }
  if (/^The AI took too long to respond\.?(?:\s*Please try again\.?)?$/i.test(s)) {
    return '官方服务响应超时（The AI took too long to respond. Please try again.）';
  }
  if (/The AI service rejected this request/i.test(s)) {
    return '官方服务拒绝请求：存在空回复死节点或上下文超限，已自动回退至上一正常节点重发（The AI service rejected this request.）';
  }
  return s;
}
function isOpenCandidateName(s) {
  const id = String(s || '').toLowerCase();
  if (!id) return false;
  const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
  if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
  return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
}
function hasSubstantiveAssistantWork(m) {
  if (!m || m.role !== 'assistant') return false;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  if (parts.some(p => p && p.type === 'text' && String(p.text || '').trim().length > 0)) return true;
  if (parts.some(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && p.state === 'output-available' && p.output?.status !== 'aborted' && p.output?.status !== 'error')) return true;
  return false;
}
function isDeadAssistantMsg(m) {
  if (!m || m.role !== 'assistant') return false;
  if (hasSubstantiveAssistantWork(m)) return false;
  if (m.metadata?.openThinkStopped || m.metadata?.aborted || m.metadata?.feedback?.interruption === 'stop' || m.metadata?.error) return true;
  if (m._routePivotRole === 'next' && m._turnModelLabel && isOpenCandidateName(m._turnModelLabel)) return true;
  if (m.metadata?.pending && !m._finishedAt) return false;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  if (!parts.length) return true;
  if (parts.some(p => p?.type === 'error')) return true;
  const hasText = parts.some(p => p && p.type === 'text' && String(p.text || '').trim().length > 0);
  const toolParts = parts.filter(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool'));
  if (!hasText && toolParts.length > 0 && toolParts.every(p => p.state === 'output-error' || p.state === 'input-available' || p.state === 'input-streaming' || p.output?.status === 'aborted')) return true;
  return !parts.some(p => p && (
    (p.type === 'text' && String(p.text || '').trim().length > 0) ||
    (p.type === 'reasoning' && String(p.text || '').trim().length > 0) ||
    p.toolCallId ||
    String(p.type || '').startsWith('tool-') ||
    p.type === 'dynamic-tool' ||
    p.type === 'file' ||
    String(p.type || '').startsWith('source-')
  ));
}
function isHitlToolResultUserMsg(u) {
  return Boolean(u && u.role === 'user' && Array.isArray(u.parts) && u.parts.some(p => p && p.type === 'data-tool-results'));
}
async function ensureHealthyHistoryLoaded(chat, maxPages = 1) {
  if (!chat || typeof chat.loadOlder !== 'function') return;
  if (Array.isArray(chat.messages) && chat.messages.some(m => m && m.role === 'user' && !m.failed)) return;
  for (let page = 0; page < maxPages; page++) {
    if (!chat.hasMore || !chat.cursor) break;
    if (findHealthyLastUser(chat.messages, null, chat._rejectedHealthyNodeIds)) break;
    const prevCursor = chat.cursor;
    await chat.loadOlder(true).catch(() => {});
    if (chat.cursor === prevCursor) break;
  }
}
function findFirstHealthyUser(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return null;
  for (let i = 0; i < msgs.length; i++) {
    const u = msgs[i];
    if (!u || u.role !== 'user' || u.failed || u._streamRejected) continue;
    for (let j = i + 1; j < msgs.length; j++) {
      const m = msgs[j];
      if (!m) continue;
      if (m.role === 'user') break;
      if (m.role === 'assistant' && !isDeadAssistantMsg(m)) return u;
    }
  }
  return null;
}
function findHealthyLastUser(msgs, excludeMsg = null, rejectedSet = null) {
  if (!Array.isArray(msgs) || !msgs.length) return null;
  let end = excludeMsg ? msgs.indexOf(excludeMsg) : -1;
  if (end < 0) end = msgs.length;
  let fallbackUser = null;
  let sawDeadTail = false;
  for (let i = end - 1; i >= 0; i--) {
    const u = msgs[i];
    const uKey = u ? String(u.metadata?.nodeId || u.id || '') : '';
    const isRejectedNode = !!(rejectedSet && typeof rejectedSet.has === 'function' && uKey && (rejectedSet.has(uKey) || rejectedSet.has(String(u.id || ''))));
    if (!u || u === excludeMsg || u.role !== 'user' || u.failed || (u._streamRejected && !isHitlToolResultUserMsg(u)) || isRejectedNode) {
      if (u && u !== excludeMsg && (u.failed || (u._streamRejected && !isHitlToolResultUserMsg(u)) || isRejectedNode || (u.role === 'assistant' && isDeadAssistantMsg(u)))) sawDeadTail = true;
      continue;
    }
    if (isHitlToolResultUserMsg(u) || (u._officialContinueParent && !u._streamRejected && !isRejectedNode)) return u;
    let hasAssistant = false, hasHealthyAssistant = false;
    for (let j = i + 1; j < end; j++) {
      const m = msgs[j];
      if (!m) continue;
      if (m.role === 'user') break;
      if (m.role === 'assistant') {
        hasAssistant = true;
        if (!isDeadAssistantMsg(m)) { hasHealthyAssistant = true; break; }
      }
    }
    if (hasHealthyAssistant) return u;
    if (hasAssistant && !hasHealthyAssistant) {
      sawDeadTail = true;
      if (!fallbackUser) fallbackUser = u;
      continue;
    }
    if (!hasAssistant && !sawDeadTail && !fallbackUser && i === end - 1) {
      fallbackUser = u;
    } else {
      sawDeadTail = true;
      if (!fallbackUser) fallbackUser = u;
    }
  }
  return fallbackUser;
}
function rebuildChatFmtFromMessages(chat) {
  if (!chat) return;
  const prev = chat.fmt;
  const nf = typeof Fmt !== 'undefined' && Fmt.fresh ? Fmt.fresh() : { ids: [], toolIds: [], rBlocks: 0, rChars: 0, rHead: '', tBlocks: 0, tChars: 0, head: '' };
  const msgs = Array.isArray(chat.messages) ? chat.messages : [];
  const healthyAsst = msgs.filter(m => m && m.role === 'assistant' && !isDeadAssistantMsg(m));
  const msgHasVis = m => (m?.parts || []).some(p => p?.type === 'reasoning' && (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.visible ? ThinkingStatus.visible(p) : /[^\s.…·。]/.test(String(p.text || ''))));
  const firstIsClosed = healthyAsst.length > 0 && !msgHasVis(healthyAsst[0]) && (healthyAsst[0].parts || []).some(p => p?.type === 'reasoning' || /^(?:toolu_|srvtoolu_|call_)/i.test(String(p?.toolCallId || '')));
  for (const m of healthyAsst) {
    if (firstIsClosed && msgHasVis(m)) break;
    const mf = m._fmt || m.fmt;
    if (mf && typeof mf === 'object') {
      for (const x of mf.ids || []) if (Array.isArray(x) && nf.ids.length < 32 && !nf.ids.some(y => y[0] === x[0] && y[1] === String(x[1]))) nf.ids.push([x[0], String(x[1])]);
      for (const id of mf.toolIds || []) if (id && nf.toolIds.length < 32 && !nf.toolIds.includes(String(id))) nf.toolIds.push(String(id));
      nf.tN = (nf.tN || 0) + Number(mf.tN || 0);
      nf.rN = (nf.rN || 0) + Number(mf.rN || 0);
      nf.tidCount = (nf.tidCount || 0) + Number(mf.tidCount || 0);
      nf.tidChars = (nf.tidChars || 0) + Number(mf.tidChars || 0);
      nf.rE = (nf.rE || 0) + Number(mf.rE || 0);
      nf.rWireDeltas = (nf.rWireDeltas || 0) + Number(mf.rWireDeltas || 0);
      nf.rWireEmptyDeltas = (nf.rWireEmptyDeltas || 0) + Number(mf.rWireEmptyDeltas || 0);
      nf.tools = (nf.tools || 0) + Number(mf.tools || 0);
      if (mf.t0 && (!nf.t0 || mf.t0 < nf.t0)) nf.t0 = mf.t0;
      if (mf.tFirst && (!nf.tFirst || mf.tFirst < nf.tFirst)) nf.tFirst = mf.tFirst;
      if (mf.tEnd && (!nf.tEnd || mf.tEnd > nf.tEnd)) nf.tEnd = mf.tEnd;
      if (mf.done) nf.done = true;
    }
    for (const p of m.parts || []) {
      if (!p) continue;
      if (p.toolCallId && nf.toolIds.length < 32 && !nf.toolIds.includes(String(p.toolCallId))) nf.toolIds.push(String(p.toolCallId));
      if (p.type === 'reasoning') {
        nf.rBlocks = (nf.rBlocks || 0) + 1;
        if (p.id && nf.ids.length < 32 && !nf.ids.some(y => y[0] === 'r' && y[1] === String(p.id))) nf.ids.push(['r', String(p.id)]);
        const vis = typeof ThinkingStatus !== 'undefined' && ThinkingStatus.visible ? ThinkingStatus.visible(p) : Boolean(String(p.text || '').trim());
        if (vis) {
          const rt = String(p.text || '');
          nf.rChars = (nf.rChars || 0) + rt.length;
          if ((nf.rHead || '').length < 400) nf.rHead = (nf.rHead || '') + rt.slice(0, 400 - (nf.rHead || '').length);
        }
      } else if (p.type === 'text') {
        nf.tBlocks = (nf.tBlocks || 0) + 1;
        if (p.id && nf.ids.length < 32 && !nf.ids.some(y => y[0] === 't' && y[1] === String(p.id))) nf.ids.push(['t', String(p.id)]);
        const tt = String(p.text || '');
        nf.tChars = (nf.tChars || 0) + tt.length;
        if ((nf.head || '').length < 400) nf.head = (nf.head || '') + tt.slice(0, 400 - (nf.head || '').length);
      }
    }
  }
  if (prev && typeof prev === 'object' && !(prev.rChars > 0 && nf.rChars === 0)) {
    for (const x of prev.ids || []) if (Array.isArray(x) && nf.ids.length < 32 && !nf.ids.some(y => y[0] === x[0] && y[1] === String(x[1]))) nf.ids.push([x[0], String(x[1])]);
    for (const id of prev.toolIds || []) if (id && nf.toolIds.length < 32 && !nf.toolIds.includes(String(id))) nf.toolIds.push(String(id));
    for (const k of ['tN', 'rN', 'tidCount', 'tidChars', 'rE', 'rWireDeltas', 'rWireEmptyDeltas', 'tools']) {
      if ((prev[k] || 0) > (nf[k] || 0)) nf[k] = prev[k];
    }
    if (prev.t0 && !nf.t0) nf.t0 = prev.t0;
    if (prev.tFirst && !nf.tFirst) nf.tFirst = prev.tFirst;
    if (prev.tEnd && !nf.tEnd) nf.tEnd = prev.tEnd;
    if (prev.done) nf.done = true;
  }
  chat.fmt = nf;
}
function healChatModelAndBranch(chat, opt = {}) {
  if (!chat?.sid) return null;
  let pruned = null;
  if (opt.pruneTail) {
    pruned = pruneDeadTailTurns(chat);
  }
  chat.thinkStopped = false;
  chat.routedThink = false;
  chat._routePaused = false;
  rebuildChatFmtFromMessages(chat);
  const tsKind = typeof ThinkingStatus !== 'undefined' ? ThinkingStatus.of?.(chat)?.kind : null;
  const curM = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
  const curName = String(curM?.name || curM?.reverseLabel || '').trim();
  const isPollutedOpen = curM && (curName === '开源模型' || curM.fam === 'compat' || isOpenCandidateName(curName) || isOpenCandidateName(curM.reverseCandidateId)) && tsKind !== 'compat-thinking';
  const preRouteClosed = String(curM?.routeFrom || chat._routeBaseline?.label || '').trim();
  const hasClosedEvidence = tsKind === 'closed-thinking' || (chat.fmt?.toolIds || []).some(id => /^(?:toolu_|srvtoolu_|call_)/i.test(String(id || ''))) || (preRouteClosed && !isOpenCandidateName(preRouteClosed));
  if (isPollutedOpen && (hasClosedEvidence || opt.pruneTail)) {
    if (preRouteClosed && !isOpenCandidateName(preRouteClosed)) {
      const restored = {
        ...curM,
        name: preRouteClosed,
        candidateName: preRouteClosed,
        reverseLabel: preRouteClosed,
        routed: false,
        sure: true,
        guess: false,
      };
      delete restored.routeType;
      delete restored.routeFrom;
      delete restored.routeTo;
      delete restored.lastRouteNotice;
      delete restored.routeNotices;
      Models.set(chat.sid, restored);
      try { Bus.emit('model', chat, restored); } catch {}
    } else {
      try {
        if (typeof Models.del === 'function') Models.del(chat.sid);
        else { delete Models.map?.[chat.sid]; Models.save?.(); }
      } catch {}
      try { chat.guessModel?.(); } catch {}
    }
    try {
      if (typeof BillingProbe !== 'undefined') {
        if (typeof BillingProbe.invalidateAndRefresh === 'function') void BillingProbe.invalidateAndRefresh(chat);
        else if (typeof BillingProbe.schedule === 'function') BillingProbe.schedule(chat, 10);
      }
    } catch {}
  } else if (opt.pruneTail && typeof BillingProbe !== 'undefined') {
    try {
      if (typeof BillingProbe.invalidateAndRefresh === 'function') void BillingProbe.invalidateAndRefresh(chat);
      else if (typeof BillingProbe.schedule === 'function') BillingProbe.schedule(chat, 10);
    } catch {}
  }
  try { chat.emit?.(); } catch {}
  return pruned;
}
function pruneDeadTailTurns(chat) {
  const msgs = chat?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return null;
  if (msgs.some(m => m?.metadata?.openThinkStopped || (m?.role === 'assistant' && (m?.parts || []).some(p => p?.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || '')))))) {
    chat._hadOpenThinkStop = true;
    chat._allowOpenThink = true;
  }
  const rej = chat?._rejectedHealthyNodeIds;
  const healthyU = findHealthyLastUser(msgs, null, rej);
  let lastHealthyIdx = -1;
  if (healthyU) {
    const uIdx = msgs.indexOf(healthyU);
    if (uIdx >= 0) {
      lastHealthyIdx = uIdx;
      for (let j = uIdx + 1; j < msgs.length; j++) {
        const m = msgs[j];
        if (!m) continue;
        if (m.role === 'user') break;
        if (m.role === 'assistant' && !isDeadAssistantMsg(m)) lastHealthyIdx = j;
      }
    }
  }
  for (let k = msgs.length - 1; k > lastHealthyIdx; k--) {
    const mk = msgs[k];
    if (isHitlToolResultUserMsg(mk) || (mk?.role === 'user' && mk._officialContinueParent && !mk._streamRejected && !rej?.has?.(String(mk.metadata?.nodeId || mk.id || '')))) { lastHealthyIdx = k; break; }
  }
  const tailSlice = msgs.slice(lastHealthyIdx + 1);
  if (!tailSlice.length) return null;
  const hasDeadEvidence = tailSlice.some(m => m && (
    (m.role === 'assistant' && isDeadAssistantMsg(m)) ||
    (m.role === 'user' && (m.failed || (m._streamRejected && !isHitlToolResultUserMsg(m)) || m.metadata?.error || (rej?.has?.(String(m.metadata?.nodeId || m.id || '')))))
  )) || tailSlice.filter(m => m && m.role === 'user').length > 1;
  if (!hasDeadEvidence) return null;
  const deadUsers = tailSlice.filter(m => m && m.role === 'user' && !isHitlToolResultUserMsg(m));
  if (!deadUsers.length) {
    const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
    msgs.splice(lastHealthyIdx + 1);
    return { lastUser: null, origText: '', prunedCount: tailSlice.length };
  }
  const getText = u => (u?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n').trim();
  const isContinueFiller = u => /^(?:继续|continue|go on|keep going|接着|继续执行)[。.!！?？\s]*$/i.test(getText(u)) && !(u?.metadata?.uploads?.length > 0);
  const pickedUser = [...deadUsers].reverse().find(u => !isContinueFiller(u) && (getText(u) || u?.metadata?.uploads?.length > 0)) || deadUsers.at(-1);
  const maxResent = deadUsers.reduce((mx, u) => Math.max(mx, Number(u?._officialErrAutoResent) || 0), 0);
  pickedUser._officialErrAutoResent = maxResent;
  pickedUser._streamRejected = true;
  const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
  for (const m of tailSlice) if (m?.id) prunedSet.add(m.id);
  msgs.splice(lastHealthyIdx + 1);
  return {
    lastUser: pickedUser,
    origText: getText(pickedUser),
    prunedCount: tailSlice.length,
  };
}
try {
  if (typeof window !== 'undefined') {
    window.isOfficialTransientError = isOfficialTransientError;
    window.formatOfficialErrorText = formatOfficialErrorText;
    window.isOpenCandidateName = isOpenCandidateName;
    window.isDeadAssistantMsg = isDeadAssistantMsg;
    window.ensureHealthyHistoryLoaded = ensureHealthyHistoryLoaded;
    window.findFirstHealthyUser = findFirstHealthyUser;
    window.findHealthyLastUser = findHealthyLastUser;
    window.pruneDeadTailTurns = pruneDeadTailTurns;
    window.healChatModelAndBranch = healChatModelAndBranch;
  }
} catch {}
function packClientInteraction(textLen = 8, kind = 'enter') {
  try {
    const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : (typeof VISIT === 'string' && VISIT ? VISIT : 'local');
    const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; } return (h ^ (h >>> 16)) & 65535; };
    const salt = 48664;
    const len = Math.max(1, Math.min(255, Number(textLen) || 8));
    const kd = Math.min(15, Math.max(2, Math.min(len, 3 + Math.floor(Math.random() * 8))));
    const ku = Math.min(15, Math.max(2, kd));
    const inp = Math.min(15, Math.max(2, kd));
    const ptr = 2 + Math.floor(Math.random() * 5);
    const edit = Math.floor(Math.random() * 3);
    const dwell = Math.min(65535, 1400 + len * (65 + Math.floor(Math.random() * 55)) + Math.floor(Math.random() * 1800));
    const layout = [
      [2, kind === 'button' ? 1 : 0], [2, 2], [4, edit],
      [8, len], [4, kd], [4, ku],
      [1, 1], [1, 0], [4, inp], [3, ptr], [1, 1], [16, dwell],
      [3, kind === 'button' ? 3 : 0], [2, kind === 'button' ? 1 : 0], [2, 1],
      [2, 1], [2, 0], [2, 0], [1, 0],
      [16, fnv(String(vid || 'local'))], [16, Math.floor(now() / 60000) & 65535]
    ];
    let a = (0x5bd1e995 ^ salt) >>> 0;
    const rng = () => { let e = Math.imul((a = (a + 0x6d2b79f5) | 0) ^ (a >>> 15), 1 | a); return (((e ^= e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ (e >>> 14)) >>> 0); };
    const order = layout.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    const o = new Uint8Array(12); let s = 0;
    for (const idx of order) {
      const [bits, val] = layout[idx];
      for (let b = bits - 1; b >= 0; b--) { if ((val >>> b) & 1) o[s >> 3] |= 128 >>> (s & 7); s++; }
    }
    for (let i = 0; i < 12; i++) o[i] ^= (rng() & 255);
    const l = new Uint8Array(15); l[0] = 2; l[1] = salt >>> 8; l[2] = salt & 255; l.set(o, 3);
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    for (let i = 0; i < 15; i += 3) {
      const n = (l[i] << 16) | (l[i + 1] << 8) | l[i + 2];
      out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
    }
    return out;
  } catch { return undefined; }
}
// 抽卡：create-chat 要等 reCAPTCHA + 服务器创建（常常好几秒），先在左侧列表放一条「创建中」占位，拿到 ID 后原位替换
async function createChat(text, opt = {}) {
  const waiting = opt.gacha ? Quota.blockedUntil(true) - now() : 0;
  if (waiting > 0) throw Object.assign(Error(Quota.blockedUntil() > now() ? '服务端要求等待，请在 ' + Math.ceil(waiting / 1000) + ' 秒后重试' : '自动抽卡短暂退避，' + Math.ceil(waiting / 1000) + ' 秒后重试'), { status: 429, retryAfterMs: waiting, rateLimitedLocally: true });
  if (!opt.gacha) return createChat0(text, opt);
  const ts = new Date().toISOString(), ph = { type: 'agentic', id: 'pending:' + uuid7(), title: '抽卡 · 正在创建对话…', _pending: true, updatedAt: ts, createdAt: ts };
  History.items.unshift(ph); Bus.emit('history');
  try { return await createChat0(text, { ...opt, placeholder: ph }); }
  finally { const i = History.items.indexOf(ph); if (i >= 0) { History.items.splice(i, 1); Bus.emit('history'); } }
}
const CREATE_ACTION = 'agentic_chat_submit';
async function createChat0(text, opt = {}) {
  const id = uuid7(), msg = { id, role: 'user', parts: [{ type: 'text', text }] };
  const um = Uploads.meta(opt.files, null); if (um) msg.metadata = um;
  const cx = packClientInteraction(String(text || '').length || 8, Math.random() < 0.45 ? 'button' : 'enter');
  const body = { message: msg, timezone: currentTimezone(), ...(cx ? { cx } : {}) };
  if (!opt.gacha && typeof Connectors !== 'undefined') { const c = Connectors.active(); if (c.length) body.enabledConnectors = c; }   // 和官方一样：新对话带上已启用的连接器（抽卡不带）
  if (opt.v2) { body.recaptchaV2Token = opt.v2; body.recaptchaV3Token = null; }
  // 网页新建 agent 对话用的 reCAPTCHA action 是 agentic_chat_submit（不是 chat_submit）；action 不对会拉低验证分数
  else body.recaptchaV3Token = await (opt.gacha ? Recaptcha.v3(CREATE_ACTION) : Recaptcha.take(CREATE_ACTION)).catch(() => null);
  // 同一个请求（同一条消息 id、同一个 attempt id）自动重发：
  //   409「This chat request is still in progress. Retry the same request.」= 服务器还在处理上一次的同一个请求 → 等一下原样重发，拿到的就是那次的结果；
  //   500 / 502 / 503 / 504、超时、网络断开 → 退避后原样重发（服务器按消息 id 去重，不会多建对话）
  let res; let att = uuid7(); const t0 = now(); let relog = false, escalated = false, rotated429 = false, n409 = 0, n5xx = 0, nNet = 0;
  for (;;) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 45000);
    let err = null;
    try { res = await rawFetch('/nextjs-api/stream/create-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-agent-browser-attempt-id': att }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: ctl.signal }); }
    catch (e) { err = e; }
    finally { clearTimeout(tm); }
    const left = 150000 - (now() - t0);
    if (err) {
      if (typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) await AutoRoute.onErrorSwitch(err.name === 'AbortError' ? { routeTimeout: true, message: 'create-chat timeout' } : { net: true, message: String(err.message || err) }, 'create-chat').catch(() => null);
      if (++nNet <= 2 && left > 20000) { opt.onRetry?.('创建对话' + (err.name === 'AbortError' ? '超时' : '网络错误') + '，已秒切备用线路并重发（第 ' + nNet + ' 次）'); await sleep(800 * nNet); continue; }
      throw new Error(err.name === 'AbortError' ? '创建对话超时（45 秒没有响应），请检查代理后重试' : '创建对话失败：' + (err.message || err));
    }
    if (res.status === 401 && !relog) { relog = true; if (await Auth.relogin()) continue; }
    if (res.status === 409 && ++n409 <= 10 && left > 5000) { const t409 = await res.text().catch(() => ''); if (/refresh_required/i.test(t409) && Pin.on()) { Pin.fallback('旧部署要求刷新（409 refresh_required）'); opt.onRetry?.('旧版固定不兼容，改用新版重发'); continue; } opt.onRetry?.('服务器还在处理这个请求（409），' + Math.min(6, 1 + n409) + ' 秒后原样重发'); await sleep(Math.min(6000, 1000 + n409 * 1000)); continue; }
    // 重复指令（429 prompt failed / verification required）或 v3 分数不足（403 recaptcha validation failed）：和网页一致，弹人工验证后带 v2 令牌原样重发一次（抽卡无人值守，交给抽卡自己的验证码流程）
    if ((res.status === 429 || res.status === 403) && !opt.gacha && !opt.v2 && !escalated) {
      const tRc = await res.clone().text().catch(() => '');
      const isPf = promptFailed(res.status, tRc);
      const isRc = isPf || (res.status === 403 && /recaptcha|人机|验证失败/i.test(tRc)) || (res.status === 429 && /verification required/i.test(tRc));
      if (isRc) {
        if (res.status === 403 && !opt.v2) { try { IPRep.note('rc'); } catch {} }
        escalated = true; opt.onRetry?.(isPf ? 'Brana 要求人工验证（重复指令），请完成验证' : 'Brana 要求人工验证（reCAPTCHA），请完成验证');
        const tok = await Recaptcha.v2().catch(() => null);
        if (!tok) throw Object.assign(new Error('已取消人机验证，这条没有发送'), { status: 0 });
        body.recaptchaV2Token = tok; body.recaptchaV3Token = null; continue;
      }
    }
    // 429 速率限制（非重复指令）：不切换用户当前 IP，先轮换会话指纹（arena_visit_id + cx 交互特征 + 新 reCAPTCHA v3 令牌）原地绕过重试一次
    if (res.status === 429 && !rotated429 && left > 12000) {
      const t429 = await res.clone().text().catch(() => '');
      if (!promptFailed(429, t429) && !/verification required/i.test(t429)) {
        rotated429 = true;
        try { rotateVisitId(); } catch {}
        msg.id = uuid7();
        att = uuid7();
        const freshCx = packClientInteraction(String(text || '').length || 8, Math.random() < 0.5 ? 'button' : 'enter');
        if (freshCx) body.cx = freshCx;
        if (!opt.v2) body.recaptchaV3Token = await Recaptcha.v3(CREATE_ACTION).catch(() => body.recaptchaV3Token);
        const waitMs = 2600 + Math.floor(Math.random() * 1400);
        opt.onRetry?.('触发 429 速率限制，正在轮换会话指纹原地绕过重试（不切换当前 IP）…');
        await sleep(waitMs);
        continue;
      }
    }
    if ([500, 502, 503, 504, 520, 522, 524].includes(res.status) && ++n5xx <= 3 && left > 10000) { if (typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) await AutoRoute.onErrorSwitch({ status: res.status }, 'create-chat').catch(() => null); opt.onRetry?.('服务器临时错误（HTTP ' + res.status + '），已秒切备用线路并重发（第 ' + n5xx + ' 次）'); await res.text().catch(() => {}); await sleep(900 * n5xx); continue; }
    break;
  }
  const t = await res.text(), pf = promptFailed(res.status, t);
  if (!pf) Quota.note(res);   // 重复指令的 429 不是新对话额度限流，不能记成「1 分钟后再试」
  // 纯净度实测：v3 直接通过 / 被要求人机验证；429 保持当前出口原地冷却，不再自动换走用户已选的未限流 IP
  if (res.ok) { if (body.recaptchaV3Token) IPRep.note('ok'); } else if (res.status === 403 && /recaptcha/i.test(t)) { if (!opt.v2) IPRep.note('rc'); } else if (!res.ok && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [408].includes(res.status)) { void AutoRoute.onErrorSwitch({ status: res.status }, 'create-chat'); }
  if (!res.ok) { let m = t; try { m = JSON.parse(t).error || t; } catch {} if (typeof m !== 'string') m = JSON.stringify(m); throw new HttpError(res.status, m, res); }
  const sid = JSON.parse(t).id; if (!sid) throw new Error('create-chat 没有返回对话 ID');
  const c = chatOf(sid);
  c.messages = [{ ...msg, metadata: msg.metadata || {}, v: 0 }]; c.loaded = true; c.lastSeq = null; c.status = 'submitted'; c.phase = '等待回复'; c.sentAt = now(); c.title = text.slice(0, 60);
  if (opt.gacha) c.gacha = opt.gacha; else Bus.emit('sent', sid, now());
  if (!History.byId(sid)) { const ts = new Date().toISOString(), row = { type: 'agentic', id: sid, title: text.slice(0, 60), updatedAt: ts, createdAt: ts, _local: true }, pi = opt.placeholder ? History.items.indexOf(opt.placeholder) : -1; if (pi >= 0) History.items[pi] = row; else History.items.unshift(row); Bus.emit('history'); }
  c.emit();
  c.stream();
  Bus.emit('created', c);
  return c;
}

// ---------- 历史列表 ----------
// 会话时间（毫秒）：按条目对象记住解析结果（侧栏每次重绘 1500 条都要 parse 一遍）
const ENT_AT = new WeakMap();
const entAt = e => { if (!e) return NaN; const raw = e.updatedAt || e.createdAt || ''; const c = ENT_AT.get(e); if (c && c[0] === raw) return c[1]; const v = Date.parse(String(raw).replace(' ', 'T').replace(/\+00$/, 'Z')); ENT_AT.set(e, [raw, v]); return v; };
const History = {
  items: [], cursor: null, hasMore: true, loading: false, err: null, lastLoad: 0, seen: new Set(), ck: '',
  isGhostLocal(e) {
    return Boolean(e && (e._localRecovered || /^本地缓存对话(\s|$)/i.test(String(e.title || '').trim())));
  },
  uuidTs(sid) {
    const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7/i.exec(String(sid || '').trim());
    if (!m) return 0;
    const ms = parseInt(m[1] + m[2], 16);
    return Number.isFinite(ms) && ms > 1700000000000 && ms < 2500000000000 ? ms : 0;
  },
  seedFromAccountStats() {
    try {
      const gone = this.goneMap?.() || new Map();
      const vendors = (typeof UI !== 'undefined' && UI.host?.account?.status?.stats?.vendors) || null;
      let modelsDirty = false, notesDirty = false;
      if (vendors && typeof vendors === 'object') {
        for (const vObj of Object.values(vendors)) {
          const models = vObj?.models || {};
          for (const [mName, mObj] of Object.entries(models)) {
            for (const row of (mObj?.list || [])) {
              if (!Array.isArray(row) || !row[0]) continue;
              const [sid, atMs, , known, note] = row;
              if (!sid || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid))) continue;
              if (mName && !/^(未识别|未知型号|待定)$/.test(String(mName).trim()) && typeof Models !== 'undefined' && Models.all && !Models.all[sid]?.name) {
                Models.all[sid] = { ...(Models.all[sid] || {}), name: mName, sid, at: Number(atMs) || now(), habitInferred: !!known, pendingConfirm: false };
                modelsDirty = true;
              }
              if (note && typeof Notes !== 'undefined' && Notes.all && !Notes.all[sid]?.v && !Notes.all[sid]?.n) {
                Notes.all[sid] = { n: String(note), t: Number(atMs) || now() };
                notesDirty = true;
              }
            }
          }
        }
      }
      if (modelsDirty) try { Store.set('models', Models.all); } catch {}
      if (notesDirty) try { Store.set('notes2', Notes.all); } catch {}
    } catch {}
    return 0;
  },
  // 本地轻量缓存：重启后先用上次的列表立刻显示，再在后台刷新（统计也直接用它）
  warm(acct) {
    const isFast = !acct || acct === 'fast' || acct === 'anon';
    if (!isFast) this.ck = 'hist:' + acct;
    if (this.items.length) {
      this.seedFromAccountStats();
      Bus.emit('history');
      if (typeof UI !== 'undefined') void this.restoreFromLocalCache?.();
      return;
    }
    let c = !isFast ? Store.get(this.ck, null) : null;
    if (isFast && (!c || !Array.isArray(c.items) || !c.items.length)) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.startsWith('anc:hist:') && k !== 'anc:hist:fast' && k !== 'anc:hist:anon') {
            const cand = Store.get(k.slice(4), null);
            if (cand && Array.isArray(cand.items) && cand.items.length > (c?.items?.length || 0)) {
              c = cand;
              if (!this.ck) this.ck = k.slice(4);
            }
          }
        }
      } catch {}
    }
    if (c && Array.isArray(c.items) && c.items.length) {
      const gone = this.goneMap?.() || new Map();
      const purgedGhosts = this._warmPurgedGhosts || (this._warmPurgedGhosts = new Set());
      this.items = c.items.filter(e => {
        if (!e?.id || gone.has(e.id) || (typeof Arch !== 'undefined' && Arch.has?.(e.id))) return false;
        if (/^本地缓存对话(\s|$)/i.test(String(e.title || '').trim())) {
          purgedGhosts.add(e.id);
          return false;
        }
        return true;
      });
      this.dedupe(); this.cached = c.at || 0; this.full = false; this.fullAt = 0;
      if (purgedGhosts.size > 0) this.saveSoon();
    }
    this.seedFromAccountStats();
    if (this.items.length) Bus.emit('history');
    if (typeof UI !== 'undefined') void this.restoreFromLocalCache?.();
  },
  saveSoon() {
    if (!this.ck) return; clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      const pick = e => { const o = {}; for (const k of ['id', 'type', 'productMode', 'title', 'localTitle', 'createdAt', 'updatedAt', 'isArchived', 'isPinned', 'modality']) if (e[k] !== undefined) o[k] = e[k]; return o; };
      const cleanItems = this.items.filter(e => !e._pending && !e._localRecovered && !/^本地缓存对话(\s|$)/i.test(String(e?.title || '').trim())).slice(0, 5000).map(pick);
      if (!cleanItems.length) {
        const prev = Store.get(this.ck, null);
        const gone = this.goneMap?.() || new Map();
        const prevAlive = Array.isArray(prev?.items) ? prev.items.filter(x => x?.id && !gone.has(x.id) && !/^本地缓存对话(\s|$)/i.test(String(x?.title || '').trim())) : [];
        if (prevAlive.length > 0) return;
      }
      const payload = { at: now(), full: !!this.full && this.items.length <= 5000, fullAt: this.fullAt || 0, items: cleanItems };
      Store.set(this.ck, payload);
      if (cleanItems.length > 0) {
        try { if (typeof MsgCache !== 'undefined' && MsgCache.putMeta) void MsgCache.putMeta(this.ck, payload); } catch {}
        try {
          const aid = (typeof UI !== 'undefined' && UI.host?.account?.id) || (this.ck.startsWith('hist:') ? this.ck.slice(5) : '');
          if (aid && aid !== 'web' && aid !== 'fast' && aid !== 'anon' && typeof Host !== 'undefined' && Host.shared) {
            void Promise.resolve(Host.shared('hist@' + aid, payload)).catch(() => {});
          }
        } catch {}
      }
    }, 1500);
  },
  // Refresh and pagination mutate one cursor chain. Never let their responses commit out of order.
  serial(task) {
    const run = (this.opP || Promise.resolve()).catch(() => {}).then(task);
    this.opP = run; return run;
  },
  page(j) {
    const p = j?.pagination;
    if (!j || !Array.isArray(j.entries) || !p || typeof p.hasMore !== 'boolean' ||
        (p.hasMore && (typeof p.cursor !== 'string' || !p.cursor || p.cursor.length > 4096)) ||
        j.entries.some(e => !e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id)) {
      throw Object.assign(Error('历史列表响应格式异常，已保留本地列表；请刷新重试'), { historyStop: true });
    }
    const gone = this.goneMap();
    return { entries: j.entries.filter(e => (e.type === 'agentic' || e.productMode) && !e.isArchived && !e.archivedAt && !gone.has(e.id) && !(typeof Arch !== 'undefined' && Arch.has?.(e.id))), cursor: p.hasMore ? p.cursor : null, hasMore: p.hasMore };
  },
  // 已归档 / 删除的对话：本机记住 30 天，防止本地残留统计或延迟列表把已删对话复活成「本地缓存对话」。
  goneMap() {
    if (!this.gone) { let g = {}; try { g = Store.get('histgone', {}); } catch {} const t = now(); this.gone = new Map(Object.entries(g && typeof g === 'object' ? g : {}).filter(([, at]) => t - at < 30 * 86400e3)); }
    return this.gone;
  },
  bury(ids) {
    const m = this.goneMap(), set = new Set(ids.filter(Boolean)); if (!set.size) return;
    for (const id of set) { m.delete(id); m.set(id, now()); }
    while (m.size > 5000) m.delete(m.keys().next().value);
    Store.set('histgone', Object.fromEntries(m));
    const n = this.items.length; this.items = this.items.filter(e => !set.has(e.id));
    if (n !== this.items.length) { this.saveSoon(); Bus.emit('history'); }
  },
  merge(got, head = false) {
    const prevById = new Map(this.items.map(e => [e.id, e]));
    const rows = new Map();
    const withLocal = e => {
      if (e.localTitle !== undefined) return e;
      const p = prevById.get(e.id);
      if (!p?.localTitle) return e;
      const mi = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      const hasLocalMi = Boolean(mi?.name && !mi.pendingConfirm && (!mi.guess || mi.userCorrected || mi.habitInferred || mi.reverseInferred || mi.billingProbe));
      if (p.title === e.title || hasLocalMi) return { ...e, localTitle: (hasLocalMi && typeof Titles !== 'undefined' && Titles.want ? Titles.want(e.id) : '') || p.localTitle };
      return e;
    };
    if (head) { for (const e of got) rows.set(e.id, withLocal(e)); for (const e of this.items) if (!rows.has(e.id)) rows.set(e.id, e); }
    else { for (const e of this.items) rows.set(e.id, e); for (const e of got) rows.set(e.id, withLocal(e)); }
    this.items = [...rows.values()];
    for (const e of got) this.seen.add(e.id);
  },
  complete() {
    if (!this.scan || this.hasMore || this.err) return;
    const gone = this.goneMap?.() || new Map();
    const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
    const keepLocal = isOffline;
    const mcKeys = keepLocal ? new Set([
      ...(typeof MsgCache !== 'undefined' && MsgCache.keys ? MsgCache.keys() : []),
    ]) : new Set();
    const removedIds = new Set();
    this.items = this.items.filter(e => {
      if (!e?.id || gone.has(e.id) || (typeof Arch !== 'undefined' && Arch.has?.(e.id))) {
        if (e?.id) removedIds.add(e.id);
        return false;
      }
      if (!keepLocal && this.isGhostLocal(e) && !this.seen.has(e.id)) {
        removedIds.add(e.id);
        return false;
      }
      const keep = this.seen.has(e.id) || !this.scan.baseline.has(e.id) || (keepLocal && (e._localRecovered || mcKeys.has(e.id) || this.seen.size === 0)) || Chats.get(e.id)?.busy;
      if (!keep && e?.id) removedIds.add(e.id);
      return keep;
    });
    if (!keepLocal && removedIds.size > 0 && typeof Tabs !== 'undefined' && Array.isArray(Tabs.list)) {
      for (const t of [...Tabs.list]) {
        if (t.kind === 'chat' && t.sid && removedIds.has(t.sid) && !Chats.get(t.sid)?.busy) {
          try { Tabs.close?.(t.key); } catch {}
        }
      }
    }
    this.full = true; this.fullAt = now();
  },
  async restoreFromLocalCache() {
    if (this._restoringP) return this._restoringP;
    this._restoringP = (async () => {
      try {
        const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
        const gone = this.goneMap?.() || new Map();
        this.seedFromAccountStats();
        let added = 0;
        let updated = 0;
        // 清理之前遗留在列表或冷启动缓存中的「本地缓存对话 <sid8>」幽灵条目（无实际消息缓存或已被服务端排除）
        const ghostCandidates = new Set(this._warmPurgedGhosts ? [...this._warmPurgedGhosts] : []);
        if (this._warmPurgedGhosts) this._warmPurgedGhosts.clear();
        if (Array.isArray(this.items) && this.items.length) {
          const kept = [];
          for (const item of this.items) {
            if (!item?.id || gone.has(item.id) || (typeof Arch !== 'undefined' && Arch.has?.(item.id))) {
              updated++;
              continue;
            }
            if (this.isGhostLocal(item) && !this.seen.has(item.id)) {
              const c = typeof MsgCache !== 'undefined' ? await MsgCache.get(item.id).catch(() => null) : null;
              if (!Array.isArray(c?.messages) || !c.messages.length) {
                ghostCandidates.add(item.id);
                updated++;
                continue;
              }
            }
            kept.push(item);
          }
          if (kept.length !== this.items.length) this.items = kept;
        }
        if (ghostCandidates.size > 0) {
          const confirmedGhosts = [];
          let turnsDirty = false;
          for (const gid of ghostCandidates) {
            const c = typeof MsgCache !== 'undefined' ? await MsgCache.get(gid).catch(() => null) : null;
            if (!Array.isArray(c?.messages) || !c.messages.length) {
              confirmedGhosts.push(gid);
              if (typeof AcctStats !== 'undefined' && AcctStats.turns && AcctStats.turns[gid]) {
                delete AcctStats.turns[gid];
                turnsDirty = true;
              }
              try { if (typeof Notes !== 'undefined' && Notes.all?.[gid] && !Notes.all[gid].n) Notes.drop?.(gid); } catch {}
            }
          }
          if (turnsDirty) try { AcctStats.save?.(); } catch {}
          if (confirmedGhosts.length > 0) {
            try { this.bury?.(confirmedGhosts); } catch {}
            updated++;
          }
        }
        const existing = new Set((this.items || []).map(x => x?.id).filter(Boolean));
        const aid = (typeof UI !== 'undefined' && UI.host?.account?.id) || (this.ck?.startsWith('hist:') ? this.ck.slice(5) : '');
        try {
          if (typeof MsgCache !== 'undefined' && MsgCache.getMeta) {
            const metaModels = await MsgCache.getMeta('models').catch(() => null);
            if (metaModels && typeof metaModels === 'object' && typeof Models !== 'undefined' && Models.all) {
              let mDirty = false;
              for (const [sid, mv] of Object.entries(metaModels)) {
                if (sid && mv && !gone.has(sid) && !Models.all[sid]?.name) { Models.all[sid] = mv; mDirty = true; }
              }
              if (mDirty) try { Store.set('models', Models.all); } catch {}
            }
            // 仅当本地列表完全为空且尚未从服务端成功拉取时，才用备份列表做冷启动兜底
            if (!this.items.length && !this.lastLoad && this.ck) {
              const metaHist = await MsgCache.getMeta(this.ck).catch(() => null);
              if (Array.isArray(metaHist?.items)) {
                for (const e of metaHist.items) {
                  const sid = e?.id;
                  if (!sid || existing.has(sid) || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || this.isGhostLocal(e)) continue;
                  this.items.push(e);
                  existing.add(sid);
                  added++;
                }
              }
            }
          }
        } catch {}
        try {
          if (!this.items.length && !this.lastLoad && aid && aid !== 'web' && aid !== 'fast' && aid !== 'anon' && typeof Host !== 'undefined' && Host.shared) {
            const sharedHist = await Promise.resolve(Host.shared('hist@' + aid)).catch(() => null);
            if (Array.isArray(sharedHist?.items)) {
              for (const e of sharedHist.items) {
                const sid = e?.id;
                if (!sid || existing.has(sid) || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || this.isGhostLocal(e)) continue;
                this.items.push(e);
                existing.add(sid);
                added++;
              }
            }
          }
        } catch {}
        // 只用真实存在本地消息缓存（MsgCache）的会话补齐标题，绝不凭空把 turns/notes/models 残留 key 伪造成「本地缓存对话」
        const idbKeys = (typeof MsgCache !== 'undefined' && MsgCache.allKeys)
          ? await MsgCache.allKeys().catch(() => [])
          : (typeof MsgCache !== 'undefined' && MsgCache.keys ? MsgCache.keys() : []);
        for (const sid of idbKeys) {
          if (!sid || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || !/^[0-9a-f-]{8,64}$/i.test(sid)) continue;
          const row = existing.has(sid) ? this.byId(sid) : null;
          const needsEnrich = row && (this.isGhostLocal(row) || row.title === sid.slice(0, 8));
          if (row && !needsEnrich) continue;
          if (!row && !isOffline) continue;
          const cached = typeof MsgCache !== 'undefined' ? await MsgCache.get(sid).catch(() => null) : null;
          if (!Array.isArray(cached?.messages) || !cached.messages.length) continue;
          const mi = typeof Models !== 'undefined' ? (Models.get?.(sid) || Models.all?.[sid] || null) : null;
          const firstUser = cached.messages.find(m => m?.role === 'user');
          const firstTxt = (firstUser?.parts || []).find(p => p?.type === 'text')?.text || (typeof firstUser?.content === 'string' ? firstUser.content : '') || '';
          const cleanFirst = String(firstTxt).replace(/\s+/g, ' ').trim().slice(0, 48);
          const noteTxt = (typeof Notes !== 'undefined' && Notes.get?.(sid)) || '';
          const t = (typeof Titles !== 'undefined' && Titles.raw?.(sid)) || cleanFirst || mi?.name || noteTxt;
          if (!t || /^本地缓存对话(\s|$)/i.test(t)) continue;
          const fallbackMs = cached?.at || Date.parse(firstUser?.createdAt || '') || mi?.at || this.uuidTs(sid) || now();
          const ts = cached?.histUpdatedAt || new Date(fallbackMs).toISOString();
          if (row) {
            if (t !== row.title) {
              row.title = t;
              delete row._localRecovered;
              updated++;
            }
          } else if (isOffline) {
            this.items.push({ id: sid, type: 'agentic', title: t, createdAt: ts, updatedAt: ts, mode: 'agent', _localRecovered: true });
            existing.add(sid);
            added++;
          }
        }
        if (added > 0 || updated > 0) {
          this.items.sort((a, b) => (entAt(b) || 0) - (entAt(a) || 0));
          this.dedupe();
          this.saveSoon();
          Bus.emit('history');
          try { if (typeof UI !== 'undefined') UI.renderList?.(); } catch {}
        }
      } catch {}
    })().finally(() => { this._restoringP = null; });
    return this._restoringP;
  },
  refresh(opt) {
    return this.refreshP ||= this.serial(() => this.refreshNow(opt)).finally(() => { this.refreshP = null; });
  },
  /* 自动刷新的唯一入口（定时 / 回到前台 / 有新对话）。列表其实很少变：除非有新对话，低频拉一次就够——
     tick：距上次请求 ≥ 3 分钟才拉；front：回到前台 ≥ 2 分钟才拉；new（新对话 / 新对话的第一轮回复完成）：≥ 20 秒，没到就排一次延后的。
     限流冷却期间（列表自己的 Retry-After，或读对话收到 429 后的全局冷却）一律不发，冷却结束后补一次。手动「刷新」不走这里。 */
  GAP: { tick: 180000, front: 120000, new: 20000 },
  auto(why = 'tick') {
    if ((typeof document !== 'undefined' && document.hidden) || this.fullLoading) return;
    const t = now(), cool = Math.max(this.retryAt || 0, ReadLimit.until || 0), due = Math.max(cool, (this.attemptAt || 0) + (this.GAP[why] ?? this.GAP.tick));
    if (due <= t) { void this.refresh({ bg: true }); return; }
    if (why === 'new' || cool > t && this.pendingNew) {   // 有新对话等着拉标题：排一次（只排一个，取最早能发的时刻）
      this.pendingNew = true;
      if (this.autoT && this.autoDue <= due) return;
      clearTimeout(this.autoT); this.autoDue = due;
      this.autoT = setTimeout(() => { this.autoT = 0; this.auto('new'); }, due - t + 300); this.autoT?.unref?.();
    }
  },
  // 一轮回复结束：本地把这个对话挪到最前、更新时间（不用为此请求整个列表）；只有本机新建、服务器列表里还没有的对话才需要拉一次拿标题
  touched(sid) {
    if (!sid) return;
    const e = this.byId(sid);
    if (e) { e.updatedAt = new Date().toISOString(); const i = this.items.indexOf(e); if (i > 0) { this.items.splice(i, 1); this.items.unshift(e); } this.saveSoon(); Bus.emit('history'); }
    if (!e || e._local) this.auto('new');
  },
  limited() { return this.errKind === 'limit' && Math.max(this.retryAt || 0, ReadLimit.until || 0) > now(); },
  async refreshNow(opt = {}) {
    if (this.retryAt > now()) { Bus.emit('history'); return; }
    if (opt.bg && ReadLimit.active()) { this.errKind = 'limit'; this.err = this.err || '限流冷却中'; this.blocked = true; this.auto('new'); Bus.emit('history'); return; }   // 冷却中：不发，冷却完自动补
    this.attemptAt = now(); this.pendingNew = false;
    this.full = false; this.blocked = false;
    const baseline = new Set(this.items.map(e => e.id));
    try {
      // 列表接口偶尔很慢：45 秒上限，传输类失败自动再试一次；失败时保留本地列表，不打断使用
      let j;
      for (let i = 0; ; i++) {
        try { j = this.page(await api('/api/history/unified?limit=50&includeArchived=false', { noRelogin: !!opt.noRelogin, timeout: 45000, bg: !!opt.bg })); break; }
        catch (e) { if (i || !(typeof NetPolicy!=="undefined"&&NetPolicy.transportError(e)) || e.historyStop) throw e; this.retrying = true; Bus.emit('history'); await sleep(2500); }
        finally { this.retrying = false; }
      }
      this.seen = new Set(); this.scan = { baseline, cursors: new Set() };
      this.merge(j.entries, true); this.cursor = j.cursor; this.hasMore = j.hasMore;
      const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
      const keepLocal = isOffline;
      if (!keepLocal && j.entries.length > 0) {
        const minSrvTs = Date.parse(j.entries.at(-1)?.updatedAt || j.entries.at(-1)?.createdAt || '') || 0;
        const headRemoved = new Set();
        this.items = this.items.filter(e => {
          if (!e?.id || this.seen.has(e.id) || e._local || e._pending || Chats.get(e.id)?.busy) return true;
          if (this.isGhostLocal(e)) {
            headRemoved.add(e.id);
            return false;
          }
          if (!baseline.has(e.id)) return true;
          const eTs = Date.parse(e.updatedAt || e.createdAt || '') || 0;
          if (!j.hasMore || (minSrvTs > 0 && eTs > minSrvTs + 1000)) {
            headRemoved.add(e.id);
            return false;
          }
          return true;
        });
        if (headRemoved.size > 0 && typeof Tabs !== 'undefined' && Array.isArray(Tabs.list)) {
          for (const t of [...Tabs.list]) {
            if (t.kind === 'chat' && t.sid && headRemoved.has(t.sid) && !Chats.get(t.sid)?.busy) {
              try { Tabs.close?.(t.key); } catch {}
            }
          }
        }
      }
      this.err = null; this.errKind = ''; this.retryAt = 0; this.lastLoad = now(); this.complete(); this.saveSoon();
    } catch (e) { this.failure(e); this.blocked = true; this.retrySoon(); }
    Bus.emit('history');
  },
  // 失败后后台自动重试（20 秒、1 分钟、3 分钟），成功即停
  retrySoon() {
    if (this.errKind === 'limit') { this.pendingNew = true; this.auto('new'); return; }   // 限流：冷却结束后补一次，不按 20 秒 / 1 分钟去撞
    if (this.retryT || this.retryAt > now()) return;
    const n = this.autoRetries = (this.autoRetries || 0) + 1; if (n > 3) return;
    this.retryT = setTimeout(() => { this.retryT = 0; if (typeof document !== 'undefined' && document.hidden) { this.autoRetries--; return; } this.refresh().then(() => { if (!this.err) this.autoRetries = 0; }); }, [20e3, 60e3, 180e3][n - 1]); this.retryT?.unref?.();
  },
  failure(e) {
    this.err = describe(e); this.errKind = e.status === 429 ? 'limit' : '';
    const wait = Math.max(Number(e.retryAfterMs) || 0, e.status === 429 ? 60000 : 0);
    if (wait) this.retryAt = now() + wait;
    if (wait || e.historyStop || e.responseFormat || [401,403].includes(e.status)) this.blocked = true;
  },
  more(bulk) {
    return this.moreP ||= this.serial(() => this.moreNow(bulk)).finally(() => { this.moreP = null; });
  },
  async moreNow(bulk) {
    if (this.blocked || !this.scan || !this.hasMore || !this.cursor) return;
    const cursor = this.cursor; this.loading = true;
    if (!bulk) Bus.emit('history');
    try {
      const j = this.page(await api('/api/history/unified?limit=' + (bulk ? 50 : 30) + '&includeArchived=false&cursor=' + encodeURIComponent(cursor), { timeout: 45000 }));
      if (j.hasMore && (j.cursor === cursor || this.scan.cursors.has(j.cursor))) {
        throw Object.assign(Error('历史分页游标重复，已停止重复请求；请刷新重试'), { historyStop: true });
      }
      this.scan.cursors.add(cursor); this.merge(j.entries);
      this.cursor = j.cursor; this.hasMore = j.hasMore; this.err = null;
      this.complete(); if (!bulk) this.saveSoon();
    } catch (e) { this.failure(e); }
    finally {
      this.loading = false;
      // Thousands of long encrypted titles must not trigger a full sidebar/statistics paint on every page.
      if (!bulk || this.err || now() - (this.paintAt || 0) >= 750) { this.paintAt = now(); Bus.emit('history'); }
    }
  },
  // 全量扫描有界、单飞；只有确认到达有效分页末尾才删除陈旧缓存。
  async loadAll() {
    if (this.allP) return this.allP;
    this.allP = (async () => {
      if (this.refreshP) await this.refreshP;
      else if (!this.lastLoad && !this.blocked) await this.refresh();
      if (this.blocked) return;
      this.fullLoading = true; Bus.emit('history');
      try {
        let i = 0, fail = 0;
        for (; i < 200 && this.hasMore && this.cursor && !this.blocked; i++) {
          await this.more(true);
          if (this.err) { if (this.blocked || ++fail >= 3) break; await sleep(1500); }
          else { fail = 0; await sleep(120); }
        }
        if (i >= 200 && this.hasMore && !this.err) this.err = '历史记录较多，本轮已暂停；可滚动继续加载';
        this.complete();
      } finally { this.fullLoading = false; this.saveSoon(); Bus.emit('history'); }
    })().finally(() => { this.allP = null; });
    return this.allP;
  },
  // 按 id 找：索引表（侧栏每张卡片都要查一次，线性查找 1500 条会话就是 O(n²)）；表过期（数组换了 / 位置对不上）就重建
  byId(id) {
    if (id == null) return undefined;
    const a = this.items; let m = this._ix;
    if (!m || this._ixA !== a || this._ixN !== a.length) { m = this._ix = new Map(); this._ixA = a; this._ixN = a.length; for (let i = a.length - 1; i >= 0; i--) if (a[i]) m.set(a[i].id, i); }
    let i = m.get(id);
    if (i != null && a[i]?.id === id) return a[i];
    if (i != null) { const j = a.findIndex(e => e?.id === id); if (j >= 0) { m.set(id, j); return a[j]; } }
    return typeof ArchiveHistory!=='undefined'?ArchiveHistory.byId(id):undefined;
  },
  // 同一个对话只留一条（保留排在前面的那条）
  dedupe() { const s = new Set(); const n = this.items.length; this.items = this.items.filter(e => e && !s.has(e.id) && s.add(e.id)); return n !== this.items.length; },
  async rename(id, title) {
    const e = this.byId(id), type = e?.type || 'agentic';
    const expected=e?.title;
    const isGoldPfx = typeof TitleCipher !== 'undefined' && typeof TitleCipher.isGoldPrefixed === 'function' && (TitleCipher.isGoldPrefixed(title) || (TitleCipher.isGoldPrefixed(expected) && TitleCipher.stripGoldPrefix(expected) === title));
    if (!isGoldPfx) {
      if(typeof TitleCipher==='undefined'||!TitleCipher.isEncoded(title))throw Error('云端会话名只允许口令加密格式，请在名称同步中设置口令');
      if(title.length!==100||!TitleCipher.isCompact(title))throw Error('新名称必须使用固定 100 字符格式；禁止发送旧长标题');
    }
    const readTitle=async()=>{
      const j=await api('/api/chat/'+encodeURIComponent(id),{noRelogin:true}),direct=j?.title??j?.chat?.title??j?.entry?.title??j?.conversation?.title??j?.data?.title;
      if(typeof direct==='string')return direct;
      // Some chat responses contain messages only. Use the known history endpoint as a bounded fallback,
      // never treat a PATCH echo alone as proof and never crawl all history for each rename.
      const list=await api('/api/history/unified?limit=50&includeArchived='+!!this.byId(id)?.isArchived,{noRelogin:true});
      const inList = Array.isArray(list?.entries)?list.entries.find(row=>row?.id===id)?.title:undefined;
      if(typeof inList==='string')return inList;
      return e?.title;
    };
    if(TitleCipher.isEncoded(expected)){
      const before=await readTitle();
      if(typeof before!=='string')throw Object.assign(Error('无法核对云端名称，暂不覆盖；本地结果已保留'),{status:409});
      if(before!==expected){const current=this.byId(id);if(current)current.title=before;Bus.emit('history');throw Object.assign(Error('云端名称已变化，请解码并处理冲突后重试'),{status:409});}
      if(this.byId(id)?.title!==expected)throw Object.assign(Error('刷新期间名称已变化，请重试'),{status:409});
    }
    const response=await api(`/api/history/${type}/${id}`, { method: 'PATCH', json: { title } });
    const echoed=response?.title ?? response?.entry?.title;
    if(typeof echoed==='string'&&echoed!==title)throw Object.assign(Error('服务器截断或修改了加密标题，未确认同步成功'),{status:422});
    if(await readTitle()!==title)throw Object.assign(Error('标题已提交但回读未确认，请重试；保留本地结果'),{status:409});
    // History may have replaced its objects while PATCH was in flight.
    const current=this.byId(id);if(current)current.title=title;
    const c = Chats.get(id); if (c) { c.title = title; c.emit(); }
    this.saveSoon?.();Bus.emit('history');
  },
  async remove(id) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(id))throw Error('该对话在批量指纹队列中，请先停止测试');
    await api('/api/chat/' + id, { method: 'DELETE' });
    try { LocalCache.drop([id]); } catch {}
    this.items = this.items.filter(e => e.id !== id); ArchiveHistory.drop([id]); this.bury([id]); this.saveSoon(); Bus.emit('history'); try { if (typeof AcctStats !== 'undefined') AcctStats.report?.(); } catch {}
  },
  async archive(id) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(id))throw Error('该对话在批量指纹队列中，请先停止测试');
    const entry=this.byId(id);
    await api('/api/chat/' + encodeURIComponent(id) + '/archive', { method: 'POST', headers: { Accept: 'application/json' } });
    if(entry)ArchiveHistory.add([entry]);
    try { Arch.add?.(id); } catch {}
    try { LocalCache.drop([id], { archived: true }); } catch {}
    this.bury([id]); this.items = this.items.filter(e => e.id !== id); this.saveSoon(); Bus.emit('history'); try { if (typeof AcctStats !== 'undefined') AcctStats.report?.(); } catch {}
  },
  async unarchive(id) {
    const entry = (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.byId?.(id)) || this.byId(id);
    const t = entry?.type || 'agentic';
    try {
      await api('/api/chat/' + encodeURIComponent(id) + '/unarchive', { method: 'POST', headers: { Accept: 'application/json' }, bg: true });
    } catch {
      await api('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', json: { isArchived: false }, bg: true });
    }
    const m = this.goneMap();
    if (m.has(id)) { m.delete(id); Store.set('histgone', Object.fromEntries(m)); }
    if (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.drop) ArchiveHistory.drop([id]);
    if (entry) {
      const restored = { ...entry, isArchived: false, archivedAt: null };
      if (!this.items.some(e => e.id === id)) this.items.unshift(restored);
      this.saveSoon();
    }
    Bus.emit('history');
    return true;
  },
  async pinCloud(id, isPinned) {
    if (!id) return false;
    const entry = this.byId(id), t = entry?.type || 'agentic';
    try {
      await api('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ isPinned: !!isPinned }), bg: true, noRelogin: true });
      if (entry) entry.isPinned = !!isPinned;
      return true;
    } catch { return false; }
  },
  async renamePlain(id, title) {
    const clean = String(title ?? '').trim().slice(0, 100);
    if (!clean) throw Error('会话标题不能为空');
    const entry = this.byId(id), t = entry?.type || 'agentic';
    await api('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ title: clean }), bg: true });
    if (entry) { entry.title = clean; entry.localTitle = clean; }
    const c = Chats.get(id); if (c) c.title = clean;
    this.saveSoon(); Bus.emit('history');
    return true;
  },
};

// ---------- 出口 IP ----------
// 重新渲染不丢滚动位置：弹窗 / 面板 / 排行等界面点一下就整块重建（replaceChildren），新建的滚动容器会回到顶部。
// 这里统一处理：在这些界面里重建前记下所有滚动过的容器（按在界面里的位置），重建后按原位置恢复上下 / 左右滚动。
// data-ks 的值 = 界面的「内容标识」（切换页签 / 对话时改变），变了就不恢复（换了内容应该从顶部开始）
const KS_SEL = '[data-ks], .modal-back, .dlg-back, #lppop, #gpop, .gacha, .lpick';
(() => {
  const nat = Element.prototype.replaceChildren; if (!nat || nat.__ks) return;
  const pathOf = (host, el) => { const p = []; for (let x = el; x !== host; x = x.parentElement) { const par = x.parentElement; if (!par) return null; p.push(Array.prototype.indexOf.call(par.children, x)); } return p.reverse(); };
  const at = (host, p) => { let x = host; for (const i of p) { x = x.children[i]; if (!x) return null; } return x; };
  const c1 = el => el.classList[0] || el.tagName;
  const f = function (...a) {
    const host = this.isConnected ? this.closest(KS_SEL) : null;
    if (!host) return nat.apply(this, a);
    const sig = host.dataset.ks ?? '', same = host._ks === undefined || host._ks === sig; host._ks = sig;
    const saved = [];
    if (same) { const scan = el => { if (el.scrollTop > 0 || el.scrollLeft > 0) { const p = pathOf(host, el); if (p) saved.push({ p, c: c1(el), t: el.scrollTop, l: el.scrollLeft }); } }; scan(host); for (const el of host.querySelectorAll('*')) scan(el); }
    const r = nat.apply(this, a);
    for (const s of saved) { const el = at(host, s.p); if (el && c1(el) === s.c) { if (s.t && el.scrollTop !== s.t) el.scrollTop = s.t; if (s.l && el.scrollLeft !== s.l) el.scrollLeft = s.l; } }
    return r;
  };
  f.__ks = true; Element.prototype.replaceChildren = f;
})();
// 送达状态每秒刷新一次（只改回复占位里的一行文字）
setInterval(() => { const el = document.querySelector('#view .typing-st'); if (!el) return; const c = typeof UI !== 'undefined' ? UI.els?.chat : null; const t = c?.dlvText?.() || ''; if (el.textContent !== t) el.textContent = t; }, 1000);
// 手机输入法占位：切换页面时焦点临时交给它，输入法不收起；换完页面还在它身上（比如切到抽卡页）就松开
const KB = {
  el: null,
  hold() {
    let e = this.el; if (!e || !e.isConnected) { e = this.el = document.createElement('textarea'); e.id = 'kbhold'; e.tabIndex = -1; e.setAttribute('aria-hidden', 'true'); document.body.append(e); }
    try { e.focus({ preventScroll: true }); } catch { e.focus(); }
    setTimeout(() => { if (document.activeElement === e) e.blur(); }, 0);
  },
};
const IP = {
  ip: null, loc: null, at: 0, checkedAt: 0, failures: 0, err: null, prev: null, fast: false, polling: null,
  poll() { return this.polling ||= this.poll1().finally(() => { this.polling = null; }); },
  // 当前连接的实时延迟：经账号线路请求一次 /cdn-cgi/trace（几百字节），只计耗时，不改出口状态
  rtt: 0, rttAt: 0, rttFail: 0, pinging: null,
  ping() {
    return this.pinging ||= (async () => {
      const t0 = performance.now();
      try {
        await NetPolicy.deadline(async signal => { const r = await rawFetch('/cdn-cgi/trace', { cache: 'no-store', signal }); await r.text(); }, { timeout: 6000 });
        // 单次采样抖动大：保留最近 5 次（3 分钟内、同一条线路），显示中位数
        const v = Math.max(1, Math.round(performance.now() - t0)), key = String(UI.host?.account?.proxy || '') + '|' + String(UI.host?.account?.proxyIp || '');
        if (this.rkey !== key) { this.rkey = key; this.samples = []; }
        this.samples = [...(this.samples || []).filter(x => now() - x.at < 180000), { v, at: now() }].slice(-5);
        const sorted = this.samples.map(x => x.v).sort((x, y) => x - y);
        this.rtt = sorted[Math.floor((sorted.length - 1) / 2)]; this.rttLast = v; this.rttFail = 0; this.reconcile();
      } catch { this.rtt = 0; this.rttFail++; }
      this.rttAt = now(); Bus.emit('rtt');
    })().finally(() => { this.pinging = null; });
  },
  // 实时延迟只在「当前这条线路」上测：它通，就是当前 ProxyIP 真的能用。
  // 池里这个 IP 的「不通 / 待检测」来自以前某次单独检测（独立的临时连接、有超时、会被 Brana 的验证页拦），不会自动更新，
  // 于是列表写「不通」、右下角却有延迟。实时测通了就把池里的状态一起更新，避免两边互相矛盾。
  liveFor(k) {
    const a = UI.host?.account, same = x => String(x || '').trim().toLowerCase();
    return a?.proxyIp && same(a.proxyIp) === same(k) && this.rtt > 0 && now() - this.rttAt < 30000 ? this.rtt : 0;
  },
  reconcile() {
    try {
      const k = String(UI.host?.account?.proxyIp || '').trim(), P = typeof Pool !== 'undefined' ? Pool : null, e = P?.d?.ips?.[k];
      if (!e || e.ok === true || e.gone || !this.rtt || this.rttFail) return;
      const rtt = this.rtt, eg = this.ip || '';
      void P.mutate(d => { const x = d.ips[k]; if (!x || x.ok === true) return; x.ok = true; x.ms = rtt; x.at = now(); x.err = ''; x.fc = 0; if (eg && !x.eg) x.eg = eg; }).catch(() => {});
    } catch {}
  },
  // 延迟探测失败但对话请求一直正常（45 秒内有成功）：不显示「超时」——探测本身被挤占，不是线路不通
  quietFail() { return !!this.rttFail && typeof NetHealth !== 'undefined' && NetHealth.recent(); },
  rttCls() { return this.rtt ? (this.rtt < 300 ? 'd-good' : this.rtt < 800 ? 'd-mid' : 'd-bad') : this.rttFail && !this.quietFail() ? 'd-fail' : ''; },
  rttText() { return this.rtt ? this.rtt + ' ms' : this.rttFail && !this.quietFail() ? '超时' : ''; },
  rttTip() { const xs = (this.samples || []).map(x => x.v); return xs.length ? '最近 ' + xs.length + ' 次：' + xs.join(' / ') + ' ms（显示中位数，30 秒测一次）' : ''; },
  async poll1() {
    try {
      // A trace failure is not a failed chat connection. Bound the whole read.
      const t = await NetPolicy.deadline(async signal => {
        const r = await rawFetch('/cdn-cgi/trace', { cache: 'no-store', signal });
        if (!r.ok) throw new HttpError(r.status, '出口检测失败');
        return r.text();
      }, { timeout: 12000 });
      const kv = Object.fromEntries(t.trim().split('\n').map(l => l.split('=')));
      if (!kv.ip || !/^[0-9a-f:.]+$/i.test(kv.ip)) throw new Error('出口检测未返回有效 IP');
      if (this.ip && kv.ip !== this.ip) { this.prev = this.ip; this.changedAt = now(); setTimeout(() => { Bus.emit('ipchange', kv.ip, this.prev); Acct.report(); }, 0); }
      const first = !this.ip; this.ip = kv.ip; this.loc = kv.loc; this.colo = kv.colo; this.err = null; this.failures = 0; this.at = now(); if (first) Acct.report();
    } catch (e) { this.err = describe(e); this.failures++; }
    finally { this.checkedAt = now(); }
    Bus.emit('ip');
  },
};

function describe(e) {
  if (!e) return '';
  if (e instanceof HttpError) {
    const b = String(e.body || '');
    if (e.status === 403 && /recaptcha/i.test(b)) return '人机验证未通过（reCAPTCHA）';
    if (e.status === 429) return '请求过于频繁（429）' + (b && !/^\s*[{<]/.test(b) ? '：' + b.slice(0, 120) : '');
    if (e.status === 401) return '未登录或登录已过期（401）';
    return `HTTP ${e.status}${b ? ' · ' + b.slice(0, 160) : ''}`;
  }
  return e.message || String(e);
}


// ---------- Chrome 扩展同构兼容层（让基于官网浏览器开发的 Chrome 扩展无需修改即可在客户端模式运行） ----------
const ExtCompat = {
  replayed: new Map(),
  syncUrl(sid) {
    try {
      const valid = typeof sid === 'string' && /^[0-9a-f-]{36}$/i.test(sid) ? sid : '';
      if (typeof document !== 'undefined' && document.documentElement) {
        if (valid) document.documentElement.dataset.mcpActiveSid = valid;
        else delete document.documentElement.dataset.mcpActiveSid;
      }
      if (typeof location !== 'undefined' && typeof history !== 'undefined' && location.pathname !== '/robots.txt' && /^\/(?:agent|c|chat)\//i.test(location.pathname)) {
        try { history.replaceState(null, '', '/robots.txt'); } catch {}
      }
      if (valid) {
        const tNow = now();
        if (this._lastSyncSid !== valid || (tNow - (this._lastSyncAt || 0) > 6000)) {
          this._lastSyncSid = valid;
          this._lastSyncAt = tNow;
          try { window.dispatchEvent(new CustomEvent('mcp-request-quota-infer', { detail: { sid: valid, sessionId: valid } })); } catch {}
        }
        const chat = typeof Chats !== 'undefined' ? Chats.get(valid) : null;
        if (chat && chat.loaded) this.replayChat(chat);
      }
    } catch {}
  },
  replayChat(chat, force = false) {
    try {
      if (!chat || !chat.sid || !Array.isArray(chat.messages) || !chat.messages.length) return;
      const sid = String(chat.sid).toLowerCase();
      const assistants = chat.messages.filter(m => m && m.role === 'assistant' && !m.metadata?.pending);
      if (!assistants.length) return;
      const sig = assistants.map(m => (m.id || '') + ':' + (m.parts?.length || 0)).join('|');
      if (!force && this.replayed.get(sid) === sig) return;
      this.replayed.set(sid, sig);

      const records = [];
      const toolIds = [];
      let sawReasoning = false, reasoningDeltaCount = 0, reasoningTextLength = 0;
      let textDeltaCount = 0, textDeltaChars = 0, bashToolCount = 0, preToolTextChars = 0, interToolTextChars = 0;
      let seq = 1;
      const MAX_REPLAY_RECORDS = 240;
      for (const m of assistants) {
        let seenToolInTurn = false, pendingInterText = 0;
        const ts = m.metadata?.timing?.completedAt || m.metadata?.timing?.startedAt || Date.now();
        if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'start', messageId: m.id } }) });
        for (const p of m.parts || []) {
          if (!p || !p.type) continue;
          if (p.type === 'reasoning') {
            sawReasoning = true;
            if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'reasoning-start', id: p.id || 'r' + seq } }) });
            const rtxt = String(p.text || '');
            if (rtxt) {
              reasoningDeltaCount++;
              reasoningTextLength += rtxt.length;
              if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'reasoning-delta', delta: rtxt.length > 2048 ? rtxt.slice(0, 2048) : rtxt } }) });
            }
          } else if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') {
            if (seenToolInTurn) { interToolTextChars += pendingInterText; pendingInterText = 0; }
            seenToolInTurn = true;
            const tid = p.toolCallId || p.id || '';
            if (tid && !toolIds.includes(tid)) toolIds.push(tid);
            const tName = p.toolName || String(p.type).replace(/^tool-/, '');
            if (/bash|shell|run_command/i.test(tName)) bashToolCount++;
            if (records.length < MAX_REPLAY_RECORDS) {
              const rawIn = p.input ?? p.inputText ?? {};
              const liteIn = typeof rawIn === 'string'
                ? (rawIn.length > 512 ? rawIn.slice(0, 512) : rawIn)
                : (rawIn && typeof rawIn === 'object' ? { command: typeof rawIn.command === 'string' ? rawIn.command.slice(0, 256) : undefined, path: rawIn.path || rawIn.file_path } : {});
              records.push({
                seq_num: seq++,
                timestamp: ts,
                body: JSON.stringify({
                  data: {
                    type: 'tool-input-start',
                    toolCallId: tid,
                    toolName: tName,
                    input: liteIn
                  }
                })
              });
            }
          } else if (p.type === 'text' && p.text) {
            const txt = String(p.text);
            textDeltaCount++;
            textDeltaChars += txt.length;
            const trimmed = txt.trim().length;
            if (!seenToolInTurn) preToolTextChars += trimmed;
            else pendingInterText += trimmed;
            if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'text-delta', delta: txt.length > 2048 ? txt.slice(0, 2048) : txt } }) });
          }
        }
        if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, headers: [['trigger-control', 'turn-complete']], body: JSON.stringify({ data: { type: 'finish', messageId: m.id } }) });
      }

      let prevMemo = (window.__atiSseMemo instanceof Map ? window.__atiSseMemo.get(sid) : window.__atiSseMemo?.[sid]) || null;
      if (!prevMemo) { try { prevMemo = JSON.parse(localStorage.getItem('ati.v4.sseMemo.' + sid) || 'null'); } catch {} }
      const msgFmts = assistants.map(m => m?._fmt).filter(Boolean);
      const fmt = chat.fmt || msgFmts.at(-1) || null;
      let fmtTN = 0, fmtTChars = 0, fmtRN = 0, fmtRE = 0, fmtRChars = 0;
      const fmtIds = [];
      for (const fObj of (chat.fmt && !msgFmts.includes(chat.fmt) ? [...msgFmts, chat.fmt] : msgFmts)) {
        fmtTN += Number(fObj?.tN) || 0;
        fmtTChars += Number(fObj?.tChars) || 0;
        fmtRN += Number(fObj?.rN) || 0;
        fmtRE += Number(fObj?.rE || fObj?.rBlocks) || 0;
        fmtRChars += Number(fObj?.rChars) || 0;
        if (Array.isArray(fObj?.ids)) {
          for (const pair of fObj.ids) {
            const idStr = String((pair && pair[1]) || '');
            if (idStr && !fmtIds.includes(idStr)) fmtIds.push(idStr);
          }
        }
      }
      const isPollutedPrevMemo = Boolean(
        prevMemo &&
        Number(prevMemo.textDeltaCount) > 0 &&
        Number(prevMemo.textDeltaCount) <= Math.max(2, assistants.length * 2) &&
        Number(prevMemo.avgChunk) > 220 &&
        (fmtTN === 0 || fmtTN > Number(prevMemo.textDeltaCount))
      );
      const prevValidDeltaCount = isPollutedPrevMemo ? 0 : (Number(prevMemo?.textDeltaCount) || 0);
      const prevValidDeltaChars = isPollutedPrevMemo ? 0 : (Number(prevMemo?.textDeltaChars) || 0);
      const prevValidAvgChunk = isPollutedPrevMemo ? null : (Number(prevMemo?.avgChunk) || null);
      const effDeltaCount = Math.max(fmtTN, prevValidDeltaCount);
      const effDeltaChars = fmtTN > 0 ? Math.max(fmtTChars, prevValidDeltaChars) : Math.max(prevValidDeltaChars, textDeltaChars);
      const streamIds = (Array.isArray(prevMemo?.streamIds) && prevMemo.streamIds.length) ? prevMemo.streamIds : fmtIds;
      const tStart = Number(fmt?.t0 || fmt?.tStart) || 0;
      const durSec = fmt && fmt.tEnd > tStart ? (fmt.tEnd - tStart) / 1000 : (fmt?.gen > 0 ? fmt.gen / 1000 : 0);
      const liveCps = durSec >= 0.5 && (fmtTChars || fmt?.tChars || textDeltaChars) >= 60 ? Math.round((fmtTChars || fmt?.tChars || textDeltaChars) / durSec) : (prevMemo?.cps || null);
      const effSawReason = Boolean(sawReasoning || prevMemo?.sawReasoning || fmtRN > 0 || fmtRE > 0 || (fmt && (fmt.rBlocks || fmt.rN || fmt.rE)));
      const effReasonChars = Math.max(reasoningTextLength, Number(prevMemo?.reasoningTextLength) || 0, fmtRChars, Number(fmt?.rChars) || 0);
      let streamIdPrefix = prevMemo?.streamIdPrefix || null;
      if (!streamIdPrefix && streamIds.length) {
        if (streamIds.some(i => /^(?:msg|rs)_[0-9a-f]{16,}/i.test(i))) streamIdPrefix = 'openai-rs';
        else if (streamIds.some(i => /^tc_[A-Za-z0-9_-]{10,}$/.test(i)) && effReasonChars === 0 && effSawReason) streamIdPrefix = 'openai-tc-empty';
      }
      const memo = {
        sid,
        toolIds: toolIds.length ? toolIds : (prevMemo?.toolIds || []),
        streamIds,
        textDeltaCount: effDeltaCount,
        textDeltaChars: effDeltaChars,
        firstDeltaAt: prevMemo?.firstDeltaAt || (tStart || Date.now() - 1000),
        lastDeltaAt: fmt?.tEnd || Date.now(),
        sawReasoning: effSawReason,
        reasoningDeltaCount: Math.max(reasoningDeltaCount, Number(prevMemo?.reasoningDeltaCount) || 0, fmtRN),
        reasoningTextLength: effReasonChars,
        bashToolCount: Math.max(bashToolCount, Number(prevMemo?.bashToolCount) || 0),
        preToolTextChars,
        interToolTextChars,
        seenToolInTurn: (toolIds.length || prevMemo?.toolIds?.length) > 0,
        pendingInterText: 0,
        avgChunk: (fmtTN >= 3 && fmtTChars > 0)
          ? +(fmtTChars / fmtTN).toFixed(2)
          : (prevValidAvgChunk || (effDeltaCount >= 6 && effDeltaChars > 0 ? +(effDeltaChars / effDeltaCount).toFixed(2) : null)),
        cps: liveCps,
        silentBashLoop: bashToolCount >= 2 && preToolTextChars === 0 && interToolTextChars === 0,
        reasoningSignature: prevMemo?.reasoningSignature && prevMemo.reasoningSignature !== 'none'
          ? prevMemo.reasoningSignature
          : (!effSawReason ? 'none' : (!reasoningDeltaCount ? 'markers-only' : (effReasonChars > 0 ? 'visible-text' : 'empty-deltas'))),
        streamIdPrefix,
        updatedAt: Date.now()
      };
      if (window.__atiSseMemo instanceof Map) window.__atiSseMemo.set(sid, memo);
      try { localStorage.setItem('ati.v4.sseMemo.' + sid, JSON.stringify(memo)); } catch {}

      const sseBody = 'data: ' + JSON.stringify({ records }) + '\n\ndata: [DONE]\n\n';
      const outUrl = `${ORIGIN}/ai-proxy/realtime/v1/sessions/${sid}/out`;
      const payload = {
        url: outUrl,
        pageHost: (typeof location !== 'undefined' && location.hostname) || 'arena.ai',
        pageUrl: `${ORIGIN}/c/${sid}`,
        method: 'GET',
        status: 200,
        statusText: 'OK',
        durationMs: 12,
        requestHeaders: { accept: 'text/event-stream' },
        responseHeaders: { 'content-type': 'text/event-stream' },
        originProbe: { contentType: 'text/event-stream' },
        requestBody: null,
        responseBody: sseBody.slice(0, 512 * 1024),
        ts: Date.now(),
        via: 'fetch'
      };
      try {
        const liteMsgs = chat.messages.slice(-30).map(m => !m ? m : ({
          id: m.id,
          role: m.role,
          metadata: m.metadata,
          parts: (m.parts || []).slice(0, 40).map(p => !p ? p : ({
            type: p.type,
            id: p.id,
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            state: p.state,
            text: typeof p.text === 'string' && p.text.length > 2048 ? p.text.slice(0, 2048) : p.text
          }))
        }));
        window.__next_f = [[1, '1:' + JSON.stringify({ chatId: sid, id: sid, messages: liteMsgs, pagination: { hasMore: !!chat.hasMore, cursor: chat.cursor || null } }) + '\n']];
      } catch {}
      window.postMessage({ __arenaDetector: 'ARENA_DETECTOR_V2_CAPTURE', payload }, '*');
      setTimeout(() => { try { window.__arenaBashTranslate?.scan?.(); } catch {} }, 60);
    } catch {}
  }
};
try {
  window.addEventListener('mcp-gacha-cmd', ev => {
    const d = ev?.detail || {};
    if (d.action === 'open' && d.sid && typeof Tabs !== 'undefined') { Tabs.open(d.sid); return; }
    if (typeof Gacha === 'undefined') return;
    if (d.action === 'stop') { Gacha.stop(); return; }
    if (d.action === 'start') {
      if (d.maxRolls) Gacha.save({ maxAttempts: [5, 15, 30].includes(+d.maxRolls) ? +d.maxRolls : 5, archiveOn: d.autoArchive !== false, stopOnThinking: d.abortPlain !== false });
      const r = Gacha.start();
      if (!r?.ok) window.dispatchEvent(new CustomEvent('mcp-gacha-state', { detail: { busy: false, status: r?.error || '启动失败' } }));
    }
  });
  Bus.on('gacha', () => {
    try {
      if (typeof Gacha === 'undefined') return;
      const run = Gacha.run, busy = Gacha.busy();
      if (run && Array.isArray(run.attempts)) {
        const rows = run.attempts.slice(-12).reverse().map(a => ({
          sid: a.sid || '',
          model: a.model || (a.done ? '未识别' : '识别中…'),
          status: a.verdict === 'hit' ? '🎯 命中' : a.verdict === 'archive' ? '已归档' : a.verdict === 'keep' ? '保留' : (a.phase || ''),
          fitScore: Models.get(a.sid || '')?.confidence != null ? Math.round(Models.get(a.sid || '').confidence) : null
        }));
        localStorage.setItem('mcpLive.gacha.v1', JSON.stringify(rows));
      }
      window.dispatchEvent(new CustomEvent('mcp-gacha-state', {
        detail: {
          busy,
          attempt: (run?.completed || 0) + (busy ? 1 : 0),
          maxRolls: run?.settings?.maxAttempts || 5,
          status: run?.phase || run?.reason || (busy ? '抽卡进行中…' : '已就绪')
        }
      }));
    } catch {}
  });
} catch {}
window.__ancExtCompat = ExtCompat;
try {
  window.addEventListener('mcp-quota-inferred', e => {
    const d = e?.detail;
    if (!d || !d.sid || !d.model) return;
    const conf = Number(d.confidence ?? d.fitScore ?? 0);
    if (conf < 75) return;
    const ch = typeof Chats !== 'undefined' ? Chats.get(d.sid) : null;
    if (typeof BillingProbe !== 'undefined' && ch) {
      const bpCands = BillingProbe.summary?.(d.sid)?.diagnostics?.candidates;
      if (Array.isArray(bpCands) && bpCands.length) {
        BillingProbe.applyReverseIdentity?.(ch, { interactive: false });
        return;
      }
    }
    const rawLabel = d.displayName || d.label || d.model;
    const canonName = (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawLabel) : rawLabel;
    // 出现开源思考时直接排除闭源型号（防止扩展投机流或旧结果把开源模型改成闭源模型）
    if (ch && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(ch)?.kind === 'compat-thinking') {
      const vid = (typeof Brand !== 'undefined' && Brand.of) ? Brand.of(canonName || rawLabel || d.model) : '';
      if (['claude', 'openai', 'gemini', 'grok'].includes(vid) || /claude|opus|sonnet|haiku|fable|gpt-|o3|o4|gemini|argon|barium|grok/i.test(String(canonName + ' ' + rawLabel + ' ' + d.model))) {
        return;
      }
    }
    const old = Models.get(d.sid);
    if (old && (old.userCorrected || (!old.guess && !old.fromTitle && !old.reverseInferred && !old.habitInferred && !old.billingProbe && (old.response || (old.internal && !old.billingProbe) || old.fingerprint?.apiIdentity)))) return;
    const pend = Boolean(d.pendingConfirm || (d.tiedCount && d.tiedCount > 1) || conf < 88);
    Models.set(d.sid, {
      ...(old || {}),
      name: pend ? '' : canonName,
      candidateName: canonName,
      rawLabel,
      reverseCandidateId: d.id || d.model,
      internal: pend ? '' : d.model,
      provider: pend ? '费用反推识别（请继续沟通）' : '费用反推识别',
      why: pend ? '候选模型权重接近，请继续沟通以锁定唯一模型' : ('由第一方 /cost 账单 5 层漏斗反推锁定（吻合度 ' + conf.toFixed(1) + '%）'),
      sure: !pend && conf >= 95,
      guess: pend,
      pendingConfirm: pend,
      fromTitle: false,
      reverseInferred: true,
      billingProbe: true,
      reverseMatch: conf,
      confidence: conf
    });
    if (!pend && typeof Titles !== 'undefined' && Titles.touch) {
      try { Titles.touch(d.sid); Titles.kick(true); } catch {}
    } else {
      try { UI.renderListSoon?.(); UI.renderTabs?.(); } catch {}
    }
    try { Chats.get(d.sid)?.emit?.(); Dock.soon?.(); } catch {}
  });
} catch {}


// 向心弹出定位：根据触发锚点在窗口所处象限（左下→右上、左上→右下、右下→左上、右上→左下）向窗口中心方向弹出，并严格限制在窗口可视边界内
function placeInward(pop, anchorOrRect, opts = {}) {
  if (!pop) return;
  const pad = opts.pad ?? 8, gap = opts.gap ?? 6;
  const vw = Math.max(200, window.innerWidth || document.documentElement.clientWidth || 800);
  const vh = Math.max(160, window.innerHeight || document.documentElement.clientHeight || 600);
  const r = anchorOrRect?.getBoundingClientRect ? anchorOrRect.getBoundingClientRect()
    : (anchorOrRect && typeof anchorOrRect.left === 'number' ? {
        left: anchorOrRect.left,
        top: anchorOrRect.top ?? anchorOrRect.bottom ?? 0,
        right: anchorOrRect.right ?? anchorOrRect.left,
        bottom: anchorOrRect.bottom ?? anchorOrRect.top ?? 0,
        width: anchorOrRect.width ?? 0,
        height: anchorOrRect.height ?? 0,
      } : { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2, width: 0, height: 0 });
  const ax = (r.left + (r.right ?? r.left)) / 2;
  const ay = (r.top + (r.bottom ?? r.top)) / 2;
  const isLeft = opts.preferX ? opts.preferX === 'right' : ax <= vw / 2;
  const isTop = opts.preferY ? opts.preferY === 'down' : ay <= vh / 2;
  const maxW = Math.max(140, vw - pad * 2);
  if (!opts.keepWidth) pop.style.maxWidth = maxW + 'px';
  const rect = pop.getBoundingClientRect();
  const w = Math.min(maxW, Math.ceil(rect.width || pop.offsetWidth || opts.fallbackW || 220));
  let left = isLeft ? r.left : ((r.right ?? r.left) - w);
  left = Math.max(pad, Math.min(left, vw - w - pad));
  pop.style.left = Math.round(left) + 'px';
  pop.style.right = 'auto';
  const availBelow = Math.max(80, vh - (r.bottom ?? r.top) - gap - pad);
  const availAbove = Math.max(80, (r.top ?? 0) - gap - pad);
  const openDown = isTop ? (availBelow >= Math.min(160, availAbove) || availBelow >= (rect.height || 180)) : (availAbove < 120 && availBelow > availAbove);
  if (!opts.keepHeight) {
    const mh = Math.max(120, openDown ? availBelow : availAbove);
    pop.style.maxHeight = Math.min(vh - pad * 2, Math.max(mh, Math.min(320, vh - pad * 2))) + 'px';
  }
  const hNow = Math.min(vh - pad * 2, Math.ceil(pop.getBoundingClientRect().height || pop.offsetHeight || opts.fallbackH || 180));
  if (opts.useBottom && !openDown) {
    const bot = Math.max(pad, Math.min(vh - (r.top ?? 0) + gap, vh - hNow - pad));
    pop.style.bottom = Math.round(bot) + 'px';
    pop.style.top = 'auto';
  } else {
    let top = openDown ? ((r.bottom ?? r.top) + gap) : ((r.top ?? 0) - hNow - gap);
    top = Math.max(pad, Math.min(top, vh - hNow - pad));
    pop.style.top = Math.round(top) + 'px';
    pop.style.bottom = 'auto';
  }
  pop.style.transformOrigin = (openDown ? 'top ' : 'bottom ') + (isLeft ? 'left' : 'right');
}
globalThis.placeInward = placeInward;
