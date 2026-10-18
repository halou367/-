const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = n => fs.readFileSync(path.join(__dirname, '../ui', n + '.js'), 'utf8');
const core = read('core'), boot = read('boot'), route = read('auto-route'), view = read('view');

function readLimit(clock) {
  const src = core.slice(core.indexOf('const ReadLimit = {'), core.indexOf('async function api('));
  return new Function('now', src + '\nreturn ReadLimit;')(clock);
}

test('429 cooldown: background reads are dropped, foreground reads wait (short) or fail (long)', async () => {
  let t = 1000; const R = readLimit(() => t);
  R.hit(5000);                       // 最少 30 秒冷却
  assert.equal(R.active(), true);
  await assert.rejects(R.take(true), e => e.status === 429 && e.rateLimitedLocally && e.retryAfterMs === 30000);
  R.hit(120000); await assert.rejects(R.take(false), e => e.status === 429);
  t += 200000; assert.equal(R.active(), false);
  await R.take(false); await R.take(true);
});

test('api() routes every /api/ read through the cooldown gate and any read 429 starts it', () => {
  assert.match(core, /if \(read && \/\^\\\/api\\\/\/\.test\(path\)\) await ReadLimit\.take\(!!opt\.bg\);/);
  assert.ok(core.includes("if (res.status === 429 && (read || /^\\/api\\/chat\\//.test(path))) ReadLimit.hit(error.retryAfterMs);"));
  assert.match(core, /api\('\/api\/chat\/' \+ this\.sid, \{ timeout: 30000, bg: true \}\)/);   // 预读是后台读
});

test('no background full scans: history first page only, chats load older messages on demand', () => {
  assert.doesNotMatch(boot, /History\.refresh\(\)\.then\(\(\) => History\.loadAll\(\)\)/);
  assert.doesNotMatch(view, /void History\.loadAll\(\);/);
  assert.doesNotMatch(core, /setTimeout\(\(\) => this\.loadAll\(\), 400\)/);
  assert.match(boot, /IP\.ping\(\); \}, 30000\)/);
});

test('429 never rotates the exit IP', () => {
  assert.doesNotMatch(core, /AutoRoute\.unlimit\(/);
  assert.doesNotMatch(route, /why\?\.ip&&this\.enabled\(\)/);
  const body = route.slice(route.indexOf('  unlimit(why){'), route.indexOf('  limited(why){'));
  assert.doesNotMatch(body, /request\('limited'/);
  assert.match(body, /return Promise\.resolve\(false\)/);
});

test('sidebar card: crescent/ring drawn above the confidence fill; dark selected card is a darker background, not near-black', () => {
  const css = fs.readFileSync(path.join(__dirname, '../ui/app.css'), 'utf8');
  assert.match(css, /\.card\.cf::after\{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inherit\}/);
  assert.doesNotMatch(css, /--on:#0d0c0b/);
  assert.match(css, /\[data-theme=dark\]\{[^}]*--on:color-mix\(in srgb,var\(--bg\) 80%,#000\)/);
});
