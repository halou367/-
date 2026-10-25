// Real Electron integration against synthetic HTTPS fixtures; no provider accounts or network traffic.
const {app,BrowserWindow,WebContentsView,session}=require('electron'),fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=require('../src/extension-test-identity').chooseDataRoot({appData:app.getPath('appData'),override:process.env.BRANA_EXTENSION_TEST_DATA||fs.mkdtempSync(path.join(os.tmpdir(),'brana-extension-native-')),isPackaged:false});fs.mkdirSync(path.join(root,'s'),{recursive:true});app.setPath('userData',root);app.setPath('sessionData',path.join(root,'s'));process.env.BRANA_EXTENSION_TEST_DATA=root;
const ids=['extension-one','extension-two'];fs.writeFileSync(path.join(root,'accounts.json'),JSON.stringify({accounts:ids.map(id=>({id,name:id,proxy:'direct',routeMode:'direct',region:'JP'})),open:ids,shared:{prefs:{notify:false,autoTitle:false,keepAlive:false}}}));
let stage='startup';const timer=setTimeout(()=>{console.error('TIMEOUT',stage);app.exit(1);},150000),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,timeout=20000){const end=Date.now()+timeout;do{try{const v=await fn();if(v)return v;}catch{}await pause(50);}while(Date.now()<end);throw Error('Timeout '+stage);}
app.whenReady().then(async()=>{try{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,cb)=>cb({cancel:true}));
 for(const id of ids){const ses=session.fromPartition('persist:acct-'+id);ses.protocol.handle('http',()=>new Response('{}',{headers:{'content-type':'application/json'}}));ses.protocol.handle('https',req=>new Response(req.url.includes('/robots.txt')?'': '<!doctype html><html><body>External fixture</body></html>',{headers:{'content-type':'text/html'}}));}
 const store=require('../src/browser-extensions').createExtensions({root:path.join(root,'extensions'),sessionFor:id=>session.fromPartition('persist:acct-'+id)}),folder=path.join(root,'fixture-unpacked');await fsp.mkdir(folder);
 await fsp.writeFile(path.join(folder,'manifest.json'),JSON.stringify({manifest_version:3,name:'Native fixture',version:'1.0',permissions:['storage'],content_scripts:[{matches:['https://example.invalid/*'],js:['content.js']}],action:{default_popup:'popup.html'}}));
 await fsp.writeFile(path.join(folder,'content.js'),"document.documentElement.dataset.extensionFixture='installed';");await fsp.writeFile(path.join(folder,'popup.html'),'<html><body>Extension popup fixture</body></html>');
 const actionFolder=path.join(root,'fixture-action');await fsp.mkdir(actionFolder);
 await fsp.writeFile(path.join(actionFolder,'manifest.json'),JSON.stringify({manifest_version:3,name:'Native action fixture',version:'1.0',permissions:['storage'],host_permissions:['https://example.invalid/*'],background:{service_worker:'background.js'},action:{default_title:'Run action'}}));
 await fsp.writeFile(path.join(actionFolder,'background.js'),`chrome.action.onClicked.addListener(async tab=>{const created=await chrome.tabs.create({url:'https://example.invalid/extension-created?from=action#keep'});await chrome.storage.local.set({lastAction:{clickedId:tab.id,createdId:created.id}});});`);
 const rows={entries:[{key:require('node:crypto').randomUUID(),path:folder,enabled:true,owned:false,pinned:false},{key:require('node:crypto').randomUUID(),path:actionFolder,enabled:true,owned:false,pinned:true},{key:require('node:crypto').randomUUID(),path:path.join(root,'intentionally-missing-extension'),enabled:true,owned:false,pinned:true}]};
 const realExtension=process.env.BRANA_TARGET_EXTENSION_DIR;
 if(realExtension){assert(fs.existsSync(path.join(realExtension,'manifest.json')),'requested real extension must exist');rows.entries.push({key:require('node:crypto').randomUUID(),path:realExtension,enabled:true,owned:false,pinned:true});}
 await fsp.mkdir(path.join(root,'extensions/shared'),{recursive:true});await fsp.writeFile(path.join(root,'extensions/shared/registry.json'),JSON.stringify(rows.entries));
 require('../src/main');
 const win=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__navigate&&w.webContents.session===session.fromPartition('persist:acct-'+ids[0])));
 const other=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__navigate&&w.webContents.session===session.fromPartition('persist:acct-'+ids[1])));
 await wait(()=>!win.__navigateP&&!other.__navigateP);stage='external browsing';const target='https://example.invalid/path?token=synthetic-secret#fixture';assert(await win.webContents.__navigate(target));assert(await other.webContents.__navigate('https://example.invalid/'));
 await wait(()=>win.webContents.executeJavaScript("document.documentElement.dataset.extensionFixture==='installed'"));await wait(()=>other.webContents.executeJavaScript("document.documentElement.dataset.extensionFixture==='installed'"));
 await win.webContents.session.cookies.set({url:'https://example.invalid',name:'account-only',value:'one'});assert.equal((await other.webContents.session.cookies.get({name:'account-only'})).length,0);
 assert.deepEqual(await win.webContents.executeJavaScript('({host:typeof BranaHost,browser:Object.keys(BranaBrowser)})'),{host:'undefined',browser:['extensions','bookmarkPins','bookmarkVisit','bookmarks','back','route','extensionList','extensionPin','extensionActivate','download','showFile']});
 stage='toolbar pin and popup';const key=rows.entries[0].key;
 const toolbar=await win.webContents.executeJavaScript('BranaBrowser.extensionList()');assert.equal(toolbar.entries[0].path,undefined);
 await win.webContents.executeJavaScript('BranaBrowser.extensionPin('+JSON.stringify(key)+',true)',true);
 assert((await other.webContents.executeJavaScript('BranaBrowser.extensionList()')).entries[0].pinned);
 await win.webContents.executeJavaScript('BranaBrowser.extensionActivate('+JSON.stringify(key)+')',true);
 const popup=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w!==win&&w!==other&&w.webContents.getURL().startsWith('chrome-extension:')));
 assert.equal(win.webContents.getURL(),target);assert.equal(popup.webContents.session,win.webContents.session);
 assert.match(await popup.webContents.executeJavaScript('document.body.innerText'),/Extension popup fixture/);
 assert.equal(await popup.webContents.executeJavaScript('typeof BranaHost'),'undefined');assert(popup.webContents.debugger.isAttached());
 assert.deepEqual(await popup.webContents.executeJavaScript('({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,rtc:typeof RTCPeerConnection})'),{zone:'Asia/Tokyo',rtc:'undefined'});
 stage='production storage sharing';await popup.webContents.executeJavaScript('chrome.storage.local.set({uiSettings:{fixture:true},plainData:{queue:[1]}})');
 const storageView=new WebContentsView({webPreferences:{session:other.webContents.session,sandbox:true,contextIsolation:true}});await storageView.webContents.loadURL(popup.webContents.getURL());await wait(async()=>{const d=await storageView.webContents.executeJavaScript('chrome.storage.local.get(null)');return d.uiSettings?.fixture&&d.plainData?.queue?.[0]===1;});storageView.webContents.close();
 popup.close();await wait(()=>popup.isDestroyed());assert.equal(win.webContents.session.__routeBlocked,false);
 stage='real action click';
 await win.webContents.executeJavaScript('BranaBrowser.extensionActivate('+JSON.stringify(rows.entries[1].key)+')',true);
 const child=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__extensionTab&&w.webContents.getURL()==='https://example.invalid/extension-created?from=action#keep'&&!w.webContents.isLoading()));
 assert.equal(child.webContents.session,win.webContents.session);assert(child.webContents.debugger.isAttached());
 assert.deepEqual(await child.webContents.executeJavaScript('({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,rtc:typeof RTCPeerConnection})'),{zone:'Asia/Tokyo',rtc:'undefined'});
 assert.equal(win.webContents.getURL(),target,'new extension tab never replaces the original page');
 const visible=await win.webContents.executeJavaScript('BranaBrowser.extensionList()');const missing=visible.entries.find(x=>x.key===rows.entries[2].key);
 assert(missing.pinned&&!missing.loaded&&missing.error,'failed installed extension remains represented with a reason');
 child.close();await wait(()=>child.isDestroyed());assert.equal(win.webContents.session.__routeBlocked,false);console.log('PASS real toolbar onClicked, same-account protected child window, unchanged parent URL and retained failed extension');
 if(realExtension){
  stage='real GitHubQuickStart button';
  await win.webContents.executeJavaScript('BranaBrowser.extensionActivate('+JSON.stringify(rows.entries[3].key)+')',true);
  const githubWindow=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__extensionTab&&w.webContents.getURL().startsWith('https://github.com/signup')));
  assert.equal(githubWindow.webContents.session,win.webContents.session);assert.equal(win.webContents.getURL(),target);assert(githubWindow.webContents.debugger.isAttached());
  githubWindow.close();await wait(()=>githubWindow.isDestroyed());console.log('PASS actual GitHubQuickStart toolbar button opens its intended page in the same account; all HTTPS is locally intercepted');
 }
 stage='manager';await win.webContents.executeJavaScript('BranaBrowser.extensions()');const manager=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/extensions.html')));
 await wait(()=>manager.webContents.executeJavaScript('document.querySelectorAll("article").length===4'));
 assert((await manager.webContents.executeJavaScript('BranaExtensions.list()')).entries[0].storage.shared);assert.match(await manager.webContents.executeJavaScript('document.body.innerText'),/本地扩展数据已跨账号共享/);
 assert.equal(await manager.webContents.executeJavaScript('typeof BranaHost'),'undefined');assert.notEqual(manager.webContents.session,win.webContents.session);
 stage='popup';assert(await manager.webContents.executeJavaScript('BranaExtensions.page('+JSON.stringify(rows.entries[0].key)+',"popup")'));await wait(()=>win.webContents.getURL().startsWith('chrome-extension:'));assert.match(await win.webContents.executeJavaScript('document.body.innerText'),/Extension popup fixture/);
 assert(await win.webContents.__navigate(target));stage='retry';win.webContents.session.__routeBlocked=true;win.webContents.__privacyFault('fixture');await wait(()=>win.webContents.getURL().includes('/offline.html'));
 const offlineURL=win.webContents.getURL();assert(!offlineURL.includes('synthetic-secret'));assert(!offlineURL.includes('%2Fpath'));assert.equal(await win.webContents.executeJavaScript('document.title'),'无法连接 example.invalid');assert.equal(win.webContents.__retryTarget.get(),target);
 // Recover a genuinely detached debugger through the full offline picker and real proof/apply IPC.
 win.webContents.debugger.detach();await wait(()=>win.webContents.getURL().includes('/offline.html')&&!win.webContents.isLoading());
 for(const slot of [0,1]){const ps=session.fromPartition('route-probe-slot-'+slot);ps.protocol.handle('https',req=>new Response(req.url.includes('/cdn-cgi/trace')?'ip=203.0.113.9\nloc=JP\n':'<html>fixture</html>'));ps.protocol.handle('http',()=>new Response('{}',{headers:{'content-type':'application/json'}}));}
 await wait(()=>win.webContents.executeJavaScript('!!document.querySelector("#connection-editor .t-ok") && !document.querySelector(".t-ok").disabled'));
 await win.webContents.executeJavaScript('document.querySelector(".t-ok").click()');
 await wait(()=>win.webContents.getURL()===target&&!win.__navigateP);assert.equal(win.webContents.session.__routeBlocked,false);assert(win.webContents.debugger.isAttached());
 assert.equal(await win.webContents.executeJavaScript('typeof RTCPeerConnection'),'undefined');
 stage='external failure';win.webContents.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED',target,true);await wait(()=>win.webContents.getURL().includes('/offline.html'));assert.equal(await win.webContents.executeJavaScript('document.title'),'无法连接 example.invalid');assert.equal(win.webContents.__retryTarget.get(),target);await win.webContents.executeJavaScript('BranaHost.back()');await wait(()=>win.webContents.getURL()===target&&!win.__navigateP);
 stage='disable';const beforeDoc=require('node:crypto').randomUUID();await win.webContents.executeJavaScript('globalThis.__disableDocumentNonce='+JSON.stringify(beforeDoc));
 const disabled=await manager.webContents.executeJavaScript('BranaExtensions.change('+JSON.stringify(rows.entries[0].key)+',"disable")');assert.equal(disabled.entries.find(x=>x.key===key).loaded,false,'native extension is unloaded');
 assert(await win.webContents.__navigate(target));const sameDocument=await win.webContents.executeJavaScript('globalThis.__disableDocumentNonce==='+JSON.stringify(beforeDoc));console.log('DISABLE_DOCUMENT',JSON.stringify({sameDocument}));
 const disabledURL=new URL(target);disabledURL.searchParams.set('policy-check','disabled');assert(await win.webContents.__navigate(disabledURL.href));assert.equal(await win.webContents.executeJavaScript('document.documentElement.dataset.extensionFixture'),undefined);
 assert(await other.webContents.__navigate('https://example.invalid/disabled-check'));assert.equal(await other.webContents.executeJavaScript('document.documentElement.dataset.extensionFixture'),undefined);
 stage='enable from second account';await other.webContents.executeJavaScript('BranaBrowser.extensions()');const otherManager=await wait(()=>BrowserWindow.getAllWindows().find(w=>w!==manager&&!w.isDestroyed()&&w.webContents.getURL().includes('/extensions.html')));await wait(()=>otherManager.webContents.executeJavaScript('document.querySelectorAll("article").length===4'));await otherManager.webContents.executeJavaScript('BranaExtensions.change('+JSON.stringify(rows.entries[0].key)+',"enable")');const enabledURL=new URL(target);enabledURL.searchParams.set('policy-check','enabled');assert(await win.webContents.__navigate(enabledURL.href));await wait(()=>win.webContents.executeJavaScript("document.documentElement.dataset.extensionFixture==='installed'"));
 stage='close';win.close();await wait(()=>manager.isDestroyed());console.log('PASS unpacked native extension, shared loading with isolated cookies, narrow webpage/manager bridges, popup, exact target retry and synchronized disable/enable');clearTimeout(timer);app.exit(0);
}catch(e){console.error('FAIL',stage,e);clearTimeout(timer);app.exit(1);}});
