'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const old = fs.readFileSync(path.join(__dirname, 'fingerprint-review-and-ech.test.cjs'), 'utf8').replace(/\r\n/g, '\n');
const PROMPT = /text: '(Produce integer choices[^\n]*?)'\n/.exec(old.slice(old.indexOf('calibrates dynamic English probe with 318')))[1];
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const answerText = () => Array.from({ length: 318 }, () => 1 + Math.floor(rnd() * 355)).join(', ');
const user = (id, text = PROMPT) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const asst = (id, text = answerText()) => ({ id, role: 'assistant', parts: [{ type: 'text', text }] });
function env(models = {}) {
  const toasts = [], sets = [], M = new Map(Object.entries(models)); let touched = 0;
  const c = vm.createContext({ console, setTimeout, clearTimeout, setInterval: () => {}, clearInterval: () => {}, now: () => Date.now(), describe: e => e?.message || String(e), pad: n => String(n).padStart(2, '0'),
    toast: (msg, type) => toasts.push({ msg, type: type || 'info' }), Bus: { on: () => {}, emit: () => {} }, Store: { get: () => null, set: () => true }, Prefs: { autoTitle: true }, Chats: new Map(), UI: {},
    History: { byId: () => null, rename: async () => true }, Tabs: { cur: { sid: 's1' } },
    Models: { get: sid => M.get(sid) || null, set: (sid, e) => { sets.push({ sid, e }); M.set(sid, e); } },
    Titles: { touch: () => { touched++; }, kick: () => {} }, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, BigInt });
  for (const f of ['fmt.js', 'probe-vendor.js', 'probe-output-guard.js', 'probe-bank-cache.js', 'title-compact.js', 'title-flex.js', 'title-cipher.js', 'conversation-labels.js', 'titles.js', 'title-sync.js', 'fingerprint.js', 'fingerprint-batch.js', 'fingerprint-review.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8'), c);
  const T = vm.runInContext('Titles', c), touch0 = T.touch; T.touch = function (sid) { touched++; return touch0.call(T, sid); };
  return { c, toasts, sets, M, touched: () => touched, review: vm.runInContext('FingerprintReview', c) };
}
const mkChat = messages => ({ sid: 's1', loaded: true, hasMore: false, busy: false, queue: [], messages, emit() {} });
const settled = async (h, n = 1) => { for (let i = 0; i < 300 && h.sets.length < n; i++) await new Promise(r => setTimeout(r, 10)); };

test('没有指纹信息：历史里有 5 条指纹测试回复 → 自动校准，只取最近 3 条，不发消息', async () => {
  const h = env(), msgs = []; for (let i = 0; i < 5; i++) msgs.push(user('u' + i), asst('a' + i));
  const chat = mkChat(msgs);
  assert.equal(h.review.auto(chat), true); await settled(h);
  assert.equal(h.sets.length, 1); assert.ok(h.sets[0].e.fingerprint, 'fingerprint details are filled in');
  assert.equal(chat.probeNumbers.length, 3, 'the latest three only'); assert.equal(h.sets[0].e.fingerprint.count, 3);
  assert.equal(h.toasts.some(t => t.type === 'err'), false); assert.ok(h.toasts.some(t => t.msg.includes('自动校准')));
  assert.equal(h.touched() > 0, true, 'name sync is kicked');
});
test('只有 1 次 → 校准这 1 次', async () => {
  const h = env(), chat = mkChat([user('u0'), asst('a0')]);
  assert.equal(h.review.auto(chat), true); await settled(h);
  assert.equal(chat.probeNumbers.length, 1); assert.equal(h.sets[0].e.fingerprint.count, 1);
});
test('没有可用的指纹测试（普通聊天）：什么都不做，也不弹错误', async () => {
  const h = env(), chat = mkChat([user('u0', 'hello'), asst('a0', 'hi there')]);
  assert.equal(h.review.auto(chat), false); await new Promise(r => setTimeout(r, 50));
  assert.equal(h.sets.length, 0); assert.equal(h.toasts.length, 0);
});
test('已有指纹信息 / 还有更早的消息没读完 / 正在回复 / 不是当前标签：不自动校准', () => {
  const msgs = [user('u0'), asst('a0')];
  let h = env({ s1: { name: 'opus-5.5', fingerprint: { count: 3 } } }); assert.equal(h.review.auto(mkChat(msgs)), false);
  h = env(); assert.equal(h.review.auto({ ...mkChat(msgs), hasMore: true }), false, 'wait for the whole history');
  h = env(); assert.equal(h.review.auto({ ...mkChat(msgs), busy: true }), false);
  h = env(); h.c.Tabs.cur = { sid: 'other' }; assert.equal(h.review.auto(mkChat(msgs)), false);
});
test('同一状态只试一次；有新消息后才会再试', async () => {
  const h = env(), chat = mkChat([user('u0', 'hello'), asst('a0', 'hi')]);
  assert.equal(h.review.auto(chat), false); assert.equal(chat.fpAutoKey, '2:a0');
  chat.messages.push(user('u1'), asst('a1')); assert.equal(h.review.auto(chat), true, 'a new probe reply is considered'); await settled(h);
});
test('自动校准不降级已有型号：只是「接近」时保留原来的确定型号，补上指纹详情', async () => {
  const h = env({ s1: { name: 'opus-5.5', guess: true, fromTitle: true, tier: 'x' } }), chat = mkChat([user('u0'), asst('a0')]);
  assert.equal(h.review.auto(chat), true); await settled(h);
  const e = h.sets[0].e, st = e.fingerprint.result.status;
  assert.ok(e.fingerprint); if (st !== 'clear') assert.equal(e.name, 'opus-5.5'); else assert.equal(e.name, e.fingerprint.result.nearest.id);
});
test('手动「校准指纹」行为不变：失败仍然弹错误提示，不限 3 条', async () => {
  const h = env(), chat = mkChat([user('u0', 'hello'), asst('a0', 'hi there')]);
  await h.review.calibrate(chat, chat.messages[1]); assert.ok(h.toasts.some(t => t.type === 'err'));
  const msgs = []; for (let i = 0; i < 5; i++) msgs.push(user('u' + i), asst('a' + i));
  const c2 = mkChat(msgs); await h.review.calibrate(c2, msgs[9]); assert.equal(c2.probeNumbers.length, 5);
});
test('触发点：对话读完（含后台补齐更早消息之后）和切回已读完的对话', () => {
  const core = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8'), view = fs.readFileSync(path.join(__dirname, '../ui/view.js'), 'utf8');
  assert.match(core, /if \(!this\.hasMore\) setTimeout\(\(\) => \{ try \{ FingerprintReview\?\.auto\?\.\(this\); \} catch \{\} \}, 600\);/);
  assert.match(core, /finally \{ this\.allLoading = false; \}\s*if \(!this\.hasMore\) try \{ FingerprintReview\?\.auto\?\.\(this\); \} catch \{\}/);
  assert.match(view, /FingerprintReview\.auto\(c\)/);
});
