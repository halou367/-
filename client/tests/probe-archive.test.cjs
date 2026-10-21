const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../ui/probe-archive.js'),'utf8');
function setup(store=new Map()){
 const models={},history=new Map(),chats=new Map(),calls=[],messages=[],events={};let time=100000,fail=null,hold=null;
 const ctx=vm.createContext({Map,Set,UI:{host:{account:{id:'a'}}},Store:{get:(k,d)=>store.get(k)||d,set:(k,v)=>store.set(k,structuredClone(v))},now:()=>time,setTimeout:()=>1,clearTimeout(){},describe:e=>e.message,toast:t=>messages.push(t),Models:{all:models,get:id=>models[id]},Chats:chats,History:{items:[],byId:id=>history.get(id),archive:async id=>{calls.push(id);if(hold)await hold;if(fail)throw fail;history.get(id).isArchived=true;}},Fingerprint:{isRunning:c=>!!c?.probing},FingerprintBatch:{owns:()=>false},Hitl:{pending:c=>c.hitl?[{}]:[]},Gacha:{canAutoCleanupChat:()=>true,noteArchived:id=>calls.push('saved:'+id)},Bus:{on:(e,f)=>events[e]=f,emit(){}}});
 vm.runInContext(source+';this.P=ProbeArchive;',ctx);
 const add=(id,fp={skipped:'visible-thinking',stopConfirmed:true,guard:{at:100}})=>{models[id]={name:'待定',at:100,fingerprint:fp};history.set(id,{id,title:'old'});return {sid:id};};
 return {ctx,p:ctx.P,models,history,chats,calls,store,messages,add,advance:ms=>time+=ms,fail:e=>fail=e,hold:p=>hold=p};
}
test('confirmed thinking skips are archived, never deleted; other skips/guesses remain',async()=>{
 const f=setup();f.add('thinking');f.add('unconfirmed',{skipped:'visible-thinking',stopConfirmed:false});f.add('overflow',{skipped:'probe-too-many',stopConfirmed:true});f.add('guess',{result:{status:'close'}});f.p.start();await f.p.drain();assert.deepEqual(f.calls,['thinking','saved:thinking']);assert.equal(f.p.pending,0);
});
test('busy, queued, interactive and actively probed chats wait until safe',async()=>{
 for(const state of [{busy:true},{queue:[{}]},{probing:true},{fpLocked:true},{hitl:true}]){
  const f=setup();f.add('x');f.chats.set('x',{sid:'x',...state});f.p.start();await f.p.drain();assert.equal(f.calls.length,0);f.chats.clear();await f.p.drain();assert.deepEqual(f.calls,['x','saved:x']);
 }
});
test('archive failure retains a persistent retry queue and respects Retry-After',async()=>{
 const f=setup();f.add('x');f.fail(Object.assign(Error('limited'),{retryAfterMs:90000}));f.p.start();await f.p.drain();assert.equal(f.calls.length,1);assert.equal(f.p.pending,1);await f.p.drain();assert.equal(f.calls.length,1);f.advance(90000);f.fail(null);await f.p.drain();assert.equal(f.calls.length,3);assert.equal(f.p.pending,0);
});
test('manual unarchive is respected across restart; a new confirmed skip may archive again',async()=>{
 const f=setup();f.add('x');f.p.start();await f.p.drain();const g=setup(f.store);g.add('x');g.p.start();await g.p.drain();assert.equal(g.calls.length,0);
 g.models.x.fingerprint.guard.at=200;g.p.consider({sid:'x'},g.models.x);await g.p.drain();assert.deepEqual(g.calls,['x','saved:x']);
});
test('queue cancels if a newer result is no longer a thinking skip',async()=>{
 const f=setup();f.add('x');f.p.start();f.models.x.fingerprint={result:{status:'clear'}};await f.p.drain();assert.equal(f.calls.length,0);assert.equal(f.p.pending,0);
});
test('account switch does not transplant pending work or acknowledgements',async()=>{
 const f=setup();f.add('x');let release;f.hold(new Promise(r=>release=r));f.p.start();const work=f.p.drain();await Promise.resolve();f.ctx.UI.host.account.id='b';release();await work;assert.equal(f.p.pending,0);assert(!f.store.has('probe-archive@b'));assert(f.store.get('probe-archive@a').pending.length);
});
test('rate limiting pauses other archives and survives a process restart',async()=>{
 const f=setup();f.add('x');f.add('y');f.fail(Object.assign(Error('limited'),{status:429,retryAfterMs:90000}));f.p.start();await f.p.drain();await f.p.drain();assert.deepEqual(f.calls,['x']);
 const g=setup(f.store);g.add('x');g.add('y');g.p.start();await g.p.drain();assert.equal(g.calls.length,0);g.advance(90000);await g.p.drain();assert.deepEqual(g.calls,['x','saved:x']);
});
test('malformed persisted queue data cannot crash startup',async()=>{
 const f=setup(new Map([['probe-archive@a',{pending:'invalid',done:[null,'bad',[1,2]]}]]));f.add('x');f.p.start();await f.p.drain();assert.deepEqual(f.calls,['x','saved:x']);
});
