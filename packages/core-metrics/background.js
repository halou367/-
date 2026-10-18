import {identifyPrepared, prepareOutputs} from './model-probe-engine.js';
import {loadProbeBank} from './model-probe-bank.js';
import {probePlan, confidenceSuffix, fingerprintTitle} from './probe-policy.js';

const EXPECTED = [297, 315, 331];
const NAMES = Object.freeze({
  'gpt-5.4':'GPT-5.4','gpt-5.5':'GPT-5.5','gpt-5.6-sol':'GPT-5.6 Sol','gpt-5.6-terra':'GPT-5.6 Terra','gpt-5.6-luna':'GPT-5.6 Luna','gpt-6-astra':'GPT-6 Astra','gpt-6-sol':'GPT-6 Sol','gpt-6-luna':'GPT-6 Luna',
  'claude-haiku-4-5-20251001':'Claude Haiku 4.5','claude-sonnet-4-6':'Claude Sonnet 4.6','claude-sonnet-5':'Claude Sonnet 5','claude-sonnet-5-5':'Claude Sonnet 5.5','claude-opus-4-6':'Claude Opus 4.6','claude-opus-4-7':'Claude Opus 4.7','claude-opus-4-8':'Claude Opus 4.8','claude-opus-5':'Claude Opus 5','claude-opus-5-5':'Claude Opus 5.5','claude-fable-5-1':'Claude Fable 5.1',
  'kimi-k2.6':'Kimi K2.6','gemini-3.8-flash':'Gemini 3.8 Flash','deepseek-v4-pro-0813':'DeepSeek V4 Pro 0813','qwen3.8-max-0902':'Qwen3.8 Max 0902',
});

function isAgentUrl(value) {
  try { const url = new URL(value); return url.origin === 'https://arena.ai' && /^\/agent(?:\/|$)/.test(url.pathname); }
  catch { return false; }
}

function cleanOutputs(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw Error('探针数量无效');
  return value.map((item, index) => {
    const expected = Number(item?.expected_count);
    const text = typeof item?.text === 'string' ? item.text : '';
    if (expected !== EXPECTED[index] || text.length < 1 || text.length > 12000 || !/^[\d,\s]+$/.test(text)) throw Error('自动捕获的数字序列无效');
    return {text, expected_count: expected, challenge_id: `plain-${index + 1}`};
  });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'AMP_SCORE') return;
  (async () => {
    if (sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !isAgentUrl(sender.url) || !isAgentUrl(message.pageUrl)) throw Error('评分请求来源无效');
    const outputs = cleanOutputs(message.outputs);
    const prepared = prepareOutputs(outputs);
    if (!prepared.usable.length) return {checks: prepared.checks, result: null};
    const loaded = await loadProbeBank();
    const result = identifyPrepared(prepared, loaded.bank);
    const nearest = result.nearest;
    return {
      checks: prepared.checks,
      result: {
        plan: probePlan(result, loaded.bank, outputs.length),
        suffix: confidenceSuffix(result, outputs.length),
        title: fingerprintTitle(NAMES[nearest.id] || nearest.display_name || nearest.id, result, outputs.length),
        status: result.status,
        reason: result.reason,
        nearest: {
          id: nearest.id,
          display_name: NAMES[nearest.id] || nearest.display_name || nearest.id,
          family: nearest.family,
          family_name: nearest.family_name,
        },
        signals: result.signals,
        used_outputs: result.used_outputs,
        bank_models: result.bank_models,
        bank_source: loaded.info.source,
      },
    };
  })().then(reply, error => reply({error: error?.message || '模型指纹评分失败'}));
  return true;
});
