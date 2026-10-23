ICON.grid = '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>';
// ---------- 账号统计：每个厂商多少对话、每个型号多少对话、每个对话几轮 ----------
// 在本账号自己的窗口里（走本账号的节点 / 地区 IP）算好交给宿主；账号管理窗口、手机启动选账号页只读宿主存的结果，不会用别的账号的 IP 去请求
const AcctStats = {
  // { sid: [轮数, 是否完整] }：打开过 / 统计过的对话才有；没统计的显示「—」
  turns: Store.get('turns', {}),
  saveT: 0, repT: 0, lastSig: '',
  save() { clearTimeout(this.saveT); this.saveT = setTimeout(() => { const ks = Object.keys(this.turns); if (ks.length > 3000) for (const k of ks.slice(0, ks.length - 3000)) delete this.turns[k]; Store.set('turns', this.turns); }, 1500); },
  // 一轮 = 自己发的一条消息（只含交互卡片回答的不算）
  count(msgs) { return (msgs || []).filter(m => m.role === 'user' && (m.parts || []).some(p => p.type === 'text' || p.type === 'file')).length; },
  noteChat(c) {
    if (!c?.sid || !c.loaded || c.busy) return;
    const k = c.messages.length + ':' + !c.hasMore; if (c._tsig === k) return; c._tsig = k;
    const n = this.count(c.messages), full = c.hasMore ? 0 : 1, old = this.turns[c.sid];
    if (!n || (old && old[0] === n && old[1] === full) || (old && old[1] && !full && old[0] >= n)) return;
    this.turns[c.sid] = [n, full]; this.save(); this.soon();
  },
  // 没打开过的对话：逐个拉消息数一下（本窗口 = 本账号自己的 IP；慢慢来，不触发限流）
  async countRemote(sids, onStep) {
    let i = 0;
    for (const sid of sids) {
      if (Chats.get(sid)?.loaded && !Chats.get(sid).hasMore) { this.noteChat(Chats.get(sid)); continue; }
      try {
        if (typeof MsgCache !== 'undefined' && MsgCache.get) {
          const mc = await MsgCache.get(sid).catch(() => null);
          if (mc?.messages?.length && !mc.more) {
            this.turns[sid] = [this.count(mc.messages), 1];
            onStep?.(++i, sids.length);
            continue;
          }
        }
        if (typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) await sleep(Math.min(15000, Math.max(2000, (ReadLimit.until || 0) - now())));
        const c = await api('/api/chat/' + sid + '?includeStreamToken=false&recoverRun=false', { timeout: 30000, bg: true });
        let n = this.count(c.messages), more = !!c.pagination?.hasMore, cur = c.pagination?.cursor;
        for (let p = 0; more && cur && p < 15; p++) { await sleep(500); const j = await api(`/api/chat/${sid}/messages?cursor=${encodeURIComponent(cur)}&limit=20`, { bg: true }); n += this.count(j.messages); more = !!j.pagination?.hasMore; cur = j.pagination?.cursor; }
        this.turns[sid] = [n, more ? 0 : 1];
      } catch (e) { if (e.status === 429) await sleep(12000); }
      onStep?.(++i, sids.length); await sleep(400);
    }
    this.save();
  },
  validModelName(raw) {
    const s = String(raw || '').replace(/\?+$/, '').trim();
    if (!s || s === '未识别' || s === '开源模型') return false;
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(s)) return false;
    if (/^(openai|gpt|chatgpt|anthropic|claude|google|gemini|xai|grok|moonshot|kimi|deepseek|qwen|zhipu|glm|xiaomi|mimo|bytedance|doubao|minimax|mistral|meta|llama|other)$/i.test(s)) return false;
    const c = Strength.canon(s) || '';
    if (!c || /[\u3000-\u9fff\uff00-\uffef]/.test(c)) return false;
    if (/^(openai|gpt|chatgpt|anthropic|claude|google|gemini|xai|grok|moonshot|kimi|deepseek|qwen|zhipu|glm|xiaomi|mimo|bytedance|doubao|minimax|mistral|meta|llama|other)$/i.test(c)) return false;
    return !!Brand.of(c);
  },
  compute() {
    const V = {}, rows = [];
    const gone = typeof History.goneMap === 'function' ? History.goneMap() : new Map();
    const activeItems = (History.items || []).filter(e => e?.id && !gone.has(e.id) && !e.isArchived && !e.archivedAt && !e._pending && e.type !== 'evaluation' && e.mode !== 'battle' && e.mode !== 'direct');
    for (const e of activeItems) {
      const mi = Models.get(e.id);
      const noteVal = (typeof Notes !== 'undefined' && Notes.all?.[e.id]?.n) || '';
      const cacheKey = (e.localTitle || '') + '\u0001' + (e.title || '') + '\u0001' + (mi?.name || '') + '\u0001' + (mi?.at || 0) + '\u0001' + (mi?.pendingConfirm ? 1 : 0) + '\u0001' + (mi?.guess ? 1 : 0) + '\u0001' + noteVal + '\u0001' + (e.updatedAt || e.createdAt || '');
      if (e._astat && e._astat.key === cacheKey) {
        rows.push(e._astat.row);
        continue;
      }
      const isBareGuess = Boolean(mi?.guess && !mi.userCorrected && !mi.habitInferred && !mi.reverseInferred && !mi.billingProbe);
      const fromM = !!(mi?.name && !isBareGuess && !mi.pendingConfirm && this.validModelName(mi.name));
      const tv = typeof Titles !== 'undefined' && Titles.view ? Titles.view(e.id, e.title, e.localTitle) : null;
      const tvBase = tv?.model && !/待解码/.test(tv.model) ? noteBase(tv.model) : '';
      const fromTv = !isBareGuess && !!(tvBase && this.validModelName(tvBase) && (Strength.ver10(Strength.canon(tvBase)) != null || /(?:^|[-_.\s])\d/.test(tvBase)));
      const rawTitle = String(e.localTitle || e.title || '');
      const gp = typeof TitleCipher !== 'undefined' && TitleCipher.decodeGoldPrefix ? (TitleCipher.decodeGoldPrefix(rawTitle) || TitleCipher.decodeGoldPrefix(e.title)) : null;
      const fromPrefix = !!(gp?.model && this.validModelName(gp.model));
      const cleanRawTitle = gp ? (gp.cleanTitle || '') : rawTitle;
      const baseTitle = noteBase(cleanRawTitle);
      const fromTitle = !mi && this.validModelName(baseTitle) && (!/\s/.test(baseTitle) || /\s·\s/.test(cleanRawTitle)) && (Strength.ver10(Strength.canon(baseTitle)) != null || /(?:^|[-_.\s])\d/.test(baseTitle));
      const rawNote = tv?.note || noteVal || (typeof Notes !== 'undefined' && Notes.get ? Notes.get(e.id) : '') || '';
      const noteCanon = rawNote ? Strength.canon(rawNote) : '';
      const fromNote = !!(noteCanon && this.validModelName(noteCanon) && (Strength.ver10(noteCanon) != null || /(?:^|[-_.\s])\d/.test(noteCanon)));
      let picked = fromM ? mi.name : (fromTv ? tvBase : (fromPrefix ? gp.model : (fromTitle ? baseTitle : (fromNote ? noteCanon : ''))));
      if (fromNote && picked && Strength.parts?.(noteCanon)?.tier && !Strength.parts?.(Strength.canon(picked))?.tier) picked = noteCanon;
      const nm = picked ? (Strength.canon(picked) || '') : '';
      const vid = nm && this.validModelName(nm) ? (Brand.of(nm) || 'other') : 'other';
      const at = entAt(e) || 0;
      const row = { id: e.id, title: String(cleanRawTitle || e.title || '').slice(0, 80), vid, nm: vid === 'other' ? '' : nm, at, ver: vid !== 'other' ? Strength.ver10(nm) || null : null, lv: vid !== 'other' ? Strength.level(nm) : null };
      e._astat = { key: cacheKey, row };
      rows.push(row);
    }
    for (const r of rows) {
      if (r.vid === 'other' || !r.nm) continue;
      const v = V[r.vid] ||= { n: 0, turns: 0, gold: { n: 0, models: [] }, models: {} };
      const key = r.nm, m = v.models[key] ||= { n: 0, turns: 0, known: 0, gold: false, ver: r.ver, lv: r.lv, list: [] };
      const t = this.turns[r.id];
      v.n++; m.n++; if (t) { m.turns += t[0]; m.known++; v.turns += t[0]; }
      m.list.push([r.id, r.at, t ? t[0] : 0, t ? t[1] : 0, Notes.get(r.id) || '', r.title]);
    }
    for (const k of Object.keys(V)) {
      if (k === 'other' || !(V[k]?.n > 0) || !Object.keys(V[k]?.models || {}).length) delete V[k];
    }
    // 金色：所有账号统一规则（手动点亮或全局最强档位统一判定）
    for (const [vid, v] of Object.entries(V)) {
      if (vid === 'other') continue;
      if (typeof Gold !== 'undefined' && (Gold.manual || typeof Gold.isUnifiedGold === 'function')) {
        for (const [k, m] of Object.entries(v.models)) {
          if (Gold.manual ? Gold.has(k) : Gold.isUnifiedGold(k)) { m.gold = true; v.gold.n += m.n; v.gold.models.push(k); }
        }
        continue;
      }
      const ms = Object.entries(v.models).filter(([, m]) => m.ver != null && m.lv != null);
      const topVer = ms.reduce((x, [, m]) => Math.max(x, m.ver), -Infinity);
      const topLv = ms.reduce((x, [, m]) => m.ver === topVer ? Math.max(x, Math.round(m.lv)) : x, -Infinity);
      for (const [k, m] of ms) if (m.ver === topVer && Math.round(m.lv) === topLv) { m.gold = true; v.gold.n += m.n; v.gold.models.push(k); }
    }
    for (const v of Object.values(V)) for (const m of Object.values(v.models)) { m.list.sort((a, b) => b[1] - a[1]); if (m.list.length > 80) m.list.length = 80; delete m.ver; delete m.lv; }
    return { at: now(), total: activeItems.length, full: !!History.full, vendors: V };
  },
  soon(ms = 300) { clearTimeout(this.repT); this.repT = setTimeout(() => this.report(), ms); },
  report(extra) {
    clearTimeout(this.repT);
    if (Host.platform === 'web' || (!History.lastLoad && !History.cached && !Array.isArray(History.items))) return;
    const stats = this.compute(), sig = JSON.stringify(stats.vendors) + ':' + stats.total + ':' + stats.full;
    const prevTotal = Number(UI.host?.account?.status?.stats?.total) || 0;
    if (stats.total === 0 && prevTotal > 0 && !(History.items || []).length) {
      if (extra) {
        const patch = { ...(extra || {}) };
        delete patch.stats;
        if (Object.keys(patch).length) Host.noteAccount?.(patch)?.catch?.(() => {});
      }
      return;
    }
    const curId = UI.host?.account?.id;
    if (UI.host?.account) UI.host.account.status = { ...(UI.host.account.status || {}), stats };
    if (typeof LaunchPick !== 'undefined' && Array.isArray(LaunchPick.cache) && curId) {
      const hit = LaunchPick.cache.find(x => x?.id === curId);
      if (hit) hit.status = { ...(hit.status || {}), stats };
    }
    if (sig === this.lastSig && !extra) return; this.lastSig = sig;
    if (UI.me || Store.get('me:u', null) || curId) {
      Host.noteAccount?.({ stats, ...(extra || {}) })?.catch?.(() => {});
    }
  },
  // 宿主（账号管理窗口）发来的命令：{ stats: 1 } 重新统计；{ turns: [sid…] } 统计这些对话的轮数
  async cmd(m) {
    if (!UI.me) { Host.noteAccount?.({ statsDone: true, statsErr: '未登录' })?.catch?.(() => {}); return; }
    Host.noteAccount?.({ statsBusy: '同步对话列表…' })?.catch?.(() => {});
    try { await History.refresh(); await History.loadAll(); } catch {}
    if (Array.isArray(m.turns) && m.turns.length) await this.countRemote(m.turns, (i, n) => { if (i % 3 === 0 || i === n) { this.lastSig = ''; this.report({ statsBusy: `统计轮数 ${i}/${n}` }); } });
    this.lastSig = ''; this.report({ statsDone: true, statsBusy: '' });
  },
};
Bus.on('chat', c => AcctStats.noteChat(c));
Bus.on('history', () => { if (!History.fullLoading) AcctStats.soon(); });
Bus.on('models', () => AcctStats.soon(400));
