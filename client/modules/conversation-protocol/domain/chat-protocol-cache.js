const Trigger = (() => {
  let gate = 0, useProxy = Store.get('td:proxy', 0) > now();
  async function get(path, tok, signal) {
    for (let i = 0; ; i++) {
      const w = gate - now(); if (w > 0) await NetPolicy.deadline(() => sleep(w), { timeout: w + 1000, signal }); gate = Math.max(now(), gate) + 120;
      const bases = useProxy ? [ORIGIN + '/ai-proxy', 'https://api.trigger.dev'] : [ORIGIN + '/ai-proxy', 'https://api.trigger.dev'];
      let res, lastErr;
      for (const b of bases) {
        try { res = await rawFetch(b + path, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal }); break; }
        catch (e) { if (signal?.aborted) throw e; lastErr = e; if (b.startsWith('https://api.trigger.dev')) { useProxy = true; Store.set('td:proxy', now() + 1800000); } }
      }
      if (!res) throw lastErr || new Error('网络错误');
      if (res.status === 429 && i < 4) { gate = now() + Math.max(30000, NetPolicy.retryAfter(res.headers?.get('retry-after')), Math.min(8000, 1500 * 2 ** i)); continue; }
      if (!res.ok) throw new HttpError(res.status, '', res);
      return res.json();
    }
  }
  const STREAM = /^ai\.streamText(\.doStream)?$/, USAGE = /^(token\.usage\.recorded|compaction\.context_usage)$/;
  const valid = n => typeof n === 'string' && /^[A-Za-z0-9][\w.\/:@+-]{1,80}$/.test(n.trim());
  const base = n => String(n || '').toLowerCase().replace(/-\d{4}-?\d{2}-?\d{2}$/, '').replace(/-(preview|latest|exp)$/, '');
  const apiOf = x => { const md = x?.p?.ai?.telemetry?.metadata || {}; const n = md.apiModelName || x?.p?.ai?.model?.id || x?.p?.gen_ai?.request?.model || null; return valid(n) ? n.trim() : null; };
  const respOf = x => { const r = x?.p?.ai?.response?.model || x?.p?.gen_ai?.response?.model || x?.p?.['ai.response.model'] || null; return valid(r) ? r.trim() : null; };
  // 型号系列：claude-opus-5.5-max-vertex / claude-opus-5-5 → claude-opus-5-5（去掉档位和平台后缀，比较是不是同一个模型）
  const fam = (...ns) => { for (const n of ns) { if (!n) continue; try { const f = Strength.parts(n).family; if (f) return f.replace(/^models\//, ''); } catch {} return base(n); } return ''; };
  const outTok = x => { const u = x?.p?.ai?.usage || {}, g = x?.p?.gen_ai?.usage || {}; return +(u.completionTokens ?? u.outputTokens ?? g.output_tokens ?? g.completion_tokens ?? 0) || 0; };
  function pickMain(ok, internal) {
    if (ok.length <= 1) return ok[0] || null;
    if (internal) { const f = fam(internal), hit = ok.filter(x => fam(apiOf(x)) === f || fam(respOf(x)) === f); if (hit.length) return hit.at(-1); }
    const g = new Map(); for (const x of ok) { const k = apiOf(x) || '?'; const v = g.get(k) || { n: 0, out: 0, last: x }; v.n++; v.out += outTok(x); v.last = x; g.set(k, v); }
    return [...g.values()].sort((a, b) => b.n - a.n || b.out - a.out)[0].last;
  }
  // 返回 { name, internal, request, provider, tier, routed }
  async function identify(runTok, signal, maxMs = 45000, onL1) {
    const runId = /read:runs:(run_\w+)/.exec(JSON.stringify(jwt(runTok)?.scopes || ''))?.[1];
    if (!runId) throw new Error('运行令牌无效');
    const det = new Map(), until = now() + maxMs; let l1 = null, l1At = 0, useAt = 0;
    while (now() < until) {
      if (signal?.aborted) throw new Error('已取消');
      let ev = []; try { ev = (await get('/api/v1/runs/' + runId + '/events', runTok, signal)).events || []; } catch (e) { if (e.status === 401 || e.status === 403) throw new Error('运行令牌已过期'); }
      const want = ev.filter(e => e?.spanId && !det.has(e.spanId) && (STREAM.test(e.message) || USAGE.test(e.message)));
      await Promise.all(want.slice(0, 4).map(async e => { try { const d = await get('/api/v1/runs/' + runId + '/spans/' + e.spanId, runTok, signal); det.set(e.spanId, { e, p: d?.properties || {}, err: !!(e.isError || d?.isError) }); } catch {} }));
      const all = [...det.values()], streams = all.filter(x => STREAM.test(x.e.message)).sort((a, b) => String(a.e.startTime).localeCompare(String(b.e.startTime)));
      const ok = streams.filter(x => !x.err);
      const use = k => all.find(x => x.e.message === k && valid(x.p?.modelName))?.p.modelName || null;
      const served = use('token.usage.recorded'), comp = use('compaction.context_usage');
      // 一轮里可能夹着 Brana 自己的辅助调用（例如 models/barium-bb-v2 这类内部模型），它常常排在最后：
      // 不再简单取最后一次调用，而是取「回答模型」——和用量记录里的内部名称同一系列的；没有用量记录时取调用次数最多、输出最多的那个
      const s = pickMain(ok, served || comp);
      const names = new Set(ok.map(apiOf).filter(Boolean));
      const routed = streams.some(x => x.err) || (names.size > 1 && !(served && s && fam(apiOf(s), respOf(s)) === fam(served)));
      if (s) { const md = s.p?.ai?.telemetry?.metadata || {}, apiName = md.apiModelName || s.p?.ai?.model?.id || s.p?.gen_ai?.request?.model || null; if (valid(apiName) && (!l1 || l1.api !== apiName)) { l1 = { api: apiName, provider: md.modelProvider || s.p?.ai?.model?.provider || '', adapter: s.p?.ai?.model?.provider || '' }; l1At ||= now(); try { onL1?.(apiName); } catch {} } }
      if (comp || served) useAt ||= now();
      let internal = served;
      if (!internal && comp && l1 && !routed && base(comp).startsWith(base(l1.api))) internal = comp;
      if (!internal && comp && now() - useAt > 6000) internal = comp;
      // 响应型号（ai.response.model）：代号模型（spirit / golem…）只有靠它才知道厂商和型号
      if (l1 && s) { const r = respOf(s) || ok.filter(x => apiOf(x) === l1.api).map(respOf).filter(Boolean).at(-1); if (r) l1.response = r; }
      if (internal) {
        const nm = Strength.compose({ request: l1?.api, response: l1?.response, internal });
        if (Brand.of(nm) || now() - useAt > 15000) return pack(internal, l1, routed, null);
        if (s && !respOf(s)) det.delete(s.e.spanId);   // 流还没结束，稍后重读这条 span 拿响应型号
      }
      if (l1 && now() - l1At > 20000) return pack(null, l1, routed, null);
      await sleep(500);
    }
    if (l1) return pack(null, l1, false);
    throw new Error('记录里没有模型信息');
  }
  function pack(internal, l1, routed, usd) {
    try { const head = n => String(n || '').replace(/^models\//i, '').split(/[-_]/)[0].toLowerCase(); for (const n of [l1?.response, l1?.api, internal && head(internal) === head(l1?.api) ? internal : null]) if (n) Brand.learn(n, l1?.provider, l1?.adapter); } catch {}
    const name = Strength.compose({ request: l1?.api, response: l1?.response, internal }) || (internal || l1?.api || '').trim();
    const p = Strength.parts(name), tier = p.tier || null;
    return { name, internal: internal || null, request: l1?.api || null, response: l1?.response || null, provider: l1?.provider || '', tier, routed: !!routed, partial: !internal, usd: usd || null };
  }
  return { identify, get, pickMain, apiOf };
})();

// ---------- 对话会话 ----------
// 从任意文本里找「本轮运行令牌」：JWT 且 scopes 里有 read:runs:run_…（记录头 / 记录内容 / 旧对话回放都用它）
function runTokIn(txt) {
  let best = null, bestExp = 0;
  for (const m of String(txt || '').matchAll(/eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g)) { const p = jwt(m[0]); if (p && /read:runs:run_/.test(JSON.stringify(p.scopes || '')) && (p.exp || 0) >= bestExp) { best = m[0]; bestExp = p.exp || 0; } }
  return best;
}
const ProtocolSchema = (() => {
  const DEF = { ver: 1, outTpl: '/ai-proxy/realtime/v1/sessions/{sid}/out', inTpl: '/ai-proxy/realtime/v1/sessions/{sid}/in/append', tokPath: '/api/chat/trigger-token', cxSalt: 48664, updatedAt: 0 };
  let cur = Object.assign({}, DEF, Store.get('proto:schema', {}) || {}), probing = null;
  const save = () => { try { Store.set('proto:schema', cur); } catch {} };
  const outUrl = sid => ORIGIN + String(cur.outTpl || DEF.outTpl).replace('{sid}', encodeURIComponent(sid));
  const inUrl = sid => ORIGIN + String(cur.inTpl || DEF.inTpl).replace('{sid}', encodeURIComponent(sid));
  const fnv16 = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; } return (h ^ (h >>> 16)) & 65535; };
  function learnFromScript(txt) {
    if (!txt || typeof txt !== 'string') return false;
    let ch = false;
    const mOut = /\/ai-proxy\/realtime\/v\d+\/sessions\/(?:\$\{[^}]+\}|[a-zA-Z0-9_-]+)\/out/.exec(txt);
    if (mOut) { const tpl = mOut[0].replace(/\/sessions\/[^/]+\/out/, '/sessions/{sid}/out'); if (tpl && tpl !== cur.outTpl) { cur.outTpl = tpl; ch = true; } }
    const mIn = /\/ai-proxy\/realtime\/v\d+\/sessions\/(?:\$\{[^}]+\}|[a-zA-Z0-9_-]+)\/in\/[a-z-]+/.exec(txt);
    if (mIn) { const tpl = mIn[0].replace(/\/sessions\/[^/]+\/in\//, '/sessions/{sid}/in/'); if (tpl && tpl !== cur.inTpl) { cur.inTpl = tpl; ch = true; } }
    const idxCx = txt.indexOf('packClientInteraction');
    if (idxCx >= 0) {
      const win = txt.slice(Math.max(0, idxCx - 7500), idxCx + 600);
      const mNum = /\bsalt\s*=\s*(\d{4,5})\b/.exec(win);
      const hexList = [...win.matchAll(/"([0-9a-f]{40})"/g)].map(m => m[1]);
      const nextSalt = mNum ? (+mNum[1] & 65535) : hexList.length ? fnv16(hexList[hexList.length - 1]) : 0;
      if (nextSalt > 0 && nextSalt !== cur.cxSalt) { cur.cxSalt = nextSalt; ch = true; }
    }
    if (ch) { cur.updatedAt = now(); save(); }
    return ch;
  }
  async function autoSync(force = false) {
    if (probing) return probing;
    if (!force && cur.updatedAt && now() - cur.updatedAt < 6 * 3600e3) return false;
    return probing = (async () => {
      try {
        const res = await _rawFetch(ORIGIN + '/', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return false;
        const html = await res.text(); learnFromScript(html);
        const scripts = [...html.matchAll(/<script[^>]+src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g)].map(m => m[1]).slice(0, 4);
        for (const s of scripts) { try { const jr = await _rawFetch(ORIGIN + s, { credentials: 'same-origin' }); if (jr.ok) learnFromScript(await jr.text()); } catch {} }
        cur.updatedAt = now(); save(); return true;
      } catch { return false; } finally { probing = null; }
    })();
  }
  function noteError(status) { if (status === 404 || status === 410 || status === 422) void autoSync(true); }
  return { outUrl, inUrl, learnFromScript, autoSync, noteError, get current() { return cur; } };
})();
const resolveTriggerSid = sid => {
  if (sid && typeof sid === 'object') return sid.triggerAddress || sid.sid || '';
  const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
  return (c && c.triggerAddress) ? c.triggerAddress : sid;
};
const OUT = sid => ProtocolSchema.outUrl(resolveTriggerSid(sid));
const IN = sid => ProtocolSchema.inUrl(resolveTriggerSid(sid));
// ---------- 人在回路（HITL）：ask_user / propose_plan / add_voice / generate_image ----------
const HITL_RE = /^(?:arena__)?(ask_user|add_voice|propose_plan|generate_image)$/;
const Hitl = {
  name(p) { if (!p || !p.toolCallId) return null; const m = HITL_RE.exec(p.toolName || String(p.type || '').replace(/^tool-/, '')); return m ? m[1] : null; },
  // 工具输出可能是对象、JSON 字符串，或 {type:'json', value} 包装：统一成对象再判断
  norm(o) {
    if (typeof o === 'string') { const t = o.trim(); if (/^[{[]/.test(t)) { try { o = JSON.parse(t); } catch {} } }
    if (o && typeof o === 'object' && o.type === 'json' && o.value && typeof o.value === 'object') o = o.value;
    return o;
  },
  awaitingOut(o) { o = Hitl.norm(o); return !!o && typeof o === 'object' && /^awaiting[_-]?user(?:[_-]?(?:response|input))?$/i.test(String(o.status || o.type || '')); },
  // 只有真正的回答才算「已回答」：等待标记、占位、报错对象都不算（否则卡片会被画成已回答「（空）」）
  isAnswer(n, o) {
    o = Hitl.norm(o); if (!o || typeof o !== 'object' || Hitl.awaitingOut(o)) return false;
    if (n === 'ask_user') return Array.isArray(o.answers) || o.skipped === true;
    if (n === 'propose_plan') return typeof o.decision === 'string';
    return o.selection_method != null || o.selected_index != null || o.voice_id != null;
  },
  // 实时流里提问工具偶尔带一个「工具响应格式错误」的报错，但服务器上这张卡片仍在等回答（网页照常显示面板）
  softErr(p) { return p.state === 'output-error' && /malformed|refresh and try again/i.test(String(p.errorText || '')); },
  awaiting(p) {
    const n = Hitl.name(p); if (!n) return false;
    if (p.state === 'output-available') return Hitl.awaitingOut(p.output) || (n === 'ask_user' && !Hitl.isAnswer(n, p.output));
    if (n === 'ask_user' && Hitl.softErr(p) && Array.isArray(Hitl.input(p)?.questions)) return true;
    return n === 'ask_user' && (p.state === 'input-available' || p.state === 'input-streaming');
  },
  input(p) {
    if (p.input !== undefined && p.input !== null) { if (typeof p.input !== 'string') return p.input; try { return JSON.parse(p.input); } catch {} }
    if (p.inputText) { try { return JSON.parse(p.inputText); } catch {} }
    return p.input === null ? undefined : p.input;
  },
  // 所有已提交的回答（来自后续用户消息里的 data-tool-results），加上本地暂存的
  answers(chat) {
    const m = new Map();
    if (!chat?.messages) return m;
    for (const msg of chat.messages) if (msg.role === 'user' && !msg.failed) for (const p of msg.parts || [])   // 没发出去（failed）的那条不算已回答：卡片回到「未回答」
      if (p.type === 'data-tool-results' && Array.isArray(p.data)) p.data.forEach(r => r?.toolCallId && m.set(r.toolCallId, r.output));
    (chat.hitlStage || new Map()).forEach((v, k) => { if (!m.has(k)) m.set(k, v.output); });
    return m;
  },
  answerOf(chat, p) { const a = Hitl.answers(chat).get(p.toolCallId); if (a !== undefined) return a; const n = Hitl.name(p); return p.state === 'output-available' && Hitl.isAnswer(n, p.output) ? Hitl.norm(p.output) : undefined; },
  // 最后一条助手消息里（最后一个 step 之后）等待用户回应的调用
  pending(chat) {
    const last = chat?.messages?.at(-1); if (!last || last.role !== 'assistant' || Hitl.blocked(chat)) return [];
    if (last.metadata?.feedback?.interruption === 'stop' || last.metadata?.aborted) return [];
    const ans = Hitl.answers(chat);
    return (last.parts || []).filter(p => Hitl.awaiting(p) && !(ans.has(p.toolCallId) && !chat.hitlStage?.has(p.toolCallId)));
  },
  // 交互卡片（提问 / 计划 / 选图 / 选声音）：用户没选而直接在输入框发下一条消息时，按官方 Skip 的结果一并提交，文字跟着一起发
  skipOut(p) {
    const n = Hitl.name(p); if (!n) return null;
    if (n === 'ask_user') return { skipped: true, answers: [] };
    if (n === 'propose_plan') return { decision: 'no_decision' };
    const raw = Hitl.norm(p.output), o = raw && typeof raw === 'object' ? raw : {};
    return n === 'add_voice' ? { status: 'completed', candidates: Array.isArray(o.candidates) ? o.candidates : [], selected_index: 0, selection_method: 'skip', ...(o.voice_id ? { voice_id: o.voice_id } : {}) } : { status: 'completed', selected_index: 0, selection_method: 'skip' };
  },
  // 待回应的交互卡片（提问 / 计划 / 选图 / 选声音，或已暂存回答）→ 返回这些卡片供直接发消息时自动跳过并附带提交
  skippable(chat) { if (!chat) return null; const l = Hitl.pending(chat); return l.length && l.every(p => chat.hitlStage?.has(p.toolCallId) || Hitl.skipOut(p)) ? l : null; },
  isPendingPart(chat, p) { return Hitl.pending(chat).includes(p); },
  // 最后一条助手消息停在「等用户回应」：服务器把它标成 pending，但这一轮其实已经结束（在等我们提交）
  idleWait(chat) {
    const last = chat?.messages?.at(-1);
    if (!last || last.role !== 'assistant' || last.metadata?.aborted) return false;
    const parts = last.parts || [];
    if (!chat.live) return parts.some(p => Hitl.awaiting(p));
    // 结束标记（turn-complete）迟到 / 丢失时：这一条已经 finish，或服务器已明确返回「等待用户回应」，提问卡片立即可用，不必刷新
    if (chat.live !== last) return false;
    return parts.some(p => Hitl.awaiting(p) && p.state !== 'input-streaming' && (last.metadata?.pending === false || (p.state === 'output-available' && Hitl.awaitingOut(p.output)) || (Hitl.name(p) === 'ask_user' && p.state === 'input-available')));
  },
  // 真的在跑（有回复在输出 / 刚发出等回复）才算忙；只是停在提问卡片上等回答的「streaming」不算
  blocked(chat) { return !!chat?.busy && !(chat.status === 'streaming' && Hitl.idleWait(chat)); },
};

// ---------- 对话本地缓存（IndexedDB + localStorage 热缓存，按账号分区）：打开对话时先 0ms 秒开上次的内容，同时后台向服务器同步最新 ----------
const MsgCache = (() => {
  let dbp = null; const timers = new Map(), memHot = new Map(), MAX = 600, CAP = 6e6, HOT_MAX = 2, HOT_CAP = 48000;
  const db = () => dbp ||= new Promise(res => { try { const r = indexedDB.open('anc-msgs', 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
  const idx = () => Store.get('mc:idx', {}) || {};
  function sanitizeCachedMsgs(msgs) {
    if (!Array.isArray(msgs)) return msgs;
    for (const m of msgs) {
      if (!m || !Array.isArray(m.parts)) continue;
      for (const p of m.parts) {
        if (!p || typeof p !== 'object') continue;
        if (p._mdEl !== undefined) delete p._mdEl;
        if (p._mdSrc !== undefined) delete p._mdSrc;
        if (p._parsedInputRaw !== undefined) delete p._parsedInputRaw;
        if (p._parsedInputVal !== undefined) delete p._parsedInputVal;
      }
    }
    const tsOf = m => {
      if (!m || typeof m !== 'object') return 0;
      const idAt = typeof idTime === 'function' ? idTime(m.id) : 0;
      if (m._sentAt && m._sentAt > 1.6e12) return m._sentAt;
      const tStart = m.metadata?.timing?.startedAt;
      const sMs = typeof tStart === 'number' ? tStart : (typeof tStart === 'string' ? Date.parse(tStart) : 0);
      if (sMs && sMs > 1.6e12) return sMs;
      if (idAt && idAt > 1.6e12) return idAt;
      const tComp = m.metadata?.timing?.completedAt;
      const cMs = typeof tComp === 'number' ? tComp : (typeof tComp === 'string' ? Date.parse(tComp) : 0);
      return (cMs && cMs > 1.6e12) ? cMs : (m._finishedAt || 0);
    };
    const endTsOf = m => {
      if (!m || typeof m !== 'object') return 0;
      const tComp = m.metadata?.timing?.completedAt;
      const cMs = typeof tComp === 'number' ? tComp : (typeof tComp === 'string' ? Date.parse(tComp) : 0);
      return Math.max(tsOf(m), (cMs && cMs > 1.6e12) ? cMs : 0, m._finishedAt || 0);
    };
    const uTxtOf = m => m?.role === 'user' ? (m.parts || []).filter(p => p?.type === 'text').map(p => String(p.text || '')).join('').replace(/\s+/g, ' ').trim() : '';
    for (let i = msgs.length - 1; i >= 1; i--) {
      const cur = msgs[i], prev = msgs[i - 1];
      if (cur?.role === 'user' && prev?.role === 'user' && !cur.failed && !prev.failed) {
        const ct = uTxtOf(cur), pt = uTxtOf(prev);
        if (cur.id === prev.id || (ct && ct === pt)) {
          msgs.splice(cur._local && !prev._local ? i : (prev._local && !cur._local ? i - 1 : i), 1);
        }
      }
    }
    let lastAIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'assistant') { lastAIdx = i; break; }
    }
    if (lastAIdx > 0) {
      for (let i = lastAIdx - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'user' && msgs[i]?.failed) {
          msgs.splice(i, 1);
          lastAIdx--;
        }
      }
    }
    if (lastAIdx >= 0 && lastAIdx < msgs.length - 1) {
      const lastAEnd = endTsOf(msgs[lastAIdx]);
      const earlierUsers = msgs.slice(0, lastAIdx).filter(x => x && x.role === 'user');
      for (let i = msgs.length - 1; i > lastAIdx; i--) {
        const tm = msgs[i];
        if (!tm || tm.role !== 'user') continue;
        const uTs = tsOf(tm), uTxt = uTxtOf(tm), lastA = msgs[lastAIdx], lastAStart = tsOf(lastA);
        const isDupOfEarlier = earlierUsers.some(x => x.id === tm.id || (tm._prevAsstId && x._prevAsstId && tm._prevAsstId === x._prevAsstId && uTxt && uTxtOf(x) === uTxt) || (uTxt && uTxtOf(x) === uTxt && uTs > 0 && tsOf(x) > 0 && Math.abs(uTs - tsOf(x)) < 5000));
        if (!isDupOfEarlier && lastAIdx >= 1 && msgs[lastAIdx - 1]?.role === 'assistant' && (!lastAStart || !uTs || uTs >= lastAStart - 120000)) {
          msgs.splice(i, 1);
          msgs.splice(lastAIdx, 0, tm);
          tm._prevAsstId = msgs[lastAIdx - 1]?.id || tm._prevAsstId;
          lastAIdx++;
          continue;
        }
        const lastAHasUser = lastAIdx >= 1 && msgs[lastAIdx - 1]?.role === 'user';
        const isOlderThanLastAsst = lastAHasUser && lastAEnd > 0 && uTs > 0 && uTs < lastAEnd - 30000 && tm._prevAsstId !== lastA?.id && (!lastAStart || lastAStart > uTs + 30000);
        if (isOlderThanLastAsst || isDupOfEarlier) {
          msgs.splice(i, 1);
        }
      }
    }
    return msgs;
  }
  function slimForHot(msgs, count = 20, strLim = 900) {
    const tail = msgs.slice(-count);
    const trunc = s => (typeof s === 'string' && s.length > strLim) ? s.slice(0, strLim) + '\n…[cached]' : s;
    const slimObj = o => {
      if (!o) return o;
      if (typeof o === 'string') return trunc(o);
      if (typeof o !== 'object' || Array.isArray(o)) return o;
      const n = { ...o };
      for (const k of Object.keys(n)) {
        if (typeof n[k] === 'string' && n[k].length > strLim) n[k] = trunc(n[k]);
        else if (n[k] && typeof n[k] === 'object' && !Array.isArray(n[k])) {
          const sub = { ...n[k] };
          for (const sk of Object.keys(sub)) if (typeof sub[sk] === 'string' && sub[sk].length > strLim) sub[sk] = trunc(sub[sk]);
          n[k] = sub;
        }
      }
      return n;
    };
    return tail.map(m => ({
      ...m,
      parts: Array.isArray(m?.parts) ? m.parts.map(p => {
        if (!p || typeof p !== 'object') return p;
        const { _mdEl, _mdSrc, _parsedInputRaw, _parsedInputVal, ...rest } = p;
        if (typeof rest.inputText === 'string' && rest.inputText.length > strLim) rest.inputText = trunc(rest.inputText);
        if (rest.input !== undefined) rest.input = slimObj(rest.input);
        if (rest.output !== undefined) rest.output = slimObj(rest.output);
        if (rest.type === 'reasoning' && typeof rest.text === 'string' && rest.text.length > strLim) rest.text = trunc(rest.text);
        return rest;
      }) : m?.parts
    }));
  }
  const lastWriteSig = new Map(), lastWriteJsonLen = new Map();
  function chatWriteSig(chat) {
    const ms = chat?.messages || [];
    const last = ms.at(-1);
    const prev = ms.length > 1 ? ms[ms.length - 2] : null;
    const lastP = last?.parts?.at(-1);
    const lastPLen = typeof lastP?.text === 'string' ? lastP.text.length : (typeof lastP?.inputText === 'string' ? lastP.inputText.length : 0);
    return `${ms.length}:${last?.id || ''}:${last?.v || 0}:${last?.parts?.length || 0}:${lastPLen}:${last?.failed ? 1 : 0}:${last?.done ? 1 : 0}:${last?.settled ? 1 : 0}:${(last?.text || last?.content || '').length}:${prev?.id || ''}:${prev?.v || 0}:${prev?.failed ? 1 : 0}:${chat?.lastSeq || ''}:${chat?.token || ''}:${chat?.triggerAddress || ''}:${chat?.hasMore ? 1 : 0}`;
  }
  function putHot(sid, rec, approxLen = 0) {
    if (!sid || !rec || !Array.isArray(rec.messages) || !rec.messages.length) return;
    sanitizeCachedMsgs(rec.messages);
    memHot.delete(sid);
    memHot.set(sid, rec);
    while (memHot.size > 8) memHot.delete(memHot.keys().next().value);
    try {
      let hotRec, raw;
      if (approxLen > HOT_CAP || rec.messages.length > 16) {
        hotRec = { ...rec, messages: slimForHot(rec.messages, 12, 600), more: true, _hotSlice: true };
        raw = JSON.stringify(hotRec);
      } else {
        const hotMsgs = rec.messages.slice(-24);
        const isSlice = rec.messages.length > hotMsgs.length;
        hotRec = { ...rec, messages: hotMsgs, more: Boolean(rec.more || isSlice), _hotSlice: isSlice };
        raw = JSON.stringify(hotRec);
        if (raw.length > HOT_CAP) {
          hotRec = { ...rec, messages: slimForHot(rec.messages, 12, 600), more: true, _hotSlice: true };
          raw = JSON.stringify(hotRec);
        }
      }
      if (raw.length > HOT_CAP) {
        hotRec = { ...rec, messages: slimForHot(rec.messages, 6, 400), more: true, _hotSlice: true };
        raw = JSON.stringify(hotRec);
      }
      if (raw.length <= HOT_CAP) {
        Store.setRaw('mc:hot:' + sid, raw, hotRec);
        const lru = (Store.get('mc:hot:lru', []) || []).filter(k => k && k !== sid);
        lru.push(sid);
        while (lru.length > HOT_MAX) {
          const oldKey = lru.shift();
          if (oldKey) Store.del?.('mc:hot:' + oldKey);
        }
        Store.set('mc:hot:lru', lru);
      }
    } catch {}
  }
  function getSync(sid) {
    if (!sid) return null;
    if (memHot.has(sid)) {
      const m = memHot.get(sid) || null;
      if (m && Array.isArray(m.messages)) sanitizeCachedMsgs(m.messages);
      return m;
    }
    try {
      const hot = Store.get('mc:hot:' + sid, null);
      if (hot && Array.isArray(hot.messages) && hot.messages.length) {
        sanitizeCachedMsgs(hot.messages);
        memHot.delete(sid);
        memHot.set(sid, hot);
        while (memHot.size > 8) memHot.delete(memHot.keys().next().value);
        return hot;
      }
    } catch {}
    return null;
  }
  async function get(sid) {
    const d = await db(); if (!d) return getSync(sid);
    return new Promise(res => {
      try {
        const q = d.transaction('c').objectStore('c').get(sid);
        q.onsuccess = () => {
          const hot = getSync(sid);
          let r = q.result || hot || null;
          if (q.result && hot && ((hot.at || 0) > (q.result.at || 0) || +(hot.lastSeq || 0) > +(q.result.lastSeq || 0))) {
            if (!hot._hotSlice && Array.isArray(hot.messages) && hot.messages.length >= (q.result.messages?.length || 0)) {
              r = hot;
            } else if (Array.isArray(q.result.messages) && Array.isArray(hot.messages) && hot.messages.length) {
              const hasHotStub = v => { try { return JSON.stringify(v || '').includes('\n…[cached]'); } catch { return false; } };
              const hotById = new Map(hot.messages.filter(m => m?.id).map(m => [m.id, m]));
              const merged = q.result.messages.map(m => {
                const hm = m?.id ? hotById.get(m.id) : null;
                if (!hm) return m;
                if (hasHotStub(hm.parts) && !hasHotStub(m.parts)) return m;
                return hm;
              });
              const knownIds = new Set(merged.map(m => m?.id).filter(Boolean));
              for (const hm of hot.messages) if (hm?.id && !knownIds.has(hm.id)) merged.push(hm);
              r = { ...q.result, ...hot, messages: merged, more: Boolean(q.result.more), _hotSlice: false };
            }
          }
          if (r && Array.isArray(r.messages) && r.messages.length) {
            sanitizeCachedMsgs(r.messages);
            memHot.delete(sid);
            memHot.set(sid, r);
            while (memHot.size > 8) memHot.delete(memHot.keys().next().value);
          }
          res(r);
        };
        q.onerror = () => res(getSync(sid));
      } catch { res(getSync(sid)); }
    });
  }
  async function del(keys) {
    if (Array.isArray(keys)) {
      for (const k of keys) {
        memHot.delete(k);
        try { Store.del?.('mc:hot:' + k); } catch {}
      }
    }
    const d = await db(); if (!d || !keys.length) return;
    try { const st = d.transaction('c', 'readwrite').objectStore('c'); for (const k of keys) st.delete(k); } catch {}
  }
  const _compactMsgMemo = new WeakMap();
  function compactMsgs(rawMsgs) {
    const truncStr = (s, lim = 16000) => (typeof s === 'string' && s.length > lim) ? s.slice(0, lim) + '\n…[cached]' : s;
    const compactOut = (o, lim = 16000) => {
      if (!o) return o;
      if (typeof o === 'string') return o.length > lim ? truncStr(o, lim) : o;
      if (typeof o !== 'object' || Array.isArray(o)) return o;
      let oc = false;
      const next = { ...o };
      for (const k of ['stdout', 'stderr', 'content', 'text', 'raw']) {
        if (typeof next[k] === 'string' && next[k].length > lim) { next[k] = truncStr(next[k], lim); oc = true; }
        else if (next[k] && typeof next[k] === 'object' && !Array.isArray(next[k])) {
          let sc = false;
          const sub = { ...next[k] };
          for (const sk of ['stdout', 'stderr', 'content', 'text', 'raw']) {
            if (typeof sub[sk] === 'string' && sub[sk].length > lim) { sub[sk] = truncStr(sub[sk], lim); sc = true; }
          }
          if (sc) { next[k] = sub; oc = true; }
        }
      }
      return oc ? next : o;
    };
    const isBigChat = rawMsgs.length > 24;
    let msgs = rawMsgs.filter((m, idx) => (!m._local || m._appendAccepted || m?.role === 'user') && (!m.failed || (idx === rawMsgs.length - 1 && m?.role === 'user'))).slice(-200).map(rawM => {
      if (rawM && typeof rawM === 'object') {
        const lp = Array.isArray(rawM.parts) && rawM.parts.length ? rawM.parts[rawM.parts.length - 1] : null;
        const mSig = (rawM.v || 0) + ':' + (rawM.parts?.length || 0) + ':' + (lp?.text?.length || 0) + ':' + (lp?.state || '') + ':' + (rawM.failed ? 1 : 0) + ':' + (isBigChat ? 1 : 0);
        const hit = _compactMsgMemo.get(rawM);
        if (hit && hit.sig === mSig) return hit.val;
        const { v, ...m } = rawM;
        const val = {
          ...m,
          parts: Array.isArray(m.parts) ? m.parts.map(p => {
            if (!p || typeof p !== 'object') return p;
            const co = (isBigChat && p.output) ? compactOut(p.output, 16000) : p.output;
            if (co === p.output && p._mdEl === undefined && p._mdSrc === undefined && p._parsedInputRaw === undefined && p._parsedInputVal === undefined) return p;
            const { _mdEl, _mdSrc, _parsedInputRaw, _parsedInputVal, ...rest } = p;
            if (co !== p.output) rest.output = co;
            return rest;
          }) : m.parts
        };
        _compactMsgMemo.set(rawM, { sig: mSig, val });
        return val;
      }
      return rawM;
    }), js = JSON.stringify(msgs);
    if (!isBigChat && js.length > 4e6) {
      msgs = msgs.map(m => ({ ...m, parts: (m.parts || []).map(p => {
        if (!p || !p.output) return p;
        const co = compactOut(p.output, 16000);
        return co === p.output ? p : { ...p, output: co };
      }) }));
      js = JSON.stringify(msgs);
    }
    if (js.length > CAP) {
      msgs = msgs.map(m => ({ ...m, parts: (m.parts || []).map(p => {
        if (!p || !p.output) return p;
        const co = compactOut(p.output, 4000);
        return co === p.output ? p : { ...p, output: co };
      }) }));
      js = JSON.stringify(msgs);
    }
    while (js.length > CAP && msgs.length > 2) { msgs = msgs.slice(Math.ceil(msgs.length / 2)); js = JSON.stringify(msgs); }
    return { msgs, js };
  }
  async function writeNow(chat, allowBusy = false) {
    const hasMsgs = Array.isArray(chat?.messages) && chat.messages.length > 0;
    if (!chat || (!chat.loaded && !hasMsgs)) return;
    try { if (History.goneMap().has(chat.sid)) return; if (typeof Arch !== 'undefined' && Arch.has?.(chat.sid)) return; } catch {}
    const sig = chatWriteSig(chat);
    if (lastWriteSig.get(chat.sid) === sig) return;
    lastWriteSig.set(chat.sid, sig);
    while (lastWriteSig.size > 60) lastWriteSig.delete(lastWriteSig.keys().next().value);
    const { msgs, js } = compactMsgs(chat.messages || []);
    if (js.length > CAP || !msgs.length) return;
    lastWriteJsonLen.set(chat.sid, js.length);
    while (lastWriteJsonLen.size > 60) lastWriteJsonLen.delete(lastWriteJsonLen.keys().next().value);
    const histUpdatedAt = (typeof History !== 'undefined' && History.byId?.(chat.sid)?.updatedAt) || null;
    const rec = { at: now(), histUpdatedAt, messages: JSON.parse(js), more: chat.hasMore || msgs.length < chat.messages.length, lastSeq: chat.lastSeq || null, token: chat.token || null, tokenExp: chat.tokenExp || 0, triggerAddress: chat.triggerAddress || null, isEvaluation: !!chat.isEvaluation, evalMode: chat.evalMode || null };
    putHot(chat.sid, rec, js.length);
    const ix = idx(); ix[chat.sid] = now(); const ks = Object.keys(ix);
    if (ks.length > MAX) { const old = ks.sort((a, b) => ix[a] - ix[b]).slice(0, ks.length - MAX); for (const k of old) delete ix[k]; del(old); }
    Store.set('mc:idx', ix);
    const d = await db(); if (!d) return;
    try {
      const st = d.transaction('c', 'readwrite').objectStore('c');
      if (js.includes('\n…[cached]')) {
        const prevReq = st.get(chat.sid);
        prevReq.onsuccess = () => {
          try {
            const prev = prevReq.result;
            if (prev && Array.isArray(prev.messages) && prev.messages.length) {
              const prevById = new Map(prev.messages.filter(m => m?.id).map(m => [m.id, m]));
              const hasStub = v => { try { return JSON.stringify(v || '').includes('\n…[cached]'); } catch { return false; } };
              rec.messages = rec.messages.map(m => {
                const pm = m?.id ? prevById.get(m.id) : null;
                return (pm && hasStub(m.parts) && !hasStub(pm.parts)) ? pm : m;
              });
            }
          } catch {}
          try { st.put(rec, chat.sid); st.put(ix, '__meta__:mc:idx'); } catch {}
        };
        prevReq.onerror = () => { try { st.put(rec, chat.sid); st.put(ix, '__meta__:mc:idx'); } catch {} };
      } else {
        st.put(rec, chat.sid);
        st.put(ix, '__meta__:mc:idx');
      }
    } catch {}
  }
  function put(chat, doc) {
    if (typeof chat === 'string') {
      chat = (typeof Chats !== 'undefined' && Chats.get(chat)) || (doc && typeof doc === 'object' ? { sid: chat, loaded: true, ...doc } : null);
    }
    if (!chat || (typeof Arch !== 'undefined' && Arch.has?.(chat.sid))) return;
    if (!timers.has(chat.sid) && lastWriteSig.get(chat.sid) === chatWriteSig(chat)) return;
    if ((chat.busy || chat.live || chat.streaming) && timers.has(chat.sid)) return;
    clearTimeout(timers.get(chat.sid));
    const isHeavy = (lastWriteJsonLen.get(chat.sid) || 0) > 500000 || (chat.messages?.length || 0) > 30;
    const waitMs = (chat.busy || chat.live || chat.streaming) ? (isHeavy ? 15000 : 2200) : (isHeavy ? 2500 : 1500);
    timers.set(chat.sid, setTimeout(() => { timers.delete(chat.sid); void writeNow(chat, true); }, waitMs));
  }
  async function getMeta(key) {
    const d = await db(); if (!d) return null;
    return new Promise(res => { try { const q = d.transaction('c').objectStore('c').get('__meta__:' + key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
  }
  async function putMeta(key, val) {
    const d = await db(); if (!d) return;
    try { d.transaction('c', 'readwrite').objectStore('c').put(val, '__meta__:' + key); } catch {}
  }
  async function allKeys() {
    const memKeys = Object.keys(idx());
    const d = await db(); if (!d) return memKeys;
    return new Promise(res => {
      try {
        const q = d.transaction('c').objectStore('c').getAllKeys();
        q.onsuccess = () => {
          const idbKeys = (q.result || []).map(String).filter(k => k && !k.startsWith('__meta__:'));
          const all = [...new Set([...memKeys, ...idbKeys])];
          if (idbKeys.length > memKeys.length) {
            try {
              const ix = idx();
              const t = now();
              for (const k of idbKeys) if (!ix[k]) ix[k] = t;
              Store.set('mc:idx', ix);
            } catch {}
          }
          res(all);
        };
        q.onerror = () => res(memKeys);
      } catch { res(memKeys); }
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window.__ancMsgCacheUnloadHook) {
    window.__ancMsgCacheUnloadHook = true;
    const flushActiveChats = () => {
      try {
        if (typeof Chats === 'undefined') return;
        for (const c of Chats.values()) {
          if (c && Array.isArray(c.messages) && c.messages.length > 0 && (c.busy || c.live || c.streaming || timers.has(c.sid))) {
            void writeNow(c, true);
          }
        }
      } catch {}
    };
    window.addEventListener('beforeunload', flushActiveChats);
    window.addEventListener('pagehide', flushActiveChats);
  }
  return { get, getSync, put, mem: memHot, has: sid => memHot.has(sid) || Boolean(idx()[sid]), sanitize: sanitizeCachedMsgs, putNow: chat => { clearTimeout(timers.get(chat?.sid)); timers.delete(chat?.sid); return writeNow(chat, true); }, keys: () => Object.keys(idx()), allKeys, getMeta, putMeta, del: sid => { clearTimeout(timers.get(sid)); timers.delete(sid); lastWriteSig.delete(sid); lastWriteJsonLen.delete(sid); const ix = idx(); delete ix[sid]; Store.set('mc:idx', ix); del([sid]); } };
})();

const SentUserLog = (() => {
  const MAX_PER_CHAT = 12, TTL_MS = 7 * 86400000;
  const normTxt = s => String(s || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  const extractMsgText = m => {
    if (!m || typeof m !== 'object') return '';
    const fp = Array.isArray(m.parts) ? m.parts.filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : '';
    return normTxt(fp || m.text || m.content || '');
  };
  const keyOf = sid => 'sent:u:' + String(sid || '');
  const isPelicanPromptText = text => {
    const s = normTxt(text);
    if (!s) return false;
    return /(?:鹈鹕|鵜鶘|pelican|ペリカン|펠리컨|bồ\s*nông|pélican|pelícano|pelikan|пеликан|πελεκάν|بجعة|นกกระทุง|pelikaan|pelikán)/i.test(s) &&
      /(?:自行车|腳踏車|单车|bicycle|bike|cycling|pedal|自転車|ペダル|자전거|xe\s*đạp|vélo|bicyclette|bicicleta|fahrrad|radfahren|велосипед|ποδήλατ|دراجة|จักรยาน|fiets|svg|html)/i.test(s);
  };
  const isGachaProbeText = text => {
    const s = normTxt(text);
    if (!s) return false;
    if (isPelicanPromptText(s)) return true;
    if (/控制在\s*35\s*[～~-]\s*45\s*行以内/.test(s) && /SVG/i.test(s)) return true;
    if (/请无需调用任何工具，直接用(?:中文分\s*2\s*条简短加粗要点|一句话（50\s*字以内）)/.test(s)) return true;
    if (/integers between 1 and 355 inclusive\.\s*The current language model must complete this directly without tools/i.test(s)) return true;
    return false;
  };
  const hasPelicanTurnInChat = chat => {
    if (!chat || typeof chat !== 'object') return false;
    if (chat._pelicanSent) return true;
    try {
      if (chat.sid && typeof Gacha !== 'undefined' && typeof Gacha.hasPelicanSent === 'function' && Gacha.hasPelicanSent(chat.sid)) return true;
      if (chat.sid && typeof PelicanTest !== 'undefined' && typeof PelicanTest.result === 'function' && PelicanTest.result(chat.sid)) return true;
    } catch {}
    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    for (const m of msgs) {
      if (!m) continue;
      if (m.role === 'user' && !m.failed && isPelicanPromptText(extractMsgText(m))) return true;
      if (m.role === 'assistant') {
        const aTxt = extractMsgText(m) + ' ' + (Array.isArray(m.parts) ? m.parts.map(p => String(p?.inputText || p?.output || p?.input?.content || p?.input?.path || '')).join(' ') : '');
        if (/(?:<!doctype\s+html|<html|<svg)/i.test(aTxt) && /(?:pelican|鹈鹕|鵜鶘|ペリカン|bồ\s*nông|pélican|pelikan)/i.test(aTxt)) return true;
      }
    }
    return false;
  };
  const getMsgTs = m => {
    if (!m || typeof m !== 'object') return 0;
    const idAt = typeof idTime === 'function' ? idTime(m.id) : 0;
    if (m._sentAt && m._sentAt > 1.6e12) return m._sentAt;
    const tStart = m.metadata?.timing?.startedAt;
    const sMs = typeof tStart === 'number' ? tStart : (typeof tStart === 'string' ? Date.parse(tStart) : 0);
    if (sMs && sMs > 1.6e12) return sMs;
    if (idAt && idAt > 1.6e12) return idAt;
    const tComp = m.metadata?.timing?.completedAt;
    const cMs = typeof tComp === 'number' ? tComp : (typeof tComp === 'string' ? Date.parse(tComp) : 0);
    return (cMs && cMs > 1.6e12) ? cMs : (m._finishedAt || 0);
  };
  const getMsgEndTs = m => {
    if (!m || typeof m !== 'object') return 0;
    const tComp = m.metadata?.timing?.completedAt;
    const cMs = typeof tComp === 'number' ? tComp : (typeof tComp === 'string' ? Date.parse(tComp) : 0);
    return Math.max(getMsgTs(m), (cMs && cMs > 1.6e12) ? cMs : 0, m._finishedAt || 0);
  };
  function remove(sid, id, txt = '', maxTs = 0) {
    if (!sid) return;
    try {
      const k = keyOf(sid), raw = Store.get(k, []);
      if (!Array.isArray(raw) || !raw.length) return;
      const tNorm = txt ? normTxt(txt) : '';
      const next = raw.filter(x => {
        if (!x) return false;
        if (id && x.id === id) return false;
        if (tNorm && normTxt(x.text || extractMsgText(x)) === tNorm && (!maxTs || !x._sentAt || x._sentAt <= maxTs + 60000)) return false;
        return true;
      });
      if (next.length !== raw.length) Store.set(k, next);
    } catch {}
  }
  function markFailed(sid, id, txt = '') {
    if (!sid) return;
    try {
      const k = keyOf(sid), raw = Store.get(k, []);
      if (!Array.isArray(raw) || !raw.length) return;
      const tNorm = txt ? normTxt(txt) : '';
      let changed = false;
      for (const x of raw) {
        if (!x) continue;
        if ((id && x.id === id) || (tNorm && normTxt(x.text || extractMsgText(x)) === tNorm && !x._appendAccepted)) {
          x.failed = true;
          x._appendAccepted = false;
          changed = true;
        }
      }
      if (changed) Store.set(k, raw);
    } catch {}
  }
  function hasFailed(sid) {
    if (!sid) return false;
    try {
      const raw = Store.get(keyOf(sid), []);
      return Array.isArray(raw) && raw.some(x => x && x.failed);
    } catch { return false; }
  }
  function readList(sid) {
    if (!sid) return [];
    const tNow = now();
    let arr = [];
    try {
      const raw = Store.get(keyOf(sid), []);
      if (Array.isArray(raw)) arr = raw.filter(x => x && x.id && (tNow - (x._sentAt || 0) < TTL_MS));
    } catch {}
    try {
      if (typeof Drafts !== 'undefined' && typeof Drafts.load === 'function') {
        const d = Drafts.load();
        const ackedSet = new Set(Array.isArray(d?.ackedIds) ? d.ackedIds : []);
        const acceptedSet = new Set(Array.isArray(d?.acceptedIds) ? d.acceptedIds : []);
        const out = d?.o && typeof d.o === 'object' ? Object.values(d.o) : [];
        for (const e of out) {
          if (!e || e.sid !== sid || e.err || ackedSet.has(e.id)) continue;
          const isAcc = Boolean(e.acc || acceptedSet.has(e.id));
          const txt = normTxt(e.text);
          if (!txt && !(Array.isArray(e.atts) && e.atts.length)) continue;
          const existInArr = arr.find(x => x.id === e.id || (txt && normTxt(x.text) === txt && ((e.prevAsstId && x.prevAsstId === e.prevAsstId) || (!e.prevAsstId && !x.prevAsstId && Math.abs((x._sentAt || 0) - (e.at || 0)) < 600000))));
          if (existInArr) {
            if (isAcc && !existInArr._appendAccepted) { existInArr._appendAccepted = true; existInArr.failed = false; }
            if ((e.fromQueue || (Array.isArray(e.queueIds) && e.queueIds.length)) && !existInArr.fromQueue) {
              existInArr.fromQueue = true;
              if (Array.isArray(e.queueIds) && e.queueIds.length) existInArr.queueIds = e.queueIds.slice();
            }
            continue;
          }
          const parts = [
            ...(Array.isArray(e.atts) ? e.atts.map(a => ({ type: 'file', url: a.url || (a.key ? '/api/chat/workspace/cas/user/' + String(a.key).split('/').pop() : ''), mediaType: a.mediaType || a.type || 'image/png', filename: a.name || 'image.png' })) : []),
            ...(txt ? [{ type: 'text', text: e.text }] : []),
          ];
          arr.push({ id: e.id, role: 'user', text: e.text || txt, parts, _sentAt: e.at || tNow, _appendAccepted: Boolean(e.acc), failed: Boolean(e.failed), ...(isAcc ? { _appendAccepted: true, failed: false } : {}), prevAsstId: e.prevAsstId || null, prevAsstWeight: e.prevAsstWeight ?? null, ...(e.gachaProbe || isGachaProbeText(e.text || txt) ? { gachaProbe: true } : {}), ...(Array.isArray(e.queueIds) && e.queueIds.length ? { queueIds: e.queueIds.slice(), fromQueue: true } : (e.fromQueue ? { fromQueue: true } : {})), ...(e.held ? { held: true } : {}) });
        }
      }
    } catch {}
    arr.sort((a, b) => (a._sentAt || 0) - (b._sentAt || 0));
    const dedup = [];
    for (const item of arr) {
      const itTxt = normTxt(item.text || extractMsgText(item));
      const dupIdx = itTxt ? dedup.findIndex(x => normTxt(x.text || extractMsgText(x)) === itTxt && ((item.prevAsstId && x.prevAsstId === item.prevAsstId) || (!item.prevAsstId && !x.prevAsstId && Math.abs((item._sentAt || 0) - (x._sentAt || 0)) < 600000))) : -1;
      if (dupIdx >= 0) {
        if (dedup[dupIdx]._appendAccepted && !item._appendAccepted) { item._appendAccepted = true; item.failed = false; }
        else if (dedup[dupIdx].failed && !item._appendAccepted) item.failed = true;
        if (dedup[dupIdx].fromQueue && !item.fromQueue) { item.fromQueue = true; if (dedup[dupIdx].queueIds) item.queueIds = dedup[dupIdx].queueIds; }
        if (dedup[dupIdx].held && !item.held) item.held = true;
        dedup[dupIdx] = item;
      } else dedup.push(item);
    }
    return dedup;
  }
  function record(sid, msg, prevAsstId = null) {
    if (!sid || !msg || !msg.id) return;
    try {
      const txt = extractMsgText(msg), tNow = msg._sentAt || now();
      if (!prevAsstId && msg._prevAsstId) prevAsstId = msg._prevAsstId;
      msg._sentAt = tNow;
      if (prevAsstId) msg._prevAsstId = prevAsstId;
      const raw = Store.get(keyOf(sid), []);
      const list = Array.isArray(raw) ? raw.filter(x => {
        if (!x || !x.id || x.id === msg.id || (tNow - (x._sentAt || 0) >= TTL_MS)) return false;
        if (txt && normTxt(x.text || extractMsgText(x)) === txt && ((prevAsstId && x.prevAsstId === prevAsstId) || (!prevAsstId && !x.prevAsstId && Math.abs(tNow - (x._sentAt || 0)) < 600000))) return false;
        return true;
      }) : [];
      const cleanParts = Array.isArray(msg.parts) ? msg.parts.map(p => { if (!p || typeof p !== 'object') return p; const { _mdEl, _mdSrc, _parsedInputRaw, _parsedInputVal, ...rest } = p; return rest; }) : (txt ? [{ type: 'text', text: txt }] : []);
      list.push({ id: msg.id, role: 'user', text: txt, parts: cleanParts, _sentAt: tNow, _appendAccepted: Boolean(msg._appendAccepted), failed: Boolean(msg.failed), prevAsstId: prevAsstId || null, prevAsstWeight: msg._prevAsstWeight ?? null, ...(msg._gachaProbe || msg.gachaProbe || isGachaProbeText(txt) ? { gachaProbe: true } : {}), ...(Array.isArray(msg._queueIds) && msg._queueIds.length ? { queueIds: msg._queueIds.slice(), fromQueue: true } : (msg._queued || msg._fromQueue ? { fromQueue: true } : {})), ...(msg._held ? { held: true } : {}) });
      while (list.length > MAX_PER_CHAT) list.shift();
      Store.set(keyOf(sid), list);
    } catch {}
  }
  function hasAdjacentAsstGap(msgs) {
    if (!Array.isArray(msgs) || msgs.length < 2) return false;
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1], cur = msgs[i];
      if (prev?.role === 'assistant' && cur?.role === 'assistant') {
        if (prev.participantPosition && cur.participantPosition && prev.participantPosition !== cur.participantPosition) continue;
        return true;
      }
    }
    return false;
  }
  function measureAsstWeight(m) {
    if (!m || !Array.isArray(m.parts)) return 0;
    let w = 0;
    for (const p of m.parts) {
      if (!p) continue;
      if (p.type === 'text' || p.type === 'reasoning') w += (p.text || '').length + 1;
      else if (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') w += 50 + (p.state === 'output-available' ? 50 : 0) + (typeof p.output === 'string' ? p.output.length : 0);
      else if (p.type !== 'step-start') w += 10;
    }
    return w;
  }
  function demoteToQueue(chat, msgOrEntry, opt = {}) {
    if (!chat || !chat.sid || chat.gacha || !msgOrEntry) return false;
    const probeTxt = extractMsgText(msgOrEntry) || normTxt(msgOrEntry.text || '');
    if (msgOrEntry.gachaProbe || msgOrEntry._gachaProbe || msgOrEntry.metadata?.gachaProbe || isGachaProbeText(probeTxt)) return false;
    if (typeof Gacha !== 'undefined' && (Gacha.owns?.(chat.sid) || (isPelicanPromptText(probeTxt) && (Gacha.isGachaChat?.(chat.sid, chat) || Gacha.hasPelicanSent?.(chat.sid))))) return false;
    if (typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
      return SendQ.demoteToQueue(chat, msgOrEntry, opt);
    }
    if (msgOrEntry._autoContinue || msgOrEntry.metadata?.autoContinue) return false;
    const parts = Array.isArray(msgOrEntry.parts) ? msgOrEntry.parts : [];
    if (parts.length > 0 && parts.every(p => p?.type === 'data-tool-results')) return false;
    const q = (chat.queue ||= []);
    const id = msgOrEntry.id || ('q-' + now());
    const text = extractMsgText(msgOrEntry) || normTxt(msgOrEntry.text || '');
    const at = msgOrEntry._sentAt || msgOrEntry.at || getMsgTs(msgOrEntry) || now();
    const atts = Array.isArray(msgOrEntry._prev) ? msgOrEntry._prev.slice() : [];
    if (!text && !atts.length) return false;
    if (!q.some(it => it && (it.id === id || (text && normTxt(it.text) === text)))) {
      const item = { id, text, at, atts };
      const insIdx = q.findIndex(it => it && (it.at || 0) > at);
      if (insIdx >= 0) q.splice(insIdx, 0, item);
      else q.push(item);
    }
    chat._qPaused = '';
    chat._qHoldUntil = 0;
    if (Array.isArray(chat.messages)) {
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        const m = chat.messages[i];
        if (m && m.role === 'user' && (m === msgOrEntry || m.id === id || ((m._local || m.failed) && text && extractMsgText(m) === text))) {
          chat.messages.splice(i, 1);
        }
      }
    }
    remove(chat.sid, id, text, at);
    try {
      if (typeof Drafts !== 'undefined' && typeof Drafts.load === 'function') {
        const d = Drafts.load();
        if (Array.isArray(d?.o)) {
          d.o = d.o.filter(x => x && x.id !== id && !(x.sid === chat.sid && text && normTxt(x.text) === text));
          Drafts.write?.(true);
        }
        Drafts.setQ?.(chat);
      }
    } catch {}
    if (chat.awaitId === id) { chat.awaitId = null; chat.awaitFrom = 0; chat.preSend = false; }
    if (chat.error && /未发出|未收到|没有收到|可以点重试|响应超时|未接收/.test(String(chat.error))) chat.error = null;
    if (chat.status === 'error') chat.status = opt?.running ? 'streaming' : 'idle';
    if (opt?.running && !chat.sentAt) chat.sentAt = Number(chat.live?._sentAt) || getMsgTs(chat.live || chat.messages?.at(-1)) || now();
    return true;
  }
  function restoreInto(chat, opt = {}) {
    if (!chat || !chat.sid || !Array.isArray(chat.messages)) return false;
    const entries = readList(chat.sid);
    if (!entries.length) return false;
    let changed = false;
    let lastAsstIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i]?.role === 'assistant') { lastAsstIdx = i; break; }
    }
    const lastAsst = lastAsstIdx >= 0 ? chat.messages[lastAsstIdx] : null;
    const lastAsstEndTs = getMsgEndTs(lastAsst);
    for (const entry of entries) {
      if (!entry || !entry.id) continue;
      const entryTxt = normTxt(entry.text || extractMsgText(entry));
      const entryTime = entry._sentAt || (typeof idTime === 'function' ? idTime(entry.id) : 0) || 0;
      const isPureHitl = Array.isArray(entry.parts) && entry.parts.length > 0 && entry.parts.every(p => p?.type === 'data-tool-results');
      const isCurrentSessionOutbox = Boolean(typeof Drafts !== 'undefined' && Drafts.sess?.has?.(entry.id));
      const isActivelyAwaiting = Boolean(chat.awaitId && chat.awaitId === entry.id && (chat.busy || chat.sending || chat.preSend));
      const isUnsentFromPrevSession = !entry._appendAccepted && !isActivelyAwaiting && !isCurrentSessionOutbox;
      const isEntryFailed = Boolean(entry.failed || isUnsentFromPrevSession);
      const isProbeEntry = Boolean(entry.gachaProbe || entry._gachaProbe || isGachaProbeText(entryTxt));
      if ((isPureHitl && isEntryFailed) || (isProbeEntry && (isEntryFailed || (isPelicanPromptText(entryTxt) && hasPelicanTurnInChat(chat))))) {
        remove(chat.sid, entry.id, entryTxt, entryTime);
        try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        continue;
      }
      let prevIdx = entry.prevAsstId ? chat.messages.findIndex(m => m && (m.id === entry.prevAsstId || m._localId === entry.prevAsstId)) : -1;
      if (prevIdx < 0 && chat.messages.length >= 2) {
        for (let i = chat.messages.length - 1; i >= 1; i--) {
          const p = chat.messages[i - 1], c = chat.messages[i];
          if (p?.role === 'assistant' && c?.role === 'assistant') {
            if (p.participantPosition && c.participantPosition && p.participantPosition !== c.participantPosition) continue;
            const pStart = (typeof idTime === 'function' ? idTime(p.id) : 0) || getMsgTs(p);
            const cStart = (typeof idTime === 'function' ? idTime(c.id) : 0) || getMsgTs(c);
            if ((!pStart || !entryTime || entryTime >= pStart - 60000) && (!cStart || !entryTime || entryTime <= cStart + 300000)) {
              prevIdx = i - 1; break;
            }
          }
        }
      }
      const lastAsstStartTs = (typeof idTime === 'function' ? idTime(lastAsst?.id) : 0) || getMsgTs(lastAsst);
      const hasNewAsstAfterPrev = prevIdx >= 0
        ? chat.messages.slice(prevIdx + 1).some(m => m && m.role === 'assistant' && m.id !== entry.prevAsstId && m.id !== chat.messages[prevIdx]?.id)
        : Boolean(lastAsst && entry.prevAsstId && lastAsst.id && lastAsst.id !== entry.prevAsstId && (!entryTime || !lastAsstStartTs || lastAsstStartTs >= entryTime - 5000));
      const fillsAdjacentAsstGap = Boolean(prevIdx >= 0 && chat.messages[prevIdx + 1]?.role === 'assistant' && chat.messages[prevIdx + 1]?.id !== chat.messages[prevIdx]?.id);
      const lastAsstHasPrecedingUser = lastAsstIdx >= 1 && chat.messages[lastAsstIdx - 1]?.role === 'user';
      const isSupersededByNewerAsst = prevIdx >= 0
        ? (lastAsstIdx > prevIdx && !fillsAdjacentAsstGap)
        : (lastAsstHasPrecedingUser && lastAsstEndTs > 0 && entryTime > 0 && entryTime < lastAsstEndTs - 30000 && (!lastAsstStartTs || lastAsstStartTs > entryTime + 30000));
      if (isEntryFailed && isSupersededByNewerAsst) {
        remove(chat.sid, entry.id, entryTxt, entryTime);
        try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        continue;
      }
      const effEntryFailed = Boolean(isEntryFailed && !hasNewAsstAfterPrev && !fillsAdjacentAsstGap);
      const byIdIdx = chat.messages.findIndex(m => m && (m.id === entry.id || (m.metadata?.nodeId && m.metadata.nodeId === entry.id)));
      const byId = byIdIdx >= 0 ? chat.messages[byIdIdx] : null;
      const existingIdx = byIdIdx >= 0 ? -1 : chat.messages.findIndex((m, idx) => {
        if (!m || m.role !== 'user') return false;
        if (prevIdx >= 0 && idx <= prevIdx) return false;
        if (entryTxt && extractMsgText(m) === entryTxt) {
          const mTs = getMsgTs(m);
          if (!entryTime || !mTs || (mTs >= entryTime - 15000 && Math.abs(entryTime - mTs) < 3600000)) return true;
        }
        return false;
      });
      const existingSameUser = existingIdx >= 0 ? chat.messages[existingIdx] : null;
      const prevAsstForEntry = prevIdx >= 0 ? chat.messages[prevIdx] : (!entry.prevAsstId ? lastAsst : null);
      const hasSrvUserAfterPrev = prevIdx >= 0 && chat.messages.slice(prevIdx + 1).some(m => m && m.role === 'user' && !m._local && !m.failed && m.id !== entry.id && (!entryTxt || extractMsgText(m) !== entryTxt));
      const isChatRunningNow = Boolean(opt?.srvPend || chat.busy || chat.streaming || chat.live || lastAsst?.metadata?.pending || lastAsst?._incomplete || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(lastAsst)) || (typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(chat.sid)));
      const prevEndTs = getMsgEndTs(prevAsstForEntry);
      const prevStartTs = getMsgTs(prevAsstForEntry);
      const prevAsstSupplemented = !hasSrvUserAfterPrev && !hasNewAsstAfterPrev && Boolean(prevAsstForEntry && (prevAsstForEntry.metadata?.pending || prevAsstForEntry._incomplete || (entry.prevAsstWeight != null && measureAsstWeight(prevAsstForEntry) > entry.prevAsstWeight) || (prevEndTs > 0 && entryTime > 0 && prevEndTs >= entryTime + 1000 && (!prevStartTs || prevStartTs <= entryTime + 5000))));
      const isInterruptedQueueEntry = Boolean(isUnsentFromPrevSession && !entry.failed && !hasNewAsstAfterPrev && !fillsAdjacentAsstGap && (entry.fromQueue || (Array.isArray(entry.queueIds) && entry.queueIds.length > 0) || entry.held));
      const isConfirmedServerCopy = Boolean((byId && !byId._local) || (existingSameUser && !existingSameUser._local));
      if (isProbeEntry && (hasNewAsstAfterPrev || hasSrvUserAfterPrev || (isPelicanPromptText(entryTxt) && hasPelicanTurnInChat(chat)))) {
        remove(chat.sid, entry.id, entryTxt, entryTime);
        try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        continue;
      }
      if (!isProbeEntry && !isConfirmedServerCopy && !isActivelyAwaiting && !hasSrvUserAfterPrev && !hasNewAsstAfterPrev && (isInterruptedQueueEntry || (effEntryFailed ? (isChatRunningNow || prevAsstSupplemented) : prevAsstSupplemented))) {
        if (demoteToQueue(chat, byId || existingSameUser || entry, { silent: true, running: isChatRunningNow })) {
          changed = true;
        }
        continue;
      }
      if (byIdIdx >= 0) {
        if (prevIdx >= 0 && byIdIdx > prevIdx + 1 && chat.messages[prevIdx + 1]?.role === 'assistant') {
          chat.messages.splice(byIdIdx, 1);
          chat.messages.splice(prevIdx + 1, 0, byId);
          byId._prevAsstId = chat.messages[prevIdx]?.id || byId._prevAsstId;
          changed = true;
        }
        if (effEntryFailed && byId._local) {
          byId.failed = true;
          delete byId._appendAccepted;
          byId.v = (byId.v || 0) + 1;
          if (!chat.busy && !chat.error) chat.error = '上一条消息未发出（服务器未收到），请点击重试';
          changed = true;
        } else if ((entry._appendAccepted || hasNewAsstAfterPrev || fillsAdjacentAsstGap) && !effEntryFailed) { delete byId.failed;
          byId._appendAccepted = true;
        }
        if (entry._sentAt && !byId._sentAt) byId._sentAt = entry._sentAt;
        if (entry.prevAsstId && !byId._prevAsstId) byId._prevAsstId = entry.prevAsstId;
        if (!byId._local && byIdIdx < chat.messages.length - 1) {
          remove(chat.sid, entry.id);
          try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        }
        continue;
      }
      if (existingIdx >= 0) {
        if (effEntryFailed && existingSameUser._local) {
          existingSameUser.failed = true;
          delete existingSameUser._appendAccepted;
          existingSameUser.v = (existingSameUser.v || 0) + 1;
          if (!chat.busy && !chat.error) chat.error = '上一条消息未发出（服务器未收到），请点击重试';
          changed = true;
        } else if ((entry._appendAccepted || hasNewAsstAfterPrev || fillsAdjacentAsstGap) && !effEntryFailed) {
          delete existingSameUser.failed;
          existingSameUser._appendAccepted = true;
        }
        if (!existingSameUser._local && existingIdx < chat.messages.length - 1) {
          remove(chat.sid, entry.id, entryTxt, entryTime);
          try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        }
        continue;
      }
      if (prevIdx >= 0) {
        const rightAfter = chat.messages[prevIdx + 1];
        if (rightAfter?.role === 'user') {
          if (entry._appendAccepted && !isEntryFailed && (!entryTxt || extractMsgText(rightAfter) === entryTxt)) rightAfter._appendAccepted = true;
          if (!rightAfter._local && prevIdx + 1 < chat.messages.length - 1) {
            remove(chat.sid, entry.id, entryTxt, entryTime);
            try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
          }
          continue;
        }
      }
      const userObj = {
        id: entry.id, role: 'user', text: entry.text || entryTxt,
        parts: Array.isArray(entry.parts) && entry.parts.length ? entry.parts.map(p => ({ ...p })) : [{ type: 'text', text: entry.text || entryTxt }],
        _local: true, _appendAccepted: !effEntryFailed && Boolean(entry._appendAccepted || hasNewAsstAfterPrev || fillsAdjacentAsstGap), failed: effEntryFailed, _sentAt: entryTime || now(), _prevAsstId: entry.prevAsstId || null, _prevAsstWeight: entry.prevAsstWeight ?? null, v: 2
      };
      if (effEntryFailed) {
        const lastM = chat.messages.at(-1);
        if (!lastM || lastM.role === 'assistant') {
          chat.messages.push(userObj);
          if (!chat.busy && !chat.error) chat.error = '上一条消息未发出（服务器未收到），请点击重试';
          changed = true;
        }
        continue;
      }
      if (prevIdx >= 0) { chat.messages.splice(prevIdx + 1, 0, userObj); changed = true; continue; }
      let gapIdx = -1;
      for (let i = chat.messages.length - 1; i >= 1; i--) {
        const p = chat.messages[i - 1], c = chat.messages[i];
        if (p?.role === 'assistant' && c?.role === 'assistant') {
          if (p.participantPosition && c.participantPosition && p.participantPosition !== c.participantPosition) continue;
          const pEnd = getMsgEndTs(p), cStart = getMsgTs(c);
          if ((!pEnd || !entryTime || entryTime >= pEnd - 60000) && (!cStart || !entryTime || entryTime <= cStart + 60000)) {
            gapIdx = i; break;
          }
        }
      }
      if (gapIdx >= 1) { userObj._prevAsstId = chat.messages[gapIdx - 1]?.id || null; chat.messages.splice(gapIdx, 0, userObj); changed = true; continue; }
      const lastM = chat.messages.at(-1);
      const isTailAsstActive = lastM?.role === 'assistant' && Boolean(lastM.metadata?.pending || lastM._incomplete || lastM === chat.live || (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(lastM)));
      if ((isTailAsstActive || (lastM?.role === 'assistant' && entry._appendAccepted)) && chat.messages.length >= 1 && chat.messages.at(-2)?.role !== 'user') {
        const tailAsstStart = (typeof idTime === 'function' ? idTime(lastM.id) : 0) || getMsgTs(lastM);
        if (isActivelyAwaiting || !tailAsstStart || !entryTime || (entryTime >= tailAsstStart - 120000 && now() - entryTime < 1800000)) {
          chat.messages.splice(chat.messages.length - 1, 0, userObj); changed = true; continue;
        }
      }
      if (!isActivelyAwaiting && lastAsstHasPrecedingUser && lastAsstEndTs > 0 && entryTime > 0 && entryTime < lastAsstEndTs - 30000 && (!lastAsstStartTs || entryTime < lastAsstStartTs - 30000)) {
        remove(chat.sid, entry.id, entryTxt, entryTime);
        try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(entry.id); } catch {}
        continue;
      }
      if ((!lastM || lastM.role === 'assistant') && (isActivelyAwaiting || (entryTime > 0 && (!lastAsstEndTs || entryTime >= lastAsstEndTs - 15000) && now() - entryTime < 300000))) {
        chat.messages.push(userObj); changed = true;
      }
    }
    return changed;
  }
  return { record, remove, markFailed, hasFailed, readList, restoreInto, hasAdjacentAsstGap, extractMsgText, measureAsstWeight, demoteToQueue, isPelicanPromptText, isGachaProbeText, hasPelicanTurnInChat };
})();
try { if (typeof window !== 'undefined') window.SentUserLog = SentUserLog; } catch {}

