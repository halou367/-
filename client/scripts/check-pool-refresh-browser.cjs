'use strict';
// Full UI bundle with reserved documentation IPs and mocked native transports only.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright');
const harness=require('./check-connection-browser.cjs'),routes=require('./check-node-browser.cjs');
async function setup(f){
 await f.page.evaluate(async()=>{
  const {Pool,IPRep}=__anc,H=window.BranaHost;
  const JP='proxyip.jp.example.net',HK='proxyip.hk.example.net';
  const q=window.__poolLive={requests:[],listeners:new Set(),resolves:[],cancels:[],jp:[],hk:[]};
  for(let i=1;i<=49;i++)q.jp.push('192.0.2.'+i);for(let i=1;i<=3;i++)q.hk.push('198.51.100.'+i);
  await Pool.mutate(d=>{d.dv=99;d.src=[JP,HK];d.dom={};d.ips={};d.rep={};for(const k of q.jp)d.ips[k]={ip:k,src:JP};for(const k of q.hk)d.ips[k]={ip:k,src:HK};});
  Pool.dns.clear();
  // Do not let unrelated scheduled reputation maintenance run in this deterministic UI test.
  IPRep.prime=async()=>{};IPRep.run=async()=>{};IPRep.soon=()=>{};
  H.resolve=async host=>{q.resolves.push(host);return host===JP?q.jp:host===HK?q.hk:[];};
  H.onProbeProgress=fn=>{q.listeners.add(fn);return()=>q.listeners.delete(fn);};
  H.cancelProbe=async requestId=>{q.cancels.push(requestId);const r=q.requests.find(x=>x.requestId===requestId);if(r){r.cancelled=true;r.finish({cancelled:true});}return {ok:true};};
  H.probe=o=>new Promise(resolve=>q.requests.push({...o,finish:resolve,cancelled:false}));
  q.emit=(index,pip,loc='JP')=>{const request=q.requests[index];const result={pip,ip:pip,loc,ms:23,brana:true,pure:{fs:5,ip:pip,res:true,dc:false},ipa:{ip:pip,h:false,px:false,m:false,isp:'fixture'}};for(const fn of [...q.listeners])fn({requestId:request.requestId,pip,result,stage:'probing'});return result;};
 });
}
async function advance(f,predicate,arg){return routes.until(f,predicate,arg,'incremental ProxyIP state');}
async function run(){
 const browser=await chromium.launch({headless:true});harness.setBrowser(browser);const checks=[];
 try{
  for(const width of [1100,390]){
   const f=await routes.fixture('desktop',width);await setup(f);await routes.open(f);
   await advance(f,()=>__poolLive.requests.reduce((n,r)=>n+r.pips.length,0)===49);
   assert.deepEqual(await f.page.evaluate(()=>[...new Set(__poolLive.resolves)]),['proxyip.jp.example.net'],'opening selected JP only resolves JP');
   assert.equal(await f.page.locator('.pip-work progress').getAttribute('aria-label'),'ProxyIP 检测进度');
   const first=await f.page.evaluate(()=>{const k=__poolLive.requests[0].pips[0];__poolLive.emit(0,k);return k;});
   if(await f.page.locator('.pip-list').isHidden())await f.page.locator('.pip-cur').click();
   await advance(f,k=>!!document.querySelector('.pip-row[data-k="'+k+'"]'),first);
   assert.match(await f.page.locator('.pip-work').textContent(),/已检 1\/49/);
   assert.equal(await f.page.evaluate(()=>__poolLive.requests.every(x=>!x.cancelled)),true);
   await f.page.locator('.pip-row[data-k="'+first+'"]').click();
   assert.equal(await f.page.locator('.t-ok').isEnabled(),true,'a good early result is selectable while other IPs are still testing');
   assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0,'selection and background probing never apply a route');
   checks.push({width,name:'49 pending JP candidates, early pure result usable before batch completion',passed:true});
   const screenshot=process.env.POOL_UI_SCREENSHOTS;
   if(screenshot){fs.mkdirSync(screenshot,{recursive:true});await f.page.screenshot({path:path.join(screenshot,'proxyip-progress-'+width+'.png'),fullPage:true});}
   const oldIds=await f.page.evaluate(()=>__poolLive.requests.map(x=>x.requestId));
   await f.page.locator('.rsel-reload').click();
   await advance(f,n=>__poolLive.requests.length>n,oldIds.length);
   const after=await f.page.evaluate(()=>({resolves:__poolLive.resolves,cancels:__poolLive.cancels}));
   assert.ok(oldIds.every(x=>after.cancels.includes(x)));assert.ok(after.resolves.every(x=>x==='proxyip.jp.example.net'));
   checks.push({width,name:'refresh cancels previous work and force-resolves only current region',passed:true});
   await f.page.locator('.route-region-select').click();await f.page.locator('.rsel-row').filter({hasText:'香港'}).click();
   await advance(f,()=>__poolLive.requests.some(r=>r.pips.includes('198.51.100.1')));
   assert.match(await f.page.locator('.pip-work strong').textContent(),/香港/);
   await f.page.evaluate(()=>__poolLive.emit(0,'192.0.2.49'));
   await f.page.clock.runFor(250);
   assert.equal(await f.page.evaluate(()=>__anc.Pool.d.ips['192.0.2.49'].ok),undefined,'late JP event must not update shared pool after region change');
   assert.match(await f.page.locator('.pip-work strong').textContent(),/香港/);
   await f.page.locator('.pip-work button').click();
   assert.match(await f.page.locator('.pip-work').textContent(),/已停止/);
   assert.equal(await f.page.evaluate(()=>__poolLive.listeners.size),0);
   checks.push({width,name:'region switching and stop ignore late results and detach listeners',passed:true});
   await f.page.locator('.rsel-reload').click();await advance(f,()=>__poolLive.listeners.size>0);
   await f.page.evaluate(()=>__anc.RegionIP.close());await f.page.clock.runFor(100);
   assert.equal(await f.page.evaluate(()=>__poolLive.listeners.size),0,'closing panel cancels only its jobs');
   assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);
   assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(f.errors,[]);checks.push({width,name:'panel teardown, no unintended account writes, no script errors or overflow',passed:true});
   await f.context.close();
  }
  const result={passed:checks.length,checks,network:'all HTTP intercepted; native DNS/probes mocked; no real user accounts or IP scans'};
  console.log(JSON.stringify(result,null,2));if(process.env.POOL_UI_RESULTS)fs.writeFileSync(process.env.POOL_UI_RESULTS,JSON.stringify(result,null,2));
 }finally{await browser.close();}
}
if(require.main===module)run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={run};
