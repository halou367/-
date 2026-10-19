// Optional full-bundle regression: npm install --no-save playwright && npx playwright install chromium
// node scripts/check-draw-titles-browser.cjs (all traffic is local fixtures; no Brana account is used).
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
async function fixture({ platform = 'android', width = 390, mode = 'slow', cached = true, online = true, cloudTitle = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: platform === 'android', hasTouch: platform === 'android' });
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/html', body: '<!doctype html><html><body></body></html>' }));
  const page = await context.newPage(), errors = [];
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
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '连接测试' }] },
          { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: '已保留的回复内容' }], metadata: { pending: false } }],
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
(async()=>{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const [platform,width] of [['android',390],['desktop',1280]]){
  const f=await fixture({platform,width,mode:'ok'}),p=f.page;
  await p.waitForFunction(()=>__anc.UI.authed);
  await p.evaluate(()=>{__anc.GPop.openAny();});await p.clock.runFor(200);
  await p.locator('#gpop [data-ui=text]').click();
  const mode=p.locator('#gpop [data-k=mode]'),preferred=p.locator('#gpop [data-ui=preferred]');
  assert.deepEqual(await mode.locator('option').evaluateAll(x=>x.map(o=>o.value)),['habit','autoqa','svg','custom','fingerprint']);
  await mode.selectOption('svg');assert.equal(await preferred.isVisible(),false);assert.equal(await p.locator('#gpop [data-k=prompt]').isDisabled(),true);
  await mode.selectOption('custom');assert.equal(await preferred.isVisible(),false);
  await p.locator('#gpop [data-k=prompt]').fill('Reply with the word ready.');await p.locator('#gpop [data-k=prompt]').blur();assert.equal(await p.locator('#gpop [data-ui=saveText]').count(),0);
  await mode.selectOption('fingerprint');assert.equal(await preferred.isVisible(),true);
  await p.locator('#gpop [data-k=preferredKeywords]').fill('6-astra, opus-5.5\nfable');await p.locator('#gpop [data-k=preferredKeywords]').blur();await p.locator('#gpop [data-k=intervalSec]').fill('3000');await p.locator('#gpop [data-k=intervalSec]').press('Enter');assert.equal(await p.evaluate(()=>__anc.Gacha.settings().intervalMs),3000000);assert.equal(await p.locator('#gpop [data-k=intervalSec]').inputValue(),'3000');
  const settings=await p.evaluate(()=>__anc.Gacha.settings());assert.equal(settings.fingerprint,true);assert.equal(settings.parallel,1);assert.equal(settings.turbo,false);assert.equal(settings.prompt,'Reply with the word ready.');assert.deepEqual(settings.preferredKeywords,['6-astra','opus-5.5','fable']);
  const frame=await p.locator('#gpop .panel').boundingBox();assert(frame.x>=-1&&frame.x+frame.width<=width+1);
  await p.evaluate(()=>{__anc.GPop.close();__anc.UI.settings();});
  await p.getByRole('button',{name:'设置 / 解锁',exact:true}).click();
  assert.equal(await p.locator('.dlg input[type=password]').count(),1);
  const pass='phone desktop test passphrase';await p.locator('.dlg input[type=password]').fill(pass);
  await p.getByRole('button',{name:'解锁并恢复',exact:true}).click();await p.waitForFunction(()=>__anc.TitleCipher.unlocked&&document.querySelector('.dlg input[type=password]').value==='');
  assert.equal(await p.locator('.dlg input[type=password]').nth(0).inputValue(),'');
  const state=await p.evaluate(async sid=>{
   const a=__anc;a.Models.set(sid,{name:'gpt-6-astra',guess:true,fingerprint:{result:{signals:{relative_probability:.98}},reasoning:{score:222.2},avgProbeSec:33.3}});
   a.Notes.set(sid,'手机电脑同步测试');const packet=await a.TitleSync.wireTitle(sid);
   await a.History.rename(sid,packet.title);a.TitleSync.remember(sid,packet);const decoded=await a.TitleCipher.decrypt(sid,packet.title);
   let blocked=false;try{await a.History.rename(sid,'do not upload plaintext');}catch{blocked=true;}
   return{title:packet.title,encoded:a.TitleCipher.isEncoded(packet.title),length:packet.title.length,decoded,blocked,stored:Object.values(localStorage).some(v=>v.includes('phone desktop test passphrase'))};
  },sid);
  assert.equal(state.encoded,true);assert.equal(state.length,100);assert.equal(state.decoded[1],'gpt-6-astra');assert.equal(state.decoded[4],33.3);assert.equal(state.decoded[6],'手机电脑同步测试');assert.match(state.title,/^Qx /);assert.equal(state.blocked,true);assert.equal(state.stored,false);
  await p.locator('.dlg').getByRole('button',{name:'锁定',exact:true}).click();assert.equal(await p.evaluate(()=>__anc.TitleCipher.unlocked),false);
  const polls=await p.evaluate(async()=>{const n=()=>__fixture.requests.filter(r=>r.path==='/api/me/pulse').length,before=n();await Promise.all([__anc.Pulse.poll(),__anc.Pulse.poll(),__anc.Pin.check()]);return{before,after:n()};});assert.equal(polls.before,polls.after);
  await finish(f,platform+': three modes, saved keywords, title unlock/lock, encrypted PATCH, no plaintext or repeated Pulse');
 }

 // Two independent device contexts, sharing only the server's encrypted title (no local models/notes/passphrase transfer).
 const source=await fixture({platform:'desktop',width:1280,mode:'ok'});
 await source.page.waitForFunction(()=>__anc.TitleCipher.unlocked&&!__anc.TitleSync.busy);
 const uploaded=await source.page.evaluate(async sid=>{
   const a=__anc,c=a.chatOf(sid),entry={name:'sonnet-4',guess:true,fingerprint:{result:{signals:{relative_probability:.999}},reasoning:{score:78.2,tier:'high'},avgProbeSec:79.23}};
   __fixture.omitTitle=true;a.Prefs.autoTitle=true;c.gacha={fingerprint:true};a.Models.set(sid,entry);a.Bus.emit('model',c,entry);a.Notes.set(sid,'多端统一备注');
   const display=a.Fingerprint.describe(entry);if(a.Titles.view(sid).model!==display)throw Error('fingerprint and sidebar naming diverged');
   const busy=a.Gacha.busy;a.Gacha.busy=()=>true;a.Chats.set('other-busy-fixture',{busy:true});a.Notes.all[sid].modifiedAt=Date.now()-5000;
   try{await a.Titles.tick();}finally{a.Gacha.busy=busy;a.Chats.delete('other-busy-fixture');delete c.gacha;}
   return {title:__fixture.cloudTitle,display,pending:a.Notes.all[sid].dirty,persisted:a.Store.get('notes2')[sid].syncedData,defaultKey:a.TitleCipher.DEFAULT_PASSPHRASE};
 },sid);
 assert.equal(uploaded.defaultKey,'755287249');assert.equal(uploaded.pending,false);assert(uploaded.persisted);assert.match(uploaded.title,/^Qx /);assert.equal(uploaded.title.length,100);assert.equal(uploaded.display,'sonnet-4(99.9%)-78.2分');
 await finish(source,'desktop: completed draw result auto-saves during other work, with verified encrypted readback');
 for(const [platform,width]of [['android',390],['desktop',1280]]){

   const target=await fixture({platform,width,mode:'ok',cloudTitle:uploaded.title});
   await target.page.evaluate(()=>__anc.TitleSync.ingest());
   assert.equal(await target.page.evaluate(sid=>__anc.TitleSync.restored(sid)?.model,sid),'sonnet-4');
   const restored=await target.page.evaluate(sid=>({display:__anc.Titles.view(sid).model,note:__anc.Notes.get(sid),identity:__anc.Models.get(sid).name,writable:__anc.TitleSync.canWrite(sid)}),sid);
   assert.equal(restored.display,uploaded.display);assert.equal(restored.note,'多端统一备注');assert.equal(restored.identity,'gpt');assert(restored.writable);
   await target.page.evaluate(()=>{void __anc.TitleSync.open();});await target.page.clock.runFor(150);assert.equal(await target.page.locator('.dlg input').inputValue(),'755287249');
   const box=await target.page.locator('.dlg').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
   await target.page.getByRole('button',{name:'关闭',exact:true}).last().click();
   const archived=await target.page.evaluate(async sid=>{
     const a=__anc,c=a.chatOf(sid);c.status='idle';const entry={name:'待定',guess:true,fingerprint:{skipped:'visible-thinking',stopConfirmed:true,guard:{at:Date.now()},reasoning:{score:null}}};
     a.Models.set(sid,entry);a.Bus.emit('model',c,entry);await a.ProbeArchive.drain();
     return {archived:__fixture.archived,inHistory:a.History.items.some(e=>e.id===sid),pending:a.ProbeArchive.pending,deletes:__fixture.requests.filter(r=>r.method==='DELETE').length};
   },sid);
   assert(archived.archived);assert.equal(archived.inHistory,false);assert.equal(archived.pending,0);assert.equal(archived.deletes,0);
   await finish(target,platform+': cold-start default decode overrides stale presentation, and confirmed thinking skip archives without deletion');
 }

 for(const [platform,width]of [['android',390],['desktop',1280]]){
   const f=await fixture({platform,width,mode:'ok'});
   const result=await f.page.evaluate(async()=>{
     const a=__anc,rows=Array.from({length:12},(_,i)=>({id:'migration-'+i,type:'agentic',title:'old server title'})),byId=new Map(rows.map(e=>[e.id,e]));let writes=0,readbacks=0,rejections=0;
     __fixture.extra=async(input,opt={})=>{
       const p=new URL(typeof input==='string'?input:input.url,location.origin).pathname,id=p.split('/').at(-1),e=byId.get(id);
       const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
       if(p.startsWith('/api/history/agentic/')&&e&&opt.method==='PATCH'){
         const title=JSON.parse(opt.body).title;
         if(title.length>100){rejections++;return response({issues:[{code:'too_big',maximum:100,type:'string',path:['title']}]},400);}
         writes++;e.title=title;return response({});
       }
       if(p.startsWith('/api/chat/')&&e){readbacks++;return response({messages:[]});}
       if(p==='/api/history/unified')return response({entries:rows,pagination:{hasMore:false}});
       return null;
     };
     a.History.items=rows.map(e=>({...e}));a.History.full=true;
     for(const e of rows){a.Models.set(e.id,{name:'gpt-6-luna',fingerprint:{result:{signals:{relative_probability:.997}},reasoning:{score:91.7},avgProbeSec:31.4}});a.Notes.all[e.id]={n:'本机备注-'+e.id,t:1791080000123,dirty:true,lastStatus:400,f:4,e:'old error',nx:Date.now()+900000};}
     await a.TitleSync.start();for(let i=0;i<12;i++)await a.Titles.tick(true);
     return {writes,readbacks,rejections,pending:a.TitleSync.pending(),lengths:rows.map(e=>e.title.length),notes:rows.every(e=>a.Notes.get(e.id)==='本机备注-'+e.id),localNoteWrites:0};
   });
   assert.equal(result.writes,12);assert.equal(result.readbacks,12);assert.equal(result.rejections,0);assert.equal(result.pending,0);assert(result.notes);assert(result.lengths.every(n=>n===100));
   await finish(f,platform+': twelve legacy HTTP 400 records migrate through a strict 100-character server, retaining local notes');
 }
 console.log(JSON.stringify({passed:results.length,chromium:browser.version()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
