// ---------- 小工具：ⓘ 说明 / 底部实时榜单 / 聊天里的文件名可点击 / 步骤大图 ----------

// ⓘ：长说明收成一个图标，悬停或点一下显示
const tipI = (text, cls = '') => h('span', { class: 'tipi ' + cls, tabindex: 0, 'data-tip': text, role: 'button', 'aria-label': '说明' }, icon('info'));
const Tip = (() => {
  let box = null, owner = null, pinned = false, hideT = 0;
  function show(el, pin) {
    const text = el.getAttribute('data-tip'); if (!text) return;
    clearTimeout(hideT);
    if (!box) { box = h('div', { class: 'tipbox' }); document.body.append(box); box.addEventListener('mouseenter', () => clearTimeout(hideT)); box.addEventListener('mouseleave', () => { if (!pinned) hide(); }); }
    owner = el; pinned = !!pin; box.textContent = text; box.style.display = 'block';
    const bw = Math.min(300, innerWidth - 16); box.style.maxWidth = bw + 'px';
    if (typeof placeInward === 'function') placeInward(box, el, { pad: 8, gap: 6, keepWidth: true, keepHeight: true });
  }
  function hide() { if (box) box.style.display = 'none'; owner = null; pinned = false; }
  document.addEventListener('mouseover', e => { if (typeof window !== 'undefined' && window.__ancLastScrollAt && Date.now() - window.__ancLastScrollAt < 160) return; const el = e.target.closest?.('[data-tip]'); if (el && el !== owner && !pinned) show(el); else if (!el && owner && !pinned && !box?.contains(e.target)) { clearTimeout(hideT); hideT = setTimeout(hide, 180); } });
  document.addEventListener('click', e => { const el = e.target.closest?.('[data-tip]'); if (el && (el.classList?.contains('tipi') || el.classList?.contains('bp-pill') || el.classList?.contains('u'))) { e.preventDefault(); e.stopPropagation(); if (owner === el && pinned) hide(); else show(el, true); } else if (box && !box.contains(e.target)) hide(); }, true);
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  addEventListener('scroll', () => { if (owner && !pinned) hide(); }, { capture: true, passive: true });
  return { show, hide };
})();

// ---------- 底部栏：实时榜单（模型排行榜 + 推理分排行 + 价格排行榜 三榜联通 & 显示更新时间）----------
const LeaderPop = {
  tab: Store.get('lp:tab', 'rank'),
  priceSort: Store.get('lp:psort', 'out'),
  q: '',
  fmtTime(ts) {
    if (!ts || !Number.isFinite(ts)) return '—';
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  btn() {
    const s = Gacha.settings(), on = !!s.sortSidebar;
    return h('button', { class: 'bi link lpbtn bico' + (on ? ' on' : ''), 'aria-label': '榜单', title: '实时榜单：模型排行榜 · 推理分排行 · 价格排行榜（侧栏排序' + (on ? '已开启' : '未开启') + '）', onclick: e => { e.stopPropagation(); this.toggle(e.currentTarget); } }, icon('trophy'), h('i', { class: 'lpdot' }));
  },
  toggle(anchor) {
    if (document.getElementById('lppop')) { this.close(); return; }
    this.open(anchor);
  },
  close() { clearInterval(this.iv); document.getElementById('lppop')?.remove(); },
  open(anchor) {
    this.close();
    this.anchor = anchor;
    try { Ranking.refresh(); } catch {}
    try { Strength.pull(); } catch {}
    try { Gold.loadAcct(); } catch {}
    const r = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : { left: 48, top: innerHeight - 26, bottom: innerHeight - 4, width: 28, height: 18 };
    const barEl = anchor && anchor.closest ? anchor.closest('#bar') : document.getElementById('bar');
    const barRect = barEl && barEl.getBoundingClientRect ? barEl.getBoundingClientRect() : null;
    const topRef = (barRect && barRect.height > 0 && r.top >= barRect.top - 4) ? Math.min(r.top, barRect.top) : (r.top || (innerHeight - 26));
    const popW = Math.min(440, Math.max(280, innerWidth - 16));
    const leftPx = Math.max(8, Math.min(Math.round(r.left || 12), innerWidth - popW - 8));
    const isBottom = topRef > innerHeight * 0.45;
    const bottomPx = Math.max(32, Math.round(innerHeight - topRef + 6));
    const topPx = Math.max(8, Math.round((r.bottom || 36) + 6));
    const availH = isBottom ? Math.max(220, innerHeight - bottomPx - 44) : Math.max(220, innerHeight - topPx - 36);
    const maxH = Math.min(560, availH);
    const mobMode = typeof isMob === 'function' && isMob();
    const posStyle = mobMode
      ? { left: '0px', right: '0px', bottom: 'var(--mbar, 26px)', top: 'auto', width: '100%', maxHeight: 'min(75dvh, 620px)', zIndex: '2147483640' }
      : (isBottom
        ? { left: leftPx + 'px', bottom: bottomPx + 'px', top: 'auto', maxHeight: maxH + 'px', zIndex: '2147483640' }
        : { left: leftPx + 'px', top: topPx + 'px', bottom: 'auto', maxHeight: maxH + 'px', zIndex: '2147483640' });
    const pop = h('div', { id: 'lppop', class: 'lppop', style: posStyle, onclick: e => e.stopPropagation() });
    document.body.append(pop);
    try { this.fill(); } catch (err) { console.error('[LeaderPop.fill]', err); }
    clearInterval(this.iv);
    this.iv = setInterval(() => {
      if (!pop.isConnected) { clearInterval(this.iv); return; }
      if (this.tab === 'power' && !document.hidden) { try { Strength.pull(); } catch {} }
    }, 15000);
    setTimeout(() => {
      const off = e => {
        if (!pop.isConnected) { document.removeEventListener('pointerdown', off, true); return; }
        if (!pop.contains(e.target) && (!anchor || !anchor.contains(e.target))) {
          pop.remove();
          document.removeEventListener('pointerdown', off, true);
        }
      };
      document.addEventListener('pointerdown', off, true);
    }, 0);
  },
  fill() {
    const pop = document.getElementById('lppop'); if (!pop) return;
    const s = Gacha.settings(), on = !!s.sortSidebar;
    const sid = Tabs.cur?.sid, cur = sid ? (Models.get(sid)?.name || Trace.latest(sid)?.best || '') : '';
    const curC = cur ? Strength.canon(cur).toLowerCase() : '';
    const fams = GoldBoard.families(), autoGolds = GoldBoard.autoGold(fams), autoSet = new Set(autoGolds.map(n => n.toLowerCase()));
    const goldList = Gold.manual ? [...Gold.set()].map(n => cardName(n) || n) : autoGolds.map(n => cardName(n) || n);

    const localHits = new Map();
    for (const m of Object.values(Models.all || {})) {
      if (!m || m.pendingConfirm) continue;
      const nm = Strength.canon(m.name || m.candidates?.[0]?.id || '').toLowerCase();
      if (nm) localHits.set(nm, (localHits.get(nm) || 0) + 1);
    }

    const tabs = h('div', { class: 'dk-tabs lp-tabs' },
      ...[['rank', '模型排行榜'], ['power', '推理分排行'], ['price', '价格排行榜']].map(([k, l]) =>
        h('button', { type: 'button', class: this.tab === k ? 'on' : '', onclick: () => { this.tab = k; Store.set('lp:tab', k); this.fill(); } }, l)));

    const status = h('div', { class: 'lp-st lp-stat' },
      h('label', { class: 'lp-sw', title: '对话列表按 版本号 → 档位 → 推理分 排序，最强型号金色置顶' },
        h('input', { type: 'checkbox', checked: on || null, onchange: e => { Gacha.save({ sortSidebar: e.target.checked }); UI.renderList(); Bar.render(); this.fill(); } }),
        h('span', {}, '侧栏按强度排序')),
      h('button', { class: 'lp-gold link xs', title: '点击切换自动 / 手动点亮金色型号', onclick: () => { this.close(); if (typeof GoldBoard !== 'undefined' && GoldBoard.open) GoldBoard.open(); else if (typeof Tabs !== 'undefined' && Tabs.openPower) Tabs.openPower('power'); } },
        h('i', { class: 'gdot' }), (Gold.manual ? '手动金色：' : '自动金色：') + (goldList.slice(0, 2).join('、') || '暂无') + (goldList.length > 2 ? ' 等' + goldList.length + '个' : '')),
      cur ? h('span', { class: 'lp-cur dim', title: '当前对话型号：' + cur }, '当前 ', h('b', {}, cardName(cur) || Brand.short(cur))) : null);

    const body = h('div', { class: 'lp-body' });
    const catMeta = typeof BillingProbe !== 'undefined' ? (typeof BillingProbe.catalogMeta === 'function' ? BillingProbe.catalogMeta() : BillingProbe.catalogMeta) : null;
    const rankAt = Ranking.at || (catMeta?.at ? Date.parse(catMeta.at) : Date.now());
    const strAt = Strength.updatedAt ? Strength.updatedAt() : Date.now();
    const priceAt = (catMeta?.at ? Date.parse(catMeta.at) : 0) || rankAt;

    if (!['rank', 'power', 'price'].includes(this.tab)) this.tab = 'rank';
    try {
    if (this.tab === 'rank') {
      const list = Ranking.list();
      body.append(h('div', { class: 'lp-meta lp-sub' },
        h('span', { class: 'dim' }, '官方 Agent 榜 · 共 ' + list.length + ' 款 · ', h('b', { class: 'lp-time' }, '更新 ' + this.fmtTime(rankAt))),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn xs ghost', title: '同步最新官方排行榜与单价', onclick: async e => { e.currentTarget.disabled = true; await Ranking.refresh(true); this.fill(); } }, icon('refresh'), '刷新'),
        h('button', { class: 'btn xs ghost', title: '在主标签页打开完整模型排行榜', onclick: () => { this.close(); Tabs.openPower('rank'); } }, '完整排行 ↗')));

      const curToks = cur ? Brand.toks(cur) : [];
      const allRows = Strength.board();
      const byName = new Map(), byToks = new Map();
      for (const r of allRows) {
        const nl = r.name.toLowerCase(), tk = Brand.toks(r.name).join('-');
        if (!byName.has(nl)) byName.set(nl, r);
        if (tk && !byToks.has(tk)) byToks.set(tk, r);
      }
      for (const e of list) {
        const vid = Brand.of(e.name), hit = curToks.length && e.base.every(x => curToks.includes(x));
        const canonK = Strength.canon(e.id || e.name).toLowerCase();
        const bRow = byName.get(canonK) || byToks.get(e.base.join('-')) || null;
        const hits = localHits.get(canonK) || (bRow?.s?.nAll || 0);
        const isG = Gold.manual ? Gold.has(e.name) : autoSet.has(canonK);
        body.append(h('div', { class: 'lp-row' + (hit ? ' me' : '') + (isG ? ' gold' : ''), onclick: () => { this.close(); Tabs.openPower('rank'); } },
          h('span', { class: 'lp-rk' + (e.rank <= 3 ? ' top' : '') }, '#' + e.rank),
          vid ? VIcon.el(vid, 14) : h('span', { class: 'vlogo', style: { width: '14px', height: '14px', fontSize: '9px' } }, '?'),
          h('span', { class: 'lp-nm grow', title: e.name }, e.name),
          hits > 0 ? h('span', { class: 'lp-badge hit', title: '本机已识别到此模型 ' + hits + ' 次' }, hits + '次') : null,
          bRow?.score != null ? h('span', { class: 'lp-badge sc', title: '本机推理分 ' + Strength.fmtScore(bRow.score) }, Strength.fmtScore(bRow.score) + '分') : null,
          e.p50 != null ? h('span', { class: 'lp-badge p50 mono', title: '官方单次 Agent 任务中位花费 P50' }, '$' + Number(e.p50).toFixed(2)) : null));
      }
    } else if (this.tab === 'price') {
      const catRows = typeof BillingProbe !== 'undefined' ? (typeof BillingProbe.catalogRows === 'function' ? BillingProbe.catalogRows() : (BillingProbe.catalogRaw || [])) : [];
      const sKey = this.priceSort || 'out';
      const pRows = catRows.filter(r => r && (r.inputPerMillion > 0 || r.outputPerMillion > 0)).map(r => {
        const vid = Brand.of(r.label || r.id || r.org || '');
        const f = typeof Price !== 'undefined' ? Price.factor(r.id || r.label) : { k: 1, n: 0 };
        const canonK = Strength.canon(r.id || r.label).toLowerCase();
        const hits = localHits.get(canonK) || f.n || 0;
        const isMe = curC && (canonK === curC || String(r.id || '').toLowerCase() === curC);
        return { ...r, vid, factor: f.k, calN: f.n, hits, isMe };
      });
      pRows.sort((a, b) => {
        if (sKey === 'in') return (b.inputPerMillion || 0) - (a.inputPerMillion || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        if (sKey === 'p50') return (b.agentTaskCostP50 || 0) - (a.agentTaskCostP50 || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        if (sKey === 'cache') return (b.cacheReadPerMillion || 0) - (a.cacheReadPerMillion || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        return (b.outputPerMillion || 0) - (a.outputPerMillion || 0) || (b.inputPerMillion || 0) - (a.inputPerMillion || 0);
      });

      body.append(h('div', { class: 'lp-meta lp-sub' },
        h('span', { class: 'dim' }, pRows.length + ' 款计费模型 · ', h('b', { class: 'lp-time' }, '更新 ' + this.fmtTime(priceAt))),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn xs ghost', title: '同步最新价格目录', onclick: async e => { e.currentTarget.disabled = true; await Ranking.refresh(true); this.fill(); } }, icon('refresh'), '同步'),
        h('button', { class: 'btn xs ghost', title: '在主标签页打开完整价格排行榜', onclick: () => { this.close(); Tabs.openPower('price'); } }, '完整排行 ↗')));

      body.append(h('div', { class: 'lp-pills' },
        ...[['out', '按输出价'], ['in', '按输入价'], ['p50', '按任务P50'], ['cache', '按缓读价']].map(([k, l]) =>
          h('button', { type: 'button', class: 'lp-pill' + (sKey === k ? ' on' : ''), onclick: () => { this.priceSort = k; Store.set('lp:psort', k); this.fill(); } }, l))));

      pRows.forEach((r, idx) => {
        const inP = r.inputPerMillion != null ? '$' + r.inputPerMillion : '—';
        const outP = r.outputPerMillion != null ? '$' + r.outputPerMillion : '—';
        const crP = r.cacheReadPerMillion != null ? '缓$' + r.cacheReadPerMillion : '';
        const p50P = r.agentTaskCostP50 != null ? 'P50 $' + Number(r.agentTaskCostP50).toFixed(2) : '';
        body.append(h('div', { class: 'lp-row lp-price-row' + (r.isMe ? ' me' : ''), title: (r.label || r.id) + '\n输入: ' + inP + '/1M · 输出: ' + outP + '/1M · 缓读: $' + (r.cacheReadPerMillion ?? '—') + '/1M · 缓写: $' + (r.cacheWritePerMillion ?? '—') + '/1M\n任务花费 P50: $' + (r.agentTaskCostP50 ?? '—'), onclick: () => { this.close(); Tabs.openPower('price'); } },
          h('span', { class: 'lp-rk' + (idx < 3 ? ' top' : '') }, '#' + (idx + 1)),
          r.vid ? VIcon.el(r.vid, 14) : h('span', { class: 'vlogo', style: { width: '14px', height: '14px', fontSize: '9px' } }, '?'),
          h('span', { class: 'lp-nm grow' }, r.label || r.id),
          h('span', { class: 'lp-pr-io mono' }, inP + ' / ', h('b', {}, outP)),
          crP ? h('span', { class: 'lp-badge cr mono' }, crP) : null,
          p50P ? h('span', { class: 'lp-badge p50 mono' }, p50P) : null));
      });
    } else {
      const all = Strength.board();
      const scoredCount = all.filter(r => r.score != null).length;
      body.append(h('div', { class: 'lp-meta lp-sub' },
        h('span', { class: 'dim' }, fams.length + ' 个型号 · ' + scoredCount + ' 个有分 · ', h('b', { class: 'lp-time' }, '更新 ' + this.fmtTime(strAt))),
        tipI('推理分（0–100）：综合实测思考时长、指纹与费用反推隐藏思考深度计算。\n点任意档位可点亮/熄灭金色置顶。'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn xs ghost', title: '打开全客户端鹈鹕测试库：查看/对比各型号鹈鹕测试图、导入合并、导出分享', onclick: () => { this.close(); if (typeof PelicanShots !== 'undefined') PelicanShots.table?.(); } }, icon('pelican'), '鹈鹕库'),
        h('button', { class: 'btn xs ghost', title: '重新收集本机推理分样本', onclick: async () => { await Strength.pull(true); Strength.collectAll(); this.fill(); } }, icon('refresh')),
        h('button', { class: 'btn xs ghost', onclick: () => { this.close(); Tabs.openPower('power'); } }, '完整排行 ↗')));
      body.append(GoldBoard.el({ compact: true, cur }));
    }
    } catch (err) {
      console.error('[LeaderPop.fill tab]', err);
      body.append(h('div', { class: 'empty', style: { padding: '24px 12px', textAlign: 'center' } }, '加载榜单数据时出错：' + String(err && err.message || err)));
    }
    pop.dataset.ks = this.tab;
    const keep = [...pop.querySelectorAll('.lp-body')].map(e => e.scrollTop)[0] || 0, keepPop = pop.scrollTop;
    queueMicrotask(() => { const b = pop.querySelector('.lp-body'); if (b && keep) b.scrollTop = keep; if (keepPop) pop.scrollTop = keepPop; });
    pop.replaceChildren(h('div', { class: 'lp-h' }, tabs, h('span', { class: 'grow' }), h('button', { class: 'ib xs', onclick: () => this.close() }, icon('x'))), status, body);
  },
};
Bus.on('rank', () => LeaderPop.fill());
Bus.on('strength', () => LeaderPop.fill());
Bus.on('gold', () => LeaderPop.fill());
Bus.on('billing-probe', () => LeaderPop.fill());

// ---------- 聊天里的文件名 / 路径：点一下在工作区文件查看器里打开（查看 / 复制 / 定位），和官方页面一样 ----------
const FileLink = { looks: raw => WorkspacePath.looks(raw), norm: raw => WorkspacePath.norm(raw) };
Object.assign(WS, {
  async openPath(raw, linkedSid = null) {
    try {
      const sid = linkedSid || Dock.sid(); if (!sid) return;
      if (Dock.sid() !== sid) Tabs.open(sid);
      const token = this.openToken = (this.openToken || 0) + 1;
      // 会在右侧内嵌预览里打开的文件（html / md / 代码）不去改工作区面板的开合：关闭预览后要恢复成点开之前的样子
      const split = WorkspacePath.split(raw), inPane = !!HtmlPreview.kindOf(split.path);
      const openLiveWrite = () => {
        if (!inPane || typeof R === 'undefined') return false;
        const clean = R.normPath ? R.normPath(split.path) : String(split.path || '').replace(/^\/home\/user\//, '');
        const list = R.writes ? R.writes(sid) : [];
        const w = list.find(x => x.path === clean || x.path.endsWith('/' + clean) || x.path.split('/').pop() === clean.split('/').pop());
        const txt = w ? w.get() : (R.latestFileText ? R.latestFileText(sid, clean) : '');
        if (!w && !txt) return false;
        HtmlPreview.open({ sid, path: w ? w.path : clean, get: w ? w.get : () => R.latestFileText(sid, clean), suffix: split.suffix || '' });
        return true;
      };
      if (!inPane && (!this.shown || document.body.classList.contains('ws-off'))) WS.set(true);
      if (this.sid !== sid || !this.data) await this.load(sid);
      if (!this.data?.manifest?.root) await this.load(sid, true);
      if (this.sid !== sid || Dock.sid() !== sid || this.openToken !== token) return;
      if (!this.data?.manifest?.root && openLiveWrite()) return;
      const ctx = WorkspacePreview.context(sid, this.data), result = await ctx.find(raw);
      const current = () => this.sid === sid && Dock.sid() === sid && this.data?.node === ctx.node && this.openToken === token;
      if (!current()) return;
      const show = async hit => {
        if (!current()) return;
        const parts = hit.p.split('/'); for (let i=1;i<parts.length;i++) this.open.add(parts.slice(0,i).join('/'));
        // The context loaded lazy directories; attach only to this same snapshot.
        this.data = { ...this.data, manifest: { ...this.data.manifest, root: ctx.root } };
        this.hl = hit.p; if (hit.e.type === 'dir') { await ctx.dir(hit.e,hit.p); if (!current()) return; this.open.add(hit.p); }
        this.render(); setTimeout(() => this.el?.querySelector('.ws-row.hl')?.scrollIntoView({ block:'nearest' }),30);
        if (hit.e.type !== 'dir') await this.preview(hit.p, hit.name, hit.e, ctx, result.suffix);
      };
      if (!result.hits.length) { if (openLiveWrite()) return; toast('工作区里没有找到 ' + result.path + (result.incomplete ? '（目录较多，请从文件树定位）' : ''), 'err'); return; }
      if (result.hits.length === 1 && !result.incomplete) { await show(result.hits[0]); return; }
      const body = h('div', {}, h('p', { class:'note' }, result.incomplete ? '搜索范围已达上限，请确认完整路径；不会自动选择同名文件。' : '找到了多个同名文件，请选择完整路径：'));
      let back; for (const hit of result.hits) body.append(h('button', { class:'btn ghost ws-choice', onclick: () => { back.remove(); void show(hit).catch(e => toast(describe(e),'err')); } }, hit.p));
      back = modal('选择工作区文件',body,h('button',{class:'btn',onclick:()=>back.remove()},'关闭'));
    } catch (err) { toast('工作区打开失败：' + describe(err), 'err'); }
  },
});
document.addEventListener('click', e => {
  const el = e.target.closest?.('[data-fpath]'); if (!el) return;
  e.preventDefault(); e.stopPropagation(); void WS.openPath(el.getAttribute('data-fpath'), el.closest('[data-wsid]')?.getAttribute('data-wsid') || null);
});

// ---------- 步骤大图：双击「本轮实时」的步骤条打开，时间 / 用量 / 每一步分析 ----------
const Steps = {
  open(sid, t) {
    if (!t) return; document.getElementById('stepsmodal')?.remove();
    const back = h('div', { class: 'modal-back', id: 'stepsmodal', onclick: ev => { if (ev.target === back) back.remove(); } });
    const esc = ev => { if (ev.key === 'Escape') { back.remove(); removeEventListener('keydown', esc); } }; addEventListener('keydown', esc);
    const m = h('div', { class: 'modal steps-m' }); back.append(m); document.body.append(back);
    const paint = () => {
      const tt = Trace.turns(sid)?.find(x => x.key === t.key) || t, calls = tt.calls, sel = this.sel;
      const tokOf = x => x.tok || x.total || Trace.kNum(x.totalLabel) || 0, usdOf = x => x.aiCost ?? x.usd;
      const totTok = calls.reduce((a, x) => a + tokOf(x), 0), totUsd = calls.reduce((a, x) => a + (usdOf(x) || 0), 0);
      const t0 = calls[0]?.at || tt.at, t1 = Math.max(...calls.map(x => (x.at || 0) + (x.ms || 0)), tt.lastAt || 0);
      const dur = ms => { if (!(ms > 0)) return '—'; const s = Math.round(ms / 1000); return s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60) : Math.floor(s / 60) + ':' + pad(s % 60); };
      const outs = calls.map(x => x.output || 0), maxT = Math.max(1, ...calls.map(tokOf));
      const stat = (k, v, tip, sub) => h('div', { class: 'st-k', title: tip || '' }, h('small', {}, k), h('b', {}, v), sub ? h('em', {}, sub) : null);
      const known = calls.filter(x => x.input != null || x.output != null);
      const inS = known.reduce((a, x) => a + (x.input || 0), 0), crS = known.reduce((a, x) => a + (x.cacheRead || 0), 0), outS = known.reduce((a, x) => a + (x.output || 0), 0), rsS = known.reduce((a, x) => a + (x.reasoning || 0), 0);
      // 速度：Trace 报告的 tok/s；没报告时用 输出 ÷（耗时 − 首包）估算（带 ≈）
      const tpsOf = x => x.tps || (x.output > 0 && x.ms > 800 ? Math.round(x.output / Math.max(0.3, (x.ms - (x.ttft || 0)) / 1000) * 10) / 10 : null);
      const tpsL = calls.filter(tpsOf), avgTps = tpsL.length ? tpsL.reduce((a, x) => a + tpsOf(x), 0) / tpsL.length : null, tpsEst = tpsL.some(x => !x.tps);
      const big = calls.reduce((b, x) => tokOf(x) > tokOf(b || {}) ? x : b, null);
      const head = h('div', { class: 'modal-h steps-h' }, icon('pulse'), h('b', {}, '本轮步骤分析'), h('span', { class: 'dim' }, Brand.short(tt.best || '') + ' · ' + calls.length + ' 步'), h('span', { class: 'grow' }), h('button', { class: 'ib', onclick: () => back.remove() }, icon('x')));
      const stats = h('div', { class: 'st-grid' },
        stat('总耗时', dur(t1 - t0), '第一步开始到最后一步结束'), stat('步数', calls.length + (tt.done ? '' : ' · 进行中')),
        stat('总 Token', totTok ? totTok.toLocaleString('en-US') : '—'), stat('花费', totUsd ? fmtUsd(totUsd) : tt.sum?.usdEst ? '≈ ' + fmtUsd(tt.sum.usdEst) : '—'),
        stat('输入', fmtTokS(inS), '输入 ' + inS.toLocaleString('en-US') + (crS ? '，其中缓存读取 ' + crS.toLocaleString('en-US') : ''), crS && inS ? '缓存 ' + fmtTokS(crS) + ' · ' + Math.round(crS / inS * 100) + '%' : ''), stat('输出', fmtTokS(outS), '输出 ' + outS.toLocaleString('en-US') + (rsS ? '，其中思考 ' + rsS.toLocaleString('en-US') : ''), rsS ? '思考 ' + fmtTokS(rsS) : ''),
        stat('平均速度', avgTps ? (tpsEst ? '≈ ' : '') + avgTps.toFixed(0) + ' tok/s' : '—', tpsEst ? '部分步骤没有报告速度，按 输出 ÷（耗时 − 首包）估算' : '', tpsEst ? '部分为估算' : ''), stat('最大一步', big ? '#' + (calls.indexOf(big) + 1) + ' · ' + fmtTokS(tokOf(big)) : '—'));
      // 大图：每一步一根，堆叠 缓存 / 输入 / 输出 / 思考；下面一条时间轴
      const chart = h('div', { class: 'st-chart' }), bars = h('div', { class: 'st-bars' });
      calls.forEach((x, i) => {
        const v = tokOf(x), hp = v ? Math.max(3, Math.sqrt(v / maxT) * 100) : 3;
        const b = h('button', { class: 'st-bar' + (x.failed ? ' bad' : '') + (sel === x.id ? ' on' : '') + (v ? '' : ' unk'), style: { height: hp + '%' }, title: `#${i + 1} · ${fmtClock2(x.at)}\n${v ? v.toLocaleString('en-US') + ' tokens' : '用量未报告'}${x.output != null ? '\n输出 ' + x.output.toLocaleString('en-US') : ''}${usdOf(x) != null ? ' · ' + fmtUsd(usdOf(x)) : ''}`, onclick: () => { this.sel = x.id; paint(); } });
        b.append(...stack(x, v)); bars.append(b);
      });
      chart.append(bars, h('div', { class: 'st-axis' }, h('span', {}, fmtClock2(t0)), h('span', {}, dur((t1 - t0) / 2) + ' '), h('span', {}, fmtClock2(t1))));
      const legend = h('div', { class: 'mc-uses st-legend' }, ...useKeys(inS, crS, outS, rsS, true));
      // 每一步表格
      const tb = h('div', { class: 'st-table' }, h('div', { class: 'st-tr th' }, ...['#', '开始', '耗时', '型号', '输入', '缓存', '输出', '思考', '速度', '花费'].map(x => h('span', {}, x))));
      calls.forEach((x, i) => tb.append(h('div', { class: 'st-tr' + (x.failed ? ' bad' : '') + (sel === x.id ? ' on' : ''), onclick: () => { this.sel = x.id; paint(); } },
        h('span', {}, i + 1), h('span', {}, fmtClock2(x.at)), h('span', {}, x.ms != null ? (x.ms / 1000).toFixed(1) + 's' : '—'), h('span', { title: x.request || x.model || '' }, Brand.short(x.response || x.request || x.model || '?')),
        h('span', {}, x.input != null ? fmtTokS(x.input) : '—'), h('span', {}, x.cacheRead != null ? fmtTokS(x.cacheRead) : '—'), h('span', {}, x.output != null ? fmtTokS(x.output) : x.totalLabel ? '≈' + x.totalLabel : '—'), h('span', {}, x.reasoning ? fmtTokS(x.reasoning) : '—'), h('span', { title: x.tps ? 'Trace 报告' : tpsOf(x) ? '估算' : '' }, x.tps ? x.tps + '/s' : tpsOf(x) ? '≈' + Math.round(tpsOf(x)) + '/s' : '—'), h('span', {}, usdOf(x) != null ? fmtUsd(usdOf(x)) : '—'))));
      m.replaceChildren(head, h('div', { class: 'modal-b steps-b' }, stats, chart, legend, tb));
      requestAnimationFrame(() => { bars.scrollLeft = bars.scrollWidth; const on = tb.querySelector('.st-tr.on'); if (on) on.scrollIntoView({ block: 'nearest' }); });
    };
    this.paint = paint; paint();
    const un = Bus.on?.('trace', s => { if (s === sid && back.isConnected) paint(); });
  },
};
// 一根步骤条里的堆叠：缓存读取（最浅）/ 输入（未缓存）/ 输出 / 思考（金色）；没报告用量时整根是虚线
function stack(x, v) {
  const inp = x.input || 0, cr = Math.min(x.cacheRead || 0, inp), out = x.output || 0, rs = Math.min(x.reasoning || 0, out), tot = inp + out;
  if (!tot) return [h('i', { class: 's-unk', style: { flexGrow: '1' } })];
  // 从上到下：思考 / 输出 / 输入 / 缓存；输出再小也至少占 10%，看得见
  const oS = !inp ? 1 : out > 0 ? Math.max(out / tot, 0.1) : 0, iS = 1 - oS;
  const seg = (cls, g) => g > 0 ? h('i', { class: cls, style: { flexGrow: String(g) } }) : null;
  return K(seg('s-rsn', out ? oS * rs / out : 0), seg('s-out', out ? oS * (out - rs) / out : 0), seg('s-in', inp ? iS * (inp - cr) / inp : 0), seg('s-cache', inp ? iS * cr / inp : 0));
}
// 用量图例 / 一行显示：窄的时候只剩图标（悬停看名字和数字）
function useKeys(inp, cr, out, rs, full) {
  const icMap = { in: 'upload', cache: 'layers', out: 'download', rsn: 'brain' };
  const one = (cls, name, v, extra) => {
    const desc = name + ' Token：' + (v == null ? '未报告' : Number(v).toLocaleString('en-US')) + (extra || '');
    return h('span', { class: 'u u-' + cls, title: desc, 'data-tip': desc, tabindex: 0 }, icon(icMap[cls] || 'info'), h('i', { class: cls }), h('em', {}, name), h('b', {}, v == null ? '—' : fmtTokS(v)));
  };
  return K(one('in', '输入', inp, cr && inp ? '（其中缓存 ' + Math.round(cr / inp * 100) + '%）' : ''), one('cache', '缓存', cr), one('out', '输出', out), full || rs ? one('rsn', '思考', rs) : null);
}
