// Stream chunk format parser and turn latency estimator for AI SDK response streams
const Fmt = {
  NAME: { claude: 'claude', gpt: 'gpt', gemini: 'gemini', mistral: 'mistral', compat: '开源模型' },
  LABEL: { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', mistral: 'Mistral', compat: '开源模型' },
  fresh(t0) { return { ids: [], rN: 0, rE: 0, rChars: 0, rHead: '', rEnd: false, tN: 0, tChars: 0, tools: 0, toolIds: [], done: false,
    t0: t0 || 0, stepAt: t0 || 0, recs: t0 ? [{ timestamp: t0, data: { type: 'data-agent-dispatch' } }] : [], seen: false, think: 0, vis: 0, visR: 0, tEnd: 0, stepR: 0, gen: 0, lastOut: 0, open: false }; },
  // 字数 → token（中日韩文字约 1 字 1 token，其余约 4 字符 1 token）
  tok(s) { s = String(s || ''); const cjk = (s.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g) || []).length; return cjk + (s.length - cjk) / 4; },
  // 计时：ts = 这个片段到达的时间（毫秒）；每一步第一次有可见输出时，把之前的等待记成思考时间
  clock(f, ch, ts) {
    if (!ts) return; const t = ch.type;
    if (!f.t0) f.t0 = f.stepAt = ts;
    // 一步的起点 = 上一步结束（工具结果已返回）的时刻：start-step 往往和这一步的输出一起才到（Claude 整步一起下发），不能用它计时
    const out = (t === 'text-delta' && ch.delta) || t === 'tool-input-start' || t === 'tool-input-delta' || t === 'tool-input-available' || (t === 'reasoning-delta' && ch.delta);
    if (out && !f.seen) { f.seen = true; if (!(t === 'reasoning-delta')) f.think += Math.max(0, ts - f.stepAt - 800); }
    if (out) { f.lastOut = ts; f.open = true; }
    // 生成时间：每一步从开始到最后一个输出（不含工具执行、保存工作区等等待）
    if (t === 'finish-step') { f.seenAny = true; if (f.open) f.gen += Math.max(0, f.lastOut - f.stepAt - 800); f.open = false; f.stepAt = ts; f.seen = false; }
    if (t === 'finish-step' || out) f.tEnd = ts;
  },
  // 估算：{ think 秒, out tok, sec 秒, score 推理分（估算）}
  // Claude（思考隐藏）：输出 token ≈ 生成时间 × 约 110 tok/秒（实测 opus-5.5 约 105、sonnet-5.5 约 145），花费 ≈ 输出 × $0.000022（实测中位数）；
  // 其他接口：隐藏思考时间 × 100 + 可见文字 / 思考按字数折算，不估花费
  // 标准题：固定的鹈鹕动画 SVG 题（指纹题单独走 Fingerprint）；只有标准题才打推理分
  stdPrompt(text) { const t = String(text || ''); return /pelican/i.test(t) && /svg/i.test(t); },
  est(f, fam, std) {
    if (!f || !f.t0 || !f.tEnd) return null;
    const gen = (f.gen + (f.open ? Math.max(0, f.lastOut - f.stepAt - 800) : 0)) / 1000;
    const think = f.think / 1000, sec = Math.max(0, (f.tEnd - f.t0) / 1000), claude = fam === 'claude' && !f.rChars;
    let out = Math.round(think * 100 + f.vis); if (claude) out = Math.max(out, Math.round(gen * 110));
    out = Math.max(f.vis > 0 || think > 0 ? 1 : 0, out);
    if (!(out > 0)) return null;
    const usd = claude ? out * 0.000022 : 0;
    let score = null; if (std) try { score = Strength.scoreOf({ out, sec, usd, think, rs: f.rChars / 3, rChars: f.rChars }); } catch {}
    return { think: Math.round(think * 10) / 10, out, sec: Math.round(sec * 10) / 10, usd: usd ? Math.round(usd * 1e5) / 1e5 : null, score };
  },
  // 喂一个回复流片段（type = text-start / reasoning-delta …）
  feed(f, ch, ts) {
    if (!f || !ch) return;
    const t = ch.type;
    try { this.clock(f, ch, ts); } catch {}
    // 强度分细则（cscore.js）要用的精简记录：类型 + 到达时间，正文片段保留文字
    if (f.recs && f.recs.length < 30000 && t && !t.startsWith('data-')) f.recs.push({ timestamp: ts || 0, data: t === 'text-delta' ? { type: t, delta: String(ch.delta || '') } : { type: t } });
    if (t === 'text-delta' || t === 'reasoning-delta') f.vis += this.tok(ch.delta);
    else if (t === 'tool-input-available') f.vis += this.tok(JSON.stringify(ch.input || '')) ;
    if (t === 'tool-input-start' && ch.toolCallId && f.toolIds.length < 8) f.toolIds.push(String(ch.toolCallId));
    if (t === 'reasoning-start') { f._rCurChars = 0; f.rBlocks = (f.rBlocks || 0) + 1; if (f.ids.filter(x => x[0] === 'r').length < 32) f.ids.push(['r', String(ch.id ?? '')]); }
    else if (t === 'text-start') { if (f.ids.filter(x => x[0] === 't').length < 16) f.ids.push(['t', String(ch.id ?? '')]); }
    else if (t === 'reasoning-delta') {
      if (ch.id !== undefined && String(ch.id ?? '') !== '' && !f.ids.some(x => x[0] === 'r' && x[1] === String(ch.id ?? '')) && f.ids.filter(x => x[0] === 'r').length < 32) {
        f.ids.push(['r', String(ch.id ?? '')]);
      }
      const d = String(ch.delta || '');
      f.rWireDeltas = (f.rWireDeltas || 0) + 1;
      if (!d) f.rWireEmptyDeltas = (f.rWireEmptyDeltas || 0) + 1;
      if (d && (/[^\s.…·。]/.test(d) || f.rChars > 0)) {
        f.rN++; f.rChars += d.length;
        if (f.rHead.length < 160) f.rHead += d.slice(0, 160 - f.rHead.length);
        if ((f.rSample = f.rSample || '').length < 4000) f.rSample += d.slice(0, 4000 - f.rSample.length);
      } else {
        f.rE++;
      }
    } else if (t === 'text-delta') { f.tN++; f.tChars += String(ch.delta || '').length; if (!f.ids.some(x => x[0] === 't' && x[1] === String(ch.id ?? '')) && f.ids.filter(x => x[0] === 't').length < 16) f.ids.push(['t', String(ch.id ?? '')]); }
    else if (t === 'tool-input-start') f.tools++;
    else if (t === 'finish') f.done = true;
  },
  // 推测：{ fam, sure, why }；证据还不够时返回 null
  guess(f) {
    if (!f) return null;
    if ((f.toolIds || []).some(i => /^toolu_/.test(i))) return { fam: 'claude', sure: true, why: '工具调用编号是 toolu_…' + (f.toolIds.some(i => /^toolu_vrtx_/.test(i)) ? '（toolu_vrtx_ = Vertex 上的 Claude）' : '') + '：Anthropic 接口' };
    if (!f.ids.length) return null;
    const ids = f.ids, all = ids.map(x => x[1]);
    if (all.some(i => /^(msg|rs)_[0-9a-f]{16,}/i.test(i))) return { fam: 'gpt', sure: true, why: '文字块编号是 msg_… / rs_…（OpenAI Responses 接口）' };
    const rs = ids.filter(x => x[0] === 'r').map(x => x[1]);
    const tx = ids.filter(x => x[0] === 't').map(x => x[1]);
    const num = i => /^\d+$/.test(i);
    // 铁律：开源模型含可见思考文字（rChars > 0）；闭源模型思考块为空（rChars === 0）或使用 msg_/rs_（OpenAI）或纯数字+**标题**（Gemini）
    if (f.rChars > 0) {
      if (all.some(i => /^[0-9a-z]{9}$/.test(i))) return { fam: 'mistral', sure: true, why: '9 位短编号 + 开源可见思考内容' };
      if (all.length > 0 && all.every(num) && /^\s*\*\*[^\n*]{2,80}\*\*/.test(f.rHead || '')) {
        return { fam: 'gemini', sure: true, why: '纯数字流块编号 + **标题** 思考摘要（Google Gemini 闭源思考格式）' };
      }
      return { fam: 'compat', sure: true, why: '思考块含可见思考文字（开源思考：仅匹配开源模型，绝不匹配闭源模型）' };
    }
    if (all.some(i => /^(txt|reasoning)-\d+$/.test(i))) {
      if (rs.length > 0 && f.rChars === 0) return { fam: 'gpt', sure: false, why: '思考块内容为空（闭源思考：仅匹配闭源模型）' };
      return { fam: 'compat', sure: true, why: '流块编号是 txt-0 / reasoning-0 这种兼容格式（DeepSeek / GLM / Qwen / Kimi / MiniMax 等）' };
    }
    if (all.some(i => /^[0-9a-z]{9}$/.test(i))) return { fam: 'mistral', sure: true, why: '流块编号是固定 9 位小写字母数字（Mistral 家族格式）' };
    const isTc = i => /^tc_[A-Za-z0-9_-]{8,}$/.test(i);
    if (rs.length && rs.some(isTc) && rs.every(i => isTc(i) || num(i)) && tx.every(i => num(i) || isTc(i))) {
      return { fam: 'gpt', sure: tx.every(num), why: '思考块是 tc_ 短编号且无可见文字 + 正文数字编号（OpenAI 闭源思考格式）' };
    }
    if (all.every(num)) {
      if (rs.length && f.rChars === 0) {
        if ((f.rWireEmptyDeltas || 0) > 0 || (f.rE || 0) > (f.rBlocks || rs.length)) {
          return { fam: 'claude', sure: true, why: '数字编号 + 空 reasoning-delta 流事件（Anthropic Claude 闭源思考专属特征）' };
        }
        return { fam: 'claude', sure: false, why: '数字编号 + 思考块内容为空（闭源思考被隐藏）' };
      }
      if (!rs.length) return { fam: 'claude', sure: true, why: '纯数字流块编号、没有思考块（Claude / Gemini 闭源非思考模式）' };
    }
    return null;
  },
  // 模型信息条目（Models.set）/ 抽卡识别结果
  entry(g, est) { return g && { name: this.NAME[g.fam] || g.fam, guess: true, fam: g.fam, sure: !!g.sure, why: g.why, internal: null, request: null, response: null, provider: '按回复格式推测', tier: null, routed: false, partial: false, est: est || null }; },
  // 实时通道回放（identifyOld / 抓日志）：取最后一轮的片段推测
  fromReplay(txt) { const use = this.lastTurn(txt); const g = this.guess(use); if (g) g.est = this.est(use, g.fam); return g; },
  // 回放里最后一轮（已结束）的收集结果
  lastTurn(txt) {
    const recs = []; const re = /^data: (.*)$/gm; let m;
    while ((m = re.exec(String(txt || '')))) { let j; try { j = JSON.parse(m[1]); } catch { continue; } for (const r of j?.records || []) recs.push(r); }
    { const by = new Map(); for (const r of recs) by.set(String(r.seq_num), r); recs.length = 0; recs.push(...by.values()); }
    recs.sort((a, b) => (+a.seq_num || 0) - (+b.seq_num || 0));
    let f = null, last = null, disp = 0;
    for (const r of recs) {
      let ch; try { ch = JSON.parse(r.body || '')?.data; } catch { continue; }
      if (!ch?.type) continue;
      const ts = +r.timestamp || 0;
      if (ch.type === 'data-agent-dispatch') { disp = ts; continue; }
      if (ch.type === 'start') { if (f && (f.ids.length || f.toolIds.length)) last = f; f = this.fresh(disp && ts - disp < 600000 ? disp : ts); disp = 0; continue; }
      if (f) this.feed(f, ch, ts);
    }
    const use = f && (f.ids.length || f.toolIds.length) ? f : last;
    if (use) use.done = true;
    return use;
  },
};

// ---------- 格式推测核对：同一轮既有格式推测、又拿到了真实型号时，记下对不对（按账号保存在本机，最多 600 条）----------
// 用来检验推测规则：例如 Google 接口的 Gemini（barium 等）思考同样隐藏时，会被当成 Claude。
const FmtAcc = {
  FAM: { claude: 'anthropic', gpt: 'openai', gemini: 'google', mistral: 'mistral' },
  BIG: ['anthropic', 'openai', 'google', 'xai', 'mistral'],
  rows: null, pend: new Map(),
  load() { if (!this.rows) { const d = Store.get('fmtacc', []); this.rows = Array.isArray(d) ? d : []; } return this.rows; },
  vendor(e) { try { return Brand.of([e.name, e.internal, e.request, e.response].filter(Boolean).join(' ')) || ''; } catch { return ''; } },
  ok(r) { return r.fam === 'compat' ? !this.BIG.includes(r.v) : !!this.FAM[r.fam] && r.v === this.FAM[r.fam]; },
  // 真实型号到了：这一轮结束时再核对（令牌往往在回复开头就到，那时还看不出格式）
  real(c, e) { if (!c?.sid || !e?.name || e.guess) return; this.pend.set(c.sid, { e, at: now() }); if (!c.busy) this.turnEnd(c); },
  turnEnd(c) {
    const p = this.pend.get(c?.sid); if (!p || now() - p.at > 10 * 60000) return;
    const f = c.fmt; if (!f || !(f.ids.length || f.toolIds?.length)) return;
    const g = Fmt.guess({ ...f, done: true }); if (!g) return;
    this.pend.delete(c.sid);
    const k = c.sid + ':' + (f.t0 || 0), L = this.load(); if (L.some(r => r.k === k)) return;
    const r = { k, sid: c.sid, at: now(), fam: g.fam, sure: !!g.sure, why: g.why, real: Strength.canon(p.e.name), v: this.vendor(p.e),
      ids: f.ids.slice(0, 4).map(x => x.join(':')).join(' '), tool: String(f.toolIds?.[0] || '').slice(0, 14), rc: f.rChars, rn: f.rN };
    r.ok = this.ok(r); L.push(r); if (L.length > 600) L.splice(0, L.length - 600); Store.set('fmtacc', L); Bus.emit('fmtacc');
  },
  get(sid) { const L = this.load(); for (let i = L.length - 1; i >= 0; i--) if (L[i].sid === sid) return L[i]; return null; },
  // 按推测结果汇总：{ fam: { n, ok, real: { 厂商: 次数 } } }
  stats() { const o = {}; for (const r of this.load()) { const x = o[r.fam] ||= { n: 0, ok: 0, real: {} }; x.n++; if (r.ok) x.ok++; const v = r.v || '?'; x.real[v] = (x.real[v] || 0) + 1; } return o; },
  clear() { this.rows = []; Store.set('fmtacc', []); Bus.emit('fmtacc'); },
};
Bus.on('model', (c, e) => { try { FmtAcc.real(c, e); } catch {} });

// ---------- 强度分（0–10000，细则见 cscore.js）：每一轮都打分 ----------
// 能识别出型号的旧对话：识别结果不动，补上这一轮的强度分，并记成这个型号的校准样本（旧对话以前识别过的型号就是它的标签）。
// 新对话（识别不出型号）：打分 + 和同一道题的已知样本比，看最像哪一档。同一道题的分数才可比；标准是 cscore.js 里的探针题。
const Calib = {
  MAX: 800, rows: null, clr: 0, pend: new Map(), pushT: 0, pullAt: 0, lastM: null,
  load() { if (!this.rows) { const d = Store.get('fmtcal', null); this.rows = Array.isArray(d?.rows) ? d.rows.map(r => this.fix(r)) : []; this.clr = +d?.clr || 0; } return this.rows; },
  // 细则调整后，旧样本按保存的原始量（对错 / 静默秒数 / 出字速度）重算，不用重新标定
  fix(r) {
    if (!r || !r.ok || r.th === undefined) return r;
    const R = CS.RULES, D = R.depth, S = R.size, cl = x => Math.max(0, Math.min(1, x));
    const ab = Array.isArray(r.cor) ? r.cor.reduce((a, c, i) => a + (c ? R.ability[i] || 0 : 0), 0) : 0;
    const dp = r.th == null ? 0 : Math.round(D.max * cl(Math.log(Math.max(r.th, 1e-3) / D.t0) / Math.log(D.t1 / D.t0)));
    const sz = r.cps == null ? Math.round(S.max / 2) : Math.round(S.max * cl((S.fast - r.cps) / (S.fast - S.slow)));
    return ab === r.ab && dp === r.dp && sz === r.sz ? r : { ...r, ab, dp, sz, s: ab + dp + sz };
  },
  saveLocal() { Store.set('fmtcal', { rows: this.rows, clr: this.clr }); },
  normP(t) { return String(t || '').replace(/\s+/g, '').slice(0, 400); },
  pkey(t) { const s = this.normP(t); if (!s) return ''; let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); },
  get probeKey() { return this.pkey(CS.PROBE); },
  promptOf(chat, m) {
    const ms = chat?.messages || []; let i = m ? ms.indexOf(m) : -1; if (i < 0) i = ms.length;
    for (let j = i - 1; j >= 0; j--) if (ms[j]?.role === 'user') return (ms[j].parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n');
    return '';
  },
  realName(sid) { const m = Models.get(sid); return m?.name && !m.guess ? Strength.canon(m.name) : ''; },
  // 每个对话最近一轮的强度分（本机保存，重开也能看到）
  last: {
    get(sid) { const L = Calib.lastMap(); return L[sid] ? Calib.fix(L[sid]) : null; },
    set(sid, row) { const L = Calib.lastMap(); delete L[sid]; L[sid] = row; const ks = Object.keys(L); if (ks.length > 1500) for (const k of ks.slice(0, ks.length - 1500)) delete L[k]; clearTimeout(Calib.lastT); Calib.lastT = setTimeout(() => Store.set('fmtcal:last', L), 500); },
  },
  lastMap() { if (!this.lastM) { const d = Store.get('fmtcal:last', {}); this.lastM = d && typeof d === 'object' ? d : {}; } return this.lastM; },
  // 按 cscore.js 的细则给一轮打分
  scoreOf(f) { try { return CS.score(CS.measure(f?.recs || [])); } catch (e) { return { valid: false, why: '打分出错：' + (e?.message || e) }; } },
  result(row) { return row && row.ok ? { valid: true, total: row.s, ability: row.ab, depth: row.dp, size: row.sz } : null; },
  // 一轮结束：打分；对话有真实型号就记成校准样本
  turn(chat, m, f0) {
    return null;   // 强度分（千分制）已并入推理分：不再单独打分、不再显示
    if (!m || (!f0 && (!chat?.fmt || chat.endStop))) return null;
    if (Fingerprint.promptKey(this.promptOf(chat, m))) return null; // 不把数字指纹回复送入旧强度分题目的校准库
    const f = f0 || chat.fmt, g = (!f0 && chat.fmtGuess) || Fmt.guess({ ...f, done: true });
    const r = this.scoreOf(f), est = g ? Fmt.est(f, g.fam) : null, pt = this.promptOf(chat, m), p = this.pkey(pt);
    // 同一个对话里第几次问这道题：第 2 次起模型看得到上次的答案，常常不想直接照抄，不能当样本
    const ms = chat?.messages || [], mi = ms.indexOf(m), upto = mi >= 0 ? ms.slice(0, mi) : ms;
    const nrep = Math.max(0, upto.filter(x => x?.role === 'user' && this.pkey((x.parts || []).filter(q => q.type === 'text').map(q => q.text || '').join('\n')) === p).length - 1);
    const row = { k: chat.sid + ':' + (m.id || ''), at: now(), sid: chat.sid, ok: !!r.valid, why: r.valid ? '' : r.why || '',
      s: r.valid ? r.total : null, ab: r.ability ?? null, dp: r.depth ?? null, sz: r.size ?? null, ans: r.answers || null, cor: r.correct || null,
      th: r.thinkSec != null ? Math.round(r.thinkSec * 10) / 10 : null, cps: r.charsPerSec != null ? Math.round(r.charsPerSec) : null,
      fam: g?.fam || '', p, probe: p === this.probeKey, rep: nrep, pt: String(pt).replace(/\s+/g, ' ').trim().slice(0, 40), n: this.realName(chat.sid), est: est ? est.score : null };
    this.last.set(chat.sid, row); setTimeout(() => { try { chat.emit(); } catch {} }, 0);
    if (row.n && row.ok && !nrep) this.add([row]); else if (row.ok && !nrep) this.pend.set(chat.sid, row);
    Bus.emit('fmtcal'); return row;
  },
  // 识别结果晚到（这一轮有运行令牌、刚识别完）：补上标签
  label(sid, name) {
    const r = this.pend.get(sid); if (!r || !name || now() - r.at > 15 * 60000) return;
    this.pend.delete(sid); r.n = Strength.canon(name); this.add([r]); const l = this.last.get(sid); if (l && l.k === r.k) this.last.set(sid, { ...l, n: r.n }); Bus.emit('fmtcal');
  },
  merge(a, b, clr) { const by = new Map(); for (const r of [...a, ...b]) if (r && typeof r.k === 'string' && (r.at || 0) > (clr || 0)) by.set(r.k, r); return [...by.values()].filter(r => !r.del).map(r => this.fix(r)).sort((x, y) => (x.at || 0) - (y.at || 0)).slice(-this.MAX); },
  add(rows) { this.load(); this.rows = this.merge(this.rows, rows, this.clr); this.saveLocal(); this.push(rows); },
  clear() { this.load(); this.rows = []; this.clr = now(); this.saveLocal(); this.push([], true); Bus.emit('fmtcal'); },
  // 所有账号共用：桌面端在宿主里合并，安卓存在共享区
  pq: [], pclr: false,
  push(rows, clr) { this.pq.push(...rows); if (clr) this.pclr = this.clr || now(); clearTimeout(this.pushT); this.pushT = setTimeout(() => this.sync(), 700); },
  async sync() {
    const patch = { rows: this.pq.splice(0), clear: this.pclr }; this.pclr = false;
    try {
      let d = null;
      if (Host.calMerge) d = await Host.calMerge(patch);
      else if (Host.platform === 'android' && Host.shared) {
        d = await Host.shared('fmtcal'); if (!d || !Array.isArray(d.rows)) d = { rows: [], clr: 0 };
        if (patch.clear) d = { rows: [], clr: +patch.clear || now() };
        if (patch.rows.length || patch.clear) { d.rows = this.merge(d.rows, patch.rows, d.clr); await Host.shared('fmtcal', d); }
      }
      if (d && Array.isArray(d.rows)) { this.load(); this.clr = Math.max(this.clr, +d.clr || 0); const next = d.rows.filter(r => !r.del && (r.at || 0) > this.clr).map(r => this.fix(r)); if (JSON.stringify(next) !== JSON.stringify(this.rows)) { this.rows = next; this.saveLocal(); Bus.emit('fmtcal'); } }
    } catch {}
  },
  pull() { if (now() - this.pullAt < 15000) return; this.pullAt = now(); void this.sync(); },
  // 同一道题、已知型号的样本 → cscore 的标定（每档的分数区间和三项中心）
  calib(p, fam) {
    return CS.calibrate(this.samples(p, fam).map(r => ({ label: Strength.canon(r.n), result: this.result(r) })));
  },
  // 可用的样本：同一道题、已知型号；每个对话只取第一次（之后的可能照抄）
  samples(p, fam) {
    const first = new Map();
    for (const r of this.load()) if (r.n && r.ok && !r.rep && r.p === p && (!fam || !r.fam || r.fam === fam)) { const o = first.get(r.sid); if (!o || (r.at || 0) < (o.at || 0)) first.set(r.sid, r); }
    return [...first.values()];
  },
  // 最像哪几档：[{ label, p, band }]
  near(row) {
    if (!row?.ok) return [];
    const cal = this.calib(row.p, row.fam); if (!Object.keys(cal).length) return [];
    return CS.guess(this.result(row), cal).slice(0, 3);
  },
  nearText(row) {
    if (!row) return '';
    if (!row.ok) return row.why || '这一轮没法打分';
    const g = this.near(row);
    if (row.rep) return '同一对话第 ' + (row.rep + 1) + ' 次问这道题，模型可能照抄上次答案，分数不准';
    const S = this.samples(row.p, row.fam), maxTh = Math.max(0, ...S.map(r => r.th || 0)), hasMax = S.some(r => /max/.test(r.n));
    if (g.length && !hasMax && row.th != null && maxTh > 0 && row.th > maxTh * 1.6 + 10) return '比所有样本都想得久（' + row.th + ' 秒，样本最长 ' + maxTh + ' 秒），可能是 max；还没有 max 样本';
    if (!g.length) return row.probe ? '探针题还没有已知型号的样本' : '这道题还没有已知型号的样本（建议用探针题）';
    return g.filter(x => x.p >= 5).map(x => x.label + ' ' + x.p + '%').join(' / ');
  },
  verdict(row, opt) { if (row?.rep) return { action: 'retry', why: '同一对话重复问探针题，分数不准' }; return row ? CS.verdict(row.ok ? this.result(row) : { valid: false, why: row.why }, this.calib(row.p, row.fam), opt) : { action: 'retry', why: '没有打分' }; },
};
Bus.on('model', (c, e) => { try { if (c?.sid && e?.name && !e.guess) Calib.label(c.sid, e.name); } catch {} });
setTimeout(() => { try { Calib.pull(); } catch {} }, 4000);
