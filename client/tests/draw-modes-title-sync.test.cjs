const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');const ui=path.join(__dirname,'../ui');
const code=name=>fs.readFileSync(path.join(ui,name),'utf8');
function sandbox(extra={}){
 const saved=new Map();const context=vm.createContext({console,TextEncoder,TextDecoder,crypto:webcrypto,Uint8Array,Uint32Array,AbortController,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},Date,
  Store:{get:(k,d)=>saved.has(k)?saved.get(k):d,set:(k,v)=>saved.set(k,structuredClone(v)),del:k=>saved.delete(k)},...extra});
 const load=(file,name)=>vm.runInContext(code(file)+(name?'\nthis['+JSON.stringify(name)+']='+name+';':''),context);
 return{context,saved,load};
}
test('draw prompts: randomized English SVG/probes, bounded numbers and immutable keyword aliases',async()=>{
 const h=sandbox();h.load('gacha-prompts.js','GachaPrompts');const p=h.context.GachaPrompts,seen=new Set();
 for(let n=0;n<100;n++){
  const probes=p.challenges();assert.equal(probes.length,3);assert.equal(new Set(probes.map(p=>p.expected_count)).size,3);
  for(const probe of probes){assert(probe.expected_count>=292&&probe.expected_count<=332);assert.equal(probe.maxExtra,4);assert(!/[\u3400-\u9fff]/.test(probe.prompt));assert(probe.prompt.includes(String(probe.expected_count)));assert(probe.prompt.includes('without tools'));}
  const svg=p.svg();assert(!seen.has(svg));seen.add(svg);assert(/SVG/.test(svg));assert(/pelican/.test(svg));assert(!/[\u3400-\u9fff]/.test(svg));
 }
 assert.equal(p.match('Claude Opus 5-5',['opus-5.5']),'opus-5.5');assert.equal(p.match('GPT 6 Astra',['6-astra']),'6-astra');assert.equal(p.match('gpt-6-luna',[]),'');
 assert.equal(p.keywords('opus-5.5,OPUS 5-5\nfable').length,2);
});
test('custom prompts have four-digit nonrepeating saved prefixes and retain user text exactly',async()=>{
 const h=sandbox({crypto:{subtle:webcrypto.subtle,getRandomValues:a=>(a.fill(0),a)}});h.load('gacha-prompts.js','GachaPrompts');
 const p=h.context.GachaPrompts,values=[];
 for(let i=0;i<20;i++)values.push(await p.custom('用户自定义\n第二行'));
 assert.equal(new Set(values).size,20);assert(values.every(x=>/^\d{4}\n用户自定义\n第二行$/.test(x)));
 const next=sandbox({Store:h.context.Store});next.load('gacha-prompts.js','GachaPrompts');assert(!values.includes(await next.context.GachaPrompts.custom('用户自定义\n第二行')));
 h.context.Store.set([...h.saved.keys()][0],Array.from({length:9000},(_,i)=>i+1000));await assert.rejects(()=>p.custom('用户自定义\n第二行'),/9000/);
});
function cipher(){const h=sandbox();h.load('title-compact.js','TitleCompact');h.load('title-cipher.js','TitleCipher');return{...h,c:h.context.TitleCipher};}
function legacyCipher(){const h=sandbox();vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/title-cipher-v1.js'),'utf8')+';this.TitleCipher=TitleCipher;',h.context);return{...h,c:h.context.TitleCipher};}
const phrase='correct horse forest title password';
test('title envelope crosses independent devices, has random IVs, and contains words only',async()=>{
 const a=legacyCipher(),b=cipher(),payload=[1,'GPT-6-Astra',.987,238.4,61.2,1791080000123,'手机和电脑备注','high','fingerprint',1791080000456];
 a.c.unlock(phrase);b.c.unlock(phrase);
 const first=await a.c.encrypt('same-sid',payload),second=await a.c.encrypt('same-sid',payload);
 assert.notEqual(first,second);assert.match(first,/^[A-Za-z .]+$/);assert(!first.includes('GPT'));assert.deepEqual(Array.from(await b.c.decrypt('same-sid',first)),payload);
 assert(!JSON.stringify([...a.saved]).includes(phrase));
});
test('wrong password, wrong SID, modified ciphertext and truncation fail closed; lock cancels keys',async()=>{
 const a=legacyCipher(),b=cipher();a.c.unlock(phrase);const title=await a.c.encrypt('sid-a',{model:'GPT-6-Astra'});
 b.c.unlock('a completely different password');await assert.rejects(()=>b.c.decrypt('sid-a',title),/口令/);
 b.c.unlock(phrase);await assert.rejects(()=>b.c.decrypt('sid-b',title),/对话 ID/);
 const modified=title.replace(/\w+\.$/,title.endsWith('acorn.')?'actor.':'acorn.');await assert.rejects(()=>b.c.decrypt('sid-a',modified));await assert.rejects(()=>b.c.decrypt('sid-a',title.slice(0,-30)));
 a.c.lock();await assert.rejects(()=>a.c.encrypt('sid-a',{}),/口令/);assert.equal(a.c.unlocked,false);
 const pending=b.c.decrypt('sid-a',title);b.c.lock();await assert.rejects(()=>pending,/口令|解锁/);
});
function device(entries=[]){
 const models=new Map(),listeners={};const h=sandbox({now:()=>Date.now(),pad:n=>String(n).padStart(2,'0'),describe:e=>e?.message||String(e),toast(){},
  Bus:{on:(k,fn)=>listeners[k]=fn,emit(){}},History:{items:structuredClone(entries),byId(id){return this.items.find(e=>e.id===id);},async rename(id,title){this.byId(id).title=title;}},
  Models:{get:id=>models.get(id)},Chats:new Map(),Gacha:{owns:()=>false,busy:()=>false},Strength:{canon:s=>s},Fingerprint:{describe:e=>e.name},
  Brand:{of:()=>''},UI:{renderListSoon(){},renderTabs(){}},Prefs:{autoTitle:true},document:{querySelector:()=>null}});
 for(const [file,name]of [['title-compact.js','TitleCompact'],['title-cipher.js','TitleCipher'],['conversation-labels.js','ConversationLabels'],['titles.js','Titles'],['title-sync.js','TitleSync']])h.load(file,name);
 vm.runInContext('this.Notes=Notes;',h.context);
 return{...h,models,c:h.context.TitleCipher,s:h.context.TitleSync,n:h.context.Notes,t:h.context.Titles,history:h.context.History};
}
test('cross-device title syncs notes (v4 Qx) and restores exact timestamp, model, confidence, score and duration without creating authoritative Models entries',async()=>{
 const sid='conversation-one',a=device([{id:sid,title:'旧名称'}]);
 a.models.set(sid,{name:'gpt-6-astra',guess:true,fingerprint:{result:{signals:{relative_probability:.981}},reasoning:{score:48.5},avgProbeSec:32.7}});
 a.n.all[sid]={n:'同步备注 / 中文',t:1791080000123,dirty:true,modifiedAt:1791080000456};await a.s.unlock(phrase);
 const packet=await a.s.wireTitle(sid);a.history.byId(sid).title=packet.title;a.s.remember(sid,packet);
 const b=device([{id:sid,title:packet.title}]);const result=await b.s.unlock(phrase);assert.equal(result.decoded,1);
 assert.equal(a.n.get(sid),'同步备注 / 中文');assert.equal(b.n.get(sid),'同步备注 / 中文');assert.match(packet.title,/^Qx /);assert.equal(packet.title.length,100);assert.equal(b.n.all[sid].t,1791080000123);assert.equal(b.s.restored(sid).score,48.5);assert.equal(b.s.restored(sid).average,32.7);assert.equal(b.s.restored(sid).confidence,.981);
 assert.match(b.t.want(sid),/^gpt-6-astra\(98.1%\)-48.5分(?!-)/);assert.equal(b.models.size,0);assert.equal(b.s.canWrite(sid),true);
 assert(!JSON.stringify([...b.saved]).includes(phrase));
 const before=b.n.all[sid].n;await assert.rejects(()=>b.s.unlock('incorrect title password'),/无法解锁/);assert.equal(b.n.all[sid].n,before);assert.equal(b.s.canWrite(sid),false);
});
test('two-device edits are surfaced as conflicts, never blindly overwritten',async()=>{
 const sid='conflict-chat',a=device([{id:sid,title:'original'}]);a.n.all[sid]={n:'first note',t:100,dirty:true};a.models.set(sid,{name:'gpt-6-astra'});await a.s.unlock(phrase);
 const first=await a.s.wireTitle(sid);a.history.byId(sid).title=first.title;a.s.remember(sid,first);
 const b=device([{id:sid,title:first.title}]);await b.s.unlock(phrase);
 b.n.set(sid,'local change');b.models.set(sid,{name:'6-luna'});b.t.touch(sid);
 a.n.set(sid,'remote change');a.models.set(sid,{name:'sonnet-4'});a.t.touch(sid);const remote=await a.s.wireTitle(sid);
 b.history.byId(sid).title=remote.title;await b.s.ingest();assert.equal(b.s.conflicts,1);assert.equal(b.n.get(sid),'local change');assert.equal(b.s.canWrite(sid),false);
 b.s.resolve(sid,true);assert.equal(b.n.get(sid),'remote change');assert.equal(b.s.build(sid).model,'sonnet-4');assert.equal(b.s.conflicts,0);
});
test('cloud rejection does not truncate or downgrade encrypted title; unchanged metadata is not reencrypted endlessly',async()=>{
 const sid='title-long',a=device([{id:sid,title:'old'}]);a.n.all[sid]={n:'长备注'.repeat(19),t:100,dirty:true};a.models.set(sid,{name:'gpt-6-astra'});await a.s.unlock(phrase);
 let calls=0;a.history.rename=async(id,title)=>{calls++;assert.equal(title.length,100);assert(a.c.isEncoded(title));throw Object.assign(Error('too long'),{status:422});};
 await a.t.tick(true);assert.equal(calls,1);assert.equal(a.history.byId(sid).title,'old');await a.t.tick(true);assert.equal(calls,1);assert.match(a.s.status(),/失败/);
 delete a.n.all[sid].e;a.history.rename=async(id,title)=>{calls++;a.history.byId(id).title=title;};await a.t.tick(true);assert.equal(calls,2);await a.t.tick(true);assert.equal(calls,2);
});
test('Pulse deduplicates callers, enforces five-minute minimum and backs off on 429',async()=>{
 let time=1000000,calls=0,status=200;const h=sandbox({UI:{host:{account:{id:'test'}}},now:()=>time,document:{hidden:false},Bus:{emit(){}},Acct:{report(){}},api:async()=>{calls++;if(status!==200)throw {status};return{pulse:65};}});
 const text=code('core.js'),start=text.indexOf('const Pulse = {'),end=text.indexOf('// 把本账号的状态',start);
 vm.runInContext(text.slice(start,end)+';this.Pulse=Pulse;',h.context);const p=h.context.Pulse;
 await Promise.all([p.poll(),p.poll(),p.poll()]);assert.equal(calls,1);time+=60000;await p.poll();assert.equal(calls,1);
 time+=240000;status=429;await p.poll();assert.equal(calls,2);time+=300000;await p.poll();assert.equal(calls,2);
 time+=1500000;status=200;await p.poll();assert.equal(calls,3);assert.equal(p.usd,null);assert.equal(p.v.pulse,65);
});
test('a new model cannot inherit the prior model confidence, score, duration or tier',async()=>{
 const sid='new-model',a=device([{id:sid,title:'old'}]);a.models.set(sid,{name:'gpt-6-astra',tier:'high',guess:true,fingerprint:{result:{signals:{relative_probability:.98}},reasoning:{score:222.2},avgProbeSec:33.3}});a.n.all[sid]={n:'note',t:100,dirty:true};await a.s.unlock(phrase);
 const packet=await a.s.wireTitle(sid);a.history.byId(sid).title=packet.title;a.s.remember(sid,packet);
 a.models.set(sid,{name:'claude-opus-5.5'});const next=a.s.build(sid);assert.equal(next.confidence,null);assert.equal(next.score,null);assert.equal(next.average,null);assert.equal(next.tier,'');assert.equal(next.source,'api');
});
test('local edits made during PATCH stay dirty and synchronize on the following tick',async()=>{
 const sid='patch-edit',a=device([{id:sid,title:'old'}]);a.models.set(sid,{name:'gpt-6-astra'});a.n.all[sid]={n:'before',t:100,dirty:true};await a.s.unlock(phrase);
 a.history.rename=async(id,title)=>{a.n.set(id,'during');a.models.set(id,{name:'6-luna'});a.t.touch(id);a.history.byId(id).title=title;};await a.t.tick(true);
 assert.equal(a.n.all[sid].dirty,true);assert.equal((await a.c.decrypt(sid,a.history.byId(sid).title))[1],'gpt-6-astra');assert.equal(a.n.get(sid),'during');
 a.history.rename=async(id,title)=>{a.history.byId(id).title=title;};await a.t.tick(true);assert.equal(a.n.all[sid].dirty,false);assert.equal((await a.c.decrypt(sid,a.history.byId(sid).title))[1],'6-luna');assert.equal(a.n.get(sid),'during');
});
test('simultaneous unlocks serialize hydration and the stale unlock cannot relock the new one',async()=>{
 const c=cipher();c.c.unlock(phrase);const title=await c.c.encrypt('race',[1,'gpt-6-astra',.98,200,20,100,'note','','fingerprint',101]);const d=device([{id:'race',title}]);
 const first=d.s.unlock(phrase).then(()=>false,()=>true),second=d.s.unlock(phrase);assert.equal(await first,true);assert.equal((await second).decoded,1);assert.equal(d.c.unlocked,true);assert.equal(d.s.canWrite('race'),true);
});
test('history replacement during decryption never applies stale metadata under the new ciphertext',async()=>{
 const c=legacyCipher();c.c.unlock(phrase);const payload=[1,'gpt-6-astra',.98,200,20,100,'old note','','fingerprint',101];const old=await c.c.encrypt('race',payload);payload[6]='new note';const fresh=await c.c.encrypt('race',payload);
 const d=device([{id:'race',title:old}]);d.c.unlock(phrase);const decrypt=d.c.decrypt;let release,started;const gate=new Promise(r=>started=r);d.c.decrypt=async(...args)=>{started();await new Promise(r=>release=r);return decrypt(...args);};
 const pending=d.s.ingest();await gate;d.history.byId('race').title=fresh;release();await pending;assert.equal(d.s.restored('race'),null);
 d.c.decrypt=decrypt;await d.s.ingest();assert.equal(d.n.get('race'),'new note');
});
test('oversized metadata fails explicitly instead of silently cutting model information',async()=>{
 const sid='long-model',d=device([{id:sid,title:'old'}]);d.models.set(sid,{name:'x'.repeat(161)});d.n.all[sid]={n:'note',t:100,dirty:true};await d.s.unlock(phrase);await assert.rejects(()=>d.s.wireTitle(sid),/字段不合法/);assert.equal(d.history.byId(sid).title,'old');
});
test('History.rename refuses plaintext and detects a server-truncated encrypted title echo',async()=>{
 let calls=0;const entry={id:'echo',title:'original'};const h=sandbox({api:async()=>{calls++;return{title:'Quiet stories begin. cut'};},Chats:new Map(),Bus:{emit(){}}});h.load('title-compact.js','TitleCompact');h.load('title-cipher.js','TitleCipher');
 const core=code('core.js'),start=core.indexOf('  async rename(id, title) {'),end=core.indexOf('  async remove(id)',start);
 vm.runInContext('this.history={'+core.slice(start,end)+'};',h.context);h.context.history.byId=()=>entry;
 await assert.rejects(()=>h.context.history.rename('echo','ordinary plaintext'),/只允许/);assert.equal(calls,0);
 await assert.rejects(()=>h.context.history.rename('echo','Qz '+Array(14).fill('aaaaaa').join(' ')),/截断或修改/);assert.equal(calls,1);assert.equal(entry.title,'original');
});
test('upgrading a saved legacy draw pauses safely rather than sending with missing mode or preferences',()=>{
 for(const fingerprint of [true,false]){
  const run={autoResume:true,status:'running',settings:{fingerprint,endless:true}},h=sandbox({run,settings:()=>({fingerprint}),changed(){},setTimeout(){throw Error('legacy batch must not auto-send');}});
  const source=code('gacha.js'),start=source.indexOf('  function resume() {'),end=source.indexOf('  const busy =',start);
  vm.runInContext(source.slice(start,end)+';resume();',h.context);assert.equal(run.status,'stopped');assert.equal(run.autoResume,false);assert.match(run.reason,/手动开始/);
 }
});

test('requested nine-digit default automatically decodes on independent devices and preserves old-key records',async()=>{
 const a=device([{id:'default',title:'plain'}]);a.models.set('default',{name:'6-luna',guess:true,fingerprint:{result:{signals:{relative_probability:.997}},reasoning:{score:91.7},avgProbeSec:31.4}});a.n.all.default={n:'跨端备注',t:100,dirty:true};
 await a.s.start();assert.equal(a.c.DEFAULT_PASSPHRASE,'755287249');const packet=await a.s.wireTitle('default');
 const old=legacyCipher();old.c.unlock(phrase);const oldTitle=await old.c.encrypt('old',[1,'other',null,null,null,100,'旧口令','','local',100]);
 const b=device([{id:'default',title:packet.title},{id:'old',title:oldTitle}]);await b.s.start();
 assert.equal(b.c.unlocked,true);assert.equal(a.n.get('default'),'跨端备注');assert.equal(b.n.get('default'),'跨端备注');assert.equal(b.s.canWrite('old'),false);assert.match(b.t.view('default').model,/^6-luna\(99.7%\)-91.7分$/);
 const legacy=device([{id:'old',title:oldTitle}]);await legacy.s.start();assert(legacy.c.unlocked);assert.equal(legacy.s.canWrite('old'),false);await legacy.s.unlock(phrase);assert.equal(legacy.n.get('old'),'旧口令');
});
test('decoded cloud metadata wins over stale local Models without promoting cloud guesses to authoritative identity',async()=>{
 const c=legacyCipher();c.c.unlock('755287249');const title=await c.c.encrypt('same',[1,'6-luna',.997,91.7,31.4,100,'云端备注','','fingerprint',101]);
 const d=device([{id:'same',title}]);d.models.set('same',{name:'gpt',guess:true});await d.s.start();
 assert.equal(d.models.get('same').name,'gpt');assert.equal(d.s.build('same').model,'6-luna');assert.match(d.t.view('same').model,/6-luna\(99.7%\)/);
 d.n.set('same','仅改备注');assert.equal(d.s.build('same').model,'6-luna');
 d.models.set('same',{name:'sonnet-4',guess:true,fingerprint:{result:{signals:{relative_probability:.999}},reasoning:{score:78.2},avgProbeSec:79.2}});d.t.touch('same');assert.equal(d.s.build('same').model,'sonnet-4');
});
test('all local and restored fingerprint names use the same formatting, with no foreign candidate confidence',async()=>{
 const d=device([{id:'same',title:'plain'}]),mi={name:'sonnet-4',guess:true,fingerprint:{result:{signals:{relative_probability:.999}},reasoning:{score:78.2,tier:'high'},avgProbeSec:79.23}};
 d.models.set('same',mi);d.n.rec('same');const want='sonnet-4(99.9%)-78.2分';
 assert.equal(d.context.ConversationLabels.fingerprintLabel(mi),want);assert.equal(d.s.modelLabel(d.s.build('same')),want);assert.equal(d.t.view('same').model,want);
 mi.fingerprint.apiIdentity={model:'sonnet-4'};mi.fingerprint.result.nearest={id:'6-luna'};assert.equal(d.s.build('same').confidence,null);
});
test('completed results save while another chat or an endless draw is busy',async()=>{
 const d=device([{id:'done',title:'plain'}]);d.models.set('done',{name:'6-luna',fingerprint:{reasoning:{score:91.7}}});d.t.capture('done');await d.s.start();
 d.context.Gacha.busy=()=>true;d.context.Gacha.owns=()=>true;d.context.Chats.set('other',{busy:true});d.n.all.done.modifiedAt=Date.now()-5000;
 let writes=0;d.history.rename=async(id,title)=>{writes++;d.history.byId(id).title=title;};await d.t.tick();assert.equal(writes,1);assert.equal(d.n.all.done.dirty,false);
 d.models.set('done',{name:'sonnet-4'});d.t.touch('done');assert.equal(d.n.all.done.dirty,true,'old draw ownership must not suppress new manual identification');
});
test('note retention never prunes unsynchronized results at the old 600-record limit',()=>{
 const d=device();for(let i=0;i<6100;i++)d.n.all['pending-'+i]={n:'note',t:100,dirty:true};d.n.save();assert.equal(Object.keys(d.n.all).length,6100);
});
test('repeated model event with identical metadata clears redundant dirty state without another PATCH',async()=>{
 const d=device([{id:'same',title:'plain'}]);d.models.set('same',{name:'6-luna'});d.t.capture('same');await d.s.start();let writes=0;d.history.rename=async(id,title)=>{writes++;d.history.byId(id).title=title;};
 await d.t.tick(true);d.t.touch('same');await d.t.tick(true);assert.equal(writes,1);assert.equal(d.n.all.same.dirty,false);
});
test('rename verifies persisted title, updates replaced history objects, and detects unseen remote edits',async()=>{
 const encrypted='Qz '+Array(14).fill('aaaaaa').join(' '),other='Qz '+Array(14).fill('bbbbbb').join(' '),h=sandbox({Chats:new Map(),Bus:{emit(){}},TitleCipher:{isEncoded:t=>String(t||'').startsWith('Qz '),isCompact:t=>t.length===100}});
 const core=code('core.js'),a=core.indexOf('  async rename(id, title) {'),b=core.indexOf('  async remove(id)',a);vm.runInContext('this.history={'+core.slice(a,b)+'};',h.context);
 let entry={id:'same',title:'plain'},stored='plain',writes=0;h.context.history.byId=()=>entry;
 h.context.api=async(url,opt)=>{if(opt?.method==='PATCH'){writes++;stored=opt.json.title;entry={...entry};return{title:stored};}return {title:stored};};
 await h.context.history.rename('same',encrypted);assert.equal(entry.title,encrypted);stored=other;
 await assert.rejects(()=>h.context.history.rename('same',encrypted),/云端名称已变化/);assert.equal(writes,1);assert.equal(entry.title,other);
 entry.title='plain';stored='plain';h.context.api=async(url,opt)=>opt?.method==='PATCH'?{title:opt.json.title}:{title:stored};await assert.rejects(()=>h.context.history.rename('same',encrypted),/回读未确认/);assert.equal(entry.title,'plain');
});
test('local storage failure is reported instead of claiming that a note was saved',()=>{
 const d=device([{id:'quota',title:'plain'}]);d.models.set('quota',{name:'6-luna'});d.t.capture('quota');d.context.Store.set=()=>false;
 assert.equal(d.n.set('quota','only in memory'),false);assert.match(d.s.status(),/本地名称缓存未写入/);assert.equal(d.n.get('quota'),'only in memory');assert(d.n.all.quota.dirty);
});
test('explicit cloud sync works with automatic titles disabled and preserves terminal failures until requested retry',async()=>{
 const d=device([{id:'manual',title:'plain'}]);d.models.set('manual',{name:'6-luna'});d.t.capture('manual');d.context.Prefs.autoTitle=false;await d.s.start();let writes=0;
 d.history.rename=async(id,title)=>{writes++;d.history.byId(id).title=title;};await d.t.tick();assert.equal(writes,0);await d.s.syncNow();assert.equal(writes,1);assert.match(d.s.status(),/回读确认/);
});
test('matching cloud readback reconciles a pending result after an ambiguous PATCH response',async()=>{
 const d=device([{id:'retry',title:'plain'}]);d.models.set('retry',{name:'6-luna'});d.t.capture('retry');await d.s.start();const p=await d.s.wireTitle('retry');
 d.history.byId('retry').title=p.title;assert(d.n.all.retry.dirty);await d.s.ingest();assert.equal(d.n.all.retry.dirty,false);assert.equal(d.n.all.retry.syncedData,p.signature);
});
test('message-only chat responses use bounded history readback rather than trusting an echo',async()=>{
 const title='Qz '+Array(14).fill('aaaaaa').join(' '),entry={id:'same',title:'plain'},h=sandbox({Chats:new Map(),Bus:{emit(){}},TitleCipher:{isEncoded:t=>String(t||'').startsWith('Qz '),isCompact:t=>t.length===100}});
 const core=code('core.js'),a=core.indexOf('  async rename(id, title) {'),b=core.indexOf('  async remove(id)',a);vm.runInContext('this.history={'+core.slice(a,b)+'};',h.context);h.context.history.byId=()=>entry;let persisted='plain',reads=0;
 h.context.api=async(url,opt)=>{if(opt?.method==='PATCH'){persisted=opt.json.title;return{};}if(url.startsWith('/api/history/unified')){reads++;return{entries:[{id:'same',title:persisted}]};}return {messages:[]};};
 await h.context.history.rename('same',title);assert.equal(entry.title,title);assert.equal(reads,1);
});
test('429 cools the whole title upload queue, including manual retry and new results',async()=>{
 const d=device([{id:'one',title:'plain'},{id:'two',title:'plain'}]);let time=Date.now();d.context.now=()=>time;for(const sid of ['one','two']){d.models.set(sid,{name:'6-luna'});d.t.capture(sid);}await d.s.start();let calls=0;
 d.history.rename=async()=>{calls++;throw Object.assign(Error('rate limited'),{status:429,retryAfterMs:900000});};await d.t.tick(true);assert.equal(calls,1);d.t.touch('two');await d.s.syncNow();assert.equal(calls,1);time+=900000;await d.t.tick(true);assert.equal(calls,2);assert(d.n.all.two.dirty);
});
test('all twelve old HTTP 400 pending results migrate to exactly 100 characters without retrying long titles',async()=>{
 const entries=Array.from({length:12},(_,i)=>({id:'old-'+i,title:'plain'})),d=device(entries);let calls=0;
 for(const {id}of entries){d.models.set(id,{name:'gpt-6-luna',fingerprint:{reasoning:{score:91.7},avgProbeSec:31.4}});d.n.all[id]={n:'本地备注-'+id,t:1791080000123,dirty:true,e:'old-long-signature',lastStatus:400,f:4,nx:Date.now()+10000000};}
 d.history.rename=async(id,title)=>{assert.equal(title.length,100);calls++;d.history.byId(id).title=title;};await d.s.start();for(let i=0;i<12;i++)await d.t.tick(true);
 assert.equal(calls,12);assert.equal(d.s.pending(),0);for(const {id}of entries){assert.equal(d.n.get(id),'本地备注-'+id);assert.equal(d.n.all[id].compactVersion,2);assert.equal((await d.c.decrypt(id,d.history.byId(id).title))[6],'本地备注-'+id);}
 await d.t.tick(true);assert.equal(calls,12);
});
test('note edits queue an encrypted sync but never reset rate-limit state or raise false conflicts',async()=>{
 const d=device([{id:'x',title:'plain'}]);d.models.set('x',{name:'6-luna'});d.t.capture('x');await d.s.start();await d.t.tick(true);const title=d.history.byId('x').title;
 d.n.all.x.lastStatus=429;d.n.all.x.nx=Date.now()+900000;const cooldown=d.n.all.x.nx;d.n.set('x','only local');assert.equal(d.n.all.x.dirty,true);assert.equal(d.n.all.x.nx,cooldown);
 await d.t.tick(true);assert.equal(d.history.byId('x').title,title);const other=device([{id:'x',title}]);other.n.set('x','other device note');await other.s.start();assert.equal(other.n.get('x'),'other device note');assert.equal(other.s.conflicts,0);
});
test('local notes survive cache pruning and legacy cloud notes survive migration',async()=>{
 const d=device();for(let i=0;i<1000;i++)d.n.all['noted-'+i]={n:'local only',dirty:false,syncedData:'done'};d.n.save();assert.equal(Object.keys(d.n.all).length,1000);
 const old=legacyCipher();old.c.unlock(phrase);const title=await old.c.encrypt('legacy',[1,'6-luna',.997,91.7,31.4,100,'旧备注','high','fingerprint',101]);
 const a=device([{id:'legacy',title}]);await a.s.unlock(phrase);assert.equal(a.n.get('legacy'),'旧备注');a.t.touch('legacy');await a.t.tick(true);assert.equal(a.history.byId('legacy').title.length,100);assert.equal(a.n.get('legacy'),'旧备注');
 const b=device([{id:'legacy',title:a.history.byId('legacy').title}]);await b.s.unlock(phrase);assert.equal(b.n.get('legacy'),'旧备注');assert.equal(b.s.build('legacy').model,'6-luna');
});
test('unlisted model syncs under its own name in a fixed 100-character title, never a substitute model',async()=>{
 const d=device([{id:'future',title:'plain'}]);d.models.set('future',{name:'gpt-brand-new-unregistered'});d.t.capture('future');await d.s.start();let sent=null;d.history.rename=async(id,t)=>{sent=t;d.history.byId(id).title=t;};await d.t.tick(true);
 assert.equal(typeof sent,'string');assert.equal(sent.length,100);assert.match(sent,/^Qy /);assert.ok(!sent.includes('gpt-brand-new-unregistered'), 'the full model name must not be plaintext; random ciphertext may contain short fragments');
 const back=await d.context.TitleCipher.decrypt('future',sent);assert.equal(back[1],'gpt-brand-new-unregistered');
});
test('legacy migration retains a different old cloud note and refuses to erase its only copy when storage fails',async()=>{
 const c=legacyCipher();c.c.unlock(phrase);const title=await c.c.encrypt('x',[1,'gpt',null,null,null,100,'old cloud note','','local',100]);
 const d=device([{id:'x',title}]);d.n.set('x','different local note');await d.s.unlock(phrase);assert.equal(d.n.get('x'),'different local note');assert.equal(d.n.all.x.legacyNote,'old cloud note');
 d.t.touch('x');d.context.Store.set=()=>false;let writes=0;d.history.rename=async()=>{writes++;};await d.t.tick(true);assert.equal(writes,0);assert.equal(d.history.byId('x').title,title);assert(d.n.all.x.dirty);
});
test('a calibrated / re-identified chat syncs first without waiting for global idle or queued migrations',async()=>{
 const d=device([{id:'old1',title:'plain'},{id:'old2',title:'plain'},{id:'cal',title:'plain'}]);await d.s.start();
 for(const id of ['old1','old2','cal']){d.models.set(id,{name:'6-luna'});d.t.capture(id);}
 const order=[];d.history.rename=async(id,title)=>{order.push(id);d.history.byId(id).title=title;};
 d.models.set('cal',{name:'gpt-6-astra',guess:true,fingerprint:{result:{signals:{relative_probability:.99}},reasoning:{score:200},avgProbeSec:30}});d.t.touch('cal');
 d.t.quiet=0;await d.t.tick();assert.deepEqual(order,['cal']);assert.equal(d.t.prio.has('cal'),false);
 assert.match(await d.c.decrypt('cal',d.history.byId('cal').title).then(v=>v[1]),/gpt-6-astra/);
});
test('a blank local record made before the cloud title decodes adopts the cloud note instead of conflicting, and calibration keeps the note',async()=>{
 const a=device([{id:'s',title:'x'}]);
 a.models.set('s',{name:'sonnet-5-5',guess:true,fingerprint:{result:{signals:{relative_probability:.992}},reasoning:{score:50},avgProbeSec:30}});
 a.n.all.s={n:'修客户端',t:1791080000123,dirty:true,modifiedAt:1791080000456};await a.s.unlock(phrase);
 const packet=await a.s.wireTitle('s');
 // 另一台设备：模型事件先到，标题还没解码，本机先建了一条空记录
 const b=device([{id:'s',title:packet.title}]);b.models.set('s',{name:'claude',guess:true});b.t.capture('s');
 assert.equal(b.n.all.s.n,'');
 await b.s.unlock(phrase);
 assert.equal(b.s.conflicts,0);assert.equal(b.n.get('s'),'修客户端');assert.equal(b.s.canWrite('s'),true);
 b.models.set('s',{name:'sonnet-5-5',guess:true,fingerprint:{result:{signals:{relative_probability:.99}},reasoning:{score:60},avgProbeSec:30}});b.t.touch('s');
 assert.equal(b.t.view('s').note,'修客户端');assert.equal(b.n.get('s'),'修客户端');
 const up=await b.c.decrypt('s',(await b.s.wireTitle('s')).title);assert.equal(up[6],'修客户端');
});
test('calibrated model and note survive continued chatting, repeated calibration on either device, and cross-device decoding; the cloud name holds no plaintext',async()=>{
 const fp=(p,sc)=>({result:{signals:{relative_probability:p}},reasoning:{score:sc},avgProbeSec:30});
 const push=async(d,sid)=>{const p=await d.s.wireTitle(sid);d.history.byId(sid).title=p.title;d.s.remember(sid,p);return p;};
 const A=device([{id:'s',title:'x'}]);await A.s.unlock(phrase);
 A.models.set('s',{name:'sonnet-5-5',guess:true,fingerprint:fp(.992,50)});A.t.capture('s');A.n.set('s','修客户端');
 let p=await push(A,'s');assert.match(p.title,/^Qx /);assert(!p.title.includes('修客户端'));assert(!p.title.includes('sonnet'));assert.equal(p.title.length,100);
 for(let i=0;i<5;i++)A.t.capture('s');   // the chat keeps going: model events do not change identity or note
 assert.equal(A.s.build('s').model,'sonnet-5-5');assert.equal(A.s.build('s').note,'修客户端');
 A.models.set('s',{name:'sonnet-5-5',guess:true,fingerprint:fp(.99,60)});A.t.touch('s');p=await push(A,'s');
 const B=device([{id:'s',title:p.title}]);await B.s.unlock(phrase);
 assert.match(B.t.view('s').model,/^sonnet-5-5\(99%\)/);assert.equal(B.t.view('s').note,'修客户端');
 B.models.set('s',{name:'sonnet-5-5',guess:true,fingerprint:fp(.97,70)});B.t.touch('s');const p2=await push(B,'s');
 const up=await B.c.decrypt('s',p2.title);assert.equal(up[1],'sonnet-5-5');assert.equal(up[6],'修客户端');
 const A2=device([{id:'s',title:p2.title}]);await A2.s.unlock(phrase);
 assert.match(A2.t.view('s').model,/^sonnet-5-5\(97%\)/);assert.equal(A2.t.view('s').note,'修客户端');assert.equal(A2.s.conflicts,0);
});
