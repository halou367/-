// ---------- 单价 + 用量估算（新计费 agent_p50 × 2 + 账单原像优先） ----------
// Arena 新计费（pricingStrategy: "agent_p50", marginMultiplier: 2）：
// basePriceUsd = (I_uncached * 0.435 + W_cacheWrite * 0.54375 + R_cacheRead * 0.010 + O_output * 0.870) / 1e6
// 实扣账单 chargedUsd = 2 * basePriceUsd（输入 $0.87/M、缓写 $1.0875/M、缓读 $0.02/M、输出 $1.74/M）
const Price = (() => {
  // [匹配, 输入, 输出, 缓存读取]（上游参考单价）
  const TABLE = [
    [/opus|fable/, 5, 25, 0.5], [/sonnet/, 3, 15, 0.3], [/haiku/, 1, 5, 0.1],
    [/gpt.*nano/, 0.05, 0.4, 0.005], [/gpt.*mini/, 0.25, 2, 0.025], [/gpt|codex|\bo[134]\b/, 1.25, 10, 0.125],
    [/gemini.*flash.?lite/, 0.1, 0.4, 0.01], [/gemini.*flash/, 0.3, 2.5, 0.03], [/gemini/, 2, 12, 0.2],
    [/grok.*(fast|mini)/, 0.2, 0.5, 0.05], [/grok/, 3, 15, 0.75],
    [/kimi|moonshot/, 0.6, 2.5, 0.15], [/deepseek/, 0.28, 0.42, 0.028], [/qwen|qwq/, 0.4, 1.6, 0.08], [/glm/, 0.6, 2.2, 0.11], [/mimo|doubao|minimax|seed/, 0.3, 1.2, 0.06],
  ];
  const DEF = [1, 5, 0.1];
  // 新计费 P50 × 2 实扣费率（美元 / 百万 token）
  const P50_CHARGED = { prompt: 0.87, completion: 1.74, cacheRead: 0.02, cacheWrite: 1.0875 };
  const official = name => { try { return typeof BillingProbe !== 'undefined' ? BillingProbe.reference(name) : null; } catch { return null; } };
  const ref = name => { const live = official(name); if (live) return live.rates; const n = String(name || '').toLowerCase(); for (const [re, a, b, c] of TABLE) if (re.test(n)) return [a, b, c]; return DEF; };
  let K = Store.get('price:k', {}), saveT = 0;
  const famOf = name => { try { return Strength.parts(name).family || String(name || '').toLowerCase(); } catch { return String(name || '').toLowerCase(); } };
  const raw = (name, u) => { const [pi, po, pc] = ref(name), inp = +u.input || 0, cr = Math.min(+u.cacheRead || 0, inp), out = +u.output || 0; return ((inp - cr) * pi + cr * pc + out * po) / 1e6; };
  const chargedCost = u => {
    const inp = Math.max(0, +u?.input || 0);
    const cr = Math.min(Math.max(0, +u?.cacheRead || 0), inp);
    const cw = Math.min(Math.max(0, +u?.cacheWrite || 0), Math.max(0, inp - cr));
    const unc = Math.max(0, inp - cr - cw);
    const out = Math.max(0, +u?.output || 0);
    return (unc * P50_CHARGED.prompt + cw * P50_CHARGED.cacheWrite + cr * P50_CHARGED.cacheRead + out * P50_CHARGED.completion) / 1e6;
  };
  const basis = name => { const r = official(name); return famOf(name) + (r ? '|catalog:' + r.key : ''); };
  function factor(name) {
    const f = K[basis(name)]; if (!f) return { k: 1, n: 0 };
    let a = 0, e = 0, n = 0; for (const [x, y] of Object.values(f)) { a += x; e += y; n++; }
    return e > 0 && a > 0 ? { k: Math.max(0.05, Math.min(20, a / e)), n } : { k: 1, n: 0 };
  }
  const upstreamCost = (name, u) => raw(name, u) * factor(name).k;
  const cost = (name, u) => (u && u.billed) ? chargedCost(u) : upstreamCost(name, u);
  function learn(sid) {
    const ts = Trace.turns(sid) || []; const acc = {};
    for (const t of ts) for (const c of t.calls || []) {
      const usd = c.aiCost ?? c.usd, nm = c.response || c.request || c.model || t.best;
      if (!(usd > 0) || c.input == null || c.output == null || !nm) continue;
      const f = basis(nm), r = raw(nm, c);
      if (r <= 0) continue; const x = acc[f] ||= [0, 0]; x[0] += usd; x[1] += r;
    }
    let ch = false;
    for (const [f, v] of Object.entries(acc)) { const m = K[f] ||= {}; if (!m[sid] || m[sid][0] !== v[0] || m[sid][1] !== v[1]) { m[sid] = v; ch = true; const ks = Object.keys(m); if (ks.length > 60) delete m[ks[0]]; } }
    if (ch) { clearTimeout(saveT); saveT = setTimeout(() => Store.set('price:k', K), 800); }
  }
  Bus.on('trace', sid => { if (sid) try { learn(sid); } catch {} });
  const label = name => { const o = official(name), [a, b] = ref(name), f = factor(name); return '新计费 P50×2（实扣）：输入 $0.87 / 缓写 $1.0875 / 缓读 $0.02 / 输出 $1.74 每百万 token；' + (o ? o.source : '上游参考') + '：输入 $' + a + ' / 输出 $' + b + ' 每百万 token' + (f.n ? ' · 校准×' + f.k.toFixed(2) : ''); };
  return { ref, cost, chargedCost, upstreamCost, factor, label, learn, P50_CHARGED };
})();

// ---------- 按实时通道内容（新计费 P50×2）估算本轮用量 ----------
const LiveEst = (() => {
  const SYS = 6603;   // 新计费默认系统提示前缀缓存 token 基线（OpenAI 6603 / Anthropic 11748）
  const _ofMemo = new WeakMap();
  const _partTokMemo = new WeakMap();
  const tk = s => {
    s = String(s || '');
    const len = s.length;
    if (!len) return 0;
    let cjk = 0;
    if (len > 4096) {
      const step = Math.ceil(len / 2048);
      let sampled = 0;
      for (let i = 0; i < len; i += step) {
        sampled++;
        const c = s.charCodeAt(i);
        if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef)) cjk++;
      }
      cjk = Math.round(cjk * (len / Math.max(1, sampled)));
      return Math.round(cjk + (len - cjk) / 3.6);
    }
    for (let i = 0; i < len; i++) {
      const c = s.charCodeAt(i);
      if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef)) cjk++;
    }
    return Math.round(cjk + (len - cjk) / 3.6);
  };
  const js = v => v == null ? '' : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return ''; } })();
  const inTok = p => {
    if (!p || typeof p !== 'object') return 0;
    let ce = _partTokMemo.get(p);
    if (ce && ce.inVal !== undefined && ce.type === p.type && ce.text === p.text && ce.inputText === p.inputText && ce.input === p.input) return ce.inVal;
    const val = (p.type === 'text' || p.type === 'reasoning') ? tk(p.text) : p.toolCallId ? tk(p.inputText || js(p.input)) : 0;
    if (!ce) { ce = {}; _partTokMemo.set(p, ce); }
    ce.type = p.type; ce.text = p.text; ce.inputText = p.inputText; ce.input = p.input; ce.inVal = val;
    return val;
  };
  const resTok = p => {
    if (!p || typeof p !== 'object') return 0;
    let ce = _partTokMemo.get(p);
    if (ce && ce.resVal !== undefined && ce.output === p.output && ce.errorText === p.errorText && ce.type === p.type) return ce.resVal;
    const val = p.toolCallId ? tk(js(p.output)) + tk(p.errorText) : p.type === 'file' ? 1500 : 0;
    if (!ce) { ce = {}; _partTokMemo.set(p, ce); }
    ce.type = p.type; ce.output = p.output; ce.errorText = p.errorText; ce.resVal = val;
    return val;
  };
  function of(chat) {
    if (!chat) return null;
    const msgs = chat.messages || [];
    let idx = -1, live = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'assistant') { idx = i; live = msgs[i]; break; }
    }
    if (!live) return null;
    const sid = chat.sid, model = Models.get(sid)?.name || Trace.latest(sid)?.best || '';
    const bpState = typeof BillingProbe !== 'undefined' && BillingProbe.state ? BillingProbe.state(sid) : null;
    const trState = typeof Trace !== 'undefined' && Trace.latest ? Trace.latest(sid) : null;
    const lastPart = live.parts?.at(-1);
    const lastPartLen = typeof lastPart?.text === 'string' ? lastPart.text.length : (typeof lastPart?.inputText === 'string' ? lastPart.inputText.length : 0);
    const memoKey = `${msgs.length}:${idx}:${live.id || ''}:${live.v || 0}:${live.parts?.length || 0}:${lastPartLen}:${model}:${bpState?.at || 0}:${bpState?.payments?.length || 0}:${trState?.at || 0}:${trState?.calls?.length || 0}:${chat.busy ? 1 : 0}`;
    const hit = _ofMemo.get(chat);
    if (hit && hit.key === memoKey) return hit.val;
    const isClaude = /claude|opus|sonnet|haiku|fable/i.test(model);
    const sysTok = isClaude ? 11748 : SYS;
    // 先计算历史消息与本轮用户新输入 token：系统提示前缀与历史轮次在新计费中走缓存读取（或首轮缓写）
    let priorHistoryTok = 0, userNewTok = 0, postCheckpointTok = 0, lastCheckpointIdx = -1;
    for (let i = 0; i < idx; i++) {
      const m = msgs[i];
      if (!m) continue;
      if (m.metadata?.checkpointApplied || m.metadata?.compactionSummary) {
        lastCheckpointIdx = i;
        postCheckpointTok = tk(m.metadata?.compactionSummary || '');
      }
      const pLen = Array.isArray(m.parts) ? m.parts.length : 0;
      const mCacheKey = `${pLen}:${m.v || 0}:${typeof m.text === 'string' ? m.text.length : 0}`;
      let mTok = (m._leTokKey === mCacheKey && typeof m._leTokVal === 'number') ? m._leTokVal : -1;
      if (mTok < 0) {
        mTok = 0;
        for (const p of m.parts || []) mTok += inTok(p) + resTok(p);
        if (mTok === 0 && m.text) mTok += tk(m.text);
        try { m._leTokKey = mCacheKey; m._leTokVal = mTok; } catch {}
      }
      if (i === idx - 1 && m.role === 'user') userNewTok += mTok;
      else priorHistoryTok += mTok;
      if (lastCheckpointIdx >= 0 && i >= lastCheckpointIdx && i !== idx - 1) postCheckpointTok += mTok;
    }
    const effHistTok = Math.min(lastCheckpointIdx >= 0 ? postCheckpointTok : priorHistoryTok, 160000);
    let ctx = effHistTok + userNewTok;
    let activeWindowTokens = effHistTok + userNewTok;
    const steps = []; let cur = null;
    for (const p of live.parts || []) { if (p.type === 'step-start' || !cur) { cur = []; steps.push(cur); if (p.type === 'step-start') continue; } cur.push(p); }
    let prev = effHistTok > 0 ? effHistTok : 0;
    let inTot = 0, cached = null, out = 0, rs = 0, tools = 0, usd = 0, toolResTot = 0; const per = [];
    for (let si = 0; si < steps.length; si++) {
      const st = steps[si];
      const input = Math.max(1, ctx), cr = Math.min(prev, input), cw = 0;
      let o = 0, stepRt = 0;
      for (const p of st) { const v = inTok(p); o += v; if (p.type === 'reasoning') rs += v; if (p.toolCallId) { tools++; stepRt += resTok(p); } }
      out += o; toolResTot += stepRt;
      const c = Price.chargedCost({ input, cacheRead: cr, cacheWrite: cw, output: o });
      usd += c;
      per.push({ input, output: o, usd: c });
      prev = input + o; ctx += o + stepRt; activeWindowTokens += o + stepRt;
    }
    inTot = effHistTok + userNewTok + toolResTot;
    // 若 BillingProbe 已拿到本轮 /cost 账单或反推原像，优先对齐精确账单与原像 Token
    try {
      const bpState = typeof BillingProbe !== 'undefined' && BillingProbe.state ? BillingProbe.state(sid) : null;
      if (bpState) {
        const payRow = Array.isArray(bpState.payments) ? (bpState.payments.find(r => r.messageId === live.id) || (!chat.busy ? bpState.payments.at(-1) : null)) : null;
        const preByMsg = bpState.info?.preimage?.byMessage?.[live.id] || (!chat.busy && bpState.payments?.at(-1)?.messageId ? bpState.info?.preimage?.byMessage?.[bpState.payments.at(-1).messageId] : null);
        if (preByMsg && preByMsg.total > 0) {
          inTot = (Number(preByMsg.input) || 0) + (Number(preByMsg.cacheRead) || 0) + (Number(preByMsg.cacheWrite) || 0);
          cached = Number(preByMsg.cacheRead) || 0;
          out = Number(preByMsg.output) || 0;
          const stepAvgCtx = Math.round((inTot + out) / Math.max(1, steps.length));
          if (stepAvgCtx > activeWindowTokens && stepAvgCtx <= 260000) activeWindowTokens = stepAvgCtx;
        }
        const effUsd = Number.isFinite(payRow?.chargedUsd) && payRow.chargedUsd > 0 ? payRow.chargedUsd
          : (Number.isFinite(payRow?.basePriceUsd) && payRow.basePriceUsd > 0 ? payRow.basePriceUsd * 2
          : (Number.isFinite(payRow?.upstreamUsd) && payRow.upstreamUsd > 0 ? payRow.upstreamUsd : null));
        if (effUsd != null) {
          const exactOut = { steps: steps.length, tools, input: Math.round(inTot), cached: cached != null && cached > 0 ? Math.round(cached) : null, output: Math.round(out), reasoning: rs > 0 ? Math.round(rs) : null, ctx: Math.round(ctx), activeWindowTokens: Math.round(activeWindowTokens), usd: effUsd, exactUsd: Number.isFinite(payRow?.chargedUsd) && payRow.chargedUsd > 0, model, scale: 1, calN: steps.length, partialHistory: !!chat.hasMore, since: chat.runAt || live.metadata?.createdAt || null };
          _ofMemo.set(chat, { key: memoKey, val: exactOut });
          return exactOut;
        }
      }
    } catch {}
    // 用本轮已读到的 Trace 校准（前 n 步的实际 token ÷ 估算）
    let scale = 1, calN = 0; const t = trState;
    if (t && !t.done && t.calls?.length && chat.runAt && (t.at || 0) >= chat.runAt - 120000) {
      const n = Math.min(t.calls.length, per.length), real = t.calls.slice(0, n).reduce((a, c) => a + (c.tok || 0), 0), est = per.slice(0, n).reduce((a, x) => a + x.input + x.output, 0);
      if (real > 0 && est > 0) { scale = Math.max(0.3, Math.min(5, real / est)); calN = n; }
    }
    const finalOut = { steps: steps.length, tools, input: Math.round(inTot * scale), cached: cached != null && cached > 0 ? Math.round(cached * scale) : null, output: Math.round(out * scale), reasoning: rs > 0 ? Math.round(rs * scale) : null, ctx: Math.round(ctx * scale), activeWindowTokens: Math.round(activeWindowTokens * scale), usd: usd * scale, model, scale, calN, partialHistory: !!chat.hasMore, since: chat.runAt || live.metadata?.createdAt || null };
    _ofMemo.set(chat, { key: memoKey, val: finalOut });
    return finalOut;
  }
  return { of, tk };
})();

// ---------- 总额度 / 余额推断 ----------
// Message-level deductions replace content estimates without double counting. Pulse samples
// are used only outside active/recent turns. Interval intersections are consistency bounds,
// not statistical confidence: other devices or a different credit pool can still bias them.
const Budget = (() => {
  const KEY = 'budget:v2', TIERS = [5, 15, 50, 1000], LAG = 90000, ERR = .3, MAX_ROWS = 1200;
  const valid = n => Number.isFinite(n) && n >= 0;
  const saved = Store.get(KEY, {}), D = Object.assign(Object.create(null), saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {});
  const owner = () => { try { return String(UI.host?.account?.id || UI.me?.id || UI.host?.account?.email || UI.me?.email || ''); } catch { return ''; } };
  let saveT = 0, revision = 0, memo = null;
  const save = () => { revision++; clearTimeout(saveT); saveT = setTimeout(() => Store.set(KEY, D), 600); try { Bus.emit('budget'); } catch {} };
  function account(create = false) {
    const key = owner(); if (!key) return null;
    if (!Object.hasOwn(D, key) || !D[key] || !Array.isArray(D[key].rows) || !Array.isArray(D[key].samples)) {
      if (!create) return null;
      D[key] = { rows: [], samples: [] };
    }
    return D[key];
  }
  function turn(chat, message) {
    const id = message?.id || [...(chat?.messages || [])].reverse().find(m => m.role === 'assistant')?.id;
    if (!chat?.sid || !id) return;
    const a = account(true); if (!a) return;
    const at = now(), estimate = typeof LiveEst !== 'undefined' ? LiveEst.of(chat)?.usd : null;
    let row = a.rows.find(r => r.sid === chat.sid && r.id === id);
    if (!row) { row = { sid: chat.sid, id, start: Number.isFinite(chat.runAt) && chat.runAt > 0 ? chat.runAt : at, at, estimate: null, charged: null }; a.rows.push(row); }
    row.at = at; row.estimate = valid(estimate) && estimate > 0 ? estimate : null;
    // Drop old inference windows along with evicted rows; never interpret a partial ledger as complete.
    if (a.rows.length > MAX_ROWS) { a.rows.splice(0, a.rows.length - MAX_ROWS); a.samples = []; }
    save();
  }
  function payments(sid, rows, sourceOwner) {
    if (!sourceOwner || sourceOwner !== owner() || !Array.isArray(rows)) return;
    const a = account(true); if (!a) return;
    let changed = false;
    for (const payment of rows) {
      if (!valid(payment?.chargedUsd)) continue;
      const row = a.rows.find(r => r.sid === sid && r.id === payment.messageId);
      if (!row || row.charged === payment.chargedUsd) continue;
      row.charged = payment.chargedUsd; changed = true;
    }
    if (changed) save();
  }
  function sample() {
    const p = typeof Pulse !== 'undefined' ? Pulse.v : null;
    if (!p || p.account !== owner() || !Number.isFinite(p.at) || !valid(p.pulse) || p.pulse > 100) return;
    const a = account(true); if (!a) return;
    const last = a.samples.at(-1); if (last && p.at <= last.at) return;
    if (last && p.pulse > last.p) a.samples = [];
    // No fixed "subtract 90 seconds of spending": wait for a clean settlement boundary.
    if ((typeof Chats !== 'undefined' && [...Chats.values()].some(c => c.busy)) || a.rows.some(r => r.at <= p.at && p.at - r.at < LAG)) { a.pendingAt = p.at; save(); return; }
    if (a.samples.length > 1 && estimate()?.status === 'inconsistent') a.samples = [];
    a.pendingAt = null;
    a.samples.push({ at: p.at, p: p.pulse });
    if (a.samples.length > 40) a.samples.splice(1, 1);
    save();
  }
  function estimate() {
    const a = account(), p = typeof Pulse !== 'undefined' ? Pulse.v : null;
    if (!a || !p || p.account !== owner() || !valid(p.pulse) || p.pulse > 100) return null;
    const samples = a.samples, first = samples[0], last = samples.at(-1);
    const out = { pulse: p.pulse, dp: first && last ? first.p - last.p : 0, ds: 0, total: null, remaining: null, cands: [], lo: 0, hi: Infinity, source: 'charged', transitions: 0, status: 'collecting' };
    if (a.pendingAt === p.at) return { ...out, status: 'settling' };
    if (samples.length < 2) return out;
    let low = 0, high = Infinity, windows = 0, incomplete = false, inconsistent = false;
    for (let i = 0; i < samples.length - 1; i++) for (let j = i + 1; j < samples.length; j++) {
      const f = samples[i], l = samples[j], dp = f.p - l.p;
      const rows = a.rows.filter(r => r.at > f.at && r.at <= l.at);
      // A turn crossing the left observation could already have consumed credits there.
      if (rows.some(r => r.start < f.at || !valid(r.charged) && !valid(r.estimate))) { incomplete = true; continue; }
      let min = 0, max = 0, sum = 0;
      for (const r of rows) { const real = valid(r.charged), cost = real ? r.charged : r.estimate; sum += cost; min += cost * (real ? 1 : 1 - ERR); max += cost * (real ? 1 : 1 + ERR); if (!real) out.source = 'mixed'; }
      if (i === 0 && j === samples.length - 1) out.ds = sum;
      if (dp > 0 && !sum) { inconsistent = true; continue; }
      if (!(sum > 0)) continue;
      if (j === i + 1 && dp > 0) out.transitions++;
      // Integer Pulse differences have up to one percentage point of quantization error.
      low = Math.max(low, min * 100 / (dp + 1));
      if (dp > 1) high = Math.min(high, max * 100 / (dp - 1));
      windows++;
    }
    Object.assign(out, { lo: low, hi: high });
    if (inconsistent || high < low) return { ...out, status: 'inconsistent' };
    if (incomplete) return { ...out, status: 'incomplete' };
    if (!windows) return out;
    out.cands = TIERS.filter(t => t >= low - 1e-9 && t <= high + 1e-9);
    if (!out.cands.length) out.status = 'unmapped';
    else if (out.cands.length > 1) out.status = 'ambiguous';
    else if (out.transitions >= 2 && (out.source === 'charged' || out.dp >= 3)) {
      out.total = out.cands[0]; out.remaining = out.total * p.pulse / 100; out.status = 'inferred';
    }
    return out;
  }
  function est() {
    const p = typeof Pulse !== 'undefined' ? Pulse.v : null, key = JSON.stringify([owner(),revision,p?.account,p?.at,p?.pulse]);
    if(memo?.key!==key)memo={key,value:estimate()};
    return memo.value;
  }
  const sid = id => { const rows = account()?.rows.filter(r => r.sid === id) || []; return rows.length ? { usd: rows.reduce((n, r) => n + (valid(r.charged) ? r.charged : valid(r.estimate) ? r.estimate : 0), 0), turns: rows.length } : null; };
  function nearestTier(total, pool = TIERS) {
    if (!Number.isFinite(total) || total <= 0 || !pool.length) return null;
    let best = pool[0], bd = Infinity;
    for (const t of pool) { const d = Math.abs(Math.log(total / t)); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  function hjbSweetSpot(pulsePct, botScore = 90) {
    if (!valid(pulsePct) || pulsePct > 100) return null;
    const usedPct = Math.max(0, 100 - pulsePct);
    const sig = 1 / (1 + Math.exp(-0.24 * ((Number.isFinite(botScore) ? botScore : 90) - 84)));
    const brakeUsedPct = Math.round((75.0 + 3.5 * sig) * 10) / 10;
    const brakeRemPct = Math.round((100 - brakeUsedPct) * 10) / 10;
    const inSweet = pulsePct >= 72 && pulsePct <= 95;
    const shouldBrake = usedPct >= brakeUsedPct;
    return {
      usedPct,
      remainingPct: pulsePct,
      brakeUsedPct,
      brakeRemPct,
      inSweetSpot: inSweet,
      shouldBrake,
      advice: shouldBrake
        ? `已用 ${usedPct}% ≥ HJB 刹车线 ${brakeUsedPct}%（剩余 ≤${brakeRemPct}%），皇冠会话建议护航保鲜`
        : inSweet
          ? `剩余 ${pulsePct}% 处于 72%–95% 高优甜区（HJB 刹车线剩余 ${brakeRemPct}%）`
          : `剩余 ${pulsePct}%（HJB 甜区刹车线：已用 ${brakeUsedPct}% / 剩余 ${brakeRemPct}%）`,
    };
  }
  function smartEst(rawBud = est(), acct = null) {
    const p = typeof Pulse !== 'undefined' ? Pulse.v : null;
    const pulse = valid(rawBud?.pulse) ? rawBud.pulse : (valid(p?.pulse) ? p.pulse : (valid(+acct?.status?.pulse) ? +acct.status.pulse : null));
    const bs = (typeof BotService !== 'undefined' && BotService.state) ? (BotService.state()?.botScore ?? 90) : 90;
    const hjb = hjbSweetSpot(pulse, bs);
    if (rawBud && rawBud.total != null) return { ...rawBud, hjb };
    const a = account();
    const rows = a?.rows || [];
    const samples = a?.samples || [];
    const rowCost = r => valid(r?.charged) ? r.charged : (valid(r?.estimate) ? r.estimate : 0);
    const totalRowSpend = rows.reduce((s, r) => s + rowCost(r), 0);
    let traceSpend = 0;
    try {
      if (typeof Trace !== 'undefined' && Trace.index) {
        for (const v of Object.values(Trace.index() || {})) if (valid(v?.usd)) traceSpend += v.usd;
      }
    } catch {}
    const floorUsd = (pulse === null || pulse > 0) ? Math.max(totalRowSpend, traceSpend * 0.5) : 0;
    const survivingByFloor = TIERS.filter(t => t > floorUsd);
    const pool = survivingByFloor.length ? survivingByFloor : TIERS;

    // Strategy 1: v1_enhanced highest-precision pair (max usedPts minimizes relative error delta/usedPts) + tailSpend lag compensation
    const pairs = [];
    for (let i = 0; i < samples.length - 1; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const usedPts = samples[i].p - samples[j].p;
        if (!(usedPts >= 1)) continue;
        let spend = 0, tailSpend = 0, hasCharged = false;
        for (const r of rows) {
          const c = rowCost(r);
          if (!(c > 0)) continue;
          if (r.at > samples[i].at && r.at <= samples[j].at) { spend += c; if (valid(r.charged)) hasCharged = true; }
          else if (r.at > samples[j].at && r.at <= samples[j].at + 180000) tailSpend += c;
        }
        const effSpend = spend > 0 ? spend : tailSpend;
        if (!(effSpend > 0)) continue;
        const lo = effSpend / ((usedPts + 1) / 100);
        const hi = usedPts > 1 ? (effSpend + tailSpend) / ((usedPts - 1) / 100) : Infinity;
        const totalEst = effSpend / (usedPts / 100);
        const tiers = pool.filter(t => t >= lo - 1e-9 && t <= hi + 1e-9);
        pairs.push({ usedPts, spend: effSpend, tailSpend, lo, hi, totalEst, tiers, hasCharged });
      }
    }
    if (pairs.length) {
      const best = pairs.reduce((x, y) => (y.usedPts > x.usedPts ? y : x), pairs[0]);
      const calTier = best.tiers.length
        ? nearestTier(best.totalEst, best.tiers)
        : (best.usedPts >= 2 ? nearestTier(best.totalEst, pool) : null);
      if (calTier != null && pulse != null) {
        return {
          ...(rawBud || { pulse, cands: best.tiers.length ? best.tiers : [calTier], transitions: pairs.length }),
          pulse,
          dp: best.usedPts,
          ds: best.spend,
          lo: best.lo,
          hi: best.hi,
          cands: best.tiers.length ? best.tiers : [calTier],
          total: calTier,
          remaining: calTier * pulse / 100,
          loose: best.usedPts < 3 || best.tiers.length !== 1,
          source: best.hasCharged ? 'charged' : 'mixed',
          status: 'inferred',
          hjb,
        };
      }
    }

    // Strategy 2: Single-Pulse baseline (100% -> current pulse) with cumulative account spend
    const cumSpend = Math.max(totalRowSpend, traceSpend);
    if (pulse != null && pulse < 100 && cumSpend > 0.004) {
      const usedPts = 100 - pulse;
      const totalEst = cumSpend / (usedPts / 100);
      const lo = cumSpend / ((usedPts + 1) / 100);
      const hi = usedPts > 1 ? (cumSpend * 1.35) / ((usedPts - 1) / 100) : Infinity;
      const fits = pool.filter(t => t >= lo - 1e-9 && t <= hi + 1e-9);
      const tier = nearestTier(totalEst, fits.length ? fits : pool);
      if (tier != null) {
        return {
          ...(rawBud || { transitions: 1 }),
          pulse,
          dp: usedPts,
          ds: cumSpend,
          lo,
          hi,
          cands: fits.length ? fits : [tier],
          total: tier,
          remaining: tier * pulse / 100,
          loose: true,
          source: rows.some(r => valid(r?.charged)) ? 'charged' : 'mixed',
          status: 'inferred',
          hjb,
        };
      }
    }
    return rawBud ? { ...rawBud, hjb } : (pulse != null ? { pulse, dp: 0, ds: 0, total: null, remaining: null, cands: pool, lo: floorUsd, hi: Infinity, source: 'charged', transitions: 0, status: 'collecting', hjb } : null);
  }
  const _ctxLifeMemo = new WeakMap();
  function sessionContextLife(sidOrChat) {
    try {
      const chat = typeof sidOrChat === 'object' && sidOrChat ? sidOrChat : (typeof Chats !== 'undefined' && sidOrChat ? Chats.get(sidOrChat) : null);
      const msgs = chat?.messages || [];
      if (chat && typeof chat === 'object' && msgs.length > 0) {
        const lastM = msgs.at(-1);
        const memoKey = `${msgs.length}:${lastM?.id || ''}:${lastM?.v || 0}:${lastM?.parts?.length || 0}:${typeof lastM?.text === 'string' ? lastM.text.length : 0}`;
        const hit = _ctxLifeMemo.get(chat);
        if (hit && hit.key === memoKey) return hit.val;
        let chars = 0, userTurns = 0;
        for (const m of msgs) {
          if (m?.role === 'user') userTurns++;
          for (const p of m?.parts || []) if (typeof p?.text === 'string') chars += p.text.length;
          if (typeof m?.text === 'string') chars += m.text.length;
        }
        if (!userTurns && !chars) return null;
        const maxChars = 420000, maxTurns = 95;
        const n = Math.max(1, userTurns);
        const kvCacheRatio = Math.round(((1 + 0.18 * (n - 1)) / n) * 1000) / 1000;
        const charRatio = Math.min(1, chars / maxChars);
        const turnRatio = Math.min(1, userTurns / maxTurns);
        const usedRatio = Math.max(charRatio, turnRatio);
        const remainingPct = Math.round(Math.max(0, (1 - usedRatio) * 100) * 10) / 10;
        const val = { turns: userTurns, chars, maxTurns, maxChars, kvCacheRatio, remainingPct, handoverAlert: remainingPct <= 15 };
        _ctxLifeMemo.set(chat, { key: memoKey, val });
        return val;
      }
      let chars = 0, userTurns = 0;
      for (const m of msgs) {
        if (m?.role === 'user') userTurns++;
        for (const p of m?.parts || []) if (typeof p?.text === 'string') chars += p.text.length;
        if (typeof m?.text === 'string') chars += m.text.length;
      }
      if (!userTurns && typeof sidOrChat === 'string' && typeof Trace !== 'undefined') {
        const ts = Trace.turns(sidOrChat) || [];
        userTurns = ts.length;
        const tot = Trace.totals(sidOrChat);
        if (tot?.tok > 0) chars = Math.round(tot.tok * 2.8);
      }
      if (!userTurns && !chars) return null;
      const maxChars = 420000, maxTurns = 95;
      const n = Math.max(1, userTurns);
      const kvCacheRatio = Math.round(((1 + 0.18 * (n - 1)) / n) * 1000) / 1000;
      const charRatio = Math.min(1, chars / maxChars);
      const turnRatio = Math.min(1, userTurns / maxTurns);
      const usedRatio = Math.max(charRatio, turnRatio);
      const remainingPct = Math.round(Math.max(0, (1 - usedRatio) * 100) * 10) / 10;
      return {
        turns: userTurns,
        chars,
        maxTurns,
        maxChars,
        kvCacheRatio,
        remainingPct,
        handoverAlert: remainingPct <= 15,
      };
    } catch { return null; }
  }
  function drop(sids) { let n = 0; for (const a of Object.values(D)) for (const r of a?.rows || []) if (sids.includes(r.sid)) { delete r.sid; delete r.id; n++; } if (n) save(); return n; }
  function text(e = est()) {
    if (!e) return { head: '', summary: '等待本账号额度观测', why: '等待本账号的有效 Pulse 与扣费记录' };
    const money = n => '$' + (n >= 100 ? Math.round(n) : n.toFixed(2));
    const range = e.lo > 0 ? (Number.isFinite(e.hi) ? money(e.lo) + '–' + money(e.hi) : '≥' + money(e.lo)) : '';
    const status = { collecting: '继续观测有效扣费与额度变化', settling: '等待本轮结束及扣费结算', incomplete: '部分轮次账单缺失或跨观测窗口', inconsistent: '扣费与额度变化不一致，暂不推断', unmapped: '范围未对应常见档位', ambiguous: '仍有多个可能档位' };
    const summary = e.total != null ? '≈ ' + money(e.total) + (e.loose ? '（初估）' : '') : status[e.status] || status.collecting;
    const basis = '已观测 Pulse 下降 ' + e.dp + ' 个百分点；' + (e.source === 'charged' ? '已读取实际扣费' : '含内容估价（按±30%范围）') + ' ' + money(e.ds);
    return { head: e.total != null ? '≈ ' + money(e.remaining) + ' / ' + money(e.total) : '', summary,
      why: summary + '。' + basis + (range && !['inconsistent','incomplete','settling'].includes(e.status) ? '；总额度范围 ' + range : '') + (e.cands?.length > 1 ? '；候选 ' + e.cands.map(money).join(' / ') : '') + (e.hjb?.advice ? '；' + e.hjb.advice : '') + '。属于本机观测推断，非服务端余额；其他设备消费、结算延迟或额度口径不同仍会影响结果。' };
  }
  return { owner, turn, payments, sample, est, smartEst, sessionContextLife, hjbSweetSpot, sid, text, TIERS, drop };
})();
try { Bus.on('pulse', () => Budget.sample()); if (Pulse.v) setTimeout(() => Budget.sample(), 0); } catch {}
