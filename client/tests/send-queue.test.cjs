const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../ui',n+'.js'),'utf8');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function setup(){
  let id=0,time=100000,timerId=0;const timers=new Map(),stored=[],toasts=[],backups=[],c=vm.createContext({console,Blob,URL,structuredClone,Map,Set,Promise,
    now:()=>time,uuid7:()=> 'id-'+(++id),describe:e=>e.message||String(e),toast:(...x)=>toasts.push(x),navigator:{onLine:true},document:{hidden:false,addEventListener(){},querySelectorAll:()=>[]},addEventListener(){},
    setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:i=>timers.delete(i),setInterval:(f,ms)=>{timers.set(++timerId,{f,ms,interval:true});return timerId;},clearInterval:i=>timers.delete(i),
    NetPolicy:{deadline:f=>f()},Fingerprint:{command:()=>({handled:false}),isRunning:c=>!!c.fpRunning},Hitl:{pending:c=>c.pending||[],idleWait:()=>false},
    UI:{authed:true,me:{id:'u'},host:{account:{id:'account'}},atts:new Map()},Tabs:{list:[],save(){}},Host:{shared:async(k,v)=>{backups.push(structuredClone(v));}},
    Store:{get:()=>null,set:(k,v)=>{if(v?.o)stored.push(structuredClone(v));return true;}},Uploads:{webPath:h=>'/cas/'+h,meta:f=>({uploads:f})},
    Bus:{emit(){}},MsgCache:{put(){},get:async()=>null},Recaptcha:{take:async()=>null},sleep:async()=>{},IPRep:{note(){}},
    Workspace:{latest:async()=>({node:'n'}),cache:new Map()},api:async()=>({messages:[],pagination:{hasMore:false}}),jwt:()=>({exp:9999999999}),OUT:()=>'',rawFetch:async()=>{},ORIGIN:'https://arena.ai',currentTimezone:()=> 'Asia/Tokyo',VISIT:'fixture',
  });
  const v=read('view'),start=v.indexOf('const Drafts ='),end=v.indexOf("\naddEventListener('visibilitychange'",start);vm.runInContext(v.slice(start,end)+';this.D=Drafts;',c);
  const core=read('core'),a=core.indexOf('class Chat {'),b=core.indexOf('// ---------- 多设备',a);vm.runInContext(core.slice(a,b)+';this.C=Chat; const Chats=new Map();this.chats=Chats;const chatOf=sid=>Chats.get(sid)||(Chats.set(sid,new Chat(sid)),Chats.get(sid));',c);
  vm.runInContext(read('send-queue')+';this.Q=SendQ;',c);
  const chat=(sid='s')=>{const ch=new c.C(sid);c.chats.set(sid,ch);ch.loaded=true;ch.emit=()=>{c.D.onChat(ch);c.Q.check(ch);};ch.ensureToken=async()=>null;ch.drain=async()=>null;ch.peekTurn=async()=>({taken:false,busy:false});ch.settle=async()=>{};ch.armLost=()=>{};ch.restream=()=>{};ch.append=async body=>{ch.posted=(ch.posted||[]).concat(body);return{seq:1};};return ch;};
  return{c,Q:c.Q,D:c.D,chat,stored,toasts,timers,backups,setTime:t=>time=t};
}
test('manual flush honours loaded/busy/fingerprint/HITL/stop guards without consuming items',async()=>{for(const patch of [{loaded:false},{loading:Promise.resolve()},{status:'streaming'},{status:'submitted'},{fpLocked:true},{fpRunning:true},{gacha:{}},{stopReq:true},{preSend:true},{pending:[{}]}]){const h=setup(),c=h.chat();h.Q.add(c,'keep');Object.assign(c,patch);assert.equal(await h.Q.flush(c,{manual:true}),false);assert.equal(c.queue[0].text,'keep');assert.equal(c.posted,undefined);}});
test('pre-handoff command rejection preserves queue content and pauses retries',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'keep');h.c.Fingerprint.command=()=>({handled:true,accepted:false,error:'locked'});assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.equal(h.D.load().o.length,0);assert.match(c._qPaused,/locked/);assert.equal(c._qBusy,false);});
test('a command that handles input without preparing a message cannot silently eat the queue',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'keep');h.c.Fingerprint.command=()=>({handled:true,accepted:true});assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.match(c._qPaused,/未进入/);});
test('double flush is single flight and queue stays present during a pending upload',async()=>{const h=setup(),c=h.chat(),d=defer(),a={name:'a.png',state:'up',p:d.promise};h.Q.add(c,'a',[a]);const first=h.Q.flush(c);assert.equal(c.queue.length,1);assert.equal(c._qBusy,true);assert.equal(await h.Q.flush(c,{manual:true}),false);d.resolve({key:'file'});assert.equal(await first,true);assert.equal(c.posted.length,1);assert.equal(c.queue.length,0);});
test('batch merge keeps text/attachment order and atomically persists the outbox handoff',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'first',[{name:'a',state:'ok',res:{key:'a'},subs:new Set()}]);h.Q.add(c,'second',[{name:'b',state:'ok',res:{key:'b'},subs:new Set()}]);h.c.Workspace={latest:async()=>({node:'n'}),cache:new Map()};assert.equal(await h.Q.flush(c),true);assert.equal(c.posted[0].payload.message.parts[0].text,'first\nsecond');assert.deepEqual(Array.from(c.posted[0].payload.message.metadata.uploads,x=>x.key),['a','b']);const saved=h.stored.find(x=>x.o.length);assert.equal(saved.q.s.items.length,0);assert.equal(saved.o[0].queueIds.length,2);assert.equal(c.queue.length,0);});
test('network error after handoff does not requeue an ambiguous POST',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'once');c.append=async()=>{throw new TypeError('network gone');};assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,0);assert.equal(h.D.load().o.length,1);assert.equal(c.messages[0].failed,true);assert.equal(c.messages[0].deliveryUnknown,true);h.Q.add(c,'next');assert.equal(h.Q.ready(c),false);assert.equal(await h.Q.flush(c,{manual:true}),false);});
test('new additions during handoff stay queued and scheduling resumes after unlocking',async()=>{const h=setup(),c=h.chat(),d=defer();h.Q.add(c,'first');c.append=()=>d.promise;const first=h.Q.flush(c);await flush();h.Q.add(c,'second');d.resolve({seq:2});await first;assert.equal(c.queue.length,1);assert.equal(c.queue[0].text,'second');h.D.ack(c.awaitId);c.awaitId=null;c.status='idle';c.emit();assert.ok(c._qT);});
test('removal during pending upload cancels that snapshot, not newer additions',async()=>{const h=setup(),c=h.chat(),d=defer();h.Q.add(c,'cancel',[{name:'a',state:'up',p:d.promise}]);const first=h.Q.flush(c);h.Q.clear(c);h.Q.add(c,'new');d.resolve({key:'a'});assert.equal(await first,false);assert.equal(c.posted,undefined);assert.equal(c.queue[0].text,'new');assert.ok(c._qT);});
test('failed upload is retained and never converted into a text-only send',async()=>{for(const a of [{name:'a',state:'bad'},{name:'a',state:'up',p:Promise.resolve(null)},{name:'a',state:'up'}]){const h=setup(),c=h.chat();h.Q.add(c,'attachment',[a]);assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.equal(c.posted,undefined);assert.match(c._qPaused,/附件/);}});
test('restart preserves unfinished attachment intent and requires reattachment',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'pending',[{name:'原件.pdf',size:40,state:'up',p:new Promise(()=>{})}]);const d=structuredClone(h.D.load());h.D.d=d;const again=h.chat();h.D.hydrateQ(again);assert.equal(again.queue[0].atts[0].state,'bad');assert.equal(again.queue[0].atts[0].name,'原件.pdf');assert.equal(await h.Q.flush(again),false);});
test('same-length edits and same timestamps cannot collide in queue persistence',()=>{const h=setup(),c=h.chat();h.Q.add(c,'aa');h.Q.add(c,'bb');assert.notEqual(c.queue[0].id,c.queue[1].id);const a=h.D.qsig(c);c.queue[0].text='cc';c.emit();assert.notEqual(h.D.qsig(c),a);assert.equal(h.D.load().q.s.items[0].text,'cc');});
test('stale host queue copies already claimed by an outbox are not hydrated twice',()=>{const h=setup();h.D.d={t:{},q:{s:{items:[{id:'claimed',text:'old'},{id:'new',text:'new'}]}},o:[{sid:'s',id:'out',queueIds:['claimed']}]};const c=h.chat();h.D.hydrateQ(c);assert.deepEqual(Array.from(c.queue,x=>x.text),['new']);});
test('foreign live response is not proof that this queued input was accepted',()=>{const h=setup(),c=h.chat();h.D.load().o.push({sid:'s',id:'mine'});c.awaitId='mine';c.live={id:'foreign'};c.turnInput='foreign-input';c.dlv='taken';h.D.check(c);assert.equal(h.D.load().o.length,1);c.turnInput='mine';h.D.check(c);assert.equal(h.D.load().o.length,0);});
test('unresolved outbox blocks both automatic and manual later sends',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'later');h.c.api=async()=>{throw new TypeError('offline');};h.D.load().o.push({sid:'s',id:'pending',at:100000});assert.equal(h.Q.ready(c),false);assert.equal(await h.Q.flush(c,{manual:true}),false);assert.equal(c.queue.length,1);});
test('storage failure keeps input ownership instead of clearing an unsaved queue',async()=>{const h=setup(),c=h.chat();h.c.Store.set=()=>false;assert.equal(h.Q.add(c,'draft'),false);assert.equal(c.queue.length,0);h.c.Store.set=()=>true;h.Q.add(c,'saved');h.c.Store.set=()=>false;assert.equal(await h.Q.flush(c),false);assert.equal(c.queue[0].text,'saved');assert.equal(c.messages.length,0);});
test('paused/error/fake-end queues never auto-flush but valid manual sends may continue',async()=>{for(const patch of [{_qPaused:'paused'},{error:'error'},{status:'error'},{fakeEnd:{}},{_ka:{plan:{}}}]){const h=setup(),c=h.chat();h.Q.add(c,'safe');Object.assign(c,patch);assert.equal(h.Q.ready(c),false);assert.equal(await h.Q.flush(c,{manual:true}),true);}});
test('explicit retry retains the original message ID and leaves exactly one outbox entry',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'one');const original=c.append;c.append=async()=>{throw Object.assign(Error('rejected'),{status:403});};await h.Q.flush(c);const msg=c.messages[0];c.append=original;await c.send('one',{retryOf:msg});assert.equal(c.messages.length,1);assert.equal(c.posted[0].payload.message.id,msg.id);assert.equal(h.D.load().o.length,1);assert.equal(c.messages[0].failed,false);});
test('paginated absence is unknown, never proof for replaying an old input',async()=>{const h=setup(),c=h.chat();h.c.api=async()=>({messages:[],pagination:{hasMore:true}});assert.equal(await c.inDb('old'),null);h.c.api=async()=>({messages:[{id:'old'}],pagination:{hasMore:true}});assert.equal(await c.inDb('old'),true);});
test('server load does not mistake a failed local input for a running server turn',async()=>{const h=setup(),c=h.chat();c.messages=[{id:'local',role:'user',failed:true,_local:true}];c.loaded=false;c.stream=()=>{};h.c.api=async()=>({messages:[{id:'a',role:'assistant',metadata:{pending:false}}],pagination:{hasMore:false}});await c.load(true);assert.equal(c.status,'idle');assert.equal(c.messages.at(-1).id,'local');});
test('a verified absent old handoff is restored at the queue front, paused for explicit review',()=>{const h=setup(),c=h.chat();h.Q.add(c,'later');const old={sid:'s',id:'absent',text:'earlier',atts:[],at:1};h.D.load().o.push(old);h.D.restore(old);assert.deepEqual(Array.from(c.queue,x=>x.text),['earlier','later']);assert.equal(h.D.load().o.length,0);assert.equal(h.Q.ready(c),false);assert.match(c._qPaused,/核对/);});
test('read-only receipt check can resolve an ambiguous failed message without replay',async()=>{const h=setup(),c=h.chat();const m={id:'mine',_local:true,failed:true,deliveryUnknown:true};c.messages=[m];h.D.load().o.push({sid:'s',id:'mine',at:1});c.inDb=async()=>true;h.D.check(c);await flush();assert.equal(h.D.load().o.length,0);assert.equal(m.deliveryUnknown,false);assert.equal(m.failed,false);assert.equal(c.posted,undefined);});
test('host backups serialize immutable snapshots so late writes cannot resurrect old queue state',async()=>{const h=setup(),c=h.chat(),d=defer(),calls=[];h.c.Host.shared=async(_k,v)=>{calls.push(v);if(calls.length===1)await d.promise;};h.Q.add(c,'one');await flush();h.Q.add(c,'two');await flush();assert.equal(calls.length,1);assert.equal(calls[0].q.s.items.length,1);d.resolve();await flush();assert.equal(calls.at(-1).q.s.items.length,2);});
test('automatic scheduling waits for verified account startup and recovers after unlock',()=>{const h=setup(),c=h.chat();h.c.UI.authed=false;h.Q.add(c,'one');assert.equal(c._qT,undefined);h.c.UI.authed=true;c.fpLocked=true;h.Q.check(c);assert.equal(c._qT,undefined);c.fpLocked=false;h.Q.check(c);assert.ok(c._qT);});

test('draft persistence is namespaced per host account, including legacy migration ownership',()=>{const h=setup(),store=new Map([['drafts',{t:{},q:{s:{items:[{id:'old',text:'legacy'}]}},o:[]}]]);h.c.Store.get=(k,d)=>store.has(k)?structuredClone(store.get(k)):d;h.c.Store.set=(k,v)=>(store.set(k,structuredClone(v)),true);const a=h.chat();h.D.hydrateQ(a);assert.equal(a.queue[0].text,'legacy');h.D.write(true);assert.ok(store.has('drafts@account'));h.c.UI.host.account.id='other';assert.equal(Object.keys(h.D.load().q).length,0);h.D.write(true);assert.ok(store.has('drafts@other'));h.c.UI.host.account.id='account';assert.equal(h.D.load().q.s.items[0].text,'legacy');});
test('queued lost-receipt recovery wakes the server with stop only when peek and history are both idle, and never replays the message',async()=>{const h=setup(),c=h.chat(),m={id:'mine',role:'user',_local:true,_queued:true};c.messages=[m];c.status='submitted';c.awaitId=m.id;c.baseSeq='1';c.peekTurn=async()=>({busy:false,taken:false,n:0});c.inDb=async()=>false;c.stream=()=>{};c.armLost=h.c.C.prototype.armLost.bind(c);c.armLost(m);let at=100000;for(let n=0;n<20&&c.status!=='error';n++){const timer=h.timers.get(c.lostT);assert.ok(timer);h.timers.delete(c.lostT);at+=timer.ms;h.setTime(at);await timer.f();await flush();}assert.equal(c.status,'error');assert.equal(m.deliveryUnknown,true);assert.ok(c.posted?.length>0&&c.posted.every(b=>b.kind==='stop'));assert.match(c.error,/不要直接重发/);});

test('ordinary send also retains the draft on storage failure and never posts',async()=>{const h=setup(),c=h.chat();h.c.Store.set=()=>false;let prepared=false;await assert.rejects(c.send('keep',{onPrepared:()=>prepared=true}),/本地保存失败/);assert.equal(prepared,false);assert.equal(c.messages.length,0);assert.equal(c.posted,undefined);});
test('retry outbox keeps attachments even when only persisted upload metadata is available',()=>{const h=setup(),c=h.chat(),msg={id:'same',metadata:{uploads:[{key:'uploaded',filename:'图.pdf',mediaType:'application/pdf'}]}};h.D.load().o.push({sid:'s',id:'same',queueIds:['original']});h.D.out(c,msg,'retry',{files:msg.metadata.uploads});assert.equal(h.D.load().o[0].atts[0].key,'uploaded');assert.equal(h.D.load().o[0].queueIds[0],'original');});
test('unsent direct attachment intent survives outbox recovery as a visible reattach requirement',()=>{const h=setup(),c=h.chat();const p=new Promise(()=>{});h.D.out(c,{id:'pending'},'see attached',{previews:[{name:'upload.pdf',state:'up',p}]});const e=h.D.load().o[0];assert.equal(e.missing[0].name,'upload.pdf');h.D.restore(e);const tab={key:'tab',sid:'s',draft:''};h.D.intoTab(tab);assert.equal(h.c.UI.atts.get('tab')[0].state,'bad');assert.equal(h.c.UI.atts.get('tab')[0].name,'upload.pdf');});

test('an armed automatic queue cannot send after the account becomes unverified',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'private');const timer=h.timers.get(c._qT);h.c.UI.authed=false;h.c.UI.me=null;await timer.f();await flush();assert.equal(c.posted,undefined);assert.equal(c.queue.length,1);});
test('prepared-notification failure becomes a recoverable failed message, not a stuck busy state',async()=>{const h=setup(),c=h.chat();await assert.rejects(c.send('saved',{onPrepared:()=>{throw Error('UI callback failed');}}),/callback/);assert.equal(c.status,'error');assert.equal(c.messages.length,1);assert.equal(h.D.load().o.length,1);assert.equal(c.messages[0].deliveryUnknown,false);assert.equal(c.posted,undefined);});

test('rejected queue admission cannot reappear from memory or any host backup snapshot',async()=>{const h=setup(),c=h.chat();h.c.Store.set=()=>false;assert.equal(h.Q.add(c,'rejected'),false);assert.equal(c.queue.length,0);assert.equal(h.D.load().q.s?.items?.length||0,0);await h.D.push();assert.ok(h.backups.every(d=>!(d.q.s?.items||[]).some(i=>i.text==='rejected')));const resumed=h.chat();h.D.hydrateQ(resumed);assert.equal(resumed.queue.length,0);});
test('a rejected addition preserves previously committed queue items without publishing the new one',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'accepted');const previous=structuredClone(h.D.load().q.s);h.c.Store.set=()=>false;assert.equal(h.Q.add(c,'rejected'),false);assert.equal(JSON.stringify(h.D.load().q.s),JSON.stringify(previous));await h.D.push();assert.ok(h.backups.every(d=>!(d.q.s?.items||[]).some(i=>i.text==='rejected')));assert.equal(c.queue[0].text,'accepted');});
test('failed outbox preparation never reaches the host as a committed handoff',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'accepted');h.c.Store.set=()=>false;assert.equal(await h.Q.flush(c),false);await h.D.push();assert.ok(h.backups.every(d=>d.o.length===0));assert.ok(h.backups.every(d=>(d.q.s?.items||[]).every(i=>i.text==='accepted')));});
test('same-clock host queue tombstones supersede old local copies after a failed local clear',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'clear me');const local=structuredClone(h.D.load());h.c.Store.set=()=>false;h.Q.clear(c);await h.D.push();const backup=h.backups.at(-1);assert.equal(backup.q.s.items.length,0);assert.ok(backup.q.s.at>local.q.s.at);h.D.d=local;h.D.ready=false;h.c.Host.shared=async()=>backup;await h.D.pull();const resumed=h.chat();h.D.hydrateQ(resumed);assert.equal(resumed.queue.length,0);});

test('queue flush is held while the server snapshot shows a pending reply, and keeps the item',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'wait');h.c.api=async()=>({messages:[{id:'a',role:'assistant',metadata:{pending:true},parts:[]}],pagination:{hasMore:false}});c.reload=async()=>{};assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.equal(c.posted,undefined);assert.equal(c._qPaused,'');assert.equal(h.Q.ready(c),false);});
test('queue flush is held while the realtime channel shows a running turn',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'wait');c.peekTurn=async()=>({busy:true,taken:false});c.reload=async()=>{};assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.equal(c.posted,undefined);});
test('queue flush never sends when the server state cannot be read',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'wait');h.c.api=async()=>{throw Error('net');};assert.equal(await h.Q.flush(c),false);assert.equal(c.queue.length,1);assert.equal(c.posted,undefined);});
test('follow-up send escalates a repeated-prompt 429 to reCAPTCHA v2 and resends the same message once',async()=>{
  const h=setup(),c=h.chat(),core=read('core'),a=core.indexOf('function promptFailed(status, body) {');
  vm.runInContext(core.slice(a,core.indexOf('// 抽卡：create-chat'))+';',h.c);
  h.c.Recaptcha.v2=async()=> 'V2TOK';let n=0;const bodies=[];
  c.append=async body=>{bodies.push(body);if(++n===1)throw Object.assign(new Error('429'),{status:429,body:'{"error":"prompt failed"}'});return{seq:1};};
  await c.send('same again');
  assert.equal(bodies.length,2);assert.equal(bodies[0].payload.message.id,bodies[1].payload.message.id);
  assert.equal(bodies[1].payload.metadata.recaptchaV2Token,'V2TOK');assert.equal(bodies[1].payload.metadata.recaptchaV3Token,null);
  assert.equal(c.messages.filter(m=>m.role==='user').length,1);
});
test('an interactive-card answer is never held by the "another turn is still running" wait, and skips replaying the old turn',async()=>{
  const h=setup(),c=h.chat();let waited=0,body=null;
  // the turn that is waiting for the user has no turn-complete, so drain reports it as a running turn
  c.drain=async()=>({run:true,runSeq:5,open:true,max:9});
  c.waitForeign=async()=>{waited++;throw new Error('这条没有发送，可以点重试');};
  c.append=async b=>{body=b;return{seq:10};};
  const parts=[{type:'data-tool-results',data:[{toolCallId:'t',output:{answers:[]}}]}];
  await c.send('',{parts,hitl:true});
  assert.equal(waited,0);assert.ok(body,'append was called');assert.equal(c.lastSeq==null?null:String(c.fence),'9');
  // a normal message in the same situation still waits for the running turn
  const c2=h.chat('s2');c2.drain=async()=>({run:true,runSeq:5,open:true,max:9});c2.waitForeign=async()=>{waited++;throw new Error('held');};
  await assert.rejects(c2.send('hello'),/held/);assert.equal(waited,1);
});

test('inDb treats a server user message with identical text as delivered under another id',async()=>{const h=setup(),c=h.chat();h.c.api=async()=>({messages:[{id:'srv',role:'user',parts:[{type:'text',text:' earlier '}]}],pagination:{hasMore:false}});assert.equal(await c.inDb('pending','earlier'),true);assert.equal(await c.inDb('pending','other'),false);});
test('manual send re-verifies a stuck outbox immediately and then sends',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'later');h.D.load().o.push({sid:'s',id:'pending',text:'earlier',at:100000});c.inDb=async()=>true;await h.Q.flush(c,{manual:true});assert.equal(h.D.load().o.some(x=>x.id==='pending'),false);assert.equal(c.queue.length,0);});
test('verified absent local message is marked failed instead of blocking the queue forever',async()=>{const h=setup(),c=h.chat();const m={id:'mine',role:'user',_local:true};c.messages=[m];h.D.load().o.push({sid:'s',id:'mine',text:'x',at:1});h.Q.add(c,'later');assert.equal(await h.D.verify(c),true);assert.equal(m.failed,true);assert.equal(h.D.load().o.length,0);});
test('verified absent old handoff is restored and the same click does not send it',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'later');h.D.load().o.push({sid:'s',id:'gone',text:'earlier',at:1});assert.equal(await h.Q.flush(c,{manual:true}),false);assert.deepEqual(Array.from(c.queue,x=>x.text),['earlier','later']);assert.ok(c._qPaused);});
test('inDb: a page already older than the send is proof of absence; a later user message or reflowed text is delivery',async()=>{const h=setup(),c=h.chat(),at=Date.parse('2026-10-08T10:00:00Z');
  h.c.api=async()=>({messages:[{id:'a',role:'assistant',createdAt:'2026-10-08T09:00:00Z',parts:[]}],pagination:{hasMore:true}});assert.equal(await c.inDb('x','hello',at),false);
  h.c.api=async()=>({messages:[{id:'u2',role:'user',createdAt:'2026-10-08T10:00:02Z',parts:[{type:'text',text:'other'}]}],pagination:{hasMore:true}});assert.equal(await c.inDb('x','hello',at),true);
  h.c.api=async()=>({messages:[{id:'u3',role:'user',parts:[{type:'text',text:'line one\n\nline   two'}]}],pagination:{hasMore:true}});assert.equal(await c.inDb('x','line one line two'),true);});
test('manual send is not blocked forever by an outbox entry whose receipt stays unknown',async()=>{const h=setup(),c=h.chat();h.Q.add(c,'later');h.D.load().o.push({sid:'s',id:'pending',text:'earlier',at:100000});c.inDb=async()=>null;assert.equal(await h.Q.flush(c,{manual:true}),true);assert.equal(c.posted.length,1);assert.equal(c.posted[0].payload.message.parts[0].text,'later');});
test('reproduction: accepted queued input with a server-side id/text mismatch on a long chat no longer blocks the queue after the turn ends',async()=>{
  const h=setup(),c=h.chat();
  h.Q.add(c,'first');assert.equal(await h.Q.flush(c),true);h.c.api=async()=>({messages:[{id:'srv-other',role:'user',parts:[{type:'text',text:'(server copy)'}]}],pagination:{hasMore:true}});const e=h.D.load().o[0];assert.ok(e&&e.acc,'POST success marks the outbox entry accepted');
  h.Q.add(c,'second');
  // the turn runs, the dispatch never names our id, then it ends
  h.setTime(200000);c.status='idle';c.awaitId=null;c.live=null;c.tcAt=200000;
  assert.equal(await c.inDb(e.id,'first'),null,'history lookup alone stays unknown (the old stuck state)');
  h.D.check(c);assert.equal(h.D.load().o.length,0,'outbox entry cleared once a turn completed after acceptance');
  assert.equal(h.Q.blocked(c,true),'');});
test('an accepted entry is not cleared before any turn has completed after it',()=>{const h=setup(),c=h.chat();h.D.load().o.push({sid:'s',id:'x',text:'t',at:100000,acc:150000});c.tcAt=120000;c.status='idle';h.D.check(c);assert.equal(h.D.load().o.length,1);});
test('turn 2+ completion updates endAt/tcAt, clears outbox via completed assistant reply, and schedules post-turn auto-flush timer',async()=>{
  const h=setup(),c=h.chat();
  // Simulate turn 1 having finished earlier at t = 100000
  c.tcAt=100000;c.endAt=100000;
  // User sends turn 2 at t = 150000 and queues 2 follow-ups while turn 2 runs
  h.setTime(150000);
  h.D.load().o.push({sid:'s',id:'u-turn2',text:'turn 2 input',at:150000});
  h.Q.add(c,'queued item 1');
  h.Q.add(c,'queued item 2');
  // Turn 2 finishes at t = 200000 with an assistant reply in c.messages
  h.setTime(200000);
  c.status='idle';c.awaitId=null;c.live=null;c.endAt=200000;
  c.messages=[{id:'a-turn2',role:'assistant',status:'completed',createdAt:new Date(200000).toISOString(),parts:[{type:'text',text:'done'}]}];
  // Call SendQ.check(c) inside the 2200ms post-turn window (t = 200500)
  h.setTime(200500);
  c.tcAt=200000;
  h.Q.check(c);
  assert.equal(h.D.load().o.length,0,'outbox cleared via endAt + completed assistant reply');
  assert.ok(c._qT,'SendQ.check scheduled post-turn timer when inside 2200ms window');
  // Advance past the 2200ms post-turn window and verify auto-flush sends the queued items
  h.setTime(202500);
  assert.equal(await h.Q.flush(c),true);
  assert.equal(c.posted.length,1);
  assert.equal(c.posted[0].payload.message.parts[0].text,'queued item 1\nqueued item 2');
  assert.equal(c.queue.length,0);
});
test('recall restores queued text and attachments into multi-tab textarea and tab draft',()=>{
  const h=setup(),c=h.chat();
  const att={name:'pic.png',mediaType:'image/png',url:'data:image/png;base64,AA=='};
  h.Q.add(c,'撤回回输入框的文字',[att]);
  assert.equal(c.queue.length,1);
  const tab={key:'t-1',sid:c.sid,draft:'已有草稿'};
  const ta={value:'已有草稿',scrollHeight:60,style:{},focused:false,focus(){this.focused=true;},dispatchEvent(){}};
  let savedTabDraft=null;
  h.c.Tabs={list:[tab],cur:tab,save(){}};
  h.c.UI={els:{chat:c},atts:new Map(),paintAtt(){},paintQ(){}};
  h.D.setTab=(t,atts)=>{savedTabDraft={draft:t.draft,atts};};
  h.c.document={
    querySelectorAll:sel=>sel==='textarea[data-tab="t-1"]'?[ta]:[],
    querySelector:()=>ta
  };
  const ok=h.Q.recall(c,c.queue[0]);
  assert.equal(ok,true);
  assert.equal(c.queue.length,0);
  assert.equal(ta.value,'已有草稿\n撤回回输入框的文字');
  assert.equal(tab.draft,'已有草稿\n撤回回输入框的文字');
  assert.equal(ta.focused,true);
  assert.ok(savedTabDraft);
  assert.equal(savedTabDraft.draft,'已有草稿\n撤回回输入框的文字');
  assert.equal(h.c.UI.atts.get('t-1')?.length,1);
});

