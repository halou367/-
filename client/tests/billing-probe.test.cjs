const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../ui/billing-probe.js');
const P = require('../ui/arena-trace/pricing.js');
const bundled = require('../ui/arena-trace/catalog.json');
const doc = { capturedAt:'2026-10-09', data:[
 {id:'openai/test',vendor:'openai',label:'Test model',inputPerMillion:1,outputPerMillion:2},
 {id:'openai/same-price',vendor:'openai',label:'Same price',inputPerMillion:1,outputPerMillion:2},
 {id:'openai/different',vendor:'openai',label:'Different',inputPerMillion:3,outputPerMillion:8},
 {id:'other/other',vendor:'other',label:'Other',inputPerMillion:5,outputPerMillion:8},
]};
function chat(sid='s',id='m1') { return {sid,messages:[{id,role:'assistant',parts:[{type:'text',text:'a complete answer'},{type:'tool-test',toolCallId:'call_AbCdEfGhIjKlMnOpQrStUvWx',input:{x:1}}],metadata:{pending:false}}]}; }
function bill(id='m1',scale=1){return {messages:{[id]:{basePriceUsd:scale*(100*P.AGENT_P50_RATES.prompt+200*P.AGENT_P50_RATES.completion),actual:{inputTokensCostUsd:.0001*scale,outputTokensCostUsd:.0004*scale}}}};}
function setup(request=async()=>bill(),catalog=doc){let time=100000,owner='a';const calls=[];const engine=B.create({bundled:catalog,clock:()=>time,account:()=>owner,request:async(...a)=>{calls.push(a);return request(...a)}});return {e:engine,calls,advance:n=>time+=n,account:v=>owner=v};}
test('uses paired cost, narrows family, retains same-price ties, and exports no conversation body',async()=>{
 const f=setup();await f.e.refresh(chat());const s=f.e.state('s');assert.equal(s.status,'ready');assert.equal(s.info.scope,'narrowed');assert.equal(s.ranked.length,3);assert(Math.abs(s.ranked[0].confidence-100)<1e-9);assert(Math.abs(s.ranked[1].confidence-100)<1e-9);assert.equal(s.ledger.observations,1);
 const report=JSON.stringify(f.e.exportSummary('s'));assert(!report.includes('a complete answer'));assert(!report.includes('call_AbCd'));assert(!report.includes('responseBody'));assert.equal(f.calls[0][0],'/api/chat/s/cost?includeSession=true');assert.equal(f.calls[0][1].noRelogin,true);
});
test('same round polling is idempotent; independent sessions and accounts never share scores',async()=>{
 const f=setup();await f.e.refresh(chat());f.advance(16000);await f.e.refresh(chat());assert.equal(f.e.state('s').ledger.observations,1);assert(Math.abs(f.e.state('s').ranked[0].confidence-100)<1e-9);
 assert.equal(f.e.state('other').ledger.observations,0);f.account('b');assert.equal(f.e.state('s').ledger.observations,0);
});
test('concurrent refresh coalesces and account switch discards in-flight result',async()=>{
 let release;const f=setup(()=>new Promise(r=>release=r));const first=f.e.refresh(chat()),second=f.e.refresh(chat());await Promise.resolve();assert.equal(f.calls.length,1);f.account('b');release(bill());await Promise.all([first,second]);assert.equal(f.e.state('s').status,'idle');
});
test('403 and 429 enforce account-wide backoff without relogin or repeated requests',async()=>{
 for(const status of [403,429]){const f=setup(async()=>{throw Object.assign(Error('denied'),{status,retryAfterMs:90000})});await f.e.refresh(chat());await f.e.refresh(chat('other'));assert.equal(f.calls.length,1);assert.equal(f.e.state('s').ranked.length,0);assert.equal(f.e.state('s').status,status===403?'forbidden':'error');f.advance(status===403?120001:90001);await f.e.refresh(chat());assert.equal(f.calls.length,2);}
});
test('malformed, negative or different-strategy costs do not become identities',async()=>{
 for(const value of [{},{messages:[]},{messages:{m1:{basePriceUsd:-1,actual:{}}}},{messages:{m1:{basePriceUsd:1,pricingStrategy:'different',actual:{}}}},{messages:{m1:{basePriceUsd:1,actual:{outputTokensCostUsd:'bad'}}}}]){const f=setup(async()=>value);await f.e.refresh(chat());assert.equal(f.e.state('s').status,'error');assert.equal(f.e.state('s').ranked.length,0);}
});
test('missing or unmatched billing, aborted and pending outputs produce no candidates',async()=>{
 const f=setup(async()=>bill('different'));await f.e.refresh(chat());assert.equal(f.e.state('s').status,'unavailable');assert.equal(f.e.state('s').ranked.length,0);
 for(const metadata of [{pending:true},{aborted:true}]){const g=setup(),c=chat();c.messages[0].metadata=metadata;await g.e.refresh(c);assert.equal(g.calls.length,0);assert.equal(g.e.state('s').status,'waiting');}
});
test('unknown family remains explicitly unnarrowed; conflicting families suppress confidence',async()=>{
 const c=chat();c.messages[0].parts=[{type:'text',text:'plain text'}];const f=setup();await f.e.refresh(c);assert.equal(f.e.state('s').info.scope,'unnarrowed');
 const mix=chat();mix.messages[0].parts.push({type:'tool-test',toolCallId:'toolu_vrtx_01ABCDEFGH12345678',input:{}});const g=setup();await g.e.refresh(mix);assert.equal(g.e.state('s').info.familyConflict,true);assert.equal(g.e.state('s').ranked.length,0);
});
test('recovered stream IDs provide weak family evidence without a new network hook',async()=>{
 const f=setup(),c=chat();c.messages[0].parts=[{type:'text',text:'hello world'}];f.e.observe(c,{type:'start',messageId:'m1'});f.e.observe(c,{type:'text-start',id:'msg_0123456789abcdef0123456789abcdef'});await f.e.refresh(c);assert.equal(f.e.state('s').info.family.family,'openai');
});
test('empty price pool and zero input pricing show no confident model',async()=>{
 const f=setup(async()=>bill(),{data:[]});await f.e.refresh(chat());assert.equal(f.e.state('s').info.reason,'no-catalog');assert.equal(f.e.state('s').ranked.length,0);
 const c=chat();c.messages[0].parts=[{type:'text',text:'answer'},{type:'tool-test',toolCallId:'toolu_vrtx_01ABCDEFGH12345678',input:{}}];const g=setup(async()=>({messages:{m1:{basePriceUsd:.0075216372,actual:{outputTokensCostUsd:.0007845,inputTokensCostUsd:0,cacheWriteTokensCostUsd:.003018}}}}),bundled);await g.e.refresh(c);assert.equal(g.e.state('s').info.result.baseMatch.freeTokenMode,true);assert.equal(g.e.state('s').ranked.length,0);
});
test('bad leaderboard refresh retains bundled pricing and records reason',async()=>{
 const f=setup();assert.equal(f.e.syncCatalog('<html>Cloudflare challenge</html>'),false);await f.e.refresh(chat());assert.equal(f.e.state('s').info.pool.size,4);assert.match(f.e.catalogError,/已有价格快照/);
});
test('payment fields retain zero charges and separate paid amount from upstream cost',async()=>{
 const c=chat(),cost=bill();cost.messages.m1.totalChargedUsd=0;cost.messages.m1.actual.totalCostUsd=.0005;cost.messages.other={totalChargedUsd:9,actual:{totalCostUsd:7}};
 const f=setup(async()=>cost);await f.e.refresh(c);assert.deepEqual(f.e.state('s').payments,[{messageId:'m1',upstreamUsd:.0005,chargedUsd:0,basePriceUsd:cost.messages.m1.basePriceUsd}]);
 const missing=B.payments(c,bill());assert.equal(missing[0].chargedUsd,null);assert.equal(missing[0].upstreamUsd,.0005);
});
test('exact official prices preserve model versions and reject ambiguous or absent cache rates',()=>{
 const pool={data:[{id:'openai/gpt-6',label:'GPT 6',inputPerMillion:1,outputPerMillion:4,cacheReadPerMillion:.1}]};
 assert.deepEqual(B.reference(pool,'GPT-6').rates,[1,4,.1]);assert.equal(B.reference(pool,'GPT 6.1'),null);
 pool.data.push({...pool.data[0],id:'other/gpt6',inputPerMillion:2});assert.equal(B.reference(pool,'GPT 6'),null);
 pool.data.pop();delete pool.data[0].cacheReadPerMillion;assert.equal(B.reference(pool,'GPT 6'),null);
});
test('cross-check preserves ties, surfaces disagreement and refuses stale, weak or unknown-name evidence',async()=>{
 const f=setup();await f.e.refresh(chat());
 const model={name:'Test model',fingerprint:{result:{status:'clear',nearest:{id:'openai/test'}}}};
 assert.equal(f.e.consensus('s',model,'m1').status,'supported');assert.match(f.e.consensus('s',model,'m1').text,/不能唯一/);
 assert.equal(f.e.consensus('s',{name:'openai/different'},'m1').status,'conflict');
 assert.equal(f.e.consensus('s',{name:'unlisted'},'m1').status,'unmapped');
 assert.equal(f.e.consensus('s',model,'newer').status,'waiting');
 assert.equal(f.e.consensus('s',{...model,messageId:'older'},'m1').status,'historical');
 assert.equal(f.e.consensus('s',{name:'openai/different',fromTitle:true},'m1').status,'candidate');
 f.e.state('s').info.unreliable=true;assert.equal(f.e.consensus('s',model,'m1').status,'uncertain');
});
test('API identity is not replaced by the fingerprint nearest neighbour for corroboration',async()=>{
 const f=setup();await f.e.refresh(chat());const model={name:'openai/different',fingerprint:{apiIdentity:{model:'openai/different'},result:{status:'clear',nearest:{id:'openai/test'}}}};
 assert.equal(f.e.consensus('s',model,'m1').status,'conflict');assert.equal(f.e.consensus('s',model,'m1').name,'openai/different');
});

test('deduction callback receives paired payments only for the captured account',async()=>{
 let owner='A',release;const got=[];
 const e=B.create({account:()=>owner,bundled:doc,request:()=>new Promise(r=>release=r),paymentsReceived:(...args)=>got.push(args)});
 const pending=e.refresh(chat());await Promise.resolve();owner='B';release(bill());await pending;assert.equal(got.length,0);
 const current=e.refresh(chat());await Promise.resolve();release({...bill(),messages:{m1:{totalChargedUsd:.25,actual:{}}}});await current;
 assert.equal(got.length,1);assert.equal(got[0][0],'s');assert.equal(got[0][2],'B');assert.equal(got[0][1][0].chargedUsd,.25);
});
