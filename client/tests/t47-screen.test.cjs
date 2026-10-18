// T47: occupancy (same IP on another port / same exit IP), auto ban+delete of high-risk IPs, screening until a clean IP appears
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
test('an IP is occupied when another account uses it on another port or shares its exit IP', () => {
  const { P } = setup({ '2.2.2.2:443': { ok: true, loc: 'JP' }, '3.3.3.3': { ok: true, loc: 'JP', eg: '9.9.9.9' }, '5.5.5.5': { ok: true, loc: 'JP' } }, [{ id: 'o', proxyIp: '2.2.2.2:8443' }, { id: 'p', proxyIp: '7.7.7.7' }], () => 0);
  P.d.ips['7.7.7.7'] = { ok: true, loc: 'JP', eg: '9.9.9.9' };
  assert.equal(P.owner('2.2.2.2:443', 'self')?.id, 'o');
  assert.equal(P.owner('3.3.3.3', 'self')?.id, 'p');
  assert.equal(P.owner('5.5.5.5', 'self'), null);
  assert.equal(P.owner('2.2.2.2:443', 'o'), null);
});
test('high-risk IPs are deleted, and in-use high-risk IPs are banned', async () => {
  const { P, I, data } = setup({ '2.2.2.2': { ok: true, loc: 'JP', src: 'd.example' }, '3.3.3.3': { ok: true, loc: 'JP' }, '4.4.4.4': { ok: true, loc: 'JP' } }, [{ id: 'o', proxyIp: '3.3.3.3' }], ip => ip === '4.4.4.4' ? 10 : 99);
  data().src = ['3.3.3.3', '4.4.4.4']; P.d.src = ['3.3.3.3', '4.4.4.4'];
  const r = await I.rate(['2.2.2.2', '3.3.3.3', '4.4.4.4']);
  assert.equal(r.removed, 1); assert.equal(r.banned, 1);
  assert.equal(P.d.ips['2.2.2.2'], undefined); assert.ok(P.d.drop['2.2.2.2']);
  assert.ok(P.d.ips['3.3.3.3'] && P.banned('3.3.3.3'));
  assert.ok(P.d.ips['4.4.4.4'] && !P.banned('4.4.4.4'));
  assert.deepEqual([...P.avail('JP', 'self')], ['4.4.4.4']);
});
test('screening keeps going until a non-high-risk IP appears, never returning a risky one', async () => {
  const { P, I } = setup({ '2.2.2.2': { ok: true, loc: 'JP', src: 'd.example' } }, [], ip => ip === '6.6.6.6' ? 5 : 95);
  let fills = 0;
  P.fill = async () => { fills++; if (fills < 2) return 0; await P.mutate(d => { d.ips['6.6.6.6'] = { ok: true, loc: 'JP', src: 'd.example' }; }); return 1; };
  P.heal = async () => {};
  const r = await I.screen('JP', { exceptId: 'self' });
  assert.equal(r.ok, true); assert.deepEqual([...r.keys], ['6.6.6.6']);
  assert.equal(P.d.ips['2.2.2.2'], undefined); assert.equal(fills, 2);
});
test('screening can be cancelled from the popup', async () => {
  const { P, I, c } = setup({}, [], () => 0);
  P.fill = async () => 0; P.heal = async () => {};
  const orig = c.SP.open; let pop; c.SP.open = (...a) => (pop = orig.apply(c.SP, a));
  const run = I.screen('JP'); await new Promise(r => setTimeout(r, 20)); pop.cancelled = true; pop.wake?.();
  const r = await run; assert.equal(r.cancelled, true); assert.equal(r.ok, false);
});
