// Animated 3-reel progress indicator for concurrent session status transitions
const GSlot = (() => {
  const N = 12, SPIN = 15, GAP = 400, LAND = 360, FGAP = 110, FLAND = 200;
  const FILL = [
    ['Claude', 'GPT', 'Gemini', 'Grok', 'Kimi', 'DeepSeek', 'Qwen', 'GLM'],
    ['opus', 'sonnet', 'haiku', 'luna', 'fable', 'pro', 'flash', 'astra', 'K3', 'nova', 'mini', 'ultra'],
    ['max', 'xhigh', 'high', 'medium', 'low', '标准'],
  ];
  // 名称拆成 厂商 / 型号 / 档位（与油猴脚本 modelParts 同一规则）
  const TW = /^(none|minimal|low|medium|high|xhigh|max)$/, DEPLOY = /^(vertex|public|agent|bedrock)$/;
  const VW = /^(gpt|chatgpt|claude|gemini|grok|kimi|qwen|qwq|deepseek|mimo|glm|chatglm|llama|mistral|doubao|minimax|anthropic|openai|google|xai|moonshot|zhipu)$/;
  const FUSED = /^(?:gpt|claude|gemini|grok|kimi|qwen|qwq|deepseek|mimo|glm|llama|mistral|doubao|minimax)(?=\d)/;
  function parts(name, hint, partial) {
    const raw = noVertex(String(name || '')).replace(/^#\d+\s*/, '').replace(/\/\d+-\d+-\d+:\d+$/, '').replace(/-(agent)$/i, '').trim();
    const vid = Brand.of(raw); hint = String(hint || '').toLowerCase();
    let toks = raw.replace(/^[\w.-]+\//, '').toLowerCase().split(/[-_\s·:/()[\]]+/).filter(Boolean).filter(t => !DEPLOY.test(t));
    let tier = '';
    for (let i = toks.length - 1; i >= 0; i--) if (TW.test(toks[i])) { if (!tier) tier = toks[i]; toks.splice(i, 1); }
    if (TW.test(hint)) tier = hint;
    toks = toks.filter(t => !VW.test(t)).map((t, i) => (i === 0 ? t.replace(FUSED, '') : t)).filter(Boolean);
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const x = toks[i], last = out[out.length - 1];
      if (/^\d{4}$/.test(x) && /^\d{2}$/.test(toks[i + 1] || '') && /^\d{2}$/.test(toks[i + 2] || '')) { out.push(x + '-' + toks[i + 1] + '-' + toks[i + 2]); i += 2; continue; }
      if (/^\d{1,2}$/.test(x) && last && /^\d{1,2}$/.test(last)) { out[out.length - 1] = last + '.' + x; continue; }
      if (out.includes(x)) continue;
      out.push(x);
    }
    let family = out.join('-'); if (/^k\d/.test(family)) family = 'K' + family.slice(1);
    const first = raw.toLowerCase().split(/[-_\s/·:]+/).filter(Boolean)[0] || '';
    return [Brand.NAME[vid] || first || '—', family || '—', tier && tier !== 'none' ? tier : partial ? '?' : '标准'];
  }
  function stageName(L, n) {
    if (!L || n < 1 || !L[0] || L[0] === '—') return '';
    if (n === 1 || !L[1] || L[1] === '—') return L[0];
    return L[1].toLowerCase().includes(L[0].toLowerCase()) ? L[1] : L[0] + ' ' + L[1];
  }
  function stageText(L, n) {
    const s = stageName(L, n); if (!s) return '';
    return n === 1 ? '已识别厂商 ' + s : '已识别 ' + s + (n >= 3 && L[2] && L[2] !== '—' ? ' · ' + L[2] : '');
  }
  // 金色传说 = 抽到金色型号（与侧栏金色同一规则：手动点亮 / 自动 = 最高版本里最强的一档）
  let goldAt = 0, goldSet = null;
  function isGold(name) {
    try {
      if (Gold.manual) return Gold.has(name);
      if (!goldSet || Date.now() - goldAt > 30000) { goldAt = Date.now(); goldSet = new Set(GoldBoard.autoGold().map(n => n.toLowerCase())); }
      return goldSet.has(Strength.canon(name).toLowerCase()) || goldSet.has(String(name).toLowerCase());
    } catch { return false; }
  }

  const CSS = '.gsx{position:fixed;left:50%;top:46%;z-index:48;transform:translate(-50%,-50%) scale(.94);opacity:0;pointer-events:none;transition:opacity .22s ease,transform .36s cubic-bezier(.22,1,.36,1);font:500 14px/1.3 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;'
    + '--h:44px;--sbg:rgba(250,248,244,.78);--sfg:#262522;--mut:#7a746b;--line:#0000000f;--sacc:#6a5e54;--saccfg:#fff;--scard:#fffdf9;--win:#e6ddd0;--track:#e6ddd0;--halo:rgba(250,248,244,.95);color:var(--sfg)}'
    + '[data-theme=dark] .gsx{--sbg:rgba(30,29,27,.74);--sfg:#ecebe7;--mut:#a9a59d;--line:#ffffff14;--sacc:#d8d3ca;--saccfg:#262522;--scard:#34322e;--win:#4b4740;--track:#3a3733;--halo:rgba(20,19,18,.95)}'
    + '.gsx.on{opacity:1;transform:translate(-50%,-50%) scale(1)}.gsx[hidden]{display:none}'
    + '.gsx .gs-box{position:relative;pointer-events:none;width:min(480px,calc(100vw - 24px));box-sizing:border-box;padding:14px 14px 12px;border-radius:22px;background:color-mix(in srgb,var(--halo) 80%,transparent);-webkit-backdrop-filter:blur(12px) saturate(1.1);backdrop-filter:blur(12px) saturate(1.1);box-shadow:0 18px 48px -22px rgba(0,0,0,.28),inset 0 0 0 1px var(--line)}'
    + '[data-theme=dark] .gsx .gs-box{box-shadow:0 18px 48px -22px rgba(0,0,0,.6),inset 0 0 0 1px var(--line)}'
    + '.gsx .gs-head,.gsx .gs-cap,.gsx .gs-foot{text-shadow:0 0 6px var(--halo),0 0 2px var(--halo)}'
    + '.gsx .gs-head{display:flex;align-items:center;gap:8px;margin:9px 2px 0;padding:3px 8px;border-radius:10px;white-space:nowrap;font-size:12px;color:var(--mut)}.gsx .gs-head b{color:var(--sfg);font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}.gsx .gs-head .gs-sp{flex:1}'
    + '.gsx .gs-btn{pointer-events:auto;white-space:nowrap;appearance:none;border:0;background:transparent;color:var(--mut);font:inherit;font-size:11px;padding:3px 8px;border-radius:7px;cursor:pointer;-webkit-app-region:no-drag}.gsx .gs-btn:hover{background:var(--scard);color:var(--sfg)}'
    + '.gsx .gs-reels{display:grid;grid-template-columns:1fr 1.4fr .95fr;gap:14px;padding:0 6px}'
    + '.gsx .gs-reel{position:relative;height:calc(var(--h) * 4);margin:4px 0;perspective:520px}'
    + '.gsx .gs-win{position:absolute;left:-6px;right:-6px;top:50%;height:calc(var(--h) + 6px);transform:translateY(-50%);border-radius:14px;background:var(--win);box-shadow:0 10px 30px rgba(0,0,0,.2),0 0 0 3px color-mix(in srgb,var(--sacc) 18%,transparent),inset 0 0 0 2px var(--sacc);transition:box-shadow .25s,background .25s}'
    + '.gsx .gs-reel.gs-stop .gs-win{box-shadow:0 10px 30px rgba(0,0,0,.24),0 0 0 5px color-mix(in srgb,var(--sacc) 26%,transparent),inset 0 0 0 2px var(--sacc)}'
    + '.gsx .gs-drum{position:absolute;inset:0;transform-style:preserve-3d}'
    + '.gsx .gs-it{position:absolute;left:0;right:0;top:50%;height:calc(var(--h) - 6px);margin-top:calc((var(--h) - 6px) / -2);display:flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;box-sizing:border-box;border-radius:12px;background:var(--scard);color:var(--sfg);box-shadow:0 4px 14px rgba(0,0,0,.14),inset 0 0 0 1px var(--line);backface-visibility:hidden;white-space:nowrap}'
    + '.gsx .gs-it .gs-ic{display:none;width:18px;height:18px;align-items:center;justify-content:center;flex:none}.gsx .gs-it .gs-ic:not(:empty){display:inline-flex}.gsx .gs-it .gs-ic svg{width:16px;height:16px}'
    + '.gsx .gs-it .gs-nm{min-width:0;overflow:hidden;text-overflow:ellipsis}'
    + '.gsx .gs-it.gs-sel{background:transparent;box-shadow:none;font-weight:700;color:var(--sacc)}.gsx .gs-it.gs-sel .gs-ic{color:var(--sfg)}'
    + '.gsx .gs-reel.gs-thunk .gs-win{animation:gsx-thunk .36s cubic-bezier(.3,1.6,.5,1)}@keyframes gsx-thunk{0%{transform:translateY(-50%) scale(1)}35%{transform:translateY(-50%) scale(1.045)}100%{transform:translateY(-50%) scale(1)}}'
    + '.gsx .gs-cap{display:grid;grid-template-columns:1fr 1.4fr .95fr;gap:14px;padding:0 6px;margin:2px 0 0;font-size:10px;color:var(--mut);text-align:center;letter-spacing:.04em}'
    + '.gsx .gs-bar{position:relative;height:6px;margin:12px 2px 0;border-radius:6px;background:var(--track);box-shadow:0 1px 4px rgba(0,0,0,.12);overflow:hidden}'
    + '.gsx .gs-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:6px;background:var(--sacc);transition:width .45s cubic-bezier(.22,1,.36,1)}'
    + '.gsx .gs-fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);background-size:60px 100%;background-repeat:no-repeat;animation:gsx-shine 1.3s linear infinite}'
    + '[data-theme=dark] .gsx .gs-fill::after{background:linear-gradient(90deg,transparent,rgba(0,0,0,.25),transparent);background-size:60px 100%;background-repeat:no-repeat}'
    + '.gsx.idle .gs-fill::after{animation:none;opacity:0}@keyframes gsx-shine{from{background-position:-60px 0}to{background-position:calc(100% + 60px) 0}}'
    + '.gsx .gs-foot{display:flex;align-items:center;gap:8px;margin:4px 2px 0;padding:3px 8px;border-radius:10px;font-size:11px;color:var(--mut);min-height:18px}.gsx .gs-foot .gs-ph{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.gsx .gs-badge{flex:none;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;background:var(--scard);color:var(--sfg);opacity:0;transform:scale(.8);transition:opacity .2s,transform .3s cubic-bezier(.3,1.6,.5,1);text-shadow:none}.gsx .gs-badge.show{opacity:1;transform:scale(1)}'
    + '.gsx .gs-badge.gs-hit{background:var(--sacc);color:var(--saccfg)}'
    + '.gsx.hit .gs-win{box-shadow:0 10px 30px rgba(0,0,0,.24),0 0 0 6px color-mix(in srgb,var(--sacc) 34%,transparent),inset 0 0 0 2px var(--sacc)}'
    + '.gsx .gs-badge.gs-gold{color:#3a2600;background:linear-gradient(100deg,#b8860b,#ffd76a 35%,#fff3c4 50%,#ffd76a 65%,#b8860b);background-size:220% 100%;animation:gsx-gold 1.6s linear infinite;box-shadow:0 0 14px rgba(255,196,60,.65)}.gsx .gs-badge.gs-dim{background:#8884;color:var(--mut)}'
    + '.gsx.legend .gs-win{background:linear-gradient(100deg,#b8860b,#ffd76a 35%,#fff3c4 50%,#ffd76a 65%,#b8860b);background-size:220% 100%;animation:gsx-gold 1.6s linear infinite;box-shadow:0 0 0 2px #e0b23a,0 0 26px 6px rgba(255,190,50,.55),0 0 60px 14px rgba(255,190,50,.25)}'
    + '.gsx.legend .gs-it.gs-sel{color:#3a2600;text-shadow:0 1px 0 rgba(255,255,255,.5)}.gsx.legend .gs-it.gs-sel .gs-ic{color:#3a2600}'
    + '.gsx.legend .gs-reels{animation:gsx-legend 1.1s cubic-bezier(.3,1.5,.5,1)}@keyframes gsx-legend{0%{transform:scale(1)}30%{transform:scale(1.06)}100%{transform:scale(1)}}@keyframes gsx-gold{from{background-position:120% 0}to{background-position:-100% 0}}'
    + '.gsx.legend .gs-box::before{content:"";position:absolute;inset:-40px;pointer-events:none;background:radial-gradient(closest-side,rgba(255,200,70,.35),transparent 70%);animation:gsx-glow 1.8s ease-in-out infinite}@keyframes gsx-glow{50%{opacity:.45}}'
    + '.gsx.dim .gs-reels,.gsx.dim .gs-cap{filter:grayscale(1) brightness(.8);opacity:.45;transition:filter .5s,opacity .5s}.gsx.dim .gs-win{box-shadow:inset 0 0 0 2px #8886}'
    + '.gsx.mob{--h:36px}.gsx.mob .gs-box{width:min(354px,calc(100vw - 28px));padding:8px 6px 6px;border-radius:18px}.gsx.mob .gs-reels,.gsx.mob .gs-cap{gap:9px;padding:0 3px;grid-template-columns:1.2fr 1.25fr .95fr}.gsx.mob .gs-it{font-size:12px;padding:0 6px;gap:5px;border-radius:10px}.gsx.mob .gs-it .gs-ic{width:14px;height:14px}.gsx.mob .gs-it .gs-ic svg{width:13px;height:13px}.gsx.mob .gs-win{left:-3px;right:-3px;border-radius:12px}.gsx.mob .gs-head{font-size:11px;gap:6px}.gsx.mob .gs-head b{font-size:12px}.gsx.mob .gs-bar{height:5px;margin-top:9px}.gsx.mob .gs-btn{padding:3px 6px}'
    + '@media (prefers-reduced-motion:reduce){.gsx .gs-fill::after{animation:none}.gsx.legend *,.gsx.legend .gs-box::before{animation:none!important}}';

  let wrap = null, reels = [], fillEl, phEl, badgeEl, noEl, hitEl, headEl, stopEl, H = 44, raf = 0, hideT = 0, disp = null;
  let runId = '', seen = new Map(), hiddenRun = '', endedFor = '', lastDraw = 0;
  let onV = false, onAt = 0;
  const on = () => { const t = Date.now(); if (t - onAt > 400) { onAt = t; try { onV = Gacha.settings().slot === true; } catch { onV = false; } } return onV; };
  Bus.on('gacha', () => { onAt = 0; });
  function build() {
    if (!document.getElementById('gsx-css')) { const st = document.createElement('style'); st.id = 'gsx-css'; st.textContent = CSS; document.head.append(st); }
    wrap = document.createElement('div'); wrap.className = 'gsx'; wrap.setAttribute('aria-live', 'polite');
    // 与油猴一致：转轮上方不放信息，状态 / 抽数 / 停止 / 收起都在进度条下方
    wrap.innerHTML = '<div class="gs-box"><div class="gs-reels"></div><div class="gs-cap"><span>厂商</span><span>型号</span><span>档位</span></div><div class="gs-bar"><div class="gs-fill"></div></div>'
      + '<div class="gs-head"><span class="gs-st">抽卡中</span><b class="gs-no"></b><span class="gs-hits"></span><span class="gs-sp"></span><button class="gs-btn gs-halt" type="button">停止</button><button class="gs-btn gs-min" type="button" title="本次抽卡不再显示老虎机">收起</button></div>'
      + '<div class="gs-foot"><span class="gs-ph"></span><span class="gs-badge"></span></div></div>';
    const q = s => wrap.querySelector(s);
    fillEl = q('.gs-fill'); phEl = q('.gs-ph'); badgeEl = q('.gs-badge'); noEl = q('.gs-no'); hitEl = q('.gs-hits'); headEl = q('.gs-st'); stopEl = q('.gs-halt');
    stopEl.onclick = () => { try { Gacha.stop(); } catch {} };
    q('.gs-min').onclick = () => { hiddenRun = runId; hide(); };
    const box = q('.gs-reels');
    reels = FILL.map((list, k) => {
      const el = document.createElement('div'); el.className = 'gs-reel'; box.append(el);
      el.innerHTML = '<div class="gs-win"></div><div class="gs-drum"></div>'; const drum = el.lastChild;
      const items = Array.from({ length: N }, () => { const d = document.createElement('div'); d.className = 'gs-it'; d.innerHTML = '<span class="gs-ic"></span><span class="gs-nm"></span>'; drum.append(d); return d; });
      return { k, el, items, list, pos: NaN, sel: -1, m: 'spin', at: Infinity };
    });
    document.body.append(wrap);
  }
  const wrapI = i => ((i % N) + N) % N;
  const offOf = (r, i) => ((((i - r.pos) % N) + N + N / 2) % N) - N / 2;
  function setItem(r, d, label) {
    d.lastChild.textContent = label; d.title = label;
    if (r.k === 0) { const id = label && label !== '—' ? Brand.of(label.toLowerCase()) : ''; const ic = id ? VIcon.html(id, 16) : ''; if (d.firstChild.innerHTML !== ic) d.firstChild.innerHTML = ic; }
  }
  function paintReel(r) {
    for (let i = 0; i < N; i++) {
      const off = offOf(r, i), a = Math.abs(off), d = r.items[i];
      // 卡片绕水平轴排成圆柱：离中心越远越倾斜、越小、越淡
      d.style.transform = 'translateY(' + (off * H * .92).toFixed(2) + 'px) rotateX(' + (-off * 24).toFixed(2) + 'deg) translateZ(' + (-a * a * 6).toFixed(2) + 'px) scale(' + Math.max(.72, 1 - a * .07).toFixed(3) + ')';
      d.style.opacity = String(Math.max(0, 1 - a * .3).toFixed(3)); d.style.zIndex = String(100 - Math.round(a * 10));
    }
    const k = wrapI(Math.round(r.pos)); if (k !== r.sel) { r.sel = k; r.items.forEach((d, i) => d.classList.toggle('gs-sel', i === k)); }
  }
  // 只换看不见的格子：刚停住的结果不会原地变字，而是跟着转走
  function resetReels() {
    for (const r of reels) {
      r.el.classList.remove('gs-stop', 'gs-thunk'); r.m = 'spin'; r.cst = false; r.at = Infinity;
      r.items.forEach((d, i) => { if (Math.abs(offOf(r, i)) >= 3.5 || !d.lastChild.textContent) setItem(r, d, r.list[(i + r.k * 3) % r.list.length]); });
    }
  }
  function newDisp(fast) {
    const pos = Number.isFinite(reels[0]?.pos) ? reels[0].pos : Math.random() * N;
    for (const r of reels) if (!Number.isFinite(r.pos)) r.pos = pos;
    disp = { a: null, targets: null, labels: null, mode: 'spin', v: fast ? SPIN : (disp && disp.mode === 'spin' ? disp.v : 0), stage: 0, sched: null, coast: false, fast: !!fast, endAt: 0, hold: 0, verdict: '', legend: false };
    resetReels(); badgeEl.className = 'gs-badge'; badgeEl.textContent = ''; wrap.classList.remove('hit', 'legend', 'dim');
  }
  const RES = ['hit', 'keep', 'archive'];
  const queue = run => run.attempts.filter(a => a.done && a.draw && a.model && RES.includes(a.verdict) && seen.get(a.no) !== (a.rev || 0)).sort((x, y) => x.draw - y.draw);
  // 需要显示吗：开关开着、本次没收起、有这次抽卡；长时间等待（人机验证 / 冷却 > 20 秒）时先隐藏
  function want() {
    const run = Gacha.run; if (!run || !on() || document.hidden) return false;
    if (hiddenRun && hiddenRun === run.id) return false;
    const busy = Gacha.busy();
    if (busy) return !(run.needCaptcha || (run.waitUntil && run.waitUntil - now() > 20000));
    // 已结束：还在揭晓 / 结束后停留期间继续显示；很久以前结束的不再弹出
    return !!wrap && wrap.classList.contains('on') && runId === run.id && endedFor !== run.id;
  }
  function show() {
    clearTimeout(hideT); hideT = 0;
    if (!wrap || !wrap.isConnected) build();
    const mob = (typeof isMob === 'function' && isMob()) || innerWidth < 560; wrap.classList.toggle('mob', mob); H = mob ? 36 : 44;
    if (!wrap.classList.contains('on')) requestAnimationFrame(() => wrap && wrap.classList.add('on'));
    if (!raf) { let last = performance.now(); const step = t => { raf = 0; const dt = Math.min(.05, (t - last) / 1000); last = t; try { frame(t, dt); } catch (e) { console.warn('slot', e); } if (wrap && wrap.classList.contains('on') && !document.hidden) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); }
  }
  function hide(delay = 0) {
    if (!wrap) return;
    if (!delay) { clearTimeout(hideT); hideT = 0; wrap.classList.remove('on'); cancelAnimationFrame(raf); raf = 0; return; }
    if (hideT) return;
    hideT = setTimeout(() => { hideT = 0; if (!wrap) return; wrap.classList.remove('on'); cancelAnimationFrame(raf); raf = 0; }, delay);
  }
  function frame(t, dt) {
    const run = Gacha.run;
    if (!run || !on()) { hide(); return; }
    if (run.id !== runId) { runId = run.id; seen = new Map(); disp = null; lastDraw = 0; endedFor = ''; }
    const running = Gacha.busy();
    // 界面在后台时积压了很多结果：只揭晓最近的一个
    let q = queue(run); if (q.length > 3) { for (const a of q.slice(0, -1)) seen.set(a.no, a.rev || 0); q = q.slice(-1); }
    if (!disp) newDisp(q.length > 1);
    const D = disp;
    if (!D.a && q.length && !D.coast) { D.a = q[0]; D.targets = parts(D.a.model, D.a.tier, D.a.partial); D.verdict = D.a.verdict; if (q.length > 1) D.fast = true; }
    else if (D.a && !D.fast && q.length > 1) {
      // 后面又排了结果：这一抽加快依次停下
      D.fast = true; let i = 0; for (const r of reels) if (r.m === 'spin' && Number.isFinite(r.at)) r.at = Math.min(r.at, t + (i++) * FGAP);
      if (D.sched) { D.sched.gap = FGAP; D.sched.dur = FLAND; }
    }
    // 抽卡已结束且没有要揭晓的结果：三个轮子惯性停下
    if (D.mode === 'spin' && !D.a && !running) { D.mode = 'land'; D.coast = true; D.verdict = ['paused', 'stopped'].includes(run.status) ? 'cancelled' : ''; }
    if (D.mode === 'spin') {
      D.v = D.fast ? SPIN : Math.min(SPIN, D.v + SPIN / .7 * dt);
      if (D.targets && (D.fast || D.v >= SPIN * .15)) {
        // 排好依次停下的时刻表：厂商马上开始减速，型号晚 GAP 毫秒，档位再晚 GAP 毫秒
        const gap = D.fast ? FGAP : GAP;
        D.labels = D.targets.slice(); D.mode = 'land'; D.stage = 0; D.sched = { t0: t, gap, dur: D.fast ? FLAND : LAND };
        reels.forEach((r, k) => { r.at = t + k * gap; });
      }
    }
    let stopped = 0;
    reels.forEach((r, k) => {
      if (r.m === 'spin') {
        r.pos += D.v * dt;
        if (D.mode === 'land') {
          if (D.coast) { r.m = 'land'; r.cst = true; r.from = r.pos; r.to = Math.ceil(r.pos) + 2; r.t0 = t; r.dur = 600; r.v0 = D.v; }
          else if (t >= r.at) {
            // 目标项放在滚轮背面（4 格外完全透明，换字看不见），从当前转速平滑减速停在它上面
            const to = Math.ceil(r.pos) + 4; setItem(r, r.items[wrapI(to)], D.labels[k]);
            r.m = 'land'; r.cst = false; r.from = r.pos; r.to = to; r.t0 = t; r.dur = D.sched ? D.sched.dur : LAND; r.v0 = D.v;
          }
        }
      }
      if (r.m === 'land') {
        // 三次 Hermite：起点速度 = 当前转速，终点速度 0
        const qq = Math.min(1, (t - r.t0) / r.dur), d = r.to - r.from, sp = Math.max(0, Math.min(3, r.v0 * r.dur / 1000 / d));
        r.pos = r.from + d * qq * (sp + qq * (3 - 2 * sp + qq * (sp - 2)));
        if (qq >= 1) {
          r.m = 'stop'; r.pos = r.to;
          if (!r.cst) { r.el.classList.add('gs-stop'); r.el.classList.remove('gs-thunk'); void r.el.offsetWidth; r.el.classList.add('gs-thunk'); try { navigator.vibrate?.(k === 2 ? 12 : 7); } catch {} }
        }
      }
      if (r.m === 'stop') stopped++;
      if (!Number.isFinite(r.pos)) r.pos = 0; paintReel(r);
    });
    if (D.mode === 'land') {
      const first = reels.findIndex(r => r.m !== 'stop' || r.cst), stage = first < 0 ? 3 : first;
      if (!D.coast) D.stage = stage;
      if (stopped === reels.length) D.mode = 'stop';
    }
    if (D.mode === 'stop' && !D.endAt) {
      D.endAt = t;
      const v = D.verdict, L = D.labels || [];
      if (D.a) { lastDraw = Math.max(lastDraw, D.a.draw || 0); }
      const txt = { hit: '命中！', keep: '保留', archive: '归档', cancelled: '已停止' }[v] || '';
      const legend = !!D.a && v !== 'archive' && isGold(D.a.model), dim = v === 'archive';
      D.legend = legend;
      const label = legend ? '金色传说' + (L[2] && L[2] !== '标准' && L[2] !== '?' ? ' · ' + L[2] : '') : txt;
      if (label) { badgeEl.textContent = label; badgeEl.className = 'gs-badge show' + (legend ? ' gs-gold' : v === 'hit' ? ' gs-hit' : dim || v === 'cancelled' ? ' gs-dim' : ''); }
      wrap.classList.toggle('hit', v === 'hit' && !legend); wrap.classList.toggle('legend', legend); wrap.classList.toggle('dim', dim);
      if (legend) { try { navigator.vibrate?.([12, 60, 12, 60, 30]); } catch {} }
      // 金色传说 / 命中 / 归档 多停留一会儿再切到下一抽
      D.hold = legend ? 2000 : v === 'hit' ? 1400 : v === 'archive' || v === 'keep' ? (D.fast ? 700 : 1100) : 500;
    }
    // 展示完这一抽再切到下一抽；全部揭晓完且抽卡已结束 → 停留一会儿后淡出
    if (D.endAt && t - D.endAt > D.hold) {
      if (D.a) seen.set(D.a.no, D.a.rev || 0);
      const more = queue(run).length;
      if (more || running) { if (D.a || more) newDisp(more > 1); }
      else if (endedFor !== run.id) { endedFor = run.id; hide(['paused', 'stopped'].includes(run.status) && !D.a ? 900 : 4500); }
    }
    paintInfo(run, running);
  }
  function paintInfo(run, running) {
    const D = disp, s = run.settings || {}, endless = !!s.endless, max = s.maxAttempts || 0;
    const revealed = run.attempts.filter(a => seen.has(a.no) || (D.endAt && D.a === a));
    const no = D.a ? D.a.draw : Math.max(1, Math.min(endless ? Infinity : max || 1, Math.max(lastDraw, revealed.length) + (running ? 1 : 0)));
    const nt = '第 ' + no + ' / ' + (endless ? '∞' : max) + ' 抽'; if (noEl.textContent !== nt) noEl.textContent = nt;
    // 命中数也等三格都停下再加（不提前剧透）
    const hits = revealed.filter(a => a.verdict === 'hit').length, ht = hits ? '· 命中 ' + hits : ''; if (hitEl.textContent !== ht) hitEl.textContent = ht;
    const frac = D.mode === 'stop' ? 0 : D.sched && !D.coast ? .62 + .1 * D.stage : Gacha.flights ? .35 : .1;
    const pct = endless ? (running ? frac * 100 : 0) : max ? Math.min(100, (revealed.length + (running || D.a ? frac : 0)) / max * 100) : 0;
    const w = pct.toFixed(1) + '%'; if (fillEl.style.width !== w) fillEl.style.width = w;
    wrap.classList.toggle('idle', !running && !D.a);
    let ph = D.labels && !D.coast ? stageText(D.labels, D.stage) : '';
    if (!ph) ph = running || D.a ? (D.a ? '识别中…' : (run.phase || '准备中').replace(/^已识别.*/, '识别中…')) : (run.reason || ({ done: '已完成', hit: '已完成', paused: '已停止', stopped: '已停止' }[run.status] || ''));
    if (phEl.textContent !== ph) { phEl.textContent = ph; phEl.title = ph; }
    const fl = Gacha.flights, st = running ? (run.status === 'stopping' ? '正在停止' : run.waitUntil ? '等待中' : fl > 1 ? '后台 ×' + fl : '抽卡中') : ['paused', 'stopped'].includes(run.status) ? '已停止' : '抽卡结束';
    if (headEl.textContent !== st) headEl.textContent = st;
    stopEl.style.display = running && run.status === 'running' ? '' : 'none';
  }
  // 驱动：抽卡状态变化 / 定时检查是否需要显示
  function check() {
    try {
      const run = Gacha.run;
      if (run && run.id !== runId && wrap) { runId = run.id; seen = new Map(); disp = null; lastDraw = 0; endedFor = ''; }
      if (want()) show();
      else if (wrap && wrap.classList.contains('on') && (!run || !on() || (hiddenRun && hiddenRun === run?.id) || (Gacha.busy() && (run.needCaptcha || run.waitUntil - now() > 20000)))) hide();
    } catch {}
  }
  Bus.on('gacha', () => { clearTimeout(check.t); check.t = setTimeout(check, 30); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 700);
  return {
    parts, check,
    // 老虎机正在显示（抽中提示交给老虎机，不再另外弹 toast）
    visible: () => !!wrap && wrap.classList.contains('on') && !document.hidden,
    reopen() { hiddenRun = ''; endedFor = ''; check(); },
  };
})();
