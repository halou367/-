// API 来源（例：https://sub.cmliussss.net/vpngate?token=…）：识别为 API、内容逐行解析成出口、更新时增删
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
function load() {
  const src = fs.readFileSync(path.join(__dirname, '../ui/pool.js'), 'utf8');
  const store = {}, ctx = { console, URL, atob: s => Buffer.from(s, 'base64').toString('binary'), escape, decodeURIComponent, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, addEventListener() {}, navigator: { onLine: true }, document: { querySelector: () => null },
    now: () => ctx.__t, __t: 1.8e12, Bus: { emit() {}, on() {} }, Host: { shared: async (k, v) => v === undefined ? store[k] ?? null : (store[k] = JSON.parse(JSON.stringify(v))) }, Nodes: { load: async () => {}, pips: [], accts: [], list: [], get: () => null, fetchSub: async () => ctx.__resp },
    cleanErr: e => String(e?.message || e), DEFAULT_PIP_SRC: [], DEFAULT_PIP_CC: [], DEFAULT_PIP_V: 0, REGION_NAME: c => c, Vless: { toLink: () => '' }, Chats: new Map() };
  vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.Pool = Pool;', ctx);
  ctx.Pool.usedMap = () => new Map(); return ctx;
}
test('API URLs parse as API sources; chain proxies / domains unchanged', () => {
  const { Pool } = load();
  const a = Pool.parse('https://sub.cmliussss.net/vpngate?token=20260924233538');
  assert.ok(a.api && a.line === 'https://sub.cmliussss.net/vpngate?token=20260924233538' && !a.ip && !a.chain);
  assert.ok(Pool.isApi(a.line) && Pool.isSrc(a.line) && !Pool.isDom(a.line));
  assert.equal(Pool.parse('https://user:pw@proxy.example.com:8443').chain, 'https');
  assert.equal(Pool.parse('sstp://vpn:vpn@public-vpn-189.opengw.net:443').chain, 'sstp');
  assert.ok(!Pool.parse('ProxyIP.JP.CMLiussss.net').api && Pool.isDom('ProxyIP.JP.CMLiussss.net'));
  assert.ok(!Pool.parse('https://example.com/').api, 'bare origin is not an API');
  assert.equal(Pool.apiName(a.line), 'sub.cmliussss.net/vpngate?…');
});
test('apiItems: plain lines, #comments, base64 subscriptions, JSON', () => {
  const { Pool } = load();
  const plain = 'sstp://vpn:vpn@public-vpn-189.opengw.net:443\nsstp://vpn:vpn@vpn815715390.opengw.net:1248\n1.2.3.4:443#JP 东京\njunk line\n';
  assert.deepEqual([...Pool.apiItems(plain).map(p => p.line)], ['sstp://vpn:vpn@public-vpn-189.opengw.net:443', 'sstp://vpn:vpn@vpn815715390.opengw.net:1248', '1.2.3.4:443']);
  assert.equal(Pool.apiItems(Buffer.from(plain).toString('base64')).length, 3);
  assert.deepEqual([...Pool.apiItems(JSON.stringify({ list: ['socks5://a:b@h.example.com:1080', '5.6.7.8'] })).map(p => p.line)], ['socks5://a:b@h.example.com:1080', '5.6.7.8']);
});
test('refreshApi adds new exits, removes vanished ones, keeps everything on fetch failure', async () => {
  const ctx = load(), { Pool } = ctx, U = 'https://sub.cmliussss.net/vpngate?token=x';
  await Pool.load(); await Pool.mutate(d => { d.src.push(U); });
  ctx.__resp = { text: 'sstp://vpn:vpn@a.opengw.net:443\nsstp://vpn:vpn@b.opengw.net:443\n' };
  let r = await Pool.refreshApi(U, true);
  assert.deepEqual([...r.added].sort(), ['sstp://vpn:vpn@a.opengw.net:443', 'sstp://vpn:vpn@b.opengw.net:443']);
  assert.equal(Pool.d.ips['sstp://vpn:vpn@a.opengw.net:443'].chain, 'sstp'); assert.equal(Pool.d.ips['sstp://vpn:vpn@a.opengw.net:443'].src, U);
  ctx.__t += 3600e3; ctx.__resp = { text: 'sstp://vpn:vpn@b.opengw.net:443\nsstp://vpn:vpn@c.opengw.net:1600\n' };
  r = await Pool.refreshApi(U);
  assert.deepEqual([...r.added], ['sstp://vpn:vpn@c.opengw.net:1600']); assert.equal(r.removed, 1);
  assert.ok(!Pool.d.ips['sstp://vpn:vpn@a.opengw.net:443'] && Pool.d.ips['sstp://vpn:vpn@c.opengw.net:1600']);
  ctx.__t += 3600e3; ctx.__resp = { error: '无法获取订阅：超时' };
  r = await Pool.refreshApi(U, true);
  assert.ok(r.err && Object.keys(Pool.d.ips).length === 2, 'failure keeps current exits'); assert.match(Pool.d.api[U].err, /超时/);
  ctx.__resp = { text: '<html>nothing</html>' }; r = await Pool.refreshApi(U, true);
  assert.ok(r.err && Object.keys(Pool.d.ips).length === 2, 'empty content keeps current exits');
  await Pool.removeSrc(U); assert.equal(Object.keys(Pool.d.ips).length, 0); assert.ok(!Pool.d.api[U]);
});
test('EdgeTunnel space-separated country_proxies and 02_proxies.csv rows parse with port and region hint', () => {
  const ctx = load();
  ctx.REGION_NAME = c => ({ JP: '日本', HK: '香港', US: '美国' }[c] || c);
  const { Pool } = ctx;
  const items = Pool.apiItems('45.85.119.83 8443\n8.221.140.181,2053,true,HKG,HK,Hong Kong,45102,425\n');
  assert.deepEqual([...items].map(p => [p.line, p.loc || '']), [['45.85.119.83:8443', ''], ['8.221.140.181:2053', 'HK']]);
  assert.equal(Pool.sourceRegionHint('nrt.proxyip.cmliussss.net'), 'JP');
  assert.equal(Pool.sourceRegionHint('https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/US.txt'), 'US');
});

