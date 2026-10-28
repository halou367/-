// ---------- 小工具：ⓘ 说明 / 底部实时榜单 / 聊天里的文件名可点击 / 步骤大图 ----------

// ⓘ：长说明收成一个图标，悬停或点一下显示
const tipI = (text, cls = '') => h('span', { class: 'tipi ' + cls, tabindex: 0, 'data-tip': text, role: 'button', 'aria-label': '说明' }, icon('info'));
const Tip = (() => {
  let box = null, owner = null, pinned = false, hideT = 0, showT = 0;
  function show(el, pin) {
    clearTimeout(showT); showT = 0;
    const text = el?.getAttribute?.('data-tip'); if (!text) return;
    clearTimeout(hideT);
    if (!box) { box = h('div', { class: 'tipbox' }); document.body.append(box); box.addEventListener('mouseenter', () => clearTimeout(hideT)); box.addEventListener('mouseleave', () => { if (!pinned) hide(); }); }
    owner = el; pinned = !!pin; box.textContent = text; box.style.display = 'block';
    const bw = Math.min(300, innerWidth - 16); box.style.maxWidth = bw + 'px';
    if (typeof placeInward === 'function') placeInward(box, el, { pad: 8, gap: 6, keepWidth: true, keepHeight: true });
  }
  function hide() { clearTimeout(showT); showT = 0; if (box) box.style.display = 'none'; owner = null; pinned = false; }
  document.addEventListener('mouseover', e => {
    if (typeof window !== 'undefined') {
      const tNow = Date.now();
      if ((window.__ancLastScrollAt && tNow - window.__ancLastScrollAt < 180) || (window.__ancLastListScrollAt && tNow - window.__ancLastListScrollAt < 180)) return;
    }
    const el = e.target.closest?.('[data-tip]');
    if (el && el !== owner && !pinned) {
      clearTimeout(hideT); clearTimeout(showT);
      showT = setTimeout(() => { showT = 0; if (el.isConnected && !pinned) show(el); }, 85);
    } else if (!el) {
      clearTimeout(showT); showT = 0;
      if (owner && !pinned && !box?.contains(e.target)) { clearTimeout(hideT); hideT = setTimeout(hide, 180); }
    }
  }, { passive: true });
  document.addEventListener('click', e => { const el = e.target.closest?.('[data-tip]'); if (el && (el.classList?.contains('tipi') || el.classList?.contains('bp-pill') || el.classList?.contains('u'))) { e.preventDefault(); e.stopPropagation(); if (owner === el && pinned) hide(); else show(el, true); } else if (box && !box.contains(e.target)) hide(); }, true);
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  addEventListener('scroll', () => { clearTimeout(showT); showT = 0; if (owner && !pinned) hide(); }, { capture: true, passive: true });
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
        h('button', { class: 'btn xs ghost', title: '打开醍醐 HTML/SVG 样本库：查看各厂商/型号/强度的鹈鹕网页样本并重识全部对话', onclick: () => { this.close(); if (typeof PelicanShots !== 'undefined') PelicanShots.table?.(); } }, icon('pelican'), '醍醐库'),
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
  return K(one('in', '输入', inp, Number(cr) > 0 && Number(inp) > 0 ? '（其中缓存 ' + Math.round(cr / inp * 100) + '%）' : ''), Number(cr) > 0 ? one('cache', '缓存', cr) : null, one('out', '输出', out), Number(rs) > 0 ? one('rsn', '思考', rs) : null);
}


// ==================== 本地 API 反代网关 (LocalApiGateway) ====================
const LocalApiGateway = (() => {
  const _state = {
    running: false,
    port: 18765,
    host: '127.0.0.1',
    apiKey: '',
    keyFixed: true,
    requireKey: false,
    sessionMode: 'bound',
    toolMode: 'auto_bridge',
    protocolTab: 'openai',
    snippetTab: 'client',
    boundSid: null,
    boundTitle: '',
    accountId: '',
    modelName: '自动识别 / 当前会话模型',
    modelId: 'brana-current',
    modelFam: '',
    vendorProtocol: 'arena',
    reqCount: 0,
    lastReqAt: 0,
    lastError: '',
    logs: [],
    proxies: [],
    tunnel: {
      running: false,
      status: 'stopped',
      mode: 'quick',
      publicUrl: '',
      customDomain: '',
      hasToken: false,
      tokenPreview: '',
      error: '',
      pid: 0,
    },
    baseUrlOpenAI: 'http://127.0.0.1:18765/v1',
    baseUrlAnthropic: 'http://127.0.0.1:18765',
    baseUrlGemini: 'http://127.0.0.1:18765/v1beta',
    endpointOpenAI: 'http://127.0.0.1:18765/v1/chat/completions',
    endpointResponses: 'http://127.0.0.1:18765/v1/responses',
    endpointAnthropic: 'http://127.0.0.1:18765/v1/messages',
    endpointGemini: 'http://127.0.0.1:18765/v1beta/models/brana-current:generateContent',
    publicBaseUrl: '',
    publicBaseUrlOpenAI: '',
    publicEndpointOpenAI: '',
    activeBaseUrlOpenAI: 'http://127.0.0.1:18765/v1',
  };

  let _modalBack = null;
  let _renderModalBody = null;
  let _lastModalSig = '';
  let _lastSyncKey = '';
  let _pointerDownInModal = false;
  let _pendingModalRender = false;
  let _editingCardId = '';
  let _editingApiKey = false;
  let _showAdvancedProto = false;
  let _reqChain = Promise.resolve();
  const _handledReqIds = new Set();
  const _statelessMap = new Map();
  const _sharedBattleTurns = new Map();

  function inferVendor() {
    return 'arena';
  }

  function genShortBattleId(seed = '') {
    const s = String(seed || '').trim();
    if (!s) return Math.random().toString(36).slice(2, 6).toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0).toString(36) + '0000').slice(0, 4).toLowerCase();
  }

  function getCurrentAccountId() {
    try {
      if (typeof window !== 'undefined' && window.__accountId) return String(window.__accountId);
      if (typeof AccountMgr !== 'undefined' && AccountMgr.state?.activeId) return String(AccountMgr.state.activeId);
    } catch {}
    return 'default';
  }

  function toModelSlug(name, internal) {
    const raw = String(internal && internal !== 'auto' && internal !== 'default' ? internal : (name || '')).trim();
    if (!raw || /自动识别|当前会话|当前对话|匿名盲测/.test(raw)) return 'brana-current';
    const slug = raw.toLowerCase().replace(/\(([^)]+)\)/g, '-$1').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug || 'brana-current';
  }

  function getAccountProxies(accId) {
    const curAcc = String(accId || getCurrentAccountId() || 'default');
    const all = Array.isArray(_state.proxies) ? _state.proxies : [];
    return all.filter(p => p && (!p.accountId || p.accountId === curAcc || p.accountId === 'default' || curAcc === 'default'));
  }

  function getProxyCardForSid(sid) {
    if (!sid) return null;
    const s = String(sid).trim();
    const all = Array.isArray(_state.proxies) ? _state.proxies : [];
    return all.find(p => p && p.sid === s) || null;
  }

  function isSidProxied(sid) {
    if (!sid) return false;
    const card = getProxyCardForSid(sid);
    if (card) return card.enabled !== false;
    return Boolean(_state.running && _state.boundSid === sid);
  }

  function computeModalSig() {
    const logsSig = Array.isArray(_state.logs)
      ? _state.logs.slice(0, 8).map(l => `${l.id || ''}:${l.status || ''}:${l.model || ''}:${l.toolsCount || 0}`).join('|')
      : '';
    const pxSig = Array.isArray(_state.proxies)
      ? _state.proxies.map(p => `${p.id}:${p.sid}:${p.enabled ? 1 : 0}:${p.modelId}:${p.battleTarget}:${p.reqCount || 0}:${p.title}`).join('|')
      : '';
    const tun = _state.tunnel || {};
    const tunSig = `${tun.running ? 1 : 0}:${tun.status || ''}:${tun.mode || ''}:${tun.publicUrl || ''}:${tun.customDomain || ''}:${tun.error || ''}`;
    return [
      _state.running ? 1 : 0,
      _state.port || 18765,
      _state.apiKey || '',
      _state.requireKey ? 1 : 0,
      _state.sessionMode || 'bound',
      _state.toolMode || 'auto_bridge',
      _state.protocolTab || 'openai',
      _state.snippetTab || 'client',
      _state.boundSid || '',
      _state.modelName || '',
      _state.modelId || '',
      _state.modelFam || '',
      _state.vendorProtocol || 'openai',
      _state.reqCount || 0,
      _state.lastError || '',
      _editingCardId || '',
      _editingApiKey ? 1 : 0,
      _showAdvancedProto ? 1 : 0,
      pxSig,
      tunSig,
      logsSig,
    ].join('\u0001');
  }

  function syncPlusIndicator() {
    try {
      const curSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
      const acctProxies = getAccountProxies();
      const activeCount = acctProxies.filter(p => p.enabled !== false).length;
      const on = Boolean(_state.running && (isSidProxied(curSid) || activeCount > 0 || !_state.boundSid || _state.boundSid === curSid));
      document.querySelectorAll('.crow .attbtn').forEach(el => el.classList.toggle('api-on', on));
      if (typeof Dock !== 'undefined' && typeof Dock.render === 'function') {
        try { Dock.render(); } catch {}
      }
      if (typeof UI !== 'undefined' && typeof UI.renderListSoon === 'function') {
        try { UI.renderListSoon(); } catch {}
      }
    } catch {}
  }

  function readChatModelMeta(chat, sid) {
    const targetSid = sid || chat?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || _state.boundSid;
    const c = chat || (targetSid && typeof Chats !== 'undefined' ? Chats.get(targetSid) : null);
    const hEntry = (targetSid && typeof History !== 'undefined' && typeof History.byId === 'function') ? History.byId(targetSid) : null;
    const m = (targetSid && typeof Models !== 'undefined' ? Models.get(targetSid) : null) || c?.model || null;
    const curGlobalMode = (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') ? ModeState.getMode() : 'agent';
    const curModality = String(c?.modality || c?.evalModality || c?.resolvedModality || hEntry?.modality || (typeof ModeState !== 'undefined' && ModeState.getModality ? ModeState.getModality() : 'chat') || 'chat');
    const isDirect = Boolean(
      c?.evalMode === 'direct' ||
      hEntry?.mode === 'direct' ||
      hEntry?.mode === 'direct-battle' ||
      hEntry?.mode === 'side-by-side' ||
      m?.directMode ||
      (!c && !targetSid && curGlobalMode === 'direct')
    );
    const isBattle = !isDirect && Boolean(
      c?.evalMode === 'battle' ||
      hEntry?.mode === 'battle' ||
      (hEntry?.type === 'evaluation' && !hEntry?.mode) ||
      m?.battleRevealed ||
      (!c && !targetSid && curGlobalMode === 'battle')
    );
    const isUuidLike = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(s || '').trim());
    const randomId = genShortBattleId(targetSid || 'battle');
    const accountId = getCurrentAccountId();

    if (isDirect) {
      const dm = (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function') ? ModeState.getDirectModel() : null;
      const catName = (c?.modelAId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function')
        ? ModelCatalog.resolveModelName(c.modelAId, c?.revealedModels)
        : '';
      const validCat = (catName && !isUuidLike(catName)) ? catName : '';
      const validMi = (m?.name && !isUuidLike(m.name) && !/^(未识别|未知型号|待定)$/.test(String(m.name).trim())) ? String(m.name).trim() : '';
      const dmName = String(dm?.displayName || dm?.publicName || dm?.name || dm?.slug || '').trim();
      const rawPicked = String(c?.directModelName || validCat || validMi || dmName || 'brana-direct').trim();
      const rawName = (rawPicked && typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawPicked) : rawPicked;
      const rawSlug = String((!c && dm?.slug) || (!c && dm?.name) || rawName || '').trim();
      const vid = (rawName && typeof Brand !== 'undefined' && Brand.of) ? Brand.of(rawName) : '';
      const rawFam = String(m?.fam || dm?.provider || vid || '').trim();
      const modelId = toModelSlug(rawName, !isUuidLike(rawSlug) ? rawSlug : '');
      const vendorProtocol = inferVendor(modelId + ' ' + rawName, rawFam);
      return {
        sid: targetSid || null,
        accountId,
        mode: 'direct',
        modality: curModality,
        randomId,
        title: String(c?.title || hEntry?.title || ('Direct · ' + (rawName || '直连会话'))).slice(0, 60),
        modelName: rawName || 'Direct 直连模型',
        modelInternal: !isUuidLike(rawSlug) ? rawSlug : rawName,
        modelFam: rawFam,
        vid,
        modelId,
        vendorProtocol,
      };
    }

    if (isBattle) {
      const aName = String(c?.voteState?.modelAName || m?.modelA || ((c?.modelAId || hEntry?.modelAId) && typeof ModelCatalog !== 'undefined' && ModelCatalog.resolveModelName ? ModelCatalog.resolveModelName(c?.modelAId || hEntry?.modelAId, c?.revealedModels) : '') || '').trim();
      const bName = String(c?.voteState?.modelBName || m?.modelB || ((c?.modelBId || hEntry?.modelBId) && typeof ModelCatalog !== 'undefined' && ModelCatalog.resolveModelName ? ModelCatalog.resolveModelName(c?.modelBId || hEntry?.modelBId, c?.revealedModels) : '') || '').trim();
      const validA = (aName && !isUuidLike(aName) && !/^(未知|待定|Model A)$/i.test(aName)) ? aName : '';
      const validB = (bName && !isUuidLike(bName) && !/^(未知|待定|Model B)$/i.test(bName)) ? bName : '';
      const canonA = (validA && typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(validA) : validA;
      const canonB = (validB && typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(validB) : validB;
      const existingCard = getProxyCardForSid(targetSid);
      const bTarget = existingCard?.battleTarget || 'B';
      const modelIdA = `${randomId}-battle-A`;
      const modelIdB = `${randomId}-battle-B`;
      const primarySlug = existingCard?.modelId || (bTarget === 'A' ? modelIdA : (bTarget === 'card' ? `${randomId}-battle-card` : modelIdB));
      const displayBattle = (canonA && canonB)
        ? `${canonA} vs ${canonB}`
        : `Battle 盲测 (${modelIdA} / ${modelIdB})`;
      const vid = (canonA && typeof Brand !== 'undefined' && Brand.of) ? Brand.of(canonA) : '';
      const rawFam = String(m?.fam || vid || '').trim();
      const vendorProtocol = inferVendor(primarySlug + ' ' + canonA, rawFam);
      return {
        sid: targetSid || null,
        accountId,
        mode: 'battle',
        modality: curModality,
        randomId,
        battleTarget: bTarget,
        modelIdA,
        modelIdB,
        title: String(c?.title || hEntry?.title || (curModality === 'video' ? `视频 Battle (${randomId})` : `Battle 对话 (${randomId})`)).slice(0, 60),
        modelName: displayBattle,
        modelInternal: primarySlug,
        modelFam: rawFam,
        vid,
        modelId: primarySlug,
        vendorProtocol,
      };
    }

    const traceBest = (targetSid && typeof Trace !== 'undefined' && Trace.latest) ? (Trace.latest(targetSid)?.best || '') : '';
    const titleMod = (targetSid && typeof Titles !== 'undefined' && Titles.view) ? (Titles.view(targetSid, c?.title || '')?.model || '') : '';
    const candPick = String(m?.name || m?.candidates?.[0]?.id || traceBest || titleMod || '').trim();
    const rawPicked = !isUuidLike(candPick) ? candPick : '';
    const rawName = (rawPicked && typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawPicked) : rawPicked;
    const rawInternal = String((!isUuidLike(m?.internal) && m?.internal) || (!isUuidLike(m?.response) && m?.response) || rawName || '').trim();
    const vid = (rawName && typeof Brand !== 'undefined' && Brand.of) ? Brand.of(rawName) : '';
    const rawFam = String(m?.fam || vid || '').trim();
    const modelName = rawName || '当前对话模型（对话后自动锁定名称）';
    const rawSlug = toModelSlug(rawName, rawInternal);
    const modelId = (rawSlug && rawSlug !== 'brana-current') ? rawSlug : `${randomId}-chat`;
    const vendorProtocol = inferVendor(modelId + ' ' + rawName, rawFam);
    return {
      sid: targetSid || null,
      accountId,
      mode: 'agent',
      modality: curModality,
      randomId,
      title: String(c?.title || hEntry?.title || '当前对话').slice(0, 60),
      modelName,
      modelInternal: rawInternal || modelId,
      modelFam: rawFam,
      vid,
      modelId,
      vendorProtocol,
    };
  }

  async function callHost(payload) {
    try {
      if (typeof BranaHost !== 'undefined') {
        const fn = BranaHost.apiGateway
          ? () => BranaHost.apiGateway(payload)
          : (BranaHost.shared ? () => BranaHost.shared('__localApiGateway', payload) : null);
        if (fn) {
          const res = await fn();
          if (res && typeof res === 'object' && 'running' in res) {
            Object.assign(_state, res);
            syncPlusIndicator();
            if (typeof _renderModalBody === 'function') {
              const nextSig = computeModalSig();
              if (payload?.op !== 'sync' || nextSig !== _lastModalSig) {
                if (_pointerDownInModal) _pendingModalRender = true;
                else _renderModalBody();
              }
            }
          }
          return res;
        }
      }
    } catch {}
    syncPlusIndicator();
    return _state;
  }

  async function syncCurrentContext(chat, tab) {
    const meta = readChatModelMeta(chat, tab?.sid);
    const syncKey = [meta.sid || '', meta.accountId || '', meta.mode || '', meta.title || '', meta.modelName || '', meta.modelInternal || '', meta.modelFam || '', meta.modelId || ''].join('\u0001');
    _state.boundSid = meta.sid;
    _state.boundTitle = meta.title;
    _state.accountId = meta.accountId;
    _state.modelName = meta.modelName;
    _state.modelId = meta.modelId;
    _state.modelFam = meta.modelFam;
    _state.vendorProtocol = meta.vendorProtocol;
    if (syncKey === _lastSyncKey && _state.running) {
      syncPlusIndicator();
      return _state;
    }
    _lastSyncKey = syncKey;
    return await callHost({
      op: 'sync',
      sid: meta.sid,
      boundSid: meta.sid,
      boundTitle: meta.title,
      title: meta.title,
      accountId: meta.accountId,
      mode: meta.mode,
      modality: meta.modality,
      randomId: meta.randomId,
      modelName: meta.modelName,
      modelInternal: meta.modelInternal,
      modelFam: meta.modelFam,
    });
  }

  async function registerChatProxy(chatOrSid, opts = {}) {
    const c = (chatOrSid && typeof chatOrSid === 'object')
      ? chatOrSid
      : (chatOrSid && typeof Chats !== 'undefined' ? Chats.get(chatOrSid) : (typeof UI !== 'undefined' ? UI.els?.chat : null));
    const sid = (typeof chatOrSid === 'string' ? chatOrSid : c?.sid) || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
    const meta = readChatModelMeta(c, sid);
    if (!meta.sid) {
      if (typeof toast === 'function') toast('请先选择一个对话或发送一条消息后再加入反代', 'warn');
      return _state;
    }
    const res = await callHost({
      op: 'upsertProxy',
      autoStart: opts.autoStart !== false,
      accountId: meta.accountId,
      card: {
        sid: meta.sid,
        accountId: meta.accountId,
        title: opts.title || meta.title,
        mode: opts.mode || meta.mode,
        modality: opts.modality || meta.modality,
        randomId: meta.randomId,
        battleTarget: opts.battleTarget || meta.battleTarget || 'B',
        customModelId: opts.customModelId,
        modelName: meta.modelName,
        modelInternal: meta.modelInternal,
        modelFam: meta.modelFam,
        enabled: opts.enabled !== undefined ? Boolean(opts.enabled) : true,
      },
    });
    if (typeof toast === 'function' && !opts.silent) {
      const px = getProxyCardForSid(meta.sid);
      toast('已加入反代：' + (px?.modelId || meta.modelId), 'ok');
    }
    return res;
  }

  function createToolStreamSplitter(onTextDelta, onToolCall) {
    let processedLen = 0;
    const emittedToolSpans = new Set();
    const OPEN_TAG = '<brana_tool_call>';
    const CLOSE_TAG = '</brana_tool_call>';

    return {
      feed(fullText) {
        const str = String(fullText || '');
        while (processedLen < str.length) {
          const rem = str.slice(processedLen);
          const openIdx = rem.indexOf(OPEN_TAG);
          if (openIdx === -1) {
            let holdBack = 0;
            const maxCheck = Math.min(rem.length, OPEN_TAG.length - 1);
            for (let k = maxCheck; k >= 1; k--) {
              if (OPEN_TAG.startsWith(rem.slice(rem.length - k))) {
                holdBack = k;
                break;
              }
            }
            const safeLen = rem.length - holdBack;
            if (safeLen > 0) {
              onTextDelta(rem.slice(0, safeLen));
              processedLen += safeLen;
            }
            break;
          }
          if (openIdx > 0) {
            onTextDelta(rem.slice(0, openIdx));
            processedLen += openIdx;
            continue;
          }
          const closeIdx = rem.indexOf(CLOSE_TAG, OPEN_TAG.length);
          if (closeIdx === -1) break;
          const jsonStr = rem.slice(OPEN_TAG.length, closeIdx).trim();
          const spanKey = processedLen + ':' + closeIdx;
          if (!emittedToolSpans.has(spanKey)) {
            emittedToolSpans.add(spanKey);
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed.name) {
                onToolCall({
                  id: 'call_' + Math.random().toString(36).slice(2, 10),
                  name: String(parsed.name),
                  arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments || parsed.input || {}),
                });
              }
            } catch {
              onTextDelta(rem.slice(0, closeIdx + CLOSE_TAG.length));
            }
          }
          processedLen += closeIdx + CLOSE_TAG.length;
        }
      },
      flush(fullText) {
        const str = String(fullText || '');
        if (processedLen < str.length) {
          const rem = str.slice(processedLen);
          const openIdx = rem.indexOf(OPEN_TAG);
          const closeIdx = openIdx !== -1 ? rem.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length) : -1;
          if (openIdx !== -1 && closeIdx !== -1) {
            this.feed(str);
          } else {
            onTextDelta(rem);
            processedLen = str.length;
          }
        }
      },
    };
  }

  function composePromptFromJob(job, hasExistingTurns) {
    const msgs = Array.isArray(job?.messages) ? job.messages : [];
    const tools = Array.isArray(job?.tools) ? job.tools : [];
    const toolMode = job?.toolMode || _state.toolMode || 'auto_bridge';
    const blocks = [];
    const mediaHint = (m) => {
      const list = Array.isArray(m?.media) ? m.media : [];
      if (!list.length) return '';
      return '[Attached Media: ' + list.map((x) => `${x.type || 'file'}(${x.name || x.mimeType || 'media'})`).join(', ') + ']';
    };

    if (tools.length > 0 && toolMode !== 'arena_native_only') {
      const toolLines = tools.map((t) => {
        const desc = t.description ? String(t.description).trim() : '无描述';
        const schema = JSON.stringify(t.parameters || { type: 'object', properties: {} });
        return '- `' + t.name + '`: ' + desc + ' | schema: ' + schema;
      });
      blocks.push(
        '[External Client Tool Bridge]\n' +
        '当前外部客户端提供了以下本地工具（Tools）：\n' +
        toolLines.join('\n') + '\n\n' +
        '【调用规则】：当你需要调用上述外部客户端工具时，请不要调用云端内置沙盒工具，而是直接在回复中输出如下 XML 标签（可输出一个或多个，内部为严格合法的 JSON）：\n' +
        '<brana_tool_call>{"name":"工具名","arguments":{...}}</brana_tool_call>\n' +
        '如果不需要调用工具，请直接正常回复用户。'
      );
    }

    if (!hasExistingTurns) {
      if (job.systemText && String(job.systemText).trim()) {
        blocks.push('[System Instruction]\n' + String(job.systemText).trim());
      }
      if (msgs.length <= 1) {
        const m0 = msgs[0];
        if (m0?.content) blocks.push(String(m0.content));
        if (Array.isArray(m0?.media) && m0.media.length) blocks.push(mediaHint(m0));
      } else {
        const prior = msgs.slice(0, -1);
        const last = msgs[msgs.length - 1];
        const histLines = prior.map((m) => {
          const line = m.role === 'tool'
            ? '[Tool Result (' + (m.toolCallId || 'tool') + ')]: ' + String(m.content || '')
            : (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + String(m.content || '');
          const hint = mediaHint(m);
          return hint ? (line ? line + '\n' + hint : hint) : line;
        }).filter(Boolean);
        if (histLines.length) {
          blocks.push('[Conversation History]\n' + histLines.join('\n\n'));
        }
        const lastBlock = last?.role === 'tool'
          ? '[Tool Execution Result (' + (last.toolCallId || 'tool') + ')]\n' + String(last.content || '')
          : String(last?.content || '');
        const lastHint = mediaHint(last);
        if (lastBlock || lastHint) blocks.push([lastBlock, lastHint].filter(Boolean).join('\n'));
      }
    } else {
      const tail = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === 'assistant') break;
        tail.unshift(m);
      }
      if (!tail.length && msgs.length) tail.push(msgs[msgs.length - 1]);
      for (const m of tail) {
        if (m.role === 'tool') {
          blocks.push('[Tool Execution Result (' + (m.toolCallId || 'tool') + ')]\n' + String(m.content || ''));
        } else if (m.content) {
          blocks.push(String(m.content));
        }
        if (Array.isArray(m?.media) && m.media.length) blocks.push(mediaHint(m));
      }
    }

    const finalPrompt = blocks.filter(Boolean).join('\n\n').trim();
    return finalPrompt || '继续';
  }

  function dataUrlToFile(dataUrl, fallbackName = 'attachment.bin', fallbackMime = 'application/octet-stream') {
    const raw = String(dataUrl || '');
    const m = /^data:([^,]*?),(.*)$/is.exec(raw);
    if (!m) return null;
    const header = m[1] || '';
    const params = header.split(';');
    const mime = String(params.shift() || fallbackMime || 'application/octet-stream').trim() || 'application/octet-stream';
    const isBase64 = params.some((x) => String(x).trim().toLowerCase() === 'base64');
    let bytes;
    if (isBase64) {
      const bin = atob(String(m[2] || '').replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(m[2] || ''));
    }
    return new File([bytes], fallbackName, { type: mime, lastModified: Date.now() });
  }

  function extractJobMediaFiles(job, hasExistingTurns) {
    const msgs = Array.isArray(job?.messages) ? job.messages : [];
    let sourceMsgs = msgs;
    if (hasExistingTurns && msgs.length) {
      const tail = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'assistant') break;
        tail.unshift(msgs[i]);
      }
      sourceMsgs = tail.length ? tail : [msgs[msgs.length - 1]];
    }
    const files = [];
    for (const msg of sourceMsgs) {
      for (const media of (Array.isArray(msg?.media) ? msg.media : [])) {
        if (!media?.dataUrl) continue;
        try {
          const f = dataUrlToFile(media.dataUrl, media.name || 'api-media', media.mimeType);
          if (f) files.push(f);
        } catch {}
      }
    }
    return files;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
      fr.readAsDataURL(blob);
    });
  }

  async function waitChatIdle(chat, maxMs = 120000) {
    const t0 = Date.now();
    const isChatBusy = (c) => Boolean(
      c && (
        c.busy ||
        c.streaming ||
        c._evalStreaming ||
        c._evalPollingInc ||
        c.status === 'submitted' ||
        c.status === 'streaming'
      )
    );
    while (isChatBusy(chat) && Date.now() - t0 < maxMs) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  function parseBattleChoiceCommand(text = '') {
    const s = String(text || '').trim();
    if (!s || s.length > 16) return null;
    if (/^(?:1|a|选\s*a|a\s*更好|model\s*a)$/i.test(s)) return 'model_a';
    if (/^(?:2|b|选\s*b|b\s*更好|model\s*b)$/i.test(s)) return 'model_b';
    if (/^(?:3|都不行|都不佳|都不好|both_bad|bad)$/i.test(s)) return 'both_bad';
    if (/^(?:4|都可以|都行|平局|tie|both_good)$/i.test(s)) return 'tie';
    if (/^(?:5|跳过|不选|继续|skip)$/i.test(s)) return 'skip';
    return null;
  }

  async function runSingleApiRequest(job) {
    const reqId = job?.reqId;
    if (!reqId) return;

    const sendStream = (payload) => callHost({ op: 'stream', reqId, ...payload });
    let mediaTasks = [];

    try {
      const sessionMode = job.sessionMode || _state.sessionMode || 'bound';
      let chat = null;
      if (sessionMode === 'stateless') {
        const firstUser = Array.isArray(job.messages) ? job.messages.find(m => m && m.role === 'user') : null;
        const fpKey = [
          String(job.model || ''),
          String(job.systemText || '').slice(0, 120),
          String(firstUser?.content || '').slice(0, 200),
        ].join('\u0001');
        const mappedSid = _statelessMap.get(fpKey);
        if (mappedSid && typeof Chats !== 'undefined') {
          chat = Chats.get(mappedSid) || null;
        }
        if (chat) job._statelessFpKey = fpKey;
        else job._statelessNewFpKey = fpKey;
      } else if (sessionMode === 'bound') {
        const bSid = job.boundSid || _state.boundSid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
        if (bSid && typeof Chats !== 'undefined') chat = Chats.get(bSid);
      } else if (sessionMode === 'active') {
        const aSid = (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || _state.boundSid;
        if (aSid && typeof Chats !== 'undefined') chat = Chats.get(aSid);
      }
      if (!chat && sessionMode !== 'new_each' && sessionMode !== 'stateless' && typeof UI !== 'undefined' && UI.els?.chat) {
        chat = UI.els.chat;
      }

      if (chat && !chat.loaded && typeof chat.load === 'function') {
        try { await chat.load(); } catch {}
      }

      const isExistingBattle = Boolean(
        chat && (
          chat.evalMode === 'battle' ||
          job.targetMode === 'battle' ||
          job.battleSide ||
          /-battle-[ab]$/i.test(String(job.requestedModel || job.model || ''))
        )
      );

      const reqModelRaw = String(job.requestedModel || job.model || '').trim();
      let effectiveBattleSide = '';
      if (isExistingBattle || job.targetMode === 'battle' || /-battle-(?:a|b|card)$/i.test(reqModelRaw)) {
        if (job.battleSide === 'a' || /-battle-a$/i.test(reqModelRaw)) effectiveBattleSide = 'a';
        else if (job.battleSide === 'b' || /-battle-b$/i.test(reqModelRaw)) effectiveBattleSide = 'b';
        else if (job.battleSide === 'card' || job.battleTarget === 'card' || /-battle-card$/i.test(reqModelRaw)) effectiveBattleSide = 'card';
        else effectiveBattleSide = (job.battleTarget === 'A') ? 'a' : 'b';
      }

      const hasTurns = Boolean(chat && ((Array.isArray(chat.turns) && chat.turns.length > 0) || (Array.isArray(chat.messages) && chat.messages.length > 0)));
      const promptText = composePromptFromJob(job, hasTurns);
      const apiFiles = extractJobMediaFiles(job, hasTurns);

      const battleCmd = (isExistingBattle && hasTurns && !apiFiles.length) ? parseBattleChoiceCommand(promptText) : null;
      if (battleCmd && chat) {
        if (battleCmd === 'skip') {
          chat.voteState = null;
          const skipMsg = '已跳过本轮选择（不锁定模型），请直接发送下一条内容继续对话或制作下一个视频。';
          await sendStream({ type: 'text', delta: skipMsg });
          await sendStream({ type: 'done', modelId: job.model || _state.modelId, inputTokens: 8, outputTokens: 24 });
          return;
        }
        let voteReply = '';
        try {
          const lastT = Array.isArray(chat.turns) ? chat.turns.at(-1) : null;
          const res = (typeof EvalEngine !== 'undefined' && typeof EvalEngine.submitVote === 'function')
            ? await EvalEngine.submitVote(chat.sid, battleCmd, { messageAId: lastT?.msgA?.id || null, messageBId: lastT?.msgB?.id || null })
            : null;
          const labelMap = { model_a: 'A 更好', model_b: 'B 更好', both_bad: '都不行', tie: '都可以 (平局)' };
          voteReply = `已记录本轮选择：【${labelMap[battleCmd] || battleCmd}】` +
            (res?.modelAName || res?.modelBName ? `\n揭晓身份：Model A = \`${res.modelAName || 'A'}\` · Model B = \`${res.modelBName || 'B'}\`` : '') +
            `\n可直接发送新内容继续下一轮对话或视频生成。`;
        } catch {
          chat.voteState = null;
          voteReply = `已处理选择并跳过锁定，可直接发送新内容继续下一轮对话或视频生成。`;
        }
        await sendStream({ type: 'text', delta: voteReply });
        await sendStream({ type: 'done', modelId: job.model || _state.modelId, inputTokens: 8, outputTokens: 32 });
        return;
      }

      const battleShareKey = (chat?.sid && (effectiveBattleSide === 'a' || effectiveBattleSide === 'b'))
        ? `${chat.sid}::${promptText}`
        : '';
      let sharedTurn = battleShareKey ? _sharedBattleTurns.get(battleShareKey) : null;
      if (sharedTurn && (Date.now() - sharedTurn.startedAt > 45000 || sharedTurn.consumedSides.has(effectiveBattleSide))) {
        sharedTurn = null;
      }

      let baselineMsgIds = new Set();
      let sendPromise = null;

      if (sharedTurn) {
        sharedTurn.consumedSides.add(effectiveBattleSide);
        chat = sharedTurn.chat;
        baselineMsgIds = sharedTurn.baselineMsgIds;
        sendPromise = sharedTurn.sendPromise;
      } else {
        await waitChatIdle(chat, 90000);
        if (chat) {
          if (Array.isArray(chat.turns)) {
            for (const t of chat.turns) {
              if (t?.msgA?.id) baselineMsgIds.add(t.msgA.id);
              if (t?.msgB?.id) baselineMsgIds.add(t.msgB.id);
            }
          }
          if (Array.isArray(chat.messages)) {
            for (const m of chat.messages) {
              if (m?.id) baselineMsgIds.add(m.id);
            }
          }
          if (chat.live?.id) baselineMsgIds.add(chat.live.id);
          if (chat.evalMode === 'battle') {
            chat.voteState = null;
          }
        }
      }

      let lastReasoningLen = 0;
      const emittedMediaKeys = new Set();
      const splitter = createToolStreamSplitter(
        (deltaText) => {
          if (deltaText) void sendStream({ type: 'text', delta: deltaText });
        },
        (toolCall) => {
          if (toolCall) void sendStream({ type: 'tool_call', call: toolCall });
        }
      );

      const queueAssistantMedia = (mediaType, rawValue, mimeType, name) => {
        const raw = String(rawValue || '').trim();
        if (!raw) return;
        const key = `${mediaType}:${raw.slice(0, 240)}`;
        if (emittedMediaKeys.has(key)) return;
        emittedMediaKeys.add(key);
        const task = (async () => {
          let dataUrl = /^data:/i.test(raw) ? raw : '';
          let finalMime = mimeType || '';
          if (!dataUrl && (/^blob:/i.test(raw) || /^https?:\/\//i.test(raw) || raw.startsWith('/'))) {
            try {
              const resp = await fetch(raw, { credentials: 'include' });
              if (resp.ok) {
                const blob = await resp.blob();
                if (blob && blob.size > 0 && blob.size <= 20 * 1024 * 1024) {
                  finalMime = finalMime || blob.type;
                  dataUrl = await blobToDataUrl(blob);
                }
              }
            } catch {}
          }
          if (!dataUrl && !/^https?:\/\//i.test(raw)) return;
          await sendStream({
            type: 'media',
            media: {
              type: mediaType || 'file',
              mimeType: finalMime || (mediaType === 'image' ? 'image/png' : mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/wav' : 'application/octet-stream'),
              name: name || (mediaType || 'media') + '-output',
              ...(dataUrl ? { dataUrl } : { url: raw }),
            },
          });
        })();
        mediaTasks.push(task);
      };

      const collectMediaFromMsg = (m, prefixLabel = '') => {
        if (!m) return [];
        const foundUrls = [];
        const pfx = prefixLabel ? (prefixLabel + '-') : '';
        if (Array.isArray(m.parts)) {
          for (const p of m.parts) {
            if (!p) continue;
            if (p.type === 'image' || p.type === 'video' || p.type === 'audio') {
              const u = p.image || p.video || p.audio || p.url || p.src || p.data;
              if (u) foundUrls.push({ type: p.type, url: u, mime: p.mimeType || p.contentType || p.mediaType, name: pfx + (p.name || (p.type + '.mp4')) });
              queueAssistantMedia(p.type, u, p.mimeType || p.contentType || p.mediaType, pfx + (p.name || ''));
            } else if (p.type === 'file' && /^(?:image|video|audio)\//i.test(String(p.mimeType || p.contentType || ''))) {
              const kind = String(p.mimeType || p.contentType).split('/')[0].toLowerCase();
              const u = p.url || p.data || p.src;
              if (u) foundUrls.push({ type: kind, url: u, mime: p.mimeType || p.contentType, name: pfx + (p.name || '') });
              queueAssistantMedia(kind, u, p.mimeType || p.contentType, pfx + (p.name || ''));
            }
          }
        }
        const atts = Array.isArray(m.experimental_attachments) ? m.experimental_attachments : (Array.isArray(m.attachments) ? m.attachments : []);
        for (const a of atts) {
          if (!a) continue;
          const mime = String(a.contentType || a.mimeType || a.type || '');
          const kind = /^image\//i.test(mime) ? 'image' : /^video\//i.test(mime) ? 'video' : /^audio\//i.test(mime) ? 'audio' : '';
          const u = a.url || a.dataUrl || a.src || a.previewUrl;
          if (kind && u) {
            foundUrls.push({ type: kind, url: u, mime, name: pfx + (a.name || '') });
            queueAssistantMedia(kind, u, mime, pfx + (a.name || ''));
          }
        }
        return foundUrls;
      };

      const extractMsgText = (m) => {
        if (!m) return { text: '', rsn: '' };
        let text = String(m.text ?? m.content ?? '');
        let rsn = String(m.reasoning ?? '');
        if (!text && Array.isArray(m.parts)) {
          text = m.parts.filter(p => p && p.type === 'text' && p.text).map(p => p.text).join('');
        }
        if (!rsn && Array.isArray(m.parts)) {
          rsn = m.parts.filter(p => p && p.type === 'reasoning' && p.text).map(p => p.text).join('');
        }
        return { text, rsn };
      };

      const findNewBattleMessages = (c) => {
        let msgA = null;
        let msgB = null;
        if (Array.isArray(c?.messages)) {
          const newAssts = c.messages.filter(x => x && x.role === 'assistant' && !baselineMsgIds.has(x.id));
          for (const m of newAssts) {
            if (m.participantPosition === 'a') msgA = m;
            else if (m.participantPosition === 'b') msgB = m;
          }
          if (!msgA && newAssts.length >= 1 && newAssts[0] !== msgB) msgA = newAssts[0];
          if (!msgB && newAssts.length >= 2) msgB = newAssts[1];
        }
        if ((!msgA || !msgB) && Array.isArray(c?.turns) && c.turns.length > 0) {
          const lastT = c.turns[c.turns.length - 1];
          if (!msgA && lastT?.msgA && !baselineMsgIds.has(lastT.msgA.id)) msgA = lastT.msgA;
          if (!msgB && lastT?.msgB && !baselineMsgIds.has(lastT.msgB.id)) msgB = lastT.msgB;
        }
        return { msgA, msgB };
      };

      const inspectActiveTurn = (c) => {
        if (!c) return;
        if (effectiveBattleSide === 'a' || effectiveBattleSide === 'b') {
          const { msgA, msgB } = findNewBattleMessages(c);
          const targetMsg = effectiveBattleSide === 'a' ? msgA : (msgB || (!c.evalMode ? msgA : null));
          if (!targetMsg) return;
          const { text, rsn } = extractMsgText(targetMsg);
          if (rsn.length > lastReasoningLen) {
            const rDelta = rsn.slice(lastReasoningLen);
            lastReasoningLen = rsn.length;
            void sendStream({ type: 'reasoning', delta: rDelta });
          }
          splitter.feed(text);
          collectMediaFromMsg(targetMsg, effectiveBattleSide === 'a' ? 'battle-A' : 'battle-B');
          return;
        }

        if (effectiveBattleSide === 'card') {
          const { msgA, msgB } = findNewBattleMessages(c);
          collectMediaFromMsg(msgA, 'battle-A');
          collectMediaFromMsg(msgB, 'battle-B');
          return;
        }

        let m = (c.live && !baselineMsgIds.has(c.live.id)) ? c.live : null;
        if (!m && Array.isArray(c.turns) && c.turns.length > 0) {
          const lastT = c.turns[c.turns.length - 1];
          const candA = lastT?.msgA && !baselineMsgIds.has(lastT.msgA.id) ? lastT.msgA : null;
          const candB = lastT?.msgB && !baselineMsgIds.has(lastT.msgB.id) ? lastT.msgB : null;
          if (candA && !candA.failed && candA.status !== 'failed') m = candA;
          else if (candB && !candB.failed && candB.status !== 'failed') m = candB;
          else m = candA || candB;
        }
        if (!m && Array.isArray(c.messages) && c.messages.length > 0) {
          const newAssts = [];
          for (let i = c.messages.length - 1; i >= 0; i--) {
            const msg = c.messages[i];
            if (msg && msg.role === 'assistant' && !baselineMsgIds.has(msg.id)) {
              newAssts.unshift(msg);
            }
          }
          if (newAssts.length > 0) {
            m = newAssts.find(x => x.participantPosition === 'a' && !x.failed && x.status !== 'failed')
              || newAssts.find(x => !x.failed && x.status !== 'failed')
              || newAssts[0];
          }
        }
        if (!m) return;
        const { text, rsn } = extractMsgText(m);
        if (rsn.length > lastReasoningLen) {
          const rDelta = rsn.slice(lastReasoningLen);
          lastReasoningLen = rsn.length;
          void sendStream({ type: 'reasoning', delta: rDelta });
        }
        splitter.feed(text);
        collectMediaFromMsg(m);
      };

      let unsub = null;
      const attachSub = (c) => {
        if (!c || unsub) return;
        unsub = c.sub((evChat) => {
          inspectActiveTurn(evChat || c);
        });
      };

      if (!sharedTurn) {
        if (chat) {
          attachSub(chat);
          sendPromise = chat.send(promptText, { files: apiFiles });
          if (battleShareKey) {
            _sharedBattleTurns.set(battleShareKey, {
              chat,
              baselineMsgIds,
              startedAt: Date.now(),
              sendPromise,
              consumedSides: new Set([effectiveBattleSide]),
            });
          }
          await sendPromise;
        } else {
          const curMode = job.targetMode || ((typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') ? ModeState.getMode() : 'agent');
          if ((curMode === 'direct' || curMode === 'battle') && typeof EvalEngine !== 'undefined') {
            if (job.targetModality && typeof ModeState !== 'undefined' && typeof ModeState.setModality === 'function') {
              try { ModeState.setModality(job.targetModality); } catch {}
            }
            chat = curMode === 'direct'
              ? await EvalEngine.createDirectChat(promptText, { files: apiFiles })
              : await EvalEngine.createEvalChat(promptText, { files: apiFiles });
            attachSub(chat);
          } else if (typeof Chats !== 'undefined' && typeof Chats.create === 'function') {
            chat = await Chats.create(promptText, null, (createdChat) => {
              attachSub(createdChat);
            }, { files: apiFiles });
            attachSub(chat);
          } else {
            throw new Error('聊天引擎尚未就绪');
          }
        }
      } else {
        attachSub(chat);
        if (sendPromise) {
          try { await sendPromise; } catch {}
        }
      }

      await waitChatIdle(chat, 240000);
      if (unsub) { try { unsub(); } catch {} unsub = null; }

      inspectActiveTurn(chat);

      let finalMsg = null;
      if (effectiveBattleSide === 'card' && chat) {
        const { msgA, msgB } = findNewBattleMessages(chat);
        const outA = extractMsgText(msgA);
        const outB = extractMsgText(msgB);
        collectMediaFromMsg(msgA, 'battle-A');
        collectMediaFromMsg(msgB, 'battle-B');
        const cardLines = [
          '### 🅰️ Model A 回复 / 视频',
          outA.text || '（见上方/下方视频 A 附件）',
          '',
          '### 🅱️ Model B 回复 / 视频',
          outB.text || '（见上方/下方视频 B 附件）',
          '',
          '---',
          '> **Battle 盲测 5 选交互卡片**：`1. 选A` ｜ `2. 选B` ｜ `3. 都不行` ｜ `4. 都可以` ｜ `5. 跳过`',
          '> 💡 **默认免选继续**：无需点击或回复投票选项，直接发送下一条提示词即自动视为**跳过选择**，强制继续下一轮对话或制作下一个视频！',
        ];
        splitter.flush(cardLines.join('\n'));
        finalMsg = msgB || msgA;
      } else if ((effectiveBattleSide === 'a' || effectiveBattleSide === 'b') && chat) {
        const { msgA, msgB } = findNewBattleMessages(chat);
        finalMsg = effectiveBattleSide === 'a' ? msgA : (msgB || msgA);
        const { text: finalTxt } = extractMsgText(finalMsg);
        splitter.flush(finalTxt);
      } else {
        finalMsg = (chat?.live && !baselineMsgIds.has(chat.live.id)) ? chat.live : null;
        if (!finalMsg && Array.isArray(chat?.turns) && chat.turns.length > 0) {
          const lastT = chat.turns[chat.turns.length - 1];
          const candA = lastT?.msgA && !baselineMsgIds.has(lastT.msgA.id) ? lastT.msgA : null;
          const candB = lastT?.msgB && !baselineMsgIds.has(lastT.msgB.id) ? lastT.msgB : null;
          if (candA && !candA.failed && candA.status !== 'failed') finalMsg = candA;
          else if (candB && !candB.failed && candB.status !== 'failed') finalMsg = candB;
          else finalMsg = candA || candB;
        }
        if (!finalMsg && Array.isArray(chat?.messages) && chat.messages.length > 0) {
          for (let i = chat.messages.length - 1; i >= 0; i--) {
            const msg = chat.messages[i];
            if (msg && msg.role === 'assistant' && !baselineMsgIds.has(msg.id)) {
              finalMsg = msg;
              break;
            }
          }
        }
        const { text: finalTxt } = extractMsgText(finalMsg);
        splitter.flush(finalTxt);
      }

      if (mediaTasks.length) await Promise.allSettled(mediaTasks);

      const meta = readChatModelMeta(chat, chat?.sid);
      _state.boundSid = meta.sid;
      _state.boundTitle = meta.title;
      _state.modelName = meta.modelName;
      _state.modelId = meta.modelId;
      _state.modelFam = meta.modelFam;
      _state.vendorProtocol = meta.vendorProtocol;
      if (job._statelessNewFpKey && meta.sid) {
        _statelessMap.set(job._statelessNewFpKey, meta.sid);
      }

      const usage = finalMsg?.usage || {};
      await sendStream({
        type: 'done',
        modelName: meta.modelName,
        modelInternal: meta.modelInternal,
        modelFam: meta.modelFam,
        modelId: job.model || meta.modelId,
        inputTokens: usage.inputTokens || Math.max(1, Math.round(promptText.length / 3.5)),
        outputTokens: usage.outputTokens || 32,
      });
    } catch (err) {
      await sendStream({
        type: 'error',
        error: typeof describe === 'function' ? describe(err) : (err?.message || String(err)),
      });
    }
  }

  function onMainRequest(job) {
    if (!job?.reqId || _handledReqIds.has(job.reqId)) return;
    _handledReqIds.add(job.reqId);
    if (_handledReqIds.size > 300) {
      const first = _handledReqIds.values().next().value;
      _handledReqIds.delete(first);
    }
    const reqModel = String(job.requestedModel || job.model || '');
    const isBattleDualCandidate = Boolean(job.battleSide === 'a' || job.battleSide === 'b' || /-battle-[ab]$/i.test(reqModel));
    if (isBattleDualCandidate) {
      void Promise.resolve().then(() => runSingleApiRequest(job)).catch(() => {});
      return;
    }
    _reqChain = _reqChain.then(() => runSingleApiRequest(job)).catch(() => {});
  }

  function closeModal() {
    if (_modalBack) {
      _modalBack.remove();
      _modalBack = null;
      _renderModalBody = null;
      _lastModalSig = '';
      _pointerDownInModal = false;
      _pendingModalRender = false;
      _editingCardId = '';
      _editingApiKey = false;
    }
  }

  function openModal() {
    closeModal();
    const curChat = typeof UI !== 'undefined' ? UI.els?.chat : null;
    const curTab = typeof Tabs !== 'undefined' ? Tabs.cur : null;
    void syncCurrentContext(curChat, curTab);

    const box = h('div', { class: 'modal api-gw-modal' });
    const markModalPointerDown = () => { _pointerDownInModal = true; };
    const clearModalPointerDown = () => {
      if (!_pointerDownInModal) return;
      _pointerDownInModal = false;
      if (_pendingModalRender && typeof _renderModalBody === 'function') {
        _pendingModalRender = false;
        _renderModalBody();
      }
    };
    box.addEventListener('pointerdown', markModalPointerDown, true);
    window.addEventListener('pointerup', clearModalPointerDown, true);

    const copyTxt = async (txt, label = '已复制') => {
      try {
        await navigator.clipboard.writeText(String(txt || ''));
        if (typeof toast === 'function') toast(label, 'ok');
      } catch {
        if (typeof toast === 'function') toast('复制失败，请手动复制', 'err');
      }
    };

    _renderModalBody = () => {
      _lastModalSig = computeModalSig();
      box.replaceChildren();

      const meta = readChatModelMeta(typeof UI !== 'undefined' ? UI.els?.chat : null, typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null);
      const isRun = Boolean(_state.running);
      const baseLocal = `http://${_state.host || '127.0.0.1'}:${_state.port || 18765}`;
      const tun = _state.tunnel || {};
      const pubUrl = String(tun.publicUrl || '').replace(/\/+$/, '');
      const activeBaseV1 = pubUrl ? `${pubUrl}/v1` : `${baseLocal}/v1`;
      const acctProxies = getAccountProxies(meta.accountId);
      const curSidCard = meta.sid ? getProxyCardForSid(meta.sid) : null;

      box.append(
        h('div', { class: 'modal-h api-gw-head' },
          h('div', { class: 'api-gw-title-wrap' },
            icon('plug'),
            h('span', { class: 'api-gw-status-dot' + (isRun ? ' on' : '') }),
            h('span', { class: 'api-gw-head-title' }, '反代管理 · 本地多协议 API 网关'),
            h('span', { class: 'api-gw-badge' + (isRun ? ' on' : '') }, isRun ? ('运行中 :' + _state.port) : '未启动'),
            tun.running && pubUrl ? h('span', { class: 'api-gw-badge on' }, 'CF 隧道已连通') : null
          ),
          h('button', { class: 'ib api-gw-close', type: 'button', title: '关闭', onclick: closeModal }, icon('x'))
        )
      );

      const body = h('div', { class: 'modal-b api-gw-body' });

      let portInput = null;
      let keyInput = null;
      let cfDomainInput = null;
      let cfTokenInput = null;

      const unifiedCard = h('div', { class: 'api-gw-unified-card' },
        h('div', { class: 'api-gw-sec-head' },
          h('div', { class: 'api-gw-sec-title' },
            icon('plug'),
            h('span', {}, '统一 API 接入地址与固定密钥'),
            h('span', { class: 'api-gw-fixed-pill' }, '所有模型共用同一地址与固定 Key')
          ),
          h('div', { class: 'api-gw-ctrl-actions' },
            h('label', { class: 'api-gw-inline-port' },
              h('span', {}, '端口'),
              (portInput = h('input', {
                class: 'm-in api-gw-port-in',
                type: 'number',
                min: '1024',
                max: '65535',
                value: String(_state.port || 18765),
              }))
            ),
            isRun
              ? h('button', {
                  class: 'm-btn ghost',
                  type: 'button',
                  onclick: async () => {
                    const p = Number(portInput?.value) || 18765;
                    await callHost({ op: 'update', port: p });
                    if (typeof toast === 'function') toast('端口及配置已更新', 'ok');
                  },
                }, '应用端口')
              : null,
            h('button', {
              class: 'm-btn ' + (isRun ? 'danger' : 'primary'),
              type: 'button',
              onclick: async () => {
                if (isRun) {
                  await callHost({ op: 'stop' });
                  if (typeof toast === 'function') toast('反代网关已停止', 'ok');
                } else {
                  const p = Number(portInput?.value) || 18765;
                  const st = await callHost({
                    op: 'start',
                    port: p,
                    registerCurrent: Boolean(meta.sid),
                    sid: meta.sid,
                    boundSid: meta.sid,
                    boundTitle: meta.title,
                    title: meta.title,
                    accountId: meta.accountId,
                    mode: meta.mode,
                    modality: meta.modality,
                    randomId: meta.randomId,
                    modelName: meta.modelName,
                    modelInternal: meta.modelInternal,
                    modelFam: meta.modelFam,
                  });
                  if (st?.running && typeof toast === 'function') {
                    toast('API 反代已启动：http://127.0.0.1:' + st.port + '/v1', 'ok');
                  }
                }
              },
            }, isRun ? '停止总服务' : '启动反代服务')
          )
        ),

        _state.lastError ? h('div', { class: 'api-gw-err' }, '错误：' + _state.lastError) : null,

        h('div', { class: 'api-gw-ep-list' },
          h('div', { class: 'api-gw-ep-row' },
            h('span', { class: 'api-gw-ep-k' }, '本地 Base URL'),
            h('code', { class: 'api-gw-ep-v' }, `${baseLocal}/v1`),
            h('button', { class: 'api-gw-copy', type: 'button', onclick: () => copyTxt(`${baseLocal}/v1`, '已复制本地 Base URL') }, '复制')
          ),
          pubUrl ? h('div', { class: 'api-gw-ep-row is-pub' },
            h('span', { class: 'api-gw-ep-k' }, '公网 Base URL'),
            h('code', { class: 'api-gw-ep-v' }, `${pubUrl}/v1`),
            h('button', { class: 'api-gw-copy', type: 'button', onclick: () => copyTxt(`${pubUrl}/v1`, '已复制 Cloudflare 公网 Base URL') }, '复制公网')
          ) : null,
          h('div', { class: 'api-gw-ep-row' },
            h('span', { class: 'api-gw-ep-k' }, '固定 API 密钥'),
            _editingApiKey
              ? (keyInput = h('input', {
                  class: 'm-in api-gw-key-in',
                  type: 'text',
                  value: String(_state.apiKey || ''),
                  placeholder: '输入固定 API Key (如 sk-brana-...)',
                }))
              : h('code', { class: 'api-gw-ep-v' }, _state.apiKey || 'sk-brana-local'),
            h('div', { class: 'api-gw-ep-btns' },
              _editingApiKey
                ? h('button', {
                    class: 'api-gw-copy primary',
                    type: 'button',
                    onclick: async () => {
                      const nextKey = String(keyInput?.value || '').trim();
                      if (!nextKey) return;
                      _editingApiKey = false;
                      await callHost({ op: 'update', apiKey: nextKey });
                      if (typeof toast === 'function') toast('固定 API 密钥已保存（重启亦保持不变）', 'ok');
                    },
                  }, '保存')
                : h('button', {
                    class: 'api-gw-copy',
                    type: 'button',
                    onclick: () => copyTxt(_state.apiKey || 'sk-brana-local', '已复制固定 API Key'),
                  }, '复制'),
              h('button', {
                class: 'api-gw-copy',
                type: 'button',
                onclick: () => {
                  _editingApiKey = !_editingApiKey;
                  _renderModalBody();
                },
              }, _editingApiKey ? '取消' : '修改'),
              h('label', { class: 'api-gw-chk', title: '开启后客户端请求需携带此固定 API Key' },
                h('input', {
                  type: 'checkbox',
                  checked: _state.requireKey ? 'checked' : null,
                  onchange: (e) => callHost({ op: 'update', requireKey: Boolean(e.target.checked) }),
                }),
                h('span', {}, '校验')
              )
            )
          )
        ),

        h('div', { class: 'api-gw-cf-box' },
          h('div', { class: 'api-gw-cf-top' },
            h('div', { class: 'api-gw-cf-label' },
              h('span', { class: 'api-gw-cf-dot' + (tun.running ? ' on' : '') }),
              h('b', {}, 'Cloudflare 公网隧道'),
              h('span', { class: 'api-gw-cf-sub' },
                tun.status === 'connected' && pubUrl
                  ? ('已映射公网：' + pubUrl)
                  : tun.status === 'downloading'
                  ? '正在自动下载 cloudflared 组件…'
                  : tun.status === 'starting'
                  ? '正在建立 Cloudflare 隧道连接…'
                  : '支持免配置临时域名 (trycloudflare.com) 与固定域名隧道'
              )
            ),
            h('div', { class: 'api-gw-seg' },
              ...[
                { id: 'quick', label: '临时隧道 (免配置)' },
                { id: 'token', label: '固定域名 (CF Token)' },
                { id: 'custom', label: '自定义公网域名' },
              ].map(tab => h('button', {
                type: 'button',
                class: 'api-gw-seg-btn' + ((tun.mode || 'quick') === tab.id ? ' on' : ''),
                onclick: () => callHost({ op: 'tunnelConfig', mode: tab.id }),
              }, tab.label))
            )
          ),
          (tun.mode === 'token' || tun.mode === 'custom')
            ? h('div', { class: 'api-gw-cf-inputs' },
                tun.mode === 'token'
                  ? (cfTokenInput = h('input', {
                      class: 'm-in api-gw-cf-in',
                      type: 'password',
                      value: '',
                      placeholder: tun.hasToken ? ('已保存 Token (' + tun.tokenPreview + ')，留空则沿用') : '粘贴 Cloudflare Tunnel Token 或安装命令',
                    }))
                  : null,
                (cfDomainInput = h('input', {
                  class: 'm-in api-gw-cf-in',
                  type: 'text',
                  value: String(tun.customDomain || ''),
                  placeholder: '绑定的固定公网域名，如 https://api.yourdomain.com',
                }))
              )
            : null,
          tun.error ? h('div', { class: 'api-gw-err', style: 'margin-top:6px' }, '隧道提示：' + tun.error) : null,
          h('div', { class: 'api-gw-cf-actions' },
            h('button', {
              type: 'button',
              class: 'm-btn ' + (tun.running ? 'danger' : 'primary') + ' api-gw-cf-btn',
              onclick: async () => {
                if (tun.running) {
                  await callHost({ op: 'tunnelStop' });
                  if (typeof toast === 'function') toast('公网隧道已关闭', 'ok');
                } else {
                  if (typeof toast === 'function') toast('正在启动公网隧道，请稍候…', 'ok');
                  const res = await callHost({
                    op: 'tunnelStart',
                    mode: tun.mode || 'quick',
                    customDomain: cfDomainInput ? cfDomainInput.value : tun.customDomain,
                    token: cfTokenInput ? cfTokenInput.value : '',
                  });
                  if (res?.tunnel?.publicUrl && typeof toast === 'function') {
                    toast('公网隧道已就绪：' + res.tunnel.publicUrl + '/v1', 'ok');
                  }
                }
              },
            }, tun.running ? '停止公网隧道' : (tun.mode === 'custom' ? '应用公网域名' : '一键开启公网隧道')),
            pubUrl
              ? h('button', {
                  type: 'button',
                  class: 'm-btn ghost api-gw-cf-btn',
                  onclick: () => copyTxt(`${pubUrl}/v1`, '已复制公网 API 地址'),
                }, '复制公网 API 地址')
              : null
          )
        )
      );
      body.append(unifiedCard);

      const proxyListSec = h('div', { class: 'api-gw-proxies-sec' },
        h('div', { class: 'api-gw-sec-head' },
          h('div', { class: 'api-gw-sec-title' },
            icon('layers'),
            h('span', {}, '当前账号的反代对话管理'),
            h('span', { class: 'api-gw-count-pill' }, `${acctProxies.filter(p => p.enabled !== false).length} 启用 / 共 ${acctProxies.length} 个`)
          ),
          meta.sid
            ? h('button', {
                type: 'button',
                class: 'm-btn ' + (curSidCard ? 'ghost' : 'primary') + ' api-gw-add-cur-btn',
                onclick: async () => {
                  await registerChatProxy(meta.sid, { autoStart: true });
                },
              }, curSidCard ? '✓ 刷新当前对话反代' : '+ 将当前对话加入反代')
            : null
        )
      );

      if (!acctProxies.length) {
        proxyListSec.append(
          h('div', { class: 'api-gw-empty-cards' },
            h('div', { class: 'api-gw-empty-title' }, '当前账号暂未添加反代对话卡片'),
            h('div', { class: 'api-gw-empty-sub' },
              meta.sid
                ? `当前打开对话：「${meta.title}」（${meta.mode === 'battle' ? `Battle 模式 · 自动分配 ${meta.modelIdA} / ${meta.modelIdB}` : `模型 ID: ${meta.modelId}`}），点击右上角「+ 将当前对话加入反代」即可一键启用。`
                : '请先在左侧选择或新建一个对话（支持 Agent / Direct / Battle 视频与聊天），然后点击加入反代。'
            )
          )
        );
      } else {
        const cardsWrap = h('div', { class: 'api-gw-proxy-cards' });
        for (const px of acctProxies) {
          const isBattleCard = px.mode === 'battle';
          const isCardOn = px.enabled !== false && isRun;
          const isEditing = _editingCardId === px.id;
          const rid = px.randomId || genShortBattleId(px.sid || px.id);
          const idA = px.modelIdA || `${rid}-battle-A`;
          const idB = px.modelIdB || `${rid}-battle-B`;
          const bTarget = px.battleTarget || 'B';

          let editTitleIn = null;
          let editModelIn = null;
          let editModeSel = px.mode || 'agent';
          let editBattleTarget = bTarget;

          const cardBrandVid = (typeof Brand !== 'undefined' && Brand.of) ? Brand.of(px.modelName || px.modelId || px.title || '') : '';
          const cardEl = h('div', { class: 'api-gw-pcard' + (px.enabled !== false ? ' is-enabled' : ' is-paused') + (px.sid === meta.sid ? ' is-current' : '') },
            h('div', { class: 'api-gw-pcard-top' },
              h('div', { class: 'api-gw-pcard-title-row' },
                h('span', { class: 'api-gw-status-dot' + (isCardOn ? ' on' : '') }),
                cardBrandVid && typeof vlogo === 'function' ? vlogo(cardBrandVid, 15) : null,
                h('span', { class: 'api-gw-pcard-title', title: px.title || px.sid }, px.title || '未命名对话'),
                px.sid === meta.sid ? h('span', { class: 'api-gw-cur-tag' }, '当前窗口对话') : null,
                h('span', { class: 'api-gw-mode-tag mode-' + (px.mode || 'agent') },
                  isBattleCard
                    ? (px.modality === 'video' ? '视频 Battle' : 'Battle 盲测')
                    : (px.mode === 'direct' ? 'Direct 直连' : 'Agent 模式')
                ),
                h('span', { class: 'api-gw-pcard-stat' }, `调用 ${px.reqCount || 0} 次`)
              ),
              h('div', { class: 'api-gw-pcard-btns' },
                h('button', {
                  type: 'button',
                  class: 'api-gw-act-btn ' + (px.enabled !== false ? 'warn' : 'ok'),
                  title: px.enabled !== false ? '暂停此对话反代' : '启动此对话反代',
                  onclick: async () => {
                    await callHost({ op: 'toggleProxy', id: px.id, sid: px.sid, enabled: px.enabled === false });
                    if (typeof toast === 'function') {
                      toast(px.enabled === false ? ('已启动反代：' + px.title) : ('已停止反代：' + px.title), 'ok');
                    }
                  },
                }, px.enabled !== false ? '停止' : '启动'),
                h('button', {
                  type: 'button',
                  class: 'api-gw-act-btn' + (isEditing ? ' on' : ''),
                  onclick: () => {
                    _editingCardId = isEditing ? '' : px.id;
                    _renderModalBody();
                  },
                }, isEditing ? '收起' : '编辑'),
                px.sid && px.sid !== meta.sid
                  ? h('button', {
                      type: 'button',
                      class: 'api-gw-act-btn',
                      title: '切换到该对话',
                      onclick: () => {
                        try {
                          if (typeof UI !== 'undefined' && typeof UI.pick === 'function') {
                            closeModal();
                            UI.pick(px.sid);
                          }
                        } catch {}
                      },
                    }, '定位')
                  : null,
                h('button', {
                  type: 'button',
                  class: 'api-gw-act-btn danger',
                  title: '从反代管理中移除此对话',
                  onclick: async () => {
                    await callHost({ op: 'deleteProxy', id: px.id, sid: px.sid });
                    if (typeof toast === 'function') toast('已删除反代卡片：' + (px.title || px.modelId), 'ok');
                  },
                }, '删除')
              )
            ),

            isBattleCard
              ? h('div', { class: 'api-gw-pcard-models battle-models' },
                  h('div', { class: 'api-gw-battle-ids' },
                    h('span', { class: 'api-gw-m-label' }, 'Battle 模型名 (点击复制)：'),
                    h('button', {
                      type: 'button',
                      class: 'api-gw-mid-pill' + (bTarget === 'B' || bTarget === 'AB' ? ' on' : ''),
                      title: '点击复制 B 侧模型 ID（请求该模型固定只输出 B 的回复/视频）',
                      onclick: () => copyTxt(idB, '已复制 B 侧模型名：' + idB),
                    }, '[B] ' + idB),
                    h('button', {
                      type: 'button',
                      class: 'api-gw-mid-pill' + (bTarget === 'A' || bTarget === 'AB' ? ' on' : ''),
                      title: '点击复制 A 侧模型 ID（请求该模型固定只输出 A 的回复/视频）',
                      onclick: () => copyTxt(idA, '已复制 A 侧模型名：' + idA),
                    }, '[A] ' + idA),
                    bTarget === 'card'
                      ? h('button', {
                          type: 'button',
                          class: 'api-gw-mid-pill on',
                          onclick: () => copyTxt(`${rid}-battle-card`, '已复制双视频卡片模型名：' + `${rid}-battle-card`),
                        }, '[双路] ' + `${rid}-battle-card`)
                      : null
                  ),
                  h('div', { class: 'api-gw-battle-target-row' },
                    h('span', { class: 'api-gw-m-label' }, '反代输出策略：'),
                    h('div', { class: 'api-gw-seg compact' },
                      ...[
                        { id: 'B', label: '固定 B (只输出B·忽略A)' },
                        { id: 'A', label: '固定 A (只输出A·忽略B)' },
                        { id: 'AB', label: 'A/B 双模型对话' },
                        { id: 'card', label: '双视频/双回复 + 5选卡片' },
                      ].map(opt => h('button', {
                        type: 'button',
                        class: 'api-gw-seg-btn' + (bTarget === opt.id ? ' on' : ''),
                        onclick: async () => {
                          await callHost({
                            op: 'upsertProxy',
                            autoStart: false,
                            card: { ...px, battleTarget: opt.id },
                          });
                        },
                      }, opt.label))
                    ),
                    h('span', { class: 'api-gw-skip-hint' }, '✓ 默认不选择 · 发内容即当跳过选择直接强制继续下一轮/下一视频')
                  )
                )
              : h('div', { class: 'api-gw-pcard-models' },
                  h('span', { class: 'api-gw-m-label' }, '模型 ID (model)：'),
                  h('button', {
                    type: 'button',
                    class: 'api-gw-mid-pill on',
                    title: '点击复制模型 ID',
                    onclick: () => copyTxt(px.modelId, '已复制模型 ID：' + px.modelId),
                  }, px.modelId),
                  h('span', { class: 'api-gw-m-sub' }, px.modelName || '')
                ),

            isEditing
              ? h('div', { class: 'api-gw-pcard-edit' },
                  h('div', { class: 'api-gw-edit-grid' },
                    h('label', { class: 'api-gw-edit-field' },
                      h('span', {}, '卡片备注名称'),
                      (editTitleIn = h('input', {
                        class: 'm-in',
                        type: 'text',
                        value: String(px.title || ''),
                        placeholder: '对话备注名称',
                      }))
                    ),
                    h('label', { class: 'api-gw-edit-field' },
                      h('span', {}, '自定义模型 ID (model)'),
                      (editModelIn = h('input', {
                        class: 'm-in',
                        type: 'text',
                        value: String(px.modelId || ''),
                        placeholder: isBattleCard ? idB : '自定义模型名称',
                      }))
                    )
                  ),
                  h('div', { class: 'api-gw-edit-foot' },
                    h('div', { class: 'api-gw-seg compact' },
                      ...[
                        { id: 'agent', label: 'Agent 模式' },
                        { id: 'direct', label: 'Direct 模式' },
                        { id: 'battle', label: 'Battle 模式 (生成 -battle-A/B)' },
                      ].map(mOpt => h('button', {
                        type: 'button',
                        class: 'api-gw-seg-btn' + (editModeSel === mOpt.id ? ' on' : ''),
                        onclick: async () => {
                          editModeSel = mOpt.id;
                          await callHost({
                            op: 'upsertProxy',
                            autoStart: false,
                            card: {
                              ...px,
                              title: editTitleIn ? editTitleIn.value : px.title,
                              mode: mOpt.id,
                            },
                          });
                        },
                      }, mOpt.label))
                    ),
                    h('button', {
                      type: 'button',
                      class: 'm-btn primary',
                      onclick: async () => {
                        const newTitle = String(editTitleIn?.value || px.title || '').trim();
                        const newMid = String(editModelIn?.value || px.modelId || '').trim();
                        _editingCardId = '';
                        await callHost({
                          op: 'upsertProxy',
                          autoStart: false,
                          card: {
                            ...px,
                            title: newTitle || px.title,
                            customModelId: newMid,
                            modelId: newMid,
                            battleTarget: editBattleTarget,
                          },
                        });
                        if (typeof toast === 'function') toast('反代卡片修改已保存', 'ok');
                      },
                    }, '保存修改')
                  )
                )
              : null
          );
          cardsWrap.append(cardEl);
        }
        proxyListSec.append(cardsWrap);
      }
      body.append(proxyListSec);

      const protoToggleBar = h('div', { class: 'api-gw-more-bar' },
        h('button', {
          type: 'button',
          class: 'api-gw-more-btn',
          onclick: () => {
            _showAdvancedProto = !_showAdvancedProto;
            _renderModalBody();
          },
        }, _showAdvancedProto ? '▾ 收起多协议端点与请求日志' : '▸ 展开多协议端点 (/v1/chat/completions · /v1/messages · Gemini) 与最近日志')
      );
      body.append(protoToggleBar);

      if (_showAdvancedProto) {
        const activeModelForSnippet = curSidCard?.modelId || acctProxies[0]?.modelId || meta.modelId || 'brana-current';
        const epSection = h('div', { class: 'api-gw-ep-list', style: 'margin-top:6px' },
          h('div', { class: 'api-gw-ep-row' },
            h('span', { class: 'api-gw-ep-k' }, 'OpenAI Chat'),
            h('code', { class: 'api-gw-ep-v' }, `${activeBaseV1}/chat/completions`),
            h('button', { class: 'api-gw-copy', type: 'button', onclick: () => copyTxt(`${activeBaseV1}/chat/completions`, '已复制 OpenAI Endpoint') }, '复制')
          ),
          h('div', { class: 'api-gw-ep-row' },
            h('span', { class: 'api-gw-ep-k' }, 'Anthropic'),
            h('code', { class: 'api-gw-ep-v' }, `${pubUrl || baseLocal}/v1/messages`),
            h('button', { class: 'api-gw-copy', type: 'button', onclick: () => copyTxt(`${pubUrl || baseLocal}/v1/messages`, '已复制 Anthropic Endpoint') }, '复制')
          ),
          h('div', { class: 'api-gw-ep-row' },
            h('span', { class: 'api-gw-ep-k' }, 'Gemini'),
            h('code', { class: 'api-gw-ep-v' }, `${pubUrl || baseLocal}/v1beta/models/${activeModelForSnippet}:generateContent`),
            h('button', { class: 'api-gw-copy', type: 'button', onclick: () => copyTxt(`${pubUrl || baseLocal}/v1beta/models/${activeModelForSnippet}:generateContent`, '已复制 Gemini Endpoint') }, '复制')
          )
        );
        body.append(epSection);

        const logs = Array.isArray(_state.logs) ? _state.logs : [];
        if (logs.length > 0) {
          body.append(
            h('div', { class: 'api-gw-logs' },
              h('div', { class: 'api-gw-logs-head' },
                h('span', {}, `最近 API 请求日志（累计 ${_state.reqCount || logs.length} 次）`),
                h('button', {
                  class: 'api-gw-copy',
                  type: 'button',
                  onclick: () => callHost({ op: 'clearLogs' }),
                }, '清空')
              ),
              h('div', { class: 'api-gw-logs-list' },
                ...logs.slice(0, 6).map(l => h('div', { class: 'api-gw-log-item' },
                  h('span', { class: 'api-gw-log-proto' }, String(l.protocol || 'openai').toUpperCase()),
                  h('span', { class: 'api-gw-log-model' }, l.model || 'brana-current'),
                  l.toolsCount ? h('span', { class: 'api-gw-log-tools' }, `Tools:${l.toolsCount}`) : null,
                  h('span', { class: 'api-gw-log-prev' }, l.preview || '—'),
                  h('span', { class: 'api-gw-log-st ' + (l.status || '') }, l.status === 'done' ? '完成' : (l.status === 'error' ? '错误' : '生成中'))
                ))
              )
            )
          );
        }
      }

      box.append(body);
      box.append(
        h('div', { class: 'modal-f api-gw-foot' },
          h('span', { class: 'dim', style: 'font-size:11.5px' }, '支持 OpenAI / Anthropic / Gemini 协议直连本地端口或 Cloudflare 隧道'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'btn sm', onclick: closeModal }, '完成')
        )
      );
    };

    _renderModalBody();
    let gwDownOnBack = false;
    _modalBack = h('div', {
      class: 'modal-back api-gw-back',
      onpointerdown: (e) => { gwDownOnBack = (e.target === _modalBack); },
      onclick: (e) => { if (gwDownOnBack && e.target === _modalBack) closeModal(); gwDownOnBack = false; },
    }, box);
    document.body.append(_modalBack);
  }

  let _ipcBound = false;
  function init() {
    if (typeof window !== 'undefined') {
      window.__BranaLocalApiGateway = {
        _onMainRequest: onMainRequest,
        openModal,
        syncCurrentContext,
        registerChatProxy,
      };
    }
    if (!_ipcBound) {
      try {
        if (typeof BranaHost !== 'undefined') {
          const bindFn = typeof BranaHost.onApiGatewayReq === 'function'
            ? BranaHost.onApiGatewayReq.bind(BranaHost)
            : (typeof BranaHost.onApiGatewayRequest === 'function' ? BranaHost.onApiGatewayRequest.bind(BranaHost) : null);
          if (bindFn) {
            bindFn((payload) => onMainRequest(payload));
            _ipcBound = true;
          }
        }
      } catch {}
    }
    try {
      if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
        Bus.on('turn', (chat) => { void syncCurrentContext(chat); });
        Bus.on('eval:stream', (ev) => { if (ev?.chat) void syncCurrentContext(ev.chat); });
        Bus.on('eval:vote-revealed', (ev) => { if (ev?.chat) void syncCurrentContext(ev.chat); });
      }
    } catch {}
    setTimeout(() => { void callHost({ op: 'status' }); }, 600);
  }

  init();

  return {
    get state() { return _state; },
    getState() { return _state; },
    isRunning() { return Boolean(_state.running); },
    isBoundTo(sid) { return isSidProxied(sid); },
    openModal,
    closeModal,
    syncCurrentContext,
    readChatModelMeta,
    registerChatProxy,
    getAccountProxies,
    getProxyCardForSid,
    isSidProxied,
    genShortBattleId,
    _onMainRequest: onMainRequest,
  };
})();

