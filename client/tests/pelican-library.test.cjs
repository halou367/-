'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const javaSrc = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
const htmlPreviewSrc = fs.readFileSync(path.join(__dirname, '../ui/html-preview.js'), 'utf8');
const pelicanTestSrc = fs.readFileSync(path.join(__dirname, '../ui/pelican-test.js'), 'utf8');
const strengthSrc = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
const dockSrc = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8');
const plusSrc = fs.readFileSync(path.join(__dirname, '../ui/plus.js'), 'utf8');

function createMainSharedEnv() {
  const start = mainSrc.indexOf('function cleanPelModel(s)');
  const end = mainSrc.indexOf('// 有窗口在抽卡', start);
  assert.ok(start >= 0 && end > start, 'main.js pelshots shared handler slice exists');
  let handler = null, saves = 0;
  const sentCmds = [];
  const winA = { isDestroyed: () => false, webContents: { id: 1, send: (ch, p) => sentCmds.push({ to: 'A', ch, p }) } };
  const winB = { isDestroyed: () => false, webContents: { id: 2, send: (ch, p) => sentCmds.push({ to: 'B', ch, p }) } };
  const env = {
    ipcMain: { handle: (_ch, fn) => { handler = fn; } },
    DB: { shared: {}, accounts: [] },
    BrowserWindow: { getAllWindows: () => [winA, winB] },
    acct: () => null,
    require: () => ({}),
    saveSoon: () => { saves++; },
    saveDB: () => { saves++; },
    setTimeout: () => 0,
    clearTimeout: () => {},
    process: { env: { BRANA_EXTENSION_TEST_DATA: '1' } },
  };
  vm.runInNewContext(mainSrc.slice(start, end), env);
  return { handler, db: env.DB, sentCmds, winA, winB, saves: () => saves };
}

function createPelicanShotsHarness({ platform = 'desktop', sharedMem = new Map(), acctName = '账号 1', models = {} } = {}) {
  const localMem = new Map();
  const toasts = [], exports = [], modals = [], busHandlers = new Map();
  let t = 1760780000000, uid = 0;
  const M = new Map(Object.entries(models));
  const samples = {};

  function h(tag, attrs = {}, ...kids) {
    const el = {
      tag,
      attrs: attrs || {},
      style: (attrs && typeof attrs.style === 'object') ? { ...attrs.style } : {},
      className: attrs?.class || '',
      children: [],
      isConnected: true,
      get textContent() {
        return this.children.map(c => typeof c === 'string' || typeof c === 'number' ? String(c) : (c?.textContent || '')).join('');
      },
      set textContent(v) {
        this.children = [String(v)];
      },
      append(...nodes) {
        for (const n of nodes.flat()) if (n != null && n !== false) this.children.push(n);
      },
      replaceChildren(...nodes) {
        this.children = [];
        this.append(...nodes);
      },
      querySelectorAll(sel) {
        const out = [];
        const match = node => {
          if (!node || typeof node !== 'object') return false;
          if (sel === 'img.pt-img') return node.tag === 'img' && String(node.className || '').split(/\s+/).includes('pt-img');
          if (sel === 'img.mc-pelimg') return node.tag === 'img' && String(node.className || '').split(/\s+/).includes('mc-pelimg');
          if (sel === '.pel-cmp-card') return String(node.className || '').split(/\s+/).includes('pel-cmp-card');
          if (sel === '.pel-model-card') return String(node.className || '').split(/\s+/).includes('pel-model-card');
          if (sel === 'img') return node.tag === 'img';
          return false;
        };
        const walk = node => {
          if (!node || typeof node !== 'object') return;
          if (match(node)) out.push(node);
          for (const c of (node.children || [])) walk(c);
        };
        walk(this);
        return out;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      remove() {
        this.isConnected = false;
      },
    };
    el.append(...kids);
    return el;
  }

  class MockDOMParser {
    parseFromString(str) {
      const imgs = [];
      const texts = [];
      const imgRe = /<image\b([^>]*)\/?>/gi;
      let m;
      while ((m = imgRe.exec(str))) {
        const attrStr = m[1];
        const getAttr = k => {
          const r = new RegExp(k + '="([^"]*)"', 'i').exec(attrStr);
          return r ? r[1] : '';
        };
        imgs.push({ getAttribute: getAttr });
      }
      const txtRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
      while ((m = txtRe.exec(str))) {
        const attrStr = m[1], body = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const getAttr = k => {
          const r = new RegExp(k + '="([^"]*)"', 'i').exec(attrStr);
          return r ? r[1] : '';
        };
        texts.push({ getAttribute: getAttr, textContent: body });
      }
      return {
        querySelectorAll: sel => sel === 'image' ? imgs : sel === 'text' ? texts : [],
        querySelector: () => null,
      };
    }
  }

  const ctx = vm.createContext({
    console,
    Math,
    Date,
    Set,
    Map,
    JSON,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Error,
    Promise,
    DOMParser: MockDOMParser,
    VERSION: '0.13.154',
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => ++t,
    uuid7: () => 'id-' + (++uid) + '-' + acctName,
    describe: e => e?.message || String(e),
    toast: (m, ty) => toasts.push({ m, ty }),
    h,
    icon: name => h('i', { class: 'ico-' + name }),
    modal: (title, body, foot, cls) => {
      const back = h('div', { class: 'modal-back ' + (cls || '') }, h('div', { class: 'modal-t' }, title), body, h('div', { class: 'modal-f' }, ...(foot || [])));
      modals.push(back);
      return back;
    },
    UI: { host: { account: { id: acctName, name: acctName } } },
    Host: {
      platform,
      shared: async (k, ...v) => {
        if (!v.length) return sharedMem.has(k) ? JSON.parse(JSON.stringify(sharedMem.get(k))) : null;
        sharedMem.set(k, JSON.parse(JSON.stringify(v[0])));
        return true;
      },
    },
    Store: {
      get: (k, d) => localMem.has(k) ? JSON.parse(JSON.stringify(localMem.get(k))) : d,
      set: (k, v) => { localMem.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    Models: {
      get all() { return Object.fromEntries(M.entries()); },
      get: sid => M.get(sid) || null,
      set: (sid, v) => { M.set(sid, v); },
    },
    Titles: { view: () => ({ model: '' }) },
    History: { byId: () => null },
    Brand: {
      NAME: { anthropic: 'Claude', openai: 'GPT', google: 'Gemini', xai: 'Grok' },
      of: s => {
        s = String(s || '').toLowerCase();
        if (/claude|opus|sonnet|haiku|fable/.test(s)) return 'anthropic';
        if (/gpt|o1|o3|o4|astra|sol|luna/.test(s)) return 'openai';
        if (/gemini|argon/.test(s)) return 'google';
        if (/grok/.test(s)) return 'xai';
        return '';
      },
    },
    VIcon: { el: v => h('span', { class: 'vicon-' + v }) },
    ConversationLabels: { score: mi => mi?.fingerprint?.reasoning?.score ?? mi?.reverseScore ?? null },
    Strength: {
      canon: s => String(s || '').replace(/\?+$/, '').trim(),
      fmtScore: v => v == null ? '—' : Number(v).toFixed(1),
      board: () => [],
      get samples() { return samples; },
      addSample: (name, row) => { (samples[name] ||= []).push(row); },
    },
    FileExport: {
      text: (text, name, mime) => exports.push({ text, name, mime }),
      write: async (text, name, mime) => exports.push({ text, name, mime }),
    },
    HtmlPreview: {
      kindOf: p => /\.html?|\.svg$/i.test(p) ? 'html' : '',
      shootText: async () => ({ url: 'data:image/jpeg;base64,AUTO_SHOT', w: 560, h: 373 }),
      image: () => {},
    },
    Dock: { render() {} },
    Bus: {
      on: (ev, fn) => { busHandlers.set(ev, fn); },
      emit: (ev, ...args) => { busHandlers.get(ev)?.(...args); },
    },
  });

  vm.runInContext(pelicanTestSrc + ';this.PelicanTest = PelicanTest;', ctx);
  const pSlice = htmlPreviewSrc.slice(htmlPreviewSrc.indexOf('const PelicanShots = (() => {'));
  vm.runInContext(pSlice + ';this.PelicanShots = PelicanShots;', ctx);

  return { ctx, PelicanShots: ctx.PelicanShots, PelicanTest: ctx.PelicanTest, M, localMem, sharedMem, toasts, exports, modals, samples };
}

test('Desktop host:shared merges pelshots & pelican across accounts, enriches later model identification, and honors deletion tombstones', () => {
  const m = createMainSharedEnv();

  // Account 1 saves a shot before model is identified
  assert.equal(m.handler({ sender: m.winA.webContents }, 'pelshots', {
    acct: '账号 1',
    rows: [
      { id: 'shot-1', at: 1000, sid: 'sid-a1', model: '未识别', score: null, url: 'data:image/jpeg;base64,AAA111', w: 560, h: 373, file: 'pelican.html' },
    ],
    pelican: { 'sid-a1': { at: 1000, score: 86.4, think: 15.2, name: '未识别' } },
  }), true);

  // Account 2 saves its own shot for another model
  assert.equal(m.handler({ sender: m.winB.webContents }, 'pelshots', {
    acct: '账号 2',
    rows: [
      { id: 'shot-2', at: 2000, sid: 'sid-b2', model: 'claude-fable-5.1-max', score: 91.2, think: 22.5, url: 'data:image/jpeg;base64,BBB222', w: 560, h: 373, file: 'pelican.html' },
    ],
  }), true);

  let shared = m.handler({ sender: m.winA.webContents }, 'pelshots');
  assert.equal(shared.rows.length, 2, 'both accounts shots are merged into client-wide shared store');
  assert.equal(shared.rows.find(r => r.id === 'shot-1').score, 86.4, 'pelican score enriched onto shot-1');
  assert.equal(shared.rows.find(r => r.id === 'shot-1').acct, '账号 1');
  assert.equal(shared.rows.find(r => r.id === 'shot-2').acct, '账号 2');

  // Account 1 later identifies sid-a1 as gpt-6-astra-high via BillingProbe / Models
  m.handler({ sender: m.winA.webContents }, 'pelshots', {
    acct: '账号 1',
    rows: [
      { id: 'shot-1', at: 1000, sid: 'sid-a1', model: '未识别', score: null, url: 'data:image/jpeg;base64,AAA111', w: 560, h: 373, file: 'pelican.html' },
    ],
    models: { 'sid-a1': { name: 'gpt-6-astra-high', reverseScore: 88.0 } },
  });
  shared = m.handler({ sender: m.winB.webContents }, 'pelshots');
  assert.equal(shared.rows.find(r => r.id === 'shot-1').model, 'gpt-6-astra-high', 'late model identification upgrades shared record for all accounts');

  // Deleting shot-1 in Account 2 records a tombstone so Account 1 syncing old local state cannot resurrect it
  m.handler({ sender: m.winB.webContents }, 'pelshots', {
    acct: '账号 2',
    rows: [],
    del: { 'shot-1': 3000 },
  });
  m.handler({ sender: m.winA.webContents }, 'pelshots', {
    acct: '账号 1',
    rows: [
      { id: 'shot-1', at: 1000, sid: 'sid-a1', model: 'gpt-6-astra-high', score: 86.4, url: 'data:image/jpeg;base64,AAA111', w: 560, h: 373, file: 'pelican.html' },
    ],
  });
  shared = m.handler({ sender: m.winA.webContents }, 'pelshots');
  assert.deepEqual([...shared.rows.map(r => r.id)], ['shot-2'], 'deleted shot stays deleted across accounts');
});

test('Android MainActivity whitelists pelshots & pelican and PelicanShots also mirrors to strsamples.pelshots', async () => {
  assert.match(javaSrc, /!"pelshots"\.equals\(k\) && !"pelican"\.equals\(k\)/);
  const sharedMem = new Map();
  const acct1 = createPelicanShotsHarness({
    platform: 'android',
    sharedMem,
    acctName: '安卓账号1',
    models: { 'sid-1': { name: 'gpt-6-astra-high', reverseScore: 87.5 } },
  });
  acct1.PelicanShots.add({ sid: 'sid-1', url: 'data:image/jpeg;base64,ANDROID_1', w: 560, h: 373, file: 'index.html' });
  await acct1.PelicanShots.pull(false, true);

  assert.ok(sharedMem.get('strsamples')?.pelshots?.rows?.length === 1, 'mirrored into strsamples.pelshots on Android');

  // Account 2 on Android pulls and immediately sees Account 1's Pelican shot
  const acct2 = createPelicanShotsHarness({
    platform: 'android',
    sharedMem,
    acctName: '安卓账号2',
    models: { 'sid-2': { name: 'gpt-6-astra-high' } },
  });
  await acct2.PelicanShots.pull(false, true);
  assert.equal(acct2.PelicanShots.all().length, 1);
  assert.equal(acct2.PelicanShots.forModel('gpt-6-astra-high')[0].model, 'gpt-6-astra-high');
  const card = acct2.PelicanShots.card('sid-2');
  assert.ok(card && card.querySelector('img.mc-pelimg'), 'Account 2 overview card displays Account 1 Pelican shot for the same model');
});

test('PelicanShots exportLibrary, importData (JSON & SVG), smart deduplication, and side-by-side comparison modal', () => {
  const h1 = createPelicanShotsHarness({
    acctName: '账号 A',
    models: {
      's-astra': { name: 'gpt-6-astra-high', reverseScore: 88.5 },
      's-fable': { name: 'claude-fable-5.1-max', reverseScore: 90.0 },
    },
  });
  h1.PelicanShots.add({ sid: 's-astra', url: 'data:image/jpeg;base64,IMG_ASTRA', w: 560, h: 373, file: 'astra.html' });
  h1.PelicanShots.add({ sid: 's-fable', url: 'data:image/jpeg;base64,IMG_FABLE', w: 560, h: 373, file: 'fable.html' });

  // Export JSON library
  const exported = h1.PelicanShots.exportLibrary();
  assert.equal(exported.schema, 'brana-pelican-library-v1');
  assert.equal(exported.modelCount, 2);
  assert.equal(exported.count, 2);
  assert.equal(h1.exports.length, 1);
  assert.match(h1.exports[0].name, /^brana-pelican-library-.*\.json$/);

  // Another client h2 has 1 overlapping record (with unresolved model) and 1 local record, then imports h1's JSON
  const h2 = createPelicanShotsHarness({
    acctName: '账号 B',
    models: { 's-sol': { name: 'gpt-6.1-sol-xhigh', reverseScore: 93.4 } },
  });
  h2.PelicanShots.add({ sid: 's-sol', url: 'data:image/jpeg;base64,IMG_SOL', w: 560, h: 373, file: 'sol.html' });
  // Import h1's exported JSON into h2
  const imp1 = h2.PelicanShots.importData(h1.exports[0].text);
  assert.equal(imp1.ok, true);
  assert.equal(imp1.added, 2);
  assert.equal(imp1.total, 3);
  assert.equal(imp1.modelCount, 3);

  // Re-importing the exact same JSON skips duplicates without multiplying records
  const imp2 = h2.PelicanShots.importData(h1.exports[0].text);
  assert.equal(imp2.added, 0);
  assert.equal(imp2.skipped, 2);
  assert.equal(h2.PelicanShots.all().length, 3);

  // Importing an exported SVG capability table also works
  const svgTable = h1.PelicanShots.tableSvg();
  const h3 = createPelicanShotsHarness({ acctName: '账号 C' });
  const impSvg = h3.PelicanShots.importData(svgTable);
  assert.equal(impSvg.ok, true);
  assert.equal(impSvg.added, 2);
  assert.equal(h3.PelicanShots.latest().length, 2);

  // Side-by-side comparison modal in h2
  const modalEl = h2.PelicanShots.table({ compareModel: 'gpt-6-astra-high' });
  assert.ok(modalEl.querySelector('img.pt-img'), 'renders capability table SVG');
  assert.equal(modalEl.querySelectorAll('.pel-model-card').length, 3, 'renders all 3 model cards');
  assert.equal(modalEl.querySelectorAll('.pel-cmp-card').length, 1, 'pre-selects requested compareModel');
});

test('UI entry points exist in bottom bar (dock.js), LeaderPop (plus.js), and PView (strength.js)', () => {
  assert.match(dockSrc, /pel-library-btn/, 'bottom bar has Pelican Test Library button');
  assert.match(plusSrc, /PelicanShots\.table/, 'LeaderPop has Pelican Test Library button');
  assert.match(strengthSrc, /PelicanShots\.table/, 'PView has Pelican Test Library button');
});

test('v0.13.155: Inline HTML/SVG auto-folding in chat replies, Gemini 3.8 vs Beam 1.0 501B A23B disambiguation (01a14a34), and /cost HTTP 403 x-arena-api-deployment protection', () => {
  const clientDir = path.resolve(__dirname, '..');
  const P = require('../ui/arena-trace/pricing.js');
  const catDoc = JSON.parse(fs.readFileSync(path.join(clientDir, 'ui/arena-trace/catalog.json'), 'utf8'));
  const viewSrc = fs.readFileSync(path.join(clientDir, 'ui/view.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(clientDir, 'ui/core.js'), 'utf8');
  const bpUiSrc = fs.readFileSync(path.join(clientDir, 'ui/billing-probe-ui.js'), 'utf8');

  // 1) Inline HTML & SVG extraction in view.js
  const startIdx = viewSrc.indexOf('  classifyInlineHtml(');
  const endIdx = viewSrc.indexOf('  inlineHtmlCard(');
  assert.ok(startIdx > 0 && endIdx > startIdx, 'view.js defines classifyInlineHtml and extractInlineHtmlSegments');
  const helperCode = 'const R = {\n' + viewSrc.slice(startIdx, endIdx) + '};\nthis.R = R;';
  const vCtx = vm.createContext({});
  vm.runInContext(helperCode, vCtx);

  const fencedHtmlMsg = 'Here is the pelican page:\n\n```html\n<!DOCTYPE html>\n<html><head><title>Pelican Bicycle</title><style>body{margin:0;background:#f8fafc}</style></head><body><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="80"/></svg></body></html>\n```\n\nClick the preview card to open.';
  const segs1 = vCtx.R.extractInlineHtmlSegments(fencedHtmlMsg, false);
  assert.ok(Array.isArray(segs1) && segs1.length === 3, 'splits fenced HTML block from surrounding prose');
  assert.equal(segs1[0].type, 'md');
  assert.equal(segs1[1].type, 'html');
  assert.equal(segs1[1].ext, 'html');
  assert.equal(segs1[1].title, 'Pelican Bicycle');
  assert.equal(segs1[2].type, 'md');

  const unfencedSvgMsg = 'Direct SVG output:\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">\n  <title>Inline Pelican SVG</title>\n  <rect width="400" height="300" fill="#eef2ff"/>\n  <circle cx="120" cy="210" r="45" stroke="#1e293b" stroke-width="6" fill="none"/>\n  <circle cx="280" cy="210" r="45" stroke="#1e293b" stroke-width="6" fill="none"/>\n</svg>\nDone!';
  const segs2 = vCtx.R.extractInlineHtmlSegments(unfencedSvgMsg, false);
  assert.ok(Array.isArray(segs2) && segs2.some(s => s.type === 'html' && s.ext === 'svg'), 'extracts unfenced inline SVG');

  const jsMsg = '```javascript\nconst a = 1;\nconsole.log(a < 2 && a > 0);\n```';
  assert.equal(vCtx.R.extractInlineHtmlSegments(jsMsg, false), null, 'ignores non-HTML code blocks');

  // 2) Gemini 3.8 Flash (High) vs Beam 1.0 501B A23B on 85-step silent Bash turn (01a14a34-814a-792f-b7c1-ad747c5797ff)
  const catalog = P.normalizeAgentCatalog(catDoc);
  const caveman = catalog.find(m => m.id === 'contenders/caveman-agent');
  assert.equal(P.isOpenSourceModel(caveman), true, 'Beam 1.0 501B A23B (contenders/caveman-agent) is classified as open-source');
  assert.equal(P.isClosedSourceModel(caveman), false);

  const ranked = P.rankByBasePrice(
    catalog,
    { inputUsd: 0.706982, outputUsd: 0.046875, cacheReadUsd: 0.261566, cacheWriteUsd: 0 },
    1.015423,
    {
      turnCosts: [{
        inputUsd: 0.706982,
        outputUsd: 0.046875,
        cacheReadUsd: 0.261566,
        cacheWriteUsd: 0,
        basePriceUsd: 1.015423,
        stepCount: 85,
      }],
      evidence: {
        hasReasoning: true,
        reasoningEmpty: true,
        outputChars: 2770,
        toolCalls: 85,
        stepCount: 85,
        visibleReasoningChars: 0,
        thinkingDurationSec: 0,
        streamEvidence: {
          hasReasoning: true,
          reasoningSummary: 'empty',
          visibleReasoningChars: 0,
          toolCallIds: ['tc_01K7S6B7C8D9E0F1G2H3J4K5M6'],
          toolNames: ['bash'],
          hasBashTool: true,
          totalSteps: 85,
        },
      },
    }
  );
  assert.equal(ranked.candidates[0].id, 'google/gemini-3.8-flash');
  assert.equal(ranked.candidates[0].diophantinePassed, true);
  assert.ok(ranked.candidates[0].residual < 1e-8);
  assert.ok(!ranked.candidates.some(c => c.id === 'contenders/caveman-agent'), 'Beam 1.0 501B A23B excluded from closed-source session');

  // 3) x-arena-api-deployment is blacklisted from __vdpl skew cookies & smart auto-discovery/promotion/rotation works
  assert.ok(coreSrc.includes('this.EXPIRED.add(d)') && coreSrc.includes('dpl_8c25ZvCYXszwFU4s19PErXPLVCzn'));
  assert.ok(coreSrc.includes('discoverFromHtml(text)') && coreSrc.includes('markBadDpl(d)') && coreSrc.includes('learnEndpoint(tpl, verified = false)'));
  assert.ok(bpUiSrc.includes('hasLegacyDiophantineSuppression') && bpUiSrc.includes('reverseVer: 155'));
  assert.ok(bpUiSrc.includes('promoteWorkingCostDpl') && bpUiSrc.includes('demoteFailedCostDpl') && bpUiSrc.includes('scrapeFreshCostDpls') && bpUiSrc.includes('buildAltCostPaths'));
  assert.ok(mainSrc.includes('demoteCostDpl') && mainSrc.includes('buildCostPaths') && mainSrc.includes('x-deployment-id'));
  assert.ok(javaSrc.includes('discoverFreshCostDplsAndroid') && javaSrc.includes('rememberAndroidCostDpl') && javaSrc.includes('demoteAndroidCostDpl'));
});

test('Official server error (Failed query / The AI took too long to respond): clean formatting and automatic original-text resend', () => {
  const ROOT = path.join(__dirname, '..');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui', 'core.js'), 'utf8');
  const keepSrc = fs.readFileSync(path.join(ROOT, 'ui', 'keep.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(ROOT, 'ui', 'view.js'), 'utf8');

  assert.ok(coreSrc.includes('function isOfficialTransientError(raw)'));
  assert.ok(coreSrc.includes('function formatOfficialErrorText(raw)'));
  assert.ok(keepSrc.includes('function canAutoResendOfficialError(c)'));
  assert.ok(keepSrc.includes("p.kind === 'resend-official'"));
  assert.ok(keepSrc.includes('officialAutoResend: true'));
  assert.ok(viewSrc.includes('if (lastUser && (lastUser.failed || capFail || removedErrTail))'));
});

test('v0.13.158: halou367 update worker repo, send-message timeout fix, >2 network error global lowest-latency IP & permanent blacklist, and cmd Up/Down input history', async () => {
  const ROOT = path.join(__dirname, '..');
  const workerSrc = fs.readFileSync(path.join(ROOT, '..', 'update-worker', 'worker.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui', 'core.js'), 'utf8');
  const poolSrc = fs.readFileSync(path.join(ROOT, 'ui', 'pool.js'), 'utf8');
  const arSrc = fs.readFileSync(path.join(ROOT, 'ui', 'auto-route.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(ROOT, 'ui', 'view.js'), 'utf8');
  const RoutePolicy = require(path.join(ROOT, 'ui', 'route-policy.js'));

  // 1) Update worker points to halou367/-
  assert.ok(workerSrc.includes("env.REPO = 'halou367/-'"));

  // 2) Send-message timeout & false pre-send IP switch fix
  assert.ok(coreSrc.includes("const j = await api('/api/chat/' + this.sid, { timeout: 6000, bg: true })"));
  assert.ok(!coreSrc.includes('this._preSendNetErr = e;'));
  assert.ok(coreSrc.includes('this.drain(900)'));
  assert.ok(coreSrc.includes('}, 25000);'));

  // 3) >2 network errors selects global lowest-latency available pure IP, and failed/impure IPs are permanently banned
  assert.ok(poolSrc.includes('banForever(d, k, why = \'\')'));
  assert.ok(poolSrc.includes('purgeImpureAndUnstable()'));
  assert.ok(poolSrc.includes('availAllPureLowestLatency(exceptId, exclude)'));
  assert.ok(arSrc.includes('forceGlobalLowestLatency:()=>(this.netErrorCount||0)>2'));

  const bannedPips = [];
  const data = {
    account: { id: 'own', proxy: 'vless://node1', proxyIp: 'old-jp', nodeId: 'n1', region: 'JP' },
    nodes: [{ id: 'n1', link: 'vless://node1' }],
    pool: {
      rep: {
        '203.0.113.10': { pu: { fs: 5 } },
        '203.0.113.20': { pu: { fs: 5 } },
      },
      ips: {
        'jp-slow': { ok: true, loc: 'JP', eg: '203.0.113.10', ms: 180 },
        'sg-fast': { ok: true, loc: 'SG', eg: '203.0.113.20', ms: 42 },
      },
    },
    accounts: [{ id: 'own', proxy: 'vless://node1', proxyIp: 'old-jp', nodeId: 'n1', region: 'JP' }],
    enabled: true,
  };
  const engine = new RoutePolicy.Engine({
    retryMs: 0,
    networkFirst: true,
    allowCrossRegionEscape: true,
    forceGlobalLowestLatency: () => true,
    banBadIp: c => bannedPips.push(c.proxyIp),
    now: () => 100000,
    read: async () => data,
    link: n => n.link,
    probe: async c => ({ ok: true, ip: c.proxyIp === 'sg-fast' ? '203.0.113.20' : '203.0.113.10', loc: c.region, ms: c.proxyIp === 'sg-fast' ? 42 : 180, service: true, realtime: true }),
    local: async () => [],
    apply: async x => ({ ok: true, account: { ...data.account, ...x.route } }),
  });
  const plan = engine.plan(data, 'ip', 100000);
  assert.equal(plan.stages[0][0], '全库最低延迟可用纯净 ProxyIP');
  assert.equal(plan.stages[0][1][0].proxyIp, 'sg-fast');

  // 4) CMD-style Up/Down arrow history navigation in composer
  assert.ok(viewSrc.includes("KEY: 'inputHistory:v1'"));
  assert.ok(viewSrc.includes("e.key === 'ArrowUp' && (histIdx >= 0 || onFirstLine)"));
  assert.ok(viewSrc.includes("e.key === 'ArrowDown' && histIdx >= 0 && onLastLine"));

  // 5) Route changes only remind (never pause); only closed-source models suddenly producing open-source thinking pause
  const bpUiSrc = fs.readFileSync(path.join(ROOT, 'ui', 'billing-probe-ui.js'), 'utf8');
  const sqSrc = fs.readFileSync(path.join(ROOT, 'ui', 'send-queue.js'), 'utf8');
  assert.ok(arSrc.includes('仅提醒，不暂停'));
  assert.ok(bpUiSrc.includes('wasClosedModel && latestHasOpenThink'));
  assert.ok(sqSrc.includes('if (chat._routePaused && !chat.thinkStopped) chat._routePaused = false;'));

  // 6) ProxyIP permanent blacklist never triggers when VLESS node itself is unreachable (isNodeConfirmedAlive / sameNode guard)
  assert.ok(poolSrc.includes('isNodeConfirmedAlive(link, batchResults = null)'));
  assert.ok(arSrc.includes('const sameNode=Boolean(r.from?.proxy&&r.account?.proxy&&r.from.proxy===r.account.proxy&&old!==r.account?.proxyIp);'));
});




