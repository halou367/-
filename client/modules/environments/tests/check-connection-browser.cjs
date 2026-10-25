// Optional full-bundle regression: npm install --no-save playwright && npx playwright install chromium
// node scripts/check-connection-browser.cjs (all traffic is local fixtures; no Brana account is used).
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { build } = require('../src/bundle');
const version = require('../package.json').version;
const bundle = build(path.join(__dirname, '../ui'), version);
const sid = '019a0010-0000-7000-8000-000000000009';
const results = [];
let browser;
async function fixture({ platform = 'android', width = 390, mode = 'slow', cached = true, online = true, setup, setupData, path = '/robots.txt', before } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: platform === 'android', hasTouch: platform === 'android' });
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/html', body: '<!doctype html><html><body></body></html>' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-03T02:00:00Z') });
  await page.goto('https://arena.ai' + path);
  await page.evaluate(({ platform, mode, cached, online, sid, version }) => {
    const prefs = { theme: 'dark', notify: false, autoTitle: false, pinOn: false, ipPoll: 60, keepAlive: true };
    const user = { id: 'fixture-user', email: 'fixture@example.invalid' };
    const account = { id: 'fixture', name: '连接测试', email: user.email, proxy: '', routeAuto: false };
    const entry = { id: sid, type: 'agentic', productMode: 'agentic', title: '连接回归测试', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    const put = (k, value) => localStorage.setItem('anc:' + k, JSON.stringify(value));
    put('prefs', prefs);
    if (cached) {
      put('me:u', user); put('tabs', [{ key: 'fixture-tab', sid, title: entry.title, draft: '保留的草稿' }]); put('tab', 'fixture-tab');
      put('hist:fixture', { at: Date.now(), items: [entry], full: true });
    }
    const f = window.__fixture = { mode, online, meCalls: 0, requests: [], pending: [], reports: [], routeWrites: 0 };
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
    // Native lease fixture: renderer traffic is still intercepted; no real account is used.
    const leases=new Map();
    window.BranaHost.authTask=async request=>{
      const a=(window.BranaHost?await window.BranaHost.info():JSON.parse(window.BranaAndroid.info())).account,key=a.id,old=leases.get(key);
      if(request.op==='status')return {ok:true,locked:!!old,...(old||{})};
      if(request.op==='begin'||request.op==='prepare'){
        if(old&&old.email&&old.email.toLowerCase()!==request.email.toLowerCase())return {ok:false,error:'认证邮箱冲突'};
        if(request.op==='begin'&&old?.ip&&old.ip!==request.ip)return {ok:false,error:'实际出口已改变'};
        const value=old||{ticket:'fixture-task-'+key,email:request.email,kind:request.kind,ip:request.ip,expires:Date.now()+1800000};value.preparing=request.op==='prepare'&&!value.ip;if(request.op==='begin')value.ip=request.ip;leases.set(key,value);a.authLocked=true;
        return {ok:true,locked:true,...value};
      }
      if(!old||old.ticket!==request.ticket)return {ok:false,error:'认证任务已改变'};
      if(request.op==='stage'){old.stage=request.stage;old.kind=request.kind;return {ok:true,locked:true,...old};}
      if(request.op==='finish'&&((old.kind!=='login'&&old.email&&old.email.toLowerCase()!==request.email.toLowerCase())||old.ip!==request.ip))return {ok:false,error:'实际身份或出口已改变'};
      leases.delete(key);a.authLocked=false;return {ok:true,locked:false};
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
      if (p === '/api/history/unified') return json({ entries: [entry], pagination: { hasMore: false } });
      if (p === '/api/me/pulse') return json({ pulse: 100 });
      const token = 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
      if (p === '/api/chat/trigger-token') return json({ token });
      if (p === '/api/chat/' + sid) return json({
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '连接测试' }] },
          { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: '已保留的回复内容' }], metadata: { pending: false } }],
        lastEventId: '42', publicAccessToken: token, pagination: { hasMore: false },
      });
      if (p.endsWith('/out')) return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
      return json({});
    };
  }, { platform, mode, cached, online, sid, version });
  if (setup) await page.evaluate(setup, setupData);
  if (before) await page.evaluate(before);
  await page.addScriptTag({ content: bundle });
  await page.clock.runFor(600);
  if (path !== '/robots.txt') return { page, context, errors };   // 浏览器模式（官网页面 + 底栏）：不等客户端界面
  await page.waitForFunction(() => !!window.__anc?.SessionGate.active || window.__anc?.UI.authed === true || !!document.querySelector('.auth-form'), { timeout: 5000 });
  return { page, context, errors };
}
async function finish(f, name) {
  assert.deepEqual(f.errors, [], name + ' page errors');
  const state = await f.page.evaluate(() => ({
    posts: __fixture.requests.filter(x => x.method === 'POST' && (x.path.includes('/in/append') || x.path.includes('create-chat'))),
    meCalls: __fixture.meCalls, bar: document.querySelector('.connbar')?.textContent || '',
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
  assert.deepEqual(state.posts, [], name + ' must not resend/start business messages');
  assert.equal(state.horizontalOverflow, false, name + ' horizontal layout');
  results.push({ name, passed: true, meCalls: state.meCalls }); console.log('PASS', name);
  await f.context.close();
}
if (require.main === module) (async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [platform, width] of [['android', 390], ['desktop', 1280]]) {
    const f = await fixture({ platform, width, mode: 'slow' });
    await f.page.clock.runFor(13000);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    assert.equal(await f.page.evaluate(() => __fixture.meCalls), 1);
    assert.equal(await f.page.evaluate(() => !!__anc.UI.authed), false);
    assert.ok(await f.page.getByText('已保留的回复内容', { exact: true }).count());
    assert.ok(await f.page.locator('textarea').count());
    await f.page.clock.runFor(7500);
    await f.page.waitForFunction(() => __anc.UI.authed === true);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    assert.equal(await f.page.evaluate(() => __anc.Tabs.cur.draft), '保留的草稿');
    await finish(f, platform + ': 20-second session response preserves the chat and draft');
  }
  {
    const f = await fixture({ mode: 'hold' });
    await f.page.evaluate(() => { window.__healthTestTimer = setInterval(() => __anc.History.refresh(), 10000); });
    await f.page.clock.runFor(71000);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    assert.equal(await f.page.evaluate(() => !!__anc.UI.authed), false);
    assert.ok(await f.page.evaluate(() => __fixture.meCalls >= 2));
    await f.page.evaluate(() => __fixture.finish());
    await f.page.waitForFunction(() => __anc.UI.authed === true);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    await finish(f, 'Android: chat/API traffic suppresses a stale session-timeout banner without faking login');
  }
  {
    const f = await fixture({ mode: 'outage', width: 320 });
    await f.page.clock.runFor(4000);
    assert.match(await f.page.locator('.connbar').innerText(), /账号状态暂未核对成功/);
    assert.doesNotMatch(await f.page.locator('.connbar').innerText(), /连接 Brana 失败/);
    const before = await f.page.evaluate(() => {
      __fixture.mode = 'hold-outage'; const n = __fixture.meCalls;
      const button = document.querySelector('.connbar button'); for (let i = 0; i < 25; i++) button.click(); return n;
    });
    await f.page.clock.runFor(10);
    assert.equal(await f.page.evaluate(() => __fixture.meCalls), before + 1);
    assert.equal(await f.page.locator('.connbar button').first().isDisabled(), true);
    await f.page.evaluate(() => __fixture.finish()); await f.page.waitForFunction(() => __anc.UI.authed === true);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    await finish(f, '320px outage: accurate state, one manual retry and recovery without losing the draft');
  }
  for (const mode of ['403', 'html']) {
    const f = await fixture({ mode }); await f.page.clock.runFor(1000);
    assert.match(await f.page.locator('.connbar').innerText(), /验证|异常/);
    assert.equal(await f.page.evaluate(() => __anc.Store.get('me:u', null)?.id), 'fixture-user');
    assert.equal(await f.page.evaluate(() => !!__anc.UI.authed), false);
    await finish(f, 'Android: ' + mode + ' retains identity and offers explicit verification');
  }
  {
    const f = await fixture({ mode: '429', platform: 'desktop', width: 1280 });
    for (let i = 0; i < 15; i++) await f.page.evaluate(() => { dispatchEvent(new Event('focus')); __anc.SessionGate.active.wake(true); });
    await f.page.clock.runFor(80000); assert.equal(await f.page.evaluate(() => __fixture.meCalls), 1);
    await f.page.clock.runFor(12000); assert.equal(await f.page.evaluate(() => __fixture.meCalls), 2);
    await finish(f, 'Desktop: Retry-After is respected across focus and retry taps');
  }
  {
    const f = await fixture({ mode: 'ok', online: false });
    await f.page.clock.runFor(120000); assert.equal(await f.page.evaluate(() => __fixture.meCalls), 0);
    assert.match(await f.page.locator('.connbar').innerText(), /设备当前离线/);
    await f.page.evaluate(() => { __fixture.online = true; dispatchEvent(new Event('online')); });
    await f.page.waitForFunction(() => __anc.UI.authed === true); assert.equal(await f.page.evaluate(() => __fixture.meCalls), 1);
    await finish(f, 'Android: offline waiting resumes once when connectivity returns');
  }
  {
    const f = await fixture({ mode: 'ok', online: false });
    await f.page.evaluate(async () => { __fixture.transportOnline = true; await __anc.History.refresh(); });
    await f.page.waitForFunction(() => __anc.UI.authed === true);
    assert.equal(await f.page.evaluate(() => navigator.onLine), false);
    assert.equal(await f.page.locator('.connbar').count(), 0);
    await finish(f, 'Android VPN: actual API success overrides an inaccurate offline hint');
  }
  {
    const f = await fixture({ mode: '401' });
    assert.equal(await f.page.evaluate(() => __anc.Store.get('me:u', null)), null);
    assert.equal(await f.page.evaluate(() => __anc.UI.me), null);
    assert.ok(await f.page.locator('input[type="email"]').count());
    await finish(f, 'Expired login: real 401 reaches login UI rather than hiding authentication failure');
  }
  {
    const f = await fixture({ mode: '403', cached: false });
    assert.match(await f.page.locator('#view').innerText(), /验证|异常/);
    assert.equal(await f.page.evaluate(() => __anc.UI.me), null);
    await f.page.getByRole('button', { name: '登录 / 线路', exact: true }).click();
    await f.page.clock.runFor(100);
    assert.equal(await f.page.evaluate(() => __anc.SessionGate.active), null);
    assert.ok(await f.page.locator('input[type="email"]').count());
    await finish(f, 'Cold start: verification can be cancelled into the real login UI');
  }
  if (process.env.CONNECTION_RESULTS) fs.writeFileSync(process.env.CONNECTION_RESULTS, JSON.stringify({ chromium: browser.version(), version, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, chromium: browser.version() }));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); });

module.exports = { fixture, setBrowser(value) { browser = value; } };
