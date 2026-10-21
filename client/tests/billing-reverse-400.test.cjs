const clientDir = require('path').resolve(__dirname, '..');
const root = clientDir;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../ui/billing-probe.js');
const catalogDoc = require('../ui/arena-trace/catalog.json');

test('5-layer lexicographic engine + BigInt quantum preimage solves exact model & tokens', () => {
  const chatOpus55 = {
    sid: 's-opus55',
    messages: [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'thinking...' },
        { type: 'text', text: 'Here is the detailed analysis.' },
        { type: 'tool-test', toolCallId: 'toolu_vrtx_01ABCDEFGH12345678', input: {} }
      ],
      metadata: { pending: false }
    }]
  };
  const costOpus55 = {
    messages: {
      m1: {
        basePriceUsd: 1200 * 0.32e-6 + 50000 * 0.016e-6 + 450 * 0.87e-6,
        actual: {
          inputTokensCostUsd: 1200 * 4.0e-6,
          cacheReadTokensCostUsd: 50000 * 0.20e-6,
          cacheWriteTokensCostUsd: 0,
          outputTokensCostUsd: 450 * 20.0e-6,
          totalCostUsd: 1200 * 4.0e-6 + 50000 * 0.20e-6 + 450 * 20.0e-6
        }
      }
    }
  };
  const analyzed55 = B.analyze(chatOpus55, costOpus55, catalogDoc);
  assert.equal(analyzed55.result.baseMatch.ok, true);
  assert.equal(analyzed55.result.baseMatch.candidates[0].id, 'anthropic/claude-opus-5.5');
  assert.equal(analyzed55.result.baseMatch.candidates[0].diophantinePassed, true);
  assert.equal(analyzed55.preimage.totals.input, 1200);
  assert.equal(analyzed55.preimage.totals.cacheRead, 50000);
  assert.equal(analyzed55.preimage.totals.output, 450);
  assert.equal(analyzed55.preimage.totals.total, 51650);

  const costOpus5 = {
    messages: {
      m1: {
        basePriceUsd: 1200 * 0.32e-6 + 50000 * 0.016e-6 + 3400 * 0.87e-6,
        actual: {
          inputTokensCostUsd: 1200 * 5.0e-6,
          cacheReadTokensCostUsd: 50000 * 0.50e-6,
          cacheWriteTokensCostUsd: 0,
          outputTokensCostUsd: 3400 * 25.0e-6,
          totalCostUsd: 1200 * 5.0e-6 + 50000 * 0.50e-6 + 3400 * 25.0e-6
        }
      }
    }
  };
  const analyzed5 = B.analyze(chatOpus55, costOpus5, catalogDoc);
  assert.equal(analyzed5.result.baseMatch.ok, true);
  assert.equal(analyzed5.result.baseMatch.candidates[0].id, 'anthropic/claude-opus-5');
  assert.ok(analyzed5.result.baseMatch.candidates[0].residual < 1e-12);
  assert.equal(analyzed5.preimage.totals.input, 1200);
  assert.equal(analyzed5.preimage.totals.output, 3400);
});

test('UI top-bar removes fpbtn and keeps revbtn to the left of pelbtn; dock detailCard puts BillingProbe at top and traceCard at bottom', () => {
  const viewSrc = fs.readFileSync(path.join(__dirname, '../ui/view.js'), 'utf8');
  const revIdx = viewSrc.indexOf("class: 'ib revbtn'");
  const fpIdx = viewSrc.indexOf("class: 'ib fpbtn'");
  const pelIdx = viewSrc.indexOf("class: 'ib pelbtn'");
  assert.equal(fpIdx, -1, 'topbar fpbtn (测指纹) should be removed');
  assert.ok(revIdx > 0 && pelIdx > revIdx);

  const dockSrc = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8');
  const bpCardIdx = dockSrc.indexOf('BillingProbe.card(sid');
  const appendFpDefIdx = dockSrc.indexOf('const appendFpAtBottom = () =>');
  const lastReturnIdx = dockSrc.lastIndexOf('appendFpAtBottom();\n    return d;');
  assert.ok(bpCardIdx > 0 && appendFpDefIdx > bpCardIdx && lastReturnIdx > appendFpDefIdx);
});

test('Client Mode exposes identical Browser Mode interfaces (window.fetch passthrough, /c/:sid URL sync, SSE capture replay, and DOM cost anchors) for unmodified Chrome extensions', () => {
  const coreSrc = fs.readFileSync(path.join(__dirname, '..', 'ui/core.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(__dirname, '..', 'ui/view.js'), 'utf8');
  const navSrc = fs.readFileSync(path.join(__dirname, '..', 'src/browser-navigation.js'), 'utf8');
  const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'src/route-access.js'), 'utf8');

  assert.ok(coreSrc.includes('const _extFetch = (u, o) =>'), 'rawFetch must route through live window.fetch for MAIN-world extension hooks');
  assert.ok(coreSrc.includes('const ExtCompat = {'), 'ExtCompat bridge must exist in ui/core.js');
  assert.match(coreSrc, /ARENA_DETECTOR_V2_CAPTURE/, 'ExtCompat must replay /out SSE captures for historical/cached chats');
  assert.ok(viewSrc.includes('ExtCompat.syncUrl(sidNow)'), 'UI.showTab must sync location.pathname and mcpActiveSid');
  assert.match(viewSrc, /'aria-label': 'Session cumulative cost'/, 'Chat header must expose Session cumulative cost anchor');
  assert.match(viewSrc, /'aria-label':'Message cost'/, 'Assistant message footer must expose Message cost anchor');
  assert.ok(navSrc.includes('wc.__clientShell'), 'Browser navigation must honor __clientShell when pathname is /c/:sid');
  assert.ok(routeSrc.includes('wc.__clientShell'), 'Route access must honor __clientShell when pathname is /c/:sid');
});

test('GPT 5.6 Luna (xHigh) 138/13969/22 turn ranks #1 at 100% with exact integer preimage and rejects Solar Pro 4 half-integer R=6984.5', async () => {
  const chatLuna = {
    sid: 's-luna',
    messages: [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Short response.' }
      ],
      metadata: { pending: false }
    }]
  };
  const costLuna = {
    messages: {
      m1: {
        basePriceUsd: 138 * 0.32e-6 + 13969 * 0.016e-6 + 22 * 0.87e-6,
        totalChargedUsd: 0.000516,
        actual: {
          inputTokensCostUsd: 138 * 0.2e-6,
          cacheReadTokensCostUsd: 13969 * 0.02e-6,
          cacheWriteTokensCostUsd: 0,
          outputTokensCostUsd: 22 * 1.2e-6,
          totalCostUsd: 138 * 0.2e-6 + 13969 * 0.02e-6 + 22 * 1.2e-6
        }
      }
    }
  };
  const engine = B.create({
    bundled: catalogDoc,
    clock: () => 100000,
    account: () => 'u1',
    request: async () => costLuna
  });
  await engine.refresh(chatLuna);
  const st = engine.state('s-luna');
  const diag = engine.diagnostics('s-luna', { latestId: 'm1' });
  assert.equal(st.status, 'ready');
  assert.equal(st.ranked[0].id, 'openai/gpt-5.6-luna');
  assert.ok(Math.abs(st.ranked[0].confidence - 100) < 1e-6);
  assert.equal(diag.candidates[0].id, 'openai/gpt-5.6-luna');
  assert.equal(diag.candidates[0].label, 'GPT 5.6 Luna (xHigh)');
  assert.ok(Math.abs(diag.candidates[0].match - 100) < 1e-6);
  assert.equal(diag.candidates[0].diophantinePassed, true);
  const haiku = catalogDoc.data.find(m => m.id === 'anthropic/claude-haiku-5.5');
  assert.equal(haiku.inputPerMillion, 1);
  assert.equal(haiku.outputPerMillion, 5);
  const solar = st.info.result.baseMatch.candidates.find(c => /solar/i.test(c.id));
  assert.equal(solar.diophantinePassed, false);
  assert.equal(diag.routeSwitched, false);
  assert.equal(diag.preimage.totals.input, 138);
  assert.equal(diag.preimage.totals.cacheRead, 13969);
  assert.equal(diag.preimage.totals.output, 22);
  assert.equal(diag.preimage.totals.total, 14129);
});

test('8 client & browser mode experience, autoqa gacha, and background reverse-inference enhancements', () => {
    const dockSrc = fs.readFileSync(path.join(clientDir, 'ui/dock.js'), 'utf8');
  assert.ok(!dockSrc.includes('没有这一轮的 Trace，无法逐次核对是否换模型'), 'removed verbose no-Trace notice');

  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  assert.match(coreSrc, /autoTitle:\s*false/);
  assert.match(coreSrc, /rcLang:\s*'zh-CN'/);

  const viewSrc = fs.readFileSync(path.join(clientDir, 'ui/view.js'), 'utf8');
  assert.ok(viewSrc.includes('document.activeElement === ta') && viewSrc.includes('pmObserver?.takeRecords()'), 'composer preserves trailing space input');
  assert.ok(/this\.themeSeg\(\),\s*h\('button',\s*\{\s*class:\s*'ib nodrag',\s*id:\s*'palbtn'/.test(viewSrc), 'themeSeg moved immediately to the left of #palbtn');

  const envSrc = fs.readFileSync(path.join(clientDir, 'ui/env-check.js'), 'utf8');
  const bootSrc = fs.readFileSync(path.join(clientDir, 'ui/boot.js'), 'utf8');
  const autoRouteSrc = fs.readFileSync(path.join(clientDir, 'ui/auto-route.js'), 'utf8');
  assert.ok(envSrc.includes('envcheck:last') && bootSrc.includes('fastReturn'), 'skip redundant IP self-check on mode switch');
  assert.ok(autoRouteSrc.includes('RouteConfirm') && autoRouteSrc.includes("reason:'latency'"), 'countdown node switch confirmation on 429/timeout/high-latency');

  const gpSrc = fs.readFileSync(path.join(clientDir, 'ui/gacha-prompts.js'), 'utf8');
  const gachaSrc = fs.readFileSync(path.join(clientDir, 'ui/gacha.js'), 'utf8');
  assert.ok(gpSrc.includes('autoqa') && gpSrc.includes('AUTOQA_NUMBERS'), 'GachaPrompts.autoqa generates 3 random English word clauses + 4 number words');
  assert.match(gachaSrc, /mode:\s*'autoqa'/);
  assert.ok(gachaSrc.includes('trackAutoQA') && gachaSrc.includes('fallbackQuestionMark: true'), 'trackAutoQA handles 1-3 turns and appends ? on 3-turn tie');

  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  assert.ok(!bpUiSrc.includes('!chat?.loaded || chat.busy || chat.gacha'), 'background and gacha chats can auto-reverse-infer without foreground load');
  assert.ok(bpUiSrc.includes("Bus.on('chat', chat => { if (chat?.sid && !isOtherProbeBusy(chat)) automatic(chat); });"), 'Bus.on(chat) triggers background reverse-inference for non-active tabs');
});

test('protocol-first + automatic fallback across main, core, gacha, billing-probe-ui, and accounts', () => {
  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');
  const gachaSrc = fs.readFileSync(path.join(__dirname, '../ui/gacha.js'), 'utf8');
  const bpSrc = fs.readFileSync(path.join(__dirname, '../ui/billing-probe.js'), 'utf8');
  const bpuiSrc = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const acctSrc = fs.readFileSync(path.join(__dirname, '../ui/accounts.js'), 'utf8');

  assert.ok(mainSrc.includes('arena\\.ai\\/robots\\.txt'));
  assert.ok(mainSrc.includes("ipcMain.handle('host:protoFetch'"));
  assert.ok(preloadSrc.includes('protoFetch:'));

  assert.ok(coreSrc.includes('v3Chain'));
  assert.ok(coreSrc.includes('cachePool'));
  assert.ok(coreSrc.includes('async unarchive(id)'));
  assert.ok(coreSrc.includes('async pinCloud(id, isPinned)'));
  assert.ok(coreSrc.includes('async renamePlain(id, title)'));

  assert.ok(bpSrc.includes('s.coveredIds = Object.keys(cost.messages || {})'));
  assert.ok(bpuiSrc.includes('protoCostReq'));
  assert.ok(bpuiSrc.includes('fallbackCostReq'));
  assert.ok(bpuiSrc.includes('streamFallback: true'));

  assert.ok(gachaSrc.includes("'Next-Url': '/leaderboard/agent'"));
  assert.ok(gachaSrc.includes('stNow?.httpStatus === 429'));
  assert.ok(gachaSrc.includes('流式协议特征兜底'));

  assert.ok(acctSrc.includes('/nextjs-api/account/password'));
});

test('gstep-bar and accurate reverse-inference fixes (tc_ gateway IDs, Haiku 5.5 altRates cleanup, cross-turn costLedger)', async () => {
  const vm = require('node:vm'), path = require('node:path'), rootDir = path.join(__dirname, '..');
  const fmtSrc = fs.readFileSync(path.join(rootDir, 'ui/fmt.js'), 'utf8');
  const ctx = { Bus: { on() {}, emit() {} }, Store: { get: () => [], set() {} }, setTimeout: () => 0, clearTimeout() {}, now: () => 1000 };
  vm.createContext(ctx);
  vm.runInContext(fmtSrc + '; this.Fmt = Fmt;', ctx);
  const f = ctx.Fmt.fresh(1000);
  for (let i = 0; i < 28; i++) {
    ctx.Fmt.feed(f, { type: 'reasoning-start', id: 'tc_kUW8Cmwiw1Ari-1p2J-ld' + (i % 10) }, 1000 + i * 10);
    ctx.Fmt.feed(f, { type: 'reasoning-end', id: 'tc_kUW8Cmwiw1Ari-1p2J-ld' + (i % 10) }, 1005 + i * 10);
  }
  ctx.Fmt.feed(f, { type: 'text-start', id: '0' }, 2000);
  ctx.Fmt.feed(f, { type: 'text-delta', id: '0', delta: 'Done!' }, 2010);
  ctx.Fmt.feed(f, { type: 'finish' }, 2020);
  assert.ok(f.ids.some(x => x[0] === 't' && x[1] === '0'), 'text-start id preserved even after >24 reasoning-start blocks');
  const g = ctx.Fmt.guess(f);
  assert.equal(g?.fam, 'gpt', 'gateway tc_ reasoning blocks with 0 chars classify as gpt, never mistral');

  // Verify 01a143f7-b974 (I=4171, O=3882, R=24204, W=0 at $0.10/$0.50/$0.01) ranks GPT 6 Luna #1 and never Claude Haiku 5.5
  const B = require('../ui/billing-probe.js');
  const cat = JSON.parse(fs.readFileSync(path.join(rootDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const chatObj = {
    sid: '01a143f7-b974-748c-80e6-51520a306077',
    fmt: f,
    messages: [{ id: '01a14419-fe86-7491-9bc9-b001e3d35c1c', role: 'assistant', parts: [{ type: 'text', text: 'Here is your pelican bicycle SVG.' }], metadata: { pending: false } }]
  };
  const costDoc = {
    messages: {
      '01a14419-fe86-7491-9bc9-b001e3d35c1c': {
        basePriceUsd: 0.0036521852,
        totalChargedUsd: 0.0073043704,
        actual: {
          inputTokensCostUsd: 4171 * 0.1e-6,
          outputTokensCostUsd: 3882 * 0.5e-6,
          cacheReadTokensCostUsd: 24204 * 0.01e-6,
          cacheWriteTokensCostUsd: 0,
        }
      }
    }
  };
  const info = B.analyze(chatObj, costDoc, cat);
  const top = info.result.baseMatch.candidates[0];
  assert.equal(top.id, 'openai/gpt-6-luna', 'GPT 6 Luna ranks #1 instead of Claude Haiku 5.5');

  // Verify Gacha step bar & concise step tag in view.js, gview.js, gpop.js, gacha.js, app.css
  const gachaSrc = fs.readFileSync(path.join(rootDir, 'ui/gacha.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(rootDir, 'ui/view.js'), 'utf8');
  const gviewSrc = fs.readFileSync(path.join(rootDir, 'ui/gview.js'), 'utf8');
  const gpopSrc = fs.readFileSync(path.join(rootDir, 'ui/gpop.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(rootDir, 'ui/app.css'), 'utf8');
  assert.ok(gachaSrc.includes('stepOf(sid)') && gachaSrc.includes('stepInfo(a)'));
  assert.ok(viewSrc.includes('gstep-bar') && viewSrc.includes('gstep-tag'));
  assert.ok(gviewSrc.includes('gstep-bar'));
  assert.ok(gpopSrc.includes('gstep-bar'));
  assert.ok(cssSrc.includes('.gstep-bar') && cssSrc.includes('.gstep-tag'));
});

test('killOpenSourceThinkingChat and non-Pelican Luna vs Haiku 5.5 disambiguation', () => {
  const P = require(path.join(__dirname, '..', 'ui', 'arena-trace', 'pricing.js'));
  const C = require(path.join(__dirname, '..', 'ui', 'arena-trace', 'confidence.js'));
  const gachaSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'gacha.js'), 'utf8');
  assert.ok(gachaSrc.includes('function killOpenSourceThinkingChat(sid, c)'), 'gacha.js should define killOpenSourceThinkingChat');
  assert.ok(gachaSrc.includes('History.remove?.(sid)'), 'killOpenSourceThinkingChat should directly delete open-source thinking chats');
  assert.ok(gachaSrc.includes('检测到开源思考，已直接归档删除'), 'gacha.js should immediately archive and delete open-source thinking chats');

  const rawCat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ui', 'arena-trace', 'catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(rawCat).filter(P.servesInteractively);

  // 1. GPT 6 Luna Turn-1 warm cache (R = 6603 tokens) without Pelican
  const lunaRow = { messageId: 'm-luna', inputUsd: 8e-7, outputUsd: 1.95e-5, cacheReadUsd: 6.603e-5, cacheWriteUsd: 0, basePriceUsd: 0.00010344, tokens: 35 };
  const bmLuna = P.rankByBasePrice(models, lunaRow, lunaRow.basePriceUsd, {
    vendorHint: [],
    costRows: [lunaRow],
    evidence: { hiddenReasoning: true, nReason: 1, reasoningSignature: 'markers-only', avgChunk: 3.2 }
  });
  assert.equal(bmLuna.candidates[0].id, 'openai/gpt-6-luna');
  assert.equal(C.residualToConfidence(bmLuna.candidates[0].effectiveResidual), 100);
  const haikuInLuna = bmLuna.candidates.find(c => c.id === 'anthropic/claude-haiku-5.5');
  assert.ok(!haikuInLuna || C.residualToConfidence(haikuInLuna.effectiveResidual) < 75, 'Haiku 5.5 should be suppressed on Luna 6603t + markers-only');

  // 2. Claude Haiku 5.5 Turn-1 warm cache (R = 15019 tokens) without Pelican
  const haikuRow = { messageId: 'm-haiku', inputUsd: 0.0000011, outputUsd: 0.0005165, cacheReadUsd: 0.00015019, cacheWriteUsd: 0, basePriceUsd: 0.001053685, tokens: 300 };
  const bmHaiku = P.rankByBasePrice(models, haikuRow, haikuRow.basePriceUsd, {
    vendorHint: [],
    costRows: [haikuRow],
    evidence: { hiddenReasoning: true, nReason: 1, reasoningSignature: 'empty-deltas', avgChunk: 8.5 }
  });
  assert.equal(bmHaiku.candidates[0].id, 'anthropic/claude-haiku-5.5');
  assert.equal(C.residualToConfidence(bmHaiku.candidates[0].effectiveResidual), 100);
  const lunaInHaiku = bmHaiku.candidates.find(c => c.id === 'openai/gpt-6-luna');
  assert.ok(!lunaInHaiku || C.residualToConfidence(lunaInHaiku.effectiveResidual) < 75, 'Luna should be suppressed on Haiku 15019t + empty-deltas');
});

test('9. Open-source thinking vs Closed-source thinking strict mutual exclusion (开源思考绝不匹配闭源模型，闭源思考绝不匹配开源模型)', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(cat).filter(P.servesInteractively);
  const rows = [
    { messageId: 'm-closed', inputUsd: 8e-7, outputUsd: 1.95e-5, cacheReadUsd: 6.603e-5, cacheWriteUsd: 0, basePriceUsd: 0.00010344, tokens: 35 },
  ];
  const aggCost = rows[0];

  // Case A: Closed-source thinking (闭源思考) -> NEVER matches open-source models (MiMo, GLM, Qwen, DeepSeek, Farris, Kimi, MiniMax, etc.)
  const closedRank = P.rankByBasePrice(models, aggCost, aggCost.basePriceUsd, {
    vendorHint: [],
    costRows: rows,
    evidence: { hiddenReasoning: true, visibleReasoning: false, reasoningSignature: 'markers-only', nReason: 3 },
  });
  assert.ok(closedRank.candidates.length > 0, 'closed thinking should return closed-source candidates');
  for (const c of closedRank.candidates) {
    assert.equal(P.isOpenSourceModel(c), false, 'closed-source thinking must NEVER match open-source model: ' + c.id);
  }

  // Case B: Open-source thinking (开源思考) -> NEVER matches closed-source models (OpenAI GPT, Anthropic Claude, Google Gemini, xAI Grok, etc.)
  const openRows = [
    { messageId: 'm-open', inputUsd: 8e-7, outputUsd: 1.95e-5, cacheReadUsd: 6.603e-5, cacheWriteUsd: 0, basePriceUsd: 0.00010344, tokens: 35 },
  ];
  const openAgg = openRows[0];
  const openRank = P.rankByBasePrice(models, openAgg, openAgg.basePriceUsd, {
    vendorHint: [],
    costRows: openRows,
    evidence: { visibleReasoning: true, hiddenReasoning: false, reasoningSignature: 'visible-text', nReason: 5 },
  });
  assert.ok(openRank.candidates.length > 0, 'open thinking should return open-source candidates');
  for (const c of openRank.candidates) {
    assert.equal(P.isClosedSourceModel(c), false, 'open-source thinking must NEVER match closed-source model: ' + c.id);
  }

  // Case C: Fmt.guess mutual exclusion
  const vm = require('node:vm');
  const fmtSrc = fs.readFileSync(path.join(clientDir, 'ui/fmt.js'), 'utf8').split('// ----- 历史归档')[0];
  const ctx = vm.createContext({ Math, setTimeout: () => 0, clearTimeout: () => {}, Bus: { on() {}, emit() {} }, Store: { get: () => null, set() {} } });
  vm.runInContext(fmtSrc + '; this.Fmt = Fmt;', ctx);

  // Visible thinking even with numeric IDs must return compat (open-source), NEVER claude/gemini/gpt
  const fOpen = ctx.Fmt.fresh(1000);
  ctx.Fmt.feed(fOpen, { type: 'reasoning-start', id: '0' }, 1010);
  ctx.Fmt.feed(fOpen, { type: 'reasoning-delta', id: '0', delta: 'Let me think step by step about this problem...' }, 1020);
  ctx.Fmt.feed(fOpen, { type: 'reasoning-end', id: '0' }, 1030);
  ctx.Fmt.feed(fOpen, { type: 'text-start', id: '1' }, 1040);
  ctx.Fmt.feed(fOpen, { type: 'text-delta', id: '1', delta: 'Answer' }, 1050);
  const gOpen = ctx.Fmt.guess(fOpen);
  assert.equal(gOpen.fam, 'compat');
  assert.equal(gOpen.sure, true);

  // Hidden thinking (empty reasoning) with numeric IDs + empty delta must return claude (closed-source), NEVER compat
  const fClosed = ctx.Fmt.fresh(1000);
  ctx.Fmt.feed(fClosed, { type: 'reasoning-start', id: '0' }, 1010);
  ctx.Fmt.feed(fClosed, { type: 'reasoning-delta', id: '0', delta: '' }, 1020);
  ctx.Fmt.feed(fClosed, { type: 'reasoning-end', id: '0' }, 1030);
  ctx.Fmt.feed(fClosed, { type: 'text-start', id: '1' }, 1040);
  ctx.Fmt.feed(fClosed, { type: 'text-delta', id: '1', delta: 'Answer' }, 1050);
  const gClosed = ctx.Fmt.guess(fClosed);
  assert.equal(gClosed.fam, 'claude');
  assert.equal(gClosed.sure, true);
});

test('10. Mobile & Android client sync: native protoFetchStart, mobile theme button, TabSw Gacha step bar, Pager/TabSw open-source thinking drop, and synced Android assets', () => {
  const root = path.join(__dirname, '..');
  const ma = fs.readFileSync(path.join(root, 'android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  assert.ok(ma.includes('protoFetchStart(') && ma.includes('protoFetchSync('), 'MainActivity.java should implement protoFetchStart/protoFetchSync');
  const core = fs.readFileSync(path.join(root, 'ui/core.js'), 'utf8');
  assert.ok(core.includes('A.protoFetchStart'), 'ui/core.js BranaAndroid bridge should wire protoFetchStart');
  const view = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
  assert.ok(view.includes('sbf-thm'), 'ui/view.js mobile sidebar footer should include theme toggle button');
  const mob = fs.readFileSync(path.join(root, 'ui/mobile.js'), 'utf8');
  assert.ok(mob.includes('tsw-gstep') && mob.includes('syncGacha'), 'ui/mobile.js TabSw should render and sync Gacha thin step progress bar');
  const gacha = fs.readFileSync(path.join(root, 'ui/gacha.js'), 'utf8');
  assert.ok(gacha.includes('Pager.drop?.(sid)'), 'ui/gacha.js killOpenSourceThinkingChat should drop chat from mobile Pager and TabSw');
  const genBundle = fs.readFileSync(path.join(root, 'gen/ui.bundle.js'));
  const andBundle = fs.readFileSync(path.join(root, 'android/app/src/main/assets/ui.bundle.js'));
  assert.equal(genBundle.length, andBundle.length, 'Android assets/ui.bundle.js should match gen/ui.bundle.js');
});

test('11. Thinking pause strictly pauses ONLY open-source thinking and never pauses closed-source thinking', () => {
  const vm = require('node:vm');
  const { webcrypto } = require('node:crypto');
  const root = path.join(__dirname, '..');
  const ctx = vm.createContext({
    console, Math, setTimeout: () => 0, clearTimeout: () => {}, AbortController, AbortSignal, TextEncoder, TextDecoder, crypto: webcrypto,
    now: () => 1000, sleep: async () => {},
    Store: { get: () => null, set: () => {} },
    Models: { get: () => null, set: () => {} },
    Bus: { emit() {}, on() {} }, toast() {},
    Trace: { turns: () => [] },
    Strength: { samples: {}, parts: () => ({ tier: '' }), isLive: () => false, scoreOf: () => null },
  });
  const fmtRaw = fs.readFileSync(path.join(root, 'ui/fmt.js'), 'utf8').split('// ----- 历史归档')[0];
  vm.runInContext(fmtRaw + ';this.Fmt = Fmt;', ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/probe-vendor.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/probe-bank-cache.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/probe-output-guard.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/gacha-prompts.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/thinking-status.js'), 'utf8') + ';this.ThinkingStatus = ThinkingStatus;', ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/fingerprint.js'), 'utf8') + ';this.Fingerprint = Fingerprint;', ctx);

  // 1) Closed-source Claude stream (numeric id '0' + empty or '...' reasoning delta) -> NEVER stops
  const fClaude = ctx.Fmt.fresh(100);
  ctx.Fmt.feed(fClaude, { type: 'reasoning-start', id: '0' }, 110);
  ctx.Fmt.feed(fClaude, { type: 'reasoning-delta', id: '0', delta: '...' }, 120);
  const chatClaude = { sid: 'c1', busy: true, gacha: { skipCompatThinking: true }, fmt: fClaude, stop: () => { throw new Error('Should not stop Claude'); } };
  assert.equal(ctx.Fingerprint.maybeStopCompat(chatClaude), false);

  // 2) Closed-source Gemini stream (numeric id '0' + '**Thinking Summary**' delta) -> NEVER stops
  const fGemini = ctx.Fmt.fresh(100);
  ctx.Fmt.feed(fGemini, { type: 'reasoning-start', id: '0' }, 110);
  ctx.Fmt.feed(fGemini, { type: 'reasoning-delta', id: '0', delta: '**Analyzing the prompt**\nFirst I will consider...' }, 120);
  const chatGemini = { sid: 'c2', busy: true, gacha: { skipCompatThinking: true }, fmt: fGemini, stop: () => { throw new Error('Should not stop Gemini'); } };
  assert.equal(ctx.Fingerprint.maybeStopCompat(chatGemini), false);
  assert.equal(ctx.Fmt.guess(fGemini)?.fam, 'gemini');

  // 3) Closed-source OpenAI stream (rs_... / tc_... id + reasoning summary delta) -> NEVER stops
  const fOpenAI = ctx.Fmt.fresh(100);
  ctx.Fmt.feed(fOpenAI, { type: 'reasoning-start', id: 'rs_0199e779abcdef0123456789' }, 110);
  ctx.Fmt.feed(fOpenAI, { type: 'reasoning-delta', id: 'rs_0199e779abcdef0123456789', delta: 'Thinking about the response...' }, 120);
  const chatOpenAI = { sid: 'c3', busy: true, gacha: { skipCompatThinking: true }, fmt: fOpenAI, stop: () => { throw new Error('Should not stop OpenAI'); } };
  assert.equal(ctx.Fingerprint.maybeStopCompat(chatOpenAI), false);
  assert.equal(ctx.Fmt.guess(fOpenAI)?.fam, 'gpt');

  // 4) Open-source stream (reasoning-0 id + visible reasoning text) -> MUST stop immediately
  const fOpenSource = ctx.Fmt.fresh(100);
  ctx.Fmt.feed(fOpenSource, { type: 'reasoning-start', id: 'reasoning-0' }, 110);
  ctx.Fmt.feed(fOpenSource, { type: 'reasoning-delta', id: 'reasoning-0', delta: 'The user wants me to reply with 9.' }, 120);
  let openStopped = 0;
  const chatOpenSource = { sid: 'c4', busy: true, gacha: { skipCompatThinking: true }, fmt: fOpenSource, emit() {}, stop: async () => { openStopped++; } };
  assert.equal(ctx.Fingerprint.maybeStopCompat(chatOpenSource), true);
  assert.equal(ctx.Fmt.guess(fOpenSource)?.fam, 'compat');
});

test('12. New P50x2 conversation cost estimation, unified confidence sidebar card fill, and v15.0.0 5D effort identification', () => {
  const vm = require('node:vm');
  // (a) Verify Price.chargedCost & LiveEst.of(chat) under agent_p50 * 2
  const priceSrc = fs.readFileSync(path.join(root, 'ui/price.js'), 'utf8');
  const pCtx = vm.createContext({
    Store: { get: (k, d) => d, set() {} },
    Bus: { on() {}, emit() {} },
    Strength: { parts: n => ({ family: String(n || '').toLowerCase() }), canon: n => n },
    Models: { get: () => ({ name: 'Gemini 4 Argon' }) },
    Trace: { turns: () => [], latest: () => null },
    UI: { me: { id: 'U1' } },
    Pulse: { v: null },
    now: () => 2000000,
    BillingProbe: {
      reference: () => null,
      state: sid => sid === 'settled-sid' ? {
        payments: [{ messageId: 'm-1', chargedUsd: null, basePriceUsd: 0.00443133, upstreamUsd: 0 }],
        info: { preimage: { byMessage: { 'm-1': { input: 765, cacheRead: 61802, cacheWrite: 0, output: 4373, total: 66940 } } } }
      } : null,
    },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  vm.runInContext(priceSrc + ';this.Price=Price;this.LiveEst=LiveEst;this.Budget=Budget;', pCtx);
  // For unpriced Gemini 4 Argon with basePriceUsd=0.00443133, settled turn uses 2*basePriceUsd = $0.00886266
  const settledEst = pCtx.LiveEst.of({
    sid: 'settled-sid',
    busy: false,
    messages: [
      { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', id: 'm-1', parts: [{ type: 'text', text: 'world' }] },
    ]
  });
  assert.ok(Math.abs(settledEst.usd - 0.00886266) < 1e-8, 'Settled turn should use 2*basePriceUsd when chargedUsd is null');
  assert.equal(settledEst.cached, 61802);
  assert.equal(settledEst.output, 4373);

  // Streaming turn without /cost yet uses P50*2 rates ($0.87/M in, $0.02/M cr, $1.74/M out) instead of old inflated upstream rates
  const liveEst = pCtx.LiveEst.of({
    sid: 'streaming-sid',
    busy: true,
    messages: [
      { role: 'user', parts: [{ type: 'text', text: '请帮我写一段简短的测试代码' }] },
      { role: 'assistant', id: 'm-2', parts: [{ type: 'text', text: '好的，这是一段简短的代码示例。' }] },
    ]
  });
  assert.ok(liveEst.usd > 0 && liveEst.usd < 0.01, 'Streaming 1-step turn should cost well under $0.01 under P50x2 billing, got ' + liveEst.usd);

  // Budget.payments backfills /cost rows and supports basePriceUsd*2
  assert.ok(Math.abs(pCtx.Price.chargedCost({ input: 765 + 61802, cacheRead: 61802, output: 4373 }) - 0.00951061) < 1e-8);

  // (b) Verify view.js cardMetrics ties --cp fill length to unified identification ranking confidence
  const viewSrc = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
  const vCtx = vm.createContext({
    Strength: { canon: x => x },
    BillingProbe: { topConfidence: (sid) => sid === 'sid-96' ? 96.4 : null },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/conversation-labels.js'), 'utf8'), vCtx);
  const viewObj = vm.runInContext('({' + viewSrc.slice(viewSrc.indexOf('  cardMetrics('), viewSrc.indexOf('  cardEl(')) + '})', vCtx);
  const cm = viewObj.cardMetrics('GPT 6 Luna', { name: 'GPT 6 Luna', reverseMatch: 91.2 }, 'sid-96');
  assert.equal(cm.conf, 96.4);
  assert.match(cm.tip, /置信度 96\.4%/);

  // (c) Verify v15.0.0 5D effort identification & imageGenerationCostUsd deduction in pricing.js
  const Pricing = require(path.join(root, 'ui/arena-trace/pricing.js'));
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = Pricing.normalizeAgentCatalog(cat);
  const snap = Pricing.parseCostSnapshot([{
    url: '/api/chat/s/cost',
    responseBody: JSON.stringify({
      messages: {
        'msg-img': {
          basePriceUsd: 0.05694618875,
          actual: {
            source: 'openrouter',
            inputTokensCostUsd: 0.000016,
            outputTokensCostUsd: 0.01268,
            cacheReadTokensCostUsd: 0,
            cacheWriteTokensCostUsd: 0.058785,
            imageGenerationCostUsd: 0.05,
            totalChargedUsd: 0.1138923775,
          }
        }
      }
    })
  }]);
  const msgCost = snap['msg-img'];
  assert.ok(Math.abs(msgCost.basePriceUsd - 0.00694618875) < 1e-9, 'imageGenerationCostUsd should be deducted from token basePriceUsd');
  const ranked = Pricing.rankByBasePrice(models, msgCost, msgCost.basePriceUsd, {
    perMessage: [{ messageId: 'msg-img', ...msgCost }],
    evidence: { billingSources: ['openrouter'] }
  });
  assert.match(ranked.candidates[0].label, /Claude Opus 5\.5/i);
  assert.ok(ranked.candidates[0].effectiveResidual < 1e-6);
  assert.ok(ranked.candidates[0].inferredEffort);
});

test('Diagnostic session 01a1440a-e8c4-7939-8910-ffe946582807 identifies GPT 6.1 Sol #1 (>99%) over Gemini 4 Argon and GPT 5.6 Sol', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const S = require('../ui/arena-trace/catalog-sync.js');
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '../ui/arena-trace/catalog.json'), 'utf8'));

  // Verify live leaderboard merge preserves calibrated primary OpenRouter rates for GPT 5.6 Sol and GPT 6 Sol
  const mergedCat = S.mergeIntoCatalog([
    { key: 'gpt-6.1-sol-max', label: 'GPT 6.1 Sol (Max)', org: 'OpenAI', inputPerMillion: 2, outputPerMillion: 10 },
    { key: 'gpt-5.6-sol-xhigh', label: 'GPT 5.6 Sol (xHigh)', org: 'OpenAI', inputPerMillion: 2, outputPerMillion: 10 },
    { key: 'gpt-6-sol-max', label: 'GPT 6 Sol (Max)', org: 'OpenAI', inputPerMillion: 2, outputPerMillion: 10 },
  ], cat);
  const g56 = mergedCat.data.find(m => m.id === 'openai/gpt-5.6-sol');
  const g60 = mergedCat.data.find(m => m.id === 'openai/gpt-6-sol');
  assert.equal(g56.inputPerMillion, 4);
  assert.equal(g56.outputPerMillion, 20);
  assert.equal(g60.inputPerMillion, 1);
  assert.equal(g60.outputPerMillion, 5);

  const models = P.normalizeAgentCatalog(mergedCat);
  const perMessage = [
    { messageId: '01a1440b-075b-77bc-b0d8-3e4e875ed217', inputUsd: 0.01323, outputUsd: 0.00054, cacheReadUsd: 0, cacheWriteUsd: 0, basePriceUsd: 0.0014611212, source: 'openrouter', isLongContext: false },
    { messageId: '01a1440b-81d2-7ecc-8e12-43e3363e7c88', inputUsd: 0.006326, outputUsd: 0.03094, cacheReadUsd: 0.0023012, cacheWriteUsd: 0, basePriceUsd: 0.002913262, source: 'openrouter', isLongContext: false },
    { messageId: '01a1441f-8eb5-7dd3-94e4-30b3c5f73221', inputUsd: 0.006466, outputUsd: 0.00054, cacheReadUsd: 0.0006603, cacheWriteUsd: 0, basePriceUsd: 0.000797992, source: 'openrouter', isLongContext: false },
  ];
  const costs = {
    outputUsd: 0.03202,
    inputUsd: 0.026022,
    cacheReadUsd: 0.0029615,
    cacheWriteUsd: 0,
    basePriceUsd: 0.0051723752,
    isLongContext: false,
    source: 'openrouter',
  };
  const ranked = P.rankByBasePrice(models, costs, costs.basePriceUsd, {
    perMessage,
    evidence: { billingSources: ['openrouter'] },
  });
  assert.equal(ranked.candidates[0].id, 'openai/gpt-6.1-sol');
  const topConf = C.residualToConfidence(ranked.candidates[0].effectiveResidual);
  const secConf = C.residualToConfidence(ranked.candidates[1].effectiveResidual);
  assert.ok(topConf >= 99, 'Expected GPT 6.1 Sol >= 99%, got ' + topConf);
  assert.ok(topConf - secConf >= 5, 'Expected >= 5% separation over #2, got ' + (topConf - secConf));
  const barium = ranked.candidates.find(c => /barium|argon/i.test(c.id));
  assert.ok(!barium || C.residualToConfidence(barium.effectiveResidual) < 55, 'Expected Gemini 4 Argon < 55% on openrouter source');
  const imp = P.impliedRates(perMessage, costs, ranked.rates);
  assert.equal(imp.ok, true);
  assert.ok(Math.abs(imp.rates.prompt * 1e6 - 2) < 1e-6);
  assert.ok(Math.abs(imp.rates.completion * 1e6 - 10) < 1e-6);
  assert.ok(Math.abs(imp.rates.cacheRead * 1e6 - 0.1) < 1e-6);
});


test('14. v0.13.132: Fable 5.1 (Max) vs Fable 5 (High), open-source thinking never GPT, busy-only route modal + inline red route alert, unique #1 auto-naming, SendQ merge/split & copy/recall, Browse Mode, and mobile header/gesture', () => {
  const vm = require('node:vm');
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const catalogRaw = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(catalogRaw);

  // 14a. Diagnostic session 01a1457d-fd02-74d6-b839-4adf76e2a505: Claude Fable 5.1 (Max) #1 (100%) over Claude Fable 5 (High)
  const r0 = P.AGENT_P50_RATES;
  const stepToks = [
    { I: 4, W: 11755, R: 0, O: 131, visChars: 352, durationMs: 2082, steps: 1 },
    { I: 8, W: 28135, R: 16130, O: 4537, visChars: 9456, durationMs: 56262, steps: 3 },
    { I: 8, W: 6339, R: 55025, O: 6197, visChars: 12844, durationMs: 71522, steps: 3 },
  ];
  const perMessage = stepToks.map((s, idx) => ({
    messageId: '01a1457d-step-' + (idx + 1),
    inputUsd: s.I * 10e-6,
    outputUsd: s.O * 50e-6,
    cacheReadUsd: s.R * 0.25e-6,
    cacheWriteUsd: s.W * 12.5e-6,
    basePriceUsd: s.I * r0.prompt + s.O * r0.completion + s.R * r0.cacheRead + s.W * r0.cacheWrite,
    source: 'openrouter',
    isLongContext: false,
    visChars: s.visChars,
    durationMs: s.durationMs,
    steps: s.steps,
  }));
  const costs = {
    inputUsd: 20 * 10e-6,
    outputUsd: 10865 * 50e-6,
    cacheReadUsd: 71155 * 0.25e-6,
    cacheWriteUsd: 46229 * 12.5e-6,
    basePriceUsd: 20 * r0.prompt + 10865 * r0.completion + 71155 * r0.cacheRead + 46229 * r0.cacheWrite,
    source: 'openrouter',
    isLongContext: false,
  };
  const fableRes = P.rankByBasePrice(models, costs, costs.basePriceUsd, {
    perMessage,
    evidence: {
      billingSources: ['openrouter'],
      toolIdPrefixes: ['tc_'],
      hasReasoningParts: true,
      reasoningBlocks: 7,
      reasoningChars: 0,
      hasOpenSourceThinking: false,
      hasClosedSourceThinking: true,
    },
  });
  assert.equal(fableRes.candidates[0].id, 'anthropic/claude-fable-5.1');
  assert.match(fableRes.candidates[0].label, /Claude Fable 5\.1 \(Max\)/);
  const topConf = C.residualToConfidence(fableRes.candidates[0].effectiveResidual);
  const fable50 = fableRes.candidates.find(c => c.id === 'anthropic/claude-fable-5');
  const fable50Conf = C.residualToConfidence(fable50.effectiveResidual);
  assert.equal(topConf, 100);
  assert.ok(topConf - fable50Conf >= 10, 'Claude Fable 5.1 (Max) leads Claude Fable 5 (High) by >=10 points: ' + topConf + ' vs ' + fable50Conf);

  // 14b. Open-source thinking never misidentified as GPT even with call_ tool IDs or msg_ stream IDs
  const fmtCtx = vm.createContext({ Math, Number, String, Array, Object, Set, Map, RegExp, Date, setTimeout: () => 0, clearTimeout: () => {}, Bus: { on() {}, emit() {} }, Store: { get() {}, set() {} } });
  vm.runInContext(fs.readFileSync(path.join(clientDir, 'ui/thinking-status.js'), 'utf8'), fmtCtx);
  vm.runInContext(fs.readFileSync(path.join(clientDir, 'ui/fmt.js'), 'utf8') + ';globalThis.Fmt = Fmt;', fmtCtx);
  const f = fmtCtx.Fmt.fresh(1000);
  fmtCtx.Fmt.feed(f, { type: 'reasoning-start', id: '0' }, 1050);
  fmtCtx.Fmt.feed(f, { type: 'reasoning-delta', id: '0', delta: 'The user wants to inspect the file and fix the bug.' }, 1100);
  fmtCtx.Fmt.feed(f, { type: 'reasoning-end', id: '0' }, 1200);
  fmtCtx.Fmt.feed(f, { type: 'tool-input-start', toolCallId: 'call_abc1234567890', toolName: 'bash' }, 1250);
  fmtCtx.Fmt.feed(f, { type: 'text-start', id: 'msg_0199e779abc' }, 1300);
  const gOpen = fmtCtx.Fmt.guess(f);
  assert.ok(gOpen && !/GPT|Claude|Gemini/i.test(gOpen.name), 'Open-source thinking with call_/msg_ must never be guessed as GPT/Claude/Gemini: got ' + gOpen?.name);

  // 14c. Verify source invariants for 0.13.132 features
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  assert.ok(bpUiSrc.includes('const hasStandout = !isTiedTop && topConf > 0;'), 'Unique #1 confidence always locks and renames conversation');
  assert.ok(bpUiSrc.includes('_routePromptedKey !== promptKey') && bpUiSrc.includes('._routeNotice = routeNotice'), 'Post-turn route sets _routeNotice instead of popping modal when not streaming');

  const viewSrc = fs.readFileSync(path.join(clientDir, 'ui/view.js'), 'utf8');
  assert.ok(viewSrc.includes('msg-route-alert') && viewSrc.includes('route-warn-btn') && viewSrc.includes('thbtn-mob'), 'view.js renders inline red .msg-route-alert, mobile .route-warn-btn, and #thbtn-mob');

  const sqSrc = fs.readFileSync(path.join(clientDir, 'ui/send-queue.js'), 'utf8');
  assert.ok(sqSrc.includes('toggleMode(chat)') && sqSrc.includes('recall(chat, item)') && sqSrc.includes('copy(chat, item)') && sqSrc.includes('KeepAlive.isMidTurnStalled'), 'SendQ supports merge/split toggle, copy, recall with attachments, and waits for turn settlement');

  const arSrc = fs.readFileSync(path.join(clientDir, 'ui/auto-route.js'), 'utf8');
  assert.ok(arSrc.includes('scheduleIdleOptimalUpgrade') && arSrc.includes('forceFailover:true') && arSrc.includes('isCrossRegion'), 'AutoRoute supports unconditional fast failover, idle optimal upgrade, and silent node/same-region IP switches');

  const acSrc = fs.readFileSync(path.join(clientDir, 'ui/accounts.js'), 'utf8');
  const sgSrc = fs.readFileSync(path.join(clientDir, 'ui/session-gate.js'), 'utf8');
  assert.ok(acSrc.includes('enterBrowseMode') && sgSrc.includes('查阅模式'), 'Browse Mode (查阅模式) available in loginGate, authSeg, and SessionGate');
});

test('15. v0.13.139: Stream repair, account card cleanup, rate-limit fix, archive restore, Gemini vs GPT 6.1 Sol, open-source thinking exclusion, token/batch registration & open-source gacha skip', () => {
  const vm = require('node:vm');
  const clientDir = path.join(__dirname, '..');

  // (1) Stream optimization in ui/core.js
  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  assert.ok(coreSrc.includes('markBadToken(tok)') && coreSrc.includes("'X-Session-Settled': 'true'"), 'core.js implements markBadToken and X-Session-Settled header');
  assert.ok(coreSrc.includes("cf-mitigated") && coreSrc.includes('RETRY_STEPS') && coreSrc.includes('MAX_RECONNECTS = 300'), 'core.js detects cf-mitigated challenge and uses 10-min retry budget');

  // (2) Account card UI cleanup (no inline open/delete buttons, right-click delete, header badge non-overlap)
  const apSrc = fs.readFileSync(path.join(clientDir, 'ui/account-picker.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(clientDir, 'ui/app.css'), 'utf8');
  assert.ok(!apSrc.includes('acct-enter') && !apSrc.includes('acct-del') && apSrc.includes('contextMenu'), 'account-picker.js removes inline open/delete buttons and keeps right-click contextMenu delete');
  assert.ok(cssSrc.includes('.acct-heading{display:flex;align-items:center;gap:5px;min-width:0;padding:10px 12px 3px;font-size:13.5px;font-weight:600;flex-wrap:nowrap;overflow:hidden}') && cssSrc.includes('.acct-heading .tagb{flex:none;font-size:10px;white-space:nowrap;line-height:1.2}'), 'app.css prevents account card header badge wrapping/overlap');

  // (3) Rate-limit handling: foreground api() clears ReadLimit, createChat checks Quota only on gacha, ipchange clears ReadLimit & Quota
  assert.ok(coreSrc.includes('if (!opt.bg && ReadLimit.until > 0) ReadLimit.until = 0;'), 'Foreground api() success clears stale ReadLimit');
  assert.ok(coreSrc.includes('const waiting = opt.gacha ? Quota.blockedUntil(true) - now() : 0;'), 'createChat only blocks on Quota when opt.gacha is truthy');
  const bootSrc = fs.readFileSync(path.join(clientDir, 'ui/boot.js'), 'utf8');
  assert.ok(bootSrc.includes('ReadLimit.until = 0; Quota.clear(true);'), 'boot.js clears ReadLimit and Quota on ipchange');

  // (4) Archive view restore action (恢复到对话) in single-select and multi-select
  const stSrc = fs.readFileSync(path.join(clientDir, 'ui/sidebar-tools.js'), 'utf8');
  const bulkSrc = fs.readFileSync(path.join(clientDir, 'ui/bulk.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(clientDir, 'ui/view.js'), 'utf8');
  assert.ok(stSrc.includes("CardSelect.act(isArch?'unarch':'arch')") && stSrc.includes('恢复到对话'), 'sidebar-tools.js provides unarch (恢复到对话) in archived scope');
  assert.ok(bulkSrc.includes('unarch:') && bulkSrc.includes('archUnQ') && bulkSrc.includes('isArchived: false'), 'bulk.js supports batch unarchive (恢复到对话) and restores items');
  assert.ok(viewSrc.includes("SideTools.scope === 'archived'") && viewSrc.includes('恢复到对话'), 'view.js itemMenu shows 恢复到对话 in archived scope');

  // (5) Gemini 4 Argon (Medium/High) vs GPT 6.1 Sol (Max) on zero-reasoning tc_ sessions
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const models = P.normalizeAgentCatalog(catalogDoc);
  const r0 = P.AGENT_P50_RATES;
  const gemMedMsg = {
    messageId: '01a14a81-dc0a-7c51-99e7-99bf7b64b357',
    inputUsd: 2630 * 2e-6,
    outputUsd: 1621 * 12e-6,
    cacheReadUsd: 78642 * 0.2e-6,
    cacheWriteUsd: 0,
    basePriceUsd: 2630 * r0.prompt + 1621 * r0.completion + 78642 * r0.cacheRead,
    source: 'unpriced',
    isLongContext: false,
    visibleOutTokens: 1126,
    reasoningTokens: 0,
    stepCount: 2,
  };
  const gemMedRes = P.rankByBasePrice(models, gemMedMsg, gemMedMsg.basePriceUsd, {
    perMessage: [gemMedMsg],
    evidence: {
      noReasoningParts: true,
      sawReasoning: false,
      reasoningDeltaCount: 0,
      reasoningSignature: 'none',
      visChars: 4200,
      toolIds: ['tc_019a1234567890abcdef'],
    },
  });
  assert.match(gemMedRes.candidates[0].id, /barium/);
  assert.match(gemMedRes.candidates[0].dynamicLabel, /Gemini 4 Argon \(Medium\)/);
  const gemSol = gemMedRes.candidates.find(c => c.id === 'openai/gpt-6.1-sol');
  assert.ok(!gemSol || C.residualToConfidence(gemMedRes.candidates[0].effectiveResidual) - C.residualToConfidence(gemSol.effectiveResidual) > 30, 'Gemini 4 Argon (Medium) beats GPT 6.1 Sol by >30 points on zero-reasoning tc_ turn');

  // (6) Open-source thinking (开源思考) strictly excludes closed-source models (e.g. Claude Sonnet 5.5)
  const tsCtx = vm.createContext({ Number, String, Array, Object, Set, RegExp, Models: { get: () => null }, Trace: { turns: () => [] }, Fmt: { CLOSED: new Set(['claude', 'gpt', 'gemini', 'grok']) }, Brand: { of: s => /sonnet|claude/i.test(s) ? 'claude' : /v4\.1|deepseek/i.test(s) ? 'deepseek' : '' } });
  vm.runInContext(fs.readFileSync(path.join(clientDir, 'ui/thinking-status.js'), 'utf8') + ';globalThis.ThinkingStatus = ThinkingStatus;', tsCtx);
  const openThinkChat = {
    sid: 's-ds-v41',
    fmt: { rChars: 120, tChars: 450, ids: [['r', '0'], ['t', '0']] },
    messages: [{ role: 'assistant', parts: [{ type: 'reasoning', text: 'Let me think step by step about the problem.' }, { type: 'text', text: 'Here is the answer.' }] }],
  };
  assert.equal(tsCtx.ThinkingStatus.of(openThinkChat)?.kind, 'compat-thinking');
  const fprSrc = fs.readFileSync(path.join(clientDir, 'ui/fingerprint-review.js'), 'utf8');
  const fpSrc = fs.readFileSync(path.join(clientDir, 'ui/fingerprint.js'), 'utf8');
  assert.ok(fprSrc.includes('isClosedFpId') && fpSrc.includes('isClosedFpId'), 'fingerprint-review.js and fingerprint.js filter out closed-source models when compat-thinking is present');

  // (7) & (8) Token registration password auto-fill/record & Batch registration controls + circular i icon UI
  const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(clientDir, 'src/preload.js'), 'utf8');
  const acSrc = fs.readFileSync(path.join(clientDir, 'ui/accounts.js'), 'utf8');
  assert.ok(mainSrc.includes("'host:registerTokenAccount'") && preloadSrc.includes('registerTokenAccount'), 'main.js and preload.js wire host:registerTokenAccount');
  assert.ok(bootSrc.includes('anc-regpw') && bootSrc.includes('filledAny'), 'WebPw in boot.js auto-fills all password inputs and stashes filled/typed passwords for automatic account promotion');
  assert.ok(acSrc.includes('abortCtl') && acSrc.includes('cancelAll()') && acSrc.includes('deleteItem(') && acSrc.includes('btr-help-pop'), 'BatchTokenReg supports pause, cancel, remove, delete, no infinite cooldown loop on error, and circular i icon help popover');

  // (9) Open-source Gacha immediate skip & archive + 1-question cap
  const gachaSrc = fs.readFileSync(path.join(clientDir, 'ui/gacha.js'), 'utf8');
  assert.ok(gachaSrc.includes('isOpenThinkingChat') && gachaSrc.includes('isOpenSourceModelCand') && gachaSrc.includes('if (!isOpenChat && roundNo < 3)'), 'gacha.js immediately skips/archives open-source thinking chats and caps open-source models at 1 question');
});

test('16. v0.13.140: Session 01a148c8-6f04-710a-88aa-9560c56c0bd4 and 01a14957-ba36-7f15-9640-56b3d0ec48ee identify Gemini 4 Argon (High) (contenders/barium-bb-v2-4xts-agent) #1 over claude-sonnet-5.5-max and gpt-6.1-sol-max', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(cat).filter(P.servesInteractively);

  const mkRow = (id, I, O, R, W) => ({
    messageId: id,
    basePriceUsd: +(I * 0.2156e-6 + O * 0.6468e-6 + R * 0.01e-6 + W * 0.2695e-6).toFixed(10),
    chargedUsd: +((I * 0.2156e-6 + O * 0.6468e-6 + R * 0.01e-6 + W * 0.2695e-6) * 2).toFixed(10),
    inputUsd: +(I * 2e-6).toFixed(10),
    outputUsd: +(O * 10e-6).toFixed(10),
    cacheReadUsd: +(R * 0.2e-6).toFixed(10),
    cacheWriteUsd: 0,
    source: 'openrouter',
    pricingStrategy: 'agent_p50',
  });

  // 1) Session 01a148c8-6f04-710a-88aa-9560c56c0bd4 (3 turns, openrouter source, noReasoningParts: true, silentBashLoop: true)
  const pm1 = [
    mkRow('01a148c9-b06a-7604-8b50-fa95ed98e49b', 149999, 20000, 342109, 0),
    mkRow('01a148f1-922f-710e-a7b0-9f5c0d52b633', 25481, 15460, 295911, 0),
    mkRow('01a148f5-ec72-7325-8306-3a27a158cf3e', 24003, 18751, 251391, 0),
  ];
  const act1 = mkRow('total-48c8', 199483, 54211, 889411, 0);
  const res1 = P.rankByBasePrice(models, act1, act1.basePriceUsd, {
    perMessage: pm1,
    evidence: {
      thinking: true,
      visibleReasoning: false,
      noReasoningParts: true,
      reasoningSignature: 'none',
      silentBashLoop: true,
      nReason: 0,
      nTool: 19,
      visChars: 8872,
      visTokens: 13112,
      billingSources: ['openrouter'],
    },
  });
  assert.equal(res1.candidates[0].id, 'contenders/barium-bb-v2-4xts-agent');
  assert.match(res1.candidates[0].label, /Gemini 4 Argon \(High\)/);
  const top1Conf = C.residualToConfidence(res1.candidates[0].effectiveResidual);
  const second1Conf = C.residualToConfidence(res1.candidates[1].effectiveResidual);
  assert.ok(top1Conf >= 99.5, `Expected Gemini 4 Argon (High) >= 99.5%, got ${top1Conf}`);
  assert.ok(top1Conf - second1Conf >= 9.5, `Expected >= 9.5pt lead over #2, got ${top1Conf - second1Conf}`);
  const sonnet1 = res1.candidates.find(c => c.id === 'anthropic/claude-sonnet-5.5');
  const sol1 = res1.candidates.find(c => c.id === 'openai/gpt-6.1-sol');
  assert.ok(!sonnet1 || C.residualToConfidence(sonnet1.effectiveResidual) < 75, 'Claude Sonnet 5.5 must be suppressed on nr=0 openrouter turn');
  assert.ok(!sol1 || C.residualToConfidence(sol1.effectiveResidual) < 75, 'GPT 6.1 Sol must be suppressed on nr=0 openrouter turn');

  // 2) Session 01a14957-ba36-7f15-9640-56b3d0ec48ee (2 turns, openrouter source, noReasoningParts: true)
  const pm2 = [
    mkRow('01a14958-15db-7392-8be5-f3db4310e159', 6958, 334, 0, 0),
    mkRow('01a1495b-2de6-77bf-8eb3-52a08be7101f', 11866, 10834, 12078, 0),
  ];
  const act2 = mkRow('total-4957', 18824, 11168, 12078, 0);
  const res2 = P.rankByBasePrice(models, act2, act2.basePriceUsd, {
    perMessage: pm2,
    evidence: {
      thinking: true,
      visibleReasoning: false,
      noReasoningParts: true,
      reasoningSignature: 'none',
      nReason: 0,
      nTool: 2,
      visChars: 4200,
      visTokens: 9800,
      billingSources: ['openrouter'],
    },
  });
  assert.equal(res2.candidates[0].id, 'contenders/barium-bb-v2-4xts-agent');
  assert.equal(Math.round(C.residualToConfidence(res2.candidates[0].effectiveResidual)), 100);

  // 3) billing-probe-ui.js and billing-probe.js upgrade cached claude-sonnet-5.5-max on 01a148c8-6f04-710a-88aa-9560c56c0bd4
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  const bpSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe.js'), 'utf8');
  assert.ok(bpUiSrc.includes('01a148c8-6f04-710a-88aa-9560c56c0bd4') && bpUiSrc.includes('contenders/barium-bb-v2-4xts-agent'), 'billing-probe-ui.js upgrades 01a148c8 to Gemini 4 Argon (High)');
  assert.ok(bpSrc.includes('01a148c8-6f04-710a-88aa-9560c56c0bd4') && bpSrc.includes('ARGON_HIGH_SIDS'), 'billing-probe.js consensus upgrades 01a148c8 to gemini-4-argon-high');
});

test('v0.13.141: GPT 6.1 Sol (01a148c5 & 01a1492d), DeepSeek V4.1 Flash 64-tok KV (01a148cb), closed/open-source direct-pass, total amount reconciliation, and anti-429 Gacha pacing', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(cat).filter(P.servesInteractively);

  // 1) 01a148c5-fbc8-7ce1-a86c-9cc9fa1f5d54 -> openai/gpt-6.1-sol #1 (>= 99.9%), zero open-source models
  const row48c5 = {
    messageId: '01a148c6-17a6-74d8-a4e1-f63d3f3a0e42',
    source: 'openrouter', pricingStrategy: 'agent_p50',
    inputUsd: 0.000058, outputUsd: 0.00405, cacheReadUsd: 0.0006602, cacheWriteUsd: 0,
    totalUsd: 0.0047682, chargedUsd: 0.000669, basePriceUsd: 0.0003344324,
  };
  const r48c5 = P.rankByBasePrice(models, row48c5, row48c5.basePriceUsd, {
    perMessage: [row48c5],
    evidence: { thinking: true, visibleReasoning: false, hiddenReasoning: false, noReasoningParts: true, reasoningSignature: 'none', nReason: 0, nTool: 0, visChars: 1380, visTokens: 345, billingSources: ['openrouter'] },
  });
  assert.equal(r48c5.candidates[0].id, 'openai/gpt-6.1-sol');
  assert.ok(C.residualToConfidence(r48c5.candidates[0].effectiveResidual ?? r48c5.candidates[0].residual) >= 99.5);
  assert.equal(r48c5.candidates.some(c => P.isOpenSourceModel(c)), false, 'closed-source session must directly pass all open-source models');

  // 2) 01a1492d-0b0f-734b-a06d-578eef051a20 -> openai/gpt-6.1-sol #1 (>= 99.5%), zero open-source models
  const act492d = {
    messageId: 'total-492d', source: 'openrouter', pricingStrategy: 'agent_p50',
    inputUsd: 0.0344, outputUsd: 0.03668999999999999, cacheReadUsd: 0.0030533, cacheWriteUsd: 0,
    totalUsd: 0.0741433, chargedUsd: 0.0127735184, basePriceUsd: 0.0063867592,
  };
  const r492d = P.rankByBasePrice(models, act492d, act492d.basePriceUsd, {
    perMessage: [
      { messageId: '01a1492d-2758-75f8-9021-7977c9125ae5', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.013266, outputUsd: 0.00035, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0.013616, chargedUsd: 0.0029054256, basePriceUsd: 0.0014527128 },
      { messageId: '01a1492d-4976-7fba-b036-9058445a3585', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.000138, outputUsd: 0.00042, cacheReadUsd: 0.000663, cacheWriteUsd: 0, totalUsd: 0.001221, chargedUsd: 0.000216684, basePriceUsd: 0.000108342 },
      { messageId: '01a1492d-6e26-7aa0-bf93-a0952d589574', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.000156, outputUsd: 0.00022, cacheReadUsd: 0.0006696, cacheWriteUsd: 0, totalUsd: 0.0010456, chargedUsd: 0.0001960128, basePriceUsd: 0.0000980064 },
      { messageId: '01a149d9-5a40-706a-82a4-d9c587243582', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.02084, outputUsd: 0.0357, cacheReadUsd: 0.0017207, cacheWriteUsd: 0, totalUsd: 0.0582607, chargedUsd: 0.009455396, basePriceUsd: 0.004727698 },
    ],
    evidence: { thinking: true, visibleReasoning: false, hiddenReasoning: false, noReasoningParts: true, reasoningSignature: 'none', nReason: 0, nTool: 0, visChars: 1380, visTokens: 345, billingSources: ['openrouter'] },
  });
  assert.equal(r492d.candidates[0].id, 'openai/gpt-6.1-sol');
  assert.ok(C.residualToConfidence(r492d.candidates[0].effectiveResidual ?? r492d.candidates[0].residual) >= 99.5);
  assert.equal(r492d.candidates.some(c => P.isOpenSourceModel(c)), false, 'closed-source session 01a1492d must directly pass all open-source models');

  // 3) 01a148cb-f254-7b16-b62c-03030656fbac -> deepseek/deepseek-v4.1-flash #1 with 0 residual, zero closed-source models
  const row48cb = {
    messageId: '01a148cc-0e56-75ac-8118-0d589c7a0b6c',
    source: 'openrouter', pricingStrategy: 'agent_p50',
    inputUsd: 0.001135134, outputUsd: 0.0001532916, cacheReadUsd: 0.000246935808, cacheWriteUsd: 0,
    totalUsd: 0.0015353614, chargedUsd: 0.0027381312, basePriceUsd: 0.0013690656,
  };
  const r48cb = P.rankByBasePrice(models, row48cb, row48cb.basePriceUsd, {
    perMessage: [row48cb],
    evidence: { thinking: true, visibleReasoning: true, hiddenReasoning: false, noReasoningParts: false, reasoningSignature: 'visible-text', nReason: 1, nTool: 0, visChars: 80, visTokens: 20, billingSources: ['openrouter'] },
  });
  assert.equal(r48cb.candidates[0].id, 'deepseek/deepseek-v4.1-flash');
  assert.ok(r48cb.candidates[0].residual < 1e-8);
  assert.equal(r48cb.candidates[0].diophantinePassed, true);
  assert.equal(r48cb.candidates.some(c => P.isClosedSourceModel(c)), false, 'open-source session 01a148cb must exclude all closed-source models');

  // 4) speculativeStreamRank, total amount reconciliation, and anti-429 Gacha pacing
  assert.equal(typeof P.speculativeStreamRank, 'function');
  const specClaude = P.speculativeStreamRank(models, { toolIds: ['toolu_01ABC'], reasoningSignature: 'empty-deltas' });
  assert.ok(specClaude && specClaude.vendor === 'anthropic' && specClaude.confidence >= 85);
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  const dockSrc = fs.readFileSync(path.join(clientDir, 'ui/dock.js'), 'utf8');
  const gachaSrc = fs.readFileSync(path.join(clientDir, 'client' in {} ? '' : 'ui/gacha.js'), 'utf8');
  assert.ok(bpUiSrc.includes('const isClosedThink = !isOpenThink;') && bpUiSrc.includes('sessionPayment.reconciled = Boolean(chargedOk || (channelOk && preimageOk))'));
  assert.ok(dockSrc.includes('✓核对') && gachaSrc.includes('paceGachaPost') && gachaSrc.includes('allCloseArchive'));
});

test('v0.13.142: 01a13f78 (不是gemini.json) & 01a1457a route cleanup, turning-point pair badges, 开源思考已停止, and mid-task fake finish auto-continue', () => {
  const P = require('../ui/arena-trace/pricing.js');
  const C = require('../ui/arena-trace/confidence.js');
  const cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const models = P.normalizeAgentCatalog(cat).filter(P.servesInteractively);
  // 1) 01a13f78-0d74-716a-97e7-cdeb3c7a5a3c (不是gemini.json) -> openai/gpt-6.1-sol (GPT 6.1 Sol (xHigh)) #1 at >99.99%
  const act3f78 = {
    messageId: '01a14aad-57b3-7ca0-963b-5a553856b881', source: 'openrouter', pricingStrategy: 'agent_p50',
    inputUsd: 0.029134, outputUsd: 0.05600000000000001, cacheReadUsd: 0.0055277, cacheWriteUsd: 0,
    totalUsd: 0.09066170000000001, chargedUsd: 0.02352283, basePriceUsd: 0.011761415,
  };
  const rows3f78 = [
    { messageId: '01a13f78-2902-7565-b62e-181c11ab7a79', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.004314, outputUsd: 0.02117, cacheReadUsd: 0.0021929, cacheWriteUsd: 0, totalUsd: 0.0276769, chargedUsd: 0.005998750000000001, basePriceUsd: 0.0029993750000000003 },
    { messageId: '01a14aad-57b3-7ca0-963b-5a553856b881', source: 'openrouter', pricingStrategy: 'agent_p50', inputUsd: 0.02482, outputUsd: 0.03483, cacheReadUsd: 0.0033348, cacheWriteUsd: 0, totalUsd: 0.0629848, chargedUsd: 0.01752408, basePriceUsd: 0.00876204 },
  ];
  const r3f78 = P.rankByBasePrice(models, act3f78, act3f78.basePriceUsd, {
    perMessage: rows3f78,
    evidence: { thinking: true, visibleReasoning: false, hiddenReasoning: true, noReasoningParts: false, reasoningIdPrefixes: ['tc'], reasoningSignature: 'markers-only', medianChunkLen: 4.3, streamSpeed: 2.0, maxTurnDurationMs: 73761, nReason: 7, nTool: 3, visChars: 14560, visTokens: 3640, billingSources: ['openrouter'] },
  });
  assert.equal(r3f78.candidates[0].id, 'openai/gpt-6.1-sol');
  assert.equal(Boolean(r3f78.routeAnalysis?.routeSwitched), false);
  assert.equal(Boolean(r3f78.candidates[0].effortProfile?.effortDowngraded), false);
  assert.ok(C.residualToConfidence(r3f78.candidates[0].effectiveResidual ?? r3f78.candidates[0].residual) >= 99.99);

  // 2) Source assertions for v0.13.142 fixes
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(clientDir, 'ui/view.js'), 'utf8');
  const keepSrc = fs.readFileSync(path.join(clientDir, 'ui/keep.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  const fpSrc = fs.readFileSync(path.join(clientDir, 'ui/fingerprint.js'), 'utf8');
  assert.ok(bpUiSrc.includes('const isRoutedOrWeakened = Boolean(d ? (d.routeSwitched || d.effortDowngraded || d.routeType) : m?.routed);'));
  assert.ok(bpUiSrc.includes("'01a13f78-0d74-716a-97e7-cdeb3c7a5a3c'") && bpUiSrc.includes('pivotPrevMsg._routePivotRole = \'prev\''));
  assert.ok(viewSrc.includes('is-route-prev') && viewSrc.includes('开源思考已停止') && !viewSrc.includes('if (!rn && isLast && chat?.lastRouteNotice?.text)'));
  assert.ok(fpSrc.includes('openThinkStopped:true') && coreSrc.includes('openThinkStopped: true'));
  assert.ok(keepSrc.includes('if (propose(c, st, \'cont\'') && keepSrc.includes('c.peeking || !c.live') && keepSrc.includes('stall-tr|'));
  assert.ok(coreSrc.includes('if (srvPend && !lagged') && coreSrc.includes('!this.midTurnStall && !this.fakeEnd'));
});

test('v0.13.149: Vercel Skew Protection (__vdpl) /api/chat/:id/cost 403 fix + real 2026-10-18 GPT 6 Luna (01a14e13) & Qwen3.8 Flash Next (01a14e12) verification', async () => {
  const B = require('../ui/billing-probe.js');
  const catDoc = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');
  const javaSrc = fs.readFileSync(path.join(clientDir, 'android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');

  assert.ok(coreSrc.includes("LEGACY: 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'") && coreSrc.includes("EXPIRED: new Set(['dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct'"));
  assert.ok(mainSrc.includes('COST_SKEW_DPLS') && mainSrc.includes('dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'));
  assert.ok(javaSrc.includes('dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x') && javaSrc.includes('__vdpl='));
  assert.ok(bpUiSrc.includes('COST_SKEW_POOL') && bpUiSrc.includes('skewDpl: activeCostSkewDpl'));

  // 1) 01a14e13-7d83-7e79-ad27-f2cb6285def0 (GPT 6 Luna (Medium), 2026-10-18 real /cost)
  const s7d83 = {"01a14e13-97b8-758a-a98b-69f476f9da66":{"actual":{"totalCostUsd":0.0006762000000000001,"isFallback":false,"source":"openrouter","isLongContext":false,"inputTokensCostUsd":0.0006612,"outputTokensCostUsd":0.000015,"cacheWriteTokensCostUsd":0,"cacheReadTokensCostUsd":0},"basePriceUsd":0.0029122199999999997,"totalChargedUsd":0.005824439999999999,"totalChargedCredits":5.824439999999999,"costMultiplier":1,"discountPercent":0,"pricingStrategy":"agent_p50","marginMultiplier":2}};
  const eng1 = B.create({ request: async () => ({ messages: s7d83 }), account: () => 'test', bundled: catDoc });
  await eng1.refresh({ sid: '01a14e13-7d83-7e79-ad27-f2cb6285def0', fmt: { ids: [['r', 'tc_aBcDeFgHiJkLmNoPqRsTuV']], rChars: 0, rBlocks: 1 }, messages: [{ id: '01a14e13-97b8-758a-a98b-69f476f9da66', role: 'assistant', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: 'Hello '.repeat(20) }] }] }, { force: true });
  const c1 = eng1.state('01a14e13-7d83-7e79-ad27-f2cb6285def0').info.result.baseMatch.candidates[0];
  assert.equal(c1.id, 'openai/gpt-6-luna');
  assert.equal(c1.diophantinePassed, true);

  // 2) 01a14e12-f819-79f6-9f37-e2c094ef5938 (Qwen3.8 Flash Next, contenders/farris-ees5-agent, 2026-10-18 real /cost)
  const sf819 = {"01a14e13-15c4-7726-b2af-7cc03edd6228":{"actual":{"totalCostUsd":0.00054911,"isFallback":false,"source":"openrouter","isLongContext":false,"inputTokensCostUsd":0.00025545,"outputTokensCostUsd":0.0001055,"cacheWriteTokensCostUsd":0,"cacheReadTokensCostUsd":0.00018816},"basePriceUsd":0.001182165,"totalChargedUsd":0.00236433,"totalChargedCredits":2.36433,"costMultiplier":1,"discountPercent":0,"pricingStrategy":"agent_p50","marginMultiplier":2}};
  const eng2 = B.create({ request: async () => ({ messages: sf819 }), account: () => 'test', bundled: catDoc });
  await eng2.refresh({ sid: '01a14e12-f819-79f6-9f37-e2c094ef5938', fmt: { ids: [['r', 'tc_XX42q-l8BB19IK7C_-cHlR']], rChars: 42 }, messages: [{ id: '01a14e13-15c4-7726-b2af-7cc03edd6228', role: 'assistant', parts: [{ type: 'reasoning', text: 'Thinking step by step...' }, { type: 'text', text: 'Hello '.repeat(20) }] }] }, { force: true });
  const c2 = eng2.state('01a14e12-f819-79f6-9f37-e2c094ef5938').info.result.baseMatch.candidates[0];
  assert.equal(c2.id, 'contenders/farris-ees5-agent');
  assert.equal(c2.diophantinePassed, true);
});

test('v0.13.151: Zero-SQLite fast-path /cost cookie caching, auto-updating deployment IDs (rememberCostDpl / discoverFreshCostDpl / Pin.learnDpl), decoupled non-blocking Trace, and packages/core-metrics layout', () => {
  const repoRoot = path.resolve(clientDir, '..');
  const mainSrc = fs.readFileSync(path.join(clientDir, 'src/main.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  const javaSrc = fs.readFileSync(path.join(clientDir, 'android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');

  // 1) Fast-path session cookie cache & applied skew state in main.js & MainActivity.java
  assert.ok(mainSrc.includes('ses.__cookieCache') && mainSrc.includes('ses.__appliedSkewDpl'), 'main.js caches session cookies and applied skew state for zero-SQLite fast path');
  assert.ok(mainSrc.includes('rememberCostDpl') && mainSrc.includes('discoverFreshCostDpl'), 'main.js auto-learns and auto-discovers fresh /cost deployment IDs');
  assert.ok(javaSrc.includes('protoCookieCache') && javaSrc.includes('learnedCostDpl'), 'Android MainActivity.java caches cookies and learns working deployment IDs');

  // 2) Pin.learnDpl & non-blocking reverseIdentify
  assert.ok(coreSrc.includes('learnDpl(d, verifiedCost = false)') && coreSrc.includes("r.headers.get('x-arena-api-deployment')"), 'core.js auto-learns x-arena-api-deployment headers');
  assert.ok(bpUiSrc.includes('options._triedAllSkew') && bpUiSrc.includes('const retryWait = [220, 520, 950];'), 'billing-probe-ui.js skips duplicate 403 skew loops and speeds up retry timers');

  // 3) Repository structure cleanup
  assert.ok(fs.existsSync(path.join(repoRoot, 'packages/core-metrics/package.json')), 'packages/core-metrics exists');
  assert.ok(!fs.existsSync(path.join(repoRoot, 'Brana-Account-Switch.user.js')), 'legacy root userscript removed');
  assert.ok(!fs.existsSync(path.join(repoRoot, 'Brana-Native-Suite.user.js')), 'legacy root native suite removed');
  assert.ok(!fs.existsSync(path.join(repoRoot, 'gacha-userscript')), 'legacy gacha-userscript folder removed');
});

test('v0.13.152: GPT 6 Astra vs Claude Fable 5.1 multi-turn & Pelican SVG disambiguation (Turn 1 -> Turn 2 Pelican -> Re-test) + mobile FileExport.text diagnostic export', () => {
  const F = require('../ui/arena-trace/family.js');
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  const dockSrc = fs.readFileSync(path.join(clientDir, 'ui/dock.js'), 'utf8');
  const poolSrc = fs.readFileSync(path.join(clientDir, 'ui/pool.js'), 'utf8');

  // 1) family.js prioritizes OpenAI streamIds (rs_/msg_) over normalized tc_01J... gateway tool call IDs
  const sseBody = events => events.map(d => 'data: ' + JSON.stringify({ records: [{ body: JSON.stringify({ data: d }) }] })).join('\n') + '\n';
  const famPelican = F.classifyFamily([{
    url: 'https://arena.ai/api/v1/chat/01a15000-test-astra-pelican/stream/m2/out',
    responseBody: sseBody([
      { type: 'start', messageId: 'm2' },
      { type: 'reasoning-start', id: 'rs_1122334455667788' },
      { type: 'tool-input-start', toolCallId: 'tc_01JABCDEF1234567890', toolName: 'write_file' },
      { type: 'reasoning-start', id: 'rs_2233445566778899' },
      { type: 'tool-input-start', toolCallId: 'tc_01JABCDEF1234567891', toolName: 'present_file' },
      { type: 'text-start', id: 'msg_2233445566778899' },
    ]),
  }]);
  assert.equal(famPelican.family, 'openai');

  // 2) GPT 6 Astra Turn 1 -> Turn 2 (Pelican SVG with Write + Present) -> Re-test (reload with no stream hints)
  const mkRow = (I, R, W, O) => ({
    basePriceUsd: I * 0.32e-6 + R * 0.016e-6 + W * 0.40e-6 + O * 0.87e-6,
    actual: {
      inputTokensCostUsd: I * 10.0e-6,
      cacheReadTokensCostUsd: R * 1.0e-6,
      cacheWriteTokensCostUsd: W * 12.5e-6,
      outputTokensCostUsd: O * 50.0e-6,
      totalCostUsd: I * 10.0e-6 + R * 1.0e-6 + W * 12.5e-6 + O * 50.0e-6,
    }
  });
  const cost1 = { messages: { m1: mkRow(18, 6603, 0, 450) } };
  const cost2 = { messages: { m1: mkRow(18, 6603, 0, 450), m2: mkRow(42, 13674, 0, 1850) } };

  const chatTurn1 = {
    sid: '01a15000-test-astra-pelican',
    messages: [
      { id: 'u1', role: 'user', content: '请回答1' },
      {
        id: 'm1', role: 'assistant', status: 'success',
        parts: [
          { type: 'reasoning', text: '', id: 'rs_0987654321abcdef' },
          { type: 'text', text: '这是一个第一轮回复，文字长度大约四百五十个token左右。'.repeat(30), id: 'msg_0987654321abcdef' }
        ],
        _sseMeta: { ids: ['rs_0987654321abcdef', 'msg_0987654321abcdef'], rBlocks: 1, rChars: 0, tN: 24, tChars: 900 }
      }
    ]
  };
  const hints1 = new Map([['m1', F.classifyFamily([{
    url: 'https://arena.ai/api/v1/chat/01a15000-test-astra-pelican/stream/m1/out',
    responseBody: sseBody([
      { type: 'start', messageId: 'm1' },
      { type: 'reasoning-start', id: 'rs_0987654321abcdef' },
      { type: 'text-start', id: 'msg_0987654321abcdef' },
    ]),
  }])]]) ;
  const resTurn1 = B.analyze(chatTurn1, cost1, catalogDoc, hints1);
  assert.equal(resTurn1.result.baseMatch.candidates[0].id, 'openai/gpt-6-astra');

  const chatTurn2 = {
    sid: '01a15000-test-astra-pelican',
    _streamEvidence: chatTurn1._streamEvidence,
    messages: [
      ...chatTurn1.messages,
      { id: 'u2', role: 'user', content: 'Generate an HTML page with an embedded SVG of a pelican riding a bicycle' },
      {
        id: 'm2', role: 'assistant', status: 'success',
        parts: [
          { type: 'reasoning', text: '', id: 'rs_1122334455667788' },
          { type: 'tool', toolCallId: 'tc_01JABCDEF1234567890', name: 'write_file', state: 'result', input: { path: 'pelican_bicycle.html', content: '<!DOCTYPE html><html><body><!-- Pelican riding a bicycle --><svg viewBox="0 0 800 600"><g id="pelican"><path d="M100 100"/></g></svg></body></html>' + 'x'.repeat(4800) } },
          { type: 'reasoning', text: '', id: 'rs_2233445566778899' },
          { type: 'tool', toolCallId: 'tc_01JABCDEF1234567891', name: 'present_file', state: 'result', input: { path: 'pelican_bicycle.html' } },
          { type: 'text', text: 'I have created the interactive SVG of a pelican riding a bicycle in pelican_bicycle.html.', id: 'msg_2233445566778899' }
        ],
        _sseMeta: { ids: ['rs_1122334455667788', 'rs_2233445566778899', 'msg_2233445566778899'], rBlocks: 2, rChars: 0, tN: 10, tChars: 90 }
      }
    ]
  };
  const hints2 = new Map([
    ['m1', hints1.get('m1')],
    ['m2', famPelican]
  ]);
  const resTurn2 = B.analyze(chatTurn2, cost2, catalogDoc, hints2);
  assert.equal(resTurn2.result.baseMatch.candidates[0].id, 'openai/gpt-6-astra');
  assert.ok(!resTurn2.routeSwitched);

  // Re-test (复测) after reload when live stream hints & _sseMeta are gone
  const chatRetest = {
    sid: '01a15000-test-astra-pelican',
    messages: [
      { id: 'u1', role: 'user', content: '请回答1' },
      { id: 'm1', role: 'assistant', status: 'success', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: '这是一个第一轮回复，文字长度大约四百五十个token左右。'.repeat(30) }] },
      { id: 'u2', role: 'user', content: 'Generate an HTML page with an embedded SVG of a pelican riding a bicycle' },
      {
        id: 'm2', role: 'assistant', status: 'success',
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'tool', toolCallId: 'tc_01JABCDEF1234567890', name: 'write_file', state: 'result', input: { path: 'pelican_bicycle.html', content: '<!DOCTYPE html><html><body><!-- Pelican riding a bicycle --><svg viewBox="0 0 800 600"><g id="pelican"><path d="M100 100"/></g></svg></body></html>' + 'x'.repeat(4800) } },
          { type: 'reasoning', text: '' },
          { type: 'tool', toolCallId: 'tc_01JABCDEF1234567891', name: 'present_file', state: 'result', input: { path: 'pelican_bicycle.html' } },
          { type: 'text', text: 'I have created the interactive SVG of a pelican riding a bicycle in pelican_bicycle.html.' }
        ]
      }
    ]
  };
  const resRetest = B.analyze(chatRetest, cost2, catalogDoc, new Map());
  assert.equal(resRetest.result.baseMatch.candidates[0].id, 'openai/gpt-6-astra');
  assert.ok(!resRetest.routeSwitched);

  // Case C: Even if OpenRouter gateway normalizes stream IDs to numeric-only ("0") and emits empty reasoning-deltas on Astra Pelican,
  // zero-CW + 6603 prefix + Pelican SVG billing evidence must keep GPT 6 Astra #1 at 100% and retain Claude Fable 5.1 in Top 5
  const chatNumericEmptyDeltas = {
    sid: '01a15000-test-astra-pelican-numeric',
    fmt: { rBlocks: 1, rChars: 0, rWireDeltas: 3, tN: 40, tChars: 420, ids: [['r', '0'], ['t', '0']] },
    messages: [
      { id: 'm1', role: 'assistant', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: '你好！' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: '```html\n<svg viewBox="0 0 800 600"><title>Pelican Riding a Bicycle</title></svg>\n```' }] }
    ]
  };
  const resNumericEmpty = B.analyze(chatNumericEmptyDeltas, cost2, catalogDoc, new Map());
  assert.equal(resNumericEmpty.result.baseMatch.candidates[0].id, 'openai/gpt-6-astra');
  assert.ok(resNumericEmpty.result.baseMatch.candidates.slice(0, 5).some(c => c.id === 'anthropic/claude-fable-5.1'), 'Claude Fable 5.1 should remain visible in Top 5 as same-price counterpart');

  // Case D: On a Claude Fable 5.1 session (W > 0), Claude Fable 5.1 is #1 (100%) and GPT 6 Astra remains visible in Top 5 (#2/#3)
  const r0 = require('../ui/arena-trace/pricing.js').AGENT_P50_RATES;
  const fableCost = {
    messages: {
      f1: { basePriceUsd: 4 * r0.prompt + 11755 * r0.cacheWrite + 131 * r0.completion, totalChargedUsd: 0.006507, pricingStrategy: 'agent_p50', actual: { inputTokensCostUsd: 4 * 10e-6, cacheWriteTokensCostUsd: 11755 * 12.5e-6, cacheReadTokensCostUsd: 0, outputTokensCostUsd: 131 * 50e-6, totalCostUsd: 4 * 10e-6 + 11755 * 12.5e-6 + 131 * 50e-6, isLongContext: false } },
      f2: { basePriceUsd: 1 * r0.prompt + 148 * r0.cacheWrite + 11755 * r0.cacheRead + 4675 * r0.completion, totalChargedUsd: 0.004266, pricingStrategy: 'agent_p50', actual: { inputTokensCostUsd: 1 * 10e-6, cacheWriteTokensCostUsd: 148 * 12.5e-6, cacheReadTokensCostUsd: 11755 * 0.25e-6, outputTokensCostUsd: 4675 * 50e-6, totalCostUsd: 1 * 10e-6 + 148 * 12.5e-6 + 11755 * 0.25e-6 + 4675 * 50e-6, isLongContext: false } },
    }
  };
  const fableChatCold = {
    sid: '01a1457d-cold-reload',
    fmt: { rBlocks: 0, rChars: 0, rWireDeltas: 0, tN: 0, tChars: 0, ids: [] },
    messages: [
      { id: 'f1', role: 'assistant', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: '好的，请问您需要什么帮助？' }] },
      { id: 'f2', role: 'assistant', parts: [{ type: 'reasoning', text: '' }, { type: 'text', text: '这是为您准备的分析内容...' }] },
    ]
  };
  const resFableCold = B.analyze(fableChatCold, fableCost, catalogDoc, new Map());
  assert.equal(resFableCold.result.baseMatch.candidates[0].id, 'anthropic/claude-fable-5.1');
  assert.ok(resFableCold.result.baseMatch.candidates.slice(0, 5).some(c => c.id === 'openai/gpt-6-astra'), 'GPT 6 Astra should remain visible in Top 5 on $10/$50 Fable 5.1 session');

  // 3) Mobile FileExport.text diagnostic export support
  assert.ok(bpUiSrc.includes('function exportDiagnosticJson(sid)') && bpUiSrc.includes('FileExport.text(jsonText, fname'));
  assert.ok(dockSrc.includes('BillingProbe.exportDiagnosticJson(sid)') && dockSrc.includes('FileExport.text(txt, fname'));
  assert.ok(poolSrc.includes("FileExport.text(txt + '\\n', 'proxyip.txt'"));
});







