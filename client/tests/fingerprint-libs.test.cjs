const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gpt-6-astra-three.json'), 'utf8'));
function setup(saved = new Map()) {
  const context = vm.createContext({ console, Store: { get: (k, d) => saved.has(k) ? saved.get(k) : d, set: (k, v) => (saved.set(k, v), true), del: k => saved.delete(k) }, Bus: { emit() {} },
    ProbeBankCache: { load: async () => ({ bank: context.ProbeLib.seedBank || context.ProbeLib.bank }) } });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/probe-vendor.js'), 'utf8') + ';this.ProbeLib=ProbeLib;', context);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/probe-bank-ikale.js'), 'utf8') + ';this.IkaleBank=IkaleBank;', context);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/fp-libs.js'), 'utf8') + ';this.FPLibs=FPLibs;', context);
  return context;
}
const outputs = P => fixture.slice(0, 3).map((x, i) => ({ text: x.text, challenge_id: P[i].id, expected_count: P[i].expected_count }));

test('bundled lm.ikale.io bank is a valid compact robust bank', () => {
  const c = setup();
  assert.equal(c.ProbeLib.validateBank(c.IkaleBank), c.IkaleBank);
  assert.ok(c.IkaleBank.models.length >= 50);
  assert.ok(c.IkaleBank.models.every(m => !('frequency_references' in m)));
  assert.ok(fs.statSync(path.join(root, 'ui/probe-bank-ikale.js')).size < 700000);
});

test('all enabled libraries run; strongest match wins and records its source library', async () => {
  const c = setup(), P = c.ProbeLib.PROBES;
  const loaded = { bank: c.ProbeLib.seedBank || c.ProbeLib.bank };
  const r = await c.FPLibs.inspect(outputs(P), loaded);
  assert.ok(r.result.nearest.id);
  assert.ok(['WhatsMyLLM', 'lm.ikale.io'].includes(r.result.library));
  assert.equal(r.result.libraries.length, 2);
  const rank = { clear: 3, close: 2, weak: 1 }, s = x => (rank[x.status] || 0) * 10 + (x.p || 0);
  assert.equal(Math.max(...r.result.libraries.map(s)), s(r.result.libraries.find(x => x.lib === r.result.library)));
  c.FPLibs.toggle('ikale', false);
  const only = await c.FPLibs.inspect(outputs(P), loaded);
  assert.equal(only.result.library, 'WhatsMyLLM'); assert.equal(only.result.libraries.length, 1);
});

test('custom library import compacts, validates, toggles and removes', async () => {
  const saved = new Map(), c = setup(saved);
  const full = JSON.parse(JSON.stringify(c.IkaleBank)); full.models.forEach(m => { m.frequency_references = [[1, 2, 3]]; });
  const lib = await c.FPLibs.addText(JSON.stringify(full), 'mine.json');
  assert.equal(lib.name, 'mine'); assert.equal(lib.models, full.models.length); assert.equal(lib.enabled, true);
  assert.ok(!saved.get('fingerprint:libdata:' + lib.id).includes('frequency_references'));
  await assert.rejects(c.FPLibs.addText('{"schema":"x"}', 'bad.json'), /清单无效|格式无效/);
  assert.throws(() => c.FPLibs.remove('ikale'), /只能停用/);
  c.FPLibs.remove(lib.id);
  assert.equal(c.FPLibs.list().some(x => x.id === lib.id), false); assert.equal(saved.has('fingerprint:libdata:' + lib.id), false);
});

test('库之间不一致：按各库平均概率取最大者，降为「接近」并说明各库结果；一致时不变', async () => {
  const W = { name: 'W' }, K = { name: 'K' };
  const cand = (id, probability) => ({ id, probability, family: id.split('-')[0] });
  let A, B;
  const make = (cands, status = 'clear') => ({ prepared: { usable: [1] }, result: { status, nearest: cands[0], candidates: cands, signals: { fit: .5, separation: .2, relative_probability: cands[0].probability }, used_outputs: 1 } });
  const ctx = vm.createContext({ console, Store: { get: (k, d) => d, set: () => true, del() {} }, Bus: { emit() {} }, IkaleBank: K,
    ProbeLib: { validateBank() {}, inspectAndIdentify: (o, bank) => bank === K ? make(B(), B.status) : make(A(), A.status) } });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/fp-libs.js'), 'utf8') + ';this.FPLibs=FPLibs;', ctx);
  const loaded = { bank: W };
  A = () => [cand('muse', .6), cand('gemini', .4)];
  B = () => [cand('gemini', .9), cand('muse', .1)];
  let r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.nearest.id, 'gemini'); assert.equal(r.result.status, 'close'); assert.equal(r.result.reason, 'library_disagree');
  assert.ok(Math.abs(r.result.signals.relative_probability - .65) < 1e-9);
  assert.equal(r.result.disagree.length, 2);
  A = () => [cand('gemini', .95)]; B = () => [cand('gemini', .8)];
  r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.nearest.id, 'gemini'); assert.equal(r.result.status, 'clear'); assert.equal(r.result.disagree, undefined);
  // 写法不同的同一个型号（5-5 / 5.5）不算「不一致」
  A = () => [cand('claude-opus-5-5', .9), cand('muse', .1)]; B = () => [cand('claude-opus-5.5', .8)];
  r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.status, 'clear'); assert.equal(r.result.disagree, undefined); assert.equal(r.result.reason, undefined);
  A = () => [cand('gpt-5-1', .9)]; B = () => [cand('gpt-5.1', .7), cand('gpt-5', .3)];
  r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.status, 'clear'); assert.equal(r.result.disagree, undefined);
  A = () => [cand('claude-opus-5-5', .6), cand('claude-opus-5-1', .4)]; B = () => [cand('claude-opus-5.1', .9), cand('claude-opus-5.5', .1)];   // 真的不一致仍然照旧
  r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.nearest.id, 'claude-opus-5.1'); assert.equal(r.result.reason, 'library_disagree');
  A = () => [cand('gemini', .95)];
  B = () => [cand('muse', .5)]; B.status = 'weak';
  r = await ctx.FPLibs.inspect([{}], loaded);
  assert.equal(r.result.nearest.id, 'gemini'); assert.equal(r.result.status, 'clear');
});

test('库不一致时：回复里没有思考内容 → 不接受开源模型（qwen…），按闭源候选判断；有思考内容或不知道时照旧', async () => {
  const W = { name: 'W' }, K = { name: 'K' };
  const cand = (id, probability) => ({ id, probability, family: id.split('-')[0].replace(/\d.*/, '') });
  let A, B;
  const make = cands => ({ prepared: { usable: [1] }, result: { status: 'clear', nearest: cands[0], candidates: cands, signals: { fit: .5, separation: .2, relative_probability: cands[0].probability }, used_outputs: 1 } });
  const ctx = vm.createContext({ console, Store: { get: (k, d) => d, set: () => true, del() {} }, Bus: { emit() {} }, IkaleBank: K,
    ProbeLib: { validateBank() {}, inspectAndIdentify: (o, bank) => bank === K ? make(B()) : make(A()) } });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/fp-libs.js'), 'utf8') + ';this.FPLibs=FPLibs;', ctx);
  const loaded = { bank: W };
  A = () => [cand('claude-sonnet-4.6', .6), cand('gpt-6-sol', .4)];
  B = () => [cand('qwen3.8-max-0902', .99), cand('claude-sonnet-4.6', .005), cand('seed-2.1-turbo', .003)];
  let r = await ctx.FPLibs.inspect([{}], loaded, { thought: false });
  assert.equal(r.result.nearest.id, 'claude-sonnet-4.6');   /* 排除 qwen 后两库都指向 claude：一致 */
  assert.deepEqual([...r.result.excluded], ['qwen3.8-max-0902']); assert.ok(!r.result.candidates.some(c => /qwen/.test(c.id)), 'dropped from the candidate list too');
  assert.ok(r.result.signals.relative_probability > .25);
  assert.equal(r.result.libraries[1].id, 'claude-sonnet-4.6', 'per-library view is gated too');
  r = await ctx.FPLibs.inspect([{}], loaded, { thought: true });
  assert.equal(r.result.nearest.id, 'qwen3.8-max-0902', 'visible thinking keeps open-source candidates in play');
  assert.equal(r.result.excluded, undefined); assert.ok(r.result.candidates.some(c => /qwen/.test(c.id)));
  r = await ctx.FPLibs.inspect([{}], loaded);   /* 不知道有没有思考（旧数据）：不动 */
  assert.equal(r.result.excluded, undefined); assert.equal(r.result.nearest.id, 'qwen3.8-max-0902');
  /* 候选全是开源模型时没得选，不筛 */
  A = () => [cand('qwen3.8-max-0902', .6), cand('deepseek-v4', .4)]; B = () => [cand('deepseek-v4', .9), cand('qwen3.8-max-0902', .1)];
  r = await ctx.FPLibs.inspect([{}], loaded, { thought: false }); assert.equal(r.result.nearest.id, 'deepseek-v4'); assert.equal(r.result.excluded, undefined);
  /* 各库一致时，没有思考内容也不改判 */
  A = () => [cand('qwen3.8-max-0902', .95)]; B = () => [cand('qwen3.8-max-0902', .9)];
  r = await ctx.FPLibs.inspect([{}], loaded, { thought: false }); assert.equal(r.result.nearest.id, 'qwen3.8-max-0902'); assert.equal(r.result.status, 'clear');
});
test('FPLibs.thought：有非空 reasoning 内容 = true；看过消息都没有 = false；没有消息内容 = undefined', () => {
  const c = setup(), T = c.FPLibs.thought;
  assert.equal(T([{ parts: [{ type: 'text', text: 'x' }, { type: 'reasoning', text: ' 嗯 ' }] }]), true);
  assert.equal(T([{ parts: [{ type: 'text', text: '1,2' }, { type: 'reasoning', text: '  ' }] }]), false);
  assert.equal(T([{ parts: [{ type: 'text', text: '1,2' }] }, { parts: [{ type: 'reasoning', text: 'a' }] }]), true);
  assert.equal(T([]), undefined); assert.equal(T([{ content: 'x' }]), undefined); assert.equal(T(undefined), undefined);
  assert.equal(c.FPLibs.isOpen({ id: 'qwen3.8-max-0902' }), true); assert.equal(c.FPLibs.isOpen({ id: 'claude-sonnet-4.6', family: 'claude' }), false); assert.equal(c.FPLibs.isOpen({ id: 'x', family: 'deepseek' }), true);
});

test('rank(): one library re-ranks existing replies read-only (trace card library switch for old results)', async () => {
  const c = setup(), P = c.ProbeLib.PROBES, loaded = { bank: c.ProbeLib.seedBank || c.ProbeLib.bank };
  const full = await c.FPLibs.inspect(outputs(P), loaded);
  const ik = await c.FPLibs.rank('ikale', outputs(P), loaded);
  assert.equal(ik.lib, 'lm.ikale.io');
  const stored = full.result.libraries.find(x => x.lib === 'lm.ikale.io');
  assert.equal(ik.id, stored.id); assert.deepEqual(ik.cands, stored.cands);
  assert.ok(ik.cands.length > 1 && ik.cands.length <= 8);
  await assert.rejects(() => c.FPLibs.rank('nope', outputs(P), loaded), /不存在/);
});

test('没有思考内容：单库或另一库「较弱」时也排除开源系（以前只在库不一致时筛，qwen 会胜出）', async () => {
  const W = { name: 'W' }, K = { name: 'K' };
  const cand = (id, probability, fit) => ({ id, probability, fit, family: id.split('-')[0].replace(/\d.*/, '') });
  let A, B;
  const make = (cands, status) => ({ prepared: { usable: [1] }, result: { status, nearest: cands[0], candidates: cands, signals: { fit: cands[0].fit, separation: .2, relative_probability: cands[0].probability }, used_outputs: 1 } });
  const ctx = vm.createContext({ console, Store: { get: (k, d) => d, set: () => true, del() {} }, Bus: { emit() {} }, IkaleBank: K,
    ProbeLib: { THRESHOLDS: { fit: .25, separation: .08, family: .9 }, validateBank() {}, inspectAndIdentify: (o, bank) => bank === K ? make(B(), 'clear') : make(A(), 'weak') } });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/fp-libs.js'), 'utf8') + ';this.FPLibs=FPLibs;', ctx);
  const loaded = { bank: W };
  A = () => [cand('claude-sonnet-4.6', .506, .2), cand('gemini-3.8-flash', .366, .18), cand('gpt-6.1-sol', .04, .1)];   /* 截图：WhatsMyLLM 较弱 */
  B = () => [cand('qwen3.8-max-0902', .833, .6), cand('claude-sonnet-4.6', .1, .4), cand('gpt-6-sol', .05, .3)];       /* ikale 明确 qwen */
  let r = await ctx.FPLibs.inspect([{}], loaded, { thought: false });
  assert.equal(r.result.nearest.id, 'claude-sonnet-4.6'); assert.notEqual(r.result.status, 'clear', 'replaced winner is never 明确');
  assert.ok([...r.result.excluded].includes('qwen3.8-max-0902')); assert.ok(!r.result.candidates.some(c => /qwen/.test(c.id)));
  r = await ctx.FPLibs.inspect([{}], loaded, {});            /* 不知道有没有思考：照旧 */
  assert.equal(r.result.nearest.id, 'qwen3.8-max-0902');
  r = await ctx.FPLibs.inspect([{}], loaded, { thought: true });
  assert.equal(r.result.nearest.id, 'qwen3.8-max-0902');
});
