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
  const tk = s => { s = String(s || ''); if (!s) return 0; const cjk = (s.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g) || []).length; return Math.round(cjk + (s.length - cjk) / 3.6); };
  const js = v => v == null ? '' : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return ''; } })();
  const inTok = p => p.type === 'text' || p.type === 'reasoning' ? tk(p.text) : p.toolCallId ? tk(p.inputText || js(p.input)) : 0;
  const resTok = p => p.toolCallId ? tk(js(p.output)) + tk(p.errorText) : p.type === 'file' ? 1500 : 0;
  function of(chat) {
    if (!chat) return null;
    const msgs = chat.messages || [], live = [...msgs].reverse().find(m => m.role === 'assistant');
    if (!live) return null;
    const idx = msgs.lastIndexOf(live);
    const sid = chat.sid, model = Models.get(sid)?.name || Trace.latest(sid)?.best || '';
    const isClaude = /claude|opus|sonnet|haiku|fable/i.test(model);
    const sysTok = isClaude ? 11748 : SYS;
    // 先计算历史消息与本轮用户新输入 token：系统提示前缀与历史轮次在新计费中走缓存读取（或首轮缓写）
    let priorHistoryTok = 0, userNewTok = 0;
    const priorMsgs = msgs.slice(0, idx);
    for (let i = 0; i < priorMsgs.length; i++) {
      const m = priorMsgs[i];
      let mTok = 0;
      for (const p of m.parts || []) mTok += inTok(p) + resTok(p);
      if (i === priorMsgs.length - 1 && m.role === 'user') userNewTok += mTok;
      else priorHistoryTok += mTok;
    }
    let ctx = sysTok + priorHistoryTok + userNewTok;
    const steps = []; let cur = null;
    for (const p of live.parts || []) { if (p.type === 'step-start' || !cur) { cur = []; steps.push(cur); if (p.type === 'step-start') continue; } cur.push(p); }
    // 首步缓存：前缀 sysTok + priorHistoryTok 走缓存读取（Claude 首轮无历史时 sysTok 走缓写），本轮用户新输入走未缓存 input
    let prev = (priorHistoryTok > 0 || !isClaude) ? (sysTok + priorHistoryTok) : 0;
    let firstCw = (priorHistoryTok === 0 && isClaude) ? sysTok : 0;
    let inTot = 0, cached = 0, out = 0, rs = 0, tools = 0, usd = 0; const per = [];
    for (let si = 0; si < steps.length; si++) {
      const st = steps[si];
      const input = Math.min(ctx, 1e6), cr = Math.min(prev, input), cw = si === 0 ? Math.min(firstCw, Math.max(0, input - cr)) : 0;
      let o = 0;
      for (const p of st) { const v = inTok(p); o += v; if (p.type === 'reasoning') rs += v; if (p.toolCallId) tools++; }
      inTot += input; cached += cr; out += o;
      const c = Price.chargedCost({ input, cacheRead: cr, cacheWrite: cw, output: o });
      usd += c;
      per.push({ input, output: o, usd: c });
      prev = input + o; ctx += o; for (const p of st) ctx += resTok(p);
    }
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
        }
        const effUsd = Number.isFinite(payRow?.chargedUsd) && payRow.chargedUsd > 0 ? payRow.chargedUsd
          : (Number.isFinite(payRow?.basePriceUsd) && payRow.basePriceUsd > 0 ? payRow.basePriceUsd * 2
          : (Number.isFinite(payRow?.upstreamUsd) && payRow.upstreamUsd > 0 ? payRow.upstreamUsd : null));
        if (effUsd != null) {
          return { steps: steps.length, tools, input: Math.round(inTot), cached: Math.round(cached), output: Math.round(out), reasoning: Math.round(rs), ctx: Math.round(ctx), usd: effUsd, exactUsd: Number.isFinite(payRow?.chargedUsd) && payRow.chargedUsd > 0, model, scale: 1, calN: steps.length, partialHistory: !!chat.hasMore, since: chat.runAt || live.metadata?.createdAt || null };
        }
      }
    } catch {}
    // 用本轮已读到的 Trace 校准（前 n 步的实际 token ÷ 估算）
    let scale = 1, calN = 0; const t = Trace.latest(sid);
    if (t && !t.done && t.calls?.length && chat.runAt && (t.at || 0) >= chat.runAt - 120000) {
      const n = Math.min(t.calls.length, per.length), real = t.calls.slice(0, n).reduce((a, c) => a + (c.tok || 0), 0), est = per.slice(0, n).reduce((a, x) => a + x.input + x.output, 0);
      if (real > 0 && est > 0) { scale = Math.max(0.3, Math.min(5, real / est)); calN = n; }
    }
    return { steps: steps.length, tools, input: Math.round(inTot * scale), cached: Math.round(cached * scale), output: Math.round(out * scale), reasoning: Math.round(rs * scale), ctx: Math.round(ctx * scale), usd: usd * scale, model, scale, calN, partialHistory: !!chat.hasMore, since: chat.runAt || live.metadata?.createdAt || null };
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
  function drop(sids) { let n = 0; for (const a of Object.values(D)) for (const r of a?.rows || []) if (sids.includes(r.sid)) { delete r.sid; delete r.id; n++; } if (n) save(); return n; }
  function text(e = est()) {
    if (!e) return { head: '', summary: '等待本账号额度观测', why: '等待本账号的有效 Pulse 与扣费记录' };
    const money = n => '$' + (n >= 100 ? Math.round(n) : n.toFixed(2));
    const range = e.lo > 0 ? (Number.isFinite(e.hi) ? money(e.lo) + '–' + money(e.hi) : '≥' + money(e.lo)) : '';
    const status = { collecting: '继续观测有效扣费与额度变化', settling: '等待本轮结束及扣费结算', incomplete: '部分轮次账单缺失或跨观测窗口', inconsistent: '扣费与额度变化不一致，暂不推断', unmapped: '范围未对应常见档位', ambiguous: '仍有多个可能档位' };
    const summary = e.total != null ? '≈ ' + money(e.total) : status[e.status] || status.collecting;
    const basis = '已观测 Pulse 下降 ' + e.dp + ' 个百分点；' + (e.source === 'charged' ? '已读取实际扣费' : '含内容估价（按±30%范围）') + ' ' + money(e.ds);
    return { head: e.total != null ? '≈ ' + money(e.remaining) + ' / ' + money(e.total) : '', summary,
      why: summary + '。' + basis + (range && !['inconsistent','incomplete','settling'].includes(e.status) ? '；总额度范围 ' + range : '') + (e.cands.length > 1 ? '；候选 ' + e.cands.map(money).join(' / ') : '') + '。属于本机观测推断，非服务端余额；其他设备消费、结算延迟或额度口径不同仍会影响结果。' };
  }
  return { owner, turn, payments, sample, est, sid, text, TIERS, drop };
})();
try { Bus.on('pulse', () => Budget.sample()); if (Pulse.v) setTimeout(() => Budget.sample(), 0); } catch {}
