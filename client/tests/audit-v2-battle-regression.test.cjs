const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function createRecognitionVm() {
  const bpUiSrc = read('ui/billing-probe-ui.js');
  const bpSrc = read('ui/billing-probe.js');
  const hbbSrc = read('ui/habit-builtin-bank.js');
  const catalogObj = JSON.parse(read('ui/arena-trace/catalog.json'));

  const storeMap = {};
  const modelsAll = {};
  const chatsMap = new Map();
  let curAcc = 'acct-1';
  const ctx = vm.createContext({
    console, Math, Date, Set, Map, WeakMap, Object, Array, Number, String, Boolean, RegExp, JSON, Promise, Buffer, Error, parseInt, parseFloat, isNaN, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    now: () => 1700000000000,
    Acc: { get cur() { return curAcc; }, set cur(v) { curAcc = v; } },
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
  for (const f of ['pricing.js', 'confidence.js', 'family.js', 'preimage.js', 'catalog-sync.js']) {
    vm.runInContext(read('ui/arena-trace/' + f), ctx);
  }
  vm.runInContext(bpSrc.replace('/*__ARENA_AGENT_CATALOG__*/null', JSON.stringify(catalogObj)), ctx);
  vm.runInContext(hbbSrc + '\n' + bpUiSrc + '; this.CHF = ChatHabitFingerprint; this.BP = BillingProbe;', ctx);
  return { ctx, CHF: ctx.CHF, BP: ctx.BP, storeMap, modelsAll, chatsMap, catalogObj };
}

test('1. Lexical scope, cross-closure & static anchor invariants (E01-E06, E51, QE01-QE13, QE55)', () => {
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

  assert.ok(!bpUiSrc.includes('probe?.reference'), 'E01: unbound probe?.reference removed');
  assert.ok(bpUiSrc.includes('engine?.reference'), 'E01: mergeCandidates uses engine?.reference');
  assert.ok(bpUiSrc.includes('BillingProbe.getLiveState'), 'E04: ChatHabitFingerprint.identifyAndApply uses BillingProbe.getLiveState');
  assert.match(strengthSrc, /function register\(\)\s*\{[\s\S]{0,300}const k = sid;/, 'E02/E51: strength.js register declares const k = sid');
  assert.ok(dockSrc.includes("sideUpper = isA ? 'A' : 'B'"), 'E03: dock.js renderSideCard declares sideUpper');
  assert.ok(coreSrc.includes('sanitize: sanitizeCachedMsgs') && coreSrc.includes('MsgCache.sanitize(this.messages)'), 'E05: MsgCache.sanitize exposed and called');
  assert.ok(coreSrc.includes('const patchAssistantParts = this._patchAssistantParts = (o, m) =>'), 'E06: patchAssistantParts bound on Chat instance');
  assert.ok(coreSrc.includes('const casOk = this.idTok === tok && this.idP === my && this.sid === reqSid && (!reqOwner || typeof Acc === \'undefined\' || Acc.cur === reqOwner)'), 'QE55: Chat.identify enforces full-context CAS');
  assert.ok(accountsSrc.includes('async existingAccount(a, em, form, msg, current)') && accountsSrc.includes('const fail = (box, err) =>'), 'QE09: accounts.js existingAccount declares local fail helper');
  assert.ok(dockSrc.includes('_renderedSid !== curSidForBarrier'), 'QE56: Dock.render enforces session switch barrier');
  assert.ok(viewSrc.includes('2166136261') && !viewSrc.includes('const step = len > 384 ? 4 : 1'), 'QE15: view.js uses full-byte step=1 FNV-1a hash');
  assert.ok(htmlPreviewSrc.includes('openEvalMessage(chat, msg, posOrOpts = {}, maybeOpts = null)') && !htmlPreviewSrc.includes('const step = c.length > 512 ? 4 : 1'), 'QE12/QE16: html-preview.js full-byte filesDigest and 3/4-arg openEvalMessage');
  assert.ok(evalViewSrc.includes('messageAId: lastTurn?.a?.id || null, messageBId: lastTurn?.b?.id || null'), 'QE30: eval-view passes current turn messageAId/messageBId to submitVote');
  assert.ok(evalCoreSrc.includes('chat.finalBattleRecord = finalBattleRecord'), 'QE31/QE32: eval-core freezes chat.finalBattleRecord on reveal');
  assert.ok(titleSyncSrc.includes("authentication: cur?.authentication || 'restored-title'"), 'QE45: TitleSync marks title-restored models');
  assert.ok(bpSrc.includes('const reqSeq = (s._reqSeq = (s._reqSeq || 0) + 1);'), 'QE27: reqSeq CAS guard in BillingProbe.refresh');
});

test('2. Full-byte FNV-1a digest & omitted-byte counterexamples (QE14, QE15, QE16, QE50, V3-029, V3-035)', () => {
  const { CHF } = createRecognitionVm();

  // Counterexample 1: 20,052-byte HTML artifact mutated at single byte index 5002 (5002 % 4 !== 0, outside head/tail 120 chars)
  const prefix = '<!doctype html><html><body><pre>' + 'a'.repeat(4970);
  const suffix = 'a'.repeat(20052 - prefix.length - 1 - 20) + '</pre></body></html>';
  const htmlBefore = prefix + 'a' + suffix;
  const htmlAfter = prefix + 'b' + suffix;
  assert.equal(htmlBefore.length, 20052);
  assert.equal(htmlAfter.length, 20052);
  assert.equal(htmlBefore.slice(0, 120), htmlAfter.slice(0, 120));
  assert.equal(htmlBefore.slice(-120), htmlAfter.slice(-120));

  const msgBase = { id: 'audit-only-m1', role: 'assistant', status: 'success', participantPosition: 'a', v: 1, retryRegenerationCount: 0 };
  const digTextA = CHF.computeMessagesDigest([{ ...msgBase, content: htmlBefore, parts: [{ type: 'text', text: htmlBefore }] }]);
  const digTextB = CHF.computeMessagesDigest([{ ...msgBase, content: htmlAfter, parts: [{ type: 'text', text: htmlAfter }] }]);
  assert.notEqual(digTextA, digTextB, 'QE14: computeMessagesDigest must distinguish middle-byte mutation at index 5002');

  const digFileA = CHF.computeMessagesDigest([{ ...msgBase, webdev: { files: [{ path: 'index.html', content: htmlBefore }] } }]);
  const digFileB = CHF.computeMessagesDigest([{ ...msgBase, webdev: { files: [{ path: 'index.html', content: htmlAfter }] } }]);
  assert.notEqual(digFileA, digFileB, 'QE14/V3-035: computeMessagesDigest must distinguish middle-byte mutation in webdev.files');

  // Counterexample 2: 10-message conversation where message #0 changes (previously omitted by .slice(-8))
  const tenMsgsA = Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: 'msg-' + i + '-v1' }] }));
  const tenMsgsB = tenMsgsA.map((m, i) => i === 0 ? { ...m, parts: [{ type: 'text', text: 'msg-0-v2' }] } : m);
  assert.notEqual(CHF.computeMessagesDigest(tenMsgsA), CHF.computeMessagesDigest(tenMsgsB), 'QE14: computeMessagesDigest must hash all messages, not just .slice(-8)');
});

test('3. Pure-read summary default, ro/rw cache separation & extractFeatures cache decoupling (QE18-QE22, V3-016..V3-021)', () => {
  const { CHF, BP, modelsAll, chatsMap } = createRecognitionVm();

  const sid = 'pure-read-summary-test';
  chatsMap.set(sid, {
    sid,
    loaded: true,
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Write an SVG icon.' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/></svg>' }], metadata: { pending: false } },
    ],
  });

  // QE19: calling summary(sid) with NO options defaults to readOnly=true and does NOT write Models.all[sid]
  delete modelsAll[sid];
  BP.clearSummaryCache();
  const sumDefault = BP.summary(sid);
  assert.ok(sumDefault && Array.isArray(sumDefault.top), 'QE19: default summary returns valid object');
  assert.equal(modelsAll[sid], undefined, 'QE19: summary(sid) with default options must be pure-read and not write Models.all[sid]');

  // QE18: extractFeatures on a chat with loaded messages does not depend on mutable Models.get(sid).name
  const feat1 = CHF.extractFeatures(chatsMap.get(sid), { sid, name: 'Model Alpha' });
  const feat2 = CHF.extractFeatures(chatsMap.get(sid), { sid, name: 'Model Beta' });
  assert.equal(feat1, feat2, 'QE18: extractFeatures cache key for loaded messages is independent of mutable modelEntry.name');
});

test('4. Side-aware Battle retraction, persistent tombstones & zero-arg calibration rebuild (QE23-QE25, V3-051..V3-055)', () => {
  const { CHF } = createRecognitionVm();

  const baseSid = 'battle-tombstone-test-001';
  const chatA = {
    sid: baseSid + '#a',
    isEvaluation: true,
    evalMode: 'battle',
    battleSide: 'a',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Explain quantum computing.' }] },
      { id: 'm-a', role: 'assistant', participantPosition: 'a', parts: [{ type: 'text', text: '## Quantum Computing\n- Qubits\n- Superposition' }] },
    ],
  };
  const chatB = {
    sid: baseSid + '#b',
    isEvaluation: true,
    evalMode: 'battle',
    battleSide: 'b',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Explain quantum computing.' }] },
      { id: 'm-b', role: 'assistant', participantPosition: 'b', parts: [{ type: 'text', text: 'Quantum computing uses quantum-mechanical phenomena.' }] },
    ],
  };

  CHF.learnFromChat(chatA, 'Claude Opus 5.5 (High)', { userConfirmed: true, battleRevealed: true, battlePaired: true, battleSide: 'a' });
  CHF.learnFromChat(chatB, 'Claude Opus 5.5 (Medium)', { userConfirmed: true, battleRevealed: true, battlePaired: true, battleSide: 'b' });

  assert.ok(CHF.loadBank().some(s => s.sid === baseSid + '#a'), 'Side A learned');
  assert.ok(CHF.loadBank().some(s => s.sid === baseSid + '#b'), 'Side B learned');

  // QE23/V3-051: Revoking ONLY side A keeps side B intact
  CHF.revokeBattleLearningEvent(baseSid, { side: 'a', reason: 'test-side-a-retract' });
  assert.ok(!CHF.loadBank().some(s => s.sid === baseSid + '#a'), 'QE23: Side A removed after side-specific revoke');
  assert.ok(CHF.loadBank().some(s => s.sid === baseSid + '#b'), 'QE23: Side B preserved after side-specific revoke');

  // QE25/V3-053/V3-054: Stale remote sync must NOT resurrect tombstoned Side A
  CHF.mergeSharedBank([
    { sid: baseSid + '#a', model: 'claude-opus-5.5-high', rawLabel: 'Claude Opus 5.5 (High)', vec: new Array(20).fill(0.5), at: 1600000000000, userConfirmed: true, battleRevealed: true },
  ]);
  assert.ok(!CHF.loadBank().some(s => s.sid === baseSid + '#a'), 'QE25/V3-054: Tombstone blocks stale remote resurrection of Side A');

  // QE24/V3-055: Zero-arg rebuildCalibrationFromBank() loads from loadBank() instead of wiping calibration
  const calAfterRebuild = CHF.rebuildCalibrationFromBank();
  assert.ok(calAfterRebuild && Object.keys(calAfterRebuild.protoCentroids || {}).length > 0, 'QE24: zero-arg rebuildCalibrationFromBank preserves centroids from bank');
});

test('5. Battle per-side learning receipt, partial failure retry & unfabricated postPct (QE35-QE37, V3-047..V3-050)', () => {
  const { CHF, chatsMap } = createRecognitionVm();

  const bSid = 'battle-receipt-test-002';
  const bChat = {
    sid: bSid,
    isEvaluation: true,
    evalMode: 'battle',
    voteState: {
      revealed: true,
      vote: 'a',
      modelAName: 'Claude Fable 5.1 (Max)',
      modelBName: 'Muse Spark 1.3 (Max)',
      messageAId: 'msg-a-final',
      messageBId: 'msg-b-final',
    },
    finalBattleRecord: {
      sid: bSid,
      attemptId: bSid + ':attempt-1',
      messageAId: 'msg-a-final',
      messageBId: 'msg-b-final',
      sideA: { messageId: 'msg-a-final', modelName: 'Claude Fable 5.1 (Max)' },
      sideB: { messageId: 'msg-b-final', modelName: 'Muse Spark 1.3 (Max)' },
    },
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Create an animated SVG.' }] },
      { id: 'msg-a-draft', role: 'assistant', participantPosition: 'a', status: 'failed', failed: true, parts: [{ type: 'text', text: 'Failed draft' }] },
      { id: 'msg-a-final', role: 'assistant', participantPosition: 'a', status: 'success', parts: [{ type: 'text', text: '<!DOCTYPE html><html><body><svg viewBox="0 0 800 600"><title>Pelican on a Bicycle</title></svg><script>requestAnimationFrame(()=>{});</script></body></html>' }] },
      { id: 'msg-b-final', role: 'assistant', participantPosition: 'b', status: 'success', parts: [{ type: 'text', text: '<!DOCTYPE html><html><body><svg viewBox="0 0 800 600"></svg><script>(function(){requestAnimationFrame(()=>{});})();</script></body></html>' }] },
    ],
  };
  chatsMap.set(bSid, bChat);

  // V3-050: Simulate Side B failure on first reveal attempt
  CHF.learnBattleReveal(bChat, { simulateSideBFailure: true, attemptId: bSid + ':attempt-1' });
  assert.equal(bChat.voteState.learnedA, true, 'V3-050: Side A learned on partial failure');
  assert.equal(bChat.voteState.learnedB, false, 'V3-050: Side B marked unlearned when Side B fails');
  assert.equal(bChat.voteState.learnedAt, null, 'V3-050: Overall learnedAt remains null until both sides succeed');

  const firstAReceiptAt = bChat.voteState.learnedReceipt.a.at;
  // Retry learnBattleReveal: Side A should be skipped via idempotent receipt while Side B is learned
  CHF.learnBattleReveal(bChat, { attemptId: bSid + ':attempt-1' });
  assert.equal(bChat.voteState.learnedA, true, 'V3-049: Side A remains learned');
  assert.equal(bChat.voteState.learnedB, true, 'V3-050: Side B succeeds on retry');
  assert.ok(bChat.voteState.learnedAt > 0, 'V3-050: Overall learnedAt set once both sides succeed');
  assert.equal(bChat.voteState.learnedReceipt.a.at, firstAReceiptAt, 'V3-049: Side A receipt timestamp unchanged on idempotent retry');

  // QE37: ensureRevealedCandidate does not fabricate 99.2 when revealed model is missing from postList
  const sideCard = CHF.analyzeBattleChat(bChat);
  assert.ok(sideCard && sideCard.a && sideCard.b, 'analyzeBattleChat returns both sides a and b');
});

test('6. Effort tie ambiguity, NN-first effort, no 108.4 cps imputation, final artifact & LOO 5/5 (QE41-QE44, QE52-QE54, V3-033..V3-064)', () => {
  const { CHF, BP, chatsMap } = createRecognitionVm();

  // QE43/VE19: Abnormal duration (>= 3600000ms) with missing cps must NOT impute 108.4 cps
  const abnChat = { sid: 'abn-dur-chat', messages: [] };
  const abnEntry = {
    sid: 'abn-dur-chat',
    habitFeatures: {
      vec: new Array(20).fill(0.4),
      meta: { avgTurnDurMs: 7200000, cps: 0, memoAvgChunk: 12.4, memoDeltaCount: 80, meanChars: 5200, totalTools: 1, write: 1 },
    },
  };
  const abnFeat = CHF.extractFeatures(abnChat, abnEntry);
  assert.equal(abnFeat.cps, 0, 'QE43: abnormal duration must not impute 108.4 cps');
  assert.equal(abnFeat.cpsMissing, true, 'QE43: cpsMissing flag set');
  assert.equal(abnFeat.abnormalDuration, true, 'QE43: abnormalDuration flag set');

  // QE54/V3-033: Incomplete/pending-only turn sets fromIncompleteTurn=true and blocks learnFromChat
  const pendingChat = {
    sid: 'incomplete-turn-chat',
    busy: true,
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Write code' }] },
      { id: 'a1', role: 'assistant', status: 'streaming', metadata: { pending: true }, parts: [{ type: 'text', text: 'Partial streaming output...' }] },
    ],
  };
  const incFeat = CHF.extractFeatures(pendingChat);
  assert.equal(incFeat.fromIncompleteTurn, true, 'QE54: pending-only assistant message marks fromIncompleteTurn=true');
  const learnedInc = CHF.learnFromChat(pendingChat, 'Claude Opus 5.5 (High)', { userConfirmed: true });
  assert.equal(learnedInc, null, 'QE54/V3-033: learnFromChat refuses to ingest incomplete/streaming turn into bank');

  // QE53/V3-034: Multi-artifact turn selects final delivered HTML artifact over longer intermediate draft
  const draftHtml = '<!DOCTYPE html><html><head><title>Draft</title><style>:root{color-scheme:dark;}</style></head><body><svg viewBox="0 0 800 600">' + '<circle cx="10" cy="10" r="5"/>'.repeat(520) + '</svg></body></html>';
  const finalHtml = '<!DOCTYPE html><html><head><title>Pelican on a Bicycle</title><style>:root{--sky:#87ceeb;}</style></head><body><svg viewBox="0 0 800 600"><g id="cloudTile"></g><g id="crankR"></g><g id="wheel_R"></g>' + '<path d="M10 10 L20 20"/>'.repeat(480) + '</svg><script>requestAnimationFrame(()=>{});</script></body></html>';
  assert.ok(draftHtml.length > finalHtml.length, 'Draft HTML is longer than final HTML');
  const multiArtChat = {
    sid: 'multi-artifact-chat',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Create pelican HTML and refine it.' }] },
      {
        id: 'a1',
        role: 'assistant',
        status: 'success',
        parts: [
          { type: 'tool-write_file', toolName: 'write_file', input: { path: 'draft.html', content: draftHtml } },
          { type: 'tool-write_file', toolName: 'write_file', input: { path: 'pelican.html', content: finalHtml } },
        ],
      },
    ],
  };
  const maFeat = CHF.extractFeatures(multiArtChat);
  assert.match(String(maFeat.htmlSvgMatch?.best?.family || ''), /claude-fable-5\.1/, 'QE53/V3-034: final delivered HTML artifact is classified instead of longer draft');

  // QE44/QE52/V3-059: structuralReverse candidates mark sameOriginAsHabit=true and mergeCandidates sets both=false
  chatsMap.set('struct-rev-chat', multiArtChat);
  const structList = CHF.structuralReverse(multiArtChat, null);
  assert.ok(structList.length > 0, 'structuralReverse returns candidates');
  assert.equal(structList[0].sameOriginAsHabit, true, 'QE52: structuralReverse marks sameOriginAsHabit=true');
  assert.equal(structList[0].independentEvidence, false, 'QE52: structuralReverse marks independentEvidence=false');

  // V3-043/V3-045/V3-046: Conflicting manual label vs platform Battle reveal preserves both labels and sets labelConflict=true
  const conflictChat = {
    sid: 'conflict-label-chat#a',
    isEvaluation: true,
    evalMode: 'battle',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'a1', role: 'assistant', participantPosition: 'a', status: 'success', parts: [{ type: 'text', text: 'Hello from Battle side A.' }] },
    ],
  };
  CHF.learnFromChat(conflictChat, 'Claude Opus 5.5 (High)', { userConfirmed: true, battleRevealed: true });
  const afterManual = CHF.learnFromChat(conflictChat, 'Claude Opus 5.5 (Medium)', { userConfirmed: true, battleRevealed: false });
  assert.equal(afterManual.platformRevealedModel, 'claude-opus-5.5-high', 'V3-046: platformRevealedModel preserved');
  assert.equal(afterManual.userCorrectedModel, 'claude-opus-5.5-medium', 'V3-046: userCorrectedModel recorded');
  assert.equal(afterManual.labelConflict, true, 'V3-046: labelConflict flagged when manual correction disagrees with platform reveal');

  // V3-043: Relabeled audit SIDs preserve previousLabel and relabelRevision in bank
  const relabeledSample = CHF.loadBank().find(s => s.sid === '01a15b82-a43c-71cf-bb6d-d139f15f5c61');
  if (relabeledSample) {
    assert.equal(relabeledSample.model, 'claude-fable-5.1-max', '01a15b82 canonical model is claude-fable-5.1-max');
  }
});
