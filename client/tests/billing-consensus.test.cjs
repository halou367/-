const test=require('node:test'),assert=require('node:assert/strict'),B=require('../ui/billing-probe.js');
function fixture(){
 const rows=[['google/gemini-3.6-flash','Gemini 3.6 Flash (High)'],['google/gemini-3.7-flash','Gemini 3.7 Flash (High)'],['google/gemini-3.8-flash','Gemini 3.8 Flash (High)'],['mistral/medium-3.5','Mistral Medium 3.5']].map(([id,label])=>({id,label,vendor:id.split('/')[0],inputPerMillion:1,outputPerMillion:2}));
 const state={info:{unreliable:false,result:{unitPrice:{used:[{messageId:'m'}]},baseMatch:{candidates:rows.map(r=>({...r,residual:0}))}}}};
 const model={name:'gemini-3.8-flash?',guess:true,messageId:'m',fingerprint:{count:1,result:{status:'close',nearest:{id:'gemini-3.8-flash'},signals:{relative_probability:.699},candidates:[{id:'gemini-3.8-flash',probability:.699},{id:'gemini-3.7-flash',probability:.216},{id:'gemini-3.6-flash',probability:.062}],libraries:[{lib:'A',id:'gemini-3.8-flash',p:1},{lib:'B',id:'gemini-3.7-flash',p:.433}]}}};
 return {state,model,catalog:{data:rows},run(){return B.consensus(this.state,this.model,'m',this.catalog);}};
}
test('close fingerprint sorts same-price candidates while preserving disagreements and price-only options',()=>{
 const f=fixture(),before=JSON.stringify(f),r=f.run();assert.equal(r.status,'inferred');assert.equal(r.preference.primary.name,'gemini-3.8-flash');assert.equal(r.preference.primary.relativeMatch,.699);assert.deepEqual(r.preference.alternatives.map(x=>x.name),['gemini-3.7-flash','gemini-3.6-flash']);assert.equal(r.preference.libraryDisagreement,true);assert.equal(r.preference.priceOnlyCandidates[0].label,'Mistral Medium 3.5');assert.equal(r.preference.identityProbability,null);assert.equal(r.preference.observations,1);assert.equal(JSON.stringify(f),before);assert(!r.preference.primary.name.includes('High'));
});
test('equal fingerprint support has no arbitrary first choice',()=>{
 const f=fixture();f.model.fingerprint.result.signals.relative_probability=.216;const r=f.run();assert.equal(r.status,'inferred-tie');assert.equal(r.preference.primary,null);assert.equal(r.preference.alternatives.length,3);
});
test('old, weak and missing scores do not become a composite identity',()=>{
 let f=fixture();f.model.messageId='old';assert.equal(f.run().status,'historical');
 f=fixture();f.model.fingerprint.result.status='weak';assert.equal(f.run().status,'candidate');
 f=fixture();delete f.model.fingerprint.result.signals;delete f.model.fingerprint.result.candidates;assert.equal(f.run().status,'candidate');
 f=fixture();f.state.info.unreliable=true;assert.equal(f.run().status,'uncertain');
});
test('API identity retains precedence and an incompatible fingerprint remains a conflict',()=>{
 let f=fixture();f.model.name='mistral/medium-3.5';f.model.guess=false;f.model.fingerprint.apiIdentity=true;const r=f.run();assert.equal(r.name,'mistral/medium-3.5');assert.equal(r.status,'supported');assert.equal(r.preference,undefined);
 f=fixture();f.state.info.result.baseMatch.candidates.find(c=>c.id==='google/gemini-3.8-flash').residual=.2;assert.equal(f.run().status,'conflict');
});
test('weak library leaders remain visible but cannot create a cross-library disagreement',()=>{
 const f=fixture();f.model.fingerprint.result.libraries=[{lib:'A',id:'gemini-3.8-flash',status:'clear',p:.9},{lib:'B',id:'mistral-medium-3.5',status:'weak',p:.4}];
 const r=f.run();assert.equal(r.status,'inferred');assert.equal(r.preference.libraryDisagreement,false);assert.equal(r.preference.libraries[1].status,'weak');assert.equal(r.preference.relativeKind,'selected-library');
});
test('legacy disagreement metadata retains original average scope and only summary fields',()=>{
 const f=fixture(),result=f.model.fingerprint.result;result.disagree=result.libraries.map(l=>({...l,status:'close',cands:[{prompt:'PRIVATE'}],raw:'SECRET'}));delete result.libraries;
 const r=f.run();assert.equal(r.preference.relativeKind,'library-average');assert.equal(r.preference.libraryDisagreement,true);assert.equal(r.preference.primary.relativeMatch,.699);assert.equal(r.preference.libraries.length,2);assert(!/PRIVATE|SECRET/.test(JSON.stringify(r)));
});
