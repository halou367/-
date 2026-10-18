'use strict';
/*
 * 第一方 Agent 目录的每日同步。
 *
 * —— 为什么必须在浏览器里抓 ——
 *
 * `https://arena.ai/leaderboard/agent` 挂在 Cloudflare 后面，**非浏览器客户端
 * 一律 403**（实测 Node fetch 带齐 UA / sec-ch-ua / sec-fetch-* 仍然是
 * "Attention Required! | Cloudflare"）。所以：
 *
 *   · 用 Node 脚本或 Windows 计划任务定时抓 —— 行不通
 *   · 用扩展的 service worker 直接抓 —— 不可靠（SW 的 fetch 默认不带站点 cookie，
 *     拿不到 cf_clearance）
 *   · **在 arena.ai 页面的内容脚本里同源 fetch —— 可行**。它走页面的网络栈，
 *     cookie、TLS 指纹、sec-fetch-site: same-origin 全都是真浏览器的。
 *
 * 因此同步的触发在后台（chrome.alarms 每日一次判定「到期」），实际取数在
 * 内容脚本。代价是**必须等用户下次打开 arena.ai 才会真正刷新** —— 这是
 * Cloudflare 决定的，不是选型偷懒。界面上会显示上次同步时间。
 *
 * —— 载荷形态 ——
 *
 * Next.js App Router 把 SSR 数据嵌在文档里：`self.__next_f.push([1, "分片"])`。
 * 把所有分片按序拼起来就是 flight 载荷，价格记录在里面。字段名以 arena 页面
 * 自己的为准（`inputPricePerMillion` / `outputPricePerMillion`），其余字段
 * 用别名列表兜，**不依赖某一版前端的具体命名**。
 *
 * —— 失败就不动旧数据 ——
 *
 * 解析结果行数不足或缺必需字段时，一律返回 ok:false 并保留现有目录。
 * 宁可用着旧价，也不要被一个改版后的空壳页面把候选池清空。
 */
(function (root) {
  const SYNC_URL = '/leaderboard/agent';
  const SYNC_PERIOD_MINUTES = 24 * 60;        // 每天一次
  const MIN_ROWS = 20;                        // 低于这个数就判定解析失败
  const MAX_SCAN_BACK = 20000;                // 向前找外层 { 的窗口

  // ------------------------------------------------------- flight 载荷提取
  /**
   * 从 HTML 里抽出 `self.__next_f.push([1,"…"])` 的字符串分片并拼接。
   * 分片本身是 JSON 字符串字面量，要先解码转义。
   */
  function extractFlightPayload(html) {
    const text = String(html || '');
    const out = [];
    // 匹配 push([1,"…"]) / push([1, "…"])，字符串里允许转义引号
    const re = /__next_f\.push\(\s*\[\s*\d+\s*,\s*("(?:[^"\\]|\\.)*")/g;
    let m;
    while ((m = re.exec(text))) {
      try { out.push(JSON.parse(m[1])); } catch (_) { /* 分片坏了就跳过 */ }
    }
    // 一片都没有时退回原文 —— 有些页面直接内联 JSON，照样能扫到价格字段
    return out.length ? out.join('') : text;
  }

  // ------------------------------------------------------- 平衡括号取对象
  /** 从 s[start] 的 `{` 开始读一个完整 JSON 对象，返回结束下标；失败 -1。 */
  function readObject(s, start) {
    if (s[start] !== '{') return -1;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
    }
    return -1;
  }

  /**
   * 找包住下标 i 的**最小**那个能 JSON.parse 的对象。
   * 从 i 往前逐个试 `{`，第一个成功的就是最贴身的那层 —— 也就是模型记录本身，
   * 而不是把整张榜单裹进去的外层容器。
   */
  function enclosingObject(s, i) {
    const floor = Math.max(0, i - MAX_SCAN_BACK);
    for (let p = i; p >= floor; p -= 1) {
      if (s[p] !== '{') continue;
      const end = readObject(s, p);
      if (end < i) continue;                    // 没盖住目标键，继续往前
      try { return JSON.parse(s.slice(p, end + 1)); } catch (_) { /* 继续 */ }
    }
    return null;
  }

  // ------------------------------------------------------------- 字段读取
  const ALIAS = {
    key: ['contenderName', 'modelKey', 'model_key', 'contenderKey', 'slug', 'key', 'id'],
    label: ['model', 'publicName', 'displayName', 'display_name', 'modelName', 'label', 'title', 'name'],
    org: ['modelOrganization', 'organization', 'organizationName', 'org', 'provider', 'providerName', 'company'],
    input: ['inputPricePerMillion'],
    output: ['outputPricePerMillion'],
    context: ['contextLength', 'contextWindow', 'context_length'],
  };
  // task cost 可能平铺（agentTaskCostP50），也可能裹一层（taskCost:{p50}）
  const TASK_CONTAINERS = ['agentTaskCost', 'taskCost', 'taskCostUsd', 'costPerTask', 'cost'];
  const TASK_FLAT = {
    p25: ['agentTaskCostP25', 'taskCostP25', 'costP25', 'p25'],
    p50: ['agentTaskCostP50', 'taskCostP50', 'costP50', 'p50', 'median'],
    p95: ['agentTaskCostP95', 'taskCostP95', 'costP95', 'p95'],
  };

  const pick = (obj, names) => {
    for (const n of names) {
      if (obj && obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
    }
    return null;
  };
  const numOrNull = (v) => {
    if (v == null || typeof v === 'boolean' || typeof v === 'string' && !v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  function taskCost(obj) {
    for (const c of TASK_CONTAINERS) {
      const box = obj && obj[c];
      if (box && typeof box === 'object') {
        return {
          p25: numOrNull(pick(box, ['p25', 'P25', 'percentile25'])),
          p50: numOrNull(pick(box, ['p50', 'P50', 'median', 'percentile50'])),
          p95: numOrNull(pick(box, ['p95', 'P95', 'percentile95'])),
        };
      }
    }
    return {
      p25: numOrNull(pick(obj, TASK_FLAT.p25)),
      p50: numOrNull(pick(obj, TASK_FLAT.p50)),
      p95: numOrNull(pick(obj, TASK_FLAT.p95)),
    };
  }

  // ------------------------------------------------------------- 主解析
  /**
   * 解析 /leaderboard/agent 的文档，取出模型与单价。
   * @returns {{ok:boolean, rows:Array, stats:Object, reason:?string}}
   */
  function parseAgentLeaderboard(html) {
    const payload = extractFlightPayload(html);
    const seen = new Map();
    let hits = 0;
    const KEY = '"inputPricePerMillion"';
    let at = payload.indexOf(KEY);
    while (at >= 0) {
      hits += 1;
      const obj = enclosingObject(payload, at);
      at = payload.indexOf(KEY, at + KEY.length);
      if (!obj) continue;
      const input = numOrNull(pick(obj, ALIAS.input));
      const output = numOrNull(pick(obj, ALIAS.output));
      const key = pick(obj, ALIAS.key);
      const label = pick(obj, ALIAS.label);
      if (!key && !label) continue;               // 连名字都没有的不要
      const id = String(key || label);
      if (seen.has(id)) continue;
      const tc = taskCost(obj);
      seen.set(id, {
        key: key ? String(key) : null,
        label: label ? String(label) : String(key),
        org: (() => { const o = pick(obj, ALIAS.org); return o == null ? null : String(o); })(),
        inputPerMillion: input,
        outputPerMillion: output,
        contextLength: numOrNull(pick(obj, ALIAS.context)),
        agentTaskCostP25: tc.p25,
        agentTaskCostP50: tc.p50,
        agentTaskCostP95: tc.p95,
      });
    }
    const rows = [...seen.values()];
    const priced = rows.filter((r) => r.inputPerMillion > 0 && r.outputPerMillion > 0);
    const stats = { payloadBytes: payload.length, keyHits: hits, rows: rows.length, priced: priced.length };
    if (priced.length < MIN_ROWS) {
      // 宁可继续用旧目录，也不要被改版后的空壳页面把候选池清空
      return { ok: false, reason: 'too-few-rows', rows, stats };
    }
    return { ok: true, reason: null, rows, stats };
  }

  // ------------------------------------------------------ 并回候选池结构
  // 名称归一：tools/build-agent-catalog.js 也用这两个（通过 require 取），
  // 两边口径必须一致，否则离线构建和每日同步会对不上同一行。
  const TIER_SUFFIX = /\s*\((?:high|max|xhigh|medium|low|minimal|thinking|preview)\)\s*$/i;
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  /**
   * 把抓到的行并进打包目录的结构。
   *
   * 抓到的只有 token 单价 —— 第一方榜单**不公布 cache 单价**。所以 cache 费率、
   * OpenRouter id、物理上限这些仍从打包目录里按 agentKey / 归一名沿用，
   * 并保留 cacheRateSource 标注。单价一律以**新抓到的**为准。
   */
  function mergeIntoCatalog(parsedRows, bundled) {
    const base = (bundled && bundled.data) || [];
    const byKey = new Map();
    const byName = new Map();
    for (const e of base) {
      for (const k of (e.agentKeys || [])) byKey.set(norm(k), e);
      byKey.set(norm(e.id), e);
      byName.set(norm(e.label), e);
      byName.set(norm(String(e.label).replace(TIER_SUFFIX, '')), e);
    }

    const out = [];
    const seenId = new Set();
    let matched = 0;
    for (const r of parsedRows) {
      if (!(r.inputPerMillion > 0) || !(r.outputPerMillion > 0)) continue;
      const prev = byKey.get(norm(r.key)) || byName.get(norm(r.label))
        || byName.get(norm(String(r.label).replace(TIER_SUFFIX, ''))) || null;
      if (prev) matched += 1;
      const id = prev ? prev.id : (r.key || r.label);
      const hasInAlt = prev && Array.isArray(prev.altRates) && prev.altRates.some(ar => Math.abs((Number(ar.prompt) || 0) - r.inputPerMillion) < 1e-6 && Math.abs((Number(ar.completion) || 0) - r.outputPerMillion) < 1e-6);
      const keepPrevPrimary = Boolean(hasInAlt && prev.inputPerMillion > 0 && prev.outputPerMillion > 0);
      const nextAltRates = prev && Array.isArray(prev.altRates) ? prev.altRates.map(ar => ({ ...ar })) : [];
      if (prev && !keepPrevPrimary && prev.inputPerMillion > 0 && prev.outputPerMillion > 0 && (Math.abs(prev.inputPerMillion - r.inputPerMillion) > 1e-6 || Math.abs(prev.outputPerMillion - r.outputPerMillion) > 1e-6)) {
        if (!nextAltRates.some(ar => Math.abs((Number(ar.prompt ?? ar.inputPerMillion) || 0) - prev.inputPerMillion) < 1e-6 && Math.abs((Number(ar.completion ?? ar.outputPerMillion) || 0) - prev.outputPerMillion) < 1e-6)) {
          nextAltRates.push({
            prompt: prev.inputPerMillion,
            completion: prev.outputPerMillion,
            cacheRead: prev.cacheReadPerMillion || null,
            cacheWrite: prev.cacheWritePerMillion || null,
            source: 'bundled-archive',
          });
        }
      }
      const effIn = keepPrevPrimary ? prev.inputPerMillion : r.inputPerMillion;
      const inferredCr = prev && prev.cacheReadPerMillion != null ? prev.cacheReadPerMillion : (effIn > 0 ? +(effIn * 0.1).toFixed(6) : null);
      const inferredCw = prev && prev.cacheWritePerMillion != null ? prev.cacheWritePerMillion : null;
      const row = {
        ...(prev || {}),
        id,
        leaderboardRank: (out.length + 1),
        agentKeys: r.key ? [...new Set([r.key, ...((prev && prev.agentKeys) || [])])] : ((prev && prev.agentKeys) || []),
        label: r.label,
        org: r.org || (prev && prev.org) || null,
        vendor: (prev && prev.vendor) || norm(r.org || ''),
        inputPerMillion: effIn,
        outputPerMillion: keepPrevPrimary ? prev.outputPerMillion : r.outputPerMillion,
        altRates: nextAltRates.length ? nextAltRates : ((prev && prev.altRates) || undefined),
        // cache 费率没有第一方来源，沿用打包目录里借来的那份，出处照抄
        cacheReadPerMillion: inferredCr,
        cacheWritePerMillion: inferredCw,
        cacheRateSource: prev ? prev.cacheRateSource : null,
        openrouterId: prev ? prev.openrouterId : null,
        linkBasis: prev ? prev.linkBasis : null,
        agentTaskCostP25: r.agentTaskCostP25 != null ? r.agentTaskCostP25 : (prev && prev.agentTaskCostP25),
        agentTaskCostP50: r.agentTaskCostP50 != null ? r.agentTaskCostP50 : (prev && prev.agentTaskCostP50),
        agentTaskCostP95: r.agentTaskCostP95 != null ? r.agentTaskCostP95 : (prev && prev.agentTaskCostP95),
        contextLength: r.contextLength || (prev && prev.contextLength) || null,
        maxCompletionTokens: (prev && prev.maxCompletionTokens) || null,
        supportsReasoning: !!(prev && prev.supportsReasoning),
        priceStatus: (prev && prev.priceStatus) || null,
        cacheReadVariants: (prev && prev.cacheReadVariants) || null,
        cacheWriteVariants: (prev && prev.cacheWriteVariants) || null,
        historicalVariants: (prev && prev.historicalVariants) || null,
        medianOutputTokens: (prev && prev.medianOutputTokens) || null,
        medianSpeed: (prev && prev.medianSpeed) || null,
        mergedTiers: null,
      };
      // 同 id 同价合并（High/Max 两档单价逐位相同时，留两条只会制造假平局）
      const dup = out.find((x) => x.id === row.id
        && x.inputPerMillion === row.inputPerMillion
        && x.outputPerMillion === row.outputPerMillion);
      if (dup) {
        for (const k of row.agentKeys) if (!dup.agentKeys.includes(k)) dup.agentKeys.push(k);
        dup.mergedTiers = (dup.mergedTiers || [dup.label]).concat(row.label);
        continue;
      }
      if (seenId.has(row.id)) row.id = row.agentKeys[0] || (row.id + '#2');
      seenId.add(row.id);
      out.push(row);
    }
    for (const b of base) {
      if (!b || !b.id || seenId.has(b.id)) continue;
      if (!(b.inputPerMillion > 0) || !(b.outputPerMillion > 0)) continue;
      seenId.add(b.id);
      out.push({ ...b });
    }
    return {
      format: 'arena-agent-catalog/v1',
      capturedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      source: 'https://arena.ai' + SYNC_URL + ' —— 浏览器内同源抓取（每日）',
      origin: 'live-sync',
      units: 'USD per 1M tokens',
      caveats: [
        'token 单价来自第一方 /leaderboard/agent 实时抓取；cache-read / cache-write 单价第一方不公布，沿用打包目录里从 openrouter 借来的近似值，出处见 cacheRateSource。',
        '有 cache 计费的会话，残差里混了借来的 cache 费率，不能当作已核对。',
      ],
      stats: {
        models: out.length,
        matchedBundled: matched,
        withCacheRead: out.filter((e) => e.cacheReadPerMillion).length,
        orgs: [...new Set(out.map((e) => e.org).filter(Boolean))].sort(),
      },
      data: out,
    };
  }

  const API = {
    SYNC_URL,
    SYNC_PERIOD_MINUTES,
    MIN_ROWS,
    TIER_SUFFIX,
    norm,
    extractFlightPayload,
    readObject,
    enclosingObject,
    parseAgentLeaderboard,
    mergeIntoCatalog,
  };
  root.ArenaCatalogSync = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
