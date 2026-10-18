const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8').replace(/\r\n/g,'\n');
const a=core.indexOf('const IP = {'),b=core.indexOf('\n};\n',a)+4;
assert.ok(a >= 0 && b > a, 'core object boundaries must be found');
function env(entry,account={proxyIp:'195.133.44.21'}){
  const muts=[];let t=1e6;
  const Pool={d:{ips:{'195.133.44.21':entry}},mutate:async fn=>{muts.push(1);return fn(Pool.d);}};
  const c=vm.createContext({console,Promise,Date,String,now:()=>t,UI:{host:{account}},Pool,Bus:{emit(){}},NetPolicy:{},rawFetch:async()=>{},performance:{now:()=>0}});
  vm.runInContext(core.slice(a,b)+';this.IP=IP;',c);return{c,IP:c.IP,Pool,muts,setNow:v=>t=v};
}
test('a live latency that works clears a stale "bad" mark on the ProxyIP in use',async()=>{
  const e=env({ok:false,err:'连接失败',fc:3,ms:0,at:1});e.IP.rtt=655;e.IP.rttAt=1e6;e.IP.ip='195.133.44.21';e.IP.reconcile();await new Promise(r=>setImmediate(r));
  const x=e.Pool.d.ips['195.133.44.21'];assert.equal(x.ok,true);assert.equal(x.ms,655);assert.equal(x.err,'');assert.equal(x.fc,0);
});
test('an already-good entry is left alone (no storage write on every ping), failed pings never mark good',async()=>{
  let e=env({ok:true,ms:100});e.IP.rtt=300;e.IP.reconcile();assert.equal(e.muts.length,0);
  e=env({ok:false});e.IP.rtt=0;e.IP.rttFail=2;e.IP.reconcile();assert.equal(e.muts.length,0);assert.equal(e.Pool.d.ips['195.133.44.21'].ok,false);
});
test('liveFor only reports the ProxyIP that the account is actually using, and only while fresh',()=>{
  const e=env({ok:false});e.IP.rtt=655;e.IP.rttAt=1e6;
  assert.equal(e.IP.liveFor('195.133.44.21'),655);assert.equal(e.IP.liveFor(' 195.133.44.21 '),655);assert.equal(e.IP.liveFor('1.2.3.4'),0);
  e.setNow(1e6+40000);assert.equal(e.IP.liveFor('195.133.44.21'),0);
});
