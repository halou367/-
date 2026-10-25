// One desktop account card owns its controls and lazy statistics. No batch toolbar.
// All operational commands still go through the selected account's native host/profile.
const AccountManagement = {
  job: null, listeners: new Set(),
  notify() { for (const fn of this.listeners) fn(); },
  matching(accounts, query) { return accounts.filter(a => AccountPicker.match(a, query)); },
  reconcile(selected, accounts, query) {
    const allowed = new Set(this.matching(accounts, query).map(a => a.id));
    for (const id of selected) if (!allowed.has(id)) selected.delete(id);
    return accounts.filter(a => selected.has(a.id));
  },
  statsKey(a) { const s = a?.status?.stats; if (!s) return ''; const vs = s.vendors ? Object.entries(s.vendors).map(([k, v]) => [k, v?.n ?? v, v?.gold?.n ?? 0, v?.models ? Object.keys(v.models).length : 0]) : null; return JSON.stringify([s.at, s.total, s.full, vs, s.at ? null : s]); },
  async execute(job, command, alive, changed = () => {}, pause = sleep) {
    for (const a of job.targets) {
      if (job.cancelled || !alive()) { job.cancelled = true; break; }
      job.current = a.name; changed();
      try { const r = await command(a.id, job.kind); if (!r?.ok) throw Error(r?.error || '宿主未确认命令'); job.ok++; }
      catch (e) { job.errors.push({ id: a.id, name: a.name, message: describe(e) }); }
      job.done++; changed();
      if (job.kind === 'start' && job.done < job.targets.length && !job.cancelled && alive()) await pause(600);
    }
    return job;
  },
  create(root, list, getAccounts, getQuery) {
    const states = new Map(), cache = new Map(), mounted = new Map();
    let dead = false, layoutFrame = 0;
    const alive = () => !dead && root.isConnected;
    const state = id => { if (!states.has(id)) states.set(id, { vendor: '', model: '', more: false, others: false, modelPage: 0, page: 0, pending: false, message: '' }); return states.get(id); };
    const account = id => getAccounts().find(a => a.id === id);
    const layout = () => {
      if (!alive() || layoutFrame) return;
      // Batch layout reads across all changed cards; never force a layout per account.
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0; if (!alive()) return;
        list.classList.toggle('acct-flat', list.clientHeight < 320 || [...mounted.keys()].some(id => state(id).vendor || state(id).more));
      });
    };
    const repaint = (id, force = true) => { const c = mounted.get(id), a = account(id); if (alive() && c?.isConnected && a) paint(c, a, force); };
    const change = (id, fn) => {
      fn(state(id)); repaint(id); layout();
      requestAnimationFrame(() => { const c = mounted.get(id); if (alive() && c?.isConnected) { list.scrollTo({ top: c.offsetTop - 10, behavior: 'auto' }); list.dispatchEvent(new Event('scroll')); } });
    };
    const full = async id => {
      const a = account(id); if (!a || !Host.accountStats) return null;
      const key = AccountManagement.statsKey(a), old = cache.get(id);
      if (old?.key === key) return old.promise || old;
      const entry = { key, data: null, error: '' }; cache.set(id, entry);
      entry.promise = PanelWork.wait(() => Host.accountStats(id)).then(r => {
        if (!r?.ok || r.id !== id) throw Error(r?.error || '统计明细读取失败'); entry.data = StatUI.regold(r.stats); return entry;
      }).catch(e => { entry.error = describe(e); return entry; }).finally(() => { entry.promise = null; if (cache.get(id) === entry) repaint(id); });
      return entry.promise;
    };
    const command = async (id, payload) => {
      const st = state(id); if (st.pending || !Host.acctCmd || !alive()) return;
      st.pending = true; st.message = ''; repaint(id);
      try { const r = await Host.acctCmd(id, payload); if (!r?.ok) throw Error(r?.error || '命令未确认'); st.message = payload.open ? '已请求在该账号打开对话' : '命令已发送，请等待该账号完成统计'; }
      catch (e) { st.message = '失败：' + describe(e); }
      finally { st.pending = false; repaint(id); }
    };
    const conversations = (id, vid, nm, host) => {
      if (!Host.accountStats) return h('p', { class: 'dim' }, '当前宿主不支持按账号读取明细，请更新客户端。');
      const key = AccountManagement.statsKey(account(id)), entry = cache.get(id);
      if (!entry || entry.key !== key) { void full(id); return h('p', { class: 'dim' }, '读取这个账号的本地统计明细…'); }
      if (entry.promise) return h('p', { class: 'dim' }, '正在读取明细…');
      if (entry.error) return h('div', { class: 'acct-stats-error' }, entry.error, h('button', { class: 'btn ghost sm', onclick: () => { cache.delete(id); repaint(id); } }, '重试'));
      const model = entry.data?.vendors?.[vid]?.models?.[nm], rows = Array.isArray(model?.list) ? model.list.filter(Array.isArray) : [], st = state(id), size = 30, pages = Math.max(1, Math.ceil(rows.length / size));
      st.page = Math.max(0, Math.min(pages - 1, st.page));
      const unknown = [...new Set(rows.filter(x => Array.isArray(x) && !x[2]).map(x => x[0]).filter(x => typeof x === 'string' && /^[\w-]{6,80}$/.test(x)))].slice(0, 400);
      return h('div', { class: 'acct-chat-list' },
        h('div', { class: 'acct-chat-tools' }, h('span', { class: 'dim' }, rows.length + ' 条本地明细' + (model?.n > rows.length ? ' / 共 ' + model.n + ' 个对话' : '')),
          unknown.length ? h('button', { class: 'btn ghost sm', disabled: st.pending || !Host.acctCmd || !!host.status?.statsBusy, onclick: () => command(id, { turns: unknown }) }, '统计轮数（' + unknown.length + '）') : null),
        ...rows.slice(st.page * size, (st.page + 1) * size).map(([sid, at, n, complete, note, title]) => h('button', { class: 'acct-chat', type: 'button', 'data-chat': sid, title: '在这个账号里打开对话', disabled: st.pending || !Host.acctCmd,
          onclick: () => command(id, { open: sid }) }, h('span', { class: 'dim' }, StatUI.when(at)), h('span', { class: 'acct-chat-name', title: title || sid }, note ? note + (title ? ' · ' + title : '') : title || sid), h('span', {}, n ? (complete ? '' : '≥') + n + ' 轮' : '—'))),
        !rows.length ? h('p', { class: 'dim' }, '暂无本地对话明细，请同步统计。') : null,
        pages > 1 ? h('div', { class: 'acct-chat-pages' }, h('button', { class: 'btn ghost sm', disabled: st.page === 0, onclick: () => { st.page--; repaint(id); } }, '上一组'), h('span', {}, (st.page + 1) + ' / ' + pages), h('button', { class: 'btn ghost sm', disabled: st.page === pages - 1, onclick: () => { st.page++; repaint(id); } }, '下一组')) : null);
    };
    function paint(c, a, force = false) {
      const id = a.id;
      if (typeof UI !== 'undefined' && id === UI.host?.account?.id && typeof AcctStats !== 'undefined' && typeof AcctStats.compute === 'function' && typeof History !== 'undefined' && (History.lastLoad || History.cached)) {
        try { a.status = { ...(a.status || {}), stats: AcctStats.compute() }; } catch {}
      }
      const st = state(id), S = StatUI.regold(a.status?.stats), data = cache.get(id);
      const signature = JSON.stringify([AccountManagement.statsKey(a), a.status?.statsBusy, a.status?.statsErr, st.vendor, st.model, st.others, st.modelPage, st.page, st.pending, st.message,
        data?.key, !!data?.promise, !!data?.data, data?.error, Gold.manual, Gold.manual ? [...Gold.set()].sort() : null]);
      const meta = a.status?.statsBusy || (a.status?.statsErr ? '统计失败：' + a.status.statsErr : S ? '统计于 ' + StatUI.ago(S.at) + (S.full ? '' : ' · 列表未拉完') : '尚未同步统计');
      const stamp = c.querySelector('.acct-stamp'), time = a.status?.statsBusy ? '同步中' : a.status?.statsErr ? '统计失败' : S ? (StatUI.ago(S.at).replace(/\s/g, '') || '时间未知') + (S.full ? '' : '·未全') : '未同步';
      if (stamp.textContent !== time) stamp.textContent = time; stamp.title = meta; stamp.classList.toggle('err', !!a.status?.statsErr);
      const sync = c.querySelector('.acct-sync'), busy = st.pending || !!a.status?.statsBusy;
      sync.disabled = busy || !Host.acctCmd; sync.classList.toggle('busy', busy); sync.setAttribute('aria-busy', String(busy));
      if (!force && c._statsSignature === signature) return; c._statsSignature = signature;
      const body = c.querySelector('.acct-stats'), focused = body.contains(document.activeElement) ? document.activeElement : null, scroll = body.querySelector('.acct-vendor-detail')?.scrollTop || 0;
      c._vendorFold?.stop(); c._vendorFold = null;
      const nodes = []; let folding = null;
      if (st.message) nodes.push(h('p', { class: 'acct-command-status' + (st.message.startsWith('失败') ? ' err' : ' acct-sr-status'), role: 'status' }, st.message));
      if (S) {
        const vendors = StatUI.vendors(S).filter(([, v]) => (v?.n || 0) > 0);
        if (st.vendor && !vendors.some(([vid]) => vid === st.vendor)) { st.vendor = ''; st.model = ''; st.modelPage = 0; }
        const vendorButtons = vendors.map(([vid, v]) => h('button', { type: 'button', class: 'mg-v' + (st.vendor === vid ? ' on' : '') + (v.gold?.n ? ' g' : ''),
          'data-vendor': vid, title: StatUI.vname(vid) + '：' + v.n + ' 个对话', 'aria-expanded': String(st.vendor === vid), onclick: () => change(id, x => { x.vendor = x.vendor === vid ? '' : vid; x.more = false; x.model = ''; x.page = 0; x.modelPage = 0; x.others = false; }) }, StatUI.vicon(vid, 14), h('b', {}, String(v.n)), v.gold?.n ? h('span', { class: 'mg-vg' }, '★' + v.gold.n) : null));
        const more = h('button', { type: 'button', class: 'btn ghost sm acct-vendor-more', 'aria-label': '更多厂商', 'aria-expanded': String(st.more) }, '更多 ' + vendors.length);
        const row = h('div', { class: 'acct-vendors' }, ...vendorButtons, more), panel = h('div', { class: 'acct-vendor-overflow', hidden: true });
        if (vendorButtons.length) { nodes.push(row, panel); folding = [row, vendorButtons, more, panel]; }
        const v = S.vendors?.[st.vendor];
        if (v) {
          const models = StatUI.models(v), gold = models.filter(([, m]) => m.gold), rest = models.filter(([, m]) => !m.gold);
          const detail = h('div', { class: 'acct-vendor-detail', 'aria-label': StatUI.vname(st.vendor) + ' 型号统计' }, h('div', { class: 'acct-vendor-title' }, h('b', {}, StatUI.vname(st.vendor)), h('span', { class: 'dim' }, v.n + ' 个对话 · ' + models.length + ' 个型号' + (v.turns ? ' · ' + v.turns + ' 轮' : ''))));
          const visibleModels = [...gold, ...(st.others || !gold.length ? rest : [])], modelPages = Math.max(1, Math.ceil(visibleModels.length / 40));
          st.modelPage = Math.max(0, Math.min(modelPages - 1, st.modelPage));
          for (const [nm, m] of visibleModels.slice(st.modelPage * 40, (st.modelPage + 1) * 40)) {
            detail.append(h('button', { type: 'button', class: 'acct-model' + (m.gold ? ' gold' : ''), 'data-model': nm, 'aria-expanded': String(st.model === nm), onclick: () => change(id, x => { x.model = x.model === nm ? '' : nm; x.page = 0; }) },
              h('b', {}, StatUI.mname(nm)), h('span', {}, m.n + ' 个对话'), h('span', { class: 'dim' }, m.known ? m.turns + ' 轮 · ' + m.known + '/' + m.n + ' 已统计 · 平均 ' + (m.turns / m.known).toFixed(1) + ' 轮' : '轮数未统计')));
            if (st.model === nm) detail.append(conversations(id, st.vendor, nm, a));
          }
          if (modelPages > 1) detail.append(h('div', { class: 'acct-chat-pages' }, h('button', { class: 'btn ghost sm', disabled: st.modelPage === 0, onclick: () => change(id, x => { x.modelPage--; x.model = ''; }) }, '型号上一页'), h('span', {}, (st.modelPage + 1) + ' / ' + modelPages), h('button', { class: 'btn ghost sm', disabled: st.modelPage === modelPages - 1, onclick: () => change(id, x => { x.modelPage++; x.model = ''; }) }, '型号下一页')));
          if (gold.length && rest.length) detail.append(h('button', { class: 'btn ghost sm acct-other', onclick: () => change(id, x => { x.others = !x.others; x.model = ''; x.modelPage = 0; }) }, st.others ? '收起其他型号' : '其他 ' + rest.length + ' 个型号 · ' + rest.reduce((n, [, m]) => n + m.n, 0) + ' 个对话'));
          nodes.push(detail);
        }
      } else nodes.push(h('p', { class: 'dim acct-no-stats' }, '点击同步，统计由该账号自己的窗口和线路完成。'));
      body.replaceChildren(...nodes);
      if (folding) c._vendorFold = AccountVendorFold.attach(...folding, st.more, (expanded, user) => {
        st.more = expanded; layout();
        if (expanded && user) requestAnimationFrame(() => { if (alive() && c.isConnected) list.scrollTo({ top: c.offsetTop - 10, behavior: 'auto' }); });
      });
      if (focused) { const same = [...body.querySelectorAll('button')].find(b => !b.disabled && (focused.dataset.vendor ? b.dataset.vendor === focused.dataset.vendor : focused.dataset.model ? b.dataset.model === focused.dataset.model : focused.dataset.chat ? b.dataset.chat === focused.dataset.chat : b.className === focused.className && b.textContent === focused.textContent && b.title === focused.title)); same?.focus({ preventScroll: true }); }
      const detail = body.querySelector('.acct-vendor-detail'); if (detail) detail.scrollTop = scroll;
      c.classList.toggle('acct-detail-open', !!st.vendor); layout();
    }
    const api = {
      mount(c, a, enter) {
        mounted.get(a.id)?._vendorFold?.stop();
        c.classList.add('acct-unified-card'); c._enter = enter;
        c.querySelector('.acct-sync').onclick = () => command(a.id, { stats: 1 });
        const stats = h('div', { class: 'acct-manage acct-stats' });
        // 统计区占了卡片中间一大块，卡片自己的点击处理会跳过 .acct-manage：这里补上——点统计区的文字 / 空白也算点卡片（进入账号）；
        // 按钮、复选框和展开的明细列表照旧，划选了文字也不进入
        stats.addEventListener('click', ev => {
          if (ev.defaultPrevented || ev.target.closest('button,input,select,textarea,label,a,[role=button],.acct-vendor-detail')) return;
          const selection = getSelection(); if (selection && !selection.isCollapsed && c.contains(selection.anchorNode) && c.contains(selection.focusNode)) return;
          c._enter?.();
        });
        c.insertBefore(stats, c.querySelector('.acct-footer')); mounted.set(a.id, c); paint(c, a);
      },
      paint,
      beforeRender() { for (const c of mounted.values()) c._vendorFold?.stop(); },
      reconcile(cards) {
        const ids = new Set(cards.map(c => c._id)), allIds = new Set(getAccounts().map(a => a.id));
        for (const id of mounted.keys()) if (!ids.has(id)) { mounted.get(id)?._vendorFold?.stop(); mounted.delete(id); cache.delete(id); }
        for (const id of states.keys()) if (!allIds.has(id)) { states.delete(id); cache.delete(id); }
        layout();
      },
      dispose() {
        if (dead) return; dead = true;
        cancelAnimationFrame(layoutFrame); observer.disconnect(); resize.disconnect(); for (const c of mounted.values()) c._vendorFold?.stop(); cache.clear(); mounted.clear(); states.clear();
      },
    };
    const observer = new MutationObserver(() => { if (!root.isConnected) api.dispose(); }); observer.observe(root.parentNode || document.body, { childList: true });
    const resize = new ResizeObserver(layout); resize.observe(list);
    return api;
  },
};
