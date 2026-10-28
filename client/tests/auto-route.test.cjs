const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../ui/route-policy'),N=require('../src/route-native');
const healthy=(loc='JP',ms=40)=>({ok:true,ip:'203.0.113.8',loc,ms,service:true,realtime:true});
function fixture(){let at=100000;const a={id:'own',proxy:'vless://old',proxyIp:'old-ip',nodeId:'old',region:'JP'},data={account:a,nodes:[{id:'a',link:'vless://a'},{id:'b',link:'vless://b'}],pool:{rep:{'203.0.113.1':{pu:{fs:5}},'203.0.113.8':{pu:{fs:5}},'203.0.113.9':{pu:{fs:5}}},ips:{jp:{ok:true,loc:'JP',ms:10},us:{ok:true,loc:'US',ms:20}}},accounts:[a],enabled:true},probes=[],writes=[];const io={retryMs:0,now:()=>at,read:async()=>data,link:n=>n.link,probe:async c=>{probes.push(c);return c.proxy==='vless://old'?{ok:false}:healthy(c.region||'US');},local:async()=>[],apply:async x=>{writes.push(x);return {ok:true,account:{...a,...x.route}};}};return {a,data,probes,writes,io,engine:new P.Engine(io),time:x=>at=x};}
test('service proof requires trace, account API and realtime entrance, not an open port',()=>{assert.equal(P.good({ok:true,ip:'x'}),false);assert.equal(P.good(healthy()),true);assert.equal(N.serviceOK(200,'<html>challenge</html>'),false);assert.equal(N.serviceOK(401,'Unauthorized'),true);assert.equal(N.serviceOK(200,'{"user":null}'),true);assert.equal(N.realtimeOK(403,'captcha'),false);assert.equal(N.realtimeOK(404,'{"error":"unknown session"}'),true);});
test('auth, captcha and quota errors do not automatically change routes',()=>{for(const status of [400,401,403,404,409,429])assert.equal(P.transportError({status}),false);for(const status of [408,502,503,504])assert.equal(P.transportError({status}),true);assert.equal(P.transportError({name:'AbortError'}),false);assert.equal(P.transportError({name:'AbortError',routeTimeout:true}),true);});
test('healthy current route stays sticky, without scans or writes',async()=>{const f=fixture();f.io.probe=async()=>healthy();const r=await f.engine.run();assert.equal(r.changed,false);assert.equal(f.writes.length,0);});
test('healthy original-region node is chosen before cross-region and local fallback',async()=>{const f=fixture();f.data.pool.rep={'203.0.113.8':{c:1,r:99}};f.data.pool.trust={jp:true};let local=0;f.io.local=async()=>{local++;return [];};const r=await f.engine.run();assert.equal(r.changed,true);assert.equal(f.writes[0].route.region,'JP');assert.equal(f.writes[0].route.routeHome,'JP');assert.equal(local,0);assert.equal(f.writes[0].id,'own');});
test('cross-region selection is allowed only after original-region attempts fail',async()=>{const f=fixture();f.io.probe=async c=>{f.probes.push(c);return c.region==='US'&&c.proxy!=='vless://old'?healthy('US'): {ok:false};};await f.engine.run();assert.equal(f.writes[0].route.region,'US');assert.ok(f.probes.findIndex(c=>c.region==='JP')<f.probes.findIndex(c=>c.region==='US'));});
test('failed nodes fall back to a service-verified local proxy, never automatic direct',async()=>{const f=fixture();f.io.probe=async c=>c.kind==='local'?healthy('GB'): {ok:false};f.io.local=async ports=>{assert.ok(ports.includes(7890)&&ports.includes(18080));return [{proxy:'127.0.0.1:18080'}];};await f.engine.run();assert.equal(f.writes[0].route.proxy,'http://127.0.0.1:18080');assert.equal(f.writes[0].route.proxyIp,'');assert.equal(f.writes[0].route.nodeId,'');});
test('an open local port failing the service test is never applied',async()=>{const f=fixture();f.io.probe=async()=>({ip:'x',ok:true,service:true,realtime:false});f.io.local=async()=>[{proxy:'http://127.0.0.1:7890'}];const r=await f.engine.run();assert.equal(r.ok,false);assert.equal(f.writes.length,0);assert.ok(f.engine.next>100000);});
test('candidate construction excludes occupied, banned, cooling and removed exits',()=>{const f=fixture();f.data.accounts.push({id:'other',proxyIp:'jp',proxy:'vless://x',region:'JP'});f.data.pool.ips.cool={ok:true,loc:'JP',cool:200000};f.data.pool.ips.gone={ok:true,loc:'JP',gone:true};f.data.pool.ips.ban={ok:true,loc:'JP'};f.data.pool.ban={ban:1};const c=P.candidates(f.data,n=>n.link,100000);assert.equal(c.same.length,0);assert.ok([...c.same,...c.other].every(x=>!['jp','cool','gone','ban'].includes(x.proxyIp)));});
test('manual account or route edits while probing cancel an unissued application',async()=>{const f=fixture();let reads=0;f.io.read=async()=>{reads++;return reads===1?structuredClone(f.data):{...f.data,account:{...f.a,proxy:'http://127.0.0.1:7890'}};};const r=await f.engine.run();assert.equal(r.stale,true);assert.equal(f.writes.length,0);});
test('disabling automatic routing or cancellation prevents pending writes',async()=>{const f=fixture();f.io.probe=async c=>{if(c.kind==='current')return {ok:false};f.data.enabled=false;return healthy();};const r=await f.engine.run('realtime-repeat');assert.equal(f.writes.length,0);assert.equal(r.stale,true);});
test('concurrent recovery signals share one job and probe concurrency is bounded',async()=>{const f=fixture();let active=0,max=0;f.io.probe=async c=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return c.kind==='current'?{ok:false}:healthy();};const p=f.engine.run();assert.equal(f.engine.run(),p);await p;assert.ok(max<=2);assert.equal(f.writes.length,1);assert.equal((await f.engine.run()).cooldown,true);});
test('source credentials are not sent by service probes and response-body deadlines abort',async()=>{const seen=[];const ses={fetch:async(u,o)=>{seen.push([u,o]);return {status:u.endsWith('trace')?200:401,headers:{get:()=>''},text:async()=>u.endsWith('trace')?'ip=203.0.113.8\nloc=JP':'Unauthorized'};}};assert.equal((await N.checkService(ses,100)).ok,true);assert.equal(seen.filter(([u])=>u.startsWith('https://arena.ai/')).length,3);assert.deepEqual(seen.filter(([u])=>!u.startsWith('https://arena.ai/')).map(([u])=>u),['https://my.ippure.com/v1/info','http://ip-api.com/json/?fields=status,query,isp,org,as,mobile,proxy,hosting']);for(const [,o]of seen){assert.equal(o.credentials,'omit');assert.equal(o.method,'GET');assert.equal(o.headers,undefined);}let signal;await assert.rejects(N.checkService({fetch:async(u,o)=>{signal=o.signal;return {text:()=>new Promise(()=>{}),status:200};}},5),/超时/);assert.equal(signal.aborted,true);});
test('global native probe limiter never reuses active slots concurrently',async()=>{let active=0,max=0;const run=N.createProbe(async()=>{active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,2));active--;return true;},2);await Promise.all(Array.from({length:10},()=>run()));assert.equal(max,2);});
function applying(){const a={id:'own',proxy:'vless://old',proxyIp:'p',nodeId:'a',region:'JP',pw:'private',remark:'mine',status:{gacha:{done:9}}},routes=[],e={find:id=>id==='own'?a:null,owner:()=>a,validate:()=>{},apply:async x=>routes.push(x.proxy),persist:()=>{},publicAccount:x=>({id:x.id,proxy:x.proxy}),now:()=>100000};const o={id:'own',expected:P.fields(a),route:{proxy:'vless://next',proxyIp:'p2',nodeId:'b',region:'US',routeHome:'JP'}};return {a,routes,e,o};}
test('native application is fenced to caller and expected route',async()=>{const f=applying(),apply=N.createApply(f.e);assert.equal((await apply({}, {...f.o,id:'other'})).ok,false);f.a.proxy='vless://manual';assert.equal((await apply({},f.o)).ok,false);assert.equal(f.routes.length,0);});
test('native application preserves credentials, remarks, gacha and original region preference',async()=>{const f=applying();assert.equal((await N.createApply(f.e)({},f.o)).ok,true);assert.equal(f.a.pw,'private');assert.equal(f.a.remark,'mine');assert.equal(f.a.status.gacha.done,9);assert.equal(f.a.routeHome,'JP');});
test('failed persistence rolls route back and restores the original session proxy',async()=>{const f=applying();f.e.persist=()=>{throw Error('disk');};assert.equal((await N.createApply(f.e)({},f.o)).ok,false);assert.equal(f.a.proxy,'vless://old');assert.deepEqual(f.routes,['vless://next','vless://old']);assert.equal(f.a.routeAt,undefined);});
test('manual route changes during native application are not overwritten',async()=>{const f=applying();f.e.apply=async x=>{f.routes.push(x.proxy);if(x.proxy==='vless://next')f.a.proxy='vless://manual';};assert.equal((await N.createApply(f.e)({},f.o)).ok,false);assert.equal(f.a.proxy,'vless://manual');assert.deepEqual(f.routes,['vless://next','vless://manual']);});
test('recovery code never invokes business send, gacha start, whole-page reload or shared-account save',()=>{const s=fs.readFileSync(path.join(__dirname,'../ui/auto-route.js'),'utf8');assert.doesNotMatch(s,/\b(?:c|chat|this)\.append\(|reSend|gachaAccount\(|location\.reload|\.reload\(|Host\.saveAccount/);assert.match(s,/c\.restream\(\)/);assert.match(s,/Pool\.switching\.add/);});
test('offline recovery and live stream recovery are both integrated with opt-out and cursor retention',()=>{const read=n=>fs.readFileSync(path.join(__dirname,'../ui',n),'utf8');assert.match(read('offline.html'),/new RoutePolicy\.Engine/);assert.match(read('offline.html'),/cancelled:function/);assert.match(read('core.js'),/headers \? NetPolicy\.IDLE_MS : NetPolicy\.CONNECT_MS/);assert.match(read('core.js'),/h\['Last-Event-ID'\] = String\(this\.lastSeq\)/);assert.match(read('pool.js'),/AutoRoute\.enabled\(\)\) return/);});

test('known risky exits remain excluded unless explicitly trusted',()=>{const pool={rep:{'1.2.3.4':{a:1,px:true,h:true,c:1,r:90}}};assert.equal(P.reputationOK(pool,'key',{eg:'1.2.3.4'},100000),false);pool.trust={key:true};assert.equal(P.reputationOK(pool,'key',{eg:'1.2.3.4'},100000),true);assert.equal(P.reputationOK({},'key',{eg:'1.2.3.4'},100000),false,'unrated exits are not usable (T49)');assert.equal(P.reputationOK({rep:{'1.2.3.4':{pu:{fs:10}}}},'key',{eg:'1.2.3.4'},100000),true);assert.equal(P.reputationOK({rep:{'1.2.3.4':{pu:{fs:30}}}},'key',{eg:'1.2.3.4'},100000),true,'clean non-proxy fs=30 exit is normalized as usable in v2.0.2');assert.equal(P.reputationOK({rep:{'1.2.3.4':{pu:{fs:48}}}},'key',{eg:'1.2.3.4'},100000),false,'non-pure (一般) exits are not usable');});
test('streamed records guard inclusive replay before changing the cursor',()=>{const source=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8');const code=source.slice(source.indexOf('  onRecord(rec) {'),source.indexOf('  onRecord(rec) {')+550);assert.match(code,/\+rec\.seq_num <= \+this\.lastSeq\) return/);});

test('an uncertain POST acknowledgement times out without automatically resending the message',async()=>{const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8'),a=source.indexOf('  async append(bodyObj) {'),b=source.indexOf('\n  // 发送前发现',a);let calls=0;const env={AbortController,crypto:{randomUUID:()=> 'fixture'},now:Date.now,setTimeout:fn=>setTimeout(fn,5),clearTimeout,rawFetch:async(u,o)=>{calls++;return {status:200,ok:true,text:()=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))))};},IN:()=>'/fixture/in'};vm.createContext(env);vm.runInContext('this.chat={'+source.slice(a,b)+'};',env);env.chat.ensureToken=async()=>{};await assert.rejects(env.chat.append({kind:'message'}),/请勿重复发送/);assert.equal(calls,1);});

test('slow but reachable routes are never switched (no latency-based switching)',async()=>{const f=fixture();f.io.probe=async c=>healthy('JP',c.kind==='current'?9000:100);for(const why of ['slow','network','realtime-repeat'])assert.equal((await f.engine.run(why,true)).changed,false);assert.equal(f.writes.length,0);});
test('network failure keeps the ProxyIP and switches the node first',async()=>{const f=fixture();const r=await f.engine.run('network');assert.equal(r.changed,true);assert.equal(f.writes[0].route.proxyIp,'old-ip');assert.notEqual(f.writes[0].route.proxy,'vless://old');});
test('one failed check followed by a good one keeps the current route',async()=>{const f=fixture();let n=0;f.io.probe=async c=>c.kind==='current'?(++n===1?{ok:false}:healthy()):healthy();const r=await f.engine.run('network');assert.equal(r.changed,false);assert.equal(f.writes.length,0);});
test('a read 429 (exit IP limited) switches the ProxyIP on the same node without a current-route check',async()=>{const f=fixture();f.io.probe=async c=>{f.probes.push(c);return healthy(c.region||'JP');};const r=await f.engine.run('limited',true);assert.equal(r.ok,true);assert.equal(r.changed,true);assert.equal(r.mode,'ip');assert.ok(f.probes.every(c=>c.kind!=='current'));assert.equal(f.writes[0].route.proxy,'vless://old');assert.equal(f.writes[0].route.proxyIp,'jp');});
test('the 429 switch skips limited candidates and keeps trying other regions and nodes',async()=>{const f=fixture();f.io.probe=async c=>{f.probes.push(c);return c.proxyIp==='jp'?{ok:false,kind:'rate-limit',reachable:true}:healthy(c.region||'US');};const r=await f.engine.run('limited',true);assert.equal(r.changed,true);assert.notEqual(f.writes[0].route.proxyIp,'jp');assert.ok(f.probes.some(c=>c.proxyIp==='jp'));});
test('the 429 switch never rotates through an exit that is cooling or limited itself and reports when none is left',async()=>{const f=fixture();f.io.probe=async c=>({ok:false,kind:'rate-limit',reachable:true});const r=await f.engine.run('limited',true);assert.equal(r.ok,false);assert.equal(r.limited,true);assert.equal(f.writes.length,0);});
test('a 429 switch respects the authentication lock and fixed (non-recoverable) routes',async()=>{const f=fixture();f.a.authLocked=true;const r=await f.engine.run('limited',true);assert.equal(r.disabled,true);assert.equal(f.writes.length,0);});
test('declining the countdown prompt writes nothing',async()=>{const f=fixture();let asked=null;f.io.confirm=async x=>{asked=x;return false;};const r=await f.engine.run('network');assert.equal(r.declined,true);assert.equal(asked.mode,'node');assert.equal(f.writes.length,0);});
test('v0.13.148: timeout and transport errors trigger onErrorSwitch, cool down failed ProxyIP, interleave optimal nodes, auto-recover chat sends, and show live red timeout badges in panel',async()=>{
  const arSrc=fs.readFileSync(path.join(__dirname,'../ui/auto-route.js'),'utf8');
  const nrSrc=fs.readFileSync(path.join(__dirname,'../ui/node-routes.js'),'utf8');
  const ripSrc=fs.readFileSync(path.join(__dirname,'../ui/region-ip.js'),'utf8');
  const coreSrc=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8');

  // 1. AutoRoute.fault triggers onErrorSwitch on timeouts/transport errors and listens to rtt/ip timeouts
  assert.match(arSrc,/if\(kind!=='stream'&&RoutePolicy\.shouldRotateOnError\?\.\(e\)\)\{\s*void this\.onErrorSwitch\(e,kind\);/);
  assert.match(arSrc,/Bus\.on\('rtt'/);
  assert.match(arSrc,/连接超时 · 冷却中/);

  // 2. RoutePolicy.Engine in networkFirst mode immediately switches to fastest other node + pure ProxyIP when curNode fails
  const f=fixture();
  f.io.networkFirst=true;
  f.io.speed=n=>n.proxy==='vless://old'?{ok:false}:{ok:true,ms:80};
  f.io.probe=async c=>{f.probes.push(c);return c.proxy==='vless://old'?{ok:false,kind:'network'}:healthy(c.region||'JP',85);};
  const r=await f.engine.run('error-switch',true);
  assert.equal(r.ok,true);
  assert.equal(r.changed,true);
  assert.notEqual(f.writes[0].route.proxy,'vless://old');
  assert.equal(f.writes[0].route.proxyIp,'jp');

  // 3. Core send pre-switches on live timeout, auto-recovers on append timeout, and exposes recoverPendingDelivery
  assert.match(coreSrc,/AutoRoute\.onErrorSwitch\(preErr,\s*'pre-send'\)/);
  assert.match(coreSrc,/AutoRoute\.onErrorSwitch\(e,\s*'send-timeout'\)/);
  assert.match(coreSrc,/async recoverPendingDelivery\(\)/);

  // 4. Panel badges reflect live timeout instead of stale cached green latency
  assert.match(nrSrc,/isCurPip\(k\)&&isLiveTimeout\(\)/);
  assert.match(nrSrc,/ms · 出口超时/);
  assert.match(ripSrc,/检测到连接超时 · 正在自动切换最优节点 \/ ProxyIP/);
});

test('smart auto-route across auto-node, auto-ProxyIP, and auto-region: rotates on impure/high-risk/captcha/timeout and stays sticky when healthy',async()=>{
  // 1. shouldRotateOnError triggers on impureIp, riskyIp, captchaTriggered, cfChallenge, and transport/timeout errors
  assert.equal(P.shouldRotateOnError({impureIp:true}),true);
  assert.equal(P.shouldRotateOnError({riskyIp:true}),true);
  assert.equal(P.shouldRotateOnError({captchaTriggered:true}),true);
  assert.equal(P.shouldRotateOnError({cfChallenge:true,responseFormat:true}),true);
  assert.equal(P.shouldRotateOnError({routeTimeout:true,name:'AbortError'}),true);
  assert.equal(P.shouldRotateOnError({status:403,responseFormat:true}),false);

  // 2. Engine rotates when current IP becomes impure (fs >= 25, score <= 70) even if connectivity is 200 OK
  const f=fixture();
  f.data.pool.rep['203.0.113.8']={pu:{fs:35}}; // score = 60 (< 75)
  f.data.pool.trust={jp:true};
  f.io.probe=async c=>c.proxyIp==='jp'?{...healthy('JP',35),ip:'203.0.113.1',pure:{fs:5}}:healthy('JP',40);
  const rImpure=await f.engine.run('impurity',true);
  assert.equal(rImpure.ok,true);
  assert.equal(rImpure.changed,true);
  assert.equal(f.writes[0].route.proxyIp,'jp');

  // 3. Engine with allowCrossRegionEscape (regAuto / exhausted region) escapes to another region even when routeMode is node
  const f2=fixture();
  f2.a.routeMode='node';
  f2.a.routeAuto=true;
  f2.a.nodeFailover=true;
  f2.data.allowCrossRegionEscape=true;
  f2.io.probe=async c=>c.region==='US'?healthy('US',50):{ok:false,kind:'network'};
  const rCross=await f2.engine.run('error-switch',true);
  assert.equal(rCross.ok,true);
  assert.equal(rCross.changed,true);
  assert.equal(f2.writes[0].route.region,'US');

  // 4. Native manual apply with preservePolicy preserves nodeFailover !== false
  const f3=applying();
  const applyManual=N.createApply(f3.e);
  const resManual=await applyManual({},{...f3.o,manual:true,mode:'auto',preservePolicy:true});
  assert.equal(resManual.ok,true);
  assert.equal(f3.a.nodeFailover,true);
});

