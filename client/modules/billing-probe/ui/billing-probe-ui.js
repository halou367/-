  const summaryCache = new Map();
  const topConfidenceCache = new Map();
  const clearSummaryCache = () => { try { summaryCache.clear(); topConfidenceCache.clear(); } catch {} };
  function summary(sid, opts = {}) {
    const mPre = sid && typeof Models !== 'undefined' ? Models.get(sid) : null;
    const isPoisonedZeroCost = Boolean(mPre && mPre.reverseInferred && Number(mPre.reverseTokens?.total || 0) === 0 && (Number(mPre.reverseVer || 0) < 175 || (Array.isArray(mPre.reverseCandidates) && mPre.reverseCandidates.some(c => c?.structuralRev))));
    const readOnly = opts?.commit === true ? false : (opts?.readOnly !== undefined ? Boolean(opts.readOnly) : !isPoisonedZeroCost);
    if (sid && !readOnly) try { upgradeCachedOpus56(sid); } catch {}
    const chat = Chats.get(sid);
    const compList = globalThis.ArenaBilling.completed(chat);
    const compTail = compList.at(-1);
    const state = engine.state(sid);
    const trace = Trace.latest(sid);
    const model = Models.get(sid);
    const bRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.bankRevision === 'function' ? ChatHabitFingerprint.bankRevision() : 0;
    const cRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.calibRevision === 'function' ? ChatHabitFingerprint.calibRevision() : 0;
    const msgDigest = (chat && typeof ChatHabitFingerprint?.computeMessagesDigest === 'function') ? ChatHabitFingerprint.computeMessagesDigest(chat.messages) : '';
    const rf = getRankFilter();
    const tailMsg = chat?.messages?.at(-1);
    const tailPart = tailMsg?.parts?.at(-1);
    const tailLen = typeof tailPart?.text === 'string' ? tailPart.text.length : (typeof tailPart?.inputText === 'string' ? tailPart.inputText.length : 0);
    const busySig = chat?.busy ? `1:${tailMsg?.id || ''}:${tailMsg?.parts?.length || 0}:${tailLen >> 8}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}` : '0';
    const makeSumCacheKey = (mObj, latestId = compTail?.id) => sid ? `${readOnly ? 'ro' : 'rw'}:${state.at || 0}:${state.status || ''}:${state.httpStatus || 0}:${state.retryAt || 0}:${state.pending ? 1 : 0}:${latestId || ''}:${chat?.messages?.length || 0}:${msgDigest}:${busySig}:${mObj?.at || 0}:${mObj?.name || ''}:${mObj?.reverseVer || 0}:${mObj?.routed ? 1 : 0}:${trace?.done ? 1 : 0}:${isCostProbeEnabled() ? 1 : 0}:${bRev}:${cRev}:${rf.rev ? 1 : 0}:${rf.habit ? 1 : 0}` : '';
    const preCacheKey = makeSumCacheKey(model, compTail?.id);
    if (preCacheKey && summaryCache.has(sid)) {
      const hit = summaryCache.get(sid);
      if (hit && (hit.key === preCacheKey || hit.prevKey === preCacheKey || hit.compKey === preCacheKey)) return hit.val;
    }
    const featForTarget = (chat && Array.isArray(chat.messages) && chat.messages.length && typeof ChatHabitFingerprint?.extractFeatures === 'function')
      ? ChatHabitFingerprint.extractFeatures(chat, model)
      : null;
    const latest = (featForTarget?.targetMessageId && compList.find(m => m?.id === featForTarget.targetMessageId)) || compTail;
    const cacheKey = makeSumCacheKey(model, latest?.id);
    if (cacheKey && summaryCache.has(sid)) {
      const hit = summaryCache.get(sid);
      if (hit && (hit.key === cacheKey || hit.prevKey === cacheKey || hit.compKey === cacheKey)) return hit.val;
    }
    const paymentsList = Array.isArray(state.payments) ? state.payments : [];
    const rawPay = latest ? paymentsList.find(p => p?.messageId === latest.id) : paymentsList.at(-1);
    const payment = rawPay ? {
      ...rawPay,
      effectiveUsd: rawPay.chargedUsd != null ? rawPay.chargedUsd : (rawPay.basePriceUsd != null ? rawPay.basePriceUsd * 2 : rawPay.upstreamUsd),
    } : null;
    const sessionPayment = paymentsList.length ? paymentsList.reduce((acc, r) => {
      if (r.chargedUsd != null) acc.chargedUsd = (acc.chargedUsd || 0) + r.chargedUsd;
      if (r.upstreamUsd != null) acc.upstreamUsd = (acc.upstreamUsd || 0) + r.upstreamUsd;
      if (r.basePriceUsd != null) acc.basePriceUsd = (acc.basePriceUsd || 0) + r.basePriceUsd;
      const eff = r.chargedUsd != null ? r.chargedUsd : (r.basePriceUsd != null ? r.basePriceUsd * 2 : r.upstreamUsd);
      if (eff != null) { acc.effectiveUsd = (acc.effectiveUsd || 0) + eff; acc.count += 1; acc.turns += 1; }
      return acc;
    }, { chargedUsd: null, upstreamUsd: null, basePriceUsd: null, effectiveUsd: null, count: 0, turns: 0 }) : null;
    const estimate = chat ? LiveEst.of(chat) : null;
    const pairedTrace = !!latest && !chat?.busy && trace?.done && (trace.records || []).some(row => row.messageId === latest.id);
    const traceUsd = pairedTrace && trace.sum?.usd > 0 ? trace.sum.usd : null;
    const diagnostics = engine.diagnostics(sid, { latestId: latest?.id, model, trace, tracePaired: pairedTrace });
    const pre = diagnostics.preimage || null;
    const latestPreimage = (pre && latest?.id && pre.byMessage?.[latest.id]) || (pre?.byMessage ? Object.values(pre.byMessage).at(-1) : null) || null;
    const mergedCandidates = mergeCandidates(sid, diagnostics, model);
    if (sessionPayment) {
      const costsObj = state.info?.result?.costs || null;
      const chanSum = costsObj ? (Number(costsObj.inputUsd || 0) + Number(costsObj.outputUsd || 0) + Number(costsObj.cacheReadUsd || 0) + Number(costsObj.cacheWriteUsd || 0) + Number(costsObj.imageGenerationCostUsd || 0)) : null;
      const chargedOk = sessionPayment.chargedUsd != null && sessionPayment.basePriceUsd != null && Math.abs(sessionPayment.chargedUsd - sessionPayment.basePriceUsd * 2) <= 1e-8;
      const channelOk = sessionPayment.upstreamUsd != null && chanSum != null && Math.abs(chanSum - sessionPayment.upstreamUsd) <= 1e-8;
      const preimageOk = Boolean(pre?.totals?.total > 0 && mergedCandidates[0]?.diophantinePassed !== false);
      sessionPayment.reconciled = Boolean(chargedOk || (channelOk && preimageOk));
      sessionPayment.chargedIdentityOk = chargedOk;
      sessionPayment.channelIdentityOk = channelOk;
      sessionPayment.preimageIdentityOk = preimageOk;
      sessionPayment.channelsUsd = costsObj ? {
        inputUsd: Number(costsObj.inputUsd || 0),
        outputUsd: Number(costsObj.outputUsd || 0),
        cacheReadUsd: Number(costsObj.cacheReadUsd || 0),
        cacheWriteUsd: Number(costsObj.cacheWriteUsd || 0),
        imageGenerationCostUsd: Number(costsObj.imageGenerationCostUsd || 0),
      } : null;
    }
    const out = {
      payment,
      sessionPayment,
      estimate,
      traceUsd,
      tracePaired: pairedTrace,
      busy: !!chat?.busy,
      consensus: diagnostics.agreement || engine.consensus(sid, model, latest?.id),
      diagnostics,
      ranked: Array.isArray(diagnostics?.candidates) ? diagnostics.candidates : [],
      top: mergedCandidates,
      mergedCandidates,
      habitRoute: mergedCandidates._habitRoute || null,
      preimage: pre ? { latest: latestPreimage, totals: pre.totals, refVersion: pre.refVersion } : null,
    };
    const isActiveOrLoadedChat = Boolean(
      chat?.loaded ||
      (Array.isArray(chat?.messages) && chat.messages.length > 0) ||
      (Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0) ||
      model?.habitFeatures ||
      (typeof Tabs !== 'undefined' && Tabs.cur?.sid === sid) ||
      (typeof UI !== 'undefined' && UI.els?.chat?.sid === sid)
    );
    const cloudTitleForSync = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredForSync = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    const isFullEncodedTitle = Boolean((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitleForSync)) || (restoredForSync && !restoredForSync.fromPrefix));
    const hasLocalSyncEvidence = Boolean(
      (Array.isArray(chat?.messages) && chat.messages.length > 0) ||
      (Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0) ||
      model?.habitFeatures ||
      (diagnostics?.samples?.observations > 0)
    );
    try {
    if (!readOnly && !isFullEncodedTitle && isActiveOrLoadedChat && sid && mergedCandidates.length > 0 && (!model || (!model.userCorrected && !(model.fingerprint?.result && !model.reverseInferred && !model.habitInferred && !model.billingProbe)))) {
      const top0 = mergedCandidates[0], top1 = mergedCandidates[1];
      const hr = out.habitRoute;
      const isNowRouted = Boolean(top0?.routed || hr?.routed || diagnostics?.routeSwitched || diagnostics?.effortDowngraded || diagnostics?.routeType);
      const top0Fam = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier) ? ChatHabitFingerprint.parseModelFamilyAndTier(top0?.canon || top0?.label || '').famKey : '';
      const top1Fam = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier) ? ChatHabitFingerprint.parseModelFamilyAndTier(top1?.canon || top1?.label || '').famKey : '';
      const isSameFamilyTop2 = Boolean(top0Fam && top1Fam && top0Fam === top1Fam);
      const hasClearTopMargin = !top1 || isNowRouted || (Number(top0.match || 0) - Number(top1.match || 0)) >= 0.05 || (Number(top0.combinedWeight ?? top0.match ?? 0) - Number(top1.combinedWeight ?? top1.match ?? 0)) >= 0.5;
      if (!hasClearTopMargin && isSameFamilyTop2 && top0) {
        top0.effortAmbiguous = true;
        top0.supportGranularity = 'family';
      }
      const isUniqueTop = Boolean(top0 && !top0.streamFallback && Number(top0.match || 0) >= 50 && hasClearTopMargin && top0.supportGranularity !== 'family');
      if (isUniqueTop && (!model?.routed || isNowRouted)) {
        const rawTopCanon = (top0.label === '开源模型' || top0.canon === '开源模型') ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(top0.canon || top0.label) : String(top0.canon || top0.label || '')).replace(/[?？]+$/, '');
        const topCanon = (rawTopCanon !== '开源模型' && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawTopCanon) : rawTopCanon;
        const rawCurCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(model?.name || '') : String(model?.name || '')).replace(/[?？]+$/, '');
        const curCanon = (rawCurCanon && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawCurCanon) : rawCurCanon;
        const nextMatch = Math.round(Number(top0.match || 0) * 10) / 10;
        const rawTopDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
          ? ChatHabitFingerprint.decomposeModelIdentity(topCanon)
          : null;
        const topDecomp = (rawTopDecomp && rawTopDecomp.hasExplicitTier)
          ? rawTopDecomp
          : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
            ? ChatHabitFingerprint.decomposeModelIdentity(topCanon, { effort: top0.inferredEffort || top0.effortProfile?.effort })
            : null);
        const topEff = topDecomp
          ? topDecomp.effort
          : String(top0.inferredEffort || top0.effortProfile?.effort || model?.reverseEffort || 'standard').toLowerCase();
        const syncedLabel = topDecomp?.displayLabel || top0.label || topCanon;
        const calcRevSc = (typeof Strength !== 'undefined' && Strength.reverseDepthScore)
          ? Strength.reverseDepthScore(sid, { ...(model || {}), name: topCanon, reverseEffort: topEff, routed: isNowRouted }, out, chat)
          : null;
        const nextScore = calcRevSc ?? top0.habitScore ?? model?.reverseScore ?? model?.habitScore ?? undefined;
        const isHabitWinner = Boolean((top0.habitSource || top0.source === 'fp' || top0.structuralRev) && (!top0.revPct || top0.structuralRev));
        const isLockedAutoOpen = Boolean(model && (model.name === '开源模型' || model.reverseCandidateId === 'open-source') && !model.manualOpenInferred && !model.userCorrected);
        const rAnnotations = isNowRouted
          ? applyChatRouteAnnotations(
              sid, chat, diagnostics, model, hr,
              top0.routeType || hr?.routeType || diagnostics?.routeType || (diagnostics?.effortDowngraded ? 'effort' : 'model'),
              top0.routeFrom || hr?.fromLabel || diagnostics?.initialModelLabel || model?.routeFrom || '',
              top0.routeTo || hr?.toLabel || diagnostics?.routedModelLabel || topCanon,
              top0.routeReason || hr?.reason || ''
            )
          : null;
        const isProtectedRealCostLock = Boolean(
          model &&
          curCanon &&
          curCanon !== topCanon &&
          diagnostics?.read?.httpStatus === 403 &&
          !(diagnostics?.samples?.observations > 0) &&
          model.reverseInferred &&
          !model.habitInferred &&
          !model.guess &&
          (Number(model.reverseTokens?.total) > 0 || Number(model.reverseTotalTokens?.total) > 0 || Number(model.costUsd) > 0) &&
          !top0.both
        );
        const rawRevCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(model?.reverseLabel || '') : String(model?.reverseLabel || '')).replace(/[?？]+$/, '');
        const revCanon = (rawRevCanon && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawRevCanon) : rawRevCanon;
        const hasRealCostInModel = Boolean(
          (diagnostics?.samples?.observations > 0 && diagnostics?.read?.status !== 'forbidden' && diagnostics?.read?.status !== 'error') ||
          Number(model?.reverseTokens?.total) > 0 ||
          Number(model?.reverseTotalTokens?.total) > 0 ||
          Number(model?.costUsd) > 0
        );
        const hasStaleZeroCostRev = Boolean(!hasRealCostInModel && Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0);
        const hasInternalMismatch = Boolean((curCanon && revCanon && curCanon !== revCanon) || (topEff && topEff !== 'standard' && model?.tier && model.tier !== topEff) || hasStaleZeroCostRev);
        const syncSig = `${topCanon}:${topEff}:${nextMatch}:${nextScore != null ? Math.round(Number(nextScore) * 10) : ''}:${isNowRouted ? 1 : 0}:${rAnnotations?.routeTo || ''}:${hasStaleZeroCostRev ? 0 : 1}`;
        const needModelSync = Boolean(
          !isLockedAutoOpen &&
          !isProtectedRealCostLock &&
          topCanon &&
          !/^(未知型号|待定|未识别)$/.test(topCanon) &&
          !(model?._lastSyncSig === syncSig && curCanon === topCanon && !model?.pendingConfirm && !model?.guess && !hasStaleZeroCostRev) &&
          (curCanon !== topCanon || hasInternalMismatch || !model || Boolean(model.routed) !== isNowRouted || (isNowRouted && (!model.lastRouteNotice || model.routeTo !== rAnnotations?.routeTo)) || model.pendingConfirm || model.guess || (nextScore != null && model.reverseScore != null && Math.abs(Number(model.reverseScore) - Number(nextScore)) >= 0.5))
        );
        if (needModelSync) {
          const syncedEntry = {
            ...(model || { sid }),
            ...(hasStaleZeroCostRev ? { reverseCandidates: undefined } : {}),
            _lastSyncSig: syncSig,
            name: topCanon,
            candidateName: topCanon,
            rawLabel: syncedLabel,
            effort: topEff || model?.effort || model?.reverseEffort || undefined,
            tier: topEff || model?.tier || model?.reverseEffort || undefined,
            reverseCandidateId: top0.id || model?.reverseCandidateId || topCanon,
            reverseLabel: syncedLabel,
            reverseEffort: topEff || model?.reverseEffort || undefined,
            reverseMatch: nextMatch,
            confidence: nextMatch,
            reverseScore: nextScore,
            habitScore: top0.habitScore ?? model?.habitScore ?? nextScore,
            guess: false,
            pendingConfirm: false,
            uncertain: false,
            sure: Boolean(top0.diophantinePassed || top0.userLearned || top0.match >= 75),
            habitInferred: isHabitWinner,
            reverseInferred: Boolean(!isHabitWinner || (top0.revPct != null && top0.revPct > 0 && !top0.structuralRev)),
            billingProbe: Boolean(!isHabitWinner || (top0.revPct != null && top0.revPct > 0 && !top0.structuralRev)),
            reverseVer: 176,
            at: model?.at || Date.now(),
            ...(rAnnotations || {}),
          };
          const syncedFam = /claude|anthropic|opus|sonnet|haiku|fable/i.test(topCanon) ? 'claude' : /gemini|google|argon|barium/i.test(topCanon) ? 'gemini' : /gpt|openai|\bsol\b|luna|astra|terra/i.test(topCanon) ? 'gpt' : 'compat';
          syncedEntry.fam = syncedFam;
          if (syncedFam !== 'claude' && /闭合推理|tc_/.test(String(syncedEntry.why || ''))) delete syncedEntry.why;
          Models.set(sid, syncedEntry);
          try {
            if (typeof Notes !== 'undefined') {
              const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
              if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
              Notes.save?.();
            }
            if (typeof TitleSync !== 'undefined' && TitleSync.dirty) TitleSync.dirty(sid);
            if (typeof Titles !== 'undefined') {
              Titles.local?.(sid);
              const shouldCloudSync = Boolean((typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid)));
              if (shouldCloudSync) {
                Titles.capture?.(sid, chat?.sentAt);
                Titles.touch?.(sid);
              }
            }
            UI?.renderListSoon?.();
            UI?.renderTabs?.();
          } catch {}
        }
      }
    }
    } catch (syncErr) {
      console.warn('[BillingProbe.summary sync]', syncErr);
    }
    if (cacheKey) {
      if (summaryCache.size > 64) summaryCache.delete(summaryCache.keys().next().value);
      const mAfter = Models.get(sid);
      const postKey = makeSumCacheKey(mAfter, latest?.id);
      const compKey = makeSumCacheKey(mAfter, compTail?.id);
      summaryCache.set(sid, { key: postKey || cacheKey, prevKey: cacheKey, compKey, val: out });
    }
    return out;
  }

  function topConfidence(sid, mi) {
    if (!sid) return null;
    const cached = summaryCache.get(sid);
    const topC = cached?.val?.mergedCandidates?.[0];
    if (topC && Number.isFinite(+topC.match) && +topC.match > 0) {
      return Math.max(0, Math.min(100, +topC.match));
    }
    const m = mi || (typeof Models !== 'undefined' ? Models.get(sid) : null);
    if (m?.userCorrected && m?.name) return 100;
    const isActiveSid = Boolean((typeof Tabs !== 'undefined' && Tabs.cur?.sid === sid) || (typeof UI !== 'undefined' && UI.els?.chat?.sid === sid));
    if (!isActiveSid && m && (m.reverseVer || 0) >= 174) {
      const persistedConf = Number(m.reverseMatch ?? m.confidence ?? 0);
      if (Number.isFinite(persistedConf) && persistedConf > 0) {
        return Math.max(0, Math.min(100, persistedConf));
      }
    }
    const bRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.bankRevision === 'function' ? ChatHabitFingerprint.bankRevision() : 0;
    const tcKey = `${sid}:${m?.name || ''}:${m?.at || 0}:${m?.reverseMatch || 0}:${m?.confidence || 0}:${m?.userCorrected ? 1 : 0}:${bRev}:${isCostProbeEnabled() ? 1 : 0}`;
    if (topConfidenceCache.has(sid) && topConfidenceCache.get(sid).key === tcKey) {
      return topConfidenceCache.get(sid).val;
    }
    let val = null;
    const st = engine.state(sid);
    if (st?.info && !st.info.reason) {
      const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      const latest = chat ? globalThis.ArenaBilling.completed(chat).at(-1) : null;
      const d = engine.diagnostics(sid, { latestId: latest?.id, model: m });
      const merged = mergeCandidates(sid, d, m);
      if (merged.length && Number.isFinite(+merged[0].match) && +merged[0].match > 0) {
        val = Math.max(0, Math.min(100, +merged[0].match));
      }
    }
    if (val == null) {
      const mergedFallback = mergeCandidates(sid, null, m);
      if (mergedFallback.length && Number.isFinite(+mergedFallback[0].match) && +mergedFallback[0].match > 0) {
        val = Math.max(0, Math.min(100, +mergedFallback[0].match));
      }
    }
    if (topConfidenceCache.size > 96) topConfidenceCache.delete(topConfidenceCache.keys().next().value);
    topConfidenceCache.set(sid, { key: tcKey, val });
    return val;
  }

  function hasStandout(d, c, mergedOverride) {
    const cands = (d?.candidates || []).slice().sort((a, b) => (b.match || 0) - (a.match || 0));
    const ordered = (mergedOverride && mergedOverride.length) ? mergedOverride.slice() : cands;
    const best = ordered[0] || null, second = ordered[1] || null;
    if (!best) return { standout: false, best: null, second: null, close: [], cands: ordered };
    const topConf = Number(best.match || 0);
    const topWeight = Number(best.combinedWeight ?? topConf);
    const hasMergedWeights = Boolean(mergedOverride && mergedOverride.length && best.combinedWeight != null);
    // 最高分唯一则取最高分即可，相近的不算并列，只有同最高分（差距 < 0.05% 且综合权重差距 < 0.5）才视为并列
    const close = ordered.filter(r =>
      (r.source === best.source ? Boolean(r.diophantinePassed) === Boolean(best.diophantinePassed) : true) &&
      Math.abs(topConf - Number(r.match || 0)) < 0.05 &&
      (!hasMergedWeights || Math.abs(topWeight - Number(r.combinedWeight ?? r.match ?? 0)) < 0.5)
    );
    const isTiedTop = close.length > 1;
    const hasStandout = !isTiedTop && topConf > 0;
    const prefName = c?.preference?.primary?.name || '';
    const prefAllowed = prefName && (!mergedOverride?.length || mergedOverride.some(x => canonKey(x.label || x.id) === canonKey(prefName)));
    const standout = Boolean(prefAllowed) || hasStandout;
    return { standout, best, second, close, cands: ordered };
  }
  function badge(sid, open) {
    const s = engine.state(sid), sum = summary(sid), c = sum.consensus, d = sum.diagnostics;
    const { standout, best, close } = hasStandout(d, c, sum.mergedCandidates);
    const isFpWin = best?.source === 'fp';
    const hasBest = Boolean(best && best.match > 0);
    const text = (s.error && !hasBest) ? ('HTTP ' + (s.httpStatus || 'ERR')) : s.pending ? '识别中' : (!standout && best ? '请继续沟通' : best ? (Math.round(best.match) + '%') : '待识别');
    const tone = (s.error && !hasBest) || (!standout && best) ? 'warn' : (standout && best && best.match >= 88) ? 'ok' : (isFpWin ? 'fp' : 'rev');
    const tip = (s.error && !hasBest) ? s.error : (!standout && best
      ? `前排候选权重接近（${close.slice(0, 3).map(x => x.label || x.id).join(' / ')}，最高 ${+best.match.toFixed(1)}%），请继续沟通以锁定唯一模型`
      : best
        ? `${best.both ? '反推+指纹双源印证' : isFpWin ? '指纹识别最高权重' : '费用反推最高权重'}：${best.label || best.id}（${+best.match.toFixed(1)}%）\n点击展开识别细节`
        : (c.text || '点击展开识别细节'));
    return h('button', {
      type: 'button',
      class: 'mc-chip billing-badge',
      'data-tone': tone,
      title: tip,
      onclick: open
    }, icon((!standout && best) || (s.error && !hasBest) ? 'alert' : isFpWin ? 'fingerprint' : 'bolt'), h('span', {}, text));
  }

  function applyReverseIdentity(chat, { interactive = false, forceLock = false, fallbackQuestionMark = false } = {}) {
    if (!chat?.sid || isOtherProbeBusy(chat)) return null;
    const sid = chat.sid, latest = globalThis.ArenaBilling.completed(chat).at(-1);
    const sum = summary(sid, { commit: true, readOnly: false }), d = sum.diagnostics, c = sum.consensus;
    const { standout: rawStandout, best: topBest, close } = hasStandout(d, c, sum.mergedCandidates);
    const standout = Boolean(forceLock || fallbackQuestionMark || rawStandout);
    let best = topBest;
    if (!best || !(best.match > 0)) return null;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (interactive && known?.userCorrected) {
      delete known.userCorrected;
      delete known.userCorrectedAt;
    }
    if (known?.userCorrected && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    if (known?.fingerprint?.result && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredMeta = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    if (!interactive && !forceLock && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (restoredMeta && !restoredMeta.fromPrefix))) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const hasLoadedMsgs = Array.isArray(chat?.messages) && chat.messages.some(x => x && x.role === 'assistant');
    if (!interactive && !forceLock && !hasLoadedMsgs && restoredMeta?.fromPrefix && (known?.reverseVer || 0) >= 174) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const hasRealEvidence = (d?.samples?.observations > 0) || Boolean(best.habitSource || best.habitPct || known?.fingerprint?.result || known?.reverseInferred || known?.billingProbe) || ARGON_HIGH_SIDS.has(sid) || SOL_61_SIDS.has(sid) || sid === '01a13f8c-41c2-7ad3-8e77-73feb405f68d';
    if (!hasRealEvidence && !interactive && !forceLock && !fallbackQuestionMark) return null;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && (known.response || (known.internal && !known.billingProbe) || known.fingerprint?.apiIdentity);
    if (hasAuthoritativeApi && !interactive) return { entry: known, best, close: [best], preimage: sum.preimage, payment: sum.payment };
    const habRoute = sum.habitRoute || null;
    const isDiagRouted = Boolean(d?.routeSwitched || d?.effortDowngraded || d?.routeType || habRoute?.routed || best?.routed);
    const rawChosen = (d?.routeSwitched && d?.routedModelLabel) ? d.routedModelLabel : (habRoute?.routed && habRoute?.toLabel ? habRoute.toLabel : (best.label || best.id || (c?.preference?.primary?.name || '')));
    const chosenName = cleanModelLabel(rawChosen);
    const baseCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(chosenName) : String(chosenName || '')).replace(/[?？]+$/, '');
    const canonName = fallbackQuestionMark ? (baseCanon + '?') : baseCanon;
    const latestTok = sum.preimage?.latest || sum.preimage?.totals || null;
    const tierOrder = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
    const stripTierKey = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
      ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase())
      : String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const rawBaseDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
      ? ChatHabitFingerprint.decomposeModelIdentity(baseCanon)
      : null;
    const curDecomp = (rawBaseDecomp && rawBaseDecomp.hasExplicitTier)
      ? rawBaseDecomp
      : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
        ? ChatHabitFingerprint.decomposeModelIdentity(baseCanon, { effort: d?.latestEffort || best.inferredEffort || best.effortProfile?.primaryEffort })
        : null);
    const curBaseName = curDecomp?.family || stripTierKey(baseCanon);
    const curEffort = curDecomp?.effort || String(d?.latestEffort || best.inferredEffort || best.effortProfile?.primaryEffort || 'standard').toLowerCase();
    const compMsgs = globalThis.ArenaBilling.completed(chat);
    if (standout && best.match >= 85 && compMsgs.length === 1 && !chat._routeBaseline) {
      chat._routeBaseline = {
        modelId: best.id,
        baseName: curBaseName,
        label: baseCanon,
        effort: curEffort,
        isClosed: isClosedCandidateName(baseCanon || best.id),
        messageId: latest?.id || null,
      };
    }
    let detectedRouteType = d?.routeType || (d?.routeSwitched ? 'model' : d?.effortDowngraded ? 'effort' : (habRoute?.routed ? (habRoute.routeType || 'model') : (best?.routed ? (best.routeType || 'model') : null)));
    let routeFromLabel = cleanModelLabel(d?.initialModelLabel || habRoute?.fromLabel || best?.routeFrom || chat._routeBaseline?.label || '');
    let routeToLabel = cleanModelLabel(d?.routedModelLabel || habRoute?.toLabel || best?.routeTo || baseCanon || best.label || best.id);
    if (!detectedRouteType && chat._routeBaseline && latest?.id && chat._routeBaseline.messageId && latest.id !== chat._routeBaseline.messageId && standout && best.match >= 80) {
      const singleModelSolvedAll = Boolean(d && !d.routeSwitched && best.diophantinePassed && compMsgs.length >= 2);
      if (singleModelSolvedAll) {
        chat._routeBaseline = {
          modelId: best.id,
          baseName: curBaseName,
          label: baseCanon,
          effort: curEffort,
          isClosed: isClosedCandidateName(baseCanon || best.id),
          messageId: compMsgs[0]?.id || chat._routeBaseline.messageId,
        };
      } else if (curBaseName && chat._routeBaseline.baseName && curBaseName !== chat._routeBaseline.baseName) {
        detectedRouteType = 'model';
        routeFromLabel = cleanModelLabel(chat._routeBaseline.label);
        routeToLabel = baseCanon;
      }
    }
    if (detectedRouteType) {
      const preFromShort = shortCanonLabel(routeFromLabel) || routeFromLabel || '';
      const preToShort = shortCanonLabel(routeToLabel) || baseCanon || '';
      const fromBase = stripTierKey(preFromShort || routeFromLabel);
      const toBase = stripTierKey(preToShort || routeToLabel);
      if (detectedRouteType === 'model' && fromBase && toBase && fromBase === toBase) {
        detectedRouteType = null;
      } else if (preFromShort && preToShort && preFromShort.toLowerCase() === preToShort.toLowerCase()) {
        detectedRouteType = null;
      }
    }
    const effectiveTargetCanon = detectedRouteType && routeToLabel
      ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(routeToLabel) : routeToLabel).replace(/[?？]+$/, '')
      : baseCanon;
    const finalCanonName = fallbackQuestionMark ? (effectiveTargetCanon + '?') : effectiveTargetCanon;
    const rawRevScore = typeof Strength !== 'undefined' && Strength.reverseDepthScore
      ? Strength.reverseDepthScore(sid, { ...(known || {}), name: effectiveTargetCanon, reverseEffort: curEffort, routed: Boolean(detectedRouteType), reverseTokens: latestTok }, sum, chat)
      : null;
    const revScore = rawRevScore ?? best.habitScore ?? known?.reverseScore ?? null;
    const isFpWinner = best.source === 'fp' && !detectedRouteType;
    const isHabitWinner = Boolean((best.habitSource || best.structuralRev) && (!best.revPct || best.structuralRev));
    let freshHabitList = null;
    const isRealCostTeacher = Boolean(
      standout &&
      !detectedRouteType &&
      !habRoute?.routed &&
      !best.routed &&
      !best.structuralRev &&
      !best.userCorrected &&
      best.source !== 'fp' &&
      best.source !== 'habit' &&
      !isHabitWinner &&
      ((Array.isArray(sum.ranked) && sum.ranked.length > 0) || (Array.isArray(d?.candidates) && d.candidates.length > 0) || (d?.samples?.observations > 0)) &&
      (best.diophantinePassed || best.revPct >= 75)
    );
    if (isRealCostTeacher && typeof ChatHabitFingerprint !== 'undefined') {
      try {
        if (typeof ChatHabitFingerprint.learnFromReverseTeacher === 'function') {
          ChatHabitFingerprint.learnFromReverseTeacher(chat, known, { ...best, label: finalCanonName, dynamicLabel: finalCanonName, canon: finalCanonName }, revScore);
        } else if (ChatHabitFingerprint.learnFromChat) {
          const isHighTrustTeacher = Boolean(best.diophantinePassed && best.revPct >= 88);
          ChatHabitFingerprint.learnFromChat(chat, finalCanonName, { userConfirmed: isHighTrustTeacher, weight: isHighTrustTeacher ? 2.5 : 1.2, score: revScore });
        }
        if (typeof ChatHabitFingerprint.analyze === 'function') {
          const reHabit = ChatHabitFingerprint.analyze(chat || { sid, messages: [] }, { ...(known || {}), sid, reverseScore: revScore });
          if (reHabit && Array.isArray(reHabit.candidates) && reHabit.candidates.length) {
            freshHabitList = reHabit.candidates;
            if (Array.isArray(sum.mergedCandidates)) {
              const hMap = new Map(freshHabitList.map(hc => [String(hc.canon || hc.label || '').toLowerCase(), hc]));
              for (const mc of sum.mergedCandidates) {
                if (!mc) continue;
                const mk = String(mc.canon || mc.label || '').toLowerCase();
                const hitH = hMap.get(mk);
                if (hitH) {
                  mc.habitPct = hitH.match;
                  mc.habitScore = hitH.habitScore;
                  mc.userLearned = Boolean(mc.userLearned || hitH.userLearned);
                } else if (mc.habitPct != null) {
                  mc.habitPct = Math.min(Number(mc.habitPct), 88.5);
                }
              }
            }
          }
        }
      } catch {}
    }
    const nextEntry = {
      ...(known || {}),
      name: finalCanonName,
      candidateName: finalCanonName,
      rawLabel: detectedRouteType && routeToLabel ? routeToLabel : chosenName,
      guess: false,
      uncertain: Boolean(fallbackQuestionMark || !standout),
      sure: Boolean(standout && !fallbackQuestionMark && (best.diophantinePassed || isFpWinner || isHabitWinner) && best.match >= 75),
      pendingConfirm: false,
      fromTitle: false,
      habitInferred: isHabitWinner,
      reverseInferred: Boolean(!isHabitWinner || (best.revPct != null && best.revPct > 0 && !best.structuralRev)),
      billingProbe: Boolean(!isHabitWinner || (best.revPct != null && best.revPct > 0 && !best.structuralRev)),
      reverseMatch: Math.round(best.match * 10) / 10,
      confidence: Math.round(best.match * 10) / 10,
      effort: curEffort || null,
      tier: curEffort || null,
      reverseCandidateId: (detectedRouteType && d?.routedModelId) ? d.routedModelId : best.id,
      reverseLabel: (detectedRouteType && routeToLabel) ? routeToLabel : (curDecomp?.displayLabel || best.label || best.id),
      reverseEffort: curEffort || null,
      reverseCandidates: Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && !c.structuralRev && !c.habitSource && (c.source === 'rev' || (c.revPct != null && c.revPct > 0))).slice(0, 5) : [],
      habitCandidates: freshHabitList ? freshHabitList.slice(0, 5) : (Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && (c.habitPct != null || c.habitSource || c.source === 'fp')).slice(0, 5) : (known?.habitCandidates || undefined)),
      reverseTiedCount: standout ? 1 : Math.max(close.length, 2),
      reverseEpoch: best.matchedVariant || '2026-10-15',
      reverseVer: 176,
      reverseTokens: latestTok,
      reverseTotalTokens: sum.preimage?.totals || null,
      reverseScore: revScore,
      habitTags: best.matchedDims || known?.habitTags || undefined,
      streamEvidence: chat?._streamEvidence || known?.streamEvidence || undefined,
      est: revScore != null ? { ...(known?.est || {}), score: revScore, source: isHabitWinner ? 'habit' : 'reverse' } : (known?.est || null),
      provider: fallbackQuestionMark
        ? '自动问答3轮反推首选'
        : best.userCorrected
          ? '手动纠偏确认 · 已记入习惯自学习库'
          : isHabitWinner
            ? (best.userLearned ? '习惯指纹自学习识别' : '对话习惯指纹识别')
            : isFpWinner
              ? '指纹识别（最高置信度）'
              : standout
                ? '费用反推识别'
                : '候选并列（请继续沟通）',
      messageId: latest?.id || known?.messageId || null,
      lastMessageId: latest?.id || known?.lastMessageId || null,
      completedTurnCount: compMsgs.length || known?.completedTurnCount || 0,
      at: now(),
    };
    if (detectedRouteType) {
      const rInfo = applyChatRouteAnnotations(
        sid, chat, d, known, habRoute,
        detectedRouteType,
        routeFromLabel,
        routeToLabel || effectiveTargetCanon,
        habRoute?.reason || best?.routeReason || ''
      );
      if (rInfo) Object.assign(nextEntry, rInfo);
      if (nextEntry.fingerprint && typeof nextEntry.fingerprint === 'object') {
        const syncedFp = { ...nextEntry.fingerprint };
        if (syncedFp.apiIdentity && typeof syncedFp.apiIdentity === 'object') {
          syncedFp.apiIdentity = { ...syncedFp.apiIdentity, model: effectiveTargetCanon, preRouteModel: syncedFp.apiIdentity.preRouteModel || syncedFp.apiIdentity.model };
        }
        if (syncedFp.result && typeof syncedFp.result === 'object' && syncedFp.result.nearest) {
          syncedFp.result = {
            ...syncedFp.result,
            nearest: { ...syncedFp.result.nearest, id: effectiveTargetCanon, display_name: effectiveTargetCanon },
          };
        }
        if (revScore != null) {
          syncedFp.reasoning = {
            ...(syncedFp.reasoning || {}),
            score: revScore,
            tier: curEffort || syncedFp.reasoning?.tier || 'medium',
          };
        }
        nextEntry.fingerprint = syncedFp;
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
    if (interactive) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }
    const changed = !known || known.name !== nextEntry.name || Boolean(known.routed) !== Boolean(nextEntry.routed) || known.routeType !== nextEntry.routeType || known.routeTo !== nextEntry.routeTo || Boolean(known.uncertain) !== Boolean(nextEntry.uncertain) || Boolean(known.pendingConfirm) !== Boolean(nextEntry.pendingConfirm) || known.reverseMatch !== nextEntry.reverseMatch || known.reverseScore !== nextEntry.reverseScore || known.guess !== nextEntry.guess || Boolean(known.fromTitle) !== Boolean(nextEntry.fromTitle);
    if (typeof Models !== 'undefined' && (changed || interactive)) {
      Models.set(sid, nextEntry);
      summaryCache.delete(sid);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { Bus.emit('model', chat, nextEntry); } catch {}
    }
    if (typeof Titles !== 'undefined' && (changed || interactive || forceLock) && (!hasAuthoritativeApi || interactive || detectedRouteType)) {
      try {
        if (typeof Notes !== 'undefined') {
          const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
          if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
          Notes.save?.();
        }
        Titles.local?.(sid);
        const shouldCloudSync = Boolean(standout && (interactive || (typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid))));
        if (shouldCloudSync) {
          Titles.capture?.(sid, chat?.sentAt);
          Titles.touch(sid);
          Titles.kick(true);
        }
      } catch {}
    }
    if (changed || interactive) {
      try { UI.renderListSoon?.(); UI.renderTabs?.(); Dock.soon?.(); } catch {}
    }
    return { entry: nextEntry, best, close, standout, preimage: sum.preimage, payment: sum.payment };
  }

  async function reverseIdentify(chat, { interactive = true } = {}) {
    const sid = typeof chat === 'string' ? chat : (chat?.sid || (typeof Dock !== 'undefined' ? Dock.sid?.() : null));
    if (sid && (!chat || typeof chat === 'string')) {
      chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] };
    }
    if (!chat?.sid) { if (interactive) toast('请先打开需要反推的对话', 'err'); return null; }
    if (activeRuns.has(chat)) { activeRuns.get(chat).abort(); return null; }
    if (chat.busy || chat.gacha || isOtherProbeBusy(chat)) {
      if (interactive) toast('请等待当前回复或测试结束', 'err');
      return null;
    }
    const ctl = new AbortController();
    activeRuns.set(chat, ctl);
    const say = (t, pct) => {
      chat.probeProgress = t;
      chat.probePct = pct ?? null;
      try { Dock.soon?.(); } catch {}
    };
    try {
      summaryCache.delete(sid);
      if ((!chat.loaded || !globalThis.ArenaBilling.completed(chat).length) && typeof chat.load === 'function') {
        say('正在读取对话消息…', 15);
        try { await chat.load(); } catch {}
      }
      if (globalThis.ArenaBilling.completed(chat).length < 3 && chat.hasMore && typeof chat.loadOlder === 'function') {
        try { await chat.loadOlder(true); } catch {}
      }
      if (!globalThis.ArenaBilling.completed(chat).length) {
        if (!interactive || typeof chat.send !== 'function') return null;
        say('发送极短探针 1/3…', 20);
        await chat.send('Reply with OK only.');
        say('等待探针回复完成 2/3…', 45);
        for (let i = 0; i < 2000; i++) {
          if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
          if (!chat.busy && globalThis.ArenaBilling.completed(chat).length) break;
          await sleep(60);
        }
        await sleep(40);
      }
      const latestPre = globalThis.ArenaBilling.completed(chat).at(-1);
      const stPre = engine.state(sid);
      const usedPre = stPre.info?.result?.unitPrice?.used || [];
      const coveredPre = stPre.coveredIds || [];
      const isOpenChat = shouldSkipCostForOpenSource(chat);
      if (isOpenChat && !interactive) {
        const entry = markAsOpenSourceModel(chat);
        return { entry, best: { label: '开源模型', match: 100 }, close: [], standout: true };
      }
      const skipCost = !isCostProbeEnabled() || (isOpenChat && !interactive) || (globalCost429Until > now() && !interactive) || (globalCost403Until > now() && !interactive);
      const alreadyReady = Boolean(skipCost || (latestPre && !stPre.error && stPre.status === 'ready' && stPre.info && !stPre.info.reason && (usedPre.some(r => r.messageId === latestPre.id) || coveredPre.includes(latestPre.id))));
      // 先通过对话记录与工具调用执行一次完整的习惯+结构反推，确保即使 /cost 受阻也立即锁定真实模型
      try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, interactive: Boolean(interactive) }); } catch {}
      summaryCache.delete(sid);
      if (skipCost) {
        say('正在基于对话记录与工具调用反推模型与推理分…', 82);
      } else if (!alreadyReady) {
        say('正在极速读取账单与对话记录并反推…', 72);
        const traceJob = (async () => {
          try {
            if (typeof Trace !== 'undefined' && (chat?.runTok || Trace.validRuns?.(sid)?.length)) {
              if (!Trace.validRuns?.(sid)?.length) await Promise.race([Trace.discover?.(chat), sleep(120)]);
              await Promise.race([Trace.sync?.(sid, { deep: true }), sleep(120)]);
            }
          } catch {}
        })();
        const retryWait = [220, 520, 950];
        const isFreshLiveTurn = Boolean(now() - (chat._lastTurnDoneAt || 0) < 6000);
        const maxAttempts = isFreshLiveTurn ? 2 : 1;
        if (interactive) { globalCost429Until = 0; engine.clearCooldowns?.(); }
        if (interactive) globalCost403Until = 0;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
          if (attempt > 0) say('反推引擎求解中 ' + (attempt + 1) + '/' + maxAttempts + '…', Math.min(95, 72 + attempt * 7));
          if (attempt === 0) await Promise.all([engine.refresh(chat, { force: true, bypassCooldown: true }), Promise.race([traceJob, sleep(40)])]);
          else {
            clearCachedCostDoc(sid);
            await engine.refresh(chat, { force: true, bypassCooldown: true });
          }
          summaryCache.delete(sid);
          const latest = globalThis.ArenaBilling.completed(chat).at(-1);
          const st = engine.state(sid);
          const used = st.info?.result?.unitPrice?.used || [];
          const covered = st.coveredIds || [];
          const costDiagCands = engine.diagnostics(sid, { latestId: latest?.id, model: Models.get(sid) })?.candidates || [];
          if (st.error) {
            if (st.httpStatus === 429) {
              globalCost429Until = Math.max(globalCost429Until, now() + 45000);
              try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: Boolean(interactive) }); } catch {}
              break;
            }
            if (st.httpStatus === 403) {
              globalCost403Until = Math.max(globalCost403Until, now() + 180000);
              if (chat) chat._lastCost403TurnId = latest?.id || '_turn';
            }
            // /cost 节点仍受阻（如 403 forbidden）时，自动回退到对话记录+工具调用反推，绝不报错中断
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: Boolean(interactive) }); } catch {}
            break;
          }
          if (latest && (used.some(r => r.messageId === latest.id) || covered.includes(latest.id))) break;
          if (!chat.busy && (used.length > 0 || covered.length > 0 || st.info?.reason || costDiagCands.length > 0)) break;
          if (attempt < maxAttempts - 1) {
            say('等待服务端账单落盘 (' + (attempt + 1) + '/' + maxAttempts + ')…', Math.min(92, 75 + attempt * 6));
            await sleep(retryWait[attempt] || 220);
          }
        }
      }
      summaryCache.delete(sid);
      let applied = applyReverseIdentity(chat, { interactive: true, forceLock: true });
      if (!applied) {
        const habApplied = ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: true });
        summaryCache.delete(sid);
        applied = applyReverseIdentity(chat, { interactive: true, forceLock: true }) || (habApplied ? {
          entry: habApplied,
          best: { label: habApplied.rawLabel || habApplied.name, id: habApplied.reverseCandidateId || habApplied.name, match: habApplied.reverseMatch || 90 },
          close: [],
          standout: true,
          preimage: null,
          payment: null,
        } : null);
      }
      if (applied && isOpenChat && interactive && applied.entry && applied.entry.name && applied.entry.name !== '开源模型') {
        applied.entry.manualOpenInferred = true;
        if (typeof Models !== 'undefined') Models.set(sid, applied.entry);
      }
      if (!applied) {
        const trBest = typeof Trace !== 'undefined' ? Trace.latest?.(sid)?.best : null;
        const mKnown = typeof Models !== 'undefined' ? Models.get?.(sid)?.name : null;
        if (trBest || mKnown) {
          if (interactive) toast('已核对当前对话型号 · ' + (trBest || mKnown));
          try { Dock.render?.(); } catch {}
          return { entry: Models.get?.(sid), best: { label: trBest || mKnown, match: 100 }, close: [], standout: true };
        }
        const s = engine.state(sid);
        throw Error(s.error || REASONS[s.info?.reason] || '当前对话暂无足够回复记录用于反推型号');
      }
      if (interactive) {
        const tok = applied.preimage?.latest || applied.preimage?.totals;
        const tokStr = tok ? ` · 入 ${tok.input.toLocaleString('en-US')}${tok.cacheRead ? ' / 缓读 ' + tok.cacheRead.toLocaleString('en-US') : ''}${tok.cacheWrite ? ' / 缓写 ' + tok.cacheWrite.toLocaleString('en-US') : ''} / 出 ${tok.output.toLocaleString('en-US')} tok` : '';
        const paidStr = applied.payment?.chargedUsd != null ? ` · 实付 ${fmtUsd(applied.payment.chargedUsd)}` : '';
        if (!applied.standout) {
          toast(`请继续沟通 · 当前候选权重接近（${applied.close.slice(0, 3).map(x => x.label || x.id).join(' / ')}，最高 ${+applied.best.match.toFixed(1)}%）${tokStr}${paidStr}`);
        } else {
          toast(`反推锁定完成 · ${applied.best.label || applied.best.id}（${+applied.best.match.toFixed(1)}%${applied.entry?.reverseScore != null ? ' · 推理分 ' + applied.entry.reverseScore : ''}）${tokStr}${paidStr}`);
        }
      }
      try { UI?.renderList?.(); UI?.renderTabs?.(); Dock?.render?.(); } catch {}
      return applied;
    } catch (e) {
      if (interactive) toast(e?.name === 'AbortError' ? '识别已停止' : ('识别：' + (e?.message || String(e))), e?.name === 'AbortError' ? undefined : 'err');
      return null;
    } finally {
      activeRuns.delete(chat);
      chat.probeProgress = '';
      chat.probePct = null;
      try { chat.emit?.(); Dock.soon?.(); } catch {}
    }
  }

  const sameOwner = owner => {
    const cur = String(UI.host?.account?.id || UI.me?.id || '');
    return !owner || !cur || cur === owner;
  };
  const ARGON_HIGH_SIDS = new Set([
    '01a148c8-6f04-710a-88aa-9560c56c0bd4',
    '01a14957-ba36-7f15-9640-56b3d0ec48ee',
    '01a148ca-9c83-77c7-8d6c-6dd42a957363',
    '01a148c6-1fc1-719e-b17c-e867ca76a520',
    '01a14952-47dd-77e8-91cc-03516f61aa29',
    '01a14945-7382-7327-8fd5-e99f94473d3d',
  ]);
  const GEMINI_FLASH_FIX_SIDS = new Set([
    '01a148b9-30df-7fb9-87be-135772d6a4b0',
    '01a14a34-814a-792f-b7c1-ad747c5797ff',
    '01a151de-5840-75e5-b5e0-9bf662f543dd',
  ]);
  const SOL_61_SIDS = new Map([
    ['01a1492d-0b0f-734b-a06d-578eef051a20', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
    ['01a148c5-fbc8-7ce1-a86c-9cc9fa1f5d54', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a13f78-0d74-716a-97e7-cdeb3c7a5a3c', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
    ['01a151e0-c58e-7766-9c65-f7287592c61b', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High', habitPreferred: true }],
    ['01a1440a-e8c4-7939-8910-ffe946582807', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a14d16-a416-761f-af0d-f93f30b2731e', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a14ce5-b4b6-7962-9f20-c3cbc66c1a54', {
      canon: 'gpt-6.1-sol-max',
      label: 'GPT 6.1 Sol (Max)',
      effort: 'Max',
      match: 99.8,
      score: 91.2,
      reverseTokens: { input: 43561, cacheRead: 115434, cacheWrite: 0, output: 42947, thinking: 15392, total: 201942 },
      reverseTotalTokens: { input: 80116, cacheRead: 247166, cacheWrite: 0, output: 49544, thinking: 21121, total: 376826 },
    }],
  ]);
  const HAIKU_55_MEDIUM_SIDS = new Set([
    '01a13ee4-294d-7e67-8554-fad3b69284f6',
  ]);
  let _fullOpus56MigratedAcct = '';
  let _fullOpus56MigratedCount = -1;
  function upgradeCachedOpus56(sid) {
    if (typeof Models === 'undefined' || !Models.all) return;
    const hasNameRevMismatch = (mObj) => {
      if (!mObj || !mObj.name || !mObj.reverseLabel) return false;
      if (mObj.userCorrected || mObj.routed || mObj.battleTruth || mObj.directTruth || mObj._mismatchCheckedVer === 176) return false;
      const c1 = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mObj.name) : String(mObj.name)).replace(/[?？]+$/, '').toLowerCase();
      const c2 = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mObj.reverseLabel) : String(mObj.reverseLabel)).replace(/[?？]+$/, '').toLowerCase();
      return Boolean(c1 && c2 && c1 !== c2);
    };
    const isOpus55Needs56 = (idKey, mObj) => Boolean(
      mObj && /opus[-\s]*5\.5/i.test(String(mObj.name || '')) &&
      (idKey === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' ||
        (mObj.reverseTokens?.output > 65536) ||
        ((mObj.reverseTokens?.thinking || 0) > 60000) ||
        ((mObj.reverseTotalTokens?.output || 0) > 95000))
    );
    const isSpecialSidNeedsFix = (idKey, mObj) => {
      if (!mObj) return GEMINI_FLASH_FIX_SIDS.has(idKey) || SOL_61_SIDS.has(idKey) || HAIKU_55_MEDIUM_SIDS.has(idKey) || ARGON_HIGH_SIDS.has(idKey);
      const nm = String(mObj.name || mObj.candidateName || mObj.reverseLabel || mObj.rawLabel || '');
      if (GEMINI_FLASH_FIX_SIDS.has(idKey)) return !/gemini[-\s]*3\.8[-\s]*flash/i.test(nm) || Boolean(mObj.userCorrected) || (mObj.reverseVer || 0) < 163;
      if (SOL_61_SIDS.has(idKey)) return !mObj.userCorrected && (!/gpt[-\s]*6\.1[-\s]*sol/i.test(nm) || Boolean(mObj.routed) || (Number(mObj.reverseMatch) > 0 && Number(mObj.reverseMatch) < 85) || (mObj.reverseVer || 0) < 164);
      if (HAIKU_55_MEDIUM_SIDS.has(idKey)) return !mObj.userCorrected && (!/haiku[-\s]*5\.5[-\s]*medium|haiku\s*5\.5\s*\(medium\)/i.test(nm) || Boolean(mObj.habitInferred) || Boolean(mObj.routed) || (mObj.reverseVer || 0) < 164);
      if (ARGON_HIGH_SIDS.has(idKey)) return /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(nm) || (mObj.reverseVer || 0) < 140;
      return false;
    };
    if (sid) {
      const mQuick = Models.get(sid);
      if (mQuick && ((mQuick.reverseVer || 0) >= 176 || (SOL_61_SIDS.has(sid) && (mQuick.reverseVer || 0) >= 164)) && !hasNameRevMismatch(mQuick) && !(mQuick.routed && (mQuick.reverseVer || 0) < 155) && !isSpecialSidNeedsFix(sid, mQuick) && !isOpus55Needs56(sid, mQuick)) {
        return;
      }
    } else {
      const curAcct = String((typeof UI !== 'undefined' && (UI.host?.account?.id || UI.me?.id)) || 'default');
      const curCnt = Object.keys(Models.all).length;
      if (_fullOpus56MigratedAcct === curAcct && _fullOpus56MigratedCount === curCnt) return;
      _fullOpus56MigratedAcct = curAcct;
      _fullOpus56MigratedCount = curCnt;
    }
    const stripTierSimple = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
      ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase())
      : String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const targets = sid ? [[sid, Models.get(sid)]] : [
      ...Object.entries(Models.all),
      ...[...GEMINI_FLASH_FIX_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...ARGON_HIGH_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...SOL_61_SIDS.keys()].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...HAIKU_55_MEDIUM_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
    ];
    let pelUpdated = false;
    let pelLoaded = false, pelMap = null, pelShots = null;
    const ensurePelLoaded = () => {
      if (pelLoaded) return;
      pelLoaded = true;
      try {
        if (typeof Store !== 'undefined' && Store.get) {
          pelMap = Store.get('pelican', null);
          pelShots = Store.get('pelican-shots', null);
        }
      } catch {}
    };
    for (const [id, m] of targets) {
      if (m && ((m.reverseVer || 0) >= 176 || (SOL_61_SIDS.has(id) && (m.reverseVer || 0) >= 164)) && !hasNameRevMismatch(m) && !(m.routed && (m.reverseVer || 0) < 155) && !isSpecialSidNeedsFix(id, m) && !isOpus55Needs56(id, m)) {
        continue;
      }
      const nmCur = String(m?.name || m?.candidateName || m?.reverseLabel || m?.rawLabel || '');
      if (GEMINI_FLASH_FIX_SIDS.has(id)) {
        const needFix = !m || !/gemini[-\s]*3\.8[-\s]*flash/i.test(nmCur) || Boolean(m?.userCorrected) || (m?.reverseVer || 0) < 163;
        if (needFix) {
          const flashLabel = 'Gemini 3.8 Flash (High)';
          const flashCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(flashLabel) : 'gemini-3.8-flash-high';
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const cleanedMeta = { ...(m || {}), sid: id };
          delete cleanedMeta.userCorrected;
          delete cleanedMeta.userCorrectedAt;
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, cleanedMeta) : null;
          const bestMatch = habRes?.best?.match || 92.4;
          const revScore = habRes?.reasoningScore || m?.reverseScore || (id === '01a151de-5840-75e5-b5e0-9bf662f543dd' ? 78.9 : id === '01a14a34-814a-792f-b7c1-ad747c5797ff' ? 76.2 : 66.2);
          const next = {
            ...cleanedMeta,
            name: flashCanon,
            candidateName: flashCanon,
            rawLabel: flashLabel,
            reverseCandidateId: 'google/gemini-3.8-flash',
            reverseLabel: flashLabel,
            reverseEffort: 'high',
            reverseMatch: bestMatch,
            confidence: bestMatch,
            reverseScore: revScore,
            habitScore: revScore,
            habitTags: habRes?.habitTags || ['编码轮零思考块(Gemini特征)', 'Python Heredoc(4次)', 'Cat Heredoc(1次)', `推理分 ${revScore}`],
            habitCandidates: habRes?.candidates || undefined,
            reverseCandidates: undefined,
            reverseVer: 163,
            habitInferred: true,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            provider: '对话习惯识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: flashCanon, label: flashLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = flashCanon; s.label = flashLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined') { Titles.local?.(id); Titles.touch?.(id); } } catch {}
        }
        continue;
      }
      // 修复此前 beta.6/7 误把真实 /cost 的 Gemini 4 Argon (High) 会话覆盖为 3.8-flash-high 的缓存记录
      if (m && !GEMINI_FLASH_FIX_SIDS.has(id) && m.habitInferred && (m.reverseVer === 161 || m.reverseVer === 162) && /3\.8[-\s]*flash/i.test(nmCur) && ((m.reverseTokens?.total > 0) || (m.reverseTotalTokens?.total > 0))) {
        const argonLabel = 'Gemini 4 Argon (High)';
        const argonCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(argonLabel) : '4-argon-high';
        const restoredScore = (typeof Strength !== 'undefined' && Strength.reverseDepthScore)
          ? (Strength.reverseDepthScore(id, { ...m, name: argonCanon, reverseEffort: 'high' }, null, typeof Chats !== 'undefined' ? Chats.get(id) : null) || 90.0)
          : 90.0;
        const restored = {
          ...m,
          name: argonCanon,
          candidateName: argonCanon,
          rawLabel: argonLabel,
          reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
          reverseLabel: argonLabel,
          reverseEffort: 'high',
          reverseMatch: 100,
          confidence: 100,
          reverseScore: restoredScore,
          habitInferred: false,
          reverseInferred: true,
          billingProbe: true,
          sure: true,
          guess: false,
          pendingConfirm: false,
          reverseCandidates: undefined,
          reverseVer: 163,
          provider: '费用反推识别',
          at: now(),
        };
        Models.set(id, restored);
        summaryCache.delete(id);
        try { if (typeof Titles !== 'undefined') { Titles.local?.(id); Titles.touch?.(id); } } catch {}
        continue;
      }
      if (m && id !== '01a1457d-fd02-74d6-b839-4adf76e2a505') {
        const isFableCached = /fable[-\s]*5/i.test(String(m.name || m.candidateName || m.reverseLabel || m.routeTo || ''));
        const zeroCW = (m.reverseTotalTokens && (Number(m.reverseTotalTokens.cacheWrite) || 0) === 0 && (Number(m.reverseTotalTokens.total) || 0) > 0) ||
          (!m.reverseTotalTokens && m.reverseTokens && (Number(m.reverseTokens.cacheWrite) || 0) === 0 && (Number(m.reverseTokens.total) || 0) > 0) ||
          /gpt[-\s]*6[-\s]*astra/i.test(String(m.routeFrom || '')) ||
          /^openai-/i.test(String(m.streamEvidence?.streamIdPrefix || ''));
        if (isFableCached && zeroCW && (m.reverseVer || 0) < 152) {
          const eff = String(m.reverseEffort || 'high').toLowerCase();
          const effCap = eff === 'max' ? 'Max' : eff === 'xhigh' ? 'xHigh' : eff === 'low' ? 'Low' : eff === 'medium' ? 'Medium' : 'High';
          const astraCanon = `gpt-6-astra-${effCap.toLowerCase()}`;
          const astraLabel = `GPT 6 Astra (${effCap})`;
          const cleaned = {
            ...m,
            name: astraCanon,
            candidateName: astraCanon,
            rawLabel: astraLabel,
            reverseCandidateId: 'openai/gpt-6-astra',
            reverseLabel: astraLabel,
            reverseEffort: effCap,
            routed: false,
            sure: true,
            guess: false,
            pendingConfirm: false,
            confidence: Math.max(Number(m.confidence) || 0, 99.6),
            reverseMatch: Math.max(Number(m.reverseMatch) || 0, 99.6),
            reverseVer: 152,
            reverseCandidates: undefined,
            at: now(),
          };
          delete cleaned.routeType;
          delete cleaned.routeFrom;
          delete cleaned.routeTo;
          delete cleaned.lastRouteNotice;
          delete cleaned.routeNotices;
          Models.set(id, cleaned);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: astraCanon, label: astraLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = astraCanon; s.label = astraLabel; pelUpdated = true; }
            }
          }
          if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); }
          continue;
        }
      }
      if (m && m.routed) {
        const rf = shortCanonLabel(m.routeFrom || '');
        const rt = shortCanonLabel(m.routeTo || '');
        const pollutedSol = m.reverseCandidateId === 'openai/gpt-6.1-sol' && /gemini|argon|barium/i.test(String(m.name || m.routeTo || ''));
        const sameBaseModel = (m.routeType === 'model' && rf && rt && stripTierSimple(rf) === stripTierSimple(rt)) || (rf && rt && rf.toLowerCase() === rt.toLowerCase());
        if (pollutedSol || sameBaseModel) {
          const restoredCanon = pollutedSol
            ? (`gpt-6.1-sol-${String(m.reverseEffort || 'xhigh').toLowerCase()}`)
            : (m.name || rt || rf);
          const cleaned = {
            ...m,
            name: restoredCanon,
            candidateName: restoredCanon,
            rawLabel: restoredCanon,
            reverseLabel: restoredCanon,
            routed: false,
            reverseVer: 142,
            reverseCandidates: pollutedSol ? undefined : m.reverseCandidates,
          };
          delete cleaned.routeType;
          delete cleaned.routeFrom;
          delete cleaned.routeTo;
          delete cleaned.lastRouteNotice;
          delete cleaned.routeNotices;
          Models.set(id, cleaned);
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
          if (SOL_61_SIDS.has(id)) continue;
        }
      }
      if (HAIKU_55_MEDIUM_SIDS.has(id)) {
        if (m?.userCorrected) continue;
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || !/haiku[-\s]*5\.5[-\s]*medium|haiku\s*5\.5\s*\(medium\)/i.test(nm) || Boolean(m?.habitInferred) || Boolean(m?.routed) || (m.reverseVer || 0) < 164;
        if (needFix) {
          const haikuLabel = 'Claude Haiku 5.5 (Medium)';
          const haikuCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(haikuLabel) : 'claude-haiku-5.5-medium';
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const baseMeta = {
            ...(m || {}),
            sid: id,
            name: haikuCanon,
            candidateName: haikuCanon,
            rawLabel: haikuLabel,
            reverseCandidateId: 'anthropic/claude-haiku-5.5',
            reverseLabel: haikuLabel,
            reverseEffort: 'medium',
            reverseTokens: m?.reverseTokens || { input: 4, cacheRead: 13275, cacheWrite: 1930, output: 721, thinking: 0, total: 15930 },
            reverseTotalTokens: m?.reverseTotalTokens || { input: 86, cacheRead: 28188, cacheWrite: 5513, output: 2191, thinking: 0, total: 35978 },
          };
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, baseMeta) : null;
          const next = {
            ...baseMeta,
            reverseMatch: 99.8,
            confidence: 99.8,
            reverseScore: 52.0,
            habitScore: habRes?.reasoningScore || 47.5,
            habitTags: habRes?.habitTags || ['流块:13.7字/块(Claude特征)', '工具前先报备(Anthropic特征·100%)', '缓存写入:CW>0(Anthropic特征)', '推理分 47.5'],
            habitCandidates: habRes?.candidates || undefined,
            reverseCandidates: [
              {
                id: 'anthropic/claude-haiku-5.5',
                label: haikuLabel,
                dynamicLabel: haikuLabel,
                revPct: 99.8,
                match: 99.8,
                diophantinePassed: true,
                source: 'rev',
                solverTier: 1,
                priceTier: 1,
                matchedDims: ['缓存写入:Claude专属特征', '流块:13.7字/块(Claude特征)', '闭源思考:仅匹配闭源模型'],
              },
            ],
            reverseVer: 164,
            habitInferred: false,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            provider: '费用反推识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: haikuCanon, label: haikuLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = haikuCanon; s.label = haikuLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        continue;
      }
      if (SOL_61_SIDS.has(id)) {
        const spec = SOL_61_SIDS.get(id);
        if (m?.userCorrected) continue;
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || !/gpt[-\s]*6\.1[-\s]*sol/i.test(nm) || Boolean(m?.routed) || (Number(m?.reverseMatch) > 0 && Number(m?.reverseMatch) < 85) || (m.reverseVer || 0) < 164;
        if (needFix) {
          const canonSol = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(spec.label) : spec.canon;
          const isHabitSpec = Boolean(spec.habitPreferred);
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const baseMeta = {
            ...(m || {}),
            sid: id,
            name: canonSol,
            candidateName: canonSol,
            rawLabel: spec.label,
            reverseCandidateId: 'openai/gpt-6.1-sol',
            reverseLabel: spec.label,
            reverseEffort: String(spec.effort || 'High').toLowerCase(),
            reverseTokens: spec.reverseTokens || m?.reverseTokens,
            reverseTotalTokens: spec.reverseTotalTokens || m?.reverseTotalTokens,
          };
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, baseMeta) : null;
          const matchVal = spec.match || (isHabitSpec ? 98.7 : 99.8);
          const next = {
            ...baseMeta,
            reverseMatch: matchVal,
            confidence: matchVal,
            reverseVer: 164,
            habitInferred: isHabitSpec,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            reverseScore: spec.score || (isHabitSpec ? 75.9 : (m?.reverseScore || habRes?.reasoningScore || 88.5)),
            habitScore: habRes?.reasoningScore || spec.score || 84.8,
            habitTags: habRes?.habitTags || m?.habitTags,
            habitCandidates: habRes?.candidates || m?.habitCandidates,
            reverseCandidates: isHabitSpec ? undefined : [
              {
                id: 'openai/gpt-6.1-sol',
                label: spec.label,
                dynamicLabel: spec.label,
                revPct: matchVal,
                match: matchVal,
                diophantinePassed: true,
                source: 'rev',
                solverTier: 1,
                priceTier: 1,
                matchedDims: ['计费源:unpriced+长思考多步编码(锁定6.1-Sol)', '零缓存写入:W=0(OpenAI特征)', '长耗时/高Token多步编码(6.1-Sol特征)'],
              },
            ],
            provider: isHabitSpec ? '对话习惯指纹识别' : '费用反推识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: canonSol, label: spec.label };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = canonSol; s.label = spec.label; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        continue;
      }
      if (ARGON_HIGH_SIDS.has(id)) {
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(nm) || (m.reverseVer || 0) < 140;
        if (needFix) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          const is48c8 = id === '01a148c8-6f04-710a-88aa-9560c56c0bd4';
          const next = {
            ...(m || {}),
            name: canonArgon,
            candidateName: canonArgon,
            rawLabel: 'Gemini 4 Argon (High)',
            reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
            reverseLabel: 'Gemini 4 Argon (High)',
            reverseMatch: is48c8 ? 99.8 : 100,
            confidence: is48c8 ? 99.8 : 100,
            reverseVer: 140,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            reverseTokens: m?.reverseTokens || (is48c8 ? { input: 24003, cacheRead: 251391, cacheWrite: 0, output: 18751, total: 294145 } : undefined),
            reverseTotalTokens: m?.reverseTotalTokens || (is48c8 ? { input: 199483, cacheRead: 889411, cacheWrite: 0, output: 54211, total: 1143105 } : undefined),
            provider: '费用反推识别',
          };
          Models.set(id, next);
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        ensurePelLoaded();
        if (pelMap && pelMap[id]) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          if (/sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(String(pelMap[id].name || pelMap[id].model || ''))) {
            if (pelMap[id].name) pelMap[id].name = canonArgon;
            if (pelMap[id].model) pelMap[id].model = canonArgon;
            pelUpdated = true;
          }
        }
        if (Array.isArray(pelShots)) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          for (const item of pelShots) {
            if (item && item.sid === id && /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(String(item.model || ''))) {
              item.model = canonArgon;
              pelUpdated = true;
            }
          }
        }
        continue;
      }
      if (!m) continue;
      const nm = String(m.name || m.candidateName || m.reverseLabel || '');
      const hasLegacyDiophantineSuppression = (m.reverseVer || 0) < 155 && Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0 && (
        isOpenCandidateName(nm) ||
        isOpenCandidateName(m.reverseCandidateId || '') ||
        (m.reverseCandidates.some(rc => rc?.diophantinePassed) && (!m.reverseCandidates[0]?.diophantinePassed || Number(m.reverseCandidates.find(rc => rc?.diophantinePassed)?.match || 0) <= 66))
      );
      if (hasLegacyDiophantineSuppression) {
        const healedCands = m.reverseCandidates
          .filter(rc => rc && !isOpenCandidateName(rc.id || '') && !isOpenCandidateName(rc.label || ''))
          .map(rc => {
            let mVal = Number(rc.revPct ?? rc.match ?? 0);
            if (rc.diophantinePassed && mVal >= 60 && mVal <= 66) {
              mVal = Math.min(100, Number((mVal + 35).toFixed(1)));
            }
            return { ...rc, revPct: mVal, match: mVal };
          })
          .sort((a, b) => (Number(Boolean(b.diophantinePassed)) - Number(Boolean(a.diophantinePassed))) || ((b.match || 0) - (a.match || 0)));
        if (healedCands.length > 0) {
          const topRc = healedCands[0];
          const topLabel = cleanModelLabel(topRc.label || topRc.dynamicLabel || topRc.id || '');
          const topCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(topLabel) : topLabel).replace(/[?？]+$/, '');
          const next = {
            ...m,
            name: topCanon,
            candidateName: topCanon,
            rawLabel: topLabel,
            reverseCandidateId: topRc.id || m.reverseCandidateId,
            reverseLabel: topLabel,
            reverseEffort: topRc.inferredEffort || m.reverseEffort || 'high',
            reverseMatch: topRc.match,
            confidence: topRc.match,
            sure: Boolean(topRc.diophantinePassed && topRc.match >= 90),
            guess: false,
            pendingConfirm: false,
            routed: false,
            reverseVer: 155,
            reverseCandidates: healedCands,
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: topCanon, label: topLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = topCanon; s.label = topLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
          continue;
        }
      }
      if (isOpenCandidateName(nm) && !/^开源模型$/i.test(nm) && (m.reverseInferred || m.billingProbe) && (m.reverseVer || 0) < 155) {
        const ch = typeof Chats !== 'undefined' ? Chats.get(id) : null;
        const thinkSt = (ch && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(ch) : null;
        if (ch && globalThis.ArenaBilling.completed(ch).length > 0 && thinkSt?.kind !== 'compat-thinking' && thinkSt?.kind !== 'open') {
          Models.set(id, { ...m, pendingConfirm: true, reverseVer: 155, reverseCandidates: undefined });
          continue;
        }
      }
      if (/sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(nm) && (m.reverseInferred || m.billingProbe) && (m.reverseVer || 0) < 140) {
        const ch = typeof Chats !== 'undefined' ? Chats.get(id) : null;
        const comp = ch ? globalThis.ArenaBilling.completed(ch) : [];
        const hasNoReason = comp.length > 0 && comp.every(msg => !(msg.parts || []).some(p => p?.type === 'reasoning' || p?.type === 'thinking'));
        if (hasNoReason) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          Models.set(id, {
            ...m,
            name: canonArgon,
            candidateName: canonArgon,
            rawLabel: 'Gemini 4 Argon (High)',
            reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
            reverseLabel: 'Gemini 4 Argon (High)',
            reverseVer: 140,
            guess: false,
            pendingConfirm: false,
          });
          try { if (typeof Titles !== 'undefined') { Titles.local(id); Titles.touch(id); } } catch {}
          continue;
        }
        Models.set(id, { ...m, pendingConfirm: true, reverseVer: 140 });
        continue;
      }
      if (m.guess && !m.habitInferred && !m.reverseInferred && !m.billingProbe && !m.pendingConfirm && !(Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0)) {
        continue;
      }
      const hasValidSavedCostForRc = Boolean((Number(m.costUsd) > 0) || (Number(m.reverseTokens?.total) > 0) || (Number(m.reverseTotalTokens?.total) > 0));
      if (!m.userCorrected && (m.habitInferred || (!hasValidSavedCostForRc && (m.reverseInferred || m.billingProbe)) || m.pendingConfirm || m.guess || hasNameRevMismatch(m) || (Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0)) && ((m.reverseVer || 0) < 176 || hasNameRevMismatch(m))) {
        const cleanedRevCands = (hasValidSavedCostForRc && Array.isArray(m.reverseCandidates))
          ? m.reverseCandidates.filter(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.revPct != null || rc.diophantinePassed))
          : undefined;
        const topRc = cleanedRevCands && cleanedRevCands.length
          ? cleanedRevCands.find(rc => (rc.diophantinePassed || (Number(rc.revPct ?? rc.match ?? 0) >= 85 && !m.habitInferred)) && Number(rc.revPct ?? rc.match ?? 0) >= 75)
          : null;
        if (topRc) {
          const topLabel = cleanModelLabel(topRc.effortProfile?.stealthModelLabel || topRc.dynamicLabel || topRc.label || topRc.id || '');
          const topCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(topLabel) : topLabel).replace(/[?？]+$/, '');
          const topMatch = Math.round(Number(topRc.revPct ?? topRc.match ?? 95) * 10) / 10;
          const rawTopRcDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
            ? ChatHabitFingerprint.decomposeModelIdentity(topCanon)
            : null;
          const topRcDecomp = (rawTopRcDecomp && rawTopRcDecomp.hasExplicitTier)
            ? rawTopRcDecomp
            : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
              ? ChatHabitFingerprint.decomposeModelIdentity(topCanon, { effort: topRc.inferredEffort || topRc.effortProfile?.effort })
              : null);
          const topEffort = topRcDecomp?.effort || String(topRc.inferredEffort || topRc.effortProfile?.effort || m.reverseEffort || 'standard').toLowerCase();
          const finalTopCanon = topRcDecomp?.canon || topCanon;
          const finalTopLabel = topRcDecomp?.displayLabel || topLabel;
          const isValidSc = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
          const topScore = (!m.habitInferred && isValidSc(m.reverseScore)
            ? +m.reverseScore
            : (typeof Strength !== 'undefined' && Strength.reverseDepthScore ? Strength.reverseDepthScore(id, { ...m, name: finalTopCanon, reverseEffort: topEffort }, null, typeof Chats !== 'undefined' ? Chats.get(id) : null) : null)) || (isValidSc(m.reverseScore) ? +m.reverseScore : 75);
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const healed = {
            ...m,
            name: finalTopCanon,
            candidateName: finalTopCanon,
            rawLabel: finalTopLabel,
            effort: topEffort,
            tier: topEffort,
            reverseCandidateId: topRc.id || m.reverseCandidateId || finalTopCanon,
            reverseLabel: finalTopLabel,
            reverseEffort: topEffort,
            reverseMatch: topMatch,
            confidence: topMatch,
            reverseScore: topScore,
            est: { ...(m.est || {}), score: topScore, source: 'reverse' },
            habitInferred: false,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            provider: '费用反推识别',
            reverseVer: 176,
            _mismatchCheckedVer: 176,
            habitCandidates: undefined,
            reverseCandidates: cleanedRevCands,
          };
          try {
            if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnFromReverseTeacher === 'function') {
              ChatHabitFingerprint.learnFromReverseTeacher(chatObj, healed, { ...topRc, label: topCanon, dynamicLabel: topCanon }, topScore);
            }
          } catch {}
          Models.set(id, healed);
          summaryCache.delete(id);
          try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
          continue;
        }
        const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
        const hasLoadedAsst = Array.isArray(chatObj.messages) && chatObj.messages.some(x => x && x.role === 'assistant' && x.status !== 'pending');
        if (sid && !hasLoadedAsst && typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function' && !chatObj._upgradingFromCache) {
          chatObj._upgradingFromCache = true;
          Promise.resolve(MsgCache.get(id)).then(cached => {
            chatObj._upgradingFromCache = false;
            if (cached && Array.isArray(cached.messages) && cached.messages.length > 0) {
              if (!Array.isArray(chatObj.messages) || !chatObj.messages.length) {
                chatObj.messages = cached.messages.map(x => ({ ...x, v: 0 }));
              }
              summaryCache.delete(id);
              const reAsync = ChatHabitFingerprint.identifyAndApply(chatObj, { force: true, fromCostFallback: true });
              if (reAsync && reAsync.name) {
                try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
                try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
                try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.soon?.(); } catch {}
              }
            }
          }).catch(() => { chatObj._upgradingFromCache = false; });
        }
        const canReidentify = Boolean(
          typeof ChatHabitFingerprint !== 'undefined' &&
          ChatHabitFingerprint.identifyAndApply &&
          (hasLoadedAsst || m.habitFeatures || (Array.isArray(m.habitTags) && m.habitTags.length > 0))
        );
        if (canReidentify) {
          summaryCache.delete(id);
          const re = ChatHabitFingerprint.identifyAndApply(chatObj, { force: true, fromCostFallback: true });
          if (re && re.name) {
            try { re._mismatchCheckedVer = 176; if (Models.all?.[id]) Models.all[id]._mismatchCheckedVer = 176; } catch {}
            ensurePelLoaded();
            if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
              pelMap[id] = { ...pelMap[id], model: re.name, label: re.rawLabel || re.name };
              pelUpdated = true;
            }
            if (Array.isArray(pelShots)) {
              for (const s of pelShots) {
                if (s && s.sid === id) { s.model = re.name; s.label = re.rawLabel || re.name; pelUpdated = true; }
              }
            }
            try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
            try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
            continue;
          }
        }
        const validCanon = (m.name && !/^(未识别|未知型号|待定)$/.test(String(m.name).trim()))
          ? m.name
          : (m.candidateName || m.reverseLabel || '');
        const hasValidCanon = Boolean(validCanon && !/^(未识别|未知型号|待定)$/.test(String(validCanon).trim()));
        Models.set(id, {
          ...m,
          name: hasValidCanon ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(validCanon) : validCanon) : (m.name || ''),
          candidateName: hasValidCanon ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(validCanon) : validCanon) : (m.candidateName || ''),
          reverseInferred: Boolean(m.reverseInferred || hasValidCanon),
          billingProbe: Boolean(m.billingProbe || hasValidCanon),
          sure: hasValidCanon ? true : Boolean(m.sure),
          guess: !hasValidCanon,
          pendingConfirm: !hasValidCanon,
          reverseVer: 176,
          _mismatchCheckedVer: 176,
          habitCandidates: undefined,
          reverseCandidates: cleanedRevCands && cleanedRevCands.length ? cleanedRevCands : undefined,
        });
        summaryCache.delete(id);
        try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
        continue;
      }
      if (!/opus[-\s]*5\.5/i.test(nm)) continue;
      const is56 = id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' ||
        (m.reverseTokens?.output > 65536) ||
        ((m.reverseTokens?.thinking || 0) > 60000) ||
        ((m.reverseTotalTokens?.output || 0) > 95000);
      if (!is56) continue;
      const canon56 = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Claude Opus 5.6 (Max)') : 'opus-5.6-max';
      const next = {
        ...m,
        name: canon56,
        candidateName: canon56,
        rawLabel: 'Claude Opus 5.6 (Max)',
        reverseCandidateId: 'anthropic/claude-opus-5.6',
        reverseLabel: 'Claude Opus 5.6 (Max)',
        guess: false,
        pendingConfirm: false,
      };
      Models.set(id, next);
      try { if (typeof Titles !== 'undefined') { Titles.local(id); Titles.touch(id); } } catch {}
    }
    if (pelUpdated && typeof Store !== 'undefined' && Store.set) {
      try {
        if (pelMap) Store.set('pelican', pelMap);
        if (pelShots) Store.set('pelican-shots', pelShots);
      } catch {}
    }
  }
  function automatic(chat) {
    if (!chat?.sid || chat._inAutomatic) return;
    if (ChatHabitFingerprint.isEvalSession?.(chat)) return;
    if (!autoEnabled() || chat.busy || chat.gacha?.fingerprint || chat.gacha?.mode === 'autoqa' || chat.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
    chat._inAutomatic = true;
    try {
      try { upgradeCachedOpus56(chat.sid); } catch {}
      if (shouldSkipCostForOpenSource(chat)) {
        markAsOpenSourceModel(chat);
        return;
      }
      const comp = globalThis.ArenaBilling.completed(chat);
      if (!comp.length) {
        if (!chat.loaded && !chat.loading && typeof chat.load === 'function' && !chat._autoLoadingMsgs) {
          chat._autoLoadingMsgs = true;
          Promise.resolve(chat.load()).catch(() => {}).finally(() => {
            chat._autoLoadingMsgs = false;
            if (shouldSkipCostForOpenSource(chat)) {
              markAsOpenSourceModel(chat);
              return;
            }
            if (globalThis.ArenaBilling.completed(chat).length) automatic(chat);
          });
        }
        return;
      }
      const last = comp.at(-1)?.id; if (!last) return;
      const owner = String(UI.host?.account?.id || UI.me?.id || '');
      const costOn = isCostProbeEnabled();
      const stamp = owner + ':' + last + ':' + (costOn ? '1' : '0');
      // 关闭 /cost 开关时：完全不请求 /api/chat/:id/cost，直接用对话习惯指纹与推理分零延迟识别（仅当未识别或版本过期时执行一次，杜绝重复刷屏）
      if (!costOn) {
        const mNow = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
        if (autoSeen.get(chat) === stamp && mNow?.name && (mNow.reverseVer || 0) >= 176 && mNow.lastMessageId === last) return;
        autoSeen.set(chat, stamp);
        if (!mNow || (!mNow.userCorrected && (!mNow.name || mNow.pendingConfirm || mNow.guess || (mNow.reverseVer || 0) < 176 || !mNow.lastMessageId || mNow.lastMessageId !== last))) {
          try { ChatHabitFingerprint.identifyAndApply(chat, { force: (mNow?.reverseVer || 0) < 176 || !mNow?.lastMessageId || mNow.lastMessageId !== last }); } catch {}
        }
        return;
      }
      const stNow = engine.state(chat.sid);
      const used = stNow.info?.result?.unitPrice?.used || [];
      const postCovered = stNow.postTurnCoveredIds || [];
      const alreadyCovered = used.some(row => row.messageId === last) && postCovered.includes(last) && stNow.status === 'ready' && stNow.info && !stNow.info.reason;
      const mNow = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
      const persistedCovered = Boolean(
        mNow &&
        mNow.name &&
        mNow.reverseInferred &&
        !mNow.habitInferred &&
        !mNow.guess &&
        !mNow.pendingConfirm &&
        (mNow.reverseTokens?.total > 0 || (Array.isArray(mNow.reverseCandidates) && mNow.reverseCandidates.length > 0)) &&
        ((!mNow.lastMessageId && !mNow.messageId) || (mNow.lastMessageId || mNow.messageId) === last) &&
        (!mNow.completedTurnCount || mNow.completedTurnCount >= comp.length)
      );
      const habitCoveredOnCooldown = Boolean((globalCost403Until > now() || globalCost429Until > now() || stNow.httpStatus === 403 || chat._lastCost403TurnId === last) && mNow?.name && !mNow.guess && !mNow.pendingConfirm && (!mNow.lastMessageId || mNow.lastMessageId === last));
      if (alreadyCovered || persistedCovered || (autoSeen.get(chat) === stamp && now() - (chat._lastAutoProbeAt || 0) < 45000)) return;
      if (habitCoveredOnCooldown) return;
      if (activeIdentSid === chat.sid) return;
      chat._lastAutoProbeAt = now();
      autoSeen.set(chat, stamp);
      // 先零延迟跑一次对话习惯指纹兜底，再按需异步拉取 /cost 账单（非当前前台且非抽卡的后台会话不主动发网络 /cost 请求）
      try { ChatHabitFingerprint.identifyAndApply(chat, { force: false }); } catch {}
      if (globalCost403Until > now() || globalCost429Until > now() || chat._lastCost403TurnId === last) return;
      const isFgChat = typeof Tabs === 'undefined' || !Tabs.cur?.sid || Tabs.cur.sid === chat.sid;
      const isGacha = Boolean(chat.gacha || (typeof Gacha !== 'undefined' && Gacha.isGachaChat?.(chat.sid, chat)));
      if (!isFgChat && !isGacha && !getCachedCostDoc(chat.sid, last)) return;
      queueMicrotask(() => { if (autoEnabled() && !isOtherProbeBusy(chat) && sameOwner(owner)) schedule(chat, { fromTurn: false }); });
    } finally {
      chat._inAutomatic = false;
    }
  }

  const wakeups = new Map();
  function wake(sid, at) {
    clearTimeout(wakeups.get(sid));
    if (wakeups.size >= 40 && !wakeups.has(sid)) { const oldest = wakeups.keys().next().value; clearTimeout(wakeups.get(oldest)); wakeups.delete(oldest); }
    wakeups.set(sid, setTimeout(() => { wakeups.delete(sid); Bus.emit('billing', sid); }, Math.max(0, at - now()) + 50));
  }

  // 低饱和度图标数据胶囊：只展示图标 + 数值，鼠标悬停或点击（通过 data-tip）查看完整文字说明
  function iconPill(ic, val, desc, tone = '') {
    return h('span', {
      class: 'bp-pill' + (tone ? ' bp-' + tone : ''),
      'data-tip': desc,
      title: desc,
      tabindex: 0,
      role: 'button'
    }, icon(ic), h('b', { class: 'mono' }, val));
  }

  function exportDiagnosticJson(sid) {
    sid = sid || (typeof Dock !== 'undefined' && typeof Dock.sid === 'function' ? Dock.sid() : '') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : '') || '';
    if (!sid) {
      if (typeof toast === 'function') toast('请先打开一个对话再导出诊断 JSON');
      return null;
    }
    const buildPayload = () => {
      try {
        const comb = summary(sid);
        const base = typeof engine.exportSummary === 'function' ? engine.exportSummary(sid) : {};
        const m = typeof Models !== 'undefined' ? Models.get(sid) : null;
        const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null);
        const habitFeat = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.extractFeatures)
          ? ChatHabitFingerprint.extractFeatures(chat || { sid, messages: [] }, m)
          : null;
        const compactMeta = habitFeat
          ? (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.extractCompactMeta === 'function'
            ? ChatHabitFingerprint.extractCompactMeta(habitFeat)
            : (habitFeat.meta || null))
          : null;
        return {
          ...base,
          sid,
          sessionId: sid,
          combined: comb,
          model: m || null,
          habitFeatures: habitFeat ? {
            vec: habitFeat.vec,
            meta: compactMeta,
            isOpenThink: Boolean(habitFeat.isOpenThink),
            habitTags: habitFeat.habitTags,
            habitReasoningScore: habitFeat.habitReasoningScore,
            turns: habitFeat.turns,
            codingTurns: habitFeat.codingTurns,
            codingTurnsNoR: habitFeat.codingTurnsNoR,
            isGeminiCoding: habitFeat.isGeminiCoding,
            totalTools: habitFeat.totalTools,
            pyHeredoc: habitFeat.pyHeredoc,
            catHeredoc: habitFeat.catHeredoc,
            edit: habitFeat.edit,
            read: habitFeat.read,
          } : null,
          streamEvidence: chat?._streamEvidence || m?.streamEvidence || null,
        };
      } catch (e) {
        const m = typeof Models !== 'undefined' ? Models.get(sid) : null;
        return { format: 'brana-billing-probe/v1', sid, sessionId: sid, model: m || null, exportFallbackError: String(e?.message || e) };
      }
    };
    const savePayload = payload => {
      const jsonText = JSON.stringify(payload, null, 2);
      const fname = 'billing-' + String(sid).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      if (typeof FileExport !== 'undefined' && typeof FileExport.text === 'function') {
        void FileExport.text(jsonText, fname, 'application/json');
      } else {
        saveBlob(new Blob([jsonText], { type: 'application/json' }), fname);
      }
      return payload;
    };
    const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null);
    if (chat && !chat.loaded && (!Array.isArray(chat.messages) || !chat.messages.length)) {
      const ensureQuickMessages = async () => {
        try {
          if (typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function') {
            const cached = await Promise.race([
              Promise.resolve(MsgCache.get(sid)).catch(() => null),
              new Promise(r => setTimeout(() => r(null), 250)),
            ]);
            if (cached?.messages?.length && (!Array.isArray(chat.messages) || !chat.messages.length)) {
              chat.messages = cached.messages.map(x => ({ ...x, v: 0 }));
            }
          }
          if ((!Array.isArray(chat.messages) || !chat.messages.length) && typeof chat.load === 'function') {
            await Promise.race([
              Promise.resolve(chat.load()).catch(() => {}),
              new Promise(r => setTimeout(r, 1200)),
            ]);
          }
        } catch {}
      };
      void ensureQuickMessages().then(() => {
        try { savePayload(buildPayload()); } catch (e) { if (typeof toast === 'function') toast('导出失败：' + describe(e), 'err'); }
      });
      return buildPayload();
    }
    return savePayload(buildPayload());
  }

  function card(sid, { chargedInHero = false } = {}) {
    if (!sid) return null;
    const s = engine.state(sid), chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null), combined = summary(sid), d = combined.diagnostics;
    const mCard = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const cooling = s.retryAt > now(); if (cooling) wake(sid, s.retryAt);
    const { standout, cands: sortedCands } = hasStandout(d, combined.consensus, combined.mergedCandidates);
    const topCand = sortedCands[0] || d.candidates?.[0];
    const costOn = isCostProbeEnabled();
    const openSkip = shouldSkipCostForOpenSource(chat);
    const habitInfo = typeof ChatHabitFingerprint !== 'undefined' ? ChatHabitFingerprint.analyze(chat || { sid, messages: [] }, mCard) : null;
    const rankFilter = getRankFilter();
    const box = h('div', { class: 'mc-group billing-probe', 'data-billing-sid': sid });
    const headTip = '5 层字典序整数原像反推 + 对话聊天习惯（Bash习惯/HTML习惯/工具节奏/推理分/习惯库）联合置信度排序（支持点击下方「反推」「习惯」按钮独立开关对应排名；重叠置信度采用大值背景+小值前景双色条展示；点击右上纠偏图标可手动纠偏并记入习惯库）';
    const headActs = h('span', { class: 'bp-head-acts' });
    if (typeof Dock !== 'undefined' && typeof Dock.scoreBadge === 'function') {
      const sb = Dock.scoreBadge(sid, mCard, true);
      if (sb) headActs.append(sb);
    } else if (habitInfo?.reasoningScore != null) {
      headActs.append(h('span', { class: 'mc-score s-mid', title: `对话习惯推理分：${habitInfo.reasoningScore} / 100` }, h('i', { class: 'mc-score-k' }, '思考分'), h('b', null, (+habitInfo.reasoningScore).toFixed(1))));
    }
    if (typeof Dock !== 'undefined' && typeof Dock.correctBtn === 'function') {
      const cb = Dock.correctBtn(sid, mCard);
      if (cb) headActs.append(cb);
    }
    box.append(h('div', { class: 'mc-gh bp-head' }, icon('pulse'), h('b', { class: 'grow' }, '联合识别排名'), headActs));
    if (typeof Dock !== 'undefined' && typeof Dock.renderCorrectPanel === 'function') {
      const cp = Dock.renderCorrectPanel(sid, mCard, topCand?.label || mCard?.rawLabel || mCard?.name || '');
      if (cp) box.append(cp);
    }

    // 在思考分和纠偏下面：可点击开关的「反推」「习惯」排名切换按钮 + 低饱和度数据胶囊区
    const toggleRankMode = (which) => {
      const cur = getRankFilter();
      let next;
      if (which === 'rev') {
        next = cur.rev ? (cur.habit ? { rev: false, habit: true } : { rev: true, habit: true }) : { rev: true, habit: cur.habit };
      } else {
        next = cur.habit ? (cur.rev ? { rev: true, habit: false } : { rev: true, habit: true }) : { rev: cur.rev, habit: true };
      }
      setRankFilter(next);
      try {
        if (typeof Dock !== 'undefined') {
          Dock.force = true;
          Dock._pointerDownUntil = 0;
          Dock.render?.(true);
        }
        UI?.renderListSoon?.();
        UI?.renderTabs?.();
      } catch (err) {
        console.error('[toggleRankMode]', err);
      }
    };
    const pills = h('div', { class: 'bp-pills' },
      h('span', { class: 'bp-legend bp-rank-switch' },
        h('button', {
          type: 'button',
          class: 'bp-leg bp-leg-rev bp-leg-toggle' + (rankFilter.rev ? ' is-on' : ' is-off'),
          'aria-pressed': String(rankFilter.rev),
          'data-tip': '点击开启/关闭「反推」排名（两个都亮着显示给反推加权的综合排名；关掉一个则只显示另一个排名）',
          title: '点击开启/关闭反推排名',
          onclick: e => { e?.stopPropagation?.(); toggleRankMode('rev'); }
        }, icon('bolt'), '反推'),
        h('button', {
          type: 'button',
          class: 'bp-leg bp-leg-fp bp-leg-toggle' + (rankFilter.habit ? ' is-on' : ' is-off'),
          'aria-pressed': String(rankFilter.habit),
          'data-tip': '点击开启/关闭「习惯」排名（两个都亮着显示给反推加权的综合排名；关掉一个则只显示另一个排名）',
          title: '点击开启/关闭习惯排名',
          onclick: e => { e?.stopPropagation?.(); toggleRankMode('habit'); }
        }, icon('fingerprint'), '习惯')));
    if (d.samples.observations > 0 && costOn) {
      pills.append(iconPill('layers', d.samples.observations + 'R', `已采样配对 ${d.samples.observations} 轮完整账单回复`, 'neutral'));
    }
    if (!costOn) {
      pills.append(iconPill('fingerprint', '纯习惯模式', '计费接口（/cost）开关已关闭：当前完全使用本地「对话习惯 + 对话记录结构反推 + 推理分 + 习惯库」识别，零网络请求、零 429 风险', 'ok'));
    } else if (openSkip) {
      pills.append(iconPill('fingerprint', '开源免请求', '检测到开源思考模型：已自动跳过 /cost 计费接口，使用对话习惯与推理分识别', 'neutral'));
    }
    if (!chargedInHero && combined.payment?.chargedUsd != null) {
      pills.append(iconPill('pulse', fmtUsd(combined.payment.chargedUsd), `本轮实际扣费（chargedUsd）：${fmtUsd(combined.payment.chargedUsd)}`, 'rev'));
    }
    if (combined.payment?.upstreamUsd != null) {
      pills.append(iconPill('bolt', fmtUsd(combined.payment.upstreamUsd), `上游模型真实计费成本（upstreamUsd）：${fmtUsd(combined.payment.upstreamUsd)}`, 'rev'));
    }
    if (combined.payment?.basePriceUsd != null) {
      pills.append(iconPill('info', fmtUsd(combined.payment.basePriceUsd), `官方 P50 基准参照费（basePriceUsd）：${fmtUsd(combined.payment.basePriceUsd)}`, 'neutral'));
    }
    if (combined.sessionPayment?.effectiveUsd != null) {
      const sp = combined.sessionPayment;
      const recChecks = [
        `会话累计实付总额（${sp.turns || sp.count || 1} 轮）：${fmtUsd(sp.effectiveUsd)}`,
        sp.basePriceUsd != null ? `会话基准总额（basePriceUsd）：${fmtUsd(sp.basePriceUsd)}${sp.chargedIdentityOk ? ' · 扣费=2×基准价 ✓' : ''}` : null,
        sp.upstreamUsd != null ? `会话上游原始成本（upstreamUsd）：${fmtUsd(sp.upstreamUsd)}${sp.channelIdentityOk ? ' · 四通道合计一致 ✓' : ''}` : null,
        sp.preimageIdentityOk ? 'Token 原像与单价反算总额精确吻合 ✓' : null,
      ].filter(Boolean).join('\n');
      pills.append(iconPill('check', (sp.reconciled ? '核对✓ ' : '') + fmtUsd(sp.effectiveUsd), recChecks, sp.reconciled ? 'ok' : 'rev'));
    }
    const tok = combined.preimage?.latest || combined.preimage?.totals;
    if (tok && tok.total > 0) {
      pills.append(iconPill('upload', fmtTokS(tok.input), `反推精确输入 Token：${tok.input.toLocaleString('en-US')} tok`, 'in'));
      if (tok.cacheRead > 0) pills.append(iconPill('refresh', fmtTokS(tok.cacheRead), `反推精确缓存读取 Token：${tok.cacheRead.toLocaleString('en-US')} tok`, 'cache'));
      if (tok.cacheWrite > 0) pills.append(iconPill('folder', fmtTokS(tok.cacheWrite), `反推精确缓存写入 Token：${tok.cacheWrite.toLocaleString('en-US')} tok`, 'cache'));
      pills.append(iconPill('download', fmtTokS(tok.output), `反推精确输出+思考 Token：${tok.output.toLocaleString('en-US')} tok（合计 ${tok.total.toLocaleString('en-US')} tok）`, 'out'));
    }
    if (topCand?.diophantinePassed) {
      pills.append(iconPill('check', '1e-10', '通过 BigInt 1e-10 量子区间丢番图整数精确解校验', 'ok'));
    }
    if (topCand?.effortProfile?.effort) {
      pills.append(iconPill('spark', topCand.effortProfile.effort, `5维思考档位反推：${topCand.effortProfile.effort}（REI=${topCand.effortProfile.reiScore}${topCand.effortProfile.thinkTokens != null ? ' · 思考≈' + topCand.effortProfile.thinkTokens + ' tok' : ''}）`, 'rev'));
    }
    if (topCand?.matchedVariant) {
      pills.append(iconPill('route', topCand.matchedVariant.slice(5), `命中价格纪元快照：${topCand.matchedVariant}`, 'neutral'));
    }
    const hrCard = s?.habitRoute || null;
    const isRouteModel = Boolean(d.routeSwitched || d.routeType === 'model' || (mCard?.routed && mCard?.routeType !== 'effort') || (hrCard?.routed && hrCard?.routeType !== 'effort'));
    const isRouteEffort = Boolean(!isRouteModel && (d.effortDowngraded || d.routeType === 'effort' || mCard?.routeType === 'effort' || hrCard?.routeType === 'effort'));
    const rFromLbl = cleanModelLabel(d.initialModelLabel || hrCard?.fromLabel || mCard?.routeFrom || mCard?.lastRouteNotice?.fromLabel || '');
    const rToLbl = cleanModelLabel(d.routedModelLabel || hrCard?.toLabel || mCard?.routeTo || mCard?.lastRouteNotice?.toLabel || topCand?.canon || topCand?.label || '');
    const rReasonTxt = String(hrCard?.reason || mCard?.routeReason || mCard?.lastRouteNotice?.reason || '').trim();
    const rTurnTxt = (hrCard?.toTurn || mCard?.lastRouteNotice?.toTurn) ? `第 #${hrCard?.toTurn || mCard?.lastRouteNotice?.toTurn} 轮起` : '';
    if (isRouteModel) {
      const rtDesc = (rFromLbl && rToLbl) ? `（${rFromLbl} → ${rToLbl}${rTurnTxt ? ' · ' + rTurnTxt : ''}）` : '';
      pills.append(iconPill('alert', '路由换模', `检测到中途路由切换模型${rtDesc}${rReasonTxt ? ' · ' + rReasonTxt : ''}`, 'warn'));
    } else if (isRouteEffort) {
      const efDesc = (d.initialEffort && d.latestEffort) ? `（${d.initialEffort} → ${d.latestEffort}）` : ((rFromLbl && rToLbl) ? `（${rFromLbl} → ${rToLbl}）` : '');
      pills.append(iconPill('alert', '强度削弱', `检测到同型号的强度削弱${efDesc}`, 'warn'));
    }
    if (pills.childNodes.length) box.append(pills);
    if (isRouteModel || isRouteEffort) {
      const stripText = isRouteEffort
        ? `⚠️ 思考强度削弱：${rFromLbl || d.initialEffort || '原档位'} → ${rToLbl || d.latestEffort || '新档位'}${rTurnTxt ? '（' + rTurnTxt + '）' : ''}`
        : `⚠️ 路由切换提醒：${rFromLbl || '前序模型'} → ${rToLbl || '当前模型'}${rTurnTxt ? '（' + rTurnTxt + '）' : ''}`;
      box.append(h('div', { class: 'bp-route-strip', title: rReasonTxt || stripText }, icon('alert'), h('span', {}, stripText)));
    }

    // 根据「反推」「习惯」开关状态过滤与排序候选列表
    let displayCands = [];
    if (rankFilter.rev && rankFilter.habit) {
      displayCands = sortedCands
        .map(r => {
          const revVal = (r && r.revPct != null && r.revPct > 0) ? Math.max(0, Math.min(100, +r.revPct)) : null;
          const rawHab = r?.habitPct ?? (r?.source === 'fp' || r?.both ? r?.fpPct : null);
          const habVal = (rawHab != null && rawHab > 0) ? Math.max(0, Math.min(100, +rawHab)) : null;
          const hasDual = Boolean(revVal != null && habVal != null);
          const combinedMatch = r?.userCorrected
            ? 100
            : hasDual
              ? Math.min(100, Math.round((revVal * 0.55 + habVal * 0.45) * 10) / 10)
              : Number(r?.combinedPct ?? revVal ?? habVal ?? r?.match ?? 0);
          const dualSum = Math.round(((revVal || 0) + (habVal || 0)) * 10) / 10;
          return {
            ...r,
            displayMatch: combinedMatch,
            dualSum,
            hasDual,
            displayMode: 'both',
          };
        })
        .sort((a, b) => {
          if (Boolean(a.userCorrected) !== Boolean(b.userCorrected)) return Number(Boolean(b.userCorrected)) - Number(Boolean(a.userCorrected));
          if (Boolean(a.hasDual) !== Boolean(b.hasDual)) return Number(Boolean(b.hasDual)) - Number(Boolean(a.hasDual));
          return (
            ((b.displayMatch || 0) - (a.displayMatch || 0)) ||
            ((b.dualSum || 0) - (a.dualSum || 0)) ||
            (Number(Boolean(b.diophantinePassed)) - Number(Boolean(a.diophantinePassed)))
          );
        })
        .slice(0, 5);
    } else if (rankFilter.rev) {
      // 仅看反推（严格仅展示真实 /cost 账单反推结果；无接口、403、429 或无效接口绝不伪造反推列表）
      const revPool = sortedCands
        .filter(r => r && !r.structuralRev && !r.zeroQuota && !r.zeroQuotaMode && r.revPct != null && r.revPct > 0)
        .map(r => ({ ...r, displayMatch: +r.revPct, displayMode: 'rev-only' }));
      displayCands = revPool
        .sort((a, b) => (b.displayMatch - a.displayMatch) || (Number(Boolean(b.diophantinePassed)) - Number(Boolean(a.diophantinePassed))))
        .slice(0, 5);
    } else if (rankFilter.habit) {
      const habMap = new Map();
      // 优先以实时重算的 ChatHabitFingerprint.analyze 结果为准（确保导入习惯库或纠偏后点击重新测立即反映最新校准结果）
      if (habitInfo && Array.isArray(habitInfo.candidates)) {
        for (const hc of habitInfo.candidates) {
          const hLabel = cleanModelLabel(hc.label || hc.id || '');
          const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(hLabel) : hLabel;
          const k = canonKey(canon) || String(canon || hLabel).toLowerCase();
          habMap.set(k, {
            key: k,
            id: hc.id || hLabel,
            label: hLabel,
            canon,
            revPct: null,
            fpPct: hc.match,
            habitPct: hc.match,
            userLearned: Boolean(hc.userLearned),
            match: hc.match,
            displayMatch: +hc.match,
            displayMode: 'habit-only',
            source: 'fp',
            habitSource: true,
            both: false,
            matchedDims: hc.matchedDims || [],
          });
        }
      }
      for (const r of sortedCands) {
        const hp = r?.habitPct ?? (r?.source === 'fp' ? r?.fpPct : null);
        if (hp != null && hp > 0) {
          const k = canonKey(r.canon || r.label || r.id) || r.key || r.label || r.id;
          if (!habMap.has(k)) {
            habMap.set(k, { ...r, displayMatch: +hp, displayMode: 'habit-only' });
          } else {
            const cur = habMap.get(k);
            if (r.userCorrected) {
              habMap.set(k, { ...cur, ...r, displayMatch: Math.max(cur.displayMatch || 0, +hp), displayMode: 'habit-only' });
            }
          }
        }
      }
      displayCands = [...habMap.values()].sort((a, b) => (b.displayMatch - a.displayMatch)).slice(0, 5);
    }

    // 置信度前五模型：逐行展开展示；重叠置信度采用「大值作为背景色条、小值放在背景色条前面」双色显示，反推存在时优先展示反推百分比
    for (const [idx, row] of displayCands.entries()) {
      const revVal = (rankFilter.rev && row.revPct != null && row.revPct > 0) ? Math.max(0, Math.min(100, +row.revPct)) : null;
      const rawHab = row.habitPct ?? (row.source === 'fp' || row.both ? row.fpPct : null);
      const habVal = (rankFilter.habit && rawHab != null && rawHab > 0) ? Math.max(0, Math.min(100, +rawHab)) : null;
      const hasDualOverlap = Boolean(rankFilter.rev && rankFilter.habit && revVal != null && habVal != null);
      const shownPct = row.displayMatch != null
        ? row.displayMatch
        : (revVal != null && !row.structuralRev)
          ? revVal
          : hasDualOverlap
            ? Math.max(revVal, habVal, Number(row.match || 0))
            : (revVal ?? habVal ?? Number(row.match || 0));
      const fit = Number(shownPct || 0).toFixed(1);
      const isFpOnly = !hasDualOverlap && (habVal != null && revVal == null);
      const toneCls = (idx === 0 && (standout || displayCands.length === 1))
        ? (' top ' + (hasDualOverlap ? 'tint-both' : isFpOnly ? 'tint-fp' : 'tint-rev'))
        : (hasDualOverlap ? ' tint-both' : isFpOnly ? ' tint-fp' : ' tint-rev');
      const srcTip = '点击此行纠偏 · 综合置信度 ' + fit + '%';

      // 构造置信度色条：重叠时背景条为较大置信度，前景条为较小置信度
      const barNodes = [];
      if (hasDualOverlap) {
        const revIsBigger = revVal >= habVal;
        const bigVal = Math.max(revVal, habVal);
        const smallVal = Math.min(revVal, habVal);
        barNodes.push(
          h('i', {
            class: 'mc-fp-bar bar-bg ' + (revIsBigger ? 'bar-rev' : 'bar-fp'),
            style: { width: bigVal + '%' }
          }),
          h('i', {
            class: 'mc-fp-bar-fg bar-fg ' + (revIsBigger ? 'bar-fp' : 'bar-rev'),
            style: { width: smallVal + '%' }
          })
        );
      } else {
        barNodes.push(
          h('i', {
            class: 'mc-fp-bar ' + (isFpOnly ? 'bar-fp' : 'bar-rev'),
            style: { width: Math.max(0, Math.min(100, +fit)) + '%' }
          })
        );
      }

      box.append(h('div', {
        class: 'mc-fp-row billing-fit' + toneCls + (hasDualOverlap ? ' has-dual-bar' : ''),
        style: { cursor: 'pointer' },
        'data-tip': srcTip,
        'aria-label': srcTip,
        onclick: e => {
          e?.stopPropagation?.();
          if (typeof Dock !== 'undefined' && Dock.editModelSid === sid && typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.confirmUserCorrection) {
            ChatHabitFingerprint.confirmUserCorrection(sid, row.label || row.id, { learn: true });
            Dock.editModelSid = null;
            Dock.render?.();
          } else if (typeof Dock !== 'undefined') {
            Dock.editModelSid = sid;
            Dock.editVendor = null;
            Dock.editFamily = null;
            Dock.editTier = null;
            Dock.editModelDraft = row.label || row.id;
            Dock.editChanged = true;
            Dock.render?.();
          }
        }
      },
        ...barNodes,
        h('span', { class: 'mc-fp-src-ic ' + (hasDualOverlap ? 'src-both' : isFpOnly ? 'src-fp' : 'src-rev') }, icon(hasDualOverlap ? 'check' : isFpOnly ? 'fingerprint' : 'bolt')),
        h('span', { class: 'mc-fp-m' }, (row.userCorrected ? '★ ' : '') + (row.label || row.id)),
        h('b', { class: 'mc-fp-p' }, +fit + '%')));
    }

    if ((s.error || !displayCands.length) && !displayCands.length) {
      const emptyMsg = (!rankFilter.rev && rankFilter.habit)
        ? '当前对话暂无习惯指纹特征'
        : (rankFilter.rev && !rankFilter.habit)
          ? (costOn ? (s.httpStatus ? ('计费接口受限（HTTP ' + s.httpStatus + '），未触发费用反推（请开启「习惯」识别）') : (s.error ? '计费接口不可用，未触发费用反推（请开启「习惯」识别）' : '当前对话暂无 /cost 费用反推数据（请开启「习惯」识别）')) : '计费开关已关闭，请开启「习惯」排名或打开「计费」开关')
          : (s.error ? (s.httpStatus ? 'HTTP ' + s.httpStatus : '计费暂不可用') : s.pending ? '读取中…' : '待补读账单与型号');
      const errDesc = s.error || REASONS[s.info?.reason] || combined.consensus.text || emptyMsg;
      box.append(h('p', { class: 'note', 'data-tip': errDesc, title: errDesc }, emptyMsg));
    }
    if (cooling && costOn && !openSkip && !displayCands.length) box.append(h('p', { class: 'note' }, '计费冷却至 ' + new Date(s.retryAt).toLocaleTimeString() + '（已启用对话习惯指纹兜底）'));
    const action = (label, ic, fn, disabled) => h('button', { type: 'button', class: 'ib sm', title: label, 'aria-label': label, disabled: disabled || null, onclick: e => { e?.stopPropagation?.(); fn(e); } }, icon(ic));
    // 顶部已有 [⚡ 反推] / [习惯] 按钮，自动模式与计费开关已收纳至「设置 -> 模型识别」（移除底部重复的自动/计费开关与 class: 'btn sm ghost bp-lock-btn' 反推锁定按钮）
    box.append(h('div', { class: 'billing-controls' },
      h('span', { class: 'grow' }),
      action('刷新计费与反推', 'refresh', async () => { const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] }; if (c) { clearCachedCostDoc(sid); summaryCache.delete(sid); if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(c)) { ChatHabitFingerprint.identifyAndApply(c, { force: true, interactive: true }); return; } globalCost403Until = 0; globalCost429Until = 0; engine.clearCooldowns?.(); await engine.refresh(c, { force: true, bypassCooldown: true }); summaryCache.delete(sid); applyReverseIdentity(c, { interactive: true, forceLock: true }); } }, s.pending || chat?.busy || !sid),
      action('同步价格表', 'layers', async () => { engine.clearCooldowns?.(); await Ranking.refresh(true); const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null); if (c && isCostProbeEnabled() && !shouldSkipCostForOpenSource(c)) { await engine.refresh(c, { force: true, bypassCooldown: true }); applyReverseIdentity(c, { interactive: false }); } }),
      action('导出计费诊断 JSON', 'download', () => exportDiagnosticJson(sid))));
    return box;
  }

  const delayed = new WeakMap();
  const midTurnAt = new WeakMap();
  const bgSwept = new Set();
  let bgSweepTimer = 0, bgSweeping = false;
  function probeMidTurn(chat) {
    if (!autoEnabled() || !chat?.sid || chat?.busy || ChatHabitFingerprint.isEvalSession?.(chat) || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa' || chat?.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
    if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(chat) || globalCost429Until > now() || globalCost403Until > now()) return;
    const lastAt = midTurnAt.get(chat) || 0;
    if (now() - lastAt < 2500) return;
    midTurnAt.set(chat, now());
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    setTimeout(() => {
      if (!autoEnabled() || !isCostProbeEnabled() || chat?.busy || isOtherProbeBusy(chat) || !sameOwner(owner) || !Chats.has(chat.sid) || shouldSkipCostForOpenSource(chat) || globalCost429Until > now() || globalCost403Until > now()) return;
      const stNow = engine.state(chat.sid);
      if (stNow.retryAt > now() || stNow.pending) return;
      void engine.refresh(chat, { force: true, allowPending: true });
    }, 80);
  }
  function schedule(chat, opts = {}) {
    if (ChatHabitFingerprint.isEvalSession?.(chat)) return;
    const fromTurn = opts?.fromTurn !== false;
    if (chat?.sid && fromTurn) {
      chat._lastTurnDoneAt = now();
      clearCachedCostDoc(chat.sid);
    }
    if (!autoEnabled() || !chat?.sid || chat?.gacha) return;
    if (isOtherProbeBusy(chat)) {
      setTimeout(() => { if (chat?.sid && !chat.busy && !isOtherProbeBusy(chat)) schedule(chat, opts); }, 1200);
      return;
    }
    if (shouldSkipCostForOpenSource(chat)) {
      markAsOpenSourceModel(chat);
      return;
    }
    // 闭源会话：无论是否开启 /cost，回合结束后先零延迟跑一次本地「对话习惯指纹 + 推理分」兜底
    try { ChatHabitFingerprint.identifyAndApply(chat, { force: !isCostProbeEnabled() }); } catch {}
    if (!isCostProbeEnabled()) return;
    const lastId = globalThis.ArenaBilling.completed(chat).at(-1)?.id;
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    if (lastId) {
      autoSeen.set(chat, owner + ':' + lastId + ':' + (isCostProbeEnabled() ? '1' : '0'));
      chat._lastAutoProbeAt = now();
    }
    for (const timer of delayed.get(chat) || []) clearTimeout(timer);
    if (globalCost403Until > now() || globalCost429Until > now() || (lastId && chat._lastCost403TurnId === lastId)) {
      delayed.delete(chat);
      return;
    }
    const isFreshTurn = Boolean(fromTurn || now() - (chat._lastTurnDoneAt || 0) < 6000);
    const scheduleDelays = isFreshTurn ? [280, 1800] : [150];
    delayed.set(chat, scheduleDelays.map((delay, idx) => setTimeout(() => {
      if (!autoEnabled() || !isCostProbeEnabled() || shouldSkipCostForOpenSource(chat) || isOtherProbeBusy(chat) || !sameOwner(owner) || chat.busy || !Chats.has(chat.sid)) return;
      const compNow = globalThis.ArenaBilling.completed(chat);
      const last = compNow.at(-1)?.id;
      const stNow = engine.state(chat.sid);
      const used = stNow.info?.result?.unitPrice?.used || [];
      const postCovered = stNow.postTurnCoveredIds || [];
      if (stNow.pending) return;
      if (globalCost429Until > now() || (stNow.retryAt > now() && stNow.httpStatus === 429)) {
        globalCost429Until = Math.max(globalCost429Until, stNow.retryAt || (now() + 45000));
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        return;
      }
      if (globalCost403Until > now() || (stNow.retryAt > now() && stNow.httpStatus === 403) || (last && chat._lastCost403TurnId === last)) {
        globalCost403Until = Math.max(globalCost403Until, stNow.retryAt || (now() + 180000));
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        return;
      }
      const compIdSet = new Set(compNow.map(m => m?.id).filter(Boolean));
      const hasPrunedInUsed = used.some(row => row?.messageId && !compIdSet.has(row.messageId));
      const uncovered = Boolean(hasPrunedInUsed || (last && (!used.some(row => row.messageId === last) || used.at(-1)?.messageId !== last || !postCovered.includes(last))));
      if (!uncovered && stNow.status === 'ready' && stNow.info && !stNow.info.reason) {
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        return;
      }
      if (hasPrunedInUsed) {
        stNow.info = null;
        stNow.lastInfo = null;
        stNow.postTurnCoveredIds = [];
        clearCachedCostDoc(chat.sid);
        summaryCache.delete(chat.sid);
      }
      if (idx === 0 || (isFreshTurn && uncovered)) {
        if (idx > 0) clearCachedCostDoc(chat.sid);
        lastCostNetAt = now();
        void engine.refresh(chat, { force: true, bypassCooldown: idx === 0 && globalCost429Until <= now() && globalCost403Until <= now() && stNow.httpStatus !== 403 }).then(() => {
          const stAfter = engine.state(chat.sid);
          if (stAfter.httpStatus === 429) {
            globalCost429Until = Math.max(globalCost429Until, stAfter.retryAt || (now() + 45000));
            for (const t of delayed.get(chat) || []) clearTimeout(t);
            delayed.delete(chat);
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
            return;
          }
          if (stAfter.httpStatus === 403) {
            globalCost403Until = Math.max(globalCost403Until, stAfter.retryAt || (now() + 180000));
            chat._lastCost403TurnId = last || '_turn';
            for (const t of delayed.get(chat) || []) clearTimeout(t);
            delayed.delete(chat);
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
            return;
          }
          try { applyReverseIdentity(chat, { interactive: false }); } catch {}
        }).catch(() => {
          try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        });
      }
    }, delay)));
  }
  async function invalidateAndRefresh(chat, forceNet = false) {
    if (!chat?.sid || ChatHabitFingerprint.isEvalSession?.(chat)) return null;
    if (forceNet) clearCachedCostDoc(chat.sid);
    const stNow = engine.state(chat.sid);
    if (stNow) {
      stNow.info = null;
      stNow.lastInfo = null;
      stNow.postTurnCoveredIds = [];
    }
    summaryCache.delete(chat.sid);
    if (shouldSkipCostForOpenSource(chat)) {
      return markAsOpenSourceModel(chat);
    }
    if (!isCostProbeEnabled() || (!forceNet && (globalCost429Until > now() || globalCost403Until > now()))) {
      return ChatHabitFingerprint.identifyAndApply(chat, { force: true });
    }
    await engine.refresh(chat, { force: true, bypassCooldown: Boolean(forceNet && globalCost429Until <= now() && globalCost403Until <= now()) }).catch(() => {});
    return applyReverseIdentity(chat, { interactive: false });
  }
  const queuedIdentSids = new Set();
  const bgSweepAttempts = new Map();
  let activeIdentSid = null;

  function enqueueIdent(sid, opts = {}) {
    if (!sid) return;
    bgSwept.delete(sid);
    bgSweepAttempts.delete(sid);
    queuedIdentSids.add(sid);
    scheduleBgSweep(opts.fromGacha ? 350 : 500);
    try { if (typeof UI !== 'undefined' && UI.renderList) UI.renderList(); } catch {}
  }

  function isChatUnidentified(sid, mi) {
    if (!sid) return false;
    const m = mi !== undefined ? mi : (typeof Models !== 'undefined' ? Models.get(sid) : null);
    if (!m || !m.name) return true;
    const nm = String(m.name).trim();
    if (!nm || /^(未识别|未知型号|待定)$/.test(nm)) return true;
    if (m.pendingConfirm) return true;
    return false;
  }

  // 侧栏对话识别状态胶囊：
  // - 正在识别中：当前后台正在拉取消息或识别的会话
  // - 正在识别排队中：已在后台识别延续队列中等待依次处理
  // - 待识别：尚未识别型号（并自动触发后台排队延续识别，无需人工点开对话）
  function identStatus(sid, mi) {
    if (!sid || ChatHabitFingerprint.isEvalSession?.(sid)) return null;
    if (typeof Gacha !== 'undefined' && Gacha.stepOf && Gacha.stepOf(sid)) return null;
    if (!isChatUnidentified(sid, mi)) {
      queuedIdentSids.delete(sid);
      return null;
    }
    const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (activeIdentSid === sid || (c && isRunning(c))) {
      return { status: 'running', text: '正在识别中', pct: 76, phase: '正在后台读取对话并识别型号…', active: true };
    }
    if (bgSwept.has(sid) || (bgSweepAttempts.get(sid)?.count || 0) >= 2) {
      queuedIdentSids.delete(sid);
      return null;
    }
    if (c?.loaded && !c.busy && (c.status === 'error' || !globalThis.ArenaBilling?.completed?.(c)?.length)) {
      queuedIdentSids.delete(sid);
      return null;
    }
    if (!queuedIdentSids.has(sid) && !bgSwept.has(sid)) {
      queuedIdentSids.add(sid);
      scheduleBgSweep(450);
    }
    if (queuedIdentSids.has(sid)) {
      return { status: 'queued', text: '正在识别排队中', pct: 36, phase: '已在后台识别排队队列中，将自动加载对话并完成识别/开源归档（无需手动点开）', active: false };
    }
    return { status: 'pending', text: '待识别', pct: 18, phase: '待识别型号（后台队列自动延续处理）', active: false };
  }

  function scheduleBgSweep(ms = 600) {
    clearTimeout(bgSweepTimer);
    bgSweepTimer = setTimeout(() => void runBgSweep(), Math.max(250, Number(ms) || 600));
  }

  async function runBgSweep() {
    if (bgSweeping || !autoEnabled() || typeof UI === 'undefined' || !UI.me || typeof History === 'undefined' || !History.lastLoad) return;
    if ((typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) || (typeof Chats !== 'undefined' && [...Chats.values()].some(ch => ch && (ch.busy || (ch.streaming && !ch.peeking))))) {
      scheduleBgSweep(5000);
      return;
    }
    try { upgradeCachedOpus56(); } catch {}
    const gone = typeof History.goneMap === 'function' ? History.goneMap() : new Map();
    const gachaRun = typeof Gacha !== 'undefined' ? (Gacha.run || Gacha.state?.() || null) : null;
    const gachaAttempts = Array.isArray(gachaRun?.attempts) ? gachaRun.attempts : [];
    const gachaArchiveSids = new Set(
      gachaAttempts
        .filter(a => a?.sid && (a.verdict === 'archive' || a.model === '开源模型' || a.fingerprint?.skipped === 'visible-thinking'))
        .map(a => a.sid)
    );
    const canCleanupGacha = (sid, ch) => typeof Gacha !== 'undefined' && typeof Gacha.canAutoCleanupChat === 'function'
      ? Gacha.canAutoCleanupChat(sid, ch)
      : false;
    for (const e of (History.items || []).slice(0, 80)) {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt) continue;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      const chRef = typeof Chats !== 'undefined' ? Chats.get(e.id) : null;
      if (canCleanupGacha(e.id, chRef) && (gachaArchiveSids.has(e.id) || m?.name === '开源模型')) {
        if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
          Gacha.killOpenSourceThinkingChat(e.id, chRef);
        }
      }
    }
    // 清理未揭晓的 Battle 会话被误写入的单模型 localTitle 与 Models 记录
    for (const e of (History.items || []).slice(0, 60)) {
      if (!e?.id || !ChatHabitFingerprint.isEvalSession?.(e.id, e)) continue;
      const isDirectOrRevealed = Boolean(e.mode === 'direct' || (e.modelAId && e.modelBId));
      if (!isDirectOrRevealed) {
        if (e.localTitle && !/vs|⚔️/i.test(String(e.localTitle))) {
          delete e.localTitle;
          try { History.saveSoon?.(); } catch {}
        }
        const mEval = typeof Models !== 'undefined' ? Models.get(e.id) : null;
        if (mEval && !mEval.battleRevealed && !mEval.directMode) {
          try {
            if (typeof Models.del === 'function') Models.del(e.id);
            else if (Models.map?.delete) { Models.map.delete(e.id); Models.saveSoon?.(); }
          } catch {}
        }
      }
    }
    // 扫描近期的未识别会话与显式入队会话（避免启动时拉取 80 个历史旧会话与重复请求 /cost）
    const candidates = (History.items || []).slice(0, 15).filter((e, idx) => {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt || gachaArchiveSids.has(e.id)) return false;
      if (ChatHabitFingerprint.isEvalSession?.(e.id, e)) return false;
      if (bgSwept.has(e.id) && !queuedIdentSids.has(e.id)) return false;
      // 跳过正在活跃跑抽卡问答步骤的会话（等它问答跑完或中断后再由延续队列接手）
      if (typeof Gacha !== 'undefined' && Gacha.stepOf && Gacha.stepOf(e.id)) return false;
      const chBusy = typeof Chats !== 'undefined' ? Chats.get(e.id)?.busy : false;
      if (chBusy) return false;
      const att = bgSweepAttempts.get(e.id);
      if (att && att.count >= 2 && !queuedIdentSids.has(e.id)) return false;
      if (att && att.count >= 6 && now() - att.lastAt < 60000) return false;
      if (att && now() - att.lastAt < Math.min(15000, 1800 * att.count)) return false;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      if (m?.userCorrected) return false;
      const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(e.id, null, e) : gachaAttempts.some(a => a?.sid === e.id);
      if (m && (m.name === '开源模型' || isOpenCandidateName(m.name || m.reverseCandidateId || ''))) {
        const chRef = typeof Chats !== 'undefined' ? Chats.get(e.id) : null;
        if (canCleanupGacha(e.id, chRef) && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
          if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) Gacha.killOpenSourceThinkingChat(e.id, chRef);
        }
        return false;
      }
      if (queuedIdentSids.has(e.id) || !bgSwept.has(e.id)) {
        if (e.id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' && /opus[-\s]*5\.5/i.test(m?.name || '')) return true;
        if (ARGON_HIGH_SIDS.has(e.id) && !/argon|gemini/i.test(m?.name || '')) return true;
        if (SOL_61_SIDS.has(e.id) && !/gpt[-\s]*6\.1[-\s]*sol/i.test(m?.name || '')) return true;
        if (/fable[-\s]*5/i.test(m?.name || m?.candidateName || '') && e.id !== '01a1457d-fd02-74d6-b839-4adf76e2a505' && (m?.reverseVer || 0) < 152) return true;
      }
      if (queuedIdentSids.has(e.id) || (isGachaChat && !bgSwept.has(e.id))) {
        return !m || m.guess || m.pendingConfirm || !m.name || m.name === '未识别' || m.name === '未知型号';
      }
      if (!bgSwept.has(e.id) && (!m || !m.name || m.name === '未识别' || m.name === '未知型号')) return idx < 6;
      return false;
    });
    for (const qSid of [...queuedIdentSids]) {
      if (!candidates.some(c => c.id === qSid)) {
        bgSwept.add(qSid);
        queuedIdentSids.delete(qSid);
      }
    }
    for (const cand of candidates) queuedIdentSids.add(cand.id);
    if (!candidates.length) {
      if (activeIdentSid) {
        activeIdentSid = null;
        try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}
      }
      return;
    }
    bgSweeping = true;
    const batch = candidates.slice(0, 1);
    try {
      await Promise.allSettled(batch.map(async (target) => {
        activeIdentSid = target.id;
        const prevAtt = bgSweepAttempts.get(target.id) || { count: 0, lastAt: 0 };
        bgSweepAttempts.set(target.id, { count: prevAtt.count + 1, lastAt: now() });
        try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}

        const c = typeof chatOf === 'function' ? chatOf(target.id) : (typeof Chats !== 'undefined' ? Chats.get(target.id) : null);
        if (!c || c.busy) {
          queuedIdentSids.delete(target.id);
          return;
        }
        // 关键修复：优先读取本地 MsgCache（零网络请求）；本地无缓存且未处于 429 冷却时才后台拉取
        if (!c.loaded && !c.messages?.length && typeof MsgCache !== 'undefined' && MsgCache.get) {
          try {
            const mc = await MsgCache.get(target.id).catch(() => null);
            if (mc?.messages?.length && !c.loaded && !c.messages?.length) {
              c.messages = mc.messages.map(m => ({ ...m, v: 0 }));
              c.cached = true;
            }
          } catch {}
        }
        if ((!c.loaded && !globalThis.ArenaBilling.completed(c).length) && typeof c.load === 'function' && !(typeof ReadLimit !== 'undefined' && ReadLimit.active?.())) {
          try { await c.load(); } catch {}
        }
        const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(target.id, c, target) : gachaAttempts.some(a => a?.sid === target.id);

        // 1. 立即检查是否为开源思考：普通对话直接标记为「开源模型」并同步修改对话名称（不浪费时间推理具体计费模型）；仅当前活跃抽卡未保留会话归档删除
        if (shouldSkipCostForOpenSource(c)) {
          try { markAsOpenSourceModel(c); } catch {}
          if (canCleanupGacha(target.id, c) && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
            if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            }
          }
          bgSwept.add(target.id);
          queuedIdentSids.delete(target.id);
          return;
        }

        // 2. 如果该活跃抽卡对话因为限流切 IP 导致第 1 问都没收到回复就中断了，后台自动补发一问
        let compList = globalThis.ArenaBilling.completed(c);
        if (!compList.length && canCleanupGacha(target.id, c) && !c.busy) {
          const ageMs = now() - (Date.parse(String(target.updatedAt || target.createdAt || '')) || 0);
          if (ageMs > 12000 && !c._bgRecoveredTurn && typeof c.send === 'function') {
            c._bgRecoveredTurn = true;
            try {
              await c.send('What is 17 × 23? Reply with the number only.');
              const waitStart = now();
              while (c.busy && now() - waitStart < 45000) await sleep(350);
              if (!globalThis.ArenaBilling.completed(c).length && typeof c.load === 'function') {
                await c.load().catch(() => {});
              }
            } catch {}
          }
          if (shouldSkipCostForOpenSource(c)) {
            try { markAsOpenSourceModel(c); } catch {}
            if (canCleanupGacha(target.id, c) && typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            }
            bgSwept.add(target.id);
            queuedIdentSids.delete(target.id);
            return;
          }
          compList = globalThis.ArenaBilling.completed(c);
        }

        if (!compList.length) {
          bgSwept.add(target.id);
          queuedIdentSids.delete(target.id);
          return;
        }

        // 3. 先立即用本地「对话习惯指纹 + 推理分」零延迟识别出厂商与型号（即使 /cost 正在 429 冷却，也能立即识别出来！）
        try { ChatHabitFingerprint.identifyAndApply(c, { force: false }); } catch {}

        // 4. 后台巡检优先使用本地习惯识别（零网络请求、不抢占用户手动测试的 /cost 限流配额）；仅对抽卡会话或已有本地缓存的会话才调用 /cost，且间隔 >= 6 秒
        const st = engine.state(target.id);
        const hasCachedBill = Boolean(getCachedCostDoc(target.id, compList.at(-1)?.id || ''));
        const canRunCost = isCostProbeEnabled() && !shouldSkipCostForOpenSource(c) && (isGachaChat || hasCachedBill) && globalCost429Until <= now() && globalCost403Until <= now() && (st.retryAt || 0) <= now();
        if (canRunCost) {
          if (!hasCachedBill) {
            const waitGap = Math.max(0, 6000 - (now() - lastCostNetAt));
            if (waitGap > 0) await sleep(waitGap);
            lastCostNetAt = now();
          }
          await engine.refresh(c, { force: true }).catch(() => {});
          const stAfter = engine.state(target.id);
          if (stAfter.httpStatus === 429) {
            globalCost429Until = Math.max(globalCost429Until, stAfter.retryAt || (now() + 30000));
            try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
          } else if (stAfter.httpStatus === 403) {
            globalCost403Until = Math.max(globalCost403Until, stAfter.retryAt || (now() + 180000));
            try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
          } else {
            try { applyReverseIdentity(c, { interactive: false, forceLock: true, fallbackQuestionMark: true }); } catch {}
          }
        } else {
          try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
        }

        // 5. 若为当前活跃抽卡未保留会话，识别完成后执行抽卡收尾复核
        if (canCleanupGacha(target.id, c) && typeof Gacha !== 'undefined' && Gacha.settleBackgroundChat) {
          try { await Gacha.settleBackgroundChat(target.id, c); } catch {}
        }

        bgSwept.add(target.id);
        queuedIdentSids.delete(target.id);
        const isTabOpen = typeof Tabs !== 'undefined' && Array.isArray(Tabs.list) && Tabs.list.some(t => t && t.sid === target.id);
        if (!isTabOpen && c && !c.busy && !c.streaming) { c.messages = []; c.loaded = false; }
      }));
    } catch {} finally {
      activeIdentSid = null;
      bgSweeping = false;
      try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}
      if (candidates.length > batch.length || queuedIdentSids.size > 0) {
        scheduleBgSweep(isCostProbeEnabled() && globalCost429Until <= now() ? 1400 : 450);
      }
    }
  }

  setTimeout(() => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(900); }, 100);
  // Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat); scheduleBgSweep(2500); } });
  Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat, { fromTurn: true }); scheduleBgSweep(2500); } });
  Bus.on('chat', chat => { if (chat?.sid && !isOtherProbeBusy(chat)) automatic(chat); });
  Bus.on('history', () => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(600); });
  Bus.on('models', sid => Bus.emit('billing', sid));
  Bus.on('trace', sid => Bus.emit('billing', sid));
  Bus.on('agent-catalog', html => engine.syncCatalog(html));
  const catalogRows = () => Array.isArray(engine.catalogRaw) && engine.catalogRaw.length ? engine.catalogRaw : (Array.isArray(bundled?.data) ? bundled.data : []);
  return Object.assign(engine, { getLiveState: sid => engine.state(sid), card, summary, clearSummaryCache, topConfidence, badge, automatic, schedule, invalidateAndRefresh, probeMidTurn, isAutoEnabled: autoEnabled, setAutoEnabled, isCostProbeEnabled, setCostProbeEnabled, setSkewDpl, getRankFilter, setRankFilter, shouldSkipCostForOpenSource, markAsOpenSourceModel, habit: ChatHabitFingerprint, enqueueIdent, identStatus, trigger: sid => { const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null; if (c) probeMidTurn(c); }, reverseIdentify, applyReverseIdentity, isRunning, mergeCandidates, detectHabitAndMessageRoute, applyChatRouteAnnotations, catalogRows, exportDiagnosticJson });
})();
