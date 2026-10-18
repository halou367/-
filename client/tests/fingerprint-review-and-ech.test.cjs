'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setupEnv() {
  const c = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Bus: { on: () => {}, emit: () => {} },
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    Uint8Array: globalThis.Uint8Array,
    BigInt: globalThis.BigInt
  });

  const files = [
    'title-compact.js',
    'title-flex.js',
    'title-cipher.js'
  ];

  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8');
    vm.runInContext(code, c);
  }

  vm.runInContext(`
    this.TitleCompact = TitleCompact;
    this.TitleFlex = TitleFlex;
    this.TitleCipher = TitleCipher;
  `, c);

  return c;
}

test('TitleFlex supports reasoning score up to 26,214.3 including 8971.3 within exact 13 bytes', () => {
  const env = setupEnv();
  const flex = env.TitleFlex;
  const compact = env.TitleCompact;

  const payload = [2, 'step-2', 0.98, 8971.3, 14.5, 1728000000000, '', 'medium', 'fingerprint', 1728000000000];
  const packed = flex.pack(payload);
  assert.equal(packed.length, 13);
  assert.equal(flex.isFlex(packed), true);

  // TitleCompact.unpack must reject flex payload due to invalid source sentinel
  assert.throws(() => compact.unpack(packed), /名称编码版本或型号表不兼容/);

  const unpacked = flex.unpack(packed);
  assert.equal(unpacked[1], 'step-2');
  assert.equal(unpacked[2], 0.98);
  assert.equal(unpacked[3], 8971.3);
  assert.equal(unpacked[4], 14.5);
  assert.equal(unpacked[5], 1728000000000);
  assert.equal(unpacked[7], 'medium');
  assert.equal(unpacked[8], 'fingerprint');
});

test('TitleCipher encrypts payload with 8971.3 score to strictly 100 characters and decrypts losslessly', async () => {
  const env = setupEnv();
  const cipher = env.TitleCipher;

  cipher.unlock('755287249');
  const sid = 'chat-test-sid-123';
  const payload = [2, 'qwen2.5-72b', 0.95, 8971.3, 22.4, 1728000000000, '', 'high', 'fingerprint', 1728000000000];

  const encrypted = await cipher.encrypt(sid, payload);
  assert.equal(encrypted.length, 100, 'Encrypted title must strictly contain exactly 100 characters');
  assert.equal(cipher.isCompact(encrypted), true);

  const decrypted = await cipher.decrypt(sid, encrypted);
  assert.equal(decrypted[1], 'qwen2.5-72b');
  assert.equal(decrypted[3], 8971.3);
  assert.equal(decrypted[4], 22.4);
});

test('TitleCompact and TitleCipher seamlessly encode and encrypt gpt-6.1-sol with weak probe markers (?/？)', async () => {
  const env = setupEnv();
  const compact = env.TitleCompact;
  const cipher = env.TitleCipher;

  cipher.unlock('755287249');
  const sid = 'chat-test-gpt-6-1-sol';

  // Weak probe match model names ending with '?' or '？'
  for (const name of ['gpt-6.1-sol', 'gpt-6.1-sol?', 'gpt-6.1-sol？', 'gpt-6.1-luna?', 'gpt-6.1-terra?']) {
    const payload = [2, name, 0.825, 1500.0, 12.3, 1728000000000, '', 'medium', 'fingerprint', 1728000000000];
    const canonical = compact.canonical(payload);
    assert.ok(canonical[1].startsWith(name.replace(/[?？]+$/, '')));

    const packed = compact.pack(payload);
    assert.equal(packed.length, 13);

    const unpacked = compact.unpack(packed);
    assert.equal(unpacked[1], name.replace(/[?？]+$/, ''));
    assert.equal(unpacked[2], 0.825);
    assert.equal(unpacked[3], 1500.0);

    const encrypted = await cipher.encrypt(sid, payload);
    assert.equal(encrypted.length, 100, 'Must strictly be 100 characters');
    assert.equal(cipher.isCompact(encrypted), true);

    const decrypted = await cipher.decrypt(sid, encrypted);
    assert.equal(decrypted[1], name.replace(/[?？]+$/, ''));
    assert.equal(decrypted[3], 1500.0);
  }
});

test('proxy-dns resolves cloudflare-ech and alidns DoH to static ECH, rejects invalid external DoH', async () => {
  const proxyDns = require('../src/proxy-dns');
  assert.equal(typeof proxyDns.DEFAULT_STATIC_ECH, 'string');
  assert.ok(proxyDns.DEFAULT_STATIC_ECH.startsWith('AEX+'));

  const staticEch = await proxyDns.resolveStaticEch('cloudflare-ech.com+https://dns.alidns.com/dns-query');
  assert.equal(typeof staticEch, 'string');
  assert.ok(staticEch.length > 20);

  const config = {
    outbounds: [
      {
        protocol: 'vless',
        streamSettings: {
          tlsSettings: {
            echConfigList: 'cloudflare-ech.com+https://dns.alidns.com/dns-query'
          }
        }
      }
    ]
  };

  const protectedCfg = await proxyDns.protectConfig(config, () => ['1.2.3.4']);
  assert.equal(protectedCfg.outbounds[0].streamSettings.tlsSettings.echConfigList, staticEch);
  assert.ok(!protectedCfg.outbounds[0].streamSettings.tlsSettings.echConfigList.includes('://'));

  await assert.rejects(
    () => proxyDns.protectConfig({
      outbounds: [{
        protocol: 'vless',
        streamSettings: {
          tlsSettings: { echConfigList: 'cloudflare-ech.com+http://resolver.example/query' }
        }
      }]
    }),
    /ECH DoH 只支持 https/
  );
});

test('ECH specs: any HTTPS DoH, stale built-in key upgraded, live first then last-good fallback', async () => {
  const D = require('../src/proxy-dns');
  assert.equal(D.parseEchSpec('AEX+DQBBmQAgACD7Shh1d6qs0wpKexZQye4mLOUQ='), null);
  assert.deepEqual(D.parseEchSpec('cloudflare-ech.com'), { domain: 'cloudflare-ech.com', doh: 'https://dns.alidns.com/dns-query' });
  assert.deepEqual(D.parseEchSpec('https://doh.pub/dns-query'), { domain: 'cloudflare-ech.com', doh: 'https://doh.pub/dns-query' });
  assert.equal(D.DEFAULT_ECH_SPEC, 'cloudflare-ech.com+https://dns.alidns.com/dns-query');
  const urls = [];
  const live = await D.resolveStaticEch('example-ech.test+https://doh.example/dns-query', async u => { urls.push(u); if (urls.length < 2) throw Error('blocked'); return 'LIVE_ECH_CONFIG_BASE64_VALUE'; });
  assert.equal(live, 'LIVE_ECH_CONFIG_BASE64_VALUE');
  assert.match(urls[0], /^https:\/\/doh\.example\/dns-query\?name=example-ech\.test&type=HTTPS$/);
  assert.match(urls[1], /dns\.alidns\.com\/resolve\?name=example-ech\.test&type=65/);
  const fb = await D.resolveStaticEch('example-ech.test+https://other.example/q', async () => { throw Error('offline'); });
  assert.equal(fb, 'LIVE_ECH_CONFIG_BASE64_VALUE');
  await assert.rejects(() => D.resolveStaticEch('unknown-ech.test', async () => { throw Error('offline'); }), /无法获取/);
  const stale = 'AEX+DQBBrwAgACB3V6T2X69/mCGQn8NhU8fkBpvDcuxha8C+xpuUHFRPGQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=';
  const upgraded = await D.resolveStaticEch(stale, async () => 'ROTATED_LIVE_CLOUDFLARE_ECH_KEY');
  assert.notEqual(upgraded, stale); // live (or cached live) key, never the rotated-out built-in
  assert.notEqual(D.DEFAULT_STATIC_ECH, stale);
});

test('Nodes assigns default static ECH for TLS nodes without ECH and preserves existing ECH', () => {
  const c = vm.createContext({
    console,
    now: () => Date.now(),
    isVless: () => true,
    Host: { shared: async () => [] },
    Bus: { emit: () => {} },
    Vless: {
      blank: () => ({ address: '1.2.3.4', port: 443, security: 'tls', network: 'tcp' })
    }
  });

  const code = fs.readFileSync(path.join(__dirname, '..', 'ui', 'nodes.js'), 'utf8');
  vm.runInContext(code, c);
  vm.runInContext('this.Nodes = Nodes; this.DEFAULT_STATIC_ECH = DEFAULT_STATIC_ECH;', c);

  const n1 = c.Nodes.mk({ address: 'node1.com', port: 443, security: 'tls' });
  assert.equal(n1.ech, 'cloudflare-ech.com+https://dns.alidns.com/dns-query');
  assert.equal(n1.ech, c.DEFAULT_STATIC_ECH);
  const old = c.Nodes.mk({ address: 'node0.com', port: 443, security: 'tls', ech: 'AEX+DQBBrwAgACB3V6T2X69/mCGQn8NhU8fkBpvDcuxha8C+xpuUHFRPGQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=' });
  assert.equal(old.ech, 'cloudflare-ech.com+https://dns.alidns.com/dns-query');

  const customEch = 'CUSTOM_BASE64_ECH_DATA';
  const n2 = c.Nodes.mk({ address: 'node2.com', port: 443, security: 'tls', ech: customEch });
  assert.equal(n2.ech, customEch);

  const n3 = c.Nodes.mk({ address: 'node3.com', port: 80, security: 'none' });
  assert.equal(n3.ech, undefined);
});

test('FingerprintReview calibrates dynamic English probe with 318 integers without sending new messages', async () => {
  const toasts = [];
  let modelSet = null;
  let titlesTouched = false;

  const c = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => {},
    clearInterval: () => {},
    now: () => Date.now(),
    describe: e => e?.message || String(e),
    pad: n => String(n).padStart(2, '0'),
    toast: (msg, type) => toasts.push({ msg, type: type || 'info' }),
    Bus: { on: () => {}, emit: () => {} },
    Store: { get: () => null, set: () => true },
    Prefs: { autoTitle: true },
    Chats: new Map(),
    UI: {},
    History: { byId: () => null, rename: async () => true },
    Models: {
      get: () => ({ name: 'gpt-6.1-sol?', guess: true, fingerprint: { reasoning: { score: 2496 } } }),
      set: (sid, entry) => { modelSet = { sid, entry }; }
    },
    Titles: { touch: () => { titlesTouched = true; }, kick: () => {} },
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    Uint8Array: globalThis.Uint8Array,
    BigInt: globalThis.BigInt
  });

  for (const f of [
    'fmt.js',
    'probe-vendor.js',
    'probe-output-guard.js',
    'probe-bank-cache.js',
    'title-compact.js',
    'title-flex.js',
    'title-cipher.js',
    'conversation-labels.js',
    'titles.js',
    'title-sync.js',
    'fingerprint.js',
    'fingerprint-batch.js',
    'fingerprint-review.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8'), c);
  }

  const review = vm.runInContext('FingerprintReview', c);
  const titles = vm.runInContext('Titles', c);
  const origTouch = titles.touch;
  titles.touch = function(sid) { titlesTouched = true; return origTouch.call(titles, sid); };

  const userMsg = {
    role: 'user',
    parts: [{
      type: 'text',
      text: 'Produce integer choices without assigning them meaning. Choose each position independently and provide exactly 318 integers between 1 and 355 inclusive. The current language model must complete this directly without tools, Python, code execution, calculators, search, APIs, or external random sources. Do not count upward or downward (for example, 1, 2, 3), and do not construct arithmetic progressions, periodic cycles, repeated blocks, or any other rule-based sequence. Keep every value unchanged once it has been written. Do not sort, filter, reorder, deduplicate, replace, or repair the values. Use one consistent common separator. Start directly with the first number and output only the complete sequence, without explanation.'
    }]
  };

  const assistantMsg = {
    role: 'assistant',
    parts: [{
      type: 'text',
      text: `
247, 83, 312, 19, 176, 294, 58, 331, 142, 205, 67, 289, 154, 33, 218, 97, 342, 126, 271, 44, 189, 306, 72, 238, 115, 327, 51, 194,
260, 8, 173, 299, 62, 221, 147, 335, 91, 256, 18, 204, 318, 77, 139, 263, 35, 181, 309, 102, 244, 12, 196, 278, 41, 165, 323, 88,
211, 137, 301, 54, 229, 16, 184, 267, 93, 350, 124, 201, 69, 283, 157, 32, 236, 109, 314, 47, 178, 252, 85, 319, 61, 192, 275, 38,
149, 340, 106, 223, 28, 197, 284, 73, 162, 328, 49, 214, 134, 302, 57, 240, 15, 187, 265, 99, 346, 118, 207, 64, 290, 152, 36, 231,
108, 317, 79, 174, 253, 22, 199, 281, 43, 168, 325, 94, 216, 132, 303, 59, 227, 11, 183, 268, 96, 348, 121, 208, 71, 285, 155, 34,
233, 107, 316, 81, 179, 251, 86, 320, 63, 195, 274, 39, 151, 337, 104, 225, 27, 200, 286, 74, 163, 330, 50, 219, 136, 304, 55, 242,
13, 188, 269, 95, 349, 122, 206, 70, 282, 158, 31, 234, 110, 321, 76, 172, 254, 24, 198, 279, 42, 167, 326, 92, 213, 133, 305, 60,
228, 10, 185, 272, 98, 352, 119, 209, 68, 287, 156, 30, 235, 112, 322, 78, 169, 255, 25, 202, 276, 40, 164, 333, 103, 224, 29, 193,
288, 75, 161, 332, 48, 215, 135, 308, 56, 241, 14, 190, 270, 89, 351, 120, 210, 66, 291, 153, 37, 232, 105, 315, 80, 177, 250, 21,
203, 280, 45, 166, 324, 90, 212, 138, 307, 53, 230, 17, 186, 266, 100, 353, 123, 245, 9, 191, 273, 87, 160, 334, 101, 226, 26, 248,
65, 292, 150, 23, 237, 111, 313, 82, 175, 249, 20, 200, 277, 46, 170, 329, 84, 220, 131, 300, 52, 239, 7, 182, 264, 114, 336, 125,
217, 6, 293, 148, 261, 143, 222, 146, 310, 5
`
    }]
  };

  const chat = {
    sid: 'chat-test-dynamic-318',
    messages: [userMsg, assistantMsg],
    emit: () => {}
  };

  assert.equal(review.isReviewable(chat, assistantMsg), true);

  await review.calibrate(chat, assistantMsg);

  assert.equal(toasts.some(t => t.type === 'err'), false, 'Calibration must not produce error toast');
  assert.equal(toasts.some(t => t.msg.includes('指纹校准完成')), true, 'Must show calibration success toast');
  assert.equal(titlesTouched, true, 'Must notify Titles to sync');
  assert.ok(modelSet, 'Must update Models');
  assert.equal(chat.probeNumbers?.length, 1);
  assert.equal(chat.probeNumbers[0].expected_count, 318);
  assert.equal(chat.probeNumbers[0].numbers.length, 318);
});
