'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
const line = /const foldVer = [^\n]+;/.exec(src)[0];
const foldVer = new Function(line + '; return foldVer;')();
test('5-5 与 5.5、5-1 与 5.1 是同一个型号；日期 / 参数量 / 其它不动', () => {
  const cases = {
    'claude-opus-5-5': 'claude-opus-5.5', 'claude-opus-5.5': 'claude-opus-5.5', 'opus-5-5?': 'opus-5.5?', 'opus-5-1': 'opus-5.1', 'gpt-5-1': 'gpt-5.1',
    'sonnet-5-5-high': 'sonnet-5.5-high', 'claude-3-7-sonnet-20250219': 'claude-3.7-sonnet-20250219', 'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet-20241022',
    'gemini-2-5-pro': 'gemini-2.5-pro', 'gemini-2-5-flash-lite-preview-06-17': 'gemini-2.5-flash-lite-preview-06-17', 'gpt-4-0613': 'gpt-4-0613', 'o1-mini-2024-09-12': 'o1-mini-2024-09-12',
    'qwen-3-72b': 'qwen-3-72b', 'gpt-6-astra': 'gpt-6-astra', 'opus-5': 'opus-5', '对话 10-03': '对话 10-03', 'gpt-5-0': 'gpt-5.0',
  };
  for (const [a, b] of Object.entries(cases)) assert.equal(foldVer(a), b, a);
  assert.equal(foldVer(foldVer('opus-5-5')), 'opus-5.5');
});
test('同一型号的两种写法在侧栏同组、模型记录统一写法', () => {
  const g = fs.readFileSync(path.join(__dirname, '../ui/gview.js'), 'utf8'), c = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');
  assert.match(g, /modelId\(nm, vid\) \{[^\n]*\n[^\n]*Strength\.foldVer\(k\)/);
  assert.match(c, /set\(sid, v\) \{ if \(v && typeof v\.name === 'string' && typeof Strength !== 'undefined' && Strength\.foldVer\)/);
});
