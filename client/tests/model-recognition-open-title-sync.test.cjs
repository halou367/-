
'use strict';
// Open-source re-identification must converge the stored identity (and thus
// the sidebar/tab title, which is built from Models) with what the right-hand
// dock already shows live. Regression for the user screenshot: fingerprint
// had named the chat "claude-opus-5.6-max", the dock correctly showed
// 「开源模型」 from compat-thinking, but list/tab/chat-header kept the stale
// closed-source name with no route indication.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientDir = path.resolve(__dirname, '..');

function createCtx(thinkKind) {
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
    ThinkingStatus: thinkKind ? { of: () => ({ kind: thinkKind }) } : undefined,
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

const genericHtml = '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><style>:root{--bg:#0b1020}body{margin:0}</style></head><body><svg viewBox="0 0 800 500">'
  + '<circle cx="100" cy="100" r="40" fill="#38bdf8"/>'.repeat(80)
  + '</svg><script>requestAnimationFrame(()=>{});</script></body></html>';

function fpEntry(extra) {
  return Object.assign({
    name: 'claude-opus-5.6-max', rawLabel: 'Claude Opus 5.6 (Max)', guess: true, confidence: 88,
    provider: '数字指纹识别',
    fingerprint: { result: { nearest: { id: 'claude-opus-5.6-max', probability: 0.91 }, status: 'clear' } },
  }, extra || {});
}

const OPEN_THINK_TEXT = '先认真想一下鹈鹕骑自行车的力学：腿部连杆、踏板圆周运动、重心保持平衡，这里把思考过程完整写出来给用户看。';

test('V1: fingerprint-named chat with open thinking converges to 开源模型 (list/tab source = Models)', () => {
  const { CHF, modelsStore, chatsStore } = createCtx(null);
  const chat = { sid: 'test-fp-open', sentAt: Date.now(), messages: [
    { id: 'u1', role: 'user', text: 'show a 2D animation of a pelican riding a bicycle' },
    { id: 'a1', role: 'assistant', status: 'completed', text: '好的，这是鹈鹕骑行车动画', parts: [
      { type: 'reasoning', text: OPEN_THINK_TEXT },
      { type: 'text', text: '好的，这是鹈鹕骑行车动画' },
    ] },
  ] };
  modelsStore[chat.sid] = fpEntry({ lastMessageId: 'a1', completedTurnCount: 1 });
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat);
  assert.equal(res?.name, '开源模型', 'identifyAndApply must converge the fingerprint-named open chat');
  assert.equal(modelsStore[chat.sid]?.name, '开源模型', 'stored Models entry must become 开源模型 so Titles/list/tab follow');
  assert.equal(Boolean(modelsStore[chat.sid]?.routed), false, 'open from the first turn is not a route');
});

test('V1b: habit-sure closed name protected by mark guard still converges when open from turn 1', () => {
  const { CHF, modelsStore, chatsStore } = createCtx(null);
  const chat = { sid: 'test-sure-open', sentAt: Date.now(), messages: [
    { id: 'u1', role: 'user', text: 'pelican please' },
    { id: 'a1', role: 'assistant', status: 'completed', text: 'done', parts: [
      { type: 'reasoning', text: OPEN_THINK_TEXT },
      { type: 'text', text: 'done' },
    ] },
  ] };
  // habit identification wrote a sure (non-guess) closed name, then fingerprint attached.
  modelsStore[chat.sid] = fpEntry({ guess: false, sure: true, habitInferred: true, provider: '对话习惯识别', lastMessageId: 'a1', completedTurnCount: 1 });
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat);
  assert.equal(res?.name, '开源模型', 'a stale sure closed name from habit/fingerprint must not veto authoritative open evidence');
  assert.equal(modelsStore[chat.sid]?.name, '开源模型');
});

test('V2: closed first turn then open turn converges as a recorded route (from -> 开源模型)', () => {
  const { CHF, modelsStore, chatsStore } = createCtx('compat-thinking');
  const chat = { sid: 'test-route-open', sentAt: Date.now(), messages: [
    { id: 'u1', role: 'user', text: 'make a card page' },
    { id: 'a1', role: 'assistant', status: 'completed', text: 'card done', _streamStats: { cps: 118, avgChunk: 33, deltaCount: 48, tN: 48, tChars: 1584 }, parts: [
      { type: 'tool-write_file', toolCallId: 'tc_1', toolName: 'write_file', input: { path: 'card.html', content: genericHtml }, output: 'ok' },
      { type: 'tool-bash', toolCallId: 'tc_2', toolName: 'bash', input: { command: "grep -Eo '<circle' card.html | wc -l", cwd: '/home/user' }, output: 'ok' },
      { type: 'text', text: 'card done' },
    ] },
    { id: 'u2', role: 'user', text: 'now a pelican riding a bicycle' },
    { id: 'a2', role: 'assistant', status: 'completed', text: 'pelican done', parts: [
      { type: 'reasoning', text: OPEN_THINK_TEXT },
      { type: 'text', text: 'pelican done' },
    ] },
  ] };
  modelsStore[chat.sid] = fpEntry({ lastMessageId: 'a1', completedTurnCount: 1 });
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat);
  const entry = modelsStore[chat.sid];
  const openNamed = (entry?.name === '开源模型') || /开源/.test(String(entry?.routeTo || ''));
  assert.ok(openNamed, 'stored identity must converge to the open model, got: ' + JSON.stringify({ name: entry?.name, routed: entry?.routed, routeTo: entry?.routeTo }));
  assert.equal(Boolean(entry?.routed), true, 'mid-conversation closed->open switch must be recorded as routed');
  assert.match(String(entry?.routeFrom || ''), /opus/i, 'route origin must be preserved for the from -> to display');
  assert.match(String(entry?.routeTo || entry?.name || ''), /开源/, 'route target must be the open model');
});

test('N1: genuinely closed chat with fingerprint is left untouched', () => {
  const { CHF, modelsStore, chatsStore } = createCtx('hidden');
  const chat = { sid: 'test-closed-stay', sentAt: Date.now(), messages: [
    { id: 'u1', role: 'user', text: 'hi' },
    { id: 'a1', role: 'assistant', status: 'completed', text: 'hello', parts: [{ type: 'text', text: 'hello' }] },
  ] };
  modelsStore[chat.sid] = fpEntry({ lastMessageId: 'a1', completedTurnCount: 1 });
  chatsStore[chat.sid] = chat;
  const res = CHF.identifyAndApply(chat);
  assert.equal(res?.name, 'claude-opus-5.6-max');
  assert.equal(modelsStore[chat.sid]?.name, 'claude-opus-5.6-max');
});

test('N2: user manually reverse-locked open model is not overwritten by generic 开源模型', () => {
  const { CHF, modelsStore, chatsStore } = createCtx('compat-thinking');
  const chat = { sid: 'test-manual-open', sentAt: Date.now(), messages: [
    { id: 'u1', role: 'user', text: 'pelican' },
    { id: 'a1', role: 'assistant', status: 'completed', text: 'done', parts: [
      { type: 'reasoning', text: OPEN_THINK_TEXT },
      { type: 'text', text: 'done' },
    ] },
  ] };
  modelsStore[chat.sid] = fpEntry({ name: 'qwen3-235b-max', rawLabel: 'Qwen3 235B (Max)', guess: false, sure: true, manualOpenInferred: true, lastMessageId: 'a1', completedTurnCount: 1 });
  chatsStore[chat.sid] = chat;
  CHF.identifyAndApply(chat);
  assert.equal(modelsStore[chat.sid]?.name, 'qwen3-235b-max', 'manualOpenInferred specific open model must be preserved');
});
