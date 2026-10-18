const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('in-flight Pulse response cannot be attributed to a newly selected account',async()=>{
 let resolve;const c=vm.createContext({UI:{host:{account:{id:'A'}}},Store:{get:(k,d)=>d,set(){},del(){}},now:()=>1e6,Acct:{report(){}},Bus:{emit(){}},api:()=>new Promise(r=>resolve=r)});
 const s=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8');vm.runInContext(s.slice(s.indexOf('const Pulse = {'),s.indexOf('// 把本账号的状态'))+';this.P=Pulse;',c);
 const first=c.P.pollNow();c.UI.host.account.id='B';resolve({pulse:60});await first;assert.equal(c.P.v,null);
 const next=c.P.pollNow();resolve({pulse:50});await next;assert.equal(c.P.v.account,'B');assert.equal(c.P.v.pulse,50);
});
