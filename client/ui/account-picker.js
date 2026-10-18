// Account picker presentation only. Name edits use a dedicated native operation:
// never round-trip public/lite account objects through saveAccount (Android clears omitted proxies).
const AccountPicker = {
  renamed: new Map(), refreshJob: null, checkTimer: 0, lastCheckAt: 0,
  refreshAll() {
    if (!this.refreshJob) this.refreshJob = Promise.resolve().then(() => Host.refreshQuotas()).finally(() => { this.refreshJob = null; });
    return this.refreshJob;
  },
  checkIntervalMs() {
    const h = Number(typeof Prefs !== 'undefined' ? Prefs.acctCheckHours : 6);
    const hrs = Number.isFinite(h) ? Math.max(0, Math.min(168, h)) : 6;
    return hrs > 0 ? hrs * 3600000 : 0;
  },
  async checkAvailability(force = false) {
    if (!Host.refreshQuotas) return null;
    const iv = this.checkIntervalMs();
    if (!force && iv > 0 && this.lastCheckAt && now() - this.lastCheckAt < Math.min(iv, 60000)) return null;
    this.lastCheckAt = now();
    try {
      const res = await this.refreshAll();
      if (typeof LaunchPick !== 'undefined') LaunchPick.cache = null;
      return res;
    } catch { return null; }
  },
  startCheckTimer(runOnStart = false) {
    if (typeof window !== 'undefined' && (window.__routeFixture || window.__fixture)) return;
    if (typeof clearInterval === 'function' && this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = 0; }
    if (typeof clearTimeout === 'function' && this.startDelayTimer) { clearTimeout(this.startDelayTimer); this.startDelayTimer = 0; }
    const iv = this.checkIntervalMs();
    if (runOnStart && iv > 0 && typeof setTimeout === 'function') {
      this.startDelayTimer = setTimeout(() => { this.startDelayTimer = 0; void this.checkAvailability(false); }, 45000);
    }
    if (iv > 0 && typeof setInterval === 'function') {
      this.checkTimer = setInterval(() => { void this.checkAvailability(false); }, iv);
    }
  },
  contextMenu(event, card, account, root, remove, allowed) {
    if (event.defaultPrevented || event.target.closest('button,input,textarea,select,[contenteditable]')) return () => {};
    event.preventDefault(); event.stopPropagation();
    const rect = card.getBoundingClientRect(), x = event.clientX || rect.left + 20, y = event.clientY || rect.top + 20;
    const menu = h('div', { class: 'menu acct-context', role: 'menu', 'aria-label': '账号操作', style: { left: Math.max(8, Math.min(x, innerWidth - 188)) + 'px', top: Math.max(8, Math.min(y, innerHeight - 60)) + 'px' } });
    const item = h('button', { type: 'button', class: 'danger', role: 'menuitem', disabled: !allowed, title: allowed ? '删除本机保存的账号，不注销云端账号' : '至少保留一个账号，或等待当前删除完成', onclick: ev => { ev.preventDefault(); ev.stopPropagation(); stop(); void remove(account.id); } }, icon('trash'), '删除账号');
    menu.append(item); document.body.append(menu); if (typeof placeInward === 'function') placeInward(menu, { left: x, right: x, top: y, bottom: y }, { pad: 8, gap: 4, keepWidth: true, keepHeight: true });
    let stopped = false;
    const stop = (focus = false) => { if (stopped) return; stopped = true; menu.remove(); observer.disconnect(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); root.removeEventListener('scroll', scroll, true); removeEventListener('resize', scroll); if (focus && card.isConnected) card.focus({ preventScroll: true }); };
    const outside = ev => { if (!menu.contains(ev.target)) stop(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stop(true); } else if (ev.key === 'Tab') stop(); };
    const scroll = () => stop();
    const observer = new MutationObserver(() => { if (!root.isConnected || !menu.isConnected || !card.isConnected) stop(); }); observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); root.addEventListener('scroll', scroll, true); addEventListener('resize', scroll);
    item.focus({ preventScroll: true }); return stop;
  },
  name(a) { const remark = String(a?.remark || '').trim(), email = String(a?.email || '').trim(); return remark || email.split('@')[0] || '账号'; },
  // 浏览器模式里已登录的第三方网站：主进程按该账号分区里的 Cookie 判断后写在 a.sites（只有布尔值），目前只有 GitHub
  SITES: [{ id: 'github', label: 'GitHub', icon: 'github' }],
  sites(a) { const s = a?.sites; return s && typeof s === 'object' ? this.SITES.filter(x => s[x.id] === true) : []; },
  siteBadges(a) { const list = this.sites(a); return list.length ? h('span', { class: 'acct-sites' }, ...list.map(x => h('span', { class: 'site-ic', role: 'img', title: '此账号已登录 ' + x.label, 'aria-label': '已登录 ' + x.label }, icon(x.icon)))) : null; },
  normalize(s) { return String(s || '').normalize('NFKC').trim().toLocaleLowerCase(); },
  match(a, query) { const q = this.normalize(query); return !q || this.normalize(this.name(a)).includes(q); },
  select(accounts, query = '', page = 0) {
    const rows = accounts.filter(a => this.match(a, query)), pages = Math.max(1, Math.ceil(rows.length / 20));
    page = Math.max(0, Math.min(pages - 1, Number.isInteger(page) ? page : 0));
    return { rows, pages, page, visible: rows.slice(page * 20, (page + 1) * 20) };
  },
  mergeRead(rows, readAt = null) {
    // A read already in flight when an edit commits may contain the old name.
    for (const [id, x] of this.renamed) if (now() - x.at > 15000) this.renamed.delete(id);
    return rows.map(a => { const x = this.renamed.get(a.id); if (!x) return a;
      if (readAt != null && readAt > x.at && a.remark === x.name) { this.renamed.delete(a.id); return a; } return { ...a, remark: x.name }; });
  },
  balance(a) {
    const q = {...(a?.status?.quota || {}),usd:null,allowance:null};
    // Pulse is the only supported balance display, including imported old account caches.
    const p = Number.isFinite(q.pulse) ? q.pulse : null;
    return { q, pct: p == null ? null : Math.max(0, Math.min(100, p)) };
  },
  quota(a) { const q = a?.status?.quota || {}; return Number.isFinite(q.chatRemaining) ? Math.max(0, q.chatRemaining) + (Number.isFinite(q.chatLimit) ? '/' + Math.max(0, q.chatLimit) : '') : '—/—'; },
  progress(a, g = {}) {
    const total = g.total || '—', done = g.done || 0;
    if (g.cap) return '抽卡中 ' + done + '/' + total + ' · 需要人机验证';
    if (g.busy) return '抽卡中 ' + done + '/' + total + (g.hits ? ' · 命中 ' + g.hits : '') + (g.phase ? ' · ' + g.phase : '');
    if (g.err) return '抽卡已停：' + g.err;
    if (g.done) return '上次抽卡 ' + done + '/' + total + (g.hits ? ' · 命中 ' + g.hits : '') + ' · ' + this.quota(a);
    const q = a?.status?.quota || {};
    return this.quota(a) + (q.blockedUntil > now() && !(q.chatRemaining > 0) ? ' · 限流至 ' + fmtClock(q.blockedUntil) : '');
  },
  compactProgress(a, g = {}) {
    const running = !!(g.busy || g.cap), q = a?.status?.quota || {};
    const limited = !running && q.blockedUntil > now() && !(q.chatRemaining > 0);
    const finite = Number.isFinite(g.total) && g.total > 0;
    return { quota: this.quota(a), visible: running || !!g.err || limited, running,
      indeterminate: running && !finite, pct: running && finite ? Math.max(0, Math.min(100, (Number(g.done) || 0) / g.total * 100)) : 0,
      text: running ? '抽卡中 ' + (g.done || 0) + '/' + (finite ? g.total : '—') + (g.cap ? ' · 需要人机验证' : g.phase ? ' · ' + g.phase : '') : g.err ? this.progress(a, g) : limited ? '限流至 ' + fmtClock(q.blockedUntil) : '' };
  },
  paintRun(c, g) {
    const el = c.querySelector('.acct-run'); if (!el) return;
    if (c.classList.contains('acct-compact')) {
      const state = this.compactProgress(c._account, g), quota = c.querySelector('.acct-quota');
      if (quota.textContent !== state.quota) quota.textContent = state.quota;
      const key = JSON.stringify(state); if (c._compactRun === key) return; c._compactRun = key;
      el.hidden = !state.visible; el.classList.toggle('on', state.running); el.classList.toggle('err', !state.running && state.visible); el.classList.toggle('indeterminate', state.indeterminate);
      el.querySelector('.acct-run-text').textContent = state.text; el.title = state.text;
      el.querySelector('.acct-run-fill').style.width = (state.indeterminate ? 100 : state.pct) + '%';
      el.setAttribute('role', state.running ? 'progressbar' : 'status'); el.setAttribute('aria-label', state.running ? '抽卡进度' : '账号状态'); el.setAttribute('aria-valuetext', state.text);
      for (const key of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow']) el.removeAttribute(key);
      if (state.running && !state.indeterminate) { el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100'); el.setAttribute('aria-valuenow', String(Math.round(state.pct))); }
      return;
    }
    const text = this.progress(c._account, g); if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('on', !!g.busy || !!g.cap); el.classList.toggle('err', !g.busy && !!g.err);
    el.title = (g.busy || g.cap || g.err ? text : '新对话剩余 / 上限：' + this.quota(c._account));
  },
  paintBalance(c, a) {
    c._account = a;
    const isCur = c.dataset?.cur === '1' || c.classList.contains('cur');
    const st = a?.status || {};
    c.classList.toggle('is-bad', st.loggedIn === false);
    c.classList.toggle('is-bg', !isCur && !!(a?.win || a?.live || st.gacha?.busy || st.statsBusy));
    const { q, pct } = this.balance(a), money = Number.isFinite(q.usd) ? '余额 $' + q.usd.toFixed(2) + (Number.isFinite(q.allowance) ? ' / $' + q.allowance.toFixed(2) : '') : pct == null ? 'Pulse 未知' : 'Pulse '+Math.round(pct)+'%';
    const key = JSON.stringify([pct, money, st.loggedIn, a?.win, a?.live]); if (c._balance === key) return; c._balance = key;
    c.style.setProperty('--fp', (pct == null ? 0 : pct) + '%');
    const p = c.querySelector('.acct-pct'), m = c.querySelector('.acct-money');
    if (p) { p.textContent = pct == null ? '—%' : Math.round(pct) + '%'; p.title = pct == null ? '余额百分比未知' : (Number.isFinite(q.usd) && q.allowance > 0 ? '余额剩余 ' : 'Pulse 剩余 ') + pct.toFixed(1) + '%'; }
    const used = c.querySelector('.acct-used'); if (used) used.textContent = Number.isFinite(q.usd) && Number.isFinite(q.allowance) ? '已用 $' + Math.max(0, q.allowance - q.usd).toFixed(2) : '';
    if (m) { m.textContent = c.classList.contains('acct-compact') && Number.isFinite(q.usd) ? '$' + q.usd.toFixed(2).replace(/\.00$/, '') + (Number.isFinite(q.allowance) ? '/$' + q.allowance.toFixed(2).replace(/\.00$/, '') : '') : money; m.title = Number.isFinite(q.usd) && Number.isFinite(q.allowance) ? money + ' · 已用 $' + Math.max(0, q.allowance - q.usd).toFixed(2) : money; }
  },
  editButton(a, changed) {
    const b = h('button', { type: 'button', class: 'ib acct-edit', title: '编辑账号备注', 'aria-label': '编辑账号备注：' + this.name(a),
      onclick: ev => { ev.preventDefault(); ev.stopPropagation(); void this.rename(a, changed); } }, icon('edit'));
    return b;
  },
  async rename(a, changed) {
    if (!Host.renameAccount) { toast('当前宿主不支持安全改名，请更新客户端', 'err'); return; }
    await Dialog.open((box, done) => {
      let busy = false;
      const inp = h('input', { class: 'dlg-in', maxlength: '40', 'aria-label': '账号备注', value: this.name(a), autocomplete: 'off' });
      const error = h('div', { class: 'acct-edit-error', role: 'alert' });
      const save = async () => {
        if (busy) return;
        const name = inp.value.trim();
        if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) { error.textContent = '名称须为 1–40 个字符，不能包含控制字符'; return; }
        busy = true; ok.disabled = true; inp.disabled = true; error.textContent = '';
        try {
          const result = await Host.renameAccount(a.id, name);
          if (!result?.ok || result.id !== a.id || result.name !== name) throw Error(result?.error || '备注保存失败，请重试');
          a.remark = name; this.renamed.set(a.id, { name, at: now() });
          if (UI.host?.account?.id === a.id) UI.host.account.remark = name;
          if (Array.isArray(UI.host?.accounts)) for (const x of UI.host.accounts) if (x.id === a.id) x.remark = name;
          if (Array.isArray(LaunchPick.cache)) for (const x of LaunchPick.cache) if (x.id === a.id) x.remark = name;
          document.querySelectorAll('.gacct').forEach(b => { if (b.dataset.acct === a.id) b.dataset.name = name; });
          if (GPop.target?.id === a.id) GPop.target.name = name;
          done(true); changed?.(a); toast('账号备注已保存');
        } catch (e) { error.textContent = describe(e); busy = false; ok.disabled = false; inp.disabled = false; inp.focus(); }
      };
      const ok = h('button', { type: 'button', class: 'btn', onclick: save }, '保存');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void save(); } });
      box.append(h('div', { class: 'dlg-t' }, '编辑账号备注'), h('div', { class: 'dlg-h' }, '用于显示和搜索；不会更改邮箱、代理、密码或登录状态。'), inp, error,
        h('div', { class: 'dlg-row' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => done(null) }, '取消'), ok));
    });
  },
  search(changed, value = '') {
    const input = h('input', { type: 'search', placeholder: '搜索账号名称', 'aria-label': '搜索账号名称', autocomplete: 'off', spellcheck: 'false', maxlength: '160', value });
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; changed(input.value); });
    input.addEventListener('input', () => { if (!composing) changed(input.value); });
    const clear = h('button', { type: 'button', class: 'ib', title: '清空搜索', onclick: () => { input.value = ''; changed(''); input.focus(); } }, icon('x'));
    return h('div', { class: 'acct-search' }, icon('search'), input, clear);
  },
  // 搜索默认收起：顶部放大镜按钮点开（自动聚焦），再点 / Esc 收起（有内容时先清空）
  searchToggle(box) {
    box.hidden = !box.querySelector('input')?.value;
    const input = box.querySelector('input'), b = h('button', { type: 'button', class: 'ib acct-sbtn', title: '搜索账号', 'aria-label': '搜索账号', 'aria-expanded': String(!box.hidden) }, icon('search'));
    const set = on => { box.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('on', on); if (on) setTimeout(() => input?.focus(), 0); };
    b.onclick = ev => { ev.stopPropagation(); if (box.hidden) set(true); else { if (input?.value) { input.value = ''; input.dispatchEvent(new Event('input')); } set(false); } };
    input?.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); if (input.value) { input.value = ''; input.dispatchEvent(new Event('input')); } set(false); b.focus(); } });
    b.classList.toggle('on', !box.hidden); return b;
  },
  // 底部一排圆角方形按钮：搜索 · 账户管理 ·【添加账号】（中间、最大）· 导入 · 导出（顶部只留刷新和关闭）
  dock(search, close) {
    const ib = (ic, title, f, cls = '') => h('button', { type: 'button', class: 'adk-b' + cls, title, 'aria-label': title, onclick: ev => { ev.stopPropagation(); close(); f(); } }, icon(ic));
    const s = this.searchToggle(search); s.className = 'adk-b acct-sbtn' + (s.classList.contains('on') ? ' on' : '');
    return h('div', { class: 'acct-dock', role: 'toolbar', 'aria-label': '账号操作' },
      s, ib('user', '账户管理（账号设置 · 密码）', () => UI.accounts?.()),
      ib('plus', '添加账号', () => UI.addAccount?.(), ' adk-big'),
      ib('download', '导入账号', () => UI.importAccounts?.()), ib('upload', '导出账号', () => UI.exportAccounts?.()));
  },
  async open(e, initialPage = 0) {
    const anc = (e?.currentTarget?.getBoundingClientRect ? e.currentTarget : $('#acct'))?.getBoundingClientRect() || { left: 10, top: 58, bottom: 58 };
    const up = anc.top > innerHeight / 2, width = Math.min(384, innerWidth - 16), height = Math.min(650, innerHeight - 16, Math.max(260, (up ? anc.top : innerHeight - anc.bottom) - 16));
    const y = Math.max(8, Math.min(innerHeight - height - 8, up ? anc.top - height - 6 : anc.bottom + 6));
    const root = h('div', { class: 'menu amenu acct-menu', role: 'dialog', 'aria-label': '选择账号', style: { left: Math.max(8, Math.min(anc.left, innerWidth - width - 8)) + 'px', top: y + 'px', width: width + 'px', height: height + 'px' } });
    let management = null, wheelStop = () => {}, pollStop = () => {}, resizeStop = () => {}, query = '', page = initialPage, accounts = [], cards = [], generation = 0, building = false;
    const alive = () => root.isConnected;
    const removed = new Set(), deleting = new Set(); let contextStop = () => {};
    const close = () => { contextStop(); generation++; wheelStop(); pollStop(); resizeStop(); management?.dispose(); root.remove(); };
    const body = h('div', { class: 'acct-menu-body' }); root.append(body);
    body.append(h('div', { class: 'amenu-h' }, h('b', {}, '正在读取账号…'), h('span', { class: 'grow' }), h('button', { class: 'ib', title: '关闭', onclick: close }, icon('x')))); document.body.append(root); resizeStop = AccountPanelSize.attach(root);
    await PanelWork.frame(); if (!alive()) return;
    try { if (typeof Shared !== 'undefined' && Shared.pull) await Shared.pull(); } catch {}
    try { const readAt = now(); const L = await PanelWork.wait(() => Host.listAccounts(true)); if (!Array.isArray(L)) throw Error('账号列表不可用'); accounts = this.mergeRead(L, readAt); }
    catch (err) { if (alive()) body.append(h('p', { role: 'status' }, '账号读取失败：' + describe(err)), h('button', { onclick: () => { close(); void UI.acctMenu(); } }, '重试')); return; }
    if (!alive()) return;
    const cur = UI.host?.account?.id, list = h('div', { class: 'acct-list lp-list', 'aria-label': '账号卡片' }), pager = h('div', { class: 'lp-pages' }), count = h('span', { class: 'dim' });
    management = AccountManagement.create(root, list, () => accounts, () => query);
    const enter = a => { close(); if (a.id !== cur) Host.openAccount(a.id); };
    const updateStates = () => { for (const c of cards) { const g = GPop.acctState(c._id, c._id === cur); if (c._g) GPop.paintAcct(c._g, g); this.paintRun(c, g); management.paint(c, c._account); } };
    const render = async () => {
      contextStop(); const run = ++generation; building = true; wheelStop(); management.beforeRender(); cards = [];
      // 旧卡片先留在原地（照样能点），新卡片全部搭好后一次换上。以前一开始就清空列表，重建期间（每 4 张让出一帧）点卡片会落空
      const selection = this.select(accounts, query, page); page = selection.page; count.textContent = selection.rows.length + ' / ' + accounts.length;
      pager.hidden = selection.pages <= 1;
      pager.replaceChildren(h('button', { class: 'btn ghost sm', disabled: page === 0, onclick: () => { page--; void render(); } }, '上一页'), h('span', {}, (page + 1) + ' / ' + selection.pages),
        h('button', { class: 'btn ghost sm', disabled: page >= selection.pages - 1, onclick: () => { page++; void render(); } }, '下一页'));
      const next = [], indexes = new Map(accounts.map((a, i) => [a.id, i]));
      for (const a of selection.visible) {
        const isCur = a.id === cur, isBg = !isCur && !!(a.win || a.live || a.status?.gacha?.busy || a.status?.statsBusy), g = Host.gachaAccount || isCur ? GPop.acctBtn(a, isCur) : null, i = indexes.get(a.id);
        if (g) g.dataset.name = this.name(a);
        const c = acctCard(a, { isCur, g, tags: K(isCur ? h('span', { class: 'tagb' }, '当前') : isBg ? h('span', { class: 'tagb bg-run' }, '后台') : null, a.status?.loggedIn === false ? h('span', { class: 'tagb bad' }, '登录异常') : null, !a.hasPw && a.email ? h('span', { class: 'tagb dim', title: '会话过期后需手动登录' }, '无密码') : null),
          title: (a.email || '') + (i < 9 ? '\n快捷键 Ctrl+Alt+' + (i + 1) : ''), onrename: () => { accounts = this.mergeRead(accounts); if (alive()) void render(); },
          onclick: () => enter(a) }); c._g = g; management.mount(c, a, () => enter(a));
        // 右上角动作区：只保留抽卡和同步统计；切换账号直接点击卡片，删除账号使用右键菜单
        const menu = ev => { contextStop(); contextStop = this.contextMenu(ev, c, a, root, remove, accounts.length > 1 && !deleting.size); };
        c.addEventListener('contextmenu', menu);
        c.addEventListener('keydown', ev => { if (ev.target === c && (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey))) menu(ev); }); next.push(c);
        if (next.length % 4 === 0) { await PanelWork.frame(); if (!alive() || run !== generation) return; }
      }
      if (!alive() || run !== generation) return;
      cards = next; list.style.paddingTop = ''; list.style.paddingBottom = ''; list.replaceChildren(...cards);
      if (!cards.length) list.append(h('p', { class: 'acct-empty', role: 'status' }, accounts.length ? '没有匹配的账号，试试其他名称或清空搜索。' : '还没有账号，请添加或导入。'));
      wheelStop = acctWheel(list); management.reconcile(cards); building = false; updateStates();
      void PanelWork.each(list, cards.filter(c => c._g && c._id !== cur), async c => { if (run !== generation || !c.isConnected) return; await Gacha.loadAcct(c._id); if (run === generation && c.isConnected) { GPop.paintAcct(c._g, GPop.acctState(c._id, false)); this.paintRun(c, GPop.acctState(c._id, false)); } });
    };
    const refresh = async live => {
      const readAt = now(), L = await PanelWork.wait(() => Host.listAccounts(true)).catch(() => null); if (!live() || !Array.isArray(L) || building) return;
      const fresh = this.mergeRead(L, readAt).filter(a => !removed.has(a.id)), changed = JSON.stringify(fresh.map(a => [a.id, a.remark, a.email, a.hasPw, a.win, a.live, a.status?.loggedIn, a.status?.ip, a.status?.loc, a.region, a.sites?.github])) !== JSON.stringify(accounts.map(a => [a.id, a.remark, a.email, a.hasPw, a.win, a.live, a.status?.loggedIn, a.status?.ip, a.status?.loc, a.region, a.sites?.github]));
      accounts = fresh; const byId = new Map(accounts.map(a => [a.id, a]));
      for (const c of cards) { const a = byId.get(c._id); if (!a) continue; c._account = a; const old = GPop.remote.get(a.id);
        if (a.id !== cur && !(/启动中/.test(old?.phase || '') && now() - (old.at || 0) < 4000 && !a.status?.gacha?.busy)) GPop.remote.set(a.id, a.status?.gacha || null);
        this.paintBalance(c, a);
      }
      if (changed) await render(); else updateStates();
      if (GPop.isOpen() && GPop.target && !GPop.root.activeElement?.matches?.('input,textarea')) GPop.fill();
    };
    const remove = async id => {
      if (!alive() || deleting.size) return;
      const a = accounts.find(x => x.id === id); if (!a) return;
      if (accounts.length <= 1) { toast('至少保留一个账号，请先添加其他账号', 'err'); return; }
      deleting.add(id);
      try {
        const text = '删除本机账号「' + this.name(a) + '」' + (a.email ? '（' + a.email + '）' : '') + '？\n其本机登录数据和保存的密码会清除，正在进行的该账号任务会停止；不会注销云端账号或删除云端对话。' + (id === cur ? '\n删除当前账号前将先切换到其他账号。' : '');
        if (!await Dialog.confirm({ title: '删除账号', text, ok: '删除', danger: true }) || !alive()) return;
        const result = await Host.removeAccount(id);
        if (result !== true && !result?.ok) throw Error(result?.error || '删除未确认，请刷新账号列表后重试');
        removed.add(id); accounts = accounts.filter(x => x.id !== id); this.renamed.delete(id); GPop.remote.delete(id); LaunchPick.cache = null;
        if (Array.isArray(UI.host?.accounts)) UI.host.accounts = UI.host.accounts.filter(x => x.id !== id);
        if (alive()) { await render(); toast('账号已删除'); }
      } catch (err) { if (alive()) toast('删除失败：' + describe(err), 'err'); }
      finally { deleting.delete(id); }
    };
    const refreshButton = Host.refreshQuotas ? h('button', { type: 'button', class: 'ib', title: '刷新全部账号（余额与状态）', onclick: async ev => {
      const b = ev.currentTarget; if (b.disabled) return; b.disabled = true; b.classList.add('busy'); b.setAttribute('aria-busy', 'true');
      try {
        const result = await this.refreshAll(); if (!alive()) return; await refresh(alive);
        if (result?.error) throw Error(result.error);
        if (result?.errors?.length) toast('账号部分刷新失败：' + result.errors.slice(0, 3).map(x => this.name(accounts.find(a => a.id === x.id)) + '：' + x.message).join('；') + (result.errors.length > 3 ? ' 等 ' + result.errors.length + ' 项' : ''), 'err');
        else toast('账号状态已刷新；Pulse 使用低频缓存');
      } catch (err) { if (alive()) toast(describe(err), 'err'); }
      finally { if (alive()) { b.disabled = false; b.classList.remove('busy'); b.removeAttribute('aria-busy'); } }
    } }, icon('refresh')) : null;
    const search = this.search(value => { query = value; page = 0; void render(); });
    body.replaceChildren(h('div', { class: 'amenu-h' }, h('b', {}, '账号'), count, h('span', { class: 'grow' }), refreshButton, h('button', { class: 'ib', title: '关闭', onclick: close }, icon('x'))),
      search, list, pager, this.dock(search, close));
    await render(); if (alive()) pollStop = PanelWork.poll(root, refresh, 2000);
  },
};
