const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../ui');
function setup(opts={}){
 let time=0;const archived=[],timers=[],models=new Map(),chats=new Map();
 const settings={targetKeywords:[],archiveOn:true,archiveKeywords:['Luna'],minStr:'',...opts.settings};
 const run={settings,attempts:[],archiveQueue:[],log:[],hits:[]};
 const c=vm.createContext({console,run,now:()=>time,sleep:async ms=>{time+=ms;},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
   Store:{get:(k,d)=>d},ProbeLib:{PROBES:[]},Strength:{},Bus:{on(){},emit(){}},
   Models:{get:sid=>models.get(sid)},Chats:chats,Titles:{capture(){}},
   ProbeArchive:{thinking:fp=>fp.stopConfirmed===true&&fp.skipped==='visible-thinking',consider:()=>archived.push('thinking')},
   History:{archive:async sid=>{if(opts.fail)throw Error('offline');archived.push(sid);}},
   Brand:{learnedOf:()=>''},vendorBy:()=>null,Hitl:{name:p=>p.type==='tool-ask_user'},
   changed(){},log(){},describe:e=>e.message,settings:()=>settings,
 });
 vm.runInContext(fs.readFileSync(path.join(root,'gacha-prompts.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(root,'fingerprint.js'),'utf8'),c);
 const src=fs.readFileSync(path.join(root,'gacha.js'),'utf8');
 vm.runInContext(src.slice(src.indexOf('  const norm ='),src.indexOf('  // ----- 运行状态'))+'\n'+src.slice(src.indexOf('  const hitlIn ='),src.indexOf('  const dropFlights ='))+'\nthis.api={classify,settle,archiveQueued};',c);
 const entry=(p=.99)=>({name:'gpt-6-luna',guess:true,fingerprint:{result:{status:'clear',nearest:{id:'gpt-6-luna',probability:p},signals:{relative_probability:p}},reasoning:{}}});
 const attempt=e=>{const a={sid:'draw',model:e.name,guess:e.guess,fingerprint:e.fingerprint,verdict:c.api.classify(e,settings)};run.attempts.push(a);models.set(a.sid,e);chats.set(a.sid,{sid:a.sid,busy:false,messages:[]});return a;};
 return {api:c.api,entry,attempt,settings,run,archived,timers,models,chats,opts};
}
test('Luna blacklist applies to completed fingerprints, including close results at 95%',()=>{
 const h=setup({settings:{targetKeywords:['gpt']}});
 for(const status of ['clear','close']){const e=h.entry(.95);e.fingerprint.result.status=status;assert.equal(h.api.classify(e,h.settings),'archive');}
 assert.equal(h.api.classify(h.entry(.949),{...h.settings,targetKeywords:[]}),'keep');
 for(const flags of [{error:'bad'},{probeError:true},{conflict:true},{apiUnsafe:true},{skipped:'numeric-overflow'}]){const e=h.entry();Object.assign(e.fingerprint,flags);assert.equal(h.api.classify(e,h.settings),'keep');}
 const e=h.entry();e.fingerprint.result.status='weak';assert.equal(h.api.classify(e,h.settings),'keep');
 assert.equal(h.api.classify(h.entry(),{...h.settings,archiveOn:false,targetKeywords:[]}),'keep');
 assert.equal(h.api.classify(h.entry(),{...h.settings,archiveKeywords:[],targetKeywords:[]}),'keep');
 for(const p of [NaN,Infinity,'0.99',null])assert.equal(h.api.classify(h.entry(p),{...h.settings,targetKeywords:[]}),'keep');
});
test('verified API identity overrides a conflicting statistical blacklist candidate',()=>{
 const h=setup(),e=h.entry();e.fingerprint.apiIdentity={name:'gpt-6-astra',model:'gpt-6-astra'};assert.equal(h.api.classify(e,h.settings),'keep');
 e.fingerprint.apiIdentity={name:'gpt-6-luna',model:'gpt-6-luna'};e.fingerprint.result.status='weak';assert.equal(h.api.classify(e,h.settings),'archive');
});
test('blacklisted fingerprint reaches actual archive during settlement',async()=>{
 const h=setup(),a=h.attempt(h.entry());await h.api.settle(a,a.verdict);assert.deepEqual(h.archived,['draw']);assert.equal(a.archived,true);assert.equal(a.kept,undefined);
});
test('active draws queue archival until idle and failures retry',async()=>{
 const h=setup(),a=h.attempt(h.entry());h.chats.get('draw').busy=true;await h.api.settle(a,a.verdict);assert.deepEqual(h.archived,[]);assert.deepEqual([...h.run.archiveQueue],['draw']);assert.equal(h.timers.length,1);
 h.chats.get('draw').busy=false;h.opts.fail=true;await h.timers.shift()();assert.deepEqual([...h.run.archiveQueue],['draw']);
 h.opts.fail=false;await h.timers.shift()();assert.deepEqual(h.archived,['draw']);assert.equal(a.archived,true);
});
test('interaction panels and updated identity are kept before archival',async()=>{
 const h=setup(),a=h.attempt(h.entry());h.chats.get('draw').messages=[{role:'assistant',parts:[{type:'tool-ask_user'}]}];await h.api.settle(a,a.verdict);assert.deepEqual(h.archived,[]);assert.equal(a.kept,'hitl');
 const b=setup(),ba=b.attempt(b.entry());b.models.set('draw',{name:'gpt-6-astra',guess:false});await b.api.settle(ba,ba.verdict);assert.deepEqual(b.archived,[]);
});
test('thinking skips retain their existing archive path, ordinary guesses are kept',async()=>{
 const h=setup(),e=h.entry();e.fingerprint={skipped:'visible-thinking',stopConfirmed:true};const a=h.attempt(e);await h.api.settle(a,a.verdict);assert.deepEqual(h.archived,['thinking']);
 const b=setup(),be=b.entry(.5);be.fingerprint.result.status='weak';const ba=b.attempt(be);await b.api.settle(ba,ba.verdict);assert.deepEqual(b.archived,[]);
});
test('queued archive is withdrawn when identity changes or blacklist is disabled',async()=>{
 for(const revoke of ['identity','settings']){const h=setup(),a=h.attempt(h.entry());h.chats.get('draw').busy=true;await h.api.settle(a,a.verdict);h.chats.get('draw').busy=false;
 if(revoke==='identity')h.models.set('draw',{name:'gpt-6-astra',guess:false});else h.settings.archiveOn=false;
 await h.timers.shift()();assert.deepEqual(h.archived,[]);assert.equal(h.run.archiveQueue.length,0);assert.equal(a.verdict,'keep');}
});
test('stop not yet confirmed defers archive until confirmed',async()=>{
 const h=setup(),e=h.entry();e.fingerprint.stopConfirmed=false;const a=h.attempt(e);await h.api.settle(a,a.verdict);assert.deepEqual(h.archived,[]);assert.equal(h.run.archiveQueue.length,1);
 e.fingerprint.stopConfirmed=true;await h.timers.shift()();assert.deepEqual(h.archived,['draw']);
});
