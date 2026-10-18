// 内嵌预览：点对话里 Write 出来的文件那一行（html / svg 运行预览；md 渲染预览；js / 代码 / 文本文件看代码） → 右侧「工作区 + 模型信息」收起，换成一个预览窗格
// （预览 / 代码 两个视图）；关闭窗格就恢复成点开之前的样子（那两个面板的开合状态一直没动过，只是被 CSS 盖住）。
// 安全：窗格里页面放进 sandbox 的 iframe —— 给 allow-scripts 但不给 allow-same-origin（脚本在独立的空白源里跑，碰不到客户端、Cookie、存储），
// 不给 allow-popups / allow-forms / allow-top-navigation，CSP 断网（脚本只允许页面自带的内联脚本）。对话里的小窗和「记录」用的副本不跑脚本。
// 「记录」：把此刻看到的画面（含 CSS 动画的当前帧）画成一张小图，存到模型信息 · 概览 · 鹈鹕测试图，攒成能力表（SVG）。
ICON.pvcode = ICON.pvcode || '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>';
ICON.pvplay = ICON.pvplay || '<path d="M7 5l12 7-12 7z"/>';
ICON.pvcam = ICON.pvcam || '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
ICON.pvwin = ICON.pvwin || '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>';
ICON.pvfolder = ICON.pvfolder || '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
ICON.pvdown = ICON.pvdown || '<path d="M6 9l6 6 6-6"/>';
ICON.pvdl = ICON.pvdl || '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>';
ICON.pvunfull = ICON.pvunfull || '<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>';
ICON.pvfull = ICON.pvfull || '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>';
ICON.check = ICON.check || '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
ICON.pvtable = ICON.pvtable || '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>';
const HtmlPreview = (() => {
  const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; base-uri 'none'; form-action 'none'";
  const CSP_RUN = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";
  const NOBAR = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}';
  const MAXCODE = 400000;
  let st = null, root = null, frame = null;
  const CODE = /\.(?:m?[jt]sx?|cjs|json|jsonc|css|scss|less|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|lua|sh|bash|zsh|ps1|bat|ya?ml|toml|ini|xml|sql|txt|csv|log|vue|svelte|diff|patch)$/i;
  const kindOf = path => { const f = String(path || '').split(/[?#]/)[0]; return /\.(?:html?|svg)$/i.test(f) ? 'html' : /\.(?:md|markdown|mdx)$/i.test(f) ? 'md' : CODE.test(f) ? 'code' : null; };
  const previewable = path => kindOf(path) !== null;
  const hasScript = html => /<script[\s>]/i.test(html) || /\son[a-z]+\s*=/i.test(html);
  // 把任意 html / svg 文本整理成「只读」文档：补 CSP、去掉自动跳转和外链，svg 单文件包一层页面
  function docOf(text, name, { run = false, thumb = false } = {}) {
    const svg = /\.svg$/i.test(name || '') || (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text) && !/<html[\s>]/i.test(text));
    const src = svg ? '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}body{display:flex;align-items:center;justify-content:center}svg{width:100%;height:100%}</style></head><body>' + text.replace(/^\s*<\?xml[^>]*>/i, '') + '</body></html>' : text;
    const d = new DOMParser().parseFromString(src, 'text/html');
    d.querySelectorAll('meta[http-equiv]').forEach(m => m.remove());
    d.querySelectorAll('a[href]').forEach(a => { if (!/^#/.test(a.getAttribute('href'))) a.removeAttribute('href'); });
    d.querySelectorAll('form').forEach(f => f.removeAttribute('action'));
    const m = d.createElement('meta'); m.setAttribute('http-equiv', 'Content-Security-Policy'); m.setAttribute('content', run ? CSP_RUN : CSP);
    d.head.prepend(m);
    if (thumb) { const s = d.createElement('style'); s.textContent = NOBAR; d.head.append(s); }   // 小窗只是缩略图：不画页面自己的滚动条
    return '<!doctype html>' + d.documentElement.outerHTML;
  }
  const isSvgDoc = (text, name) => /\.svg$/i.test(name || '') || (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text) && !/<html[\s>]/i.test(text));
  // 从工作区打开的 html：把相对路径的 CSS / 图片读出来内联进页面（脚本不跑，所以 JS 不用管）；读不到的就跳过
  async function inlineAssets(html, path, ctx) {
    const d = new DOMParser().parseFromString(html, 'text/html'), dir = String(path).split('/').slice(0, -1);
    const resolve = ref => {
      let r = String(ref || '').trim(); if (!r || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r)) return null;
      r = r.split(/[?#]/)[0]; const parts = r.startsWith('/') ? [] : [...dir];
      for (const x of r.replace(/^\/home\/user\//, '').replace(/^\//, '').split('/')) { if (!x || x === '.') continue; if (x === '..') parts.pop(); else parts.push(x); }
      return parts.join('/');
    };
    let budget = 8 * 1024 * 1024, n = 0;
    const blobOf = async ref => { const p = resolve(ref); if (!p || n >= 40 || budget <= 0) return null; try { const ent = await ctx.entry(p); if (!ent || ent.e.type === 'dir' || +ent.e.size > 3 * 1024 * 1024) return null; const b = await Workspace.fileBlob(ent.e); n++; budget -= b.size; return b; } catch { return null; } };
    const dataUrl = (b, mime) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(mime ? new Blob([b], { type: mime }) : b); });
    for (const l of [...d.querySelectorAll('link[rel~="stylesheet"][href]')]) { const b = await blobOf(l.getAttribute('href')); if (b) { const st = d.createElement('style'); st.textContent = await b.text(); l.replaceWith(st); } else l.remove(); }
    for (const el of [...d.querySelectorAll('img[src],source[src],image')]) {
      const at = el.hasAttribute('src') ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href', ref = el.getAttribute(at), b = await blobOf(ref);
      if (b) { const u = await dataUrl(b, WorkspacePath.mime?.(resolve(ref) || '') || b.type); if (u) el.setAttribute(at, u); }
    }
    return '<!doctype html>' + d.documentElement.outerHTML;
  }
  const textOf = () => {
    try {
      const direct = String(st?.get?.() ?? '');
      if (direct) return direct;
      if (st?.sid && st?.path && typeof R !== 'undefined' && R.latestFileText) return String(R.latestFileText(st.sid, st.path) || '');
      return '';
    } catch { return ''; }
  };
  const textFrom = (fn, sid, path) => {
    try {
      const direct = String(fn?.() ?? '');
      if (direct) return direct;
      if (path && typeof R !== 'undefined' && R.latestFileText) return String(R.latestFileText(sid, path) || '');
      return '';
    } catch { return ''; }
  };
  const on = () => !!st;
  const mobile = () => document.body.classList.contains('m');
  // ---------- 舞台：页面放进一个虚拟视口，整体按比例缩放进盒子 ----------
  // 窗格 / 底部面板（o.probe）：页面真的在跑（脚本、点击、滚轮都交给页面自己），排版测量和「记录」用一个看不见的只读副本（o.probe，同源、不跑脚本）。
  // 对话里的小窗（o.thumb）：完整显示在固定比例的盒子里；很长的网页按宽度缩放、只露出最上面一屏。
  function mountStage(stage, f, text, name, o = {}) {
    let W = 1280, H = 720, wfit = false, fill = false, ro = null, dead = false;
    const m = o.probe || f;   // 测量用的那一个（必须同源）
    const place = () => {
      if (dead) return; const pw = stage.clientWidth, ph = stage.clientHeight; if (!pw || !ph) return;
      if (fill) {
        if (o.thumb) { const k = pw / W, hh = Math.ceil(ph / k); Object.assign(f.style, { width: W + 'px', height: hh + 'px', left: '0', top: '0', transform: 'scale(' + k + ')' }); return; }
        Object.assign(f.style, { width: '100%', height: '100%', transform: 'none', left: '0', top: '0' });
        if (o.probe) Object.assign(m.style, { width: pw + 'px', height: ph + 'px', transform: 'none' });
        return;
      }
      const byW = o.thumb && wfit;   // 小窗里响应式页面：宽度铺满，底部多出的一点（≤15%）直接截掉，和网页版一样不留白边
      const k = byW ? pw / W : Math.min(pw / W, ph / H), x = byW ? 0 : (pw - W * k) / 2, y = byW ? 0 : (ph - H * k) / 2;
      Object.assign(f.style, { width: W + 'px', height: H + 'px', left: Math.round(x) + 'px', top: Math.round(y) + 'px', transform: 'scale(' + k + ')' });
      if (o.probe) Object.assign(m.style, { width: W + 'px', height: H + 'px', transform: 'none' });
    };
    const norm = (w, h) => { if (!(w > 0 && h > 0)) return [1280, 720]; return w >= h ? [1280, Math.max(120, Math.round(1280 * h / w))] : [Math.max(120, Math.round(1280 * w / h)), 1280]; };
    const bgOf = () => {
      try {
        const doc = m.contentDocument, win = m.contentWindow, solid = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
        const hb = win.getComputedStyle(doc.documentElement).backgroundColor, bb = win.getComputedStyle(doc.body).backgroundColor;
        return solid(hb) ? hb : solid(bb) ? bb : '#fff';
      } catch { return ''; }
    };
    // 先按容器的真实大小排版（响应式页面和网页版里看到的一样大）；横向放不下（按桌面尺寸写死的页面）就逐级加宽虚拟视口（800 / 1024 / 1280）再整体缩小；
    // 纵向略有溢出（≤15%，比如 min-height:100vh + body 边距）就把虚拟视口拉高一点；还是放不下的长网页当普通网页看（窗格里自己滚动，小窗只露出最上面一屏）。
    let lastPw = 0;
    const analyse = () => {
      if (dead) return;
      try {
        const doc = m.contentDocument; if (!doc?.documentElement) return;
        const pw = stage.clientWidth, ph = stage.clientHeight; if (!pw || !ph) return; lastPw = pw; fill = false; wfit = false;
        const de = doc.documentElement, svgs = [...doc.querySelectorAll('svg')].filter(x => !x.parentElement?.closest('svg'));
        const dims = v => { const vb = v?.viewBox?.baseVal; if (vb && vb.width > 0 && vb.height > 0) return [vb.width, vb.height]; const w = parseFloat(v?.getAttribute('width')), h = parseFloat(v?.getAttribute('height')); return w > 0 && h > 0 ? [w, h] : null; };
        let done = false;
        if (isSvgDoc(text, name)) { const d = dims(svgs[0]); if (d) { [W, H] = norm(d[0], d[1]); done = true; } }
        if (!done) {
          const cands = [pw, 800, 1024, 1280].filter((w, i, a) => w >= pw - 1 && a.indexOf(w) === i); if (!cands.length) cands.push(pw);
          for (const w of cands) {
            const h = Math.round(w * ph / pw); m.style.width = w + 'px'; m.style.height = h + 'px'; m.style.transform = 'none'; void de.offsetHeight;
            const sw = de.scrollWidth, sh = de.scrollHeight;
            if (w === cands[0]) {   // 页面基本就是一幅 svg（占满视口、而且整页几乎没有别的内容）：按它自己的画面比例铺满
              let best = null, area = 0; for (const v of svgs) { const r = v.getBoundingClientRect(), a = r.width * r.height; if (a > area) { area = a; best = v; } }
              const d = best && area >= 0.5 * w * h && area >= 0.6 * sw * Math.max(sh, h) ? dims(best) : null; if (d) { [W, H] = norm(d[0], d[1]); done = true; break; }
            }
            if (sw <= w + 2 && sh <= h * 1.15 + 2) { W = w; H = Math.max(h, sh); wfit = true; done = true; break; }
          }
          if (!done) { fill = true; W = o.thumb ? Math.max(pw, 1024) : Math.max(pw, 1280); }
        }
        const bg = bgOf(); if (bg) stage.style.background = bg;
      } catch {}
      place();
    };
    m.addEventListener('load', analyse);
    try { ro = new ResizeObserver(() => { if (Math.abs(stage.clientWidth - lastPw) > 3 && m.contentDocument?.readyState === 'complete') analyse(); else place(); }); ro.observe(stage); } catch {}
    place();
    return { destroy() { dead = true; try { ro?.disconnect(); } catch {} m.removeEventListener('load', analyse); }, reset() { place(); } };
  }
  // ---------- 对话里的预览小窗（和网页版一样：Write 出 html 后，在这一行下面直接显示页面缩略图，点一下放大） ----------
  const cards = new Map();
  const decode = t => { const x = document.createElement('textarea'); x.innerHTML = t; return x.value; };
  const titleOf = (text, name) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text); const t = m ? decode(m[1]).replace(/\s+/g, ' ').trim() : ''; return t || name; };
  const extOf = name => { const e = (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1] || 'html'; return e.length > 5 ? 'HTML' : e.toUpperCase(); };
  const finished = text => /<\/(?:html|svg)\s*>\s*$/i.test(text);
  const canPreviewPartial = text => finished(text) || /<\/(?:svg|body|main|canvas|script)\s*>/i.test(text);
  function buildCard(key) {
    const c = { key, o: null, text: null, live: false, el: null, stage: null, ph: null, mount: null, shown: '' };
    const title = h('b', { class: 'pvc-t' }), badge = h('span', { class: 'pvc-badge' });
    c.stage = h('div', { class: 'pvc-stage' });
    c.phText = h('span', {}, '正在生成预览…'); c.ph = h('div', { class: 'pvc-ph' }, h('i', { class: 'spin' }), c.phText);
    c.el = h('div', { class: 'pvc', role: 'button', tabindex: '0', onclick: () => c.open(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.open(); } } },
      h('div', { class: 'pvc-h' }, icon('pvwin'), title, badge), h('div', { class: 'pvc-box' }, c.stage, c.ph, h('span', { class: 'pvc-zoom', 'aria-hidden': 'true' }, icon('pvfull'))));
    c.title = title; c.badge = badge;
    c.open = () => { const o = c.o; if (o) open({ sid: o.getWsid?.() || Tabs.cur?.sid || null, path: o.path, get: o.get, wsid: o.getWsid?.() || null }); };
    c.paint = () => {
      const o = c.o, sid = o.getWsid?.() || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null), text = textFrom(o.get, sid, o.path), name = String(o.path || '').split('/').pop() || o.path;
      const t = titleOf(text, name); if (c.title.textContent !== t) c.title.textContent = t; c.badge.textContent = extOf(name);
      c.el.setAttribute('aria-label', '放大预览 ' + t);
      const ready = !!text.trim() && (!o.running || finished(text));
      c.ph.hidden = ready && !!c.shown; c.phText.textContent = ready ? '正在加载预览…' : '正在生成预览…'; c.el.classList.toggle('pvc-wait', !ready);
      if (!ready || text === c.text) return;
      c.text = text; if (c.live) c.render(text, name); else c.pending = true;
    };
    c.render = (text, name) => {
      c.pending = false; const old = c.stage.querySelector('iframe');
      const f = h('iframe', { class: 'pvc-frame', title: name, tabindex: '-1', 'aria-hidden': 'true', referrerpolicy: 'no-referrer' });
      f.setAttribute('sandbox', 'allow-same-origin'); f.setAttribute('csp', CSP); f.style.visibility = 'hidden';
      const prev = c.mount; c.mount = mountStage(c.stage, f, text, name, { thumb: true });
      f.addEventListener('load', () => { old?.remove(); prev?.destroy(); f.style.visibility = ''; c.shown = text; c.ph.hidden = true; }, { once: true });
      f.srcdoc = docOf(text, name, { thumb: true }); c.stage.append(f);
    };
    // 滚动到可见范围才真正创建页面（长对话里很多个 html 不会同时加载）
    const go = () => { c.live = true; if (c.o && c.text != null && !c.stage.querySelector('iframe')) c.render(c.text, String(c.o.path || '').split('/').pop()); };
    if (typeof IntersectionObserver === 'function') { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '300px' }); io.observe(c.el); c.io = io; } else c.live = true;
    return c;
  }
  // 同一个 Write 在对话里反复重绘时复用同一个小窗节点（不重新创建页面，不闪）；流式写入期间等写完（出现结束标签）才渲染
  function card(key, o) {
    let c = cards.get(key);
    if (!c) { c = buildCard(key); cards.set(key, c); if (cards.size > 80) { const k = cards.keys().next().value, d = cards.get(k); cards.delete(k); try { d.mount?.destroy(); d.io?.disconnect(); } catch {} } }
    c.o = o; c.paint(); return c.el;
  }
  // ---------- 放大预览：电脑 = 右侧窗格；手机 = 从底部升起的面板（可下拉关闭） ----------
  const MIME = { html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', md: 'text/markdown', json: 'application/json', css: 'text/css', js: 'text/javascript' };
  const mimeOf = name => MIME[(/\.([A-Za-z0-9]+)$/.exec(name) || [])[1]?.toLowerCase()] || 'text/plain';
  let closeTok = 0;
  function ghostOut(fromY = 0) {
    // 真正的面板立刻清掉（状态、布局马上恢复）；放一个不含页面内容的「影子」滑下去，约 0.2 秒后自己消失
    try {
      const sheet = root?.querySelector('.pv-sheet'); if (!sheet || !mobile()) return;
      const g = h('div', { class: 'pv-ghost anc-gh', 'aria-hidden': 'true' }), s2 = sheet.cloneNode(true);
      s2.querySelectorAll('.pv-stage').forEach(x => x.replaceChildren()); s2.querySelector('.pv-menu')?.remove();
      s2.style.transform = 'translateY(' + fromY + 'px)'; g.append(s2); document.body.append(g);
      requestAnimationFrame(() => { g.classList.add('go'); s2.style.transform = ''; });
      setTimeout(() => g.remove(), 260);
    } catch {}
  }
  function dismiss(fromY = 0) { if (!st) return; if (mobile()) ghostOut(fromY); close(); }
  function close() {
    if (!st) return; try { st.stage?.destroy(); } catch {} try { st.img?.revoke?.(); } catch {} st = null; root?.classList.remove('pv-full'); frame = null; closeTok++;
    document.body.classList.remove('pv-on'); if (root) { root.classList.remove('pv-enter'); root.replaceChildren(); }
    try { UI.layout(); } catch {}
  }
  function open(o) {
    const wasOpen = !!st, kind = o.img ? 'image' : (kindOf(o.path) || 'code'), prev = st;
    try { prev?.stage?.destroy(); } catch {}
    try { if (prev?.img && prev.img.src !== o.img?.src) prev.img.revoke?.(); } catch {}
    st = { sid: o.sid || null, path: o.path || '', kind, name: (o.path || '').split('/').pop() || o.path || '预览', get: o.get, view: o.view ?? null, suffix: o.suffix || '', wsid: o.wsid || null, mode: (o.mode === 'code' || o.mode === 'run') ? o.mode : (kind === 'code' ? 'code' : 'run'), at: now(), frame: 0, list: o.list || null, img: o.img || null };
    if (prev && prev.kind === kind && o.keepMode) st.mode = prev.mode;
    document.body.classList.add('pv-on');
    if (!wasOpen && root && mobile()) { root.classList.add('pv-enter'); const tok = ++closeTok; setTimeout(() => { if (closeTok === tok) root?.classList.remove('pv-enter'); }, 420); }
    render(); if (!wasOpen) try { UI.layout(); } catch {}
  }
  function full(on) { if (!root || !st) return; root.classList.toggle('pv-full', on); render(); try { UI.layout(); } catch {} }
  // 图片：右侧窗格里看（跟官方一样：右边收起成预览器，适应窗格 / 点一下原始大小，顶上有下拉 · 下载 · 全屏 · 关闭）
  function image(o) { open({ sid: o.sid ?? (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) ?? null, path: o.path || o.name || 'image', img: { src: o.src, revoke: o.revoke || null, sub: o.sub || '', thumb: o.thumb || '' }, list: o.list || null }); }
  function setMode(m) { if (!st || st.mode === m) return; st.mode = m; render(); }
  function btn(ic, title, fn, cls = '') { return h('button', { type: 'button', class: 'ib sm pv-b ' + cls, title, 'aria-label': title, onclick: fn }, icon(ic)); }
  // 文件下拉：这个对话里 Write 出来的所有可预览文件（同一路径只留最新一次），点一个就切换
  function files() {
    let l = []; try { l = (st.list ? st.list() : (typeof R !== 'undefined' && R.writes ? R.writes(st.sid) : [])) || []; } catch {}
    if (!l.some(x => x.path === st.path)) l = [{ path: st.path, get: st.get, wsid: st.wsid, img: st.img }, ...l];
    return l;
  }
  function menu(anchor, sheet) {
    sheet.querySelector('.pv-menu')?.remove(); const l = files(); if (l.length < 2) return;
    const m = h('div', { class: 'pv-menu', role: 'listbox' }, ...l.map(x => {
      const t = x.img ? '' : textFrom(x.get), n = x.path.split('/').pop(), cur = x.path === st.path;
      return h('button', { type: 'button', class: 'pv-mi' + (cur ? ' on' : ''), role: 'option', 'aria-selected': String(cur), onclick: () => { m.remove(); if (!cur) open({ sid: st.sid, path: x.path, get: x.get, img: x.img, wsid: x.wsid || st.wsid, list: st.list, keepMode: true }); } },
        x.img ? h('img', { class: 'pv-mthumb', src: x.img.thumb || x.img.src, alt: '', loading: 'lazy' }) : icon('file'), h('span', { class: 'pv-mn' }, h('b', {}, n), h('small', {}, x.img ? (x.img.sub || '图片') : x.path !== n ? x.path : (t ? t.split('\n').length + ' 行' : ''))), cur ? icon('check') : null);
    }));
    sheet.append(m);
    const off = e => { if (!m.isConnected) { document.removeEventListener('pointerdown', off, true); return; } if (!m.contains(e.target) && !anchor.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  }
  function download(text) {
    const n = st.name, run = typeof FileExport !== 'undefined' ? FileExport.text(text, n, mimeOf(n)) : Promise.reject(Error('当前版本不支持保存文件'));
    Promise.resolve(run).catch(e => toast('保存失败：' + describe(e), 'err'));
  }
  // 手机：握住顶部把手 / 工具栏往下拖关闭（跟手；松手时拖得够远或够快就收起，否则弹回）
  function drag(grab, sheet) {
    let id = null, y0 = 0, dy = 0, t0 = 0;
    grab.addEventListener('pointerdown', e => { if (!mobile() || e.target.closest('button,.pv-menu') || (e.pointerType === 'mouse' && e.button)) return; id = e.pointerId; y0 = e.clientY; dy = 0; t0 = performance.now(); sheet.style.transition = 'none'; try { grab.setPointerCapture(id); } catch {} });
    grab.addEventListener('pointermove', e => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; root.style.setProperty('--pvb', String(Math.max(0, 1 - dy / Math.max(1, sheet.offsetHeight) * 1.2))); });
    const end = e => {
      if (e.pointerId !== id) return; id = null; const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 110 || (v > 0.6 && dy > 24)) { sheet.style.transition = ''; sheet.style.transform = ''; root.style.removeProperty('--pvb'); dismiss(dy); }
      else { sheet.style.transition = 'transform .2s ease-out'; sheet.style.transform = ''; root.style.removeProperty('--pvb'); setTimeout(() => { sheet.style.transition = ''; }, 220); }
    };
    grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
  }
  function render() {
    if (!root) return;
    if (!st) { root.replaceChildren(); return; }
    try { st.stage?.destroy(); } catch {}
    st.stage = null;
    const isImg = st.kind === 'image', text = isImg ? '' : textOf(), kind = st.kind, script = kind === 'html' && hasScript(text), lines = text ? text.split('\n').length : 0;
    const seg = (k, ic, l) => h('button', { type: 'button', class: st.mode === k ? 'on' : '', 'aria-label': l, title: l, onclick: () => setMode(k) }, icon(ic), h('span', {}, l));
    const sheet = h('div', { class: 'pv-sheet' }), many = files().length > 1;
    const fileBtn = h('button', { type: 'button', class: 'pv-file' + (many ? ' many' : ''), title: st.path, 'aria-haspopup': many ? 'listbox' : null, onclick: () => { if (many) menu(fileBtn, sheet); } },
      icon('pvfolder'), h('b', { class: 'pv-n', title: st.path }, st.name), many ? icon('pvdown', 'pv-caret') : null);
    const head = h('div', { class: 'pv-h' },
      kind === 'code' || isImg ? null : h('div', { class: 'pv-seg', role: 'tablist' }, kind === 'md' ? seg('run', 'pvplay', '预览') : seg('run', 'pvplay', '运行'), seg('code', 'pvcode', kind === 'md' ? '源码' : '代码')),
      fileBtn,
      isImg ? null : btn('refresh', '重新读取并刷新', () => { render(); }),
      isImg && typeof ImgAct !== 'undefined' && ImgAct.canCopy() ? btn('copy', '复制图片', () => ImgAct.copy(st.img.src)) : null,
      kind !== 'html' ? null : h('button', { type: 'button', class: 'ib sm pv-b pv-rec', title: '把现在看到的画面记录为「鹈鹕测试图」（全客户端共享 · 存到模型信息 · 概览）', 'aria-label': '记录为鹈鹕测试图', onclick: () => void record() }, icon('pvcam'), h('span', {}, '记录')),
      kind !== 'html' ? null : h('button', { type: 'button', class: 'ib sm pv-b pv-tbl', title: '打开全客户端鹈鹕测试库（查看 / 多模型并排对比 / 导入合并 / 导出分享）', 'aria-label': '鹈鹕测试库', onclick: () => PelicanShots.table({ compareModel: PelicanShots.modelOf(st.sid || Tabs.cur?.sid || null).model }) }, icon('pvtable'), h('span', {}, '测试库')),
      isImg ? btn('pvdl', '下载图片', () => typeof ImgAct !== 'undefined' ? ImgAct.save(st.img.src, st.name) : null, 'pv-dl') : btn('pvdl', '下载文件', () => download(text), 'pv-dl'),
      mobile() ? null : (root.classList.contains('pv-full') ? btn('pvunfull', '退出全屏', () => full(false), 'pv-fs') : btn('pvfull', '全屏显示', () => full(true), 'pv-fs')),
      btn('x', '关闭预览（恢复原来的面板）', () => dismiss(), 'pv-x'));
    const handle = h('div', { class: 'pv-handle', 'aria-hidden': 'true' }, h('i'));
    const grip = h('div', { class: 'pv-grip', title: '拖动调整宽度' });
    grip.addEventListener('dblclick', () => { Prefs.pvW = 0; savePrefs(); applyWidth(); });
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = root.getBoundingClientRect().width; document.body.classList.add('resizing');
      const mv = ev => { Prefs.pvW = Math.round(Math.max(340, Math.min(innerWidth - 360, w0 + (x0 - ev.clientX)))); applyWidth(); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); savePrefs(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    const body = h('div', { class: 'pv-body' + (isImg ? ' pv-imgb' : '') });
    let dim = null, stageToMount = null;
    if (isImg) {
      dim = h('span', { class: 'grow' }, '载入中…');
      const im = h('img', { class: 'pv-img', src: st.img.src, alt: st.name, draggable: 'false', title: '点击切换：适应窗格 / 原始大小' });
      im.onload = () => { dim.textContent = im.naturalWidth + ' × ' + im.naturalHeight + (st.img.sub ? ' · ' + st.img.sub : ''); };
      im.onerror = () => { dim.textContent = '图片加载失败'; };
      im.onclick = () => body.classList.toggle('nat');
      im.oncontextmenu = e => { if (typeof ImgAct === 'undefined') return; e.preventDefault(); ImgAct.menu(e, st.img.src, st.name, true); };
      body.append(im); frame = null;
    } else if (st.mode === 'code') {
      body.append(h('pre', { class: 'pv-code' }, text.length > MAXCODE ? text.slice(0, MAXCODE) + '\n…' : text || '（正在写入代码…）'), h('button', { type: 'button', class: 'ib sm pv-copy', title: '复制源码', 'aria-label': '复制源码', onclick: () => copyText(textOf() || text) }, icon('copy')));
      frame = null;
    } else if (kind === 'md' && text.trim()) { const d = h('div', { class: 'pv-md md' }); d.innerHTML = MD.render(text); body.append(d); frame = null; }
    else if (!text.trim()) { body.append(h('div', { class: 'pv-empty' }, h('i', { class: 'spin' }), ' 正在生成或读取文件内容，写入后将自动加载显示…')); frame = null; }
    else {
      const src = st.view != null && st.kind === 'html' ? st.view : text;
      const f = h('iframe', { class: 'pv-frame', title: st.name, referrerpolicy: 'no-referrer' });
      const p = h('iframe', { class: 'pv-probe', tabindex: '-1', 'aria-hidden': 'true', referrerpolicy: 'no-referrer' });
      const stage = h('div', { class: 'pv-stage' }, f, p);
      // 展示用 f：跑页面自己的脚本（不同源，脚本拿不到外面的客户端数据；断网，打不出去）
      // 测量 / 记录用 p：同源、不跑脚本，排版尺寸和样式动画从这里读
      f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('csp', CSP_RUN);
      p.setAttribute('sandbox', 'allow-same-origin'); p.setAttribute('csp', CSP);
      f.srcdoc = docOf(src, st.name, { run: true }); p.srcdoc = docOf(src, st.name);
      frame = f; st.probe = p; st.frameAt = now();
      body.append(stage);
      stageToMount = { stage, f, p, src };
    }
    const foot = isImg ? h('div', { class: 'pv-note sm' }, dim, h('span', { class: 'dim' }, fmtClock2(st.at))) : script ? h('div', { class: 'pv-note' }, icon('alert'), h('span', { class: 'grow' }, '页面含脚本：已在沙盒里运行（断网、拿不到客户端数据）。需要联网或完整浏览器环境请用隔离窗口。'),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => void runIsolated() }, '在隔离窗口运行')) : h('div', { class: 'pv-note sm' }, h('span', { class: 'grow' }, kind === 'html' && st.mode === 'run' ? '沙盒运行 · 已断网' : lines + ' 行'), h('span', { class: 'dim' }, fmtClock2(st.at)));
    sheet.append(handle, head, body, foot); drag(handle, sheet); drag(head, sheet);
    root.onclick = e => { if (e.target === root && mobile()) dismiss(); };
    root.replaceChildren(grip, sheet);
    applyWidth();
    if (stageToMount) st.stage = mountStage(stageToMount.stage, stageToMount.f, stageToMount.src, st.name, { probe: stageToMount.p });
    lastSyncText = text; lastSyncMode = st.mode;
  }
  let lastSyncText = '', lastSyncMode = '', lastSyncRenderAt = 0;
  function syncLive(sid) {
    if (!st || !root || st.kind === 'image') return;
    if (sid && st.sid && sid !== st.sid) return;
    const text = textOf();
    if (text === lastSyncText && st.mode === lastSyncMode) return;
    lastSyncText = text; lastSyncMode = st.mode;
    if (st.mode === 'code') {
      const pre = root.querySelector('.pv-code');
      if (pre) {
        pre.textContent = text.length > MAXCODE ? text.slice(0, MAXCODE) + '\n…' : text || '（正在写入代码…）';
        const note = root.querySelector('.pv-note .grow');
        if (note && st.kind !== 'html') note.textContent = (text ? text.split('\n').length : 0) + ' 行';
        return;
      }
      render();
      return;
    }
    if (st.kind === 'md') {
      const md = root.querySelector('.pv-md');
      if (md && text.trim()) { md.innerHTML = MD.render(text); return; }
      render();
      return;
    }
    if (st.kind === 'html') {
      const nowMs = now(), isDone = finished(text);
      if (!text.trim()) return;
      if (isDone || !frame || (canPreviewPartial(text) && nowMs - lastSyncRenderAt > 650)) {
        lastSyncRenderAt = nowMs;
        render();
      }
    }
  }
  function applyWidth() { if (root) root.style.setProperty('--pvw', Prefs.pvW > 0 ? Prefs.pvW + 'px' : ''); }
  // ---------- 记录：当前帧 → 小图 ----------
  const kebab = k => k === 'cssFloat' ? 'float' : k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  async function shoot(fr = st?.probe || frame) {
    const frame = fr;
    if (!frame) throw Error('没有可记录的画面');
    if (frame.contentDocument?.readyState !== 'complete') await new Promise(r => { const t = setTimeout(r, 2500); frame.addEventListener('load', () => { clearTimeout(t); r(); }, { once: true }); });
    const doc = frame.contentDocument, win = frame.contentWindow; if (!doc?.documentElement) throw Error('读不到预览画面');
    const W = Math.max(240, Math.round(frame.clientWidth)), H = Math.max(160, Math.round(frame.clientHeight));
    const live = [...doc.querySelectorAll('*')], idx = new Map(live.map((e, i) => [e, i]));
    const rootEl = doc.documentElement.cloneNode(true), copy = [rootEl, ...rootEl.querySelectorAll('*')];
    // 动画冻结在「此刻」：把每个动画正在显示的值写成行内样式，再关掉所有动画
    let frozen = 0;
    for (const a of (doc.getAnimations?.() || [])) {
      const eff = a.effect, t = eff?.target; if (!t || eff.pseudoElement || !idx.has(t)) continue;
      const cs = win.getComputedStyle(t), el = copy[idx.get(t)], props = new Set();
      try { for (const kf of eff.getKeyframes()) for (const k of Object.keys(kf)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k)) props.add(k); } catch {}
      for (const k of props) { const p = kebab(k), v = cs.getPropertyValue(p); if (v) { el.style?.setProperty(p, v); frozen++; } }
    }
    rootEl.querySelectorAll('script,iframe,object,embed,link,meta[http-equiv],base').forEach(n => n.remove());
    for (const im of rootEl.querySelectorAll('img,image,video,audio,source')) for (const at of ['src', 'href', 'xlink:href']) { const v = im.getAttribute(at); if (v && !/^data:/i.test(v)) im.removeAttribute(at); }
    const css = doc.createElement('style'); css.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    (rootEl.querySelector('head') || rootEl).append(css);
    const bg = win.getComputedStyle(doc.body).backgroundColor, hb = win.getComputedStyle(doc.documentElement).backgroundColor;
    const solid = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
    const fill = solid(hb) ? hb : solid(bg) ? bg : '#ffffff';
    const xhtml = new XMLSerializer().serializeToString(rootEl);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xhtml}</foreignObject></svg>`;
    const img = new Image(); img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(Error('画面转图片失败')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const cw = Math.min(W, 560), ch = Math.round(H * cw / W), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
    let url; try { url = cv.toDataURL('image/jpeg', 0.82); } catch { throw Error('此环境不允许读取画面像素'); }
    return { url, w: cw, h: ch, frozen };
  }
  // 不用打开预览窗格：把一段 html / svg 文本放进一个看不见的只读页面，等动画走一小段再截图（鹈鹕测试跑完自动存图用）
  async function shootText(text, name, { w = 720, h: hh = 480, settle = 900 } = {}) {
    const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin'); f.setAttribute('csp', CSP); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${hh}px;border:0;pointer-events:none`;
    document.body.append(f);
    try {
      await new Promise((res, rej) => { const t = setTimeout(() => rej(Error('页面加载超时')), 6000); f.addEventListener('load', () => { clearTimeout(t); res(); }, { once: true }); f.srcdoc = docOf(text, name); });
      await sleep(settle);
      return await shoot(f);
    } finally { f.remove(); }
  }
  async function record() {
    if (!st || st.kind !== 'html' || st.recording) return; st.recording = true;
    try {
      if (st.mode !== 'run') { setMode('run'); await sleep(350); }
      await sleep(60);
      const sid = st.sid || Tabs.cur?.sid || null, shot = await shoot();
      const r = PelicanShots.add({ sid, ...shot, file: st.name });
      toast('已记录 · ' + r.model + (r.score != null ? ' · 推理分 ' + Strength.fmtScore(r.score) : '') + '（模型信息 · 概览 · 鹈鹕测试图）');
      try { Dock.render(); } catch {}
    } catch (e) { toast('记录失败：' + describe(e), 'err'); }
    finally { if (st) st.recording = false; }
  }
  // 含脚本的页面：仍可手动交给原来的隔离窗口（不是默认路径）
  async function runIsolated() {
    const sid = st?.sid, path = st?.path; if (!sid || !path) return;
    try {
      if (WS.sid !== sid || !WS.data?.manifest?.root) await WS.load(sid);
      if (!WS.data?.manifest?.root) await WS.load(sid, true);
      const ctx = WorkspacePreview.context(sid, WS.data), r = await ctx.find(path), hit = r.hits[0];
      if (!hit) throw Error('工作区里没有找到 ' + path);
      await WorkspacePreview.open(ctx, hit.p, st?.suffix || r.suffix || '');
    } catch (e) { toast('隔离窗口打开失败：' + describe(e), 'err'); }
  }
  let escBound = false;
  function mount(el) {
    root = el; render();
    if (escBound) return; escBound = true;
    document.addEventListener('keydown', e => {   // Esc：先收下拉，再关预览（输入框里、有弹窗时不抢）
      if (e.key !== 'Escape' || !st || e.defaultPrevented || e.target?.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('.modal-back')) return;
      const m = root?.querySelector('.pv-menu'); if (m) m.remove(); else if (root?.classList.contains('pv-full')) full(false); else dismiss();
    });
  }
  // 点 Write 卡片：html / svg 走预览，其它文件保持原样（展开看代码）
  function bindRow(summary, { path, get, getWsid }) {
    summary.addEventListener('click', ev => {
      if (ev.target.closest('.tg-chev,button')) return;   // 右边的小箭头仍然是「展开 / 折叠代码」
      ev.preventDefault(); ev.stopPropagation();
      open({ sid: getWsid?.() || Tabs.cur?.sid || null, path, get, wsid: getWsid?.() || null });
    });
  }
  return { previewable, kindOf, inlineAssets, open, image, isFull: () => !!root?.classList.contains('pv-full'), close, dismiss, on, mount, bindRow, render, syncLive, record, shoot, shootText, card, titleOf, sid: () => st?.sid || null, docOf };
})();

// ---------- 鹈鹕测试库（全客户端共享）：记录 / 概览卡片 / 导出与导入合并 / 多模型并排对比 / 能力表（SVG） ----------
const PelicanShots = (() => {
  const KEY = 'pelican-shots', DEL_KEY = 'pelican-shots-del', PER = 8, TOTAL = 240;   /* PER = 每个对话最多留几张；全客户端所有账号互通合并 */
  const cleanName = s => String(s || '').replace(/\?+$/, '').trim();
  const key = m => cleanName(m).toLowerCase().replace(/\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '-$1').replace(/[\s_]+/g, '-');
  const isBetterModel = (cand, cur) => {
    const a = cleanName(cand), b = cleanName(cur);
    if (!a || a === '未识别' || a === '开源模型') return false;
    if (!b || b === '未识别' || b === '开源模型' || /\?$/.test(String(cur || ''))) return true;
    return key(a) !== key(b) && a.length >= b.length;
  };
  const curAcct = () => {
    try { const a = typeof UI !== 'undefined' && UI.host?.account; return String(a?.name || (a?.email || '').split('@')[0] || '').trim(); } catch { return ''; }
  };
  const delMap = () => {
    const d = Store.get(DEL_KEY, {});
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  };
  const saveDel = d => { try { Store.set(DEL_KEY, d || {}); } catch {} };
  const all = () => {
    const d = Store.get(KEY, []), dm = delMap();
    return Array.isArray(d) ? d.filter(x => x && typeof x.url === 'string' && x.model && !dm[x.id]) : [];
  };
  const save = a => { let r = a; while (r.length && !Store.set(KEY, r)) r = r.slice(Math.max(1, Math.ceil(r.length * 0.1))); return r; };
  function modelOf(sid) {
    let name = '', score = null, think = null;
    try {
      const mi = sid ? Models.get(sid) : null;
      if (mi && mi.name && !mi.guess) name = Strength.canon(mi.name);
      if (!name && mi && mi.reverseCandidateId && mi.sure) name = Strength.canon(mi.name || mi.reverseLabel || mi.reverseCandidateId);
      if (!name) { const t = Titles.view(sid, History.byId?.(sid)?.title || '').model; if (t && Brand.of(t)) name = Strength.canon(t); }
    } catch {}
    try {
      const p = sid ? PelicanTest.result(sid) : null;
      score = Number.isFinite(p?.score) ? p.score : null;
      think = Number.isFinite(p?.think) ? p.think : null;
      if (!name && p?.name && p.name !== '未识别') name = Strength.canon(p.name);
    } catch {}
    if (score == null) try { const mi = sid ? Models.get(sid) : null; score = ConversationLabels.score(mi, History.byId?.(sid)?.title || ''); } catch {}
    if (score == null) try { const mi = sid ? Models.get(sid) : null; if (Number.isFinite(mi?.reverseScore)) score = mi.reverseScore; } catch {}
    if (score != null && !(score >= 0 && score <= 100)) score = null;
    return { model: name || '未识别', score, think };
  }
  /* 展示用的型号 / 推理分跟着对话走：测完指纹、校准、改名之后型号变了，图还是这个对话的，只是归到新型号下；跨账号或外部导入的图保留其记录的型号与分数 */
  const view = r => {
    if (!r) return r;
    if (!r.sid) {
      const sc = r.score ?? (r.model && r.model !== '未识别' && typeof Strength !== 'undefined' ? Strength.board?.()?.find?.(b => key(b.name) === key(r.model))?.score ?? null : null);
      return { ...r, model: cleanName(r.model) || '未识别', score: sc ?? null };
    }
    const m = modelOf(r.sid);
    const nextModel = isBetterModel(m.model, r.model) ? m.model : (cleanName(r.model) || m.model || '未识别');
    const nextScore = m.score ?? r.score ?? null;
    const nextThink = m.think ?? r.think ?? null;
    return { ...r, model: nextModel, score: nextScore, think: nextThink };
  };
  function mergeRows(baseRows, incomingRows, dm = delMap(), fallbackAcct = '') {
    const byId = new Map(), bySig = new Map();
    const put = (rawRow, acctFallback = '') => {
      if (!rawRow || typeof rawRow !== 'object' || typeof rawRow.url !== 'string' || !/^data:image\//i.test(rawRow.url)) return;
      const r = view(rawRow);
      const id = String(r.id || '').trim() || ((r.sid || 'pel') + '-' + (r.at || 0));
      if (dm && dm[id]) return;
      const acct = String(r.acct || acctFallback || '').trim();
      const norm = {
        ...r,
        id,
        at: Number(r.at) || now(),
        sid: r.sid || null,
        model: cleanName(r.model) || '未识别',
        score: r.score != null && Number.isFinite(+r.score) ? +r.score : null,
        think: r.think != null && Number.isFinite(+r.think) ? +r.think : null,
        w: Number(r.w) || 560,
        h: Number(r.h) || 373,
        file: String(r.file || ''),
        ...(r.auto ? { auto: true } : {}),
        ...(acct ? { acct } : {}),
      };
      const sig = (norm.sid || key(norm.model) || '') + '|' + (norm.at || 0) + '|' + (norm.file || '') + '|' + norm.url.slice(-120);
      const ex = byId.get(id) || bySig.get(sig);
      if (!ex) {
        byId.set(id, norm);
        bySig.set(sig, norm);
        return;
      }
      const merged = {
        ...ex,
        ...norm,
        id: ex.id || norm.id,
        at: Math.max(ex.at || 0, norm.at || 0),
        model: isBetterModel(norm.model, ex.model) ? norm.model : (ex.model || norm.model || '未识别'),
        score: norm.score ?? ex.score ?? null,
        think: norm.think ?? ex.think ?? null,
        acct: ex.acct || norm.acct || '',
      };
      byId.set(merged.id, merged);
      bySig.set(sig, merged);
    };
    for (const r of (Array.isArray(baseRows) ? baseRows : [])) put(r, '');
    for (const r of (Array.isArray(incomingRows) ? incomingRows : [])) put(r, fallbackAcct);
    return [...byId.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-TOTAL);
  }
  async function readShared() {
    if (typeof Host === 'undefined' || !Host.shared) return null;
    try {
      const d = await Host.shared('pelshots');
      if (d && typeof d === 'object') return d;
    } catch {}
    if (Host.platform === 'android') {
      try {
        const s = await Host.shared('strsamples');
        if (s && typeof s === 'object' && s.pelshots && typeof s.pelshots === 'object') return s.pelshots;
      } catch {}
    }
    return null;
  }
  async function writeShared(payload) {
    if (typeof Host === 'undefined' || !Host.shared) return false;
    let ok = false;
    try { ok = !!(await Host.shared('pelshots', payload)); } catch {}
    if (Host.platform === 'android') {
      try {
        let s = await Host.shared('strsamples');
        if (!s || typeof s !== 'object' || Array.isArray(s)) s = { S: {}, clr: {} };
        s.S = s.S && typeof s.S === 'object' ? s.S : {};
        s.clr = s.clr && typeof s.clr === 'object' ? s.clr : {};
        s.pelshots = { rows: payload.rows || [], del: payload.del || {}, pelican: payload.pelican || {}, at: now() };
        await Host.shared('strsamples', s);
        ok = true;
      } catch {}
    }
    return ok;
  }
  let pullP = null;
  async function pull(forceHarvest = false, quiet = true) {
    if (pullP && !forceHarvest) return pullP;
    pullP = (async () => {
      try {
        const localRows = all().map(view), dm = { ...delMap() }, acct = curAcct();
        let remote = await readShared();
        const absorbRemote = rRaw => {
          if (!rRaw) return [];
          const rObj = Array.isArray(rRaw) ? { rows: rRaw, del: {}, pelican: {} } : rRaw;
          if (rObj.del && typeof rObj.del === 'object') {
            for (const [id, ts] of Object.entries(rObj.del)) if (id && Number(ts) > (dm[id] || 0)) dm[id] = Number(ts);
          }
          if (rObj.pelican && typeof rObj.pelican === 'object' && typeof PelicanTest !== 'undefined' && PelicanTest.merge) {
            PelicanTest.merge(rObj.pelican);
          }
          return Array.isArray(rObj.rows) ? rObj.rows : [];
        };
        const remoteRows1 = absorbRemote(remote);
        try {
          const sharedPel = await Host.shared?.('pelican');
          if (sharedPel && typeof sharedPel === 'object' && typeof PelicanTest !== 'undefined' && PelicanTest.merge) PelicanTest.merge(sharedPel);
        } catch {}
        let merged = mergeRows(remoteRows1, localRows, dm, acct);
        saveDel(dm);
        const pelLocal = typeof PelicanTest !== 'undefined' && PelicanTest.all ? PelicanTest.all() : {};
        const modelsLocal = typeof Models !== 'undefined' && Models.all ? Models.all : {};
        await writeShared({ rows: merged, del: dm, pelican: pelLocal, models: modelsLocal, acct, harvest: !!forceHarvest });
        if (forceHarvest && Host.platform !== 'android') {
          await new Promise(r => setTimeout(r, 240));
          const remote2 = await readShared();
          const remoteRows2 = absorbRemote(remote2);
          merged = mergeRows(merged, remoteRows2, dm, acct);
          saveDel(dm);
        }
        const changed = merged.length !== localRows.length || JSON.stringify(merged.map(x => [x.id, x.model, x.score])) !== JSON.stringify(localRows.map(x => [x.id, x.model, x.score]));
        if (changed) {
          save(merged);
          try { Dock.render?.(); } catch {}
          try { if (typeof table.refreshOpen === 'function') table.refreshOpen(); } catch {}
        }
        if (!quiet) toast('已同步全客户端鹈鹕测试库 · 共 ' + latest().length + ' 个型号 / ' + merged.length + ' 张记录');
        return merged;
      } catch { return all(); }
      finally { pullP = null; }
    })();
    return pullP;
  }
  function push() { void pull(false, true); }
  function syncSid(sid) {
    if (!sid) return;
    const rawList = all();
    if (!rawList.some(x => x.sid === sid)) return;
    const updated = rawList.map(x => x.sid === sid ? view(x) : x);
    save(updated);
    push();
  }
  function add({ sid, url, w, h: hh, file, auto, acct }) {
    const m = modelOf(sid), aLabel = acct || curAcct();
    const rec = { id: uuid7(), at: now(), sid, model: m.model, score: m.score, ...(m.think != null ? { think: m.think } : {}), url, w, h: hh, file: file || '', ...(auto ? { auto: true } : {}), ...(aLabel ? { acct: aLabel } : {}) };
    let a = all(); a.push(rec);
    const mine = rec.sid ? a.filter(x => x.sid === rec.sid) : a.filter(x => !x.sid && key(x.model) === key(rec.model));
    if (mine.length > PER) { const drop = new Set(mine.slice(0, mine.length - PER).map(x => x.id)); a = a.filter(x => !drop.has(x.id)); }
    if (a.length > TOTAL) a = a.slice(a.length - TOTAL);
    save(a);
    push();
    return rec;
  }
  const del = id => {
    const dm = { ...delMap(), [id]: now() };
    saveDel(dm);
    save(all().filter(x => x.id !== id));
    push();
  };
  /* 鹈鹕测试跑完自动存图：取这个对话里最后写出的 html / svg，不打开预览也不用手点「记录」。
     返回 { rec } 成功；{ none:'原因' } = 没有可截图的页面（模型没写文件 / 还没写完）；抛错 = 截图失败 */
  async function auto(sid, chat) {
    const list = (typeof R !== 'undefined' && R.writes ? R.writes(sid) : []).filter(x => HtmlPreview.kindOf(x.path) === 'html'), w = list[list.length - 1];
    if (!w) return { none: '这一轮没有写出 html / svg 文件，没有可存的图' };
    const text = String(w.get() || ''); if (text.trim().length < 80) return { none: '写出的页面是空的，没有存图' };
    const shot = await HtmlPreview.shootText(text, w.path.split('/').pop() || w.path);
    return { rec: add({ sid, ...shot, file: w.path.split('/').pop() || w.path, auto: true }) };
  }
  const forSid = sid => sid ? all().filter(x => x.sid === sid).map(view).sort((x, y) => y.at - x.at) : [];
  const forModel = name => { const k = key(name); return k ? all().map(view).filter(x => key(x.model) === k).sort((x, y) => y.at - x.at) : []; };
  // 每个型号取最新一张，按推理分从高到低（没有分的排最后）；若最新一张未带分则继承同型号已有推理分
  const latest = () => {
    const m = new Map();
    for (const r of all().map(view)) {
      const k = key(r.model) || '未识别', o = m.get(k);
      if (!o) m.set(k, { ...r });
      else if (r.at >= o.at) m.set(k, { ...r, score: r.score ?? o.score ?? null, think: r.think ?? o.think ?? null });
      else if (o.score == null && r.score != null) o.score = r.score;
    }
    return [...m.values()].sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.at - x.at);
  };
  function exportData({ models = null } = {}) {
    const filterKeys = Array.isArray(models) && models.length ? new Set(models.map(key)) : null;
    const rows = all().map(view).filter(r => !filterKeys || filterKeys.has(key(r.model)));
    const sids = new Set(rows.map(r => r.sid).filter(Boolean));
    const mKeys = new Set(rows.map(r => key(r.model)).filter(Boolean));
    const pelAll = typeof PelicanTest !== 'undefined' && PelicanTest.all ? PelicanTest.all() : {};
    const pelican = {};
    for (const [sid, p] of Object.entries(pelAll || {})) {
      if (!filterKeys || sids.has(sid) || (p?.name && mKeys.has(key(p.name)))) pelican[sid] = p;
    }
    const samples = {};
    try {
      const sMap = typeof Strength !== 'undefined' && Strength.samples ? Strength.samples : {};
      for (const [mName, arr] of Object.entries(sMap || {})) {
        if (!Array.isArray(arr) || !arr.length) continue;
        if (filterKeys && !mKeys.has(key(mName))) continue;
        const stdRows = arr.filter(x => x && x.std);
        if (stdRows.length) samples[mName] = stdRows;
      }
    } catch {}
    const modSet = new Set(rows.map(r => key(r.model)));
    return {
      schema: 'brana-pelican-library-v1',
      version: typeof VERSION !== 'undefined' ? VERSION : '0.13.154',
      exportedAt: new Date().toISOString(),
      acct: curAcct() || 'client',
      modelCount: modSet.size,
      count: rows.length,
      shots: rows,
      pelican,
      samples,
    };
  }
  function exportLibrary(opts = {}) {
    const data = exportData(opts);
    if (!data.shots.length) { toast('当前鹈鹕测试库还没有记录可导出', 'err'); return null; }
    const fname = 'brana-pelican-library-' + new Date().toISOString().slice(0, 10) + '.json';
    const json = JSON.stringify(data, null, 2);
    try {
      if (typeof FileExport !== 'undefined' && FileExport.text) FileExport.text(json, fname, 'application/json');
      else if (typeof FileExport !== 'undefined' && FileExport.write) void FileExport.write(json, fname, 'application/json');
    } catch (e) { toast('导出失败：' + describe(e), 'err'); return null; }
    toast('已导出鹈鹕测试库 · ' + data.modelCount + ' 个型号 / ' + data.count + ' 张测试图');
    return data;
  }
  function parseSvgTableImport(svgText) {
    const s = String(svgText || '');
    if (!/<svg[\s>]/i.test(s) || !/<image\b/i.test(s)) return null;
    try {
      const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
      const imgs = [...doc.querySelectorAll('image')];
      const texts = [...doc.querySelectorAll('text')];
      const shots = [];
      for (const im of imgs) {
        const href = im.getAttribute('href') || im.getAttribute('xlink:href') || '';
        if (!/^data:image\//i.test(href)) continue;
        const iy = parseFloat(im.getAttribute('y') || '0');
        const rowTexts = texts.filter(t => { const ty = parseFloat(t.getAttribute('y') || '0'); return ty >= iy - 15 && ty <= iy + 185; });
        const model = cleanName(rowTexts[0]?.textContent || '导入型号') || '导入型号';
        const scTxt = rowTexts.find(t => /^\d+(\.\d+)?$/.test((t.textContent || '').trim()))?.textContent;
        const score = scTxt != null && Number.isFinite(+scTxt) ? +scTxt : null;
        shots.push({
          id: 'svg-' + key(model) + '-' + shots.length,
          at: now() - shots.length * 1000,
          sid: null,
          model,
          score,
          url: href,
          w: Math.round(parseFloat(im.getAttribute('width') || '560')) || 560,
          h: Math.round(parseFloat(im.getAttribute('height') || '373')) || 373,
          file: 'pelican.svg',
          acct: 'SVG导入',
        });
      }
      return shots.length ? { shots, pelican: {}, samples: {} } : null;
    } catch { return null; }
  }
  function importData(rawInput, { quiet = false } = {}) {
    let obj = rawInput;
    if (typeof rawInput === 'string') {
      const trimmed = rawInput.trim();
      if (trimmed.startsWith('<')) {
        obj = parseSvgTableImport(trimmed);
        if (!obj) throw Error('SVG 文件中未找到可导入的鹈鹕测试图记录');
      } else {
        try { obj = JSON.parse(trimmed); } catch { throw Error('导入文件格式不是有效的 JSON 或鹈鹕能力表 SVG'); }
      }
    }
    const inShots = Array.isArray(obj) ? obj : Array.isArray(obj?.shots) ? obj.shots : Array.isArray(obj?.rows) ? obj.rows : [];
    const inPel = obj && typeof obj === 'object' && !Array.isArray(obj) && obj.pelican && typeof obj.pelican === 'object' ? obj.pelican : {};
    const inSamples = obj && typeof obj === 'object' && !Array.isArray(obj) && obj.samples && typeof obj.samples === 'object' ? obj.samples : {};
    if (!inShots.length && !Object.keys(inPel).length && !Object.keys(inSamples).length) {
      throw Error('导入文件中没有找到有效的鹈鹕测试图或评分记录');
    }
    if (Object.keys(inPel).length && typeof PelicanTest !== 'undefined' && PelicanTest.merge) {
      try { PelicanTest.merge(inPel); } catch {}
    }
    if (Object.keys(inSamples).length && typeof Strength !== 'undefined' && Strength.addSample) {
      for (const [mName, arr] of Object.entries(inSamples)) {
        if (!Array.isArray(arr)) continue;
        for (const sRow of arr) { try { Strength.addSample(mName, sRow); } catch {} }
      }
    }
    const dm = { ...delMap() };
    const existing = all().map(view);
    const byId = new Map(existing.map(x => [x.id, x]));
    let added = 0, updated = 0, skipped = 0;
    const validIncoming = [];
    for (const rawRow of inShots) {
      if (!rawRow || typeof rawRow !== 'object' || typeof rawRow.url !== 'string' || !/^data:image\//i.test(rawRow.url)) continue;
      const id = String(rawRow.id || '').trim() || ('imp-' + (rawRow.at || now()) + '-' + Math.random().toString(36).slice(2, 7));
      if (dm[id]) delete dm[id];
      const normModel = cleanName(rawRow.model) || '未识别';
      const normScore = rawRow.score != null && Number.isFinite(+rawRow.score) ? +rawRow.score : null;
      const normThink = rawRow.think != null && Number.isFinite(+rawRow.think) ? +rawRow.think : null;
      const match = byId.get(id) || existing.find(x => x.url === rawRow.url && ((x.sid && x.sid === rawRow.sid) || key(x.model) === key(normModel)));
      if (!match) {
        added++;
      } else if ((isBetterModel(normModel, match.model) && normModel !== match.model) || (normScore != null && match.score == null) || (normThink != null && match.think == null)) {
        updated++;
      } else {
        skipped++;
      }
      validIncoming.push({
        ...rawRow,
        id: match?.id || id,
        at: Number(rawRow.at) || now(),
        sid: rawRow.sid || null,
        model: normModel,
        score: normScore,
        think: normThink,
        w: Number(rawRow.w) || 560,
        h: Number(rawRow.h) || 373,
        file: String(rawRow.file || 'pelican.html'),
        acct: String(rawRow.acct || obj?.acct || '外部导入').trim(),
      });
    }
    saveDel(dm);
    const merged = mergeRows(existing, validIncoming, dm, '外部导入');
    save(merged);
    void writeShared({ rows: merged, del: dm, pelican: typeof PelicanTest !== 'undefined' && PelicanTest.all ? PelicanTest.all() : {}, acct: curAcct(), import: true });
    try { Dock.render?.(); } catch {}
    try { if (typeof table.refreshOpen === 'function') table.refreshOpen(); } catch {}
    const modCount = latest().length;
    if (!quiet) toast(`已导入合并鹈鹕测试库：新增 ${added} 条 · 更新 ${updated} 条 · 跳过重复 ${skipped} 条（当前共 ${modCount} 个型号 / ${merged.length} 张图）`);
    return { ok: true, added, updated, skipped, total: merged.length, modelCount: modCount };
  }
  function openImport(onDone) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = '.json,.svg,application/json,image/svg+xml';
    inp.onchange = async () => {
      const files = [...(inp.files || [])];
      if (!files.length) return;
      let totalAdd = 0, totalUpd = 0, totalSkip = 0;
      for (const f of files) {
        try {
          const txt = await f.text();
          const r = importData(txt, { quiet: files.length > 1 });
          totalAdd += r.added; totalUpd += r.updated; totalSkip += r.skipped;
        } catch (e) {
          toast((f.name ? f.name + '：' : '') + describe(e), 'err');
        }
      }
      if (files.length > 1) {
        toast(`已合并 ${files.length} 个测试库文件：新增 ${totalAdd} 条 · 更新 ${totalUpd} 条 · 跳过重复 ${totalSkip} 条（共 ${latest().length} 个型号）`);
      }
      if (typeof onDone === 'function') try { onDone(); } catch {}
    };
    inp.click();
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  function tableSvg(customRows) {
    const rows = Array.isArray(customRows) ? customRows : latest(), W = 980, PAD = 20, LW = 330, RH = 200, TOP = 78, imgW = W - LW - PAD * 2 - 10, H = TOP + Math.max(1, rows.length) * RH + PAD;
    const date = new Date().toLocaleString('zh-CN', { hour12: false });
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif">`,
      `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
      `<text x="${PAD}" y="38" font-size="24" font-weight="700" fill="#111">Brana · 鹈鹕测试能力表</text>`,
      `<text x="${PAD}" y="62" font-size="13" fill="#777">全客户端共享 · 按推理分从高到低 · 共 ${rows.length} 个型号 · ${esc(date)}</text>`];
    rows.forEach((r, i) => {
      const y = TOP + i * RH, sc = r.score;
      out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" stroke="#e5e5e5"/>`,
        `<text x="${PAD}" y="${y + 50}" font-size="22" font-weight="600" fill="#111">${esc(r.model.length > 26 ? r.model.slice(0, 25) + '…' : r.model)}</text>`,
        `<text x="${PAD}" y="${y + 92}" font-size="13" fill="#777">推理分</text>`,
        `<text x="${PAD + 56}" y="${y + 96}" font-size="34" font-weight="700" fill="${sc == null ? '#aaa' : '#111'}">${sc == null ? '—' : esc(Strength.fmtScore(sc))}</text>`);
      out.push(`<rect x="${PAD}" y="${y + 112}" width="${LW - 50}" height="8" rx="4" fill="#eee"/>`);
      if (sc != null) out.push(`<rect x="${PAD}" y="${y + 112}" width="${Math.max(6, (LW - 50) * sc / 100).toFixed(1)}" height="8" rx="4" fill="#d97757"/>`);
      const metaParts = [new Date(r.at).toLocaleDateString('zh-CN')];
      if (r.think != null) metaParts.push('思考 ' + r.think + 's');
      if (r.acct) metaParts.push(r.acct.slice(0, 12));
      else if (r.file) metaParts.push(r.file.slice(0, 22));
      out.push(`<text x="${PAD}" y="${y + 150}" font-size="12" fill="#999">${esc(metaParts.join(' · '))}</text>`);
      const rw = Math.max(1, Number(r.w) || 560), rh = Math.max(1, Number(r.h) || 373);
      const ih = Math.min(RH - 20, imgW * rh / rw), iw = ih * rw / rh, ix = PAD + LW + 10;
      out.push(`<rect x="${ix - 1}" y="${y + 10 - 1}" width="${iw + 2}" height="${ih + 2}" rx="6" fill="none" stroke="#ddd"/>`, `<image x="${ix}" y="${y + 10}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${r.url}"/>`);
    });
    out.push('</svg>'); return out.join('\n');
  }
  function table(initOpts = {}) {
    const opts = initOpts && typeof initOpts === 'object' && !initOpts.target && !initOpts.preventDefault ? initOpts : {};
    const st = {
      q: '',
      vf: '',
      sort: 'score',
      onlyCmp: false,
      cmp: new Set(),
      shotIdx: new Map(),
    };
    if (opts.compareModel && opts.compareModel !== '未识别') st.cmp.add(key(opts.compareModel));
    const hostWrap = h('div', { class: 'pel-lib-wrap' });
    const titleEl = h('span', {}, '鹈鹕测试库（全客户端共享）');
    const getFilteredModels = () => {
      const base = latest();
      const q = st.q.trim().toLowerCase();
      let list = base.filter(r => {
        if (st.onlyCmp && st.cmp.size && !st.cmp.has(key(r.model))) return false;
        const vid = (typeof Brand !== 'undefined' && Brand.of ? Brand.of(r.model) : '') || 'other';
        if (st.vf && vid !== st.vf) return false;
        if (q && !String(r.model + ' ' + (r.acct || '') + ' ' + (r.file || '')).toLowerCase().includes(q)) return false;
        return true;
      });
      if (st.sort === 'at') list = list.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
      else if (st.sort === 'think') list = list.slice().sort((a, b) => (a.think ?? 99999) - (b.think ?? 99999) || (b.score ?? -1) - (a.score ?? -1));
      else if (st.sort === 'name') list = list.slice().sort((a, b) => String(a.model).localeCompare(String(b.model)));
      return list;
    };
    const paint = () => {
      const allShots = all().map(view), models = latest(), filtered = getFilteredModels();
      titleEl.textContent = `鹈鹕测试库（全客户端共享 · ${models.length} 个型号 / ${allShots.length} 张测试图）`;
      const byModelShots = new Map();
      for (const r of allShots) {
        const k = key(r.model) || '未识别';
        if (!byModelShots.has(k)) byModelShots.set(k, []);
        byModelShots.get(k).push(r);
      }
      for (const arr of byModelShots.values()) arr.sort((a, b) => (b.at || 0) - (a.at || 0));

      const vids = [...new Set(models.map(r => (typeof Brand !== 'undefined' && Brand.of ? Brand.of(r.model) : '') || 'other'))];
      const vName = v => v === 'other' ? '开源/其它' : (typeof Brand !== 'undefined' && Brand.NAME?.[v]) || v;

      const topBar = h('div', { class: 'pel-toolbar', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' } },
        h('input', {
          class: 'inp sm',
          type: 'search',
          placeholder: '搜索型号 / 账号来源…',
          style: { minWidth: '170px', flex: '1' },
          value: st.q,
          oninput: e => { st.q = e.target.value; paint(); },
        }),
        h('select', {
          class: 'inp sm',
          style: { width: 'auto' },
          value: st.sort,
          onchange: e => { st.sort = e.target.value; paint(); },
        },
          h('option', { value: 'score', selected: st.sort === 'score' ? 'selected' : null }, '按推理分从高到低'),
          h('option', { value: 'at', selected: st.sort === 'at' ? 'selected' : null }, '按记录时间最新'),
          h('option', { value: 'think', selected: st.sort === 'think' ? 'selected' : null }, '按思考耗时最短'),
          h('option', { value: 'name', selected: st.sort === 'name' ? 'selected' : null }, '按型号名称 A–Z')),
        h('button', {
          type: 'button',
          class: 'btn xs' + (st.cmp.size >= 2 ? ' pri' : ' ghost'),
          title: '快速把排名前 2 的型号加入并排对比',
          onclick: () => {
            st.cmp.clear();
            for (const r of filtered.slice(0, 2)) st.cmp.add(key(r.model));
            paint();
          },
        }, '前 2 名对比'),
        h('button', {
          type: 'button',
          class: 'btn xs ghost',
          title: '快速把排名前 4 的型号加入并排对比',
          onclick: () => {
            st.cmp.clear();
            for (const r of filtered.slice(0, 4)) st.cmp.add(key(r.model));
            paint();
          },
        }, '前 4 名对比'),
        st.cmp.size ? h('button', {
          type: 'button',
          class: 'btn xs' + (st.onlyCmp ? ' pri' : ' ghost'),
          onclick: () => { st.onlyCmp = !st.onlyCmp; paint(); },
        }, st.onlyCmp ? `显示全部 (${models.length})` : `只看已选对比 (${st.cmp.size})`) : null,
        st.cmp.size ? h('button', {
          type: 'button',
          class: 'btn xs ghost',
          onclick: () => { st.cmp.clear(); st.onlyCmp = false; paint(); },
        }, '清空对比') : null);

      const vendBar = vids.length > 1 ? h('div', { class: 'gvend', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
        h('button', { type: 'button', class: 'gchip' + (!st.vf ? ' on' : ''), onclick: () => { st.vf = ''; paint(); } }, '全部 (' + models.length + ')'),
        ...vids.map(v => h('button', {
          type: 'button',
          class: 'gchip' + (st.vf === v ? ' on' : ''),
          onclick: () => { st.vf = st.vf === v ? '' : v; paint(); },
        }, v !== 'other' && typeof VIcon !== 'undefined' ? VIcon.el(v, 13) : null, vName(v)))) : null;

      let cmpSection = null;
      const cmpModels = models.filter(r => st.cmp.has(key(r.model)));
      if (cmpModels.length >= 1) {
        const topScore = cmpModels.reduce((m, r) => r.score != null && r.score > m ? r.score : m, -Infinity);
        cmpSection = h('div', {
          class: 'pel-cmp-box',
          style: { border: '1px solid var(--bd, rgba(128,128,128,.25))', borderRadius: '10px', padding: '10px', marginBottom: '12px', background: 'var(--bg2, rgba(128,128,128,.05))' },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' } },
            h('b', {}, `鹈鹕结果并排对比（已选 ${cmpModels.length} 款模型）`),
            h('span', { class: 'sm dim grow' }, cmpModels.length === 1 ? '在下方点任意型号的「加入对比」即可并排比对画面细节与推理分差距' : '点图片可放大查看细节；同一型号有多张记录时可切换对比'),
            h('button', { type: 'button', class: 'btn xs ghost', onclick: () => exportLibrary({ models: [...st.cmp] }) }, icon('download'), ' 导出对比组 JSON')),
          h('div', {
            class: 'pel-cmp-grid',
            style: { display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cmpModels.length <= 2 ? '260px' : '210px'}, 1fr))`, gap: '10px' },
          }, ...cmpModels.map((mRow, idx) => {
            const mk = key(mRow.model), shots = byModelShots.get(mk) || [mRow];
            const sIdx = Math.min(shots.length - 1, Math.max(0, st.shotIdx.get(mk) || 0));
            const cur = shots[sIdx] || mRow;
            const sc = cur.score ?? mRow.score;
            const diff = sc != null && Number.isFinite(topScore) && topScore > -Infinity ? +(sc - topScore).toFixed(1) : null;
            const vid = typeof Brand !== 'undefined' && Brand.of ? Brand.of(mRow.model) : null;
            return h('div', {
              class: 'pel-cmp-card',
              style: { border: '1px solid var(--bd, rgba(128,128,128,.22))', borderRadius: '8px', padding: '8px', background: 'var(--bg, #fff)', display: 'flex', flexDirection: 'column', gap: '6px' },
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                h('span', { class: 'mono sm b', style: { color: idx === 0 ? '#d97757' : 'var(--mut)' } }, '#' + (idx + 1)),
                vid && typeof VIcon !== 'undefined' ? VIcon.el(vid, 14) : null,
                h('b', { class: 'grow', style: { fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: mRow.model }, mRow.model),
                h('button', { type: 'button', class: 'ib xs', title: '移出对比', onclick: () => { st.cmp.delete(mk); paint(); } }, icon('x'))),
              h('div', { class: 'sm', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
                h('b', { style: { color: sc != null ? '#d97757' : 'var(--mut)' } }, sc != null ? '推理分 ' + Strength.fmtScore(sc) : '未计分'),
                diff != null && cmpModels.length > 1 ? h('span', { class: 'mono', style: { fontSize: '11px', padding: '1px 5px', borderRadius: '4px', background: diff === 0 ? 'rgba(217,119,87,.15)' : 'rgba(128,128,128,.12)', color: diff === 0 ? '#d97757' : 'var(--mut)' } }, diff === 0 ? '最高分' : (diff > 0 ? '+' : '') + diff + ' 分') : null,
                cur.think != null ? h('span', { class: 'dim' }, '思考 ' + cur.think + 's') : null,
                cur.acct ? h('span', { class: 'dim' }, '· ' + cur.acct) : null),
              h('img', {
                src: cur.url,
                alt: mRow.model,
                style: { width: '100%', height: cmpModels.length <= 2 ? '210px' : '165px', objectFit: 'contain', borderRadius: '6px', background: '#fff', border: '1px solid rgba(128,128,128,.15)', cursor: 'zoom-in' },
                title: '点击放大查看画面细节',
                onclick: () => HtmlPreview.image?.(cur.url, mRow.model + ' · 鹈鹕测试图', [sc != null ? '推理分 ' + Strength.fmtScore(sc) : '', cur.acct ? '来源 ' + cur.acct : ''].filter(Boolean).join(' · ')),
              }),
              h('div', { class: 'sm dim', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' } },
                h('span', {}, new Date(cur.at).toLocaleString('zh-CN', { hour12: false })),
                shots.length > 1 ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  h('button', { type: 'button', class: 'btn xs ghost', onclick: () => { st.shotIdx.set(mk, (sIdx - 1 + shots.length) % shots.length); paint(); } }, '◀'),
                  h('span', { class: 'mono' }, `${sIdx + 1}/${shots.length}`),
                  h('button', { type: 'button', class: 'btn xs ghost', onclick: () => { st.shotIdx.set(mk, (sIdx + 1) % shots.length); paint(); } }, '▶')) : h('span', {}, cur.file || '')));
          })));
      }

      if (!models.length) {
        const emptySvg = tableSvg([]), emptySrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(emptySvg);
        hostWrap.replaceChildren(
          topBar,
          h('div', { class: 'empty', style: { padding: '28px 16px', textAlign: 'center', border: '1px dashed var(--bd, rgba(128,128,128,.3))', borderRadius: '10px', marginBottom: '12px' } },
            h('p', { style: { fontWeight: '600', marginBottom: '6px' } }, '当前客户端还没有鹈鹕测试记录'),
            h('p', { class: 'sm dim', style: { marginBottom: '14px' } }, '在任意账号跑完「鹈鹕测试」或点 HTML 预览窗格右上角「记录」会自动汇总到这里；也可以直接导入他人分享的测试库 JSON / SVG 进行合并对比。'),
            h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
              h('button', { type: 'button', class: 'btn pri', onclick: () => openImport(() => paint()) }, icon('plus'), ' 导入合并测试库 (JSON / SVG)'),
              h('button', { type: 'button', class: 'btn', onclick: () => void pull(true, false).then(() => paint()) }, icon('refresh'), ' 扫描合并本机所有账号'))),
          h('div', { class: 'pt-wrap', style: { display: 'none' } }, h('img', { class: 'pt-img', src: emptySrc, alt: '鹈鹕测试能力表' })));
        return;
      }

      const cardsGrid = h('div', {
        class: 'pel-cards-grid',
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: '10px', marginBottom: '14px' },
      }, ...filtered.map(mRow => {
        const mk = key(mRow.model), shots = byModelShots.get(mk) || [mRow];
        const sIdx = Math.min(shots.length - 1, Math.max(0, st.shotIdx.get(mk) || 0));
        const cur = shots[sIdx] || mRow;
        const inCmp = st.cmp.has(mk);
        const vid = typeof Brand !== 'undefined' && Brand.of ? Brand.of(mRow.model) : null;
        const sc = cur.score ?? mRow.score;
        return h('div', {
          class: 'pel-model-card' + (inCmp ? ' on' : ''),
          style: { border: inCmp ? '1.5px solid #d97757' : '1px solid var(--bd, rgba(128,128,128,.2))', borderRadius: '8px', padding: '8px', background: 'var(--bg, #fff)', display: 'flex', flexDirection: 'column', gap: '6px' },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            vid && typeof VIcon !== 'undefined' ? VIcon.el(vid, 14) : null,
            h('b', { class: 'grow', style: { fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: mRow.model }, mRow.model),
            h('button', {
              type: 'button',
              class: 'btn xs ' + (inCmp ? 'pri' : 'ghost'),
              onclick: () => { if (inCmp) st.cmp.delete(mk); else st.cmp.add(mk); paint(); },
            }, inCmp ? '✓ 对比中' : '+ 对比')),
          h('div', { class: 'sm', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
            h('b', { style: { color: sc != null ? '#d97757' : 'var(--mut)' } }, sc != null ? '推理分 ' + Strength.fmtScore(sc) : '未计分'),
            cur.think != null ? h('span', { class: 'dim' }, '思考 ' + cur.think + 's') : null,
            cur.acct ? h('span', { class: 'dim' }, '· ' + cur.acct) : null,
            shots.length > 1 ? h('span', { class: 'dim mono' }, `(${shots.length}张)`) : null),
          h('img', {
            src: cur.url,
            alt: mRow.model,
            loading: 'lazy',
            style: { width: '100%', height: '148px', objectFit: 'contain', borderRadius: '6px', background: '#fff', border: '1px solid rgba(128,128,128,.12)', cursor: 'zoom-in' },
            title: '点击放大查看',
            onclick: () => HtmlPreview.image?.(cur.url, mRow.model + ' · 鹈鹕测试图', [sc != null ? '推理分 ' + Strength.fmtScore(sc) : '', cur.acct ? '来源 ' + cur.acct : ''].filter(Boolean).join(' · ')),
          }),
          shots.length > 1 ? h('div', { class: 'mc-pelth' }, ...shots.map((x, i) => h('button', {
            type: 'button',
            class: i === sIdx ? 'on' : '',
            title: new Date(x.at).toLocaleString('zh-CN', { hour12: false }) + (x.acct ? ' · ' + x.acct : ''),
            onclick: () => { st.shotIdx.set(mk, i); paint(); },
          }, h('img', { src: x.url, alt: '' })))) : null,
          h('div', { class: 'sm dim', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('span', {}, new Date(cur.at).toLocaleDateString('zh-CN') + (cur.file ? ' · ' + cur.file.slice(0, 18) : '')),
            h('button', { type: 'button', class: 'btn xs ghost', onclick: () => { del(cur.id); paint(); try { Dock.render?.(); } catch {} } }, '删除')));
      }));

      const svg = tableSvg(filtered.length ? filtered : models), src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const svgSection = h('div', { style: { marginTop: '6px' } },
        h('div', { class: 'sm dim', style: { marginBottom: '6px', fontWeight: '600' } }, `能力总表长图预览（共 ${(filtered.length ? filtered : models).length} 个型号 · 可直接导出 SVG 或 JSON 测试库）`),
        h('div', { class: 'pt-wrap' }, h('img', { class: 'pt-img', src, alt: '鹈鹕测试能力表' })));

      hostWrap.replaceChildren(topBar, vendBar, cmpSection, cardsGrid, svgSection);
    };

    paint();
    table.refreshOpen = () => { if (hostWrap.isConnected) paint(); };
    void pull(true, true).then(() => { if (hostWrap.isConnected) paint(); });

    const foot = [
      h('button', { class: 'btn', onclick: () => { if (table.refreshOpen) table.refreshOpen = null; back.remove(); } }, '关闭'),
      h('button', { class: 'btn ghost', title: '汇总合并本客户端所有账号的鹈鹕测试记录', onclick: () => void pull(true, false).then(() => paint()) }, icon('refresh'), ' 同步全账号'),
      h('button', { class: 'btn', title: '导入他人或其它设备导出的鹈鹕测试库 JSON / SVG 并自动去重合并', onclick: () => openImport(() => paint()) }, icon('plus'), ' 导入合并'),
      h('button', { class: 'btn', title: '导出完整鹈鹕测试库 JSON（含所有型号截图、推理分、思考时长，方便分享与合并）', onclick: () => exportLibrary(st.onlyCmp && st.cmp.size ? { models: [...st.cmp] } : {}) }, icon('download'), ' 导出测试库 (JSON)'),
      h('button', { class: 'btn pri', title: '导出可视化 SVG 能力总表长图', onclick: () => {
        const list = getFilteredModels();
        const svg = tableSvg(list.length ? list : latest());
        if (typeof FileExport !== 'undefined' && FileExport.text) FileExport.text(svg, 'brana-pelican-table.svg', 'image/svg+xml');
        else if (typeof FileExport !== 'undefined' && FileExport.write) FileExport.write(svg, 'brana-pelican-table.svg', 'image/svg+xml').catch(e => toast('导出失败：' + describe(e), 'err'));
      } }, icon('download'), ' 导出 SVG'),
    ];
    const back = modal(titleEl, hostWrap, foot, 'pt-modal');
    return back;
  }
  function entryCard(sid) {
    const total = all().length, modCount = latest().length;
    return h('section', { class: 'mc-card mc-pel' },
      h('div', { class: 'mc-h' },
        h('b', { class: 'grow' }, '模型鹈鹕测试图'),
        h('span', { class: 'eyebrow' }, modCount ? `全客户端 ${modCount} 型号 · ${total} 张` : '全客户端共享'),
        h('button', { class: 'btn xs ghost', title: '导入合并外部鹈鹕测试库 JSON / SVG', onclick: e => { e.stopPropagation(); openImport(); } }, '导入'),
        total ? h('button', { class: 'btn xs ghost', title: '导出全客户端鹈鹕测试库 JSON', onclick: e => { e.stopPropagation(); exportLibrary(); } }, '导出') : null,
        h('button', { class: 'ib sm', title: '打开全客户端鹈鹕测试库（查看 / 对比 / 导入 / 导出）', onclick: () => table() }, icon('pvtable'))),
      h('div', { class: 'mc-uses sm dim' }, '全客户端所有账号的鹈鹕测试图自动互通。点右上角可打开测试库并排对比、导入合并或导出分享。'));
  }
  // 概览卡片：当前对话这个型号的鹈鹕测试图（最新一张大图 + 其余缩略图 + 全客户端测试库导入/导出/对比）
  function card(sid) {
    const m = modelOf(sid), own = forSid(sid), mine = own.length ? own : (m.model !== '未识别' ? forModel(m.model) : []), total = all().length;
    if (!mine.length && !total) return null;
    const sel = (card.sel ||= new Map()), sk = own.length ? 's:' + sid : key(m.model), cur = mine.find(x => x.id === sel.get(sk)) || mine[0];
    const modCount = latest().length;
    const dispModel = m.model !== '未识别' ? m.model : (cur?.model || '未识别');
    const head = h('div', { class: 'mc-h' },
      h('b', { class: 'grow' }, '模型鹈鹕测试图'),
      h('span', { class: 'eyebrow', title: own.length ? '这张图跟这个对话绑定，型号变了也不会丢' : '这个对话还没有存过图，显示全客户端同型号记录' },
        dispModel + (own.length || !mine.length ? '' : ' · 同型号参考') + (modCount > 1 ? ` · 库内 ${modCount} 型号` : '')),
      h('button', { class: 'btn xs ghost', title: '导入外部鹈鹕测试库 JSON / SVG 并与当前客户端合并', onclick: e => { e.stopPropagation(); openImport(); } }, '导入'),
      h('button', { class: 'btn xs ghost', title: '导出全客户端鹈鹕测试库 JSON（方便分享与合并对比）', onclick: e => { e.stopPropagation(); exportLibrary(); } }, '导出'),
      h('button', { class: 'ib sm', title: '全客户端鹈鹕测试库（能力表 · 多模型并排对比 · 导入导出）', onclick: () => table({ compareModel: dispModel }) }, icon('pvtable')));
    const el = h('section', { class: 'mc-card mc-pel' }, head);
    if (!cur) {
      el.append(h('div', { class: 'mc-uses sm dim' }, '这个型号还没有记录。点开对话里 Write 出来的 html，在预览窗格里点「记录」，或点右上角打开全客户端测试库（已汇总 ' + modCount + ' 个型号 / ' + total + ' 张图）对比与导入。'));
      return el;
    }
    el.append(
      h('img', { class: 'mc-pelimg', src: cur.url, alt: dispModel + ' 鹈鹕测试图', loading: 'lazy', onclick: () => HtmlPreview.image?.(cur.url, dispModel + ' · 鹈鹕测试图', cur.acct ? '来源：' + cur.acct : '') }),
      h('div', { class: 'mc-uses sm' },
        h('span', { class: 'grow' }, [
          new Date(cur.at).toLocaleString('zh-CN', { hour12: false }),
          cur.score != null ? '推理分 ' + Strength.fmtScore(cur.score) : '未计分',
          cur.think != null ? '思考 ' + cur.think + 's' : '',
          cur.acct ? cur.acct : '',
        ].filter(Boolean).join(' · ')),
        h('button', { class: 'btn ghost sm', title: '把该型号加入全客户端鹈鹕测试库进行多模型并排对比', onclick: () => table({ compareModel: dispModel }) }, '对比'),
        h('button', { class: 'btn ghost sm', onclick: () => { del(cur.id); try { Dock.render(); } catch {} } }, '删除')));
    if (mine.length > 1) el.append(h('div', { class: 'mc-pelth' }, ...mine.map(x => h('button', { type: 'button', class: x.id === cur.id ? 'on' : '', title: new Date(x.at).toLocaleString('zh-CN', { hour12: false }) + (x.acct ? ' · ' + x.acct : ''), onclick: () => { sel.set(sk, x.id); try { Dock.render(); } catch {} } }, h('img', { src: x.url, alt: '' })))));
    return el;
  }
  try {
    if (typeof Bus !== 'undefined' && Bus.on) {
      Bus.on('model', chat => { if (chat?.sid) syncSid(chat.sid); });
    }
  } catch {}
  setTimeout(() => { void pull(true, true); }, 650);
  return { add, auto, all, del, latest, forModel, forSid, card, entryCard, table, tableSvg, modelOf, pull, push, syncSid, exportData, exportLibrary, importData, openImport };
})();
