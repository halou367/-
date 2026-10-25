// Local browser fixture for the injected toolbar; native IPC/popup isolation has its own Electron check.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1320,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>Current page stays open</h1></body></html>'}));
  await page.addInitScript(()=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const r=attach.call(this,options);if(this.id==='__anc_webbar')window.fixtureRoot=r;return r;};
   window.fixtureEntries=[{key:'one',name:'GitHub 快速注册助手',pinned:false,loaded:true,enabled:true,popup:true},{key:'two',name:'脚本助手',pinned:true,loaded:true,enabled:true,popup:true}];
   window.fixturePins=[{id:'bookmark-one',title:'GitHub',icon:''},{id:'bookmark-two',title:'Gmail',icon:''}];window.fixtureCalls=[];window.BranaBrowser={bookmarkPins:async()=>fixturePins,bookmarkVisit:async id=>fixtureCalls.push('bookmark:'+id),back:async()=>fixtureCalls.push('back-client'),route:async()=>fixtureCalls.push('route'),bookmarks:async()=>fixtureCalls.push('bookmarks'),extensions:async()=>fixtureCalls.push('manage'),extensionList:async()=>({entries:fixtureEntries}),extensionPin:async(key,pinned)=>{fixtureEntries.find(e=>e.key===key).pinned=pinned;return {entries:fixtureEntries};},extensionActivate:async key=>{fixtureCalls.push(key);if(window.fixtureFail)throw Error('扩展启动失败，请重试');}};
  });
  await page.goto('https://example.invalid/');await page.evaluate(fs.readFileSync(path.join(__dirname,'../ui/webbar.js'),'utf8'));
  const count=selector=>page.evaluate(s=>fixtureRoot.querySelectorAll(s).length,selector);
  const click=async selector=>{const r=await page.evaluate(s=>{const r=fixtureRoot.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);await page.mouse.click(r.x,r.y);};
  await page.waitForFunction(()=>fixtureRoot.querySelectorAll('.ext-pinned').length===1);
  await click('.extensions');assert.equal(await page.evaluate(()=>fixtureRoot.querySelector('.ext-menu').hidden),false);assert.equal(await count('.ext-row'),2);
  await click('.ext-row .ext-pin');assert.equal(await count('.ext-pinned'),2);
  await click('.ext-row .ext-pin');assert.equal(await count('.ext-pinned'),1);
  await click('.ext-pinned');assert.deepEqual(await page.evaluate(()=>fixtureCalls),['two']);assert.equal(await page.evaluate(()=>fixtureRoot.querySelector('.ext-menu').hidden),true);
  assert.equal(page.url(),'https://example.invalid/');await click('.extensions');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>fixtureRoot.querySelector('.ext-menu').hidden),true);
  await click('.extensions');await page.mouse.click(100,200);assert.equal(await page.evaluate(()=>fixtureRoot.querySelector('.ext-menu').hidden),true);
  await page.evaluate(()=>window.fixtureFail=true);await click('.ext-pinned');assert.match(await page.evaluate(()=>fixtureRoot.querySelector('.ext-status').textContent),/启动失败/);
  await click('.home');assert((await page.evaluate(()=>fixtureCalls)).includes('back-client'));assert.equal(await count('.browser-route'),0,'no independent bottom-right route button');
  await page.waitForFunction(()=>fixtureRoot.querySelectorAll('.bookmark-pinned').length===2);await click('.bookmark-pinned');assert((await page.evaluate(()=>fixtureCalls)).includes('bookmark:bookmark-one'));assert.equal(await page.evaluate(()=>fixtureRoot.querySelector('.bookmarks').nextElementSibling.className),'bookmark-pins');
  await click('.bookmarks');assert((await page.evaluate(()=>fixtureCalls)).includes('bookmarks'));
  const geometry=await page.evaluate(()=>{const input=fixtureRoot.querySelector('input'),bar=fixtureRoot.querySelector('.bar'),r=input.getBoundingClientRect();return {width:r.width,center:r.x+r.width/2,drag:getComputedStyle(bar).webkitAppRegion,inputDrag:getComputedStyle(input).webkitAppRegion};});assert(geometry.width<=520);assert(Math.abs(geometry.center-660)<2);assert.equal(geometry.drag,'drag');assert.equal(geometry.inputDrag,'no-drag');
  await click('.ext-manage');assert((await page.evaluate(()=>fixtureCalls)).includes('manage'));
  await page.setViewportSize({width:720,height:480});await click('.extensions');const fits=await page.evaluate(()=>{const b=fixtureRoot.querySelector('.ext-menu').getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;});assert(fits);
  await page.evaluate(()=>{fixturePins=Array.from({length:20},(_,i)=>({id:String(i),title:'Pinned '+i,icon:''}));window.dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>fixtureRoot.querySelectorAll('.bookmark-pinned').length===20);
  for(const width of [1320,1000,720,390]){await page.setViewportSize({width,height:700});const g=await page.evaluate(()=>{const a=fixtureRoot.querySelector('.bar-left').getBoundingClientRect(),b=fixtureRoot.querySelector('input').getBoundingClientRect(),c=fixtureRoot.querySelector('.bar-right').getBoundingClientRect();return a.right<=b.left&&b.right<=c.left&&c.right<=innerWidth;});assert(g,'controls fit at '+width);assert(await page.evaluate(()=>{const p=fixtureRoot.querySelector('.bookmark-pins');p.scrollLeft=p.scrollWidth;const a=p.getBoundingClientRect(),b=p.lastElementChild.getBoundingClientRect();return b.right<=a.right+1&&b.left>=a.left-1;}),'last pin reachable '+width);}
  await page.setViewportSize({width:1320,height:700});
  await page.waitForFunction(()=>fixtureRoot.querySelector('.ext-status').textContent.includes('点击扩展'));
  await page.screenshot({path:process.env.SHOT||'/tmp/extension-toolbar-preview.png'});assert.deepEqual(errors,[]);
  console.log('PASS toolbar list, pin/unpin, direct activation, preserved page, errors, dismiss and narrow layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
