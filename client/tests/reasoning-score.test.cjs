'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
const m = /THINK_MIN\s*=\s*([\d.]+)/.exec(src), t0 = /THINK_T0\s*=\s*([\d.]+)/.exec(src);
test('推理分常量：5 秒思考门槛，60 秒时间常数', () => {
  assert.equal(+m[1], 5); assert.equal(+t0[1], 60);
});
test('推理分按饱和曲线 0–100，且没思考就没分', () => {
  const a = src.indexOf('  const positive ='), b = src.indexOf('  const SCORE_W');
  const ctx = vm.createContext({ THINK_MIN: +m[1], THINK_T0: +t0[1] });
  vm.runInContext(src.slice(a, b) + ';this.scoreOf=scoreOf', ctx);
  assert.equal(ctx.scoreOf({ think: 2, out: 50 }), null);
  assert.equal(ctx.scoreOf(null), null);
  const s30 = ctx.scoreOf({ think: 30 }), s120 = ctx.scoreOf({ think: 120 }), s900 = ctx.scoreOf({ think: 900 });
  assert.ok(s30 > 30 && s30 < 50); assert.ok(s120 > s30 && s120 < 100); assert.ok(s900 <= 100 && s900 > 99);
});
test('鹈鹕测试已注册进 bundle，且 100% 即停', () => {
  const b = fs.readFileSync(path.join(__dirname, '../src/bundle.js'), 'utf8');
  assert.match(b, /pelican-test\.js/);
  const p = fs.readFileSync(path.join(__dirname, '../ui/pelican-test.js'), 'utf8');
  assert.match(p, /chat\.stop\(\)/);
});
test('超过 100 的旧强度分（如 6878）不会再当推理分：解析 / 显示 / 标题同步都丢弃', () => {
  const ctx = vm.createContext({ Strength: { canon: x => x } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/conversation-labels.js'), 'utf8') + ';this.L=ConversationLabels', ctx);
  const L = ctx.L;
  assert.equal(L.parse('gpt-6-astra(99.0%)-6878分').score, null);
  assert.equal(L.parse('gpt-6-astra · 匹配置信度 99.0% · 推理分 6878').score, null);
  assert.equal(L.parse('gpt-6-astra(99.0%)-64.1分').score, 64.1);
  assert.equal(L.fingerprintData({ name: 'gpt-6-astra', fingerprint: { reasoning: { score: 6878 } } }).score, null);
  assert.equal(L.score({ fingerprint: { reasoning: { score: 6878 } } }, ''), null);
  assert.equal(L.unified({ model: 'x', confidence: null, score: 6878 }), 'x');
});
