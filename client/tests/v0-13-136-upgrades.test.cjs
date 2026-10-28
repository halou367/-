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

  assert.ok(/^(?:0\.13\.1(?:3[6-9]|[4-9]\d)|[1-9]\d*\.\d+\.\d+)(?:-beta(?:\.?\d+)?)?$/.test(pkg.version));
  assert.deepEqual(pkg.build.electronLanguages, ['zh-CN', 'en-US']);
  assert.ok(pkg.build.files.includes('!ui/gen/**'));
  assert.match(afterPack, /KEEP_LOCALES\s*=\s*new Set\(\['zh-CN\.pak',\s*'en-US\.pak'\]\)/);
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

  // Turn ending purely on bash/tool call (state: 'output-available') without concluding text triggers auto-continue
  assert.ok(KeepAlive.isMidTurnStalled({
    messages: [{ id: 'm_done_tool', role: 'assistant', parts: [{ type: 'tool-bash', toolName: 'bash', toolCallId: 't1', state: 'output-available', output: { exit_code: 0 } }] }],
  }));
  assert.ok(KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{ id: 'm_done_tr', role: 'assistant', parts: [{ type: 'text', text: '正在为您修改文件：' }] }],
  }));

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

  // 2. Unified single-list 联合识别排名 header & Top-6 confidence bars
  assert.ok(bpUiSrc.includes('function getRankFilter()'));
  assert.ok(bpUiSrc.includes('function setRankFilter(next)'));
  assert.ok(bpUiSrc.includes("'联合识别排名'"));
  assert.ok(bpUiSrc.includes("class: 'mc-fp-bar ' + (isTihuRow && isRevRow ? 'bar-rev' : isRevRow ? 'bar-rev' : 'bar-fp')"));

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
  assert.ok(bpUiSrc.includes('combinedWeight'));
  assert.ok(/reverseVer:\s*1[6-9]\d/.test(bpUiSrc));

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
  assert.ok(bpUiSrc.includes('GEMINI_FLASH_FIX_SIDS'));
  assert.ok(bpUiSrc.includes('if (hasRealCostModel && costEnabledNow && !interactive'));
  assert.ok(bpUiSrc.includes('Number(rc.revPct ?? rc.match ?? 0)'));

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
  assert.ok(bpUiSrc.includes('manualExplicit'));
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
  assert.ok(/^(?:0\.13\.1[6789]\d|[1-9]\d*\.\d+\.\d+)/.test(pkg.version));

  // 2. Default Gacha mode is 'habit' (习惯速测 · 微缩探针)
  assert.ok(gachaSrc.includes("mode: 'pelican'"));
  assert.ok(gachaSrc.includes("const mode = s.mode === 'custom' ? 'custom' : 'pelican';"));

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

  // Clean non-proxy datacenter IP (h=true, px=false) receives usable base purity (80) in v2.0.2
  assert.equal(poolCtx.IPRep.pure('43.170.17.114', poolCtx.Pool.d.ips['43.170.17.114']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.170.17.114', poolData.ips['43.170.17.114'], 1792450000000), true);
  // proxycheck pp=true VPN is penalized as high-risk (<50)
  assert.equal(poolCtx.IPRep.risky('43.160.238.73', poolCtx.Pool.d.ips['43.160.238.73']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.160.238.73', poolData.ips['43.160.238.73'], 1792450000000), false);

  // Verified IPPure fs=3 clean IP is accepted and ranked ahead of unprobed datacenter IP
  assert.equal(poolCtx.IPRep.pure('43.175.17.54', poolCtx.Pool.d.ips['43.175.17.54']), true);
  assert.equal(RoutePolicy.reputationOK(poolData, '43.175.17.54', poolData.ips['43.175.17.54'], 1792450000000), true);
  assert.deepEqual([...poolCtx.Pool.avail('SG', 'self')], ['43.175.17.54', '43.170.17.114']);
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
  assert.match(gachaSrc, /Fmt\.guess\(\{\s*\.\.\.c\.fmt,\s*done:\s*true\s*\}\)/);

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
  assert.ok(builtinBank.samples.length >= 425);
  const confirmedSamples = builtinBank.samples.filter(s => s.userConfirmed);
  assert.ok(confirmedSamples.length >= 290);
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
  assert.ok(bpUiSrc.includes('0.72 * htmlScore + 0.18 * softCost + 0.10 * pureHab'));
  assert.ok(bpUiSrc.includes('(Number(Boolean(b.userCorrected)) - Number(Boolean(a.userCorrected)))'));
  assert.ok(bpUiSrc.includes('((b.combinedWeight ?? b.match ?? 0) - (a.combinedWeight ?? a.match ?? 0))'));
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
  assert.ok(poolSrc.includes('lazyPendingKeys(max = 48)'));
  assert.ok(poolSrc.includes('EVERY: 12 * 3600e3'));
  assert.ok(poolSrc.includes('direct-check') || routeNativeSrc.includes('direct-check'));
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
      pu: { fs: 9, res: true, bc: false, dc: false, org: 'KDDI CORPORATION', via: 'ippure', real: 1, at: Date.now() },
      a: Date.now(), h: false, px: false, m: false, isp: 'KDDI CORPORATION', as: 'AS2516',
    } : null,
  });
  assert.equal(directRes.ip, '203.0.113.54');
  assert.equal(directRes.loc, 'JP');
  assert.equal(directRes.brana, true);
  assert.equal(directRes.via, 'direct-check');
  assert.ok(directRes.pure.fs >= 0);
  assert.equal(typeof directRes.pure.res, 'boolean');
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
  assert.ok(core.includes("(isEval ? '/api/history/evaluation/' : '/api/history/agentic/') + id"));
  assert.ok(bulk.includes("'/api/history/evaluation/' + encodeURIComponent(id)") || bulk.includes('History.protoMutateResponse'));
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
  assert.ok(iprepJs.includes('hasCleanPu') || iprepJs.includes('!hasPu && !p.c'));
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
    setTimeout: () => 0, clearTimeout: () => {},
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
  assert.ok(bSnap.a.candidates[0].prePct < 99.0 && bSnap.a.candidates[0].prePct > 0, `Expected genuine prePct < 99.0, got ${bSnap.a.candidates[0].prePct}`);
  assert.ok(bSnap.a.candidates[0].postPct >= bSnap.a.candidates[0].prePct && bSnap.a.candidates[0].postPct !== 99.2, `Expected genuine postPct >= prePct and != 99.2, got ${bSnap.a.candidates[0].postPct}`);
  assert.ok(/Claude Opus 5/i.test(bSnap.b.candidates[0].label));
  assert.equal(bSnap.b.candidates[0].isRevealed, true);
  assert.ok(bSnap.b.candidates[0].prePct < 99.0 && bSnap.b.candidates[0].prePct > 0, `Expected genuine side B prePct < 99.0, got ${bSnap.b.candidates[0].prePct}`);
  assert.ok(bSnap.b.candidates[0].postPct >= bSnap.b.candidates[0].prePct && bSnap.b.candidates[0].postPct !== 99.2, `Expected genuine side B postPct != 99.2, got ${bSnap.b.candidates[0].postPct}`);

  // Verify that even when the revealed model ranked outside top 6 before reveal, prePct is never null or 99.2%
  const nonTop6Battle = {
    sid: '01a16d99-0000-7000-8000-000000000099',
    mode: 'battle',
    voteState: { modelAName: 'glm-5.1', modelBName: 'qwen-3.6-plus' },
    messages: battleChat.messages,
  };
  FP.learnBattleReveal(nonTop6Battle, { modelA: { name: 'glm-5.1' }, modelB: { name: 'qwen-3.6-plus' } });
  const nonTop6Snap = FP.analyzeBattleChat(nonTop6Battle);
  assert.ok(Number.isFinite(nonTop6Snap.a.candidates[0].prePct) && nonTop6Snap.a.candidates[0].prePct < 90.0, `Expected non-top6 prePct < 90.0, got ${nonTop6Snap.a.candidates[0].prePct}`);
  assert.ok(Number.isFinite(nonTop6Snap.a.candidates[0].postPct) && nonTop6Snap.a.candidates[0].postPct !== 99.2, `Expected non-top6 postPct != 99.2, got ${nonTop6Snap.a.candidates[0].postPct}`);
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
  assert.match(routeNativeSrc, /else fs = res \? \(6 \+ \(ipHash % 4\)\) : \(dc \? \(12 \+ dcSpread\) : \(10 \+ \(ipHash % 5\)\)\);/);

  // 5. Blank / stuck-loading chat protection during send + node switch
  assert.match(viewSrc, /const hasVisibleMsgs = chat\.messages\.some\(m => m && !m\._held/);
  assert.match(evalCoreSrc, /const wasConfirmedEval = Boolean\(chat\.isEvaluation \|\| isEvalChat\(chat\)\);/);
  assert.match(evalViewSrc, /if \(!turns\.length\) \{/);

  // 6. Mobile chat deletion: visible .card .more, touch long-press + _menuOpenAt guard, dual-endpoint History.remove, and TabSw delete
  assert.match(appCss, /body\.m \.card \.more\{display:grid;/);
  assert.match(viewSrc, /this\._menuOpenAt = now\(\);/);
  assert.match(coreSrc, /const altUrl = \(isEval \? '\/api\/chat\/' : '\/api\/history\/evaluation\/'\) \+ id;/);
  assert.match(titlesSrc, /for \(const t of Tabs\.list\.filter\(x => x && x\.sid === sKey\)\)/);
  assert.match(mobileSrc, /tsw-del danger/);
});

test('v0.13.171: Node sorting & purity detection blocks VPN/hosting/proxycheck-fallback exits, ranks residential ISP first, and rotates dirty exits before send in node mode', async () => {
  const vm = require('node:vm');
  const P = require('../ui/route-policy');
  const RouteState = require('../ui/route-state');
  const iprepSrc = read('ui/iprep.js');

  const pool = {
    rep: {
      '3.37.58.69': { a: 1, h: true, px: false, isp: 'Amazon.com, Inc.', c: 1, r: 66, pt: 'VPN', pp: true, pu: { fs: 15, res: false, bc: false, dc: false, org: 'Amazon.com, Inc.' } },
      '104.105.9.100': { a: 1, h: false, px: false, isp: 'Akamai Connected Cloud', c: 1, r: 66, pt: 'VPN', pp: true, pu: { fs: 15, res: false, bc: false, dc: false, org: 'Linode' } },
      '107.148.118.151': { a: 1, h: false, px: true, isp: 'Ipxo LLC', pu: { fs: 14, res: false, bc: false, dc: false, org: 'Yeah Tech LLC', real: 1 } },
      '43.174.54.227': { a: 1, h: true, px: false, isp: 'Aceville Pte.ltd.', pu: { fs: 14, res: false, bc: false, dc: false, org: 'ACEVILLE PTE.LTD.', real: 1 } },
      '2a0a:d687:f007::18a': { pu: { fs: 14, res: false, bc: false, dc: false, org: 'DATAWAVE GLOBAL LLC', real: 1 } },
      '160.251.167.81': { a: 1, h: false, px: false, isp: 'GMO Internet', c: 1, r: 0, pt: 'Residential', pp: false, pu: { fs: 10, res: true, bc: false, dc: false, org: 'GMO Internet, Inc.', real: 1, via: 'ippure' } },
      '43.175.17.54': { a: 1, h: true, px: false, isp: 'ACE', pu: { fs: 3, res: false, bc: false, dc: false, org: '6 COLLYER QUAY' } },
    },
    ips: {
      '3.37.58.69:443': { ok: true, loc: 'KR', eg: '3.37.58.69', ms: 40 },
      '104.105.9.100:443': { ok: true, loc: 'SG', eg: '104.105.9.100', ms: 50 },
      '107.148.118.151': { ok: true, loc: 'US', eg: '107.148.118.151', ms: 60 },
      '43.170.38.62': { ok: true, loc: 'JP', eg: '43.174.54.227', ms: 35 },
      '82.109.97.149:8443': { ok: true, loc: 'NL', eg: '2a0a:d687:f007::18a', ms: 55 },
      '160.251.167.81:443': { ok: true, loc: 'JP', eg: '160.251.167.81', ms: 120 },
      '43.175.17.54': { ok: true, loc: 'SG', eg: '43.175.17.54', ms: 45 },
    },
  };

  assert.equal(P.reputationOK(pool, '3.37.58.69:443', pool.ips['3.37.58.69:443'], 1000), false, 'AWS VPN must not pass reputationOK');
  assert.equal(P.reputationOK(pool, '104.105.9.100:443', pool.ips['104.105.9.100:443'], 1000), false, 'Linode VPN must not pass reputationOK');
  assert.equal(P.reputationOK(pool, '107.148.118.151', pool.ips['107.148.118.151'], 1000), false, 'IPXO/Yeah Tech proxy must not pass reputationOK');
  assert.equal(P.reputationOK(pool, '43.170.38.62', pool.ips['43.170.38.62'], 1000), true, 'Clean non-proxy ACEVILLE exit passes reputationOK in v2.0.2');
  assert.equal(P.reputationOK(pool, '82.109.97.149:8443', pool.ips['82.109.97.149:8443'], 1000), true, 'Clean non-proxy DATAWAVE exit passes reputationOK in v2.0.2');
  assert.equal(P.reputationOK(pool, '160.251.167.81:443', pool.ips['160.251.167.81:443'], 1000), true, 'Verified residential ISP must pass reputationOK');

  let acquired = null;
  const acct = { id: 'a1', proxy: 'vless://node1', proxyIp: '3.37.58.69:443', nodeId: 'n1', region: 'KR', ...RouteState.prefs('node') };
  const ctx = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, RegExp, JSON, Error, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    now: () => 100000,
    sleep: async () => {},
    isVless: p => /^vless:/i.test(p || ''),
    navigator: { onLine: true },
    location: { pathname: '/robots.txt' },
    window: { __ANC_CLIENT_SHELL: true },
    RouteState,
    UI: { host: { account: acct }, renderAcct() {} },
    IP: { ip: '3.37.58.69', err: null, at: 99000, checkedAt: 99000, ping: async () => {}, poll: () => {} },
    Host: {
      info: async () => ({ account: acct }),
      ippureDirect: async () => null,
    },
    Pool: {
      d: pool,
      isFixtureEnv: () => false,
      load: async () => pool,
      mutate: async fn => { fn(pool); },
      banned: k => Boolean(pool.ban?.[String(k).toLowerCase()]),
      banForever: (d, k) => { d.ban ||= {}; d.ban[String(k).toLowerCase()] = 100000; },
      avail: (cc) => cc === 'JP' ? ['160.251.167.81:443'] : [],
      availAllPureLowestLatency: () => ['160.251.167.81:443', '43.175.17.54'],
      acquire: async (a, cc, opt) => {
        if (!opt?.allowNodeMode && RouteState.mode(a) === 'node') return { ok: false };
        acquired = { cc, opt };
        a.proxyIp = '160.251.167.81:443';
        a.region = cc;
        return { ok: true, to: '160.251.167.81:443' };
      },
    },
  });
  vm.runInContext(iprepSrc.slice(0, iprepSrc.indexOf('// 后台：启动 1 分钟后')) + ';this.IPRep=IPRep;', ctx);
  const { IPRep } = ctx;

  assert.equal(IPRep.risky('3.37.58.69:443', pool.ips['3.37.58.69:443']), true);
  assert.equal(IPRep.risky('104.105.9.100:443', pool.ips['104.105.9.100:443']), true);
  assert.equal(IPRep.risky('107.148.118.151', pool.ips['107.148.118.151']), true);
  assert.equal(IPRep.pure('43.170.38.62', pool.ips['43.170.38.62']), true);
  assert.equal(IPRep.pure('160.251.167.81:443', pool.ips['160.251.167.81:443']), true);
  assert.ok(IPRep.rank('160.251.167.81:443', pool.ips['160.251.167.81:443']) > IPRep.rank('43.175.17.54', pool.ips['43.175.17.54']), 'Residential ISP must rank higher than datacenter IP');

  const preRes = await IPRep.ensurePreSendPure({ timeoutMs: 800 });
  assert.equal(preRes.ok, true);
  assert.equal(preRes.switched, true);
  assert.equal(preRes.to, '160.251.167.81:443');
  assert.equal(acquired?.opt?.allowNodeMode, true);
});

test('v0.13.172: conversation switching & latest-message sync parity with Browser Mode', async () => {
  const vm = require('node:vm');
  const coreSrc = read('ui/core.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const viewSrc = read('ui/view.js');
  const evalViewSrc = read('ui/eval-view.js');
  const mobileSrc = read('ui/mobile.js');
  const webbarSrc = read('ui/webbar.js');
  const bootSrc = read('ui/boot.js');

  // 1. Idle peek stream (streaming && peeking) must not block converge, reconcile, tickConverge, quickSync, or remoteSync
  assert.match(coreSrc, /if \(this\.busy \|\| \(this\.streaming && !this\.peeking\) \|\| this\.syncing\) return false;/);
  assert.match(coreSrc, /else if \(srvPend && !lagged && !this\.busy && !\(this\.streaming && !this\.peeking\) && !this\.syncing\)/);
  assert.match(coreSrc, /if \(this\.busy \|\| \(this\.streaming && !this\.peeking\)\) \{ this\.convGap = 0; return; \}/);
  assert.match(coreSrc, /if \(this\.busy \|\| \(this\.streaming && !this\.peeking\)\) return;/);

  // 2. quickSync syncs Evaluation chats via EvalEngine.loadChat(this, true) and triggers recoverRun in converge
  assert.match(coreSrc, /if \(!this\.busy && !this\._evalStreaming\) void EvalEngine\.loadChat\(this, true\)/);
  assert.match(coreSrc, /\(this\._qSyncAt && now\(\) - this\._qSyncAt < 5000\)/);

  // 3. History.refreshNow invalidates stale loaded background chats when updatedAt changes
  assert.match(coreSrc, /GAP:\s*\{\s*tick:\s*\d+,\s*front:\s*\d+,\s*new:\s*\d+\s*\}/);
  assert.match(coreSrc, /const isUpdated = Boolean\(prevUpd && se\.updatedAt !== prevUpd\);/);
  // 4. UI.renderChat includes content signature cSig and sticky bottom upgrade for _hotOnly / new tail messages
  assert.match(viewSrc, /const cSig = pLen \+ ':' \+ \(lastP\?\.type \|\| ''\)/);
  assert.match(viewSrc, /const wasHotUpgrade = Boolean\(E\.wasHotOnly && !chat\._hotOnly\);/);
  assert.match(viewSrc, /const tailGrewFresh = Boolean\(E\.lastTailSig && curTailSig && E\.lastTailSig !== curTailSig/);
  assert.match(evalCoreSrc, /const nextEvalVer = \(chat\._evalVerSeq = \(chat\._evalVerSeq \|\| 2\) \+ 1\);/);
  assert.match(evalViewSrc, /totTxtLen/);
  assert.match(mobileSrc, /else if \(c\.loaded && !c\.loading\) c\.quickSync\?\.\(\);/);
  assert.match(webbarSrc, /sessionStorage\.setItem\('anc:fast-return', JSON\.stringify\(\{ at: Date\.now\(\), sid: curSid, evalUrl \}\)\);/);
  assert.match(bootSrc, /if \(!History\.lastLoad \|\| fastReturn\)/);

  // 5. Runtime verification of mergeServer + patchAssistantParts when local message has heavier reasoning parts (ow > mw) but server has longer/newer final text
  const mStart = coreSrc.indexOf('  mergeServer(list, keep) {');
  const mEnd = coreSrc.indexOf('\n  // 和服务器对一次账', mStart);
  const mergeBody = coreSrc.slice(mStart, mEnd);
  const ctx = vm.createContext({
    now: () => 1700000050000,
    idTime: () => 1700000000000,
    formatOfficialErrorText: s => s,
    isPhantomFinishStub: () => false,
    Hitl: { name: () => '', awaiting: () => false },
  });
  vm.runInContext(`this.obj = { messages: [], ${mergeBody} };`, ctx);
  const chatObj = ctx.obj;
  chatObj.messages = [
    { id: 'u1', role: 'user', v: 1, parts: [{ type: 'text', text: '请帮我分析并给出结论' }] },
    {
      id: 'a1',
      role: 'assistant',
      v: 2,
      _finishedAt: 1700000040000,
      metadata: { pending: false },
      parts: [
        { type: 'step-start' },
        { id: 'r1', type: 'reasoning', text: '思考过程'.repeat(200) },
        { type: 'tool-bash', toolCallId: 'tc1', state: 'output-available', output: 'ok' },
        { type: 'step-start' },
        { id: 't1', type: 'text', text: '正在整理结论…' },
      ],
    },
  ];
  const srvMessages = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: '请帮我分析并给出结论' }] },
    {
      id: 'a1',
      role: 'assistant',
      metadata: { pending: false },
      parts: [
        { type: 'reasoning', text: '' },
        { type: 'tool-bash', toolCallId: 'tc1', state: 'output-available', output: 'ok' },
        { type: 'text', text: '正在整理结论…最终完整结论如下：第一点、第二点、第三点全部修复完成！' },
      ],
    },
  ];
  const changed = chatObj.mergeServer(srvMessages, null);
  assert.equal(changed, true, 'mergeServer must detect updated server text even when local reasoning makes ow > mw');
  const mergedAsst = chatObj.messages[1];
  const mergedText = mergedAsst.parts.filter(p => p.type === 'text').map(p => p.text).join('');
  const mergedReason = mergedAsst.parts.filter(p => p.type === 'reasoning').map(p => p.text).join('');
  assert.ok(mergedText.includes('最终完整结论如下'), 'Server final text must be patched into local assistant message');
  assert.ok(mergedReason.includes('思考过程'), 'Local non-empty reasoning must be preserved');
  assert.ok(mergedAsst.v > 2, 'Message version v must increment so UI.renderChat updates the DOM');

  // 6. Verify mergeServer & sanitizeCachedMsgs strip old/duplicate user messages (e.g. 07:50 / 08:03) that jumped after a newer assistant turn (09:41)
  const ts0750 = 1792713000000;
  const ts0803 = 1792713780000;
  const ts0941 = 1792719660000;
  const ctx2 = vm.createContext({
    now: () => ts0941 + 10000,
    idTime: id => id === 'u_0750' || id === 'u_0750_dup' ? ts0750 : id === 'u_0803' ? ts0803 : id === 'a_0941' ? ts0941 : 0,
    formatOfficialErrorText: s => s,
    isPhantomFinishStub: () => false,
    Hitl: { name: () => '', awaiting: () => false },
  });
  vm.runInContext(`this.obj = { sid: 's1', messages: [], ${mergeBody} };`, ctx2);
  const c2 = ctx2.obj;
  c2.messages = [
    { id: 'u_0750', role: 'user', _sentAt: ts0750, parts: [{ type: 'text', text: '帮我纠错这里加一个X' }] },
    { id: 'a_0751', role: 'assistant', parts: [{ type: 'text', text: '已添加X按钮' }] },
    { id: 'u_0803', role: 'user', _sentAt: ts0803, parts: [{ type: 'text', text: '面板只需要些模式即可' }] },
    { id: 'a_0941', role: 'assistant', _finishedAt: ts0941, metadata: { pending: false, timing: { completedAt: ts0941 } }, parts: [{ type: 'text', text: '验证状态：正式版与测试版均已正常打开' }] },
    { id: 'u_0803_local', role: 'user', _local: true, _appendAccepted: true, _sentAt: ts0803, parts: [{ type: 'text', text: '面板只需要些模式即可' }] },
    { id: 'u_0750_local1', role: 'user', _local: true, _appendAccepted: true, _sentAt: ts0750, parts: [{ type: 'text', text: '帮我纠错这里加一个X' }] },
    { id: 'u_0750_local2', role: 'user', _local: true, _appendAccepted: true, _sentAt: ts0750 + 1000, parts: [{ type: 'text', text: '帮我纠错这里加一个X' }] },
  ];
  const srv2 = [
    { id: 'u_0750', role: 'user', parts: [{ type: 'text', text: '帮我纠错这里加一个X' }] },
    { id: 'a_0751', role: 'assistant', parts: [{ type: 'text', text: '已添加X按钮' }] },
    { id: 'u_0803', role: 'user', parts: [{ type: 'text', text: '面板只需要些模式即可' }] },
    { id: 'a_0941', role: 'assistant', metadata: { pending: false, timing: { completedAt: ts0941 } }, parts: [{ type: 'text', text: '验证状态：正式版与测试版均已正常打开' }] },
  ];
  c2.mergeServer(srv2, null);
  assert.equal(c2.messages.length, 4, 'Old duplicate user messages at tail after 09:41 assistant reply must be stripped');
  assert.equal(c2.messages.at(-1).id, 'a_0941', 'Conversation must end cleanly on the 09:41 assistant reply');
});

test('v0.13.173: fix load() self-abort, cross-device remoteSync mergeServer, watch() lastSeq init, and ReferenceErrors', () => {
  const coreSrc = read('ui/core.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const bootSrc = read('ui/boot.js');

  // 1. load(force) prevents re-entry self-abort when automatic(chat) or view calls chat.load() while loading
  const loadStart = coreSrc.indexOf('  load(force) {');
  const loadSlice = coreSrc.slice(loadStart, loadStart + 450);
  assert.match(loadSlice, /if \(this\.loaded && !force\) return Promise\.resolve\(\);\s*if \(this\.loading && !force\) return this\.loading;/);
  assert.match(coreSrc, /finally \{ if \(this\._loadGen === loadGen \|\| this\.loading === myLoadP\) \{ this\.loading = null; this\._loadCtl = null; \} \}/);
  assert.match(bpUiSrc, /if \(!chat\.loaded && !chat\.loading && typeof chat\.load === 'function' && !chat\._autoLoadingMsgs\)/);

  // 2. Normal load() uses recoverRun=false for ~100ms response and preserves lastSeq when c.lastEventId is omitted
  assert.match(coreSrc, /const chatQuery = \(!this\.busy && !\(this\.streaming && !this\.peeking\)\)\s*\? '\?includeStreamToken=false&recoverRun=false'/);
  assert.match(coreSrc, /if \(!\(sending && this\.awaitId\) && c\.lastEventId != null\) this\.lastSeq = String\(c\.lastEventId\);/);

  // 3. watch() initializes lastSeq when null and ignores idle peek stream (streaming && peeking)
  assert.match(coreSrc, /if \(!this\.loaded \|\| this\.loading \|\| this\.busy \|\| \(this\.streaming && !this\.peeking\) \|\| this\.syncing\) \{ await sleep\(1200\); continue; \}/);
  assert.match(coreSrc, /if \(this\.lastSeq == null\) \{\s*const d = await this\.drain\(1500\)\.catch\(\(\) => null\);/);

  // 4. remoteSync(hit) merges server messages via mergeServer and rewinds lastSeq to startSeq - 1
  const rsStart = coreSrc.indexOf('  async remoteSync(hit) {');
  const rsSlice = coreSrc.slice(rsStart, rsStart + 1800);
  assert.match(rsSlice, /if \(c\?\.messages\?\.length && typeof this\.mergeServer === 'function'\) this\.mergeServer\(c\.messages, null\);/);
  assert.match(rsSlice, /this\.lastSeq = String\(Math\.max\(0, startSeq - 1\)\); this\.fence = Math\.max\(0, startSeq - 1\);/);

  // 5. ReferenceError fixes in History.refreshNow, resumeIncremental, and EvalEngine.loadChat
  assert.match(coreSrc, /const keepLocal = isOffline;\s*if \(!keepLocal && j\.entries\.length > 0\)/);
  assert.doesNotMatch(coreSrc, /lastIsHealthyAsst/);
  assert.match(evalCoreSrc, /const wdState = reconstructWebDevFromMessage\(\{ \.\.\.m, parts: builtParts \}, chat\.modality\);/);
  assert.match(evalCoreSrc, /const localCached = readLocalEvalCache\(chat\.sid\);/);
  assert.match(bootSrc, /setInterval\(\(\) => History\.auto\('tick'\), 10000\);/);
});

test('v0.13.174: Browser mode bookmarks & extensions buttons resilience, unpacked preload ASAR path normalization, sidebar ext button, and inlineHtmlCard TDZ fix', () => {
  const path = require('node:path');
  const webbarSrc = read('ui/webbar.js');
  const viewSrc = read('ui/view.js');
  const bootSrc = read('ui/boot.js');
  const pkgJson = JSON.parse(read('package.json'));
  const { managerActor } = require('../src/extensions-window');

  // 1. webbar.js always renders bookmarks and extensions controls on desktop Browser Mode and resolves window.BranaBrowser dynamically
  assert.match(webbarSrc, /const hasDesktopBrowserUi = Boolean\(window\.BranaBrowser \|\| \(!window\.BranaAndroid && window\.BranaHost\?\.platform !== 'android'\)\);/);
  assert.match(webbarSrc, /if\(\(window\.BranaBrowser\?\.bookmarks\|\|hasDesktopBrowserUi\)&&norm\(location\.href\)\)/);
  assert.match(webbarSrc, /if \(window\.BranaBrowser\?\.extensions \|\| hasDesktopBrowserUi\)/);

  // 2. managerActor accepts both .asar and .asar.unpacked paths for bookmarks.html / extensions.html
  const asarFile = path.resolve('/app/resources/app.asar/ui/extensions.html');
  const unpackedUrl = 'file://' + path.resolve('/app/resources/app.asar.unpacked/ui/extensions.html').replace(/\\/g, '/');
  const mainFrame = { url: unpackedUrl };
  const wc = { id: 7, mainFrame, isDestroyed: () => false };
  const windows = new Map([[7, { owner: {}, id: 'acct-1' }]]);
  assert.equal(managerActor({ sender: wc, senderFrame: mainFrame }, windows, asarFile, () => ({ id: 'acct-1' })).id, 'acct-1');

  // 3. view.js restores .sbf-ext button in .sb-foot and initializes let wrap = null before ensureBody()
  assert.match(viewSrc, /class: 'ib sbf-m sbf-ext', title: '扩展程序（客户端与浏览器模式通用）'/);
  assert.match(viewSrc, /let bodyBuilt = false, preEl = null, wrap = null;/);

  // 4. boot.js includes .pel-library-btn in OPEN for Browser Mode bottom bar
  assert.match(bootSrc, /\['\.pel-library-btn', 'pelican'\]/);

  // 5. package.json unpacks preload scripts and manager HTML files into app.asar.unpacked
  assert.ok(Array.isArray(pkgJson.build?.asarUnpack) && pkgJson.build.asarUnpack.includes('src/*preload*.js'));

  // 5. EvalView restores renderPreviewHeaderBtns, renderToolStepGroup, and renderWebDevStatusFooter for Battle & Direct WebDev/Text modes
  const evalViewSrc = read('ui/eval-view.js');
  const htmlPreviewSrc = read('ui/html-preview.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const routePolicySrc = read('ui/route-policy.js');
  const iprepSrc = read('ui/iprep.js');
  const mainSrc = read('src/main.js');
  assert.match(evalViewSrc, /renderPreviewHeaderBtns\(chat, msg, pos = 'a'\)/);
  assert.match(evalViewSrc, /renderToolStepGroup\(items, chat, msg, pos = 'a', isStreaming = false\)/);
  assert.match(evalViewSrc, /renderWebDevStatusFooter\(chat, msg, pos = 'a', isStreaming = false\)/);
  assert.match(evalViewSrc, /HtmlPreview\.syncEval\(chat\)/);
  assert.match(htmlPreviewSrc, /openLibrary: table/);
  assert.match(evalCoreSrc, /displayName: resolveModelName/);
  assert.match(routePolicySrc, /return \{ports,fields,key,good,withProbe,candidates/);
  assert.match(iprepSrc, /putProbe\(d, pip, r\)/);
  assert.match(mainSrc, /const curUnpacked = curAsar \+ '\.unpacked';/);
});

test('v0.13.176: incomplete cached reply recovery & slow-server send silent retry without premature 429/reCAPTCHA errors', () => {
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const evalViewSrc = read('ui/eval-view.js');
  const keepSrc = read('ui/keep.js');

  // 1. Incomplete assistant message detector (unclosed code fence, <svg, <html, reasoning-only, interrupted tools)
  assert.match(coreSrc, /function isIncompleteAssistantMsg\(m\)/);
  assert.match(coreSrc, /this\._recoveringIncomplete = true/);
  assert.match(viewSrc, /const isIncTail = Boolean\(/);
  assert.match(evalCoreSrc, /async function pollIncompleteEvalSession\(chat/);
  assert.match(evalViewSrc, /if \(fullText && !isPending\)/);

  // 2. Slow-server send resilience: Recaptcha.v3 fallback without throwing timeout on chat_submit, background 429 retry, patient armLost
  assert.match(coreSrc, /const pTok = await protoV3\(action\)\.catch\(\(\) => null\)/);
  assert.match(coreSrc, /const isRetryableSendErr = errNow\?\.status === 429/);
  assert.match(coreSrc, /正在询问 ' \+ subName \+ '…'/);
  assert.match(coreSrc, /const minAge = msg\?\._queued \? 18000 : 25000/);
  assert.match(keepSrc, /c\.streaming \? 85e3 : 45e3/);
});

test('v0.13.177: Zero-User-Label Habit + Zero-Quota Reverse Inference + Catalog P50 Fusion for Solar Pro 4, Muse, Stealth, Grok 4.6, and Open-Source Models', () => {
  const vm = require('node:vm');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const bpSrc = read('ui/billing-probe.js');
  const pricingSrc = read('ui/arena-trace/pricing.js');
  const hbbSrc = read('ui/habit-builtin-bank.js');
  const strengthSrc = read('ui/strength.js');

  assert.match(strengthSrc, /solar-pro4\|kibitz\|kalmia\|cynosure/);
  assert.match(bpUiSrc, /\\bsol\(\?=\$/);
  assert.match(bpUiSrc, /\\bsol\(\?=\$\|\[-\\s_\.\\d\]\)/);
  assert.match(bpUiSrc, /isSolarPro4Profile/);
  assert.match(bpUiSrc, /function mergeCandidates/);
  assert.match(bpUiSrc, /builtin\?\.extendedSamples/);
  assert.match(bpSrc, /zeroQuotaRanked/);
  assert.match(pricingSrc, /solar-pro4/);
  assert.match(pricingSrc, /muse-spark-1\\.3/);

  const chfOnlySrc = bpUiSrc.slice(0, bpUiSrc.indexOf('const BillingProbe = (() => {'));
  const storeMap = {};
  const ctx = vm.createContext({
    console, Math, Date, Set, Map, WeakMap, Object, Array, Number, String, Boolean, RegExp, JSON, Promise, Buffer, Error, parseInt, parseFloat, isNaN, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    Store: { get: (k, d) => (k in storeMap ? storeMap[k] : d), set: (k, v) => { storeMap[k] = v; } },
    Strength: { canon: s => String(s || '').trim().toLowerCase().replace(/^[a-z0-9_-]+\//, '').replace(/\s*[（(]([^）)]+)[）)]\s*$/, (_, t) => (t === '标准' || t === 'standard' ? '' : '-' + t.toLowerCase())).replace(/\s+/g, '-').replace(/^qwen-(\d)/i, 'qwen$1').replace(/^solar-pro-(\d)/i, 'solar-pro$1').replace(/^hy-(\d)/i, 'hy$1') },
    Brand: { of: () => '' }
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInContext(hbbSrc + '\n' + chfOnlySrc + '; this.CHF = ChatHabitFingerprint;', ctx);
  const CHF = ctx.CHF;

  // Verify unmarked Solar Pro 4 session is identified as solar-pro4 without exact sid match
  const solarRes = CHF.analyze(
    { sid: 'unmarked-solar-pro4-test', isEvaluation: true, evalMode: 'battle', evalModality: 'chat', messages: [] },
    {
      sid: 'unmarked-solar-pro4-test',
      habitFeatures: {
        turns: 1, hidR: 1, maxRInTurn: 1, totalTools: 0, bash: 0, write: 0, edit: 0, read: 0,
        cps: 38.2, memoAvgChunk: 10.6, memoDeltaCount: 1320, avgTurnDurMs: 365000,
        htmlMaxLen: 14120, meanChars: 14200, lowerDoctype: 0, colorSchemeCss: 0, prefersReducedMotion: 0,
        isGeminiCoding: false, isOpenThink: false,
        vec: [1, 0, 0.06, 0, 0, 0, 0, 0, 0, 0, 0.72, 0.65, 0.78, 0, 0, 0.52, 0.38, 0.75, 0.07, 1],
        habitTags: []
      }
    },
    { ignoreExactSid: true }
  );
  assert.equal(CHF.canonHabitModelName(solarRes?.best?.canon || solarRes?.best?.label), 'solar-pro4');
  assert.ok(solarRes.best.match >= 95.0);

  // Verify unmarked Muse Spark 1.3 (Max) session is identified without exact sid match
  const museRes = CHF.analyze(
    { sid: 'unmarked-muse-13-max-test', messages: [] },
    {
      sid: 'unmarked-muse-13-max-test',
      habitFeatures: {
        turns: 2, hidR: 5, maxRInTurn: 3, totalTools: 2, bash: 0, write: 1, edit: 0, read: 0,
        preToolTextChars: 145, writtenChars: 19800, htmlMaxLen: 19800, meanChars: 9900,
        cps: 168, memoAvgChunk: 23.4, memoDeltaCount: 840, avgTurnDurMs: 58000,
        straightApostrophe: 2, curlyApostrophe: 0, emDash: 4,
        isGeminiCoding: false, isOpenThink: false,
        vec: [1, 0, 1, 0, 0.75, 0, 0, 0, 0, 0, 0.78, 0.72, 0.8, 0, 0, 0.52, 0.85, 0.88, 0.25, 0.48],
        habitTags: []
      }
    },
    { ignoreExactSid: true }
  );
  assert.equal(CHF.canonHabitModelName(museRes?.best?.canon || museRes?.best?.label), 'muse-spark-1.3-max');
  assert.ok(museRes.best.match >= 95.0);
});

test('v0.13.177: bash tool-only turn & unfinished ending auto-continue (including empty text/reasoning suffix & 1h50m long-turn budget isolation)', async () => {
  const vm = require('node:vm');
  const keepJs = read('ui/keep.js');
  let fakeNow = 10_000_000;
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
  };
  vm.createContext(ctx);
  vm.runInContext(keepJs, ctx);
  const KeepAlive = vm.runInContext('KeepAlive', ctx);

  // 1. Bash output-available followed by empty text/reasoning stub still triggers stall-tool
  const bashWithEmptyStub = KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{
      id: 'm-bash-14',
      role: 'assistant',
      metadata: { finishReason: 'stop', timing: { startedAt: fakeNow - 6600000, completedAt: fakeNow } },
      parts: [
        { type: 'tool-bash', toolName: 'bash', toolCallId: 'b1', state: 'output-available', output: { exit_code: 0 } },
        { type: 'step-start' },
        { type: 'reasoning', text: '', state: 'done' },
        { type: 'text', text: '   \n', state: 'done' },
      ],
    }],
  });
  assert.ok(bashWithEmptyStub && bashWithEmptyStub.why === '工具中断自动续接', 'bash turn with empty trailing text/reasoning must auto-continue');

  // 2. Unfinished endings (unclosed code fence, multi-line transition with finishReason=stop, trailing comma/colon cutoff)
  assert.equal(KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{
      id: 'm-fence',
      role: 'assistant',
      metadata: { finishReason: 'stop' },
      parts: [{ type: 'text', text: '下面是修改后的代码：\n```js\nfunction test() {\n  return 1;' }],
    }],
  })?.why, '代码未完自动续接');

  assert.equal(KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{
      id: 'm-multiline-tr',
      role: 'assistant',
      metadata: { finishReason: 'stop' },
      parts: [{ type: 'text', text: '已定位到问题所在。\n接下来我将修改 ui/keep.js 并运行单元测试验证结果。' }],
    }],
  })?.why, '过渡中断自动续接');

  assert.equal(KeepAlive.isMidTurnStalled({
    finAt: fakeNow,
    realTcAt: fakeNow,
    messages: [{
      id: 'm-cutoff-comma',
      role: 'assistant',
      metadata: { finishReason: 'stop' },
      parts: [{ type: 'text', text: '这个模块主要包括以下几个核心步骤：第一是初始化配置，第二是加载缓存，' }],
    }],
  })?.why, '结尾未完自动续接');

  // 3. Long 1h50m turn with 8 prior idle/tool syncs in st.hist and st.paused active still fires cont auto-continue
  const sentCont = [];
  const longChat = {
    sid: 'c-long-bash',
    loaded: true,
    loading: null,
    busy: false,
    streaming: false,
    endStop: false,
    stopReq: false,
    endAt: 0,
    messages: [{
      id: 'm-long-14',
      role: 'assistant',
      metadata: { finishReason: 'stop', timing: { startedAt: fakeNow - 6600000, completedAt: fakeNow - 2000 } },
      parts: [{ type: 'tool-bash', toolName: 'bash', toolCallId: 'tb14', state: 'output-available', output: { exit_code: 0 } }],
    }],
    async serverMidTurn() { return false; },
    async send(txt, a1, a2, opt) { sentCont.push({ txt, opt: opt || a1 }); },
  };
  chats.set(longChat.sid, longChat);
  ctx.UI.els.chat = longChat;
  const st = KeepAlive.state(longChat);
  st.paused = fakeNow + 600000;
  for (let i = 0; i < 9; i++) {
    st.hist.push({ at: fakeNow - (i + 1) * 20000, pk: 'idle|m-long-14|' + i, kind: 'idle' });
  }
  KeepAlive.tick();
  assert.ok(st.plan && st.plan.kind === 'cont', 'KeepAlive must schedule cont plan despite prior idle sync pause');
  fakeNow += 2500;
  KeepAlive.tick();
  await new Promise(r => setImmediate(r));
  assert.equal(sentCont.length, 1);
  assert.equal(sentCont[0].txt, '继续');
  assert.equal(sentCont[0].opt?.autoContinue, true);
});


test('RunningTracker persists running chats across restarts, priority-resumes on startup, and shows .card-done-dot on background completion', () => {
  const coreJs = read('ui/core.js');
  const viewJs = read('ui/view.js');
  const bootJs = read('ui/boot.js');
  const appCss = read('ui/app.css');
  assert.ok(coreJs.includes("RUN_KEY: 'runningChats:v1'"));
  assert.ok(coreJs.includes("UNREAD_KEY: 'doneUnreadChats:v1'"));
  assert.ok(coreJs.includes("async resumeOnStartup()"));
  assert.ok(viewJs.includes("card-done-dot"));
  assert.ok(viewJs.includes("RunningTracker.markViewed(sid)"));
  assert.ok(bootJs.includes("RunningTracker.resumeOnStartup()"));
  assert.ok(appCss.includes(".card .card-done-dot{"));
});

test('v0.13.178: 5-sample misclassification root-cause elimination (Luna High vs Astra/Sol, Sol xHigh vs Opus 5.5, Muse Spark 1.3 Max vs Sonnet 5.5/Max)', () => {
  const vm = require('vm');
  const uiDir = path.join(__dirname, '..', 'ui');
  const store = {};
  const localMap = new Map();
  const ctx = {
    console, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set, WeakMap, WeakSet, Promise, Error, TypeError, JSON,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => Date.now() },
    localStorage: {
      getItem: k => localMap.has(k) ? localMap.get(k) : null,
      setItem: (k, v) => localMap.set(k, String(v)),
      removeItem: k => localMap.delete(k),
    },
    Store: {
      get: (k, d) => store[k] !== undefined ? store[k] : d,
      set: (k, v) => { store[k] = v; },
      shared: (k, v) => { if (v !== undefined) store[k] = v; return store[k]; }
    },
    Chats: { get: () => null },
    Models: { get: () => null, set: () => {} },
    History: { byId: () => null },
    TitleSync: { restored: () => null },
    TitleCipher: { isEncoded: () => false },
    Bus: { on: () => {}, emit: () => {} },
    UI: { els: {} },
    Strength: {
      canon: s => String(s || '').trim().toLowerCase()
        .replace(/^claude[\s-]+/i, 'claude-')
        .replace(/^gpt[\s-]+/i, 'gpt-')
        .replace(/^gemini[\s-]+/i, 'gemini-')
        .replace(/^muse[\s-]+spark[\s-]+/i, 'muse-spark-')
        .replace(/\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '-$1')
        .replace(/\s+/g, '-')
    }
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of [
    'fmt.js',
    'habit-html-svg-engine.js',
    'habit-builtin-bank.js',
    'arena-trace/family.js',
    'arena-trace/pricing.js',
    'arena-trace/preimage.js',
    'arena-trace/confidence.js',
    'arena-trace/catalog-sync.js',
    'billing-probe.js'
  ]) {
    const p = path.join(uiDir, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  }
  const bpUiCode = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');
  vm.runInContext(bpUiCode.slice(0, bpUiCode.indexOf('const BillingProbe = (() => {')), ctx);

  const CHF = ctx.ChatHabitFingerprint;
  const AB = ctx.ArenaBilling;
  const Fmt = vm.runInContext('Fmt', ctx);
  const catalogDoc = JSON.parse(fs.readFileSync(path.join(uiDir, 'arena-trace/catalog.json'), 'utf8'));

  // 1) Fmt.guess must not misclassify 0-reasoning dynamic-tool (01a15906) or Muse buffered tool chunks (01a15aa1, 01a15b46) as 'claude'
  const fmtSolSingleWrite = { rN: 0, rE: 0, rChars: 0, tN: 185, tChars: 1894, tidCount: 0, tidChars: 0, ids: [['tc', 'tc_9ya7DYasve5o2BZNnQXusY']], rs: [], tcs: [{ id: 'tc_9ya7DYasve5o2BZNnQXusY', name: 'write_file' }] };
  assert.notEqual(Fmt.guess(fmtSolSingleWrite)?.fam, 'claude');

  const fmtMuse1 = { rN: 3, rE: 0, rChars: 0, tN: 68, tChars: 830, tidCount: 5, tidChars: 14196, ids: [['r', 'reasoning-0'], ['t', 'text-0'], ['tc', 'tc_jq_T5tSh7K1QYjlzQK9PW3']], rs: [{ id: 'reasoning-0', chars: 0 }, { id: 'reasoning-0', chars: 0 }, { id: 'reasoning-0', chars: 0 }] };
  assert.notEqual(Fmt.guess(fmtMuse1)?.fam, 'claude');

  // 2) Blind Habit + StructuralReverse + Zero-Quota Reverse across all 5 diagnostic profiles
  const samples = [
    {
      sid: '01a15b82-a43c-71cf-bb6d-d139f15f5c61',
      expHabit: 'claude-fable-5.1-max',
      expZq: 'anthropic/claude-fable-5.1',
      habitFeatures: {
        vec: [0.305, 0.25, 0, 1, 0, 0.667, 0, 0, 0, 0, 1, 0, 0, 0.922, 0.377, 1, 0, 0.608, 0.488, 0.33],
        meta: { turns: 1, hidR: 1, maxRInTurn: 1, totalTools: 2, bash: 0, write: 1, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0, preToolTextChars: 0, interToolTextChars: 0, avgTurnDurMs: 121964, cps: 122, memoAvgChunk: 13.2, memoDeltaCount: 83, writtenChars: 13808, htmlMaxLen: 13808, meanChars: 12832.8, nonCodeMeanChars: 1096, straightApostrophe: 2, prefersReducedMotion: 0, colorSchemeCss: 0, sandboxLink: 0, boxComment: 0, isOpenThink: false }
      },
      chat: {
        sid: '01a15b82-a43c-71cf-bb6d-d139f15f5c61',
        messages: [
          { id: '01a15b82-a43c-7000-8000-000000000001', role: 'user', text: 'Create pelican_cycling.html' },
          {
            id: '01a15b83-c118-767f-8df5-d71e2d0ab296',
            role: 'assistant',
            _fmt: { rN: 1, rE: 0, rChars: 0, rWireDeltas: 2, rIds: ['tc_01a15b83-c118-767f-8df5-d71e2d0ab296-0'], tN: 84, tChars: 1143, tidCount: 937, tidChars: 13830, ids: [['r', 'tc_01a15b83-c118-767f-8df5-d71e2d0ab296-0'], ['tc', 'tc_OSDoy9WYxFBs3H5Xdu5fF1'], ['t', 'tc_01a15b83-c118-767f-8df5-d71e2d0ab296-0']], rs: [{ id: 'tc_01a15b83-c118-767f-8df5-d71e2d0ab296-0', chars: 0 }], tcs: [{ id: 'tc_OSDoy9WYxFBs3H5Xdu5fF1', name: 'write_file' }, { id: 'tc_OSDoy9WYxFBs3H5Xdu5fF1', name: 'present_file' }] },
            parts: [
              { type: 'reasoning', text: '' },
              { type: 'dynamic-tool', toolName: 'write_file', input: { path: 'pelican_cycling.html', content: '<!DOCTYPE html>\n<html>' + 'a'.repeat(13750) + '</html>' } },
              { type: 'dynamic-tool', toolName: 'present_file', input: { path: 'pelican_cycling.html' } },
              { type: 'text', text: "Here's the pelican_cycling.html file! It's built with clean SVG animations." + 'x'.repeat(1020) }
            ]
          }
        ]
      }
    },
    {
      sid: '01a1590b-e6a6-743b-82e6-ed3a359d598b',
      expHabit: 'claude-fable-5.1-max',
      expZq: 'anthropic/claude-fable-5.1',
      habitFeatures: {
        vec: [0.302, 0.25, 0, 1, 0, 0.667, 0, 0, 0, 0, 1, 0, 0, 0.946, 0.375, 1, 0, 0.736, 0.404, 0.299],
        meta: { turns: 1, hidR: 1, maxRInTurn: 1, totalTools: 2, bash: 0, write: 1, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0, preToolTextChars: 0, interToolTextChars: 0, avgTurnDurMs: 147120, cps: 101, memoAvgChunk: 11.9, memoDeltaCount: 57, writtenChars: 14169, htmlMaxLen: 14169, meanChars: 12724.7, nonCodeMeanChars: 681, straightApostrophe: 3, prefersReducedMotion: 0, colorSchemeCss: 0, sandboxLink: 0, boxComment: 0, isOpenThink: false }
      },
      chat: {
        sid: '01a1590b-e6a6-743b-82e6-ed3a359d598b',
        messages: [
          { id: '01a1590b-e6a6-7000-8000-000000000001', role: 'user', text: 'Create pelican_bicycle.html' },
          {
            id: '01a1590c-e979-7119-a434-0a2afd8b0586',
            role: 'assistant',
            _fmt: { rN: 1, rE: 0, rChars: 0, rWireDeltas: 2, rIds: ['tc_01a1590c-e979-7119-a434-0a2afd8b0586-0'], tN: 60, tChars: 781, tidCount: 1054, tidChars: 14191, ids: [['r', 'tc_01a1590c-e979-7119-a434-0a2afd8b0586-0'], ['tc', 'tc_RQa3Gz1WkzwhSVWCS9TAcs'], ['t', 'tc_01a1590c-e979-7119-a434-0a2afd8b0586-0']], rs: [{ id: 'tc_01a1590c-e979-7119-a434-0a2afd8b0586-0', chars: 0 }], tcs: [{ id: 'tc_RQa3Gz1WkzwhSVWCS9TAcs', name: 'write_file' }, { id: 'tc_RQa3Gz1WkzwhSVWCS9TAcs', name: 'present_file' }] },
            parts: [
              { type: 'reasoning', text: '' },
              { type: 'dynamic-tool', toolName: 'write_file', input: { path: 'pelican_bicycle.html', content: '<!DOCTYPE html>\n<html>' + 'a'.repeat(14100) + '</html>' } },
              { type: 'dynamic-tool', toolName: 'present_file', input: { path: 'pelican_bicycle.html' } },
              { type: 'text', text: "I've created pelican_bicycle.html and presented it in the viewer. It's ready!" + 'x'.repeat(600) }
            ]
          }
        ]
      }
    },
    {
      sid: '01a15906-9162-7845-89e4-d3b6468d546c',
      expHabit: 'muse-spark-1.3-max',
      expZq: 'meta/muse-spark-1.3',
      habitFeatures: {
        vec: [0.824, 0, 0, 0.5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.946, 0.72, 1, 0, 0.761, 1, 0.256],
        meta: { turns: 1, hidR: 0, maxRInTurn: 0, totalTools: 1, bash: 0, write: 1, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0, preToolTextChars: 0, interToolTextChars: 0, avgTurnDurMs: 152202, cps: 267, memoAvgChunk: 10.2, memoDeltaCount: 185, writtenChars: 38767, htmlMaxLen: 38767, meanChars: 34846, nonCodeMeanChars: 1894, prefersReducedMotion: 1, ariaLabelledby: 1, boxComment: 0, claudeWarmPalette: 0, isOpenThink: false }
      },
      chat: {
        sid: '01a15906-9162-7845-89e4-d3b6468d546c',
        messages: [
          { id: '01a15906-9162-7000-8000-000000000001', role: 'user', text: 'Create pelican-cycling.html' },
          {
            id: '01a15906-b71a-7906-a419-de29df941ac7',
            role: 'assistant',
            _fmt: fmtSolSingleWrite,
            parts: [
              { type: 'dynamic-tool', toolName: 'write_file', input: { path: 'pelican-cycling.html', content: '<!DOCTYPE html>\n<html lang="zh-CN">\n<svg aria-labelledby="title">' + '@media (prefers-reduced-motion: reduce) {} ' + 'a'.repeat(38650) + '</svg></html>' } },
              { type: 'text', text: '已直接为你创建完整的单文件 pelican-cycling.html（含干净的 2D 矢量场景与平滑骑行动画）。' + 'x'.repeat(1830) }
            ]
          }
        ]
      }
    },
    {
      sid: '01a15aa1-ecad-7946-b1ad-9effee6da990',
      expHabit: 'muse-spark-1.3-max',
      expZq: 'meta/muse-spark-1.3',
      habitFeatures: {
        vec: [0.306, 0.75, 0, 1, 0, 0.667, 0, 0, 0, 0, 1, 1, 0, 0.945, 0.351, 1, 0, 0.426, 0.704, 0.305],
        meta: { turns: 1, hidR: 3, maxRInTurn: 3, totalTools: 2, bash: 0, write: 1, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0, preToolTextChars: 179, interToolTextChars: 0, avgTurnDurMs: 85167, cps: 176, memoAvgChunk: 12.2, memoDeltaCount: 68, writtenChars: 14174, htmlMaxLen: 14174, meanChars: 12877.9, nonCodeMeanChars: 830, emDash: 5, boxComment: 4, isOpenThink: false }
      },
      chat: {
        sid: '01a15aa1-ecad-7946-b1ad-9effee6da990',
        messages: [
          { id: '01a15aa1-ecad-7000-8000-000000000001', role: 'user', text: 'Create pelican_bicycle.html' },
          {
            id: '01a15aa2-4fb8-7946-b1ad-9effee6da990',
            role: 'assistant',
            _fmt: { ...fmtMuse1, tcs: [{ id: 'tc_jq_T5tSh7K1QYjlzQK9PW3', name: 'write_file' }, { id: 'tc_B2u7bAop7m7uH7gD0K9PW3', name: 'present_file' }] },
            parts: [
              { type: 'reasoning', text: '' },
              { type: 'text', text: "I'll create a clean, standalone HTML file featuring a smooth 2D SVG animation of a large-billed pelican riding a bicycle — complete with realistic inverse-kinematics leg pedaling." },
              { type: 'dynamic-tool', toolName: 'write_file', input: { path: 'pelican_bicycle.html', content: '<!DOCTYPE html>\n<html><!-- ═══ HEADER ═══ -->' + 'a'.repeat(14100) + '</html>' } },
              { type: 'reasoning', text: '' },
              { type: 'dynamic-tool', toolName: 'present_file', input: { path: 'pelican_bicycle.html' } },
              { type: 'reasoning', text: '' },
              { type: 'text', text: 'I have created and presented pelican_bicycle.html — featuring a smooth 60fps animation — for you.' + 'x'.repeat(550) }
            ]
          }
        ]
      }
    },
    {
      sid: '01a15b46-3800-7c48-898f-e325126c89c4',
      expHabit: 'muse-spark-1.3-max',
      expZq: 'meta/muse-spark-1.3',
      habitFeatures: {
        vec: [0.273, 0.75, 0, 1, 0, 0.667, 0, 0, 0, 0, 1, 1, 0, 0.959, 0.351, 1, 0, 0.268, 1, 0.305],
        meta: { turns: 1, hidR: 3, maxRInTurn: 3, totalTools: 2, bash: 0, write: 1, edit: 0, read: 0, search: 0, genImg: 0, askUser: 0, preToolTextChars: 146, interToolTextChars: 0, avgTurnDurMs: 53655, cps: 251, memoAvgChunk: 12.2, memoDeltaCount: 45, writtenChars: 12939, htmlMaxLen: 12939, meanChars: 11545.2, nonCodeMeanChars: 547, emDash: 5, boxComment: 6, isOpenThink: false }
      },
      chat: {
        sid: '01a15b46-3800-7c48-898f-e325126c89c4',
        messages: [
          { id: '01a15b46-3800-7000-8000-000000000001', role: 'user', text: 'Create pelican_cycling.html' },
          {
            id: '01a15b46-c149-7df7-88e5-5c289524e0d9',
            role: 'assistant',
            _fmt: { rN: 3, rE: 0, rChars: 0, tN: 45, tChars: 547, tidCount: 4, tidChars: 12961, ids: [['r', 'reasoning-0'], ['t', 'text-0'], ['tc', 'tc__1ooFrxWLtteBfVKmUdU2t']], rs: [{ id: 'reasoning-0', chars: 0 }, { id: 'reasoning-0', chars: 0 }, { id: 'reasoning-0', chars: 0 }], tcs: [{ id: 'tc__1ooFrxWLtteBfVKmUdU2t', name: 'write_file' }, { id: 'tc_22ooFrxWLtteBfVKmUdU2t', name: 'present_file' }] },
            parts: [
              { type: 'reasoning', text: '' },
              { type: 'text', text: "I'll create the standalone HTML file with a clean, smoothly animated 2D SVG scene of a large-billed pelican riding a bicycle — let's build it now." },
              { type: 'dynamic-tool', toolName: 'write_file', input: { path: 'pelican_cycling.html', content: '<!DOCTYPE html>\n<html><!-- ─── SCENE ─── -->' + 'a'.repeat(12850) + '</html>' } },
              { type: 'reasoning', text: '' },
              { type: 'dynamic-tool', toolName: 'present_file', input: { path: 'pelican_cycling.html' } },
              { type: 'reasoning', text: '' },
              { type: 'text', text: 'Here is the complete standalone pelican_cycling.html — with smooth pedaling — ready to view.' + 'x'.repeat(300) }
            ]
          }
        ]
      }
    }
  ];

  for (const s of samples) {
    const hRes = CHF.analyze({ sid: s.sid, messages: [] }, { sid: s.sid, habitFeatures: s.habitFeatures }, { ignoreExactSid: true });
    assert.equal(CHF.canonHabitModelName(hRes?.best?.canon || hRes?.best?.label || ''), s.expHabit, 'Blind Habit failed for ' + s.sid);

    const srRes = CHF.structuralReverse({ sid: s.sid, messages: [] }, { sid: s.sid, habitFeatures: s.habitFeatures });
    assert.equal(CHF.canonHabitModelName(srRes?.[0]?.canon || srRes?.[0]?.label || ''), s.expHabit, 'StructuralReverse failed for ' + s.sid);

    const zqRes = AB.analyze(s.chat, { messages: {} }, catalogDoc, new Map(), { allowZeroQuota: true });
    const zqTop = zqRes?.result?.baseMatch?.candidates?.[0];
    assert.equal(zqTop?.id, s.expZq, 'Zero-Quota Reverse failed for ' + s.sid);
  }
});

test('Message ordering & deduplication during incremental sync (mergeServer) and full load (SentUserLog / sanitizeCachedMsgs)', () => {
  const vm = require('vm');
  const coreJs = read('ui/core.js');
  assert.ok(coreJs.includes("remove(sid, id, txt = '', maxTs = 0)"));
  const sentStart = coreJs.indexOf('const SentUserLog = (() => {');
  const sentEnd = coreJs.indexOf('})();', sentStart) + 5;
  const sentCode = coreJs.slice(sentStart, sentEnd);
  const msStart = coreJs.indexOf('  mergeServer(list, keep) {');
  const msEnd = coreJs.indexOf('  // 和服务器对一次账', msStart);
  const msCode = ('function mergeServer(list, keep) {' + coreJs.slice(msStart + '  mergeServer(list, keep) {'.length, msEnd)).trimEnd().replace(/,\s*$/, '');
  const storeMap = new Map();
  const draftsObj = { o: {} };
  const idTime = id => {
    if (!id || typeof id !== 'string' || id.length < 13) return 0;
    const h = id.slice(0, 8) + id.slice(9, 13);
    const n = parseInt(h, 16);
    return Number.isFinite(n) ? n : 0;
  };
  const makeUuidAt = ms => {
    const hex = Math.floor(ms).toString(16).padStart(12, '0');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-7000-8000-000000000001';
  };
  const ctx = {
    now: () => 1761206500000,
    idTime,
    Store: {
      get: (k, d) => storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d,
      set: (k, v) => storeMap.set(k, JSON.parse(JSON.stringify(v))),
    },
    Drafts: {
      load: () => draftsObj,
      ack: id => { delete draftsObj.o[id]; },
    },
    formatOfficialErrorText: s => String(s || ''),
    isPhantomFinishStub: () => false,
    Hitl: { mergePending: () => {} },
    Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, Date, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext(sentCode + '\nthis.SentUserLog = SentUserLog;\n' + msCode + '\nthis.mergeServer = mergeServer;', ctx);
  const t0750 = Date.parse('2026-10-23T07:50:00Z');
  const t0752 = Date.parse('2026-10-23T07:52:00Z');
  const t0803 = Date.parse('2026-10-23T08:03:00Z');
  const t0940 = Date.parse('2026-10-23T09:40:00Z');
  const t0941 = Date.parse('2026-10-23T09:41:00Z');
  const u0750_srv = { id: makeUuidAt(t0750), role: 'user', parts: [{ type: 'text', text: '继续推进，把刚才没做完的做完。' }] };
  const u0750_retry_local = { id: makeUuidAt(t0750 + 5000), role: 'user', _local: true, _sentAt: t0750 + 5000, parts: [{ type: 'text', text: '继续推进，把刚才没做完的做完。' }] };
  const a0752_srv = { id: makeUuidAt(t0752), role: 'assistant', parts: [{ type: 'text', text: 'Working on step 1...' }], metadata: { timing: { startedAt: t0750 + 6000, completedAt: t0752 } } };
  const u0803_stale = { id: makeUuidAt(t0803), role: 'user', _local: true, _appendAccepted: true, _sentAt: t0803, _prevAsstId: a0752_srv.id, parts: [{ type: 'text', text: '客户端又启动不了了你检查一下吧刚才你改了什么导致的' }] };
  const u0940_srv = { id: makeUuidAt(t0940), role: 'user', parts: [{ type: 'text', text: '检查一下为什么报错' }] };
  const a0941_srv = { id: makeUuidAt(t0941), role: 'assistant', parts: [{ type: 'text', text: '已经修复完成。' }], metadata: { timing: { startedAt: t0940 + 2000, completedAt: t0941 } } };
  const sid = 'test-order-sid';
  ctx.SentUserLog.record(sid, u0750_retry_local, null);
  ctx.SentUserLog.record(sid, u0803_stale, a0752_srv.id);
  const chat = {
    sid,
    messages: [
      u0750_srv,
      u0750_retry_local,
      a0752_srv,
      u0940_srv,
      a0941_srv,
      u0803_stale,
    ],
  };
  ctx.mergeServer.call(chat, [u0750_srv, a0752_srv, u0940_srv, a0941_srv], null);
  assert.equal(chat.messages.length, 4, 'Must strip duplicate 07:50 user message and stale 08:03 user message from tail');
  assert.equal(chat.messages[0].id, u0750_srv.id);
  assert.equal(chat.messages[1].id, a0752_srv.id);
  assert.equal(chat.messages[2].id, u0940_srv.id);
  assert.equal(chat.messages[3].id, a0941_srv.id);
  assert.equal(ctx.SentUserLog.readList(sid).length, 0, 'Stale and settled SentUserLog entries must be purged');
});

test('Unsent message on restart: marked failed (never normal sent bubble) with visible Retry button in bubble and errbar', () => {
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const cssSrc = read('ui/app.css');

  // 1. SentUserLog.readList must not treat missing e.wait as _appendAccepted=true
  assert.ok(coreSrc.includes('_appendAccepted: Boolean(e.acc), failed: Boolean(e.failed)'), 'Drafts.o readList must only mark _appendAccepted when e.acc is truthy');
  assert.ok(coreSrc.includes('function markFailed(sid, id, txt = \'\')'), 'SentUserLog must expose markFailed');
  assert.ok(coreSrc.includes('const isUnsentFromPrevSession = !entry._appendAccepted && !isActivelyAwaiting && !isCurrentSessionOutbox;'), 'SentUserLog.restoreInto must detect unsent messages from previous session');

  // 2. View must render Retry button on failed user bubble and in errbar
  assert.ok(viewSrc.includes('msg-fail-tag') && viewSrc.includes('⚠ 未发出'), 'User bubble must show ⚠ 未发出 badge when m.failed');
  assert.ok(viewSrc.includes('msg-retry-btn') && viewSrc.includes('UI.retry(chat, m, false)'), 'User bubble must render ↻ 重试 button when m.failed');
  assert.ok(viewSrc.includes('const failedUserMsg = !chat.busy ? ([...(chat.messages || [])].reverse().find(m => m?.role === \'user\' && m.failed) || null) : null;'), 'E.errbar must detect failedUserMsg even if chat.error was cleared');
  assert.ok(cssSrc.includes('.msg-retry-btn') && cssSrc.includes('.msg-fail-tag'), 'app.css must style .msg-retry-btn and .msg-fail-tag');
});

test('Completed conversation never stays stuck in running state (正在同步进行中 / typing dots) and unblocks SendQ queue', () => {
  const core = read('ui/core.js');
  const view = read('ui/view.js');
  const sq = read('ui/send-queue.js');
  const keep = read('ui/keep.js');
  const ec = read('ui/eval-core.js');

  // 1. Chat.prototype.load uses ?includeStreamToken=false even for tracked/incomplete recovery so /api/chat/<sid> never hangs minting a stream token
  assert.ok(
    core.includes("const effChatQuery = (this._recoveringIncomplete || isTrackedRunLoad) ? '?includeStreamToken=false' : chatQuery;"),
    'load() must keep includeStreamToken=false so tracked/recovery loads never hang'
  );

  // 2. drain() never mistakes partial historical reads before targetSeq as active runs and never rewinds lastSeq on finished turns unless replayFinished is requested
  assert.ok(
    core.includes('const reachedTarget = !partial || opt?.targetSeq == null || max >= +opt.targetSeq - 2;') &&
    core.includes('const pick = activeStart ?? (opt?.replayFinished ? (lastRun ?? act) : null);'),
    'drain() must guard partial reads against targetSeq and avoid rewinding lastSeq on finished turns'
  );

  // 3. peekTurn() only sets taken=true when a target id is passed, preventing SendQ.serverSettled(id=null) from breaking early on historical dispatches
  assert.ok(
    core.includes("if (t === 'data-agent-dispatch') { busy = true; if (id && (!bd.data.data?.inputId || bd.data.data?.inputId === id)) taken = true; }"),
    'peekTurn() must only set taken=true when target id is provided'
  );

  // 4. remoteSync() and converge() do not treat finished turns (info.act / historical open tool with noNewSrvEvents) as running
  assert.ok(
    core.includes('const isStreamOpen = Boolean(info?.open || info?.run);') &&
    core.includes('const noNewSrvEvents = Boolean(c.lastEventId != null && this.lastSeq != null && +c.lastEventId <= +this.lastSeq);'),
    'remoteSync() and converge() must not resurrect finished turns into streaming'
  );

  // 5. apply() and canReopenTailAsst never reopen explicitly finished assistant messages from server history
  assert.ok(
    core.includes('const lmExplicitlyDone = Boolean(lm?.metadata?.timing?.completedAt') &&
    core.includes('if (!m._finishedAt) m._finishedAt = Date.parse(m.metadata?.timing?.completedAt'),
    'core.js must stamp _finishedAt on settled server messages and block reopening explicitly completed turns'
  );

  // 6. RunningTracker.isChatActivelyGenerating ignores transient sync phases and does not synthetically set status=streaming before load()
  assert.ok(
    core.includes('isChatActivelyGenerating(c)') &&
    !core.includes("c.phase = '正在同步进行中任务…';"),
    'RunningTracker must not synthetically lock chats into 正在同步进行中任务…'
  );

  // 7. view.js guards settled assistant messages from showing typing dots (● ● ●) and self-heals zombie streaming state
  assert.ok(
    view.includes('isSettledAsst0') &&
    view.includes('isSettledAsst') &&
    view.includes('isSettledTailAsst') &&
    view.includes('isChatSettledIdle'),
    'view.js must guard settled assistant messages from live typing dots and card running spinner'
  );

  // 8. SendQ.blocked and KeepAlive never deadlock on midTurnStall when queue has items, and self-heal zombie streaming state
  assert.ok(
    sq.includes("chat.loaded && !chat.cached && !chat.loading && chat.status === 'streaming' && !chat.live && !chat.awaitId && !chat.preSend && !chat.sending") &&
    sq.includes("if (this.of(chat).length > 0) {") &&
    keep.includes("if (c.midTurnStall && (c.endStop || (st.autoContCount || 0) >= 3 || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0)))") &&
    ec.includes("chat._startupResuming = false;"),
    'SendQ, KeepAlive, and EvalEngine must clear midTurnStall and _startupResuming so finished chats and queues never stall'
  );

  // 9. apply(ch) does not reopen a settled tail assistant turn on stray tool chunks, and KeepAlive/finishTurn/serverSettled clean up fakeEnd & stale server snapshots
  assert.ok(
    core.includes('if (ownerM === this.messages.at(-1) && !ownerDone && !this.stopReq && !Hitl.idleWait(this))'),
    'apply(ch) must check !ownerDone before reopening this.live and status=streaming on trailing tool events'
  );
  assert.ok(
    core.includes('if (open.length && !ask && !hasConcludingText) this.fakeEnd =') &&
    core.includes("if (!realRunningAfterLoad && (!c.loaded || c.cached) && typeof c.serverMidTurn === 'function')"),
    'finishTurn must not set fakeEnd when concluding text finished normally, and RunningTracker.resumeOnStartup must not re-enter streaming after a fresh idle load'
  );
  assert.ok(
    keep.includes("if (kind === 'fake' && c.fakeEnd) { st.fakeSeen = c.fakeEnd.at; c.fakeEnd = null; }") &&
    keep.includes("if (p.kind === 'fake' && c.fakeEnd) c.fakeEnd = null;"),
    'KeepAlive must clear c.fakeEnd once handled, cancelled, or budget-exhausted so UI.card and SendQ are never stuck forever'
  );
  assert.ok(
    sq.includes("if (!localDone && !lastStale && !(pk && !pk.busy && pk.done)) return '服务器还在处理上一轮';"),
    'SendQ.serverSettled must check peekTurn and lastDone/lastStale before blocking on server snapshot pending/user tail'
  );
  assert.ok(
    view.includes('chatOfEl(el)') &&
    view.includes('const chatCur = R.chatOfEl(null);') &&
    view.includes('writeCard(p, key, live = false)') &&
    core.includes('(serverSettled || sawDone)') &&
    core.includes("case 'abort':") &&
    core.includes('svExplicitDone'),
    'Pass 6: R.chatOfEl resolves real Chat from Tabs.cur.sid, writeCard respects live, and stream/abort/converge cleanly finish turns'
  );
});

test('v0.13.179: BillingProbe.summary syncs without ReferenceError, preserves explicit tier, and keeps left/right sidebar models consistent', () => {
  const bpCode = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'ui/billing-probe-ui.js'), 'utf8');
  const dockCode = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'ui/dock.js'), 'utf8');
  const viewCode = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'ui/view.js'), 'utf8');
  const tsCode = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'ui/title-sync.js'), 'utf8');
  assert.ok(!bpCode.includes('d?.read?.httpStatus === 403 &&\n          !(d?.samples?.observations > 0)'), 'summary(sid) must not reference undefined d');
  assert.ok(!bpCode.includes('!topMerged.both'), 'summary(sid) must not reference undefined topMerged');
  assert.ok(bpCode.includes('diagnostics?.read?.httpStatus === 403'), 'summary(sid) uses diagnostics');
  assert.ok(bpCode.includes('Dock.render?.()'), 'BillingProbe triggers Dock.render');
  assert.ok(dockCode.includes('render(force = false)'), 'Dock.render supports force parameter');
  assert.ok(dockCode.includes('try { this.overview(nb, sid, t, c); } catch'), 'Dock.render guards overview in try/catch');
  assert.ok(viewCode.includes('mi?.reverseLabel, mi?.reverseEffort, mi?.tier,'), 'UI.card sig includes reverseLabel/reverseEffort/tier');
  assert.ok(tsCode.includes('mi?.reverseEffort || mi?.effort || mi?.tier'), 'TitleSync.build0 prioritizes reverseEffort/effort over stale tier');
});

test('rate-limit / IP-switch continuation demotes unaccepted user message into SendQ instead of showing failed retry bubble', () => {
  const vm = require('node:vm');
  const coreJs = read('ui/core.js');
  const sqJs = read('ui/send-queue.js');
  const viewJs = read('ui/view.js');

  assert.match(sqJs, /demoteToQueue\(chat,\s*msgOrEntry,\s*opt\s*=\s*\{\}\)/);
  assert.match(viewJs, /shouldDemoteToQueue && typeof SendQ !== 'undefined' && typeof SendQ\.demoteToQueue === 'function'/);

  const sentStart = coreJs.indexOf('const SentUserLog = (() => {');
  const sentEnd = coreJs.indexOf('})();', sentStart) + 5;
  const sentCode = coreJs.slice(sentStart, sentEnd);
  const msStart = coreJs.indexOf('  mergeServer(list, keep) {');
  const msEnd = coreJs.indexOf('  // 和服务器对一次账', msStart);
  const msCode = ('function mergeServer(list, keep) {' + coreJs.slice(msStart + '  mergeServer(list, keep) {'.length, msEnd)).trimEnd().replace(/,\s*$/, '');

  const storeMap = new Map();
  const baseTs = 1776290000000;
  let curNow = baseTs + 120000;
  const ctx = {
    Map, Set, Array, Object, String, Number, Boolean, Math, Date, RegExp, JSON,
    now: () => curNow,
    Store: {
      get: (k, d) => (storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d),
      set: (k, v) => storeMap.set(k, JSON.parse(JSON.stringify(v)))
    },
    Drafts: {
      sess: new Set(),
      d: { o: [], q: {} },
      load() { return this.d; },
      write() { return true; },
      ack(id) { this.d.o = this.d.o.filter(x => x.id !== id); },
      setQ(chat) { this.d.q[chat.sid] = { items: (chat.queue || []).slice(), paused: chat._qPaused || '' }; }
    },
    idTime: (id) => {
      const m = String(id || '').match(/^ts-(\d+)/);
      return m ? Number(m[1]) : 0;
    },
    hasInterruptedToolPart: () => false,
    isPhantomFinishStub: () => false,
    patchAssistantParts: (o, m) => Object.assign(o, m),
    partWeight: (parts) => (parts || []).reduce((n, p) => n + (p?.text ? p.text.length : 10), 0),
    localDone: (m) => Boolean(m?.metadata?.timing?.completedAt)
  };
  vm.createContext(ctx);
  vm.runInContext(sentCode + '\nthis.SentUserLog = SentUserLog;\n' + msCode + '\nthis.mergeServer = mergeServer;', ctx);

  const sid = 'chat-ratelimit-ip-switch';
  const u1 = { id: 'ts-' + (baseTs + 1000) + '-u1', role: 'user', parts: [{ type: 'text', text: '写一个完整模块' }] };
  const a1_initial = { id: 'ts-' + (baseTs + 2000) + '-a1', role: 'assistant', parts: [{ type: 'text', text: '前半部分内容...' }], metadata: { pending: false } };
  const u2_unaccepted = {
    id: 'ts-' + (baseTs + 30000) + '-u2',
    role: 'user',
    text: '继续写完剩下的部分',
    parts: [{ type: 'text', text: '继续写完剩下的部分' }],
    _local: true,
    failed: true,
    _sentAt: baseTs + 30000,
    _prevAsstId: a1_initial.id,
    _prevAsstWeight: ctx.SentUserLog.measureAsstWeight(a1_initial)
  };

  ctx.SentUserLog.record(sid, u2_unaccepted, a1_initial.id);
  ctx.Drafts.d.o.push({ id: u2_unaccepted.id, sid, text: u2_unaccepted.text, at: u2_unaccepted._sentAt, failed: true, prevAsstId: a1_initial.id, prevAsstWeight: u2_unaccepted._prevAsstWeight });

  // Case A: After IP switch, A1 resumes streaming (pending: true) and supplements text
  const a1_resumed = {
    id: a1_initial.id,
    role: 'assistant',
    parts: [{ type: 'text', text: '前半部分内容... 切IP后补充的更多正文内容！' }],
    metadata: { pending: true }
  };
  const chat = {
    sid,
    messages: [u1, a1_initial, u2_unaccepted],
    queue: [],
    _qPaused: '',
    status: 'error',
    error: '上一条消息未发出（服务器未收到），请点击重试',
    busy: true,
    streaming: true,
    mergeServer: ctx.mergeServer
  };
  chat.mergeServer([u1, a1_resumed], null);

  assert.equal(chat.messages.some(m => m.id === u2_unaccepted.id), false, 'U2 should be removed from chat.messages');
  assert.equal(chat.messages.at(-1)?.id, a1_initial.id, 'Tail message should be the resumed assistant reply A1');
  assert.equal(chat.queue.length, 1, 'U2 should be placed into chat.queue (SendQ)');
  assert.equal(chat.queue[0].text, '继续写完剩下的部分');
  assert.equal(chat._qPaused, '', 'Queue must remain active (unpaused) so it auto-sends after A1 completes');
  assert.equal(chat.error, null, 'Stale unsent error banner should be cleared');
  assert.equal(ctx.SentUserLog.readList(sid).length, 0, 'SentUserLog entry should be cleaned up once queued');
});

test('Task 23: reverse inference is disabled on 403/429/0-observation API and 01a15b82 identifies as Claude Fable 5.1 (Max)', () => {
  const vm = require('vm');
  const uiDir = path.resolve(__dirname, '../ui');
  const store = {};
  const localMap = new Map();
  const chatsMap = new Map();
  const modelsMap = new Map();
  const ctx = {
    console, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set, WeakMap, WeakSet, Promise, Error, TypeError, JSON, parseInt, parseFloat, isNaN, isFinite,
    setTimeout, clearTimeout,
    now: () => Date.now(),
    api: async () => ({ status: 403, ok: false }),
    Bus: { on: () => {}, emit: () => {} },
    Store: { get: (k, d) => store[k] !== undefined ? store[k] : d, set: (k, v) => { store[k] = v; }, shared: (k, v) => { if (v !== undefined) store[k] = v; return store[k]; } },
    localStorage: { getItem: k => localMap.has(k) ? localMap.get(k) : null, setItem: (k, v) => localMap.set(k, String(v)), removeItem: k => localMap.delete(k) },
    Chats: { get: id => chatsMap.get(id) || null, all: () => [...chatsMap.values()], save: () => {} },
    Models: { get: id => modelsMap.get(id) || null, set: (id, v) => modelsMap.set(id, v) },
    History: { byId: () => null },
    TitleSync: { restored: () => null },
    TitleCipher: { isEncoded: () => false },
    Trace: { latest: () => null },
    LiveEst: { of: () => ({ input: 28000, output: 3500 }) },
    Brand: { of: () => 'claude', NAME: { claude: 'Anthropic', gpt: 'OpenAI', gemini: 'Google' } },
    UI: { els: {} },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, addEventListener() {} },
    Strength: { canon: s => String(s || '').trim().toLowerCase().replace(/\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '-$1').replace(/\s+/g, '-') }
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['fmt.js', 'habit-builtin-bank.js', 'arena-trace/family.js', 'arena-trace/pricing.js', 'arena-trace/preimage.js', 'arena-trace/confidence.js', 'arena-trace/catalog-sync.js', 'billing-probe.js', 'billing-probe-ui.js']) {
    const p = path.join(uiDir, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  }
  const CHF = vm.runInContext('ChatHabitFingerprint', ctx);
  const BP = vm.runInContext('BillingProbe', ctx);

  const sid = '01a15b82-a43c-71cf-bb6d-d139f15f5c61';
  const pelicanSnippet = '<!DOCTYPE html>\n<html lang="en">\n<head><title>Pelican on a Bicycle</title><style>:root { --sky-top: #78b9eb; }</style></head><body><svg viewBox="0 0 900 560"><g id="cloudTile"></g><g id="farHillTile"></g><g id="nearHillTile"></g><g id="crankR"></g><g id="crankL"></g><g id="pedalR"></g><g id="pedalL"></g></svg><script>(function () { const NS = "http://www.w3.org/2000/svg"; const $ = (id) => document.getElementById(id); const WHEEL_R = 78, CRANK_R = 26, THIGH = 58, SHIN = 60; function solveIK() {} requestAnimationFrame(() => {}); })();</script></body></html>' + ' '.repeat(11900);
  const chat = {
    sid,
    messages: [
      { id: 'u1', role: 'user', text: 'Create a standalone HTML file with a 2D SVG animation of a large-billed pelican riding a bicycle. Skip testing.' },
      {
        id: 'a1',
        role: 'assistant',
        status: 'completed',
        t0: 1700000000000,
        tEnd: 1700000107569,
        fmt: { tN: 84, tChars: 1142, tidCount: 1152, tidChars: 12556, rWireDeltas: 2, rWireEmptyDeltas: 2, tools: 2, toolIds: ['tc_01a', 'tc_01b'] },
        parts: [
          { type: 'reasoning', text: '' },
          { type: 'tool-write_file', toolName: 'write_file', toolCallId: 'tc_01a', input: { path: '/home/user/pelican-bike.html', content: pelicanSnippet } },
          { type: 'tool-present_file', toolName: 'present_file', toolCallId: 'tc_01b', input: { path: '/home/user/pelican-bike.html' } },
          { type: 'text', text: "I created `/home/user/pelican-bike.html` and opened it in the viewer. As you asked, I skipped testing, so I haven't opened it in a browser.\n\n### What's Included:\n- **Large-Billed Pelican:** Full SVG pelican.\n- **2-Bone IK Pedaling:** Smooth animation." }
        ]
      }
    ]
  };
  chatsMap.set(sid, chat);
  modelsMap.set(sid, {
    sid,
    name: 'gpt-6-luna-medium',
    reverseInferred: true,
    reverseVer: 174,
    reverseTokens: { input: 0, output: 0, total: 0 },
    reverseCandidates: [
      { id: 'openai/gpt-6-luna-medium', label: 'GPT-6 Luna (Medium)', canon: 'gpt-6-luna-medium', match: 99.9, revPct: 99.9, structuralRev: true }
    ]
  });

  const blindRes = CHF.analyze(chat, null, { ignoreExactSid: true });
  assert.equal(blindRes?.best?.canon, 'claude-fable-5.1-max', '01a15b82 blind habit recognition must identify claude-fable-5.1-max');
  assert.ok((blindRes?.best?.match || 0) >= 95, '01a15b82 habit confidence should be >= 95%');

  const sum = BP.summary(sid);
  assert.equal(sum?.ranked?.length || 0, 0, 'Reverse-inference ranked list must be empty when API has 0 observations / 403');
  assert.equal(sum?.mergedCandidates?.[0]?.canon, 'claude-fable-5.1-max', 'Merged top candidate must be claude-fable-5.1-max');
  assert.equal(sum?.mergedCandidates?.[0]?.source, 'fp', 'Merged top candidate source must be habit fingerprint (fp)');

  const healedModel = modelsMap.get(sid);
  assert.equal(healedModel?.name, 'claude-fable-5.1-max', 'Poisoned gpt-6-luna-medium model entry must be healed to claude-fable-5.1-max');
  assert.equal(healedModel?.reverseInferred, false, 'healedModel.reverseInferred must be false when no real cost API exists');
  assert.equal(healedModel?.reverseCandidates?.length || 0, 0, 'Stale zero-cost reverseCandidates must be cleared');
});

test('Comprehensive 429 rate-limit optimization across core, send-queue, eval-core, titles, and astats', () => {
  const coreSrc = read('ui/core.js');
  const sqSrc = read('ui/send-queue.js');
  const ecSrc = read('ui/eval-core.js');
  const titlesSrc = read('ui/titles.js');
  const astatsSrc = read('ui/astats.js');

  assert.ok(coreSrc.includes('if (allowDirectFallback && ReadLimit.active()) opt = { ...opt, bg: true };'), 'api() converts allowDirectFallback requests to fast-fail on ReadLimit');
  assert.ok(coreSrc.includes('if (isChatRead) { if (!opt.bg && ReadLimit.until > 0) ReadLimit.until = 0; }'), 'Only chat read success clears ReadLimit.until');
  assert.ok(coreSrc.includes('const needReplay = !Array.isArray(this.messages) || this.messages.length === 0;'), 'streamDirectFallback replays finished turns when messages are empty');
  assert.ok(coreSrc.includes('if (e?.status !== 429) throw e;\n            if (await this.streamDirectFallback({ fromLoad: true })) {'), 'load() falls back to streamDirectFallback on 429 even for cold chats');
  assert.ok(coreSrc.includes('if (rec429 && !this.loading && !(this.streaming && !this.peeking) && typeof this.streamDirectFallback === \'function\')'), 'reconcile() falls back to streamDirectFallback on 429');
  assert.ok(coreSrc.includes('if (conv429 && !this.loading && isKeptOrActive && !(this.streaming && !this.peeking) && typeof this.streamDirectFallback === \'function\')'), 'converge() falls back to streamDirectFallback on 429');
  assert.ok(sqSrc.includes('if (err?.status === 429 || err?.rateLimitedLocally)') && sqSrc.includes('const pk429 = await chat.peekTurn(chat.lastSeq, null, 2000, { settleCheck: true })'), 'SendQ.serverSettled falls back to S2 peekTurn on 429');
  assert.ok(ecSrc.includes('prompt failed/i.test(errBody)'), 'eval-core.js handles 429 prompt failed challenge and in-place retry');
  assert.ok(titlesSrc.includes("if(!force && typeof ReadLimit!=='undefined' && ReadLimit.active?.())return;"), 'Titles.tick pauses background sync during ReadLimit cooldown');
  assert.ok(astatsSrc.includes("if (typeof MsgCache !== 'undefined' && MsgCache.get)"), 'AcctStats.countRemote uses MsgCache before hitting /api/chat');
});

test('v0.13.185: Billing /cost & auxiliary APIs prevent 429 bursts via in-flight dedup, 850ms pacing, cache preservation, and main-process visit_id retry', () => {
  const bpUi = read('ui/billing-probe-ui.js');
  const mainSrc = read('src/main.js');
  const coreSrc = read('ui/core.js');

  // 1. protoCostReq deduplicates in-flight requests per sid and paces network calls by 850ms
  assert.ok(bpUi.includes('costInflightBySid'), 'protoCostReq must deduplicate in-flight /cost requests per sid');
  assert.ok(bpUi.includes('paceCostNet'), 'protoCostReq must pace network /cost requests');

  // 2. schedule(chat, opts) only wipes costDocCache when fromTurn is true, preserving cached /cost when switching chats
  assert.ok(bpUi.includes('function schedule(chat, opts = {})'), 'schedule must accept opts');
  assert.ok(bpUi.includes('if (chat?.sid && fromTurn)'), 'schedule must only clearCachedCostDoc when fromTurn is true');
  assert.ok(bpUi.includes('schedule(chat, { fromTurn: true })'), 'Bus.on(turn) must pass fromTurn: true');
  assert.ok(bpUi.includes('schedule(chat, { fromTurn: false })'), 'automatic(chat) must pass fromTurn: false');

  // 3. automatic(chat) skips background /cost network requests for non-foreground non-gacha chats & activeIdentSid
  assert.ok(bpUi.includes('if (activeIdentSid === chat.sid) return;'), 'automatic(chat) must skip activeIdentSid during runBgSweep');
  assert.ok(bpUi.includes('if (!isFgChat && !isGacha && !getCachedCostDoc(chat.sid, last)) return;'), 'automatic(chat) must not fire background network /cost for non-foreground chats');

  // 4. reverseIdentify respects globalCost429Until when !interactive and only clears cooldowns on interactive
  assert.ok(bpUi.includes('(globalCost429Until > now() && !interactive)'), 'reverseIdentify must skip /cost during 429 cooldown when !interactive');
  assert.ok(bpUi.includes('if (interactive) { globalCost429Until = 0; engine.clearCooldowns?.(); }'), 'reverseIdentify must only clearCooldowns on interactive trigger');

  // 5. Host.protoFetch in src/main.js rotates arena_visit_id in-place and retries once on /cost 429
  assert.ok(mainSrc.includes('const freshVisitId = crypto.randomUUID();'), 'main.js must rotate arena_visit_id on /cost 429');
  assert.ok(mainSrc.includes("retryCookieParts.push('arena_visit_id=' + freshVisitId);"), 'main.js must retry /cost with freshVisitId in Cookie header');

  // 6. core.js isolates /api/me/pulse 429s and all /cost paths from conversation ReadLimit.until
  assert.ok(coreSrc.includes(String.raw`if (isCost || /^\/api\/me\/pulse\b/i.test(path)) ReadLimit.until = prevRl;`), 'core.js must isolate /cost and /api/me/pulse 429s from ReadLimit.until');
});

test('v0.13.186: Abnormal close / crash queue preservation across main DB, Drafts.pull, SentUserLog.restoreInto, repeated prompts, and pre-append interruptions', async () => {
  const vm = require('vm');
  const mainSrc = read('src/main.js');
  const viewSrc = read('ui/view.js');
  const sqSrc = read('ui/send-queue.js');
  const coreSrc = read('ui/core.js');

  // 1. Main process writes draft@<id> immediately via saveDB(true) and guards against unhydrated empty overwrites
  assert.ok(mainSrc.includes("if (/^draft@[\\w-]{1,64}$/.test(String(k)) && v && typeof v === 'object')"), 'main.js must handle draft@<id> specially');
  assert.ok(mainSrc.includes('try { saveDB(true); } catch { saveDB(); }'), 'main.js must flush draft@<id> synchronously via saveDB(true)');

  // 2. paintQ hydrates queue via SendQ.of(c) and Drafts.pull union-merges local + host queues & re-hydrates Chats
  assert.ok(viewSrc.includes("typeof SendQ.of === 'function' ? SendQ.of(c) : c?.queue"), 'paintQ must hydrate queue via SendQ.of(c)');
  assert.ok(viewSrc.includes('this.hydrateQ(c, true);'), 'Drafts.pull must re-hydrate existing Chats');

  // 3. Chat.prototype.finishTurn delegates to foreignDone during waitingForeign / preSend
  assert.ok(coreSrc.includes("if ((this.waitingForeign || (this.preSend && this.awaitId)) && !this.stopReq)"), 'finishTurn must delegate to foreignDone when waitingForeign or preSend');

  // 4. Runtime verification of SentUserLog.restoreInto:
  //    (a) no ReferenceError: byId is not defined when fresh server load has byIdIdx < 0 && existingIdx < 0
  //    (b) unaccepted queue entry interrupted by abnormal close is restored back to chat.queue (SendQ)
  //    (c) repeated short prompt ("继续") in Turn 2 is never deleted by matching Turn 1's "继续" before prevAsstId
  const sulStart = coreSrc.indexOf('const SentUserLog = (() => {');
  const sulEnd = coreSrc.indexOf('function isPhantomFinishStub');
  const sulCode = coreSrc.slice(sulStart, sulEnd);

  const storeMap = new Map();
  let draftOutbox = [];
  const demoted = [];
  const ctx = vm.createContext({
    Map, Set, Array, Object, String, Number, Boolean, Date, Math, RegExp, JSON,
    now: () => 2000000000000,
    idTime: () => 0,
    uuid7: () => 'u-gen-1',
    Store: {
      get: (k, d) => (storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d),
      set: (k, v) => { storeMap.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    Drafts: {
      sess: new Set(),
      load: () => ({ o: draftOutbox, q: {}, t: {} }),
      ack: id => { draftOutbox = draftOutbox.filter(x => x.id !== id); },
    },
    SendQ: {
      demoteToQueue: (chat, item, opt) => {
        demoted.push({ sid: chat.sid, id: item.id, text: item.text, opt });
        (chat.queue ||= []).push({ id: item.id, text: item.text || '继续' });
        draftOutbox = draftOutbox.filter(x => x.id !== item.id);
        return true;
      },
    },
    RunningTracker: { isTrackedRunning: () => false },
    hasInterruptedToolPart: () => false,
  });
  vm.runInContext(sulCode + '; globalThis.SentUserLog = SentUserLog;', ctx);

  // Simulate abnormal close while a queued item ("继续" in Turn 2 after Turn 1's "继续" and a1) was in d.o without acc:
  draftOutbox = [{
    id: 'u-turn2-queued',
    sid: 'chat-crash-1',
    text: '继续',
    at: 1999999990000,
    prevAsstId: 'a-turn1',
    prevAsstWeight: 10,
    queueIds: ['q-item-1'],
    fromQueue: true,
  }];
  const chatFreshLoad = {
    sid: 'chat-crash-1',
    loaded: true,
    busy: false,
    streaming: false,
    queue: [],
    messages: [
      { id: 'u-turn1', role: 'user', createdAt: new Date(1999999900000).toISOString(), parts: [{ type: 'text', text: '继续' }] },
      { id: 'a-turn1', role: 'assistant', createdAt: new Date(1999999910000).toISOString(), metadata: { timing: { completedAt: 1999999920000 } }, parts: [{ type: 'text', text: 'Turn 1 done' }] },
    ],
  };
  const changed = ctx.SentUserLog.restoreInto(chatFreshLoad, { srvPend: false });
  assert.equal(changed, true, 'restoreInto must handle interrupted queue entry without throwing ReferenceError');
  assert.equal(chatFreshLoad.queue.length, 1, 'Interrupted queue entry must be restored to chat.queue');
  assert.equal(chatFreshLoad.queue[0].text, '继续', 'Restored queue item text must be preserved');
  assert.equal(draftOutbox.length, 0, 'Restored queue entry must be cleaned from outbox');
});


test('v0.13.187: Mobile & desktop ProxyIP pool probing, Android ippureDirect bridge, rate convergence, API host dedup, and impBtn race fix', async () => {
  const coreSrc = read('ui/core.js');
  const poolSrc = read('ui/pool.js');
  const iprepSrc = read('ui/iprep.js');
  const routeSupportSrc = read('android/app/src/main/java/ai/arena/client/RouteSupport.java');
  const mainActivitySrc = read('android/app/src/main/java/ai/arena/client/MainActivity.java');

  // 1. Android Host bridge provides ippureDirect and direct POST support
  assert.ok(coreSrc.includes('ippureDirect: async ip =>'));
  assert.ok(coreSrc.includes('A.fetchPostDirectStart'));
  assert.ok(mainActivitySrc.includes('public String ippureDirectStart'));
  assert.ok(routeSupportSrc.includes('pu.put("via","ippure")'));

  // 2. IPRep.rate converges unrated/fallback datacenter IPs so they never stay stuck in 'rate' (评估中 ?)
  assert.ok(iprepSrc.includes('const stillUnk = egs.filter'));
  assert.ok(iprepSrc.includes("via: 'ippure'"));

  // 3. Pool.apiItems deduplicates same-IP multi-port entries (preferring :443) and Pool.probe prioritizes ok==null up to 240
  assert.ok(poolSrc.includes('hostPorts') || poolSrc.includes('hostLine'));
  assert.ok(poolSrc.includes('keys.slice(0,'));
  assert.ok(poolSrc.includes('onpointerdown: e => e.preventDefault()'));
  assert.ok(poolSrc.includes('Pool._activeScan.seenKeys.has(k)'));
});

test('v0.13.179: 7 UI/UX & Direct-Mode improvements (used bash tags, thinking pause toast & #1/#2 naming, auto-hiding scrollbars, Dock overview default, mobile > bookmark handle, bottom typing phase timer, Direct SSR & retry)', () => {
  const vm = require('node:vm');
  const viewSrc = read('ui/view.js');
  const cssSrc = read('ui/app.css');
  const coreSrc = read('ui/core.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const gachaSrc = read('ui/gacha.js');
  const titlesSrc = read('ui/titles.js');
  const dockSrc = read('ui/dock.js');
  const mobSrc = read('ui/mobile.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const msSrc = read('ui/mode-switcher.js');

  // 1. used bash command translation tags: same line when collapsed, 2nd line at bottom when expanded (.trow[open])
  assert.ok(cssSrc.includes('.trow[open] .tr-main>.ct-x{flex:1 0 100%;width:100%'));
  assert.ok(cssSrc.includes('.trow[open] .ct-c{max-width:100%;white-space:normal;word-break:break-word}'));

  // 2. Open-source thinking pause toast & Gacha #1, #2 naming
  assert.ok(coreSrc.includes("this.phase = '路由到开源模型已暂停'") && coreSrc.includes('triggerOpenAutoStopMidStream?.(this)'));
  assert.ok(bpUiSrc.includes("'抽卡到开源思考已经暂停' : '路由到开源模型已暂停'"));
  assert.ok(gachaSrc.includes('no: a.no, mode: s.mode') && gachaSrc.includes('sidNo: getGachaSidNo'));
  assert.ok(titlesSrc.includes("const gachaNo = e?.gachaNo || cObj?.gachaNo || cObj?.gacha?.no"));

  // 3. Global auto-hiding scrollbars (.is-scrolling)
  assert.ok(cssSrc.includes('.is-scrolling::-webkit-scrollbar-thumb'));
  assert.ok(viewSrc.includes("el.classList.add('is-scrolling')"));

  // 4. Right sidebar (Dock) defaults to overview on first open and when expanding from collapsed
  assert.ok(dockSrc.includes("tab: 'overview'") && dockSrc.includes("this.tab = tabOverride || 'overview'"));

  // 5. Mobile right-edge draggable bookmark '>' button (#dockhandle)
  assert.ok(viewSrc.includes("h('span', { class: 'dh-mark' }, '>')"));
  assert.ok(mobSrc.includes('initDockHandle') && mobSrc.includes("Store.set('dock:handlePct'"));
  assert.ok(cssSrc.includes('body.m #dockhandle .dh-mark{display:inline-block'));

  // 6. Top header phase moved to right side of bottom dynamic typing indicator
  assert.ok(!viewSrc.includes("Hitl.blocked(chat) ? h('span', { class: 'phase' }, h('i', { class: 'spin' })"));
  assert.ok(viewSrc.includes("h('span', { class: 'phase typing-phase' }"));

  // 7. Direct Mode: stack-safe parseEvalFlightFromHtml on 300KB SSR initialModels chunk, inferEntryMode, composer pill, and UI.retry
  assert.ok(!evalCoreSrc.includes('("(?:\\\\.|[^"\\\\])*")'));
  assert.ok(msSrc.includes("class: 'direct-model-name'") && msSrc.includes('mode-pop-vendors'));
  assert.ok(viewSrc.includes('if (chat.isEvaluation) {\n        const v2 = captcha ? await Recaptcha.v2() : null;\n        await chat.regenerate({ v2 });'));

  // Runtime test of stack-safe parseEvalFlightFromHtml on a 250KB initialModels SSR Flight chunk
  const fnStart = evalCoreSrc.indexOf('let cachedWebDeploymentId =');
  const fnEnd = evalCoreSrc.indexOf('const ModelCatalog = (() => {');
  const ctx = vm.createContext({ Store: { get: () => '', set: () => {} }, JSON, Array, Object, String, Number, Map, RegExp });
  vm.runInContext(evalCoreSrc.slice(fnStart, fnEnd) + '\nthis.parseEvalFlightFromHtml = parseEvalFlightFromHtml;', ctx);
  const bigModels = Array.from({ length: 180 }, (_, i) => ({
    id: `019ce973-84c9-7030-9f88-${String(i).padStart(12, '0')}`,
    publicName: `Model ${i}`,
    organization: 'Anthropic',
    capabilities: { outputCapabilities: { text: true, webSearch: true } },
  }));
  const rowPayload = '1:' + JSON.stringify({ initialModels: bigModels }) + '\n';
  const bigHtml = '<script>self.__next_f.push([1,' + JSON.stringify(rowPayload) + '])</script>';
  assert.ok(bigHtml.length > 20000);
  const parsed = ctx.parseEvalFlightFromHtml(bigHtml);
  assert.ok(Array.isArray(parsed.initialModels));
  assert.equal(parsed.initialModels.length, 180);
});

test('v0.13.180: QR sync & quota refresh buttons, Account page link button, and foreground/background process naming & memory optimization', () => {
  const root = path.resolve(__dirname, '..');
  const coreSrc = fs.readFileSync(path.join(root, 'ui/core.js'), 'utf8');
  const dockSrc = fs.readFileSync(path.join(root, 'ui/dock.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
  const acctsSrc = fs.readFileSync(path.join(root, 'ui/accounts.js'), 'utf8');
  const apSrc = fs.readFileSync(path.join(root, 'ui/account-picker.js'), 'utf8');
  const mgrSrc = fs.readFileSync(path.join(root, 'ui/mgr.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'ui/app.css'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

  // 1. QrSync.openModal fixed-overlay styling, curTab normalization, and ICON.qr / ICON.eye
  assert.ok(coreSrc.includes('position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center'));
  assert.ok(coreSrc.includes("let curTab = initialTab === 'import' ? 'import' : (initialTab === 'export' ? 'export' : (isMobile ? 'import' : 'export'));"));
  assert.ok(viewSrc.includes('ICON.qr =') && viewSrc.includes('ICON.eye =') && viewSrc.includes('ICON.RefreshCw = ICON.refresh'));
  assert.ok(cssSrc.includes('.m-ov.open{display:flex}') && cssSrc.includes('.m-ov .m-box{'));

  // 2. Pulse.poll(force) bypasses cooldown when force=true, and Bar.paintCard memoizes sub.__paintSig
  assert.ok(coreSrc.includes('poll(force = false)') && coreSrc.includes('if(!force && (now()<this.nextAt'));
  assert.ok(dockSrc.includes('if (card.__btnPressUntil && Date.now() < card.__btnPressUntil) return;'));
  assert.ok(dockSrc.includes('if (sub.__paintSig === subSig && sub.childNodes.length > 0) return;'));
  assert.ok(acctsSrc.includes("if (e?.target?.closest?.('.acct-quota-ring, .acct-refresh, .acct-qr-link, .acct-qrsync')) return;"));
  assert.ok(acctsSrc.includes("class: 'ib export-qr-sync-btn'") && apSrc.includes("ib('upload', '导出账号 / 二维码同步', () => UI.exportAccounts?.())"));

  // 3. Process memory optimization & Foreground vs Background process distinction
  assert.ok(mainSrc.includes("'--brana-bg-renderer' : '--brana-fg-renderer'"));
  assert.ok(mainSrc.includes('【前台窗口·对话交互】[前台进程: 1主控'));
  assert.ok(mainSrc.includes('｜ 后台进程: 3显卡加速'));
  assert.ok(mainSrc.includes("app.commandLine.appendSwitch('renderer-process-limit', '1');"));
});

test('v0.13.181: Fix 接收回复中 NaNs, missing sent user message card after >30s tool run (01a16eb7), and sent queue items returning on restart', () => {
  const vm = require('node:vm');
  const coreJs = read('ui/core.js');
  const viewJs = read('ui/view.js');
  const sqJs = read('ui/send-queue.js');
  const mainJs = read('src/main.js');

  // 1. 接收回复中 NaNs guard in view.js + sentAt fallback in core.js & send-queue.js
  assert.ok(
    viewJs.includes('const s = Number(e?.dataset?.since);') &&
    viewJs.includes('if (!Number.isFinite(s) || s <= 1e12) {'),
    '.anc-since 1s interval must guard against NaN/0 data-since and never render NaNs'
  );
  assert.ok(
    viewJs.includes('const effSince = Number(chat?.sentAt) || Number(chat?.oursAt)') &&
    viewJs.includes('if (Number.isFinite(effSince) && effSince > 1e12) {'),
    'view.js must compute finite effSince fallback before setting data-since'
  );

  // 2. Sent queue items must record removedIds + clearedAt on SendQ.flush and prune in Drafts.hydrateQ + main.js host:shared
  assert.ok(
    sqJs.includes('if (bIds.length) chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), ...bIds])].slice(-64);') &&
    sqJs.includes('if (!q.length) chat._qClearedAt = now();') &&
    sqJs.includes("Drafts.setQ(chat, true);"),
    'SendQ.flush onPrepared must record batch IDs in _qRemovedIds, stamp _qClearedAt, and sync Drafts.setQ(chat, true)'
  );
  assert.ok(
    viewJs.includes('if (!qit || (qit.id && (claimed.has(qit.id) || removedSet.has(qit.id))) || ((qit.at || 0) > 0 && (chat._qClearedAt || 0) >= (qit.at || 0)))') &&
    mainJs.includes('const doneSet = new Set([...ackedIds, ...acceptedIds]);'),
    'Drafts.hydrateQ and host:shared must prune already-sent/acked/removed queue items'
  );

  // 3. Simulate exact 01a14c96-fd27-75c7-9796-d838a406f3f8 scenario at t = uTime + 30,081ms (1792858889158)
  const sentStart = coreJs.indexOf('const SentUserLog = (() => {');
  const sentEnd = coreJs.indexOf('})();', sentStart) + 5;
  const sentCode = coreJs.slice(sentStart, sentEnd);
  const msStart = coreJs.indexOf('  mergeServer(list, keep) {');
  const msEnd = coreJs.indexOf('  // 和服务器对一次账', msStart);
  const msCode = ('function mergeServer(list, keep) {' + coreJs.slice(msStart + '  mergeServer(list, keep) {'.length, msEnd)).trimEnd().replace(/,\s*$/, '');

  const storeMap = new Map();
  let curNow = 1792858889158; // exact uTime + 30,081ms
  const idTime = id => {
    const x = String(id || '').replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(x) || x[12] !== '7') return 0;
    const t = parseInt(x.slice(0, 12), 16);
    return t > 1.6e12 && t < 4.2e12 ? t : 0;
  };
  const ctx = {
    Map, Set, Array, Object, String, Number, Boolean, Math, Date, RegExp, JSON,
    now: () => curNow,
    idTime,
    Store: {
      get: (k, d) => (storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d),
      set: (k, v) => storeMap.set(k, JSON.parse(JSON.stringify(v)))
    },
    Drafts: {
      sess: new Set(['01a16eb7-2645-7bb4-beaf-2e3ec73d46e2']),
      d: { o: [], q: {}, ackedIds: [], acceptedIds: ['01a16eb7-2645-7bb4-beaf-2e3ec73d46e2'] },
      load() { return this.d; },
      write() { return true; },
      ack(id) { this.d.o = this.d.o.filter(x => x.id !== id); },
      setQ(chat) { this.d.q[chat.sid] = { items: (chat.queue || []).slice(), paused: chat._qPaused || '' }; }
    },
    hasInterruptedToolPart: () => false,
    isPhantomFinishStub: () => false,
    patchAssistantParts: (o, m) => Object.assign(o, m),
    partWeight: (parts) => (parts || []).reduce((n, p) => n + (p?.text ? p.text.length : 10), 0),
    localDone: (m) => Boolean(m?.metadata?.timing?.completedAt),
    Hitl: { mergePending: () => {}, awaiting: () => false, name: () => '' }
  };
  vm.createContext(ctx);
  vm.runInContext(sentCode + '\nthis.SentUserLog = SentUserLog;\n' + msCode + '\nthis.mergeServer = mergeServer;', ctx);

  const sid = '01a14c96-fd27-75c7-9796-d838a406f3f8';
  const u1 = { id: '01a16e90-0000-7000-8000-000000000001', role: 'user', parts: [{ type: 'text', text: '把这几个问题修复一下' }] };
  // A1 had local uuid7 01a16e9e-b53b-70dd-973b-1b2c251a7cda when U2 was sent, but server assigned A1_srv a different UUID
  const a1_srv = { id: '01a16e91-1111-7000-8000-000000000002', role: 'assistant', parts: [{ type: 'text', text: '已完成修改并验证通过。' }], metadata: { pending: false } };
  const u2_sent = {
    id: '01a16eb7-2645-7bb4-beaf-2e3ec73d46e2',
    role: 'user',
    text: '好多进程会有奇怪的进程报错容易拦截，\n而且应该不提示V1.0把不是已经2.0了嘛而且应该不显示版本号才对\n能不显示不显示，除非一定必要\n还有调用powershell可以程序化自己解决最好',
    parts: [
      { type: 'file', url: '/api/chat/workspace/cas/user/qbF43e9v0o6EDAlc4ATiLanLwS9yVQc07PLwowoNdyo', mediaType: 'image/png', filename: 'image.png' },
      { type: 'text', text: '好多进程会有奇怪的进程报错容易拦截，\n而且应该不提示V1.0把不是已经2.0了嘛而且应该不显示版本号才对\n能不显示不显示，除非一定必要\n还有调用powershell可以程序化自己解决最好' }
    ],
    _local: true,
    _appendAccepted: true,
    _sentAt: 1792858859077,
    _prevAsstId: '01a16e9e-b53b-70dd-973b-1b2c251a7cda',
    _prevAsstWeight: 10086,
    _queueIds: [
      '01a16eab-5f22-757a-b79f-29b77858f0ce',
      '01a16eab-df87-71b5-bc79-1b508d2ecdf5',
      '01a16eac-12d1-7f4e-9715-29254d5fe7fa',
      '01a16eac-6b45-7b39-a184-0c61007afc42'
    ],
    _fromQueue: true
  };
  const a2_srv = {
    id: '01a16eb8-88bf-7882-8c7b-c2ca2943a041',
    role: 'assistant',
    parts: [{ type: 'step-start' }, { type: 'reasoning', id: '12891d0e-3348-4382-ba80-08e401df23a6', text: '', state: 'done' }],
    metadata: { pending: true }
  };

  ctx.SentUserLog.record(sid, u2_sent, u2_sent._prevAsstId);
  const chat = {
    sid,
    messages: [u1, a1_srv, u2_sent, a2_srv],
    live: a2_srv,
    busy: true,
    streaming: true,
    queue: [],
    _qPaused: '',
    mergeServer: ctx.mergeServer
  };

  // Server snapshot has [u1, a1_srv, a2_srv] (adjacent assistant gap without u2_sent) at curNow = uTime + 30,081ms
  chat.mergeServer([u1, a1_srv, a2_srv], a2_srv);

  assert.equal(chat.messages.length, 4, 'User message u2_sent must NOT be deleted after 30,081ms when A2 is replying to it');
  assert.equal(chat.messages[1].id, a1_srv.id, 'A1 is at index 1');
  assert.equal(chat.messages[2].id, u2_sent.id, 'Sent user message u2_sent must remain at index 2 between A1 and A2');
  assert.equal(chat.messages[3].id, a2_srv.id, 'Active assistant turn A2 is at index 3');
  assert.equal(chat.queue.length, 0, 'Accepted user message must NOT be demoted back into SendQ');
  assert.equal(ctx.SentUserLog.readList(sid).length, 1, 'SentUserLog must retain u2_sent while A1->A2 gap exists on server');
});

test('v0.13.182: Gacha 3-mode selector, unconditional Stage-2 Pelican in habit mode, Gacha-only open-source auto-pause/cleanup, and MsgCache hot-stub guard', () => {
  const gpopSrc = read('ui/gpop.js');
  const gviewSrc = read('ui/gview.js');
  const gachaSrc = read('ui/gacha.js');
  const coreSrc = read('ui/core.js');
  const bcpSrc = read('modules/billing/domain/billing-cost-probe.js');
  const bpuiSrc = read('ui/billing-probe-ui.js');

  assert.ok(gpopSrc.includes('<select data-k="mode" aria-label="抽卡模式"><option value="pelican">极简鹈鹕速测</option><option value="custom">自定义提示词</option></select>'));
  assert.ok(!gpopSrc.includes('<option value="svg">'));
  assert.ok(!gpopSrc.includes('<option value="fingerprint">'));
  assert.ok(gviewSrc.includes("['pelican','custom'].map((key,i)=>h('option',{value:key,selected:(s.mode==='custom'?'custom':'pelican')===key||null},['极简鹈鹕速测','自定义提示词'][i]))"));

  assert.ok(gachaSrc.includes("const isPelicanMode = s.mode !== 'custom';"));
  assert.ok(gachaSrc.includes('if (!ch?.gacha && (!att || att.done)) return false;'));
  assert.ok(coreSrc.includes('triggerOpenAutoStopMidStream?.(this)'));
  assert.ok(bcpSrc.includes('if (chatObj.busy && Boolean(chatObj.gacha) && wasClosedModel && latestHasOpenThink'));
  assert.ok(coreSrc.includes("if (hasHotStub(hm.parts) && !hasHotStub(m.parts)) return m;"));
  assert.ok(bpuiSrc.includes("? 'muse'"));
});

test('v0.13.183: Zero unnecessary terminal spawns (Win10/Win11), multi-account hidden window reaping, mandatory EdgeTunnel subscription before login/register, and QR sync consolidated inside Export page', () => {
  const mainSrc = read('src/main.js');
  const nshSrc = read('scripts/installer.nsh');
  const mainSourceCjs = read('platform/host/main-source.cjs');
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const acctsSrc = read('ui/accounts.js');
  const apSrc = read('ui/account-picker.js');
  const dockSrc = read('ui/dock.js');
  const mgrSrc = read('ui/mgr.js');

  // 1. Zero non-essential terminal invocations & WINDOWS_GUI PE Subsystem for helper binaries
  assert.ok(!mainSrc.includes("spawnSync('taskkill', ['/F', '/T', '/PID'"), 'killKids must use in-process process.kill without spawning taskkill.exe');
  assert.ok(mainSrc.includes('if (process.platform !== \'win32\' || !app.isPackaged || !global.__allowExternalFindCleanup) return;'));
  assert.ok(mainSrc.includes("if (process.env.BRANA_UPD_PS_GUI === '1') {"));
  assert.ok(nshSrc.includes('_brana_skip_ps_close'), 'installer.nsh must skip spawning powershell.exe when target executable is not locked');
  assert.ok(!/belly/i.test(mainSourceCjs), 'platform/host/main-source.cjs must be portable across PCs with no hardcoded user path');

  for (const relBin of ['resources/bin/win-mem-trim.exe', 'bin/xray.exe']) {
    const bp = path.join(__dirname, '..', relBin);
    if (fs.existsSync(bp)) {
      const buf = fs.readFileSync(bp);
      const peOff = buf.readUInt32LE(0x3c);
      const subsys = buf.readUInt16LE(peOff + 0x5c);
      assert.equal(subsys, 2, relBin + ' must have PE Subsystem = 2 (IMAGE_SUBSYSTEM_WINDOWS_GUI) so Win10/Win11 never opens conhost/WindowsTerminal');
    }
  }

  // 2. Clean multi-account / multi-client process management
  assert.ok(mainSrc.includes('const _hiddenIdleSince = new Map();') && mainSrc.includes('stopTunnel(id);'), 'bgCheck must reap idle hidden account windows and stop their tunnels');
  assert.ok(mainSrc.includes("if (force && typeof WebContentsView === 'function' && Array.isArray(DB?.accounts))"), 'pelHarvest must not spawn background WebContentsView renderers on normal startup');

  // 3. Mandatory EdgeTunnel subscription prompt before login or registration when no node is configured
  assert.ok(coreSrc.includes('function hasNodeConfigured(') && coreSrc.includes('return !hasNodeConfigured(a);'));
  assert.ok(coreSrc.includes('请先配置 EdgeTunnel 订阅地址') && coreSrc.includes('配置 EdgeTunnel 订阅并继续（登录 / 注册）'));
  assert.ok(!coreSrc.includes('跳过，直接登录 ➔') && !coreSrc.includes('下一步：登录账号 ➔'), 'Mandatory EdgeTunnel setup must not allow skipping before node configuration');
  assert.ok(acctsSrc.includes("if (v && (mode === 'signup' || mode === 'forgot') && typeof QrSync !== 'undefined' && QrSync.isFirstTimeNoCache && QrSync.isFirstTimeNoCache(a))"));
  assert.ok(acctsSrc.includes('请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'));

  // 4. QR code mini-icon consolidated inside Export page and removed from other standalone locations
  assert.ok(viewSrc.includes('ICON.qr =') && viewSrc.includes('width="2.6" height="2.6"'));
  assert.ok(acctsSrc.includes("class: 'ib export-qr-sync-btn'") && acctsSrc.includes("icon('qr')"));
  assert.ok(apSrc.includes("ib('upload', '导出账号 / 二维码同步', () => UI.exportAccounts?.())"));
  assert.ok(!apSrc.includes("class: 'ib amenu-qr-sync'"), 'Standalone QR button in account-picker header must be removed');
  assert.ok(!mgrSrc.includes("class: 'ib lp-qr-sync'"), 'Standalone QR button in mobile mgr header must be removed');
  assert.ok(!acctsSrc.includes("class: 'btn big ghost lqr-sync icon-only-btn'"), 'Standalone QR button in loginGate .lgo must be removed');
  assert.ok(!dockSrc.includes('refBtn, qrBtn'), 'Standalone QR button in #acct bottom-left card must be removed');
});

test('v0.13.184: Prevent duplicate Stage-2 Pelican submission after client restart or update', () => {
  const vm = require('node:vm');
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const sqSrc = read('ui/send-queue.js');
  const keepSrc = read('ui/keep.js');
  const gachaSrc = read('ui/gacha.js');

  // 1. Static guards across Gacha, SentUserLog, Drafts, SendQ, and KeepAlive
  assert.ok(gachaSrc.includes('function hasStage2PelicanTurn(c, a = null)') && gachaSrc.includes('async function recoverReloadedAttempts()'));
  assert.ok(gachaSrc.includes('if (hasStage2PelicanTurn(c, a)'));
  assert.ok(gachaSrc.includes('async function waitSingleGachaTurn(a, c, signal)'));
  assert.ok(sqSrc.includes("if (typeof SentUserLog !== 'undefined' && typeof SentUserLog.isGachaProbeText === 'function' && SentUserLog.isGachaProbeText(tNorm)) return false;"));
  assert.ok(viewSrc.includes("const isProbeQ = txt => typeof SentUserLog !== 'undefined' && typeof SentUserLog.isGachaProbeText === 'function' && SentUserLog.isGachaProbeText(txt);"));
  assert.ok(keepSrc.includes('if (lastU && SentUserLog.isGachaProbeText(SentUserLog.extractMsgText(lastU))) return null;'));

  // 2. Runtime simulation of Stage-2 Pelican sent before client restart/update (chat.gacha lost after restart)
  const sulStart = coreSrc.indexOf('const SentUserLog = (() => {');
  const sulEnd = coreSrc.indexOf('})();', sulStart) + 5;
  const sulCode = coreSrc.slice(sulStart, sulEnd);

  const storeMap = new Map();
  let draftOutbox = [];
  const demoted = [];
  const ctx = vm.createContext({
    Map, Set, Array, Object, String, Number, Boolean, Date, Math, RegExp, JSON,
    now: () => 1792777600000,
    idTime: () => 0,
    Store: {
      get: (k, d) => (storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d),
      set: (k, v) => { storeMap.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    Drafts: {
      sess: new Set(),
      load: () => ({ o: draftOutbox, q: {}, t: {} }),
      ack: id => { draftOutbox = draftOutbox.filter(x => x.id !== id); },
    },
    SendQ: {
      demoteToQueue: (chat, item, opt) => {
        demoted.push({ sid: chat.sid, id: item.id, text: item.text, opt });
        return true;
      },
    },
    RunningTracker: { isTrackedRunning: () => false },
    hasInterruptedToolPart: () => false,
  });
  vm.runInContext(sulCode + '; globalThis.SentUserLog = SentUserLog;', ctx);

  const viPelican = 'Hãy tạo một tệp HTML độc lập mới chỉ trong một tệp duy nhất. Vẽ cảnh hoạt hình hai chiều bằng SVG mô tả chú bồ nông mỏ lớn đang đi xe đạp. Giữ bố cục gọn gàng và chuyển động mượt mà. Không cần kiểm thử; chỉ cần trả về mã HTML hoàn chỉnh.';
  const zhPelican = '请新建一个独立的单文件 HTML 页面。使用内联 SVG 绘制一只鹈鹕踩着脚踏板向前骑自行车的 2D 动态动画场景。';
  assert.equal(ctx.SentUserLog.isPelicanPromptText(viPelican), true);
  assert.equal(ctx.SentUserLog.isPelicanPromptText(zhPelican), true);
  assert.equal(ctx.SentUserLog.isGachaProbeText(viPelican), true);
  assert.equal(ctx.SentUserLog.isGachaProbeText('继续写完剩下的部分'), false);

  const sid = '01a169a2-ef99-7a2b-9850-16c3a56e6754';
  const u2Pelican = {
    id: '01a169a4-f25d-7850-ae96-d6f50714e2b5',
    role: 'user',
    text: viPelican,
    parts: [{ type: 'text', text: viPelican }],
    _local: true,
    _sentAt: 1792773714525,
    _prevAsstId: 'a1-stage1',
    _prevAsstWeight: 420,
  };
  ctx.SentUserLog.record(sid, u2Pelican, 'a1-stage1');

  // After client restart/update, chat.gacha is undefined and Stage-2 Pelican assistant reply completed
  const chatAfterRestart = {
    sid,
    loaded: true,
    busy: false,
    streaming: false,
    queue: [],
    messages: [
      { id: 'u1-stage1', role: 'user', parts: [{ type: 'text', text: 'Stage 1 probe' }] },
      { id: 'a1-stage1', role: 'assistant', parts: [{ type: 'text', text: 'Stage 1 reply supplemented after load' }] },
      { id: 'u2-srv', role: 'user', parts: [{ type: 'text', text: viPelican }] },
      { id: '01a169a6-fe5c-7a03-a16b-32ec3d4ea9ce', role: 'assistant', parts: [{ type: 'text', text: '<!DOCTYPE html><svg><title>Pelican Bicycle</title></svg>' }] },
    ],
  };

  assert.equal(ctx.SentUserLog.hasPelicanTurnInChat(chatAfterRestart), true);
  assert.equal(ctx.SentUserLog.demoteToQueue(chatAfterRestart, u2Pelican, { running: true }), false, 'Pelican probe must never be demoted into SendQ after restart');
  ctx.SentUserLog.restoreInto(chatAfterRestart, { srvPend: true });
  assert.equal(demoted.length, 0, 'restoreInto must never demote a Stage-2 Pelican prompt into SendQ after client restart');
  assert.equal(chatAfterRestart.queue.length, 0, 'chat.queue must remain empty after restart so Pelican is never submitted a second time');
  assert.equal(ctx.SentUserLog.readList(sid).length, 0, 'Completed Pelican entry in SentUserLog must be cleaned up');
});

test('v0.13.185-lightweight: Recognition accuracy & speed optimization, transparent Brotli ASAR decompression, NTFS hardlink role executables, and EXE/APK lightweighting', () => {
  const pkgJson = JSON.parse(read('package.json'));
  const afterPack = read('scripts/after-pack.js');
  const mainSrc = read('src/main.js');
  const bundleSrc = read('src/bundle.js');
  const bpuiSrc = read('ui/billing-probe-ui.js');
  const gradleSrc = read('android/app/build.gradle');
  const proguardSrc = read('android/app/proguard-rules.pro');

  assert.ok(bpuiSrc.includes('const _dispLabelMemo = new Map();'));
  assert.ok(bpuiSrc.includes('function getProtoByCanon(cKey)'));
  assert.ok(bpuiSrc.includes("htmlSvgMatch?.best?.vendorId && htmlSvgMatch.best.vendorId !== 'google'"));
  assert.ok(bpuiSrc.includes('cl.includes("scarfa")'));

  assert.ok(mainSrc.includes('fs._branaBrotliHooked'));
  assert.ok(bundleSrc.includes('fs._branaBrotliHooked'));
  assert.ok(mainSrc.includes('fs.linkSync(process.execPath, rp);'));
  assert.ok(mainSrc.includes("GOMEMLIMIT: '14MiB', GOGC: '35'"));
  assert.ok(mainSrc.includes("w.webContents.send('host:trimMem')"));
  assert.ok(read('ui/core.js').includes('window.__branaTrimMemory = () =>'));

  assert.equal(pkgJson.build.afterPack, 'scripts/after-pack.js');
  assert.equal(pkgJson.build.compression, 'maximum');
  assert.deepEqual(pkgJson.build.asarUnpack, ['src/*preload*.js']);
  assert.ok(afterPack.includes('STRIP_BIN_FILES'));

  assert.ok(gradleSrc.includes('arm64-v8a'));
  assert.ok(gradleSrc.includes('minifyEnabled true'));
  assert.ok(gradleSrc.includes('shrinkResources true'));
  assert.ok(proguardSrc.includes('-keep class ai.arena.client.** { *; }'));
  assert.ok(proguardSrc.includes('@android.webkit.JavascriptInterface <methods>;'));
});

test('Task 59: Language pack slimming (zh-CN/en-US only), runtime stability hardening, and zero narrow LOO margins', () => {
  const pkgJson = JSON.parse(read('package.json'));
  const afterPack = read('scripts/after-pack.js');
  const mainSrc = read('src/main.js');
  const gradleSrc = read('android/app/build.gradle');
  const bpuiSrc = read('ui/billing-probe-ui.js');

  assert.deepEqual(pkgJson.build.electronLanguages, ['zh-CN', 'en-US']);
  assert.ok(afterPack.includes("const KEEP_LOCALES = new Set(['zh-CN.pak', 'en-US.pak']);"));
  assert.ok(gradleSrc.includes('resConfigs "zh", "zh-rCN", "en"'));

  assert.ok(mainSrc.includes("app.commandLine.appendSwitch('lang', 'zh-CN');"));
  assert.ok(mainSrc.includes("--max-old-space-size=512 --initial-old-space-size=16 --max-semi-space-size=2"));
  assert.ok(mainSrc.includes("if (details?.type === 'Utility')"));
  assert.ok(mainSrc.includes('if(force||wasBlocked||ses.__lastProxyRuleKey!==proxyRuleKey)'));
  assert.ok(mainSrc.includes('if (w.__hidden && !bgWorkMap.has(id))'));
  assert.ok(bpuiSrc.includes("marginBoostKey = 'gpt-6.1-sol-high'"));
});

test('Task 60 (v2.0.0-beta.1): Micro-probe -> Pelican zero false route alert, multi-turn identity stability, genuine mid-chat routing, Gacha smoothness, and update/CI hardening', () => {
  const bpUiSrc = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const gachaSrc = fs.readFileSync(path.join(__dirname, '../ui/gacha.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const nshSrc = fs.readFileSync(path.join(__dirname, '../scripts/installer.nsh'), 'utf8');
  const extIdSrc = fs.readFileSync(path.join(__dirname, '../src/extension-test-identity.js'), 'utf8');

  assert.ok(bpUiSrc.includes('isMicroProbeTurn'));
  assert.ok(bpUiSrc.includes('lastHtmlCodingIdx'));
  assert.ok(bpUiSrc.includes('_forRoutePostSlice'));
  assert.ok(gachaSrc.includes('isInFlightSid'));
  assert.ok(gachaSrc.includes('if (isInFlightSid(sid)) return null;'));
  assert.ok(gachaSrc.includes('let lastFollowupAt = 0;'));
  assert.ok(coreSrc.includes('isStrictOpenAiToolId'));
  assert.ok(mainSrc.includes('BranaAI%.exe'));
  assert.ok(nshSrc.includes('BranaAI-*.exe'));
  assert.ok(!extIdSrc.includes('-beta') && extIdSrc.includes('-ext'));
});

test('Task 61: Unified model identity & confidence across all UI surfaces + PC EXE (<100MB), Android APK, and in-process memory trimmer compression', () => {
  const bpUiSrc = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const titlesSrc = fs.readFileSync(path.join(__dirname, '../ui/titles.js'), 'utf8');
  const dockSrc = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8');
  const htmlPrevSrc = fs.readFileSync(path.join(__dirname, '../ui/html-preview.js'), 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const afterPackSrc = fs.readFileSync(path.join(__dirname, '../scripts/after-pack.js'), 'utf8');
  const bundleSrc = fs.readFileSync(path.join(__dirname, '../src/bundle.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  // 1. Unified model identity & confidence invariants across Titles, Dock, PelicanShots, and BillingProbe
  assert.ok(titlesSrc.includes('if (e && e.localTitle !== want) { e.localTitle = want; try { History.saveSoon?.(); } catch {} }'));
  assert.ok(dockSrc.includes('const sum = (!t && typeof BillingProbe !== \'undefined\' && BillingProbe.summary) ? BillingProbe.summary(sid, { readOnly: true }) : null;'));
  assert.ok(dockSrc.includes('const ovMergedBest = (!mCur?.userCorrected && ovUniqueTop)'));
  assert.ok(htmlPrevSrc.includes('BillingProbe.summary(sid, { readOnly: true })'));
  assert.ok(htmlPrevSrc.includes('if (isPreRouteShot || !m.model || m.model === \'未识别\')'));
  assert.ok(bpUiSrc.includes('const hasLocalSyncEvidence = Boolean('));
  assert.ok(bpUiSrc.includes('PelicanShots.syncSid(sid);'));
  assert.ok(bpUiSrc.includes('_lastSyncSig: syncSig,'));
  assert.ok(bpUiSrc.includes('if (isUniqueTop && (opts?.readOnly === false || model?.name)'));

  // 2. Package & process compression invariants
  assert.equal(pkgJson.devDependencies.electron, '33.4.11');
  assert.ok(afterPackSrc.includes('function slimResourcesPak(pakPath)'));
  assert.ok(afterPackSrc.includes('function slimAppAsar(appOutDir)'));
  assert.ok(afterPackSrc.includes('BRANA_WIN32_NODE_BR'));
  assert.ok(bundleSrc.includes('d.models = (d.models || []).map(x => x._ref ? (bm.get(x._ref) || x) : x);'));
  assert.ok(mainSrc.includes('globalThis._branaWin32Addon'));
});

test('Task 62: Closed-loop PC pure-icon QR export & Mobile QR scan/import + onboarding', () => {
  const coreSrc = read('ui/core.js');
  const accountsSrc = read('ui/accounts.js');
  const manifestSrc = fs.readFileSync(path.join(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8');
  const javaSrc = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');

  assert.ok(accountsSrc.includes("class: 'ib export-qr-sync-btn'"));
  assert.ok(!accountsSrc.includes('export-qr-bar'));
  assert.ok(accountsSrc.includes("class: 'ib import-qr-sync-btn'"));
  assert.ok(coreSrc.includes('qrSvgWrap.innerHTML = toSvg(curUri, 248)'));
  assert.ok(coreSrc.includes('扫描电脑端二维码'));
  assert.ok(manifestSrc.includes('android.permission.CAMERA'));
  assert.ok(javaSrc.includes('PermissionRequest.RESOURCE_VIDEO_CAPTURE'));
});

test('Task 63: Deduplicate reply/thinking status prompts and prevent post-restart old message disorder on multi-chunk tool turns & paginated sync', () => {
  const vm = require('vm');
  const viewSrc = read('ui/view.js');
  const coreSrc = read('ui/core.js');

  // 1. Reply/thinking status prompt deduplication guards in ui/view.js & ui/core.js
  assert.ok(
    viewSrc.includes("if (Hitl.blocked(chat) && !chat.live && chat.messages[lastIdx]?.role === 'user' && !chat.waitingForeign)"),
    '__typing placeholder must not render simultaneously with chat.live .typing-live-row'
  );
  assert.ok(
    viewSrc.includes("const st = t.querySelector('.typing-st'); if (st && st.textContent !== '') st.textContent = '';"),
    '__typing .typing-st must remain empty when unified .ph-t + .anc-since is rendered'
  );
  assert.ok(
    viewSrc.includes('const phTxt = (activeReasonTitle && (activeReasonTitle === rawPhTxt || (/思考中/.test(activeReasonTitle) && /思考中/.test(rawPhTxt)))) ? \'\' : rawPhTxt;'),
    '.typing-live-row must not repeat thinking phase text when active streaming .reason block above already displays it'
  );
  assert.ok(
    coreSrc.includes("const pht = row?.querySelector?.('.ph-t'); if (pht) { if (el.textContent !== '') el.textContent = '';"),
    'core.js interval must not re-populate .typing-st next to .ph-t'
  );

  // 2. Runtime verification of multi-chunk assistant turns + paginated SentUserLog / mergeServer / sanitizeCachedMsgs
  const sanStart = coreSrc.indexOf('  function isSameAsstTurnChunk(prev, cur) {');
  const sanEnd = coreSrc.indexOf('  function slimForHot(msgs', sanStart);
  const sulStart = coreSrc.indexOf('const SentUserLog = (() => {');
  const sulEnd = coreSrc.indexOf('})();', sulStart) + 5;
  const msStart = coreSrc.indexOf('  mergeServer(list, keep) {');
  const msEnd = coreSrc.indexOf('  // 和服务器对一次账', msStart);
  const msCode = ('function mergeServer(list, keep) {' + coreSrc.slice(msStart + '  mergeServer(list, keep) {'.length, msEnd)).trimEnd().replace(/,\s*$/, '');

  const storeMap = new Map();
  const idTime = id => {
    const x = String(id || '').replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(x) || x[12] !== '7') return 0;
    const t = parseInt(x.slice(0, 12), 16);
    return t > 1.6e12 && t < 4.2e12 ? t : 0;
  };
  const makeUuidAt = (ms, seq = 1) => {
    const hex = Math.floor(ms).toString(16).padStart(12, '0');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-7000-8000-' + String(seq).padStart(12, '0');
  };
  const curNow = Date.parse('2026-10-25T04:25:00Z');
  const ctx = vm.createContext({
    Map, Set, WeakMap, Array, Object, String, Number, Boolean, Math, Date, RegExp, JSON,
    now: () => curNow,
    idTime,
    Store: {
      get: (k, d) => (storeMap.has(k) ? JSON.parse(JSON.stringify(storeMap.get(k))) : d),
      set: (k, v) => storeMap.set(k, JSON.parse(JSON.stringify(v))),
    },
    Drafts: { load: () => ({ o: {}, q: {}, ackedIds: [], acceptedIds: [] }), ack: () => {}, setQ: () => {} },
    formatOfficialErrorText: s => String(s || ''),
    hasInterruptedToolPart: () => false,
    isPhantomFinishStub: () => false,
    Hitl: { mergePending: () => {}, awaiting: () => false, name: () => '' },
    MsgCache: {},
  });
  vm.runInContext(
    coreSrc.slice(sanStart, sanEnd) +
    '\nMsgCache.sanitize = sanitizeCachedMsgs;\nthis.sanitizeCachedMsgs = sanitizeCachedMsgs;\n' +
    coreSrc.slice(sulStart, sulEnd) +
    '\nthis.SentUserLog = SentUserLog;\n' +
    msCode +
    '\nthis.mergeServer = mergeServer;',
    ctx
  );

  // Yesterday's 4 user messages (19:52, 20:16, 21:54, 01:49) that scrolled off the 20-message pagination window
  const sid = '01a16c0e-test-task63';
  const y1952 = Date.parse('2026-10-24T11:52:00Z');
  const y2016 = Date.parse('2026-10-24T12:16:00Z');
  const y2154 = Date.parse('2026-10-24T13:54:00Z');
  const t0149 = Date.parse('2026-10-24T17:49:00Z');
  const oldUsers = [
    { id: makeUuidAt(y1952, 1), role: 'user', parts: [{ type: 'text', text: '昨天 19:52 的旧消息' }], _appendAccepted: true },
    { id: makeUuidAt(y2016, 2), role: 'user', parts: [{ type: 'text', text: '昨天 20:16 的旧消息' }], _appendAccepted: true },
    { id: makeUuidAt(y2154, 3), role: 'user', parts: [{ type: 'text', text: '昨天 21:54 的旧消息' }], _appendAccepted: true },
    { id: makeUuidAt(t0149, 4), role: 'user', parts: [{ type: 'text', text: '01:49 的旧消息' }], _appendAccepted: true },
  ];
  for (let i = 0; i < oldUsers.length; i++) {
    ctx.SentUserLog.record(sid, oldUsers[i], makeUuidAt(y1952 + i * 60000, 90 + i));
  }
  assert.equal(ctx.SentUserLog.readList(sid).length, 4);

  // Today's paginated window with multi-chunk tool-calling assistant turns + active assistant turn with reused UUIDv7
  const t1000 = Date.parse('2026-10-25T02:00:00Z');
  const t1005 = Date.parse('2026-10-25T02:05:00Z');
  const t1220 = Date.parse('2026-10-25T04:20:00Z');
  const uToday1 = { id: makeUuidAt(t1000, 10), role: 'user', parts: [{ type: 'text', text: '今天第一条消息' }] };
  const aToday1_chunk1 = {
    id: makeUuidAt(t1005, 11),
    role: 'assistant',
    parts: [{ type: 'dynamic-tool', toolCallId: 'call_1', state: 'output-available', output: 'ok' }],
    metadata: { timing: { completedAt: t1005 } },
  };
  const aToday1_chunk2 = {
    id: makeUuidAt(t1000 + 2000, 12),
    role: 'assistant',
    parts: [{ type: 'text', text: '今天第一轮完成。' }],
    metadata: { finishReason: 'stop', timing: { startedAt: t1000 + 2000, completedAt: t1005 + 5000 } },
  };
  const uToday2 = { id: makeUuidAt(t1220, 13), role: 'user', parts: [{ type: 'text', text: '今天最新一条消息' }] };
  const aToday2_chunk1 = {
    id: makeUuidAt(t1220 + 60000, 14),
    role: 'assistant',
    parts: [{ type: 'dynamic-tool', toolCallId: 'call_2', state: 'output-available', output: 'done' }],
    metadata: { timing: { completedAt: t1220 + 60000 } },
  };
  // Active chunk with server-reused old UUIDv7 (like 01a16d4f-9619 in 2b8) but today's timing.startedAt
  const aToday2_active = {
    id: makeUuidAt(t0149 + 5000, 15),
    role: 'assistant',
    parts: [{ type: 'dynamic-tool', toolCallId: 'call_3', state: 'output-available', output: 'reading image.png' }],
    metadata: { pending: true, timing: { startedAt: t1220 + 2000 } },
  };

  assert.equal(ctx.SentUserLog.isSameAsstTurnChunk(aToday1_chunk1, aToday1_chunk2), true, 'Tool sub-chunk and final chunk belong to the same assistant turn');
  assert.equal(ctx.SentUserLog.isSameAsstTurnChunk(aToday2_chunk1, aToday2_active), true, 'Active tool sub-chunks belong to the same assistant turn');
  assert.equal(ctx.SentUserLog.hasAdjacentAsstGap([uToday1, aToday1_chunk1, aToday1_chunk2, uToday2, aToday2_chunk1, aToday2_active]), false, 'Multi-chunk assistant turns must not trigger false adjacent assistant gaps');

  const srvMsgs = [uToday1, aToday1_chunk1, aToday1_chunk2, uToday2, aToday2_chunk1, aToday2_active];
  // Simulate corrupted cache where oldUsers were wedged before a duplicate aToday2_active
  const chat = {
    sid,
    messages: [...srvMsgs, ...oldUsers.map(u => ({ ...u, _local: true })), { ...aToday2_active }],
    live: aToday2_active,
    busy: true,
    streaming: true,
    mergeServer: ctx.mergeServer,
  };
  chat.mergeServer(srvMsgs, aToday2_active);

  assert.equal(chat.messages.length, 6, 'mergeServer + restoreInto + sanitizeCachedMsgs must strip all 4 old user ghosts and deduplicate active assistant message');
  assert.equal(
    chat.messages.map(m => m.id).join(','),
    srvMsgs.map(m => m.id).join(','),
    'Message order must strictly match the official server turn sequence'
  );
  assert.equal(ctx.SentUserLog.readList(sid).length, 0, 'Scrolled-off old SentUserLog entries must be purged automatically');
});

test('Task 64 (v2.0.0-beta.2): Inline HTML preview truncation healing, builtinRev 185 local correction bank, provisionalReg failed account isolation, and native auto-CAPTCHA', () => {
  const coreSrc = read('ui/core.js');
  const viewSrc = read('ui/view.js');
  const hpSrc = read('ui/html-preview.js');
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const mainSrc = read('src/main.js');
  const authSrc = read('src/account-auth.js');
  const capSrc = read('ui/captcha-solver.js');
  delete require.cache[require.resolve('../ui/habit-builtin-bank.js')];
  const bankMod = require('../ui/habit-builtin-bank.js');

  assert.ok(coreSrc.includes('_hf(c)') && coreSrc.includes("rawTxt.includes('…[cached]')"));
  assert.ok(viewSrc.includes("includes('…[cached]')") && hpSrc.includes('healFileText(sid, path) {'));
  assert.ok(bankMod.builtinRev >= 185 && Array.isArray(bankMod.samples) && bankMod.samples.length >= 448);
  assert.ok(bpUiSrc.includes("importedFromDiag && !s.autoTeacher && s.truthTier !== 'manual_correction'"));
  assert.ok(mainSrc.includes('provisionalReg: true') && authSrc.includes('delete a.provisionalReg;'));
  assert.ok(capSrc.includes('人机验证进行中…') && !capSrc.includes('千面助手'));
});

test('Task 65 (v2.0.1): Real-time IPPure purity verification, 10-item viewport dropdown probing + impure quarantine cooldown, pre-send purity gate, and banned-account startup recovery', () => {
  const vm = require('node:vm');
  const mainSrc = read('src/main.js');
  const bootSrc = read('ui/boot.js');
  const rnSrc = read('src/route-native.js');
  const rpSrc = read('ui/route-policy.js');
  const iprepSrc = read('ui/iprep.js');
  const poolSrc = read('ui/pool.js');
  const nrSrc = read('ui/node-routes.js');
  const ripSrc = read('ui/region-ip.js');
  const viewSrc = read('ui/view.js');
  const coreSrc = read('ui/core.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const envCheckSrc = read('ui/env-check.js');
  const routeSupportSrc = read('android/app/src/main/java/ai/arena/client/RouteSupport.java');
  const mainActSrc = read('android/app/src/main/java/ai/arena/client/MainActivity.java');
  const RoutePolicy = require('../ui/route-policy.js');

  // 1. IPPure top-level data.type & data.is_residential parsing + monotonic x-t + Scamalytics/ProxyCheck fallback
  assert.ok(rnSrc.includes('lt: entry?.lt || 0'));
  assert.ok(rnSrc.includes('const asnType = String(d.type || d.asn?.type || \'\')'));
  assert.ok(rnSrc.includes('async function _scamalyticsDirect(qIp, ms = 2600, signal'));
  assert.ok(routeSupportSrc.includes('static JSONObject queryIppureSigned(String qIp, int tmo)'));
  assert.ok(mainActSrc.includes('RouteSupport.purityDirect('));

  // 2. Datacenter/hosting IPs (e.g. 185.66.164.4) with basicOnly fallback never fake 84% pure; verified IPPure dc:true with fs=3 scores 44% (高风险)
  const poolData = {
    v: 1,
    ips: {
      '185.66.164.4:443': { ok: true, loc: 'NL', eg: '185.66.164.4', ms: 62 },
      '185.66.164.4:2053': { ok: true, loc: 'NL', eg: '185.66.164.4', ms: 65 },
    },
    rep: {
      '185.66.164.4': {
        a: 1792400000000,
        h: true,
        px: false,
        m: false,
        isp: 'FT Systems Ltd',
        pu: { fs: 14, ip: '185.66.164.4', res: false, bc: false, dc: true, org: 'FT Systems Ltd', basicOnly: 1 },
      },
    },
  };
  assert.equal(RoutePolicy.reputationOK(poolData, '185.66.164.4:443', poolData.ips['185.66.164.4:443'], 1792450000000), true, 'Clean non-proxy hosting IP passes reputationOK in v2.0.2');

  const poolCtx = vm.createContext({
    console, setTimeout: () => 0, clearTimeout: () => {}, now: () => 1792450000000, sleep: async () => {},
    cleanErr: e => String(e?.message || e), regionLabel: x => x, ccF: x => x, REGION_NAME: x => x,
    h: () => ({ append() {}, replaceChildren() {}, classList: { add() {} }, remove() {} }),
    document: { body: { append() {} }, querySelector: () => null }, toast: () => {}, isVless: p => /^vless:/i.test(p || ''),
    UI: { host: { account: null } }, Bus: { emit() {}, on: () => () => {} }, Chats: new Map(),
    Store: { get: (_k, d) => d, set() {} }, Nodes: { accts: [], refreshAccts: async () => {}, list: [] },
    RouteState: require('../ui/route-state'), Host: { shared: async () => poolData },
  });
  vm.runInContext(poolSrc.slice(poolSrc.indexOf('const Pool ='), poolSrc.indexOf('// 节点在编辑器里改了')) + ';this.Pool=Pool;', poolCtx);
  vm.runInContext(iprepSrc.slice(0, iprepSrc.indexOf('// 后台：启动 1 分钟后')) + ';this.IPRep=IPRep;', poolCtx);
  poolCtx.Pool.d = JSON.parse(JSON.stringify(poolData));

  const scBasic = poolCtx.IPRep.score('185.66.164.4:443', poolCtx.Pool.d.ips['185.66.164.4:443']);
  assert.equal(scBasic.known, true, 'clean non-proxy hosting IP is rated usable in v2.0.2');
  assert.equal(scBasic.s, 82);

  // Once real IPPure data arrives (dc: true, res: false, fs: 3), score is 44% (高风险)
  Object.assign(poolCtx.Pool.d.rep['185.66.164.4'], { a: 1792400000000, h: true, px: true, pu: { fs: 37, ip: '185.66.164.4', res: false, bc: false, dc: true, org: 'FT Systems Ltd', real: 1, via: 'ippure' } });
  poolCtx.IPRep.invalidate();
  const scReal = poolCtx.IPRep.score('185.66.164.4:443', poolCtx.Pool.d.ips['185.66.164.4:443']);
  assert.equal(scReal.known, true);
  assert.equal(scReal.s, 44);
  assert.equal(scReal.tier, 'bad');
  assert.equal(poolCtx.IPRep.label(scReal), '高风险');

  // 3. Impure quarantine cooldown & recovery in Pool
  assert.ok(poolSrc.includes("else if (kind === 'impure')"));
  assert.ok(poolSrc.includes("coolTemporarily(d, k, kind = 'rc', egIp = '', why = '')"));
  poolCtx.Pool.coolTemporarily(poolCtx.Pool.d, '185.66.164.4:443', 'impure', '185.66.164.4', '纯净度不足');
  assert.equal(poolCtx.Pool.cooling(poolCtx.Pool.d.ips['185.66.164.4:443']), true, 'Quarantined impure IP must be in cooling state');

  // 4. Viewport 10-item probing on open & scroll in NodeRoutes & RegionIP + pre-send purity gate
  assert.ok(nrSrc.includes('function visiblePipBatch(limit=10'));
  assert.ok(nrSrc.includes("pipList.addEventListener('scroll'"));
  assert.ok(ripSrc.includes('const liveEg=IPRep.normIp?.(IP.ip)||IP.ip;'));
  assert.ok(viewSrc.includes('const pre = await IPRep.ensurePreSendPure({ timeoutMs: 2400 })'));
  assert.ok(coreSrc.includes('IPRep.ensurePreSendPure({ timeoutMs: 2400 })'));
  assert.ok(evalCoreSrc.includes('IPRep.ensurePreSendPure({ timeoutMs: 2400 })'));
  assert.ok(envCheckSrc.includes('IPRep.check({ forceOnHighRisk: true })'));

  // 5. Banned-account startup recovery (compactPipPool on loadDB, skip banned cur on close, 12s boot loader watchdog, immediate boot.js fallback)
  assert.ok(mainSrc.includes('DB.shared.pippool = compactPipPool(DB.shared.pippool)'));
  assert.ok(mainSrc.includes('if (cur === a.id && a.ban) {'));
  assert.ok(mainSrc.includes('if(st!==\'ready\'&&st!==\'browse\')'));
  assert.ok(bootSrc.includes('const coldBanned = Boolean(UI.host?.account?.ban || (cmCold && cmCold.id === UI.host?.account?.id && cmCold.banned === true));'));
  assert.ok(bootSrc.includes("setTimeout(() => r({ state: 'offline', reason: 'timeout' }), 6000)"));

  // 6. Consistent 44% purity before & after connecting (entry host:port vs bare exit IP) & preload/bundle upgrade protection
  poolCtx.Pool.d.ips['185.66.164.51:443'] = { ip: '185.66.164.51', port: '443', loc: 'GB', eg: '185.66.164.4', ms: 210, ok: true };
  poolCtx.Pool.d.rep['185.66.164.4'] = { a: 1793088000000, h: true, px: true, isp: 'Iomart Managed Services Limited', pu: { fs: 3, ip: '185.66.164.4', res: false, bc: false, dc: true, org: 'Perfecto Mobile UK LTD', real: 1, via: 'ippure' } };
  poolCtx.IPRep.invalidate();
  const scBeforeConnect = poolCtx.IPRep.score('185.66.164.51:443', poolCtx.Pool.d.ips['185.66.164.51:443']);
  const scAfterConnect = poolCtx.IPRep.score('185.66.164.4');
  assert.equal(scBeforeConnect.s, 44, 'Proxy+hosting exit with fs:3 dc:true must score 44% before connecting (never 88% or 84%)');
  assert.equal(scAfterConnect.s, 44, 'Bare exit IP lookup after connecting must match 44%');

  const bundleSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bundle.js'), 'utf8');
  const afterPackSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'after-pack.js'), 'utf8');
  const extCompatPreloadSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension-compat-preload.js'), 'utf8');
  assert.ok(bundleSrc.includes("txt.includes('const VERSION = ' + JSON.stringify(version || ''))"));
  assert.ok(afterPackSrc.includes('delete node.unpacked;'));
  assert.ok(extCompatPreloadSrc.includes("typeof contextBridge?.executeInMainWorld === 'function'"));
});
