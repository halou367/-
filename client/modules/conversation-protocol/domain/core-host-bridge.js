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
    if (/\/nextjs-api\/stream\/(create-evaluation|post-to-evaluation|retry-evaluation)/.test(u)) return '对战/直连生成';
    if (/\/api\/evaluation\//.test(u)) return '读取评测对话';
    if (/\/nextjs-api\/model-catalog/.test(u)) return '模型目录';
    if (/\/nextjs-api\/auto-modality/.test(u)) return '模态路由';
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
      if (typeof b === 'string') return b.length > 4096 ? b.length : new TextEncoder().encode(b).length;
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
          if (o && o._selfTrackDown) return end();
          const cl = Number(r?.headers?.get?.('content-length') || 0);
          if (cl > 0 && !/text\/event-stream/i.test(r?.headers?.get?.('content-type') || '')) {
            this.down += cl; this.lastDownAt = now(); this.add(kd, 0, cl); return end();
          }
          const c = r && r.clone ? r.clone() : null, rd = c && c.body && c.body.getReader ? c.body.getReader() : null;
          if (!rd) return end();
          const pump = () => rd.read().then(x => {
            if (x.done) return end();
            const k = x.value && x.value.byteLength || 0;
            if (k) { this.down += k; this.lastDownAt = now(); this.add(kd, 0, k); }
            return pump();
          }, end);
          pump();
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
function _canUseProtoFetch(u, o) {
  if (typeof window === 'undefined' || typeof Host === 'undefined' || typeof Host?.protoFetch !== 'function') return '';
  if (window.__fixture || window.__routeFixture || typeof window.__capFetch === 'function') return '';
  const wf = window.fetch;
  if (typeof wf === 'function' && wf !== _rawFetch && wf !== window.__ancPinFetchFn) return '';
  let rel = '';
  if (typeof u === 'string') {
    if (u.startsWith('/') && !u.startsWith('//')) rel = u;
    else if (/^https:\/\/arena\.ai\//i.test(u)) rel = u.replace(/^https:\/\/arena\.ai/i, '');
  }
  if (!rel) return '';
  if (/^\/(?:nextjs-api\/stream|api\/stream|ai-proxy\/realtime)\b/i.test(rel)) return '';
  if (/\/out(?:\?|$)/i.test(rel)) return '';
  const body = o?.body;
  if (body != null && typeof body !== 'string') return '';
  const hdrs = o?.headers || {};
  const accept = String(hdrs.Accept || hdrs.accept || '');
  if (/text\/event-stream/i.test(accept)) return '';
  if (/^\/(?:nextjs-api|api|cdn-cgi\/trace)\b/i.test(rel)) return rel;
  return '';
}
const _doExtFetch = (u, o) => {
  const absU = typeof u === 'string' && u.startsWith('/') ? ORIGIN + u : u;
  const wf = window.fetch;
  if (typeof wf === 'function' && wf !== window.__ancPinFetchFn && !window.__ancInExtFetch) {
    window.__ancInExtFetch = true;
    try { return wf.call(window, absU, o); }
    finally { window.__ancInExtFetch = false; }
  }
  const protoRel = _canUseProtoFetch(u, o);
  if (protoRel) {
    const signal = o?.signal;
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const hdrObj = {};
    if (o?.headers) {
      if (typeof o.headers.forEach === 'function') o.headers.forEach((v, k) => { hdrObj[k] = v; });
      else if (typeof o.headers === 'object') Object.assign(hdrObj, o.headers);
    }
    const isAuth = /^\/nextjs-api\/(?:sign-in|sign-up|reset-password|resend-verification|account\/password)\b/i.test(protoRel);
    const timeout = isAuth ? 18000 : protoRel === '/cdn-cgi/trace' ? 6000 : 20000;
    const pCall = Host.protoFetch(protoRel, {
      method: o?.method || 'GET',
      headers: hdrObj,
      body: typeof o?.body === 'string' ? o.body : undefined,
      accept: hdrObj.Accept || hdrObj.accept || undefined,
      contentType: hdrObj['Content-Type'] || hdrObj['content-type'] || undefined,
      vdpl: (!isAuth && typeof Pin !== 'undefined' && Pin.on?.() && !Pin.held && Pin.id) ? Pin.id : '',
      timeout,
    });
    const raced = signal ? new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      pCall.then(
        res => { signal.removeEventListener('abort', onAbort); resolve(res); },
        err => { signal.removeEventListener('abort', onAbort); reject(err); }
      );
    }) : pCall;
    return raced.then(pr => {
      if (!pr || pr.fallback) return _rawFetch(absU, o);
      const h = new Headers();
      if (pr.headers && typeof pr.headers === 'object') {
        for (const [k, v] of Object.entries(pr.headers)) if (v) h.set(k, String(v));
      } else {
        if (pr.contentType) h.set('content-type', String(pr.contentType));
        if (pr.retryAfter) h.set('retry-after', String(pr.retryAfter));
      }
      return new Response(pr.text ?? '', { status: Number(pr.status) || 200, headers: h });
    });
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
  if (_costFetchCache.size > 256) _costFetchCache.delete(_costFetchCache.keys().next().value);
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
    // 403/409 单次重放恢复：仅在当前部署 ID 并非默认计费部署或状态为 409 时单次重放，杜绝同部署 ID 403 重复发两次
    if (snap.status === 403 || snap.status === 409) {
      try { window.__ancPin?.ensure?.(true); } catch {}
      const replayDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      if (effDpl !== replayDpl || snap.status === 409) {
        const replayHeaders = Object.assign({}, effHeaders, { 'x-deployment-id': replayDpl });
        delete replayHeaders['x-arena-web-deployment'];
        const replayOpts = Object.assign({}, effOpts, { headers: replayHeaders });
        snap = await runOnce(effU, replayOpts);
      }
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
      c.backoffUntil = now() + 180000;
      _costFetchCache.set(sid, c);
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
      fetchText: A.fetchStart ? async (url, o) => { let id; try { id = o?.bearer ? (A.fetchAuthStart ? A.fetchAuthStart(String(url), String(o.bearer)) : null) : o?.method === 'POST' ? (o?.direct && A.fetchPostDirectStart ? A.fetchPostDirectStart(String(url), String(o.body || ''), String(o.type || '')) : A.fetchPostStart ? A.fetchPostStart(String(url), String(o.body || ''), String(o.type || '')) : null) : o?.direct ? (A.fetchDirectStart ? A.fetchDirectStart(String(url)) : null) : A.fetchStart(String(url)); if (!id) return { error: '此版本不支持' }; } catch (e) { return { error: String(e.message || e) }; } for (let i = 0, n = o?.long ? 480 : 80; i < n; i++) { await sleep(250); let r; try { r = A.probeGet(id); } catch (e) { return { error: String(e.message || e) }; } if (r) { try { return JSON.parse(r); } catch { return { error: '解析失败' }; } } } return { error: '超时' }; } : null,
      ippureDirect: async ip => {
        const qIp = String(ip || '').trim().replace(/^\[|\]$/g, '');
        if (!qIp) return null;
        if (typeof A.ippureDirectStart === 'function') {
          try {
            const id = A.ippureDirectStart(qIp);
            if (id) {
              for (let i = 0; i < 60; i++) {
                await sleep(200);
                const r = A.probeGet(id);
                if (r) {
                  const j = JSON.parse(r);
                  if (j && Number.isFinite(+j.fs)) return j;
                  break;
                }
              }
            }
          } catch {}
        }
        if (!A.fetchDirectStart && !A.fetchStart) return null;
        const ft = async u => {
          try {
            const id = A.fetchDirectStart ? A.fetchDirectStart(String(u)) : A.fetchStart(String(u));
            if (!id) return null;
            for (let i = 0; i < 32; i++) {
              await sleep(200);
              const r = A.probeGet(id);
              if (r) { const j = JSON.parse(r); return j?.text ? String(j.text) : null; }
            }
          } catch {}
          return null;
        };
        const [scHtml, pcRaw, iaRaw] = await Promise.all([
          ft('https://scamalytics.com/ip/' + encodeURIComponent(qIp)),
          ft('https://proxycheck.io/v2/' + encodeURIComponent(qIp) + '?vpn=1&asn=1&risk=1'),
          ft('http://ip-api.com/json/' + encodeURIComponent(qIp) + '?fields=status,query,isp,org,as,mobile,proxy,hosting')
        ]);
        let sc = null;
        if (scHtml) {
          const m = scHtml.match(/"score"\s*:\s*"(\d{1,3})"/) || scHtml.match(/Fraud Score:\s*(\d{1,3})/i);
          if (m) {
            const fsVal = Math.min(100, Math.max(0, parseInt(m[1], 10)));
            const row = lbl => { const rm = scHtml.match(new RegExp('<th[^>]*>\\s*' + lbl + '\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>', 'i')); return rm ? rm[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : ''; };
            const yn = lbl => { const rm = scHtml.match(new RegExp('<th[^>]*>\\s*' + lbl + '\\s*<\\/th>\\s*<td[^>]*>\\s*<div[^>]*>\\s*(Yes|No)\\s*<\\/div>', 'i')); return rm ? rm[1].toLowerCase() === 'yes' : null; };
            const org = (row('Organization') || row('ISP Name') || '').replace(/^n\/a$/i, '').slice(0, 48);
            const dc = Boolean(yn('Server') || yn('Datacenter') || /cloud|datacenter|hosting|server|digitalocean|linode|vultr|choopa|hetzner|ovh|amazonaws|google|microsoft|azure|oracle|alibaba|tencent|cloudflare|leaseweb|contabo|zenlayer|cogent|multacom|sharktech|psychz|colocrossing|dmit|bandwagon|it7|kurun|racknerd|kamatera|ucloud|akari|akile|xstream|hivelocity|velia|m247|tzulo|datapacket|constant|equinix|latitude|gcore|ionos/i.test(org));
            const px = Boolean(yn('Anonymizing VPN') || yn('Tor Exit Node') || yn('Public Proxy') || yn('Web Proxy'));
            sc = { fs: fsVal, dc, px, res: Boolean(!dc && !px && fsVal <= 25), org };
          }
        }
        let x = null, ia = null;
        try { const pj = pcRaw ? JSON.parse(pcRaw) : null; x = pj && typeof pj[qIp] === 'object' ? pj[qIp] : null; } catch {}
        try { const ij = iaRaw ? JSON.parse(iaRaw) : null; ia = ij && ij.status === 'success' ? ij : null; } catch {}
        if (!sc && !x && !ia) return null;
        const risk = x ? Math.min(100, Math.max(0, +x.risk || 0)) : 0;
        const type = String(x?.type || '').toLowerCase();
        const org = String(sc?.org || x?.organisation || x?.provider || x?.isp || ia?.isp || ia?.org || '').slice(0, 48);
        const dcRe = /hosting|vpn|business|datacenter|cloud|server|digitalocean|linode|vultr|choopa|hetzner|ovh|amazonaws|google|microsoft|azure|oracle|alibaba|tencent|cloudflare|leaseweb|contabo|zenlayer|cogent|multacom|sharktech|psychz|colocrossing|dmit|bandwagon|it7|kurun|racknerd|kamatera|ucloud|akari|akile|xstream|hivelocity|velia|m247|tzulo|datapacket|constant|equinix|latitude|gcore|ionos/i;
        const dc = Boolean(sc?.dc || ia?.hosting || /hosting|vpn|business|datacenter|cloud/i.test(type) || dcRe.test(org));
        const px = Boolean(sc?.px || x?.proxy === 'yes' || ia?.proxy || /vpn|tor|proxy/i.test(type));
        const res = Boolean(!dc && !px && (sc?.res || /residential|wireless|mobile/i.test(type) || ia?.mobile));
        let ipHash = 0;
        for (let i = 0; i < qIp.length; i++) ipHash = ((ipHash << 5) - ipHash + qIp.charCodeAt(i)) | 0;
        const dcSpread = Math.abs(ipHash) % 7;
        let fs = sc ? sc.fs : 0;
        if (!sc) {
          if (risk > 0) fs = Math.max(risk, px ? 35 : 0);
          else if (px) fs = 28;
          else fs = dc ? (11 + dcSpread) : res ? (4 + (Math.abs(ipHash) % 4)) : (8 + (Math.abs(ipHash) % 5));
        } else {
          if (risk > fs) fs = Math.round(fs * 0.4 + risk * 0.6);
          if (px && fs < 28) fs = 28;
          if (dc && fs === 0) fs = 10 + dcSpread;
        }
        return { fs: Math.min(100, Math.max(0, fs)), ip: qIp, res, bc: Boolean(dc && px), dc, org, real: 1, via: sc ? 'scamalytics' : 'ippure' };
      },
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
const _storeRawCache = new Map();
const _storeReadOnlyKeys = new Set(['prefs', 'proto:schema', 'gacha:settings']);
try {
  if (typeof localStorage !== 'undefined') {
    const lruRaw = localStorage.getItem('anc:mc:hot:lru');
    const keepHot = new Set(lruRaw ? (JSON.parse(lruRaw) || []).slice(-2).map(id => 'anc:mc:hot:' + id) : []);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const lk = localStorage.key(i);
      if (!lk) continue;
      if (lk.startsWith('anc:mc:hot:') && lk !== 'anc:mc:hot:lru' && !keepHot.has(lk)) {
        localStorage.removeItem(lk);
      } else if (lk === 'anc:habitLearnBank:v1') {
        const hv = localStorage.getItem(lk);
        if (hv && hv.length > 250000) localStorage.removeItem(lk);
      } else if (lk.startsWith('anc:hist:')) {
        const histRaw = localStorage.getItem(lk);
        if (histRaw && histRaw.length > 350000) {
          const hp = JSON.parse(histRaw);
          if (hp && Array.isArray(hp.items) && hp.items.length > 600) {
            hp.items = hp.items.slice(0, 600);
            localStorage.setItem(lk, JSON.stringify(hp));
          }
        }
      }
    }
  }
} catch {}
const Store = {
  _writeSeq: 0,
  get(k, d) {
    try {
      const v = localStorage.getItem('anc:' + k);
      if (v == null) { _storeRawCache.delete(k); return d; }
      if (v.length > 16384) {
        _storeRawCache.delete(k);
        return JSON.parse(v);
      }
      const hit = _storeRawCache.get(k);
      if (hit && hit.raw === v) {
        if (hit.val == null || typeof hit.val !== 'object' || _storeReadOnlyKeys.has(k) || k.startsWith('lastnode:')) return hit.val;
        return JSON.parse(v);
      }
      const val = JSON.parse(v);
      while (_storeRawCache.size >= 32) _storeRawCache.delete(_storeRawCache.keys().next().value);
      _storeRawCache.set(k, { raw: v, val });
      if (val == null || typeof val !== 'object' || _storeReadOnlyKeys.has(k) || k.startsWith('lastnode:')) return val;
      return JSON.parse(v);
    } catch { return d; }
  },
  freeQuotaBloat(keepKey) {
    try {
      const target = 'anc:' + keepKey;
      if ('anc:cap' !== target) try { localStorage.removeItem('anc:cap'); _storeRawCache.delete('cap'); } catch {}
      if ('anc:pelican-shots' !== target) {
        try {
          const ps = localStorage.getItem('anc:pelican-shots');
          if (ps && ps.length > 600000) { localStorage.removeItem('anc:pelican-shots'); _storeRawCache.delete('pelican-shots'); }
        } catch {}
      }
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const lk = localStorage.key(i);
        if (lk && lk !== target && (lk.startsWith('anc:trace:') || lk === 'anc:str:samples' || lk === 'anc:billing:costDocCache' || lk.startsWith('arena:evaluation-session-cache:v1:'))) keys.push(lk);
      }
      for (const lk of keys) {
        try {
          localStorage.removeItem(lk);
          if (lk.startsWith('anc:')) _storeRawCache.delete(lk.slice(4));
        } catch {}
      }
    } catch {}
  },
  setRaw(k, raw, v) {
    this._writeSeq = (this._writeSeq || 0) + 1;
    try {
      localStorage.setItem('anc:' + k, raw);
      if (raw.length > 16384) {
        _storeRawCache.delete(k);
        return true;
      }
      while (_storeRawCache.size >= 32) _storeRawCache.delete(_storeRawCache.keys().next().value);
      _storeRawCache.set(k, { raw, val: v });
      return true;
    } catch {
      this.freeQuotaBloat(k);
      try {
        localStorage.setItem('anc:' + k, raw);
        _storeRawCache.set(k, { raw, val: v });
        return true;
      } catch { return false; }
    }
  },
  set(k, v) {
    return this.setRaw(k, JSON.stringify(v), v);
  },
  del(k) {
    this._writeSeq = (this._writeSeq || 0) + 1;
    _storeRawCache.delete(k);
    try { localStorage.removeItem('anc:' + k); } catch {}
  },
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
  _phMemoKey: '', _phMemoRaw: '',
  // 6层幂等自愈注入：localStorage PostHog flags + ph-toolbar-overrides Cookie + arena_build_bucket=stable + window.posthog.featureFlags.override + __vdpl
  ensureBillingFlags(force = false) {
    if (typeof location === 'undefined' || location.hostname !== 'arena.ai') return;
    try {
      const ov = this.OVERRIDES || { 'credit-system-m1': 'cost-shown', 'credit-system-m2': 'limits-enabled' };
      // 1. localStorage PostHog 持久化对象深度合并
      let patchedLs = false;
      if (!force && this._phMemoKey && this._phMemoRaw && localStorage.getItem(this._phMemoKey) === this._phMemoRaw) {
        patchedLs = true;
      } else {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !/^ph_.*_posthog$/.test(k)) continue;
          try {
            let raw = localStorage.getItem(k) || '{}';
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
              const cur = obj.$override_feature_flags || {};
              if (force || cur['credit-system-m1'] !== 'cost-shown' || cur['credit-system-m2'] !== 'limits-enabled') {
                obj.$override_feature_flags = Object.assign({}, cur, ov);
                raw = JSON.stringify(obj);
                localStorage.setItem(k, raw);
              }
              this._phMemoKey = k;
              this._phMemoRaw = raw;
              patchedLs = true;
            }
          } catch {}
        }
      }
      if (!patchedLs) {
        const fbKey = 'ph_phc_arena_posthog';
        try {
          let raw = localStorage.getItem(fbKey) || '{}';
          const obj = JSON.parse(raw);
          const cur = obj.$override_feature_flags || {};
          if (force || cur['credit-system-m1'] !== 'cost-shown' || cur['credit-system-m2'] !== 'limits-enabled') {
            obj.$override_feature_flags = Object.assign({}, cur, ov);
            raw = JSON.stringify(obj);
            localStorage.setItem(fbKey, raw);
          }
          this._phMemoKey = fbKey;
          this._phMemoRaw = raw;
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
    if (!verifiedCost && id !== 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;
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
  save() {
    if (typeof clearTimeout === 'function') clearTimeout(this._saveSoonT); this._saveSoonT = 0;
    this._lastSaveAt = now();
    Store.set('models', this.all);
    try { if (typeof MsgCache !== 'undefined' && MsgCache.putMeta) void MsgCache.putMeta('models', this.all); } catch {}
    return true;
  },
  saveSoon(ms = 320) {
    if (this._saveSoonT) return true;
    this._saveSoonT = setTimeout(() => { this._saveSoonT = 0; this.save(); }, ms);
    return true;
  },
  del(sid) {
    if (!sid || !this.all[sid]) return false;
    delete this.all[sid];
    this.saveSoon();
    Bus.emit('models', sid);
    return true;
  },
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
    if (!this._lastSaveAt || now() - this._lastSaveAt > 250) this.save();
    else this.saveSoon(220);
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

// ── QrSync: 电脑端 ⇄ 手机端 节点订阅与账号配置二维码同步 & 首次无缓存引导 ──
const QrSync = (() => {
  const CAP_L = [0,17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858,929,1003,1091,1171,1273,1367];
  const EC_L = [
    null,[19,7,1,19,0,0],[34,10,1,34,0,0],[55,15,1,55,0,0],[80,20,1,80,0,0],[108,26,1,108,0,0],
    [136,18,2,68,0,0],[156,20,2,78,0,0],[194,24,2,97,0,0],[232,30,2,116,0,0],[274,18,2,68,2,69],
    [324,20,4,81,0,0],[370,24,2,92,2,93],[428,26,4,107,0,0],[461,30,3,115,1,116],[523,22,5,87,1,88],
    [589,24,5,98,1,99],[647,28,1,107,5,108],[721,30,5,120,1,121],[795,28,3,113,4,114],[861,28,3,107,5,108],
    [932,28,4,116,4,117],[1006,28,2,111,7,112],[1094,30,4,121,5,122],[1174,30,6,117,4,118],[1276,26,8,106,4,107],[1370,28,10,114,2,115]
  ];
  const ALIGN = [
    null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
    [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],
    [6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114]
  ];
  const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();
  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
  function rsEncode(data, ecLen) {
    let gen = new Uint8Array([1]);
    for (let i = 0; i < ecLen; i++) {
      const next = new Uint8Array(gen.length + 1);
      for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gfMul(gen[j], GF_EXP[i]); }
      gen = next;
    }
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
      const f = data[i] ^ rem[0];
      rem.copyWithin(0, 1); rem[ecLen - 1] = 0;
      if (f !== 0) for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j + 1], f);
    }
    return rem;
  }
  function encodeQR(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    let ver = 1;
    while (ver <= 26 && CAP_L[ver] < bytes.length) ver++;
    if (ver > 26) throw new Error('数据超出单张二维码容量');
    const [totalData, ecPerBlock, g1Blocks, g1Codewords, g2Blocks, g2Codewords] = EC_L[ver];
    const bits = [];
    const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    pushBits(0b0100, 4);
    pushBits(bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);
    const maxBits = totalData * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
    while (bits.length & 7) bits.push(0);
    const dataBytes = new Uint8Array(totalData);
    for (let i = 0; i < bits.length >>> 3; i++) {
      let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bits[(i << 3) + b];
      dataBytes[i] = v;
    }
    for (let i = bits.length >>> 3, p = 0; i < totalData; i++, p ^= 1) dataBytes[i] = p ? 0x11 : 0xec;
    const blocks = [], ecs = [];
    let off = 0;
    for (let i = 0; i < g1Blocks; i++) { const blk = dataBytes.subarray(off, off + g1Codewords); off += g1Codewords; blocks.push(blk); ecs.push(rsEncode(blk, ecPerBlock)); }
    for (let i = 0; i < g2Blocks; i++) { const blk = dataBytes.subarray(off, off + g2Codewords); off += g2Codewords; blocks.push(blk); ecs.push(rsEncode(blk, ecPerBlock)); }
    const codewords = [];
    const maxCw = Math.max(g1Codewords, g2Codewords);
    for (let i = 0; i < maxCw; i++) for (let b = 0; b < blocks.length; b++) if (i < blocks[b].length) codewords.push(blocks[b][i]);
    for (let i = 0; i < ecPerBlock; i++) for (let b = 0; b < ecs.length; b++) codewords.push(ecs[b][i]);
    const size = ver * 4 + 17;
    const grid = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
    const setMod = (r, c, dark) => { if (r >= 0 && r < size && c >= 0 && c < size) { grid[r][c] = dark ? 1 : 0; isFunc[r][c] = 1; } };
    const finder = (r0, c0) => {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        setMod(r0 + dy, c0 + dx, dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (d === 0 || d === 1 || d === 3));
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { setMod(6, i, (i & 1) === 0); setMod(i, 6, (i & 1) === 0); }
    const aPos = ALIGN[ver];
    for (let i = 0; i < aPos.length; i++) for (let j = 0; j < aPos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === aPos.length - 1) || (i === aPos.length - 1 && j === 0)) continue;
      const cr = aPos[i], cc = aPos[j];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setMod(cr + dy, cc + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    setMod(size - 8, 8, true);
    for (let i = 0; i < 9; i++) { if (i !== 6) { isFunc[8][i] = 1; isFunc[i][8] = 1; } }
    for (let i = 0; i < 8; i++) { isFunc[8][size - 1 - i] = 1; isFunc[size - 1 - i][8] = 1; }
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vBits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setMod(b, a, bit); setMod(a, b, bit);
      }
    }
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let up = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        const r = up ? size - 1 - v : v;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) { dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1; bitIdx++; }
            if (((r + c) & 1) === 0) dark = !dark;
            grid[r][c] = dark ? 1 : 0;
          }
        }
      }
      up = !up;
    }
    const fmtData = (0b01 << 3) | 0;
    let fRem = fmtData;
    for (let i = 0; i < 10; i++) fRem = (fRem << 1) ^ ((fRem >>> 9) * 0x537);
    const fBits = ((fmtData << 10) | fRem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setMod(8, i, ((fBits >>> i) & 1) === 1);
    setMod(8, 7, ((fBits >>> 6) & 1) === 1);
    setMod(8, 8, ((fBits >>> 7) & 1) === 1);
    setMod(7, 8, ((fBits >>> 8) & 1) === 1);
    for (let i = 9; i < 15; i++) setMod(14 - i, 8, ((fBits >>> i) & 1) === 1);
    for (let i = 0; i < 8; i++) setMod(size - 1 - i, 8, ((fBits >>> i) & 1) === 1);
    for (let i = 8; i < 15; i++) setMod(8, size - 15 + i, ((fBits >>> i) & 1) === 1);
    return { size, grid };
  }
  function toSvg(text, pxSize = 228) {
    const { size, grid } = encodeQR(text);
    const pad = 3, total = size + pad * 2;
    let d = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c]) d += `M${c + pad},${r + pad}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges" style="background:#fff;border-radius:12px;display:block;margin:0 auto;box-shadow:0 4px 16px rgba(0,0,0,.18)"><path d="${d}" fill="#111"/></svg>`;
  }
  function decodeQRMatrix(grid) {
    const size = grid.length;
    const ver = Math.round((size - 17) / 4);
    if (ver < 1 || ver > 26 || ver * 4 + 17 !== size) return null;
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
    const mark = (r, c) => { if (r >= 0 && r < size && c >= 0 && c < size) isFunc[r][c] = 1; };
    const finder = (r0, c0) => { for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mark(r0 + dy, c0 + dx); };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { mark(6, i); mark(i, 6); }
    const aPos = ALIGN[ver];
    for (let i = 0; i < aPos.length; i++) for (let j = 0; j < aPos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === aPos.length - 1) || (i === aPos.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(aPos[i] + dy, aPos[j] + dx);
    }
    for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
    for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
    if (ver >= 7) {
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        mark(b, a); mark(a, b);
      }
    }
    let fBits = 0;
    for (let i = 0; i <= 5; i++) if (grid[8][i]) fBits |= (1 << i);
    if (grid[8][7]) fBits |= (1 << 6);
    if (grid[8][8]) fBits |= (1 << 7);
    if (grid[7][8]) fBits |= (1 << 8);
    for (let i = 9; i < 15; i++) if (grid[14 - i][8]) fBits |= (1 << i);
    const fmt = (fBits ^ 0x5412) >>> 10;
    const mask = fmt & 7;
    const maskFn = [
      (r, c) => ((r + c) & 1) === 0,
      (r) => (r & 1) === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => ((Math.floor(r / 2) + Math.floor(c / 3)) & 1) === 0,
      (r, c) => ((r * c) & 1) + ((r * c) % 3) === 0,
      (r, c) => ((((r * c) & 1) + ((r * c) % 3)) & 1) === 0,
      (r, c) => ((((r + c) & 1) + ((r * c) % 3)) & 1) === 0,
    ][mask] || ((r, c) => ((r + c) & 1) === 0);
    const bits = [];
    let up = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        const r = up ? size - 1 - v : v;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let b = Boolean(grid[r][c]);
            if (maskFn(r, c)) b = !b;
            bits.push(b ? 1 : 0);
          }
        }
      }
      up = !up;
    }
    const cws = [];
    for (let i = 0; i + 7 < bits.length; i += 8) {
      let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
      cws.push(v);
    }
    const [totalData, , g1Blocks, g1Codewords, g2Blocks, g2Codewords] = EC_L[ver];
    const blocks = Array.from({ length: g1Blocks + g2Blocks }, (_, i) => new Uint8Array(i < g1Blocks ? g1Codewords : g2Codewords));
    const maxCw = Math.max(g1Codewords, g2Codewords);
    let idx = 0;
    for (let i = 0; i < maxCw; i++) {
      for (let b = 0; b < blocks.length; b++) {
        if (i < blocks[b].length && idx < cws.length) blocks[b][i] = cws[idx++];
      }
    }
    const dataBytes = new Uint8Array(totalData);
    let off = 0;
    for (const blk of blocks) { dataBytes.set(blk, off); off += blk.length; }
    const dBits = [];
    for (const b of dataBytes) for (let i = 7; i >= 0; i--) dBits.push((b >>> i) & 1);
    const readBits = (p, len) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | (dBits[p + i] || 0); return v; };
    const mode = readBits(0, 4);
    if (mode !== 0b0100) return null;
    const lenBits = ver < 10 ? 8 : 16;
    const byteLen = readBits(4, lenBits);
    if (byteLen <= 0 || 4 + lenBits + byteLen * 8 > dBits.length) return null;
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) out[i] = readBits(4 + lenBits + i * 8, 8);
    return new TextDecoder().decode(out);
  }
  async function decodeFromImageData(imgData) {
    const { data, width, height } = imgData;
    const lum = (x, y) => {
      const i = (Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (lum(x, y) < 128) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX + 16 || maxY <= minY + 16) return null;
    while (minX > 0 && lum(minX - 1, Math.round((minY + maxY) / 2)) < 128) minX--;
    while (minY > 0 && lum(Math.round((minX + maxX) / 2), minY - 1) < 128) minY--;
    while (maxX < width - 1 && lum(maxX + 1, Math.round((minY + maxY) / 2)) < 128) maxX++;
    while (maxY < height - 1 && lum(Math.round((minX + maxX) / 2), maxY + 1) < 128) maxY++;
    const qrW = maxX - minX + 1, qrH = maxY - minY + 1;
    for (let ver = 1; ver <= 26; ver++) {
      const sz = ver * 4 + 17;
      const stepX = qrW / sz, stepY = qrH / sz;
      const grid = Array.from({ length: sz }, (_, r) => {
        const row = new Uint8Array(sz);
        for (let c = 0; c < sz; c++) row[c] = lum(minX + (c + 0.5) * stepX, minY + (r + 0.5) * stepY) < 135 ? 1 : 0;
        return row;
      });
      if (grid[0][0] && grid[0][6] && grid[6][0] && grid[3][3] && !grid[1][1]) {
        const txt = decodeQRMatrix(grid);
        if (txt && (txt.includes('brana-sync') || txt.startsWith('http') || txt.startsWith('{'))) return txt;
      }
    }
    return null;
  }
  async function decodeFromFile(file) {
    if (!file) return null;
    if (typeof BarcodeDetector !== 'undefined') {
      try {
        const bmp = await createImageBitmap(file);
        const det = new BarcodeDetector({ formats: ['qr_code'] });
        const codes = await det.detect(bmp);
        if (codes?.[0]?.rawValue) return codes[0].rawValue;
      } catch {}
    }
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const cv = document.createElement('canvas');
        const scale = Math.min(1, 900 / Math.max(img.width || 1, img.height || 1));
        cv.width = Math.max(64, Math.round(img.width * scale));
        cv.height = Math.max(64, Math.round(img.height * scale));
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const res = await decodeFromImageData(ctx.getImageData(0, 0, cv.width, cv.height)).catch(() => null);
        resolve(res);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  const toB64Url = obj => {
    const raw = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(raw);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  const fromB64Url = str => {
    let b64 = String(str || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  async function buildSyncBundle() {
    try { if (typeof Nodes !== 'undefined' && !Nodes.loaded) await Nodes.load(); } catch {}
    try { if (typeof Pool !== 'undefined' && !Pool.d) await Pool.load(); } catch {}
    let exp = null;
    try { if (typeof Host !== 'undefined' && typeof Host.exportAccounts === 'function') exp = await Host.exportAccounts(); } catch {}
    const subs = (typeof Nodes !== 'undefined' && Array.isArray(Nodes.subs)) ? Nodes.subs : (exp?.shared?.subs || []);
    const list = (typeof Nodes !== 'undefined' && Array.isArray(Nodes.list)) ? Nodes.list : (exp?.shared?.nodes || []);
    const pips = (typeof Nodes !== 'undefined' && Array.isArray(Nodes.pips)) ? Nodes.pips : (exp?.shared?.pips || []);
    const activeNodeId = (typeof Pool !== 'undefined' && Pool.d?.node) || UI?.host?.account?.nodeId || list[0]?.id || '';
    const activeNode = list.find(n => n?.id === activeNodeId) || list[0] || null;
    const activeVless = (activeNode && typeof Vless !== 'undefined' && Vless.toLink) ? Vless.toLink(activeNode) : '';
    const rawAccts = Array.isArray(exp?.accounts) && exp.accounts.length ? exp.accounts : (UI?.host?.accounts || []);
    const slimAccts = rawAccts.filter(a => a && (a.email || a.password || a.name)).map(a => ({
      id: a.id,
      name: a.name || '',
      email: a.email || '',
      password: a.password || '',
      nodeId: a.nodeId || activeNodeId || '',
      proxyIp: a.proxyIp || '',
      region: a.region || '',
      cookies: Array.isArray(a.cookies) ? a.cookies : undefined,
    }));
    const fullBundle = {
      v: 1,
      at: Date.now(),
      subs: subs.map(s => ({ id: s.id, name: s.name || '', url: s.url })),
      nodes: list.slice(0, 60),
      pips: pips.slice(0, 80),
      activeNodeId,
      activeVless,
      accounts: slimAccts,
    };
    const inlineLite = {
      v: 1,
      s: subs.map(s => s.url).filter(Boolean).slice(0, 5),
      l: activeVless ? [activeVless] : list.slice(0, 3).map(n => (typeof Vless !== 'undefined' && Vless.toLink) ? Vless.toLink(n) : '').filter(Boolean),
      p: pips.slice(0, 6).map(x => x.address ? (x.address + (x.port && x.port !== 443 ? ':' + x.port : '')) : String(x || '')).filter(Boolean),
      a: slimAccts.slice(0, 6).map(a => ({ n: a.name, e: a.email, p: a.password, ip: a.proxyIp, r: a.region })),
    };
    return { fullBundle, inlineLite };
  }
  async function applySyncPayload(rawInput, onProgress) {
    const step = msg => { try { onProgress?.(msg); } catch {} };
    let text = String(rawInput || '').trim();
    if (!text) throw new Error('请输入或扫描同步口令/订阅链接');
    if (/^https?:\/\//i.test(text) && !text.includes('/brana-sync/') && !text.includes('#brana=')) {
      step('正在导入节点订阅并拉取可用节点…');
      await Nodes.load();
      const subRes = await Nodes.addSub(text);
      if (subRes?.err && (!Nodes.list || !Nodes.list.length)) throw new Error('订阅拉取失败：' + subRes.err);
      const firstNode = Nodes.list?.[0];
      if (firstNode) {
        try { await Pool.setNode(firstNode.id); } catch {}
        if (UI?.host?.account?.id) {
          try { await Host.setAccountProxy({ id: UI.host.account.id, nodeId: firstNode.id, proxyIp: UI.host.account.proxyIp || '' }); } catch {}
        }
      }
      return { ok: true, mode: 'sub', subCount: 1, nodeCount: Nodes.list?.length || 0, accountCount: 0 };
    }
    if (/^vless:\/\//i.test(text)) {
      step('正在导入 VLESS 节点…');
      await Nodes.load();
      await Nodes.importText(text);
      const firstNode = Nodes.list?.[0];
      if (firstNode) {
        try { await Pool.setNode(firstNode.id); } catch {}
        if (UI?.host?.account?.id) {
          try { await Host.setAccountProxy({ id: UI.host.account.id, nodeId: firstNode.id, proxyIp: UI.host.account.proxyIp || '' }); } catch {}
        }
      }
      return { ok: true, mode: 'vless', subCount: 0, nodeCount: Nodes.list?.length || 0, accountCount: 0 };
    }
    let data = null;
    let hashPart = '';
    if (text.includes('#')) {
      const idx = text.indexOf('#');
      hashPart = text.slice(idx + 1).replace(/^brana=/, '');
      text = text.slice(0, idx).trim();
    }
    if (/^https?:\/\/[^\s]+\/brana-sync\//i.test(text)) {
      step('正在从电脑端局域网同步节点与账号数据…');
      try {
        const res = typeof Host?.fetchText === 'function'
          ? await Host.fetchText(text, { method: 'GET', direct: true })
          : await fetch(text).then(async r => ({ ok: r.ok, status: r.status, text: await r.text() }));
        if (res?.text) data = JSON.parse(res.text);
      } catch {}
    }
    if (!data && hashPart) {
      try { data = fromB64Url(hashPart); } catch {}
    }
    if (!data) {
      const cleaned = text.replace(/^brana-sync:\/\/v1\//i, '').replace(/^brana:/i, '');
      try { data = cleaned.startsWith('{') ? JSON.parse(cleaned) : fromB64Url(cleaned); } catch {}
    }
    if (!data || typeof data !== 'object') throw new Error('无法识别该二维码或同步口令');
    await Nodes.load();
    const subUrls = Array.isArray(data.subs) ? data.subs.map(s => s?.url || s).filter(Boolean) : (Array.isArray(data.s) ? data.s : []);
    const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
    const vlessLinks = Array.isArray(data.l) ? data.l : (data.activeVless ? [data.activeVless] : []);
    const rawPips = Array.isArray(data.pips) ? data.pips : (Array.isArray(data.p) ? data.p : []);
    if (rawNodes.length) {
      const byKey = new Map(Nodes.list.map(n => [n.address + ':' + n.port + ':' + n.uuid, n]));
      for (const n of rawNodes) if (n?.address && n?.uuid) byKey.set(n.address + ':' + n.port + ':' + n.uuid, n);
      Nodes.list = [...byKey.values()];
      await Nodes.save();
    }
    if (vlessLinks.length) {
      await Nodes.importText(vlessLinks.join('\n')).catch(() => {});
    }
    if (rawPips.length) {
      const pipLines = rawPips.map(x => typeof x === 'string' ? x : (x?.address ? (x.address + (x.port && x.port !== 443 ? ':' + x.port : '')) : '')).filter(Boolean);
      if (pipLines.length) await Nodes.importText(pipLines.join('\n')).catch(() => {});
    }
    for (const u of subUrls) {
      if (!u || Nodes.subs.some(s => s.url === u)) continue;
      step('正在同步节点订阅：' + u.slice(0, 36) + '…');
      await Nodes.addSub(u).catch(() => {});
    }
    const chosenNodeId = (data.activeNodeId && Nodes.byId(data.activeNodeId)?.id) || Nodes.list?.[0]?.id || '';
    if (chosenNodeId) {
      try { await Pool.setNode(chosenNodeId); } catch {}
    }
    const accts = Array.isArray(data.accounts) ? data.accounts : (Array.isArray(data.a) ? data.a.map(x => ({
      name: x.n || '', email: x.e || '', password: x.p || '', proxyIp: x.ip || '', region: x.r || '', nodeId: chosenNodeId,
    })) : []);
    let importedAccts = 0;
    if (accts.length && typeof Host !== 'undefined') {
      step('正在同步账号配置（' + accts.length + ' 个）…');
      if (typeof Host.importAccounts === 'function') {
        try {
          const r = await Host.importAccounts({
            accounts: accts.map(a => ({ ...a, nodeId: a.nodeId || chosenNodeId })),
            shared: { nodes: Nodes.list, subs: Nodes.subs, pips: Nodes.pips },
          });
          importedAccts = r?.added || accts.length;
        } catch {}
      }
      const curA = UI?.host?.account;
      const firstCred = accts.find(a => a.email);
      if (curA && firstCred && !curA.email) {
        try {
          await Host.saveCredentials({ id: curA.id, email: firstCred.email, password: firstCred.password || '' });
          if (firstCred.name) await Host.renameAccount({ id: curA.id, name: firstCred.name });
        } catch {}
      }
      if (curA?.id && chosenNodeId) {
        try { await Host.setAccountProxy({ id: curA.id, nodeId: chosenNodeId, proxyIp: firstCred?.proxyIp || curA.proxyIp || '' }); } catch {}
      }
    } else if (UI?.host?.account?.id && chosenNodeId) {
      try { await Host.setAccountProxy({ id: UI.host.account.id, nodeId: chosenNodeId, proxyIp: UI.host.account.proxyIp || '' }); } catch {}
    }
    return {
      ok: true,
      mode: 'sync',
      subCount: Nodes.subs?.length || subUrls.length,
      nodeCount: Nodes.list?.length || 0,
      accountCount: importedAccts || accts.length,
      firstEmail: accts.find(a => a.email)?.email || '',
      firstPassword: accts.find(a => a.password)?.password || '',
    };
  }
  function isFirstTimeNoCache() {
    if (window.__fixture || window.__routeFixture) return false;
    try { if (localStorage.getItem('anc:onboard:done') === '1') return false; } catch {}
    const a = UI?.host?.account;
    const isFixtureAcct = Boolean(a?.email && /^acct-[a-z0-9-]+@example\.com$/i.test(String(a.email)));
    const hasAcct = Boolean(!isFixtureAcct && (a?.email || a?.hasPw || a?.hasPassword));
    const hasNodes = Boolean((typeof Nodes !== 'undefined' && ((Nodes.list && Nodes.list.length > 0) || (Nodes.subs && Nodes.subs.length > 0))) || a?.nodeId);
    const hasHist = Boolean(typeof History !== 'undefined' && Array.isArray(History.items) && History.items.length > 0);
    return !hasAcct && !hasNodes && !hasHist;
  }
  function markOnboardingDone() {
    try { localStorage.setItem('anc:onboard:done', '1'); } catch {}
  }
  function openModal(initialTab = 'export', onImported = null) {
    document.querySelector('.qrsync-ov')?.remove();
    const isMobile = Host?.platform === 'android' || document.body.classList.contains('m');
    let curTab = initialTab || (isMobile ? 'import' : 'export');
    let camStream = null, camTimer = 0;
    const stopCam = () => {
      clearInterval(camTimer); camTimer = 0;
      if (camStream) { try { for (const t of camStream.getTracks()) t.stop(); } catch {} camStream = null; }
    };
    const close = () => { stopCam(); ov.remove(); };
    const body = h('div', { style: 'padding:14px 16px;display:flex;flex-direction:column;gap:12px' });
    const tabExport = h('button', {
      type: 'button',
      class: 'btn' + (curTab === 'export' ? ' pri' : ''),
      style: 'flex:1;justify-content:center;white-space:nowrap',
      onclick: () => { curTab = 'export'; stopCam(); renderTab(); },
    }, icon('link'), h('span', null, '导出二维码（电脑→手机）'));
    const tabImport = h('button', {
      type: 'button',
      class: 'btn' + (curTab === 'import' ? ' pri' : ''),
      style: 'flex:1;justify-content:center;white-space:nowrap',
      onclick: () => { curTab = 'import'; renderTab(); },
    }, icon('RefreshCw'), h('span', null, '扫码 / 订阅导入'));
    const ov = h('div', {
      class: 'm-ov open qrsync-ov',
      style: 'z-index:9999',
      onclick: e => { if (e.target === ov) close(); },
    }, h('div', { class: 'm-box', style: 'width:min(460px,94vw);max-height:90vh;overflow:auto' },
      h('div', { class: 'm-hd', style: 'display:flex;align-items:center;justify-content:space-between' },
        h('b', { style: 'display:flex;align-items:center;gap:6px;white-space:nowrap' }, icon('link'), '节点订阅与账号扫码互联'),
        h('button', { class: 'ibtn', title: '关闭', onclick: close }, icon('x'))
      ),
      h('div', { style: 'display:flex;gap:8px;padding:10px 16px 0' }, tabExport, tabImport),
      body
    ));
    async function renderTab() {
      tabExport.className = 'btn' + (curTab === 'export' ? ' pri' : '');
      tabImport.className = 'btn' + (curTab === 'import' ? ' pri' : '');
      body.replaceChildren();
      if (curTab === 'export') {
        const loading = h('div', { class: 'dim', style: 'text-align:center;padding:24px 0' }, '正在生成同步二维码…');
        body.append(loading);
        try {
          const { fullBundle, inlineLite } = await buildSyncBundle();
          const srv = (typeof Host?.shared === 'function') ? await Host.shared('__qrSyncServe', fullBundle).catch(() => null) : null;
          const liteB64 = toB64Url(inlineLite);
          const qrPayload = (srv?.ok && srv.url && (srv.url.length + liteB64.length + 8 <= 1200))
            ? (srv.url + '#brana=' + liteB64)
            : (srv?.ok && srv.url && liteB64.length > 1200)
              ? srv.url
              : ('brana-sync://v1/' + liteB64);
          const fullTokenStr = 'brana-sync://v1/' + toB64Url(fullBundle);
          const qrBox = h('div', { style: 'padding:12px;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;text-align:center' });
          qrBox.innerHTML = toSvg(qrPayload, 224);
          const statLine = h('div', { style: 'font-size:12px;color:var(--fg2);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
            `包含：节点订阅 ${fullBundle.subs.length} 个 · 节点 ${fullBundle.nodes.length} 个 · 账号 ${fullBundle.accounts.length} 个`
          );
          const tipLine = h('div', { class: 'dim', style: 'font-size:11.5px;line-height:1.5;text-align:center' },
            srv?.ok
              ? `手机客户端打开「扫码导入」扫描上方二维码即可一键导入全部节点订阅与账号（局域网直连 ${srv.ip}:${srv.port} + 离线内嵌双通道）`
              : '手机客户端打开「扫码导入」扫描上方二维码，或复制下方同步口令到手机端粘贴即可完成配置'
          );
          const copyBtn = h('button', {
            type: 'button',
            class: 'btn pri',
            style: 'width:100%;justify-content:center',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(fullTokenStr);
                toast('已复制完整同步口令（含全部节点订阅与账号），可在手机端直接粘贴导入', 'ok');
              } catch {
                toast('复制失败，请手动复制', 'bad');
              }
            },
          }, icon('copy'), h('span', null, '复制完整同步口令（跨网通用）'));
          body.replaceChildren(qrBox, statLine, tipLine, copyBtn);
        } catch (err) {
          body.replaceChildren(h('div', { class: 'gate-err show' }, '生成二维码失败：' + (err?.message || err)));
        }
      } else {
        const msgEl = h('div', { class: 'dim', style: 'font-size:12px' }, '扫描电脑端二维码，或直接粘贴同步口令 / 节点订阅地址（https://...）：');
        const camWrap = h('div', { style: 'display:none;position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:4/3;max-height:220px' });
        const videoEl = h('video', { playsinline: '', muted: '', style: 'width:100%;height:100%;object-fit:cover' });
        camWrap.append(videoEl);
        const inp = h('textarea', {
          class: 'inp',
          rows: 3,
          placeholder: '在此粘贴电脑端同步口令（brana-sync://...）或节点订阅链接（https://... / vless://...）',
          style: 'width:100%;font-family:var(--mono);font-size:12px;resize:vertical',
        });
        const statusEl = h('div', { style: 'font-size:12px;min-height:18px;color:var(--fg2)' });
        const doImport = async (rawVal) => {
          const val = String(rawVal ?? inp.value ?? '').trim();
          if (!val) { statusEl.textContent = '请先扫码或输入同步口令/订阅链接'; statusEl.style.color = 'var(--bad)'; return; }
          statusEl.style.color = 'var(--fg2)';
          try {
            const res = await applySyncPayload(val, s => { statusEl.textContent = s; });
            markOnboardingDone();
            toast(`导入成功：订阅 ${res.subCount} 个 · 节点 ${res.nodeCount} 个${res.accountCount ? ' · 账号 ' + res.accountCount + ' 个' : ''}`, 'ok');
            close();
            if (typeof onImported === 'function') onImported(res);
            else { try { UI.renderListSoon?.(); UI.renderTabs?.(); Bar.paint?.(); } catch {} }
          } catch (err) {
            statusEl.style.color = 'var(--bad)';
            statusEl.textContent = err?.message || String(err);
          }
        };
        const fileInp = h('input', {
          type: 'file',
          accept: 'image/*',
          style: 'display:none',
          onchange: async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            statusEl.textContent = '正在识别二维码图片…';
            const decoded = await decodeFromFile(f);
            if (!decoded) {
              statusEl.style.color = 'var(--bad)';
              statusEl.textContent = '未能从图片中识别出二维码，请尝试使用摄像头扫码或粘贴同步口令';
              return;
            }
            inp.value = decoded;
            await doImport(decoded);
          },
        });
        const scanCamBtn = h('button', {
          type: 'button',
          class: 'btn',
          style: 'flex:1;justify-content:center;white-space:nowrap',
          onclick: async () => {
            if (camStream) { stopCam(); camWrap.style.display = 'none'; return; }
            try {
              camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
              videoEl.srcObject = camStream;
              await videoEl.play();
              camWrap.style.display = 'block';
              statusEl.textContent = '请将摄像头对准电脑端二维码…';
              const cv = document.createElement('canvas');
              camTimer = setInterval(async () => {
                if (!videoEl.videoWidth) return;
                if (typeof BarcodeDetector !== 'undefined') {
                  try {
                    const det = new BarcodeDetector({ formats: ['qr_code'] });
                    const codes = await det.detect(videoEl);
                    if (codes?.[0]?.rawValue) { stopCam(); camWrap.style.display = 'none'; inp.value = codes[0].rawValue; await doImport(codes[0].rawValue); return; }
                  } catch {}
                }
                cv.width = videoEl.videoWidth; cv.height = videoEl.videoHeight;
                const ctx = cv.getContext('2d');
                ctx.drawImage(videoEl, 0, 0);
                const txt = await decodeFromImageData(ctx.getImageData(0, 0, cv.width, cv.height)).catch(() => null);
                if (txt) { stopCam(); camWrap.style.display = 'none'; inp.value = txt; await doImport(txt); }
              }, 350);
            } catch {
              fileInp.click();
            }
          },
        }, icon(' eye'), h('span', null, '摄像头扫码'));
        const pickImgBtn = h('button', {
          type: 'button',
          class: 'btn',
          style: 'flex:1;justify-content:center;white-space:nowrap',
          onclick: () => fileInp.click(),
        }, icon('upload'), h('span', null, '相册识别二维码'));
        const pasteBtn = h('button', {
          type: 'button',
          class: 'btn',
          style: 'flex:1;justify-content:center;white-space:nowrap',
          onclick: async () => {
            try {
              const t = await navigator.clipboard.readText();
              if (t) { inp.value = t.trim(); await doImport(t.trim()); }
            } catch { inp.focus(); }
          },
        }, icon('copy'), h('span', null, '粘贴剪贴板'));
        const confirmBtn = h('button', {
          type: 'button',
          class: 'btn pri',
          style: 'width:100%;justify-content:center',
          onclick: () => doImport(),
        }, icon('check'), h('span', null, '立即导入配置并生效'));
        body.replaceChildren(
          msgEl,
          h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, scanCamBtn, pickImgBtn, pasteBtn, fileInp),
          camWrap,
          inp,
          statusEl,
          confirmBtn
        );
      }
    }
    document.body.append(ov);
    void renderTab();
  }
  function renderFirstTimeOnboarding(v, a, reason, goStep2) {
    v.replaceChildren();
    const errEl = h('div', { class: 'gate-err' });
    const showMsg = (m, ok = false) => {
      errEl.textContent = m || '';
      errEl.classList.toggle('show', !!m);
      errEl.style.color = ok ? 'var(--ok, #22c55e)' : '';
    };
    const subInp = h('input', {
      class: 'inp',
      placeholder: '节点订阅地址 https://... 或 vless:// 节点链接或同步口令',
      style: 'width:100%;font-size:13px',
    });
    const subBtn = h('button', {
      type: 'button',
      class: 'btn pri',
      style: 'width:100%;justify-content:center;margin-top:8px',
      onclick: async () => {
        const val = subInp.value.trim();
        if (!val) { showMsg('请先输入节点订阅地址或点击上方扫码导入'); return; }
        subBtn.disabled = true;
        showMsg('正在拉取节点订阅并配置网络环境…', true);
        try {
          const res = await applySyncPayload(val, s => showMsg(s, true));
          markOnboardingDone();
          toast(`网络节点已就绪（共 ${res.nodeCount} 个节点），请继续登录账号`, 'ok');
          goStep2(res);
        } catch (err) {
          showMsg(err?.message || String(err));
          subBtn.disabled = false;
        }
      },
    }, icon('check'), h('span', null, '导入节点订阅并进入下一步（登录账号）'));
    const qrBtn = h('button', {
      type: 'button',
      class: 'btn pri',
      style: 'width:100%;justify-content:center;padding:11px 14px;font-weight:600',
      onclick: () => openModal('import', res => {
        markOnboardingDone();
        goStep2(res);
      }),
    }, icon('link'), h('span', null, '扫码导入电脑端配置（账号 + 节点订阅一键同步）'));
    const card = h('div', { class: 'gate' },
      h('div', { class: 'gate-card', style: 'max-width:440px' },
        h('div', { class: 'gate-top', style: 'justify-content:space-between' },
          h('span', { class: 'badge ok', style: 'font-size:11.5px;padding:3px 8px;white-space:nowrap' }, '第 1 步 / 共 2 步 · 网络与配置导入'),
          h('button', {
            type: 'button',
            class: 'gate-close',
            style: 'width:auto;padding:0 8px;font-size:12px;white-space:nowrap',
            onclick: () => { markOnboardingDone(); goStep2(null); },
          }, '跳过，直接登录 ➔')
        ),
        h('div', { class: 'gate-logo' }, icon('shield')),
        h('div', { class: 'gate-t' }, '首先配置网络节点或扫码同步'),
        h('div', { class: 'gate-sub' }, '首次启动请先扫描电脑端二维码同步账号与节点信息，或导入节点订阅地址保障网络畅通，随后再登录账号。'),
        errEl,
        h('div', { style: 'width:100%;display:flex;flex-direction:column;gap:10px;margin-top:6px' },
          qrBtn,
          h('div', { class: 'gate-or' }, h('span', null, '或导入节点订阅保障网络可用')),
          subInp,
          subBtn,
          h('div', { style: 'display:flex;gap:8px;justify-content:center;margin-top:4px;flex-wrap:wrap' },
            h('button', { type: 'button', class: 'btn', onclick: () => Nodes.openModal() }, icon(' globe'), h('span', null, '节点订阅管理')),
            h('button', { type: 'button', class: 'btn', onclick: () => Pool.openModal() }, icon('shield'), h('span', null, 'ProxyIP 池')),
            h('button', { type: 'button', class: 'btn', onclick: () => { markOnboardingDone(); goStep2(null); } }, h('span', null, '下一步：登录账号 ➔'))
          )
        )
      )
    );
    v.append(card);
  }
  return { encodeQR, toSvg, decodeFromFile, buildSyncBundle, applySyncPayload, isFirstTimeNoCache, markOnboardingDone, openModal, renderFirstTimeOnboarding };
})();
if (typeof window !== 'undefined') window.QrSync = QrSync;

