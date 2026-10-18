// ---------- 调色板：给整个窗口染一层颜色（深色 / 浅色都兼容）----------
// 色相 / 饱和度 / 明度 / 透明度四个滑块 + 深浅色切换，实时预览。颜色按对话记：
// 自己设过颜色的对话用自己的；没设过的每个窗口（标签页 / 对话）第一次打开时真随机一个颜色并记住，色相避开最近分配过的颜色。
// 深色模式自动换成同色相的深色（绿 → 深绿），浅色模式换成浅色（绿 → 浅绿）。
const Palette = (() => {
  const BASE = {
    light: { bg: '#faf9f7', bg2: '#f4f3ef', bg3: '#ecebe6', card: '#ffffff', hl: '#ebe9e4', code: '#f3f2ee', bd: '#e6e4de', bd2: '#d6d3cc' },
    dark: { bg: '#1f1e1c', bg2: '#191817', bg3: '#2a2926', card: '#252422', hl: '#2c2b28', code: '#191817', bd: '#33312d', bd2: '#45423d' },
  };
  // 各变量染色强度（相对）
  const W = { bg: 1, bg2: 1.15, bg3: 1, card: 0.7, hl: 1, code: 0.9, bd: 0.8, bd2: 0.7 };
  let map = Store.get('pal:chats', {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex2 = x => { x = x.replace('#', ''); if (x.length === 3) x = x.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
  const toHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function hsl2rgb(hh, ss, ll) { ss /= 100; ll /= 100; const k = n => (n + hh / 30) % 12, a = ss * Math.min(ll, 1 - ll), f = n => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const hash = s => { let x = 2166136261; for (const c of String(s || '')) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
  // 从没设过颜色：按对话随机一个低饱和度颜色（同一个对话每次一样），透明度 80%
  // 真随机：每个窗口（标签页 / 对话）第一次出现时随机取色并记住；色相尽量远离最近分配过的颜色，相邻窗口不会撞色
  let auto = Store.get('pal:auto', {});
  const rnd = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch { return Math.random(); } };
  const hdist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  function fresh() {
    const recent = Object.values(auto).slice(-8).map(c => +c.h).filter(Number.isFinite);
    let best = null, bd = -1;
    for (let i = 0; i < 24; i++) { const h = Math.floor(rnd() * 360), d = recent.length ? Math.min(...recent.map(x => hdist(x, h))) : 360; if (d > bd) { bd = d; best = h; } }
    return { h: best, s: 26 + Math.floor(rnd() * 30), l: 38 + Math.floor(rnd() * 26), a: 72 + Math.floor(rnd() * 10), auto: true };
  }
  const random = seed => {
    if (seed && valid(auto[seed])) return { ...auto[seed], auto: true };
    const c = fresh(); if (seed) { auto[seed] = { h: c.h, s: c.s, l: c.l, a: c.a }; const ks = Object.keys(auto); if (ks.length > 1500) delete auto[ks[0]]; Store.set('pal:auto', auto); }
    return c;
  };
  const valid = c => c && Number.isFinite(+c.h) && Number.isFinite(+c.s) && Number.isFinite(+c.l) && Number.isFinite(+c.a);
  function keyOf() {
    const t = Tabs.cur; if (!t) return 'none';
    // 新对话发出第一条后有了 sid：沿用它在新对话时的颜色
    if (t.sid && !valid(auto[t.sid]) && !valid(map[t.sid]) && valid(auto[t.key]) && t.key !== t.sid) { auto[t.sid] = auto[t.key]; delete auto[t.key]; Store.set('pal:auto', auto); }
    return t.sid || t.key;
  }
  function of(key = keyOf()) {
    if (Prefs.palOff) return null;
    if (valid(map[key])) return map[key];
    return random(key);
  }
  // 深浅色下的染色目标：同色相，深色取低明度、浅色取高明度；明度滑块在各自范围里调
  function target(c, dark) {
    const s = clamp(+c.s, 0, 100), l = clamp(+c.l, 0, 100);
    return dark ? hsl2rgb(+c.h, s * 0.75, 7 + l * 0.26) : hsl2rgb(+c.h, s, 74 + l * 0.24);
  }
  function vars(c, dark) {
    const base = BASE[dark ? 'dark' : 'light'], out = {};
    if (!c) { for (const k of Object.keys(base)) out['--' + k] = ''; return out; }
    const tg = target(c, dark), k = clamp((100 - +c.a) / 100, 0, 1);
    for (const [v, hx] of Object.entries(base)) out['--' + v] = toHex(mix(hex2(hx), tg, clamp(k * W[v] * (dark ? 1.1 : 1.25), 0, 1)));
    return out;
  }
  let lastK = -1, lastNx;
  function apply(c = of()) {
    stopTw(); shown = c ? { h: +c.h, s: +c.s, l: +c.l, a: +c.a } : null; lastK = -1;
    paintVars(c, true);
    try { UI.renderTabs(); } catch {}   // 标签小卡片按各自窗口的颜色上色：颜色改了要跟着变
  }
  // ---- 手机：每一页（当前页 #view 和左右相邻的 .pane）自己带着自己窗口的颜色变量 ----
  // 左右滑动时两页各自带着自己的颜色一起平移（真正的横向画卷）；拖动 / 松手过渡的每一帧只改顶部标签栏和底栏这两小块的颜色，
  // 不再改 <html> 上的变量——那会让整个文档重算样式、两整页的文字全部重画，是滑动掉帧的主要来源。颜色定下来时才统一写回 <html>。
  const scoped = () => { try { return isMob(); } catch { return false; } };
  // 页上覆盖所有会变的颜色变量（含色块 --palsw）：<html> 上的变量定下来时，页的计算样式不变，浏览器不用重算整页
  const fullVars = (c, dark) => { const v = vars(c, dark); if (!c) { const b = BASE[dark ? 'dark' : 'light']; for (const k of Object.keys(b)) v['--' + k] = b[k]; } v['--palsw'] = c ? toHex(target(c, dark)) : 'transparent'; return v; };
  function setVars(el, v) { const pv = el._pv || (el._pv = {}); for (const [k, x] of Object.entries(v)) { if ((pv[k] || '') === (x || '')) continue; pv[k] = x || ''; if (x) el.style.setProperty(k, x); else el.style.removeProperty(k); } }
  function clearVars(el) { if (!el?._pv) return; for (const k of Object.keys(el._pv)) el.style.removeProperty(k); el._pv = null; }
  // c 不传 = 按这一页所属窗口取颜色；传 null = 不染色（用主题原色）
  function paintPage(el, t, c) {
    if (!el) return;
    if (!scoped()) { clearVars(el); return; }
    setVars(el, fullVars(c === undefined ? ofTab(t) : c, document.documentElement.dataset.theme === 'dark'));
  }
  // 每一页永远只用自己窗口的颜色。唯一例外：调色板面板开着时，当前页跟着实时预览的颜色走。
  // （松手过渡的最后一帧可能比换角色早几毫秒——那时 #view 还是旧页，绝不能把新颜色刷到旧页上：整页重算样式 + 闪一帧错色）
  function paintPages(cur) {
    const v = document.getElementById('view');
    if (v) { const own = Tabs.list.find(t => t.key === UI.pane?.key) || Tabs.cur; paintPage(v, own, document.getElementById('palpop') && own === Tabs.cur ? cur : undefined); }
    try { for (const P of Pager.panes.values()) paintPage(P.el, Tabs.list.find(t => t.key === P.key)); } catch {}
  }
  const chromeEls = () => [document.getElementById('tabs'), document.getElementById('bar'), document.querySelector('.active-frame')].filter(Boolean);
  // 标签小卡片的颜色（没染色的窗口返回 null，保持默认样式）：比页面底色更浓一些，深色下也能一眼分清
  function chip(t) {
    const c = ofTab(t); if (!c) return null;
    const dark = document.documentElement.dataset.theme === 'dark', v = vars(c, dark);
    // 就是这个窗口页面的颜色：没选中 = 它的 --bg3（比页面底色略深 / 深色下略浅），选中 = 它的 --card
    return { bg: v['--bg3'], on: v['--card'], sig: [c.h, c.s, c.l, c.a, dark ? 1 : 0].map(x => Math.round(x)).join(',') };
  }

  // 值没变的变量不再 setProperty（每次 setProperty 都会让整页样式重算）；拖动 / 过渡的中间帧不同步系统栏（getComputedStyle + 跨进程），只在定下来时同步
  const painted = {};
  function paintVars(c, final) {
    const dark = document.documentElement.dataset.theme === 'dark';
    if (scoped()) {
      // 手机：页和标签栏 / 底栏自己带颜色变量，马上就是最终颜色；
      const v = fullVars(c, dark); for (const el of chromeEls()) setVars(el, v);
      if (!final) return;   // 中间帧：只动标签栏 / 底栏（小块，约 1ms）
      paintPages(c);
      // <html> 上的变量（侧栏 / 面板 / 弹窗用，滑动时都看不见）：改任何一个根变量浏览器都会重算整个文档的样式（侧栏几千个节点，手机上 20ms+），
      // 放在动画结束后空闲时再写，正在滑就继续等——不会卡在滑动的最后几帧上
      rootC = c; clearTimeout(rootT); rootT = setTimeout(flushRoot, 320);
      return;
    }
    clearTimeout(rootT); rootT = 0;
    for (const el of chromeEls()) clearVars(el);
    paintPages(c);
    writeRoot(c, dark);
  }
  let rootT = 0, rootC = null;
  function flushRoot() {
    rootT = 0;
    let busy = false; try { busy = Mob.busy(); } catch {}
    if (busy) { rootT = setTimeout(flushRoot, 250); return; }
    const go = () => { try { if (Mob.busy()) { rootT = setTimeout(flushRoot, 250); return; } } catch {} writeRoot(rootC, document.documentElement.dataset.theme === 'dark'); for (const el of chromeEls()) clearVars(el); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 900 }); else go();
  }
  function writeRoot(c, dark) {
    const st = document.documentElement.style;
    const all = { ...vars(c, dark), '--palsw': c ? toHex(target(c, dark)) : 'transparent' };
    for (const [k, v] of Object.entries(all)) { if ((painted[k] || '') === (v || '')) continue; painted[k] = v || ''; if (v) st.setProperty(k, v); else st.removeProperty(k); }
    if (document.documentElement.hasAttribute('data-tint') !== !!c) document.documentElement.toggleAttribute('data-tint', !!c);
    const b = document.getElementById('palbtn'), sw = c ? toHex(target(c, dark)) : 'transparent'; if (b && b.style.getPropertyValue('--sw') !== sw) b.style.setProperty('--sw', sw);
    clearTimeout(apply.t); apply.t = setTimeout(() => { try { Chrome.apply(); } catch {} }, 30);
  }

  // ---- 切换窗口时的颜色过渡：两个颜色之间走色相环上最短的那段，饱和度 / 明度 / 透明度线性过渡 ----
  let shown = null, tw = 0;
  const stopTw = () => { if (tw) cancelAnimationFrame(tw); tw = 0; };
  const keyFor = t => t ? (t.sid && (valid(map[t.sid]) || valid(auto[t.sid]) || !valid(auto[t.key])) ? t.sid : t.key) : 'none';
  const ofTab = t => (Prefs.palOff ? null : of(keyFor(t)));
  function lerp(a, b, k) {
    if (!a && !b) return null;
    // 一边不染色：当成同色相、完全透明的染色，颜色是「淡出 / 淡入」而不是换色
    if (!a) a = { ...b, a: 100 }; if (!b) b = { ...a, a: 100 };
    const dh = ((+b.h - +a.h) % 360 + 540) % 360 - 180;
    return { h: (+a.h + dh * k + 360) % 360, s: +a.s + (b.s - a.s) * k, l: +a.l + (b.l - a.l) * k, a: +a.a + (b.a - a.a) * k };
  }
  const same = (a, b) => (!a && !b) || (a && b && Math.abs(a.h - b.h) < 0.5 && Math.abs(a.s - b.s) < 0.5 && Math.abs(a.l - b.l) < 0.5 && Math.abs(a.a - b.a) < 0.5);
  let rafC = null, rafT = 0;
  const paintSoon = c => { rafC = c; if (!rafT) rafT = requestAnimationFrame(() => { rafT = 0; paintVars(rafC); }); };
  // 拖动中：当前窗口的颜色 → 相邻窗口的颜色，按拖动比例 k（0~1）实时混合
  function drag(nextTab, k) {
    stopTw(); const cur = ofTab(Tabs.cur), nx = ofTab(nextTab);
    if (!cur && !nx) { if (shown) { shown = null; paintSoon(null); } return; }   // 两边都没染色：什么都不做
    k = Math.max(0, Math.min(1, k));
    if (nextTab === lastNx && lastK >= 0 && Math.abs(k - lastK) < 0.02) return;   // 变化不到 2% 的帧不重画（看不出台阶）
    lastK = k; lastNx = nextTab;
    const c = lerp(cur, nx, k); shown = c; paintSoon(c);
  }
  // 从现在显示的颜色平滑过渡到目标颜色（松手后跟着页面滑动一起走完；点标签切换也一样）
  function tween(to, ms = 240) {
    stopTw(); lastK = -1; const from = shown;
    if (same(from, to) || ms <= 0) { apply(to); return; }
    const t0 = performance.now(), ease = x => 1 - Math.pow(1 - x, 3);
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      if (k >= 1) { tw = 0; apply(to); return; }
      shown = lerp(from, to, ease(k)); paintVars(shown); tw = requestAnimationFrame(tick);
    };
    tw = requestAnimationFrame(tick);
  }
  // 换窗口后调用：已经在过渡中 / 颜色不一样 → 渐变过去；一样 → 直接定下来
  function show(ms = 240) { const to = of(); if (tw || !same(shown, to)) tween(to, ms); else apply(to); }
  function save(key, c) {
    const v = { h: Math.round(c.h), s: Math.round(c.s), l: Math.round(c.l), a: Math.round(c.a) };
    map[key] = v; const ks = Object.keys(map); if (ks.length > 800) delete map[ks[0]];
    Store.set('pal:chats', map); Prefs.palLast = v; Prefs.palOff = false; savePrefs();
  }
  // 弹出面板
  function open(anchor) {
    document.getElementById('palpop')?.remove();
    const key = keyOf(); let c = { ...(of(key) || random(key)) }; delete c.auto;
    const r = anchor.getBoundingClientRect();
    const pop = h('div', { id: 'palpop', class: 'palpop', style: { top: r.bottom + 6 + 'px', right: Math.max(8, innerWidth - r.right) + 'px' } });
    const sw = h('div', { class: 'pal-sw' }), vals = {};
    const paint = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      sw.style.background = `linear-gradient(90deg, ${toHex(target(c, false))}, ${toHex(target(c, true))})`;
      for (const k of Object.keys(vals)) vals[k].textContent = k === 'h' ? c.h + '°' : c[k] + '%';
      hueBar.style.background = 'linear-gradient(90deg,' + [0, 60, 120, 180, 240, 300, 360].map(x => toHex(hsl2rgb(x, Math.max(c.s, 30), dark ? 40 : 60))).join(',') + ')';
      satBar.style.background = `linear-gradient(90deg, ${toHex(hsl2rgb(c.h, 0, 60))}, ${toHex(hsl2rgb(c.h, 100, 55))})`;
      alBar.style.background = `linear-gradient(90deg, ${toHex(target(c, dark))}, ${BASE[dark ? 'dark' : 'light'].bg})`;
      litBar.style.background = `linear-gradient(90deg, ${toHex(target({ ...c, l: 0 }, dark))}, ${toHex(target({ ...c, l: 100 }, dark))})`;
    };
    let saveT = 0;
    const live = () => { apply(c); paint(); clearTimeout(saveT); saveT = setTimeout(() => save(key, c), 250); };
    const slider = (k, label, max, tip) => {
      const inp = h('input', { type: 'range', min: 0, max, value: c[k], oninput: e => { c[k] = +e.target.value; live(); } });
      vals[k] = h('b', { class: 'mono' });
      return [h('label', { class: 'pal-row', title: tip }, h('span', {}, label), vals[k]), inp];
    };
    const [hl, hueBar] = slider('h', '色相', 360, '颜色'), [sl, satBar] = slider('s', '饱和度', 100, '越高越鲜艳'), [ll, litBar] = slider('l', '明度', 100, '深色模式下在深色范围里调，浅色模式下在浅色范围里调'), [al, alBar] = slider('a', '透明度', 100, '越高颜色越淡（100% = 不染色）');
    const themeSw = h('div', { class: 'pal-mode' }, ...[['light', '浅色', 'sun'], ['dark', '深色', 'moon']].map(([m, l, ic]) => h('button', { class: document.documentElement.dataset.theme === m ? 'on' : '', onclick: e => { Prefs.theme = m; savePrefs(); UI.applyTheme(); pop.querySelectorAll('.pal-mode button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); paint(); } }, icon(ic), l)));
    pop.append(
      h('div', { class: 'pal-h' }, h('b', {}, '调色板'), tipI('给整个窗口染色，深色 / 浅色自动换成同色相的深 / 浅色。颜色按对话保存：设过的对话用自己的；没设过的用最近一次保存的颜色；从没设过时每个对话随机一个低饱和度颜色（透明度 80%）。'), h('span', { class: 'grow' }), themeSw),
      sw, hl, hueBar, sl, satBar, ll, litBar, al, alBar,
      h('div', { class: 'pal-f' },
        h('button', { class: 'btn sm ghost', onclick: () => { const x = fresh(); c = { h: x.h, s: x.s, l: 50, a: c.a }; [['h', hueBar], ['s', satBar], ['l', litBar], ['a', alBar]].forEach(([k, el]) => { el.value = c[k]; }); live(); } }, '随机'),
        h('button', { class: 'btn sm ghost', title: '所有对话都不染色（再次调整任意滑块即恢复）', onclick: () => { Prefs.palOff = true; savePrefs(); apply(null); pop.remove(); } }, '不染色'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => { save(key, c); pop.remove(); toast('已保存颜色'); } }, '完成')));
    document.body.append(pop); paint(); if (typeof placeInward === 'function') placeInward(pop, r, { pad: 8, gap: 6, keepWidth: true });
    setTimeout(() => { const off = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  }
  return { apply, open, of, random, drag, tween, show, ofTab, lerp, paintPage, chip, target: (c, d) => toHex(target(c, d)) };
})();


// ---------- 客户端扩展程序弹窗（右上角调色板旁 #extbtn，与浏览器模式共用扩展能力） ----------
const ExtPop = {
  entries: [],
  iconNode(e) {
    if (e?.icon) return h('img', { class: 'extp-ic', src: e.icon, alt: '' });
    const ch = Array.from(String(e?.name || '?').trim())[0]?.toUpperCase() || 'E';
    return h('span', { class: 'extp-ic txt' }, ch);
  },
  renderPins(list) {
    const box = document.getElementById('extpins');
    if (!box) return;
    const pinned = (Array.isArray(list) ? list : []).filter(e => e && e.pinned && e.enabled && e.loaded);
    box.replaceChildren(...pinned.map(e => h('button', {
      type: 'button',
      class: 'ib nodrag ext-pin-btn',
      title: e.name + '（点击运行扩展）',
      'aria-label': e.name,
      onclick: ev => { ev.stopPropagation(); this.activate(e); }
    }, this.iconNode(e))));
  },
  async refreshPins() {
    try {
      if (!window.BranaBrowser?.extensionList) return;
      const r = await window.BranaBrowser.extensionList();
      this.entries = Array.isArray(r?.entries) ? r.entries : [];
      this.renderPins(this.entries);
    } catch {}
  },
  async activate(e) {
    if (!window.BranaBrowser?.extensionActivate) { toast('当前环境暂不支持直接激活扩展', 'err'); return; }
    try {
      await window.BranaBrowser.extensionActivate(e.key);
      document.getElementById('extpop')?.remove();
    } catch (err) {
      toast(err?.message || '该扩展当前无法打开', 'err');
    }
  },
  async manage() {
    document.getElementById('extpop')?.remove();
    if (window.BranaBrowser?.extensions) {
      try { await window.BranaBrowser.extensions(); } catch (err) { toast(err?.message || '打开扩展管理失败', 'err'); }
      return;
    }
    toast('请在桌面客户端中使用扩展程序管理', 'err');
  },
  open(anchor) {
    const old = document.getElementById('extpop'); if (old) { old.remove(); return; }
    document.getElementById('palpop')?.remove();
    const listBox = h('div', { class: 'extp-list' });
    const statusBox = h('div', { class: 'extp-status', hidden: true });
    const countBadge = h('span', { class: 'badge dim extp-cnt' }, '加载中…');
    const setStatus = txt => { statusBox.textContent = txt || ''; statusBox.hidden = !txt; };

    const paintList = entries => {
      const list = Array.isArray(entries) ? entries : [];
      this.entries = list;
      this.renderPins(list);
      const activeCnt = list.filter(x => x.enabled && x.loaded).length;
      countBadge.textContent = list.length ? `${activeCnt}/${list.length} 已启用` : '未安装';
      if (!list.length) {
        listBox.replaceChildren();
        setStatus('暂未安装扩展程序。点击下方「管理与安装扩展」可加载解压扩展目录或安装 .zip / .crx 扩展包（客户端与浏览器模式通用）。');
        return;
      }
      setStatus('');
      listBox.replaceChildren(...list.map(e => {
        const canRun = !!(e.enabled && e.loaded && e.action);
        const stateLabel = !e.enabled ? '已停用' : !e.loaded ? '加载失败' : e.action === 'popup' ? '弹窗' : e.action ? '页面' : '常驻脚本';
        const stateCls = !e.enabled ? 'off' : !e.loaded ? 'bad' : 'ok';
        const launchBtn = h('button', {
          type: 'button',
          class: 'extp-launch',
          disabled: !canRun,
          title: canRun ? `点击打开 ${e.name}` : `${e.name}（${stateLabel}）`,
          onclick: () => this.activate(e)
        },
          this.iconNode(e),
          h('span', { class: 'extp-name' }, e.name),
          h('span', { class: 'extp-tag ' + stateCls }, stateLabel));
        const pinBtn = h('button', {
          type: 'button',
          class: 'ib extp-pin' + (e.pinned ? ' on' : ''),
          'aria-pressed': e.pinned ? 'true' : 'false',
          title: e.pinned ? '取消固定到顶栏' : '固定到右上角顶栏',
          onclick: async ev => {
            ev.stopPropagation();
            if (!window.BranaBrowser?.extensionPin) return;
            try {
              const r = await window.BranaBrowser.extensionPin(e.key, !e.pinned);
              paintList(r?.entries || []);
            } catch (err) { setStatus(err?.message || '固定扩展失败'); }
          }
        }, icon('pin'));
        return h('div', { class: 'extp-row' }, launchBtn, pinBtn);
      }));
    };

    const pop = h('div', { id: 'extpop', class: 'palpop extpop', onclick: e => e.stopPropagation() },
      h('div', { class: 'pal-h extp-h' },
        icon('ext'),
        h('b', {}, '扩展程序'),
        countBadge,
        h('span', { class: 'grow' }),
        h('button', { class: 'ib', title: '刷新扩展列表', onclick: () => load() }, icon('retry')),
        h('button', { class: 'ib', title: '关闭', onclick: () => pop.remove() }, icon('x'))),
      statusBox,
      listBox,
      h('div', { class: 'pal-f extp-f' },
        h('button', { type: 'button', class: 'btn pri sm extp-mgr', onclick: () => this.manage() }, icon('gear'), '管理与安装扩展程序')));

    document.body.append(pop);
    const r = anchor?.getBoundingClientRect?.() || { right: innerWidth - 16, bottom: 48, left: innerWidth - 120, top: 12, width: 28, height: 28 };
    if (typeof placeInward === 'function') placeInward(pop, r, { pad: 8, gap: 6 });
    const close = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor?.contains?.(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);

    const load = async () => {
      if (!window.BranaBrowser?.extensionList) {
        countBadge.textContent = '就绪';
        setStatus('当前窗口支持扩展注入；点击下方按钮管理扩展程序。');
        return;
      }
      try {
        const res = await window.BranaBrowser.extensionList();
        paintList(res?.entries || []);
      } catch (err) {
        countBadge.textContent = '读取失败';
        setStatus(err?.message || '读取扩展列表失败');
      }
    };
    void load();
  }
};
