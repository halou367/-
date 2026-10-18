// Real main/preload check: a parser-blocked page must already have browser chrome.
const {app,BrowserWindow,session,nativeImage}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brana-chrome-'));app.setPath('userData',root);process.env.BRANA_NO_SANDBOX='1';
const ids=['chrome-one','chrome-two'];fs.writeFileSync(path.join(root,'accounts.json'),JSON.stringify({accounts:ids.map(id=>({id,name:id,proxy:'direct',routeMode:'direct',region:'JP'})),open:ids,shared:{prefs:{notify:false,autoTitle:false,keepAlive:false}}}));
let stage='startup',release;const timer=setTimeout(()=>{console.error('TIMEOUT',stage);app.exit(1);},90000);
const wait=async fn=>{const until=Date.now()+18000;while(Date.now()<until){try{const value=await fn();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+stage);};
app.whenReady().then(async()=>{try{
 for(const id of ids)session.fromPartition('persist:acct-'+id).protocol.handle('https',req=>{
  if(req.url.endsWith('/favicon.ico'))return new Response(nativeImage.createFromBitmap(Buffer.from([40,100,180,255]),{width:1,height:1}).toPNG(),{headers:{'content-type':'image/png'}});
  if(req.url.endsWith('/slow.js'))return new Promise(resolve=>{release=()=>resolve(new Response('window.fixtureReleased=true',{headers:{'content-type':'application/javascript'}}));});
  return new Response(req.url.includes('/robots.txt')?'':req.url.endsWith('/early')?'<html><head><title>Early fixture</title><script src="/slow.js"></script></head><body>Early fixture</body></html>':'<html><title>Bookmark fixture</title><body>External fixture</body></html>',{headers:{'content-type':'text/html'}});
 });
 require('../src/main');const win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.__navigate&&w.webContents.session===session.fromPartition('persist:acct-'+ids[0]))),other=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.__navigate&&w.webContents.session===session.fromPartition('persist:acct-'+ids[1])));
 await wait(()=>!win.__navigateP&&!other.__navigateP);stage='document start';const nav=win.webContents.__navigate('https://arena.ai/early');
 await wait(()=>release);const evaluate=async expression=>(await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 await wait(()=>evaluate('!!document.getElementById("__anc_webbar")&&!!document.getElementById("__anc_webfoot_early")'));
 assert.equal(await evaluate('document.readyState'),'loading');assert.equal(await evaluate('!!document.getElementById("__anc_webfoot")'),false);console.log('PASS top and footer visible while parser is blocked, before DOMContentLoaded');release();await nav;
 stage='footer handover';await wait(()=>evaluate('!!document.getElementById("__anc_webfoot")&&!document.getElementById("__anc_webfoot_early")'));assert.equal(await evaluate('document.querySelectorAll("#__anc_webbar").length'),1);
 stage='bookmark add';await win.webContents.__navigate('https://example.invalid/one');
 const open=async owner=>{await owner.webContents.executeJavaScript('BranaBrowser.bookmarks()',true);return wait(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/bookmarks.html')));};
 let menu=await open(win);await wait(()=>menu.webContents.executeJavaScript('!!document.getElementById("current").textContent'));await menu.webContents.executeJavaScript('BranaBookmarks.add("First fixture")');assert.equal((await menu.webContents.executeJavaScript('BranaBookmarks.list()')).entries.length,1);menu.close();
 await win.webContents.__navigate('https://example.invalid/two');menu=await open(win);await wait(()=>menu.webContents.executeJavaScript('!!document.getElementById("current").textContent'));await menu.webContents.executeJavaScript('BranaBookmarks.add("Second fixture")');menu.close();
 stage='other account list/open';await other.webContents.__navigate('https://example.invalid/');menu=await open(other);const rows=await menu.webContents.executeJavaScript('BranaBookmarks.list()');assert.equal(rows.entries.length,2);assert.equal(await other.webContents.executeJavaScript('typeof BranaBookmarks'),'undefined');assert.equal(await menu.webContents.executeJavaScript('typeof BranaHost'),'undefined');assert.notEqual(menu.webContents.session,other.webContents.session);
 const first=rows.entries[0].id;
 stage='pin persistence and owner navigation';await menu.webContents.executeJavaScript('BranaBookmarks.pin('+JSON.stringify(first)+',true)');
 let pins=await other.webContents.executeJavaScript('BranaBrowser.bookmarkPins()');assert.equal(pins.length,1);assert.equal(pins[0].id,first);assert.equal(pins[0].url,undefined);assert.match(pins[0].icon,/^data:image\/png;base64,/);assert.equal(nativeImage.createFromDataURL(pins[0].icon).getSize().width,32);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'bookmarks.json')))[0].pinned,true);assert.equal((await win.webContents.executeJavaScript('BranaBrowser.bookmarkPins()')).length,1);
 await menu.webContents.executeJavaScript('BranaBookmarks.pin('+JSON.stringify(first)+',false)');assert.equal((await other.webContents.executeJavaScript('BranaBrowser.bookmarkPins()')).length,0);await assert.rejects(other.webContents.executeJavaScript('BranaBrowser.bookmarkVisit('+JSON.stringify(first)+')',true),/取消固定/);
 await menu.webContents.executeJavaScript('BranaBookmarks.pin('+JSON.stringify(first)+',true)');menu.close();void other.webContents.executeJavaScript('BranaBrowser.bookmarkVisit('+JSON.stringify(first)+')',true).catch(()=>{});await wait(()=>other.webContents.getURL()==='https://example.invalid/one'&&!other.__navigateP);assert.equal(win.webContents.getURL(),'https://example.invalid/two');
 menu=await open(other);
void menu.webContents.executeJavaScript('BranaBookmarks.visit('+JSON.stringify(rows.entries[1].id)+')').catch(()=>{});await wait(()=>other.webContents.getURL()==='https://example.invalid/two'&&!other.__navigateP);assert.equal(win.webContents.getURL(),'https://example.invalid/two');
 stage='remove and persistence';menu=await open(other);await menu.webContents.executeJavaScript('BranaBookmarks.remove('+JSON.stringify(first)+')');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'bookmarks.json'))).length,1);assert.equal((await other.webContents.executeJavaScript('BranaBrowser.bookmarkPins()')).length,0);menu.close();
 console.log('PASS bookmark add/multiple/shared accounts/open in owning session/remove, isolated page bridge and durable file');clearTimeout(timer);app.exit(0);
}catch(e){console.error('FAIL',stage,e);clearTimeout(timer);app.exit(1);}});
