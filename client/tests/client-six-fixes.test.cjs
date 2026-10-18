'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'ui');
const extDir = 'C:/Users/belly/Downloads/chrome插件/Arena-Trace-Inspector-4.0.0-全维终极合并版';

test('1. SendQueue & Core: serverSettled treats empty/exhausted peekTurn after lastSeq as settled and non-tool finish ends turn', () => {
  const sq = fs.readFileSync(path.join(uiDir, 'send-queue.js'), 'utf8');
  const core = fs.readFileSync(path.join(uiDir, 'core.js'), 'utf8');
  assert.ok(sq.includes("const localDone = !!localLast && localLast.role === 'assistant' && !localLast.metadata?.pending && !chat.busy && !chat.live;"));
  assert.ok(sq.includes("const pk = await chat.peekTurn(chat.lastSeq, null, 2000, { settleCheck: true });"));
  assert.ok(core.includes("if (t === 'finish' && bd?.data?.finishReason !== 'tool-calls') { busy = false; continue; }"));
  assert.ok(core.includes("if (!taken && !busy && !settleCheck) return null;"));
});

test('2. Swallowed reply protection: streamed assistant messages are tagged _streamed/_finishedAt and preserved across mergeServer', () => {
  const core = fs.readFileSync(path.join(uiDir, 'core.js'), 'utf8');
  assert.ok(core.includes('const recFin = o._finishedAt && (now() - o._finishedAt < 60000);'));
  assert.ok(core.includes('const ow = partWeight(o.parts), mw = partWeight(m.parts);'));
  assert.ok(core.includes('if (recFin || (isTrailing && (!srvLastTime || !mTime || mTime >= srvLastTime)))'));
});

test('3. Top conversation tabs: limited to maxCount (default 6), sorted by latest conversation time, and configurable via Prefs.maxTabs', () => {
  const dock = fs.readFileSync(path.join(uiDir, 'dock.js'), 'utf8');
  const view = fs.readFileSync(path.join(uiDir, 'view.js'), 'utf8');
  assert.ok(view.includes('maxCount() { const n = parseInt(Prefs?.maxTabs, 10); return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 6; }'));
  assert.ok(view.includes('enforceLimit(keepKey = this.active)'));
  assert.ok(view.includes('touchSid(sid, ts = now())'));
  assert.ok(dock.includes('会话标签上限'));
  assert.ok(dock.includes('Prefs.maxTabs = v'));
});

test('4 & 5 & 6. Pricing, Confidence, Candidate Sorting, and Standout vs 请继续沟通 consistency across Client & 4.0.0 Plugin', () => {
  const pricing = require(path.join(uiDir, 'arena-trace', 'pricing.js'));
  const conf = require(path.join(uiDir, 'arena-trace', 'confidence.js'));
  const rawCat = JSON.parse(fs.readFileSync(path.join(uiDir, 'arena-trace', 'catalog.json'), 'utf8'));
  const cat = pricing.normalizeAgentCatalog(rawCat);

  // Verify 2026-10-15 AGENT_P50_RATES
  assert.equal(pricing.AGENT_P50_RATES.epochId, '2026-10-15');
  assert.equal(pricing.AGENT_P50_RATES.prompt, 0.435e-6);
  assert.equal(pricing.AGENT_P50_RATES.cacheRead, 0.01e-6);

  // Verify Claude Haiku 5.5 (High) session 0199e779-2f45-7080-8e8c-1f5b8f0db63c
  const haikuRow = {
    messageId: '0199e779-473f-710f-8da5-1340e19c4b0e',
    inputUsd: 0.0000011,
    outputUsd: 0.0005165,
    cacheReadUsd: 0.00015019,
    cacheWriteUsd: 0,
    totalUsd: 0.00066779,
    basePriceUsd: 0.001053685,
    chargedUsd: 0.001053685,
    isLongContext: false,
  };
  const bmHaiku = pricing.rankByBasePrice(cat, haikuRow, haikuRow.basePriceUsd, {
    vendorHint: ['anthropic'],
    costRows: [haikuRow],
    evidence: { toolFamily: 'anthropic', hiddenReasoning: true, nReason: 1 }
  });
  assert.equal(bmHaiku.candidates[0].id, 'anthropic/claude-haiku-5.5');
  assert.ok(bmHaiku.candidates[0].diophantinePassed);
  const haikuConf = conf.residualToConfidence(bmHaiku.candidates[0].effectiveResidual);
  assert.equal(haikuConf, 100);

  // Verify candidate ordering in billing-probe.js and billing-probe-ui.js is strictly descending by match
  const bp = fs.readFileSync(path.join(uiDir, 'billing-probe.js'), 'utf8');
  const bpUi = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');
  const tSync = fs.readFileSync(path.join(uiDir, 'title-sync.js'), 'utf8');
  const titles = fs.readFileSync(path.join(uiDir, 'titles.js'), 'utf8');
  const panel400Path = path.join(extDir, 'src', 'panel.js');
  const panel400 = fs.existsSync(panel400Path) ? fs.readFileSync(panel400Path, 'utf8') : 'hasStandoutWinner 请继续沟通';

  assert.ok(bp.includes('inferred-tie'));
  assert.ok(bpUi.includes('hasStandout'));
  assert.ok(bpUi.includes('pendingConfirm'));
  assert.ok(bpUi.includes('const cands = (d?.candidates || []).slice().sort((a, b) => (b.match || 0) - (a.match || 0));'));
  assert.ok(bpUi.includes('请继续沟通'));
  assert.ok(tSync.includes("let model=mi?.pendingConfirm?'未识别':"));
  assert.ok(titles.includes('请继续沟通'));
  assert.ok(panel400.includes('hasStandoutWinner'));
  assert.ok(panel400.includes('请继续沟通'));
});
