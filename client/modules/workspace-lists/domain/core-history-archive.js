const ENT_AT = new WeakMap();
const entAt = e => { if (!e) return NaN; const raw = e.updatedAt || e.createdAt || ''; const c = ENT_AT.get(e); if (c && c[0] === raw) return c[1]; const v = Date.parse(String(raw).replace(' ', 'T').replace(/\+00$/, 'Z')); ENT_AT.set(e, [raw, v]); return v; };
const History = {
  items: [], cursor: null, hasMore: true, loading: false, err: null, lastLoad: 0, seen: new Set(), ck: '',
  isGhostLocal(e) {
    return Boolean(e && (e._localRecovered || /^本地缓存对话(\s|$)/i.test(String(e.title || '').trim())));
  },
  uuidTs(sid) {
    const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7/i.exec(String(sid || '').trim());
    if (!m) return 0;
    const ms = parseInt(m[1] + m[2], 16);
    return Number.isFinite(ms) && ms > 1700000000000 && ms < 2500000000000 ? ms : 0;
  },
  seedFromAccountStats() {
    try {
      const gone = this.goneMap?.() || new Map();
      const vendors = (typeof UI !== 'undefined' && UI.host?.account?.status?.stats?.vendors) || null;
      let modelsDirty = false, notesDirty = false;
      if (vendors && typeof vendors === 'object') {
        for (const vObj of Object.values(vendors)) {
          const models = vObj?.models || {};
          for (const [mName, mObj] of Object.entries(models)) {
            for (const row of (mObj?.list || [])) {
              if (!Array.isArray(row) || !row[0]) continue;
              const [sid, atMs, , known, note] = row;
              if (!sid || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid))) continue;
              if (mName && !/^(未识别|未知型号|待定)$/.test(String(mName).trim()) && typeof Models !== 'undefined' && Models.all && !Models.all[sid]?.name) {
                Models.all[sid] = { ...(Models.all[sid] || {}), name: mName, sid, at: Number(atMs) || now(), habitInferred: !!known, pendingConfirm: false };
                modelsDirty = true;
              }
              if (note && typeof Notes !== 'undefined' && Notes.all && !Notes.all[sid]?.v && !Notes.all[sid]?.n) {
                Notes.all[sid] = { n: String(note), t: Number(atMs) || now() };
                notesDirty = true;
              }
            }
          }
        }
      }
      if (modelsDirty) try { if (typeof Models !== 'undefined' && Models.save) Models.save(); else Store.set('models2', Models.all); } catch {}
      if (notesDirty) try { Store.set('notes2', Notes.all); } catch {}
    } catch {}
    return 0;
  },
  // 本地轻量缓存：重启后先用上次的列表立刻显示，再在后台刷新（统计也直接用它）
  warm(acct) {
    const isFast = !acct || acct === 'fast' || acct === 'anon';
    if (!isFast) this.ck = 'hist:' + acct;
    if (this.items.length) {
      this.seedFromAccountStats();
      Bus.emit('history');
      if (typeof UI !== 'undefined') void this.restoreFromLocalCache?.();
      return;
    }
    let c = !isFast ? Store.get(this.ck, null) : null;
    if (isFast && (!c || !Array.isArray(c.items) || !c.items.length)) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.startsWith('anc:hist:') && k !== 'anc:hist:fast' && k !== 'anc:hist:anon') {
            const cand = Store.get(k.slice(4), null);
            if (cand && Array.isArray(cand.items) && cand.items.length > (c?.items?.length || 0)) {
              c = cand;
              if (!this.ck) this.ck = k.slice(4);
            }
          }
        }
      } catch {}
    }
    if (c && Array.isArray(c.items) && c.items.length) {
      const gone = this.goneMap?.() || new Map();
      const purgedGhosts = this._warmPurgedGhosts || (this._warmPurgedGhosts = new Set());
      this.items = c.items.filter(e => {
        if (!e?.id || gone.has(e.id) || (typeof Arch !== 'undefined' && Arch.has?.(e.id))) return false;
        if (/^本地缓存对话(\s|$)/i.test(String(e.title || '').trim())) {
          purgedGhosts.add(e.id);
          return false;
        }
        return true;
      });
      this.dedupe(); this.cached = c.at || 0; this.full = false; this.fullAt = 0;
      if (purgedGhosts.size > 0) this.saveSoon();
    }
    this.seedFromAccountStats();
    if (this.items.length) Bus.emit('history');
    if (typeof UI !== 'undefined') void this.restoreFromLocalCache?.();
  },
  saveSoon() {
    if (!this.ck) return; clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      const pick = e => { const o = {}; for (const k of ['id', 'type', 'productMode', 'title', 'localTitle', 'createdAt', 'updatedAt', 'isArchived', 'isPinned', 'modality', 'mode', 'modelAId', 'modelBId', 'modelAOrganization', 'modelBOrganization', 'gachaNo']) if (e[k] !== undefined) o[k] = e[k]; return o; };
      const cleanItems = this.items.filter(e => !e._pending && !e._localRecovered && !/^本地缓存对话(\s|$)/i.test(String(e?.title || '').trim())).slice(0, 5000).map(pick);
      if (!cleanItems.length) {
        const prev = Store.get(this.ck, null);
        const gone = this.goneMap?.() || new Map();
        const prevAlive = Array.isArray(prev?.items) ? prev.items.filter(x => x?.id && !gone.has(x.id) && !/^本地缓存对话(\s|$)/i.test(String(x?.title || '').trim())) : [];
        if (prevAlive.length > 0) return;
      }
      const payload = { at: now(), full: !!this.full && this.items.length <= 5000, fullAt: this.fullAt || 0, items: cleanItems };
      Store.set(this.ck, payload);
      if (cleanItems.length > 0) {
        try { if (typeof MsgCache !== 'undefined' && MsgCache.putMeta) void MsgCache.putMeta(this.ck, payload); } catch {}
        try {
          const aid = (typeof UI !== 'undefined' && UI.host?.account?.id) || (this.ck.startsWith('hist:') ? this.ck.slice(5) : '');
          const tNow = now();
          if (aid && aid !== 'web' && aid !== 'fast' && aid !== 'anon' && typeof Host !== 'undefined' && Host.shared && (tNow - (this._lastHostSharedAt || 0) > 15000)) {
            this._lastHostSharedAt = tNow;
            const sharedPayload = cleanItems.length > 300 ? { ...payload, items: cleanItems.slice(0, 300) } : payload;
            void Promise.resolve(Host.shared('hist@' + aid, sharedPayload)).catch(() => {});
          }
        } catch {}
      }
    }, 1500);
  },
  // Refresh and pagination mutate one cursor chain. Never let their responses commit out of order.
  serial(task) {
    const run = (this.opP || Promise.resolve()).catch(() => {}).then(task);
    this.opP = run; return run;
  },
  page(j) {
    const p = j?.pagination;
    if (!j || !Array.isArray(j.entries) || !p || typeof p.hasMore !== 'boolean' ||
        (p.hasMore && (typeof p.cursor !== 'string' || !p.cursor || p.cursor.length > 4096)) ||
        j.entries.some(e => !e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id)) {
      throw Object.assign(Error('历史列表响应格式异常，已保留本地列表；请刷新重试'), { historyStop: true });
    }
    const gone = this.goneMap();
    return { entries: j.entries.filter(e => (e.type === 'agentic' || e.type === 'evaluation' || e.productMode || e.mode) && !e.isArchived && !e.archivedAt && !gone.has(e.id) && !(typeof Arch !== 'undefined' && Arch.has?.(e.id))).map(e => ({ ...e, ...(e.mode !== undefined ? { mode: e.mode } : {}), ...(e.modelAId !== undefined ? { modelAId: e.modelAId } : {}), ...(e.modelBId !== undefined ? { modelBId: e.modelBId } : {}), ...(e.modelAOrganization !== undefined ? { modelAOrganization: e.modelAOrganization } : {}), ...(e.modelBOrganization !== undefined ? { modelBOrganization: e.modelBOrganization } : {}) })), cursor: p.hasMore ? p.cursor : null, hasMore: p.hasMore };
  },
  // 已归档 / 删除的对话：本机记住 30 天，防止本地残留统计或延迟列表把已删对话复活成「本地缓存对话」。
  goneMap() {
    if (!this.gone) { let g = {}; try { g = Store.get('histgone', {}); } catch {} const t = now(); this.gone = new Map(Object.entries(g && typeof g === 'object' ? g : {}).filter(([, at]) => t - at < 30 * 86400e3)); }
    return this.gone;
  },
  bury(ids) {
    const m = this.goneMap(), set = new Set(ids.filter(Boolean)); if (!set.size) return;
    for (const id of set) { m.delete(id); m.set(id, now()); }
    while (m.size > 5000) m.delete(m.keys().next().value);
    Store.set('histgone', Object.fromEntries(m));
    const n = this.items.length; this.items = this.items.filter(e => !set.has(e.id));
    if (n !== this.items.length) { this.saveSoon(); Bus.emit('history'); }
  },
  merge(got, head = false) {
    const prevById = new Map(this.items.map(e => [e.id, e]));
    const rows = new Map();
    const withLocal = e => {
      const p = prevById.get(e.id);
      const gNo = e.gachaNo || p?.gachaNo || (typeof Gacha !== 'undefined' && Gacha.sidNo ? Gacha.sidNo(e.id) : 0) || 0;
      let out = e;
      if (p) {
        for (const k of ['mode', 'modality', 'modelAId', 'modelBId', 'modelAOrganization', 'modelBOrganization']) {
          if (out[k] === undefined && p[k] !== undefined) {
            if (out === e) out = { ...e };
            out[k] = p[k];
          }
        }
      }
      if (gNo) {
        if (out === e) out = { ...e };
        out.gachaNo = gNo;
        if (!out.localTitle || out.localTitle === out.title) out.localTitle = '#' + gNo;
      }
      if (out.localTitle !== undefined) return out;
      if (!p?.localTitle) return out;
      const mi = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      const hasLocalMi = Boolean(mi?.name && !mi.pendingConfirm && (!mi.guess || mi.userCorrected || mi.habitInferred || mi.reverseInferred || mi.billingProbe));
      if (p.title === e.title || hasLocalMi) return { ...out, localTitle: (hasLocalMi && typeof Titles !== 'undefined' && Titles.want ? Titles.want(e.id) : '') || p.localTitle };
      return out;
    };
    if (head) { for (const e of got) rows.set(e.id, withLocal(e)); for (const e of this.items) if (!rows.has(e.id)) rows.set(e.id, e); }
    else { for (const e of this.items) rows.set(e.id, e); for (const e of got) rows.set(e.id, withLocal(e)); }
    this.items = [...rows.values()];
    for (const e of got) this.seen.add(e.id);
  },
  complete() {
    if (!this.scan || this.hasMore || this.err) return;
    const gone = this.goneMap?.() || new Map();
    const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
    const keepLocal = isOffline;
    const mcKeys = keepLocal ? new Set([
      ...(typeof MsgCache !== 'undefined' && MsgCache.keys ? MsgCache.keys() : []),
    ]) : new Set();
    const removedIds = new Set();
    this.items = this.items.filter(e => {
      if (!e?.id || gone.has(e.id) || (typeof Arch !== 'undefined' && Arch.has?.(e.id))) {
        if (e?.id) removedIds.add(e.id);
        return false;
      }
      if (!keepLocal && this.isGhostLocal(e) && !this.seen.has(e.id)) {
        removedIds.add(e.id);
        return false;
      }
      const keep = this.seen.has(e.id) || !this.scan.baseline.has(e.id) || (keepLocal && (e._localRecovered || mcKeys.has(e.id) || this.seen.size === 0)) || Chats.get(e.id)?.busy;
      if (!keep && e?.id) removedIds.add(e.id);
      return keep;
    });
    if (!keepLocal && removedIds.size > 0 && typeof Tabs !== 'undefined' && Array.isArray(Tabs.list)) {
      for (const t of [...Tabs.list]) {
        if (t.kind === 'chat' && t.sid && removedIds.has(t.sid) && !Chats.get(t.sid)?.busy) {
          try { Tabs.close?.(t.key); } catch {}
        }
      }
    }
    this.full = true; this.fullAt = now();
  },
  async restoreFromLocalCache() {
    if (this._restoringP) return this._restoringP;
    this._restoringP = (async () => {
      try {
        const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
        const gone = this.goneMap?.() || new Map();
        this.seedFromAccountStats();
        let added = 0;
        let updated = 0;
        // 清理之前遗留在列表或冷启动缓存中的「本地缓存对话 <sid8>」幽灵条目（无实际消息缓存或已被服务端排除）
        const ghostCandidates = new Set(this._warmPurgedGhosts ? [...this._warmPurgedGhosts] : []);
        const alreadyConfirmedEmptyGhosts = new Set();
        if (this._warmPurgedGhosts) this._warmPurgedGhosts.clear();
        if (Array.isArray(this.items) && this.items.length) {
          const kept = [];
          for (const item of this.items) {
            if (!item?.id || gone.has(item.id) || (typeof Arch !== 'undefined' && Arch.has?.(item.id))) {
              updated++;
              continue;
            }
            if (this.isGhostLocal(item) && !this.seen.has(item.id)) {
              const c = typeof MsgCache !== 'undefined' ? await MsgCache.get(item.id).catch(() => null) : null;
              if (!Array.isArray(c?.messages) || !c.messages.length) {
                ghostCandidates.add(item.id);
                alreadyConfirmedEmptyGhosts.add(item.id);
                updated++;
                continue;
              }
            }
            kept.push(item);
          }
          if (kept.length !== this.items.length) this.items = kept;
        }
        if (ghostCandidates.size > 0) {
          const confirmedGhosts = [];
          let turnsDirty = false;
          for (const gid of ghostCandidates) {
            const isEmpty = alreadyConfirmedEmptyGhosts.has(gid) || await (async () => {
              const c = typeof MsgCache !== 'undefined' ? await MsgCache.get(gid).catch(() => null) : null;
              return !Array.isArray(c?.messages) || !c.messages.length;
            })();
            if (isEmpty) {
              confirmedGhosts.push(gid);
              if (typeof AcctStats !== 'undefined' && AcctStats.turns && AcctStats.turns[gid]) {
                delete AcctStats.turns[gid];
                turnsDirty = true;
              }
              try { if (typeof Notes !== 'undefined' && Notes.all?.[gid] && !Notes.all[gid].n) Notes.drop?.(gid); } catch {}
            }
          }
          if (turnsDirty) try { AcctStats.save?.(); } catch {}
          if (confirmedGhosts.length > 0) {
            try { this.bury?.(confirmedGhosts); } catch {}
            updated++;
          }
        }
        const existing = new Set((this.items || []).map(x => x?.id).filter(Boolean));
        const aid = (typeof UI !== 'undefined' && UI.host?.account?.id) || (this.ck?.startsWith('hist:') ? this.ck.slice(5) : '');
        try {
          if (typeof MsgCache !== 'undefined' && MsgCache.getMeta) {
            const metaModels = await MsgCache.getMeta('models').catch(() => null);
            if (metaModels && typeof metaModels === 'object' && typeof Models !== 'undefined' && Models.all) {
              let mDirty = false;
              for (const [sid, mv] of Object.entries(metaModels)) {
                if (sid && mv && !gone.has(sid) && !Models.all[sid]?.name) { Models.all[sid] = mv; mDirty = true; }
              }
              if (mDirty) try { Store.set('models', Models.all); } catch {}
            }
            // 仅当本地列表完全为空且尚未从服务端成功拉取时，才用备份列表做冷启动兜底
            if (!this.items.length && !this.lastLoad && this.ck) {
              const metaHist = await MsgCache.getMeta(this.ck).catch(() => null);
              if (Array.isArray(metaHist?.items)) {
                for (const e of metaHist.items) {
                  const sid = e?.id;
                  if (!sid || existing.has(sid) || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || this.isGhostLocal(e)) continue;
                  this.items.push(e);
                  existing.add(sid);
                  added++;
                }
              }
            }
          }
        } catch {}
        try {
          if (!this.items.length && !this.lastLoad && aid && aid !== 'web' && aid !== 'fast' && aid !== 'anon' && typeof Host !== 'undefined' && Host.shared) {
            const sharedHist = await Promise.resolve(Host.shared('hist@' + aid)).catch(() => null);
            if (Array.isArray(sharedHist?.items)) {
              for (const e of sharedHist.items) {
                const sid = e?.id;
                if (!sid || existing.has(sid) || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || this.isGhostLocal(e)) continue;
                this.items.push(e);
                existing.add(sid);
                added++;
              }
            }
          }
        } catch {}
        // 只用真实存在本地消息缓存（MsgCache）的会话补齐标题，绝不凭空把 turns/notes/models 残留 key 伪造成「本地缓存对话」
        const needEnrichOnlineSids = !isOffline
          ? (this.items || []).filter(row => row?.id && (this.isGhostLocal(row) || row.title === String(row.id).slice(0, 8))).map(row => row.id)
          : null;
        const idbKeys = needEnrichOnlineSids !== null
          ? needEnrichOnlineSids
          : ((typeof MsgCache !== 'undefined' && MsgCache.allKeys)
              ? await MsgCache.allKeys().catch(() => [])
              : (typeof MsgCache !== 'undefined' && MsgCache.keys ? MsgCache.keys() : []));
        for (const sid of idbKeys) {
          if (!sid || gone.has(sid) || (typeof Arch !== 'undefined' && Arch.has?.(sid)) || !/^[0-9a-f-]{8,64}$/i.test(sid)) continue;
          const row = existing.has(sid) ? this.byId(sid) : null;
          const needsEnrich = row && (this.isGhostLocal(row) || row.title === sid.slice(0, 8));
          if (row && !needsEnrich) continue;
          if (!row && !isOffline) continue;
          const cached = typeof MsgCache !== 'undefined' ? await MsgCache.get(sid).catch(() => null) : null;
          if (!Array.isArray(cached?.messages) || !cached.messages.length) continue;
          const mi = typeof Models !== 'undefined' ? (Models.get?.(sid) || Models.all?.[sid] || null) : null;
          const firstUser = cached.messages.find(m => m?.role === 'user');
          const firstTxt = (firstUser?.parts || []).find(p => p?.type === 'text')?.text || (typeof firstUser?.content === 'string' ? firstUser.content : '') || '';
          const cleanFirst = String(firstTxt).replace(/\s+/g, ' ').trim().slice(0, 48);
          const noteTxt = (typeof Notes !== 'undefined' && Notes.get?.(sid)) || '';
          const t = (typeof Titles !== 'undefined' && Titles.raw?.(sid)) || cleanFirst || mi?.name || noteTxt;
          if (!t || /^本地缓存对话(\s|$)/i.test(t)) continue;
          const fallbackMs = cached?.at || Date.parse(firstUser?.createdAt || '') || mi?.at || this.uuidTs(sid) || now();
          const ts = cached?.histUpdatedAt || new Date(fallbackMs).toISOString();
          if (row) {
            if (t !== row.title) {
              row.title = t;
              delete row._localRecovered;
              updated++;
            }
          } else if (isOffline) {
            this.items.push({ id: sid, type: 'agentic', title: t, createdAt: ts, updatedAt: ts, mode: 'agent', _localRecovered: true });
            existing.add(sid);
            added++;
          }
        }
        if (added > 0 || updated > 0) {
          this.items.sort((a, b) => (entAt(b) || 0) - (entAt(a) || 0));
          this.dedupe();
          this.saveSoon();
          Bus.emit('history');
          try { if (typeof UI !== 'undefined') UI.renderList?.(); } catch {}
        }
      } catch {}
    })().finally(() => { this._restoringP = null; });
    return this._restoringP;
  },
  refresh(opt) {
    return this.refreshP ||= this.serial(() => this.refreshNow(opt)).finally(() => { this.refreshP = null; });
  },
  /* 自动刷新的唯一入口（定时 / 回到前台 / 有新对话）。列表其实很少变：除非有新对话，低频拉一次就够——
     tick：距上次请求 ≥ 3 分钟才拉；front：回到前台 ≥ 2 分钟才拉；new（新对话 / 新对话的第一轮回复完成）：≥ 20 秒，没到就排一次延后的。
     限流冷却期间（列表自己的 Retry-After，或读对话收到 429 后的全局冷却）一律不发，冷却结束后补一次。手动「刷新」不走这里。 */
  GAP: { tick: 180000, front: 120000, new: 20000 },
  auto(why = 'tick') {
    if ((typeof document !== 'undefined' && document.hidden) || this.fullLoading) return;
    const t = now(), cool = Math.max(this.retryAt || 0, ReadLimit.until || 0), due = Math.max(cool, (this.attemptAt || 0) + (this.GAP[why] ?? this.GAP.tick));
    if (due <= t) { void this.refresh({ bg: true }); return; }
    if (why === 'new' || cool > t && this.pendingNew) {   // 有新对话等着拉标题：排一次（只排一个，取最早能发的时刻）
      this.pendingNew = true;
      if (this.autoT && this.autoDue <= due) return;
      clearTimeout(this.autoT); this.autoDue = due;
      this.autoT = setTimeout(() => { this.autoT = 0; this.auto('new'); }, due - t + 300); this.autoT?.unref?.();
    }
  },
  // 一轮回复结束：本地把这个对话挪到最前、更新时间（不用为此请求整个列表）；只有本机新建、服务器列表里还没有的对话才需要拉一次拿标题
  touched(sid) {
    if (!sid) return;
    const e = this.byId(sid);
    if (e) { e.updatedAt = new Date().toISOString(); const i = this.items.indexOf(e); if (i > 0) { this.items.splice(i, 1); this.items.unshift(e); } this.saveSoon(); Bus.emit('history'); }
    if (!e || e._local) this.auto('new');
  },
  limited() { return this.errKind === 'limit' && Math.max(this.retryAt || 0, ReadLimit.until || 0) > now(); },
  async refreshNow(opt = {}) {
    if (this.retryAt > now()) { Bus.emit('history'); return; }
    if (opt.bg && ReadLimit.active()) { this.errKind = 'limit'; this.err = this.err || '限流冷却中'; this.blocked = true; this.auto('new'); Bus.emit('history'); return; }   // 冷却中：不发，冷却完自动补
    this.attemptAt = now(); this.pendingNew = false;
    this.full = false; this.blocked = false;
    const baseline = new Set(this.items.map(e => e.id));
    try {
      // 列表接口偶尔很慢：45 秒上限，传输类失败自动再试一次；失败时保留本地列表，不打断使用
      let j;
      for (let i = 0; ; i++) {
        try { j = this.page(await api('/api/history/unified?limit=50&includeArchived=false', { noRelogin: !!opt.noRelogin, timeout: 45000, bg: !!opt.bg })); break; }
        catch (e) { if (i || !(typeof NetPolicy!=="undefined"&&NetPolicy.transportError(e)) || e.historyStop) throw e; this.retrying = true; Bus.emit('history'); await sleep(2500); }
        finally { this.retrying = false; }
      }
      this.seen = new Set(); this.scan = { baseline, cursors: new Set() };
      const prevUpdatedById = new Map();
      for (const pe of this.items) if (pe?.id && pe.updatedAt) prevUpdatedById.set(pe.id, pe.updatedAt);
      this.merge(j.entries, true); this.cursor = j.cursor; this.hasMore = j.hasMore;
      try {
        const entriesList = j.entries || [];
        for (let idx = 0; idx < entriesList.length; idx++) {
          const se = entriesList[idx];
          if (!se?.id || !se.updatedAt) continue;
          const c = typeof Chats !== 'undefined' ? Chats.get(se.id) : null;
          const prevUpd = c?._lastSyncedHistAt || prevUpdatedById.get(se.id);
          const srvUpdMs = Date.parse(se.updatedAt) || 0;
          const prevUpdMs = Date.parse(prevUpd || '') || 0;
          const localRecentMs = Math.max(c?.endAt || 0, c?.recAt || 0, c?.sentAt || 0);
          const isUpdated = Boolean(prevUpd && se.updatedAt !== prevUpd);
          const isRealRemoteUpd = isUpdated && (!srvUpdMs || !prevUpdMs || srvUpdMs > prevUpdMs + 1500) && (!localRecentMs || !srvUpdMs || srvUpdMs > localRecentMs + 3000);
          const isNewRemote = Boolean(baseline.size > 0 && !baseline.has(se.id) && idx < 3);
          if (isRealRemoteUpd || isNewRemote) {
            if (c) c._lastSyncedHistAt = se.updatedAt;
            if (typeof Tabs !== 'undefined' && Tabs.cur?.sid === se.id && c) {
              if (c.loaded && !c.loading && !c.busy && !(c.watching && !c.wFails)) c.quickSync?.(true);
              else if (!c.loaded && !c.loading) void c.load(true).catch(() => {});
            } else if (c && !c.loading && !c.busy) {
              c.loaded = false; c.cached = true;
            }
          }
        }
      } catch {}
      const isOffline = (typeof Host !== 'undefined' && Host.online === false) || (typeof BrowseMode !== 'undefined' && BrowseMode.active?.());
      const keepLocal = isOffline;
      if (!keepLocal && j.entries.length > 0) {
        const minSrvTs = Date.parse(j.entries.at(-1)?.updatedAt || j.entries.at(-1)?.createdAt || '') || 0;
        const headRemoved = new Set();
        this.items = this.items.filter(e => {
          if (!e?.id || this.seen.has(e.id) || e._local || e._pending || Chats.get(e.id)?.busy) return true;
          if (this.isGhostLocal(e)) {
            headRemoved.add(e.id);
            return false;
          }
          if (!baseline.has(e.id)) return true;
          const eTs = Date.parse(e.updatedAt || e.createdAt || '') || 0;
          if (!j.hasMore || (minSrvTs > 0 && eTs > minSrvTs + 1000)) {
            headRemoved.add(e.id);
            return false;
          }
          return true;
        });
        if (headRemoved.size > 0 && typeof Tabs !== 'undefined' && Array.isArray(Tabs.list)) {
          for (const t of [...Tabs.list]) {
            if (t.kind === 'chat' && t.sid && headRemoved.has(t.sid) && !Chats.get(t.sid)?.busy) {
              try { Tabs.close?.(t.key); } catch {}
            }
          }
        }
      }
      this.err = null; this.errKind = ''; this.retryAt = 0; this.lastLoad = now(); this.complete(); this.saveSoon();
    } catch (e) {
      if (e?.status === 401 && opt.noRelogin && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function') {
        const relogged = await Auth.relogin().catch(() => false);
        if (relogged) {
          this.err = null;
          this.errKind = '';
          this.blocked = false;
          setTimeout(() => { void this.refresh({ noRelogin: true }); }, 0);
          Bus.emit('history');
          return;
        }
      }
      if (e?.status === 401 && (opt.noRelogin || (typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE && this.items.length > 0 && !opt.manual))) {
        this.err = null;
        this.errKind = '';
        this.blocked = false;
      } else {
        this.failure(e); this.blocked = true; this.retrySoon();
      }
    }
    Bus.emit('history');
  },
  // 失败后后台自动重试（20 秒、1 分钟、3 分钟），成功即停
  retrySoon() {
    if (this.errKind === 'limit') { this.pendingNew = true; this.auto('new'); return; }   // 限流：冷却结束后补一次，不按 20 秒 / 1 分钟去撞
    if (this.retryT || this.retryAt > now()) return;
    const n = this.autoRetries = (this.autoRetries || 0) + 1; if (n > 3) return;
    this.retryT = setTimeout(() => { this.retryT = 0; if (typeof document !== 'undefined' && document.hidden) { this.autoRetries--; return; } this.refresh().then(() => { if (!this.err) this.autoRetries = 0; }); }, [20e3, 60e3, 180e3][n - 1]); this.retryT?.unref?.();
  },
  failure(e) {
    this.err = describe(e); this.errKind = e.status === 429 ? 'limit' : '';
    const wait = Math.max(Number(e.retryAfterMs) || 0, e.status === 429 ? 60000 : 0);
    if (wait) this.retryAt = now() + wait;
    if (wait || e.historyStop || e.responseFormat || [401,403].includes(e.status)) this.blocked = true;
  },
  more(bulk) {
    return this.moreP ||= this.serial(() => this.moreNow(bulk)).finally(() => { this.moreP = null; });
  },
  async moreNow(bulk) {
    if (this.blocked || !this.scan || !this.hasMore || !this.cursor) return;
    const cursor = this.cursor; this.loading = true;
    if (!bulk) Bus.emit('history');
    try {
      const j = this.page(await api('/api/history/unified?limit=' + (bulk ? 50 : 30) + '&includeArchived=false&cursor=' + encodeURIComponent(cursor), { timeout: 45000 }));
      if (j.hasMore && (j.cursor === cursor || this.scan.cursors.has(j.cursor))) {
        throw Object.assign(Error('历史分页游标重复，已停止重复请求；请刷新重试'), { historyStop: true });
      }
      this.scan.cursors.add(cursor); this.merge(j.entries);
      this.cursor = j.cursor; this.hasMore = j.hasMore; this.err = null;
      this.complete(); if (!bulk) this.saveSoon();
    } catch (e) { this.failure(e); }
    finally {
      this.loading = false;
      // Thousands of long encrypted titles must not trigger a full sidebar/statistics paint on every page.
      if (!bulk || this.err || now() - (this.paintAt || 0) >= 750) { this.paintAt = now(); Bus.emit('history'); }
    }
  },
  // 全量扫描有界、单飞；只有确认到达有效分页末尾才删除陈旧缓存。
  async loadAll() {
    if (this.allP) return this.allP;
    this.allP = (async () => {
      if (this.refreshP) await this.refreshP;
      else if (!this.lastLoad && !this.blocked) await this.refresh();
      if (this.blocked) return;
      this.fullLoading = true; Bus.emit('history');
      try {
        let i = 0, fail = 0;
        for (; i < 200 && this.hasMore && this.cursor && !this.blocked; i++) {
          await this.more(true);
          if (this.err) { if (this.blocked || ++fail >= 3) break; await sleep(1500); }
          else { fail = 0; await sleep(120); }
        }
        if (i >= 200 && this.hasMore && !this.err) this.err = '历史记录较多，本轮已暂停；可滚动继续加载';
        this.complete();
      } finally { this.fullLoading = false; this.saveSoon(); Bus.emit('history'); }
    })().finally(() => { this.allP = null; });
    return this.allP;
  },
  // 按 id 找：索引表（侧栏每张卡片都要查一次，线性查找 1500 条会话就是 O(n²)）；表过期（数组换了 / 位置对不上）就重建
  byId(id) {
    if (id == null) return undefined;
    const a = this.items; let m = this._ix;
    if (!m || this._ixA !== a || this._ixN !== a.length) { m = this._ix = new Map(); this._ixA = a; this._ixN = a.length; for (let i = a.length - 1; i >= 0; i--) if (a[i]) m.set(a[i].id, i); }
    let i = m.get(id);
    if (i != null && a[i]?.id === id) return a[i];
    if (i != null) { const j = a.findIndex(e => e?.id === id); if (j >= 0) { m.set(id, j); return a[j]; } }
    return typeof ArchiveHistory!=='undefined'?ArchiveHistory.byId(id):undefined;
  },
  // 同一个对话只留一条（保留排在前面的那条）
  dedupe() { const s = new Set(); const n = this.items.length; this.items = this.items.filter(e => e && !s.has(e.id) && s.add(e.id)); return n !== this.items.length; },
  async rename(id, title) {
    const e = this.byId(id), type = e?.type || 'agentic';
    const expected=e?.title;
    const isGoldPfx = typeof TitleCipher !== 'undefined' && typeof TitleCipher.isGoldPrefixed === 'function' && (TitleCipher.isGoldPrefixed(title) || (TitleCipher.isGoldPrefixed(expected) && TitleCipher.stripGoldPrefix(expected) === title));
    if (!isGoldPfx) {
      if(typeof TitleCipher==='undefined'||!TitleCipher.isEncoded(title))throw Error('云端会话名只允许口令加密格式，请在名称同步中设置口令');
      if(title.length!==100||!TitleCipher.isCompact(title))throw Error('新名称必须使用固定 100 字符格式；禁止发送旧长标题');
    }
    const readTitle=async()=>{
      const j=await api('/api/chat/'+encodeURIComponent(id),{noRelogin:true}),direct=j?.title??j?.chat?.title??j?.entry?.title??j?.conversation?.title??j?.data?.title;
      if(typeof direct==='string')return direct;
      // Some chat responses contain messages only. Use the known history endpoint as a bounded fallback,
      // never treat a PATCH echo alone as proof and never crawl all history for each rename.
      const list=await api('/api/history/unified?limit=50&includeArchived='+!!this.byId(id)?.isArchived,{noRelogin:true});
      const inList = Array.isArray(list?.entries)?list.entries.find(row=>row?.id===id)?.title:undefined;
      if(typeof inList==='string')return inList;
      return e?.title;
    };
    if(TitleCipher.isEncoded(expected)){
      const before=await readTitle();
      if(typeof before!=='string')throw Object.assign(Error('无法核对云端名称，暂不覆盖；本地结果已保留'),{status:409});
      if(before!==expected){const current=this.byId(id);if(current)current.title=before;Bus.emit('history');throw Object.assign(Error('云端名称已变化，请解码并处理冲突后重试'),{status:409});}
      if(this.byId(id)?.title!==expected)throw Object.assign(Error('刷新期间名称已变化，请重试'),{status:409});
    }
    const response=await api(`/api/history/${type}/${id}`, { method: 'PATCH', json: { title } });
    const echoed=response?.title ?? response?.entry?.title;
    if(typeof echoed==='string'&&echoed!==title)throw Object.assign(Error('服务器截断或修改了加密标题，未确认同步成功'),{status:422});
    if((!isGoldPfx || echoed !== title) && await readTitle()!==title)throw Object.assign(Error('标题已提交但回读未确认，请重试；保留本地结果'),{status:409});
    // History may have replaced its objects while PATCH was in flight.
    const current=this.byId(id);if(current)current.title=title;
    const c = Chats.get(id); if (c) { c.title = title; c.emit(); }
    this.saveSoon?.();Bus.emit('history');
  },
  _mutSeq: 0,
  protoMutateRoutes(kind, id, opt = {}) {
    const entry = this.byId(id) || (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.byId?.(id)) || null;
    const isEval = Boolean(entry?.type === 'evaluation' || entry?.mode === 'battle' || entry?.mode === 'direct' || (typeof Chats !== 'undefined' && Chats.get?.(id)?.isEvaluation));
    const eid = encodeURIComponent(id);
    const seq = Number.isFinite(opt.seq) ? opt.seq : (this._mutSeq = (this._mutSeq + 1) % 10000);
    if (kind === 'archive') {
      const chatArch = { path: '/api/chat/' + eid + '/archive', method: 'POST' };
      const histAgentArch = { path: '/api/history/agentic/' + eid, method: 'PATCH', body: JSON.stringify({ isArchived: true }) };
      const histEvalArch = { path: '/api/history/evaluation/' + eid, method: 'PATCH', body: JSON.stringify({ isArchived: true }) };
      if (isEval) return [histEvalArch, chatArch, histAgentArch];
      return (seq % 2 === 1) ? [histAgentArch, chatArch, histEvalArch] : [chatArch, histAgentArch, histEvalArch];
    }
    if (kind === 'unarchive') {
      const chatUn = { path: '/api/chat/' + eid + '/unarchive', method: 'POST' };
      const histAgentUn = { path: '/api/history/agentic/' + eid, method: 'PATCH', body: JSON.stringify({ isArchived: false }) };
      const histEvalUn = { path: '/api/history/evaluation/' + eid, method: 'PATCH', body: JSON.stringify({ isArchived: false }) };
      if (isEval) return [histEvalUn, chatUn, histAgentUn];
      return (seq % 2 === 1) ? [histAgentUn, chatUn, histEvalUn] : [chatUn, histAgentUn, histEvalUn];
    }
    const chatDel = { path: '/api/chat/' + eid, method: 'DELETE' };
    const histAgentDel = { path: '/api/history/agentic/' + eid, method: 'DELETE' };
    const histEvalDel = { path: '/api/history/evaluation/' + eid, method: 'DELETE' };
    if (isEval) return [histEvalDel, chatDel, histAgentDel];
    return [chatDel, histAgentDel, histEvalDel];
  },
  async protoMutateResponse(kind, id, opt = {}) {
    const seq = (this._mutSeq = (this._mutSeq + 1) % 10000);
    const routes = this.protoMutateRoutes(kind, id, { ...opt, seq });
    // 1. Primary path: Desktop / Android native protocol channel with multi-route + fresh arena_visit_id + skew rotation + standby ProxyIP tunnel failover
    if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
      try {
        const pRes = await Host.protoFetch(routes[0].path, {
          method: routes[0].method,
          body: routes[0].body,
          bypass429: true,
          routes,
          pipSlot: opt.pipSlot ?? seq,
          timeout: opt.timeout || 18000,
        });
        if (pRes && typeof pRes.status === 'number' && !pRes.fallback) {
          const hdrMap = {
            'content-type': pRes.contentType || 'application/json',
            'retry-after': pRes.retryAfter || '',
            'ratelimit-remaining': pRes.ratelimitRemaining || '',
            'ratelimit-reset': pRes.ratelimitReset || '',
            'ratelimit-limit': pRes.ratelimitLimit || '',
            date: pRes.date || '',
          };
          return {
            ok: Boolean(pRes.ok),
            status: pRes.status,
            text: () => Promise.resolve(String(pRes.text || '')),
            headers: { get: k => hdrMap[String(k || '').toLowerCase()] || null },
            viaPip: pRes.viaPip || '',
          };
        }
      } catch {}
    }
    // 2. Fallback: Multi-route rawFetch with automatic failover on 429 / 404 / 405
    let lastRes = null;
    for (let i = 0; i < routes.length; i++) {
      const step = routes[i];
      try {
        const r = await rawFetch(step.path, {
          method: step.method,
          headers: {
            Accept: 'application/json',
            ...(step.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(step.body !== undefined ? { body: step.body } : {}),
          credentials: 'same-origin',
          cache: 'no-store',
        });
        lastRes = r;
        if (r.ok || r.status === 404 || r.status === 401) return r;
      } catch (e) {
        if (i === routes.length - 1 && !lastRes) throw e;
      }
    }
    return lastRes;
  },
  async protoMutate(kind, id, opt = {}) {
    const r = await this.protoMutateResponse(kind, id, opt);
    if (!r) throw Error('请求未响应');
    if (r.status === 401 && !opt.noRelogin && typeof Auth !== 'undefined' && await Auth.relogin().catch(() => false)) {
      return this.protoMutate(kind, id, { ...opt, noRelogin: true });
    }
    if (!r.ok && r.status !== 404) {
      const txt = typeof r.text === 'function' ? await r.text().catch(() => '') : '';
      throw new HttpError(r.status, txt, r);
    }
    return r;
  },
  async remove(id) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(id))throw Error('该对话在批量指纹队列中，请先停止测试');
    const entry=this.byId(id)||(typeof ArchiveHistory!=='undefined'&&ArchiveHistory.byId?.(id))||null;
    const isEval=Boolean(entry?.type==='evaluation'||entry?.mode==='battle'||entry?.mode==='direct'||Chats.get(id)?.isEvaluation);
    const delUrl = (isEval ? '/api/history/evaluation/' : '/api/chat/') + id;
    const altUrl = (isEval ? '/api/chat/' : '/api/history/evaluation/') + id;
    await this.protoMutate('delete', id, { delUrl, altUrl });
    if (false) await api((isEval ? '/api/history/evaluation/' : '/api/chat/') + id, { method: 'DELETE' });
    try { LocalCache.drop([id]); } catch {}
    this.items = this.items.filter(e => e.id !== id); ArchiveHistory.drop([id]); this.bury([id]); this.saveSoon(); Bus.emit('history'); try { if (typeof AcctStats !== 'undefined') AcctStats.report?.(); } catch {}
  },
  async archive(id) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(id))throw Error('该对话在批量指纹队列中，请先停止测试');
    const entry=this.byId(id);
    await this.protoMutate('archive', id);
    if(entry)ArchiveHistory.add([entry]);
    try { Arch.add?.(id); } catch {}
    try { LocalCache.drop([id], { archived: true }); } catch {}
    this.bury([id]); this.items = this.items.filter(e => e.id !== id); this.saveSoon(); Bus.emit('history'); try { if (typeof AcctStats !== 'undefined') AcctStats.report?.(); } catch {}
  },
  async unarchive(id) {
    const entry = (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.byId?.(id)) || this.byId(id);
    await this.protoMutate('unarchive', id);
    const m = this.goneMap();
    if (m.has(id)) { m.delete(id); Store.set('histgone', Object.fromEntries(m)); }
    if (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.drop) ArchiveHistory.drop([id]);
    if (entry) {
      const restored = { ...entry, isArchived: false, archivedAt: null };
      if (!this.items.some(e => e.id === id)) this.items.unshift(restored);
      this.saveSoon();
    }
    Bus.emit('history');
    return true;
  },
  async pinCloud(id, isPinned) {
    if (!id) return false;
    const entry = this.byId(id), t = entry?.type || 'agentic';
    try {
      await api('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ isPinned: !!isPinned }), bg: true, noRelogin: true });
      if (entry) entry.isPinned = !!isPinned;
      return true;
    } catch { return false; }
  },
  async renamePlain(id, title) {
    const clean = String(title ?? '').trim().slice(0, 100);
    if (!clean) throw Error('会话标题不能为空');
    const entry = this.byId(id), t = entry?.type || 'agentic';
    await api('/api/history/' + t + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ title: clean }), bg: true });
    if (entry) { entry.title = clean; entry.localTitle = clean; }
    const c = Chats.get(id); if (c) c.title = clean;
    this.saveSoon(); Bus.emit('history');
    return true;
  },
};

// ---------- 出口 IP ----------
// 重新渲染不丢滚动位置：弹窗 / 面板 / 排行等界面点一下就整块重建（replaceChildren），新建的滚动容器会回到顶部。
// 这里统一处理：在这些界面里重建前记下所有滚动过的容器（按在界面里的位置），重建后按原位置恢复上下 / 左右滚动。
// data-ks 的值 = 界面的「内容标识」（切换页签 / 对话时改变），变了就不恢复（换了内容应该从顶部开始）
const KS_SEL = '[data-ks], .modal-back, .dlg-back, #lppop, #gpop, .gacha, .lpick';
(() => {
  const nat = Element.prototype.replaceChildren; if (!nat || nat.__ks) return;
  const pathOf = (host, el) => { const p = []; for (let x = el; x !== host; x = x.parentElement) { const par = x.parentElement; if (!par) return null; p.push(Array.prototype.indexOf.call(par.children, x)); } return p.reverse(); };
  const at = (host, p) => { let x = host; for (const i of p) { x = x.children[i]; if (!x) return null; } return x; };
  const c1 = el => el.classList[0] || el.tagName;
  const f = function (...a) {
    const host = this.isConnected ? this.closest(KS_SEL) : null;
    if (!host) return nat.apply(this, a);
    const sig = host.dataset.ks ?? '', same = host._ks === undefined || host._ks === sig; host._ks = sig;
    const saved = [];
    if (same && this.firstElementChild) {
      const scanRoot = this;
      const scan = el => { if (el.scrollTop > 0 || el.scrollLeft > 0) { const p = pathOf(host, el); if (p) saved.push({ p, c: c1(el), t: el.scrollTop, l: el.scrollLeft }); } };
      scan(scanRoot);
      const isScrollContainerHost = scanRoot === host || scanRoot.id === 'dock' || scanRoot.id === 'list' || scanRoot.id === 'view' || scanRoot.classList?.contains('dk-body') || scanRoot.classList?.contains('modal-back') || scanRoot.classList?.contains('dlg-back');
      if (isScrollContainerHost) {
        for (const el of scanRoot.querySelectorAll('.dk-body, .scroller, .list, .ws-tree, .sq-list, .gb-tiers, .mc-bars, [data-custom-scrollbar]')) scan(el);
      }
    }
    const r = nat.apply(this, a);
    for (const s of saved) { const el = at(host, s.p); if (el && c1(el) === s.c) { if (s.t && el.scrollTop !== s.t) el.scrollTop = s.t; if (s.l && el.scrollLeft !== s.l) el.scrollLeft = s.l; } }
    return r;
  };
  f.__ks = true; Element.prototype.replaceChildren = f;
})();
// 送达状态每秒刷新一次（只改回复占位里的一行文字）
setInterval(() => { const el = document.querySelector('#view .typing-st'); if (!el) return; const row = el.closest?.('.typing-row'); const pht = row?.querySelector?.('.ph-t'); if (pht) { if (el.textContent !== '') el.textContent = ''; const c = typeof UI !== 'undefined' ? UI.els?.chat : null; if (c && !c.live) { const dlvRaw = (c.dlvText?.() || '').replace(/\s+\d+s$/, '').trim(); const rawP = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.phase) ? ThinkingStatus.phase(c) : (c.phase || '进行中'); const nextP = (!rawP || rawP === '发送中' || rawP === '进行中') && dlvRaw ? dlvRaw : rawP; if (nextP && pht.textContent !== nextP) pht.textContent = nextP; } return; } const c = typeof UI !== 'undefined' ? UI.els?.chat : null; const t = c?.dlvText?.() || ''; if (el.textContent !== t) el.textContent = t; }, 1000);
// 手机输入法占位：切换页面时焦点临时交给它，输入法不收起；换完页面还在它身上（比如切到抽卡页）就松开
const KB = {
  el: null,
  hold() {
    let e = this.el; if (!e || !e.isConnected) { e = this.el = document.createElement('textarea'); e.id = 'kbhold'; e.tabIndex = -1; e.setAttribute('aria-hidden', 'true'); document.body.append(e); }
    try { e.focus({ preventScroll: true }); } catch { e.focus(); }
    setTimeout(() => { if (document.activeElement === e) e.blur(); }, 0);
  },
};
const IP = {
  ip: null, loc: null, at: 0, checkedAt: 0, failures: 0, err: null, prev: null, fast: false, polling: null,
  poll() { return this.polling ||= this.poll1().finally(() => { this.polling = null; }); },
  // 当前连接的实时延迟：经账号线路请求一次 /cdn-cgi/trace（几百字节），与出口检测复用采样，避免重复请求消耗 EdgeTunnel 配额
  rtt: 0, rttAt: 0, rttFail: 0, pinging: null,
  recordRtt(v) {
    const ms = Math.max(1, Math.round(v)), key = String(typeof UI !== 'undefined' && UI?.host?.account?.proxy || '') + '|' + String(typeof UI !== 'undefined' && UI?.host?.account?.proxyIp || '');
    if (this.rkey !== key) { this.rkey = key; this.samples = []; }
    this.samples = [...(this.samples || []).filter(x => now() - x.at < 180000), { v: ms, at: now() }].slice(-5);
    const sorted = this.samples.map(x => x.v).sort((x, y) => x - y);
    this.rtt = sorted[Math.floor((sorted.length - 1) / 2)]; this.rttLast = ms; this.rttFail = 0; this.rttAt = now();
    this.reconcile(); if (typeof Bus !== 'undefined') Bus.emit('rtt');
  },
  ping(force = false) {
    if (!force && this.rtt > 0 && !this.rttFail && now() - this.rttAt < 25000) { if (typeof Bus !== 'undefined') Bus.emit('rtt'); return Promise.resolve(); }
    if (this.polling) return this.polling;
    const clk = () => typeof performance !== 'undefined' && performance.now ? performance.now() : now();
    return this.pinging ||= (async () => {
      const t0 = clk();
      try {
        const t = await NetPolicy.deadline(async signal => { const r = await rawFetch('/cdn-cgi/trace', { cache: 'no-store', signal }); return r.ok ? r.text() : ''; }, { timeout: 6000 });
        this.recordRtt(clk() - t0);
        if (t) {
          const kv = Object.fromEntries(t.trim().split('\n').map(l => l.split('=')));
          if (kv.ip && /^[0-9a-f:.]+$/i.test(kv.ip)) {
            if (this.ip && kv.ip !== this.ip) { this.prev = this.ip; this.changedAt = now(); setTimeout(() => { if (typeof Bus !== 'undefined') Bus.emit('ipchange', kv.ip, this.prev); if (typeof Acct !== 'undefined') Acct.report(); }, 0); }
            const first = !this.ip; this.ip = kv.ip; this.loc = kv.loc; this.colo = kv.colo; this.err = null; this.failures = 0; this.at = now(); this.checkedAt = now();
            if (first && typeof Acct !== 'undefined') Acct.report();
            if (typeof Bus !== 'undefined') Bus.emit('ip');
          }
        }
      } catch { this.rtt = 0; this.rttFail++; this.rttAt = now(); if (typeof Bus !== 'undefined') Bus.emit('rtt'); }
    })().finally(() => { this.pinging = null; });
  },
  // 实时延迟只在「当前这条线路」上测：它通，就是当前 ProxyIP 真的能用。
  // 池里这个 IP 的「不通 / 待检测」来自以前某次单独检测（独立的临时连接、有超时、会被 Brana 的验证页拦），不会自动更新，
  // 于是列表写「不通」、右下角却有延迟。实时测通了就把池里的状态一起更新，避免两边互相矛盾。
  liveFor(k) {
    const a = UI.host?.account, same = x => String(x || '').trim().toLowerCase();
    return a?.proxyIp && same(a.proxyIp) === same(k) && this.rtt > 0 && now() - this.rttAt < 30000 ? this.rtt : 0;
  },
  reconcile() {
    try {
      const k = String(UI.host?.account?.proxyIp || '').trim(), P = typeof Pool !== 'undefined' ? Pool : null, e = P?.d?.ips?.[k];
      if (!e || e.gone || !this.rtt || this.rttFail) return;
      const rtt = this.rtt, eg = this.ip || '';
      const egChanged = Boolean(eg && /^[0-9a-f:.]+$/i.test(eg) && e.eg !== eg);
      if (e.ok === true && !egChanged) return;
      void P.mutate(d => {
        const x = d.ips[k]; if (!x) return;
        x.ok = true; x.ms = rtt; x.at = now(); x.err = ''; x.fc = 0;
        if (eg && /^[0-9a-f:.]+$/i.test(eg)) x.eg = eg;
      }).then(() => {
        if (egChanged && typeof IPRep !== 'undefined') {
          try { IPRep.invalidate?.(k); IPRep.curEval?.(eg); } catch {}
        }
      }).catch(() => {});
    } catch {}
  },
  // 延迟探测失败但对话请求一直正常（45 秒内有成功）：不显示「超时」——探测本身被挤占，不是线路不通
  quietFail() { return !!this.rttFail && typeof NetHealth !== 'undefined' && NetHealth.recent(); },
  rttCls() { return this.rtt ? (this.rtt < 300 ? 'd-good' : this.rtt < 800 ? 'd-mid' : 'd-bad') : this.rttFail && !this.quietFail() ? 'd-fail' : ''; },
  rttText() { return this.rtt ? this.rtt + ' ms' : this.rttFail && !this.quietFail() ? '超时' : ''; },
  rttTip() { const xs = (this.samples || []).map(x => x.v); return xs.length ? '最近 ' + xs.length + ' 次：' + xs.join(' / ') + ' ms（显示中位数）' : ''; },
  async poll1() {
    const clk = () => typeof performance !== 'undefined' && performance.now ? performance.now() : now();
    const t0 = clk();
    try {
      // A trace failure is not a failed chat connection. Bound the whole read.
      const t = await NetPolicy.deadline(async signal => {
        const r = await rawFetch('/cdn-cgi/trace', { cache: 'no-store', signal });
        if (!r.ok) throw new HttpError(r.status, '出口检测失败');
        return r.text();
      }, { timeout: 12000 });
      const kv = Object.fromEntries(t.trim().split('\n').map(l => l.split('=')));
      if (!kv.ip || !/^[0-9a-f:.]+$/i.test(kv.ip)) throw new Error('出口检测未返回有效 IP');
      if (this.ip && kv.ip !== this.ip) { this.prev = this.ip; this.changedAt = now(); setTimeout(() => { Bus.emit('ipchange', kv.ip, this.prev); Acct.report(); }, 0); }
      const first = !this.ip; this.ip = kv.ip; this.loc = kv.loc; this.colo = kv.colo; this.err = null; this.failures = 0; this.at = now();
      this.recordRtt(clk() - t0);
      if (first) Acct.report();
    } catch (e) { this.err = describe(e); this.failures++; }
    finally { this.checkedAt = now(); }
    Bus.emit('ip');
  },
};

function describe(e) {
  if (!e) return '';
  if (e instanceof HttpError) {
    const b = String(e.body || '');
    if (e.status === 403 && /recaptcha/i.test(b)) return '人机验证未通过（reCAPTCHA）';
    if (e.status === 429) return '请求过于频繁（429）' + (b && !/^\s*[{<]/.test(b) ? '：' + b.slice(0, 120) : '');
    if (e.status === 401) return '未登录或登录已过期（401）';
    return `HTTP ${e.status}${b ? ' · ' + b.slice(0, 160) : ''}`;
  }
  return e.message || String(e);
}


// ---------- Chrome 扩展同构兼容层（让基于官网浏览器开发的 Chrome 扩展无需修改即可在客户端模式运行） ----------
const ExtCompat = {
  replayed: new Map(),
  syncUrl(sid) {
    try {
      const valid = typeof sid === 'string' && /^[0-9a-f-]{36}$/i.test(sid) ? sid : '';
      if (typeof document !== 'undefined' && document.documentElement) {
        if (valid) document.documentElement.dataset.mcpActiveSid = valid;
        else delete document.documentElement.dataset.mcpActiveSid;
      }
      if (typeof location !== 'undefined' && typeof history !== 'undefined' && location.pathname !== '/robots.txt' && /^\/(?:agent|c|chat)\//i.test(location.pathname)) {
        try { history.replaceState(null, '', '/robots.txt'); } catch {}
      }
      if (valid) {
        const tNow = now();
        if (this._lastSyncSid !== valid || (tNow - (this._lastSyncAt || 0) > 6000)) {
          this._lastSyncSid = valid;
          this._lastSyncAt = tNow;
          try { window.dispatchEvent(new CustomEvent('mcp-request-quota-infer', { detail: { sid: valid, sessionId: valid } })); } catch {}
        }
        const chat = typeof Chats !== 'undefined' ? Chats.get(valid) : null;
        if (chat && chat.loaded) this.replayChat(chat);
      }
    } catch {}
  },
  hasActiveExt() {
    const t = Date.now();
    if (this._extCheckAt && t - this._extCheckAt < 30000) return Boolean(this._hasExtCached);
    this._extCheckAt = t;
    if (typeof Host !== 'undefined' && typeof Host.extList === 'function' && !this._extChecking) {
      this._extChecking = true;
      Promise.resolve(Host.extList()).then(list => {
        this._hasExtCached = Array.isArray(list) && list.some(x => x && x.enabled !== false);
      }).catch(() => {}).finally(() => { this._extChecking = false; });
    }
    return Boolean(this._hasExtCached);
  },
  replayChat(chat, force = false) {
    try {
      if (!chat || !chat.sid || !Array.isArray(chat.messages) || !chat.messages.length) return;
      const sid = String(chat.sid).toLowerCase();
      const assistants = chat.messages.filter(m => m && m.role === 'assistant' && !m.metadata?.pending);
      if (!assistants.length) return;
      const sig = assistants.map(m => (m.id || '') + ':' + (m.parts?.length || 0)).join('|');
      if (!force && this.replayed.get(sid) === sig) return;
      this.replayed.set(sid, sig);

      const needExtRecords = this.hasActiveExt();
      const records = [];
      const toolIds = [];
      let sawReasoning = false, reasoningDeltaCount = 0, reasoningTextLength = 0;
      let textDeltaCount = 0, textDeltaChars = 0, bashToolCount = 0, preToolTextChars = 0, interToolTextChars = 0;
      let seq = 1;
      const MAX_REPLAY_RECORDS = needExtRecords ? 240 : 0;
      for (const m of assistants) {
        let seenToolInTurn = false, pendingInterText = 0;
        const ts = m.metadata?.timing?.completedAt || m.metadata?.timing?.startedAt || Date.now();
        if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'start', messageId: m.id } }) });
        for (const p of m.parts || []) {
          if (!p || !p.type) continue;
          if (p.type === 'reasoning') {
            sawReasoning = true;
            if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'reasoning-start', id: p.id || 'r' + seq } }) });
            const rtxt = String(p.text || '');
            if (rtxt) {
              reasoningDeltaCount++;
              reasoningTextLength += rtxt.length;
              if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'reasoning-delta', delta: rtxt.length > 2048 ? rtxt.slice(0, 2048) : rtxt } }) });
            }
          } else if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') {
            if (seenToolInTurn) { interToolTextChars += pendingInterText; pendingInterText = 0; }
            seenToolInTurn = true;
            const tid = p.toolCallId || p.id || '';
            if (tid && !toolIds.includes(tid)) toolIds.push(tid);
            const tName = p.toolName || String(p.type).replace(/^tool-/, '');
            if (/bash|shell|run_command/i.test(tName)) bashToolCount++;
            if (records.length < MAX_REPLAY_RECORDS) {
              const rawIn = p.input ?? p.inputText ?? {};
              const liteIn = typeof rawIn === 'string'
                ? (rawIn.length > 512 ? rawIn.slice(0, 512) : rawIn)
                : (rawIn && typeof rawIn === 'object' ? { command: typeof rawIn.command === 'string' ? rawIn.command.slice(0, 256) : undefined, path: rawIn.path || rawIn.file_path } : {});
              records.push({
                seq_num: seq++,
                timestamp: ts,
                body: JSON.stringify({
                  data: {
                    type: 'tool-input-start',
                    toolCallId: tid,
                    toolName: tName,
                    input: liteIn
                  }
                })
              });
            }
          } else if (p.type === 'text' && p.text) {
            const txt = String(p.text);
            textDeltaCount++;
            textDeltaChars += txt.length;
            const trimmed = txt.trim().length;
            if (!seenToolInTurn) preToolTextChars += trimmed;
            else pendingInterText += trimmed;
            if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, body: JSON.stringify({ data: { type: 'text-delta', delta: txt.length > 2048 ? txt.slice(0, 2048) : txt } }) });
          }
        }
        if (records.length < MAX_REPLAY_RECORDS) records.push({ seq_num: seq++, timestamp: ts, headers: [['trigger-control', 'turn-complete']], body: JSON.stringify({ data: { type: 'finish', messageId: m.id } }) });
      }

      let prevMemo = (window.__atiSseMemo instanceof Map ? window.__atiSseMemo.get(sid) : window.__atiSseMemo?.[sid]) || null;
      if (!prevMemo) { try { prevMemo = JSON.parse(localStorage.getItem('ati.v4.sseMemo.' + sid) || 'null'); } catch {} }
      const msgFmts = assistants.map(m => m?._fmt).filter(Boolean);
      const fmt = chat.fmt || msgFmts.at(-1) || null;
      let fmtTN = 0, fmtTChars = 0, fmtRN = 0, fmtRE = 0, fmtRChars = 0;
      const fmtIds = [];
      for (const fObj of (chat.fmt && !msgFmts.includes(chat.fmt) ? [...msgFmts, chat.fmt] : msgFmts)) {
        fmtTN += Number(fObj?.tN) || 0;
        fmtTChars += Number(fObj?.tChars) || 0;
        fmtRN += Number(fObj?.rN) || 0;
        fmtRE += Number(fObj?.rE || fObj?.rBlocks) || 0;
        fmtRChars += Number(fObj?.rChars) || 0;
        if (Array.isArray(fObj?.ids)) {
          for (const pair of fObj.ids) {
            const idStr = String((pair && pair[1]) || '');
            if (idStr && !fmtIds.includes(idStr)) fmtIds.push(idStr);
          }
        }
      }
      const isPollutedPrevMemo = Boolean(
        prevMemo &&
        Number(prevMemo.textDeltaCount) > 0 &&
        Number(prevMemo.textDeltaCount) <= Math.max(2, assistants.length * 2) &&
        Number(prevMemo.avgChunk) > 220 &&
        (fmtTN === 0 || fmtTN > Number(prevMemo.textDeltaCount))
      );
      const prevValidDeltaCount = isPollutedPrevMemo ? 0 : (Number(prevMemo?.textDeltaCount) || 0);
      const prevValidDeltaChars = isPollutedPrevMemo ? 0 : (Number(prevMemo?.textDeltaChars) || 0);
      const prevValidAvgChunk = isPollutedPrevMemo ? null : (Number(prevMemo?.avgChunk) || null);
      const effDeltaCount = Math.max(fmtTN, prevValidDeltaCount);
      const effDeltaChars = fmtTN > 0 ? Math.max(fmtTChars, prevValidDeltaChars) : Math.max(prevValidDeltaChars, textDeltaChars);
      const streamIds = (Array.isArray(prevMemo?.streamIds) && prevMemo.streamIds.length) ? prevMemo.streamIds : fmtIds;
      const rawT0 = Number(fmt?.t0 || fmt?.tStart) || 0;
      const rawTEnd = Number(fmt?.tEnd) || 0;
      const hasValidFmtSpan = rawT0 > 0 && rawTEnd > rawT0 && (rawTEnd - rawT0) < 3600000;
      const hasValidPrevSpan = Number(prevMemo?.firstDeltaAt) > 0 && Number(prevMemo?.lastDeltaAt) >= Number(prevMemo?.firstDeltaAt) && (Number(prevMemo.lastDeltaAt) - Number(prevMemo.firstDeltaAt)) < 3600000;
      const tStart = hasValidFmtSpan ? rawT0 : (hasValidPrevSpan ? Number(prevMemo.firstDeltaAt) : 0);
      const tEndEff = hasValidFmtSpan ? rawTEnd : (hasValidPrevSpan ? Number(prevMemo.lastDeltaAt) : 0);
      const durSec = hasValidFmtSpan ? (rawTEnd - rawT0) / 1000 : ((fmt?.gen > 0 && fmt.gen < 3600000) ? fmt.gen / 1000 : (hasValidPrevSpan ? (tEndEff - tStart) / 1000 : 0));
      const liveCps = (durSec >= 0.5 && durSec < 3600 && (fmtTChars || fmt?.tChars || textDeltaChars) >= 60) ? Math.round((fmtTChars || fmt?.tChars || textDeltaChars) / durSec) : (prevMemo?.cps || null);
      const effSawReason = Boolean(sawReasoning || prevMemo?.sawReasoning || fmtRN > 0 || fmtRE > 0 || (fmt && (fmt.rBlocks || fmt.rN || fmt.rE)));
      const effReasonChars = Math.max(reasoningTextLength, Number(prevMemo?.reasoningTextLength) || 0, fmtRChars, Number(fmt?.rChars) || 0);
      const curAvgChunk = (fmtTN >= 3 && fmtTChars > 0)
        ? +(fmtTChars / fmtTN).toFixed(2)
        : (prevValidAvgChunk || (effDeltaCount >= 6 && effDeltaChars > 0 ? +(effDeltaChars / effDeltaCount).toFixed(2) : null));
      let streamIdPrefix = (prevMemo?.streamIdPrefix === 'openai-tc-empty' && (Number(curAvgChunk) || 0) >= 4.0 && (Number(curAvgChunk) || 0) < 15.0) ? 'claude-tc-empty' : (prevMemo?.streamIdPrefix || null);
      if (!streamIdPrefix && streamIds.length) {
        if (streamIds.some(i => /^(?:msg|rs)_[0-9a-f]{16,}/i.test(i))) streamIdPrefix = 'openai-rs';
        else if (streamIds.some(i => /^tc_[A-Za-z0-9_-]{10,}$/.test(i)) && effReasonChars === 0 && effSawReason) {
          streamIdPrefix = ((Number(curAvgChunk) || 0) > 0 && (Number(curAvgChunk) || 0) <= 3.8) ? 'openai-tc-empty' : ((Number(curAvgChunk) || 0) >= 4.0 && (Number(curAvgChunk) || 0) < 15.0 ? 'claude-tc-empty' : null);
        }
      }
      const effReasonDeltas = Math.max(reasoningDeltaCount, Number(prevMemo?.reasoningDeltaCount) || 0, fmtRN, fmtRE);
      const memo = {
        sid,
        toolIds: toolIds.length ? toolIds : (prevMemo?.toolIds || []),
        streamIds,
        textDeltaCount: effDeltaCount,
        textDeltaChars: effDeltaChars,
        firstDeltaAt: tStart || Date.now() - 1000,
        lastDeltaAt: tEndEff || (tStart ? tStart + 1000 : Date.now()),
        sawReasoning: effSawReason,
        reasoningDeltaCount: effReasonDeltas,
        reasoningTextLength: effReasonChars,
        bashToolCount: Math.max(bashToolCount, Number(prevMemo?.bashToolCount) || 0),
        preToolTextChars,
        interToolTextChars,
        seenToolInTurn: (toolIds.length || prevMemo?.toolIds?.length) > 0,
        pendingInterText: 0,
        avgChunk: (fmtTN >= 3 && fmtTChars > 0) ? +(fmtTChars / fmtTN).toFixed(2) : (!isPollutedPrevMemo ? (prev.avgChunk || 0) : 0),
        cps: liveCps,
        silentBashLoop: bashToolCount >= 2 && preToolTextChars === 0 && interToolTextChars === 0,
        reasoningSignature: (!effSawReason ? 'none' : (effReasonChars > 0 ? 'visible-text' : ((streamIdPrefix === 'claude-tc-empty' || ((Number(curAvgChunk) || 0) >= 4.0 && (Number(curAvgChunk) || 0) <= 25.0) || effReasonDeltas > 0) ? 'empty-deltas' : 'markers-only'))),
        streamIdPrefix,
        updatedAt: Date.now()
      };
      if (window.__atiSseMemo instanceof Map) {
        if (window.__atiSseMemo.has(sid)) window.__atiSseMemo.delete(sid);
        else if (window.__atiSseMemo.size >= 60) window.__atiSseMemo.delete(window.__atiSseMemo.keys().next().value);
        window.__atiSseMemo.set(sid, memo);
      }
      try {
        const memoSig = `${memo.sawReasoning ? 1 : 0}:${memo.reasoningDeltaCount}:${memo.reasoningTextLength}:${memo.bashToolCount}:${memo.preToolTextChars}:${memo.interToolTextChars}:${memo.avgChunk}:${memo.cps}:${memo.streamIdPrefix}:${memo.toolIds?.length || 0}`;
        const sigMap = this._memoPersistSig ||= new Map();
        if (sigMap.get(sid) !== memoSig) {
          sigMap.set(sid, memoSig);
          const lru = this._memoLru || (this._memoLru = []);
          const idx = lru.indexOf(sid);
          if (idx >= 0) lru.splice(idx, 1);
          lru.push(sid);
          while (lru.length > 30) {
            const oldSid = lru.shift();
            if (oldSid) { sigMap.delete(oldSid); try { localStorage.removeItem('ati.v4.sseMemo.' + oldSid); } catch {} }
          }
          localStorage.setItem('ati.v4.sseMemo.' + sid, JSON.stringify(memo));
        }
      } catch {}

      if (!needExtRecords) return;
      const isFgChat = Boolean(
        (typeof Tabs !== 'undefined' && Tabs.cur?.sid === chat.sid) ||
        (typeof UI !== 'undefined' && UI.els?.chat === chat)
      );
      if (!isFgChat && !force) return;

      const sseBody = 'data: ' + JSON.stringify({ records }) + '\n\ndata: [DONE]\n\n';
      const outUrl = `${ORIGIN}/ai-proxy/realtime/v1/sessions/${sid}/out`;
      const payload = {
        url: outUrl,
        pageHost: (typeof location !== 'undefined' && location.hostname) || 'arena.ai',
        pageUrl: `${ORIGIN}/c/${sid}`,
        method: 'GET',
        status: 200,
        statusText: 'OK',
        durationMs: 12,
        requestHeaders: { accept: 'text/event-stream' },
        responseHeaders: { 'content-type': 'text/event-stream' },
        originProbe: { contentType: 'text/event-stream' },
        requestBody: null,
        responseBody: sseBody.slice(0, 512 * 1024),
        ts: Date.now(),
        via: 'fetch'
      };
      try {
        const liteMsgs = chat.messages.slice(-30).map(m => !m ? m : ({
          id: m.id,
          role: m.role,
          metadata: m.metadata,
          parts: (m.parts || []).slice(0, 40).map(p => !p ? p : ({
            type: p.type,
            id: p.id,
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            state: p.state,
            text: typeof p.text === 'string' && p.text.length > 2048 ? p.text.slice(0, 2048) : p.text
          }))
        }));
        window.__next_f = [[1, '1:' + JSON.stringify({ chatId: sid, id: sid, messages: liteMsgs, pagination: { hasMore: !!chat.hasMore, cursor: chat.cursor || null } }) + '\n']];
      } catch {}
      window.postMessage({ __arenaDetector: 'ARENA_DETECTOR_V2_CAPTURE', payload }, '*');
      setTimeout(() => { try { window.__arenaBashTranslate?.scan?.(); } catch {} }, 60);
    } catch {}
  }
};
try {
  window.addEventListener('mcp-gacha-cmd', ev => {
    const d = ev?.detail || {};
    if (d.action === 'open' && d.sid && typeof Tabs !== 'undefined') { Tabs.open(d.sid); return; }
    if (typeof Gacha === 'undefined') return;
    if (d.action === 'stop') { Gacha.stop(); return; }
    if (d.action === 'start') {
      if (d.maxRolls) Gacha.save({ maxAttempts: [5, 15, 30].includes(+d.maxRolls) ? +d.maxRolls : 5, archiveOn: d.autoArchive !== false, stopOnThinking: d.abortPlain !== false });
      const r = Gacha.start();
      if (!r?.ok) window.dispatchEvent(new CustomEvent('mcp-gacha-state', { detail: { busy: false, status: r?.error || '启动失败' } }));
    }
  });
  let _gachaLiveLastAt = 0, _gachaLiveTimer = 0;
  const _flushGachaLiveState = () => {
    _gachaLiveTimer = 0;
    _gachaLiveLastAt = Date.now();
    try {
      if (typeof Gacha === 'undefined') return;
      const run = Gacha.run, busy = Gacha.busy();
      if (run && Array.isArray(run.attempts)) {
        const rows = run.attempts.slice(-12).reverse().map(a => ({
          sid: a.sid || '',
          model: a.model || (a.done ? '未识别' : '识别中…'),
          status: a.verdict === 'hit' ? '🎯 命中' : a.verdict === 'archive' ? '已归档' : a.verdict === 'keep' ? '保留' : (a.phase || ''),
          fitScore: Models.get(a.sid || '')?.confidence != null ? Math.round(Models.get(a.sid || '').confidence) : null
        }));
        localStorage.setItem('mcpLive.gacha.v1', JSON.stringify(rows));
      }
      window.dispatchEvent(new CustomEvent('mcp-gacha-state', {
        detail: {
          busy,
          attempt: (run?.completed || 0) + (busy ? 1 : 0),
          maxRolls: run?.settings?.maxAttempts || 5,
          status: run?.phase || run?.reason || (busy ? '抽卡进行中…' : '已就绪')
        }
      }));
    } catch {}
  };
  Bus.on('gacha', () => {
    try {
      if (typeof Gacha !== 'undefined' && Gacha.busy()) {
        const elapsed = Date.now() - _gachaLiveLastAt;
        if (elapsed < 220) {
          if (!_gachaLiveTimer) _gachaLiveTimer = setTimeout(_flushGachaLiveState, 220 - elapsed);
          return;
        }
      }
      if (_gachaLiveTimer) { clearTimeout(_gachaLiveTimer); _gachaLiveTimer = 0; }
      _flushGachaLiveState();
    } catch {}
  });
} catch {}
window.__ancExtCompat = ExtCompat;
try {
  window.addEventListener('mcp-quota-inferred', e => {
    const d = e?.detail;
    if (!d || !d.sid || !d.model) return;
    const conf = Number(d.confidence ?? d.fitScore ?? 0);
    if (conf < 75) return;
    const ch = typeof Chats !== 'undefined' ? Chats.get(d.sid) : null;
    if (typeof BillingProbe !== 'undefined' && ch) {
      const bpCands = BillingProbe.summary?.(d.sid)?.diagnostics?.candidates;
      if (Array.isArray(bpCands) && bpCands.length) {
        BillingProbe.applyReverseIdentity?.(ch, { interactive: false });
        return;
      }
    }
    const rawLabel = d.displayName || d.label || d.model;
    const canonName = (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawLabel) : rawLabel;
    // 出现开源思考时直接排除闭源型号（防止扩展投机流或旧结果把开源模型改成闭源模型）
    if (ch && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(ch)?.kind === 'compat-thinking') {
      const vid = (typeof Brand !== 'undefined' && Brand.of) ? Brand.of(canonName || rawLabel || d.model) : '';
      if (['claude', 'openai', 'gemini', 'grok'].includes(vid) || /claude|opus|sonnet|haiku|fable|gpt-|o3|o4|gemini|argon|barium|grok/i.test(String(canonName + ' ' + rawLabel + ' ' + d.model))) {
        return;
      }
    }
    const old = Models.get(d.sid);
    if (old && (old.userCorrected || (!old.guess && !old.fromTitle && !old.reverseInferred && !old.habitInferred && !old.billingProbe && (old.response || (old.internal && !old.billingProbe) || old.fingerprint?.apiIdentity)))) return;
    const pend = Boolean(d.pendingConfirm || (d.tiedCount && d.tiedCount > 1) || conf < 88);
    Models.set(d.sid, {
      ...(old || {}),
      name: pend ? '' : canonName,
      candidateName: canonName,
      rawLabel,
      reverseCandidateId: d.id || d.model,
      internal: pend ? '' : d.model,
      provider: pend ? '费用反推识别（请继续沟通）' : '费用反推识别',
      why: pend ? '候选模型权重接近，请继续沟通以锁定唯一模型' : ('由第一方 /cost 账单 5 层漏斗反推锁定（吻合度 ' + conf.toFixed(1) + '%）'),
      sure: !pend && conf >= 95,
      guess: pend,
      pendingConfirm: pend,
      fromTitle: false,
      reverseInferred: true,
      billingProbe: true,
      reverseMatch: conf,
      confidence: conf
    });
    if (!pend && typeof Titles !== 'undefined' && Titles.touch) {
      try { Titles.touch(d.sid); Titles.kick(true); } catch {}
    } else {
      try { UI.renderListSoon?.(); UI.renderTabs?.(); } catch {}
    }
    try { Chats.get(d.sid)?.emit?.(); Dock.soon?.(); } catch {}
  });
} catch {}


// 向心弹出定位：根据触发锚点在窗口所处象限（左下→右上、左上→右下、右下→左上、右上→左下）向窗口中心方向弹出，并严格限制在窗口可视边界内
function placeInward(pop, anchorOrRect, opts = {}) {
  if (!pop) return;
  const pad = opts.pad ?? 8, gap = opts.gap ?? 6;
  const vw = Math.max(200, window.innerWidth || document.documentElement.clientWidth || 800);
  const vh = Math.max(160, window.innerHeight || document.documentElement.clientHeight || 600);
  const r = anchorOrRect?.getBoundingClientRect ? anchorOrRect.getBoundingClientRect()
    : (anchorOrRect && typeof anchorOrRect.left === 'number' ? {
        left: anchorOrRect.left,
        top: anchorOrRect.top ?? anchorOrRect.bottom ?? 0,
        right: anchorOrRect.right ?? anchorOrRect.left,
        bottom: anchorOrRect.bottom ?? anchorOrRect.top ?? 0,
        width: anchorOrRect.width ?? 0,
        height: anchorOrRect.height ?? 0,
      } : { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2, width: 0, height: 0 });
  const ax = (r.left + (r.right ?? r.left)) / 2;
  const ay = (r.top + (r.bottom ?? r.top)) / 2;
  const isLeft = opts.preferX ? opts.preferX === 'right' : ax <= vw / 2;
  const isTop = opts.preferY ? opts.preferY === 'down' : ay <= vh / 2;
  const maxW = Math.max(140, vw - pad * 2);
  if (!opts.keepWidth) pop.style.maxWidth = maxW + 'px';
  const rect = pop.getBoundingClientRect();
  const w = Math.min(maxW, Math.ceil(rect.width || pop.offsetWidth || opts.fallbackW || 220));
  let left = isLeft ? r.left : ((r.right ?? r.left) - w);
  left = Math.max(pad, Math.min(left, vw - w - pad));
  pop.style.left = Math.round(left) + 'px';
  pop.style.right = 'auto';
  const availBelow = Math.max(80, vh - (r.bottom ?? r.top) - gap - pad);
  const availAbove = Math.max(80, (r.top ?? 0) - gap - pad);
  const openDown = isTop ? (availBelow >= Math.min(160, availAbove) || availBelow >= (rect.height || 180)) : (availAbove < 120 && availBelow > availAbove);
  if (!opts.keepHeight) {
    const mh = Math.max(120, openDown ? availBelow : availAbove);
    pop.style.maxHeight = Math.min(vh - pad * 2, Math.max(mh, Math.min(320, vh - pad * 2))) + 'px';
  }
  const hNow = Math.min(vh - pad * 2, Math.ceil(pop.getBoundingClientRect().height || pop.offsetHeight || opts.fallbackH || 180));
  if (opts.useBottom && !openDown) {
    const bot = Math.max(pad, Math.min(vh - (r.top ?? 0) + gap, vh - hNow - pad));
    pop.style.bottom = Math.round(bot) + 'px';
    pop.style.top = 'auto';
  } else {
    let top = openDown ? ((r.bottom ?? r.top) + gap) : ((r.top ?? 0) - hNow - gap);
    top = Math.max(pad, Math.min(top, vh - hNow - pad));
    pop.style.top = Math.round(top) + 'px';
    pop.style.bottom = 'auto';
  }
  pop.style.transformOrigin = (openDown ? 'top ' : 'bottom ') + (isLeft ? 'left' : 'right');
}
globalThis.placeInward = placeInward;


// ---------- 正在运行对话持久化追踪与完成圆点提醒 ----------
const RunningTracker = {
  RUN_KEY: 'runningChats:v1',
  UNREAD_KEY: 'doneUnreadChats:v1',
  MAX_AGE_MS: 6 * 3600 * 1000,
  _boundUnload: false,
  _resuming: false,

  _loadRunMap() {
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(this.RUN_KEY, {}) : {};
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const tNow = now();
      let dirty = false;
      const out = {};
      for (const [sid, info] of Object.entries(raw)) {
        if (!sid || !info || typeof info !== 'object') { dirty = true; continue; }
        if (tNow - (info.updatedAt || info.startedAt || 0) > this.MAX_AGE_MS) { dirty = true; continue; }
        out[sid] = info;
      }
      if (dirty && typeof Store !== 'undefined' && Store.set) Store.set(this.RUN_KEY, out);
      return out;
    } catch { return {}; }
  },

  _saveRunMap(map) {
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set(this.RUN_KEY, map || {});
    } catch {}
  },

  _loadUnreadMap() {
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(this.UNREAD_KEY, {}) : {};
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return { ...raw };
    } catch { return {}; }
  },

  _saveUnreadMap(map) {
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set(this.UNREAD_KEY, map || {});
    } catch {}
  },

  isCurrentlyViewed(sid) {
    if (!sid) return false;
    try {
      const isCurTab = typeof Tabs !== 'undefined' && Tabs.cur && !Tabs.cur.kind && Tabs.cur.sid === sid;
      const isFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      const isVisible = typeof document !== 'undefined' ? !document.hidden : true;
      return Boolean(isCurTab && isVisible && isFocused);
    } catch { return false; }
  },

  isChatActivelyGenerating(c) {
    if (!c || !c.sid || c.gacha) return false;
    const isTransientSyncOnly = Boolean(!c.live && !c.awaitId && !c.preSend && !c.sending && (c.phase === '增量同步' || c.phase === '正在同步进行中任务…'));
    if (isTransientSyncOnly) return false;
    return Boolean(
      c.busy ||
      (c.streaming && !c.peeking) ||
      c._evalStreaming ||
      c.cloudRunning ||
      c.midTurnStall ||
      c.fakeEnd ||
      c._ka?.plan ||
      (c.isEvaluation && Array.isArray(c.messages) && c.messages.some(m => m && m.role === 'assistant' && (m.metadata?.pending || m.status === 'pending' || m.status === 'streaming')))
    );
  },

  isChatRunning(c) {
    return this.isChatActivelyGenerating(c);
  },

  isTrackedRunning(sid) {
    if (!sid) return false;
    const rMap = this._loadRunMap();
    if (!rMap[sid]) return false;
    try {
      const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      if (c && c.loaded && !c.cached && !c.loading && !c._startupResuming && !this.isChatActivelyGenerating(c)) {
        delete rMap[sid];
        this._saveRunMap(rMap);
        c._wasTrackedRunning = false;
        return false;
      }
    } catch {}
    return true;
  },

  isUnread(sid) {
    if (!sid) return false;
    const uMap = this._loadUnreadMap();
    return Boolean(uMap[sid]);
  },

  markUnread(sid) {
    if (!sid) return;
    const uMap = this._loadUnreadMap();
    if (!uMap[sid]) {
      uMap[sid] = { sid, at: now() };
      this._saveUnreadMap(uMap);
      try { if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); } } catch {}
    }
  },

  markViewed(sid) {
    if (!sid) return;
    const uMap = this._loadUnreadMap();
    if (uMap[sid]) {
      delete uMap[sid];
      this._saveUnreadMap(uMap);
      try {
        if (typeof document !== 'undefined') {
          document.querySelectorAll(`#list .card[data-sid="${sid}"]`).forEach(el => {
            el.classList.remove('has-done-dot');
            el.querySelectorAll('.card-done-dot').forEach(d => d.remove());
          });
        }
        if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); }
      } catch {}
    }
  },

  // 启动瞬间同步预热上次未完成的对话状态：让侧栏卡片在 0ms 第一帧就显示任务进行中动效（旋转图标 + 脉冲波纹），但不把 chat.status 强行设为 streaming（避免阻塞队列与显示假● ● ●）
  prewarmTrackedChats() {
    this.bindUnload();
    const rMap = this._loadRunMap();
    try {
      const scanSids = new Set([
        ...(typeof Store !== 'undefined' && Store.get ? (Store.get('mc:hot:lru', []) || []) : []),
        ...(typeof Tabs !== 'undefined' && Array.isArray(Tabs.list) ? Tabs.list.map(t => t?.sid).filter(Boolean) : []),
        ...(typeof History !== 'undefined' && Array.isArray(History.items) ? History.items.slice(0, 12).map(e => e?.id).filter(Boolean) : []),
      ]);
      for (const sid of scanSids) {
        if (!sid || rMap[sid]) continue;
        const cExisting = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
        if (cExisting && cExisting.loaded && !cExisting.cached) continue;
        const hot = typeof MsgCache !== 'undefined' && MsgCache.getSync ? MsgCache.getSync(sid) : null;
        if (hot && Array.isArray(hot.messages) && hot.messages.length && (now() - (hot.at || 0) < 15 * 60 * 1000)) {
          const tailM = hot.messages.at(-1);
          const tailAlreadyDone = Boolean(tailM?._finishedAt || tailM?.metadata?.timing?.completedAt || tailM?.metadata?.aborted || tailM?.metadata?.error || tailM?.metadata?.finishReason === 'stop' || tailM?.metadata?.finishReason === 'end-turn');
          const inc = !tailAlreadyDone && Boolean(
            (tailM?.role === 'user' && !tailM.failed && (!tailM._local || tailM._appendAccepted)) ||
            (tailM?.role === 'assistant' && (tailM.metadata?.pending || tailM._incomplete))
          );
          if (inc) {
            rMap[sid] = { sid, startedAt: hot.at || now(), updatedAt: hot.at || now(), isEval: Boolean(hot.isEvaluation), evalMode: hot.evalMode || '' };
            this._saveRunMap(rMap);
          }
        }
      }
    } catch {}
    let any = false;
    let mapChanged = false;
    for (const [sid, info] of Object.entries(rMap)) {
      if (!sid) continue;
      try {
        const c = typeof chatOf === 'function' ? chatOf(sid) : (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
        if (!c) continue;
        if (c.loaded && !c.cached && !this.isChatActivelyGenerating(c)) {
          delete rMap[sid];
          c._startupResuming = false;
          c._wasTrackedRunning = false;
          mapChanged = true;
          continue;
        }
        c._wasTrackedRunning = true;
        c._startupResuming = true;
        c._recoveringIncomplete = true;
        if (info?.isEval) {
          c.isEvaluation = true;
          if (info.evalMode && !c.evalMode) c.evalMode = info.evalMode;
        }
        any = true;
      } catch {}
    }
    if (mapChanged) this._saveRunMap(rMap);
    if (any || mapChanged) {
      try { if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); } } catch {}
      try { if (typeof Bar !== 'undefined') Bar.render?.(); } catch {}
    }
  },

  onChatUpdate(c) {
    if (!c || !c.sid) return;
    this.bindUnload();
    const sid = c.sid;
    const rMap = this._loadRunMap();
    const uMap = this._loadUnreadMap();
    const runningNow = this.isChatActivelyGenerating(c);
    const wasRunning = Boolean(c._wasTrackedRunning || rMap[sid]);

    if (runningNow) {
      c._wasTrackedRunning = true;
      const prev = rMap[sid];
      rMap[sid] = {
        sid,
        startedAt: prev?.startedAt || now(),
        updatedAt: now(),
        isEval: Boolean(c.isEvaluation),
        evalMode: c.evalMode || prev?.evalMode || '',
      };
      this._saveRunMap(rMap);
      if (uMap[sid]) {
        delete uMap[sid];
        this._saveUnreadMap(uMap);
      }
      return;
    }

    // 仅读到缓存但尚未向服务器确认完成前，绝不提前抹掉进行中状态
    if (c._startupResuming || c._recoveringIncomplete || c.loading || !c.loaded || c.cached) {
      return;
    }

    if (wasRunning && c.loaded && !c.loading && !c.cached) {
      c._wasTrackedRunning = false;
      if (rMap[sid]) {
        delete rMap[sid];
        this._saveRunMap(rMap);
      }
      const tailM = Array.isArray(c.messages) ? c.messages.at(-1) : null;
      const isFailedUserTail = Boolean(tailM?.role === 'user' && (tailM.failed || (tailM._local && !tailM._appendAccepted)));
      if (!isFailedUserTail && !this.isCurrentlyViewed(sid)) {
        uMap[sid] = { sid, doneAt: now() };
        this._saveUnreadMap(uMap);
      }
      try { if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); } } catch {}
      try { if (typeof Bar !== 'undefined') Bar.render?.(); } catch {}
    }
  },

  snapshotBeforeClose() {
    try {
      const rMap = this._loadRunMap();
      let changed = false;
      if (typeof Chats !== 'undefined' && Chats.values) {
        for (const c of Chats.values()) {
          if (!c || !c.sid) continue;
          const tailForSnap = Array.isArray(c.messages) ? c.messages.at(-1) : null;
          const isUnacceptedSend = Boolean(c.preSend || (tailForSnap?.role === 'user' && tailForSnap._local && !tailForSnap._appendAccepted));
          if (this.isChatActivelyGenerating(c) && !isUnacceptedSend) {
            rMap[c.sid] = {
              sid: c.sid,
              startedAt: rMap[c.sid]?.startedAt || now(),
              updatedAt: now(),
              isEval: Boolean(c.isEvaluation),
              evalMode: c.evalMode || rMap[c.sid]?.evalMode || '',
            };
            changed = true;
            try { if (typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(c); } catch {}
          } else if (c.loaded && !c.cached && rMap[c.sid] && !this.isChatActivelyGenerating(c)) {
            delete rMap[c.sid];
            changed = true;
          }
        }
      }
      if (changed) this._saveRunMap(rMap);
    } catch {}
  },

  bindUnload() {
    if (this._boundUnload || typeof window === 'undefined') return;
    this._boundUnload = true;
    try {
      window.addEventListener('beforeunload', () => this.snapshotBeforeClose());
      window.addEventListener('pagehide', () => this.snapshotBeforeClose());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.snapshotBeforeClose();
      });
    } catch {}
  },

  async resumeOnStartup() {
    if (this._resuming) return;
    this._resuming = true;
    this.prewarmTrackedChats();
    try {
      const rMap = this._loadRunMap();
      const candidateMap = new Map();
      for (const [sid, info] of Object.entries(rMap)) {
        if (!sid) continue;
        candidateMap.set(sid, info || { sid, updatedAt: now() });
      }
      try {
        const recentSids = new Set([
          ...(typeof Tabs !== 'undefined' && Array.isArray(Tabs.list) ? Tabs.list.map(t => t?.sid).filter(Boolean) : []),
          ...(typeof History !== 'undefined' && Array.isArray(History.items) ? History.items.slice(0, 10).filter(e => e?.id && (now() - (typeof entAt === 'function' ? entAt(e) : 0) < 15 * 60 * 1000)).map(e => e.id) : []),
        ]);
        for (const sid of recentSids) {
          if (!sid || candidateMap.has(sid)) continue;
          const cExisting = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
          if (cExisting && cExisting.loaded && !cExisting.cached && !this.isChatActivelyGenerating(cExisting)) continue;
          const cached = typeof MsgCache !== 'undefined' && MsgCache.get ? await MsgCache.get(sid).catch(() => null) : null;
          if (cached && Array.isArray(cached.messages) && cached.messages.length && (now() - (cached.at || 0) < 15 * 60 * 1000)) {
            const tailM = cached.messages.at(-1);
            const tailAlreadyDone = Boolean(tailM?._finishedAt || tailM?.metadata?.timing?.completedAt || tailM?.metadata?.aborted || tailM?.metadata?.error || tailM?.metadata?.finishReason === 'stop' || tailM?.metadata?.finishReason === 'end-turn');
            const inc = !tailAlreadyDone && Boolean(
              (tailM?.role === 'user' && !tailM.failed && (!tailM._local || tailM._appendAccepted)) ||
              (tailM?.role === 'assistant' && (tailM.metadata?.pending || tailM._incomplete))
            );
            if (inc) {
              const info = { sid, startedAt: cached.at || now(), updatedAt: cached.at || now(), isEval: Boolean(cached.isEvaluation), evalMode: cached.evalMode || '' };
              rMap[sid] = info;
              candidateMap.set(sid, info);
              this._saveRunMap(rMap);
            }
          }
        }
      } catch {}

      if (!candidateMap.size) return;

      const curTabSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
      const entries = [...candidateMap.values()].sort((a, b) => {
        if (a.sid === curTabSid) return -1;
        if (b.sid === curTabSid) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      const resumeOne = async (item) => {
        const sid = item?.sid;
        if (!sid) return;
        try {
          const c = typeof chatOf === 'function' ? chatOf(sid) : (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
          if (!c) return;
          if (c.loaded && !c.cached && !c.loading && !this.isChatActivelyGenerating(c)) {
            c._startupResuming = false;
            c._recoveringIncomplete = false;
            c._wasTrackedRunning = false;
            delete rMap[sid];
            this._saveRunMap(rMap);
            try { if (typeof SendQ !== 'undefined' && (c.queue || []).length) SendQ.check(c); } catch {}
            return;
          }
          c._wasTrackedRunning = true;
          c._startupResuming = true;
          c._recoveringIncomplete = true;
          try { if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); } } catch {}

          const hRow = typeof History !== 'undefined' ? History.byId?.(sid) : null;
          const isEval = Boolean(item.isEval || c.isEvaluation || hRow?.type === 'evaluation' || hRow?.mode === 'battle' || hRow?.mode === 'direct' || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(c)));
          if (isEval && typeof EvalEngine !== 'undefined') {
            c.isEvaluation = true;
            EvalEngine.initEvalFields?.(c, item.evalMode ? { evalMode: item.evalMode } : {});
            await EvalEngine.loadChat(c, true).catch(() => {});
          } else {
            await (c.loading || c.load(true)).catch(() => {});
            const realRunningAfterLoad = this.isChatActivelyGenerating(c);
            if (!realRunningAfterLoad && (!c.loaded || c.cached) && typeof c.serverMidTurn === 'function') {
              const mid = await c.serverMidTurn().catch(() => false);
              if (mid) {
                c.status = 'streaming';
                c.phase = '接收回复中';
                await c.resumeIncremental?.('server-active')?.catch?.(() => {});
              }
            }
          }

          c._startupResuming = false;
          c._recoveringIncomplete = false;
          const stillRunning = this.isChatActivelyGenerating(c);
          if (stillRunning) {
            rMap[sid] = {
              sid,
              startedAt: item.startedAt || now(),
              updatedAt: now(),
              isEval: Boolean(c.isEvaluation || isEval),
              evalMode: c.evalMode || item.evalMode || '',
            };
            this._saveRunMap(rMap);
          } else {
            c._wasTrackedRunning = false;
            delete rMap[sid];
            this._saveRunMap(rMap);
            if (!c.awaitId && !c.preSend && !c.sending && c.status === 'streaming' && !c.live) {
              c.status = 'idle';
              c.phase = '';
            }
            const tailAfterResume = Array.isArray(c.messages) ? c.messages.at(-1) : null;
            const failedAfterResume = Boolean(tailAfterResume?.role === 'user' && (tailAfterResume.failed || (tailAfterResume._local && !tailAfterResume._appendAccepted)));
            if (failedAfterResume) {
              tailAfterResume.failed = true;
              delete tailAfterResume._appendAccepted;
              c.status = 'error';
              if (!c.error) c.error = '上一条消息未发出（服务器未收到），请点击重试';
            } else {
              if (!this.isCurrentlyViewed(sid)) {
                this.markUnread(sid);
              }
              if (typeof SendQ !== 'undefined' && (c.queue || []).length) {
                setTimeout(() => { try { SendQ.check(c); } catch {} }, 50);
              }
            }
          }
          try { if (typeof UI !== 'undefined') { UI.renderListSoon?.(); UI.renderTabs?.(); } } catch {}
          try { if (typeof Bar !== 'undefined') Bar.render?.(); } catch {}
        } catch {
          try {
            const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
            if (c) {
              c._startupResuming = false;
              c._recoveringIncomplete = false;
            }
          } catch {}
        }
      };

      // Run active tab immediately, then pace remaining background entries sequentially to avoid startup 429 bursts
      if (entries.length > 0) {
        await resumeOne(entries[0]);
        for (let i = 1; i < entries.length; i++) {
          await sleep(650);
          await resumeOne(entries[i]);
        }
      }
    } finally {
      this._resuming = false;
    }
  }
};
try { if (typeof window !== 'undefined') window.RunningTracker = RunningTracker; } catch {}

try {
  if (typeof window !== 'undefined') {
    window.__branaTrimMemory = () => {
      try {
        if (typeof Chats !== 'undefined' && Chats instanceof Map && Chats.size > 3) {
          const curSid = typeof UI !== 'undefined' ? UI?.sid : '';
          const loadedList = [];
          for (const [sid, c] of Chats.entries()) {
            if (!c || sid === curSid || c.busy || c.streaming || c.gacha || c._startupResuming || c._recoveringIncomplete || (Array.isArray(c.queue) && c.queue.length > 0)) continue;
            if (c.loaded && Array.isArray(c.messages) && c.messages.length > 0) loadedList.push(c);
          }
          if (loadedList.length > 2) {
            loadedList.sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
            for (let i = 2; i < loadedList.length; i++) {
              const victim = loadedList[i];
              try { if (typeof MsgCache !== 'undefined') MsgCache.save?.(victim); } catch {}
              victim.messages = [];
              victim.loaded = false;
            }
          }
        }
        if (typeof _mdPartCache !== 'undefined' && _mdPartCache instanceof Map && _mdPartCache.size > 80) {
          const drop = _mdPartCache.size - 50;
          let n = 0;
          for (const k of _mdPartCache.keys()) { _mdPartCache.delete(k); if (++n >= drop) break; }
        }
        if (typeof BUILTIN_HABIT_BANK !== 'undefined' && typeof BUILTIN_HABIT_BANK?.__releaseSamples === 'function') {
          BUILTIN_HABIT_BANK.__releaseSamples();
        }
        if (typeof globalThis.gc === 'function') globalThis.gc();
      } catch {}
    };
  }
} catch {}
