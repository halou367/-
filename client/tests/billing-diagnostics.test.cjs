const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../ui/billing-probe.js'),P=require('../ui/arena-trace/pricing.js');
function state(){
 const info=B.analyze({sid:'s',messages:[{id:'m',role:'assistant',parts:[{type:'text',text:'PRIVATE PROMPT'},{toolCallId:'call_AbCdEfGhIjKlMnOpQrStUvWx',input:{secret:'PRIVATE TOOL'}}]}]},
 {messages:{m:{basePriceUsd:100*P.AGENT_P50_RATES.prompt+200*P.AGENT_P50_RATES.completion,actual:{inputTokensCostUsd:.0001,outputTokensCostUsd:.0004}}}},
 {data:[{id:'openai/a',label:'Model A (Max)',vendor:'openai',inputPerMillion:1,outputPerMillion:2},{id:'openai/b',label:'Model B',vendor:'openai',inputPerMillion:3,outputPerMillion:8}]});
 return {info,status:'ready',ledger:{observations:1,models:{}},at:100};
}
test('diagnostics separates conditional price fit from identity, effort and capability',()=>{
 const d=B.diagnostics(state(),{latestId:'m'});assert.equal(d.confidence.verdict,'conditional');assert(Math.abs(d.confidence.bestMatch-100)<1e-8);assert(d.confidence.gapPoints>0);assert.equal(d.confidence.identityProbability,null);assert.equal(d.strength.effort,null);assert.equal(d.strength.capability,'unmeasured');assert.equal(d.samples.observations,1);assert(d.missing.some(s=>s.includes('只有一轮')));assert(d.missing.some(s=>s.includes('Max/High')));
});
test('ties, conflicting evidence, old bills and unreliable prices are explicit',()=>{
 const s=state();s.info.result.baseMatch.candidates.push({...s.info.result.baseMatch.candidates[0],id:'same'});s.info.result.baseMatch.candidates.sort((a,b)=>a.residual-b.residual);
 assert.equal(B.diagnostics(s,{latestId:'m'}).confidence.verdict,'ambiguous');
 assert.equal(B.diagnostics(s,{latestId:'m',agreement:{status:'conflict'}}).confidence.verdict,'conflict');
 assert.equal(B.diagnostics(s,{latestId:'new'}).confidence.verdict,'historical');
 s.info.unreliable=true;assert.equal(B.diagnostics(s,{latestId:'m'}).confidence.verdict,'insufficient');
 assert.equal(B.diagnostics({status:'forbidden',httpStatus:403},{latestId:'m'}).read.httpStatus,403);
});
test('strength uses paired explicit configuration; fingerprint estimates keep scope and library',()=>{
 const model={messageId:'old',fingerprint:{count:3,source:'test library',reasoning:{score:73,tier:'high'},result:{nearest:{id:'A'},status:'clear',signals:{relative_probability:.8}}}};
 let d=B.diagnostics(state(),{latestId:'m',model,trace:{calls:[{effort:'max'}]}});assert.equal(d.strength.effort,null);assert.equal(d.strength.reasoningScore,73);assert.equal(d.fingerprint.historical,true);assert.equal(d.fingerprint.relativeProbability,.8);
 d=B.diagnostics(state(),{latestId:'m',model,tracePaired:true,trace:{calls:[{effort:'max'}]}});assert.equal(d.strength.effort,'max');
 d=B.diagnostics(state(),{latestId:'m',tracePaired:true,trace:{calls:[{effort:'max'},{effort:'low'}]}});assert.equal(d.strength.effort,null);assert.equal(d.strength.effortConflict,true);
 model.fingerprint.reasoning.score=NaN;model.fingerprint.result.signals.relative_probability=2;d=B.diagnostics(state(),{latestId:'m',model});assert.equal(d.strength.reasoningScore,null);assert.equal(d.fingerprint.relativeProbability,null);
});
test('diagnostics exports evidence only and preserves sample insufficiency and cache caveats',()=>{
 const s=state();s.info.cacheApprox=true;s.info.result.implied={ok:false,reason:'need-more-messages',need:2,have:1};
 const d=B.diagnostics(s,{latestId:'m',tracePaired:true,trace:{prompt:'PRIVATE TRACE',records:[{raw:'SECRET'}],calls:[{effort:'high',input:'PRIVATE CALL'}]}});
 const text=JSON.stringify(d);for(const forbidden of ['PRIVATE','SECRET','call_AbCd','toolCallId','requestBody','responseBody'])assert(!text.includes(forbidden));assert(d.missing.some(s=>s.includes('2条费用样本')));assert(d.missing.some(s=>s.includes('缓存单价')));
});
test('multi-library diagnostics name average scope and retain per-library summaries without raw data',()=>{
 const model={messageId:'m',fingerprint:{count:1,result:{nearest:{id:'A'},status:'close',reason:'library_disagree',signals:{relative_probability:.7},libraries:[{lib:'First',id:'A',status:'clear',p:1,raw:'SECRET'},{lib:'Second',id:'B',status:'close',p:.43,cands:[{prompt:'PRIVATE'}]}]}}};
 const d=B.diagnostics(state(),{latestId:'m',model});assert.equal(d.fingerprint.relativeKind,'library-average');assert.equal(d.fingerprint.libraryDisagreement,true);assert.equal(d.fingerprint.libraries[1].relativeMatch,.43);assert(d.missing.some(s=>s.includes('首选不一致')));assert(!/SECRET|PRIVATE/.test(JSON.stringify(d)));
});
test('fresh bills with old identities and tied composite evidence get distinct verdicts',()=>{
 const s=state();let d=B.diagnostics(s,{latestId:'m',model:{messageId:'old',name:'A'},agreement:{status:'historical'}});assert.equal(d.samples.latestCovered,true);assert.equal(d.confidence.verdict,'historical-identity');assert(d.missing.some(s=>s.includes('历史回复')));
 s.info.result.baseMatch.candidates.push({...s.info.result.baseMatch.candidates[0],id:'same'});s.info.result.baseMatch.candidates.sort((a,b)=>a.residual-b.residual);
 d=B.diagnostics(s,{latestId:'m',agreement:{status:'inferred-tie',preference:{primary:null}}});assert.equal(d.confidence.verdict,'conditional-tie');assert(d.missing.some(s=>s.includes('重复同价账单')));assert.equal(d.confidence.identityProbability,null);
});
