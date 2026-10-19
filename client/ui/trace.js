// Run telemetry parser: organizes span events, token usage, and resample metadata per conversation turn
const Trace = (() => {
  const CALL_DETAIL = 16, DEEP_DETAIL = 120, KEEP_TURNS = 80, KEEP_CHATS = 500, RAW_TURNS = 3, RAW_BYTES = 60000;
  const SPAN = /^[a-f0-9]{16,32}$/i;
  const STREAM = /^ai\.(streamText\.doStream|generateText\.doGenerate)$/;
  const ROUTE = /^(model\.resample\.(attempt_failed|switched|committed)|failover\.record_inserted|agent\.empty_turn|Agent turn failed)$/;
  const toMs = v => {
    if (v == null) return null;
    if (typeof v === 'string' && /^\d{10,}$/.test(v)) { const n = Number(v.length > 15 ? v.slice(0, -6) : v); return Number.isFinite(n) ? n : null; }
    if (typeof v === 'number' && Number.isFinite(v)) return v > 1e15 ? Math.round(v / 1e6) : v;
    const t = Date.parse(v); return Number.isFinite(t) ? t : null;
  };
  const durMs = v => { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) && n >= 0 ? Math.round(n / 1e5) / 10 : null; };
  const int = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? +v : null);
  const obj = v => { if (typeof v === 'string' && v.length < 600000) { try { v = JSON.parse(v); } catch { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  function get(o, path) {
    if (!o || typeof o !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(o, path)) return o[path];
    // 键名可能是扁平的（"ai.usage.inputTokens"）、嵌套的，或混合（"ai.usage": {...}）
    const ks = path.split('.');
    for (let i = ks.length - 1; i >= 1; i--) {
      const head = ks.slice(0, i).join('.');
      if (Object.prototype.hasOwnProperty.call(o, head)) { const v = get(typeof o[head] === 'string' && /^\s*\{/.test(o[head]) ? obj(o[head]) : o[head], ks.slice(i).join('.')); if (v !== undefined) return v; }
    }
    return undefined;
  }
  const first = (o, paths) => { for (const p of paths) { const v = get(o, p); if (v !== undefined && v !== null && v !== '') return v; } return null; };
  const firstInt = (o, paths) => { for (const p of paths) { const v = int(get(o, p)); if (v !== null) return v; } return null; };
  const label = v => typeof v === 'string' && v.length <= 200 && !/[\x00-\x1f]|Bearer\s|eyJ[\w-]+\.[\w-]+\./.test(v) ? v.trim() : null;
  const pill = (e, ic) => (e.style?.accessory?.items || []).find(x => x?.icon === ic && typeof x.text === 'string')?.text || null;
  const kNum = s => { const m = /^([\d.]+)\s*([kKmM]?)$/.exec(String(s || '').replace(/,/g, '').trim()); if (!m) return null; return Math.round(+m[1] * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1)); };
  const usdNum = s => { const m = /\$?\s*([\d.]+)/.exec(String(s || '')); return m ? +m[1] : null; };

  // 原始数据精简：去掉提示词 / 回答 / 工具定义等正文，长字符串截断
  const RAW_DROP = /^(messages?|parts|text|content|delta|headers|authorization|cookie|password|secret|signature|tools|definitions|system|system_instructions|toolCalls|responseText|reasoningText|prompt|user_message|client_data)$/i;
  function trimRaw(v, d = 0) {
    if (v === null || typeof v !== 'object') return typeof v === 'string' && v.length > 240 ? v.slice(0, 240) + '…[共 ' + v.length + ' 字符]' : v;
    if (d > 8) return '[层级过深]';
    if (Array.isArray(v)) return v.slice(0, 60).map(x => trimRaw(x, d + 1));
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 160)) out[k] = RAW_DROP.test(k) ? '[已省略 ' + (typeof x === 'string' ? x.length + ' 字符' : Array.isArray(x) ? x.length + ' 项' : typeof x) + ']' : trimRaw(x, d + 1);
    return out;
  }
  // 推理档位（显式参数）：只在配置类字段里找，不看正文
  const LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  function effortOf(p) {
    const found = new Set(), budgets = new Set();
    (function walk(n, parent, d) {
      if (!n || typeof n !== 'object' || d > 7) return;
      for (const [k, raw] of Object.entries(n).slice(0, 120)) {
        if (RAW_DROP.test(k)) continue;
        let v = raw; if (typeof v === 'string' && /^(providerOptions|provider_options|reasoning|thinking|thinkingConfig|output_config|outputConfig)$/.test(k)) v = obj(v);
        if (/^(reasoning_effort|reasoningEffort|thinkingLevel|thinking_level)$/.test(k) || (k === 'effort' && /^(reasoning|output_config|outputConfig)$/.test(parent))) { if (typeof v === 'string' && LEVELS.includes(v.toLowerCase())) found.add(v.toLowerCase()); }
        else if (/^(thinkingBudget|thinking_budget|budget_tokens|budgetTokens)$/.test(k) && Number.isInteger(v)) budgets.add(v);
        else if (v && typeof v === 'object') walk(v, k, d + 1);
      }
    })({ settings: get(p, 'ai.settings'), providerOptions: get(p, 'ai.prompt.providerOptions') }, '', 0);
    return { effort: found.size === 1 ? [...found][0] : found.size > 1 ? 'conflict' : null, budgets: [...budgets] };
  }
  function probeIdOf(p){
    if(typeof ProbeLib==='undefined')return null;
    let messages=first(p,['ai.prompt.messages','gen_ai.input.messages']);
    if(typeof messages==='string'){if(messages.length>600000)return null;try{messages=JSON.parse(messages);}catch{return null;}}
    if(!Array.isArray(messages))return null;
    const last=messages.filter(m=>m?.role==='user').at(-1);if(!last)return null;
    const content=last.content??last.parts;
    const text=typeof content==='string'?content:Array.isArray(content)&&content.every(x=>x?.type==='text'&&typeof x.text==='string')?content.map(x=>x.text).join('\n'):null;
    return typeof text==='string'?ProbeLib.PROBES.find(q=>q.prompt===text.trim())?.id||null:null;
  }
  // 一次调用（doStream span）的详情
  function streamDetail(d) {
    const p = obj(d?.properties), ai = d?.ai && typeof d.ai === 'object' ? d.ai : {};
    const meta = obj(get(p, 'ai.response.providerMetadata'));
    const out = {
      detailed: !!d?.properties,
      probeId: probeIdOf(p), proofSchema:1,
      request: label(first(p, ['ai.telemetry.metadata.apiModelName', 'gen_ai.request.model', 'ai.model.id'])),
      response: label(first(p, ['ai.response.model', 'gen_ai.response.model'])),
      provider: label(first(p, ['ai.telemetry.metadata.modelProvider'])),
      adapter: label(first(p, ['ai.model.provider'])),
      finish: label(first(p, ['ai.response.finishReason'])),
      input: firstInt(p, ['ai.usage.inputTokens', 'ai.usage.promptTokens', 'gen_ai.usage.input_tokens']),
      output: firstInt(p, ['ai.usage.outputTokens', 'ai.usage.completionTokens', 'gen_ai.usage.output_tokens']),
      total: firstInt(p, ['ai.usage.totalTokens', 'gen_ai.usage.total_tokens']),
      cacheRead: firstInt(p, ['ai.usage.cachedInputTokens', 'ai.usage.inputTokenDetails.cacheReadTokens', 'ai.usage.cacheReadTokens', 'gen_ai.usage.cache_read_input_tokens']) ?? firstInt(meta, ['anthropic.usage.cache_read_input_tokens', 'anthropic.cacheReadInputTokens', 'openai.cachedPromptTokens', 'azure.cachedPromptTokens', 'google.usageMetadata.cachedContentTokenCount', 'vertex.usageMetadata.cachedContentTokenCount']),
      cacheWrite: firstInt(p, ['ai.usage.inputTokenDetails.cacheWriteTokens', 'ai.usage.cacheWriteTokens', 'gen_ai.usage.cache_creation_input_tokens']) ?? firstInt(meta, ['anthropic.cacheCreationInputTokens', 'anthropic.usage.cache_creation_input_tokens']),
      reasoning: firstInt(p, ['ai.usage.reasoningTokens', 'gen_ai.usage.reasoning_tokens', 'ai.usage.outputTokenDetails.reasoningTokens']) ?? firstInt(meta, ['anthropic.usage.output_tokens_details.thinking_tokens', 'vertex.usageMetadata.thoughtsTokenCount', 'google.usageMetadata.thoughtsTokenCount', 'openai.reasoningTokens']),
      ttft: int(get(p, 'ai.response.msToFirstChunk')),
      tps: int(get(p, 'ai.response.avgOutputTokensPerSecond')) ?? int(ai.tokensPerSecond),
      temperature: int(get(p, 'ai.settings.temperature')),
      aiCost: int(ai.totalCost),
    };
    if (out.cacheRead === null && int(ai.cachedTokens) !== null) out.cacheRead = ai.cachedTokens;
    if (out.input === null && int(ai.inputTokens) !== null) out.input = int(ai.inputTokens);
    if (out.output === null && int(ai.outputTokens) !== null) out.output = int(ai.outputTokens);
    if (!out.request && label(ai.model)) out.request = label(ai.model);
    // 进行中（partial）的 span 详情里 usage 常常是 0 / 缺失：真实调用不可能输入输出都是 0，当作还没报告，之后再补读
    if (!(out.input > 0) && !(out.output > 0)) { out.input = null; out.output = null; if (!(out.total > 0)) out.total = null; }
    if (out.input !== null || out.output !== null || out.request) out.detailed = true;
    const ef = effortOf(p); out.effort = ef.effort; out.budgets = ef.budgets;
    if (out.ttft !== null) out.ttft = Math.round(out.ttft);
    if (out.tps !== null) out.tps = Math.round(out.tps * 10) / 10;
    return out;
  }
  // 花费 / 用量记录里的费用类字段：键名含 cost/usd/credit/price/charge 的数字，原样列出
  const COST_KEY = /(cost|usd|credit|price|charg|amount|cents?$|multiplier|margin|discount)/i;
  function costFields(node, path = '', out = [], d = 0) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || d > 3 || out.length >= 24) return out;
    for (const [k, raw] of Object.entries(node).slice(0, 120)) {
      if (RAW_DROP.test(k)) continue;
      let v = raw; if (typeof v === 'string' && /^[\[{]/.test(v) && /(cost|price|charge|billing|credit)/i.test(k)) v = obj(v);
      const p = path ? path + '.' + k : k;
      if (typeof v === 'number' && Number.isFinite(v)) { if (COST_KEY.test(k)) out.push({ key: p, value: v }); }
      else if (v && typeof v === 'object') costFields(v, p, out, d + 1);
      if (out.length >= 24) break;
    }
    return out;
  }
  function recordDetail(d) {
    const p = obj(d?.properties);
    return {
      detailed: !!d?.properties,
      internal: label(first(p, ['modelName', 'model_name', 'model', 'ai.model.id'])),
      messageId: label(first(p, ['messageId', 'message_id', 'assistantMessageId'])),
      nodeId: label(first(p, ['nodeId'])), identitySchema:1,
      input: firstInt(p, ['inputTokens', 'input_tokens', 'promptTokens', 'usage.inputTokens']),
      output: firstInt(p, ['outputTokens', 'output_tokens', 'completionTokens', 'usage.outputTokens']),
      reasoning: firstInt(p, ['reasoningTokens', 'reasoning_tokens', 'usage.reasoningTokens']),
      cacheRead: firstInt(p, ['cachedInputTokens', 'cacheReadTokens', 'cache_read_input_tokens']),
      total: firstInt(p, ['totalTokens', 'total_tokens', 'usage.totalTokens']),
      context: firstInt(p, ['contextTokens', 'context_tokens', 'usedTokens', 'inputTokens']),
      window: firstInt(p, ['contextWindow', 'context_window', 'maxContextTokens', 'limit']),
      fields: costFields(p),
    };
  }

  // ---------- 存储 ----------
  const mem = new Map(), locks = new Map(), LOG = [];
  let index = Store.get('tr:index', {});
  function log(sid, text, lvl = '') { LOG.push({ at: now(), sid, text, lvl }); if (LOG.length > 400) LOG.splice(0, LOG.length - 400); Bus.emit('tracelog'); }
  function rec(sid) {
    let r = mem.get(sid);
    if (!r) { r = Store.get('tr:' + sid, null); if (!r || !Array.isArray(r.turns)) r = { sid, turns: [], runs: {} }; r.runs ||= {}; mem.set(sid, r); }
    return r;
  }
  function prune() {
    const ks = Object.entries(index).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    while (ks.length > KEEP_CHATS) { const [k] = ks.shift(); delete index[k]; Store.del('tr:' + k); mem.delete(k); }
  }
  function save(sid) {
    const r = mem.get(sid); if (!r) return;
    r.turns.sort((a, b) => (a.at || 0) - (b.at || 0));
    if (r.turns.length > KEEP_TURNS) r.turns = r.turns.slice(-KEEP_TURNS);
    r.turns.forEach((t, i) => { if (i < r.turns.length - RAW_TURNS) delete t.raw; });
    for (const [k, v] of Object.entries(r.runs)) if (!v || v.exp < now() - 86400000) delete r.runs[k];
    let s = JSON.stringify(r);
    for (let tries = 0; tries < 3; tries++) {
      try { localStorage.setItem('anc:tr:' + sid, s); break; }
      catch { const ks = Object.entries(index).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).slice(0, 30); for (const [k] of ks) if (k !== sid) { delete index[k]; Store.del('tr:' + k); mem.delete(k); } r.turns.forEach(t => delete t.raw); s = JSON.stringify(r); }
    }
    const tot = totals(sid);
    index[sid] = { at: now(), n: r.turns.length, usd: tot.usd, tok: tot.tok, bytes: s.length, title: History.byId(sid)?.title || '' };
    prune(); Store.set('tr:index', index);
  }

  // ---------- 运行令牌：来自实时通道记录头（public-access-token，1 小时内有效）----------
  function noteToken(sid, tok) {
    const p = jwt(tok), run = /read:runs:(run_[\w-]+)/.exec(JSON.stringify(p?.scopes || ''))?.[1];
    if (!run || !p?.exp) return null;
    const r = rec(sid), ex = r.runs[run];
    if (ex && ex.tok === tok) return run;
    r.runs[run] = { tok, exp: p.exp * 1000, seen: ex?.seen || now() };
    save(sid); return run;
  }
  const validRuns = sid => Object.entries(rec(sid).runs).filter(([, v]) => v.exp > now() + 5000).sort((a, b) => (b[1].seen || 0) - (a[1].seen || 0));

  // ---------- 切轮 ----------
  function plan(events, runId) {
    const segs = []; let seg = null; const attempts = {};
    for (const e of events) {
      if (!e || typeof e !== 'object' || (e.runId && e.runId !== runId)) continue;
      const m = /^chat turn (\d+)$/.exec(e.message || '');
      if (m) { const turn = +m[1]; attempts[turn] = (attempts[turn] || 0) + 1; seg = { turn, attempt: attempts[turn], spanId: e.spanId || null, at: toMs(e.startTime), prompt: (e.style?.accessory?.items || [])[0]?.text || '', dur: durMs(e.duration), events: [] }; segs.push(seg); continue; }
      if (!seg) continue;
      seg.events.push(e);
    }
    return segs;
  }
  function turnKey(runId, seg) { return runId + ':' + seg.turn + ':' + seg.attempt; }

  // 由事件列表构建（或更新）一轮的快照；详情从旧快照继承
  function build(runId, seg, prev) {
    const oldCalls = new Map((prev?.calls || []).map(c => [c.id, c])), oldRecs = new Map((prev?.records || []).map(x => [x.id, x]));
    const calls = [], records = [], route = [];
    let doneAt = null, lastAt = seg.at;
    for (const e of seg.events) {
      const at = toMs(e.startTime), msg = e.message || '';
      if (at && at > lastAt) lastAt = at;
      if (msg === 'onTurnComplete()' || msg === 'waiting for next message') doneAt ||= at;
      if (ROUTE.test(msg)) route.push({ m: msg, at });
      if (!SPAN.test(e.spanId || '')) continue;
      if (STREAM.test(msg)) {
        const o = oldCalls.get(e.spanId) || {};
        calls.push({ ...o, id: e.spanId, at, ms: durMs(e.duration), partial: e.isPartial !== false, error: e.isError === true, model: pill(e, 'tabler-cube') || o.model || null, totalLabel: pill(e, 'tabler-hash') || o.totalLabel || null, usd: usdNum(pill(e, 'tabler-currency-dollar')) ?? o.usd ?? null, icon: e.style?.icon || '' });
      } else if (msg === 'token.usage.recorded' || msg === 'spend.recorded' || msg === 'compaction.context_usage') {
        const o = oldRecs.get(e.spanId) || {};
        records.push({ ...o, id: e.spanId, kind: msg === 'token.usage.recorded' ? 'usage' : msg === 'spend.recorded' ? 'spend' : 'context', at, partial: e.isPartial !== false });
      }
    }
    // 改派：每个 attempt_failed 之前最后开始的那次调用 = 原模型失败的调用
    const failed = new Set();
    for (const f of route.filter(x => x.m === 'model.resample.attempt_failed' && x.at)) { const b = calls.filter(c => c.at && c.at <= f.at).at(-1); if (b) failed.add(b.id); }
    const outcome = route.some(x => x.m === 'Agent turn failed') ? 'failed' : route.some(x => x.m === 'agent.empty_turn') ? 'empty' : null;
    if (!outcome) for (const c of calls) if (c.error) failed.add(c.id);
    for (const c of calls) c.failed = failed.has(c.id);
    const snap = { ...(prev || {}), key: turnKey(runId, seg), runId, turn: seg.turn, attempt: seg.attempt, at: seg.at, prompt: String(seg.prompt || '').slice(0, 4000), dur: seg.dur, calls, records, route, outcome, events: seg.events.length + 1, lastAt, done: !!doneAt, updated: now() };
    return snap;
  }
  // 需要（再）详读的调用：没读过 / 读的时候 span 还没结束 / 没报告用量（有次数上限，避免一直重读）
  const hasUse = c => c.input > 0 || c.output > 0 || c.total > 0;
  const needDetail = c => !c.detailed || (!c.dpartialOk && (c.dTries || 0) < 6) || (!hasUse(c) && (c.dTries || 0) < 4);
  // 由调用 / 记录计算本轮结论
  function finalize(s) {
    const ok = s.calls.filter(c => !c.failed);
    const names = [...new Set(s.records.filter(r => r.kind !== 'context').map(r => r.internal).filter(Boolean))];
    const ctx = s.records.filter(r => r.kind === 'context' && r.internal).at(-1)?.internal || null;
    const nm = c => c.request || c.response || c.model || null;
    const models = [...new Set(ok.map(nm).filter(Boolean))];
    // 连续同一模型合为一段
    const groups = []; for (const c of s.calls) { const n = nm(c) || '未知'; const g = groups.at(-1); if (g && g.model === n && !!g.failed === !!c.failed) { g.n++; g.to = c.at; } else groups.push({ model: n, n: 1, from: c.at, to: c.at, failed: !!c.failed }); }
    const last = ok.at(-1) || s.calls.at(-1) || null;
    const sw = s.route.find(x => x.m === 'model.resample.switched');
    let routing = null;
    if (sw || s.calls.some(c => c.failed)) {
      const before = s.calls.filter(c => c.failed).at(-1) || s.calls.filter(c => c.at && sw && c.at <= sw.at).at(-1);
      const after = ok.find(c => !before || (c.at && c.at >= before.at));
      routing = { from: before ? nm(before) : null, to: after ? nm(after) : null, at: sw?.at || before?.at || null, committed: s.route.some(x => x.m === 'model.resample.committed') };
    }
    const sum = k => s.calls.reduce((a, c) => a + (int(c[k]) || 0), 0);
    const tokOf = c => int(c.total) ?? (int(c.input) !== null || int(c.output) !== null ? (int(c.input) || 0) + (int(c.output) || 0) : (kNum(c.totalLabel) || 0));
    for (const c of s.calls) c.tok = tokOf(c);
    const tok = s.calls.reduce((a, c) => a + c.tok, 0);
    const usd = s.calls.reduce((a, c) => a + (c.aiCost ?? c.usd ?? 0), 0);
    s.sum = { input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), reasoning: sum('reasoning'), tok, usd: Math.round(usd * 1e6) / 1e6, calls: s.calls.length, detailed: s.calls.filter(c => c.detailed).length, src: 'calls' };
    // 调用详情没报告用量时，用 Brana 自己的 token.usage.recorded 记录补上（绝不显示假的 0）
    { const ur = s.records.filter(r => r.kind === 'usage' && r.detailed && (r.input > 0 || r.output > 0));
      const ri = ur.reduce((a, r) => a + (r.input || 0), 0), ro = ur.reduce((a, r) => a + (r.output || 0), 0);
      if (ur.length && ri + ro > s.sum.input + s.sum.output) {
        s.sum.input = ri; s.sum.output = ro; s.sum.reasoning = Math.max(s.sum.reasoning, ur.reduce((a, r) => a + (r.reasoning || 0), 0)); s.sum.cacheRead = Math.max(s.sum.cacheRead, ur.reduce((a, r) => a + (r.cacheRead || 0), 0));
        s.sum.tok = Math.max(tok, ri + ro); s.sum.src = 'records';
        // 只有一次调用 / 一条记录：把用量也补到那次调用上
        const miss = s.calls.filter(c => !hasUse(c));
        if (miss.length === 1 && ur.length === 1 && s.calls.length === 1) { const c = miss[0], r = ur[0]; c.input = r.input; c.output = r.output; if (r.reasoning != null) c.reasoning = r.reasoning; if (r.cacheRead != null) c.cacheRead = r.cacheRead; c.tok = (r.input || 0) + (r.output || 0); c.useSrc = 'record'; }
      } }
    s.sum.known = s.sum.input + s.sum.output > 0 || s.sum.tok > 0;
    s.sum.missing = s.calls.filter(c => !hasUse(c)).length;
    // 没有花费记录的调用：按单价估算（参考价 × 从实测学到的校正系数）
    { let est = 0, n = 0; for (const c of s.calls) { const u = c.aiCost ?? c.usd; if (u != null) { est += u; continue; } if (c.input == null && c.output == null) continue; try { est += Price.cost(c.response || c.request || c.model || s.internal || '', c); n++; } catch {} } s.sum.usdEst = Math.round(est * 1e6) / 1e6; s.sum.estN = n; }
    s.models = models; s.groups = groups; s.routing = routing; s.internalNames = names; s.contextName = ctx;
    s.internal = names.length === 1 ? names[0] : names.at(-1) || null;
    s.best = Strength.compose({ request: last?.request || last?.model, response: last?.response, internal: s.internal }) || s.internal || (last ? (last.response || last.request || last.model) : null) || ctx || null;
    if (s.best && /^claude-opus-5[.-]5/i.test(s.best) && ((s.sum?.output || 0) > 65536 || (s.sum?.reasoning || 0) > 64000)) {
      s.best = s.best.replace(/opus-5[.-]5/i, 'opus-5.6');
      if (!/-(max|xhigh|high)$/i.test(s.best)) s.best += '-max';
    }
    s.request = last?.request || last?.model || null; s.response = last?.response || null;
    s.changed = models.length > 1 || !!routing;
    s.think = s.calls.some(c => (c.reasoning || 0) > 0) ? true : s.calls.some(c => c.detailed) ? false : null;
    s.partial = !s.done || s.calls.some((c, i) => i >= s.calls.length - CALL_DETAIL && needDetail(c)) || s.records.filter(r => r.kind === 'usage').slice(-24).some(r => !r.detailed);
    return s;
  }
  async function syncRun(sid, runId, tok, { deep: deepMode = false, only = null, probeDetails = false, live = false } = {}) {
    const r = rec(sid);
    let ev;
    try { ev = (await Trigger.get('/api/v1/runs/' + runId + '/events', tok)).events || []; }
    catch (e) { if (e.status === 401 || e.status === 403) { if (r.runs[runId]) r.runs[runId].exp = 0; throw new Error('运行令牌已过期'); } throw e; }
    const segs = plan(ev, runId); let fetched = 0;
    for (const seg of segs) {
      const key = turnKey(runId, seg); if (only && !only.includes(key)) continue;
      const prev = r.turns.find(t => t.key === key);
      if (prev?.done && prev.final && !deepMode && prev.events === seg.events.length + 1 && !prev.calls.slice(-CALL_DETAIL).some(needDetail)) continue;
      const s = build(runId, seg, prev);
      // 需要详读的调用：最后 16 次（深度核对：全部，上限 120）；记录：用量 / 花费最后 4 条、上下文最后 1 条
      // 进行中（live）：只详读最后 2 次调用（够判断是不是换了模型）；用量 / 上下文记录等这一轮结束再读——单个调用详情里带着整段上下文，很大
      const lim = deepMode ? DEEP_DETAIL : live ? 2 : CALL_DETAIL;
      const want = live && !deepMode ? s.calls.slice(-lim).filter(c => !c.detailed || (!c.dpartialOk && (c.dTries || 0) < 2)) : [
        ...s.calls.slice(-lim).filter(c=>needDetail(c)||(probeDetails&&c.proofSchema!==1)),
        ...s.records.filter(x => x.kind === 'usage').slice(deepMode ? -120 : -24).filter(x => !x.detailed||(probeDetails&&x.identitySchema!==1)),
        // Do not fetch retired spend/balance detail spans.
        ...s.records.filter(x => x.kind === 'context').slice(-1).filter(x => !x.detailed),
      ];
      const raw = s.raw || { spans: {} }; let rawSize = JSON.stringify(raw).length;
      if (seg.spanId && SPAN.test(seg.spanId) && s.botScore == null) {
        try {
          const turnSpan = await Trigger.get('/api/v1/runs/' + runId + '/spans/' + seg.spanId, tok);
          fetched++;
          const props = obj(turnSpan?.properties) || {};
          const cf = props?.payload?.metadata?.cloudflareMetadata || props?.cloudflareMetadata || null;
          if (cf && typeof cf === 'object') {
            const bs = parseInt(String(cf.botScore ?? ''), 10);
            if (Number.isFinite(bs)) {
              s.botScore = bs;
              s.cloudflareMetadata = {
                botScore: bs,
                ja4: cf.ja4 || null,
                ja4BrowserRatio: cf.ja4_browser_ratio_1h != null ? Number(cf.ja4_browser_ratio_1h) : null,
                ja4H2H3Ratio: cf.ja4_h2h3_ratio_1h != null ? Number(cf.ja4_h2h3_ratio_1h) : null,
                clientAsn: cf.clientAsn || null,
                isVerifiedBot: Boolean(cf.isVerifiedBot === 'true' || cf.isVerifiedBot === true),
                at: now(),
              };
              try { if (typeof BotService !== 'undefined' && BotService.noteCloudflare) BotService.noteCloudflare(s.cloudflareMetadata, sid); } catch {}
            }
          }
        } catch {}
      }
      for (const item of want) {
        let d; try { d = await Trigger.get('/api/v1/runs/' + runId + '/spans/' + item.id, tok); } catch (e) { if (e.status === 401 || e.status === 403) break; continue; }
        fetched++;
        if (s.calls.includes(item)) { const tries = (item.dTries || 0) + 1; Object.assign(item, streamDetail(d)); item.dpartialOk = d?.isPartial === false; item.dTries = tries; }
        else { Object.assign(item, recordDetail(d)); }
        const t = trimRaw({ spanId: d?.spanId, message: d?.message, startTime: d?.startTime, durationMs: d?.durationMs, isPartial: d?.isPartial, isError: d?.isError, properties: obj(d?.properties), ai: d?.ai });
        const n = JSON.stringify(t).length; if (rawSize + n < RAW_BYTES) { raw.spans[item.id] = t; rawSize += n; }
      }
      s.raw = raw;
      finalize(s); s.final = s.done && !s.partial;
      if (prev) Object.assign(prev, s); else r.turns.push(s);
    }
    return { events: ev.length, fetched, turns: segs.length };
  }
  async function sync(sid, opt = {}) {
    if (!sid) return null;
    const cur = locks.get(sid); if (cur) { cur.again = cur.again || opt; return cur.p; }
    const lk = { again: null }; locks.set(sid, lk);
    lk.p = (async () => {
      const r = rec(sid); let res = { events: 0, fetched: 0, turns: 0 }, err = null;
      const runs = validRuns(sid).slice(0, opt.deep ? 3 : 2);
      if (!runs.length) err = Object.keys(r.runs).length ? '运行令牌已过期（超过 1 小时）' : '还没有运行记录';
      for (const [runId, v] of runs) {
        try { const x = await syncRun(sid, runId, v.tok, opt); res.events += x.events; res.fetched += x.fetched; res.turns += x.turns; }
        catch (e) { err = describe(e); log(sid, '读取失败：' + err, 'bad'); }
      }
      r.lastSync = now(); r.lastErr = err; r.lastRes = res; if (opt.deep) r.deepAt = now();
      if (!res.turns) { try { const m = Models.get(sid); if (m?.partial) adopt(sid); } catch {} }   // 已读过的记录也补一次（修正之前被辅助调用带偏、还停在「部分」的结果）
      if (res.turns) { save(sid); adopt(sid); log(sid, `${opt.deep ? '深度核对' : opt.live ? '实时' : '读取'} · Trace ${res.events} 条事件 · ${res.turns} 轮 · 补读 ${res.fetched} 个详情`); }
      Bus.emit('trace', sid);
      return { ...res, err };
    })().finally(() => { locks.delete(sid); if (lk.again) setTimeout(() => sync(sid, lk.again), 300); });
    return lk.p;
  }
  // 对话还没有识别结果时，用 Trace 的结论补上（不触发改名）
  function adopt(sid) {
    const t = latest(sid); if (!t?.best) return;
    try { for (const c of t.calls || []) for (const n of [c.response, c.request]) if (n) Brand.learn(n, c.provider, c.adapter); } catch {}
    const m = Models.get(sid); let best = Strength.compose({ request: t.request, response: t.response, internal: t.internal }) || t.best;
    if (best && /^claude-opus-5[.-]5/i.test(best) && ((t.sum?.output || 0) > 65536 || (t.sum?.reasoning || 0) > 64000)) {
      best = best.replace(/opus-5[.-]5/i, 'opus-5.6');
      if (!/-(max|xhigh|high)$/i.test(best)) best += '-max';
    }
    const better = !!m && !Brand.of(m.name) && !!Brand.of(best);   // 以前只存了代号（spirit），现在有响应型号能补全厂商和型号
    if (m && !m.partial && !better) return;
    if (m && !t.internal && !better) return;
    const messageId = (t.records || []).find(r => r.messageId)?.messageId || null, same = m && ((messageId && m.messageId === messageId) || (t.key && m.traceKey === t.key)) ? m : null;
    Models.set(sid, { name: best, internal: t.internal || same?.internal || null, request: t.request || same?.request || null, response: t.response || same?.response || null, provider: same?.provider || '', tier: Strength.parts(best).tier || null, routed: !!(t.routing || t.changed || t.outcome), inputId: same?.inputId || null, messageId, traceKey: t.key, partial: !t.internal && !same?.internal, usd: same?.usd ?? null, ...(m?.fingerprint ? { fingerprint:m.fingerprint } : {}) });
  }
  // 旧对话：回放实时通道，收集最近几轮的运行令牌（1 小时内有效）
  async function discover(chat) {
    try {
      await chat.ensureToken();
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
      let txt = '';
      try {
        const res = await rawFetch(OUT(chat.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + chat.token, 'Timeout-Seconds': '5', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +(chat.lastSeq || 0) - 1500)) }, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
        txt = await res.text();
      } catch (e) { if (e.name !== 'AbortError') throw e; }
      finally { clearTimeout(tm); }
      let n = 0;
      for (const m of txt.matchAll(/eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g)) { const p = jwt(m[0]); if (/read:runs:run_/.test(JSON.stringify(p?.scopes || '')) && p.exp * 1000 > now()) { noteToken(chat.sid, m[0]); n++; } }
      log(chat.sid, n ? `回放实时通道找到 ${n} 个运行令牌` : '回放实时通道：没有 1 小时内的运行令牌', n ? '' : 'warn');
      return n;
    } catch (e) { log(chat.sid, '回放失败：' + describe(e), 'bad'); return 0; }
  }

  // ---------- 读取 ----------
  const turns = sid => rec(sid).turns;
  // 一轮对话的总时长（秒）：服务器 trace 里「chat turn N」事件的耗时；旧快照没有这个字段时用「首个事件 → 最后一个事件」兜底。没有可信值返回 null
  const turnSec = t => { if (!t) return null; if (t.dur > 0) return t.dur / 1000; return t.done && t.lastAt > t.at ? (t.lastAt - t.at) / 1000 : null; };
  const latest = sid => { const t = rec(sid).turns; return t.length ? t[t.length - 1] : null; };
  function totals(sid) {
    const t = rec(sid).turns; let usd = 0, tok = 0, calls = 0;
    for (const s of t) { usd += s.sum?.usd || 0; tok += s.sum?.tok || 0; calls += s.sum?.calls || 0; }
    return { usd: Math.round(usd * 1e6) / 1e6, tok, calls, turns: t.length };
  }
  function clear(sid) { if (sid) { mem.delete(sid); delete index[sid]; Store.del('tr:' + sid); } else { for (const k of Object.keys(index)) Store.del('tr:' + k); index = {}; mem.clear(); } Store.set('tr:index', index); Bus.emit('trace', sid || null); }
  const info = sid => { const r = rec(sid); return { lastSync: r.lastSync || 0, lastErr: r.lastErr || null, lastRes: r.lastRes || null, runs: validRuns(sid).length, deepAt: r.deepAt || 0 }; };

  // ---------- 自动：回合开始 / 进行中 / 结束 ----------
  const liveT = new Map();
  function watch(chat) {
    if (liveT.has(chat.sid) || Prefs.traceLive === false) return;
    const tick = async () => {
      if (!chat.busy) { liveT.delete(chat.sid); return; }
      // 后台 / 最小化 / 没打开这个对话时也继续读（间隔放长），不等这一轮结束
      const visible = !document.hidden && (UI.els?.chat === chat);
      if (validRuns(chat.sid).length) await sync(chat.sid, { live: true }).catch(() => {});
      else if (now() - (chat._discAt || 0) > 120000) { chat._discAt = now(); await discover(chat).catch(() => 0); }
      liveT.set(chat.sid, setTimeout(tick, visible ? 20000 : 45000));   // 省流量：以前 6 / 15 秒一次，每次都重新下载整份运行事件
    };
    liveT.set(chat.sid, setTimeout(tick, 4000));
  }
  Bus.on('chat', c => { if (c?.busy && c.sid && Prefs.traceAuto !== false && !liveT.has(c.sid)) watch(c); });
  Bus.on('runtoken', c => { if (c.runTok) noteToken(c.sid, c.runTok); if (Prefs.traceAuto !== false) watch(c); });
  Bus.on('turn', c => {
    if (c.runTok) noteToken(c.sid, c.runTok);
    if (Prefs.traceAuto === false) return;
    setTimeout(() => sync(c.sid).catch(() => {}), 2500);
    setTimeout(() => sync(c.sid).catch(() => {}), 9000);
    // 用量还没报告全（span 刚结束时 usage 常常晚几秒写入）：再补读两次
    for (const ms of [25000, 60000]) setTimeout(() => { const t = latest(c.sid); if (t && (t.partial || !t.sum?.known)) sync(c.sid).catch(() => {}); }, ms);
  });

  return { sync, discover, noteToken, adopt, turns, turnSec, latest, totals, clear, info, index: () => index, log: LOG, note: log, validRuns, probeIdOf, kNum, fmt: null };
})();

// 数字格式：token 用「万」；美金按大小取位数
const fmtTok = n => { n = +n; if (!Number.isFinite(n)) return '—'; if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'; if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万'; return Math.round(n).toLocaleString('en-US'); };
const fmtTokS = n => fmtTok(n).replace(' ', '');
// 美金：小额也显示到有效数字（$0.04912 / $0.000318），不四舍五入成 0
const fmtUsd = n => { n = +n; if (!Number.isFinite(n)) return '—'; if (n === 0) return '$0'; const a = Math.abs(n); return '$' + (a >= 100 ? n.toFixed(2) : a >= 1 ? n.toFixed(3) : a >= 0.01 ? n.toFixed(4) : a >= 0.0001 ? n.toFixed(6) : n.toPrecision(3)); };
const fmtClock2 = ms => { if (!ms) return '—'; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };

// ---------- 工作区（沙盒文件）：/api/chat/{sid}/workspace/latest?includeManifest=true ----------
const Workspace = {
  cache: new Map(), pending: new Map(), revisions: new Map(),
  async latest(sid, force) {
    const c = this.cache.get(sid);
    if (!force && this.pending.has(sid)) return this.pending.get(sid);
    if (c && !force && now() - c.at < 20000) return c;
    const rev = (this.revisions.get(sid) || 0) + 1; this.revisions.set(sid,rev);
    const job = (async () => {
      const j = await api('/api/chat/' + encodeURIComponent(sid) + '/workspace/latest?includeManifest=true');
      const v = { at: now(), node: j?.manifestNodeId || null, leaf: j?.leafMessageId || null, manifest: j?.manifest || null };
      if (this.revisions.get(sid) !== rev) return this.pending.get(sid) || this.cache.get(sid) || v;
      this.cache.set(sid, v); Bus.emit('workspace', sid); return v;
    })();
    this.pending.set(sid, job);
    try { return await job; } finally { if (this.pending.get(sid) === job) this.pending.delete(sid); }
  },
  async dir(sid, node, path, opt = {}) { const j = await api(`/api/chat/${encodeURIComponent(sid)}/workspace/${encodeURIComponent(node)}/dir?path=${encodeURIComponent(path)}`, opt); return j?.directory || null; },
  downloadUrl: (sid, node) => `${ORIGIN}/api/chat/${encodeURIComponent(sid)}/workspace/${encodeURIComponent(node)}/download`,
  casUrl: hash => `${ORIGIN}/api/chat/workspace/cas/user/${encodeURIComponent(hash)}`,
  async fileBlob(entry) {
    if (entry.inlineText != null) return new Blob([entry.inlineText], { type: 'text/plain;charset=utf-8' });
    const res = await rawFetch(this.casUrl(entry.hash), { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ''));
    return res.blob();
  },
};
Bus.on('turn', c => { setTimeout(() => { if (Workspace.cache.has(c.sid) || UI.els?.chat === c) Workspace.latest(c.sid, true).catch(() => {}); }, 3000); });

// ---------- 官方 BotService 与模拟官方四维号池分（Cloudflare/ASN + reCAPTCHA v3 + 近期出货后验 + Pulse 额度 → 1–99） ----------
const BotService = (() => {
  const STORE_KEY = 'botservice:v1';
  let cur = (typeof Store !== 'undefined' && Store.get ? Store.get(STORE_KEY, null) : null) || {
    botScore: null,
    rawBotScore: null,
    rawAt: 0,
    ja4: null,
    ja4BrowserRatio: null,
    ja4H2H3Ratio: null,
    clientAsn: null,
    isVerifiedBot: false,
    pulse: null,
    pulseRefreshedAt: null,
    sid: null,
    updatedAt: 0,
  };
  let inflightPulse = null;
  let lastPulseAt = 0;
  let _calcMemo = null;
  let _calcAt = 0;

  function invalidate() { _calcAt = 0; }

  function save() {
    invalidate();
    try { if (typeof Store !== 'undefined' && Store.set) Store.set(STORE_KEY, cur); } catch {}
    try { if (typeof Bus !== 'undefined') Bus.emit('botservice', state()); } catch {}
    try { if (typeof Bar !== 'undefined' && Bar.render) Bar.render(); } catch {}
  }

  function noteCloudflare(cf, sid = null) {
    if (!cf || typeof cf !== 'object') return state();
    const bs = parseInt(String(cf.botScore ?? ''), 10);
    if (!Number.isFinite(bs)) return state();
    const clamped = Math.max(1, Math.min(99, bs));
    cur = {
      ...cur,
      botScore: clamped,
      rawBotScore: clamped,
      rawAt: now(),
      ja4: cf.ja4 || cur.ja4 || null,
      ja4BrowserRatio: cf.ja4BrowserRatio ?? cf.ja4_browser_ratio_1h ?? cur.ja4BrowserRatio ?? null,
      ja4H2H3Ratio: cf.ja4H2H3Ratio ?? cf.ja4_h2h3_ratio_1h ?? cur.ja4H2H3Ratio ?? null,
      clientAsn: cf.clientAsn || cur.clientAsn || null,
      isVerifiedBot: Boolean(cf.isVerifiedBot),
      sid: sid || cur.sid || null,
      updatedAt: now(),
    };
    save();
    return state();
  }

  // 模拟官方模型池分流标准（1–99）：
  // 1) Cloudflare 网络与出口 ASN 纯净度（0–45）
  // 2) reCAPTCHA Enterprise v3 静默过盾率与 429 频控状态（0–25）
  // 3) 近期会话真实分配模型后验（旗舰提权 / 连抽 MiMo·DeepSeek 开源惩罚 / 中途改派惩罚，-22～+20）
  // 4) 账户 Pulse 剩余额度水位（-8～+10）
  function calcPoolScore() {
    const t = now();
    if (_calcMemo && t - _calcAt < 600) return _calcMemo;
    _calcAt = t;

    const acct = (typeof UI !== 'undefined' && UI.host?.account) ? UI.host.account : null;
    const curIp = (typeof IP !== 'undefined' && IP.ip) || acct?.status?.ip || '';
    const ipRep = (typeof IPRep !== 'undefined' && IPRep.cur) ? IPRep.cur(acct, curIp) : null;
    const eg = (typeof IPRep !== 'undefined' && IPRep.egOf ? IPRep.egOf(acct?.proxyIp || curIp) : '') || curIp;
    const rep = (typeof Pool !== 'undefined' && Pool.d?.rep && eg) ? Pool.d.rep[eg] : null;
    const pu = rep?.pu || null;

    // 1. 网络与 ASN 信誉分（0–45）
    let ipScore = 28;
    let ipTag = '待评估';
    if (ipRep?.sc?.known || ipRep?.pct != null || rep) {
      const pct = ipRep?.pct ?? (Number.isFinite(ipRep?.sc?.s) ? Math.round(ipRep.sc.s) : 68);
      ipScore = Math.round((pct / 100) * 35);
      if (pu?.res && !pu?.bc) { ipScore += 10; ipTag = '原生家宽'; }
      else if (pu?.res || ipRep?.kind?.c === 'res') { ipScore += 8; ipTag = '住宅宽带'; }
      else if (ipRep?.kind?.c === 'mob' || rep?.m) { ipScore += 7; ipTag = '移动网络'; }
      else if (ipRep?.kind?.c === 'dc' || pu?.dc || rep?.h) { ipScore -= 12; ipTag = '机房ASN'; }
      else { ipTag = ipRep?.label || '常规线路'; }
      if (rep?.px) { ipScore -= 8; ipTag += '·代理标记'; }
      ipScore = Math.max(4, Math.min(45, ipScore));
    } else {
      const rtt = typeof IP !== 'undefined' ? (+IP.rtt || 0) : 0;
      ipScore = curIp ? (rtt > 0 && rtt < 380 ? 34 : rtt > 0 && rtt < 850 ? 30 : 28) : 26;
      ipTag = curIp ? '在线待评' : '待检测';
    }

    // 2. reCAPTCHA v3 与频控过盾分（0–25）
    const rq = (typeof Pool !== 'undefined' && Pool.d?.rq && eg) ? Pool.d.rq[eg] : null;
    const ok = +(rq?.ok || 0), rc = +(rq?.rc || 0), rl = +(rq?.l || 0), rlt = +(rq?.lt || 0);
    let v3Score = 21;
    let v3Tag = '正常';
    if (ok > 0 && rc === 0) {
      v3Score = Math.min(25, 21 + Math.min(4, ok));
      v3Tag = 'v3全过';
    } else if (rc > 0) {
      const rate = rc / Math.max(1, ok + rc);
      v3Score -= Math.min(21, rc * 8 + Math.round(rate * 10));
      v3Tag = '验证×' + rc;
    }
    if (rl > 0 && t - rlt < 6 * 3600e3) {
      v3Score -= (t - rlt < 1800e3 ? Math.min(12, rl * 5 + 3) : Math.min(8, rl * 3));
      v3Tag = (v3Tag === '正常' ? '' : v3Tag + '·') + '429×' + rl;
    }
    try {
      if (typeof Gacha !== 'undefined' && (Gacha.capOffer?.() || Gacha.capCooling?.())) {
        v3Score -= 12;
        v3Tag = '验证冷却';
      }
      if (typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) {
        v3Score -= 6;
        if (!v3Tag.includes('429')) v3Tag += '·读限流';
      }
    } catch {}
    v3Score = Math.max(0, Math.min(25, Math.round(v3Score)));

    // 3. 近期会话出货与中途改派后验分（-22～+20，初始无记录基准 +10）
    let drawScore = 10;
    let drawTag = '基准';
    try {
      const sids = [];
      if (typeof History !== 'undefined' && Array.isArray(History.items) && History.items.length) {
        for (const it of History.items) {
          if (it?.id && !it.isArchived) sids.push(it.id);
          if (sids.length >= 10) break;
        }
      }
      if (!sids.length && typeof Models !== 'undefined' && Models.all) {
        const recent = Object.entries(Models.all)
          .filter(([, m]) => m && (!m.at || t - m.at < 48 * 3600e3))
          .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
          .slice(0, 8);
        for (const [k] of recent) sids.push(k);
      }
      let openStreak = 0, streakBroken = false, crownCount = 0, closedCount = 0, openCount = 0, rerouteCount = 0, sampled = 0;
      for (const sid of sids) {
        const m = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null;
        const bp = (!m?.name && !m?.candidateName && typeof BillingProbe !== 'undefined' && BillingProbe.state) ? BillingProbe.state(sid)?.summary : null;
        if (!m && !bp?.top?.length) continue;
        const txt = [
          m?.name, m?.candidateName, m?.reverseLabel, m?.rawLabel, m?.internal,
          m?.candidates?.[0]?.id, bp?.top?.[0]?.canon, bp?.top?.[0]?.label
        ].filter(Boolean).join(' ');
        const whyTxt = [txt, m?.why, m?.provider].filter(Boolean).join(' ');
        if (!txt && !m?.openThink) continue;
        sampled++;
        const isOpen = Boolean(
          m?.openThink ||
          m?.name === 'compat' ||
          /deepseek|mimo|qwen|glm|minimax|kimi|moonshot|doubao|seed|llama|mistral|yi-|baichuan|open-?source|明文思考|开源/i.test(whyTxt)
        );
        const isCrown = !isOpen && /opus|fable|gpt-6|6\.1|sol\b|astra\b|luna\b|argon|barium/i.test(txt);
        const isClosed = !isOpen && (isCrown || /sonnet|haiku|claude|gpt-5|gpt-4|o1|o3|o4|gemini|grok|terra/i.test(txt));
        if (isOpen) {
          openCount++;
          if (!streakBroken) openStreak++;
        } else if (isClosed) {
          streakBroken = true;
          closedCount++;
          if (isCrown) crownCount++;
        }
        if (sampled <= 4 && (m?.routed || m?.routeSwitched || m?.effortDowngraded || bp?.routeSwitched || bp?.effortDowngraded)) {
          rerouteCount++;
        }
        if (sampled >= 6) break;
      }
      if (sampled > 0) {
        if (crownCount >= 2 && openStreak < 2) { drawScore = 20; drawTag = '连出旗舰'; }
        else if (crownCount >= 1 && openStreak < 3) { drawScore = 18; drawTag = '已出旗舰'; }
        else if (closedCount >= 1 && openStreak < 3) { drawScore = 14; drawTag = '闭源正常'; }
        else { drawScore = 10; drawTag = '常规'; }

        if (openStreak >= 5) { drawScore = -20; drawTag = `连抽${openStreak}开源`; }
        else if (openStreak === 4) { drawScore = -12; drawTag = '连抽4开源'; }
        else if (openStreak === 3) { drawScore = -4; drawTag = '连抽3开源'; }
        else if (openStreak === 2) { drawScore -= 6; drawTag = '连抽2开源'; }
        else if (openStreak === 1 && crownCount === 0 && closedCount === 0) { drawScore = 6; drawTag = '首抽开源'; }

        if (rerouteCount > 0) {
          drawScore -= Math.min(10, rerouteCount * 5);
          drawTag += '·改派';
        }
        drawScore = Math.max(-22, Math.min(20, Math.round(drawScore)));
      }
    } catch {}

    // 4. Pulse 额度水位分（-8～+10）
    const pct = (typeof Pulse !== 'undefined' && Number.isFinite(+Pulse.v?.pulse)) ? +Pulse.v.pulse : cur.pulse;
    let quotaScore = 8;
    let quotaTag = '未读';
    if (pct != null && Number.isFinite(+pct)) {
      if (pct >= 50) { quotaScore = 10; quotaTag = `${Math.round(pct)}%充足`; }
      else if (pct >= 25) { quotaScore = 8; quotaTag = `${Math.round(pct)}%正常`; }
      else if (pct >= 10) { quotaScore = 4; quotaTag = `${Math.round(pct)}%偏低`; }
      else { quotaScore = -8; quotaTag = `${Math.round(pct)}%告急`; }
    }

    const simScore = Math.max(1, Math.min(99, Math.round(ipScore + v3Score + drawScore + quotaScore)));
    const hasRecentOfficial = cur.rawBotScore != null && (t - (cur.rawAt || 0) < 2 * 3600e3);
    const finalScore = hasRecentOfficial
      ? Math.max(1, Math.min(99, Math.round(cur.rawBotScore * 0.5 + simScore * 0.5)))
      : simScore;
    const sign = n => (n >= 0 ? '+' + n : String(n));
    const detail = `IP ${ipScore}(${ipTag}) · 过盾 ${v3Score}(${v3Tag}) · 出货 ${sign(drawScore)}(${drawTag}) · 额度 ${sign(quotaScore)}`;
    const tier = finalScore >= 80 ? 'T1' : finalScore >= 50 ? 'T2' : 'T3';
    const label = finalScore >= 80 ? 'T1 旗舰池' : finalScore >= 50 ? 'T2 混合池' : 'T3 惩罚池';

    _calcMemo = {
      score: finalScore,
      simScore,
      hasRecentOfficial,
      tier,
      label,
      detail,
      breakdown: { ipScore, ipTag, v3Score, v3Tag, drawScore, drawTag, quotaScore, quotaTag },
    };
    return _calcMemo;
  }

  async function refreshPulse(force = false) {
    if (typeof UI === 'undefined' || !UI.me) return state();
    if (!force && now() - lastPulseAt < 25000 && cur.pulse != null) return state();
    if (inflightPulse) return inflightPulse;
    inflightPulse = (async () => {
      try {
        const res = await api('/api/me/pulse');
        if (res && Number.isFinite(+res.pulse)) {
          lastPulseAt = now();
          cur = {
            ...cur,
            pulse: Math.max(0, Math.min(100, Math.round(+res.pulse))),
            pulseRefreshedAt: res.refreshedAt || new Date().toISOString(),
            updatedAt: now(),
          };
          save();
        }
      } catch {} finally {
        inflightPulse = null;
      }
      return state();
    })();
    return inflightPulse;
  }

  function levelOf(score) {
    const ev = calcPoolScore();
    const s = Number.isFinite(Number(score)) && Number(score) > 0 ? Math.round(Number(score)) : ev.score;
    const srcTag = ev.hasRecentOfficial ? `官方CF ${cur.rawBotScore} + 四维号池` : '模拟官方四维号池分';
    if (s >= 80) {
      return {
        tone: 'ok',
        label: 'T1 旗舰池',
        desc: `${srcTag} ${s}/99（🟢 T1 旗舰高优池：高信誉真人环境，正常分配 Opus / 6.1 Sol / Argon 等顶级模型）\n构成：${ev.detail}`,
      };
    }
    if (s >= 50) {
      return {
        tone: 'warn',
        label: 'T2 混合池',
        desc: `${srcTag} ${s}/99（🟡 T2 常规混合池：中等信誉，旗舰权重受限或偶发分流开源模型，建议保持纯净原生家宽 IP）\n构成：${ev.detail}`,
      };
    }
    return {
      tone: 'bad',
      label: 'T3 惩罚池',
      desc: `${srcTag} ${s}/99（🔴 T3 降级惩罚池：疑似触发低分号屏蔽 Opus 机制，高频分配 MiMo/DeepSeek 或弹验证，建议立即切换纯净住宅 IP）\n构成：${ev.detail}`,
    };
  }

  function state() {
    const ev = calcPoolScore();
    return {
      ...cur,
      botScore: ev.score,
      simScore: ev.simScore,
      isSimulated: !ev.hasRecentOfficial,
      poolTier: ev.tier,
      poolLabel: ev.label,
      poolDetail: ev.detail,
      breakdown: ev.breakdown,
    };
  }

  for (const evt of ['ip', 'rtt', 'models', 'model', 'billing', 'pulse', 'history', 'captcha']) {
    try { Bus.on(evt, () => { invalidate(); }); } catch {}
  }
  Bus.on('turn', () => { invalidate(); setTimeout(() => { void refreshPulse(true); }, 1800); });
  setTimeout(() => { if (typeof UI !== 'undefined' && UI.me) void refreshPulse(false); }, 2500);

  return { state, noteCloudflare, refreshPulse, levelOf, calcPoolScore };
})();
try { globalThis.BotService = BotService; } catch {}

