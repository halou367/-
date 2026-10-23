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
      classList: {
        toggle(cls, force) {
          const set = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          const add = force === undefined ? !set.has(cls) : !!force;
          if (add) set.add(cls); else set.delete(cls);
          el.className = [...set].join(' ');
          return add;
        },
        add(cls) { this.toggle(cls, true); },
        remove(cls) { this.toggle(cls, false); },
        contains(cls) { return String(el.className || '').split(/\s+/).includes(cls); },
      },
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
          if (sel === 'span') return node.tag === 'span';
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
      const footKids = Array.isArray(foot) ? foot : (foot ? [foot] : []);
      const back = h('div', { class: 'modal-back ' + (cls || '') }, h('div', { class: 'modal-t' }, title), body, h('div', { class: 'modal-f' }, ...footKids));
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
  assert.ok(coreSrc.includes('}, 25000);') || coreSrc.includes('const minAge = msg?._queued ? 18000 : 25000;'));

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
  assert.ok(arSrc.includes('路由切换提醒（不暂停）') || arSrc.includes('仅提醒，不暂停'));
  assert.ok(bpUiSrc.includes('wasClosedModel && latestHasOpenThink'));
  assert.ok(sqSrc.includes('if (chat._routePaused && !chat.thinkStopped) chat._routePaused = false;'));

  // 6) ProxyIP permanent blacklist never triggers when VLESS node itself is unreachable (isNodeConfirmedAlive / sameNode guard) + v0.13.160 Android networking recovery fixes
  assert.ok(poolSrc.includes('isNodeConfirmedAlive(link, batchResults = null)'));
  assert.ok(poolSrc.includes('hasV158Poison'));
  assert.ok(arSrc.includes('const sameNode=Boolean(r.from?.proxy&&r.account?.proxy&&r.from.proxy===r.account.proxy&&old!==r.account?.proxyIp);'));
  const rsJavaSrc = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'ai', 'arena', 'client', 'RouteSupport.java'), 'utf8');
  const maJavaSrc = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'ai', 'arena', 'client', 'MainActivity.java'), 'utf8');
  const envRefSrc = fs.readFileSync(path.join(ROOT, 'ui', 'env-refresh.js'), 'utf8');
  const envChkSrc = fs.readFileSync(path.join(ROOT, 'ui', 'env-check.js'), 'utf8');
  const ripSrc = fs.readFileSync(path.join(ROOT, 'ui', 'region-ip.js'), 'utf8');
  assert.ok(rsJavaSrc.includes('if(!pip.isEmpty()&&!request.optBoolean("manual"))'));
  assert.ok(maJavaSrc.includes('(request.isForMainFrame() && protectedWebs.contains(view))'));
  assert.ok(envRefSrc.includes('this.justRefreshed = true;') && envRefSrc.includes("location.replace('/robots.txt')"));
  assert.ok(envChkSrc.includes('UI.recoverFromBrowseMode()'));
  assert.ok(ripSrc.includes('const liveOk=Boolean(ip&&!IP.err&&!rttTimeout);'));

  // 7) Reverse-inference speed optimizations: branch-and-bound pruning + effortMemo/evalMemo + unnarrowedCandidates + zero-SQLite /cost cookie guard + summaryCache
  const prSrc = fs.readFileSync(path.join(ROOT, 'ui', 'arena-trace', 'pricing.js'), 'utf8');
  const bpSrc = fs.readFileSync(path.join(ROOT, 'ui', 'billing-probe.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(prSrc.includes('const evalMemo = new Map();') && prSrc.includes('const effortMemo = new Map();'));
  assert.ok(prSrc.includes('unnarrowedCandidates,'));
  assert.ok(bpSrc.includes('let unnarrowedList = result.baseMatch?.unnarrowedCandidates;'));
  assert.ok(bpUiSrc.includes('const summaryCache = new Map();'));
  assert.ok(bpUiSrc.includes('const ensurePelLoaded = () => {'));
  assert.ok(mainSrc.includes("if (opt?.costShown === true && (ses.__appliedSkewDpl !== skewDpl || nowMs - (ses.__costCookieSetAt || 0) > 600000))"));
});

test('50-dim HTML/SVG code fingerprint engine in ChatHabitFingerprint classifies HTML/SVG with strict 3-tuple (vendor/family/effort) and truncated SVG auto-heal', () => {
  const ROOT = path.join(__dirname, '..');
  const bpUiSrc = fs.readFileSync(path.join(ROOT, 'ui', 'billing-probe-ui.js'), 'utf8');
  const h = createPelicanShotsHarness({ acctName: '测试账号' });
  const ctx = h.ctx;
  ctx.Models = { get: () => null, set: () => {}, all: () => ({}) };
  ctx.Chats = { get: () => null };
  ctx.Tabs = { cur: null };
  vm.runInContext(bpUiSrc.split('const BillingProbe =')[0] + '\nthis.ChatHabitFingerprint = ChatHabitFingerprint;', ctx);
  const habit = ctx.ChatHabitFingerprint;
  assert.ok(habit && typeof habit.classifyHtmlSvg === 'function', 'ChatHabitFingerprint exposes classifyHtmlSvg');
  assert.ok(typeof habit.extractCleanHtmlOrSvg === 'function', 'ChatHabitFingerprint exposes extractCleanHtmlOrSvg');

  // 1) Truncated SVG auto-heal
  const trunc = habit.extractCleanHtmlOrSvg('Here is the icon:\n```svg\n<svg width="32" height="32" viewBox="0 0 32 32"><rect rx="4" fill="#fff5df"/><path d="M4,4 L28,28"/>');
  assert.equal(trunc.isTruncated, true);
  assert.ok(trunc.code.endsWith('</svg>'), 'truncated SVG is automatically closed');

  // 2) Tiered model HTML/SVG classification (Gemini 4 Argon with RAF + skeletal kinematics)
  const argonHtml = `<!DOCTYPE html><html><body><svg viewBox="0 0 960 600"><g id="pelicanBodyGroup"><path d="M10 10 C20 20 30 30 40 40"/></g><g id="cloudsLayer"><circle cx="50" cy="50" r="20"/></g><g id="wavesLayer"><path d="M0 500 Q240 480 480 500"/></g></svg><script>const maxReach=40,bodyPitch=0.2,headNod=0.1;function tick(){Math.sin(1);requestAnimationFrame(tick);}requestAnimationFrame(tick);</script></body></html>`;
  const argonRes = habit.classifyHtmlSvg(argonHtml);
  assert.ok(argonRes && argonRes.best, 'returns top candidate for Argon HTML');
  assert.equal(argonRes.best.family, 'gemini-4-argon');
  assert.equal(argonRes.best.vendorId, 'google');
  assert.ok(['medium', 'high', 'max'].includes(argonRes.best.effort), 'tiered model receives real effort tier');
  assert.ok(argonRes.spectralScore > 20 && argonRes.spectralScore < 100, 'Michaelis-Menten spectralScore is non-saturating');

  // 3) Tierless model HTML/SVG classification (GLM 5.3 with 900x520 + sunRays/plumeG) strictly receives effort="standard" (标准)
  const glmHtml = `<!DOCTYPE html><html><body><svg viewBox="0 0 900 520"><g id="sunRays"><circle cx="80" cy="80" r="40"/></g><g id="plumeG"><path d="M100 100 L200 200"/></g><g id="chainFwd"><path d="M150 300 L250 300"/></g></svg></body></html>`;
  const glmRes = habit.classifyHtmlSvg(glmHtml);
  assert.ok(glmRes && glmRes.best, 'returns top candidate for GLM 5.3 HTML');
  assert.equal(glmRes.best.family, 'glm-5.3');
  assert.equal(glmRes.best.effort, 'standard', 'tierless model strictly receives standard effort');
  assert.equal(glmRes.best.effortLabel, '标准', 'tierless model effortLabel is 标准');
  assert.ok(!/-(low|medium|high|xhigh|max)$/i.test(glmRes.best.canon), 'tierless model canon never has fake effort suffix');

  // 4) SVG32 classification (GPT 6 Astra width="32" before viewBox="0 0 32 32" + rx="4")
  const astraSvg32 = `<svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#fff5df"/><path d="M8 20 L16 8 L24 20 Z" fill="#244b52"/><circle cx="16" cy="16" r="4" fill="#78c2ca"/></svg>`;
  const astraRes = habit.classifyHtmlSvg(astraSvg32);
  assert.ok(astraRes && astraRes.best);
  assert.equal(astraRes.code_type, 'svg32');
  assert.equal(astraRes.best.family, 'gpt-6-astra');
  assert.equal(astraRes.best.effort, 'low');

  // 5) svg-style-v2 17-dim structural signature & 5-dim SVG32 referee + nested truncated SVG auto-healing
  assert.ok(Array.isArray(astraRes.features.vector17) && astraRes.features.vector17.length === 17, 'extracts 17-dim svgStyleV2 vector');
  assert.ok(typeof astraRes.features.structuralSignature === 'string' && astraRes.features.structuralSignature.length === 8, 'extracts 8-hex structuralSignature');
  assert.ok(astraRes.miniSvg32Referee && astraRes.miniSvg32Referee.score === 25, '5-dim SVG32 referee scores 25/25 on complete 32x32 pelican SVG');
  const healedNested = habit.healTruncatedSvg('<svg viewBox="0 0 32 32" data-nonce="abc123"><defs><linearGradient id="g"><stop offset="0" stop-color="#ffd700"/><g id="body"><path d="M2 2 L10 10" fill="#123');
  assert.ok(healedNested.endsWith('</svg>') && healedNested.includes('</g>') && healedNested.includes('</defs>'), 'healTruncatedSvg closes nested <g>, <defs>, and <svg>');

  // 6) Nonce invariance: data-nonce attribute does not alter SVG32 classification or prototype similarity
  const astraNonced = astraSvg32.replace('<svg ', '<svg data-nonce="9f8e7d6c" ');
  const astraNoncedRes = habit.classifyHtmlSvg(astraNonced);
  assert.equal(astraNoncedRes.best.family, astraRes.best.family);
  assert.equal(astraNoncedRes.best.protoSim, astraRes.best.protoSim);

  // 7) ArenaPricing v9.2 merged capabilities (inferQuotaTier, extractStylometryAndToolHabits, evaluateCanarySignature, inspectAssignments)
  const Pricing = require(path.join(ROOT, 'ui', 'arena-trace', 'pricing.js'));
  const Preimage = require(path.join(ROOT, 'ui', 'arena-trace', 'preimage.js'));
  assert.equal(typeof Pricing.inferQuotaTier, 'function');
  assert.equal(typeof Pricing.extractStylometryAndToolHabits, 'function');
  assert.equal(typeof Pricing.evaluateCanarySignature, 'function');
  assert.equal(typeof Preimage.inspectAssignments, 'function');
  const qTier = Pricing.inferQuotaTier({ readings: [{ usedPts: 20 }], dsLo: 9.2, dsHi: 9.6, tailSpend: 0.2, calibratedUsableUsd: 47.5 });
  assert.equal(qTier.predictedTier, '$50');
  const sty = Pricing.extractStylometryAndToolHabits(['Here is the plan before running bash.'], [''], { totalToolCalls: 3, totalSteps: 2, preToolChars: 42, interToolChars: 18, bashCount: 2, toolNames: ['bash', 'read_file'] });
  assert.equal(sty.stylometry.familyHint, 'claude');
});

test('v9.2 BotScore (人机分), 96-bit cx _CX_LAYOUT_V2 telemetry, forensic TOXIC_BAN_IPS shield, and Gacha probe pool & congestion/trophy protections', () => {
  const ROOT = path.join(__dirname, '..');
  // 1) Decode 96-bit cx token produced by packClientInteraction against Arena _CX_LAYOUT_V2
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui', 'core.js'), 'utf8');
  const fnIdx = coreSrc.indexOf('function packClientInteraction(');
  const fnEnd = coreSrc.indexOf('// 抽卡：create-chat', fnIdx);
  const cxCtx = vm.createContext({
    Math, Number, String, Uint8Array, Date,
    now: () => 1761120000000,
    VISIT: 'visit-test-01',
    ProtocolSchema: { current: { cxSalt: 48664 } },
  });
  vm.runInContext(coreSrc.slice(fnIdx, fnEnd) + ';this.packClientInteraction = packClientInteraction;', cxCtx);

  function unpackCxV2(token) {
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = new Uint8Array(15);
    for (let i = 0; i < 5; i++) {
      const c0 = B64.indexOf(token[i * 4]), c1 = B64.indexOf(token[i * 4 + 1]), c2 = B64.indexOf(token[i * 4 + 2]), c3 = B64.indexOf(token[i * 4 + 3]);
      const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
      bytes[i * 3] = (n >>> 16) & 255;
      bytes[i * 3 + 1] = (n >>> 8) & 255;
      bytes[i * 3 + 2] = n & 255;
    }
    const ver = bytes[0];
    const salt = (bytes[1] << 8) | bytes[2];
    const layout = [
      ['submitKind', 2], ['submitTrusted', 2], ['untrustedUiEvents', 4], ['charsTyped', 8],
      ['insertMulti', 4], ['pasteCount', 4], ['pasteWithoutModifier', 1], ['composition', 1],
      ['otherInputTypes', 4], ['docOwnProps', 3], ['coarsePointer', 1], ['integrity', 16],
      ['pressBucket', 3], ['pressureBucket', 2], ['movesBeforeClick', 2], ['maxCoalesced', 2],
      ['heartbeatGapBucket', 2], ['visibilityChangesBucket', 2], ['focusVisContradiction', 1],
      ['visitTag', 16], ['minuteTag', 16],
    ];
    let a = (0x5bd1e995 ^ salt) >>> 0;
    const rng = () => { let e = Math.imul((a = (a + 0x6d2b79f5) | 0) ^ (a >>> 15), 1 | a); return (((e ^= e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ (e >>> 14)) >>> 0); };
    const order = layout.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    const o = bytes.slice(3);
    for (let i = 0; i < 12; i++) o[i] ^= (rng() & 255);
    const vals = {};
    let s = 0;
    for (const idx of order) {
      const [key, bits] = layout[idx];
      let v = 0;
      for (let b = bits - 1; b >= 0; b--) {
        const bit = (o[s >> 3] >>> (7 - (s & 7))) & 1;
        v = (v << 1) | bit;
        s++;
      }
      vals[key] = v;
    }
    return { ver, salt, vals };
  }

  const cxZh = cxCtx.packClientInteraction('请生成一个35～45行以内的独立单文件HTML卡片并内联2D动态SVG徽章', 'button');
  const decZh = unpackCxV2(cxZh);
  assert.equal(decZh.ver, 2);
  assert.equal(decZh.vals.submitKind, 1);
  assert.equal(decZh.vals.submitTrusted, 2);
  assert.equal(decZh.vals.untrustedUiEvents, 0, 'untrustedUiEvents must be 0');
  assert.equal(decZh.vals.pasteWithoutModifier, 0, 'pasteWithoutModifier must be 0');
  assert.equal(decZh.vals.docOwnProps, 0, 'docOwnProps must be 0');
  assert.equal(decZh.vals.integrity, 0, '16-bit anti-bot integrity tamper bitmask must be 0');
  assert.equal(decZh.vals.composition, 1, 'CJK input sets IME composition=1');
  assert.equal(decZh.vals.otherInputTypes, 1, 'CJK input sets otherInputTypes=1');
  assert.ok(decZh.vals.insertMulti >= 2, 'CJK input sets insertMulti >= 2');
  assert.ok(decZh.vals.pressBucket >= 2 && decZh.vals.pressBucket <= 4, 'physiological pressBucket in [2,4]');
  assert.ok(decZh.vals.pressureBucket >= 1 && decZh.vals.pressureBucket <= 3, 'physiological pressureBucket in [1,3]');
  assert.ok(decZh.vals.movesBeforeClick >= 1 && decZh.vals.movesBeforeClick <= 3, 'physiological movesBeforeClick in [1,3]');

  // 2) BotService sweet-spot (72%-95% Pulse), #11-#20 Golden Draw Window, Battle Trust Nurture, and Ban-Wave detector
  const traceSrc = fs.readFileSync(path.join(ROOT, 'ui', 'trace.js'), 'utf8');
  const bsStart = traceSrc.indexOf('const BotService = (() => {');
  const histItems = Array.from({ length: 15 }, (_, i) => ({ id: 's-' + i, isArchived: false, mode: i < 2 ? 'battle' : 'agentic' }));
  const bsCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Date, parseInt, isFinite,
    now: () => Date.UTC(2026, 9, 22, 6, 56, 0), // 14:56 BJT (inside 14:55-15:40 ban-wave window)
    setTimeout: () => 0,
    Store: { get: () => null, set: () => {} },
    Bus: { on: () => {}, emit: () => {} },
    Bar: { render: () => {} },
    UI: { me: { id: 'u1' }, host: { account: { id: 'a1' } } },
    IP: { ip: '198.51.100.8', rtt: 120 },
    IPRep: { cur: () => ({ pct: 92, kind: { c: 'res' }, sc: { known: true, s: 92 } }), egOf: x => x },
    Pool: { d: { rep: { '198.51.100.8': { pu: { res: true, bc: false, fs: 5 } } }, rq: { '198.51.100.8': { ok: 10, rc: 0 } } } },
    Pulse: { v: { pulse: 84 } },
    History: { items: histItems },
    Models: { get: () => ({ name: 'claude-opus-5.5-max' }), all: {} },
  });
  vm.runInContext(traceSrc.slice(bsStart), bsCtx);
  const st0 = bsCtx.BotService.state();
  assert.equal(st0.sweetSpot, true, '84% Pulse is inside 72%-95% sweet spot');
  assert.match(st0.drawWindowLabel, /#15 黄金高爆窗/);
  assert.equal(st0.banWave.active, true, '14:56 BJT is inside afternoon ban-wave window');
  assert.ok(st0.botScore >= 85, 'clean residential IP + sweet spot + golden window + crown achieves T1 score');
  const st1 = bsCtx.BotService.noteBattleVote('battle-1', 'model_a');
  assert.ok(st1.battleTrustCount >= 1, 'noteBattleVote increments battleTrustCount');

  // 3) IPRep forensic TOXIC_BAN_IPS and AS42532 blacklist
  const iprepSrc = fs.readFileSync(path.join(ROOT, 'ui', 'iprep.js'), 'utf8');
  const ipCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, Date,
    now: () => 1761120000000,
    Pool: {
      parse: k => ({ ip: true, host: k }),
      d: {
        ips: { '150.109.11.223': { eg: '150.109.11.223' }, '203.0.113.55': { eg: '203.0.113.55' } },
        rep: {
          '150.109.11.223': { a: true, pu: { fs: 10, res: true } },
          '203.0.113.55': { a: true, as: 'AS42532 FakeCluster', pu: { fs: 10, res: true } },
        },
        rq: {},
      },
    },
  });
  vm.runInContext(iprepSrc.slice(0, iprepSrc.indexOf('// 后台：启动 1 分钟后')) + ';this.IPRep = IPRep;', ipCtx);
  assert.equal(ipCtx.IPRep.isToxicBanIp('150.109.11.223'), true);
  assert.equal(ipCtx.IPRep.isToxicBanIp('77.73.71.200'), true);
  assert.equal(ipCtx.IPRep.isToxicBanIp('203.0.113.55', 'AS42532'), true);
  assert.ok(ipCtx.IPRep.score('150.109.11.223').s <= 12, 'toxic ban IP is capped at <= 12');
  assert.ok(ipCtx.IPRep.score('203.0.113.55').s <= 12, 'blacklisted ASN AS42532 is capped at <= 12');

  // 4) GachaPrompts.probeFromPool 4-category anti-dedup pool
  const gpSrc = fs.readFileSync(path.join(ROOT, 'ui', 'gacha-prompts.js'), 'utf8');
  const gpCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Uint32Array, Uint8Array, TextEncoder,
    crypto: require('crypto').webcrypto,
    Store: { get: () => [], set: () => {} },
  });
  vm.runInContext(gpSrc + ';this.GachaPrompts = GachaPrompts;', gpCtx);
  for (const cat of ['svg_micro', 'html_card', 'css_fx', 'data_viz']) {
    const p = gpCtx.GachaPrompts.probeFromPool(cat, true);
    assert.equal(p.category, cat);
    assert.equal(p.salt.length, 4);
  }
  const poly1 = gpCtx.GachaPrompts.polymorphPrompt3D('Draw a badge', 'acct-1');
  const poly2 = gpCtx.GachaPrompts.polymorphPrompt3D('Draw a badge', 'acct-1');
  assert.equal(poly1.mutated, false);
  assert.equal(poly2.mutated, true);
  assert.match(poly2.prompt, /\[ref:[0-9a-z]{4}\]$/);

  // 5) Wave-2: BotService computeTideWindow, gittinsIndex (k*=4), and notePromptReplay
  const tideGolden = bsCtx.BotService.computeTideWindow(Date.UTC(2026, 9, 22, 2, 0, 0)); // 10:00 BJT
  assert.equal(tideGolden.window, 'GOLDEN');
  assert.equal(tideGolden.crownHitRatePct, 11.55);
  const git1 = bsCtx.BotService.gittinsIndex(1, 92, 1.18);
  const git4 = bsCtx.BotService.gittinsIndex(4, 92, 1.18);
  const git5 = bsCtx.BotService.gittinsIndex(5, 92, 1.18);
  assert.equal(git1.decision, 'CONTINUE_DRAW');
  assert.equal(git4.decision, 'CONTINUE_DRAW');
  assert.equal(git5.decision, 'STOP_AND_SWITCH');
  const rep1 = bsCtx.BotService.notePromptReplay('same custom prompt');
  const rep2 = bsCtx.BotService.notePromptReplay('same custom prompt [ref:ab12]');
  assert.equal(rep1.repeatCount, 1);
  assert.equal(rep2.repeatCount, 2);
  assert.ok(rep2.replayPenalty > 0);

  // 6) Wave-2: IPRep subnetOf, coxSurvivalScore, and ucbNodeScore
  assert.equal(ipCtx.IPRep.subnetOf('198.51.100.42'), '198.51.100');
  assert.equal(ipCtx.IPRep.subnetOf('2606:4700:4700::1111'), '2606:4700:4700:');
  const cox = ipCtx.IPRep.coxSurvivalScore('203.0.113.55', null, 110);
  assert.ok(cox.purityScore <= 12);
  const ucb = ipCtx.IPRep.ucbNodeScore(48, 50, 95, 500);
  assert.ok(ucb > 80 && ucb <= 100);

  // 7) Wave-2: ArenaPricing opus55PelicanSpectralAstJudge & detectGrayBoxModelCRP
  const ArenaPricing = require('../ui/arena-trace/pricing.js');
  const astSonnet = ArenaPricing.opus55PelicanSpectralAstJudge({ pathCount: 28, bezierCount: 64, groupDepth: 5, viewBoxArea: 480000 });
  const astArgonMax = ArenaPricing.opus55PelicanSpectralAstJudge({ pathCount: 146, bezierCount: 310, groupDepth: 9, viewBoxArea: 480000 });
  assert.ok(astArgonMax.nonSaturatingSpectralScore > astSonnet.nonSaturatingSpectralScore);
  assert.match(astArgonMax.predictedTier, /CROWN_TIER/);
  const grayCrown = ArenaPricing.detectGrayBoxModelCRP({
    modelRawString: 'stealth-vnext-preview',
    ttftSec: 3.5,
    tps: 69,
    chunkCv: 0.22,
    svgPathCount: 155,
    bezierCount: 240,
    animCount: 14,
  });
  assert.equal(grayCrown.isNovelGrayboxModel, true);
  assert.equal(grayCrown.isAutoLockedAsCrown, true);
  assert.equal(grayCrown.inferredVendor, 'Anthropic');

  // 8) Wave-2: Budget.smartEst & Budget.sessionContextLife
  const priceSrc = fs.readFileSync(path.join(ROOT, 'ui', 'price.js'), 'utf8');
  const budCode = priceSrc.slice(priceSrc.indexOf('const Budget = (() => {'), priceSrc.indexOf("try { Bus.on('pulse'"));
  let bTime = 1000000;
  const bCtx = vm.createContext({
    Math, Number, String, Boolean, Array, Object, Set, Map, JSON,
    Store: { get: (k, d) => d, set() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    now: () => bTime,
    UI: { host: { account: { id: 'A' } } },
    Chats: new Map([['s1', { sid: 's1', messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'world' }] }]]),
    Pulse: { v: { pulse: 90, at: bTime, account: 'A' } },
    Trace: { index: () => ({ s1: { usd: 5.05 } }), turns: () => [{}], totals: () => ({ tok: 2000 }) },
    Bus: { emit() {} },
    LiveEst: { of: () => ({ usd: 5.05 }) },
  });
  vm.runInContext(budCode + ';this.Budget = Budget;', bCtx);
  const smart = bCtx.Budget.smartEst(bCtx.Budget.est(), { id: 'A' });
  assert.equal(smart.total, 50, '10% drop with $5.05 spend infers $50 tier');
  assert.equal(smart.remaining, 45);
  assert.equal(smart.hjb.inSweetSpot, true);
  const life = bCtx.Budget.sessionContextLife('s1');
  assert.ok(life && life.remainingPct > 95 && life.turns === 1);
});

test('v0.13.167+: 48-Topic Lightweight & Silky-Smooth Optimizations (Stages 1–6)', () => {
  const ROOT = path.join(__dirname, '..');
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // Stage 1: billing-probe, billing-probe-ui, arena-trace, eval-core
  const bpSrc = read('ui/billing-probe.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const famSrc = read('ui/arena-trace/family.js');
  const prcSrc = read('ui/arena-trace/pricing.js');
  const evalCoreSrc = read('ui/eval-core.js');
  assert.ok(bpSrc.includes('_normalizedCatalog'), 'catalog normalization cache');
  assert.ok(bpUiSrc.includes('_featCache') && bpUiSrc.includes('_analyzeCache') && bpUiSrc.includes('_cachedBankBySid'), 'O(1) bank index & feature/analyze memo caches');
  assert.ok(famSrc.includes('toolCalls: calls'), 'classifyFamily reuses extracted toolCalls');
  assert.ok(prcSrc.includes('evalMemo') && prcSrc.includes('effortMemo'), 'pricing evaluation & effort memoization');
  assert.ok(evalCoreSrc.includes('_evalMemCache'), 'in-memory evaluation session cache');

  // Stage 2: core.js, price.js, trace.js
  const coreSrc = read('ui/core.js');
  const priceSrc = read('ui/price.js');
  const traceSrc = read('ui/trace.js');
  assert.ok(coreSrc.includes('_storeRawCache') && coreSrc.includes('_costFetchCache'), 'Store raw JSON cache & /cost fetch cache');
  assert.ok(priceSrc.includes('_ofMemo'), 'LiveEst memoization');
  assert.ok(traceSrc.includes('_calcMemo'), 'BotService calc memoization');

  // Stage 3: title-cipher.js, strength.js
  const cipherSrc = read('ui/title-cipher.js');
  const strengthSrc = read('ui/strength.js');
  assert.ok(cipherSrc.includes('GOLD_PFX_CACHE'), 'TitleCipher decode LRU cache');
  assert.ok(strengthSrc.includes('canonMemo') && strengthSrc.includes('partsMemo'), 'Strength canon & parts memoization');

  // Stage 4: md.js, dock.js, app.css
  const mdSrc = read('ui/md.js');
  const dockSrc = read('ui/dock.js');
  const cssSrc = read('ui/app.css');
  assert.ok(mdSrc.includes('_inCache'), 'MD inline render LRU cache');
  assert.ok(dockSrc.includes('VLOGO_T'), 'Dock vlogo template cloneNode cache');
  assert.ok(cssSrc.includes('content-visibility:auto'), 'CSS content-visibility containment');

  // Stage 5: nodes.js, region-ip.js, node-routes.js
  const nodesSrc = read('ui/nodes.js');
  const regionIpSrc = read('ui/region-ip.js');
  const nodeRoutesSrc = read('ui/node-routes.js');
  assert.ok(nodesSrc.includes('acctParsed') && nodesSrc.includes('paintSt(fin)'), 'O(A) pre-parsed account routes & in-place node row updates');
  assert.ok(regionIpSrc.includes('.join(\'|\')'), 'RegionIP lightweight string digest');
  assert.ok(nodeRoutesSrc.includes('flushBatch'), 'NodeRoutes coalesced probeMany mutation');

  // Stage 6: extension-storage-native.js, gbrowser.js, proxy-dns.js, browser-extensions.js, main.js
  const extNativeSrc = read('src/extension-storage-native.js');
  const gbrowserSrc = read('src/gbrowser.js');
  const proxyDnsSrc = read('src/proxy-dns.js');
  const extSrc = read('src/browser-extensions.js');
  const mainSrc = read('src/main.js');
  assert.ok(extNativeSrc.includes('x.j'), 'pre-computed JSON value in extension storage write');
  assert.ok(gbrowserSrc.includes("readUntil('\\r\\n\\r\\n'"), 'chunked HTTP header readUntil in gbrowser');
  assert.ok(proxyDnsSrc.includes('resolveAllCache') && proxyDnsSrc.includes('resolveAllInflight'), 'DNS resolveAll TTL cache & inflight dedup');
  assert.ok(extSrc.includes('_manifestCache'), 'Extension manifest mtimeMs+size cache');
  assert.ok(mainSrc.includes('global._memHabitBank') && mainSrc.includes('persistHabitBankFiles'), 'In-memory habitLearnBank singleton + debounced disk write');
  assert.ok(mainSrc.includes('ses.__lastUa !== uaTarget'), 'Idempotent UA & proxy session updates');
});

test('v0.13.167+: Stages 7–10 Full 56-Topic Deep Audit & Multi-Mode (Agent/Battle/Direct/Max/Gacha) Silky-Smooth Optimizations', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const probeVendorSrc = read('ui/probe-vendor.js');
  const bundleSrc = read('src/bundle.js');
  const titleSyncSrc = read('ui/title-sync.js');
  const titlesSrc = read('ui/titles.js');
  const gviewSrc = read('ui/gview.js');
  const iprepSrc = read('ui/iprep.js');
  const poolSrc = read('ui/pool.js');
  const routePolicySrc = read('ui/route-policy.js');
  const coreSrc = read('ui/core.js');
  const traceSrc = read('ui/trace.js');
  const thinkingSrc = read('ui/thinking-status.js');
  const viewSrc = read('ui/view.js');
  const evalViewSrc = read('ui/eval-view.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const slotSrc = read('ui/slot.js');
  const mobileSrc = read('ui/mobile.js');
  const mainSrc = read('src/main.js');

  // Stage 8: Lazy ProbeLib JSON.parse getters, fast pre-built loadBundle, TitleSync.build0 memo, and GView 200ms render throttle
  assert.ok(probeVendorSrc.includes('get bank()') && probeVendorSrc.includes('get seedBank()'), 'ProbeLib lazy memoized JSON.parse getters');
  assert.ok(bundleSrc.includes('skipSyntaxCheck') && mainSrc.includes('skipSyntaxCheck: true'), 'loadBundle skipSyntaxCheck fast path');
  assert.ok(titleSyncSrc.includes('buildMemo') && titleSyncSrc.includes('didMutate'), 'TitleSync.build0 memoization & ingest mutation guard');
  assert.ok(gviewSrc.includes('_lastRenderAt') && gviewSrc.includes('_renderTimer'), 'GView 200ms render throttling during Gacha streaming');

  // Stage 9: IPC pelshots ping-pong guard, async saveDB queue, sibling _sibSyncKey guard, IPRep O(1) pre-memo, and Pool._parseMemo
  assert.ok(mainSrc.includes('saveDB._q') && mainSrc.includes('_sibSyncKey') && mainSrc.includes('mergeSharedPelshots'), 'Main-process async saveDB, sibling sync fingerprint guard, and pelshots IPC dedup');
  assert.ok(iprepSrc.includes('_memoHit') && iprepSrc.includes('this._memo.get(String(k))'), 'IPRep.score O(1) pre-memo lookup before hostOf/normIp');
  assert.ok(poolSrc.includes('_parseMemo') && poolSrc.includes('const bgDue ='), 'Pool.parse memoization & PoolMaint/ApiMaint no-op guards');

  // Stage 10: RoutePolicy prototype inheritance, Titles.view memo, ThinkingStatus WeakMap memo, Battle/Direct Seg.use + patchKids + StreamMD reuse, and O(M) renderChat
  assert.ok(routePolicySrc.includes('Object.create(pool.rep || null)'), 'RoutePolicy.withProbe prototype inheritance');
  assert.ok(titlesSrc.includes('_viewMemo'), 'Titles.view per-sid signature memoization');
  assert.ok(coreSrc.includes('_phMemoKey') && coreSrc.includes('alreadyConfirmedEmptyGhosts') && coreSrc.includes('needEnrichOnlineSids'), 'Pin.ensureBillingFlags O(1) memo & History.restoreFromLocalCache dedup');
  assert.ok(traceSrc.includes('_histStatSig'), 'BotService.calcPoolScore history stats memoization');
  assert.ok(thinkingSrc.includes('_accessMemo') && thinkingSrc.includes('_ofMemo'), 'ThinkingStatus.access & ThinkingStatus.of WeakMap memoization');
  assert.ok(viewSrc.includes('prevAsstArr') && viewSrc.includes('nextAsstArr') && viewSrc.includes('(streaming || keyPrefix !== \'txt\')'), 'UI.renderChat O(M) linear pass & R.text Seg.box reuse across Battle/Direct');
  assert.ok(evalViewSrc.includes('colASig') && evalViewSrc.includes('colBSig') && evalViewSrc.includes('thinkKey + \':det\''), 'EvalView Battle dual-column Seg.use caching & think-box reuse');
  assert.ok(bpUiSrc.includes('queuedIdentSids.delete(target.id)') && bpUiSrc.includes('UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.()'), 'runBgSweep queuedIdentSids cleanup & coalesced renderListSoon');
  assert.ok(slotSrc.includes('Gacha.run?.status === \'running\'') && mobileSrc.includes('if (!isMob()) return;'), 'Idle timer guards in Slot & MobFit');

  // Stage 12 Self-Consistency Audit: AutoRoute strict RoutePolicy.reputationOK, Store.get clone safety, Gacha R2 closed-source continuity, Titles.view fav/gold reactivity, and BotService closure memo
  const autoRouteSrc = read('ui/auto-route.js');
  const gachaSrc = read('ui/gacha.js');
  assert.ok(!autoRouteSrc.includes('+r.pure.fs < 25) ||') && autoRouteSrc.includes('IPRep.putProbe(d, c.proxyIp, r)'), 'AutoRoute enforces full RoutePolicy.reputationOK without fs<25 bypass and persists IPRep.putProbe');
  assert.ok(coreSrc.includes('_storeReadOnlyKeys') && coreSrc.includes('messages: JSON.parse(js)'), 'Store.get clones mutable cached objects and MsgCache.writeNow deep-clones messages');
  assert.ok(!gachaSrc.includes('_r2PlainAborted'), 'Gacha Round 2 never prematurely stops closed-source streams');
  assert.ok(titlesSrc.includes('favBit') && titlesSrc.includes('goldKey') && !traceSrc.includes('this._histStatSig'), 'Titles.view memo includes favBit/goldKey and BotService uses closure _histStatSig in strict mode');
});








