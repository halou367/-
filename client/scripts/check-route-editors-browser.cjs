// Native protocol is mocked, HTTP is intercepted. Real native policy/transactions have separate unit/Java checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),harness=require('./check-connection-browser.cjs'),nodes=require('./check-node-browser.cjs');
const results=[];let browser;
async function fixture(platform='desktop'){return nodes.fixture(platform,platform==='android'?360:1200,{editors:true});}
async function editor(f,{id='other',manager=false}={}){
 await f.page.evaluate(async({id,manager})=>{if(manager){__routeFixture.manager=true;__anc.UI.host=await __anc.Host.info();}const a=id?__routeFixture.accounts.find(x=>x.id===id):{};window.__editor=__anc.proxyField(a,{live:false,draft:true});const root=document.createElement('div');root.id='route-editor-test';root.style.cssText='position:fixed;inset:30px 12px;overflow:auto;background:#222;color:#eee;z-index:200000;padding:18px';root.append(__editor.block());document.body.append(root);},{id,manager});
 await nodes.waitMeasured(f,'#route-editor-test');await nodes.until(f,()=>!window.__editor.busy,null,'editor idle');
}
async function select(f,id='node-1',where='#route-editor-test'){
 await nodes.pick(f,id,where);
 // 新账号（添加 / 注册）没有单独的「确认」：主按钮保存时自动检测
 if(where==='.auth-add'){assert.equal(await f.page.locator('.auth-add .t-ok').isVisible(),false,'new-account dialog has no separate confirm');await nodes.until(f,()=>/新账号将使用|添加账号时会?自动检测/.test(document.querySelector('.auth-add .route-selection-status')?.textContent||''),null,'new-account summary');return;}
 await nodes.confirm(f,where);await nodes.until(f,where=>document.querySelector(where+' .route-selection-status')?.textContent.includes('保存此账号后使用'),where,'draft proof');
}
async function done(f,name){assert.deepEqual(f.errors,[],name+' unhandled page errors');results.push({name,passed:true});console.log('PASS',name);await f.context.close();}
async function run(){browser=await chromium.launch({headless:true,args:['--no-sandbox']});harness.setBrowser(browser);try{
 for(const platform of ['desktop','android']){
  let f=await fixture(platform);await editor(f,{manager:platform==='desktop'});await select(f);
  const initialWrites=await f.page.evaluate(()=>({writes:__routeFixture.writes,saved:__routeFixture.saved,legacy:__routeFixture.legacySaves}));if(initialWrites.writes.length+initialWrites.saved.length+initialWrites.legacy.length)console.log('EDITOR DIAGNOSTIC',platform,initialWrites);
  assert.equal(initialWrites.writes.length+initialWrites.saved.length+initialWrites.legacy.length,0);
  const result=await f.page.evaluate(()=>__editor.save({id:'other',name:'Edited',email:'other@example.invalid'}));assert.equal(result.id,'other');assert.equal(result.nodeId,'node-1');
  const snapshot=await f.page.evaluate(()=>({caller:__routeFixture.a.nodeId,target:__routeFixture.accounts.find(x=>x.id==='other').nodeId,legacy:__routeFixture.legacySaves.length,messages:__routeFixture.messages}));assert.equal(snapshot.caller,'node-0');assert.equal(snapshot.target,'node-1');assert.equal(snapshot.legacy,0);if(platform==='android')assert.ok(snapshot.messages.includes('routeSave'));
  await done(f,platform+': editor measures without applying, then saves only its bound target (manager may have no current account)');

  f=await fixture(platform);await editor(f);await nodes.pick(f,'node-2','#route-editor-test');await nodes.confirm(f,'#route-editor-test');await nodes.until(f,()=>document.querySelector('#route-editor-test .route-selection-status').textContent.includes('unavailable'),null,'editor failure');
  const failure=await f.page.evaluate(async()=>{try{await __editor.save({id:'other',name:'Wrong'});return '';}catch(e){return e.message;}});assert.ok(failure);assert.equal(await f.page.evaluate(()=>__routeFixture.saved.length),0);assert.equal(await f.page.evaluate(()=>__routeFixture.accounts.find(x=>x.id==='other').nodeId),'node-0');
  await done(f,platform+': failed editor measurement cannot save a route or accidentally affect the caller');

  f=await fixture(platform);await editor(f);await select(f);await f.page.evaluate(()=>__routeFixture.accounts.find(x=>x.id==='other').nodeId='external-edit');
  const stale=await f.page.evaluate(async()=>{try{await __editor.save({id:'other',email:'other@example.invalid'});return '';}catch(e){return e.message;}});assert.match(stale,/changed|改变|修改/);assert.equal(await f.page.evaluate(()=>__routeFixture.saved.length),0);
  await done(f,platform+': another operation changing the target makes the draft stale');

  f=await fixture(platform);await editor(f);await select(f);await f.page.evaluate(()=>{__routeFixture.probesBefore=__routeFixture.probes.length;});await f.page.clock.fastForward(61000);
  const retested=await f.page.evaluate(async()=>{await __editor.save({id:'other',email:'other@example.invalid'});return {more:__routeFixture.probes.length>__routeFixture.probesBefore,last:__routeFixture.probes.at(-1),saved:__routeFixture.saved.at(-1)};});assert.equal(retested.more,true);assert.equal(retested.last.nodeId,'node-1');assert.equal(retested.last.draft,retested.saved.draft);
  await done(f,platform+': expired proof is remeasured for the same chosen route and draft before save');

  f=await fixture(platform);await f.page.evaluate(()=>__anc.UI.addAccount({email:'new@example.invalid',password:'unverified-target-password'}));await nodes.waitMeasured(f,'.auth-add');await select(f,'node-1','.auth-add');
  assert.equal(await f.page.evaluate(()=>__routeFixture.accounts.length),2);await f.page.locator('.auth-add .lseg').getByRole('tab',{name:'注册',exact:true}).click();await f.page.getByRole('button',{name:'注册并打开',exact:true}).click();await f.page.clock.runFor(700);
  const created=await f.page.evaluate(()=>({saved:__routeFixture.saved,opened:__routeFixture.opened,caller:__routeFixture.a.nodeId,accounts:__routeFixture.accounts}));assert.equal(created.saved.length,1);assert.equal(created.saved[0].account.email,'new@example.invalid');assert.equal(Object.hasOwn(created.saved[0].account,'password'),false);assert.equal(created.caller,'node-0');assert.equal(created.accounts.length,3);assert.equal(created.opened[0],created.accounts[2].id);
  await done(f,platform+': registration creates the measured new profile without persisting an unverified password or touching the caller');

  f=await fixture(platform);await f.page.evaluate(()=>__anc.UI.addAccount({email:'new@example.invalid'}));await nodes.waitMeasured(f,'.auth-add');await select(f,'node-1','.auth-add');await f.page.evaluate(()=>__routeFixture.failSave=true);await f.page.locator('.auth-add .lseg').getByRole('tab',{name:'注册',exact:true}).click();await f.page.getByRole('button',{name:'注册并打开',exact:true}).click();
  await f.page.waitForFunction(()=>document.querySelector('.auth-add .lmsg')?.textContent.includes('disk failure'));assert.equal(await f.page.evaluate(()=>__routeFixture.accounts.length),2);assert.equal(await f.page.evaluate(()=>__routeFixture.opened.length),0);
  await done(f,platform+': failed profile persistence never opens a new account or reports registration started');

  f=await fixture(platform);await editor(f);await f.page.evaluate(()=>__routeFixture.hold=true);await nodes.pick(f,'node-1','#route-editor-test');await nodes.confirm(f,'#route-editor-test');await nodes.until(f,()=>__routeFixture.held.length>0,null,'held');
  await f.page.evaluate(()=>{document.querySelector('#route-editor-test').remove();__routeFixture.hold=false;for(const done of __routeFixture.held.splice(0))done();});await f.page.clock.runFor(100);assert.equal(await f.page.evaluate(()=>__routeFixture.saved.length+__routeFixture.writes.length),0);
  await done(f,platform+': closing an editor discards late measurement results without any save');

  f=await fixture(platform);await f.page.evaluate(()=>{__routeFixture.a.nodeFailover=false;__routeFixture.pipIP={'proxyip.two.invalid':'203.0.113.22'};__anc.UI.host.account.nodeFailover=false;window.__ipSwitch=__anc.RegionIP.switchNext();});await f.page.clock.runFor(1200);const switched=await f.page.evaluate(()=>window.__ipSwitch);
  assert.equal(switched.ok,true);assert.equal(switched.verified,true);const ipstate=await f.page.evaluate(()=>({a:__routeFixture.a,writes:__routeFixture.writes,legacy:__routeFixture.legacySaves.length}));assert.equal(ipstate.a.nodeId,'node-0');assert.equal(ipstate.a.proxyIp,'proxyip.two.invalid');assert.equal(ipstate.a.nodeFailover,false);assert.equal(ipstate.legacy,0);assert.equal(ipstate.writes[0].preservePolicy,true);
  await done(f,platform+': one-click ProxyIP now uses service proof and atomic apply, preserving node, region and recovery preference');

  f=await fixture(platform);await f.page.evaluate(()=>{__routeFixture.limit=true;window.__limitedSwitch=__anc.RegionIP.switchNext();});await f.page.clock.runFor(200);const limited=await f.page.evaluate(()=>window.__limitedSwitch);assert.equal(limited.ok,false);assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length+__routeFixture.legacySaves.length),0);
  await done(f,platform+': rate-limited ProxyIP measurement stops without another IP application');
 }
 let f=await fixture();await editor(f);await select(f);await f.page.evaluate(async()=>{await __editor.save({id:'other',email:'other@example.invalid'});__routeFixture.probesBefore=__routeFixture.probes.length;});await f.page.evaluate(()=>__editor.save({id:'other',name:'Updated note',email:'other@example.invalid'}));assert.equal(await f.page.evaluate(()=>__routeFixture.probes.length),await f.page.evaluate(()=>__routeFixture.probesBefore));assert.equal(await f.page.evaluate(()=>__routeFixture.saved.length),2);
 await done(f,'subsequent metadata-only saves open a fresh target draft without unnecessary route retesting');

 f=await fixture();await nodes.open(f);await nodes.pick(f,'node-1','.region-ip');await nodes.confirm(f,'.region-ip');await nodes.until(f,()=>__routeFixture.writes.length===1,null,'apply');const counts=await f.page.evaluate(async()=>{await __anc.AuthEnv.begin('login','fixture@example.invalid');const n=__routeFixture.probes.length;await __anc.RegionIP.view.picker.commit();return {before:n,after:__routeFixture.probes.length,writes:__routeFixture.writes.length};});assert.equal(counts.before,counts.after);assert.equal(counts.writes,1);
 await done(f,'a previously changed live selector reuses its now-locked route instead of blocking login retry');

 f=await fixture();await f.page.evaluate(()=>__anc.UI.accounts());await f.page.clock.runFor(300);await f.page.locator('.amgr summary').filter({hasText:'other'}).first().click();await nodes.waitMeasured(f,'.amgr');await select(f,'node-1','.amgr');await f.page.locator('.amgr').getByRole('button',{name:'保存',exact:true}).click();await f.page.waitForFunction(()=>__routeFixture.saved.length===1);assert.equal(await f.page.evaluate(()=>__routeFixture.saved[0].account.id),'other');assert.equal(await f.page.evaluate(()=>Object.hasOwn(__routeFixture.saved[0].account,'password')),false);
 if(process.env.EDITOR_RESULTS_DIR){fs.mkdirSync(process.env.EDITOR_RESULTS_DIR,{recursive:true});await f.page.clock.runFor(400);await f.page.screenshot({path:path.join(process.env.EDITOR_RESULTS_DIR,'manager-tested-target.png'),fullPage:true});}
 await done(f,'actual account-manager Save uses the bound editor transaction and does not rewrite an untouched stored password');

 console.log(JSON.stringify({passed:results.length,chromium:browser.version(),network:'fixtures only'}));if(process.env.EDITOR_RESULTS_DIR)fs.writeFileSync(path.join(process.env.EDITOR_RESULTS_DIR,'editor-results.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
