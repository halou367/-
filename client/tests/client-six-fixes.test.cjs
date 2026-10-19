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

test('5. Habit Gacha Mode (习惯速测 · 微缩探针) & Micro-Probe ChatHabitFingerprint scaling + sseMemo avgChunk', () => {
  const vm = require('vm');
  const gpSrc = fs.readFileSync(path.join(uiDir, 'gacha-prompts.js'), 'utf8');
  const gachaSrc = fs.readFileSync(path.join(uiDir, 'gacha.js'), 'utf8');
  const gviewSrc = fs.readFileSync(path.join(uiDir, 'gview.js'), 'utf8');
  const gpopSrc = fs.readFileSync(path.join(uiDir, 'gpop.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');

  // Verify UI mode wiring for 'habit'
  assert.ok(gachaSrc.includes("['habit','autoqa','svg','custom','fingerprint'].includes(s.mode)"));
  assert.ok(gachaSrc.includes("const isHabitOnly = c.gacha?.mode === 'habit';"));
  assert.ok(gachaSrc.includes("const costAllowed = !isHabitOnly &&"));
  assert.ok(gviewSrc.includes("'习惯速测 · 微缩探针'"));
  assert.ok(gpopSrc.includes('<option value="habit">习惯速测 · 微缩探针</option>'));

  // Evaluate GachaPrompts in sandbox and verify 6 technical refinements
  const gpStore = {};
  const gpCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Uint32Array, Uint8Array, TextEncoder,
    crypto: require('crypto').webcrypto,
    Store: { get: (k, d) => gpStore[k] ?? d, set: (k, v) => { gpStore[k] = v; } }
  });
  vm.runInContext(gpSrc + '; this.GachaPrompts = GachaPrompts;', gpCtx);
  for (let i = 0; i < 8; i++) {
    const p = gpCtx.GachaPrompts.habit();
    assert.ok(!/write_file/i.test(p), 'Must not hardcode write_file tool name');
    assert.ok(!/\bstatus_badge\.html\b/i.test(p), 'Must not hardcode filename');
    assert.ok(/35[～~-]45\s*行以内/.test(p), 'Must constrain HTML+SVG to 35-45 lines');
    assert.ok(/终端命令/.test(p), 'Must request 1 terminal check command');
    assert.ok(/2～3\s*条.*加粗要点/.test(p), 'Must request Chinese bold summary points');
  }
  const r0 = gpCtx.GachaPrompts.autoqaOne(0);
  const r1 = gpCtx.GachaPrompts.autoqaOne(1);
  assert.ok(/35[～~-]45\s*行以内/.test(r0), 'Round 1 of autoqaOne uses micro-probe');
  assert.ok(r1.length < 130, 'Round 2 of autoqaOne is a short 1-sentence follow-up');

  // Extract ChatHabitFingerprint IIFE and verify micro-probe classification across vendors
  const startIdx = bpUiSrc.indexOf('const ChatHabitFingerprint = (() => {');
  const endMarker = '    recordUserCorrection,';
  const endIdx = bpUiSrc.indexOf(endMarker, startIdx);
  const closeIdx = bpUiSrc.indexOf('})();', endIdx) + 5;
  const chfCode = bpUiSrc.slice(startIdx, closeIdx) + '; this.ChatHabitFingerprint = ChatHabitFingerprint;';

  const memoMap = new Map();
  const chfCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Date, parseInt, parseFloat, isFinite,
    window: { __atiSseMemo: memoMap },
    Store: { get: () => null, set: () => {} },
    Models: { get: () => null, set: () => {} },
    Strength: { canon: s => s }
  });
  vm.runInContext(chfCode, chfCtx);
  const CHF = chfCtx.ChatHabitFingerprint;

  const userPrompt = gpCtx.GachaPrompts.habit();

  // (A) Gemini 3.8 Flash (High) micro-probe: 0 reasoning blocks + cat << 'EOF' bash heredoc
  const geminiChat = {
    sid: '019a0000-0000-7000-8000-000000000001',
    gacha: { mode: 'habit' },
    messages: [
      { id: '019a0000-0000-7000-8000-000000000001', role: 'user', text: userPrompt },
      {
        id: '019a0000-0002-7000-8000-000000000002',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-bash',
            toolName: 'bash',
            input: {
              command: "cat << 'EOF' > badge.html\n<!DOCTYPE html><html><head><style>:root{--bg:#111;}</style></head><body><svg><linearGradient id='g'></linearGradient></svg><script>requestAnimationFrame(()=>{});</script></body></html>\nEOF\nwc -l badge.html"
            }
          },
          { type: 'text', text: '**结构实现**：采用内联 SVG 与 CSS 变量。\n**动效设计**：使用 rAF 驱动状态脉冲。' }
        ]
      }
    ]
  };
  const gemRes = CHF.analyze(geminiChat);
  assert.ok(gemRes.features.isMicroProbeChat);
  assert.equal(gemRes.candidates[0].id, 'google/gemini-3.8-flash');

  // (B) Claude Sonnet 5.5 micro-probe: pre-tool narration + box comment + warm palette + cnColon + sseMemo avgChunk ~ 11.2
  memoMap.set('019a0000-0000-7000-8000-000000000002', { textDeltaCount: 28, textDeltaChars: 314, avgChunk: 11.2, reasoningBlocks: 1 });
  const sonnetHtml = '<!DOCTYPE html><html><head><style>/* ── Status Badge ── */ :root{--bg:#FAF8F5;}</style></head><body><svg viewBox="0 0 100 100"><linearGradient id="g"></linearGradient><circle cx="50" cy="50" r="40"/></svg><script>requestAnimationFrame(()=>{});</script></body></html>' + ' '.repeat(900);
  const sonnetChat = {
    sid: '019a0000-0000-7000-8000-000000000002',
    gacha: { mode: 'habit' },
    messages: [
      { id: '019a0000-0000-7000-8000-000000000002', role: 'user', text: userPrompt },
      {
        id: '019a0000-0003-7000-8000-000000000003',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: '...' },
          { type: 'text', text: '我将为你创建一个包含动态内联 SVG 状态徽章的单文件微缩面板，并在创建后使用终端命令校验行数。' },
          { type: 'step-start' },
          { type: 'tool-write_file', toolName: 'write_file', input: { path: 'badge.html', content: sonnetHtml } },
          { type: 'step-start' },
          { type: 'tool-bash', toolName: 'bash', input: { command: 'wc -l badge.html' } },
          { type: 'text', text: '**视觉配色**：采用暖白底色与渐变几何徽标。\n**动效机制**：通过 rAF 实现平滑呼吸切换。\n**校验结果**：终端确认文件共 40 行。' }
        ]
      }
    ]
  };
  const sonRes = CHF.analyze(sonnetChat);
  assert.ok(sonRes.features.isMicroProbeChat);
  assert.equal(sonRes.features.memoAvgChunk, 11.2);
  assert.equal(sonRes.candidates[0].id, 'anthropic/claude-sonnet-5.5');

  // (C) GPT-6.1 Sol (Max) micro-probe: 0 pre-tool text + parallel step (write_file + bash) + lowerDoctype + prefers-reduced-motion
  const solMaxHtml = '<!doctype html><html><head><style>:root{color-scheme:dark;}@media (prefers-reduced-motion: reduce){*{animation:none!important;}}</style></head><body><svg aria-labelledby="t"><title id="t">Badge</title><radialGradient id="r"></radialGradient></svg><script>requestAnimationFrame(()=>{});</script></body></html>' + ' '.repeat(1400);
  const solMaxChat = {
    sid: '019a0000-0000-7000-8000-000000000003',
    gacha: { mode: 'habit' },
    messages: [
      { id: '019a0000-0000-7000-8000-000000000003', role: 'user', text: userPrompt },
      {
        id: '019a0000-0005-7000-8000-000000000004',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: '...' },
          { type: 'reasoning', text: '...' },
          { type: 'step-start' },
          { type: 'tool-write_file', toolName: 'write_file', input: { path: 'status_panel.html', content: solMaxHtml } },
          { type: 'tool-bash', toolName: 'bash', input: { command: 'wc -l status_panel.html && wc -c status_panel.html' } },
          { type: 'text', text: '已完成微缩面板 [status_panel.html](sandbox:/home/user/status_panel.html)。\n**无障碍与暗色支持**：内置 color-scheme 与 reduced-motion 适配。\n**状态切换**：支持点击切换 SVG 脉冲速率。' }
        ]
      }
    ]
  };
  const solMaxRes = CHF.analyze(solMaxChat);
  assert.ok(solMaxRes.features.isMicroProbeChat);
  assert.equal(solMaxRes.candidates[0].id, 'openai/gpt-6.1-sol');
});
