          if (!f) continue;
          feed(f.path || '');
          feed(f.content || '');
        }
      } else if (m.webdev?.files && typeof m.webdev.files === 'object') {
        for (const [fp, fc] of Object.entries(m.webdev.files)) {
          feed(fp || '');
          feed(typeof fc === 'string' ? fc : JSON.stringify(fc ?? ''));
        }
      }
    }
    return msgs.length + ':' + totalLen + ':' + h.toString(36);
  }

  function getBankSampleBySid(sid) {
    if (!sid) return null;
    loadBank();
    if (isSampleTombstoned(sid)) return null;
    return _cachedBankBySid ? (_cachedBankBySid.get(String(sid)) || null) : null;
  }

  let _initialBuiltinArchetypes = null;
  function getInitialBuiltinArchetypes() {
    if (_initialBuiltinArchetypes) return _initialBuiltinArchetypes;
    const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
    const rawList = [...(Array.isArray(builtin?.samples) ? builtin.samples : []), ...(Array.isArray(builtin?.extendedSamples) ? builtin.extendedSamples : [])];
    _initialBuiltinArchetypes = rawList.map(s => sanitizeBankSample(s)).filter(Boolean);
    try { builtin?.__releaseSamples?.(); } catch {}
    return _initialBuiltinArchetypes;
  }

  function loadBank() {
    if (!_initialBuiltinArchetypes) getInitialBuiltinArchetypes();
    if (_cachedBankSamples && _cachedBankRev === bankRev) return _cachedBankSamples;
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(BANK_KEY, null) : null;
      if (raw?.tombstones && typeof raw.tombstones === 'object') {
        for (const [tk, tv] of Object.entries(raw.tombstones)) {
          if (!tk || !tv) continue;
          const prevT = _bankTombstones.get(tk);
          if (!prevT || (Number(tv.deletedAt) || 0) >= (Number(prevT.deletedAt) || 0)) {
            _bankTombstones.set(tk, { sid: tk, deletedAt: Number(tv.deletedAt) || Date.now(), rev: Number(tv.rev) || 1, reason: String(tv.reason || 'retracted') });
          }
        }
      }
      const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
      const nowCap = Date.now() - 60000;
      const isExplicitEmptyReset = Boolean(raw?.replace && Array.isArray(raw?.samples) && raw.samples.length === 0);
      const baseBuiltins = (_initialBuiltinArchetypes && _initialBuiltinArchetypes.length) ? _initialBuiltinArchetypes : [...(Array.isArray(builtin?.samples) ? builtin.samples : []), ...(Array.isArray(builtin?.extendedSamples) ? builtin.extendedSamples : [])];
      const builtinSamples = isExplicitEmptyReset ? [] : baseBuiltins.map(s => (s && s.at > nowCap) ? { ...s, at: nowCap } : s);
      const rawSamples = Array.isArray(raw) ? raw : (Array.isArray(raw?.samples) ? raw.samples : []);
      let changed = Boolean(builtin?.builtinRev && raw?.builtinRev !== builtin.builtinRev);
      const bySid = new Map();
      for (const s of [...builtinSamples, ...rawSamples]) {
        const clean = sanitizeBankSample(s);
        if (!clean) { changed = true; continue; }
        const k = clean.sid || `${clean.model}:${clean.at || 0}`;
        if (isSampleTombstoned(k, clean.at || 0)) { changed = true; continue; }
        const prev = bySid.get(k);
        if (!prev) {
          bySid.set(k, clean);
        } else {
          const sRank = (clean.userConfirmed && !clean.autoTeacher) || clean.importedFromDiag ? 2 : (clean.userConfirmed ? 1 : 0);
          const pRank = (prev.userConfirmed && !prev.autoTeacher) || prev.importedFromDiag ? 2 : (prev.userConfirmed ? 1 : 0);
          const win = (sRank > pRank) || (sRank === pRank && (clean.at || 0) >= (prev.at || 0)) ? clean : prev;
          const lose = win === clean ? prev : clean;
          const rich = pickRichBankVecMeta(win, lose);
          bySid.set(k, {
            ...prev,
            ...win,
            vec: rich.vec,
            meta: rich.meta,
            userConfirmed: Boolean(prev.userConfirmed || clean.userConfirmed),
            autoTeacher: sRank > pRank ? Boolean(clean.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
            importedFromDiag: Boolean(prev.importedFromDiag || clean.importedFromDiag),
          });
        }
      }
      const samples = [...bySid.values()].sort((a, b) =>
        (Number(Boolean(b.userConfirmed && !b.autoTeacher)) - Number(Boolean(a.userConfirmed && !a.autoTeacher))) ||
        (Number(Boolean(b.userConfirmed || b.importedFromDiag)) - Number(Boolean(a.userConfirmed || a.importedFromDiag))) ||
        ((b.at || 0) - (a.at || 0))
      );
      if (samples.length !== rawSamples.length) changed = true;
      _cachedBankSamples = samples;
      _cachedBankBySid = bySid;
      _cachedBankRev = bankRev;
      if (changed && rawSamples.length > 0 && typeof Store !== 'undefined' && Store.set) {
        try { Store.set(BANK_KEY, { v: 3, builtinRev: builtin?.builtinRev || 0, updatedAt: Date.now(), samples, tombstones: Object.fromEntries(_bankTombstones), calibration: loadCalibration() }); } catch {}
      }
      if (!sharedBankLoaded && typeof Host !== 'undefined' && typeof Host.shared === 'function') {
        void syncFromSharedHost();
      }
      return samples;
    } catch {
      return [];
    }
  }

  const CALIB_KEY = 'habit:calibration:v1';
  const calibratedSessionKeys = new Set();
  function loadCalibration() {
    if (_cachedCalibration) return _cachedCalibration;
    const builtinCal = (typeof globalThis !== 'undefined' && globalThis.BUILTIN_HABIT_BANK?.calibration) ? globalThis.BUILTIN_HABIT_BANK.calibration : null;
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(CALIB_KEY, null) : null;
      if (raw && typeof raw === 'object' && raw.protoCentroids && raw.scoreOffsets) {
        let healed = false;
        if (builtinCal?.protoCentroids) {
          for (const [mk, bv] of Object.entries(builtinCal.protoCentroids)) {
            if (!raw.protoCentroids[mk]) { raw.protoCentroids[mk] = { ...bv }; healed = true; }
          }
        }
        if (builtinCal?.scoreOffsets) {
          for (const [mk, bs] of Object.entries(builtinCal.scoreOffsets)) {
            if (!raw.scoreOffsets[mk]) { raw.scoreOffsets[mk] = { ...bs }; healed = true; }
          }
        }
        if (raw.protoCentroids?.muse) { delete raw.protoCentroids.muse; healed = true; }
        if (raw.scoreOffsets?.muse) { delete raw.scoreOffsets.muse; healed = true; }
        for (const v of Object.values(raw.protoCentroids)) {
          if (v && (Number(v.count) || 0) > 50) { v.count = 12; healed = true; }
        }
        for (const v of Object.values(raw.scoreOffsets)) {
          if (v && (Number(v.count) || 0) > 50) { v.count = 12; healed = true; }
        }
        if (!raw.tierCentroids) raw.tierCentroids = {};
        if (!raw.intraFamilyHyperplanes) raw.intraFamilyHyperplanes = {};
        if (!raw.vendorTierDeltas) raw.vendorTierDeltas = {};
        if (!raw.modalityProfiles) raw.modalityProfiles = {};
        // 自动清理因历史双档位拼接（如 claude-opus-5.5-high-low）或合成伪质心（syntheticMargin）残留的污染键
        for (const mapObj of [raw.protoCentroids, raw.scoreOffsets, raw.tierCentroids, raw.dimWeights, raw.repelledModels]) {
          if (!mapObj || typeof mapObj !== 'object') continue;
          for (const k of Object.keys(mapObj)) {
            const v = mapObj[k];
            const cleanK = sanitizeCorruptedTierSlug(k);
            if (v?.syntheticMargin || cleanK !== k || /-(none|minimal|low|medium|high|xhigh|max)-(none|minimal|low|medium|high|xhigh|max)$/i.test(k)) {
              delete mapObj[k];
              healed = true;
            }
          }
        }
        if (healed && typeof Store !== 'undefined' && Store.set) {
          try { Store.set(CALIB_KEY, raw); } catch {}
        }
        _cachedCalibration = raw;
        return raw;
      }
    } catch {}
    if (builtinCal && builtinCal.protoCentroids && builtinCal.scoreOffsets) {
      const seeded = {
        v: 3,
        protoCentroids: { ...builtinCal.protoCentroids },
        scoreOffsets: { ...builtinCal.scoreOffsets },
        dimWeights: { ...(builtinCal.dimWeights || {}) },
        repelledModels: { ...(builtinCal.repelledModels || {}) },
        tierCentroids: { ...(builtinCal.tierCentroids || {}) },
        intraFamilyHyperplanes: { ...(builtinCal.intraFamilyHyperplanes || {}) },
        vendorTierDeltas: { ...(builtinCal.vendorTierDeltas || {}) },
        modalityProfiles: { ...(builtinCal.modalityProfiles || {}) },
        reverseCalib: builtinCal.reverseCalib || { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
        updatedAt: builtinCal.updatedAt || Date.now(),
      };
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(CALIB_KEY, seeded); } catch {}
      _cachedCalibration = seeded;
      try {
        if (typeof ArenaPricing !== 'undefined' && typeof ArenaPricing.setReverseCalibration === 'function' && seeded.reverseCalib) {
          ArenaPricing.setReverseCalibration(seeded.reverseCalib);
        }
      } catch {}
      return seeded;
    }
    _cachedCalibration = {
      v: 3,
      protoCentroids: {},
      scoreOffsets: {},
      dimWeights: {},
      repelledModels: {},
      tierCentroids: {},
      intraFamilyHyperplanes: {},
      vendorTierDeltas: {},
      modalityProfiles: {},
      reverseCalib: { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
      updatedAt: 0,
    };
    return _cachedCalibration;
  }

  function syncPricingReverseCalib(cal) {
    try {
      if (cal && cal.reverseCalib && typeof ArenaPricing !== 'undefined' && typeof ArenaPricing.setReverseCalibration === 'function') {
        ArenaPricing.setReverseCalibration(cal.reverseCalib);
      }
    } catch {}
  }

  function saveCalibration(cal) {
    if (cal && typeof cal === 'object') {
      if (!cal.dimWeights) cal.dimWeights = {};
      if (!cal.repelledModels) cal.repelledModels = {};
      if (!cal.tierCentroids) cal.tierCentroids = {};
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.vendorTierDeltas) cal.vendorTierDeltas = {};
      if (!cal.modalityProfiles) cal.modalityProfiles = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
    }
    _cachedCalibration = cal;
    calibRev++;
    _analyzeCache.clear();
    _featCache.clear();
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    syncPricingReverseCalib(cal);
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set(CALIB_KEY, cal);
    } catch {}
    return cal;
  }

  const EFFORT_TIER_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];

  function parseModelFamilyAndTier(rawModel) {
    const mKey = String(rawModel || '');
    const hit = _parseFamTierMemo.get(mKey);
    if (hit !== undefined) return hit;
    const res = _parseModelFamilyAndTier0(mKey);
    if (_parseFamTierMemo.size > 2400) _parseFamTierMemo.clear();
    _parseFamTierMemo.set(mKey, res);
    return res;
  }
  function _parseModelFamilyAndTier0(rawModel) {
    const rawClean = sanitizeCorruptedTierSlug(String(rawModel || '').replace(/[?？]+$/, '').trim(), rawModel);
    const canonRaw = rawClean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawClean) : rawClean);
    const clean = sanitizeCorruptedTierSlug(String(canonRaw || '').replace(/[?？]+$/, '').trim(), rawModel);
    const decomp = decomposeModelIdentity(clean, { rawLabel: rawClean });
    // 开源型号自带 -max 后缀（如 qwen3.8-max、glm-5.3-max）或无档位型号属于型号名本身，绝非思考强度档位
    if (MODEL_NAME_MAX_RE.test(clean) || OPEN_NO_TIER_BASE_RE.test(clean) || !decomp.hasExplicitTier) {
      const fk = decomp.family || clean.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
      return {
        canon: clean,
        baseLabel: decomp.familyLabel || rawClean,
        famKey: fk,
        vendor: decomp.vendor,
        tier: '',
        effort: 'standard',
        hasExplicitTier: false,
      };
    }
    const mParen = /^(.*?)\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(rawClean) ||
                   /^(.*?)\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(clean);
    if (mParen) {
      const baseLabel = mParen[1].trim().replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '');
      const rawTier = mParen[2].toLowerCase();
      const tier = (rawTier === 'none' || rawTier === 'minimal') ? 'low' : rawTier;
      return {
        canon: clean,
        baseLabel,
        famKey: decomp.family || baseLabel.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
        vendor: decomp.vendor,
        tier,
        effort: tier,
        hasExplicitTier: true,
      };
    }
    const mDash = /^(.*?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(clean);
    if (mDash && !OPEN_NO_TIER_BASE_RE.test(mDash[1]) && !MODEL_NAME_MAX_RE.test(mDash[1])) {
      const baseLabel = mDash[1].trim().replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '');
      const rawTier = mDash[2].toLowerCase();
      const tier = (rawTier === 'none' || rawTier === 'minimal') ? 'low' : rawTier;
      return {
        canon: clean,
        baseLabel,
        famKey: decomp.family || baseLabel.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
        vendor: decomp.vendor,
        tier,
        effort: tier,
        hasExplicitTier: true,
      };
    }
    return {
      canon: clean,
      baseLabel: clean,
      famKey: decomp.family || clean.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
      vendor: decomp.vendor,
      tier: '',
      effort: 'standard',
      hasExplicitTier: false,
    };
  }

  function formatFamilyTierCanon(baseLabel, tier) {
    if (!baseLabel || !tier || tier === 'standard' || tier === '标准') return baseLabel || '';
    const rawNoParen = String(baseLabel)
      .replace(/[?？]+$/, '')
      .replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max|标准|standard)\)\s*$/i, '')
      .trim();
    if (!rawNoParen || MODEL_NAME_MAX_RE.test(rawNoParen) || OPEN_NO_TIER_BASE_RE.test(rawNoParen)) {
      return (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawNoParen) : rawNoParen;
    }
    const cleanBase = rawNoParen.replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim();
    if (!cleanBase || MODEL_NAME_MAX_RE.test(cleanBase) || OPEN_NO_TIER_BASE_RE.test(cleanBase)) {
      return (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(cleanBase) : cleanBase;
    }
    const tDisp = tier === 'xhigh' ? 'xHigh' : (tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase());
    const candidate = cleanBase.includes(' ') ? (cleanBase + ' (' + tDisp + ')') : (cleanBase + '-' + tier.toLowerCase());
    return sanitizeCorruptedTierSlug((typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(candidate) : candidate, baseLabel);
  }

  // 将内部规范化型号名（如 claude-opus-5.5-high）转换为人类可读展示名（如 Claude Opus 5.5 (High)），杜绝出现 claude-opus-5.5-high-low 等原始 slug
  function formatDisplayModelLabel(rawOrCanon, fallbackLabel = '') {
    const mKey = String(rawOrCanon || '') + '\u0001' + String(fallbackLabel || '');
    const mHit = _dispLabelMemo.get(mKey);
    if (mHit !== undefined) return mHit;
    const cleanRaw = sanitizeCorruptedTierSlug(String(rawOrCanon || fallbackLabel || '').replace(/[?？]+$/, '').trim(), fallbackLabel || rawOrCanon);
    if (!cleanRaw || cleanRaw === '开源模型') return cleanRaw;
    const cKey = String((typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleanRaw) : cleanRaw) || cleanRaw).toLowerCase();
    const exactProto = getProtoByCanon(cKey);
    const out = exactProto ? exactProto.label : (decomposeModelIdentity(cleanRaw, { rawLabel: fallbackLabel })?.displayLabel || cleanRaw);
    if (_dispLabelMemo.size > 2400) _dispLabelMemo.clear();
    _dispLabelMemo.set(mKey, out);
    return out;
  }

  // 独立强度识别器（Standalone Effort / Intensity Classifier）：
  // 将思考强度（Low / Medium / High / xHigh / Max）从型号本体习惯中彻底解耦出来单独识别，避免与型号家族习惯互相冲突
  function identifyEffortTier(feat, famKey = '', calib = null) {
    if (famKey && (OPEN_NO_TIER_BASE_RE.test(famKey) || MODEL_NAME_MAX_RE.test(famKey))) {
      return { tier: 'standard', scores: {} };
    }
    if (!feat || !Array.isArray(feat.tierVec) || feat.tierVec.length !== 12) return null;
    const cal = calib || loadCalibration();
    const tv = feat.tierVec;
    const mod = String(feat.evalModality || (feat.totalTools > 0 ? 'agent' : 'chat')).toLowerCase();
    const TIER_IDEAL_EFFORT = { low: 0.25, medium: 0.48, high: 0.68, xhigh: 0.81, max: 0.92 };
    const scores = {};
    for (const t of EFFORT_TIER_ORDER) {
      const ideal = TIER_IDEAL_EFFORT[t] ?? 0.68;
      const actual = (Number(tv[11]) || 0.65) * 0.50 + (Number(tv[0]) || 0.50) * 0.25 + (Number(tv[4]) || 0.50) * 0.15 + (Number(tv[10]) || 0.60) * 0.10;
      scores[t] = (0.22 - Math.abs(actual - ideal)) * 1.15;
    }
    if (famKey && cal?.tierCentroids) {
      for (const [ck, cent] of Object.entries(cal.tierCentroids)) {
        if (!cent || cent.syntheticMargin || !Array.isArray(cent.tierVec) || cent.tierVec.length !== 12) continue;
        const p = parseModelFamilyAndTier(ck);
        if (p.famKey === famKey && p.tier && scores[p.tier] !== undefined) {
          const sim = tierVecSimilarity(tv, cent.tierVec, mod, cent.stdVec);
          if (sim != null) scores[p.tier] += (sim - 0.75) * 2.4;
        }
      }
    }
    if (famKey && cal?.intraFamilyHyperplanes?.[famKey]) {
      for (const [pk, hObj] of Object.entries(cal.intraFamilyHyperplanes[famKey])) {
        if (!hObj || !Array.isArray(hObj.wVec) || hObj.wVec.length !== 12) continue;
        const [hiT, loT] = pk.split('>');
        const proj = tv.reduce((acc, val, idx) => acc + (Number(hObj.wVec[idx]) || 0) * (Number(val) || 0), 0);
        const margin = proj - (Number(hObj.threshold) || 0);
        const step = Math.max(-0.18, Math.min(0.18, margin * 1.35));
        if (scores[hiT] !== undefined) scores[hiT] += step;
        if (scores[loT] !== undefined) scores[loT] -= step;
      }
    }
    let bestTier = 'high', bestScore = -999;
    for (const t of EFFORT_TIER_ORDER) {
      if (scores[t] > bestScore) {
        bestScore = scores[t];
        bestTier = t;
      }
    }
    return { tier: bestTier, scores };
  }

  // Battle 揭晓型号规范化：严格保持揭晓型号原始归属，清理任何双重档位后缀，绝不给无档位型号强行捏造冲突档位后缀
  function resolveBattleModelWithTier(rawName) {
    return sanitizeCorruptedTierSlug(canonHabitModelName(rawName), rawName);
  }

  // 弹性方向纠偏（Elastic Directional Pull）：将用户的单点纠偏转化为「主目标 + 邻近思考档位 + 同价位折射 + 旧模型排斥」的软标签场，同时拟合双引擎；
  // 当 weight >= 8.0（Battle 100% 盲测真值校准）时，切换为高比重精准单档锚定 + 强排他对比排斥模式，绝不模糊相邻强度档位
  function recordElasticCorrection(chat, feat, oldModelRaw, targetModelRaw, targetScore, weight = 3.5) {
    try {
      const cal = loadCalibration();
      if (!cal.dimWeights) cal.dimWeights = {};
      if (!cal.repelledModels) cal.repelledModels = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
      const rc = cal.reverseCalib;
      if (!rc.effortScales) rc.effortScales = {};
      if (!rc.tierLogPriors) rc.tierLogPriors = {};
      if (!rc.modelResidualBias) rc.modelResidualBias = {};

      const isBattleTruth = (Number(weight) || 0) >= 8.0;
      const tgt = parseModelFamilyAndTier(targetModelRaw);
      const old = oldModelRaw ? parseModelFamilyAndTier(oldModelRaw) : null;
      const tgtKey = String(tgt.canon || '').toLowerCase();
      const oldKey = old ? String(old.canon || '').toLowerCase() : '';
      const isDiffModel = Boolean(oldKey && oldKey !== tgtKey && oldKey !== '开源模型');

      // 1. 构建软邻域分布 Q(m)：Battle 真值采用 1.0 独享锚定以拉开档位差距；普通手动纠偏采用软邻域过渡
      const softTargets = {};
      if (tgt.canon && tgt.canon !== '开源模型') {
        if (isBattleTruth) {
          softTargets[tgt.canon] = 1.0;
        } else {
          softTargets[tgt.canon] = 0.58;
          const tIdx = EFFORT_TIER_ORDER.indexOf(tgt.tier);
          if (tIdx >= 0) {
            // 如果是从更高档位往低档位拉（如 6.1sol-medium -> astra-low），中间过渡档位（如 astra-medium）获得更强软牵引 (0.28)
            const oldTIdx = old ? EFFORT_TIER_ORDER.indexOf(old.tier) : -1;
            const pullDir = (oldTIdx >= 0 && oldTIdx !== tIdx) ? Math.sign(oldTIdx - tIdx) : 0;
            for (const delta of [-1, 1]) {
              const adjIdx = tIdx + delta;
              if (adjIdx >= 0 && adjIdx < EFFORT_TIER_ORDER.length) {
                const adjTier = EFFORT_TIER_ORDER[adjIdx];
                const adjCanon = formatFamilyTierCanon(tgt.baseLabel, adjTier);
                const protoExists = PROTOTYPES.some(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === adjCanon.toLowerCase());
                if (protoExists && adjCanon.toLowerCase() !== tgtKey) {
                  const isBridgeTier = (pullDir !== 0 && delta === pullDir) || (tIdx === 0 && delta === 1) || (tIdx === EFFORT_TIER_ORDER.length - 1 && delta === -1);
                  softTargets[adjCanon] = isBridgeTier ? 0.28 : 0.16;
                }
              }
            }
          }
          // 同家族/跨家族档位折射：若原识别家族与目标家族不同且档位不同，对原识别家族在目标档位上施加 0.18 的软折射
          if (old && old.baseLabel && old.famKey !== tgt.famKey && old.tier !== tgt.tier) {
            const refractedOld = formatFamilyTierCanon(old.baseLabel, tgt.tier);
            const protoExists = PROTOTYPES.some(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === refractedOld.toLowerCase());
            if (protoExists && refractedOld.toLowerCase() !== oldKey) {
              softTargets[refractedOld] = 0.18;
            }
          }
        }
      }

      // 2. 仅对主目标型号执行加权原型质心牵引（不把当前样本混入相邻强度档位质心，防止 Low/Medium/High/Max 质心坍塌）
      const sid = String(chat?.sid || '');
      const hasTools = Boolean(feat && (feat.totalTools || 0) > 0);
      for (const [mCanon, qWeight] of Object.entries(softTargets)) {
        if (qWeight < 0.55) continue;
        const effW = Math.max(0.35, weight * qWeight);
        const adjScore = Number.isFinite(+targetScore) ? Math.max(18, Math.min(98, +targetScore)) : null;
        recordTeacherCalibration(mCanon, feat, adjScore, effW, sid);
      }

      // 3. 对被排除的旧模型/对手模型施加对比排斥（Contrastive Repulsion）与特征维度自适应加权（Metric Diagonal Adaptation）
      if (isDiffModel && feat && Array.isArray(feat.vec) && feat.vec.length === 20) {
        const oldProto = cal.protoCentroids[oldKey] || PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === oldKey);
        if (oldProto && Array.isArray(oldProto.vec) && oldProto.vec.length === 20) {
          const repelAlpha = isBattleTruth ? 0.14 : 0.09;
          const repelledVec = oldProto.vec.map((v, i) => {
            const fv = Number(feat.vec[i]) || 0;
            const pv = Number(v) || 0;
            if (i <= 1 || (!hasTools && i >= 2 && i <= 9)) return pv;
            const nextV = Math.max(0, Math.min(1, pv - repelAlpha * (fv - pv)));
            return Math.round(nextV * 1000) / 1000;
          });
          cal.protoCentroids[oldKey] = {
            vec: repelledVec,
            meta: cal.protoCentroids[oldKey]?.meta || null,
            count: Math.max(1, (cal.protoCentroids[oldKey]?.count || 1)),
            updatedAt: Date.now(),
          };
          // 自适应调整目标模型在 20 维特征上的敏感度权重（无工具的纯对话不调整工具维 2..9）
          const tgtProto = cal.protoCentroids[tgtKey] || PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === tgtKey);
          if (tgtProto && Array.isArray(tgtProto.vec) && tgtProto.vec.length === 20) {
            const curWeights = Array.isArray(cal.dimWeights[tgtKey]) && cal.dimWeights[tgtKey].length === 20
              ? [...cal.dimWeights[tgtKey]]
              : new Array(20).fill(1.0);
            const gainMult = isBattleTruth ? 0.32 : 0.22;
            const maxDimW = isBattleTruth ? 1.65 : 1.50;
            for (let i = 2; i < 20; i++) {
              if (!hasTools && i >= 2 && i <= 9) continue;
              const dOld = Math.abs((Number(feat.vec[i]) || 0) - (Number(oldProto.vec[i]) || 0));
              const dTgt = Math.abs((Number(feat.vec[i]) || 0) - (Number(tgtProto.vec[i]) || 0));
              const gain = (dOld - dTgt) * gainMult;
              curWeights[i] = Math.round(Math.max(0.65, Math.min(maxDimW, curWeights[i] + gain)) * 1000) / 1000;
            }
            cal.dimWeights[tgtKey] = curWeights;
          }
        }
        const repelKeys = new Set([oldKey]);
        if (chat && Array.isArray(chat._lastHabitTopKeys)) {
          for (const hk of chat._lastHabitTopKeys) {
            if (hk && hk !== tgtKey && !Object.keys(softTargets).some(sk => sk.toLowerCase() === hk)) {
              repelKeys.add(hk);
            }
          }
        }
        for (const rk of repelKeys) {
          const prevRepel = Array.isArray(cal.repelledModels[rk]) ? cal.repelledModels[rk] : [];
          const filteredRepel = prevRepel.filter(r => r && r.sid !== sid).slice(0, 15);
          filteredRepel.unshift({
            sid,
            vec: feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
            meta: extractCompactMeta(feat),
            target: tgt.canon,
            battleRepel: isBattleTruth,
            weight: Math.round((Number(weight) || 3.5) * 10) / 10,
            at: Date.now(),
          });
          cal.repelledModels[rk] = filteredRepel;
        }
      }

      // 4. 同步拟合计费反推引擎参数（Reverse Engine Co-Fitting: tierLogPriors + effortScales + modelResidualBias）
      const registerFamPriors = (famKey, tier, deltaMain, deltaAdj = 0) => {
        if (!famKey) return;
        if (!rc.tierLogPriors[famKey]) rc.tierLogPriors[famKey] = {};
        const cur = Number(rc.tierLogPriors[famKey][tier]) || 0;
        rc.tierLogPriors[famKey][tier] = Math.round(Math.max(-0.65, Math.min(0.65, cur + deltaMain)) * 1000) / 1000;
        if (deltaAdj !== 0) {
          const tIdx = EFFORT_TIER_ORDER.indexOf(tier);
          for (const d of [-1, 1]) {
            const adjT = EFFORT_TIER_ORDER[tIdx + d];
            if (adjT) {
              const cAdj = Number(rc.tierLogPriors[famKey][adjT]) || 0;
              rc.tierLogPriors[famKey][adjT] = Math.round(Math.max(-0.65, Math.min(0.65, cAdj + deltaAdj)) * 1000) / 1000;
            }
          }
        }
      };

      if (!isBattleTruth) {
        registerFamPriors(tgt.famKey, tgt.tier, 0.14, 0.05);
      }
      const prevBiasTgt = Number(rc.modelResidualBias[tgt.famKey]) || 0;
      rc.modelResidualBias[tgt.famKey] = Math.round(Math.max(-0.012, Math.min(0.012, prevBiasTgt - 0.0024)) * 10000) / 10000;

      if (old && old.famKey) {
        if (old.famKey !== tgt.famKey || old.tier !== tgt.tier) {
          registerFamPriors(old.famKey, old.tier, -0.22, 0);
          registerFamPriors(old.famKey, tgt.tier, 0.16, 0.08);
        }
        if (old.famKey !== tgt.famKey) {
          const prevBiasOld = Number(rc.modelResidualBias[old.famKey]) || 0;
          rc.modelResidualBias[old.famKey] = Math.round(Math.max(-0.012, Math.min(0.012, prevBiasOld + 0.0016)) * 10000) / 10000;
        }
        const oldIdx = EFFORT_TIER_ORDER.indexOf(old.tier);
        const tgtIdx = EFFORT_TIER_ORDER.indexOf(tgt.tier);
        if (oldIdx >= 0 && tgtIdx >= 0 && oldIdx !== tgtIdx) {
          // 若用户将高档位纠偏为低档位（oldIdx > tgtIdx），说明反推思考档位偏高，微调 effortScales 放大思考锚点阈值
          const scaleMult = oldIdx > tgtIdx ? 1.07 : 0.93;
          for (const fk of new Set([tgt.famKey, old.famKey])) {
            const curScale = Number(rc.effortScales[fk]) || 1.0;
            rc.effortScales[fk] = Math.round(Math.max(0.65, Math.min(1.55, curScale * scaleMult)) * 1000) / 1000;
          }
        }
      }

      rc.updatedAt = Date.now();
      cal.updatedAt = Date.now();
      saveCalibration(cal);
      return { softTargets, rejectedModel: isDiffModel ? old.canon : null };
    } catch (e) {
      return { softTargets: targetModelRaw ? { [targetModelRaw]: 1.0 } : null, rejectedModel: null };
    }
  }

  function detectModelVendorId(canonOrLabel) {
    const s = String(canonOrLabel || '').toLowerCase();
    if (/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/.test(s)) return 'openai';
    if (/claude|anthropic|opus|sonnet|haiku|fable/.test(s)) return 'anthropic';
    if (/gemini|google|argon|barium/.test(s)) return 'google';
    if (/grok|x-ai/.test(s)) return 'xai';
    return 'open';
  }

  function recordTeacherCalibration(canonModel, feat, teacherScore, weight = 1.0, sid = '') {
    try {
      if (!canonModel || !feat) return;
      const canon = canonModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(canonModel) : canonModel);
      const k = String(canon || '').replace(/[?？]+$/, '').trim().toLowerCase();
      if (!k || k === '开源模型') return;
      if (sid) {
        const dedupKey = `${sid}:${k}`;
        if (calibratedSessionKeys.has(dedupKey)) return;
        calibratedSessionKeys.add(dedupKey);
      }
      const cal = loadCalibration();
      if (!cal.tierCentroids) cal.tierCentroids = {};
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.vendorTierDeltas) cal.vendorTierDeltas = {};
      if (!cal.modalityProfiles) cal.modalityProfiles = {};
      const effW = Math.max(0.25, Number(weight) || 1.0);
      const isHeavyBattleTruth = effW >= 8.0;
      const hasTools = Boolean((feat.totalTools || 0) > 0);
      if (Array.isArray(feat.vec) && feat.vec.length === 20) {
        const prev = cal.protoCentroids[k];
        const protoDef = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === k);
        const n = Math.min(48, (prev?.count || 0) + 1);
        const maxAlpha = isHeavyBattleTruth ? 0.42 : 0.36;
        const alpha = Math.max(0.06, Math.min(maxAlpha, (isHeavyBattleTruth ? effW * 0.95 : effW) / (n * 1.4 + 3.5)));
        const baseVec = (prev && Array.isArray(prev.vec) && prev.vec.length === 20)
          ? prev.vec
          : (protoDef && Array.isArray(protoDef.vec) && protoDef.vec.length === 20 ? protoDef.vec : null);
        const nextVec = baseVec
          ? baseVec.map((v, i) => {
              if (!hasTools && i >= 2 && i <= 9) return Math.round((Number(v) || 0) * 1000) / 1000;
              return Math.round(((1 - alpha) * (Number(v) || 0) + alpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000;
            })
          : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
        const curMeta = extractCompactMeta(feat);
        const nextMeta = { ...(prev?.meta || {}) };
        if (curMeta && (hasTools || !prev?.meta || (prev.meta.totalTools || 0) === 0)) {
          for (const [mk, mv] of Object.entries(curMeta)) {
            if (!hasTools && prev?.meta && (prev.meta.totalTools || 0) > 0 && /^(totalTools|bash|write|edit|read|askUser|preToolTextChars|interToolTextChars|parallelSteps|writtenChars)$/.test(mk)) {
              continue;
            }
            if (typeof mv === 'boolean' || Array.isArray(mv) || typeof mv === 'string') nextMeta[mk] = mv;
            else {
              const pv = Number(prev?.meta?.[mk] ?? mv) || 0;
              nextMeta[mk] = Math.round(((1 - alpha) * pv + alpha * (Number(mv) || 0)) * 100) / 100;
            }
          }
        }
        cal.protoCentroids[k] = { vec: nextVec, meta: Object.keys(nextMeta).length ? nextMeta : (curMeta || prev?.meta || null), count: n, updatedAt: Date.now() };
      }
      // 同步更新 12 维同家族档位微差质心 tierCentroids 与多模态专有原型 modalityProfiles
      const tv = Array.isArray(feat.tierVec) && feat.tierVec.length === 12
        ? feat.tierVec
        : (Array.isArray(feat.meta?.tierVec) && feat.meta.tierVec.length === 12 ? feat.meta.tierVec : null);
      const parsed = parseModelFamilyAndTier(canon);
      if (parsed.famKey && Array.isArray(feat.vec) && feat.vec.length === 20) {
        const famProtos = PROTOTYPES.filter(p => parseModelFamilyAndTier(p.label).famKey === parsed.famKey);
        if (famProtos.length === 1 || (!parsed.hasExplicitTier && famProtos.length > 0)) {
          for (const fp of famProtos) {
            const mainCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(fp.label) : fp.label;
            const mainKey = String(mainCanon || '').toLowerCase();
            if (mainKey && mainKey !== k) {
              const prevMain = cal.protoCentroids[mainKey];
              const mCount = Math.min(48, (prevMain?.count || 0) + 1);
              const mAlpha = Math.max(0.04, Math.min(0.28, (effW * 0.55) / (mCount * 1.5 + 4.0)));
              const mVec = prevMain && Array.isArray(prevMain.vec) && prevMain.vec.length === 20
                ? prevMain.vec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000)
                : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
              cal.protoCentroids[mainKey] = {
                vec: mVec,
                meta: prevMain?.meta || extractCompactMeta(feat) || null,
                count: mCount,
                updatedAt: Date.now(),
              };
            }
          }
        }
      }
      if (tv && !feat.anomalous && parsed.hasExplicitTier) {
        const prevT = cal.tierCentroids[k];
        const prevW = Number(prevT?.truthWeightSum) || 0;
        // 若已有高权重 Battle 真值质心，低权重手动猜测纠偏 (effW < 2.5) 仅施加微弱软牵引，绝不覆盖真值边界
        const effectivePullW = (prevW >= 8.0 && effW < 2.5) ? (effW * 0.28) : (isHeavyBattleTruth ? effW * 1.45 : effW);
        const nextW = Math.min(240, prevW + effectivePullW);
        const maxTAlpha = isHeavyBattleTruth ? 0.68 : 0.55;
        const tAlpha = Math.max(0.05, Math.min(maxTAlpha, effectivePullW / Math.max(2.0, nextW)));
        const nextTierVec = (prevT && Array.isArray(prevT.tierVec) && prevT.tierVec.length === 12)
          ? prevT.tierVec.map((v, i) => Math.round(((1 - tAlpha) * (Number(v) || 0) + tAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
          : tv.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
        const nextStdVec = (prevT && Array.isArray(prevT.stdVec) && prevT.stdVec.length === 12)
          ? prevT.stdVec.map((sv, i) => {
              const diff = Math.abs((Number(tv[i]) || 0) - (Number(nextTierVec[i]) || 0));
              return Math.round(Math.max(0.04, Math.min(0.38, (1 - tAlpha * 0.5) * (Number(sv) || 0.12) + tAlpha * 0.5 * diff)) * 1000) / 1000;
            })
          : new Array(12).fill(0.12);
        cal.tierCentroids[k] = {
          tierVec: nextTierVec,
          stdVec: nextStdVec,
          count: Math.min(80, (prevT?.count || 0) + 1),
          truthWeightSum: Math.round(nextW * 100) / 100,
          updatedAt: Date.now(),
        };
        // 同家族不同强度档位排他与误差梯度拉开（Intra-Family Effort Margin Enforcement）：
        // 在高比重校准时，强制拉开同家族 Low / Medium / High / xHigh / Max 在强度敏感轴 [0, 1, 4, 10, 11] 上的间隔
        const curTierIdx = EFFORT_TIER_ORDER.indexOf(parsed.tier);
        if (isHeavyBattleTruth && parsed.famKey && curTierIdx >= 0) {
          const effortAxes = [0, 1, 4, 10, 11];
          for (let oi = 0; oi < EFFORT_TIER_ORDER.length; oi++) {
            if (oi === curTierIdx) continue;
            const otherTier = EFFORT_TIER_ORDER[oi];
            const otherCanon = formatFamilyTierCanon(parsed.baseLabel, otherTier);
            const otherKey = String(otherCanon || '').toLowerCase();
            if (!otherKey || otherKey === k) continue;
            const stepDiff = oi - curTierIdx;
            const minMargin = 0.14 * Math.abs(stepDiff);
            const existingOther = cal.tierCentroids[otherKey];
            if (existingOther && !existingOther.syntheticMargin && Array.isArray(existingOther.tierVec) && existingOther.tierVec.length === 12) {
              const pushedVec = [...existingOther.tierVec];
              for (const ax of effortAxes) {
                const curVal = Number(nextTierVec[ax]) || 0.5;
                const othVal = Number(pushedVec[ax]) || 0.5;
                const signedGap = (othVal - curVal) * Math.sign(stepDiff);
                if (signedGap < minMargin) {
                  const targetVal = Math.max(0.04, Math.min(0.98, curVal + Math.sign(stepDiff) * minMargin));
                  pushedVec[ax] = Math.round(((othVal * 0.45) + (targetVal * 0.55)) * 1000) / 1000;
                }
              }
              existingOther.tierVec = pushedVec;
            }
          }
        }
        // 厂商级跨家族相对档位迁移向量（Factorized Vendor Tier Prior）
        const vid = detectModelVendorId(canon);
        if (parsed.tier && vid) {
          cal.vendorTierDeltas[vid] = cal.vendorTierDeltas[vid] || {};
          const pvT = cal.vendorTierDeltas[vid][parsed.tier];
          const vn = Math.min(100, (pvT?.count || 0) + 1);
          const vAlpha = Math.max(0.04, Math.min(0.42, effectivePullW / (vn * 2.0 + 3.5)));
          cal.vendorTierDeltas[vid][parsed.tier] = {
            tierVec: (pvT && Array.isArray(pvT.tierVec) && pvT.tierVec.length === 12)
              ? pvT.tierVec.map((v, i) => Math.round(((1 - vAlpha) * (Number(v) || 0) + vAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
              : [...nextTierVec],
            count: vn,
            updatedAt: Date.now(),
          };
        }
        // 多模态专有习惯画像（文字 chat / 代码网页 webdev / 搜索 search / 图片 image / 视频 video / Agent 工具流）
        const mod = String(feat.evalModality || (feat.totalTools > 0 ? 'agent' : 'chat')).toLowerCase();
        if (mod) {
          cal.modalityProfiles[mod] = cal.modalityProfiles[mod] || {};
          const pm = cal.modalityProfiles[mod][k];
          const mn = Math.min(50, (pm?.count || 0) + 1);
          const maxMAlpha = isHeavyBattleTruth ? 0.58 : 0.45;
          const mAlpha = Math.max(0.08, Math.min(maxMAlpha, effectivePullW / (mn * 1.4 + 2.8)));
          cal.modalityProfiles[mod][k] = {
            tierVec: (pm && Array.isArray(pm.tierVec) && pm.tierVec.length === 12)
              ? pm.tierVec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
              : [...nextTierVec],
            vec: (Array.isArray(feat.vec) && feat.vec.length === 20)
              ? ((pm && Array.isArray(pm.vec) && pm.vec.length === 20)
                  ? pm.vec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000)
                  : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000))
              : (pm?.vec || null),
            count: mn,
            updatedAt: Date.now(),
          };
        }
      }
      if (Number.isFinite(+teacherScore) && +teacherScore >= 10 && +teacherScore <= 100 && Number.isFinite(+feat.habitReasoningScore)) {
        const rawDelta = Math.max(-24, Math.min(24, (+teacherScore) - (+feat.habitReasoningScore)));
        const prevS = cal.scoreOffsets[k];
        const sn = Math.min(40, (prevS?.count || 0) + 1);
        const beta = Math.max(0.10, Math.min(isHeavyBattleTruth ? 0.62 : 0.48, effW / (sn * 1.4 + 2.6)));
        const nextOff = prevS ? ((1 - beta) * (Number(prevS.offset) || 0) + beta * rawDelta) : rawDelta;
        const nextMean = prevS ? ((1 - beta) * (Number(prevS.meanScore) || +teacherScore) + beta * (+teacherScore)) : (+teacherScore);
        cal.scoreOffsets[k] = {
          offset: Math.round(nextOff * 100) / 100,
          meanScore: Math.round(nextMean * 10) / 10,
          count: sn,
          updatedAt: Date.now(),
        };
      }
      cal.updatedAt = Date.now();
      saveCalibration(cal);
    } catch {}
  }

  // Battle 双子星同题差分对比学习引擎（Pairwise Gemini Contrastive Engine）：
  // 利用同一 Prompt、同一模态下 A/B 双模型的响应微差，直接训练同家族相邻档位分界超平面、跨模型双向排他与跨家族去偏置锚点
  function recordBattlePairwiseContrast(chat, canonA, featA, canonB, featB, voteValue = 'tie', evalModality = 'chat') {
    try {
      if (!canonA || !canonB || !featA || !featB) return null;
      const tvA = Array.isArray(featA.tierVec) && featA.tierVec.length === 12 ? featA.tierVec : null;
      const tvB = Array.isArray(featB.tierVec) && featB.tierVec.length === 12 ? featB.tierVec : null;
      if (!tvA || !tvB) return null;

      // 0. 同题对偶双向排他（Mutual Exclusive Repulsion）：
      // A 侧响应特征绝不属于 B 模型，B 侧响应特征绝不属于 A 模型；直接施加高权重排他排斥与区分度维度放大
      if (String(canonA).toLowerCase() !== String(canonB).toLowerCase()) {
        try {
          const sidBase = String(chat?.sid || 'battle');
          recordElasticCorrection({ sid: sidBase + '#pair-a' }, featA, canonB, canonA, featA.habitReasoningScore, 9.5);
          recordElasticCorrection({ sid: sidBase + '#pair-b' }, featB, canonA, canonB, featB.habitReasoningScore, 9.5);
        } catch {}
      }

      const cal = loadCalibration();
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
      const rc = cal.reverseCalib;
      if (!rc.tierLogPriors) rc.tierLogPriors = {};
      if (!rc.effortScales) rc.effortScales = {};

      const pA = parseModelFamilyAndTier(canonA);
      const pB = parseModelFamilyAndTier(canonB);
      const idxA = EFFORT_TIER_ORDER.indexOf(pA.tier);
      const idxB = EFFORT_TIER_ORDER.indexOf(pB.tier);

      // 1. 同家族不同档位同题直接交锋（如 opus-5.5-high vs opus-5.5-medium）：直接更新线性判别超平面 w_{high>low} 并拉开强度梯度
      if (pA.famKey && pA.famKey === pB.famKey && idxA >= 0 && idxB >= 0 && idxA !== idxB) {
        const hiIsA = idxA > idxB;
        const hiTier = hiIsA ? pA.tier : pB.tier;
        const loTier = hiIsA ? pB.tier : pA.tier;
        const tvHi = hiIsA ? tvA : tvB;
        const tvLo = hiIsA ? tvB : tvA;
        const pairKey = `${hiTier}>${loTier}`;
        cal.intraFamilyHyperplanes[pA.famKey] = cal.intraFamilyHyperplanes[pA.famKey] || {};
        const prevH = cal.intraFamilyHyperplanes[pA.famKey][pairKey];
        const hn = Math.min(50, (prevH?.count || 0) + 1);
        const hAlpha = Math.max(0.22, Math.min(0.68, 2.8 / (hn + 1.8)));
        const rawDelta = tvHi.map((v, i) => {
          const d = (Number(v) || 0) - (Number(tvLo[i]) || 0);
          return ([0, 1, 4, 10, 11].includes(i) && d < 0.08) ? Math.max(d, 0.12) : d;
        });
        const nextW = (prevH && Array.isArray(prevH.wVec) && prevH.wVec.length === 12)
          ? prevH.wVec.map((w, i) => Math.round(((1 - hAlpha) * (Number(w) || 0) + hAlpha * rawDelta[i]) * 1000) / 1000)
          : rawDelta.map(d => Math.round(d * 1000) / 1000);
        const midProj = tvHi.reduce((acc, v, i) => acc + nextW[i] * (((Number(v) || 0) + (Number(tvLo[i]) || 0)) * 0.5), 0);
        cal.intraFamilyHyperplanes[pA.famKey][pairKey] = {
          wVec: nextW,
          threshold: Math.round(midProj * 10000) / 10000,
          count: hn,
          modality: evalModality,
          updatedAt: Date.now(),
        };
      }

      // 2. 利用任意同家族已积累的不同档位 tierCentroids 自动合成/刷新相邻档位超平面（即使 A 和 B 来自不同对局）
      for (const pCur of [pA, pB]) {
        if (!pCur.famKey) continue;
        cal.intraFamilyHyperplanes[pCur.famKey] = cal.intraFamilyHyperplanes[pCur.famKey] || {};
        for (let ti = 1; ti < EFFORT_TIER_ORDER.length; ti++) {
          for (let tj = 0; tj < ti; tj++) {
            const tHi = EFFORT_TIER_ORDER[ti];
            const tLo = EFFORT_TIER_ORDER[tj];
            const cHiKey = String(formatFamilyTierCanon(pCur.baseLabel, tHi) || '').toLowerCase();
            const cLoKey = String(formatFamilyTierCanon(pCur.baseLabel, tLo) || '').toLowerCase();
            const centHi = cal.tierCentroids?.[cHiKey];
            const centLo = cal.tierCentroids?.[cLoKey];
            if (centHi?.tierVec?.length === 12 && centLo?.tierVec?.length === 12) {
              const pk = `${tHi}>${tLo}`;
              const existingH = cal.intraFamilyHyperplanes[pCur.famKey][pk];
              const diffVec = centHi.tierVec.map((v, i) => {
                const std = Math.max(0.06, ((Number(centHi.stdVec?.[i]) || 0.12) + (Number(centLo.stdVec?.[i]) || 0.12)) * 0.5);
                return Math.round((((Number(v) || 0) - (Number(centLo.tierVec[i]) || 0)) / (std * 6)) * 1000) / 1000;
              });
              const blendedW = (existingH && Array.isArray(existingH.wVec) && existingH.wVec.length === 12)
                ? existingH.wVec.map((w, i) => Math.round((w * 0.65 + diffVec[i] * 0.35) * 1000) / 1000)
                : diffVec;
              const midP = centHi.tierVec.reduce((acc, v, i) => acc + blendedW[i] * (((Number(v) || 0) + (Number(centLo.tierVec[i]) || 0)) * 0.5), 0);
              cal.intraFamilyHyperplanes[pCur.famKey][pk] = {
                wVec: blendedW,
                threshold: Math.round(midP * 10000) / 10000,
                count: Math.max(existingH?.count || 1, Math.min(centHi.count || 1, centLo.count || 1)),
                updatedAt: Date.now(),
              };
            }
          }
        }
        // 3. Battle 100% 真值反哺校准 /cost 账单反推的档位先验 tierLogPriors（温和限幅防溢出）
        if (pCur.famKey && pCur.tier) {
          rc.tierLogPriors[pCur.famKey] = rc.tierLogPriors[pCur.famKey] || {};
          const curP = Number(rc.tierLogPriors[pCur.famKey][pCur.tier]) || 0;
          rc.tierLogPriors[pCur.famKey][pCur.tier] = Math.round(Math.max(-0.65, Math.min(0.65, curP + 0.08)) * 1000) / 1000;
        }
      }
      rc.updatedAt = Date.now();
      cal.updatedAt = Date.now();
      saveCalibration(cal);
      return true;
    } catch {
      return null;
    }
  }

  function saveBank(samples, { replace = false, persistToHost = true, tombstones = null } = {}) {
    bankRev++;
    _featCache.clear();
    _analyzeCache.clear();
    if (tombstones && typeof tombstones === 'object') {
      for (const [tk, tv] of Object.entries(tombstones)) {
        if (tk && tv) recordBankTombstone(tk, tv.reason || 'retracted', tv.deletedAt || Date.now());
      }
    }
    const bySid = new Map();
    for (const rawS of (Array.isArray(samples) ? samples : [])) {
      const s = sanitizeBankSample(rawS);
      if (!s || !s.model || !Array.isArray(s.vec)) continue;
      const k = s.sid || `${s.model}:${s.at || 0}`;
      if (isSampleTombstoned(k, s.at || 0)) continue;
      const prev = bySid.get(k);
      if (!prev) {
        bySid.set(k, s);
      } else {
        const sRank = getSampleTruthRank(s);
        const pRank = getSampleTruthRank(prev);
        const digestChanged = Boolean(s.contentDigest && prev.contentDigest && s.contentDigest !== prev.contentDigest && sRank >= pRank);
        const win = digestChanged || (sRank > pRank) || (sRank === pRank && (s.at || 0) >= (prev.at || 0)) ? s : prev;
        const lose = win === s ? prev : s;
        const rich = digestChanged ? { vec: s.vec, meta: s.meta } : pickRichBankVecMeta(win, lose);
        bySid.set(k, {
          ...prev,
          ...win,
          vec: rich.vec,
          meta: rich.meta,
          tierVec: Array.isArray(win.tierVec) && win.tierVec.length === 12 ? win.tierVec : (Array.isArray(lose.tierVec) && lose.tierVec.length === 12 ? lose.tierVec : rich.meta?.tierVec),
          userConfirmed: Boolean(prev.userConfirmed || s.userConfirmed),
          autoTeacher: sRank > pRank ? Boolean(s.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
          importedFromDiag: Boolean(prev.importedFromDiag || s.importedFromDiag),
          battleRevealed: Boolean(prev.battleRevealed || s.battleRevealed),
          directMode: Boolean(prev.directMode || s.directMode),
          weight: Math.max(Number(win.weight) || 1, Number(lose.weight) || 1),
        });
      }
    }
    // 分层保量扩容策略（Stratified High-Capacity Retention）：
    // 金库层（Battle 真值 + 诊断真值 + Direct 锁定真值）受独立保护，绝不被 autoTeacher 或普通纠偏挤出
    const allDeduplicated = [...bySid.values()].sort((a, b) =>
      (getSampleTruthRank(b) - getSampleTruthRank(a)) ||
      ((Number(b.weight) || 1) - (Number(a.weight) || 1)) ||
      ((b.at || 0) - (a.at || 0))
    );
    const goldPool = [];
    const silverPool = [];
    const bronzePool = [];
    for (const s of allDeduplicated) {
      const tr = getSampleTruthRank(s);
      if (tr >= 3) goldPool.push(s);
      else if (tr === 2) silverPool.push(s);
      else bronzePool.push(s);
    }
    const keptGold = goldPool.slice(0, 1050);
    const remAfterGold = Math.max(0, MAX_BANK_SAMPLES - keptGold.length);
    const keptSilver = silverPool.slice(0, Math.min(silverPool.length, Math.max(320, Math.floor(remAfterGold * 0.65))));
    const remAfterSilver = Math.max(0, MAX_BANK_SAMPLES - keptGold.length - keptSilver.length);
    const keptBronze = bronzePool.slice(0, remAfterSilver);
    const clean = [...keptGold, ...keptSilver, ...keptBronze];
    const cleanBySid = new Map();
    for (const s of clean) cleanBySid.set(s.sid || `${s.model}:${s.at || 0}`, s);
    _cachedBankSamples = clean;
    _cachedBankBySid = cleanBySid;
    _cachedBankRev = bankRev;
    const cal = loadCalibration();
    const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
    const prevRaw = (typeof Store !== 'undefined' && Store.get) ? Store.get(BANK_KEY, null) : null;
    const isEmptyReset = Boolean((replace || prevRaw?.replace) && clean.length === 0);
    const payload = { v: 3, builtinRev: builtin?.builtinRev || 0, updatedAt: Date.now(), replace: Boolean(replace || isEmptyReset), samples: clean, tombstones: Object.fromEntries(_bankTombstones), calibration: cal };
    try { if (typeof Store !== 'undefined' && Store.set) Store.set(BANK_KEY, payload); } catch {}
    if (persistToHost) {
      try {
        if (typeof Host !== 'undefined' && Host && typeof Host.shared === 'function') {
          Promise.resolve(Host.shared('habitLearnBank', payload)).then(sh => {
            if (sh && Array.isArray(sh.samples) && sh.samples.length > clean.length) {
              applyRemoteBankSync(sh, { persistToHost: false });
            }
          }).catch(() => {});
        } else if (typeof Host !== 'undefined' && typeof Host.setShared === 'function') {
          void Host.setShared('habitLearnBank', payload);
        }
      } catch {}
    }
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    return clean;
  }

  function mergeSharedBank(remoteSamples, remoteCalib = null, remoteStats = null, { persistToHost = true, tombstones = null } = {}) {
    let added = 0, updated = 0, skipped = 0;
    try {
      const incomingTombs = tombstones || remoteCalib?.tombstones || null;
      if (incomingTombs && typeof incomingTombs === 'object') {
        for (const [tk, tv] of Object.entries(incomingTombs)) {
          if (tk && tv) recordBankTombstone(tk, tv.reason || 'remote-tombstone', tv.deletedAt || Date.now());
        }
      }
      const local = loadBank();
      const bySid = new Map();
      for (const rawL of local) {
        const s = sanitizeBankSample(rawL);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        if (isSampleTombstoned(k, s.at || 0)) continue;
        bySid.set(k, s);
      }
      for (const rawS of (Array.isArray(remoteSamples) ? remoteSamples : [])) {
        const s = sanitizeBankSample(rawS);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        if (isSampleTombstoned(k, s.at || 0)) { skipped++; continue; }
        const prev = bySid.get(k);
        if (!prev) {
          bySid.set(k, s);
          added++;
          continue;
        }
        const sRank = getSampleTruthRank(s);
        const pRank = getSampleTruthRank(prev);
        if (pRank > sRank) {
          const rich = pickRichBankVecMeta(prev, s);
          if ((!prev.meta && rich.meta) || (isSyntheticStubVecSample(prev.vec) && !isSyntheticStubVecSample(rich.vec))) {
            bySid.set(k, { ...prev, vec: rich.vec, meta: rich.meta });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        const shouldUpdate = (sRank > pRank) ||
          ((s.at || 0) > (prev.at || 0)) ||
          (sRank >= 1 && String(s.model || '').toLowerCase() !== String(prev.model || '').toLowerCase()) ||
          (!prev.meta && Boolean(s.meta)) ||
          (!prev.tierVec && Boolean(s.tierVec)) ||
          (isSyntheticStubVecSample(prev.vec) && !isSyntheticStubVecSample(s.vec)) ||
          (Boolean(s.importedFromDiag) && !prev.importedFromDiag) ||
          (Boolean(s.battleRevealed) && !prev.battleRevealed);
        if (shouldUpdate) {
          const win = ((sRank > pRank) || (sRank === pRank && (s.at || 0) >= (prev.at || 0))) ? s : prev;
          const lose = win === s ? prev : s;
          const rich = pickRichBankVecMeta(win, lose);
          bySid.set(k, {
            ...prev,
            ...win,
            vec: rich.vec,
            meta: rich.meta,
            tierVec: Array.isArray(win.tierVec) && win.tierVec.length === 12 ? win.tierVec : (Array.isArray(lose.tierVec) && lose.tierVec.length === 12 ? lose.tierVec : rich.meta?.tierVec),
            userConfirmed: Boolean(prev.userConfirmed || s.userConfirmed),
            autoTeacher: sRank > pRank ? Boolean(s.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
            importedFromDiag: Boolean(prev.importedFromDiag || s.importedFromDiag),
            battleRevealed: Boolean(prev.battleRevealed || s.battleRevealed),
            directMode: Boolean(prev.directMode || s.directMode),
            weight: Math.max(Number(win.weight) || 1, Number(lose.weight) || 1),
            score: win.score != null && Number.isFinite(+win.score) ? +win.score : prev.score,
          });
          updated++;
        } else {
          skipped++;
        }
      }
      if (remoteCalib && typeof remoteCalib === 'object') {
        const cal = loadCalibration();
        for (const [k, rc] of Object.entries(remoteCalib.protoCentroids || {})) {
          if (!rc || typeof rc !== 'object') continue;
          const lc = cal.protoCentroids[k];
          if (!lc) {
            cal.protoCentroids[k] = rc;
          } else if (Array.isArray(lc.vec) && lc.vec.length === 20 && Array.isArray(rc.vec) && rc.vec.length === 20 && (rc.updatedAt || 0) !== (lc.updatedAt || 0)) {
            const cL = Math.max(1, Number(lc.count) || 1);
            const cR = Math.max(1, Number(rc.count) || 1);
            const tot = cL + cR;
            const blendedVec = lc.vec.map((v, i) => Math.round((((Number(v) || 0) * cL + (Number(rc.vec[i]) || 0) * cR) / tot) * 1000) / 1000);
            cal.protoCentroids[k] = {
              vec: blendedVec,
              meta: (rc.updatedAt || 0) >= (lc.updatedAt || 0) ? (rc.meta || lc.meta || null) : (lc.meta || rc.meta || null),
              count: Math.max(cL, cR) + 1,
              updatedAt: Math.max(lc.updatedAt || 0, rc.updatedAt || 0, Date.now()),
            };
          }
        }
        for (const [k, rt] of Object.entries(remoteCalib.tierCentroids || {})) {
          if (!rt || typeof rt !== 'object' || !Array.isArray(rt.tierVec) || rt.tierVec.length !== 12) continue;
          const lt = cal.tierCentroids?.[k];
          if (!lt || !Array.isArray(lt.tierVec) || lt.tierVec.length !== 12) {
            cal.tierCentroids[k] = rt;
          } else if ((rt.updatedAt || 0) !== (lt.updatedAt || 0)) {
            const wL = Math.max(1, Number(lt.truthWeightSum || lt.count) || 1);
            const wR = Math.max(1, Number(rt.truthWeightSum || rt.count) || 1);
            const totW = wL + wR;
            cal.tierCentroids[k] = {
              tierVec: lt.tierVec.map((v, i) => Math.round((((Number(v) || 0) * wL + (Number(rt.tierVec[i]) || 0) * wR) / totW) * 1000) / 1000),
              stdVec: Array.isArray(lt.stdVec) && lt.stdVec.length === 12 && Array.isArray(rt.stdVec) && rt.stdVec.length === 12
                ? lt.stdVec.map((sv, i) => Math.round((((Number(sv) || 0.12) * wL + (Number(rt.stdVec[i]) || 0.12) * wR) / totW) * 1000) / 1000)
                : (rt.stdVec || lt.stdVec || new Array(12).fill(0.12)),
              count: Math.max(Number(lt.count) || 1, Number(rt.count) || 1) + 1,
              truthWeightSum: Math.round(Math.max(wL, wR, (wL + wR) * 0.65) * 100) / 100,
              updatedAt: Math.max(lt.updatedAt || 0, rt.updatedAt || 0, Date.now()),
            };
          }
        }
        if (remoteCalib.intraFamilyHyperplanes && typeof remoteCalib.intraFamilyHyperplanes === 'object') {
          cal.intraFamilyHyperplanes = cal.intraFamilyHyperplanes || {};
          for (const [fk, fMap] of Object.entries(remoteCalib.intraFamilyHyperplanes)) {
            if (!fMap || typeof fMap !== 'object') continue;
            cal.intraFamilyHyperplanes[fk] = { ...(cal.intraFamilyHyperplanes[fk] || {}), ...fMap };
          }
        }
        if (remoteCalib.vendorTierDeltas && typeof remoteCalib.vendorTierDeltas === 'object') {
          cal.vendorTierDeltas = cal.vendorTierDeltas || {};
          for (const [vk, vMap] of Object.entries(remoteCalib.vendorTierDeltas)) {
            if (!vMap || typeof vMap !== 'object') continue;
            cal.vendorTierDeltas[vk] = { ...(cal.vendorTierDeltas[vk] || {}), ...vMap };
          }
        }
        if (remoteCalib.modalityProfiles && typeof remoteCalib.modalityProfiles === 'object') {
          cal.modalityProfiles = cal.modalityProfiles || {};
          for (const [mk, mMap] of Object.entries(remoteCalib.modalityProfiles)) {
            if (!mMap || typeof mMap !== 'object') continue;
            cal.modalityProfiles[mk] = { ...(cal.modalityProfiles[mk] || {}), ...mMap };
          }
        }
        for (const [k, rs] of Object.entries(remoteCalib.scoreOffsets || {})) {
          if (!rs || typeof rs !== 'object') continue;
          const ls = cal.scoreOffsets[k];
          if (!ls) {
            cal.scoreOffsets[k] = rs;
          } else if ((rs.updatedAt || 0) !== (ls.updatedAt || 0)) {
            const cL = Math.max(1, Number(ls.count) || 1);
            const cR = Math.max(1, Number(rs.count) || 1);
            const tot = cL + cR;
            cal.scoreOffsets[k] = {
              offset: Math.round((((Number(ls.offset) || 0) * cL + (Number(rs.offset) || 0) * cR) / tot) * 100) / 100,
              meanScore: Math.round((((Number(ls.meanScore) || 75) * cL + (Number(rs.meanScore) || 75) * cR) / tot) * 10) / 10,
              count: Math.max(cL, cR) + 1,
              updatedAt: Math.max(ls.updatedAt || 0, rs.updatedAt || 0, Date.now()),
            };
          }
        }
        if (remoteCalib.dimWeights && typeof remoteCalib.dimWeights === 'object') {
          cal.dimWeights = { ...(cal.dimWeights || {}), ...remoteCalib.dimWeights };
        }
        if (remoteCalib.repelledModels && typeof remoteCalib.repelledModels === 'object') {
          cal.repelledModels = { ...(cal.repelledModels || {}), ...remoteCalib.repelledModels };
        }
        if (remoteCalib.reverseCalib && typeof remoteCalib.reverseCalib === 'object') {
          const curRc = cal.reverseCalib || { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
          cal.reverseCalib = {
            effortScales: { ...(curRc.effortScales || {}), ...(remoteCalib.reverseCalib.effortScales || {}) },
            tierLogPriors: { ...(curRc.tierLogPriors || {}), ...(remoteCalib.reverseCalib.tierLogPriors || {}) },
            modelResidualBias: { ...(curRc.modelResidualBias || {}), ...(remoteCalib.reverseCalib.modelResidualBias || {}) },
            updatedAt: Math.max(curRc.updatedAt || 0, remoteCalib.reverseCalib.updatedAt || 0, Date.now()),
          };
        }
        cal.updatedAt = Date.now();
        saveCalibration(cal);
      }
      if (remoteStats && typeof remoteStats === 'object') {
        try {
          const st = getUsageStats();
          for (const bucket of ['vendors', 'families', 'models', 'efforts']) {
            if (remoteStats[bucket] && typeof remoteStats[bucket] === 'object') {
              st[bucket] = st[bucket] || {};
              for (const [bk, bv] of Object.entries(remoteStats[bucket])) {
                if (Number.isFinite(+bv) && +bv > 0) {
                  st[bucket][bk] = Math.max(Number(st[bucket][bk]) || 0, +bv);
                }
              }
            }
          }
          st.updatedAt = Date.now();
          _cachedUsageStats = st;
          if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, st);
        } catch {}
      }
      const saved = (added > 0 || updated > 0 || persistToHost)
        ? saveBank([...bySid.values()], { persistToHost })
        : [...bySid.values()];
      if (added > 0 || updated > 0) {
        try {
          UI?.renderListSoon?.();
          Dock?.soon?.();
        } catch {}
      }
      const modelSet = new Set(saved.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: saved.length, modelCount: modelSet.size };
    } catch {
      const cur = loadBank();
      const modelSet = new Set(cur.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: cur.length, modelCount: modelSet.size };
    }
  }


  // ── 50 维 HTML/SVG 静态代码结构、运动学与特征词指纹子引擎（融合自千面 v9.2 281 原型库 v5.2 + 17 维结构签名 + 5 维 SVG32 裁判 + 四大数学皇冠非饱和谱图算子）──

  const HTML_SVG_CLASSIFIER_BANK = {"v":"5.2.0","w":[1.8,1.6,1.5,1.2,1.6,1.6,2.2,2,2.2,2.2,2.2,2.2,2.2,3.2,2.5,2.8,2.8,2.5,2.8,2.4,2.4,2.2,2.2,1.8,1.8,1.8,1.8,1.5,1.5,1.5,1.2,1.4,1.2,1.2,1.2,1.2,1.2,1.6,1.6,1.6,1.4,2.6,2.6,2.6,2.6,2.4,2,3,2.6,1.6],"c":{"google/gemini-4-argon":{"label":"👑 Gemini 4 Argon","vendor":"google","default_effort":"high","is_crown":true},"openai/gpt-6.1-sol":{"label":"👑 GPT 6.1 Sol","vendor":"openai","default_effort":"max","is_crown":true},"openai/gpt-6-astra":{"label":"👑 GPT 6 Astra","vendor":"openai","default_effort":"max","is_crown":true},"anthropic/claude-opus-5.5":{"label":"👑 Claude Opus 5.5","vendor":"anthropic","default_effort":"max","is_crown":true},"openai/gpt-6-luna":{"label":"GPT 6 Luna","vendor":"openai","default_effort":"medium","is_crown":false},"openai/gpt-6-sol":{"label":"GPT 6 Sol","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-sol":{"label":"GPT 5.6 Sol","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-terra":{"label":"GPT 5.6 Terra","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-luna":{"label":"GPT 5.6 Luna","vendor":"openai","default_effort":"medium","is_crown":false},"openai/gpt-5.5":{"label":"GPT 5.5","vendor":"openai","default_effort":"medium","is_crown":false},"anthropic/claude-opus-5":{"label":"Claude Opus 5","vendor":"anthropic","default_effort":"max","is_crown":false},"anthropic/claude-sonnet-5.5":{"label":"Claude Sonnet 5.5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-sonnet-5":{"label":"Claude Sonnet 5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-haiku-5.5":{"label":"Claude Haiku 5.5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-fable-5.1":{"label":"Claude Fable 5.1","vendor":"anthropic","default_effort":"medium","is_crown":false},"google/gemini-3.8-flash":{"label":"Gemini 3.8 Flash","vendor":"google","default_effort":"high","is_crown":false},"google/gemini-3.7-flash":{"label":"Gemini 3.7 Flash","vendor":"google","default_effort":"high","is_crown":false},"google/gemma-4-31b":{"label":"Gemma 4 31B","vendor":"google","default_effort":"high","is_crown":false},"z-ai/glm-5.3":{"label":"GLM 5.3","vendor":"z-ai","default_effort":"high","is_crown":false},"z-ai/glm-5.2":{"label":"GLM 5.2","vendor":"z-ai","default_effort":"low","is_crown":false},"moonshotai/kimi-k3":{"label":"Kimi K3","vendor":"moonshotai","default_effort":"max","is_crown":false},"deepseek/deepseek-v4.1-flash":{"label":"DeepSeek V4.1 Flash","vendor":"deepseek","default_effort":"max","is_crown":false},"qwen/qwen3.7-max":{"label":"Qwen 3.7 Max","vendor":"qwen","default_effort":"high","is_crown":false},"xiaomi/mimo-v2.6-pro":{"label":"MiMo V2.6 Pro","vendor":"xiaomi","default_effort":"medium","is_crown":false},"xiaomi/mimo-v2.6-flash":{"label":"MiMo V2.6 Flash","vendor":"xiaomi","default_effort":"max","is_crown":false},"meta/muse-spark-1.3":{"label":"Muse Spark 1.3","vendor":"meta","default_effort":"max","is_crown":false},"x-ai/grok-4.7":{"label":"Grok 4.7","vendor":"x-ai","default_effort":"max","is_crown":false},"nvidia/nemotron-3-ultra":{"label":"Nemotron 3 Ultra","vendor":"nvidia","default_effort":"high","is_crown":false},"minimax/minimax-m3":{"label":"MiniMax M3","vendor":"minimax","default_effort":"medium","is_crown":false},"upstage/solar-pro4":{"label":"Solar Pro 4","vendor":"upstage","default_effort":"max","is_crown":false},"x-ai/grok-4.6":{"label":"Grok 4.6","vendor":"x-ai","default_effort":"medium","is_crown":false}},"p":[["meta/muse-spark-1.3","max",1,1,[10.019,5.961,4.078,0,6.803,6.217,1.8,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.773,0.693,0,0.392,0.824,0,0,0,0,1.099,3.555,3.664,3.296,2.708,3.738,1.386,3.912,1.792,0,1.609,0,0,0,0,1,0,0,0,3.871]],["meta/muse-spark-1.3","max",1,1,[9.686,5.694,4.013,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0.693,0.842,0,0,0,0,0,0,1.872,3.401,3.367,3.219,2.398,3.497,0,3.784,1.099,0,2.708,0,0,0,0,0,0,0,0,3.829]],["google/gemini-3.7-flash","high",1,1,[10.799,6.773,4.045,0,7.091,6.479,1.846,0,0,0,0,0,0,0,0,1,1,0,0,0,0,4.595,0.693,0,0,0.701,0,0,0,0,1.099,4.344,3.784,1.946,2.708,4.331,2.303,4.159,2.565,0,3.258,0,0,0,0,0,0,0,0,4.043]],["google/gemini-3.7-flash","low",1,1,[10.737,7.069,3.694,0,6.868,6.293,1.778,0,0,0,0,0,0,0,0,1,0,0,0,1,0,4.644,2.485,0,0,0.716,0,0,0,0,1.609,4.077,3.045,2.89,2.996,3.466,1.946,3.829,2.639,1.099,0,0,0,0,0,0,1,0,1,4.174]],["x-ai/grok-4.7","max",1,1,[9.052,4.92,4.155,0,7.091,6.581,1.667,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0.693,0,0.398,0,0,0,0,0,0,3.583,2.303,1.099,0.693,0,0,3.045,1.386,0.693,0,0,0,0,1,1,1,0,0,3.583]],["deepseek/deepseek-v4.1-flash","max",1,1,[8.87,5.017,3.881,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2.833,0.693,0,0,0.209,0,0,0,0,1.099,3.091,2.565,1.609,2.833,0,0,2.708,0.693,0,2.197,0,0,0,0,0,0,0,0,3.332]],["deepseek/deepseek-v4.1-flash","max",1,1,[9.858,6.014,3.868,0,6.803,6.399,1.5,0,0,0,0,0,0,0,0,1,1,0,0,0,1,3.526,0.693,0,0.024,0,0,0,0,0,1.386,3.045,3.296,2.833,1.946,3.367,0,3.219,1.386,0,2.197,1,0,1,0,0,0,0,0,4.094]],["nvidia/nemotron-3-ultra","high",1,1,[9.962,6.078,3.907,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,0,1,0,0,0,0,3.85,0,0,0,0.723,0,0,0,0,2.398,3.97,3.611,2.485,3.296,2.079,0,4.094,1.609,0,2.639,0,0,0,0,1,0,0,0,4.304]],["anthropic/claude-opus-5","max",1,1,[9.909,5.987,3.944,0,6.909,6.399,1.667,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.401,1.792,0,0,0,0,0,0,0,1.792,3.497,3.555,3.638,2.485,3.434,0,3.664,1.792,0,0,1,0,0,0,1,0,0,1,4.025]],["anthropic/claude-opus-5","max",1,1,[9.438,5.811,3.656,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,3.434,2.996,0,0,0,0,0,0,0,1.099,2.708,2.485,1.792,2.773,2.079,1.099,2.944,1.386,0,1.386,0,0,1,0,0,0,0,1,3.583]],["openai/gpt-6.1-sol","max",1,1,[10.045,6.2,3.868,0,6.868,6.293,1.778,0,0,0,0,0,0,1,0,0,0,1,1,0,0,3.219,3.045,0,0.11,0,0,0,0,0,1.609,3.97,3.583,3.401,3.091,2.833,0,3.989,1.792,0,0,0,0,0,0,0,0,0,1,4.19]],["openai/gpt-6.1-sol","max",1,1,[8.989,4.466,4.545,0,7.004,6.581,1.528,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.197,0.693,0,0.238,0,0,0,0,0,0,3.714,2.197,1.946,0.693,0,0,2.89,1.609,0.693,1.099,1,0,0,1,1,1,0,0,3.664]],["openai/gpt-6.1-sol","high",1,1,[8.908,4.443,4.488,0,6.909,6.479,1.538,0,0,0,0,0,0,0,0,1,0,0,0,0,0,2.303,0.693,0,0.39,0,0,0,0,0,1.386,3.434,2.485,2.197,2.398,0,0,2.639,1.386,0,1.099,0,0,0,1,1,0,0,0,3.892]],["openai/gpt-6.1-sol","max",1,1,[10.024,5.886,4.156,0,7.273,6.803,1.6,0,0,0,1,0,0,1,0,1,1,1,0,0,0,0,0.693,0,0.064,0,0,0,0,0,1.099,4.625,3.045,1.609,1.609,1.386,0,3.611,1.792,1.609,2.398,0,0,0,0,0,1,0,1,4.718]],["openai/gpt-6.1-sol","high",1,1,[10.382,6.244,4.155,0,7.091,6.431,1.935,1,0,0,0,0,0,1,0,0,0,1,0,1,1,2.303,1.792,0.013,0.213,0,0,0,0,0,1.099,4.317,3.367,0.693,2.485,0,0,3.497,1.386,0,2.708,1,1,1,1,0,0,1,1,4.898]],["openai/gpt-6.1-sol","max",1,1,[10.404,6.219,4.202,0,7.091,6.553,1.714,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.197,1.386,0.006,0.087,0,0,0,1,0,1.386,4.489,3.526,2.639,1.792,0,0,3.807,1.609,0,3.367,1,1,1,1,0,0,1,1,4.836]],["openai/gpt-6.1-sol","max",1,1,[10.078,5.768,4.326,0,7.091,6.463,1.875,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.565,1.099,0,0.505,0,0,0,0,0,0,4.29,2.639,1.792,1.386,0,0,3.296,1.609,0,1.792,1,1,1,0,0,0,1,1,4.522]],["openai/gpt-6.1-sol","low",1,1,[9.131,4.248,4.904,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,1,1.609,0.693,0,0.195,0,0,0,0,0,0,3.611,2.565,0.693,0,0,0,2.89,0.693,0,2.708,1,1,1,1,1,0,0,1,3.892]],["openai/gpt-6.1-sol","max",1,1,[10.33,6.242,4.106,0,7.155,6.524,1.882,1,0,0,0,0,0,1,1,1,0,1,0,1,1,2.197,1.386,0,0.603,0,0,0,0,0,1.099,4.691,2.996,2.079,1.792,0,0,3.664,1.609,0,2.398,1,1,1,0,1,0,1,1,4.977]],["openai/gpt-6.1-sol","high",1,1,[10.331,6.105,4.243,0,7.091,6.494,1.818,1,0,0,0,0,0,1,1,0,0,1,1,1,1,1.792,1.099,0,0.337,0,0,0,0,0,2.708,4.489,2.773,1.946,1.792,0,0,3.401,1.386,0,2.89,1,1,1,0,0,0,1,1,4.86]],["openai/gpt-6.1-sol","high",1,1,[10.204,6.118,4.104,0,7.091,6.524,1.765,1,0,0,0,0,0,1,0,1,0,1,1,1,1,1.609,1.099,0,0.601,0,1,0,0,0,2.639,4.29,3.807,1.609,2.079,0,0,3.611,1.609,0,1.946,1,1,1,0,0,0,1,1,4.779]],["openai/gpt-6.1-sol","max",1,1,[10.466,6.223,4.26,0,7.091,6.553,1.714,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.079,1.099,0,0.356,0,1,0,0,0,1.253,4.7,3.497,2.833,1.946,0,0,3.829,1.609,0,3.332,1,1,1,0,0,0,1,1,5.1]],["openai/gpt-6.1-sol","high",1,1,[10.252,6.016,4.252,0,7.004,6.479,1.692,1,0,0,0,0,0,1,0,1,0,1,0,1,1,1.386,1.099,0,0.205,0,0,0,0,0,1.504,4.317,2.944,1.792,2.197,0,0,3.401,1.792,0,2.996,1,1,1,1,0,0,1,1,4.745]],["openai/gpt-6.1-sol","high",1,1,[10.397,6.263,4.151,0,7.091,6.608,1.622,1,0,0,0,0,0,1,1,1,0,1,0,1,1,2.398,1.386,0,0.611,0,1,0,0,0,1.099,4.511,3.583,2.079,2.398,0,0,3.689,1.609,1.099,3.045,1,1,1,0,1,1,1,1,4.836]],["openai/gpt-6.1-sol","high",1,1,[10.385,6.225,4.178,0,7.091,6.581,1.667,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.996,1.386,0,0.186,0,0,1,0,0,1.386,4.5,3.135,2.079,2.398,0,0,3.738,1.386,1.099,2.773,1,1,1,0,0,0,1,1,5.043]],["openai/gpt-6-luna","medium",1,1,[9.547,5.318,4.248,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,1,0,0,0,1,2.773,0.693,0,0.143,0,0,0,0,0,0,3.97,3.526,1.792,0.693,0,0,2.708,2.079,0.693,0,0,0,0,1,1,1,0,0,4.263]],["openai/gpt-6-luna","max",1,1,[9.591,5.447,4.164,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.89,0.693,0,0.242,0,0,0,0,0,0,4.007,3.178,1.386,0.693,0,0,3.178,1.792,1.099,0,0,0,0,1,1,1,0,0,3.951]],["openai/gpt-6-luna","max",1,1,[8.916,4.407,4.532,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,0,2.944,0.693,0,0.277,0,0,0,0,0,0,3.555,3.178,1.792,1.099,0,0,2.639,1.099,0.693,0,1,0,0,1,1,1,0,0,3.611]],["openai/gpt-6-luna","max",1,1,[9.703,5.869,3.858,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,3.583,2.833,0,0,0.751,0,0,0,0,1.099,3.664,3.135,1.946,2.565,1.386,0,3.178,1.792,0,1.609,0,0,0,0,0,0,0,1,3.951]],["openai/gpt-6-luna","medium",1,1,[10.354,6.583,3.795,0,6.909,6.431,1.613,1,0,0,0,0,1,0,0,1,1,0,0,1,1,2.996,0.693,0,0.406,0,0,0,0,0,1.609,4.22,3.497,1.609,2.079,0,0,3.091,1.946,0.693,0,1,1,1,1,1,1,0,1,4.394]],["openai/gpt-6-luna","medium",1,1,[9.775,5.781,4.016,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,0,1,0,0,1,1,2.079,0.693,0,0.585,0,0,0,0,0,2.89,3.689,2.833,0.693,0.693,2.944,0,3.091,1.386,0.693,0,1,1,1,1,0,1,0,1,4.143]],["openai/gpt-6-luna","medium",1,1,[9.794,5.846,3.969,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,1,0,0,1,1,3.091,0.693,0,0.344,0,0,0,0,0,0,4.077,3.135,1.386,0.693,0,0,3.135,1.609,0,0,1,1,1,1,1,0,0,0,3.892]],["openai/gpt-6-luna","low",1,1,[9.637,5.591,4.067,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,1,2.398,0.693,0,0.346,0,0,0,0,0,0,3.784,3.497,0.693,0.693,0,0,3.332,2.197,0.693,0,1,1,1,1,1,1,0,0,4.174]],["openai/gpt-6-luna","low",1,1,[9.574,5.447,4.148,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,1,2.996,0.693,0,0.147,0,0,0,0,0,1.705,3.829,3.466,2.485,1.386,0,0,3.296,1.386,0.693,0,1,1,1,1,0,1,0,0,4.174]],["openai/gpt-6-luna","low",1,1,[9.675,5.7,3.997,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.773,0.693,0,0.5,0,0,0,0,0,1.705,3.871,3.045,1.099,1.386,0,0,2.639,1.386,0.693,0,1,1,1,1,1,1,0,0,4.159]],["openai/gpt-6-luna","low",1,1,[9.782,5.805,3.999,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.944,0.693,0,0.325,0,0,0,0,0,1.705,4.127,3.434,1.099,1.386,0,0,2.996,1.386,0,0,1,1,1,1,1,0,0,1,4.248]],["openai/gpt-6-luna","medium",1,1,[9.844,5.835,4.03,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,0,1,0,0,1,1,3.091,0.693,0,0.061,0,0,0,0,0,0,3.85,3.135,1.946,0.693,3.219,0,2.773,1.792,0,0,1,1,1,1,0,0,0,1,4.443]],["openai/gpt-6-luna","medium",1,1,[9.842,5.905,3.958,0,6.909,6.415,1.639,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.565,0.693,0,0.481,0,0,0,0,0,0,3.761,3.091,1.386,0.693,0,0,2.996,1.792,0,0,1,1,1,1,1,0,0,0,4.29]],["openai/gpt-6-luna","medium",1,1,[9.69,5.9,3.816,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.996,0.693,0,0.344,0,0,0,0,0,0,3.664,3.871,1.386,0.693,0,0,3.178,1.386,1.099,0,1,1,1,1,1,1,0,0,4.06]],["openai/gpt-6-luna","medium",1,1,[9.419,5.347,4.094,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,0,0,0,0,1,2.833,0.693,0,0.056,0,0,0,0,0,0,3.555,3.638,2.079,0.693,0,0,2.773,1.099,0.693,0,1,1,1,1,1,1,0,0,3.714]],["openai/gpt-6-sol","max",1,1,[9.57,5.361,4.228,0,7.091,6.635,1.579,0,0,0,0,0,0,1,0,1,0,1,0,0,1,2.833,1.099,0,0.282,0,0,0,0,0,2.197,4.06,2.773,1.609,1.386,0,0,2.944,1.386,0,0,1,0,0,0,0,0,0,1,4.111]],["google/gemini-4-argon","high",1,1,[10.888,7.057,3.853,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,0,0,0,4.82,3.892,0,0,0.699,0,0,0,0,1.099,4.159,3.258,1.609,3.091,3.497,0,3.85,2.773,0,1.099,0,0,0,0,0,0,0,1,4.382]],["google/gemini-4-argon","high",1,1,[10.827,6.927,3.921,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,1,0,0,4.682,3.951,0,0,0,0,0,0,0,1.099,4.077,3.135,1.609,3.045,3.555,1.609,3.583,2.708,0,1.946,0,0,0,0,0,0,0,1,4.654]],["google/gemini-4-argon","high",1,1,[10.836,6.908,3.949,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,1,0,0,4.718,3.401,0,0,0,0,0,0,0,1.099,4.369,3.135,1.946,3.178,3.738,1.609,3.829,2.708,0,2.079,0,0,0,0,0,0,0,1,4.736]],["google/gemini-4-argon","high",1,1,[10.434,6.568,3.888,0,6.803,6.365,1.552,0,0,0,0,0,0,1,0,0,0,1,1,0,0,4.477,3.091,0,0,0.718,0,0,0,0,1.504,3.951,2.89,1.946,2.89,3.97,1.609,3.689,2.303,0,1.609,0,0,0,0,0,0,0,1,4.407]],["google/gemini-4-argon","high",1,1,[10.517,6.696,3.844,0,6.868,6.33,1.714,0,0,0,0,0,0,1,0,1,0,1,0,0,0,4.543,3.296,0,0,0.718,0,0,0,0,1.099,3.689,2.996,1.609,2.773,3.367,2.197,3.526,2.197,0,2.565,0,0,0,0,0,0,0,1,3.784]],["google/gemini-4-argon","max",1,1,[10.643,6.848,3.818,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,1,0,4.615,3.434,0,0,0,0,0,0,0,1.386,3.689,3.296,1.386,2.708,3.583,1.946,3.526,2.398,0,1.792,0,0,0,0,0,0,0,1,3.85]],["google/gemini-4-argon","high",1,1,[10.279,6.531,3.773,0,6.803,6.293,1.667,0,0,0,0,0,0,1,0,0,0,1,0,0,0,4.331,2.833,0,0,0,0,0,0,0,1.253,3.497,3.045,1.099,3.091,3.611,0.693,3.332,1.946,0,1.792,0,0,0,0,0,0,0,1,3.664]],["google/gemini-4-argon","high",1,1,[10.643,6.844,3.822,0,7.091,6.553,1.714,0,0,0,0,0,0,1,0,0,0,1,0,1,0,4.533,3.401,0,0,0.536,0,0,0,0,1.792,3.784,3.219,1.386,2.944,3.583,1.792,3.555,2.485,0.693,2.303,0,0,0,0,0,1,0,1,4.736]],["google/gemini-4-argon","medium",1,1,[10.395,6.612,3.807,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,0,0,4.431,3.296,0,0,0.727,0,0,0,0,1.609,3.932,2.944,1.099,2.485,3.401,1.609,3.296,2.303,0,1.099,0,0,0,0,0,0,0,1,4.007]],["google/gemini-4-argon","high",1,1,[10.614,6.864,3.775,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,1,0,4.489,3.434,0,0,0.719,0,0,0,0,1.386,3.892,3.258,1.792,2.773,3.296,1.946,3.638,2.303,0.693,1.099,0,0,0,0,0,1,0,1,4.331]],["google/gemini-4-argon","max",1,1,[10.711,6.886,3.849,0,6.803,6.33,1.607,0,0,0,0,0,0,1,0,0,0,1,1,1,0,4.654,3.555,0,0,0.751,0,0,0,0,1.386,3.932,3.178,1.792,2.833,3.638,1.792,3.714,2.303,0,1.099,0,0,0,0,0,0,0,1,3.807]],["google/gemini-4-argon","max",1,1,[10.515,6.727,3.811,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,4.443,2.996,0,0,0.72,0,0,0,0,1.253,3.583,3.091,1.609,2.708,3.497,1.386,3.401,2.197,0,1.946,0,0,0,0,0,0,0,1,3.807]],["anthropic/claude-opus-5.5","max",1,1,[10.516,5.9,4.629,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,0,1,0,0,1,1,3.219,1.099,0,0.017,0.79,0,0,1,0,1.099,4.654,4.317,3.761,2.944,3.332,0,4.277,0,0,0.693,1,1,1,0,0,0,0,1,4.369]],["anthropic/claude-opus-5.5","max",1,1,[9.565,5.375,4.209,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,1,0,0,0,0,0,2.197,0.693,0,0.181,0,0,0,0,0,1.792,3.738,3.367,3.178,3.178,1.609,0,3.466,1.386,0,0,0,0,0,0,1,0,0,0,4.143]],["google/gemini-3.8-flash","high",1,1,[10.228,6.474,3.779,0,6.909,6.479,1.538,0,0,0,0,0,0,0,0,1,0,0,0,0,0,4.382,0.693,0,0,0.707,0,0,0,0,1.386,3.689,3.045,1.946,2.944,3.526,2.079,3.555,2.398,0,2.708,0,0,0,0,0,0,0,0,4.466]],["google/gemini-3.8-flash","high",1,1,[9.304,5.05,4.274,0,7.091,6.635,1.579,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.398,0.693,0,0.379,0,0,0,0,0,0,3.932,2.303,1.609,0,0,0,2.639,1.792,0,0,0,0,0,0,1,0,0,0,4.111]],["anthropic/claude-haiku-5.5","high",1,1,[8.633,4.443,4.217,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,2.197,0.693,0,0.22,0,0,0,0,0,0,3.178,2.197,2.197,0.693,0,0,2.197,1.099,0.693,0,0,0,0,1,1,1,0,0,3.401]],["anthropic/claude-haiku-5.5","high",1,1,[9.18,5.497,3.711,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,2.996,2.773,0,0,0,0,0,0,0,0,2.944,2.197,2.079,1.609,1.946,0,2.833,1.099,0,2.079,0,0,0,0,0,0,0,1,3.401]],["anthropic/claude-haiku-5.5","high",1,1,[9.286,5.572,3.742,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,2.833,2.89,0,0,0,0,0,0,0,1.705,2.833,2.565,1.946,1.609,1.792,0,2.485,1.792,0,1.609,0,0,0,0,0,0,0,1,3.689]],["anthropic/claude-haiku-5.5","high",1,1,[9,5.489,3.544,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.258,0.693,0,0,0,0,0,0,0,1.386,2.639,2.197,2.303,2.639,2.996,0,2.996,1.386,0.693,0,1,0,0,0,0,0,0,0,3.091]],["xiaomi/mimo-v2.6-flash","max",1,1,[9.52,5.403,4.138,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,0,3.219,0.693,0,0.568,0,0,0,0,0,0,4.007,3.555,1.609,0.693,0,0,3.045,1.609,0.693,1.609,0,0,0,0,1,1,0,0,4.025]],["xiaomi/mimo-v2.6-flash","max",1,1,[9.597,5.602,4.017,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0.693,0,0.151,0,0,0,0,0,1.504,4.043,3.219,0.693,2.197,0,0,3.401,2.197,1.099,0,1,0,0,0,1,1,0,0,4.29]],["openai/gpt-5.6-sol","max",1,1,[9.503,5.46,4.065,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2.565,0.693,0,0.469,0,0,0,0,0,0,3.611,3.784,1.386,1.386,0,0,3.091,1.946,1.099,0,0,0,0,0,0,1,0,0,3.951]],["upstage/solar-pro4","max",1,1,[9.424,5.352,4.093,0,6.909,6.399,1.667,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.996,0.693,0,0.56,0,0,0,0,0,0,3.829,2.996,0.693,0.693,0,0,3.219,1.609,1.099,0,1,0,0,0,1,1,0,0,4.025]],["minimax/minimax-m3","medium",1,1,[8.902,5.375,3.56,0,6.686,5.994,2,0,0,0,0,0,0,1,0,0,1,0,0,0,0,3.583,1.386,0,0,0.756,0,0,0,0,0,2.197,2.639,2.197,2.197,2.944,0,2.833,1.099,0,0,0,0,0,0,0,0,0,1,3.219]],["openai/gpt-6-astra","max",1,1,[10.161,5.999,4.18,0,7.273,6.803,1.6,0,0,0,1,0,0,1,0,1,1,1,0,0,0,0,0.693,0,0.145,0,0,0,0,0,1.504,4.344,3.091,2.833,2.303,1.099,0,3.871,1.946,1.386,3.738,1,0,0,0,1,1,0,1,4.745]],["moonshotai/kimi-k3","max",1,1,[9.857,5.638,4.237,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,0,1,0,0,0,0,1.386,0.693,0.735,0,0,0,0,0,0,1.609,0,0.693,0,1.609,1.099,0,2.89,0.693,0,0,0,0,0,0,0,0,0,0,3.367]],["moonshotai/kimi-k3","max",1,1,[9.415,5.545,3.894,0,6.33,5.771,1.75,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3.466,0.693,0,0.409,0,0,0,0,0,0.693,3.583,2.773,2.079,2.398,2.485,0,3.258,1.386,0,2.398,1,0,0,0,1,0,0,0,3.526]],["moonshotai/kimi-k3","max",1,1,[10.064,6.125,3.961,0,6.803,6.293,1.667,1,0,0,0,0,0,0,0,1,1,0,0,1,1,3.714,1.386,0,0.236,0,0,0,0,0,1.386,4.094,3.296,3.178,2.197,0,1.099,3.951,2.197,0.693,0,1,1,1,1,1,1,0,0,4.094]],["moonshotai/kimi-k3","max",1,1,[10.364,3.466,6.931,0,6.909,6.553,1.429,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0.693,0,0.415,0.017,0,0,1,0,1.705,4.127,3.989,3.989,3.664,3.951,0,3.85,1.946,0,0,1,0,0,0,0,0,0,0,4.304]],["z-ai/glm-5.3","high",1,1,[9.836,5.979,3.88,0,6.803,6.256,1.731,0,0,0,0,0,0,1,0,1,1,1,0,0,0,3.526,2.079,0,0.139,0,0,0,0,0,1.386,2.944,3.045,2.833,1.792,3.714,0,2.833,1.946,0,0,1,0,0,1,1,0,0,1,3.932]],["z-ai/glm-5.3","high",1,1,[9.776,5.981,3.82,0,6.803,6.256,1.731,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.689,2.079,0,0,0,0,0,0,0,2.639,3.091,2.996,1.386,2.079,3.738,0,3.296,1.609,0,1.792,1,0,0,0,1,0,0,1,4.025]],["anthropic/claude-sonnet-5.5","low",1,1,[9.252,5.476,3.803,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,1,0,0,0,0,0,3.689,0,0,0,0,0,0,0,0,0,3.401,2.833,1.792,2.079,2.398,0,3.178,1.099,0,2.708,0,0,0,0,1,0,0,0,3.689]],["anthropic/claude-sonnet-5.5","low",1,1,[8.82,4.92,3.927,0,6.909,6.399,1.667,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3.045,0.693,0,0,0,0,0,0,0,0,2.944,2.303,1.946,2.996,2.398,0,2.773,0.693,0,0,0,0,0,0,1,0,0,0,3.178]],["anthropic/claude-sonnet-5.5","high",1,1,[9.477,5.765,3.74,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,3.258,3.045,0,0,0,0,0,0,0,1.099,3.135,2.303,2.708,2.079,1.946,0,3.091,1.099,0.693,0,0,0,0,0,0,0,0,1,3.689]],["anthropic/claude-sonnet-5.5","high",1,1,[9.476,5.768,3.735,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,3.332,2.833,0,0,0,0,0,0,0,1.609,3.091,2.303,1.099,2.079,0.693,1.099,2.773,1.099,0.693,0,0,0,0,0,0,0,0,1,3.871]],["anthropic/claude-sonnet-5.5","high",1,1,[10.184,6.323,3.884,0,6.909,6.33,1.786,0,0,0,0,0,0,1,0,1,0,1,0,1,1,3.091,0,0,0.557,0,0,0,0,0,1.705,4.234,3.611,0.693,1.386,0,0,3.178,1.946,0,0,1,1,1,1,1,0,0,1,4.564]],["anthropic/claude-sonnet-5.5","low",1,1,[9.243,5.425,3.844,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,1,0,0,0,0,3.332,0,0,0,0,0,0,0,0,1.386,3.091,2.303,1.946,2.639,2.773,1.099,3.258,1.099,0,2.708,0,0,0,0,1,0,0,0,3.583]],["anthropic/claude-sonnet-5.5","low",1,1,[8.364,4.205,4.189,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1.609,0,0,0.25,0,0,0,0,0,0,2.708,1.946,1.609,2.773,0,0,2.303,0,0,0,0,0,0,0,1,0,0,0,2.944]],["anthropic/claude-sonnet-5.5","high",1,1,[9.612,5.704,3.931,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.045,0,0.988,0.043,0,0,0,0,0,2.303,3.296,2.708,2.565,2.833,3.526,0,3.258,1.946,0.693,0,1,0,0,0,0,0,0,0,3.829]],["z-ai/glm-5.2","low",1,1,[9.606,5.66,3.969,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.367,0.693,0,0.038,0,0,0,0,0,2.398,3.526,3.219,1.386,1.946,3.091,0,3.258,1.386,0,1.099,1,1,0,1,0,0,0,0,3.85]],["anthropic/claude-fable-5.1","medium",1,1,[8.687,4.812,3.903,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.091,0.693,0,0.333,0,0,0,0,0,0,2.485,2.303,2.079,1.792,2.639,1.099,2.639,0.693,0,0,0,0,0,0,1,0,0,0,3.258]],["qwen/qwen3.7-max","high",1,1,[10.092,6.172,3.942,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.892,0.693,0.01,0,0,0,0,0,0,1.609,3.583,3.497,3.401,1.946,3.689,0,3.951,1.946,0,2.303,1,0,1,0,0,0,0,0,4.007]],["xiaomi/mimo-v2.6-pro","medium",1,1,[9.464,5.855,3.638,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.951,0.693,0.696,0,0.605,0,0,0,0,1.099,2.944,3.219,2.773,2.708,3.526,0,3.258,0,0,0,0,0,0,0,1,0,0,0,3.526]],["openai/gpt-5.5","medium",1,1,[9.627,5.631,4.018,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,0,0,0,0,1,2.708,0.693,0,0.253,0,0,0,0,0,1.386,4.025,2.996,1.099,1.792,0,0,3.219,1.609,0.693,0,1,1,1,1,1,0,0,0,4.143]],["openai/gpt-5.6-luna","medium",1,1,[10.002,6.105,3.919,0,6.686,6.112,1.778,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.466,1.386,0,0,0.767,0,0,0,0,2.833,3.296,3.332,2.944,2.485,3.611,0,3.714,1.792,0.693,0,1,0,0,0,1,1,0,1,3.714]],["anthropic/claude-opus-5.5","max",0,1,[6.702,0.693,6.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,0,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5.5","max",0,1,[7.033,0.693,7.033,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.278,0.615,0,1,1,1,0,2.079,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-terra","max",0,1,[7.449,0.693,7.449,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,1.504,2.398,1.386,0,0.693,0,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.6-terra","max",0,1,[7.011,0.693,7.011,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.622,0,1,1,0,0,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-terra","high",0,0,[6.601,0.693,6.601,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.545,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-terra","high",0,0,[6.852,0.693,6.852,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,1,0,0,0,1.386,1.792,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-terra","high",0,0,[6.94,0.693,6.94,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.455,0,1,0,1,1,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.6-terra","high",0,0,[6.702,0.693,6.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,1,0,0,0,1.609,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-terra","max",0,0,[7.449,0.693,7.449,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,1.504,2.398,1.386,0,0.693,0,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.079]],["anthropic/claude-opus-5","max",0,1,[7,0.693,7,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,1,0,1,0,0,2.197,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","max",0,1,[6.923,0.693,6.923,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.609,0,1,0,1,0,0,1.946,1.099,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-opus-5","max",0,1,[7.316,0.693,7.316,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-opus-5","max",0,1,[8.344,4.248,4.125,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3.045,0.693,0.935,0,0,0,0,1,0,0,3.219,1.792,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3.178]],["anthropic/claude-opus-5","max",0,1,[7.891,3.761,4.168,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0.691,0,0,0,0,0,2.996,1.792,0,1.099,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.944]],["anthropic/claude-opus-5","max",0,1,[7.884,3.555,4.37,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946,0.693,1,0.482,0,1,0,1,1,0,2.833,1.609,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.833]],["anthropic/claude-opus-5","max",0,1,[8.114,4.22,3.929,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708,0.693,1,0.136,0,1,0,1,1,0,2.773,2.079,0,1.386,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,2.833]],["anthropic/claude-opus-5","high",0,0,[6.783,0.693,6.783,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.607,0,0,0,1,0,0,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[6.757,0.693,6.757,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.65,0,0,0,1,0,0,1.946,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[6.921,0.693,6.921,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[7.091,0.693,7.091,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.197]],["anthropic/claude-opus-5","max",0,0,[7,0.693,7,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,1,0,1,0,0,2.197,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-sonnet-5.5","high",0,1,[7.061,0.693,7.061,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.588,0,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197]],["anthropic/claude-sonnet-5.5","high",0,1,[7.233,0.693,7.233,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,1,0,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-sonnet-5.5","high",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-sonnet-5.5","high",0,0,[6.892,0.693,6.892,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.618,0,1,0,1,0,0,2.197,1.386,0,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["anthropic/claude-sonnet-5.5","high",0,0,[6.99,0.693,6.99,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,0.667,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-sonnet-5.5","high",0,0,[6.874,0.693,6.874,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-sonnet-5.5","high",0,0,[6.814,0.693,6.814,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["google/gemini-3.8-flash","high",0,1,[6.661,0.693,6.661,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,0,1,0,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["google/gemini-3.8-flash","high",0,1,[6.548,0.693,6.548,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.581,0,1,1,0,0,0,1.386,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,1,[6.434,0.693,6.434,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.524,0,1,1,1,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,0,[6.513,0.693,6.513,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.682,0,1,1,0,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["google/gemini-3.8-flash","high",0,0,[6.474,0.693,6.474,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,0,[7.28,0.693,7.28,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.941,0,0,0,0,1,0,0,1.946,1.099,1.099,0,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.398]],["google/gemini-3.8-flash","high",0,0,[6.525,0.693,6.525,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,1,0,0,0,1.609,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["google/gemini-3.8-flash","high",0,0,[6.248,0.693,6.248,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,0,1,0,0,0,1.792,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-astra","low",0,1,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.587,0,1,0,1,1,1.609,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","max",0,1,[7.832,3.638,4.235,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079,0.693,0,0.491,0,1,0,1,1,0,2.708,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.773]],["openai/gpt-6-luna","max",0,1,[7.508,0.693,7.508,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.612,0,1,0,1,1,0,2.398,1.099,0,0,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-6-luna","medium",0,1,[7.536,0.693,7.536,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.623,0,1,0,1,1,0,2.485,1.386,0,0,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-6-luna","high",0,0,[7.181,0.693,7.181,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.651,0,1,1,1,1,1.946,2.197,1.386,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-6-luna","high",0,0,[7.462,0.693,7.462,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.717,0,1,0,1,1,0,2.303,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[7.36,0.693,7.36,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.703,0,1,0,0,0,0,2.197,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[7.484,0.693,7.484,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.767,0,1,0,1,0,0,2.197,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[6.881,0.693,6.881,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.714,0,1,1,1,1,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["deepseek/deepseek-v4.1-flash","max",0,1,[4.97,0.693,4.97,1,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],["deepseek/deepseek-v4.1-flash","max",0,1,[8.209,3.989,4.253,0,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,0,0,0,0.693,1.099,0.693,1.609,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,2.485]],["deepseek/deepseek-v4.1-flash","max",0,1,[7.356,0.693,7.356,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.597,0,1,0,1,0,0,2.485,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["deepseek/deepseek-v4.1-flash","max",0,0,[4.97,0.693,4.97,1,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],["deepseek/deepseek-v4.1-flash","max",0,0,[8.209,3.989,4.253,0,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,0,0,0,0.693,1.099,0.693,1.609,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,2.485]],["deepseek/deepseek-v4.1-flash","max",0,0,[7.356,0.693,7.356,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.597,0,1,0,1,0,0,2.485,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["meta/muse-spark-1.3","max",0,1,[7.215,0.693,7.215,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0,0,0,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["meta/muse-spark-1.3","max",0,1,[7.189,0.693,7.189,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.474,0.577,0,1,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["meta/muse-spark-1.3","max",0,0,[7.215,0.693,7.215,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0,0,0,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["meta/muse-spark-1.3","max",0,0,[7.189,0.693,7.189,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.474,0.577,0,1,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-fable-5.1","max",0,1,[7.067,0.693,7.067,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-fable-5.1","max",0,1,[6.692,0.693,6.692,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.194,0,0,0,1,0,1.609,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-fable-5.1","high",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,0,1,1,0,0,2.197,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-fable-5.1","low",0,0,[7.224,0.693,7.224,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.65,0.344,0,0,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-fable-5.1","high",0,0,[6.604,0.693,6.604,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,0,1,1,0,0,1.609,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["anthropic/claude-fable-5.1","high",0,0,[6.64,0.693,6.64,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,1,1,0,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-fable-5.1","high",0,0,[7.152,0.693,7.152,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.809,0,0,0,0,0,0,1.609,1.386,0.693,1.099,2.079,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-haiku-5.5","medium",0,1,[7.091,0.693,7.091,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0.823,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-haiku-5.5","high",0,0,[6.945,0.693,6.945,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-haiku-5.5","high",0,0,[6.941,0.693,6.941,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.048,0.693,7.048,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.333,0.693,7.333,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.622,0,1,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.072,0.693,7.072,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,1,1,0,2.398,1.386,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-sonnet-5","max",0,1,[7.293,2.773,4.594,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.6,0.35,0,1,0,0,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-sonnet-5","high",0,0,[7.328,0.693,7.328,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.792,1.099,0,0.693,2.303,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["anthropic/claude-sonnet-5","high",0,0,[7.26,0.693,7.26,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.125,0,0,0,1,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-sonnet-5","max",0,0,[7.293,2.773,4.594,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.6,0.35,0,1,0,0,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-6-sol","max",0,1,[9.322,4.635,4.706,0,6.803,7.091,0.75,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565,0.693,0,0.311,0,0,0,1,0,0,4.143,2.773,0,1.099,0,0,1.609,0,0.693,0,1,0,0,0,0,0,0,0,4.174]],["openai/gpt-6-sol","high",0,0,[6.182,0.693,6.182,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.733,0,0,0,0,0,0,0.693,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-sol","high",0,0,[6.95,0.693,6.95,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.796,0,1,0,0,0,0,2.079,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-sol","high",0,0,[6.186,0.693,6.186,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.7,0,1,0,0,0,0,1.099,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-sol","high",0,0,[6.818,0.693,6.818,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,1.792,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-6-sol","high",0,0,[6.165,0.693,6.165,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["z-ai/glm-5.3","high",0,1,[6.719,0.693,6.719,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,1,0,1,0,1.792,1.946,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["z-ai/glm-5.3","high",0,0,[6.719,0.693,6.719,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,1,0,1,0,1.792,1.946,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-6.1-sol","max",0,1,[6.813,0.693,6.813,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.577,0,1,0,1,1,1.792,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-6.1-sol","max",0,0,[6.791,0.693,6.791,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.277,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-5.6-luna","high",0,0,[6.842,0.693,6.842,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.6,0,1,0,1,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-luna","high",0,0,[6.809,0.693,6.809,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.59,0,1,0,1,0,0,1.792,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-luna","high",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.524,0,1,0,1,1,0,1.792,1.386,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-luna","high",0,0,[7.049,0.693,7.049,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.5,0,1,0,0,0,0,2.079,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-luna","high",0,0,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,1,0,1,1,0,2.079,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-sol","high",0,0,[6.174,0.693,6.174,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.6-sol","high",0,0,[6.785,0.693,6.785,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.571,0,0,0,0,1,0,0,1.609,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-5.6-sol","high",0,0,[6.023,0.693,6.023,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,0.693,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.6-sol","high",0,0,[6.436,0.693,6.436,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,1,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-sol","high",0,0,[6.629,0.693,6.629,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.386,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-5.5","high",0,0,[6.658,0.693,6.658,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.72,0,0,0,0,0,0,1.946,1.099,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.5","high",0,0,[6.969,0.693,6.969,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.721,0,1,0,0,0,0,1.792,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.5","high",0,0,[6.781,0.693,6.781,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.5","high",0,0,[6.914,0.693,6.914,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.564,0,1,1,1,1,0,2.303,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.5","high",0,0,[7.142,0.693,7.142,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,1.609,1.386,0.693,0.693,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.4","high",0,0,[7.155,0.693,7.155,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.581,0,1,0,0,0,0,2.197,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.4","high",0,0,[6.749,0.693,6.749,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,1,0,0,0,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.4","high",0,0,[6.628,0.693,6.628,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.731,0,1,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.4","high",0,0,[6.745,0.693,6.745,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,1,1,1,0,1.792,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.1-pro-preview","high",0,0,[7.312,0.693,7.312,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.609,1.099,0,0.693,2.485,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["anthropic/claude-sonnet-4.6","high",0,0,[7.093,0.693,7.093,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.792,1.386,0.693,1.099,1.792,0,1.386,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-sonnet-4.6","high",0,0,[6.955,0.693,6.955,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,0,0,0,0,2.303,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["meta/muse-spark-1.3","high",0,0,[7.589,0.693,7.589,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.636,0,0,0,0,0,0,1.099,2.89,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.303],{"EAF6FF":4,"FFD60A":4,"F4A261":4,"FFB703":4,"V11":4,"H31":4,"ECAE6":4,"FB8500":4,"H14L14":4,"HEX_#eaf6ff":4}],["google/gemini-4-argon","high",0,0,[6.394,1.099,5.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.7,0,1,0,1,0,1.946,1.099,0.693,0,1.099,0,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,1.386],{"e8f4f8":4,"fbc531":4,"L10":4,"HEX_#e8f4f8":4,"HEX_#fbc531":4}],["openai/gpt-6.1-sol","high",0,0,[5.288,1.099,4.6,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0.693,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099],{"f5bd62":4,"HEX_#f5bd62":4,"HEX_#397d83":4}],["deepseek/deepseek-v4.1-flash","max",0,0,[7.103,0.693,7.103,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.4,0,1,1,1,1,0,2.485,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"EAF4FA":4,"F5B942":4,"H4M9":4,"A6D3":4,"CCBE6":4,"F0984A":4,"HEX_#33424d":4,"HEX_#eaf4fa":4,"HEX_#f5b942":4,"HEX_#57a6d3":4,"HEX_#9ccbe6":4,"HEX_#f0984a":4}],["openai/gpt-6-luna","medium",1,0,[8.242,0.693,8.242,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.971,0,0,0,0,0,0,1.281,2.833,1.609,1.609,1.386,1.946,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.398],{"eef6fb":4,"E6F2FA":4,"B3A4A":4,"FFCF3D":4,"FFAD33":4,"FFFFFF":4,"EEF2F5":4,"FF7A3D":4,"FB3E8":4,"FFEC9A":4,"HEX_#eef6fb":4,"HEX_#e6f2fa":4,"HEX_#2b3a4a":4,"HEX_#ffcf3d":4,"HEX_#ffad33":4,"HEX_#ffffff":4,"HEX_#eef2f5":4,"HEX_#ff7a3d":4,"HEX_#4fb3e8":4,"HEX_#ffec9a":4}],["openai/gpt-6-luna","medium",0,0,[7.402,0.693,7.402,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,2.197,1.099,0.693,0.693,2.197,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fef3c7":4,"f59e0b":4,"b82f6":4,"e3a8a":4,"fef9c3":4,"HEX_#fef3c7":4,"HEX_#f59e0b":4,"HEX_#92400e":4,"HEX_#3b82f6":4,"HEX_#1e3a8a":4,"HEX_#fef9c3":4}],["google/gemini-4-argon","high",0,0,[6.708,0.693,6.708,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"ffe0b2":4,"ff5252":4,"b0bec5":4,"C14":4,"C25":4,"e65100":4,"a237e":4,"HEX_#ffe0b2":4,"HEX_#ff5252":4,"HEX_#b0bec5":4,"HEX_#1a237e":4,"ffb74d":2.8,"L17":2.8,"ff8a65":2.8,"HEX_#e65100":2.8,"HEX_#ff8a65":2.8}],["google/gemini-4-argon","high",0,0,[6.727,0.693,6.727,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fce4ec":4,"ffca28":4,"C27":4,"ffb300":4,"e65100":4,"T19":4,"T27":4,"HEX_#fce4ec":4,"HEX_#ffca28":4,"HEX_#90a4ae":4,"HEX_#00838f":4,"HEX_#80deea":4,"HEX_#ffb300":2.8,"HEX_#e65100":2.8,"HEX_#212121":2.8}],["google/gemini-4-argon","high",0,0,[6.744,0.693,6.744,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e0f7fa":4,"C27":4,"b0bec5":4,"ff8f00":4,"ffa000":4,"b2ebf2":4,"HEX_#b0bec5":4,"HEX_#ff8f00":4,"HEX_#0097a7":4,"HEX_#b2ebf2":4,"ffd54f":2.8,"HEX_#ffa000":2.8,"HEX_#212121":2.8}],["google/gemini-4-argon","high",0,0,[7.006,0.693,7.006,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fce4ec":4,"ffb300":4,"ffe082":4,"cfd8dc":4,"ff8f00":4,"e65100":4,"ffa000":4,"a237e":4,"HEX_#fce4ec":4,"HEX_#ffe082":4,"HEX_#cfd8dc":4,"HEX_#ff8f00":4,"HEX_#283593":4,"HEX_#1a237e":4,"L32":2.8,"HEX_#ffb300":2.8,"HEX_#37474f":2.8,"HEX_#e65100":2.8,"HEX_#ffa000":2.8}],["google/gemini-4-argon","high",0,0,[7.109,0.693,7.109,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0.405,2.197,1.099,0,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.773],{"e0f7fa":4,"ffca28":4,"ffb300":4,"d4c41":4,"ff7043":4,"C14":4,"ffab40":4,"e65100":4,"ffd740":4,"HEX_#ffca28":4,"HEX_#00acc1":4,"HEX_#6d4c41":4,"HEX_#ff7043":4,"HEX_#90a4ae":4,"HEX_#ffab40":4,"HEX_#ffd740":4,"HEX_#00838f":4,"HEX_#80deea":4,"L32":2.8,"HEX_#ffb300":2.8}],["google/gemini-4-argon","high",0,0,[6.915,0.693,6.915,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ffecb3":4,"ff5722":4,"b0bec5":4,"ffb300":4,"e65100":4,"fb8c00":4,"HEX_#ffecb3":4,"HEX_#ff5722":4,"HEX_#b0bec5":4,"HEX_#fb8c00":4,"HEX_#00695c":4,"HEX_#004d40":4,"C19":2.8,"Q14":2.8,"L32":2.8,"ff8a65":2.8,"HEX_#ffb300":2.8,"HEX_#e65100":2.8,"HEX_#212121":2.8,"HEX_#ff8a65":2.8}],["google/gemini-4-argon","high",0,0,[6.815,0.693,6.815,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8eaf6":4,"ffca28":4,"cfd8dc":4,"ffa726":4,"ef6c00":4,"a237e":4,"HEX_#e8eaf6":4,"HEX_#ffca28":4,"HEX_#cfd8dc":4,"HEX_#90a4ae":4,"HEX_#1a237e":4,"HEX_#00838f":4,"HEX_#80deea":4,"C19":2.8}],["google/gemini-4-argon","high",0,0,[6.77,0.693,6.77,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ff5722":4,"d7ccc8":4,"a1887f":4,"ff9800":4,"e65100":4,"e2723":4,"HEX_#ff5722":4,"HEX_#d7ccc8":4,"HEX_#a1887f":4,"HEX_#ff9800":4,"HEX_#3e2723":4,"HEX_#0277bd":4,"Q14":2.8,"HEX_#e65100":2.8}],["google/gemini-4-argon","high",0,0,[6.804,0.693,6.804,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"f3e5f5":4,"ffa000":4,"cfd8dc":4,"f57c00":4,"T19":4,"T27":4,"fa8da":4,"HEX_#f3e5f5":4,"HEX_#cfd8dc":4,"HEX_#90a4ae":4,"HEX_#f57c00":4,"HEX_#283593":4,"HEX_#9fa8da":4,"C19":2.8,"ffb74d":2.8,"HEX_#ffa000":2.8}],["google/gemini-4-argon","high",0,0,[6.757,0.693,6.757,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"fce4ec":4,"ffb300":4,"fb8c00":4,"T19":4,"T27":4,"HEX_#fce4ec":4,"HEX_#90a4ae":4,"HEX_#fb8c00":4,"HEX_#1565c0":4,"HEX_#64b5f6":4,"ffd54f":2.8,"L17":2.8,"HEX_#ffb300":2.8,"HEX_#212121":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.199,0.693,7.199,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.718,0,0,0,1,0,0,2.303,1.099,0,1.099,0,0,1.099,1.099,0,0,0,0,0,0,0,0,0,0,2.197],{"a1b5c":4,"c2477a":4,"ff9e5e":4,"a2f7a":4,"c6fd6":4,"a1033":4,"HEX_#2a1b5c":4,"HEX_#c2477a":4,"HEX_#ff9e5e":4,"HEX_#3a2f7a":4,"HEX_#14123a":4,"HEX_#7c6fd6":4,"HEX_#1a1033":4,"ffd166":2.8,"M11":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.359,0.693,7.359,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,0,0,1,0,0,2.485,1.099,0,1.099,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"ffcf70":4,"ff7e5f":4,"fff3b0":4,"fefefe":4,"d3142":4,"aa0b0":4,"d405b":4,"a3b12":4,"e76f51":4,"HEX_#ffcf70":4,"HEX_#ff7e5f":4,"HEX_#fff3b0":4,"HEX_#264e70":4,"HEX_#7fb7d9":4,"HEX_#fefefe":4,"HEX_#2d3142":4,"HEX_#9aa0b0":4,"HEX_#3d405b":4,"HEX_#8a3b12":4,"HEX_#e76f51":4}],["anthropic/claude-opus-5.5","max",0,0,[7.3,0.693,7.3,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,0,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"ff9a76":4,"ffd6a5":4,"ffef7a":4,"d6fa3":4,"ecae6":4,"f1f5f9":4,"a3412":4,"HEX_#ff9a76":4,"HEX_#ffd6a5":4,"HEX_#ffef7a":4,"HEX_#1d6fa3":4,"HEX_#f1f5f9":4,"HEX_#475569":4,"HEX_#94a3b8":4,"HEX_#9a3412":4,"HEX_#ffb703":2.8,"HEX_#8ecae6":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.457,0.693,7.457,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.545,0,0,0,1,0,0,2.639,1.386,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.485],{"eaf6e9":4,"ffd23f":4,"V32H0z":4,"a86ff":4,"cfe3ff":4,"a8b6c8":4,"ff9f1c":4,"a4b00":4,"ffbf69":4,"HEX_#eaf6e9":4,"HEX_#ffd23f":4,"HEX_#3a86ff":4,"HEX_#265cb5":4,"HEX_#cfe3ff":4,"HEX_#a8b6c8":4,"HEX_#8a4b00":4,"HEX_#ffbf69":4,"M11":2.8,"d3557":2.8,"HEX_#1d3557":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.513,0.693,7.513,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.547,0,0,0,1,0,0,2.565,1.386,0,0.693,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.639],{"be7ff":4,"e8fbff":4,"ffe14d":4,"V32H0z":4,"f8b8d":4,"b6e70":4,"a7f3f0":4,"b2d42":4,"d99ae":4,"ff7b00":4,"a3b00":4,"ffb000":4,"HEX_#9be7ff":4,"HEX_#e8fbff":4,"HEX_#ffe14d":4,"HEX_#0f8b8d":4,"HEX_#0b6e70":4,"HEX_#a7f3f0":4,"HEX_#2b2d42":4,"HEX_#8d99ae":4}],["anthropic/claude-opus-5.5","max",0,0,[7.436,0.693,7.436,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.564,0,0,0,1,0,0,2.565,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"e0f4f1":4,"ff6b6b":4,"V32H0z":4,"ec4b6":4,"a8f84":4,"cbf3f0":4,"fff8e7":4,"e9c46a":4,"c4a1a":4,"e76f51":4,"HEX_#e0f4f1":4,"HEX_#ff6b6b":4,"HEX_#2ec4b6":4,"HEX_#1a8f84":4,"HEX_#cbf3f0":4,"HEX_#fff8e7":4,"HEX_#e9c46a":4,"HEX_#9c4a1a":4,"HEX_#e76f51":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.495,0.693,7.495,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,0,0,1,0,0,2.565,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"f3e9ff":4,"ff8fab":4,"e60ce":4,"c7d2fe":4,"a5b4fc":4,"fffdf7":4,"b8b8d1":4,"a4a00":4,"HEX_#f3e9ff":4,"HEX_#ff8fab":4,"HEX_#5e60ce":4,"HEX_#c7d2fe":4,"HEX_#a5b4fc":4,"HEX_#fffdf7":4,"HEX_#22223b":4,"HEX_#b8b8d1":4,"HEX_#7a4a00":4,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.303,0.693,7.303,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,0,0,1,0,0,2.485,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"fff4d6":4,"ffd56b":4,"a7fb5":4,"bfe0ff":4,"cc6ef":4,"d405b":4,"c9ccd5":4,"b1b2f":4,"f28c28":4,"a3b12":4,"f6b042":4,"f5d8a":4,"HEX_#fff4d6":4,"HEX_#ffd56b":4,"HEX_#4a7fb5":4,"HEX_#bfe0ff":4,"HEX_#9cc6ef":4,"HEX_#3d405b":4,"HEX_#c9ccd5":4,"HEX_#1b1b2f":4}],["anthropic/claude-opus-5.5","max",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.586,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"eaf4f4":4,"f6bd60":4,"V32H0z":4,"fa8d3":4,"b4965":4,"f28482":4,"bee9e8":4,"HEX_#eaf4f4":4,"HEX_#f6bd60":4,"HEX_#5fa8d3":4,"HEX_#1b4965":4,"HEX_#62b6cb":4,"HEX_#f28482":4,"HEX_#bee9e8":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.998,0.693,6.998,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,1,0,0,0,0,2.197,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"e0fbfc":4,"ee6c4d":4,"V32H0z":4,"d5a80":4,"f4a28c":4,"HEX_#e0fbfc":4,"HEX_#ee6c4d":4,"HEX_#3d5a80":4,"HEX_#98c1d9":4,"HEX_#293241":4,"HEX_#f4a28c":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.904,0.693,6.904,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.63,0,1,0,0,0,0,2.079,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"d8f3dc":4,"ffd60a":4,"V32H0z":4,"adb5bd":4,"HEX_#d8f3dc":4,"HEX_#0077b6":4,"HEX_#90e0ef":4,"HEX_#03045e":4,"HEX_#adb5bd":4,"HEX_#ffd60a":2.8,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.969,0.693,6.969,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.577,0,1,0,0,0,0,1.946,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.398],{"ffe5b4":4,"ff5e5b":4,"d8f3f3":4,"f2f2f":4,"ffd23f":4,"HEX_#ffe5b4":4,"HEX_#ff5e5b":4,"HEX_#00a6a6":4,"HEX_#d8f3f3":4,"HEX_#2f2f2f":4,"HEX_#111":4,"HEX_#ffd23f":4,"ffb347":2.8,"f4a261":2.8,"HEX_#ffb347":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.913,0.693,6.913,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.625,0,1,0,0,0,0,2.079,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fefae0":4,"dda15e":4,"V32H0z":4,"V24q-4-2-8":4,"faedcd":4,"bc6c25":4,"HEX_#fefae0":4,"HEX_#dda15e":4,"HEX_#283618":4,"HEX_#606c38":4,"HEX_#faedcd":4,"HEX_#bc6c25":4}],["anthropic/claude-opus-5.5","max",0,0,[6.884,0.693,6.884,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,1,0,0,0,0,1.792,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.303],{"ffcdb2":4,"e5989b":4,"fff1a8":4,"d6875":4,"b5838d":4,"a3a46":4,"HEX_#ffcdb2":4,"HEX_#e5989b":4,"HEX_#fff1a8":4,"HEX_#6d6875":4,"HEX_#b5838d":4,"HEX_#3a3a46":4,"HEX_#111":4,"f4a261":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.043,0.693,7.043,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.576,0,1,0,0,0,0,2.303,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"edf6f9":4,"ffddd2":4,"e29578":4,"V32H0z":4,"HEX_#edf6f9":4,"HEX_#ffddd2":4,"HEX_#e29578":4,"HEX_#83c5be":4,"HEX_#006d77":4,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.836,0.693,6.836,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0.333,0,1,0,0,2.079,1.099,0.693,1.099,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.079],{"ff5e62":4,"ffc371":4,"fff3b0":4,"d2c5e":4,"f7bbf":4,"a1f3d":4,"HEX_#ff5e62":4,"HEX_#ffc371":4,"HEX_#fff3b0":4,"HEX_#3d2c5e":4,"HEX_#8f7bbf":4,"HEX_#2a1f3d":4,"HEX_#241a36":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.827,0.693,6.827,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,0,0,1,0,0,1.792,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffd9a8":4,"ff8c1a":4,"a7fbf":4,"bfe4ff":4,"f4f4f4":4,"d8d8d8":4,"f2a71b":4,"a5650a":4,"f7c35a":4,"HEX_#ffd9a8":4,"HEX_#ff8c1a":4,"HEX_#2a7fbf":4,"HEX_#bfe4ff":4,"HEX_#f4f4f4":4,"HEX_#555":4,"HEX_#d8d8d8":4,"HEX_#f2a71b":4,"HEX_#a5650a":4,"HEX_#f7c35a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.066,0.693,7.066,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.621,0,0,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"b3a8c":4,"ff9a6b":4,"ffd23f":4,"d4e7a":4,"fb8e6":4,"e9e4dc":4,"a3a3a":4,"c9c2b6":4,"e88a1a":4,"f5b445":4,"a5a0a":4,"HEX_#5b3a8c":4,"HEX_#ff9a6b":4,"HEX_#ffd23f":4,"HEX_#1d4e7a":4,"HEX_#7fb8e6":4,"HEX_#e9e4dc":4,"HEX_#3a3a3a":4,"HEX_#c9c2b6":4,"HEX_#111":4}],["anthropic/claude-opus-5.5","max",0,0,[6.983,0.693,6.983,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.561,0,0.571,0,1,0,0,2.197,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.773],{"bfe8f2":4,"ffe14d":4,"ffb400":4,"V32H0z":4,"c8fa8":4,"e6f7fb":4,"f2efe9":4,"ff9f1c":4,"b5650a":4,"ffc15e":4,"d6a7e":4,"HEX_#bfe8f2":4,"HEX_#ffe14d":4,"HEX_#ffb400":4,"HEX_#2c8fa8":4,"HEX_#e6f7fb":4,"HEX_#f2efe9":4,"HEX_#444":4,"HEX_#111":4,"HEX_#b5650a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.073,0.693,7.073,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,1,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fff1e0":4,"ff7b00":4,"V13M10":4,"H22M11":4,"V32H0z":4,"bde6f5":4,"d2d2d":4,"e4e4e4":4,"ef8a17":4,"a5208":4,"d6d8c":4,"HEX_#fff1e0":4,"HEX_#ff7b00":4,"HEX_#118ab2":4,"HEX_#bde6f5":4,"HEX_#2d2d2d":4,"HEX_#e4e4e4":4,"HEX_#111":4,"HEX_#ef8a17":4,"HEX_#9a5208":4}],["anthropic/claude-opus-5.5","max",0,0,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,0,0,1,0,0,2.079,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"e3f4ea":4,"ffcf33":4,"V32H0z":4,"a86c8":4,"d6ecff":4,"b3b3b":4,"e6e6e6":4,"ff8c42":4,"a5520f":4,"ffb877":4,"a6aa3":4,"HEX_#e3f4ea":4,"HEX_#ffcf33":4,"HEX_#3a86c8":4,"HEX_#d6ecff":4,"HEX_#3b3b3b":4,"HEX_#e6e6e6":4,"HEX_#111":4,"HEX_#ff8c42":4,"HEX_#a5520f":4}],["anthropic/claude-opus-5.5","max",0,0,[7.008,0.693,7.008,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.643,0,0.333,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ff6b3d":4,"ab6c4":4,"e9c46a":4,"a0621a":4,"b323b":4,"HEX_#ff6b3d":4,"HEX_#8ab6c4":4,"HEX_#ddd":4,"HEX_#111":4,"HEX_#e9c46a":4,"HEX_#a0621a":4,"HEX_#1b323b":4,"f4a261":2.8,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.965,0.693,6.965,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.55,0,0,0,1,0,0,1.946,2.079,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"fca311":4,"a1128":4,"a506b":4,"e5e5e5":4,"f6bd60":4,"HEX_#14213d":4,"HEX_#fca311":4,"HEX_#0a1128":4,"HEX_#3a506b":4,"HEX_#e5e5e5":4,"HEX_#f6bd60":4,"f4a261":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.165,0.693,7.165,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"e8f1d4":4,"ecae6":4,"b2d42":4,"dde5ed":4,"b35c00":4,"e9eef3":4,"HEX_#e8f1d4":4,"HEX_#2b2d42":4,"HEX_#dde5ed":4,"HEX_#111":4,"HEX_#b35c00":4,"HEX_#e9eef3":4,"HEX_#ffb703":2.8,"HEX_#8ecae6":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.171,0.693,7.171,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.517,0,1,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"cdeffd":4,"ffcb47":4,"f29e00":4,"H7M25":4,"a7ca5":4,"b1b1b":4,"ff9f43":4,"c46a00":4,"ffc078":4,"e6ecf1":4,"HEX_#cdeffd":4,"HEX_#ffcb47":4,"HEX_#f29e00":4,"HEX_#3a7ca5":4,"HEX_#81c3d7":4,"HEX_#46494c":4,"HEX_#d9e2ea":4,"HEX_#1b1b1b":4,"HEX_#ff9f43":4,"HEX_#c46a00":4}],["anthropic/claude-opus-5.5","max",0,0,[6.784,0.693,6.784,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.595,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"edf6f9":4,"ffb4a2":4,"e29578":4,"HEX_#edf6f9":4,"HEX_#ffb4a2":4,"HEX_#e29578":4,"HEX_#006d77":4,"HEX_#83c5be":4,"HEX_#003d42":4}],["anthropic/claude-opus-5.5","max",0,0,[6.793,0.693,6.793,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,1,0,0,0,0,1.946,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"fff1e6":4,"f28482":4,"f6bd60":4,"HEX_#fff1e6":4,"HEX_#f28482":4,"HEX_#f6bd60":4,"d3557":2.8,"a8dadc":2.8,"HEX_#457b9d":2.8,"HEX_#1d3557":2.8,"HEX_#a8dadc":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.771,0.693,6.771,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.619,0,1,0,0,0,0,1.946,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"ffe5ec":4,"ff8fab":4,"e548e":4,"f86c0":4,"e0b1cb":4,"HEX_#ffe5ec":4,"HEX_#ff8fab":4,"HEX_#5e548e":4,"HEX_#231942":4,"HEX_#9f86c0":4,"HEX_#e0b1cb":4,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.83,0.693,6.83,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,0,0,0,0,1.792,1.946,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"ee9b00":4,"a1128":4,"eae0d5":4,"ca6702":4,"HEX_#22333b":4,"HEX_#ee9b00":4,"HEX_#0a1128":4,"HEX_#eae0d5":4,"HEX_#000":4,"HEX_#ca6702":4,"HEX_#94a3b8":4}],["anthropic/claude-opus-5.5","max",0,0,[6.77,0.693,6.77,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.606,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"dee2ff":4,"a0ca3":4,"f72585":4,"HEX_#dee2ff":4,"HEX_#4361ee":4,"HEX_#3a0ca3":4,"HEX_#f72585":4,"HEX_#7209b7":4,"ffd166":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.079,0.693,7.079,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.56,0,1,0,0,0,0,2.197,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"d1a39":4,"f9c74f":4,"d348b":4,"f1f1f1":4,"b0a1a":4,"e9e9e":4,"f8961e":4,"f3722c":4,"HEX_#1d1a39":4,"HEX_#f9c74f":4,"HEX_#3d348b":4,"HEX_#7678ed":4,"HEX_#f1f1f1":4,"HEX_#0b0a1a":4,"HEX_#9e9e9e":4,"HEX_#f8961e":4,"HEX_#f3722c":4}],["anthropic/claude-opus-5.5","max",0,0,[6.891,0.693,6.891,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,0,0,0,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ffcf9e":4,"ff7b54":4,"a86ff":4,"bde0fe":4,"b2d42":4,"d9d9d9":4,"d5fc7":4,"HEX_#ffcf9e":4,"HEX_#ff7b54":4,"HEX_#3a86ff":4,"HEX_#bde0fe":4,"HEX_#2b2d42":4,"HEX_#d9d9d9":4,"HEX_#1d5fc7":4,"ffd166":2.8,"HEX_#ffb703":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.096,0.693,7.096,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,0,0,0,2.398,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fff4e0":4,"ffb4a2":4,"V13M1":4,"H13":4,"e76f51":4,"HEX_#fff4e0":4,"HEX_#ffb4a2":4,"HEX_#e76f51":4,"M11":2.8,"a8dadc":2.8,"d3557":2.8,"f4a261":2.8,"HEX_#a8dadc":2.8,"HEX_#457b9d":2.8,"HEX_#1d3557":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.128,0.693,7.128,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,0,2.197,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.485],{"b4b8a":4,"ff9a76":4,"f86b8":4,"b1b2f":4,"c9c3b6":4,"ff8c42":4,"ffb26b":4,"b2238":4,"HEX_#5b4b8a":4,"HEX_#ff9a76":4,"HEX_#14385c":4,"HEX_#4f86b8":4,"HEX_#1b1b2f":4,"HEX_#c9c3b6":4,"HEX_#ff8c42":4,"HEX_#ffb26b":4,"HEX_#0b2238":4,"ffd166":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.015,0.693,7.015,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,1,0,0,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e8f4f0":4,"f25c54":4,"a9d8f":4,"e9f5db":4,"f7a399":4,"fefae0":4,"e9c46a":4,"HEX_#e8f4f0":4,"HEX_#f25c54":4,"HEX_#2a9d8f":4,"HEX_#e9f5db":4,"HEX_#f7a399":4,"HEX_#fefae0":4,"HEX_#e9c46a":4,"M11":2.8,"f4a261":2.8,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.101,0.693,7.101,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.592,0,1,0,0,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.639],{"ffd23f":4,"d6fa3":4,"fd8f5":4,"fafaf7":4,"a4a4a":4,"c8c8c":4,"a1a1a":4,"f4a72a":4,"b9771a":4,"f7c35a":4,"HEX_#ffd23f":4,"HEX_#1d6fa3":4,"HEX_#9fd8f5":4,"HEX_#fafaf7":4,"HEX_#4a4a4a":4,"HEX_#8c8c8c":4,"HEX_#1a1a1a":4,"HEX_#f4a72a":4,"HEX_#b9771a":4,"HEX_#f7c35a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.937,0.693,6.937,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.591,0,0,0,0,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffe3b8":4,"bfe6ff":4,"f4f4f0":4,"a5a5a":4,"a9a9a":4,"f2b233":4,"c98a1a":4,"f7c95c":4,"HEX_#ffe3b8":4,"HEX_#2b7bb9":4,"HEX_#bfe6ff":4,"HEX_#f4f4f0":4,"HEX_#5a5a5a":4,"HEX_#9a9a9a":4,"HEX_#f2b233":4,"HEX_#c98a1a":4,"HEX_#f7c95c":4,"ff8a3d":2.8,"HEX_#ff8a3d":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.037,0.693,7.037,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0.667,0,0,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"e8f4ea":4,"f9c74f":4,"f3722c":4,"V32H0z":4,"d405b":4,"a8a8b3":4,"d1d1d":4,"f8961e":4,"c0661a":4,"d5f7a":4,"HEX_#e8f4ea":4,"HEX_#f9c74f":4,"HEX_#f3722c":4,"HEX_#277da1":4,"HEX_#90e0ef":4,"HEX_#3d405b":4,"HEX_#a8a8b3":4,"HEX_#1d1d1d":4,"HEX_#f8961e":4,"HEX_#c0661a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.123,0.693,7.123,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.613,0,1,0,0,0,0,2.197,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"b2a49":4,"ffe8a3":4,"e4c63":4,"fb3c9":4,"e9e4d8":4,"a8170":4,"a89f8c":4,"e8a93b":4,"b07a22":4,"f0c066":4,"a3a4c":4,"HEX_#1b2a49":4,"HEX_#ffe8a3":4,"HEX_#0e4c63":4,"HEX_#5fb3c9":4,"HEX_#e9e4d8":4,"HEX_#8a8170":4,"HEX_#a89f8c":4,"HEX_#111":4,"HEX_#e8a93b":4}],["anthropic/claude-opus-5.5","max",0,0,[6.862,0.693,6.862,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.688,0,1,0,0,0,0,1.946,1.099,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.303],{"ff9a8b":4,"ffd3a5":4,"ff5e3a":4,"a3f8f":4,"ff8f6b":4,"f95e0":4,"b2140":4,"e0a030":4,"c9861f":4,"HEX_#ff9a8b":4,"HEX_#ffd3a5":4,"HEX_#ff5e3a":4,"HEX_#3a3f8f":4,"HEX_#ff8f6b":4,"HEX_#8f95e0":4,"HEX_#2b2140":4,"HEX_#e0a030":4,"HEX_#c9861f":4}],["anthropic/claude-opus-5.5","max",0,0,[7.054,0.693,7.054,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ffe8c2":4,"ffb627":4,"ff8c00":4,"a86c8":4,"bfe3ff":4,"f4f4f4":4,"d9d9d9":4,"Q18":4,"f2a33a":4,"b8651a":4,"f7c66b":4,"HEX_#ffe8c2":4,"HEX_#ffb627":4,"HEX_#ff8c00":4,"HEX_#3a86c8":4,"HEX_#bfe3ff":4,"HEX_#f4f4f4":4,"HEX_#555":4,"HEX_#d9d9d9":4,"HEX_#f2a33a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.96,0.693,6.96,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,1,0,0,2.485,1.099,1.099,1.099,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fdf0d5":4,"f77f00":4,"fcbf49":4,"d1d1d":4,"HEX_#fdf0d5":4,"HEX_#f77f00":4,"HEX_#003049":4,"HEX_#fcbf49":4,"HEX_#669bbc":4,"HEX_#1d1d1d":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.229,0.693,7.229,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.773],{"ecae6":4,"e0f4ff":4,"ffd60a":4,"ffc300":4,"d405b":4,"b8c0cc":4,"f2cc8f":4,"c2703d":4,"f6bd60":4,"HEX_#e0f4ff":4,"HEX_#ffc300":4,"HEX_#0077b6":4,"HEX_#023e8a":4,"HEX_#005f99":4,"HEX_#3d405b":4,"HEX_#b8c0cc":4,"HEX_#f2cc8f":4,"HEX_#111":4,"HEX_#c2703d":4,"HEX_#f6bd60":4}],["anthropic/claude-opus-5.5","max",0,0,[7.154,0.693,7.154,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.457,0,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"d8f1f0":4,"ffcf3f":4,"f2a900":4,"b9aaa":4,"a6e3e9":4,"c9d3da":4,"c45a14":4,"ffb26b":4,"HEX_#d8f1f0":4,"HEX_#ffcf3f":4,"HEX_#f2a900":4,"HEX_#1b9aaa":4,"HEX_#a6e3e9":4,"HEX_#36454f":4,"HEX_#c9d3da":4,"HEX_#111":4,"HEX_#c45a14":4,"HEX_#ffb26b":4,"M11":2.8,"ff8a3d":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.903,0.693,6.903,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.519,0,0,0,1,0,0,2.079,1.099,0.693,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.079],{"b1b4f":4,"e2557a":4,"ffb36b":4,"ffd36e":4,"f3c6b":4,"fa3d9":4,"a2233":4,"HEX_#2b1b4f":4,"HEX_#e2557a":4,"HEX_#ffb36b":4,"HEX_#ffd36e":4,"HEX_#1f3c6b":4,"HEX_#6fa3d9":4,"HEX_#2a2233":4}],["anthropic/claude-opus-5.5","max",0,0,[7.015,0.693,7.015,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.526,0,1,0,0,0,0,2.197,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"eaf4f4":4,"f6bd60":4,"f28482":4,"V32H0z":4,"f7ede2":4,"f5cac3":4,"HEX_#eaf4f4":4,"HEX_#f6bd60":4,"HEX_#f28482":4,"HEX_#84a59d":4,"HEX_#52796f":4,"HEX_#f7ede2":4,"HEX_#354f52":4,"HEX_#f5cac3":4,"M11":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.929,0.693,6.929,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.545,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"f8edeb":4,"ffb4a2":4,"ffd6a5":4,"V32H0z":4,"d6875":4,"b5838d":4,"e5989b":4,"d2a32":4,"HEX_#f8edeb":4,"HEX_#ffb4a2":4,"HEX_#ffd6a5":4,"HEX_#6d6875":4,"HEX_#b5838d":4,"HEX_#e5989b":4,"HEX_#2d2a32":4,"e0e0e0":2.8,"f4a261":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.948,0.693,6.948,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.542,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"fcefb4":4,"f79d65":4,"f4845f":4,"V32H0z":4,"fdfcdc":4,"f07167":4,"fed9b7":4,"HEX_#fcefb4":4,"HEX_#f79d65":4,"HEX_#f4845f":4,"HEX_#0081a7":4,"HEX_#00afb9":4,"HEX_#fdfcdc":4,"HEX_#283618":4,"HEX_#f07167":4,"HEX_#fed9b7":4,"M26":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.004,0.693,7.004,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.542,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e9f5db":4,"ffbe0b":4,"V32H0z":4,"d8f3dc":4,"fb5607":4,"HEX_#e9f5db":4,"HEX_#ffbe0b":4,"HEX_#61a5c2":4,"HEX_#d8f3dc":4,"HEX_#013a63":4,"HEX_#fb5607":4,"M26":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.725,0.693,6.725,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,1,0,0,0,0,1.792,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffe8c2":4,"ff9a2e":4,"a8fc4":4,"bfe6ff":4,"f5f5f0":4,"d8d8d0":4,"f2b233":4,"f7c95a":4,"HEX_#ffe8c2":4,"HEX_#ff9a2e":4,"HEX_#3a8fc4":4,"HEX_#bfe6ff":4,"HEX_#f5f5f0":4,"HEX_#555":4,"HEX_#d8d8d0":4,"HEX_#f2b233":4,"HEX_#a66":4,"HEX_#f7c95a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.083,0.693,7.083,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.591,0,1,0,0,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.639],{"cfeefa":4,"ffcf33":4,"f29a00":4,"a8dcf5":4,"a4a4a":4,"e2e2e2":4,"ff9f43":4,"b5651d":4,"ffc078":4,"HEX_#cfeefa":4,"HEX_#ffcf33":4,"HEX_#f29a00":4,"HEX_#2b7bb9":4,"HEX_#a8dcf5":4,"HEX_#4a4a4a":4,"HEX_#e2e2e2":4,"HEX_#111":4,"HEX_#ff9f43":4,"HEX_#b5651d":4,"HEX_#ffc078":4}],["anthropic/claude-opus-5.5","max",0,0,[7.028,0.693,7.028,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.621,0,0,0,0,0,0,2.303,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"d2a4a":4,"ffe08a":4,"f3d5c":4,"aa9d6":4,"e8e4d8":4,"a968a":4,"f4a340":4,"a4a1a":4,"HEX_#1d2a4a":4,"HEX_#ffe08a":4,"HEX_#0f3d5c":4,"HEX_#5aa9d6":4,"HEX_#e8e4d8":4,"HEX_#111":4,"HEX_#9a968a":4,"HEX_#f4a340":4,"HEX_#7a4a1a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.921,0.693,6.921,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fff4d6":4,"ff6b3d":4,"fb8de":4,"f2f0ea":4,"a3a3a":4,"d9d6cc":4,"a0522d":4,"ffd08a":4,"HEX_#fff4d6":4,"HEX_#ff6b3d":4,"HEX_#264d73":4,"HEX_#8fb8de":4,"HEX_#f2f0ea":4,"HEX_#3a3a3a":4,"HEX_#d9d6cc":4,"HEX_#111":4,"HEX_#a0522d":4,"HEX_#ffd08a":4,"HEX_#555":4,"ffb347":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.973,0.693,6.973,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0,0,0,0,0,2.079,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"b4fa0":4,"e5a7a":4,"fc8e8":4,"b5651d":4,"ffcc80":4,"HEX_#6b4fa0":4,"HEX_#1e5a7a":4,"HEX_#7fc8e8":4,"HEX_#999":4,"HEX_#111":4,"HEX_#b5651d":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.657,0.693,6.657,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ffe3b3":4,"b8fb5":4,"b9e3f2":4,"e8e8e8":4,"f2a516":4,"d9822b":4,"c9c9c9":4,"HEX_#ffe3b3":4,"HEX_#3b8fb5":4,"HEX_#b9e3f2":4,"HEX_#e8e8e8":4,"HEX_#f2a516":4,"HEX_#d9822b":4,"HEX_#c9c9c9":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.865,0.693,6.865,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.618,0,1,0,1,0,0,2.197,1.386,0,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"f7d6e0":4,"ff6f4a":4,"ff9d73":4,"fa6d6":4,"d6dbe3":4,"f2a21b":4,"d9792b":4,"HEX_#f7d6e0":4,"HEX_#ff6f4a":4,"HEX_#355c9a":4,"HEX_#ff9d73":4,"HEX_#7fa6d6":4,"HEX_#d6dbe3":4,"HEX_#f2a21b":4,"HEX_#d9792b":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.966,0.693,6.966,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,0.667,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"d9ecf5":4,"H20M30":4,"c7da0":4,"a5d8ea":4,"H8q-4":4,"d3d9de":4,"f2a21b":4,"d9792b":4,"d5f7d":4,"HEX_#d9ecf5":4,"HEX_#2c7da0":4,"HEX_#a5d8ea":4,"HEX_#d3d9de":4,"HEX_#f2a21b":4,"HEX_#d9792b":4,"HEX_#1d5f7d":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.847,0.693,6.847,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"f78a8":4,"fd3ea":4,"H9q-4":4,"d8dde2":4,"f4a21c":4,"e07b2a":4,"HEX_#2f78a8":4,"HEX_#9fd3ea":4,"HEX_#d8dde2":4,"HEX_#f4a21c":4,"HEX_#e07b2a":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.786,0.693,6.786,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"fbd7a8":4,"ff7a3c":4,"ffb27a":4,"fc7df":4,"H9q-2":4,"d9dde2":4,"f4a21c":4,"d9792b":4,"HEX_#fbd7a8":4,"HEX_#ff7a3c":4,"HEX_#ffb27a":4,"HEX_#8fc7df":4,"HEX_#d9dde2":4,"HEX_#f4a21c":4,"HEX_#d9792b":4}],["openai/gpt-6.1-sol","max",0,0,[6.762,0.693,6.762,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.277,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fff3df":4,"f4b64f":4,"a8d5cd":4,"fffdf6":4,"ed9772":4,"f4bd54":4,"bad3bd":4,"HEX_#fff3df":4,"HEX_#f4b64f":4,"HEX_#a8d5cd":4,"HEX_#294b47":4,"HEX_#fffdf6":4,"HEX_#ed9772":4,"HEX_#f4bd54":4,"HEX_#bad3bd":4,"HEX_#568e86":4}],["openai/gpt-6-astra","max",0,0,[6.562,0.693,6.562,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f6ff":4,"ffc857":4,"fffdf5":4,"f2a142":4,"ffd16a":4,"aaeb9":4,"H9M14":4,"H20M24":4,"d8f7ff":4,"HEX_#e5f6ff":4,"HEX_#ffc857":4,"HEX_#48b6cd":4,"HEX_#fffdf5":4,"HEX_#637787":4,"HEX_#f2a142":4,"HEX_#ffd16a":4,"HEX_#263b4d":4,"HEX_#9aaeb9":4,"HEX_#d8f7ff":4,"H21":2.8}],["openai/gpt-6-astra","max",0,0,[6.447,0.693,6.447,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.792,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"dff5ff":4,"ffca45":4,"fffdf1":4,"ffa745":4,"H20":4,"H10M20":4,"H28":4,"HEX_#dff5ff":4,"HEX_#ffca45":4,"HEX_#42b8d0":4,"HEX_#fffdf1":4,"HEX_#607581":4,"HEX_#ffa745":4,"HEX_#233b4b":4,"HEX_#247e99":4}],["openai/gpt-6-astra","max",0,0,[6.565,0.693,6.565,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f5fa":4,"ffcb58":4,"fffdf3":4,"f2a64a":4,"ffd377":4,"caeb7":4,"H9M14":4,"H20M24":4,"d3f4fc":4,"HEX_#e5f5fa":4,"HEX_#ffcb58":4,"HEX_#45afc8":4,"HEX_#fffdf3":4,"HEX_#71828c":4,"HEX_#f2a64a":4,"HEX_#ffd377":4,"HEX_#263c49":4,"HEX_#9caeb7":4,"HEX_#d3f4fc":4,"H21":2.8}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8f5fa":4,"ffc857":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e8f5fa":4,"HEX_#ffc857":4,"HEX_#439fb9":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e6f5ff":4,"ffca55":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e6f5ff":4,"HEX_#ffca55":4,"HEX_#46a8c2":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f4f8":4,"ffc65a":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e5f4f8":4,"HEX_#ffc65a":4,"HEX_#409fb8":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.709,0.693,6.709,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8f5fa":4,"ffc857":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e8f5fa":4,"HEX_#ffc857":4,"HEX_#439fb9":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["google/gemini-4-argon","high",0,0,[6.555,0.693,6.555,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.556,0,1,1,1,0,0,1.792,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099],{"F4C96B":4,"HEX_#147d83":4,"HEX_#f4c96b":4}],["meta/muse-spark-1.3","xhigh",0,0,[6.886,0.693,6.886,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.444,0.576,0,1,0,0,0,1.946,2.079,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.946],{"DFF3FF":4,"FFD93D":4,"FF9F1C":4,"D9CDB":4,"HEX_#dff3ff":4,"HEX_#334155":4,"HEX_#ffd93d":4,"HEX_#2d9cdb":4}],["deepseek/deepseek-v4.1-flash","max",0,0,[7.482,0.693,7.482,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.131,0,0,0,1,1,0,2.485,1.386,0.693,0.693,0,0,1.386,0,0,0,0,0,0,0,0,0,0,0,1.946],{"F7F2E5":4,"F4B860":4,"FBF6E8":4,"C6BF":4,"E8392":4,"H25":4,"HEX_#f7f2e5":4,"HEX_#f4b860":4,"HEX_#22384a":4,"HEX_#fbf6e8":4,"HEX_#76c6bf":4,"HEX_#3e8392":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.964,0.693,6.964,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,1,0,0,2.197,1.386,0.693,1.099,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946],{"H29M18":4,"H19M28":4,"T23":4,"H29M26":4}],["x-ai/grok-4.6","medium",0,0,[6.55,0.693,6.55,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,0,0,0,1.099,1.386,0.693,0,1.609,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792],{"S20":4,"S28":4,"F1C40F":4,"ECF0F1":4,"L23":4,"E67E22":4,"C3E50":4,"HEX_#3498db":4,"HEX_#e67e22":4}],["meta/muse-spark-1.3","max",0,0,[6.739,0.693,6.739,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.923,0,0,0,0,0,0,0,1.099,1.386,0.693,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"E0F7FA":4,"FFD54F":4,"FFA000":4,"T31":4,"F5F5F5":4,"A64":4,"FFB300":4,"E65100":4,"HEX_#0288d1":4,"HEX_#f5f5f5":4}],["anthropic/claude-sonnet-5","high",0,0,[6.512,0.693,6.512,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.909,0,0,0,0,0,0,0,1.386,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"E3F2FD":4,"FFB74D":4,"H32":4,"BBDEFB":4,"FAFAFA":4,"FFA726":4,"EF6C00":4,"HEX_#e3f2fd":4,"HEX_#1976d2":4,"HEX_#bbdefb":4}]],"mt":{"meta/muse-spark-1.3|1":{"treeBlock":4,"scrollMid":4,"scrollFast":4,"scroll-mid":4,"scroll-fast":4,"scarf-tip":4,"sailor":4,"obtained":4,"grassBlock":4,"frond":4,"fgBlock":4,"fffde7":4,"ffab00":4,"fdfefe":4,"fdebd0":4,"fd3f4":4,"f9be8":4,"f8ad9d":4,"f7e0a3":4,"f7bd45":4,"f5b041":4,"f2f4f4":4,"ecf0f1":4,"ecc71":4,"e8449":4,"e84393":4,"e72":4,"e67e22":4,"e44ad":4,"e3f5fd":4,"dfe6e9":4,"d9a9b":4,"d68910":4,"d5dbdb":4,"d4a1d":4,"d35400":4,"d3436":4,"black":4,"b9ff":4,"b96a1b":4,"b59b6":4,"b5672a":4,"b2bec3":4,"ae60":4,"aa7a8":4},"google/gemini-3.7-flash|1":{"wrinkle":4,"wickerPattern":4,"wheelSymbol":4,"wheel-front-spokes":4,"wheel-back-spokes":4,"webkitAudioContext":4,"webkit-text-fill-color":4,"webkit-background-clip":4,"waveMotion":4,"walkGrad":4,"triggerBell":4,"trees-layer":4,"treeScroll":4,"translation":4,"toes":4,"toast":4,"timeBtn":4,"tailWiggle":4,"tailFlutter":4,"synthesizing":4,"suspended":4,"supported":4,"sunGlowPulse":4,"stripe-color":4,"streetLamp":4,"step-thru":4,"stageWrapper":4,"spindle":4,"spinWheel":4,"spinCW":4,"spinCCW":4,"speed-mult":4,"skyTop":4,"skyMid":4,"skyBottom":4,"sine":4,"show":4,"shadowFilter":4,"setValueAtTime":4,"setTimeout":4,"sequence":4,"seagullModel":4,"seagull-wings":4,"seagull-2":4,"seagull-1":4},"x-ai/grok-4.7|1":{"roll":4,"roadmarks":4,"leg-b":4,"leg-a":4,"headBob":4,"ffe68b":4,"ffe398":4,"f8e37b":4,"f7f5e7":4,"f7b856":4,"f6f3e4":4,"f4a949":4,"f4a674":4,"f49":4,"eff4eb":4,"ef9a67":4,"edf3d8":4,"e8e7d8":4,"e7a5d":4,"e75e58":4,"d9ef":4,"d9eeea":4,"d9ddca":4,"d87b39":4,"d72":4,"d6f6e9":4,"d5b64":4,"d1d7c6":4,"ca4a3":4,"c68a":4,"c34":4,"bfc1":4,"bd9ed":4,"bb0ae":4,"b42":4,"aa274":4,"VB_0_0_1200_720":4,"KF_roll":4,"KF_legb":4,"KF_lega":4,"KF_hills":4,"KF_headbob":4,"KF_beak":4,"HEX_#ffe68b":4,"HEX_#ffe398":4},"deepseek/deepseek-v4.1-flash|1":{"streak":4,"sceneryRow":4,"roadmove":4,"hills2":4,"ffd975":4,"ffc94d":4,"fdfdfb":4,"fd0f5":4,"fca86":4,"fca75":4,"fbc68":4,"f9c46b":4,"f8f4c":4,"f6f2dc":4,"f4fbff":4,"f4a261":4,"f4550":4,"f3e9b5":4,"f3e46":4,"f2a33a":4,"efe9dc":4,"ef767a":4,"eef9ff":4,"e9e4d8":4,"e9a825":4,"e8eaed":4,"e8862e":4,"e6dccb":4,"e5e9f0":4,"d9f1fd":4,"d98e3f":4,"d98324":4,"d6cbb4":4,"d6470":4,"d6403b":4,"d4557":4,"d3c6a9":4,"d1f23":4,"chainmove":4,"cfe3c2":4,"cfc3a8":4,"cbf6e":4,"c9c2b4":4,"c97b2f":4,"c96a1f":4},"nvidia/nemotron-3-ultra|1":{"tuft":4,"streaks":4,"spin-fast":4,"reusable":4,"puffs":4,"fff8cf":4,"ffe98a":4,"ffb45e":4,"fb3d9":4,"f9e4f":4,"f8fb4":4,"f7f9fa":4,"f7d9a0":4,"f7a34":4,"f6c04a":4,"f6a44a":4,"f4f0e6":4,"f3f7f9":4,"f3a45":4,"f2f4f6":4,"f2a93b":4,"f0f5f8":4,"f0c419":4,"f09a3c":4,"e9eef1":4,"e9c42":4,"e8eef2":4,"e8b86":4,"e6f8fd":4,"e2e9ee":4,"e2504a":4,"e0a52f":4,"e0873a":4,"dfe8ee":4,"dfe6ea":4,"d99a3":4,"d98f24":4,"d7a85":4,"d4852":4,"d18d2e":4,"cog":4,"cfd8de":4,"cf63":4,"cdd9e0":4,"cb25c":4},"anthropic/claude-opus-5|1":{"transformable":4,"synced":4,"sunSpin":4,"spokesRear":4,"spokesFront":4,"speedLine":4,"solveLeg":4,"setLegPolyline":4,"seatstay":4,"removeChild":4,"polyEl":4,"pin":4,"parentNode":4,"main-wing":4,"legBackG":4,"legBackFootG":4,"legBackFoot":4,"hillGrad":4,"gid":4,"footFrontG":4,"footBackG":4,"ffe45e":4,"ffcf5c":4,"ffb340":4,"ff8fab":4,"ff6b9a":4,"fd0ff":4,"fcf6a":4,"fbfbfb":4,"f9e44":4,"f5b52a":4,"f5539":4,"f4f9ff":4,"f48c06":4,"f2y":4,"f2x":4,"f1y":4,"f1x":4,"f1dfc0":4,"f08c1a":4,"f07818":4,"ef476f":4,"eef6fd":4,"ed8f8":4,"ed081":4},"openai/gpt-6.1-sol|1":{"webkit-tap-highlight-color":4,"visibilitychange":4,"strict":4,"speed-label":4,"play-label":4,"play-button":4,"pedalY":4,"pedalX":4,"near-leg-outline":4,"masthead":4,"far-leg-outline":4,"currentColor":4,"cancelAnimationFrame":4,"Number":4,"ID_play-label":4,"ID_near-leg-outline":4,"ID_far-leg-outline":4,"CLS_play-button":4,"CLS_masthead":4,"ARCH_VISIBILITY_CHANGE":4,"frameId":3.885,"tabular-nums":3.662,"speed-button":3.662,"scene-label":3.662,"scene-description":3.662,"road-tile":3.662,"repeat":3.662,"playButton":3.662,"play-icon":3.662,"nearOutline":3.662,"get":3.662,"font-variant-numeric":3.662,"farOutline":3.662,"attached":3.662,"Songti":3.662,"Serif":3.662,"STSong":3.662,"SLOW":3.662,"ID_scene-description":3.662,"ID_road-tile":3.662,"CLS_scene-label":3.662,"event":3.48,"updateControls":3.374,"speedIndex":3.374,"setPlaying":3.374},"openai/gpt-6-luna|1":{"Rounded":4,"Pro":4,"svg-desc":3.662,"KF_rider-bob":3.662,"ID_svg-desc":3.662,"topbar":3.374,"lane":3.374,"hill-front":3.374,"hill-back":3.374,"follow":3.374,"countryside":3.374,"cheek":3.374,"L500":3.374,"CLS_topbar":3.374,"CLS_artwork":3.374,"animation-iteration-count":3.123,"wheel-turn":2.969,"typeof":2.969,"scene-wrap":2.969,"ride-bob":2.969,"lede":2.969,"late":2.969,"field":2.969,"fff8df":2.969,"fff7df":2.969,"fff4df":2.969,"fff2c8":2.969,"fbfaf4":2.969,"f8f4e7":2.969,"f5f0dc":2.969,"f43":2.969,"ef9a63":2.969,"edf3dc":2.969,"eaf5f0":2.969,"e9f3df":2.969,"dcefeb":2.969,"d79":2.969,"cloud-drift-b":2.969,"cloud-drift-a":2.969,"cheerful":2.969,"art-card":2.969,"a73":2.969,"Q475":2.969,"Q450":2.969,"M454":2.969},"openai/gpt-6-sol|1":{"warm-colored":4,"turning":4,"tires":4,"synchronized":4,"sunspin":4,"speckle":4,"softly":4,"slow-moving":4,"slight":4,"shaded":4,"road-mark":4,"rims":4,"rests":4,"requested":4,"remains":4,"rack":4,"parcel":4,"horizon":4,"grass-c":4,"grass-b":4,"grass-a":4,"frontLegOutline":4,"frontLeg":4,"fff9df":4,"fff8db":4,"fff5ce":4,"ffe8a2":4,"fc7af":4,"fbf8e9":4,"fbf6e6":4,"fbda7":4,"f9f4df":4,"f9de9d":4,"f9d473":4,"f8e1b7":4,"f8c1a3":4,"f7db96":4,"f7d486":4,"f5ad7f":4,"f4cc7b":4,"f4b58e":4,"f3ead5":4,"f2f4db":4,"f2ae83":4,"f1ae78":4},"google/gemini-4-argon|1":{"windLines":4,"wheelTemplate":4,"wavesLayer":4,"thighLen":4,"tailFeathers":4,"stage-wrapper":4,"speedMultiplier":4,"solveLegIK":4,"shoulderY":4,"shinLen":4,"seagulls":4,"scarfGroup":4,"rightLegGroup":4,"pouchFold2":4,"pouchFold1":4,"postSpacing":4,"pelicanNeck":4,"pelicanBodyGroup":4,"maxReach":4,"leftLegGroup":4,"headNod":4,"frontPedal":4,"frontBasket":4,"fishRot":4,"fishBob":4,"elbowY":4,"drivetrain":4,"crankRadius":4,"cloudsLayer":4,"cloudOffset":4,"clampedCos":4,"chainringGroup":4,"bodyPitch":4,"blinkCycle":4,"bg-top":4,"basketFish":4,"baseAngle":4,"backPedal":4,"accent-color":4,"WING":4,"Tubes":4,"Subtle":4,"Sailor":4,"Rotate":4,"Reusable":4},"anthropic/claude-opus-5.5|1":{"wobbles":4,"whlR":4,"whlF":4,"whl":4,"text-shadow":4,"sunrays":4,"spoked":4,"press":4,"pouchg":4,"phases":4,"middot":4,"mdash":4,"libraries":4,"leg-near":4,"leg-far":4,"kicked":4,"images":4,"huge":4,"gWing":4,"gVig":4,"gSun":4,"gSky":4,"gRoad":4,"gPouch":4,"gBody":4,"gBeak":4,"fonts":4,"flock":4,"fff6da":4,"fff3bd":4,"fff0cd":4,"ffe6c4":4,"ffe6ad":4,"ffdf9e":4,"ffd9a0":4,"ffd93d":4,"ffd7ab":4,"ffc978":4,"ff9638":4,"ff7226":4,"fb0c0":4,"fa1b1":4,"f9b45":4,"f8c5c":4,"f8a55":4},"google/gemini-3.8-flash|1":{"wingbeat":4,"wheel-rotate-front":4,"wheel-rotate-back":4,"trees-set":4,"thigh-r":4,"thigh-l":4,"sun-core":4,"shin-r":4,"shin-l":4,"scroll-trees":4,"scroll-road":4,"scroll-mountains":4,"scroll-clouds-fast":4,"scene-container":4,"scarf-flow":4,"roadFill":4,"right-thigh":4,"right-shin":4,"right-foot":4,"pouch-bounce":4,"pouch-anim":4,"pine-tree":4,"opposite":4,"mountains-set":4,"metalRim":4,"left-thigh":4,"left-shin":4,"left-foot":4,"jaw-anim":4,"hubs":4,"foot-r":4,"foot-l":4,"fffefa":4,"fffbbf":4,"fff2a9":4,"fff0b8":4,"ffe259":4,"ffd394":4,"ffa726":4,"ff9d1c":4,"fec44f":4,"fce9ba":4,"fca830":4,"faf6e9":4,"f9e8c6":4},"anthropic/claude-haiku-5.5|1":{"ff9a2e":4,"d1d1d":4,"crankB":4,"crankA":4,"ID_crankb":4,"ID_cranka":4,"HEX_#ff9a2e":4,"HEX_#1d1d1d":4,"together":3.738,"spin-rear":3.738,"spin-front":3.738,"rolled":3.738,"roadClip":3.738,"road-line":3.738,"rSpin":3.738,"pedB":3.738,"pedA":3.738,"outward":3.738,"maxd":3.738,"markings":3.738,"hillX":3.738,"hillP":3.738,"head-bob":3.738,"groundline":3.738,"fy2":3.738,"fy1":3.738,"fx2":3.738,"fx1":3.738,"footBc":3.738,"footB":3.738,"footAc":3.738,"footA":3.738,"fff8f0":3.738,"fff7c4":3.738,"fff4bf":3.738,"ffe7c2":3.738,"ffe16b":3.738,"ffd9a8":3.738,"ffd24f":3.738,"ffc98f":3.738,"ffc94f":3.738,"ffbb52":3.738,"ffb3b3":3.738,"ffb020":3.738,"ff8f70":3.738},"xiaomi/mimo-v2.6-flash|1":{"wingRide":4,"windFlick":4,"thighFront":4,"thighBack":4,"thigh-front":4,"thigh-back":4,"sunny":4,"softGlow":4,"road-stripes":4,"riderBob":4,"pouchPaint":4,"meadow":4,"grassSway":4,"flowering":4,"fff8e8":4,"fff2b5":4,"ffe99d":4,"ffe59a":4,"ffe0a6":4,"ffd475":4,"ffd39e":4,"ffd184":4,"ffc36b":4,"ffc17b":4,"ffc17a":4,"faf7e9":4,"f9f83":4,"f9a064":4,"f8e4b5":4,"f8dfbb":4,"f8d39b":4,"f6d795":4,"f6d78a":4,"f6d18c":4,"f6ad68":4,"f5dba1":4,"f5d698":4,"f5b85c":4,"f3d390":4,"f3a261":4,"f3944e":4,"f2d69b":4,"f1eee0":4,"f1d17f":4,"f0b368":4},"openai/gpt-5.6-sol|1":{"tinyShadow":4,"framePaint":4,"fffbd0":4,"fff0c8":4,"ffe47c":4,"ffe477":4,"ffd16a":4,"ffcb58":4,"ffb84a":4,"f9e86":4,"f8fbf5":4,"f8f7ed":4,"f8c":4,"f8b72":4,"f6e8a8":4,"f5f4ea":4,"f4d26b":4,"f3d":4,"f2773f":4,"f0a65e":4,"extended":4,"ef7c46":4,"eef9f7":4,"eb59f":4,"e9eeea":4,"e8f0ed":4,"e8eef0":4,"e09a55":4,"dff6ef":4,"dff1eb":4,"df593a":4,"de3f2":4,"d9f1bd":4,"d9e5e2":4,"d5ee":4,"d4e0dd":4,"d3e6db":4,"c7bb":4,"c6e2df":4,"c5d8d5":4,"c4c":4,"bdcfcc":4,"bc5c7":4,"b35d":4,"accents":4},"upstage/solar-pro4|1":{"zh-Hans":4,"winding":4,"water-glint":4,"viewport-fit":4,"sunlight":4,"sun-blur":4,"softly":4,"ripple":4,"headlands":4,"fff9d8":4,"fff8eb":4,"fff6ce":4,"fff3d0":4,"fff1b9":4,"fff0c5":4,"fff0b5":4,"ffe5a0":4,"fbf4dc":4,"f91":4,"f8c574":4,"f7a077":4,"f6a777":4,"f4e8c6":4,"f4dfa9":4,"f4b447":4,"f4a94f":4,"f0a34d":4,"efad55":4,"efaa56":4,"ef815d":4,"ed9861":4,"e99a4a":4,"e8c783":4,"e78e43":4,"e75":4,"dvh":4,"dbd83":4,"d9f0dc":4,"d82":4,"d7e2d9":4,"d6e1d7":4,"d5dfd7":4,"d2b477":4,"curious":4,"coastline":4},"minimax/minimax-m3|1":{"that":4,"simulate":4,"rolls":4,"right-to-left":4,"pixels":4,"leftward":4,"gradient":4,"fff6c2":4,"fff2a8":4,"ffd24d":4,"fb583":4,"fafafa":4,"f8a4f":4,"f8a3f":4,"f0a020":4,"ec9a3":4,"eaf6ff":4,"e0e0e0":4,"diagonal":4,"cfe9ff":4,"c0392b":4,"bfe3ff":4,"b4f2a":4,"a7d3a":4,"a6a3b":4,"a3a1f":4,"VB_0_0_800_400":4,"Scenery":4,"ID_scenery":4,"HEX_#fff6c2":4,"HEX_#fff2a8":4,"HEX_#ffd24d":4,"HEX_#fafafa":4,"HEX_#f0a020":4,"HEX_#eaf6ff":4,"HEX_#e0e0e0":4,"HEX_#cfe9ff":4,"HEX_#c0392b":4,"HEX_#bfe3ff":4,"HEX_#9ec9a3":4,"HEX_#8a6a3b":4,"HEX_#7fb583":4,"HEX_#6b4f2a":4,"HEX_#5a3a1f":4,"HEX_#4f8a4f":4},"openai/gpt-6-astra|1":{"wheel-rim":4,"webbed-foot":4,"water-lines":4,"water-clip":4,"viewport-fit":4,"verge-bank":4,"undefined":4,"three":4,"shore-bank":4,"shore":4,"sea-light":4,"scarf-tails":4,"saturate":4,"road-grain":4,"road-clip":4,"resize":4,"reach":4,"ratio":4,"passive":4,"paper-noise":4,"overscroll-behavior":4,"nearHighlight":4,"near-leg-line":4,"near-leg-highlight":4,"islands":4,"island-bank":4,"innerWidth":4,"innerHeight":4,"foregroundLeg":4,"fitScene":4,"fff9e6":4,"fff2d2":4,"fff1d1":4,"ffe5aa":4,"feTurbulence":4,"fb69f":4,"far-leg-line":4,"faf6e5":4,"faf1d6":4,"f9e4a7":4,"f8eedb":4,"f80":4,"f7d58c":4,"f7d492":4,"f7975":4},"moonshotai/kimi-k3|1":{"css":4,"wrote":3.738,"write":3.738,"workspace":3.738,"won":3.738,"within":3.738,"will":3.738,"widely-cited":3.738,"which":3.738,"wheelie-fuzz":3.738,"wheelSpin":3.738,"was":3.738,"wants":3.738,"wait":3.738,"visually":3.738,"visual":3.738,"vig":3.738,"variety":3.738,"uses":3.738,"user":3.738,"used":3.738,"untransformed":3.738,"underlying":3.738,"txt":3.738,"trick":3.738,"triangles":3.738,"translates":3.738,"translated":3.738,"trailing":3.738,"track":3.738,"too":3.738,"those":3.738,"this":3.738,"think":3.738,"thick":3.738,"then":3.738,"them":3.738,"their":3.738,"tests":3.738,"testing":3.738,"talk":3.738,"systems":3.738,"system":3.738,"syntax":3.738,"supports":3.738},"z-ai/glm-5.3|1":{"thighEl":4,"sunRays":4,"spokesR":4,"spokesF":4,"solve":4,"sol":4,"skyG":4,"shinEl":4,"ringHoles":4,"ringEl":4,"plumeG":4,"pedalNear":4,"pedalFar":4,"pedalEl":4,"legEl":4,"grass2":4,"grass1":4,"gradientUnits":4,"footEl":4,"fffbd8":4,"fff2ab":4,"ffeaa9":4,"ffe166":4,"ffd873":4,"ffcb74":4,"ffcb70":4,"ffc95a":4,"ff5f63":4,"fbf6ec":4,"fae62":4,"f9a63c":4,"f8c99":4,"f7a93f":4,"f6fb0":4,"f6efe1":4,"f6c02c":4,"f5f9fd":4,"f4ecc8":4,"f2a444":4,"f2a33c":4,"f0921f":4,"emerge":4,"efe4cf":4,"ef8b22":4,"ecf7ff":4},"anthropic/claude-sonnet-5.5|1":{"HEX_#999":4,"setLeg":3.689,"fff7b0":3.689,"e3f6ff":3.689,"ddd":3.689,"cfd6dc":3.689,"ccc":3.689,"c9701a":3.689,"buildWheel":3.689,"attrs":3.689,"a86ff":3.689,"a5560":3.689,"HEX_#fff7b0":3.689,"HEX_#f5a623":3.689,"HEX_#e3f6ff":3.689,"HEX_#cfd6dc":3.689,"HEX_#ccc":3.689,"HEX_#c9701a":3.689,"HEX_#4a5560":3.689,"HEX_#3a86ff":3.689,"HEX_#bfe6ff":3.507,"bfe6ff":3.283,"bbb":3.283,"KF_scroll":3.283,"wlNear":2.996,"wlFar":2.996,"wheelg":2.996,"view":2.996,"upperD":2.996,"upper-outline":2.996,"treeG":2.996,"title-block":2.996,"symbol":2.996,"stretched":2.996,"spinr":2.996,"spinback":2.996,"speedPx":2.996,"speedG":2.996,"sparkles":2.996,"shinD":2.996,"shin-outline":2.996,"shade":2.996,"setLimb":2.996,"setButton":2.996,"rearSpin":2.996},"z-ai/glm-5.2|1":{"ttl":4,"ffe9a8":4,"ffd76b":4,"fdf2dd":4,"f97ab":4,"f8f4ea":4,"f8c76a":4,"f4d877":4,"f4654":4,"f0a13c":4,"efe8d8":4,"e9e2d2":4,"e7dec9":4,"e79a3c":4,"e2ae52":4,"e2604f":4,"e2493b":4,"ddeff8":4,"dc9ac":4,"d9a343":4,"d8794":4,"d4862a":4,"cdc4b2":4,"c9e3d6":4,"c9d0da":4,"c8bfab":4,"c74e3f":4,"c1420":4,"bfc7d2":4,"bd8a52":4,"b9c2cf":4,"b93a1":4,"b6270":4,"b5462":4,"b2f38":4,"b2430":4,"b1d5c1":4,"aa3b0":4,"a9b3bf":4,"a8d2b6":4,"a8693":4,"a6d9f1":4,"a5160":4,"ID_ttl":4,"ID_glow":4},"anthropic/claude-fable-5.1|1":{"pedalU":4,"pedalD":4,"legU":4,"legD":4,"ffd54a":4,"ff9a3c":4,"fb7e8":4,"f8fd1":4,"f7f7f7":4,"f0a030":4,"eee":4,"e8c98a":4,"e4e4e4":4,"e0e0e0":4,"d98a20":4,"d6336c":4,"c9e8f8":4,"c9a86a":4,"KF_pedalu":4,"KF_pedald":4,"HEX_#ffd54a":4,"HEX_#ff9a3c":4,"HEX_#f7f7f7":4,"HEX_#f0a030":4,"HEX_#eee":4,"HEX_#e8c98a":4,"HEX_#e4e4e4":4,"HEX_#e0e0e0":4,"HEX_#d98a20":4,"HEX_#d6336c":4,"HEX_#c9e8f8":4,"HEX_#c9a86a":4,"HEX_#6fb7e8":4,"HEX_#2f8fd1":4,"CLS_legu":4,"CLS_legd":4,"ceeb":3.55,"KF_pouch":3.55,"polyline":3.213,"HEX_#888":3.213,"HEX_#87ceeb":3.213,"CLS_cloud2":3.213,"bbb":2.962,"KF_scroll":2.962,"HEX_#bbb":2.761},"qwen/qwen3.7-max|1":{"fff3c0":4,"ffd868":4,"ffd45e":4,"ffc93c":4,"ffc45e":4,"ffb03a":4,"fdfaf3":4,"fd8ea":4,"fbb7e":4,"fb0c9":4,"fa94f":4,"f8f43":4,"f7d774":4,"f7881d":4,"f6f1e5":4,"e9f6fb":4,"e8e0d0":4,"e0761a":4,"e0503f":4,"dcd2be":4,"dc48a":4,"d9aa8":4,"d9871a":4,"d8798":4,"d6675":4,"d5566":4,"d4553":4,"cfd7e0":4,"cc4ea":4,"c9d1dc":4,"c9ceD8":4,"c9bfa9":4,"c9432f":4,"c6f7c":4,"bfe4f7":4,"bfae8f":4,"b45a":4,"b3440":4,"b1120":4,"ad47a":4,"aab4c2":4,"aa4b2":4,"a94a3":4,"a4453":4,"a4148":4},"xiaomi/mimo-v2.6-pro|1":{"wheel-front":4,"wheel-back":4,"sun-pulse":4,"scroll-ground":4,"pelican-rider":4,"pedal-group":4,"middle":4,"leg-right":4,"leg-r":4,"leg-left":4,"leg-l":4,"ground-dashes":4,"cloud-move":4,"KF_sun-pulse":4,"KF_scroll-ground":4,"KF_pedal":4,"KF_leg-right":4,"KF_leg-left":4,"KF_cloud-move":4,"KF_bounce":4,"HEX_#ffe66d":4,"HEX_#ffd93d":4,"HEX_#ff6b9d":4,"HEX_#fcbf49":4,"HEX_#f77f00":4,"HEX_#f4a261":4,"HEX_#e09f3e":4,"HEX_#dee2e6":4,"HEX_#d46a00":4,"HEX_#b0e0e6":4,"HEX_#98d98e":4,"HEX_#7bc47f":4,"HEX_#7ba07b":4,"HEX_#6bb86f":4,"HEX_#5ba85f":4,"HEX_#4361ee":4,"HEX_#264653":4,"HEX_#1b3a9e":4,"FFF3B0":4,"FFE66D":4,"FFD93D":4,"FF6B9D":4,"FCBF49":4,"F8F9FA":4,"F77F00":4},"openai/gpt-5.5|1":{"wheel-spin--front":4,"wheel-spin--back":4,"walk-clip":4,"sun-halo":4,"sign-off":4,"pouch-sway":4,"pedal-leg":4,"motion-line":4,"leg-swing--two":4,"leg-swing":4,"figcaption":4,"fff2d5":4,"fff0bd":4,"ffe39c":4,"ffd276":4,"ffb07b":4,"fbf7eb":4,"f8f5eb":4,"f8d9a8":4,"f7f2e5":4,"f7f0df":4,"f6f0df":4,"f69":4,"f5f1e5":4,"f5f0df":4,"f5bd4b":4,"f53":4,"f42":4,"f2a15a":4,"f1d7a0":4,"f0a45c":4,"ef9c56":4,"ef7955":4,"eee9da":4,"ee9a55":4,"ecfc7":4,"ec8a4c":4,"eaf3ef":4,"e8bd88":4,"e79":4,"dfece8":4,"dce8df":4,"dc7545":4,"d8f1df":4,"d8e4d9":4},"openai/gpt-5.6-luna|1":{"wob":4,"wing-back":4,"tree-move":4,"spinSlow":4,"speedFlash":4,"speed-line":4,"rock":4,"onclick":4,"nearShoe":4,"nearPath":4,"nearLegPath":4,"moveLeft":4,"mountains":4,"hipNear":4,"hipFar":4,"grassG":4,"grass-dot":4,"ghost":4,"fingers":4,"fda4af":4,"farShoe":4,"farPath":4,"farLegPath":4,"efac":4,"driven":4,"dashMove":4,"crank2":4,"crank1":4,"cloudDrift":4,"c4a6e":4,"bushes":4,"btnPause":4,"btnFast":4,"blades":4,"birdFly":4,"birdFlap":4,"bird-w":4,"badgePulse":4,"animations":4,"animationPlayState":4,"a1-a2":4,"M430":4,"LIVE":4,"L2-4":4,"KF_spinslow":4},"anthropic/claude-opus-5.5|0":{"f7f7f2":4,"f4a259":4,"f2a44":4,"b8e9c":4,"V13":4,"L25":4,"HEX_#f7f7f2":4,"HEX_#f4a259":4,"HEX_#5b8e9c":4,"HEX_#3fa7d6":4,"HEX_#1f2a44":4,"H32M1":4,"H30":4,"H18":4,"FA7D6":4,"F5B82E":4,"F3A5F":4,"F28C28":4,"HEX_#1f3a5f":3.724,"fdf1dc":3.473,"PATH_COMMA_SEP":3.473,"HEX_#fdf1dc":3.473,"HEX_#f5b82e":3.473,"HEX_#f28c28":3.272,"Q17":3.105,"Q18":2.962,"Q21":2.837,"C13":2.837,"C18":2.725,"C11":2.725,"L11":2.625,"L20":2.534,"Q20":2.374,"L28":2.374,"L19":2.374,"V32":2.173,"Q12":2.115,"ROOT_SVG_STROKE":1.748,"FFFFFF":1.738,"M29":1.527,"ellipse":1.488,"T24":1.352,"T16":1.3,"M19":1.294,"T32":1.181},"openai/gpt-5.6-terra|0":{"h-4":4,"fff7e6":4,"fb5bd":4,"f8e6b8":4,"f3b54b":4,"ed9c49":4,"c6cc":4,"a58":4,"HEX_#f8e6b8":4,"HEX_#f3b54b":4,"HEX_#ed9c49":4,"HEX_#83c6cc":4,"HEX_#82c5ce":4,"HEX_#6fb5bd":4,"HEX_#4c9dac":4,"HEX_#174a58":4,"HEX_#164d5b":4,"D5B":4,"C9DAC":4,"C5CE":4,"f49b75":3.951,"b73":3.951,"a91":3.951,"HEX_#f49b75":3.951,"HEX_#e7a83a":3.951,"HEX_#ddf3f2":3.951,"HEX_#d9f2e7":3.951,"HEX_#bce7ec":3.951,"HEX_#91d5df":3.951,"HEX_#28708b":3.951,"HEX_#258a91":3.951,"HEX_#176b73":3.951,"HEX_#173b5d":3.951,"E7A83A":3.951,"DDF3F2":3.951,"D9F2E7":3.951,"D5DF":3.951,"BCE7EC":3.951,"B5D":3.951,"HEX_#fff7e6":3.584,"v1M25":3.035,"v1M20":2.853,"h1M22":2.853,"fff8e8":2.853,"f766e":2.853},"anthropic/claude-opus-5|0":{"with":4,"wing":4,"wave":4,"waterline":4,"washing":4,"warm":4,"upper":4,"tuft":4,"tip":4,"texture":4,"tail":4,"shadow":4,"shading":4,"sea":4,"ripples":4,"ripple":4,"ridge":4,"reflection":4,"profile":4,"overlapping":4,"over":4,"outline":4,"mandible":4,"lower":4,"lines":4,"hull":4,"hooked":4,"highlight":4,"head":4,"h9M22":4,"h7M12":4,"front":4,"feather":4,"fba834":4,"fa8cc":4,"fa8c7":4,"f7f4ec":4,"f3e2c0":4,"f3b4a":4,"elastic":4,"e8913a":4,"e2dccb":4,"e1e8ed":4,"details":4,"depth":4},"anthropic/claude-sonnet-5.5|0":{"V14":4,"HEX_#f7c443":4,"HEX_#f5b400":4,"HEX_#f2962e":4,"HEX_#f08c00":4,"HEX_#ededed":4,"HEX_#dce9f0":4,"HEX_#d6d6d6":4,"HEX_#cfeafb":4,"HEX_#6cc5e8":4,"HEX_#222":4,"HEX_#1f3b4d":4,"H14":4,"F7C443":4,"F5B400":4,"F3B4D":4,"F2962E":4,"F08C00":4,"EDEDED":4,"DCE9F0":4,"D6D6D6":4,"CFEAFB":4,"CC5E8":4,"C29":4,"A8FD9":4,"d9792b":3.901,"HEX_#d9792b":3.901,"q2-5":3.495,"q2-":3.495,"h7M6":3.495,"h6M13":3.495,"f4a21c":3.495,"f2a21b":3.495,"HEX_#ffb84d":3.495,"HEX_#f4a21c":3.495,"HEX_#f2a21b":3.495,"HEX_#e8f4fa":3.495,"HEX_#87ceeb":3.495,"HEX_#3b3a4a":3.495,"H32V32H0Z":3.495,"CEEB":3.495,"B3A4A":3.495,"HEX_#3a8fd9":3.401,"HEX_#333":3.199,"C22":3.199},"google/gemini-3.8-flash|0":{"s-3":4,"l8-1":4,"f39c12":4,"ecf0f1":4,"e293b":4,"c3e50":4,"HEX_#f39c12":4,"HEX_#ecf0f1":4,"HEX_#2c3e50":4,"HEX_#2980b9":4,"zM13":3.901,"l11":3.901,"fba742":3.901,"HEX_#fba742":3.901,"f1c40f":3.758,"d35400":3.758,"HEX_#f1c40f":3.758,"HEX_#d35400":3.758,"f8fafc":3.427,"bdc3c7":3.353,"V12M2":3.353,"HEX_#bdc3c7":3.353,"H10c-3":3.353,"e3a5f":3.057,"HEX_#1e293b":2.724,"v3a5":2.66,"v1l3-1s-1":2.66,"v-3a3":2.66,"s6-2":2.66,"s10-1":2.66,"s-1-5":2.66,"l6-1c":2.66,"l4-1c2":2.66,"l4-1":2.66,"l2-6c":2.66,"l2-5c":2.66,"l1-3c-1-1-1-3":2.66,"h9c2":2.66,"h8c0":2.66,"h3c3":2.66,"h10a4":2.66,"h-6c0":2.66,"ffeaa7":2.66,"fbbf24":2.66,"f8f9fa":2.66},"openai/gpt-6-astra|0":{"m5-":4,"fff5df":4,"f3b85b":4,"c2ca":4,"b52":4,"HEX_#fff5df":4,"HEX_#f3b85b":4,"HEX_#78c2ca":4,"HEX_#244b52":4,"q-3":3.802,"m19":3.658,"q2-1":2.811,"M29":2.223,"M28":1.856,"M25":1.587,"l-1":1.363,"M20":1.31,"WH_BEFORE_VB":1.298,"M21":1.273},"openai/gpt-6-luna|0":{"m-9":4,"m-1":3.795,"m17":3.726,"m13":3.726,"m10":3.508,"m-4":3.418,"m11":3.414,"DCEFEA":3.414,"m-6":3.362,"HEX_#fff7e8":3.212,"HEX_#174a50":3.212,"m0-7":3.102,"m-5":3.083,"m6-1":2.958,"hanging":2.958,"h5m7":2.958,"fff7e8":2.958,"ffd36f":2.958,"f4b34f":2.958,"f48":2.958,"e9eaa":2.958,"e98061":2.958,"dce9e3":2.958,"c96550":2.958,"c5edf0":2.958,"c5cb":2.958,"bill":2.958,"b4e8e4":2.958,"aa6a4":2.958,"a9bfba":2.958,"Tail":2.958,"HEX_#fff2d8":2.958,"HEX_#ffd36f":2.958,"HEX_#f7f1e2":2.958,"HEX_#f4b34f":2.958,"HEX_#f2c568":2.958,"HEX_#e9c780":2.958,"HEX_#e9b45d":2.958,"HEX_#e98061":2.958,"HEX_#e79d6d":2.958,"HEX_#e5d6b6":2.958,"HEX_#dce9e3":2.958,"HEX_#c96550":2.958,"HEX_#c5edf0":2.958,"HEX_#b4e8e4":2.958},"deepseek/deepseek-v4.1-flash|0":{"xlink":4,"xMidYMid":4,"wrap":4,"streaks":4,"stop-opacity":4,"stage":4,"speed":4,"slow":4,"seamless":4,"scroll":4,"road_tile":4,"road":4,"rig":4,"repeated":4,"radialGradient":4,"preserveAspectRatio":4,"parallax":4,"near":4,"meet":4,"leg":4,"layers":4,"keyR":4,"keyL":4,"join":4,"hills_tile":4,"hills":4,"h5M10":4,"h4M5":4,"h4M19":4,"h4M15":4,"h28v7":4,"h10v2":4,"h-10z":4,"grass_tile":4,"grass":4,"frame_and_wheels":4,"fff2b8":4,"ffe27a":4,"fd8f6":4,"far":4,"f2937":4,"f0f9ff":4,"every":4,"ec86f":4,"e7a8c":4},"meta/muse-spark-1.3|0":{"v2M30":4,"q2-2":4,"l-3-2":4,"h32":4,"h-2M30":4,"fde047":4,"fdba74":4,"f172a":4,"e2e8f0":4,"dd3fc":4,"M31":4,"HEX_#ffd54f":4,"HEX_#ffcc80":4,"HEX_#ff9e57":4,"HEX_#e0f7fa":4,"HEX_#4fc3f7":4,"H29M28":4,"FFD54F":4,"FFCC80":4,"FF9E57":4,"FC3F7":4,"E0F7FA":4,"e0f2fe":3.717,"fb923c":3.466,"bdf8":3.466,"HEX_#fde047":3.466,"HEX_#e2e8f0":3.466,"HEX_#7dd3fc":3.466,"HEX_#fdba74":3.265,"q4-2":3.221,"HEX_#334155":3.137,"HEX_#e0f2fe":3.098,"HEX_#fb923c":2.955,"HEX_#38bdf8":2.955,"HEX_#0f172a":2.955,"fff":2.83,"HEX_#fff":2.719,"l-8":2.444,"M30":2.444,"q2-1":2.166,"ffffff":1.902,"HEX_#ffffff":1.845,"FFFFFF":1.771,"M22":1.683,"M25":1.629},"anthropic/claude-fable-5.1|0":{"m3-2q3":4,"fffef5":4,"ffc761":4,"fd3ec":4,"f8dc90":4,"f6b23f":4,"eaa345":4,"e9e96":4,"e8f2ed":4,"e7dfcc":4,"e54":4,"e1e5d9":4,"db6dd":4,"c3b59":4,"bfe6f5":4,"aecdb8":4,"a43":4,"V18Q10":4,"V12Q20":4,"HEX_#fffef5":4,"HEX_#ffc761":4,"HEX_#f8dc90":4,"HEX_#f6b23f":4,"HEX_#eaa345":4,"HEX_#e8f2ed":4,"HEX_#e7dfcc":4,"HEX_#e1e5d9":4,"HEX_#bfe6f5":4,"HEX_#aecdb8":4,"HEX_#8fd3ec":4,"HEX_#7e9e96":4,"HEX_#5db6dd":4,"HEX_#475e54":4,"HEX_#314a43":4,"HEX_#1c3b59":4,"H18Z":4,"H18Q23":4,"l1-1M27":3.959,"f6b73c":3.959,"f4f1ea":3.959,"cfe8f7":3.959,"b4a6b":3.959,"HEX_#f4f1ea":3.959,"HEX_#cfe8f7":3.959,"HEX_#2b4a6b":3.959},"anthropic/claude-haiku-5.5|0":{"ffc83d":4,"ffb703":4,"fd3f0":4,"f7c27a":4,"f29b2e":4,"e8f6ff":4,"e8f4fb":4,"d9dee5":4,"aa6d8":4,"V12":4,"HEX_#ffc83d":4,"HEX_#f7c27a":4,"HEX_#f29b2e":4,"HEX_#d9dee5":4,"HEX_#8fd3f0":4,"HEX_#3aa6d8":4,"HEX_#222222":4,"q3-4":3.991,"fb8500":3.991,"fb7d9":3.991,"fb3e8":3.991,"f7b733":3.991,"f7b500":3.991,"f7b267":3.991,"f5b700":3.991,"f4b41a":3.991,"f2d3d":3.991,"f2a541":3.991,"f08a24":3.991,"d9e2ea":3.991,"d3b5a":3.991,"cfeefc":3.991,"cfdbe6":3.991,"c9d3dc":3.991,"b7bb9":3.991,"aa5b1":3.991,"V1M19":3.991,"V15":3.991,"T11":3.991,"HEX_#fb8500":3.991,"HEX_#f7b733":3.991,"HEX_#f7b500":3.991,"HEX_#f5b700":3.991,"HEX_#f4b41a":3.991,"HEX_#f08a24":3.991},"anthropic/claude-sonnet-5|0":{"fff5e6":4,"f0c040":4,"b94a48":4,"b2a38":4,"HEX_#fff8f0":4,"HEX_#fff5e6":4,"HEX_#f6c945":4,"HEX_#f4e4cc":4,"HEX_#f0c040":4,"HEX_#e39b2b":4,"HEX_#e36b4c":4,"HEX_#b94a48":4,"HEX_#b7dff0":4,"HEX_#7eb6d9":4,"HEX_#243044":4,"HEX_#1f7aae":4,"HEX_#1b2a38":4,"FFF8F0":4,"F7AAE":4,"F6C945":4,"F4E4CC":4,"EB6D9":4,"E39B2B":4,"E36B4C":4,"B7DFF0":4,"f5a623":3.56,"d9e4ec":3.56,"HEX_#f5a623":3.56,"HEX_#d9e4ec":3.56,"L22":3.446,"e8f6ff":3.049,"a8fd9":3.049,"b47ac219e0358d2":2.856,"Q22":2.787,"Q11":2.712,"L13":2.712,"T14":2.461,"Q26":2.461,"HEX_#3a8fd9":2.461,"Q10":2.26,"L12":2.26,"HEX_#e8f6ff":2.26,"T20":2.093,"Q16":1.95,"L18":1.95},"openai/gpt-6-sol|0":{"wrong":4,"wonky":4,"window":4,"v32":4,"userSpaceOnUse":4,"uneven":4,"too":4,"text-anchor":4,"text":4,"tag":4,"t31":4,"t214-9":4,"t151-31M674":4,"suspiciously":4,"stroke-dasharray":4,"stripes":4,"something":4,"signature":4,"serif":4,"sans-serif":4,"rosettes":4,"q79-88":4,"q79":4,"q66-91":4,"q61":4,"q48-12":4,"q40-36":4,"q38-17":4,"q37":4,"q36":4,"q31":4,"q27-25":4,"q26":4,"q25-45":4,"q189":4,"q14-18":4,"q13-17":4,"q123-13":4,"q12":4,"q107-22":4,"q100":4,"q-49":4,"q-26-26-2-46t44":4,"proudly":4,"price":4},"z-ai/glm-5.3|0":{"v9c0":4,"v1m0":4,"v1M18":4,"s3-1":4,"m20":4,"m0-8":4,"h7c-1":4,"h-1m14":4,"h-1M19":4,"fff4dc":4,"efb45b":4,"c59":4,"V9a3":4,"HEX_#fff4dc":4,"HEX_#efb45b":4,"HEX_#294c59":4,"c2-1":1.653,"M24":1.359,"M21":1.282},"openai/gpt-6.1-sol|0":{"v7H0Z":4,"v1M7":4,"v1M2":4,"m21":4,"h5m4-1h5m5":4,"h1M3":4,"h1M11":4,"h10q-4":4,"fffdf4":4,"fff6e5":4,"f52":4,"f3bc58":4,"e9e5d6":4,"c-2-4":4,"a9d8d1":4,"V10c0-3":4,"HEX_#fffdf4":4,"HEX_#fff6e5":4,"HEX_#f3bc58":4,"HEX_#e9e5d6":4,"HEX_#a9d8d1":4,"HEX_#294f52":4,"H20Z":4,"m12":3.658,"c4-2":3.533,"q4-2":2.999,"q2-1":2.811,"M20":1.31,"WH_BEFORE_VB":1.298},"openai/gpt-5.6-luna|0":{"v2M19":3.894,"m5-3v3":3.894,"ZM13":3.894,"H3M11":3.894,"s7-2":3.488,"h2M27":3.488,"h2M20":3.488,"v9H0Z":3.201,"v7H2z":3.201,"v3H1Z":3.201,"v2M7":3.201,"v2M25":3.201,"v2M15":3.201,"s10":3.201,"s1-3":3.201,"m-9-4":3.201,"h3M16":3.201,"h2M21":3.201,"h2M18":3.201,"h2M10":3.201,"h28":3.201,"h27M4":3.201,"h24M7":3.201,"h22M8":3.201,"h-4l-2":3.201,"h-3l-2":3.201,"h-2M27":3.201,"fc8c9":3.201,"fa9a6":3.201,"f8990":3.201,"f7d9a8":3.201,"f7d99b":3.201,"f6d89a":3.201,"f5f":3.201,"f3c969":3.201,"f2b84b":3.201,"f29f58":3.201,"ef9b62":3.201,"ef9b5b":3.201,"e58b58":3.201,"dff3f5":3.201,"d9f0ee":3.201,"d9b91":3.201,"d8a24a":3.201,"c5-2":3.201},"openai/gpt-5.6-sol|0":{"v-1M20":3.481,"v-1M1":3.481,"m22":3.481,"h-1m12":3.481,"h-1M2":3.481,"HEX_#28536b":3.481,"F6B73C":3.481,"v7c-3":2.788,"v6c-2-1-4-3-4-6Z":2.788,"v5H9z":2.788,"v4c-3":2.788,"v4H2z":2.788,"v3m7-3v3":2.788,"v3m5-3v3M2":2.788,"v3m4-3":2.788,"v3c-2":2.788,"v2m6":2.788,"v2m3-2v2":2.788,"v2m0":2.788,"v2m-6-6h2m8":2.788,"v1m-4-4h1m6":2.788,"v1M26":2.788,"v-4c0-3":2.788,"v-1M6":2.788,"t2-5q2-2":2.788,"t-8":2.788,"q4-5":2.788,"q-5":2.788,"m7-2-1":2.788,"m0-5":2.788,"m-5-4":2.788,"l6-1-5":2.788,"l2-2q-3":2.788,"l-9-2Z":2.788,"l-6-2":2.788,"l-2-2M17":2.788,"l-1-3z":2.788,"l-0":2.788,"h8c-2":2.788,"h6M8":2.788,"h6M18":2.788,"h3z":2.788,"h2M4":2.788,"h-3c0":2.788,"h-1m-8":2.788},"openai/gpt-5.5|0":{"m3-":4,"fff7df":4,"fff3cf":4,"fff1d8":4,"fff0d1":4,"ffd45a":4,"f73":4,"f6f1df":4,"f6c75b":4,"f3ad58":4,"f2c65e":4,"f2a44a":4,"eaf7ff":4,"eaf6f5":4,"e9826c":4,"e88c60":4,"e5a":4,"c9e8":4,"c8bf":4,"c58":4,"c0-":4,"bdbd":4,"HEX_#fff7df":4,"HEX_#fff3cf":4,"HEX_#fff1d8":4,"HEX_#fff0d1":4,"HEX_#ffd45a":4,"HEX_#f7e4b2":4,"HEX_#f6f1df":4,"HEX_#f6c75b":4,"HEX_#f3ad58":4,"HEX_#f2c65e":4,"HEX_#f2a44a":4,"HEX_#eaf7ff":4,"HEX_#eaf6f5":4,"HEX_#eaf1e7":4,"HEX_#e9826c":4,"HEX_#e88c60":4,"HEX_#78bdbd":4,"HEX_#77c9e8":4,"HEX_#77c8bf":4,"HEX_#28566a":4,"HEX_#263238":4,"HEX_#195f73":4,"HEX_#174e5a":4},"openai/gpt-5.4|0":{"f7e3b2":4,"f4e3c1":4,"ed1e8":4,"e8c98d":4,"b4e2e":4,"HEX_#f7e3b2":4,"HEX_#f4e3c1":4,"HEX_#e8c98d":4,"HEX_#8ed1e8":4,"HEX_#6b4e2e":4,"HEX_#245b78":4,"HEX_#16697a":4,"H22M28":4,"f766e":3.871,"HEX_#0f766e":3.871,"H11":3.871,"v-1m5-5h1M19":3.36,"m18":3.36,"h1m8":3.36,"f4c95d":3.36,"b78":3.36,"V1m0":3.36,"H2z":3.36,"h-2":2.773,"class":2.572,"HEX_#f4c95d":2.572,"c0-4":2.527,"style":2.405,"f2a65a":2.262,"l-5":2.229,"HEX_#f2a65a":2.137,"defs":2.025,"c2-":1.925,"m-8":1.834,"M25":1.629,"M27":1.626,"M28":1.603,"c0-3":1.414,"c-1":1.134,"M21":1,"M22":0.953},"google/gemini-3.1-pro-preview|0":{"fdf6e3":4,"c97b3a":4,"L13":4,"HEX_#fdf6e3":4,"HEX_#c97b3a":4,"L18":3.658,"L15":3.533,"L14":3.533,"Q15":3.422,"L20":3.231,"Q20":3.071,"L19":3.071,"line":2.932,"Q19":2.87,"M16":1.732,"M13":1.732},"anthropic/claude-sonnet-4.6|0":{"s8-1":4,"s7-":4,"l1-":4,"fd8e8":4,"d8fae":4,"b6e8a":4,"a6ea5":4,"T29":4,"T21":4,"T17":4,"HEX_#9fd8e8":4,"HEX_#3d8fae":4,"HEX_#3a6ea5":4,"HEX_#2b6e8a":4,"s7-1":3.724,"b2b2b":3.473,"Q26":3.473,"class":3.272,"HEX_#2b2b2b":3.272,"style":3.105,"T28":3.105,"T25":3.105,"T20":3.105,"T12":3.105,"Q25":2.962,"T13":2.837,"fff":2.725,"defs":2.725,"f4b942":2.625,"Q23":2.625,"HEX_#fff":2.625,"line":2.236,"HEX_#f4b942":2.115,"T24":1.352,"T16":1.3,"M21":1.282,"T32":1.181,"M15":0.979}}};
  for (const _p of HTML_SVG_CLASSIFIER_BANK.p) { if (!_p[5]) _p[5] = (HTML_SVG_CLASSIFIER_BANK.mt && HTML_SVG_CLASSIFIER_BANK.mt[_p[0] + "|" + _p[2]]) || {}; }

  const TIERED_HTML_SVG_FAMILIES = new Set([
    "claude-opus-5.6", "claude-opus-5.5", "claude-opus-5",
    "claude-sonnet-5.5", "claude-sonnet-5", "claude-sonnet-4.6",
    "claude-fable-5.1", "claude-fable-5", "claude-haiku-5.5",
    "gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol",
    "gpt-6.1-luna", "gpt-6-luna", "gpt-5.6-luna",
    "gpt-6-astra", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4",
    "gemini-4-argon", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-pro-preview",
    "muse-spark-1.3", "grok-4.7", "grok-4.6"
  ]);

  function healTruncatedSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== "string") return "";
    let s = rawSvg.trim();
    if (!/<svg\b/i.test(s)) return s;
    if (/<\/svg\s*>$/i.test(s)) return s;
    s = s.replace(/\s+[a-zA-Z0-9_:-]+=["'][^"']*$/, "");
    const lastLt = s.lastIndexOf("<");
    const lastGt = s.lastIndexOf(">");
    if (lastLt > lastGt) {
      const tailTag = s.slice(lastLt);
      if (/^<(?:path|circle|rect|ellipse|line|polyline|polygon|stop|use|animate|animateTransform|animateMotion)\b/i.test(tailTag)) {
        const qCount = (tailTag.match(/"/g) || []).length;
        if (qCount % 2 === 1) s += '"';
        s += "/>";
      } else {
        s = s.slice(0, lastLt).trim();
      }
    }
    const openStyle = (s.match(/<style\b[^>]*>/ig) || []).length;
    const closeStyle = (s.match(/<\/style\s*>/ig) || []).length;
    if (openStyle > closeStyle) s += "</style>";
    const openScript = (s.match(/<script\b[^>]*>/ig) || []).length;
    const closeScript = (s.match(/<\/script\s*>/ig) || []).length;
    if (openScript > closeScript) s += "</script>";
    for (const tag of ["linearGradient", "radialGradient", "clipPath", "mask", "filter", "defs", "g"]) {
      const openRe = new RegExp("<" + tag + "\\b(?![^>]*\\/>)[^>]*>", "ig");
      const closeRe = new RegExp("<\\/" + tag + "\\s*>", "ig");
      const openCnt = (s.match(openRe) || []).length;
      const closeCnt = (s.match(closeRe) || []).length;
      for (let i = 0; i < Math.max(0, openCnt - closeCnt); i++) s += "</" + tag + ">";
    }
    if (!/<\/svg\s*>/i.test(s)) s += "\n</svg>";
    return s;
  }

  function extractSvgStyleV2(svgText) {
    const raw = String(svgText || "").trim();
    const lower = raw.toLowerCase();
    const charLen = raw.length;
    const lineCount = raw ? raw.split(/\r?\n/).length : 0;
    const vbMatch = raw.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    const viewBox = vbMatch ? vbMatch[1].trim() : "";
    const tagSeq = Array.from(raw.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9:_-]*)\b/g), m => m[1].toLowerCase());
    const tagCounts = {};
    for (const t of tagSeq) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const dBlobs = Array.from(raw.matchAll(/\bd\s*=\s*["']([^"']+)["']/ig), m => m[1]);
    const allD = dBlobs.join(" ");
    const pathOps = {};
    for (const op of ["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "S", "s", "Q", "q", "T", "t", "A", "a", "Z", "z"]) {
      const cnt = (allD.match(new RegExp(op, "g")) || []).length;
      if (cnt) pathOps[op] = cnt;
    }
    const hexColors = Array.from(new Set(Array.from(lower.matchAll(/#[0-9a-f]{3,8}\b/g), m => m[0]))).slice(0, 16);
    const hasDefs = Boolean(tagCounts.defs);
    const hasGradient = Boolean(tagCounts.lineargradient || tagCounts.radialgradient);
    const hasFilter = Boolean(tagCounts.filter || tagCounts.fegaussianblur || tagCounts.fedropshadow);
    const hasClip = Boolean(tagCounts.clippath || tagCounts.mask);
    const hasStyleOrScript = Boolean(tagCounts.style || tagCounts.script || tagCounts.animate || tagCounts.animatetransform);
    const totalShapes = Math.max(1, (tagCounts.path || 0) + (tagCounts.circle || 0) + (tagCounts.rect || 0) + (tagCounts.ellipse || 0) + (tagCounts.polygon || 0) + (tagCounts.polyline || 0) + (tagCounts.line || 0));
    const totalCmds = Math.max(1, Object.values(pathOps).reduce((a, b) => a + b, 0));
    const vector17 = [
      Math.round(Math.log1p(charLen) * 10000) / 10000,
      Math.round(Math.log1p(lineCount) * 10000) / 10000,
      Math.round(Math.log1p(totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.path || 0) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.circle || 0) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.rect || 0) / totalShapes) * 10000) / 10000,
      Math.round((((tagCounts.polygon || 0) + (tagCounts.polyline || 0)) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.g || 0) / totalShapes) * 10000) / 10000,
      hasDefs ? 1 : 0,
      hasGradient ? 1 : 0,
      hasFilter ? 1 : 0,
      hasClip ? 1 : 0,
      hasStyleOrScript ? 1 : 0,
      Math.round((hexColors.length / 16) * 10000) / 10000,
      Math.round((((pathOps.C || 0) + (pathOps.c || 0) + (pathOps.S || 0) + (pathOps.s || 0)) / totalCmds) * 10000) / 10000,
      Math.round((((pathOps.A || 0) + (pathOps.a || 0)) / totalCmds) * 10000) / 10000,
      Math.round((((pathOps.Z || 0) + (pathOps.z || 0)) / totalCmds) * 10000) / 10000,
    ];
    const sigStr = viewBox + "|" + tagSeq.slice(0, 48).join(",") + "|" + Object.entries(pathOps).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + ":" + v).join(",");
    let h1 = 0x811c9dc5;
    for (let i = 0; i < sigStr.length; i++) {
      h1 ^= sigStr.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const structuralSignature = (h1 >>> 0).toString(16).padStart(8, "0");
    return {
      schema: "svg-style-v2",
      charLen,
      lineCount,
      viewBox,
      tagCounts,
      pathOps,
      hexPalette: hexColors,
      hasDefs,
      hasGradient,
      hasFilter,
      hasClip,
      hasStyleOrScript,
      structuralSignature,
      vector17,
    };
  }

  function scoreMiniSvg32Pelican(svgText) {
    if (!svgText || typeof svgText !== "string") return { score: 0, maxScore: 25, details: {} };
    const s = svgText.trim();
    const sl = s.toLowerCase();
    const has32ViewBox = /viewBox\s*=\s*["']0\s+0\s+32\s+32["']/i.test(s) || (/width\s*=\s*["']32["']/i.test(s) && /height\s*=\s*["']32["']/i.test(s));
    const hasSun = /<circle\b/i.test(s) || /#(?:fbbf24|f59e0b|fde047|fef08a|ffd[0-9a-f]{3}|ff9[0-9a-f]{3}|f4a[0-9a-f]{3}|f3b[0-9a-f]{3}|f6c[0-9a-f]{3})/i.test(sl) || /sun|lineargradient|radialgradient/i.test(sl);
    const hasWater = /#(?:0ea5e9|0284c7|0369a1|38bdf8|1e3a8a|1f2a44|244b52|294f52|78c2ca|5b8e9c|3fa7d6|a8d5cd|28536b)/i.test(sl) || /\bd=["'][^"']*[qcsQCS][^"']*["']/.test(s);
    const shapeCount = (s.match(/<(?:path|polygon|polyline|ellipse|circle|rect)\b/ig) || []).length;
    const dLen = Array.from(s.matchAll(/\bd=["']([^"']+)["']/ig), m => m[1]).join("").length;
    const hasPelican = shapeCount >= 3 && (dLen >= 16 || shapeCount >= 5);
    const isComplete = /<\/svg\s*>/i.test(s);
    const d1 = has32ViewBox ? 5 : 0;
    const d2 = hasSun ? 5 : 0;
    const d3 = hasWater ? 5 : 0;
    const d4 = hasPelican ? 5 : 0;
    const d5 = isComplete ? 5 : 0;
    return {
      score: d1 + d2 + d3 + d4 + d5,
      maxScore: 25,
      details: { viewBox32: d1, sun: d2, water: d3, pelicanShapes: d4, completeClosure: d5, shapeCount, dLen },
    };
  }

  function extractCleanHtmlOrSvg(rawText) {
    if (!rawText || typeof rawText !== "string") return { code: "", isTruncated: false };
    const text = rawText.trim();
    if (!/<svg\b|<!doctype\s+html|<html\b/i.test(text)) return { code: "", isTruncated: false };
    let extracted = "";
    let isTruncated = false;
    const mClosed = text.match(/```(?:html|xml|svg)?\s*([\s\S]*?)```/i);
    if (mClosed && /<svg\b|<!doctype\s+html|<html\b/i.test(mClosed[1])) {
      extracted = mClosed[1].trim();
    } else {
      const mOpen = text.match(/```(?:html|xml|svg)?\s*([\s\S]+)/i);
      if (mOpen && /<svg\b|<!doctype\s+html|<html\b/i.test(mOpen[1])) {
        extracted = mOpen[1].trim();
        isTruncated = true;
      }
    }
    if (!extracted || (!/<svg\b/i.test(extracted) && /<svg\b/i.test(text))) {
      const htmlClosed = text.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/i);
      if (htmlClosed) {
        extracted = htmlClosed[1].trim();
      } else {
        const svgClosed = text.match(/(<svg[\s\S]*?<\/svg>)/i);
        if (svgClosed) {
          extracted = svgClosed[1].trim();
        } else {
          const htmlOpen = text.match(/(<!DOCTYPE\s+html[\s\S]+|<html[\s\S]+)/i);
          const svgOpen = text.match(/(<svg[\s\S]+)/i);
          if (htmlOpen) { extracted = htmlOpen[1].trim(); isTruncated = true; }
          else if (svgOpen) { extracted = svgOpen[1].trim(); isTruncated = true; }
        }
      }
    }
    if (!extracted) return { code: "", isTruncated: false };
    if (/<svg\b/i.test(extracted) && !/<\/svg>/i.test(extracted)) {
      isTruncated = true;
      if (!/<html\b|<!doctype\s+html/i.test(extracted)) {
        extracted = healTruncatedSvg(extracted);
      } else {
        extracted += "\n</svg>";
      }
    }
    if (/<html\b/i.test(extracted) && !/<\/html>/i.test(extracted)) {
      isTruncated = true;
      if (!/<\/body>/i.test(extracted)) extracted += "\n</body>";
      extracted += "\n</html>";
    }
    return { code: extracted, isTruncated };
  }

  function extractHtmlSvgFeatures(rawCode, forcedCodeType = "") {
    const cleaned = extractCleanHtmlOrSvg(rawCode);
    const c = (cleaned.code || String(rawCode || ""))
      .replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/ig, "")
      .replace(/\s+data-nonce=["'][^"']*["']/ig, "");
    const cl = c.toLowerCase();
    const bytes = typeof Buffer !== "undefined" ? Buffer.byteLength(c, "utf8") : (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(c).length : unescape(encodeURIComponent(c)).length);
    const lines = Math.max(1, c.split(/\r?\n/).length);
    const codeType = forcedCodeType || ((/<html\b|<!doctype html/i.test(c) || bytes > 4500) ? "html_svg" : "svg32");
    const vbs = Array.from(c.matchAll(/viewBox=["']([^"']+)["']/ig), m => m[1].trim());
    const parsed = vbs.map(v => {
      const n = (v.match(/[-+]?\d*\.?\d+/g) || []).map(Number);
      return { v, n, area: n.length >= 4 ? n[2] * n[3] : 0 };
    }).sort((a, b) => b.area - a.area);
    const mainVB = parsed.length ? parsed[0].v : "";
    const vbN = parsed.length ? parsed[0].n : [0, 0, 800, 500];
    const minVBArea = parsed.length ? parsed[parsed.length - 1].area : 0;
    const vbW = vbN.length >= 4 ? vbN[2] : 800;
    const vbH = vbN.length >= 4 ? vbN[3] : 500;
    const htmlComments = Array.from(c.matchAll(/<!--[\s\S]*?-->/g)).length;
    const jsComments = Array.from(c.matchAll(/\/\/[^\r\n]*/g)).length;
    const tagCounts = {};
    for (const m of c.matchAll(/<([a-zA-Z][a-zA-Z0-9_-]*)\b/g)) {
      const tag = m[1];
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const count = (...names) => names.reduce((n, k) => n + (tagCounts[k] || 0), 0);
    const hex = Array.from(c.matchAll(/#[0-9a-fA-F]{3,6}\b/g), m => m[0]);
    const upperHex = hex.filter(h => /[A-F]/.test(h.slice(1))).length / Math.max(1, hex.length);
    const dAll = Array.from(c.matchAll(/\bd=["']([^"']+)["']/g), m => m[1]).join(" ");
    const upperCmds = (dAll.match(/[MLCQAZHVST]/g) || []).length;
    const lowerCmds = (dAll.match(/[mlcqazhvst]/g) || []).length;
    const relCmdRatio = lowerCmds / Math.max(1, upperCmds + lowerCmds);
    const commaSep = (dAll.match(/\d,\d/g) || []).length;
    const spaceSep = (dAll.match(/\d\s+\d/g) || []).length;
    const commaRatio = commaSep / Math.max(1, commaSep + spaceSep);
    const noLead = (dAll.match(/(?<!\d)\.\d+/g) || []).length;
    const withLead = (dAll.match(/\b0\.\d+/g) || []).length;
    const noLeadRatio = noLead / Math.max(1, noLead + withLead);
    const rootMatch = c.match(/<svg\b[^>]*>/i);
    const rootTag = rootMatch ? rootMatch[0] : "";
    const rootStroke = /\bstroke=/.test(rootTag) ? 1 : 0;
    const rootWH = /\bwidth=/.test(rootTag) && /\bheight=/.test(rootTag) ? 1 : 0;
    const whFirst = /width=["']32["'][^>]*viewBox=["']0 0 32 32["']/i.test(rootTag) ? 1 : 0;
    const rxMatch = c.match(/<rect\b[^>]*\brx=["'](\d+(?:\.\d+)?)["']/i);
    const rx = rxMatch ? Number(rxMatch[1]) : 0;

    const hasAriaRole = (cl.includes('role="img"') || cl.includes("aria-label") || cl.includes("aria-labelledby")) ? 1 : 0;
    const hasSvgTitleDesc = (count("title") >= 1 && count("desc") >= 1) ? 1 : 0;
    const hasCssClamp = cl.includes("clamp(") ? 1 : 0;
    const hasGridPlace = cl.includes("place-items") ? 1 : 0;
    const hasTransformBox = cl.includes("transform-box") ? 1 : 0;
    const hasFeFilter = /<fe(?:gaussianblur|dropshadow|turbulence|displacementmap)\b/i.test(cl) ? 1 : 0;
    const hasVisChange = cl.includes("visibilitychange") ? 1 : 0;
    const hasSetAttr = cl.includes("setattribute(") ? 1 : 0;
    const uniqueHexCnt = new Set(hex.map(h => h.toLowerCase())).size;

    const num = x => Math.log1p(Math.max(0, x));
    const nPath = count("path");
    const nCircle = count("circle");
    const nEllipse = count("ellipse");
    const nRect = count("rect");
    const nLine = count("line");
    const nPoly = count("polyline", "polygon");
    const nG = count("g");
    const nGrad = count("linearGradient", "radialGradient", "lineargradient", "radialgradient");
    const nFilter = count("filter", "clipPath", "clippath");
    const nUse = count("use");
    const hasRaf = cl.includes("requestanimationframe") ? 1 : 0;
    const hasCancelRaf = cl.includes("cancelanimationframe") ? 1 : 0;
    const hasKeyframes = cl.includes("@keyframes") ? 1 : 0;
    const hasSmil = /<animate(?:transform|motion)?\b/i.test(c) ? 1 : 0;
    const hasTrig = (cl.includes("math.sin") || cl.includes("math.cos")) ? 1 : 0;
    const hasInvTrig = (cl.includes("math.atan2") || cl.includes("math.acos")) ? 1 : 0;
    const hasCssVar = (c.includes("--") && cl.includes("var(--")) ? 1 : 0;
    const hasReducedMotion = cl.includes("prefers-reduced-motion") ? 1 : 0;

    const vec = [
      num(bytes), num(lines), num(bytes / lines), lines <= 5 ? 1 : 0,
      num(vbW), num(vbH), vbW / Math.max(1, vbH), vbs.length > 1 ? 1 : 0,
      mainVB.includes("0 0 1200 800") ? 1 : 0,
      mainVB.includes("0 0 800 500") ? 1 : 0,
      mainVB.includes("0 0 1440 900") ? 1 : 0,
      mainVB.includes("0 0 960 600") ? 1 : 0,
      mainVB.includes("0 0 1000 620") ? 1 : 0,
      hasRaf, hasCancelRaf, hasKeyframes, hasSmil, hasTrig, hasInvTrig, hasCssVar, hasReducedMotion,
      num(htmlComments), num(jsComments), upperHex, relCmdRatio, commaRatio, noLeadRatio,
      rootStroke, rootWH, whFirst, num(rx),
      num(nPath), num(nCircle), num(nEllipse), num(nRect),
      num(nLine), num(nPoly), num(nG),
      num(nGrad), num(nFilter), num(nUse),
      hasAriaRole, hasSvgTitleDesc, hasCssClamp, hasGridPlace, hasTransformBox,
      hasFeFilter, hasVisChange, hasSetAttr, num(uniqueHexCnt)
    ];

    const cNoGeom = codeType === "html_svg" ? c.replace(/\b(?:d|points)=["'][^"']*["']/g, " ") : c;
    const tokens = new Set((cNoGeom.match(/[a-zA-Z_][a-zA-Z0-9_-]{2,32}/g) || []));
    if (codeType === "html_svg") {
      for (const m of cNoGeom.matchAll(/\bclass=["']([^"']+)["']/g)) {
        for (const cn of m[1].trim().split(/\s+/)) {
          if (cn) tokens.add("CLS_" + cn.toLowerCase());
        }
      }
      for (const m of cNoGeom.matchAll(/\bid=["']([^"']+)["']/g)) {
        if (m[1].trim()) tokens.add("ID_" + m[1].trim().toLowerCase());
      }
      for (const m of cNoGeom.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/ig)) {
        tokens.add("KF_" + m[1].toLowerCase());
      }
    }
    for (const h of new Set(hex)) tokens.add("HEX_" + h.toLowerCase());
    if (mainVB) tokens.add("VB_" + mainVB.replace(/\s+/g, "_"));
    if (vbs.length > 1) tokens.add("MULTI_SVG");
    if (rootStroke) tokens.add("ROOT_SVG_STROKE");
    if (whFirst) tokens.add("WH_BEFORE_VB");
    if (commaRatio > 0.35) tokens.add("PATH_COMMA_SEP");
    if (relCmdRatio > 0.25) tokens.add("PATH_REL_CMDS");
    if (noLeadRatio > 0.4) tokens.add("PATH_OMIT_LEAD_ZERO");
    if (upperHex > 0.5) tokens.add("UPPERCASE_HEX_DOMINANT");
    if (hasAriaRole) tokens.add("ARCH_ARIA_ROLE_IMG");
    if (hasSvgTitleDesc) tokens.add("ARCH_SVG_TITLE_DESC");
    if (hasCssClamp) tokens.add("ARCH_CSS_CLAMP");
    if (hasGridPlace) tokens.add("ARCH_GRID_PLACE_ITEMS");
    if (hasTransformBox) tokens.add("ARCH_TRANSFORM_BOX");
    if (hasFeFilter) tokens.add("ARCH_FE_FILTER");
    if (hasVisChange) tokens.add("ARCH_VISIBILITY_CHANGE");
    if (hasSetAttr && hasRaf) tokens.add("ARCH_RAF_SETATTR");

    // Michaelis-Menten 非饱和有理分式谱图复杂度评分（消除 100 分天花板粘连）
    const phi = 14.5 * num(nPath + nCircle + nEllipse + nPoly)
      + 18.2 * num(nG + nGrad * 2 + nFilter * 2)
      + 16.0 * (hasRaf + hasTrig * 0.6 + hasInvTrig * 0.8)
      + 11.0 * (hasKeyframes + hasSmil + hasTransformBox * 0.6)
      + 8.5 * num(uniqueHexCnt);
    const spectralScore = Math.round((100 * phi / (phi + 92)) * 10) / 10;

    // 12 维紧凑签名（供习惯库样本 meta 持久化与跨会话比对）
    const sig12 = [
      Math.min(1, num(bytes) / 11),
      Math.min(1, (vbW / Math.max(1, vbH)) / 2.2),
      hasRaf,
      hasKeyframes,
      hasSmil,
      Math.round(upperHex * 1000) / 1000,
      Math.round(relCmdRatio * 1000) / 1000,
      Math.round(commaRatio * 1000) / 1000,
      Math.round(noLeadRatio * 1000) / 1000,
      Math.min(1, num(nPath + nG) / 6),
      Math.min(1, num(htmlComments + jsComments) / 5),
      Math.min(1, spectralScore / 100),
    ].map(x => Math.round((Number(x) || 0) * 1000) / 1000);

    const svgStyleV2 = extractSvgStyleV2(c);
    const miniSvg32Referee = codeType === "svg32" ? scoreMiniSvg32Pelican(c) : null;

    return {
      code_type: codeType,
      isTruncated: cleaned.isTruncated,
      vec,
      sig12,
      svgStyleV2,
      miniSvg32Referee,
      spectralScore,
      tokens,
      bytes,
      lines,
      vbs,
      main_vb: mainVB,
      min_vb_area: minVBArea,
      n_path: nPath,
      n_circle: nCircle,
      n_g: nG,
      n_grad: nGrad,
      n_hcomm: htmlComments,
      has_raf: Boolean(hasRaf),
      root_tag: rootTag,
      root_stroke: rootStroke,
      wh_first: whFirst,
      comma_ratio: commaRatio,
      rect_rx: rx,
      raw: c,
      lower: cl,
    };
  }

  function htmlSvgRuleScores(f) {
    const b = f.bytes, cl = f.lower, vb = f.main_vb, vbs = f.vbs || [], rules = {}, reasons = {};
    const add = (mid, score, why) => {
      rules[mid] = (rules[mid] || 0) + score;
      if (why) (reasons[mid] || (reasons[mid] = [])).push(why);
    };
    if (f.code_type === "html_svg") {
      const _AP = (typeof ArenaPricing !== "undefined" && ArenaPricing) || (typeof globalThis !== "undefined" && globalThis.ArenaPricing) || null;
      const _zq0 = (_AP && typeof _AP.evaluateZeroQuotaCarbonSignature === "function") ? _AP.evaluateZeroQuotaCarbonSignature(f.raw) : null;
      const _c3 = (_AP && typeof _AP.classify3StageGoogleArgonCarbon === "function") ? _AP.classify3StageGoogleArgonCarbon(f.raw, { ws_model_hint: (_zq0 && _zq0.isTrueCarbon) ? "gemini-4-carbon" : "" }) : null;
      if ((_zq0 && _zq0.isTrueCarbon) || (_c3 && _c3.isTrueCarbon)) {
        add("google/gemini-4-carbon", 0.97, `命中五门正交 👑 真 Carbon 物理引擎 (${(_c3 && _c3.verdict) || (_zq0 && _zq0.verdict)})`);
      }
      const argonKeys = ["pelicanBodyGroup", "basketFish", "cloudsLayer", "wavesLayer", "maxReach", "bodyPitch", "baseAngle", "headNod", "wheelTemplate", "windLines", "gull1", "gull2", "solveKnee", "buildDrumstick", "buildWebbedFoot", "buildWing", "blinkCycle", "pouchSway", "scarfTail1"];
      const hits = argonKeys.filter(k => f.raw.includes(k)).length;
      if (f.has_raf && hits >= 3) add("google/gemini-4-argon", 0.48 + Math.min(0.35, hits * 0.05), `Argon专属骨骼变量(${hits}项)+RAF`);
      else if (f.has_raf && (cl.includes("math.sin") || cl.includes("math.cos")) && f.n_hcomm >= 65 && b >= 28000) add("google/gemini-4-argon", 0.45, `Argon高密度注释(${f.n_hcomm})+RAF逆运动学`);

      if ((cl.includes("overscroll-behavior: none") && cl.includes("viewport-fit=cover")) || (cl.includes("paper-noise") && cl.includes("sea-light") && cl.includes("islands"))) {
        add("openai/gpt-6-astra", 0.75, "GPT 6 Astra viewport-fit/paper-noise/sea-light视差");
      }

      const hasSmall = vbs.length > 1 && f.min_vb_area > 0 && f.min_vb_area <= 2500 && !vbs.includes("0 0 32 32") && !vbs.includes("0 0 120 50");
      if (hasSmall && f.has_raf && (cl.includes("cancelanimationframe") || cl.includes("visibilitychange") || cl.includes("updateleg") || cl.includes("scenelabel") || cl.includes("scenetitle") || cl.includes("scene-title"))) {
        add("openai/gpt-6.1-sol", 0.68, "GPT 6.1 Sol 多SVG控件+RAF/visibilitychange驱动");
      } else if (/\*\{box-sizing:border-box\}html,body\{margin:0;width:100%;height:100%;overflow:hidden;background:#[0-9a-f]{6}\}body\{display:grid;place-items:center\}/.test(cl) && (cl.includes(".crank") || cl.includes("pedalfront") || cl.includes("toggle")) && !cl.includes(".hill-back")) {
        add("openai/gpt-6.1-sol", 0.58, "GPT 6.1 Sol 紧凑Grid+crank/pedal驱动");
      } else if ((cl.includes("#scene") || cl.includes(".scene")) && cl.includes('id="scene"') && cl.includes('id="title"') && cl.includes('id="desc"') && cl.includes('id="roadmarks"') && cl.includes('id="toggle"')) {
        add("openai/gpt-6.1-sol", 0.58, "GPT 6.1 Sol scene/roadmarks/toggle结构");
      } else if (cl.includes('preserveaspectratio="xmidymid slice"') && cl.includes("scrollers") && cl.includes("performance.now()")) {
        add("openai/gpt-6.1-sol", 0.60, "GPT 6.1 Sol scrollers视差卷轴驱动");
      } else if (cl.includes('<meta name="color-scheme" content="light">') && vb.includes("0 0 1440 900") && (cl.includes("nearcrank") || cl.includes("farcrank"))) {
        add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol 1440×900双曲柄(nearCrank/farCrank)");
      } else if ((cl.includes(".masthead") || cl.includes(".eyebrow")) && cl.includes("calc(100% - 64px)") && cl.includes("visibilitychange") && f.has_raf) {
        add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol masthead/eyebrow+visibilitychange");
      }

      if (cl.includes('rel="icon"') && cl.includes("data:image/svg+xml") && cl.includes("whlf") && cl.includes("whlr")) add("anthropic/claude-opus-5.5", 0.72, "Claude Opus 5.5 内嵌SVG Favicon+whlF/whlR");
      if (cl.includes(".spin-fast") && cl.includes("pouchg") && cl.includes("@keyframes neck")) add("anthropic/claude-opus-5.5", 0.68, "Claude Opus 5.5 spin-fast+neck/pouchG关键帧");

      if (cl.includes(".leg-a") && cl.includes(".leg-b") && cl.includes("lega") && cl.includes("legb")) add("x-ai/grok-4.7", 0.58, "Grok 4.7 leg-a/leg-b关键帧");
      if ((cl.includes("ui-rounded") || cl.includes("sf pro rounded") || cl.includes("bird-bob") || cl.includes("sun-breathe") || cl.includes("wheel-turn") || cl.includes(".hill-back") || cl.includes("bikepaint") || (cl.includes("road-drift") && cl.includes("softshadow")) || (vb.includes("0 0 1200 700") && !cl.includes("tinyshadow") && !cl.includes("whlf") && !cl.includes("pouchg"))) && !f.has_raf && !cl.includes("walk-clip") && !cl.includes("bird-feather") && !cl.includes("water-glint")) {
        add("openai/gpt-6-luna", 0.52, "GPT 6 Luna ui-rounded/bird-bob/wheel-turn纯CSS+SMIL");
      } else if (cl.includes('lang="es"') && vb.includes("0 0 800 500")) {
        add("openai/gpt-6-luna", 0.58, "GPT 6 Luna 多语种标题与800×500结构");
      }
      if ((vb.includes("0 0 800 500") || vb.includes("0 0 800 450") || vb.includes("0 0 1000 560") || vb.includes("0 0 1000 600") || vb.includes("0 0 1000 620")) && (cl.includes("#bfe6ff") || cl.includes("#e3f6ff") || cl.includes("#87ceeb") || cl.includes("hillsfar") || cl.includes("hillsnear") || cl.includes("solveik") || cl.includes("鹈鹕骑自行车</title>") || cl.includes("风一吹，就出发")) && !cl.includes("pelicanfeather") && !cl.includes("pedalu") && !cl.includes("crank-spin") && !cl.includes("tailwag") && !cl.includes("spokesrear") && !cl.includes("ikknee") && !cl.includes("legbackhilight") && !cl.includes('lang="es"') && !((cl.includes("crankr") && cl.includes("crankl") && cl.includes("pedalr") && cl.includes("pedall")) || (cl.includes("cloudtile") && cl.includes("farhilltile") && cl.includes("nearhilltile")) || (cl.includes("wheel_r") && cl.includes("crank_r") && cl.includes("thigh")))) {
        add("anthropic/claude-sonnet-5.5", 0.56, "Claude Sonnet 5.5 800×500/1000×620+#87ceeb/hillsFar/solveIK");
      }
      if (vb.includes("0 0 1000 620") && f.has_raf && (cl.includes("solveik") || cl.includes("═"))) {
        add("anthropic/claude-opus-5.5", 0.58, "Claude Opus 5.5 1000×620+solveIK+RAF逆运动学");
        add("anthropic/claude-sonnet-5.5", 0.60, "Claude Sonnet 5.5 1000×620+solveIK+框线注释");
      }
      if (!f.has_raf && f.n_hcomm >= 70 && (cl.includes("skygrad") || cl.includes("pouchgrad"))) {
        if (cl.includes("spincw") || cl.includes("spinccw") || cl.includes("scarfwave") || cl.includes("belltoast") || b > 40000) add("google/gemini-3.7-flash", 0.58, "Gemini 3.7 Flash 超高注释(>70)+纯CSS/SMIL");
        else add("google/gemini-3.8-flash", 0.55, "Gemini 3.8 Flash 高注释+纯CSS关键帧");
      } else if (cl.includes("roadfill") && cl.includes("wingbeat") && vb.includes("0 0 1200 760")) {
        add("google/gemini-3.8-flash", 0.55, "Gemini 3.8 Flash roadFill/wingbeat+1200×760");
      }
      if (vb.includes("0 0 900 520") && (cl.includes("sunrays") || cl.includes("plumeg") || cl.includes("chainfwd"))) add("z-ai/glm-5.3", 0.58, "GLM 5.3 900×520+sunRays/plumeG");
      if ((cl.includes("wheelspin") || cl.includes("cloudrift") || cl.includes("clouddrift1") || (cl.includes("hillback") && cl.includes("hillfore")) || (f.lines <= 35 && b > 25000) || (f.n_path === 0 && b > 15000)) && !cl.includes(".masthead") && !vbs.includes("0 0 120 50") && !(vb.includes("0 0 800 500") && (cl.includes("crank-spin") || cl.includes("tailwag") || cl.includes("#87ceeb")))) add("moonshotai/kimi-k3", 0.55, "Kimi K3 关键帧/几何图元结构");
      if (b <= 11200 && (cl.includes("cranka") || cl.includes("crankb") || (vb.includes("0 0 800 500") && (cl.includes("#ff9a2e") || cl.includes("legfront") || cl.includes("pelican-head") || cl.includes("#fff8e7") || cl.includes("pedal-spin") || cl.includes("spokes") || cl.includes("groundline") || (cl.includes("@keyframes ride") && cl.includes("@keyframes ground")))))) add("anthropic/claude-haiku-5.5", 0.55, "Claude Haiku 5.5 紧凑800×500+crankA/crankB");
      const isMuseKneeSvg = (cl.includes('aria-labelledby="svgtitle svgdesc"') || cl.includes('aria-labelledby="titulosvg descsvg"') || (cl.includes('id="svgtitle"') && cl.includes('id="svgdesc"')) || (cl.includes('id="titulosvg"') && cl.includes('id="descsvg"')) || cl.includes("scarfflutter") || (cl.includes("scarftail") && !cl.includes("scarftail1")) || (cl.includes("scarfa") && cl.includes("scarfb")) || (cl.includes("hip_n") && cl.includes("hip_f")) || (cl.includes("legnear") && cl.includes("legfar") && cl.includes("footnear") && cl.includes("footfar")) || (cl.includes("legbackhilight") && cl.includes("legfronthilight")) || (cl.includes("head-bill") && cl.includes("fish-tail") && cl.includes("spin-rear") && cl.includes("spin-front"))) && (cl.includes("function knee(") || cl.includes("function kneeposition(") || cl.includes("function solveknee(") || cl.includes("function ikknee(") || cl.includes("function setleg(") || cl.includes("function updateleg(") || cl.includes("function placeleg(") || cl.includes("math.hypot(dx, dy) || 1") || /math\.min\(\s*\(\s*now\s*-\s*last\s*\)\s*\/\s*1000\s*,\s*0\.05\s*\)/.test(cl) || (cl.includes("pedalnear") && cl.includes("pedalfar")) || (cl.includes("legnear") && cl.includes("legfar")) || (cl.includes("spin-rear") && cl.includes("spin-front")));
      if (isMuseKneeSvg || cl.includes("grassblock") || cl.includes("treeblock") || (cl.includes('id="roadg"') && cl.includes('id="pouchg"') && cl.includes('id="sung"') && !cl.includes('id="plumeg"')) || (cl.includes("rearspokelines") && cl.includes("frontspokelines")) || (cl.includes("dashstrip") && cl.includes("grasstufts") && cl.includes("buildstrip")) || cl.includes('spokes("spokesrear")')) add("meta/muse-spark-1.3", isMuseKneeSvg ? 0.78 : 0.68, isMuseKneeSvg ? "Muse Spark 1.3 knee逆运动学/svgTitle+svgDesc/scarfFlutter" : "Muse Spark 1.3 roadG/pouchG/rearSpokeLines/dashStrip");
      if ((cl.includes("bird-feather") && cl.includes("grass-sway")) || (cl.includes("pouchpaint") && cl.includes("beakpaint") && cl.includes("riderbob"))) add("xiaomi/mimo-v2.6-flash", 0.55, "MiMo V2.6 Flash grass-sway/pouchPaint");
      if ((cl.includes("driftscenery") && cl.includes("driftforeground")) || (cl.includes("spokesrear") && cl.includes("spokesfront") && vb.includes("0 0 800 500"))) add("anthropic/claude-opus-5", 0.58, "Claude Opus 5 driftScenery/spokesRear");
      if (cl.includes("sceneryrow") || (cl.includes('id="hills2"') && vb.includes("0 0 800 450"))) add("deepseek/deepseek-v4.1-flash", 0.55, "DeepSeek V4.1 Flash sceneryRow/hills2");
      if (cl.includes("backlegoutline") || cl.includes("frontlegoutline") || (cl.includes("rearspokes") && cl.includes("frontspokes") && cl.includes("speckle"))) add("openai/gpt-6-sol", 0.55, "GPT 6 Sol backLegOutline/frontLegOutline");
      if (cl.includes("tinyshadow") && cl.includes("framepaint")) add("openai/gpt-5.6-sol", 0.55, "GPT 5.6 Sol tinyShadow/framePaint");
      if (cl.includes("farlegpath") || cl.includes("farshoe") || cl.includes("badgepulse")) add("openai/gpt-5.6-luna", 0.55, "GPT 5.6 Luna farLegPath/farShoe/badgePulse");
      if (cl.includes("walk-clip") || (cl.includes("boardwalk") && cl.includes("wheel-spin--back"))) add("openai/gpt-5.5", 0.55, "GPT 5.5 boardwalk/walk-clip/BEM");
      if ((cl.includes("pedalu") && cl.includes("pedald") && (cl.includes("legu") || cl.includes("legd"))) || (vb.includes("0 0 800 500") && cl.includes("crank-spin") && cl.includes("tailwag") && cl.includes("#87ceeb")) || ((cl.includes("crankr") && cl.includes("crankl") && cl.includes("pedalr") && cl.includes("pedall")) || (cl.includes("cloudtile") && cl.includes("farhilltile") && cl.includes("nearhilltile")) || (cl.includes("wheel_r") && cl.includes("crank_r") && cl.includes("thigh") && !f.raw.includes("WHEEL_R")) || (cl.includes("rearspin") && cl.includes("frontspin") && (cl.includes("placeleg") || cl.includes("wheelmarkup"))))) add("anthropic/claude-fable-5.1", 0.68, "Claude Fable 5.1 crankR/pedalR/farHillTile/IK逆运动学");
      if (cl.includes("pelican-rider") && (cl.includes("ground-dashes") || cl.includes("pedal-group")) && !cl.includes("crank-spin") && !cl.includes("tailwag")) add("xiaomi/mimo-v2.6-pro", 0.55, "MiMo V2.6 Pro pelican-rider/ground-dashes");
      if (cl.includes("water-glint") && cl.includes("sun-blur")) add("upstage/solar-pro4", 0.55, "Solar Pro 4 water-glint/sun-blur");
      if (cl.includes('id="tuft"') && cl.includes('id="rider"') && vb.includes("0 0 960 600")) add("nvidia/nemotron-3-ultra", 0.55, "Nemotron 3 Ultra tuft/rider图层");
      if (vb.includes("0 0 800 400") && cl.includes('id="scenery"') && cl.includes('id="rider"')) add("minimax/minimax-m3", 0.55, "MiniMax M3 800×400+scenery/rider");
      if (cl.includes('id="ttl"') && cl.includes('id="roadg"')) add("z-ai/glm-5.2", 0.55, "GLM 5.2 ttl/roadG结构");
      if (cl.includes('class="stage"') && cl.includes('class="caption"') && vb.includes("0 0 800 500") && !cl.includes("sceneryrow")) add("qwen/qwen3.7-max", 0.55, "Qwen 3.7 Max stage/caption+800×500");
    } else {
      if (f.root_stroke && (/#1f2a44|#1f3a5f|#f4a259|#f5b82e/.test(cl) || f.comma_ratio > 0.35)) add("anthropic/claude-opus-5.5", 0.62, "Claude Opus 5.5 SVG32根节点stroke+逗号坐标");
      else if (!f.root_stroke) add("anthropic/claude-opus-5.5", -0.25, "");
      if (f.wh_first && f.rect_rx === 4 && (/#fff5df|#244b52|#78c2ca/.test(cl))) add("openai/gpt-6-astra", 0.65, "GPT 6 Astra SVG32 width优先+rx=4");
      if (f.wh_first && f.rect_rx === 5 && (/#fff6e5|#294f52|#f3bc58/.test(cl))) add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol SVG32 width优先+rx=5");
      if (!f.wh_first && (f.rect_rx === 4 || f.rect_rx === 5)) {
        add("openai/gpt-6-astra", -0.28, "");
        add("openai/gpt-6.1-sol", -0.28, "");
      }
      if (f.root_tag.includes('role="img"') && f.rect_rx === 3.5) add("openai/gpt-5.6-terra", 0.52, "GPT 5.6 Terra SVG32 role=img+rx=3.5");
    }
    return { scores: rules, reasons };
  }

  function predictHtmlSvgEffort(mid, target, sims) {
    if (sims && sims.length && (sims[0].source === 2 || sims[0].rawSim >= 0.999) && sims[0].sim >= 0.96 && sims[0].effort && sims[0].effort !== "standard") {
      return sims[0].effort;
    }
    const slug = String(mid || "").split("/").pop().toLowerCase();
    const clEarly = target?.lower || "";
    if (slug === "claude-fable-5.1" && target?.code_type === "html_svg" && (target.has_raf && (target.bytes >= 11500 || clEarly.includes("crankr") || clEarly.includes("cloudtile") || clEarly.includes("wheel_r")))) {
      return "max";
    }
    if (slug === "muse-spark-1.3" && target?.code_type === "html_svg" && target.has_raf && (target.bytes >= 14500 || clEarly.includes("(function(){"))) {
      return "max";
    }
    const ct = target.code_type;
    const b = target.bytes;
    const lines = target.lines;
    const nPath = target.n_path;
    const nG = target.n_g;
    const nGrad = target.n_grad;
    const nHcomm = target.n_hcomm;
    const raf = target.has_raf ? 1 : 0;
    const vb = target.main_vb || "";
    const cl = target.lower || "";

    if (ct === "html_svg") {
      if (slug === "claude-fable-5.1") return (raf === 1 && b >= 11500) ? "max" : "high";
      if (slug === "muse-spark-1.3") return (raf === 1 && b >= 14500) ? "max" : "high";
      if (slug === "claude-sonnet-5.5") return (b <= 11500 && raf === 0) ? "low" : "high";
      if (slug === "gpt-6.1-sol") {
        if (raf === 0 && (nGrad <= 2 || lines <= 75)) return "low";
        if (raf === 0) return nPath >= 35 ? "max" : "high";
        if (nPath >= 100 || nG >= 44 || b < 25000) return "max";
        return "high";
      }
      if (slug === "gemini-4-argon") {
        if (vb.includes("800 500") || vb.includes("900 560") || vb.includes("1200 750") || (nHcomm >= 98 && nHcomm <= 105 && vb.includes("960 600")) || (cl.includes("builddrumstick") && cl.includes("buildwebbedfoot") && cl.includes("buildwing") && cl.includes("blinkcycle"))) return "max";
        if (b < 33500 && nG <= 26) return "medium";
        return "high";
      }
      if (slug === "gpt-6-luna") {
        if (["art-title", "poster", "status-dot", "bikepaint"].some(k => cl.includes(k))) return "low";
        if (raf === 1 || vb.includes("1200 700") || b < 9000 || cl.includes("feather-lilt")) return "max";
        return "medium";
      }
      if (slug === "gemini-3.7-flash") return b < 47000 ? "low" : "high";
    } else {
      if (slug === "gpt-6-astra") {
        if (sims && sims[0] && sims[0].sim >= 0.94 && sims[0].effort) return sims[0].effort;
        return "low";
      }
      if (slug === "claude-opus-5.5") return "max";
      if (slug === "gpt-6.1-sol") {
        if (sims && sims[0] && sims[0].sim >= 0.94 && sims[0].effort) return sims[0].effort;
        return "max";
      }
    }

    const use = (sims || []).filter(x => x.effort && x.effort !== "standard");
    if (use.length) {
      const votes = {};
      use.slice(0, 3).forEach((x, i) => {
        votes[x.effort] = (votes[x.effort] || 0) + Math.pow(Math.max(0.1, x.sim), 8) * (x.source === 2 ? 2.2 : (i === 0 ? 1.8 : 1));
      });
      const bestEff = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (bestEff) return bestEff;
    }
    return "high";
  }

  const PELICAN_CLASSIFIER_V5_MODEL = /*__PELICAN_CLASSIFIER_MODEL__*/null;
  function matchPelicanClassifierV5(target) {
    const out = Object.create(null);
    try {
      const m = PELICAN_CLASSIFIER_V5_MODEL || (typeof globalThis !== "undefined" && globalThis.PELICAN_CLASSIFIER_MODEL) || null;
      const protos = Array.isArray(m?.prototypes) ? m.prototypes : [];
      if (!protos.length || !target?.vec) return out;
      const weights = Array.isArray(m?.feature_weights) && m.feature_weights.length ? m.feature_weights : (HTML_SVG_CLASSIFIER_BANK.w || []);
      const ctStr = target.code_type || "html_svg";
      for (const p of protos) {
        if (p.code_type && p.code_type !== ctStr) continue;
        const mid = String(p.model_id || "");
        if (!mid) continue;
        const pVec = Array.isArray(p.vec) ? p.vec : [];
        let d2 = 0, wSum = 0;
        const n = Math.min(target.vec.length, pVec.length);
        for (let i = 0; i < n; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          const d = (target.vec[i] || 0) - (pVec[i] || 0);
          d2 += w * d * d;
          wSum += w;
        }
        const vSim = Math.exp(-1.6 * Math.sqrt(d2 / Math.max(1, wSum)));
        let pTokOverlap = 0;
        const pToks = p.tokens || {};
        for (const [tok, w] of Object.entries(pToks)) {
          if (target.tokens?.has(tok)) pTokOverlap += Number(w) || 0;
        }
        const tCos = Math.min(1, pTokOverlap / 18);
        const rawSim = ctStr === "html_svg" ? (0.68 * vSim + 0.32 * tCos) : vSim;
        const prev = out[mid];
        if (!prev || rawSim > prev.sim) {
          out[mid] = { sim: rawSim, effort: p.effort || "high" };
        }
      }
    } catch {}
    return out;
  }

  function classifyHtmlSvg(code, opts = {}) {
    if (!code || typeof code !== "string") return null;
    const target = extractHtmlSvgFeatures(code, opts.codeType || "");
    if (!target || (!/<svg\b|<!doctype html|<html\b/i.test(target.raw) && target.bytes < 60)) return null;
    const ctBit = target.code_type === "html_svg" ? 1 : 0;
    const weights = HTML_SVG_CLASSIFIER_BANK.w || [];
    const catalog = HTML_SVG_CLASSIFIER_BANK.c || {};
    const protosAll = HTML_SVG_CLASSIFIER_BANK.p || [];
    const pool = protosAll.filter(p => p[2] === ctBit);
    const rules = htmlSvgRuleScores(target);
    const v5Matches = matchPelicanClassifierV5(target);
    const byModel = new Map();
    for (const p of pool) {
      const mid = p[0];
      let arr = byModel.get(mid);
      if (!arr) { arr = []; byModel.set(mid, arr); }
      arr.push(p);
    }
    const modelIds = new Set([...byModel.keys(), ...Object.keys(rules.scores), ...Object.keys(v5Matches)]);
    const scores = [];
    for (const mid of modelIds) {
      const protos = byModel.get(mid) || [];
      const sims = protos.map(p => {
        const pEff = p[1] || "high";
        const pSrc = p[3] || 0;
        const pVec = p[4] || [];
        const pToks = p[5] || {};
        let d2 = 0, wSum = 0;
        const n = Math.min(target.vec.length, pVec.length);
        for (let i = 0; i < n; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          const d = (target.vec[i] || 0) - (pVec[i] || 0);
          d2 += w * d * d;
          wSum += w;
        }
        const vSim = Math.exp(-1.6 * Math.sqrt(d2 / Math.max(1, wSum)));
        let pTokOverlap = 0;
        for (const [tok, w] of Object.entries(pToks)) {
          if (target.tokens.has(tok)) pTokOverlap += Number(w) || 0;
        }
        const tCos = Math.min(1, pTokOverlap / 18);
        const rawSim = target.code_type === "html_svg" ? (0.68 * vSim + 0.32 * tCos) : vSim;
        const sim = rawSim * (pSrc === 2 ? 1.25 : (pSrc === 1 ? 1.06 : 1));
        return { sim, rawSim, effort: pEff, source: pSrc };
      }).sort((a, b) => b.sim - a.sim);

      const top = sims.slice(0, 3);
      const bestProtoSim = top.length ? top[0].rawSim : (rules.scores[mid] >= 0.4 ? 0.72 : 0.25);
      const best = top.length ? top[0].sim : (rules.scores[mid] >= 0.4 ? 0.72 : 0.25);
      const mean = top.length ? top.reduce((a, x) => a + x.sim, 0) / top.length : (rules.scores[mid] >= 0.4 ? 0.68 : 0.25);
      const learnedTokens = Object.create(null);
      for (const p of protos) {
        const pt = p[5] || {};
        for (const [k, v] of Object.entries(pt)) {
          const nv = Number(v) || 0;
          if (nv > (learnedTokens[k] || 0)) learnedTokens[k] = nv;
        }
      }
      let tokenScore = 0;
      const matched = [];
      for (const tok of target.tokens) {
        const w = learnedTokens[tok];
        if (typeof w === "number" && w > 0) {
          tokenScore += w;
          if (w >= 2.2) matched.push([w, tok]);
        }
      }
      matched.sort((a, b) => b[0] - a[0]);
      const tokenNorm = Math.min(1, tokenScore / 22);
      let rule = rules.scores[mid] || 0;
      if (best >= 0.995 && rule < 0) rule = 0;
      const v5Hit = v5Matches[mid] || null;
      const v5Boost = v5Hit && v5Hit.sim > best ? (v5Hit.sim - best) * 0.48 : 0;
      const combined = 0.45 * best + 0.20 * mean + 0.25 * tokenNorm + rule + v5Boost;
      const rawEffort = (v5Hit && v5Hit.sim >= 0.88 && v5Hit.effort) ? v5Hit.effort : predictHtmlSvgEffort(mid, target, sims);
      const catMeta = catalog[mid] || { label: mid, vendor: String(mid).split("/")[0] || "unknown" };
      const slug = String(mid).split("/").pop().toLowerCase();
      const isTieredFam = TIERED_HTML_SVG_FAMILIES.has(slug);
      const cleanEffort = isTieredFam ? rawEffort : "standard";
      const baseSlugOrLabel = isTieredFam && cleanEffort !== "standard"
        ? `${slug}-${cleanEffort}`
        : slug;
      const decomp = decomposeModelIdentity(baseSlugOrLabel, {
        vendor: catMeta.vendor,
        family: slug,
        effort: cleanEffort,
        rawLabel: catMeta.label || slug,
      });
      const isOpen = isOpenName(decomp.canon || decomp.family || mid);
      if (opts.strictOpenClosed && typeof opts.isOpenThink === "boolean" && isOpen !== opts.isOpenThink) {
        continue;
      }
      scores.push({
        model_id: mid,
        canon: decomp.canon,
        label: decomp.displayLabel || formatDisplayModelLabel(decomp.canon, catMeta.label),
        vendor: decomp.vendorLabel,
        vendorId: decomp.vendor,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        rawEffort,
        effortLabel: decomp.effortLabel,
        isOpen,
        score: Math.round(combined * 1000) / 1000,
        protoSim: Math.round(bestProtoSim * 1000) / 1000,
        tokenNorm: Math.round(tokenNorm * 1000) / 1000,
        ruleScore: Math.round(rule * 1000) / 1000,
        reasons: [...(rules.reasons[mid] || []), ...matched.slice(0, 3).map(x => "特征词:" + x[1])],
      });
    }
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, opts.topK || 5);
    const maxS = top[0]?.score || 0;
    const exps = top.map(x => Math.exp((x.score - maxS) * 6.5));
    const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
    top.forEach((x, i) => { x.confidence = Math.round((exps[i] / sumExp) * 1000) / 1000; });
    return {
      code_type: target.code_type,
      spectralScore: target.spectralScore,
      isTruncated: target.isTruncated,