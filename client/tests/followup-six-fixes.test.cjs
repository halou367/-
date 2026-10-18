
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const viewSrc = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'ui/app.css'), 'utf8');
const dockSrc = fs.readFileSync(path.join(root, 'ui/dock.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'ui/boot.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(root, 'ui/core.js'), 'utf8');
const plusSrc = fs.readFileSync(path.join(root, 'ui/plus.js'), 'utf8');
const strSrc = fs.readFileSync(path.join(root, 'ui/strength.js'), 'utf8');
const gachaSrc = fs.readFileSync(path.join(root, 'ui/gacha.js'), 'utf8');
const pricing = require(path.join(root, 'ui/arena-trace/pricing.js'));
const catalogRaw = JSON.parse(fs.readFileSync(path.join(root, 'ui/arena-trace/catalog.json'), 'utf8'));

test('1. Open-source thinking uses soft light-red reminder and stays collapsed by default', () => {
  assert.match(viewSrc, /const defOpen = openThink \? false : open;/);
  assert.match(viewSrc, /const wantOpen = openThink \? false : streaming;/);
  assert.match(cssSrc, /details\.reason\.open-think\s*\{[^}]*rgba\(254,\s*242,\s*242,\s*0\.55\)/);
  assert.doesNotMatch(cssSrc, /details\.reason\.open-think\{[^}]*border:2px solid #ef4444!important/);
});

test('2. Shared-price sibling models produce strictly unique .toFixed(1)% confidence scores and unique top candidate is selected directly', () => {
  const models = pricing.normalizeAgentCatalog(catalogRaw);
  const cases = [
    { input: 2000, output: 1500, cacheRead: 10000, cacheWrite: 5000, cost: (2000*5 + 1500*25 + 10000*0.5 + 5000*6.25)/1e6 },
    { input: 2000, output: 1500, cacheRead: 10000, cacheWrite: 5000, cost: (2000*3 + 1500*15 + 10000*0.3 + 5000*3.75)/1e6 },
    { input: 2000, output: 1500, cacheRead: 10000, cacheWrite: 0, cost: (2000*2.5 + 1500*15 + 10000*0.25)/1e6 },
    { input: 2000, output: 1500, cacheRead: 10000, cacheWrite: 5000, cost: (2000*0.6 + 1500*2.5 + 10000*0.1 + 5000*0.9375)/1e6 },
  ];
  for (const tc of cases) {
    const ranked = pricing.rankByBasePrice(tc, tc.cost, models, { topK: 6 });
    const topScores = (ranked.candidates || ranked.ranked || ranked).slice(0, 4).map(r => r.confidence.toFixed(1));
    assert.equal(new Set(topScores).size, topScores.length, 'Expected distinct .toFixed(1)% scores: ' + topScores.join(', '));
  }
  const probeUiSrc = fs.readFileSync(path.join(root, 'ui/billing-probe-ui.js'), 'utf8');
  assert.match(probeUiSrc, /const hasStandout = !isTiedTop && topConf > 0;/);
});

test('3. Export Fingerprint and Export Tool Calls are right-aligned icon buttons in .mc-foot-acts with fingerprint/tool icons, and $/T unit button is after actual amount', () => {
  const dockJs = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dock.js'), 'utf8');
  const bpuJs = fs.readFileSync(path.join(__dirname, '..', 'ui', 'billing-probe-ui.js'), 'utf8');
  assert.match(bpuJs, /class: 'btn sm ghost bp-lock-btn'/);
  assert.match(dockJs, /unitBtn\(unit\)/);
  assert.match(dockJs, /exportBtns\(sid\)/);
  assert.match(dockJs, /class: 'mc-foot-acts'/);
  assert.match(dockJs, /icon\('fingerprint'\)/);
  assert.match(dockJs, /icon\('tool'\)/);
  assert.match(dockJs, /'aria-label': '导出指纹'/);
  assert.match(dockJs, /'aria-label': '导出调用工具'/);
});

test('4. Model Leaderboard, Reasoning Score Leaderboard, and Price Leaderboard are connected and show update timestamps', () => {
  assert.match(plusSrc, /\['rank',\s*'模型排行榜'\],\s*\['power',\s*'推理分排行'\],\s*\['price',\s*'价格排行榜'\]/);
  assert.match(plusSrc, /更新 '\s*\+\s*this\.fmtTime/);
  assert.match(strSrc, /\['rank',\s*'trophy',\s*'模型排行榜'\],\s*\['power',\s*'bolt',\s*'推理分排行'\],\s*\['price',\s*'dollar',\s*'价格排行榜'\]/);
  assert.match(strSrc, /'更新时间：'\s*\+\s*this\.fmtTime\(curAt\)/);
  assert.match(gachaSrc, /syncFromCatalog/);
});

test('5. Browser <-> Client Mode switching and pendingConfirm empty model names never leave the client blank', () => {
  assert.match(dockSrc, /const bestNm = mi\?\.name \|\| mi\?\.candidates\?\.\[0\]\?\.id \|\| lt\?\.best \|\| '';/);
  assert.match(bootSrc, /sameAcctEmail/);
  assert.match(bootSrc, /\/\\\^\[\\w-\]\{4,64\}\$\/|\/\^\[\\w-\]\{4,64\}\$\//);
  assert.match(coreSrc, /const isFast = !acct \|\| acct === 'fast' \|\| acct === 'anon';/);
});

test('fast client message & stream sync parity with browser: drain keepIfFinished, srvPend attach in reconcile/converge, 2.5s waitReply poll, and quickSync on tab/focus', () => {
  const core = fs.readFileSync(path.join(root, 'ui/core.js'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
  assert.match(core, /drain\(2500,\s*\{\s*keepIfFinished:\s*true\s*\}\)/);
  assert.match(core, /const pick = activeStart \?\? \(opt\?\.keepIfFinished \? \(lastRun \?\? act\) : null\)/);
  assert.match(core, /void this\.remoteSync\(\{\s*seq:\s*baseSeq,\s*rewind:\s*true,\s*pend:\s*true\s*\}\)/);
  assert.match(core, /const waitReply = !!lastMsg && \(lastMsg\.role === 'user' \|\| lastMsg\.metadata\?\.pending\)/);
  assert.match(core, /quickSync\(force = false\)/);
  assert.match(view, /else if \(chat\.loaded && !chat\.loading\) chat\.quickSync\?\.\(\);/);
});
