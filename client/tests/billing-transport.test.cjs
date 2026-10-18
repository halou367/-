const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../ui/billing-probe.js'), S = require('../ui/arena-trace/catalog-sync.js');
function jar(initial = '', {block=false,retain=false} = {}) {
  let value=initial; const writes=[];
  return {writes,get cookie(){return value;},set cookie(next){writes.push(next);if(block)return;if(next.includes('Max-Age=0')){if(!retain)value='';}else value=next.split(';')[0];}};
}
test('current leaderboard fields parse from flight chunks and missing numbers stay missing',()=>{
 const rows=Array.from({length:22},(_,i)=>({contenderName:'contenders/test-'+i,model:'Test '+i,modelOrganization:'Example',inputPricePerMillion:i===21?null:1,outputPricePerMillion:2}));
 const json=JSON.stringify({rows});const html=[json.slice(0,150),json.slice(150)].map(x=>'self.__next_f.push([1,'+JSON.stringify(x)+'])').join('');
 const parsed=S.parseAgentLeaderboard(html);assert.equal(parsed.ok,true);assert.equal(parsed.stats.priced,21);assert.equal(parsed.rows[0].key,'contenders/test-0');assert.equal(parsed.rows[0].label,'Test 0');assert.equal(parsed.rows[0].org,'Example');assert.equal(parsed.rows[21].inputPerMillion,null);assert.equal(parsed.rows[0].agentTaskCostP50,null);assert.equal(parsed.rows[0].contextLength,null);
 assert.equal(S.parseAgentLeaderboard('<html>Verify you are human</html>').ok,false);
});
test('cost visibility is temporary, same-origin request options and server errors survive',async()=>{
 for(const status of [0,401,403,429]){
  const cookies=jar();const error=Object.assign(Error('server'),{status,retryAfterMs:180000});
  const read=B.costRequest(async(path,opt)=>{assert.equal(path,'/api/chat/id/cost?includeSession=true');assert.equal(opt.redirect,'error');assert.equal(opt.noRelogin,true);assert.equal(JSON.parse(decodeURIComponent(cookies.cookie.split('=')[1]))['credit-system-m1'],'cost-shown');if(status)throw error;return {ok:true};},cookies);
  const promise=read('/api/chat/id/cost?includeSession=true',{noRelogin:true});if(status)await assert.rejects(promise,e=>e===error);else assert.deepEqual(await promise,{ok:true});assert.equal(cookies.cookie,'');assert.equal(cookies.writes.length,2);
 }
});
test('existing display settings and settings changed during requests are preserved',async()=>{
 const enabled='ph-toolbar-overrides='+encodeURIComponent(JSON.stringify({'credit-system-m1':'cost-shown',another:'keep'}));const cookies=jar(enabled);await B.costRequest(async()=>1,cookies)('/cost',{});assert.equal(cookies.cookie,enabled);assert.equal(cookies.writes.length,0);
 for(const value of ['ph-toolbar-overrides=broken','ph-toolbar-overrides=%7B%22another%22%3Atrue%7D']){const c=jar(value);await assert.rejects(B.costRequest(async()=>assert.fail('must not request'),c)('/cost',{}),/已有其他/);assert.equal(c.cookie,value);assert.equal(c.writes.length,0);}
 const changed=jar();await B.costRequest(async()=>{changed.cookie=enabled;},changed)('/cost',{});assert.equal(changed.cookie,enabled);
});
test('overlapping cost readers keep display enabled for both, then clean up',async()=>{
 const cookies=jar();let release,calls=0;const read=B.costRequest(async()=>{calls++;assert(cookies.cookie);if(calls===1)await new Promise(r=>release=r);return calls;},cookies);
 const one=read('/cost',{}),two=read('/cost',{});await Promise.resolve();assert.equal(calls,1);release();await Promise.all([one,two]);assert.equal(calls,2);assert.equal(cookies.cookie,'');
});
test('blocked cookies and cleanup failures give actionable errors',async()=>{
 await assert.rejects(B.costRequest(async()=>assert.fail('must not request'),jar('',{block:true}))('/cost',{}),/未接受/);
 await assert.rejects(B.costRequest(async()=>1,jar('',{retain:true}))('/cost',{}),/清理失败/);
});
test('account cooldown retains actual cause, honors Retry-After and isolates accounts',async()=>{
 let time=1000,owner='a',calls=0;const engine=B.create({account:()=>owner,clock:()=>time,bundled:{data:[]},request:async()=>{calls++;throw Object.assign(Error('challenge'),{status:403,responseFormat:true,retryAfterMs:180000});}});
 const chat=sid=>({sid,messages:[{id:'m',role:'assistant',parts:[]}]});await engine.refresh(chat('s'));const error=engine.state('s').error;assert.match(error,/验证页面.*403/);assert.equal(engine.state('s').retryAt,181000);
 time+=16000;await engine.refresh(chat('other'));assert.equal(calls,1);assert.equal(engine.state('other').error,error);owner='b';await engine.refresh(chat('s'));assert.equal(calls,2);owner='a';time=181001;await engine.refresh(chat('s'));assert.equal(calls,3);
});
