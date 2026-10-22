'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createSharedStorage,delta,merge}=require('../src/extension-storage');
const ext={id:'a'.repeat(32)},other={id:'b'.repeat(32)},copy=x=>JSON.parse(JSON.stringify(x));
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shared-storage-test-')),peers=new Map();
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const open=async({session,extensionId,onChange})=>{const p={read:async()=>copy(session.data),replace:async data=>{if(session.fail)throw Error('fixture failure');session.data=copy(data);},close:()=>{session.closed=true;},write(changes){session.data=merge(session.data,changes);onChange(changes);}};peers.set(session,p);return p;};
 const config={root,open};return {root,peers,config,broker:createSharedStorage(config),file:path.join(root,ext.id,'local.json')};
}
test('first nonempty data migrates; other snapshots are backed up before replacement',async t=>{
 const f=await fixture(t),a={data:{}},b={data:{uiSettings:{password:'synthetic'},plainData:{queue:[1]}}},c={data:{uiSettings:{password:'old'}}};
 await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);await f.broker.attach('c',c,ext);assert.deepEqual(a.data,b.data);assert.deepEqual(c.data,b.data);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,ext.id,'migration-backups/c.json'))),{uiSettings:{password:'old'}});await f.broker.close();
});
test('different keys converge, same key uses last received change, removal and clear survive restart',async t=>{
 const f=await fixture(t),a={data:{}},b={data:{}};await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);
 f.peers.get(a).write({one:{newValue:1},same:{newValue:'a'}});f.peers.get(b).write({two:{newValue:2},same:{newValue:'b'}});
 await f.broker.attach('a',a,ext);assert.deepEqual(a.data,{one:1,two:2,same:'b'});assert.deepEqual(a.data,b.data);
 f.peers.get(a).write({one:{},two:{},same:{}});await f.broker.close();assert.deepEqual(b.data,{});
 const next=createSharedStorage(f.config);await next.attach('b',b,ext);await next.attach('a',a,ext);assert.deepEqual(a.data,{});await next.close();
});
test('stale offline replicas do not resurrect deleted keys on reattach',async t=>{
 const f=await fixture(t),a={data:{plainData:'old'}},b={data:{}};await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);await f.broker.detach('b',ext.id);
 f.peers.get(a).write({plainData:{}});await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);assert.deepEqual(b.data,{});await f.broker.close();
});
test('native writes and deletions after a crash are recovered from persisted replica baseline',async t=>{
 const f=await fixture(t),a={data:{one:1,removed:2}};await f.broker.attach('a',a,ext);await f.broker.close();a.data={one:3,added:4};
 const next=createSharedStorage(f.config);await next.attach('a',a,ext);const b={data:{}};await next.attach('b',b,ext);assert.deepEqual(b.data,{one:3,added:4});await next.close();
});
test('extensions remain isolated and special keys do not change object prototypes',async t=>{
 const f=await fixture(t),a={data:JSON.parse('{"__proto__":{"synthetic":true}}')},b={data:{other:true}};await f.broker.attach('a',a,ext);await f.broker.attach('a',b,other);
 f.peers.get(a).write({plainData:{newValue:1}});await f.broker.close();assert.deepEqual(b.data,{other:true});assert.equal({}.synthetic,undefined);assert.equal(a.data.__proto__.synthetic,true);
 assert.deepEqual(delta({a:1},{b:2}),{a:{},b:{newValue:2}});
});
test('corrupt canonical store is preserved and native data is not replaced',async t=>{
 const f=await fixture(t);await fs.mkdir(path.dirname(f.file),{recursive:true});await fs.writeFile(f.file,'broken');const a={data:{safe:true}};
 await assert.rejects(f.broker.attach('a',a,ext),/原文件已保留/);assert.equal(await fs.readFile(f.file,'utf8'),'broken');assert.deepEqual(a.data,{safe:true});
});
test('write failure reports degraded status, preserves native data, and can recover on reattach',async t=>{
 const f=await fixture(t),a={data:{value:1}};await f.broker.attach('a',a,ext);await fs.mkdir(f.file+'.tmp');
 f.peers.get(a).write({value:{newValue:2}});await assert.rejects(f.broker.attach('a',a,ext));assert.equal(a.data.value,2);assert.equal(f.broker.status('a',ext.id).shared,false);
 await fs.rmdir(f.file+'.tmp');await f.broker.attach('a',a,ext);assert.equal(f.broker.status('a',ext.id).shared,true);await f.broker.detach('a',ext.id);await f.broker.close();const next=createSharedStorage(f.config);await next.attach('a',a,ext);assert.equal(a.data.value,2);await next.close();
});
test('a failed peer is visible to all accounts and synchronization can be retried',async t=>{
 const f=await fixture(t),a={data:{}},b={data:{}};await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);b.fail=true;
 f.peers.get(a).write({x:{newValue:1}});await f.broker.attach('a',a,ext);assert.equal(f.broker.status('a',ext.id).shared,false);
 b.fail=false;await f.broker.attach('b',b,ext);assert.equal(b.data.x,1);assert.equal(f.broker.status('b',ext.id).shared,true);await f.broker.close();
});
test('shutdown closes every view even when a native read fails',async t=>{
 const f=await fixture(t),a={data:{}},b={data:{}};await f.broker.attach('a',a,ext);await f.broker.attach('b',b,ext);f.peers.get(a).read=async()=>{throw Error('closed renderer');};await assert.rejects(f.broker.close());assert(a.closed&&b.closed);
});

test('shutdown snapshot initializes canonical data even before its native notification arrives',async t=>{
 const f=await fixture(t),a={data:{}};await f.broker.attach('a',a,ext);a.data={pending:'saved'};await f.broker.close();
 const next=createSharedStorage(f.config),b={data:{legacy:'old'}};await next.attach('b',b,ext);assert.deepEqual(b.data,{pending:'saved'});await next.close();
});

test('ati_captures bloat is trimmed and persisted local.json stores compact boolean replica markers without 10x duplication',async t=>{
 const f=await fixture(t);
 const bigBody='x'.repeat(200000);
 const captures=Array.from({length:95},(_,i)=>({id:'cap-'+i,url:'https://arena.ai/api/test',responseBody:bigBody}));
 const a={data:{ati_captures:captures,ati_usage:{total:42},uiSettings:{theme:'dark'}}};
 const b={data:{}},c={data:{}};
 await f.broker.attach('a',a,ext);
 await f.broker.attach('b',b,ext);
 await f.broker.attach('c',c,ext);
 assert.equal(a.data.ati_captures.length,80,'captures array capped at 80');
 assert.equal(a.data.ati_captures[0].responseBody.length,160000,'oversized capture responseBody string is truncated safely');
 assert.deepEqual(b.data.uiSettings,{theme:'dark'},'effective extension config preserved across accounts');
 assert.deepEqual(c.data.ati_usage,{total:42},'effective usage ledger preserved across accounts');
 const rawDisk=JSON.parse(await fs.readFile(f.file,'utf8'));
 assert.deepEqual(rawDisk.replicas,{a:true,b:true,c:true},'on-disk replicas map stores compact true markers instead of full data deep-copies');
 await f.broker.close();
});

