'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function assertEmptyProfile(root){
 const files=fs.readdirSync(root);if(files.some(x=>x!=='s'))throw Error('Packaged self-test requires an empty isolated profile');
 const s=path.join(root,'s');if(fs.existsSync(s)&&(fs.lstatSync(s).isSymbolicLink()||fs.readdirSync(s).length))throw Error('Packaged self-test session directory must be empty and local');
}
function install(app,root){
 if(!app.isPackaged||!process.env.BRANA_EXTENSION_TEST_DATA)throw Error('Packaged self-test requires packaged mode and an explicit isolated data directory');
 assertEmptyProfile(root);
 const {BrowserWindow,session}=require('electron'),assert=require('node:assert/strict');
 const id='packaged-smoke',fixture=path.join(root,'smoke-extension'),key=crypto.randomUUID();
 fs.mkdirSync(fixture);fs.mkdirSync(path.join(root,'extensions/shared'),{recursive:true});
 fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'Packaged smoke action',version:'1.0',permissions:['storage'],host_permissions:['https://smoke.invalid/*'],background:{service_worker:'background.js'},action:{default_title:'Smoke action'}}));
 fs.writeFileSync(path.join(fixture,'background.js'),"chrome.action.onClicked.addListener(async()=>{const t=await chrome.tabs.create({url:'https://smoke.invalid/opened?q=1#kept'});await chrome.storage.local.set({smokeTab:t.id});});");
 fs.writeFileSync(path.join(root,'extensions/shared/registry.json'),JSON.stringify([{key,path:fixture,owned:false,enabled:true,pinned:true}]));
 fs.writeFileSync(path.join(root,'accounts.json'),JSON.stringify({accounts:[{id,name:id,proxy:'127.0.0.1:9',region:'JP',routeAuto:false}],open:[id],shared:{prefs:{notify:false,autoTitle:false,keepAlive:false,ipPoll:120}}}));
 const subscriptionBody='vless://11111111-1111-4111-8111-111111111111@node.invalid:443?security=tls#packaged-subscription';
 const subscriptionHeaders=[],feedServer=require('node:http').createServer((req,res)=>{subscriptionHeaders.push(req.headers);res.end(subscriptionBody);});
 const feedReady=new Promise(resolve=>feedServer.listen(0,'127.0.0.1',resolve));
 const results=[];let finished=false;
 const end=(code,error)=>{
  if(finished)return;finished=true;clearTimeout(timer);feedServer.close();
  const report={passed:code===0,version:require('../package.json').version,electron:process.versions.electron,isPackaged:app.isPackaged,network:'synthetic protocol responses plus dead proxy',checks:results,error:error?String(error.stack||error):null};
  fs.writeFileSync(path.join(root,'packaged-smoke-result.json'),JSON.stringify(report,null,2));console.log('PACKAGED_SELF_TEST',JSON.stringify(report));
  for(const w of BrowserWindow.getAllWindows())try{w.webContents.__privacyReset?.();if(w.webContents.debugger.isAttached())w.webContents.debugger.detach();w.destroy();}catch{}
  app.exit(code);
 };
 const timer=setTimeout(()=>end(2,Error('Packaged self-test timed out')),55000);
 const wait=async fn=>{const deadline=Date.now()+20000;while(Date.now()<deadline){try{const v=await fn();if(v)return v;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Packaged self-test condition timed out');};
 app.whenReady().then(()=>{
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
  const ses=session.fromPartition('persist:acct-'+id);
  const handler=req=>{const u=new URL(req.url);if(u.pathname==='/api/me')return Response.json({user:{id:'package-fixture',email:'package@example.invalid'}});if(u.pathname==='/api/history/unified')return Response.json({entries:[],pagination:{hasMore:false,cursor:null}});if(u.pathname.startsWith('/api/'))return Response.json({});if(u.pathname==='/cdn-cgi/trace')return new Response('ip=203.0.113.9\nloc=JP\n');return new Response('<!doctype html><title>Packaged offline fixture</title><body>Local package validation</body>',{headers:{'content-type':'text/html'}});};
  ses.protocol.handle('https',handler);ses.protocol.handle('http',handler);
  void(async()=>{
   const win=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__navigate&&w.webContents.session===ses));
   await wait(()=>!win.__navigateP&&win.webContents.getURL().startsWith('https://arena.ai/robots.txt'));
   const wc=win.webContents;
   assert(app.isPackaged);assert.equal(process.versions.electron,'44.7.2');results.push('real packaged executable and intended runtime');
   assert.equal(path.resolve(app.getPath('userData')),path.resolve(root));results.push('explicit isolated smoke profile');
   const info=await wc.executeJavaScript('BranaHost.updInfo()');assert.equal(info.testBuild,true);assert.equal(info.canInstall,false);results.push('official updater disabled');
   const rows=await wait(async()=>{const r=await wc.executeJavaScript('BranaBrowser.extensionList()');return r.entries?.some(x=>x.key===key&&x.loaded)?r:null;});
   assert(rows.entries.find(x=>x.key===key).loaded);results.push('packaged extension loader and bridge available');
   await wc.executeJavaScript('BranaBrowser.extensionActivate('+JSON.stringify(key)+')',true);
   const child=await wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.__extensionTab&&w.webContents.getURL()==='https://smoke.invalid/opened?q=1#kept'&&!w.webContents.isLoading()));
   assert.equal(child.webContents.session,ses);assert(child.webContents.debugger.isAttached());results.push('packaged MV3 action opens protected same-account window');
   const privacy=await child.webContents.executeJavaScript('({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,rtc:typeof RTCPeerConnection})');assert.equal(privacy.zone,'Asia/Tokyo');assert.equal(privacy.rtc,'undefined');results.push('packaged privacy controls remain active');
   await feedReady;const feedUrl='http://127.0.0.1:'+feedServer.address().port+'/subscription?token=synthetic';
   const priorProxy=await ses.resolveProxy(feedUrl);await ses.cookies.set({url:feedUrl,name:'account_private',value:'not-to-subscription'});
   const subscription=await wc.executeJavaScript('BranaHost.fetchSubscription('+JSON.stringify(feedUrl)+')');
   assert.equal(subscription.text,subscriptionBody);assert.equal(subscription.via,'直连');assert.equal(await ses.resolveProxy(feedUrl),priorProxy);assert(subscriptionHeaders.every(h=>!h.cookie&&!h.authorization&&!h.referer));
   assert.equal(typeof require('https-proxy-agent').HttpsProxyAgent,'function');assert.equal(typeof require('socks-proxy-agent').SocksProxyAgent,'function');results.push('packaged subscription bootstrap, proxy dependencies and unchanged account route');
   end(0);
  })().catch(error=>end(1,error));
 });
}
module.exports={install,assertEmptyProfile};
