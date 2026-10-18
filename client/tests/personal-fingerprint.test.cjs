const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/gpt-6-astra-three.json')));
function setup(){
 const models=new Map(),turns=[];const c=vm.createContext({console,crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,UI:{host:{account:{id:'A'}}},Bus:{emit(){},on(){}},Models:{get:id=>models.get(id)},Trace:{turns:()=>turns,latest:()=>turns.at(-1),sync:async()=>{}},PanelWork:{frame:async()=>{},wait:async f=>f()},Brand:{of:s=>/gpt|claude|gemini/i.test(s)},Strength:{parts:s=>({family:String(s).replace(/-(?:max|high|low)$/,''),tier:/(max|high|low)$/.exec(s)?.[0]||''}),compose:m=>m.internal||m.response||m.name,canon:s=>s,isLive:x=>Number.isFinite(x.rs)&&x.rs>0||Number.isFinite(x.rChars)&&x.rChars>0||Number.isFinite(x.think)&&x.think>=5,scoreOf:x=>x.out>0?40:null},describe:e=>e.message});
 for(const file of ['probe-vendor','probe-output-guard','personal-fingerprint-math','personal-fingerprint'])vm.runInContext(fs.readFileSync(path.join(root,'ui',file+'.js'),'utf8'),c);
 vm.runInContext('this.M=PersonalMath;this.FP=PersonalFP;this.P=ProbeLib;',c);
 const row={protocol:'modeltrace-plain-v1',model:'gpt-9.8',tier:'max',group:'a'.repeat(64),context:'history',at:1,outputs:fixture.map(x=>c.P.numbers(x.text)),measures:Array.from({length:3},()=>({score:40,source:'measured'}))};
 return {c,models,turns,row,M:c.M,FP:c.FP,P:c.P};
}
test('strict sample validation and data-only normalization strip unsupported fields',async()=>{const h=setup(),r=await h.FP.normalize({...h.row,token:'secret',sid:'s',enabled:true},false,'import:test');assert.equal(r.enabled,false);assert.equal(r.model,'gpt-9-8');assert.equal(r.token,undefined);assert.equal(r.sid,undefined);assert.equal(r.id.length,64);});
test('reject wrong protocol, incomplete output, out-of-range number and HTML labels',async()=>{const h=setup();for(const row of [{...h.row,protocol:'other'},{...h.row,outputs:[h.row.outputs[0]]},{...h.row,model:'<img src=x>'},{...h.row,model:'auto-model-1'},{...h.row,group:'raw-sid'},{...h.row,tier:'max(80%)'}])await assert.rejects(()=>h.FP.normalize(row));const r=structuredClone(h.row);r.outputs[0][0]=999;await assert.rejects(()=>h.FP.normalize(r));});
test('repetition is rejected even if the three requested lengths match',async()=>{const h=setup();await assert.rejects(()=>h.FP.normalize({...h.row,outputs:[297,315,331].map(n=>Array(n).fill(123))}));});
test('digest is independent of claimed label and conversation id; duplicate gives no vote',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true,'local-api'),b=await h.FP.normalize({...h.row,group:'b'.repeat(64)});assert.equal(a.id,b.id);const r=h.M.merge([a],[b]);assert.equal(r.rows.length,1);assert.equal(r.duplicates,1);assert.equal(r.rows[0].group,a.group);assert.equal(r.rows[0].enabled,true);});
test('same numbers with incompatible labels quarantine original rather than overwrite it',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true),b=await h.FP.normalize({...h.row,model:'claude-opus-9-9'},true);const r=h.M.merge([a],[b]);assert.equal(r.conflicts,1);assert.equal(r.rows[0].model,a.model);assert.equal(r.rows[0].enabled,false);assert.equal(r.rows[0].conflict,true);});
test('different samples sharing a conversation cannot support contradictory model labels',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true),b={...a,id:'b'.repeat(64),model:'claude-opus-9-9'};const r=h.M.merge([a],[b]);assert.equal(r.rows.length,2);assert.ok(r.rows.every(x=>x.conflict&&!x.enabled));});
test('expanded bank fits outside seed IDs without mutating seed or inheriting seed CV claims',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true),seed=JSON.stringify(h.P.seedBank),r=h.M.augment(h.P.seedBank,[a]);h.P.validateBank(r.bank);assert.equal(r.bank.models.length,h.P.seedBank.models.length+1);assert.equal(r.bank.models.at(-1).id,'gpt-9-8');assert.equal(r.bank.models.at(-1).reference_groups,1);assert.equal(r.bank.calibration['3'].cv_accuracy,undefined);assert.equal(r.bank.calibration['3'].personal_uncalibrated,true);assert.equal(JSON.stringify(h.P.seedBank),seed);});
test('own conversation, pending, conflicting and mismatched context are excluded',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true);for(const [rows,opt] of [[[a],{excludeGroup:a.group}],[[a],{context:'fresh'}],[[{...a,enabled:false}],{}],[[{...a,conflict:true}],{}]]){const r=h.M.augment(h.P.seedBank,rows,opt);assert.equal(r.personal,false);assert.equal(r.bank,h.P.seedBank);}});
test('multiple batches from same conversation count as only one independent reference',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true),b={...a,id:'b'.repeat(64)},r=h.M.augment(h.P.seedBank,[a,b]);assert.equal(r.bank.models.at(-1).reference_groups,1);assert.equal(r.counts[a.model],1);});
test('known model supplements preserve aligned centroid dimensions',async()=>{const h=setup(),a=await h.FP.normalize({...h.row,model:h.P.seedBank.models[0].id},true),r=h.M.augment(h.P.seedBank,[a]);assert.equal(r.bank.models.length,h.P.seedBank.models.length);h.P.validateBank(r.bank);assert.ok(r.bank.robust.hellinger.centroids.flat().every(Number.isFinite));});
test('tier relative weight requires existing gated calibration, not invented labels',()=>{const h=setup();assert.equal(h.M.tierConfidence(40,{tier:null}),null);assert.equal(h.M.tierConfidence(40,{tier:'max',refs:[{tier:'max',score:40,n:3}]}),null);const w=h.M.tierConfidence(40,{tier:'max',refs:[{tier:'high',score:25,n:3},{tier:'max',score:40,n:3}]});assert.ok(w>.5&&w<=1);});
test('titles, self reports and statistical guesses do not become initial ground truth',()=>{const h=setup(),chat={sid:'s'};for(const record of [{name:'gpt-9.8-max'},{name:'gpt-9.8-max',guess:true,response:'gpt-9.8'},{name:'gpt-9.8-max',request:'gpt-9.8'},{name:'gpt-9.8-max',response:'gpt-9.8',routed:true}]){h.models.set('s',record);assert.equal(h.FP.identity(chat),null);}h.models.set('s',{name:'gpt-9.8',response:'gpt-9.8'});assert.equal(h.FP.identity(chat).model,'gpt-9-8');});
test('proof needs exact probe association and a successful unmixed API identity',()=>{const h=setup(),chat={sid:'s'},probe=h.P.PROBES[0],answer={id:'answer'};const t={done:true,prompt:probe.prompt,response:'gpt-9.8',internal:'gpt-9.8-max',at:1000,records:[{messageId:'answer'}],calls:[{effort:'max',ms:3000}],sum:{output:1000,tok:2000,usd:.01,reasoning:100}};h.turns.push(t);assert.equal(h.FP.proof(chat,probe,answer,NaN).tier,'max');assert.equal(h.FP.proof(chat,probe,answer,NaN).measurement.source,'measured');assert.equal(h.FP.proof(chat,probe,{id:'other'},NaN),null);for(const k of ['changed','routing','outcome']){t[k]=true;assert.equal(h.FP.proof(chat,probe,answer,1000),null);t[k]=false;}t.done=false;assert.equal(h.FP.proof(chat,probe,answer,1000),null);});
test('portable import verifies hash and resets enabled/local provenance',async()=>{const h=setup();const samples=[{...h.row,enabled:true,source:'local-api'}],file={schema:h.FP.schema,protocol:h.M.protocol,samples,samplesSha256:await h.FP.digest(JSON.stringify(samples))};const r=await h.FP.previewImport(JSON.stringify(file));assert.equal(r.rows[0].enabled,false);assert.match(r.rows[0].source,/^import:/);file.samplesSha256='bad';await assert.rejects(()=>h.FP.previewImport(JSON.stringify(file)),/摘要/);});
test('unknown conversations without API proofs remain test-only',async()=>{const h=setup();let writes=0,logs=[];h.FP.merge=async()=>{writes++;};h.FP.log=async row=>logs.push(row);const chat={probeNumbers:h.row.outputs.map(numbers=>({numbers})),emit(){}},entry={name:'gpt-9.8',fingerprint:{count:3,measurements:h.row.measures}};await h.FP.finish({owner:'A',known:null,proofs:[null,null,null]},chat,entry);assert.equal(writes,0);assert.equal(logs[0].kind,'identify-only');assert.equal(logs[0].outputs.length,3);});
test('old metadata alone cannot label new probes: every matching API proof is required',async()=>{const h=setup();let writes=0;h.FP.merge=async()=>{writes++;return {added:1};};h.FP.log=async()=>{};const chat={probeNumbers:h.row.outputs.map(numbers=>({numbers})),emit(){}},entry={fingerprint:{count:3,measurements:h.row.measures}};const state={owner:'A',known:{model:'gpt-9-8'},group:h.row.group,context:'history',proofs:[null,null,null]};await h.FP.finish(state,chat,entry);assert.equal(writes,0);state.proofs=Array(3).fill({model:'gpt-9-8',tier:'max'});await h.FP.finish(state,chat,entry);assert.equal(writes,1);assert.equal(entry.fingerprint.library.added,true);});
test('cross-context references are diagnostic-only for new models and do not perturb default models',async()=>{const h=setup(),a=await h.FP.normalize(h.row,true),r=h.M.augment(h.P.seedBank,[a],{context:'fresh',crossContext:true});assert.equal(r.bank.models.at(-1).context_mismatch,true);const known=await h.FP.normalize({...h.row,model:h.P.seedBank.models[0].id},true);assert.equal(h.M.augment(h.P.seedBank,[known],{context:'fresh',crossContext:true}).personal,false);});
test('contradictory response/internal identities cannot label a probe',()=>{const h=setup(),p=h.P.PROBES[0];h.turns.push({done:true,prompt:p.prompt,response:'gpt-6-astra',internal:'gpt-6-luna-max',records:[{messageId:'a'}],calls:[]});assert.equal(h.FP.proof({sid:'s'},p,{id:'a'},NaN),null);});
test('collection keeps fresh context without rejecting a new gacha API identity',async()=>{const h=setup();h.FP.group=async()=>h.row.group;h.models.set('s',{response:'gpt-9.8'});const a=await h.FP.begin({sid:'s',messages:[{role:'user'}]});assert.equal(a.context,'history');const fresh=await h.FP.begin({sid:'s',gacha:{fingerprint:true},messages:[{role:'user'}]},{firstProbeSent:true});assert.equal(fresh.context,'fresh');assert.equal(fresh.known.model,'gpt-9-8');});
test('historical model and tier percentages parse independently, without becoming labels',()=>{const h=setup();vm.runInContext(fs.readFileSync(path.join(root,'ui/conversation-labels.js'),'utf8')+';this.Labels=ConversationLabels;',h.c);const p=h.c.Labels.parse('claude-opus-5-5(89.0%) max≈(80.0%)-40分');assert.equal(p.name,'claude-opus-5-5');assert.equal(p.confidence,'89.0');assert.equal(p.tier,'max');assert.equal(p.tierConfidence,'80.0');assert.equal(p.score,40);});
test('expansion is not fixed to 17, 21 or 22 labels: 30 new models fit the same feature space',async()=>{const h=setup(),rows=[];for(let i=0;i<30;i++)rows.push(await h.FP.normalize({...h.row,model:'custom-model-'+i,group:i.toString(16).padStart(64,'0'),outputs:h.row.outputs.map(a=>a.map(n=>(n+i)%355+1))},true));const r=h.M.augment(h.P.seedBank,rows);assert.equal(r.bank.models.length,51);assert.equal(r.bank.robust.model_order.length,51);h.P.validateBank(r.bank);});

function observed(h,model='gpt-9.8',tier='max'){
 return h.P.PROBES.map((probe,i)=>{const answer={id:'a'+i};h.turns.push({done:true,prompt:probe.prompt,response:model,internal:model+(tier?'-'+tier:''),records:[{messageId:answer.id}],calls:tier?[{effort:tier,ms:1000}]:[],sum:{output:1000}});return {probe,answer,sentAt:NaN};});
}
test('initially unknown new conversation enrolls only after all three correlated API proofs',async()=>{
 const h=setup();h.FP.group=async()=>h.row.group;const chat={sid:'s',gacha:{},messages:[],probeNumbers:h.row.outputs.map(numbers=>({numbers})),emit(){}};
 const state=await h.FP.begin(chat);assert.equal(state.known,null);let stored,logged;h.FP.merge=async rows=>(stored=rows,{added:1});h.FP.log=async r=>{logged=r;};
 state.captures=observed(h);const entry={name:'wrong-statistical-candidate',guess:true,fingerprint:{count:3,measurements:h.row.measures,result:{nearest:{id:'gpt-6-astra'},status:'weak'},conflict:true}};
 await h.FP.finish(state,chat,entry);assert.equal(stored[0].model,'gpt-9-8');assert.equal(stored[0].context,'fresh');assert.equal(stored[0].source,'local-api');assert.equal(entry.guess,false);assert.equal(entry.name,'gpt-9-8-max');assert.equal(entry.fingerprint.apiIdentity.verifiedProbes,3);assert.equal(logged.probability,null);assert.equal(logged.kind,'reference-check');
});
test('late metadata is rechecked for earlier probes instead of freezing null proofs',async()=>{
 const h=setup(),chat={sid:'s'},state={owner:h.FP.owner(),proofs:[],captures:[],known:null};
 for(const probe of h.P.PROBES)await h.FP.probe(state,chat,probe,{id:'a'+state.captures.length},NaN);
 assert.equal(state.proofs.filter(Boolean).length,0);observed(h);await h.FP.finalize(state,chat);assert.equal(h.FP.authority(state).verifiedProbes,3);
});
test('mixed, routed, failed and incomplete probes never enroll',async()=>{
 for(const kind of ['mixed','routing','failed','incomplete','wrong-answer']){
  const h=setup(),captures=observed(h),t=h.turns[2];if(kind==='mixed'){t.response='claude-opus-9';t.internal='claude-opus-9-max';}if(kind==='routing')t.routing=true;if(kind==='failed')t.calls[0].failed=true;if(kind==='incomplete')t.done=false;if(kind==='wrong-answer')t.records[0].messageId='unrelated';
  let writes=0;h.FP.merge=async()=>{writes++;return {added:1};};h.FP.log=async()=>{};
  const state={owner:'A',group:h.row.group,context:'fresh',captures},chat={sid:'s',probeNumbers:h.row.outputs.map(numbers=>({numbers})),emit(){}},entry={fingerprint:{count:3,measurements:h.row.measures}};
  await h.FP.finish(state,chat,entry);assert.equal(writes,0,kind);if(['mixed','routing','failed'].includes(kind))assert.equal(entry.fingerprint.apiUnsafe,true,kind);
 }
});
test('same-turn current-run identification helps decisions but cannot substitute for three proofs',async()=>{
 const h=setup();let sync=0;h.c.Trace.sync=async()=>{sync++;};h.FP.log=async()=>{};h.FP.merge=async()=>{throw Error('must not enroll');};
 const chat={sid:'s',runTok:'current',idTok:'current',idP:Promise.resolve({response:'gpt-9.8',internal:'gpt-9.8-max'}),emit(){}},state={owner:h.FP.owner(),proofs:[],captures:[]};
 await h.FP.finalize(state,chat);assert.equal(h.FP.authority(state).source,'api-identification');assert.equal(sync,1);
 const entry={fingerprint:{count:3,error:'unavailable'}};await h.FP.finish(state,chat,entry);assert.equal(entry.guess,false);assert.equal(entry.fingerprint.library.added,false);
});
test('unrelated resolved promises, cancellation and tokenless chats do not supply authority',async()=>{
 const h=setup();let waits=0;h.c.PanelWork.wait=async f=>{waits++;return f();};
 for(const chat of [{sid:'s'},{sid:'s',runTok:'new',idTok:'old',idP:Promise.resolve({response:'gpt-9.8'})}]){const state={owner:h.FP.owner(),proofs:[],captures:[]};await h.FP.finalize(state,chat);assert.equal(h.FP.authority(state),null);}
 const state={owner:h.FP.owner(),proofs:[],captures:[]};await h.FP.finalize(state,{runTok:'new',idTok:'new',idP:Promise.resolve({response:'gpt-9.8'})},{signal:{aborted:true}});assert.equal(waits,0);
});
test('local storage failure does not discard independently verified identity',async()=>{
 const h=setup();h.FP.group=async()=>{throw Error('quota');};const chat={sid:'s',messages:[]},state=await h.FP.begin(chat);assert.match(state.storageError,/quota/);state.captures=observed(h);h.FP.recheck(state,chat);assert.equal(h.FP.authority(state).model,'gpt-9-8');
});
test('missing or contradictory API effort never borrows a model title or candidate tier',()=>{
 const h=setup();assert.equal(h.FP.readIdentity({name:'gpt-9.8-max',response:'gpt-9.8'}).tier,null);assert.equal(h.FP.readIdentity({response:'gpt-9.8',internal:'gpt-9.8-max',calls:[{effort:'high'}]}).tier,null);
 const state={proofs:[{model:'gpt-9-8',tier:'max'},{model:'gpt-9-8',tier:'high'}]};assert.equal(h.FP.authority(state).tier,null);
});
test('answer ID mismatch cannot be rescued by a nearby timestamp; ambiguous metadata fails closed',()=>{
 const h=setup(),p=h.P.PROBES[0];h.turns.push({done:true,prompt:p.prompt,response:'gpt-9.8',at:1000,records:[{messageId:'different'}]});assert.equal(h.FP.proof({sid:'s'},p,{id:'a'},1000),null);h.turns[0].records=[{messageId:'a'}];h.turns.push({...h.turns[0]});assert.equal(h.FP.proof({sid:'s'},p,{id:'a'},1000),null);
});
test('a resolved identification cached before testing cannot label the new run',async()=>{
 const h=setup();h.FP.group=async()=>h.row.group;const chat={sid:'s',messages:[{role:'user'}],runTok:'old',idTok:'old',idP:Promise.resolve({response:'gpt-9.8'})},state=await h.FP.begin(chat);
 await h.FP.finalize(state,chat);assert.equal(h.FP.authority(state),null);
 chat.idP=Promise.resolve({response:'claude-opus-9'});chat.idTok=chat.runTok='new';await h.FP.finalize(state,chat);assert.equal(h.FP.authority(state).model,'claude-opus-9');
});

test('each probe retains its own timing when later API proofs arrive',async()=>{
 const h=setup(),state={owner:'A',captures:[],proofs:[]},chat={sid:'s',messages:[]};
 h.c.Fmt={est:f=>({think:f.think})};h.c.Strength.scoreOf=x=>x.think??20;
 for(let i=0;i<3;i++){
  const probe=h.P.PROBES[i],answer={id:'a'+i,role:'assistant',parts:[],metadata:{timing:{completedAt:2000+i*100000}}};
  chat.messages.push({role:'user',parts:[{type:'text',text:probe.prompt}]},answer);
  chat.fmt={think:[10,30,90][i],rChars:0};chat.sentAt=1000+i*100000;
  await h.FP.probe(state,chat,probe,answer,chat.sentAt);
 }
 observed(h);h.FP.recheck(state,chat);
 assert.deepEqual(Array.from(state.proofs,p=>p.measurement.think),[10,30,90]);
 chat.fmt.think=99;h.FP.recheck(state,chat);
 assert.deepEqual(Array.from(state.proofs,p=>p.measurement.think),[10,30,90]);
});

test('a historical API proof cannot borrow the current chat timing or claim derived time as measured',()=>{
 const h=setup(),captures=observed(h),chat={sid:'s',fmt:{think:90,rChars:0}};
 h.c.Fmt={est:f=>({think:f.think})};h.c.Strength.scoreOf=x=>x.think??20;
 h.FP.recheck({captures,proofs:[]},chat);
 const p=h.FP.evidence(chat,captures[0].probe,captures[0].answer,NaN,captures[0]).proof;
 assert.equal(p.measurement.think,undefined);assert.equal(p.measurement.source,'estimated');
});
