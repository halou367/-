/*
 * confidence.js — 置信度累积 + 出现次数统计
 *
 * 两套数字，用途不同，别混：
 *
 *   ① 置信度（本会话内自动累积，按「轮」记账）
 *      来自 basePrice 残差法，残差 0% ⇒ 100%。
 *      同一会话内每一轮取一次观测，多轮取算术平均：A(99,99)=99.0，B(99,98)=98.5。
 *      **同一轮内的重复推断只替换、不累加**：点「模型反推」、面板自动重算、
 *      /cost 轮询都会重新跑一次推断，但证据没变，就不能再计一次 —— 否则
 *      均值会随点击次数一直漂移。（2026-10-09 修：实测没有新一轮时每点一次都在变。）
 *      **换会话必须重置** —— 跨会话平均没有意义。
 *
 *   ② 出现次数（跨会话的全局计数，由人工确认驱动）
 *      用户在某个会话里认定「这一轮就是某型号」，该型号计数 +1。
 *      **每个会话只能认定一次**，认定后本会话内不得再改 ——
 *      否则同一份证据会被反复计入，计数就失去意义了。
 *
 * 排序：置信度降序 → 相同时出现次数多的在前 → 再相同按 id 稳定排序。
 *
 * 为什么要出现次数：四条通道价格完全相同的同族型号（同一价位的多个版本）
 * 在置信度上必然并列 100%，价格方法到此为止。这时只能靠人工在别处拿到的
 * 判断来打破平局，而「历史上被认定过多少次」就是最朴素的先验。
 */
(function (root) {
  'use strict';

  /*
   * 出现次数的初值。
   *
   * 这是**先验知识**，不是观测：来自已经用真值标注核实过的样本。
   * 其余型号一律从 0 开始。
   */
  const SEED_COUNTS = Object.freeze({
    'contenders/barium-bb-v2-4xts-agent': 3,
    'openai/gpt-6.1-sol': 2,
    'anthropic/claude-fable-5.1': 1,
    'anthropic/claude-opus-5': 3,
    'anthropic/claude-sonnet-5': 1,
    'anthropic/claude-opus-5.5': 1,
    'deepseek/deepseek-v4.1-flash': 2,
    'moonshotai/kimi-k3': 1,
    'openai/gpt-6-luna': 2,
    'tencent/hy4-preview': 1,
    'xiaomi/mimo-v2.6-pro': 1,
    'z-ai/glm-5.3': 1,
  });

  /** 残差 → 置信度百分比。残差 0 ⇒ 100。 */
  function residualToConfidence(residual) {
    if (typeof residual !== 'number' && typeof residual !== 'string') return 0;
    if (typeof residual === 'string' && !residual.trim()) return 0;
    const r = Number(residual);
    if (!Number.isFinite(r) || r < 0) return 0;
    return Math.max(0, Math.min(100, (1 - r) * 100));
  }

  // rounds：{ [轮次键]: { seq, models: { [型号id]: { conf, vendor, label, org, priceTier, at } } } }
  // 置信度账本只存「轮」，型号的统计量（均值、次数）由 rounds 重算，避免增量更新带来的漂移。
  const emptyLedger = () => ({ sessionId: null, observations: 0, seq: 0, rounds: {}, models: {} });
  const seedCounts = () => Object.assign({}, SEED_COUNTS);
  const emptyVotes = () => ({});

  const occurrenceOf = (counts, id) => Number((counts || {})[id]) || 0;

  /**
   * 一轮的键：本会话里**最新**一条已配对的助手消息 id。
   * 消息 id 是按时间递增的 UUID（v7），字典序即时间序。
   * 同一轮重复推断得到的键相同；新一轮到来时键才会变。
   */
  function roundKeyOf(messageIds) {
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map((x) => String(x || ''))
      .filter(Boolean);
    if (!ids.length) return null;
    return ids.reduce((a, b) => (a > b ? a : b));
  }

  /** 由各轮的观测重算每个型号的统计量：均值、观测轮数、最近一次。 */
  function recomputeModels(rounds) {
    const ordered = Object.values(rounds || {}).sort((a, b) => a.seq - b.seq);
    const latestRound = ordered.length ? ordered[ordered.length - 1] : null;
    const acc = {};
    for (const r of ordered) {
      for (const [id, m] of Object.entries(r.models || {})) {
        const cur = acc[id] || { sum: 0, n: 0, meta: {}, last: null };
        cur.sum += m.conf;
        cur.n += 1;
        cur.last = m;
        cur.meta = {
          vendor: m.vendor || cur.meta.vendor || null,
          label: m.label || cur.meta.label || null,
          org: m.org || cur.meta.org || null,
          priceTier: m.priceTier || cur.meta.priceTier || null,
        };
        acc[id] = cur;
      }
    }
    const models = {};
    for (const [id, a] of Object.entries(acc)) {
      const inLatest = !!(latestRound && latestRound.models && latestRound.models[id]);
      models[id] = {
        id,
        vendor: a.meta.vendor,
        label: a.meta.label,
        org: a.meta.org,
        priceTier: a.meta.priceTier,
        observations: a.n,
        confidence: inLatest ? a.last.conf : (a.sum / a.n),
        averageConfidence: a.sum / a.n,
        lastConfidence: a.last.conf,
        diophantinePassed: a.last.diophantinePassed !== false,
        scoreResidual: Number.isFinite(a.last.scoreResidual) ? a.last.scoreResidual : (1 - a.last.conf / 100),
        inLatestRound: inLatest,
        lastSeenAt: a.last.at,
      };
    }
    return models;
  }

  /**
   * 把一次推断结果并入本会话的置信度账本。
   *
   *   options.roundKey  本次推断所属的轮次（见 roundKeyOf）。
   *     · 同一个 roundKey 再次到来：替换这一轮的观测（证据没变则结果不变）；
   *     · 新的 roundKey：新增一轮，参与平均。
   *   不传 roundKey：每次调用视为一轮（旧口径，供直接调用方使用）。
   *
   * 换会话时整个重置。
   */
  function mergeObservation(ledger, sessionId, candidates, options) {
    const opts = options || {};
    const sid = sessionId || null;
    // 旧版账本没有 rounds，无法拆回逐轮观测 —— 当作空账本（它本来就只属于一个会话）
    const prev = (ledger && ledger.sessionId === sid && ledger.rounds)
      ? ledger : emptyLedger();
    const rounds = Object.assign({}, prev.rounds);
    let seq = Number(prev.seq) || 0;

    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length) {
      const byModel = {};
      const now = Number(opts.now) || Date.now();
      for (const c of list) {
        const id = String((c && c.id) || '');
        if (!id || byModel[id]) continue;          // 一轮里同型号只计一次
        byModel[id] = {
          conf: residualToConfidence(Number.isFinite(c.effectiveResidual) ? c.effectiveResidual : (Number.isFinite(c.scoreResidual) ? c.scoreResidual : c.residual)),
          diophantinePassed: c.diophantinePassed !== false,
          scoreResidual: Number.isFinite(c.scoreResidual) ? c.scoreResidual : (Number(c.residual) || 0),
          vendor: c.vendor || null,
          label: c.label || null,
          org: c.org || null,
          priceTier: c.priceTier || null,
          at: now,
        };
      }
      if (Object.keys(byModel).length) {
        const key = (opts.roundKey !== undefined && opts.roundKey !== null && String(opts.roundKey) !== '')
          ? String(opts.roundKey)
          : 'obs-' + (seq + 1);                    // 未指定轮次：每次调用计为一轮
        seq += 1;
        rounds[key] = { seq, models: byModel };    // 同一轮再次到来时整轮替换
      }
    }

    return {
      sessionId: sid,
      observations: Object.keys(rounds).length,
      seq,
      rounds,
      models: recomputeModels(rounds),
    };
  }

  /** 本会话是否已经认定过。 */
  const votedIn = (votes, sessionId) => (votes || {})[String(sessionId || '')] || null;

  /**
   * 认定本会话的型号：该型号出现次数 +1。
   *
   * 每个会话只允许一次。重复调用返回 ok:false 并原样带回现状 ——
   * 调用方据此把按钮置灰，而不是悄悄忽略。
   */
  function voteFor(counts, votes, sessionId, modelId) {
    const sid = String(sessionId || '');
    const id = String(modelId || '');
    const curCounts = Object.assign({}, counts || {});
    const curVotes = Object.assign({}, votes || {});

    if (!sid) {
      return { ok: false, reason: 'no-session', counts: curCounts, votes: curVotes, votedFor: null };
    }
    if (!id) {
      return { ok: false, reason: 'no-model', counts: curCounts, votes: curVotes,
        votedFor: curVotes[sid] || null };
    }
    if (curVotes[sid]) {
      return { ok: false, reason: 'already-voted', counts: curCounts, votes: curVotes,
        votedFor: curVotes[sid] };
    }
    curVotes[sid] = id;
    curCounts[id] = occurrenceOf(curCounts, id) + 1;
    return { ok: true, counts: curCounts, votes: curVotes, votedFor: id };
  }

  /**
   * 排序 + 截断，供渲染。
   * 出现次数从 counts 里取；没有记录的型号就是 0。
   */
  function rank(ledger, counts, limit) {
    const models = Object.values((ledger && ledger.models) || {})
      .map((m) => Object.assign({}, m, { occurrences: occurrenceOf(counts, m.id) }));
    models.sort((a, b) => {
      if (Boolean(b.inLatestRound) !== Boolean(a.inLatestRound)) return b.inLatestRound ? 1 : -1;
      if (Boolean(b.diophantinePassed) !== Boolean(a.diophantinePassed)) return b.diophantinePassed ? 1 : -1;
      if (Math.abs(b.confidence - a.confidence) > 1e-9) return b.confidence - a.confidence;
      const srDiff = (a.scoreResidual ?? 0) - (b.scoreResidual ?? 0);
      if (Math.abs(srDiff) > 1e-12) return srDiff;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    const n = Number(limit);
    return Number.isFinite(n) && n > 0 ? models.slice(0, n) : models;
  }

  const API = {
    SEED_COUNTS,
    residualToConfidence,
    emptyLedger,
    seedCounts,
    emptyVotes,
    occurrenceOf,
    roundKeyOf,
    mergeObservation,
    votedIn,
    voteFor,
    rank,
  };

  root.ArenaConfidence = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
