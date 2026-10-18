/* Shared experimental policy. Relative fingerprint weights are NOT calibrated identity probabilities. */
export const PROBE_PROTOCOL = 'modeltrace-plain-v1';
export function baseModelId(name) {
  return String(name || '').toLowerCase().replace(/@.*$/, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)(?:-vertex)?$/, '').replace(/(\d)\.(\d)/g, '$1-$2');
}
export function modelAccess(id, bank) {
  const models = (bank?.models || []).filter(m => String(m.id).split('@')[0] === id);
  // Exact, reviewed per-model metadata only. An OpenAI-compatible endpoint does not imply open weights.
  if (models.length && models.every(m => m.open_weights === true)) return 'open';
  if (models.some(m => m.open_weights === false) || /^(?:gpt-|claude-|gemini-|grok-)/i.test(id || '')) return 'closed';
  return 'unknown';
}
let certainStop = true;   // 置信度到 100% 就提前结束（测试里可关）
export function setCertainStop(v) { certainStop = !!v; }
export function probePlan(result, bank, count) {
  const access = modelAccess(result?.nearest?.id, bank);
  const p = result?.signals?.relative_probability;
  // 任何一个阶段置信度已经到 100%（四舍五入到 0.1% 后是 100.0%）就可以停，不用再补测
  const certain = certainStop && count >= 1 && result?.used_outputs === count && result?.status === 'clear' && typeof p === 'number' && Number.isFinite(p) && p >= 0.9995;
  const early = (count === 1 && result?.used_outputs === 1 && result?.status === 'clear' && access === 'open') || certain;
  return { access, goal: early ? count || 1 : 3, complete: early || count >= 3, early, certain,
    reason: certain ? '置信度已到 100%，提前结束' : early ? '明确匹配开放权重型号，首条结束' : '闭源或身份不确定，最多三条' };
}
export function confidenceSuffix(result, count) {
  const p = result?.signals?.relative_probability;
  if (!(count >= 1) || result?.used_outputs !== count || typeof p !== 'number' || !Number.isFinite(p)) return '';
  return ` · 匹配置信度 ${(Math.min(1, Math.max(0, p)) * 100).toFixed(1)}%`;
}
export function fingerprintTitle(name, result, count) {
  const uncertain = result?.status !== 'clear';
  const base = String(name || '未知型号').trim();
  return base + (uncertain && !/[?？]$/.test(base) ? '?' : '') + confidenceSuffix(result, count);
}
export function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = a.length >> 1;
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}
export function calibrateReasoning(score, context, rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (r.family !== context.family || r.promptKey !== context.promptKey || r.source !== context.source || !Number.isFinite(r.score) || r.score <= 0 || !/^(none|minimal|low|medium|high|xhigh|max)$/.test(r.tier || '')) continue;
    if (!by.has(r.tier)) by.set(r.tier, new Map());
    by.get(r.tier).set(r.key, r.score); // one vote per independently labelled conversation
  }
  const refs = [...by].map(([tier, samples]) => ({ tier, score: median([...samples.values()]), n: samples.size, min: Math.min(...samples.values()), max: Math.max(...samples.values()) }));
  const usable = refs.filter(r => r.n >= 3).sort((a, b) => a.score - b.score);
  const unknown = why => ({ tier: null, reference: null, refs, why });
  if (!Number.isFinite(score) || score <= 0) return unknown('没有可用推理分');
  if (usable.length < 2) return unknown('同型号、同探针、同分数来源至少需要两档，每档三个已知会话样本');
  const order = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  if (usable.some((r, i) => i > 0 && (order.indexOf(r.tier) <= order.indexOf(usable[i - 1].tier) || r.min <= usable[i - 1].max))) return unknown('校准档位区间重叠或次序冲突');
  const ranked = usable.map(r => ({ ...r, distance: Math.abs(Math.log(score / r.score)) })).sort((a, b) => a.distance - b.distance);
  if (ranked[0].distance > Math.log(1.35) || ranked[1].distance - ranked[0].distance < Math.log(1.15)) return unknown('推理分不在可区分的校准区间');
  return { tier: ranked[0].tier, reference: ranked[0].score, refs, why: '同型号同探针推理分匹配（估计档位，不是服务端配置证明）' };
}
