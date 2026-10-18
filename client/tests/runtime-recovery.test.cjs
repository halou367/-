const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const native=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const ua=native.slice(native.indexOf('async function uaMeta(wc)'),native.indexOf('// Google 登录等外部页面',native.indexOf('async function uaMeta(wc)')));
const tick=()=>new Promise(setImmediate);
function fixture(){
 const wc=new EventEmitter(),dbg=new EventEmitter(),calls=[],faults=[];let attached=false,dead=false,hook=()=>{};
 wc.debugger=dbg;wc.id=1;wc.getUserAgent=()=> 'Chrome/130.0.0.0';wc.isDestroyed=()=>dead;wc.stop=()=>calls.push(['stop']);wc.setWebRTCIPHandlingPolicy=()=>{};
 wc.session={__routeBlocked:false,closeAllConnections:async()=>{}};wc.__privacyFault=reason=>faults.push(reason);
 dbg.isAttached=()=>attached;dbg.attach=()=>{attached=true;};dbg.detach=()=>{attached=false;dbg.emit('detach');};
 dbg.sendCommand=async(m,p,sid)=>{calls.push([m,p,sid]);await hook(m,p,sid);return {identifier:'fixture'};};
 const ctx=vm.createContext({console,app:{getPreferredSystemLanguages:()=>['en-US']},BrowserPrivacy:require('../src/browser-privacy'),winAcct:()=>({region:'JP'}),UA:'Chrome/130.0.0.0',os,process:{platform:'win32',arch:'x64',versions:{chrome:'130.0.0.0'}},setTimeout,clearTimeout});vm.runInContext(ua+';this.protect=uaMeta;',ctx);
 const attach=(sid='child',id='iframe')=>dbg.emit('message',{},'Target.attachedToTarget',{sessionId:sid,targetInfo:{targetId:id,type:'iframe'}});
 return {wc,dbg,calls,faults,protect:()=>ctx.protect(wc),attach,hook:f=>hook=f,destroy:()=>{dead=true;wc.emit('destroyed');}};
}
test('child protection failure fences network without closing targets or resuming an unprotected child',async()=>{
 const f=fixture();await f.protect();f.hook((m,p,sid)=>{if(sid&&m==='Page.enable')throw Error('unsupported');});f.attach();await tick();await tick();
 assert(f.wc.session.__routeBlocked);assert(f.wc.__privacyFailed);assert.deepEqual(f.faults,['target-configure']);assert(!f.calls.some(x=>x[0]==='Target.closeTarget'));assert(!f.calls.some(x=>x[0]==='Runtime.runIfWaitingForDebugger'&&x[2]==='child'));f.destroy();
});
test('ordinary child destruction during configuration does not block the parent',async()=>{
 const f=fixture();await f.protect();f.hook((m,p,sid)=>{if(sid&&m==='Page.enable'){f.dbg.emit('message',{},'Target.detachedFromTarget',{sessionId:sid});throw Error('frame went away');}});f.attach();await tick();await tick();
 assert.equal(f.wc.session.__routeBlocked,false);assert.deepEqual(f.faults,[]);await f.wc.__privacyRefresh({region:'KR'});f.destroy();
});
test('detach closes connections and requires protection again; repeated recovery does not multiply listeners',async()=>{
 const f=fixture();for(let i=0;i<15;i++){await f.protect();assert.equal(f.dbg.listenerCount('message'),1);assert.equal(f.dbg.listenerCount('detach'),1);assert.equal(f.wc.listenerCount('destroyed'),1);f.dbg.detach();assert(f.wc.session.__routeBlocked);assert.equal(f.wc.__uam,false);assert.equal(f.dbg.listenerCount('message'),0);}
 await f.protect();assert.equal(f.wc.__privacyFailed,false);f.destroy();assert.equal(f.dbg.listenerCount('message'),0);
});
test('failed initial configuration resets the ready flag and leaves networking blocked',async()=>{
 const f=fixture();f.hook(m=>{if(m==='Page.enable')throw Error('unsupported');});await assert.rejects(f.protect,/unsupported/);assert.equal(f.wc.__uam,false);assert(f.wc.session.__routeBlocked);
 f.hook(()=>{});await f.protect();assert(f.wc.__uam);assert.equal(f.wc.__privacyFailed,false);assert(f.wc.session.__routeBlocked,'only proxy transaction may release the fence');f.destroy();
});
test('diagnostics rotate and never serialize accounts, messages, URLs or error stacks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brana-log-fixture-')),file=path.join(dir,'runtime.jsonl');
 try{const log=require('../src/runtime-log').createRuntimeLog(dir,{version:'0.13.test',platform:'win32'});log('crash',{reason:'crashed',exitCode:11,url:'https://secret.invalid',password:'hidden',message:'secret-chat',stack:'secret-stack',account:'private'});
  let text=fs.readFileSync(file,'utf8');assert(!/hidden|secret|private/.test(text));assert.equal(JSON.parse(text).exitCode,11);
  fs.writeFileSync(file,'x'.repeat(1024*1024+1));log('restart');assert(fs.existsSync(file+'.1'));assert(fs.statSync(file).size<512);
  assert.doesNotThrow(()=>require('../src/runtime-log').createRuntimeLog(file)('event'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const {loadURLAlive}=require('../src/runtime-navigation');
function nav(){const wc=new EventEmitter();wc.isDestroyed=()=>false;wc.stop=()=>{};wc.loadURL=()=>new Promise(()=>{});return wc;}
test('renderer exit releases a lost loadURL acknowledgement and allows another navigation',async()=>{
 const wc=nav(),p=loadURLAlive(wc,'https://fixture.invalid');wc.emit('render-process-gone');await assert.rejects(p,{code:'ERR_RENDER_PROCESS_GONE'});
 assert.equal(wc.listenerCount('render-process-gone'),0);assert.equal(wc.listenerCount('destroyed'),0);wc.loadURL=async()=>{};await loadURLAlive(wc,'about:blank');assert.equal(wc.listenerCount('destroyed'),0);
});
test('window destruction rejects pending navigation and late loadURL failure is still handled',async()=>{
 const wc=nav();let fail;wc.loadURL=()=>new Promise((_,r)=>fail=r);const p=loadURLAlive(wc,'about:blank');wc.emit('destroyed');await assert.rejects(p,{code:'ERR_WEB_CONTENTS_DESTROYED'});fail(Error('late'));await tick();assert.equal(wc.listenerCount('destroyed'),0);
});
test('normal navigation rejection removes lifecycle listeners',async()=>{
 const wc=nav();wc.loadURL=async()=>{throw Object.assign(Error('blocked'),{code:'ERR_FAILED'});};await assert.rejects(loadURLAlive(wc,'about:blank'),{code:'ERR_FAILED'});assert.equal(wc.listenerCount('render-process-gone'),0);assert.equal(wc.listenerCount('destroyed'),0);
});
test('stalled navigation times out without destroying the window',async()=>{
 const wc=nav();let stops=0;wc.stop=()=>stops++;const keep=setTimeout(()=>{},100);
 try{await assert.rejects(loadURLAlive(wc,'about:blank',5),{code:'ERR_NAVIGATION_TIMEOUT'});assert.equal(stops,1);assert.equal(wc.listenerCount('destroyed'),0);}finally{clearTimeout(keep);}
});

test('non-account F5/back never navigates Brana through a default unprotected session',async()=>{
 const a=native.indexOf('async function navigateAccount('),b=native.indexOf('async function openAccountSafe(',a),calls=[];
 const ctx=vm.createContext({runtimeLog:()=>{}});vm.runInContext(native.slice(a,b)+';this.navigate=navigateAccount;',ctx);
 await ctx.navigate({isDestroyed:()=>false,reload:()=>calls.push('local-reload'),loadURL:()=>{throw Error('must not use default-session route');}},'https://arena.ai/robots.txt');assert.deepEqual(calls,['local-reload']);
});

const {createFailureOwner,safeNavigationURL}=require('../src/runtime-navigation');
test('loadURL event and promise rejection have one failure owner',()=>{const o=createFailureOwner(),url='https://arena.ai/robots.txt',id=o.begin(url),event={url,code:-105,desc:'ERR_NAME_NOT_RESOLVED'};assert.equal(o.event(event),null);assert.deepEqual(o.rejected(id,Error('failed')),event);assert.equal(o.rejected(id,Error('again')),null);o.end(id);assert.equal(o.event(event),null);});
test('a late failure event cannot race a promise-owned offline page',()=>{const o=createFailureOwner(),url='https://arena.ai/robots.txt',id=o.begin(url);assert.equal(o.rejected(id,{code:'ERR_FAILED'}).url,url);o.end(id);o.started('file:///offline.html');assert.equal(o.event({url,code:-2}),null);});
test('OAuth redirect failures retain their correct URL for a single retry path',()=>{const o=createFailureOwner(),id=o.begin('https://arena.ai/nextjs-api/sign-in/google');o.redirect('https://accounts.google.com/fixture');o.event({url:'https://accounts.google.com/fixture',code:-105});assert.equal(o.rejected(id,Error('failed')).url,'https://accounts.google.com/fixture');});
test('a new explicit retry is not suppressed by the previous failure',()=>{const o=createFailureOwner(),url='https://arena.ai/robots.txt';let id=o.begin(url);o.rejected(id,Error('first'));o.end(id);id=o.begin(url);assert.ok(o.rejected(id,Error('retry')));});
test('stale events from another URL cannot replace the current navigation failure',()=>{const o=createFailureOwner(),id=o.begin('https://arena.ai/robots.txt');o.event({url:'https://old.invalid',code:-105});assert.equal(o.rejected(id,Error('actual')).url,'https://arena.ai/robots.txt');});
test('aborts and destroyed renderers do not open a competing offline page',()=>{const o=createFailureOwner();for(const code of [-3,'ERR_ABORTED','ERR_RENDER_PROCESS_GONE','ERR_WEB_CONTENTS_DESTROYED']){const id=o.begin('https://arena.ai/robots.txt');assert.equal(o.event({code}),null);assert.equal(o.rejected(id,{code}),null);o.end(id);}});
test('an in-page navigation with no loadURL promise is handled once',()=>{let time=100;const o=createFailureOwner({now:()=>time}),f={url:'https://arena.ai/fixture',code:-105};assert.equal(o.event(f),f);assert.equal(o.event(f),null);time+=2001;assert.equal(o.event(f),f);});
test('public offline diagnostics omit authentication tokens and userinfo',()=>{assert.equal(safeNavigationURL('https://user:password@arena.ai/reset/private-code?token=secret#key'),'https://arena.ai');assert.equal(safeNavigationURL('file:///private'), '');const o=createFailureOwner(),id=o.begin('https://arena.ai/');assert.doesNotMatch(o.rejected(id,Error('failed loading https://arena.ai/?token=secret')).desc,/token|secret/);});
