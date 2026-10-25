
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const DE = 'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/DE.txt';
const fullDE = Array.from({ length: 549 }, (_, i) => `10.${Math.floor(i / 256)}.${i % 256}.1 443`).join('\n') + '\n';
function loadPool() {
  const src = fs.readFileSync(path.join(__dirname, '../ui/pool.js'), 'utf8');
  const store = {}, ctx = { console, URL, atob: s => Buffer.from(s, 'base64').toString('binary'), escape, decodeURIComponent, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, addEventListener() {}, navigator: { onLine: true }, document: { querySelector: () => null },
    now: () => ctx.__t, __t: 1.8e12, Bus: { emit() {}, on() {} }, Host: { shared: async (k, v) => v === undefined ? store[k] ?? null : (store[k] = JSON.parse(JSON.stringify(v))) }, Nodes: { load: async () => {}, pips: [], accts: [], list: [], get: () => null, fetchSub: async () => ctx.__resp },
    cleanErr: e => String(e?.message || e), DEFAULT_PIP_SRC: [], DEFAULT_PIP_CC: [], DEFAULT_PIP_V: 0, REGION_NAME: c => c, Vless: { toLink: () => '' }, Chats: new Map() };
  vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.Pool = Pool;', ctx);
  ctx.Pool.usedMap = () => new Map(); return ctx;
}
function loadNodes(fetchText, pageFetch) {
  const src = fs.readFileSync(path.join(__dirname, '../ui/nodes.js'), 'utf8');
  const ctx = { console, URL, AbortController, TextDecoder, TextEncoder, Uint8Array, Buffer, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, now: () => Date.now(), fetch: pageFetch,
    Host: { fetchText }, cleanErr: e => String(e?.message || e), Vless: {}, localStorage: { getItem: () => null, setItem() {} },
    document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) }, window: {} };
  vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.Nodes = Nodes;', ctx); return ctx.Nodes;
}

test('pool refresh: a truncated response does not wipe a complete list', async () => {
  const ctx = loadPool(), { Pool } = ctx;
  const owned = () => Object.values(Pool.d.ips).filter(e => e.src === DE).length;
  await Pool.load(); await Pool.mutate(d => { d.src.push(DE); });
  ctx.__resp = { text: fullDE };
  let r = await Pool.refreshApi(DE, true);
  assert.ok(!r.err, 'full fetch ok');
  assert.equal(owned(), 549); assert.equal(Pool.d.api[DE].best, 549);
  ctx.__t += 3600e3; ctx.__resp = { text: fullDE.split('\n').slice(0, 3).join('\n') + '\n' };
  r = await Pool.refreshApi(DE, true);
  assert.equal(r.partial, true); assert.match(r.err, /不完整/);
  assert.equal(owned(), 549, 'complete list kept');
  ctx.__t += 3600e3; ctx.__resp = { text: fullDE };
  r = await Pool.refreshApi(DE, true);
  assert.ok(!r.err); assert.equal(owned(), 549); assert.equal(Pool.d.api[DE].best, 549);
});

test('android fetchSub: a truncated early tunnel response does not beat the full later one', async () => {
  const trunc = fullDE.split('\n').slice(0, 3).join('\n') + '\n';
  const Nodes = loadNodes(
    (u, o) => o && o.direct ? new Promise(res => setTimeout(() => res({ text: fullDE }), 40)) : Promise.resolve({ text: trunc }),
    () => Promise.reject(new Error('no page network')));
  const r = await Nodes.fetchSub(DE, () => {});
  assert.equal(r.text, fullDE);
});

test('android fetchSub: HTML error page or hung direct request does not block or overwrite valid mirror list', async () => {
  const bigHtml = '<!DOCTYPE html><html><body>' + 'x'.repeat(50000) + '</body></html>';
  const t0 = Date.now();
  const Nodes = loadNodes(
    (u, o) => {
      if (u.includes('ghfast.top')) return Promise.resolve({ text: bigHtml });
      if (u.includes('testingcf.jsdelivr.net')) return new Promise(res => setTimeout(() => res({ text: fullDE }), 30));
      return new Promise(res => setTimeout(() => res({ error: 'timeout' }), 15000).unref());
    },
    () => new Promise((_, rej) => setTimeout(() => rej(new Error('page timeout')), 15000).unref())
  );
  const r = await Nodes.fetchSub(DE, () => {});
  const elapsed = Date.now() - t0;
  assert.equal(r.text, fullDE);
  assert.ok(elapsed < 2000, 'resolved quickly without waiting 15s for hung direct/page requests: ' + elapsed + 'ms');
});
