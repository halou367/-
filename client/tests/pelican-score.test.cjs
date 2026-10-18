'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const sSrc = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
const ledger = sSrc.slice(sSrc.indexOf('  const THINK_MIN = 5'), sSrc.indexOf('  const SCORE_W = []'));
const pSrc = fs.readFileSync(path.join(__dirname, '../ui/pelican-test.js'), 'utf8');
function setup(scenario, models = {}, opts = {}) {
  const mem = new Map(), toasts = [], shots = []; let t = 1000, step = 0, stopped = 0;
  const M = new Map(Object.entries(models));
  const c = vm.createContext({ console, AbortController, Store: { get: (k, d) => mem.has(k) ? mem.get(k) : d, set: (k, v) => (mem.set(k, JSON.parse(JSON.stringify(v))), true) }, now: () => ++t,
    toast: (m, ty) => toasts.push({ m, ty }), describe: e => e.message, sleep: async () => { step++; scenario(chat, step); },
    GachaPrompts: { svg: () => 'pelican svg' }, Bus: { emit() {} }, History: {}, PelicanShots: { auto: async sid => { shots.push({ sid, busy: chat.busy }); return opts.noFile ? { none: '这一轮没有写出 html / svg 文件，没有可存的图' } : { rec: { model: 'fable-5.1' } }; } },
    Fmt: { est: f => ({ think: f.think / 1000, out: f.vis, sec: (f.tEnd - f.t0) / 1000, score: null }) },
    Models: { get: sid => M.get(sid) || null, set: (sid, v) => M.set(sid, v) } });
  const chat = { sid: 's1', busy: false, queue: [], emit() {}, fmt: { old: true }, send: async () => { chat.busy = true; scenario(chat, 0); }, stop: async () => { stopped++; chat.busy = false; } };
  vm.runInContext(sSrc.slice(sSrc.indexOf('  const THINK_MIN = 5'), sSrc.indexOf('  const SCORE_W = []')) + ';this.Strength={THINK_MIN,thinkSecOf,thought,scoreOf,settle,bookScore,priorOf,isLive,fmtScore:v=>v==null?"—":v.toFixed(1),canon:x=>x,addSample(){}};', c);
  vm.runInContext(pSrc + ';this.PelicanTest=PelicanTest;', c);
  return { c, chat, M, toasts, shots, stopped: () => stopped };
}
const base = { t0: 0, tEnd: 0, think: 0, tools: 0, tN: 0, done: false, vis: 0, rChars: 0 };
test('agent 直接写文件、没有思考静默：等回复写完，用回复时间和内容估算（标估算）', async () => {
  const h = setup((chat, n) => {
    if (n === 0) chat.fmt = { ...base, think: 1200, tools: 1, vis: 3000, tEnd: 20000 };
    if (n === 2) { chat.fmt.done = true; chat.fmt.tEnd = 43700; chat.busy = false; }
  }, { s1: { name: 'fable-5.1', at: 1 } });
  const r = await h.c.PelicanTest.start(h.chat);
  assert.equal(h.stopped(), 0, 'not stopped at the first output');
  assert.ok(r.score > 19 && r.score < 22, String(r.score));
  const pr = h.c.PelicanTest.result('s1'); assert.equal(pr.estimated, true); assert.equal(pr.score, r.score);
  assert.equal(h.M.get('s1').est.score, r.score);
  assert.ok(h.toasts.some(x => /估算/.test(x.m)));
  assert.deepEqual(h.shots.map(x => x.sid), ['s1'], 'the finished page is saved as the test image'); assert.equal(h.shots[0].busy, false, 'only after the reply finished');
  assert.ok(h.toasts.at(-1).m.includes('已自动保存'));
});
test('有真实思考：第一段输出就记下分数；然后等页面写完自动存图（不再提前停掉）', async () => {
  const h = setup((chat, n) => { if (n === 0) chat.fmt = { ...base, think: 12000, tN: 1, vis: 50, tEnd: 13000 }; if (n === 6) { chat.fmt.done = true; chat.busy = false; } }, { s1: { name: 'opus-5.5', at: 1 } });
  const r = await h.c.PelicanTest.start(h.chat);
  assert.equal(h.stopped(), 0, 'generation is allowed to finish so the page can be saved'); assert.equal(r.score, 18.1); assert.equal(h.c.PelicanTest.result('s1').estimated, false);
  assert.equal(r.shot, true); assert.equal(h.shots.length, 1); assert.equal(h.shots[0].busy, false);
});
test('模型没有写出页面：分数照记，只提示没有图可存', async () => {
  const h = setup((chat, n) => { if (n === 0) chat.fmt = { ...base, think: 12000, tN: 1, vis: 50, tEnd: 13000, done: true }; if (n === 0) chat.busy = false; }, { s1: { name: 'opus-5.5', at: 1 } }, { noFile: true });
  const r = await h.c.PelicanTest.start(h.chat);
  assert.equal(r.score, 18.1); assert.equal(r.shot, false); assert.match(h.toasts.at(-1).m, /没有写出 html/);
});
test('等页面写完时用户点停止：分数已经记下，停掉生成，不存图', async () => {
  let ctl; const h = setup((chat, n) => { if (n === 0) chat.fmt = { ...base, think: 12000, tN: 1, vis: 50, tEnd: 13000 }; }, { s1: { name: 'opus-5.5', at: 1 } });
  const p = h.c.PelicanTest.start(h.chat); await new Promise(r => setTimeout(r, 0)); h.c.PelicanTest.start(h.chat);   /* 再点一次 = 停止 */
  const r = await p;
  assert.equal(h.stopped(), 1); assert.equal(h.shots.length, 0); assert.equal(h.c.PelicanTest.result('s1').score, 18.1);
});
test('已有指纹推理分：鹈鹕估算并入账本，指纹那条的显示分同步成同一个数，下一次测指纹再覆盖也不会跳', async () => {
  const fp = { reasoning: { score: 10.4 }, result: {} };
  const h = setup((chat, n) => { if (n === 0) chat.fmt = { ...base, think: 1200, tools: 1, vis: 3000, tEnd: 43700, done: true }; if (n === 0) chat.busy = false; }, { s1: { name: 'fable-5.1', at: 1, fingerprint: fp } });
  const r = await h.c.PelicanTest.start(h.chat);
  assert.equal(h.M.get('s1').fingerprint.reasoning.score, r.score);
  assert.ok(r.score > 14 && r.score < 17, String(r.score));        /* 10.4（原有）与 20.3（估算）的中位数 */
  assert.equal(h.c.Strength.settle('s1', { score: null, think: 0 }), r.score, '没思考的测指纹不会把分清掉');
});
