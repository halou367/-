'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {createPoolProbeRunner,withAbort}=require('../src/pool-probe-runtime');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function sender(id){const s=new EventEmitter();s.id=id;s.events=[];s.isDestroyed=()=>!!s.dead;s.send=(channel,data)=>s.events.push({channel,data});return s;}

test('native publishes fast results before the batch completes and deduplicates events',async()=>{
 const gate=deferred(),s=sender(1),runner=createPoolProbeRunner(async(_e,_o,j)=>{j.publish('fast',{ip:'192.0.2.1',brana:true});j.publish('fast',{ip:'192.0.2.1'});await gate.promise;j.publish('slow',{ip:'192.0.2.2'});return ['done'];});
 const p=runner.probe({sender:s},{requestId:'first',pips:['fast','slow']});await tick();
 assert.equal(s.events.filter(x=>x.data.pip).length,1);assert.equal(runner.active,1);
 gate.resolve();assert.deepEqual(await p,['done']);assert.equal(runner.active,0);assert.equal(runner.size,0);assert.equal(s.listenerCount('destroyed'),0);
});
test('cancelling a queued job prevents it from starting',async()=>{
 const gate=deferred(),s=sender(1),starts=[];const runner=createPoolProbeRunner(async(_e,o)=>{starts.push(o.requestId);await gate.promise;return [];},{limit:1});
 const p=runner.probe({sender:s},{requestId:'active'});const q=runner.probe({sender:s},{requestId:'queued'});await tick();
 assert.equal(runner.cancel({sender:s},'queued').cancelled,true);assert.equal((await q).cancelled,true);assert.deepEqual(starts,['active']);gate.resolve();await p;
});
test('a different renderer cannot cancel or receive another renderer job',async()=>{
 const gate=deferred(),a=sender(1),b=sender(2);let job;
 const runner=createPoolProbeRunner(async(_e,_o,j)=>{job=j;await gate.promise;j.publish('x',{ip:'192.0.2.1'});return [];});
 const p=runner.probe({sender:a},{requestId:'owned'});await tick();assert.equal(runner.cancel({sender:b},'owned').cancelled,false);assert.equal(job.signal.aborted,false);
 gate.resolve();await p;assert.equal(b.events.length,0);assert.equal(a.events.filter(x=>x.data.pip).length,1);
});
test('running cancellation does not reuse the session slot before runner cleanup',async()=>{
 const gate=deferred(),s=sender(1),starts=[];let first;
 const runner=createPoolProbeRunner(async(_e,o,j)=>{starts.push(o.requestId);if(o.requestId==='first'){first=j;await gate.promise;j.publish('late',{ip:'192.0.2.9'});}return [];},{limit:1});
 const p=runner.probe({sender:s},{requestId:'first'});await tick();runner.cancel({sender:s},'first');
 const q=runner.probe({sender:s},{requestId:'next'});await tick();assert.equal(first.signal.aborted,true);assert.equal(runner.active,1);assert.deepEqual(starts,['first']);
 gate.resolve();assert.equal((await p).cancelled,true);await q;assert.deepEqual(starts,['first','next']);assert.equal(s.events.some(x=>x.data.pip==='late'),false);
});
test('deadline cancels a cooperative job and returns a timeout result',async()=>{
 const s=sender(1),runner=createPoolProbeRunner(async(_e,_o,j)=>{await withAbort(new Promise(()=>{}),j.signal);},{deadlineMs:20});
 const p=runner.probe({sender:s},{requestId:'deadline'});await new Promise(r=>setTimeout(r,35));const r=await p;assert.equal(r.cancelled,true);assert.equal(r.timedOut,true);assert.equal(runner.size,0);
});
test('destroyed renderer cancels its in-flight jobs',async()=>{
 const s=sender(1),runner=createPoolProbeRunner(async(_e,_o,j)=>withAbort(new Promise(()=>{}),j.signal));
 const p=runner.probe({sender:s},{requestId:'closing'});await tick();s.dead=true;s.emit('destroyed');assert.equal((await p).cancelled,true);assert.equal(runner.size,0);
 assert.match((await runner.probe({sender:s},{})).error,/关闭/);
});
test('duplicate IDs and over-capacity queue requests are rejected, not double-run',async()=>{
 const gate=deferred(),s=sender(1),runner=createPoolProbeRunner(async()=>{await gate.promise;return [];},{limit:1,queueLimit:1});
 const p=runner.probe({sender:s},{requestId:'a'});assert.match((await runner.probe({sender:s},{requestId:'a'})).error,/重复/);
 const q=runner.probe({sender:s},{requestId:'b'});assert.match((await runner.probe({sender:s},{requestId:'c'})).error,/队列/);
 runner.cancel({sender:s},'b');await q;gate.resolve();await p;assert.equal(runner.size,0);
});
test('invalid request IDs do not allocate a job',async()=>{
 const r=createPoolProbeRunner(async()=>[]);assert.match((await r.probe({sender:sender(1)},{requestId:'../bad'})).error,/无效/);assert.equal(r.size,0);
});
test('legacy callers retain final-array results without unsolicited progress',async()=>{
 const s=sender(1),runner=createPoolProbeRunner(async(_e,_o,j)=>{j.publish('x',{ip:'192.0.2.1'});return [{pip:'x'}];});
 assert.deepEqual(await runner.probe({sender:s},{pips:['x']}),[{pip:'x'}]);assert.equal(s.events.length,0);
});
test('abort wrapper rejects promptly and consumes already rejected inputs',async()=>{
 const ctl=new AbortController();const p=withAbort(new Promise(()=>{}),ctl.signal);ctl.abort();await assert.rejects(p,{name:'AbortError'});
 await assert.rejects(withAbort(Promise.reject(Error('inner')),ctl.signal),{name:'AbortError'});
});

function loadPool(){
 const store={},ctx={console,URL,AbortController,crypto:require('node:crypto').webcrypto,atob:s=>Buffer.from(s,'base64').toString('binary'),escape,decodeURIComponent,
  setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},addEventListener(){},navigator:{onLine:true},document:{querySelector:()=>null},now:()=>1.8e12,
  Bus:{emit(){},on(){}},Host:{platform:'desktop',shared:async(k,v)=>v===undefined?store[k]??null:(store[k]=JSON.parse(JSON.stringify(v)))},
  Nodes:{load:async()=>{},pips:[],accts:[],list:[],get:id=>({id,link:'vless:'+id}),fetchSub:async()=>({error:'not configured'})},cleanErr:e=>String(e?.message||e),Vless:{toLink:n=>n.link},Chats:new Map()};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/pool.js'),'utf8')+'\n;globalThis.Pool=Pool;',ctx);ctx.Pool.usedMap=()=>new Map();return ctx;
}
async function seed(ctx,ips={},src=['proxyip.jp.example.net']){await ctx.Pool.load();await ctx.Pool.mutate(d=>{d.src=src;d.node='one';d.ips=ips;});}
test('all 49 untested Japanese-source candidates are included without making them selectable',async()=>{
 const c=loadPool(),ips={};for(let i=1;i<=49;i++)ips['192.0.2.'+i]={ip:'192.0.2.'+i,src:'proxyip.jp.example.net'};
 ips['198.51.100.1']={ip:'198.51.100.1',src:'proxyip.hk.example.net',loc:'HK',ok:true};
 await seed(c,ips,['proxyip.jp.example.net','proxyip.hk.example.net']);const rows=c.Pool.regionCandidates('JP');assert.equal(rows.length,49);assert.ok(rows.every(([,e])=>e.ok==null));assert.equal(c.Pool.regionSources('JP').size,1);
});
test('gone and banned candidates stay excluded',async()=>{
 const c=loadPool();await seed(c,{'192.0.2.1':{src:'proxyip.jp.example.net',gone:true},'192.0.2.2':{src:'proxyip.jp.example.net'}});await c.Pool.mutate(d=>d.ban={'192.0.2.2':1});assert.equal(c.Pool.regionCandidates('JP').length,0);
});
test('forced DNS refresh bypasses UI cache while normal resolution reuses it',async()=>{
 const c=loadPool();let count=0;c.Host.resolve=async()=>{count++;return ['192.0.2.1'];};
 await c.Pool.resolve('jp.example.net');await c.Pool.resolve('jp.example.net');assert.equal(count,1);await c.Pool.resolve('jp.example.net',true);assert.equal(count,2);
});
test('cancelled DNS resolution cannot add or remove stored candidates',async()=>{
 const c=loadPool(),g=deferred();await seed(c,{'192.0.2.1':{src:'proxyip.jp.example.net'}});c.Pool.resolve=()=>g.promise;let stopped=false;
 const p=c.Pool.refreshSrc('proxyip.jp.example.net',true,{cancelled:()=>stopped});stopped=true;g.resolve(['192.0.2.2']);assert.equal((await p).cancelled,true);assert.deepEqual(Object.keys(c.Pool.d.ips),['192.0.2.1']);
});
test('cancellation is checked again after waiting in the shared mutation queue',async()=>{
 const c=loadPool(),g=deferred();await seed(c,{'192.0.2.1':{src:'proxyip.jp.example.net'}});c.Pool.resolve=async()=>['192.0.2.2'];c.Pool.chain=g.promise;let stopped=false;
 const p=c.Pool.refreshSrc('proxyip.jp.example.net',true,{cancelled:()=>stopped});await tick();stopped=true;g.resolve();assert.equal((await p).cancelled,true);assert.deepEqual(Object.keys(c.Pool.d.ips),['192.0.2.1']);
});
test('empty or failed DNS preserves previous entries instead of wiping the region',async()=>{
 const c=loadPool();await seed(c,{'192.0.2.1':{src:'proxyip.jp.example.net'}});c.Pool.resolve=async()=>[];const r=await c.Pool.refreshSrc('proxyip.jp.example.net',true);assert.match(r.err,/保留/);assert.deepEqual(Object.keys(c.Pool.d.ips),['192.0.2.1']);
});
test('stream adapter publishes early, ignores foreign tokens and deduplicates final results',async()=>{
 const c=loadPool(),g=deferred(),received=[];let listener,req,removed=false;
 c.Host.onProbeProgress=fn=>{listener=fn;return()=>{removed=true;};};c.Host.probe=async o=>{req=o;return g.promise;};
 const p=c.Pool.streamProbe(['a','b'],{link:'node',onItem:async(k,r)=>received.push(k)});await tick();
 listener({requestId:'foreign',pip:'a',result:{ip:'192.0.2.1'}});listener({requestId:req.requestId,pip:'a',result:{ip:'192.0.2.1'}});await tick();assert.deepEqual(received,['a']);
 g.resolve([{pip:'a',ip:'192.0.2.1'},{pip:'b',ip:'192.0.2.2'}]);await p;assert.deepEqual(received,['a','b']);assert.equal(removed,true);
});
test('stream cancellation sends the owned request ID and ignores late events',async()=>{
 const c=loadPool(),g=deferred(),ctl=new AbortController(),received=[],cancelled=[];let listener,req,off=false;
 c.Host.onProbeProgress=fn=>{listener=fn;return()=>{off=true;};};c.Host.cancelProbe=async id=>cancelled.push(id);c.Host.probe=async o=>{req=o;return g.promise;};
 const p=c.Pool.streamProbe(['a'],{link:'node',signal:ctl.signal,onItem:k=>received.push(k)});await tick();ctl.abort();assert.equal((await p).cancelled,true);
 listener({requestId:req.requestId,pip:'a',result:{ip:'192.0.2.1'}});g.resolve([{pip:'a',ip:'192.0.2.1'}]);await tick();assert.deepEqual(received,[]);assert.deepEqual(cancelled,[req.requestId]);assert.equal(off,true);
});
test('legacy final-array transports still publish every result',async()=>{
 const c=loadPool(),out=[];c.Host.probe=async()=>[{pip:'a',ip:'192.0.2.1'},{pip:'b',error:'timeout'}];await c.Pool.streamProbe(['a','b'],{link:'node',onItem:k=>out.push(k)});assert.deepEqual(out,['a','b']);
});
test('native transport errors remain errors and are not converted to false completed results',async()=>{
 const c=loadPool(),out=[];c.Host.probe=async()=>({error:'xray unavailable'});const r=await c.Pool.streamProbe(['a'],{link:'node',onItem:k=>out.push(k)});assert.equal(r.error,'xray unavailable');assert.equal(out.length,0);
});
test('regional selectors retain strict verified-region, purity, occupancy and cooldown filters',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../ui/node-routes.js'),'utf8');assert.match(src,/e\.ok===true&&e\.loc===cc/);assert.match(src,/!P\.banned\?\.\(k\)&&pureK\(k\)/);assert.match(src,/!blocked\(k\)&&!cooling\(e\)/);assert.match(src,/candidateRows\(\)\.map/);assert.match(src,/workLive\(j\).*P\.apply/s);
});

test('Japan-specific sources are tested before generic sources learned as Japan',async()=>{
 const c=loadPool();await seed(c,{'192.0.2.1':{src:'proxyip.example.net',loc:'JP',ms:1},'192.0.2.49':{src:'proxyip.jp.example.net'}},['proxyip.example.net','proxyip.jp.example.net']);
 await c.Pool.mutate(d=>{d.dom={'proxyip.example.net':{loc:'JP'}};});
 assert.equal([...c.Pool.regionSources('JP')][0],'proxyip.jp.example.net');assert.equal(c.Pool.regionCandidates('JP')[0][0],'192.0.2.49');
});
test('Japan priority never substitutes Japanese candidates for an explicitly selected Hong Kong region',async()=>{
 const c=loadPool();await seed(c,{'192.0.2.1':{src:'proxyip.jp.example.net'},'198.51.100.1':{src:'proxyip.hk.example.net'}},['proxyip.jp.example.net','proxyip.hk.example.net']);
 assert.deepEqual([...c.Pool.regionCandidates('HK').map(([k])=>k)],['198.51.100.1']);assert.equal(c.Pool.d.ips['192.0.2.1'].ok,undefined);
});
