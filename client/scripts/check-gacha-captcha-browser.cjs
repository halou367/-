// 抽卡遇到人机验证：先换新令牌静默重试；仍被拒就暂停、提醒并弹出官方验证框（由人完成）；按账号+IP 触发频率放慢。全部假接口。
const assert=require('node:assert/strict'),{chromium}=require('playwright'),harness=require('./check-connection-browser.cjs');
const results=[];let browser;
const setup=data=>{
  const f=window.__cap={plan:data.plan.slice(),bodies:[]};
  if(data.seed)localStorage.setItem('anc:gacha:capstat',JSON.stringify(data.seed));
  const E=window.grecaptcha.enterprise;
  E.render=()=>7;E.getResponse=()=>window.__rcTok||'';E.reset=()=>{};
  const base=window.fetch;
  window.fetch=async(input,opt={})=>{
    const p=new URL(String(input),location.href).pathname;
    if(p!=='/nextjs-api/stream/create-chat')return base(input,opt);
    f.bodies.push(JSON.parse(opt.body||'{}'));
    const step=f.plan.length?f.plan.shift():'ok';
    const H={'content-type':'application/json'};
    if(step==='403')return new Response('{"error":"recaptcha validation failed"}',{status:403,headers:H});
    return new Response(JSON.stringify({id:'019a0000-0000-7000-8000-00000000c'+String(f.bodies.length).padStart(3,'0')}),{status:200,headers:H});
  };
};
async function fx(plan,seed){return harness.fixture({platform:'desktop',width:1100,mode:'ok',cached:true,setup,setupData:{plan,seed}});}
async function until(f,fn,what){for(let i=0;i<120;i++){if(await f.page.evaluate(fn))return;await f.page.clock.runFor(500);}
  const d=await f.page.evaluate(()=>({log:(__anc.Gacha.run?.log||[]).map(x=>x.text).slice(-8),phase:__anc.Gacha.run?.phase,n:__cap.bodies.length}));
  throw new Error('timeout: '+what+' '+JSON.stringify(d));}
async function untilLong(f,fn,what){for(let i=0;i<300;i++){if(await f.page.evaluate(fn))return;await f.page.clock.runFor(2000);}
  const d=await f.page.evaluate(()=>({log:(__anc.Gacha.run?.log||[]).map(x=>x.text).slice(-8),phase:__anc.Gacha.run?.phase,n:__cap.bodies.length}));
  throw new Error('timeout: '+what+' '+JSON.stringify(d));}
const logs=f=>f.page.evaluate(()=>(__anc.Gacha.run?.log||[]).map(x=>x.text).join('\n'));
async function begin(f){const r=await f.page.evaluate(()=>__anc.Gacha.start());assert.equal(r.ok,true,'gacha starts: '+JSON.stringify(r));}
async function done(f,name){await f.page.evaluate(()=>__anc.Gacha.stop());assert.deepEqual(f.errors,[],name+' page errors');results.push(name);console.log('PASS',name);await f.context.close();}
async function run(){browser=await chromium.launch({headless:true,args:['--no-sandbox']});harness.setBrowser(browser);try{
 let f=await fx(['403']);await begin(f);
 await until(f,()=>__cap.bodies.length>=2,'silent retry sent');
 await until(f,()=>/静默重试成功/.test((__anc.Gacha.run?.log||[]).map(x=>x.text).join()),'silent retry ok');
 assert.equal(await f.page.evaluate(()=>!!__anc.Gacha.run.needCaptcha),false,'no pause after a successful silent retry');
 assert.equal(await f.page.locator('.rc-back').count(),0,'no verification dialog');
 const b=await f.page.evaluate(()=>__cap.bodies.slice(0,2).map(x=>x.recaptchaV3Token&&!x.recaptchaV2Token));assert.deepEqual(b,[true,true],'both tries use fresh v3 tokens, never v2');
 await done(f,'a rejected v3 token is retried once silently with a fresh token');

 f=await fx(['403','403']);await begin(f);
 await until(f,()=>/自动冷却/.test((__anc.Gacha.run?.log||[]).map(x=>x.text).join()),'auto cool-down announced');
 assert.equal(await f.page.locator('.rc-back').count(),0,'no dialog during automatic cool-down');
 await untilLong(f,()=>__cap.bodies.length>=3&&!__anc.Gacha.run.needCaptcha,'cool-down retry passes');
 assert.equal(await f.page.locator('.rc-back').count(),0,'still no dialog: human was never needed');
 assert.equal(await f.page.evaluate(()=>__cap.bodies[2].recaptchaV3Token&&!__cap.bodies[2].recaptchaV2Token),true,'cool-down retry uses a fresh v3 token');
 await done(f,'rejected twice -> automatic cool-down retry recovers without asking the human');

 f=await fx(['403','403','403','403']);await begin(f);
 await untilLong(f,()=>!!document.querySelector('.rc-back'),'official dialog opens only after automatic retries fail');
 assert.equal(await f.page.evaluate(()=>__cap.bodies.length),4,'two cool-down retries happened before asking');
 assert.match(await f.page.locator('.rc-back .rc-why').textContent(),/抽卡已暂停/);
 const n0=await f.page.evaluate(()=>__cap.bodies.length);await f.page.clock.runFor(8000);
 assert.equal(await f.page.evaluate(()=>__cap.bodies.length),n0,'no draws while paused');
 await f.page.evaluate(()=>{window.__rcTok='human-v2-token';});
 await until(f,()=>__cap.bodies.some(x=>x.recaptchaV2Token==='human-v2-token'),'resumes with the human v2 token');
 assert.equal(await f.page.locator('.rc-back').count(),0,'dialog closed after verification');
 await done(f,'automatic retries fail -> pause, auto-open official dialog, resume after a human completes it');

 f=await fx(['403','403','403','403']);await begin(f);
 await untilLong(f,()=>!!document.querySelector('.rc-back'),'dialog opened');
 await untilLong(f,()=>/自动重试通过/.test((__anc.Gacha.run?.log||[]).map(x=>x.text).join()),'background probe passes while waiting');
 await until(f,()=>!document.querySelector('.rc-back'),'dialog closed by the passing probe');
 assert.equal(await f.page.evaluate(()=>!!__anc.Gacha.run.needCaptcha),false,'running again');
 assert.equal(await f.page.evaluate(()=>__cap.bodies.some(x=>x.recaptchaV2Token)),false,'never sent a v2 token');
 await done(f,'while waiting for a human, a periodic automatic retry can pass and close the dialog');

 const t=Date.parse('2026-10-03T02:00:00Z'),ts=[t-60e3,t-120e3,t-180e3];
 f=await fx([],{'fixture|':ts,'fixture|203.0.113.9':ts});await begin(f);
 await until(f,()=>/两抽间隔至少 30 秒/.test((__anc.Gacha.run?.log||[]).map(x=>x.text).join()),'slowdown logged');
 await until(f,()=>__cap.bodies.length>=1,'first draw');
 const n1=await f.page.evaluate(()=>__cap.bodies.length);await f.page.clock.runFor(20000);
 assert.equal(await f.page.evaluate(()=>__cap.bodies.length),n1,'second draw waits at least 30 s');
 await done(f,'recent verifications for this account + IP stretch the gap between draws');
 console.log(JSON.stringify({passed:results.length}));
}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
