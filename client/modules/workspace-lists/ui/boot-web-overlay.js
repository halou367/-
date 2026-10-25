// 入口：在 arena.ai/robots.txt 上替换为客户端界面；在其它 arena.ai 页面（登录时）只显示「返回客户端」
function overlay() {
  // 找回密码 / 设置密码邮件链接跳回 arena.ai/?auth=reset-password&code=… ：直接回到客户端里的「设置新密码」
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('auth') === 'reset-password' && q.get('code')) { location.replace('/robots.txt#reset=' + encodeURIComponent(q.get('code'))); return; }
  } catch {}
  let authHint = ''; try { const f = JSON.parse(localStorage.getItem('anc-auth') || 'null'); if (f && Date.now() - f.at < 30 * 60e3) authHint = f.kind === 'signup' ? '已打开注册邮件里的链接：如果页面要求填写资料 / 设置密码，请在这里完成，然后返回客户端' : '已打开邮件里的链接，完成后返回客户端'; } catch {}
  try { if (/(^|\.)arena\.ai$/i.test(location.hostname)) WebSide.start(); } catch {}
  try { if (/(^|\.)arena\.ai$/i.test(location.hostname)) { if (!WebBar.start()) WebFoot.start(); } } catch { try { WebFoot.start(); } catch {} }
  try { if (/(^|\.)arena\.ai$/i.test(location.hostname)) WebPw.start(); } catch {}
  // 浏览器模式打开某个对话时（/agent/:sid）：后台将对话正文缓存进本机 MsgCache（IndexedDB），切回客户端模式时 0ms 秒开
  try {
    if (/(^|\.)arena\.ai$/i.test(location.hostname) && typeof MsgCache !== 'undefined' && typeof chatOf === 'function') {
      let seededSid = '';
      const syncBrowserChatToCache = () => {
        const m = /^\/(agent|c|chat)\/([0-9a-f-]{36})\b/i.exec(location.pathname || '');
        const sid = m ? m[2] : '';
        if (!sid || sid === seededSid) return;
        seededSid = sid;
        setTimeout(async () => {
          try {
            const existing = await MsgCache.get(sid).catch(() => null);
            if (existing?.messages?.length) return;
            const c = chatOf(sid);
            if (m && m[1].toLowerCase() !== 'agent' && typeof EvalEngine !== 'undefined' && EvalEngine.initEvalFields) {
              EvalEngine.initEvalFields(c);
            }
            if (!c.loaded && !c.loading) await c.load().catch(() => {});
          } catch {}
        }, 1200);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncBrowserChatToCache, { once: true });
      else syncBrowserChatToCache();
      setInterval(syncBrowserChatToCache, 2500);
    }
  } catch {}
  const add = () => {
    // 浏览器模式顶部已经有浏览条（含「客户端」按钮）：不再放右下角的「返回客户端」
    if (window.__ancWebbar) { document.getElementById('anc-back')?.remove(); return; }
    const have = document.getElementById('anc-back');
    // 安卓的网页浏览条在底部：把「返回客户端」让到它上面
    if (have) { have.style.bottom = (window.__ancBarPos === 'bottom' ? 'calc(var(--sa-bottom,0px) + 66px)' : '18px'); return; }
    const b = document.createElement('div'); b.id = 'anc-back';
    b.innerHTML = '<button type="button">✓ 完成，返回客户端</button><small></small>'; b.querySelector('small').textContent = authHint || '在 Brana 页面中点击登录（Log in）完成登录后，点上方按钮返回';
    b.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font:13px system-ui,sans-serif';
    const btn = b.querySelector('button');
    btn.style.cssText = 'padding:10px 16px;border-radius:999px;border:0;background:#111;color:#fff;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.25);cursor:pointer';
    b.querySelector('small').style.cssText = 'background:rgba(255,255,255,.92);color:#333;padding:3px 8px;border-radius:6px';
    btn.onclick = () => Host.back(); // Keep the expected identity until /api/me has verified it.
    document.documentElement.appendChild(b);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true }); else add();
  setInterval(add, 1500);
}

// ---------- 浏览器模式：底部就是客户端那条信息栏（同一份代码 Bar.render + 同一份样式，字号 / 内容 / 顺序完全一致） ----------
// 放在封闭的 shadow root 里，客户端样式表只作用于这条栏，不影响官网页面。数据来自本机（额度、本对话 / 本轮花费、模型、IP 等都是客户端存的），
// 当前对话 = 地址栏里的 /agent/<id>。延迟每 30 秒测一次（和客户端一样，经账号线路请求 /cdn-cgi/trace）。
// 栏上的按钮（额度明细、榜单、指纹库、IP 列表 / 节点环境、版本）在当前页面以悬浮窗口打开（WebLayer），不切回客户端；刷新键就地刷新额度 / IP。
// ---------- 浏览器模式：悬浮层（底栏按钮打开的面板都以悬浮窗口出现在官网页面上，不切回客户端） ----------
// 客户端样式表整体加上 #__anc_layer 前缀后挂到页面上（只作用于悬浮层里的元素，不影响官网）；客户端代码往 document.body 挂的弹窗 / 菜单 / 提示
// （h() 建的元素）改挂到这一层。层本身铺满窗口但不接收点击，只有里面的面板可点。
const WebLayer = (() => {
  let el = null;
  // 选择器加前缀：html / :root / body 换成层本身（保留后面的 [data-theme] 等限定），其它一律放到层里面
  function compound(s) { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (!d && /[\s>+~]/.test(c)) return [s.slice(0, i), s.slice(i)]; } return [s, '']; }
  function one(sel, S) {
    sel = sel.trim(); if (!sel) return '';
    let [c1, rest] = compound(sel), m = /^(html|:root)(?![\w-])/.exec(c1);
    if (m) {
      let q = c1.slice(m[0].length), r = rest.trimStart(); if (r.startsWith('>')) r = r.slice(1).trimStart();
      const [c2, r2] = compound(r); if (/^body(?![\w-])/.test(c2)) { q += c2.slice(4); rest = r2; }
      return S + q + rest;
    }
    if (/^body(?![\w-])/.test(c1)) return S + c1.slice(4) + rest;
    if (/^\[data-(theme|platform)/.test(c1)) return S + c1 + rest + ',' + S + ' ' + sel;
    return S + ' ' + sel;
  }
  function split(list) { const out = []; let d = 0, st = 0; for (let i = 0; i < list.length; i++) { const c = list[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { out.push(list.slice(st, i)); st = i + 1; } } out.push(list.slice(st)); return out; }
  function scope(css, S) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let out = '', i = 0;
    const close = from => { let d = 0; for (let j = from; j < css.length; j++) { const c = css[j]; if (c === '"' || c === "'") { const k = css.indexOf(c, j + 1); j = k < 0 ? css.length : k; continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return j; } } return css.length - 1; };
    const walk = (a, b) => {
      let res = '', j = a;
      while (j < b) {
        const o = css.indexOf('{', j), semi = css.indexOf(';', j);
        if (o < 0 || o >= b) break;
        if (semi >= 0 && semi < o && /^\s*@/.test(css.slice(j, semi))) { res += css.slice(j, semi + 1); j = semi + 1; continue; }
        const pre = css.slice(j, o).trim(), end = close(o);
        if (pre.startsWith('@')) {
          if (/^@(media|supports|container|layer|document)\b/.test(pre)) res += pre + '{' + walk(o + 1, end) + '}';
          else res += pre + css.slice(o, end + 1);   // @keyframes / @font-face / @property：原样
        } else if (pre) res += split(pre).map(x => one(x, S)).filter(Boolean).join(',') + css.slice(o, end + 1);
        j = end + 1;
      }
      return res;
    };
    out = walk(0, css.length); return out;
  }
  let lazyDark = null, lazyTheme = null;
  function patchBody() {
    const body = document.body;
    if (!body || body.__ancPatched) return;
    body.__ancPatched = true;
    const orig = { append: Element.prototype.append, appendChild: Node.prototype.appendChild };
    body.append = function (...nodes) {
      if (nodes.length && nodes.every(n => n && n.__anc)) {
        const L = WebLayer.el() || ensure(lazyDark, lazyTheme);
        if (L) return orig.append.apply(L, nodes);
      }
      return orig.append.apply(this, nodes);
    };
    body.appendChild = function (n) {
      if (n && n.__anc) {
        const L = WebLayer.el() || ensure(lazyDark, lazyTheme);
        if (L) return orig.appendChild.call(L, n);
      }
      return orig.appendChild.call(this, n);
    };
  }
  function ensure(dark, T) {
    if (dark !== undefined) lazyDark = dark;
    if (T !== undefined) lazyTheme = T;
    if (el?.isConnected) return el;
    if (!document.body || typeof CSS !== 'string' || !CSS) return null;
    const S = '#__anc_layer';
    if (!WebLayer.sheet) {
      const sh = new CSSStyleSheet();
      sh.replaceSync(scope(CSS.replace(/@font-face\s*\{[^}]*\}/g, ''), S) + '\n' + S + '{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;display:block!important;overflow:visible!important;background:transparent!important;pointer-events:none!important;z-index:2147483647!important;font:13px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans CJK SC",sans-serif;color:var(--fg);text-align:left;letter-spacing:normal}' + S + '>*{pointer-events:auto}' + S + ' :where(button,input,select,textarea){font:inherit;color:inherit}');
      WebLayer.sheet = sh; document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
    }
    el = document.createElement('div'); el.id = '__anc_layer'; el.className = 'anc-layer' + (Host.platform === 'android' ? ' m' : '');
    el.dataset.platform = Host.platform === 'android' ? 'android mobile' : 'desktop';
    WebLayer.theme(lazyDark, lazyTheme);
    const body = document.body, orig = { append: Element.prototype.append, appendChild: Node.prototype.appendChild };
    orig.append.call(body, el);
    patchBody();
    return el;
  }
  return {
    sheet: null, scope,
    el() { return el?.isConnected ? el : null; },
    theme(dark, T) { lazyDark = dark; lazyTheme = T; if (!el) return; el.dataset.theme = dark ? 'dark' : 'light'; if (T?.color) { el.style.setProperty('--bg', T.color); if (T.symbolColor) el.style.setProperty('--fg', T.symbolColor); } },
    hookLazy(dark, T) { lazyDark = dark; lazyTheme = T; try { patchBody(); } catch {} },
    start(dark, T) { try { return ensure(dark, T); } catch (e) { console.warn('WebLayer', e); return null; } },
  };
})();
const WebBar = (() => {
  let wrap = null, barEl = null, started = false;
  const sidNow = () => (/^\/(?:agent|c|chat)\/([\w-]+)/.exec(location.pathname) || [])[1] || null;
  function sheetText() {
    let c = typeof CSS === 'string' ? CSS : '';
    const faces = c.match(/@font-face\s*\{[^}]*\}/g) || [];
    c = c.replace(/@font-face\s*\{[^}]*\}/g, '')
      .replace(/:root\b/g, '.anc-h')
      .replace(/(^|[\s,}>(~+])html(?=[.\[:#\s{,>)~+])/g, '$1.anc-h')
      .replace(/(^|[\s,}>(~+])body(?=[.\[:#\s{,>)~+])/g, '$1.anc-r');
    return { c, faces };
  }
  const OPEN = [['.bmeter', 'quota'], ['.lpbtn', 'leader'], ['.fp-library-btn', 'fplib'], ['.pel-library-btn', 'pelican'], ['.ipit', 'region'], ['.bar-ver', 'update'], ['.bcap', 'gacha']];
  function mount() {
    if (wrap?.isConnected) return true;
    if (typeof Bar === 'undefined' || typeof CSS !== 'string' || !CSS) return false;
    const { c, faces } = sheetText();
    const host = document.createElement('div'); host.id = '__anc_webfoot';
    const root = host.attachShadow({ mode: 'closed' });
    const sh = new CSSStyleSheet(); sh.replaceSync(c + '\n:host{all:initial}.anc-h{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:2147483646;background:transparent;height:auto!important;overflow:visible!important;border-radius:0!important}.anc-r{height:auto!important;overflow:visible!important;border-radius:0!important;background:transparent!important;margin:0;font:13px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans CJK SC",sans-serif;color:var(--fg)}#bar{position:relative}');
    root.adoptedStyleSheets = [sh];
    // 国旗字体（@font-face 在 shadow root 里不生效）：只把字体声明挂到页面上，不带任何选择器，不影响官网
    if (faces.length) { const fs = new CSSStyleSheet(); try { fs.replaceSync(faces.join('\n')); document.adoptedStyleSheets = [...document.adoptedStyleSheets, fs]; } catch {} }
    const C = window.__ancBarColors || {}, dark = C.dark ?? matchMedia('(prefers-color-scheme: dark)').matches, T = window.__ancBarTheme;
    const mob = Host.platform === 'android';
    wrap = document.createElement('div'); wrap.className = 'anc-h'; wrap.dataset.theme = dark ? 'dark' : 'light'; wrap.dataset.platform = mob ? 'android mobile' : 'desktop';
    if (T?.color) { wrap.style.setProperty('--bg', T.color); if (T.symbolColor) wrap.style.setProperty('--fg', T.symbolColor); }
    const body = document.createElement('div'); body.className = 'anc-r' + (mob ? ' m' : '');
    barEl = document.createElement('div'); barEl.id = 'bar';
    body.append(barEl); wrap.append(body); root.append(wrap); document.documentElement.appendChild(host);
    // 栏上的按钮：刷新键就地刷新；其余（额度明细、榜单、指纹库、出口 IP / 节点环境、版本、抽卡验证…）都在当前页面以悬浮窗口打开，不切回客户端（首次打开弹窗时按需构建 WebLayer CSS）
    WebLayer.hookLazy(dark, T);
    barEl.addEventListener('click', e => {
      const path = e.composedPath();
      const hit = sel => path.find(n => n instanceof Element && n.matches?.(sel));
      if (hit('.brefresh button.ib')) { e.preventDefault(); e.stopPropagation(); if (Bar.refreshing) return; Bar.refreshing = true; Bar.render(); const sid = sidNow(); Promise.allSettled([Pulse.poll(), IP.poll(), sid ? Trace.sync(sid) : null]).then(() => { Bar.refreshing = false; Bar.render(); }); return; }
      if (!WebLayer.el() && !WebLayer.start(dark, T)) { for (const [sel, kind] of OPEN) if (hit(sel)) { e.preventDefault(); e.stopPropagation(); location.href = '/robots.txt#open=' + kind; return; } }
      NetTip.hide();
    }, true);
    // 出口 IP 悬停小面板（延迟 + 网速）：栏在 shadow root 里，页面级的悬停监听看不到，这里单独绑定
    barEl.addEventListener('mouseover', e => { const a = e.target.closest?.('.ipit'); if (!a || a === NetTip.anchor) return; clearTimeout(NetTip.timer); NetTip.timer = setTimeout(() => { if (a.isConnected) NetTip.show(a); }, 180); });
    barEl.addEventListener('mouseout', e => { const a = e.target.closest?.('.ipit'); if (!a || a.contains(e.relatedTarget)) return; clearTimeout(NetTip.timer); if (!NetTip.pinned) NetTip.hide(); });
    Dock.sid = sidNow;   // 浏览器模式里没有客户端标签页：「本对话 / 本轮 / 模型」按官网当前打开的对话算
    Bar.mount(barEl);
    document.getElementById('__anc_webfoot_early')?.remove();
    const fit = () => { const hh = Math.ceil(wrap.getBoundingClientRect().height) || 26; document.documentElement.style.setProperty('--anc-foot', hh + 'px'); };
    fit(); new ResizeObserver(fit).observe(wrap);
    return true;
  }
  async function hostInfo() {
    try { const info = await Host.info(); UI.host = info; const st = info?.account?.status || {}; if (!IP.ip && st.ip) { IP.ip = st.ip; IP.loc = st.loc || IP.loc; } } catch {}
  }
  return {
    start() {
      if (started) return true;
      if (!window.__ancWebbar) return false;
      try { if (!mount()) return false; } catch { return false; }
      started = true;
      void hostInfo().then(() => Bar.render());
      // 出口纯净度 / 类型（住宅 · 机房 · SSTP …）要读本机的 ProxyIP 库：浏览器模式里也先载入
      try { if (typeof Pool !== 'undefined' && Pool.load) void Pool.load().then(() => Bar.render(), () => {}); } catch {}
      let sid0 = sidNow();
      setInterval(() => { if (!wrap?.isConnected) { wrap = null; try { mount(); } catch {} } const s = sidNow(); if (s !== sid0) { sid0 = s; Bar.render(); } }, 1500);
      const ping = () => { if (!(typeof document !== 'undefined' && document.hidden)) void IP.ping?.()?.then?.(() => Bar.render(), () => {}); };
      setTimeout(ping, 1500); setInterval(ping, 90000);
      setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden)) { void hostInfo(); Bar.render(); } }, 15000);
      return true;
    },
  };
})();

// ---------- 浏览器模式：底部保留客户端的信息条（额度 / 新对话额度 / 当前模型 / 出口 IP / 版本） ----------
// 数据来自宿主记录的本账号最近状态（Host.info，本机进程间通信，不发网络请求）；每 20 秒刷新一次。
// 信息条固定在窗口底部，高度写进 --anc-foot：官网「一屏高」的布局会再减去这一截（见 webbar.js 的 --anc-fill），内容不会被盖住。
const WebFoot = (() => {
  const HGT = 26; let host = null, root = null, box = null, timer = 0, last = '';
  const esc = v => String(v ?? '');
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '刚刚' : m < 60 ? m + ' 分钟前' : Math.round(m / 60) + ' 小时前'; };
  function mount() {
    if (host?.isConnected) return;
    const C = window.__ancBarColors || { bg: '#1b1c1e', fg: '#e8e8e8', line: 'rgba(255,255,255,.12)', dark: true };
    host = document.createElement('div'); host.id = '__anc_webfoot';
    root = host.attachShadow({ mode: 'closed' });
    const sh = new CSSStyleSheet();
    sh.replaceSync(`:host{all:initial}
      .f{position:fixed;left:0;right:0;bottom:0;height:calc(${HGT}px + var(--sa-bottom,0px));padding:0 12px var(--sa-bottom,0px);box-sizing:border-box;display:flex;align-items:center;gap:14px;
        background:${C.bg};color:${C.fg};border-top:1px solid ${C.line};font:11.5px/1 system-ui,-apple-system,'Segoe UI','Noto Sans CJK SC',sans-serif;z-index:2147483646;white-space:nowrap;overflow:hidden;user-select:none}
      .i{display:inline-flex;align-items:center;gap:5px;flex:none}.d{opacity:.55}b{font-weight:600}
      .m{display:inline-block;width:38px;height:5px;border-radius:3px;background:${C.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.10)'};overflow:hidden}.m i{display:block;height:100%;border-radius:3px;background:${C.dark ? '#d8d3ca' : '#8c7664'}}
      .m.low i{background:#e5484d}.g{flex:1}.dot{width:6px;height:6px;border-radius:50%;background:#34c26e}.dot.off{background:#e5484d}
      @media (max-width:760px){.hm{display:none}}@media (max-width:470px){.hm2{display:none}.f{gap:10px;padding-left:8px;padding-right:8px}}`);
    root.adoptedStyleSheets = [sh];
    box = document.createElement('div'); box.className = 'f'; root.append(box);
    document.documentElement.appendChild(host);
    document.documentElement.style.setProperty('--anc-foot', `calc(${HGT}px + var(--sa-bottom,0px))`);
  }
  function item(cls, title, ...parts) {
    const s = document.createElement('span'); s.className = 'i' + (cls ? ' ' + cls : ''); if (title) s.title = title;
    for (const p of parts) { if (p == null) continue; if (typeof p === 'string') s.append(p); else s.append(p); }
    return s;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  async function paint() {
    if (!window.__ancWebbar) return;
    mount();
    let info = null; try { info = await Host.info(); } catch {}
    const a = info?.account || {}, st = a.status || {}, q = st.quota || {};
    const cur = document.querySelector('a.anc-on[data-anc-t]'), model = cur?.dataset.ancT || '', vend = cur?.dataset.ancV || '';
    const key = JSON.stringify([q, st.ip, st.loc, a.email, model, vend, Math.floor(Date.now() / 60000)]);
    if (key === last && box.childElementCount) return; last = key;
    const kids = [];
    const pct = Number.isFinite(+q.pulse) && q.pulse != null ? Math.max(0, Math.min(100, Math.round(+q.pulse))) : null;
    const meter = el('i', 'm' + (pct != null && pct < 10 ? ' low' : '')); const fill = el('i'); fill.style.width = (pct ?? 0) + '%'; meter.append(fill);
    kids.push(item('', '账号额度（客户端最近一次读取' + (q.pulseAt ? '，' + ago(q.pulseAt) : '') + '）', meter, el('span', 'd', '额度'), el('b', '', pct != null ? pct + '%' : '—')));
    const blocked = q.blockedUntil && q.blockedUntil > Date.now();
    if (blocked || q.chatRemaining != null) kids.push(item('', '新对话额度（create-chat 限流）', el('span', 'd', '新对话'), el('b', '', blocked ? Math.ceil((q.blockedUntil - Date.now()) / 60000) + ' 分钟后' : q.chatRemaining + (q.chatLimit != null ? '/' + q.chatLimit : ''))));
    if (model) kids.push(item('hm2', '当前对话的模型（客户端识别结果）', el('span', 'd', '模型'), el('b', '', (vend && typeof Brand !== 'undefined' && Brand.NAME?.[vend] ? Brand.NAME[vend] + ' ' : '') + model)));
    if (q.at) kids.push(item('hm', '客户端最近一次更新这些信息的时间', el('span', 'd', '更新'), el('b', '', typeof fmtClock2 === 'function' ? fmtClock2(q.at) : new Date(q.at).toLocaleTimeString())));
    kids.push(el('span', 'g'));
    if (a.email) kids.push(item('hm', '当前账号', el('span', 'd', '账号'), el('b', '', typeof emailUser === 'function' ? emailUser(a) : a.email)));
    const dot = el('i', 'dot' + (st.ip ? '' : ' off'));
    kids.push(item('', (a.region && typeof regionLabel === 'function' ? '地区 ' + regionLabel(a.region) + '\n' : '') + (a.proxy && !(typeof isDirectP === 'function' && isDirectP(a.proxy)) ? '经代理 / 节点' : '直连'), dot, el('span', 'd', '出口'), el('b', '', st.ip ? (st.loc && typeof ccF === 'function' ? ccF(st.loc) + ' ' : '') + st.ip : '—')));
    kids.push(item('hm', '客户端版本', el('span', 'd', 'v' + esc(info?.version || VERSION))));
    box.replaceChildren(...kids);
  }
  return {
    start() {
      const go = () => { void paint(); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
      clearInterval(timer); timer = setInterval(() => { if (!host?.isConnected) last = ''; go(); }, 20000);
      setTimeout(go, 1500); setTimeout(go, 4000);   // 浏览条 / 侧栏解码就绪后再画一次（拿到当前对话的模型名）
      addEventListener('popstate', go);
      // 官网是单页应用，换对话不触发 popstate：每 2 秒只看一下当前对话的模型名变了没有（纯本地 DOM），变了就重画
      let m0 = ''; setInterval(() => { const c = document.querySelector('a.anc-on[data-anc-t]'), m = c ? c.dataset.ancT + '|' + (c.dataset.ancV || '') : ''; if (m !== m0) { m0 = m; go(); } }, 2000);
    },
    paint,
  };
})();

// ---------- 浏览器模式：官网输入框也有客户端的「＋ 附件」和「抽卡」按钮 ----------
// 不往官网（React）的节点里插元素：按钮是挂在页面最外层的悬浮元素，按输入框里发送键 / 工具栏的位置对齐；
// 只给官网的发送键 / 左侧工具栏加一点外边距（样式表），留出放按钮的空位。官网改版找不到发送键时按钮自动隐藏，不影响使用。
// ＋：官网自己有「Add files」按钮时就用官网的（不重复放）；没有时点＋ = 打开官网输入框里的文件选择，再没有就把选好的文件拖放进输入框。
// 抽卡：和客户端发送键旁的抽卡按钮同一个样子（目标厂商图标 + 名称；抽卡中显示进度）；点一下回到客户端并打开抽卡面板
// （抽卡要在客户端界面里跑，浏览器模式只做入口和进度显示）。
// 浏览器模式（官网页面）的密码：
// ① 空的密码框自动填入「注册时输入的密码」或「固定密码」（只填，不替你提交）；
// ② 在官网页面里亲手输入的密码先暂存（加密，24 小时），登录成功且邮箱一致、账号还没存过密码时存进账号，之后会话过期能自动重新登录。
const WebPw = (() => {
  let started = false, fillPw = '', watch = 0, acctId = '';
  const id = () => acctId || UI.host?.account?.id || '';
  const setVal = (inp, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  const emailNow = () => { for (const x of document.querySelectorAll('input[type=email],input[name=email],input[autocomplete=username],input[autocomplete=email]')) { const v = String(x.value || '').trim(); if (/^[^\s@]+@[^\s@]+$/.test(v)) return v; } return ''; };
  const stash = () => {
    const pw = [...document.querySelectorAll('input[type=password]')].map(x => x.value).find(Boolean) || fillPw; if (!pw || !id()) return;
    try { localStorage.setItem('anc-regpw', pw); } catch {}
    void Promise.resolve(Host.shared('regpw@' + id(), { email: emailNow(), pw, src: 'web' })).catch(() => {});
    // 等登录结果：登录成功后报给宿主（宿主按邮箱核对后把密码存进账号）
    clearInterval(watch); let n = 0;
    watch = setInterval(async () => {
      if (++n > 150) { clearInterval(watch); return; }
      try { const r = await fetch('/api/me', { credentials: 'include', cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); const em = j?.user?.email; if (em) { clearInterval(watch); await Host.noteAccount?.({ email: em, loggedIn: true }); } } catch {}
    }, 4000);
  };
  const scan = () => {
    if (!fillPw) return;
    let filledAny = false;
    for (const inp of document.querySelectorAll('input[type=password]')) {
      if (!inp.value && !inp.dataset.ancFilled && inp.getClientRects().length && !inp.readOnly && !inp.disabled) {
        inp.dataset.ancFilled = '1';
        setVal(inp, fillPw);
        filledAny = true;
      }
    }
    if (filledAny) stash();
  };
  return { async start() {
    if (started || typeof Host.shared !== 'function') return;
    if (!id()) { try { const inf = await Host.info(); acctId = inf?.account?.id || ''; if (!UI.host && inf) UI.host = inf; } catch {} }
    if (!id()) return;
    started = true;
    try { const r = await Host.shared('regpw@' + id()); if (r?.pw) fillPw = r.pw; } catch {}
    if (!fillPw && typeof MailToken !== 'undefined') try { const t = await MailToken.load(id()); if (t?.password) fillPw = t.password; } catch {}
    if (!fillPw) try { const f = await FixedPw.load(); if (f.on && f.pw) fillPw = f.pw; } catch {}
    if (!fillPw) try { const lp = localStorage.getItem('anc-regpw'); if (lp) fillPw = lp; } catch {}
    if (fillPw) {
      try { localStorage.setItem('anc-regpw', fillPw); } catch {}
      void Promise.resolve(Host.shared('regpw@' + id(), { email: emailNow(), pw: fillPw, src: 'fill' })).catch(() => {});
    }
    let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 200); }).observe(document.documentElement, { subtree: true, childList: true }); scan();
    setTimeout(scan, 500); setTimeout(scan, 1500);
    let st = 0;
    document.addEventListener('input', e => { if (e.target instanceof HTMLInputElement && e.target.type === 'password') { clearTimeout(st); st = setTimeout(stash, 350); } }, true);
    document.addEventListener('change', e => { if (e.target instanceof HTMLInputElement && e.target.type === 'password') stash(); }, true);
    document.addEventListener('submit', () => stash(), true);
    document.addEventListener('click', e => { if (e.target instanceof Element && e.target.closest('button[type=submit],form button:not([type=button]),button') && document.querySelector('input[type=password]')) stash(); }, true);
  } };
})();
const WebCompose = (() => {
  let wrap = null, plus = null, gacha = null, sheet = null, raf = 0, info = null;
  const FORM = 'form:has(textarea),form:has([contenteditable=true]),[data-anc-composer]';
  // 输入框容器：官网首页是 <form> + <textarea>；对话页可能是可编辑区（contenteditable）甚至不是 form：
  // 从输入区往上找第一个同时包含按钮的外层，标记 data-anc-composer（只加属性，不改结构）
  function composer() {
    const f = document.querySelector('form:has(textarea),form:has([contenteditable=true])'); if (f) return f;
    const ed = [...document.querySelectorAll('textarea,[contenteditable=true]')].find(e => !e.closest('#__anc_webbar,#__anc_webfoot') && e.getBoundingClientRect().width > 200); if (!ed) return null;
    let el = ed.parentElement; for (let k = 0; el && k < 6; k++, el = el.parentElement) if (el.querySelectorAll('button').length >= 2) { if (!el.hasAttribute('data-anc-composer')) el.setAttribute('data-anc-composer', ''); return el; }
    return null;
  }
  function ensure() {
    if (wrap?.isConnected) return;
    const C = window.__ancBarColors || {}, dark = C.dark ?? matchMedia('(prefers-color-scheme: dark)').matches;
    sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      [data-anc-send]{width:34px!important;height:34px!important;min-width:34px!important;border-radius:999px!important;border:0!important;opacity:1!important;
        background:${dark ? '#ecebe8' : '#1f1e1c'}!important;color:${dark ? '#1f1e1c' : '#fff'}!important;box-shadow:none!important;transition:transform .08s}
      [data-anc-send]:disabled{opacity:.55!important}[data-anc-send] svg{color:inherit!important}[data-anc-send]:active{transform:scale(.94)}
      [data-anc-hide]{display:none!important}
      [data-anc-send][data-anc-gap]{margin-left:44px!important}[data-anc-send][data-anc-gap=w]{margin-left:82px!important}
      [data-anc-padl]{padding-left:34px!important}
      #__anc_cmp{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483645;pointer-events:none}
      #__anc_cmp button{position:fixed;pointer-events:auto;display:none;align-items:center;justify-content:center;gap:5px;height:30px;box-sizing:border-box;border:0;cursor:pointer;
        font:600 12px/1 system-ui,-apple-system,'Segoe UI','Noto Sans CJK SC',sans-serif;color:${dark ? '#ecebe8' : '#1f1e1c'};background:transparent;transition:background .12s}
      #__anc_cmp button.on{display:inline-flex}
      #__anc_cmp .p{width:30px;border-radius:8px;opacity:.75}#__anc_cmp .p:hover{opacity:1;background:${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}
      #__anc_cmp .g{min-width:30px;max-width:30px;padding:0;border-radius:999px;overflow:hidden;white-space:nowrap;transition:max-width .22s ease,background .12s}
      #__anc_cmp .g:hover{background:${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}
      #__anc_cmp .g.empty{border:1.5px dashed ${dark ? 'rgba(236,235,232,.45)' : 'rgba(31,30,28,.4)'}}
      #__anc_cmp .g .vi{width:16px;height:16px;flex:none;border-radius:50%;background:center/16px 16px no-repeat}
      #__anc_cmp .g.busy{max-width:92px;padding:0 9px;background:${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}
      #__anc_cmp .g .pr{font:600 11px ui-monospace,monospace;opacity:.75;display:none}#__anc_cmp .g.busy .pr{display:inline}`);
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    wrap = document.createElement('div'); wrap.id = '__anc_cmp';
    plus = document.createElement('button'); plus.type = 'button'; plus.className = 'p'; plus.title = '添加附件（图片 / PDF）'; plus.setAttribute('aria-label', '添加附件');
    { const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('width', '18'); sv.setAttribute('height', '18');
      const pa = document.createElementNS(NS, 'path'); pa.setAttribute('d', 'M12 5v14M5 12h14'); pa.setAttribute('stroke', 'currentColor'); pa.setAttribute('stroke-width', '1.8'); pa.setAttribute('stroke-linecap', 'round'); pa.setAttribute('fill', 'none'); sv.append(pa); plus.append(sv); }
    gacha = document.createElement('button'); gacha.type = 'button'; gacha.className = 'g empty';
    gacha.append(Object.assign(document.createElement('i'), { className: 'vi' }), Object.assign(document.createElement('span'), { className: 'pr' }));
    plus.onclick = e => { e.preventDefault(); e.stopPropagation(); attach(); };
    gacha.onclick = e => { e.preventDefault(); e.stopPropagation(); location.href = '/robots.txt#gacha'; };
    wrap.append(plus, gacha); document.documentElement.appendChild(wrap);
  }
  // 发送键：type=submit / aria-label 含 send；都没有就取输入框里最右下角的那个按钮
  function sendOf(form) {
    if (!form) return null;
    const b = form.querySelector('button[type=submit],button[aria-label*="send" i]'); if (b) return b;
    let best = null, bx = -1; for (const x of form.querySelectorAll('button')) { const r = x.getBoundingClientRect(); if (r.width && r.right + r.bottom > bx) { bx = r.right + r.bottom; best = x; } }
    return best;
  }
  // 发送键左边紧挨着的官网小按钮（不是左侧工具栏、不含输入框、宽度 < 64px）：隐藏，空位放抽卡按钮
  function hidePrev(send) {
    if (!send) return;
    let el = send; while (el && !el.previousElementSibling && el.parentElement && !el.parentElement.matches(FORM)) el = el.parentElement;
    const prev = el?.previousElementSibling; if (!prev || prev.hasAttribute('data-anc-hide')) return;
    if (prev.querySelector('textarea,[contenteditable=true]') || !(prev.matches('button') || prev.querySelector('button'))) return;
    const r = prev.getBoundingClientRect(); if (r.width > 0 && r.width < 64) prev.setAttribute('data-anc-hide', '');
  }
  function attach() {
    const form = composer(), inp = form?.querySelector('input[type=file]');
    if (inp) { inp.click(); return; }
    const ta = form?.querySelector('textarea,[contenteditable=true]'); if (!ta) return;
    const pick = document.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = 'image/*,application/pdf';
    pick.onchange = () => { const dt = new DataTransfer(); for (const f of pick.files) dt.items.add(f); for (const t of ['dragenter', 'dragover', 'drop']) ta.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); };
    pick.click();
  }
  const iconUrl = vid => { try { const svg = VIcon.html(vid, 24).replace(/currentColor/g, (window.__ancBarColors?.dark ?? true) ? '#ecebe8' : '#1f1e1c').replace(/class="[^"]*"/, 'xmlns="http://www.w3.org/2000/svg"'); return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; } catch { return ''; } };
  function paintGacha() {
    let s = {}; try { s = Gacha.settings(); } catch {}
    const g = info?.account?.status?.gacha || null, busy = !!g?.busy, v = s.vendor ? Gacha.vendorBy?.(s.vendor) : null;
    gacha.classList.toggle('empty', !v && !busy); gacha.classList.toggle('busy', busy);
    const vi = gacha.querySelector('.vi'), url = v ? iconUrl(v.id) : ''; vi.style.display = v ? '' : 'none'; if (vi.dataset.u !== url) { vi.dataset.u = url; vi.style.backgroundImage = url; }
    gacha.querySelector('.pr').textContent = busy ? (g.done || 0) + '/' + (g.total || '?') : '';
    gacha.title = (busy ? '抽卡中 ' + (g.done || 0) + '/' + (g.total || '?') + (g.phase ? ' · ' + g.phase : '') + '\n' : '抽卡' + (v ? ' · 目标 ' + (s.targetName || v.name || '') : ' · 还没选目标厂商') + '\n') + '点击回到客户端打开抽卡面板';
  }
  function place() {
    raf = 0; if (!wrap?.isConnected) ensure();
    const form = composer(), send = sendOf(form);
    if (send && !send.hasAttribute('data-anc-send')) send.setAttribute('data-anc-send', '');
    hidePrev(send);
    const vis = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? r : null; };
    const sr = vis(send);
    if (!sr) { plus.classList.remove('on'); gacha.classList.remove('on'); return; }
    const busy = gacha.classList.contains('busy'); if (send.getAttribute('data-anc-gap') !== (busy ? 'w' : '')) send.setAttribute('data-anc-gap', busy ? 'w' : '');
    gacha.style.right = (innerWidth - sr.left + 8) + 'px'; gacha.style.top = (sr.top + (sr.height - 30) / 2) + 'px'; gacha.classList.add('on');
    const theirs = form.querySelector('button[aria-label="Add files" i],button[aria-label*="attach" i],button[aria-label*="upload" i]');
    if (vis(theirs)) { plus.classList.remove('on'); return; }
    // 左侧工具栏 = 和发送键同一行的第一组；没有就贴着输入框左下角
    const row = send.closest('.justify-between') || send.parentElement?.parentElement, left = row && row.firstElementChild !== send.parentElement ? row.firstElementChild : null;
    if (left && !left.hasAttribute('data-anc-padl')) left.setAttribute('data-anc-padl', '');
    const fr = vis(form), lr = vis(left);
    const x = lr ? lr.left : fr.left + 10, y = lr ? lr.top + (lr.height - 30) / 2 : sr.top + (sr.height - 30) / 2;
    plus.style.left = x + 'px'; plus.style.top = y + 'px'; plus.classList.add('on');
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
  return {
    start() {
      // 浏览器模式不再修改官网原生输入框与发送栏
    },
  };
})();

// ---------- 浏览器模式：官网左侧对话列表的加密名称 → 解码成「型号 + 厂商图标」 ----------
// 只读：不改官网的 DOM 结构 / 事件 / 云端名称。给对话链接打 data 属性，名称用 CSS 伪元素画出来，原文字节点只是隐藏（React 重绘也不会冲突）。
const WebSide = (() => {
  const cache = new Map(), pending = new Set(), icons = new Set(); let sheet = null, iconSheet = null, timer = 0;
  const SIDE = '[data-sidebar],aside,nav';
  const CSS = `
    a[data-anc-t]{display:flex!important;align-items:center!important;gap:7px}
    a[data-anc-t] [data-anc-hide]{display:none!important}
    a[data-anc-t]::before{content:'';order:-2;flex:none;width:16px;height:16px;border-radius:50%;background:#fff center/11px 11px no-repeat;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
    a[data-anc-t]:not([data-anc-v])::before{display:none}
    a[data-anc-t] :is(svg,img):not(button *){display:none!important}   /* 官网自己的对话图标（解码后有厂商图标，不要在右边再出一个） */
    a[data-anc-t] button{opacity:0;transition:opacity .12s}a[data-anc-t]:hover button,a[data-anc-t] button[aria-expanded=true]{opacity:1}
    a[data-anc-t]::after{content:attr(data-anc-t);order:-1;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  const icon = vid => {
    if (!vid || icons.has(vid)) return; icons.add(vid);
    try {
      const svg = VIcon.html(vid, 24).replace(/currentColor/g, '#1f1e1c').replace(/class="[^"]*"/, 'xmlns="http://www.w3.org/2000/svg"');
      const rule = 'a[data-anc-v="' + vid.replace(/[^\w-]/g, '') + '"]::before{background-image:url("data:image/svg+xml,' + encodeURIComponent(svg) + '")}';
      iconSheet.insertRule(rule, iconSheet.cssRules.length);
    } catch {}
  };
  // 显示文字所在的那个元素（链接里最深的、自己带文字的节点）
  const textEl = a => { let best = null; for (const el of a.querySelectorAll('*')) { if (el.closest('button,svg')) continue; if ([...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) best = el; } return best; };
  // 和客户端侧栏卡片一样：短型号名（opus-5.5 / 6-astra），有备注就接在后面
  const labelOf = meta => { const full = TitleSync.modelLabel(meta) || '', m = cardName(meta?.model || full) || full; const note = String(meta?.note || '').trim(); return m + (note ? ' · ' + note : ''); };
  let paintRaf = 0;
  const schedulePaint = () => { if (!paintRaf) paintRaf = requestAnimationFrame(() => { paintRaf = 0; paint(); }); };
  async function decode(sid, raw) {
    const k = sid + '|' + raw; if (cache.has(k) || pending.has(k)) return; pending.add(k);
    let label = '', vid = '', full = '';
    try { if (!TitleCipher.unlocked) TitleCipher.unlock(TitleCipher.DEFAULT_PASSPHRASE); const meta = TitleSync.validate(await TitleCipher.decrypt(sid, raw)); label = labelOf(meta); full = TitleSync.modelLabel(meta) || label; vid = Brand.of(full) || ''; }
    catch { try { const mi = Models.get(sid); if (mi?.name) { label = cardName(mi.name) || Strength.canon(mi.name); vid = Brand.of(mi.name) || ''; } } catch {} }   // 解不开（别的口令）：用本机识别过的型号
    cache.set(k, label ? { label, vid, full: full || label } : null); pending.delete(k); schedulePaint();
  }
  function paint() {
    for (const a of document.querySelectorAll('a[href^="/agent/"]')) {
      if (!a.closest(SIDE)) continue;
      const sid = (/^\/agent\/([\w-]+)/.exec(a.getAttribute('href')) || [])[1]; if (!sid) continue;
      const te = textEl(a) || a.querySelector('[data-anc-hide]'); const raw = (te?.textContent || '').trim();
      if (!raw) continue;
      if (!TitleCipher.isEncoded(raw)) { if (a.dataset.ancT) { delete a.dataset.ancT; delete a.dataset.ancV; te?.removeAttribute('data-anc-hide'); } continue; }   // 名称不是加密的（官网 / 手动改过）：原样显示
      const hit = cache.get(sid + '|' + raw);
      if (hit === undefined) { void decode(sid, raw); continue; }
      if (!hit) continue;
      if (a.dataset.ancT !== hit.label) a.dataset.ancT = hit.label;
      if (hit.vid) { icon(hit.vid); if (a.dataset.ancV !== hit.vid) a.dataset.ancV = hit.vid; } else delete a.dataset.ancV;
      if (!te.hasAttribute('data-anc-hide')) te.setAttribute('data-anc-hide', '');
      if (a.title !== hit.full) a.title = hit.full || hit.label;
    }
  }
  function start() {
    if (timer) return;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); iconSheet = new CSSStyleSheet(); const add = () => { const s = document.adoptedStyleSheets; if (!s.includes(sheet)) document.adoptedStyleSheets = [...s, sheet, iconSheet]; }; add(); timer = setInterval(() => { try { add(); paint(); } catch {} }, 1200); paint(); } catch {}
  }
  return { start, paint, _cache: cache };
})();

