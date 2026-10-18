'use strict';
// 省流量 / 逐字显示：关键节流参数不能被悄悄改回去
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8');

test('trace live polling is slow and light', () => {
  const s = src('trace.js');
  assert.match(s, /setTimeout\(tick, visible \? 20000 : 45000\)/);
  assert.match(s, /live \? 2 : CALL_DETAIL/);
});
test('fingerprint bank checks at most every 6 hours', () => {
  assert.match(src('probe-bank-cache.js'), /TTL = 6 \* 3600e3, RETRY = 30 \* 60e3/);
});
test('converge backs off while long-poll is healthy', () => {
  const s = src('core.js');
  assert.match(s, /this\.liveGap = Math\.min\(60000, lg \* 2\)/);
  assert.match(s, /cap = this\.watching && !this\.wFails \? 900000 : 300000/);
  assert.match(s, /now\(\) - \(this\._preAt \|\| 0\) < 180000/);
});
test('traffic buckets classify main endpoints', () => {
  const s = src('core.js'), i = s.indexOf('const Traffic = {'), j = s.indexOf('\n};', i);
  const T = new Function('location', 'now', 'IP', 'return ' + s.slice(i + 16, j + 2))({ href: 'https://arena.ai/', host: 'arena.ai' }, () => 0, {});
  assert.equal(T.kind('https://arena.ai/ai-proxy/realtime/v1/sessions/x/out'), '实时回复流');
  assert.equal(T.kind('https://api.trigger.dev/api/v1/runs/run_1/events'), '运行记录 Trace');
  assert.equal(T.kind('/api/chat/abc'), '读取对话');
  assert.equal(T.kind('/api/history/unified?limit=50'), '对话列表');
  T.add('a', 10, 0, true); T.add('a', 0, 90); T.add('b', 0, 5, true);
  assert.deepEqual(T.top(1)[0], { k: 'a', up: 10, down: 90, n: 1, t: 100 });
});
test('typewriter streaming exists and can be turned off', () => {
  assert.match(src('view.js'), /smoothStream === false/);
  assert.match(src('dock.js'), /sw\('smoothStream', true\)/);
});
