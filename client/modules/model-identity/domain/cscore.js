/*
 * Claude 强度分（0～10000）
 * 不依赖模型名称，只用 Brana 实时流里看得到的东西打分：
 *   答题能力 2000：探针题三个小题，按对错给分（opus 各档基本都能全对，所以只占小头）
 *   思考深度 6000：「服务器已接单」到第一个输出之间的静默秒数（Brana 等模型想完才发思考块）
 *   体量     2000：正文出字速度（按服务器时间戳），Claude 里越大的模型越慢
 * （beta.9 调整：能力 4000→2000、深度 4000→6000；实测 low/medium/high 三题都全对，拉不开差距，真正分档的是想了多久）
 * 先用已知档位的旧对话各测 3 次做标定（calibrate），之后每一抽用 guess 看最像哪一档。
 * 浏览器（油猴脚本）里是全局 ClaudeStrength，Node 里 require 即可。
 */
(function (root) {
  'use strict';

  // ---------------- 探针题（每一抽都发这一条，不要改动，改了要重新标定） ----------------
  const PROBE = [
    '不许调用任何工具，只在脑中推理。依次回答下面三题：',
    '① 满足 a²+b²=2026 的正整数有序数对 (a,b) 有几组？',
    '② 满足 a²+b²+c²=2026 的正整数有序三元组 (a,b,c) 有几组？',
    '③ 满足 a²+b²+c²+d²=2026 的正整数有序四元组 (a,b,c,d) 有几组？',
    '第一行只写三个答案，用空格隔开；第二行开始用 100 字左右说明第③题的算法。',
  ].join('\n');
  const KEY = [2, 48, 1422]; // 已用程序暴力验证

  // ---------------- 细则（可调） ----------------
  const RULES = {
    ability: [300, 700, 1000],         // 三个小题各自的分值，合计 2000
    depth: { max: 6000, t0: 5, t1: 180 }, // 静默 ≤5 秒记 0 分，≥180 秒记满分，中间按对数刻度
    size: { max: 2000, fast: 190, slow: 120 }, // 出字 ≥190 字/秒记 0 分，≤120 字/秒记满分
    minChars: 60, minSpan: 0.8,        // 正文太短时不算速度，给一半分
  };

  const clamp = x => Math.max(0, Math.min(1, x));
  const AMAX = () => RULES.ability.reduce((a, b) => a + b, 0);

  // records：同一条对话 realtime /out 流里的记录，[{ timestamp, body }]（body 为 JSON 字符串）
  // 或已经解析好的 [{ timestamp, data }]。会自动从最后一次「服务器已接单」开始算。
  function measure(records) {
    const rs = [];
    for (const r of records || []) {
      let d = r.data;
      if (!d && r.body) { try { d = JSON.parse(r.body).data; } catch { d = null; } }
      if (d && typeof d === 'object') rs.push({ ts: Number(r.timestamp), d });
    }
    let s = -1;
    rs.forEach((r, i) => { if (r.d.type === 'data-agent-dispatch') s = i; });
    const turn = s >= 0 ? rs.slice(s) : rs;
    if (!turn.length) return null;
    const t0 = turn[0].ts;
    const first = turn.find(r => /^(reasoning-start|text-start|tool-input-start)$/.test(r.d.type));
    const deltas = turn.filter(r => r.d.type === 'text-delta');
    const text = deltas.map(r => r.d.delta || '').join('');
    const usedTools = turn.some(r => /^tool-/.test(r.d.type || ''));
    let charsPerSec = null;
    if (deltas.length > 1) {
      const span = (deltas[deltas.length - 1].ts - deltas[0].ts) / 1000;
      const n = text.length - (deltas[0].d.delta || '').length; // 第一段到达时刻作为起点
      if (span >= RULES.minSpan && text.length >= RULES.minChars) charsPerSec = n / span;
    }
    return {
      thinkSec: first ? (first.ts - t0) / 1000 : null,
      charsPerSec,
      usedTools,
      finished: turn.some(r => r.d.type === 'finish'),
      text,
    };
  }

  // 取第一行（或前三行里第一个含 3 个数字的行）的三个整数
  function parseAnswers(text) {
    const lines = String(text || '').split('\n').map(x => x.replace(/[*`#>]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1').trim()).filter(Boolean).slice(0, 3);
    const line = lines.find(x => (x.match(/\d+/g) || []).length >= 3) || '';
    return (line.match(/\d+/g) || []).slice(0, 3).map(Number);
  }

  // m：measure() 的结果。返回各项得分与总分；调用了工具则作废
  function score(m) {
    if (!m) return { valid: false, why: '没有抓到这一轮的实时流' };
    if (m.usedTools) return { valid: false, why: '调用了工具，这一抽作废（思考被工具代替了）' };
    const answers = parseAnswers(m.text);
    const ability = KEY.reduce((sum, k, i) => sum + (answers[i] === k ? RULES.ability[i] : 0), 0);
    const D = RULES.depth, S = RULES.size;
    const depth = m.thinkSec == null ? 0 : Math.round(D.max * clamp(Math.log(Math.max(m.thinkSec, 1e-3) / D.t0) / Math.log(D.t1 / D.t0)));
    const size = m.charsPerSec == null ? Math.round(S.max / 2) : Math.round(S.max * clamp((S.fast - m.charsPerSec) / (S.fast - S.slow)));
    return { valid: true, total: ability + depth + size, ability, depth, size, answers, correct: answers.map((a, i) => a === KEY[i]), thinkSec: m.thinkSec, charsPerSec: m.charsPerSec, finished: m.finished };
  }

  // samples：[{ label: 'opus-5.5-high', result: score(...) }]，同一档位建议至少 3 条
  function calibrate(samples) {
    const by = {};
    for (const { label, result: r } of samples || []) {
      if (!r || !r.valid) continue;
      (by[label] = by[label] || []).push(r);
    }
    const out = {};
    for (const [label, rs] of Object.entries(by)) {
      const avg = k => rs.reduce((s, r) => s + r[k], 0) / rs.length;
      const totals = rs.map(r => r.total);
      out[label] = {
        n: rs.length,
        mean: Math.round(avg('total')), min: Math.min(...totals), max: Math.max(...totals),
        c: [avg('ability') / AMAX(), avg('depth') / RULES.depth.max, avg('size') / RULES.size.max], // 三项归一化后的中心
      };
    }
    return out;
  }

  // 看这一抽最像哪几档：按三项得分的距离排序，给出大致把握
  function guess(result, calib) {
    if (!result || !result.valid || !calib) return [];
    const v = [result.ability / AMAX(), result.depth / RULES.depth.max, result.size / RULES.size.max];
    const ds = Object.entries(calib).map(([label, c]) => ({ label, dist: Math.hypot(...v.map((x, i) => x - c.c[i])), band: [c.min, c.max] }));
    const w = ds.map(d => Math.exp(-d.dist / 0.12));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    return ds.map((d, i) => ({ ...d, p: Math.round(w[i] / sum * 100) })).sort((a, b) => a.dist - b.dist);
  }

  // 抽卡决定：keep = 满意（high / max 水平）；ok = 勉强（medium 水平）；reroll = 换
  // exclude：最像的档位名匹配到就换（除非总分已经到 keep 线，比如偶尔很强的 fable）
  function verdict(result, calib, opt = {}) {
    const keep = opt.keep ?? 7000, ok = opt.ok ?? 5500;
    const hard = opt.hardExclude ?? /sonnet/i, soft = opt.softExclude ?? /fable/i;
    if (!result || !result.valid) return { action: 'retry', why: result?.why || '无效' };
    const top = guess(result, calib)[0];
    if (top && hard.test(top.label) && top.p >= 60) return { action: 'reroll', why: '最像 ' + top.label + '（' + top.p + '%）', top };
    if (top && soft.test(top.label) && top.p >= 60 && result.total < keep) return { action: 'reroll', why: '最像 ' + top.label + '，分数不到满意线', top };
    if (result.total >= keep) return { action: 'keep', why: result.total + ' 分', top };
    if (result.total >= ok) return { action: 'ok', why: result.total + ' 分（勉强）', top };
    return { action: 'reroll', why: result.total + ' 分，太低', top };
  }

  const api = { PROBE, KEY, RULES, measure, parseAnswers, score, calibrate, guess, verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClaudeStrength = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// 客户端里用的名字（上面是原样收录的打分细则）
const CS = globalThis.ClaudeStrength;
