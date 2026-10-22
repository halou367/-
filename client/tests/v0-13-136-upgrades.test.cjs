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

  assert.ok(/^0\.13\.1(?:3[6-9]|[4-9]\d)(?:-beta(?:\.?\d+)?)?$/.test(pkg.version));
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
  assert.ok(gvSrc.includes('if (kw.length) { for (const r of rows) if (!r.hit && !Fav.has(r.e.id)) r.vip = false; }'));

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
  assert.ok(bpUiSrc.includes('if (proto.argonOnly && !isKnownArgon'));
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

  // 4. 3-row wheel 纠偏 selector (① 厂商 -> ② 型号 -> ③ 强度) with vendor Logos and color-highlighted frequent items + mobile touch wave slide
  assert.ok(dockSrc.includes('① 厂商 -> ② 型号 -> ③ 强度'));
  assert.ok(dockSrc.includes('openCorrectWheel'));
  assert.ok(dockSrc.includes('mc-wheel-row'));
  assert.ok(dockSrc.includes('startDrag'));
  assert.ok(dockSrc.includes('上下推动 · 松开选中'));
  assert.ok(dockSrc.includes('ChatHabitFingerprint.getUsageStats'));
  assert.ok(cssSrc.includes('.mc-jump-card.is-freq'));
  assert.ok(cssSrc.includes('.rv.mc-rv.is-interactive'));
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
  assert.ok(bpUiSrc.includes(': existing.revPct;'));
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

  // 1. Version follows 0.13.16x series
  assert.ok(/^0\.13\.16\d/.test(pkg.version));

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
  // proxycheck pp=true VPN is penalized as high-risk (<50)
  assert.equal(poolCtx.IPRep.risky('43.160.238.73', poolCtx.Pool.d.ips['43.160.238.73']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.160.238.73', poolData.ips['43.160.238.73'], 1792450000000), false);

  // Verified IPPure fs=3 residential/clean IP is accepted
  assert.equal(poolCtx.IPRep.pure('43.175.17.54', poolCtx.Pool.d.ips['43.175.17.54']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.175.17.54', poolData.ips['43.175.17.54'], 1792450000000), true);
  assert.deepEqual([...poolCtx.Pool.avail('SG', 'self')], ['43.175.17.54']);
});

test('v0.13.161: Re-identified model name links and syncs with conversation title across encrypted cloud titles, gold prefixes, and autoTitle=false', async () => {
  const vm = require('node:vm');
  const { webcrypto } = require('node:crypto');
  const saved = new Map();
  const models = new Map();
  const entries = [
    { id: '01a15429', title: 'plain-1' },
    { id: '01a14e13', title: 'plain-2' },
  ];
  const ctx = vm.createContext({
    console,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    Uint8Array,
    Uint32Array,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    Date,
    now: () => 1792450000000,
    pad: n => String(n).padStart(2, '0'),
    describe: e => e?.message || String(e),
    toast() {},
    Store: {
      get: (k, d) => (saved.has(k) ? saved.get(k) : d),
      set: (k, v) => { saved.set(k, structuredClone(v)); return true; },
      del: k => saved.delete(k),
    },
    Bus: { on() {}, emit() {} },
    History: {
      items: entries,
      byId(id) { return this.items.find(e => e.id === id); },
      async rename(id, title) { this.byId(id).title = title; },
    },
    Models: {
      get: id => models.get(id),
      set: (id, v) => models.set(id, v),
    },
    Chats: new Map(),
    Gacha: { owns: () => false, busy: () => false },
    Strength: { canon: s => String(s || '').toLowerCase().replace(/\s*\(([^)]+)\)\s*$/, '-$1').replace(/\s+/g, '-') },
    Fingerprint: { describe: e => e.name },
    Brand: { of: s => (/claude|opus|sonnet|haiku|fable/i.test(s) ? 'anthropic' : /gpt|sol|luna|astra/i.test(s) ? 'openai' : '') },
    UI: { renderListSoon() {}, renderTabs() {} },
    Prefs: { autoTitle: false },
    document: { querySelector: () => null },
  });
  for (const [f, n] of [
    ['title-compact.js', 'TitleCompact'],
    ['title-cipher.js', 'TitleCipher'],
    ['conversation-labels.js', 'ConversationLabels'],
    ['titles.js', 'Titles'],
    ['title-sync.js', 'TitleSync'],
  ]) {
    vm.runInContext(read('ui/' + f) + `\nthis[${JSON.stringify(n)}] = ${n};`, ctx);
  }
  vm.runInContext('this.Notes = Notes;', ctx);

  // 1. Setup encrypted cloud title with old model "gpt-6-luna-high" (score 66.2)
  models.set('01a15429', { name: 'gpt-6-luna-high', reverseInferred: true, reverseScore: 66.2 });
  ctx.Notes.rec('01a15429', 1792440000000);
  await ctx.TitleSync.start();
  const oldPacket = await ctx.TitleSync.wireTitle('01a15429');
  entries[0].title = oldPacket.title;
  ctx.TitleSync.remember('01a15429', oldPacket);

  // Simulate app restart with Prefs.autoTitle = false and empty Notes.all
  delete ctx.Notes.all['01a15429'];
  await ctx.TitleSync.ingest();
  assert.match(ctx.Titles.view('01a15429').model, /^gpt-6-luna-high-66\.2分$/);

  // 2. Re-identify 01a15429 as gpt-6-luna-medium (score 67.1) while Prefs.autoTitle = false and Notes.all was populated by ingest
  models.set('01a15429', {
    name: 'gpt-6-luna-medium',
    candidateName: 'gpt-6-luna-medium',
    habitInferred: true,
    reverseInferred: true,
    billingProbe: true,
    reverseMatch: 85.7,
    reverseScore: 67.1,
    habitScore: 67.1,
  });
  ctx.Titles.local('01a15429');
  ctx.Titles.touch('01a15429');
  assert.equal(ctx.Titles.view('01a15429').model, 'gpt-6-luna-medium-67.1分');
  assert.match(entries[0].localTitle, /^gpt-6-luna-medium-67\.1分\//);

  // Even if TitleSync.ingest() runs again while cloud title still holds oldPacket.title (autoTitle=false), localTitle & view must stay gpt-6-luna-medium!
  ctx.Notes.all['01a15429'].dirty = false;
  await ctx.TitleSync.ingest();
  assert.equal(ctx.Titles.view('01a15429').model, 'gpt-6-luna-medium-67.1分');
  assert.match(entries[0].localTitle, /^gpt-6-luna-medium-67\.1分\//);

  // 3. Gold prefix title (`⟦...⟧`) must also update when model is re-identified
  const gpTitle = ctx.TitleCipher.encodeGoldPrefix('01a14e13', { fav: false, gold: true, model: 'claude-opus-5.5', score: 82.0 }, '旧标题');
  entries[1].title = gpTitle;
  models.set('01a14e13', {
    name: 'gpt-6-luna-medium',
    habitInferred: true,
    reverseInferred: true,
    reverseScore: 68.4,
  });
  ctx.Titles.local('01a14e13');
  assert.equal(ctx.Titles.view('01a14e13').model, 'gpt-6-luna-medium-68.4分');
});

test('v0.13.162: 13-point cross-module alignment (summary.ranked/top, Fmt.guess/fromReplay, rebuildChatFmtFromMessages, reconcile(0), MsgCache, History.localTitle, Side.build0, PelicanShots, AcctStats, IPRep.check)', async () => {
  const vm = require('node:vm');
  const bpuiSrc = read('ui/billing-probe-ui.js');
  const dockSrc = read('ui/dock.js');
  const fmtSrc = read('ui/fmt.js');
  const gachaSrc = read('ui/gacha.js');
  const coreSrc = read('ui/core.js');
  const gviewSrc = read('ui/gview.js');
  const viewSrc = read('ui/view.js');
  const stSrc = read('ui/sidebar-tools.js');
  const astatsSrc = read('ui/astats.js');
  const mgrSrc = read('ui/mgr.js');
  const hpSrc = read('ui/html-preview.js');
  const iprepSrc = read('ui/iprep.js');

  // 1 & 2. BillingProbe.summary exposes ranked & top, and Bar.render reads mergedCandidates?.[0]
  assert.match(bpuiSrc, /ranked:\s*Array\.isArray\(diagnostics\?\.candidates\)\s*\?\s*diagnostics\.candidates\s*:\s*\[\]/);
  assert.match(bpuiSrc, /top:\s*mergedCandidates/);
  assert.match(dockSrc, /const bpTop = bpSum\?\.mergedCandidates\?\.\[0\] \|\| bpSum\?\.top\?\.\[0\] \|\| null;/);

  // 3. Fmt.guess includes .name and supports (text, think, tools), and Fmt.fromReplay triggers ExtCompat.replayChat
  const fmtCtx = vm.createContext({ console, now: () => 1000, Store: { get: () => [], set: () => true }, Bus: { on() {}, emit() {} } });
  vm.runInContext(fmtSrc.split('// ---------- 格式推测核对')[0] + '\nthis.Fmt = Fmt;', fmtCtx);
  const gClaude = fmtCtx.Fmt.guess({ ids: [['t', '0']], toolIds: ['toolu_01abc'] });
  assert.equal(gClaude.fam, 'claude');
  assert.equal(gClaude.name, 'claude');
  const gCompat3 = fmtCtx.Fmt.guess('hello', 'visible open thinking', []);
  assert.equal(gCompat3.fam, 'compat');
  assert.equal(gCompat3.name, '开源模型');
  assert.match(fmtSrc, /ExtCompat\.replayChat\(arg\)/);
  assert.match(gachaSrc, /Fmt\.guess\(lastMsg\?\._fmt \|\| c\?\.fmt\)/);

  // 4. upgradeCachedOpus56 defines topCanon before use
  assert.match(bpuiSrc, /const topCanon = \(typeof Strength !== 'undefined' && Strength\.canon \? Strength\.canon\(topLabel\) : topLabel\)\.replace\(\/\[\?？\]\+\$\/, ''\);/);

  // 5, 6, 7, 8, 9. Core rebuildChatFmtFromMessages preserves m._fmt & streaming counters, reconcile(0) works on gacha/unloaded chats, MsgCache & History preserve localTitle
  assert.match(coreSrc, /const mf = m\._fmt \|\| m\.fmt;/);
  assert.match(coreSrc, /if \(delay > 0 && \(!isKeptOrActive \|\| !this\.loaded\)\) return Promise\.resolve\(false\);/);
  assert.match(coreSrc, /for \(const k of \['id', 'type', 'productMode', 'title', 'localTitle', 'createdAt'/);

  // 10 & 11. Side.build0, UI.renderList, SideTools.matches, AcctStats, and mgr pass localTitle & respect Titles.view / UnifiedGold
  assert.match(gviewSrc, /Titles\.view\(e\.id, e\.title, e\.localTitle\)/);
  assert.match(viewSrc, /Titles\.view\(e\.id, e\.title, e\.localTitle\)/);
  assert.match(stSrc, /Titles\.view\(e\.id, e\.title, e\.localTitle\)/);
  assert.match(astatsSrc, /Titles\.view\(e\.id, e\.title, e\.localTitle\)/);
  assert.match(mgrSrc, /typeof Gold\.isUnifiedGold === 'function'/);

  // 12. PelicanShots.isBetterModel allows re-identification to shorter canonical model names while preserving same-family tier specificity
  assert.ok(!hpSrc.includes('key(a) !== key(b) && a.length >= b.length'));
  assert.match(hpSrc, /if \(hasTier\(kb\) && !hasTier\(ka\) && kb\.startsWith\(ka \+ '-'\)\) return false;/);

  // 13. IPRep.check respects manual node mode and Pool.canRotate(a)
  assert.match(iprepSrc, /if \(typeof RouteState !== 'undefined' && RouteState\.mode && RouteState\.mode\(a\) !== 'auto'\) return;/);
  assert.match(iprepSrc, /else if \(\(opt\?\.forceOnError \|\| opt\?\.forceOnHighRisk\) && typeof RegionIP !== 'undefined' && RegionIP\.switchNext\)/);

  // 14. Built-in consolidated & secondary-corrected habit bank (296 samples / 290 confirmed) achieves 100% Exact & LOO accuracy
  const builtinBank = require('../ui/habit-builtin-bank.js');
  assert.equal(builtinBank.samples.length, 296);
  const confirmedSamples = builtinBank.samples.filter(s => s.userConfirmed);
  assert.equal(confirmedSamples.length, 290);
});

test('v0.13.162: Server message verification validity (inDb parent-scope guard & verifyTurnForContinue 4-state verification)', async () => {
  const vm = require('node:vm');
  const coreSrc = read('ui/core.js');
  const keepSrc = read('ui/keep.js');
  const viewSrc = read('ui/view.js');

  assert.match(coreSrc, /lastU\._officialContinueParent = true;/);
  assert.match(keepSrc, /const useContinue = Boolean\(hitlTurn \|\| \(!isGraphReject && \(hasWork \|\| lastUser\._appendAccepted \|\| lastUser\._officialContinueParent \|\| !lastUser\._local\)\)\);/);
  assert.match(viewSrc, /async continueFlow\(chat\)/);

  const inDbStart = coreSrc.indexOf('  msgText(id) {');
  const inDbEnd = coreSrc.indexOf('  // 直接问实时通道：');
  const helperStart = coreSrc.indexOf('function isOfficialTransientError(raw) {');
  const helperEnd = coreSrc.indexOf('function healChatModelAndBranch(chat, opt = {}) {');

  let mockServerMessages = [];
  let mockHasMore = false;
  const ctx = vm.createContext({
    window: {},
    Set, Map, Array, Object, String, Number, Boolean, RegExp, Math, Date, Promise,
    idTime: () => 0,
    api: async () => ({ messages: mockServerMessages, pagination: { hasMore: mockHasMore } }),
  });
  vm.runInContext(
    coreSrc.slice(helperStart, helperEnd) +
    '\nclass MockChat {\n' +
    coreSrc.slice(inDbStart, inDbEnd) +
    '\n}\nthis.MockChat = MockChat;',
    ctx
  );

  const chat = new ctx.MockChat();
  chat.sid = 'sid-verify-1';
  chat._lastSentParentUserId = 'u-turn1';
  chat.emit = () => {};
  chat.mergeServer = (srv) => { chat.messages = srv.map(m => ({ ...m })); return true; };

  // 1. inDb parent-scope guard: earlier turn's "继续" (before u-turn1) must NOT cause a false positive for a new "继续" sent after u-turn1
  mockServerMessages = [
    { id: 'u-turn0', role: 'user', createdAt: '2026-10-20T10:00:00Z', parts: [{ type: 'text', text: '继续' }] },
    { id: 'a-turn0', role: 'assistant', createdAt: '2026-10-20T10:00:02Z', parts: [{ type: 'text', text: 'ok' }] },
    { id: 'u-turn1', role: 'user', createdAt: '2026-10-20T10:00:05Z', parts: [{ type: 'text', text: '写一个页面' }] },
    { id: 'a-turn1', role: 'assistant', createdAt: '2026-10-20T10:00:08Z', parts: [{ type: 'text', text: '已完成第一步' }] },
  ];
  mockHasMore = true;
  const sendAt = Date.parse('2026-10-20T10:00:09Z');
  assert.equal(await chat.inDb('u-turn2-missing', '继续', sendAt), false, 'must not match earlier 继续 or recent prev turn when parent is found');

  // When u-turn2 actually appears after u-turn1 on server, inDb returns true
  mockServerMessages.push({ id: 'u-turn2-srv', role: 'user', createdAt: '2026-10-20T10:00:09.500Z', parts: [{ type: 'text', text: '继续' }] });
  assert.equal(await chat.inDb('u-turn2-local', '继续', sendAt), true, 'matches new user message after parent');

  // 2. verifyTurnForContinue State A: User message NOT in DB -> mode = 'resend-orig' (never blindly send 继续 into thin air)
  const localU2 = { id: 'u-turn2-unpersisted', role: 'user', _appendAccepted: true, parts: [{ type: 'text', text: '帮我加一个深色模式开关' }] };
  chat.messages = [...mockServerMessages.slice(0, 4), localU2, { id: 'a-err', role: 'assistant', parts: [{ type: 'error', text: 'The AI took too long to respond.' }] }];
  mockServerMessages = mockServerMessages.slice(0, 4); // server only has up to a-turn1
  const vrMissing = await chat.verifyTurnForContinue(localU2, '帮我加一个深色模式开关');
  assert.equal(vrMissing.mode, 'resend-orig');
  assert.equal(vrMissing.verified, false);

  // 3. verifyTurnForContinue State B: User message IS in DB with server nodeId, assistant timed out -> mode = 'continue' + syncs server ID
  mockServerMessages = [
    ...mockServerMessages.slice(0, 4),
    { id: 'u-turn2-db-id', metadata: { nodeId: 'node-turn2-db' }, role: 'user', parts: [{ type: 'text', text: '帮我加一个深色模式开关' }] },
  ];
  const vrCont = await chat.verifyTurnForContinue(localU2, '帮我加一个深色模式开关');
  assert.equal(vrCont.mode, 'continue');
  assert.equal(vrCont.verified, true);
  assert.equal(localU2.id, 'u-turn2-db-id');
  assert.equal(localU2.metadata.nodeId, 'node-turn2-db');

  // 4. verifyTurnForContinue State C: Server already finished the assistant reply while SSE dropped -> mode = 'already-done'
  mockServerMessages = [
    ...mockServerMessages.slice(0, 5),
    { id: 'a-turn2-done', role: 'assistant', metadata: { pending: false }, parts: [{ type: 'text', text: '深色模式开关已添加完成。' }] },
  ];
  chat.error = '官方服务响应超时';
  const vrDone = await chat.verifyTurnForContinue(localU2, '帮我加一个深色模式开关');
  assert.equal(vrDone.mode, 'already-done');
  assert.equal(chat.error, null);
  assert.equal(chat.messages.at(-1).id, 'a-turn2-done');

  // 5. verifyTurnForContinue State D: Server assistant returned graph rejection -> mode = 'rewind-resend'
  mockServerMessages = [
    ...mockServerMessages.slice(0, 5),
    { id: 'a-turn2-rej', role: 'assistant', metadata: { pending: false }, parts: [{ type: 'error', text: 'The AI service rejected this request.' }] },
  ];
  const vrRej = await chat.verifyTurnForContinue(localU2, '帮我加一个深色模式开关');
  assert.equal(vrRej.mode, 'rewind-resend');
  assert.equal(vrRej.verified, false);
});

test('v0.13.162: Prevent ghost 本地缓存对话 resurrection & purge stale 404/deleted entries', async () => {
  const vm = require('node:vm');
  const coreSrc = read('ui/core.js');
  const titlesSrc = read('ui/titles.js');
  const bulkSrc = read('ui/bulk.js');
  const gviewSrc = read('ui/gview.js');

  // 1. Source-level guards across core.js, titles.js, bulk.js, gview.js
  assert.match(coreSrc, /isGhostLocal\(e\)/);
  assert.match(coreSrc, /uuidTs\(sid\)/);
  assert.match(coreSrc, /const keepLocal = isOffline;/);
  assert.match(coreSrc, /t - at < 30 \* 86400e3/);
  assert.match(titlesSrc, /AcctStats\.turns\[sid\]/);
  assert.match(bulkSrc, /History\.bury\?\.\(\[\.\.\.gone\]\)/);
  assert.match(gviewSrc, /History\?\.uuidTs\?\.\(e\?\.id\)/);

  // 2. Runtime verification of History.restoreFromLocalCache, seedFromAccountStats, saveSoon, and uuidTs
  const histStart = coreSrc.indexOf('const History = {');
  const histEnd = coreSrc.indexOf('// ---------- 出口 IP ----------');
  const storeMap = new Map();
  const idbMessages = new Map();
  const acctTurns = {
    '01a1440a-8866-7d36-80d8-1838f765a53b': 2, // Deleted chat left in AcctStats.turns without MsgCache
    '01a1440a-e8c4-737a-aa9e-959f1f925b86': 1, // Real chat with cached messages
  };
  idbMessages.set('01a1440a-e8c4-737a-aa9e-959f1f925b86', {
    messages: [{ id: 'u1', role: 'user', createdAt: '2026-10-16T09:46:46.340Z', parts: [{ type: 'text', text: '真实有效对话首句' }] }],
  });

  const ctx = vm.createContext({
    Set, Map, Array, Object, String, Number, Boolean, RegExp, Math, Date, Promise,
    now: () => 1792546720083,
    entAt: e => Date.parse(e?.updatedAt || e?.createdAt || '') || 0,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    UI: { renderList: () => {} },
    Bus: { emit: () => {} },
    Store: {
      get: (k, d) => storeMap.has(k) ? structuredClone(storeMap.get(k)) : d,
      set: (k, v) => { storeMap.set(k, structuredClone(v)); return true; },
    },
    Arch: { has: () => false, add: () => {} },
    AcctStats: { turns: acctTurns, save: () => {} },
    Models: { all: { '01a143dc-8060-7f05-a23f-4faeb32d6352': { name: 'claude' } } },
    Notes: { all: { '01a143de-d19c-7271-a2b2-a5c717a74d8c': { n: '' } }, drop: () => {} },
    Tabs: { list: [] },
    Host: { online: true },
    Chats: new Map(),
    MsgCache: {
      allKeys: async () => [...idbMessages.keys()],
      keys: () => [...idbMessages.keys()],
      get: async (sid) => idbMessages.get(sid) || null,
      del: async (sid) => idbMessages.delete(sid),
    },
  });
  vm.runInContext(coreSrc.slice(histStart, histEnd) + '\nthis.History = History;', ctx);
  const History = ctx.History;

  // UUIDv7 timestamp extraction accuracy
  assert.equal(History.uuidTs('01a1440a-8866-7d36-80d8-1838f765a53b'), 1792142903398);

  // Pre-seed History with a stale resurrected ghost item ("本地缓存对话 01a1440a") + call seedFromAccountStats + restoreFromLocalCache while online
  History.items = [
    { id: '01a1440a-8866-7d36-80d8-1838f765a53b', title: '本地缓存对话 01a1440a', createdAt: '2026-10-21T01:38:40.083Z', _localRecovered: true },
  ];
  History.seedFromAccountStats();
  await History.restoreFromLocalCache();

  // Ghost entry without MsgCache messages MUST be purged, and orphan AcctStats.turns key MUST be cleaned up
  assert.equal(History.byId('01a1440a-8866-7d36-80d8-1838f765a53b'), undefined, 'ghost entry without cached messages purged');
  assert.equal(acctTurns['01a1440a-8866-7d36-80d8-1838f765a53b'], undefined, 'orphan AcctStats.turns entry removed');
  assert.equal(History.byId('01a143dc-8060-7f05-a23f-4faeb32d6352'), undefined, 'Models.all without MsgCache never resurrected');
  assert.equal(History.byId('01a143de-d19c-7271-a2b2-a5c717a74d8c'), undefined, 'Notes.all without MsgCache never resurrected');

  // When offline (Host.online = false), real conversation with cached messages in IndexedDB IS recovered with its real first user prompt and timestamp
  ctx.Host.online = false;
  await History.restoreFromLocalCache();
  const realRecovered = History.byId('01a1440a-e8c4-737a-aa9e-959f1f925b86');
  assert.ok(realRecovered, 'chat with real MsgCache messages is recovered when offline');
  assert.equal(realRecovered.title, '真实有效对话首句');
  assert.equal(realRecovered.createdAt, '2026-10-16T09:46:46.340Z');
});

test('v0.13.162: Dual-source (反推 + 习惯) combined confidence & strict descending sort (100% before 99.8%)', () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  assert.ok(bpUiSrc.includes('existing.combinedPct = Math.min(100, Math.round((effRevBase * 0.55 + hc.match * 0.45) * 10) / 10);'));
  assert.ok(bpUiSrc.includes('if (Boolean(a.userCorrected) !== Boolean(b.userCorrected)) return Number(Boolean(b.userCorrected)) - Number(Boolean(a.userCorrected));'));
  assert.ok(bpUiSrc.includes('if (Boolean(a.hasDual) !== Boolean(b.hasDual)) return Number(Boolean(b.hasDual)) - Number(Boolean(a.hasDual));'));
  assert.ok(bpUiSrc.includes('((b.displayMatch || 0) - (a.displayMatch || 0))'));
});

test('v0.13.165: EdgeTunnel request-saving optimizations (lazy pool probe, 7-day purity cache + direct ip-api, unified IP poll/ping, 1h standby TTL, telemetry block, direct check.proxyip.cmliussss.net + HTTP/2 IPPure)', async () => {
  const mainSrc = read('src/main.js');
  const preloadSrc = read('src/preload.js');
  const routeNativeSrc = read('src/route-native.js');
  const poolSrc = read('ui/pool.js');
  const iprepSrc = read('ui/iprep.js');
  const autoRouteSrc = read('ui/auto-route.js');
  const coreSrc = read('ui/core.js');
  const bootSrc = read('ui/boot.js');
  const nodeSpeedSrc = read('ui/node-speed.js');
  const RouteNative = require('../src/route-native');

  assert.ok(mainSrc.includes('TELEMETRY_BLOCK_RE'));
  assert.ok(mainSrc.includes('function purityCacheOpt(ds)'));
  assert.ok(mainSrc.includes("ipcMain.handle('host:ippureDirect'"));
  assert.ok(mainSrc.includes('RouteNative.checkProxyIpDirect(p, ms, job.signal, dsFetch, pOpt)'));
  assert.ok(preloadSrc.includes("ippureDirect: ip => call('ippureDirect'"));
  assert.ok(mainSrc.includes('const routeProofs = RouteNative.createProofs({ ttl: 3600000 });'));
  assert.ok(routeNativeSrc.includes('async function purity(ses, ms=3200, signal, targetIp=\'\', opt=null)'));
  assert.ok(routeNativeSrc.includes('async function ippureDirect(targetIp, ms = 3200, signal, opt = null)'));
  assert.ok(routeNativeSrc.includes('async function checkProxyIpDirect(pip, ms=9000, signal=null, directFetch=null, opt=null)'));
  assert.ok(routeNativeSrc.includes('https://api.check.proxyip.cmliussss.net'));
  assert.ok(poolSrc.includes('lazyPendingKeys(max = 12)'));
  assert.ok(poolSrc.includes('EVERY: 12 * 3600e3'));
  assert.ok(poolSrc.includes("x.via === 'direct-check'"));
  assert.ok(iprepSrc.includes('unk.slice(0, 6)'));
  assert.ok(iprepSrc.includes('Host.ippureDirect'));
  assert.ok(autoRouteSrc.includes('TTL: 3600000'));
  assert.ok(coreSrc.includes('recordRtt(v)'));
  assert.ok(bootSrc.includes('Math.max(base, 300000)'));
  assert.ok(nodeSpeedSrc.includes('BG = 6 * 3600e3'));

  // Verify checkProxyIpDirect parses cmliussss JSON + cached purity with 0 tunnel requests
  const mockDirectFetch = async url => ({
    ok: true,
    text: async () => JSON.stringify({
      candidate: '203.0.113.55:443',
      success: true,
      responseTime: 85,
      probe_results: {
        ipv4: {
          ok: true,
          connect_ms: 41,
          http_ms: 78,
          exit: {
            ip: '203.0.113.54',
            country: 'JP',
            asn: 2516,
            asOrganization: 'KDDI CORPORATION',
            botManagement: { corporateProxy: false, score: 99 },
          },
        },
      },
    }),
  });
  const directRes = await RouteNative.checkProxyIpDirect('203.0.113.55:443', 5000, null, mockDirectFetch, {
    allowTestNet: true,
    getCachedRep: ip => ip === '203.0.113.54' ? {
      pu: { fs: 9, res: true, bc: false, dc: false, org: 'KDDI CORPORATION', at: Date.now() },
      a: Date.now(), h: false, px: false, m: false, isp: 'KDDI CORPORATION', as: 'AS2516',
    } : null,
  });
  assert.equal(directRes.ip, '203.0.113.54');
  assert.equal(directRes.loc, 'JP');
  assert.equal(directRes.brana, true);
  assert.equal(directRes.via, 'direct-check');
  assert.equal(directRes.pure.fs, 9);
  assert.equal(directRes.pure.res, true);
  assert.equal(directRes.ipa.as, 'AS2516');
});

test('v0.13.166: 4-Agent ModeSwitcher (Max/Battle/Direct), Modality selector, EvalView dual-column vote bar, Battle Habit Auto-Learning, and Sidebar 401 Recovery', () => {
  const evalCore = read('ui/eval-core.js');
  const modeSw = read('ui/mode-switcher.js');
  const evalView = read('ui/eval-view.js');
  const sideTools = read('ui/sidebar-tools.js');
  const dock = read('ui/dock.js');
  const bpUi = read('ui/billing-probe-ui.js');
  const boot = read('ui/boot.js');
  const core = read('ui/core.js');
  const view = read('ui/view.js');
  const bulk = read('ui/bulk.js');
  const bundle = read('src/bundle.js');

  assert.ok(bundle.includes("'eval-core.js'") && bundle.includes("'mode-switcher.js'") && bundle.includes("'eval-view.js'"));
  assert.ok(evalCore.includes('const ModeState =') && evalCore.includes('const ModelCatalog =') && evalCore.includes('const EvalEngine ='));
  assert.ok(evalCore.includes('targetMsg.metadata.timing.completedAt = tNow') && evalCore.includes('targetMsg.metadata._fmt = targetMsg._fmt'));
  assert.ok(modeSw.includes('const ModeSwitcher =') && modeSw.includes('renderBar(tab, chat)'));
  assert.ok(evalView.includes('const EvalView =') && evalView.includes('renderBattleThread(chat, threadEl, scrollerEl)') && evalView.includes('renderVoteBar(chat)'));
  assert.ok(sideTools.includes('ModeState.matchesHistoryEntry(e, curMode)'));
  assert.ok(dock.includes('renderBattleOverview(box, sid, chat)') && dock.includes('renderDirectOverview(box, sid, chat)'));
  assert.ok(bpUi.includes('buildSideVirtualChat') && bpUi.includes('analyzeBattleChat') && bpUi.includes('learnBattleReveal'));
  assert.ok(bpUi.includes('⚔️ Battle揭晓') && bpUi.includes('sample.battleRevealed'));
  assert.ok(boot.includes('if (History.err) { History.err = null; History.blocked = false; }'));
  assert.ok(core.includes("await AuthEnv.drop(['login']).catch(() => {});"));
  assert.ok(core.includes("(isEval ? '/api/history/evaluation/' : '/api/chat/') + id"));
  assert.ok(bulk.includes("'/api/history/evaluation/' + encodeURIComponent(id)"));
  assert.ok(view.includes('ModeState.setMode(chatMode, { silent: true })'));

  // RSC Flight parser (/c/:id), current VOTE_NEXT_ACTION, UUID Direct models, isEvalSession guards, and /c/:id browser routing
  const accounts = read('ui/accounts.js');
  const webbar = read('ui/webbar.js');
  const astats = read('ui/astats.js');
  const titles = read('ui/titles.js');
  assert.ok(evalCore.includes('parseEvalFlightFromHtml') && evalCore.includes('fetchEvalSessionData'));
  assert.ok(evalCore.includes('60c09be8dfaa9c507f73e0d2a17d7e887bbda2c815') && evalCore.includes('didInspectBothMobileHorizontalResponses: true'));
  assert.ok(evalCore.includes('buildEvalRouterStateTree') && evalCore.includes("'Next-Router-State-Tree'") && evalCore.includes("'X-Deployment-Id'"));
  assert.ok(evalCore.includes('resolveModelUuid') && evalCore.includes('ingestInitialModels'));
  assert.ok(bpUi.includes('isEvalSession') && bpUi.includes('ChatHabitFingerprint.isEvalSession'));
  assert.ok(bpUi.includes('totalChars,') && bpUi.includes('codeBlocks,') && bpUi.includes('ensureRevealedCandidate'));
  assert.ok(titles.includes('const isBattleSess =') && titles.includes('`${mA} vs ${mB}`'));
  assert.ok(astats.includes("e.type !== 'evaluation'"));
  assert.ok(accounts.includes("(isEval ? 'c/' : 'agent/')"));
  assert.ok(webbar.includes("sessionStorage.setItem('anc:fast-return'"));

  const keep = read('ui/keep.js');
  const trace = read('ui/trace.js');
  assert.ok(evalCore.includes('readLocalEvalCache(sid)') && evalCore.includes('m.participantPosition === \'a\''));
  assert.ok(evalCore.includes('Chat.prototype.reload = function') && evalCore.includes('Chat.prototype.resumeIncremental = function') && evalCore.includes('Chat.prototype.stream = function'));
  assert.ok(evalCore.includes('chat._evalStreaming = true'));
  assert.ok(keep.includes('function isEval(c)') && keep.includes('if (isEval(c))'));
  assert.ok(trace.includes('EvalEngine.isEvalChat?.(chat)'));
  assert.ok(core.includes('resolveTriggerSid') && core.includes("'/api/chat/trigger-session'"));
  assert.ok(modeSw.includes('ModeState.setMode(mId, { silent: true })') && modeSw.includes('this._resolveState(chat, tab)'));
});

test('v0.13.166-beta6: Native VLESS node fallback when ProxyIPs fail/absent, Direct-to-VLESS failover, live ECH update, and Android direct-check & scan circuit-breaker', async () => {
  const P = require('../ui/route-policy');
  const proxyDns = read('src/proxy-dns.js');
  const mainJs = read('src/main.js');
  const routeNative = read('src/route-native.js');
  const mainJava = read('android/app/src/main/java/ai/arena/client/MainActivity.java');
  const routeSupportJava = read('android/app/src/main/java/ai/arena/client/RouteSupport.java');
  const nodeRoutes = read('ui/node-routes.js');
  const poolJs = read('ui/pool.js');
  const autoRouteJs = read('ui/auto-route.js');

  // 1. Live ECH key + IP-literal DoH fallback + Android direct-check & xray gate
  assert.ok(proxyDns.includes('AEX+DQBB9QAgACDxa/EHa0pNtQCaPvsahQYiCriBsFmBKnHqu5Ds7FevEQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA='));
  assert.ok(proxyDns.includes('https://223.5.5.5/resolve'));
  assert.ok(mainJs.includes('directCands') && mainJs.includes('Boolean(p && String(p).trim())'));
  assert.ok(routeNative.includes('o.forceFailover'));
  assert.ok(mainJava.includes('AEX+DQBB9QAgACDxa/EHa0pNtQCaPvsahQYiCriBsFmBKnHqu5Ds7FevEQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA='));
  assert.ok(mainJava.includes('checkProxyIpDirect') && mainJava.includes('probeXrayGate') && mainJava.includes('dnsCache'));
  assert.ok(routeSupportJava.includes('purityDirect') && routeSupportJava.includes('forceFailover'));
  assert.ok(/nativeFallback:\s*true/.test(nodeRoutes) && /consecFail\s*>=\s*24/.test(nodeRoutes));
  assert.ok(/consecFail\s*>=\s*24/.test(poolJs) && /Array\.isArray\(Nodes\.list\)/.test(autoRouteJs));

  // 2. When all ProxyIPs fail or pool has no usable ProxyIPs, RoutePolicy.Engine falls back to bare VLESS node (proxyIp: '', nativeFallback: true)
  const a = { id: 'own', proxy: 'vless://node1', proxyIp: 'dead-pip', nodeId: 'n1', region: 'JP', routeMode: 'node', routeAuto: false, nodeFailover: true };
  const writes = [];
  const data = {
    account: a,
    nodes: [{ id: 'n1', link: 'vless://node1' }, { id: 'n2', link: 'vless://node2' }],
    pool: { rep: {}, ips: { 'bad-pip': { ok: true, loc: 'JP', ms: 50 } } },
    accounts: [a],
    enabled: true,
  };
  const engine = new P.Engine({
    retryMs: 0,
    allowCrossRegionEscape: true,
    now: () => 100000,
    read: async () => structuredClone(data),
    link: n => n.link,
    probe: async c => {
      // All ProxyIP candidates fail; bare VLESS node (proxyIp === '') succeeds with Cloudflare WARP exit (fs: 67)
      if (!c.proxyIp && c.proxy === 'vless://node1') {
        return { ok: true, service: true, realtime: true, ip: '104.28.165.253', loc: 'TW', ms: 120, ticket: 'bare-proof', pure: { fs: 67 } };
      }
      return { ok: false, kind: 'network', error: 'ProxyIP timeout' };
    },
    local: async () => [],
    apply: async o => { writes.push(o); return { ok: true, account: { ...a, ...o.route } }; },
  });
  const res = await engine.run('error-switch', true);
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(res.nativeFallback, true);
  assert.equal(writes[0].route.proxy, 'vless://node1');
  assert.equal(writes[0].route.proxyIp, '');
  assert.equal(writes[0].route.region, '');

  // 3. When in Direct mode ('direct') and direct connection cannot connect, RoutePolicy.Engine fails over to a working VLESS node
  const directAcct = { id: 'own2', proxy: 'direct', proxyIp: '', nodeId: '', region: '', routeMode: 'direct', routeAuto: false, nodeFailover: false };
  const directWrites = [];
  const directData = {
    account: directAcct,
    nodes: [{ id: 'n1', link: 'vless://node1' }],
    pool: { rep: {}, ips: {} },
    accounts: [directAcct],
    enabled: true,
  };
  const directEngine = new P.Engine({
    retryMs: 0,
    allowCrossRegionEscape: true,
    now: () => 100000,
    read: async () => structuredClone(directData),
    link: n => n.link,
    probe: async c => {
      if (c.proxy === 'direct') return { ok: false, kind: 'network', error: 'direct blocked' };
      return { ok: true, service: true, realtime: true, ip: '104.28.165.253', loc: 'TW', ms: 110, ticket: 'direct-escape-proof', pure: { fs: 67 } };
    },
    local: async () => [],
    apply: async o => { directWrites.push(o); return { ok: true, account: { ...directAcct, ...o.route, routeMode: o.mode || 'node', nodeFailover: true } }; },
  });
  const directRes = await directEngine.run('network', true);
  assert.equal(directRes.ok, true);
  assert.equal(directRes.changed, true);
  assert.equal(directWrites[0].forceFailover, true);
  assert.equal(directWrites[0].mode, 'node');
  assert.equal(directWrites[0].route.proxy, 'vless://node1');

  // 4. ProxyIP direct-check uses Node fetch fallback (bypassing blocked 1.1.1.1 DoH), bounds xray fallback concurrency,
  //    does not mass-ban datacenter ProxyIPs when only ip-api.com (px:true, h:true) ran before IPPure, and Battle vote
  //    uses live Next-Action ID + dynamic chunk scanner + recursive Flight parser.
  const evalCore = read('ui/eval-core.js');
  const iprepJs = read('ui/iprep.js');
  assert.ok(mainJs.includes('async function nodeOrDirectFetch(u, o, ds)'));
  assert.ok(mainJs.includes('const runXrayWorker = async () =>'));
  assert.ok(iprepJs.includes('if ((eg.includes(\':\') || isHosting || p.px) && !hasPu && !p.c)'));
  assert.ok(evalCore.includes('6045a00021608b43c2ded349d9d98204449e22d4b0'));
  assert.ok(evalCore.includes('dpl_8Gb6m6m38M8S2WQCSdYVhF5iPnfC'));
  assert.ok(evalCore.includes('async function discoverLiveVoteAction(sid)'));
  assert.ok(evalCore.includes('const inspectFlightNode = (node, depth = 0) =>'));
});

test('v0.13.167: Instant cold-start localStorage paint without white screen, per-account window bounds (winBounds) persistence across close/restart/update, and updater progress window fixes', () => {
  const mainJs = read('src/main.js');
  const bootJs = read('ui/boot.js');
  const coreJs = read('ui/core.js');
  const viewJs = read('ui/view.js');

  // 1. Synchronous localStorage hot message cache (mc:hot:<sid>) and hydrateSync() in UI.fillView
  assert.ok(coreJs.includes("Store.get('mc:hot:' + sid, null)"));
  assert.ok(coreJs.includes('function getSync(sid)'));
  assert.ok(coreJs.includes('hydrateSync() {'));
  assert.ok(viewJs.includes('chat.hydrateSync?.();'));

  // 2. t=0ms cold-cache paint in boot.js init() + synchronous UI.renderList() in shell() + local Fetch.enable for UI_URL
  assert.ok(bootJs.includes("const cmCold = Store.get('me:u', null);"));
  assert.ok(bootJs.includes('UI.renderList?.(); UI.renderListSoon?.();'));
  assert.ok(mainJs.includes("wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt*', requestStage: 'Request' }] })"));

  // 3. Per-account window position & size (winBounds) restoration, screen clamping, and closeBatch multi-window preservation
  assert.ok(mainJs.includes('width: wb?.width || 1320, height: wb?.height || 880'));
  assert.ok(mainJs.includes('w.__syncBounds = syncBounds;'));
  assert.ok(mainJs.includes("if (wb?.maximized && typeof w.maximize === 'function')"));
  assert.ok(mainJs.includes('w.constructor.__closeBatch'));
  assert.ok(mainJs.includes('function captureAllWindowBounds()'));
  assert.ok(mainJs.includes('function collectSavedWindowBounds()'));

  // 4. Updater session persistence (upd-session.json) and progress window child-process guard ($st -ge 4)
  assert.ok(mainJs.includes("const updSessionPath = () => path.join(app.getPath('temp'), 'brana-ai-update', 'upd-session.json');"));
  assert.ok(mainJs.includes("'$initExePath = [string]$state.exePath'"));
  assert.ok(mainJs.includes("'  if ($st -ge 4) {'"));
  assert.ok(mainJs.includes("'  WScript.Sleep 250'"));

  // 5. Cross-profile DPAPI master key sync, sibling safeStorage fallback, resolveAccountPw/promoteRegPw self-healing, and 401 session recovery
  const idJs = read('src/extension-test-identity.js');
  const acJs = read('ui/accounts.js');
  const apJs = read('ui/account-picker.js');
  assert.ok(idJs.includes("const lsS=path.join(root,'s','Local State')"));
  assert.ok(mainJs.includes('function getSiblingMasterKeys()'));
  assert.ok(mainJs.includes('function decSsWithKeys(b64)'));
  assert.ok(mainJs.includes('function resolveAccountPw(a)'));
  assert.ok(mainJs.includes("p.src === 'web' || p.src === 'client' || !hasValidPw"));
  assert.ok(coreJs.includes('relogin(opt = {})'));
  assert.ok(coreJs.includes("const isCached = Boolean(UI.me?.cached);"));
  assert.ok(acJs.includes('? { ...cm, browseOnly: true }'));
  assert.ok(viewJs.includes("UI.loginGate?.('登录会话已过期，请输入密码重新登录')"));
  assert.ok(apJs.includes("UI.loginGate?.('登录会话已过期，请输入密码重新登录')"));
});

test('v0.13.168: V3.0 Battle 100% ground-truth super-weight anchoring, all-modality feature extraction, Direct-mode truth harvesting, and intra-family tier disentanglement', () => {
  const vm = require('node:vm');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const storeMap = new Map();
  const ctx = vm.createContext({
    console,
    Date,
    Math,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    Promise,
    Store: {
      get: (k, d) => (storeMap.has(k) ? structuredClone(storeMap.get(k)) : d),
      set: (k, v) => { storeMap.set(k, structuredClone(v)); return true; },
    },
    Strength: {
      canon: s => {
        const str = String(s || '').trim();
        if (/claude-opus-5\.5-medium/i.test(str)) return 'Claude Opus 5.5 (Medium)';
        if (/claude-opus-5\.5-high/i.test(str)) return 'Claude Opus 5.5 (High)';
        if (/claude-opus-5\.5-max/i.test(str)) return 'Claude Opus 5.5 (Max)';
        if (/gpt-6\.1-sol-medium/i.test(str)) return 'GPT 6.1 Sol (Medium)';
        if (/gpt-6\.1-sol-high/i.test(str)) return 'GPT 6.1 Sol (High)';
        return str;
      },
    },
    Brand: { of: () => 'anthropic', NAME: { anthropic: 'Anthropic', openai: 'OpenAI' } },
    Models: { all: {}, get: () => null, set: () => {} },
    Chats: new Map(),
    Bus: { on() {}, emit() {} },
  });
  vm.runInContext(bpUiSrc.split('const BillingProbe =')[0] + '\nthis.ChatHabitFingerprint = ChatHabitFingerprint;', ctx);
  const FP = ctx.ChatHabitFingerprint;

  // 1. Verify V3.0 exports and 5-tier truth hierarchy
  assert.equal(typeof FP.getSampleTruthRank, 'function');
  assert.equal(typeof FP.tierVecSimilarity, 'function');
  assert.equal(typeof FP.recordBattlePairwiseContrast, 'function');
  assert.equal(typeof FP.learnDirectSession, 'function');
  assert.equal(FP.getSampleTruthRank({ battleRevealed: true, truthTier: 'battle_paired' }), 5);
  assert.equal(FP.getSampleTruthRank({ battleRevealed: true }), 4);
  assert.equal(FP.getSampleTruthRank({ directMode: true }), 3);
  assert.equal(FP.getSampleTruthRank({ userConfirmed: true, autoTeacher: false }), 2);
  assert.equal(FP.getSampleTruthRank({ autoTeacher: true }), 1);

  // 2. Simulate a paired Battle reveal between Claude Opus 5.5 (High) and Claude Opus 5.5 (Medium) on the same coding/prose prompt
  const battleChat = {
    sid: '01a16000-0000-7000-8000-000000000001',
    isEvaluation: true,
    evalMode: 'battle',
    evalModality: 'webdev',
    voteState: {
      voted: true,
      vote: 'model-a-better',
      modelAName: 'claude-opus-5.5-high',
      modelBName: 'claude-opus-5.5-medium',
    },
    messages: [
      { id: 'u1', role: 'user', text: '请实现一个严格完整、支持无障碍与边界条件检查的响应式数据面板，不要省略任何代码。' },
      {
        id: 'a1',
        role: 'assistant',
        participantPosition: 'a',
        metadata: { timing: { startedAt: 1000, completedAt: 49000, thinkingMs: 18500 } },
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'reasoning', text: '' },
          { type: 'reasoning', text: '' },
          {
            type: 'text',
            text: '## 完整架构与边界条件验证\n\n**核心设计**：采用 `:root` 变量与 `prefers-reduced-motion` 无障碍降级。注意边界条件与权衡验证如下：\n- 验证空数据状态\n- 验证高并发刷新\n\n```html\n<!DOCTYPE html><html><head><style>:root { --bg: #FAF8F5; } @media (prefers-reduced-motion: reduce) {}</style></head><body><svg aria-labelledby="t"><linearGradient id="g"/></svg><script>try { if (Number.isFinite(1)) requestAnimationFrame(() => {}); } catch (e) {}</script></body></html>\n```\n' + '详细实现说明与完整逻辑演进。'.repeat(120),
          },
        ],
      },
      {
        id: 'b1',
        role: 'assistant',
        participantPosition: 'b',
        metadata: { timing: { startedAt: 1000, completedAt: 14000, thinkingMs: 3200 } },
        parts: [
          { type: 'reasoning', text: '' },
          {
            type: 'text',
            text: '### 面板简要示例\n\n```html\n<html><body><div>// ... existing code omitted ...</div></body></html>\n```\n简短说明。',
          },
        ],
      },
    ],
  };

  const revOut = FP.learnBattleReveal(battleChat, {
    evalModality: 'webdev',
    vote: 'model-a-better',
    modelA: { name: 'claude-opus-5.5-high' },
    modelB: { name: 'claude-opus-5.5-medium' },
  });
  assert.ok(revOut.learnedA && revOut.learnedB);
  assert.equal(revOut.learnedA.weight, 9.5);
  assert.equal(revOut.learnedA.truthTier, 'battle_paired');
  assert.equal(revOut.learnedB.weight, 9.5);
  assert.equal(revOut.learnedB.truthTier, 'battle_paired');
  assert.equal(revOut.learnedA.tierVec.length, 12);
  assert.equal(revOut.learnedB.tierVec.length, 12);

  const cal = FP.loadCalibration();
  assert.equal(cal.v, 3);
  assert.ok(cal.tierCentroids['claude opus 5.5 (high)']);
  assert.ok(cal.tierCentroids['claude opus 5.5 (medium)']);
  assert.ok(cal.intraFamilyHyperplanes['claude-opus-5.5']?.['high>medium']);
  assert.ok(cal.modalityProfiles?.webdev?.['claude opus 5.5 (high)']);

  // 3. Verify manual correction (rank 2, weight 1.8) cannot overwrite a Battle ground-truth sample (rank 5, weight 9.5)
  const attemptManualOverwrite = FP.learnFromChat(
    { sid: '01a16000-0000-7000-8000-000000000001#a', messages: battleChat.messages },
    'Claude Opus 5.5 (Medium)',
    { userConfirmed: true, autoTeacher: false }
  );
  assert.equal(attemptManualOverwrite.model, 'Claude Opus 5.5 (High)');
  assert.equal(attemptManualOverwrite.truthTier, 'battle_paired');

  // 4. Verify Direct-mode truth harvesting across Search modality
  const directSearchChat = {
    sid: '01a16000-0000-7000-8000-000000000002',
    isEvaluation: true,
    evalMode: 'direct',
    evalModality: 'search',
    directModelName: 'gpt-6.1-sol-high',
    messages: [
      { id: 'u2', role: 'user', text: '对比最新基准数据并列出引用来源表格' },
      {
        id: 'a2',
        role: 'assistant',
        sources: [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }, { url: 'https://example.com/3' }],
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'text', text: '根据最新检索结果 [1](https://example.com/1) 与 [2](https://example.com/2)：\n\n| 模型 | 得分 |\n|---|---|\n| Sol | 95 |\n\n- 关键结论一\n- 关键结论二' },
        ],
      },
    ],
  };
  const directLearned = FP.learnDirectSession(directSearchChat);
  assert.ok(directLearned);
  assert.equal(directLearned.model, 'GPT 6.1 Sol (High)');
  assert.equal(directLearned.truthTier, 'direct_locked');
  assert.equal(directLearned.weight, 6.5);
  assert.equal(directLearned.evalModality, 'search');
  assert.ok(directLearned.meta.searchSourcesCount >= 3);
  assert.ok(directLearned.meta.citationCount >= 2);
});

test('v0.13.166: cloud-running agent turn continuity, phantom finish guard, and unified region/node routing state', () => {
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const rpSrc = read('ui/route-policy.js');
  const ripSrc = read('ui/region-ip.js');
  const nrSrc = read('ui/node-routes.js');

  assert.match(coreSrc, /function isPhantomFinishStub\(m\)/, 'core.js should define isPhantomFinishStub');
  assert.match(coreSrc, /function hasInterruptedToolPart\(m\)/, 'core.js should define hasInterruptedToolPart');
  assert.match(coreSrc, /if \(!this\.live && \/\^\(finish\|finish-step\|text-end\|reasoning-end\|message-metadata\)\$\/\.test\(t\)\)/, 'apply(ch) must not call liveMsg(true) on closing events when !this.live');
  assert.match(coreSrc, /lp\.state === 'output-error' && \(lp\.errorText === '未返回结果' \|\| lp\._interruptedPending\) && sp\.state && sp\.state !== 'output-error'/, 'patchAssistantParts must heal client-interrupted tool error states back to server active state');
  assert.match(viewSrc, /if \(chat\.live !== m && typeof isPhantomFinishStub === 'function' && isPhantomFinishStub\(m\)\) return;/, 'view.js must skip rendering empty phantom finish stubs');

  assert.match(rpSrc, /if\(!winner&&mode==='node'&&\(strategy==='auto'\|\|canDirectEscape\)\)/, 'route-policy.js must not overwrite node-mode accounts with 127.0.0.1:7890 local proxy');
  assert.match(ripSrc, /effReg\(a\)\s*\{\s*return String\(a\?\.region\|\|a\?\.routeHome\|\|IP\.loc\|\|''\)\.trim\(\)\.toUpperCase\(\);/, 'region-ip.js must resolve effective region from region, routeHome, or IP.loc');
  assert.match(ripSrc, /Nodes\.load\?Nodes\.load\(\)\.catch\(\(\)=>\{\}\):null/, 'RegionIP.read() must load shared Nodes');
  assert.match(nrSrc, /let selNode=current\.nodeId\|\|\(P\?\.d\?\.node\|\|''\),cc=current\.region\|\|account\.routeHome/, 'NodeRoutes.field must fall back to Pool.d.node and account.routeHome');
});

test('v0.13.169: Battle mode hides Gacha controls and renders top-bar Pelican button with Pelican Test, Micro-Probe Test, and Quick Text Test', async () => {
  const vm = require('node:vm');
  const viewSrc = read('ui/view.js');
  const pelSrc = read('ui/pelican-test.js');
  const msSrc = read('ui/mode-switcher.js');
  const gpopSrc = read('ui/gpop.js');
  const dockSrc = read('ui/dock.js');
  const cssSrc = read('ui/app.css');

  // 1. Static verification: Gacha hidden in Battle mode, Pelican menu button rendered in new chat & Battle chat headers
  assert.ok(viewSrc.includes('this.renderPelicanMenuBtn(t, null, curMode)'));
  assert.ok(viewSrc.includes("this.renderPelicanMenuBtn(Tabs.cur, chat, 'battle')"));
  assert.ok(viewSrc.includes('async sendQuickTestPrompt(prompt, opts = {})'));
  assert.ok(viewSrc.includes("if (gpopBtn && resolvedMode === 'battle')"));
  assert.ok(msSrc.includes("gbtn.style.display = curMode === 'battle' ? 'none' : ''"));
  assert.ok(gpopSrc.includes("if (isBattle) { this.close(); return; }"));
  assert.ok(dockSrc.includes('if (!isBattleBarMode)'));
  assert.ok(cssSrc.includes('.composer[data-mode="battle"] .gbtn2:not([data-acct])'));

  // 2. Runtime verification of PelicanTest.openMenu and PelicanTest.runQuickTest (pelican, habit, text)
  const sentPrompts = [];
  const appendedPops = [];
  const makeNode = (tag = 'div') => ({
    tag,
    className: '',
    style: {},
    attrs: {},
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() { this.removed = true; },
    getBoundingClientRect() { return { left: 800, right: 828, top: 12, bottom: 40, width: 28, height: 28 }; },
  });

  const ctx = vm.createContext({
    console,
    AbortController,
    Store: { get: () => ({}), set: () => true },
    now: () => Date.now(),
    toast: () => {},
    describe: e => String(e?.message || e),
    sleep: async () => {},
    icon: name => { const n = makeNode('svg'); n.iconName = name; return n; },
    GachaPrompts: {
      svg: () => 'Create a new standalone HTML file with animated pelican SVG.',
      habit: () => '请在工作区创建并保存一个自包含的单文件 .html 卡片，全文控制在 35～45 行以内。',
      autoqaOne: () => '请无需调用任何工具，直接用中文分 2 条简短加粗要点说明深色模式对比度调整（80 字以内）？',
    },
    ModeState: { getMode: () => 'battle' },
    Tabs: { cur: { key: 't1', sid: null } },
    Chats: new Map(),
    UI: {
      sendQuickTestPrompt: async (prompt, opts) => {
        sentPrompts.push({ prompt, opts });
        return { ok: true, kind: opts.kind, prompt };
      },
    },
    document: {
      body: { appendChild(el) { appendedPops.push(el); return el; } },
      createElement: tag => makeNode(tag),
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() {} },
  });

  vm.runInContext(pelSrc + '\nthis.PelicanTest = PelicanTest;', ctx);
  const PT = ctx.PelicanTest;
  assert.equal(typeof PT.openMenu, 'function');
  assert.equal(typeof PT.runQuickTest, 'function');

  const anchorBtn = makeNode('button');
  const pop = PT.openMenu(anchorBtn, { mode: 'battle' });
  assert.ok(pop);
  assert.equal(pop.children.length, 2);
  assert.deepEqual(
    pop.children.map(btn => btn.getAttribute('data-test-kind')),
    ['pelican', 'habit']
  );

  // Trigger test modes in Battle mode
  await PT.runQuickTest('pelican', { mode: 'battle' });
  await PT.runQuickTest('habit', { mode: 'battle' });

  assert.equal(sentPrompts.length, 2);
  assert.equal(sentPrompts[0].opts.kind, 'pelican');
  assert.match(sentPrompts[0].prompt, /pelican/i);
  assert.equal(sentPrompts[1].opts.kind, 'habit');
  assert.match(sentPrompts[1].prompt, /35～45 行以内/);
});

test('v0.13.167: Battle regenerateTurn retries single message via PUT /nextjs-api/stream/retry-evaluation-session-message and filters 0-char failed side from habit blind guess', async () => {
  const vm = require('node:vm');
  const evalCoreSrc = read('ui/eval-core.js');
  const evalViewSrc = read('ui/eval-view.js');
  const bpuiSrc = read('ui/billing-probe-ui.js');
  const dockSrc = read('ui/dock.js');

  assert.match(evalCoreSrc, /\/nextjs-api\/stream\/retry-evaluation-session-message\/\$\{encodeURIComponent\(chat\.sid\)\}\/messages\/\$\{encodeURIComponent\(msgId\)\}/);
  assert.match(evalCoreSrc, /method:\s*'PUT'/);
  assert.match(evalCoreSrc, /'chat_retry'/);
  assert.match(evalCoreSrc, /val\.finishReason === 'error'/);
  assert.match(evalViewSrc, /EvalEngine\.regenerateTurn\(chat,\s*\{\s*turn,\s*pos,\s*msg\s*\}\)/);
  assert.match(bpuiSrc, /if \(\(m\.status === 'failed' \|\| m\.failed\) && !hasAsstContent\(m\)\) return false;/);
  assert.match(dockSrc, /生成失败 · 点击可直接重试/);

  const calls = [];
  const recaptchaActions = [];
  const streamChunks = [
    'bg:"Thinking about COMET FROST card..."\n',
    'b0:"Here is the 40-line HTML card:\\n```html\\n<!doctype html><html><body>COMET · FROST #49</body></html>\\n```"\n',
    'bd:{"finishReason":"stop"}\n',
  ];

  const ctx = vm.createContext({
    console,
    AbortController,
    TextDecoder,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
    Store: { get: () => null, set: () => true },
    Bus: { on() {}, emit() {} },
    Recaptcha: {
      take: async act => { recaptchaActions.push(act); return 'v3_tok_' + act; },
      v3: async act => { recaptchaActions.push(act); return 'v3_tok_' + act; },
    },
    packClientInteraction: () => 'cx_test_token',
    rawFetch: async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      let idx = 0;
      const enc = new TextEncoder();
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (idx >= streamChunks.length) return { done: true, value: undefined };
              return { done: false, value: enc.encode(streamChunks[idx++]) };
            },
          }),
        },
      };
    },
    window: {},
  });

  vm.runInContext(evalCoreSrc, ctx);
  const { EvalEngine } = ctx.window;
  assert.equal(typeof EvalEngine.retryEvalMessage, 'function');
  assert.equal(typeof EvalEngine.regenerateTurn, 'function');

  const msgUser = { id: '01a16235-4ea7-788d-afe8-960e69b4b06c', role: 'user', parts: [{ type: 'text', text: 'Create COMET FROST card' }] };
  const msgA = {
    id: '01a16235-4ea7-788d-794b-98e1c0be9c87',
    role: 'assistant',
    participantPosition: 'a',
    status: 'success',
    parts: [{ type: 'text', text: 'Model A intact 44-line HTML response', state: 'done' }],
    metadata: { pending: false },
  };
  const msgB = {
    id: '01a16235-4ea7-788d-a2f4-6262af8e6634',
    role: 'assistant',
    participantPosition: 'b',
    status: 'failed',
    failureReason: 'The generation failed',
    parts: [],
    metadata: { pending: false },
  };
  const chat = {
    sid: '01a16235-4ea7-7381-aa5e-8ad419b46ba8',
    isEvaluation: true,
    evalMode: 'battle',
    loaded: true,
    messages: [msgUser, msgA, msgB],
    emit() {},
    emitStreamSoon() {},
  };

  const ok = await EvalEngine.regenerateTurn(chat, {
    turn: { user: msgUser, a: msgA, b: msgB },
    pos: 'b',
    msg: msgB,
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, '/nextjs-api/stream/retry-evaluation-session-message/01a16235-4ea7-7381-aa5e-8ad419b46ba8/messages/01a16235-4ea7-788d-a2f4-6262af8e6634');
  assert.equal(calls[0].body.recaptchaV3Token, 'v3_tok_chat_retry');
  assert.equal(calls[0].body.cx, 'cx_test_token');
  assert.deepEqual(recaptchaActions, ['chat_retry']);

  // Verify msgA was never removed or mutated and msgB was updated in-place
  assert.equal(chat.messages.length, 3);
  assert.equal(chat.messages[1], msgA);
  assert.equal(msgA.parts[0].text, 'Model A intact 44-line HTML response');
  assert.equal(chat.messages[2], msgB);
  assert.equal(msgB.id, '01a16235-4ea7-788d-a2f4-6262af8e6634');
  assert.equal(msgB.status, 'success');
  assert.equal(msgB.parts.length, 2);
  assert.equal(msgB.parts[0].type, 'reasoning');
  assert.match(msgB.parts[1].text, /COMET · FROST #49/);
});

test('v0.13.168: Battle mode tabs/cards show Battle icon + status-only label (生成中/待选择/已完成) & Battle reveal performs exclusive repulsion + effort tier separation', () => {
  const evalViewSrc = read('ui/eval-view.js');
  const titlesSrc = read('ui/titles.js');
  const viewSrc = read('ui/view.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');

  assert.match(evalViewSrc, /getBattleStatusLabel\s*\(/);
  assert.match(evalViewSrc, /renderBattleLogo\s*\(/);
  assert.match(evalViewSrc, /return '生成中'/);
  assert.match(evalViewSrc, /return '待选择'/);
  assert.match(evalViewSrc, /return '已完成'/);
  assert.match(titlesSrc, /vid:\s*'',\s*model:\s*'',[\s\S]*battleStatus,\s*gold:\s*false,\s*isBattle:\s*true/);
  assert.match(viewSrc, /EvalView\.renderBattleLogo\(15,\s*battleSt\)/);
  assert.match(viewSrc, /const label = isBattleTab\s*\?\s*battleStatus/);

  // Verify EvalView.getBattleStatusLabel state transitions
  const vm = require('node:vm');
  const evCtx = vm.createContext({
    Chats: new Map(),
    History: { byId: () => null },
    Models: { get: () => null },
    ModeState: { getMode: () => 'battle', inferEntryMode: () => 'battle' },
    h: (tag, attrs, ...children) => ({ tag, attrs, children, style: {} }),
    document: { createElementNS: () => ({ setAttribute() {}, style: {} }) },
  });
  vm.runInContext(evalViewSrc + '\nthis.EvalView = EvalView;', evCtx);
  const EV = evCtx.EvalView;
  assert.equal(EV.getBattleStatusLabel({ sid: 'b1', busy: true, isEvaluation: true, evalMode: 'battle' }), '生成中');
  assert.equal(EV.getBattleStatusLabel({ sid: 'b1', busy: false, isEvaluation: true, evalMode: 'battle', voteState: { voted: false } }), '待选择');
  assert.equal(EV.getBattleStatusLabel({ sid: 'b1', busy: false, isEvaluation: true, evalMode: 'battle', voteState: { voted: true } }), '已完成');

  // Verify Battle exclusive repulsion & standalone effort tier separation (without syntheticMargin / double-tier conflict)
  assert.match(bpUiSrc, /function resolveBattleModelWithTier\(/);
  assert.match(bpUiSrc, /function identifyEffortTier\(/);
  assert.match(bpUiSrc, /function sanitizeCorruptedTierSlug\(/);
  assert.match(bpUiSrc, /battleRepel:\s*isBattleTruth/);
});

test('v0.13.172: Decouple Battle effort tier identification from model habit calibration & prevent double-tier / open-source -max corruption', () => {
  const vm = require('node:vm');
  const strengthSrc = read('ui/strength.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const storeMap = new Map();
  const ctx = vm.createContext({
    console, Date, Math, Set, Map, Array, Object, String, Number, Boolean, RegExp, JSON, Promise,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {},
    noVertex: s => String(s || ''),
    noteBase: s => String(s || ''),
    now: () => Date.now(),
    Trace: { turns: () => [], index: () => ({}) },
    Gacha: { settings: () => ({ prompt: '' }) },
    Store: {
      get: (k, d) => (storeMap.has(k) ? structuredClone(storeMap.get(k)) : d),
      set: (k, v) => { storeMap.set(k, structuredClone(v)); return true; },
    },
    Brand: { of: () => 'anthropic', tierOf: () => '', NAME: { anthropic: 'Anthropic', openai: 'OpenAI' } },
    Models: { all: {}, get: () => null, set: () => {} },
    Chats: new Map(),
    Bus: { on() {}, emit() {} },
  });
  vm.runInContext(strengthSrc + '\nthis.Strength = Strength;', ctx);
  vm.runInContext(bpUiSrc.split('const BillingProbe =')[0] + '\nthis.ChatHabitFingerprint = ChatHabitFingerprint;', ctx);
  const Strength = ctx.Strength;
  const FP = ctx.ChatHabitFingerprint;

  // 1. Strength.canon & formatFamilyTierCanon must never produce double-tier slugs like claude-opus-5.5-high-low
  assert.equal(Strength.canon('claude-opus-5.5-high (Low)'), 'claude-opus-5.5-low');
  assert.equal(Strength.canon('claude-opus-5.5-high-low'), 'claude-opus-5.5-high');
  assert.equal(FP.formatFamilyTierCanon('claude-opus-5.5-high', 'low'), 'claude-opus-5.5-low');
  assert.equal(FP.formatDisplayModelLabel('claude-opus-5.5-high-low'), 'Claude Opus 5.5 (High)');
  assert.equal(FP.formatDisplayModelLabel('claude-opus-5.5-low'), 'Claude Opus 5.5 (Low)');

  // 2. Open-source models with -max in their family name (qwen3.8-max, glm-5.3-max, kimi-k3) must not have -max parsed as an effort tier or appended with -low
  assert.equal(Strength.canon('qwen3.8-max (Low)'), 'qwen3.8-max');
  assert.equal(FP.sanitizeCorruptedTierSlug('qwen3.8-max-low'), 'qwen3.8-max');
  assert.equal(FP.sanitizeCorruptedTierSlug('deepseek-v4.1-flash-20260910-max'), 'deepseek-v4.1-flash-20260910');
  const qwenParsed = FP.parseModelFamilyAndTier('qwen3.8-max');
  assert.equal(qwenParsed.hasExplicitTier, false);
  assert.equal(qwenParsed.tier, '');
  assert.equal(qwenParsed.effort, 'standard');
  assert.equal(FP.formatFamilyTierCanon('qwen3.8-max', 'low'), 'qwen3.8-max');

  // 3. Strict 3-tuple decomposition (厂商 / 型号 / 强度) with 'standard' (标准) when no explicit effort exists
  const dSol = FP.decomposeModelIdentity('GPT 6.1 Sol (High)');
  assert.equal(dSol.vendor, 'openai');
  assert.equal(dSol.family, 'gpt-6.1-sol');
  assert.equal(dSol.effort, 'high');
  assert.equal(dSol.effortLabel, 'High');
  assert.equal(dSol.hasExplicitTier, true);

  const dQwen = FP.decomposeModelIdentity('qwen3.8-max-0902');
  assert.equal(dQwen.vendor, 'qwen');
  assert.equal(dQwen.family, 'qwen3.8-max-0902');
  assert.equal(dQwen.effort, 'standard');
  assert.equal(dQwen.effortLabel, '标准');
  assert.equal(dQwen.hasExplicitTier, false);
  assert.equal(dQwen.canon, 'qwen3.8-max-0902');

  const dOpus5 = FP.decomposeModelIdentity('claude-opus-5');
  assert.equal(dOpus5.vendor, 'anthropic');
  assert.equal(dOpus5.family, 'claude-opus-5');
  assert.equal(dOpus5.effort, 'standard');
  assert.equal(dOpus5.effortLabel, '标准');
  assert.equal(dOpus5.canon, 'claude-opus-5');

  const dArgonNoTier = FP.decomposeModelIdentity('gemini-4-argon');
  assert.equal(dArgonNoTier.vendor, 'google');
  assert.equal(dArgonNoTier.family, 'gemini-4-argon');
  assert.equal(dArgonNoTier.effort, 'standard');
  assert.equal(dArgonNoTier.effortLabel, '标准');
  assert.equal(dArgonNoTier.canon, 'gemini-4-argon');

  // 4. Battle reveal of tierless models must keep pure model name and effort = 'standard' (no forced -high / -max suffix)
  assert.equal(FP.resolveBattleModelWithTier('claude-opus-5', null, null, 'gemini-4-argon'), 'claude-opus-5');
  assert.equal(FP.resolveBattleModelWithTier('gemini-4-argon', null, null, 'claude-opus-5'), 'gemini-4-argon');
  assert.equal(FP.resolveBattleModelWithTier('claude-opus-5.5-medium', null, null, 'gpt-6.1-sol-high'), 'claude-opus-5.5-medium');

  // 5. Historical bank repair: tierless Battle rawLabel samples and sid 01a155ea-d645-7385-9d00-0a95851f21d9 are normalized into conflict-free 3-tuples
  storeMap.set('habitLearnBank:v1', [
    {
      sid: 'battle-test-1#a',
      model: 'claude-opus-5-high',
      rawLabel: 'claude-opus-5',
      battleRevealed: true,
      vec: new Array(20).fill(0.5),
    },
    {
      sid: '01a155ea-d645-7385-9d00-0a95851f21d9',
      model: 'gemini-4-argon-medium',
      rawLabel: 'Gemini 4 Argon (High)',
      userConfirmed: true,
      vec: new Array(20).fill(0.4),
    },
  ]);
  const repairedBank = FP.loadBank();
  const sBattle = repairedBank.find(s => s.sid === 'battle-test-1#a');
  assert.equal(sBattle.model, 'claude-opus-5');
  assert.equal(sBattle.vendor, 'anthropic');
  assert.equal(sBattle.family, 'claude-opus-5');
  assert.equal(sBattle.effort, 'standard');
  assert.equal(sBattle.effortLabel, '标准');

  const sArgon = repairedBank.find(s => s.sid === '01a155ea-d645-7385-9d00-0a95851f21d9');
  assert.equal(sArgon.model, 'gemini-4-argon-high');
  assert.equal(sArgon.vendor, 'google');
  assert.equal(sArgon.family, 'gemini-4-argon');
  assert.equal(sArgon.effort, 'high');
  assert.equal(sArgon.effortLabel, 'High');

  // 6. Standalone effort tier identification works without spawning synthetic rows in analyze() candidates
  const effOut = FP.identifyEffortTier({
    tierVec: [0.85, 0.82, 0.70, 0.65, 0.80, 0.75, 0.60, 0.55, 0.70, 0.65, 0.84, 0.88],
    evalModality: 'chat',
  }, 'claude-opus-5.5');
  assert.ok(effOut && typeof effOut.tier === 'string');
});

test('v0.13.168-beta.2: Message ordering after user turn, extension-test-identity custom userData preservation, Battle prePct vs postPct separation, and 01a163f2/01a163f1/01a16431 recognition', () => {
  // 1. extension-test-identity preserves custom --user-data-dir outside appData even on -beta versions
  const { configure } = require('../src/extension-test-identity');
  let curUserData = '/tmp/brana-auth-route-test-123';
  const mockApp = {
    getPath(k) {
      if (k === 'appData') return '/home/runner/.config';
      if (k === 'userData') return curUserData;
      return '';
    },
    setPath(k, v) {
      if (k === 'userData') curUserData = v;
    },
    setName() {},
    setAppUserModelId() {},
  };
  const idRes = configure(mockApp);
  assert.equal(idRes.testBuild, false);
  assert.equal(curUserData, '/tmp/brana-auth-route-test-123');

  // 2. ui/core.js and ui/eval-core.js enforce user-before-assistant message ordering
  const coreSrc = read('ui/core.js');
  const evalCoreSrc = read('ui/eval-core.js');
  assert.ok(coreSrc.includes('slotAfter(uid'));
  assert.ok(coreSrc.includes('const iaSelf = (!fg && this.awaitId)'));
  assert.ok(evalCoreSrc.includes('function orderTurnMessages(mapped)'));
  assert.ok(evalCoreSrc.includes('const mapped = orderTurnMessages(rawMapped)'));

  // 3. Battle prePct vs postPct genuine blind separation and 01a163f2 / 01a16431 recognition
  const vm = require('node:vm');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const chfSrc = bpUiSrc.split('const BillingProbe =')[0];
  const storeMap = new Map();
  const ctx = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Error,
    setTimeout, clearTimeout,
    Store: { get: k => storeMap.get(k), set: (k, v) => storeMap.set(k, v) },
    BUILTIN_HABIT_BANK: require('../ui/habit-builtin-bank.js'),
  });
  vm.runInContext(chfSrc + '\nthis.FP = ChatHabitFingerprint;', ctx);
  const FP = ctx.FP;

  const html3f2 = `<!DOCTYPE html><html lang="am"><head><style>:root{--sky:#87ceeb;}@keyframes crank-spin{to{transform:rotate(360deg)}}@keyframes tailWag{50%{transform:rotate(8deg)}}</style></head><body><svg viewBox="0 0 800 500">${'x'.repeat(9600)}</svg></body></html>`;
  const r3f2 = FP.analyze({
    sid: '01a163f2-4cf2-7aca-a48a-a41eeda5a6b1',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Pelican in Amharic' }] },
      {
        id: 'a1', role: 'assistant', createdAt: 1000, completedAt: 67132,
        parts: [
          { type: 'reasoning', text: '...', hidden: true },
          { type: 'text', text: 'Here is a complete self-contained HTML/SVG file — with controls.' },
          { type: 'tool-write_file', toolName: 'write_file', input: { path: 'pelican_riding_bicycle.html', content: html3f2 } },
          { type: 'tool-present_file', toolName: 'present_file', input: { path: 'pelican_riding_bicycle.html' } },
          { type: 'text', text: 'Created `pelican_riding_bicycle.html` — self-contained file — — —' },
        ],
      },
    ],
  });
  assert.ok(/Claude Fable 5\.1/i.test(r3f2.best.label), `Expected Claude Fable 5.1 #1, got ${r3f2.best?.label}`);

  const battleChat = {
    sid: '01a16431-5f91-7769-a82d-1f1f69d62ff9',
    mode: 'battle',
    evalModality: 'webdev',
    voteState: { modelAName: 'gemini-4-argon', modelBName: 'claude-opus-5-low' },
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '画一个骑自行车的鹈鹕HTML/SVG' }] },
      {
        id: 'a1', role: 'assistant', participantPosition: 'a', createdAt: 1000, completedAt: 211880,
        parts: [{ type: 'text', text: '```html\n<!DOCTYPE html><html><head><style>:root{--bg:#0f172a;}</style></head><body><svg viewBox="0 0 800 600"><defs><filter id="glow"><feGaussianBlur stdDeviation="5"/></filter><linearGradient id="g"></linearGradient></defs><g><circle cx="400" cy="300" r="50"/><path d="M10 10 L100 100"/><ellipse cx="20" cy="20" rx="10" ry="5"/></g></svg><script>const pelicanBodyGroup=1, basketFish=2, cloudsLayer=3, wavesLayer=4; function loop(){requestAnimationFrame(loop);} loop();</script>' + 'x'.repeat(39000) + '</body></html>\n```' }],
      },
      {
        id: 'b1', role: 'assistant', participantPosition: 'b', createdAt: 1000, completedAt: 136102,
        parts: [
          { type: 'reasoning', text: '...', hidden: true },
          { type: 'text', text: '```html\n<!DOCTYPE html><html><head><style>@keyframes driftScenery{to{transform:translateX(-100px)}}@keyframes driftForeground{to{transform:translateX(-200px)}}</style></head><body><svg viewBox="0 0 800 500"><circle cx="100" cy="100" r="40"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s" repeatCount="indefinite"/></circle></svg>' + 'x'.repeat(14000) + '</body></html>\n```' },
        ],
      },
    ],
  };
  FP.learnBattleReveal(battleChat, 'gemini-4-argon', 'claude-opus-5-low');
  const bSnap = FP.analyzeBattleChat(battleChat);
  assert.ok(/Gemini 4 Argon/i.test(bSnap.a.candidates[0].label));
  assert.equal(bSnap.a.candidates[0].isRevealed, true);
  assert.ok(bSnap.a.candidates[0].prePct < 99.0, `Expected genuine prePct < 99.0, got ${bSnap.a.candidates[0].prePct}`);
  assert.ok(bSnap.a.candidates[0].postPct >= 99.0, `Expected postPct >= 99.0, got ${bSnap.a.candidates[0].postPct}`);
  assert.ok(/Claude Opus 5/i.test(bSnap.b.candidates[0].label));
  assert.equal(bSnap.b.candidates[0].isRevealed, true);
});

test('v0.13.168-beta.3: Full 千面助手_v9.2 (v37.9.0+37.5.8-iter8-fusion) Probe & Recognition Engine Parity', async () => {
  const vm = require('node:vm');
  const { webcrypto } = require('node:crypto');
  const C = require('../ui/arena-trace/confidence.js');
  const P = require('../ui/arena-trace/pricing.js');

  // 1. residualToConfidence rejects non-numeric/empty values and SEED_COUNTS has Gemini 4 Argon & GPT 6.1 Sol
  assert.equal(C.residualToConfidence(null), 0);
  assert.equal(C.residualToConfidence(''), 0);
  assert.equal(C.residualToConfidence('  '), 0);
  assert.equal(C.residualToConfidence(false), 0);
  assert.equal(C.residualToConfidence([]), 0);
  assert.equal(C.residualToConfidence(0), 100);
  assert.equal(C.SEED_COUNTS['contenders/barium-bb-v2-4xts-agent'], 3);
  assert.equal(C.SEED_COUNTS['openai/gpt-6.1-sol'], 2);

  // 2. synthesizeZeroQuotaTokens, computeZeroQuotaAux, mapCandidateToFpId, and resolveCandidatesWithFingerprint
  assert.equal(typeof P.synthesizeZeroQuotaTokens, 'function');
  assert.equal(typeof P.computeZeroQuotaAux, 'function');
  assert.equal(typeof P.mapCandidateToFpId, 'function');
  assert.equal(typeof P.resolveCandidatesWithFingerprint, 'function');
  assert.equal(P.mapCandidateToFpId({ id: 'openai/gpt-6-astra' }), 'gpt-6-astra');
  assert.equal(P.mapCandidateToFpId({ id: 'openai/gpt-6.1-sol' }), 'gpt-6-sol');
  assert.equal(P.mapCandidateToFpId({ id: 'anthropic/claude-haiku-5.5' }), 'claude-haiku-5.5');
  assert.equal(P.mapCandidateToFpId({ id: 'contenders/paisley-n9x0' }), 'qwen3.8-max-0902');

  const syn = P.synthesizeZeroQuotaTokens({ outputUsd: 0 }, { visTokens: 120, exactReasonTokens: 45, stepCount: 2, toolInputChars: 350 }, 1);
  assert.equal(syn.uSumO, 165);
  assert.equal(syn.uSumReason, 45);
  assert.equal(syn.uSumVis, 120);
  assert.ok(syn.uSumI >= 2200);

  // 3. IkaleBank has 59 models including claude-haiku-5.5 and __AMC_FP_ENGINE__ is wired
  const ikaleSrc = read('ui/probe-bank-ikale.js');
  const fpLibsSrc = read('ui/fp-libs.js');
  const pvSrc = read('ui/probe-vendor.js');
  const storeMap = new Map();
  const fpCtx = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Error,
    Store: { get: k => storeMap.get(k), set: (k, v) => { storeMap.set(k, v); return true; }, del: k => storeMap.delete(k) },
    Bus: { emit() {} },
  });
  vm.runInContext(pvSrc + '\n' + ikaleSrc + '\n' + fpLibsSrc + '\nthis.IkaleBank = IkaleBank;', fpCtx);
  assert.equal(fpCtx.IkaleBank.models.length, 59);
  assert.ok(fpCtx.IkaleBank.models.some(m => m.id === 'claude-haiku-5.5'));
  assert.ok(fpCtx.__AMC_FP_ENGINE__ && typeof fpCtx.__AMC_FP_ENGINE__.identify === 'function');

  // 4. GachaPrompts exposes PELICAN_I18N_POOL (24 langs), makePelicanSuffix11D6L (17 chars), PROBE_POOL (P01..P100), and DIVERSE_MICRO_PROBES_V13
  const gpSrc = read('ui/gacha-prompts.js');
  const gpCtx = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Error,
    crypto: webcrypto,
    Store: { get: (k, d) => storeMap.get(k) ?? d, set: (k, v) => { storeMap.set(k, v); return true; } },
  });
  vm.runInContext(gpSrc + '\nthis.GachaPrompts = GachaPrompts;', gpCtx);
  const GP = gpCtx.GachaPrompts;
  assert.equal(GP.PELICAN_I18N_POOL.length, 24);
  const suf = GP.makePelicanSuffix11D6L();
  assert.match(suf, /^[1-9]\d{10}[A-Za-z]{6}$/);
  const pel = GP.buildRandomPelicanTestPrompt();
  assert.ok(pel.prompt.endsWith(' ' + pel.suffix));
  assert.equal(GP.PROBE_POOL.length, 100);
  assert.equal(GP.DIVERSE_MICRO_PROBES_V13.length, 12);
  const draw1 = GP.probePoolDraw();
  const draw2 = GP.probePoolDraw();
  assert.ok(draw1.id && draw2.id && draw1.id !== draw2.id);

  // 5. HTML_SVG_CLASSIFIER_BANK restores full 45-token maps & facet source weight, and inferPlainModelByRAvg works
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const chfSrc = bpUiSrc.split('const BillingProbe =')[0];
  const chfCtx = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Error,
    Store: { get: () => null, set: () => {} },
  });
  vm.runInContext(chfSrc + '\nthis.FP = ChatHabitFingerprint;', chfCtx);
  assert.equal(chfCtx.FP.inferPlainModelByRAvg({ rAvgChunk: 120 }).id, 'contenders/caveman-agent');
  assert.equal(chfCtx.FP.inferPlainModelByRAvg({ rAvgChunk: 2.8 }).id, 'deepseek/deepseek-v4.1-flash');
  assert.equal(chfCtx.FP.inferPlainModelByRAvg({ rAvgChunk: 5.0 }).id, 'moonshotai/kimi-k3');
  assert.equal(chfCtx.FP.inferPlainModelByRAvg({ rAvgChunk: 14.0 }).id, 'z-ai/glm-5.3');
  assert.equal(chfCtx.FP.inferPlainModelByRAvg({ rAvgChunk: 28.0 }).id, 'nvidia/nemotron-3-ultra');
});

test('large-context chat blank screen fix: R.text WeakMap cache, legacy _mdEl:{} cleanup, patchKids Node guard, and MsgCache slimForHot', () => {
  const viewSrc = read('ui/view.js');
  const coreSrc = read('ui/core.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const evalViewSrc = read('ui/eval-view.js');
  const nodeRoutesSrc = read('ui/node-routes.js');
  const iprepSrc = read('ui/iprep.js');
  const titlesSrc = read('ui/titles.js');
  const mobileSrc = read('ui/mobile.js');
  const appCss = read('ui/app.css');
  const routeNativeSrc = read('src/route-native.js');

  // 1. R.text uses _mdPartCache WeakMap and strips any legacy _mdEl/{} from deserialized IndexedDB parts
  assert.match(viewSrc, /const _mdPartCache = typeof WeakMap !== 'undefined' \? new WeakMap\(\) : null;/);
  assert.match(viewSrc, /if \(p\._mdEl !== undefined\) delete p\._mdEl;/);
  assert.doesNotMatch(viewSrc, /p\._mdEl\s*=\s*d/);

  // 2. patchKids filters non-Node items so deserialized {} objects can never throw insertBefore TypeError or empty live DOM
  assert.match(viewSrc, /const list = Array\.isArray\(nodes\) \? nodes\.filter\(n => n && typeof n === 'object' && typeof n\.nodeType === 'number'\) : \[\];/);

  // 3. MsgCache sanitizes _mdEl/_mdSrc on read/write and slims oversized large-context tails for 0ms hot cache + _hotOnly IndexedDB upgrade
  assert.match(coreSrc, /function sanitizeCachedMsgs\(msgs\)/);
  assert.match(coreSrc, /function slimForHot\(msgs,/);
  assert.match(coreSrc, /this\._hotOnly = Boolean\(x\._hotSlice\);/);
  assert.match(coreSrc, /if \(!this\.messages\.length \|\| this\._hotOnly\) MsgCache\.get\(this\.sid\)/);

  // 4. Pre-send purity stability & reCAPTCHA v3 route-bound cache invalidation across node switches
  assert.match(coreSrc, /function clearCache\(action = ''\)/);
  assert.match(coreSrc, /Chats\.onRouteSwitched = \(\) =>/);
  assert.match(nodeRoutesSrc, /IP\.ip=r\.ip;if\(r\.loc\)IP\.loc=r\.loc;IP\.err=null;IP\.rttFail=0;IP\.at=now\(\);IP\.checkedAt=now\(\);/);
  assert.match(iprepSrc, /const minRequiredScore = isManuallyLocked \? this\.TH : this\.PURE;/);
  assert.match(routeNativeSrc, /else if \(risk === 0 && subnetCnt <= 6\) fs = res \? 6 : \(dc \? 14 : 10\);/);

  // 5. Blank / stuck-loading chat protection during send + node switch
  assert.match(viewSrc, /const hasVisibleMsgs = chat\.messages\.some\(m => m && !m\._held/);
  assert.match(evalCoreSrc, /const wasConfirmedEval = Boolean\(chat\.isEvaluation \|\| isEvalChat\(chat\)\);/);
  assert.match(evalViewSrc, /if \(!turns\.length\) \{/);

  // 6. Mobile chat deletion: visible .card .more, touch long-press + _menuOpenAt guard, dual-endpoint History.remove, and TabSw delete
  assert.match(appCss, /body\.m \.card \.more\{display:grid;/);
  assert.match(viewSrc, /this\._menuOpenAt = now\(\);/);
  assert.match(coreSrc, /const altUrl = \(isEval \? '\/api\/chat\/' : '\/api\/history\/evaluation\/'\) \+ id;/);
  assert.match(titlesSrc, /for \(const t of Tabs\.list\.filter\(x => x\.sid === sid\)\) Tabs\.close\(t\.key\);/);
  assert.match(mobileSrc, /tsw-del danger/);
});



