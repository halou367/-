// Account-private test logs and read-only legacy references. SharedFP brokers client-wide references.
const PersonalFP = {
  schema:'arena-personal-fingerprint-library-v1', cache:new Map(), generation:0,
  owner(){return String(UI.host?.account?.id||'web')+':'+String(UI.me?.id||UI.me?.email||'guest');},
  async digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');},
  db(){
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{const q=indexedDB.open('arena-personal-fingerprint-v1',2);q.onupgradeneeded=()=>{for(const name of ['refs','tests','meta']){const s=q.result.objectStoreNames.contains(name)?q.transaction.objectStore(name):q.result.createObjectStore(name,{keyPath:'key'});if(!s.indexNames.contains('owner'))s.createIndex('owner','owner');if(name==='tests'&&!s.indexNames.contains('byTime'))s.createIndex('byTime',['owner','at','key']);}};q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};q.onerror=()=>reject(q.error||Error('个人库本地存储不可用'));q.onblocked=()=>reject(Error('请关闭旧窗口后重试'));}).catch(e=>{this.opening=null;throw e;});
    return this.opening;
  },
  async all(kind,owner=this.owner()){
    const db=await this.db();return new Promise((resolve,reject)=>{const t=db.transaction(kind,'readonly'),q=t.objectStore(kind).index('owner').getAll(owner);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  },
  async refs(owner=this.owner()){return SharedFP.refs(owner);},
  invalidate(owner){this.cache.delete(owner);this.generation++;this.banks?.clear();try{this.channel?.postMessage({owner});}catch{}try{Bus.emit('personal-bank');}catch{}},
  async group(sid,owner=this.owner()){return SharedFP.group(sid,owner);},
  async legacyGroup(sid,owner=this.owner()){
    const db=await this.db();const salt=await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),s=t.objectStore('meta'),key=owner+'|salt';let value;const q=s.get(key);q.onsuccess=()=>{value=q.result?.value||crypto.randomUUID();if(!q.result)s.put({key,owner,value});};t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error);});
    return this.digest(salt+'|'+sid);
  },
  async normalize(raw,enabled=false,source='import'){
    const row=PersonalMath.validate(raw);
    const outputs=row.outputs.map((numbers,i)=>({text:numbers.join(','),challenge_id:ProbeLib.PROBES[i].id,expected_count:ProbeLib.PROBES[i].expected_count}));
    const prepared=ProbeLib.prepareOutputs(outputs);if(prepared.checks.some(c=>c.level!=='ok')||prepared.usable.length!==3)throw Error('重复、截断或异常数字不能入库');
    for(let i=0;i<3;i++)if(ProbeOutputGuard.inspect(outputs[i].text,outputs[i].expected_count,false))throw Error('异常数字输出不能入库');
    const id=await this.digest(row.protocol+'|'+JSON.stringify(row.outputs));
    return {...row,id,enabled:!!enabled,source,conflict:false};
  },
  async merge(incoming,owner=this.owner(),options){return SharedFP.merge(incoming,owner,options);},
  async change(ids,options={},owner=this.owner()){return SharedFP.change(ids,options,owner);},
  async log(row,owner=this.owner()){
    const db=await this.db();await new Promise((resolve,reject)=>{const t=db.transaction('tests','readwrite');t.objectStore('tests').put({...row,at:Date.now(),key:owner+'|'+crypto.randomUUID(),owner});t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('记录保存失败'));});Bus.emit('personal-bank');
  },
  async testPage(owner=this.owner(),page=0,query=''){
    const db=await this.db();return new Promise((resolve,reject)=>{const t=db.transaction('tests','readonly'),index=t.objectStore('tests').index('byTime'),range=IDBKeyRange.bound([owner,0,''],[owner,Number.MAX_SAFE_INTEGER,'\uffff']),q=index.openCursor(range,'prev');let total=0,advanced=false;const rows=[];
      if(!query){const count=index.count(range);count.onsuccess=()=>{total=count.result;};}
      q.onsuccess=()=>{const c=q.result;if(!c)return;if(!query){if(!advanced&&page){advanced=true;c.advance(page*30);return;}rows.push(c.value);if(rows.length<30)c.continue();return;}const r=c.value;if(String(r.model).toLowerCase().includes(query)){if(total>=page*30&&rows.length<30)rows.push(r);total++;}c.continue();};t.oncomplete=()=>resolve({rows,total});t.onerror=t.onabort=()=>reject(t.error||Error('记录读取失败'));});
  },
  readIdentity(source){
    if(!source||source.guess||source.reverseInferred||source.habitInferred||source.userCorrected||source.billingProbe||source.fromTitle||source.routed||source.changed||source.routing||source.outcome)return null;
    if(new Set((source.internalNames||[]).map(n=>{const p=Strength.parts(n);return PersonalMath.idOf(p.family+(p.tier&&!PersonalMath.tiers.includes(p.tier)?'-'+p.tier:''));})).size>1)return null;
    const billed=source.internal&&(source.records||[]).some(r=>['usage','spend'].includes(r.kind)&&r.internal===source.internal);
    if(!source.response&&!(source.internal&&(Brand.of(source.internal)||billed)))return null;
    const label=Strength.compose({response:source.response,internal:source.internal}),parts=Strength.parts(label),model=PersonalMath.idOf(parts.family+(parts.tier&&!PersonalMath.tiers.includes(parts.tier)?'-'+parts.tier:''));
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,159}$/.test(model)||!/[0-9]/.test(model)||/unknown|auto|compatible/i.test(model))return null;
    const a=source.response?PersonalMath.idOf(Strength.parts(source.response).family):null,b=source.internal&&Brand.of(source.internal)?PersonalMath.idOf(Strength.parts(source.internal).family):null;
    if(a&&b&&a!==b&&!(a.startsWith(b+'-')||b.startsWith(a+'-')))return null;
    const tiers=[...new Set([source.tier,Strength.parts(source.internal||'').tier,Strength.parts(source.response||'').tier,...(source.calls||[]).map(c=>c.effort)].filter(x=>PersonalMath.tiers.includes(x)))];
    return {model,tier:tiers.length===1?tiers[0]:null};
  },
  identity(chat){
    const t=Trace.latest(chat.sid);return (t?.done?this.readIdentity(t):null)||this.readIdentity(Models.get(chat.sid));
  },
  binding(chat,probe,answer){
    const messages=chat.messages||[],index=messages.findIndex(m=>m.role==='assistant'&&m.id===answer?.id);
    if(index<0)return {local:false,complete:false};
    let user=index-1;while(user>=0&&messages[user].role!=='user')user--;
    const text=m=>(m?.parts||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('\n').trim();
    const local=user>=0&&text(messages[user])===probe.prompt&&messages.slice(user+1,index+1).filter(m=>m.role==='assistant').length===1;
    const m=messages[index],complete=local&&m.metadata?.pending!==true&&!m.metadata?.aborted&&!(m.parts||[]).some(p=>p.toolCallId||/tool|refusal|error/i.test(p.type||''));
    const completedAt=m.metadata?.timing?.completedAt||Date.parse(m.createdAt||m.created_at||'')||null;
    return {local,complete,completedAt};
  },
  matchTurn(chat,probe,answer,sentAt,capture={}){
    const turns=Trace.turns(chat.sid)||[],binding=this.binding(chat,probe,answer);
    const promptOK=t=>t.prompt?.trim()===probe.prompt||(t.calls||[]).some(c=>c.probeId===probe.id);
    const exact=turns.filter(t=>(binding.local||promptOK(t))&&(t.records||[]).some(r=>r.messageId&&r.messageId===answer?.id));
    if(exact.length)return exact.length===1?{turn:exact[0],by:'assistant-message-id',binding}:{code:'ambiguous_turn'};
    const candidates=turns.filter(promptOK);
    const noWrongId=t=>!(t.records||[]).some(r=>r.messageId&&r.messageId!==answer?.id);
    const end=capture.completedAt||binding.completedAt,runIds=capture.runId?[capture.runId]:(capture.runIds||[]);
    // Same run + exact provider-request challenge + bounded local send/finish interval handles queued runs.
    const scoped=runIds.length&&binding.local&&Number.isFinite(sentAt)&&Number.isFinite(end)?candidates.filter(t=>runIds.includes(t.runId)&&t.at>=sentAt-5000&&t.at<=end+5000&&noWrongId(t)):[];
    if(scoped.length)return scoped.length===1?{turn:scoped[0],by:'run-and-probe-window',binding}:{code:'ambiguous_turn'};
    const nearby=candidates.filter(t=>Number.isFinite(sentAt)&&Number.isFinite(t.at)&&Math.abs(t.at-sentAt)<5000&&noWrongId(t));
    if(nearby.length)return nearby.length===1?{turn:nearby[0],by:'exact-probe-time',binding}:{code:'ambiguous_turn'};
    return {code:!turns.length?'trace_missing':!candidates.length?'probe_unassociated':'message_or_time_mismatch'};
  },
  turn(chat,probe,answer,sentAt,capture){return this.matchTurn(chat,probe,answer,sentAt,capture).turn||null;},
  evidence(chat,probe,answer,sentAt,capture){
    const match=this.matchTurn(chat,probe,answer,sentAt,capture),t=match.turn;if(!t)return {code:match.code,proof:null};
    if(match.binding.local&&!match.binding.complete)return {code:'local_reply_incomplete',proof:null,by:match.by};
    if(t.changed||t.routing||t.routed||t.outcome||(t.calls||[]).some(c=>c.failed||c.error))return {code:'unsafe_turn',proof:null,by:match.by};
    const bodyDone=match.binding.complete&&(t.calls||[]).length>0&&t.calls.every(c=>(c.partial===false||c.dpartialOk===true)&&['stop','end_turn'].includes(c.finish));
    if(!t.done&&!bodyDone)return {code:'turn_incomplete',proof:null,by:match.by};
    const id=this.readIdentity(t);if(!id)return {code:'identity_missing_or_conflicting',proof:null,by:match.by};
    const live=capture?.timing,x={out:t.sum?.output,tok:t.sum?.tok,usd:t.sum?.usd,rs:t.sum?.reasoning,think:live?.think,rChars:live?.rChars,sec:(t.calls||[]).reduce((n,c)=>n+(Number.isFinite(c.ms)&&c.ms>0?c.ms:0),0)/1000},score=Strength.scoreOf(x);
    return {code:'verified',by:match.by,proof:{...id,association:match.by,measurement:Number.isFinite(score)&&score>=0?{...x,score,source:Strength.isLive(x)?'measured':'estimated'}:null}};
  },
  // Every label still comes from a correlated, successful API turn, never a cached Models title.
  proof(chat,probe,answer,sentAt,capture){return this.evidence(chat,probe,answer,sentAt,capture).proof;},
  async begin(chat,{firstProbeSent=false}={}){
    const owner=this.owner(),known=this.identity(chat),context=(chat.messages||[]).filter(m=>m.role==='user').length>(firstProbeSent?1:0)?'history':'fresh';
    const state={owner,known,context,group:null,proofs:[],captures:[],identified:null,unsafe:false,identificationBefore:chat.idP,allowInitialIdentification:firstProbeSent&&context==='fresh'};
    try{state.group=await this.group(chat.sid,owner);}catch(e){state.storageError=describe(e);}
    return state;
  },
  recheck(state,chat){
    if(!state)return;
    if(state.captures?.length){
      state.evidence=state.captures.map(c=>this.evidence(chat,c.probe,c.answer,c.sentAt,c));
      state.proofs=state.evidence.map(x=>x.proof);
      state.unsafe=state.unsafe||state.captures.some(c=>{const t=this.turn(chat,c.probe,c.answer,c.sentAt,c);return t&&(t.changed||t.routing||t.routed||t.outcome||(t.calls||[]).some(x=>x.failed||x.error));});
    }
    const ids=new Set([...(state.proofs||[]).filter(Boolean),state.identified].filter(Boolean).map(p=>p.model));state.mixed=ids.size>1;
  },
  authority(state){
    if(!state||state.unsafe||state.mixed)return null;
    const proofs=(state.proofs||[]).filter(Boolean),id=proofs.at(-1)||state.identified;if(!id)return null;
    const tiers=[...new Set([...proofs,state.identified].filter(Boolean).map(p=>p.tier).filter(Boolean))];
    const tier=tiers.length===1?tiers[0]:null;
    return {model:id.model,tier,name:id.model+(tier?'-'+tier:''),source:proofs.length?'api-trace':'api-identification',verifiedProbes:proofs.length};
  },
  async probe(state,chat,probe,answer,sentAt){
    if(!state)return;
    const binding=this.binding(chat,probe,answer);let runId=null;try{runId=/read:runs:(run_[\w-]+)/.exec(JSON.stringify(jwt(chat.runTok)?.scopes||''))?.[1]||null;}catch{}
    // Capture before asynchronous trace reads: chat.fmt belongs to the current probe only.
    const live=chat.fmt?Fmt.est(chat.fmt,null,true):null,timing={think:live?.think,rChars:chat.fmt?.rChars};
    state.captures||=[];state.captures.push({probe,answer:{id:answer.id},sentAt,runId,timing,completedAt:binding.completedAt||chat.endAt||Date.now()});
    if(chat.runTok||chat.idP||state.known)try{await PanelWork.wait(()=>Trace.sync(chat.sid,{deep:true,probeDetails:true}),15000);}catch{}
    this.recheck(state,chat);return state.proofs.at(-1);
  },
  async finalize(state,chat,{signal}={}){
    if(!state)return;const cancelled=()=>signal?.aborted||state.owner!==this.owner();if(cancelled())return;this.recheck(state,chat);
    // Wait only when the current run actually has an identification request. No-token chats do not wait.
    const p=chat.idP,tok=chat.idTok;
    if((!state.proofs.length||!state.proofs.every(Boolean))&&p&&tok&&chat.runTok===tok&&(p!==state.identificationBefore||state.allowInitialIdentification)){
      try{const record=await PanelWork.wait(()=>p,12000);if(!cancelled()&&chat.idP===p&&chat.idTok===tok&&chat.runTok===tok){state.identified=this.readIdentity(record);if(record?.routed)state.unsafe=true;}}catch{}
      if(cancelled())return;

      if(!cancelled())this.recheck(state,chat);
    }
    if(!cancelled()&&(!state.proofs.length||state.proofs.some(p=>!p))&&(chat.runTok||state.identified)&&(state.captures?.length||state.identified)){
      if(typeof sleep==='function')await sleep(1500);
      if(cancelled())return;
      try{await PanelWork.wait(()=>Trace.sync(chat.sid,{deep:true,probeDetails:true}),10000);}catch{}
      if(!cancelled())this.recheck(state,chat);
    }
  },
  audit(state,chat,fp){
    const labels={verified:'已核验',local_reply_incomplete:'本条回复未完成或含工具/错误',trace_missing:'接口逐轮记录尚未取得',probe_unassociated:'接口记录未关联到本条探针',message_or_time_mismatch:'消息或时间关联未匹配',ambiguous_turn:'多条接口记录，无法唯一关联',turn_incomplete:'接口完成记录尚未齐全',identity_missing_or_conflicting:'接口型号缺失或相互冲突',unsafe_turn:'接口记录含失败、改派或混合型号'};
    const probes=ProbeLib.PROBES.map((probe,i)=>{const numbers=chat.probeNumbers?.[i]?.numbers||[],e=state.evidence?.[i],proof=state.proofs?.[i];const code=e?.code||(proof?'verified':'trace_missing');return {challenge:probe.id,expected:probe.expected_count,actual:numbers.length,countOK:numbers.length>=Math.ceil(probe.expected_count*.95)&&numbers.length<=Math.floor(probe.expected_count*1.05),apiStatus:code,reason:labels[code]||code,association:e?.by||proof?.association||null,model:proof?.model||null,tier:proof?.tier||null};});
    let traceStatus=null;try{const err=Trace.info?.(chat.sid)?.lastErr;if(err)traceStatus=/过期|401|403/.test(err)?'运行令牌已过期，无法补读缺失证据':/429|限流/.test(err)?'接口读取受到限流':'接口记录读取失败或尚不可用';}catch{}
    return {version:1,traceStatus,count:fp?.count||0,error:fp?.error||'',skipped:fp?.skipped||null,verified:probes.filter(x=>x.apiStatus==='verified').length,probes};
  },
  applyAuthority(state,entry){
    const api=this.authority(state),fp=entry.fingerprint;fp.apiIdentity=api;fp.apiUnsafe=!!(state?.unsafe||state?.mixed);
    if(api){entry.name=api.name;entry.guess=false;entry.response=api.model;entry.tier=api.tier;entry.provider='接口识别（指纹辅助校对）';delete entry.internal;delete entry.request;
      fp.modelConflict=!!fp.result&&PersonalMath.idOf(fp.result.nearest.id)!==api.model;
    }
    return entry;
  },
  async finish(state,chat,entry){
    if(!state)return;this.recheck(state,chat);this.applyAuthority(state,entry);
    let message='仅校对：没有可靠接口身份，不作为参考标签',added=false;
    const fp=entry?.fingerprint,proofs=state.proofs||[],api=this.authority(state);
    const complete=proofs.length===3&&proofs.every(p=>p&&p.model===proofs[0].model)&&!state.unsafe&&!state.mixed;
    const audit=this.audit(state,chat,fp);if(fp)fp.audit=audit;
    message='未入库：已采集 '+(fp?.count||0)+'/3 条；接口核验 '+audit.verified+'/3'+(audit.verified<3?'（'+audit.probes.filter(p=>p.apiStatus!=='verified').map((p)=>'第'+(ProbeLib.PROBES.findIndex(q=>q.id===p.challenge)+1)+'条：'+p.reason).join('；')+'）':'');
    if(fp?.error||fp?.skipped)message='未入库：'+(fp.skipDetail||fp.error||fp.skipped)+'；接口核验 '+audit.verified+'/3';
    if(state.unsafe||state.mixed)message='未入库：本轮接口有改派、失败或型号不一致，保留诊断';
    if(fp&&!fp.error&&!fp.skipped&&fp.count===3&&complete){
      const tier=proofs.every(p=>p.tier&&p.tier===proofs[0].tier)?proofs[0].tier:null;
      const raw={protocol:PersonalMath.protocol,model:proofs[0].model,group:state.group,context:state.context,tier,at:Date.now(),outputs:(chat.probeNumbers||[]).map(r=>r.numbers),measures:fp.measurements};
      try{const row=await this.normalize(raw,true,'local-api');const r=await this.merge([row],state.owner);added=!!r.added&&!r.conflicts;message=r.conflicts?'标签冲突：已隔离，不参与识别':r.added?'已核验入客户端共享库（'+(tier||'档位未知')+'）':r.suppressed?'此样本已从共享库删除，不自动恢复':'重复样本：已去重，保留共享库现有启用状态';}catch(e){message='未入库：'+describe(e);}
    }
    if(audit.traceStatus&&!added)message+='；'+audit.traceStatus;
    if(state.storageError)message+='；本地存储不可用：'+state.storageError;
    try{await this.log({model:api?.model||state.known?.model||entry?.name||'未知',kind:api||state.known?'reference-check':'identify-only',score:fp?.reasoning?.score??null,tier:api?.tier||fp?.reasoning?.tier||null,probability:api||state.known?null:fp?.result?.signals?.relative_probability??null,message,added,count:fp?.count||0,error:fp?.error||'',audit,outputs:(chat.probeNumbers||[]).map(r=>({challenge_id:r.challenge_id,numbers:r.numbers})),result:fp?.result||null},state.owner);}catch(e){message+='；测试记录保存失败：'+describe(e);}
    if(fp)fp.library={message,added};chat.emit();return message;
  },
  async fit(base,refs,options){
    if(typeof Worker==='undefined')return PersonalMath.augment(base,refs,options);
    const url=URL.createObjectURL(new Blob(['const M=('+PersonalFingerprintMath.toString()+')();onmessage=e=>{try{postMessage({value:M.augment(e.data.base,e.data.refs,e.data.options)});}catch(e){postMessage({error:e.message});}}'],{type:'text/javascript'}));
    const worker=new Worker(url);try{return await PanelWork.wait(()=>new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.value);worker.onerror=()=>reject(Error('个人库拟合失败'));worker.postMessage({base,refs,options});}),30000);}finally{worker.terminate();URL.revokeObjectURL(url);}
  },
  async load(base,{sid='',context='history',excludeIds=[]}={}){
    const owner=this.owner(),excludeGroup=sid?await this.group(sid,owner):'',refs=(await this.refs(owner)).filter(r=>!excludeIds.includes(r.id));
    this.banks||=new Map();const key=[owner,base.sha,this.generation,excludeGroup,context,...excludeIds].join('|');if(this.banks.has(key))return this.banks.get(key);
    const fitted=await this.fit(base.bank,refs,{excludeGroup,context,crossContext:true});ProbeLib.validateBank(fitted.bank);
    const eligible=refs.filter(r=>r.enabled&&!r.conflict&&r.group!==excludeGroup&&r.context===context),calibration=[];
    for(const r of eligible)if(r.tier)for(let i=0;i<3;i++)if(Number.isFinite(r.measures[i]?.score))calibration.push({key:r.group,family:r.model,tier:r.tier,promptKey:PersonalMath.protocol+':'+ProbeLib.PROBES[i].id,source:r.measures[i].source,score:r.measures[i].score});
    const result={...base,bank:fitted.bank,personal:fitted.personal,personalCounts:fitted.counts,personalCalibration:calibration,source:base.source+(fitted.personal?' + 客户端共享库（相对权重未重新校准）':'')};
    if(this.banks.size>4)this.banks.clear();this.banks.set(key,result);return result;
  },
  async exportData(){
    const refs=await this.refs(),base=await ProbeBankCache.load();
    const samples=refs.map(r=>({...PersonalMath.validate(r),enabled:r.enabled,conflict:!!r.conflict}));
    const data={schema:this.schema,scope:'client-shared',protocol:PersonalMath.protocol,exportedAt:new Date().toISOString(),defaultBank:base.bank,defaultVersion:base.version,samples,samplesSha256:await this.digest(JSON.stringify(samples)),note:'仅数字与参考标签；不含会话ID、账号、对话正文、Cookie或令牌。导入标签声明不等于来源认证。默认库快照仅供查看，不覆盖接收方默认库。'};
    return await FileExport.text(JSON.stringify(data),'brana-fingerprint-library-'+new Date().toISOString().slice(0,10)+'.json');
  },
  async previewImport(text){
    if(text.length>32*1024*1024)throw Error('文件超过 32 MB');const data=JSON.parse(text);
    if(data.schema!==this.schema||data.protocol!==PersonalMath.protocol||!Array.isArray(data.samples)||data.samples.length>2000)throw Error('不兼容的指纹库文件；请使用客户端完整库导出文件');
    if(data.samplesSha256!==await this.digest(JSON.stringify(data.samples)))throw Error('文件摘要不一致');
    const rows=[];for(let i=0;i<data.samples.length;i++){const raw=data.samples[i],r=await this.normalize(raw,false,'import:'+data.samplesSha256.slice(0,12));r.conflict=raw.conflict===true;rows.push(r);if(i%20===0)await PanelWork.frame();}
    return {rows,models:new Set(rows.map(r=>r.model)).size};
  },
};
try { PersonalFP.channel=new BroadcastChannel('arena-personal-fingerprint-v1');PersonalFP.channel.onmessage=e=>{PersonalFP.cache.delete(e.data?.owner);PersonalFP.generation++;PersonalFP.banks?.clear();Bus.emit('personal-bank');}; } catch {}
