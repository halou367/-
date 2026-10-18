const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('v0.13.133: Strength.withEffort formats model and effort in hyphenated style without parentheses, and Bar.render syncs with identified model', () => {
  const strengthJs = read('ui/strength.js');
  const dockJs = read('ui/dock.js');
  assert.match(strengthJs, /withEffort\(name, lvl\)/);
  assert.match(strengthJs, /base \+ '-' \+ ef \+ qm/);
  assert.match(dockJs, /Strength\.withEffort\(bestBase, bestEffort\)/);
});

test('v0.13.133: Claude Opus 5.6 (Max) stealth model is detected when peakTurnO exceeds Opus 5.5 64K output ceiling', () => {
  const pricingJs = read('ui/arena-trace/pricing.js');
  const probeJs = read('ui/billing-probe.js');
  const traceJs = read('ui/trace.js');
  assert.match(pricingJs, /anthropic\/claude-opus-5\.6/);
  assert.match(pricingJs, /Claude Opus 5\.6 \(\$\{primaryEffort \|\| 'Max'\}\)/);
  assert.match(pricingJs, /stealthNextGen/);
  assert.match(probeJs, /stealthModelId/);
  assert.match(traceJs, /best\.replace\(\/opus-5\[\.-\]5\/i, 'opus-5\.6'\)/);
});

test('v0.13.133: Online History.refreshNow prunes PC-deleted/archived chats and closes open tabs while offline preserves MsgCache', () => {
  const coreJs = read('ui/core.js');
  assert.match(coreJs, /const isOffline = \(typeof Host !== 'undefined' && Host\.online === false\) \|\| \(typeof BrowseMode !== 'undefined' && BrowseMode\.active\?\.\(\)\)/);
  assert.match(coreJs, /headRemoved\.add\(e\.id\)/);
  assert.match(coreJs, /Tabs\.close\?\.\(t\.key\)/);
});

test('v0.13.133: Mobile first-window right swipe opens #sb drawer and keeps active chat window visible in background', () => {
  const mobileJs = read('ui/mobile.js');
  const css = read('ui/app.css');
  assert.match(mobileJs, /if \(d < 0 && i <= 0\)/);
  assert.match(mobileJs, /document\.body\.classList\.add\('drawer'\)/);
  assert.doesNotMatch(mobileJs, /已经是第一个窗口/);
  assert.doesNotMatch(mobileJs, /只有一个窗口/);
  assert.match(css, /body\.m\.drawer #body>\.pane:not\(#view\)\{visibility:hidden!important/);
});

test('v0.13.133: Send Queue distinguishes split vs merge cards and uses icon buttons for Copy and Recall', () => {
  const viewJs = read('ui/view.js');
  const css = read('ui/app.css');
  assert.match(viewJs, /q-split-card/);
  assert.match(viewJs, /q-merge-card/);
  assert.match(viewJs, /q-act q-ib q-copy/);
  assert.match(viewJs, /q-act q-ib q-recall/);
  assert.match(css, /\.q-row\.q-split-mode \.q-it\.q-split-card/);
  assert.match(css, /\.q-row\.q-merge-mode \.q-merge-card/);
});

test('v0.13.133: Smart cross-region escape, shared node sync across accounts, mandatory ProxyIP, and refresh button', () => {
  const routePolicyJs = read('ui/route-policy.js');
  const autoRouteJs = read('ui/auto-route.js');
  const poolJs = read('ui/pool.js');
  const nodeRoutesJs = read('ui/node-routes.js');
  const regionIpJs = read('ui/region-ip.js');
  assert.match(routePolicyJs, /allowCrossRegionEscape/);
  assert.match(autoRouteJs, /allowCrossRegionEscape:\s*true/);
  assert.match(poolJs, /共用节点，各自独立保留不同的 ProxyIP/);
  assert.match(nodeRoutesJs, /刷新 ProxyIP 列表/);
  assert.match(regionIpJs, /刷新 ProxyIP 列表/);
  assert.doesNotMatch(nodeRoutesJs, /不限地区（不用 ProxyIP）/);
});

test('v0.13.133: Account management has 3 buttons (导出 / 登录 / 保存), wheel preserves scroll on delete, and PC supports right-click paste', () => {
  const accountsJs = read('ui/accounts.js');
  const mgrJs = read('ui/mgr.js');
  const mainJs = read('src/main.js');
  const viewJs = read('ui/view.js');
  assert.match(accountsJs, /proxyField\(a,\s*\{\s*live:\s*false,\s*draft:\s*true/);
  assert.match(accountsJs, /icon\('upload'\),\s*'导出'/);
  assert.match(accountsJs, /icon\('login'\),\s*'登录'/);
  assert.match(accountsJs, /icon\('check'\),\s*'(?:确认|保存)'/);
  assert.match(accountsJs, /_keepScrollTop/);
  assert.match(mgrJs, /savedScroll/);
  assert.match(mainJs, /function attachContextMenu\(wc, w\)/);
  assert.match(viewJs, /addEventListener\('contextmenu'/);
});

test('v0.13.133 runtime: ArenaPricing.inferModelEffortGrade detects Claude Opus 5.6 (Max) on billing-01a13f8c-41c2-7ad3-8e77-73feb405f68d evidence', () => {
  const Pricing = require('../ui/arena-trace/pricing.js');
  const prof = Pricing.inferModelEffortGrade(
    { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5 (Max)' },
    { O: 111721, maxTurnO: 111721, turns: 1, visO: 14888 },
    { stepCount: 39, reasoningStartCount: 23, visTokens: 14888, turnDurationMs: 280000 }
  );
  assert.ok(prof, 'effort profile should be returned');
  assert.equal(prof.primaryEffort, 'Max');
  assert.equal(prof.stealthNextGen, true);
  assert.equal(prof.stealthModelId, 'anthropic/claude-opus-5.6');
  assert.equal(prof.stealthModelLabel, 'Claude Opus 5.6 (Max)');
  assert.equal(Pricing.formatDynamicEffortLabel('Claude Opus 5.5 (Max)', prof), 'Claude Opus 5.6 (Max)');
});
