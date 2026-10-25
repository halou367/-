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
test('Direct IP entry & CSV API import: unbans previously banned/failed IPs, parses generic result.csv rows, and allows re-probing failed IPs', async () => {
  const ctx = load();
  const { Pool } = ctx;
  await Pool.load();
  await Pool.mutate(d => {
    d.ban = { '1.2.3.4:443': 100, '1.2.3.4': 100 };
    d.drop = { '1.2.3.4:443': 100, '1.2.3.4': 100 };
    d.banEg = { '1.2.3.4': 100 };
    d.ips['5.6.7.8:8443'] = { ip: '5.6.7.8', port: '8443', src: '', ok: false, err: '超时', fc: 2 };
  });
  const imp = await Pool.importText('1.2.3.4:443#US 优选节点\n5.6.7.8 8443\n130.61.129.162,4,4,0.00,152.34,12.56,US\n');
  assert.equal(imp.bad.length, 0);
  assert.deepEqual([...imp.todo].sort(), ['1.2.3.4:443', '130.61.129.162', '5.6.7.8:8443']);
  assert.equal(Pool.banned('1.2.3.4:443'), false);
  assert.equal(Pool.d.ips['5.6.7.8:8443'].ok, undefined);

  const csvItems = Pool.apiItems('IP地址,已发送,已接收,丢包率,平均延迟,下载速度,地区\n130.61.129.162,4,4,0.00,152.34,12.56,US\n45.131.71.168,2053,DE\n');
  assert.deepEqual([...csvItems].map(p => [p.line, p.loc || '']), [['130.61.129.162', 'US'], ['45.131.71.168:2053', 'DE']]);
});

test('country_proxies large single-country list (>240 lines) is not truncated to 16, keeps up to 2 ports per IP (preferring :443), and refreshApi(force=true) recovers dropped/banned exits', async () => {
  const ctx = load();
  const { Pool } = ctx;
  const U = 'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/DE.txt';
  await Pool.load();
  await Pool.mutate(d => {
    d.src.push(U);
    d.ips['45.68.1.10'] = { ip: '45.68.1.10', port: '', src: U, loc: 'DE', ok: false, err: 'connection closed' };
    (d.ban ||= {})['45.68.1.10'] = '高风险';
    (d.drop ||= {})['45.68.1.10:443'] = 100;
  });
  const lines = [];
  for (let i = 1; i <= 120; i++) {
    lines.push(`45.68.${i}.10 8443`);
    lines.push(`45.68.${i}.10 443`);
    lines.push(`45.68.${i}.10 2053`);
  }
  ctx.__resp = { text: lines.join('\n') };
  const r = await Pool.refreshApi(U, true);
  assert.equal(r.total, 240, '120 unique IPs * 2 ports per IP = 240 items (not truncated to 16)');
  assert.ok(Pool.d.ips['45.68.1.10:443'] && !Pool.d.ips['45.68.1.10:443'].gone, ':443 port kept and not deleted by old failed portless entry');
  assert.ok(Pool.d.ips['45.68.1.10:8443'] && !Pool.d.ips['45.68.1.10:8443'].gone, 'second port :8443 kept');
  assert.equal(Pool.banned('45.68.1.10:443'), false, 'force=true clears prior ban/drop on refreshed API exits');
});
