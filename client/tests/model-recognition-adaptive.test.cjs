'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientDir = path.resolve(__dirname, '..');

function createHabitVm() {
  const pelicanModel = JSON.parse(
    fs.readFileSync(path.join(clientDir, 'ui/arena-trace/pelican-classifier-model.json'), 'utf8')
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8')
  );
  const claudeV5 = require(path.join(clientDir, 'ui/arena-trace/claude-standalone-v5.js'));
  const gptV1 = require(path.join(clientDir, 'ui/arena-trace/gpt-standalone-v1.js'));
  const pricing = require(path.join(clientDir, 'ui/arena-trace/pricing.js'));
  const billing = require(path.join(clientDir, 'ui/billing-probe.js'));

  const hbbSrc = fs.readFileSync(path.join(clientDir, 'ui/habit-builtin-bank.js'), 'utf8');
  let bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  bpUiSrc = bpUiSrc.slice(0, bpUiSrc.indexOf('const BillingProbe ='));
  bpUiSrc = bpUiSrc.replace('/*__PELICAN_CLASSIFIER_MODEL__*/null', JSON.stringify(pelicanModel));

  const ctx = vm.createContext({
    console, Math, Date, JSON, Set, Map, WeakMap, Array, Object, Number, String, Boolean, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    TextEncoder, Uint8Array, Float32Array, Float64Array,
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: Date.now,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {},
    UI: {},
    ArenaPricing: pricing,
    ArenaBilling: billing,
    ClaudeStandaloneClassifierV5: claudeV5,
    ArenaGptStandaloneV1: gptV1,
    BillingCatalog: catalog,
    window: {},
    globalThis: null,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInContext(hbbSrc + '\n' + bpUiSrc + '\n;this.CHF = ChatHabitFingerprint; this.BANK = BUILTIN_HABIT_BANK.samples;', ctx);
  return ctx;
}

const ctx = createHabitVm();
const CHF = ctx.CHF;

test('GPT vs Muse HTML/SVG rule guard: near/far leg+foot with OpenAI color-scheme never hijacks to Muse Spark 1.3', () => {
  const gptPelicanHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
:root { color-scheme: light; --ink: #1c2833; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style></head><body>
<svg viewBox="0 0 960 560" aria-labelledby="svg-title svg-desc">
  <title id="svg-title">Pedal-powered Pelican</title>
  <desc id="svg-desc">Animated SVG scene</desc>
  <g id="legFar"></g><g id="footFar"></g><g id="pedalFar"></g>
  <g id="legNear"></g><g id="footNear"></g><g id="pedalNear"></g>
</svg>
<script>requestAnimationFrame(function tick(){});</script>
</body></html>`;
  const hm = CHF.classifyHtmlSvg(gptPelicanHtml, { isOpenThink: false, strictOpenClosed: true });
  assert.notEqual(hm?.best?.vendorId, 'meta', 'HTML with OpenAI color-scheme + generic legNear/footNear must not match Meta Muse');

  const gptMeta = {
    turns: 2, hidR: 60, maxRInTurn: 43, totalTools: 6, bash: 1, write: 2, edit: 1, read: 0, search: 0, askUser: 0,
    avgTurnDurMs: 203422, cps: 44.3, memoAvgChunk: 1.5, memoDeltaCount: 208, writtenChars: 20828, htmlMaxLen: 16292,
    meanChars: 9006, nonCodeMeanChars: 9006, pyHeredoc: 1, lowerDoctype: 2, colorSchemeCss: 2, prefersReducedMotion: 2,
    ariaLabelledby: 1, cssRoot: 2, raf: 1, svgRich: 1, bashPy3InlineC: 1, bashCwdParam: 1, wireFam: 'openai',
    htmlSvgMatch: {
      code_type: 'html_svg',
      best: { model_id: 'meta/muse-spark-1.3', canon: 'muse-spark-1.3-max', vendor: 'Meta', vendorId: 'meta', ruleScore: 0.78, protoSim: 0.188, score: 0.906, confidence: 0.819 },
      top_candidates: [
        { model_id: 'meta/muse-spark-1.3', canon: 'muse-spark-1.3-max', vendor: 'Meta', vendorId: 'meta', ruleScore: 0.78, protoSim: 0.188, score: 0.906, confidence: 0.819 },
        { model_id: 'openai/gpt-6-luna', canon: 'gpt-6-luna-max', vendor: 'OpenAI', vendorId: 'openai', ruleScore: 0, protoSim: 0.64, tokenNorm: 0.763, score: 0.631, confidence: 0.137 },
      ],
    },
  };
  const res = CHF.analyze({ sid: 'test-gpt-as-muse-1', messages: [] }, { sid: 'test-gpt-as-muse-1', habitFeatures: { meta: gptMeta } }, { ignoreExactSid: true });
  assert.equal(res?.best?.vendorId, 'openai');
});

test('GPT with grep -Eo | wc -l in bash + OpenAI wire/chunk/sandbox never hijacks to Muse Spark 1.3', () => {
  const gptMeta2 = {
    turns: 2, hidR: 61, maxRInTurn: 48, totalTools: 5, bash: 1, write: 2, edit: 0,
    avgTurnDurMs: 219273, cps: 30.4, memoAvgChunk: 2.1, memoDeltaCount: 203, writtenChars: 15206, htmlMaxLen: 11911,
    meanChars: 6672, nonCodeMeanChars: 6672, sandboxLink: 1, lowerDoctype: 2, colorSchemeCss: 2, prefersReducedMotion: 2,
    svgSmilNoScript: 1, ariaLabelledby: 1, cssRoot: 2, svgRich: 1,
    bashWcCombined: 1, bashGrepSvgTags: 1, bashGrepPipeWc: 1, bashCwdParam: 1, wireFam: 'openai',
  };
  const res = CHF.analyze({ sid: 'test-gpt-as-muse-2', messages: [] }, { sid: 'test-gpt-as-muse-2', habitFeatures: { meta: gptMeta2 } }, { ignoreExactSid: true });
  assert.equal(res?.best?.vendorId, 'openai');
});

test('Muse multi-turn coding with wc -l -c && ls -lh + large chunks + zero OpenAI CSS identifies as Meta Muse', () => {
  const museMeta = {
    turns: 3, hidR: 10, maxRInTurn: 4, totalTools: 7, bash: 1, write: 2, edit: 0, read: 0,
    avgTurnDurMs: 52000, cps: 127.7, memoAvgChunk: 42.2, memoDeltaCount: 25, writtenChars: 14500, htmlMaxLen: 8309,
    meanChars: 6200, nonCodeMeanChars: 6200, lowerDoctype: 0, colorSchemeCss: 0, prefersReducedMotion: 0, sandboxLink: 0,
    emDash: 3, svgRich: 2, bashWcSeparate: 1, bashWcLsLh: 1, bashHomePath: 1, bashCwdParam: 1,
  };
  const res = CHF.analyze({ sid: 'test-muse-as-gpt6', messages: [] }, { sid: 'test-muse-as-gpt6', habitFeatures: { meta: museMeta } }, { ignoreExactSid: true });
  assert.equal(res?.best?.vendorId, 'meta');
  assert.match(res?.best?.canon || '', /^muse-/);
});

test('Muse slow deep-reasoning Pelican turn with tinyShadow/framePaint coincidence stays Meta Muse (not GPT-6 Astra)', () => {
  const musePelican1Turn = {
    turns: 1, hidR: 18, maxRInTurn: 18, totalTools: 2, bash: 0, write: 1, edit: 0,
    avgTurnDurMs: 494906, cps: 26.7, memoAvgChunk: 5.2, memoDeltaCount: 54, writtenChars: 15233, htmlMaxLen: 15233,
    meanChars: 13227, nonCodeMeanChars: 13227, lowerDoctype: 1, colorSchemeCss: 0, prefersReducedMotion: 0, sandboxLink: 0,
    ariaLabelledby: 1, cssRoot: 1, raf: 1, svgRich: 1,
    htmlSvgMatch: {
      code_type: 'html_svg',
      best: {
        model_id: 'openai/gpt-5.6-sol', canon: 'gpt-5.6-sol-max', vendor: 'OpenAI', vendorId: 'openai',
        score: 0.88, protoSim: 0.348, tokenNorm: 0.364, ruleScore: 0.55, confidence: 0.937,
        reasons: ['GPT 5.6 Sol tinyShadow/framePaint', '特征词:framePaint', '特征词:tinyShadow'],
      },
      top_candidates: [
        {
          model_id: 'openai/gpt-5.6-sol', canon: 'gpt-5.6-sol-max', vendor: 'OpenAI', vendorId: 'openai',
          score: 0.88, protoSim: 0.348, tokenNorm: 0.364, ruleScore: 0.55, confidence: 0.937,
          reasons: ['GPT 5.6 Sol tinyShadow/framePaint'],
        },
      ],
    },
  };
  const res = CHF.analyze({ sid: 'test-muse-pelican-1t', messages: [] }, { sid: 'test-muse-pelican-1t', habitFeatures: { meta: musePelican1Turn } }, { ignoreExactSid: true });
  assert.equal(res?.best?.vendorId, 'meta');
  assert.equal(res?.best?.canon, 'muse-spark-1.3-max');
});

test('Adaptive Arena tool-name aliases & optional present_file calls extract identical core features', () => {
  const htmlCode = '<!DOCTYPE html><html><head><style>:root{--a:1;}</style></head><body><svg viewBox="0 0 800 500"><path d="M0 0L10 10"/><circle cx="5" cy="5" r="3"/><g></g></svg><script>requestAnimationFrame(()=>{});</script></body></html>'.repeat(12);
  const canonChat = {
    sid: 'alias-canon-1',
    messages: [
      { role: 'user', status: 'completed', text: 'Build an animated SVG card' },
      {
        id: '01950000-0000-7000-8000-000000000001',
        role: 'assistant',
        status: 'completed',
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'tool-write_file', toolCallId: 'tc_1', toolName: 'write_file', input: { file_path: 'card.html', content: htmlCode } },
          { type: 'tool-edit_file', toolCallId: 'tc_2', toolName: 'edit_file', input: { file_path: 'card.html', old_text: '--a:1', new_text: '--a:2' } },
          { type: 'tool-bash', toolCallId: 'tc_3', toolName: 'bash', input: { command: 'wc -lc card.html' } },
          { type: 'tool-present_file', toolCallId: 'tc_4', toolName: 'present_file', input: { file_path: 'card.html' } },
        ],
      },
    ],
  };
  const aliasChat = {
    sid: 'alias-variant-1',
    messages: [
      { role: 'user', status: 'completed', text: 'Build an animated SVG card' },
      {
        id: '01950000-0000-7000-8000-000000000002',
        role: 'assistant',
        status: 'completed',
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'dynamic-tool', toolCallId: 'tc_a', toolName: 'create_file', args: { TargetFile: 'card.html', CodeContent: htmlCode } },
          { type: 'dynamic-tool', toolCallId: 'tc_b', toolName: 'str_replace', args: { path: 'card.html', old_str: '--a:1', new_str: '--a:2' } },
          { type: 'dynamic-tool', toolCallId: 'tc_c', toolName: 'run_command', args: { cmd: 'wc -lc card.html' } },
          { type: 'dynamic-tool', toolCallId: 'tc_d', toolName: 'open_preview', args: { path: 'card.html' } },
          { type: 'dynamic-tool', toolCallId: 'tc_e', toolName: 'show_file', args: { path: 'card.html' } },
        ],
      },
    ],
  };
  const fCanon = CHF.extractFeatures(canonChat, null, { ignoreExactSid: true });
  const fAlias = CHF.extractFeatures(aliasChat, null, { ignoreExactSid: true });
  assert.equal(fAlias.write, fCanon.write);
  assert.equal(fAlias.edit, fCanon.edit);
  assert.equal(fAlias.bash, fCanon.bash);
  assert.equal(fAlias.writtenChars, fCanon.writtenChars);
  assert.equal(fAlias.bashWcCombined, 1);
  assert.equal(fAlias.present, 2);
});

test('Multi-vendor leave-one-out & optional +1 present_file perturbation maintains >=99% vendor stability', () => {
  let vendorOk = 0, total = 0, presentFlips = 0;
  for (let i = 0; i < ctx.BANK.length; i++) {
    const s = ctx.BANK[i];
    if (!s || !s.model || !s.meta) continue;
    total++;
    const expDecomp = CHF.decomposeModelIdentity(s.model, { vendor: s.vendor, family: s.family, effort: s.effort, rawLabel: s.rawLabel });
    const fakeSid = 'loo-check-' + i + (/#[ab]$/i.test(s.sid || '') ? '#b' : '');
    const r = CHF.analyze(
      { sid: fakeSid, _origSid: s.sid, messages: [] },
      { sid: fakeSid, habitFeatures: { vec: s.vec, tierVec: s.tierVec, meta: s.meta }, habitTags: s.tags || [] },
      { ignoreExactSid: true }
    );
    const predDecomp = CHF.decomposeModelIdentity(r?.best?.canon || '', { vendor: r?.best?.vendorId || r?.best?.vendor });
    if (predDecomp.vendor === expDecomp.vendor) vendorOk++;

    if (s.meta.write >= 1) {
      const pSid = 'pert-p-' + i + (/#[ab]$/i.test(s.sid || '') ? '#b' : '');
      const rp = CHF.analyze(
        { sid: pSid, _origSid: s.sid, messages: [] },
        { sid: pSid, habitFeatures: { vec: s.vec, tierVec: s.tierVec, meta: { ...s.meta, totalTools: (s.meta.totalTools || 1) + 1 } }, habitTags: s.tags || [] },
        { ignoreExactSid: true }
      );
      const ppDecomp = CHF.decomposeModelIdentity(rp?.best?.canon || '', { vendor: rp?.best?.vendorId || rp?.best?.vendor });
      if (ppDecomp.vendor !== expDecomp.vendor) presentFlips++;
    }
  }
  assert.equal(vendorOk, total, `Expected 100% vendor LOO accuracy across ${total} samples, got ${vendorOk}/${total}`);
  assert.ok(presentFlips <= 1, `Expected <=1 vendor flip under +1 present_file perturbation, got ${presentFlips}`);
});

test('pelican-test.js never overrides established habit model identity with raw single-file hmCanon when prevModel agrees', () => {
  const pelSrc = fs.readFileSync(path.join(clientDir, 'ui/pelican-test.js'), 'utf8');
  assert.ok(
    pelSrc.includes('const latestName = latestMiCanon || ((hmCanon && hmConf >= 82 && hmStrongEvidence) ? hmCanon : \'\') || name;'),
    'pelican-test.js should prioritize latestMiCanon over raw single-file hmCanon'
  );
});
