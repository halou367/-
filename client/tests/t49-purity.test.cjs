// T49: IPPure purity fallback (via the tunnel), immediate zero-tolerance deletion, manual-IP vetting
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

test('an IPPure score alone rates an IP; fraudScore >= 50 is high risk', () => {
  const { P, I } = setup({ '2.2.2.2': { ok: true, loc: 'JP', eg: '8.8.1.1' }, '3.3.3.3': { ok: true, loc: 'JP', eg: '8.8.1.2' } }, [], () => 0);
  assert.equal(I.score('2.2.2.2').known, false);
  P.d.rep = {}; I.putPu(P.d, '8.8.1.1', { fs: 12, res: true }); I.putPu(P.d, '8.8.1.2', { fs: 55 }); I._d = null;
  const a = I.score('2.2.2.2'), b = I.score('3.3.3.3');
  assert.equal(a.known, true); assert.equal(a.tier, 'good'); assert.ok(a.why.some(x => /IPPure/.test(x)));
  assert.equal(b.known, true); assert.equal(b.s, 44); assert.equal(I.risky('3.3.3.3'), true);
});
test('IPPure results for a different exit than Brana saw are ignored', () => {
  const { P, I } = setup({}, [], () => 0);
  P.d.rep = {}; I.putPu(P.d, '8.8.1.1', { fs: 90, ip: '8.8.9.9' });
  assert.equal(P.d.rep['8.8.1.1'], undefined);
});
test('a probe result carrying a high IPPure score deletes the imported IP immediately', async () => {
  const { P, I, data } = setup({ '2.2.2.2': { ip: '2.2.2.2', src: '' }, '4.4.4.4': { ip: '4.4.4.4', src: '' } }, [], () => 0);
  data().src = ['2.2.2.2', '4.4.4.4']; P.d.src = ['2.2.2.2', '4.4.4.4'];
  await P.mutate(d => { P.apply(d, '2.2.2.2', { ip: '8.8.1.1', loc: 'JP', brana: true, ms: 50, pure: { fs: 80, ip: '8.8.1.1' } }); P.apply(d, '4.4.4.4', { ip: '8.8.1.4', loc: 'JP', brana: true, ms: 50, pure: { fs: 5 } }); });
  await new Promise(r => setTimeout(r, 30)); await I.flushSoon();
  assert.equal(data().ips['2.2.2.2'], undefined, 'high-risk import removed');
  assert.ok(!data().src.includes('2.2.2.2'));
  assert.ok(data().ips['4.4.4.4'], 'clean import kept');
});
test('a manually chosen risky ProxyIP is rated, banned and deleted, and refused', async () => {
  const { P, I, data } = setup({ '5.5.5.5': { ok: true, loc: 'JP', src: '' }, '6.6.6.6': { ok: true, loc: 'JP', src: '' } }, [], ip => ip === '5.5.5.5' ? 95 : 5);
  data().src = ['5.5.5.5', '6.6.6.6']; P.d.src = ['5.5.5.5', '6.6.6.6'];
  const v = await I.vet('5.5.5.5', '5.5.5.5');
  assert.equal(v.ok, false); assert.match(v.error, /高风险/);
  assert.equal(data().ips['5.5.5.5'], undefined); assert.ok(data().ban['5.5.5.5']);
  const ok = await I.vet('6.6.6.6', '6.6.6.6');
  assert.equal(ok.ok, true); assert.equal(ok.known, true);
});
test('only rated-pure IPs are selectable: unrated and 一般 IPs never appear in avail', () => {
  const { P, I } = setup({ '2.2.2.2': { ok: true, loc: 'JP', eg: '8.8.1.1' }, '3.3.3.3': { ok: true, loc: 'JP', eg: '8.8.1.2' }, '4.4.4.4': { ok: true, loc: 'JP', eg: '8.8.1.3' } }, [], () => 0);
  P.d.rep = {}; I.putPu(P.d, '8.8.1.1', { fs: 8 }); I.putPu(P.d, '8.8.1.2', { fs: 46 }); I._d = null;
  assert.equal(P.state('2.2.2.2', P.d.ips['2.2.2.2']), 'ok');
  assert.equal(P.state('3.3.3.3', P.d.ips['3.3.3.3']), 'mid');
  assert.equal(P.state('4.4.4.4', P.d.ips['4.4.4.4']), 'rate');
  assert.deepEqual([...P.avail('JP', 'self')], ['2.2.2.2']);
});
test('a manually chosen 一般 (not pure) IP is refused but not deleted', async () => {
  const { P, I, data } = setup({ '5.5.5.5': { ok: true, loc: 'JP', src: '' } }, [], () => 70);
  const v = await I.vet('5.5.5.5', '5.5.5.5');
  assert.equal(v.ok, false); assert.match(v.error, /一般/);
  assert.ok(data().ips['5.5.5.5']);
});
test('screening rates unrated IPs and returns only pure ones', async () => {
  const { P, I } = setup({ '2.2.2.2': { ok: true, loc: 'JP', src: 'd' }, '6.6.6.6': { ok: true, loc: 'JP', src: 'd' }, '7.7.7.7': { ok: true, loc: 'JP', src: 'd' } }, [], ip => ip === '6.6.6.6' ? 5 : ip === '7.7.7.7' ? 70 : 95);
  P.fill = async () => 0; P.heal = async () => {};
  const r = await I.screen('JP', { exceptId: 'self' });
  assert.equal(r.ok, true); assert.deepEqual([...r.keys], ['6.6.6.6']);
});
test('a latency probe that returns ip-api data rates the IP on the spot even when IPPure fails', async () => {
  const { P, I } = setup({ '2.2.2.2': { ip: '2.2.2.2', src: '' }, '3.3.3.3': { ip: '3.3.3.3', src: '' } }, [], () => 0);
  await P.mutate(d => {
    P.apply(d, '2.2.2.2', { ip: '8.8.2.1', loc: 'JP', brana: true, ms: 40, ipa: { ip: '8.8.2.1', h: false, px: false, m: false, isp: 'NTT' } });
    P.apply(d, '3.3.3.3', { ip: '8.8.2.2', loc: 'JP', brana: true, ms: 40, ipa: { ip: '9.9.9.9', h: false, px: false } });
  });
  I._d = null;
  assert.equal(I.score('2.2.2.2').known, true); assert.equal(P.state('2.2.2.2', P.d.ips['2.2.2.2']), 'ok');
  assert.equal(I.score('3.3.3.3').known, false, 'ip-api answer for a different exit is ignored');
});
