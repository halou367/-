const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../ui/auto-route.js'),'utf8'),a=src.indexOf('const NetEnv = {'),b=src.indexOf('// Single recovery owner');
const c=vm.createContext({});vm.runInContext(src.slice(a,b)+';this.N=NetEnv;',c);
const lv=(i,l)=>c.N.explain(i).filter(x=>x.lv===l).map(x=>x.text).join('|');
test('system proxy alone is reported as harmless, TUN / fake-ip as a warning',()=>{
  assert.match(c.N.explain({systemProxy:'PROXY 127.0.0.1:7890',kind:'direct'})[0].text,/不读系统代理/);
  assert.equal(lv({systemProxy:'DIRECT',kind:'direct'},'warn'),'');
  assert.match(lv({systemProxy:'DIRECT',kind:'direct',ifaces:['Meta']},'warn'),/TUN/);
  assert.match(lv({kind:'node',node:{host:'h',port:443,ips:['198.18.0.5'],fakeIp:true,tcp:[10,10,10,10]}},'warn'),/fake-ip/);
});
test('node leg: all-fail, flaky and healthy are distinguished and blame the right hop',()=>{
  const n=t=>({kind:'node',proxyIp:'1.2.3.4',node:{host:'h',port:443,tcp:t,ips:['9.9.9.9']}});
  assert.match(lv(n([-1,-1,-1,-1]),'bad'),/和 ProxyIP 无关/);
  assert.match(lv(n([50,-1,60,-1]),'warn'),/2 次失败/);
  assert.match(c.N.explain(n([50,60,55,52])).map(x=>x.text).join('|'),/节点 → ProxyIP → Brana/);
});
test('a proxy pointing at a local port is flagged as Clash-dependent',()=>{
  assert.match(lv({kind:'proxy',proxyHost:'127.0.0.1',proxyPort:'7890',defaultProxy:true},'warn'),/依赖 Clash/);
  assert.equal(lv({kind:'proxy',proxyHost:'203.0.113.5',proxyPort:'1080'},'warn'),'');
});
