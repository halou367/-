// Diagnostic session packet logger: records sanitized HTTP/SSE events and bus state for offline debugging
const Cap = {
  on: false, t0: 0, label: '', auto: true, reqs: [], evs: [], size: 0, seq: 0, sids: new Set(), sent: new Set(),
  stopT: 0, maxT: 0, tick: 0, finishing: false, full: false, snaps: {},
  MAX: 40e6, REQ_MAX: 8e6,
  show() { return Prefs.capBtn != null ? !!Prefs.capBtn : Update.isBeta(VERSION); },
  ms() { return now() - this.t0; },
  // ---- 脱敏 ----
  red(s) {
    s = String(s ?? '');
    s = s.replace(/(eyJ[\w-]{6,}\.eyJ[\w-]{6,})\.[\w-]{10,}/g, '$1.<签名已去掉>');
    s = s.replace(/("(?:password|newPassword|currentPassword|oldPassword)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, '$1"***"');
    s = s.replace(/("recaptcha\w*"\s*:\s*)"([^"]{0,12})[^"]*"/gi, '$1"$2…"');
    return s;
  },
  jwtOf(s) { const m = String(s || '').match(/eyJ[\w-]{6,}\.eyJ[\w-]{6,}\.[\w-]+/); if (!m) return null; try { return jwt(m[0]); } catch { return null; } },
  hdrs(hd) {
    const o = {};
    try { new Headers(hd || {}).forEach((v, k) => { o[k] = k === 'cookie' || k === 'set-cookie' ? '<略>' : this.red(v); }); } catch {}
    return o;
  },
  add(n) { this.size += n; if (this.size > this.MAX && !this.full) { this.full = true; this.ev('full', { note: '日志超过 ' + Math.round(this.MAX / 1e6) + 'MB，之后只记录请求地址和状态' }); } },
  ev(type, data) { if (!this.on) return; const e = { t: this.ms(), type, ...(data || {}) }; const s = JSON.stringify(e); this.add(s.length); this.evs.push(e); },
  sidsIn(u) { const m = String(u).match(/\/(?:sessions|chat)\/([0-9a-f]{8}-[0-9a-f-]{27,})/i); if (m) this.sids.add(m[1]); },
  // ---- fetch 包装 ----
  async fetch(u, o, real) {
    if (!this.on) return real(u, o);
    const url = typeof u === 'string' ? u : u?.url || String(u);
    const r = { id: ++this.seq, t: this.ms(), method: String(o?.method || (typeof u === 'object' && u?.method) || 'GET').toUpperCase(), url: this.red(url), reqHeaders: this.hdrs(o?.headers) };
    this.sidsIn(url);
    const auth = r.reqHeaders.authorization; if (auth) { const j = this.jwtOf(o?.headers?.Authorization || o?.headers?.authorization || ''); if (j) r.authJwt = j; }
    const b = o?.body;
    if (b != null && !this.full) {
      if (typeof b === 'string') { r.reqBody = this.red(b.length > 262144 ? b.slice(0, 262144) + '…（截断，共 ' + b.length + ' 字）' : b); }
      else r.reqBody = '[二进制 ' + (b.size ?? b.byteLength ?? '?') + ' 字节]';
    }
    this.reqs.push(r); this.add(JSON.stringify(r).length);
    let res;
    try { res = await real(u, o); }
    catch (e) { r.error = String(e?.name === 'AbortError' ? 'AbortError（主动取消）' : e?.message || e); r.tEnd = this.ms(); throw e; }
    r.tHead = this.ms(); r.status = res.status; r.resHeaders = this.hdrs(res.headers);
    try { const nid = res.headers.get('x-arena-chat-id'); if (nid && /^[0-9a-f-]{36}$/i.test(nid)) { this.sids.add(nid); r.newSid = nid; } } catch {}
    const ct = String(res.headers.get('content-type') || '');
    const bin = /^(image|audio|video|font)\/|octet-stream|zip|pdf|wasm/i.test(ct);
    if (bin || this.full || !res.body) { r.resBody = bin ? '[二进制 ' + (res.headers.get('content-length') || '?') + ' 字节 ' + ct + ']' : this.full ? '[日志已满，未记录]' : ''; r.tEnd = r.tHead; return res; }
    const stream = /event-stream|ndjson/i.test(ct) || /\/out(\?|$)/.test(url);
    const html = /text\/html/i.test(ct);
    let c; try { c = res.clone(); } catch { return res; }
    (async () => {
      const rd = c.body.getReader(), dec = new TextDecoder();
      let n = 0, txt = '';
      if (stream) r.chunks = [];
      try {
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          const s = dec.decode(value, { stream: true }); n += value.byteLength;
          if (!this.on) { try { rd.cancel(); } catch {} r.cut = '停止抓日志时还没结束'; break; }
          if (n > this.REQ_MAX || this.full) { r.cut = '超过大小上限，后面没记录'; if (!stream) break; continue; }
          if (stream) { r.chunks.push([this.ms(), this.red(s)]); this.add(s.length + 16); }
          else txt += s;
        }
      } catch (e) { r.bodyError = String(e?.name === 'AbortError' ? 'AbortError（主动取消）' : e?.message || e); }
      r.bytes = n; r.tEnd = this.ms();
      if (!stream) { if (html && txt.length > 20000) txt = txt.slice(0, 20000) + '…（HTML 截断，共 ' + txt.length + ' 字）'; r.resBody = this.red(txt); this.add(r.resBody.length); }
    })();
    return res;
  },
  // ---- 对话快照 ----
  snap(sid) {
    const c = Chats.get?.(sid); const o = { sid, at: this.ms() };
    try { o.title = History.byId?.(sid)?.title || ''; } catch {}
    if (c) {
      for (const k of Object.keys(c)) {
        const v = c[k];
        if (/At$/.test(k) && typeof v === 'number') o[k] = v ? v - this.t0 : 0;
        else if (/^(status|phase|error|lastSeq|streaming|busy|identifying|gacha|taskId|triggerAddress|runnerContainment|endStop|dlv|awaitId|productMode)$/.test(k)) o[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
      }
      for (const k of ['token', 'runTok', 'idTok']) if (c[k]) o[k + 'Jwt'] = this.jwtOf(c[k]) || String(c[k]).slice(0, 12) + '…';
      try { o.lastMessages = JSON.parse(this.red(JSON.stringify((c.messages || []).slice(-4)))); } catch {}
      try { if (c.info) o.info = JSON.parse(this.red(JSON.stringify(c.info))); } catch {}
    }
    try { o.model = Models.get(sid); } catch {}
    try { o.trace = JSON.parse(this.red(JSON.stringify((Trace.turns?.(sid) || []).slice(-3)))); } catch {}
    return o;
  },
  // ---- 开始 / 停止 ----
  start(label, auto) {
    if (this.on) return;
    Object.assign(this, { on: true, t0: now(), label: String(label || '').trim(), auto: auto !== false, reqs: [], evs: [], size: 0, seq: 0, sids: new Set(), sent: new Set(), snaps: {}, full: false, finishing: false, startedAt: new Date().toISOString() });
    const cur = Tabs.cur?.sid; if (cur) { this.sids.add(cur); this.snaps['start:' + cur] = this.snap(cur); }
    window.__capFetch = (u, o, real) => this.fetch(u, o, real);
    this.hook();
    clearTimeout(this.maxT); this.maxT = setTimeout(() => { if (this.on) { toast('抓日志已到 30 分钟上限，自动停止'); this.stop('30 分钟上限'); } }, 30 * 60e3);
    clearInterval(this.tick); this.tick = setInterval(() => this.paint(), 1000);
    this.ev('start', { label: this.label, auto: this.auto, focus: cur || '' });
    this.paint();
    toast(this.auto ? '开始抓日志：现在发送消息，本轮回复结束后会自动停止并保存' : '开始抓日志：完成后点「停止」保存');
  },
  hook() {
    if (this.hooked) return; this.hooked = true;
    const emit = Bus.emit.bind(Bus);
    Bus.emit = (e, ...a) => {
      if (this.on && !/^(pulse|update|history|quota|cap|pool|workspace|ip|stats)$/.test(e)) {
        try {
          const brief = a.map(x => x instanceof Chat ? { sid: x.sid, status: x.status, phase: x.phase, gacha: !!x.gacha } : x && typeof x === 'object' ? JSON.parse(this.red(JSON.stringify(x)).slice(0, 20000)) : x);
          this.ev('bus', { e, a: brief });
        } catch { this.ev('bus', { e }); }
        this.onBus(e, a);
      }
      return emit(e, ...a);
    };
    for (const lv of ['warn', 'error', 'log', 'info']) {
      const f = console[lv].bind(console);
      console[lv] = (...a) => { if (this.on) { try { this.ev('console', { lv, msg: this.red(a.map(x => x instanceof Error ? x.stack || x.message : typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')).slice(0, 4000) }); } catch {} } return f(...a); };
    }
    addEventListener('error', e => { if (this.on) this.ev('pageError', { msg: String(e.message || ''), src: e.filename + ':' + e.lineno }); });
    addEventListener('unhandledrejection', e => { if (this.on) this.ev('rejection', { msg: String(e.reason?.stack || e.reason?.message || e.reason || '') }); });
  },
  onBus(e, a) {
    const sid = a[0] instanceof Chat ? a[0].sid : typeof a[0] === 'string' ? a[0] : null;
    if ((e === 'sent' || e === 'created') && sid && !(a[0] instanceof Chat && a[0].gacha)) { this.sids.add(sid); this.sent.add(sid); if (!this.snaps['start:' + sid]) this.snaps['start:' + sid] = this.snap(sid); clearTimeout(this.stopT); }
    if (e === 'turn' && this.auto && sid && this.sent.has(sid)) {
      clearTimeout(this.stopT);
      // 等识别 / 运行记录的请求也记下来（最多再等 30 秒）
      this.stopT = setTimeout(async () => { const c = Chats.get?.(sid); for (let i = 0; i < 22 && c?.identifying; i++) await sleep(1000); if (this.on && !(c && (c.busy || c.streaming))) this.stop('本轮回复结束'); }, 8000);
      this.paint();
    }
  },
  async stop(why = '手动停止') {
    if (!this.on || this.finishing) return;
    this.finishing = true; clearTimeout(this.stopT); clearTimeout(this.maxT); this.paint();
    this.ev('stop', { why });
    // 结束前把涉及的对话从服务器再读一遍（原始返回也会被记录）
    const list = (this.sent.size ? [...this.sent] : [Tabs.cur?.sid].filter(Boolean)).slice(0, 4);
    for (const sid of list) {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      try { const r = await rawFetch('/api/chat/' + encodeURIComponent(sid), { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal }); await r.text().catch(() => ''); } catch {} finally { clearTimeout(tm); }
      // 实时通道回放（本轮的原始记录，含记录头；错过直播时靠它）
      const c = Chats.get?.(sid);
      if (c?.token) {
        const ctl2 = new AbortController(), tm2 = setTimeout(() => ctl2.abort(), 8000);
        try {
          const r = await rawFetch(OUT(sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + c.token, 'Timeout-Seconds': '3', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +(c.lastSeq || 0) - 600)) }, signal: ctl2.signal, cache: 'no-store', credentials: 'same-origin' });
          await r.text().catch(() => '');
        } catch {} finally { clearTimeout(tm2); }
      }
    }
    await sleep(400);
    for (const sid of this.sids) this.snaps['end:' + sid] = this.snap(sid);
    this.on = false; window.__capFetch = null; clearInterval(this.tick);
    let env = {}; try { env = { version: VERSION, platform: Host.platform, ua: navigator.userAgent, email: UI.me?.email || UI.host?.account?.email || '', account: UI.host?.account ? { name: UI.host.account.name, region: UI.host.account.region || '', nodeId: UI.host.account.nodeId || '' } : null, tz: TZ }; } catch {}
    try {
      const i = await Promise.race([Host.info?.(), sleep(1500)]), a = i?.account, st = a?.status || {};
      if (i) env.host = { platform: i.platform, version: i.version, account: a ? { name: a.name, conn: String(a.proxy || '').replace(/\/\/[^@/]*@/, '//***@').slice(0, 80), proxyIp: a.proxyIp || '', region: a.region || '', ip: st.ip || '', loc: st.loc || '' } : null };
    } catch {}
    const out = {
      kind: 'arena-ai-capture', v: 1, label: this.label, startedAt: this.startedAt, endedAt: new Date().toISOString(), durationMs: now() - this.t0, stopReason: why,
      env, focusSids: [...this.sent], sids: [...this.sids],
      note: 't = 距离开始抓日志的毫秒数；reqs 是全部请求（实时流 chunks 为 [到达时间, 内容]）；snapshots 为对话在开始 / 结束时的状态、识别结果和运行记录',
      snapshots: this.snaps, events: this.evs, reqs: this.reqs,
    };
    const txt = JSON.stringify(out, null, 1);
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const lab = this.label.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    const name = `brana-log-${lab ? lab + '-' : ''}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
    this.finishing = false; this.paint();
    await this.save(name, txt, { reqs: this.reqs.length, evs: this.evs.length, why });
    this.reqs = []; this.evs = []; this.snaps = {};
  },
  async save(name, txt, st) {
    let r = null;
    try { r = Host.saveFile ? await Host.saveFile(name, 'application/json', txt) : null; } catch (e) { r = { error: String(e?.message || e) }; }
    if (!Host.saveFile || r?.error) { try { saveBlob(new Blob([txt], { type: 'application/json' }), name); r = { ok: true, path: '浏览器下载目录 / ' + name, blob: true }; } catch (e) { r = { error: r?.error || String(e?.message || e) }; } }
    const size = fmtBytes(new Blob([txt]).size);
    if (!r?.ok) { toast('日志保存失败：' + (r?.error || '未知错误'), 'err'); return; }
    const path = h('code', { class: 'cap-path' }, r.path || name);
    const back = modal(st.line ? '记录已保存' : '日志已保存', h('div', { class: 'cap-b' },
      h('p', {}, st.line ? size + ' · ' + st.line : (st.why ? st.why + ' · ' : '') + size + ' · ' + st.reqs + ' 个请求 · ' + st.evs + ' 条事件'), path,
      st.warn ? h('p', { class: 'cap-warn' }, '本地和服务器不一致：文件里 diff 一栏有逐条对比。已按服务器记录刷新了一次显示。') : null,
      st.line ? null : h('p', { class: 'dim' }, this.label ? '已知模型：' + this.label : '没有填已知模型'),
      h('p', { class: 'dim' }, Host.platform === 'android' ? '文件在手机的「下载 / BranaAi」里；也可以点「分享」直接发出去。' : '文件在「下载 / BranaAi-日志」文件夹里，把它发给我分析即可。')),
      K(h('button', { class: 'btn ghost', onclick: () => copyText(r.path || name) }, '复制路径'), h('span', { class: 'grow' }),
        Host.showFile && !r.blob ? h('button', { class: 'btn ghost', onclick: () => Host.showFile(r.path) }, '打开文件夹') : null,
        Host.shareFile && r.share ? h('button', { class: 'btn ghost', onclick: () => Host.shareFile(r.share, 'application/json') }, '分享') : null,
        h('button', { class: 'btn', onclick: () => back.remove() }, '关闭')), 'cap-m');
  },
  // ---- 抓记录：当前对话的完整记录（不用提前开启，出了问题当场抓，用来排查丢消息 / 提问卡片被吞）----
  // 内容：① 服务器上这个对话的全部消息（分页读完，原始返回）② 实时流从头回放的原始记录（含记录头 / 序号 / 时间）
  //      ③ 本地界面的全部消息和状态 ④ 本地和服务器的逐条对比（缺了哪条、哪张提问卡片）⑤ 客户端处理实时记录的轨迹（哪条被当成重复 / 旧记录 / 尾巴跳过）
  async replay(c) {
    const o = { from: 0, records: [], bytes: 0 }, ctl = new AbortController(), tm = setTimeout(() => { o.timedOut = true; ctl.abort(); }, 20000);
    try {
      await c.ensureToken();
      const res = await rawFetch(OUT(c.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + c.token, 'Timeout-Seconds': '3', 'X-Peek-Settled': '1', 'Last-Event-ID': '0' }, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
      o.status = res.status; if (!res.ok) { o.error = 'HTTP ' + res.status; return o; }
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        o.bytes += value.byteLength; if (o.bytes > 30e6) { o.truncated = true; ctl.abort(); break; }
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
          const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
          if (!data || data.trim() === '[DONE]') continue;
          try { for (const r of JSON.parse(data).records || []) o.records.push(r); } catch {}
        }
      }
    } catch (e) { if (!o.timedOut && !o.truncated) o.error = String(e?.name === 'AbortError' ? '已取消' : e?.message || e); }
    finally { clearTimeout(tm); }
    return o;
  },
  diff(srv, loc) {
    const body = m => (m.parts || []).filter(p => p.type !== 'step-start'),
      sig = m => body(m).map(p => String(p.type) + (p.toolCallId ? '#' + String(p.toolCallId).slice(-6) : '') + (p.state ? ':' + p.state : '')).join(','),
      L = new Map(loc.map(m => [m.id, m])), S = new Map(srv.map(m => [m.id, m])), fi = srv.findIndex(m => L.has(m.id));
    const onlyServer = srv.map((m, i) => ({ m, i })).filter(x => !L.has(x.m.id)).map(({ m, i }) => ({ id: m.id, role: m.role, parts: sig(m), pending: !!m.metadata?.pending, olderThanLocal: fi < 0 ? false : i < fi }));
    const onlyLocal = loc.filter(m => !S.has(m.id)).map(m => ({ id: m.id, role: m.role, parts: sig(m), local: !!m._local, failed: !!m.failed }));
    const differing = srv.filter(m => L.has(m.id) && sig(m) !== sig(L.get(m.id))).map(m => ({ id: m.id, role: m.role, server: sig(m), local: sig(L.get(m.id)), serverPending: !!m.metadata?.pending, localPending: !!L.get(m.id).metadata?.pending }));
    const hitl = [];
    for (const m of srv) for (const p of body(m)) { if (!p.toolCallId || !Hitl.name(p)) continue; const lm = L.get(m.id), lp = lm && body(lm).find(x => x.toolCallId === p.toolCallId); hitl.push({ toolCallId: p.toolCallId, tool: Hitl.name(p), msg: m.id, serverState: p.state, serverAwaiting: Hitl.awaiting(p), inLocal: !!lp, localState: lp?.state || null, localAwaiting: lp ? Hitl.awaiting(lp) : null }); }
    const lost = onlyServer.filter(x => !x.olderThanLocal).length, ask = hitl.filter(x => !x.inLocal).length;
    return { onlyServer, onlyLocal, differing, hitl, lost, askMissing: ask };
  },
  async dump() {
    if (this.on) { this.stop(); return; }
    if (this.dumping) return;
    const sid = Tabs.cur?.sid, c = sid ? Chats.get?.(sid) : null;
    if (!c) { toast('先打开一个对话再抓记录'); return; }
    this.dumping = true; this.paint(); toast('正在抓取这个对话的完整记录…');
    const t0 = now(), keep = this.t0; this.t0 = t0;
    try {
      const out = { kind: 'brana-chat-dump', v: 1, sid, at: new Date().toISOString(), note: '重点看 diff（本地和服务器逐条对比）、replay（实时流从头回放的原始记录）、clientTrace（客户端怎么处理每条实时记录，k=rec 的 r 为 dup / fence / stale 表示被跳过）。时间戳字段为相对抓取时刻的毫秒（负数 = 多久以前）。' };
      // ① 服务器消息（分页读完）
      const pages = []; let cursor = null, err = null;
      for (let i = 0; i < 400; i++) {
        const path = i === 0 ? '/api/chat/' + encodeURIComponent(sid) : '/api/chat/' + encodeURIComponent(sid) + '/messages?cursor=' + encodeURIComponent(cursor) + '&limit=20';
        let j; try { j = await api(path, { timeout: 25000 }); } catch (e) { err = String(e?.message || e); break; }
        pages.push(j); const pg = j?.pagination; if (!pg?.hasMore || !pg.cursor || pg.cursor === cursor) break; cursor = pg.cursor;
      }
      const srv = []; for (let i = pages.length - 1; i >= 0; i--) for (const m of pages[i]?.messages || []) if (!srv.some(x => x.id === m.id)) srv.push(m);
      out.server = { pages: pages.length, error: err, lastEventId: pages[0]?.lastEventId ?? null, title: pages[0]?.title ?? null, messageCount: srv.length, messages: srv };
      // ② 实时流从头回放
      const rp = await this.replay(c); out.replay = { ...rp, count: rp.records.length, firstSeq: rp.records[0]?.seq_num ?? null, lastSeq: rp.records.at(-1)?.seq_num ?? null };
      // ③ 本地
      let st = {}; try { st = this.snap(sid); } catch {}
      const loc = JSON.parse(JSON.stringify(c.messages || []));
      out.local = { state: st, hasMore: !!c.hasMore, messageCount: loc.length, messages: loc, hitlStage: [...(c.hitlStage?.keys?.() || [])], lastSeq: c.lastSeq ?? null, fence: c.fence ?? null, staleSkip: c.staleSkip || 0 };
      // ④ 对比
      out.diff = this.diff(srv, loc);
      // ⑤ 客户端轨迹
      out.clientTrace = (c.trc || []).map(e => ({ ...e, t: e.t - t0 }));
      let env = {}; try { env = { version: VERSION, platform: Host.platform, ua: navigator.userAgent, email: UI.me?.email || UI.host?.account?.email || '', tz: TZ }; } catch {}
      out.env = env;
      const d = out.diff, line = '服务器 ' + srv.length + ' 条 · 本地 ' + loc.length + ' 条 · 实时流回放 ' + out.replay.count + ' 条记录' + (d.lost || d.askMissing || d.differing.length ? ' · ⚠ 本地缺 ' + d.lost + ' 条消息、' + d.askMissing + ' 张提问卡片，' + d.differing.length + ' 条内容不一致' : ' · 本地和服务器一致');
      const dt = new Date(), pad = n => String(n).padStart(2, '0');
      const name = `brana-chat-${String(sid).slice(0, 8)}-${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}-${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}.json`;
      this.dumping = false; this.paint();
      await this.save(name, this.red(JSON.stringify(out, null, 1)), { line, warn: !!(d.lost || d.askMissing || d.differing.length) });
      // 抓完顺手按服务器记录刷新一次显示（抓取在前，所以文件里留着刷新前的样子）
      try { if (!c.busy && !c.streaming) await c.reconcile(); } catch {}
    } catch (e) { toast('抓记录失败：' + String(e?.message || e), 'err'); }
    finally { this.t0 = keep; this.dumping = false; this.paint(); }
  },
  // ---- 界面 ----
  ask() {
    if (this.on) { this.stop(); return; }
    const inp = h('input', { type: 'text', placeholder: '已知模型（可选），例如 opus-4.6、gpt-5.4', value: Prefs.capLast || '', spellcheck: false, autocomplete: 'off' });
    const auto = h('input', { type: 'checkbox', checked: true });
    const go = () => { Prefs.capLast = inp.value.trim(); savePrefs(); back.remove(); this.start(inp.value, auto.checked); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const back = modal('抓日志', h('div', { class: 'cap-b' },
      h('p', { class: 'dim' }, '开启后，发送消息 → 本轮回复结束后自动停止，期间所有请求、响应、实时流和事件保存成一个 JSON 文件。把文件发给我，我来分析是哪个模型。'),
      h('p', { class: 'dim' }, '如果你知道这次是哪个模型（例如用抽卡抽到的已知模型），填在下面，方便对照分析。密码和令牌签名会自动打码。'),
      inp, h('label', { class: 'cap-auto' }, auto, h('span', {}, '本轮回复结束后自动停止并保存'))),
      K(h('button', { class: 'btn ghost', onclick: () => back.remove() }, '取消'), h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: go }, '开始')), 'cap-m');
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  },
  label2() {
    if (this.finishing) return '正在保存…';
    if (this.dumping) return '抓取中…';
    if (!this.on) return '抓记录';
    const s = Math.floor(this.ms() / 1000);
    const tm = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    return document.body.classList.contains('m') ? tm : '录制 ' + tm + ' · ' + (this.size / 1e6).toFixed(1) + 'MB';
  },
  paint() {
    document.querySelectorAll('.capbtn').forEach(b => {
      b.hidden = !this.show() && !this.on;
      b.classList.toggle('on', this.on);
      const t = b.querySelector('.cap-t'); if (t) t.textContent = this.label2();
      b.classList.toggle('busy', !!this.dumping);
      b.title = this.on ? '点一下停止抓日志并保存' : '抓记录：一键保存当前对话的完整记录（服务器消息、实时流回放、本地对比），用来排查丢消息 / 卡片没出来';
    });
  },
  btn() {
    const b = h('button', { class: 'capbtn', onclick: () => this.dump() }, h('i', { class: 'cap-dot' }), icon('pvdl'), h('span', { class: 'cap-t' }, ''));
    setTimeout(() => this.paint(), 0);
    return b;
  },
  // 设置里的一行
  row(cls = 'set') {
    const box = h('input', { type: 'checkbox', checked: this.show() || null, onchange: e => { Prefs.capBtn = e.target.checked; savePrefs(); this.paint(); } });
    return h('div', { class: cls }, h('span', {}, h('b', {}, '抓记录（诊断）'), h('small', {}, '输入框旁的「抓记录」按钮：一键保存当前对话的完整记录（服务器全部消息、实时流从头回放、本地对比），出了问题当场抓，用来排查丢消息；「录制」是旧的发送前开启、回复结束自动保存的模式，用来分析模型识别')),
      h('div', { class: 'set-btns' }, h('label', { class: 'cap-auto' }, box, h('span', {}, '显示按钮')), h('button', { class: 'btn ghost sm', onclick: () => this.dump() }, '抓记录'), h('button', { class: 'btn ghost sm', onclick: () => this.ask() }, this.on ? '停止' : '录制')));
  },
};
