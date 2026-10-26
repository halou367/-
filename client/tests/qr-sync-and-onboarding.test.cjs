const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

test('QrSync: closed-loop PC pure-icon QR export & Mobile camera QR scan/import + onboarding', async () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui/core.js'), 'utf8');
  const accountsSrc = fs.readFileSync(path.join(ROOT, 'ui/accounts.js'), 'utf8');
  const pickerSrc = fs.readFileSync(path.join(ROOT, 'ui/account-picker.js'), 'utf8');
  const manifestSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const javaSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');

  // 1. Structural assertions on core.js, accounts.js, account-picker.js, AndroidManifest.xml, MainActivity.java
    assert.ok(coreSrc.includes('const QrSync = (() => {'));
  assert.ok(coreSrc.includes('function encodeQR(text)'));
  assert.ok(coreSrc.includes('function decodeFromImageData(imgData)'));
  assert.ok(coreSrc.includes('async function buildSyncBundle()'));
  assert.ok(coreSrc.includes('async function applySyncPayload(rawInput, onProgress)'));
  assert.ok(coreSrc.includes('position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center'));
  assert.ok(coreSrc.includes("let curTab = initialTab === 'import' ? 'import' : (initialTab === 'export' ? 'export' : (isMobile ? 'import' : 'export'));"));
  assert.ok(coreSrc.includes('qrSvgWrap.innerHTML = toSvg(curUri, 248)'));
  assert.ok(coreSrc.includes('请先配置 EdgeTunnel 订阅地址'));
  assert.ok(coreSrc.includes('扫描电脑端二维码'));
  assert.ok(accountsSrc.includes("class: 'ib export-qr-sync-btn'"));
  assert.ok(!accountsSrc.includes('export-qr-bar'), 'export-qr-bar banner must be removed');
  assert.ok(accountsSrc.includes("class: 'ib import-qr-sync-btn'"));
  assert.ok(pickerSrc.includes("Host.platform === 'android'"));
  assert.ok(manifestSrc.includes('android.permission.CAMERA'));
  assert.ok(javaSrc.includes('PermissionRequest.RESOURCE_VIDEO_CAPTURE'));
  assert.ok(javaSrc.includes('CAM_PERM_REQ'));

  // 2. Round-trip VM test: buildSyncBundle -> toSvg -> simulated camera frame -> decodeFromImageData -> applySyncPayload
  const i0 = coreSrc.indexOf('const QrSync = (() => {');
  const i1 = coreSrc.indexOf('const ReadLimit = {', i0);
  const qrCode = coreSrc.slice(i0, i1);
  const saved = [];
  const ctx = {
    console, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, Error, TypeError, JSON,
    Uint8Array, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    ONBOARD_DONE_KEY: 'qrOnboardDone',
    Store: { get: () => null, set: () => true },
    Vless: require('../ui/vless.js'),
    Nodes: {
      subs: [{ url: 'https://edgetunnel.example.com/sub', n: 1, at: Date.now() }],
      list: [{ id: 'n1', address: '104.18.21.92', port: 2083, uuid: '4f6558e6-47c3-4df9-8ab3-3ea6b3c1050d', security: 'tls', type: 'ws', host: 'edgetunnel.example.com', sni: 'edgetunnel.example.com', path: '/?ed=2560', name: 'US-1' }],
      pips: ['104.18.21.92:443'],
      load: async () => {}, loadSubs: async () => {}, loadPips: async () => {},
      save: () => {}, saveSubs: () => {}, addPips: () => {}, syncAndroid: () => {},
      mk: x => ({ ...x, id: 'n1' }), key: x => x.address + ':' + x.port + ':' + x.uuid,
    },
    Pool: { d: { node: 'n1' }, load: async () => {}, mutate: async fn => fn({ node: 'n1' }), pushG: () => {} },
    Host: {
      platform: 'desktop',
      exportAccounts: async () => [
        { id: 'a1', name: 'acct1', email: 'u1@example.com', password: 'pw1', proxy: 'vless://4f6558e6-47c3-4df9-8ab3-3ea6b3c1050d@104.18.21.92:2083?encryption=none&security=tls&sni=edgetunnel.example.com&type=ws&host=edgetunnel.example.com&path=%2F%3Fed%3D2560#US-1', proxyIp: '104.18.21.92:443', region: 'US', nodeId: 'n1' },
      ],
      listAccounts: async () => [{ id: 'mob-1', name: '账号 1', email: '', hasPw: false }],
      saveAccount: async p => { saved.push(p); return { ok: true, account: p }; },
    },
    UI: { host: { account: { id: 'mob-1', name: '账号 1', email: '', hasPw: false }, accounts: [] } },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(qrCode, ctx);

  const bundle = await ctx.QrSync.buildSyncBundle();
  assert.ok(bundle.qrPayload.startsWith('brana-sync://'));
  const svg = ctx.QrSync.toSvg(bundle.qrPayload, 248);
  assert.ok(svg.startsWith('<svg') && svg.includes('<path d="M'));

  const { size, grid } = ctx.QrSync.encodeQR(bundle.qrPayload);
  const W = 480, H = 480, pad = 4, scale = 3, cardPx = (size + pad * 2) * scale;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = 20; rgba[i * 4 + 1] = 20; rgba[i * 4 + 2] = 24; rgba[i * 4 + 3] = 255; }
  const ox = (W - cardPx) >> 1, oy = (H - cardPx) >> 1;
  for (let y = 0; y < cardPx; y++) {
    for (let x = 0; x < cardPx; x++) {
      const mr = Math.floor(y / scale) - pad, mc = Math.floor(x / scale) - pad;
      const dark = mr >= 0 && mr < size && mc >= 0 && mc < size && grid[mr][mc] === 1;
      const c = dark ? 17 : 255, idx = ((oy + y) * W + (ox + x)) * 4;
      rgba[idx] = c; rgba[idx + 1] = c; rgba[idx + 2] = c;
    }
  }
  const decoded = await ctx.QrSync.decodeFromImageData({ data: rgba, width: W, height: H });
  assert.equal(decoded, bundle.qrPayload);

  const res = await ctx.QrSync.applySyncPayload(decoded);
  assert.equal(res.ok, true);
  assert.equal(res.accountCount, 1);
  assert.equal(saved[0].id, 'mob-1');
  assert.equal(saved[0].email, 'u1@example.com');
});

test('QrSync.openModal("export") renders actual SVG QR code, summary, and copy row without missing ib/ONBOARD_DONE_KEY', async () => {
  const vm = require('node:vm');
  const { CompressionStream, DecompressionStream } = require('node:stream/web');
  const viewSrc = fs.readFileSync(path.join(ROOT, 'ui/view.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui/core.js'), 'utf8');
  const vlessSrc = fs.readFileSync(path.join(ROOT, 'ui/vless.js'), 'utf8');
  const qStart = coreSrc.indexOf('const QrSync = (() => {');
  const qRet = coreSrc.indexOf('return { encodeQR,', qStart);
  const qEnd = coreSrc.indexOf('})();', qRet) + 5;

  function makeEl(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      className: '',
      style: {},
      attrs: {},
      children: [],
      textContent: '',
      _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) { this._innerHTML = String(v || ''); },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(ev, fn) { this['on' + ev] = fn; },
      append(...kids) { for (const k of kids) if (k != null && k !== false) this.children.push(typeof k === 'object' ? k : { nodeType: 3, textContent: String(k) }); },
      appendChild(k) { this.children.push(k); return k; },
      replaceChildren(...kids) { this.children = []; this._innerHTML = ''; this.append(...kids); },
      remove() { this._removed = true; },
      querySelector(sel) {
        if (sel === 'svg' && (this._innerHTML.includes('<svg') || this.children.some(c => c.tagName === 'SVG'))) return { tagName: 'SVG' };
        for (const c of this.children) if (c.querySelector) { const r = c.querySelector(sel); if (r) return r; }
        return null;
      },
      classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    };
  }
  const doc = {
    body: makeEl('body'),
    createElement: tag => makeEl(tag),
    createElementNS: (_, tag) => makeEl(tag),
    createTextNode: txt => ({ nodeType: 3, textContent: String(txt) }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const ctx = vm.createContext({
    document: doc,
    window: {},
    Uint8Array, Array, Object, String, Number, Boolean, Math, Date, RegExp, JSON, Error, Map, Set, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Host: {
      platform: 'desktop',
      exportAccounts: async () => [{ id: 'a1', name: 'Test', email: 'test@example.com', password: 'pw', region: 'US' }],
    },
    Nodes: {
      subs: [{ url: 'https://sub.example.com/sub' }],
      list: [{ id: 'n1', name: 'US', address: '1.2.3.4', port: 443, uuid: '11111111-2222-3333-4444-555555555555', security: 'tls', type: 'ws' }],
      pips: ['1.1.1.1:443'],
      load: async () => {},
      loadSubs: async () => {},
      loadPips: async () => {},
    },
    Pool: { d: { node: 'n1' }, load: async () => {} },
    UI: { host: { accounts: [{ id: 'a1', name: 'Test', email: 'test@example.com', password: 'pw', region: 'US' }], account: { id: 'a1', email: 'test@example.com' } } },
    Store: { get: () => null, set: () => {}, del: () => {} },
  });
  const viewHead = viewSrc.slice(0, viewSrc.indexOf('function toast(') + 350);
  vm.runInContext([viewHead, vlessSrc, coreSrc.slice(qStart, qEnd), 'this.QrSync = QrSync;'].join('\n'), ctx);

  const ov = ctx.QrSync.openModal('export');
  await new Promise(r => setTimeout(r, 60));
  const qrBox = ov.children[0].children[1].children[0];
  const qrSvgWrap = qrBox.children[0];
  assert.ok(qrSvgWrap.innerHTML.includes('<svg') && qrSvgWrap.innerHTML.includes('<path d="M'), 'QR SVG must render inside qrSvgWrap');
});

test('QrSync: 17 accounts + 9 nodes + 1 subscription fit into a single QR code without multi-page splitting and importAccounts has no duplicate QR buttons', async () => {
  const vm = require('node:vm');
  const { CompressionStream, DecompressionStream } = require('node:stream/web');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui/core.js'), 'utf8');
  const accountsSrc = fs.readFileSync(path.join(ROOT, 'ui/accounts.js'), 'utf8');
  const vlessSrc = fs.readFileSync(path.join(ROOT, 'ui/vless.js'), 'utf8');

  // Verify importAccounts has only one QR sync button and no duplicate batchTokenRegister button inside pick
  const impStart = accountsSrc.indexOf('importAccounts(prefill =');
  const impEnd = accountsSrc.indexOf('go.onclick = async () =>', impStart);
  const impSlice = accountsSrc.slice(impStart, impEnd);
  assert.strictEqual((impSlice.match(/扫码导入电脑端二维码/g) || []).length, 2, 'only one QR button (title + aria-label) in importAccounts');
  assert.ok(!impSlice.includes('批量令牌协议注册'), 'no duplicate batch token button in importAccounts toolbar');

  const qStart = coreSrc.indexOf('const QrSync = (() => {');
  const qRet = coreSrc.indexOf('return { encodeQR,', qStart);
  const qEnd = coreSrc.indexOf('})();', qRet) + 5;
  const accts17 = Array.from({ length: 17 }, (_, i) => ({
    id: 'a' + (i + 1),
    name: `user_${i + 1}@icloud.com`,
    email: `user_${i + 1}@icloud.com`,
    password: 'SharedPassword123!',
    proxyIp: `138.68.64.${100 + i}:443`,
    region: i % 2 === 0 ? 'DE' : 'US',
    nodeId: 'n1',
  }));
  const nodes9 = Array.from({ length: 9 }, (_, i) => ({
    id: 'n' + (i + 1),
    name: `JP 电信优选[${40 + i}ms]`,
    address: `172.64.229.${10 + i}`,
    port: 2053,
    uuid: '4f25158a-8767-4c69-8ab3-231b64610989',
    security: 'tls',
    type: 'ws',
    host: '755-33w.pages.dev',
    sni: '755-33w.pages.dev',
    path: '/',
  }));

  const savedAccts = [];
  const ctx = vm.createContext({
    document: { createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {} }) },
    window: {},
    Uint8Array, Uint8ClampedArray, Array, Object, String, Number, Boolean, Math, Date, RegExp, JSON, Error, Map, Set, Promise,
    setTimeout, clearTimeout,
    TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    h: () => ({}), icon: () => ({}), toast: () => {},
    Host: {
      platform: 'desktop',
      exportAccounts: async () => accts17,
      listAccounts: async () => [],
      saveAccount: async (a) => { savedAccts.push(a); return { ...a, id: a.id || ('id_' + savedAccts.length) }; },
    },
    Nodes: {
      subs: [{ url: 'https://755-33w.pages.dev/sub?token=230206e4efdd7ccb9693f67878992abe' }],
      list: nodes9,
      pips: [],
      load: async () => {},
      loadSubs: async () => {},
      loadPips: async () => {},
      save: () => {},
      saveSubs: () => {},
      mk: x => ({ ...x, id: x.id || 'n1' }),
      key: x => `${x.address}:${x.port}:${x.uuid}`,
    },
    Pool: { d: { node: 'n1' }, load: async () => {}, mutate: async () => {} },
    UI: { host: { accounts: accts17, account: accts17[0] } },
    Store: { get: () => null, set: () => {}, del: () => {} },
  });
  vm.runInContext([vlessSrc, coreSrc.slice(qStart, qEnd), 'this.QrSync = QrSync;'].join('\n'), ctx);

  const bundle = await ctx.QrSync.buildSyncBundle();
  assert.strictEqual(bundle.qrPages.length, 1, 'all 17 accounts must fit in 1 single QR code page');
  assert.strictEqual(bundle.inlineLite.a.length, 17, 'all 17 accounts must be included in inlineLite');
  const svg = ctx.QrSync.toSvg(bundle.qrPayload, 356);
  assert.ok(svg.startsWith('<svg') && svg.includes('width="356"'));

  const res = await ctx.QrSync.applySyncPayload(bundle.qrPayload);
  assert.strictEqual(res.accountCount, 17, 'single QR code must import all 17 accounts');
  assert.strictEqual(savedAccts.length, 17);
  assert.strictEqual(savedAccts[0].email, 'user_1@icloud.com');
  assert.strictEqual(savedAccts[16].email, 'user_17@icloud.com');

  // Verify encrypted dictionary-dedup QR (brana-sync://e2/...) is even shorter and round-trips all 17 accounts
  assert.ok(bundle.qrEncryptedPayload.startsWith('brana-sync://e2/'), 'encrypted compact QR uses e2 scheme');
  assert.ok(bundle.qrEncryptedPayload.length < bundle.qrPayload.length, 'encrypted dictionary QR is shorter than JSON v2 QR');
  savedAccts.length = 0;
  const resEnc = await ctx.QrSync.applySyncPayload(bundle.qrEncryptedPayload);
  assert.strictEqual(resEnc.accountCount, 17, 'encrypted compact QR must import all 17 accounts');
  assert.strictEqual(savedAccts.length, 17);
  assert.strictEqual(savedAccts[0].email, 'user_1@icloud.com');
  assert.strictEqual(savedAccts[16].email, 'user_17@icloud.com');
});
