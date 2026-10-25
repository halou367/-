// Embedded html preview: Write row → right pane (workspace + model panels folded), 运行/代码 switch, 记录 → 鹈鹕测试图 → SVG 能力表.
// node scripts/check-html-preview-browser.cjs (all traffic is local fixtures; no Brana account is used).
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

(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [platform, width] of [['desktop', 1400], ['android', 390]]) {
    const f = await fixture({ platform, width, mode: 'ok' }), p = f.page, mob = platform === 'android';
    for (let i = 0; i < 40 && !(await p.locator('details.wcard.pvable summary').count()); i++) { await p.clock.runFor(250); await p.waitForTimeout(30); }
    if (!(await p.locator('details.wcard.pvable summary').count())) { console.log(await p.evaluate(() => document.body.innerText.slice(0, 600))); console.log(await p.evaluate(() => document.querySelector('#view')?.innerHTML.slice(0, 800))); }
    const snap = () => p.evaluate(() => ({ cls: document.body.className, dock: getComputedStyle(document.querySelector('#dockwrap')).display, dockW: document.querySelector('#dockwrap').getBoundingClientRect().width, ws: getComputedStyle(document.querySelector('#ws')).display, pv: getComputedStyle(document.querySelector('#pv')).display }));
    const before = await snap();
    assert.equal(before.pv, 'none', platform + ' pane hidden by default');
    await p.locator('details.wcard.pvable summary').click();
    await p.waitForSelector('#pv iframe.pv-frame');
    const on = await snap();
    assert.ok(on.cls.includes('pv-on') && on.pv !== 'none' && on.dock === 'none' && on.ws === 'none', platform + ' panes folded: ' + JSON.stringify(on));
    const fr = await p.evaluate(() => { const f = document.querySelector('#pv iframe.pv-frame'), pr = document.querySelector('#pv iframe.pv-probe'); const r = document.querySelector('#pv').getBoundingClientRect(); return { sandbox: f.getAttribute('sandbox'), probe: pr?.getAttribute('sandbox'), srcdoc: f.srcdoc.slice(0, 400), probeDoc: pr?.srcdoc.slice(0, 400), pvW: r.width, vw: innerWidth, pvH: r.height, vh: innerHeight }; });
    assert.equal(fr.sandbox, 'allow-scripts', platform + ' pane runs the page in an opaque-origin sandbox (no same-origin / popups / forms / top navigation)');
    assert.equal(fr.probe, 'allow-same-origin', platform + ' hidden measuring / record copy never runs scripts');
    assert.ok(/Content-Security-Policy/.test(fr.srcdoc) && /default-src 'none'; script-src 'unsafe-inline'/.test(fr.srcdoc) && !/connect-src/.test(fr.srcdoc), 'run CSP injected first, network still blocked');
    assert.ok(/default-src 'none'; style-src/.test(fr.probeDoc) && !/script-src/.test(fr.probeDoc), 'probe CSP has no script-src');
    if (mob) assert.ok(fr.pvW >= fr.vw - 1 && fr.pvH >= fr.vh - 1, 'mobile: pane is full screen ' + JSON.stringify(fr));
    else assert.ok(fr.pvW >= 340 && fr.pvW < fr.vw * 0.6, 'desktop pane width ' + fr.pvW);
    if (mob) {   // 安卓壳把状态栏 / 导航栏高度注入为 --sa-top / --sa-bottom：预览面板的顶部按钮和底部不能被它们盖住
      await p.evaluate(() => { const st = document.documentElement.style; st.setProperty('--sa-top', '32px'); st.setProperty('--sa-bottom', '24px'); });
      await p.waitForTimeout(450);   // 升起动画走完
      const ins = await p.evaluate(() => { const g = s => document.querySelector(s).getBoundingClientRect(); const pv = g('#pv'), h = g('#pv .pv-h'), b = g('#pv .pv-body'); return { hTop: h.top, bodyBottom: b.bottom, vh: innerHeight, pvTop: pv.top }; });
      assert.ok(ins.hTop >= 32 - 0.5, 'header sits below the status bar ' + JSON.stringify(ins)); assert.ok(ins.bodyBottom <= ins.vh - 24 + 0.5, 'content ends above the navigation bar ' + JSON.stringify(ins));
    }
    // 代码 / 运行 切换
    await p.locator('#pv .pv-seg button', { hasText: '代码' }).click();
    assert.ok((await p.locator('#pv .pv-code').textContent()).includes('@keyframes go'));
    await p.locator('#pv .pv-seg button', { hasText: '预览' }).click();   // beta.1 起 html 页签也统一叫「预览」
    await p.waitForSelector('#pv iframe.pv-frame');
    // 记录：动画跑一会儿再截，红色小车应该已经离开起点
    await p.waitForTimeout(1500);
    await p.locator('#pv .pv-rec').click();
    for (let i = 0; i < 40 && !(await p.evaluate(() => __anc.PelicanShots.all().length)); i++) { await p.clock.runFor(250); await p.waitForTimeout(40); }
    assert.equal(await p.evaluate(() => __anc.PelicanShots.all().length), 1, platform + ' one record saved: ' + await p.evaluate(() => [...document.querySelectorAll('.toast,#toast,[class*=toast]')].map(x => x.textContent).join('|')));
    const shot = await p.evaluate(async () => {
      const r = __anc.PelicanShots.all()[0], im = new Image(); im.src = r.url; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const k = im.width / document.querySelector('#pv iframe').clientWidth, px = (x, y) => [...g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
      return { mime: r.url.slice(0, 22), w: im.width, h: im.height, model: r.model, bg: px(5, 5), start: px(70, 100), moved: px(30 + 40 + 40 + 30, 100) };
    });
    assert.equal(shot.mime, 'data:image/jpeg;base64,'.slice(0, 22)); assert.ok(shot.w > 100 && shot.h > 60, 'image size');
    assert.ok(shot.bg[2] > 200 && shot.bg[0] < 230 && shot.bg[1] > 200, platform + ' sky background captured ' + shot.bg);
    const red = c => c[0] > 180 && c[1] < 90 && c[2] < 90;
    assert.ok(red(shot.moved) && !red(shot.start), platform + ' animation frame frozen at current time ' + JSON.stringify(shot));
    // 能力表：SVG 合法、带图片
    const svg = await p.evaluate(() => __anc.PelicanShots.tableSvg());
    assert.ok(/<image /.test(svg) && /推理分/.test(svg)); const bad = await p.evaluate(s => !!new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), svg); assert.equal(bad, false, 'table svg parses');
    // 概览卡片
    assert.ok(await p.evaluate(() => !!__anc.PelicanShots.card(__anc.Tabs?.cur?.sid || null)), 'overview card');
    // 图跟对话 id 绑定：型号被校准 / 改名之后图还在，且归到新型号下；换对话的图不混
    { const out = await p.evaluate(() => { const sid = __anc.Tabs.cur.sid, before = __anc.PelicanShots.forSid(sid).length, old = __anc.Models.get(sid);
        __anc.Models.set(sid, { name: 'qwen3.8-max-0902?', guess: true, fingerprint: { count: 3, result: null, reasoning: { score: 42 } } });
        const c = __anc.PelicanShots.card(sid), v = __anc.PelicanShots.forSid(sid);
        const res = { before, after: v.length, img: !!c?.querySelector('img.mc-pelimg'), empty: /还没有记录/.test(c?.textContent || ''), model: v[0]?.model, other: __anc.PelicanShots.forSid('another-chat').length };
        old ? __anc.Models.set(sid, old) : __anc.Models.del?.(sid); return res; });
      assert.ok(out.before >= 1 && out.after === out.before && out.img && !out.empty, platform + ' pelican image stays with the chat after the model changes: ' + JSON.stringify(out)); assert.equal(out.other, 0); }
    // 鹈鹕测试跑完自动存图：不开预览窗格，把对话里最后写出的 html 放进看不见的只读页面截图
    await p.evaluate(() => { window.__au = null; __anc.PelicanShots.auto(__anc.Tabs.cur.sid).then(r => { window.__au = r; }, e => { window.__au = { err: String(e) }; }); });
    for (let i = 0; i < 60 && !(await p.evaluate(() => window.__au)); i++) { await p.clock.runFor(250); await p.waitForTimeout(60); }
    const au = await p.evaluate(async () => {
      const r = window.__au; if (!r?.rec) return r; const im = new Image(); im.src = r.rec.url; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const out = { auto: r.rec.auto, file: r.rec.file, w: im.width, h: im.height, bg: [...g.getImageData(5, 5, 1, 1).data], hidden: document.querySelectorAll('iframe[style*="-99999px"]').length, count: __anc.PelicanShots.all().length };
      __anc.PelicanShots.del(r.rec.id); return out;
    });
    assert.ok(au && !au.err && !au.none, platform + ' auto shot: ' + JSON.stringify(au));
    assert.equal(au.auto, true); assert.equal(au.count, 2, 'saved next to the manual record'); assert.equal(au.hidden, 0, 'the hidden page is removed afterwards');
    assert.ok(au.w > 100 && au.h > 60 && au.bg[2] > 200 && au.bg[0] < 230, platform + ' auto shot has the page background ' + JSON.stringify(au));
    assert.match(String((await p.evaluate(() => __anc.PelicanShots.auto('no-such-chat').then(r => r.none)))), /没有写出/);
    if (process.env.SHOTS) { await p.screenshot({ path: '/tmp/pv-' + platform + '.png' }); const data = await p.evaluate(() => [__anc.PelicanShots.all()[0].url, __anc.PelicanShots.tableSvg()]); require('fs').writeFileSync('/tmp/shot-' + platform + '.jpg', Buffer.from(data[0].split(',')[1], 'base64')); require('fs').writeFileSync('/tmp/table-' + platform + '.svg', data[1]); }
    // 舞台：整体最大化 + 留白（横幅上下留白，竖版左右留白）；响应式页面按容器真实大小铺满
    const box = () => p.evaluate(() => { const f = document.querySelector('#pv iframe.pv-frame').getBoundingClientRect(), s = document.querySelector('#pv .pv-stage').getBoundingClientRect(); return { fw: f.width, fh: f.height, sw: s.width, sh: s.height, fx: f.left - s.left, fy: f.top - s.top }; });
    let b = await box();
    assert.ok(Math.abs(b.fw - b.sw) < 2 && Math.abs(b.fh - b.sh) < 2, platform + ' responsive page fills the stage at its real size ' + JSON.stringify(b));
    assert.ok(b.fw <= b.sw + 1 && b.fh <= b.sh + 1 && (Math.abs(b.fw - b.sw) < 2 || Math.abs(b.fh - b.sh) < 2), platform + ' content maximised ' + JSON.stringify(b));
    await p.evaluate(() => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: 'tall.svg', get: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 600"><rect width="300" height="600" fill="#9cf"/><circle cx="150" cy="300" r="80" fill="#f55"/></svg>' }));
    await p.waitForTimeout(300);
    b = await box();
    assert.ok(Math.abs(b.fw / b.fh - 0.5) < 0.03, platform + ' portrait svg keeps its ratio ' + JSON.stringify(b));
    assert.ok(b.fh >= b.sh - 2 && b.fw < b.sw - 4, platform + ' portrait: left/right margins, full height ' + JSON.stringify(b));
    // 工作区来源：相对 CSS / 图片内联
    const inl = await p.evaluate(async () => {
      const files = { 'site/css/s.css': 'body{background:#123456}', 'img/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' };
      const ctx = { entry: async q => files[q] != null ? { e: { type: 'file', size: files[q].length, inlineText: files[q] } } : null };
      return __anc.HtmlPreview.inlineAssets('<html><head><link rel="stylesheet" href="css/s.css"></head><body><img src="../img/a.svg"><img src="https://x.invalid/a.png"></body></html>', 'site/index.html', ctx);
    });
    assert.ok(/<style>body\{background:#123456\}<\/style>/.test(inl) && /src="data:/.test(inl), 'workspace assets inlined: ' + inl);
    // md：渲染预览 + 源码；js：只看代码；两者都没有「记录」
    await p.evaluate(() => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: 'docs/notes.md', get: () => '# 标题\n\n- 甲\n- 乙' }));
    assert.equal(await p.locator('#pv .pv-md h1').textContent(), '标题'); assert.equal(await p.locator('#pv .pv-rec').count(), 0);
    assert.deepEqual(await p.locator('#pv .pv-seg button').allTextContents(), ['预览', '源码']);
    await p.locator('#pv .pv-seg button', { hasText: '源码' }).click(); assert.ok((await p.locator('#pv .pv-code').textContent()).includes('# 标题'));
    await p.evaluate(() => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: 'src/app.js', get: () => 'const a = 1;\nconsole.log(a);' }));
    // beta.1 起：项目里有 html/svg 时，源码文件也保留「预览 / 代码」切换（预览渲染项目里的 html）；仍然不能记录鹈鹕测试图
    assert.ok((await p.locator('#pv .pv-code').textContent()).includes('console.log')); assert.deepEqual(await p.locator('#pv .pv-seg button').allTextContents(), ['预览', '代码']); assert.equal(await p.locator('#pv .pv-rec').count(), 0);
    assert.equal(await p.evaluate(() => [__anc.HtmlPreview.kindOf('a.html'), __anc.HtmlPreview.kindOf('a.SVG'), __anc.HtmlPreview.kindOf('x/b.md'), __anc.HtmlPreview.kindOf('c.js'), __anc.HtmlPreview.kindOf('d.png')].join()), 'html,html,md,code,');
    // 关闭 → 完全恢复
    await p.locator('#pv .pv-x').click();
    const after = await snap();
    assert.deepEqual(after, before, platform + ' layout restored exactly');
    // ---- 聊天里的小卡片 + 点开的预览（手机＝底部弹层）----
    await p.waitForSelector('.pvc iframe', { timeout: 4000 });
    await p.waitForTimeout(400);
    const card = await p.evaluate(() => { const c = document.querySelector('.pvc'), b = c.querySelector('.pvc-box').getBoundingClientRect(), fr = c.querySelector('iframe'); fr.__keep = 1; return { t: c.querySelector('.pvc-t').textContent, badge: c.querySelector('.pvc-badge').textContent, ratio: b.width / b.height, sandbox: fr.getAttribute('sandbox'), hasBike: /class="bike"/.test(fr.srcdoc || ''), probe: c.querySelectorAll('iframe.pv-probe').length, fit: fr.getBoundingClientRect().width <= b.width + 1 && fr.getBoundingClientRect().height <= b.height + 1 }; });
    assert.ok(card.t && card.badge === 'HTML' && Math.abs(card.ratio - 9 / 8) < 0.06 && card.hasBike && card.fit, platform + ' mini card ' + JSON.stringify(card));
    // beta.1 起小窗在不透明源里跑脚本（活动画），但绝不 allow-same-origin（拿不到客户端数据），测完即拆同源测量 iframe
    assert.equal(card.sandbox, 'allow-scripts', platform + ' thumbnail runs scripts only in an opaque origin: ' + card.sandbox);
    assert.equal(card.probe, 0, platform + ' measurement probe removed after analyse');
    { // 回归：标题 + 大幅 svg 的页面（svg 约占半屏）—— 小窗按宽度铺满、从页面顶部开始，不能被当成「整页 svg」上下留白、裁掉标题
      const page = '<!doctype html><html><head><title>T</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 24px;box-sizing:border-box;background:#f5f0e6}main{width:100%;max-width:880px}h1{font-size:56px;margin:30px 0}</style></head><body><main><header id="top">PELICAN PEDAL CLUB</header><h1>Life in the slow lane.</h1><svg viewBox="0 0 800 440" width="100%"><rect width="800" height="440" fill="#9cf"/></svg><footer>EST.</footer></main></body></html>';
      await p.evaluate(pg => { const el = __anc.HtmlPreview.card('regress-thumb', { path: 'r.html', get: () => pg }); el.style.cssText = 'position:fixed;left:0;top:0;width:' + Math.min(560, innerWidth) + 'px;z-index:99'; document.body.append(el); }, page);
      await p.waitForTimeout(600);
      const th = await p.evaluate(() => { const el = [...document.querySelectorAll('.pvc')].pop(), b = el.querySelector('.pvc-box').getBoundingClientRect(), f = el.querySelector('iframe'), r = f.getBoundingClientRect(); const out = { bw: b.width, fw: r.width, fy: r.top - b.top, bar: /scrollbar-width:\s*none/.test(f.getAttribute('srcdoc') || ''), top: f.style.top, transform: f.style.transform }; el.remove(); return out; });
      // 不透明源小窗不能再读 contentDocument：矩形铺满 + 顶部对齐（wfit 时 top=0、无缩放偏移）+ 页面自带 NOBAR 由 srcdoc 静态验证
      assert.ok(Math.abs(th.fw - th.bw) < 3 && Math.abs(th.fy) < 2 && th.bar && (!/scale/.test(th.transform || '') || th.top === '0px'), platform + ' thumbnail fills width from the top, no bands / inner scrollbar ' + JSON.stringify(th));
    }
    await p.locator('.pvc').click(); await p.waitForSelector('#pv iframe.pv-frame'); await p.waitForTimeout(450);
    const sheet = await p.evaluate(() => { const s = document.querySelector('#pv .pv-sheet').getBoundingClientRect(), hd = document.querySelector('#pv .pv-handle'); return { top: s.top, bottom: s.bottom, vh: innerHeight, handle: !!hd && getComputedStyle(hd).display !== 'none', same: document.querySelector('.pvc iframe').__keep === 1 }; });
    if (mob) assert.ok(sheet.handle && sheet.top > 10 && sheet.top < 60 && sheet.bottom <= sheet.vh + 1, platform + ' bottom sheet ' + JSON.stringify(sheet)); else assert.ok(!sheet.handle, platform + ' desktop pane has no drag handle');
    assert.ok(sheet.same, platform + ' card iframe stays the same node while the pane is open');
    // 窗格里页面是真的在跑：按钮能点（页面脚本生效）、滚轮滚动页面本身（不再缩放），没有盖在上面的触摸层
    assert.equal(await p.locator('#pv .pv-touch').count(), 0, platform + ' no zoom overlay over the page');
    await p.evaluate(() => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: 'live.html', get: () => '<html><body style="margin:0"><button id="b" style="font-size:30px">点我</button><div id="o">0</div><div style="height:3000px"></div><script>let n=0;b.onclick=()=>{o.textContent=++n;document.body.dataset.n=n;}</script></body></html>' }));
    await p.waitForTimeout(400);
    const live = p.frameLocator('#pv iframe.pv-frame');
    await live.locator('#b').click(); await live.locator('#b').click();
    assert.equal(await live.locator('#o').textContent(), '2', platform + ' buttons inside the preview are clickable and scripts run');
    const sb = await p.locator('#pv .pv-stage').boundingBox(); await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.mouse.wheel(0, 500); await p.waitForTimeout(300);
    assert.ok(await live.locator('html').evaluate(() => document.scrollingElement.scrollTop) > 100, platform + ' wheel scrolls the page');
    const escape = await live.locator('html').evaluate(async () => { const r = {}; try { r.parent = !!parent.document; } catch { r.parent = false; } try { r.storage = !!localStorage; } catch { r.storage = false; } try { await fetch('data:text/plain,x'); r.fetch = true; } catch { r.fetch = false; } r.origin = origin; return r; });
    assert.deepEqual(escape, { parent: false, storage: false, fetch: false, origin: 'null' }, platform + ' sandboxed page cannot reach the client: ' + JSON.stringify(escape));
    // 文件下拉
    await p.evaluate(() => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: 'a/other.html', get: () => '<html><body>hi</body></html>', keepMode: true, list: () => [{ path: 'one.html', get: () => '<html></html>' }, { path: 'a/other.html', get: () => '<html></html>' }] }));
    await p.locator('#pv .pv-file.many').click(); assert.equal(await p.locator('#pv .pv-menu .pv-mi').count(), 2, platform + ' file dropdown lists files');
    await p.keyboard.press('Escape'); assert.equal(await p.locator('#pv .pv-menu').count(), 0, platform + ' Esc closes the dropdown first'); assert.ok(await p.evaluate(() => __anc.HtmlPreview.on()), platform + ' pane still open');
    if (mob) {
      // 弹层开着时，屏幕左边缘右滑不会把侧栏抽出来
      await p.evaluate(() => { const t = (x, y) => new Touch({ identifier: 7, target: document.body, clientX: x, clientY: y }), fire = (type, x, y) => document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t(x, y)], changedTouches: [t(x, y)], bubbles: true })); fire('touchstart', 6, 400); fire('touchmove', 90, 404); fire('touchend', 160, 404); });
      assert.ok(!(await p.evaluate(() => document.body.classList.contains('drawer'))), 'edge swipe is ignored while the sheet is open');
      await p.locator('#pv .pv-file.many').click();
      assert.ok(await p.evaluate(() => window.__ancBack && window.__ancBack()), platform + ' Android back closes the dropdown'); assert.ok(await p.evaluate(() => __anc.HtmlPreview.on()));
      assert.ok(await p.evaluate(() => window.__ancBack && window.__ancBack()), platform + ' Android back closes the sheet'); await p.waitForTimeout(400);
    } else { await p.keyboard.press('Escape'); }
    assert.equal(await p.evaluate(() => __anc.HtmlPreview.on()), false, platform + ' pane closed');
    // 下拉手柄关闭（手机）
    if (mob) {
      await p.locator('.pvc').click(); await p.waitForSelector('#pv .pv-handle'); await p.waitForTimeout(450);
      const hb = await p.locator('#pv .pv-handle').boundingBox();
      await p.mouse.move(hb.x + hb.width / 2, hb.y + 8); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(hb.x + hb.width / 2, hb.y + 8 + i * 40); await p.mouse.up(); await p.waitForTimeout(500);
      assert.equal(await p.evaluate(() => __anc.HtmlPreview.on()), false, 'drag the handle down closes the sheet');
    }
    // 版面：写死桌面宽度的页面整体缩小；长网页按普通网页滚动
    const lay = async (name, html) => {
      await p.evaluate(([n, h]) => __anc.HtmlPreview.open({ sid: __anc.Tabs?.cur?.sid || null, path: n, get: () => h }), [name, html]); await p.waitForTimeout(500);
      return p.evaluate(() => { const fr = document.querySelector('#pv iframe.pv-frame'), st = document.querySelector('#pv .pv-stage'), r = fr.getBoundingClientRect(), s = st.getBoundingClientRect(); return { w: parseFloat(fr.style.width) || fr.clientWidth, vw: r.width, sw: s.width, inside: r.left >= s.left - 1 && r.right <= s.right + 1, pct: fr.style.width }; });
    };
    const fixed = await lay('fixed.html', '<!doctype html><body style="margin:0"><div style="width:1000px;height:400px;background:#9cf"></div></body>');
    assert.ok(fixed.w >= 1000 && fixed.vw <= fixed.sw + 1 && fixed.inside, platform + ' fixed-width page is scaled down as a whole ' + JSON.stringify(fixed));
    const tall = await lay('long.html', '<!doctype html><body style="margin:0"><div style="height:6000px;background:linear-gradient(#9cf,#f9c)"></div></body>');
    assert.ok(tall.pct === '100%' && tall.inside, platform + ' long page scrolls like a normal page ' + JSON.stringify(tall));
    await p.locator('#pv .pv-x').click(); await p.waitForTimeout(450);
    assert.deepEqual(f.errors, [], platform + ' page errors');
    console.log('PASS', platform); await f.context.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
