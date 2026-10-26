const UI = {
  modelIds:new WeakMap(),modelSeq:0,
  modelStamp(model){if(!model)return 0;let id=this.modelIds.get(model);if(!id){id=++this.modelSeq;this.modelIds.set(model,id);}return id;},
  me: null, host: null, accounts: [], scrolls: new Map(), modelsV: 0, opens: new Map(), hitlDraft: new Map(), atts: new Map(),
  build() {
    // 先摘下扩展挂进来的节点（见上方 ExtensionNodes），界面搭好后挂回去
    const kept = ExtensionNodes.detach(document);
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><title>Brana AI</title></head><body></body>';
    this.watchDrawer?.();   // <body> 刚被整个换掉：把抽屉监听重新挂到新 body 上
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); try { CSS = ''; } catch {}
    window.__ANC_CLIENT_SHELL = true;
    document.documentElement.dataset.platform = Host.platform + (/Mac/.test(navigator.platform) ? ' mac' : '');
    this.applyTheme();
    const logo = h('button', { type: 'button', class: 'brand brand-btn nodrag', title: '切换为浏览器模式：用当前账号的网络环境和指纹直接打开官网原生页面', 'aria-label': '切换为浏览器模式', onclick: () => this.browserModeAsk() }); logo.innerHTML = BRANA_LOGO;
    document.body.append(h('div', { id: 'app' },
      h('div', { id: 'row' },
        h('aside', { id: 'sb', 'data-sidebar': 'sidebar' },
          h('div', { class: 'sb-top drag' }, logo, h('div', { class: 'sb-actions' }, this.archDelBtn()), h('span', { class: 'grow' })),
          h('div', { class: 'sb-nav', style: { position: 'relative' } },
            h('button', { class: 'nav', onclick: () => { Tabs.newChat(); this.closeDrawer(); } }, icon('plus'), h('span', {}, '新对话'), h('kbd', {}, 'Ctrl T')),
            h('a', { href: '/agent', 'aria-label': 'New Chat', class: 'ext-newchat-link', tabindex: '-1', onclick: e => { e.preventDefault(); e.stopPropagation(); Tabs.newChat(); this.closeDrawer(); } }, 'New Chat'),
            h('div',{class:'history-search'},h('label', { class: 'nav search' }, icon('search'), h('input', { id: 'q', placeholder: '搜索名称、备注', 'aria-label':'搜索对话名称、备注', oninput: () => this.searchListSoon() }),
              h('select',{id:'history-scope','aria-label':'搜索范围',title:'搜索普通对话还是归档',onchange:e=>{SideTools.setScope(e.target.value);document.querySelector('#q')?.focus();}},h('option',{value:'active'},'对话'),h('option',{value:'archived'},'归档'))))),
          h('div',{id:'selection-bar',hidden:true,'aria-label':'批量操作'}),
          h('div', { class: 'list', id: 'list', role:'listbox', 'aria-label':'对话列表','aria-multiselectable':'true', onscroll: e => { const l = e.target; if (SideTools.scope==='active' && l.scrollTop + l.clientHeight > l.scrollHeight - 200) History.more(); } }),
          h('div', { id: 'sbgrip', title: '拖动调整侧栏宽度（双击恢复默认）' }),
          h('div', { class: 'sb-foot' },
            h('button', { class: 'acct', id: 'acct', onclick: e => this.acctMenu(e) }, h('div', { class: 'av' }, 'A'), h('div', { class: 'acct-t' }, h('div', { class: 'acct-n' }, '…'), h('div', { class: 'acct-s' }, ''))),
            // 手机：账号旁边放调色板和设置
            h('button', { class: 'ib sbf-m sbf-thm', title: '切换主题（自动 / 浅色 / 深色）', 'aria-label': '切换主题', onclick: () => { const order = ['auto', 'light', 'dark']; Prefs.theme = order[(order.indexOf(Prefs.theme || 'auto') + 1) % order.length]; savePrefs(); this.applyTheme(); } }, icon('sun')),
            h('button', { class: 'ib sbf-m sbf-pal', title: '调色板：给窗口染色（按对话保存）', 'aria-label': '调色板', onclick: e => Palette.open(e.currentTarget) }, icon('palette')),
            h('button', { class: 'ib sbf-m sbf-ext', title: '扩展程序（客户端与浏览器模式通用）', 'aria-label': '扩展程序', onclick: e => ExtPop.open(e.currentTarget) }, icon('ext')),
            h('button', { class: 'ib sbf-m sbf-set', title: '设置', 'aria-label': '设置', onclick: () => { this.closeDrawer(); this.settings(); } }, icon('gear')))),   // 刷新在底部栏（额度旁）
        h('div', { id: 'scrim', onclick: () => this.closeDrawer() }),
        h('main', { id: 'main' },
          h('div', { id: 'tabs', class: 'drag' }, h('button', { class: 'ib burger nodrag', id: 'sbbtn', title: '收起 / 展开侧栏', onclick: () => { if (isMob()) { document.body.classList.toggle('drawer'); if (Dock.mOpen) { Dock.mOpen = false; this.layout(); } } else this.toggleSidebar(); } }, icon('side')), h('div', { id: 'tablist', class: 'nodrag' }), h('button', { class: 'ib nodrag', id: 'newtabbtn', title: '新标签 (Ctrl+T)', onclick: () => Tabs.newChat() }, icon('plus')),
            h('button', { class: 'ib nodrag', id: 'swbtn', title: '已打开的窗口（切换 / 关闭）', onclick: () => TabSw.open() }, icon('dots')), h('span', { class: 'grow' }),
            this.themeSeg(),
            h('button', { class: 'ib nodrag', id: 'palbtn', title: '调色板：给窗口染色（按对话保存）', onclick: e => Palette.open(e.currentTarget) }, icon('palette')),
            h('div', { id: 'extpins', class: 'ext-pins nodrag' }),
            h('button', { class: 'ib nodrag', id: 'extbtn', title: '扩展程序（客户端与浏览器模式通用）', 'aria-label': '扩展程序', onclick: e => ExtPop.open(e.currentTarget) }, icon('ext')),
            h('button', { class: 'ib nodrag', id: 'themebtn', title: '切换深色 / 浅色', onclick: () => { Prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; savePrefs(); this.applyTheme(); } }, icon('moon')),
            h('button', { class: 'ib nodrag', id: 'dockbtn', title: '模型信息面板', onclick: () => Dock.toggle() }, icon('panel'))),
          h('div', { id: 'body' },
            h('div', { id: 'view' }),
            h('aside', { id: 'ws' }),
            h('aside', { id: 'pv', 'aria-label': '内嵌预览' }),
            h('div', { id: 'dockwrap' }, h('button', { id: 'dockfold', title: '收起 / 展开模型信息', onclick: () => Dock.toggle() }, icon('chevr')), h('div', { id: 'dockgrip', title: '拖动调整宽度' }), h('aside', { id: 'dock' }))))),
      h('div', { id: 'bar' }),
      // 手机：模型信息面板收在右边缘，平时只露一个小圆点头，点一下 / 从右边缘往左滑展开
      h('button', { id: 'dockhandle', type: 'button', title: '模型信息（可上下拖拽调整位置）', 'aria-label': '模型信息', onclick: e => { if (e.currentTarget?.dataset?.dragged === '1') { e.currentTarget.dataset.dragged = ''; return; } Dock.toggle(true); } }, h('span', { class: 'dh-mark' }, '>'))));
    try { if (typeof Mob !== 'undefined' && typeof Mob.initDockHandle === 'function') Mob.initDockHandle(); } catch {}
    ExtensionNodes.restore(document, kept);
    this.paintThemeSeg(); try { ExtPop.refreshPins(); } catch {} try { WS.mount($('#ws')); } catch (e) { console.error(e); } try { HtmlPreview.mount($('#pv')); } catch (e) { console.error(e); } try { Dock.mount($('#dock')); } catch (e) { console.error(e); } try { Bar.mount($('#bar')); } catch (e) { console.error(e); } try { Mag.bind($('#list')); } catch (e) { console.error(e); }
    this.grip(); this.sbGrip(); this.dragBar(); this.layout(); ActiveFrame.mount();
    document.addEventListener('keydown', e => this.keys(e));
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'); if (c) { copyText(c.closest('.code').querySelector('code').textContent); return; }
      const a = e.target.closest('a[href]');
      if (a && !a.hasAttribute('download')) {
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) { e.preventDefault(); return; }
        if (/^(https?:|mailto:)/i.test(a.href) && !a.href.startsWith(location.origin + '/robots.txt')) {
          e.preventDefault();
          // Brana 对话链接直接在客户端里打开
          const m = /^https:\/\/(?:www\.)?(?:arena\.ai|lmarena\.ai)\/(?:agent|c)\/([0-9a-f][0-9a-f-]{15,})/i.exec(a.href);
          if (m) { Tabs.open(m[1]); return; }
          if (/^https:\/\/(?:www\.)?(?:arena\.ai|lmarena\.ai)\/agent\/?$/i.exec(a.href)) { Tabs.newChat(); return; }
          Host.openExternal(a.href);
          return;
        }
      }
      if (!e.target.closest('.menu, #gpop, .rv') && now() - (this._menuOpenAt || 0) >= 450) document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.applyTheme());
    addEventListener('resize', () => { clearTimeout(this.rsT); this.rsT = setTimeout(() => this.layout(), 100); });
  },
  // 布局：侧栏 / 工作区 / 模型信息面板的显示与宽度
  layout() {
    const b = document.body, t = Tabs.cur, chat = t && !t.kind && t.sid;
    // 手机：竖屏按宽度；横屏（触屏且短边 ≤ 540）也按手机布局
    const coarse = matchMedia('(pointer:coarse)').matches, m = innerWidth <= 760 || (coarse && Math.min(innerWidth, innerHeight) <= 540), wide = !m;
    b.classList.toggle('m', m); b.classList.toggle('m-land', m && innerWidth > innerHeight && innerHeight <= 540);
    // 手机 ↔ 桌面布局切换（平板旋转 / 拉宽窗口）：相邻的预搭页只在手机布局里存在
    if (m !== this.wasM) { const was = this.wasM; this.wasM = m; try { if (!m) { if (Mob.busy()) Mob.flush(); Pager.clear(); } else Pager.ensureSoon(); if (was !== undefined) Palette.apply(); } catch {} }
    if (!m) b.classList.remove('drawer');
    b.classList.toggle('sb-off', wide && Prefs.sbOff === true);
    if (HtmlPreview.on() && HtmlPreview.sid() !== (chat || null)) HtmlPreview.close();   // 换了窗口：预览收起，面板恢复
    b.classList.toggle('pv-on', HtmlPreview.on());
    b.classList.toggle('dock-off', wide ? !Dock.open : !Dock.mOpen);
    b.classList.toggle('ws-off', !WS.shown || !chat || (wide && innerWidth < 900));   // 工作区悬浮，不再挤对话列，窄一些的窗口也能开
    document.documentElement.style.setProperty('--sbw', Math.max(200, Math.min(520, Prefs.sbW || 252)) + 'px');
    document.documentElement.style.setProperty('--dockw', Math.max(260, Math.min(520, Prefs.dockW || 300)) + 'px');
    $('#dockbtn')?.classList.toggle('on', wide ? Dock.open : !!Dock.mOpen);
    try { Dock.render(); } catch (e) { console.error(e); } try { WS.render(); } catch (e) { console.error(e); }
  },
  sbGrip() {
    const g = $('#sbgrip'); if (!g) return;
    g.addEventListener('dblclick', () => { Prefs.sbW = 252; savePrefs(); this.layout(); });
    g.addEventListener('pointerdown', e => {
      if (isMob()) return;
      e.preventDefault(); g.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = Prefs.sbW || 252; document.body.classList.add('resizing');
      const mv = ev => { Prefs.sbW = Math.max(200, Math.min(520, w0 + (ev.clientX - x0))); document.documentElement.style.setProperty('--sbw', Prefs.sbW + 'px'); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); savePrefs(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  },
  toggleSidebar() { Prefs.sbOff = !Prefs.sbOff; savePrefs(); this.layout(); },
  grip() {
    const g = $('#dockgrip'); if (!g) return;
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); g.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = Prefs.dockW || 300; document.body.classList.add('resizing');
      const mv = ev => { Prefs.dockW = Math.max(260, Math.min(520, w0 + (x0 - ev.clientX))); document.documentElement.style.setProperty('--dockw', Prefs.dockW + 'px'); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); savePrefs(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  },
  applyTheme() { const dark = Prefs.theme === 'dark' || (Prefs.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; const tb = $('#themebtn'); if (tb) tb.replaceChildren(icon(dark ? 'sun' : 'moon')); try { Palette.apply(); } catch {} this.paintThemeSeg?.(); setTimeout(() => Chrome.apply(), 0); },
  // 主题：一个按钮，点一下轮流切换 跟随系统 → 浅色 → 深色（手机在侧栏顶部 logo 右边；默认跟随系统）
  THEMES: [['auto', 'halfc', '跟随'], ['light', 'sun', '浅色'], ['dark', 'moon', '深色']],
  themeSeg() {
    const btn = h('button', { type: 'button', class: 'on', title: '主题', 'aria-label': '主题', onclick: () => {
      const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), n = L[(i + 1) % L.length];
      Prefs.theme = n[0]; savePrefs(); this.applyTheme();
      try { if (isMob()) Mob.hint('主题：' + (n[0] === 'auto' ? '跟随系统' : n[2])); } catch {}
    } });
    const seg = h('div', { class: 'thseg nodrag', id: 'thseg' }, btn);
    return seg;
  },
  themeKey() { return ['light', 'dark'].includes(Prefs.theme) ? Prefs.theme : 'auto'; },
  // 主题按钮旁边：一键删除本账号所有已归档的对话（先统计数量，确认后批量删除）
  // 电脑：整个顶栏（logo、主题 / 归档 / 删除按钮、标签栏两边的按钮）都能按住拖动窗口。
  // 空白处走系统拖动区域；按钮上按下后移动超过 6px 就改成移动窗口（松手那一下不算点击），不动就是正常点击。标签自己由 TabPress 处理。
  dragBar() {
    if (Host.platform !== 'desktop' || typeof Host.winDrag !== 'function') return;
    let st = null;
    const end = () => {
      if (!st) return; const s0 = st; st = null;
      try { s0.el.releasePointerCapture?.(s0.pid); } catch {}
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', end, true); removeEventListener('blur', end);
      if (s0.on) { Host.winDrag('end')?.catch?.(() => {}); document.body.classList.remove('wdrag'); }
      return s0;
    };
    const mv = e => { if (!st) return; if (!e.buttons) { up(); return; } if (st.on) return; if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) { st.on = true; document.body.classList.add('wdrag'); Host.winDrag('start')?.catch?.(() => {}); } };
    const up = () => {
      const s0 = end(); if (!s0?.on) return;
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      addEventListener('click', kill, true); setTimeout(() => removeEventListener('click', kill, true), 80);
    };
    const down = e => {
      if (e.button !== 0 || e.pointerType === 'touch' || isMob() || st) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest('.tab, input, textarea, select, [contenteditable], .menu, .dlg-back, #sbgrip')) return;
      st = { x: e.clientX, y: e.clientY, on: false, el: t, pid: e.pointerId };
      try { t.setPointerCapture(e.pointerId); } catch {}
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', end, true); addEventListener('blur', end);
    };
    for (const z of [$('#sb .sb-top'), $('#tabs')]) z?.addEventListener('pointerdown', down);
  },
  // 左上角：一键归档（按归档黑名单关键词）+ 删除归档（按厂商选）；跑的时候按钮上显示进度
  archDelBtn() {
    const al = h('span', { class: 'sr-only', hidden: true }, ''), dl = h('span', { class: 'sr-only', hidden: true }, '');
    const tb = h('button', { type: 'button', class: 'on icon-only mob-thm-btn', id: 'thbtn-mob', title: '切换主题', 'aria-label': '切换主题', onclick: () => {
      const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), n = L[(i + 1) % L.length];
      Prefs.theme = n[0]; savePrefs(); this.applyTheme();
      try { if (isMob()) Mob.hint('主题：' + (n[0] === 'auto' ? '跟随系统' : n[2])); } catch {}
    } }, icon('halfc'));
    const ab = h('button', { type: 'button', class: 'on icon-only', title: '一键归档：名称含归档黑名单关键词的对话全部归档', 'aria-label': '一键归档', onclick: () => Bulk.archBl() }, icon('archive'), al);
    const db = h('button', { type: 'button', class: 'on icon-only', title: '删除已归档的对话（按厂商选择）', 'aria-label': '删除归档', onclick: () => Bulk.delArchived() }, icon('trash'), dl);
    this.adLab = { arch: al, del: dl }; this.adPaintBtn?.();
    return h('div', { class: 'thseg arseg nodrag' }, tb, ab, db);
  },
  delArchived() { return Bulk.delArchived(); },
  get ad() { return Bulk.running('del'); },
  adStart(ids, resumed) { return Bulk.start('del', ids, resumed); },
  adDialog() { Bulk.dialog('del'); },
  adPaintBtn() {
    const L = this.adLab; if (!L) return;
    for (const kind of ['arch', 'del']) {
      const q = Bulk.running(kind), lab = L[kind], K = Bulk.K[kind]; if (!lab) continue;
      const btn = lab.parentElement;
      const pct = q && q.total > 0 ? Math.min(100, Math.round(((q.done + q.fail) / q.total) * 100)) : 0;
      lab.textContent = '';
      btn?.classList.toggle('bj-run', !!q);
      if (btn) {
        if (q) btn.style.setProperty('--bj-pct', pct + '%');
        else btn.style.removeProperty('--bj-pct');
        btn.setAttribute('title', q ? '正在' + K.verb + ' ' + (q.done + q.fail) + '/' + q.total + ' (' + pct + '%)' + (q.until > now() ? ' · 等待限流解除' : '') + '，点开查看进度' : kind === 'arch' ? '一键归档：名称含归档黑名单关键词的对话全部归档' : '删除已归档的对话（按厂商选择）');
      }
    }
  },
  paintThemeSeg() {
    const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), [k, ic, lab] = L[i], nx = L[(i + 1) % L.length];
    const ttl = '主题：' + (k === 'auto' ? '跟随系统' : lab) + '（点一下切换为' + (nx[0] === 'auto' ? '跟随系统' : nx[2]) + '）';
    document.querySelectorAll('#thseg button').forEach(b => { b.dataset.k = k; b.replaceChildren(icon(ic), h('span', {}, lab)); b.title = ttl; });
    document.querySelectorAll('#thbtn-mob').forEach(b => { b.dataset.k = k; b.replaceChildren(icon(ic)); b.title = ttl; });
  },
  closeDrawer() { document.body.classList.remove('drawer'); if (Dock.mOpen) { Dock.mOpen = false; this.layout(); } },
  keys(e) {
    if(e.key==='Escape'&&CardSelect.mode&&!document.querySelector('.dlg-back:not(.anc-gh),.modal-back:not(.anc-gh),.menu:not(.anc-gh)')){CardSelect.clear();this.renderList();return;}
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); Tabs.newChat(); }
    else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); Tabs.openGacha(); }
    else if (e.ctrlKey && e.altKey && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); this.switchNth(+e.code.slice(5)); }
    else if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); if (Tabs.active) Tabs.close(Tabs.active); }
    else if (mod && e.key === 'Tab') { e.preventDefault(); Tabs.cycle(e.shiftKey ? -1 : 1); }
    else if (mod && /^[1-9]$/.test(e.key)) { const t = Tabs.list[+e.key - 1]; if (t) { e.preventDefault(); Tabs.focus(t.key); } }
    else if (e.key === 'Escape') {
      const ms = document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)'); ms.forEach(m => m.remove());
      // 没有菜单、没有对话框时 Esc 关最上面的弹窗（正在输入框里打字时不关，免得丢掉填了一半的内容）
      if (!ms.length && !document.querySelector('.dlg-back:not(.anc-gh)')) {
        const all = document.querySelectorAll('.modal-back:not(.anc-gh):not(.out)'), m = all[all.length - 1], a = document.activeElement;
        if (m && !m.dataset.busy && !(a && m.contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable]'))) {
          const b = [...m.querySelectorAll('.modal-f button, .modal-h button')].find(x => /^(取消|关闭|完成|×)$/.test(x.textContent.trim()) || x.classList.contains('x'));
          if (b) b.click(); else m.remove();
        }
      }
    }
  },

  // ----- 账号区 -----
  renderAcct() {
    const a = this.host?.account || {}, me = this.me, cur = typeof Bar !== 'undefined' ? Bar.cur : null;
    const email = a.email || me?.email || cur?.email || '';
    // 头像 = 余额饼图、第二行 = 备注 + 余额：由 Bar.paintCard 画（余额变化时跟着底栏一起刷新）
    $('#acct .acct-n').textContent = email ? emailUser({ email }) : (a.name || cur?.name || 'Brana');
    Bar.render();
  },
  renderPulse() { Bar.render(); },
  renderGachaBadge() {
    document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => GPop.paint(b));
    Bar.render();
    if (Tabs.list.some(t => t.kind === 'gacha')) { clearTimeout(this.gtT); this.gtT = setTimeout(() => this.renderTabs(), 120); }
  },
  settings() {
    const back = h('div', { class: 'modal-back' });
    const chk = (k, label, desc) => h('label', { class: 'set' }, h('input', { type: 'checkbox', checked: Prefs[k] || null, onchange: e => { Prefs[k] = e.target.checked; savePrefs(); } }), h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null));
    const theme = h('select', { onchange: e => { Prefs.theme = e.target.value; savePrefs(); this.applyTheme(); } }, ...[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => h('option', { value: v, selected: Prefs.theme === v || null }, l)));
    back.append(h('div', { class: 'modal' }, h('div', { class: 'modal-h' }, '设置'),
      h('div', { class: 'modal-b' },
        chk('autoTitle', '口令加密同步会话名', '云端固定 100 字符口令编码；同一口令恢复型号、匹配权重、分数、平均耗时和时间，备注和收藏一并加密同步（Qx 格式）；两端需新版'),
        TitleSync.row('set'),
        chk('enterSend', 'Enter 发送', '关闭后 Ctrl+Enter 发送，Enter 换行'),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '会话标签上限'), h('small', {}, '顶部标签栏最多保留最近交流的对话数量（默认 6 个，按最近对话时间排序，新开标签自动淘汰最旧标签）')),
          h('input', { type: 'number', min: 1, max: 20, value: Tabs.maxCount(), style: { width: '64px', textAlign: 'center' }, onchange: e => { const v = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6)); Prefs.maxTabs = v; e.target.value = v; savePrefs(); Tabs.enforceLimit(Tabs.active); Tabs.save(); this.renderTabs(); } })),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '账号状态检测间隔（小时）'), h('small', {}, '每次打开客户端及每隔指定小时自动检测全部账号可用状态（默认 6 小时，0 表示仅启动时检测；异常卡片标红）')),
          h('input', { type: 'number', min: 0, max: 168, step: 0.5, value: Number.isFinite(Number(Prefs.acctCheckHours)) ? Number(Prefs.acctCheckHours) : 6, style: { width: '68px', textAlign: 'center' }, onchange: e => { const raw = parseFloat(e.target.value); const v = Number.isFinite(raw) ? Math.max(0, Math.min(168, raw)) : 6; Prefs.acctCheckHours = v; e.target.value = v; savePrefs(); Bus.emit('prefs'); if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(false); } })),
        (() => {
          const dplNote = h('small', {}, '手动输入并锁定 /cost 账单接口的 Vercel 部署编号（dpl_…，支持直接粘贴含 dpl_ 的链接）。当前生效：' + Pin.dpl() + (Pin.lockedDpl() ? '（已手动锁定）' : '（默认在线部署）'));
          const dplInput = h('input', { type: 'text', class: 'dk-pin-id', value: Pin.lockedDpl() || Pin.dpl(), spellcheck: 'false', placeholder: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', style: { width: '240px', fontFamily: 'var(--mono)' } });
          const applyLock = raw => {
            const res = Pin.lockCostDpl(raw);
            if (!res.ok) { toast(res.error || '部署编号格式不对（dpl_ 开头）', 'err'); dplInput.value = Pin.dpl(); return; }
            dplInput.value = res.dpl;
            dplNote.textContent = '手动输入并锁定 /cost 账单接口的 Vercel 部署编号（dpl_…，支持直接粘贴含 dpl_ 的链接）。当前生效：' + Pin.dpl() + (Pin.lockedDpl() ? '（已手动锁定）' : '（默认在线部署）');
            toast(res.locked ? '已手动锁定计费部署：' + res.dpl : '已恢复默认计费部署：' + res.dpl, 'ok');
            try { Dock.render?.(); } catch {}
          };
          dplInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyLock(dplInput.value); } };
          return h('div', { class: 'set' },
            h('span', {}, h('b', {}, '计费接口部署锁定（/cost）'), dplNote),
            h('div', { class: 'set-btns', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              dplInput,
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => applyLock(dplInput.value) }, '锁定部署'),
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => applyLock('') }, '默认')));
        })(),
        h('label', { class: 'set' }, h('input', { type: 'checkbox', checked: Prefs.notify !== false || null, onchange: e => { Prefs.notify = e.target.checked; savePrefs(); if (e.target.checked) Host.notifyPerm?.(true)?.catch?.(() => {}); } }), h('span', {}, h('b', {}, '任务完成通知'), h('small', {}, 'App 在后台时，对话回复完成 / 等待你回答 / 出错时弹系统通知，点通知直接打开那个对话；抽卡（包括抽到金色）不通知'))),
        h('div', { class: 'set' }, h('span', {}, h('b', {}, '金色'), h('small', {}, Gold.manual ? '手动点亮：已点亮 ' + (Prefs.goldSet || []).length + ' 个型号（金色 + 侧栏置顶）' : '自动：最高版本里最强的一档；可改为手动打勾点亮')), h('button', { class: 'btn ghost sm', onclick: () => { back.remove(); GoldBoard.open(); } }, '设置')),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '主题')), theme),
        AutoRoute.adapter ? AutoRoute.row() : null,
        Update.row('set'),
        Cap.row('set'),
        h('div', { class: 'set' }, h('span', {}, h('b', {}, 'ProxyIP 列表'), h('small', {}, '按地区的出口 IP · 纯净度自动过滤 · 429 自动换 IP')), h('button', { class: 'btn ghost sm', onclick: () => { back.remove(); ProxySet.open(); } }, icon('globe'), '打开')),
        (()=>{const info=h('small',{},'Google / 人机验证与 Brana 共用账号代理，禁用本机绕行与 WebRTC。');
          Host.info().then(r=>{const p=r?.privacy||{},expected=r?.account?.region||'';info.textContent='Google / 人机验证共用账号代理（最终公网出口仍取决于节点服务端）。'+(p.blocked?'当前网络已阻断。':'')+'时区：'+(p.timezone||currentTimezone())+' · 语言：'+(p.locale||navigator.language)+'。'+(p.warning||'')+(expected&&IP.loc&&expected!==IP.loc?' ⚠ 实测出口 '+IP.loc+' 与绑定地区 '+expected+' 不符，请核查线路。':'')+' 手动打开的系统浏览器不在保护范围；安卓全局 DNS / 出口保护需配合系统 VPN-TUN。';}).catch(()=>{});
          return h('div',{class:'set'},h('span',{},h('b',{},'统一出口与隐私保护'),info));})(),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '人机验证语言', tipI('只改人机验证弹窗（reCAPTCHA 勾选框 / 图片题）的文字语言。\n不改浏览器语言、时区、Accept-Language，也不影响后台静默验证（v3）；指纹和环境不变。\n「跟随系统」= 和以前一样（推荐，语言与环境保持一致）。'))),
          h('select', { onchange: e => { Prefs.rcLang = e.target.value; savePrefs(); } }, ...Recaptcha.LANGS.map(([v, l]) => h('option', { value: v, selected: (Prefs.rcLang || '') === v || null }, l)))),
        Host.bgStatus ? (() => {
          // 安卓：后台运行状态（前台服务 / 电池优化）+ 去系统设置里放开
          const sm = h('small', {}, '检查中…');
          const upd = () => Host.bgStatus().then(r => { if (!r) { sm.textContent = '需要更新 App'; return; } sm.textContent = (r.service ? '服务运行中' : '服务未运行') + ' · 电池优化：' + (r.battery ? '已放开' : '未放开（熄屏后可能暂停）') + ' · ' + String(r.text || '').replace(/^后台/, '') + '。小米等机型另需开「自启动」和「省电策略：无限制」'; }).catch(() => {});
          upd(); const iv = setInterval(() => { if (!sm.isConnected) clearInterval(iv); else upd(); }, 3000);
          return h('div', { class: 'set' }, h('span', {}, h('b', {}, '后台运行'), sm), h('div', { class: 'set-btns' }, h('button', { class: 'btn ghost sm', onclick: () => Host.bgAllow('battery') }, '电池优化'), h('button', { class: 'btn ghost sm', onclick: () => Host.bgAllow('autostart') }, '自启动')));
        })() : null,
        h('p', { class: 'dim' }, `Brana AI v${VERSION} · ${Host.platform} · 所有请求直接发往 arena.ai 接口，不加载 Brana 网页。`)),
      h('div', { class: 'modal-f' }, h('button', { class: 'btn', onclick: () => back.remove() }, '完成'))));
    document.body.append(back);
  },

  // ----- 侧栏列表 -----
  searchListSoon() {
    clearTimeout(this.searchListT);this.searchListT=0;SideTools.filter(($('#q').value||'').trim().toLowerCase(),Prefs.vf||'');SideTools.paintToolbar();SideTools.searchOn();
    if(SideTools.rows().length<300){this.renderList();return;}
    this.searchListT=setTimeout(()=>{this.searchListT=0;this.renderList();},80);
  },
  renderList() {
    clearTimeout(this.searchListT);this.searchListT=0;
    if(document.hidden){this.listDirty=true;return;}
    const box = $('#list'); if (!box) return;
    if (!box.__pull) {
      box.__pull = 1;
      ListPull.bind(box);
      box.addEventListener('scroll', () => {
        this._scrollingList = true;
        window.__ancLastScrollAt = Date.now();
        clearTimeout(this._scrollListT);
        this._scrollListT = setTimeout(() => {
          this._scrollingList = false;
          if (this._pendingListRender) { this._pendingListRender = false; this.renderListSoon?.(); }
        }, 220);
      }, { passive: true });
    }
    if (this._scrollingList && !($('#q')?.value || '').trim()) {
      this._pendingListRender = true;
      return;
    }
    this.listDirty = false; SideTools.ensure();
    const q = ($('#q').value || '').trim().toLowerCase();
    const cur = Tabs.cur?.sid, vf = Prefs.vf || '';
    const vidOf = e => { const tv = typeof Titles !== 'undefined' && Titles.view ? Titles.view(e.id, e.title, e.localTitle) : null; return Brand.of(tv?.model) || tv?.vid || Brand.of(Models.get(e.id)?.name) || Brand.of(e.localTitle) || Brand.of(e.title) || ''; };
    SideTools.filter(q,vf);
    const archived=SideTools.scope==='archived';
    let items = SideTools.rows().filter(e => SideTools.matches(e,q));
    if (typeof ModeState !== 'undefined' && typeof ModeState.matchesHistoryEntry === 'function') items = items.filter(e => ModeState.matchesHistoryEntry(e));
    if (vf) items = items.filter(e => (vidOf(e) || 'other') === vf);
    // 增量更新：内容没变的卡片直接复用原来的 DOM 节点，只插入 / 移动 / 删除有变化的，流式回复时侧栏不再整块重建
    const frag = { list: [], append(...n) { this.list.push(...n); }, prepend(n) { this.list.unshift(n); } };
    const old = this._cards || new Map(); this._cards = new Map();
    this._cardOld = old;
    if (vf) frag.append(h('button', { class: 'vfbar', title: '点一下显示全部', onclick: () => { Prefs.vf = ''; savePrefs(); this.renderList(); } }, VIcon.el(vf, 12), '只看 ' + (Brand.NAME[vf] || vf), h('span', { class: 'grow' }), icon('x')));
    if (!archived && History.retrying) frag.prepend(h('div', { class: 'lnote', role: 'status' }, h('i', { class: 'spin' }), '列表刷新较慢，正在自动重试…'));
    else if (!archived && History.err && History.items.length && (History.limited() || History.errKind === 'limit')) { const left = Math.max(0, Math.ceil((Math.max(History.retryAt || 0, ReadLimit.until || 0) - now()) / 1000)); frag.prepend(h('div', { class: 'lnote', role: 'status', title: History.err }, left ? '列表暂缓刷新：服务器限流冷却中，约 ' + left + ' 秒后自动更新（不影响对话）' : '列表稍后自动更新（不影响对话）')); }
    else if (!archived && History.err) { const retry = h('button', { class: 'btn ghost sm', onclick: async () => { retry.disabled = true; retry.textContent = '刷新中…'; const is401 = /401|未登录|过期/.test(String(History.err || '')); if (is401 && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function') { const ok = await Auth.relogin({ force: true }).catch(() => false); if (!ok && (!UI.me || UI.me.cached || UI.me.browseOnly || window.__BRANA_BROWSE_MODE)) { UI.loginGate?.('登录会话已过期，请输入密码重新登录'); return; } } await History.refresh({ manual: true }); if (!History.err) await History.loadAll(); } }, '刷新重试'); frag.prepend(h('div', { class: History.items.length ? 'lnote bad' : 'empty', role: 'status' }, (History.items.length ? '列表刷新失败（已显示本地列表，稍后自动重试）：' : '') + History.err, retry)); }
    const groups=Side.build(items);CardSelect.reconcile(groups.flatMap(g=>g.rows.map(r=>r.e.id)));
    for (const g of groups) {
      if (g.group && g.rows.length && !g.pinned) { const k = 'g|' + (g.fav ? '\u2605fav' : g.group); const el = (!this._cards.has(k) && old.get(k)?.el) || h('div', { class: 'lgroup' + (g.gold ? ' gold' : '') + (g.fav ? ' fav' : '') }, g.gold || g.fav ? '★ ' + g.group : g.group); this._cards.set(k, { el }); frag.append(el); }
      for (const r of g.rows) {
        // 型号组之间一条细线（第一张卡上面不画）
        if (r.gStart && frag.list.some(x => x?.dataset?.sid !== undefined)) { const k = 'm|' + r.e.id; const el = (!this._cards.has(k) && old.get(k)?.el) || h('div', { class: 'mline', role: 'separator' }); this._cards.set(k, { el }); frag.append(el); }
        frag.append(this.card(r, cur));
      }
    }
    if (archived) {
      const a=ArchiveHistory;
      frag.prepend(h('div',{class:'archive-status'},h('span',{role:'status'},a.loading?'正在检索归档 · 已加载 '+a.items.length+' 条':a.error||('归档 · '+items.length+' 个结果'+(a.hasMore?'（尚未全部加载）':''))),h('button',{class:'ib',title:'刷新归档',disabled:a.loading,onclick:()=>void a.load(true)},icon('refresh'))));
      if(!items.length&&!a.loading)frag.append(h('div',{class:'empty'},a.error?'读取失败，可点击刷新重试':q?'没有匹配的归档对话':'暂无归档对话'));
      if(a.hasMore&&!a.loading&&!a.error)frag.append(h('button',{class:'btn ghost',onclick:()=>void a.load()},'继续加载归档'));
    }
    if (!archived && History.fullLoading) frag.prepend(h('div', { class: 'lfull' }, h('i', { class: 'spin' }), '正在拉取全部历史 · 已 ' + History.items.length + ' 条，拉完后统一排序'));
    else if (!archived && History.loading) frag.append(h('div', { class: 'empty' }, '加载中…'));
    patchKids(box, frag.list);
    this._cardOld = null; SideTools.paintToolbar();
  },
  // 切换窗口时立刻把侧栏「当前对话」高亮挪过去：真正的重绘（renderList）手机上要等抽屉打开才画，这一步不依赖它
  markCur() {
    const box = $('#list'); const sid = Tabs.cur?.kind ? null : Tabs.cur?.sid;
    if (sid && typeof RunningTracker !== 'undefined') RunningTracker.markViewed(sid);
    if (!box) return;
    for (const c of box.children) if (c.dataset?.sid !== undefined) c.classList.toggle('on', !!sid && c.dataset.sid === sid);
  },
  // 侧栏卡片（油猴格式）：logo 圆 · 型号短名 + 备注（小字、不加粗）· 右侧 MM-DD HH:MM；进行中 logo 顺时针转，出错红、完成绿
  card(r, cur) {
    if (r.e?._pending) return h('div', { class: 'card pending busy gstep-card', role: 'status', title: '抽卡：正在创建对话（reCAPTCHA + 服务器创建），拿到 ID 后自动替换' }, h('i', { class: 'spin' }), h('span', { class: 'grow' }, r.e.title), h('span', { class: 'gstep-tag' }, '建连'), h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: '12%' } })), h('i', { class: 'pulse-wave', 'aria-hidden': 'true' }));
    const e = r.e, c = Chats.get(e.id), v = r.tv || Titles.view(e.id, e.title), mi = Models.get(e.id);
    const isEvalEntry = Boolean(e.type === 'evaluation' || e.mode === 'battle' || e.mode === 'direct' || c?.isEvaluation);
    const isBattleEntry = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(e, c)));
    const battleStatus = isBattleEntry && typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function'
      ? EvalView.getBattleStatusLabel(c, e)
      : (v?.battleStatus || '');
    const evalSub = (isEvalEntry && typeof EvalView !== 'undefined' && typeof EvalView.formatHistorySubtitle === 'function') ? EvalView.formatHistorySubtitle(e) : '';
    const shown = isBattleEntry
      ? (battleStatus || '待选择')
      : isEvalEntry
        ? (evalSub || cardName(v.model || v.plain) || e.title || '未命名')
        : (cardName(v.model || v.plain) || '未命名');
    const note = isBattleEntry
      ? (v.note || (evalSub && evalSub !== 'Battle · 匿名盲测' ? evalSub : ''))
      : isEvalEntry
        ? (v.note || (evalSub && e.title ? String(e.title).slice(0, 26) : ''))
        : v.note;
    const at = entAt(e);
    const d = new Date(at), tm = Number.isFinite(at) ? pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
    const gstep0 = typeof Gacha !== 'undefined' && Gacha.stepOf ? Gacha.stepOf(e.id) : null;
    const hasKnownModel = !!(isEvalEntry || r.vid || v.vid || (v.model && !/^(未识别|未知型号|待定)$/.test(String(v.model).trim())) || (mi?.name && !/^(未识别|未知型号|待定)$/.test(String(mi.name).trim()) && !mi?.pendingConfirm));
    const identSt = (!isEvalEntry && !gstep0 && !hasKnownModel && typeof BillingProbe !== 'undefined' && BillingProbe.identStatus) ? BillingProbe.identStatus(e.id, mi) : null;
    const gstep = gstep0 || identSt;
    const isChatSettledIdle = Boolean(c?.loaded && !c?.cached && !c?.loading && !c?.busy && !(c?.streaming && !c?.peeking) && !c?._evalStreaming && !c?.cloudRunning && !c?.midTurnStall && !c?.fakeEnd && !c?._ka?.plan);
    const isTrackedRun = !isChatSettledIdle && Boolean(typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(e.id));
    const isChatBusy = Boolean(c && (typeof Hitl !== 'undefined' ? Hitl.blocked(c) : c.busy));
    const isRunStep = !!(isChatBusy || (c?.streaming && !c?.peeking && !(typeof Hitl !== 'undefined' && Hitl.idleWait(c))) || c?._evalStreaming || c?.cloudRunning || (!isChatSettledIdle && c?._startupResuming) || c?.midTurnStall || c?.fakeEnd || c?._ka?.plan || isTrackedRun || gstep0?.active);
    const on = e.id === cur, st = isRunStep ? 'run' : c && chatState(c) === 'bad' ? 'bad' : '';
    const topConfSig = !isEvalEntry && typeof BillingProbe !== 'undefined' && BillingProbe.topConfidence ? BillingProbe.topConfidence(e.id, mi) : null;
    const goldChat = typeof Gold !== 'undefined' && typeof Gold.hasChat === 'function' ? Gold.hasChat(e.id) : false;
    const hasDoneDot = Boolean(!on && !isRunStep && typeof RunningTracker !== 'undefined' && RunningTracker.isUnread(e.id));
    const sig = [CardSelect.mode,CardSelect.ids.has(e.id),SideTools.scope,on, !!c?.busy, st, hasDoneDot ? 1 : 0, gstep?.text || '', gstep?.pct || 0, gstep?.status || '', r.vip, r.hit, r.tint, isBattleEntry ? 'battle' : (r.vid || v.vid), shown, note, tm, v.title, mi?.name, mi?.reverseLabel, mi?.reverseEffort, mi?.tier, mi?.routed, mi?.reverseMatch, mi?.reverseScore, mi?.confidence, topConfSig, e.title, e.updatedAt, Fav.has(e.id), goldChat, mi?.fingerprint?.thinkSec, mi?.fingerprint?.reasoning?.score, isEvalEntry, isBattleEntry, battleStatus, e.mode, e.modality, e.modelAId, e.modelBId, c?.voteState?.voted, c?.voteState?.modelAName, c?.voteState?.modelBName].join('\u0001');
    if (this._cards?.has(e.id)) return this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot });   // 同一会话出现两次（分页重叠）：第二个单独建
    const prev = this._cardOld?.get(e.id);
    if (prev && prev.sig === sig) { this._cards?.set(e.id, prev); return prev.el; }
    const el = this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot });
    this._cards?.set(e.id, { sig, el });
    return el;
  },
  // 卡片指标：联合识别排名置信度百分比（决定背景填充长度 --cp）/ 推理分 / 思考时长（悬停小字）
  cardMetrics(shown, mi, sid) {
    const p = typeof ConversationLabels !== 'undefined' ? ConversationLabels.parse(shown) : null;
    const fd = mi?.fingerprint && typeof ConversationLabels !== 'undefined' ? ConversationLabels.fingerprintData(mi) : null;
    const fpPct = fd?.confidence != null ? (fd.confidence <= 1 ? fd.confidence * 100 : +fd.confidence) : null;
    const revRaw = Number.isFinite(+mi?.reverseMatch) ? +mi.reverseMatch : (Number.isFinite(+mi?.confidence) ? +mi.confidence : null);
    const revPct = revRaw != null && revRaw > 0 ? (revRaw <= 1 ? revRaw * 100 : revRaw) : null;
    let liveTop = null;
    try {
      if (typeof BillingProbe !== 'undefined' && BillingProbe.topConfidence) {
        const tc = BillingProbe.topConfidence(sid || mi?.sid, mi);
        if (Number.isFinite(tc) && tc > 0) liveTop = tc;
      }
    } catch {}
    const mergedPcts = [liveTop, revPct, fpPct].filter(x => Number.isFinite(x) && x > 0);
    const pct = mergedPcts.length
      ? Math.max(...mergedPcts)
      : (mi?.fingerprint ? null : (p?.confidence != null ? +p.confidence : null));
    const conf = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    const saneSc = v => (typeof ConversationLabels !== 'undefined' && ConversationLabels.sane)
      ? ConversationLabels.sane(v)
      : (Number.isFinite(+v) && +v >= 0 && +v <= 100 ? +v : null);
    const score = (mi?.routed && saneSc(mi?.reverseScore) != null)
      ? saneSc(mi.reverseScore)
      : (mi?.fingerprint ? saneSc(fd?.score) : (saneSc(mi?.reverseScore) ?? saneSc(mi?.habitScore) ?? saneSc(mi?.est?.score) ?? saneSc(p?.score)));
    const think = !mi?.fingerprint?.skipped && Number.isFinite(mi?.fingerprint?.thinkSec) ? mi.fingerprint.thinkSec : null;
    const bits = [];
    if (mi?.routed) bits.push('⚠️换模');
    if (conf != null) bits.push('置信度 ' + +conf.toFixed(1) + '%');
    if (score != null) bits.push('推理分 ' + +score.toFixed(1)); else if (mi?.fingerprint && !mi.fingerprint.skipped && fpPct != null) bits.push('未测');
    if (think != null) bits.push('思考 ' + think + 's');
    return { conf, tip: bits.join(' · ') };
  },
  cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot }) {
    const cm = isBattleEntry ? { conf: null, tip: '' } : this.cardMetrics(shown, mi, e.id);
    const battleSt = isBattleEntry ? (battleStatus === '生成中' ? 'run' : battleStatus === '已完成' ? 'ok' : 'wait') : st;
    return h('div', { 'data-sid':e.id, role:'option', 'aria-selected':String(CardSelect.ids.has(e.id)), tabindex:'0', class: 'card' + (CardSelect.ids.has(e.id)?' selected':'') + (CardSelect.mode?' selecting':'') + (on ? ' on' : '') + (st === 'run' ? ' busy' : '') + (hasDoneDot ? ' has-done-dot' : '') + (gstep?.active ? ' gstep-card' : '') + (r.vip ? ' vip' : r.hit ? ' hit' : '') + (Fav.has(e.id) ? ' fv' : '') + (cm.conf != null ? ' cf' : ''), style: r.tint || cm.conf != null ? { ...(r.tint ? { '--tint': r.tint } : {}), ...(cm.conf != null ? { '--cp': cm.conf + '%' } : {}) } : null, title: [v.title, mi?.routed ? ('⚠️ 检测到中途路由：' + (mi.routeFrom ? mi.routeFrom + ' → ' : '') + (mi.routeTo || mi.name || '')) : '', mi?.fingerprint ? Fingerprint.details(mi) : '', mi?.name && mi.name !== v.model ? '型号：' + mi.name : '', note ? '备注：' + note : ''].filter(Boolean).join('\n'),
      onmousedown: ev=>{if(ev.ctrlKey||ev.metaKey||ev.shiftKey)ev.preventDefault();},
      ontouchstart: ev => {
        if (ev.touches?.length !== 1 || ev.target.closest('.more,.card-check')) return;
        const t = ev.touches[0], el = ev.currentTarget;
        clearTimeout(el._lpT);
        el._lpPos = { x: t.clientX, y: t.clientY };
        el._lpT = setTimeout(() => {
          el._lpT = 0;
          this._menuOpenAt = now();
          try { navigator.vibrate?.(12); } catch {}
          this.itemMenu({ type: 'contextmenu', clientX: el._lpPos.x, clientY: el._lpPos.y, currentTarget: el, stopPropagation() {} }, e);
        }, 460);
      },
      ontouchmove: ev => {
        const el = ev.currentTarget, t = ev.touches?.[0];
        if (el._lpT && t && el._lpPos && Math.hypot(t.clientX - el._lpPos.x, t.clientY - el._lpPos.y) > 10) {
          clearTimeout(el._lpT); el._lpT = 0;
        }
      },
      ontouchend: ev => { const el = ev.currentTarget; if (el._lpT) { clearTimeout(el._lpT); el._lpT = 0; } },
      ontouchcancel: ev => { const el = ev.currentTarget; if (el._lpT) { clearTimeout(el._lpT); el._lpT = 0; } },
      onkeydown:ev=>{if(ev.target!==ev.currentTarget)return;if(ev.key===' '){ev.preventDefault();CardSelect.toggle(e.id);this.renderList();}else if(ev.key==='Enter'){ev.preventDefault();ev.currentTarget.click();}},
      onclick: ev => { if (now() - (this._menuOpenAt || 0) < 500) { ev.preventDefault(); ev.stopPropagation(); return; } if (ev.target.closest('.more,.card-check')) return; if(CardSelect.click(e.id,ev)){ev.preventDefault();this.renderList();return;} this.saveScroll(); const tHit = Tabs.list.find(x => x.sid === e.id); if (tHit) this.scrolls.delete(tHit.key); Tabs.open(e.id, { title: e.title }); const cTarget = Chats.get(e.id); if (cTarget?.loaded && !cTarget.loading) cTarget.quickSync?.(true); this.closeDrawer(); },
      onmouseenter: () => { if(CardSelect.mode || Prefs.hoverPrefetch !== true) return; clearTimeout(this._pfT); this._pfT = setTimeout(() => { try { chatOf(e.id).prefetch(); } catch {} }, 400); },
      onmouseleave: () => clearTimeout(this._pfT),
      onauxclick: ev => { if (ev.button === 1) Tabs.open(e.id, { focus: false, title: e.title }); },
      oncontextmenu: ev => { ev.preventDefault(); const el = ev.currentTarget; if (el?._lpT) { clearTimeout(el._lpT); el._lpT = 0; } this._menuOpenAt = now(); this.itemMenu(ev, e); } },
      isBattleEntry && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleLogo === 'function'
        ? EvalView.renderBattleLogo(16, battleSt)
        : (r.vid || v.vid ? stLogo(r.vid || v.vid, 16, st) : st === 'run' ? h('span', { class: 'vlogo busy' }, h('i', { class: 'spin' })) : h('span', { class: 'vlogo none' + (st ? ' st-' + st : '') }, (shown[0] || '?').toUpperCase())),
      h('span', { class: 'cn' }, ...[].concat(isBattleEntry ? shown : metricName(shown, undefined, true))),
      Fav.has(e.id) ? h('span', { class: 'cfav', title: '已收藏' }, '★') : null,
      gstep?.active ? h('span', { class: 'gstep-tag' + (gstep.status === 'queued' ? ' ident-queue' : gstep.status === 'pending' ? ' ident-wait' : gstep.status === 'running' ? ' ident-run' : ''), title: gstep.phase || gstep.text }, gstep.text) : (cm.tip ? h('span', { class: 'cstat' }, cm.tip) : null),
      // 电脑上和原来一样排成一行（外层不占布局）；手机上备注在上、时间在下，靠右对齐
      h('span', { class: 'cside' }, note ? h('span', { class: 'cnote' }, note) : null, h('span', { class: 'ctime' }, tm)),
      h('a', { href: '/agent/' + e.id, 'data-sidebar': 'menu-button', class: 'ext-sb-link', tabindex: '-1', onclick: ev => { ev.preventDefault(); } }, h('span', { class: 'truncate' }, e.title || shown)),
      h('button', { class: 'more', onclick: ev => { ev.stopPropagation(); this.itemMenu(ev, e); } }, icon('dots')),
      hasDoneDot ? h('i', { class: 'card-done-dot', title: '后台对话已完成（点击查看后消失）' }) : null,
      gstep?.active ? h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: gstep.pct + '%' } })) : null,
      h('i', { class: 'pulse-wave', 'aria-hidden': 'true' }));
  },
  async editNote(e) {
    const v = Titles.view(e.id, e.title);
    const t = await Dialog.ask({ title: '备注', value: Notes.get(e.id), placeholder: '例：脚本修改', hint: '备注和收藏随口令加密的 100 字符标题跨端同步（Qx 格式，最多 59 个字）。显示在型号名后面；留空删除备注。'+(Notes.all[e.id]?.legacyNote&&Notes.all[e.id].legacyNote!==Notes.get(e.id)?' 旧版云端备注备份：'+Notes.all[e.id].legacyNote:''), max: 59,
      extra: val => '会话名：' + (Titles.model(e.id) || v.model || '未识别') + '/' + noteFmt((Notes.all[e.id]?.t) || Date.parse(String(e.updatedAt || '').replace(' ', 'T').replace(/\+00$/, 'Z')) || now()) + (val.trim() ? '/' + val.trim().replace(/\s+/g, ' ') : '') });
    if (t === null) return;
    const saved=Notes.set(e.id,t);toast(saved?(t.trim()?'备注已保存，后台加密同步到云端标题':'备注已清空，后台同步'):'备注仅在当前窗口，尚未写入本机，请勿关闭',saved?'':'err');
  },
  itemMenu(ev, e) {
    this._menuOpenAt = now();
    ev.stopPropagation?.(); document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
    const r = ev.type === 'contextmenu' ? { left: ev.clientX, bottom: ev.clientY } : ev.currentTarget.getBoundingClientRect();
    const isGoldLegend = typeof Gold !== 'undefined' && typeof Gold.hasChat === 'function' && Gold.hasChat(e.id);
    const m = h('div', { class: 'menu', style: { left: Math.min(r.left, innerWidth - 190) + 'px', top: Math.min(r.bottom + 4, innerHeight - 250) + 'px' } },
      h('button', { onclick: () => { m.remove(); const on = Fav.toggle(e.id); toast(on ? '已收藏并标金（同步特殊前缀）' : '已取消收藏'); } }, h('span', { class: 'mfav' + (Fav.has(e.id) ? ' on' : '') }, Fav.has(e.id) ? '★' : '☆'), Fav.has(e.id) ? '取消收藏' : '收藏（标金）'),
      typeof Gold !== 'undefined' && typeof Gold.toggleChat === 'function'
        ? h('button', { onclick: () => { m.remove(); const on = Gold.toggleChat(e.id); toast(on ? '已标注为金色传说（同步特殊前缀）' : '已取消金色传说标记'); } }, h('span', { class: 'mfav' + (isGoldLegend ? ' on' : '') }, isGoldLegend ? '✦' : '✧'), isGoldLegend ? '取消金色传说' : '标注金色传说')
        : null,
      h('button', { onclick: () => { m.remove(); this.editNote(e); } }, icon('edit'), '备注'),
      h('button', { title: '电脑上也可以 Ctrl / Cmd 点击加选，Shift 点击连续选', onclick: () => { m.remove(); CardSelect.toggle(e.id); this.renderList(); } }, icon('check'), CardSelect.ids.has(e.id) ? '取消选择' : '选择（多选）'),
      h('button', { onclick: () => { m.remove(); Tabs.open(e.id, { focus: false, title: e.title }); } }, icon('plus'), '在新标签打开'),
      h('button', { onclick: () => { m.remove(); copyText('https://arena.ai/agent/' + e.id); } }, icon('copy'), '复制链接'),
      (e.isArchived || e.archivedAt || (typeof SideTools !== 'undefined' && SideTools.scope === 'archived'))
        ? h('button', { onclick: async () => { m.remove(); try { await History.unarchive(e.id); toast('已恢复到对话'); } catch (err) { toast('恢复失败：' + describe(err), 'err'); } } }, icon('refresh'), '恢复到对话')
        : h('button', { onclick: async () => { m.remove(); try { await History.archive(e.id); toast('已归档'); const t = Tabs.list.find(x => x.sid === e.id); if (t) Tabs.close(t.key); } catch (err) { toast('归档失败：' + describe(err), 'err'); } } }, icon('archive'), '归档'),
      h('button', { class: 'danger', onclick: () => { m.remove(); deleteChat(e); } }, icon('trash'), '删除（含本机记录）'));
    document.body.append(m);
    if (typeof placeInward === 'function') placeInward(m, ev.type === 'contextmenu' ? { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY, width: 0, height: 0 } : r, { pad: 8, gap: 4 });
  },

  // ----- 标签栏 -----
  renderTabs() {
    if(document.hidden){this.tabsDirty=true;return;}this.tabsDirty=false;
    if (isMob()) Pager.ensureSoon(250);   // 窗口增减 / 顺序变了：相邻的预搭页跟着调整
    const box = $('#tablist'); if (!box) return;
    // 内容没变就不重建（流式回复时每帧都会调用这里）
    const curGlobalMode = (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') ? ModeState.getMode() : 'agent';
    const tsig = Tabs.list.map(t => { if (t.kind === 'gacha') { const r = Gacha.run; return 'g' + (t.key === Tabs.active) + Gacha.busy() + (r ? r.completed + '/' + (r.settings?.endless ? '∞' : r.settings?.maxAttempts) : ''); } if (t.kind === 'power') return 'p' + (t.key === Tabs.active);
      const c = t.sid ? Chats.get(t.sid) : null, he = t.sid ? History.byId(t.sid) : null, title = (t.sid && (he?.title || c?.title)) || t.title || '', v = t.sid ? Titles.view(t.sid, title) : null;
      const isBattleTab = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(he, c, t)));
      const bStat = isBattleTab && typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function' ? EvalView.getBattleStatusLabel(c, he) : (v?.battleStatus || '');
      return [t.key, t.key === Tabs.active, chatState(c), isBattleTab, bStat, title, v?.note, v?.model, v?.plain, v?.pendingConfirm, v?.time, v?.vid, Models.get(t.sid || '')?.name, Models.get(t.sid || '')?.pendingConfirm, Palette.chip(t)?.sig].join('\u0001'); }).join('\u0002') + '|' + curGlobalMode + '|' + (this.host?.account ? emailUser(this.host.account) : '') + '|' + (IP.ip || '');
    if (!box.__lp) { box.__lp = 1; TabPress.bind(box); }
    if (tsig === this._tabSig && box.children.length) return;
    clearTimeout(this.barT); this.barT = setTimeout(() => Bar.render(), 200);
    const activeChanged = this._tabAct !== Tabs.active; this._tabSig = tsig; this._tabAct = Tabs.active;
    const frag = document.createDocumentFragment();
    for (const t of Tabs.list) {
      if (t.kind === 'gacha') {
        const r = Gacha.run, busy = Gacha.busy(), lab = '抽卡' + (r ? ` ${r.completed}/${r.settings?.endless ? '∞' : r.settings?.maxAttempts}` : '');
        frag.append(h('div', { class: 'tab gtab' + (t.key === Tabs.active ? ' on' : '') + (busy ? ' busy' : ''), title: '抽卡', onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
          busy ? h('i', { class: 'spin' }) : icon('slot'), h('span', { class: 'tab-t' }, lab), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
        continue;
      }
      if (t.kind === 'power') {
        frag.append(h('div', { class: 'tab gtab' + (t.key === Tabs.active ? ' on' : ''), 'data-key': t.key, title: '推理分排行', onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
          icon('bolt'), h('span', { class: 'tab-t' }, '推理分排行'), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
        continue;
      }
      const c = t.sid ? Chats.get(t.sid) : null, he = t.sid ? History.byId(t.sid) : null, mi = t.sid ? Models.get(t.sid) : null;
      const title = (t.sid && (he?.title || c?.title)) || t.title || '新对话';
      t.title = title;
      // 标签：厂商图标 + 备注（有备注只显示备注）/ 型号全名（不写厂商名）；Battle 模式固定显示 Battle 图标 + 状态（生成中 / 待选择 / 已完成）
      const v = t.sid ? Titles.view(t.sid, title) : null, st = chatState(c);
      const isBattleTab = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(he, c, t)));
      const battleStatus = isBattleTab
        ? ((typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function') ? EvalView.getBattleStatusLabel(c, he) : (v?.battleStatus || '待选择'))
        : '';
      const label = isBattleTab
        ? battleStatus
        : (!t.sid ? '新对话' : v.note || (v.model ? tabName(v.model) : '') || v.plain || '对话');
      const battleSt = isBattleTab ? (battleStatus === '生成中' ? 'run' : battleStatus === '已完成' ? 'ok' : 'wait') : st;
      const tip = isBattleTab
        ? ['Battle 盲测 · ' + battleStatus, v?.time ? '最近对话 ' + v.time : ''].filter(Boolean).join('\n')
        : [label, v?.model && v.model !== label ? v.model : '', v?.time ? '最近对话 ' + v.time : '', st === 'run' ? '进行中' : st === 'bad' ? '出错了' : st === 'ok' ? '已完成' : ''].filter(Boolean).join('\n');
      const pc = Palette.chip(t);   // 每个窗口有自己的颜色：标签小卡片也用它，一眼能分清
      const isSel = t.key === Tabs.active;
      const hasLamp = isSel && !!t.sid;
      const tabLogoEl = isBattleTab && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleLogo === 'function'
        ? EvalView.renderBattleLogo(15, battleSt)
        : (!t.sid ? icon('plus', 'tab-new') : stLogo(v.vid, 15, st));
      const tabTextNodes = isBattleTab ? [label] : [].concat(v?.note || !v?.model ? label : metricName(label));
      frag.append(h('div', { class: 'tab' + (isSel ? ' on' : '') + (hasLamp ? ' tab-lamp-on' : '') + (!t.sid ? ' tab-blank' : '') + (isBattleTab ? ' tab-battle' : '') + (battleSt ? ' st-' + battleSt : '') + (pc ? ' tinted' : ''), style: pc ? { '--tc': pc.bg, '--tco': pc.on } : null, 'data-key': t.key, title: tip + (t.sid ? '\n长按 / 下拉：重新载入' : ''), onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
        tabLogoEl, h('span', { class: 'tab-t' }, ...tabTextNodes), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
    }
    box.replaceChildren(frag);
    if (activeChanged) box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const cur = Tabs.cur, curC = cur?.sid ? Chats.get(cur.sid) : null, curHe = cur?.sid ? History.byId(cur.sid) : null, cv = cur?.sid ? Titles.view(cur.sid, cur.title) : null;
    const curIsBattle = Boolean(cv?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(curHe, curC, cur)));
    const curTitleHead = curIsBattle
      ? ((typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function') ? EvalView.getBattleStatusLabel(curC, curHe) : (cv?.battleStatus || '待选择'))
      : (cv ? (cv.note || tabName(cv.model) || cv.plain || 'Brana') : 'Brana');
    Host.setTitle(`${curTitleHead} · ${this.host?.account ? emailUser(this.host.account) : 'Brana'}${IP.ip ? ' · ' + IP.ip : ''}`);
  },

  // ----- 对话视图 -----
  saveScroll() { const sc = $('#view .scroller'), t = Tabs.cur; if (sc && t) { const cCur = t.sid ? Chats.get(t.sid) : null; this.scrolls.set(t.key, { top: sc.scrollTop, stick: Boolean(cCur?._hotOnly || sc.scrollTop + sc.clientHeight > sc.scrollHeight - 40), lastMsgId: cCur?.messages?.at(-1)?.id || '' }); } const ta = $('#view textarea'); if (ta && t) { t.draft = ta.value; Tabs.save(); } },
  showTab() {
    const t = Tabs.cur, prevKey = this.pane.key; let view = $('#view');
    // 手机：切换窗口不影响输入法。原来在打字（输入框有焦点）→ 焦点先交给一个看不见的占位输入框，换完页面再交回新输入框，
    // 输入法全程不收起、不跳；原来没在打字 → 切换后也不自动选中输入框（不弹输入法）
    const kbWas = isMob() && !!view && document.activeElement?.tagName === 'TEXTAREA' && view.contains(document.activeElement);
    if (kbWas) KB.hold();
    this.viewKey = t?.key; this.markCur(); this.renderListSoon?.();
    // 手机：左右相邻的窗口在后台预热，并搭成真正的页停在当前页下面（横向画卷）
    if (isMob() && t) { clearTimeout(this.warmT); this.warmT = setTimeout(() => { try { Warm.near(Warm.around(Tabs.active, 3).slice(1)); } catch {} }, 700); }
    GPop.close?.(); try { Palette.show(); } catch {}
    const sidNow = t && !t.kind ? t.sid : null;
    if (sidNow && typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') {
      const cNow = Chats.get(sidNow);
      const hNow = typeof History !== 'undefined' ? History.byId?.(sidNow) : null;
      const chatMode = cNow?.isEvaluation
        ? (cNow.evalMode || 'battle')
        : hNow
          ? ModeState.inferEntryMode(hNow)
          : (cNow?.messages?.length ? 'agent' : null);
      if (chatMode && chatMode !== ModeState.getMode()) {
        ModeState.setMode(chatMode, { silent: true });
      }
    }
    try { ExtCompat.syncUrl(sidNow); } catch {} if (WS.sid !== sidNow || !WS.data) WS.load(sidNow);
    setTimeout(() => { try { Sync.tick(); } catch {} }, 300);
    setTimeout(() => { try { const c = t?.sid && !t.kind ? Chats.get(t.sid) : null; if (c) { FingerprintReview.auto(c); FingerprintBatch.autoVerify?.(c); } } catch {} }, 1500);   // 切回一个已经读完的对话：没有指纹信息就按历史里的指纹测试自动校准
    setTimeout(() => { this.layout(); Bar.render(); }, 0);
    // 手机：目标窗口已经有搭好的页 → 只换角色（那一页拿走 id="view"，当前页退到旁边），不重建、不挪任何节点
    if (Pager.on() && t && prevKey !== t.key) {
      if (Pager.adopt(t, kbWas)) { try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); } return; }
      view = Pager.shelve(t) || view;
    }
    if (t && prevKey === t.key && !t.kind && sidNow && view) {
      const curChat = Chats.get(sidNow);
      if (curChat && this.els && this.els.chat === curChat && this.els.scroller?.isConnected && this.els.thread?.isConnected && view.contains(this.els.scroller)) {
        try { Palette.paintPage(view, t); } catch {}
        try { curChat.hydrateSync?.(); } catch {}
        this.renderChat(curChat, false);
        if (!curChat.loaded && !curChat.loading) curChat.load().catch(() => {});
        else if (curChat.loaded && !curChat.loading) curChat.quickSync?.();
        if (kbWas) this.autoFocus(this.els.composer, kbWas);
        try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); }
        Pager.ensureSoon();
        return;
      }
    }
    this.fillView(t, view, kbWas);
    try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); }
    Pager.ensureSoon();
  },
  // 把窗口 t 的完整页面搭进 view（当前页，或 side = 相邻的预搭页：由 withPane 切好 this.pane）
  fillView(t, view, kbWas, side) {
    const P = this.pane; P.resizeObserver?.disconnect();P.resizeObserver=null; P.key = t?.key || null; P.el = view; P.dirty = false;
    try { Palette.paintPage(view, t); } catch {}   // 手机：这一页自带自己窗口的颜色（滑动时各自带着颜色平移）
    // 每个标签的消息节点缓存保留（最近 6 个标签）：来回切换 / 左右滑动时不用重新渲染整串长对话
    { const TC = this.tabCaches ||= new Map(); let cc = t ? TC.get(t.key) : null; if (t) { TC.delete(t.key); if (!cc) cc = new Map(); TC.set(t.key, cc); } while (TC.size > 6) TC.delete(TC.keys().next().value); this.cache = cc || new Map(); }
    if (!t) { view.replaceChildren(); this.els = null; return; }
    if (t.kind === 'gacha') { this.els = null; PView.el = null; GView.mount(view); return; }
    if (!side) GView.el = null;
    if (t.kind === 'power') { this.els = null; PView.mount(view); return; }
    if (!side) PView.el = null;
    const chat = t.sid ? chatOf(t.sid) : null;
    const thread = h('div', { class: 'thread', 'data-agent-transcript-thread': 'true' });
    // 回到底部按钮（电脑 / 手机都有）：离底部超过大半屏时出现在输入框上方，点一下平滑滚到最新；有新内容时带个小点
    const toBot = h('button', { class: 'tobot', type: 'button', title: '回到底部', 'aria-label': '回到底部', onclick: () => { P.stick = true; scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }); toBot.classList.remove('show', 'new'); } }, icon('chev'));
    const scroller = h('div', { class: 'scroller', 'data-custom-scrollbar': 'true', role: 'log', 'aria-live': 'polite', onscroll: () => { if (P._progScrollAt && Date.now() - P._progScrollAt < 48) return; if (typeof window !== 'undefined') window.__ancLastScrollAt = Date.now(); if (P._scrollRaf) return; P._scrollRaf = requestAnimationFrame(() => { P._scrollRaf = 0; const sc = scroller; if (!sc.isConnected) return; P.stick = sc.scrollTop + sc.clientHeight > sc.scrollHeight - 60; this.paintToBot(false, P); if (chat && sc.scrollTop < 80 && chat.hasMore) chat.loadOlder(true); }); } }, thread);
    scroller.__reactFiber$extcompat = { memoizedProps: { get value() { const c = t?.sid ? Chats.get(t.sid) : null; return { id: c?.sid || '', status: !c ? 'ready' : c.busy ? 'streaming' : c.status === 'error' ? 'error' : 'ready', messages: c?.messages || [] }; } }, return: null };
    const head = h('div', { class: 'chead' });
    const errbar = h('div', { class: 'errbar' });
    const composer = this.composer(t, chat);
    composer.prepend(toBot);
    view.replaceChildren(head, scroller, errbar, composer);
    this.els = { head, scroller, thread, errbar, composer, chat, toBot };
    if (!chat) {
      const defSub = (this.host?.account ? emailUser(this.host.account) : '') + (IP.ip ? ' · 出口 ' + IP.ip + (IP.loc ? ' ' + ccF(IP.loc) : '') : '') + ' · 新对话随机分配模型';
      if (typeof EvalView !== 'undefined' && typeof EvalView.renderHero === 'function') {
        EvalView.renderHero(thread, defSub);
      } else {
        thread.append(h('div', { class: 'hero' }, h('div', { class: 'hero-t' }, '有什么可以帮你？'), h('div', { class: 'hero-s' }, defSub)));
      }
      const curMode = typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent';
      head.replaceChildren(...K(
        h('div', { class: 'chead-t' },
          curMode === 'battle' && typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function' ? ModeSwitcher._icon('swords') : null,
          h('span', { class: 'chead-n' }, curMode === 'battle' ? '新对话 · Battle 盲测' : curMode === 'direct' ? '新对话 · Direct 直连' : '新对话')
        ),
        h('span', { class: 'grow' }),
        this.renderPelicanMenuBtn(t, null, curMode)
      ));
      if (!side) this.autoFocus(composer, kbWas);
      return;
    }
    // 可视高度变了（手机弹出输入法把输入框顶上去、输入框变高）：聊天内容跟着一起往上顶，保持底部对齐，不是原地不动被盖住
    { let lastH = 0; const ro = new ResizeObserver(() => { if (!scroller.isConnected) { ro.disconnect(); return; } const hh = scroller.clientHeight; if (lastH && hh && hh !== lastH) { if (P.stick !== false) scroller.scrollTop = scroller.scrollHeight; else scroller.scrollTop += lastH - hh; } if (hh) lastH = hh; }); ro.observe(scroller); P.resizeObserver=ro; }
    const sv = this.scrolls.get(t.key);
    try { chat.hydrateSync?.(); } catch {}
    const tailIdNow = chat.messages?.at(-1)?.id || '';
    const hasNewTailSinceSave = Boolean(sv && sv.lastMsgId && tailIdNow && sv.lastMsgId !== tailIdNow);
    P.stick = (!sv || chat._hotOnly || !chat.loaded || hasNewTailSinceSave) ? true : sv.stick;
    this.renderChat(chat, true);
    if (sv && !P.stick) scroller.scrollTop = sv.top;
    if (!chat.loaded && !chat.loading) chat.load().catch(() => {}); else if (chat.loaded && !chat.loading) chat.quickSync?.();
    if (!side) this.autoFocus(composer, kbWas);
  },
  // 桌面：切换后自动聚焦输入框；手机：只有切换前就在打字才把焦点交回（不自己弹输入法）
  autoFocus(composer, kb) {
    const ta = composer.querySelector('textarea'); if (!ta) return;
    if (!isMob()) { setTimeout(() => ta.focus(), 0); return; }
    if (kb) { try { ta.focus({ preventScroll: true }); } catch { ta.focus(); } }
  },
  renderChat(chat, full) {
    const E = this.els; if (!E || E.chat !== chat) return;
    // 头部
    const isBattleChat = Boolean((chat?.isEvaluation && chat?.evalMode === 'battle') || (typeof EvalView !== 'undefined' && EvalView.isBattleChat(chat)));
    const isDirectChat = Boolean((chat?.isEvaluation && chat?.evalMode === 'direct') || (typeof EvalView !== 'undefined' && EvalView.isDirectChat(chat)));
    const isEvalChat = isBattleChat || isDirectChat || Boolean(chat?.isEvaluation);
    if (isDirectChat) {
      const directName = chat.directModelName
        || (chat.modelAId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(chat.modelAId, chat.revealedModels)
          : chat.modelAId)
        || (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function'
          ? (ModeState.getDirectModel()?.displayName || ModeState.getDirectModel()?.publicName)
          : '')
        || '';
      if (directName && Models.get(chat.sid)?.name !== directName) {
        Models.set(chat.sid, { name: directName, sure: true, directMode: true, provider: 'Direct 直连锁定' });
      }
    }
    if ((chat._startupResuming || chat._recoveringIncomplete) && chat.loaded && !chat.cached && !chat.loading && chat.status === 'streaming' && !chat.live && !chat.awaitId && !chat.preSend && !chat.sending) {
      const lastVis = (chat.messages || []).filter(m => m && !m._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).at(-1);
      const isTailSettled = lastVis && lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete && Boolean(lastVis._finishedAt || lastVis.metadata?.timing?.completedAt || lastVis.metadata?.aborted || lastVis.metadata?.error || lastVis.metadata?.finishReason === 'stop' || lastVis.metadata?.finishReason === 'end-turn');
      if (isTailSettled && !(typeof Hitl !== 'undefined' && Hitl.idleWait(chat))) {
        chat.status = 'idle';
        chat.phase = '';
        chat._startupResuming = false;
        chat._recoveringIncomplete = false;
        if (typeof RunningTracker !== 'undefined') { try { RunningTracker.onChatUpdate(chat); } catch {} }
        if (typeof SendQ !== 'undefined' && (chat.queue || []).length) setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
      }
    }
    const mi = Models.get(chat.sid), v = Titles.view(chat.sid, chat.title), st = chatState(chat);
    const modelVersion=this.modelStamp(mi);
    const tip = [v.title, mi && [mi.internal && '内部：' + mi.internal, mi.request && '请求：' + mi.request, mi.provider && '提供方：' + mi.provider, mi.routed && 'Brana 已改派'].filter(Boolean).join('\n')].filter(Boolean).join('\n');
    // 打开对话后自动识别（不用手动点）：1 小时内有运行记录的，自动读取模型信息
    if (!isEvalChat && this.pane.el?.id === 'view' && chat.loaded && !chat.autoTried && chat.messages.some(m => m.role === 'assistant')) { chat.autoTried = true; setTimeout(() => AutoId.run(chat), 400); }
    const phase=ThinkingStatus.phase(chat);
    const battleTitle = isBattleChat
      ? (chat.voteState?.voted
        ? `${chat.voteState.modelAName || 'Model A'} vs ${chat.voteState.modelBName || 'Model B'}`
        : 'Battle 盲测 · Model A vs Model B')
      : '';
    const hsig = [chat.sid, isBattleChat, isDirectChat, battleTitle, chat.voteState?.voted, chat.voteState?.value, typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat), PelicanTest.isRunning(chat), !!mi?.fingerprint, !!chat.probeNumbers?.length, FingerprintBatch.busy, !!chat.gacha, Fingerprint.isRunning(chat), chat.probeProgress, tip, v.vid, st, v.note, v.model, v.plain, v.time, mi?.routed, chat.identifying, !mi && chat.idErr, WS.shown, chat.busy].join('\u0001');
    if (E.hsig !== hsig) {
      E.hsig = hsig;
      if (isBattleChat) {
        E.head.replaceChildren(...K(
          h('div', { class: 'chead-t', title: chat.title || battleTitle },
            (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function') ? ModeSwitcher._icon('swords') : null,
            h('span', { class: 'chead-n' }, battleTitle),
            chat.modality ? h('span', { class: 'badge dim' }, String(chat.modality).toUpperCase()) : null,
            chat.voteState?.voted ? h('span', { class: 'badge dim' }, '已揭晓并入库') : h('span', { class: 'badge dim' }, '盲测中')
          ),
          h('span', { class: 'grow' }),
          this.renderPelicanMenuBtn(Tabs.cur, chat, 'battle'),
          h('button', { class: 'ib mdbtn', title: '导出这个对话的全部内容为 Markdown', onclick: () => void ChatExport.run(chat) }, icon('doc'))
        ));
      } else {
        E.head.replaceChildren(...K(h('div', { class: 'chead-t', title: tip, 'aria-label': 'Session cumulative cost' }, stLogo(v.vid || Brand.of(mi?.name), 18, st), h('span', { class: 'chead-n' }, ...[].concat(v.note || metricName(mi?.name || v.model, cardName) || v.plain || '对话')), v.note && (mi?.name || v.model) ? h('span', { class: 'chead-md' }, '-', ...[].concat(metricName(mi?.name || v.model, cardName))) : null),
          isDirectChat ? h('span', { class: 'badge dim' }, 'Direct 直连') : null,
          isDirectChat && chat.modality ? h('span', { class: 'badge dim' }, String(chat.modality).toUpperCase()) : null,
          isDirectChat && typeof EvalView !== 'undefined' && typeof EvalView.renderPreviewHeaderBtns === 'function' ? EvalView.renderPreviewHeaderBtns(chat, (chat.messages || []).findLast(m => m && m.role === 'assistant'), 'a') : null,
          isDirectChat && typeof EvalView !== 'undefined' && typeof EvalView.renderRegenBtn === 'function' ? EvalView.renderRegenBtn(chat, (chat.messages || []).findLast(m => m && m.role === 'assistant'), 'a', Boolean(chat.busy), null) : null,
          window.__BRANA_BROWSE_MODE ? h('button', { type: 'button', class: 'badge warn browse-badge', title: '当前处于离线/免登查阅模式，点击返回登录或重连', onclick: () => { window.__BRANA_BROWSE_MODE = false; UI.loginGate('已退出查阅模式，请登录或刷新连接'); } }, '查阅模式 · 退出') : null,
          mi?.routed ? (() => {
            const rType = mi.routeType === 'effort' ? '强度削弱' : '路由换模';
            const cleanFrom = String(mi.routeFrom || mi.lastRouteNotice?.fromLabel || '').replace(/[?？]+$/, '').trim();
            const cleanTo = String(mi.routeTo || mi.lastRouteNotice?.toLabel || mi.name || '').replace(/[?？]+$/, '').trim();
            const shortM = s => String(s || '').replace(/\s*\((?:None|Minimal|Low|Medium|High|XHigh|Max)\)\s*$/i, '').trim();
            const fromS = shortM(cleanFrom) || '原模型';
            const toS = shortM(cleanTo) || '新模型';
            const turnH = mi.lastRouteNotice?.toTurn ? `（第 #${mi.lastRouteNotice.toTurn} 轮起）` : '';
            const rDesc = (cleanFrom && cleanTo) ? `${cleanFrom} → ${cleanTo}${turnH}` : (cleanTo || mi.lastRouteNotice?.text || '检测到中途路由变化');
            const rReason = mi.routeReason || mi.lastRouteNotice?.reason || '';
            const fullMsg = `⚠️ ${rType}提醒：${rDesc}${rReason ? ' · ' + rReason : ''}`;
            return h('button', {
              type: 'button',
              class: 'badge warn route-warn-btn',
              title: `${fullMsg}（点击定位到对话中的路由切换轮次）`,
              'aria-label': '改派详情',
              onclick: e => {
                e.stopPropagation();
                const alertEl = (E?.thread || document).querySelector('.msg-route-alert[data-route-pivot="1"], .msg-route-alert, .trow.is-route-start');
                if (alertEl) {
                  alertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  alertEl.classList.add('route-flash');
                  setTimeout(() => alertEl.classList.remove('route-flash'), 1800);
                }
                toast(fullMsg, 'warn');
              }
            }, icon('alert'), h('span', { class: 'route-warn-txt' }, `${rType}: ${fromS} → ${toS}`));
          })() : null,
          !isEvalChat && chat.identifying ? h('span', { class: 'badge dim' }, h('i', { class: 'spin' }), '识别模型…')
            : !isEvalChat && !mi && chat.idErr ? h('button', { class: 'badge dim link', title: chat.idErr + '（点一下重试）', onclick: () => chat.identifyOld() }, '未识别') : null,
          h('span', { class: 'grow' }),
          !isEvalChat ? h('button', { class: 'ib revbtn' + (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? ' run' : ''), 'aria-label': typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推' : '费用反推', disabled: (chat.busy && !(typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat))) || PelicanTest.isRunning(chat), title: typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推识别' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '反推识别：点一下读取账单与对话记录/工具调用，按最高置信度反推并锁定当前对话的真实模型与推理分。', onclick: () => void BillingProbe.reverseIdentify(chat, { interactive: true }) }, icon('pulse')) : null,
          !isEvalChat ? this.renderProbeTestBtn(Tabs.cur, chat, 'agent') : null,
          !isEvalChat ? h('button', { class: 'ib pelbtn' + (PelicanTest.isRunning(chat) ? ' run' : ''), 'aria-label': PelicanTest.isRunning(chat) ? '停止鹈鹕' : '鹈鹕测试', disabled: (chat.busy && !PelicanTest.isRunning(chat)), title: PelicanTest.isRunning(chat) ? '停止鹈鹕测试' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '鹈鹕测试：点一下直接发送 2D 鹈鹕骑车动态 SVG 标准测试题', onclick: e => { e.stopPropagation(); void PelicanTest.start(chat); } }, icon('pelican')) : isDirectChat ? this.renderPelicanMenuBtn(Tabs.cur, chat, 'direct') : null,
          h('button', { class: 'ib mdbtn', title: '导出这个对话的全部内容（正文、思考、bash 命令和输出、工具调用）为 Markdown，自己选保存位置', onclick: () => void ChatExport.run(chat) }, icon('doc')),
          !isEvalChat ? h('button', { class: 'ib wsbtn', title: WS.shown ? '收起工作区' : '显示工作区（沙盒文件）', onclick: () => { WS.set(!WS.shown); scheduleChat(chat); } }, icon('folder')) : null));
      }
    }
    // 消息
    const T = E.thread, sc = E.scroller;
    const stick = this.stick !== false;
    const hasVisibleMsgs = chat.messages.some(m => m && !m._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)));
    if (!chat.loaded && !hasVisibleMsgs) {
      if (!chat.loading && !chat.error) { try { chat.load().catch(() => {}); } catch {} }
      const loadTxt = chat.loading
        ? ('加载中…' + (chat.loadBytes >= 65536 ? '（已接收 ' + (chat.loadBytes / 1048576).toFixed(2) + ' MB）' : ''))
        : (chat.error ? chat.error : '加载中…');
      const showSlowRetry = Boolean(chat.loading && chat._loadStartedAt && now() - chat._loadStartedAt > 5000);
      const ld = T.querySelector('.loading');
      if (!ld || Boolean(ld.querySelector('button')) !== showSlowRetry) {
        T.replaceChildren(h('div', { class: 'loading' },
          h('span', { class: 'ld-txt' }, loadTxt),
          showSlowRetry ? h('button', { class: 'btn ghost sm', style: { marginLeft: '10px' }, onclick: () => chat.load(true) }, '重新连接') : null));
      } else {
        const sp = ld.querySelector('.ld-txt') || ld;
        if (sp.textContent !== loadTxt) sp.textContent = loadTxt;
      }
    } else if (isBattleChat && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleThread === 'function') {
      EvalView.renderBattleThread(chat, T, sc);
    } else {
      const ae = document.activeElement, fk = ae && T.contains(ae) ? ae.dataset?.fk : null, fsel = fk ? [ae.selectionStart, ae.selectionEnd] : null;
      const els = [];
      if (chat.hasMore) { const b = this.cache.get('__older') || (() => { const b = h('button', { class: 'older', onclick: () => chat.loadOlder() }, '加载更早的消息'); this.cache.set('__older', b); return b; })(); const t = chat.olderLoading ? '正在加载更早的消息…' : chat.allLoading ? '正在后台补全更早的消息（点此立即加载）' : '加载更早的消息'; if (b.textContent !== t) b.textContent = t; b.classList.toggle('busy', !!chat.olderLoading); els.push(b); }
      // _held：已按发送、但要等服务器上一轮结束才真正发出的消息，在输入框上方的队列条里显示，不进对话区
      let lastIdx = chat.messages.length - 1; while (lastIdx >= 0 && chat.messages[lastIdx]._held) lastIdx--;
      const isVisibleUser = u => u && u.role === 'user' && !u._held && !u._autoContinue && !u.metadata?.autoContinue && (((u.parts || []).some(p => (p.type === 'text' && String(p.text || '').trim()) || p.type === 'data-tool-results')) || userAtts(u).length > 0);
      const msgLen = chat.messages.length;
      const lastMsgObj = lastIdx >= 0 ? chat.messages[lastIdx] : null;
      const segMemoSig = `${msgLen}:${lastIdx}:${lastMsgObj?.id || ''}:${lastMsgObj?.role || ''}:${lastMsgObj?.metadata?.timing?.completedAt || 0}:${(lastMsgObj?.parts || []).some(p => p?.type === 'text' && String(p.text || '').trim()) ? 1 : 0}`;
      let segMeta = (chat._segMetaMemo && chat._segMetaMemo.sig === segMemoSig) ? chat._segMetaMemo.arr : null;
      if (!segMeta) {
        segMeta = new Array(msgLen);
        const visUser = new Uint8Array(Math.max(0, lastIdx + 1));
        const prevAsstArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        const firstIdxArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        const nextAsstArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        let runFirstAsst = -1, runLastAsst = -1;
        for (let i = 0; i <= lastIdx; i++) {
          const m = chat.messages[i];
          if (!m || m._held) continue;
          if (isVisibleUser(m)) {
            visUser[i] = 1;
            runFirstAsst = -1;
            runLastAsst = -1;
          } else if (m.role === 'assistant') {
            prevAsstArr[i] = runLastAsst;
            firstIdxArr[i] = runFirstAsst >= 0 ? runFirstAsst : i;
            if (runFirstAsst < 0) runFirstAsst = i;
            runLastAsst = i;
          }
        }
        let nextOverallAsst = null, runNextAsst = -1;
        const nextOverallAsstByIdx = new Array(msgLen).fill(null);
        for (let i = lastIdx; i >= 0; i--) {
          const m = chat.messages[i];
          if (!m || m._held) continue;
          if (visUser[i]) {
            runNextAsst = -1;
            continue;
          }
          if (m.role !== 'assistant') continue;
          nextAsstArr[i] = runNextAsst;
          runNextAsst = i;
          nextOverallAsstByIdx[i] = nextOverallAsst;
          if (m.id) nextOverallAsst = m;
        }
        for (let i = 0; i <= lastIdx; i++) {
          const m = chat.messages[i];
          if (!m || m._held || m.role !== 'assistant') continue;
          const prevAsst = prevAsstArr[i], nextAsst = nextAsstArr[i], firstIdx = firstIdxArr[i] >= 0 ? firstIdxArr[i] : i;
          // Also merge consecutive tool-only segments that share the exact same completion minute even if separated by non-text records
          const curT1 = m.metadata?.timing?.completedAt || 0;
          const nextM = nextAsst >= 0 ? chat.messages[nextAsst] : null;
          const nextT1 = nextM?.metadata?.timing?.completedAt || 0;
          const hasText = (m.parts || []).some(p => p.type === 'text' && String(p.text || '').trim());
          const sameClockAsNext = !!(nextM && curT1 && nextT1 && clock(curT1) === clock(nextT1));
          const hasPrev = prevAsst >= 0, hasNext = nextAsst >= 0;
          const firstMsg = chat.messages[firstIdx];
          const turnStartAt = firstMsg?.metadata?.timing?.startedAt || idTime(firstMsg?.id) || 0;
          segMeta[i] = {
            head: !hasPrev && hasNext,
            mid: hasPrev && hasNext,
            tail: hasPrev && !hasNext,
            hideFoot: hasNext && (!hasText || sameClockAsNext),
            turnStartAt,
            nextAsstMsg: nextOverallAsstByIdx[i]
          };
        }
        chat._segMetaMemo = { sig: segMemoSig, arr: segMeta };
      }
      chat.messages.forEach((m, i) => {
        if (m._held) return;
        if (chat.live !== m && typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)) return;
        const isLast = i === lastIdx || (i === lastIdx - 1 && chat.messages[lastIdx]?.role === 'user' && false);
        const seg = segMeta[i] || null;
        const segKey = seg ? (seg.head ? 'H' : seg.mid ? 'M' : seg.tail ? 'T' : '') + (seg.hideFoot ? '0' : '1') + ':' + (seg.turnStartAt || 0) : '';
        const isUnverifiedCache = Boolean((chat.cached && !chat.loaded) || chat._recoveringIncomplete);
        const isIncTail = Boolean(i === lastIdx && m.role === 'assistant' && !m._userStopped && isUnverifiedCache && (
          m.metadata?.pending ||
          m._incomplete ||
          m.status === 'pending' ||
          m.status === 'streaming' ||
          (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m))
        ));
        const isSettledTailAsst = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
        const isRunningTail = !m.failed && !Hitl.idleWait(chat) && !(isSettledTailAsst && !chat?.streaming) && (chat.live === m || !!(i === lastIdx && m.role === 'assistant' && !isSettledTailAsst && ((Hitl.blocked(chat) && !chat.waitingForeign) || isIncTail)));
        const pArr = m.parts || [], pLen = pArr.length, lastP = pLen ? pArr[pLen - 1] : null;
        const cSig = pLen + ':' + (lastP?.type || '') + ':' + (lastP?.text?.length || 0) + ':' + (lastP?.state || '') + ':' + (m.text?.length || 0);
        const key = (m.v || 0) + '|' + cSig + '|' + segKey + '|' + (i === lastIdx ? 'L' + chat.status + (chat.hitlStage?.size || 0) : '') + '|' + (m.failed ? 'f' : '') + '|' + (isRunningTail ? 'live:' + phase : '') + '|' + this.modelsV + ':' + modelVersion + '|' + (pArr.some(p=>p.type==='reasoning')?ThinkingStatus.label(chat,m,isRunningTail):'');
        let c = this.cache.get(m.id);
        if (!c || c.key !== key || !c.el || typeof c.el.nodeType !== 'number') {
          let el = null;
          try {
            el = R.message(m, chat, i === lastIdx, c?.el && typeof c.el.nodeType === 'number' ? c.el : null, seg);
          } catch (err) {
            console.warn('R.message error:', err);
            el = (c?.el && typeof c.el.nodeType === 'number') ? c.el : h('div', { class: 'msg ' + (m.role || 'assistant'), 'data-id': m.id || null });
          }
          c = { key, el };
          this.cache.set(m.id, c);
        }
        if (c?.el && typeof c.el.nodeType === 'number') els.push(c.el);
      });
      // 「正在输入」占位复用同一个节点：否则每帧都换新节点，整串消息被重新挂载、整页重排
      if (Hitl.blocked(chat) && chat.messages[lastIdx]?.role === 'user' && !chat.waitingForeign) {
        const t = this.cache.get('__typing') || (() => { const t = h('div', { class: 'msg assistant' }, h('div', { class: 'msg-body typing-row' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')), h('span', { class: 'typing-st' }), h('span', { class: 'phase typing-phase' }, h('span', { class: 'ph-t' }), h('span', { class: 'dim anc-since' })))); this.cache.set('__typing', t); return t; })();
        const st = t.querySelector('.typing-st'); if (st) st.textContent = chat.dlvText?.() || '';
        const phEl = t.querySelector('.ph-t'); if (phEl && phEl.textContent !== phase) phEl.textContent = phase;
        const sinceEl = t.querySelector('.anc-since');
        if (sinceEl) {
          const lastM = chat.messages[lastIdx];
          const effSince = Number(chat.sentAt) || Number(chat.oursAt) || Number(lastM?._sentAt) || (typeof getMsgTs === 'function' ? getMsgTs(lastM) : 0) || (typeof idTime === 'function' ? idTime(lastM?.id) : 0) || Number(chat.recAt) || 0;
          if (Number.isFinite(effSince) && effSince > 1e12) {
            const sStr = String(effSince);
            if (sinceEl.dataset.since !== sStr) sinceEl.dataset.since = sStr;
            const secTxt = ' ' + Math.max(0, Math.floor((now() - effSince) / 1000)) + 's';
            if (sinceEl.textContent !== secTxt) sinceEl.textContent = secTxt;
          } else {
            delete sinceEl.dataset.since;
            if (sinceEl.textContent) sinceEl.textContent = '';
          }
        }
        els.push(t);
      }
      if (!els.length) {
        if (!chat.loaded || chat.loading) {
          const loadTxt = chat.loading
            ? ('加载中…' + (chat.loadBytes >= 65536 ? '（已接收 ' + (chat.loadBytes / 1048576).toFixed(2) + ' MB）' : ''))
            : (chat.error ? chat.error : '加载中…');
          els.push(h('div', { class: 'loading' }, loadTxt));
        } else if (!chat.error) {
          els.push(h('div', { class: 'loading dim' }, '暂无消息记录 ', h('button', { class: 'btn ghost sm', style: { marginLeft: '8px' }, onclick: () => chat.load(true) }, '重新加载')));
        }
      }
      // 前面插入了更早的消息：以当前看到的第一条消息为锚点保持位置，不跳动
      const wasHotUpgrade = Boolean(E.wasHotOnly && !chat._hotOnly);
      E.wasHotOnly = Boolean(chat._hotOnly);
      const curTailMsg = chat.messages.at(-1);
      const curTailSig = curTailMsg ? (curTailMsg.id + ':' + (curTailMsg.parts?.length || 0) + ':' + (curTailMsg.parts?.at(-1)?.text?.length || 0)) : '';
      const tailGrewFresh = Boolean(E.lastTailSig && curTailSig && E.lastTailSig !== curTailSig && (!window.__ancLastScrollAt || Date.now() - window.__ancLastScrollAt > 1500));
      E.lastTailSig = curTailSig;
      const effStick = stick || wasHotUpgrade || tailGrewFresh;
      if (wasHotUpgrade || tailGrewFresh) this.pane.stick = true;
      const structureChanged=els.length!==T.childElementCount||els.some((e,i)=>T.children[i]!==e);
      const prevTop=structureChanged&&!effStick?sc.scrollTop:0;let anchor=null,anchorOff=0;
      if (structureChanged&&!effStick) for (const c of T.children) { if (c.offsetTop + c.offsetHeight > prevTop) { anchor = c; anchorOff = c.offsetTop - prevTop; break; } }
      if (structureChanged) {
        patchKids(T, els);
        const ids=new Set(chat.messages.map(m=>m.id));for(const id of this.cache.keys())if(id!=='__older'&&id!=='__typing'&&!ids.has(id))this.cache.delete(id);
        if (!effStick && anchor && anchor.isConnected) { const d = anchor.offsetTop - prevTop - anchorOff; if (d) sc.scrollTop = prevTop + d; }
      }
      if (fk && document.activeElement !== ae) { const n = [...T.querySelectorAll('[data-fk]')].find(x => x.dataset.fk === fk); if (n && !n.disabled) { try { n.focus({ preventScroll: true }); if (fsel && n.setSelectionRange) n.setSelectionRange(fsel[0], fsel[1]); } catch {} } }
      if (isEvalChat && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') {
        try { HtmlPreview.syncEval(chat); } catch {}
      }
    }
    {
      const hh = sc.scrollHeight;
      let pinnedBot = false;
      if (stick || full || E.wasHotOnly === false && E._forceBotOnce) { E._forceBotOnce = false; this.pane._progScrollAt = Date.now(); sc.scrollTop = hh; pinnedBot = true; }
      else if (this.pane.stick !== false) { this.pane._progScrollAt = Date.now(); sc.scrollTop = hh; pinnedBot = true; }
      const grew = !!E.lastSH && hh > E.lastSH + 4; E.lastSH = hh; this.paintToBot(grew && !stick, this.pane, pinnedBot);
    }
    // 错误条
    if ((chat.busy || chat.streaming || chat.live) && Array.isArray(chat.messages) && typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i]?.role === 'user' && chat.messages[i]?.failed) {
          SendQ.demoteToQueue(chat, chat.messages[i], { silent: true, running: true });
        }
      }
    }
    const failedUserMsg = !chat.busy ? ([...(chat.messages || [])].reverse().find(m => m?.role === 'user' && m.failed) || null) : null;
    if (E.errbar.firstChild) E.errbar.replaceChildren();
    if ((chat.error || failedUserMsg) && !chat.busy) {
      const errText = chat.error || '上一条消息未发出（服务器未收到），请点击重试';
      const cap = /recaptcha|captcha|人机验证/i.test(errText);
      const lastUser = failedUserMsg || (chat.messages.at(-1)?.role === 'user' ? chat.messages.at(-1) : null);
      const isRejected = /rejected this request|拒绝请求|死节点|超限/i.test(errText);
      const isBattleMode = Boolean(chat.evalMode === 'battle' || (typeof EvalView !== 'undefined' && EvalView.isBattleChat?.(chat)));
      const isUnsentOnly = Boolean(failedUserMsg && !cap && !isRejected);
      E.errbar.append(...K(h('span', {}, '⚠ ' + errText), h('span', { class: 'grow' }),
        cap ? h('button', { class: 'btn sm', onclick: () => this.retry(chat, lastUser, true) }, '人机验证后重试') : null,
        !cap && !isRejected && !isBattleMode && !isUnsentOnly ? h('button', { class: 'btn sm', title: '保留当前轮次已有进度，直接发送新消息「继续」推进流程（不回退、不重发长文）', onclick: () => this.continueFlow(chat) }, '⚡ 继续推进') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '跳过导致超限或死锁的上一轮，回退到再上一轮正常节点重发', onclick: () => this.rewindAndRetry(chat, lastUser) }, '⏪ 回退上一节点') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '在当前对话内开启全新空工作区分支（清空沙盒与报错历史，保留当前模型）', onclick: () => this.resetWsBranch(chat, lastUser) }, '🧹 重置工作区救活') : null,
        h('button', { class: 'btn sm' + (isUnsentOnly ? '' : ' ghost'), onclick: () => this.retry(chat, lastUser, false) }, '↻ 重试'),
        h('button', { class: 'ib', onclick: () => { chat.error = null; chat.emit(); } }, icon('x'))));
    }
    // 输入框按钮状态
    this.syncComposer(chat);
    const tNow = now();
    if (!chat.busy) {
      if (this._pvSyncT) { clearTimeout(this._pvSyncT); this._pvSyncT = 0; }
      if (this._trScanT) { clearTimeout(this._trScanT); this._trScanT = 0; }
      this._lastPvSyncAt = tNow; this._lastTrScanAt = tNow;
      try { HtmlPreview.syncLive?.(chat.sid); } catch {}
      try { window.__arenaBashTranslate?.scan?.(); } catch {}
    } else {
      if (tNow - (this._lastPvSyncAt || 0) >= 180) {
        this._lastPvSyncAt = tNow;
        try { HtmlPreview.syncLive?.(chat.sid); } catch {}
      } else if (!this._pvSyncT) {
        this._pvSyncT = setTimeout(() => { this._pvSyncT = 0; this._lastPvSyncAt = now(); try { if (this.els?.chat?.sid) HtmlPreview.syncLive?.(this.els.chat.sid); } catch {} }, 180);
      }
      if (tNow - (this._lastTrScanAt || 0) >= 350) {
        this._lastTrScanAt = tNow;
        try { window.__arenaBashTranslate?.scan?.(); } catch {}
      } else if (!this._trScanT) {
        this._trScanT = setTimeout(() => { this._trScanT = 0; this._lastTrScanAt = now(); try { window.__arenaBashTranslate?.scan?.(); } catch {} }, 350);
      }
    }
  },
  paintToBot(grew, P = this.pane, pinnedBot = false) {
    const E = P?.els, b = E?.toBot, sc = E?.scroller; if (!b || !sc) return;
    const far = pinnedBot ? false : (sc.scrollHeight - sc.scrollTop - sc.clientHeight > Math.max(240, sc.clientHeight * 0.6));
    if (E._toBotFar !== far) { E._toBotFar = far; b.classList.toggle('show', far); }
    if (!far) b.classList.remove('new'); else if (grew) b.classList.add('new');
  },
  async continueFlow(chat) {
    if (!chat || chat.busy || chat._qBusy) return;
    try {
      const tail = chat.messages?.at(-1);
      const prevU = tail?.role === 'assistant' ? chat.messages?.at(-2) : (tail?.role === 'user' ? tail : null);
      const origText = prevU ? (prevU.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n') : '';
      if (prevU && typeof chat.verifyTurnForContinue === 'function') {
        const vr = await chat.verifyTurnForContinue(prevU, origText);
        if (vr?.mode === 'already-done' || vr?.mode === 'server-busy') return;
        if (vr?.mode === 'resend-orig' || vr?.mode === 'rewind-resend') {
          await this.retry(chat, prevU, false);
          return;
        }
      }
      if (prevU?.role === 'user') {
        prevU._officialContinueParent = true;
        delete prevU._streamRejected;
      }
      if (tail?.role === 'assistant' && Array.isArray(tail.parts)) {
        const nonErr = tail.parts.filter(p => p && p.type !== 'error');
        if (!nonErr.filter(p => p.type !== 'step-start').length) {
          if (tail.id) (chat._prunedDeadMsgIds ||= new Set()).add(tail.id);
          chat.messages.pop();
        } else {
          tail.parts = nonErr;
          tail.v = (tail.v || 0) + 1;
        }
      }
      chat.error = null;
      chat.errText = '';
      chat._officialTurnErrAt = 0;
      await chat.send('继续', { autoContinue: true, officialAutoResend: true });
    } catch (e) { toast(describe(e), 'err'); }
  },
  async rewindAndRetry(chat, lastUser) {
    if (!chat || chat.busy || chat._qBusy) return;
    try {
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      const curHealthy = typeof findHealthyLastUser === 'function' ? findHealthyLastUser(chat.messages, null, chat._rejectedHealthyNodeIds) : null;
      if (curHealthy) {
        const key = String(curHealthy.metadata?.nodeId || curHealthy.id || '');
        if (key) (chat._rejectedHealthyNodeIds ||= new Set()).add(key);
        if (curHealthy.id) (chat._rejectedHealthyNodeIds ||= new Set()).add(String(curHealthy.id));
        if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      } else {
        chat._forceResetWorkspaceBranch = true;
      }
      toast('已回退至更早一轮正常节点，正在重发…');
      await this.retry(chat, lastUser, false);
    } catch (e) { toast(describe(e), 'err'); }
  },
  async resetWsBranch(chat, lastUser) {
    if (!chat || chat.busy || chat._qBusy) return;
    if (!await Dialog.confirm({
      title: '重置工作区并救活当前对话',
      text: '将清理末尾卡死/开源思考已停止的异常轮次，并回退到第 1 轮正常闭源节点开启全新干净工作区分支（清空 /home/user 满载工作区与死节点历史，完整保留当前对话 ID 与已锁定的闭源模型）。是否立即重置并重发？',
      ok: '重置工作区并重发'
    })) return;
    try {
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      const getText = u => (u?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n').trim();
      const isContinueFiller = u => /^(?:继续|continue|go on|keep going|接着|继续执行)[。.!！?？\s]*$/i.test(getText(u)) && !(u?.metadata?.uploads?.length > 0);
      const users = (chat.messages || []).filter(m => m && m.role === 'user');
      const picked = [...users].reverse().find(u => !isContinueFiller(u) && getText(u)) || lastUser || users.at(-1);
      const text = getText(picked) || '你好';
      const firstU = typeof findFirstHealthyUser === 'function' ? findFirstHealthyUser(chat.messages) : null;
      if (firstU) {
        const uIdx = chat.messages.indexOf(firstU);
        let cutIdx = uIdx;
        for (let j = uIdx + 1; j < chat.messages.length; j++) {
          const m = chat.messages[j];
          if (!m) continue;
          if (m.role === 'user') break;
          if (m.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(m))) cutIdx = j;
        }
        const removed = chat.messages.slice(cutIdx + 1);
        const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
        for (const m of removed) if (m?.id) prunedSet.add(m.id);
        chat.messages.splice(cutIdx + 1);
      } else {
        const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
        for (const m of (chat.messages || [])) if (m?.id) prunedSet.add(m.id);
        chat.messages.length = 0;
      }
      if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(chat, { pruneTail: false });
      const targetU = typeof findHealthyLastUser === 'function' ? findHealthyLastUser(chat.messages) : firstU;
      chat._forceResetWorkspaceBranch = true;
      chat._resetBranchTargetUserId = targetU ? (targetU.metadata?.nodeId || targetU.id || null) : null;
      chat._rejectedHealthyNodeIds?.clear?.();
      chat.error = null;
      chat.errText = '';
      try { Workspace.cache.delete(chat.sid); if (typeof WS !== 'undefined' && WS.sid === chat.sid) { WS.data = null; WS.render(); } } catch {}
      toast('已回退至初始闭源节点并重置工作区分支，正在发送…');
      await chat.send(text, {});
    } catch (e) { toast(describe(e), 'err'); }
  },
  async confirmPureIpBeforeSend() {
    try {
      if (window.__fixture || window.__routeFixture) return true;
      if (typeof Prefs !== 'undefined' && Prefs.preSendPurityCheck === false) return true;
      let a = this.host?.account || {};
      if (typeof IP !== 'undefined' && IP.polling && (!IP.ip || !IP.at)) {
        await Promise.race([Promise.resolve(IP.polling), sleep(900)]).catch(() => {});
      }
      let curIp = typeof IP !== 'undefined' ? ((!IP.err && IP.ip) || a.status?.ip || '') : (a.status?.ip || '');
      if (!curIp && !a.proxyIp && !a.proxy && !(typeof IP !== 'undefined' && IP.err)) return true;
      let ipRep = (typeof IPRep !== 'undefined' && IPRep.cur) ? IPRep.cur(a, curIp) : null;
      const isTrusted = Boolean(typeof IPRep !== 'undefined' && IPRep.trusted && ((a.proxyIp && IPRep.trusted(a.proxyIp)) || (curIp && IPRep.trusted(curIp))));
      let isPure = Boolean(isTrusted || (ipRep && ipRep.label === '纯净' && (ipRep.pct == null || ipRep.pct >= 75) && !(typeof IP !== 'undefined' && IP.err)));
      if (isPure) return true;

      if (!(typeof IP !== 'undefined' && IP.err) && typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function') {
        const pre = await IPRep.ensurePreSendPure({ timeoutMs: 1200 }).catch(() => null);
        if (pre?.pure || pre?.switched) {
          if (pre?.switched) { try { Recaptcha.clearCache?.(); } catch {} }
          return true;
        }
        a = this.host?.account || a;
        curIp = typeof IP !== 'undefined' ? ((!IP.err && IP.ip) || pre?.eg || a.status?.ip || curIp) : (pre?.eg || curIp);
        ipRep = IPRep.cur ? IPRep.cur(a, curIp) : ipRep;
        isPure = Boolean(isTrusted || (ipRep && ipRep.label === '纯净' && (ipRep.pct == null || ipRep.pct >= 75) && !(typeof IP !== 'undefined' && IP.err)));
        if (isPure) return true;
        if (ipRep?.label === '未评估' && (!ipRep?.sc || !ipRep.sc.known)) return true;
      }

      const statusParts = [
        ipRep?.label || (typeof IP !== 'undefined' && IP.err ? '连接异常' : '未评估'),
        ipRep?.pct != null ? ipRep.pct + '%' : '',
        ipRep?.kind?.t ? ipRep.kind.t + ' IP' : '',
      ].filter(Boolean).join(' · ');
      const ipDesc = curIp ? `当前出口 ${curIp}（${statusParts}）` : `当前节点（${statusParts || '出口未就绪'}）`;

      const choice = await Dialog.open((box, done) => {
        const noBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => done('no') }, '否，直接发出');
        const yesBtn = h('button', { type: 'button', class: 'btn', onclick: () => done('yes') }, '是，去切换节点');
        box.append(
          h('div', { class: 'dlg-t' }, '请切换纯净 IP，否则会出人机验证'),
          h('div', { class: 'dlg-h', style: { whiteSpace: 'pre-line', lineHeight: '1.55' } },
            `检测到${ipDesc}不是纯净 IP。\n请切换纯净 IP，否则发送消息极易触发人机验证！\n\n是否现在跳出节点切换窗口手动切换？`),
          h('div', { class: 'dlg-row' },
            h('span', { class: 'grow' }),
            noBtn,
            yesBtn)
        );
        setTimeout(() => yesBtn.focus(), 35);
      });
      if (choice === 'yes') {
        try { if (typeof RegionIP !== 'undefined' && RegionIP.open) RegionIP.open(); } catch {}
        return false;
      }
      if (choice === 'no') return true;
      return false;
    } catch {
      return true;
    }
  },
  async retry(chat, lastUser, captcha) {
    if (chat.busy || chat._qBusy) { toast('上一条仍在处理，请稍候','err'); return; }
    if (!captcha && !(await this.confirmPureIpBeforeSend())) return;
    try {
      if (!chat.loaded && !chat.messages.length) {
        chat.error = null;
        await chat.reload('重试载入', true);
        return;
      }
      if (chat.isEvaluation) {
        const v2 = captcha ? await Recaptcha.v2() : null;
        await chat.regenerate({ v2 });
        return;
      }
      const uncertain = lastUser || [...chat.messages].reverse().find(m => m.role === 'user');
      if (uncertain?.deliveryUnknown && !await Dialog.confirm({ title: '发送状态尚未确认', text: '服务器可能已经收到这条消息。建议先刷新对话核对；现在重发可能产生重复消息。', ok: '仍要重发' })) return;
      const v2 = captcha ? await Recaptcha.v2() : null;
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      // 人机验证失败时服务端会回一条只有 error 的助手消息：去掉它，把上一条用户消息带着验证重新发出去
      const tail = chat.messages.at(-1);
      const pruned = typeof pruneDeadTailTurns === 'function' ? pruneDeadTailTurns(chat) : null;
      try { if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(chat, { pruneTail: false }); } catch {}
      const removedErrTail = !!(pruned || (tail?.role === 'assistant' && ((typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tail)) || ((tail.parts || []).length && tail.parts.every(p => p.type === 'error' || p.type === 'step-start')))));
      if (!pruned && removedErrTail && chat.messages.at(-1) === tail) chat.messages.pop();
      if (pruned?.lastUser) lastUser = pruned.lastUser;
      else if (!lastUser && chat.messages.at(-1)?.role === 'user') lastUser = chat.messages.at(-1);
      if (lastUser && removedErrTail) lastUser._streamRejected = true;
      const capFail = /recaptcha|captcha|人机验证|prompt failed/i.test(chat.error || '');
      if (lastUser && (lastUser.failed || capFail || removedErrTail)) { const retryTxt = (lastUser.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n') || String(lastUser.text || ''); await chat.send(retryTxt, { v2, files: lastUser.metadata?.uploads, retryOf: lastUser }); }
      else await chat.regenerate({ v2 });
    } catch (e) { if (!/取消/.test(e.message)) toast(describe(e), 'err'); }
  },
  async regen(chat) {
    try {
      const tail = chat?.messages?.at(-1);
      const isErrTail = !!(tail?.role === 'assistant' && ((typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tail)) || ((tail.parts || []).length && tail.parts.every(p => p.type === 'error' || p.type === 'step-start'))));
      if (isErrTail) { await this.retry(chat, null, false); return; }
      await chat.regenerate();
    } catch (e) { toast('重新生成失败：' + describe(e), 'err'); }
  },
  inputHistory: {
    KEY: 'inputHistory:v1',
    MAX: 100,
    _mem: null,
    load() {
      if (this._mem) return this._mem;
      try {
        const a = typeof Store !== 'undefined' && Store.get ? Store.get(this.KEY, []) : [];
        this._mem = Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : [];
      } catch { this._mem = []; }
      return this._mem;
    },
    push(text) {
      const t = String(text || '');
      if (!t.trim()) return;
      const list = this.load();
      const idx = list.lastIndexOf(t);
      if (idx >= 0) list.splice(idx, 1);
      list.push(t);
      if (list.length > this.MAX) list.splice(0, list.length - this.MAX);
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(this.KEY, list); } catch {}
    },
    forChat(chat) {
      const out = [];
      const add = s => {
        const t = String(s || '');
        if (!t.trim()) return;
        const idx = out.lastIndexOf(t);
        if (idx >= 0) out.splice(idx, 1);
        out.push(t);
      };
      for (const m of (chat?.messages || [])) {
        if (!m || m.role !== 'user' || m._autoContinue || m.metadata?.autoContinue) continue;
        const txt = (m.parts || []).filter(p => p && p.type === 'text' && p.text).map(p => p.text).join('\n');
        if (txt) add(txt);
      }
      for (const t of this.load()) add(t);
      return out.length > this.MAX ? out.slice(-this.MAX) : out;
    },
  },
  composer(tab, chat) {
    let slash;
    const P = this.pane;   // 这个输入框属于哪一页（手机上相邻窗口的页也有自己的输入框）：按钮状态 / 队列只改这一页
    try { Drafts.intoTab(tab); } catch {}
    const rcAct = () => chat ? (chat.real ? 'chat_submit' : 'agentic_chat_submit') : 'agentic_chat_submit';
    let histIdx = -1, histSavedDraft = tab.draft || '', histApplying = false;
    const ta = h('textarea', { rows: 1, 'data-tab': tab.key, placeholder: chat ? '继续对话…' : '想让它做什么？（Enter 发送）', onfocus: () => Recaptcha.warm(rcAct()), oninput: () => { if (!histApplying) { histIdx = -1; histSavedDraft = ta.value; } autosize(); tab.draft = ta.value; Drafts.setTab(tab); if (tab.sid && Chats.get(tab.sid)?.busy) this.withPane(P, () => this.syncComposer(Chats.get(tab.sid))); if (ta.value.trim()) Recaptcha.warm(rcAct()); clearTimeout(this.draftT); this.draftT = setTimeout(() => Tabs.save(), 400); } });
    ta.value = tab.draft || '';
    // 手机：文字快碰到厂商按钮（这一行放不下、要换行了）时，厂商按钮才移到发送按钮上方（带动画），输入框横向让出这一格；
    // 字数少、一行放得下时厂商按钮留在原位
    const fits = () => true;
    const autosize = () => {
      const b = ta.parentElement;
      if (b && b.classList.contains('cbox')) {
        b.classList.remove('has-txt', 'g-up', 'g-down');
      }
      // 统一两行输入框（上方文本、下方功能栏），高度按内容自适应生长
      const maxH = Math.round(Math.max(160, Math.min(innerHeight * (isMob() ? 0.35 : 0.45), 520)));
      ta.style.maxHeight = maxH + 'px'; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'; ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
    };
    const btn = h('button', { class: 'sendbtn', type: 'submit', title: '发送', 'aria-label': 'Send message', onclick: () => go() }, icon('send'));
    const chint = h('span', { class: 'chint' }, chat ? '' : '');
    // 附件：每个标签页各自一组。选中 / 粘贴 / 拖入的瞬间就在输入框里显示本地预览，同时后台开始上传（显示进度）；
    // 按发送不用等上传：消息立即出现在对话里，上传完成后自动发出（新对话需要附件才能创建，会等上传完成）
    const atts = this.atts.get(tab.key) || []; this.atts.set(tab.key, atts);
    const chips = h('div', { class: 'att-row' });
    // 排队中的消息（对话进行中时按「队列」加入；本轮结束后合并自动发出）
    const qrow = h('div', { class: 'q-row' });
    const paintQ = () => {
      const c = tab.sid ? Chats.get(tab.sid) : null, q = (c && typeof SendQ !== 'undefined' && typeof SendQ.of === 'function' ? SendQ.of(c) : c?.queue) || [], held = (c?.messages || []).filter(m => m._held);
      const qMode = SendQ.mode(c);
      const sig = q.map(i => i.id || i.at).join(',') + '|' + qMode + '|' + SendQ.status(c) + '|' + held.map(m => m.id).join(',');
      if (qrow._sig === sig) return; qrow._sig = sig;
      qrow.style.display = q.length || held.length ? '' : 'none';
      if (!q.length && !held.length) { qrow.replaceChildren(); return; }
      const heldText = m => (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ') || '（附件）';
      const heldRows = held.length ? [h('div', { class: 'q-h' }, h('i', { class: 'spin' }), h('b', {}, '等上一轮结束后发送'), h('span', { class: 'dim' }, '回复完会自动发出'), h('span', { class: 'grow' })),
        ...held.map(m => h('div', { class: 'q-it q-held' }, h('span', { class: 'q-t' }, heldText(m).replace(/\s*\n\s*/g, ' ⏎ ')), m._prev?.length ? h('span', { class: 'q-a' }, icon('file'), m._prev.length) : null))] : [];
      if (!q.length) { qrow.replaceChildren(...K(...heldRows)); return; }
      qrow.classList.toggle('q-split-mode', qMode === 'split');
      qrow.classList.toggle('q-merge-mode', qMode !== 'split');
      const renderQRowItem = (it, i) => h('div', { class: 'q-it ' + (qMode === 'split' ? 'q-split-card' : 'q-merge-row'), title: '点击查看完整队列', onclick: e => { if (!e.target.closest('.q-x, .q-act')) SendQ.view(c); } },
        h('span', { class: 'q-idx' }, String(i + 1)),
        h('span', { class: 'q-t' }, (it.text || '（附件）').replace(/\s*\n\s*/g, ' ⏎ ')), it.atts.length ? h('span', { class: 'q-a' }, icon('file'), it.atts.length) : null,
        h('button', { type: 'button', class: 'q-act q-ib q-copy', title: '复制该条内容', 'aria-label': '复制该条内容', onclick: e => { e.stopPropagation(); void SendQ.copy(c, it); } }, icon('copy')),
        h('button', { type: 'button', class: 'q-act q-ib q-recall', title: '撤回至输入框（连带附件一起恢复）', 'aria-label': '撤回至输入框', onclick: e => { e.stopPropagation(); SendQ.recall(c, it); } }, icon('undo')),
        h('button', { class: 'q-x q-ib', title: '移出队列', 'aria-label': '移出队列', onclick: () => { SendQ.remove(c, it); } }, icon('x')));
      const visibleItems = q.slice(0, 2).map(renderQRowItem);
      qrow.replaceChildren(...K(...heldRows,
        h('div', { class: 'q-h' },
          h('button', { type: 'button', class: 'q-mode ' + (qMode === 'split' ? 'is-split' : 'is-merge'), title: qMode === 'split' ? '当前：分列发送（每条单独卡片展示，等上一轮真正完成后逐条发出）；点击切换为合并发送' : '当前：合并发送（合并在一个长条框内展示并发送）；点击切换为分列发送', onclick: e => { e.stopPropagation(); SendQ.toggleMode(c); } }, qMode === 'split' ? '分列' : '合并'),
          icon('queue'), h('b', {}, '队列 ' + q.length + ' 条'), h('span', { class: 'dim' }, SendQ.status(c)), h('span', { class: 'grow' }),
          c.status === 'error' || !c.busy ? h('button', { class: 'q-now', onclick: async () => { if (await UI.confirmPureIpBeforeSend()) void SendQ.flush(c, { manual: true }); } }, '立即发送') : null,
          h('button', { class: 'q-clr', title: '清空队列', onclick: () => { SendQ.clear(c); } }, '清空')),
        ...(qMode === 'split' ? visibleItems : [h('div', { class: 'q-merge-card' }, ...visibleItems)]),
        q.length > 2 ? h('button', { class: 'q-more', onclick: () => SendQ.view(c) }, '还有 ' + (q.length - 2) + ' 条 · 查看全部') : null));
    };
    this.paintQ = paintQ;
    this.paintAtt = () => { try { paintAtt(); } catch {} };
    const paintAtt = () => {
      chips.replaceChildren(...atts.map(a => attView({ name: a.name, type: a.type, src: a.url, a }, false, () => { atts.splice(atts.indexOf(a), 1); try { a.url && URL.revokeObjectURL(a.url); } catch {} paintAtt(); })));
      chips.style.display = atts.length ? '' : 'none';
      Drafts.setTab(tab, atts);
      this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null));
    };
    const addFiles = list => {
      for (const f of list) {
        if (!f) continue;
        if (f.size > 100 * 1024 * 1024) { toast(f.name + ' 超过 100MB', 'err'); continue; }
        const type = Uploads.type(f), a = { name: f.name || 'file', size: f.size, type, state: 'up', stage: '', pct: 0, url: /^image\//.test(type) ? URL.createObjectURL(f) : null, subs: new Set() };
        // 进度刷新节流到 ~8 次/秒，带尾随刷新（不丢最后一次状态）
        let pt = 0, tt = 0; const fire = () => { tt = 0; pt = now(); for (const fn of a.subs) try { fn(); } catch {} };
        const tick = () => { if (a.state !== 'up') { clearTimeout(tt); return fire(); } if (tt) return; const d = 120 - (now() - pt); if (d <= 0) fire(); else tt = setTimeout(fire, d); };
        a.subs.add(() => { if (chips.isConnected) paintAtt(); });
        a.p = Uploads.upload(f, st => { a.stage = st; tick(); }, p => { a.pct = p; tick(); })
          .then(r => { a.res = r; a.state = 'ok'; a.pct = 1; tick(); return r; }, e => { a.state = 'bad'; a.err = describe(e); tick(); toast(a.name + '：' + a.err, 'err'); return null; });
        atts.push(a);
      }
      paintAtt(); Recaptcha.warm(chat ? undefined : 'agentic_chat_submit');
    };
    const fin = h('input', { type: 'file', multiple: true, style: 'display:none', onchange: () => { addFiles([...fin.files]); fin.value = ''; } });
    const isApiActive = () => typeof LocalApiGateway !== 'undefined' && LocalApiGateway.isBoundTo?.(tab?.sid);
    const openPlusMenu = e => {
      e.stopPropagation();
      if (e.shiftKey) { fin.click(); return; }
      const existing = document.querySelector('.menu.plus-menu:not(.anc-gh)');
      if (existing) { existing.remove(); return; }
      document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
      this._menuOpenAt = now();
      const curSid = tab?.sid || null;
      const curChat = curSid ? chatOf(curSid) : chat;
      const gwRunning = typeof LocalApiGateway !== 'undefined' && LocalApiGateway.isRunning?.();
      const gwState = typeof LocalApiGateway !== 'undefined' && LocalApiGateway.getState ? LocalApiGateway.getState() : null;
      const rawMod = (curSid && typeof Models !== 'undefined' && Models.get(curSid)?.name) || (curSid && typeof Trace !== 'undefined' && Trace.latest?.(curSid)?.best) || '';
      const modShort = rawMod ? (typeof cardName === 'function' ? cardName(rawMod) : rawMod) : '';
      const m = h('div', { class: 'menu plus-menu', onclick: ev => ev.stopPropagation() },
        h('button', { type: 'button', onclick: () => { m.remove(); fin.click(); } },
          icon('paperclip'),
          h('div', { class: 'pm-txt' },
            h('span', { class: 'pm-t' }, '添加附件'),
            h('small', {}, '上传图片或文件（支持粘贴与拖拽）')
          )
        ),
        typeof LocalApiGateway !== 'undefined' ? h('button', { type: 'button', class: gwRunning ? 'on' : '', onclick: () => { m.remove(); LocalApiGateway.openModal(curChat, tab); } },
          icon('api'),
          h('div', { class: 'pm-txt' },
            h('div', { class: 'pm-t-row' },
              h('span', { class: 'pm-t' }, 'API 反代导出'),
              gwRunning ? h('span', { class: 'gpill ok pm-pill' }, ':' + (gwState?.port || 18765)) : (modShort ? h('span', { class: 'tag pm-pill' }, modShort) : null)
            ),
            h('small', {}, '将当前对话转译为本地标准 API 接口')
          )
        ) : null
      );
      document.body.append(m);
      const r = plus.getBoundingClientRect();
      if (typeof placeInward === 'function') {
        placeInward(m, r, { pad: 8, gap: 6, useBottom: true, keepWidth: true });
      } else {
        m.style.left = Math.max(8, Math.round(r.left)) + 'px';
        m.style.bottom = Math.max(8, Math.round(innerHeight - r.top + 6)) + 'px';
      }
      setTimeout(() => {
        const off = ev => {
          if (!m.isConnected) { document.removeEventListener('pointerdown', off, true); return; }
          if (!m.contains(ev.target) && !plus.contains(ev.target)) {
            m.remove();
            document.removeEventListener('pointerdown', off, true);
          }
        };
        document.addEventListener('pointerdown', off, true);
      }, 0);
    };
    const plus = h('button', {
      class: 'ib attbtn' + (isApiActive() ? ' api-on' : ''),
      type: 'button',
      title: '展开工具：添加附件 / 本地 API 反代导出（按住 Shift 点击直接选文件）',
      'aria-label': 'Add files and connections',
      onclick: openPlusMenu,
    }, icon('plus'), h('i', { class: 'att-api-dot' }));
    ta.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
    const go = async () => {
      if (slash?.submit()) return;
      slash?.close();
      const c = tab.sid ? chatOf(tab.sid) : null;
      const command = Fingerprint.command(c, ta.value, { attachments: !!atts.length });
      if (command.handled) { if (command.accepted) { ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); } else toast(command.error, 'err'); return; }
      // 交互卡片（提问 / 计划 / 选图 / 选声音）没点：直接发这条消息时自动按官方 Skip 提交卡片并附带发送文字
      if (c && !c._qBusy && !this.sending && (ta.value.trim() || atts.length) && Hitl.skippable(c)) {
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再发送', 'err'); return; }
        if (!UI.me) { UI.loginGate('请先登录'); return; }
        if (!(await this.confirmPureIpBeforeSend())) return;
        let text = ta.value.trim(); const list = atts.slice();
        if (!text && list.length) text = '请查看附件：' + list.map(a => a.name).join('、');
        const filesP = list.length ? Promise.all(list.map(a => a.p)).then(rs => { if (rs.some(r => !r)) throw new Error('附件上传失败'); return rs; }) : null;
        this.sending = true; btn.disabled = true;
        const restore = { v: ta.value };
        if (restore.v.trim()) this.inputHistory.push(restore.v);
        histIdx = -1; histSavedDraft = '';
        ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); P.stick = true; atts.length = 0; paintAtt();
        const run = v2 => c.skipHitlSend(text, { ...(filesP ? { filesP, previews: list } : {}), ...(v2 ? { v2 } : {}) });
        try { await run().catch(async e => { if (e?.status === 403 && /recaptcha/i.test(e.body || '')) { toast('需要人机验证', 'err'); const tok = await Recaptcha.v2().catch(() => null); if (tok) return run(tok); } throw e; }); }
        catch (e) {
          toast(describe(e), 'err');
          if (!ta.value) { ta.value = restore.v; tab.draft = restore.v; autosize(); Tabs.save(); } if (!atts.length) { atts.push(...list); paintAtt(); }
        }
        finally { this.sending = false; btn.disabled = false; this.withPane(P, () => this.syncComposer(c)); }
        return;
      }
      if (Hitl.blocked(c) || c?._qBusy) {
        // 进行中：输入框有内容 = 加入队列；没内容 = 停止
        const qt = ta.value.trim();
        // 刚发出 0.7 秒内的再次点击（双击 / 连点）不当成停止：停止会打断这一轮回复
        if (!qt && !atts.length) { if (!c.busy || now() - (c.sentAt || 0) < 700) return; c.stop(); return; }
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再加入队列', 'err'); return; }
        if (qt) this.inputHistory.push(ta.value);
        if (!SendQ.add(c, qt, atts.slice())) return; histIdx = -1; histSavedDraft = ''; ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); atts.length = 0; paintAtt(); paintQ();
        return;
      }
      // 空闲但还有排队的（比如上一轮出错暂停了）：和这次输入合并一起发
      if (c && SendQ.of(c).length) {
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，请先移除', 'err'); return; }
        if (!(await this.confirmPureIpBeforeSend())) return;
        if (ta.value.trim() || atts.length) { if (ta.value.trim()) this.inputHistory.push(ta.value); if (!SendQ.add(c, ta.value.trim(), atts.slice())) return; histIdx = -1; histSavedDraft = ''; ta.value = ''; tab.draft = ''; atts.length = 0; autosize(); Tabs.save(); paintAtt(); }
        await SendQ.flush(c, { manual: true }); paintQ(); return;
      }
      const rawDraft = ta.value;
      let text = ta.value.trim(); if ((!text && !atts.length) || this.sending) return;
      if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再发送', 'err'); return; }
      if (!(await this.confirmPureIpBeforeSend())) return;
      if (rawDraft.trim()) this.inputHistory.push(rawDraft);
      histIdx = -1; histSavedDraft = '';
      if (!text && atts.length) text = '请查看附件：' + atts.map(a => a.name).join('、');
      this.sending = true; btn.disabled = true; (this.sendKeys ||= new Set()).add(tab.key); this.withPane(P, () => this.syncComposer(c || null));
      try {
        const list = atts.slice();
        const filesP = list.length ? Promise.all(list.map(a => a.p)).then(rs => { if (rs.some(r => !r)) throw new Error('附件上传失败：' + list.filter(a => a.state === 'bad').map(a => a.name + (a.err ? '（' + a.err + '）' : '')).join('、')); return rs; }) : null;
        if (c) {
          // 已有对话：立即清空输入框、消息立即显示，上传完成后自动发出
          await c.send(text, { ...(filesP ? { filesP, previews: list } : {}), onPrepared: () => {
            ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); P.stick = true; atts.length = 0; paintAtt();
            this.sending = false; btn.disabled = false;
          } });
        } else {
          let files = null;
          if (filesP) {
            const hint = chint, show = () => { if (hint && list.some(a => a.state === 'up')) hint.textContent = '上传附件 ' + Math.round(list.reduce((x, a) => x + (a.pct || 0), 0) / list.length * 100) + '%，完成后自动创建对话…'; };
            for (const a of list) a.subs.add(show); show();
            files = await filesP;
            if (hint) hint.textContent = '';
          }
          await this.startNew(tab, text, ta, null, files);
        }
      } catch (e) {
        toast(describe(e), 'err');
        if (!ta.value && rawDraft.trim()) {
          ta.value = rawDraft; tab.draft = rawDraft; Drafts.setTab(tab); autosize(); syncPmFromTa(); Tabs.save();
        }
      }
      finally { this.sending = false; btn.disabled = false; this.sendKeys?.delete(tab.key); this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null)); }
    };
    ta.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const curChat = tab.sid ? Chats.get(tab.sid) : chat;
        const items = this.inputHistory.forChat(curChat);
        if (items.length) {
          const val = ta.value || '';
          const selStart = typeof ta.selectionStart === 'number' ? ta.selectionStart : 0;
          const selEnd = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : val.length;
          const onFirstLine = !val.slice(0, selStart).includes('\n');
          const onLastLine = !val.slice(selEnd).includes('\n');
          if (e.key === 'ArrowUp' && (histIdx >= 0 || onFirstLine)) {
            e.preventDefault();
            if (histIdx < 0) {
              histSavedDraft = val;
              histIdx = items.length - 1;
            } else if (histIdx > 0) {
              histIdx = Math.min(items.length - 1, histIdx - 1);
            } else {
              histIdx = 0;
            }
            const nextVal = items[histIdx] ?? '';
            histApplying = true;
            try {
              ta.value = nextVal; tab.draft = nextVal; Drafts.setTab(tab); autosize(); syncPmFromTa();
              try { ta.setSelectionRange(nextVal.length, nextVal.length); } catch {}
              this.withPane(P, () => this.syncComposer(curChat || null));
            } finally { histApplying = false; }
            return;
          }
          if (e.key === 'ArrowDown' && histIdx >= 0 && onLastLine) {
            e.preventDefault();
            let nextVal = '';
            if (histIdx < items.length - 1) {
              histIdx++;
              nextVal = items[histIdx] ?? '';
            } else {
              histIdx = -1;
              nextVal = histSavedDraft || '';
            }
            histApplying = true;
            try {
              ta.value = nextVal; tab.draft = nextVal; Drafts.setTab(tab); autosize(); syncPmFromTa();
              try { ta.setSelectionRange(nextVal.length, nextVal.length); } catch {}
              this.withPane(P, () => this.syncComposer(curChat || null));
            } finally { histApplying = false; }
            return;
          }
        }
      }
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && ((Prefs.enterSend && !e.shiftKey && !e.ctrlKey && !e.metaKey) || (!Prefs.enterSend && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); if (!ta.value.trim() && !atts.length && tab.sid && Chats.get(tab.sid)?.busy) return; go(); }   // 进行中按回车：有内容 = 加入队列；空的不做任何事（停止只能点按钮）
    });
    setTimeout(() => { autosize(); }, 0);
    setTimeout(paintAtt, 0); setTimeout(paintQ, 0);
    const pm = h('div', { contenteditable: 'true', role: 'textbox', translate: 'no', class: 'tiptap ProseMirror prose prose-sm', tabindex: '-1', 'data-placeholder': 'What would you like to do?' }, h('p', { dir: 'auto', 'data-placeholder': 'What would you like to do?', class: 'is-empty is-editor-empty' }, h('br', { class: 'ProseMirror-trailingBreak' })));
    const pmWrap = h('div', { class: 'editor-content ext-pm-bridge' }, pm);
    let syncingPm = false, pmObserver = null;
    const syncPmFromTa = () => {
      if (syncingPm) return;
      syncingPm = true;
      try {
        const val = ta.value || '';
        const cur = (pm.textContent ?? '').replace(/\u200B/g, '');
        if (cur !== val) {
          if (!val) pm.innerHTML = '<p dir="auto" data-placeholder="What would you like to do?" class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>';
          else pm.textContent = val;
        }
        try { pmObserver?.takeRecords(); } catch {}
      } finally {
        queueMicrotask(() => { syncingPm = false; });
      }
    };
    const syncTaFromPm = () => {
      if (syncingPm || document.activeElement === ta) return;
      syncingPm = true;
      try {
        const raw = (pm.textContent ?? pm.innerText ?? '').replace(/\u200B/g, '').replace(/\r\n?/g, '\n');
        if (ta.value !== raw) {
          ta.value = raw; tab.draft = raw; Drafts.setTab(tab); autosize();
          this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null));
        }
      } finally { syncingPm = false; }
    };
    pm.addEventListener('input', syncTaFromPm);
    pmObserver = new MutationObserver(syncTaFromPm);
    pmObserver.observe(pm, { childList: true, subtree: true, characterData: true });
    ta.addEventListener('input', syncPmFromTa);
    syncPmFromTa();
    const resolvedMode = (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._resolveState === 'function')
      ? ModeSwitcher._resolveState(chat, tab).curMode
      : ((chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent')) || 'agent');
    const gpopBtn = GPop.btn();
    if (gpopBtn && resolvedMode === 'battle') {
      gpopBtn.style.display = 'none';
      gpopBtn.hidden = true;
    } else if (gpopBtn && resolvedMode === 'direct') {
      gpopBtn.style.display = 'none';
      gpopBtn.hidden = true;
    }
    const box = h('div', { class: 'cbox', 'data-mode': resolvedMode, onclick: e => { if (e.target === e.currentTarget) ta.focus(); },
      ondragover: e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); box.classList.add('drop'); } },
      ondragleave: () => box.classList.remove('drop'),
      ondrop: e => { box.classList.remove('drop'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } } },
      qrow, chips, ta, pmWrap, h('div', { class: 'crow' }, plus, fin, typeof ModeSwitcher !== 'undefined' ? ModeSwitcher.renderBar(tab, chat) : null, chint, h('span', { class: 'grow' }), Cap.btn(), gpopBtn, btn));
    const composer = h('div', { class: 'composer', 'data-mode': resolvedMode }, box);
    slash = SlashCommands.bind(composer, ta, { fingerprint: () => {
      const c = tab.sid ? chatOf(tab.sid) : null;
      const r = Fingerprint.command(c, '/测指纹', { attachments: !!atts.length });
      if (!r.accepted) toast(r.error, 'err');
      return !!r.accepted;
    } });
    return composer;
  },
  syncComposer(chat) {
    const comp = this.els?.composer || $('#view .composer'), btn = comp?.querySelector('.sendbtn'); if (!btn) return;
    const skipOk = !!chat && !chat._qBusy && !!Hitl.skippable(chat), key = this.pane.key || Tabs.cur?.key, busy = !skipOk && (Hitl.blocked(chat) || chat?._qBusy), ta = comp.querySelector('textarea'), atts = key ? this.atts.get(key) || [] : [];
    const typed = !!(ta?.value.trim() || atts.length);
    // 进行中：没输入 = 停止键；有输入 = 「队列」键（点了进队列，本轮结束后自动发）
    // 发送中（新对话创建 / 附件上传 / 已发出还没开始回复）：按钮里转圈，不然看起来像卡住了
    const submitting = (!busy && !!key && !!this.sendKeys?.has(key)) || (!typed && ((!!chat && chat.status === 'submitted' && !chat.live) || !!chat?._qBusy));
    const mode = submitting ? 'sending' : !busy ? 'send' : typed ? 'queue' : 'stop';
    if (btn.dataset.mode !== mode) {
      btn.dataset.mode = mode;
      btn.classList.toggle('stop', mode === 'stop'); btn.classList.toggle('queue', mode === 'queue'); btn.classList.toggle('sending', mode === 'sending');
      btn.replaceChildren(mode === 'sending' ? h('i', { class: 'spin' }) : icon(mode === 'queue' ? 'queue' : mode === 'stop' ? 'stop' : 'send'));
      btn.title = mode === 'sending' ? (busy ? '发送中…（再点一下可停止）' : '发送中…') : mode === 'queue' ? '加入队列：本轮结束后自动发送（可多次加入，合并成一条）' : mode === 'stop' ? '停止' : '发送';
      btn.setAttribute('aria-label', mode === 'stop' ? 'Stop generating' : 'Send message');
      btn.setAttribute('aria-busy', mode === 'sending' ? 'true' : 'false');
      const pmEl = comp.querySelector('.tiptap.ProseMirror');
      if (pmEl && ta && !ta.value && pmEl.textContent) {
        pmEl.innerHTML = '<p dir="auto" data-placeholder="What would you like to do?" class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>';
      }
    }
    this.paintQ?.();
  },
  async startNew(tab, text, ta, v2, files) {
    const hint = this.els?.composer?.querySelector('.chint') || $('#view .chint'); if (hint) hint.textContent = '正在创建对话…';
    // 像网页一样：点发送后立刻把自己的消息和「正在思考」放进对话区（乐观显示），不用干等 reCAPTCHA + create-chat 返回才有反应。
    // 创建成功后 showTab 会整页换成真实对话；失败就撤掉，恢复原来的欢迎页（输入框里的文字没清，可以直接重发）。
    const thread = this.els?.thread, hero = thread?.querySelector(':scope > .hero');
    const pend = thread && !thread.querySelector('.msg.pending') ? h('div', { class: 'pend-wrap' }, h('div', { class: 'msg user pending' }, h('div', { class: 'bubble' }, text)), h('div', { class: 'msg assistant pending' }, h('div', { class: 'msg-body typing-row' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')), h('span', { class: 'typing-st' }, '正在创建对话…')))) : null;
    if (pend) { hero?.remove(); thread.append(pend); if (this.els?.scroller) this.els.scroller.scrollTop = this.els.scroller.scrollHeight; }
    const unpend = () => { if (pend?.isConnected) { pend.remove(); if (hero && !thread.querySelector(':scope > .hero')) thread.append(hero); } };
    try {
      const c = await createChat(text, { v2, files });
      ta.value = ''; tab.draft = ''; this.atts.delete(tab.key); tab.sid = c.sid; tab.title = text.slice(0, 40); tab.touchedAt = now(); Tabs.enforceLimit(tab.key); Tabs.save();
      // createChat 已经把新对话放进侧栏了：这里只在没有时补一条（以前重复 unshift，侧栏出现两条一样的）
      if (!History.byId(c.sid)) History.items.unshift({ type: c.isEvaluation ? 'evaluation' : 'agentic', mode: c.evalMode || undefined, modality: c.modality || undefined, modelAId: c.modelAId || undefined, id: c.sid, title: text.slice(0, 60), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), _local: true });
      History.dedupe();
      this.renderList(); this.renderTabs(); this.showTab();
      History.auto('new');   // 新对话：20 秒内最多拉一次（第一轮回复完成时还会再排一次拿服务器标题）
    } catch (e) {
      unpend();
      if (hint) hint.textContent = '';
      if (e.status === 403 && /recaptcha/i.test(e.body || '')) {
        toast('需要人机验证', 'err');
        const tok = await Recaptcha.v2().catch(() => null);
        if (tok) return this.startNew(tab, text, ta, tok, files);
        return;
      }
      if (e.status === 429) { const q = Quota.chat; const wait = q?.retryAt ? Math.max(0, Math.ceil((q.retryAt - now()) / 60000)) : null; throw new Error('新对话额度用完（429）' + (wait ? `，约 ${wait} 分钟后恢复` : '')); }
      throw e;
    } finally { if (hint && hint.textContent === '正在创建对话…') hint.textContent = ''; }
  },
  renderProbeTestBtn(tab, chat, mode) {
    const curMode = mode || (chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent'));
    const isProbeRun = Boolean(chat && chat._isMicroProbe && chat.busy);
    return h('button', {
      type: 'button',
      class: 'ib probebtn' + (isProbeRun ? ' run' : ''),
      'data-mode': curMode,
      'aria-label': isProbeRun ? '停止探针测试' : '微缩探针测试',
      disabled: Boolean(chat && chat.busy && !isProbeRun),
      title: isProbeRun
        ? '停止当前微缩探针测试'
        : '微缩探针测试：点一下直接发送 35～45 行 HTML+SVG 微缩徽章探针测试题',
      onclick: e => {
        e.stopPropagation();
        if (typeof PelicanTest !== 'undefined' && typeof PelicanTest.runQuickTest === 'function') {
          void PelicanTest.runQuickTest('habit', { tab: tab || Tabs.cur, chat, mode: curMode });
        }
      },
    }, icon('fingerprint'));
  },
  renderPelicanMenuBtn(tab, chat, mode) {
    const curMode = mode || (chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent'));
    const isPelRun = Boolean(chat && ((typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat)) || (chat.isEvaluation && chat._isPelicanTest && chat.busy)));
    const probeBtn = this.renderProbeTestBtn(tab, chat, curMode);
    const pelBtn = h('button', {
      type: 'button',
      class: 'ib pel-test-btn pelbtn' + (isPelRun ? ' run' : ''),
      'data-mode': curMode,
      'aria-label': isPelRun ? '停止鹈鹕测试' : '鹈鹕测试',
      disabled: Boolean(chat && chat.busy && !isPelRun),
      title: isPelRun
        ? '停止当前鹈鹕测试'
        : '鹈鹕测试：点一下直接发送 2D 鹈鹕骑车动态 SVG 标准测试题',
      onclick: e => {
        e.stopPropagation();
        if (typeof PelicanTest !== 'undefined' && typeof PelicanTest.runQuickTest === 'function') {
          void PelicanTest.runQuickTest('pelican', { tab: tab || Tabs.cur, chat, mode: curMode });
        } else if (chat && typeof PelicanTest !== 'undefined' && typeof PelicanTest.start === 'function') {
          void PelicanTest.start(chat);
        }
      },
    }, icon('pelican'));
    return [probeBtn, pelBtn];
  },
  async sendQuickTestPrompt(prompt, opts = {}) {
    const text = String(prompt || '').trim();
    if (!text) return null;
    const kind = String(opts.kind || 'pelican').toLowerCase();
    const tab = opts.tab || (typeof Tabs !== 'undefined' ? (Tabs.cur || Tabs.newChat()) : null);
    const chat = opts.chat || (tab?.sid && typeof Chats !== 'undefined' ? Chats.get(tab.sid) : null);
    if (chat && chat.sid) {
      if (chat.busy || chat.sending) {
        if (typeof toast === 'function') toast('当前对话正在生成中，请稍候', 'err');
        return null;
      }
      if (kind === 'habit' || kind === 'micro' || kind === 'probe') chat._isMicroProbe = true;
      if (kind === 'pelican' || kind === 'svg') chat._isPelicanTest = true;
      if ((kind === 'pelican' || kind === 'svg') && !chat.isEvaluation && typeof PelicanTest !== 'undefined' && typeof PelicanTest.start === 'function') {
        return PelicanTest.start(chat);
      }
      await chat.send(text, []);
      return { ok: true, kind, prompt: text, chat };
    }
    const ta = this.els?.composer?.querySelector?.('textarea')
      || (typeof document !== 'undefined' ? document.querySelector?.('#view .composer textarea') : null)
      || { value: '' };
    await this.startNew(tab, text, ta, null, []);
    const created = (tab?.sid && typeof Chats !== 'undefined') ? Chats.get(tab.sid) : null;
    if (created) {
      if (kind === 'habit' || kind === 'micro' || kind === 'probe') created._isMicroProbe = true;
      if (kind === 'pelican' || kind === 'svg') created._isPelicanTest = true;
    }
    return { ok: true, kind, prompt: text, chat: created };
  },
  renderQuota() { Bar.render(); },
  renderIP() { this.renderAcct(); },
};

// ---- 页（pane）：手机上当前页和左右相邻的页都是完整的真页面。UI.els / cache / stick / paintQ 指向「当前正在渲染的页」----
UI.pane = { key: null, el: null, els: null, cache: new Map(), stick: true, paintQ: null };
for (const k of ['els', 'cache', 'stick', 'paintQ']) { const v0 = UI[k]; delete UI[k]; Object.defineProperty(UI, k, { configurable: true, get() { return this.pane[k]; }, set(v) { this.pane[k] = v; } }); if (v0 !== undefined) UI.pane[k] = v0; }
UI.withPane = function (P, fn) { const o = this.pane; this.pane = P; try { return fn(); } finally { this.pane = o; } };

// Coalesce presentation work, not chat events. Hidden windows keep receiving/persisting messages without repainting.
const ChatPaint=RenderWork.create({
  visible:()=>!document.hidden,mobile:()=>isMob(),current:()=>UI.els?.chat,
  state:c=>c.status+'|'+(c.error||''),
  stamp:c=>[chatState(c),c.title,!!c.loaded,Models.get(c.sid),c.voteState?.voted,c.voteState?.submitting,c.voteState?.value,c.evalMode,c.modality],
  park:c=>{if(UI.els?.chat===c)UI.pane.dirty=true;else Pager.dirty(c);},
  paint:c=>{if(UI.els?.chat===c){UI.renderChat(c);UI.pane.dirty=false;}else Pager.dirty(c);},
  metadata:()=>{UI.renderTabs();UI.renderListSoon();},error:e=>console.warn('Chat paint:',e),
});
function scheduleChat(chat){ChatPaint.add(chat);}
// 侧栏重绘（1500 条会话一次 20~30ms，手机上更慢）：手机抽屉没打开 / 窗口在后台时不画，只记脏，空闲时补画；打开抽屉前一定补上
UI.listDirty = false;
UI.listIdle = () => { if (UI.listIdleT) return; const run = () => { UI.listIdleT = 0; if (UI.listDirty && !document.hidden && (!isMob()||document.body.classList.contains('drawer'))) UI.renderList(); }; UI.listIdleT = window.requestIdleCallback ? requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 1500); };
UI.renderListSoon = () => {
  if (UI.listT) return;   // 节流（不是防抖）：连续来事件（拉全部历史每页一次）也保证按时画，不会一直往后推
  UI.listT = setTimeout(() => {
    UI.listT = 0;
    if (document.hidden || (isMob() && !document.body.classList.contains('drawer'))) { UI.listDirty = true; return; }
    UI.renderList();
  }, History.fullLoading ? 1200 : 250);
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.listDirty) UI.listIdle(); });
// 手机抽屉打开时补画侧栏。注意：UI.build() 会用 documentElement.innerHTML 重建整个 <body>，
// 之前挂在旧 body 上的 MutationObserver 随之失效（抽屉打开不再触发补画 → 侧栏空白、改名不同步，只有搜索才会直接 renderList）。
// 所以每次 build 之后都要重新挂到当前的 body 上。
UI.watchDrawer = () => {
  const body = document.body; if (!body) return;
  if (UI._drawerMO && UI._drawerBody === body) return;
  try { UI._drawerMO?.disconnect(); } catch {}
  UI._drawerBody = body; UI.drawerWas = body.classList.contains('drawer');
  UI._drawerMO = new MutationObserver(() => {
    const dr = body.classList.contains('drawer');
    if (dr === UI.drawerWas) return; UI.drawerWas = dr; if (!dr) return;
    if (UI.listDirty || ($('#list') && !$('#list').children.length && History.items.length)) UI.renderList();
    try { if (now() - LaunchPick.cacheAt > 15e3) setTimeout(() => LaunchPick.preload(), 260); } catch {}
  });
  UI._drawerMO.observe(body, { attributes: true, attributeFilter: ['class'] });
};
if (document.body) UI.watchDrawer(); else document.addEventListener('DOMContentLoaded', () => UI.watchDrawer(), { once: true });
// No hidden-window DOM timer. On return, present the latest state once and then resume normal scheduling.
document.addEventListener('visibilitychange',()=>{if(document.hidden)ChatPaint.hide();else{ChatPaint.resume();Pager.ensureSoon();if(!Pager.dT)Pager.dT=setTimeout(()=>Pager.flushDirty(),800);}});
// 已用时
// 计时：用实时的 class 集合（不用每秒全文档按属性查一遍），后台 / 没有计时的时候什么都不做
try { Tabs.enforceLimit(Tabs.active); Tabs.save(); } catch {}
if (typeof Bus !== 'undefined') {
  Bus.on('history', () => { try { Tabs.enforceLimit(Tabs.active); Tabs.save(); } catch {} });
  Bus.on('modechange', () => { try { UI.renderList(); UI.renderTabs?.(); UI.showTab(); } catch {} });
  Bus.on('modalitychange', () => { try { UI.showTab(); } catch {} });
  Bus.on('directmodelchange', () => { try { UI.showTab(); } catch {} });
  Bus.on('eval:vote-revealed', () => { try { if (UI.els?.chat) UI.renderChat(UI.els.chat, true); UI.renderTabs?.(); UI.renderListSoon?.(); } catch {} });
  Bus.on('eval:stream', payload => { try { if (payload?.chat && UI.els?.chat === payload.chat) scheduleChat(payload.chat); } catch {} });
}
const SINCE = document.getElementsByClassName('anc-since');
setInterval(() => {
  if (document.hidden || !SINCE.length) return;
  for (const e of [...SINCE]) {
    const s = Number(e?.dataset?.since);
    if (!Number.isFinite(s) || s <= 1e12) {
      if (e.textContent) e.textContent = '';
      continue;
    }
    const t = ' ' + Math.max(0, Math.floor((now() - s) / 1000)) + 's';
    if (e.textContent !== t) e.textContent = t;
  }
}, 1000);
try {
  const _scrollHideTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const _markScrolling = el => {
    if (!el || !el.classList || !_scrollHideTimers) return;
    el.classList.add('is-scrolling');
    const prev = _scrollHideTimers.get(el);
    if (prev) clearTimeout(prev);
    _scrollHideTimers.set(el, setTimeout(() => {
      _scrollHideTimers.delete(el);
      try { el.classList.remove('is-scrolling'); } catch {}
    }, 700));
  };
  document.addEventListener('scroll', e => {
    const t = (e.target === document || e.target === document.documentElement)
      ? (document.scrollingElement || document.documentElement)
      : e.target;
    _markScrolling(t);
  }, { capture: true, passive: true });
} catch {}
