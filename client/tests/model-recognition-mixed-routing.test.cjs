'use strict';
// Mixed Muse <-> GPT mid-session routing regression.
// Covers the user-reported failures where a single conversation that starts
// with one vendor and is routed mid-way to the other was labelled entirely
// as the wrong vendor (Muse pelican turn -> GPT, GPT turn -> Muse),
// and where a Muse pelican page carrying /* ---- */ section comments was
// misread as Claude/OpenAI because boxComment was treated as hard
// Anthropic evidence and blocked the Muse HTML/SVG rules.
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
  return { CHF: ctx.CHF, BP: ctx.BP, modelsStore, chatsStore, ctx };
}

function padCircles(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += '<circle cx="' + (20 + i % 900) + '" cy="' + (30 + i % 500) + '" r="3" fill="#7dd3fc"/><path d="M' + (i % 800) + ' ' + (i % 400) + ' L' + ((i + 40) % 900) + ' ' + ((i + 60) % 500) + '"/><g></g>\n';
  return s;
}

// Muse pelican: knee IK solver + svgTitle/svgDesc + scarfFlutter, and
// deliberately carries /* ---- */ section comments (Claude-style markers)
// that must not veto the Muse fingerprint.
const musePelicanHtml = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>Pelican Ride</title><style>\n'
  + '/* ---- Bicycle geometry (SVG units) ---- */\n:root{--ink:#1c2833;--sky:#bfe6ff} body{margin:0;background:#e3f6ff}\n'
  + '/* ---- Animation state: one master angle ---- */\n</style></head><body>\n'
  + '<svg viewBox="0 0 960 560" aria-labelledby="svgTitle svgDesc">\n<title id="svgTitle">Pelican Ride</title><desc id="svgDesc">Animated pelican on a bicycle</desc>\n'
  + '<g id="legNear"></g><g id="legFar"></g><g id="footNear"></g><g id="footFar"></g><g id="pedalNear"></g><g id="pedalFar"></g><g id="scarfFlutter"><path d="M10 10 C30 5 45 15 60 10"/></g>\n'
  + padCircles(180)
  + '</svg>\n<script>\nfunction knee(hip, pedal){ const dx=pedal.x-hip.x; const dy=pedal.y-hip.y; const d=Math.hypot(dx, dy) || 1; return {x:hip.x+dx/d*20, y:hip.y+dy/d*20}; }\n'
  + 'let last=0; function tick(now){ const dt=Math.min((now-last)/1000, 0.05); last=now; requestAnimationFrame(tick); } requestAnimationFrame(tick);\n</' + 'script></body></html>';

// GPT pelican: OpenAI color-scheme + reduced-motion + fine-grained stream.
const gptPelicanHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><style>\n'
  + ':root { color-scheme: light; --ink: #1c2833; }\n@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }\n</style></head><body>\n'
  + '<svg viewBox="0 0 960 560" aria-labelledby="svg-title svg-desc">\n<title id="svg-title">Pedal-powered Pelican</title><desc id="svg-desc">Animated SVG scene</desc>\n'
  + '<g id="legFar"></g><g id="footFar"></g><g id="pedalFar"></g><g id="legNear"></g><g id="footNear"></g><g id="pedalNear"></g>\n'
  + padCircles(180)
  + '</svg>\n<script>requestAnimationFrame(function tick(){});</' + 'script></body></html>';

const genericMuseHtml = '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><style>:root{--bg:#0b1020}body{margin:0}</style></head><body><svg viewBox="0 0 800 500">'
  + '<circle cx="100" cy="100" r="40" fill="#38bdf8"/>'.repeat(80)
  + '</svg><script>requestAnimationFrame(()=>{});</script></body></html>';

const gptCardHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><style>:root{color-scheme:dark}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style></head><body><svg viewBox="0 0 600 400"><path d="M10 10 L100 100"/></svg></body></html>';

function makeAsstMsg(o) {
  const parts = [];
  for (let i = 0; i < (o.rCount || 0); i++) parts.push({ type: 'reasoning', text: '', providerMetadata: o.fmt === 'openai' ? { openai: { reasoningEncryptedContent: 'enc' } } : {} });
  if (o.htmlCode) parts.push({ type: 'tool-write_file', toolCallId: (o.toolCallIdPrefix || 'tc_') + '1', toolName: 'write_file', input: { path: o.htmlFile || 'index.html', content: o.htmlCode }, output: 'ok' });
  if (o.bashCmd) parts.push({ type: 'tool-bash', toolCallId: (o.toolCallIdPrefix || 'tc_') + '2', toolName: 'bash', input: { command: o.bashCmd, cwd: '/home/user' }, output: 'ok' });
  parts.push({ type: 'text', text: o.text || 'done' });
  return { id: o.id, role: 'assistant', status: 'completed', _fmt: o.fmt || undefined, parts, text: o.text || 'done', durationMs: o.durMs || 45000, _streamStats: { cps: o.cps || 0, avgChunk: o.avgChunk || 0, deltaCount: o.deltaCount || 40, tN: o.deltaCount || 40, tChars: Math.round((o.avgChunk || 10) * (o.deltaCount || 40)) } };
}

function pureMuseChat(sid) {
  return { sid, messages: [
    { id: 'u1', role: 'user', text: 'micro test' },
    makeAsstMsg({ id: 'a1', rCount: 0, text: '1+1=2 ok', cps: 115, avgChunk: 34, deltaCount: 12, durMs: 3200 }),
    { id: 'u2', role: 'user', text: 'dashboard' },
    makeAsstMsg({ id: 'a2', rCount: 18, htmlFile: 'dashboard.html', htmlCode: genericMuseHtml, bashCmd: "grep -Eo '<circle' dashboard.html | wc -l && stat -c '%s' dashboard.html", text: 'done', cps: 96, avgChunk: 28, deltaCount: 65, durMs: 55000 }),
  ] };
}

test('HTML/SVG fingerprint: Muse pelican with box comments is Meta, GPT pelican is OpenAI', () => {
  const { CHF } = createCtx();
  const hm = CHF.classifyHtmlSvg(musePelicanHtml, { isOpenThink: false, strictOpenClosed: true });
  assert.equal(hm?.best?.vendorId, 'meta');
  assert.ok(Number(hm?.best?.ruleScore) >= 0.55, 'Muse knee/scarf rule must fire despite /* ---- */ comments');
  const hg = CHF.classifyHtmlSvg(gptPelicanHtml, { isOpenThink: false, strictOpenClosed: true });
  assert.equal(hg?.best?.vendorId, 'openai');
});

test('pure Muse session stays Muse Spark and is not marked routed', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = pureMuseChat('test-pure-muse');
  modelsStore[chat.sid] = { name: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', sure: true, confidence: 95, habitInferred: true };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: true });
  assert.equal(res?.name, 'muse-spark-1.3-max');
  assert.equal(Boolean(res?.routed), false);
});

test('pure GPT session stays GPT and is not marked routed', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = { sid: 'test-pure-gpt', messages: [
    { id: 'u1', role: 'user', text: 'hi' },
    makeAsstMsg({ id: 'a1', fmt: 'openai', rCount: 6, text: 'hi ok', cps: 42, avgChunk: 1.9, deltaCount: 28, durMs: 9000 }),
    { id: 'u2', role: 'user', text: 'pelican' },
    makeAsstMsg({ id: 'a2', fmt: 'openai', toolCallIdPrefix: 'call_AbCdEfGhIjKlMnOpQrStUvWx', rCount: 40, htmlFile: 'pelican.html', htmlCode: gptPelicanHtml, bashCmd: "python3 -c 'x=1'", text: 'done sandbox:/home/user/pelican.html', cps: 40, avgChunk: 1.6, deltaCount: 180, durMs: 160000 }),
  ] };
  modelsStore[chat.sid] = { name: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', sure: true, confidence: 95, habitInferred: true };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: true });
  assert.match(res?.name || '', /^gpt-/);
  assert.equal(Boolean(res?.routed), false);
});

test('mixed Muse -> GPT: second OpenAI turn is detected as mid-session route to GPT', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = { sid: 'test-mixed-muse-gpt', messages: [
    { id: 'u1', role: 'user', text: 'card' },
    makeAsstMsg({ id: 'a1', rCount: 4, htmlFile: 'card.html', htmlCode: genericMuseHtml, bashCmd: "grep -Eo '<circle' card.html | wc -l", text: 'card done', cps: 120, avgChunk: 36, deltaCount: 50, durMs: 28000 }),
    { id: 'u2', role: 'user', text: 'pelican' },
    makeAsstMsg({ id: 'a2', fmt: 'openai', toolCallIdPrefix: 'call_AbCdEfGhIjKlMnOpQrStUvWx', rCount: 38, htmlFile: 'pelican.html', htmlCode: gptPelicanHtml, bashCmd: "python3 -c 'x=1'", text: 'done sandbox:/home/user/pelican.html', cps: 38, avgChunk: 1.8, deltaCount: 190, durMs: 165000 }),
  ] };
  modelsStore[chat.sid] = { name: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', sure: true, confidence: 96, habitInferred: true, lastMessageId: 'a1', completedTurnCount: 1 };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: false });
  assert.equal(Boolean(res?.routed), true, 'Muse->GPT must be marked as mid-session routing');
  assert.match(res?.name || '', /^gpt-/);
  assert.match(String(res?.routeFrom || ''), /Muse Spark/i);
  assert.match(String(res?.routeTo || ''), /GPT/i);
});

test('mixed GPT -> Muse: Muse pelican turn with box comments is detected as route to Muse (not left as GPT)', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = { sid: 'test-mixed-gpt-muse', messages: [
    { id: 'u1', role: 'user', text: 'card' },
    makeAsstMsg({ id: 'a1', fmt: 'openai', toolCallIdPrefix: 'call_ZyXwVuTsRqPoNmLkJiHgFeDc', rCount: 32, htmlFile: 'card.html', htmlCode: gptCardHtml, bashCmd: 'wc -l -c card.html', text: 'done sandbox:/home/user/card.html', cps: 36, avgChunk: 1.7, deltaCount: 180, durMs: 140000 }),
    { id: 'u2', role: 'user', text: 'pelican' },
    makeAsstMsg({ id: 'a2', rCount: 8, htmlFile: 'pelican.html', htmlCode: musePelicanHtml, bashCmd: "grep -Eo '<(svg|path|g)' pelican.html | wc -l && stat -c '%s' pelican.html", text: 'pelican done', cps: 118, avgChunk: 35, deltaCount: 80, durMs: 65000 }),
  ] };
  modelsStore[chat.sid] = { name: 'gpt-6.1-sol-high', rawLabel: 'GPT 6.1 Sol (High)', sure: true, confidence: 96, habitInferred: true, lastMessageId: 'a1', completedTurnCount: 1 };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: false });
  assert.equal(Boolean(res?.routed), true, 'GPT->Muse must be marked as mid-session routing');
  assert.equal(res?.name, 'muse-spark-1.3-max');
  assert.match(String(res?.routeFrom || ''), /GPT/i);
  assert.match(String(res?.routeTo || ''), /Muse Spark/i);
});

test('stale reverseVer 183 wrong GPT label on a Muse session auto-heals to Muse at ver 187', () => {
  const { CHF, modelsStore, chatsStore } = createCtx();
  const chat = pureMuseChat('test-stale-183');
  modelsStore[chat.sid] = { name: 'gpt-6-sol-high', candidateName: 'gpt-6-sol-high', rawLabel: 'GPT 6 Sol (High)', habitInferred: true, reverseInferred: true, billingProbe: true, sure: true, confidence: 65.8, reverseVer: 183, lastMessageId: 'a2', completedTurnCount: 2 };
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat, { force: false });
  assert.equal(res?.name, 'muse-spark-1.3-max');
  assert.equal(res?.reverseVer, 187);
});
