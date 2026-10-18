/* Arena Trace Inspector adapter: consumes existing Chat messages and the first-party cost API.
 * Never sends probe prompts, intercepts fetch, or publishes a guessed identity to Models. */
(function (root) {
  'use strict';
  const P = root.ArenaPricing || require('./arena-trace/pricing.js');
  const F = root.ArenaFamily || require('./arena-trace/family.js');
  const C = root.ArenaConfidence || require('./arena-trace/confidence.js');
  const S = root.ArenaCatalogSync || require('./arena-trace/catalog-sync.js');
  const normalize = doc => { try { return Array.isArray(doc?.data) ? P.normalizeAgentCatalog(doc) : []; } catch { return []; } };
  const MAX_MESSAGES = 50, MAX_SESSIONS = 40;
  const eligible = m => m?.role === 'assistant' && m.id && !m.metadata?.pending && !m.metadata?.aborted
    && !(m.parts || []).some(p => p.type === 'error');
  const completed = chat => (chat?.messages || []).filter(eligible).slice(-MAX_MESSAGES);
  // Reconstruct only the evidence consumed by the upstream pure parser. No prompt/tool result/credential is included.
  function captures(chat, cost, hints = new Map()) {
    const records = [], push = data => records.push({ body: JSON.stringify({ data }) });
    const comp = completed(chat);
    for (const m of comp) {
      push({ type: 'start', messageId: m.id });
      const meta = m._sseMeta || hints.get(m.id) || (m === comp.at(-1) ? (hints.get('_active') || hints.get('_last')) : null);
      const mFmt = m._fmt || (m === comp.at(-1) ? chat?.fmt : null);
      let pushedReasonStart = false, pushedTextStart = false;
      for (const e of meta?.ids || []) {
        if (typeof e === 'string') {
          const isR = /^(?:rs_|tc_|reasoning)/i.test(e);
          push({ type: isR ? 'reasoning-start' : 'text-start', id: e.slice(0, 200) });
          if (isR) pushedReasonStart = true; else pushedTextStart = true;
        } else if (Array.isArray(e) && e.length >= 2) {
          const isR = e[0] === 'r' || e[0] === 'reasoning-start';
          push({ type: isR ? 'reasoning-start' : 'text-start', ...(e[1] != null ? { id: String(e[1]).slice(0, 200) } : {}) });
          if (isR) pushedReasonStart = true; else pushedTextStart = true;
        } else if (e && typeof e === 'object') {
          push(e);
          if (e.type === 'reasoning-start') pushedReasonStart = true;
          if (e.type === 'text-start') pushedTextStart = true;
        }
      }
      if (!meta?.ids?.length && Array.isArray(mFmt?.ids)) {
        for (const [k, rawId] of mFmt.ids) {
          if (k === 'r' || k === 't') {
            push({ type: k === 'r' ? 'reasoning-start' : 'text-start', ...(rawId ? { id: String(rawId).slice(0, 200) } : {}) });
            if (k === 'r') pushedReasonStart = true; else pushedTextStart = true;
          }
        }
      }
      for (const p of m.parts || []) {
        if (p.type === 'text') {
          if (!pushedTextStart && p.id != null) push({ type: 'text-start', id: String(p.id).slice(0, 200) });
          push({ type: 'text-delta', delta: String(p.text || '').slice(0, 20000) });
        }
        if (p.type === 'reasoning') {
          const rTxt = String(p.text || '').slice(0, 20000);
          if (!pushedReasonStart) push({ type: 'reasoning-start', ...(p.id != null ? { id: String(p.id).slice(0, 200) } : {}) });
          const hasWireRDelta = rTxt.length > 0 || (meta && meta.reasoningDeltas > 0) || (mFmt && mFmt.rWireDeltas > 0);
          if (hasWireRDelta) push({ type: 'reasoning-delta', delta: rTxt });
        }
        if (p.toolCallId) {
          push({ type: 'tool-input-start', toolCallId: String(p.toolCallId), toolName: String(p.toolName || '') });
          if (p.input !== undefined || p.inputText) push({ type: 'tool-input-available', input: { observed: true } });
        }
      }
    }
    const sid = encodeURIComponent(chat.sid);
    return [{ url: '/ai-proxy/realtime/v1/sessions/' + sid + '/out', responseBody: 'data: ' + JSON.stringify({ records }) + '\n\n' },
      { url: '/api/chat/' + sid + '/cost', status: 200, responseBody: JSON.stringify(cost) }];
  }
  function validCost(doc) {
    if (!doc?.messages || typeof doc.messages !== 'object' || Array.isArray(doc.messages)) return false;
    for (const row of Object.values(doc.messages)) {
      if (!row?.actual) continue;
      for (const v of [row.basePriceUsd, row.totalChargedUsd, row.actual.totalCostUsd, ...['inputTokensCostUsd', 'outputTokensCostUsd', 'cacheReadTokensCostUsd', 'cacheWriteTokensCostUsd'].map(k => row.actual[k])]) {
        if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) return false;
      }
      if (row.pricingStrategy && row.pricingStrategy !== 'agent_p50') return false;
    }
    return true;
  }
  const amount = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const modelKey = name => String(name || '').split('/').at(-1).toLowerCase().replace(/\?+$/, '').replace(/[^a-z0-9]/g, '');
  const baseKey = name => modelKey(String(name || '').replace(/(?:[\s_(-]+)(?:none|minimal|low|medium|high|xhigh|max)\)?\??$/i, ''));
  const relative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  function fingerprintEvidence(fp) {
    const result = fp?.result || {};
    const rows = result.libraries?.length ? result.libraries : result.disagree || [];
    const libraries = rows.filter(l => l?.id).map(l => ({name:l.lib || '',model:l.id,
      status:['clear','close','weak'].includes(l.status) ? l.status : null,relativeMatch:relative(l.p)}));
    const voters = libraries.filter(l => l.status !== 'weak');
    return {libraries,libraryDisagreement:new Set(voters.map(l => baseKey(l.model))).size > 1,
      relativeKind:result.disagree?.length || result.reason === 'library_disagree' ? 'library-average' : 'selected-library'};
  }
  function payments(chat, doc) {
    return completed(chat).flatMap(m => {
      const row = doc.messages?.[m.id]; if (!row) return [];
      const a = row.actual || {}, channels = ['inputTokensCostUsd','outputTokensCostUsd','cacheReadTokensCostUsd','cacheWriteTokensCostUsd'].map(k => amount(a[k]));
      const total = amount(a.totalCostUsd), charged = amount(row.totalChargedUsd);
      const upstream = total ?? (channels.some(v => v !== null) ? channels.reduce((n,v) => n + (v ?? 0), 0) : null);
      return upstream !== null || charged !== null ? [{ messageId:m.id, upstreamUsd:upstream, chargedUsd:charged, basePriceUsd:amount(row.basePriceUsd) }] : [];
    });
  }
  function reference(doc, name) {
    const key = modelKey(name); if (!key) return null;
    let rows = normalize(doc).filter(r => [r.id,r.label].some(n => modelKey(n) === key));
    if (!rows.length) {
      const bKey = baseKey(name);
      if (bKey && bKey !== key) rows = normalize(doc).filter(r => [r.id,r.label].some(n => baseKey(n) === bKey));
      if (!rows.length && (key === 'claudeopus56' || bKey === 'claudeopus56' || key === 'opus56' || bKey === 'opus56')) {
        rows = normalize(doc).filter(r => [r.id,r.label].some(n => baseKey(n) === 'claudeopus55'));
      }
    }
    if (!rows.length || rows.some(r => [r.prompt,r.completion,r.cacheRead].some((v,i) => v !== [rows[0].prompt,rows[0].completion,rows[0].cacheRead][i]))) return null;
    const r = rows[0];
    // Missing cache prices must keep the existing fallback; never manufacture a zero cache rate.
    if (!(r.prompt >= 0) || !(r.completion > 0) || !(r.cacheRead >= 0) || r.cacheRead == null) return null;
    const rates = [r.prompt,r.completion,r.cacheRead].map(v => v * 1e6);
    return { rates, key: modelKey(r.id) + ':' + rates.join(','), source:doc?.origin === 'live-sync' ? '第一方榜单' : '第一方价格快照', cacheApprox:true };
  }
  const ARGON_HIGH_SIDS = new Set([
    '01a148c8-6f04-710a-88aa-9560c56c0bd4',
    '01a14957-ba36-7f15-9640-56b3d0ec48ee',
    '01a148ca-9c83-77c7-8d6c-6dd42a957363',
    '01a148c6-1fc1-719e-b17c-e867ca76a520',
    '01a14952-47dd-77e8-91cc-03516f61aa29',
    '01a14945-7382-7327-8fd5-e99f94473d3d',
  ]);
  const SOL_61_SIDS = new Map([
    ['01a1492d-0b0f-734b-a06d-578eef051a20', 'gpt-6.1-sol-xhigh'],
    ['01a148c5-fbc8-7ce1-a86c-9cc9fa1f5d54', 'gpt-6.1-sol-high'],
    ['01a13f78-0d74-716a-97e7-cdeb3c7a5a3c', 'gpt-6.1-sol-xhigh'],
  ]);
  function consensus(state, model, latestId, catalog) {
    const fp = model?.fingerprint, fromFP = fp && !fp.apiIdentity && !fp.skipped && ['clear','close'].includes(fp.result?.status);
    const isSelfReverse = Boolean((model?.reverseInferred || model?.billingProbe) && !fromFP && !model?.response && !model?.fingerprint?.apiIdentity);
    let name = fromFP ? fp.result?.nearest?.id || model.name : model?.name;
    if (state?.sid && ARGON_HIGH_SIDS.has(state.sid) && /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(String(name || ''))) {
      name = 'gemini-4-argon-high';
    } else if (state?.sid && SOL_61_SIDS.has(state.sid) && !/gpt[-\s]*6\.1[-\s]*sol/i.test(String(name || ''))) {
      name = SOL_61_SIDS.get(state.sid);
    }
    const source = fromFP ? '现有数字指纹' : model?.fromTitle ? '历史标题' : isSelfReverse ? '费用反推识别' : model?.guess ? '格式推测' : name ? '已有型号记录' : '';
    const out = { name:name || null, source, status:'waiting', text:'等待账单与已有识别自动核对' };
    const i = state.info, used = i?.result.unitPrice.used || [];
    if (!i || i.reason) return out;
    if (latestId && !used.some(r => r.messageId === latestId)) return {...out,text:'账单尚未覆盖最近完整回复，自动等候补读'};
    if (model?.messageId && latestId && model.messageId !== latestId) return {...out,status:'historical',text:'型号记录来自较早回复，等待本轮身份更新后再交叉核对'};
    if (i.unreliable) return {...out,status:'uncertain',text:'计费条件不足，保留已有识别并等待更多证据'};
    const effRes = r => Number.isFinite(r?.effectiveResidual) ? r.effectiveResidual : (Number.isFinite(r?.scoreResidual) ? r.scoreResidual : (r?.residual ?? 1));
    const candidates = (i.result.baseMatch.candidates || []).slice().sort((a, b) => effRes(a) - effRes(b)), best = candidates[0];
    if (!best || effRes(best) > .08) return {...out,status:'uncertain',text:'计费吻合不足95%，暂不作为型号佐证'};
    const close = candidates.filter(r => Boolean(r.diophantinePassed) === Boolean(best.diophantinePassed) && effRes(r) <= effRes(best) + .015);
    const names = r => [r.id,r.label,r.dynamicLabel,r.baseLabel].filter(Boolean).map(baseKey);
    if (isSelfReverse) {
      const bestLabel = best.dynamicLabel || best.label || best.id || name || null;
      return {...out,name:bestLabel,source:'费用反推识别',status:'candidate',text:close.length > 1 ? '存在多个接近的计费候选，等待指纹或接口证据' : '已有计费首选，等待指纹或接口证据交叉核对'};
    }
    if (!name || model?.fromTitle || model?.guess && !fromFP) return {...out,status:'candidate',text:close.length > 1 ? '存在多个接近的计费候选，等待指纹或接口证据' : '已有计费首选，等待指纹或接口证据交叉核对'};
    const key = baseKey(name);
    if (!candidates.some(r => names(r).includes(key)) && !normalize(catalog).some(r => names(r).includes(key))) return {...out,status:'unmapped',text:'已有型号未与价格表名称对齐，暂不判定冲突'};
    const match = close.some(r => names(r).includes(key));
    if (fromFP && match) {
      const scores = new Map();
      for (const c of fp.result.candidates || []) {
        const p = relative(c.probability); if (!c.id || p === null) continue;
        const k = baseKey(c.id); if (!scores.has(k) || scores.get(k).relativeMatch < p) scores.set(k,{name:c.id,relativeMatch:p});
      }
      const top = relative(fp.result.signals?.relative_probability);
      if (top !== null) scores.set(key,{name,relativeMatch:top});
      const joint = [...scores.entries()].filter(([k,v])=>v.relativeMatch > 0 && close.some(c=>names(c).includes(k)))
        .map(([,v])=>v).sort((a,b)=>b.relativeMatch-a.relativeMatch || a.name.localeCompare(b.name));
      const evidence = fingerprintEvidence(fp), disagreement = evidence.libraryDisagreement;
      if (joint.length) {
        const tied = joint.length > 1 && Math.abs(joint[0].relativeMatch-joint[1].relativeMatch) < 1e-12;
        const preference = {primary:tied?null:joint[0],alternatives:tied?joint:joint.slice(1),...evidence,
          observations:fp.count || 0,priceOnlyCandidates:close.filter(c=>!joint.some(v=>names(c).includes(baseKey(v.name)))).map(c=>({id:c.id,label:c.label || c.id})),identityProbability:null};
        return {...out,status:tied?'inferred-tie':'inferred',preference,text:tied?'计费相容的指纹候选并列，暂不指定唯一首选'
          :'综合推测：'+joint[0].name+'（计费相容，按已有指纹排序）'+(disagreement?'；各指纹库首选不一致':'')};
      }
      if (fp.result.status === 'close') return {...out,status:'candidate',text:'指纹候选与计费相容，但缺少可比较的指纹分数，暂不排序'};
    }
    return {...out,status:match ? 'supported' : 'conflict',text:match ? close.length > 1 ? source + '与计费候选相容，但价格仍不能唯一识别' : source + '与计费首选一致（双来源佐证）' : source + '与计费候选不一致；检查改派、价格变化或指纹误差'};
  }
  function hasVisibleReasoningText(text) {
    const s = String(text || '').trim();
    if (!s || /^\(?(?:模型没有公开思考内容|未公开思考内容|model did not expose reasoning|thinking\.{0,3})\)?$/i.test(s)) return false;
    let nonWs = 0;
    for (const ch of s) { if (!/\s/.test(ch) && ++nonWs >= 2) return true; }
    return false;
  }
  function extractChatEvidence(chat, family, hints = new Map()) {
    const msgs = completed(chat);
    if (!msgs.length) return {};
    let maxReason = 0, totalReasonParts = 0, visibleReasoning = false;
    let visChars = 0, visTokens = 0, exactReasonTokens = 0, reasoningTextLength = 0, toolInputChars = 0, totalStepCount = 0, silentBashLoop = false;
    let sawPelicanWord = Boolean(typeof root.PelicanTest !== 'undefined' && chat?.sid && root.PelicanTest?.result?.(chat.sid));
    let sawSvgTag = false;
    for (const um of (chat?.messages || [])) {
      if (um?.role === 'user') {
        const uTxt = String(um.content || (um.parts || []).map(p => p?.text || '').join(' ') || '');
        if (/pelican|鹈鹕/i.test(uTxt)) sawPelicanWord = true;
      }
    }
    const toolIds = [];
    const msgVisTokensById = {}, msgReasonTokensById = {}, msgStepCountById = {}, msgDurationMsById = {};
    for (const m of msgs) {
      let msgReason = 0, msgVisText = '', msgReasonText = '', msgTools = 0, bashCount = 0, preToolChars = 0, interToolChars = 0, pendingInter = 0, seenTool = false;
      for (const p of (m.parts || [])) {
        const pt = String(p?.type || '');
        if (pt === 'reasoning' || pt === 'thinking') {
          msgReason += 1;
          totalReasonParts += 1;
          const rTxt = String(p.text || p.content || '');
          if (hasVisibleReasoningText(rTxt)) {
            visibleReasoning = true;
            msgReasonText += rTxt;
            reasoningTextLength += rTxt.length;
            exactReasonTokens += (typeof P.estimateTokens === 'function' ? P.estimateTokens(rTxt) : Math.round(rTxt.length / 3.5));
          }
        } else if (pt === 'text') {
          const tStr = String(p.text || '');
          msgVisText += tStr;
          if (/pelican|鹈鹕/i.test(tStr)) sawPelicanWord = true;
          if (/<svg[\s>]/i.test(tStr)) sawSvgTag = true;
          const trimLen = tStr.trim().length;
          if (!seenTool) preToolChars += trimLen;
          else pendingInter += trimLen;
        } else if (p?.toolCallId || pt.startsWith('tool-') || pt === 'dynamic-tool') {
          if (seenTool) { interToolChars += pendingInter; pendingInter = 0; }
          seenTool = true;
          msgTools += 1;
          const tid = String(p.toolCallId || p.id || '');
          if (tid && !toolIds.includes(tid)) toolIds.push(tid);
          const tn = String(p.toolName || p.name || pt || '');
          if (/bash|shell|exec|run_command/i.test(tn)) bashCount += 1;
          const pIn = p.input ?? p.args;
          if (pIn) {
            try {
              const sIn = typeof pIn === 'string' ? pIn : JSON.stringify(pIn);
              msgVisText += sIn;
              toolInputChars += sIn.length;
              if (/pelican|鹈鹕/i.test(sIn)) sawPelicanWord = true;
              if (/<svg[\s>]/i.test(sIn)) sawSvgTag = true;
            } catch {}
          }
        }
      }
      if (msgReason > maxReason) maxReason = msgReason;
      if (bashCount >= 2 && preToolChars === 0 && interToolChars === 0) silentBashLoop = true;
      const mVisTok = typeof P.estimateTokens === 'function' ? P.estimateTokens(msgVisText) : Math.round(msgVisText.length / 3.5);
      const mReasonTok = typeof P.estimateTokens === 'function' ? P.estimateTokens(msgReasonText) : Math.round(msgReasonText.length / 3.5);
      const stepStarts = (m.parts || []).filter(p => p?.type === 'step-start').length;
      const mSteps = Math.max(1, 1 + msgTools, stepStarts);
      totalStepCount += mSteps;
      if (m.id) {
        msgVisTokensById[m.id] = mVisTok;
        if (mReasonTok > 0) msgReasonTokensById[m.id] = mReasonTok;
        msgStepCountById[m.id] = mSteps;
        const mf = m._fmt || (m === msgs.at(-1) ? chat?.fmt : null);
        const mt0 = Number(mf?.t0 || mf?.tStart) || 0;
        const tm = m.metadata?.timing;
        const metaDur = (tm?.startedAt && tm?.completedAt && tm.completedAt > tm.startedAt) ? Math.round(tm.completedAt - tm.startedAt) : 0;
        const mDur = mf && mf.tEnd > mt0 ? Math.round(mf.tEnd - mt0) : (mf?.gen > 0 ? Math.round(mf.gen) : metaDur);
        if (mDur >= 50) msgDurationMsById[m.id] = mDur;
      }
      visChars += msgVisText.length;
      visTokens += mVisTok;
    }
    const fmt = chat?.fmt || msgs.at(-1)?._fmt;
    const tStart = Number(fmt?.t0 || fmt?.tStart) || 0;
    const lastIdForDur = msgs.at(-1)?.id;
    const fallbackDurMs = (lastIdForDur && msgDurationMsById[lastIdForDur]) || Object.values(msgDurationMsById).reduce((mx, v) => Math.max(mx, Number(v) || 0), 0);
    const durSec = fmt && fmt.tEnd > tStart ? (fmt.tEnd - tStart) / 1000 : (fmt?.gen > 0 ? fmt.gen / 1000 : (fallbackDurMs >= 50 ? fallbackDurMs / 1000 : 0));
    const turnDurationMs = durSec >= 0.05 ? Math.round(durSec * 1000) : 0;
    const fmtChars = Number(fmt?.tChars) || visChars;
    const fmtTN = Number(fmt?.tN) || 0;
    let avgChunk = fmtTN >= 4 && fmtChars > 0 ? Number((fmtChars / fmtTN).toFixed(2)) : 0;
    const cps = durSec >= 0.5 && fmtChars >= 60 ? Math.round(fmtChars / durSec) : null;
    let fmtReasonBlocks = Number(fmt?.rBlocks || fmt?.rN || fmt?.rE) || 0;
    let rWireDeltas = Number(fmt?.rWireDeltas) || 0;
    const fmtIds = Array.isArray(fmt?.ids) ? fmt.ids.slice() : [];
    for (const m of msgs) {
      const mf = m?._fmt;
      if (mf && mf !== fmt) {
        if ((Number(mf.rBlocks || mf.rN || mf.rE) || 0) > fmtReasonBlocks) fmtReasonBlocks = Number(mf.rBlocks || mf.rN || mf.rE) || 0;
        if ((Number(mf.rWireDeltas) || 0) > rWireDeltas) rWireDeltas = Number(mf.rWireDeltas) || 0;
        for (const x of mf.ids || []) fmtIds.push(x);
      }
      const meta = m?._sseMeta || (hints && typeof hints.get === 'function' ? hints.get(m.id) : null);
      if (meta) {
        if ((Number(meta.reasoningDeltas) || 0) > rWireDeltas) rWireDeltas = Number(meta.reasoningDeltas) || 0;
        if (Array.isArray(meta.ids)) {
          let metaR = 0;
          for (const x of meta.ids) {
            if (typeof x === 'string') {
              const isR = /^(?:rs_|tc_|reasoning)/i.test(x);
              if (isR) metaR++;
              fmtIds.push([isR ? 'r' : 't', x]);
            } else if (Array.isArray(x) && x.length >= 2) {
              const isR = x[0] === 'r' || x[0] === 'reasoning-start';
              if (isR) metaR++;
              if (x[1] != null) fmtIds.push([isR ? 'r' : 't', String(x[1])]);
            } else if (x && typeof x === 'object') {
              const isR = x.type === 'reasoning-start';
              if (isR) metaR++;
              if (x.id != null) fmtIds.push([isR ? 'r' : 't', String(x.id)]);
            }
          }
          if (metaR > fmtReasonBlocks) fmtReasonBlocks = metaR;
        }
      }
      for (const p of (m.parts || [])) {
        if (p?.id != null && (p.type === 'reasoning' || p.type === 'text')) {
          fmtIds.push([p.type === 'reasoning' ? 'r' : 't', String(p.id)]);
        }
      }
    }
    if (fmtReasonBlocks > 0 && totalReasonParts === 0) {
      totalReasonParts = fmtReasonBlocks;
      if (fmtReasonBlocks > maxReason) maxReason = fmtReasonBlocks;
    }
    const rIds = fmtIds.filter(x => x && x[0] === 'r').map(x => String(x[1] || ''));
    const allIds = fmtIds.map(x => String((x && x[1]) || '')).filter(Boolean);
    const hasCompatStreamId = allIds.some(i => /^(?:txt|reasoning)-\d+$/i.test(i) || /^[0-9a-z]{9}$/.test(i));
    let streamIdPrefix = null;
    if (allIds.some(i => /^(?:msg|rs)_[0-9a-fA-Z_-]{10,}/i.test(i))) streamIdPrefix = 'openai-rs';
    else if (rIds.length > 0 && rIds.some(i => /^tc_[A-Za-z0-9_-]{8,}$/.test(i)) && !visibleReasoning && (Number(fmt?.rChars) || 0) === 0) streamIdPrefix = 'openai-tc-empty';
    else if (allIds.length > 0 && allIds.every(i => /^\d+$/.test(i))) streamIdPrefix = 'numeric-only';
    const isGeminiSummary = streamIdPrefix === 'numeric-only' && /^\s*\*\*[^\n*]{2,80}\*\*/.test(String(fmt?.rHead || ''));
    const hasClosedWireId = !hasCompatStreamId && isGeminiSummary;
    if (Number(fmt?.rChars) >= 2 && hasVisibleReasoningText(fmt?.rSample || fmt?.rHead || '')) visibleReasoning = true;
    if (hasClosedWireId && visibleReasoning) visibleReasoning = false;
    if (visibleReasoning && streamIdPrefix && streamIdPrefix.startsWith('openai')) streamIdPrefix = null;
    const isOpenAiWireId = streamIdPrefix === 'openai-rs' || streamIdPrefix === 'openai-tc-empty';
    const hasLiveFmtStream = Boolean((fmt && ((Number(fmt.tN) || 0) > 0 || (Number(fmt.tools) || 0) > 0 || (Number(fmt.rBlocks) || 0) > 0 || (Array.isArray(fmt.ids) && fmt.ids.length > 0))) || fmtReasonBlocks > 0 || fmtIds.length > 0);
    let reasoningSignature = null;
    if (visibleReasoning) reasoningSignature = 'visible-text';
    else if (totalReasonParts > 0 && isOpenAiWireId) reasoningSignature = 'markers-only';
    else if (totalReasonParts > 0 && rWireDeltas > 0) reasoningSignature = 'empty-deltas';
    else if (totalReasonParts > 0 && hasLiveFmtStream && rWireDeltas === 0) reasoningSignature = 'markers-only';
    const prevEv = chat?._streamEvidence || (typeof root.Models !== 'undefined' && chat?.sid ? root.Models.get?.(chat.sid)?.streamEvidence : null);
    if (prevEv && !visibleReasoning && !prevEv.visibleReasoning) {
      if (!streamIdPrefix && prevEv.streamIdPrefix) streamIdPrefix = prevEv.streamIdPrefix;
      if (totalReasonParts === 0 && (Number(prevEv.rBlocks) || 0) > 0) {
        totalReasonParts = Number(prevEv.rBlocks) || 1;
        if (totalReasonParts > maxReason) maxReason = totalReasonParts;
      }
      if (!reasoningSignature && prevEv.reasoningSignature) reasoningSignature = prevEv.reasoningSignature;
      if (!(avgChunk > 0) && (Number(prevEv.avgChunk) || 0) > 0) avgChunk = Number(prevEv.avgChunk);
    }
    if (chat && typeof chat === 'object' && (streamIdPrefix || reasoningSignature || avgChunk > 0 || fmtReasonBlocks > 0 || totalReasonParts > 0)) {
      chat._streamEvidence = {
        ...(chat._streamEvidence || {}),
        ...(streamIdPrefix ? { streamIdPrefix } : {}),
        ...(reasoningSignature ? { reasoningSignature } : {}),
        ...(avgChunk > 0 ? { avgChunk } : {}),
        ...(Math.max(fmtReasonBlocks, totalReasonParts) > 0 ? { rBlocks: Math.max(fmtReasonBlocks, totalReasonParts, chat._streamEvidence?.rBlocks || 0) } : {}),
        ...(visibleReasoning ? { visibleReasoning: true } : {}),
      };
    }
    const famId = String(family?.family || family?.id || '').toLowerCase();
    const TOOL_FAMILY_MAP = {
      anthropic: 'claude', claude: 'claude',
      openai: 'openai', gpt: 'openai',
      google: 'google', gemini: 'google',
      xai: 'grok', grok: 'grok',
      deepseek: 'deepseek',
      kimi: 'kimi', moonshotai: 'kimi',
    };
    const rawTf = TOOL_FAMILY_MAP[famId] || ''; const toolFamily = (visibleReasoning && ['openai', 'claude', 'google', 'grok'].includes(rawTf)) ? '' : rawTf;
    const noReasoningParts = msgs.length > 0 && totalReasonParts === 0 && !visibleReasoning;
    const hiddenReasoning = totalReasonParts > 0 && !visibleReasoning;
    const hasPelicanSvg = Boolean(sawPelicanWord && sawSvgTag);
    return {
      assistantMsgCount: msgs.length,
      totalReasonParts,
      nReason: maxReason,
      visibleReasoning,
      hiddenReasoning,
      noReasoningParts,
      reasoningSignature,
      streamIdPrefix,
      avgChunk,
      turnDurationMs,
      visChars,
      visTokens,
      cps,
      exactReasonTokens,
      thinkDurationMs: (fmt && fmt.t1 > tStart && tStart > 0) ? Math.round(fmt.t1 - tStart) : 0,
      rBlocks: Math.max(fmtReasonBlocks, maxReason),
      reasoningStartCount: Math.max(fmtReasonBlocks, totalReasonParts),
      reasoningDeltaCount: rWireDeltas,
      reasoningTextLength,
      toolInputChars,
      streamIds: allIds,
      stepCount: Math.max(1, 1 + toolIds.length),
      totalStepCount: Math.max(totalStepCount, 1 + toolIds.length),
      msgVisTokensById,
      msgReasonTokensById,
      msgStepCountById,
      msgDurationMsById,
      silentBashLoop,
      hasPelicanSvg,
      toolIds,
      toolFamily,
    };
  }
  function cleanModelLabel(s) {
    const raw = String(s || '').trim();
    if (!raw) return raw;
    return raw.replace(/(?:\s*\((None|Minimal|Low|Medium|High|xHigh|Max)\))+$/i, (_, lastTier) => ` (${lastTier})`);
  }
  function analyze(chat, cost, doc, hints) {
    const catalog = normalize(doc), rows = captures(chat, cost, hints);
    const family = F.classifyFamily(rows);
    // A routed conversation can contain conflicting families. Never silently pick the majority.
    const families = new Set(F.extractToolCalls(rows).map(c => F.matchToolCall(c.toolCallId)?.family).filter(f => f && f !== 'arena-normalized'));
    const familyConflict = families.size > 1;
    const ch = (family.channels || [])[0];
    const routeSource = ch === 'vertex' ? 'google-vertex' : ch === 'bedrock' ? 'aws-bedrock' : ch === 'direct' ? 'anthropic-direct' : (family.routeSource || null);
    const evidence = { ...extractChatEvidence(chat, family, hints), routeSource };
    const vendors = familyConflict ? [] : (family.vendors || []);
    const narrow = vendors.filter(v => (!evidence.visibleReasoning || !['openai', 'anthropic', 'google', 'xai', 'x-ai'].includes(String(v).toLowerCase())) && catalog.some(c => c.vendor === v));
    let result = P.inferFromCaptures(rows, catalog, { sessionId: chat.sid, vendorHint: narrow, evidence });
    if (narrow.length && !result.baseMatch?.freeTokenMode) {
      const topN = result.baseMatch?.candidates?.[0];
      const fullRes = P.inferFromCaptures(rows, catalog, { sessionId: chat.sid, vendorHint: [], evidence });
      const topF = fullRes.baseMatch?.candidates?.[0];
      if (!topN || !topN.diophantinePassed || (topN.scoreResidual ?? topN.residual) > 0.02) {
        if (topF && (!topN || (topF.diophantinePassed && !topN.diophantinePassed) || (topF.scoreResidual ?? topF.residual) + 0.015 < (topN.scoreResidual ?? topN.residual))) {
          result = fullRes;
        }
      }
      if (result !== fullRes && Array.isArray(result.baseMatch?.candidates) && Array.isArray(fullRes.baseMatch?.candidates)) {
        const haveIds = new Set(result.baseMatch.candidates.map(c => c.id));
        const topEff = Number(topN?.effectiveResidual ?? topN?.scoreResidual ?? topN?.residual ?? 0);
        for (const fc of fullRes.baseMatch.candidates) {
          if (!fc || haveIds.has(fc.id)) continue;
          if (!fc.impossible && (fc.freeTokens == null || Math.abs(fc.freeTokens) <= 1) && fc.diophantinePassed && (fc.priceResidual ?? fc.residual ?? 1) < 2e-3) {
            const fcEff = Math.max(topEff + 0.004, Number(fc.effectiveResidual ?? fc.scoreResidual ?? fc.residual ?? 0));
            result.baseMatch.candidates.push({ ...fc, effectiveResidual: fcEff, scoreResidual: fcEff });
            haveIds.add(fc.id);
          }
        }
        result.baseMatch.candidates.sort((a, b) => (a.effectiveResidual ?? a.scoreResidual ?? a.residual ?? 1) - (b.effectiveResidual ?? b.scoreResidual ?? b.residual ?? 1));
      }
    }
    const b = result.baseMatch;
    if (b) {
      if (Array.isArray(b.candidates) && typeof P.isOpenSourceModel === 'function') {
        if (evidence.visibleReasoning === true) {
          const openOnly = b.candidates.filter(c => !P.isClosedSourceModel(c));
          if (openOnly.length > 0) b.candidates = openOnly;
        } else {
          const closedOnly = b.candidates.filter(c => !P.isOpenSourceModel(c));
          if (closedOnly.length > 0) b.candidates = closedOnly;
        }
      }
      if (b.initialModelLabel) b.initialModelLabel = cleanModelLabel(b.initialModelLabel);
      if (b.routedModelLabel) b.routedModelLabel = cleanModelLabel(b.routedModelLabel);
      if (Array.isArray(b.segments)) {
        for (const seg of b.segments) {
          if (seg && seg.bestLabel) seg.bestLabel = cleanModelLabel(seg.bestLabel);
        }
      }
      // Suppress false-positive effort downgrade on heavy multi-step tool/code turns where thinking tokens remain high
      if (b.effortDowngraded && !b.routeSwitched && Array.isArray(b.segments) && b.segments.length >= 2) {
        const lastSeg = b.segments[b.segments.length - 1];
        if ((lastSeg?.stepCount || 1) >= 3 && (lastSeg?.reasoningTokens || 0) >= 450 && (lastSeg?.visibleOutTokens || 0) >= 1500) {
          b.effortDowngraded = false;
          if (b.routeType === 'effort') b.routeType = null;
        }
      }
    }
    const reason = !catalog.length ? 'no-catalog' : !b.ok ? result.unitPrice.reason || b.reason : '';
    const unreliable = familyConflict || b.vendorConflict || b.freeTokenMode || b.degenerate || b.ratesLookStale;
    const scope = familyConflict ? 'family-conflict' : !vendors.length ? 'unnarrowed' : !narrow.length || b.vendorConflict ? 'out-of-pool' : 'narrowed';
    const cacheApprox = !!(result.costs?.cacheReadUsd || result.costs?.cacheWriteUsd);
    const topCand = b && Array.isArray(b.candidates) ? b.candidates[0] : null;
    const preimage = (topCand && typeof P.solveConversationPreimage === 'function')
      ? P.solveConversationPreimage(result.costSnapshot, topCand)
      : null;
    return { reason, family, familyConflict, scope, unreliable, cacheApprox, result, preimage, evidence,
      pool: { size: catalog.length, at: doc?.capturedAt || null, origin: doc?.origin === 'live-sync' ? 'live' : 'bundled' } };
  }
  // Export only evidence summaries: never copy traces, prompts, tool arguments or raw stream IDs.
  function diagnostics(state, { latestId, model, trace, tracePaired = false, agreement } = {}) {
    const i = state.info || state.lastInfo, b = i?.result.baseMatch, used = i?.result.unitPrice.used || [];
    const observations = state.ledger?.observations || 0;
    const effResOf = row => Number.isFinite(row.effectiveResidual) ? row.effectiveResidual : (Number.isFinite(row.scoreResidual) ? row.scoreResidual : row.residual);
    const isRoutedOrWeak = Boolean(b?.routeSwitched || b?.effortDowngraded);
    const candidates = (b?.candidates || []).slice(0,24).map(row => {
      const er = effResOf(row);
      const m = C.residualToConfidence(er);
      const candId = row.effortProfile?.stealthModelId || row.id;
      const candLabel = cleanModelLabel(row.effortProfile?.stealthModelLabel || (isRoutedOrWeak ? row.dynamicLabel : null) || row.label || candId);
      return {
        id:candId, label:candLabel, residual:amount(row.residual),
        scoreResidual:amount(row.scoreResidual ?? row.residual),
        effectiveResidual:amount(er),
        match:m,
        predictedBaseUsd:amount(row.predictedBase), averageMatch:state.ledger?.models?.[row.id]?.confidence ?? m,
        observations:state.ledger?.models?.[row.id]?.observations || 0, cacheRateSource:row.cacheRateSource || null,
        diophantinePassed:row.diophantinePassed !== false,
        matchedVariant:row.matchedVariant || '2026-10-15',
        priceTier:row.priceTier || 1,
        solverTier:row.solverTier || 1,
        dynamicLabel:cleanModelLabel(row.dynamicLabel || row.label || row.id),
        baseLabel:cleanModelLabel(row.baseLabel || row.label || row.id),
        inferredEffort:row.inferredEffort || null,
        effortProfile:row.effortProfile || null,
        solvedTokens:row.solvedTokens || null,
        matchedDims:row.matchedDims || [],
      };
    }).sort((x, y) => (y.match - x.match) || ((x.scoreResidual ?? 1e9) - (y.scoreResidual ?? 1e9)) || ((y.diophantinePassed ? 1 : 0) - (x.diophantinePassed ? 1 : 0)) || String(x.id).localeCompare(String(y.id)));
    const best = candidates[0], gap = candidates.length > 1 ? best.match - candidates[1].match : null;
    const close = best ? candidates.filter(row => Boolean(row.diophantinePassed) === Boolean(best.diophantinePassed) && Math.abs(best.match - row.match) <= 1.2).length : 0;
    const latestCovered = !!latestId && used.some(row => row.messageId === latestId);
    const verdict = !i || i.reason ? 'insufficient' : !latestCovered ? 'historical' : agreement?.status === 'conflict' ? 'conflict'
      : i.unreliable || !best || best.match < 95 ? 'insufficient' : agreement?.status === 'historical' ? 'historical-identity'
      : agreement?.status === 'inferred' ? 'conditional-ranked' : agreement?.status === 'inferred-tie' ? 'conditional-tie' : close > 1 ? 'ambiguous'
      : agreement?.status === 'supported' ? 'corroborated' : 'conditional';
    const fp = model?.fingerprint && !model.fingerprint.skipped ? model.fingerprint : null;
    const fpEvidence = fingerprintEvidence(fp);
    const historical = !!model?.fromTitle || !!(model?.messageId && latestId && model.messageId !== latestId);
    const numeric = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
    const efforts = tracePaired ? [...new Set((trace?.calls || []).map(c => c.effort).filter(e => ['none','minimal','low','medium','high','xhigh','max','conflict'].includes(e)))] : [];
    const effort = efforts.length === 1 && efforts[0] !== 'conflict' ? efforts[0] : null;
    const implied = i?.result.implied;
    const missing = [];
    if (!used.length) missing.push('尚无配对账单，先成功读取完整回复的费用');
    else if (!latestCovered) missing.push('账单未覆盖最近完整回复，当前为历史费用证据');
    if (used.length && observations < 2) missing.push('只有一轮去重观测，多轮自然对话可补充证据');
    if (historical) missing.push('已有型号或指纹来自历史回复，须取得本轮证据后再交叉核对');
    if (close > 1) missing.push(agreement?.preference ? '价格仍无法区分接近候选；当前排序依赖已有指纹，重复同价账单不会单独确认身份' : '多个候选价格接近，需要独立的型号证据区分');
    if (fpEvidence.libraryDisagreement) missing.push('有效指纹库的首选不一致，保留备选；可手动核对已有回复的指纹来源');
    if (implied?.reason === 'need-more-messages') missing.push('反解费率至少需要' + implied.need + '条费用样本，当前' + implied.have + '条；样本还须线性独立');
    else if (implied?.reason === 'singular') missing.push('费用样本成比例，无法反解唯一费率');
    else if (implied?.ok) missing.push('费率反解仍依赖基准计价公式，不是直接报告的真实单价');
    if (!efforts.length) missing.push('没有同轮显式推理档位，候选名中的Max/High不能证明实际配置');
    if (i?.cacheApprox) missing.push('缓存单价为历史近似值，100%吻合也不代表身份确认');
    return {
      format:'brana-billing-diagnostics/v1',
      read:{status:state.status,httpStatus:state.httpStatus ?? null,at:state.at || null,retryAt:state.retryAt || null},
      samples:{pairedMessages:used.length,observations,latestCovered,activeChannels:b?.activeChannels || []},
      family:i ? {label:i.family.label,kind:i.family.evidenceKind,strength:i.family.evidenceStrength,count:i.family.evidenceCount || 0,
        matched:i.family.corroboration?.matched || [],conflicted:i.family.corroboration?.conflicted || [],reasoning:i.result.unitPrice.reasoningSignature || null} : null,
      pricing:i ? {pool:i.pool,observedBaseUsd:amount(b?.observedBase),cacheApprox:i.cacheApprox,
        implied:implied ? {ok:!!implied.ok,reason:implied.reason || null,need:implied.need ?? null,have:implied.have ?? used.length,
          ratesPerMillion:implied.ok ? Object.fromEntries(Object.entries(implied.rates || {}).map(([k,v])=>[k,v*1e6])) : null} : null} : null,
      confidence:{verdict,bestMatch:best?.match ?? null,gapPoints:gap,closeCandidates:close,identityProbability:null},
      candidates, hasCompatThinking:!!(i?.evidence && i.evidence.visibleReasoning === true && !i.evidence.noReasoningParts), agreement:agreement || null, preimage:i?.preimage || null, routeSwitched:!!b?.routeSwitched, effortDowngraded:!!b?.effortDowngraded, routeType:b?.routeType || (b?.routeSwitched ? 'model' : b?.effortDowngraded ? 'effort' : (i?.familyConflict ? 'model' : null)), initialModelId:b?.initialModelId || null, initialModelLabel:cleanModelLabel(b?.initialModelLabel) || null, routedModelId:b?.routedModelId || null, routedModelLabel:cleanModelLabel(b?.routedModelLabel) || null, initialEffort:b?.initialEffort || null, latestEffort:b?.latestEffort || null, segments:b?.segments || [],
      fingerprint:fp ? {name:fp.result?.nearest?.id || null,library:fp.result?.library || fp.source || null,status:fp.result?.status || null,
        relativeProbability:relative(fp.result?.signals?.relative_probability),count:fp.count || 0,historical,...fpEvidence} : null,
      strength:{catalogLabel:best?.label || null,effort,effortConflict:efforts.includes('conflict') || efforts.length > 1,
        reasoningScore:fp ? numeric(fp.reasoning?.score,0,100) : null,tierEstimate:fp?.reasoning?.tier || null,historical,
        scoreMethod:'既有思考时长估算，非能力测评',capability:'unmeasured'},
      warnings:warnings(state),missing,
    };
  }
  // The site gates cost visibility behind this display flag. It does not replace account authorization.
  // Serialize readers so one request cannot remove another request's temporary setting.
  function costRequest(request, cookies) {
    let queue = Promise.resolve();
    const prefix = 'ph-toolbar-overrides=';
    const temporary = encodeURIComponent(JSON.stringify({ 'credit-system-m1': 'cost-shown' }));
    const current = () => String(cookies.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(prefix))?.slice(prefix.length);
    return (path, options) => {
      const run = queue.then(async () => {
        const before = current(); let enabled = false;
        try { enabled = JSON.parse(decodeURIComponent(before || 'null'))?.['credit-system-m1'] === 'cost-shown'; } catch {}
        if (before !== undefined && !enabled) throw Error('网站已有其他费用显示设置；请先在官方页面开启费用显示后重试');
        const owned = before === undefined;
        try {
          if (owned) {
            cookies.cookie = prefix + temporary + '; Path=/; Max-Age=60; SameSite=Lax; Secure';
            if (current() !== temporary) throw Error('浏览器未接受费用显示设置，请检查网站 Cookie 权限');
          }
          return await request(path, { ...options, redirect: 'error' });
        } finally {
          // Preserve a setting changed by the site/user while the request was in flight.
          if (owned && current() === temporary) {
            cookies.cookie = prefix + '; Path=/; Max-Age=0; SameSite=Lax; Secure';
            if (current() === temporary) throw Error('临时费用显示设置清理失败，请在官方页面检查 Cookie');
          }
        }
      });
      queue = run.catch(() => {}); return run;
    };
  }
  function create({ request, account = () => '', clock = Date.now, bundled, savedCatalog, saveCatalog = () => {}, changed = () => {}, paymentsReceived = () => {} }) {
    const states = new Map(), hints = new WeakMap(), cooldowns = new Map(), references = new Map();
    let catalog = (() => {
      const sRows = Array.isArray(savedCatalog?.data) ? savedCatalog.data : [];
      const bRows = Array.isArray(bundled?.data) ? bundled.data : [];
      if (sRows.length < S.MIN_ROWS) return bundled;
      if (!bRows.length) return savedCatalog;
      const byId = new Map(bRows.map(r => [r.id, r]));
      const bNewer = !savedCatalog?.capturedAt || (bundled?.capturedAt && String(bundled.capturedAt) >= String(savedCatalog.capturedAt));
      const merged = sRows.map(r => {
        const b = byId.get(r.id);
        if (!b) return r;
        const rInAlt = Array.isArray(b.altRates) && b.altRates.some(ar => Math.abs((Number(ar.prompt) || 0) - (Number(r.inputPerMillion) || 0)) < 1e-6 && Math.abs((Number(ar.completion) || 0) - (Number(r.outputPerMillion) || 0)) < 1e-6);
        return (bNewer || rInAlt)
          ? { ...r, ...b }
          : { ...b, ...r, altRates: b.altRates || r.altRates, cacheReadVariants: b.cacheReadVariants || r.cacheReadVariants, cacheWriteVariants: b.cacheWriteVariants || r.cacheWriteVariants, fpId: b.fpId || r.fpId, effort: b.effort || r.effort, medOut: b.medOut || r.medOut, p25Out: b.p25Out || r.p25Out, p75Out: b.p75Out || r.p75Out, avgTaskCost: b.avgTaskCost || r.avgTaskCost, agentTaskSamples: b.agentTaskSamples || r.agentTaskSamples, sessions: b.sessions || r.sessions, leaderboardRank: b.leaderboardRank || r.leaderboardRank, protoFamily: b.protoFamily || r.protoFamily };
      });
      for (const b of bRows) if (!merged.some(r => r.id === b.id)) merged.push(b);
      return { ...bundled, ...savedCatalog, data: merged };
    })();
    let catalogError = '', revision = 0;
    const key = sid => JSON.stringify([account(), sid]);
    function state(sid) {
      const k = key(sid);
      if (!states.has(k)) states.set(k, { sid, status: 'idle', ledger: C.emptyLedger(), nextAt: 0, generation: revision });
      if (states.size > MAX_SESSIONS) for (const [id, s] of states) {
        if (states.size <= MAX_SESSIONS) break;
        if (id !== k && !s.pending) states.delete(id);
      }
      return states.get(k);
    }
    function observe(chat, e) {
      if (!chat?.sid || !e) return;
      let s = hints.get(chat); if (!s) { s = { current: null, messages: new Map() }; hints.set(chat, s); }
      const liveId = e.messageId || chat.live?.id || null;
      if (e.type === 'start') {
        s.current = liveId || '_active';
        s.messages.set(s.current, { ids: [], reasoningDeltas: 0 });
        while (s.messages.size > MAX_MESSAGES) s.messages.delete(s.messages.keys().next().value);
      } else if (liveId && s.current === '_active' && liveId !== '_active') {
        const prev = s.messages.get('_active');
        if (prev && !s.messages.has(liveId)) s.messages.set(liveId, prev);
        s.messages.delete('_active');
        s.current = liveId;
      } else if (!s.current) {
        s.current = liveId || '_active';
        if (!s.messages.has(s.current)) s.messages.set(s.current, { ids: [], reasoningDeltas: 0 });
      }
      const m = s.messages.get(s.current); if (!m) return;
      if (['text-start', 'reasoning-start'].includes(e.type) && m.ids.length < 64) m.ids.push({ type: e.type, ...(e.id != null ? { id: String(e.id).slice(0, 200) } : {}) });
      if (e.type === 'reasoning-delta') m.reasoningDeltas++;
      s.messages.set('_last', m);
      if (chat?.live) chat.live._sseMeta = m;
    }
    function priceReference(name) {
      const key = String(name || '');
      if (!references.has(key)) {
        if (references.size >= 256) references.delete(references.keys().next().value);
        references.set(key, reference(catalog,name));
      }
      return references.get(key);
    }
    function syncCatalog(html) {
      try {
        const parsed = S.parseAgentLeaderboard(html);
        if (!parsed.ok) throw Error('价格表未更新：识别到' + parsed.stats.priced + '条有效价格（至少需要' + S.MIN_ROWS + '条），继续使用已有价格快照');
        const next = S.mergeIntoCatalog(parsed.rows, bundled);
        if (normalize(next).length < S.MIN_ROWS) throw Error('榜单价格不足，保留原候选池');
        catalog = next; references.clear(); revision++; catalogError = '';
        for (const s of states.values()) { s.info = null; s.ranked = []; s.ledger = C.emptyLedger(); }
        saveCatalog(next); changed(null); return true;
      } catch (e) { catalogError = e.message; changed(null); return false; }
    }
    function refresh(chat, opts = {}) {
      if (!chat?.sid) return Promise.resolve(null);
      const s = state(chat.sid), owner = account();
      if (s.pending) return s.pending;
      const compMsgs = completed(chat);
      const pendMsgs = opts?.allowPending ? (chat?.messages || []).filter(m => m?.role === 'assistant' && m.id && !(m.parts || []).some(p => p.type === 'error')).slice(-MAX_MESSAGES) : [];
      const activeMsgs = compMsgs.length ? compMsgs : pendMsgs;
      if ((chat.busy && !opts?.allowPending) || !activeMsgs.length) { s.status = 'waiting'; changed(chat.sid); return Promise.resolve(s); }
      const blocked = opts?.bypassCooldown ? null : cooldowns.get(owner);
      const until = Math.max(opts?.force ? 0 : s.nextAt, blocked?.until || 0);
      if (clock() < until) { if (blocked && blocked.until > clock()) { s.status = blocked.status; s.error = blocked.error; s.httpStatus = blocked.httpStatus; } s.retryAt = until; changed(chat.sid); return Promise.resolve(s); }
      const snapshot = { sid: chat.sid, _streamEvidence: chat._streamEvidence ? { ...chat._streamEvidence } : null, fmt: chat.fmt ? { ...chat.fmt, ids: Array.isArray(chat.fmt.ids) ? chat.fmt.ids.slice() : [] } : null, fmtGuess: chat.fmtGuess || null, messages: activeMsgs.map(m => ({ ...m, metadata: { ...m.metadata, pending: false }, parts: (m.parts || []).map(p => ({ ...p })) })) };
      s.status = 'loading'; s.error = ''; s.httpStatus = null; s.retryAt = 0; s.nextAt = clock() + 15000; changed(chat.sid);
      const work = Promise.resolve().then(() => request('/api/chat/' + encodeURIComponent(chat.sid) + '/cost?includeSession=true', { bg: true, noRelogin: true, timeout: 15000 }))
        .then(cost => {
          if (account() !== owner || states.get(JSON.stringify([owner, chat.sid])) !== s) return;
          cooldowns.delete(owner);
          if (!validCost(cost)) throw Error('计费返回格式或计价策略不支持');
          const compIds = new Set(snapshot.messages.map(m => m.id));
          if (!s.costLedger || typeof s.costLedger !== 'object') s.costLedger = {};
          for (const [mid, row] of Object.entries(cost.messages || {})) {
            if (compIds.has(mid) && row && typeof row === 'object') s.costLedger[mid] = row;
          }
          const mergedMessages = { ...s.costLedger, ...(cost.messages || {}) };
          const mergedCost = { ...cost, messages: mergedMessages };
          const info = analyze(snapshot, mergedCost, catalog, hints.get(chat)?.messages);
          if (snapshot._streamEvidence) chat._streamEvidence = { ...(chat._streamEvidence || {}), ...snapshot._streamEvidence };
          if (s.generation !== revision) { s.ledger = C.emptyLedger(); s.generation = revision; }
          s.coveredIds = Object.keys(cost.messages || {}); if (Object.keys(mergedMessages).length > s.coveredIds.length) s.coveredIds = Object.keys(mergedMessages);
          if (!opts?.allowPending && !chat.busy) s.postTurnCoveredIds = s.coveredIds.slice(); s.payments = payments(snapshot, mergedCost); paymentsReceived(chat.sid, s.payments, owner); s.info = info; if (!info.reason) s.lastInfo = info; s.at = clock(); s.status = info.reason ? 'unavailable' : 'ready';
          const b = info.result.baseMatch, ids = (info.result.unitPrice.used || []).map(r => r.messageId);
          // Replace the same observation key; polling must never increase confidence by itself.
          if (!info.reason && !info.unreliable && b.candidates.length) {
            const roundKey = C.roundKeyOf(ids);
            if (!Object.hasOwn(s.ledger.rounds, roundKey) && Object.keys(s.ledger.rounds).length >= MAX_MESSAGES) {
              const oldest = Object.entries(s.ledger.rounds).sort((a,b) => a[1].seq - b[1].seq)[0][0]; delete s.ledger.rounds[oldest];
            }
            s.ledger = C.mergeObservation(s.ledger, chat.sid, b.candidates.slice(0, 24).map(c => ({ ...c, id: c.effortProfile?.stealthModelId || c.id, label: c.effortProfile?.stealthModelLabel || c.dynamicLabel || c.label || c.id })), { roundKey, now: clock() });
          } else s.ledger = C.emptyLedger();
          s.ranked = C.rank(s.ledger, {}, 6); s.error = '';
          const latestSnapId = snapshot.messages.at(-1)?.id;
          if (latestSnapId && !(s.coveredIds || []).includes(latestSnapId) && !ids.includes(latestSnapId)) {
            s.nextAt = clock() + 350;
          }
        }).catch(e => {
          if (account() !== owner) return;
          if (e?.rateLimitedLocally) { s.nextAt = clock() + 3000; return; }
          s.httpStatus = Number.isInteger(e.status) ? e.status : null;
          s.status = [401,403].includes(e.status) ? 'forbidden' : 'error';
          s.error = e.responseFormat ? '计费接口返回网页或验证页面（HTTP ' + e.status + '），请在官方页面完成验证后重试' : e.status === 401 ? '计费接口登录已失效（HTTP 401），请重新登录后重试' : e.status === 403 ? '计费接口拒绝读取（HTTP 403），请在官方页面检查费用显示与账号权限' : e.status === 429 ? '计费接口限流（HTTP 429），请等待服务端重试时间' : '计费读取失败：' + String(e.message || e).slice(0,160);
          if (s.ranked?.length) s.lastRanked = s.ranked;
          if (s.info && !s.info.reason) s.lastInfo = s.info;
          s.info = null; s.payments = []; s.ranked = []; s.ledger = C.emptyLedger();
          const delay = Math.max(e.status === 403 ? 120000 : e.status === 401 ? 15000 : e.status === 429 ? 60000 : 30000, Number(e.retryAfterMs) || 0);
          s.nextAt = clock() + delay; s.retryAt = s.nextAt;
          if (e.status === 403 || e.status === 429) cooldowns.set(owner, { until:s.nextAt, status:s.status, error:s.error, httpStatus:s.httpStatus });
        }).finally(() => { s.pending = null; if (account() === owner) changed(chat.sid); });
      s.pending = work.then(() => s); return s.pending;
    }
    function exportSummary(sid) {
      const s = state(sid), i = s.info;
      // Selected numeric observations only: never export response bodies, prompts or tool arguments.
      return { format: 'brana-billing-probe/v1', sessionId: sid, at: s.at || null, status: s.status,
        pool: i?.pool || null, scope: i?.scope || null, family: i?.family?.label || null,
        warnings: warnings(s), ranked: s.ranked || [], costs: i?.result.costs || null,
        payments: s.payments || [], rates: P.AGENT_P50_RATES, observations: s.ledger.observations, catalogError };
    }
    return { state, observe, refresh, clearCooldowns: () => { cooldowns.clear(); for (const s of states.values()) { s.nextAt = 0; s.retryAt = 0; if (s.httpStatus === 429 || s.httpStatus === 403 || s.httpStatus === 401) { s.status = 'idle'; s.error = ''; s.httpStatus = null; } } }, syncCatalog, exportSummary, reference: priceReference, consensus: (sid,model,latestId) => consensus(state(sid),model,latestId,catalog), diagnostics:(sid,ctx={}) => diagnostics(state(sid),{...ctx,agreement:consensus(state(sid),ctx.model,ctx.latestId,catalog)}), get catalogError() { return catalogError; }, get catalogMeta() { return { size:normalize(catalog).length, at:catalog?.capturedAt, live:catalog?.origin === 'live-sync' }; }, get catalogRaw() { return Array.isArray(catalog?.data) ? catalog.data : []; }, get catalogData() { return normalize(catalog); } };
  }
  function warnings(s) {
    const i = s.info; if (!i) return [];
    return [i.scope === 'unnarrowed' && '未取得工具/消息ID的家族线索，按整份Agent名单比价；数字指纹单独核对',
      i.scope === 'out-of-pool' && '家族与可用价格候选不一致，未按家族收窄',
      i.familyConflict && '同会话出现多个家族，可能改派；价格不能确定身份',
      i.cacheApprox && '缓存费率为历史近似值，结果仅供参考',
      i.result.baseMatch.freeTokenMode && '输入通道零计费，价格定位失效',
      i.result.baseMatch.degenerate && '有效费率成比例，无法通过价格区分',
      i.result.baseMatch.ratesLookStale && '所有候选偏差较大，基准费率可能已变化',
      i.result.baseMatch.vendorConflict && '可行价格候选与家族冲突'].filter(Boolean);
  }
  const API = { create, costRequest, diagnostics, analyze, captures, validCost, warnings, completed, payments, reference, consensus, modelKey };
  root.ArenaBilling = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
