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
async function fixture({ platform = 'desktop', width = 1280, mode = 'ok', cached = true, online = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: platform === 'android', hasTouch: platform === 'android' });
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/html', body: '<!doctype html><html><body></body></html>' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-03T02:00:00Z') });
  await page.goto('https://arena.ai/robots.txt');
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
    const f = window.__fixture = { mode, online, meCalls: 0, requests: [], pending: [], reports: [], routeWrites: 0, records: [entry], historyMode: 'ok', historyRequests: [] };
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
      if (p === '/api/history/unified') {
        const cursor=url.searchParams.get('cursor'); f.historyRequests.push(cursor);
        if(f.historyMode==='malformed')return json({error:'temporary error'});
        if(f.historyMode==='rate')return json({error:'rate limited'},429,{'retry-after':'90'});
        const start=+(cursor||0),end=Math.min(start+50,f.records.length);
        return json({entries:f.records.slice(start,end),pagination:{hasMore:end<f.records.length,cursor:end<f.records.length?(f.historyMode==='repeat'&&cursor?cursor:String(end)):null}});
      }
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
  await page.addScriptTag({ content: bundle });
  await page.clock.runFor(600);
  await page.waitForFunction(() => !!window.__anc?.SessionGate.active || window.__anc?.UI.authed === true, { timeout: 5000 });
  return { page, context, errors };
}

async function settle(f) {
  for(let i=0;i<40;i++){
    await f.page.clock.runFor(500);await f.page.waitForTimeout(20);
    if(await f.page.evaluate(()=>!__anc.History.allP&&!__anc.History.refreshP&&!__anc.History.moreP))return;
  }
  throw Error('history scan did not settle');
}
async function refresh(f){await f.page.evaluate(()=>{void __anc.History.refresh().then(()=>__anc.History.loadAll());});await settle(f);}
async function ok(f,name){assert.deepEqual(f.errors,[],name);results.push(name);console.log('PASS',name);}
(async()=>{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const [platform,width]of [['desktop',1280],['android',390]]){
  const f=await fixture({platform,width});await settle(f);
  await f.page.evaluate(()=>{
    __fixture.records=Array.from({length:1503},(_,i)=>({id:'history-'+i,type:'agentic',title:'Quiet stories begin. '+('able acorn actor adobe after agile ahead aisle album alert alive amber. '.repeat(48))+i,updatedAt:new Date(Date.now()-i*1000).toISOString()}));
  });
  await refresh(f);
  let state=await f.page.evaluate(()=>({n:__anc.History.items.length,full:__anc.History.full,unique:new Set(__anc.History.items.map(e=>e.id)).size,draft:__anc.Tabs.cur.draft,err:__anc.History.err,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(state.n,1503);assert.equal(state.unique,1503);assert(state.full);assert.equal(state.draft,'保留的草稿');assert.equal(state.overflow,false);assert.equal(state.err,null);
  await ok(f,platform+': 1503 long encrypted-title rows, 31 pages, no duplicates or lost draft');
  await f.page.evaluate(()=>{__fixture.historyMode='malformed';});await refresh(f);
  assert.equal(await f.page.evaluate(()=>__anc.History.items.length),1503);
  assert(await f.page.evaluate(()=>!!__anc.History.err&&!__anc.History.full));
  await ok(f,platform+': malformed response keeps cached history and exposes a retryable error');
  await f.page.evaluate(()=>{__fixture.historyMode='repeat';__fixture.historyRequests=[];});await refresh(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),2);
  assert(await f.page.evaluate(()=>__anc.History.blocked&&!__anc.History.full));
  await ok(f,platform+': repeated cursor stops after one page instead of a 200-request loop');
  await f.page.evaluate(()=>{__fixture.historyMode='ok';__fixture.records=__fixture.records.slice(0,73);});await refresh(f);
  assert.equal(await f.page.evaluate(()=>__anc.History.items.length),73);assert(await f.page.evaluate(()=>__anc.History.full));
  await ok(f,platform+': a fresh complete scan removes stale cache without changing the account');
  await f.page.evaluate(()=>{__fixture.historyMode='rate';__fixture.historyRequests=[];});await refresh(f);await refresh(f);
  await f.page.clock.runFor(60000);await refresh(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),1);assert.equal(await f.page.evaluate(()=>__anc.History.items.length),73);
  await ok(f,platform+': Retry-After survives manual clicks and the minute refresh');
  // 冷却结束后自动补拉一次（不用手动点）；冷却期间界面是灰色提示，不是红色报错
  if(platform==='desktop')assert.equal(await f.page.evaluate(()=>!!document.querySelector('#list .lnote:not(.bad)')&&!document.querySelector('#list .lnote.bad')),true,platform+': 429 shows a quiet cooldown note, not a red error');
  await f.page.evaluate(()=>{__fixture.historyMode='ok';});await f.page.clock.runFor(31000);await settle(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),2,'exactly one automatic retry once the cooldown ends');
  assert(await f.page.evaluate(()=>!__anc.History.err));await refresh(f);
  assert(await f.page.evaluate(()=>__anc.History.full&&!__anc.History.err));
  await ok(f,platform+': the list refreshes by itself once the cooldown is over');
  // 一轮回复结束：已在列表里的对话只在本地挪到最前，不请求列表；本机新建的对话才去拉一次（20 秒内合并）
  await f.page.clock.runFor(200000);await settle(f);
  await f.page.evaluate(()=>{__fixture.historyRequests=[];const it=__anc.History.items,last=it[it.length-1];window.__lastId=last.id;__anc.History.touched(last.id);});
  await f.page.clock.runFor(1000);await settle(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),0,'a finished turn in a known chat does not refetch the list');
  assert.equal(await f.page.evaluate(()=>__anc.History.items[0].id===window.__lastId),true,'the chat moves to the top locally');
  await f.page.evaluate(()=>{__anc.History.items.unshift({type:'agentic',id:'019a0010-0000-7000-8000-00000000fff1',title:'新',updatedAt:new Date().toISOString(),_local:true});__anc.History.touched('019a0010-0000-7000-8000-00000000fff1');__anc.History.touched('019a0010-0000-7000-8000-00000000fff1');__anc.History.auto('new');});
  await f.page.clock.runFor(25000);await settle(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),1,'a new local chat triggers a single list fetch');
  await f.page.evaluate(()=>{__fixture.historyRequests=[];__anc.History.auto('tick');__anc.History.auto('front');});await f.page.clock.runFor(1000);await settle(f);
  assert.equal(await f.page.evaluate(()=>__fixture.historyRequests.length),0,'tick / front right after a fetch do nothing');
  await ok(f,platform+': turns and ticks do not hammer the list endpoint');
  if(platform==='desktop'&&process.env.HISTORY_SCREENSHOT)await f.page.screenshot({path:process.env.HISTORY_SCREENSHOT});
  await f.context.close();
 }
 console.log(JSON.stringify({passed:results.length,chromium:browser.version()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
