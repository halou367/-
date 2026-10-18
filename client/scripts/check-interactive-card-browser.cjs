// Interactive (ask_user) cards must show up in the client as soon as the server has them (no manual refresh).
// node scripts/check-interactive-card-browser.cjs (all traffic is local fixtures; no Brana account is used).
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { build } = require('../src/bundle');
const version = require('../package.json').version;
const bundle = build(path.join(__dirname, '../ui'), version);
const sid = '019a0010-0000-7000-8000-000000000009';
const results = [];
const HTML = `<!doctype html><html><head><style>
body{margin:0;background:#cfe8ff}
.bike{position:absolute;left:30px;top:60px;width:80px;height:80px;background:#e33;border-radius:50%;animation:go 4s linear infinite}
@keyframes go{from{transform:translateX(0)}to{transform:translateX(220px)}}
</style></head><body><svg width="400" height="200" viewBox="0 0 400 200"><rect y="150" width="400" height="50" fill="#5a5"/><circle cx="60" cy="100" r="30" fill="#fff" stroke="#000"/></svg><div class="bike"></div></body></html>`;

let browser;
async function fixture({ platform = 'android', width = 390, mode = 'slow', cached = true, online = true, cloudTitle = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: platform === 'android', hasTouch: platform === 'android' });
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/html', body: '<!doctype html><html><body></body></html>' }));
  const page = await context.newPage(), errors = [];
  await page.addInitScript(h => { window.__HTML = h; }, HTML);
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-03T02:00:00Z') });
  await page.goto('https://arena.ai/robots.txt');
  await page.evaluate(({ platform, mode, cached, online, sid, version, cloudTitle }) => {
    const prefs = { theme: 'dark', notify: false, autoTitle: false, pinOn: false, ipPoll: 60, keepAlive: true };
    const user = { id: 'fixture-user', email: 'fixture@example.invalid' };
    const account = { id: 'fixture', name: '连接测试', email: user.email, proxy: '', routeAuto: false };
    const entry = { id: sid, type: 'agentic', productMode: 'agentic', title: cloudTitle || '连接回归测试', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    const put = (k, value) => localStorage.setItem('anc:' + k, JSON.stringify(value));
    put('prefs', prefs);
    if(cloudTitle)put('models',{[sid]:{name:'gpt',guess:true,at:1}});
    if (cached) {
      put('me:u', user); put('tabs', [{ key: 'fixture-tab', sid, title: entry.title, draft: '保留的草稿' }]); put('tab', 'fixture-tab');
      put('hist:fixture', { at: Date.now(), items: [entry], full: true });
    }
    const f = window.__fixture = { mode, online, meCalls: 0, requests: [], pending: [], reports: [], routeWrites: 0, cloudTitle:entry.title, archived:false };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => f.online });
    const shared = { prefs, nodes: [], pippool: {} };
    window.BranaHost = {
      platform, info: async () => ({ platform, account, version }), ready: async () => null,
      listAccounts: async () => [account], shared: async (k, v) => v === undefined ? shared[k] ?? null : (shared[k] = v),
      getCred: async () => null, noteAccount: async value => { f.reports.push(value); }, setTitle: async () => {},
      takeCmd: async () => null, takeOpen: async () => null, takeEnter: () => false, launchPick: () => false,
      notifyPerm: async () => ({}), bgWork: async () => null, bgStatus: async () => null,
      fetchText: async () => ({ text: JSON.stringify({ version, files: {} }) }),
      login: async () => { f.manualLogin = true; }, back: async () => {}, openExternal: async () => {},
      exportAccounts: async () => [], saveAccount: async () => null,
    };
    window.grecaptcha = { enterprise: { ready: fn => fn(), execute: async () => 'fixture-captcha' } };
    const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
    const hold = signal => new Promise((resolve, reject) => {
      const item = { resolve, reject, signal }; f.pending.push(item);
      signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    });
    f.finish = () => { f.mode = 'ok'; for (const p of f.pending.splice(0)) if (!p.signal?.aborted) p.resolve(json({ user })); };
    window.fetch = async (input, opt = {}) => {
      const url = new URL(String(input), location.href), p = url.pathname;
      f.requests.push({ path: p, method: opt.method || 'GET' });
      if(f.extra){const response=await f.extra(input,opt);if(response)return response;}
      if (!(f.transportOnline ?? f.online)) throw new TypeError('Failed to fetch');
      if (p === '/api/me') {
        f.meCalls++;
        if (f.mode === 'slow') { await new Promise(resolve => setTimeout(resolve, 20000)); return json({ user }); }
        if (f.mode === 'hold' || f.mode === 'hold-outage') return hold(opt.signal);
        if (f.mode === 'outage') throw new TypeError('Failed to fetch');
        if (f.mode === '403') return json({ error: 'verification required' }, 403);
        if (f.mode === '401') return json({ error: 'Unauthorized' }, 401);
        if (f.mode === '429') return json({ error: 'Too many requests' }, 429, { 'retry-after': '90' });
        if (f.mode === 'html') return new Response('<html>verification</html>', { headers: { 'content-type': 'text/html' } });
        return json({ user });
      }
      if (f.mode === 'outage' || f.mode === 'hold-outage') throw new TypeError('Failed to fetch');
      if (p === '/cdn-cgi/trace') return new Response('ip=203.0.113.9\nloc=JP\ncolo=NRT');
      if (p === '/api/history/unified') return json({ entries: f.archived?[]:[{...entry,title:f.cloudTitle}], pagination: { hasMore: false } });
      if(p === '/api/history/agentic/'+sid && opt.method==='PATCH'){const title=JSON.parse(opt.body).title;if(typeof title!=='string'||title.length>100)return json({issues:[{code:'too_big',maximum:100,path:['title']}]},400);f.cloudTitle=title;return json({title:f.cloudTitle});}
      if(p === '/api/chat/'+sid+'/archive' && opt.method==='POST'){f.archived=true;return json({});}
      if (p === '/api/me/pulse') return json({ pulse: 100 });
      const token = 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
      if (p === '/api/chat/trigger-token') return json({ token });
      if (p === '/api/chat/' + sid) return json({title:f.omitTitle?undefined:f.cloudTitle,
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '画鹈鹕' }] },
          { id: 'assistant-1', role: 'assistant', parts: [{ type: 'tool-Write', toolCallId: 'w1', state: 'output-available', input: { path: '/home/user/pelican_cycling.html', content: window.__HTML }, output: { ok: true } }, { type: 'text', text: '已保留的回复内容' }], metadata: { pending: false } }],
        lastEventId: '42', publicAccessToken: token, pagination: { hasMore: false },
      });
      if (p.endsWith('/out')) return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
      return json({});
    };
  }, { platform, mode, cached, online, sid, version, cloudTitle });
  await page.addScriptTag({ content: bundle });
  await page.clock.runFor(600);
  await page.waitForFunction(() => !!window.__anc?.SessionGate.active || window.__anc?.UI.authed === true, { timeout: 5000 });
  return { page, context, errors };
}


const Q = { questions: [{ id: 'q1', question: '你想先做哪一项？', options: [{ id: 'a', label: '甲方案' }, { id: 'b', label: '乙方案' }] }] };
async function setupServer(p) {
  await p.evaluate(({ Q }) => {
    const f = window.__fixture, enc = new TextEncoder(); const token = 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
    const srv = window.__srv = { seq: 42, recs: [], streams: new Set(), Q,
      msgs: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '画鹈鹕' }] }, { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: '已保留的回复内容' }], metadata: { pending: false } }] };
    srv.push = (chunk, hdr) => { const rec = { seq_num: ++srv.seq, timestamp: String(Date.now()), headers: hdr || [], body: chunk ? JSON.stringify({ data: chunk }) : '' }; srv.recs.push(rec); for (const s of srv.streams) s.send([rec]); return rec; };
    srv.done = () => srv.push(null, [['trigger-control', 'turn-complete']]);
    f.extra = async (input, opt = {}) => {
      const u = new URL(String(input), location.href), p = u.pathname;
      if (p.endsWith('/out')) {
        const hd = opt.headers || {}, last = +(hd['Last-Event-ID'] ?? -1), ts = +(hd['Timeout-Seconds'] ?? 60); let ctrl;
        const s = { send(recs) { try { ctrl.enqueue(enc.encode('data: ' + JSON.stringify({ records: recs }) + '\n\n')); } catch {} }, close() { try { ctrl.enqueue(enc.encode('data: [DONE]\n\n')); ctrl.close(); } catch {} } };
        const body = new ReadableStream({ start(c) { ctrl = c; }, cancel() { srv.streams.delete(s); } });
        const old = srv.recs.filter(r => r.seq_num > last); if (old.length) s.send(old);
        if (ts <= 1) s.close(); else { srv.streams.add(s); opt.signal?.addEventListener('abort', () => { srv.streams.delete(s); try { ctrl.error(new DOMException('aborted', 'AbortError')); } catch {} }); setTimeout(() => { srv.streams.delete(s); s.close(); }, ts * 1000); }
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (p.endsWith('/in/append') && opt.method === 'POST') { srv.posts = (srv.posts || 0) + 1; return new Response('{}', { headers: { 'content-type': 'application/json' } }); }
      if (p === '/api/chat/' + window.__SID + '/messages') return new Response(JSON.stringify({ messages: srv.older || [], pagination: { hasMore: false } }), { headers: { 'content-type': 'application/json' } });
      if (p === '/api/chat/' + window.__SID) return new Response(JSON.stringify({ messages: srv.msgs, lastEventId: String(srv.seq), publicAccessToken: token, pagination: srv.older ? { hasMore: true, cursor: 'c1' } : { hasMore: false } }), { headers: { 'content-type': 'application/json' } });
    };
  }, { Q });
  await p.evaluate(s => { window.__SID = s; }, sid);
}
const shown = p => p.evaluate(() => [...document.querySelectorAll('#view .hq-q')].map(x => x.textContent).join('|'));
// 每 0.5 秒推进一次时钟，直到卡片出现（最多 maxMs）；返回出现的时刻（毫秒），没出现 = null
async function until(p, maxMs, step = 500) { for (let t = 0; t <= maxMs; t += step) { if ((await shown(p)).includes('你想先做哪一项')) return t; await p.clock.runFor(step); await p.waitForTimeout(25); } return null; }
const chunks = (id, extra = []) => [
  { type: 'start', messageId: id }, { type: 'start-step' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '先确认一下：' }, { type: 'text-end', id: 't' },
  { type: 'tool-input-start', toolCallId: 'ask1', toolName: 'ask_user' }, { type: 'tool-input-available', toolCallId: 'ask1', toolName: 'ask_user', input: Q }, ...extra];
const persisted = (id, pending) => ({ id, role: 'assistant', parts: [{ type: 'step-start' }, { type: 'text', text: '先确认一下：', state: 'done' }, { type: 'tool-ask_user', toolCallId: 'ask1', state: 'input-available', input: Q }], metadata: { pending } });
async function sendOwn(p) {
  await p.evaluate(() => { window.__sent = __anc.Chats.get(__SID).send('帮我做个东西').catch(e => { window.__sendErr = String(e?.message || e); }); });
  for (let i = 0; i < 20 && !(await p.evaluate(() => __srv.posts > 0)); i++) { await p.clock.runFor(300); await p.waitForTimeout(25); }
}
const SCEN = {
  // 另一台设备（网页）发起的一轮，正常结束
  async 'web turn, normal ending'(p) {
    await p.evaluate(() => { const s = __srv; s.msgs.push({ id: 'user-2', role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] }); s.push({ type: 'data-agent-dispatch', data: { inputId: 'user-2' }, transient: true });
      for (const c of ['start', 'start-step']) s.push({ type: c, messageId: 'a2' }); });
    await p.clock.runFor(300);
    await p.evaluate(({ c, m }) => { for (const x of c.slice(2)) __srv.push(x); __srv.push({ type: 'finish-step' }); __srv.push({ type: 'finish' }); __srv.msgs.push(m); __srv.done(); }, { c: chunks('a2'), m: persisted('a2', false) });
  },
  // 结束标记（finish / turn-complete）一直没来，服务器记录里这条是 pending
  async 'web turn, no finish / turn-complete'(p) {
    await p.evaluate(({ c, m }) => { const s = __srv; s.msgs.push({ id: 'user-2', role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] }); s.push({ type: 'data-agent-dispatch', data: { inputId: 'user-2' }, transient: true }); for (const x of c) s.push(x); s.msgs.push(m); }, { c: chunks('a2'), m: persisted('a2', true) });
  },
  // 空闲监听从中途接到：没读到 start / 分派，只有后面的内容记录
  async 'web turn, mid-turn records only'(p) {
    await p.evaluate(({ c, m }) => { const s = __srv; s.msgs.push({ id: 'user-2', role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] }); for (const x of c.slice(2)) s.push(x); s.msgs.push(m); s.done(); }, { c: chunks('a2'), m: persisted('a2', false) });
  },
  // 实时记录整段丢了，只有服务器记录里有
  async 'records lost, only the saved chat has it'(p) {
    await p.evaluate(({ m }) => { const s = __srv; s.msgs.push({ id: 'user-2', role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] }); s.msgs.push(m); }, { m: persisted('a2', false) });
  },

  // ---- 自己在客户端发消息，服务器回一张提问卡片 ----
  async 'own turn, normal ending'(p) {
    await sendOwn(p);
    await p.evaluate(({ c, m }) => { const s = __srv, uid = __anc.Chats.get(__SID).messages.findLast(x => x.role === 'user').id; s.msgs.push({ id: uid, role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] });
      s.push({ type: 'data-agent-dispatch', data: { inputId: uid }, transient: true }); for (const x of c) s.push(x); s.push({ type: 'finish-step' }); s.push({ type: 'finish' }); s.msgs.push(m); s.done(); }, { c: chunks('a2'), m: persisted('a2', false) });
  },
  async 'own turn, no finish / turn-complete (server keeps it pending)'(p) {
    await sendOwn(p);
    await p.evaluate(({ c, m }) => { const s = __srv, uid = __anc.Chats.get(__SID).messages.findLast(x => x.role === 'user').id; s.msgs.push({ id: uid, role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] });
      s.push({ type: 'data-agent-dispatch', data: { inputId: uid }, transient: true }); for (const x of c) s.push(x); s.msgs.push(m); }, { c: chunks('a2'), m: persisted('a2', true) });
  },
  async 'own turn, stream goes silent after the first text'(p) {
    await sendOwn(p);
    await p.evaluate(({ c, m }) => { const s = __srv, uid = __anc.Chats.get(__SID).messages.findLast(x => x.role === 'user').id; s.msgs.push({ id: uid, role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] });
      s.push({ type: 'data-agent-dispatch', data: { inputId: uid }, transient: true }); for (const x of c.slice(0, 4)) s.push(x); s.msgs.push(m); }, { c: chunks('a2'), m: persisted('a2', false) });
  },
  async 'own turn, saved chat lags behind turn-complete by 6 s'(p) {
    await sendOwn(p);
    await p.evaluate(({ c, m }) => { const s = __srv, uid = __anc.Chats.get(__SID).messages.findLast(x => x.role === 'user').id; s.msgs.push({ id: uid, role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] });
      s.push({ type: 'data-agent-dispatch', data: { inputId: uid }, transient: true }); for (const x of c) s.push(x); s.push({ type: 'finish-step' }); s.push({ type: 'finish' }); s.done(); setTimeout(() => s.msgs.push(m), 6000); }, { c: chunks('a2'), m: persisted('a2', false) });
  },
};
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const only = process.argv[2], report = [];
  for (const name of Object.keys(SCEN)) {
    if (only && !name.includes(only)) continue;
    const f = await fixture({ platform: 'desktop', width: 1300, mode: 'ok' }), p = f.page;
    await setupServer(p);
    for (let i = 0; i < 12; i++) { await p.clock.runFor(500); await p.waitForTimeout(20); }
    assert.ok(await p.evaluate(sid => __anc.Chats.get(sid)?.watching, sid).catch(() => false), name + ': idle watcher is attached');
    await SCEN[name](p);
    const t = await until(p, 40000);
    if (/web turn, normal/.test(name)) { const tr = await p.evaluate(sid => __anc.Chats.get(sid).trc || [], sid); assert.ok(tr.some(e => e.k === 'rec' && e.ty === 'tool-input-available' && e.r === 'ok') && tr.some(e => e.k === 'finish'), 'client trace records how each realtime record was handled: ' + JSON.stringify(tr.slice(-6))); }
    report.push([name, t]); console.log((t == null ? 'MISSING ' : 'ok ') + name + ' → ' + (t == null ? 'never within 40 s' : (t / 1000).toFixed(1) + ' s'));
    await f.context.close();
  }
  if (!only || only === 'dump') {   // 「抓记录」：完整对话记录（服务器全部消息 + 实时流回放 + 本地对比 + 客户端轨迹）
    const f = await fixture({ platform: 'android', width: 390, mode: 'ok' }), p = f.page; await setupServer(p);
    for (let i = 0; i < 12; i++) { await p.clock.runFor(500); await p.waitForTimeout(20); }
    // 服务器上有一轮（含提问卡片），实时记录没有送到本地：本地缺消息、缺卡片
    await p.evaluate(({ c, m }) => { const s = __srv, keep = s.streams; s.streams = new Set(); s.older = [{ id: 'user-0', role: 'user', parts: [{ type: 'text', text: '更早的一条' }] }, { id: 'assistant-0', role: 'assistant', parts: [{ type: 'text', text: '更早的回复' }], metadata: { pending: false } }];
      s.msgs.push({ id: 'user-2', role: 'user', parts: [{ type: 'text', text: '帮我做个东西' }] }); s.push({ type: 'data-agent-dispatch', data: { inputId: 'user-2' }, transient: true }); for (const x of c) s.push(x); s.msgs.push(m); s.done(); s.streams = keep; }, { c: chunks('a2'), m: persisted('a2', false) });
    await p.evaluate(() => { window.__dumps = []; __anc.Cap.save = async (name, txt, st) => { window.__dumps.push({ name, txt, st }); }; window.__dumpP = __anc.Cap.dump(); });
    for (let i = 0; i < 30 && !(await p.evaluate(() => __dumps.length)); i++) { await p.clock.runFor(400); await p.waitForTimeout(40); }
    const got = await p.evaluate(() => __dumps[0] && { name: __dumps[0].name, st: __dumps[0].st, out: JSON.parse(__dumps[0].txt) });
    assert.ok(got, '抓记录 produced a file'); const o = got.out;
    assert.equal(o.kind, 'brana-chat-dump'); assert.match(got.name, /^brana-chat-019a0010-\d{8}-\d{6}\.json$/);
    assert.equal(o.server.messageCount, 6, 'all server pages are read (older page included): ' + o.server.messageCount); assert.equal(o.server.pages, 2);
    assert.ok(o.replay.count >= 8 && o.replay.firstSeq === 43, 'realtime stream replayed from the start: ' + JSON.stringify({ c: o.replay.count, f: o.replay.firstSeq, e: o.replay.error }));
    assert.ok(o.diff.askMissing >= 1 && o.diff.lost >= 2 && o.diff.hitl.some(x => x.toolCallId === 'ask1' && !x.inLocal), 'diff names the missing messages / ask card: ' + JSON.stringify({ l: o.diff.lost, a: o.diff.askMissing }));
    assert.ok(Array.isArray(o.clientTrace) && o.local.messageCount === 2 && /⚠/.test(got.st.line) && got.st.warn, 'local state + trace + warning: ' + got.st.line);
    await p.evaluate(() => window.__dumpP);
    assert.ok((await until(p, 3000)) != null, 'after the capture the view is refreshed from the server (the missing card shows)');
    console.log('ok 抓记录 → ' + got.st.line); assert.deepEqual(f.errors, [], 'page errors'); await f.context.close();
  }
  if (!only) {   // 请求预算：空闲、什么都没变时，对账最多每 20 秒读一次，不会刷屏
    const f = await fixture({ platform: 'desktop', width: 1300, mode: 'ok' }), p = f.page; await setupServer(p);
    for (let i = 0; i < 12; i++) { await p.clock.runFor(500); await p.waitForTimeout(20); }
    const n0 = await p.evaluate(sid => __fixture.requests.filter(x => x.path === '/api/chat/' + sid && x.method === 'GET').length, sid);
    for (let i = 0; i < 60; i++) { await p.clock.runFor(1000); await p.waitForTimeout(15); }
    const n1 = await p.evaluate(sid => __fixture.requests.filter(x => x.path === '/api/chat/' + sid && x.method === 'GET').length, sid);
    console.log('idle 60 s: chat snapshot reads', n1 - n0); assert.ok(n1 - n0 <= 2, 'idle reconcile budget: ' + (n1 - n0));
    assert.deepEqual(f.errors, [], 'page errors'); await f.context.close();
  }
  await browser.close();
  if (process.env.REPORT_ONLY) return;
  const limit = n => /records lost/.test(n) ? 30000 : /goes silent/.test(n) ? 16000 : 12000;   // 对账节奏：空闲 20 秒、输出中静默 10 秒
  const late = report.filter(([n, t]) => t == null || t > limit(n)); assert.deepEqual(late, [], 'interactive card appeared late / never: ' + JSON.stringify(late));
})().catch(e => { console.error(e); process.exit(1); });
