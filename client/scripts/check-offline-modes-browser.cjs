// Synthetic fixtures only: no real accounts, proxies, providers or installed extension packages.
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{
  const a={id:'fixture',name:'Fixture',proxy:'http://127.0.0.1:7890',proxyIp:'',nodeId:'',region:'',routeMode:'proxy'};
  window.fixtureAccount=a;window.fixturePool={v:1,node:'n',src:[],ips:{'192.0.2.8:443':{ip:'192.0.2.8',port:443,loc:'JP',eg:'203.0.113.9',ok:true,ms:42,at:Date.now()}},rep:{'203.0.113.9':{a:Date.now(),h:false,px:false}}};window.applied=[];window.retries=0;window.probes=[];
  window.BranaHost={info:async()=>({account:{...a}}),listAccounts:async()=>[{...a}],shared:async k=>k==='nodes'?[{id:'n',name:'Fixture node',uuid:'11111111-1111-4111-8111-111111111111',address:'node.invalid',port:443,security:'tls'}]:k==='pippool'?window.fixturePool:{},localScan:async()=>({list:[{proxy:'http://127.0.0.1:7890'}]}),routeProbe:async c=>{window.probes.push(c);return {ok:true,ip:'203.0.113.9',loc:'JP',ms:1,scope:'website',website:true,ticket:'fixture'};},routeApply:async o=>{window.applied.push(o);Object.assign(a,o.route,{routeMode:o.mode});return {ok:true,account:{...a}};},routePrefs:async()=>({ok:true}),back:async()=>{window.retries++;},testIp:async()=>({ip:'203.0.113.9'})};
 });
 const file='file://'+path.resolve(__dirname,'../ui/offline.html')+'?recovery=manual&url=https%3A%2F%2Fexample.invalid&code=ERR_FAILED';await page.goto(file);await page.waitForSelector('#connection-editor:not([hidden])');assert.equal(await page.title(),'无法连接 example.invalid');
 for(const mode of ['direct','proxy','node','auto']){
  await page.locator('.pseg [data-k="'+mode+'"]').click();if(mode==='node')await page.waitForFunction(()=>document.querySelector('.np-cur').textContent.includes('Fixture node'));await page.waitForFunction(()=>!document.querySelector('.t-ok').disabled);
  if(mode==='node'){await page.locator('.route-region-select').click();await page.locator('.rsel-row').filter({hasText:'日本'}).click();await page.locator('.pip-cur').click();await page.locator('.pip-row[data-k="192.0.2.8:443"]').click();await page.screenshot({path:'/tmp/offline-editor-preview.png',fullPage:true});}
  await page.waitForFunction(()=>!document.querySelector('.sw-ovl'));const previous=await page.evaluate(()=>applied.length);await page.locator('.t-ok').click();try{await page.waitForFunction(n=>applied.length===n+1&&retries===n+1,previous);}catch(e){console.log(await page.locator('body').innerText());throw e;}await page.waitForFunction(()=>!document.querySelector('.t-ok').disabled);
  const o=await page.evaluate(()=>applied.at(-1));assert.equal(o.mode,mode);assert(o.manual);assert.equal(o.ticket,'fixture');assert.equal(o.id,'fixture');assert(o.expectedConfig);assert(o.expectedMode);if(mode==='node'){assert.equal(o.route.region,'JP');assert.equal(o.route.proxyIp,'192.0.2.8:443');}
 }
 await page.waitForFunction(()=>!document.querySelector('.sw-ovl'));await page.evaluate(()=>BranaHost.routeProbe=async()=>({ok:false,error:'Fixture unavailable'}));await page.locator('.pseg [data-k="direct"]').click();await page.locator('.t-ok').click();await page.waitForFunction(()=>document.querySelector('.route-selection-status').textContent.includes('Fixture unavailable'));assert.equal(await page.evaluate(()=>applied.length),4);
 await page.goto(file);await page.waitForSelector('#connection-editor:not([hidden])');
 // A fresh native locked-account snapshot must disable all route mutations.
 await page.evaluate(async()=>{fixtureAccount.authLocked=true;UI.host=await BranaHost.info();Bus.emit('route-state');});
 assert(await page.locator('.pseg [data-k="node"]').isDisabled());assert(await page.locator('.t-ok').isDisabled());
 assert.equal(await page.evaluate(()=>applied.length),0);
 await page.setViewportSize({width:390,height:780});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 // The extensions manager renders untrusted manifest labels as text.
 await page.addInitScript(()=>{window.BranaExtensions={list:async()=>({entries:[{key:'k',name:'<img src=x onerror=alert(1)>',version:'1',path:'fixture',enabled:false,loaded:false}],error:''}),install:async()=>({entries:[]})};});
 await page.goto('file://'+path.resolve(__dirname,'../ui/extensions.html'));await page.waitForSelector('article');assert.equal(await page.locator('article img').count(),0);assert.match(await page.locator('article h2').innerText(),/<img/);
 console.log('PASS offline four modes, proof application, failure preservation, target title and extension manifest text rendering');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
