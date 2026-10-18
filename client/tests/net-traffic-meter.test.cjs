const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8').replace(/\r\n/g,'\n');
const a=core.indexOf('const Traffic = {'),b=core.indexOf('\n};\n',a)+4;
assert.ok(a >= 0 && b > a, 'core object boundaries must be found');
function env(){let t=1e6;const c=vm.createContext({console,Promise,Date,Map,Math,String,TextEncoder,URLSearchParams,Blob,now:()=>t,IP:{rtt:80,rttFail:0}});
  vm.runInContext(core.slice(a,b)+';this.T=Traffic;',c);return{T:c.T,IP:c.IP,adv:ms=>{t+=ms;}};}
const resp=chunks=>{let i=0;const mk=()=>({body:{getReader:()=>({read:async()=>i<chunks.length?{done:false,value:{byteLength:chunks[i++]}}:{done:true}})},clone:mk});return mk();};
const flush=()=>new Promise(r=>setImmediate(r));
test('counts request body bytes and streamed response bytes; ignores the /cdn-cgi/trace probe',async()=>{
  const e=env();e.T.track('/api/x',{body:'héllo'},Promise.resolve(resp([100,200,50])));await flush();await flush();await flush();await flush();await flush();
  assert.equal(e.T.up,6);assert.equal(e.T.down,350);assert.equal(e.T.pend.size,0);assert.ok(e.T.lastDownAt>0);
  e.T.track('/cdn-cgi/trace',{},Promise.resolve(resp([300])));await flush();await flush();assert.equal(e.T.down,350);assert.equal(e.T.reqs,1);
});
test('a rejected fetch is counted as an error and not left pending',async()=>{
  const e=env();e.T.track('/api/y',{},Promise.reject(new Error('x')));await flush();await flush();assert.equal(e.T.errs,1);assert.equal(e.T.pend.size,0);
});
test('rate is the average of the last seconds; idle says 0 is normal',()=>{
  const e=env();for(let i=0;i<5;i++){e.T.tick();e.adv(1000);}e.T.tick();
  assert.equal(e.T.rate(3).up,0);assert.equal(e.T.rate(3).down,0);assert.equal(e.T.verdict().kind,'idle');
  e.T.down+=30720;e.adv(1000);e.T.tick();assert.ok(Math.abs(e.T.rate(3).down-10240)<1);assert.equal(e.T.verdict().kind,'ok');
});
test('requests waiting >8s with no bytes = connected but no throughput; failed ping = down',()=>{
  const e=env();e.T.pend.set(1,e.adv(0)||1e6);for(let i=0;i<10;i++){e.T.tick();e.adv(1000);}
  const v=e.T.verdict();assert.equal(v.kind,'wait');assert.match(v.text,/没有速度/);
  e.IP.rtt=0;e.IP.rttFail=2;assert.equal(e.T.verdict().kind,'down');
});
test('fmt',()=>{const e=env();assert.equal(e.T.fmt(0),'0 B');assert.equal(e.T.fmt(2048),'2.0 KB');assert.equal(e.T.fmt(5*1048576),'5.00 MB');});
test('IP badge info text must not use data-tip (plus.js shows its own tooltip for that attribute → two tooltips)',()=>{
  const dock=fs.readFileSync(path.join(__dirname,'../ui/dock.js'),'utf8');
  assert.ok(!/ipIt\.dataset\.tip\b/.test(dock));assert.ok(!/a\.dataset\.tip\b/.test(dock));assert.match(dock,/ipIt\.dataset\.nettip/);
});
