// Mobile sidebar regression: opening the drawer must paint the conversation list without searching, and renames must show up.
// Optional full-bundle regression: npm install --no-save playwright && npx playwright install chromium ; node scripts/check-drawer-list-browser.cjs
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
      if (p === '/api/chat/' + sid && window.__lim > 0) { window.__lim--; return new Response('Too Many Requests', { status: 429, headers: { 'content-type': 'text/plain', 'retry-after': '1' } }); }
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

async function settle(f){for(let i=0;i<40;i++){await f.page.clock.runFor(500);await f.page.waitForTimeout(20);if(await f.page.evaluate(()=>!__anc.History.allP&&!__anc.History.refreshP&&!__anc.History.moreP))return;}}
(async()=>{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const f=await fixture({platform:'android',width:390});await settle(f);
  await f.page.evaluate(()=>{__fixture.records=Array.from({length:60},(_,i)=>({id:'019a0010-0000-7000-8000-0000000001'+String(i).padStart(2,'0'),type:'agentic',title:'对话标题 '+i,updatedAt:new Date(Date.now()-i*60000).toISOString()}));});
  await f.page.evaluate(()=>{void __anc.History.refresh().then(()=>__anc.History.loadAll());});await settle(f);
  const card=i=>f.page.evaluate(i=>document.querySelector('#list .card[data-sid="'+__anc.History.items[i].id+'"]')?.textContent||'',i);
  const drawer=async on=>{await f.page.evaluate(on=>document.body.classList.toggle('drawer',on),on);await f.page.clock.runFor(400);await f.page.waitForTimeout(50);};
  assert.equal(await f.page.evaluate(()=>document.querySelectorAll('#list .card').length),0,'closed drawer stays lazy');
  await drawer(true);
  assert.equal(await f.page.evaluate(()=>document.querySelectorAll('#list .card').length),60,'opening the drawer paints the list without searching');
  await drawer(false);
  await f.page.evaluate(()=>{__anc.Notes.set(__anc.History.items[0].id,'备注BBB');const e=__anc.History.items[1];e.title='外部改名CCC';__anc.Bus.emit('history');});
  await f.page.clock.runFor(2000);
  await drawer(true);
  assert.match(await card(0),/备注BBB/,'local rename made while the drawer was closed');
  assert.match(await card(1),/外部改名CCC/,'title changed elsewhere while the drawer was closed');
  // 选中另一个对话：侧栏「当前」高亮必须跟着走（不能残留上一个，更不能要刷新）
  const onSids=()=>f.page.evaluate(()=>[...document.querySelectorAll('#list .card.on')].map(c=>c.dataset.sid));
  for(const i of [3,5]){
    await f.page.evaluate(i=>document.querySelectorAll('#list .card')[i].click(),i);await f.page.clock.runFor(800);
    const want=await f.page.evaluate(()=>__anc.Tabs.cur.sid);
    assert.deepEqual(await onSids(),[want],'highlight moves immediately after switching, drawer closed');
    await drawer(true);assert.deepEqual(await onSids(),[want],'highlight still correct when the drawer is reopened');await drawer(false);
  }
  // 鼠标快速划过列表不会一口气预读一堆对话（网页不会；以前每张卡停 0.12 秒就拉一次，容易被服务端 429）
  await drawer(true);await f.page.evaluate(()=>{__fixture.requests.length=0;});
  for(let i=10;i<35;i++){await f.page.evaluate(i=>{document.querySelectorAll('#list .card')[i]?.dispatchEvent(new MouseEvent('mouseenter'));},i);await f.page.clock.runFor(150);await f.page.evaluate(i=>{document.querySelectorAll('#list .card')[i]?.dispatchEvent(new MouseEvent('mouseleave'));},i);}
  await f.page.clock.runFor(1000);
  assert.equal(await f.page.evaluate(()=>__fixture.requests.filter(r=>/^\/api\/chat\/[^/]+$/.test(r.path)).length),0,'a fast sweep prefetches nothing');
  // 打开对话遇到 429：按退避自动重试，不直接报「加载失败」
  await f.page.evaluate(()=>{window.__lim=2;});
  const open=await f.page.evaluate(async sid=>{const c=__anc.Chats.get(sid);c.loaded=false;c.messages=[];c._pre=null;c._preP=null;window.__ld=c.load(true).then(()=>'ok',e=>'err');return c.error;},sid);
  await f.page.clock.runFor(100);
  assert.match(await f.page.evaluate(sid=>__anc.Chats.get(sid).error||'',sid),/429.*自动重试/,'429 shows a waiting message, not a dead error');
  await f.page.clock.runFor(20000);
  assert.deepEqual(await f.page.evaluate(sid=>({ok:__anc.Chats.get(sid).loaded,err:__anc.Chats.get(sid).error}),sid),{ok:true,err:null},'chat loads after the retries');
  // beta.19 起 429 不再自动换出口 IP：Chat.load 只按 Retry-After / 退避等待（上面已验证），不调用 AutoRoute.unlimit
  // 当前对话卡片在任何状态下都必须和其它卡片明显不同：浅色 = 咖色，深色 = 更深的颜色；
  // 带置信度填充 / 命中 / 收藏（.cf .hit .vip）的卡片不能把它盖掉（以前 .cf 规则把它变成了半透明的灰）
  for (const theme of ['light','dark']) for (const vendor of ['', 'anthropic']) {
    const g=await fixture({platform:'desktop',width:1000});await settle(g);
    await g.page.evaluate(()=>{__fixture.records=Array.from({length:8},(_,i)=>({id:'019a0010-0000-7000-8000-0000000002'+String(i).padStart(2,'0'),type:'agentic',title:'对话标题 '+i,updatedAt:new Date(Date.now()-i*3600000).toISOString()}));});
    await g.page.evaluate(()=>{void __anc.History.refresh().then(()=>__anc.History.loadAll());});await settle(g);
    await g.page.evaluate(v=>{const it=__anc.History.items;[[0,'opus-5.5',1],[1,'opus-5.5',.55],[2,'sonnet-5.5',.9],[3,'opus-5.4',.4],[4,'opus-5.4',1]].forEach(([i,n,c])=>{__anc.Models.set(it[i].id,{name:n,at:Date.now(),fingerprint:{result:{signals:{relative_probability:c}}},sure:true});});
      __anc.Gacha.save({vendor:v});__anc.Bus.emit('model');__anc.Bus.emit('history');},vendor);
    await g.page.evaluate(t=>{__anc.Prefs.theme=t;__anc.UI.applyTheme();},theme);
    await g.page.clock.runFor(1500);
    for (const idx of [0,1,2,5]) {      // 带满置信度 / 部分置信度 / 带型号但无置信度 / 无型号
      await g.page.evaluate(i=>document.querySelectorAll('#list .card')[i].click(),idx);await g.page.clock.runFor(1500);await g.page.waitForTimeout(450);
      const r=await g.page.evaluate(()=>{const rgb=c=>{const x=document.createElement('canvas').getContext('2d');x.fillStyle='#000';x.fillStyle=c;x.fillRect(0,0,1,1);const d=x.getImageData(0,0,1,1).data;return [d[0],d[1],d[2]];};
        const cs=[...document.querySelectorAll('#list .card')],on=cs.filter(c=>c.classList.contains('on'));
        const under=el=>{for(let e=el;e;e=e.parentElement){const k=getComputedStyle(e).backgroundColor;if(!/rgba\(0, 0, 0, 0\)|transparent/.test(k))return k;}return '#fff';};
        const paint=c=>{const b=getComputedStyle(c),f=getComputedStyle(c,'::before');const own=/rgba\(0, 0, 0, 0\)/.test(b.backgroundColor)?under(c):b.backgroundColor;const fill=c.classList.contains('cf')&&f.display!=='none'?f.backgroundColor:own;return {bg:rgb(own),fill:rgb(fill)};};
        const lum=a=>(.2126*a[0]+.7152*a[1]+.0722*a[2])/255;
        return {n:on.length,on:on[0]&&paint(on[0]),ring:on[0]&&getComputedStyle(on[0]).boxShadow,others:cs.filter(c=>!c.classList.contains('on')).map(c=>paint(c).fill),lum:lum.toString()&&null};});
      assert.equal(r.n,1,'exactly one current card');
      const on=r.on.fill, d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
      const near=Math.min(...r.others.map(o=>d(on,o)));
      assert.ok(near>=(theme==='dark'?35:60),`${theme}/${vendor||'all'}/${idx}: current card fill ${on} is too close to another card (${near.toFixed(0)})`);
      if (theme==='dark') assert.ok(/0px 0px 0px 1px inset/.test(r.ring),`dark current card needs an outline, got ${r.ring}`);
      if (theme==='light') assert.ok(on[0]>on[2]+15&&on[0]<150&&on[0]>70,`light current card must be brown (咖色), got ${on}`);   // r > b, mid-dark
      else assert.ok(Math.max(...on)<40,`dark current card must be dark, got ${on}`);
    }
    assert.deepEqual(g.errors,[]);await g.context.close();
  }
  // opus-5-5 / opus-5.5 / claude-opus-5-5? 是同一个型号：侧栏同组（中间不画分隔线），新写入的名字统一成点号
  {
    const g=await fixture({platform:'desktop',width:1000});await settle(g);
    await g.page.evaluate(()=>{__fixture.records=Array.from({length:4},(_,i)=>({id:'019a0010-0000-7000-8000-0000000003'+String(i).padStart(2,'0'),type:'agentic',title:'对话标题 '+i,updatedAt:new Date(Date.now()-i*3600000).toISOString()}));});
    await g.page.evaluate(()=>{void __anc.History.refresh().then(()=>__anc.History.loadAll());});await settle(g);
    const r=await g.page.evaluate(()=>{const it=__anc.History.items;
      __anc.Models.set(it[0].id,{name:'claude-opus-5-5?',at:Date.now(),guess:true});__anc.Models.set(it[1].id,{name:'opus-5.5',at:Date.now(),sure:true});
      __anc.Models.all[it[2].id]={name:'opus-5-5',at:Date.now(),sure:true};                  // 旧版本留下的写法（不经过 set）
      __anc.Models.set(it[3].id,{name:'opus-5-1',at:Date.now(),sure:true});
      __anc.Gacha.save({vendor:'anthropic'});__anc.Bus.emit('model');__anc.Bus.emit('history');
      return it.slice(0,4).map(e=>__anc.Models.all[e.id].name);});
    await g.page.clock.runFor(1500);
    assert.deepEqual(r,['claude-opus-5.5?','opus-5.5','opus-5-5','opus-5.1'],'names written by Models.set use the dot form');
    const seps=await g.page.evaluate(()=>[...document.querySelectorAll('#list .card, #list .mline')].filter(e=>e.classList.contains('mline')||e.classList.contains('card')).map(e=>e.classList.contains('mline')?'|':'c').join(''));
    assert.match(seps,/^c{3}\|c/,'three 5.5 chats in ONE group, 5.1 in another: '+seps);
    assert.deepEqual(g.errors,[]);await g.context.close();
  }
  // 模型信息：有指纹的对话不再放「只推测到了厂商」，改成指纹溯源（最接近的 5 个指纹模型 + 置信度）
  {
    const g=await fixture({platform:'desktop',width:1300});await settle(g);
    await g.page.evaluate(()=>{__fixture.records=Array.from({length:2},(_,i)=>({id:'019a0010-0000-7000-8000-0000000004'+String(i).padStart(2,'0'),type:'agentic',title:'对话标题 '+i,updatedAt:new Date(Date.now()-i*3600000).toISOString()}));});
    await g.page.evaluate(()=>{void __anc.History.refresh().then(()=>__anc.History.loadAll());});await settle(g);
    await g.page.evaluate(()=>{const it=__anc.History.items,c=(id,p)=>({id,display_name:id,family:'claude',probability:p});
      __anc.Models.set(it[0].id,{name:'claude-fable-5.1?',guess:true,at:Date.now(),fingerprint:{count:3,reasoning:{score:10.4},result:{status:'clear',library:'WhatsMyLLM',nearest:c('claude-fable-5-1',.997),signals:{relative_probability:.997},candidates:[c('claude-fable-5-1',.997),c('claude-opus-5-5',.0021),c('claude-opus-5-1',.0006),c('gpt-6-astra',.0002),c('claude-sonnet-5-5',.0001),c('gemini-3',.00005)]}}});
      __anc.Bus.emit('model');__anc.Bus.emit('history');});
    await g.page.evaluate(()=>document.querySelectorAll('#list .card')[0].click());await g.page.clock.runFor(2000);await g.page.waitForTimeout(300);
    const r=await g.page.evaluate(()=>({rows:[...document.querySelectorAll('.mc-trace .mc-fp-row')].map(e=>e.innerText.replace(/\s+/g,' ')),top:document.querySelector('.mc-trace .mc-fp-row.top .mc-fp-m')?.innerText,old:document.body.innerText.includes('只推测到了厂商')}));
    assert.equal(r.rows.length,5,'five nearest fingerprint models'); assert.equal(r.top,'claude-fable-5.1'); assert.match(r.rows[0],/99\.7%/); assert.match(r.rows[1],/claude-opus-5\.5 0\.2%/);
    assert.equal(r.old,false,'no vendor-only card when a fingerprint exists');
    const hero=await g.page.evaluate(()=>({fam:document.querySelector('.mc-hero .mc-fam span')?.innerText,tier:document.querySelector('.mc-hero .mc-tier')?.innerText,meta:document.querySelector('.mc-hero .mc-meta')?.innerText,order:[...document.querySelectorAll('.dk-body > section, .dk-body > details')].map(e=>e.className.split(' ').find(c=>/^mc-(hero|tech|trace)$/.test(c))).filter(Boolean).join('>')}));
    assert.equal(hero.tier,'推理分 10.4','the tier badge slot shows the reasoning score'); assert.match(hero.fam,/fable-5\.1/); assert.match(hero.meta,/指纹识别/); assert.equal(hero.order,'mc-hero>mc-tech>mc-trace');
    // 指纹库切换：右上角库名是按钮，点一下切到下一个库，显示这次指纹在那个库里的候选和置信度；再点回到第一个
    // 旧记录只有一个库的候选：右上角照样能切到其他启用的库；没存排名的库用本对话已有的探针回复现算（这里没有探针回复 → 给出原因 + 重试）
    assert.equal(await g.page.locator('.mc-trace button.mc-fp-lib').count(),1,'old record: library switch still offered for other enabled libraries');
    await g.page.locator('.mc-trace button.mc-fp-lib').click();
    assert.deepEqual(await g.page.evaluate(()=>[...document.querySelectorAll('.mc-trace .mc-fp-menu button')].map(b=>b.innerText.replace(/\s+/g,' ').trim())),['✓ WhatsMyLLM','lm.ikale.io 现算'],'menu lists every enabled library');
    await g.page.locator('.mc-trace .mc-fp-menu button',{hasText:'lm.ikale.io'}).click();await g.page.clock.runFor(300);await g.page.waitForTimeout(200);
    const lz=await g.page.evaluate(()=>({lib:document.querySelector('.mc-trace .mc-fp-ln')?.innerText,note:document.querySelector('.mc-trace .note')?.innerText,retry:!!document.querySelector('.mc-trace .btn')}));
    assert.equal(lz.lib,'lm.ikale.io');assert.match(lz.note||'',/lm\.ikale\.io：.*(找不到|没加载完)/,'explains why it cannot compute '+JSON.stringify(lz));assert.ok(lz.retry);
    await g.page.locator('.mc-trace button.mc-fp-lib').click();await g.page.locator('.mc-trace .mc-fp-menu button',{hasText:'WhatsMyLLM'}).click();
    await g.page.evaluate(()=>{const it=__anc.History.items,c=(id,p)=>({id,display_name:id,family:'claude',probability:p});
      __anc.Models.set(it[0].id,{name:'claude-opus-5.5',at:Date.now(),fingerprint:{count:5,reasoning:{score:40},result:{status:'clear',library:'WhatsMyLLM',nearest:c('claude-opus-5-5',.948),signals:{relative_probability:.948},candidates:[c('claude-opus-5-5',.948),c('gpt-6-luna',.038),c('gpt-5.5',.004)],
        libraries:[{lib:'WhatsMyLLM',id:'claude-opus-5-5',status:'clear',p:.948,cands:[{id:'claude-opus-5-5',probability:.948},{id:'gpt-6-luna',probability:.038}]},{lib:'lm.ikale.io',id:'claude-opus-5.5',status:'close',p:.536,cands:[{id:'claude-opus-5.5',probability:.536},{id:'claude-opus-5.1',probability:.31},{id:'gpt-6-luna',probability:.1}]}]}}});
      __anc.Bus.emit('model');});
    await g.page.clock.runFor(500);await g.page.waitForTimeout(200);
    const pick=async name=>{await g.page.locator('.mc-trace button.mc-fp-lib').click();await g.page.locator('.mc-trace .mc-fp-menu button',{hasText:name}).click();};
    const view=()=>g.page.evaluate(()=>({lib:document.querySelector('.mc-trace .mc-fp-ln')?.innerText,rows:[...document.querySelectorAll('.mc-trace .mc-fp-row')].map(e=>e.innerText.replace(/\s+/g,' ')),sub:document.querySelector('.mc-trace .mc-fp-sub')?.innerText,on:document.querySelector('.mc-trace .mc-fp-libs .on')?.innerText}));
    let v=await view(); assert.equal(v.lib,'WhatsMyLLM'); assert.match(v.rows[0],/claude-opus-5\.5 94\.8%/);
    await pick('lm.ikale.io');
    v=await view(); assert.equal(v.lib,'lm.ikale.io','choosing a library in the menu shows its ranking'); assert.equal(v.rows.length,3); assert.match(v.rows[0],/claude-opus-5\.5 53\.6%/); assert.match(v.rows[1],/claude-opus-5\.1 31%/); assert.match(v.sub,/结果接近/); assert.match(v.on,/^lm\.ikale\.io/);
    await g.page.evaluate(()=>{__anc.Bus.emit('model');});await g.page.clock.runFor(500);await g.page.waitForTimeout(200);
    assert.equal((await view()).lib,'lm.ikale.io','choice survives a re-render');
    await pick('WhatsMyLLM');
    v=await view(); assert.equal(v.lib,'WhatsMyLLM','switches back to the first library'); assert.match(v.rows[0],/94\.8%/);
    // 测指纹进行中（对话 busy，只测完第 1 条）：溯源卡片照样显示，并标出「测试中 1/3 条」
    await g.page.evaluate(()=>{const sid=__anc.History.items[0].id,ch=__anc.Chats.get(sid),c=(id,p)=>({id,display_name:id,family:'gpt',probability:p});ch.busy=true;
      __anc.Models.set(sid,{name:'gpt-6-luna?',guess:true,fingerprint:{count:1,partial:true,goal:3,reasoning:{score:20},result:{status:'close',library:'WhatsMyLLM',nearest:c('gpt-6-luna',.61),signals:{relative_probability:.61},candidates:[c('gpt-6-luna',.61),c('gpt-6-astra',.3)]}}});__anc.Dock.soon();});
    await g.page.clock.runFor(500);await g.page.waitForTimeout(200);
    const live=await g.page.evaluate(()=>({sub:document.querySelector('.mc-trace .mc-fp-sub')?.innerText,top:document.querySelector('.mc-trace .mc-fp-row.top .mc-fp-m')?.innerText}));
    assert.match(live.sub||'',/测试中 1\/3 条/,'trace card is live while the probe chat is busy '+JSON.stringify(live)); assert.equal(live.top,'gpt-6-luna');
    await g.page.evaluate(()=>{__anc.Chats.get(__anc.History.items[0].id).busy=false;});
    assert.deepEqual(g.errors,[]);await g.context.close();
  }
  assert.deepEqual(f.errors,[]);
  console.log('PASS mobile drawer list + rename sync + current-card highlight');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
