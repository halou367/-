import test from 'node:test';
import assert from 'node:assert/strict';
import {modelAccess, probePlan, confidenceSuffix, fingerprintTitle, calibrateReasoning} from '../probe-policy.js';
const result = (id = 'open-test', status = 'clear', count = 1) => ({nearest: {id}, status, used_outputs: count, signals: {relative_probability: 0.87654}});
const bank = {models: [{id: 'open-test', open_weights: true}, {id: 'closed-test', open_weights: false}, {id: 'unknown-test'}]};

test('explicit open-weight clear match stops after exactly one usable answer', () => {
  assert.equal(probePlan(result(), bank, 1).goal, 1);
  assert.equal(probePlan(result(), bank, 1).early, true);
});
test('closed, unknown, weak and family-only results need three', () => {
  for (const r of [result('closed-test'), result('unknown-test'), result('open-test', 'weak'), result('open-test', 'close'), null]) assert.equal(probePlan(r, bank, 1).goal, 3);
});
test('OpenAI-compatible vendor names are not proof of open weights', () => {
  assert.equal(modelAccess('kimi-k2.6', bank), 'unknown');
  assert.equal(modelAccess('qwen3.8-max', bank), 'unknown');
  assert.equal(modelAccess('gpt-6-astra', bank), 'closed');
});
test('every channel of a model must agree on open-weight metadata', () => {
  assert.equal(modelAccess('x', {models: [{id: 'x@one', open_weights: true}, {id: 'x@two'}]}), 'unknown');
});
test('percentage appears whenever every counted output was valid', () => {
  assert.equal(confidenceSuffix(result(), 1), ' · 匹配置信度 87.7%');
  assert.equal(confidenceSuffix(result('x', 'clear', 2), 3), '');   // 有一轮无效就不显示
  assert.equal(confidenceSuffix(result('x', 'clear', 3), 3), ' · 匹配置信度 87.7%');
  assert.equal(confidenceSuffix({...result('x', 'clear', 3), signals: {relative_probability: NaN}}, 3), '');
});
test('weak and family-only titles remain explicitly uncertain', () => {
  assert.match(fingerprintTitle('A', result('x', 'close', 3), 3), /^A\? · 匹配置信度/);
  assert.match(fingerprintTitle('A?', result('x', 'weak', 3), 3), /^A\? ·/);
});
const ctx = {family: 'claude-test', promptKey: 'plain-1', source: 'measured'};
const rows = ['high','max'].flatMap((tier,i) => [0,1,2].map(j => ({...ctx, tier, key: tier+j, score: (i+1)*100+j})));
test('uses actual reference median rather than hardcoding a max score', () => {
  const r = calibrateReasoning(202, ctx, rows);
  assert.equal(r.tier, 'max'); assert.equal(r.reference, 201);
});
test('different prompts, families or score sources cannot calibrate one another', () => {
  for (const change of [{promptKey:'old-9'}, {family:'other'}, {source:'estimated'}]) assert.equal(calibrateReasoning(202, {...ctx,...change}, rows).tier, null);
});
test('missing data, duplicate sessions and ambiguous score ranges stay uncalibrated', () => {
  assert.equal(calibrateReasoning(null, ctx, rows).tier, null);
  assert.equal(calibrateReasoning(201, ctx, rows.map(r => ({...r,key:r.tier}))).tier, null);
  assert.equal(calibrateReasoning(140, ctx, rows).tier, null);
  assert.equal(calibrateReasoning(1000, ctx, rows).tier, null);
});
test('overlap or reversed tier ordering invalidates a calibration', () => {
  assert.equal(calibrateReasoning(102, ctx, rows.map(r => ({...r,score:100}))).tier, null);
  assert.equal(calibrateReasoning(201, ctx, rows.map(r => ({...r,tier:r.tier==='max'?'high':'max'}))).tier, null);
});
