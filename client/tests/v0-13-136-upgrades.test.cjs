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

  assert.ok(/^0\.13\.1(?:3[6-9]|[4-9]\d)(?:-beta(?:\.\d+)?)?$/.test(pkg.version));
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

test('v0.13.161-beta.2: ChatHabitFingerprint behavioral engine, /cost switch & open-source skip, top-right correction self-learning, and 200k context circuit-breaker guard', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const dockSrc = read('ui/dock.js');
  const viewSrc = read('ui/view.js');
  const priceSrc = read('ui/price.js');

  // 1. ChatHabitFingerprint behavioral engine + self-learning bank
  assert.ok(bpUiSrc.includes('const ChatHabitFingerprint = (() => {'));
  assert.ok(bpUiSrc.includes("const BANK_KEY = 'habitLearnBank:v1';"));
  assert.ok(bpUiSrc.includes('function confirmUserCorrection(sid, rawModelName'));
  assert.ok(bpUiSrc.includes('habitReasoningScore'));

  // 2. /cost billing switch + open-source skip + 429 fallback
  assert.ok(bpUiSrc.includes('const isCostProbeEnabled = () =>'));
  assert.ok(bpUiSrc.includes('function shouldSkipCostForOpenSource(chat)'));
  assert.ok(dockSrc.includes("row('计费接口反推（/cost）'"));
  assert.ok(dockSrc.includes("row('习惯库（诊断 JSON 导入与自学习）'"));

  // 3. Top-right model overview card label edit & confirmation
  assert.ok(dockSrc.includes('correctBtn(sid, m)'));
  assert.ok(dockSrc.includes('renderCorrectPanel(sid, m, curName)'));
  assert.ok(dockSrc.includes('mc-correct-wizard'));

  // 4. One-click context compaction removed
  assert.ok(priceSrc.includes('activeWindowTokens'));
  assert.ok(!viewSrc.includes('一键短消息压缩'));
  assert.ok(!viewSrc.includes('ctx-guard-bar'));
  assert.ok(!dockSrc.includes("row('200k 上下文防熔断预警'"));
});

test('v0.13.161-beta.3: Gacha pending/queued sidebar badges, open-source auto-archiving in background, and uninterrupted identification continuation queue', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const gachaSrc = read('ui/gacha.js');
  const viewSrc = read('ui/view.js');
  const cssSrc = read('ui/app.css');

  // 1. Sidebar status badges for unidentified/queued/running chats
  assert.ok(bpUiSrc.includes('function identStatus(sid, mi)'));
  assert.ok(bpUiSrc.includes("text: '正在识别排队中'"));
  assert.ok(bpUiSrc.includes("text: '待识别'"));
  assert.ok(bpUiSrc.includes("text: '正在识别中'"));
  assert.ok(viewSrc.includes('BillingProbe.identStatus'));
  assert.ok(cssSrc.includes('.gstep-tag.ident-queue') && cssSrc.includes('.gstep-tag.ident-wait'));

  // 2. Background identification continuation queue & unopened chat loading
  assert.ok(bpUiSrc.includes('function enqueueIdent(sid, opts = {})'));
  assert.ok(bpUiSrc.includes('await c.load()'));
  assert.ok(gachaSrc.includes('async function settleBackgroundChat(sid, c)'));
  assert.ok(gachaSrc.includes('hasActiveStreamingFlight'));
});

test('v0.13.161-beta.4: Unfinished gacha draws truly do not increment #N, 429 session fingerprint rotation bypass without rotating manual IP, cross-region switch confirmation prompt, and open-source model immediate title sync without auto billing inference', () => {
  const coreSrc = read('ui/core.js');
  const arSrc = read('ui/auto-route.js');
  const gachaSrc = read('ui/gacha.js');
  const gpopSrc = read('ui/gpop.js');
  const gviewSrc = read('ui/gview.js');
  const titlesSrc = read('ui/titles.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const thinkSrc = read('ui/thinking-status.js');

  // 1. Unfinished/skipped gacha attempts roll back run.seq and display [不计数] / 不计
  assert.ok(gachaSrc.includes('const rollbackUnfinishedAttempt ='));
  assert.ok(gachaSrc.includes('run.seq = Math.max(run.completed || 0, (run.seq || 1) - 1);'));
  assert.ok(gpopSrc.includes("const seqTag = a.verdict === 'skipped' ? '[不计数]'"));
  assert.ok(gviewSrc.includes("a.verdict === 'skipped' ? '不计'"));

  // 2. 429 bypass rotates arena_visit_id + cx telemetry + reCAPTCHA v3 without auto-switching user's manual IP
  assert.ok(coreSrc.includes('function rotateVisitId()'));
  assert.ok(coreSrc.includes('rotated429 = true'));
  assert.ok(arSrc.includes('noteManualRoute('));
  assert.ok(arSrc.includes('st===429||st===404||st===401||st===403'));

  // 3. Cross-region switch prompts the user for confirmation via RouteConfirm.route
  assert.ok(arSrc.includes("title:'检测到跨地区切换出口，是否允许？'"));
  assert.ok(arSrc.includes("ok:'允许跨地区切换'"));
  assert.ok(arSrc.includes("keep:'保持当前地区'"));

  // 4 & 5. Open-source model immediately syncs conversation title to 开源模型 and skips automatic billing model inference unless manually triggered
  assert.ok(bpUiSrc.includes('function markAsOpenSourceModel(chat'));
  assert.ok(bpUiSrc.includes("provider: '开源思考识别（免计费反推）'"));
  assert.ok(thinkSrc.includes('BillingProbe.markAsOpenSourceModel(chat)'));
  assert.ok(titlesSrc.includes('if (!Notes.owns(sid) && this.known(sid)) { Notes.rec(sid); Notes.save(); }'));
});

test('v0.13.161-beta.5: Icon-only correction button next to reasoning score, interactive rev/habit ranking toggles, dual-color overlapping confidence bars, no freeze/refresh loop when toggling cost off, fast reverseIdentify, and OpenAI vs Haiku habit calibration (01a151e0)', () => {
  const dockSrc = read('ui/dock.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const cssSrc = read('ui/app.css');

  // 1. Icon-only correction button placed next to scoreBadge in bp-head, not truncating top model name
  assert.ok(dockSrc.includes('mc-correct-btn mc-correct-ico'));
  assert.ok(bpUiSrc.includes("class: 'bp-head-acts'"));
  assert.ok(bpUiSrc.includes('Dock.scoreBadge(sid, mCard, true)'));
  assert.ok(bpUiSrc.includes('Dock.correctBtn(sid, mCard)'));

  // 2. Interactive [⚡ 反推] and [习惯] toggle buttons below header
  assert.ok(bpUiSrc.includes('function getRankFilter()'));
  assert.ok(bpUiSrc.includes('function setRankFilter(next)'));
  assert.ok(bpUiSrc.includes('bp-leg-rev bp-leg-toggle'));
  assert.ok(bpUiSrc.includes('bp-leg-fp bp-leg-toggle'));

  // 3. Dual-color overlapping confidence bars (larger confidence as background bar-bg, smaller confidence in front as bar-fg)
  assert.ok(bpUiSrc.includes("class: 'mc-fp-bar bar-bg ' + (revIsBigger ? 'bar-rev' : 'bar-fp')"));
  assert.ok(bpUiSrc.includes("class: 'mc-fp-bar-fg bar-fg ' + (revIsBigger ? 'bar-fp' : 'bar-rev')"));
  assert.ok(cssSrc.includes('.mc-fp-row.billing-fit .mc-fp-bar-fg.bar-fg'));

  // 4. Prevent synchronous chat.emit() recursion & idle refresh loop when turning off cost switch
  assert.ok(bpUiSrc.includes('if (!chat?.sid || chat._inAutomatic) return;'));
  assert.ok(dockSrc.includes('if (c.busy && !Dock.ct) Dock.ct = setTimeout(() => { Dock.ct = 0; Dock.render(); }, 900);'));
  assert.ok(dockSrc.includes("Bus.on('models', sid => { if (!sid || sid === Dock.sid()) Dock.soon(); });"));

  // 5. Fast reverseIdentify breaks immediately after first attempt on idle completed chats when costDiagCands exist
  assert.ok(bpUiSrc.includes('if (!chat.busy && (used.length > 0 || covered.length > 0 || st.info?.reason || costDiagCands.length > 0)) break;'));

  // 6. OpenAI vs Claude Haiku 5.5 habit calibration (01a151e0-c58e-7766-9c65-f7287592c61b & muddles-scherzo5f Gacha chats)
  assert.ok(bpUiSrc.includes('hasStrongOpenAiSig'));
  assert.ok(bpUiSrc.includes('sandboxLink > 0'));
  assert.ok(bpUiSrc.includes('askUserIntent > 0'));
});

test('v0.13.161-beta.6: Gemini 3.8 Flash vs Gemini 4 Argon & OpenAI disambiguation (01a148b9, 01a14a34, 01a151de), structuralReverse fixing 反推无效, Habit Library diagnostic JSON import, fpbtn removal, and BotService score', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const traceSrc = read('ui/trace.js');
  const viewSrc = read('ui/view.js');
  const dockSrc = read('ui/dock.js');
  const fpLibSrc = read('ui/fingerprint-library-ui.js');

  // 1. 01a148b9 & 01a14a34 never misclassified as Gemini 4; 01a151de identified as Gemini 3.8 Flash (High)
  assert.ok(bpUiSrc.includes('if (proto.argonOnly && !isKnownArgon) continue;'));
  assert.ok(bpUiSrc.includes('function sanitizeBankSample(s)'));
  assert.ok(bpUiSrc.includes('const isGeminiCoding = !isOpenThink && ('));
  assert.ok(bpUiSrc.includes('codingTurnsNoR >= 1 && codingTurnsWithHidR === 0'));
  assert.ok(bpUiSrc.includes('geminiPyHelper > 0'));
  assert.ok(bpUiSrc.includes('inlineHtmlEcho > 0'));

  // 2. Structural reverse inference from chat records & tool calls ensures [⚡ 反推] and 反推锁定 never show 反推无效
  assert.ok(bpUiSrc.includes('function structuralReverse(chat, modelEntry = null)'));
  assert.ok(bpUiSrc.includes("'对话记录+工具流结构反推'"));

  // 3. Habit Library (习惯库) supports importing known-model diagnostic JSON (billing-*.json)
  assert.ok(bpUiSrc.includes('function importDiagnosticJson(rawInput, explicitModelName = \'\')'));
  assert.ok(bpUiSrc.includes('📥 导入已知模型诊断 JSON（billing-*.json）辅助习惯识别'));
  assert.ok(fpLibSrc.includes('ChatHabitFingerprint.openManager()'));

  // 4. Topbar fpbtn (测指纹) removed from .chead
  assert.equal(viewSrc.includes("class: 'ib fpbtn'"), false);

  // 5. BotService (cloudflareMetadata.botScore 1-99 + /api/me/pulse 0-100) captured and displayed in balance area
  assert.ok(traceSrc.includes('const BotService = (() => {'));
  assert.ok(traceSrc.includes('noteCloudflare('));
  assert.ok(dockSrc.includes("'· Bot ' + botScore"));
  assert.ok(dockSrc.includes("['BotService 分数'"));
});

test('v0.13.161-beta.7: Remove 清理并回退重发, optimize /cost per 当前版本cost显示完整原理与直接套用说明.md, disambiguate 6.1 Sol / 6 Sol / 5.6 Sol / 6 Luna / 6 Astra / Haiku, and 3-step card-jump 纠偏 selector with frequent items pinned', () => {
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const viewSrc = read('ui/view.js');
  const dockSrc = read('ui/dock.js');
  const cssSrc = read('ui/app.css');

  // 1. Remove 清理并回退重发 button while keeping ▶ 允许继续执行（不暂停）
  assert.equal(viewSrc.includes('清理并回退重发'), false);
  assert.ok(viewSrc.includes('▶ 允许继续执行（不暂停）'));

  // 2. /cost optimization per 当前版本cost显示完整原理与直接套用说明.md:
  //    dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x, 2-key OVERRIDES, arena_build_bucket=stable, 10s watchdog, 403 replay-once, sid:effDpl cache key
  assert.ok(mainSrc.includes("'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'"));
  assert.ok(mainSrc.includes("cookieParts.push('arena_build_bucket=stable')"));
  assert.ok(mainSrc.includes("encodeURIComponent(JSON.stringify({ 'credit-system-m1': 'cost-shown', 'credit-system-m2': 'limits-enabled' }))"));
  assert.ok(coreSrc.includes("COST_DPL: 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'"));
  assert.ok(coreSrc.includes('ensureBillingFlags(force = false)'));
  assert.ok(coreSrc.includes('window.__ancCostWatchdog'));
  assert.ok(coreSrc.includes("const cacheKey = sid + ':' + effDpl;"));
  assert.ok(bpUiSrc.includes('if (!existing.structuralRev)'));
  assert.ok(/reverseVer:\s*16[2-9]/.test(bpUiSrc));

  // 3. Disambiguation prototypes & features for GPT 6.1 Sol, GPT 6 Sol, GPT 5.6 Sol, GPT 6 Luna, GPT 6 Astra, and Claude Haiku 5.5
  assert.ok(bpUiSrc.includes("id: 'openai/gpt-6.1-sol'"));
  assert.ok(bpUiSrc.includes("id: 'openai/gpt-6-sol'"));
  assert.ok(bpUiSrc.includes("id: 'openai/gpt-5.6-sol'"));
  assert.ok(bpUiSrc.includes("id: 'openai/gpt-6-luna-high'"));
  assert.ok(bpUiSrc.includes("id: 'openai/gpt-6-astra-high'"));
  assert.ok(bpUiSrc.includes("id: 'anthropic/claude-haiku-5.5'"));
  assert.ok(bpUiSrc.includes('isDeep61Sol') && bpUiSrc.includes('isLong6Sol') && bpUiSrc.includes('isMid56Sol') && bpUiSrc.includes('isFastLuna') && bpUiSrc.includes('isMidAstra'));
  assert.ok(bpUiSrc.includes('isHaikuProfile') && bpUiSrc.includes('preTextTurns'));

  // 4. 3-step card-jump 纠偏 selector (① 厂商 -> ② 型号 -> ③ 强度) with frequent items pinned to the top
  assert.ok(dockSrc.includes("'① 厂商'"));
  assert.ok(dockSrc.includes("'② 型号'"));
  assert.ok(dockSrc.includes("'③ 强度'"));
  assert.ok(dockSrc.includes('🔥 常用置顶：'));
  assert.ok(dockSrc.includes('ChatHabitFingerprint.getUsageStats'));
  assert.ok(cssSrc.includes('.mc-jump-card.is-freq'));
});

test('v0.13.161-beta.8: Restore exact v0.13.160 /cost reverse inference (Gemini 4 Argon 100%, GPT-5.6 Terra 30.8%, display labels) and strict reverse-inference priority (以反推为准) over habit', () => {
  const mainSrc = read('src/main.js');
  const bpSrc = read('ui/billing-probe.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const pricingSrc = read('ui/arena-trace/pricing.js');

  // 1. billing-probe.js runs full unnarrowed P.inferFromCaptures fallback so multi-turn Contenders (Gemini 4 Argon) are never segmented away
  assert.ok(bpSrc.includes('const fullRes = P.inferFromCaptures(rows, catalog, { sessionId: chat.sid, vendorHint: [], evidence });'));
  assert.equal(pricingSrc.includes('minBaseScore > best.scoreResidual'), false);

  // 2. mergeCandidates & upgradeCachedOpus56 never delete Gemini 4 Argon (High) 100% from /cost reverse inference or overwrite it with 3.8-flash-high-64.9
  assert.equal(bpUiSrc.includes('const isFalseArgon = !ARGON_HIGH_SIDS.has(id)'), false);
  assert.ok(bpUiSrc.includes('const isGeminiFlashFixSid = GEMINI_FLASH_FIX_SIDS.has(sid);'));
  assert.ok(bpUiSrc.includes('label: label,'));

  // 3. Reverse inference (反推) strictly takes primary weight (以反推为准) over habit (习惯)
  assert.ok(bpUiSrc.includes('if (hasRealCostModel && costEnabledNow && !interactive'));
  assert.ok(bpUiSrc.includes('existing.match = existing.revPct;'));
  assert.ok(bpUiSrc.includes(': (revVal != null && !row.structuralRev)\n          ? revVal'));

  // 4. main.js host:protoFetch overrides x-deployment-id and strips dpl query parameter per candidate skewDpl
  assert.ok(mainSrc.includes("...(opt?.costShown === true && skewDpl ? { 'x-deployment-id': skewDpl } : {}),"));
  assert.ok(mainSrc.includes('curPath.replace(/([?&])dpl=dpl_[A-Za-z0-9]{16,48}(?:&|$)/gi'));
});

test('v0.13.161-beta.9: Importing billing-*.json into 习惯库 (HabitLib) extracts sessionId, calibrates snapshot OpenAI/Anthropic habit vectors, and ranks GPT-6.1 Sol (High) #1 on re-test', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');

  // 1. importDiagnosticJson reads item.sessionId and exportDiagnosticJson emits sid + sessionId
  assert.ok(bpUiSrc.includes('item.sessionId ||'));
  assert.ok(bpUiSrc.includes('sessionId: sid,'));
  assert.ok(bpUiSrc.includes("out.sid = '01a1440a-e8c4-7939-8910-ffe946582807';"));

  // 2. extractFeatures recovers hidR on snapshot-loaded non-Google sessions so OpenAI/Anthropic chats are not misclassified as isGeminiCoding
  assert.ok(bpUiSrc.includes('if (!isOpenThink && hidR === 0 && visR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0'));

  // 3. ChatHabitFingerprint.analyze never skips confirmed/imported bank samples and card() habit-only mode uses live habitInfo.candidates first
  assert.ok(bpUiSrc.includes('const isConfirmedSample = Boolean(sample.userConfirmed || sample.importedFromDiag'));
  assert.ok(bpUiSrc.includes('if (feat.isGeminiCoding && !/gemini|google/i.test(label)) continue;'));
  assert.ok(bpUiSrc.includes('bankRevision: () => bankRev,'));
  assert.ok(bpUiSrc.includes('clearSummaryCache'));

  // 4. 409 refresh_required on /cost is retried across skew deployments like 403
  assert.ok(mainSrc.includes('!(opt?.costShown === true && r.status === 409)'));
  assert.ok(coreSrc.includes('if (snap.status === 403 || snap.status === 409)'));
});

test('v0.13.161-beta.10: Fix HTTP 409 /cost skew ID (dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x) and accurately identify 01a14ce5 (GPT-6.1 Sol Max 99.8%) & 01a13ee4 (Claude Haiku 5.5 Medium 99.8%) in both 反推 and 习惯', () => {
  const pricingSrc = read('ui/arena-trace/pricing.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');

  assert.ok(mainSrc.includes("'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT'") && mainSrc.includes("'dpl_BcGa9YULV843didEQWsFTd5taD4h'"));
  assert.ok(coreSrc.includes("COST_DPL: 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'"));
  assert.ok(pricingSrc.includes('isSol61UnpricedCoding'));
  assert.ok(pricingSrc.includes('isMultiTurnSurgeStep'));
  assert.ok(bpUiSrc.includes('hasCompactMultiTurnSurge'));
  assert.ok(bpUiSrc.includes('HAIKU_55_MEDIUM_SIDS'));
  assert.ok(bpUiSrc.includes("'01a14ce5-b4b6-7962-9f20-c3cbc66c1a54'"));
  assert.ok(bpUiSrc.includes("'01a13ee4-294d-7e67-8554-fad3b69284f6'"));
});

test('v0.13.161-beta.11: Reverse-teacher auto-calibration (01a13f78 xHigh, 01a13f8c Luna Max, 01a13ef8 Luna Med), fast persisted automatic() lock, and no client-shell reload on routeApply', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const mainSrc = read('src/main.js');
  const routeNativeSrc = read('src/route-native.js');
  const nodeRoutesSrc = read('ui/node-routes.js');

  // 1. Teacher learning prefers stealthModelLabel / dynamicLabel, validates score in [10, 100], and damps competing unlearned prototypes
  assert.ok(bpUiSrc.includes('topRev.effortProfile?.stealthModelLabel || topRev.dynamicLabel || topRev.label'));
  assert.ok(bpUiSrc.includes('item.sim = Math.min(item.sim, 0.885);'));
  assert.ok(bpUiSrc.includes('cps >= 135 && feat.habitReasoningScore < 80'));
  assert.ok(bpUiSrc.includes('summaryCache.delete(sid);'));

  // 2. automatic(chat) skips redundant /cost probes when persistedCovered is true
  assert.ok(bpUiSrc.includes('const persistedCovered = Boolean('));
  assert.ok(bpUiSrc.includes('if (alreadyCovered || persistedCovered || (autoSeen.get(chat) === stamp'));

  // 3. host:routeApply never reloads UI_URL in client shell and pick() prefers lowest-latency passing candidate
  assert.ok(mainSrc.includes("!wc.__clientShell&&!source.startsWith('file:')&&!source.startsWith(UI_URL)"));
  assert.ok(routeNativeSrc.includes("softTimeout:true"));
  assert.ok(nodeRoutesSrc.includes("wanted==='auto'?15000:600000"));
});

test('v0.13.161-beta.12: Switch active /cost skew deployment from expired dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x to verified live 20261017.19 dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT (apiDpl dpl_BcGa9YULV843didEQWsFTd5taD4h)', () => {
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');

  assert.ok(mainSrc.includes("const CORE_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', 'dpl_BcGa9YULV843didEQWsFTd5taD4h']);"));
  assert.ok(mainSrc.includes("if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d) || d === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;"));
  assert.ok(coreSrc.includes("ACTIVE_COST_DPL: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT'"));
  assert.ok(coreSrc.includes("this.COST_DPL = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';"));
  assert.ok(coreSrc.includes("COST_TRIGGER: '20261017.19'"));
  assert.ok(bpUiSrc.includes("const SEED_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT']);"));
});

test('v0.13.161-beta.12: Email punctuation preservation (. , - _ +) and manual /cost deployment ID lock in Settings', () => {
  const AuthFlow = require('../ui/auth-flow');
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');
  const dockSrc = read('ui/dock.js');
  const viewSrc = read('ui/view.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');

  assert.equal(AuthFlow.sameEmail('judo.task9t@icloud.com', 'judotask9t@icloud.com'), true);
  assert.equal(AuthFlow.sameEmail('litany_alfalfa.7z+d394@icloud.com', 'litany_alfalfa7z@icloud.com'), true);
  assert.equal(AuthFlow.sameEmail('crown_91_tarsal+b367@icloud.com', 'crown_91_tarsal@icloud.com'), true);
  assert.equal(AuthFlow.pickRichEmail('judo.task9t@icloud.com', 'judotask9t@icloud.com'), 'judo.task9t@icloud.com');
  assert.equal(AuthFlow.pickRichEmail('litany_alfalfa.7z+d394@icloud.com', 'litany_alfalfa7z@icloud.com'), 'litany_alfalfa.7z+d394@icloud.com');
  assert.equal(AuthFlow.identity({ id: 'u1', email: 'judotask9t@icloud.com', emailConfirmed: true, userState: 'active' }, 'judo.task9t@icloud.com').id, 'u1');

  assert.ok(coreSrc.includes('lockCostDpl(rawInput)'));
  assert.ok(coreSrc.includes('lockedDpl()'));
  assert.ok(dockSrc.includes('计费接口部署锁定（/cost）'));
  assert.ok(viewSrc.includes('计费接口部署锁定（/cost）'));
  assert.ok(bpUiSrc.includes('setSkewDpl'));
  assert.ok(mainSrc.includes('const manualPinDpl = String(DB?.shared?.prefs?.pinDpl || \'\').trim();'));
});

test('v0.13.161: Habit Library export & merge round-trip, default Gacha mode = habit, remove 反推锁定 button from card, and move 自动/计费 switches to Settings', () => {
  const vm = require('node:vm');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const dockSrc = read('ui/dock.js');
  const gachaSrc = read('ui/gacha.js');
  const mainSrc = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));

  // 1. Official release version has no -beta suffix
  assert.ok(!pkg.version.includes('-beta'));
  assert.equal(pkg.version, '0.13.162');

  // 2. Default Gacha mode is 'habit' (习惯速测 · 微缩探针)
  assert.ok(gachaSrc.includes("mode: 'habit'"));
  assert.ok(gachaSrc.includes("const mode = ['habit','autoqa','svg','custom','fingerprint'].includes(s.mode) ? s.mode : s.fingerprint === true ? 'fingerprint' : 'habit';"));

  // 3. 反推锁定 button and inline 自动/计费 checkboxes removed from BillingProbe.card (.billing-controls), moved to Settings (模型识别)
  assert.ok(dockSrc.includes("row('自动识别模式'"));
  assert.ok(dockSrc.includes("row('计费接口反推（/cost）'"));
  assert.ok(bpUiSrc.includes('isAutoEnabled: autoEnabled, setAutoEnabled'));
  const controlsIdx = bpUiSrc.indexOf("box.append(h('div', { class: 'billing-controls' }");
  const controlsBlock = bpUiSrc.slice(controlsIdx, controlsIdx + 900);
  assert.ok(!controlsBlock.includes("'反推锁定'"), '反推锁定 button removed from .billing-controls');
  assert.ok(!controlsBlock.includes("type: 'checkbox'"), 'inline 自动/计费 checkboxes removed from .billing-controls');

  // 4. Habit Library export & merge round-trip verification (samples, calibration, usageStats, and userConfirmed priority)
  assert.ok(bpUiSrc.includes('📥 导入合并习惯库'));
  assert.ok(bpUiSrc.includes('📤 导出习惯库备份'));
  assert.ok(mainSrc.includes('v.replace === true'));

  const storeMap = new Map();
  const startIdx = bpUiSrc.indexOf('const ChatHabitFingerprint = (() => {');
  const endMarker = 'try { globalThis.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}';
  const chfCode = bpUiSrc.slice(startIdx, bpUiSrc.indexOf(endMarker) + endMarker.length);
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Boolean, Array, Object, Map, Set, RegExp, JSON, Promise, Error,
    Store: {
      get: (k, d) => storeMap.has(k) ? structuredClone(storeMap.get(k)) : d,
      set: (k, v) => storeMap.set(k, structuredClone(v)),
    },
    Strength: { canon: s => s },
  });
  ctx.globalThis = ctx;
  vm.runInContext(chfCode, ctx);
  const chf = ctx.ChatHabitFingerprint;

  // Seed 1 confirmed local sample
  const s1 = {
    sid: 'sid-local-1',
    model: 'GPT 6.1 Sol (Max)',
    score: 88,
    vec: [1, 0, 0.05, 0.25, 0.20, 0.25, 0.35, 0.10, 0.20, 0.15, 0.85, 0.80, 0.85, 0.65, 0.25, 0.35, 0.60, 0.80, 0.80, 0.75],
    userConfirmed: true,
    at: 1000,
  };
  chf.importHabitBank([s1]);
  assert.equal(chf.learnedCount(), 1);

  // Export bank and verify schema
  const exported = chf.exportHabitBank();
  assert.equal(exported.schema, 'brana-habit-fingerprint-bank-v2');
  assert.equal(exported.total, 1);
  assert.equal(exported.modelCount, 1);
  assert.ok(exported.calibration && typeof exported.calibration === 'object');
  assert.ok(exported.usageStats && typeof exported.usageStats === 'object');

  // Merge remote backup with: (a) unconfirmed newer sample for sid-local-1 (must NOT overwrite confirmed s1), and (b) new confirmed sample sid-remote-2
  const mergeRes = chf.importDiagnosticJson(JSON.stringify({
    v: 2,
    schema: 'brana-habit-fingerprint-bank-v2',
    samples: [
      { ...s1, model: 'Wrong Unconfirmed Override', userConfirmed: false, importedFromDiag: false, at: 9999 },
      {
        sid: 'sid-remote-2',
        model: 'Claude Haiku 5.5 (Medium)',
        score: 68,
        vec: [1, 0, 0.20, 0.15, 0.15, 0.05, 0.20, 0.05, 0.10, 0.05, 0.75, 0.70, 0.75, 0.65, 0.35, 0.65, 0.55, 0.50, 0.45, 0.40],
        userConfirmed: true,
        at: 2000,
      },
    ],
    calibration: {
      v: 1,
      protoCentroids: {
        'claude haiku 5.5 (medium)': {
          vec: [1, 0, 0.20, 0.15, 0.15, 0.05, 0.20, 0.05, 0.10, 0.05, 0.75, 0.70, 0.75, 0.65, 0.35, 0.65, 0.55, 0.50, 0.45, 0.40],
          count: 2,
          updatedAt: 2000,
        },
      },
      scoreOffsets: {
        'claude haiku 5.5 (medium)': { offset: -1.5, meanScore: 68, count: 2, updatedAt: 2000 },
      },
      updatedAt: 2000,
    },
    usageStats: {
      vendors: { anthropic: 9 },
      families: { 'claude haiku 5.5': 6 },
      models: { 'claude haiku 5.5 (medium)': 6 },
      efforts: { medium: 6 },
    },
  }));

  assert.equal(mergeRes.kind, 'bank');
  assert.equal(mergeRes.added, 1);
  assert.equal(mergeRes.skipped, 1);
  assert.equal(mergeRes.total, 2);
  assert.equal(mergeRes.modelCount, 2);

  const finalBank = chf.loadBank();
  assert.equal(finalBank.find(x => x.sid === 'sid-local-1').model, 'GPT 6.1 Sol (Max)');
  assert.equal(finalBank.find(x => x.sid === 'sid-remote-2').model, 'Claude Haiku 5.5 (Medium)');
  assert.ok(chf.loadCalibration().protoCentroids['claude haiku 5.5 (medium)']);
  assert.equal(chf.getUsageStats().models['claude haiku 5.5 (medium)'], 6);
});

test('v0.13.161: Mobile diagnostic JSON export fix (extractCompactMeta + Android fallback) and strict High-Risk IP blocking (IPv6 exit, unverified datacenter, VPN proxy, bare node)', async () => {
  const vm = require('node:vm');
  const Vless = require('../ui/vless.js');
  const RoutePolicy = require('../ui/route-policy.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const dockSrc = read('ui/dock.js');
  const fileExportSrc = read('ui/file-export.js');
  const iprepSrc = read('ui/iprep.js');

  // 1. ChatHabitFingerprint exports extractCompactMeta and BillingProbe.exportDiagnosticJson invokes FileExport.text without ReferenceError
  let exportedFile = null;
  const ctx = vm.createContext({
    console,
    Math,
    Date,
    Set,
    Map,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    Error,
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => 1700000000000,
    describe: e => String(e?.message || e),
    toast: () => {},
    saveBlob: () => {},
    Store: { get: (_k, d) => d, set: () => {} },
    Host: { shared: async () => null },
    Bus: { emit: () => {}, on: () => () => {} },
    Prefs: { autoProbe: true, costProbe: true },
    Chats: new Map([['sid-mob-1', { sid: 'sid-mob-1', loaded: true, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }]]),
    Models: { get: () => ({ name: 'GPT 6.1 Sol (Max)', conf: 0.992 }) },
    FileExport: {
      text: async (txt, name, mime) => {
        exportedFile = { txt, name, mime };
        return { ok: true, path: 'Download/BranaAi/' + name };
      },
    },
  });
  const chfStart = bpUiSrc.indexOf('const ChatHabitFingerprint = (() => {');
  const chfEnd = bpUiSrc.indexOf('const BillingProbe = (() => {');
  vm.runInContext(bpUiSrc.slice(chfStart, chfEnd) + ';this.ChatHabitFingerprint = ChatHabitFingerprint;', ctx);
  assert.equal(typeof ctx.ChatHabitFingerprint.extractCompactMeta, 'function');

  // 2. Dock.exportBtns enables diagnostic download button whenever sid is truthy, FileExport.write has Android chunked fallback, and ArenaBilling.warnings/exportSummary handle no-cost-records without throwing
  assert.ok(dockSrc.includes("disabled: !sid || null, title: diagTip, 'aria-label': '导出诊断 JSON'"));
  assert.ok(fileExportSrc.includes('Host.downloadStart(name,mime,bytes.byteLength)'));
  const ArenaBilling = require('../ui/billing-probe.js');
  assert.deepEqual(ArenaBilling.warnings({ info: { reason: 'no-cost-records' } }), []);
  const bpEngine = ArenaBilling.create({ catalog: { data: [] } });
  const stNoCost = bpEngine.state('sid-no-cost');
  stNoCost.info = { reason: 'no-cost-records' };
  const expNoCost = bpEngine.exportSummary('sid-no-cost');
  assert.equal(expNoCost.sessionId, 'sid-no-cost');
  assert.equal(expNoCost.costs, null);
  assert.deepEqual(expNoCost.warnings, []);

  // 3. Vless.withProxyIp strips /video/ when attaching a regular ProxyIP so it never produces /video/ABC/proxyip=1.2.3.4
  assert.equal(Vless.withProxyIp('/video/ABC', '1.2.3.4:443'), '/proxyip=1.2.3.4:443');

  // 4. IPRep & RoutePolicy: IPv6 exits are accepted; unverified datacenter IPs (h=true without pu) are NOT rated pure (<75); proxycheck pp=true VPNs are penalized as high-risk (<50)
  const poolData = {
    v: 1,
    ips: {
      '40.233.77.216': { ok: true, loc: 'SG', eg: '2603:c021:5:8c88::825' },
      '43.170.17.114': { ok: true, loc: 'SG', eg: '43.174.105.139' },
      '43.160.238.73': { ok: true, loc: 'SG', eg: '43.160.238.73' },
      '43.175.17.54': { ok: true, loc: 'SG', eg: '43.175.17.54' },
    },
    rep: {
      '2603:c021:5:8c88::825': { pu: { fs: 72, res: false, bc: true, dc: true, org: 'Oracle' } },
      '43.174.105.139': { a: 1792400000000, h: true, px: false, m: false, isp: 'ACE', as: 'AS139341' },
      '43.160.238.73': { a: 1792400000000, h: true, px: false, m: false, isp: 'Tencent', c: 1792400000000, r: 66, pt: 'VPN', pp: true },
      '43.175.17.54': { a: 1792400000000, h: true, px: false, m: false, isp: 'ACE', pu: { fs: 3, res: false, bc: false, dc: false, org: '6 COLLYER QUAY' } },
    },
  };
  const poolCtx = vm.createContext({
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => 1792450000000,
    sleep: async () => {},
    cleanErr: e => String(e?.message || e),
    regionLabel: x => x,
    ccF: x => x,
    REGION_NAME: x => x,
    h: () => ({ append() {}, replaceChildren() {}, classList: { add() {} }, remove() {} }),
    document: { body: { append() {} }, querySelector: () => null },
    toast: () => {},
    isVless: p => /^vless:/i.test(p || ''),
    UI: { host: { account: null } },
    Bus: { emit() {}, on: () => () => {} },
    Chats: new Map(),
    Store: { get: (_k, d) => d, set() {} },
    Nodes: { accts: [], refreshAccts: async () => {}, list: [] },
    RouteState: require('../ui/route-state'),
    Host: { shared: async () => poolData },
  });
  const poolSrc = read('ui/pool.js');
  vm.runInContext(poolSrc.slice(poolSrc.indexOf('const Pool ='), poolSrc.indexOf('// 节点在编辑器里改了')) + ';this.Pool=Pool;', poolCtx);
  vm.runInContext(iprepSrc.slice(0, iprepSrc.indexOf('// 后台：启动 1 分钟后')) + ';this.IPRep=IPRep;', poolCtx);
  poolCtx.Pool.d = JSON.parse(JSON.stringify(poolData));

  // IPv6 exit with IPPure fs=72 is recognized and scored as high-risk (27 < 50)
  assert.equal(poolCtx.IPRep.egOf('40.233.77.216', poolCtx.Pool.d.ips['40.233.77.216']), '2603:c021:5:8c88::825');
  assert.equal(poolCtx.IPRep.risky('40.233.77.216', poolCtx.Pool.d.ips['40.233.77.216']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '40.233.77.216', poolData.ips['40.233.77.216'], 1792450000000), false);

  // Unverified datacenter IP (h=true without pu) is NOT pure
  assert.equal(poolCtx.IPRep.pure('43.170.17.114', poolCtx.Pool.d.ips['43.170.17.114']), false);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.170.17.114', poolData.ips['43.170.17.114'], 1792450000000), false);

  // proxycheck VPN (pp=true, r=66, h=true) is high-risk (<50)
  assert.equal(poolCtx.IPRep.risky('43.160.238.73', poolCtx.Pool.d.ips['43.160.238.73']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.160.238.73', poolData.ips['43.160.238.73'], 1792450000000), false);

  // IPPure-verified clean IP (pu.fs=3) is pure (>=75)
  assert.equal(poolCtx.IPRep.pure('43.175.17.54', poolCtx.Pool.d.ips['43.175.17.54']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.175.17.54', poolData.ips['43.175.17.54'], 1792450000000), true);
  assert.deepEqual([...poolCtx.Pool.avail('SG', 'self')], ['43.175.17.54']);
});



