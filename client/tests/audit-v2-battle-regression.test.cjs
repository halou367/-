const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(rootDir, rel), 'utf8');

test('Audit v2 + Battle supplement: 7 lexical scope fixes, R01-R18, RG01-RG53, B01-B13, BT01-BT50', async () => {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const bpSrc = read('ui/billing-probe.js');
  const strengthSrc = read('ui/strength.js');
  const dockSrc = read('ui/dock.js');
  const coreSrc = read('ui/core.js');
  const accountsSrc = read('ui/accounts.js');
  const viewSrc = read('ui/view.js');
  const htmlPreviewSrc = read('ui/html-preview.js');
  const evalViewSrc = read('ui/eval-view.js');
  const evalCoreSrc = read('ui/eval-core.js');
  const titleSyncSrc = read('ui/title-sync.js');
  const hbbSrc = read('ui/habit-builtin-bank.js');

  // 1. Lexical scope & cross-closure fixes (E01-E06, E51 / RG01-RG05)
  assert.ok(!bpUiSrc.includes('probe?.reference'), 'E01: unbound probe?.reference removed from billing-probe-ui.js');
  assert.ok(bpUiSrc.includes('engine?.reference'), 'E01: mergeCandidates uses engine?.reference');
  assert.ok(bpUiSrc.includes('BillingProbe.getLiveState'), 'E04: ChatHabitFingerprint.identifyAndApply uses BillingProbe.getLiveState');
  assert.match(strengthSrc, /function register\(\)\s*\{[\s\S]{0,300}const k = sid;/, 'E02/E51: strength.js register declares const k = sid');
  assert.ok(dockSrc.includes("sideUpper = isA ? 'A' : 'B'"), 'E03: dock.js renderSideCard declares sideUpper');
  assert.ok(coreSrc.includes('sanitize: sanitizeCachedMsgs') && coreSrc.includes('MsgCache.sanitize(this.messages)'), 'E05: MsgCache.sanitize exposed and called');
  assert.ok(coreSrc.includes('const patchAssistantParts = this._patchAssistantParts = (o, m) =>') && coreSrc.includes('typeof this._patchAssistantParts === \'function\''), 'E06: patchAssistantParts bound on Chat instance');
  assert.ok(accountsSrc.includes('async existingAccount(a, em, form, msg, current)') && accountsSrc.includes('const fail = (box, err) =>'), 'accounts.js existingAccount declares local fail helper');

  // 2. Dock barrier (R07 / RG19) & View FNV-1a HTML memoKey (BE22 / BT36)
  assert.ok(dockSrc.includes('_renderedSid !== curSidForBarrier'), 'R07/RG19: Dock.render enforces session switch barrier');
  assert.ok(viewSrc.includes('2166136261') && viewSrc.includes('16777619'), 'BE22/BT36: view.js uses FNV-1a full-body hash for HTML memoKey');
  assert.ok(htmlPreviewSrc.includes('openEvalMessage(chat, msg, posOrOpts = {}, maybeOpts = null)'), 'BE23/BT35: html-preview.js supports 3/4-arg openEvalMessage contract');
  assert.ok(htmlPreviewSrc.includes('_lastFilesDigest') && htmlPreviewSrc.includes('artifactDigest'), 'BE25/BE41/BT39: html-preview.js tracks filesDigest and freezes screenshot metadata');
  assert.ok(evalViewSrc.includes("HtmlPreview.openEvalMessage?.(chat, msg, { pos, mode: 'run' })") && evalViewSrc.includes("HtmlPreview.openEvalMessage?.(chat, msg, { pos, mode: 'code'"), 'BE23/BT35: eval-view.js passes pos to openEvalMessage');

  // 3. TitleSync provenance & reverse-teacher guard (RG40 / E25)
  assert.ok(titleSyncSrc.includes("authentication: cur?.authentication || 'restored-title'"), 'RG40: TitleSync marks title-restored models with restored-title provenance');
  assert.ok(bpUiSrc.includes("if (modelEntry?.fromTitle || modelEntry?.origin === 'title') return null;"), 'RG40: learnFromReverseTeacher rejects title-restored entries');

  // 4. BillingProbe snapshot deep-clone, reqSeq CAS, and tri-state diophantinePassed (R09, R16 / RG23, RG36)
  assert.ok(bpSrc.includes('row.diophantinePassed === true ? true : (row.diophantinePassed === false ? false : null)'), 'R09/RG23: tri-state diophantinePassed');
  assert.ok(bpSrc.includes('const reqSeq = (s._reqSeq = (s._reqSeq || 0) + 1);') && bpSrc.includes('if (s._reqSeq !== reqSeq'), 'R16/RG36: reqSeq CAS guard in BillingProbe.refresh');

  // 5. EvalEngine Battle pairing, retry version archive, and server completion priority (B01-B08 / BT01-BT15)
  assert.ok(evalCoreSrc.includes("async function submitVote(sid, voteValue = 'tie', opts = {})"), 'B01/BT01: submitVote supports explicit turn/message opts');
  assert.ok(evalCoreSrc.includes('targetMsg._versionArchive.push(') && evalCoreSrc.includes('targetMsg.retryRegenerationCount ='), 'B04/BT06: retryEvalMessage archives previous version and increments retryRegenerationCount');
  assert.ok(evalCoreSrc.includes("const pServerDone = pHas && pm.status !== 'pending'"), 'B05/BT13: mergeEvalObjects prioritizes completed server message over stale pending cache');

  // 6. Behavioral VM verification of ChatHabitFingerprint & BillingProbe (RG01, RG15, RG30, BT14, BT21, BT25)
  const storeMap = {};
  const modelsAll = {};
  const chatsMap = new Map();
  const ctx = vm.createContext({
    console, Math, Date, Set, Map, WeakMap, Object, Array, Number, String, Boolean, RegExp, JSON, Promise, Buffer, Error, parseInt, parseFloat, isNaN, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    now: () => 1700000000000,
    Store: { get: (k, d) => (k in storeMap ? storeMap[k] : d), set: (k, v) => { storeMap[k] = v; } },
    Bus: { on: () => {}, emit: () => {} },
    Strength: {
      canon: s => String(s || '').trim().toLowerCase().replace(/^[a-z0-9_-]+\//, '').replace(/\s*[（(]([^）)]+)[）)]\s*$/, (_, t) => (t === '标准' || t === 'standard' ? '' : '-' + t.toLowerCase())).replace(/\s+/g, '-'),
      foldVer: s => String(s || ''),
      reverseDepthScore: () => 88,
    },
    Brand: { of: () => '', NAME: {} },
    Models: {
      all: modelsAll,
      get: sid => modelsAll[sid] || null,
      set: (sid, val) => { modelsAll[sid] = val; },
      save: () => {},
    },
    Chats: {
      get: sid => chatsMap.get(sid) || null,
      has: sid => chatsMap.has(sid),
    },
    Trace: { latest: () => null },
    LiveEst: { of: () => null },
    Prefs: { costProbe: true, autoTitle: false },
    UI: { els: {} },
    Tabs: { cur: null },
    History: { byId: () => null, items: [] },
    document: { querySelector: () => null, createElement: () => ({}) },
    api: () => Promise.resolve({}),
    Host: { shared: () => Promise.resolve(null) },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  for (const f of ['pricing.js', 'confidence.js', 'family.js', 'preimage.js', 'catalog-sync.js']) vm.runInContext(read('ui/arena-trace/' + f), ctx);
  vm.runInContext(bpSrc, ctx);
  vm.runInContext(hbbSrc + '\n' + bpUiSrc + '; this.CHF = ChatHabitFingerprint; this.BP = BillingProbe;', ctx);

  const { CHF, BP } = ctx;

  // BT14/BT15: buildSideVirtualChat strictly filters by participantPosition
  const battleChat = {
    sid: 'battle-pos-test',
    isEvaluation: true,
    evalMode: 'battle',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Compare A and B' }] },
      { id: 'a-unlabeled', role: 'assistant', parts: [{ type: 'text', text: 'Unlabeled message should not leak into side A' }] },
      { id: 'b-msg', role: 'assistant', participantPosition: 'b', parts: [{ type: 'text', text: 'Valid side B output' }] },
    ],
  };
  const vSideA = CHF.buildSideVirtualChat(battleChat, 'a');
  const vSideB = CHF.buildSideVirtualChat(battleChat, 'b');
  assert.equal(vSideA.hasSideAsst, false, 'BT14: unlabeled assistant message must not be attributed to Side A');
  assert.equal(vSideB.hasSideAsst, true, 'BT15: Side B assistant message is preserved on Side B');

  // RG30/B11: computeMessagesDigest changes when text or webdev.files change with same length/id
  const d1 = CHF.computeMessagesDigest([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'AAAA' }], webdev: { files: [{ path: 'index.html', content: '<h1>v1</h1>' }] } }]);
  const d2 = CHF.computeMessagesDigest([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'BBBB' }], webdev: { files: [{ path: 'index.html', content: '<h1>v1</h1>' }] } }]);
  const d3 = CHF.computeMessagesDigest([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'BBBB' }], webdev: { files: [{ path: 'index.html', content: '<h1>v2</h1>' }] } }]);
  assert.notEqual(d1, d2, 'RG30: digest changes when assistant text changes with identical length');
  assert.notEqual(d2, d3, 'B11: digest changes when webdev.files content changes with identical length');

  // RG01: unpooled habit candidate in mergeCandidates has revPct=null, both=false, diophantinePassed=false
  const testSid = 'rg01-unpooled-test';
  chatsMap.set(testSid, {
    sid: testSid,
    loaded: true,
    messages: [
      { id: 'u-rg01', role: 'user', parts: [{ type: 'text', text: 'Write a short poem.' }] },
      { id: 'a-rg01', role: 'assistant', parts: [{ type: 'text', text: 'Here is a short poem about the ocean.' }], metadata: { pending: false } },
    ],
  });
  const merged = BP.mergeCandidates(testSid, { candidates: [], samples: { observations: 0 } }, null);
  assert.ok(merged.length > 0, 'RG01: habit candidates returned when billing pool is empty');
  for (const cand of merged) {
    assert.equal(cand.revPct, null, 'RG01: unpooled habit candidate must have revPct === null');
    assert.equal(cand.both, false, 'RG01: unpooled habit candidate must have both === false');
    assert.notEqual(cand.diophantinePassed, true, 'RG01: unpooled habit candidate must not have diophantinePassed === true');
  }

  // RG15 / R05: summary(sid, { readOnly: true }) does not write to Models.all[sid]
  delete modelsAll[testSid];
  BP.clearSummaryCache();
  const roSum = BP.summary(testSid, { readOnly: true });
  assert.ok(roSum && Array.isArray(roSum.top), 'RG15: readOnly summary returns valid summary object');
  assert.equal(modelsAll[testSid], undefined, 'RG15: readOnly summary must not mutate Models.all[sid]');
});
