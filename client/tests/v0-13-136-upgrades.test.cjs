const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('v0.13.136 Pillar 1: R.group keeps latest 1 command outside folded .tgroup and R.toolRow tracks Bash live timer + 1-hour stuck auto-resume', () => {
  const viewJs = read('ui/view.js');
  const coreJs = read('ui/core.js');
  const appCss = read('ui/app.css');

  assert.match(coreJs, /_startAt:\s*this\.recTs\s*\|\|\s*now\(\)/);
  assert.match(coreJs, /p\._durMs\s*=\s*Math\.max\(0,/);
  assert.match(viewJs, /fmtDurMs\(ms,\s*live\s*=\s*false\)/);
  assert.match(viewJs, /async nudgeBash\(el,\s*p,\s*tid,\s*why\s*=\s*'manual'\)/);
  assert.match(viewJs, /⏹ 中断并继续/);
  assert.match(viewJs, /Number\(Prefs\.bashTimeoutMin\)\s*>\s*0\)\s*\?\s*Number\(Prefs\.bashTimeoutMin\)\s*:\s*60\)\s*\*\s*60000/);
  assert.match(viewJs, /if\s*\(lastToolIdx\s*>=\s*0\s*&&\s*cut\s*>\s*lastToolIdx\)\s*cut\s*=\s*lastToolIdx;/);
  assert.match(appCss, /\.tr-dur\.is-live/);
  assert.match(appCss, /\.tr-nudge/);
});

test('v0.13.136 Pillar 2 & 3: offline.html streamlined native recovery panel, unrestricted cross-region escape, and LastGoodRoute support', () => {
  const offHtml = read('ui/offline.html');
  const offCtx = read('ui/offline-context.js');
  const offModes = read('ui/offline-modes.js');
  const autoRoute = read('ui/auto-route.js');
  const nodeRoutes = read('ui/node-routes.js');

  assert.match(offHtml, /id="connection-card"/);
  assert.match(offHtml, /id="connection-editor"/);
  assert.match(offHtml, /id="act-browse-top"/);
  assert.match(offHtml, /无法连接 · 请切换节点/);
  assert.match(offHtml, /allowCrossRegionEscape:\s*true/);
  assert.match(offHtml, /new RoutePolicy\.Engine/);
  assert.match(offHtml, /cancelled:\s*function/);
  assert.doesNotMatch(offHtml, /id="lock-protect"/);
  assert.doesNotMatch(offHtml, /改为直连并重试/);
  assert.doesNotMatch(offHtml, /测试代理/);
  assert.doesNotMatch(offHtml, /直接重试/);

  assert.match(offCtx, /shared:\s*\(k,\s*v\)\s*=>/);
  assert.match(offCtx, /const LastGoodRoute\s*=/);
  assert.match(offCtx, /const icon\s*=\s*\(n,\s*cls\s*=\s*''\)\s*=>/);
  assert.match(offModes, /LastGoodRoute\.save/);
  assert.match(autoRoute, /saveLastGood\(/);
  assert.match(autoRoute, /rollbackLastGood\(/);
  assert.match(nodeRoutes, /lastGoodRoute:/);
});

test('v0.13.136 Pillar 4: lossless client slimming in package.json and scripts/after-pack.js', () => {
  const pkg = JSON.parse(read('package.json'));
  const afterPack = read('scripts/after-pack.js');

  assert.ok(/^0\.13\.1(?:3[6-9]|[4-9]\d)$/.test(pkg.version));
  assert.deepEqual(pkg.build.electronLanguages, ['zh-CN', 'zh-TW', 'en-US']);
  assert.ok(pkg.build.files.includes('!ui/gen/**'));
  assert.match(afterPack, /KEEP_LOCALES\s*=\s*new Set\(\['zh-CN\.pak',\s*'zh-TW\.pak',\s*'en-US\.pak'\]\)/);
  assert.match(afterPack, /LICENSES\.chromium\.html/);
  assert.match(afterPack, /dxcompiler\.dll/);
  assert.match(afterPack, /dxil\.dll/);
});

test('Account availability check interval (default 6h), card status halos (.cur / .is-bg / .is-bad), and cross-account gold annotation sync', () => {
  const coreJs = read('ui/core.js');
  const strengthJs = read('ui/strength.js');
  const gviewJs = read('ui/gview.js');
  const accountsJs = read('ui/accounts.js');
  const pickerJs = read('ui/account-picker.js');
  const mgrJs = read('ui/mgr.js');
  const viewJs = read('ui/view.js');
  const dockJs = read('ui/dock.js');
  const bootJs = read('ui/boot.js');
  const mainJs = read('src/main.js');
  const appCss = read('ui/app.css');

  // 1. Default 6h account check interval & settings UI
  assert.match(coreJs, /acctCheckHours:\s*6/);
  assert.match(pickerJs, /checkIntervalMs\(\)/);
  assert.match(pickerJs, /startCheckTimer\(runOnStart\s*=\s*false\)/);
  assert.match(viewJs, /账号状态检测间隔（小时）/);
  assert.match(dockJs, /账号状态检测间隔/);
  assert.match(bootJs, /AccountPicker\.startCheckTimer\(true\)/);

  // 2. Account card visual states: .cur, .is-bg, .is-bad
  assert.match(accountsJs, /isBg\s*\?\s*' is-bg'\s*:\s*''/);
  assert.match(accountsJs, /isBad\s*\?\s*' is-bad'\s*:\s*''/);
  assert.match(pickerJs, /c\.classList\.toggle\('is-bad',\s*st\.loggedIn\s*===\s*false\)/);
  assert.match(pickerJs, /c\.classList\.toggle\('is-bg',\s*!isCur\s*&&\s*!!\(a\?\.win\s*\|\|\s*a\?\.live\s*\|\|\s*st\.gacha\?\.busy\s*\|\|\s*st\.statsBusy\)\)/);
  assert.match(mgrJs, /isBg\s*\?\s*' is-bg'\s*:\s*''/);
  assert.match(mgrJs, /isBad\s*\?\s*' is-bad'\s*:\s*''/);
  assert.match(appCss, /\.acard\.cur:not\(\.is-bad\)/);
  assert.match(appCss, /\.acard\.is-bg:not\(\.is-bad\)/);
  assert.match(appCss, /\.acard\.is-bad/);

  // 3. Cross-account gold annotation sync
  assert.match(strengthJs, /keysOf\(n\)/);
  assert.match(strengthJs, /\(\\d\)\(none\|minimal\|low\|medium\|high\|xhigh\|max\)\\b/i);
  assert.match(gviewJs, /if\s*\(manual\)\s*\{\s*for\s*\(const r of rows\)\s*r\.vip\s*=\s*!!\(r\.vid\s*&&\s*Gold\.has\(r\.nm\)\);\s*\}/);
  assert.match(mainJs, /cmd\.goldMode\s*=\s*v\?\.goldMode/);
  assert.match(mainJs, /cmd\.goldSet\s*=\s*Array\.isArray\(v\?\.goldSet\)/);
  assert.match(bootJs, /if\s*\(m\?\.goldMode\s*\|\|\s*Array\.isArray\(m\?\.goldSet\)\)/);
});

test('Mid-turn fake-end auto-continue: KeepAlive.isMidTurnStalled, fakeEnd -> midTurnStall transition, and non-blocking cont execution', async () => {
  const vm = require('node:vm');
  const coreJs = read('ui/core.js');
  const keepJs = read('ui/keep.js');

  assert.match(coreJs, /const wasMidStall\s*=\s*!!\(/);
  assert.match(coreJs, /const staleFakePend\s*=\s*!wasBusy\s*&&\s*!!wasFake/);
  assert.match(coreJs, /if\s*\(!this\.gacha\s*&&\s*!this\.fakeEnd\s*&&\s*!this\.midTurnStall\)\s*\{\s*clearTimeout\(this\.tailT\);/);

  let fakeNow = 100000;
  const chats = new Map();
  const ctx = {
    now: () => fakeNow,
    Prefs: { keepAlive: true },
    Chats: chats,
    Hitl: {
      name: p => /^(ask_user|add_voice|generate_image)$/.test(String(p?.toolName || '')),
      awaiting: () => false,
      idleWait: () => false,
      pending: () => [],
    },
    UI: { els: {} },
    Bus: { on: () => {}, emit: () => {} },
    document: { hidden: true, getElementById: () => null, addEventListener: () => {} },
    addEventListener: () => {},
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    URL: { createObjectURL: () => '' },
    Blob: function () {},
    Worker: function () { throw new Error('no worker'); },
    navigator: {},
    h: () => ({ remove: () => {}, replaceWith: () => {} }),
    icon: () => ({}),
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(keepJs, ctx);
  const KeepAlive = vm.runInContext('KeepAlive', ctx);

  // 1. Verify isMidTurnStalled cases
  assert.ok(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'tool-bash', toolName: 'bash', toolCallId: 't1', state: 'output-error' }] }],
  }));
  assert.ok(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm2', role: 'assistant', parts: [{ type: 'text', text: '先检查一下配置' }, { type: 'reasoning', text: 'thinking...' }] }],
  }));
  assert.ok(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm3', role: 'assistant', parts: [{ type: 'text', text: '接下来我将读取配置文件并修改对应的参数' }] }],
  }));
  assert.ok(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm4', role: 'assistant', parts: [{ type: 'text', text: '正在为您修改文件：' }] }],
  }));
  assert.equal(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm5', role: 'assistant', parts: [{ type: 'tool-present_file', toolName: 'present_file', toolCallId: 't2', state: 'output-available' }] }],
  }), null);
  assert.equal(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm5b', role: 'assistant', parts: [{ type: 'tool-present_file', toolName: 'default_api:present_file', toolCallId: 't2b', state: 'output-available' }, { type: 'tool-bash', toolName: 'bash', toolCallId: 't2c', state: 'output-available' }] }],
  }), null, 'turn that already called present_file never triggers mid-turn stall');
  assert.equal(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm6', role: 'assistant', parts: [{ type: 'text', text: '已完成全部修改并通过所有单元测试。' }] }],
  }), null);
  assert.equal(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm6b', role: 'assistant', parts: [{ type: 'tool-edit_file', toolName: 'edit_file', toolCallId: 't3', state: 'output-available' }, { type: 'text', text: '我已经开始修复并完成更新，现在你可以测试一下效果：' }] }],
  }), null, 'post-tool summary text never falsely triggers transition auto-continue');

  // 2. Verify fakeEnd -> resumeIncremental -> midTurnStall -> auto-send '继续' even with idle peek streaming=true and <6s after 'fake'
  const sentCalls = [];
  const chat = {
    sid: 's-test',
    loaded: true,
    loading: false,
    busy: false,
    streaming: true, // idle peek stream still open
    endStop: false,
    stopReq: false,
    error: null,
    status: 'idle',
    endAt: fakeNow,
    fakeEnd: { at: fakeNow, why: 'bash 还没返回结果就结束了（假结束）', key: 'open|m1|1' },
    midTurnStall: null,
    messages: [{
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'tool-bash', toolName: 'bash', toolCallId: 't1', state: 'input-available' }],
    }],
    async resumeIncremental() {
      this.fakeEnd = null;
      this.messages[0].parts[0].state = 'output-error';
      this.endAt = fakeNow;
      this.midTurnStall = { at: fakeNow, why: '工具中断自动续接', key: 'stall-tool|m1|1' };
      return true;
    },
    async serverMidTurn() { return false; },
    async send(text, a, b, opt) {
      sentCalls.push({ text, opt });
    },
  };
  chats.set(chat.sid, chat);

  // Initialize KeepAlive state on chat before fakeEnd
  chat.fakeEnd = null;
  KeepAlive.check(chat);

  // Trigger fakeEnd at t = 101000
  fakeNow = 101000;
  chat.fakeEnd = { at: fakeNow, why: 'bash 还没返回结果就结束了（假结束）', key: 'open|m1|1' };
  KeepAlive.check(chat);
  assert.equal(chat._ka.plan?.kind, 'fake');

  // Advance 2.1s so 'fake' fires and runs resumeIncremental() -> sets chat.midTurnStall
  fakeNow += 2100;
  KeepAlive.check(chat);
  await new Promise(r => setImmediate(r));
  assert.ok(chat.midTurnStall);

  // Advance 1.9s (total < 6s since 'fake' fired!) and verify 'cont' is proposed and NOT blocked by 'fake' history or streaming=true
  fakeNow += 1900;
  KeepAlive.check(chat);
  assert.equal(chat._ka.plan?.kind, 'cont');

  // Advance 2.1s so 'cont' fires and sends '继续'
  fakeNow += 2100;
  KeepAlive.check(chat);
  await new Promise(r => setImmediate(r));
  assert.equal(sentCalls.length, 1);
  assert.equal(sentCalls[0].text, '继续');
  assert.equal(sentCalls[0].opt?.autoContinue, true);

  // Completed tool (state: 'output-available') and completed turn (realTcAt / finAt set) NEVER trigger auto-continue
  assert.equal(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm_done_tool', role: 'assistant', parts: [{ type: 'tool-bash', toolName: 'bash', toolCallId: 't1', state: 'output-available', output: { exit_code: 0 } }] }],
  }), null);
  assert.equal(KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{ id: 'm_done_tr', role: 'assistant', parts: [{ type: 'text', text: '正在为您修改文件：' }] }],
  }), null);

  const viewSrc = read('ui/view.js');
  const coreSrc = read('ui/core.js');
  assert.ok(viewSrc.includes('if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }') && viewSrc.includes('d.__curPart = p;'));
  assert.ok(viewSrc.includes("if (why === 'timeout' && (!c.busy || !c.live || R.tstate(curP) !== 'run' || R.nudgedTools.has(tid))) return;"));
  assert.ok(coreSrc.includes('if (this.finAt) { this.finAt = 0; clearTimeout(this._finTurnT); this._finTurnT = 0; }'));
  assert.ok(coreSrc.includes('const dbLaggedBehindLive = wasBusy &&'));
});

test('Network loss opens client UI + RegionIP modal popup in-place instead of standalone offline page', () => {
  const mainSrc = read('src/main.js');
  const bootSrc = read('ui/boot.js');
  const sgSrc = read('ui/session-gate.js');
  const acSrc = read('ui/accounts.js');
  const ripSrc = read('ui/region-ip.js');
  const androidSrc = read('android/app/src/main/java/ai/arena/client/MainActivity.java');

  // 1. Electron main.js offline() opens RegionIP modal in-place or loads UI_URL?browse=1&offline=1 on arena.ai targets
  assert.ok(mainSrc.includes("RegionIP?.open?.({offlineAlert:true})") && mainSrc.includes("browse: '1', offline: '1'"));
  // 2. Android MainActivity showOffline loads UI?browse=1&offline=1 on arena.ai targets
  assert.ok(androidSrc.includes('"?browse=1&offline=1&code="'));
  // 3. boot.js handles ?browse=1&offline=1 by entering browse mode and opening RegionIP({ offlineAlert: true })
  assert.ok(bootSrc.includes('isOfflineBoot') && bootSrc.includes('RegionIP.open({ offlineAlert: true })'));
  // 4. session-gate.js opens RegionIP({ offlineAlert: true }) and enters browse mode on offline/waiting
  assert.ok(sgSrc.includes('RegionIP.open({ offlineAlert: true })') && sgSrc.includes('UI.enterBrowseMode'));
  // 5. accounts.js provides recoverFromBrowseMode() and region-ip.js invokes it on successful route switch
  assert.ok(acSrc.includes('async recoverFromBrowseMode()') && ripSrc.includes('UI.recoverFromBrowseMode'));
});

test('v0.13.144: unified gold marks across accounts, pinned conversations always gold, and selective lightweight encrypted title prefix', () => {
  const vm = require('node:vm');
  const tcSrc = read('ui/title-cipher.js');
  const stSrc = read('ui/strength.js');
  const gvSrc = read('ui/gview.js');
  const tsSrc = read('ui/title-sync.js');
  const ttSrc = read('ui/titles.js');

  // 1. Test TitleCipher lightweight gold/favorite prefix round-trip
  const ctx = vm.createContext({
    crypto: require('node:crypto').webcrypto,
    TextEncoder,
    TextDecoder,
    TitleCompact: { COMPACT_CHARS: 100 },
    Store: { get: (k, d) => d, set: () => true },
    Host: { shared: () => Promise.resolve(null), setShared: () => Promise.resolve(true) },
    Bus: { on: () => {}, emit: () => {} },
    UI: { renderList: () => {}, renderListSoon: () => {}, renderTabs: () => {} },
    Models: { all: {}, get: () => null },
    History: { items: [], byId: () => null },
    Chats: new Map(),
    Notes: { all: {}, get: () => '', rec: () => ({}), save: () => true },
    Brand: { of: n => /claude|opus|sonnet|fable/i.test(n || '') ? 'anthropic' : /gpt|sol|luna|astra/i.test(n || '') ? 'openai' : '' },
    now: () => 1760000000000,
  });
  vm.runInContext(tcSrc + '\nthis.TitleCipher = TitleCipher;', ctx);
  const TC = ctx.TitleCipher;

  const sid = '019a1111-2222-7333-8444-555566667777';
  const origTitle = 'Build a React dashboard';
  const prefixed = TC.encodeGoldPrefix(sid, { fav: true, gold: true, model: 'claude-opus-5.6-max', score: 92.4 }, origTitle);
  assert.ok(TC.isGoldPrefixed(prefixed), 'encoded string has ⟦...⟧ gold prefix');
  assert.ok(prefixed.endsWith(' ' + origTitle), 'original title is preserved after lightweight prefix');
  assert.equal(TC.stripGoldPrefix(prefixed), origTitle, 'stripGoldPrefix restores exact original title');

  const decoded = TC.decodeGoldPrefix(prefixed);
  assert.ok(decoded, 'decodeGoldPrefix succeeds on any device without passphrase unlock');
  assert.equal(decoded.fav, true);
  assert.equal(decoded.gold, true);
  assert.equal(decoded.model, 'claude-opus-5.6-max');
  assert.equal(decoded.score, 92.4);
  assert.equal(decoded.cleanTitle, origTitle);

  // Tampered prefix fails closed
  const tampered = '⟦0' + prefixed.slice(2);
  assert.equal(TC.decodeGoldPrefix(tampered), null, 'tampered prefix tag is rejected');

  // 2. Verify Gold unified methods and clearAll / toggle turn-off behavior in strength.js
  assert.ok(stSrc.includes('isUnifiedGold(n)') && stSrc.includes('clearAll()') && stSrc.includes('toggleChat(sid)'));
  assert.ok(stSrc.includes("Host.shared('gold'"));
  // Verify Gold.toggle turns off an already-lit model even when switching from 'auto' to 'manual'
  assert.ok(stSrc.includes('const wasOn = arr.length < prev.length;') && stSrc.includes('const on = !wasOn;'));

  // 3. Verify gview.js pins favorites and marks them gold even in unlimited mode, and uses Gold.isUnifiedGold
  assert.ok(gvSrc.includes('for (const r of sortedFavs) r.vip = true;'));
  assert.ok(gvSrc.includes('Gold.isUnifiedGold(r.nm)'));

  // 4. Verify selective prefix sync in title-sync.js and titles.js
  assert.ok(tsSrc.includes('function shouldGoldPrefix(sid)') && tsSrc.includes('TitleCipher.encodeGoldPrefix'));
  assert.ok(ttSrc.includes('const selectivePrefixOnly = !force && Prefs.autoTitle === false;'));
});
