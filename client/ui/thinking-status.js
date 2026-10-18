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
    if(typeof ProbeLib!=='undefined'){
      const rows=(ProbeLib.seedBank?.models||[]).filter(m=>normalize(m.id)===id);
      if(rows.length&&rows.every(m=>m.open_weights===true))return 'open';
      if(rows.some(m=>m.open_weights===false))return 'closed';
    }
    return /^(?:gpt-(?!oss(?:-|$))|chatgpt-|o[134](?:-|$)|claude-|gemini-|grok-[234](?:-|$))/.test(id)?'closed':'unknown';
  }
  function access(chat,message=null) {
    if(!chat?.sid)return {type:'unknown',certain:false};
    // History must use the matching turn, never the current model of a possibly rerouted chat.
    const turns=typeof Trace!=='undefined'?(Trace.turns(chat.sid)||[]):[];
    const current=message||chat.live;
    const matches=current?.id?turns.filter(t=>(t.records||[]).some(r=>r.messageId===current.id)):[];
    if(matches.length===1){const t=matches[0];if(t.changed||t.routing||t.outcome)return {type:'unknown',certain:false};const name=t.response||t.internal;return {type:classify(name,t),certain:true};}
    if(matches.length>1)return {type:'unknown',certain:false};
    const m=Models.get(chat.sid);if(!m||m.routed)return {type:'unknown',certain:false};
    // A session cache is historical, not evidence about the current turn. Only an
    // exact assistant message, or the dispatch input of this active turn, can bind it.
    const sameMessage=!!current?.id&&m.messageId===current.id;
    const input=chat.turnInput||chat.awaitId;
    const sameInput=(!message||message===chat.live)&&!!input&&m.inputId===input;
    if((sameMessage||sameInput)&&!m.guess&&(m.response||m.internal))return {type:classify(m.response||m.internal,m),certain:true};
    // Fingerprints are probes of a different response; they do not relabel this turn.
    return {type:'unknown',certain:false};
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
  function of(chat) {
    if (!chat) return null;
    const closedByApi = isClosed(chat);
    const f = chat.fmt;
    if ((Number(f?.rChars) || 0) > 0 && !closedByApi) {
      const ids = Array.isArray(f?.ids) ? f.ids.map(x => String(x?.[1] ?? '')).filter(Boolean) : [];
      const isClosedFmt = (f?.toolIds || []).some(i => /^toolu_/i.test(String(i || ''))) ||
        ids.some(i => /^(?:msg|rs)_[0-9a-f]{16,}/i.test(i)) ||
        (ids.length > 0 && ids.every(i => /^\d+$/.test(i)) && /^\s*\*\*[^\n*]{2,80}\*\*/.test(String(f?.rHead || '')));
      if (!isClosedFmt) return { kind: 'compat-thinking', label: '开源思考' };
    }
    let sawClosed = false;
    const msgs = Array.isArray(chat.messages) ? [...chat.messages] : [];
    if (chat.live && !msgs.includes(chat.live)) msgs.push(chat.live);
    for (const m of msgs) {
      if (!m || m.role !== 'assistant') continue;
      for (const p of m.parts || []) {
        if (p?.type === 'reasoning') {
          if (visible(p) && !closedByApi) return { kind: 'compat-thinking', label: '开源思考' };
          sawClosed = true;
        }
      }
    }
    if ((Number(f?.rBlocks || f?.rN) || 0) > 0) sawClosed = true;
    if (sawClosed) return { kind: 'closed-thinking', label: '闭源思考' };
    return null;
  }
  return {classify,access,label,phase,isClosed,eventPhase,byContent,visible,of};
})();
