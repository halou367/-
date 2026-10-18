const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gpt-6-astra-three.json'), 'utf8'));
function setup(options = {}) {
  const saved = options.saved || new Map(), models = new Map();
  let clock = 1, requestCount = 0;
  const context = vm.createContext({ console, setTimeout, clearTimeout, AbortController, AbortSignal, TextEncoder, TextDecoder, crypto: webcrypto,
    now: () => clock, sleep: async ms => { clock += ms; options.onSleep?.(); },
    rawFetch: async (url, init) => { requestCount++; assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer'); return options.fetch ? options.fetch(url, init) : Promise.reject(Error('offline')); },
    Store: { get: (k,d) => saved.has(k) ? saved.get(k) : d, set: (k,v) => saved.set(k,v) },
    Models: { get: sid => models.get(sid), set: (sid,e) => models.set(sid,e) },
    Bus: {emit(){}}, toast(){},
    Trace: { turns: () => options.turns || [] },
    Strength: { samples: {}, parts: name => ({tier: /-(max|high)$/.exec(name)?.[1] || ''}), isLive:x=>Number.isFinite(x.rs)&&x.rs>0||Number.isFinite(x.rChars)&&x.rChars>0||Number.isFinite(x.think)&&x.think>=5,scoreOf: x => x.out > 0 ? 50.5 : null },
    Fmt: {guess: () => ({fam: options.fam || 'gpt', sure: true, why: 'test-only format'}), est: () => ({score:128.6, out:1000, sec:24.2, usd:null})},
  });
  vm.runInContext(fs.readFileSync(path.join(root,'ui/probe-vendor.js'),'utf8'),context);
  vm.runInContext('ProbeLib.setCertainStop('+(!!options.certainStop)+')',context);
  if (options.modifyLib) vm.runInContext(options.modifyLib,context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/probe-bank-cache.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/probe-output-guard.js'),'utf8')+';this.Guard=ProbeOutputGuard;',context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/gacha-prompts.js'),'utf8')+';this.GachaPrompts=GachaPrompts;',context);
  vm.runInContext(fs.readFileSync(path.join(root,'ui/fingerprint.js'),'utf8') + '\nthis.Fingerprint = Fingerprint; this.ProbeLib = ProbeLib; this.BankCache=ProbeBankCache;',context);
  const F = context.Fingerprint, P = F.PROBES;
  const user = i => ({role:'user',id:'u'+i,parts:[{type:'text',text:P[i].prompt}]});
  const assistant = i => ({role:'assistant',id:'a'+i,parts:[{type:'text',text:fixture[i].text}],metadata:{pending:false}});
  const sent = [];
  const chat = {sid:'session-A',messages:[user(0),assistant(0)],busy:false,fmt:{ids:[]},emit(){},
    async send(text) { const i = sent.length+1; sent.push(text); this.messages.push(user(i),assistant(i)); options.onSend?.(this,i); }
  };
  return {context,F,P,chat,sent,saved,models,assistant,user,requestCount:()=>requestCount};
}

test('new conversation without any run token completes three numerical probes', async () => {
  const h = setup(), e = await h.F.run(h.chat);
  assert.equal(h.sent.length,2);
  assert.equal(h.sent[0],h.P[1].prompt); assert.equal(h.sent[1],h.P[2].prompt);
  assert.equal(e.fingerprint.result.nearest.id,'gpt-6-astra');
  assert.equal(e.fingerprint.count,3); assert.equal(e.fingerprint.result.used_outputs,3);
  assert.match(e.fingerprint.suffix,/匹配置信度/);
  assert.equal(e.fingerprint.reasoning.score,128.6);
  assert.equal(e.fingerprint.reasoning.source,'estimated');
  assert.equal(e.fingerprint.reasoning.tier,null);
  assert.equal(e.guess,true); assert.equal(e.tier,null);
  assert.equal(h.requestCount(),1);
});
test('locally bundled prompts and calibration keys are exact', () => {
  const h = setup(); assert.equal(h.F.promptKey(h.P[0].prompt),'modeltrace-plain-v1:plain-1');
  assert.equal(h.F.promptKey('只回复我9不要调用任何工具'),'');
  assert.equal(h.F.promptKey(h.P[0].prompt + ' optimize this'),'');
});
test('explicit open-weight bank metadata exercises the one-probe path', async () => {
  const h = setup({modifyLib:"for (const m of ProbeLib.seedBank.models) m.open_weights = true;"});
  const e = await h.F.run(h.chat);
  assert.equal(e.fingerprint.result.status,'clear');
  assert.equal(h.sent.length,0); assert.equal(e.fingerprint.count,1);
  assert.match(e.fingerprint.suffix,/匹配置信度 \d+(\.\d)?%/);   // 任何阶段都显示置信度
});
test('invalid first reply is kept unknown and never silently resent', async () => {
  const h = setup(); h.chat.messages[1].parts[0].text='9';
  const e = await h.F.run(h.chat);
  assert.equal(h.sent.length,0); assert.equal(e.name,'未知型号');
  assert.ok(e.fingerprint.error); assert.equal(e.fingerprint.suffix,'');
});
test('an inconclusive retest keeps the model already measured for this chat', async () => {
  const h = setup(); const first = await h.F.run(h.chat);
  assert.ok(first.fingerprint.result?.nearest?.id); const name = first.name;
  h.chat.messages[1].parts[0].text='9';
  const again = await h.F.run(h.chat);
  assert.equal(again.name, name); assert.equal(again, h.models.get(h.chat.sid));
  assert.ok(!/^未知型号/.test(again.name));
});
test('duplicate second answer stops before third and suppresses percentage', async () => {
  const h = setup({onSend(c,i){if(i===1)c.messages.at(-1).parts[0].text=fixture[0].text;}});
  const e = await h.F.run(h.chat);
  assert.equal(h.sent.length,1); assert.match(e.fingerprint.error,/相同/);
  assert.equal(e.name,'未知型号'); assert.equal(e.fingerprint.suffix,'');
});
test('tool and interaction replies are not scored or answered automatically', async () => {
  const h = setup(); h.chat.messages[1].parts.push({type:'tool-ask_user',toolCallId:'tool-1'});
  const e = await h.F.run(h.chat);
  assert.equal(h.sent.length,0); assert.equal(e.fingerprint.count,0); assert.match(e.fingerprint.error,/工具/);
});
test('cancel immediately after first score prevents second prompt', async () => {
  const h = setup(), ctl = new AbortController();
  await assert.rejects(h.F.run(h.chat,{signal:ctl.signal,progress:t=>{if(t.startsWith('指纹 1/'))ctl.abort();}}),/停止/);
  assert.equal(h.sent.length,0);
});
test('cancel while append is pending cannot cause a third send', async () => {
  const h = setup(), ctl = new AbortController(); let sends=0;
  h.chat.send=async()=>{sends++;ctl.abort();await new Promise(()=>{});};
  await assert.rejects(h.F.run(h.chat,{signal:ctl.signal}),/停止/);
  assert.equal(sends,1);
});
test('another user message in the same chat stops the sequence', async () => {
  const h = setup();
  const e = await h.F.run(h.chat,{progress:t=>{if(t.startsWith('指纹 1/'))h.chat.messages.push({role:'user',parts:[{type:'text',text:'my draft sent'}]});}});
  assert.equal(h.sent.length,0); assert.match(e.fingerprint.error,/其他消息/);
});
test('compatible stream cannot be falsely assigned GPT from a conflicting GPT candidate', async () => {
  const h = setup({fam:'compat'}), e = await h.F.run(h.chat);
  assert.equal(e.fingerprint.count,3); assert.equal(e.fingerprint.conflict,true);
  assert.equal(e.name,'未知型号'); assert.equal(e.fingerprint.suffix,'');
});
test('measured reasoning uses the existing score function, not strength score', async () => {
  const h = setup();
  h.context.Trace.turns=()=>[{done:true,prompt:h.P[0].prompt,sum:{output:1000,tok:1100,usd:.02,reasoning:100},calls:[{ms:20000}]}];
  const e = await h.F.run(h.chat);
  assert.equal(e.fingerprint.reasoning.score,50.5); assert.equal(e.fingerprint.reasoning.source,'measured');
});
test('real API label is retained; fingerprint remains a separate diagnostic', async () => {
  const h = setup(); h.models.set(h.chat.sid,{name:'gpt-6-astra-max',guess:false,tier:'max'});
  const e = await h.F.run(h.chat);
  assert.equal(e.name,'gpt-6-astra-max'); assert.equal(e.guess,false); assert.ok(e.fingerprint);
  assert.equal(e.fingerprint.reasoning.tier,null); // never infer from this conversation's own label
});
test('server-side model changes invalidate the combined evidence', async () => {
  const h = setup(); h.models.set(h.chat.sid,{name:'gpt-6-astra-max',guess:false});
  const e = await h.F.run(h.chat,{progress:t=>{if(t.startsWith('指纹 1/'))h.models.set(h.chat.sid,{name:'claude-opus-5-max',guess:false});}});
  assert.equal(h.sent.length,0); assert.match(e.fingerprint.error,/型号改变/);
});
test('tampered remote data falls back to the verified local bank', async () => {
  const h = setup({fetch:async()=>({ok:true,headers:{get:()=> 'application/json'},text:async()=>'{"not":"a bank"}'})});
  const a = await h.F.loadBank(), b = await h.F.loadBank();
  assert.equal(a.fallback,false); assert.equal(a.bank.models.length,21); await h.context.BankCache.refresh(true);
  assert.equal(a,b); assert.equal(h.requestCount(),2);
});
test('uncertain results never satisfy a target or get auto-archived', () => {
  const h=setup();
  for (const fp of [{error:'bad'}, {conflict:true}, {result:{status:'weak'}}, {result:{status:'close'}}]) assert.equal(h.F.classify({fingerprint:fp},{minStr:''},true),'keep');
  const e={fingerprint:{result:{status:'clear'},reasoning:{tier:'max'}}};
  assert.equal(h.F.classify(e,{minStr:'top'},true),'hit');
  e.fingerprint.reasoning.tier=null;assert.equal(h.F.classify(e,{minStr:'top'},true),'keep');
  assert.equal(h.F.classify(e,{minStr:''},false),'keep');
});
test('old history and multiple assistant responses cannot leak into a probe', () => {
  const h=setup();h.chat.messages.unshift({role:'assistant',parts:[{type:'text',text:'old'}]});
  assert.equal(h.F.currentAnswer(h.chat,h.P[0].prompt).id,'a0');
  h.chat.messages.push(h.assistant(0)); assert.throws(()=>h.F.currentAnswer(h.chat,h.P[0].prompt),/多条助手/);
});
test('the assembled desktop/Android bundle parses successfully', () => {
  const {build}=require('../src/bundle');
  const code=build(path.join(root,'ui'),'0.13.90-beta.1');
  assert.doesNotThrow(()=>new vm.Script(code));
  assert.ok(code.indexOf('const ProbeLib =') < code.indexOf('const Fingerprint ='));
  assert.ok(code.includes('数字指纹识别'));
});


test('cancel at the sending progress callback still prevents the append', async () => {
  const h = setup(), ctl = new AbortController();
  await assert.rejects(h.F.run(h.chat,{signal:ctl.signal,progress:t=>{if(t.startsWith('发送指纹第 2'))ctl.abort();}}),/停止/);
  assert.equal(h.sent.length,0);
});
test('export contains numerical samples and diagnostics, not conversation IDs or prompts', async () => {
  const h = setup(); await h.F.run(h.chat);
  const r = h.F.report(h.chat), text = JSON.stringify(r);
  assert.equal(r.samples.length,3); assert.ok(r.samples[0].numbers.every(Number.isInteger));
  assert.equal(r.groundTruth,null);
  assert.equal(text.includes('session-A'),false);
  assert.equal(text.includes(h.P[0].prompt),false);
});

const seedText = fs.readFileSync(path.join(root,'data/fingerprint-bank-v2026.09.5.json'),'utf8');
const sha = s => require('node:crypto').createHash('sha256').update(s).digest('hex');
const response = (text,type='application/json') => ({ok:true,headers:{get:()=>type},text:async()=>text});
function manifest(h,version='2026.09.5',hash=sha(seedText)) {
  return `<body data-bank="/data/bank/v${version}.json" data-bank-version="${version}" data-bank-sha256="${hash}">${h.P.map(p=>`<pre class="prompt">${p.prompt}</pre>`).join('')}</body>`;
}
test('remote bank is SHA-verified, persisted, and survives offline restart', async()=>{
  const h=setup();h.context.rawFetch=async url=>response(url.endsWith('/')?manifest(h):seedText,url.endsWith('/')?'text/html':'application/json');
  await h.context.BankCache.refresh(true);
  const key=h.context.BankCache.KEY,record=h.saved.get(key);assert.equal(record.sha,sha(seedText));assert.equal(record.version,'2026.09.5');
  const offline=setup({saved:h.saved});const bank=await offline.F.loadBank();await offline.context.BankCache.refresh();
  assert.equal(bank.persistent,true);assert.equal(bank.bank.models.length,21);assert.match(bank.source,/本地缓存/);
  assert.equal(offline.saved.get(key),record);
});
test('new compatible bank updates atomically and does not mutate an active run snapshot',async()=>{
  const h=setup();const old=await h.F.loadBank();await h.context.BankCache.refresh();
  const text=JSON.stringify({...JSON.parse(seedText),built_at:'2026-10-01T00:00:00Z'});
  h.context.rawFetch=async url=>response(url.endsWith('/')?manifest(h,'2026.10.1',sha(text)):text,url.endsWith('/')?'text/html':'application/json');
  const newer=await h.context.BankCache.refresh(true);
  assert.equal(newer.version,'2026.10.1');assert.equal(old.version,'2026.09.5');assert.notEqual(newer,old);
});
test('integrity failure never replaces the last good disk record',async()=>{
  const h=setup();h.context.rawFetch=async url=>response(url.endsWith('/')?manifest(h):seedText,url.endsWith('/')?'text/html':'application/json');await h.context.BankCache.refresh(true);
  const before=h.saved.get(h.context.BankCache.KEY);
  h.context.rawFetch=async url=>response(url.endsWith('/')?manifest(h,'2026.10.1','a'.repeat(64)):'{}',url.endsWith('/')?'text/html':'application/json');
  const bank=await h.context.BankCache.refresh(true);assert.equal(bank.version,'2026.09.5');assert.equal(h.saved.get(h.context.BankCache.KEY),before);
  assert.ok(h.context.BankCache.status().error);
});
test('external URLs and changed prompt protocols are rejected without executing code',()=>{
  const h=setup();assert.throws(()=>h.context.BankCache.descriptor(manifest(h).replace('/data/bank/','https://evil.invalid/')),/元数据/);
  assert.throws(()=>h.context.BankCache.descriptor(manifest(h).replace(h.P[0].prompt,'different prompt')),/协议/);
});
test('corrupt local cache does not defeat bundled 21-model availability',async()=>{
  const h=setup();h.saved.set(h.context.BankCache.KEY,{...h.context.BankCache.PIN,protocol:'modeltrace-plain-v1',text:'{}'});
  const b=await h.F.loadBank();assert.equal(b.bank.models.length,21);assert.equal(b.persistent,false);
});
test('older server version cannot downgrade the current bank',async()=>{
  const h=setup();await h.F.loadBank();await h.context.BankCache.refresh();
  h.context.rawFetch=async()=>response(manifest(h,'2026.08.1'),'text/html');const b=await h.context.BankCache.refresh(true);
  assert.equal(b.version,'2026.09.5');assert.match(h.context.BankCache.status().error,/回退/);
});
test('storage failure is surfaced while keeping a usable in-memory copy',async()=>{
  const h=setup();h.context.Store.set=()=>{};h.context.rawFetch=async url=>response(url.endsWith('/')?manifest(h):seedText,url.endsWith('/')?'text/html':'application/json');
  const b=await h.context.BankCache.refresh(true);assert.equal(b.persistent,false);assert.equal(b.bank.models.length,21);assert.match(h.context.BankCache.status().error,/空间/);
});
test('compat thinking is stopped once, kept unscored, and completes a draw',async()=>{
  const h=setup({fam:'compat'});h.chat.gacha={fingerprint:true,skipCompatThinking:true};h.chat.busy=true;h.chat.fmt.rHead='Let me think';let stops=0;
  h.chat.stop=async opt=>{assert.equal(opt.strict,true);stops++;h.chat.busy=false;};
  assert.equal(h.F.maybeStopCompat(h.chat),true);assert.equal(h.F.maybeStopCompat(h.chat),false);
  const e=await h.F.run(h.chat);assert.equal(stops,1);assert.equal(h.sent.length,0);assert.equal(e.fingerprint.skipped,'visible-thinking');assert.equal(e.fingerprint.result,null);
});
test('empty reasoning, disabled switch and ordinary chats are not stopped',()=>{
  for(const opt of [{fam:'compat',gacha:null,head:'think'},{fam:'compat',gacha:{skipCompatThinking:false},head:'think'},{fam:'compat',gacha:{skipCompatThinking:true},head:''}]){
    const h=setup({fam:opt.fam});h.chat.busy=true;h.chat.gacha=opt.gacha;h.chat.fmt.rHead=opt.head;h.chat.stop=()=>assert.fail('unexpected stop');assert.equal(h.F.maybeStopCompat(h.chat),false);
  }
});
test('authoritative identity does not veto operational visible-thinking skip',async()=>{
  const h=setup({fam:'compat'});h.chat.busy=true;h.chat.gacha={skipCompatThinking:true};h.chat.fmt.rHead='thought';h.models.set(h.chat.sid,{name:'claude-opus-5-max',guess:false});h.chat.stop=async()=>{h.chat.busy=false;};assert.equal(h.F.maybeStopCompat(h.chat),true);const e=await h.F.finishCompatSkip(h.chat);assert.equal(e.name,'claude-opus-5-max');assert.equal(e.guess,false);assert.equal(e.fingerprint.reasoning.score,null);
});
test('failed stop raises a fatal marker instead of silently starting a new draw',async()=>{
  const h=setup({fam:'compat'});h.chat.busy=true;h.chat.gacha={fingerprint:true,skipCompatThinking:true};h.chat.fmt.rHead='thought';h.chat.stop=async()=>{throw Error('network offline');};
  await assert.rejects(h.F.run(h.chat),e=>e.code==='COMPAT_STOP_FAILED');assert.equal(h.sent.length,0);
});
test('global stop cancellation wins while waiting for automatic stop completion',async()=>{
  const h=setup({fam:'compat'}),ctl=new AbortController();h.chat.busy=true;h.chat.gacha={skipCompatThinking:true};h.chat.fmt.rHead='thought';h.chat.stop=async()=>{ctl.abort();};
  await assert.rejects(h.F.run(h.chat,{signal:ctl.signal}),/停止/);assert.equal(h.sent.length,0);
});
test('legacy gacha uses the same stop-and-skip decision',async()=>{
  const h=setup({fam:'compat'});h.chat.busy=true;h.chat.gacha={skipCompatThinking:true,fingerprint:false};h.chat.fmt.rHead='thought';h.chat.stop=async()=>{h.chat.busy=false;};
  const e=await h.F.waitCompatDecision(h.chat);assert.equal(e.fingerprint.skipped,'visible-thinking');
});
test('/测指纹 runs in the selected old conversation and is not sent as chat text',async()=>{
  const h=setup();h.chat.messages=[];const prompts=[];
  h.chat.send=async text=>{const i=h.P.findIndex(p=>p.prompt===text);assert.ok(i>=0);prompts.push(text);h.chat.messages.push(h.user(i),h.assistant(i));};
  const command=h.F.command(h.chat,'  /测指纹  ');assert.equal(command.accepted,true);await command.completion;
  assert.equal(prompts.length,3);assert.equal(h.chat.sid,'session-A');assert.equal(prompts.includes('/测指纹'),false);
});
test('slash command refuses busy chats, new tabs, attachments and pending queues',()=>{
  const h=setup();assert.equal(h.F.command(null,'/测指纹').accepted,false);
  assert.equal(h.F.command(h.chat,'/测指纹',{attachments:true}).accepted,false);
  h.chat.busy=true;assert.equal(h.F.command(h.chat,'/测指纹').accepted,false);h.chat.busy=false;h.chat.queue=[{}];assert.equal(h.F.command(h.chat,'/测指纹').accepted,false);
  assert.equal(h.F.command(h.chat,'请执行 /测指纹').handled,false);assert.equal(h.sent.length,0);
});
test('strict Chat.stop surfaces append failure instead of swallowing it',async()=>{
  const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8');const method=core.slice(core.indexOf('  async stop(opt'),core.indexOf('  async stopCheck'));
  const ctx=vm.createContext({now:()=>1,toast(){},describe:e=>e.message,setTimeout(){}});
  const stop=vm.runInContext('({'+method+'}).stop',ctx);const c={busy:true,status:'streaming',emit(){},append:async()=>{throw Error('stop denied');}};
  await assert.rejects(stop.call(c,{strict:true}),/stop denied/);
});
test('desktop/Android bridge fetches HTML metadata without CORS and marks it public-only',async()=>{
 const h=setup(),calls=[];h.context.Host={fetchText:async(url,opt)=>{assert.equal(opt.publicData,true);calls.push(url);return {text:url.endsWith('/')?manifest(h):seedText,contentType:url.endsWith('/')?'text/html':'application/json'};}};
 const b=await h.context.BankCache.refresh(true);assert.equal(b.persistent,true);assert.equal(calls.length,2);assert.equal(h.requestCount(),0);
});
test('seed bundle contains the original verified remote JSON',()=>{
 const h=setup();assert.equal(sha(seedText),h.context.BankCache.PIN.sha);assert.equal(h.context.ProbeLib.seedBank.models.length,21);
});
test('compact fingerprint name keeps the requested precision and full diagnostics separately',()=>{
 const {F}=setup(),e={name:'gpt-6-luna',fingerprint:{suffix:' · 匹配置信度 100.0%',reasoning:{score:64.1,source:'estimated',tier:null}}};
 assert.equal(F.describe(e),'gpt-6-luna(100.0%)-64.1分');assert.match(F.details(e),/估算推理分 64.1/);assert.match(F.details(e),/档位未校准/);
});
test('compact fingerprint label does not invent confidence or a missing score',()=>{
 const {F}=setup();assert.equal(F.describe({name:'gpt-6-luna',fingerprint:{suffix:'',reasoning:{score:null}}}),'gpt-6-luna');assert.equal(F.describe({name:'gpt-6-luna',fingerprint:{reasoning:{score:0}}}),'gpt-6-luna-0分');
});

test('guard accepts all authentic fixtures and accidental short duplicates',()=>{
 const h=setup();for(let i=0;i<3;i++)assert.equal(h.context.Guard.inspect(fixture[i].text,h.P[i].expected_count),null);
 assert.equal(h.context.Guard.inspect('4, 8, 4, 8, 4, 8',297),null);
});
test('guard catches bounded repeating blocks, constants and extreme text before scoring',()=>{
 const {Guard:g}=setup().context;
 for(const period of [1,2,8,16,32,64]){const block=Array.from({length:period},(_,i)=>i*3+7).join(',')+',';const text=block.repeat(Math.max(3,Math.ceil(24/period)));assert.equal(g.inspect(text,297,true).reason,'probe-repeat');}
 assert.equal(g.inspect('9 '.repeat(4000),331).reason,'probe-too-long');
});
test('count guard uses each exact probe budget and tolerates an unfinished digit run',()=>{
 const h=setup();for(const p of h.P){const limit=Math.ceil(p.expected_count*1.2);const a=Array.from({length:limit+1},(_,i)=>(i*131)%355+1).join(',');assert.equal(h.context.Guard.inspect(a,p.expected_count,true),null);assert.equal(h.context.Guard.inspect(a+',',p.expected_count,true).reason,'probe-too-many');assert.equal(h.context.Guard.inspect(a,p.expected_count,false).limit,limit);}
});
test('runaway reply stops exactly once and exports only unscored pending diagnostics',async()=>{
 const h=setup();h.chat.busy=true;h.chat.gacha={fingerprint:true,skipCompatThinking:false};h.chat.messages[1].parts[0].text=Array.from({length:420},(_,i)=>(i*71)%355+1).join(',')+',';
 let stops=0;h.chat.stop=async opt=>{assert.equal(opt.strict,true);stops++;h.chat.busy=false;};
 const e=await h.F.run(h.chat);assert.equal(stops,1);assert.equal(h.sent.length,0);assert.equal(e.name,'待定');assert.equal(e.fingerprint.skipped,'probe-too-many');assert.equal(e.fingerprint.result,null);assert.equal(e.fingerprint.reasoning.score,null);assert.equal(h.F.report(h.chat).samples.length,0);assert.match(h.F.describe(e),/数字超量/);assert.match(h.F.details(e),/297/);
});
test('already-ended cyclic output remains invalid and never gets a prefix score',async()=>{
 const h=setup();h.chat.messages[1].parts[0].text='42, 13, 75, 96, 81, 50, 202, 77, '.repeat(8);h.chat.stop=()=>assert.fail('already stopped');
 const e=await h.F.run(h.chat);assert.equal(e.fingerprint.skipped,'probe-repeat');assert.equal(e.fingerprint.count,0);assert.equal(h.sent.length,0);
});
test('single probe times out at 180 seconds rather than ten minutes',async()=>{
 const h=setup();h.chat.messages=[h.user(0)];h.chat.busy=true;h.chat.sentAt=1;let stoppedAt;
 h.chat.stop=async()=>{stoppedAt=h.context.now();h.chat.busy=false;};const e=await h.F.run(h.chat);
 assert.equal(stoppedAt-1,180000);assert.equal(e.fingerprint.skipped,'probe-timeout');assert.equal(h.sent.length,0);
});
test('each later probe has its own deadline, failed later probe cannot calibrate earlier ones',async()=>{
 const h=setup({onSend(c,i){if(i===1){c.messages.pop();c.busy=true;c.sentAt=h.context.now();}}});h.models.set(h.chat.sid,{name:'gpt-6-astra-max',guess:false});h.chat.stop=async()=>{h.chat.busy=false;};
 const e=await h.F.run(h.chat);assert.equal(h.sent.length,1);assert.equal(e.fingerprint.skipped,'probe-timeout');assert.equal(e.fingerprint.result,null);assert.equal(h.saved.has('fingerprint:calibration'),false);
});
test('stop acceptance without confirmed idle pauses instead of allowing next probe',async()=>{
 const h=setup();h.chat.busy=true;h.chat.messages[1].parts[0].text='9, '.repeat(24);let stops=0;h.chat.stop=async()=>{stops++;};
 await assert.rejects(h.F.run(h.chat),e=>e.code==='COMPAT_STOP_FAILED');assert.equal(stops,1);assert.equal(h.sent.length,0);
});
test('visible reasoning skip does not depend on vendor, but answer text is not reasoning',async()=>{
 for(const fam of ['gpt','claude','gemini','grok','compat']){const h=setup({fam});h.chat.busy=true;h.chat.gacha={skipCompatThinking:true};h.chat.fmt.rHead='visible reasoning';h.chat.stop=async()=>{h.chat.busy=false;};const e=await h.F.run(h.chat);assert.equal(e.name,'待定');assert.equal(e.fingerprint.skipped,'visible-thinking');assert.equal(h.sent.length,0);}
 const h=setup();h.chat.busy=true;h.chat.gacha={skipCompatThinking:true};h.chat.messages[1].parts[0].text='Thinking is a word';h.chat.stop=()=>assert.fail('body is not reasoning');assert.equal(h.F.maybeStopCompat(h.chat),false);
});
test('manual command never invokes thinking skip even with visible reasoning',async()=>{
 const h=setup();h.chat.messages=[];let count=0;h.chat.send=async text=>{const i=h.P.findIndex(p=>p.prompt===text);count++;h.chat.messages.push(h.user(i),h.assistant(i));h.chat.fmt.rHead='visible thoughts';};h.chat.stop=()=>assert.fail('manual thinking must be allowed');
 await h.F.startCurrent(h.chat);assert.equal(count,3);assert.equal(h.models.get(h.chat.sid).fingerprint.skipped,undefined);
});
test('guard does not stop unowned ordinary chats or a replaced user message',async()=>{
 const h=setup();h.chat.busy=true;h.chat.messages[1].parts[0].text='9, '.repeat(200);h.chat.stop=()=>assert.fail('not owned');assert.equal(h.F.maybeGuardProbe(h.chat),false);
 h.chat.messages[0].parts[0].text='some other request';const e=await h.F.run(h.chat);assert.match(e.fingerprint.error,/插入/);assert.equal(h.sent.length,0);
});
test('strict stop bypasses pending-submit deferral and never schedules local forced finish',async()=>{
 const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8'),method=core.slice(core.indexOf('  async stop(opt'),core.indexOf('  async stopCheck'));const timers=[];
 const ctx=vm.createContext({now:()=>1,toast(){},describe:e=>e.message,setTimeout:(fn,ms)=>timers.push({fn,ms})});const stop=vm.runInContext('({'+method+'}).stop',ctx);
 const c={busy:true,status:'submitted',awaitId:'u',emit(){},append:async()=>{c.appended=true;},finishTurn(){assert.fail('local finish');},stopCheck(){}};
 await stop.call(c,{strict:true});assert.equal(c.appended,true);assert.equal(c.status,'stopping');assert.equal(timers.some(x=>x.ms===15000),false);
});
test('strict escalation blocks an existing normal-stop local fallback timer',async()=>{
 const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8'),method=core.slice(core.indexOf('  async stop(opt'),core.indexOf('  async stopCheck'));const timers=[];
 const ctx=vm.createContext({now:()=>1,toast(){},describe:e=>e.message,setTimeout:(fn,ms)=>timers.push({fn,ms})});const stop=vm.runInContext('({'+method+'}).stop',ctx);
 const c={busy:true,status:'streaming',emit(){},append:async()=>{},finishTurn(){assert.fail('unconfirmed finish');},stopCheck(){}};
 await stop.call(c);await stop.call(c,{strict:true});timers.find(x=>x.ms===15000).fn();assert.equal(c.status,'stopping');
});
test('strict stop server check rejects old replies and accepts only the current turn',async()=>{
 const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8'),method=core.slice(core.indexOf('  async stopCheck'),core.indexOf('  // ----- 实时流'));
 let messages=[{id:'old',role:'assistant',metadata:{pending:false}}];const ctx=vm.createContext({api:async()=>({messages})});const check=vm.runInContext('({'+method+'}).stopCheck',ctx);
 let done=0;const c={status:'stopping',stopAt:7,strictStopAt:7,awaitId:'new-user',finishTurn(){done++;}};
 await check.call(c,7);assert.equal(done,0);messages=[{id:'new-user',role:'user'},{id:'new-answer',role:'assistant',metadata:{pending:true}}];await check.call(c,7);assert.equal(done,0);messages[1].metadata.pending=false;await check.call(c,7);assert.equal(done,1);
});
test('failed stop retains pending diagnostics without falsely announcing confirmed skip',async()=>{
 const h=setup();h.chat.busy=true;h.chat.messages[1].parts[0].text='9, '.repeat(24);h.chat.stop=async()=>{throw Error('offline');};
 await assert.rejects(h.F.run(h.chat),e=>e.code==='COMPAT_STOP_FAILED');const e=h.models.get(h.chat.sid);assert.equal(e.name,'待定');assert.equal(e.fingerprint.stopConfirmed,false);assert.match(h.F.describe(e),/停止未确认/);assert.match(h.F.details(e),/offline/);assert.equal(e.fingerprint.result,null);
});
test('late independently known identity retains guard diagnostics',async()=>{
 const h=setup(),fp={skipped:'probe-repeat',stopConfirmed:true,result:null,reasoning:{score:null}};h.models.set(h.chat.sid,{name:'待定',guess:true,fingerprint:fp});
 const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8'),method=core.slice(core.indexOf('  identify(tok,'),core.indexOf('  // 旧对话：回放实时通道'));
 h.context.Trigger={identify:async()=>({name:'gpt-6-astra-max',guess:false})};h.context.describe=e=>e.message;
 const identify=vm.runInContext('({'+method+'}).identify',h.context);await identify.call(h.chat,'token');
 assert.equal(h.models.get(h.chat.sid).name,'gpt-6-astra-max');assert.equal(h.models.get(h.chat.sid).fingerprint,fp);
});
test('只有鹈鹕标准题进对照表：数字探针和普通对话都不计',()=>{
 const h=setup(),src=fs.readFileSync(path.join(root,'ui/strength.js'),'utf8'),code=src.slice(src.indexOf('  function collect(sid)'),src.indexOf('  // 识别到过的型号'));
 const sample=prompt=>({done:true,sum:{output:10,tok:20},best:'gpt-6-astra-max',prompt}), pelican='Use inline SVG to show a 2D animation of a pelican pedaling a bicycle forward.';
 const ctx=vm.createContext({Fmt:{stdPrompt:t=>/pelican/i.test(t)&&/svg/i.test(t)},Trace:{turns:()=>[sample(h.P[0].prompt),sample('ordinary request'),sample(pelican)]},Gacha:{settings:()=>({prompt:'9'})},normP:String,Fingerprint:h.F,canon:String,Brand:{of:()=>true},aborted:{},S:{},now:()=>1,rev:0,cache:new Map(),save(){},Bus:{emit(){}},push(){}});
 vm.runInContext(code+';collect("sid");',ctx);assert.equal(ctx.S['gpt-6-astra-max'].length,1);assert.equal(ctx.S['gpt-6-astra-max'][0].k,'sid:2');assert.equal(ctx.S['gpt-6-astra-max'][0].promptKey,'');
});

test('current-run API identity wins over weak, absent, conflicting and failed fingerprints',()=>{
 const h=setup();for(const diagnostic of [{error:'bank offline'},{conflict:true,result:{status:'clear'}},{result:{status:'weak'}},{result:{status:'close'}},{}]){
  const entry={fingerprint:{...diagnostic,apiIdentity:{model:'claude-opus-9',tier:'max'},reasoning:{tier:null}}};
  assert.equal(h.F.classify(entry,{minStr:''},true),'hit');assert.equal(h.F.classify(entry,{minStr:'top'},true),'hit');assert.equal(h.F.classify(entry,{minStr:''},false),'keep');
 }
});
test('API effort dominates statistical effort and unknown effort cannot inherit another model calibration',()=>{
 const h=setup(),fp={apiIdentity:{model:'gpt-9',tier:'low'},reasoning:{model:'gpt-9',tier:'max'}};
 assert.equal(h.F.classify({fingerprint:fp},{minStr:'top'},true),'keep');fp.apiIdentity.tier=null;fp.reasoning.model='different-model';assert.equal(h.F.classify({fingerprint:fp},{minStr:'top'},true),'keep');assert.equal(h.F.classify({fingerprint:fp},{minStr:''},true),'hit');
 for(const flags of [{skipped:'numeric-overflow'},{apiUnsafe:true}])assert.equal(h.F.classify({fingerprint:{...fp,...flags}},{minStr:''},true),'keep');
});
test('known API identity displays separate candidate diagnostics without attaching candidate confidence',()=>{
 const h=setup(),e={name:'claude-opus-9-max',response:'claude-opus-9',guess:false,fingerprint:{apiIdentity:{model:'claude-opus-9',tier:'max'},result:{nearest:{id:'gpt-6-astra'}},suffix:' · 匹配置信度 89.0%',reasoning:{score:50,tier:'low',confidence:.99}}};
 assert.equal(h.F.describe(e),'claude-opus-9-max-50分');assert.match(h.F.details(e),/接口识别.*指纹候选 gpt-6-astra.*89.0%.*接口档位 max/);assert.doesNotMatch(h.F.details(e),/99.0%/);
});
test('an unverified historical Models identity cannot borrow statistical clarity to hit',()=>{
 const h=setup(),e={name:'claude-opus-9',response:'claude-opus-9',guess:false,fingerprint:{apiIdentity:null,result:{status:'clear',nearest:{id:'gpt-6-astra'}},reasoning:{tier:'max'}}};assert.equal(h.F.classify(e,{minStr:''},true),'keep');assert.match(h.F.details(e),/既往接口身份（本轮未核验）/);
});
test('gacha title snapshots do not attach a statistical percentage or inferred tier to API identity',()=>{
 const h=setup(),e={name:'claude-opus-9-max',fingerprint:{apiIdentity:{model:'claude-opus-9',tier:'max'},result:{nearest:{id:'gpt-6-astra'}},suffix:' · 匹配置信度 99.0%',reasoning:{score:50,tier:'low',confidence:.98}}};assert.equal(h.F.describe(e),'claude-opus-9-max-50分');assert.match(h.F.details(e),/指纹候选 gpt-6-astra.*99.0%/);
});

function personalIntegration(h,{model='claude-opus-9',open=false,storageError=false}={}){
 const turns=[],writes=[];Object.assign(h.context,{UI:{host:{account:{id:'A'}}},Brand:{of:s=>/gpt|claude|qwen/i.test(s)},describe:e=>e?.message||String(e),PanelWork:{wait:async f=>f()},PersonalMath:undefined});
 Object.assign(h.context.Strength,{parts:s=>({family:String(s).replace(/-(max|high|low)$/,''),tier:/(?:^|-)(max|high|low)$/.exec(s)?.[1]||''}),compose:r=>r.internal||r.response||r.name});
 h.context.Trace.turns=()=>turns;h.context.Trace.latest=()=>turns.at(-1);h.context.Trace.sync=async()=>{};h.context.Bus.on=()=>{};
 vm.runInContext(fs.readFileSync(path.join(root,'ui/personal-fingerprint-math.js'),'utf8'),h.context);
 vm.runInContext(fs.readFileSync(path.join(root,'ui/personal-fingerprint.js'),'utf8')+';this.PF=PersonalFP;',h.context);
 const pf=h.context.PF;pf.group=async()=>{if(storageError)throw Error('disk quota');return 'a'.repeat(64);};pf.load=async base=>base;pf.log=async()=>{};pf.merge=async rows=>{writes.push(...rows);return {added:1};};
 const add=i=>turns.push({done:true,prompt:h.P[i].prompt,response:model,internal:model+'-max',records:[{messageId:'a'+i}],calls:[{effort:'max',ms:1000}],sum:{output:1000}});
 add(0);const send=h.chat.send.bind(h.chat);h.chat.send=async(...args)=>{await send(...args);add(h.sent.length);};h.chat.gacha={fingerprint:true};
 if(open)for(const m of h.context.ProbeLib.seedBank.models)if(m.id===model)m.open_weights=true;
 return {pf,turns,writes};
}
test('full fresh gacha path keeps actual API model despite an unrelated clear fingerprint and enrolls',async()=>{
 const h=setup(),p=personalIntegration(h);const e=await h.F.run(h.chat);assert.equal(e.guess,false);assert.equal(e.name,'claude-opus-9-max');assert.equal(e.fingerprint.modelConflict,true);assert.equal(e.fingerprint.apiIdentity.verifiedProbes,3);assert.equal(h.F.classify(e,{minStr:'top'},true),'hit');assert.equal(p.writes.length,1);assert.equal(p.writes[0].context,'fresh');assert.equal(p.writes[0].model,'claude-opus-9');assert.equal(h.sent.length,2);
});
test('full path still prioritizes API identity when reference storage is unavailable',async()=>{
 const h=setup(),p=personalIntegration(h,{storageError:true});const e=await h.F.run(h.chat);assert.equal(e.name,'claude-opus-9-max');assert.equal(e.guess,false);assert.equal(h.F.classify(e,{minStr:''},true),'hit');assert.equal(p.writes.length,0);assert.equal(e.fingerprint.library.added,false);assert.match(e.fingerprint.library.message,/disk quota/);
});
test('API closed model requires three even if the statistical candidate is marked open',async()=>{
 const h=setup({modifyLib:'for(const m of ProbeLib.seedBank.models)m.open_weights=true;'});personalIntegration(h);const e=await h.F.run(h.chat);assert.equal(e.fingerprint.count,3);assert.equal(h.sent.length,2);
});
test('API open model takes one gacha probe; explicit reference testing takes three',async()=>{
 for(const manual of [false,true]){const h=setup(),p=personalIntegration(h,{model:'gpt-6-astra',open:true});if(manual)delete h.chat.gacha;const e=await h.F.run(h.chat);assert.equal(e.fingerprint.count,manual?3:1);assert.equal(h.sent.length,manual?2:0);assert.equal(p.writes.length,manual?1:0);}
});
test('cancelling during API identity wait returns promptly and prevents enrollment',async()=>{
 const h=setup(),p=personalIntegration(h);p.turns.splice(0);h.chat.send=async text=>{const i=h.sent.length+1;h.sent.push(text);h.chat.messages.push(h.user(i),h.assistant(i));};
 const ctl=new AbortController();let release,waiting=false;const id=h.chat.idP=new Promise(r=>release=r);h.chat.idTok=h.chat.runTok='current';
 h.context.PanelWork.wait=async f=>{const value=f();if(value===id){waiting=true;ctl.abort();}return value;};
 await assert.rejects(h.F.run(h.chat,{signal:ctl.signal}),/停止/);assert.equal(waiting,true);assert.equal(p.writes.length,0);assert.equal(h.sent.length,2);release({response:'claude-opus-9'});await Promise.resolve();assert.equal(p.writes.length,0);
});
test('a later invalid probe cannot auto-hit using an earlier valid API proof',async()=>{
 const h=setup();personalIntegration(h);const send=h.chat.send.bind(h.chat);h.chat.send=async(...args)=>{await send(...args);h.chat.messages.at(-1).parts.push({type:'tool-ask_user',toolCallId:'tool'});};
 const e=await h.F.run(h.chat);assert.ok(e.fingerprint.apiIdentity);assert.equal(e.fingerprint.probeError,true);assert.equal(h.F.classify(e,{minStr:''},true),'keep');assert.equal(e.fingerprint.library.added,false);assert.equal(h.sent.length,1);
});
test('a scoring-engine failure alone does not suppress a correlated API identity',async()=>{
 const h=setup(),p=personalIntegration(h);p.pf.load=async base=>({...base,bank:{...base.bank,robust:{}}});
 const e=await h.F.run(h.chat);assert.equal(e.fingerprint.probeError,false);assert.equal(e.name,'claude-opus-9-max');assert.equal(h.F.classify(e,{minStr:''},true),'hit');assert.equal(e.fingerprint.library.added,false);
});

// Dynamic English draws are a separate protocol: no fixed-prompt library enrollment/calibration.
function dynamicFixture(keywords){
 const h=setup();const challenges=h.P.map((p,i)=>({...p,id:'dynamic-'+i,prompt:'Choose random integers without tools. Challenge '+i,maxExtra:4}));
 h.chat.messages[0].parts[0].text=challenges[0].prompt;
 h.chat.send=async function(text){const i=h.sent.length+1;h.sent.push(text);this.messages.push({role:'user',id:'dynamic-u'+i,parts:[{type:'text',text}]},h.assistant(i));};
 return{...h,options:{challenges,preferredKeywords:keywords,libraryState:null}};
}
test('dynamic preferred first result runs exactly three probes and never appends SVG',async()=>{
 const h=dynamicFixture(['6-astra']),e=await h.F.run(h.chat,h.options);
 assert.equal(e.fingerprint.count,3);assert.equal(h.sent.length,2);assert.equal(e.fingerprint.firstPreference.keyword,'6-astra');
 assert.equal(e.fingerprint.dynamic,true);assert.equal(e.fingerprint.protocol,'modeltrace-dynamic-en-v1');assert.equal(e.fingerprint.reasoning.tier,null);
 assert.equal(e.fingerprint.reasoning.score,128.6);assert.equal(e.fingerprint.avgProbeSec,24.2);assert(!h.sent.some(p=>/pelican|svg/i.test(p)));assert.match(e.fingerprint.reasoning.reference,/未进行档位校准/);
});
test('dynamic nonpreferred or empty preferred list stops at one and never appends SVG',async()=>{
 for(const list of [[],['nonmatching-model']]){const h=dynamicFixture(list),e=await h.F.run(h.chat,h.options);assert.equal(e.fingerprint.count,1);assert.equal(h.sent.length,0);assert.equal(e.fingerprint.firstPreference.keyword,'');}
});
test('dynamic duration ignores a stale completion timestamp from the preceding turn',async()=>{
 const h=dynamicFixture([]);h.chat.sentAt=2;h.chat.endAt=1;h.context.now=()=>12002;const e=await h.F.run(h.chat,h.options);assert.equal(e.fingerprint.avgProbeSec,12);
});
test('dynamic numeric guard allows only four excess numbers, while fixed guard stays compatible',()=>{
 const h=setup();const text=n=>Array.from({length:n},(_,i)=>(i*131)%355+1).join(',');assert.equal(h.context.Guard.inspect(text(304),300,false,4),null);assert.equal(h.context.Guard.inspect(text(305),300,false,4).reason,'probe-too-many');assert.equal(h.context.Guard.inspect(text(305),300,false),null);
});

test('置信度到 100% 就提前结束，不必凑满三轮', async () => {
  const h = setup({ certainStop: true });
  const e = await h.F.run(h.chat);
  assert.equal(e.fingerprint.count, 1);
  assert.equal(h.sent.length, 0);
  assert.match(e.fingerprint.suffix, /100\.0%/);
});

test('数字编号的格式提示不能在 Claude / Gemini 之间否决数字指纹；GPT 与兼容接口仍然冲突', () => {
  const src = fs.readFileSync(path.join(root, 'ui/fingerprint.js'), 'utf8');
  const a = src.indexOf('  function compatibleFamily'), b = src.indexOf('  function classify');
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(a, b) + ';this.cf = compatibleFamily', ctx);
  const R = fam => ({ nearest: { family: fam } });
  const numeric = { fam: 'claude', sure: false, why: '数字编号 + 思考块内容为空（思考被隐藏）' };
  assert.equal(ctx.cf(R('gemini'), numeric), true);
  assert.equal(ctx.cf(R('claude'), numeric), true);
  assert.equal(ctx.cf(R('gemini'), { fam: 'claude', sure: true, why: '数字编号、没有思考块' }), true);
  assert.equal(ctx.cf(R('gemini'), { fam: 'claude', sure: true, why: '工具调用编号是 toolu_…' }), false);
  assert.equal(ctx.cf(R('gpt'), numeric), false);
  assert.equal(ctx.cf(R('gpt'), { fam: 'compat', sure: true, why: 'txt-0' }), false);
  assert.equal(ctx.cf(R('claude'), { fam: 'mistral', sure: false, why: 'x' }), true);
});
test('「未知型号」占位名不会进入标题加密（统一成未识别）', () => {
  const s = fs.readFileSync(path.join(root, 'ui/title-sync.js'), 'utf8');
  assert.ok(s.includes("model='未识别'"));
  const l = fs.readFileSync(path.join(root, 'ui/conversation-labels.js'), 'utf8');
  assert.ok(l.includes('未知型号'));
});
test('calibrating an older reply never borrows the live think time of the latest turn', () => {
  const h = setup(); let calls = 0;
  h.context.Fmt.est = () => { calls++; return { think: 90, score: 99, out: 1, sec: 1, rChars: 0 }; };
  h.context.Trace.turns = () => [{ done: true, prompt: h.P[0].prompt, sum: { output: 1000, tok: 1100, usd: .02, reasoning: 0 }, calls: [{ ms: 20000 }] }];
  const live = h.F.reasonScore(h.chat, h.P[0], 'gpt');
  const callsAfterLive = calls;
  const hist = h.F.reasonScore(h.chat, h.P[0], 'gpt', { live: false });
  assert.equal(calls, callsAfterLive, 'live:false must not read chat.fmt');
  assert.equal(live.think, 90); assert.equal(hist.think, undefined, 'historic score is not driven by the latest turn think time');
  assert.equal(live.source, 'measured'); assert.equal(hist.source, 'estimated');
  const none = (h.context.Trace.turns = () => [], h.F.reasonScore(h.chat, h.P[0], 'gpt', { live: false }));
  assert.equal(none.score, null);
});
test('every probe round publishes a live partial result (sidebar trace card updates in real time)', async () => {
  const seen = [], h = setup({ onSend: () => {} });
  const set = h.context.Models.set; h.context.Models.set = (sid, e) => { seen.push(JSON.parse(JSON.stringify({ name: e.name, count: e.fingerprint?.count, partial: !!e.fingerprint?.partial, cands: (e.fingerprint?.result?.candidates || []).length }))); return set(sid, e); };
  const e = await h.F.run(h.chat);
  const partial = seen.filter(x => x.partial);
  assert.deepEqual(partial.map(x => x.count), [1, 2, 3], 'one live update per answered probe');
  assert.ok(partial.every(x => x.cands > 0 && x.name), 'live updates carry candidates for the trace card');
  assert.equal(e.fingerprint.partial, undefined, 'final entry is not marked partial'); assert.equal(h.models.get(h.chat.sid), e);
});
test('live partial results keep a real API label and are rolled back when the run is cancelled', async () => {
  const h = setup(), ctl = new AbortController(), prev = { name: 'gpt-6-astra-max', guess: false, tier: 'max' };
  h.models.set(h.chat.sid, prev);
  await assert.rejects(h.F.run(h.chat, { signal: ctl.signal, progress: t => { if (t.startsWith('指纹 1/')) { const m = h.models.get(h.chat.sid); assert.equal(m.name, 'gpt-6-astra-max'); assert.equal(m.fingerprint.partial, true); ctl.abort(); } } }), /停止/);
  assert.equal(h.models.get(h.chat.sid), prev, 'cancelled run restores the previous entry');
});

test('blacklist early stop produces an archive decision after the numeric probe', async () => {
  const h = setup(); h.chat.gacha = {fingerprint:true};
  const e = await h.F.run(h.chat,{blacklist:['ASTRA']});
  assert.equal(h.sent.length,0); assert.equal(e.fingerprint.count,1);
  assert.equal(h.F.classify(e,{archiveOn:true,archiveKeywords:['ASTRA'],minStr:''},false),'archive');
});
