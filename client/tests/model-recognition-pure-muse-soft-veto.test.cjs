'use strict';
// Pure (non-routed) Muse conversation misread as GPT: the assistant's own
// pelican HTML carries /* ---- */ section comments and a python heredoc,
// which the full-conversation path treated as "hard Anthropic evidence" and
// used to veto the strong Muse HTML/SVG fingerprint (knee IK / svgTitle+
// svgDesc, ruleScore 0.78). With the veto in place the raw habit vector let
// an OpenAI candidate win 97.8 vs 96.6. Soft surface habits must not veto a
// structural fingerprint; wire-level hard evidence still must.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientDir = path.resolve(__dirname, '..');

function createCtx() {
  const pelicanModel = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/pelican-classifier-model.json'), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const claudeV5 = require(path.join(clientDir, 'ui/arena-trace/claude-standalone-v5.js'));
  const gptV1 = require(path.join(clientDir, 'ui/arena-trace/gpt-standalone-v1.js'));
  const pricing = require(path.join(clientDir, 'ui/arena-trace/pricing.js'));
  const billing = require(path.join(clientDir, 'ui/billing-probe.js'));
  const hbbSrc = fs.readFileSync(path.join(clientDir, 'ui/habit-builtin-bank.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8')
    .replace('/*__PELICAN_CLASSIFIER_MODEL__*/null', JSON.stringify(pelicanModel));
  const modelsStore = {};
  const chatsStore = {};
  const ctx = vm.createContext({
    console, Math, Date, JSON, Set, Map, WeakMap, Array, Object, Number, String, Boolean, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    TextEncoder, Uint8Array, Float32Array, Float64Array,
    setTimeout: () => 0, clearTimeout: () => {}, queueMicrotask, now: Date.now,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    Store: { get: () => null, set: () => {} },
    Models: { all: modelsStore, get: (id) => modelsStore[id] || null, set: (id, v) => { modelsStore[id] = v; } },
    Chats: { get: (id) => chatsStore[id] || null },
    Strength: { canon: (s) => String(s || '').trim().toLowerCase().replace(/\s*\(([^)]+)\)\s*$/, '-$1').replace(/\s+/g, '-') },
    Titles: { local: () => {}, touch: () => {}, capture: () => {}, kick: () => {}, want: () => '' },
    Notes: { rec: () => ({}), save: () => {} },
    History: { byId: () => null },
    Bus: { emit: () => {}, on: () => {} },
    Dock: { soon: () => {} },
    Tabs: { cur: null },
    Gacha: { isGachaChat: () => false, isKilledOpenChat: () => false },
    h: () => ({}),
    document: {}, UI: { renderListSoon: () => {}, renderTabs: () => {} },
    ArenaPricing: pricing, ArenaBilling: billing,
    ClaudeStandaloneClassifierV5: claudeV5, ArenaGptStandaloneV1: gptV1, BillingCatalog: catalog,
    window: {}, globalThis: null,
  });
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInContext(hbbSrc + '\n' + bpUiSrc + '\n;this.CHF = ChatHabitFingerprint; this.BP = BillingProbe;', ctx);
  return { CHF: ctx.CHF, modelsStore, chatsStore };
}

function padCircles(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += '<circle cx="' + (20 + i % 900) + '" cy="' + (30 + i % 500) + '" r="3" fill="#7dd3fc"/><path d="M' + (i % 800) + ' ' + (i % 400) + ' L' + ((i + 40) % 900) + ' ' + ((i + 60) % 500) + '"/><g></g>\n';
  return s;
}

// Muse pelican as Muse Spark actually writes it: lowercase <!doctype>,
// /* ---- */ section comments, svgTitle/svgDesc pair, pedalNear/pedalFar,
// knee IK solver. The soft markers must not veto the structural rule.
const museSoftHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Pelican Ride</title><style>\n'
  + '/* ---- Bicycle geometry (SVG units) ---- */\n:root{--ink:#1c2833;--sky:#bfe6ff} body{margin:0;background:#e3f6ff}\n'
  + '/* ---- Animation state: one master angle ---- */\n</style></head><body>\n'
  + '<svg viewBox="0 0 960 560" aria-labelledby="svgTitle svgDesc">\n<title id="svgTitle">Pelican Ride</title><desc id="svgDesc">Animated pelican on a bicycle</desc>\n'
  + '<g id="legNear"></g><g id="legFar"></g><g id="footNear"></g><g id="footFar"></g><g id="pedalNear"></g><g id="pedalFar"></g>\n'
  + padCircles(180)
  + '</svg>\n<script>\nfunction knee(hip, pedal){ const dx=pedal.x-hip.x; const dy=pedal.y-hip.y; const d=Math.hypot(dx, dy) || 1; return {x:hip.x+dx/d*20, y:hip.y+dy/d*20}; }\n'
  + 'let last=0; function tick(now){ const dt=Math.min((now-last)/1000, 0.05); last=now; requestAnimationFrame(tick); } requestAnimationFrame(tick);\n</' + 'script></body></html>';

// GPT pelican that also carries a /* ---- */ comment: the soft-veto bypass
// must not leak -- color-scheme blocks the Muse knee rule up front.
const gptSoftHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><style>\n'
  + '/* ---- theme ---- */\n:root { color-scheme: light; --ink: #1c2833; }\n@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }\n</style></head><body>\n'
  + '<svg viewBox="0 0 960 560" aria-labelledby="svg-title svg-desc">\n<title id="svg-title">Pedal-powered Pelican</title><desc id="svg-desc">Animated SVG scene</desc>\n'
  + '<g id="legFar"></g><g id="footFar"></g><g id="pedalFar"></g><g id="legNear"></g><g id="footNear"></g><g id="pedalNear"></g>\n'
  + padCircles(180)
  + '</svg>\n<script>requestAnimationFrame(function tick(){});</' + 'script></body></html>';

function makeAsstMsg(o) {
  const parts = [];
  for (let i = 0; i < (o.rCount || 0); i++) parts.push({ type: 'reasoning', text: '', providerMetadata: o.fmt === 'openai' ? { openai: { reasoningEncryptedContent: 'enc' } } : {} });
  if (o.htmlCode) parts.push({ type: 'tool-write_file', toolCallId: (o.toolCallIdPrefix || 'tc_') + '1', toolName: 'write_file', input: { path: o.htmlFile || 'index.html', content: o.htmlCode }, output: 'ok' });
  if (o.bashCmd) parts.push({ type: 'tool-bash', toolCallId: (o.toolCallIdPrefix || 'tc_') + '2', toolName: 'bash', input: { command: o.bashCmd, cwd: '/home/user', timeout: 120000 }, output: 'ok' });
  parts.push({ type: 'text', text: o.text || 'done' });
  return { id: o.id, role: 'assistant', status: 'completed', _fmt: o.fmt || undefined, parts, text: o.text || 'done', durationMs: o.durMs || 60000, _streamStats: { cps: o.cps || 82, avgChunk: o.avgChunk || 10.4, deltaCount: o.deltaCount || 300, tN: o.deltaCount || 300, tChars: Math.round((o.avgChunk || 10.4) * (o.deltaCount || 300)) } };
}

// Same shape as the misidentified live session: 2 turns, python3 -c probe,
// then the pelican page plus a python heredoc verification step.
function pureMuseSoftChat(sid) {
  return { sid, messages: [
    { id: 'u1', role: 'user', text: '微测：帮我写一个工具脚本' },
    makeAsstMsg({ id: 'a1', rCount: 2, bashCmd: "python3 -c 'import sys; print(sys.version)'", text: '先检查一下环境，然后写脚本。', cps: 82, avgChunk: 10.4, deltaCount: 300, durMs: 50000 }),
    { id: 'u2', role: 'user', text: '画一只骑自行车的鹈鹕，SVG动画，要柔和顺滑' },
    makeAsstMsg({ id: 'a2', rCount: 3, htmlFile: 'pelican.html', htmlCode: museSoftHtml, bashCmd: "python3 - <<'EOF'\nprint('ok')\nEOF", text: '页面已生成，鹈鹕骑行动画完成。', cps: 82, avgChunk: 10.4, deltaCount: 900, durMs: 120000 }),
  ] };
}

test('strong Muse HTML fingerprint fires despite box comments in the page', () => {
  const { CHF } = createCtx();
  const hm = CHF.classifyHtmlSvg(museSoftHtml, { isOpenThink: false, strictOpenClosed: true });
  assert.equal(hm?.best?.vendorId, 'meta');
  assert.ok(Number(hm?.best?.ruleScore) >= 0.78, 'knee/svgTitle rule class must reach the strong tier');
  const hg = CHF.classifyHtmlSvg(gptSoftHtml, { isOpenThink: false, strictOpenClosed: true });
  assert.equal(hg?.best?.vendorId, 'openai');
});

test('pure Muse session with box comments + heredoc is Muse, not GPT 5.6 Sol', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = pureMuseSoftChat('test-pure-muse-soft-veto');
  modelsStore[chat.sid] = { name: 'gpt-5.6-sol-high', rawLabel: 'GPT 5.6 Sol (High)', sure: true, confidence: 97.8, habitInferred: true, reverseInferred: true, billingProbe: true, reverseVer: 186, lastMessageId: 'a2', completedTurnCount: 2 };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: true });
  assert.equal(res?.name, 'muse-spark-1.3-max');
  assert.equal(Boolean(res?.routed), false);
  const top = (res?.habitCandidates || [])[0];
  assert.equal(top?.id, 'meta/muse-spark-1.3-max');
});

test('cached ver-186 GPT label on this Muse session auto-heals at ver 187 without force', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = pureMuseSoftChat('test-pure-muse-soft-heal');
  modelsStore[chat.sid] = { name: 'gpt-5.6-sol-high', candidateName: 'gpt-5.6-sol-high', rawLabel: 'GPT 5.6 Sol (High)', habitInferred: true, reverseInferred: true, billingProbe: true, sure: true, confidence: 97.8, reverseVer: 186, lastMessageId: 'a2', completedTurnCount: 2 };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: false });
  assert.equal(res?.name, 'muse-spark-1.3-max');
  assert.equal(res?.reverseVer, 187);
});

test('GPT session whose page also has box comments stays GPT (no veto-bypass leak)', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = { sid: 'test-pure-gpt-soft-control', messages: [
    { id: 'u1', role: 'user', text: 'pelican please' },
    makeAsstMsg({ id: 'a1', fmt: 'openai', toolCallIdPrefix: 'call_AbCdEfGhIjKlMnOpQrStUvWx', rCount: 12, htmlFile: 'pelican.html', htmlCode: gptSoftHtml, bashCmd: "python3 -c 'x=1'", text: 'done sandbox:/home/user/pelican.html', cps: 40, avgChunk: 1.7, deltaCount: 180, durMs: 140000 }),
  ] };
  modelsStore[chat.sid] = { name: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', sure: true, confidence: 95, habitInferred: true };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: true });
  assert.match(String(res?.name || ''), /^gpt-/);
});

test('version stamps moved to 187 so cached ver-186 labels recompute', () => {
  const src = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');
  assert.ok(src.includes('hasStrongMuseHtmlRule'), 'strong Muse HTML override exists');
  assert.ok(src.includes('reverseVer: 187'), 'writers stamp 187');
  assert.ok(!src.includes('reverseVer: 186'), 'no stale 186 writer remains');
  assert.ok(!src.includes('_mismatchCheckedVer: 186'), 'no stale 186 mismatch stamp remains');
  assert.ok(!src.includes('_mismatchCheckedVer = 186'), 'no stale 186 mismatch assignment remains');
});
