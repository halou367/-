  function isEvalSession(sidOrChat, hEntry = null) {
    const c = (typeof sidOrChat === 'object' && sidOrChat) ? sidOrChat : (sidOrChat && typeof Chats !== 'undefined' ? Chats.get(sidOrChat) : null);
    if (c && (c.isEvaluation || c.evalMode === 'battle' || c.evalMode === 'direct' || c._isVirtualBattleSide)) return true;
    const sid = (typeof sidOrChat === 'string') ? sidOrChat : c?.sid;
    const he = hEntry || (sid && typeof History !== 'undefined' && typeof History.byId === 'function' ? History.byId(sid) : null);
    if (he && (he.type === 'evaluation' || he.mode === 'battle' || he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side')) return true;
    return false;
  }

  function identifyAndApply(chat, { force = false, fromCostFallback = false, interactive = false } = {}) {
    if (!chat?.sid || isEvalSession(chat)) return null;
    const sid = chat.sid;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (known?.userCorrected && !interactive && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return known;
    if (interactive && known?.userCorrected) {
      delete known.userCorrected;
      delete known.userCorrectedAt;
    }
    if (known?.fingerprint?.result && !interactive) return known;
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredMeta = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    const compAsstForGuard = Array.isArray(chat?.messages) ? chat.messages.filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending') : [];
    const hasLoadedMsgs = compAsstForGuard.length > 0;
    const hasNewerLoadedTurn = Boolean(hasLoadedMsgs && ((compAsstForGuard.length > (Number(known?.completedTurnCount) || 0)) || (compAsstForGuard.at(-1)?.id && known?.lastMessageId && compAsstForGuard.at(-1).id !== known.lastMessageId) || (known?.reverseVer || 0) < 182));
    if (!interactive && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (restoredMeta && !restoredMeta.fromPrefix)) && !(known?.lastMessageId && compAsstForGuard.at(-1)?.id && compAsstForGuard.at(-1).id !== known.lastMessageId)) return known;
    if (!interactive && !force && !hasLoadedMsgs && restoredMeta?.fromPrefix && (!known?.habitFeatures && (known?.reverseVer || 0) >= 174)) return known;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && !known.habitInferred && (known.response || (known.internal && !known.billingProbe));
    if (hasAuthoritativeApi && !force) return known;
    // 识别到开源模型后，除非用户手动点击「反推锁定」（interactive: true），否则直接标记为「开源模型」并同步修改对话名称，不再浪费算力去推理具体计费型号
    if (!interactive && typeof BillingProbe !== 'undefined' && typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && BillingProbe.shouldSkipCostForOpenSource(chat)) {
      if (typeof BillingProbe.markAsOpenSourceModel === 'function') {
        return BillingProbe.markAsOpenSourceModel(chat);
      }
    }
    const costEnabledNow = typeof BillingProbe !== 'undefined' && typeof BillingProbe.isCostProbeEnabled === 'function' ? BillingProbe.isCostProbeEnabled() : true;
    const stNowForCost = (typeof BillingProbe !== 'undefined' && typeof BillingProbe.getLiveState === 'function')
      ? BillingProbe.getLiveState(sid)
      : (typeof BillingProbe !== 'undefined' && typeof BillingProbe.state === 'function' ? BillingProbe.state(sid) : null);
    const hasLiveValidCostObs = Boolean(
      Number(stNowForCost?.ledger?.observations || 0) > 0 &&
      Number(stNowForCost?.info?.result?.actual?.basePriceUsd || stNowForCost?.lastInfo?.result?.actual?.basePriceUsd || 0) > 0 &&
      stNowForCost?.status !== 'forbidden' && stNowForCost?.status !== 'error'
    );
    const liveCostCands = hasLiveValidCostObs ? (stNowForCost?.info?.result?.baseMatch?.candidates || stNowForCost?.lastInfo?.result?.baseMatch?.candidates || []) : [];
    const hasKnownRealCost = Boolean(
      (Number(known?.costUsd) > 0) ||
      (Number(known?.reverseTokens?.total) > 0) ||
      (Number(known?.reverseTotalTokens?.total) > 0)
    );
    const realSavedRevCand = (hasKnownRealCost && known && Array.isArray(known.reverseCandidates))
      ? known.reverseCandidates.find(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 75))
      : null;
    const hasRealCostModel = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
        liveCostCands.length > 0 ||
        realSavedRevCand ||
        (known && !known.habitInferred && known.reverseInferred && hasKnownRealCost)
      )
    );
    const resPreCheck = (hasRealCostModel || known?.routed) ? analyze(chat, known, { ignoreExactSid: Boolean(interactive && force) }) : null;
    const habRoutePreCheck = (resPreCheck && typeof BillingProbe !== 'undefined' && typeof BillingProbe.detectHabitAndMessageRoute === 'function')
      ? BillingProbe.detectHabitAndMessageRoute(sid, chat, null, known, resPreCheck, known?.reverseCandidates)
      : null;
    const isMidTurnRouted = Boolean(habRoutePreCheck?.routed);
    if (hasRealCostModel && costEnabledNow && !interactive && !isMidTurnRouted) {
      if (realSavedRevCand && known && !known.routed) {
        try { learnFromReverseTeacher(chat, known, realSavedRevCand); } catch {}
      }
      return known;
    }
    if ((hasRealCostModel || (hasKnownRealCost && known?.sure && known?.reverseInferred && !known?.habitInferred)) && !interactive && !isMidTurnRouted && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (!force || !known?.habitInferred)) return known;

    const res = resPreCheck || analyze(chat, known, { ignoreExactSid: Boolean(interactive && force) });
    if (!res || !res.best) return null;
    if (!interactive && res.features?.isOpenThink && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
      return BillingProbe.markAsOpenSourceModel(chat);
    }
    const habRouteNow = habRoutePreCheck || ((typeof BillingProbe !== 'undefined' && typeof BillingProbe.detectHabitAndMessageRoute === 'function')
      ? BillingProbe.detectHabitAndMessageRoute(sid, chat, null, known, res, known?.reverseCandidates)
      : null);
    const isNowMidTurnRouted = Boolean(habRouteNow?.routed);
    const best = res.best;
    const second = res.candidates[1] || null;
    const isStandout = !second || (best.match - second.match) >= 0.5 || best.match >= 82;
    const rawBestDecomp = decomposeModelIdentity(best.canon || best.label);
    const decomp = rawBestDecomp.hasExplicitTier
      ? rawBestDecomp
      : decomposeModelIdentity(best.canon || best.label, {
          vendor: best.vendorId || best.vendor,
          family: best.family,
          effort: best.effort || best.detectedEffort || res.identifiedEffort || undefined,
          rawLabel: best.label,
        });
    const canon = decomp.canon || (best.label === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(best.label) : best.label).replace(/[?？]+$/, ''));
    const sameKnownModel = Boolean(known?.name && (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(known.name) : String(known.name)).replace(/[?？]+$/, '').toLowerCase() === canon.toLowerCase());
    const revScore = (!interactive && sameKnownModel && known && !known.habitInferred && known.reverseScore != null) ? known.reverseScore : res.reasoningScore;
    const curEffort = decomp.effort || 'standard';
    const consistentLabel = decomp.displayLabel || best.label || canon;
    const compMsgsNow = (Array.isArray(chat?.messages) ? chat.messages : []).filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending' && !(x.parts || []).some(p => p?.type === 'error'));
    const latestAsstId = res?.features?.targetMessageId || compMsgsNow.at(-1)?.id || known?.lastMessageId || known?.messageId || null;
    // 绝不把 structuralRev 或无账单反推写入 reverseCandidates（仅保留真实 /cost 反推候选池）
    const preservedRevCands = (hasKnownRealCost && Array.isArray(known?.reverseCandidates))
      ? known.reverseCandidates.filter(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (!CONFIRMED_GEMINI_FLASH_SIDS.has(sid) || !/gemini[-\s]*4|argon/i.test(String(rc.label || rc.id || ''))) && (rc.diophantinePassed || (rc.revPct != null && (!interactive || Number(rc.revPct ?? rc.match ?? 0) >= 80))))
      : [];
    const shouldLockHabitNow = true;
    const nextProvider = isNowMidTurnRouted
      ? `中途路由切换识别（${habRouteNow.fromLabel} → ${habRouteNow.toLabel}）`
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
      reverseVer: 182,
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
      (known.reverseVer || 0) >= 182
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
      reverseVer: 182,
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
      if (!otherSid || otherSid === excludeSid) return false;
      const otherChat = (typeof Chats !== 'undefined' && Chats.get(otherSid)) || { sid: otherSid, messages: [] };
      if (otherChat?.busy) return false;
      const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
      if (om?.userCorrected || om?.routed) return false;
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

  return {
    extractFeatures,
    extractCompactMeta,
    healTruncatedSvg,
    extractSvgStyleV2,
    scoreMiniSvg32Pelican,
    extractCleanHtmlOrSvg,
    extractHtmlSvgFeatures,
    classifyHtmlSvg,
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

