// Runs the REAL main process + preload + full UI. No account and no external traffic.
// xvfb-run -a electron --no-sandbox client/scripts/check-runtime-electron.cjs
// Windows: node_modules/.bin/electron.cmd scripts/check-runtime-electron.cjs
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = require('../src/extension-test-identity').chooseDataRoot({appData:app.getPath('appData'),override:process.env.BRANA_EXTENSION_TEST_DATA||fs.mkdtempSync(path.join(os.tmpdir(),'brana-runtime-fixture-')),isPackaged:false});
fs.mkdirSync(root,{recursive:true});process.env.BRANA_EXTENSION_TEST_DATA=root;
app.setPath('userData', root); app.commandLine.appendSwitch('site-per-process');
const account = { id: 'runtime-fixture', name: 'runtime-fixture', proxy: '127.0.0.1:9', region: 'JP', routeAuto: false };
const prefs = { theme: 'dark', notify: false, autoTitle: false, pinOn: false, ipPoll: 120, keepAlive: false };
fs.writeFileSync(path.join(root, 'accounts.json'), JSON.stringify({ accounts: [account], open: [account.id], shared: { prefs } }));
const requests = [], failures = [], passed = [];
let win, stage = 'startup', failChild = false, failRoot = false, actualSend;
process.on('unhandledRejection', error => failures.push(String(error?.stack || error)));
const watchdog = setTimeout(() => { console.error('TIMEOUT', stage, failures); app.exit(1); }, 150000);
const pause = ms => new Promise(r => setTimeout(r,ms));
async function wait(check, ms = 20000) { const end=Date.now()+ms; let last; do { try { if (await Promise.race([Promise.resolve().then(check),pause(1000).then(()=>false)])) return; } catch(e) { last=e; } await pause(50); } while(Date.now()<end); throw Error('Timeout at '+stage+(last?' '+last.message:'')); }
function ok(name) { passed.push(name); console.log('PASS', name); }
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
app.whenReady().then(() => {
  const ses = session.fromPartition('persist:acct-' + account.id);
  // Intercept schemes before main's first navigation. Dead proxy is an additional fail-closed fixture fence.
  const handler = req => {
    const u = new URL(req.url); requests.push({ path: u.pathname, host: u.hostname, method: req.method });
    if (u.pathname === '/api/me') return json({ user: { id:'fixture',email:'fixture@example.invalid' } });
    if (u.pathname === '/api/history/unified') {
      const start = +(u.searchParams.get('cursor') || 0), end = Math.min(start+50,150);
      return json({ entries:Array.from({length:end-start},(_,i)=>({ id:'fixture-chat-'+(start+i),type:'agentic',title:'Fixture '+(start+i),updatedAt:new Date(1780000000000-(start+i)*1000).toISOString() })),pagination:{hasMore:end<150,cursor:end<150?String(end):null} });
    }
    if (u.pathname === '/api/me/pulse') return json({pulse:100});
    if (u.pathname === '/cdn-cgi/trace') return new Response('ip=203.0.113.9\nloc=JP\ncolo=NRT');
    if (u.pathname.startsWith('/api/')) return json({});
    if (u.pathname !== '/robots.txt' && u.hostname !== 'child.invalid') return json({version:require('../package.json').version,files:{}});
    return new Response('<!doctype html><html><body>Local runtime fixture</body></html>', {headers:{'content-type':'text/html'}});
  };
  ses.protocol.handle('https', handler); ses.protocol.handle('http', handler);
  void run().catch(async error => {
    console.error('FAIL',stage,error);
    try { const wc=win.webContents; console.error('FIXTURE_STATE',JSON.stringify({url:wc.getURL(),loading:wc.isLoading(),blocked:wc.session.__routeBlocked,uam:wc.__uam,failed:wc.__privacyFailed,navigating:!!win.__navigateP,attached:wc.debugger.isAttached()}));
      console.error('FIXTURE_UI',await Promise.race([wc.executeJavaScript('JSON.stringify({anc:!!window.__anc,authed:window.__anc?.UI.authed,history:window.__anc?.History.lastLoad,text:document.body?.innerText?.slice(0,300)})'),pause(2000).then(()=> 'unresponsive')]));
      console.error('FIXTURE_LOG',fs.readFileSync(path.join(root,'logs/runtime.jsonl'),'utf8'));
    } catch {}
    app.exit(1);
  });
});
require('../src/main');
async function run() {
  await wait(() => { win=BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('runtime-fixture')); return win; });
  const wc=win.webContents;
  const privacyFault=wc.__privacyFault;wc.__privacyFault=(reason,error)=>{console.log('FIXTURE_PRIVACY',reason,error?.message||'');privacyFault(reason,error);};
  if(process.env.RUNTIME_VERBOSE){for(const e of ['did-start-loading','did-finish-load','render-process-gone'])wc.on(e,()=>console.log('EVENT',e,stage,wc.getURL()));setInterval(()=>console.log('STATE',stage,{url:wc.getURL(),loading:wc.isLoading(),blocked:wc.session.__routeBlocked,uam:wc.__uam,failed:wc.__privacyFailed,navigating:!!win.__navigateP}),3000).unref();}
  const ready = () => wc.getURL().startsWith('https://arena.ai/robots.txt') && wc.executeJavaScript('!!window.__anc?.UI.authed && !!window.__anc?.History.lastLoad');
  const offline = () => wc.getURL().startsWith('file:') && wc.getURL().includes('offline.html') && !wc.isLoading();
  const retry = async () => { await wc.executeJavaScript('BranaHost.back()'); await wait(ready); assert.equal(sesBlocked(),false); };
  const sesBlocked = () => !!wc.session.__routeBlocked;
  const terminateRenderer = async () => {
    // forcefullyCrashRenderer can wait in the runner OS core-dump/Windows error-reporting handler.
    // Kill only this fixture's renderer, then require the real Electron exit event before testing recovery.
    const pid=wc.getOSProcessId();assert(pid>0&&pid!==process.pid);
    let listener;const gone=new Promise(resolve=>{listener=(_,details)=>resolve(details);wc.once('render-process-gone',listener);});
    try { process.kill(pid,'SIGKILL'); const details=await Promise.race([gone,pause(5000).then(()=>{throw Error('fixture renderer did not exit');})]); console.log('FIXTURE_RENDERER_EXIT',details.reason,details.exitCode); }
    finally {wc.removeListener('render-process-gone',listener);}
  };
  // beta.19：启动只取第一页，不在后台把全部历史翻一遍；侧栏滚到底 / 手动全量扫描时才继续加载
  await wait(ready); await wait(()=>wc.executeJavaScript('window.__anc.History.lastLoad>0 && window.__anc.History.items.length>0'));
  await pause(1500);
  assert.equal(await wc.executeJavaScript('!window.__anc.History.full && window.__anc.History.items.length<150 && !!window.__anc.History.hasMore'),true,'startup must not scan the whole history');
  ok('real main + preload + UI loads only the first history page at startup');
  await wc.executeJavaScript('void window.__anc.History.loadAll()'); await wait(()=>wc.executeJavaScript('window.__anc.History.items.length===150 && !!window.__anc.History.full'));
  ok('an explicit full scan still loads all three history pages');
  await wc.executeJavaScript(`(()=>{const {Tabs,Drafts,Store}=__anc;Tabs.cur.draft='runtime fixture draft';Tabs.save();Drafts.setTab(Tabs.cur,[]);Store.set('runtime-proof','keep');})()`);
  await pause(500);
  stage='idle soak';
  await pause(Number(process.env.BRANA_RUNTIME_SOAK_MS || 65000));
  assert(!win.isDestroyed()); assert(await ready()); assert.equal(await wc.executeJavaScript('__anc.History.items.length'),150);
  ok('window survives idle interval and periodic history refresh');
  stage='debugger detach'; wc.debugger.detach(); await wait(offline); assert(sesBlocked());
  const n=requests.length; await pause(1200); assert.equal(requests.length,n,'manual privacy page does not auto-switch routes or send requests');
  assert(!win.isDestroyed()); await retry(); ok('debugger detach blocks traffic, retains window, explicit retry restores protection');
  actualSend=wc.debugger.sendCommand.bind(wc.debugger);
  wc.debugger.sendCommand=(method,params,sid)=>{
    if(method==='Page.enable' && ((sid&&failChild)||(!sid&&failRoot))) return Promise.reject(Error('fixture protection failure'));
    return actualSend(method,params,sid);
  };
  stage='child protection failure'; failChild=true;
  await wc.executeJavaScript('(()=>{const frame=document.createElement("iframe");frame.src="https://child.invalid/test";document.body.appendChild(frame);})()');
  await wait(offline); assert(!win.isDestroyed()); assert(sesBlocked()); failChild=false; await retry();
  ok('failed cross-origin child protection never closes the account window or goes direct');
  stage='root protection failure'; wc.debugger.detach(); await wait(offline); failRoot=true;
  await wc.executeJavaScript('BranaHost.back()'); await wait(()=>!win.__navigateP && offline());
  assert(sesBlocked()); assert(!win.isDestroyed()); failRoot=false; await retry();
  ok('root initialization failure retains a usable offline window and can recover');
  stage='renderer crash';
  // Deterministically reproduce a lost loadURL acknowledgement: renderer exit must release the navigation lock.
  const realLoad=wc.loadURL.bind(wc);let loseAcknowledgement=true;
  wc.loadURL=(url,...args)=>{const p=realLoad(url,...args);if(loseAcknowledgement&&url.startsWith('https://arena.ai/robots.txt')){loseAcknowledgement=false;void p.catch(()=>{});return new Promise(()=>{});}return p;};
  void wc.__navigate('https://arena.ai/robots.txt');
  await wait(()=>!loseAcknowledgement&&ready());assert(win.__navigateP,'lost navigation acknowledgement is still in flight');
  await terminateRenderer();
  await wait(()=>!win.__navigateP && ready(),30000); assert(!win.isDestroyed()); assert.equal(sesBlocked(),false);
  const state=await wc.executeJavaScript('({draft:__anc.Tabs.cur.draft,proof:__anc.Store.get("runtime-proof"),rtc:typeof RTCPeerConnection,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,lang:navigator.language})');
  assert.equal(state.draft,'runtime fixture draft'); assert.equal(state.proof,'keep'); assert.equal(state.rtc,'undefined'); assert.equal(state.zone,'Asia/Tokyo'); assert.equal(state.lang,'ja-JP');
  ok('actual renderer crash cancels a lost navigation acknowledgement and restores CDP, route, saved draft');
  // Three crashes within one minute must stop automatic recovery, not create a crash loop.
  stage='bounded crash recovery';
  await terminateRenderer(); await wait(()=>!win.__navigateP&&ready(),30000);
  await terminateRenderer(); await wait(offline); await pause(1500); assert(await offline()); assert(sesBlocked());
  ok('repeated renderer crashes stop at a visible, fail-closed manual retry page');
  assert.deepEqual(failures,[],'no unhandled promise rejection');
  assert.equal(requests.filter(r=>r.method==='POST'&&/create-chat|append/.test(r.path)).length,0,'recovery never resends a message');
  const db=JSON.parse(fs.readFileSync(path.join(root,'accounts.json'),'utf8')); assert.equal(db.accounts.length,1); assert.equal(db.accounts[0].proxy,'127.0.0.1:9');
  const log=fs.readFileSync(path.join(root,'logs/runtime.jsonl'),'utf8'); assert(log.includes('render-process-gone')); assert(log.includes('privacy-blocked')); assert(!/fixture@example|runtime fixture draft|203\.0\.113|127\.0\.0/.test(log));
  console.log(JSON.stringify({passed:passed.length,electron:process.versions.electron,platform:process.platform,requests:requests.length,unhandled:failures.length}));
  clearTimeout(watchdog); app.exit(0);
}
