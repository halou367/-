'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createExtensionCompat,extensionId,matchURL,canReadURL,navigationURL,cleanError}=require('../src/extension-compat');
const EXT='a'.repeat(32),OTHER='b'.repeat(32),RPC='brana:extension-compat:call';
class FakeWC extends EventEmitter{
 constructor(id,session,url='https://allowed.test/path'){super();Object.assign(this,{id,session,url,dead:false,muted:false});}
 getURL(){return this.url;}getTitle(){return 'Allowed page';}isDestroyed(){return this.dead;}isLoading(){return false;}isAudioMuted(){return this.muted;}isCurrentlyAudible(){return false;}
 setAudioMuted(value){this.muted=value;}reload(){this.reloaded=true;}reloadIgnoringCache(){this.reloaded='bypass';}
 destroy(){this.dead=true;this.emit('destroyed');}
}
function setup(manifest={manifest_version:3,action:{default_title:'test'},host_permissions:['https://allowed.test/*']}){
 const ipc=new EventEmitter();ipc.handlers=new Map();ipc.handle=(name,fn)=>ipc.handlers.set(name,fn);
 const sessions=['A','B'].map(()=>{const sw=new EventEmitter();sw.getAllRunning=()=>({});sw.startWorkerForScope=async()=>{throw Error('not used')};sw.getWorkerFromVersionID=()=>undefined;return {extensions:{getExtension:id=>id===EXT?{id:EXT,name:'test',manifest}:null},serviceWorkers:sw,registered:[],registerPreloadScript(x){this.registered.push(x);}};});
 let next=20,created=0;
 const windowFor=(id,wc)=>{const w=new EventEmitter();Object.assign(w,{id,show(){},focus(){w.emit('focus');},close(){wc.destroy();}});return w;};
 const manager=createExtensionCompat({ipcMain:ipc,createTab:async(id,properties)=>{created++;const wc=new FakeWC(next++,sessions[id==='A'?0:1],properties.url),window=windowFor(next++,wc);return {webContents:wc,window};},navigateTab:async(wc,url)=>{wc.url=url;return true;}});
 manager.prepareSession('A',sessions[0]);manager.prepareSession('B',sessions[1]);
 const a=new FakeWC(1,sessions[0]),b=new FakeWC(2,sessions[1]);manager.registerTab('A',a,windowFor(101,a));manager.registerTab('B',b,windowFor(102,b));
 const frame=(session,url)=>({sender:new FakeWC(10,session,url),senderFrame:{url,routingId:7,send(){},isDestroyed:()=>false}});
 const event=frame(sessions[0],'chrome-extension://'+EXT+'/page.html');
 const call=(method,args=[],custom=event)=>ipc.handlers.get(RPC)(custom,method,args);
 return {manager,sessions,a,b,event,frame,call,created:()=>created};
}
test('extension identity accepts only real extension origins',()=>{assert.equal(extensionId('chrome-extension://'+EXT+'/a'),EXT);assert.equal(extensionId('https://'+EXT+'/'), '');assert.equal(extensionId('chrome-extension://bad/'),'');assert.equal(extensionId('chrome-extension://user@'+EXT+'/'),'');});
test('host patterns honor scheme, domain boundaries, paths and subdomains',()=>{assert.ok(matchURL('https://*.allowed.test/*','https://allowed.test/a'));assert.ok(matchURL('https://*.allowed.test/*','https://sub.allowed.test/a'));assert.ok(!matchURL('https://*.allowed.test/*','https://allowed.test.evil/a'));assert.ok(!matchURL('https://allowed.test/*','http://allowed.test/a'));assert.ok(!matchURL('https://allowed.test/private/*','https://allowed.test/public/a'));});
test('sensitive tab fields are not available without matching permission',()=>{assert.ok(canReadURL({host_permissions:['https://allowed.test/*']},'https://allowed.test/a',EXT));assert.ok(!canReadURL({},'https://secret.test/',EXT));assert.ok(!canReadURL({permissions:['tabs']},'file:///private/cookies',EXT));assert.ok(canReadURL({},'chrome-extension://'+EXT+'/x',EXT));});
test('navigation preserves the complete HTTPS URL and rejects credentials and other extension IDs',()=>{assert.equal(navigationURL('https://allowed.test/p?q=1#hash',EXT),'https://allowed.test/p?q=1#hash');for(const value of ['http://allowed.test/','file:///secret','javascript:alert(1)','https://u:p@allowed.test/','chrome-extension://'+OTHER+'/x'])assert.throws(()=>navigationURL(value,EXT));});
test('diagnostics remove credential assignments and URL query values',()=>{const result=cleanError('token=secret https://host/path?code=private#secret');assert.ok(!result.includes('token=secret'));assert.ok(!result.includes('code=private'));});
test('session preparation registers separate frame and worker preloads',()=>{const s=setup();assert.deepEqual(s.sessions[0].registered.map(x=>x.type),['frame','service-worker']);assert.throws(()=>s.manager.prepareSession('C',s.sessions[0]));});
test('ordinary websites cannot invoke privileged compatibility methods',async()=>{const s=setup();const result=await s.call('tabs.query',[{}],s.frame(s.sessions[0],'https://allowed.test/'));assert.equal(result.ok,false);});
test('a forged or unloaded extension identity is rejected',async()=>{const s=setup();assert.equal((await s.call('tabs.query',[{}],s.frame(s.sessions[0],'chrome-extension://'+OTHER+'/x'))).ok,false);});
test('queries are scoped to the caller account and omit extension helper pages',async()=>{const s=setup(),result=await s.call('tabs.query',[{}]);assert.equal(result.ok,true);assert.deepEqual(result.value.map(x=>x.id),[1]);});
test('cross-account tab lookup fails',async()=>{const s=setup();assert.equal((await s.call('tabs.get',[2])).ok,false);});
test('URL-filter queries cannot be used to infer unpermitted page URLs',async()=>{const s=setup({manifest_version:3,action:{}});assert.deepEqual((await s.call('tabs.query',[{url:'https://allowed.test/*'}])).value,[]);const info=(await s.call('tabs.get',[1])).value;assert.equal(info.url,undefined);assert.equal(info.title,undefined);});
test('unknown query criteria fail rather than silently broadening results',async()=>{const s=setup();assert.equal((await s.call('tabs.query',[{unexpected:true}])).ok,false);});
test('new tabs use a real host factory and remain in the same account session',async()=>{const s=setup(),r=await s.call('tabs.create',[{url:'https://allowed.test/new',active:false}]);assert.equal(r.ok,true);assert.equal(s.created(),1);assert.ok(r.value.id>2);assert.equal(r.value.url,'https://allowed.test/new');});
test('unsupported create semantics and cross-account openers have no side effects',async()=>{const s=setup();for(const properties of [{url:'https://allowed.test/',windowId:101},{url:'https://allowed.test/',pinned:true},{url:'https://allowed.test/',openerTabId:2}])assert.equal((await s.call('tabs.create',[properties])).ok,false);assert.equal(s.created(),0);});
test('a blocked route prevents creation and navigation',async()=>{const s=setup();s.sessions[0].__routeBlocked=true;assert.equal((await s.call('tabs.create',[{url:'https://allowed.test/new'}])).ok,false);assert.equal((await s.call('tabs.update',[1,{url:'https://allowed.test/new'}])).ok,false);assert.equal(s.created(),0);assert.equal(s.a.url,'https://allowed.test/path');});
test('bulk close validates the entire list before closing anything',async()=>{const s=setup();assert.equal((await s.call('tabs.remove',[[1,2]])).ok,false);assert.equal(s.a.dead,false);assert.equal(s.b.dead,false);});
test('the same tab is closed at most once',async()=>{const s=setup();let count=0;s.a.on('destroyed',()=>count++);assert.equal((await s.call('tabs.remove',[[1,1]])).ok,true);assert.equal(count,1);});
test('action state and popup overrides are scoped by account and tab',async()=>{const s=setup();assert.equal((await s.call('action.setPopup',[{popup:'panel.html',tabId:1}])).ok,true);assert.equal((await s.call('action.getPopup',[{tabId:1}])).value,'chrome-extension://'+EXT+'/panel.html');assert.equal(s.manager.actionState('B',EXT,2).popup,'');assert.equal((await s.call('action.setPopup',[{popup:'https://outside.test/'}])).ok,false);});
test('unsupported tab updates are rejected instead of pretending success',async()=>{const s=setup();assert.equal((await s.call('tabs.update',[1,{pinned:true}])).ok,false);});
test('a click cannot target a different account window',async()=>{const s=setup();await assert.rejects(s.manager.activate('A',EXT,s.b),/不属于此账号/);});
