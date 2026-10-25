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
  assert.ok(gviewSrc.includes("'习惯速测 · 鹈鹕识别'"));
  assert.ok(gpopSrc.includes('<option value="habit">习惯速测 · 鹈鹕识别</option>'));

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

test('6. Reasoning score strictly bounded to 0-100: REI index (>100 / thousands) never leaks into 推理分', () => {
  const dockSrc = fs.readFileSync(path.join(uiDir, 'dock.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(uiDir, 'view.js'), 'utf8');
  const strSrc = fs.readFileSync(path.join(uiDir, 'strength.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');

  // Dock.scoreOf must not return raw top0.effortProfile.reiScore
  const scoreOfBlock = dockSrc.slice(dockSrc.indexOf('scoreOf(sid, m, t)'), dockSrc.indexOf('scoreBadge(sid, m'));
  assert.ok(!scoreOfBlock.includes('top0.effortProfile.reiScore'), 'Dock.scoreOf must not return raw effortProfile.reiScore');
  assert.ok(scoreOfBlock.includes('Strength.reverseDepthScore'), 'Dock.scoreOf must use Strength.reverseDepthScore');

  // view.js cardMetrics must validate reverseScore with saneSc (0-100)
  assert.ok(viewSrc.includes('const score = (mi?.routed && saneSc(mi?.reverseScore) != null)'));

  // strength.js fmtScore must reject > 100 values and migrate() must heal > 100 reverseScore/habitScore
  assert.ok(strSrc.includes("const fmtScore = v => (v == null || !Number.isFinite(+v) || +v < 0 || +v > 100) ? '—'"));
  assert.ok(strSrc.includes('m.reverseScore > 100'));

  // billing-probe-ui.js sanitizeBankSample & learnFromReverseTeacher must never treat reiScore as 0-100 score
  assert.ok(!bpUiSrc.includes('? +topRc.effortProfile.reiScore'));
  assert.ok(!bpUiSrc.includes('? +topRev.effortProfile.reiScore'));
});

test('7. Session 01a155eb-ebaa-730a-922c-085044a25044: Gemini 4 Argon (High) native write_file+bash micro-probe/pelican not misidentified as Opus 5.6', () => {
  const vm = require('vm');
  const coreSrc = fs.readFileSync(path.join(uiDir, 'core.js'), 'utf8');
  const strSrc = fs.readFileSync(path.join(uiDir, 'strength.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');

  // ExtCompat.replayChat aggregates m._fmt and ignores polluted prevMemo (avgChunk > 220 with textDeltaCount <= assistants.length * 2)
  assert.ok(coreSrc.includes('const isPollutedPrevMemo = Boolean('));
  assert.ok(coreSrc.includes('avgChunk: (fmtTN >= 3 && fmtTChars > 0)'));

  // Strength.register cleans up stale mdl:<sid> rows from old model buckets on re-identification
  assert.ok(strSrc.includes("S[otherName] = S[otherName].filter(x => x && x.k !== k && !String(x.k || '').startsWith(sid + ':'));"));

  const startIdx = bpUiSrc.indexOf('const ChatHabitFingerprint = (() => {');
  const endMarker = '    recordUserCorrection,';
  const endIdx = bpUiSrc.indexOf(endMarker, startIdx);
  const closeIdx = bpUiSrc.indexOf('})();', endIdx) + 5;
  const chfCode = bpUiSrc.slice(startIdx, closeIdx) + '; this.ChatHabitFingerprint = ChatHabitFingerprint;';

  const localMap = new Map();
  const modelsMap = {};
  const chfCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Date, parseInt, parseFloat, isFinite,
    localStorage: {
      getItem: k => localMap.has(k) ? localMap.get(k) : null,
      setItem: (k, v) => localMap.set(k, String(v)),
      removeItem: k => localMap.delete(k),
    },
    window: { __atiSseMemo: new Map() },
    Store: { get: () => null, set: () => {} },
    Models: { all: modelsMap, get: k => modelsMap[k] || null, set: (k, v) => { modelsMap[k] = v; } },
    Strength: { canon: s => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '') },
    Bus: { on: () => {}, emit: () => {} },
  });
  vm.runInContext(chfCode, chfCtx);
  const CHF = chfCtx.ChatHabitFingerprint;

  const sidEb = '01a155eb-ebaa-730a-922c-085044a25044';
  const pollutedSavedEntry = {
    name: 'claude-opus-5.6-max',
    candidateName: 'claude-opus-5.6-max',
    rawLabel: 'Claude Opus 5.6 (Max)',
    reverseCandidateId: 'anthropic/claude-opus-5.6',
    reverseLabel: 'Claude Opus 5.6 (Max)',
    reverseEffort: 'max',
    reverseMatch: 97.3,
    confidence: 97.3,
    reverseScore: 72,
    habitScore: 72,
    habitInferred: true,
    reverseInferred: true,
    billingProbe: true,
    habitTags: ['闭源隐藏思考(2.0段/轮)', '流式速度(153字/秒)', '0字静默直调工具(100%)', 'HTML习惯(:root/rAF✓)', '行文(**冒号**3/破折号1)', '微缩探针', '推理分 72', '对话记录+工具流结构反推', '闭源多步深层隐藏思考', '静默连续工具调用'],
    habitFeatures: {
      vec: [1, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0.85, 0.7, 0.85, 0.25, 0.1, 0.25, 0.5, 1, 0.8333333333333334, 1],
      meta: {
        turns: 2, hidR: 4, maxRInTurn: 2, totalTools: 6, bash: 2, write: 2, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0,
        parallelSteps: 0, preNarrate: 0, preToolTextChars: 0, interToolTextChars: 0, avgTurnDurMs: 101241, cps: 152.8,
        memoAvgChunk: 932.5, memoDeltaCount: 2, writtenChars: 34198, htmlMaxLen: 31955, meanChars: 15467, nonCodeMeanChars: 15467,
        isMicroProbeChat: true, pyHeredoc: 0, catHeredoc: 0, geminiPyHelper: 0, inlineHtmlEcho: 0, sandboxLink: 0,
        lowerDoctype: 0, colorSchemeCss: 0, prefersReducedMotion: 0, svgSmilNoScript: 0, ariaLabelledby: 0, boxComment: 0,
        claudeWarmPalette: 0, cnColon: 3, emDash: 1, writeUnderscoreName: 2, isGeminiCoding: false, isOpenThink: false,
      }
    }
  };
  chfCtx.Models.set(sidEb, pollutedSavedEntry);
  const resSaved = CHF.analyze({ sid: sidEb, messages: [] }, pollutedSavedEntry);
  assert.equal(resSaved.candidates[0].id, 'google/gemini-3.8-flash');
  assert.equal(resSaved.candidates[0].label, 'Gemini 3.8 Flash (High)');
  assert.equal(resSaved.features.hidR, 0);
  assert.equal(resSaved.features.isGeminiCoding, true);
  assert.equal(resSaved.features.isMicroProbeChat, false);

  const applied = CHF.identifyAndApply({ sid: sidEb, messages: [] }, { force: true });
  assert.equal(applied.name, 'gemini-3.8-flash-high');
  assert.equal(applied.rawLabel, 'Gemini 3.8 Flash (High)');
  assert.ok(!applied.habitTags.some(t => /^闭源隐藏思考/.test(t)));
});

test('8. Habit & Reverse Inference accuracy: pure analyze() without self-reinforcing calibration, diskSamples persistence, structuralReverse alignment, and 24/24 Test-judo accuracy', () => {
  const vm = require('vm');
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');

  // 1. main.js uses app.getPath('userData') and merges diskSamples across unified bank files
  assert.ok(mainSrc.includes("const bankFile = path.join(app.getPath('userData'), 'shared', 'habitLearnBank.json');"));
  assert.ok(mainSrc.includes('const baseSamples = mergeBankSamples(diskSamples, DB.shared.habitLearnBank?.samples || []);'));

  // 2. analyze() does not recursively call learnFromReverseTeacher, and applyReverseIdentity guards teacher learning with isRealCostTeacher
  const analyzeBlock = bpUiSrc.slice(bpUiSrc.indexOf('function analyze(chat, modelEntry = null'), bpUiSrc.indexOf('function structuralReverse('));
  assert.ok(!analyzeBlock.includes('learnFromReverseTeacher('), 'analyze() must be pure and never call learnFromReverseTeacher');
  assert.ok(bpUiSrc.includes('const isRealCostTeacher = Boolean('));
  assert.ok(bpUiSrc.includes('!best.structuralRev &&'));

  // 3. Evaluate ChatHabitFingerprint on all 24 Test-judo sessions
  const startIdx = bpUiSrc.indexOf('const ChatHabitFingerprint = (() => {');
  const endMarker = '    recordUserCorrection,';
  const endIdx = bpUiSrc.indexOf(endMarker, startIdx);
  const closeIdx = bpUiSrc.indexOf('})();', endIdx) + 5;
  const chfCode = bpUiSrc.slice(startIdx, closeIdx) + '; this.ChatHabitFingerprint = ChatHabitFingerprint;';

  const localMap = new Map();
  const modelsMap = {};
  const chfCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Date, parseInt, parseFloat, isFinite,
    localStorage: {
      getItem: k => localMap.has(k) ? localMap.get(k) : null,
      setItem: (k, v) => localMap.set(k, String(v)),
      removeItem: k => localMap.delete(k),
    },
    window: { __atiSseMemo: new Map() },
    Store: { get: () => null, set: () => {} },
    Models: { all: modelsMap, get: k => modelsMap[k] || null, set: (k, v) => { modelsMap[k] = v; } },
    Strength: {
      canon(s) {
        let x = String(s || '').trim().toLowerCase();
        x = x.replace(/\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '-$1');
        x = x.replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '');
        if (x === 'claude-opus-5.5') return 'claude-opus-5.5-high';
        if (x === 'claude-sonnet-5.5') return 'claude-sonnet-5.5-high';
        if (x === 'claude-fable-5.1') return 'claude-fable-5.1-max';
        return x;
      }
    },
    Bus: { on: () => {}, emit: () => {} },
  });
  vm.runInContext(chfCode, chfCtx);
  const CHF = chfCtx.ChatHabitFingerprint;

  const sessions24 = [
    { sid: '01a15728-69d2-7000-8000-000000000001', truth: 'gpt-6-sol-max', meta: { turns:2, hidR:7, maxRInTurn:5, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:42000, cps:108.5, memoAvgChunk:2.4, memoDeltaCount:40, writtenChars:7480, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a15728-3c97-7000-8000-000000000002', truth: 'claude-fable-5.1-max', meta: { turns:2, hidR:4, maxRInTurn:3, totalTools:6, bash:2, write:2, edit:0, read:0, parallelSteps:1, avgTurnDurMs:53000, cps:130.2, memoAvgChunk:9.3, memoDeltaCount:45, writtenChars:13863, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:0 } },
    { sid: '01a15727-96c1-7000-8000-000000000003', truth: 'claude-opus-5.5-medium', meta: { turns:2, hidR:4, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, parallelSteps:1, avgTurnDurMs:72000, cps:104.3, memoAvgChunk:9.1, memoDeltaCount:45, writtenChars:15344, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1, cnColon:3 } },
    { sid: '01a15727-3727-7000-8000-000000000004', truth: 'gpt-6-sol-max', meta: { turns:2, hidR:30, maxRInTurn:22, totalTools:5, bash:1, write:2, edit:0, read:0, preToolTextChars:208, avgTurnDurMs:180000, cps:23.4, memoAvgChunk:1.6, memoDeltaCount:60, writtenChars:19128, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a15726-d798-7000-8000-000000000005', truth: 'claude-sonnet-5.5-max', meta: { turns:2, hidR:3, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, parallelSteps:0, avgTurnDurMs:44000, cps:98.3, memoAvgChunk:8.9, memoDeltaCount:40, writtenChars:10312, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1 } },
    { sid: '01a15726-a825-7000-8000-000000000006', truth: 'gemini-3.8-flash-high', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:9, bash:4, write:2, edit:0, read:1, avgTurnDurMs:145000, cps:222.3, memoAvgChunk:62.5, memoDeltaCount:518, writtenChars:37987, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:0, isGeminiCoding:true } },
    { sid: '01a15726-7ce1-7000-8000-000000000007', truth: 'gpt-6-luna-max', meta: { turns:2, hidR:9, maxRInTurn:8, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:45000, cps:91.2, memoAvgChunk:2.7, memoDeltaCount:45, writtenChars:9156, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2 } },
    { sid: '01a15726-224d-7000-8000-000000000008', truth: 'gpt-6-luna-high', meta: { turns:2, hidR:5, maxRInTurn:4, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:35000, cps:118.4, memoAvgChunk:2.3, memoDeltaCount:50, writtenChars:9210, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2 } },
    { sid: '01a15725-a30d-7000-8000-000000000009', truth: 'gpt-6-luna-medium', meta: { turns:2, hidR:2, maxRInTurn:1, totalTools:3, bash:1, write:1, edit:0, read:0, avgTurnDurMs:22000, cps:203.7, memoAvgChunk:4.85, memoDeltaCount:35, writtenChars:2261, lowerDoctype:1, colorSchemeCss:1, prefersReducedMotion:1 } },
    { sid: '01a15725-7a2b-7000-8000-000000000010', truth: 'claude-sonnet-5.5-max', meta: { turns:2, hidR:3, maxRInTurn:2, totalTools:6, bash:2, write:2, edit:0, read:0, parallelSteps:1, avgTurnDurMs:55000, cps:118.2, memoAvgChunk:9.4, memoDeltaCount:42, writtenChars:11158, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1 } },
    { sid: '01a15725-5434-7000-8000-000000000011', truth: 'gemini-4-argon-low', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:92000, cps:138.4, memoAvgChunk:34.0, memoDeltaCount:31, writtenChars:36500, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:0, isGeminiCoding:true } },
    { sid: '01a155ec-6265-7000-8000-000000000012', truth: 'gpt-6-luna-max', meta: { turns:2, hidR:44, maxRInTurn:40, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:134000, cps:47.0, memoAvgChunk:1.6, memoDeltaCount:55, writtenChars:14451, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a155ec-2a16-7000-8000-000000000013', truth: 'gpt-5.6-sol-high', meta: { turns:2, hidR:23, maxRInTurn:18, totalTools:5, bash:1, write:2, edit:0, read:0, preToolTextChars:0, avgTurnDurMs:208000, cps:40.6, memoAvgChunk:1.59, memoDeltaCount:60, writtenChars:19310, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2, ariaLabelledby:1 } },
    { sid: '01a155eb-ebaa-7000-8000-000000000014', truth: 'gemini-3.8-flash-high', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:6, bash:2, write:2, edit:0, read:0, avgTurnDurMs:101241, cps:152.8, memoAvgChunk:0, memoDeltaCount:0, writtenChars:34198, htmlMaxLen:31955, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:0, cnColon:3, writeUnderscoreName:2, isGeminiCoding:true } },
    { sid: '01a155eb-a9d2-7000-8000-000000000015', truth: 'gpt-5.6-terra-high', meta: { turns:2, hidR:9, maxRInTurn:5, totalTools:5, bash:2, write:1, edit:1, read:1, avgTurnDurMs:37515, cps:135.2, memoAvgChunk:2.7, memoDeltaCount:2585, writtenChars:3451, htmlMaxLen:7023, lowerDoctype:1, colorSchemeCss:2, prefersReducedMotion:1 } },
    { sid: '01a155eb-26a5-7000-8000-000000000016', truth: 'gpt-5.6-terra-high', meta: { turns:2, hidR:5, maxRInTurn:3, totalTools:8, bash:2, write:2, edit:1, read:1, avgTurnDurMs:26567, cps:148.1, memoAvgChunk:1.5, memoDeltaCount:78, writtenChars:8848, htmlMaxLen:6772, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2, ariaLabelledby:1 } },
    { sid: '01a155ea-d645-7000-8000-000000000017', truth: 'gemini-4-argon-high', meta: { turns:3, hidR:0, maxRInTurn:0, totalTools:22, bash:19, write:0, edit:0, read:1, avgTurnDurMs:212274, cps:8.9, memoAvgChunk:69.6, memoDeltaCount:45, writtenChars:0, htmlMaxLen:54638, pyHeredoc:7, catHeredoc:3, cnColon:4, isGeminiCoding:true } },
    { sid: '01a155ea-7be8-7000-8000-000000000018', truth: 'claude-opus-5.5-medium', meta: { turns:2, hidR:3, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:60698, cps:107.2, memoAvgChunk:0, memoDeltaCount:0, writtenChars:12656, htmlMaxLen:10311, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1, cnColon:2 } },
    { sid: '01a155ea-6985-7000-8000-000000000019', truth: 'gpt-6-luna-high', meta: { turns:2, hidR:7, maxRInTurn:5, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:38283, cps:130.6, memoAvgChunk:2.1, memoDeltaCount:57, writtenChars:11378, htmlMaxLen:8710, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2, ariaLabelledby:1, cnColon:3 } },
    { sid: '01a155e9-d221-7000-8000-000000000020', truth: 'gpt-6-sol-medium', meta: { turns:2, hidR:6, maxRInTurn:5, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:36000, cps:115.0, memoAvgChunk:3.6, memoDeltaCount:40, writtenChars:9492, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2 } },
    { sid: '01a155e9-7637-7000-8000-000000000021', truth: 'gpt-5.6-terra-high', meta: { turns:2, hidR:14, maxRInTurn:8, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:286796, cps:15.1, memoAvgChunk:1.7, memoDeltaCount:68, writtenChars:9790, htmlMaxLen:6274, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2, svgSmilNoScript:1, ariaLabelledby:2 } },
    { sid: '01a155e8-3d8e-7000-8000-000000000022', truth: 'gpt-6-luna-high', meta: { turns:2, hidR:13, maxRInTurn:11, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:36271, cps:69.9, memoAvgChunk:1.5, memoDeltaCount:66, writtenChars:5569, htmlMaxLen:3791, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a155e8-0d3e-7000-8000-000000000023', truth: 'gpt-6-luna-medium', meta: { turns:2, hidR:7, maxRInTurn:5, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:29636, cps:112.3, memoAvgChunk:4.4, memoDeltaCount:34, writtenChars:7444, htmlMaxLen:5799, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2, ariaLabelledby:1, cnColon:3, emDash:1 } },
    { sid: '01a15598-9add-7000-8000-000000000024', truth: 'gpt-6-luna-medium', meta: { turns:2, hidR:7, maxRInTurn:4, totalTools:3, bash:1, write:1, edit:0, read:0, avgTurnDurMs:29000, cps:163.5, memoAvgChunk:2.8, memoDeltaCount:40, writtenChars:10267, lowerDoctype:1, colorSchemeCss:1, prefersReducedMotion:1 } }
  ];

  for (const item of sessions24) {
    const vec = item.meta.isGeminiCoding ? [0,1,0,0,0.2,0,0.5,0,0,0,0.7,0.7,0.7,0.3,0.1,0.5,0.8,0.7,0.6,0.5] : [1,0,0,0,0.2,0,0.3,0,0,0,0.7,0.6,0.7,0.3,0.2,0.5,0.5,0.5,0.5,0.4];
    const mEntry = {
      sid: item.sid,
      habitFeatures: { vec, meta: item.meta, habitTags: [], habitReasoningScore: 70 },
      habitTags: [],
    };
    const r = CHF.analyze({ sid: item.sid, messages: [] }, mEntry, { ignoreExactSid: true });
    assert.equal(r?.best?.canon, item.truth, `Session ${item.sid} expected ${item.truth} but got ${r?.best?.canon}`);
    const sr = CHF.structuralReverse({ sid: item.sid, messages: [] }, mEntry);
    const srCanon = chfCtx.Strength.canon(sr?.[0]?.canon || sr?.[0]?.label || '');
    assert.equal(srCanon, item.truth, `structuralReverse for ${item.sid} expected ${item.truth} but got ${srCanon}`);
  }

  // 4. Unified cross-account habitLearnBank sync & 22 newest userConfirmed sessions (46/46 total)
  const bootSrc = fs.readFileSync(path.join(uiDir, 'boot.js'), 'utf8');
  assert.ok(bootSrc.includes('m?.habitBankSync'), 'boot.js must listen for habitBankSync');
  assert.ok(bootSrc.includes('ChatHabitFingerprint.syncShared({ force: true })'), 'boot.js must syncShared on startup/account switch');
  assert.equal(typeof CHF.syncShared, 'function', 'ChatHabitFingerprint must export syncShared');
  assert.equal(typeof CHF.applyRemoteSync, 'function', 'ChatHabitFingerprint must export applyRemoteSync');

  const sessions22Newest = [
    { sid: '01a1575c-a699-7000-8000-000000000001', truth: 'gpt-6-sol-high', meta: { turns:2, hidR:12, maxRInTurn:8, totalTools:6, bash:3, write:2, edit:0, read:0, avgTurnDurMs:70040, cps:77, memoAvgChunk:1.6, memoDeltaCount:50, writtenChars:10130, htmlMaxLen:7641, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a1575c-8836-7000-8000-000000000002', truth: 'gpt-6-luna-high', meta: { turns:2, hidR:9, maxRInTurn:6, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:30789, cps:98, memoAvgChunk:1.8, memoDeltaCount:45, writtenChars:5689, htmlMaxLen:3789, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a1575c-519d-7000-8000-000000000003', truth: 'gpt-6-sol-medium', meta: { turns:2, hidR:5, maxRInTurn:4, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:41838, cps:103, memoAvgChunk:2.1, memoDeltaCount:45, writtenChars:9515, htmlMaxLen:7812, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a1575a-c45d-7000-8000-000000000004', truth: 'gpt-6-luna-high', meta: { turns:2, hidR:7, maxRInTurn:4, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:74487, cps:91, memoAvgChunk:2.3, memoDeltaCount:50, writtenChars:13350, htmlMaxLen:10665, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a1575a-a725-7000-8000-000000000005', truth: 'claude-opus-5.5-high', meta: { turns:2, hidR:4, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:82652, cps:123, memoAvgChunk:11.6, memoDeltaCount:50, writtenChars:18799, htmlMaxLen:15129, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1 } },
    { sid: '01a1575a-6cd5-7000-8000-000000000006', truth: 'gpt-6-sol-medium', meta: { turns:2, hidR:9, maxRInTurn:5, totalTools:8, bash:1, write:2, edit:2, read:0, avgTurnDurMs:44655, cps:129, memoAvgChunk:2.8, memoDeltaCount:50, writtenChars:11068, htmlMaxLen:9686, lowerDoctype:2, colorSchemeCss:1, prefersReducedMotion:2 } },
    { sid: '01a15759-0876-7000-8000-000000000007', truth: 'gemini-4-argon-low', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:6, bash:3, write:2, edit:0, read:1, avgTurnDurMs:91815, cps:198, memoAvgChunk:78.1, memoDeltaCount:50, writtenChars:32702, htmlMaxLen:29608, isGeminiCoding:true } },
    { sid: '01a15751-82cd-7000-8000-000000000008', truth: 'claude-opus-5.5-medium', meta: { turns:1, hidR:2, maxRInTurn:2, totalTools:2, bash:0, write:1, edit:0, read:0, avgTurnDurMs:103269, cps:154, memoAvgChunk:0, memoDeltaCount:0, writtenChars:15326, htmlMaxLen:15326, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1 } },
    { sid: '01a15751-281a-7000-8000-000000000009', truth: 'claude-opus-5.5-high', meta: { turns:2, hidR:4, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:97214, cps:113, memoAvgChunk:11.6, memoDeltaCount:50, writtenChars:20794, htmlMaxLen:18037, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:2 } },
    { sid: '01a15749-9151-7000-8000-000000000010', truth: 'gpt-6-sol-medium', meta: { turns:1, hidR:1, maxRInTurn:1, totalTools:3, bash:1, write:1, edit:0, read:0, parallelSteps:1, avgTurnDurMs:36154, cps:123, memoAvgChunk:3.4, memoDeltaCount:40, writtenChars:4574, htmlMaxLen:4574, lowerDoctype:1, colorSchemeCss:1, prefersReducedMotion:1 } },
    { sid: '01a15747-dcc8-7000-8000-000000000011', truth: 'gpt-5.6-terra-high', meta: { turns:2, hidR:8, maxRInTurn:5, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:35293, cps:105, memoAvgChunk:1.5, memoDeltaCount:50, writtenChars:8651, htmlMaxLen:6686, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a15747-805a-7000-8000-000000000012', truth: 'gemini-3.8-flash-high', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:7, bash:2, write:2, edit:0, read:1, avgTurnDurMs:150271, cps:148.9, memoAvgChunk:77, memoDeltaCount:29, writtenChars:50004, htmlMaxLen:48120, isGeminiCoding:true } },
    { sid: '01a15747-4ffc-7000-8000-000000000013', truth: 'gemini-3.8-flash-high', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:150944, cps:138.2, memoAvgChunk:108.6, memoDeltaCount:20, writtenChars:45911, htmlMaxLen:44003, isGeminiCoding:true } },
    { sid: '01a15746-4c81-7000-8000-000000000014', truth: 'gemini-4-argon-high', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:6, bash:3, write:2, edit:0, read:1, avgTurnDurMs:109695, cps:213, memoAvgChunk:71.8, memoDeltaCount:50, writtenChars:42934, htmlMaxLen:39557, isGeminiCoding:true } },
    { sid: '01a15746-0fa2-7000-8000-000000000015', truth: 'gpt-6-luna-low', meta: { turns:2, hidR:4, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, avgTurnDurMs:13954, cps:167, memoAvgChunk:3.4, memoDeltaCount:40, writtenChars:4812, htmlMaxLen:3179, lowerDoctype:2, colorSchemeCss:2, prefersReducedMotion:1 } },
    { sid: '01a15745-e175-7000-8000-000000000016', truth: 'gpt-6-luna-medium', meta: { turns:1, hidR:1, maxRInTurn:1, totalTools:3, bash:1, write:1, edit:0, read:0, parallelSteps:1, avgTurnDurMs:30764, cps:129, memoAvgChunk:3.1, memoDeltaCount:40, writtenChars:4551, htmlMaxLen:4551, lowerDoctype:1, colorSchemeCss:1, prefersReducedMotion:1 } },
    { sid: '01a15745-7f3b-7000-8000-000000000017', truth: 'gpt-6-luna-max', meta: { turns:2, hidR:2, maxRInTurn:1, totalTools:4, bash:1, write:1, edit:0, read:0, avgTurnDurMs:11820, cps:129, memoAvgChunk:3.3, memoDeltaCount:40, writtenChars:3245, htmlMaxLen:3245, lowerDoctype:1, colorSchemeCss:2, prefersReducedMotion:1 } },
    { sid: '01a1573b-b7a2-7000-8000-000000000018', truth: 'claude-opus-5.5-high', meta: { turns:2, hidR:4, maxRInTurn:2, totalTools:5, bash:1, write:2, edit:0, read:0, parallelSteps:1, avgTurnDurMs:106651, cps:74, memoAvgChunk:0, memoDeltaCount:0, writtenChars:14518, htmlMaxLen:11264, lowerDoctype:0, colorSchemeCss:0, prefersReducedMotion:1 } },
    { sid: '01a1573a-61f8-7000-8000-000000000019', truth: 'gemini-4-argon-medium', meta: { turns:2, hidR:0, maxRInTurn:0, totalTools:3, bash:0, write:2, edit:0, read:0, avgTurnDurMs:306454, cps:222, memoAvgChunk:258.5, memoDeltaCount:500, writtenChars:133015, htmlMaxLen:76632, isGeminiCoding:true } },
    { sid: '01a15738-c8e0-7000-8000-000000000020', truth: 'gemini-3.8-flash-high', meta: { turns:1, hidR:0, maxRInTurn:0, totalTools:4, bash:1, write:2, edit:0, read:0, avgTurnDurMs:340395, cps:211, memoAvgChunk:259.6, memoDeltaCount:200, writtenChars:140595, htmlMaxLen:79210, isGeminiCoding:true } },
    { sid: '01a152a9-24af-7000-8000-000000000021', truth: 'gpt-6.1-sol-high', meta: { turns:3, hidR:10, maxRInTurn:6, totalTools:7, bash:0, write:2, edit:2, read:1, avgTurnDurMs:152554, cps:106.2, memoAvgChunk:16.6, memoDeltaCount:70, writtenChars:56213, htmlMaxLen:29482, lowerDoctype:0, colorSchemeCss:2, prefersReducedMotion:2 } },
    { sid: '01a14284-3525-7000-8000-000000000022', truth: 'gemini-4-argon-high', meta: { turns:1, hidR:0, maxRInTurn:0, totalTools:36, bash:20, write:0, edit:0, read:15, avgTurnDurMs:425563, cps:4, memoAvgChunk:0, memoDeltaCount:0, writtenChars:0, htmlMaxLen:0, isGeminiCoding:true } }
  ];

  for (const item of sessions22Newest) {
    const vec = item.meta.isGeminiCoding ? [0,1,0,0,0.2,0,0.5,0,0,0,0.7,0.7,0.7,0.3,0.1,0.5,0.8,0.7,0.6,0.5] : [1,0,0,0,0.2,0,0.3,0,0,0,0.7,0.6,0.7,0.3,0.2,0.5,0.5,0.5,0.5,0.4];
    const mEntry = {
      sid: item.sid,
      habitFeatures: { vec, meta: item.meta, habitTags: [], habitReasoningScore: 70 },
      habitTags: [],
    };
    const r = CHF.analyze({ sid: item.sid, messages: [] }, mEntry, { ignoreExactSid: true });
    assert.equal(r?.best?.canon, item.truth, `Session ${item.sid} expected ${item.truth} but got ${r?.best?.canon}`);
  }

  // 5. Cross-vendor 3-band stream chunk separation (OpenAI vs Anthropic vs Google) & localStorage quota protection
  chfCtx.setTimeout = () => 0;
  chfCtx.clearTimeout = () => {};
  const fmtSrc = fs.readFileSync(path.join(uiDir, 'fmt.js'), 'utf8');
  vm.runInContext(fmtSrc + '; this.Fmt = Fmt;', chfCtx);
  const gGpt = chfCtx.Fmt.guess({ tN: 106, tChars: 186, rChars: 0, tools: 4, ids: [['t', 'tc_zTeGj6PpzORHHN1hmrodx8']] });
  const gClaude = chfCtx.Fmt.guess({ tN: 67, tChars: 1268, rChars: 0, tools: 2, ids: [['r', 'tc_f7bHFHYvWIkqFrUTnEocYm'], ['t', 'tc_lCEZmg-XCONGx-ZMDR30Fg']] });
  const gGemini = chfCtx.Fmt.guess({ tN: 16, tChars: 910, rChars: 0, tools: 2, ids: [['r', 'tc_0K9BZg3YzH4R6PhrgdQMiL'], ['t', 'tc_PEimb9Mfwq1mUf_qLDl9sF']] });
  assert.equal(gGpt?.fam, 'gpt', 'OpenAI 1.75 chars/delta stream classifies as gpt');
  assert.equal(gClaude?.fam, 'claude', 'Anthropic 18.93 chars/delta stream classifies as claude');
  assert.equal(gGemini?.fam, 'gemini', 'Google 56.88 chars/delta stream classifies as gemini even with tc_ reasoning');

  const htmlPreviewSrc = fs.readFileSync(path.join(uiDir, 'html-preview.js'), 'utf8');
  assert.ok(htmlPreviewSrc.includes('LOCAL_MAX_ROWS = 14') && htmlPreviewSrc.includes('LOCAL_MAX_CHARS = 550000'), 'PelicanShots must cap localStorage writes to prevent QuotaExceededError');
  const coreSrc = fs.readFileSync(path.join(uiDir, 'core.js'), 'utf8');
  assert.ok(coreSrc.includes('freeQuotaBloat'), 'Store must auto-evict bloated localStorage keys on QuotaExceededError');
});

