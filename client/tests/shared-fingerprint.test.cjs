const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {FingerprintStore}=require('../src/fingerprint-store');
const S=require('../ui/shared-fingerprint-schema');
const fixture=JSON.parse(sync.readFileSync(path.join(__dirname,'fixtures/gpt-6-astra-three.json')));
async function host(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brana-fp-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return new FingerprintStore(path.join(dir,'library.json'));}
function profile(store,name='A',old=[]){
 const c=vm.createContext({console,crypto:webcrypto,TextEncoder,Uint8Array,setTimeout,clearTimeout,UI:{host:{account:{id:name}},me:{id:'private-user-'+name}},Host:{platform:'desktop',fingerprintStore:(...a)=>store.request(...a)},Bus:{emit(){}},PanelWork:{frame:async()=>{}},describe:e=>e.message});
 for(const file of ['probe-vendor','probe-output-guard','personal-fingerprint-math','personal-fingerprint','shared-fingerprint-schema','shared-fingerprint'])vm.runInContext(sync.readFileSync(path.join(__dirname,'../ui',file+'.js'),'utf8'),c);
 vm.runInContext('this.fp=PersonalFP;this.shared=SharedFP;this.math=PersonalMath;this.probe=ProbeLib;',c);
 c.fp.all=async(kind,owner)=>structuredClone(old.filter(r=>!r.owner||r.owner===owner));c.fp.legacyGroup=async sid=>c.fp.digest('legacy-'+name+'|'+sid);
 c.raw=(i=0,extra={})=>({protocol:'modeltrace-plain-v1',model:'custom-model-9',tier:'max',group:String(i+1).padStart(64,'0'),context:'history',at:1,outputs:fixture.map(x=>c.probe.numbers(x.text).map(n=>(n+i-1)%355+1)),measures:Array(3).fill({score:40,source:'measured'}),...extra});
 c.row=async(i=0,extra={})=>c.fp.normalize(c.raw(i,extra),true,'local-api');return c;
}
test('two isolated profiles consolidate existing references without copying private fields',async t=>{
 const store=await host(t),a=profile(store),oldA=[{...await a.row(0),owner:a.fp.owner(),key:'private-key',token:'DO-NOT-COPY'}],oldB=[await a.row(1)];
 const x=profile(store,'A',oldA),y=profile(store,'B',oldB);await Promise.all([x.fp.refs(),y.fp.refs()]);assert.equal((await x.fp.refs()).length,2);assert.equal((await y.fp.refs()).length,2);
 const text=await fs.readFile(store.file,'utf8');for(const secret of ['private-key','DO-NOT-COPY','private-user-','owner','token'])assert.ok(!text.includes(secret));assert.equal(oldA.length,1);assert.equal(oldA[0].token,'DO-NOT-COPY');
});
test('concurrent enrollments use CAS retry rather than last-writer-wins',async t=>{
 const store=await host(t),profiles=Array.from({length:6},(_,i)=>profile(store,'A'+i));let conflicts=0;const request=store.request.bind(store);store.request=async(...a)=>{const r=await request(...a);if(r.conflict)conflicts++;return r;};
 await Promise.all(profiles.map(async(p,i)=>p.fp.merge([await p.row(i)])));assert.equal((await profiles[0].fp.refs()).length,6);assert.ok(conflicts>0);
 const reopened=new FingerprintStore(store.file);assert.equal((await reopened.request('read')).state.rows.length,6);
});
test('global disable survives other-account enrollment and repeated legacy migration',async t=>{
 const store=await host(t),a=profile(store),row=await a.row();await a.fp.merge([row]);await a.fp.change([row.id],{enabled:false});
 const b=profile(store,'B',[row]);await b.fp.refs();await b.fp.merge([row]);assert.equal((await a.fp.refs())[0].enabled,false);
 const restart=profile(new FingerprintStore(store.file),'B',[row]);assert.equal((await restart.fp.refs())[0].enabled,false);await b.fp.change([row.id],{enabled:true});assert.equal((await a.fp.refs())[0].enabled,true);
});
test('global deletion is not resurrected by unseen profiles, restart or automatic enrollment; explicit import can restore',async t=>{
 const store=await host(t),a=profile(store),row=await a.row();await a.fp.merge([row]);await a.fp.change([row.id],{remove:true});
 const b=profile(store,'B',[row]);assert.equal((await b.fp.refs()).length,0);const repeated=await b.fp.merge([row]);assert.equal(repeated.suppressed,1);assert.equal((await a.fp.refs()).length,0);
 const c=profile(new FingerprintStore(store.file),'C',[row]);assert.equal((await c.fp.refs()).length,0);
 await c.fp.merge([{...row,source:'import:'+('1'.repeat(12)),enabled:false}],c.fp.owner(),{restoreDeleted:true});assert.equal((await c.fp.refs())[0].enabled,false);
});
test('migration receipts and rows commit together and do not replay on reload',async t=>{
 const store=await host(t),a=profile(store),row=await a.row(),p=profile(store,'P',[row]);await p.fp.refs();const before=await store.request('read');assert.equal(Object.keys(before.state.receipts).length,1);
 await profile(new FingerprintStore(store.file),'P',[row]).fp.refs();assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')).revision,before.state.revision);
});
test('conflicting imported and migrated labels quarantine globally; duplicate preserves pending state',async t=>{
 const store=await host(t),a=profile(store),row=await a.row();await a.fp.merge([{...row,enabled:false,source:'import:'+('1'.repeat(12))}]);await profile(store,'B').fp.merge([row]);assert.equal((await a.fp.refs())[0].enabled,false);
 const bad={...row,model:'another-model-8'};await profile(store,'C',[bad]).fp.refs();const refs=await a.fp.refs();assert.equal(refs.length,1);assert.equal(refs[0].conflict,true);assert.equal(refs[0].enabled,false);await a.fp.change([row.id],{enabled:true});assert.equal((await a.fp.refs())[0].enabled,false);
});
test('exact duplicates merge legacy cohorts conservatively without increasing independent votes',async t=>{
 const store=await host(t),a=profile(store),row=await a.row(),other=await a.row(1,{group:'b'.repeat(64)});await a.fp.merge([row]);await profile(store,'B',[{...row,group:other.group},other]).fp.refs();const rows=await a.fp.refs();assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.group)).size,1);
});
test('client salt unifies the same conversation across profiles and remaps a revisited legacy cohort',async t=>{
 const store=await host(t),a=profile(store),legacy=await a.fp.legacyGroup('private-sid'),row=await a.row(0,{group:legacy}),p=profile(store,'A',[row]),b=profile(store,'B');
 await p.fp.refs();const group=await p.fp.group('private-sid');assert.equal(group,await b.fp.group('private-sid'));assert.equal((await b.fp.refs())[0].group,group);assert.ok(!(await fs.readFile(store.file,'utf8')).includes('private-sid'));
});
test('revision freshness invalidates fitted caches on another account update',async t=>{
 const store=await host(t),a=profile(store),b=profile(store,'B');await a.fp.refs();a.fp.banks=new Map([['stale',{}]]);const g=a.fp.generation;await b.fp.merge([await b.row()]);await a.fp.refs();assert.ok(a.fp.generation>g);assert.equal(a.fp.banks.size,0);
});
test('native bridge failure does not silently create an isolated browser library',async t=>{
 const a=profile(await host(t));a.Host.fingerprintStore=null;await assert.rejects(()=>a.fp.refs(),/桥接/);assert.equal(a.fp.opening,undefined);
 a.Host.fingerprintStore=async()=>({error:'disk failed'});await assert.rejects(()=>a.fp.refs(),/disk failed/);
});
test('switching account during migration cancels writes',async t=>{
 const store=await host(t),a=profile(store);a.fp.all=async()=>{a.UI.host.account.id='B';return [await a.row()];};await assert.rejects(()=>a.fp.refs(),/账号已变化/);assert.equal((await store.request('read')).state.rows.length,0);
});
test('atomic persistence failure preserves acknowledged state and allows retry',async t=>{
 const store=await host(t),a=profile(store);await a.fp.merge([await a.row()]);const before=await fs.readFile(store.file,'utf8');store.io={...fs,rename:async()=>{throw Error('disk full');}};
 const row=await a.row(1);await assert.rejects(()=>a.fp.merge([row]),/disk full/);assert.equal(await fs.readFile(store.file,'utf8'),before);assert.equal((await store.request('read')).state.rows.length,1);store.io=fs;await a.fp.merge([row]);assert.equal((await a.fp.refs()).length,2);
});
test('corrupt existing shared file is never reset to an empty library',async t=>{
 const store=await host(t);await fs.writeFile(store.file,'{broken');await assert.rejects(()=>store.request('read'),/原文件保留/);assert.equal(await fs.readFile(store.file,'utf8'),'{broken');
});
test('host format rejects private/unknown fields, invalid data and cyclic aliases',async t=>{
 const a=profile(await host(t)),row=await a.row(),body={rows:[row],receipts:{},aliases:{}};S.body(body);
 for(const mutate of [x=>x.owner='account',x=>x.rows[0].token='secret',x=>x.rows[0].outputs[0][0]=999,x=>x.rows[0].enabled='yes',x=>x.rows.push(x.rows[0]),x=>x.aliases['a'.repeat(64)]='a'.repeat(64),x=>x.receipts['not-hash']=true]){const x=structuredClone(body);mutate(x);assert.throws(()=>S.body(x));}
});
