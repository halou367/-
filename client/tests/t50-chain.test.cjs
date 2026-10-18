// T50: chained-proxy exits (sstp / socks5 / http(s) / turn via edgetunnel 2.1+) in the ProxyIP pool
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
function fakeEl() { const el = { children: [], classList: { add() {} }, textContent: '', disabled: false, append(...k) { el.children.push(...k); }, replaceChildren(...k) { el.children = k; }, remove() { el.removed = true; } }; return el; }
function setup(ips, accounts, risk) {
  let clock = 1.8e12, data = { v: 1, ips, src: [] };
  const clone = x => JSON.parse(JSON.stringify(x)), body = fakeEl();
  const c = vm.createContext({
    console, setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 5)), clearTimeout, now: () => clock, sleep: async ms => { clock += ms; }, cleanErr: e => e.message, regionLabel: x => x, ccF: x => x, REGION_NAME: x => x,
    h: () => fakeEl(), document: { body, querySelector: () => null }, toast() {}, isVless: p => /^vless:/.test(p || ''),
    UI: { host: { account: null } }, Bus: { emit() {}, on() { return () => {}; } }, Chats: new Map(), Store: { get: (k, d) => d, set() {} },
    Nodes: { accts: clone(accounts), refreshAccts: async () => {}, list: [] }, RouteState: require('../ui/route-state'),
    Host: {
      shared: async (k, v) => { if (v) data = clone(v); return clone(data); },
      fetchText: async (url, o) => { 
        if (url.includes('ip-api')) return { text: JSON.stringify(JSON.parse(o.body).map(q => ({ status: 'success', query: q, isp: 'x' }))) };
        const j = { status: 'ok' }; for (const ip of o.body.slice(4).split(',')) j[ip] = { risk: risk(ip), type: 'Business' }; return { text: JSON.stringify(j) };
      },
    },
  });
  const src = fs.readFileSync(path.join(root, 'ui/pool.js'), 'utf8');
  vm.runInContext(src.slice(src.indexOf('const Pool ='), src.indexOf('// 节点在编辑器里改了')) + ';this.P=Pool;', c);
  const ir = fs.readFileSync(path.join(root, 'ui/iprep.js'), 'utf8');
  vm.runInContext(ir.slice(0, ir.indexOf('// 后台：启动 1 分钟后')) + ';this.I=IPRep;this.SP=ScreenPop;', c);
  c.P.d = { ...c.P.blank?.() || {}, ...clone(data) };
  return { c, P: c.P, I: c.I, data: () => data, tick: ms => { clock += ms; } };
}

const V = require('../ui/vless.js');
test('chain exits are written as an edgetunnel global chain path, replacing /proxyip= and /video/', () => {
  assert.equal(V.withProxyIp('/?ed=2560', 'sstp://vpn:vpn@public-vpn-90.opengw.net:443'), '/sstp://vpn:vpn@public-vpn-90.opengw.net:443?ed=2560');
  assert.equal(V.withProxyIp('/proxyip=1.2.3.4?ed=2560&proxyip=x', 'sstp://vpn:vpn@h.net:443'), '/sstp://vpn:vpn@h.net:443?ed=2560');
  assert.equal(V.withProxyIp('/video/ABC', 'socks5://u:p@1.2.3.4:1080'), '/socks5://u:p@1.2.3.4:1080');
  assert.equal(V.withProxyIp('/', '1.2.3.4'), '/proxyip=1.2.3.4');
  assert.equal(V.proxyIpOf('/sstp://vpn:vpn@h.net:443?ed=1'), 'sstp://vpn:vpn@h.net:443');
});
test('chain exits pass validation everywhere; injection attempts do not', () => {
  const drafts = fs.readFileSync(path.join(root, 'src/route-drafts.js'), 'utf8'), main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.ok(!/\[\\w\.:\\\[\\\]-\]\{3,120\}\$\//.test(drafts)); assert.ok(!/\/\^\[\\w\.:\\\[\\\]-\]\{3,120\}\$\//.test(main));
  for (const ok of ['1.2.3.4', 'proxyip.x.net:443', 'sstp://vpn:vpn@public-vpn-90.opengw.net:443', 'socks5://u:p@1.2.3.4:1080', 'https://h.example:443', 'turn://u:p@t.example:3478']) assert.ok(V.PIP_RE.test(ok), ok);
  for (const bad of ['sstp://a@b/../x', 'http://x y', 'sstp://u:p@h.net:443/proxyip=1.1.1.1', 'ftp://h.net', 'sstp://a?b@h.net']) assert.ok(!V.PIP_RE.test(bad), bad);
});
test('pool import keeps chain lines whole and probes them directly instead of resolving DNS', async () => {
  const { P, c } = setup({}, [], () => 0);
  let resolved = 0; P.resolve = async () => { resolved++; return ['9.9.9.9']; };
  const p = P.parse('sstp://vpn:vpn@public-vpn-90.opengw.net:443');
  assert.equal(p.chain, 'sstp'); assert.equal(p.host, 'public-vpn-90.opengw.net'); assert.equal(p.line, 'sstp://vpn:vpn@public-vpn-90.opengw.net:443');
  const r = await P.importText('sstp://vpn:vpn@public-vpn-90.opengw.net:443\nsstp://vpn:vpn@public-vpn-152.opengw.net:443\n1.2.3.4');
  assert.equal(resolved, 0); assert.deepEqual([...r.doms], []); assert.equal(r.bad.length, 0);
  assert.deepEqual([...r.todo].sort(), ['1.2.3.4', 'sstp://vpn:vpn@public-vpn-152.opengw.net:443', 'sstp://vpn:vpn@public-vpn-90.opengw.net:443']);
  assert.equal(P.d.ips['sstp://vpn:vpn@public-vpn-90.opengw.net:443'].chain, 'sstp');
  assert.deepEqual([...P.domains()], []); assert.equal(P.isDom('sstp://vpn:vpn@h.net:443'), false); assert.equal(P.isDom('proxyip.x.net'), true);
});
