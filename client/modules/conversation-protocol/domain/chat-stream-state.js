const Chats = new Map();
function pruneInactiveChats(maxIdle = 8) {
  if (Chats.size <= maxIdle + 4) return;
  try {
    const openSids = new Set();
    if (typeof Tabs !== 'undefined' && Array.isArray(Tabs.list)) {
      for (const t of Tabs.list) if (t?.sid) openSids.add(t.sid);
    }
    if (typeof UI !== 'undefined' && UI.els?.chat?.sid) openSids.add(UI.els.chat.sid);
    const tNow = now();
    for (const [sid, c] of Chats) {
      if (Chats.size <= maxIdle) break;
      if (!c || openSids.has(sid) || c.busy || c.streaming || c.loading || c.identifying || c.gacha) continue;
      if (c.lastActivity && tNow - c.lastActivity < 30000) continue;
      c.messages = [];
      c.parts?.clear?.();
      c.live = null;
      Chats.delete(sid);
      try { if (typeof Seg !== 'undefined' && typeof Seg.drop === 'function') Seg.drop(sid); } catch {}
    }
  } catch {}
}
const chatOf = sid => {
  let c = Chats.get(sid);
  if (c) return c;
  c = new Chat(sid);
  Chats.set(sid, c);
  if (Chats.size > 12) pruneInactiveChats(8);
  return c;
};
Chats.onRouteSwitched = () => {
  try {
    if (typeof Recaptcha !== 'undefined' && typeof Recaptcha.clearCache === 'function') Recaptcha.clearCache();
    const curSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    for (const c of Chats.values()) {
      if (!c) continue;
      c._pre = null;
      c._preP = null;
      c.tokenP = null;
      if (c.loading) {
        try { c._loadCtl?.abort(); } catch {}
        c.loading = null;
        if (c.sid === curSid || !c.loaded || c.busy) {
          setTimeout(() => { try { c.load(true).catch(() => {}); } catch {} }, 60);
        }
      } else if (c.sid === curSid && !c.loaded) {
        setTimeout(() => { try { c.load(true).catch(() => {}); } catch {} }, 60);
      } else if (c.loaded && !c.isEvaluation && typeof c.resumeIncremental === 'function' && (c.sid === curSid || (Array.isArray(c.messages) && c.messages.some(m => m?.role === 'user' && (m._local || m.failed))))) {
        setTimeout(() => { try { c.resumeIncremental().catch(() => {}); } catch {} }, 80);
      }
      if ((c.streaming || c.busy) && !c.isEvaluation && typeof c.restream === 'function') {
        setTimeout(() => { try { if (c.streaming || c.busy) c.restream(); } catch {} }, 120);
      }
    }
  } catch {}
};

class Chat {
  constructor(sid) {
    this.sid = sid; this.messages = []; this.status = 'idle'; this.error = null; this.token = null; this.tokenExp = 0;
    this.lastSeq = null; this.loaded = false; this.loading = null; this.hasMore = false; this.cursor = null;
    this.live = null; this.parts = new Map(); this.streaming = false; this.gen = 0; this.ctl = null;
    this.title = ''; this.v = 0; this.phase = ''; this.lastActivity = 0; this.runTok = null; this.identifying = false;
  }
  hydrateSync() {
    if (this.loaded || this.messages.length || typeof MsgCache === 'undefined' || typeof MsgCache.getSync !== 'function') return false;
    const x = MsgCache.getSync(this.sid);
    if (!x || !Array.isArray(x.messages) || !x.messages.length) return false;
    if (x.isEvaluation) { this.isEvaluation = true; if (x.evalMode) this.evalMode = x.evalMode; }
    this.messages = x.messages.filter(m => !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).map(m => ({ ...m, v: 0 }));
    try { SentUserLog.restoreInto(this); } catch {}
    this.cached = true;
    this._hotOnly = Boolean(x._hotSlice);
    this.hasMore = !!x.more;
    if (x.lastSeq && !this.lastSeq) this.lastSeq = String(x.lastSeq);
    if (x.triggerAddress && !this.triggerAddress) this.triggerAddress = x.triggerAddress;
    if (x.token && !this.token && (x.tokenExp || 0) > now() + 30000) { this.token = x.token; this.tokenExp = x.tokenExp; this.tokenAt = now(); }
    const tailM = this.messages.at(-1);
    if (tailM?.role === 'user' && tailM._local && !tailM._appendAccepted && !(typeof Drafts !== 'undefined' && Drafts.sess?.has?.(tailM.id))) {
      tailM.failed = true;
      if (!this.error) this.error = '上一条消息未发出（服务器未收到），请点击重试';
    }
    if (tailM && ((tailM.role === 'user' && !tailM.failed && (!tailM._local || tailM._appendAccepted)) || (tailM.role === 'assistant' && typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(tailM)))) {
      this._recoveringIncomplete = true;
      if (tailM.role === 'assistant') tailM._incomplete = true;
    }
    return true;
  }
  get busy() { return this.status === 'submitted' || this.status === 'streaming' || this.status === 'stopping'; }
  emit() { if (this._emitT) { clearTimeout(this._emitT); this._emitT = 0; } this._lastEmitAt = now(); this.v++; if (this.wCtl && (this.busy || this.streaming)) { try { this.wCtl.abort(); } catch {} this.wCtl = null; } try { if (typeof RunningTracker !== 'undefined') RunningTracker.onChatUpdate(this); } catch {} Bus.emit('chat', this); if (this.loaded || (Array.isArray(this.messages) && this.messages.length > 0)) MsgCache.put(this); }
  emitStreamSoon(delay = 20) { if (this._emitT) return; const el = now() - (this._lastEmitAt || 0); if (el >= delay) { this.emit(); return; } this._emitT = setTimeout(() => { this._emitT = 0; this.emit(); }, Math.max(12, delay - el)); }
  // 鼠标移到侧栏卡片上就先把对话内容拉下来，点开时直接用（30 秒内有效）
  prefetch() {
    if (this.loaded || this.loading || this.messages?.length > 0 || (typeof MsgCache !== 'undefined' && MsgCache.mem?.has?.(this.sid)) || this._preP || (this._pre && now() - this._pre.at < 30000) || now() - (this._preAt || 0) < 180000) return;   // 同一个对话 3 分钟内只预读一次（鼠标反复划过不重复下载）
    const curSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    if (curSid && curSid !== this.sid && Chats.get(curSid)?.loading) return;   // 当前正点开的对话在加载中：暂停预读让路
    if (typeof Chats !== 'undefined' && [...Chats.values()].some(ch => ch && (ch.busy || ch.streaming))) return;
    if (!ReadLimit.canPrefetch()) return;   // 限流中 / 已有一条预读在途 / 离上一条太近：跳过，点开时再正常加载
    ReadLimit.inflight++; ReadLimit.lastAt = now(); this._preAt = now();
    this._preP = api('/api/chat/' + this.sid, { timeout: 30000, bg: true }).then(c => { this._pre = { c, at: now() }; return c; }).finally(() => { this._preP = null; ReadLimit.inflight = Math.max(0, ReadLimit.inflight - 1); });
    this._preP.catch(() => {});
  }
  // 预热（窗口切换器 / 相邻窗口）：先放本地缓存秒出，再后台拉服务器最新内容；点开时 30 秒内直接用这份，不再等网络
  async warm() {
    if (this.loaded || this.loading) return;
    if (!this.messages.length) {
      const x = await MsgCache.get(this.sid).catch(() => null);
      if (x?.messages?.length && !this.loaded && !this.loading && !this.messages.length) {
        this.messages = x.messages.map(m => ({ ...m, v: 0 }));
        this.cached = true;
        this.hasMore = !!x.more;
        if (typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid) this.emit();
        return;
      }
    }
    if (this.loaded || this.loading || this.messages.length) return;
    this.prefetch();
    const c = await (this._preP || Promise.resolve(this._pre?.c)).catch(() => null);
    if (!c?.messages?.length || this.loaded || this.loading || this.messages.some(m => m._local)) return;
    this.messages = c.messages.map(m => ({ ...m, v: 2 })); this.cached = true; this.hasMore = !!c.pagination?.hasMore; this.emit();
  }
  markBadToken(tok) {
    if (typeof tok === 'string' && tok.length > 20) (this._badToks ||= new Set()).add(tok);
    if (!tok || this.token === tok) { this.token = null; this.tokenExp = 0; }
  }
  setToken(t, exp) {
    if (!t || this._badToks?.has(t)) return;
    const p = jwt(t);
    const jwtExp = (p?.exp || 0) * 1000;
    const nextExp = Number(exp) > now() ? Number(exp) : (jwtExp || (now() + 8 * 60000));
    // Replayed turn-complete records from earlier turns carry older tokens: never downgrade a newer valid token
    if (this.token && !this._badToks?.has(this.token) && jwtExp > 0 && (this.tokenExp || 0) > nextExp + 5000) return;
    this.token = t;
    if (Array.isArray(p?.scopes)) {
      for (const sc of p.scopes) {
        const m = /^(?:read|write):sessions:([0-9a-f-]{36})$/i.exec(String(sc || ''));
        if (m) { this.triggerAddress = m[1]; break; }
      }
    }
    this.tokenExp = nextExp;
    this.tokenAt = now();
  }
  async wakeSessionToken(force = false) {
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) return null;
    const prevTok = this.token, prevExp = this.tokenExp;
    if (!force && this.token && !this._badToks?.has(this.token) && (this.tokenExp || 0) - 180000 > now()) return this.token;
    try {
      const j = await api('/api/chat/trigger-token', { json: { sessionId: this.sid }, timeout: 10000 });
      if (j?.triggerAddress) this.triggerAddress = j.triggerAddress;
      const tok = j?.token || j?.publicAccessToken;
      if (typeof tok === 'string' && tok) {
        const exp = Number(j?.expiresAt || j?.exp || 0);
        this.setToken(tok, exp > 1e12 ? exp : exp > 1e9 ? exp * 1000 : 0);
        return this.token;
      }
    } catch {}
    if (prevTok && !this._badToks?.has(prevTok) && (prevExp || 0) > now() + 15000) {
      this.token = prevTok;
      this.tokenExp = prevExp;
      return prevTok;
    }
    return this.ensureToken(force);
  }
  ensureToken(force) {
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) return Promise.resolve(null);
    if (this.tokenP) return this.tokenP;
    if (!force && this.token && !this._badToks?.has(this.token) && this.tokenExp - 120000 > now()) return Promise.resolve(this.token);
    if (force && this.token) { this.markBadToken?.(this.token); this.token = null; this.tokenExp = 0; }
    // Send, live stream and read-only reconciliation share this account/chat's refresh.
    this.tokenP = (async () => {
      let j = null;
      if (force === 'session') {
        const tz = typeof currentTimezone === 'function' ? currentTimezone() : 'UTC';
        j = await api('/api/chat/trigger-session', { json: { sessionId: this.sid, timezone: tz }, timeout: 20000 }).catch(() => null);
      }
      if (!j?.token && !j?.publicAccessToken) {
        try {
          j = await api('/api/chat/trigger-token', { json: { sessionId: this.sid }, timeout: 20000 });
        } catch (err) {
          if (err?.status === 403 && typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this)) return null;
          if (err?.status === 404 || err?.status === 403) {
            const tz = typeof currentTimezone === 'function' ? currentTimezone() : 'UTC';
            j = await api('/api/chat/trigger-session', { json: { sessionId: this.sid, timezone: tz }, timeout: 15000 }).catch(() => null);
            if (!j?.token && !j?.publicAccessToken) throw err;
          } else {
            throw err;
          }
        }
      }
      if (j?.triggerAddress) this.triggerAddress = j.triggerAddress;
      const token = j?.token || j?.publicAccessToken;
      if (typeof token !== 'string' || !token) throw new Error('无法获取会话令牌');
      const exp = Number(j?.expiresAt || j?.exp || 0);
      this.setToken(token, exp > 1e12 ? exp : exp > 1e9 ? exp * 1000 : 0);
      return this.token;
    })().finally(() => { this.tokenP = null; });
    return this.tokenP;
  }
  async streamDirectFallback(opt = {}) {
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) return false;
    try {
      const tok = await this.ensureToken().catch(() => this.token);
      if (!tok) return false;
      this.loaded = true;
      this.cached = false;
      this.error = null;
      const tailM = this.messages.at(-1);
      const tailPend = Boolean(tailM?.role === 'assistant' && (tailM.metadata?.pending || tailM._incomplete || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(tailM))));
      const needReplay = !Array.isArray(this.messages) || this.messages.length === 0;
      const d = await this.drain(needReplay ? 3000 : 1500, { keepIfFinished: true, replayFinished: needReplay }).catch(() => null);
      if (d?.open || d?.run || tailPend) {
        if (d?.runSeq != null && (this.lastSeq == null || +this.lastSeq >= d.runSeq)) {
          this.lastSeq = String(Math.max(0, d.runSeq - 1));
          this.fence = Math.max(0, d.runSeq - 1);
        }
        const curTail = this.messages.at(-1);
        if (curTail?.role === 'assistant') {
          curTail.metadata = { ...(curTail.metadata || {}), pending: true };
          delete curTail._finishedAt;
          this.live = curTail;
          this.parts.clear();
          for (const p of curTail.parts || []) {
            if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            else if ((p?.type === 'text' || p?.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          }
        }
        this.status = 'streaming';
        this.phase = '接收回复中';
        this.emit();
        this.stream({ peek: false });
        return true;
      }
      if (!this.streaming) this.stream({ peek: !this.busy });
      this.emit();
      return true;
    } catch {
      return false;
    }
  }
  load(force) {
    if (this.loaded && !force) return Promise.resolve();
    if (this.loading && !force) return this.loading;
    if (force && this.loading) {
      try { this._loadCtl?.abort(); } catch {}
      this.loading = null;
    }
    // 秒开（含从浏览器模式切回 Scheme B 及常规点击）：先显示本地缓存并恢复 lastSeq；若历史 updatedAt 未变或刚缓存过，直接 0ms 完成加载并转后台静默对账
    if (!this.messages.length || this._hotOnly) MsgCache.get(this.sid).then(x => {
      if (x?.isEvaluation) { this.isEvaluation = true; if (x.evalMode) this.evalMode = x.evalMode; }
      if (x?.messages?.length && !this.loaded && (!this.messages.length || (this._hotOnly && !x._hotSlice && x.messages.length >= this.messages.length))) {
        this._hotOnly = false;
        const filteredCached = x.messages.filter(m => !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)));
        this.messages = filteredCached.map((m, idx) => {
          const isTailAsst = idx === filteredCached.length - 1 && m?.role === 'assistant';
          const isInc = isTailAsst && typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m);
          if (m?.role === 'assistant' && !m.metadata?.pending && !isInc && Array.isArray(m.parts)) {
            for (const p of m.parts) {
              if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                p.state = 'output-error';
                if (!p.errorText) p.errorText = '未返回结果';
              }
            }
          }
          if (isInc) {
            m._incomplete = true;
            m.metadata = { ...(m.metadata || {}), pending: true };
          }
          return { ...m, v: 0 };
        });
        try { SentUserLog.restoreInto(this); } catch {}
        this.cached = true; this.hasMore = !!x.more;
        const tailCached = this.messages.at(-1);
        if (tailCached?.role === 'user' && tailCached._local && !tailCached._appendAccepted && !(typeof Drafts !== 'undefined' && Drafts.sess?.has?.(tailCached.id))) {
          tailCached.failed = true;
          if (!this.error) this.error = '上一条消息未发出（服务器未收到），请点击重试';
        }
        if (tailCached && ((tailCached.role === 'user' && !tailCached.failed && (!tailCached._local || tailCached._appendAccepted)) || (tailCached.role === 'assistant' && tailCached._incomplete))) {
          this._recoveringIncomplete = true;
        }
        if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
          this.emit();
          return;
        }
        if (x.lastSeq) { this._cachedLastSeq = String(x.lastSeq); if (!this.lastSeq) this.lastSeq = String(x.lastSeq); }
        if (x.token && !this.token && (x.tokenExp || 0) > now() + 30000) { this.token = x.token; this.tokenExp = x.tokenExp; this.tokenAt = 0; }
        const isFastRet = Boolean(window.__ANC_FAST_RETURN);
        if (isFastRet) {
          setTimeout(() => {
            try { if (typeof History !== 'undefined' && History.refresh) void History.refresh(); } catch {}
          }, 20);
        }
        this.emit();
      }
    }).catch(() => {});
    if (typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE && !force) {
      return this.loading ||= (async () => {
        try {
          if (!this.messages.length || this._hotOnly) {
            const x = await MsgCache.get(this.sid).catch(() => null);
            if (x?.isEvaluation) { this.isEvaluation = true; if (x.evalMode) this.evalMode = x.evalMode; }
            if (x?.messages?.length && (!this.messages.length || (this._hotOnly && !x._hotSlice && x.messages.length >= this.messages.length))) { this._hotOnly = false; this.messages = x.messages.filter(m => !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).map(m => ({ ...m, v: 0 })); this.hasMore = !!x.more; }
          }
          this.cached = false; this.loaded = true; this.error = this.messages.length ? null : '本地暂无该对话的正文缓存'; this.emit();
        } finally { this.loading = null; }
      })();
    }
    const loadGen = (this._loadGen = (this._loadGen || 0) + 1);
    const loadCtl = (this._loadCtl = typeof AbortController !== 'undefined' ? new AbortController() : null);
    this._loadStartedAt = now();
    let myLoadP = null;
    return this.loading ||= (myLoadP = (async () => {
      try {
        if (!this.messages.length || this._hotOnly) {
          const x = await MsgCache.get(this.sid).catch(() => null);
          if (x?.isEvaluation) { this.isEvaluation = true; if (x.evalMode) this.evalMode = x.evalMode; }
          if (this.loaded && !force) return;
          if (x?.messages?.length && (!this.messages.length || (this._hotOnly && !x._hotSlice && x.messages.length >= this.messages.length))) {
            this._hotOnly = false;
            const filteredCached = x.messages.filter(m => !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)));
            this.messages = filteredCached.map((m, idx) => {
              const isTailAsst = idx === filteredCached.length - 1 && m?.role === 'assistant';
              const isInc = isTailAsst && typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m);
              if (isInc) { m._incomplete = true; m.metadata = { ...(m.metadata || {}), pending: true }; }
              return { ...m, v: 0 };
            });
            try { SentUserLog.restoreInto(this); } catch {}
            this.cached = true; this.hasMore = !!x.more;
            const tailCached = this.messages.at(-1);
            if (tailCached?.role === 'user' && tailCached._local && !tailCached._appendAccepted && !(typeof Drafts !== 'undefined' && Drafts.sess?.has?.(tailCached.id))) {
              tailCached.failed = true;
              if (!this.error) this.error = '上一条消息未发出（服务器未收到），请点击重试';
            }
            if (tailCached && ((tailCached.role === 'user' && !tailCached.failed && (!tailCached._local || tailCached._appendAccepted)) || (tailCached.role === 'assistant' && tailCached._incomplete))) {
              this._recoveringIncomplete = true;
            }
            if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
              this.loading = null;
              return EvalEngine.loadChat(this, force);
            }
            if (x.lastSeq) { this._cachedLastSeq = String(x.lastSeq); if (!this.lastSeq) this.lastSeq = String(x.lastSeq); }
            if (x.token && !this.token && (x.tokenExp || 0) > now() + 30000) { this.token = x.token; this.tokenExp = x.tokenExp; }
            const isFastRet = Boolean(window.__ANC_FAST_RETURN);
            if (isFastRet) {
              setTimeout(() => {
                try { if (typeof History !== 'undefined' && History.refresh) void History.refresh(); } catch {}
              }, 20);
            }
            this.emit();
          }
        }
        if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
          this.loading = null;
          return EvalEngine.loadChat(this, force);
        }
        let c = null;
        if (!force && this._pre && now() - this._pre.at < 30000 && this._pre.c?.messages?.at(-1)?.role !== 'user') c = this._pre.c;
        else if (!force && this._preP) c = await this._preP.catch(() => null);
        this._pre = null;
        this.loadBytes = 0;
        let lastProgEmit = 0;
        const onProgress = bytes => {
          this.loadBytes = bytes;
          const tNow = now();
          if (bytes >= 65536 && tNow - lastProgEmit >= 350) {
            lastProgEmit = tNow;
            this.emit();
          }
        };
        // 超长上下文对话支持：追加 ?includeStreamToken=false&recoverRun=false 跳过服务端同步恢复与令牌签发阻塞（对齐官网 Web 行为），
        // 首次连接超时给足 35 秒，重试 45 秒，且一旦响应头或数据分片到达即自动续期（流式空闲 45 秒），彻底根治超长上下文对话卡 20 秒超时。
        for (let waits = 0, netWaits = 0, fastRetried = false; !c;) {
          if (loadCtl?.signal?.aborted || this._loadGen !== loadGen) throw Object.assign(new Error('加载已切换'), { name: 'AbortError' });
          try {
            const reqTimeout = (waits === 0 && netWaits === 0 && !fastRetried) ? 35000 : 45000;
            const isTrackedRunLoad = Boolean(this._startupResuming || this._wasTrackedRunning || (typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(this.sid)));
            const chatQuery = (!this.busy && !(this.streaming && !this.peeking))
              ? '?includeStreamToken=false&recoverRun=false'
              : '?includeStreamToken=false';
            const effChatQuery = (this._recoveringIncomplete || isTrackedRunLoad) ? '?includeStreamToken=false' : chatQuery;
            c = await api('/api/chat/' + this.sid + effChatQuery, { timeout: reqTimeout, noApiRetry: true, allowDirectFallback: true, onProgress, ...(loadCtl?.signal ? { signal: loadCtl.signal } : {}) });
          } catch (e) {
            if (loadCtl?.signal?.aborted || this._loadGen !== loadGen) throw e;
            if (!fastRetried && waits === 0 && netWaits === 0 && !e?.status && (e?.routeTimeout || /超时|failed to fetch|fetch failed|network|ERR_|socket|eof|reset|closed/i.test(String(e?.message || e)))) {
              fastRetried = true;
              continue;
            }
            if (!e?.status && netWaits < 2 && /failed to fetch|fetch failed|network|ERR_|socket|eof|reset|closed/i.test(String(e?.message || e))) {
              netWaits++;
              await sleep(800 * netWaits);
              continue;
            }
            if (e?.status !== 429) throw e;
            if (await this.streamDirectFallback({ fromLoad: true })) {
              this.loadBytes = 0;
              return;
            }
            if (waits >= 3 || (e.retryAfterMs || 0) > 60000) throw e;
            const wait = Math.round(Math.max(e.retryAfterMs || 0, 3000 * 2 ** waits) * (0.9 + Math.random() * 0.2)); waits++;
            this.error = '请求过于频繁（429），' + Math.ceil(wait / 1000) + ' 秒后自动重试…'; this.emit(); await sleep(wait);
          }
        }
        this.loadBytes = 0;
        const wasCached = this.cached; this.cached = false;
        // 打开对话时顺便同步列表里的名称（别的设备改名 / 校准后，不用来回切换多次才更新）
        { const t = c?.title ?? c?.chat?.title, row = typeof History !== 'undefined' ? History.byId(this.sid) : null; if (typeof t === 'string' && t && row && row.title !== t) { row.title = t; const miNow = typeof Models !== 'undefined' ? Models.get(this.sid) : null; if (miNow?.name && !miNow.pendingConfirm && (!miNow.guess || miNow.userCorrected || miNow.habitInferred || miNow.reverseInferred || miNow.billingProbe) && typeof Titles !== 'undefined' && Titles.local) Titles.local(this.sid); else delete row.localTitle; History.saveSoon(); Bus.emit('history'); } }
        // 加载期间自己刚发出的消息（服务端还没有）保留在末尾，不被覆盖；替换掉缓存内容时强制重绘
        const nextVer = (this._msgVerSeq = (this._msgVerSeq || 1) + 1);
        const srv = (c.messages || []).filter(m => !this._prunedDeadMsgIds?.has?.(m?.id)).map(m => ({ ...m, v: wasCached ? nextVer : (nextVer - 1) })), ids = new Set(srv.map(m => m.id));
        if (!srv.length && this.messages.length) {
          // 服务端未返回有效消息时保留本地已缓存的正文，绝不清空
        } else if (this.messages.length && !wasCached && typeof this.mergeServer === 'function') this.mergeServer(srv, this.live);
        else {
          const byOld = new Map(this.messages.filter(m => m?.id).map(m => [m.id, m]));
          const oldAssts = this.messages.filter(m => m && m.role === 'assistant');
          const srvAssts = srv.filter(m => m && m.role === 'assistant');
          let asstOrd = 0;
          const firstSrvId = srv[0]?.id;
          const firstSrvIdx = firstSrvId ? this.messages.findIndex(m => m?.id === firstSrvId) : -1;
          const olderPrefix = firstSrvIdx > 0 ? this.messages.slice(0, firstSrvIdx).filter(m => m && !m._local && !ids.has(m.id)) : [];
          const normUText = m => (m?.parts || []).filter(p => p?.type === 'text').map(p => String(p.text || '')).join('').replace(/\s+/g, ' ').trim();
          const srvUserNodes = new Set(srv.filter(m => m?.role === 'user').map(m => m.metadata?.nodeId).filter(Boolean));
          const srvUserTexts = new Set(srv.filter(m => m?.role === 'user').map(normUText).filter(Boolean));
          const oldAsstWeightsForLoad = new Map();
          for (const om of this.messages) if (om?.role === 'assistant' && om.id && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) oldAsstWeightsForLoad.set(om.id, SentUserLog.measureAsstWeight(om));
          const srvLastMsgForLoad = srv.at(-1);
          const srvLastExplicitDoneForLoad = Boolean(srvLastMsgForLoad?.metadata?.timing?.completedAt || srvLastMsgForLoad?.metadata?.finishReason === 'stop' || srvLastMsgForLoad?.metadata?.finishReason === 'end-turn' || srvLastMsgForLoad?.metadata?.aborted || srvLastMsgForLoad?.metadata?.error);
          const srvLastIsRunningForLoad = Boolean(srvLastMsgForLoad?.role === 'assistant' && !srvLastExplicitDoneForLoad && (srvLastMsgForLoad.metadata?.pending || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(srvLastMsgForLoad))));
          const srvLastCompForLoad = srvLastMsgForLoad?.metadata?.timing?.completedAt || srvLastMsgForLoad?.metadata?.timing?.startedAt;
          const srvLastCompMsForLoad = typeof srvLastCompForLoad === 'number' ? srvLastCompForLoad : (typeof srvLastCompForLoad === 'string' ? Date.parse(srvLastCompForLoad) : 0);
          const srvLastTimeForLoad = Math.max(idTime(srvLastMsgForLoad?.id) || 0, Number.isFinite(srvLastCompMsForLoad) ? srvLastCompMsForLoad : 0);
          const mergedSrv = srv.map(m => {
            const curAsstIdx = m?.role === 'assistant' ? asstOrd++ : -1;
            const o = byOld.get(m.id) || (curAsstIdx >= 0 && oldAssts.length === srvAssts.length ? oldAssts[curAsstIdx] : null);
            const msgVer = Math.max(nextVer, (o?.v || 0) + 1);
            if (!o) return { ...m, v: msgVer };
            let mergedParts = m.parts;
            if (o.role === 'assistant' && Array.isArray(o.parts) && Array.isArray(m.parts)) {
              const oToolCnt = o.parts.filter(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-'))).length;
              const mToolCnt = m.parts.filter(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-'))).length;
              if (oToolCnt > mToolCnt || (o.parts.length > m.parts.length && (m.metadata?.pending || o.metadata?.pending || o._incomplete))) {
                const srvByTool = new Map();
                for (const sp of m.parts) if (sp?.toolCallId) srvByTool.set(sp.toolCallId, sp);
                mergedParts = o.parts.map(lp => {
                  if (!lp) return lp;
                  if (lp.toolCallId && srvByTool.has(lp.toolCallId)) {
                    const sp = srvByTool.get(lp.toolCallId);
                    srvByTool.delete(lp.toolCallId);
                    if (sp.output !== undefined && lp.output === undefined) return { ...lp, ...sp, state: sp.state || 'output-available' };
                    return { ...sp, ...lp, output: lp.output !== undefined ? lp.output : sp.output, state: lp.state === 'output-available' ? 'output-available' : (sp.state || lp.state) };
                  }
                  return lp;
                });
                for (const sp of srvByTool.values()) mergedParts.push(sp);
              } else {
                const localReason = o.parts.filter(p => p && p.type === 'reasoning');
                const srvHasReason = m.parts.some(p => p && p.type === 'reasoning');
                if (localReason.length && !srvHasReason) mergedParts = [...localReason, ...m.parts];
                const localNonEmptyReason = localReason.filter(p => p.text);
                const localTools = new Map(o.parts.filter(p => p?.toolCallId).map(p => [p.toolCallId, p]));
                let rTextIdx = 0;
                const lIds = { reasoning: o.parts.filter(p => p?.type === 'reasoning' && p.id), text: o.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
                mergedParts = mergedParts.map(sp => {
                  if (!sp) return sp;
                  if (sp.toolCallId && localTools.has(sp.toolCallId)) {
                    const lt = localTools.get(sp.toolCallId);
                    return { ...lt, ...sp, output: sp.output !== undefined ? sp.output : lt.output, state: sp.output !== undefined ? (sp.state || 'output-available') : (lt.state === 'output-available' ? 'output-available' : (sp.state || lt.state)) };
                  }
                  let outP = (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp;
                  if (outP.type === 'reasoning' && !outP.text && localNonEmptyReason[rTextIdx]?.text) {
                    const lr = localNonEmptyReason[rTextIdx++];
                    outP = { ...outP, text: lr.text, id: outP.id || lr.id };
                  }
                  return outP;
                });
              }
            }
            const extra = { v: msgVer };
            if (o._fmt || m._fmt) extra._fmt = o._fmt || m._fmt;
            if (o._sseMeta || m._sseMeta) extra._sseMeta = o._sseMeta || m._sseMeta;
            if (o._sentAt || m._sentAt) extra._sentAt = o._sentAt || m._sentAt;
            if (!m.metadata?.pending && (o._finishedAt || m._finishedAt)) extra._finishedAt = o._finishedAt || m._finishedAt;
            if (o._turnModelLabel || m._turnModelLabel) extra._turnModelLabel = o._turnModelLabel || m._turnModelLabel;
            if (o._incomplete && (m === srv.at(-1) || m.metadata?.pending)) extra._incomplete = true;
            if (o._appendAccepted || m._appendAccepted) extra._appendAccepted = true;
            if (o._prevAsstId || m._prevAsstId) extra._prevAsstId = o._prevAsstId || m._prevAsstId;
            return { ...m, parts: mergedParts, ...extra };
          });
          let lastSrvInOldIdx = -1;
          for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i]?.id && ids.has(this.messages[i].id)) { lastSrvInOldIdx = i; break; }
          }
          const localPending = this.messages.filter((m, idx) => {
            if (!m || ids.has(m.id)) return false;
            if (m.failed) {
              if (m.role === 'user') {
                const uTime = m._sentAt || idTime(m.id) || 0;
                const ut = normUText(m);
                const pIdx = m._prevAsstId ? srv.findIndex(x => x && x.id === m._prevAsstId) : (srvLastMsgForLoad?.role === 'assistant' ? srv.length - 1 : -1);
                const srvAfterP = pIdx >= 0 ? srv.slice(pIdx + 1) : srv;
                const inSrv = ut && srvAfterP.some(x => x?.role === 'user' && normUText(x) === ut);
                const hasSrvUserAfterP = pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'user');
                const hasNewAsstAfterP = pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'assistant' && x.id !== m._prevAsstId);
                const targetAsst = pIdx >= 0 ? srv[pIdx] : null;
                const tCompRaw = targetAsst?.metadata?.timing?.completedAt;
                const tCompMs = typeof tCompRaw === 'number' ? tCompRaw : (typeof tCompRaw === 'string' ? Date.parse(tCompRaw) : 0);
                const targetAsstEndTime = Math.max(idTime(targetAsst?.id) || 0, Number.isFinite(tCompMs) ? tCompMs : 0, targetAsst?._finishedAt || 0);
                const oldW = targetAsst ? (m._prevAsstWeight ?? oldAsstWeightsForLoad.get(targetAsst.id) ?? null) : null;
                const newW = (targetAsst && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(targetAsst) : 0;
                const targetSupplemented = Boolean(targetAsst && !hasSrvUserAfterP && !hasNewAsstAfterP && ((oldW != null && newW > oldW) || (targetAsstEndTime > 0 && uTime > 0 && targetAsstEndTime >= uTime + 1000 && (idTime(targetAsst.id) || 0) <= uTime + 5000)));
                if (!inSrv && !hasSrvUserAfterP && !hasNewAsstAfterP && (srvLastIsRunningForLoad || this.busy || this.streaming || this.live || targetSupplemented)) {
                  try { SentUserLog.demoteToQueue?.(this, m, { silent: true, running: srvLastIsRunningForLoad }); } catch {}
                  return false;
                }
                if (!inSrv && idx === this.messages.length - 1 && (!srvLastTimeForLoad || !uTime || uTime >= srvLastTimeForLoad - 30000)) return true;
              }
              try { SentUserLog.remove?.(this.sid, m.id); } catch {}
              return false;
            }
            const isAheadOfSrv = idx > lastSrvInOldIdx;
            const prevInOld = idx > 0 ? this.messages[idx - 1] : null;
            const isCachedActiveTailAsst = m.role === 'assistant' && idx === this.messages.length - 1 && (mergedSrv.at(-1)?.role === 'user' || prevInOld?.role === 'user' || isAheadOfSrv) && (m.metadata?.pending || m._incomplete || (Array.isArray(m.parts) && m.parts.some(p => p && (p.toolCallId || p.text))));
            const isRecentTailUser = m.role === 'user' && (idx > lastSrvInOldIdx || idx >= this.messages.length - 2) && (m._appendAccepted || isAheadOfSrv || (this.messages[idx + 1]?.role === 'assistant' && (ids.has(this.messages[idx + 1]?.id) || this.messages[idx + 1]?._incomplete || this.messages[idx + 1]?.metadata?.pending)));
            if (!m._local && !m._appendAccepted && !isRecentTailUser && !isCachedActiveTailAsst) return false;
            if (m.role === 'user') {
              if (m.metadata?.nodeId && (ids.has(m.metadata.nodeId) || srvUserNodes.has(m.metadata.nodeId))) return false;
              if (srvUserNodes.has(m.id)) return false;
              const ut = normUText(m);
              const isAwaitingThis = Boolean(this.awaitId && (this.awaitId === m.id || this.awaitId === m.metadata?.nodeId) && (this.busy || this.sending || this.preSend));
              const uTime = m._sentAt || idTime(m.id) || 0;
              const pIdxInSrv = m._prevAsstId ? mergedSrv.findIndex(x => x && x.id === m._prevAsstId) : (srvLastMsgForLoad?.role === 'assistant' ? mergedSrv.length - 1 : -1);
              const srvScopeForU = pIdxInSrv >= 0 ? mergedSrv.slice(pIdxInSrv + 1) : mergedSrv;
              if (ut && srvScopeForU.some(sm => sm?.role === 'user' && normUText(sm) === ut && (pIdxInSrv >= 0 || !uTime || !idTime(sm.id) || Math.abs(uTime - (sm._sentAt || idTime(sm.id) || 0)) < 3600000))) return false;
              const hasSrvUserAfterP = pIdxInSrv >= 0 && mergedSrv.slice(pIdxInSrv + 1).some(x => x && x.role === 'user');
              const hasNewAsstAfterP = pIdxInSrv >= 0 && mergedSrv.slice(pIdxInSrv + 1).some(x => x && x.role === 'assistant' && x.id !== m._prevAsstId);
              const targetAsst = pIdxInSrv >= 0 ? mergedSrv[pIdxInSrv] : null;
              const tCompRaw = targetAsst?.metadata?.timing?.completedAt;
              const tCompMs = typeof tCompRaw === 'number' ? tCompRaw : (typeof tCompRaw === 'string' ? Date.parse(tCompRaw) : 0);
              const targetAsstEndTime = Math.max(idTime(targetAsst?.id) || 0, Number.isFinite(tCompMs) ? tCompMs : 0, targetAsst?._finishedAt || 0);
              const tExplicitDone = Boolean(targetAsst?.metadata?.timing?.completedAt || targetAsst?.metadata?.finishReason === 'stop' || targetAsst?.metadata?.finishReason === 'end-turn' || targetAsst?.metadata?.aborted || targetAsst?.metadata?.error);
              const targetAsstIsRunning = Boolean(targetAsst && !tExplicitDone && (targetAsst.metadata?.pending || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(targetAsst))));
              const oldW = targetAsst ? (m._prevAsstWeight ?? oldAsstWeightsForLoad.get(targetAsst.id) ?? null) : null;
              const newW = (targetAsst && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(targetAsst) : 0;
              const targetSupplemented = Boolean(targetAsst && !hasSrvUserAfterP && !hasNewAsstAfterP && ((oldW != null && newW > oldW) || (targetAsstEndTime > 0 && uTime > 0 && targetAsstEndTime >= uTime + 1000 && (idTime(targetAsst.id) || 0) <= uTime + 5000)));
              const prevTurnStillRunning = m._prevAsstId ? targetAsstIsRunning : (srvLastIsRunningForLoad && !m._appendAccepted);
              if (!hasSrvUserAfterP && !hasNewAsstAfterP && !(isAwaitingThis && (this.preSend || this.sending || this.oursAt || this.dlv === 'taken' || m._appendAccepted)) && (targetSupplemented || (prevTurnStillRunning && (!isAwaitingThis || !this.oursAt)))) {
                try { SentUserLog.demoteToQueue?.(this, m, { silent: true, running: srvLastIsRunningForLoad }); } catch {}
                return false;
              }
              if (!isAwaitingThis && srvLastTimeForLoad > 0 && uTime > 0 && uTime < srvLastTimeForLoad - 30000) {
                const srvLastStartForLoad = idTime(srvLastForLoad?.id) || Date.parse(srvLastForLoad?.metadata?.timing?.startedAt || '') || 0;
                const fillsLoadGap = (pIdxInSrv >= 0 && mergedSrv[pIdxInSrv + 1]?.role === 'assistant') || (mergedSrv.length >= 2 && mergedSrv.at(-1)?.role === 'assistant' && mergedSrv.at(-2)?.role === 'assistant') || (srvLastStartForLoad > 0 && uTime >= srvLastStartForLoad - 60000);
                if (!fillsLoadGap) return false;
              }
            }
            return true;
          });
          const nextMsgs = [...olderPrefix, ...mergedSrv];
          for (let lIdx = 0; lIdx < localPending.length; lIdx++) {
            const lm = localPending[lIdx];
            if (lm.role === 'user' && lm._prevAsstId) {
              const pIdx = nextMsgs.findIndex(x => x && x.id === lm._prevAsstId);
              if (pIdx >= 0 && nextMsgs[pIdx + 1]?.role !== 'user') {
                nextMsgs.splice(pIdx + 1, 0, lm);
                continue;
              }
            }
            const hasAsstAfterInLocal = localPending.slice(lIdx + 1).some(x => x && x.role === 'assistant');
            if (lm.role === 'user' && !lm._held && !hasAsstAfterInLocal && nextMsgs.at(-1)?.role === 'assistant') {
              const lastA = nextMsgs.at(-1);
              const prevBeforeA = nextMsgs.length >= 2 ? nextMsgs[nextMsgs.length - 2] : null;
              const missingUserBeforeA = !prevBeforeA || prevBeforeA.role === 'assistant';
              const isAwaitingThisUser = Boolean(this.awaitId && (this.awaitId === lm.id || this.awaitId === lm.metadata?.nodeId));
              const uTime = lm._sentAt || idTime(lm.id) || 0;
              const aTime = idTime(lastA.id) || 0;
              if (missingUserBeforeA || ((lastA.metadata?.pending || lastA._incomplete || (this.live && lastA === this.live)) && (isAwaitingThisUser || !uTime || !aTime || aTime >= uTime - 300000))) {
                nextMsgs.splice(nextMsgs.length - 1, 0, lm);
                continue;
              }
            }
            nextMsgs.push(lm);
          }
          this.messages = nextMsgs;
          try { SentUserLog.restoreInto(this, { srvPend: srvLastIsRunningForLoad }); } catch {}
          try { if (typeof MsgCache !== 'undefined' && typeof MsgCache.sanitize === 'function') MsgCache.sanitize(this.messages); } catch {}
          if ((typeof SentUserLog !== 'undefined' && SentUserLog.hasAdjacentAsstGap && SentUserLog.hasAdjacentAsstGap(this.messages))) {
            setTimeout(() => { try { void this.reconcile(0); } catch {} }, 60);
          }
        }
        this.hasMore = !!c.pagination?.hasMore; this.cursor = c.pagination?.cursor || null;
        if (c.triggerAddress || c.session?.triggerAddress) this.triggerAddress = c.triggerAddress || c.session.triggerAddress;
        if (c.taskId || c.session?.taskId) this.taskId = c.taskId || c.session.taskId;
        this.setToken(c.publicAccessToken || c.session?.publicAccessToken);
        const sending = Boolean((this.awaitId || this.preSend || this.sending) && this.busy && this.messages.some(m => m._local));   // 载入完成前就发了消息：别打乱发送流程
        if (!(sending && this.awaitId) && c.lastEventId != null) this.lastSeq = String(c.lastEventId);
        if (this._cachedLastSeq && (!this.lastSeq || +this._cachedLastSeq > +this.lastSeq)) this.lastSeq = String(this._cachedLastSeq);
        const hasFailedTailBeforeLoadEnd = Boolean(this.messages.at(-1)?.role === 'user' && this.messages.at(-1)?.failed);
        this.loaded = true; if (!hasFailedTailBeforeLoadEnd) this.error = null;
        try {
          if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(this);
        } catch {}
        try { ExtCompat.replayChat(this); } catch {}
        const wasRecoveringInc = Boolean(this._recoveringIncomplete || this._startupResuming || (typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(this.sid)));
        this._recoveringIncomplete = false;
        this._startupResuming = false;
        const last = srv.at(-1); // a failed local input is not evidence that the server is generating
        if (last?.role === 'assistant' && last.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)) && !Hitl.idleWait(this)) {
          for (let i = this.messages.length - 1; i >= 0; i--) {
            const tm = this.messages[i];
            if (!tm) continue;
            if (tm.role === 'assistant') break;
            const isPrevAsstRunning = !tm._prevAsstId || tm._prevAsstId === last.id;
            if (tm.role === 'user' && isPrevAsstRunning && (tm.failed || (tm._local && !tm._appendAccepted && !ids.has(tm.id) && !(sending && this.awaitId === tm.id)))) {
              try { SentUserLog.demoteToQueue?.(this, tm, { silent: true, running: true }); } catch {}
            }
          }
        }
        const tailMsgNow = this.messages.at(-1);
        const tailHasOpenTool = Boolean(tailMsgNow?.role === 'assistant' && Array.isArray(tailMsgNow.parts) && tailMsgNow.parts.some(p => p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')));
        // 停在提问卡片上等回答的那条也是 pending：它不是「正在回复」，不能当成忙（否则提交按钮一直不可用）
        let pend = ((!!last && (last.role === 'user' || (last.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last))))) || Boolean(tailMsgNow?.role === 'assistant' && (tailMsgNow.metadata?.pending || tailMsgNow._incomplete || (wasRecoveringInc && tailHasOpenTool)) && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tailMsgNow)))) && !(last?.role === 'assistant' && Hitl.idleWait(this)) && !Hitl.idleWait(this);
        if (!pend && wasRecoveringInc && tailMsgNow && !Hitl.idleWait(this) && c.lastEventId != null) {
          const tailCompleted = Boolean(tailMsgNow.metadata?.timing?.completedAt || tailMsgNow.metadata?.aborted || tailMsgNow.metadata?.error || tailMsgNow.metadata?.finishReason === 'stop' || tailMsgNow.metadata?.finishReason === 'end-turn');
          if (!tailCompleted || tailHasOpenTool) {
            if (tailMsgNow.role === 'assistant') {
              this.live = tailMsgNow;
              this.parts.clear();
              (tailMsgNow.parts || []).forEach(p => {
                if (!p) return;
                if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
                if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
              });
            }
            const baseSeq = (this._cachedLastSeq != null && +this._cachedLastSeq < +c.lastEventId) ? +this._cachedLastSeq : Math.max(0, +c.lastEventId - 1200);
            this.lastSeq = String(baseSeq);
            const dProbe = await this.drain(950, { targetSeq: c.lastEventId }).catch(() => null);
            const stillOpenTool = Boolean(this.live && Array.isArray(this.live.parts) && this.live.parts.some(p => p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')));
            if (dProbe?.open || dProbe?.run || (stillOpenTool && !this.finAt && !tailCompleted)) {
              pend = true;
              if (this.live) {
                delete this.live._finishedAt;
                delete this.live._forcedFinish;
                this.live.metadata = { ...(this.live.metadata || {}), pending: true };
              }
            } else {
              this.lastSeq = String(c.lastEventId);
              this.fence = +c.lastEventId;
              this.live = null;
              this.parts.clear();
            }
          }
        }
        for (const m of this.messages) {
          if (m?.role === 'assistant' && (!pend || m !== tailMsgNow)) {
            delete m._incomplete;
            delete m._forcedFinish;
          }
        }
        for (const m of this.messages) {
          if (m?.role !== 'assistant') continue;
          const isActiveTail = Boolean(pend && m === tailMsgNow);
          if (m.metadata?.pending && !isActiveTail) m.metadata = { ...m.metadata, pending: false };
          if (isActiveTail && !m.metadata?.pending) m.metadata = { ...(m.metadata || {}), pending: true };
          if (!m.metadata?.pending) {
            if (!m._finishedAt) m._finishedAt = Date.parse(m.metadata?.timing?.completedAt || m.createdAt || '') || idTime(m.id) || now();
            if (Array.isArray(m.parts)) {
              for (const p of m.parts) {
                if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                  p.state = 'output-error';
                  if (!p.errorText) p.errorText = '未返回结果';
                }
              }
            }
          }
        }
        if (typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
        if (sending) this.srvBusy = pend;
        else if (pend) {
          this.status = 'streaming'; this.phase = '接收回复中';
          const curTail = this.messages.at(-1);
          if (curTail?.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(curTail))) {
            this.live = curTail;
            this.parts.clear();
            (curTail.parts || []).forEach(p => {
              if (!p) return;
              if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
              if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
            });
          } else {
            this.live = null; this.parts.clear();
          }
        } else {
          if (this.live && !sending) {
            delete this.live._incomplete;
            delete this.live._forcedFinish;
            if (this.live.metadata) this.live.metadata.pending = false;
            this.live = null;
            this.parts.clear();
          }
          const tailFailedU = this.messages.at(-1)?.role === 'user' && this.messages.at(-1)?.failed ? this.messages.at(-1) : null;
          this.status = tailFailedU ? 'error' : 'idle';
          if (tailFailedU && !this.error) this.error = '上一条消息未发出（服务器未收到），请点击重试';
          this.phase = ''; this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || null;
          const tailA = this.messages.at(-1);
          const tailCompRaw = tailA?.metadata?.timing?.completedAt;
          const tailCompMs = typeof tailCompRaw === 'number' ? tailCompRaw : (typeof tailCompRaw === 'string' ? Date.parse(tailCompRaw) : 0);
          const tailFinAt = Math.max(tailA?._finishedAt || 0, Number.isFinite(tailCompMs) ? tailCompMs : 0, this.endAt || 0, idTime(tailA?.id) || 0);
          if (tailA?.role === 'assistant' && !tailA.metadata?.pending && tailFinAt && (!this.endAt || tailFinAt > this.endAt)) {
            this.endAt = tailFinAt;
          }
          if (!tailFailedU && typeof SendQ !== 'undefined' && (SendQ.of?.(this)?.length || (this.queue || []).length)) {
            setTimeout(() => { try { SendQ.check(this); } catch {} }, 50);
          }
          if (tailA?.role === 'assistant' && !this.stopReq && !this.midTurnStall && (wasRecoveringInc || !tailFinAt || now() - tailFinAt < 90000)) {
            const st = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, tailA) : null;
            if (st) { this.endAt = this.endAt || (tailFinAt && now() - tailFinAt < 90000 ? tailFinAt : now()); this.midTurnStall = { at: this.endAt, why: st.why, key: st.key }; }
          }
        }
        this.emit();
        // 刷新 / 重新载入时服务器上有一轮正在跑：若本地缓存已有本轮进度与游标，直接基于缓存游标增量续接；无缓存游标才回退重放
        if (pend && !sending && !this.gacha) {
          const cachedSeq = this._cachedLastSeq || this.lastSeq;
          const hasCachedLiveParts = Boolean(this.live && Array.isArray(this.live.parts) && this.live.parts.length > 0 && cachedSeq != null);
          this.lastSeq = hasCachedLiveParts
            ? String(cachedSeq)
            : (c.lastEventId != null ? String(Math.max(0, +c.lastEventId - 4000)) : (cachedSeq != null ? String(cachedSeq) : null));
          if (hasCachedLiveParts) {
            this.fence = null;
          } else {
            await Promise.race([this.drain(2500, { keepIfFinished: true }).catch(() => null), sleep(700)]);
            if (this.lastSeq == null && (cachedSeq != null || c.lastEventId != null)) this.lastSeq = String(cachedSeq ?? c.lastEventId);
          }
        }
        this.stream({ peek: !pend || sending });
        // 更早的消息不再打开就全部拉下来（以前一个长对话会连发几十上百个请求）：滚动到顶部 / 点「加载更早的消息」时才加载，和网页一致
        if (!this.hasMore) setTimeout(() => { try { FingerprintReview?.auto?.(this); } catch {} }, 600);   // 没有指纹信息的对话：按历史里的指纹测试自动校准
      } catch (e) {
        if (this._loadGen !== loadGen) return this.loading;
        if (e?.status === 404 && typeof EvalEngine !== 'undefined' && !this._evalFallbackTried) {
          this._evalFallbackTried = true;
          try {
            this.loading = null;
            await EvalEngine.loadChat(this, true);
            if (this.isEvaluation && this.loaded) return;
          } catch {}
        }
        if (!this.messages.length && !this.gacha) {
          const cached = await MsgCache.get(this.sid).catch(() => null);
          if (cached?.isEvaluation) { this.isEvaluation = true; if (cached.evalMode) this.evalMode = cached.evalMode; }
          if (cached?.messages?.length) {
            this.messages = cached.messages.map(m => ({ ...m, v: 0 }));
            this.hasMore = !!cached.more;
          }
        }
        this._recoveringIncomplete = false;
        this._startupResuming = false;
        if (this.messages.length) {
          if (!this.awaitId && !this.preSend && !this.sending && this.status === 'streaming' && !this.live) {
            this.status = 'idle';
            this.phase = '';
          }
          this.cached = false; this.loaded = true; this.error = null; this.emit();
          if (!this.isEvaluation && !(typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
            setTimeout(() => { if (this.loaded && !this.busy) this.quickSync?.(true); }, 3500);
          }
          return;
        }
        if (e.status === 404) {
          try {
            const hRow = typeof History !== 'undefined' ? History.byId?.(this.sid) : null;
            if (hRow && (hRow._localRecovered || /^本地缓存对话(\s|$)/i.test(String(hRow.title || '').trim()))) {
              if (typeof LocalCache !== 'undefined' && LocalCache.drop) LocalCache.drop([this.sid]);
              if (typeof History !== 'undefined' && History.bury) History.bury([this.sid]);
            }
          } catch {}
        }
        this.error = e.status === 404 ? '对话不存在或已删除' : e.status === 429 ? '加载失败：请求过于频繁（429），已按服务器要求等待重试仍被限流' + ((e.retryAfterMs || 0) > 0 ? '，服务端要求等待约 ' + Math.ceil(e.retryAfterMs / 1000) + ' 秒' : '') + '；稍等一会儿点刷新' : '加载失败：' + e.message; this.emit(); throw e;
      }
      finally { if (this._loadGen === loadGen || this.loading === myLoadP) { this.loading = null; this._loadCtl = null; } }
    })());
  }
  // 增量查漏补缺（不清空本地数百个已加载工具和消息，只按游标和 toolCallId 补齐缺失输出并续接实时流）
  async resumeIncremental(why) {
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
      if (this.busy && this._evalStreaming) return true;
      if (why === 'fast-return' || why === '手动重新载入') {
        try { await EvalEngine.loadChat(this, true); return true; } catch { return false; }
      }
      return true;
    }
    if (!this.loaded || !this.messages.length) return this.reload(why, true);
    const wasBusy = this.busy, wasFake = this.fakeEnd, prevSeq = this.lastSeq != null ? +this.lastSeq : null;
    this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
    this.fakeEnd = null; this.midTurnStall = null; this.errAt = 0; this.reloadAt = now(); this.reloadWhy = why || '';
    const last = this.messages.at(-1);
    const lastExplicitlyDone = Boolean(last?.metadata?.timing?.completedAt || last?.metadata?.finishReason === 'stop' || last?.metadata?.finishReason === 'end-turn' || last?.metadata?.aborted || last?.metadata?.error);
    const canReviveLast = Boolean(last && last.role === 'assistant' && !last.metadata?.aborted && !last.metadata?.openThinkStopped && last.metadata?.feedback?.interruption !== 'stop' && (
      last.metadata?.pending ||
      last._incomplete ||
      (this.cached && !lastExplicitlyDone && typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(last)) ||
      (!lastExplicitlyDone && typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(last)) ||
      last._forcedFinish
    ) && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last) && !last._forcedFinish));
    if (canReviveLast && wasBusy) {
      this.live = last;
      this.parts.clear();
      (last.parts || []).forEach(p => {
        if (!p) return;
        if (p.toolCallId) {
          this.parts.set('tool:' + p.toolCallId, p);
          if (p.state === 'output-error' && (p.errorText === '未返回结果' || p._interruptedPending)) { p.state = 'input-available'; delete p.errorText; delete p._interruptedPending; }
        }
        if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
      });
    } else if (!wasBusy) {
      this.live = null;
      this.parts.clear();
    }
    if (wasBusy) { this.status = 'streaming'; this.phase = '增量同步'; this.emit(); }
    try {
      const needRecover = Boolean(wasBusy || wasFake || why || canReviveLast);
      const incQuery = needRecover ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      let got404 = false, got429 = false;
      const c = await api('/api/chat/' + this.sid + incQuery, { timeout: 35000, noApiRetry: true, allowDirectFallback: true }).catch(err => { if (err?.status === 404) got404 = true; if (err?.status === 429) got429 = true; return null; });
      if (!c && got429 && await this.streamDirectFallback({ fromResume: true })) return true;
      if (got404 && typeof EvalEngine !== 'undefined' && !this._evalFallbackTried) {
        this._evalFallbackTried = true;
        try {
          await EvalEngine.loadChat(this, true);
          if (this.isEvaluation) return true;
        } catch {}
      }
      if (c?.messages?.length) {
        const ch = this.mergeServer(c.messages, null);
        if (c.triggerAddress || c.session?.triggerAddress) this.triggerAddress = c.triggerAddress || c.session.triggerAddress;
        if (c.taskId || c.session?.taskId) this.taskId = c.taskId || c.session.taskId;
        if (c.publicAccessToken || c.session?.publicAccessToken) this.setToken(c.publicAccessToken || c.session?.publicAccessToken);
        if (!this.gacha && typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
        const srvLast = c.messages.at(-1);
        const curLast = this.messages.at(-1);
        const hasNewEvents = c.lastEventId != null && prevSeq != null && +c.lastEventId > prevSeq;
        const srvMore = Boolean(c.more || c.session?.more);
        const staleFakePend = !wasBusy && !!wasFake && srvLast?.role === 'assistant' && srvLast.id === last?.id && !hasNewEvents && !srvMore && !ch;
        const dbLaggedBehindLive = wasBusy && ((this._srvLagged && !staleFakePend) || (curLast && srvLast && curLast.id !== srvLast.id));
        const srvPend = dbLaggedBehindLive || srvMore || (!staleFakePend && !!srvLast && (srvLast.role === 'user' || (srvLast.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(srvLast)))) && !(srvLast.role === 'assistant' && Hitl.idleWait(this)));
        const curHasOpenTool = Boolean(curLast?.role === 'assistant' && Array.isArray(curLast.parts) && curLast.parts.some(p => p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')));
        const curExplicitlyDone = Boolean(curLast?.metadata?.timing?.completedAt || curLast?.metadata?.finishReason === 'stop' || curLast?.metadata?.finishReason === 'end-turn' || curLast?.metadata?.aborted || curLast?.metadata?.error);
        if ((srvPend || hasNewEvents || curHasOpenTool || (canReviveLast && !curExplicitlyDone)) && curLast && curLast.role === 'assistant' && (!(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(curLast)) || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(curLast)))) {
          this.live = curLast;
          this.parts.clear();
          (curLast.parts || []).forEach(p => {
            if (!p) return;
            if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          });
        } else {
          this.live = null;
          this.parts.clear();
        }
        if (!srvPend && (hasNewEvents || curHasOpenTool || (canReviveLast && !curExplicitlyDone)) && c.lastEventId != null) {
          this.lastSeq = String(Math.max(0, (prevSeq != null && prevSeq < +c.lastEventId) ? prevSeq : +c.lastEventId - 1200));
          const d = await this.drain(850, { targetSeq: c.lastEventId }).catch(() => null);
          const liveHasOpenTool = Boolean(this.live && Array.isArray(this.live.parts) && this.live.parts.some(p => p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')));
          if (d?.open || d?.run || (liveHasOpenTool && !this.finAt && !curExplicitlyDone)) {
            if (this.live) { delete this.live._finishedAt; delete this.live._forcedFinish; this.live.metadata = { ...(this.live.metadata || {}), pending: true }; }
            this.status = 'streaming'; this.phase = '接收回复中'; this.emit();
            this.stream({ peek: false });
            return true;
          }
          this.lastSeq = String(c.lastEventId);
          this.fence = +c.lastEventId;
        }
        if (!srvPend) {
          if (c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = +c.lastEventId; }
          let hadOpenTool = false;
          if (this.live && Array.isArray(this.live.parts)) {
            for (const p of this.live.parts) {
              if (p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) {
                p.state = 'output-error'; p.errorText = '未返回结果'; hadOpenTool = true;
              }
            }
          }
          if (!hadOpenTool && srvLast?.role === 'assistant' && !srvLast.metadata?.pending) {
            this.finAt = this.finAt || now();
            this.realTcAt = this.realTcAt || now();
          }
          this.finishTurn(this.runTok || null, true);
          if (!this.midTurnStall && !this.stopReq && !Hitl.idleWait(this)) {
            const st = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, curLast) : null;
            if (st) {
              this.midTurnStall = {
                at: now(),
                why: st.why || '假结束自动续接',
                key: st.key || ('fake-cont|' + (curLast?.id || '') + '|' + (curLast?.parts?.length || 0)),
              };
            }
          }
          return true;
        }
        this.status = 'streaming'; this.phase = '接收回复中'; this.emit();
        if ((!wasBusy || why === 'fast-return' || why === '手动重新载入') && c.lastEventId != null) {
          const hasLiveParts = Boolean(this.live && Array.isArray(this.live.parts) && this.live.parts.length > 0 && prevSeq != null && prevSeq > 0);
          if (hasLiveParts && prevSeq <= +c.lastEventId && why !== '手动重新载入') {
            this.lastSeq = String(prevSeq);
            this.fence = null;
          } else {
            this.lastSeq = String(Math.max(0, +c.lastEventId - 4000));
            await Promise.race([this.drain(2000, { keepIfFinished: true }).catch(() => null), sleep(600)]);
            if (this.lastSeq == null) this.lastSeq = String(c.lastEventId);
          }
        }
      } else if (!wasBusy) {
        if (last && last.role === 'assistant') last.metadata = { ...(last.metadata || {}), pending: false };
        this.live = null; this.parts.clear(); this.status = 'idle'; this.phase = ''; this.emit();
        if (c && !got404) this.stream({ peek: true });
        return true;
      }
      if (wasBusy && this.lastSeq != null && +this.lastSeq > 2) this.lastSeq = String(Math.max(0, +this.lastSeq - 2));
      if (!got404) this.stream({ peek: false });
      return true;
    } catch {
      if (!wasBusy && !this.live && !this.awaitId) { this.status = 'idle'; this.phase = ''; this.emit(); }
      else if (wasBusy) this.stream({ peek: false });
      return false;
    }
  }
  async reload(why, forceFull = false) {
    if (!forceFull && this.loaded && this.messages.length) return this.resumeIncremental(why);
    this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
    this.live = null; this.parts.clear(); this.loaded = false; this.loading = null; this.fakeEnd = null; this.midTurnStall = null; this.errAt = 0;
    this.status = 'idle'; this.phase = '重新载入中'; this.reloadAt = now(); this.reloadWhy = why || ''; this.emit();
    try { await this.load(true); return true; } catch { return false; }
  }
  // 长对话：打开后在后台把更早的消息全部拉下来（完整上下文），刷新 / 重新载入后也一样
  async loadAll() {
    if (this.allLoading) return; this.allLoading = true;
    try { for (let i = 0, fail = 0; i < 300 && this.hasMore && this.cursor; i++) { const c0 = this.cursor; await this.loadOlder(true); if (this.cursor === c0 && this.hasMore) { if (++fail > 2) break; await sleep(1500); } else fail = 0; await sleep(150); } }
    finally { this.allLoading = false; }
    if (!this.hasMore) try { FingerprintReview?.auto?.(this); } catch {}   // 完整历史到手后再看有没有指纹测试可以校准
  }
  async loadOlder(quiet) {
    if (this.olderLoading) { if (!quiet) toast('正在加载更早的消息…'); return; }
    if (!this.hasMore) { if (!quiet) toast('已经是最早的消息了'); return; }
    // 缓存 / 预取的内容只带了「还有更多」，没有分页游标：先完整载入一次拿到游标（之前这里直接 return，按钮点了没反应）
    if (!this.cursor) {
      if (quiet) return;
      this.olderLoading = true; this.emit();
      try { await (this.loading || this.load(true)); } catch (e) { toast('加载更早消息失败：' + describe(e), 'err'); return; }
      finally { this.olderLoading = false; this.emit(); }
      if (!this.cursor) { if (this.hasMore) toast('服务器没有返回分页位置，请稍后重试', 'err'); return; }
      if (this.allLoading) return;   // 载入后台已开始自动补全
    }
    this.olderLoading = true; this.emit();
    try {
      const j = await api(`/api/chat/${this.sid}/messages?cursor=${encodeURIComponent(this.cursor)}&limit=20`, { timeout: 35000, noApiRetry: true });
      const have = new Set(this.messages.map(m => m.id));
      this.messages = [...(j.messages || []).filter(m => !have.has(m.id)).map(m => ({ ...m, v: 0 })), ...this.messages];
      const got = (j.messages || []).length;
      this.hasMore = !!j.pagination?.hasMore; this.cursor = j.pagination?.cursor || null;
      if (!quiet) toast(got ? '已加载 ' + got + ' 条更早的消息' + (this.hasMore ? '' : '（已到最早）') : '没有更早的消息了');
      if (!this.hasMore && !this.allLoading) setTimeout(() => { try { FingerprintReview?.auto?.(this); } catch {} }, 600);   // 手动翻到最早：完整历史到手，同样做指纹校准
    } catch (e) { if (!quiet) toast('加载更早消息失败：' + describe(e), 'err'); }
    finally { this.olderLoading = false; this.emit(); }
  }

  // ----- 发送 -----
  async append(bodyObj) {
    const body = JSON.stringify(bodyObj);
    for (let i = 0; i < 2; i++) {
      const usedTok = await this.ensureToken(i > 0);
      const ctl = new AbortController(); let expired = false; const tm = setTimeout(() => { expired = true; ctl.abort(); }, 45000);
      let res, t;
      try { res = await rawFetch(IN(this.sid), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + usedTok, 'x-trigger-source': 'sdk', 'X-Part-Id': crypto.randomUUID() }, body, cache: 'no-store', signal: ctl.signal }); t = await res.text(); }
      catch (e) { const error = expired ? Object.assign(new Error('发送确认超时，正在恢复连接；请勿重复发送'), { routeTimeout: true }) : e; if (typeof AutoRoute !== 'undefined') AutoRoute.fault(error); throw error; }
      finally { clearTimeout(tm); }
      const isRc403 = res.status === 403 && /recaptcha|人机|验证失败|verification required/i.test(t || '');
      if ((res.status === 401 || (res.status === 403 && !isRc403)) && i === 0) { this.markBadToken?.(usedTok); continue; }
      if (i === 0 && bodyObj?.kind === 'stop' && (typeof Prefs === 'undefined' || Prefs.streamKeepAlive !== false) && (res.status === 408 || res.status === 425 || res.status === 429 || (res.status >= 500 && res.status <= 504))) { await sleep(500); continue; }
      try { const d = Date.parse(res.headers.get('date') || ''); if (d) this.srvSkew = now() - d - 500; } catch {}
      if (!res.ok) { ProtocolSchema.noteError(res.status); if (!isRc403 && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [401, 403, 404, 408, 429, 500, 502, 503, 504, 520, 522, 524].includes(res.status)) void AutoRoute.onErrorSwitch({ status: res.status, ipLimited: res.status === 429 }, 'append'); throw new HttpError(res.status, t, res); }
      try { return JSON.parse(t); } catch { return t; }
    }
  }
  // 发送前发现服务器上有一轮正在跑：从那一轮开头接上实时流（显示成「之前的消息」的回复），等它结束
  async waitForeign(msg, di, fd0 = 0) {
    this.awaitId = msg.id; this.awaitFrom = 0; this.wakes = 0;   // 那一轮是发送前开始的：它的记录不能当成「旧记录」跳过
    if (di.runSeq != null) { this.lastSeq = String(di.runSeq - 1); this.fence = di.runSeq - 1; }
    this.turnInput = this.turnInput || di.runIn || '~other'; this.waitingForeign = true; this.foreignWaits = (this.foreignWaits || 0) + 1;
    // 还没真正发出：不放进对话区（否则它压在末尾、上一轮的回复在它上面继续长），改在输入框上方的队列条里显示；真正发出时再落到对话末尾
    msg._held = true; msg.v = (msg.v || 0) + 1;
    this.phase = '对话还在回复之前的消息（网页 / 其他设备发起），结束后自动发送这条'; this.emit();
    this.restream();
    const t0 = now(), tc0 = this.tcAt || 0; let chkAt = 0;
    try {
      while (now() - t0 < 20 * 60e3) {
        await sleep(400);
        if (this.stopReq) throw new Error('之前那一轮已停止，这条没有发送，可以点重试');
        if (this.awaitId !== msg.id || this.status === 'idle' || this.status === 'error') throw new Error('这条没有发送，可以点重试');
        if (((this.tcAt || 0) > tc0 || (this.fDone || 0) > fd0) && !this.live) break;
        // 很久没有任何记录：问一下服务器那一轮是不是其实已经结束了（漏了结束标记 / 服务器上早就停了）
        if (now() - Math.max(this.recAt || 0, t0) > 60000 && now() - (chkAt || 0) > 45000) {
          chkAt = now();
          const pkWf = await this.peekTurn(this.lastSeq, null, 2500, { settleCheck: true }).catch(() => null);
          if (pkWf && !pkWf.busy && (pkWf.done || pkWf.settled)) { if (pkWf.last != null) { this.lastSeq = String(pkWf.last); this.fence = +pkWf.last; } this.live = null; this.turnInput = null; break; }
          const c = ReadLimit.active() ? null : await api('/api/chat/' + this.sid + '?includeStreamToken=false&recoverRun=false', { timeout: 20000, bg: true }).catch(() => null), sl = c?.messages?.at(-1);
          if (sl && !(sl.role === 'user' && sl.id !== msg.id) && !sl.metadata?.pending) { if (c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = +c.lastEventId; } this.live = null; this.turnInput = null; break; }
        }
      }
    } finally {
      this.waitingForeign = false;
      this.turnInput = null;
      if (this.live) {
        this.live.metadata = { ...(this.live.metadata || {}), pending: false };
        this.live = null;
        this.parts.clear();
      }
      if (msg._held) { delete msg._held; msg.v = (msg.v || 0) + 1; }
    }
    this.phase = '发送中'; this.emit();
  }
  packCx(textLen = 8, kind = 'enter') {
    try {
      if (typeof packClientInteraction === 'function') return packClientInteraction(textLen, kind);
      const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : (typeof VISIT === 'string' && VISIT ? VISIT : 'local');
      const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; } return (h ^ (h >>> 16)) & 65535; };
      const salt = (typeof ProtocolSchema !== 'undefined' && Number.isFinite(ProtocolSchema.current?.cxSalt) && ProtocolSchema.current.cxSalt > 0) ? (ProtocolSchema.current.cxSalt & 65535) : 48664;
      const rawStr = typeof textLen === 'string' ? textLen : '';
      const len = Math.max(1, Math.min(255, typeof textLen === 'string' ? (textLen.length || 8) : (Number(textLen) || 8)));
      const cjkMatches = rawStr ? rawStr.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) : null;
      const cjkCount = cjkMatches ? cjkMatches.length : 0;
      const hasCjk = cjkCount > 0 ? 1 : 0;
      const insMulti = hasCjk ? Math.min(14, Math.max(2, Math.floor(cjkCount / 3))) : 0;
      const pasteCount = len > 140 ? 1 : 0;
      const isCoarse = (typeof isMob === 'function' && isMob()) || (typeof Host !== 'undefined' && Host.platform === 'android') ? 1 : 0;
      const isBtn = (kind === 'button' || kind === 'click') ? 1 : 0;
      const composeTicks = Math.min(65535, Math.max(38, len * (16 + Math.floor(Math.random() * 14)) + 42 + Math.floor(Math.random() * 85)));
      const layout = [
        [2, isBtn], [2, 2], [4, 0],
        [8, len], [4, insMulti], [4, pasteCount],
        [1, 0], [1, hasCjk], [4, hasCjk], [3, 0], [1, isCoarse], [16, 0],
        [3, 2 + Math.floor(Math.random() * 3)], [2, 1 + Math.floor(Math.random() * 3)], [2, 1 + Math.floor(Math.random() * 3)],
        [2, 1 + Math.floor(Math.random() * 3)], [2, Math.floor(Math.random() * 2)], [2, 0], [1, 0],
        [16, fnv(String(vid || 'local'))], [16, Math.floor(now() / 60000) & 65535]
      ];
      let a = (0x5bd1e995 ^ salt) >>> 0;
      const rng = () => { let e = Math.imul((a = (a + 0x6d2b79f5) | 0) ^ (a >>> 15), 1 | a); return (((e ^= e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ (e >>> 14)) >>> 0); };
      const order = layout.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = rng() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
      const o = new Uint8Array(12); let s = 0;
      for (const idx of order) {
        const [bits, val] = layout[idx];
        for (let b = bits - 1; b >= 0; b--) { if ((val >>> b) & 1) o[s >> 3] |= 128 >>> (s & 7); s++; }
      }
      for (let i = 0; i < 12; i++) o[i] ^= (rng() & 255);
      const l = new Uint8Array(15); l[0] = 2; l[1] = salt >>> 8; l[2] = salt & 255; l.set(o, 3);
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let out = '';
      for (let i = 0; i < 15; i += 3) {
        const n = (l[i] << 16) | (l[i + 1] << 8) | l[i + 2];
        out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
      }
      return out;
    } catch { return undefined; }
  }
  metadata(inputId, v2, v3, textLen = 8) {
    const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : VISIT;
    const cx = this.packCx(textLen, Math.random() < 0.45 ? 'button' : 'enter');
    return { originHost: 'arena.ai', timezone: currentTimezone(), arenaVisitId: vid, submissionSource: 'chat_input', timingBrowserAttemptId: uuid7(), ...(v2 ? { recaptchaV2Token: v2, recaptchaV3Token: null } : { recaptchaV3Token: v3 }), timingInputId: inputId, ...(cx ? { cx } : {}), ...(() => { const c = this.gacha || this.fpLocked || typeof Connectors === 'undefined' ? [] : Connectors.active(); return c.length ? { enabledConnectors: c } : {}; })() };
  }
  async send(text, opt = {}, _a2 = null, _a3 = null) {
    if (Array.isArray(opt)) opt = (_a3 && typeof _a3 === "object") ? _a3 : {};
    if(this.fpLocked&&!opt.fingerprint)throw Error('该对话正在批量测指纹，请等待或停止后发送');
    const command = Fingerprint.command(this, text, { attachments: !!(opt.files?.length || opt.filesP || opt.parts?.some(p => p.type !== 'text')) });
    if (command.handled) { if (!command.accepted) throw Error(command.error); return; }
    if (!opt.hitl && !opt.parts && !opt.retryOf && !opt.fingerprint && typeof Hitl !== 'undefined' && Hitl.skippable?.(this)) {
      return this.skipHitlSend(text, opt);
    }
    if (this.busy) throw new Error('上一轮还在进行中');
    if (!this.gacha && !opt.fingerprint) {
      try {
        this._gachaKept = true;
        if (typeof Gacha !== 'undefined' && Gacha.unmarkCreatedSid) Gacha.unmarkCreatedSid(this.sid);
      } catch {}
    }
    if (!this.gacha && !opt.autoContinue && (this.thinkStopped || this.routedThink || this._hadOpenThinkStop || (this.messages || []).some(m => m?.metadata?.openThinkStopped || (m?.role === 'assistant' && (m?.parts || []).some(p => p?.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || ''))))))) {
      this._hadOpenThinkStop = true;
      this._allowOpenThink = true;
    }
    const wasMidStall = !!(opt.autoContinue || opt.officialAutoResend || opt.retryOf?._streamRejected || this.fakeEnd || this.midTurnStall || (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled?.(this)));
    clearTimeout(this.tailT);
    if (this.streaming) { try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null; }
    if (!opt.retryOf && this.messages.length) {
      const prevTail = this.messages.at(-1);
      const prevU = prevTail?.role === 'assistant' ? this.messages.at(-2) : (prevTail?.role === 'user' ? prevTail : null);
      const prevErrTxt = String(this.errText || this.error || (prevTail?.role === 'assistant' && (prevTail.parts || []).find(p => p?.type === 'error')?.rawText) || (prevTail?.role === 'assistant' && (prevTail.parts || []).find(p => p?.type === 'error')?.text) || '');
      const prevGraphRej = /The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(prevErrTxt);
      if (prevU?.role === 'user' && !prevU.failed && !prevGraphRej && (prevU._appendAccepted || prevU._officialContinueParent || !prevU._local)) {
        prevU._officialContinueParent = true;
        delete prevU._streamRejected;
        if (prevTail?.role === 'assistant' && Array.isArray(prevTail.parts) && prevTail.parts.some(p => p?.type === 'error')) {
          const nonErr = prevTail.parts.filter(p => p && p.type !== 'error');
          if (!nonErr.filter(p => p.type !== 'step-start').length) {
            if (prevTail.id) (this._prunedDeadMsgIds ||= new Set()).add(prevTail.id);
            this.messages.pop();
          } else {
            prevTail.parts = nonErr;
            prevTail.v = (prevTail.v || 0) + 1;
          }
        }
      }
    }
    if (opt.retryOf && (opt.retryOf._appendAccepted || opt.retryOf._streamRejected || opt.retryOf.failed)) {
      const oldId = opt.retryOf.id, newId = uuid7();
      opt.retryOf.id = newId;
      delete opt.retryOf._appendAccepted;
      delete opt.retryOf._streamRejected;
      try { SentUserLog.remove?.(this.sid, oldId); } catch {}
      try { Drafts.ack?.(oldId); } catch {}
    }
    const isGachaProbeSend = Boolean(this.gacha || opt.gacha || opt.fingerprint || (typeof SentUserLog !== 'undefined' && SentUserLog.isGachaProbeText?.(text)));
    const id = opt.retryOf?.id || uuid7(), msg = opt.retryOf || { id, role: 'user', parts: opt.parts || [{ type: 'text', text }], metadata: opt.autoContinue ? { autoContinue: true } : (isGachaProbeSend ? { gachaProbe: true } : {}), v: 0, _local: true, ...(opt.autoContinue ? { _autoContinue: true } : {}), ...(isGachaProbeSend ? { _gachaProbe: true } : {}) };
    if (isGachaProbeSend) msg._gachaProbe = true;
    if (typeof SentUserLog !== 'undefined' && SentUserLog.isPelicanPromptText?.(text)) {
      this._pelicanSent = true;
      try { if (typeof Gacha !== 'undefined' && Gacha.markPelicanSent) Gacha.markPelicanSent(this.sid); } catch {}
    }
    // 附件：消息立即显示（本地预览 + 上传进度），上传、工作区节点、会话令牌同时进行，全部就绪后再真正发送
    const hasFiles = !!(opt.files?.length || opt.filesP);
    if (opt.previews?.length) { msg._prev = opt.previews; for (const a of opt.previews) a.subs?.add(() => { msg.v = (msg.v || 0) + 1; this.emit(); }); }
    if (opt.files?.length) msg.metadata = Uploads.meta(opt.files, null);
    // Queue removal and outbox ownership are persisted in the same draft snapshot.
    // 自动续接（autoContinue）属于后台探针推进，不写入持久化待确认外发箱，也不弹出人机验证或残留红字气泡。
    if (!opt.autoContinue && Drafts.out(this, msg, text, opt) === false) throw Error('本地保存失败，输入未发送，请检查存储空间');
    const prevAsstForSend = [...this.messages].reverse().find(m => m && m !== msg && m.role === 'assistant' && m.id);
    if (!this.messages.includes(msg)) this.messages.push(msg);
    msg._sentAt = msg._sentAt || now();
    if (prevAsstForSend?.id && !msg._prevAsstId) msg._prevAsstId = prevAsstForSend.id;
    if (prevAsstForSend && msg._prevAsstWeight == null && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) msg._prevAsstWeight = SentUserLog.measureAsstWeight(prevAsstForSend);
    msg._local = true; msg.deliveryUnknown = false; if (opt.queueIds) { msg._queued = true; msg._fromQueue = true; msg._queueIds = opt.queueIds.slice(); } if (opt.retryOf) this._qPaused = '';
    if (!opt.autoContinue) {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const fm = this.messages[i];
        if (fm && fm !== msg && fm.role === 'user' && fm.failed) {
          this.messages.splice(i, 1);
          try { SentUserLog.remove?.(this.sid, fm.id); } catch {}
          try { Drafts.ack?.(fm.id); } catch {}
        }
      }
      try { SentUserLog.record(this.sid, msg, msg._prevAsstId || null); } catch {}
      try { void MsgCache.putNow(this); } catch {}
    }
    if (!this.gacha) Bus.emit('sent', this.sid, now());
    if (!opt.autoContinue && !opt.officialAutoResend && this._ka) { this._ka.autoContCount = 0; this._ka.paused = 0; this._ka.stallSeen = 0; this._ka.stallKeySeen = ''; }
    this.status = 'submitted'; this.error = null; this.phase = opt.filesP ? '上传附件' : '发送中'; this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.realTcAt = 0; this.endAt = 0; this.fakeEnd = null; this.midTurnStall = null; msg.failed = false; msg.v = (msg.v || 0) + 1;
    // 发出之前：自己这条已经在末尾，这期间服务器上出现的回复都放到它前面（preSend），结束标记也不会把这条的发送流程收掉
    this.awaitId = msg.id; this.turnInput = null; this.preSend = true; const fd0 = this.fDone || 0; let appendAttempted = false;
    try {
      opt.onPrepared?.(msg); this.emit();
      if (hasFiles) {
        const [files, node] = await Promise.all([opt.filesP || Promise.resolve(opt.files), Workspace.latest(this.sid, true).then(x => x?.node || null, () => Workspace.cache.get(this.sid)?.node || null), this.ensureToken().catch(() => null)]);
        msg.metadata = Uploads.meta(files, node); this.phase = '发送中'; this.emit();
      }
      // 人机验证令牌（多半已在打字 / 选附件时预取好）和会话令牌同时拿，不再一个等一个
      // 同时把实时通道读到最新（drain）：之前没读完的旧记录（上一轮的尾巴、多出来的 turn-complete）不会被当成这一轮的回复
      // 对话还没载入完（手机上刚切过来、显示的是缓存）：先等载入，拿到最新位置和状态再发
      if (!this.loaded && !this.gacha) {
        this.srvBusy = false; this.phase = '同步对话中'; msg._held = true; msg.v = (msg.v || 0) + 1; this.emit();
        try {
          if (this.loading && this._loadStartedAt && now() - this._loadStartedAt > 5000) {
            try { this._loadCtl?.abort(); } catch {}
            this.loading = null;
          }
          await Promise.race([(this.loading || this.load()).catch(() => {}), sleep(12000)]);
        } finally {
          delete msg._held; msg.v = (msg.v || 0) + 1;
        }
        this.phase = '发送中'; this.emit();
      }
      const canSkipDrain = Boolean(this.loaded && this.lastSeq != null && !this.srvBusy && (this.gacha || opt.hitl || wasMidStall || ((this.tcAt || this.endAt || this.recAt) && now() - Math.max(this.tcAt || 0, this.endAt || 0, this.recAt || 0) < 180000)));
      const prePureTask = (typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function')
        ? IPRep.ensurePreSendPure({ timeoutMs: 1800 }).catch(() => null)
        : Promise.resolve(null);
      const v3IpBefore = (typeof IP !== 'undefined' && IP.ip) || '';
      let [v3, di, prePure] = await Promise.all([opt.v2 ? null : Recaptcha.take('chat_submit').catch(() => null), (this.wakeSessionToken ? this.wakeSessionToken() : this.ensureToken()).catch(() => null).then(() => canSkipDrain ? { max: +this.lastSeq, run: false } : this.drain(900)), prePureTask]);
      if (prePure?.switched || (!opt.v2 && v3IpBefore && typeof IP !== 'undefined' && IP.ip && IP.ip !== v3IpBefore)) {
        try { Recaptcha.clearCache?.(); } catch {}
        const [freshV3] = await Promise.all([
          opt.v2 ? Promise.resolve(null) : Recaptcha.v3('chat_submit').catch(() => v3),
          this.ensureToken(true).catch(() => null),
        ]);
        if (!opt.v2 && freshV3) v3 = freshV3;
      }
      // 服务器上这个对话正有一轮在跑（网页 / 另一台设备 / 本机没在盯着的时候发起的）：先把那一轮接上显示出来，
      // 等它结束（再隔 2.5 秒）才发这条——回复中途插进去的消息服务器有时不会处理，一直显示「等待接单」
      // 实时通道没认出正在跑的一轮时，再用对话快照核对一次：最后一条助手消息还是 pending = 服务器仍在处理，不能把新消息塞进去（会被服务器排在后面、事后才冒出来）
      // 回应提问卡片（opt.hitl）：服务器上那一轮停在「等用户回应」，没有 turn-complete，会被误判成「别处发起、还在跑的一轮」，
      // 于是等它结束 → 重放时变成空闲 → 报「这条没有发送」，点多少次提交都一样。这条回答等的正是这一轮：不等，直接发，
      // 并把读取位置挪到最新，免得发送后把这一轮旧记录当成新回复重放一遍。
      if (opt.hitl || wasMidStall) { this.srvBusy = false; if (di?.max != null) { this.lastSeq = String(di.max); this.fence = di.max; } }
      if (!opt.hitl && !wasMidStall && !this.gacha && !this.srvBusy && !di && !(di?.run && di.runSeq != null)) { const sb = await this.serverMidTurn(msg.id); if (sb) this.srvBusy = true; }
      if (!opt.hitl && !wasMidStall && !this.gacha && ((di?.run && di.runSeq != null) || this.srvBusy)) {
        const t0 = now(); this.srvBusy = false;
        await this.waitForeign(msg, di?.run ? di : { runSeq: null, runIn: null }, fd0);
        if (now() - t0 > 60000 && !opt.v2) v3 = await Recaptcha.take('chat_submit').catch(() => null);   // 人机验证令牌 2 分钟过期：等久了重新取
      }
      this.rcV3 = !!v3;   // 纯净度实测：这一轮用 v3 发的，开始回复 = v3 通过
      await this.settle();
      this.awaitFrom = this.sentAt;
      this.awaitId = msg.id; this.wakes = 0; this.baseSeq = this.lastSeq;
      const forceResetWs = !!this._forceResetWorkspaceBranch;
      const explicitTargetId = this._resetBranchTargetUserId || null;
      if (forceResetWs) {
        this._forceResetWorkspaceBranch = false;
        this._resetBranchTargetUserId = null;
        this._rejectedHealthyNodeIds?.clear?.();
      }
      if (!explicitTargetId && this.hasMore && this.cursor && typeof findHealthyLastUser === 'function' && !findHealthyLastUser(this.messages, msg, this._rejectedHealthyNodeIds) && typeof ensureHealthyHistoryLoaded === 'function') {
        await ensureHealthyHistoryLoaded(this).catch(() => {});
      }
      const prevUser = typeof findHealthyLastUser === 'function'
        ? findHealthyLastUser(this.messages, msg, this._rejectedHealthyNodeIds)
        : [...this.messages].filter(m => m && m !== msg && m.role === 'user' && !m.failed).at(-1);
      const lastUserMessageId = explicitTargetId || (prevUser ? (prevUser.metadata?.nodeId || prevUser.id || null) : null);
      this._lastSentParentUserId = lastUserMessageId;
      const msgMeta = forceResetWs
        ? (msg.metadata?.uploads ? { ...msg.metadata, lastUserMessageId, manifestNodeId: null } : { lastUserMessageId, manifestNodeId: null })
        : (msg.metadata?.uploads ? (lastUserMessageId ? { ...msg.metadata, lastUserMessageId } : msg.metadata) : (lastUserMessageId ? { lastUserMessageId } : null));
      const tLen = String(text || '').length || 8;
      const normSendTxt = String(text || '').replace(/\s+/g, ' ').trim();
      if (normSendTxt && this._lastSentPromptNorm === normSendTxt && typeof rotateVisitId === 'function') {
        try { rotateVisitId(); } catch {}
      }
      if (normSendTxt) this._lastSentPromptNorm = normSendTxt;
      const body = (a, b) => ({ kind: 'message', payload: { message: { parts: msg.parts, id: msg.id, role: 'user', ...(msgMeta ? { metadata: msgMeta } : {}) }, chatId: this.sid, trigger: 'submit-message', messageId: msg.id, metadata: this.metadata(msg.id, a, b, text || tLen) } });
      // 兜底「重新发送」用：同一条消息（同一个 id）、新的人机验证令牌
      this.reSend = { id: msg.id, fn: async () => this.append(body(null, await Recaptcha.take('chat_submit').catch(() => null))) };
      if (!opt.autoContinue && this._preSendNetErr && typeof AutoRoute !== 'undefined' && typeof AutoRoute.onErrorSwitch === 'function' && AutoRoute.enabled?.()) {
        const preErr = this._preSendNetErr || { routeTimeout: true, net: true, message: IP?.err || '实时连接超时' };
        this._preSendNetErr = null;
        this.phase = '当前线路超时，正在自动切换最优节点 / ProxyIP…'; this.emit();
        const sw = await AutoRoute.onErrorSwitch(preErr, 'pre-send').catch(() => null);
        if (sw?.changed) {
          try { Recaptcha.clearCache?.(); } catch {}
          const [freshV3] = await Promise.all([
            opt.v2 ? Promise.resolve(null) : Recaptcha.v3('chat_submit').catch(() => v3),
            this.ensureToken(true).catch(() => null),
          ]);
          if (!opt.v2 && freshV3) v3 = freshV3;
        }
        this.phase = '发送中'; this.emit();
      } else {
        this._preSendNetErr = null;
      }
      this.preSend = false;
      this.turnInput = null;
      if (this.live) {
        this.live.metadata = { ...(this.live.metadata || {}), pending: false };
        this.live = null;
        this.parts.clear();
      }
      const msgIdxBeforeAppend = this.messages.indexOf(msg);
      if (msgIdxBeforeAppend >= 0 && msgIdxBeforeAppend < this.messages.length - 1) {
        this.messages.splice(msgIdxBeforeAppend, 1);
        this.messages.push(msg);
      }
      appendAttempted = true;
      let ar;
      try { ar = await this.append(body(opt.v2, v3)); }
      catch (e) {
        if (opt.autoContinue) throw e;
        const isNetTimeout = Boolean(e?.routeTimeout || (typeof NetPolicy !== 'undefined' && NetPolicy.transportError?.(e)));
        if (isNetTimeout && typeof AutoRoute !== 'undefined' && typeof AutoRoute.onErrorSwitch === 'function' && AutoRoute.enabled?.()) {
          this.phase = '发送超时，正在自动切换最优节点 / ProxyIP 并恢复发送…'; this.emit();
          const sw = await AutoRoute.onErrorSwitch(e, 'send-timeout').catch(() => null);
          if (sw?.ok) {
            const got = await this.inDb(msg.id, text, this.sentAt).catch(() => null);
            if (got === true) {
              ar = { ok: true, recovered: true };
            } else {
              try { Recaptcha.clearCache?.(); } catch {}
              const [freshV3] = await Promise.all([
                opt.v2 ? Promise.resolve(null) : Recaptcha.v3('chat_submit').catch(() => v3),
                this.ensureToken(true).catch(() => null),
              ]);
              if (!opt.v2 && freshV3) v3 = freshV3;
              this.phase = '已切换最优线路，正在自动重发…'; this.emit();
              ar = await this.append(body(opt.v2, v3));
            }
          } else {
            const got = await this.inDb(msg.id, text, this.sentAt).catch(() => null);
            if (got === true) {
              ar = { ok: true, recovered: true };
            } else {
              this.phase = '服务器响应较慢，正在后台自动重试…'; this.emit();
              await sleep(2000);
              const freshV3 = opt.v2 ? null : await Recaptcha.v3('chat_submit').catch(() => v3);
              if (freshV3) v3 = freshV3;
              ar = await this.append(body(opt.v2, v3));
            }
          }
        } else {
          // 重复指令（429 prompt failed / verification required）或 v3 分数不足（403 recaptcha validation failed）：
          // 切换节点后首次发送可能携带了旧节点预热的 v3 令牌，先用当前节点的新 v3 令牌静默重试一次，避免误判新节点纯净度不足
          let errNow = e;
          let eBody = String(errNow?.body || errNow?.message || '');
          const isDupPrompt = promptFailed(errNow?.status, eBody);
          const isRcChallenge = Boolean(!isDupPrompt && ((errNow?.status === 403 && /recaptcha|人机|验证失败|verification required/i.test(eBody)) || (errNow?.status === 429 && /verification required/i.test(eBody))));
          if ((errNow?.status === 429 || isRcChallenge) && !opt.v2 && !isDupPrompt) {
            this.status = 'submitted';
            this.phase = isRcChallenge ? '触发人机校验，正在刷新交互遥测与 v3 令牌静默重发…' : '触发 429 速率限制，正在直连实时流核对并原地刷新令牌重发…';
            this.emit();
            const pkFast = !isRcChallenge ? await this.peekTurn(this.baseSeq, msg.id, 2000).catch(() => null) : null;
            if (pkFast?.taken || pkFast?.busy) {
              ar = { ok: true, recovered: true };
              errNow = null;
            } else {
              await sleep(isRcChallenge ? (1100 + Math.floor(Math.random() * 500)) : 1600);
              try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
              try { Recaptcha.clearCache?.(); } catch {}
              const [freshV3Fast] = await Promise.all([
                Recaptcha.v3('chat_submit').catch(() => v3),
                this.ensureToken(true).catch(() => null),
              ]);
              if (freshV3Fast) v3 = freshV3Fast;
              try {
                ar = await this.append(body(null, v3));
                errNow = null;
              } catch (eFast) {
                errNow = eFast;
                eBody = String(errNow?.body || errNow?.message || '');
              }
            }
          }
          const isRcOr429 = Boolean(errNow && !opt.v2 && !promptFailed(errNow?.status, eBody) && (
            (errNow?.status === 403 && /recaptcha|人机|验证失败|verification required/i.test(eBody)) ||
            errNow?.status === 429
          ));
          if (isRcOr429 && typeof IPRep !== 'undefined' && typeof IPRep.rotateOnVerificationOrLimit === 'function') {
            this.phase = errNow?.status === 429
              ? '当前出口触发 429 限流，正在自动切换备用出口重发…'
              : '当前出口触发人机拦截，正在自动切换纯净出口重发…';
            this.emit();
            const rot = await IPRep.rotateOnVerificationOrLimit(errNow?.status === 429 ? '429' : 'rc', { action: 'chat_submit' }).catch(() => null);
            const nextV3 = rot?.token || await Recaptcha.v3('chat_submit').catch(() => null);
            if (rot?.switched || (nextV3 && nextV3 !== v3)) {
              if (nextV3) v3 = nextV3;
              this.phase = '已切换备用出口，正在自动重发…'; this.emit();
              try {
                ar = await this.append(body(null, v3));
                errNow = null;
              } catch (eRetry) {
                errNow = eRetry;
                eBody = String(errNow?.body || errNow?.message || '');
              }
            }
          }
          // 当服务器响应较慢、触发 429 速率限制（非重复指令）或临时超时/5xx 时，不在前台立刻报错，而是保持等待状态在后台静默核对与重试
          if (errNow && !opt.v2 && !promptFailed(errNow?.status, eBody) && !(errNow?.status === 429 && /verification required/i.test(eBody))) {
            const isRetryableSendErr = errNow?.status === 429 || (errNow?.status >= 500 && errNow?.status <= 524) || errNow?.status === 408 || Boolean(errNow?.routeTimeout || (typeof NetPolicy !== 'undefined' && NetPolicy.transportError?.(errNow)));
            if (isRetryableSendErr) {
              for (let bgTry = 1; bgTry <= 3 && errNow; bgTry++) {
                this.status = 'submitted';
                this.phase = errNow?.status === 429 ? '服务器繁忙，正在后台排队等待响应…' : '正在等待服务器响应…';
                this.emit();
                const pkNow = await this.peekTurn(this.baseSeq, msg.id, 2500).catch(() => null);
                if (pkNow?.taken || pkNow?.busy) { ar = { ok: true, recovered: true }; errNow = null; break; }
                const dbNow = await this.inDb(msg.id, text, this.sentAt).catch(() => null);
                if (dbNow === true) { ar = { ok: true, recovered: true }; errNow = null; break; }
                const waitMs = Math.min(12000, Math.max(2500 * bgTry, Math.min(Number(errNow?.retryAfterMs) || 0, 10000)));
                await sleep(waitMs);
                try { if (errNow?.status === 429 && typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
                try { Recaptcha.clearCache?.(); } catch {}
                const retryV3 = await Recaptcha.v3('chat_submit').catch(() => v3);
                if (retryV3) v3 = retryV3;
                try {
                  ar = await this.append(body(null, v3));
                  errNow = null;
                  break;
                } catch (eBg) {
                  errNow = eBg;
                  eBody = String(errNow?.body || errNow?.message || '');
                }
              }
            }
          }
          if (errNow) {
            const needV2 = promptFailed(errNow?.status, eBody) || (errNow?.status === 403 && /recaptcha|人机|验证失败|verification required/i.test(eBody)) || (errNow?.status === 429 && /verification required/i.test(eBody));
            if (opt.v2 || !needV2) throw errNow;
            this.phase = promptFailed(errNow?.status, eBody) ? 'Brana 要求人工验证（重复指令）' : 'Brana 要求人工验证（reCAPTCHA）'; this.emit();
            const tok = await Recaptcha.v2().catch(() => null);
            if (!tok) throw Object.assign(new Error('已取消人机验证，这条没有发送，可以点重试'), { status: 0 });
            this.phase = '发送中'; this.emit(); ar = await this.append(body(tok, null));
          }
        }
      }
      this._pendingTimeoutMsg = null;
      msg._appendAccepted = true;
      if (!opt.autoContinue) {
        try { SentUserLog.record(this.sid, msg, msg._prevAsstId || null); } catch {}
        try { void MsgCache.putNow(this); } catch {}
        try { Drafts.accepted?.(msg.id); } catch {}
      }   // 服务器已收下这条（POST 成功）：之后只要有一轮结束，就不再挡队列
      this.awaitSeq = ar && typeof ar === 'object' && ar.seq != null ? +ar.seq : null;
      this.phase = '等待回复'; this.emit();
      this.armLost(msg);
      this.restream();
    } catch (e) {
      clearTimeout(this.lostT); this.preSend = false;
      if (opt.autoContinue) {
        const idx = this.messages.indexOf(msg);
        if (idx >= 0) this.messages.splice(idx, 1);
        this.rcV3 = false; this.stopPending = false; this.status = 'idle'; this.error = null; this.phase = ''; this.awaitId = null; this.awaitFrom = 0; this.emit();
        throw e;
      }
      if (this.rcV3 && e?.status === 403 && /recaptcha/i.test(e.body || '')) IPRep.note('rc'); else if (e?.status === 429 && !promptFailed(429, String(e.body || ''))) IPRep.note('l');
      this.rcV3 = false;
      const isUnknownTimeout = appendAttempted && (!e.status || e.status >= 500 || e.status === 408);
      if (isUnknownTimeout) this._pendingTimeoutMsg = { msg, text, at: this.sentAt || now() };
      if (!appendAttempted && Array.isArray(opt.queueIds) && opt.queueIds.length > 0 && !opt.retryOf && typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
        this.stopPending = false; this.status = 'idle'; this.error = describe(e); this.phase = ''; this.awaitId = null; this.awaitFrom = 0;
        SendQ.demoteToQueue(this, msg, { silent: true });
        try { void MsgCache.putNow(this); } catch {}
        this.emit();
        throw e;
      }
      this.stopPending = false; this.status = 'error'; msg.failed = true; msg.deliveryUnknown = isUnknownTimeout; this.error = describe(e); this.phase = ''; this.awaitId = null; this.awaitFrom = 0; try { SentUserLog.markFailed?.(this.sid, msg.id, text); } catch {} try { void MsgCache.putNow(this); } catch {} this.emit(); throw e;
    }
  }
  // 回应 ask_user 等：新建一条只含 data-tool-results 的用户消息（和官方 submitHitlResponse 一致）
  async submitHitl(part, output, opt = {}) {
    const tool = Hitl.name(part); if (!tool) throw new Error('不是需要回应的工具');
    // 只是「等回答」卡住的 streaming 状态：收掉空转的实时流，按空闲处理
    if (this.busy && !Hitl.blocked(this)) {
      this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null;
      clearTimeout(this.hitlT);
      if (this.live) { const lm = this.live; lm.metadata = { ...lm.metadata, pending: false }; lm.parts.forEach(x => { if (x.state === 'streaming') x.state = 'done'; }); lm.v++; this.live = null; this.parts.clear(); }
      this.status = 'idle'; this.phase = ''; this.awaitId = null; this.awaitFrom = 0; this.turnInput = null;
    }
    if (this.busy) throw new Error('上一轮还在进行中，等它结束后再提交');
    (this.hitlStage ||= new Map()).set(part.toolCallId, { tool, output });
    const pend = Hitl.pending(this);
    const waiting = pend.filter(p => !this.hitlStage.has(p.toolCallId));
    if (waiting.length) { this.emit(); return { staged: true, left: waiting.length }; }
    const last = this.messages.at(-1);
    let nodeId = last?.metadata?.nodeId || null;
    const UU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!nodeId || !UU.test(nodeId)) {
      // 本地流里的消息 id 可能不是服务端节点 id：向服务端确认一次
      try {
        const j = await api(`/api/chat/${this.sid}/messages?limit=20`);
        const hit = [...(j.messages || [])].reverse().find(m => m.role === 'assistant' && (m.parts || []).some(x => x.toolCallId === part.toolCallId));
        if (hit) nodeId = hit.metadata?.nodeId || hit.id;
      } catch {}
      if (!nodeId || !UU.test(nodeId)) nodeId = UU.test(last?.id || '') ? last.id : nodeId;
    }
    const data = pend.map(p => ({ requestNodeId: nodeId, tool: this.hitlStage.get(p.toolCallId).tool, toolCallId: p.toolCallId, output: this.hitlStage.get(p.toolCallId).output }));
    const parts = [{ type: 'data-tool-results', data }];
    if (opt.text && String(opt.text).trim()) parts.push({ type: 'text', text: String(opt.text).trim() });
    const saved = new Map(this.hitlStage); this.hitlStage.clear();
    const pass = {}; for (const k of ['files', 'filesP', 'previews', 'queueIds', 'onPrepared']) if (opt[k] != null) pass[k] = opt[k];
    try { await this.send('', { ...pass, parts, v2: opt.v2, hitl: true }); }
    catch (e) {
      // 没发出去：卡片保持「未回答」（不再留在「已记下 / 已回答」状态）。选项草稿还在，直接再点一次提交即可；刷新后服务器上没有回答，同样是未回答。
      const m = this.messages.at(-1); if (m && m.role === 'user' && m.parts === parts) this.messages.pop();
      this.hitlStage.clear(); this.status = this.status === 'error' ? 'idle' : this.status; this.error = null;
      this.messages.forEach(x => x.v = (x.v || 0) + 1); this.emit(); throw e;
    }
    return { staged: false };
  }
  // 没点交互卡片直接发下一条消息：所有未回答的交互卡片（提问 / 计划 / 选图 / 选声音）自动按 Skip 记下，和这条文字（附件）一起提交
  async skipHitlSend(text, opt = {}) {
    const l = Hitl.skippable(this); if (!l) throw new Error('还有需要回答的提问');
    const todo = l.filter(p => !this.hitlStage?.has(p.toolCallId)), lastP = todo.at(-1) || l.at(-1);
    this.hitlStage ||= new Map();
    for (const p of l) { try { if (typeof UI !== 'undefined') UI.hitlDraft?.delete(p.toolCallId); } catch {} }
    for (const p of todo.slice(0, -1)) this.hitlStage.set(p.toolCallId, { tool: Hitl.name(p), output: Hitl.skipOut(p) });
    const out = todo.length ? Hitl.skipOut(lastP) : this.hitlStage.get(lastP.toolCallId)?.output;
    const r = await this.submitHitl(lastP, out, { ...opt, text });
    if (r?.staged) throw new Error('还有需要回答的提问');
    return r;
  }
  async regenerate(opt = {}) {
    if (this.busy) return;
    let idx = this.messages.length - 1; while (idx >= 0 && this.messages[idx].role !== 'assistant') idx--;
    const target = idx >= 0 ? this.messages[idx] : null;
    if (target) this.messages.splice(idx, 1);
    this.status = 'submitted'; this.error = null; this.phase = '重新生成'; this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.endAt = 0; this.fakeEnd = null; this.emit();
    try {
      const [v3] = await Promise.all([opt.v2 ? null : Recaptcha.take('chat_submit').catch(() => null), this.drain()]);
      this.rcV3 = !!v3;
      await this.settle();
      this.awaitFrom = this.sentAt;
      const lastUser = [...this.messages].reverse().find(m => m.role === 'user');
      this.awaitId = lastUser?.id || null; this.wakes = 0; this.baseSeq = this.lastSeq;
      const rBody = (a, b) => ({ kind: 'message', payload: { chatId: this.sid, trigger: 'regenerate-message', ...(target ? { messageId: target.id } : {}), metadata: this.metadata(lastUser?.id || uuid7(), a, b) } });
      try { await this.append(rBody(opt.v2, v3)); }
      catch (e) {
        const eBody = String(e?.body || e?.message || '');
        const needV2 = promptFailed(e?.status, eBody) || (e?.status === 403 && /recaptcha|人机|验证失败/i.test(eBody)) || (e?.status === 429 && /verification required/i.test(eBody));
        if (opt.v2 || !needV2) throw e;
        if (this.rcV3 && e?.status === 403) { this.rcV3 = false; try { IPRep.note('rc'); } catch {} }
        this.phase = 'Brana 要求人工验证（reCAPTCHA）'; this.emit();
        const tok = await Recaptcha.v2().catch(() => null);
        if (!tok) throw Object.assign(new Error('已取消人机验证，请点重试'), { status: 0 });
        this.phase = '重新生成'; this.emit();
        await this.append(rBody(tok, null));
      }
      this.phase = '等待回复'; this.emit(); this.armLost(null); this.restream();
    } catch (e) { clearTimeout(this.lostT); if (target) this.messages.splice(idx, 0, target); this.status = 'error'; this.error = describe(e); this.phase = ''; this.emit(); throw e; }
  }
  // 思考自动停止（模型信息 → 设置，默认开）：这个对话一直在调用工具（bash 等）、从来没出现过思考，
  // 突然出现有内容的思考时按用户开关停止；这不能证明开源或改派，已知闭源不误触发。一开始就有思考的对话不停。
