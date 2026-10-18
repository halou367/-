'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../ui/node-speed.js'), 'utf8');
const code = src.slice(0, src.indexOf('if (typeof module'));
function setup(replies) {
  const calls = [], saved = {};
  const c = vm.createContext({ console, setTimeout, Date, Math, Promise,
    Host: { platform: 'desktop', shared: async (k, v) => { if (v !== undefined) saved[k] = v; return saved[k] || null; }, urlTest: async o => { calls.push(o.items.length); const r = replies.shift(); if (r instanceof Error) throw r; return r; } },
    Vless: { parse: x => x === 'bad' ? null : { k: String(x) }, toLink: x => x.k }, Nodes: { key: p => p.k, list: [] }, Bus: { emit() {} } });
  vm.runInContext(code + ';this.NodeSpeed=NodeSpeed;', c);
  return { S: c.NodeSpeed, calls, saved };
}
const ok = ms => [{ ok: true, ms }], bad = e => [{ ok: false, error: e }];
test('单节点连测 3 次取中位数；偶然失败不算不通；每次只测这一个节点', async () => {
  const h = setup([ok(100), bad('timeout'), ok(80)]);
  const r = await h.S.testOne('vless://a');
  assert.deepEqual(h.calls, [1, 1, 1]); assert.equal(r.ok, true); assert.equal(r.ms, 90); assert.deepEqual([...r.runs], [100, 80]); assert.equal(r.fails, 1);
  const b = h.S.badge('vless://a'); assert.equal(b.text, '90 ms'); assert.match(b.title, /连测 3 次：100 \/ 80 ms，失败 1 次（取中位数）/);
  assert.ok(h.saved.nodedelay.res['vless://a'], 'written to the shared result');
});
test('三次成功取中间值；三次全败才算不通', async () => {
  const h = setup([ok(300), ok(90), ok(100), bad('a'), bad('b'), bad('c')]);
  assert.equal((await h.S.testOne('n1')).ms, 100);
  const r = await h.S.testOne('n2'); assert.equal(r.ok, false); assert.equal(r.err, 'a'); assert.equal(h.S.badge('n2').cls, 'd-fail');
});
test('测速中显示「测速中」，并且同一节点不会重复发起', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const h = setup([]); const orig = h.S; let n = 0;
  const c = vm.createContext({ console, setTimeout, Date, Math, Promise, Host: { platform: 'desktop', shared: async () => null, urlTest: async () => { n++; await gate; return ok(50); } }, Vless: { parse: x => ({ k: x }), toLink: x => x.k }, Nodes: { key: p => p.k, list: [] }, Bus: { emit() {} } });
  vm.runInContext(code + ';this.NodeSpeed=NodeSpeed;', c);
  const S = c.NodeSpeed, p = S.testOne('x');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(S.badge('x').text, '测速中'); assert.equal(S.probingNow('x'), true); assert.equal(await S.testOne('x'), null);
  release(); await p; assert.equal(n, 3); assert.equal(S.badge('x').text, '50 ms'); assert.equal(S.probingNow('x'), false);
});
test('节点列表每行有「测」按钮，点击只测这个节点且不选中它', () => {
  const r = fs.readFileSync(path.join(__dirname, '../ui/node-routes.js'), 'utf8');
  assert.match(r, /class:'np-one'[^\n]*e\.stopPropagation\(\);void S\.testOne\(x\)/);
});
