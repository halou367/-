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


async function init() {
  Bus.on('chat', c => scheduleChat(c));
  Bus.on('history', () => { UI.renderListSoon(); UI.renderTabs(); if (UI.els?.chat) scheduleChat(UI.els.chat); });
  Bus.on('models', sid => { if(!sid)UI.modelsV++;UI.renderTabs();UI.renderListSoon();const c=UI.els?.chat;if(c&&(!sid||c.sid===sid))scheduleChat(c);if(sid&&Chats.get(sid)&&c?.sid!==sid)Pager.dirty(Chats.get(sid)); });
  Bus.on('quota', () => UI.renderQuota());
  Bus.on('update', () => UI.renderQuota());
  Bus.on('pulse', () => UI.renderPulse());
  Bus.on('rank', () => UI.renderListSoon());
  // 上次没删完的归档对话（删到一半退出了 App / 在等每小时的额度）：打开 20 秒后接着删
  setTimeout(() => { try { if (isMob()) LaunchPick.preload(); } catch {} }, 4000);
  let _lastMobPreloadAt = 0;
  addEventListener('focus', () => { try { if (isMob() && now() - _lastMobPreloadAt > 30000) { _lastMobPreloadAt = now(); LaunchPick.preload(); } } catch {} });
  setTimeout(() => { try { Bulk.resume(); } catch {} }, 20e3);
  setTimeout(() => { try { ProtocolSchema?.autoSync?.(false); } catch {} }, 8000);
  setInterval(() => void ProbeBankCache.refresh(), 30 * 60e3);
  Bus.on('fav', () => UI.renderList());
  Bus.on('strength', () => { UI.renderListSoon(); try { if (Dock.tab === 'power') Dock.soon(); } catch {} });
  Bus.on('ip', () => { UI.renderIP(); UI.renderTabs();  });
  Bus.on('ipchange', (ip, prev) => {
    try { ReadLimit.until = 0; Quota.clear(true); } catch {}
    toast(`出口 IP 变化：${prev} → ${ip}`);
  });
  // 发送时人机验证没通过（recaptcha validation failed）：自动弹出并自动完成验证，完成后重新发送
  Bus.on('captcha', c => { if (!c || c.capAt > now() - 45000) return; c.capAt = now(); UI.retry(c, null, true); });
    Bus.on('relogin', r => { if (r?.ok) toast('会话已过期，已用保存的密码自动重新登录'); });
  let histT = 0;
  Bus.on('turn', (c, info) => {
    clearTimeout(histT); histT = setTimeout(() => History.touched(c.sid), 300);   // 本地挪到最前；只有新对话才去拉列表
    // 任务完成通知：App 在后台时，对话回复完成 / 等待你回答 / 出错 → 系统通知；假完成、中途断链待续接、抽卡对话一律不通知
    if (c.gacha || Gacha.owns(c.sid) || Prefs.notify === false || info?.forced || info?.fake || info?.midStall || c.fakeEnd || c.midTurnStall) return;
    if (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled?.(c)) return;
    const bg = (typeof document !== 'undefined' && document.hidden) || !document.hasFocus();
    if (!bg && !Host.notify) return;   // 安卓由外壳判断（App 在前台且正看着这个账号时不弹）
    try {
      // 通知标题用备注；没有备注用型号名（通知里没有厂商图标，用完整型号名如 glm-5.3），不再用「模型/时间/备注」整串会话名
      const raw = History.byId(c.sid)?.title || c.title || '', v = Titles.view(c.sid, raw), note = Notes.get(c.sid);
      const mdl = String(Strength.canon(v.model || v.plain || '') || '').trim();
      const name = note || mdl || noteBase(raw) || '对话', last = c.messages.at(-1);
      const txt = (last?.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      const ask = (() => { try { return Hitl.pending(c).length > 0; } catch { return false; } })();
      const title = (ask ? '等待你回答 · ' : c.error || c.status === 'error' ? '出错了 · ' : '任务完成 · ') + name, body = txt || c.error || (ask ? '需要你回答问题后才能继续' : '回复已完成');
      if (Host.notify) Host.notify({ title, body, sid: c.sid })?.catch?.(() => {});
      else { const n = new Notification(title, { body, silent: false }); n.onclick = () => { try { window.focus(); Tabs.open(c.sid); } catch {} }; }
    } catch {}
  });
  // Every identification entry point publishes the same local metadata; cloud writes wait for that chat to finish.
  Bus.on('model', (c,r) => {
    if(!r?.name)return;
    Titles.capture(c.sid, c.sentAt || undefined);
    ProbeArchive.consider(c,r);
  });
  Bus.on('sent', (sid, at) => Titles.sent(sid, at));

  // Scheme B 浏览器模式单实例秒切回客户端：同源 sessionStorage 快照直出，0ms 恢复原对话，后台异步初始化
  let fastReturn = null;
  try {
    const rawFr = sessionStorage.getItem('anc:fast-return');
    if (rawFr) {
      const parsed = JSON.parse(rawFr);
      if (parsed && Date.now() - (parsed.at || 0) < 30 * 60e3) {
        fastReturn = parsed;
        window.__ANC_FAST_RETURN = parsed;
        setTimeout(() => { delete window.__ANC_FAST_RETURN; }, 15000);
      }
      sessionStorage.removeItem('anc:fast-return');
    }
  } catch {}
  if (fastReturn) {
    const cmFast = Store.get('me:u', null) || ((Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length) ? { id: 'fast', email: '' } : null);
    if (cmFast && cmFast.id) {
      UI.me = cmFast;
      try {
        History.warm('fast');
        try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
        if (fastReturn.sid && /^[\w-]{4,64}$/.test(fastReturn.sid)) {
          const cFast = typeof chatOf === 'function' ? chatOf(fastReturn.sid) : null;
          const isEvalFast = Boolean(fastReturn.evalUrl || (cFast && typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(cFast)));
          if (isEvalFast && cFast) {
            if (typeof EvalEngine !== 'undefined' && EvalEngine.initEvalFields) {
              EvalEngine.initEvalFields(cFast, fastReturn.evalMode ? { evalMode: fastReturn.evalMode } : {});
            }
            if (typeof ModeState !== 'undefined' && ModeState.setMode) {
              const hRow = History.byId?.(fastReturn.sid);
              const targetM = fastReturn.evalMode || (hRow ? ModeState.inferEntryMode(hRow) : (cFast.evalMode || 'battle'));
              ModeState.setMode(targetM === 'agent' ? 'battle' : targetM, { silent: true });
            }
          }
          Tabs.open(fastReturn.sid);
        }
        else { Tabs.list = Tabs.list.filter(t => t && t.key); if (Tabs.list.length) { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); } }
        UI.renderList?.(); UI.renderAcct(); UI.shown();
      } catch {}
    }
  } else if (!window.__fixture && !window.__routeFixture && !/[?&](?:glogin|gfail|browse=1|offline=1)\b/.test(location.search) && !/^#reset=/.test(location.hash)) {
    try {
      const cmCold = Store.get('me:u', null);
      History.warm('fast');
      try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
      const coldBanned = Boolean(UI.host?.account?.ban || (cmCold && cmCold.id === UI.host?.account?.id && cmCold.banned === true));
      const hasColdCache = Boolean(!coldBanned && ((cmCold && cmCold.id && !/@example\.invalid$/i.test(String(cmCold.email || ''))) || (History.items && History.items.length > 0)));
      if (hasColdCache) {
        UI.me = (cmCold && cmCold.id) ? cmCold : { id: 'local', email: '' };
        Tabs.list = Tabs.list.filter(t => t && t.key);
        if (!Tabs.list.length) Tabs.newChat();
        else { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); }
        UI.renderList?.(); UI.renderAcct(); UI.renderQuota();
        UI.shown();
      }
    } catch {}
  }
  try { UI.setBootStep?.('正在读取账号与代理配置…', '正在从宿主进程同步当前账号信息'); } catch {}
  UI.host = await Promise.race([Host.info().catch(() => null), sleep(4500).then(() => null)]) || {};
  try { EnvRefresh.init(); } catch {}
  try { UI.setBootStep?.('正在恢复认证环境与节点状态…', (UI.host?.account?.email || UI.host?.account?.name || '') + (UI.host?.account?.proxyIp ? ' · ProxyIP ' + UI.host.account.proxyIp : '')); } catch {}
  await Promise.race([AuthEnv.restore().catch(e => { AuthEnv.lastError = describe(e); }), sleep(4500)]);
  AutoRoute.init();
  try { RouteWarm.start(); } catch {}
  // 进入账号自检：从浏览器模式切回客户端（fastReturn）或已有正常连接时不重复自检
  try { EnvCheck.init(); if (!EnterFlow.run && !fastReturn) void EnvCheck.go({ reason: 'boot', failover: true }); } catch {}
  // 「使用 Google 添加账号」新建的账号：第一次打开时一进来就直接去 Google（不等其它初始化、不先画登录页；只自动一次）
  let gErr = '';
  { const ga = UI.host?.account || {}, gk = 'gauto:' + ga.id, q0 = new URLSearchParams(location.search);
    if (location.pathname === '/robots.txt' && ga.id && ga.name === GOOGLE_NAME && !ga.email && !Store.get(gk, 0) && !q0.has('glogin') && !q0.has('gfail')) {
      Store.set(gk, now());
      const st = h('div', { class: 'lsub' }, '正在连接 Brana…');
      $('#view').replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate' }, h('div', { class: 'lform' },
        h('div', { class: 'hero-t' }, gIcon(), ' 正在打开 Google 登录'), st, h('i', { class: 'spin' })))));
      UI.shown();
      // 添加账号的窗口已经提前备好了 reCAPTCHA 令牌（2 分钟内有效、只能用一次）：拿来直接用
      let token = ''; try { const g = await Host.shared('gtok@' + ga.id); if (g?.t && now() - (g.at || 0) < 100e3) token = g.t; if (g) Host.shared('gtok@' + ga.id, null)?.catch?.(() => {}); } catch {}
      try { await Auth.google({ fresh: true, token, log: t => { st.textContent = t; } }); await new Promise(() => {}); }
      catch (e) { gErr = cleanErr(e); }
    }
  }
  // 手机：每次打开 App 先显示选账号页（各账号的金色数量 / 型号）
  if (Host.platform === 'android' && Host.launchPick?.()) LaunchPick.show().catch(() => {});
  Nodes.load().then(() => Nodes.syncAndroid()).then(() => Pool.pushG()).catch(() => {});
  // Draft recovery is independent of preferences; retain Shared -> account-gacha ordering.
  // Do not display an editable composer until draft merging is complete.
  try { UI.setBootStep?.('正在同步共享配置与本地草稿…', (UI.host?.account?.email || UI.host?.account?.name || '')); } catch {}
  const _bootSyncTask = async () => {
  await Promise.all([
    Shared.pull().catch(()=>{}).then(()=>Gacha.pullOwn().catch(()=>{})),
    Drafts.pull().catch(e=>console.warn(e)),
  ]);
  };
  await Promise.race([_bootSyncTask(), sleep(4500)]);
  try { if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(true); } catch {}
  // 外壳永远不该滚动：万一被 focus / scrollIntoView 滚动了（旧内核不支持 overflow:clip 时），立刻复位
  { const fix = e => { const t = e.target; if (t && t !== document && t !== document.body && t !== document.documentElement && t.id !== 'app' && t.id !== 'main') return; for (const el of t === document ? [document.scrollingElement, document.body] : [t]) if (el && (el === document.body || el === document.documentElement || el.id === 'app' || el.id === 'main') && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } };
    document.addEventListener('scroll', fix, { capture: true, passive: true }); }
  // 别的窗口（账号菜单）可能改了共享设置（金色点亮 / 主题 / 检测间隔）或本账号的抽卡设置：回到这个窗口时重新读一次
  let _lastFocusPullAt = 0;
  addEventListener('focus', () => {
    if (now() - _lastFocusPullAt < 25000) return;
    _lastFocusPullAt = now();
    Shared.pull().catch(() => {});
    if (!Gacha.busy()) Gacha.pullOwn().then(() => { UI.renderGachaBadge?.(); document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => GPop.paint?.(b)); }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (!(typeof document !== 'undefined' && document.hidden) && now() - _lastFocusPullAt >= 15000) { _lastFocusPullAt = now(); Shared.pull().catch(() => {}); } });
  UI.renderAcct(); UI.renderQuota(); UI.renderGachaBadge();
  try { History.warm(UI.host?.account?.id || 'web'); } catch {}
  void TitleSync.start().catch(e=>TitleSync.error(describe(e)));
  // 出口 IP 与实时延迟合一采样：前台每 30 秒由 IP.ping 同步刷新延迟与出口 IP（IP.poll 自动复用不重发）；窗口隐藏且非抽卡时延长至 5 分钟一次，大幅节省 EdgeTunnel 请求配额
  if (UI.host?.account?.status?.ip && !IP.ip) {
    IP.ip = UI.host.account.status.ip;
    if (UI.host.account.status.loc) IP.loc = UI.host.account.status.loc;
    IP.at = now(); IP.checkedAt = now();
    if (UI.host.account.status.ms) IP.recordRtt?.(UI.host.account.status.ms);
  }
  IP.poll();
  IP.ping(); setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden) && navigator.onLine !== false) IP.ping(); }, 30000);
  Bus.on('rtt', () => { const el = document.getElementById('ip-rtt'); if (el) { el.className = IP.rttCls(); el.textContent = IP.rttText(); } });
  setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden)) Traffic.tick(); }, 1000);
  setInterval(() => {
    if (IP.polling || ((typeof document !== 'undefined' && document.hidden) && !IP.fast)) return;
    const base = IP.fast ? 4000 : Math.max(15, Prefs.ipPoll || 60) * 1000, gap = (typeof document !== 'undefined' && document.hidden) && !IP.fast ? Math.max(base, 300000) : base;
    const retryGap = IP.err ? Math.max(gap, Math.min(120000, 15000 * 2 ** Math.min(IP.failures - 1, 3))) : gap;
    if (navigator.onLine !== false && now() - Math.max(IP.at, IP.checkedAt || 0) >= retryGap) IP.poll();
  }, 3000);

  // 邮件链接（找回 / 设置密码）跳回来：直接显示「设置新密码」
  // 浏览器模式输入框旁的「抽卡」按钮跳回来：登录就绪后直接打开抽卡面板
  { const m = /^#open=(\w+)/.exec(location.hash);
    if (m) { history.replaceState(null, '', '/robots.txt'); const kind = m[1], t0 = Date.now();
      const SEL = { quota: '#bar .bmeter', leader: '#bar .lpbtn', fplib: '#bar .fp-library-btn', region: '#bar .ipit', update: '#bar .bar-ver' };
      const w = setInterval(() => { if (Date.now() - t0 > 20000) { clearInterval(w); return; } if (!UI.me) return;
        if (kind === 'gacha') { clearInterval(w); try { GPop.openAny(); } catch {} return; }
        const el = document.querySelector(SEL[kind] || '#none'); if (el) { clearInterval(w); setTimeout(() => el.click(), 150); } }, 300); } }
  if (location.hash === '#gacha') { history.replaceState(null, '', '/robots.txt'); const t0 = Date.now(); const w = setInterval(() => { if (UI.me) { clearInterval(w); try { GPop.openAny(); } catch {} } else if (Date.now() - t0 > 20000) clearInterval(w); }, 300); }
  const rc = /^#reset=([^&]+)/.exec(location.hash);
  if (rc) { history.replaceState(null, '', '/robots.txt'); return UI.authGate('reset', { code: decodeURIComponent(rc[1]) }); }
  // 「网页注册」新建的账号：第一次打开直接进 Brana 官网（该账号自己的 IP / 指纹环境），顶部有浏览条，注册、收信、点验证链接都在这里手动完成
  { const account = UI.host?.account || {};
    if (account.id && Host.platform !== 'web' && typeof Host.login === 'function') {
      let w = null; try { w = await Host.shared('webreg@' + account.id); } catch {}
      if (w && w.at && Date.now() - w.at < 10 * 60e3) {
        try { await Host.shared('webreg@' + account.id, null); } catch {}
        try { Pin.hold(true); } catch {}   // 网页注册全程不固定旧部署（注册邮件、验证链接、设置密码要由同一个最新部署处理）
        try { await Host.login(); return; } catch (e) { toast('打开网页失败：' + cleanErr(e), 'err'); }
      }
    } }
  // Explicit signup intent wins over cached login and stored-password auto-login.
  { const account = UI.host?.account || {};
    if (account.id) {
      const key = 'signup@' + account.id;
      let stored;
      try { stored = await Host.shared(key); }
      catch { return UI.loginGate('注册任务读取失败，未自动登录；请重试或手动选择注册'); }
      const signup = AuthFlow.signupIntent(stored, account);
      if (signup) {
        let auto = false; try { const t = await MailToken.load(account.id); auto = !!t && AuthFlow.sameEmail(t.email, signup.email); } catch {}
        UI.authGate('signup', { email: signup.email, auto });
        try { if (await Host.shared(key, null) !== true) toast('注册页已打开，但任务清理未确认；下次启动可能再次显示注册页', 'err'); } catch { toast('注册页已打开，但任务清理失败', 'err'); }
        return;
      }
      if (stored) await Promise.resolve(Host.shared(key, null)).catch(() => {});
    }
  }
  const routeDraft=Store.get('auth-route-draft',null);
  if(routeDraft){Store.del('auth-route-draft');if(!AuthEnv.state?.locked&&routeDraft.accountId===UI.host?.account?.id&&Date.now()-routeDraft.at>=-60000&&Date.now()-routeDraft.at<30*60000&&['login','signup','forgot'].includes(routeDraft.mode)){
    UI.authDraft(UI.host.account,{email:String(routeDraft.email||''),name:String(routeDraft.name||'')});
    if(routeDraft.mode==='login')return UI.loginGate('线路已更新，已恢复邮箱草稿；未保存的密码请重新输入');
    return UI.authGate(routeDraft.mode,{email:String(routeDraft.email||''),err:'线路已更新，已恢复原认证步骤；不会自动发送请求'});
  }}
  let verification = null;
  try { verification = AuthFlow.verificationIntent(JSON.parse(localStorage.getItem('anc-auth') || 'null'), UI.host?.account); } catch {}
  const expectedEmail = verification?.email || AuthEnv.state?.email || UI.host?.account?.email || '';
  const canonEmail = e => { const raw = String(e || '').trim().toLowerCase(); const [l, d] = raw.split('@'); return d ? l.replace(/\+.*$/, '').replace(/[.,\-_]/g, '') + '@' + d : raw; };
  const sameAcctEmail = (a, b) => AuthFlow.sameEmail(a, b) || AuthFlow.sameMailbox?.(a, b) || (canonEmail(a) && canonEmail(a) === canonEmail(b));
  const checkedUser = user => {
    if (!Auth.real(user)) return null;
    const mustMatch = verification || (AuthEnv.state?.locked && AuthEnv.state.kind !== 'login');
    const target = mustMatch && !sameAcctEmail(user.email, expectedEmail) ? expectedEmail : user.email;
    const checked = AuthFlow.identity(user, target);
    if (checked && typeof checked === 'object') {
      checked.email = AuthFlow.pickRichEmail(UI.host?.account?.email || expectedEmail || UI.host?.account?.name, checked.email);
    }
    return checked;
  };
  // 秒开：上次登录过的账号先用本地缓存把界面（标签页 / 对话列表 / 对话内容缓存）画出来，同时后台核对登录状态
  // （切换账号、冷启动时不再白屏等网络；核对失败再换成登录页）
  let early = false;
  const shell = () => {
    Tabs.list = Tabs.list.filter(t => t && t.key);
    if (!Tabs.list.length) Tabs.newChat();
    else { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); }
    try { const ta = $('#view textarea'); if (ta && !ta.value && Tabs.cur?.draft) ta.value = Tabs.cur.draft; } catch {}
    UI.renderList?.(); UI.renderListSoon?.();
  };
  {
    if (!window.__fixture && !window.__routeFixture && (!History.items || !History.items.length)) {
      try { await Promise.race([History.restoreFromLocalCache?.() || Promise.resolve(), sleep(60)]); } catch {}
    } else {
      try { void History.restoreFromLocalCache?.(); } catch {}
    }
    const cm = Store.get('me:u', null);
    const hasLocalState = !!(History.items?.length || Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length || Tabs.list?.length || (typeof MsgCache !== 'undefined' && MsgCache.keys?.()?.length));
    const isFixtureAcct = Boolean(window.__fixture || window.__routeFixture || /@example\.invalid$/i.test(String(UI.host?.account?.email || '')) || /^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(String(UI.host?.account?.proxy || '')));
    const hasConfiguredAccount = Boolean(!isFixtureAcct && (UI.host?.account?.email || UI.host?.account?.hasPw || UI.host?.account?.hasPassword || UI.host?.account?.status?.loggedIn));
    if ((cm && cm.id && (!expectedEmail || sameAcctEmail(cm.email, expectedEmail))) || hasLocalState || hasConfiguredAccount) {
      const em = expectedEmail || cm?.email || UI.host?.account?.email || UI.host?.account?.name || '本地账号';
      UI.me = (cm && cm.id) ? cm : { id: UI.host?.account?.id || 'local', email: em, name: String(em).split('@')[0] };
      early = true;
      try { shell(); UI.renderAcct(); } catch (e) { console.warn(e); }
      UI.shown();
    }
  }
  // 连接失败不再直接跳登录页（以前一断网就像「账号密码丢了」）：原地自动重试，间隔逐渐拉长，期间重测出口 IP；
  // 已经用缓存画出界面的，界面保持不动，只在顶上显示一条重试提示
  const conn = { bar: null, n: 0 };
  const connWait = (why, slow) => new Promise(res => {
    why = /failed to fetch|networkerror|load failed/i.test(why) ? '网络不通' : why;
    const n = ++conn.n, waits = slow ? [10, 20, 30] : [2, 3, 5, 8, 12, 20, 30];
    let left = waits[Math.min(n - 1, waits.length - 1)], tm = 0;
    let finished = false;
    const done = value => { if (finished) return; finished = true; clearInterval(tm); now.disabled = true; res(value); };
    const txt = h('span', {}), now = h('button', { type: 'button', class: 'link', onclick: () => { left = 0; tick(); } }, '立即重试');
    const tick = () => { if (finished) return; if (left <= 0) { txt.textContent = '正在重新登录…'; done(); return; } txt.textContent = '账号登录暂未完成（' + why + '），' + left + ' 秒后重试'; left--; };
    if (!early && !window.__BRANA_BROWSE_MODE && !window.__fixture && !window.__routeFixture) {
      try { UI.enterBrowseMode?.(); } catch {}
    }
    try { if (typeof RegionIP !== 'undefined' && !RegionIP.view && !window.__routeFixture && !window.__fixture) RegionIP.open({ offlineAlert: true }); } catch {}
    conn.bar?.remove(); conn.bar = h('div', { class: 'connbar' }, h('i', { class: 'spin' }), txt, now, h('button', { type: 'button', class: 'link', onclick: () => { try { RegionIP.open({ offlineAlert: true }); } catch {} done('gate'); } }, '切换节点')); document.body.append(conn.bar);
    UI.shown();
    tick(); if (!finished) tm = setInterval(tick, 1000);
  });
  const connOk = () => { conn.bar?.remove(); conn.bar = null; conn.n = 0; };
  // Cached UI/read-only refreshes do not wait behind a slow account metadata endpoint.
  // Authentication, saved credentials and automatic task resume still require /api/me.
  if (early) { KeepAlive.start(); }
  if ((/[?&]browse=1\b/.test(location.search) || window.__BRANA_BROWSE_MODE) && !(typeof EnvRefresh !== 'undefined' && EnvRefresh.justRefreshed)) {
    const isOfflineBoot = /[?&]offline=1\b/.test(location.search);
    if (isOfflineBoot) {
      try { if (location.pathname === '/robots.txt') history.replaceState(null, '', '/robots.txt'); } catch {}
    }
    UI.enterBrowseMode(isOfflineBoot ? '网络无法连接，已开启离线查阅 · 可切换节点或点 × 直接查阅本地对话' : '已进入查阅模式（免登录浏览本地缓存对话）');
    if (isOfflineBoot && !window.__routeFixture && !window.__fixture) {
      try { if (typeof RegionIP !== 'undefined') RegionIP.open({ offlineAlert: true }); } catch {}
      try { if (typeof AutoRoute !== 'undefined') void AutoRoute.request('network', true); } catch {}
    }
    return;
  }
  try { UI.setBootStep?.('正在连接 arena.ai 核对登录状态…', (UI.host?.account?.email || '') + (UI.host?.account?.proxyIp ? ' · ' + UI.host.account.proxyIp : '')); } catch {}
  const check = await Promise.race([
    SessionGate.check({ early }),
    ...(early && !window.__fixture && !window.__routeFixture ? [new Promise(r => setTimeout(() => r({ state: 'offline', reason: 'timeout' }), 6000))] : []),
  ]);
  if (check.browse || window.__BRANA_BROWSE_MODE) {
    if (!UI.authed) UI.enterBrowseMode('已进入查阅模式（免登录浏览本地缓存对话）');
    return;
  }
  if (check.manual) {
    if (early && !window.__fixture && !window.__routeFixture) { UI.enterBrowseMode('账号和本地对话已保留 · 可直接查阅本地记录，或点右上角重新登录'); return; }
    UI.loginGate('账号和本地对话已保留。请检查登录验证或线路后重试，或点「查阅模式」免登录浏览本地记录。');
    return;
  }
  let me = check.value;
  connOk();
  try { UI.me = checkedUser(me?.user); if (UI.me) await AuthEnv.finish(UI.me); }
  catch (e) { UI.me = null; Store.del('me:u'); if (expectedEmail) UI.authDraft(UI.host?.account, { email: expectedEmail }); return UI.loginGate(cleanErr(e)); }
  // 邮件验证刚完成却读不到登录：先确认不是旧部署固定造成的（改跟随最新部署、稍等 Cookie 落盘后再核对一次）
  if (verification && !UI.me) { try { if (Pin.on()) Pin.fallback('邮件验证后的登录会话在旧部署上读不到'); Pin.hold(true); await sleep(1500); const again = await api('/api/me', { noRelogin: true }); UI.me = checkedUser(again?.user); if (UI.me) await AuthEnv.finish(UI.me); } catch { UI.me = null; } }
  if (verification && !UI.me) { UI.authDraft(UI.host?.account, { email: expectedEmail }); return UI.loginGate('邮件验证后的登录会话尚未确认，请先完成官方验证后刷新状态'); }
  if (!UI.me && AuthEnv.state?.stage === 'waiting-mail' && !AuthEnv.state.expired) return UI.authGate('link', { kind: AuthEnv.state.kind, email: AuthEnv.state.email });
  if (!UI.me && AuthEnv.state?.locked) return UI.loginGate(AuthEnv.state.expired ? '认证任务已过期，线路仍锁定；请取消旧任务后重新开始' : '存在未完成的认证，请继续使用任务邮箱，或明确取消后再开始');
  let needShell = !early;
  // 未登录：有保存的密码就直接用接口登录，否则显示登录表单
  if (!UI.me) {
    needShell = (!early || !!window.__fixture || !!window.__routeFixture);
    const cred = await Host.getCred().catch(() => null);
    if (cred?.email && cred?.password) {
      if (!early || window.__fixture || window.__routeFixture) {
        $('#view').replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'lform' }, h('div', { class: 'hero-t' }, '正在登录…'), h('div', { class: 'lsub' }, cred.email + ' · ' + (isDirectP(UI.host.account?.proxy) ? '直连' : '代理 ' + maskProxy(UI.host.account?.proxy))), h('i', { class: 'spin' }))));
        UI.shown();
      }
      let signInTries = 0;
      const maxSignInRetries = (window.__fixture || window.__routeFixture) ? 99 : 1;
      for (;;) {
        try { UI.me = checkedUser(await Auth.signIn(cred.email, cred.password)); connOk(); break; }
        catch (e) {
          // Read retries may recover automatically; an unconfirmed authentication POST is never replayed.
          if (++signInTries <= maxSignInRetries && e.net && await connWait(describe(e), e.slow) !== 'gate') continue;
          connOk();
          try { Host.noteAccount?.({ loggedIn: false })?.catch?.(() => {}); } catch {}
          if (early && !window.__fixture && !window.__routeFixture) { UI.enterBrowseMode('自动登录暂未完成（' + describe(e) + '）· 已保留本地缓存对话'); return; }
          UI.renderAcct(); return UI.loginGate('自动登录失败：' + describe(e));
        }
      }
    } else if (early && !window.__fixture && !window.__routeFixture && (History.items?.length || Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length)) {
      try { Host.noteAccount?.({ loggedIn: false })?.catch?.(() => {}); } catch {}
      UI.enterBrowseMode('已保留本地缓存对话 · 登录会话过期，可直接查阅本地记录');
      return;
    }
  }
  if (verification && UI.me) {
    const a = UI.host?.account || {};
    const richEmail = AuthFlow.pickRichEmail(a.email || verification?.email || a.name, UI.me.email);
    UI.me.email = richEmail;
    try {
      const saved = await Host.saveAccount({ id: a.id, email: richEmail,
        name: !a.name || a.name === a.email || /^账号 ?\d*$/.test(a.name) ? richEmail : a.name,
        ...(!sameAcctEmail(a.email, richEmail) ? { clearPassword: true } : {}) });
      if (!saved?.id || saved.error) throw new Error(saved?.error || '保存账号失败');
      UI.host = await Host.info();
      localStorage.removeItem('anc-auth'); localStorage.removeItem('anc-auth-email');
    } catch (e) { UI.me = null; return UI.loginGate('身份已核对，但本地账号信息保存失败：' + cleanErr(e)); }
  }
  UI.activateAuthedSession = async function(user) {
    if (!user?.id) { location.reload(); return; }
    Store.set('me:u', user);
    UI.me = user;
    UI.authed = true;
    window.__BRANA_BROWSE_MODE = false;
    try { document.querySelectorAll('.connbar, .route-recovery-note, .modal-back.auth-back').forEach(el => el.remove()); } catch {}
    try { shell(); UI.renderAcct(); UI.renderTabs(); UI.shown(); } catch { location.reload(); return; }
    try { Acct.report(); } catch {}
    void (async () => {
      try { await Promise.all([Models.load?.(), History.refresh?.(), Pulse.poll?.()]).catch(() => {}); UI.renderList?.(); UI.renderAcct?.(); KeepAlive.start?.(); } catch {}
    })();
  };
  UI.authed = true; UI.renderAcct();
  // 在网页里（网页注册 / 网页登录 / 令牌链接跳转 / 浏览器模式）登录成功、回到客户端后，把邮箱与网页填写/预设的密码记到这个账号上（代理 / 地区 / 节点原样保留）
  { const c = UI.host?.account || {}, hasSavedPw = Boolean(c.hasPw || c.hasPassword);
    const richEmail = AuthFlow.pickRichEmail(c.email || c.name, UI.me?.email);
    if (UI.me && richEmail) UI.me.email = richEmail;
    if (c.id && ((!c.email && UI.me?.email) || (!hasSavedPw && UI.me?.email)) && !/[?&]glogin=1/.test(location.search)) (async () => {
      let stashedPw = '';
      try { stashedPw = localStorage.getItem('anc-regpw') || ''; } catch {}
      if (!stashedPw && typeof Host.shared === 'function') try { const r = await Host.shared('regpw@' + c.id); if (r?.pw) stashedPw = r.pw; } catch {}
      if (!stashedPw && typeof MailToken !== 'undefined') try { const t = await MailToken.load(c.id); if (t?.password) stashedPw = t.password; } catch {}
      if (c.email && (!stashedPw || hasSavedPw)) return;
      const finalEmail = AuthFlow.pickRichEmail(c.email || c.name, richEmail);
      await Host.saveAccount({
        id: c.id,
        name: c.name && c.name !== WEBREG_NAME && c.name !== GOOGLE_NAME && !/^账号 ?\d*$/.test(c.name) ? c.name : finalEmail,
        email: finalEmail,
        ...(stashedPw && !hasSavedPw ? { password: stashedPw } : {}),
        proxy: c.proxy ?? '', proxyIp: c.proxyIp ?? '', nodeId: c.nodeId, region: c.region,
      });
      try { await Host.noteAccount?.({ email: finalEmail, loggedIn: true }); } catch {}
      try { localStorage.removeItem('anc-regpw'); } catch {}
      UI.host = await Host.info().catch(() => UI.host);
      UI.renderAcct();
      if (!c.email) toast('账号已记录：' + finalEmail);
    })().catch(() => {}); }
  // Google 登录回来（?glogin=1）：登录上了就把邮箱记到这个账号上（代理 / 地区原样保留，不动密码）；没登录上就回登录页说明原因
  const gback = /[?&]glogin=1/.test(location.search), gfail = new URLSearchParams(location.search).get('gfail');
  if (gfail != null) { try { history.replaceState(null, '', location.pathname); } catch {} }
  if (gback) {
    try { history.replaceState(null, '', location.pathname); } catch {}
    Store.del?.('glogin');
    const c = UI.host?.account || {};
    const richEmail = AuthFlow.pickRichEmail(c.email || c.name, UI.me?.email);
    if (UI.me && richEmail) UI.me.email = richEmail;
    if (richEmail) Promise.resolve(Host.saveAccount({ id: c.id, name: c.name && !/^账号 ?\d*$/.test(c.name) && c.name !== c.email && c.name !== GOOGLE_NAME ? c.name : richEmail, email: richEmail, proxy: c.proxy ?? '', proxyIp: c.proxyIp ?? '', nodeId: c.nodeId, region: c.region }))
      .then(async () => { UI.host = await Host.info().catch(() => UI.host); UI.renderAcct(); toast('已用 Google 登录：' + richEmail); })
      .catch(e => toast('已用 Google 登录，但保存账号信息失败：' + cleanErr(e)));
  }
  // 账号菜单里点了「抽卡」：这个窗口是为后台抽卡打开的（隐藏窗口），登录后直接开始抽
  const cmd = await Host.takeCmd?.().catch(() => null);
  const bgStart = () => { const r = Gacha.start(); if (!r.ok) Host.noteAccount?.({ gacha: { busy: false, err: r.error } })?.catch?.(() => {}); else GPop.report(); };
  Host.onCmd?.(async m => { if (m?.gacha === 'start') { if (!UI.me) Host.noteAccount?.({ gacha: { busy: false, err: '未登录' } }); else if (!Gacha.busy()) { await Gacha.pullOwn().catch(() => {}); bgStart(); } else GPop.report(); } else if (m?.gacha === 'stop') { Gacha.stop(); GPop.report(); } else if (m?.gacha === 'captcha') { if (Gacha.needCaptcha()) GPop.captcha(); }
    // 别的窗口改了主题：这边跟着换（不回写，避免来回改）
    if (m?.theme && ['auto', 'light', 'dark'].includes(m.theme) && Prefs.theme !== m.theme) { Prefs.theme = m.theme; Store.set('prefs', Prefs); UI.applyTheme(); }
    // 别的窗口改了金色注释点亮：所有账号同步更新对话卡片和统计
    if (m?.goldMode || Array.isArray(m?.goldSet)) {
      if (m.goldMode) Prefs.goldMode = m.goldMode;
      if (Array.isArray(m.goldSet)) Prefs.goldSet = m.goldSet;
      if (Array.isArray(m.goldChats)) Prefs.goldChats = m.goldChats;
      if (m.goldAt) Prefs.goldAt = m.goldAt;
      Store.set('prefs', Prefs);
      try { if (typeof Gold !== 'undefined') { Gold._set = null; Gold._autoSet = null; } } catch {}
      try { Bus.emit('prefs'); Bus.emit('gold'); } catch {}
      try { UI.renderList?.(); } catch {}
      try { AcctStats.soon?.(200); } catch {}
    }
    if (m?.acctCheckHours != null && Prefs.acctCheckHours !== m.acctCheckHours) {
      Prefs.acctCheckHours = m.acctCheckHours;
      Store.set('prefs', Prefs);
      try { if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(false); } catch {}
    }
    if (m?.pinDpl !== undefined || m?.autoCostDpl !== undefined) {
      if (m.pinDpl) Prefs.pinDpl = m.pinDpl; else delete Prefs.pinDpl;
      if (m.autoCostDpl) Prefs.autoCostDpl = m.autoCostDpl;
      Store.set('prefs', Prefs);
      try { Pin.initSmartPool?.(); Pin.ensure?.(true); } catch {}
      try { BillingProbe?.setSkewDpl?.(m.pinDpl || m.autoCostDpl || Pin.dpl(), Boolean(m.pinDpl)); } catch {}
      try { Bus.emit('pin'); } catch {}
    }
    if (m?.pelshotsSync) {
      try { if (typeof PelicanShots !== 'undefined' && PelicanShots.pull) void PelicanShots.pull(false, true, true); } catch {}
    }
    if (m?.habitBankSync) {
      try {
        if (typeof ChatHabitFingerprint !== 'undefined') {
          if (m.habitBankSync.samples && ChatHabitFingerprint.applyRemoteSync) {
            ChatHabitFingerprint.applyRemoteSync(m.habitBankSync, { persistToHost: false });
          } else if (ChatHabitFingerprint.syncShared) {
            void ChatHabitFingerprint.syncShared({ force: true });
          }
        }
      } catch {}
    }
    // 账号管理窗口：打开某个对话 / 重新统计
    if (m?.tokenRegStep) { try { window.__onTokenRegStep?.(m); } catch {} }
    if (m?.open && UI.me) Tabs.open(m.open);
    if (m?.stats) AcctStats.cmd(m).catch(() => {});
  });
  if (UI.me) Store.set('me:u', UI.me); else Store.del('me:u');
  if (!UI.me) { if (cmd === 'gacha-start') Host.noteAccount?.({ gacha: { busy: false, err: '未登录：请先打开这个账号登录' } })?.catch?.(() => {}); if (cmd?.stats) Host.noteAccount?.({ statsDone: true, statsErr: '未登录：请先打开这个账号登录' })?.catch?.(() => {}); const ga = UI.host?.account || {}, gk = 'gauto:' + ga.id;
    // 「使用 Google 添加账号」新建的账号：第一次打开时自动开始官方 Google 登录（只自动一次；取消后在登录页手动点）
    if (!gback && gfail == null && ga.id && ga.name === GOOGLE_NAME && !ga.email && !Store.get(gk, 0)) { Store.set(gk, now()); UI.loginGate('正在打开 Google 登录…'); setTimeout(() => document.querySelector('.gsign')?.click(), 300); return; }
    Recaptcha.load().catch(() => {});   // 预先加载：点「使用 Google 登录」时不用再等
    { const ga = UI.host?.account || {}; if (ga.name === GOOGLE_NAME && !ga.email && gfail == null) Auth.prewarm(); }   // Google 账号：后台提前建好访客会话
    if (gErr) return UI.loginGate('自动打开 Google 登录失败：' + gErr + '。可以点下面的「使用 Google 登录」再试一次。');
    return UI.loginGate(gfail != null ? 'Google 登录页打不开：' + (gfail || '连接失败') + '。已自动重试 3 次，一般是当前线路（节点 / ProxyIP）偶发不稳定：再点一次「使用 Google 登录」通常就好，不行就换个地区再试。' : gback ? 'Google 登录没有完成（中途取消了，或 Google 拒绝了这次登录）。可以再试一次，或用邮箱密码登录。' : undefined); }
  Acct.report();

  try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
  if (needShell) shell(); else { UI.renderTabs(); }
  UI.shown();
  // 只取第一页（最近 50 条），更早的在侧栏滚到底时再加载（和网页一致）；不再启动时 + 每 4 分钟把全部历史翻一遍
  if (History.err) { History.err = null; History.blocked = false; }
  setTimeout(() => { try { if (typeof RunningTracker !== 'undefined') void RunningTracker.resumeOnStartup(); } catch {} }, 600);
  if (!History.lastLoad || fastReturn) {
    void History.refresh().then(() => {
      try { if (typeof RunningTracker !== 'undefined') void RunningTracker.resumeOnStartup(); } catch {}
      if (!fastReturn) return;
      try {
        const topE = History.items?.[0];
        if (!fastReturn.sid && topE?.id && Date.now() - (typeof entAt === 'function' ? entAt(topE) : 0) < 10 * 60e3 && Tabs.cur?.sid !== topE.id) {
          Tabs.open(topE.id, { title: topE.title });
        }
        const curSid = Tabs.cur?.sid;
        const curC = curSid ? Chats.get(curSid) : null;
        if (curC) {
          if (curC.loaded && !curC.loading) curC.quickSync?.(true);
          else if (!curC.loading) curC.load(true).catch(() => {});
        }
      } catch {}
    });
  }
  setInterval(() => History.auto('tick'), 10000);   // 每 10 秒看一眼，按 GAP 节奏后台同步列表
  ProbeArchive.start();
  KeepAlive.start();
  // 启动就加载 reCAPTCHA（让它从一开始就观察页面上的正常操作），但不在启动瞬间取令牌：
  // 刚打开、还没有任何操作时取的 v3 令牌分数偏低，更容易被要求人机验证；改成点进输入框 / 选附件时再预取（发送时仍然不用等）
  Recaptcha.load().catch(e => toast(e.message, 'err'));
  Pulse.poll(); Pulse.loop();
  Ranking.refresh();
  Gacha.resume(); SendQ.start();
  // 告诉 App 这个账号有没有正在进行的事（抽卡 / 排队消息 / 回复中）：有就让手机熄屏后保持 CPU 和网络（安卓），电脑不进入睡眠挂起
  const bgRep = () => {
    try {
      const cs = [...Chats.values()], w = { gacha: !!Gacha.busy(), queue: cs.reduce((n, c) => n + (c.queue?.length || 0), 0), stream: cs.filter(c => c.busy).length };
      const k = JSON.stringify(w); if (k === bgRep.k && now() - bgRep.at < 20000) return;
      bgRep.k = k; bgRep.at = now(); Host.bgWork?.(w)?.catch?.(() => {});
    } catch {}
  };
  // 安卓：第一次（只问一次）请用户允许不受电池优化限制，熄屏后才能持续抽卡 / 发队列
  if (Host.bgStatus) { const ask = async () => { const r = await Host.bgStatus().catch(() => null); if (!r || r.battery || r.asked || !r.front) return; if (document.querySelector('.lpick,.modal-back:not(.anc-gh),.eflow')) { setTimeout(ask, 3000); return; } Host.bgAllow('asked'); if (await Dialog.confirm({ title: '允许后台运行', text: '熄屏或切到后台时继续抽卡、发送队列消息、接收回复，需要允许 Brana AI 不受电池优化限制。之后也可以在「设置 → 后台运行」里改。', ok: '去允许' })) Host.bgAllow('battery'); }; setTimeout(ask, 5000); }
  setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden) || bgRep.k !== '{"gacha":false,"queue":0,"stream":0}') bgRep(); }, 10000); Bus.on('gacha', () => { clearTimeout(bgRep.t); bgRep.t = setTimeout(bgRep, 300); }); Bus.on('turn', () => { clearTimeout(bgRep.t); bgRep.t = setTimeout(bgRep, 300); }); setTimeout(bgRep, 1500);
  if (cmd?.open) setTimeout(() => Tabs.open(cmd.open), 300);
  // 点「任务完成」通知进来：打开那个对话
  window.__ancOpenSid = sid => { Host.takeOpen?.()?.catch?.(() => {}); if (sid === '__captcha') { try { Gacha.openCaptcha(); } catch {} return; } if (sid && UI.me) Tabs.open(sid); };
  Host.takeOpen?.().then(s => { if (s && UI.me) setTimeout(() => Tabs.open(s), 300); }).catch(() => {});
  // 安卓 13+：通知需要权限（只问一次）
  if (Host.notifyPerm && Prefs.notify !== false) setTimeout(() => Host.notifyPerm(true).catch(() => {}), 2500);
  if (cmd?.stats) setTimeout(() => AcctStats.cmd(cmd).catch(() => {}), 800);
  if (cmd === 'gacha-start') setTimeout(() => { if (!Gacha.busy()) bgStart(); else GPop.report(); }, 1200); else GPop.report();
  // 安卓多账号：这个账号的页面被切到最前面（之前在后台运行）：同步状态栏配色、刷新出口 IP / 对话列表
  window.__ancFront = () => { try { Chrome.apply(); IP.poll(); History.auto('front'); UI.renderGachaBadge?.(); Sync.kick(); } catch {} };
  Sync.start();
  // 窗口重新可见时，检查没有在流式接收的进行中对话
  document.addEventListener('visibilitychange', () => { if (!(typeof document !== 'undefined' && document.hidden)) { for (const c of Chats.values()) if (c.busy && !c.streaming && !c.isEvaluation && !(typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(c))) c.stream(); IP.poll(); } });
}

function boot() {
  const isMgrFile = window.top === window && location.protocol === 'file:' && /[?&]mgr=1\b/.test(location.search);
  if (!isMgrFile && (window.top !== window || location.origin !== ORIGIN)) return;
  try { Object.defineProperty(window, '__anc', { value: { BillingProbe, EnvRefresh, EnvCheck, StreamMD, ChatExport, Connectors, HtmlPreview, PelicanShots, CapRoute, Recaptcha, NetHealth, NetPolicy, ThinkingStatus, WorkspacePath, WorkspacePreview, MD, SessionGate, AutoRoute, RoutePolicy, RouteState, NodeRoutes, AuthEnv, RegionIP, Bulk, Brand, Gacha, Host, Auth, Bus, chatOf, IPRep, Update, Cap, Calib, Fmt, CS, Pin, FmtAcc, History, Drafts, TabSw, Warm, PoolGuard, RegionAdvisor, PoolMaint, SubMaint, NodeImport, Sync, acctWheel, acctCard, Gold, GoldBoard, PView, LeaderPop, TabPress, userAtts, attZoom, Side, AcctStats, LaunchPick, MgrWin, SendQ, Notes, Mob, Pager, EnterFlow, Hitl, Vless, Nodes, NodeEditor, NodeMgr, Chats, chatOf, Tabs, UI, History, Models, Store, Trigger, Pulse, IP, Trace, Workspace, Dock, WS, Bar, Prefs, Recaptcha, createChat, R, Uploads, Revolver, GPop, Notes, Titles, TitleSync, TitleCompact, TitleCipher, ProbeArchive, Fingerprint, FingerprintBatch, GachaPrompts, Dialog, AutoId, Strength, PView, StrPick, Side, Price, LiveEst, KeepAlive, Palette, ExtPop, LeaderPop, Steps, FileLink, Tip, Pool, ProxySet, GSlot, Fav, LocalProxy, proxyField, ModeState, ModelCatalog, EvalEngine, ModeSwitcher, EvalView, get Gacha() { return Gacha; } } }); } catch {}
  // 桌面账号管理窗口（本地页面）：只显示账号管理，不联网
  if (isMgrFile) { MgrWin.boot(); return; }
  if (window.__ANC_BOOTED) return; window.__ANC_BOOTED = true;
  // 文件拖到输入框以外的地方时不要让窗口跳转去打开这个文件
  addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  if (location.pathname !== '/robots.txt') { if (Host.platform !== 'web') overlay(); return; }
  const start = () => { UI.build(); Mob.bind(); window.__arenaNextClientLoaded = true;
    // 全面屏：安卓外壳给出状态栏 / 导航栏高度（页面画到屏幕边缘，自己留白）
    try { const A = window.BranaAndroid; if (A?.insets) { const [t, b] = JSON.parse(A.insets()); const st = document.documentElement.style; st.setProperty('--sa-top', t + 'px'); st.setProperty('--sa-bottom', b + 'px'); } } catch {}
    // 从选账号页进入的新页面：一开始就盖上进度层，并马上让外壳切过来（用进度层代替「正在切换」转圈）
    if (Host.platform === 'android' && Host.takeEnter?.()) { EnterFlow.go(); requestAnimationFrame(() => requestAnimationFrame(() => UI.shown())); }
    setTimeout(() => { try { window.BranaHost?.ready?.()?.catch?.(() => {}); } catch {} }, 320); init().catch(e => { console.error(e); try { UI.setBootStep?.('初始化遇到问题：' + (e?.message || e), '可点击下方按钮切换节点、进入离线查阅或重新加载', true); } catch {} toast('初始化失败：' + e.message, 'err'); UI.shown(); }); setTimeout(() => UI.shown(), 3500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
boot();
