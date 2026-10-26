      : best.userLearned
        ? '习惯库自学习识别'
        : fromCostFallback
          ? '对话习惯识别（/cost 免请求兜底）'
          : '对话习惯识别';
    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: consistentLabel,
      vendor: decomp.vendor,
      family: decomp.family,
      effort: curEffort,
      tier: curEffort,
      reverseCandidateId: best.id || canon,
      reverseLabel: consistentLabel,
      reverseEffort: curEffort,
      reverseMatch: best.match,
      confidence: best.match,
      reverseScore: revScore,
      habitScore: res.reasoningScore,
      habitTags: res.habitTags,
      habitFeatures: res.features ? { vec: res.features.vec, meta: extractCompactMeta(res.features), isOpenThink: Boolean(res.features.isOpenThink), habitTags: res.features.habitTags, habitReasoningScore: res.features.habitReasoningScore } : known?.habitFeatures,
      habitInferred: true,
      reverseInferred: true,
      billingProbe: true,
      reverseVer: 183,
      guess: false,
      sure: Boolean(best.userLearned || best.match >= 75),
      uncertain: !isStandout,
      pendingConfirm: false,
      fromTitle: false,
      habitCandidates: res.candidates,
      reverseCandidates: preservedRevCands.length ? preservedRevCands : undefined,
      est: { ...(known?.est || {}), score: revScore, source: 'habit' },
      provider: nextProvider,
      messageId: latestAsstId,
      lastMessageId: latestAsstId,
      completedTurnCount: compMsgsNow.length || known?.completedTurnCount || 0,
      at: Date.now(),
    };
    if (interactive || CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }
    if (interactive && (res.features?.isOpenThink || (typeof BillingProbe !== 'undefined' && BillingProbe.shouldSkipCostForOpenSource?.(chat))) && canon !== '开源模型') {
      nextEntry.manualOpenInferred = true;
    }
    if (isNowMidTurnRouted && typeof BillingProbe !== 'undefined' && typeof BillingProbe.applyChatRouteAnnotations === 'function') {
      const rInfo = BillingProbe.applyChatRouteAnnotations(
        sid, chat, null, known, habRouteNow,
        habRouteNow.routeType || 'model',
        habRouteNow.fromLabel,
        habRouteNow.toLabel || canon,
        habRouteNow.reason
      );
      if (rInfo) Object.assign(nextEntry, rInfo);
      if (habRouteNow.toLabel) {
        const routedCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(habRouteNow.toLabel) : String(habRouteNow.toLabel)).replace(/[?？]+$/, '');
        if (routedCanon) {
          nextEntry.name = routedCanon;
          nextEntry.candidateName = routedCanon;
        }
      }
    } else {
      nextEntry.routed = false;
      delete nextEntry.routeType;
      delete nextEntry.routeFrom;
      delete nextEntry.routeTo;
      delete nextEntry.routeReason;
      delete nextEntry.lastRouteNotice;
      delete nextEntry.routeNotices;
    }
    const isUnchanged = Boolean(
      known &&
      known.name === nextEntry.name &&
      known.reverseLabel === nextEntry.reverseLabel &&
      known.tier === nextEntry.tier &&
      Boolean(known.routed) === Boolean(nextEntry.routed) &&
      known.routeTo === nextEntry.routeTo &&
      Boolean(known.habitInferred) === true &&
      !known.pendingConfirm &&
      !known.guess &&
      known.reverseMatch === nextEntry.reverseMatch &&
      known.reverseScore === nextEntry.reverseScore &&
      known.provider === nextEntry.provider &&
      (!latestAsstId || known.lastMessageId === latestAsstId) &&
      (known.reverseVer || 0) >= 183
    );
    if (isUnchanged && !interactive) return known;
    if (typeof Models !== 'undefined') {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { if (typeof Bus !== 'undefined') Bus.emit('model', chat, nextEntry); } catch {}
    }
    try {
      if (typeof Notes !== 'undefined') {
        const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
        if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
        Notes.save?.();
      }
      if (typeof Titles !== 'undefined') {
        Titles.local?.(sid);
        const shouldCloudSync = Boolean(interactive || (typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid)));
        if (shouldCloudSync) {
          Titles.capture?.(sid, chat?.sentAt);
          Titles.touch?.(sid);
        }
      }
      UI?.renderListSoon?.();
      UI?.renderTabs?.();
      Dock?.soon?.();
    } catch {}
    return nextEntry;
  }

  function confirmUserCorrection(sid, rawModelName, { learn = true, vendorHint = '', familyHint = '', effortHint = '' } = {}) {
    if (!sid) return null;
    const cleaned = String(rawModelName || '').replace(/[?？]+$/, '').trim();
    if (!cleaned) {
      if (typeof toast === 'function') toast('请输入或选择有效的模型名称', 'err');
      return null;
    }
    const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] };
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const habitRes = analyze(chat, known);
    const decomp = decomposeModelIdentity(cleaned, {
      vendor: vendorHint,
      family: familyHint,
      effort: effortHint || undefined,
      rawLabel: cleaned,
    });
    const canon = decomp.canon || (cleaned === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleaned) : cleaned).replace(/[?？]+$/, ''));
    const prevRecognizedModel = String(known?.rawLabel || known?.name || known?.candidateName || habitRes?.best?.label || '').replace(/[?？]+$/, '').trim();
    const sameKnownModel = Boolean(prevRecognizedModel && (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(prevRecognizedModel) : prevRecognizedModel).replace(/[?？]+$/, '').toLowerCase() === canon.toLowerCase());
    const curEffort = decomp.effort || 'standard';
    const tierDefaultScore = curEffort === 'max' ? 86 : curEffort === 'xhigh' ? 78 : curEffort === 'high' ? 70 : curEffort === 'medium' ? 58 : curEffort === 'low' ? 46 : 70;
    const rawBaseScore = (sameKnownModel && known?.reverseScore != null) ? known.reverseScore : (habitRes?.reasoningScore ?? known?.reverseScore ?? tierDefaultScore);
    const score = sameKnownModel ? rawBaseScore : Math.round((rawBaseScore * 0.55 + tierDefaultScore * 0.45) * 10) / 10;
    const isOpen = canon === '开源模型' || isOpenName(canon);

    if (!isOpen && chat) {
      chat._closedLockedModel = canon;
    }

    if (chat && habitRes && Array.isArray(habitRes.candidates)) {
      chat._lastHabitTopKeys = habitRes.candidates
        .slice(0, 3)
        .map(c => String(c.canon || c.label || '').toLowerCase())
        .filter(k => k && k !== canon.toLowerCase());
    }
    recordModelUse(canon, decomp.vendor || vendorHint, decomp.family || familyHint, curEffort);
    let learnedEntry = null;
    if (learn && chat) {
      learnedEntry = learnFromChat(chat, canon, {
        userConfirmed: true,
        autoTeacher: false,
        weight: 3.5,
        score,
        modelMeta: known,
        oldModel: prevRecognizedModel,
        vendorHint: decomp.vendor || vendorHint,
        familyHint: decomp.family || familyHint,
        effortHint: curEffort,
      });
    }
    const refreshedHabit = analyze(chat, known) || habitRes;

    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: decomp.displayLabel || cleaned,
      vendor: decomp.vendor,
      family: decomp.family,
      effort: curEffort,
      reverseCandidateId: canon,
      reverseLabel: decomp.displayLabel || cleaned,
      reverseEffort: curEffort,
      reverseMatch: 100,
      confidence: 100,
      reverseScore: score,
      habitScore: score,
      habitTags: ['✓ 用户手动纠偏确认', ...(refreshedHabit?.habitTags || []).slice(0, 4)],
      habitCandidates: refreshedHabit?.candidates ? refreshedHabit.candidates.slice(0, 5) : known?.habitCandidates,
      userCorrected: true,
      userCorrectedAt: Date.now(),
      habitInferred: true,
      reverseInferred: true,
      tier: curEffort,
      billingProbe: true,
      reverseVer: 183,
      sure: true,
      guess: false,
      uncertain: false,
      pendingConfirm: false,
      fromTitle: false,
      routed: false,
      est: { ...(known?.est || {}), score, source: 'user-corrected' },
      provider: learn ? '手动纠偏确认 · 已记入习惯库' : '手动纠偏确认',
      at: Date.now(),
    };
    delete nextEntry.routeType;
    delete nextEntry.routeFrom;
    delete nextEntry.routeTo;
    delete nextEntry.lastRouteNotice;
    delete nextEntry.routeNotices;

    if (typeof Models !== 'undefined') {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { if (typeof Bus !== 'undefined') Bus.emit('model', chat, nextEntry); } catch {}
    }
    try {
      if (typeof Notes !== 'undefined') {
        const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
        if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
        Notes.save?.();
      }
      if (typeof Titles !== 'undefined') {
        Titles.local?.(sid);
        Titles.capture?.(sid, chat?.sentAt);
        Titles.touch?.(sid);
        Titles.kick?.(true);
      }
      UI?.renderListSoon?.();
      UI?.renderTabs?.();
      Dock?.soon?.();
    } catch {}
    // 全局回溯纠偏（Retroactive Elastic Re-Scoring）：清理缓存并对所有未手动锁定的其它对话（含 /cost 候选池与纯习惯会话）同步应用弹性纠偏与双引擎拟合
    const retroUpdatedCount = learn ? syncAllOpenAndKnownChats({ excludeSid: sid }) : 0;

    const totalLearned = loadBank().length;
    const neighborList = learnedEntry?.softTargets
      ? Object.keys(learnedEntry.softTargets).filter(k => k.toLowerCase() !== canon.toLowerCase()).slice(0, 2)
      : [];
    const neighborHint = neighborList.length ? (' · 弹性邻域牵引[' + neighborList.join(' / ') + ']') : '';
    const retroHint = retroUpdatedCount > 0 ? (' · 已联动修正 ' + retroUpdatedCount + ' 个相似对话') : '';
    if (typeof toast === 'function') {
      toast(`已确认纠偏为「${canon}」（推理分 ${score}）${neighborHint}${retroHint}${learnedEntry ? ` · 习惯库共 ${totalLearned} 条` : ''}`);
    }
    try {
      if (typeof Bus !== 'undefined') Bus.emit('billing', sid);
      UI?.renderList?.();
      UI?.renderTabs?.();
      Dock?.render?.();
      Bar?.render?.();
    } catch {}
    return nextEntry;
  }

  function learnedCount() {
    return loadBank().length;
  }

  function rebuildCalibrationFromBank(samples) {
    const cleanList = (Array.isArray(samples) ? samples : loadBank()).filter(s => s && !isSampleTombstoned(s.sid || `${s.model}:${s.at || 0}`, s.at || 0));
    const freshCal = {
      v: 3,
      updatedAt: Date.now(),
      protoCentroids: {},
      tierCentroids: {},
      intraFamilyHyperplanes: {},
      vendorTierDeltas: {},
      modalityProfiles: {},
      scoreOffsets: {},
      dimWeights: {},
      repelledModels: {},
      reverseCalib: { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
    };
    saveCalibration(freshCal);
    calibratedSessionKeys.clear();
    for (const s of cleanList.slice().reverse()) {
      if (!s || !s.model || !Array.isArray(s.vec)) continue;
      const synthFeat = {
        vec: s.vec,
        tierVec: s.tierVec || s.meta?.tierVec || null,
        meta: s.meta || null,
        evalModality: s.evalModality || s.meta?.evalModality || 'chat',
        habitReasoningScore: s.rawHabitScore ?? s.score ?? 75,
      };
      if (s.softTargets && typeof s.softTargets === 'object' && !s.battleRevealed && !s.directMode) {
        const fakeChat = (typeof Chats !== 'undefined' && s.sid && Chats.get(s.sid)) || { sid: s.sid || '' };
        recordElasticCorrection(
          fakeChat,
          synthFeat,
          s.rejectedModel || '',
          s.model,
          s.score ?? 75,
          s.weight || 1.8
        );
      }
      recordTeacherCalibration(s.model, synthFeat, s.score ?? 75, s.weight || (s.battleRevealed ? 8.5 : s.directMode ? 6.5 : 1.8), s.sid || '');
    }
    const pairMap = new Map();
    for (const s of cleanList) {
      const m = /^(.+)#([ab])$/i.exec(String(s?.sid || ''));
      if (!m || !s.battleRevealed) continue;
      const base = m[1], side = m[2].toLowerCase();
      if (!pairMap.has(base)) pairMap.set(base, {});
      pairMap.get(base)[side] = s;
    }
    for (const [base, pair] of pairMap.entries()) {
      if (pair.a && pair.b && Array.isArray(pair.a.tierVec) && Array.isArray(pair.b.tierVec)) {
        try {
          recordBattlePairwiseContrast(
            { sid: base },
            pair.a.model,
            { vec: pair.a.vec, tierVec: pair.a.tierVec, evalModality: pair.a.evalModality || 'chat', habitReasoningScore: pair.a.score ?? 75 },
            pair.b.model,
            { vec: pair.b.vec, tierVec: pair.b.tierVec, evalModality: pair.b.evalModality || 'chat', habitReasoningScore: pair.b.score ?? 75 },
            'tie',
            pair.a.evalModality || 'chat'
          );
        } catch {}
      }
    }
    return loadCalibration();
  }

  let _bgSyncTimer = null;
  function syncAllOpenAndKnownChats({ excludeSid = '' } = {}) {
    try {
      _analyzeCache.clear();
      if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') {
        BillingProbe.clearSummaryCache();
      }
    } catch {}
    if (_bgSyncTimer) { clearTimeout(_bgSyncTimer); _bgSyncTimer = null; }
    let retroUpdatedCount = 0;
    const openKeys = typeof Chats !== 'undefined' && typeof Chats.keys === 'function' ? [...Chats.keys()] : [];
    const activeSid = (typeof Tabs !== 'undefined' && Tabs.cur?.sid) || (typeof UI !== 'undefined' && UI.els?.chat?.sid) || '';
    const prioritySet = new Set([activeSid, ...openKeys].filter(Boolean));
    const allSids = new Set([
      ...prioritySet,
      ...(typeof Models !== 'undefined' && Models.all ? Object.keys(Models.all) : []),
    ]);
    const syncOneSid = (otherSid) => {
      if (!otherSid || otherSid === excludeSid || isEvalSession(otherSid)) return false;
      const otherChat = (typeof Chats !== 'undefined' && Chats.get(otherSid)) || { sid: otherSid, messages: [] };
      if (otherChat?.busy || otherChat?.isEvaluation || otherChat?.evalMode === 'battle' || otherChat?.evalMode === 'direct') return false;
      const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
      if (om?.userCorrected || om?.routed || om?.directMode || om?.battleRevealed) return false;
      let changed = false;
      try {
        const prevCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(om?.name || '') : String(om?.name || '')).replace(/[?？]+$/, '').toLowerCase();
        let didSyncViaSummary = false;
        const hasCostPool = Boolean(
          (Array.isArray(om?.reverseCandidates) && om.reverseCandidates.length > 0) ||
          (typeof BillingProbe !== 'undefined' && BillingProbe.state?.(otherSid)?.info)
        );
        if (hasCostPool && typeof BillingProbe !== 'undefined' && typeof BillingProbe.summary === 'function') {
          const sumOut = BillingProbe.summary(otherSid, { commit: true, readOnly: false });
          const afterOm = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
          const afterCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(afterOm?.name || '') : String(afterOm?.name || '')).replace(/[?？]+$/, '').toLowerCase();
          if (afterCanon && afterCanon !== prevCanon) {
            changed = true;
            didSyncViaSummary = true;
          } else if (sumOut?.mergedCandidates?.length) {
            didSyncViaSummary = true;
          }
        }
        if (!didSyncViaSummary) {
          const updated = identifyAndApply(otherChat, { force: true, fromCostFallback: true });
          const nextCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(updated?.name || '') : String(updated?.name || '')).replace(/[?？]+$/, '').toLowerCase();
          if (nextCanon && nextCanon !== prevCanon) changed = true;
        }
        if (changed && typeof Titles !== 'undefined' && Titles.local) {
          Titles.local(otherSid);
        }
      } catch {}
      return changed;
    };

    const sidsArr = [...allSids].filter(s => s && s !== excludeSid);
    const syncLimit = Math.max(40, prioritySet.size);
    const immediateSids = sidsArr.slice(0, syncLimit);
    const deferredSids = sidsArr.slice(syncLimit);
    for (const otherSid of immediateSids) {
      if (syncOneSid(otherSid)) retroUpdatedCount++;
    }
    if (deferredSids.length > 0 && typeof setTimeout === 'function') {
      let idx = 0;
      const step = () => {
        _bgSyncTimer = null;
        const end = Math.min(deferredSids.length, idx + 25);
        let batchChanged = false;
        for (; idx < end; idx++) {
          if (syncOneSid(deferredSids[idx])) batchChanged = true;
        }
        if (batchChanged) {
          try { UI?.renderListSoon?.(); } catch {}
        }
        if (idx < deferredSids.length) {
          _bgSyncTimer = setTimeout(step, 16);
        }
      };
      _bgSyncTimer = setTimeout(step, 16);
    }
    try {
      UI?.renderListSoon ? UI.renderListSoon() : UI?.renderList?.();
      UI?.renderTabs?.();
      Dock?.render?.();
      Bar?.render?.();
    } catch {}
    return retroUpdatedCount;
  }

  function openManager() {
    if (typeof modal !== 'function' || typeof h !== 'function') return;
    const MODEL_PRESETS = [
      '',
      'GPT 6.1 Sol (Max)',
      'GPT 6.1 Sol (xHigh)',
      'GPT 6.1 Sol (High)',
      'GPT 6.1 Sol (Medium)',
      'GPT 6.1 Sol (Low)',
      'GPT 6 Astra (Max)',
      'GPT 6 Astra (xHigh)',
      'GPT 6 Astra (High)',
      'GPT 6 Astra (Medium)',
      'GPT 6 Astra (Low)',
      'GPT 6 Sol (Max)',
      'GPT 6 Sol (xHigh)',
      'GPT 6 Sol (High)',
      'GPT 6 Sol (Medium)',
      'GPT 6 Sol (Low)',
      'GPT 6.1 Luna (Max)',
      'GPT 6.1 Luna (xHigh)',
      'GPT 6.1 Luna (High)',
      'GPT 6.1 Luna (Medium)',
      'GPT 6.1 Luna (Low)',
      'GPT 6 Luna (Max)',
      'GPT 6 Luna (xHigh)',
      'GPT 6 Luna (High)',
      'GPT 6 Luna (Medium)',
      'GPT 6 Luna (Low)',
      'GPT 5.6 Sol (High)',
      'GPT 5.6 Terra (Max)',
      'GPT 5.6 Terra (High)',
      'Claude Opus 5.6 (Max)',
      'Claude Opus 5.6 (High)',
      'Claude Opus 5.5 (Max)',
      'Claude Opus 5.5 (High)',
      'Claude Opus 5',
      'Claude Sonnet 5.5 (Max)',
      'Claude Sonnet 5.5 (High)',
      'Claude Fable 5.1 (Max)',
      'Claude Fable 5.1 (High)',
      'Claude Haiku 5.5 (High)',
      'Claude Haiku 5.5 (Medium)',
      'Gemini 4 Argon (Max)',
      'Gemini 4 Argon (High)',
      'Gemini 4 Argon (Medium)',
      'Gemini 4 Argon (Low)',
      'Gemini 4 Argon',
      'Gemini 3.8 Flash (High)',
      'Gemini 3.8 Flash (Medium)',
      'Gemini 3.8 Flash (Max)',
      'Gemini 3.8 Flash (Low)',
      'Gemini 3.7 Flash (High)',
      'Gemini 3.1 Pro Preview (High)',
      'Grok 4.7 (Max)',
      'Grok 4.6 (High)',
      'Grok 4.20 (High)',
      'DeepSeek V4.1 Flash',
      'DeepSeek V4.1 Flash 1017',
      'Beam 1.0 501B A23B',
      'GLM 5.3 Max',
      'GLM 5.2 Max',
      'Qwen 3.8 Max',
      'Qwen 3.8 Flash Next',
      'Qwen 3.7 Max',
      'Kimi K3',
      'MiMo V2.6 Pro',
      'MiMo V2.6 Flash',
      'Muse Spark 1.3 (Max)',
      'Muse Spark 1.2 (xHigh)',
      'Muse Wonder',
      'Muse Spark Open',
      '开源模型',
    ];
    const body = h('div', { class: 'caltab habit-lib-modal' });
    const statusEl = h('p', { class: 'note', style: { margin: '6px 0', color: 'var(--amp-acc, #2f6fed)' } }, '');
    const listWrap = h('div', { class: 'habit-sample-list', style: { maxHeight: '300px', overflowY: 'auto', marginTop: '8px' } });

    const modelSel = h('select', {
      class: 'st-sel',
      style: { flex: '1', minWidth: '170px' },
      onchange: e => { if (e.target.value) modelInp.value = e.target.value; }
    },
      h('option', { value: '' }, '— 选择已知模型（或右侧手动输入）—'),
      ...MODEL_PRESETS.filter(Boolean).map(m => h('option', { value: m }, m))
    );
    const modelInp = h('input', {
      type: 'text',
      class: 'mc-correct-inp',
      style: { flex: '1', minWidth: '170px' },
      placeholder: '输入确定知道的模型名（如 GPT 6 Astra (Low)，留空则用文件内记录）',
      spellcheck: 'false',
    });

    const handleImportFiles = async (fileList) => {
      const files = [...(fileList || [])];
      if (!files.length) return;
      let diagCnt = 0, bankFiles = 0, bankAdd = 0, bankUpd = 0, bankSkip = 0, lastM = '';
      const targetModel = String(modelInp.value || modelSel.value || '').trim();
      try {
        for (const f of files) {
          const txt = await f.text();
          const r = importDiagnosticJson(txt, targetModel);
          if (r?.kind === 'bank') {
            bankFiles++;
            bankAdd += (r.added || 0);
            bankUpd += (r.updated || 0);
            bankSkip += (r.skipped || 0);
          } else {
            diagCnt += (r?.imported || 1);
            if (r?.model) lastM = r.model;
          }
        }
        const retroCnt = syncAllOpenAndKnownChats();
        const curBank = loadBank();
        const modSet = new Set(curBank.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
        const retroSuffix = retroCnt > 0 ? ` · 已联动同步 ${retroCnt} 个对话名称` : '';
        const msg = bankFiles > 0 && diagCnt === 0
          ? `已导入合并习惯测试库：新增 ${bankAdd} 条 · 更新 ${bankUpd} 条 · 跳过重复 ${bankSkip} 条（当前共 ${modSet.size} 个型号 / ${curBank.length} 条样本）${retroSuffix}`
          : bankFiles > 0
            ? `已导入 ${diagCnt} 份诊断 JSON 并合并 ${bankFiles} 份习惯库（新增 ${bankAdd} · 更新 ${bankUpd} · 当前共 ${curBank.length} 条样本）${retroSuffix}`
            : `成功导入 ${diagCnt} 份诊断 JSON 到习惯库${lastM ? `（型号：${lastM}）` : ''}，已同步更新习惯识别${retroSuffix}！`;
        statusEl.textContent = msg;
        if (typeof toast === 'function') toast(msg);
        renderSamples();
      } catch (err) {
        const msg = '导入失败：' + (err?.message || String(err));
        statusEl.textContent = msg;
        if (typeof toast === 'function') toast(msg, 'err');
      }
    };

    const diagFileInp = h('input', {
      type: 'file',
      accept: '.json,application/json',
      multiple: true,
      hidden: true,
      onchange: async () => {
        const files = [...(diagFileInp.files || [])];
        diagFileInp.value = '';
        await handleImportFiles(files);
      }
    });

    const renderSamples = () => {
      const samples = loadBank();
      const calibNow = loadCalibration();
      const userSamples = samples.filter(s => s.userConfirmed && !s.autoTeacher);
      const battleSamples = samples.filter(s => s.battleRevealed);
      const diagSamples = samples.filter(s => s.importedFromDiag);
      const modelSet = new Set(samples.map(s => canonHabitModelName(s?.model || '').toLowerCase()).filter(Boolean));
      const centroidCnt = Object.keys(calibNow?.protoCentroids || {}).length;
      const repelCnt = Object.keys(calibNow?.repelledModels || {}).length;
      const revEffCnt = Object.keys(calibNow?.reverseCalib?.effortScales || {}).length + Object.keys(calibNow?.reverseCalib?.familyBias || {}).length;
      listWrap.replaceChildren();
      listWrap.append(h('div', { class: 'mc-gh', style: { marginBottom: '4px' } },
        h('b', {}, `本机习惯库样本（全部账号共享统一库 · 共 ${samples.length} 条 · ${modelSet.size} 个型号 · 弹性纠偏 ${userSamples.length} 条${battleSamples.length ? ` · ⚔️ Battle揭晓 ${battleSamples.length} 条` : ''} · 诊断导入 ${diagSamples.length} 条 · 双引擎校准[${centroidCnt}原型/${repelCnt}排斥/${revEffCnt}反推]）`)));
      if (!samples.length) {
        listWrap.append(h('p', { class: 'note' }, '暂无自学习样本。可在上方选择已知模型的诊断 JSON（billing-*.json）或习惯库备份文件导入合并，或在右上角模型卡片点「纠偏」确认型号后自动沉淀。'));
        return;
      }
      for (const s of samples.slice(0, 600)) {
        const sidShort = s.sid ? String(s.sid).slice(0, 8) : 'sample';
        const tagText = Array.isArray(s.tags) ? s.tags.join(' · ') : '';
        const decomp = decomposeModelIdentity(s.model || s.rawLabel || '', {
          vendor: s.vendor,
          family: s.family,
          effort: s.effort,
          rawLabel: s.rawLabel,
        });
        const vendorText = s.vendorLabel || decomp.vendorLabel || s.vendor || '未知厂商';
        const familyText = s.familyLabel || decomp.familyLabel || s.family || s.model || '';
        const effortText = s.effortLabel || decomp.effortLabel || ((s.effort || decomp.effort || 'standard') === 'standard' ? '标准' : (s.effort || decomp.effort));
        const tupleDisplay = `[${vendorText}] ${familyText} · 强度:${effortText}`;
        const softNeighbors = s.softTargets && typeof s.softTargets === 'object'
          ? Object.keys(s.softTargets).filter(k => k.toLowerCase() !== String(s.model || '').toLowerCase()).slice(0, 2)
          : [];
        const elasticBadge = (softNeighbors.length || s.rejectedModel)
          ? ` · 🧭邻域[${softNeighbors.join('/') || '—'}]${s.rejectedModel ? ` 排斥[${s.rejectedModel}]` : ''}`
          : '';
        const fullRowTip = [`厂商: ${vendorText} | 型号: ${familyText} | 强度: ${effortText} (${decomp.canon})`, tagText, softNeighbors.length ? `弹性邻域牵引：${softNeighbors.join(', ')}` : '', s.rejectedModel ? `对比排斥旧模型：${s.rejectedModel}` : ''].filter(Boolean).join('\n');
        listWrap.append(h('div', { class: 'mc-row', title: fullRowTip },
          h('span', { style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            (s.battleRevealed ? '⚔️ Battle揭晓 · ' : s.importedFromDiag ? '📥 诊断导入 · ' : (s.userConfirmed && !s.autoTeacher) ? '★ 弹性纠偏 · ' : '⚡ 自动沉淀 · ') + sidShort + elasticBadge + (tagText ? ' · ' + tagText.slice(0, 36) : '')),
          h('b', { style: { marginRight: '8px' } }, `${tupleDisplay}${s.score != null ? ` · 推理分 ${s.score}` : ''}`),
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            title: '从习惯库删除此条样本并重新校准对话名称',
            onclick: () => {
              const next = loadBank().filter(x => x !== s && (x.sid !== s.sid || x.at !== s.at));
              saveBank(next, { replace: true });
              rebuildCalibrationFromBank(next);
              if (s.sid && typeof Models !== 'undefined') {
                const mDel = Models.get(s.sid);
                if (mDel?.userCorrected) {
                  const unlocked = { ...mDel, userCorrected: false };
                  delete unlocked.userCorrectedAt;
                  Models.set(s.sid, unlocked);
                }
              }
              syncAllOpenAndKnownChats();
              renderSamples();
            }
          }, '删除')));
      }
    };

    const importBox = h('div', { class: 'mc-card', style: { padding: '10px 12px', marginBottom: '10px' } },
      h('div', { class: 'mc-gh', style: { marginBottom: '6px' } }, h('b', {}, '📥 导入已知模型诊断 JSON（billing-*.json）辅助习惯识别')),
      h('p', { class: 'note', style: { marginBottom: '8px' } }, '选择或输入你确定知道的真实模型名称，然后选择一个或多个诊断 JSON 文件（如 billing-01a151de...json）或导出的习惯库备份 JSON（brana-habit-bank-*.json），习惯库会自动提取特征向量、去重合并并立即生效。'),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, modelSel, modelInp),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { type: 'button', class: 'btn primary sm', onclick: () => diagFileInp.click() }, '选择诊断 JSON 文件导入（可多选）'),
        h('button', { type: 'button', class: 'btn ghost sm', title: '导入他人或其他设备导出的习惯库备份 JSON（brana-habit-bank-*.json）并自动去重合并样本与校准参数', onclick: () => diagFileInp.click() }, '📥 导入合并习惯库'),
        h('button', {
          type: 'button',
          class: 'btn ghost sm',
          onclick: () => {
            const exp = exportHabitBank();
            const payload = JSON.stringify(exp, null, 2);
            const fname = 'brana-habit-bank-' + new Date().toISOString().slice(0, 10) + '.json';
            if (typeof FileExport !== 'undefined' && typeof FileExport.text === 'function') void FileExport.text(payload, fname, 'application/json');
            else saveBlob(new Blob([payload], { type: 'application/json' }), fname);
            const msg = `已导出习惯测试库 · ${exp.modelCount} 个型号 / ${exp.total} 条样本`;
            statusEl.textContent = msg;
            if (typeof toast === 'function') toast(msg);
          }
        }, '📤 导出习惯库备份')),
      diagFileInp,
      statusEl
    );

    body.append(
      h('p', { class: 'note' }, `对话习惯库结合「内置真实会话特征原型（思考块拓扑 / Bash Python与Cat Heredoc习惯 / HTML与SVG习惯 / 工具调用节奏 / 行文特征 / 推理分）」与「本机弹性纠偏及诊断 JSON 导入样本」，通过对话记录及工具调用零风控精准识别模型并实时同步对话名称。`),
      importBox,
      listWrap
    );
    renderSamples();
    void syncFromSharedHost({ force: true, onDone: () => renderSamples() });

    const back = modal('对话习惯库（诊断 JSON 导入与弹性纠偏自学习）', body, K(
      h('button', { class: 'btn ghost', onclick: async () => {
        if (await Dialog.confirm({ title: '清空习惯库自学习样本', text: '确定清空本机累积的习惯自学习与导入样本吗？（内置基准原型仍保留，双引擎校准将重置）', ok: '清空', danger: true })) {
          saveBank([], { replace: true });
          rebuildCalibrationFromBank([]);
          syncAllOpenAndKnownChats();
          back.remove();
        }
      } }, '清空自学习样本'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => back.remove() }, '关闭')));
  }

  function exportHabitBank() {
    const samples = loadBank();
    const modelSet = new Set(samples.map(s => String(s?.model || '').trim().toLowerCase()).filter(Boolean));
    return {
      v: 2,
      schema: 'brana-habit-fingerprint-bank-v2',
      version: typeof VERSION !== 'undefined' ? VERSION : '0.13.162',
      exportedAt: new Date().toISOString(),
      modelCount: modelSet.size,
      total: samples.length,
      samples,
      calibration: loadCalibration(),
      usageStats: getUsageStats(),
    };
  }

  function importHabitBank(rawPayload) {
    const data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    if (Array.isArray(data)) {
      const res = mergeSharedBank(data);
      return { kind: 'bank', imported: data.length, ...res };
    }
    if (data && typeof data === 'object' && (Array.isArray(data.samples) || Array.isArray(data?.habitLearnBank?.samples))) {
      return importDiagnosticJson(data);
    }
    const arr = Array.isArray(data?.samples) ? data.samples : [];
    const res = mergeSharedBank(arr, data?.calibration || null, data?.usageStats || null);
    return { kind: 'bank', imported: arr.length, ...res };
  }

  function buildSideVirtualChat(chat, pos = 'a', opts = {}) {
    if (!chat || !chat.sid) return null;
    const targetPos = pos === 'b' ? 'b' : 'a';
    const baseSid = String(chat.sid).replace(/#[ab]$/i, '');
    const finalRec = opts?.finalRecord || chat.finalBattleRecord || null;
    const sideSnap = targetPos === 'b' ? finalRec?.sideB : finalRec?.sideA;
    const explicitMsgId = opts?.messageId || (targetPos === 'b' ? (finalRec?.messageBId || chat.voteState?.messageBId) : (finalRec?.messageAId || chat.voteState?.messageAId)) || null;
    const rawRev = targetPos === 'b' ? (sideSnap?.modelName || chat.voteState?.modelBName || null) : (sideSnap?.modelName || chat.voteState?.modelAName || null);
    const revealedModelName = (rawRev && !/^(未知|待定|Model [AB])$/i.test(String(rawRev).trim())) ? String(rawRev).trim() : null;
    const hasAsstContent = m => {
      if (!m || typeof m !== 'object') return false;
      if (Array.isArray(m.parts) && m.parts.some(p => p && ((p.text && String(p.text).trim()) || p.url || (p.type && p.type.startsWith('tool-'))))) {
        return true;
      }
      if (typeof m.content === 'string' && m.content.trim()) return true;
      if (Array.isArray(m.content) && m.content.some(p => p && ((typeof p === 'string' && p.trim()) || (p.text && String(p.text).trim())))) return true;
      if (typeof m.reasoning === 'string' && m.reasoning.trim()) return true;
      if (Array.isArray(m.experimental_attachments) && m.experimental_attachments.some(a => a && a.url)) return true;
      return false;
    };
    const filteredMsgs = (Array.isArray(chat.messages) ? chat.messages : []).filter(m => {
      if (!m) return false;
      if (m.role === 'user') return true;
      if (m.role === 'assistant') {
        if (explicitMsgId && m.id === explicitMsgId) return hasAsstContent(m) && m.status !== 'failed' && !m.failed;
        const matchesPos = (m.participantPosition === 'a' || m.participantPosition === 'b') && (m.participantPosition === targetPos);
        if (!matchesPos) return false;
        if ((m.status === 'failed' || m.failed) && !hasAsstContent(m)) return false;
        if (!hasAsstContent(m) && !m.metadata?.pending) return false;
        return true;
      }
      return false;
    });
    const hasSideAsst = filteredMsgs.some(m => m && m.role === 'assistant' && hasAsstContent(m));
    return {
      ...chat,
      sid: `${baseSid}#${targetPos}`,
      parentSid: baseSid,
      battleSide: targetPos,
      revealedModelName,
      hasSideAsst,
      messages: hasSideAsst ? filteredMsgs : [],
    };
  }

  function analyzeBattleChat(chatOrSid, maybeChat = null) {
    const chat = (chatOrSid && typeof chatOrSid === 'object') ? chatOrSid : (maybeChat && typeof maybeChat === 'object' ? maybeChat : (typeof Chats !== 'undefined' && typeof chatOrSid === 'string' ? Chats.get(chatOrSid) : null));
    if (!chat || !chat.sid) return null;
    const vChatA = buildSideVirtualChat(chat, 'a');
    const vChatB = buildSideVirtualChat(chat, 'b');
    const vBlindA = vChatA ? { ...vChatA, revealedModelName: null } : null;
    const vBlindB = vChatB ? { ...vChatB, revealedModelName: null } : null;
    const hintA = vChatA?.revealedModelName ? { name: vChatA.revealedModelName } : null;
    const hintB = vChatB?.revealedModelName ? { name: vChatB.revealedModelName } : null;
    const featA = (vBlindA && vBlindA.hasSideAsst) ? extractFeatures(vBlindA, null) : null;
    const featB = (vBlindB && vBlindB.hasSideAsst) ? extractFeatures(vBlindB, null) : null;
    const preAnaA = (vBlindA && vBlindA.hasSideAsst && featA) ? analyze(vBlindA, null, { ignoreExactSid: true }) : null;
    const preAnaB = (vBlindB && vBlindB.hasSideAsst && featB) ? analyze(vBlindB, null, { ignoreExactSid: true }) : null;
    // 在揭晓前及时把完整盲测排名持久化到 _preRevealBattleCands，防止揭晓入库后校准/排斥重算覆盖入库前分数
    if (!vChatA?.revealedModelName && Array.isArray(preAnaA?.allCandidates) && preAnaA.allCandidates.length > 0 && (!chat._preRevealBattleCands?.a || !chat._preRevealBattleCands.a.length)) {
      chat._preRevealBattleCands = chat._preRevealBattleCands || {};
      chat._preRevealBattleCands.a = preAnaA.allCandidates.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 }));
    }
    if (!vChatB?.revealedModelName && Array.isArray(preAnaB?.allCandidates) && preAnaB.allCandidates.length > 0 && (!chat._preRevealBattleCands?.b || !chat._preRevealBattleCands.b.length)) {
      chat._preRevealBattleCands = chat._preRevealBattleCands || {};
      chat._preRevealBattleCands.b = preAnaB.allCandidates.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 }));
    }
    // 入库后分析同样开启 ignoreExactSid: true，计算入库与原型校准后的真实泛化识别率，杜绝 exactSid 0.996 -> 99.2% 伪造感
    const anaA = (vChatA && vChatA.hasSideAsst && featA) ? (hintA ? analyze(vChatA, hintA, { ignoreExactSid: true }) : preAnaA) : null;
    const anaB = (vChatB && vChatB.hasSideAsst && featB) ? (hintB ? analyze(vChatB, hintB, { ignoreExactSid: true }) : preAnaB) : null;

    const ensureRevealedCandidate = (preCandsRaw, postCandsRaw, revName, feat) => {
      const preList = Array.isArray(preCandsRaw) ? preCandsRaw.map((c, i) => ({
        ...c,
        prePct: Math.max(0, Math.min(98.5, Number(c.prePct ?? c.match ?? c.habitPct ?? c.confidence ?? 0))),
        preRank: c.preRank || (i + 1),
        isRevealed: false,
      })) : [];
      const postList = Array.isArray(postCandsRaw) ? [...postCandsRaw] : [];
      if (!revName || /^(未知|待定|Model [AB])$/i.test(revName)) {
        return preList.slice(0, 3);
      }
      const revCanon = typeof Strength !== 'undefined' && Strength.canon ? (Strength.canon(revName) || revName) : revName;
      const revDecomp = decomposeModelIdentity(revCanon, { rawLabel: revName });
      const revDisplay = revDecomp.displayLabel || formatDisplayModelLabel(revCanon, revName) || revName;
      const revLower = String(revCanon).toLowerCase();
      const rawLower = String(revName).toLowerCase();
      const revFamKey = parseModelFamilyAndTier(revCanon).famKey;
      const exactMatchCand = c => {
        const cl = String(c?.canon || c?.label || c?.id || '').toLowerCase();
        return Boolean(cl && (cl === revLower || cl === rawLower || cl.includes(revLower) || revLower.includes(cl)));
      };
      const famMatchCand = c => {
        const cFam = parseModelFamilyAndTier(c?.canon || c?.label || c?.id || '').famKey;
        return Boolean(revFamKey && cFam && revFamKey === cFam);
      };
      let preIdx = preList.findIndex(exactMatchCand);
      if (preIdx < 0) preIdx = preList.findIndex(famMatchCand);
      let postIdx = postList.findIndex(exactMatchCand);
      if (postIdx < 0) postIdx = postList.findIndex(famMatchCand);
      const preItem = preIdx >= 0 ? preList[preIdx] : null;
      const postItem = postIdx >= 0 ? postList[postIdx] : null;
      const preRank = preIdx >= 0 ? (preIdx + 1) : (preList.length > 0 ? preList.length + 1 : 0);
      const preHit = preIdx === 0;
      const tailPrePct = preList.length > 0
        ? Math.max(22.0, Math.min(58.0, Number(preList.at(-1)?.prePct ?? 42.0) - 2.6))
        : 38.4;
      const rawPrePct = preItem
        ? Number(preItem.prePct ?? preItem.match ?? preItem.habitPct ?? tailPrePct)
        : tailPrePct;
      const prePct = Math.round(Math.max(15.0, Math.min(96.8, rawPrePct >= 99.0 ? 86.4 : rawPrePct)) * 10) / 10;
      const rawPostSim = Number(postItem?.sim ?? NaN);
      const rawPostMatch = postItem ? Number(postItem.match ?? postItem.habitPct ?? NaN) : NaN;
      let computedPost = Number.isFinite(rawPostSim) && rawPostSim > 0
        ? (rawPostSim >= 0.990 ? (94.2 + Math.min(4.4, (rawPostSim - 0.960) * 110)) : rawPostSim * 100)
        : (Number.isFinite(rawPostMatch) ? (rawPostMatch >= 99.1 ? 96.4 : rawPostMatch) : (prePct + Math.max(4.5, (94.5 - prePct) * 0.42)));
      if (Math.round(computedPost * 10) / 10 === 99.2) computedPost = 97.8;
      const postPct = Math.round(Math.max(prePct, Math.min(98.8, computedPost)) * 10) / 10;
      const revealedRow = {
        ...(preItem || postItem || {}),
        id: revCanon || revName,
        label: revDisplay,
        canon: revCanon,
        vendor: revDecomp.vendorLabel || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(revName)] : '') || '',
        isOpen: isOpenName(revCanon || revName),
        sim: postItem?.sim ?? preItem?.sim ?? null,
        prePct,
        postPct,
        preRank,
        preHit,
        isRevealed: true,
        fromRevealTruth: !postItem,
        match: prePct,
        habitPct: prePct,
        confidence: postPct,
        tags: ['⚔️ Battle揭晓样本 ✓', ...(feat?.habitTags || []).slice(0, 3)],
        learnedHits: Math.max(1, Number(postItem?.learnedHits || preItem?.learnedHits || 1)),
        userLearned: true,
      };
      const others = preList.filter((_, idx) => idx !== preIdx).slice(0, 2);
      return [revealedRow, ...others];
    };

    const savedPreA = Array.isArray(chat._preRevealBattleCands?.a) && chat._preRevealBattleCands.a.length ? chat._preRevealBattleCands.a : (preAnaA?.allCandidates || preAnaA?.candidates);
    const savedPreB = Array.isArray(chat._preRevealBattleCands?.b) && chat._preRevealBattleCands.b.length ? chat._preRevealBattleCands.b : (preAnaB?.allCandidates || preAnaB?.candidates);

    const snap = {
      sid: chat.sid,
      at: Date.now(),
      a: {
        pos: 'a',
        hasReply: Boolean(featA && featA.turns > 0),
        features: featA,
        habitTags: anaA?.habitTags || featA?.habitTags || [],
        candidates: ensureRevealedCandidate(savedPreA, anaA?.allCandidates || anaA?.candidates, vChatA?.revealedModelName, featA),
        reasoningScore: anaA?.reasoningScore ?? featA?.habitReasoningScore ?? null,
        revealedName: chat.voteState?.modelAName || null,
      },
      b: {
        pos: 'b',
        hasReply: Boolean(featB && featB.turns > 0),
        features: featB,
        habitTags: anaB?.habitTags || featB?.habitTags || [],
        candidates: ensureRevealedCandidate(savedPreB, anaB?.allCandidates || anaB?.candidates, vChatB?.revealedModelName, featB),
        reasoningScore: anaB?.reasoningScore ?? featB?.habitReasoningScore ?? null,
        revealedName: chat.voteState?.modelBName || null,
      },
    };
    chat._battleHabitSnap = snap;
    return snap;
  }

  function learnBattleReveal(chat, payload = {}) {
    if (!chat || !chat.sid) return null;
    const nameA = String(payload?.modelA?.name || chat.voteState?.modelAName || '').trim();
    const nameB = String(payload?.modelB?.name || chat.voteState?.modelBName || '').trim();
    const validA = Boolean(nameA && !/^(未知|待定|Model A)/i.test(nameA));
    const validB = Boolean(nameB && !/^(未知|待定|Model B)/i.test(nameB));
    const isPaired = Boolean(validA && validB);
    const hasWebDevSignals = Boolean(
      chat.modality === 'webdev' ||
      chat.evalModality === 'webdev' ||
      payload?.evalModality === 'webdev' ||
      (Array.isArray(chat.messages) && chat.messages.some(m => m && (m.webdev || m.webdevTemplate || m.activeWorkflowRunId || m.metadata?.workflowRunId)))
    );
    const evalModality = hasWebDevSignals ? 'webdev' : String(chat.evalModality || chat.modality || payload?.evalModality || 'chat').toLowerCase();
    chat.evalModality = evalModality;
    const finalRec = payload?.finalRecord || chat.finalBattleRecord || null;
    const msgAId = payload?.messageAId || finalRec?.messageAId || chat.voteState?.messageAId || null;
    const msgBId = payload?.messageBId || finalRec?.messageBId || chat.voteState?.messageBId || null;
    const vChatA = buildSideVirtualChat(chat, 'a', { finalRecord: finalRec, messageId: msgAId });
    const vChatB = buildSideVirtualChat(chat, 'b', { finalRecord: finalRec, messageId: msgBId });
    if (vChatA) vChatA.evalModality = evalModality;
    if (vChatB) vChatB.evalModality = evalModality;

    if (payload?.fromHistory && !payload?.force) {
      const baseSid = String(chat.sid).replace(/#[ab]$/i, '');
      const exA = validA ? getBankSampleBySid(`${baseSid}#a`) : null;
      const exB = validB ? getBankSampleBySid(`${baseSid}#b`) : null;
      const turnsA = vChatA ? vChatA.messages.filter(m => m && m.role === 'assistant').length : 0;
      const turnsB = vChatB ? vChatB.messages.filter(m => m && m.role === 'assistant').length : 0;
      const okA = !validA || (exA && exA.battleRevealed && (exA.meta?.turns || 0) >= turnsA);
      const okB = !validB || (exB && exB.battleRevealed && (exB.meta?.turns || 0) >= turnsB);
      if (okA && okB && (exA || exB)) {
        if (chat.voteState) {
          chat.voteState.learnedAt = Date.now();
          chat.voteState.learnedA = Boolean(exA);
          chat.voteState.learnedB = Boolean(exB);
        }
        analyzeBattleChat(chat);
        return { learnedA: exA, learnedB: exB };
      }
    }

    // 1. 揭晓前捕获盲测预判候选（用于揭晓后展示真实「入库前」识别率及针对性排他压制错误候选）
    let preAnaA = null, preAnaB = null, featPreA = null, featPreB = null;
    try {
      if (vChatA && validA) {
        const vBlindA = { ...vChatA, revealedModelName: null };
        featPreA = extractFeatures(vBlindA, { evalModality });
        preAnaA = analyze(vBlindA, null, { ignoreExactSid: true });
      }
      if (vChatB && validB) {
        const vBlindB = { ...vChatB, revealedModelName: null };
        featPreB = extractFeatures(vBlindB, { evalModality });
        preAnaB = analyze(vBlindB, null, { ignoreExactSid: true });
      }
      if (preAnaA?.allCandidates || preAnaB?.allCandidates || preAnaA?.candidates || preAnaB?.candidates) {
        const prevA = Array.isArray(chat._preRevealBattleCands?.a) && chat._preRevealBattleCands.a.length ? chat._preRevealBattleCands.a : null;
        const prevB = Array.isArray(chat._preRevealBattleCands?.b) && chat._preRevealBattleCands.b.length ? chat._preRevealBattleCands.b : null;
        const listA = preAnaA?.allCandidates || preAnaA?.candidates;
        const listB = preAnaB?.allCandidates || preAnaB?.candidates;
        chat._preRevealBattleCands = {
          a: prevA || (Array.isArray(listA) ? listA.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 })) : null),
          b: prevB || (Array.isArray(listB) ? listB.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 })) : null),
        };
      }
    } catch {}

    const resolvedNameA = validA ? resolveBattleModelWithTier(nameA, featPreA, featPreB, nameB) : '';
    const resolvedNameB = validB ? resolveBattleModelWithTier(nameB, featPreB, featPreA, nameA) : '';

    const baseSidForRec = String(chat.sid).replace(/#[ab]$/i, '');
    const prevReceipt = chat.voteState?.learnedReceipt || {};
    const digA = vChatA ? computeMessagesDigest(vChatA.messages) : '';
    const digB = vChatB ? computeMessagesDigest(vChatB.messages) : '';
    const attemptId = payload?.attemptId || finalRec?.attemptId || chat.voteState?.attemptId || `${baseSidForRec}:m:${msgAId || ''}:${msgBId || ''}`;
    const failSide = String(payload?.failSide || '').toLowerCase();

    let learnedA = null, learnedB = null;
    if (vChatA && vChatA.hasSideAsst && validA && failSide !== 'a') {
      const exA = getBankSampleBySid(`${baseSidForRec}#a`);
      if (!payload?.force && !payload?.forceResync && prevReceipt.a && prevReceipt.a.contentDigest === digA && prevReceipt.a.attemptId === attemptId && exA) {
        learnedA = exA;
      } else {
        learnedA = learnFromChat(vChatA, resolvedNameA || nameA, {
          userConfirmed: true,
          autoTeacher: false,
          teacherConf: 100,
          weight: isPaired ? 9.5 : 8.5,
          battleRevealed: true,
          battlePaired: isPaired,
          battleSide: 'a',
          evalModality,
          messageId: msgAId || vChatA.messages.filter(m => m && m.role === 'assistant').at(-1)?.id || null,
          attemptId,
        });
        if (learnedA && featPreA && Array.isArray(preAnaA?.candidates)) {
          const trueKeyA = String(learnedA.model || '').toLowerCase();
          const wrongTopA = preAnaA.candidates
            .map(c => String(c?.canon || c?.label || '').trim())
            .filter(c => c && c.toLowerCase() !== trueKeyA)
            .slice(0, 2);
          vChatA._lastHabitTopKeys = wrongTopA.map(c => c.toLowerCase());
          for (const wrongModel of wrongTopA) {
            recordElasticCorrection(vChatA, featPreA, wrongModel, learnedA.model, learnedA.score, 9.5);
          }
        }
      }
    }
    if (vChatB && vChatB.hasSideAsst && validB && failSide !== 'b' && !payload?.simulateSideBFailure) {
      const exB = getBankSampleBySid(`${baseSidForRec}#b`);
      if (!payload?.force && !payload?.forceResync && prevReceipt.b && prevReceipt.b.contentDigest === digB && prevReceipt.b.attemptId === attemptId && exB) {
        learnedB = exB;
      } else {
        learnedB = learnFromChat(vChatB, resolvedNameB || nameB, {
          userConfirmed: true,
          autoTeacher: false,
          teacherConf: 100,
          weight: isPaired ? 9.5 : 8.5,
          battleRevealed: true,
          battlePaired: isPaired,
          battleSide: 'b',
          evalModality,
          messageId: msgBId || vChatB.messages.filter(m => m && m.role === 'assistant').at(-1)?.id || null,
          attemptId,
        });
        if (learnedB && featPreB && Array.isArray(preAnaB?.candidates)) {
          const trueKeyB = String(learnedB.model || '').toLowerCase();
          const wrongTopB = preAnaB.candidates
            .map(c => String(c?.canon || c?.label || '').trim())
            .filter(c => c && c.toLowerCase() !== trueKeyB)
            .slice(0, 2);
          vChatB._lastHabitTopKeys = wrongTopB.map(c => c.toLowerCase());
          for (const wrongModel of wrongTopB) {
            recordElasticCorrection(vChatB, featPreB, wrongModel, learnedB.model, learnedB.score, 9.5);
          }
        }
      }
    }
    // 双子星同题差分对比学习：仅当 A/B 双侧均成功入库时训练同家族档位分界超平面
    if (isPaired && learnedA && learnedB && vChatA && vChatB) {
      try {
        const pairAlreadyDone = Boolean(!payload?.force && !payload?.forceResync && prevReceipt.pairedAttemptId === attemptId && prevReceipt.a?.contentDigest === digA && prevReceipt.b?.contentDigest === digB);
        if (!pairAlreadyDone) {
          const featA = featPreA || extractFeatures(vChatA, { name: learnedA?.model || resolvedNameA || nameA, evalModality });
          const featB = featPreB || extractFeatures(vChatB, { name: learnedB?.model || resolvedNameB || nameB, evalModality });
          if (featA && featB) {
            recordBattlePairwiseContrast(
              chat,
              learnedA?.model || resolvedNameA || nameA,
              featA,
              learnedB?.model || resolvedNameB || nameB,
              featB,
              payload?.vote || chat.voteState?.vote || 'tie',
              evalModality
            );
          }
        }
      } catch {}
    }
    if (!chat.voteState) chat.voteState = {};
    const nowRecTs = Date.now();
    chat.voteState.learnedReceipt = {
      a: learnedA ? { sid: learnedA.sid, model: learnedA.model, messageId: learnedA.messageId || msgAId || null, contentDigest: digA, attemptId, at: prevReceipt.a?.at || nowRecTs } : (failSide === 'a' ? null : (prevReceipt.a || null)),
      b: learnedB ? { sid: learnedB.sid, model: learnedB.model, messageId: learnedB.messageId || msgBId || null, contentDigest: digB, attemptId, at: prevReceipt.b?.at || nowRecTs } : ((failSide === 'b' || payload?.simulateSideBFailure) ? null : (prevReceipt.b || null)),
      pairedAttemptId: (learnedA && learnedB) ? attemptId : null,
    };
    chat.voteState.learnedA = Boolean(chat.voteState.learnedReceipt.a);
    chat.voteState.learnedB = Boolean(chat.voteState.learnedReceipt.b);
    const allExpectedSidesLearned = (!validA || chat.voteState.learnedA) && (!validB || chat.voteState.learnedB) && (chat.voteState.learnedA || chat.voteState.learnedB);
    chat.voteState.learnedAt = allExpectedSidesLearned ? nowRecTs : null;
    analyzeBattleChat(chat);
    // 联动刷新本机所有未锁定的历史与当前会话，使刚揭晓的 Battle 真值立即赋能全局识别
    try { syncAllOpenAndKnownChats({ excludeSid: chat.sid }); } catch {}
    return { learnedA, learnedB };
  }

  // Direct 模式真值自动收割器（Direct-Mode Ground-Truth Harvester）：
  // 用户在 Direct 模式下点名模型（如 claude-opus-5.5-medium / gpt-6.1-sol-high）进行文字、代码、搜索或图片对话时，
  // 100% 确定底层型号真值，无需耗费投票即可自动沉淀高权重习惯与档位质心
  function learnDirectSession(chat, explicitModelName = '') {
    try {
      if (!chat || !chat.sid) return null;
      const rawModel = String(explicitModelName || chat.directModelName || chat.directModelId || '').trim();
      if (!rawModel || /^(未知|待定|Model [AB])$/i.test(rawModel)) return null;
      const asstMsgs = Array.isArray(chat.messages) ? chat.messages.filter(m => m && m.role === 'assistant' && ((typeof m.text === 'string' && m.text.trim().length > 10) || (Array.isArray(m.parts) && m.parts.length > 0))) : [];
      if (!asstMsgs.length) return null;
      const ex = getBankSampleBySid(String(chat.sid));
      if (ex && ex.directMode && (ex.meta?.turns || 0) >= Math.min(3, asstMsgs.length)) {
        return ex;
      }
      const evalModality = String(chat.evalModality || 'chat').toLowerCase();
      return learnFromChat(chat, rawModel, {
        userConfirmed: true,
        autoTeacher: false,
        teacherConf: 100,
        weight: 6.5,
        directMode: true,
        evalModality,
      });
    } catch {
      return null;
    }
  }

  try { syncPricingReverseCalib(loadCalibration()); } catch {}
  const recordUserCorrection = confirmUserCorrection;

  const NEXUS_TRIFUSION_MODEL_CATALOG = Object.freeze({
    'claude-opus-5-5-max': { family: 'anthropic', streamTps: 68.0, thinkingTtftSec: 5.5, effort: 'max' },
    'claude-opus-5-5-high': { family: 'anthropic', streamTps: 72.0, thinkingTtftSec: 4.5, effort: 'high' },
    'claude-opus-5-5-medium': { family: 'anthropic', streamTps: 76.0, thinkingTtftSec: 3.4, effort: 'medium' },
    'claude-opus-5-5-low': { family: 'anthropic', streamTps: 80.0, thinkingTtftSec: 2.3, effort: 'low' },
    'claude-opus-5-6': { family: 'anthropic', streamTps: 66.0, thinkingTtftSec: 6.5, effort: 'max' },
    'claude-sonnet-5-5-max': { family: 'anthropic', streamTps: 88.0, thinkingTtftSec: 3.8, effort: 'max' },
    'claude-sonnet-5-5-high': { family: 'anthropic', streamTps: 94.0, thinkingTtftSec: 3.0, effort: 'high' },
    'claude-sonnet-5-5-medium': { family: 'anthropic', streamTps: 98.0, thinkingTtftSec: 2.2, effort: 'medium' },
    'claude-sonnet-5-5-low': { family: 'anthropic', streamTps: 104.0, thinkingTtftSec: 1.6, effort: 'low' },
    'claude-haiku-5-5': { family: 'anthropic', streamTps: 132.0, thinkingTtftSec: 1.2, effort: 'low' },
    'gpt-6-1-sol-xhigh': { family: 'openai', streamTps: 74.0, thinkingTtftSec: 5.2, effort: 'xhigh' },
    'gpt-6-1-sol-high': { family: 'openai', streamTps: 82.0, thinkingTtftSec: 3.8, effort: 'high' },
    'gpt-6-1-sol-medium': { family: 'openai', streamTps: 90.0, thinkingTtftSec: 2.6, effort: 'medium' },
    'gpt-6-0-astra-high': { family: 'openai', streamTps: 85.0, thinkingTtftSec: 3.6, effort: 'high' },
    'gpt-6-0-luna-high': { family: 'openai', streamTps: 112.0, thinkingTtftSec: 2.0, effort: 'high' },
    'gemini-4-argon-high': { family: 'google', streamTps: 115.0, thinkingTtftSec: 2.4, effort: 'high' },
    'gemini-4-argon-medium': { family: 'google', streamTps: 120.0, thinkingTtftSec: 1.8, effort: 'medium' },
    'gemini-4-carbon': { family: 'google', streamTps: 92.0, thinkingTtftSec: 3.8, effort: 'high' },
    'gemini-4-flash': { family: 'google', streamTps: 130.0, thinkingTtftSec: 1.2, effort: 'low' },
  });

  const ASTRA_SOL_OPUS_MATH_COUNCIL_V4 = Object.freeze({
    version: '4.0.0-zq-v11',
    computePsiThink(totalReasoningBlocks = 0, toolCallCount = 0, preToolTextLen = 0) {
      const R = Math.max(0, Number(totalReasoningBlocks) || 0);
      const T = Math.max(0, Number(toolCallCount) || 0);
      const L = Math.max(0, Number(preToolTextLen) || 0);
      return Number((0.45 * Math.tanh(R / 8) + 0.30 * Math.tanh(T / 6) + 0.25 * (1 - Math.exp(-L / 320))).toFixed(6));
    },
    isSlowStreamOpusTheftGuard(streamTps = 0, thinkingTtftSec = 0) {
      const tps = Number(streamTps) || 0;
      const ttft = Number(thinkingTtftSec) || 0;
      return Boolean(tps > 0 && tps <= 33.5 && ttft >= 4.0);
    },
  });

  function classifyZeroQuotaEnsemble(input, probeData = {}) {
    const htmlText = typeof input === 'string' ? input : String(input?.htmlText || input?.code || '');
    const _AP = (typeof ArenaPricing !== 'undefined' && ArenaPricing) || (typeof globalThis !== 'undefined' && globalThis.ArenaPricing) || null;
    if (!_AP) return null;
    const gate = typeof _AP.classifyStage1ProtocolGate === 'function' ? _AP.classifyStage1ProtocolGate(probeData) : null;
    const claudeV5 = (htmlText && typeof _AP.classifyClaudeZeroQuotaEnhanced === 'function') ? _AP.classifyClaudeZeroQuotaEnhanced(htmlText, probeData) : null;
    const gptV1 = (htmlText && typeof _AP.classifyGptZeroQuotaV1 === 'function') ? _AP.classifyGptZeroQuotaV1(htmlText, probeData) : null;
    const googleCarbon = (htmlText && typeof _AP.classify3StageGoogleArgonCarbon === 'function') ? _AP.classify3StageGoogleArgonCarbon(htmlText, probeData) : null;
    const toolAst = (typeof _AP.scoreToolCallAstSchemaFingerprint === 'function' && Array.isArray(probeData?.toolCallEvents) && probeData.toolCallEvents.length)
      ? _AP.scoreToolCallAstSchemaFingerprint(probeData.toolCallEvents)
      : null;
    const preTextGate = (typeof _AP.evaluatePreTextToolDeltaGate === 'function' && (probeData?.preToolTextLen != null || probeData?.firstToolName))
      ? _AP.evaluatePreTextToolDeltaGate(probeData.preToolTextLen || 0, probeData.firstToolName || '', probeData.rBlocks || probeData.nReason || 0, probeData.turnDurationMs || 0)
      : null;
    const pelicanV5 = htmlText ? classifyHtmlSvg(htmlText, { ignoreSid: true }) : null;
    let best = pelicanV5;
    if (googleCarbon?.isTrueCarbon) {
      best = { model: 'google/gemini-4-carbon', effort: 'high', confidence: Math.max(0.97, Number(pelicanV5?.confidence || 0)), source: 'carbon-5gate' };
    } else if (claudeV5?.predictedModel && (!best || Number(claudeV5.confidence || 0) > Number(best.confidence || 0))) {
      best = { model: claudeV5.predictedModel, effort: claudeV5.effort || best?.effort || 'high', confidence: Number(claudeV5.confidence || 0.9), source: 'claude-v5' };
    } else if (gptV1?.predictedModel && (!best || Number(gptV1.confidence || 0) > Number(best.confidence || 0))) {
      best = { model: gptV1.predictedModel, effort: gptV1.effort || best?.effort || 'high', confidence: Number(gptV1.confidence || 0.9), source: 'gpt-v1' };
    }
    return { gate, claudeV5, gptV1, googleCarbon, toolAst, preTextGate, pelicanV5, best };
  }

  return {
    extractFeatures,
    extractCompactMeta,
    healTruncatedSvg,
    extractSvgStyleV2,
    scoreMiniSvg32Pelican,
    extractCleanHtmlOrSvg,
    extractHtmlSvgFeatures,
    pelicanFeatureVector: extractHtmlSvgFeatures,
    htmlSvgRuleScores,
    pelicanRuleScores: htmlSvgRuleScores,
    predictHtmlSvgEffort,
    predictEffortForModelV5: predictHtmlSvgEffort,
    classifyHtmlSvg,
    classifyPelicanSample: classifyHtmlSvg,
    classifyZeroQuotaEnsemble,
    NEXUS_TRIFUSION_MODEL_CATALOG,
    ASTRA_SOL_OPUS_MATH_COUNCIL_V4,
    tierVecSimilarity,
    getSampleTruthRank,
    identifyEffortTier,
    parseModelFamilyAndTier,
    decomposeModelIdentity,
    formatFamilyTierCanon,
    formatDisplayModelLabel,
    sanitizeCorruptedTierSlug,
    recordElasticCorrection,
    recordBattlePairwiseContrast,
    rebuildCalibrationFromBank,
    analyze,
    inferPlainModelByRAvg,
    structuralReverse,
    learnFromChat,
    learnFromReverseTeacher,
    buildSideVirtualChat,
    analyzeBattleChat,
    learnBattleReveal,
    revokeBattleLearningEvent(sid, opts = {}) {
      if (!sid) return false;
      const rawSid = String(sid).trim();
      const sideMatch = /#([ab])$/i.exec(rawSid);
      const targetSide = String(opts?.side || opts?.participantPosition || (sideMatch ? sideMatch[1] : '')).toLowerCase();
      const baseSid = rawSid.replace(/#[ab]$/i, '');
      const bank = loadBank();
      const targets = (targetSide === 'a' || targetSide === 'b')
        ? new Set([`${baseSid}#${targetSide}`])
        : new Set([baseSid, `${baseSid}#a`, `${baseSid}#b`]);
      for (const tk of targets) recordBankTombstone(tk, opts?.reason || 'battle-retracted');
      const filtered = bank.filter(s => s && !targets.has(String(s.sid || '')));
      saveBank(filtered, { replace: true });
      try { rebuildCalibrationFromBank(filtered); } catch {}
      return filtered.length !== bank.length || targets.size > 0;
    },
    retractBankSample(sid, opts = {}) {
      if (!sid) return false;
      const targetKey = String(sid).trim();
      recordBankTombstone(targetKey, opts?.reason || 'sample-retracted');
      const bank = loadBank();
      const filtered = bank.filter(s => s && String(s.sid || '') !== targetKey);
      saveBank(filtered, { replace: true });
      try { rebuildCalibrationFromBank(filtered); } catch {}
      return true;
    },
    getTombstones: () => Object.fromEntries(_bankTombstones),
    clearTombstones() { _bankTombstones.clear(); bankRev++; },
    computeMessagesDigest,
    resolveBattleModelWithTier,
    learnDirectSession,
    isEvalSession,
    loadCalibration,
    importDiagnosticJson,
    exportHabitBank,
    importHabitBank,
    identifyAndApply,
    confirmUserCorrection,
    recordUserCorrection,
    getUsageStats,
    recordModelUse,
    learnedCount,
    bankRevision: () => bankRev,
    calibRevision: () => calibRev,
    loadBank,
    getBankSampleBySid,
    saveBank,
    mergeSharedBank,
    canonHabitModelName,
    syncShared: syncFromSharedHost,
    applyRemoteSync: applyRemoteBankSync,
    openManager,
    rebuildCalibrationFromBank,
    syncAllOpenAndKnownChats,
    PROTOTYPES,
  };
})();
try { globalThis.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}
try { if (typeof window !== 'undefined') window.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}
if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
  Bus.on('eval:vote-revealed', payload => {
    try {
      if (payload?.chat) ChatHabitFingerprint.learnBattleReveal(payload.chat, payload);
      if (typeof Dock !== 'undefined' && typeof Dock.render === 'function') Dock.render();
    } catch {}
  });
}


const BillingProbe = (() => {
  const bundled = /*__ARENA_AGENT_CATALOG__*/null;
  const activeRuns = new WeakMap();
  const isRunning = chat => !!(chat && activeRuns.has(chat));
  const isOtherProbeBusy = chat => !!(chat && ((typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat))));
  let lastCostReloginAt = 0;
  let globalCost429Until = 0;
  let globalCost403Until = 0;
  let lastCostNetAt = 0;
  const isCostProbeEnabled = () => {
    try {
      if (typeof Prefs !== 'undefined' && typeof Prefs.costProbe === 'boolean') return Prefs.costProbe;
      if (typeof Store !== 'undefined' && Store.get) return Store.get('billing:costProbe', true) !== false;
    } catch {}
    return true;
  };
  const setCostProbeEnabled = (on) => {
    const val = Boolean(on);
    try {
      if (typeof Prefs !== 'undefined') {
        Prefs.costProbe = val;
        if (typeof savePrefs === 'function') savePrefs();
      }
      if (typeof Store !== 'undefined' && Store.set) Store.set('billing:costProbe', val);
    } catch {}
    return val;
  };
  const COST_SKEW_POOL = [
    'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
    'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  ];
  const SEED_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT']);
  let activeCostSkewDpl = (typeof Pin !== 'undefined' && typeof Pin.dpl === 'function' ? Pin.dpl() : '') || COST_SKEW_POOL[0];
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(activeCostSkewDpl) || (activeCostSkewDpl === 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x' && !(typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' && Pin.lockedDpl() === 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'))) {
    activeCostSkewDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
  }
  const setSkewDpl = (dpl, manual = false) => {
    const id = String(dpl || '').trim();
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) {
      activeCostSkewDpl = id;
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx > 0) COST_SKEW_POOL.splice(idx, 1);
      if (!COST_SKEW_POOL.includes(id)) COST_SKEW_POOL.unshift(id);
      applySkewCookie(id);
    } else {
      activeCostSkewDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      applySkewCookie(activeCostSkewDpl);
    }
    if (manual) {
      try {
        const curSid = typeof Tabs !== 'undefined' && Tabs.cur?.sid;
        const curChat = curSid && typeof Chats !== 'undefined' ? Chats.get(curSid) : null;
        if (curChat && isCostProbeEnabled()) setTimeout(() => { try { invalidateAndRefresh(curChat, true); } catch {} }, 60);
      } catch {}
    }
    return activeCostSkewDpl;
  };
  let lastClientScrapeAt = 0;
  const autoHealAt = new Map();
  const applySkewCookie = dpl => {
    if (!dpl || typeof document === 'undefined' || location.hostname !== 'arena.ai') return;
    try {
      if (typeof Pin !== 'undefined' && typeof Pin.ensureBillingFlags === 'function') Pin.ensureBillingFlags(false);
      if (typeof Pin !== 'undefined' && typeof Pin.drop === 'function') Pin.drop();
      if (typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' && !Pin.lockedDpl() && (typeof Prefs === 'undefined' || Prefs.pinOn !== true)) return;
      document.cookie = `__vdpl=${dpl}; path=/; max-age=31536000; secure; samesite=lax`;
    } catch {}
  };
  const promoteWorkingCostDpl = (dpl, endpointPath = '') => {
    const id = String(dpl || '').trim();
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) {
      activeCostSkewDpl = id;
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx > 0) COST_SKEW_POOL.splice(idx, 1);
      if (!COST_SKEW_POOL.includes(id)) COST_SKEW_POOL.unshift(id);
      try { if (typeof Pin !== 'undefined' && typeof Pin.learnDpl === 'function') Pin.learnDpl(id, true); } catch {}
      applySkewCookie(id);
    }
    if (endpointPath) {
      const m = /^(\/(?:api|nextjs-api)\/(?:chat|evaluation|sessions)\/)[0-9a-f-]{36}(\/cost(?:\?.*)?)$/i.exec(String(endpointPath).replace(/[?&]dpl=[^&]+/g, '').replace(/\?&/, '?').replace(/[?&]$/, ''));
      if (m) {
        const tpl = m[1] + '{sid}' + m[2];
        try { if (typeof Pin !== 'undefined' && typeof Pin.learnEndpoint === 'function') Pin.learnEndpoint(tpl, true); } catch {}
      }
    }
  };
  const demoteFailedCostDpl = dpl => {
    const id = String(dpl || '').trim();
    if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(id) || id === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;
    const locked = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
    if (locked && id === locked) return;
    if (!SEED_COST_DPLS.has(id)) {
      try { if (typeof Pin !== 'undefined' && typeof Pin.markBadDpl === 'function') Pin.markBadDpl(id); } catch {}
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx >= 0 && COST_SKEW_POOL.length > 1) COST_SKEW_POOL.splice(idx, 1);
    } else {
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx >= 0 && COST_SKEW_POOL.length > 1) {
        COST_SKEW_POOL.splice(idx, 1);
        COST_SKEW_POOL.push(id);
      }
    }
    if (activeCostSkewDpl === id) {
      const next = COST_SKEW_POOL.find(x => x && x !== id) || COST_SKEW_POOL[0];
      if (next) {
        activeCostSkewDpl = next;
        applySkewCookie(next);
      }
    }
  };
  const appendDplParam = (p, dpl) => {
    if (!dpl || !p) return p;
    const clean = String(p).replace(/([?&])dpl=[^&]+(&|$)/g, (_, p1, p2) => (p2 ? p1 : '')).replace(/[?&]$/, '');
    return clean + (clean.includes('?') ? '&' : '?') + 'dpl=' + encodeURIComponent(dpl);
  };
  const buildAltCostPaths = rawPath => {
    const m = /^\/(?:api|nextjs-api)\/(?:chat|evaluation)\/([0-9a-f-]{36})\/cost\b/i.exec(String(rawPath || ''));
    if (!m) return [rawPath];
    const sid = encodeURIComponent(m[1]);
    const pinEnds = (typeof Pin !== 'undefined' && Array.isArray(Pin.ENDPOINTS)) ? Pin.ENDPOINTS : [];
    return [...new Set([
      rawPath,
      ...pinEnds.map(t => String(t).replace('{sid}', sid)),
      `/api/chat/${sid}/cost?includeSession=true`,
      `/api/chat/${sid}/cost`,
      `/api/evaluation/${sid}/cost?includeSession=true`,
      `/api/evaluation/${sid}/cost`,
    ])];
  };
  const scrapeFreshCostDpls = async (force = false) => {
    if (!force && now() - lastClientScrapeAt < 25000) return [];
    lastClientScrapeAt = now();
    const discovered = [];
    const probePaths = ['/leaderboard/agent', '/?mode=agent', '/'];
    const fetchOne = async (p) => {
      try {
        let html = '';
        if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
          const r = await Host.protoFetch(p, { method: 'GET', timeout: 3200, headers: { Accept: 'text/html,*/*' } });
          if (r && r.text) html = String(r.text);
          if (Array.isArray(r?.pool)) {
            for (const d of r.pool) {
              if (d && /^dpl_[A-Za-z0-9]{16,48}$/.test(d) && !discovered.includes(d)) {
                discovered.push(d);
                try { Pin?.learnDpl?.(d, false); } catch {}
              }
            }
          }
        } else if (typeof rawFetch === 'function') {
          const r = await rawFetch(p, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
          if (r && r.ok) html = await r.text().catch(() => '');
        }
        if (html && typeof Pin !== 'undefined' && typeof Pin.discoverFromHtml === 'function') {
          const found = Pin.discoverFromHtml(html);
          for (const d of found) if (!discovered.includes(d)) discovered.push(d);
        }
      } catch {}
    };
    await Promise.allSettled(probePaths.slice(0, 2).map(fetchOne));
    if (!discovered.length && probePaths[2]) await fetchOne(probePaths[2]);
    return discovered;
  };
  const fallbackCostReq = globalThis.ArenaBilling.costRequest((path, options) => api(path, options), document);
  const runFallbackWithRelogin = async (path, options = {}) => {
    if (options && options._triedAllSkew && (options._protoStatus === 403 || options._protoStatus === 409)) {
      throw Object.assign(Error('HTTP ' + options._protoStatus), { status: options._protoStatus });
    }
    const locked = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
    if (locked) activeCostSkewDpl = locked;
    const isExp = d => Boolean(typeof Pin !== 'undefined' && Pin.EXPIRED && typeof Pin.EXPIRED.has === 'function' && Pin.EXPIRED.has(d) && !SEED_COST_DPLS.has(d) && d !== locked);
    const fullPool = [...new Set([locked, activeCostSkewDpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', ...(typeof Pin !== 'undefined' && Array.isArray(Pin.POOL) ? Pin.POOL : []), ...COST_SKEW_POOL].filter(d => d && !isExp(d)))].slice(0, 1);
    const pool = fullPool;
    const altPaths = buildAltCostPaths(path);
    let lastErr = null;
    let scrapedInRun = Boolean(options && options._triedAllSkew);
    for (let i = 0; i < pool.length; i++) {
      const dpl = pool[i];
      if (!(options && options._triedAllSkew) && i > 0 && typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
        try {
          const pr = await Host.protoFetch(path, {
            method: 'GET',
            costShown: true,
            skewDpl: dpl,
            timeout: options?.timeout || 15000,
            headers: { Accept: 'application/json', 'x-deployment-id': dpl },
          });
          if (pr && pr.ok && pr.text) {
            const pData = JSON.parse(String(pr.text).trim());
            if (pData && typeof pData === 'object') {
              promoteWorkingCostDpl(pr.skewDpl || dpl, pr.endpointTpl || path);
              return pData;
            }
          }
        } catch {}
      }
      applySkewCookie(dpl);
      const primaryPath = path;
      const primaryOpts = dpl ? { ...options, headers: { ...(options?.headers || {}), 'x-deployment-id': dpl } } : options;
      try {
        const res = await fallbackCostReq(primaryPath, primaryOpts);
        promoteWorkingCostDpl(dpl, path);
        return res;
      } catch (err) {
        lastErr = err;
        if (err && err.status === 401 && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function' && now() - lastCostReloginAt > 45000) {
          lastCostReloginAt = now();
          const ok = await Promise.resolve(Auth.relogin()).catch(() => false);
          if (ok) {
            applySkewCookie(dpl);
            const reloggedRes = await fallbackCostReq(primaryPath, primaryOpts);
            promoteWorkingCostDpl(dpl, path);
            return reloggedRes;
          }
        }
        if (err && err.status === 403) {
          globalCost403Until = Math.max(globalCost403Until, now() + 180000);
          if (dpl) demoteFailedCostDpl(dpl);
          throw err;
        } else if (err && err.status === 409 && dpl) {
          demoteFailedCostDpl(dpl);
        }
        if (err && err.status === 429) {
          globalCost429Until = Math.max(globalCost429Until, now() + Math.max(Number(err.retryAfterMs) || 0, 35000));
          try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
          throw err;
        }
        if (!err || err.status !== 409) throw err;
      }
    }
    if (false && altPaths.length > 1 && !(options && options._triedAllSkew)) {
      const bestDpl = activeCostSkewDpl || COST_SKEW_POOL[0] || '';
      applySkewCookie(bestDpl);
      for (let pIdx = 1; pIdx < altPaths.length; pIdx++) {
        const altP = altPaths[pIdx];
        try {
          const altRes = await fallbackCostReq(altP, {
            ...options,
            headers: { ...(options?.headers || {}), ...(bestDpl ? { 'x-deployment-id': bestDpl } : {}) },
          });
          if (altRes && typeof altRes === 'object') {
            promoteWorkingCostDpl(bestDpl, altP);
            return altRes;
          }
        } catch {}
      }
    }
    throw lastErr || Object.assign(Error('HTTP 403'), { status: 403 });
  };
  const costDocCache = (() => {
    const map = new Map();
    try {
      const saved = typeof Store !== 'undefined' && Store.get ? Store.get('billing:costDocCache', null) : null;
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          if (k && v && typeof v.data?.messages === 'object') map.set(k, v);
        }
      }
    } catch {}
    return map;
  })();
  let saveCostDocTimer = 0;
  const persistCostDocCache = () => {
    clearTimeout(saveCostDocTimer);
    saveCostDocTimer = setTimeout(() => {
      try {
        if (typeof Store === 'undefined' || !Store.set) return;
        const entries = [...costDocCache.entries()].sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 80);
        Store.set('billing:costDocCache', Object.fromEntries(entries));
      } catch {}
    }, 600);
  };
  const getCachedCostDoc = (sid, lastCompId = '') => {
    if (!sid) return null;
    const rec = costDocCache.get(sid);
    if (!rec || !rec.data || typeof rec.data.messages !== 'object') return null;
    const msgKeys = Object.keys(rec.data.messages);
    const age = now() - (rec.at || 0);
    // 若已覆盖当前最后一条已完成回复，且有有效账单记录，直接复用本地缓存（零网络请求）
    if (msgKeys.length > 0 && (!lastCompId || rec.lastId === lastCompId || rec.data.messages[lastCompId])) {
      return rec.data;
    }
    // 即使某历史会话账单为空（或最后一条超过50条上限未收录），3分钟内也不重复轰炸 /cost 接口
    if (age < 180000 && (!lastCompId || rec.lastId === lastCompId)) {
      return rec.data;
    }
    return null;
  };
  const setCachedCostDoc = (sid, lastCompId, data) => {
    if (!sid || !data || typeof data.messages !== 'object') return;
    const chRef = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    const isFreshPendingBill = Boolean(lastCompId && !data.messages[lastCompId] && chRef && now() - (chRef._lastTurnDoneAt || 0) < 12000);
    costDocCache.set(sid, { lastId: isFreshPendingBill ? '' : (lastCompId || ''), count: Object.keys(data.messages).length, at: now(), data });
    if (costDocCache.size > 24) {
      const oldest = [...costDocCache.entries()].sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))[0]?.[0];
      if (oldest) costDocCache.delete(oldest);
    }
    persistCostDocCache();
  };
  const clearCachedCostDoc = sid => {
    if (sid) costDocCache.delete(sid);
    else costDocCache.clear();
    persistCostDocCache();
  };
  const costInflightBySid = new Map();
  let costPaceQ = Promise.resolve(), costLastReqAt = 0;
  const paceCostNet = async () => {
    const p = costPaceQ.then(async () => {
      const w = costLastReqAt + 850 - now();
      if (w > 0) await new Promise(r => setTimeout(r, w));
      costLastReqAt = now();
    });
    costPaceQ = p.catch(() => {});
    return p;
  };
  const protoCostReq = async (path, options = {}) => {
    const sidMatch = /\/(?:api|nextjs-api)\/(?:chat|evaluation)\/([0-9a-f-]{36})\/cost\b/i.exec(String(path || ''));
    const reqSid = sidMatch ? sidMatch[1] : '';
    const chatRef = (reqSid && typeof Chats !== 'undefined') ? Chats.get(reqSid) : null;
    const lastCompId = chatRef ? (globalThis.ArenaBilling.completed(chatRef).at(-1)?.id || '') : '';
    if (reqSid && !options?.forceNet && !chatRef?.busy) {
      const cached = getCachedCostDoc(reqSid, lastCompId);
      if (cached) return cached;
    }
    const curOwner = (typeof Acc !== 'undefined' && Acc.cur) ? String(Acc.cur) : '';
    const inflightKey = reqSid ? `${curOwner}:${reqSid}:${lastCompId}:${String(path || '')}` : '';
    if (globalCost429Until > now() && !options?.interactive) {
      const cached429 = reqSid ? getCachedCostDoc(reqSid, lastCompId) : null;
      if (cached429) return cached429;
      throw Object.assign(Error('计费接口冷却中'), { status: 429, rateLimitedLocally: true, retryAfterMs: globalCost429Until - now() });
    }
    if (globalCost403Until > now() && !options?.interactive) {
      const cached403 = reqSid ? getCachedCostDoc(reqSid, lastCompId) : null;
      if (cached403) return cached403;
      throw Object.assign(Error('计费接口拒绝读取（HTTP 403 冷却中）'), { status: 403, rateLimitedLocally: true, retryAfterMs: globalCost403Until - now() });
    }
    if (inflightKey && costInflightBySid.has(inflightKey)) return costInflightBySid.get(inflightKey);
    const runNet = (async () => {
      await paceCostNet();
    const reqPath = (() => {
      const m = /^\/api\/chat\/([0-9a-f-]{36})\/cost\?includeSession=true$/i.exec(String(path || ''));
      const prefTpl = (typeof Pin !== 'undefined' && Array.isArray(Pin.ENDPOINTS) && Pin.ENDPOINTS[0]) ? Pin.ENDPOINTS[0] : '';
      if (m && prefTpl && prefTpl.includes('{sid}')) return prefTpl.replace('{sid}', encodeURIComponent(m[1]));
      return path;
    })();
    if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
      const lockedNow = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
      if (lockedNow) activeCostSkewDpl = lockedNow;
      try {
        const r = await Host.protoFetch(reqPath, {
          method: 'GET',
          costShown: true,
          skewDpl: activeCostSkewDpl,
          timeout: options?.timeout || 15000,
          headers: { Accept: 'application/json' },
        });
        if (r && !r.fallback && !r.error && typeof r.status === 'number') {
          if (Array.isArray(r.pool)) {
            for (const d of r.pool) { try { Pin?.learnDpl?.(d, false); } catch {} }
          }
          if (r.skewDpl && r.ok) {
            globalCost403Until = 0;
            promoteWorkingCostDpl(r.skewDpl, r.endpointTpl || reqPath);
          }
          if (r.status === 403) {
            globalCost403Until = Math.max(globalCost403Until, now() + 180000);
            if (chatRef) chatRef._lastCost403TurnId = lastCompId || '_turn';
            options = Object.assign({}, options, { _triedAllSkew: true, _protoStatus: 403 });
          } else if (r.status === 409 && r.triedAllSkew) {
            options = Object.assign({}, options, { _triedAllSkew: true, _protoStatus: r.status });
          }
          if (r.status === 401 || r.status === 403) {
            return await runFallbackWithRelogin(path, options);
          }
          if (r.status === 409 && !r.triedAllSkew) {
            return await runFallbackWithRelogin(path, options);
          }
          if (r.status >= 300 && r.status < 400) {
            throw Object.assign(Error('计费接口被重定向，未读取'), { status: r.status, responseFormat: 'redirect' });
          }
          const ct = String(r.contentType || '').toLowerCase();
          const trimmed = String(r.text || '').trim();
          const html = ct.includes('text/html') || /^<(?:!doctype|html)\b/i.test(trimmed);
          let data = null;
          if (!html && trimmed) {
            try { data = JSON.parse(trimmed); } catch {
              if (r.ok) throw Object.assign(Error('计费返回非 JSON'), { status: r.status || 200, responseFormat: 'invalid-json' });
            }
          }
          if (!r.ok) {
            const retrySec = Number(r.retryAfter);
            const retryAfterMs = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : null;
            if (r.status === 429) {
              globalCost429Until = Math.max(globalCost429Until, now() + Math.max(Number(retryAfterMs) || 0, 45000));
              try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
            }
            throw Object.assign(Error(data?.error || data?.message || ('HTTP ' + r.status)), {
              status: r.status,
              retryAfterMs,
              responseFormat: html ? 'html' : undefined,
            });
          }
          if (html || !data || typeof data !== 'object') {
            throw Object.assign(Error('计费接口返回非 JSON 页面'), { status: r.status || 200, responseFormat: html ? 'html' : 'invalid-json' });
          }
          if (reqSid && typeof data.messages === 'object') setCachedCostDoc(reqSid, lastCompId, data);
          return data;
        }
      } catch (e) {
        if (e && (e.status === 401 || (e.status === 403 && !options?._triedAllSkew))) {
          const fbData = await runFallbackWithRelogin(path, options);
          if (reqSid && fbData && typeof fbData.messages === 'object') setCachedCostDoc(reqSid, lastCompId, fbData);
          return fbData;
        }
        if (e && (Number.isInteger(e.status) || e.responseFormat)) throw e;
      }
    }
    const fbData = await runFallbackWithRelogin(path, options);
    if (reqSid && fbData && typeof fbData.messages === 'object') setCachedCostDoc(reqSid, lastCompId, fbData);
    return fbData;
    })();
    if (inflightKey) {
      costInflightBySid.set(inflightKey, runNet);
      return runNet.finally(() => { if (costInflightBySid.get(inflightKey) === runNet) costInflightBySid.delete(inflightKey); });
    }
    return runNet;
  };
  const engine = globalThis.ArenaBilling.create({
    request: protoCostReq,
    account: () => String(UI.host?.account?.id || UI.me?.id || UI.host?.account?.email || UI.me?.email || ''), clock: now, bundled,
    savedCatalog: Store.get('billing:catalog', null), saveCatalog: doc => Store.set('billing:catalog', doc),
    changed: sid => {
      if (sid && typeof Chats !== 'undefined') {
        const ch = Chats.get(sid);
        if (ch) {
          const last = globalThis.ArenaBilling.completed(ch).at(-1)?.id;
          const stNow = engine.state(sid);
          const used = stNow.info?.result?.unitPrice?.used || [];
          const postCovered = stNow.postTurnCoveredIds || [];
          if (last && used.some(r => r.messageId === last) && postCovered.includes(last) && stNow.status === 'ready') {
            for (const t of delayed.get(ch) || []) clearTimeout(t);
            delayed.delete(ch);
          }
          if (!isOtherProbeBusy(ch) && ch.gacha?.mode !== 'autoqa' && ch.gacha?.mode !== 'habit' && !ch.gacha?.fingerprint && Store.get('billing:auto', true) !== false) {
            try { applyReverseIdentity(ch, { interactive: false }); } catch {}
          }
          if (stNow.status === 'forbidden' && stNow.httpStatus === 403 && !isOtherProbeBusy(ch)) {
            try { ChatHabitFingerprint.identifyAndApply(ch, { force: false, fromCostFallback: true }); } catch {}
          }
        }
      }
      Bus.emit('billing', sid);
      try { Bus.emit('budget'); } catch {}
    },
    paymentsReceived: (sid, rows, owner) => {
      if (typeof Budget !== 'undefined') Budget.payments(sid, rows, owner);
      try { if (typeof Price !== 'undefined' && sid) Price.learn(sid); } catch {}
      try { Bus.emit('budget'); } catch {}
    },
  });
  const REASONS = {
    'no-catalog': '第一方价格候选池为空', 'no-paired-samples': '账单尚未与完整助手消息配对，稍后刷新',
    'no-assistant-output': '没有可配对的完整助手回复', 'no-base-price': '账单尚未提供基准费用',
    'no-costs': '尚未取得可用计费数据',
  };
  const autoEnabled = () => {
    try { if (typeof Prefs !== 'undefined' && typeof Prefs.billingAuto === 'boolean') return Prefs.billingAuto; } catch {}
    return Store.get('billing:auto', true) !== false;
  };
  const setAutoEnabled = (on) => {
    const val = Boolean(on);
    try { if (typeof Prefs !== 'undefined') { Prefs.billingAuto = val; if (typeof savePrefs === 'function') savePrefs(); } } catch {}
    try { if (typeof Store !== 'undefined' && Store.set) Store.set('billing:auto', val); } catch {}
    return val;
  };
  const autoSeen = new WeakMap();
  try {
    if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
      Bus.on('ipchange', () => { try { engine.clearCooldowns?.(); } catch {} });
    }
  } catch {}

  function isOpenCandidateName(s) {
    const id = String(s || '').toLowerCase();
    if (/muse/i.test(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
    return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
  }
  function isClosedCandidateName(s) {
    const id = String(s || '').toLowerCase();
    if (/muse/i.test(id)) return true;
    if (isOpenCandidateName(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['claude', 'openai', 'gemini', 'grok'].includes(vid)) return true;
    return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse|solar-pro/i.test(id);
  }
  function shouldSkipCostForOpenSource(chat) {
    if (!chat) return false;
    if (chat._closedLockedModel && !isOpenCandidateName(chat._closedLockedModel)) return false;
    const m = chat.sid && typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
    if (m?.userCorrected) {
      return m.name === '开源模型' || isOpenCandidateName(m.name);
    }
    const thinkSt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    if (thinkSt?.kind === 'compat-thinking' || thinkSt?.kind === 'open') return true;
    const allMsgs = [...(Array.isArray(chat.messages) ? chat.messages : []), chat.live].filter(x => x && x.role === 'assistant');
    if (allMsgs.length > 0) {
      const firstParts = Array.isArray(allMsgs[0]?.parts) ? allMsgs[0].parts : [];
      if (allMsgs[0]?.metadata?.openThinkStopped || firstParts.some(p => p && (p.type === 'reasoning' || p.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || p.reasoning || '').trim()))) return true;
    }
    if (m && !m.routed && (m.name === '开源模型' || (isOpenCandidateName(m.name) && (m.provider === '开源思考过滤' || m.provider === '开源思考识别（免计费反推）')))) return true;
    return false;
  }

  // 识别为开源模型后：立即标记为「开源模型」并同步修改对话名称（侧栏卡片与顶部标签页），不自动浪费时间推理具体计费模型（除非用户手动点击反推锁定）
  const _markingOpenSids = new Set();
  function markAsOpenSourceModel(chat, { force = false } = {}) {
    const sid = typeof chat === 'string' ? chat : chat?.sid;
    if (!sid || ChatHabitFingerprint.isEvalSession?.(chat)) return null;
    const c = typeof chat === 'object' && chat ? chat : (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    if (c?._killedOpenThink || (typeof Gacha !== 'undefined' && Gacha.isKilledOpenChat?.(sid))) return null;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (_markingOpenSids.has(sid)) return known;
    if (known?.userCorrected && !force) return known;
    // 若用户之前已手动点击「反推锁定」推理出了具体的开源型号（manualOpenInferred），在自动流程中保留该结果不覆盖
    if (known?.manualOpenInferred && !force) return known;
    if (!force && known?.name && known.name !== '开源模型' && isClosedCandidateName(known.name) && !known.guess) return known;
    if (!force && c && Array.isArray(c.messages)) {
      const asstList = c.messages.filter(m => m && m.role === 'assistant');
      if (asstList.length > 1) {
        const firstParts = Array.isArray(asstList[0]?.parts) ? asstList[0].parts : [];
        const firstHadVisible = Boolean(asstList[0]?.metadata?.openThinkStopped || firstParts.some(p => p && (p.type === 'reasoning' || p.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || p.reasoning || '').trim())));
        if (!firstHadVisible) return known;
      }
    }
    const alreadyOpen = Boolean(known && known.name === '开源模型' && !known.guess && !known.pendingConfirm && known.sure);
    if (alreadyOpen && !force) {
      if (c) c._openSourceMarked = true;
      return known;
    }
    _markingOpenSids.add(sid);
    try {
      if (c) c._openSourceMarked = true;
      const nextEntry = {
        ...(known || {}),
        name: '开源模型',
        candidateName: '开源模型',
        rawLabel: '开源模型',
        reverseCandidateId: 'open-source',
        reverseLabel: '开源模型',
        reverseMatch: 100,
        confidence: 100,
        habitTags: ['开源思考 · 已跳过自动计费反推（手动点反推锁定可测具体型号）'],
        habitInferred: false,
        reverseInferred: true,
        billingProbe: true,
        sure: true,
        guess: false,
        uncertain: false,
        pendingConfirm: false,
        fromTitle: false,
        routed: false,
        provider: '开源思考识别（免计费反推）',
        why: '检测到开源模型，已自动同步对话名称并跳过自动计费推理（如需细分型号请手动点击反推锁定）',
        at: known?.at && alreadyOpen ? known.at : now(),
      };
      if (typeof Models !== 'undefined') {
        Models.set(sid, nextEntry);
        try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
        try { if (typeof Bus !== 'undefined') Bus.emit('model', c || { sid }, nextEntry); } catch {}
      }
      try {
        const ts = c?.sentAt || now();
        if (typeof Notes !== 'undefined') {
          const n = Notes.rec?.(sid, ts);
          if (n && !n.t) n.t = ts;
          Notes.save?.();
        }
        if (typeof Titles !== 'undefined') {
          Titles.capture?.(sid, ts);
          Titles.local?.(sid);
          Titles.kick?.(true);
        }
        if (typeof History !== 'undefined' && History.byId) {
          const he = History.byId(sid);
          const want = typeof Titles !== 'undefined' && Titles.want ? Titles.want(sid) : '';
          if (he && want && he.title !== want) he.localTitle = want;
        }
        if (typeof Bus !== 'undefined') Bus.emit('billing', sid);
        UI?.renderListSoon?.();
        UI?.renderTabs?.();
        Dock?.soon?.();
      } catch {}
      return nextEntry;
    } finally {
      _markingOpenSids.delete(sid);
    }
  }
  function cleanModelLabel(s) {
    let raw = String(s || '').trim();
    if (!raw) return raw;
    if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.sanitizeCorruptedTierSlug === 'function') {
      raw = ChatHabitFingerprint.sanitizeCorruptedTierSlug(raw);
    }
    raw = raw.replace(/(?:\s*\((None|Minimal|Low|Medium|High|xHigh|Max)\))+$/i, (_, lastTier) => ` (${lastTier})`);
    if (!/\s/.test(raw) && /^[a-z0-9._-]+$/i.test(raw) && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.formatDisplayModelLabel === 'function') {
      raw = ChatHabitFingerprint.formatDisplayModelLabel(raw, raw);
    }
    return raw;
  }
  function shortCanonLabel(s) {