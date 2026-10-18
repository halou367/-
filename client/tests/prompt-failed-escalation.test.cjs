const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=fs.readFileSync(path.join(__dirname,'../ui/core.js'),'utf8');
const a=core.indexOf('function promptFailed(status, body) {'),b=core.indexOf('  c.emit();',core.indexOf('async function createChat0'));
function env(responses,{v2=async()=>'V2TOK'}={}){
  const calls=[],notes=[],actions=[];let i=0;
  const mk=r=>({ok:r.status<400,status:r.status,headers:{get:()=>null},text:async()=>r.body,clone(){return mk(r);}});
  const c=vm.createContext({console,JSON,Promise,Error,Object,AbortController,setTimeout,clearTimeout,Date,
    now:Date.now,uuid7:(()=>{let n=0;return()=>'id'+(++n);})(),sleep:async()=>{},currentTimezone:()=> 'UTC',
    Uploads:{meta:()=>null},Pin:{on:()=>false},Auth:{relogin:async()=>false},
    Quota:{blockedUntil:()=>0,note:r=>notes.push(['quota',r.status])},IPRep:{note:k=>notes.push(['ip',k])},Bus:{emit:(...x)=>notes.push(['bus',x[0]])},
    NetPolicy:{retryAfter:()=>0},History:{byId:()=>null,items:[]},HttpError:class extends Error{constructor(s,b){super(String(b));this.status=s;this.body=b;}},
    Recaptcha:{take:async x=>{actions.push(['take',x]);return 'V3';},v3:async x=>{actions.push(['v3',x]);return 'V3';},v2},
    rawFetch:async(u,o)=>{calls.push(JSON.parse(o.body));return mk(responses[Math.min(i++,responses.length-1)]);},
    chatOf:()=>({emit(){}}),
  });
  vm.runInContext(core.slice(a,b)+';  return c; }\nthis.run=(t,o)=>createChat0(t,o);\nthis.pf=promptFailed;',c);
  return{c,calls,notes,actions};
}
test('promptFailed only matches 429 with the "prompt failed" error',()=>{
  const {c}=env([{status:200,body:'{}'}]);
  assert.equal(c.pf(429,'{"error":"prompt failed"}'),true);assert.equal(c.pf(429,'prompt failed'),true);
  assert.equal(c.pf(429,'{"error":"rate limited"}'),false);assert.equal(c.pf(403,'{"error":"prompt failed"}'),false);
});
test('new chat uses the agentic_chat_submit reCAPTCHA action like the website',async()=>{
  const e=env([{status:200,body:'{"id":"sid1"}'}]);await e.c.run('hi',{}).catch(()=>{});
  assert.deepEqual(e.actions[0],['take','agentic_chat_submit']);
});
test('a repeated-prompt 429 escalates to reCAPTCHA v2, resends the same message and never records a quota block',async()=>{
  const e=env([{status:429,body:'{"error":"prompt failed"}'},{status:200,body:'{"id":"sid1"}'}]);
  await e.c.run('same prompt',{}).catch(()=>{});
  assert.equal(e.calls.length,2);assert.equal(e.calls[0].recaptchaV3Token,'V3');
  assert.equal(e.calls[1].recaptchaV2Token,'V2TOK');assert.equal(e.calls[1].recaptchaV3Token,null);
  assert.equal(e.calls[0].message.id,e.calls[1].message.id);
  assert.ok(!e.notes.some(n=>n[0]==='quota'&&n[1]===429),'no 429 quota note');
  assert.ok(!e.notes.some(n=>n[0]==='bus'&&n[1]==='limited'));
});
test('cancelling the verification stops without sending and without a quota block',async()=>{
  const e=env([{status:429,body:'{"error":"prompt failed"}'}],{v2:async()=>{throw Error('cancel');}});
  await assert.rejects(e.c.run('p',{}),/已取消人机验证/);assert.equal(e.calls.length,1);assert.equal(e.notes.length,0);
});
test('a genuine 429 quota response is still recorded as a rate limit',async()=>{
  const e=env([{status:429,body:'{"error":"too many chats"}'}]);
  await assert.rejects(e.c.run('p',{}));assert.ok(e.notes.some(n=>n[0]==='quota'&&n[1]===429));
});
