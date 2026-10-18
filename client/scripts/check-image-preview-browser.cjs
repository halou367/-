// 选图卡片可选（不选也能直接发下一条）+ 图片在右侧预览窗格里看（全屏不盖住标签栏 / 窗口按钮）+ 卡片刷新时图片节点复用（不闪）。
// node scripts/check-image-preview-browser.cjs [shotDir]（全部本地假数据，不用 Brana 账号）
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

const zlib = require('node:zlib');
function png(w, h, rgb) {   // 渐变色小图（不依赖任何图片库）
  const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0] * x / w | 0; raw[o + 1] = rgb[1] * y / h | 0; raw[o + 2] = rgb[2]; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const IMGS = { h1: png(640, 480, [255, 160, 90]), h2: png(480, 640, [90, 200, 255]) };
const shotDir = process.argv[2] || null;
const shot = async (p, n) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await p.screenshot({ path: path.join(shotDir, n + '.png') }); } };
const tick = async (p, n = 6, ms = 300) => { for (let i = 0; i < n; i++) { await p.clock.runFor(ms); await p.waitForTimeout(30); } };
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const f = await fixture({ platform: 'desktop', width: 1300, mode: 'ok' }), p = f.page;
  await f.context.route('**/api/chat/workspace/cas/user/**', r => { const k = r.request().url().split('/').pop(); return r.fulfill({ status: 200, contentType: 'image/png', body: IMGS[k] || IMGS.h1 }); });
  await setupServer(p);
  await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
  await p.evaluate(() => {
    const s = __srv; s.bodies = [];
    s.msgs = [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '画两张鹈鹕' }] },
      { id: '019a0010-0000-7000-8000-0000000000a1', role: 'assistant', metadata: { pending: false, nodeId: '019a0010-0000-7000-8000-0000000000a1' }, parts: [{ type: 'step-start' }, { type: 'text', text: '生成了两张候选图：', state: 'done' },
        { type: 'tool-generate_image', toolCallId: 'gi1', state: 'output-available', input: { prompt: '鹈鹕骑自行车' }, output: { status: 'awaiting_user_response', candidates: [{ hash: 'h1' }, { hash: 'h2' }] } }] }];
    const ex = __fixture.extra; __fixture.extra = async (input, opt = {}) => { if (String(input).endsWith('/in/append') && opt.method === 'POST') s.bodies.push(String(opt.body || '')); return ex(input, opt); };
  });
  await tick(p, 4);
  await p.evaluate(() => __anc.Chats.get(__SID).reload('fixture'));
  await tick(p, 10);
  const st0 = await p.evaluate(() => { const c = __anc.Chats.get(__SID); return { pend: __anc.Hitl ? 0 : -1, cards: document.querySelectorAll('#view .hitl.battle').length, imgs: document.querySelectorAll('#view .hb-c img').length, btn: document.querySelector('#comp .send, .comp .send, button.send')?.className || '' }; });
  console.log('battle card', JSON.stringify(st0));
  assert.equal(st0.cards, 1, 'battle card rendered'); assert.equal(st0.imgs, 2, 'two candidate images');
  await p.waitForFunction(() => [...document.querySelectorAll('#view .hb-c img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 5000 });
  // 刷新卡片（消息版本 +1、重新渲染）：图片还是同一个节点，不会重新加载
  const same = await p.evaluate(async () => { const c = __anc.Chats.get(__SID), a = [...document.querySelectorAll('#view .hb-c img')]; c.messages.at(-1).v = (c.messages.at(-1).v || 0) + 1; c.emit(); await new Promise(r => setTimeout(r, 50)); const b = [...document.querySelectorAll('#view .hb-c img')]; return a.length === b.length && a.every((x, i) => x === b[i] && x.isConnected); });
  await tick(p, 2); assert.ok(same, 'candidate <img> nodes are reused across re-renders'); console.log('ok images reused across re-render');
  await shot(p, '1-card');
  // 点图片 → 右侧预览窗格（不是整窗遮罩、不是新窗口）
  await p.click('#view .hb-c img >> nth=1'); await tick(p, 3);
  const pv = await p.evaluate(() => { const r = document.getElementById('pv').getBoundingClientRect(), t = document.getElementById('tabs').getBoundingClientRect(); return { on: document.body.classList.contains('pv-on'), img: !!document.querySelector('#pv .pv-imgb img.pv-img'), name: document.querySelector('#pv .pv-n')?.textContent, many: !!document.querySelector('#pv .pv-file.many'), left: r.left, top: r.top, tabsBottom: t.bottom, modal: !!document.querySelector('.att-zoom, .ws-preview, .zoom-back'), full: !!document.querySelector('#pv button.pv-fs') }; });
  console.log('preview', JSON.stringify(pv));
  assert.ok(pv.on && pv.img && !pv.modal, 'image opens in the side preview pane'); assert.equal(pv.name, '图片 2'); assert.ok(pv.many, 'dropdown lists the chat images'); assert.ok(pv.left > 300, 'pane sits on the right'); assert.ok(pv.full, 'fullscreen button');
  await p.waitForFunction(() => document.querySelector('#pv .pv-note .grow')?.textContent.includes('480 × 640'), null, { timeout: 4000 });
  await shot(p, '2-pane');
  await p.click('#pv .pv-file'); await tick(p, 1);
  const items = await p.evaluate(() => [...document.querySelectorAll('#pv .pv-mi b')].map(b => b.textContent)); assert.deepEqual(items, ['图片 1', '图片 2']); await shot(p, '3-menu');
  await p.click('#pv .pv-mi >> nth=0'); await tick(p, 2); assert.equal(await p.evaluate(() => document.querySelector('#pv .pv-n')?.textContent), '图片 1');
  await p.click('#pv button.pv-fs'); await tick(p, 2);
  const fs1 = await p.evaluate(() => { const r = document.getElementById('pv').getBoundingClientRect(), t = document.getElementById('tabs').getBoundingClientRect(), v = document.getElementById('view').getBoundingClientRect(); return { full: document.getElementById('pv').classList.contains('pv-full'), left: r.left, top: r.top, w: r.width, tabsBottom: t.bottom, viewLeft: v.left }; });
  console.log('fullscreen', JSON.stringify(fs1)); assert.ok(fs1.full && fs1.top >= fs1.tabsBottom - 1, 'fullscreen keeps the tab bar / window buttons visible'); assert.ok(Math.abs(fs1.left - fs1.viewLeft) < 2, 'fullscreen covers the whole chat area');
  await shot(p, '4-full');
  await p.click('#pv .pv-imgb img'); await tick(p, 1); assert.ok(await p.evaluate(() => document.querySelector('#pv .pv-imgb').classList.contains('nat')), 'click = natural size');
  await p.keyboard.press('Escape'); await tick(p, 1); assert.ok(await p.evaluate(() => document.body.classList.contains('pv-on') && !document.getElementById('pv').classList.contains('pv-full')), 'Esc leaves fullscreen first');
  await p.keyboard.press('Escape'); await tick(p, 1); assert.ok(await p.evaluate(() => !document.body.classList.contains('pv-on')), 'second Esc closes the pane');
  // 不选图直接发下一条：候选按 Skip 提交，文字一起发
  await p.evaluate(() => { document.activeElement?.blur?.(); });
  await p.fill('#view ~ * textarea, .comp textarea, textarea[name=message], #comp textarea', '换个风格，水彩').catch(async () => { await p.locator('textarea').last().fill('换个风格，水彩'); });
  await tick(p, 1);
  const mode = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^(发送|加入队列|停止)/.test(x.title || '')); return b?.title || ''; });
  console.log('composer button with a pending image card:', mode); assert.match(mode, /^发送/, 'send button stays "send" (not queue) while an image pick is pending');
  await shot(p, '5-typed');
  await p.locator('textarea').last().press('Enter');
  for (let i = 0; i < 30 && !(await p.evaluate(() => __srv.bodies.length)); i++) { await p.clock.runFor(300); await p.waitForTimeout(25); }
  const body = await p.evaluate(() => __srv.bodies[0] || '');
  assert.ok(body, 'message was sent without picking'); const j = JSON.parse(body), parts = j.payload?.message?.parts || j.message?.parts || [];
  const tr = parts.find(x => x.type === 'data-tool-results'), tx = parts.find(x => x.type === 'text');
  console.log('sent parts', JSON.stringify(parts));
  assert.ok(tr && tr.data[0].toolCallId === 'gi1' && tr.data[0].output.selection_method === 'skip' && tr.data[0].tool === 'generate_image', 'image card answered with Skip');
  assert.equal(tx?.text, '换个风格，水彩');
  await tick(p, 3); await shot(p, '6-sent');
  assert.ok(await p.evaluate(() => /已跳过/.test(document.querySelector('#view .hitl.battle .hq-tag')?.textContent || '')), 'card shows 已跳过');
  assert.deepEqual(f.errors, [], 'page errors'); await f.context.close();
  await browser.close(); console.log('ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
