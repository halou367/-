// Native chrome.storage.local mirrors; synthetic data only.
const {app,WebContentsView,session,ipcMain}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=require('../src/extension-test-identity').chooseDataRoot({appData:app.getPath('appData'),override:process.env.BRANA_EXTENSION_TEST_DATA||fs.mkdtempSync(path.join(os.tmpdir(),'brana-storage-native-')),isPackaged:false});fs.mkdirSync(path.join(root,'profile','s'),{recursive:true});app.setPath('userData',path.join(root,'profile'));app.setPath('sessionData',path.join(root,'profile','s'));
const {createSharedStorage}=require('../src/extension-storage'),{createNativeStorage}=require('../src/extension-storage-native');
const compat=require('../src/extension-compat').createExtensionCompat({ipcMain,createTab:()=>{throw Error('Not used by storage check');},navigateTab:()=>{throw Error('Not used by storage check');}});
const open=createNativeStorage({WebContentsView,ipcMain});let broker,stage='startup';const views=[];
const timer=setTimeout(()=>{console.error('TIMEOUT',stage);app.exit(1);},45000);
const wait=async fn=>{const until=Date.now()+8000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout '+stage);};
app.whenReady().then(async()=>{try{
 const dir=path.join(root,'fixture');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({manifest_version:3,name:'Storage fixture',version:'1.0',permissions:['storage']}));
 const sessions=[session.fromPartition('persist:one'),session.fromPartition('persist:two')],exts=[];
 for(const [i,ses] of sessions.entries()){compat.prepareSession(i===0?'one':'two',ses);stage='load extension';const ext=await (ses.extensions||ses).loadExtension(dir);exts.push(ext);const view=new WebContentsView({webPreferences:{session:ses,sandbox:true,contextIsolation:true}});views.push(view);stage='load fixture view';await view.webContents.loadURL('chrome-extension://'+ext.id+'/manifest.json');}
 const run=(i,js)=>views[i].webContents.executeJavaScript(js),read=i=>run(i,'chrome.storage.local.get(null)');
 stage='seed/write';await run(0,'chrome.storage.local.set({uiSettings:{password:"synthetic-a"},plainData:{rows:["fixture"]}})');await run(1,'chrome.storage.local.set({uiSettings:{password:"synthetic-b"}})');
 broker=createSharedStorage({root:path.join(root,'shared'),open});stage='attach one';await broker.attach('one',sessions[0],exts[0]);stage='attach two';await broker.attach('two',sessions[1],exts[1]);
 assert.deepEqual(await read(0),await read(1));assert.equal((await read(1)).uiSettings.password,'synthetic-a');
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'shared',exts[0].id,'migration-backups/two.json'))).uiSettings.password,'synthetic-b');
 stage='concurrent writes';await Promise.all([run(0,'chrome.storage.local.set({first:{nested:true}})'),run(1,'chrome.storage.local.set({second:[1,2]})')]);
 await wait(async()=>{const [a,b]=await Promise.all([read(0),read(1)]);return a.first&&a.second&&JSON.stringify(a)===JSON.stringify(b);});
 stage='same key';await Promise.all([run(0,'chrome.storage.local.set({uiSettings:{winner:1}})'),run(1,'chrome.storage.local.set({uiSettings:{winner:2}})')]);await wait(async()=>JSON.stringify((await read(0)).uiSettings)===JSON.stringify((await read(1)).uiSettings));
 stage='remove';await run(1,'chrome.storage.local.remove("plainData")');await wait(async()=>!Object.hasOwn(await read(0),'plainData'));
 stage='clear';await run(0,'chrome.storage.local.clear()');await wait(async()=>Object.keys(await read(1)).length===0);
 stage='detach/reload';await broker.detach('two',exts[1].id);await run(0,'chrome.storage.local.set({reload:1})');await wait(async()=>JSON.parse(fs.readFileSync(path.join(root,'shared',exts[0].id,'local.json'))).data.reload===1);await broker.attach('two',sessions[1],exts[1]);assert.equal((await read(1)).reload,1);await run(0,'chrome.storage.local.clear()');await wait(async()=>Object.keys(await read(1)).length===0);
 stage='restart';await run(1,'chrome.storage.local.set({plainData:{queue:["saved"]}})');await wait(async()=>(await read(0)).plainData?.queue?.[0]==='saved');await broker.close();
 broker=createSharedStorage({root:path.join(root,'shared'),open});stage='attach one';await broker.attach('one',sessions[0],exts[0]);stage='attach two';await broker.attach('two',sessions[1],exts[1]);assert.deepEqual(await read(0),{plainData:{queue:['saved']}});
 await sessions[0].cookies.set({url:'https://example.invalid',name:'identity',value:'one'});assert.equal((await sessions[1].cookies.get({name:'identity'})).length,0);
 await broker.close();views.forEach(v=>v.webContents.close());clearTimeout(timer);console.log('PASS native storage migration/backups, concurrent keys, remove/clear, restart and isolated website cookies');app.exit(0);
}catch(e){console.error('FAIL',stage,e);clearTimeout(timer);app.exit(1);}});
