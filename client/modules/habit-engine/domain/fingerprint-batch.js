// Explicit serial testing: new and old chats use the same per-turn API evidence rules; guesses never label references.
const FingerprintBatch = {
  busy:false,run:null,
  owns(id){return this.busy&&!!this.run?.ids.includes(id);},
  stop(){if(this.run&&this.busy){this.run.controller.abort();this.run.phase='正在停止，等待当前请求确认…';this.changed();}},
  changed(){Bus.emit('fingerprint-batch');try{Bar.render();if(UI.els?.chat)scheduleChat(UI.els.chat);}catch{}},
  reusable(chat){
    let batch=[],last=null,start=0;
    const messages=chat.messages||[];
    for(let i=0;i<messages.length;i++){
      const m=messages[i];if(m.role!=='user')continue;
      const text=Fingerprint.textOf(m).trim(),probe=Fingerprint.PROBES[batch.length];
      if(text!==probe?.prompt){batch=[];if(text!==Fingerprint.PROBES[0].prompt)continue;start=i;}
      if(!batch.length)start=i;
      const p=Fingerprint.PROBES[batch.length];let end=i+1;while(end<messages.length&&messages[end].role!=='user')end++;
      const answers=messages.slice(i+1,end).filter(a=>a.role==='assistant');
      if(answers.length!==1){batch=[];continue;}
      try{const text=Fingerprint.extractAnswer(answers[0]),numbers=ProbeLib.numbers(text);if((numbers.length<Math.ceil(p.expected_count*.95)||numbers.length>Math.floor(p.expected_count*1.05))||ProbeOutputGuard.inspect(text,p.expected_count,false))throw Error('无效探针');batch.push({text,numbers,probe:p,answer:answers[0],sentAt:Date.parse(m.createdAt||m.created_at||'')});if(batch.length===3){const prepared=ProbeLib.prepareOutputs(batch.map(x=>({text:x.text,challenge_id:x.probe.id,expected_count:x.probe.expected_count})));if(prepared.usable.length===3&&prepared.checks.every(c=>c.level==='ok'))last={batch,start};batch=[];}}catch{batch=[];}
    }
    return last;
  },
  async useExisting(chat,found,signal){
    const check=()=>{if(signal?.aborted)throw Object.assign(Error("已取消"),{name:"AbortError"});};check();
    const state=await PersonalFP.begin(chat);state.context=chat.messages.slice(0,found.start).some(m=>m.role==='user')?'history':'fresh';
    const sampleId=await PersonalFP.digest(PersonalMath.protocol+'|'+JSON.stringify(found.batch.map(x=>x.numbers)));
    const base=await ProbeBankCache.load();let loaded;try{loaded=await PersonalFP.load(base,{sid:chat.sid,context:state.context,excludeIds:[sampleId]});}catch(e){loaded={...base,personalError:describe(e)};}
    check();const outputs=found.batch.map(x=>({text:x.text,challenge_id:x.probe.id,expected_count:x.probe.expected_count}));
    const result=(typeof FPLibs!=='undefined'?await FPLibs.inspect(outputs,loaded,{thought:FPLibs.thought?.(found.batch.map(x=>x.answer))}):ProbeLib.inspectAndIdentify(outputs,loaded.bank)).result,meta=loaded.bank.models.find(m=>m.id===result.nearest.id);
    if(meta?.personal_only&&(meta.reference_groups<3||meta.context_mismatch)){result.status='close';result.reason=meta.context_mismatch?'personal_context_mismatch':'personal_samples_insufficient';}
    const runIds=Trace.validRuns?.(chat.sid)?.map(x=>x[0])||[];
    state.captures=found.batch.map(x=>({probe:x.probe,answer:{id:x.answer.id},sentAt:x.sentAt,runIds,completedAt:PersonalFP.binding(chat,x.probe,x.answer).completedAt}));PersonalFP.recheck(state,chat);const api=PersonalFP.authority(state);
    const measurements=found.batch.map((x,i)=>state.proofs[i]?.measurement||{score:null,source:'unavailable'});
    const measurement=measurements[0],cal=ProbeLib.calibrateReasoning(measurement.score,{family:api?.model||ProbeLib.baseModelId(result.nearest.id),promptKey:Fingerprint.promptKey(Fingerprint.PROBES[0].prompt),source:measurement.source},loaded.personalCalibration||[]);
    const fp={protocol:ProbeLib.PROBE_PROTOCOL,count:3,result,error:'',conflict:false,source:loaded.source,personal:loaded.personal,personalError:loaded.personalError||'',measurements,reasoning:{...measurement,...cal,score:Strength.settle?.(chat.sid,measurement,Strength.priorOf?.(chat.sid))??measurement.score,model:api?.model||ProbeLib.baseModelId(result.nearest.id),tier:api||result.status==='clear'?cal.tier:null,confidence:PersonalMath.tierConfidence(measurement.score,cal)},suffix:ProbeLib.confidenceSuffix(result,3),reused:true,warning:'复用已加载的完整探针；仅库内相对匹配，不是身份准确率。'};
    const known=Models.get(chat.sid),entry=known?.name&&!known.guess?{...known,fingerprint:fp}:{name:result.nearest.id+(result.status==='clear'?'':'?'),guess:true,fingerprint:fp};
    chat.probeNumbers=found.batch.map(x=>({challenge_id:x.probe.id,expected_count:x.probe.expected_count,numbers:x.numbers}));
    check();if(state.owner!==PersonalFP.owner())throw Object.assign(Error("账号已变化"),{name:"AbortError"});await PersonalFP.finish(state,chat,entry);check();Models.set(chat.sid,entry);Bus.emit('model',chat,entry);chat.emit();return entry;
  },
  /* 补核验改成自动：打开 / 切回一个有指纹的对话时，如果这次指纹还没拿到接口证据，而运行记录（Trace，约 1 小时内）还读得到，
     就静默复用已有的三条完整探针补核验一次。不发送消息；同一状态只试一次；有任务在跑、抽卡中、对话在回复时都不动。 */
  autoVerify(chat){
    try{
      if(this.busy||!chat?.sid||!chat.loaded||chat.busy||chat.gacha||chat.fpLocked||chat.queue?.length||Fingerprint.isRunning(chat))return false;
      if((typeof PelicanTest!=='undefined'&&PelicanTest.isRunning(chat))||Gacha.busy()||RegionIP.busy)return false;
      const fp=Models.get(chat.sid)?.fingerprint;if(!fp||fp.skipped||fp.partial||fp.apiIdentity||fp.reused)return false;
      const msgs=chat.messages||[],last=msgs.at(-1),at=Date.parse(last?.createdAt||last?.created_at||'');
      if(!Number.isFinite(at)||now()-at>65*60000)return false;   // 超过 1 小时 Trace 已读不到，补核验也拿不到接口证据
      const key=msgs.length+':'+(last?.id||'');if(chat.fpVerifyKey===key)return false;chat.fpVerifyKey=key;
      const found=this.reusable(chat);if(!found)return false;
      chat.fpLocked=true;
      void(async()=>{
        try{
          try{await Trace.sync(chat.sid,{deep:true,probeDetails:true});}catch{}
          if(chat.busy||chat.queue?.length||Fingerprint.isRunning(chat))return;
          const e=await this.useExisting(chat,found);
          if(e?.fingerprint?.apiIdentity)toast('已自动补核验：接口型号 '+(e.fingerprint.apiIdentity.name||e.fingerprint.apiIdentity.model||e.name));
        }catch{}finally{chat.fpLocked=false;try{chat.emit();}catch{}}
      })();
      return true;
    }catch{return false;}
  },
  async start(ids,{reuseOnly=false}={}){
    if(this.busy){this.open();return;}
    if(Gacha.busy()||RegionIP.busy||Bulk.running('arch')||Bulk.running('del')||[...Chats.values()].some(c=>Fingerprint.isRunning(c))){toast('请先完成或停止抽卡、其他指纹测试、批量删除/归档或 IP 切换','err');return;}
    ids=[...new Set(ids)].filter(Boolean);if(!ids.length)return;if(ids.length>100){toast('一次最多测试 100 个对话，请分批选择','err');return;}
    const owner=PersonalFP.owner(),revision=CardSelect.revision;
    if(!await Dialog.confirm({title:(reuseOnly?'补核验（不发送消息） · ':'批量测指纹 · ')+ids.length+' 个对话',text:reuseOnly?'只读取接口记录，复用原对话已有的三条完整探针；不会发送新消息，也不会重新抽卡。\n缺少完整探针或可靠接口证据时只显示原因，不强行入库。':'新旧对话使用相同规则：本轮可靠接口型号优先于指纹候选。\n三条完整探针逐条关联同一接口型号，才补充参考库；只有猜测或身份未知时仅校对。\n\n优先复用已加载的三条完整探针；没有时在原对话追加最多三条测试消息，会消耗额度、更新对话内容和时间。串行执行，可随时停止；异常或限流暂停。\n档位样本不足显示未校准，不保证得到 max 百分比。',ok:'确认开始'}))return;
    if(owner!==PersonalFP.owner()||revision!==CardSelect.revision){toast('账号或选择已改变，请重新确认');return;}
    if(this.busy||Gacha.busy()||RegionIP.busy||Bulk.running('arch')||Bulk.running('del'))return;
    this.busy=true;const r=this.run={ids,owner,controller:new AbortController(),at:now(),done:0,added:0,rows:[],phase:'准备读取',current:null};this.open();this.changed();
    try{
      for(const sid of ids){
        if(r.controller.signal.aborted||owner!==PersonalFP.owner())break;
        const existed=Chats.has(sid),chat=chatOf(sid);r.current=chat;r.phase='读取对话 '+(r.done+1)+' / '+ids.length;this.changed();
        try{
          if(chat.busy||chat.queue?.length||chat.gacha||Fingerprint.isRunning(chat)){r.rows.push({sid,message:'跳过：对话正在运行或有待发送队列'});r.done++;continue;}
          chat.fpBatchLoad=true;chat.fpLocked=true;
          await PanelWork.wait(()=>chat.load(),35000);
          if(r.controller.signal.aborted||owner!==PersonalFP.owner())break;
          if(chat.busy||chat.queue?.length)throw Error('对话已在其他位置开始运行');
          try{await PanelWork.wait(()=>Trace.sync(sid,{deep:true,probeDetails:true}),15000);}catch{}
          if(r.controller.signal.aborted||owner!==PersonalFP.owner())break;
          const old=this.reusable(chat);
          if(reuseOnly&&!old){r.rows.push({sid,message:'未补核验：没有找到三条完整有效的已有探针；未发送消息'});r.done++;continue;}
          const entry=old?await this.useExisting(chat,old,r.controller.signal):await Fingerprint.testConversation(chat,{signal:r.controller.signal,progress:text=>{r.phase=text;chat.probeProgress=text;this.changed();}});
          if(r.controller.signal.aborted)break;
          const fp=entry.fingerprint;r.added+=fp.library?.added?1:0;r.rows.push({sid,message:(old?'复用已有探针 · ':'')+(fp.library?.message||fp.error||Fingerprint.describe(entry))});r.done++;
          if(fp.skipped&&fp.stopConfirmed===false||/429|限流|额度|captcha|验证|停止未确认/i.test(fp.error||chat.error||'')){r.phase='已暂停：限流、验证或停止未确认';break;}
        }catch(e){r.rows.push({sid,message:'未完成：'+describe(e)});if(!r.controller.signal.aborted)r.done++;if(e.fatal||r.controller.signal.aborted||/429|限流|额度|验证/i.test(e.message||'')){r.phase='已停止或暂停：'+describe(e);break;}}
        finally{chat.fpLocked=false;chat.fpBatchLoad=false;if(!existed&&!chat.busy&&!Tabs.list.some(t=>t.sid===sid)){chat.gen++;chat.ctl?.abort();Chats.delete(sid);}r.current=null;this.changed();}
        await sleep(1500);
      }
    }finally{this.busy=false;r.phase=r.controller.signal.aborted?'已停止（已发送消息不会撤回）':r.done===ids.length?'全部处理完成':r.phase;this.changed();}
  },
  open(){
    if(this.back?.isConnected){this.paint();return;}
    const back=this.back=h('div',{class:'modal-back fp-batch-back'}),body=h('div',{class:'modal-b'});
    back.append(h('div',{class:'modal'},h('div',{class:'modal-h'},'批量测指纹'),body,h('div',{class:'modal-f'},h('button',{class:'btn ghost',onclick:()=>{back.remove();}},'最小化'),h('button',{class:'btn fp-stop',onclick:()=>this.stop()},'停止'))));this.body=body;document.body.append(back);this.paint();
  },
  paint(){if(!this.back?.isConnected)return;const r=this.run;this.body.replaceChildren(h('p',{role:'status'},r?r.phase:'准备开始'),h('p',{},r?'已处理 '+r.done+' / '+r.ids.length+' · 新增参考 '+r.added:''),...(r?.rows||[]).slice(-20).map((x,i)=>h('p',{class:'note'},(i+1)+'. '+x.message)));this.back.querySelector('.fp-stop').disabled=!this.busy;},
};
Bus.on('fingerprint-batch',()=>FingerprintBatch.paint());
