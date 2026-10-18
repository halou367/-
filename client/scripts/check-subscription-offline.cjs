'use strict';
const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=require('../src/extension-test-identity').chooseDataRoot({appData:app.getPath('appData'),override:process.env.BRANA_EXTENSION_TEST_DATA||fs.mkdtempSync(path.join(os.tmpdir(),'brana-subscription-')),isPackaged:false});
fs.mkdirSync(path.join(root,'s'),{recursive:true});app.setPath('userData',root);app.setPath('sessionData',path.join(root,'s'));process.env.BRANA_EXTENSION_TEST_DATA=root;
const id='subscription-offline',account={id,name:id,proxy:'127.0.0.1:9',routeMode:'local',region:'JP',routeAuto:false};
fs.writeFileSync(path.join(root,'accounts.json'),JSON.stringify({accounts:[account],open:[id],shared:{prefs:{notify:false,autoTitle:false,keepAlive:false}}}));
const link='vless://11111111-1111-4111-8111-111111111111@node.example.invalid:443?encryption=none&security=tls&type=ws&path=%2Ffixture#SubscriptionFixture';
const seen=[],server=http.createServer((req,res)=>{seen.push({cookie:!!req.headers.cookie,authorization:!!req.headers.authorization,referer:!!req.headers.referer});res.setHeader('Content-Type','text/plain');res.setHeader('Set-Cookie','subscription_only=fixture');res.end(link);});
const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let stage='startup';const timer=setTimeout(()=>{console.error('TIMEOUT',stage);app.exit(1);},60000);
const wait=async fn=>{const stop=Date.now()+20000;while(Date.now()<stop){try{const x=await fn();if(x)return x;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+stage);};
app.whenReady().then(()=>{
 const ses=session.fromPartition('persist:acct-'+id);ses.protocol.handle('https',()=>Response.error());
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_e,cb)=>cb({cancel:true}));
 void(async()=>{
  await listening;const feed='http://127.0.0.1:'+server.address().port+'/subscription?token=synthetic-not-logged';
  const win=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__navigate&&w.webContents.session===ses));
  stage='offline page';await wait(()=>win.webContents.getURL().includes('/offline.html')&&!win.webContents.isLoading());
  const before=JSON.parse(fs.readFileSync(path.join(root,'accounts.json'),'utf8')).accounts[0];
  await ses.cookies.set({url:feed,name:'private_account_cookie',value:'must-not-leave-account'});
  stage='direct bootstrap';const result=await win.webContents.executeJavaScript('BranaHost.fetchSubscription('+JSON.stringify(feed)+')');assert.equal(result.text,link);assert.equal(result.via,'直连');
  stage='actual offline import';const imported=await win.webContents.executeJavaScript('Nodes.setSub('+JSON.stringify(feed)+')');assert.equal(imported.ok,true);assert.equal(imported.n,1);
  const after=JSON.parse(fs.readFileSync(path.join(root,'accounts.json'),'utf8')).accounts[0];assert.equal(after.proxy,before.proxy);assert.equal(after.routeMode,before.routeMode);assert.equal(after.region,before.region);
  assert(seen.length>=2);assert(seen.every(x=>!x.cookie&&!x.authorization&&!x.referer));
  console.log('PASS subscription direct bootstrap and real offline import despite unusable account proxy; no account cookie/auth/referrer, no route change');
  for(const w of BrowserWindow.getAllWindows())try{w.webContents.__privacyReset?.();if(w.webContents.debugger.isAttached())w.webContents.debugger.detach();w.destroy();}catch{}
  await new Promise(resolve=>server.close(resolve));clearTimeout(timer);app.exit(0);
 })().catch(error=>{console.error('FAIL',stage,error);server.close();clearTimeout(timer);app.exit(1);});
});
require('../src/main');
