'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../ui/arena-trace/pricing.js');
const B = require('../ui/billing-probe.js');
const bundled = require('../ui/arena-trace/catalog.json');

test('Sample 01a13f8c-41c2-7ad3-8e77-73feb405f68d promotes Claude Opus 5.5 catalog entry to Claude Opus 5.6 (Max)', async () => {
  assert.equal(bundled.data.some(m => m.id === 'anthropic/claude-opus-5.6'), false);
  const chatObj = {
    sid: '01a13f8c-41c2-7ad3-8e77-73feb405f68d',
    messages: [
      { id: '01a13f8c-5fcd-7d31-b080-bae555e83c4f', role: 'assistant', parts: [{ type: 'text', text: 'a'.repeat(700) }], metadata: { pending: false } },
      { id: '01a13f8d-f02c-7b42-b6ac-1d93566324b9', role: 'assistant', parts: [{ type: 'text', text: 'b'.repeat(330) }], metadata: { pending: false } },
      { id: '01a13f93-26c9-7d0c-a597-a763ef1cd1c2', role: 'assistant', parts: [{ type: 'text', text: 'c'.repeat(59500) }], metadata: { pending: false } },
    ],
  };
  const costPayload = {
    messages: {
      '01a13f8c-5fcd-7d31-b080-bae555e83c4f': {
        basePriceUsd: 0.00040045875,
        actual: {
          inputTokensCostUsd: 0.000016,
          outputTokensCostUsd: 0.00552,
          cacheReadTokensCostUsd: 0.0023346,
          cacheWriteTokensCostUsd: 0.000385,
          totalCostUsd: 0.0082556,
          isLongContext: false,
          source: 'openrouter',
        },
      },
      '01a13f8d-f02c-7b42-b6ac-1d93566324b9': {
        basePriceUsd: 0.0006099112500000001,
        actual: {
          inputTokensCostUsd: 0.000016,
          outputTokensCostUsd: 0.00676,
          cacheReadTokensCostUsd: 0.0023346,
          cacheWriteTokensCostUsd: 0.001815,
          totalCostUsd: 0.0109256,
          isLongContext: false,
          source: 'openrouter',
        },
      },
      '01a13f93-26c9-7d0c-a597-a763ef1cd1c2': {
        basePriceUsd: 0.21959167000000007,
        actual: {
          inputTokensCostUsd: 0.000392,
          outputTokensCostUsd: 2.23442,
          cacheReadTokensCostUsd: 0.7074704,
          cacheWriteTokensCostUsd: 0.7998,
          totalCostUsd: 3.7420824000000006,
          isLongContext: false,
          source: 'openrouter',
        },
      },
    },
  };
  const engine = B.create({
    bundled,
    clock: () => 1792191208481,
    account: () => 'acct-1',
    request: async () => costPayload,
  });
  await engine.refresh(chatObj);
  const st = engine.state(chatObj.sid);
  assert.equal(st.status, 'ready');
  assert.equal(st.ranked[0].id, 'anthropic/claude-opus-5.6');
  assert.equal(st.ranked[0].label, 'Claude Opus 5.6 (Max)');
  const diag = engine.diagnostics(chatObj.sid, chatObj, null);
  assert.equal(diag.candidates[0].id, 'anthropic/claude-opus-5.6');
  assert.equal(diag.candidates[0].label, 'Claude Opus 5.6 (Max)');
  assert.deepEqual(B.reference(bundled, 'opus-5.6-max').rates, [4, 20, 0.2]);
});

test('Post-turn reverse inference runs on forced turn completion and after mid-turn pending probes', () => {
  const bpUi = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const bp = fs.readFileSync(path.join(__dirname, '../ui/billing-probe.js'), 'utf8');
  const titles = fs.readFileSync(path.join(__dirname, '../ui/titles.js'), 'utf8');
  assert.match(bp, /if \(!opts\?\.allowPending && !chat\.busy\) s\.postTurnCoveredIds = s\.coveredIds\.slice\(\);/);
  assert.match(bpUi, /const postCovered = stNow\.postTurnCoveredIds \|\| \[\];/);
  assert.match(bpUi, /Bus\.on\('turn', \(chat\) => \{ if \(chat\?\.sid\) \{ schedule\(chat\); scheduleBgSweep\(2500\); \} \}\);/);
  assert.match(titles, /BillingProbe\.automatic\(chat\)/);
});

test('Deleted conversation models remove zero-count vendors from login and account cards', () => {
  const astatsSrc = fs.readFileSync(path.join(__dirname, '../ui/astats.js'), 'utf8');
  const mgrSrc = fs.readFileSync(path.join(__dirname, '../ui/mgr.js'), 'utf8');
  const statUiCode = mgrSrc.slice(mgrSrc.indexOf('const StatUI = {'), mgrSrc.indexOf('// ---------- 手机：账号页'));

  const ctx = vm.createContext({
    ICON: {},
    Store: { get: () => ({}), set: () => true },
    Bus: { on: () => {}, emit: () => {} },
    History: {
      items: [
        { id: 'c-1', title: '你是Claudeopus5.5吗' },
        { id: 'c-2', title: 'google search test' },
        { id: 'c-3', title: 'opus-5.6-max · 真实对话' },
      ],
      goneMap: () => new Map([['c-3', Date.now()]]),
      full: true,
      lastLoad: Date.now(),
    },
    Models: {
      get: id => id === 'c-3' ? { name: 'opus-5.6-max', guess: false } : id === 'c-2' ? { name: 'gemini-3.8-flash-high', guess: true } : null,
    },
    Strength: {
      canon: s => String(s || '').toLowerCase().replace(/\s+/g, '-'),
      ver10: s => /5\.6/.test(s) ? 56 : /3\.8/.test(s) ? 38 : null,
      level: () => 6,
    },
    Brand: {
      NAME: { anthropic: 'Claude', google: 'Gemini', mistral: 'Mistral' },
      of: s => /claude|opus/.test(s) ? 'anthropic' : /gemini|google/.test(s) ? 'google' : /mistral/.test(s) ? 'mistral' : '',
      short: s => s,
    },
    VIcon: { el: () => ({}) },
    Gold: { manual: false, has: () => false },
    Notes: { get: () => '' },
    UI: { me: { id: 'u1' }, host: { account: { id: 'a1', status: {} } } },
    Host: { platform: 'desktop', noteAccount: () => Promise.resolve(true) },
    noteBase: s => String(s || '').split(' · ')[0],
    entAt: () => 1700000000000,
    now: () => 1700000000000,
    pad: n => String(n).padStart(2, '0'),
    h: () => ({}),
  });
  vm.runInContext(astatsSrc + '\n' + statUiCode + '\nthis.AcctStats = AcctStats; this.StatUI = StatUI;', ctx);

  // c-3 (opus-5.6-max) is in goneMap (deleted), c-2 is only a guess, c-1 is a Chinese user prompt
  const computed = ctx.AcctStats.compute();
  assert.deepEqual([...Object.keys(computed.vendors)], []);
  assert.deepEqual([...ctx.StatUI.vendors(computed)], []);

  // Also verify StatUI.fold cleans up stale cached stats (other, bare vendor 'mistral', CJK prompt, and 0-count models)
  const stale = {
    at: 1,
    total: 5,
    full: true,
    vendors: {
      other: { n: 3, gold: { n: 0, models: [] }, models: { '未识别': { n: 3, list: [] } } },
      mistral: { n: 2, gold: { n: 0, models: [] }, models: { mistral: { n: 2, list: [] } } },
      anthropic: { n: 1, gold: { n: 0, models: [] }, models: { '你是Claudeopus5.5吗': { n: 1, list: [] } } },
      google: { n: 0, gold: { n: 0, models: [] }, models: { 'gemini-4-argon-high': { n: 0, list: [] } } },
    },
  };
  const folded = ctx.StatUI.fold(stale);
  assert.deepEqual([...Object.keys(folded.vendors)], []);
  assert.deepEqual([...ctx.StatUI.vendors(folded)], []);
});