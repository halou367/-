'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
function load() {
  const { build } = require('../src/bundle');
  const src = fs.readFileSync(path.join(__dirname, '../ui/device-info.js'), 'utf8');
  const R = JSON.parse(fs.readFileSync(path.join(__dirname, '../ui/region-environments.json'), 'utf8'));
  const env = JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.locale, ...new Set([v.timezone, ...(v.zones || [])])]])));
  const ctx = vm.createContext({ Intl, Date, Math, String, Object, JSON, Set, RegExp });
  vm.runInContext(src.replace('/*__REGION_ENV__*/null', env) + ';this.D=DeviceInfo;', ctx);
  return { D: ctx.D, build };
}
test('timezone matches by zone list or same offset', () => {
  const { D } = load();
  assert.equal(D.tzMatch('JP', 'Asia/Tokyo'), true);
  assert.equal(D.tzMatch('JP', 'America/New_York'), false);
  assert.equal(D.tzMatch('US', 'America/Los_Angeles'), true);
  assert.equal(D.tzMatch('XX', 'Asia/Tokyo'), null);
});
test('language matches by region subtag or main language', () => {
  const { D } = load();
  assert.equal(D.langMatch('JP', ['ja']), true);
  assert.equal(D.langMatch('US', ['zh-CN', 'zh']), false);
  assert.equal(D.langMatch('US', ['en-GB']), true);
  assert.equal(D.langMatch('CN', ['en-US', 'zh-CN']), true);
});
test('planned environment flags exit/region mismatch', () => {
  const { D } = load();
  const ok = D.planned('JP', 'JP'); assert.equal(ok.tz, 'Asia/Tokyo'); assert.equal(ok.issues.length, 0);
  const bad = D.planned('JP', 'US'); assert.match(bad.issues[0], /不一致/); assert.equal(bad.tzOk, false);
});
test('bundle injects the region table', () => {
  const out = require('../src/bundle').build(path.join(__dirname, '../ui'), '0.0.0');
  assert.ok(!out.includes('/*__REGION_ENV__*/null'));
  assert.match(out, /"JP":\["ja-JP","Asia\/Tokyo"/);
});
