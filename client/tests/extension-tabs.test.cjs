'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createExtensionTabs,validTarget}=require('../src/extension-tabs');
function setup(){
 let seq=10,proxyCalls=0,privacyFail=false,holdRemote=false,releaseRemote,privacyHook=null;const created=[],loads=[],errors=[],a={id:'A',region:'old'},ses={__routeBlocked:false};
 class WC extends EventEmitter{
  constructor(session){super();this.id=++seq;this.session=session;this.url='about:blank';this.dead=false;this.debugger={isAttached:()=>!!this.__uam,detach:()=>{this.__uam=false;}};}
  isDestroyed(){return this.dead;}getURL(){return this.url;}setWindowOpenHandler(fn){this.open=fn;}stop(){}
 }
 class Win extends EventEmitter{
  constructor(options){super();this.id=++seq;this.options=options;this.webContents=new WC(options.webPreferences.session);this.dead=false;created.push(this);}
  isDestroyed(){return this.dead;}show(){this.shown=true;}showInactive(){this.inactive=true;}focus(){this.emit('focus');}
  close(){if(this.dead)return;this.emit('close');this.dead=true;this.webContents.dead=true;this.webContents.emit('destroyed');this.emit('closed');}destroy(){this.close();}
 }
 const owner=new Win({webPreferences:{session:ses}});created.length=0;
 const ownership=new Map();
 const manager=createExtensionTabs({BrowserWindow:Win,ownerFor:id=>id==='A'?owner:null,accountFor:id=>id==='A'?a:null,
  attachOwner:(wc,p)=>ownership.set(wc,p),detachOwner:wc=>ownership.delete(wc),
  applyProxy:async()=>{proxyCalls++;if(ses.__routeBlocked)throw Error('blocked route');},
  privacyInit:async wc=>{if(privacyHook)await privacyHook(wc);if(privacyFail)throw Error('privacy failed');wc.__uam=true;wc.__privacyFailed=false;wc.__privacyReset=()=>{wc.__uam=false;};wc.__privacyRefresh=async profile=>{wc.region=profile.region;return profile.region==='new';};},
  loadURL:async(wc,url)=>{loads.push(url);wc.url=url;if(holdRemote&&url.startsWith('https:'))await new Promise(resolve=>{releaseRemote=resolve;});},registerTab:()=>{},windowOptions:()=>({webPreferences:{preload:'test-preload'}}),
  reportError:(id,ext,error)=>errors.push({id,ext,error:String(error)}),
 });
 return {manager,created,loads,errors,owner,ownership,ses,a,proxyCalls:()=>proxyCalls,setPrivacyFail:()=>{privacyFail=true;},holdRemote:()=>{holdRemote=true;},releaseRemote:()=>releaseRemote?.(),remoteStarted:()=>!!releaseRemote,setPrivacyHook:fn=>{privacyHook=fn;}};
}
test('child targets keep full paths, query and fragment but reject unsafe schemes',()=>{assert.equal(validTarget('https://site.test/p?q=1#x'),'https://site.test/p?q=1#x');for(const url of ['http://site.test/','file:///secret','javascript:x','https://u:p@site.test/'])assert.throws(()=>validTarget(url));});
test('new extension window inherits the exact owner session and remains sandboxed',async()=>{const s=setup(),r=await s.manager.create('A',{url:'https://site.test/p?q=1#x',extensionId:'a'.repeat(32),active:false});assert.equal(r.webContents.session,s.ses);assert.equal(r.window.options.webPreferences.sandbox,true);assert.equal(r.window.options.webPreferences.nodeIntegration,false);assert.equal(s.ownership.get(r.webContents),s.owner.webContents);await r.window.__navigateP;assert.equal(r.webContents.getURL(),'https://site.test/p?q=1#x');assert.equal(r.window.inactive,true);assert.equal(s.manager.ready('A'),true);s.owner.close();assert.equal(r.window.isDestroyed(),true);assert.equal(s.ownership.size,0);});
test('closed account or blocked route cannot create a window',async()=>{const s=setup();await assert.rejects(s.manager.create('B',{url:'https://site.test/'}));s.ses.__routeBlocked=true;await assert.rejects(s.manager.create('A',{url:'https://site.test/'}));assert.equal(s.created.length,0);});
test('privacy initialization fails closed before any remote target is loaded',async()=>{const s=setup();s.setPrivacyFail();await assert.rejects(s.manager.create('A',{url:'https://site.test/'}));assert.deepEqual(s.loads,['about:blank']);assert.equal(s.created[0].isDestroyed(),true);assert.equal(s.ownership.size,0);});
test('route refresh updates child privacy while fenced and reloads the complete URL without reapplying stale account settings',async()=>{const s=setup(),url='https://site.test/path?x=1#fragment',r=await s.manager.create('A',{url});await r.window.__navigateP;const before=s.proxyCalls();s.ses.__routeBlocked=true;const release=await s.manager.refresh({id:'A',region:'new'});assert.equal(r.webContents.region,'new');const loaded=s.loads.length;assert.equal(s.loads.length,loaded);s.ses.__routeBlocked=false;release();await new Promise(resolve=>setTimeout(resolve,110));assert.equal(s.loads.at(-1),url);assert.equal(s.proxyCalls(),before);assert.equal(r.webContents.__privacyNeedsReload,false);s.owner.close();});
test('child navigation blocks cross-scheme webpage redirects',async()=>{const s=setup(),r=await s.manager.create('A',{url:'https://site.test/'});let prevented=false;r.webContents.emit('will-redirect',{preventDefault(){prevented=true;}},'file:///private');assert.equal(prevented,true);assert.equal(s.errors.length,1);s.owner.close();});

test('tabs.create acknowledges a real window without waiting for a slow remote document',{timeout:2000},async()=>{const s=setup();s.holdRemote();const r=await s.manager.create('A',{url:'https://site.test/slow'});assert.ok(r.webContents);assert.ok(r.window.__navigateP);for(let i=0;i<20&&!s.remoteStarted();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(s.remoteStarted());s.releaseRemote();await r.window.__navigateP;s.owner.close();});

test('route refresh cannot reinitialize a child while its first privacy setup is pending',async()=>{const s=setup();let calls=0;s.setPrivacyHook(async()=>{calls++;const release=await s.manager.refresh({id:'A',region:'new'});release();});const r=await s.manager.create('A',{url:'https://site.test/'});assert.equal(calls,1);assert.equal(s.loads.filter(x=>x==='about:blank').length,1);assert.equal(s.manager.ready('A'),true);s.owner.close();});
test('closing the owner during bootstrap cannot publish an unowned page',async()=>{const s=setup();let release;s.setPrivacyHook(()=>new Promise(r=>{release=r;}));const pending=s.manager.create('A',{url:'https://site.test/'});for(let i=0;i<10&&!release;i++)await new Promise(r=>setImmediate(r));assert.ok(release);s.owner.close();release();await assert.rejects(pending,/账号已关闭/);assert.ok(!s.loads.some(x=>x.startsWith('https:')));});
