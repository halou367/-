'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
const code = src.slice(src.indexOf('  const THINK_MIN = 5'), src.indexOf('  const SCORE_W = []'));
function setup(book) {
  const mem = new Map(book ? [['score-book',book]] : []); let t = 1000;
  const c = vm.createContext({ Store: { get: (k, d) => mem.has(k) ? mem.get(k) : d, set: (k, v) => (mem.set(k, JSON.parse(JSON.stringify(v))), true) }, now: () => ++t, Models: { get: () => null }, History: {} });
  vm.runInContext(code + ';this.S={THINK_MIN,thinkSecOf,thought,scoreOf,settle,bookScore,priorOf,isLive};', c);
  return c.S;
}
const live = score => ({ score, think: 12, source: 'measured' }), est = (score, source = 'estimated') => ({ score, source });
test('账本：多次测量取中位数，交错着测不会来回变', () => {
  const S = setup();
  assert.equal(S.settle('a', live(10.4)), 10.4);                 /* 测指纹 */
  assert.equal(S.settle('a', live(20)), 15.2);                   /* 鹈鹕 */
  assert.equal(S.settle('a', live(12)), 12);                     /* 三连测 */
  assert.equal(S.settle('a', est(80, 'estimated')), 12);         /* 校准更早的回复得出的估算：有实测时不参与 */
  assert.equal(S.settle('a', { score: null, think: 0 }), 12);    /* 没思考的一次：不记账，也不擦掉已有的分 */
  assert.equal(S.bookScore('a'), 12);
  assert.equal(S.settle('b', live(50)), 50, 'conversations are independent');
});
test('账本：没有实测时用估算（每个来源只留最新一笔）；之后来了实测就以实测为准', () => {
  const S = setup();
  assert.equal(S.settle('a', est(30, 'pelican-estimated')), 30);
  assert.equal(S.settle('a', est(20, 'pelican-estimated')), 20, 'same source: latest replaces');
  assert.equal(S.settle('a', est(40, 'estimated')), 30, 'two sources → median');
  assert.equal(S.settle('a', live(9)), 9);
  assert.equal(S.settle('a', est(90, 'estimated')), 9);
});
test('账本：旧分 / 标题同步来的分当第一笔；只保留最近 9 笔实测；校准复用的旧分不重复记账', () => {
  const S = setup();
  assert.equal(S.settle('a', live(30), 10), 30, 'unknown prior is fallback; real measurement takes precedence');
  const T = setup();
  for (let i = 0; i < 20; i++) T.settle('a', live(i < 11 ? 90 : 10));
  assert.equal(T.bookScore('a'), 10, 'only the latest 9 live rows remain');
  const U = setup(); assert.equal(U.settle('a', live(40)), 40);
  assert.equal(U.settle('a', { ...est(40), reuse: true }), 40); assert.equal(U.settle('a', { ...est(5), reuse: true }), 40);
  assert.equal(U.settle('a', { score: null }, 77), 40);
  assert.equal(setup().settle('z', { score: null }, 77), 77, 'empty book: prior kept');
  assert.equal(setup().settle('z', { score: 300 }), null, 'out of 0–100 is invalid');
});
test('鹈鹕估算：agent 直接写文件（静默只有 1 秒）用「总耗时 − 出字时间」估算隐藏思考；真实思考不受影响', () => {
  const S = setup();
  /* 43.7 秒，写了约 3000 token 的 html，静默 1.2 秒：约 13.7 秒的隐藏思考 */
  const x = { think: 1.2, rs: 0, rChars: 0, out: 3000, sec: 43.7, derive: 3000 };
  assert.ok(Math.abs(S.thinkSecOf(x) - 13.7) < 1e-9); assert.ok(S.thought(x));
  const sc = S.scoreOf(x); assert.ok(sc > 18 && sc < 22, String(sc));
  assert.equal(S.scoreOf({ ...x, derive: 4200 }), null, '回复很短 / 写得慢 → 估不出思考，不计分');
  assert.equal(S.scoreOf({ think: 20, sec: 43.7, out: 3000, derive: 0 }), 28.3, '真实静默照旧');
  assert.equal(S.isLive({ ...x, live: false }), false); assert.equal(S.isLive({ think: 12 }), true); assert.equal(S.isLive({ rChars: 5 }), true);
});

test('a synced score without provenance never becomes live because the next measurement is live',()=>{
 const S=setup();assert.equal(S.settle('a',live(30),90),30);
 assert.equal(S.settle('a',live(32)),31);
 assert.equal(setup().settle('b',{score:null},90),90);
});

test('non-finite timing and token inputs cannot manufacture a full reasoning score',()=>{
 const S=setup();
 for(const x of [{think:Infinity},{rs:Infinity},{sec:Infinity,out:100},{think:'90'},{rChars:Infinity}])assert.equal(S.scoreOf(x),null);
 assert.equal(S.scoreOf({think:20,rs:Infinity}),28.3);
});

test('legacy prior provenance and malformed stored rows cannot pollute measurements',()=>{
 const S=setup({a:[{s:90,live:true,src:'prior'},{s:30,live:true,src:'measured'},null,{s:'99',live:true},{s:1000,live:true}],b:{s:50}});
 assert.equal(S.bookScore('a'),30);assert.equal(S.bookScore('b'),null);
 assert.equal(S.settle('a',live(32)),31);assert.equal(S.settle('b',live(20)),20);
});
