'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

test('v2.0.3: _doExtFetch routes non-stream protocol endpoints via Host.protoFetch with bypass429 even when extension wraps window.fetch', async () => {
  const coreSrc = fs.readFileSync(path.join(ROOT, 'ui', 'core.js'), 'utf8');
  assert.ok(coreSrc.includes('const _origFetch = window.fetch;'), 'saves _origFetch before extension wrapping');
  const start = coreSrc.indexOf('const _origFetch = window.fetch;');
  const end = coreSrc.indexOf('const _extFetch = (u, o) => {');
  assert.ok(start >= 0 && end > start, 'locates fetch transport block in core.js');

  const protoCalls = [];
  const extCalls = [];
  const rawCalls = [];
  const origFetch = async (u, o) => { rawCalls.push({ u, o }); return { ok: true, status: 200, text: async () => '{}' }; };

  class FakeHeaders {
    constructor() { this.map = new Map(); }
    set(k, v) { this.map.set(String(k).toLowerCase(), String(v)); }
    get(k) { return this.map.get(String(k).toLowerCase()) || null; }
  }
  class FakeResponse {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = init.headers || new FakeHeaders();
    }
    async text() { return String(this._body ?? ''); }
  }

  const sandbox = {
    ORIGIN: 'https://arena.ai',
    Headers: FakeHeaders,
    Response: FakeResponse,
    DOMException: globalThis.DOMException,
    Pin: { on: () => true, held: false, id: 'dpl_testPin1234567890abcd' },
    Host: {
      protoFetch: async (rel, opt) => {
        protoCalls.push({ rel, opt });
        return {
          ok: true,
          status: 200,
          text: '{"ok":true}',
          contentType: 'application/json',
          headers: { 'x-arena-trigger-version': 'v2' },
        };
      },
    },
    window: { fetch: origFetch },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const snippet = coreSrc.slice(start, end) + '\n;globalThis.__testExtFetch = _doExtFetch; globalThis.__testCanProto = _canUseProtoFetch;';
  vm.runInContext(snippet, sandbox);

  // Simulate Arena流式修复 wrapping window.fetch in MAIN world
  const prevFetch = sandbox.window.fetch;
  sandbox.window.fetch = function wrappedByStreamFix(u, o) {
    extCalls.push({ u, o });
    return prevFetch(u, o);
  };

  // 1. Non-stream chat read MUST go to Host.protoFetch with bypass429: true (NOT bypassed by extension wrapper)
  const rChat = await sandbox.__testExtFetch('/api/chat/11111111-2222-3333-4444-555555555555', { method: 'GET' });
  assert.equal(protoCalls.length, 1);
  assert.equal(extCalls.length, 0);
  assert.equal(protoCalls[0].opt.bypass429, true);
  assert.equal(protoCalls[0].opt.vdpl, 'dpl_testPin1234567890abcd');
  assert.equal(rChat.headers.get('x-arena-trigger-version'), 'v2');

  // 2. Auth & /cdn-cgi/trace go to Host.protoFetch with bypass429: false
  await sandbox.__testExtFetch('/cdn-cgi/trace', { method: 'GET' });
  assert.equal(protoCalls.at(-1).opt.bypass429, false);
  await sandbox.__testExtFetch('/nextjs-api/sign-in', { method: 'POST', body: '{"email":"a@b.c"}' });
  assert.equal(protoCalls.at(-1).opt.bypass429, false);

  // 3. SSE stream (/out and /nextjs-api/stream/*) MUST pass through extension window.fetch wrapper
  await sandbox.__testExtFetch('/api/stream/chat/11111111-2222-3333-4444-555555555555/out', { headers: { Accept: 'text/event-stream' } });
  assert.equal(extCalls.length, 1);
  assert.equal(protoCalls.length, 3);

  // 4. Binary CAS & workspace zip paths skip UTF-8 _canUseProtoFetch
  assert.equal(sandbox.__testCanProto('/api/chat/workspace/cas/user/abcdef', {}), '');
  assert.equal(sandbox.__testCanProto('/api/chat/123/workspace/node1/download', {}), '');
});

test('v2.0.3: main.js isolates __vdpl out of shared cookies, raises protoFetch buffer to 12MB, and supports winDrag toggleMax + snap', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(mainSrc.includes('text.slice(0, 12e6)') || mainSrc.includes('.slice(0, 12e6)'), '12MB text buffer in host:protoFetch');
  assert.ok(mainSrc.includes("if (ckName === '__vdpl') continue;"), 'storeSetCookies skips __vdpl pollution');
  assert.ok(!/name:\s*'__vdpl'/.test(mainSrc), 'costShown no longer persists __vdpl into ses.cookies');
  assert.ok(mainSrc.includes("if (phase === 'toggleMax')"), 'host:winDrag supports toggleMax');
  assert.ok(mainSrc.includes('wa && pt.y <= wa.y + 5'), 'host:winDrag snaps to maximize at top display edge');
});

test('v2.0.3: desktop top tab bar stretches evenly and supports omnidirectional drag + double-click maximize', () => {
  const cssSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.css'), 'utf8');
  assert.ok(cssSrc.includes('body:not(.m) #tablist .tab{flex:1 1 0%;width:auto;min-width:76px;max-width:none;overflow:hidden}'));

  const viewSrc = fs.readFileSync(path.join(ROOT, 'ui', 'view.js'), 'utf8');
  assert.ok(viewSrc.includes("if (st.mouse && desk && !isMob()) { st.mode = 'move';"), 'desktop mouse drag on tabs moves window in all directions');
  assert.ok(viewSrc.includes("Host.winDrag('toggleMax')"), 'double-click top bar toggles maximize');
});

test('v2.0.3: Android release signing locks onto permanent release.jks without debug fallback and CI verifies cert SHA-256', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '2.0.3');

  const gradleSrc = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  assert.ok(gradleSrc.includes('applicationId "ai.arena.client"'));
  assert.ok(gradleSrc.includes("file('release.jks')"));
  assert.ok(gradleSrc.includes("storeType 'pkcs12'"));
  assert.ok(!gradleSrc.includes('signingConfigs.debug'), 'must never fall back to debug keystore on release build');
  assert.ok(fs.existsSync(path.join(ROOT, 'android', 'app', 'release.jks')), 'permanent release.jks exists in repo');

  const javaSrc = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'ai', 'arena', 'client', 'MainActivity.java'), 'utf8');
  assert.ok(javaSrc.includes('opts.optBoolean("bypass429", false)'), 'Android protoFetchSync supports bypass429');
  assert.ok(javaSrc.includes('"base64".equalsIgnoreCase(opts.optString("responseType"'), 'Android protoFetchSync supports base64 binary responses');

  const wfSrc = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'client.yml'), 'utf8');
  assert.ok(wfSrc.includes('E9:92:D4:48:E7:E1:F2:96:FF:E9:D3:A1:F3:F5:03:72:29:B4:AB:BA:09:3B:7E:8B:3F:20:1F:60:A6:8D:4F:91'));
});
