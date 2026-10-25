// 多指纹库：所有启用的库都跑一遍，取最强匹配（clear > close > weak，再比相对概率），并记下来源库。
// 库只是数据（JSON），从不执行远端脚本。内置：WhatsMyLLM（含个人库）+ lm.ikale.io；可用 URL / 文件导入自定义库。
const FPLibs = (() => {
  const KEY = 'fingerprint:libs:v1', DATA = 'fingerprint:libdata:';
  const IKALE_URL = 'https://raw.githubusercontent.com/Ikaleio/lm-detector/main/data/unified_bank.json';
  const BUILTIN = [
    { id: 'whatsmyllm', name: 'WhatsMyLLM', site: 'https://whatsmyllm.com/', builtin: true, note: '默认库（含个人库样本）' },
    { id: 'ikale', name: 'lm.ikale.io', site: 'https://lm.ikale.io/', url: IKALE_URL, builtin: true, note: 'Ikaleio/lm-detector · MIT' },
  ];
  const RANK = { clear: 3, close: 2, weak: 1 };
  const MAX_STORE = 1800000;
  const banks = new Map();   // id -> validated bank (内存)
  let state = Store.get(KEY, null);
  if (!state || !Array.isArray(state.libs)) state = { libs: [] };
  const save = () => Store.set(KEY, state);
  const metaOf = id => state.libs.find(x => x.id === id);
  function list() {
    const out = BUILTIN.map(b => { const m = metaOf(b.id) || {}; return { ...b, enabled: m.enabled !== false, updatedAt: m.updatedAt || null, version: m.version || null, models: m.models || null }; });
    for (const m of state.libs) if (!BUILTIN.some(b => b.id === m.id)) out.push({ ...m, enabled: m.enabled !== false });
    return out;
  }
  function setMeta(id, patch) {
    let m = metaOf(id); if (!m) { m = { id }; state.libs.push(m); }
    Object.assign(m, patch); save(); Bus.emit?.('fplibs');
  }
  const round = x => typeof x === 'number' && !Number.isInteger(x) ? +x.toPrecision(5) : Array.isArray(x) ? x.map(round) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)])) : x;
  // 精简：去掉逐条频率参考（只用于离线评估，识别不需要），数值保留 5 位有效数字 → 体积缩到原来的约 4%
  function compact(bank) {
    const keep = ['id', 'display_name', 'family', 'family_name', 'response_count', 'valid_number_count', 'counts', 'personal_only'];
    const out = {};
    for (const k of ['schema', 'built_at', 'method', 'recommended_queries', 'minimum_valid_numbers', 'providers', 'calibration', 'reference_sha256', 'source_scope']) if (bank[k] !== undefined) out[k] = bank[k];
    out.models = (bank.models || []).map(m => Object.fromEntries(keep.filter(k => m[k] !== undefined).map(k => [k, m[k]])));
    out.robust = round(bank.robust);
    return out;
  }
  function parseBank(text) {
    let bank; try { bank = JSON.parse(text); } catch { throw Error('不是有效的 JSON'); }
    bank = compact(bank);
    ProbeLib.validateBank(bank);
    return bank;
  }
  async function fetchText(url) {
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw Error('只支持 https 地址');
    if (typeof Host !== 'undefined' && Host.fetchText) {
      const r = await Host.fetchText(url, { long: true });
      if (r?.error || typeof r?.text !== 'string') throw Error(r?.error || '下载失败');
      return r.text;
    }
    const r = await rawFetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw Error('HTTP ' + r.status);
    return r.text();
  }
  function store(id, bank) {
    const text = JSON.stringify(bank);
    if (text.length > MAX_STORE) throw Error('精简后仍有 ' + Math.round(text.length / 1024) + ' KB，超过本地上限');
    if (!Store.set(DATA + id, text)) throw Error('本地存储空间不足');
    banks.set(id, bank);
  }
  async function bankOf(id, loaded) {
    if (id === 'whatsmyllm') return loaded?.bank || (await ProbeBankCache.load()).bank;
    if (banks.has(id)) return banks.get(id);
    const text = Store.get(DATA + id, null);
    if (typeof text === 'string') { try { const b = JSON.parse(text); ProbeLib.validateBank(b); banks.set(id, b); return b; } catch {} }
    if (id === 'ikale' && typeof IkaleBank !== 'undefined') { ProbeLib.validateBank(IkaleBank); banks.set(id, IkaleBank); return IkaleBank; }
    return null;
  }
  async function addUrl(url, name) {
    url = String(url || '').trim();
    const bank = parseBank(await fetchText(url));
    const id = 'u' + Date.now().toString(36);
    store(id, bank);
    setMeta(id, { name: String(name || '').trim() || new URL(url).hostname, url, enabled: true, updatedAt: Date.now(), models: bank.models.length, version: bank.built_at || null });
    return list().find(x => x.id === id);
  }
  async function addText(text, name) {
    const bank = parseBank(String(text || ''));
    const id = 'f' + Date.now().toString(36);
    store(id, bank);
    setMeta(id, { name: String(name || '').replace(/\.json$/i, '').trim() || '自定义库', enabled: true, updatedAt: Date.now(), models: bank.models.length, version: bank.built_at || null });
    return list().find(x => x.id === id);
  }
  async function update(id) {
    if (id === 'whatsmyllm') { await ProbeBankCache.refresh(true); setMeta(id, { updatedAt: Date.now() }); return; }
    const lib = list().find(x => x.id === id); if (!lib?.url) throw Error('该库没有更新地址');
    const bank = parseBank(await fetchText(lib.url));
    store(id, bank);
    setMeta(id, { updatedAt: Date.now(), models: bank.models.length, version: bank.built_at || null });
  }
  function toggle(id, on) { setMeta(id, { enabled: !!on }); }
  function remove(id) {
    if (BUILTIN.some(b => b.id === id)) throw Error('内置库只能停用');
    state.libs = state.libs.filter(x => x.id !== id); save(); Store.del(DATA + id); banks.delete(id); Bus.emit?.('fplibs');
  }
  const strength = r => r ? (RANK[r.status] || 0) * 10 + (Number(r.signals?.relative_probability) || 0) : -1;
  // 所有启用的库都识别一遍，取最强的；WhatsMyLLM 始终参与（个人库在它里面），保证结果至少和单库时一样
  /* 开源 / 开放权重的模型会输出思考内容；闭源模型（Claude / GPT / Gemini）的思考不会作为内容返回。
     所以：各指纹库对同一份回复给出不一致的结果时，如果回复里没有看到任何思考内容，就不接受开源模型的候选（qwen / deepseek / glm / kimi …），按闭源的候选定。
     现在由 gate() 在每个库里先排除（见下）；不知道有没有思考（旧数据没有消息内容）时不动。 */
  const OPEN_RE = /(^|[^a-z])(qwen|qwq|deepseek|glm|kimi|minimax|llama|mistral|mixtral|gemma|mimo|longcat|gpt-oss|nemotron|olmo|phi)(?![a-z])/i;
  const isOpen = c => OPEN_RE.test(String(c?.id || '')) || OPEN_RE.test(String(c?.family || ''));
  /* 回复里没有可见思考 → 排除会输出思考文字的开源系候选（qwen / deepseek / glm / kimi …）。
     每个库都做（以前只在各库不一致时才筛，单库 / 另一库「较弱」时开源候选照样胜出）。
     剩下的候选在本库内重新归一化、按原规则重算 明确 / 接近 / 较弱；换掉了第一名时最多算「接近」，继续补测。
     有可见思考时不反向排除闭源：Claude / Gemini 也可能返回思考摘要文字。 */
  function gate(r, thought) {
    if (thought !== false || !r?.candidates?.length) return r;
    const cs = r.candidates, keep = cs.filter(c => !isOpen(c));
    if (keep.length === cs.length) return r;
    const gone = cs.filter(isOpen).map(c => c.id);
    if (!keep.length) { r.excluded = gone; r.status = 'weak'; r.reason = 'thinking_excluded_all'; r.signals = { ...r.signals, relative_probability: 0 }; return r; }
    const tot = keep.reduce((a, c) => a + (Number(c.probability) || 0), 0) || 1;
    const nc = keep.map(c => ({ ...c, probability: (Number(c.probability) || 0) / tot })), top = nc[0];
    const T = ProbeLib.THRESHOLDS || { fit: 0.25, separation: 0.08, family: 0.9 }, hasFit = Number.isFinite(top.fit);
    const alt = nc.length > 1 ? Math.max(...nc.slice(1).map(c => Number.isFinite(c.fit) ? c.fit : 0)) : 0;
    const fam = nc.filter(c => c.family === top.family).reduce((a, c) => a + c.probability, 0);
    const sig = { ...r.signals, ...(hasFit ? { fit: top.fit, separation: top.fit - alt } : {}), family_probability: fam, relative_probability: top.probability };
    const moved = !!r.nearest && isOpen(r.nearest);
    let st = !hasFit ? r.status : top.fit < T.fit ? 'weak' : sig.separation >= T.separation ? 'clear' : fam >= T.family ? 'close' : 'weak';
    if (moved && st === 'clear') st = 'close';
    Object.assign(r, { candidates: nc, nearest: top, signals: sig, status: st, excluded: gone, thinkingGate: 'none' });
    if (moved) r.reason = 'thinking_excluded';
    return r;
  }
  /* msgs = 这几条探针回复消息；有思考内容 true，都看过了且没有 false，没有消息内容可看 undefined */
  function thought(msgs) {
    const list = (msgs || []).filter(m => m && Array.isArray(m.parts)); if (!list.length) return undefined;
    return list.some(m => m.parts.some(p => p?.type === 'reasoning' && String(p.text || '').trim()));
  }
  async function inspect(outputs, loaded, ctx = {}) {
    const base = ProbeLib.inspectAndIdentify(outputs, loaded.bank);
    if (!base.result) return base;
    const libs = list().filter(l => l.enabled && l.id !== 'whatsmyllm');
    const wName = BUILTIN[0].name;
    base.result.library = wName;
    const cands = res => (res.candidates || []).slice(0, 8).map(c => ({ id: c.id, probability: Number(c.probability) || 0 }));   /* 每个库自己的候选排名：指纹溯源卡片可以切换着看 */
    const ran = [{ lib: wName, res: base }];
    for (const l of libs) {
      try {
        const bank = await bankOf(l.id, loaded); if (!bank) continue;
        const r = ProbeLib.inspectAndIdentify(outputs, bank);
        if (!r.result) continue;
        r.result.library = l.name; ran.push({ lib: l.name, res: r });
      } catch {}
    }
    /* 没有可见思考：所有库的候选里只要还有闭源的，就在每个库里排除开源系；全是开源候选时没得选，不筛 */
    if (ctx.thought === false && ran.some(x => (x.res.result.candidates || []).some(c => !isOpen(c)))) for (const x of ran) gate(x.res.result, false);
    const all = ran.map(x => ({ lib: x.lib, id: x.res.result.nearest?.id, status: x.res.result.status, p: x.res.result.signals?.relative_probability ?? null, cands: cands(x.res.result) }));
    let best = base; for (const x of ran) if (strength(x.res.result) > strength(best.result)) best = x.res;
    const exAll = [...new Set(ran.flatMap(x => x.res.result.excluded || []))]; if (exAll.length) { best.result.excluded = exAll; best.result.thinkingGate = 'none'; }   /* 溯源卡片提示「已排除 …」 */
    // 各库各自给出「库内最近的型号」，相对概率只在本库内有意义，直接取最大会在噪声下来回变（这次 A 库的 x、下次 B 库的 y）。
    // 有库互相不一致时：把各库对每个型号的概率取平均（没有这个型号的库算 0），平均后最大的型号胜出；
    // 并降为「接近」（名字带 ?），不算明确结果，也就不会提前结束，继续补测。
    const key = id => String(id || '').toLowerCase().replace(/(?<![\d.])(?<!\d-)([1-9]\d?)-(0|[1-9]\d?)(?=$|[^a-z\d])/g, '$1.$2');   // claude-opus-5-5 与 claude-opus-5.5 是同一个型号
    const voters = ran.filter(x => x.res.result && x.res.result.status !== 'weak' && x.res.result.nearest?.id);
    if (voters.length > 1 && new Set(voters.map(x => key(x.res.result.nearest.id))).size > 1) {
      const sum = new Map(), holder = new Map(), noThink = ctx.thought === false, dropped = new Map();
      const pool = voters.flatMap(v => v.res.result.candidates || []), keepOpen = noThink && !pool.some(c => !isOpen(c));   /* 全是开源候选时没得选，不筛 */
      for (const v of voters) for (const c of v.res.result.candidates || []) {
        const ck = key(c.id);
        if (noThink && !keepOpen && isOpen(c)) { dropped.set(ck, c.id); continue; }
        sum.set(ck, (sum.get(ck) || 0) + (Number(c.probability) || 0));
        const h = holder.get(ck); if (!h || (c.probability || 0) > (h.c.probability || 0)) holder.set(ck, { v, c });
      }
      let top = null; for (const [id, p] of sum) if (!top || p / voters.length > top.p) top = { id, p: p / voters.length };   /* 两边都按平均值比（以前拿总和跟平均比，排在后面的候选会白占便宜） */
      const h = top && holder.get(top.id);
      if (h) {
        best = h.v.res; const r = best.result;
        r.nearest = h.c; r.signals = { ...r.signals, relative_probability: top.p };
        r.candidates = [...sum].map(([id, p]) => ({ ...holder.get(id).c, probability: p / voters.length })).sort((x, y) => y.probability - x.probability);   /* 候选列表 = 各库平均后的排名（指纹溯源直接用），被排除的开源模型不在里面 */
        if (dropped.size || exAll.length) { r.excluded = [...new Set([...exAll, ...dropped.values()])]; r.thinkingGate = 'none'; }
        if (r.status === 'clear') { r.status = 'close'; r.reason = 'library_disagree'; }
        r.disagree = voters.map(v => ({ lib: v.lib, id: v.res.result.nearest.id, status: v.res.result.status, p: v.res.result.signals?.relative_probability ?? null }));
      }
    }
    best.result.libraries = all;
    return best;
  }
  /* 单个库对已有回复的排名（指纹溯源切换库时用；只读计算，不写结果、不发消息） */
  async function rank(id, outputs, loaded, ctx = {}) {
    const l = list().find(x => x.id === id); if (!l) throw Error('指纹库不存在');
    const bank = await bankOf(id, loaded || await ProbeBankCache.load()); if (!bank) throw Error(l.name + ' 还没有下载数据');
    const r0 = ProbeLib.inspectAndIdentify(outputs, bank).result, r = r0 && (r0.candidates || []).some(c => !isOpen(c)) ? gate(r0, ctx.thought) : r0; if (!r) throw Error('回复没有通过指纹门控');
    return { lib: l.name, id: r.nearest?.id, status: r.status, p: r.signals?.relative_probability ?? null, cands: (r.candidates || []).slice(0, 8).map(c => ({ id: c.id, probability: Number(c.probability) || 0 })) };
  }
  return { rank, list, inspect, thought, isOpen, gate, addUrl, addText, update, toggle, remove, bankOf, compact, parseBank, IKALE_URL };
})();
try {
  if (typeof globalThis !== 'undefined' && !globalThis.__AMC_FP_ENGINE__) {
    globalThis.__AMC_FP_ENGINE__ = {
      version: 6,
      inputSchema: 'integer-list/v1',
      source: 'Ikaleio/lm-detector (MIT)',
      parseNumbers: text => (typeof ProbeLib !== 'undefined' && typeof ProbeLib.numbers === 'function') ? ProbeLib.numbers(String(text || '')) : [],
      loadBank: async () => ({ ok: typeof IkaleBank !== 'undefined', models: typeof IkaleBank !== 'undefined' && Array.isArray(IkaleBank.models) ? IkaleBank.models.length : 0 }),
      getBank: () => (typeof IkaleBank !== 'undefined' ? IkaleBank : null),
      identify: async (texts, bank) => {
        const b = bank || (typeof IkaleBank !== 'undefined' ? IkaleBank : null);
        if (!b || typeof ProbeLib === 'undefined' || typeof ProbeLib.inspectAndIdentify !== 'function') return { ok: false, candidates: [] };
        const arr = (Array.isArray(texts) ? texts : [texts]).filter(t => typeof t === 'string' && t.trim());
        const outputs = arr.map((t, i) => ({
          text: t,
          challenge_id: 'probe-' + (i + 1),
          expected_count: Math.max(80, Math.min(350, (ProbeLib.numbers?.(t) || []).length || 180)),
        }));
        const r = ProbeLib.inspectAndIdentify(outputs, b)?.result;
        if (!r || !Array.isArray(r.candidates) || !r.candidates.length) return { ok: false, candidates: [] };
        return {
          ok: true,
          verdict: (r.status === 'clear' || r.status === 'close') ? 'match' : 'insufficient',
          confidence: r.status === 'clear' ? 'high' : (r.status === 'close' ? 'medium' : 'low'),
          absoluteMatch: Number(r.signals?.fit) || 0,
          probability: Number(r.signals?.relative_probability) || 0,
          candidates: r.candidates.map(c => ({ id: c.id, score: Number(c.fit) || 0, prob: Number(c.probability) || 0 })),
        };
      },
    };
  }
} catch {}
