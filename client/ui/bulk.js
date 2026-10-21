// Background batch queue executor for conversation archiving, restoration, and cleanup with rate-limit backoff
const Bulk = {
  K: {
    arch: { name: '一键归档', verb: '归档', store: 'archBlQ', conc: 4, cls: 'arch', ic: 'archive',
      req: id => rawFetch('/api/chat/' + encodeURIComponent(id) + '/archive', { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }) },
    unarch: { name: '恢复到对话', verb: '恢复', store: 'archUnQ', conc: 4, cls: 'unarch', ic: 'refresh',
      req: async id => {
        const r = await rawFetch('/api/chat/' + encodeURIComponent(id) + '/unarchive', { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
        if (r.ok || r.status === 404 || r.status === 401 || r.status === 429) return r;
        const e = (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.byId?.(id)) || (typeof History !== 'undefined' && History.byId?.(id));
        const t = e?.type || 'agentic';
        return rawFetch('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ isArchived: false }), credentials: 'same-origin', cache: 'no-store' });
      } },
    del: { name: '批量删除对话', verb: '删除', store: 'archDelQ', conc: 6, cls: 'del', ic: 'trash',
      req: id => rawFetch('/api/chat/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }) },
  },
  q: {},          // kind → 正在跑的任务
  busy: {},       // kind → 正在统计（还没开始跑）
  running(kind) { return this.q[kind] || null; },

  // ---------- 识别对话的型号 / 厂商（删除前的分类、归档时的匹配都用它）----------
  modelOf(id, title) {
    const mi = Models.get(id), v = Titles.view(id, title || '');
    const name = v.model || '';
    if (!name) return null;
    const guess = !!mi?.guess || /推测/.test(name);
    let vid = v.vid || Brand.of(name) || Brand.learnedOf?.(name) || '';
    if (!vid && guess && /国产|开源/.test(name)) vid = 'compat';
    return { name, vid: vid || 'other', guess, internal: mi?.internal || '' };
  },
  vname(vid) { return vid === 'compat' ? '国产 / 开源（推测）' : vid === 'other' ? '其他 / 代号' : Brand.NAME[vid] || vid; },

  // ---------- 执行器 ----------
  limit(res) {
    const g = k => res?.headers?.get?.(k), srv = Date.parse(g('date') || '') || now();
    const retry = g('retry-after'), ra = retry != null && String(retry).trim() && (Number.isFinite(Number(retry)) || Number.isFinite(Date.parse(retry))) ? NetPolicy.retryAfter(retry, srv) : NaN, rem = g('ratelimit-remaining') != null ? parseInt(g('ratelimit-remaining'), 10) : null;
    const rs = parseFloat(g('ratelimit-reset')); const resetIn = Number.isFinite(rs) ? (rs > 1e9 ? rs * 1000 - srv : rs * 1000) : NaN;
    const lim = parseInt(g('ratelimit-limit') || '', 10);
    return { ra, rem: Number.isFinite(rem) ? rem : null, resetIn, lim: lim > 0 && lim < 1000 ? lim : 0 };
  },
  start(kind, ids, resumed) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.busy){toast('请先停止批量测指纹，再归档或删除','err');return null;}
    if (this.q[kind]) return this.q[kind];
    const K = this.K[kind];
    const q = this.q[kind] = { kind, ids: [...new Set(ids)], total: 0, done: 0, fail: 0, k: 0, stop: false, until: 0, why: '', gone: new Set(), missing:new Set(), rem: null, lim: 0, t0: now() };
    q.total = q.ids.length;
    Store.set(K.store, q.ids);
    if (!resumed) this.dialog(kind);
    this.paint();
    this.run(q).catch(e => toast(K.name + '失败：' + describe(e), 'err'));
    return q;
  },
  async run(q) {
    const K = this.K[q.kind];
    let saveT = 0; const bad = new Set();
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => Store.set(K.store, q.ids.filter(id => !q.gone.has(id) && !bad.has(id))), 400); };
    const pause = (ms, why) => { const u = now() + Math.max(0, ms); if (u > q.until) { q.until = u; q.why = why; } this.paint(); };
    const one = async id => {
      for (let t = 0; t < 40 && !q.stop; t++) {
        while (!q.stop && now() < q.until) await sleep(Math.min(1000, q.until - now()));
        if (q.stop) return null;
        let res;
        try { res = await K.req(id); } catch { await sleep(1500); continue; }
        const L = this.limit(res); if (L.rem != null) q.rem = L.rem; if (L.lim) q.lim = L.lim;
        if (res.ok || res.status === 404) { if(res.status===404)q.missing.add(id); return true; }
        if (res.status === 401) { if (!await Auth.relogin().catch(() => false)) return false; continue; }
        if (res.status === 429) {
          const resetWait = L.rem === 0 && L.resetIn > 0 ? L.resetIn : 0;
          const serverWait = Math.max(Number.isFinite(L.ra) ? L.ra : 0, resetWait);
          pause(serverWait || 6000, serverWait ? 'server' : 'backoff'); continue;
        }
        if (res.status >= 500) { await sleep(2000); continue; }
        return false;
      }
      return q.stop ? null : false;
    };
    // 边跑边把完成的从侧栏拿掉（每 1.5 秒一次，不每条都重绘）
    let tidyT = 0; const pend = new Set();
    const tidySoon = id => { pend.add(id); if (!tidyT) tidyT = setTimeout(() => { tidyT = 0; this.tidy(q.kind, new Set(pend),q.missing); pend.clear(); }, 1500); };
    const worker = async () => {
      while (!q.stop && q.k < q.ids.length) {
        const id = q.ids[q.k++]; const r = await one(id);
        if (r === null) break;
        if (r) { q.done++; q.gone.add(id); tidySoon(id); } else { q.fail++; bad.add(id); }
        save(); this.paint();
      }
    };
    this.paint();
    await Promise.all(Array.from({ length: K.conc }, worker));
    clearTimeout(saveT); clearTimeout(tidyT); if (pend.size) this.tidy(q.kind, new Set(pend),q.missing);
    const left = q.ids.length - q.done - q.fail;
    Store.set(K.store, []);
    this.q[q.kind] = null; this.paint();
    document.querySelectorAll('.dlg-back:not(.anc-gh).bjq-' + q.kind).forEach(x => x.remove());
    toast((q.stop ? '已停止：' : '') + '已' + K.verb + ' ' + q.done + ' 个对话' + (q.fail ? '，' + q.fail + ' 个失败' : '') + (q.stop && left > 0 ? '，剩 ' + left + ' 个没' + K.verb : ''), q.fail ? 'err' : '');
  },
  // 完成的条目：归档 = 从侧栏列表拿掉（型号信息留着，删除归档时还要按厂商分类）；恢复 = 从归档挪回普通对话；删除 = 连本机记录一起清掉
  tidy(kind, gone, missing=new Set()) {
    if (!gone.size) return;
    const restored = kind === 'unarch' ? [...gone].filter(id => !missing.has(id)).map(id => ArchiveHistory.byId?.(id)).filter(Boolean) : [];
    if(kind==='arch')ArchiveHistory.add(History.items.filter(e=>gone.has(e.id)&&!missing.has(e.id)));
    else ArchiveHistory.drop(gone);
    for(const id of gone)if(CardSelect.ids.delete(id))CardSelect.revision++;
    if (kind === 'unarch') {
      try {
        const gm = History.goneMap?.();
        if (gm) { let ch = false; for (const id of gone) if (gm.delete(id)) ch = true; if (ch) Store.set('histgone', Object.fromEntries(gm)); }
      } catch {}
      const ex = new Set(History.items.map(e => e.id));
      for (const e of restored.reverse()) {
        if (!ex.has(e.id)) { History.items.unshift({ ...e, isArchived: false, archivedAt: null }); ex.add(e.id); }
      }
      History.saveSoon();
    } else {
      try { History.bury?.([...gone]); } catch {}
      History.items = History.items.filter(e => !gone.has(e.id)); History.saveSoon();
    }
    if (kind === 'arch') { try { LocalCache.drop(gone, { archived: true }); } catch {} }
    if (kind === 'del') {
      try { LocalCache.drop(gone); } catch {}
      for (const t of Tabs.list.filter(x => x.sid && gone.has(x.sid))) { try { Tabs.close(t.key); } catch {} }
      let dm = false, dt = false;
      for (const sid of gone) {
        const c = Chats.get(sid); if (c) { try { c.ctl?.abort(); } catch {} Chats.delete(sid); }
        if (Models.all[sid]) { delete Models.all[sid]; dm = true; }
        if (typeof AcctStats !== 'undefined' && AcctStats.turns && AcctStats.turns[sid]) { delete AcctStats.turns[sid]; dt = true; }
        try { Notes.drop(sid); Trace.clear(sid); Fav.set(sid, false); } catch {}
      }
      if (dm) Store.set('models', Models.all);
      if (dt) try { AcctStats.save?.(); } catch {}
    }
    Bus.emit('history'); try { AcctStats.report(); } catch {} try { UI.renderList(); UI.renderTabs(); } catch {}
  },
  resume() {
    for (const kind of ['arch', 'unarch', 'del']) {
      const K = this.K[kind], q = Store.get(K.store, []);
      if (Array.isArray(q) && q.length && !this.q[kind]) { this.start(kind, q, true); toast('接着' + K.verb + '上次没做完的 ' + q.length + ' 个对话（进度在底部状态栏）'); }
    }
  },

  // ---------- 进度：顶部按钮 + 底部状态栏 + 进度窗 ----------
  paint() {
    try { UI.adPaintBtn?.(); } catch {}
    for (const k of Object.keys(this.K)) this.paintDlg[k]?.();
    if (!this.barT) this.barT = setTimeout(() => { this.barT = 0; try { Bar.render(); } catch {} }, 250);
  },
  paintDlg: {},
  pct(q) { return q.total ? (q.done + q.fail) / q.total * 100 : 0; },
  fmtWait(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒' : s + ' 秒'; },
  // 底部状态栏里的小进度条（最小化后就看这里；点一下展开进度窗）
  barItems() {
    const out = [];
    for (const kind of Object.keys(this.K)) {
      const q = this.q[kind]; if (!q) continue;
      const K = this.K[kind], n = q.done + q.fail, wait = q.until > now();
      out.push(h('button', { class: 'bi bjob bj-' + K.cls, title: K.name + ' ' + n + '/' + q.total + (wait ? '（等待限流解除，' + this.fmtWait(q.until - now()) + '后继续）' : '') + '\n点击展开', onclick: () => this.dialog(kind) },
        icon(K.ic), h('span', {}, K.verb), h('i', { class: 'bjm' }, h('b', { style: { width: this.pct(q).toFixed(1) + '%' } })), h('b', {}, n + '/' + q.total), wait ? h('span', { class: 'dim' }, '限流') : null));
    }
    return out;
  },
  dialog(kind) {
    const q = this.q[kind]; if (!q) return;
    const K = this.K[kind];
    document.querySelectorAll('.dlg-back:not(.anc-gh).bjq-' + kind).forEach(x => x.remove());
    const back = h('div', { class: 'dlg-back bjq bjq-' + kind }), txt = h('div', { class: 'dlg-h' }), sub = h('div', { class: 'dlg-h dim adq-sub' }), bar = h('i');
    const close = () => { back.remove(); this.paintDlg[kind] = null; };
    const mini = h('button', { class: 'btn ghost sm', title: '收到底部状态栏，任务在后台继续', onclick: () => { close(); toast('已最小化：' + K.name + '在后台继续，进度在底部状态栏'); } }, '最小化');
    const stopB = h('button', { class: 'btn ghost sm danger', onclick: () => { q.stop = true; stopB.disabled = true; stopB.textContent = '正在停止…'; } }, '停止');
    back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    back.append(h('div', { class: 'dlg', role: 'dialog' }, h('div', { class: 'dlg-t' }, K.name), txt, h('div', { class: 'adbar bjbar-' + K.cls }, bar), sub, h('div', { class: 'dlg-row' }, stopB, h('span', { class: 'grow' }), mini)));
    document.body.append(back);
    this.paintDlg[kind] = () => {
      if (!back.isConnected || this.q[kind] !== q) { this.paintDlg[kind] = null; return; }
      const n = q.done + q.fail; txt.textContent = '正在' + K.verb + '… ' + n + '/' + q.total + (q.fail ? '（失败 ' + q.fail + '）' : '');
      bar.style.width = this.pct(q).toFixed(1) + '%';
      const w = q.until - now();
      sub.textContent = w > 0 ? (q.why === 'server' ? '服务端返回限流（429），' : '服务端返回限流（429），未提供等待时间；客户端短暂退避，') + this.fmtWait(w) + '后自动重试（可最小化）'
        : '可以「最小化」到底部状态栏，任务在后台继续；退出 App 也会在下次打开时接着' + K.verb + '。';
    };
    this.paintDlg[kind]();
    const iv = setInterval(() => { if (!back.isConnected || this.q[kind] !== q) { clearInterval(iv); return; } this.paintDlg[kind]?.(); }, 1000);
  },
  // 统计中的小窗（可取消）
  scanBox(title) {
    const back = h('div', { class: 'dlg-back' }), txt = h('div', { class: 'dlg-h' }, '正在统计…'), bar = h('i', { class: 'bjscan' });
    const st = { stop: false, back, set: t => { txt.textContent = t; }, close: () => back.remove() };
    const cancel = h('button', { class: 'btn ghost sm', onclick: () => { st.stop = true; back.remove(); } }, '取消');
    back.append(h('div', { class: 'dlg', role: 'dialog' }, h('div', { class: 'dlg-t' }, title), txt, h('div', { class: 'adbar' }, bar), h('div', { class: 'dlg-row' }, h('span', { class: 'grow' }), cancel)));
    document.body.append(back);
    return st;
  },

  // ---------- 一键归档：名称（标题 / 模型名）里含归档黑名单关键词的对话，旧的新的全部归档 ----------
  async archBl() {
    if (this.q.arch) { this.dialog('arch'); return; }
    if (this.busy.arch) return; this.busy.arch = true;
    const sc = this.scanBox('一键归档');
    try {
      // 先把全部未归档的对话拉完（每页 50 条）
      const tick = setInterval(() => sc.set('正在读取全部对话… ' + History.items.length), 300);
      try { await History.loadAll(); } finally { clearInterval(tick); }
      if (sc.stop) return;
      sc.close();
      const s = Gacha.settings(), bl = (s.archiveKeywords || []).map(x => String(x).trim()).filter(Boolean);
      const items = History.items.filter(e => e && e.id && !e.isArchived && !e.archivedAt);
      const plan = await this.archPick(items, bl);
      if (!plan) return;
      if (!plan.ids.length) { toast('没有名称含这些关键词的对话'); return; }
      this.start('arch', plan.ids, false);
    } catch (e) { sc.close(); toast('一键归档失败：' + describe(e), 'err'); }
    finally { this.busy.arch = false; }
  },
  // 选关键词 / 看数量的确认窗
  archPick(items, bl) {
    const rows = items.map(e => { const m = this.modelOf(e.id, e.title); return { id: e.id, text: [e.title, m?.name, m?.internal, Models.get(e.id)?.name].filter(Boolean).join(' '), m, fav: Fav.has(e.id), busy: !!Chats.get(e.id)?.busy }; });
    const kw = [...bl]; if (!kw.some(k => /^muse$/i.test(k))) kw.push('muse');
    const on = new Set(bl.length ? bl : kw); on.add(kw.find(k => /^muse$/i.test(k)));
    let skipFav = true;
    return Dialog.open((box, done) => {
      const chips = h('div', { class: 'bj-chips' }), list = h('div', { class: 'bj-list' }), sum = h('div', { class: 'dlg-h' }), okB = h('button', { class: 'btn' });
      const extra = h('input', { class: 'dlg-in', placeholder: '再加关键词（回车添加，只用于这一次）', onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const v = extra.value.trim(); if (v && !kw.some(k => k.toLowerCase() === v.toLowerCase())) kw.push(v); if (v) on.add(kw.find(k => k.toLowerCase() === v.toLowerCase())); extra.value = ''; paint(); } } });
      const favCb = h('input', { type: 'checkbox' }); favCb.checked = true; favCb.onchange = () => { skipFav = favCb.checked; paint(); };
      let ids = [];
      const paint = () => {
        const act = kw.filter(k => on.has(k)), per = new Map(kw.map(k => [k, 0])), dist = new Map();
        ids = []; let favN = 0, busyN = 0;
        for (const r of rows) {
          const hit = kw.filter(k => Gacha.match(r.text, [k])); for (const k of hit) per.set(k, per.get(k) + 1);
          if (!hit.some(k => on.has(k))) continue;
          if (r.busy) { busyN++; continue; }
          if (r.fav && skipFav) { favN++; continue; }
          ids.push(r.id); const nm = r.m?.name || '（未识别型号）'; dist.set(nm, (dist.get(nm) || 0) + 1);
        }
        chips.replaceChildren(...kw.map(k => h('button', { type: 'button', class: 'bj-chip' + (on.has(k) ? ' on' : ''), title: bl.includes(k) ? '归档黑名单里的关键词' : '只用于这一次（不在归档黑名单里）', onclick: () => { on.has(k) ? on.delete(k) : on.add(k); paint(); } }, k, h('b', {}, String(per.get(k) || 0)), bl.includes(k) ? null : h('span', { class: 'dim' }, '+'))));
        const top = [...dist].sort((a, b) => b[1] - a[1]);
        list.replaceChildren(...top.slice(0, 14).map(([n, c]) => h('div', { class: 'bj-row' }, h('span', { class: 'bj-n' }, n), h('b', {}, '×' + c))), ...(top.length > 14 ? [h('div', { class: 'bj-row dim' }, '… 另有 ' + (top.length - 14) + ' 种型号')] : []));
        sum.textContent = (act.length ? '共 ' + items.length + ' 个未归档对话，名称（标题 / 模型名）含所选关键词的 ' + ids.length + ' 个会被归档' : '请至少选一个关键词') + (favN ? '；跳过收藏 ' + favN + ' 个' : '') + (busyN ? '；进行中的 ' + busyN + ' 个不动' : '') + '。';
        okB.textContent = '归档 ' + ids.length + ' 个'; okB.disabled = !ids.length || null;
      };
      okB.onclick = () => { if (ids.length) done({ ids: ids.slice() }); };
      box.classList.add('bj-dlg');
      box.append(h('div', { class: 'dlg-t' }, '一键归档'),
        h('div', { class: 'dlg-h dim' }, '按「归档黑名单」关键词匹配（不分大小写），点关键词可以取消 / 选中。已归档的对话可以用旁边的「删除」按厂商清理。'),
        chips, extra, sum, list,
        h('label', { class: 'bj-opt' }, favCb, '跳过收藏的对话'),
        h('div', { class: 'dlg-row' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => done(null) }, '取消'), okB));
      paint();
    });
  },

  // ---------- 删除归档：先按厂商 / 型号分类，勾选后一键删除 ----------
  async delArchived() {
    if (this.q.del) { this.dialog('del'); return; }
    if (this.busy.del) return; this.busy.del = true;
    const sc = this.scanBox('删除归档对话');
    try {
      const got = []; let cursor = '', other = 0;
      for (let i = 0; i < 400 && !sc.stop; i++) {
        const j = await api('/api/history/unified?limit=50&includeArchived=true&archivedOnly=true' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        for (const e of j.entries || []) { if (!(e.archivedAt || e.isArchived)) continue; if (e.type === 'agentic' || e.productMode) got.push({ id: e.id, title: e.title || '' }); else other++; }
        sc.set('正在统计已归档的对话… ' + got.length);
        cursor = j.pagination?.hasMore ? j.pagination.cursor : ''; if (!cursor) break;
      }
      if (sc.stop) return;
      sc.close();
      const seen = new Set(), list = got.filter(e => !seen.has(e.id) && seen.add(e.id));
      if (!list.length) { toast(other ? '没有可删除的归档对话（另有 ' + other + ' 个旧版对战记录，客户端删不了）' : '没有已归档的对话'); return; }
      const ids = await this.delPick(list);
      if (!ids || !ids.length) return;
      if (!await Dialog.confirm({ title: '删除归档对话', text: '是否删除 ' + ids.length + ' 个归档对话？\n删除后无法恢复（只删本账号已归档的，未归档的对话不受影响）。' + (ids.length > 10 ? '\n\nBrana 限制删除频率（约每分钟 10 个），' + ids.length + ' 个大约需要 ' + Math.ceil(ids.length / 10) + ' 分钟；在后台按上限速度自动删，可以最小化到底部状态栏。' : ''), ok: '删除', danger: true })) return;
      this.start('del', ids, false);
    } catch (e) { sc.close(); toast('删除归档失败：' + describe(e), 'err'); }
    finally { this.busy.del = false; }
  },
  // 分类：已识别的按厂商分组（每组显示型号分布），拿不到型号的单独一组「未识别」（默认不勾，保留）
  group(list) {
    const vend = new Map(), unk = [];
    for (const e of list) {
      const m = this.modelOf(e.id, e.title);
      if (!m) { unk.push(e.id); continue; }
      let g = vend.get(m.vid); if (!g) vend.set(m.vid, g = { vid: m.vid, ids: [], models: new Map(), guess: 0 });
      g.ids.push(e.id); if (m.guess) g.guess++;
      g.models.set(m.name, (g.models.get(m.name) || 0) + 1);
    }
    const order = ['anthropic', 'openai', 'google', 'xai', 'moonshot'];
    const groups = [...vend.values()].sort((a, b) => { const ia = order.indexOf(a.vid), ib = order.indexOf(b.vid); if (a.vid === 'other' || b.vid === 'other') return a.vid === 'other' ? 1 : -1; return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.ids.length - a.ids.length; });
    return { groups, unk };
  },
  delPick(list) {
    const { groups, unk } = this.group(list), idN = groups.reduce((s, g) => s + g.ids.length, 0);
    const sel = new Set(groups.map(g => g.vid)); let selUnk = false;
    return Dialog.open((box, done) => {
      const body = h('div', { class: 'bj-groups' }), okB = h('button', { class: 'btn danger' }), sum = h('span', { class: 'dim' });
      const allCb = h('input', { type: 'checkbox' }), unkCb = h('input', { type: 'checkbox' });
      const count = () => groups.filter(g => sel.has(g.vid)).reduce((s, g) => s + g.ids.length, 0) + (selUnk ? unk.length : 0);
      const paint = () => {
        const n = count(); okB.textContent = '删除 ' + n + ' 个'; okB.disabled = !n || null;
        sum.textContent = '已选 ' + n + ' / ' + list.length;
        allCb.checked = groups.length > 0 && groups.every(g => sel.has(g.vid)); allCb.indeterminate = !allCb.checked && groups.some(g => sel.has(g.vid));
        unkCb.checked = selUnk;
        body.querySelectorAll('[data-vid]').forEach(el => { const cb = el.querySelector('input'); cb.checked = sel.has(el.dataset.vid); el.classList.toggle('off', !cb.checked); });
        unkRow.classList.toggle('off', !selUnk);
      };
      allCb.onchange = () => { if (allCb.checked) groups.forEach(g => sel.add(g.vid)); else sel.clear(); paint(); };
      unkCb.onchange = () => { selUnk = unkCb.checked; paint(); };
      const vrow = g => {
        const cb = h('input', { type: 'checkbox' }); cb.onchange = () => { cb.checked ? sel.add(g.vid) : sel.delete(g.vid); paint(); };
        const ms = [...g.models].sort((a, b) => b[1] - a[1]);
        const logo = Brand.NAME[g.vid] ? VIcon.el(g.vid, 16) : h('span', { class: 'bj-logo dim' }, g.vid === 'compat' ? '国' : '?');
        return h('label', { class: 'bj-g', 'data-vid': g.vid }, cb,
          h('div', { class: 'bj-gb' },
            h('div', { class: 'bj-gt' }, logo, h('b', {}, this.vname(g.vid)), h('span', { class: 'dim' }, g.ids.length + ' 个对话 · ' + ms.length + ' 种型号' + (g.guess ? ' · 推测 ' + g.guess : ''))),
            h('div', { class: 'bj-ms' }, ...ms.slice(0, 10).map(([n, c]) => h('span', { class: 'bj-m', title: n }, n, h('b', {}, '×' + c))), ms.length > 10 ? h('span', { class: 'bj-m dim' }, '+' + (ms.length - 10) + ' 种') : null)));
      };
      const unkRow = h('label', { class: 'bj-g bj-unk' }, unkCb, h('div', { class: 'bj-gb' }, h('div', { class: 'bj-gt' }, h('span', { class: 'bj-logo dim' }, '?'), h('b', {}, '未识别'), h('span', { class: 'dim' }, unk.length + ' 个对话')), h('div', { class: 'bj-ms dim' }, '本机没有型号记录、标题里也看不出型号的对话（默认保留，勾选才删）')));
      body.append(...[
        groups.length ? h('label', { class: 'bj-sec' }, allCb, h('b', {}, '已识别'), h('span', { class: 'dim' }, idN + ' 个 · ' + groups.length + ' 个厂商')) : null,
        ...groups.map(vrow),
        unk.length ? h('div', { class: 'bj-sec' }, h('b', {}, '未识别'), h('span', { class: 'dim' }, unk.length + ' 个')) : null,
        unk.length ? unkRow : null].filter(Boolean));
      okB.onclick = () => { const ids = [...groups.filter(g => sel.has(g.vid)).flatMap(g => g.ids), ...(selUnk ? unk : [])]; if (ids.length) done(ids); };
      box.classList.add('bj-dlg');
      box.append(h('div', { class: 'dlg-t' }, '删除归档对话 · 共 ' + list.length + ' 个'),
        h('div', { class: 'dlg-h dim' }, '按厂商分类（型号来自本机的模型信息或标题）。勾选要删的类别，可以只删已识别的、只删未识别的，或都删。'),
        body,
        h('div', { class: 'dlg-row' }, sum, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => done(null) }, '取消'), okB));
      paint();
    });
  },
};
