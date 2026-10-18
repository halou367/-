const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/route-policy');
const healthy=(loc='JP')=>({ok:true,ip:'203.0.113.8',loc,ms:40,service:true,realtime:true});
function fx(pool,others){const a={id:'own',proxy:'vless://a',proxyIp:'1.1.1.1',nodeId:'a',region:'JP'},w=[];
  pool.rep={'2.2.2.2':{pu:{fs:5}},'3.3.3.3':{pu:{fs:5}},'4.4.4.4':{pu:{fs:5}},'9.9.9.9':{pu:{fs:5}},'203.0.113.8':{pu:{fs:5}},...(pool.rep||{})};   // T49：只用已评估且纯净的出口
  const data={account:a,nodes:[{id:'a',link:'vless://a'}],pool,accounts:[a,...others],enabled:true};
  const io={retryMs:0,now:()=>1e5,read:async()=>data,link:n=>n.link,probe:async c=>c.proxyIp==='1.1.1.1'?{ok:false,kind:'rate-limit',reachable:true}:healthy(),local:async()=>[],apply:async x=>{w.push(x);return {ok:true,account:{...a,...x.route}};}};
  return {w,engine:new P.Engine(io)};}
test('an IP used by another account on a different port is never assigned',async()=>{
  const f=fx({ips:{'2.2.2.2:443':{ok:true,loc:'JP',ms:5},'3.3.3.3':{ok:true,loc:'JP',ms:50}}},[{id:'o',proxy:'vless://a',proxyIp:'2.2.2.2:8443',region:'US'}]);
  await f.engine.run('limited',true);assert.equal(f.w[0]?.route.proxyIp,'3.3.3.3');});
test('an IP whose exit equals another account exit is never assigned',async()=>{
  const f=fx({ips:{'2.2.2.2':{ok:true,loc:'JP',ms:5,eg:'9.9.9.9'},'4.4.4.4':{ok:true,loc:'JP',ms:6,eg:'9.9.9.9'},'3.3.3.3':{ok:true,loc:'JP',ms:50}}},[{id:'o',proxy:'vless://a',proxyIp:'4.4.4.4',region:'US'}]);
  await f.engine.run('limited',true);assert.equal(f.w[0]?.route.proxyIp,'3.3.3.3');});
test('high-risk IPs stay excluded even with the legacy filter switch off',async()=>{
  const f=fx({repOn:false,rep:{'2.2.2.2':{c:1,r:99}},ips:{'2.2.2.2':{ok:true,loc:'JP',ms:5},'3.3.3.3':{ok:true,loc:'JP',ms:50}}},[]);
  await f.engine.run('limited',true);assert.equal(f.w[0]?.route.proxyIp,'3.3.3.3');});
