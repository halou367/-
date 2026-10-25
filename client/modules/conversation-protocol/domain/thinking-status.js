// Presentation of reasoning is separate from model identification and routing.
// Neither a waiting indicator nor a reasoning block proves open weights or a model switch.
const ThinkingStatus = (() => {
  const normalize=s=>String(s||'').toLowerCase().replace(/^models\//,'').replace(/^(?:openai|anthropic|google|meta-llama|deepseek|qwen)\//,'').replace(/@.*$/,'').replace(/\./g,'-').replace(/-(?:none|minimal|low|medium|high|xhigh|max)(?:-vertex)?$/,'');
  // Reviewed exact public-weight IDs, not blanket vendor guesses (Qwen Max etc. remain unknown).
  const open=new Set(['gpt-oss-120b','gpt-oss-20b','deepseek-r1','deepseek-r1-0528','deepseek-v3','deepseek-v3-0324','qwen3-235b-a22b','qwen3-30b-a3b','qwen3-32b','qwen3-14b','qwen3-8b','qwen3-4b','llama-3-3-70b-instruct','llama-3-1-405b-instruct','grok-1']);
  function classify(name,metadata={}) {
    const id=normalize(name);if(!id)return 'unknown';
    if(metadata.open_weights===true)return 'open';if(metadata.open_weights===false)return 'closed';
    if(open.has(id))return 'open';
    if(/^(?:gpt-(?!oss(?:-|$))|chatgpt-|o[134](?:-|$)|claude-|gemini-|grok-[234](?:-|$))/.test(id))return 'closed';
    if(typeof ProbeLib!=='undefined'){
      const rows=(ProbeLib.seedBank?.models||[]).filter(m=>normalize(m.id)===id);
      if(rows.length&&rows.every(m=>m.open_weights===true))return 'open';
      if(rows.some(m=>m.open_weights===false))return 'closed';
    }
    return 'unknown';
  }
  const _accessMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const _ofMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function access(chat,message=null) {
    if(!chat?.sid)return {type:'unknown',certain:false};
    // History must use the matching turn, never the current model of a possibly rerouted chat.
    const turns=typeof Trace!=='undefined'?(Trace.turns(chat.sid)||[]):[];
    const current=message||chat.live;
    const m=Models.get(chat.sid);
    const lastTurn=turns[turns.length-1];
    const aSig=`${chat.sid}\0${current?.id||''}\0${message===chat.live||!message?1:0}\0${chat.turnInput||chat.awaitId||''}\0${turns.length}\0${lastTurn?.changed?1:0}:${lastTurn?.routing?1:0}:${lastTurn?.outcome||''}:${lastTurn?.response||''}:${lastTurn?.internal||''}:${lastTurn?.records?.length||0}\0${m?.name||''}:${m?.routed?1:0}:${m?.guess?1:0}:${m?.messageId||''}:${m?.inputId||''}:${m?.response||''}:${m?.internal||''}`;
    const memoObj = (message && typeof message === 'object') ? message : chat;
    if (_accessMemo && typeof memoObj === 'object') {
      const hit = _accessMemo.get(memoObj);
      if (hit && hit.sig === aSig) return hit.val;
    }
    const saveAcc = val => {
      if (_accessMemo && typeof memoObj === 'object') _accessMemo.set(memoObj, { sig: aSig, val });
      return val;
    };
    const matches=current?.id?turns.filter(t=>(t.records||[]).some(r=>r.messageId===current.id)):[];
    if(matches.length===1){const t=matches[0];if(t.changed||t.routing||t.outcome)return saveAcc({type:'unknown',certain:false});const name=t.response||t.internal;return saveAcc({type:classify(name,t),certain:true});}
    if(matches.length>1)return saveAcc({type:'unknown',certain:false});
    if(!m||m.routed)return saveAcc({type:'unknown',certain:false});
    // A session cache is historical, not evidence about the current turn. Only an
    // exact assistant message, or the dispatch input of this active turn, can bind it.
    const sameMessage=!!current?.id&&m.messageId===current.id;
    const input=chat.turnInput||chat.awaitId;
    const sameInput=(!message||message===chat.live)&&!!input&&m.inputId===input;
    if((sameMessage||sameInput)&&!m.guess&&(m.response||m.internal))return saveAcc({type:classify(m.response||m.internal,m),certain:true});
    // Fingerprints are probes of a different response; they do not relabel this turn.
    return saveAcc({type:'unknown',certain:false});
  }
  // 思考块本身就能区分：开源模型的思考有可见文字；闭源模型的思考是空的 / 加密的（只显示「…」）
  const visible=p=>/[^\s.…·。]/.test(String(p?.text||''));
  const byContent=p=>p?.type==='reasoning'?(visible(p)?'open':'closed'):'unknown';
  function label(chat,message=null,streaming=true,a=access(chat,message),part=null) {
    if(a.type==='unknown'&&part&&byContent(part)!=='unknown')a={type:byContent(part),certain:true};
    const k=a.type==='closed'?'闭源':a.type==='open'?'开源':'';
    return k+(streaming?'思考中…':'思考过程');
  }
  const phase=chat=>{if(chat.phase!=='思考中')return chat.phase||'进行中';const rp=chat.live?.parts?.findLast?.(p=>p.type==='reasoning'&&p.state==='streaming');return chat.live&&!rp?'生成中':label(chat,null,true,access(chat),rp||null);};
  // Deltas can arrive without starts after reconnect. Only actual protocol event
  // types update this label; words such as 'thinking' in text/tool logs never do.
  function eventPhase(chat,ch) {
    const t=ch.type, key=/^(text|reasoning)-/.test(t)?t.split('-')[0]+':'+ch.id:'tool:'+ch.toolCallId;
    if(/^(text|reasoning)-(start|delta)$/.test(t)){chat._contentKey=key;chat.phase=t.startsWith('text-')?'输出中':'思考中';}
    else if(/^(text|reasoning)-end$/.test(t)&&chat._contentKey===key){chat.phase='生成中';chat._contentKey='';}
    else if(/^tool-input-/.test(t)){chat._contentKey=key;chat.phase=t==='tool-input-error'?'工具调用出错':(t==='tool-input-available'?'执行 ':'调用 ')+(ch.toolName||chat.parts?.get(key)?.toolName||'工具');}
    else if(/^tool-output-/.test(t)){chat._contentKey=key;chat.phase=ch.preliminary?'工具运行中':t==='tool-output-error'?'工具返回错误':t==='tool-output-denied'?'工具调用被拒绝':'工具结果已返回';}
    else if(t==='tool-approval-request'){chat._contentKey=key;chat.phase='等待工具授权';}
    else if(t==='start')chat._contentKey='';
  }
  const isClosed=chat=>{const a=access(chat);return a.certain&&a.type==='closed';};
  const isStoppedMsg=m=>Boolean(m?.metadata?.openThinkStopped||m?.metadata?.aborted||m?.metadata?.feedback?.interruption==='stop');
  const isOpenToolId=id=>/^(?:call_\d+_|call_[0-9a-f]{24}$|functions\.|_\d+_[0-9a-f]{6,}|chatcmpl-tool-)/i.test(String(id||''));
  const isClosedToolId=id=>{const s=String(id||'');return typeof globalThis.ArenaPricing?.detectToolIdVendor==='function'?globalThis.ArenaPricing.detectToolIdVendor(s)?.strictClosed===true:/^(?:toolu_|srvtoolu_|msg_01)/i.test(s);};
  const hasClosedTools=m=>(m?.parts||[]).some(p=>isClosedToolId(p?.toolCallId));
  const hasOpenTools=m=>(m?.parts||[]).some(p=>isOpenToolId(p?.toolCallId));
  function of(chat) {
    if (!chat) return null;
    const closedByApi = isClosed(chat);
    const f = chat.fmt;
    const curM0 = chat.sid && typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
    const msgsArr = Array.isArray(chat.messages) ? chat.messages : [];
    const lastM = chat.live || msgsArr[msgsArr.length - 1] || null;
    const lastP = Array.isArray(lastM?.parts) && lastM.parts.length ? lastM.parts[lastM.parts.length - 1] : null;
    const oSig = `${chat.sid || ''}\0${closedByApi ? 1 : 0}\0${msgsArr.length}\0${chat.live ? chat.live.id || 'L' : ''}\0${lastM?.id || ''}:${lastM?.parts?.length || 0}:${lastM?.metadata?.openThinkStopped ? 1 : 0}:${lastP?.type || ''}:${lastP?.state || ''}:${(lastP?.text || '').length}:${visible(lastP) ? 1 : 0}\0${curM0?.name || ''}:${curM0?.guess ? 1 : 0}:${curM0?.userCorrected ? 1 : 0}\0${f?.rChars || 0}:${f?.rBlocks || f?.rN || 0}:${f?.rHead || ''}:${chat.thinkStopped ? 1 : 0}`;
    if (_ofMemo && typeof chat === 'object') {
      const hit = _ofMemo.get(chat);
      if (hit && hit.sig === oSig && (hit.val?.kind !== 'compat-thinking' || chat._openSourceMarked || !chat.sid)) return hit.val;
    }
    const saveOf = val => {
      if (_ofMemo && typeof chat === 'object') _ofMemo.set(chat, { sig: oSig, val });
      return val;
    };
    let sawClosed = false;
    const rawMsgs = Array.isArray(chat.messages) ? (chat.live && !chat.messages.includes(chat.live) ? [...chat.messages, chat.live] : chat.messages) : (chat.live ? [chat.live] : []);
    const asstMsgs = rawMsgs.filter(m => m && m.role === 'assistant');
    const curM = curM0;
    if (curM?.name && curM.name !== '开源模型' && !/开源|compat|qwen|deepseek|glm|kimi|minimax|llama|mistral|nemotron|inkling|beam|caveman|gemma/i.test(curM.name) && !curM.guess) {
      sawClosed = true;
    }
    const anyExplicitOpen = asstMsgs.some(m => Boolean(m?.metadata?.openThinkStopped || hasOpenTools(m) || (m?.parts || []).some(p => p?.type === 'reasoning' && visible(p))));
    if (asstMsgs.length > 1) {
      const firstAsst = asstMsgs[0];
      const firstVisible = (firstAsst?.parts || []).some(p => p?.type === 'reasoning' && visible(p));
      const firstHidden = (firstAsst?.parts || []).some(p => p?.type === 'reasoning' && !visible(p));
      if (!firstVisible && !firstAsst?.metadata?.openThinkStopped && !hasOpenTools(firstAsst) && (firstHidden || hasClosedTools(firstAsst))) sawClosed = true;
    }
    const nonStopped = asstMsgs.filter(m => !isStoppedMsg(m));
    const msgs = nonStopped.length ? nonStopped : asstMsgs;
    for (const m of msgs) {
      let mHasVisible = false, mHasHidden = false;
      for (const p of m.parts || []) {
        if (p?.type === 'reasoning') {
          if (visible(p)) mHasVisible = true;
          else mHasHidden = true;
        }
      }
      if (!mHasVisible && (mHasHidden || hasClosedTools(m))) {
        sawClosed = true;
      }
      if ((mHasVisible || m?.metadata?.openThinkStopped || (anyExplicitOpen && hasOpenTools(m))) && !closedByApi && !sawClosed) {
        try {
          if (chat.sid && !chat._closedLockedModel && !chat._openSourceMarked && !chat._openSourceMarking && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
            const curM = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
            const isAlreadyOpenMarked = Boolean(curM && (curM.userCorrected || curM.manualOpenInferred || curM.name === '开源模型' || curM.reverseCandidateId === 'open-source' || curM.provider === '开源思考识别（免计费反推）' || curM.provider === '开源思考过滤'));
            if (!isAlreadyOpenMarked) {
              chat._openSourceMarking = true;
              queueMicrotask(() => {
                try { BillingProbe.markAsOpenSourceModel(chat); chat._openSourceMarked = true; } catch {}
                finally { chat._openSourceMarking = false; }
              });
            } else {
              chat._openSourceMarked = true;
            }
          }
        } catch {}
        return saveOf({ kind: 'compat-thinking', label: '开源思考' });
      }
    }
    if ((Number(f?.rChars) || 0) > 0 && !closedByApi && !sawClosed && !chat.thinkStopped && !asstMsgs.some(isStoppedMsg)) {
      const ids = Array.isArray(f?.ids) ? f.ids.map(x => String(x?.[1] ?? '')).filter(Boolean) : [];
      const isClosedFmt = (f?.toolIds || []).some(i => /^toolu_/i.test(String(i || ''))) ||
        ids.some(i => /^(?:msg|rs)_[0-9a-fA-Z_-]{10,}/i.test(i)) ||
        (ids.length > 0 && ids.every(i => /^\d+$/.test(i)) && /^\s*\*\*[^\n*]{2,80}\*\*/.test(String(f?.rHead || '')));
      if (!isClosedFmt) {
        try {
          if (chat.sid && !chat._closedLockedModel && !chat._openSourceMarked && !chat._openSourceMarking && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
            const curM = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
            const isAlreadyOpenMarked = Boolean(curM && (curM.userCorrected || curM.manualOpenInferred || curM.name === '开源模型' || curM.reverseCandidateId === 'open-source' || curM.provider === '开源思考识别（免计费反推）' || curM.provider === '开源思考过滤'));
            if (!isAlreadyOpenMarked) {
              chat._openSourceMarking = true;
              queueMicrotask(() => {
                try { BillingProbe.markAsOpenSourceModel(chat); chat._openSourceMarked = true; } catch {}
                finally { chat._openSourceMarking = false; }
              });
            } else {
              chat._openSourceMarked = true;
            }
          }
        } catch {}
        return saveOf({ kind: 'compat-thinking', label: '开源思考' });
      }
    }
    if ((Number(f?.rBlocks || f?.rN) || 0) > 0) sawClosed = true;
    if (sawClosed) return saveOf({ kind: 'closed-thinking', label: '闭源思考' });
    return saveOf(null);
  }
  return {classify,access,label,phase,isClosed,eventPhase,byContent,visible,of};
})();
