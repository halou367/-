// 内嵌预览：点对话里 Write 出来的文件那一行（html / svg 运行预览；md 渲染预览；js / 代码 / 文本文件看代码） → 右侧「工作区 + 模型信息」收起，换成一个预览窗格
// （预览 / 代码 两个视图）；关闭窗格就恢复成点开之前的样子（那两个面板的开合状态一直没动过，只是被 CSS 盖住）。
// 安全：窗格里页面放进 sandbox 的 iframe —— 给 allow-scripts 但不给 allow-same-origin（脚本在独立的空白源里跑，碰不到客户端、Cookie、存储），
// 不给 allow-popups / allow-forms / allow-top-navigation，CSP 断网（脚本只允许页面自带的内联脚本）。对话里的小窗和「记录」用的副本不跑脚本。
// 「记录」：把此刻看到的画面（含 CSS 动画的当前帧）画成一张小图，存到模型信息 · 概览 · 鹈鹕测试图，攒成能力表（SVG）。
ICON.pvcode = ICON.pvcode || '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>';
ICON.code = ICON.code || ICON.pvcode;
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
ICON.pvsize = ICON.pvsize || '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 9.5L5 12l2.5 2.5M16.5 9.5L19 12l-2.5 2.5M8.5 12h7"/>';
// 预览动画按需播放：所有 HTML / SVG 预览（对话小窗、右侧预览窗格、醍醐样本库缩略图与放大预览）默认静止，
// 鼠标移到预览上才运动，移开后停在离开那一刻的画面（节省 GPU / CPU）。页面加载后先跑 ~1.2 秒让画面画出来再定格。
// 页面内注入一段很小的脚本：暂停 CSS 动画 / 过渡 / Web Animations、SVG SMIL、音视频，并把 requestAnimationFrame 与 setTimeout 回调挂起，
// performance.now / Date.now / rAF 时间戳扣掉暂停时长，恢复时从定格处接着动，不会跳帧。触屏设备（无悬停）保持原来的一直播放。
const PvAnim = (() => {
  const WARM_MS = 1200;
  function guest(WARM) {
    var W = window, D = document;
    if (W.__pvAnim) return;
    try { if (W.matchMedia && W.matchMedia('(hover: none)').matches && !W.matchMedia('(any-hover: hover)').matches) return; } catch (e) {}
    var paused = false, want = false, warm = true, offset = 0, pausedAt = 0, frozenPerf = 0, frozenDate = 0;
    var dNow = Date.now, perf = W.performance;
    var pNow = perf && perf.now ? perf.now.bind(perf) : function () { return dNow(); };
    var nRAF = W.requestAnimationFrame, nCAF = W.cancelAnimationFrame;
    var nST = W.setTimeout, nCT = W.clearTimeout, nSI = W.setInterval;
    var rafSeq = 0, rafLive = new Map(), rafHeld = new Map(), heldTimers = new Map(), flushTimers = new Map();
    var pausedAnims = [], pausedSvgs = [], pausedMedia = [];
    function run(fn, args) { if (typeof fn === 'function') fn.apply(W, args); else if (fn != null) (0, eval)(String(fn)); }
    try { if (perf) perf.now = function () { return paused ? frozenPerf : pNow() - offset; }; } catch (e) {}
    try { Date.now = function () { return paused ? frozenDate : dNow() - offset; }; } catch (e) {}
    function schedule(id, cb) {
      rafLive.set(id, nRAF.call(W, function (t) { rafLive.delete(id); if (paused) rafHeld.set(id, cb); else cb(t - offset); }));
    }
    if (nRAF) {
      W.requestAnimationFrame = function (cb) { var id = ++rafSeq; if (paused) rafHeld.set(id, cb); else schedule(id, cb); return id; };
      W.cancelAnimationFrame = function (id) { if (rafLive.has(id)) { nCAF.call(W, rafLive.get(id)); rafLive.delete(id); } rafHeld.delete(id); };
    }
    W.setTimeout = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments, 2), id;
      id = nST.call(W, function () { if (paused) heldTimers.set(id, [fn, args]); else run(fn, args); }, ms);
      return id;
    };
    W.clearTimeout = function (id) { heldTimers.delete(id); flushTimers.delete(id); nCT.call(W, id); };
    W.setInterval = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments, 2);
      return nSI.call(W, function () { if (!paused) run(fn, args); }, ms);
    };
    try {
      var css = D.createElement('style');
      css.textContent = 'html.__pvp *,html.__pvp *::before,html.__pvp *::after{animation-play-state:paused!important}';
      (D.head || D.documentElement).appendChild(css);
    } catch (e) {}
    function pause() {
      if (paused) return;
      frozenPerf = pNow() - offset; frozenDate = dNow() - offset; pausedAt = pNow(); paused = true;
      try { D.documentElement.classList.add('__pvp'); } catch (e) {}
      try { var a = D.getAnimations ? D.getAnimations() : []; for (var i = 0; i < a.length; i++) if (a[i].playState === 'running') { a[i].pause(); pausedAnims.push(a[i]); } } catch (e) {}
      try { var s = D.getElementsByTagName('svg'); for (var j = 0; j < s.length; j++) if (s[j].pauseAnimations && !(s[j].animationsPaused && s[j].animationsPaused())) { s[j].pauseAnimations(); pausedSvgs.push(s[j]); } } catch (e) {}
      try { var m = D.querySelectorAll('video,audio'); for (var k = 0; k < m.length; k++) if (!m[k].paused) { m[k].pause(); pausedMedia.push(m[k]); } } catch (e) {}
    }
    function resume() {
      if (!paused) return;
      offset += pNow() - pausedAt; paused = false;
      try { D.documentElement.classList.remove('__pvp'); } catch (e) {}
      var a = pausedAnims, s = pausedSvgs, m = pausedMedia, i;
      pausedAnims = []; pausedSvgs = []; pausedMedia = [];
      for (i = 0; i < a.length; i++) { try { a[i].play(); } catch (e) {} }
      for (i = 0; i < s.length; i++) { try { s[i].unpauseAnimations(); } catch (e) {} }
      for (i = 0; i < m.length; i++) { try { var p = m[i].play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      if (rafHeld.size) { var held = []; rafHeld.forEach(function (cb, id) { held.push([id, cb]); }); rafHeld.clear(); for (i = 0; i < held.length; i++) schedule(held[i][0], held[i][1]); }
      if (heldTimers.size) {
        heldTimers.forEach(function (v, id) { flushTimers.set(id, v); }); heldTimers.clear();
        nST.call(W, function () { var ids = []; flushTimers.forEach(function (v, id) { ids.push(id); }); for (var q = 0; q < ids.length; q++) { var v = flushTimers.get(ids[q]); if (!v) continue; flushTimers.delete(ids[q]); if (paused) { heldTimers.set(ids[q], v); continue; } try { run(v[0], v[1]); } catch (e) { nST.call(W, function () { throw e; }, 0); } } }, 0);
      }
    }
    function apply() { if (want || warm) resume(); else pause(); }
    function set(play) { warm = false; want = !!play; apply(); }
    W.__pvAnim = { play: function () { set(true); }, pause: function () { set(false); }, isPaused: function () { return paused; } };
    W.addEventListener('message', function (e) { var d = e && e.data; if (d && typeof d === 'object' && typeof d.__pvAnim === 'string') set(d.__pvAnim === 'play'); });
    D.addEventListener('mouseover', function () { if (!want || warm) set(true); }, true);
    D.addEventListener('mouseout', function (e) { if (!e.relatedTarget) set(false); }, true);
    function endWarm() { if (!warm) return; warm = false; apply(); }
    if (D.readyState === 'complete') nST.call(W, endWarm, WARM);
    else W.addEventListener('load', function () { nST.call(W, endWarm, WARM); });
    nST.call(W, endWarm, WARM + 5000);
  }
  const SCRIPT = '(' + guest.toString() + ')(' + WARM_MS + ');';
  // 给原始 html 文本插入控制脚本：放在 <head> 开头（保证先于页面自己的脚本执行），不破坏 <!doctype>
  function inject(html) {
    const s = String(html == null ? '' : html);
    if (!s || s.includes('W.__pvAnim')) return s;
    const tag = '<script>' + SCRIPT + '<\/script>';
    for (const re of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype[^>]*>/i]) {
      const m = re.exec(s);
      if (m) return s.slice(0, m.index + m[0].length) + tag + s.slice(m.index + m[0].length);
    }
    return tag + s;
  }
  const post = (f, play) => { try { f?.contentWindow?.postMessage({ __pvAnim: play ? 'play' : 'pause' }, '*'); } catch {} };
  // host = 包住预览 iframe 的容器（缩略图 iframe 通常 pointer-events:none，鼠标事件只能在容器上收）
  function bind(host, f) {
    if (!host || !f) return;
    if (!host.__pvAnimBound) {
      host.__pvAnimBound = true;
      const all = play => { try { host.querySelectorAll('iframe').forEach(x => post(x, play)); } catch {} };
      host.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') all(true); });
      host.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') all(false); });
    }
    f.addEventListener('load', () => { let hov = false; try { hov = host.matches(':hover'); } catch {} if (hov) post(f, true); });
  }
  return { SCRIPT, inject, bind, post, WARM_MS };
})();
if (typeof globalThis !== 'undefined') globalThis.PvAnim = PvAnim;
const HtmlPreview = (() => {
  const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; base-uri 'none'; form-action 'none'";
  const CSP_RUN = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";
  const NOBAR = 'html,body{scrollbar-width:none;overflow:hidden!important}::-webkit-scrollbar{display:none}';
  const MAXCODE = 400000;
  let st = null, root = null, frame = null;
  const countLinesFast = s => { if (!s) return 0; let n = 1; for (let i = 0, L = s.length; i < L; i++) if (s.charCodeAt(i) === 10) n++; return n; };
  const textSig = (text, name = '') => (name || '') + ':' + text.length + ':' + text.slice(0, 64) + ':' + text.slice(-64);
  const docCache = new Map(), stageMetaCache = new Map();
  const CODE = /\.(?:m?[jt]sx?|cjs|json|jsonc|css|scss|less|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|lua|sh|bash|zsh|ps1|bat|ya?ml|toml|ini|xml|sql|txt|csv|log|vue|svelte|diff|patch)$/i;
  const kindOf = path => { const f = String(path || '').split(/[?#]/)[0]; return /\.(?:html?|svg)$/i.test(f) ? 'html' : /\.(?:md|markdown|mdx)$/i.test(f) ? 'md' : CODE.test(f) ? 'code' : null; };
  const previewable = path => kindOf(path) !== null;
  const hasScript = html => /<script[\s>]/i.test(html) || /\son[a-z]+\s*=/i.test(html);
  function resolveRelPvPath(basePath, ref) {
    let r = String(ref || '').trim();
    if (!r || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r)) return null;
    r = r.split(/[?#]/)[0];
    if (!r) return null;
    const cleanBase = normPvPath(basePath);
    const dir = cleanBase.includes('/') ? cleanBase.split('/').slice(0, -1) : [];
    const parts = r.startsWith('/') ? [] : [...dir];
    for (const seg of r.replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\/+/, '').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/') || null;
  }
  function lookupSessionAssetText(sid, relPath) {
    if (!sid || !relPath) return '';
    const norm = normPvPath(relPath);
    if (!norm) return '';
    try {
      if (typeof R !== 'undefined' && typeof R.latestFileText === 'function') {
        const lt = String(R.latestFileText(sid, norm) || '');
        if (lt && !isStubText(lt)) return lt;
      }
    } catch {}
    return resolvedText(sid, norm);
  }
  // 把任意 html / svg 文本整理成「只读」文档：补 CSP、内联当前会话相对路径资源、去掉自动跳转和外链，svg 单文件包一层页面
  function docOf(text, name, { run = false, thumb = false, sid = '', basePath = '' } = {}) {
    const rawStr = String(text || '');
    const hasExtAssetRef = /<(?:link|script|img|source|image)\b/i.test(rawStr);
    const assetVer = (sid && hasExtAssetRef) ? (':' + sid + ':' + _resolvedVer + ':' + (typeof Chats !== 'undefined' && typeof R !== 'undefined' && R._chatWriteStamp && Chats.get?.(sid) ? R._chatWriteStamp(Chats.get(sid)) : '')) : '';
    const cKey = (run ? '1:' : '0:') + (thumb ? '1:' : '0:') + textSig(rawStr, basePath || name) + assetVer;
    const hit = docCache.get(cKey);
    if (hit !== undefined) return hit;
    const svg = /\.svg$/i.test(name || '') || (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(rawStr) && !/<html[\s>]/i.test(rawStr));
    const src = svg ? '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}body{display:flex;align-items:center;justify-content:center}svg{width:100%;height:100%}</style></head><body>' + rawStr.replace(/^\s*<\?xml[^>]*>/i, '') + '</body></html>' : rawStr;
    const d = new DOMParser().parseFromString(src, 'text/html');
    d.querySelectorAll('meta[http-equiv]').forEach(m => m.remove());
    const refBase = basePath || name || '';
    for (const l of [...d.querySelectorAll('link[rel~="stylesheet"][href]')]) {
      const rel = sid ? resolveRelPvPath(refBase, l.getAttribute('href')) : null;
      const cssTxt = rel ? lookupSessionAssetText(sid, rel) : '';
      if (cssTxt) {
        const stEl = d.createElement('style');
        stEl.textContent = cssTxt;
        l.replaceWith(stEl);
      } else {
        l.remove();
      }
    }
    if (!run) {
      d.querySelectorAll('script').forEach(s => s.remove());
    } else {
      for (const sc of [...d.querySelectorAll('script[src]')]) {
        const rawSrc = sc.getAttribute('src') || '';
        const rel = sid ? resolveRelPvPath(refBase, rawSrc) : null;
        const jsTxt = rel ? lookupSessionAssetText(sid, rel) : '';
        if (jsTxt) {
          sc.removeAttribute('src');
          sc.textContent = jsTxt;
        } else if (/^(?:https?:|\/\/)/i.test(rawSrc.trim())) {
          sc.remove();
        }
      }
    }
    if (sid) {
      for (const el of [...d.querySelectorAll('img[src],source[src],image')]) {
        const at = el.hasAttribute('src') ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href';
        const rel = resolveRelPvPath(refBase, el.getAttribute(at));
        if (rel && /\.svg$/i.test(rel)) {
          const svgTxt = lookupSessionAssetText(sid, rel);
          if (svgTxt) el.setAttribute(at, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTxt));
        }
      }
    }
    d.querySelectorAll('a[href]').forEach(a => { if (!/^#/.test(a.getAttribute('href'))) a.removeAttribute('href'); });
    d.querySelectorAll('form').forEach(f => f.removeAttribute('action'));
    const m = d.createElement('meta'); m.setAttribute('http-equiv', 'Content-Security-Policy'); m.setAttribute('content', run ? CSP_RUN : CSP);
    if (run) {
      const syncSc = d.createElement('script');
      syncSc.textContent = `(function(){function unpause(){try{var svgs=document.querySelectorAll('svg');for(var j=0;j<svgs.length;j++){if(svgs[j].animationsPaused&&svgs[j].animationsPaused()&&svgs[j].unpauseAnimations)svgs[j].unpauseAnimations();}}catch(e){}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',unpause,{once:true});else unpause();})();`;
      d.head.prepend(syncSc);
      const animSc = d.createElement('script');
      animSc.textContent = PvAnim.SCRIPT;   // 预览动画仅鼠标悬停时播放，移开定格
      d.head.prepend(animSc);
    }
    d.head.prepend(m);
    if (thumb) { const s = d.createElement('style'); s.textContent = NOBAR; d.head.append(s); }   // 小窗隐藏滚动条，保留原生时间轴动画与脚本运行
    const out = '<!doctype html>' + d.documentElement.outerHTML;
    if (docCache.size >= 64) docCache.delete(docCache.keys().next().value);
    docCache.set(cKey, out);
    return out;
  }
  const isSvgDoc = (text, name) => /\.svg$/i.test(name || '') || (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text) && !/<html[\s>]/i.test(text));
  // 从工作区打开的 html：把相对路径的 CSS / JS / 图片读出来内联进页面；读不到的外链安全跳过
  async function inlineAssets(html, path, ctx) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const resolve = ref => resolveRelPvPath(path, ref);
    let budget = 8 * 1024 * 1024, n = 0;
    const blobOf = async ref => { const p = resolve(ref); if (!p || n >= 40 || budget <= 0) return null; try { const ent = await ctx.entry(p); if (!ent || ent.e.type === 'dir' || +ent.e.size > 3 * 1024 * 1024) return null; const b = await Workspace.fileBlob(ent.e); n++; budget -= b.size; return b; } catch { return null; } };
    const dataUrl = (b, mime) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(mime ? new Blob([b], { type: mime }) : b); });
    for (const l of [...d.querySelectorAll('link[rel~="stylesheet"][href]')]) { const b = await blobOf(l.getAttribute('href')); if (b) { const stEl = d.createElement('style'); stEl.textContent = await b.text(); l.replaceWith(stEl); } else l.remove(); }
    for (const sc of [...d.querySelectorAll('script[src]')]) { const b = await blobOf(sc.getAttribute('src')); if (b) { sc.removeAttribute('src'); sc.textContent = await b.text(); } else if (/^(?:https?:|\/\/)/i.test(String(sc.getAttribute('src') || '').trim())) sc.remove(); }
    for (const el of [...d.querySelectorAll('img[src],source[src],image')]) {
      const at = el.hasAttribute('src') ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href', ref = el.getAttribute(at), b = await blobOf(ref);
      if (b) { const u = await dataUrl(b, WorkspacePath.mime?.(resolve(ref) || '') || b.type); if (u) el.setAttribute(at, u); }
    }
    return '<!doctype html>' + d.documentElement.outerHTML;
  }
  const resolvedTexts = new Map(), healingFiles = new Map();
  let _resolvedVer = 0;
  const normPvPath = p => String(p || '').replace(/\\/g, '/').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
  const isStubText = t => !t || String(t).includes('…[cached]');
  const hasUnclosedCodeTag = t => {
    const s = String(t || '');
    const sOpen = (s.match(/<style\b/gi) || []).length, sClose = (s.match(/<\/style\s*>/gi) || []).length;
    if (sOpen > sClose) return true;
    const jOpen = (s.match(/<script\b/gi) || []).length, jClose = (s.match(/<\/script\s*>/gi) || []).length;
    return jOpen > jClose;
  };
  const isUsablePreviewText = (t, name = '') => {
    const s = String(t || '').trim();
    if (!s || isStubText(s) || hasUnclosedCodeTag(s)) return false;
    if (/<\/(?:html|svg)\s*>\s*$/i.test(s)) return true;
    if (/\.svg$/i.test(name || '')) return /<\/svg\s*>/i.test(s);
    return /<(?:body|svg|main|canvas|section|div)\b/i.test(s) && /<\/(?:html|body|svg|main|canvas|script|div)\s*>/i.test(s);
  };
  const isClosedHtmlDoc = s => /<\/(?:html|svg)\s*>\s*$/i.test(String(s || '').trim());
  function resolvedText(sid, path) {
    const norm = normPvPath(path);
    const sKey = String(sid || '').trim();
    if (!norm || !sKey) return '';
    return resolvedTexts.get(sKey + ':' + norm) || '';
  }
  function cacheResolvedText(sid, path, text, opts = {}) {
    const norm = normPvPath(path), s = String(text || ''), sKey = String(sid || '').trim();
    if (!norm || !sKey || !s.trim() || isStubText(s)) return false;
    const k = sKey + ':' + norm, prev = resolvedTexts.get(k) || '';
    if (prev === s) return false;
    if (!opts.authoritative && prev && !isStubText(prev) && kindOf(norm) === 'html' && isClosedHtmlDoc(prev) && !isClosedHtmlDoc(s)) {
      return false;
    }
    if (resolvedTexts.size >= 80) resolvedTexts.delete(resolvedTexts.keys().next().value);
    resolvedTexts.set(k, s);
    _resolvedVer++;
    try {
      if (typeof Chats !== 'undefined') {
        const chat = Chats.get?.(sKey);
        if (chat && Array.isArray(chat.messages)) {
          let patchedChat = false;
          for (let mi = chat.messages.length - 1; mi >= 0; mi--) {
            const m = chat.messages[mi];
            const parts = m?.parts || [];
            for (let pi = parts.length - 1; pi >= 0; pi--) {
              const p = parts[pi];
              if (!p || !(String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) continue;
              const tn = String(p.toolName || p.name || p.type || '').replace(/^tool-/, '').toLowerCase();
              if (!/^(write_?file|create_?file|overwrite_?file|write)$/.test(tn)) continue;
              const inp = (typeof R !== 'undefined' && R.tinput ? R.tinput(p) : p.input) || {};
              const pNorm = normPvPath(inp.path || inp.file_path || '');
              if (pNorm !== norm) continue;
              const curC = typeof p.input?.content === 'string' ? p.input.content : (typeof p.input?.text === 'string' ? p.input.text : '');
              if (!p.input || isStubText(curC)) {
                p.input = { ...(p.input && typeof p.input === 'object' ? p.input : {}), path: inp.path || inp.file_path || norm, content: s };
                delete p.inputText; delete p._parsedInputRaw; delete p._parsedInputVal;
                m.v = (m.v || 0) + 1;
                patchedChat = true;
              }
              mi = -1;
              break;
            }
          }
          try { R?._fileTextCache?.delete(sKey); R?._writesCache?.delete(sKey); } catch {}
          if (patchedChat) {
            try { if (typeof MsgCache !== 'undefined') MsgCache.put?.(chat); } catch {}
          }
        }
      }
    } catch {}
    try {
      const lineCnt = countLinesFast(s);
      if (typeof document !== 'undefined') {
        document.querySelectorAll('details.wcard').forEach(d => {
          if (normPvPath(d._filePath) === norm && (!d._wsid || d._wsid === sKey)) {
            if (d._linesEl && lineCnt) d._linesEl.textContent = lineCnt + ' 行';
            const pre = d.querySelector('pre.wc-code');
            if (pre) pre.textContent = s.length > 60000 ? s.slice(0, 60000) + '\n…' : s;
          }
        });
      }
    } catch {}
    try {
      cards.forEach(c => {
        if (!c?.o || normPvPath(c.o.path) !== norm) return;
        const cSid = String(c.o.getWsid?.() || '').trim();
        if (!cSid || cSid === sKey) c.paint();
      });
    } catch {}
    return true;
  }
  async function healFileText(sid, path) {
    const opts = arguments[2] || {};
    const norm = normPvPath(path);
    const effSid = String(sid || (st && normPvPath(st.path) === norm ? (st.sid || st.wsid) : '') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : '') || '').trim();
    if (!norm || !effSid) return '';
    if (!opts.force) {
      const existing = resolvedText(effSid, norm);
      if (existing && isUsablePreviewText(existing, norm) && isClosedHtmlDoc(existing)) return existing;
    }
    const hKey = effSid + ':' + norm;
    if (healingFiles.has(hKey)) return healingFiles.get(hKey);
    const job = (async () => {
      try {
        if (typeof Workspace !== 'undefined' && typeof WorkspacePreview !== 'undefined') {
          let data = (typeof WS !== 'undefined' && WS.sid === effSid && WS.data?.manifest?.root) ? WS.data : null;
          if (!data?.manifest?.root && typeof Workspace.latest === 'function') {
            try { data = await Workspace.latest(effSid); } catch {}
          }
          if (data?.manifest?.root) {
            const ctx = WorkspacePreview.context(effSid, data);
            const r = await ctx.find(norm);
            const hit = r?.hits?.[0];
            if (hit?.e) {
              const blob = await Workspace.fileBlob(hit.e);
              let txt = (await blob.text()).slice(0, MAXCODE);
              if (txt && !isStubText(txt)) {
                if (kindOf(norm) === 'html' && !/\.svg$/i.test(norm) && /<(?:link|script|img|source|image)\b/i.test(txt)) {
                  try { txt = await inlineAssets(txt, norm, ctx); } catch {}
                }
                cacheResolvedText(effSid, norm, txt, { authoritative: true });
                if (st && (st.sid === effSid || st.wsid === effSid) && normPvPath(st.path) === norm) render();
                return txt;
              }
            }
          }
        }
        if (typeof api === 'function') {
          const d = await api('/api/chat/' + effSid, { timeout: 12000 }).catch(() => null);
          const rawList = Array.isArray(d?.messages) ? d.messages : Array.isArray(d?.data?.messages) ? d.data.messages : [];
          for (let i = rawList.length - 1; i >= 0; i--) {
            const m = rawList[i];
            for (const p of (m?.parts || m?.experimental_attachments || [])) {
              const inp = p?.input || p?.args || null;
              if (!inp || typeof inp !== 'object') continue;
              const pNorm = normPvPath(inp.path || inp.file_path || '');
              const c = typeof inp.content === 'string' ? inp.content : (typeof inp.text === 'string' ? inp.text : '');
              if (pNorm === norm && c && !isStubText(c)) {
                cacheResolvedText(effSid, norm, c, { authoritative: true });
                if (st && (st.sid === effSid || st.wsid === effSid) && normPvPath(st.path) === norm) render();
                return c;
              }
            }
          }
        }
      } catch {}
      finally {
        setTimeout(() => healingFiles.delete(hKey), 3000);
      }
      return '';
    })();
    healingFiles.set(hKey, job);
    return job;
  }
  const shouldUseDirectOverResolved = (direct, res, path) => {
    if (!direct || isStubText(direct)) return false;
    if (!res) return true;
    if (kindOf(path) === 'html' && !isClosedHtmlDoc(direct) && isClosedHtmlDoc(res)) return false;
    return true;
  };
  const textOf = () => {
    try {
      const sid = st?.sid || st?.wsid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
      const res = st?.path ? resolvedText(sid, st.path) : '';
      const direct = String(st?.get?.() ?? '');
      if (shouldUseDirectOverResolved(direct, res, st?.path || st?.name)) {
        if (sid && st?.path && isUsablePreviewText(direct, st.name)) cacheResolvedText(sid, st.path, direct);
        return direct;
      }
      if (sid && st?.path && typeof R !== 'undefined' && R.latestFileText) {
        const lt = String(R.latestFileText(sid, st.path) || '');
        if (lt && !isStubText(lt) && shouldUseDirectOverResolved(lt, res, st.path)) return lt;
      }
      if (res) return res;
      return isStubText(direct) ? '' : direct;
    } catch { return ''; }
  };
  const textFrom = (fn, sid, path) => {
    try {
      const res = path ? resolvedText(sid, path) : '';
      const direct = String(fn?.() ?? '');
      if (shouldUseDirectOverResolved(direct, res, path)) {
        if (sid && path && isUsablePreviewText(direct, path)) cacheResolvedText(sid, path, direct);
        return direct;
      }
      if (sid && path && typeof R !== 'undefined' && R.latestFileText) {
        const lt = String(R.latestFileText(sid, path) || '');
        if (lt && !isStubText(lt) && shouldUseDirectOverResolved(lt, res, path)) return lt;
      }
      if (res) return res;
      return isStubText(direct) ? '' : direct;
    } catch { return ''; }
  };
  const on = () => !!st;
  const mobile = () => document.body.classList.contains('m');
  // ---------- 舞台：页面放进一个虚拟视口，整体按比例缩放进盒子 ----------
  // 窗格 / 底部面板（o.probe）：页面真的在跑（脚本、点击、滚轮都交给页面自己），排版测量和「记录」用一个看不见的只读副本（o.probe，同源、不跑脚本）。
  // 对话里的小窗（o.thumb）：完整显示在固定比例的盒子里；很长的网页按宽度缩放、只露出最上面一屏。
  function mountStage(stage, f, text, name, o = {}) {
    let W = 1280, H = 720, wfit = false, fill = false, ro = null, roT = 0, dead = false;
    const m = o.probe || f;   // 测量用的那一个（必须同源）
    const metaKey = (o.thumb ? 't:' : 'p:') + textSig(String(text || ''), name);
    const place = () => {
      if (dead) return; const pw = stage.clientWidth, ph = stage.clientHeight; if (!pw || !ph) return;
      if (fill) {
        if (o.thumb) { const k = pw / W, hh = Math.ceil(ph / k); Object.assign(f.style, { width: W + 'px', height: hh + 'px', left: '0', top: '0', transform: 'scale(' + k + ')' }); return; }
        Object.assign(f.style, { width: '100%', height: '100%', transform: 'none', left: '0', top: '0' });
        if (o.probe && m.style.display !== 'none') Object.assign(m.style, { width: pw + 'px', height: ph + 'px', transform: 'none' });
        return;
      }
      const byW = o.thumb && wfit;   // 小窗里响应式页面：宽度铺满，底部多出的一点（≤15%）直接截掉，和网页版一样不留白边
      const k = byW ? pw / W : Math.min(pw / W, ph / H), x = byW ? 0 : (pw - W * k) / 2, y = byW ? 0 : (ph - H * k) / 2;
      Object.assign(f.style, { width: W + 'px', height: H + 'px', left: Math.round(x) + 'px', top: Math.round(y) + 'px', transform: 'scale(' + k + ')' });
      if (o.probe && m.style.display !== 'none') Object.assign(m.style, { width: W + 'px', height: H + 'px', transform: 'none' });
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
      if (o.thumb) {
        const cached = stageMetaCache.get(metaKey);
        if (cached && stage.clientWidth > 0 && stage.clientHeight > 0) {
          W = cached.W; H = cached.H; wfit = cached.wfit; fill = cached.fill; lastPw = stage.clientWidth;
          if (cached.bg) stage.style.background = cached.bg;
          if (o.probe) { try { o.probe.remove(); } catch {} }
          place();
          return;
        }
      }
      try {
        if (o.probe && m.style.display === 'none') m.style.display = '';
        const doc = m.contentDocument; if (!doc?.documentElement) return;
        const pw = stage.clientWidth, ph = stage.clientHeight; if (!pw || !ph) return; lastPw = pw; fill = false; wfit = false;
        const de = doc.documentElement, svgs = [...doc.querySelectorAll('svg')].filter(x => !x.parentElement?.closest('svg'));
        const dims = v => { const vb = v?.viewBox?.baseVal; if (vb && vb.width > 0 && vb.height > 0) return [vb.width, vb.height]; const w = parseFloat(v?.getAttribute('width')), h = parseFloat(v?.getAttribute('height')); return w > 0 && h > 0 ? [w, h] : null; };
        let done = false;
        if (isSvgDoc(text, name)) { const d = dims(svgs[0]); if (d) { [W, H] = norm(d[0], d[1]); done = true; } }
        if (!done) {
          const baseCands = o.thumb ? [pw, 1024] : [pw, 800, 1024, 1280];
          const cands = baseCands.filter((w, i, a) => w >= pw - 1 && a.indexOf(w) === i); if (!cands.length) cands.push(pw);
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
        if (stageMetaCache.size >= 120) stageMetaCache.delete(stageMetaCache.keys().next().value);
        stageMetaCache.set(metaKey, { W, H, wfit, fill, bg });
        if (o.thumb && o.probe) { try { o.probe.remove(); } catch {} }
      } catch {}
      place();
    };
    const onLoadAnalyse = () => {
      if (dead) return;
      if (o.thumb && !stageMetaCache.has(metaKey)) {
        setTimeout(analyse, 24);
      } else {
        analyse();
      }
    };
    m.addEventListener('load', onLoadAnalyse);
    try {
      ro = new ResizeObserver(() => {
        if (dead) return;
        if (!lastPw && m.contentDocument?.readyState === 'complete') { analyse(); return; }
        place();
        if (!o.thumb && Math.abs(stage.clientWidth - lastPw) > 24 && m.contentDocument?.readyState === 'complete') {
          if (roT) clearTimeout(roT);
          roT = setTimeout(() => { roT = 0; analyse(); }, 180);
        }
      });
      ro.observe(stage);
    } catch {}
    place();
    return { destroy() { dead = true; if (roT) { clearTimeout(roT); roT = 0; } try { ro?.disconnect(); } catch {} m.removeEventListener('load', onLoadAnalyse); if (o.thumb && o.probe) { try { o.probe.remove(); } catch {} } }, reset() { place(); } };
  }
  // ---------- 对话里的预览小窗（和网页版一样：Write 出 html 后，在这一行下面直接显示页面缩略图，点一下放大） ----------
  const cards = new Map();
  let _decodeTa = null;
  const decode = t => { if (!t || !t.includes('&')) return t || ''; if (!_decodeTa) _decodeTa = document.createElement('textarea'); _decodeTa.innerHTML = t; return _decodeTa.value; };
  const titleOf = (text, name) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text); const t = m ? decode(m[1]).replace(/\s+/g, ' ').trim() : ''; return t || name; };
  const extOf = name => { const e = (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1] || 'html'; return e.length > 5 ? 'HTML' : e.toUpperCase(); };
  const finished = text => /<\/(?:html|svg)\s*>\s*$/i.test(text);
  const canPreviewPartial = text => finished(text) || /<\/(?:svg|body|main|canvas|script)\s*>/i.test(text);
  const cardMountQueue = [];
  let cardMountTimer = 0;
  function flushCardMountQueue() {
    cardMountTimer = 0;
    if (!cardMountQueue.length) return;
    const lastSc = typeof window !== 'undefined' ? (window.__ancLastScrollAt || 0) : 0;
    const dt = Date.now() - lastSc;
    if (lastSc > 0 && dt < 130) {
      cardMountTimer = setTimeout(flushCardMountQueue, Math.max(40, 135 - dt));
      return;
    }
    let mounted = 0;
    while (cardMountQueue.length && mounted < 2) {
      const c = cardMountQueue.shift();
      if (c && c.live && c.o && c.text != null && (c.shown !== c.text || !c.stage.querySelector('iframe.pvc-frame'))) {
        c.renderNow(c.text, String(c.o.path || '').split('/').pop());
        mounted++;
      }
    }
    if (cardMountQueue.length) cardMountTimer = setTimeout(flushCardMountQueue, 30);
  }
  function scheduleCardMount(c) {
    const lastSc = typeof window !== 'undefined' ? (window.__ancLastScrollAt || 0) : 0;
    if ((!lastSc || Date.now() - lastSc >= 130) && !cardMountQueue.length && !cardMountTimer) {
      c.renderNow(c.text, String(c.o?.path || '').split('/').pop());
      return;
    }
    if (!cardMountQueue.includes(c)) cardMountQueue.push(c);
    if (!cardMountTimer) cardMountTimer = setTimeout(flushCardMountQueue, 45);
  }
  function buildCard(key) {
    const c = { key, o: null, text: null, live: false, inView: false, el: null, stage: null, ph: null, mount: null, shown: '', _titleSig: '', _titleVal: '' };
    const title = h('b', { class: 'pvc-t' }), badge = h('span', { class: 'pvc-badge' });
    c.stage = h('div', { class: 'pvc-stage' });
    c.phText = h('span', {}, '正在生成预览…'); c.ph = h('div', { class: 'pvc-ph' }, h('i', { class: 'spin' }), c.phText);
    c.el = h('div', { class: 'pvc', role: 'button', tabindex: '0', onclick: () => c.open(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.open(); } } },
      h('div', { class: 'pvc-h' }, icon('pvwin'), title, badge), h('div', { class: 'pvc-box' }, c.stage, c.ph, h('span', { class: 'pvc-zoom', 'aria-hidden': 'true' }, icon('pvfull'))));
    c.title = title; c.badge = badge;
    c.open = () => { const o = c.o; if (!o) return; if (typeof o.onOpen === 'function') { o.onOpen('run'); return; } open({ sid: o.getWsid?.() || Tabs.cur?.sid || null, path: o.path, get: o.get, wsid: o.getWsid?.() || null }); };
    c.paint = () => {
      const o = c.o, sid = o.getWsid?.() || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null), text = textFrom(o.get, sid, o.path), name = String(o.path || '').split('/').pop() || o.path;
      const tSig = name + ':' + text.length + ':' + text.slice(0, 96);
      if (c._titleSig !== tSig) { c._titleSig = tSig; c._titleVal = titleOf(text, name); }
      const t = c._titleVal || name;
      if (c.title.textContent !== t) c.title.textContent = t;
      const bTxt = extOf(name); if (c.badge.textContent !== bTxt) c.badge.textContent = bTxt;
      if (c._ariaLabel !== t) { c._ariaLabel = t; c.el.setAttribute('aria-label', '放大预览 ' + t); }
      const usable = isUsablePreviewText(text, name);
      const ready = usable && (!o.running || finished(text));
      if (!o.running && (!usable || !finished(text)) && (sid || o.path)) {
        void healFileText(sid, o.path);
      }
      c.ph.hidden = ready && !!c.shown; c.phText.textContent = ready ? '正在加载预览…' : '正在生成预览…'; c.el.classList.toggle('pvc-wait', !ready);
      if (!ready || (text === c.text && c.shown === text && c.stage.querySelector('iframe.pvc-frame'))) return;
      c.text = text; if (c.live) c.render(text, name); else c.pending = true;
    };
    c.renderNow = (text, name) => {
      c.pending = false;
      if (c.shown === text && c.stage.querySelector('iframe.pvc-frame')) {
        c.ph.hidden = true;
        return;
      }
      const old = c.stage.querySelector('iframe.pvc-frame');
      const probe = h('iframe', { class: 'pv-probe', tabindex: '-1', 'aria-hidden': 'true', referrerpolicy: 'no-referrer' });
      probe.setAttribute('sandbox', 'allow-same-origin'); probe.setAttribute('csp', CSP);
      Object.assign(probe.style, { position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', pointerEvents: 'none', border: '0' });
      const f = h('iframe', { class: 'pvc-frame', title: name, tabindex: '-1', 'aria-hidden': 'true', referrerpolicy: 'no-referrer' });
      f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('csp', CSP_RUN); f.style.visibility = 'hidden';
      const prev = c.mount; c.mount = mountStage(c.stage, f, text, name, { thumb: true, probe });
      f.addEventListener('load', () => {
        old?.remove(); prev?.destroy(); f.style.visibility = ''; c.shown = text; c.ph.hidden = true;
      }, { once: true });
      const cardSid = c.o?.getWsid?.() || '';
      const cardPath = c.o?.path || name;
      probe.srcdoc = docOf(text, name, { run: false, thumb: true, sid: cardSid, basePath: cardPath });
      f.srcdoc = docOf(text, name, { run: true, thumb: true, sid: cardSid, basePath: cardPath });
      c.stage.append(probe, f);
      PvAnim.bind(c.stage, f);
    };
    c.render = (text, name) => {
      c.pending = false;
      scheduleCardMount(c);
    };
    // 滚动到可见范围才真正创建页面，滚出视口外时暂停 iframe 动画合成以释放 CPU/GPU
    const go = () => { c.live = true; if (c.o && c.text != null && (c.shown !== c.text || !c.stage.querySelector('iframe'))) c.render(c.text, String(c.o.path || '').split('/').pop()); };
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(es => {
        const vis = es.some(e => e.isIntersecting);
        if (vis) {
          go();
          const fr = c.stage.querySelector('iframe.pvc-frame');
          if (fr && fr.style.display === 'none') fr.style.display = '';
        } else if (c.shown) {
          const fr = c.stage.querySelector('iframe.pvc-frame');
          if (fr && fr.style.visibility !== 'hidden') fr.style.display = 'none';
        }
      }, { rootMargin: '360px' });
      io.observe(c.el);
      c.io = io;
    } else c.live = true;
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
  const userClosedSids = new Set();
  function dismiss(fromY = 0) {
    if (!st) return;
    if (st.sid) userClosedSids.add(st.sid);
    if (mobile()) ghostOut(fromY);
    close();
  }
  function close() {
    if (!st) return; try { st.stage?.destroy(); } catch {} try { st.img?.revoke?.(); } catch {} st = null; root?.classList.remove('pv-full'); frame = null; closeTok++;
    document.body.classList.remove('pv-on'); if (root) { root.classList.remove('pv-enter'); root.replaceChildren(); }
    try { UI.layout(); } catch {}
  }

  function extractMarkdownCodeBlocks(text, msgId = 'msg') {
    const raw = String(text || '');
    if (!raw.includes('```')) return [];
    const out = [];
    const re = /```([A-Za-z0-9_+-]*)[ \t]*([^\n`]*)\n([\s\S]*?)```/g;
    let m, idx = 0;
    const extMap = {
      html: 'html', htm: 'html', svg: 'svg', xml: 'svg',
      tsx: 'tsx', ts: 'ts', jsx: 'jsx', js: 'js', javascript: 'js', typescript: 'ts',
      css: 'css', scss: 'scss', json: 'json', md: 'md', markdown: 'md',
      py: 'py', python: 'py', sh: 'sh', bash: 'sh', sql: 'sql', yaml: 'yaml', yml: 'yml',
      rust: 'rs', rs: 'rs', go: 'go', java: 'java', cpp: 'cpp', c: 'c', vue: 'vue', svelte: 'svelte',
    };
    const midShort = String(msgId || 'msg').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'msg';
    while ((m = re.exec(raw)) !== null) {
      const lang = String(m[1] || '').trim().toLowerCase();
      const meta = String(m[2] || '').trim();
      const code = String(m[3] || '');
      if (!code.trim() || code.trim().length < 24) continue;
      idx++;
      const ext = extMap[lang] || (lang && /^[a-z0-9]{1,6}$/.test(lang) ? lang : 'txt');
      let pathHint = '';
      if (meta && /^[A-Za-z0-9_./-]+\.[A-Za-z0-9]+$/.test(meta)) {
        pathHint = meta;
      } else {
        const firstLine = code.split('\n', 1)[0] || '';
        const cm = /^(?:\/\/|#|\/\*+|<!--)\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})/.exec(firstLine.trim());
        if (cm) pathHint = cm[1];
      }
      const vpath = pathHint || `snippet-${midShort}-${idx}.${ext}`;
      out.push({ path: vpath, content: code, lang: lang || ext });
    }
    return out;
  }

  function extractEvalBundle(chat, msg) {
    if (!msg || typeof msg !== 'object') {
      return { previewUrl: null, files: [], localHtmlFile: null, isPendingBuild: false, hasAnyPreview: false, templateKind: null };
    }
    const isWebDevChat = Boolean(
      chat?.modality === 'webdev' ||
      chat?.evalModality === 'webdev' ||
      chat?.resolvedModality === 'webdev' ||
      msg.webdev ||
      msg.webdevTemplate ||
      msg.metadata?.webdevTemplate ||
      msg.activeWorkflowRunId ||
      msg.metadata?.workflowRunId
    );
    const wd = msg.webdev || (typeof EvalEngine !== 'undefined' && EvalEngine.reconstructWebDevFromMessage ? EvalEngine.reconstructWebDevFromMessage(msg, isWebDevChat ? 'webdev' : '') : null);
    const fileMap = new Map();
    const sid = chat?.sid || st?.sid || null;

    if (wd && Array.isArray(wd.files)) {
      for (const f of wd.files) {
        if (!f || !f.path) continue;
        const pth = String(f.path).replace(/^\/+/, '');
        const txt = String(f.content ?? '');
        fileMap.set(pth, {
          path: pth,
          content: txt,
          get: () => {
            const curWd = msg.webdev?.files?.find(x => x && String(x.path).replace(/^\/+/, '') === pth);
            return curWd ? String(curWd.content ?? '') : txt;
          },
          wsid: sid,
        });
      }
    }

    for (const p of msg.parts || []) {
      if (!p) continue;
      if (String(p.type || '').startsWith('tool-')) {
        const tName = String(p.toolName || String(p.type).replace(/^tool-/, '')).toLowerCase();
        const inp = p.input || (typeof R !== 'undefined' && R.tinput ? R.tinput(p) : {}) || {};
        const pth = String(inp.path || inp.file_path || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
        if (!pth) continue;
        if (/^(write_?file|create_?file|write)$/.test(tName)) {
          const txt = String(inp.content ?? inp.text ?? '');
          if (!fileMap.has(pth) || txt) {
            fileMap.set(pth, {
              path: pth,
              content: txt,
              get: () => {
                const curWd = msg.webdev?.files?.find(x => x && String(x.path).replace(/^\/+/, '') === pth);
                if (curWd && curWd.content != null) return String(curWd.content);
                return txt;
              },
              wsid: sid,
            });
          }
        } else if (/^(edit_file|str_replace|edit)$/.test(tName) && fileMap.has(pth)) {
          const prev = fileMap.get(pth);
          const ctx = inp.context ?? inp.old_text ?? inp.old_str ?? '';
          const rep = inp.replacement ?? inp.new_text ?? inp.new_str ?? '';
          if (ctx && typeof EvalEngine !== 'undefined' && EvalEngine.applyWebDevEdit) {
            const nextTxt = EvalEngine.applyWebDevEdit(prev.content || '', ctx, rep);
            fileMap.set(pth, { ...prev, content: nextTxt, get: () => nextTxt });
          }
        }
      } else if (p.type === 'text' && p.text) {
        if (typeof R !== 'undefined' && typeof R.extractInlineHtmlSegments === 'function') {
          const segs = R.extractInlineHtmlSegments(p.text, p.state === 'streaming');
          if (Array.isArray(segs)) {
            for (const hs of segs) {
              if (!hs || hs.type !== 'html' || !hs.code) continue;
              const vpath = typeof R.inlineHtmlPath === 'function' ? R.inlineHtmlPath(msg, hs) : `inline-${hs.idx + 1}.${hs.ext || 'html'}`;
              const codeStr = String(hs.code);
              fileMap.set(vpath, {
                path: vpath,
                content: codeStr,
                running: !!hs.running,
                get: () => codeStr,
                wsid: sid,
              });
            }
          }
        }
        const mdBlocks = extractMarkdownCodeBlocks(p.text, msg.id);
        for (const blk of mdBlocks) {
          if ( /\.(html?|svg)$/i.test(blk.path) && [...fileMap.keys()].some(k => /\.(html?|svg)$/i.test(k)) ) continue;
          if (!fileMap.has(blk.path)) {
            const codeStr = blk.content;
            fileMap.set(blk.path, {
              path: blk.path,
              content: codeStr,
              get: () => codeStr,
              wsid: sid,
            });
          }
        }
      }
    }

    const fileList = [...fileMap.values()];
    const localHtmlFile = fileList.find(f => /\.(?:html?|svg)$/i.test(f.path)) || null;
    const isFailedMsg = Boolean(msg.status === 'failed' || msg.status === 'error' || msg.failed || wd?.status === 'build-error' || wd?.status === 'error' || wd?.status === 'failed');
    let previewUrl = !isFailedMsg ? (wd?.previewUrl || msg.metadata?.previewUrl || null) : null;
    if (!previewUrl && !isFailedMsg && isWebDevChat && msg.id && msg.status === 'success' && wd?.status === 'success') {
      previewUrl = `https://${msg.id}.arena.site`;
    }
    const isPendingBuild = Boolean(
      !isFailedMsg &&
      isWebDevChat &&
      (msg.status === 'pending' || msg.status === 'streaming' || (msg.metadata?.pending && wd?.status === 'pending')) &&
      !previewUrl
    );
    const buildError = isFailedMsg ? (wd?.message || msg.failureReason || msg.errorText || '构建或生成失败') : null;
    const hasAnyPreview = Boolean(previewUrl || localHtmlFile || fileList.length > 0 || isPendingBuild);
    return {
      previewUrl,
      files: fileList,
      localHtmlFile,
      isPendingBuild,
      hasAnyPreview,
      templateKind: wd?.templateKind || msg.webdevTemplate || msg.metadata?.webdevTemplate || null,
      buildError,
    };
  }

  function findEvalTurnMessages(chat, targetMsgId = null) {
    if (!chat || !Array.isArray(chat.messages)) return { msgA: null, msgB: null };
    const assts = chat.messages.filter(m => m && m.role === 'assistant');
    if (!assts.length) return { msgA: null, msgB: null };
    if (targetMsgId) {
      const target = assts.find(m => m.id === targetMsgId);
      if (target) {
        const parentId = Array.isArray(target.parentMessageIds) ? target.parentMessageIds[0] : null;
        if (parentId) {
          const siblings = assts.filter(m => Array.isArray(m.parentMessageIds) && m.parentMessageIds[0] === parentId);
          const sA = siblings.find(m => m.participantPosition !== 'b') || null;
          const sB = siblings.find(m => m.participantPosition === 'b') || null;
          if (sA || sB) return { msgA: sA, msgB: sB };
        }
      }
    }
    const msgA = [...assts].reverse().find(m => m.participantPosition !== 'b') || assts[0] || null;
    const msgB = chat.evalMode === 'battle'
      ? ([...assts].reverse().find(m => m.participantPosition === 'b') || null)
      : null;
    return { msgA, msgB };
  }

  function open(o) {
    const wasOpen = !!st;
    const hasRemotePreview = Boolean(o.previewUrl || o.isPendingBuild);
    const kind = o.img ? 'image' : hasRemotePreview ? 'html' : (kindOf(o.path) || 'code');
    const prev = st;
    if (o.sid && !o.autoSync) userClosedSids.delete(o.sid);
    try { prev?.stage?.destroy(); } catch {}
    try { if (prev?.img && prev.img.src !== o.img?.src) prev.img.revoke?.(); } catch {}
    st = {
      sid: o.sid || null,
      path: o.path || '',
      kind,
      name: (o.path || '').split('/').pop() || o.path || '预览',
      get: o.get,
      view: o.view ?? null,
      suffix: o.suffix || '',
      wsid: o.wsid || null,
      mode: (o.mode === 'code' || o.mode === 'run') ? o.mode : (kind === 'code' ? 'code' : 'run'),
      at: now(),
      frame: 0,
      list: o.list || null,
      img: o.img || null,
      evalPos: o.evalPos || prev?.evalPos || 'a',
      evalMsgId: o.evalMsgId || null,
      previewUrl: o.previewUrl || null,
      isPendingBuild: Boolean(o.isPendingBuild),
      buildError: o.buildError || null,
      templateKind: o.templateKind || null,
      viewport: o.viewport || prev?.viewport || 'desktop',
      vpW: Number.isFinite(+o.vpW) ? +o.vpW : (prev?.vpW || 0),
      vpH: Number.isFinite(+o.vpH) ? +o.vpH : (prev?.vpH || 0),
      routePath: o.routePath || '/',
      highlightStart: o.highlightStart || 0,
      highlightEnd: o.highlightEnd || 0,
    };
    if (prev && prev.kind === kind && o.keepMode) st.mode = prev.mode;
    const effSid = st.sid || st.wsid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
    if (st.kind !== 'image' && st.path) {
      const initTxt = String(o.view || st.get?.() || '');
      if (initTxt && !isStubText(initTxt) && (st.kind !== 'html' || isUsablePreviewText(initTxt, st.name))) {
        cacheResolvedText(effSid, st.path, initTxt);
      } else if (effSid) {
        void healFileText(effSid, st.path);
      }
    }
    document.body.classList.add('pv-on');
    if (!wasOpen && root && mobile()) { root.classList.add('pv-enter'); const tok = ++closeTok; setTimeout(() => { if (closeTok === tok) root?.classList.remove('pv-enter'); }, 420); }
    render(); if (!wasOpen) try { UI.layout(); } catch {}
  }

  function openEvalMessage(chat, msg, posOrOpts = {}, maybeOpts = null) {
    if (!chat || !msg) return;
    const opts = typeof posOrOpts === 'string' ? { ...(maybeOpts && typeof maybeOpts === 'object' ? maybeOpts : {}), pos: posOrOpts } : (posOrOpts || {});
    if (chat.sid && !opts.autoSync) userClosedSids.delete(chat.sid);
    const pos = opts.pos || (msg.participantPosition === 'b' ? 'b' : 'a');
    if (chat.modality === 'webdev' || chat.evalModality === 'webdev' || msg.webdev || msg.activeWorkflowRunId || msg.metadata?.workflowRunId) {
      if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.fetchWebDevMetadata === 'function') {
        void EvalEngine.fetchWebDevMetadata(chat, msg, false);
      }
    }
    const bundle = extractEvalBundle(chat, msg);
    const targetPath = opts.path
      || (opts.mode === 'code' ? (bundle.files[0]?.path || 'index.tsx') : (bundle.localHtmlFile?.path || bundle.files[0]?.path || 'preview.html'));
    const matchedFile = bundle.files.find(f => f.path === targetPath)
      || bundle.files.find(f => f.path.endsWith('/' + targetPath) || targetPath.endsWith('/' + f.path))
      || bundle.localHtmlFile
      || bundle.files[0]
      || null;
    const wantMode = opts.mode || ((bundle.previewUrl || bundle.localHtmlFile || bundle.isPendingBuild) ? 'run' : 'code');
    open({
      sid: chat.sid,
      wsid: chat.sid,
      path: matchedFile?.path || targetPath,
      get: matchedFile?.get || (() => matchedFile?.content || ''),
      list: () => extractEvalBundle(chat, msg).files,
      mode: wantMode,
      evalPos: pos,
      evalMsgId: msg.id || null,
      previewUrl: bundle.previewUrl,
      isPendingBuild: bundle.isPendingBuild,
      buildError: bundle.buildError,
      templateKind: bundle.templateKind,
      highlightStart: opts.highlightStart || 0,
      highlightEnd: opts.highlightEnd || 0,
      autoSync: Boolean(opts.autoSync),
    });
  }

  function selectEvalOption(pos = 'a', opts = {}) {
    const sid = opts.sid || st?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
    const chat = sid && typeof Chats !== 'undefined' ? Chats.get?.(sid) : null;
    if (!chat) return;
    const { msgA, msgB } = findEvalTurnMessages(chat, opts.msgId || st?.evalMsgId || null);
    const target = pos === 'b' ? (msgB || msgA) : (msgA || msgB);
    if (!target) return;
    openEvalMessage(chat, target, { ...opts, pos });
  }

  function syncEval(chat, opts = {}) {
    if (!chat || !chat.isEvaluation) return;
    const activeSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    if (activeSid && chat.sid && activeSid !== chat.sid) return;
    const { msgA, msgB } = findEvalTurnMessages(chat, st?.evalMsgId || null);
    const bA = msgA ? extractEvalBundle(chat, msgA) : null;
    const bB = msgB ? extractEvalBundle(chat, msgB) : null;
    const isWebDev = chat.modality === 'webdev' || chat.evalModality === 'webdev' || chat.resolvedModality === 'webdev';

    if (st && st.sid === chat.sid) {
      const curPos = st.evalPos === 'b' && msgB ? 'b' : 'a';
      const curMsg = curPos === 'b' ? (msgB || msgA) : (msgA || msgB);
      const curBundle = curPos === 'b' ? (bB || bA) : (bA || bB);
      if (curMsg && curBundle) {
        const urlChanged = (curBundle.previewUrl || null) !== (st.previewUrl || null);
        const buildChanged = Boolean(curBundle.isPendingBuild) !== Boolean(st.isPendingBuild);
        const prevCount = st._lastFileCount || 0;
        const nextCount = curBundle.files.length;
        st.previewUrl = curBundle.previewUrl || null;
        st.isPendingBuild = Boolean(curBundle.isPendingBuild);
        st.buildError = curBundle.buildError || null;
        st.templateKind = curBundle.templateKind || st.templateKind;
        st.list = () => extractEvalBundle(chat, curMsg).files;
        if ((!st.path || st.path === 'preview.html') && curBundle.files[0]) {
          st.path = curBundle.files[0].path;
          st.name = st.path.split('/').pop() || st.path;
          st.get = curBundle.files[0].get;
        } else {
          const hit = curBundle.files.find(f => f.path === st.path);
          if (hit) st.get = hit.get;
        }
        let nextDigest = 2166136261 >>> 0;
        for (const f of (curBundle.files || [])) { const s = (f.path || '') + ':' + (typeof f.get === 'function' ? f.get() : (f.content || '')); for (let i = 0; i < s.length; i++) { nextDigest ^= s.charCodeAt(i); nextDigest = Math.imul(nextDigest, 16777619) >>> 0; } }
        const digestChanged = st._lastFilesDigest !== undefined && st._lastFilesDigest !== nextDigest;
        st._lastFilesDigest = nextDigest;
        st._lastFileCount = nextCount;
        if (urlChanged || buildChanged || digestChanged || (prevCount === 0 && nextCount > 0)) {
          render();
          return;
        }
        if (st.mode === 'code') {
          syncLive(chat.sid);
        }
      }
      return;
    }

    if (isWebDev && !userClosedSids.has(chat.sid) && !mobile()) {
      const voteVal = chat.voteState?.value;
      const defaultPos = voteVal === 'model_b' && msgB ? 'b' : 'a';
      const targetMsg = defaultPos === 'b' ? (msgB || msgA) : (msgA || msgB);
      const targetBundle = defaultPos === 'b' ? (bB || bA) : (bA || bB);
      if (targetMsg && targetBundle && targetBundle.hasAnyPreview) {
        openEvalMessage(chat, targetMsg, { pos: defaultPos, autoSync: true });
      }
    }
  }

  function full(on) { if (!root || !st) return; root.classList.toggle('pv-full', on); render(); try { UI.layout(); } catch {} }
  // 图片：右侧窗格里看（跟官方一样：右边收起成预览器，适应窗格 / 点一下原始大小，顶上有下拉 · 下载 · 全屏 · 关闭）
  function image(o) { open({ sid: o.sid ?? (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) ?? null, path: o.path || o.name || 'image', img: { src: o.src, revoke: o.revoke || null, sub: o.sub || '', thumb: o.thumb || '' }, list: o.list || null }); }
  function setMode(m) { if (!st || st.mode === m) return; st.mode = m; render(); }
  function setViewportSize(w, h) {
    if (!st) return;
    const nw = Math.max(0, Math.min(3840, Math.round(+w || 0)));
    const nh = Math.max(0, Math.min(3840, Math.round(+h || 0)));
    st.vpW = nw > 0 ? Math.max(160, nw) : 0;
    st.vpH = nh > 0 ? Math.max(120, nh) : 0;
    st.viewport = (st.vpW > 0 || st.vpH > 0) ? 'custom' : 'desktop';
    render();
  }
  function toggleVpPopover(anchor, sheet) {
    const existing = sheet.querySelector('.pv-vp-pop');
    if (existing) { existing.remove(); return; }
    sheet.querySelector('.pv-menu')?.remove();
    const wIn = h('input', { type: 'number', class: 'pv-vp-in', min: '160', max: '3840', step: '10', placeholder: '自适应', value: st?.vpW > 0 ? String(st.vpW) : '' });
    const hIn = h('input', { type: 'number', class: 'pv-vp-in', min: '120', max: '3840', step: '10', placeholder: '自适应', value: st?.vpH > 0 ? String(st.vpH) : '' });
    const apply = () => { pop.remove(); setViewportSize(wIn.value, hIn.value); };
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
    wIn.addEventListener('keydown', onKey);
    hIn.addEventListener('keydown', onKey);
    const presets = [
      { l: '自适应', w: 0, h: 0 },
      { l: '390×844', w: 390, h: 844 },
      { l: '768×1024', w: 768, h: 1024 },
      { l: '1024×768', w: 1024, h: 768 },
      { l: '1280×720', w: 1280, h: 720 },
    ];
    const pop = h('div', { class: 'pv-vp-pop', onclick: e => e.stopPropagation() },
      h('div', { class: 'pv-vp-row' },
        h('label', { class: 'pv-vp-field' }, h('span', {}, '宽'), wIn, h('small', {}, 'px')),
        h('span', { class: 'pv-vp-x' }, '×'),
        h('label', { class: 'pv-vp-field' }, h('span', {}, '高'), hIn, h('small', {}, 'px')),
        h('button', { type: 'button', class: 'btn sm pv-vp-apply', onclick: apply }, '应用')
      ),
      h('div', { class: 'pv-vp-presets' },
        ...presets.map(p => {
          const active = (st?.vpW || 0) === p.w && (st?.vpH || 0) === p.h;
          return h('button', {
            type: 'button',
            class: 'pv-vp-chip' + (active ? ' on' : ''),
            onclick: () => { pop.remove(); setViewportSize(p.w, p.h); }
          }, p.l);
        })
      )
    );
    sheet.append(pop);
    setTimeout(() => wIn.focus(), 10);
    const off = e => {
      if (!pop.isConnected) { document.removeEventListener('pointerdown', off, true); return; }
      if (!pop.contains(e.target) && !anchor.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); }
    };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  }
  function btn(ic, title, fn, cls = '') { return h('button', { type: 'button', class: 'ib sm pv-b ' + cls, title, 'aria-label': title, onclick: fn }, icon(ic)); }
  // 文件下拉：这个对话里 Write 出来的所有可预览文件（同一路径只留最新一次），点一个就切换
  function files() {
    let l = []; try { l = (st.list ? st.list() : (typeof R !== 'undefined' && R.writes ? R.writes(st.sid) : [])) || []; } catch {}
    if (st.path && st.path !== 'preview.html' && !l.some(x => x.path === st.path)) {
      l = [{ path: st.path, get: st.get, wsid: st.wsid, img: st.img }, ...l];
    }
    return l;
  }
  function selectFileItem(x, keepMode = true) {
    if (!st || !x) return;
    open({
      sid: st.sid,
      path: x.path,
      get: x.get,
      img: x.img,
      wsid: x.wsid || st.wsid,
      list: st.list,
      evalPos: st.evalPos,
      evalMsgId: st.evalMsgId,
      previewUrl: st.previewUrl,
      isPendingBuild: st.isPendingBuild,
      buildError: st.buildError,
      templateKind: st.templateKind,
      viewport: st.viewport,
      vpW: st.vpW || 0,
      vpH: st.vpH || 0,
      routePath: st.routePath,
      mode: keepMode ? st.mode : (/\.(?:html?|svg)$/i.test(x.path) && !st.previewUrl ? 'run' : 'code'),
      keepMode,
    });
  }
  function menu(anchor, sheet) {
    sheet.querySelector('.pv-menu')?.remove(); const l = files(); if (l.length < 2) return;
    const m = h('div', { class: 'pv-menu', role: 'listbox' }, ...l.map(x => {
      const t = x.img ? '' : textFrom(x.get), n = x.path.split('/').pop(), cur = x.path === st.path;
      return h('button', { type: 'button', class: 'pv-mi' + (cur ? ' on' : ''), role: 'option', 'aria-selected': String(cur), onclick: () => { m.remove(); if (!cur) selectFileItem(x, true); } },
        x.img ? h('img', { class: 'pv-mthumb', src: x.img.thumb || x.img.src, alt: '', loading: 'lazy' }) : icon('file'), h('span', { class: 'pv-mn' }, h('b', {}, n), h('small', {}, x.img ? (x.img.sub || '图片') : x.path !== n ? x.path : (t ? countLinesFast(t) + ' 行' : ''))), cur ? icon('check') : null);
    }));
    sheet.append(m);
    const off = e => { if (!m.isConnected) { document.removeEventListener('pointerdown', off, true); return; } if (!m.contains(e.target) && !anchor.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  }
  function download(text) {
    const l = files();
    if (!text && l.length > 0) {
      const combined = l.map(f => `// ===== FILE: ${f.path} =====\n${textFrom(f.get, st.sid, f.path)}`).join('\n\n');
      const fname = (st.name && st.name !== '预览' && st.name !== 'preview.html') ? st.name : 'project-files.txt';
      const run = typeof FileExport !== 'undefined' ? FileExport.text(combined, fname, 'text/plain') : Promise.reject(Error('当前版本不支持保存文件'));
      Promise.resolve(run).catch(e => toast('保存失败：' + describe(e), 'err'));
      return;
    }
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

  function buildEvalTopBar() {
    const sid = st?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
    const chat = sid && typeof Chats !== 'undefined' ? Chats.get?.(sid) : null;
    if (!chat || !chat.isEvaluation) return null;
    const { msgA, msgB } = findEvalTurnMessages(chat, st?.evalMsgId || null);
    if (!msgA && !msgB) return null;
    const isBattle = chat.evalMode === 'battle';
    const voted = Boolean(chat.voteState?.voted);
    const voteVal = chat.voteState?.value || null;
    const curPos = st?.evalPos === 'b' && msgB ? 'b' : 'a';

    const renderOptTab = (pos, msg) => {
      if (!msg) return null;
      const b = extractEvalBundle(chat, msg);
      const isCur = curPos === pos;
      const revealedName = pos === 'a'
        ? (chat.voteState?.modelAName || (msg.modelId && typeof ModelCatalog !== 'undefined' ? ModelCatalog.resolveModelName(msg.modelId, chat.revealedModels) : ''))
        : (chat.voteState?.modelBName || (msg.modelId && typeof ModelCatalog !== 'undefined' ? ModelCatalog.resolveModelName(msg.modelId, chat.revealedModels) : ''));
      const label = (voted && revealedName)
        ? revealedName
        : (!isBattle ? (chat.directModelName || revealedName || 'Direct Preview') : (pos === 'a' ? 'Option A' : 'Option B'));
      const isWin = voted && ((pos === 'a' && voteVal === 'model_a') || (pos === 'b' && voteVal === 'model_b'));
      const statusDot = b.isPendingBuild
        ? h('i', { class: 'spin pv-opt-spin', title: '正在构建预览…' })
        : (b.previewUrl || b.localHtmlFile)
          ? h('span', { class: 'pv-opt-dot ok', title: '预览已就绪' })
          : b.files.length
            ? h('span', { class: 'pv-opt-cnt' }, b.files.length + ' 文件')
            : null;
      return h('button', {
        type: 'button',
        class: 'pv-opt-tab' + (isCur ? ' active' : '') + (isWin ? ' win' : ''),
        onclick: () => selectEvalOption(pos, { sid: chat.sid, keepMode: false }),
      },
        h('span', { class: 'pv-opt-badge pos-' + pos }, pos.toUpperCase()),
        h('span', { class: 'pv-opt-name' }, label),
        isWin ? h('span', { class: 'pv-opt-win' }, '🏆') : null,
        statusDot
      );
    };

    return h('div', { class: 'pv-eval-bar' },
      h('div', { class: 'pv-opt-tabs' },
        renderOptTab('a', msgA),
        isBattle && msgB ? renderOptTab('b', msgB) : null
      )
    );
  }

  function buildFilePillsBar(fileList) {
    if (!Array.isArray(fileList) || fileList.length <= 1) return null;
    return h('div', { class: 'pv-file-pills' },
      ...fileList.map(f => {
        const active = f.path === st.path;
        const shortName = f.path.split('/').pop() || f.path;
        return h('button', {
          type: 'button',
          class: 'pv-fpill' + (active ? ' on' : ''),
          title: f.path,
          onclick: () => selectFileItem(f, st.mode === 'code'),
        },
          icon('file'),
          h('span', { class: 'pv-fpill-n' }, f.path.length <= 28 ? f.path : shortName)
        );
      })
    );
  }

  function buildRemoteUrlWithEmbed(rawUrl, routePath = '/') {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      if (routePath && routePath.startsWith('/')) u.pathname = routePath;
      if (!u.searchParams.has('embed')) u.searchParams.set('embed', 'true');
      return u.toString();
    } catch {
      return rawUrl;
    }
  }

  function render() {
    if (!root) return;
    if (!st) { root.replaceChildren(); return; }
    try { st.stage?.destroy(); } catch {}
    st.stage = null;
    const isImg = st.kind === 'image', text = isImg ? '' : textOf(), kind = st.kind, script = kind === 'html' && hasScript(text), lines = text ? countLinesFast(text) : 0;
    const hasRemotePv = Boolean(st.previewUrl || st.isPendingBuild);
    const canRunPreview = !isImg && (kind !== 'code' || hasRemotePv || files().some(f => /\.(?:html?|svg)$/i.test(f.path)));
    const seg = (k, ic, l) => h('button', { type: 'button', class: st.mode === k ? 'on' : '', 'aria-label': l, title: l, onclick: () => setMode(k) }, icon(ic), h('span', {}, l));
    const sheet = h('div', { class: 'pv-sheet' });
    const allFiles = files();
    const many = allFiles.length > 1;
    const evalTopBar = buildEvalTopBar();
    const filePills = (st.mode === 'code' || allFiles.length > 1) ? buildFilePillsBar(allFiles) : null;
    const fileBtn = h('button', { type: 'button', class: 'pv-file' + (many ? ' many' : ''), title: st.path, 'aria-haspopup': many ? 'listbox' : null, onclick: () => { if (many) menu(fileBtn, sheet); } },
      icon('pvfolder'), h('b', { class: 'pv-n', title: st.path }, st.name), many ? icon('pvdown', 'pv-caret') : null);
    const hasCustomVp = Boolean((st.vpW > 0 || st.vpH > 0) && st.mode === 'run');
    const vpText = hasCustomVp ? `${st.vpW || '自动'}×${st.vpH || '自动'}` : '';
    const vpBar = (!isImg && st.mode === 'run' && (hasRemotePv || kind === 'html') && !mobile())
      ? h('button', {
          type: 'button',
          class: 'ib sm pv-b pv-vp-one' + (hasCustomVp ? ' on' : ''),
          title: hasCustomVp ? `预览尺寸: ${vpText} px（点击调整长宽 px）` : '调整预览长宽尺寸 (px)',
          'aria-label': '调整预览长宽尺寸 (px)',
          onclick: e => toggleVpPopover(e.currentTarget, sheet)
        }, icon('pvsize'), vpText ? h('span', { class: 'pv-vp-lbl' }, vpText) : null)
      : null;
    const head = h('div', { class: 'pv-h' },
      !canRunPreview ? null : h('div', { class: 'pv-seg', role: 'tablist' }, kind === 'md' ? seg('run', 'pvplay', '预览') : seg('run', 'pvplay', '预览'), seg('code', 'pvcode', kind === 'md' ? '源码' : '代码')),
      fileBtn,
      vpBar,
      isImg ? null : btn('refresh', '重新读取并刷新', () => { render(); }),
      st.previewUrl ? h('button', { type: 'button', class: 'ib sm pv-b', title: '在独立浏览器标签页打开实时预览 (' + st.previewUrl + ')', onclick: () => window.open(st.previewUrl, '_blank', 'noopener,noreferrer') }, '↗') : null,
      isImg && typeof ImgAct !== 'undefined' && ImgAct.canCopy() ? btn('copy', '复制图片', () => ImgAct.copy(st.img.src)) : null,
      kind !== 'html' || (hasRemotePv && !kindOf(st.path)) ? null : h('button', { type: 'button', class: 'ib sm pv-b pv-rec', title: '打开醍醐 HTML/SVG 样本库并对照当前作品识别厂商、型号与强度', 'aria-label': '醍醐样本库', onclick: () => void record() }, icon('pelican'), h('span', {}, '醍醐库')),
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
    const body = h('div', { class: 'pv-body' + (isImg ? ' pv-imgb' : '') + (hasCustomVp ? ' pv-vp-custom' : '') });
    const applyStageVp = stageEl => {
      if (!stageEl || !hasCustomVp) return;
      stageEl.style.width = st.vpW > 0 ? st.vpW + 'px' : '100%';
      stageEl.style.height = st.vpH > 0 ? st.vpH + 'px' : '100%';
      stageEl.style.flex = 'none';
    };
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
      const codeStr = text.length > MAXCODE ? text.slice(0, MAXCODE) + '\n…' : text || '（正在写入代码…）';
      const pre = h('pre', { class: 'pv-code' });
      if (st.highlightStart > 0 && codeStr) {
        const cLines = codeStr.split('\n');
        const hStart = Math.max(1, st.highlightStart);
        const hEnd = Math.max(hStart, st.highlightEnd || hStart);
        cLines.forEach((ln, idx) => {
          const lNum = idx + 1;
          const isHl = lNum >= hStart && lNum <= hEnd;
          pre.append(h('div', { class: 'pv-cln' + (isHl ? ' hl' : ''), 'data-ln': lNum },
            h('span', { class: 'pv-lno' }, String(lNum)),
            h('span', { class: 'pv-ltxt' }, ln || ' ')
          ));
        });
        setTimeout(() => {
          const firstHl = pre.querySelector('.pv-cln.hl');
          if (firstHl && firstHl.scrollIntoView) firstHl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 40);
      } else {
        pre.textContent = codeStr;
      }
      body.append(pre, h('button', { type: 'button', class: 'ib sm pv-copy', title: '复制源码', 'aria-label': '复制源码', onclick: () => copyText(textOf() || text) }, icon('copy')));
      frame = null;
    } else if (st.previewUrl) {
      const embedUrl = buildRemoteUrlWithEmbed(st.previewUrl, st.routePath || '/');
      const f = h('iframe', {
        class: 'pv-frame pv-remote-frame',
        title: st.name || 'WebDev Preview',
        src: embedUrl,
        allow: 'accelerometer; autoplay; camera; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; hid; microphone; midi; payment; picture-in-picture; usb; vr; xr-spatial-tracking',
        sandbox: 'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads',
      });
      const stage = h('div', { class: 'pv-stage pv-remote-stage' }, f);
      applyStageVp(stage);
      frame = f;
      st.probe = null;
      st.frameAt = now();
      body.append(stage);
    } else if (st.isPendingBuild && (!text.trim() || !/\.(?:html?|svg)$/i.test(st.path))) {
      const buildBox = h('div', { class: 'pv-build-wait' },
        h('div', { class: 'pv-build-spin' }, h('i', { class: 'spin' })),
        h('div', { class: 'pv-build-title' }, '正在构建交互预览环境 (Building preview…)'),
        h('div', { class: 'pv-build-sub' }, allFiles.length ? `已生成 ${allFiles.length} 个源码文件，构建完成后将自动加载实时预览` : '模型正在编写并编译项目代码…'),
        allFiles.length ? h('button', {
          type: 'button',
          class: 'btn sm ghost pv-build-codebtn',
          onclick: () => setMode('code'),
        }, icon('pvcode'), h('span', {}, ' 先查看实时代码 (' + allFiles.length + ' 个文件)')) : null
      );
      body.append(buildBox);
      frame = null;
    } else if (st.buildError && !text.trim()) {
      body.append(h('div', { class: 'pv-empty pv-build-err' }, '⚠ 构建预览失败：' + st.buildError));
      frame = null;
    } else if (kind === 'md' && text.trim()) { const d = h('div', { class: 'pv-md md' }); d.innerHTML = MD.render(text); body.append(d); frame = null; }
    else if (!text.trim()) { body.append(h('div', { class: 'pv-empty' }, h('i', { class: 'spin' }), ' 正在生成或读取文件内容，写入后将自动加载显示…')); frame = null; }
    else {
      const localHtml = /\.(?:html?|svg)$/i.test(st.path) ? text : (allFiles.find(f => /\.(?:html?|svg)$/i.test(f.path)) ? textFrom(allFiles.find(f => /\.(?:html?|svg)$/i.test(f.path)).get, st.sid, allFiles.find(f => /\.(?:html?|svg)$/i.test(f.path)).path) : text);
      const src = st.view != null && st.kind === 'html' ? st.view : localHtml;
      const f = h('iframe', { class: 'pv-frame', title: st.name, referrerpolicy: 'no-referrer' });
      const p = h('iframe', { class: 'pv-probe', tabindex: '-1', 'aria-hidden': 'true', referrerpolicy: 'no-referrer' });
      const stage = h('div', { class: 'pv-stage' }, f, p);
      applyStageVp(stage);
      // 展示用 f：跑页面自己的脚本（不同源，脚本拿不到外面的客户端数据；断网，打不出去）
      // 测量 / 记录用 p：同源、不跑脚本，排版尺寸和样式动画从这里读
      f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('csp', CSP_RUN);
      p.setAttribute('sandbox', 'allow-same-origin'); p.setAttribute('csp', CSP);
      const pvSid = st.sid || st.wsid || '';
      f.srcdoc = docOf(src, st.name, { run: true, sid: pvSid, basePath: st.path || st.name });
      p.srcdoc = docOf(src, st.name, { run: false, sid: pvSid, basePath: st.path || st.name });
      frame = f; st.probe = p; st.frameAt = now();
      PvAnim.bind(stage, f);
      body.append(stage);
      stageToMount = { stage, f, p, src };
    }
    const footLabel = st.previewUrl && st.mode === 'run'
      ? ('云端沙盒实时预览 · ' + (st.templateKind || 'WebDev') + (allFiles.length ? ` · ${allFiles.length} 个文件` : ''))
      : (kind === 'html' && st.mode === 'run' ? '沙盒运行 · 已断网' : lines + ' 行');
    const foot = isImg ? h('div', { class: 'pv-note sm' }, dim, h('span', { class: 'dim' }, fmtClock2(st.at))) : (script && !st.previewUrl) ? h('div', { class: 'pv-note' }, icon('alert'), h('span', { class: 'grow' }, '页面含脚本：已在沙盒里运行（断网、拿不到客户端数据）。需要联网或完整浏览器环境请用隔离窗口。'),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => void runIsolated() }, '在隔离窗口运行')) : h('div', { class: 'pv-note sm' }, h('span', { class: 'grow' }, footLabel), h('span', { class: 'dim' }, fmtClock2(st.at)));
    sheet.append(...[handle, evalTopBar, head, filePills, body, foot].filter(Boolean)); drag(handle, sheet); drag(head, sheet);
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
        if (note && st.kind !== 'html') note.textContent = (text ? countLinesFast(text) : 0) + ' 行';
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
  // 「醍醐库」按钮：用在线醍醐库识别当前作品，并打开在线样本库对照（2.0.3-beta.1 起不再截图、不再存图）
  async function record() {
    if (!st || st.kind !== 'html' || st.recording) return; st.recording = true;
    try {
      const baseSid = st.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
      const curChat = baseSid && typeof Chats !== 'undefined' ? Chats.get(baseSid) : null;
      const rawTextNow = String(textOf() || '');
      let cmpModel = '';
      try {
        if (typeof TihuHub !== 'undefined' && TihuHub.isReady?.() && rawTextNow.trim().length >= 90) {
          if (baseSid && curChat) {
            const rT = await TihuHub.recognizePelicanChatAndApply(baseSid, curChat, { allowHealStub: true });
            if (rT?.matched && rT.displayLabel) cmpModel = rT.family || rT.displayLabel;
          }
          if (!cmpModel) {
            const idRes = TihuHub.identifySync(rawTextNow);
            if (idRes?.detectedModel) cmpModel = idRes.detectedModel.id || idRes.detectedModel.label || '';
          }
        }
      } catch {}
      PelicanShots.table({ compareModel: st.evalModelName || cmpModel || '' });
      try { Dock.render(); } catch {}
    } catch (e) { toast('打开醍醐库失败：' + describe(e), 'err'); }
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
  return { previewable, kindOf, inlineAssets, open, openEvalMessage, selectEvalOption, syncEval, extractEvalBundle, activeEvalPos: () => st?.evalPos || null,
    activeMode: () => st?.mode || '', activeEvalMsgId: () => st?.evalMsgId || null, image, isFull: () => !!root?.classList.contains('pv-full'), close, dismiss, on, mount, bindRow, render, syncLive, record, card, titleOf, sid: () => st?.sid || null, docOf,
    resolvedText, resolvedVer: () => _resolvedVer, cacheResolvedText, healFileText, isUsablePreviewText };
})();

// 旧「鹈鹕截图库」已取消（2.0.3-beta.1）：不再截图、不再存 JPEG、不再多账号合并 / 收割、不再导入导出截图库。
// 只保留在线醍醐 HTML/SVG 样本库。保留同名对象只是为了兼容旧调用点：打开库 → 在线库面板；概览卡片 → 醍醐网页样本卡片；
// 鹈鹕测试 / 抽卡结束 → 只做在线库识别；其余（存图 / 拉取 / 推送 / 改型号）都是空操作。
const PelicanShots = (() => {
  const noop = () => {};
  const cleanName = s => String(s || '').replace(/[?？]+$/, '').trim();
  let openBody = null;
  function table(initOpts = {}) {
    const opts = initOpts && typeof initOpts === 'object' && !initOpts.target && !initOpts.preventDefault ? initOpts : {};
    if (typeof TihuHub === 'undefined' || typeof TihuHub.renderLibraryPanel !== 'function') { try { toast('醍醐在线样本库尚未加载', 'err'); } catch {} return null; }
    try { if (typeof document !== 'undefined' && document.querySelectorAll) document.querySelectorAll('.modal-back').forEach(b => { if (b.querySelector?.('.pel-lib-modal')) b.remove(); }); } catch {}
    const rawCmp = opts.compareModel && opts.compareModel !== '未识别' && opts.compareModel !== '开源模型' ? cleanName(opts.compareModel) : '';
    let back = null;
    const closeModal = () => { openBody = null; table.refreshOpen = null; try { back?.remove(); } catch {} };
    const panelEl = TihuHub.renderLibraryPanel(rawCmp, { onClose: closeModal });
    back = modal('', panelEl, null, 'pt-modal pel-lib-modal');
    openBody = { host: panelEl, cmp: rawCmp, onClose: closeModal };
    table.refreshOpen = () => {
      if (!openBody || !openBody.host?.isConnected) { openBody = null; return; }
      try { const fresh = TihuHub.renderLibraryPanel(openBody.cmp || '', { onClose: openBody.onClose }); openBody.host.replaceWith(fresh); openBody.host = fresh; } catch {}
    };
    return back;
  }
  function card(sid) {
    if (typeof TihuHub === 'undefined' || typeof TihuHub.renderModelCardSection !== 'function') return null;
    const rawSid = String(sid || '').split('#')[0];
    const m = (rawSid && typeof Models !== 'undefined' && Models.get) ? Models.get(rawSid) : null;
    const rawModel = cleanName(m?.rawLabel || m?.name || m?.candidateName || '');
    const effort = String(m?.effort || m?.tier || m?.reverseEffort || '').trim().toLowerCase();
    try { return TihuHub.renderModelCardSection(sid, rawModel, effort, true) || null; } catch { return null; }
  }
  // 鹈鹕测试 / 抽卡结束：只用在线库识别型号（不截图）
  async function auto(sid, chat) {
    let tihu = null;
    if (typeof TihuHub !== 'undefined' && typeof TihuHub.recognizePelicanChatAndApply === 'function' && TihuHub.isReady?.() && sid) {
      tihu = await TihuHub.recognizePelicanChatAndApply(sid, chat, { allowHealStub: true }).catch(() => null);
    }
    return { tihu, none: '截图库已取消，只做在线醍醐库识别' };
  }
  return {
    retired: true, add: () => null, auto, all: () => [], del: noop, latest: () => [], forModel: () => [], forSid: () => [],
    card, entryCard: card, table, openLibrary: table, tableSvg: () => '', modelOf: () => ({ model: null, score: null, think: null }),
    pull: async () => ({ retired: true }), push: noop, syncSid: noop, exportData: () => null, exportLibrary: noop,
    importData: async () => ({ added: 0, retired: true }), openImport: () => table(),
  };
})();
if (typeof globalThis !== 'undefined') globalThis.PelicanShots = PelicanShots;
