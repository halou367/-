import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  PROBES,
  computeGateStats,
  evaluateGate,
  extractResponseText,
  identifyPrepared,
  prepareOutputs,
  validateBank,
} from '../model-probe-engine.js';

const root = new URL('../', import.meta.url);
const bank = JSON.parse(await readFile(new URL('modeltrace-bank.json', root), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('tests/fixtures/gpt-6-astra-three.json', root), 'utf8'));

test('bundled ModelTrace bank passes structural validation', () => {
  assert.equal(validateBank(bank), bank);
  assert.equal(bank.models.length, 17);
  assert.equal(bank.robust.hellinger.feature_mean.length, 355);
});

test('the three probes keep the calibrated plain-English lengths', () => {
  assert.deepEqual(PROBES.map(item => item.expected_count), [297, 315, 331]);
  assert.ok(PROBES.every(item => item.prompt.includes('without tools')));
});

test('input gates reject counted, fixed-step, constant and short sequences', () => {
  assert.equal(evaluateGate([9, 9, 9], 297).rule, 'constant');
  assert.equal(evaluateGate(Array.from({length: 200}, (_, index) => index + 1), 297).rule, 'monotonic');
  assert.equal(evaluateGate(Array.from({length: 180}, (_, index) => 20 + (index % 2 ? 2 : 0)), 297).rule, 'arithmetic');
  const short = Array.from({length: 100}, (_, index) => 1 + ((index * 73 + index * index * 11) % 355));
  assert.equal(evaluateGate(short, 297).rule, 'too_short');
  assert.equal(computeGateStats(short, 297).min_length, 164);
});

test('transport extracts flat arrays and one completed API response', () => {
  assert.equal(extractResponseText('[7, 19, 23]').text, '7,19,23');
  const response = JSON.stringify({
    object: 'chat.completion',
    choices: [{finish_reason: 'stop', message: {role: 'assistant', content: '7, 19, 23'}}],
  });
  assert.equal(extractResponseText(response).text, '7, 19, 23');
  const responsesApi = JSON.stringify({
    object: 'response', status: 'completed',
    output: [{type: 'reasoning', summary: []}, {type: 'message', role: 'assistant', content: [{type: 'output_text', text: '7, 19, 23'}]}],
  });
  assert.equal(extractResponseText(responsesApi).text, '7, 19, 23');
  const tool = JSON.stringify({
    object: 'chat.completion',
    choices: [{finish_reason: 'tool_calls', message: {role: 'assistant', content: '', tool_calls: [{id: '1'}]}}],
  });
  assert.equal(extractResponseText(tool).error, 'api_tools');
});

test('duplicate replies cannot count as independent evidence', () => {
  const text = Array.from({length: 200}, (_, index) => 1 + ((index * 97 + index * index * 13) % 355)).join(',');
  const prepared = prepareOutputs([{text, expected_count: 297}, {text, expected_count: 315}]);
  assert.equal(prepared.checks[0].level, 'ok');
  assert.equal(prepared.checks[1].rule, 'duplicate');
  assert.equal(prepared.usable.length, 1);
});

test('three held-out-style GPT-6 Astra references score back to GPT-6 Astra', () => {
  const prepared = prepareOutputs(fixture);
  assert.deepEqual(prepared.checks.map(item => item.level), ['ok', 'ok', 'ok']);
  const result = identifyPrepared(prepared, bank);
  assert.equal(result.nearest.id, 'gpt-6-astra');
  assert.equal(result.used_outputs, 3);
  assert.ok(Number.isFinite(result.signals.fit));
  assert.ok(Number.isFinite(result.signals.separation));
});
