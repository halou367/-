// Model label normalization, tier ordering, and token/cost telemetry calibration
// Structure: <vendor>-<family>-<tier>
const Strength = (() => {
  const TIER_LV = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
  const TIER_RE = /^(none|minimal|low|medium|high|xhigh|max)$/i;
  const VEND_RE = /^(gpt|chatgpt|claude|gemini|grok|kimi|qwen|qwq|deepseek|beam|mimo|glm|llama|muse|mistral|doubao|minimax|o[134])$/i;
  const codes = new Set(Store.get('str:codes', ['spirit', 'golem', 'dxzui']));
  const addCode = c => { c = String(c || '').toLowerCase(); if (c && !codes.has(c) && codes.size < 200) { codes.add(c); partsMemo.clear(); Store.set('str:codes', [...codes]); } };
  // canon / parts 是纯函数，侧栏每次重绘都对每张卡片算好几遍：记住结果（parts 依赖代号表，代号表变了清空）
  const canonMemo = new Map(), partsMemo = new Map();
  const memo = (m, k, f) => { let v = m.get(k); if (v === undefined) { v = f(); if (m.size > 6000) m.clear(); m.set(k, v); } return v; };
  const clean = n => { n = noVertex(String(n || '')).trim().replace(/^(?:models|contenders|meta)\//i, ''); return /\s/.test(n) ? n : n.replace(/-(agent|public|vertex)$/i, ''); };
  const vendorFirst = n => VEND_RE.test(clean(n).split(/[-_/ ]/)[0] || '');
  const isCode = n => { n = clean(n); return !!n && !Brand.of(n) && /^[a-z][a-z0-9]{2,15}$/i.test(n) && !TIER_RE.test(n); };

  // 强度代号在前 → 厂商在前
  /* 版本号写法统一：opus-5-5 / opus-5.5、gpt-5-1 / gpt-5.1 是同一个型号，统一写成点号形式；日期（20250219、06-17）、5-72b 这类不动 */
  const foldVer = n => String(n ?? '').replace(/(?<![\d.])(?<!\d-)([1-9]\d?)-(0|[1-9]\d?)(?=$|[^a-z\d])/gi, '$1.$2');
  function canon(n) { const k = String(n ?? ''); return memo(canonMemo, k, () => canon0(k)); }
  function canon0(n) {
    const rawStr = String(n || '');
    const qm = /[?？]\s*$/.test(rawStr);
    n = clean(noteBase(rawStr.replace(/[?？]+\s*$/, ''))); if (!n) return '';
    const parenTier = /\s*\((none|minimal|low|medium|high|xhigh|max)(?:\/(?:none|minimal|low|medium|high|xhigh|max))?\)\s*$/i.exec(n);
    if (parenTier) {
      const tr = parenTier[1].toLowerCase();
      const stem = n.slice(0, parenTier.index).trim().replace(/\s+/g, '-').toLowerCase();
      n = stem.endsWith('-' + tr) ? stem : (stem + '-' + tr);
    } else if (/\s/.test(n) && /^(?:claude|opus|sonnet|haiku|fable|gpt|chatgpt|o[134]|gemini|grok|kimi|qwen|deepseek|beam|glm|minimax|mimo|llama|muse|mistral|solar)\b/i.test(n)) {
      n = n.trim().replace(/\s+/g, '-').toLowerCase();
    }
    n = n.replace(/(\d)(none|minimal|low|medium|high|xhigh|max)\b/gi, '$1-$2');
    n = foldVer(n); n = n.replace(/^muse(?:-(low|medium|high|xhigh|max))?$/i, (_, t) => 'muse-spark-1.3-' + String(t || 'max').toLowerCase()).replace(/gpt-5\.6-luna/ig, 'gpt-6-luna').replace(/\bbarium-bb-v2-4xts(?:-(?:agent|public|vertex))?(?:-(low|medium|high|max))?\b/ig, (_, t) => 'gemini-4-argon-' + String(t || 'high').toLowerCase()); n = n.replace(/\s*[·•・#]\s*\d{1,4}\s*$/, '').replace(/[-_]0\d{2}$/, '').trim(); if (!n) return '';   // 旧版序号后缀：opus-5.5 · 001 / -002 → 同一个型号
    n = n.replace(/-(none|minimal|low|medium|high|xhigh|max)(?:-\1)+$/i, '-$1');   // opus-5-high-high → opus-5-high（档位重复）
    n = n.replace(/-([a-z][a-z0-9]{0,14})(?:-\1)+$/i, '-$1');   // fable-5-v2-v2 → fable-5-v2（后缀重复；只处理字母开头的，5-5 这种版本号不动）
    const m = /^[\w.\/:@+-]{3,90}$/.test(n) && /^([a-z][a-z0-9]{2,15})[-_]+(.+)$/i.exec(n);   // 只处理像型号 ID 的名字（不含空格）
    if (m && !Brand.of(m[1]) && !TIER_RE.test(m[1]) && vendorFirst(m[2])) { addCode(m[1]); return m[2] + '-' + m[1].toLowerCase() + (qm ? '?' : ''); }
    return n + (qm ? '?' : '');
  }
  // 请求 / 响应 / 内部三个来源合成最终名称。以响应型号为基准（最可靠），内部名带厂商和档位时直接用内部名
  function compose({ request, response, internal } = {}) {
    const rq = request ? canon(request) : '', rs = response ? canon(response) : '', it = internal ? canon(internal) : '';
    if (it && Brand.of(it) && (vendorFirst(it) || Brand.tierOf(it) || codes.has(it.split('-').pop().toLowerCase()))) return it;
    const code = [it, rq].find(x => x && isCode(x)) || '';
    let base = rs && Brand.of(rs) ? rs : rq && Brand.of(rq) ? rq : it && Brand.of(it) ? it : '';
    if (!base) return it || rq || rs || '';
    if (code) {
      addCode(code);
      const low = base.toLowerCase(), c = code.toLowerCase();
      if (!Brand.tierOf(base) && !low.endsWith('-' + c)) base += '-' + c;
    }
    return base.replace(/-(none|minimal|low|medium|high|xhigh|max)(?:-\1)+$/i, '-$1');
  }
  // 拆成 { vid, family, tier }；family 把 5.5 / 5-5 视为同一个
  function parts(n) { const k = String(n ?? ''); const p = memo(partsMemo, k, () => parts0(k)); return { ...p }; }
  function parts0(n) {
    const name = canon(n); let base = name.replace(/[?？]+$/, ''), tier = '';
    const pm = /\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(base);
    if (pm) { tier = pm[1].toLowerCase(); base = base.slice(0, pm.index).trim(); }
    const toks = base.split('-');
    const last = (toks.at(-1) || '').toLowerCase();
    if (!tier && toks.length > 1 && (TIER_RE.test(last) || codes.has(last))) { tier = last; toks.pop(); }
    const family = toks.join('-').toLowerCase().replace(/\s+/g, '-').replace(/(\d)\.(\d)/g, '$1-$2');
    return { name, vid: Brand.of(name), family, tier };
  }

  // ---------- 校准样本 ----------
  // { name: [{ k, at, tok, out, rs, usd, std }] }；std = 用抽卡提示词（标准测试）跑出来的
  // 旧名字（带 · 001 之类序号后缀）的样本并到同一个型号下
  function fold(o) {
    for (const k of Object.keys(o)) { const c = canon(k); if (!c || c === k) continue; const arr = o[c] ||= []; for (const r of o[k] || []) if (!arr.some(x => x.k === r?.k)) arr.push(r); arr.sort((a, b) => (a.at || 0) - (b.at || 0)); if (arr.length > 40) arr.splice(0, arr.length - 40); delete o[k]; }
    return o;
  }
  let S = fold(Store.get('str:samples', {})), aborted = Store.get('str:aborted', {}), rev = 0, saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { Store.set('str:samples', S); Store.set('str:aborted', aborted); }, 600); };
  const normP = t => String(t || '').replace(/\s+/g, '').slice(0, 200);
  function markAborted(sid) { aborted[sid] = now(); const ks = Object.keys(aborted); if (ks.length > 2000) for (const k of ks.slice(0, ks.length - 2000)) delete aborted[k]; save(); }
  function collect(sid) {
    const ts = Trace.turns(sid) || []; if (!ts.length) return;
    const std = normP(Gacha.settings().prompt); let changed = false; const dirty = new Set();
    ts.forEach((t, i) => {
      if (!t.done || !t.sum || t.changed || t.outcome) return;
      // Numeric probes are calibrated by Fingerprint only after the whole attempt passes its guards.
      if (Fingerprint.promptKey(t.prompt)) return;
      if (!Fmt.stdPrompt(t.prompt)) return;   // 只有标准题（鹈鹕题）进对照表：普通对话不计，推理分不会越用越高
      const name = canon(t.best); if (!name || !Brand.of(name)) return;
      const ab = aborted[sid]; if (ab && t.at && ab >= t.at && ab - t.at < 15 * 60000) return;   // 被中途停止的（抽卡识别完就停）不算
      const s = t.sum, out = s.output > 0 ? s.output : null, tok = s.tok > 0 ? s.tok : null;
      if (!out && !tok) return;
      const k = sid + ':' + (t.key || i), arr = S[name] ||= [];
      const secs = (t.calls || []).map(c => c.ms).filter(v => v > 0), sec = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / 100) / 10 : null;
      const row = { k, at: t.at || now(), tok, out, rs: s.reasoning > 0 ? s.reasoning : 0, usd: s.usd > 0 ? s.usd : null, sec, std: true, /* 进来的都是标准题（鹈鹕题） */ promptKey: Fingerprint.promptKey(t.prompt), calls: s.calls || 0 };
      const j = arr.findIndex(x => x.k === k);
      if (j >= 0) { if (JSON.stringify(arr[j]) !== JSON.stringify(row)) { arr[j] = row; changed = true; dirty.add(name); } }
      else { arr.push(row); if (arr.length > 40) arr.splice(0, arr.length - 40); changed = true; dirty.add(name); }
    });
    if (changed) { rev++; cache.clear(); save(); Bus.emit('strength'); push(dirty); }
  }
  // 识别到过的型号（包括抽卡中途停止、没有完整回答的）也登记进来：排行里能看到，只是没有推理分
  function register() {
    const add = new Set();
    for (const [sid, m] of Object.entries(Models.all || {})) {
      const n = m?.name && !m.guess && !m.pendingConfirm ? canon(m.name) : '';
      if (!n || !Brand.of(n) || /\s/.test(n)) continue;
      if (!S[n]) { S[n] = []; add.add(n); }
      const saneSc = v => okScore(v) ? v : null;
      const fastSc = (m.routed && okScore(m.reverseScore))
        ? m.reverseScore
        : (saneSc(bookScore(sid)) ?? (m.fingerprint && !m.fingerprint.skipped ? saneSc(m.fingerprint.reasoning?.score) : null) ?? saneSc(m.est?.score) ?? saneSc(m.reverseScore) ?? saneSc(m.habitScore));
      const needBp = !okScore(fastSc) || Boolean(typeof Chats !== 'undefined' && Chats.get?.(sid)?.loaded);
      const bp = (needBp && typeof BillingProbe !== 'undefined') ? BillingProbe.summary?.(sid) : null;
      const sc = okScore(fastSc) ? fastSc : reverseDepthScore(sid, m, bp, null);
      for (const otherName of Object.keys(S)) {
        if (otherName === n || !Array.isArray(S[otherName])) continue;
        const prevLen = S[otherName].length;
        S[otherName] = S[otherName].filter(x => x && x.k !== k && !String(x.k || '').startsWith(sid + ':'));
        if (S[otherName].length !== prevLen) add.add(otherName);
      }
      if (okScore(sc)) {
        const arr = S[n] ||= [];
        const charged = bp?.payment?.chargedUsd ?? m.chargedUsd;
        const outTok = bp?.preimage?.latest?.output ?? m.reverseTokens?.output;
        const row = { k, at: m.at || now(), tok: outTok || null, out: outTok || null, rs: 0, usd: charged > 0 ? charged : null, sec: m.fingerprint?.thinkSec || null, std: false, modelScore: sc };
        const j = arr.findIndex(x => x.k === k);
        if (j < 0) { arr.push(row); if (arr.length > 40) arr.splice(0, arr.length - 40); add.add(n); }
        else if (arr[j].modelScore !== sc) { arr[j] = row; add.add(n); }
      }
    }
    if (add.size) { rev++; cache.clear(); save(); Bus.emit('strength'); push(add); }
  }
  // 鹈鹕测试直接登记一条标准题样本（只有指纹 / 鹈鹕标准题才进对照表）
  function addSample(name, row) {
    name = canon(name); if (!name || !Brand.of(name) || !row?.k) return;
    const arr = S[name] ||= []; if (!arr.some(x => x.k === row.k)) arr.push(row);
    arr.sort((a, b) => (a.at || 0) - (b.at || 0)); if (arr.length > 40) arr.splice(0, arr.length - 40);
    rev++; cache.clear(); save(); Bus.emit('strength'); push(new Set([name]));
  }
  function collectAll() { for (const sid of Object.keys(Trace.index() || {})) try { collect(sid); } catch {} try { register(); } catch {} }

  // ---------- 所有账号共用样本：各账号窗口记录的样本统一合并到宿主，排行是所有账号的累计 ----------
  const okObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function mergeLocal(d, patch) {   // 安卓：单个 WebView，没有并发，直接在这里合并（和桌面端宿主里的逻辑一样）
    const S2 = d.S, clr = d.clr, t = now();
    if (patch.__clear === '*') { for (const k of Object.keys(S2)) delete S2[k]; clr['*'] = t; }
    else if (typeof patch.__clear === 'string') { delete S2[patch.__clear]; clr[patch.__clear] = t; }
    for (const [name, rows] of Object.entries(patch)) {
      if (name.startsWith('__') || !Array.isArray(rows)) continue;
      const cut = Math.max(clr['*'] || 0, clr[name] || 0), arr = S2[name] ||= [];
      for (const r of rows) { if (!r || typeof r.k !== 'string' || (r.at || 0) <= cut) continue; const j = arr.findIndex(x => x.k === r.k); if (j >= 0) arr[j] = r; else arr.push(r); }
      arr.sort((a, b) => (a.at || 0) - (b.at || 0)); if (arr.length > 40) arr.splice(0, arr.length - 40);
    }
  }
  async function hostMerge(patch) {
    if (Host.strMerge) return await Host.strMerge(patch);
    if (Host.platform !== 'android' || !Host.shared) return null;
    let d = await Host.shared('strsamples'); if (!okObj(d)) d = { S: {}, clr: {} }; d.S = okObj(d.S) ? d.S : {}; d.clr = okObj(d.clr) ? d.clr : {};
    if (Object.keys(patch).length) { mergeLocal(d, patch); await Host.shared('strsamples', d); }
    return d.S;
  }
  function adopt(res) {
    if (!okObj(res)) return;
    const next = fold(Object.fromEntries(Object.entries(res).filter(([, v]) => Array.isArray(v))));
    if (JSON.stringify(next) === JSON.stringify(S)) return;
    S = next; cache.clear(); rev++; save(); Bus.emit('strength');
  }
  let pend = {}, pushT = 0;
  function push(names) {
    for (const n of names) pend[n] = S[n] || [];
    clearTimeout(pushT); pushT = setTimeout(async () => { const p = pend; pend = {}; try { adopt(await hostMerge(p)); } catch {} }, 800);
  }
  let pullAt = 0;
  async function pull(force) {
    if (!force && now() - pullAt < 15000) return; pullAt = now();
    try { if (!Store.get('str:mig', false)) { adopt(await hostMerge({ ...S })); Store.set('str:mig', true); } else adopt(await hostMerge({})); } catch {}
  }
  const med = a => { a = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  function stats(name, stdOnly = Prefs.strStd !== false) {
    const all = (S[name] || []).filter(x => !x.promptKey), std = all.filter(x => x.std), use = stdOnly && std.length ? std : stdOnly ? [] : all;
    if (!use.length) return { n: 0, nAll: all.length, nStd: std.length };
    return { n: use.length, nAll: all.length, nStd: std.length, out: med(use.map(x => x.out)), tok: med(use.map(x => x.tok)), rs: med(use.map(x => x.rs || null)), usd: med(use.map(x => x.usd)), upt: med(use.map(x => x.usd > 0 && x.tok > 0 ? x.usd / x.tok * 1e6 : null)), sec: med(use.map(x => x.sec || null)), score: med(use.map(scoreOf)), at: Math.max(...use.map(x => x.at)) };
  }
  // ---------- 推理分 ----------
  // 推理分（0–100）：只看「有没有思考、想了多久」，不再看输出长短和花费（复杂任务输出长，分数会无限涨，不是一个标准）。
  // 思考时长 = 服务器接单（data-agent-dispatch）到第一个输出之间的静默时间（闭源模型看不到思考内容，这段静默就是思考）；
  // 能看到思考内容的模型（reasoning 块 / 用量里有推理 token）按约 100 token/秒折算成时长，取两者较大的。
  // 判定「思考了」：有 reasoning 块、或用量里推理 token > 0、或静默 ≥ THINK_MIN 秒。没思考 → 不计分（null）。
  // 分数 = 100 × (1 − e^(−思考时长 / THINK_T0))：饱和曲线，5 秒≈8 分、20 秒≈28、60 秒≈63、180 秒≈95，复杂任务只会无限接近 100。
  // 只有固定的标准题（指纹题 / 鹈鹕题）才打分，普通对话不计，所以不会越用分越高。
  const THINK_MIN = 5, THINK_T0 = 60;
  const positive = n => Number.isFinite(n) && n > 0;
  function thinkSecOf(x) {
    if (!x) return 0;
    const rs = positive(x.rs) ? x.rs : 0; let t = positive(x.think) ? x.think : 0;
    // 没有实时静默数据（只有运行记录的旧对话）：用总耗时扣掉按 100 token/秒出字的时间估算
    if (!(t > 0) && positive(x.sec) && positive(x.out)) t = Math.max(0, x.sec - Math.max(0, x.out - rs) / 100);
    /* x.derive：有静默数据但静默很短（agent 模型直接调用写文件工具），再用「总耗时 − 可见内容按 100 token/秒出字的时间」估算隐藏的思考时间 */
    if (positive(x.derive) && positive(x.sec)) t = Math.max(t, x.sec - x.derive / 100);
    return Math.max(t, rs / 100);
  }
  const thought = x => !!x && (positive(x.rs) || positive(x.rChars) || thinkSecOf(x) >= THINK_MIN);
  function scoreOf(x) {
    if (x && Number.isFinite(x.modelScore) && x.modelScore >= 0 && x.modelScore <= 100) return x.modelScore;
    if (!x || !thought(x)) return null;
    return Math.round(1000 * (1 - Math.exp(-thinkSecOf(x) / THINK_T0))) / 10;
  }
  /* ---------- 推理分账本：每条对话一本，所有测试（测指纹 / 三连测 / 校准指纹 / 鹈鹕测试）都往里记一笔，显示的分 = 账本聚合值 ----------
     以前每次测试直接覆盖上一次（没思考的一次还会把分清成空），测指纹、校准、鹈鹕交错着测，分数就一直变来变去。
     现在：「实测」（真的看到了思考：思考块 / 推理 token / 静默 ≥ THINK_MIN 秒）每次记一笔，保留最近 BOOK_N 笔；
     「估算」（只能由回复时间和内容估出来：校准更早的回复、鹈鹕题直接写文件）每个来源只留最新一笔。
     聚合 = 有实测就取实测的中位数，没有实测才用估算的中位数。没思考的一次不记账，也不会擦掉已有的分。 */
  const BOOK = 'score-book', BOOK_N = 9, okScore = n => Number.isFinite(n) && n >= 0 && n <= 100;
  const bookAll = () => { const d = Store.get(BOOK, {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; };
  const isLive = m => !!m && (m.live != null ? !!m.live : positive(m.rs) || positive(m.rChars) || Number.isFinite(m.think) && m.think >= THINK_MIN);
  const validRows = a => (Array.isArray(a) ? a : []).filter(x => x && okScore(x.s)).map(x => ({ ...x, live: x.src !== 'prior' && x.live === true }));
  function aggregate(a) {
    const rows = validRows(a), live = rows.filter(x => x.live), pool = live.length ? live : rows;
    if (!pool.length) return null;
    const v = pool.map(x => x.s).sort((p, q) => p - q), i = v.length >> 1;
    return Math.round((v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2) * 10) / 10;
  }
  function bookScore(sid) { return aggregate(bookAll()[sid]); }
  /* 对话删除后清掉它的账本 */
  function bookDrop(sids) { const d = bookAll(); let n = 0; for (const k of sids) if (k in d) { delete d[k]; n++; } if (n) Store.set(BOOK, d); return n; }
  function priorOf(sid) {
    try {
      const mi = Models.get(sid), t = typeof History !== 'undefined' ? History.byId?.(sid)?.title : '';
      for (const n of [mi?.fingerprint && !mi.fingerprint.skipped ? mi.fingerprint.reasoning?.score : null, mi?.est?.score, typeof ConversationLabels !== 'undefined' ? ConversationLabels.parse(t || '').score : null]) if (okScore(n)) return n;
    } catch {}
    return null;
  }
  /* m = { score, think, rs, rChars, live?, source, reuse? }；prior = 这条对话原来显示的分（账本为空时当第一笔，换设备 / 旧版本留下的分不丢） */
  function settle(sid, m, prior) {
    if (!sid) return okScore(m?.score) ? m.score : null;
    const d = bookAll(), a = validRows(d[sid]), live = isLive(m);
    if (!a.length && okScore(prior)) a.push({ s: prior, live: false, at: now(), src: 'prior' });
    if (okScore(m?.score) && !m.reuse) {
      const row = { s: m.score, live, at: now(), src: String(m.source || '') };
      if (live) { a.push(row); while (a.filter(x => x.live).length > BOOK_N) a.splice(a.findIndex(x => x.live), 1); }
      else { const i = a.findIndex(x => !x.live && x.src === row.src); if (i >= 0) a.splice(i, 1); a.push(row); }
    }
    if (a.length) {
      delete d[sid]; d[sid] = a; const ks = Object.keys(d); if (ks.length > 1500) for (const k of ks.slice(0, ks.length - 1500)) delete d[k];
      Store.set(BOOK, d);
    }
    return aggregate(a);
  }
  const SCORE_W = [];
  // 结合费用反推（隐藏思考 Token / 输出 Token / 多步调用 / 型号思考档位）综合计算 0–100 思考深度分数（思考能力越强越接近 100 分）
  function reverseDepthScore(sid, entry, billing, chat) {
    try {
      const mName = String(entry?.name || entry?.candidateName || entry?.reverseLabel || billing?.diagnostics?.candidates?.[0]?.label || billing?.diagnostics?.candidates?.[0]?.id || '').toLowerCase();
      if (!mName && !billing?.preimage) return null;
      let p = {}; try { p = parts(mName) || {}; } catch {}
      const tier = String(entry?.reverseEffort || entry?.effort || entry?.tier || p.tier || '').toLowerCase();
      const isThinkingModel = (!['none', 'minimal', 'low', 'medium'].includes(tier)) && (/thinking|reason|r1|qwq|o1|o3|o4|opus-4-[56]|opus-5|gpt-5.[3456]|gemini-3|grok-4|deepseek-r/i.test(mName) || ['high', 'xhigh', 'max'].includes(tier));
      // 1) 模型固有思考能力基线 (0 - 56 分)
      const tierBase = { max: 55, xhigh: 52, high: 46, medium: 36, low: 24, minimal: 16, none: 10 }[tier];
      let capPts = tierBase != null ? tierBase : (
        /opus-5\.[56]|opus-4-6-thinking|gpt-5\.6|gpt-6|gpt-5-pro|codex-max/i.test(mName) ? 53 :
        /opus|gpt-5.[45]|sonnet-4-6-thinking|gemini-3.1-pro|grok-4.20|r1|qwq/i.test(mName) ? 46 :
        /sonnet|gpt-5|gemini-2.5-pro|qwen3-235b|deepseek-v3|glm-5|kimi-k2/i.test(mName) ? 37 :
        /haiku|flash|mini|nano|lite/i.test(mName) ? 22 : 30
      );
      if (isThinkingModel && capPts < 40) capPts = 42;

      // 2) 反推原像中的思考与输出 Token 深度 (0 - 30 分)
      const tok = billing?.preimage?.latest || billing?.preimage?.totals || entry?.reverseTokens || null;
      const billedOut = Number(tok?.output || 0);
      let visChars = 0, rsnChars = 0, toolSteps = 0, turnSec = 0;
      const msgs = chat?.messages || [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (!msg || msg.role !== 'assistant') { if (visChars > 0 || toolSteps > 0) break; continue; }
        for (const pt of msg.parts || []) {
          if (pt.type === 'text') visChars += String(pt.text || '').length;
          else if (pt.type === 'reasoning') rsnChars += String(pt.text || '').length;
          else if (String(pt.type || '').startsWith('tool-') || pt.type === 'dynamic-tool') toolSteps++;
        }
        const tm = msg.metadata?.timing;
        if (tm?.startedAt && tm?.completedAt && tm.completedAt > tm.startedAt) {
          turnSec += (tm.completedAt - tm.startedAt) / 1000;
        }
        break;
      }
      const visTokEst = Math.round(visChars / 3.2);
      const rsnTokEst = Math.round(rsnChars / 2.8);
      const hiddenThinkTok = billedOut > visTokEst ? (billedOut - visTokEst) : 0;
      const effectiveThinkTok = Math.max(hiddenThinkTok, rsnTokEst, isThinkingModel ? Math.round(billedOut * 0.65) : Math.round(billedOut * 0.25));
      const tokDepth = billedOut > 0 || effectiveThinkTok > 0
        ? 30 * (1 - Math.exp(-(effectiveThinkTok * 1.15 + billedOut * 0.35) / 1800))
        : (isThinkingModel ? 18 : 8);

      // 3) 多步工具推理与思考耗时深度 (0 - 14 分)
      const stepSignal = Math.max(turnSec, toolSteps * 6 + (rsnChars > 0 ? 12 : 0) + (hiddenThinkTok > 200 ? Math.min(45, hiddenThinkTok / 45) : 0));
      const durDepth = stepSignal > 0
        ? 14 * (1 - Math.exp(-stepSignal / 32))
        : (isThinkingModel ? 9 : 4);

      const raw = Math.max(8, Math.min(99.5, capPts + tokDepth + durDepth));
      const measured = (sid && !entry?.routed) ? bookScore(sid) : null;
      const finalScore = okScore(measured) ? Math.round((measured * 0.45 + raw * 0.55) * 10) / 10 : Math.round(raw * 10) / 10;
      return Math.max(1, Math.min(99.8, finalScore));
    } catch {
      return null;
    }
  }
  function noteReverse(sid, entry) {
    if (!sid || !entry) return;
    if (entry.routed && okScore(entry.reverseScore)) {
      const d = bookAll();
      d[sid] = [{ s: entry.reverseScore, live: true, at: now(), src: 'reverse-route' }];
      Store.set(BOOK, d);
    }
    try { register(); } catch {}
    refresh();
  }
  // ---------- 档位顺序校正（保序回归）----------
  // 同一型号的常规档位强度是确定的：low < medium < high < xhigh < max。实测推理分会受回答长短、网络耗时影响，
  // 样本少时会出现「low 比 high 高」的反常。这里用加权保序回归（PAV）把同型号各档位的实测中位数校正成单调：
  // 违反顺序的相邻档位合并成它们的加权平均（权重 = 样本数，样本多的更可信），没违反的保持实测值。
  // 代号（spirit / golem …）和无档位的不参与校正，按自己的实测值，再拿校正后的档位做参照定位。
  let adjRev = -1, adjMap = new Map();
  function rawScore(name) { const a = stats(name), b = stats(name, false), x = a.n ? a : b; return { v: x.n ? (x.score ?? null) : null, n: x.n || 0 }; }
  function adj(name) {
    if (adjRev !== rev) {
      adjRev = rev; adjMap = new Map(); const fams = new Map();
      for (const k of Object.keys(S)) {
        const p = parts(k); if (!TIER_RE.test(p.tier)) continue;
        const r = rawScore(k); if (r.v == null) continue;
        const fk = p.vid + '|' + p.family; if (!fams.has(fk)) fams.set(fk, []);
        fams.get(fk).push({ k, lv: TIER_LV[p.tier.toLowerCase()], v: r.v, w: Math.max(1, r.n) });
      }
      for (const arr of fams.values()) {
        arr.sort((a, b) => a.lv - b.lv); const bl = [];
        for (const x of arr) { bl.push({ v: x.v, w: x.w, it: [x] }); while (bl.length > 1 && bl.at(-2).v > bl.at(-1).v) { const b = bl.pop(), a = bl.pop(); bl.push({ v: (a.v * a.w + b.v * b.w) / (a.w + b.w), w: a.w + b.w, it: [...a.it, ...b.it] }); } }
        for (const b of bl) for (const x of b.it) adjMap.set(x.k, b.v);
      }
    }
    const c = canon(name); return adjMap.has(c) ? adjMap.get(c) : rawScore(c).v;
  }
  // 参考点：同型号 → 同厂商 → 全部，常规档位的实测中位数（推理分用校正后的值）
  const cache = new Map();
  function refs(p, metric) {
    const key = p.vid + '|' + p.family + '|' + metric; if (cache.has(key)) return cache.get(key);
    const pick = f => { const by = {}; for (const name of Object.keys(S)) { const q = parts(name); if (!TIER_RE.test(q.tier) || !f(q)) continue; const v = metric === 'score' ? adj(name) : stats(name)[metric]; if (v) (by[q.tier] ||= []).push(v); } return Object.entries(by).map(([t, vs]) => ({ lv: TIER_LV[t], v: med(vs) })).sort((a, b) => a.v - b.v); };
    let r = pick(q => q.family === p.family); if (r.length < 2) r = pick(q => q.vid === p.vid); if (r.length < 2) r = pick(() => true);
    cache.set(key, r); return r;
  }
  // 按实测消耗估算档位（对数插值；超出范围向外延伸一点）
  function estimate(name) {
    // 和推理分排行用同一份样本：只有非标准样本时也用它（以前这里只看标准样本 → 排行里有分、侧栏却当成「未校准」排到最后）
    const p = parts(name), s0 = stats(name), st = s0.n ? s0 : stats(name, false), metric = st.score ? 'score' : st.out ? 'out' : st.tok ? 'tok' : null;
    if (!metric) return null;
    const r = refs(p, metric), v = metric === 'score' ? (adj(name) || st.score) : st[metric]; if (!r.length) return null;
    // 单调化：档位高的参考点消耗不应更少
    const pts = r.slice().sort((a, b) => a.lv - b.lv).filter((x, i, a) => i === 0 || x.v >= a.slice(0, i).reduce((m, y) => Math.max(m, y.v), 0));
    if (pts.length === 1) return Math.max(0, Math.min(7.5, pts[0].lv + Math.log2(v / pts[0].v)));
    const L = Math.log(v);
    if (L <= Math.log(pts[0].v)) { const a = pts[0], b = pts[1]; const k = (b.lv - a.lv) / Math.max(1e-6, Math.log(b.v) - Math.log(a.v)); return Math.max(0, a.lv + (L - Math.log(a.v)) * Math.min(k, 2)); }
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (L <= Math.log(b.v)) return a.lv + (b.lv - a.lv) * (L - Math.log(a.v)) / Math.max(1e-6, Math.log(b.v) - Math.log(a.v)); }
    const a = pts.at(-2), b = pts.at(-1); const k = (b.lv - a.lv) / Math.max(1e-6, Math.log(b.v) - Math.log(a.v));
    return Math.min(7.5, b.lv + (L - Math.log(b.v)) * Math.min(k, 2));
  }
  // 强度数值：常规档位用档位；代号用实测估算（未校准 = null）
  function level(n) {
    const p = parts(n);
    if (TIER_LV[p.tier] != null) return TIER_LV[p.tier];
    if (!p.tier) return null;
    const k = 'lv|' + p.name; if (cache.has(k)) return cache.get(k);
    const v = estimate(p.name); cache.set(k, v); return v;
  }
  const lvName = lv => lv == null ? '未校准' : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'][Math.max(0, Math.min(6, Math.round(lv)))] + (lv > 6.5 ? '+' : '');
  const strong = n => { const lv = level(n); return lv != null && lv > TIER_LV.medium + 0.25; };
  // 推理分排行：汇总标准样本 + 本机对话实测/指纹/费用反推推理分
  function collectModelScores() {
    const byModel = new Map();
    try {
      for (const [sid, m] of Object.entries(Models.all || {})) {
        if (!m || m.pendingConfirm) continue;
        const rawName = m.name || m.candidates?.[0]?.id || '';
        const name = canon(rawName);
        if (!name || !Brand.of(name) || /\s/.test(name)) continue;
        let entry = byModel.get(name);
        if (!entry) byModel.set(name, entry = { scores: [], usds: [], outs: [], secs: [], at: 0, n: 0 });
        entry.n++;
        if ((m.at || 0) > entry.at) entry.at = m.at || 0;
        const reidSc = m.reverseScore ?? m.habitScore;
        const fastSc = ((m.routed || m.userCorrected || m.habitInferred || m.reverseInferred || m.billingProbe) && okScore(reidSc))
          ? reidSc
          : (bookScore(sid) ?? (m.fingerprint && !m.fingerprint.skipped ? m.fingerprint.reasoning?.score : null) ?? m.est?.score ?? reidSc);
        const needBp = !okScore(fastSc) || Boolean(typeof Chats !== 'undefined' && Chats.get?.(sid)?.loaded);
        const bp = (needBp && typeof BillingProbe !== 'undefined') ? BillingProbe.summary?.(sid) : null;
        const sc = okScore(fastSc) ? fastSc : reverseDepthScore(sid, m, bp, null);
        const charged = bp?.payment?.chargedUsd ?? m.chargedUsd;
        if (charged > 0) entry.usds.push(charged);
        const outTok = bp?.preimage?.latest?.output ?? m.reverseTokens?.output;
        if (outTok > 0) entry.outs.push(outTok);
      }
    } catch {}
    return byModel;
  }
  function updatedAt() {
    let maxAt = 0;
    try {
      for (const arr of Object.values(S || {})) for (const x of arr || []) if ((x?.at || 0) > maxAt) maxAt = x.at;
      for (const m of Object.values(Models.all || {})) if ((m?.at || 0) > maxAt) maxAt = m.at;
      if (!maxAt && typeof Ranking !== 'undefined' && Ranking.at) maxAt = Ranking.at;
    } catch {}
    return maxAt || Date.parse('2026-10-16T06:00:00.000Z') || Date.now();
  }
  function board() {
    const mCount = Object.keys(Models.all || {}).length;
    const bKey = 'board|' + rev + '|' + mCount;
    const cachedBoard = cache.get(bKey);
    if (cachedBoard && (Date.now() - cachedBoard.at) < 8000) return cachedBoard.rows;
    const mScores = collectModelScores();
    const allNames = new Set([...Object.keys(S), ...mScores.keys()]);
    const rows = [...allNames].map(name => {
      const p = parts(name), st = stats(name, false), stS = stats(name), ms = mScores.get(name);
      return { name, ...p, st, stS, ms, lv: level(name), est: TIER_RE.test(p.tier) ? estimate(name) : null };
    }).filter(r => r.vid);
    for (const r of rows) {
      r.pw = power(r.name);
      r.usd = usdOf(r.name) ?? (r.ms?.usds?.length ? med(r.ms.usds) : null);
      r.upt = uptOf(r.name);
      const baseS = r.stS.n ? r.stS : r.st;
      if (baseS.n && baseS.score != null) {
        r.s = baseS;
        r.raw = baseS.score;
        r.score = adj(r.name);
      } else if (r.ms && r.ms.scores.length) {
        const mSc = Math.round(med(r.ms.scores) * 10) / 10;
        r.s = {
          n: r.ms.scores.length,
          nAll: r.ms.n,
          nStd: 0,
          out: r.ms.outs.length ? med(r.ms.outs) : baseS.out,
          usd: r.ms.usds.length ? med(r.ms.usds) : baseS.usd,
          sec: baseS.sec ?? null,
          score: mSc,
          at: r.ms.at || baseS.at || 0,
          fromModels: true,
        };
        r.raw = mSc;
        r.score = mSc;
      } else {
        r.s = baseS;
        r.raw = null;
        r.score = null;
      }
      r.fixed = r.raw != null && r.score != null && Math.abs(r.score - r.raw) > 0.05;
      r.ver = ver10(r.name);
      r.fk = (r.vid || '') + '|' + r.family;
    }
    const famMax = new Map(); for (const r of rows) famMax.set(r.fk, Math.max(famMax.get(r.fk) ?? -1, r.score ?? -1));
    for (const r of rows) r.pos = position(r, rows);
    const sortedRows = rows.sort((a, b) => ((b.score != null ? 1 : 0) - (a.score != null ? 1 : 0)) || b.ver - a.ver || famMax.get(b.fk) - famMax.get(a.fk) || (b.score ?? -1) - (a.score ?? -1) || (b.lv ?? -1) - (a.lv ?? -1) || a.fk.localeCompare(b.fk) || a.name.localeCompare(b.name));
    cache.set(bKey, { at: Date.now(), rows: sortedRows });
    return sortedRows;
  }
  // 代号（spirit / golem / dxzui …）在同型号常规档位里的位置：「≈ high」「介于 low 和 medium 之间」「高于 max」
  function position(r, rows) {
    if (r.score == null) return '';
    if (!r.tier || TIER_RE.test(r.tier)) return '';
    const ref = rows.filter(x => x.fk === r.fk && TIER_RE.test(x.tier) && x.score != null).sort((a, b) => a.score - b.score);
    if (!ref.length) { const e = estimate(r.name); return e != null ? '≈ ' + lvName(e) + '（估算）' : ''; }
    for (const x of ref) if (Math.abs(Math.log(r.score / x.score)) < 0.08) return '≈ ' + x.tier;
    if (r.score < ref[0].score) return '低于 ' + ref[0].tier;
    if (r.score > ref.at(-1).score) return '高于 ' + ref.at(-1).tier;
    for (let i = 1; i < ref.length; i++) if (r.score < ref[i].score) return '介于 ' + ref[i - 1].tier + ' 和 ' + ref[i].tier + ' 之间';
    return '';
  }
  // 综合强度（推理分排行辅助数据，不参与侧栏排序 / 金色）：默认 = 版本号 + 型号大小 + 思考强度（版本鸿沟优先）；
  // 但实测花费明显更高（≥1.25 倍）的型号会排到比它版本高、花费更低的同厂商型号前面——消耗额度最大的就是最强。
  const ver10 = n => { const k = Brand.toks(n), i = k.findIndex(x => /^\d{1,2}$/.test(x)); if (i < 0) return 0; const nx = k[i + 1] || ''; return +k[i] + (/^\d$/.test(nx) ? +nx / 10 : /^\d{2}$/.test(nx) ? +nx / 100 : 0); };
  const SIZE = [[/\bnano\b/, -0.5], [/\b(mini|lite|small)\b/, -0.4], [/\b(flash|haiku)\b/, -0.3], [/\bsonnet\b/, -0.2], [/\bluna\b/, -0.3], [/\bterra\b/, -0.2], [/\bsol\b/, -0.1]];
  function base(n) {
    const p = parts(n), t = Brand.toks(p.name).join(' '); let b = ver10(p.name);
    for (const [re, d] of SIZE) if (re.test(t)) { b += d; break; }
    const lv = level(p.name); return b + 0.05 * (lv ?? 3);
  }
  let pwRev = -1, pwMap = new Map();
  const usdOf = k => { const a = stats(k), b = stats(k, false); return a.usd || b.usd || null; };
  const uptOf = k => { const a = stats(k), b = stats(k, false); return a.upt || b.upt || null; };
  function power(n) {
    const name = canon(n);
    if (pwRev !== rev) {
      pwRev = rev;
      const ms = Object.keys(S).map(k => ({ k, vid: Brand.of(k), b: base(k), usd: uptOf(k) })).filter(x => x.usd > 0).sort((a, b) => a.b - b.b);
      const pw = new Map(ms.map(x => [x.k, x.b]));
      for (let pass = 0; pass < 3; pass++) for (const x of ms) for (const y of ms) if (x !== y && x.vid === y.vid && y.b > x.b && x.usd >= y.usd * 1.25 && pw.get(x.k) <= pw.get(y.k)) pw.set(x.k, pw.get(y.k) + 0.001);
      pwMap = pw;
    }
    return pwMap.get(name) ?? base(name);
  }
  // 说明文字：常规档位「high · 实测≈xhigh」；代号「≈ xhigh（5.2）· 3 次」/「未校准」
  function label(n) {
    const p = parts(n), st = stats(p.name, false), sc = st.n ? adj(p.name) : null, scTxt = sc != null ? ' · 推理分 ' + fmtScore(sc) : '';
    if (!p.tier) return st.n ? '标准' + scTxt + ' · ' + st.n + ' 次样本' : '标准';
    if (TIER_RE.test(p.tier)) return p.tier + scTxt;
    if (sc == null) return p.tier + ' · 未校准';
    const row = board().find(r => r.name === p.name);
    return p.tier + scTxt + (row?.pos ? ' · ' + row.pos : '') + ' · ' + st.n + ' 次';
  }
  const fmtScore = v => (v == null || !Number.isFinite(+v) || +v < 0 || +v > 100) ? '—' : +v >= 100 ? '100' : (+v).toFixed(1);
  function refresh() { cache.clear(); rev++; Bus.emit('strength'); }
  function clear(name) { if (name) delete S[name]; else S = {}; cache.clear(); rev++; save(); Bus.emit('strength'); hostMerge({ __clear: name || '*' }).then(adopt).catch(() => {}); }

  // 旧数据：「spirit-gpt-6-astra」这类名字翻成厂商在前；只存了代号的用 Trace 里的响应型号补全；并清理 >100 的异常推理分（如 REI 污染值）
  function migrate() {
    let n = 0;
    for (const [sid, m] of Object.entries(Models.all || {})) {
      if (!m?.name) continue;
      const c = canon(m.name); if (c && c !== clean(m.name)) { m.name = c; m.tier = parts(c).tier || m.tier || null; n++; }
      if (m.reverseScore != null && (!Number.isFinite(+m.reverseScore) || +m.reverseScore <= 0 || +m.reverseScore > 100)) {
        const fallback = okScore(m.habitScore) ? +m.habitScore : reverseDepthScore(sid, m, null, null);
        m.reverseScore = okScore(fallback) ? fallback : null;
        n++;
      }
      if (m.habitScore != null && (!Number.isFinite(+m.habitScore) || +m.habitScore <= 0 || +m.habitScore > 100)) {
        const fallback = okScore(m.reverseScore) ? +m.reverseScore : reverseDepthScore(sid, m, null, null);
        m.habitScore = okScore(fallback) ? fallback : null;
        n++;
      }
      if (m.est && m.est.score != null && (!Number.isFinite(+m.est.score) || +m.est.score <= 0 || +m.est.score > 100)) {
        const fallback = okScore(m.reverseScore) ? +m.reverseScore : (okScore(m.habitScore) ? +m.habitScore : reverseDepthScore(sid, m, null, null));
        m.est = { ...m.est, score: okScore(fallback) ? fallback : null };
        n++;
      }
      if (!Brand.of(m.name)) try { Trace.adopt(sid); } catch {}
    }
    if (n) { Store.set('models', Models.all); Bus.emit('models'); }
  }
  Bus.on('trace', sid => { if (sid) { try { collect(sid); } catch {} } });
  setTimeout(async () => { try { migrate(); } catch {} await pull(true); collectAll(); }, 2500);
  setInterval(() => { if (!document.hidden) pull(); }, 60000);
  addEventListener('focus', () => pull());
  function withEffort(name, lvl) {
    const raw = String(name || '').trim();
    if (!raw) return lvl ? String(lvl).toLowerCase() : '';
    const c = canon(raw);
    const ef = String(lvl || '').trim().toLowerCase();
    if (!ef) return c || raw;
    if (!c) return raw + '-' + ef;
    const low = c.toLowerCase().replace(/[?？]+$/, '');
    const qm = /[?？]$/.test(c) ? '?' : '';
    if (low.endsWith('-' + ef)) return c;
    const base = c.replace(/[?？]+$/, '').replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '');
    return base + '-' + ef + qm;
  }
  return { foldVer, updatedAt, settle, bookScore, bookDrop, priorOf, isLive, addSample, thinkSecOf, thought, THINK_MIN, canon, compose, parts, level, lvName, label, power, ver10, usdOf, uptOf, strong, estimate, stats, board, scoreOf, SCORE_W, reverseDepthScore, noteReverse, fmtScore, collect, collectAll, markAborted, clear, refresh, pull, adj, codes, TIER_LV, withEffort, get rev() { return rev; }, get samples() { return S; } };
})();

// ---------- 金色：自动（最高版本的最强一档）/ 手动点亮（设置里打勾、推理分排行里点档位）----------
// 手动点亮的型号 = 金色 + 侧栏置顶；存在共享设置里（所有账号 / 窗口一致）
const Gold = {
  get manual() { return Prefs.goldMode === 'manual'; },
  _set: null, _sig: '', _autoSet: null, _autoAt: 0,
  restoredChats: new Map(),
  unmarkAt: Store.get('gold:off', {}) || {},
  keysOf(n) {
    const raw = String(n || '').replace(/[?？]+$/, '').trim();
    if (!raw) return [];
    const c = Strength.canon(raw).replace(/[?？]+$/, '').toLowerCase();
    const out = new Set();
    if (c) out.add(c);
    try {
      const sh = cardName(c || raw);
      if (sh) {
        const sc = Strength.canon(sh).replace(/[?？]+$/, '').toLowerCase();
        if (sc) out.add(sc);
      }
      const p = Strength.parts(c || raw);
      if (p?.vid && p?.name) {
        const famName = p.tier ? p.name.slice(0, -(p.tier.length + 1)) : p.name;
        const fk = p.vid + '|' + (Brand.toks(cardName(famName) || famName).join('-') || p.family) + '|' + (p.tier || '').toLowerCase();
        out.add(fk.toLowerCase());
      }
    } catch {}
    return [...out];
  },
  set() {
    const a = Array.isArray(Prefs.goldSet) ? Prefs.goldSet : [], sig = a.join('\u0001');
    if (sig !== this._sig || !this._set) {
      this._sig = sig;
      const s = new Set();
      for (const x of a) for (const k of this.keysOf(x)) s.add(k);
      this._set = s;
    }
    return this._set;
  },
  autoSet() {
    if (!this._autoSet || Date.now() - this._autoAt > 120000) {
      this._autoAt = Date.now();
      const s = new Set();
      try {
        for (const x of GoldBoard.autoGold()) for (const k of this.keysOf(x)) s.add(k);
      } catch {}
      this._autoSet = s;
    }
    return this._autoSet;
  },
  key: n => Strength.canon(String(n || '').replace(/[?？]+$/, '')).replace(/[?？]+$/, '').toLowerCase(),
  has(n) {
    const ks = this.keysOf(n);
    if (!ks.length) return false;
    const s = this.set();
    return ks.some(k => s.has(k));
  },
  autoHas(n) {
    const ks = this.keysOf(n);
    if (!ks.length) return false;
    const s = this.autoSet();
    return ks.some(k => s.has(k));
  },
  isUnifiedGold(n) {
    return this.manual ? this.has(n) : this.autoHas(n);
  },
  chatSet() {
    return new Set(Array.isArray(Prefs.goldChats) ? Prefs.goldChats : []);
  },
  hasChat(sid) {
    if (!sid) return false;
    if (this.chatSet().has(sid)) return true;
    if (this.restoredChats.has(sid) && !this.unmarkAt?.[sid]) {
      const gp = this.restoredChats.get(sid);
      const mi = typeof Models !== 'undefined' ? Models.get?.(sid) : null;
      const curNm = mi?.name ? Strength.canon(mi.name) : '';
      const gpNm = gp?.model ? Strength.canon(gp.model) : '';
      if (gpNm && curNm && typeof Brand !== 'undefined' && Brand.of(curNm) && gpNm !== curNm && !this.isUnifiedGold(curNm)) return false;
      return true;
    }
    return false;
  },
  noteRestoredChat(sid, gp) {
    if (!sid || !gp?.gold || this.unmarkAt?.[sid]) return;
    if (!this.restoredChats.has(sid)) {
      this.restoredChats.set(sid, gp);
    }
  },
  toggleChat(sid) {
    if (!sid) return false;
    const cur = new Set(Array.isArray(Prefs.goldChats) ? Prefs.goldChats : []);
    const wasOn = this.hasChat(sid);
    if (wasOn) {
      cur.delete(sid);
      this.restoredChats.delete(sid);
      this.unmarkAt[sid] = Date.now();
      try { Store.set('gold:off', this.unmarkAt); } catch {}
    } else {
      cur.add(sid);
      delete this.unmarkAt[sid];
      try { Store.set('gold:off', this.unmarkAt); } catch {}
    }
    Prefs.goldChats = [...cur];
    this.changed([sid]);
    return !wasOn;
  },
  isChatGold(sid, rawTitle) {
    if (!sid) return false;
    if (typeof Fav !== 'undefined' && Fav.has(sid)) return true;
    if (this.hasChat(sid)) return true;
    const gp = typeof TitleCipher !== 'undefined' && TitleCipher.decodeGoldPrefix ? TitleCipher.decodeGoldPrefix(rawTitle) : null;
    const mi = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const hasReidMi = Boolean(mi?.name && !mi.pendingConfirm && !/^(未识别|未知型号|待定)$/.test(String(mi.name).trim()) && (mi.userCorrected || mi.reverseInferred || mi.habitInferred || mi.billingProbe || !mi.guess));
    if (gp?.gold && !this.unmarkAt?.[sid]) {
      if (!hasReidMi) return true;
      const miCanon = Strength.canon(mi.name);
      if (miCanon && typeof Brand !== 'undefined' && Brand.of(miCanon)) return this.isUnifiedGold(miCanon);
      return true;
    }
    const nm = Strength.canon((hasReidMi ? mi.name : '') || mi?.name || gp?.model || '');
    if (nm && typeof Brand !== 'undefined' && Brand.of(nm) && this.isUnifiedGold(nm)) return true;
    return false;
  },
  setMode(manual, seed) {
    const wasManual = this.manual;
    Prefs.goldMode = manual ? 'manual' : 'auto';
    if (manual && !wasManual && !Array.isArray(Prefs.goldSet) && seed?.length) {
      Prefs.goldSet = [...new Set(seed.map(n => Strength.canon(String(n || '').replace(/[?？]+$/, ''))).filter(Boolean))];
    } else if (manual && !Array.isArray(Prefs.goldSet)) {
      Prefs.goldSet = [];
    }
    this.changed();
  },
  clearAll() {
    Prefs.goldMode = 'manual';
    Prefs.goldSet = [];
    Prefs.goldChats = [];
    this.restoredChats.clear();
    this.changed();
    toast('已取消全部金色标记（所有账号已同步）');
  },
  toggle(n) {
    const c = Strength.canon(String(n || '').replace(/[?？]+$/, '')).replace(/[?？]+$/, ''); if (!c) return;
    if (!this.manual) { Prefs.goldMode = 'manual'; Prefs.goldSet = GoldBoard.autoGold(); }
    const targetKeys = new Set(this.keysOf(c));
    const prev = Array.isArray(Prefs.goldSet) ? Prefs.goldSet : [];
    const arr = prev.filter(x => !this.keysOf(x).some(k => targetKeys.has(k)));
    const wasOn = arr.length < prev.length;
    const on = !wasOn;
    if (on) arr.push(c);
    Prefs.goldSet = arr; this.changed();
    toast((on ? '已点亮金色 ' : '已关闭金色 ') + (cardName(c) || c) + '（全部账号已同步）');
  },
  changed(sids) {
    this._set = null; this._autoSet = null;
    Prefs.goldAt = Date.now();
    savePrefs();
    try {
      if (typeof Host !== 'undefined' && typeof Host.shared === 'function') {
        Host.shared('gold', { mode: Prefs.goldMode || 'auto', set: Array.isArray(Prefs.goldSet) ? Prefs.goldSet : [], chats: Array.isArray(Prefs.goldChats) ? Prefs.goldChats : [], at: Prefs.goldAt })?.catch?.(() => {});
      }
    } catch {}
    Bus.emit('gold');
    try { UI.renderList(); } catch {}
    try { AcctStats.soon(200); } catch {}
    try {
      if (typeof Titles !== 'undefined' && Titles.touch) {
        const targets = Array.isArray(sids) && sids.length ? sids : (typeof History !== 'undefined' && Array.isArray(History.items) ? History.items.filter(e => e?.id && (this.isChatGold(e.id, e.title) || (typeof TitleCipher !== 'undefined' && TitleCipher.isGoldPrefixed?.(e.title)))).map(e => e.id).slice(0, 30) : []);
        for (const sid of targets) Titles.touch(sid);
        if (targets.length && Titles.soon) Titles.soon(500);
      }
    } catch {}
  },
  // 所有账号对话里出现过的型号（各账号窗口上报的统计 + 本账号的对话列表 + 推理分样本）
  acct: [], acctAt: 0,
  async loadAcct(force) {
    if (!force && now() - this.acctAt < 60000) return this.acct;
    this.acctAt = now();
    try {
      if (typeof Shared !== 'undefined' && Shared.pull) await Shared.pull();
    } catch {}
    try {
      const L = await Host.listAccounts(true); const out = new Set();
      for (const a of L || []) for (const v of Object.values(a?.status?.stats?.vendors || {})) for (const k of Object.keys(v?.models || {})) if (k && k !== '未识别') out.add(k);
      this.acct = [...out]; this._autoSet = null; Bus.emit('gold');
    } catch {}
    return this.acct;
  },
  universe() {
    const out = new Set(['claude-opus-5.6-max', 'gpt-6.1-sol-max', ...this.acct]);
    for (const e of History.items || []) { const n = Models.get(e.id)?.name; if (n) out.add(n); }
    for (const n of Prefs.goldSet || []) out.add(n);
    return [...out];
  },
};
Bus.on('prefs', () => { Gold._set = null; Gold._autoSet = null; });
Bus.on('strength', () => { Gold._autoSet = null; });

// 推理分排行（横排）：每个型号一行，各档位横着排；有推理分的档位上色，没有的灰色；点档位 = 点亮 / 熄灭金色
const GoldBoard = {
  open(mode) { if (typeof Tabs !== "undefined" && Tabs.openPower) Tabs.openPower(mode || "power"); },
  families() {
    const rows = Strength.board(), map = new Map();
    // 同一个型号只占一行：按显示名归并（openai/gpt-6-sol、GPT-6-sol、gpt6-sol … 都是「6-sol」），同一档位取样本多的那条
    const add = (name, row) => {
      const p = Strength.parts(name); if (!p.vid || !p.name) return;
      const famName = p.tier ? p.name.slice(0, -(p.tier.length + 1)) : p.name;
      const fk = p.vid + '|' + (Brand.toks(cardName(famName) || famName).join('-') || p.family), key = (p.tier || '').toLowerCase();
      let f = map.get(fk);
      if (!f) map.set(fk, f = { fk, vid: p.vid, fam: famName, ver: Strength.ver10(p.name) || 0, tiers: new Map() });
      const t = f.tiers.get(key), n = row?.s?.n || 0;
      if (!t) f.tiers.set(key, { name: p.name, tier: p.tier, lv: Strength.level(p.name), row: row || null });
      else if (row && (!t.row || n > (t.row.s?.n || 0))) { t.row = row; t.name = p.name; }
    };
    for (const r of rows) add(r.name, r);
    for (const n of Gold.universe()) add(n);
    const fams = [...map.values()].map(f => {
      const tiers = [...f.tiers.values()].map(t => ({ ...t, score: t.row?.s?.n ? t.row.score : null }));
      // 档位：推理分从高到低；没有推理分的排在后面（按档位高低）
      tiers.sort((a, b) => ((b.score ?? -1) - (a.score ?? -1)) || ((b.lv ?? -1) - (a.lv ?? -1)) || a.name.localeCompare(b.name));
      return { ...f, tiers, best: tiers.reduce((m, t) => Math.max(m, t.score ?? -1), -1) };
    });
    // 型号：看上限——按这个型号最高的推理分从高到低；都没有推理分的排在最后（按版本号）
    return fams.sort((a, b) => b.best - a.best || b.ver - a.ver || a.fk.localeCompare(b.fk));
  },
  // 自动规则下的金色：各主力厂商最高版本里最强的一档（全账号统一规则）
  autoGold(fams) {
    fams = fams || this.families();
    const all = fams.flatMap(f => f.tiers.map(t => ({ ...t, ver: f.ver, vid: f.vid })));
    const out = new Set();
    const byVid = new Map();
    for (const r of all) {
      if (r.lv == null || !r.vid) continue;
      if (!byVid.has(r.vid)) byVid.set(r.vid, []);
      byVid.get(r.vid).push(r);
    }
    for (const [vid, list] of byVid.entries()) {
      if (vid !== 'anthropic' && vid !== 'openai') continue;
      const topV = list.reduce((m, r) => r.ver > m ? r.ver : m, -Infinity);
      const topL = list.reduce((m, r) => r.ver === topV ? Math.max(m, Math.round(r.lv)) : m, -Infinity);
      for (const r of list) if (r.ver === topV && Math.round(r.lv) === topL) out.add(r.name);
    }
    const topVer = all.reduce((m, r) => r.lv != null && r.ver > m ? r.ver : m, -Infinity), topLv = all.reduce((m, r) => r.ver === topVer && r.lv != null ? Math.max(m, Math.round(r.lv)) : m, -Infinity);
    for (const r of all) if (r.lv != null && r.ver === topVer && Math.round(r.lv) === topLv) out.add(r.name);
    return [...out];
  },
  isGold(t, auto) { return Gold.manual ? Gold.has(t.name) : auto.has(t.name.toLowerCase()); },
  tip(t) {
    const r = t.row, s = r?.s;
    const isG = Gold.isUnifiedGold(t.name);
    return [t.name, t.score != null ? '推理分 ' + Strength.fmtScore(t.score) + (r.fixed ? '（实测 ' + Strength.fmtScore(r.raw) + '，已按档位顺序校正）' : '') : '暂无推理分（没有完整回答的样本）',
      r?.pos || '', s?.n ? '输出中位 ' + (s.out != null ? Math.round(s.out).toLocaleString('en-US') + ' tok' : '—') + ' · 用时 ' + (s.sec != null ? s.sec.toFixed(1) + ' 秒' : '—') + ' · 花费 ' + (s.usd != null ? fmtUsd(s.usd) : '—') + ' · 样本 ' + s.n : '',
      isG ? '点一下关闭 / 取消金色（所有账号同步）' : '点一下点亮金色（所有账号同步）'].filter(Boolean).join('\n');
  },
  // compact = 底部栏弹层里的小号版本
  el({ compact = false, vf = '', cur = '', check = false } = {}) {
    Gold.loadAcct();
    let fams = this.families(); const auto = new Set(this.autoGold(fams).map(n => n.toLowerCase()));
    if (vf) fams = fams.filter(f => f.vid === vf);
    const box = h('div', { class: 'gb' + (compact ? ' compact' : '') + (check ? ' check' : '') });
    if (!fams.length) { box.append(h('p', { class: 'note' }, '还没有型号：对话 / 抽卡识别到模型后，这里会自动出现（所有账号的对话合在一起）。')); return box; }
    const curK = cur ? Strength.canon(cur).toLowerCase() : '';
    for (const f of fams) {
      box.append(h('div', { class: 'gb-row' },
        h('div', { class: 'gb-fam', title: f.fam }, VIcon.el(f.vid, compact ? 13 : 15), h('span', { class: 'gb-fn' }, cardName(f.fam) || f.fam)),
        h('div', { class: 'gb-tiers' }, ...f.tiers.map(t => {
          const gold = this.isGold(t, auto), coded = t.tier && !Strength.TIER_LV.hasOwnProperty(t.tier);
          return h('button', { class: 'gb-t' + (t.score != null ? ' has' : ' none') + (gold ? ' gold' : '') + (coded ? ' code' : '') + (t.name.toLowerCase() === curK ? ' me' : ''), 'data-lv': Math.round(t.lv ?? 3), title: this.tip(t), onclick: e => { e.stopPropagation(); Gold.toggle(t.name); } },
            check ? h('span', { class: 'gb-ck' }, gold ? '✓' : '') : null,
            h('span', { class: 'gb-tn' }, t.tier || '标准'), h('span', { class: 'gb-sc' }, t.score != null ? Strength.fmtScore(t.score) : '—'));
        }))));
    }
    return box;
  },
  // 设置里的「金色」：手动点亮开关 + 打勾选择（所有账号实时同步）
  open() {
    const body = h('div', { class: 'gbm' });
    const paint = () => {
      body.replaceChildren(
        h('div', { class: 'set', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '180px' } },
            h('input', { type: 'checkbox', checked: Gold.manual || null, onchange: e => { Gold.setMode(e.target.checked, GoldBoard.autoGold()); } }),
            h('span', {}, h('b', {}, '手动点亮（全账号统一）'), h('small', {}, '点亮、关闭或取消任意金色标记后，所有账号立即统一生效'))),
          h('button', { class: 'btn sm ghost', onclick: () => Gold.clearAll() }, '取消全部金色'),
          Gold.manual ? h('button', { class: 'btn sm ghost', onclick: () => Gold.setMode(false) }, '恢复自动') : null),
        h('div', { class: 'gbm-h dim' }, Gold.manual ? '点档位点亮 / 关闭金色（所有账号同步一致；已点亮 ' + (Prefs.goldSet || []).length + ' 个型号）' : '当前为全账号统一自动规则；点任意档位即可点亮或关闭该金色标记并同步到所有账号'),
        this.el({ check: true }));
    };
    paint(); const off = Bus.on?.('gold', () => { if (body.isConnected) paint(); });
    Gold.loadAcct(true);
    const back = modal('金色标记（全账号统一）', body, K(h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => { back.remove(); try { off?.(); } catch {} } }, '完成')), 'wide');
  },
};

// ---------- 实时榜单标签页（模型排行榜 · 推理分排行 · 价格排行榜 联通视图）----------
const PView = {
  el: null, vf: '', mode: 'power', priceSort: 'out', q: '',
  fmtTime(ts) {
    if (!ts || !Number.isFinite(ts)) return '—';
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  mount(view) {
    Strength.pull();
    clearInterval(this.iv); this.iv = setInterval(() => { if (!this.el?.isConnected) { clearInterval(this.iv); return; } if (!document.hidden) Strength.pull(); }, 15000);
    this.el = h('div', { class: 'gacha pview' });
    view.replaceChildren(this.el); this.render();
  },
  setMode(m) {
    this.mode = m;
    try {
      const titles = { rank: '模型排行榜', power: '推理分排行', price: '价格排行榜' };
      const t = Tabs.list.find(x => x.kind === 'power');
      if (t && titles[m]) { t.title = titles[m]; Tabs.save(); UI.renderTabs(); }
    } catch {}
    this.render();
  },
  render() {
    const root = this.el; if (!root || !root.isConnected) { this.el = null; return; }
    const mode = this.mode || 'power';
    const std = Prefs.strStd !== false, gs = Gacha.settings();
    const all = Strength.board(), fams = GoldBoard.families();
    const catRows = typeof BillingProbe !== 'undefined' ? (typeof BillingProbe.catalogRows === 'function' ? BillingProbe.catalogRows() : (BillingProbe.catalogRaw || [])) : [];
    const catMeta = typeof BillingProbe !== 'undefined' ? (typeof BillingProbe.catalogMeta === 'function' ? BillingProbe.catalogMeta() : BillingProbe.catalogMeta) : null;
    const rankAt = typeof Ranking !== 'undefined' ? Ranking.at : (catMeta?.at ? Date.parse(catMeta.at) : Date.now());
    const strAt = Strength.updatedAt ? Strength.updatedAt() : Date.now();
    const priceAt = (catMeta?.at ? Date.parse(catMeta.at) : 0) || rankAt || Date.now();
    const curAt = mode === 'rank' ? rankAt : mode === 'price' ? priceAt : strAt;

    const localHits = new Map();
    for (const [sid, m] of Object.entries(Models.all || {})) {
      if (!m || m.pendingConfirm) continue;
      const nm = Strength.canon(m.name || m.candidates?.[0]?.id || '').toLowerCase();
      if (!nm) continue;
      localHits.set(nm, (localHits.get(nm) || 0) + 1);
    }

    const modeTabs = h('div', { class: 'dk-tabs pv-mode-tabs' },
      ...[['rank', 'trophy', '模型排行榜'], ['power', 'bolt', '推理分排行'], ['price', 'dollar', '价格排行榜']].map(([k, ic, lbl]) =>
        h('button', { type: 'button', class: mode === k ? 'on' : '', onclick: () => this.setMode(k) }, icon(ic), h('span', {}, lbl))));

    const head = h('div', { class: 'chead pv-head-unified' },
      modeTabs,
      h('span', { class: 'pv-up-badge', title: '数据最后更新时间' }, icon('clock'), '更新时间：' + this.fmtTime(curAt)),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost pv-hb', title: '打开全客户端鹈鹕测试库：查看/对比各型号鹈鹕测试图、导入合并、导出分享', onclick: () => typeof PelicanShots !== 'undefined' && PelicanShots.table?.() }, icon('pelican'), h('span', {}, '鹈鹕测试库')),
      h('button', { class: 'btn sm ghost pv-hb', title: mode === 'power' ? '从本机已读取的 Trace 与反推记录重新收集样本' : '从官方 /leaderboard/agent 同步最新模型与价格目录', onclick: async () => {
        if (mode === 'power') {
          await Strength.pull(true); Strength.collectAll(); this.render(); toast('已重新收集推理分样本');
        } else {
          toast('正在同步官方榜单与价格…');
          await Ranking.refresh(true);
          this.render();
          toast('榜单与价格已更新');
        }
      } }, icon('refresh'), h('span', {}, mode === 'power' ? '重新收集' : '同步最新')),
      h('button', { class: 'btn sm ghost pv-hb', title: '去抽卡', onclick: () => Tabs.openGacha() }, icon('slot'), h('span', {}, '去抽卡')));

    const sections = [];
    if (mode === 'rank') {
      const rList = Ranking.list();
      const vids = [...new Set(rList.map(e => Brand.of(e.name)).filter(Boolean))];
      const filtered = rList.filter(e => {
        if (this.vf && Brand.of(e.name) !== this.vf) return false;
        if (this.q && !String(e.name + ' ' + (e.id || '') + ' ' + (e.org || '')).toLowerCase().includes(this.q.toLowerCase())) return false;
        return true;
      });
      sections.push(h('section', { class: 'gcard pv-intro' },
        h('div', { class: 'glabel' }, 'Arena Agent 官方模型排行榜',
          h('small', {}, '共 ' + rList.length + ' 款模型 · 实时关联推理分与单价 · 更新于 ' + this.fmtTime(rankAt)),
          h('span', { class: 'grow' }),
          h('input', { class: 'inp sm pv-search', type: 'search', placeholder: '搜索型号 / 厂商…', value: this.q || '', oninput: e => { this.q = e.target.value; this.render(); } })),
        h('div', { class: 'gvend pv-vend', style: { display: 'flex', marginTop: '8px' } },
          h('button', { class: 'gchip' + (!this.vf ? ' on' : ''), onclick: () => { this.vf = ''; this.render(); } }, '全部'),
          ...vids.map(v => h('button', { class: 'gchip' + (this.vf === v ? ' on' : ''), onclick: () => { this.vf = v; this.render(); } }, VIcon.el(v, 13), Brand.NAME[v] || v)))));

      const tbl = h('div', { class: 'pv-board-table' },
        h('div', { class: 'pv-btr th' },
          h('span', { class: 'c-rk' }, '排名'),
          h('span', { class: 'c-nm' }, '模型名称'),
          h('span', { class: 'c-tr' }, '思考档位'),
          h('span', { class: 'c-pr' }, '输入 / 输出单价'),
          h('span', { class: 'c-p50' }, '官方任务 P50'),
          h('span', { class: 'c-sc' }, '本机推理分'),
          h('span', { class: 'c-hit' }, '本机命中')));

      for (const e of filtered) {
        const vid = Brand.of(e.name);
        const canonK = Strength.canon(e.id || e.name).toLowerCase();
        const bRow = all.find(r => r.name.toLowerCase() === canonK || Brand.toks(r.name).join('-') === e.base.join('-'));
        const hits = localHits.get(canonK) || (bRow?.s?.nAll || 0);
        const prTxt = (e.inputPerMillion != null && e.outputPerMillion != null) ? ('$' + e.inputPerMillion + ' / $' + e.outputPerMillion) : '—';
        const p50Txt = e.p50 != null ? ('$' + Number(e.p50).toFixed(2)) : '—';
        const scVal = bRow?.score ?? null;
        tbl.append(h('div', { class: 'pv-btr' + (hits > 0 ? ' has-local' : ''), onclick: () => { this.setMode('price'); } },
          h('span', { class: 'c-rk mono' + (e.rank <= 3 ? ' top3' : '') }, '#' + e.rank),
          h('span', { class: 'c-nm' }, vid ? VIcon.el(vid, 15) : null, h('b', {}, e.name), e.org ? h('small', { class: 'dim' }, e.org) : null),
          h('span', { class: 'c-tr' }, e.tier ? h('span', { class: 'mc-tier', 'data-lv': Strength.TIER_LV[e.tier] ?? 4 }, e.tier) : h('span', { class: 'dim' }, '标准')),
          h('span', { class: 'c-pr mono', title: '每百万 Token 价格（点击查看价格排行榜）' }, prTxt),
          h('span', { class: 'c-p50 mono', title: e.samples ? ('官方统计样本 ' + e.samples.toLocaleString('en-US') + ' 次') : '' }, p50Txt, e.samples ? h('small', { class: 'dim' }, ' (' + fmtTokS(e.samples) + ')') : null),
          h('span', { class: 'c-sc mono' }, scVal != null ? h('span', { class: 'pv-sc-pill' }, Strength.fmtScore(scVal) + ' 分') : h('span', { class: 'dim' }, '—')),
          h('span', { class: 'c-hit mono' }, hits > 0 ? h('span', { class: 'pv-hit-pill' }, hits + ' 次') : h('span', { class: 'dim' }, '0'))));
      }
      sections.push(h('section', { class: 'gcard pv-list' }, tbl));
    } else if (mode === 'price') {
      const pRows = catRows.filter(r => r && (r.inputPerMillion > 0 || r.outputPerMillion > 0)).map(r => {
        const vid = Brand.of(r.label || r.id || r.org || '');
        const f = typeof Price !== 'undefined' ? Price.factor(r.id || r.label) : { k: 1, n: 0 };
        const canonK = Strength.canon(r.id || r.label).toLowerCase();
        const hits = localHits.get(canonK) || f.n || 0;
        return { ...r, vid, factor: f.k, calN: f.n, hits };
      });
      const vids = [...new Set(pRows.map(r => r.vid).filter(Boolean))];
      const filtered = pRows.filter(r => {
        if (this.vf && r.vid !== this.vf) return false;
        if (this.q && !String((r.label || '') + ' ' + (r.id || '') + ' ' + (r.org || '')).toLowerCase().includes(this.q.toLowerCase())) return false;
        return true;
      });
      const sKey = this.priceSort || 'out';
      filtered.sort((a, b) => {
        if (sKey === 'in') return (b.inputPerMillion || 0) - (a.inputPerMillion || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        if (sKey === 'p50') return (b.agentTaskCostP50 || 0) - (a.agentTaskCostP50 || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        if (sKey === 'cache') return (b.cacheReadPerMillion || 0) - (a.cacheReadPerMillion || 0) || (b.outputPerMillion || 0) - (a.outputPerMillion || 0);
        if (sKey === 'rank') return ((a.leaderboardRank > 0 ? a.leaderboardRank : 999) - (b.leaderboardRank > 0 ? b.leaderboardRank : 999));
        return (b.outputPerMillion || 0) - (a.outputPerMillion || 0) || (b.inputPerMillion || 0) - (a.inputPerMillion || 0);
      });

      sections.push(h('section', { class: 'gcard pv-intro' },
        h('div', { class: 'glabel' }, '模型价格排行榜（USD / 1M Tokens）',
          h('small', {}, '共 ' + pRows.length + ' 款计费模型 · 4 通道精确单价与任务花费分布 · 更新于 ' + this.fmtTime(priceAt)),
          h('span', { class: 'grow' }),
          h('input', { class: 'inp sm pv-search', type: 'search', placeholder: '搜索型号 / 单价…', value: this.q || '', oninput: e => { this.q = e.target.value; this.render(); } })),
        h('div', { class: 'pv-sort-row' },
          h('span', { class: 'dim' }, '排序方式：'),
          ...[['out', '输出单价 ↓'], ['in', '输入单价 ↓'], ['p50', '任务 P50 ↓'], ['cache', '缓存读取 ↓'], ['rank', '官方排名 ↑']].map(([k, l]) =>
            h('button', { type: 'button', class: 'gchip' + (sKey === k ? ' on' : ''), onclick: () => { this.priceSort = k; this.render(); } }, l))),
        h('div', { class: 'gvend pv-vend', style: { display: 'flex', marginTop: '8px' } },
          h('button', { class: 'gchip' + (!this.vf ? ' on' : ''), onclick: () => { this.vf = ''; this.render(); } }, '全部厂商'),
          ...vids.map(v => h('button', { class: 'gchip' + (this.vf === v ? ' on' : ''), onclick: () => { this.vf = v; this.render(); } }, VIcon.el(v, 13), Brand.NAME[v] || v)))));

      const tbl = h('div', { class: 'pv-board-table pv-price-table' },
        h('div', { class: 'pv-btr th' },
          h('span', { class: 'c-rk' }, '#'),
          h('span', { class: 'c-nm' }, '模型名称'),
          h('span', { class: 'c-in' }, '输入 ($/1M)'),
          h('span', { class: 'c-out' }, '输出 ($/1M)'),
          h('span', { class: 'c-cr' }, '缓读 ($/1M)'),
          h('span', { class: 'c-cw' }, '缓写 ($/1M)'),
          h('span', { class: 'c-p50' }, '任务 P25 / P50 / P95'),
          h('span', { class: 'c-hit' }, '本机校准')));

      filtered.forEach((r, idx) => {
        const p25 = r.agentTaskCostP25 != null ? '$' + Number(r.agentTaskCostP25).toFixed(2) : '—';
        const p50 = r.agentTaskCostP50 != null ? '$' + Number(r.agentTaskCostP50).toFixed(2) : '—';
        const p95 = r.agentTaskCostP95 != null ? '$' + Number(r.agentTaskCostP95).toFixed(2) : '—';
        tbl.append(h('div', { class: 'pv-btr' + (r.hits > 0 ? ' has-local' : '') },
          h('span', { class: 'c-rk mono' + (idx < 3 ? ' top3' : '') }, '#' + (idx + 1)),
          h('span', { class: 'c-nm' }, r.vid ? VIcon.el(r.vid, 15) : null, h('b', {}, r.label || r.id), r.leaderboardRank > 0 && r.leaderboardRank < 900 ? h('small', { class: 'pv-rk-tag' }, '榜 #' + r.leaderboardRank) : null),
          h('span', { class: 'c-in mono' }, r.inputPerMillion != null ? '$' + r.inputPerMillion : '—'),
          h('span', { class: 'c-out mono b' }, r.outputPerMillion != null ? '$' + r.outputPerMillion : '—'),
          h('span', { class: 'c-cr mono' }, r.cacheReadPerMillion != null ? '$' + r.cacheReadPerMillion : '—'),
          h('span', { class: 'c-cw mono' }, r.cacheWritePerMillion != null ? '$' + r.cacheWritePerMillion : '—'),
          h('span', { class: 'c-p50 mono' }, p25 + ' / ', h('b', {}, p50), ' / ' + p95),
          h('span', { class: 'c-hit mono' }, r.calN > 0 ? h('span', { class: 'pv-hit-pill', title: '从 ' + r.calN + ' 个本机对话校准' }, '×' + r.factor.toFixed(2)) : r.hits > 0 ? h('span', { class: 'pv-hit-pill' }, r.hits + ' 次') : h('span', { class: 'dim' }, '官方基准'))));
      });
      sections.push(h('section', { class: 'gcard pv-list' }, tbl));
    } else {
      const vids = [...new Set(fams.map(r => r.vid).filter(Boolean))];
      const scoredRows = (this.vf ? all.filter(r => r.vid === this.vf) : all).filter(r => r.score != null).slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.ver - a.ver);
      const intro = h('section', { class: 'gcard pv-intro' },
        h('div', { class: 'glabel' }, '推理分排行（0–100 思考深度评分）',
          h('small', {}, fams.length + ' 个型号族 · ' + all.filter(r => r.score != null).length + ' 个已测推理分 · 更新于 ' + this.fmtTime(strAt)),
          tipI('推理分（0–100）综合实测思考时长、隐藏思考 Token 反推深度、多步工具推理与型号固有思考档位计算，越接近 100 分代表单轮思考深度越强。\n\n同型号里 low / medium / high / xhigh / max 按保序回归校准；点任意档位可切换金色置顶。')),
        h('div', { class: 'pv-ctl' + (this.fOpen ? ' open' : '') },
          h('button', { class: 'pv-fsum', onclick: e => { this.fOpen = !this.fOpen; e.currentTarget.parentNode.classList.toggle('open', this.fOpen); } },
            icon('sort'), h('span', {}, '筛选'), h('span', { class: 'pv-fcur' }, this.vf ? VIcon.el(this.vf, 13) : null, this.vf ? (Brand.NAME[this.vf] || this.vf) : '全部厂商', std ? ' · 标准样本优先' : ''), h('span', { class: 'grow' }), icon('chev')),
          h('label', { class: 'gp-chk' }, h('input', { type: 'checkbox', checked: std || null, onchange: e => { Prefs.strStd = e.target.checked; savePrefs(); Strength.refresh(); this.render(); UI.renderListSoon(); } }), '优先用标准样本（同一个问题）', tipI('打开后，有标准样本的型号优先用标准样本算推理分；其余结合本机指纹与费用反推深度评分。')),
          h('div', { class: 'gvend pv-vend' }, h('button', { class: 'gchip' + (!this.vf ? ' on' : ''), onclick: () => { this.vf = ''; this.fOpen = false; this.render(); } }, '全部'),
            ...vids.map(v => h('button', { class: 'gchip' + (this.vf === v ? ' on' : ''), onclick: () => { this.vf = v; this.fOpen = false; this.render(); } }, VIcon.el(v, 13), Brand.NAME[v] || v)))));
      const list = h('section', { class: 'gcard pv-list' },
        h('div', { class: 'gb-bar' }, h('span', { class: 'dim pv-cnt' }, fams.length + ' 个型号 · ' + all.filter(r => r.score != null).length + ' 个有推理分 · 更新于 ' + this.fmtTime(strAt)),
          tipI((Gold.manual ? '手动点亮：点档位点亮 / 熄灭金色（金色 = 侧栏置顶）' : '自动金色：最高版本里最强的一档；点任意档位即切换为手动点亮') + '\n推理分 = 标准题实测 + 指纹 + 费用反推综合聚合。'), h('span', { class: 'grow' }),
          h('button', { class: 'link sm nowrap', onclick: () => GoldBoard.open() }, Gold.manual ? '管理点亮' : '手动点亮')),
        GoldBoard.el({ vf: this.vf }));
      sections.push(intro, list);
      if (scoredRows.length) {
        const rankTbl = h('div', { class: 'pv-board-table pv-power-table' },
          h('div', { class: 'pv-btr th' },
            h('span', { class: 'c-rk' }, '排名'),
            h('span', { class: 'c-nm' }, '型号'),
            h('span', { class: 'c-tr' }, '档位'),
            h('span', { class: 'c-sc' }, '推理分 (0–100)'),
            h('span', { class: 'c-pr' }, '输出中位 / 花费'),
            h('span', { class: 'c-hit' }, '样本来源')));
        scoredRows.forEach((r, idx) => {
          const pct = Math.max(4, Math.min(100, Math.round(r.score || 0)));
          const outTxt = r.s?.out != null ? Math.round(r.s.out).toLocaleString('en-US') + ' tok' : '—';
          const usdTxt = r.usd != null ? fmtUsd(r.usd) : '—';
          rankTbl.append(h('div', { class: 'pv-btr' },
            h('span', { class: 'c-rk mono' + (idx < 3 ? ' top3' : '') }, '#' + (idx + 1)),
            h('span', { class: 'c-nm' }, r.vid ? VIcon.el(r.vid, 15) : null, h('b', {}, cardName(r.name) || r.name)),
            h('span', { class: 'c-tr' }, r.tier ? h('span', { class: 'mc-tier', 'data-lv': Math.round(r.lv ?? 3) }, r.tier) : h('span', { class: 'dim' }, '标准')),
            h('span', { class: 'c-sc' },
              h('div', { class: 'pv-sc-bar-wrap' },
                h('div', { class: 'pv-sc-bar' }, h('i', { style: { width: pct + '%' } })),
                h('b', { class: 'mono' }, Strength.fmtScore(r.score) + ' 分'))),
            h('span', { class: 'c-pr mono' }, outTxt + ' · ' + usdTxt),
            h('span', { class: 'c-hit mono' }, h('span', { class: 'pv-hit-pill' }, (r.s?.fromModels ? '反推/指纹 ' : '标准实测 ') + (r.s?.n || 1) + ' 次'))));
        });
        sections.push(h('section', { class: 'gcard pv-list' },
          h('div', { class: 'gb-bar' }, h('b', {}, '单型号推理深度明细排行'), h('span', { class: 'dim' }, '按 0–100 推理分从高到低排列')),
          rankTbl));
      }
      const foot = all.length ? h('div', { class: 'pv-foot' }, h('button', { class: 'btn sm ghost', onclick: async () => { if (await Dialog.confirm({ title: '清空推理分排行', text: '清空所有账号累计的全部样本？', ok: '清空', danger: true })) Strength.clear(); } }, '清空全部样本')) : null;
      if (foot) sections.push(foot);
    }

    root.dataset.ks = (this.mode || 'power') + '|' + (this.vf || '');
    const old = root.querySelector(':scope > .scroller'), top = old ? old.scrollTop : 0;
    const sc = h('div', { class: 'scroller' }, h('div', { class: 'gwrap' }, ...K(...sections)));
    root.replaceChildren(...K(head, sc)); if (top) sc.scrollTop = top;
  },
};
Bus.on('gold', () => { if (PView.el) { clearTimeout(PView.t); PView.t = setTimeout(() => PView.render(), 60); } });
Bus.on('strength', () => { if (PView.el) { clearTimeout(PView.t); PView.t = setTimeout(() => PView.render(), 150); } });
Bus.on('rank', () => { if (PView.el) { clearTimeout(PView.t); PView.t = setTimeout(() => PView.render(), 100); } });
Bus.on('billing-probe', () => { if (PView.el) { clearTimeout(PView.t); PView.t = setTimeout(() => PView.render(), 150); } });

// ---------- 抽卡目标的更多选项：目标强度 + 测过的型号（两个面板共用）----------
const StrPick = {
  STR: [['', '不限强度', '只看厂商 / 关键词'], ['strong', '高于 medium', 'high / xhigh / max，或实测推理分高于 medium 的代号'], ['top', 'xhigh 及以上', '只要最强的一档：xhigh / max，或实测接近 xhigh 以上的代号']],
  seg(cls, after) {
    const s = Gacha.settings(), busy = Gacha.busy();
    return h('div', { class: cls }, ...this.STR.map(([k, l, tip]) => h('button', { class: (s.minStr || '') === k ? 'on' : '', disabled: busy || null, title: tip, onclick: () => { Gacha.save({ minStr: k }); after?.(); } }, l)));
  },
  // 推理分排行里测过的型号（当前厂商优先、新一代在前），点一下设为目标关键词
  models(max = 8) {
    const s = Gacha.settings(), seen = new Map();
    for (const r of Strength.board()) { const fam = Strength.canon(r.name).slice(0, r.tier ? -(r.tier.length + 1) : undefined); if (fam && !seen.has(fam.toLowerCase())) seen.set(fam.toLowerCase(), { fam, vid: r.vid, ver: Brand.version(fam) ?? -1 }); }
    let arr = [...seen.values()];
    const v = Gacha.vendorBy(s.vendor); if (v) arr = arr.filter(x => x.vid === v.id);
    return arr.sort((a, b) => (b.ver - a.ver) || a.fam.localeCompare(b.fam)).slice(0, max);
  },
  chips(cls, after) {
    const s = Gacha.settings(), busy = Gacha.busy(), arr = this.models();
    if (!arr.length) return null;
    return h('div', { class: cls }, ...arr.map(x => h('button', { class: s.vendor === 'custom' && s.customKeyword.toLowerCase() === x.fam.toLowerCase() ? 'on' : '', disabled: busy || null, title: '只抽 ' + x.fam, onclick: () => { Gacha.setVendor('custom', x.fam); after?.(); } }, x.vid ? VIcon.el(x.vid, 12) : null, cardName(x.fam))));
  },
};
