'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');

test('Task 68: Zero-Quota V5/V1 & ArenaPricing v38.5.0-zq-v11 exports', () => {
  const claudeV5 = require(path.join(clientRoot, 'ui/arena-trace/claude-standalone-v5.js'));
  const gptV1 = require(path.join(clientRoot, 'ui/arena-trace/gpt-standalone-v1.js'));
  global.ClaudeStandaloneClassifierV5 = claudeV5;
  global.ArenaGptStandaloneV1 = gptV1;
  const pricing = require(path.join(clientRoot, 'ui/arena-trace/pricing.js'));
  const preimage = require(path.join(clientRoot, 'ui/arena-trace/preimage.js'));

  assert.equal(typeof claudeV5.classifyClaudeSample, 'function');
  assert.equal(typeof claudeV5.composeWithCarbon, 'function');
  assert.equal(typeof gptV1.classifyGptSample, 'function');
  assert.equal(typeof gptV1.createStreamingPelicanFst, 'function');
  assert.equal(typeof gptV1.createBytePelicanFst, 'function');

  for (const fn of [
    'evaluateZeroQuotaCarbonSignature',
    'classify3StageGoogleArgonCarbon',
    'classifyStage1ProtocolGate',
    'classifyClaudeZeroQuotaEnhanced',
    'classifyGptZeroQuotaV1',
    'createStreamingPelicanFst',
    'createBytePelicanFst',
    'shouldAbortStage2PelicanMidStream',
    'solveConversationPreimage',
    'opus55PelicanSpectralAstJudge',
  ]) {
    assert.equal(typeof pricing[fn], 'function', 'Missing pricing export: ' + fn);
  }
  assert.ok(Array.isArray(pricing.EFFORT_LEVELS));
  assert.equal(typeof preimage.inspectAssignments, 'function');

  const modelJson = JSON.parse(fs.readFileSync(path.join(clientRoot, 'ui/arena-trace/pelican-classifier-model.json'), 'utf8'));
  assert.ok(modelJson.prototypes.length >= 191);
});

test('Task 68: BUG-01..BUG-12 & Pelican V5 / Gacha FST wiring', () => {
  const coreSrc = fs.readFileSync(path.join(clientRoot, 'ui/core.js'), 'utf8');
  assert.ok(coreSrc.includes('this._midRouteTurnKey = curTurnKey;'), 'BUG-04 per-turn reset');
  assert.ok(coreSrc.includes('前序轮次为闭源模型，本轮出现明文思考，检测到路由至开源模型'), 'BUG-04 open-source mid-stream route');

  const pelSrc = fs.readFileSync(path.join(clientRoot, 'ui/pelican-test.js'), 'utf8');
  assert.ok(pelSrc.includes('preferLatestTurn: true'), 'BUG-01 PelicanTest.run preferLatestTurn');
  assert.ok(pelSrc.includes('检测到模型路由切换：'), 'BUG-03 PelicanTest.run route detection');

  const bpSrc = fs.readFileSync(path.join(clientRoot, 'ui/billing-probe-ui.js'), 'utf8');
  assert.ok(bpSrc.includes('evaluateZeroQuotaCarbonSignature(f.raw)'), '5-Gate Carbon in htmlSvgRuleScores');
  assert.ok(bpSrc.includes('pelican-retest-route'), 'BUG-02/BUG-05 Pelican retest route pivot');
  assert.ok(bpSrc.includes('NEXUS_TRIFUSION_MODEL_CATALOG'), 'TriFusion catalog');
  assert.ok(bpSrc.includes('ASTRA_SOL_OPUS_MATH_COUNCIL_V4'), 'Math Council V4');
  assert.ok(bpSrc.includes('classifyZeroQuotaEnsemble'), 'Zero-Quota ensemble');
  assert.ok(bpSrc.includes('matchPelicanClassifierV5'), 'Pelican Classifier V5 191-prototype matcher');

  const gachaSrc = fs.readFileSync(path.join(clientRoot, 'ui/gacha.js'), 'utf8');
  assert.ok(gachaSrc.includes('createStreamingPelicanFst'), 'Gacha StreamingPelicanFst');
  assert.ok(gachaSrc.includes('createBytePelicanFst'), 'Gacha BytePelicanFst');

  const afterPackSrc = fs.readFileSync(path.join(clientRoot, 'scripts/after-pack.js'), 'utf8');
  assert.ok(afterPackSrc.includes("'VERSION.dll'"), 'BUG-11 VERSION.dll in STRIP_BIN_FILES');
  assert.ok(fs.existsSync(path.join(clientRoot, 'resources/bin/brana-win32.node')) || fs.existsSync(path.join(clientRoot, 'native-win32/Cargo.toml')) || afterPackSrc.includes('BRANA_WIN32_NODE_BR'), 'BUG-11 brana-win32.node exists');
});

test('Task 70: Full 01-06 Plan Audit (D1-D6, C1-C6, V12-V18 Engines, Ponytail Lean & Effort Pinning)', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const GV1 = require('../ui/arena-trace/gpt-standalone-v1.js');
  const PC = require('../ui/arena-trace/probe-context.js');
  const B = require('../ui/billing-probe.js');
  const bpSrc = fs.readFileSync(path.join(clientRoot, 'ui/billing-probe.js'), 'utf8');
  const tsSrc = fs.readFileSync(path.join(clientRoot, 'ui/thinking-status.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(clientRoot, 'ui/billing-probe-ui.js'), 'utf8');
  const prSrc = fs.readFileSync(path.join(clientRoot, 'ui/arena-trace/pricing.js'), 'utf8');

  // 1. V12-V18 Standalone & ArenaPricing exports
  assert.equal(typeof GV1.classifyGptSampleV18, 'function');
  assert.equal(typeof GV1.scoreToolCallAstSchemaFingerprint, 'function');
  assert.equal(typeof GV1.evaluatePreTextToolDeltaGate, 'function');
  assert.equal(typeof GV1.scoreSubwordEntropyReasoningCoupling, 'function');
  assert.equal(typeof GV1.createHighResStreamClock, 'function');
  assert.equal(typeof GV1.scoreIatFanoBurstFingerprint, 'function');
  assert.equal(typeof GV1.createIncrementalCursorSvgScanner, 'function');
  assert.equal(typeof GV1.computeWaldSprtStoppingBoundary, 'function');
  assert.equal(typeof PC.isUsableLock, 'function');
  assert.equal(typeof P.classifyOpenThinkingByRAvg, 'function');
  assert.equal(typeof P.detectToolIdVendor, 'function');

  // 2. D4 + Lean 9: call_b64 does NOT mark strictClosed=true; toolu_ does
  assert.deepEqual(P.detectToolIdVendor('call_A1b2C3d4E5f6G7h8I9j0K1l2'), { vendor: 'openai', shape: 'call_b64', strictClosed: false });
  assert.deepEqual(P.detectToolIdVendor('toolu_01ABCDEFGH1234567890'), { vendor: 'anthropic', shape: 'toolu', strictClosed: true });
  assert.ok(tsSrc.includes('detectToolIdVendor') && tsSrc.includes('/^(?:msg|rs)_[0-9a-fA-Z_-]{10,}/i'));

  // 3. C5 + Lean 8: 5-band open-thinking rAvgChunk classifier + DeepSeek 1017 vs 0910
  assert.equal(P.classifyOpenThinkingByRAvg(1.85, { reasoningDeltaCount: 12 }).model, 'zhipu/glm-5.3');
  assert.equal(P.classifyOpenThinkingByRAvg(2.60, { reasoningDeltaCount: 12, reasoningTextLength: 950 }).subversion, 'deepseek/deepseek-v4.1-flash-1017');
  assert.equal(P.classifyOpenThinkingByRAvg(2.35, { reasoningDeltaCount: 12, reasoningTextLength: 300 }).subversion, 'deepseek/deepseek-v4.1-flash-0910');
  assert.equal(P.classifyOpenThinkingByRAvg(3.30, { reasoningDeltaCount: 12 }).model, 'qwen/qwen3.8-max-preview');
  assert.equal(P.classifyOpenThinkingByRAvg(4.50, { reasoningDeltaCount: 12 }).model, 'zhipu/glm-5.1');
  assert.equal(P.classifyOpenThinkingByRAvg(7.20, { reasoningDeltaCount: 12 }).model, 'moonshot/kimi-k3-thinking');

  // 4. V14 Sub-1KB Pelican mid-stream abort
  const v14Abort = P.shouldAbortStage2PelicanMidStream('<svg><animate attributeName="x"/>' + ' '.repeat(650), 'google', ['google/gemini-4-carbon']);
  assert.equal(v14Abort.abort, true);
  assert.equal(v14Abort.guessId, 'google/gemini-3.8-flash');

  // 5. D2, D3, D6 & Multi-turn Effort Pinning
  assert.ok(prSrc.includes('visTokens: Number(row.visTokens || row.tokens) || 0'));
  assert.ok(!prSrc.includes('else if (!hasProbePlusHeavyCode && nTurns >= 4 && (totalO >= 10000'));
  assert.ok(prSrc.includes("spec.familyKey === 'claude-haiku-5.5' && thinkTokens <= 80 && peakTurnO <= 1800"));
  assert.ok(bpSrc.includes('reasoningChars: 0') && bpSrc.includes('rBlocks: Math.max(fmtReasonBlocks, maxReason)'));
  assert.ok(bpUiSrc.includes('chat._routeBaseline.effort !== curEffort && peakTurnO < 24000'));
});
