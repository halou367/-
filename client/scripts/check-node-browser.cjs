// Full UI bundle; mock native transports and intercepted HTTP only. No real accounts or nodes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),harness=require('./check-connection-browser.cjs'),V=require('../ui/vless');
const nodes=['Current','Fast','Unavailable'].map((name,i)=>({...V.blank(),name,id:'node-'+i,address:'node-'+i+'.example.invalid',uuid:'00000000-0000-4000-8000-00000000000'+i,network:'ws',security:'tls'}));
const seed={nodes,links:nodes.map(V.toLink),outbound:JSON.stringify(V.outbound(nodes[0],'proxyip.one.invalid')),bareOutbound:JSON.stringify(V.outbound(nodes[0],''))};const results=[];let browser;
async function fixture(platform='desktop',width=1100,extra={},opts={}){
 return harness.fixture({...opts,platform,width,mode:'ok',cached:false,setupData:{...seed,platform,...extra},setup:async data=>{
  const H=window.BranaHost,a=(await H.info()).account,base=await H.info(),shared={nodes:data.nodes,nodesubs:[],pippool:{v:1,node:'node-0',rep:{'198.51.100.10':{pu:{fs:5}},'198.51.100.11':{pu:{fs:5}}},ips:{'proxyip.one.invalid':{loc:'JP',ok:true,ms:7,eg:'198.51.100.10'},'proxyip.two.invalid':{loc:'JP',ok:true,ms:9,eg:'198.51.100.11'}}}};
  Object.assign(a,{proxy:data.links[0],proxyIp:'proxyip.one.invalid',nodeId:'node-0',region:'JP',routeMode:'node',routeAuto:false,nodeFailover:true});
  if(data.platform==='android')a.xout=data.outbound;
  const f=window.__routeFixture={a,probes:[],writes:[],attempts:[],auth:[],messages:[],fail:false,hold:false,held:[],ip:'203.0.113.9'};
  f.accounts=[a];f.saved=[];f.legacySaves=[];f.opened=[];f.drafts=new Map();
  if(data.editors)f.accounts.push({id:'other',name:'Other',email:'other@example.invalid',proxy:data.links[0],proxyIp:'',nodeId:'node-0',region:'JP',...(data.platform==='android'?{xout:data.bareOutbound}:{}),routeMode:'node',routeAuto:false,nodeFailover:false,hasPw:true});
  const clone=x=>JSON.parse(JSON.stringify(x)),key=c=>JSON.stringify([c.proxy,c.proxyIp||'',c.nodeId||'']);let serial=0;const proofs=new Map();
  H.info=async()=>({...base,platform:data.platform,account:f.manager?null:clone(a),multiProfile:true,routeDraft:!!data.editors});H.listAccounts=async()=>clone(f.accounts);
  H.exportAccounts=async()=>f.accounts.map(x=>({...clone(x),password:x.hasPw?'fixture-saved-password':''}));H.openAccount=async id=>{f.opened.push(id);return true;};
  H.shared=async(k,v)=>{if(v===undefined)return shared[k]??null;shared[k]=v;return true;};
  H.saveAccount=async patch=>{f.legacySaves.push(clone(patch));if(a.authLocked&&['proxy','proxyIp','nodeId','region'].some(k=>patch[k]!==undefined&&patch[k]!==a[k]))throw Error('native auth lock');Object.assign(a,patch);return clone(a);};
  H.localScan=async()=>({list:[{proxy:'http://127.0.0.1:7890',ms:15},{proxy:'http://127.0.0.1:18080',ms:10}]});
  H.routePrefs=async on=>{if(a.authLocked)return {ok:false,error:'native auth lock'};a.nodeFailover=on;return {ok:true};};
  H.routeProbe=async c=>{
    f.probes.push(clone(c));if(f.throwFetch)return {ok:false,kind:'network',error:'TypeError: Failed to fetch'};if(f.hold)await new Promise(resolve=>f.held.push(resolve));
    if(f.limit)return {ok:false,kind:'rate-limit',error:'fixture rate limit',retryAfterMs:90000};
    if(f.limitIps?.includes(c.proxyIp))return {ok:false,kind:'rate-limit',reachable:true,error:'这条线路的出口 IP 被 Brana 限流（429），已跳过',retryAfterMs:90000};
    if(f.fail||c.nodeId==='node-2')return {ok:false,kind:'network',error:'fixture unavailable'};
    const ms=c.proxy==='direct'?4:c.proxy.includes('18080')?9:c.proxy.includes('7890')?12:c.nodeId==='node-1'?20:90;
    const ticket='proof-'+(++serial);proofs.set(ticket,{key:key(c),draft:c.draft||''});return {ok:true,service:true,realtime:true,ip:f.pipIP?.[c.proxyIp]||f.ip,loc:'JP',ms,ticket,pure:{fs:5},proofExpires:Date.now()+60000};
  };
  const delay=x=>/node-1\./.test(x)?20:/node-2\./.test(x)?0:90;f.urlTests=[];f.pipProbes=[];f.pstore={};
  const urlRes=list=>list.map(x=>{const ms=delay(x);return ms?{ok:true,ms,status:204}:{ok:false,error:'超时'};});
  const pipRes=pips=>{f.pipProbes.push(...pips);return pips.map((p,i)=>({pip:p,ip:'198.51.100.'+(10+i),loc:'JP',ms:31+i,brana:true,pure:{fs:5}}));};
  H.urlTest=async o=>{f.urlTests.push(o.items.length);return urlRes(o.items.map(x=>x.link+'|'+(x.pip||'')));};
  H.probe=async o=>pipRes(o.pips);
  H.routeApply=async o=>{
    f.attempts.push(clone(o));if(a.authLocked)return {ok:false,error:'native auth lock'};
    if(proofs.get(o.ticket)?.key!==key(o.route)||proofs.get(o.ticket)?.draft)return {ok:false,error:'unmeasured route'};
    if(o.id!==a.id)return {ok:false,error:'wrong account'};
    Object.assign(a,o.route,o.preservePolicy?{}:{routeMode:o.mode||a.routeMode,routeAuto:o.mode==='auto',nodeFailover:o.mode==='node'});if(f.pipIP?.[o.route.proxyIp])f.ip=f.pipIP[o.route.proxyIp];f.writes.push(clone(o));return {ok:true,account:clone(a)};
  };
  if(data.editors){
    const revision=x=>JSON.stringify([x&&key(x),x?.routeMode,x?.routeAuto,x?.nodeFailover,x?.email]);
    H.routeDraft=async r=>{
      if(r.op==='open'){const target=r.id?f.accounts.find(x=>x.id===r.id):null;if(r.id&&!target)return {ok:false,error:'target gone'};const id='draft-'+(++serial);f.drafts.set(id,{target,signature:revision(target)});return {ok:true,draft:id,expires:Date.now()+600000,account:target?clone(target):null};}
      const d=f.drafts.get(r.draft);if(!d)return {ok:false,error:'draft stale'};
      if(r.op==='close'){f.drafts.delete(r.draft);return {ok:true};}
      return {ok:true,committed:!!d.saved,busy:false,account:d.saved?clone(d.saved):d.target?clone(d.target):null};
    };
    H.routeSave=async r=>{
      const d=f.drafts.get(r.draft);if(!d)return {ok:false,error:'draft stale'};
      if(d.saved)return {ok:true,account:clone(d.saved),repeated:true};
      if(String(r.account.id||'')!==String(d.target?.id||''))return {ok:false,error:'wrong target'};
      if(revision(d.target)!==d.signature)return {ok:false,error:'target changed'};
      if(f.failSave)return {ok:false,error:'fixture disk failure'};
      const changed=!d.target||key(r.account)!==key(d.target)||r.account.routeMode!==d.target.routeMode||r.account.fp;
      if(changed){const proof=proofs.get(r.ticket);if(proof?.draft!==r.draft||proof.key!==key(r.account))return {ok:false,error:'unmeasured target'};if(d.target?.authLocked||data.platform==='android'&&f.accounts.some(x=>x.authLocked))return {ok:false,error:'native auth lock'};}
      if(f.accounts.some(x=>x!==d.target&&r.account.email&&x.email===r.account.email))return {ok:false,error:'email exists'};
      const record=d.target||{id:'created-'+(++serial),status:null};Object.assign(record,r.account,{id:record.id});if(r.account.password)record.hasPw=true;delete record.password;
      if(!d.target)f.accounts.push(record);d.saved=record;f.saved.push(clone(r));return {ok:true,account:clone(record)};
    };
  }
  const auth=H.authTask;H.authTask=async r=>{f.auth.push(clone(r));const result=await auth(r);if(result.ok)a.authLocked=!!result.locked;return result;};
  const oldFetch=window.fetch;window.fetch=(u,o)=>String(u).includes('/cdn-cgi/trace')?(f.holdExit?new Promise(resolve=>f.releaseExit=()=>resolve(new Response('ip='+f.ip+'\nloc=JP'))):Promise.resolve(new Response('ip='+f.ip+'\nloc=JP'))):oldFetch(u,o);
  if(data.platform==='android'){
    const rpc={authTask:H.authTask,routeProbe:H.routeProbe,routeApply:H.routeApply,routePrefs:o=>H.routePrefs(o.on),routeDraft:H.routeDraft,routeSave:H.routeSave};
    window.BranaRoute={postMessage:json=>{const p=JSON.parse(json);f.messages.push(p.method);Promise.resolve(rpc[p.method](p.arg)).then(result=>window.BranaRoute.onmessage({data:JSON.stringify({id:p.id,result})}));}};
    window.BranaAndroid={info:()=>JSON.stringify({...base,platform:'android',account:f.manager?null:clone(a),multiProfile:true,routeDraft:!!data.editors}),listAccounts:()=>JSON.stringify(f.accounts),listAccountsLite:()=>JSON.stringify(f.accounts),sharedGet:k=>JSON.stringify(shared[k]??null),sharedSet:(k,v)=>{shared[k]=JSON.parse(v);return 'true';},getCred:()=> 'null',noteAccount:()=> 'true',ready:()=> 'true',insets:()=> '[0,0]',takeCmd:()=> 'null',takeEnter:()=> '0',launchPick:()=> '0',setTitle:()=> 'null',back:()=> 'true',login:()=> 'true',openAuth:()=> 'true',openAccount:id=>{f.opened.push(id);return 'true';},exportAccounts:()=>JSON.stringify(f.accounts.map(x=>({...x,password:x.hasPw?'fixture-saved-password':''}))),saveAccount:json=>{f.legacySaves.push(JSON.parse(json));Object.assign(a,JSON.parse(json));return JSON.stringify(a);},localScanStart:()=> 'scan',probeStart:json=>{const o=JSON.parse(json),id='p'+(++serial);if(o.mode==='delay')f.urlTests.push(o.outs.length);f.pstore[id]=JSON.stringify(o.mode==='delay'?urlRes(o.outs.map(x=>JSON.stringify(x))):pipRes(o.pips));return id;},probeGet:id=>id==='scan'?JSON.stringify({list:[{proxy:'http://127.0.0.1:7890'},{proxy:'http://127.0.0.1:18080'}]}):(f.pstore[id]||''),multiOk:()=> 'false'};
    delete window.BranaHost;
  }
 }});
}
// 推进假时钟直到条件成立（安卓宿主用轮询 + sleep）
async function until(f,fn,arg,what='condition'){for(let i=0;i<80;i++){if(await f.page.evaluate(fn,arg))return;await f.page.clock.runFor(350);}console.log('ROUTE DIAGNOSTIC',what,await f.page.evaluate(()=>({text:document.querySelector('.np-wrap')?.textContent,status:document.querySelector('.route-selection-status')?.textContent})));throw Error('timeout: '+what);}
async function waitMeasured(f,where=''){await until(f,w=>{const b=document.querySelector(w+' .np-cur .dly');return !!b&&/ms/.test(b.textContent);},where,'node delays');}
async function open(f){await f.page.evaluate(()=>__anc.RegionIP.open());await waitMeasured(f,'.region-ip');}
async function pick(f,id,where=''){if(await f.page.locator(where+' .np-sum').count()&&await f.page.locator(where+' .np-sum[aria-expanded="false"]').count())await f.page.locator(where+' .np-sum').click();if(await f.page.locator(where+' .np-cur').isHidden())await f.page.locator(where+' .pseg button[data-k="node"]').click();await f.page.locator(where+' .np-cur').click();await f.page.locator(where+' .np-row[data-id="'+id+'"]').click();}
async function pipOpen(f){if(await f.page.locator('.region-ip .pip-list').isHidden())await f.page.locator('.region-ip .pip-cur').click();}
async function confirm(f,where=''){await f.page.locator(where+' .t-ok').click();}
async function status(f,where=''){return f.page.locator(where+' .route-selection-status').textContent();}
async function done(f,name){assert.deepEqual(f.errors,[],name+' page errors');assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' horizontal overflow');results.push({name,passed:true});console.log('PASS',name);await f.context.close();}
async function run(){browser=await chromium.launch({headless:true,args:['--no-sandbox']});harness.setBrowser(browser);try{
 for(const platform of ['desktop','android']){
  const W=platform==='android'?360:1100;
  let f=await fixture(platform,W);await open(f);
  await f.page.locator('.np-cur').click();await until(f,()=>[...document.querySelectorAll('.np-row')].every(r=>!/测速中|…/.test(r.textContent)),null,'rows settled');
  assert.match(await f.page.locator('.np-row').first().textContent(),/自动选择/);
  const rows=await f.page.locator('.np-row:not(.np-auto)').allTextContents();assert.match(rows[0],/Fast.*20 ms/);assert.match(rows[1],/Current.*90 ms/);assert.match(rows[2],/Unavailable.*超时/);
  assert.equal(await f.page.locator('.np-row:not(.np-auto)').first().locator('.dly').getAttribute('class'),'dly d-good');
  const tested=await f.page.evaluate(()=>({writes:__routeFixture.writes.length,probes:__routeFixture.probes.length,url:__routeFixture.urlTests}));assert.equal(tested.writes,0);assert.equal(tested.probes,0,'opening never probes Brana');assert.ok(tested.url.length>=1);
  const before=tested.url.length;await f.page.evaluate(()=>{__anc.RegionIP.close();__anc.RegionIP.open();});await f.page.clock.runFor(700);assert.equal((await f.page.evaluate(()=>__routeFixture.urlTests)).length,before,'reopening within 5 minutes does not retest');
  assert.equal(await f.page.locator('.region-ip .pip-row.on').getAttribute('data-k'),'proxyip.one.invalid');
  // 每个节点行有「测」：只单独连测这一个节点 3 次取中位数，不选中它、不切换
  {
    await f.page.locator('.np-cur').click();await f.page.clock.runFor(200);
    const n0=await f.page.evaluate(()=>__routeFixture.urlTests.length), row=f.page.locator('.np-row:not(.np-auto)',{hasText:'Current'});
    assert.equal(await f.page.locator('.np-row:not(.np-auto) .np-one').count(),3,'every node row has a 测 button');
    await row.locator('.np-one').click();await f.page.clock.runFor(1500);
    const u=await f.page.evaluate(()=>__routeFixture.urlTests);assert.deepEqual(u.slice(n0),[1,1,1],'one node, three rounds');
    assert.match(await f.page.locator('.np-row:not(.np-auto)',{hasText:'Current'}).locator('.dly').textContent(),/90 ms/);
    assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0,'testing one node never applies or picks it');
  }
  await done(f,platform+': url-test measures all nodes concurrently, sorted and coloured; reopening reuses results; no Brana probe or switch');

  f=await fixture(platform,W);await open(f);await pick(f,'node-1','.region-ip');assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0,'picking alone never applies');
  await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'apply');
  const saved=await f.page.evaluate(()=>__routeFixture.a);assert.equal(saved.nodeId,'node-1');assert.equal(saved.proxyIp,'proxyip.one.invalid');assert.equal(saved.routeMode,'node');assert.equal(saved.routeAuto,false);assert.equal(saved.nodeFailover,true);
  if(platform==='android')assert.ok((await f.page.evaluate(()=>__routeFixture.messages)).includes('routeApply'));
  if(process.env.ROUTE_RESULTS_DIR){fs.mkdirSync(process.env.ROUTE_RESULTS_DIR,{recursive:true});await f.page.clock.runFor(400);await f.page.screenshot({path:path.join(process.env.ROUTE_RESULTS_DIR,'node-fixed-'+platform+'.png'),fullPage:true});}
  await done(f,platform+': pick -> confirm -> service proof -> fix only the current account');

  // 地区弹窗里「确认」：出口自动时，第一个 IP 被 429 就试下一个，切换成功要有提示；全被 429 要有明确的失败提示（不能「没反应」）
  f=await fixture(platform,W);await open(f);await f.page.evaluate(()=>{__routeFixture.limitIps=['proxyip.one.invalid'];});
  await pipOpen(f);await f.page.locator('.region-ip .pip-row[data-k="__auto"]').click();await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'apply after skipping the limited IP');
  assert.equal(await f.page.evaluate(()=>__routeFixture.a.proxyIp),'proxyip.two.invalid','first exit was 429 -> next exit used');
  assert.match(await f.page.locator('.region-ip .sw-ovl.ok').textContent(),/已切换/,'success is announced by the switch overlay');assert.match(await status(f,'.region-ip'),/已保存/);
  await done(f,platform+': region confirm skips an exit that is 429 and applies the next one with a success message');

  f=await fixture(platform,W);await open(f);await f.page.evaluate(()=>{__routeFixture.limitIps=['proxyip.one.invalid','proxyip.two.invalid'];});
  await pipOpen(f);await f.page.locator('.region-ip .pip-row[data-k="__auto"]').click();await confirm(f,'.region-ip');await until(f,()=>/429/.test(document.querySelector('.region-ip .route-selection-status')?.textContent||''),null,'visible 429 failure');
  assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);assert.match(await f.page.locator('.region-ip .sw-ovl.bad').textContent(),/未切换.*429/,'failure overlay, not silence');
  await f.page.locator('.region-ip .sw-back').click();await f.page.clock.runFor(400);
  await f.page.evaluate(()=>{__routeFixture.limitIps=[];});await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'a failed result is not cached: second confirm applies');
  await done(f,platform+': region confirm with every exit 429 explains it (overlay + status), and the next confirm is not served from a cached failure');

  // 读请求 429：不再自动换出口 IP（beta.19），unlimit 一律返回 false、不弹换 IP 确认、不写配置，状态里说明按服务器要求等待
  f=await fixture(platform,W);await f.page.evaluate(()=>{__routeFixture.limitIps=['proxyip.one.invalid'];__anc.AutoRoute.init();window.__unl='pending';__anc.AutoRoute.unlimit({ip:true}).then(x=>{window.__unl=x;});});
  await until(f,()=>window.__unl===false,null,'unlimit resolves false');
  assert.equal(await f.page.evaluate(()=>!!document.querySelector('.route-confirm')),false,'no IP-switch confirmation');
  assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0,'no route write on 429');
  assert.match(await f.page.evaluate(()=>__anc.AutoRoute.status),/429.*不更换出口 IP/);
  await done(f,platform+': a 429 on reads never switches the exit IP');

  f=await fixture(platform);await open(f);await pick(f,'node-2','.region-ip');await confirm(f,'.region-ip');await until(f,()=>document.querySelector('.route-selection-status')?.textContent.includes('unavailable'),null,'failure');
  assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);assert.equal(await f.page.evaluate(()=>__routeFixture.a.nodeId),'node-0');
  await done(f,platform+': unusable selected node preserves the original configuration');

  f=await fixture(platform);await open(f);await f.page.evaluate(()=>__routeFixture.hold=true);await pick(f,'node-1','.region-ip');await confirm(f,'.region-ip');await until(f,()=>__routeFixture.held.length===1,null,'held');
  await f.page.evaluate(()=>{__routeFixture.a.proxyIp='proxyip.two.invalid';__routeFixture.hold=false;for(const resolve of __routeFixture.held.splice(0))resolve();});await f.page.clock.runFor(500);
  assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);assert.match(await status(f),/改变/);
  await done(f,platform+': a stale probe result cannot overwrite a route changed meanwhile');

  f=await fixture(platform);await open(f);await f.page.locator('.rip-mode button[data-k="auto"]').click();await f.page.clock.runFor(300);await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'auto apply');
  const auto=await f.page.evaluate(()=>({account:__routeFixture.a,probes:__routeFixture.probes.map(x=>x.proxy)}));assert.equal(auto.account.routeMode,'auto');assert.equal(auto.account.nodeId,'node-1');assert.ok(!auto.probes.includes('direct'),'auto never falls back to direct');
  await done(f,platform+': Auto defaults to the lowest-delay node and applies only after confirm');

  f=await fixture(platform);await open(f);
  await pipOpen(f);await f.page.locator('.pip-row[data-k="proxyip.two.invalid"] .pip-t').click();await until(f,()=>/31 ms/.test(document.querySelector('.pip-row[data-k="proxyip.two.invalid"]')?.textContent||''),null,'row retest');
  await f.page.locator('.pip-all').click();await until(f,()=>__routeFixture.pipProbes.length>=3&&!document.querySelector('.pip-row .dly.d-wait'),null,'test all');
  assert.equal(await f.page.locator('.t-google,.t-brana').count(),0,'separate Google / Brana test buttons are gone');
  await pick(f,'node-1','.region-ip');assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0,'picking and testing never apply');
  await f.page.evaluate(()=>{__anc.EnvRefresh.reload=()=>{};});
  await confirm(f,'.region-ip');await until(f,()=>/Google 连接正常/.test(document.querySelector('.route-selection-status')?.textContent||'')&&/Brana 检测通过/.test(document.querySelector('.route-selection-status')?.textContent||''),null,'google+brana on confirm');
  await done(f,platform+': per-IP retest, test-all; confirm checks Google and Brana automatically');

  f=await fixture(platform);await open(f);
  assert.equal(await f.page.locator('.region-ip .rip-switch').count(),0,'one-click switch removed');assert.equal(await f.page.locator('.region-ip .rip-head .rip-x').count(),1,'close is the top-right X');
  assert.equal(await f.page.locator('.region-ip .pip-row').first().getAttribute('data-k'),'__auto');assert.equal(await f.page.locator('.region-ip .pip-refresh').isVisible(),true);
  await f.page.locator('.rip-mode button[data-k="auto"]').click();
  assert.equal(await f.page.locator('.region-ip .pip-list').isHidden(),true);assert.match(await f.page.locator('.region-ip .np-auto-exit').textContent(),/出口：自动/);
  assert.match(await f.page.locator('.region-ip .np-cur').textContent(),/自动选择/);assert.equal(await f.page.locator('.region-ip .route-region-select').isDisabled(),false);
  await f.page.locator('.rip-mode button[data-k="proxy"]').click();await until(f,()=>/127\.0\.0\.1:7890/.test(document.querySelector('.region-ip .route-proxy-row input')?.value||''),null,'proxy autodetect');
  assert.equal(await f.page.locator('.region-ip .t-google').count(),0,'no separate Google test button');assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);
  await done(f,platform+': auto mode hides exit list (region editable), proxy mode autodetects the local port; one-click switch and footer removed');

  f=await fixture(platform);await f.page.evaluate(()=>{__routeFixture.throwFetch=true;});await open(f);await pick(f,'node-1','.region-ip');await confirm(f,'.region-ip');await until(f,()=>/连不上/.test(document.querySelector('.route-selection-status')?.textContent||''),null,'friendly');
  assert.doesNotMatch(await status(f),/Failed to fetch/);
  await done(f,platform+': raw "Failed to fetch" is replaced with an actionable message');

  f=await fixture(platform);await open(f);await f.page.evaluate(()=>{__routeFixture.holdExit=true;window.__startAuth=__anc.AuthEnv.begin('signup','new@example.invalid');});await until(f,()=>__routeFixture.auth.some(x=>x.op==='prepare'),null,'prepare');
  assert.equal(await f.page.evaluate(()=>__routeFixture.a.authLocked),true);assert.equal(await f.page.locator('.np-cur').isDisabled(),true);
  await f.page.evaluate(()=>{__routeFixture.holdExit=false;__routeFixture.releaseExit();});await f.page.evaluate(()=>window.__startAuth);
  assert.equal(await f.page.evaluate(()=>__anc.AutoRoute.enabled()),false);assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);
  await done(f,platform+': host lease is acquired before reading the real exit IP; controls and recovery stay locked');
 }
 // T23：切换线路成功后自动刷新环境（重新载入页面）；对话进行中先等结束；不动线路的保存不刷新；强制重新应用也刷新
 {
  const stub=f=>f.page.evaluate(()=>{window.__reloads=0;__anc.EnvRefresh.reload=()=>{window.__reloads++;};});
  let f=await fixture();await open(f);await stub(f);
  assert.equal(await f.page.evaluate(()=>__anc.EnvRefresh.inited),true,'initialised at boot');
  await pick(f,'node-1','.region-ip');await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'apply');
  await until(f,()=>window.__reloads===1,null,'reload after switch');
  assert.match(JSON.stringify(await f.page.evaluate(()=>localStorage.getItem('anc:envref'))),/Fast/,'marker names the new node');
  await f.page.clock.runFor(6000);assert.equal(await f.page.evaluate(()=>window.__reloads),1,'reloads exactly once');
  await done(f,'switching the node refreshes the environment (page reload) once');

  f=await fixture();await open(f);await stub(f);
  await f.page.evaluate(()=>{window.__busyChat={busy:true};const C=__anc.Chats;C.set('__busy',window.__busyChat);});
  await pick(f,'node-1','.region-ip');await confirm(f,'.region-ip');await until(f,()=>__routeFixture.writes.length===1,null,'apply');
  await f.page.clock.runFor(1800);assert.match(await f.page.locator('#anc-toasts').textContent(),/结束后自动刷新环境/);
  await f.page.clock.runFor(4000);assert.equal(await f.page.evaluate(()=>window.__reloads),0,'no reload while a chat is running');
  await f.page.evaluate(()=>{window.__busyChat.busy=false;});await until(f,()=>window.__reloads===1,null,'reload once idle');
  await done(f,'environment refresh waits for a running chat, then reloads');

  f=await fixture();await open(f);await stub(f);
  await f.page.evaluate(async()=>{const a=__anc.UI.host.account;await window.BranaHost.saveAccount({id:a.id,name:'renamed',proxy:a.proxy,proxyIp:a.proxyIp,nodeId:a.nodeId});});
  await f.page.clock.runFor(5000);assert.equal(await f.page.evaluate(()=>window.__reloads),0,'saving without a route change never reloads');
  await f.page.locator('.region-ip .t-ok').click();await until(f,()=>__routeFixture.writes.length===1,null,'forced re-apply');
  await until(f,()=>window.__reloads===1,null,'forced re-apply reloads');
  await done(f,'unchanged saves do not reload; forced 应用更改 does');
 }
 let f=await fixture();await f.page.evaluate(async()=>{await __anc.AuthEnv.begin('signup','new@example.invalid');await __anc.AuthEnv.mail('signup');__anc.AuthEnv.state=null;await __anc.AuthEnv.restore();__anc.UI.authGate('link',{kind:__anc.AuthEnv.state.kind,email:__anc.AuthEnv.state.email});});
 assert.match(await f.page.locator('#view').textContent(),/new@example.invalid/);assert.equal(await f.page.evaluate(()=>__anc.AuthEnv.state.stage),'waiting-mail');assert.equal(await f.page.evaluate(()=>__routeFixture.a.authLocked),true);
 if(process.env.ROUTE_RESULTS_DIR)await f.page.screenshot({path:path.join(process.env.ROUTE_RESULTS_DIR,'mail-auth-lock.png'),fullPage:true});
 await done(f,'mail task restoration keeps the intended email, step and native environment lock');

 f=await fixture();const mismatch=await f.page.evaluate(async()=>{const task=await __anc.AuthEnv.begin('login','fixture@example.invalid');__routeFixture.ip='203.0.113.88';try{await __anc.AuthEnv.finish({id:'user',email:'fixture@example.invalid'},task);return '';}catch(e){return e.message;}});assert.match(mismatch,/出口|环境/);assert.equal(await f.page.evaluate(()=>__routeFixture.a.authLocked),true);
 await done(f,'an actual exit-IP change is not accepted as successful authentication');

 f=await fixture();const wrong=await f.page.evaluate(async()=>{const task=await __anc.AuthEnv.begin('signup','fixture@example.invalid');try{await __anc.AuthEnv.finish({id:'other',email:'wrong@example.invalid'},task);return '';}catch(e){return e.message;}});assert.ok(wrong);assert.equal(await f.page.evaluate(()=>__routeFixture.auth.filter(x=>x.op==='finish').length),0);assert.equal(await f.page.evaluate(()=>__routeFixture.a.authLocked),true);
 await done(f,'wrong mail-task identity cannot release the native lock');

 f=await fixture();await f.page.evaluate(async()=>{const task=await __anc.AuthEnv.begin('login','fixture@example.invalid');await __anc.AuthEnv.finish({id:'user',email:'fixture@example.invalid'},task);});assert.equal(await f.page.evaluate(()=>__routeFixture.a.authLocked),false);assert.equal(await f.page.evaluate(()=>__anc.AuthEnv.state),null);
 await done(f,'matching live identity and exit release the completed authentication task');
 f=await fixture();await f.page.evaluate(async()=>{await __anc.AuthEnv.begin('login','fixture@example.invalid');const pf=__anc.proxyField(__anc.UI.host.account,{live:true});document.querySelector('#view').append(pf.block());await pf.commit();__routeFixture.unchanged=pf.testedRoute;});assert.equal(await f.page.evaluate(()=>__routeFixture.unchanged),true);assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);assert.equal(await f.page.evaluate(()=>__routeFixture.probes.length),0);
 await done(f,'continuing authentication reuses the unchanged locked route without another probe or apply');

 f=await fixture();const draft=await f.page.evaluate(()=>{const pf=__anc.proxyField({id:'other',proxy:'direct'},{live:false});return {measured:!!pf.testedRoute,proxy:pf.proxy};});assert.equal(draft.measured,false);assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);
 await done(f,'another-account editor cannot accidentally apply a route to the caller; legacy editor remains available');

 f=await fixture();const fresh=await f.page.evaluate(async()=>{const pf=__anc.proxyField(__anc.UI.host.account,{live:true});document.querySelector('#view').append(pf.block());__routeFixture.a.proxyIp='proxyip.two.invalid';await pf.commit();return pf.proxyIp;});assert.equal(fresh,'proxyip.two.invalid');assert.equal(await f.page.evaluate(()=>__routeFixture.writes.length),0);
 await done(f,'an unchanged form adopts an externally updated current route instead of saving stale route fields');

 console.log(JSON.stringify({passed:results.length,chromium:browser.version(),network:'fixtures only'}));if(process.env.ROUTE_RESULTS_DIR)fs.writeFileSync(path.join(process.env.ROUTE_RESULTS_DIR,'node-browser-results.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}}
module.exports={fixture,open,until,waitMeasured,pick,confirm};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
