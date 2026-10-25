      svgStyleV2: target.svgStyleV2,
      miniSvg32Referee: target.miniSvg32Referee,
      features: {
        bytes: target.bytes,
        lines: target.lines,
        viewBox: target.main_vb,
        hasRaf: target.has_raf,
        nPath: target.n_path,
        nCircle: target.n_circle,
        nG: target.n_g,
        nGrad: target.n_grad,
        sig12: target.sig12,
        vector17: target.svgStyleV2 ? target.svgStyleV2.vector17 : null,
        structuralSignature: target.svgStyleV2 ? target.svgStyleV2.structuralSignature : "",
      },
      top_candidates: top,
      best: top[0] || null,
    };
  }

  // 从已保存的 habitTags / habitFeatures（或导入的诊断 JSON）重建习惯特征（当对话消息尚未从 IndexedDB 加载时的即时还原）
  function extractFeaturesFromSaved(chat, modelEntry, opts = {}) {
    const sid = String(chat?.sid || modelEntry?.sid || '');
    const topRev = Array.isArray(modelEntry?.reverseCandidates) ? modelEntry.reverseCandidates[0] : null;
    const revTopLabel = (topRev && !topRev.structuralRev && (topRev.diophantinePassed || (topRev.revPct || 0) >= 75)) ? String(topRev.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.id || '') : '';
    const hasRealRevTokens = Boolean((modelEntry?.reverseTokens?.total > 0) || (modelEntry?.reverseTotalTokens?.total > 0));
    const authoritativeName = (modelEntry && !modelEntry.guess && !modelEntry.pendingConfirm && !modelEntry.fromTitle && (modelEntry.userCorrected || (!modelEntry.habitInferred && modelEntry.reverseInferred && hasRealRevTokens)))
      ? String(modelEntry.name || modelEntry.candidateName || modelEntry.reverseLabel || modelEntry.reverseCandidateId || '')
      : '';
    const mKnownName = String(revTopLabel || authoritativeName || '');
    const isKnownNonGoogle = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !KNOWN_ARGON_SIDS.has(sid) && ((typeof CONFIRMED_SOL_61_SIDS !== 'undefined' && CONFIRMED_SOL_61_SIDS.has(sid)) || HAIKU_55_MEDIUM_SIDS.has(sid) || /gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName));
    const savedFeat = modelEntry?.habitFeatures || chat?._habitFeatures || null;
    const bankSampleEarly = (!opts?.ignoreExactSid && sid) ? getBankSampleBySid(sid) : null;
    const rawTags = [
      ...(Array.isArray(savedFeat?.habitTags) ? savedFeat.habitTags : []),
      ...(Array.isArray(savedFeat?.tags) ? savedFeat.tags : []),
      ...(Array.isArray(modelEntry?.habitTags) ? modelEntry.habitTags : []),
      ...(Array.isArray(bankSampleEarly?.tags) ? bankSampleEarly.tags : []),
      ...(Array.isArray(modelEntry?.habitCandidates?.[0]?.matchedDims) ? modelEntry.habitCandidates[0].matchedDims : []),
      ...(Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims) ? modelEntry.reverseCandidates[0].matchedDims : []),
    ];
    const tags = [...new Set(rawTags.map(String).filter(Boolean))];
    const tagStr = tags.join(' | ');
    if (!tags.length && !savedFeat?.vec && !modelEntry?.streamEvidence && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return null;
    const bankSample = bankSampleEarly;
    const explicitOpenThink = savedFeat?.meta?.isOpenThink ?? savedFeat?.isOpenThink ?? bankSample?.meta?.isOpenThink ?? bankSample?.isOpen;
    const isOpenThink = explicitOpenThink !== undefined ? Boolean(explicitOpenThink) : /开源(?:可见)?思考/.test(tagStr);
    const rMatch = /闭源隐藏思考\(([\d.]+)段\/轮\)/.exec(tagStr);
    const nrMatch = /思考段:隐藏思考\(nr=(\d+)\)/.exec(tagStr);
    const pyMatch = /Python Heredoc\((\d+)次\)|Python几何自检脚本/.exec(tagStr);
    const pyHeredoc = pyMatch ? (parseInt(pyMatch[1], 10) || 2) : (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 4 : 0);
    const catMatch = /Cat Heredoc\((\d+)次\)/.exec(tagStr);
    const catHeredoc = catMatch ? (parseInt(catMatch[1], 10) || 1) : (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0);
    const wrMatch = /Write写文件\((\d+)次\)/.exec(tagStr);
    const writeFromTag = wrMatch ? (parseInt(wrMatch[1], 10) || 1) : 0;
    const htmlLenMatch = /HTML长文档输出\(([\d.]+)k字\)/.exec(tagStr);
    const writtenCharsFromTag = htmlLenMatch ? Math.round(parseFloat(htmlLenMatch[1]) * 1000) : 0;
    const askMatch = /ask_user意图澄清\((\d+)次\)/.exec(tagStr);
    const askUser = askMatch ? (parseInt(askMatch[1], 10) || 1) : 0;
    const rwMatch = /Read\/Edit精准改写\((\d+)\/(\d+)次\)/.exec(tagStr);
    const read = rwMatch ? parseInt(rwMatch[1], 10) : 0;
    const edit = rwMatch ? parseInt(rwMatch[2], 10) : 0;
    const parMatch = /并行工具步\((\d+)步\)/.exec(tagStr);
    const parallelSteps = parMatch ? parseInt(parMatch[1], 10) : 0;
    const durTagMatch = /单轮耗时[:(]\s*([\d.]+)\s*s/.exec(tagStr);
    const durFromTag = durTagMatch ? Math.round(parseFloat(durTagMatch[1]) * 1000) : 0;
    const chunkTagMatch = /流块[:(]\s*([\d.]+)\s*字/.exec(tagStr);
    const chunkFromTag = chunkTagMatch ? parseFloat(chunkTagMatch[1]) : 0;
    const cwFromTag = /缓存写入:(?:Claude|CW>0)/.test(tagStr) ? 12000 : 0;
    const wireFamFromTag = cwFromTag > 0 || /SSE思考块:tc_加密隐藏\(Claude/.test(tagStr)
      ? 'anthropic'
      : (/系统前缀:6603t|SSE思考块:tc_加密隐藏\(OpenAI|思考流:markers-only|零缓存写入:W=0/.test(tagStr) ? 'openai' : '');
    const reiTierMatch = /思考档位:(Low|Medium|High|xHigh|Max)\(REI=(\d+)\)/i.exec(tagStr);
    const tagReiTier = reiTierMatch ? reiTierMatch[1].toLowerCase() : '';
    const tagReiVal = reiTierMatch ? parseInt(reiTierMatch[2], 10) : 0;
    const thinkTokMatch = /隐藏思考Token:\+(\d+)/.exec(tagStr);
    const tagThinkTok = thinkTokMatch ? parseInt(thinkTokMatch[1], 10) : 0;
    const hasSys6603Tag = /系统前缀:6603t/.test(tagStr);
    const hasZeroCacheWriteTag = /零缓存写入:W=0/.test(tagStr);
    const hasBpeMatchTag = /BPE输出Token守恒吻合/.test(tagStr);
    const isLunaFastTag = /6-Luna极速思考特征/.test(tagStr);
    const isSol61Tag = /6\.1-Sol/.test(tagStr);
    const hasGeminiZeroRTag = /思考段:nr=0\(Gemini|行为习惯:静默连调Bash\(Gemini/.test(tagStr);
    const curDashMatch = /弯撇号(\d+)\/紧凑破折号(\d+)/.exec(tagStr);
    const curlyFromTag = curDashMatch ? (parseInt(curDashMatch[1], 10) || 0) : 0;
    const unspacedEmDashFromTag = curDashMatch ? (parseInt(curDashMatch[2], 10) || 0) : 0;
    const preNarrateTagMatch = /工具前先(?:报备|口播)\((?:Anthropic特征·)?(\d+)%\)/.exec(tagStr);
    const preNarrateFromTag = preNarrateTagMatch ? Math.min(1, parseInt(preNarrateTagMatch[1], 10) / 100) : 0;
    const sandboxLink = /sandbox:\/链接/.test(tagStr) ? 1 : 0;
    const lowerDoctype = /小写<!doctype>/i.test(tagStr) ? 1 : 0;
    const colorSchemeCss = /color-scheme/i.test(tagStr) ? 1 : 0;
    const svgSmilNoScript = /SMIL动画/i.test(tagStr) ? 1 : 0;
    const prefersReducedMotion = /reduced-motion/i.test(tagStr) ? 1 : 0;
    const cssRoot = /:root(?:✓|\/rAF✓)/.test(tagStr) ? 1 : 0;
    const geminiPyHelperFromTag = /Python几何自检脚本/.test(tagStr) ? 1 : 0;
    const inlineHtmlEchoFromTag = /写文件\+正文双发HTML/.test(tagStr) ? 1 : 0;
    const raf = /rAF✓/.test(tagStr) ? 1 : 0;
    const streamRBlocks = Number(modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? 0);
    const hasOpenAiHtmlOrR = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !KNOWN_ARGON_SIDS.has(sid) && !hasGeminiZeroRTag && (isKnownNonGoogle || Boolean(wireFamFromTag) || prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || colorSchemeCss > 0 || svgSmilNoScript > 0 || streamRBlocks > 0 || Boolean(nrMatch));
    const rPerTurn = (hasGeminiZeroRTag || KNOWN_ARGON_SIDS.has(sid))
      ? 0
      : rMatch
        ? parseFloat(rMatch[1])
        : nrMatch
          ? Math.max(0.5, parseInt(nrMatch[1], 10) / Math.max(1, Number(savedFeat?.turns || savedFeat?.meta?.turns) || 2))
          : ((!hasOpenAiHtmlOrR && /编码轮零思考块/.test(tagStr)) || (/无显式思考块/.test(tagStr) && !hasOpenAiHtmlOrR && (pyHeredoc > 0 || catHeredoc > 0 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))))
            ? 0
            : (streamRBlocks > 0 ? Math.max(0.5, streamRBlocks / Math.max(1, Number(savedFeat?.turns) || 2)) : 1.5);
    const scoreMatch = /推理分\s*([\d.]+)/.exec(tagStr);
    const habitReasoningScore = (modelEntry?.habitScore != null && Number.isFinite(+modelEntry.habitScore) && +modelEntry.habitScore >= 10 && +modelEntry.habitScore <= 100) ? +modelEntry.habitScore : (scoreMatch ? parseFloat(scoreMatch[1]) : 72.0);
    const isGeminiCoding = !isOpenThink && (
      KNOWN_ARGON_SIDS.has(sid) ||
      hasGeminiZeroRTag ||
      CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ||
      (!hasOpenAiHtmlOrR && (
        rPerTurn === 0 ||
        (rPerTurn <= 0.65 && (catHeredoc > 0 || pyHeredoc > 0) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0)
      ))
    );
    const hasHidR = (!isOpenThink && !isGeminiCoding && rPerTurn > 0) ? 1.0 : 0.0;
    const noR = isGeminiCoding ? 1.0 : 0.0;
    const editReadRatio = (edit + read) > 0 ? Math.min(1, (edit + read) / 10) : 0.0;
    const writeRatio = isGeminiCoding ? 0.25 : 0.22;
    const parallelRate = parallelSteps > 0 ? Math.min(1, parallelSteps / 8) : (isGeminiCoding ? 0.30 : 0.12);
    const pyHeroRate = pyHeredoc > 0 ? Math.min(1, 0.45 + pyHeredoc * 0.05) : 0.15;
    const catHeroRate = catHeredoc > 0 ? Math.min(1, 0.35 + catHeredoc * 0.05) : 0.10;
    let vec = (savedFeat && Array.isArray(savedFeat.vec) && savedFeat.vec.length === 20)
      ? [...savedFeat.vec]
      : [
          hasHidR, noR, 0.05, editReadRatio, writeRatio,
          parallelRate, pyHeroRate, catHeroRate, 0.08, 0.04,
          cssRoot ? 0.85 : 0.55, raf ? 0.85 : 0.55, 0.80, 0.30, 0.15,
          0.52, isGeminiCoding ? 0.86 : 0.55, isGeminiCoding ? 0.88 : 0.62, 0.68, 0.58,
        ];
    const isCorrupt4000MetaObj = m => Boolean(m && Number(m.meanChars) === 4000 && (Number(m.writtenChars) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.read) || 0) === 0 && (Number(m.edit) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) === 1 || Number(m.cps) === 2 || (Number(m.totalTools) === 0 && (Number(m.write) > 0 || Number(m.askUser) > 0))));
    const isUnloaded4500StubMeta = m => Boolean(m && Number(m.meanChars) === 4500 && (Number(m.writtenChars) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.bash) || 0) === 0 && (Number(m.askUser) || 0) === 0 && (Number(m.lowerDoctype) || 0) === 0 && (Number(m.colorSchemeCss) || 0) === 0 && (Number(m.prefersReducedMotion) || 0) === 0 && (Number(m.sandboxLink) || 0) === 0 && (Number(m.svgSmilNoScript) || 0) === 0);
    const isSyntheticStubVecObj = v => Array.isArray(v) && v.length === 20 && v[12] === 0.8 && v[15] === 0.52 && v[2] === 0.05 && v[3] === 0;
    const sfMetaCand = savedFeat?.meta || (savedFeat && typeof savedFeat.turns === 'number' && typeof savedFeat.writtenChars === 'number' ? savedFeat : null) || null;
    const bankMetaCand = bankSample?.meta || null;
    const rawSavedMeta = (sfMetaCand && !isCorrupt4000MetaObj(sfMetaCand) && (!isUnloaded4500StubMeta(sfMetaCand) || !bankMetaCand || isUnloaded4500StubMeta(bankMetaCand)))
      ? sfMetaCand
      : ((bankMetaCand && !isCorrupt4000MetaObj(bankMetaCand)) ? bankMetaCand : null);
    const isCorruptSyntheticMeta = Boolean(isCorrupt4000MetaObj(sfMetaCand) && (!bankMetaCand || isCorrupt4000MetaObj(bankMetaCand)));
    const savedMeta = isCorruptSyntheticMeta ? null : rawSavedMeta;
    if (Array.isArray(bankSample?.vec) && bankSample.vec.length === 20 && (!Array.isArray(savedFeat?.vec) || savedFeat.vec.length !== 20 || (isSyntheticStubVecObj(savedFeat.vec) && !isSyntheticStubVecObj(bankSample.vec)))) {
      vec = [...bankSample.vec];
    }
    const pickMeta = (k, def) => (savedMeta && savedMeta[k] !== undefined && savedMeta[k] !== null)
      ? savedMeta[k]
      : (savedFeat && savedFeat[k] !== undefined && savedFeat[k] !== null && !isCorruptSyntheticMeta)
        ? savedFeat[k]
        : def;
    const hasWriteHint = writeFromTag >= 1 || (savedFeat?.vec && Number(vec[4]) > 0);
    const rFracTurns = rMatch && parseFloat(rMatch[1]) > 0
      ? (Math.abs((parseFloat(rMatch[1]) * 2) % 2 - 1) < 0.08 ? 2 : ((Math.abs((parseFloat(rMatch[1]) * 3) % 3 - 1) < 0.15 || Math.abs((parseFloat(rMatch[1]) * 3) % 3 - 2) < 0.15) ? 3 : 0))
      : 0;
    const inferredTurnsFromTags = (nrMatch && rMatch && parseFloat(rMatch[1]) > 0)
      ? Math.max(1, Math.round(parseInt(nrMatch[1], 10) / parseFloat(rMatch[1])))
      : (rFracTurns > 0 ? Math.max(rFracTurns, askUser >= 1 && hasWriteHint ? askUser + 1 : 1) : (askUser >= 1 && hasWriteHint ? Math.max(2, askUser + 1) : (writeFromTag >= 2 ? 2 : 1)));
    const savedTurns = Number(pickMeta('turns', 0)) || inferredTurnsFromTags;
    const savedWCharsEarly = Number(pickMeta('writtenChars', writtenCharsFromTag || 0)) || 0;
    const savedHtmlMaxEarly = Number(pickMeta('htmlMaxLen', writtenCharsFromTag || 0)) || 0;
    const savedUNameEarly = Number(pickMeta('writeUnderscoreName', 0)) || 0;
    const revDimsStr = Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims || modelEntry?.reverseCandidates?.[0]?.dims)
      ? (modelEntry.reverseCandidates[0].matchedDims || modelEntry.reverseCandidates[0].dims).join(' | ')
      : '';
    const cpsMatch = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(revDimsStr + ' | ' + tagStr);
    const rawPickedCps = Number(pickMeta('cps', modelEntry?.streamEvidence?.cps || chat?._streamEvidence?.cps || (cpsMatch ? parseFloat(cpsMatch[1]) : 0))) || 0;
    const savedCps = ((rawPickedCps === 1 || rawPickedCps === 2) && cpsMatch && parseFloat(cpsMatch[1]) >= 10) ? parseFloat(cpsMatch[1]) : rawPickedCps;
    const earlyBash = Number(pickMeta('bash', pyHeredoc + catHeredoc)) || 0;
    const earlyWrite = Number(pickMeta('write', writeFromTag || 0)) || 0;
    const earlyAsk = Number(pickMeta('askUser', askUser)) || 0;
    const earlySearch = Number(pickMeta('search', 0)) || 0;
    const earlyStraightApos = Number(pickMeta('straightApostrophe', 0)) || 0;
    const rawHasOpenAiToolMarkers = Number(pickMeta('askSolSig', 0)) > 0 || Number(pickMeta('askIdBareIntent', 0)) > 0 || Number(pickMeta('askIdHasUnderscore', 0)) > 0 || (earlyBash >= 10 && earlySearch >= 1 && earlySearch < 10 && earlyAsk >= 1);
    const explicitNonGeminiMeta = savedMeta && savedMeta.isGeminiCoding === false && (rawHasOpenAiToolMarkers || (Number(pickMeta('memoAvgChunk', 0)) > 0 && Number(pickMeta('memoAvgChunk', 0)) <= 4.2 && Number(pickMeta('memoDeltaCount', 0)) >= 40));
    const hasOpenAiToolMarkers = !KNOWN_ARGON_SIDS.has(sid) && (CONFIRMED_SOL_61_SIDS.has(sid) || isSol61Tag || Boolean(explicitNonGeminiMeta) || (!hasGeminiZeroRTag && vec[0] === 1 && vec[1] === 0 && rawHasOpenAiToolMarkers));
    const earlyBoxComment = Number(pickMeta('boxComment', 0)) || 0;
    const isGeminiLargeHtml = !isOpenThink && !isKnownNonGoogle && !hasOpenAiHtmlOrR && !hasOpenAiToolMarkers && savedTurns === 2 && earlyWrite === 2 && earlyBash >= 1 && earlyBash <= 2 && earlyAsk === 0 && earlySearch === 0 && (earlyStraightApos === 0 || (savedWCharsEarly >= 44000 && earlyStraightApos <= 1)) && (savedWCharsEarly >= 26000 || savedHtmlMaxEarly >= 26000) && savedWCharsEarly <= 52000 && Number(pickMeta('lowerDoctype', lowerDoctype)) === 0 && Number(pickMeta('colorSchemeCss', colorSchemeCss)) === 0 && Number(pickMeta('prefersReducedMotion', prefersReducedMotion)) === 0 && Number(pickMeta('sandboxLink', sandboxLink)) === 0 && (earlyBoxComment === 0 || (savedWCharsEarly >= 44000 && earlyBoxComment <= 1)) && Number(pickMeta('claudeWarmPalette', 0)) === 0 && (savedCps >= 130 || savedUNameEarly >= 1 || Number(pickMeta('hidR', 0)) === 0);
    if (KNOWN_ARGON_SIDS.has(sid) || (!hasOpenAiToolMarkers && hasGeminiZeroRTag) || isGeminiLargeHtml) {
      vec[0] = 0;
      vec[1] = 1;
    } else if ((hasOpenAiHtmlOrR || hasOpenAiToolMarkers || (pyHeredoc === 0 && catHeredoc === 0 && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !Boolean(pickMeta('isGeminiCoding', false)) && (Boolean(rMatch) || Boolean(nrMatch) || Number(pickMeta('hidR', 0)) > 0))) && vec[0] === 0 && vec[1] === 1) {
      vec[0] = 1;
      vec[1] = 0;
    }
    const rawSavedHidR = Number(pickMeta('hidR', modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? ((isGeminiCoding || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch)) ? 0 : (nrMatch ? parseInt(nrMatch[1], 10) : Math.round(rPerTurn * savedTurns)))));
    const savedHidR = (KNOWN_ARGON_SIDS.has(sid) || isGeminiLargeHtml || hasGeminiZeroRTag || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch && isCorruptSyntheticMeta)) ? 0 : rawSavedHidR;
    const isZeroRHeavySearchGemini = !isOpenThink && !isKnownNonGoogle && savedHidR === 0 && earlySearch >= 10 && earlyBash >= 10;
    if (isZeroRHeavySearchGemini) {
      vec[0] = 0;
      vec[1] = 1;
    }
    const effIsGemini = (isKnownNonGoogle || hasOpenAiToolMarkers) ? false : Boolean(KNOWN_ARGON_SIDS.has(sid) || hasGeminiZeroRTag || isGeminiLargeHtml || isZeroRHeavySearchGemini || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch && isCorruptSyntheticMeta) || pickMeta('isGeminiCoding', vec[0] === 1 ? false : isGeminiCoding));
    const vecEditReadTotal = (!savedMeta && edit === 0 && read === 0 && savedFeat?.vec && Number(vec[3]) >= 0.45) ? Math.round(Number(vec[3]) * 10) : 0;
    const savedEdit = Math.max(Number(pickMeta('edit', 0)) || 0, edit || (vecEditReadTotal > 0 ? 1 : 0));
    const savedRead = Math.max(Number(pickMeta('read', 0)) || 0, read || (vecEditReadTotal > 1 ? vecEditReadTotal - 1 : 0));
    const savedSearch = Number(pickMeta('search', 0));
    const savedAskUser = Number(pickMeta('askUser', askUser));
    const rawMetaWrite = pickMeta('write', null);
    const defaultWrite = (savedFeat?.vec && Number(vec[4]) === 0) ? 0 : (writeFromTag || (effIsGemini ? 2 : 1));
    const savedWrite = (rawMetaWrite !== null && !(savedFeat?.vec && Number(vec[4]) === 0 && savedWCharsEarly === 0 && Number(rawMetaWrite) === 1 && Number(pickMeta('totalTools', 0)) <= 1))
      ? Number(rawMetaWrite)
      : defaultWrite;
    const inferredToolsFromVec = (savedFeat?.vec && Number(vec[4]) > 0 && Number(vec[4]) !== 0.22 && Number(vec[4]) !== 0.25 && savedWrite > 0)
      ? Math.max(savedWrite, Math.round(savedWrite / Number(vec[4])))
      : (savedWrite + savedEdit + savedRead + savedSearch + savedAskUser + pyHeredoc + catHeredoc);
    const defaultBash = Math.max(effIsGemini ? (hasGeminiZeroRTag ? 6 : 1) : 0, pyHeredoc + catHeredoc, inferredToolsFromVec - savedWrite - savedEdit - savedRead - savedSearch - savedAskUser);
    const savedBash = (savedMeta && savedMeta.bash !== undefined) ? Number(savedMeta.bash) : (hasGeminiZeroRTag ? Math.max(6, Number(pickMeta('bash', defaultBash))) : Number(pickMeta('bash', defaultBash)));
    if (!isOpenThink && !effIsGemini && vec[0] === 0 && vec[1] === 0) vec[0] = 1;
    const sumIndivTools = savedBash + savedWrite + savedEdit + savedRead + savedSearch + savedAskUser;
    const rawTotalTools = Number(pickMeta('totalTools', Math.max(inferredToolsFromVec, sumIndivTools)));
    const savedTotalTools = Math.max(rawTotalTools, sumIndivTools);
    const defaultMeanChars = savedFeat?.vec
      ? (savedWrite === 0 && Number(vec[17]) <= 0.12 ? 220 : Math.round((Number(vec[17]) || 0.3) * 4000))
      : (isGeminiCoding ? 32000 : 4500);
    const savedMeanChars = Number(pickMeta('meanChars', defaultMeanChars));
    const savedPreNarrate = (savedMeta && savedMeta.preNarrate !== undefined) ? Math.max(Number(savedMeta.preNarrate) || 0, preNarrateFromTag || 0) : Math.max(Number(pickMeta('preNarrate', 0)) || 0, preNarrateFromTag || 0, savedFeat?.vec ? (Number(vec[2]) ?? 0.05) : 0.05);
    const savedPreToolChars = Number(pickMeta('preToolTextChars', savedPreNarrate >= 0.4 ? 85 : 0));
    const rawSavedAvgDurMs = Number(pickMeta('avgTurnDurMs', durFromTag)) || durFromTag;
    const savedAvgDurMs = (rawSavedAvgDurMs > 0 && rawSavedAvgDurMs < 3600000) ? rawSavedAvgDurMs : 0;
    const savedAvgChunk = Number(pickMeta('memoAvgChunk', chunkFromTag)) || chunkFromTag;
    const savedDeltaCnt = Number(pickMeta('memoDeltaCount', savedAvgChunk > 0 ? 24 : 0)) || (savedAvgChunk > 0 ? 24 : 0);
    const effSavedCps = (savedCps > 0 && (rawSavedAvgDurMs === 0 || rawSavedAvgDurMs < 3600000))
      ? savedCps
      : 0;
    const cpsMissing = !(effSavedCps > 0);
    const abnormalDuration = Boolean(rawSavedAvgDurMs >= 3600000 || rawSavedAvgDurMs < 0);
    const sanitizedSavedWireFam = ((savedMeta?.wireFam === 'openai' && savedAvgChunk >= 4.0 && savedAvgChunk <= 25.0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && Number(pickMeta('askIdHasUnderscore', 0)) === 0) ||
      (savedMeta?.wireFam === 'anthropic' && (savedAvgChunk >= 15.0 || (Number(savedMeta?.prefersReducedMotion) >= 1 && Number(savedMeta?.boxComment) === 0 && Number(savedMeta?.claudeWarmPalette) === 0 && Number(savedMeta?.edit) === 0 && Number(savedMeta?.read) === 0) || (savedMeta?.htmlSvgMatch?.best?.vendorId && savedMeta.htmlSvgMatch.best.vendorId !== 'anthropic' && Number(savedMeta.htmlSvgMatch.best.ruleScore) >= 0.45))))
      ? ''
      : (savedMeta?.wireFam || '');
    const cleanSavedMeta = savedMeta ? {
      ...savedMeta,
      totalTools: savedTotalTools,
      write: savedWrite,
      read: savedRead,
      edit: savedEdit,
      bash: savedBash,
      preNarrate: savedPreNarrate,
      parallelSteps: Math.max(Number(savedMeta.parallelSteps) || 0, parallelSteps),
      avgTurnDurMs: savedAvgDurMs,
      wireFam: sanitizedSavedWireFam,
      cpsMissing,
      abnormalDuration,
      ...(savedAvgChunk > 0 ? { memoAvgChunk: savedAvgChunk, memoDeltaCount: savedDeltaCnt } : {}),
      ...(effSavedCps > 0 ? { cps: effSavedCps } : { cps: 0 }),
      ...(curlyFromTag > 0 && !(Number(savedMeta.curlyApostrophe) > 0) ? { curlyApostrophe: curlyFromTag } : {}),
      ...(unspacedEmDashFromTag > 0 && !(Number(savedMeta.unspacedEmDash) > 0) ? { unspacedEmDash: unspacedEmDashFromTag } : {}),
      ...((isGeminiLargeHtml || hasGeminiZeroRTag) ? { hidR: 0, maxRInTurn: 0, isGeminiCoding: true, ...(hasGeminiZeroRTag ? { bash: savedBash } : {}) } : {}),
      ...(((Number(savedMeta.turns) >= 2 && Math.max(Number(savedMeta.writtenChars) || 0, Number(savedMeta.htmlMaxLen) || 0) > 4500) || Math.max(Number(savedMeta.writtenChars) || 0, Number(savedMeta.htmlMaxLen) || 0) > 7500) ? { isMicroProbeChat: false } : {}),
      ...(Number(savedMeta.memoDeltaCount) > 0 && Number(savedMeta.memoDeltaCount) <= Math.max(2, (Number(savedMeta.turns) || 1) * 2) && Number(savedMeta.memoAvgChunk) > 220 && (Number(savedMeta.writtenChars) || 0) < 80000 ? { memoAvgChunk: 0 } : {}),
    } : null;
    const cleanedTags = tags
      .filter(t => !/^✓ 用户手动纠偏确认/.test(t) && !(effIsGemini && /^闭源隐藏思考/.test(t)));
    if (effIsGemini && !cleanedTags.some(t => /编码轮零思考块/.test(t))) {
      cleanedTags.unshift('编码轮零思考块(Gemini特征)');
    }
    return {
      turns: savedTurns,
      hidR: savedHidR,
      maxRInTurn: Number(pickMeta('maxRInTurn', Math.max(1, Math.round(savedHidR / Math.max(1, savedTurns))))),
      visR: isOpenThink ? 2 : 0,
      visRChars: isOpenThink ? 1200 : 0,
      codingTurns: effIsGemini ? 2 : 1,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      geminiPyHelper: Number(pickMeta('geminiPyHelper', geminiPyHelperFromTag || (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0))),
      inlineHtmlEcho: Number(pickMeta('inlineHtmlEcho', inlineHtmlEchoFromTag || (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0))),
      isGeminiCoding: effIsGemini,
      totalTools: savedTotalTools,
      toolsPerTurn: savedTotalTools / Math.max(1, savedTurns),
      rPerTurn: savedHidR / Math.max(1, savedTurns),
      cps: effSavedCps,
      avgTurnDurMs: savedAvgDurMs,
      memoAvgChunk: savedAvgChunk,
      memoDeltaCount: savedDeltaCnt,
      knownCwTok: Number(modelEntry?.reverseTokens?.cacheWrite || modelEntry?.reverseTotalTokens?.cacheWrite || cwFromTag || 0),
      bash: savedBash,
      write: savedWrite,
      edit: savedEdit,
      read: savedRead,
      present: 0,
      search: savedSearch,
      genImg: Number(pickMeta('genImg', 0)),
      askUser: savedAskUser,
      askUserIntent: Number(pickMeta('askUserIntent', 0)),
      askIdHasUnderscore: Number(pickMeta('askIdHasUnderscore', 0)),
      askIdBareIntent: Number(pickMeta('askIdBareIntent', 0)),
      askFormatOpt: Number(pickMeta('askFormatOpt', 0)),
      askTransformOpt: Number(pickMeta('askTransformOpt', 0)),
      askSolSig: Number(pickMeta('askSolSig', 0)),
      askSol56Sig: Number(pickMeta('askSol56Sig', 0)),
      parallelSteps: Number(pickMeta('parallelSteps', parallelSteps)),
      preNarrate: savedPreNarrate,
      pyHeredoc: Number(pickMeta('pyHeredoc', pyHeredoc)),
      catHeredoc: Number(pickMeta('catHeredoc', catHeredoc)),
      chainAnd: 0,
      rgSed: 0,
      cssRoot: Number(pickMeta('cssRoot', cssRoot)),
      raf: Number(pickMeta('raf', raf)),
      svgRich: Number(pickMeta('svgRich', (vec[12] || 0) > 0.45 ? 1 : 0)),
      boxComment: Number(pickMeta('boxComment', 0)),
      claudeWarmPalette: Number(pickMeta('claudeWarmPalette', 0)),
      htmlMaxLen: Number(pickMeta('htmlMaxLen', effIsGemini ? 65000 : (writtenCharsFromTag || 0))),
      writtenChars: Number(pickMeta('writtenChars', writtenCharsFromTag || (effIsGemini ? 65000 : 0))),
      lowerDoctype: Number(pickMeta('lowerDoctype', lowerDoctype)),
      colorSchemeCss: Number(pickMeta('colorSchemeCss', colorSchemeCss)),
      prefersReducedMotion: Number(pickMeta('prefersReducedMotion', prefersReducedMotion)),
      svgSmilNoScript: Number(pickMeta('svgSmilNoScript', svgSmilNoScript)),
      ariaLabelledby: Number(pickMeta('ariaLabelledby', 0)),
      sandboxLink: Number(pickMeta('sandboxLink', sandboxLink)),
      preToolTextChars: savedPreToolChars,
      interToolTextChars: Number(pickMeta('interToolTextChars', 0)),
      emDash: Number(pickMeta('emDash', 0)),
      cnColon: Number(pickMeta('cnColon', 0)),
      curlyApostrophe: Number(pickMeta('curlyApostrophe', curlyFromTag)),
      straightApostrophe: Number(pickMeta('straightApostrophe', 0)),
      unspacedEmDash: Number(pickMeta('unspacedEmDash', unspacedEmDashFromTag)),
      writeUnderscoreName: Number(pickMeta('writeUnderscoreName', 0)),
      checkmarkEmoji: Number(pickMeta('checkmarkEmoji', 0)),
      lunaNotSurePhrase: Number(pickMeta('lunaNotSurePhrase', 0)),
      solClarifyPhrase: Number(pickMeta('solClarifyPhrase', 0)),
      astraSelfContainedPhrase: Number(pickMeta('astraSelfContainedPhrase', 0)),
      terraPhrase: Number(pickMeta('terraPhrase', 0)),
      h2: 1,
      h3: 2,
      meanChars: savedMeanChars,
      nonCodeMeanChars: Number(pickMeta('nonCodeMeanChars', 0)),
      tableCount: Number(pickMeta('tableCount', 0)),
      listLineCount: Number(pickMeta('listLineCount', 0)),
      selfCheckCount: Number(pickMeta('selfCheckCount', 0)),
      codeDefensiveCount: Number(pickMeta('codeDefensiveCount', 0)),
      codeOmissionCount: Number(pickMeta('codeOmissionCount', 0)),
      thinkStepLines: Number(pickMeta('thinkStepLines', 0)),
      evalModality: String(pickMeta('evalModality', chat?.evalModality || (savedSearch > 0 ? 'search' : (savedWrite > 0 || savedEdit > 0 ? 'webdev' : 'chat')))),
      tierVec: Array.isArray(cleanSavedMeta?.tierVec) && cleanSavedMeta.tierVec.length === 12
        ? cleanSavedMeta.tierVec
        : Array.isArray(savedFeat?.tierVec) && savedFeat.tierVec.length === 12
          ? savedFeat.tierVec
          : [
            Math.min(1, (savedHidR / Math.max(1, savedTurns)) * 0.22),
            Math.min(1, (savedAvgDurMs / 1000) / 75),
            savedCps > 0 ? Math.max(0, Math.min(1, 1 - (savedCps - 18) / 165)) : 0.45,
            0.42,
            Math.min(1, (savedMeanChars / 4200) * 0.55),
            Math.min(1, 0.50 + (writtenCharsFromTag || savedMeanChars) / 24000),
            Math.min(1, (cssRoot + raf + prefersReducedMotion + colorSchemeCss) * 0.18),
            savedTotalTools > 0 ? Math.min(1, (savedTotalTools / Math.max(1, savedTurns)) / 9) : 0.35,
            Math.min(1, parallelSteps * 0.25 + savedPreNarrate * 0.40),
            savedSearch > 0 ? Math.min(1, savedSearch * 0.25) : 0.30,
            0.78,
            Math.min(1, Math.max(0.1, (habitReasoningScore - 20) / 78)),
          ].map(v => Math.round((Number(v) || 0) * 1000) / 1000),
      ...(cleanSavedMeta || {}),
      isGeminiCoding: effIsGemini,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      isOpenThink,
      wireFam: wireFamFromTag || cleanSavedMeta?.wireFam || '',
      tagReiTier,
      tagReiVal,
      tagThinkTok,
      hasSys6603Tag,
      hasZeroCacheWriteTag,
      hasBpeMatchTag,
      isLunaFastTag,
      isSol61Tag,
      vec,
      habitReasoningScore,
      habitTags: cleanedTags.length ? cleanedTags : ['编码轮零思考块(Gemini特征)', `推理分 ${habitReasoningScore}`],
    };
  }

  function extractFeatures(chat, modelEntry = null, opts = {}) {
    if (!chat && !modelEntry) return null;
    const ignoreExactSid = Boolean(opts?.ignoreExactSid);
    const allowIncomplete = Boolean(opts?.allowIncomplete);
    const preferLatestTurn = Boolean(opts?.preferLatestTurn || chat?._preferLatestTurn);
    const sidKey = String(chat?.sid || modelEntry?.sid || '');
    const allMsgs = Array.isArray(chat?.messages) ? chat.messages : [];
    const lastM = allMsgs.at(-1);
    const lastP = lastM?.parts?.at(-1);
    const lastPLen = typeof lastP?.text === 'string' ? lastP.text.length : (typeof lastP?.inputText === 'string' ? lastP.inputText.length : 0);
    const mRef = ignoreExactSid ? modelEntry : (modelEntry || (sidKey && typeof Models !== 'undefined' ? Models.get(sidKey) : null));
    const msgDigest = computeMessagesDigest(allMsgs);
    const featCacheKey = sidKey ? `${sidKey}:${allMsgs.length}:${lastM?.id || ''}:${lastM?.parts?.length || 0}:${msgDigest}:${chat?.busy ? (lastPLen >> 8) : lastPLen}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}:${ignoreExactSid ? 1 : 0}:${allowIncomplete ? 1 : 0}:${calibRev}:${allMsgs.length ? 0 : `${mRef?.name || ''}:${mRef?.userCorrected ? 1 : 0}:${mRef?.reverseScore || 0}:${mRef?.habitTags?.length || 0}:${bankRev}:${mRef?.habitFeatures?.meta?.cps || 0}:${mRef?.habitFeatures?.meta?.avgTurnDurMs || 0}:${mRef?.habitFeatures?.meta?.writtenChars || 0}`}` : '';
    if (featCacheKey && _featCache.has(sidKey) && _featCache.get(sidKey).key === featCacheKey) {
      return _featCache.get(sidKey).val;
    }
    const compMsgs = (chat && typeof globalThis.ArenaBilling !== 'undefined' && typeof globalThis.ArenaBilling.completed === 'function')
      ? globalThis.ArenaBilling.completed(chat)
      : allMsgs.filter(m => m && m.role === 'assistant' && m.status !== 'failed' && !m.failed && m.status !== 'pending' && m.status !== 'streaming' && !m.metadata?.pending && !m._incomplete).slice(-3);
    const nonFailedAsst = allMsgs.filter(m => m && m.role === 'assistant' && m.status !== 'failed' && !m.failed);
    const settledAsst = nonFailedAsst.filter(m => m.status !== 'pending' && m.status !== 'streaming' && !m.metadata?.pending && !m._incomplete);
    const fromIncompleteTurn = Boolean(compMsgs.length === 0 && settledAsst.length === 0 && nonFailedAsst.length > 0);
    const rawAsstPool = compMsgs.length ? compMsgs : (settledAsst.length ? settledAsst : ((chat?.busy || allowIncomplete) ? nonFailedAsst : []));
    let asstMsgs = rawAsstPool.slice(-3);
    if (!preferLatestTurn && !opts?.forRoutePostSlice && !chat?._forRoutePostSlice && rawAsstPool.length >= 2) {
      let lastHtmlCodingIdx = -1;
      for (let i = 0; i < rawAsstPool.length; i++) {
        const m = rawAsstPool[i];
        let maxHtmlInTurn = 0;
        const mTxt = String(m?.text || '');
        if (/<!doctype html|<html\b|<svg\b/i.test(mTxt)) maxHtmlInTurn = Math.max(maxHtmlInTurn, mTxt.length);
        for (const p of (m?.parts || [])) {
          if (p?.type === 'text' && /<!doctype html|<html\b|<svg\b/i.test(String(p.text || ''))) maxHtmlInTurn = Math.max(maxHtmlInTurn, String(p.text || '').length);
          const pIn = p?.input || p?.args || null;
          const pContent = String(pIn?.content || pIn?.new_text || pIn?.code || '');
          if (pContent && /<!doctype html|<html\b|<svg\b/i.test(pContent)) maxHtmlInTurn = Math.max(maxHtmlInTurn, pContent.length);
        }
        for (const tc of (m?.tools || [])) {
          const tIn = tc?.input || tc?.args || null;
          const tContent = String(tIn?.content || tIn?.new_text || tIn?.code || '');
          if (tContent && /<!doctype html|<html\b|<svg\b/i.test(tContent)) maxHtmlInTurn = Math.max(maxHtmlInTurn, tContent.length);
        }
        if (maxHtmlInTurn >= 1000) lastHtmlCodingIdx = i;
      }
      if (lastHtmlCodingIdx >= 0 && lastHtmlCodingIdx < rawAsstPool.length - 1) {
        const postTurns = rawAsstPool.slice(lastHtmlCodingIdx + 1);
        const postHasToolsOrOpenThink = postTurns.some(pm => {
          if (typeof pm?.think === 'string' && /[^\s.…·。]/.test(pm.think.trim())) return true;
          if (typeof pm?.text === 'string' && /<think>[\s\S]*[^\s.…·。][\s\S]*<\/think>/i.test(pm.text)) return true;
          if (Array.isArray(pm?.tools) && pm.tools.length > 0) return true;
          for (const pp of (pm?.parts || [])) {
            if (!pp) continue;
            if ((pp.type === 'reasoning' || pp.type === 'thinking') && /[^\s.…·。]/.test(String(pp.text || pp.reasoning || pp.thinking || '').trim())) return true;
            if (pp.toolCallId || pp.type === 'dynamic-tool' || (typeof pp.type === 'string' && pp.type.startsWith('tool-') && pp.type !== 'tool-result')) return true;
          }
          return false;
        });
        if (!postHasToolsOrOpenThink) {
          asstMsgs = rawAsstPool.slice(0, lastHtmlCodingIdx + 1).slice(-3);
        }
      }
    }
    if (!asstMsgs.length) {
      const mFallback = mRef;
      const savedOut = extractFeaturesFromSaved(chat, mFallback, { ignoreExactSid });
      if (featCacheKey) {
        if (_featCache.size > 64) _featCache.delete(_featCache.keys().next().value);
        _featCache.set(sidKey, { key: featCacheKey, val: savedOut });
      }
      return savedOut;
    }

    let hidR = 0, visR = 0, visRChars = 0, maxRInTurn = 0;
    let codingTurns = 0, codingTurnsNoR = 0, codingTurnsWithHidR = 0, geminiPyHelper = 0, inlineHtmlEcho = 0;
    let nonCodeTurns = 0, nonCodeChars = 0;
    let bash = 0, write = 0, edit = 0, read = 0, present = 0, search = 0, askUser = 0, askUserIntent = 0, otherTools = 0;
    let stepStarts = 0, parallelSteps = 0, toolTurns = 0, preTextTurns = 0, silentToolTurns = 0;
    let preToolTextChars = 0, interToolTextChars = 0;
    let pyHeredoc = 0, catHeredoc = 0, chainAnd = 0, rgSed = 0, gitCmd = 0;
    let cssRoot = 0, raf = 0, svgRich = 0, boxComment = 0, htmlMaxLen = 0, writtenChars = 0, claudeWarmPalette = 0;
    let bestHtmlSvgCode = "";
    let finalArtifactCode = "";
    let lowerDoctype = 0, colorSchemeCss = 0, prefersReducedMotion = 0, svgSmilNoScript = 0, ariaLabelledby = 0, sandboxLink = 0;
    let emDash = 0, cnColon = 0, curlyApostrophe = 0, unspacedEmDash = 0, h2 = 0, h3 = 0, totalChars = 0, codeBlocks = 0;
    let askQCount = 0, askOptTotal = 0, askDescChars = 0, askDescCount = 0, askPeriodCount = 0, askIdHasUnderscore = 0, askIdBareIntent = 0;
    let askFormatOpt = 0, askTransformOpt = 0, askSolSig = 0, askSol56Sig = 0;
    let lunaNotSurePhrase = 0, solClarifyPhrase = 0, astraSelfContainedPhrase = 0, terraPhrase = 0;
    let straightApostrophe = 0, writeUnderscoreName = 0, genImg = 0, checkmarkEmoji = 0;
    let msgFmtTN = 0, msgFmtTChars = 0, msgFmtTidCount = 0, msgFmtTidChars = 0, msgFmtRWireDeltas = 0, hasLiveMsgFmt = false;
    let wireFam = '';
    // 全模态（文字/图片/视频/代码网页/搜索）与同家族档位微差统计量（仅针对最近 3 轮对话）
    let tableCount = 0, listLineCount = 0, selfCheckCount = 0, thinkStepLines = 0, thinkDurSumMs = 0, thinkDurCount = 0;
    let codeOmissionCount = 0, codeDefensiveCount = 0;
    let searchSourcesCount = 0, citationCount = 0, mediaImgCount = 0, mediaVideoCount = 0;
    let bashReadFiles = 0, bashEditFiles = 0, bashSearchOps = 0, bashTestRuns = 0, bashBuildRuns = 0, editAddedLines = 0, editDeletedLines = 0;
    const turnRichnessArr = [];
    const recentUserMsgs = allMsgs.filter(m => m && m.role === 'user').slice(-3);
    const firstUserMsg = recentUserMsgs[0] || allMsgs.find(m => m && m.role === 'user');
    const firstUserTxt = String(firstUserMsg?.text || (Array.isArray(firstUserMsg?.parts) ? firstUserMsg.parts.map(p => p?.text || '').join(' ') : '') || '');
    const recentUserTextAll = recentUserMsgs.map(u => String(u?.text || (Array.isArray(u?.parts) ? u.parts.map(p => p?.text || '').join(' ') : '') || '')).join('\n');
    const promptConstraintHits = (recentUserTextAll.match(/必须|不要|严格|完整|详细|对比|证明|推导|步步|架构|并发|边界|优化|must|strictly|complete|comprehensive|edge case|architecture|step-by-step|benchmark/gi) || []).length;
    const promptCodeHits = (recentUserTextAll.match(/```|<html|function\b|def\s+\w+|SELECT\s+|class\s+\w+/gi) || []).length;
    const promptEntropy = Math.max(0.28, Math.min(1.0, 0.30 + Math.min(0.42, recentUserTextAll.length / 1800) + Math.min(0.18, promptConstraintHits * 0.045) + Math.min(0.10, promptCodeHits * 0.05)));
    const isMicroProbePrompt = Boolean(chat?._isMicroProbe || chat?.gacha?.mode === 'habit' || modelEntry?.habitFeatures?.meta?.isMicroProbeChat || /35[～~-]45\s*行以内|50\s*行以内|微缩面板|动态\s*SVG\s*状态徽章|动态内联\s*SVG\s*(?:几何图标|指示器|徽标)/i.test(firstUserTxt));

    const scanCodeRigor = (src) => {
      if (!src) return;
      codeOmissionCount += (src.match(/\/\/\s*\.\.\.\s*(?:existing|rest|unchanged|same|省略|其余|保持不变)|#\s*\.\.\.\s*(?:existing|rest|省略)|\/\*\s*\.\.\.\s*(?:rest|省略)?\s*\*\//gi) || []).length;
      codeDefensiveCount += (src.match(/\btry\s*\{|\bcatch\s*\(|\baria-[a-z-]+|\bprefers-reduced-motion\b|\bNumber\.isFinite\b|\bResizeObserver\b|\bIntersectionObserver\b|\bAbortController\b|\brequestAnimationFrame\b/g) || []).length;
    };

    const scanHtmlHabits = (src, preferFinal = false) => {
      if (!src) return;
      scanCodeRigor(src);
      if (!/<!doctype html|<html\b|<svg\b/i.test(src)) return;
      if (src.length > htmlMaxLen) htmlMaxLen = src.length;
      if (src.length > bestHtmlSvgCode.length && (/<svg\b/i.test(src) || src.length >= 260)) bestHtmlSvgCode = src;
      if (preferFinal && (/<svg\b/i.test(src) || src.length >= 260)) finalArtifactCode = src;
      if (/<svg\b/i.test(src) || src.length >= 3800) {
        turnHtmlSvgList.push({ idx: curTurnIdx, code: src });
      }
      if (/:root\s*\{/.test(src)) cssRoot++;
      if (/requestAnimationFrame/.test(src)) raf++;
      if (/<(?:linearGradient|radialGradient|filter)\b/.test(src)) svgRich++;
      if (/\/\*\s*[─═=-]{2,}/.test(src)) boxComment++;
      if (/^\s*<!doctype html>/.test(src) && !/^\s*<!DOCTYPE html>/.test(src)) lowerDoctype++;
      if (/color-scheme\s*:/i.test(src)) colorSchemeCss++;
      if (/prefers-reduced-motion/i.test(src)) prefersReducedMotion++;
      if (/<animateTransform\b|<animateMotion\b/i.test(src) && !/<script\b/i.test(src)) svgSmilNoScript++;
      if (/aria-labelledby\s*=/i.test(src)) ariaLabelledby++;
      if (/#FAF8F5|#F5F2EB|Instrument Serif|Playfair Display/i.test(src)) claudeWarmPalette++;
    };

    const turnHtmlSvgList = [];
    let curTurnIdx = 0;
    const scanTextHabits = (txt, preferFinal = false) => {
      if (!txt) return;
      totalChars += txt.length;
      const fenceMatches = txt.match(/^```/gm);
      if (fenceMatches && fenceMatches.length >= 2) {
        codeBlocks += Math.floor(fenceMatches.length / 2);
      } else if (/<!DOCTYPE html|<html\b/i.test(txt)) {
        codeBlocks += 1;
      }
      tableCount += Math.min(12, Math.floor((txt.match(/^\|.+\|$/gm) || []).length / 2));
      listLineCount += (txt.match(/^[\t ]*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
      selfCheckCount += (txt.match(/边界条件|注意(?:事项|点)|验证(?:如下|结果)|极端情况|权衡|edge case|caveat|trade-?off|corner case|sanity check|let['’]s verify|double-check/gi) || []).length;
      citationCount += (txt.match(/\[\d+\]\([^)]+\)|\[\^?\d+\]|【\d+†/g) || []).length;
      emDash += (txt.match(/——|\s—\s/g) || []).length;
      cnColon += (txt.match(/\*\*[^*\n]{1,24}\*\*：|(?:已完成|绘制完成)：\*\*/g) || []).length;
      curlyApostrophe += (txt.match(/[A-Za-z]\u2019[A-Za-z]/g) || []).length;
      straightApostrophe += (txt.match(/[A-Za-z]'[A-Za-z]/g) || []).length;
      unspacedEmDash += (txt.match(/[A-Za-z0-9]\u2014[A-Za-z0-9]/g) || []).length;
      if (/✅/.test(txt)) checkmarkEmoji++;
      if (/sandbox:\/home\/user\//i.test(txt)) sandboxLink++;
      if (/cut off or is part of a puzzle|what you['’]d like me to do with/i.test(txt)) askUserIntent++;
      if (/\bI['’]m not sure what you['’]d like me to do with\b|Agent Mode\s*助手|你好！有什么我可以帮你|我无法确认这次对话具体由哪一个模型|\u2014format\b|\bWhat would you like me to do with these words\b|\bor format them as a list\b|\bcryptocurrency recovery phrase\b|\bI received:\s*\u201c/i.test(txt)) lunaNotSurePhrase++;
      if (!/\bIs this a coded message,\s*a word puzzle/i.test(txt) && /\bCould you clarify what you['’]d like me to do with\b|\bIs this a (?:code|word puzzle|coded message|word-code puzzle)\b|\bWould you like me to decode\b|\bAre you asking me to decode\b|\bI['’]m not sure what you(?:\s+mean\b|['’]re asking\b)|\bI don['’]t recognize a clear meaning\b|你说的“瓦茨”/i.test(txt)) solClarifyPhrase++;
      if (/\bI['’]ll create a self-contained HTML\b|\bIs this a coded message,\s*a word puzzle/i.test(txt)) astraSelfContainedPhrase++;
      if (/\btransformation or puzzle rule\b|\bIt looks like an encoded phrase or word puzzle\b|\bI['’]m not sure how to interpret that sequence\b|\bcipher\/puzzle\b/i.test(txt)) terraPhrase++;
      if (/我是\s*Arena\.ai\s*上的一个智能助手（Agent Mode）|我无法向你透露当前底层具体使用的模型/i.test(txt)) askSol56Sig++;
      h2 += (txt.match(/^##\s+/gm) || []).length;
      h3 += (txt.match(/^###\s+/gm) || []).length;
      scanHtmlHabits(txt, preferFinal);
    };

    for (let _mIdx = 0; _mIdx < asstMsgs.length; _mIdx++) {
      const m = asstMsgs[_mIdx];
      curTurnIdx = _mIdx;
      const isLastAsstTurn = _mIdx === asstMsgs.length - 1;
      const parts = Array.isArray(m?.parts) ? m.parts : [];
      let turnHasTool = false, seenToolInTurn = false, preTextInTurn = false;
      let curStepTools = 0, turnPreChars = 0, pendingBetweenChars = 0;
      let turnHidR = 0, turnVisR = 0, turnWrite = 0, turnEdit = 0, turnCodeBash = 0, turnInlineHtmlChars = 0, turnTextChars = 0;
      for (const p of parts) {
        if (!p) continue;
        const ty = String(p.type || '');
        if (ty === 'step-start') {
          if (curStepTools >= 2) parallelSteps++;
          curStepTools = 0;
          stepStarts++;
        } else if (ty === 'reasoning') {
          const rt = String(p.text || '').trim();
          if (/[^\s.…·。]/.test(rt)) {
            visR++;
            turnVisR++;
            visRChars += rt.length;
            thinkStepLines += Math.max(1, (rt.match(/\n+|(?:^|\s)(?:1\.|step\s*\d|首先|其次|再看)/gi) || []).length);
          } else {
            hidR++;
            turnHidR++;
            thinkStepLines += 1;
          }
          const rDur = Number(p.durationMs || p.thinkingMs || p.metadata?.durationMs || 0);
          if (rDur > 50 && rDur < 600000) {
            thinkDurSumMs += rDur;
            thinkDurCount++;
          }
        } else if (ty === 'source-url' || ty === 'source' || ty === 'grounding' || p.url && p.sourceId) {
          searchSourcesCount++;
        } else if (ty === 'image' || p.image || p.imageUrl || (ty === 'file' && /^image\//i.test(String(p.mediaType || p.mimeType || '')))) {
          mediaImgCount++;
        } else if (ty === 'video' || p.videoUrl || (ty === 'file' && /^video\//i.test(String(p.mediaType || p.mimeType || '')))) {
          mediaVideoCount++;
        } else if (ty === 'text') {
          const txt = String(p.text || '');
          const tTrim = txt.trim();
          turnTextChars += txt.length;
          if (!seenToolInTurn) {
            turnPreChars += tTrim.length;
            if (tTrim.length > 8) preTextInTurn = true;
          } else {
            pendingBetweenChars += tTrim.length;
          }
          if (/<!DOCTYPE html|<html\b|<svg\b/i.test(txt)) turnInlineHtmlChars += txt.length;
          scanTextHabits(txt, Boolean(preferLatestTurn && isLastAsstTurn));
        } else if (ty.startsWith('tool-') || ty === 'dynamic-tool' || p.toolCallId) {
          if (seenToolInTurn && pendingBetweenChars > 0) {
            interToolTextChars += pendingBetweenChars;
            pendingBetweenChars = 0;
          }
          turnHasTool = true;
          seenToolInTurn = true;
          curStepTools++;
          const tName = String(p.toolName || ty.replace(/^tool-/, '') || '').toLowerCase();
          const tcId = String(p.toolCallId || p.id || '');
          if (!wireFam && tcId) {
            if (/^(?:toolu|srvtoolu|msg)_01/.test(tcId)) wireFam = 'anthropic';
            else if (/^call_[A-Za-z0-9]{24}$/.test(tcId) && !/^call_[0-9a-f]{24}$/.test(tcId)) wireFam = 'openai';
            else if (/^call_\d+_/.test(tcId)) wireFam = 'deepseek';
            else if (/^functions\.|_\d+_[0-9a-f]{6,}/.test(tcId)) wireFam = 'kimi';
          }
          const inp = p.input || {};
          if (tName === 'bash' || tName === 'execute_command') {
            bash++;
            const cmd = String(inp.command || '');
            if (/python3?\s+-\s*<<|python3?\s+-c\b|python3?\s+\S+\.py\b/.test(cmd)) { pyHeredoc++; turnCodeBash++; }
            if (/cat\s+<<|<<\s*['"]?EOF/.test(cmd)) { catHeredoc++; turnCodeBash++; }
            if (/\btest_(?:geometry|kinematics|ik|pelican|render|svg|math|anim)\w*\.py\b|\bdef\s+test_ik\b|\brm\s+-f\s+test_\w+\.py\b/i.test(cmd)) {
              geminiPyHelper++;
            }
            if (/&&/.test(cmd)) chainAnd++;
            if (/\b(?:rg|grep|sed|awk)\b/.test(cmd)) rgSed++;
            if (/\bgit\s+/.test(cmd)) gitCmd++;
            if (typeof CmdTranslate !== 'undefined' && CmdTranslate.describe) {
              try {
                const cd = CmdTranslate.describe(cmd, inp.cwd || '');
                const co = cd.ops || {};
                bashReadFiles += Array.isArray(co.read) ? co.read.length : 0;
                bashEditFiles += Array.isArray(co.edit) ? co.edit.length : 0;
                bashSearchOps += Number(co.search) || 0;
                if (Array.isArray(cd.acts)) {
                  if (cd.acts.includes('跑测试')) bashTestRuns++;
                  if (cd.acts.some(a => /^(构建|打包|编译|语法检查)/.test(a))) bashBuildRuns++;
                }
                if (cd.stat) {
                  editAddedLines += Number(cd.stat.add) || 0;
                  editDeletedLines += Number(cd.stat.del) || 0;
                }
              } catch {}
            } else {
              if (/\b(?:cat|head|tail|sed\s+-n)\s+\S/.test(cmd)) bashReadFiles++;
              if (/(?:>|tee\s+|sed\s+-i|open\([^)]*['"][wa])/.test(cmd)) bashEditFiles++;
              if (/\b(?:grep|rg|find|fd|ls)\b/.test(cmd)) bashSearchOps++;
              if (/\b(?:pytest|jest|vitest|mocha|node\s+--test|npm\s+(?:run\s+)?test)\b/.test(cmd)) bashTestRuns++;
              if (/\b(?:node\s+--check|py_compile|tsc|npm\s+run\s+(?:build|package))\b/.test(cmd)) bashBuildRuns++;
            }
            scanHtmlHabits(cmd);
          } else if (tName === 'write_file') {
            write++;
            turnWrite++;
            const fpath = String(inp.path || inp.file_path || '');
            if (/[a-z]+_[a-z]+\.html$/i.test(fpath)) writeUnderscoreName++;
            const content = String(inp.content || '');
            writtenChars += content.length;
            if (content) editAddedLines += content.split('\n').length;
            scanHtmlHabits(content, m === asstMsgs.at(-1));
          } else if (tName === 'edit_file') {
            edit++;
            turnEdit++;
            const ot = String(inp.old_text ?? inp.old_string ?? '');
            const nt = String(inp.new_text ?? inp.new_string ?? '');
            writtenChars += nt.length;
            if (typeof CmdTranslate !== 'undefined' && CmdTranslate.lineDiff) {
              const df = CmdTranslate.lineDiff(ot, nt);
              editAddedLines += Number(df.add) || 0;
              editDeletedLines += Number(df.del) || 0;
            } else if (ot || nt) {
              editAddedLines += nt ? nt.split('\n').length : 0;
              editDeletedLines += ot ? ot.split('\n').length : 0;
            }
            scanHtmlHabits(nt);
          } else if (tName === 'read_file') {
            read++;
          } else if (tName === 'present_file') {
            present++;
          } else if (tName === 'generate_image') {
            genImg++;
            otherTools++;
          } else if (tName === 'ask_user') {
            askUser++;
            const qs = Array.isArray(inp.questions) ? inp.questions : [];
            const qJson = JSON.stringify(qs);
            if (/"id":\s*"(?:format|transcribe|organize|repeat|remember|speak)"|clean up|punctuation|dictat|speech-to-text|clean list|readable transcription|clean,\s*readable|item\/quantity/i.test(qJson)) {
              askFormatOpt++;
            }
            if (/"id":\s*"(?:transform|data|verify)"|known cipher|process it as data/i.test(qJson)) {
              askTransformOpt++;
            }
            if (/"id":\s*"(?:password|reformat)"|Decode\s*\/\s*solve/i.test(qJson)) {
              askSol56Sig++;
            }
            if (/"id":\s*"[a-z]+_[a-z]+"|"id":\s*"(?:interpret|reference)"|poem,\s*story,\s*or other creative|Rephrase the question|Explain the task or provide|I[’']ll explain what I mean|Clarify what you intended|Please explain what you[’']re asking|The sequence represents a|Look for a pattern or decode a hidden message/i.test(qJson)) {
              askSolSig++;
            }
            for (const q of qs) {
              askQCount++;
              const qid = String(q?.id || '');
              const qtxt = String(q?.question || '');
              if (/[a-z]+_[a-z]+/i.test(qid)) askIdHasUnderscore++;
              else if (/^(?:intent|task)$/i.test(qid)) askIdBareIntent++;
              if (/^(?:intent|sequence_intent|phrase_intent|word_intent)$/i.test(qid) || /what would you like me to do with/i.test(qtxt)) {
                askUserIntent++;
              }
              const opts = Array.isArray(q?.options) ? q.options : [];
              askOptTotal += opts.length;
              for (const o of opts) {
                const d = String(o?.description || '').trim();
                if (d) {
                  askDescCount++;
                  askDescChars += d.length;
                  if (/[.。!！]$/.test(d)) askPeriodCount++;
                }
              }
            }
          } else if (tName.includes('search') || tName === 'fetch_page') {
            search++;
          } else {
            otherTools++;
          }
        }
      }
      const mf = m?._fmt || m?.fmt || null;
      if (mf && typeof mf === 'object') {
        const mfTN = Number(mf.tN) || 0;
        const mfTChars = Number(mf.tChars) || 0;
        msgFmtTN += mfTN;
        msgFmtTChars += mfTChars;
        msgFmtTidCount += Number(mf.tidCount) || 0;
        msgFmtTidChars += Number(mf.tidChars) || 0;
        msgFmtRWireDeltas += Number(mf.rWireDeltas || mf.rE || mf.rChunks) || 0;
        if (mfTN > 0 || Array.isArray(mf.rs) || Array.isArray(mf.ids)) hasLiveMsgFmt = true;
        if (turnHidR === 0 && turnVisR === 0) {
          const mfRs = Array.isArray(mf.rs)
            ? mf.rs
            : (Array.isArray(mf.ids) ? mf.ids.filter(x => x && x[0] === 'r').map(x => ({ id: x[1], chars: 0 })) : []);
          if (mfRs.length > 0 && !(Number(mf.rChars) > 0)) {
            turnHidR += mfRs.length;
            hidR += mfRs.length;
          }
        }
      }
      if (turnHidR > maxRInTurn) maxRInTurn = turnHidR;
      if (curStepTools >= 2) parallelSteps++;
      if (turnWrite > 0 && turnInlineHtmlChars >= (isMicroProbePrompt ? 500 : 12000)) {
        inlineHtmlEcho++;
      }
      if (turnWrite > 0 || turnEdit > 0 || turnCodeBash > 0 || turnInlineHtmlChars >= (isMicroProbePrompt ? 500 : 8000)) {
        codingTurns++;
        if (turnHidR === 0 && turnVisR === 0) codingTurnsNoR++;
        else if (turnHidR > 0 && turnVisR === 0) codingTurnsWithHidR++;
      } else {
        const rawTxtLen = turnTextChars || (m.text ? String(m.text).length : 0);
        if (rawTxtLen > 0) {
          nonCodeTurns++;
          nonCodeChars += rawTxtLen;
        }
      }
      if (turnHasTool) {
        toolTurns++;
        preToolTextChars += turnPreChars;
        if (preTextInTurn) preTextTurns++;
        else silentToolTurns++;
      }
      if (!pHasParts(parts) && m.text) {
        const mTxt = String(m.text || '');
        turnTextChars += mTxt.length;
        scanTextHabits(mTxt);
      }
      if (Array.isArray(m?.webdev?.files)) {
        for (const wf of m.webdev.files) {
          const wfc = String(wf?.content || '');
          if (wfc) scanHtmlHabits(wfc, m === asstMsgs.at(-1));
        }
      }
      if (Array.isArray(m?.sources)) searchSourcesCount += m.sources.length;
      if (Array.isArray(m?.citations)) searchSourcesCount += m.citations.length;
      if (Array.isArray(m?.experimental_attachments)) {
        for (const att of m.experimental_attachments) {
          const ct = String(att?.contentType || att?.mimeType || '');
          if (/^image\//i.test(ct)) mediaImgCount++;
          else if (/^video\//i.test(ct)) mediaVideoCount++;
        }
      }
      const mThinkMs = Number(m?.metadata?.timing?.thinkingMs || m?.metadata?.thinkingDurationMs || 0);
      if (mThinkMs > 50 && mThinkMs < 600000) {
        thinkDurSumMs += mThinkMs;
        thinkDurCount++;
      }
      turnRichnessArr.push(turnTextChars + (turnWrite + turnEdit + turnCodeBash) * 420 + (turnHidR + turnVisR) * 140);
    }

    function pHasParts(arr) { return Array.isArray(arr) && arr.length > 0; }
    function uuidV7Ms(id) {
      const hex = String(id || '').replace(/-/g, '');
      if (hex.length !== 32 || !/^[0-9a-f]{32}$/i.test(hex)) return 0;
      const ms = parseInt(hex.slice(0, 12), 16);
      return (ms > 1700000000000 && ms < 2100000000000) ? ms : 0;
    }

    const turns = Math.max(1, asstMsgs.length);
    const totalTools = bash + write + edit + read + present + search + askUser + otherTools;
    const sidStr = ignoreExactSid ? '' : String(chat?.sid || modelEntry?.sid || '');
    let sseMemoObj = (typeof window !== 'undefined' && window.__atiSseMemo instanceof Map && sidStr) ? (window.__atiSseMemo.get(sidStr) || null) : null;
    try {
      if (!sseMemoObj && sidStr && typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const rawMemo = localStorage.getItem('ati.v4.sseMemo.' + sidStr);
        if (rawMemo) sseMemoObj = JSON.parse(rawMemo);
      }
    } catch {}
    const mKnown = modelEntry || (sidStr && typeof Models !== 'undefined' ? Models.get(sidStr) : null);
    const bankMatchRaw = sidStr ? getBankSampleBySid(sidStr) : null;
    const bankMatch = (bankMatchRaw && (bankMatchRaw.userConfirmed || bankMatchRaw.importedFromDiag)) ? bankMatchRaw : null;
    const mKnownName = String(bankMatch?.model || '');
    const isEvalChat = Boolean(chat?.isEvaluation || chat?.evalMode === 'battle' || chat?.evalMode === 'direct' || chat?.battleSide || /#[ab]$/i.test(sidStr));
    const evalHintName = String(modelEntry?.name || modelEntry?.rawLabel || chat?.revealedModelName || chat?.directModelName || (isEvalChat ? mKnownName : '') || '').trim();
    if (isEvalChat && visR > 0 && visRChars === 0) {
      hidR += visR;
      if (maxRInTurn < visR) maxRInTurn = visR;
      visR = 0;
    } else if (!isEvalChat && visR > 0 && visRChars < 320 && (askIdHasUnderscore > 0 || askUserIntent > 0 || askSolSig > 0)) {
      hidR += visR;
      if (maxRInTurn < visR) maxRInTurn = visR;
      visR = 0;
      visRChars = 0;
    }
    const isFlash38LowIdentity = !isEvalChat && turns === 1 && totalTools === 0 && visR === 1 && visRChars < 1500 && totalChars >= 180 && totalChars <= 320;
    if (isFlash38LowIdentity) {
      visR = 0;
    }
    const thinkSt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    if (!bestHtmlSvgCode && !finalArtifactCode && Array.isArray(allMsgs) && allMsgs.length > asstMsgs.length) {
      for (const m of allMsgs) {
        if (!m || m.role !== "assistant" || !Array.isArray(m.tools)) continue;
        for (const t of m.tools) {
          const nm = String(t?.name || "").toLowerCase();
          if (nm === "write_file" || nm === "create_file" || nm === "edit_file" || nm === "write_to_file") {
            const fp = String(t?.input?.path || t?.input?.file_path || t?.input?.TargetFile || t?.input?.filename || "");
            const content = String(t?.input?.content || t?.input?.code || t?.input?.new_text || t?.input?.CodeContent || "");
            if (content.length >= 180 && (/.(?:html?|svg)$/i.test(fp) || /<(?:!doctypes+html|html|svg)/i.test(content))) {
              if (content.length > bestHtmlSvgCode.length) bestHtmlSvgCode = content;
            }
          }
        }
      }
    }
    let htmlSvgRoutePivot = null;
    if (turnHtmlSvgList.length >= 2 && turnHtmlSvgList[0].idx !== turnHtmlSvgList[turnHtmlSvgList.length - 1].idx) {
      const firstItem = turnHtmlSvgList[0];
      const lastItem = turnHtmlSvgList[turnHtmlSvgList.length - 1];
      const firstHm = classifyHtmlSvg(firstItem.code, { isOpenThink: false, strictOpenClosed: false });
      const lastHm = classifyHtmlSvg(lastItem.code, { isOpenThink: false, strictOpenClosed: false });
      const firstBest = firstHm?.best || null;
      const lastBest = lastHm?.best || null;
      if (firstBest && lastBest && (firstBest.confidence || 0) >= 0.85 && (lastBest.confidence || 0) >= 0.85 && firstBest.model_id !== lastBest.model_id && (firstBest.vendorId !== lastBest.vendorId || preferLatestTurn)) {
        htmlSvgRoutePivot = {
          fromModel: firstBest.canon || firstBest.model_id,
          toModel: lastBest.canon || lastBest.model_id,
          fromVendor: firstBest.vendorId,
          toVendor: lastBest.vendorId,
          fromConf: firstBest.confidence,
          toConf: lastBest.confidence,
        };
        finalArtifactCode = lastItem.code;
      } else if (preferLatestTurn && lastItem?.code) {
        finalArtifactCode = lastItem.code;
      }
    } else if (preferLatestTurn && turnHtmlSvgList.length === 1) {
      finalArtifactCode = turnHtmlSvgList[0].code;
    }
    const isOpenThink = isEvalChat
      ? Boolean(visR > 0 && visRChars > 0)
      : Boolean(visR > 0 || (thinkSt?.kind === 'compat-thinking' && !chat?._closedLockedModel));
    const chosenHtmlSvgCode = (finalArtifactCode && (/<svg\b/i.test(finalArtifactCode) || finalArtifactCode.length >= 3800)) ? finalArtifactCode : bestHtmlSvgCode;
    let htmlSvgMatch = (chosenHtmlSvgCode && chosenHtmlSvgCode.length >= 60 && (/<svg\b/i.test(chosenHtmlSvgCode) || chosenHtmlSvgCode.length >= 3800))
      ? classifyHtmlSvg(chosenHtmlSvgCode, { isOpenThink, strictOpenClosed: !isEvalChat })
      : null;
    let htmlSvgSig = htmlSvgMatch?.features?.sig12 || null;
    const topRevCand = null;
    const msgFmtAvgChunk = (msgFmtTN >= 3 && msgFmtTChars > 0) ? Math.round((msgFmtTChars / msgFmtTN) * 10) / 10 : 0;
    const msgFmtTidAvg = (msgFmtTidCount >= 4 && msgFmtTidChars > 0) ? Math.round((msgFmtTidChars / msgFmtTidCount) * 10) / 10 : 0;
    const isLiveOpenAiFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && ((msgFmtTN >= 15 && msgFmtAvgChunk >= 1.0 && msgFmtAvgChunk <= 3.8) || (msgFmtTN < 6 && msgFmtTidCount >= 18 && msgFmtTidAvg > 0 && msgFmtTidAvg <= 4.2));
    const isLiveGeminiFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && !isLiveOpenAiFmt && msgFmtTN >= 3 && (msgFmtTN / Math.max(1, turns)) <= 28 && msgFmtAvgChunk >= 28.0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && prefersReducedMotion === 0 && claudeWarmPalette === 0 && boxComment === 0;
    const isLiveNonClaudeFmt = Boolean(
      (hidR === 0 && msgFmtRWireDeltas === 0 && msgFmtTidCount === 0 && turns === 1 && write === 1 && totalTools === 1 && writtenChars >= 35000 && prefersReducedMotion >= 1 && boxComment === 0) ||
      (msgFmtRWireDeltas === 0 && msgFmtTidCount > 0 && msgFmtTidCount <= 6 && msgFmtTidAvg >= 1800 && hidR >= 2) ||
      (hidR >= 2 && (msgFmtAvgChunk >= 15.0 || (prefersReducedMotion >= 1 && boxComment === 0 && claudeWarmPalette === 0 && edit === 0 && read === 0))) ||
      (htmlSvgMatch?.best?.vendorId && htmlSvgMatch.best.vendorId !== 'anthropic' && Number(htmlSvgMatch.best.ruleScore) >= 0.45)
    );
    const isLiveClaudeFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && !isLiveOpenAiFmt && !isLiveGeminiFmt && !isLiveNonClaudeFmt && ((msgFmtTN >= 15 && msgFmtAvgChunk >= 4.0 && msgFmtAvgChunk <= 25.0) || (msgFmtTN >= 6 && msgFmtAvgChunk >= 4.0 && msgFmtAvgChunk <= 25.0 && hidR > 0) || (msgFmtTidCount > 0 && msgFmtTidCount <= 8 && !(msgFmtTN >= 3 && msgFmtAvgChunk >= 28.0))) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0;
    if (isLiveGeminiFmt) {
      hidR = 0;
      maxRInTurn = 0;
      codingTurnsNoR = Math.max(codingTurnsNoR, turns);
      codingTurnsWithHidR = 0;
      wireFam = '';
    } else if (isLiveOpenAiFmt) {
      wireFam = 'openai';
      if (hidR === 0) {
        hidR = Math.max(1, turns);
        maxRInTurn = Math.max(1, maxRInTurn);
        if (codingTurns > 0) { codingTurnsWithHidR = codingTurns; codingTurnsNoR = 0; }
      }
    } else if (isLiveClaudeFmt) {
      wireFam = 'anthropic';
      if (hidR === 0) {
        hidR = Math.max(1, turns);
        maxRInTurn = Math.max(1, maxRInTurn);
        if (codingTurns > 0) { codingTurnsWithHidR = codingTurns; codingTurnsNoR = 0; }
      }
    }
    const knownRBlocks = hasLiveMsgFmt
      ? hidR
      : Number(chat?._streamEvidence?.rBlocks || mKnown?.streamEvidence?.rBlocks || sseMemoObj?.reasoningBlocks || 0);
    const knownCwTok = 0;
    const isKnownGoogleName = /gemini|google|argon|barium/i.test(mKnownName);
    const hasDefiniteGoogleBash =
      (isLiveGeminiFmt ||
       (!isEvalChat && hasLiveMsgFmt && !isLiveOpenAiFmt && !isLiveClaudeFmt && hidR === 0 && visR === 0 && (msgFmtAvgChunk >= 28.0 || (totalTools > 0 && msgFmtTN === 0))) ||
       (turns >= 3 && totalTools >= 10 && hidR === 0 && visR === 0 && knownRBlocks === 0) ||
       (write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0 && boxComment === 0) ||
       ((pyHeredoc > 0 || catHeredoc > 0 || geminiPyHelper > 0 || inlineHtmlEcho > 0) && hidR === 0 && visR === 0 && knownRBlocks === 0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0)) &&
      wireFam !== 'openai' && wireFam !== 'anthropic' && !/gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName);
    const hasNonGoogleEvidence = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) && !isKnownGoogleName && !hasDefiniteGoogleBash && (
        knownRBlocks > 0 ||
        /gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName) ||
        wireFam === 'openai' ||
        wireFam === 'anthropic' ||
        prefersReducedMotion > 0 ||
        colorSchemeCss > 0 ||
        lowerDoctype > 0 ||
        svgSmilNoScript > 0 ||
        ariaLabelledby > 0 ||
        sandboxLink > 0 ||
        askUserIntent > 0 ||
        solClarifyPhrase > 0 ||
        lunaNotSurePhrase > 0 ||
        astraSelfContainedPhrase > 0 ||
        (terraPhrase > 0 && totalChars < 350) ||
        (curlyApostrophe > 0 && totalTools === 0 && totalChars < 350) ||
        (Number(sseMemoObj?.textDeltaCount || 0) === 1 && totalTools === 0 && totalChars < 140) ||
        (write >= 1 && pyHeredoc === 0 && catHeredoc === 0 && geminiPyHelper === 0 && inlineHtmlEcho === 0 && bash === 0) ||
        (askUser > 0 && pyHeredoc === 0 && catHeredoc === 0) ||
        (cnColon >= 2 && !(write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0)) ||
        (boxComment >= 1 && !(write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0 && claudeWarmPalette === 0)) ||
        (htmlSvgMatch?.best?.vendorId && htmlSvgMatch.best.vendorId !== 'google' && Number(htmlSvgMatch.best.ruleScore || 0) >= 0.55)
      )
    );
    const sseExplicitNoReasoning = Boolean(sseMemoObj && sseMemoObj.sawReasoning === false && Number(sseMemoObj.reasoningBlocks || 0) === 0);
    if (!isOpenThink && hidR === 0 && visR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (pyHeredoc === 0 || lowerDoctype > 0 || sandboxLink > 0 || prefersReducedMotion > 0 || knownRBlocks > 0) && (catHeredoc === 0 || prefersReducedMotion > 0 || knownRBlocks > 0)) {
      if (!isEvalChat && (!sseExplicitNoReasoning || sandboxLink > 0 || lowerDoctype > 0 || askIdHasUnderscore > 0 || askUserIntent > 0)) {
        hidR = knownRBlocks > 0 ? knownRBlocks : Math.max(turns, codingTurns * 2 || turns);
        if (maxRInTurn === 0) maxRInTurn = Math.max(1, Math.round(hidR / turns));
        if (codingTurns > 0) {
          codingTurnsWithHidR = codingTurns;
          codingTurnsNoR = 0;
        }
      }
    } else if (!isEvalChat && !isOpenThink && hidR > 0 && codingTurns > 0 && codingTurnsWithHidR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || knownRBlocks > 0)) {
      codingTurnsWithHidR = codingTurns;
      codingTurnsNoR = 0;
    }
    const isGeminiCoding = !isOpenThink && (
      CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) ||
      (isEvalChat ? false : (
        hasDefiniteGoogleBash ||
        (!hasNonGoogleEvidence && (hidR === 0 && visR === 0)) ||
        (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0) ||
        geminiPyHelper > 0 ||
        inlineHtmlEcho > 0 ||
        (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0 && (catHeredoc > 0 || pyHeredoc > 0) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0 && (askUser === 0 || hidR === 0))
      ))
    );

    // 从最近 3 轮消息 timing / UUIDv7 时间戳 / streamEvidence 提取单轮耗时与流式吐字速度 cps（严禁加载更早轮次）
    let durSumMs = 0, durCount = 0;
    const recentAsstSet = new Set(asstMsgs);
    for (let i = 0; i < allMsgs.length; i++) {
      const m = allMsgs[i];
      if (!m || m.role !== 'assistant' || !recentAsstSet.has(m)) continue;
      const tm = m.metadata?.timing;
      if (tm?.startedAt && tm?.completedAt && tm.completedAt > tm.startedAt) {
        durSumMs += Math.min(3600000, tm.completedAt - tm.startedAt);
        durCount++;
        continue;
      }
      const prevU = i > 0 && allMsgs[i - 1]?.role === 'user' ? allMsgs[i - 1] : null;
      const tStart = uuidV7Ms(prevU?.id) || uuidV7Ms(sidStr) || uuidV7Ms(m.id);
      const nextM = i + 1 < allMsgs.length ? allMsgs[i + 1] : null;
      const tEnd = uuidV7Ms(m.id) > tStart + 300 ? uuidV7Ms(m.id) : (uuidV7Ms(nextM?.id) > tStart && uuidV7Ms(nextM?.id) - tStart < 600000 ? uuidV7Ms(nextM?.id) : 0);
      if (tStart > 0 && tEnd > tStart + 250 && tEnd - tStart < 3600000) {
        durSumMs += (tEnd - tStart);
        durCount++;
      }
    }
    const streamEv = chat?._streamEvidence || modelEntry?.streamEvidence || null;
    const avgTurnDurMs = durCount > 0
      ? Math.round(durSumMs / durCount)
      : Number(streamEv?.turnDurationMs || streamEv?.thinkDurationMs || chat?.fmt?.turnMs) || 0;
    const avgThinkDurMs = thinkDurCount > 0
      ? Math.round(thinkDurSumMs / thinkDurCount)
      : Number(streamEv?.thinkDurationMs || 0);
    const meanChars = (totalChars + writtenChars * 0.85) / turns;
    const nonCodeMeanChars = nonCodeTurns > 0 ? Math.round(nonCodeChars / nonCodeTurns) : Math.round(meanChars);
    const rPerTurn = (hidR + visR * 0.85) / turns;
    const memoDeltaCountEarly = Number(msgFmtTN || chat?.fmt?.tN || sseMemoObj?.textDeltaCount || 0);
    const fmtAvgChunkEarly = msgFmtAvgChunk > 0
      ? msgFmtAvgChunk
      : ((Number(chat?.fmt?.tN) >= 3 && Number(chat?.fmt?.tChars) > 0) ? Math.round((Number(chat.fmt.tChars) / Number(chat.fmt.tN)) * 10) / 10 : 0);
    const memoAvgChunkEarly = fmtAvgChunkEarly > 0
      ? fmtAvgChunkEarly
      : Number(sseMemoObj?.avgChunk || streamEv?.avgChunk || (memoDeltaCountEarly > 0 && Number(sseMemoObj?.textDeltaChars) > 0 ? Math.round((Number(sseMemoObj.textDeltaChars) / memoDeltaCountEarly) * 10) / 10 : 0) || 0);
    if (Math.max(writtenChars || 0, htmlMaxLen || 0) < 1000 && (Number(mRef?.habitFeatures?.meta?.htmlMaxLen || 0) >= 4000 || Number(mRef?.habitFeatures?.meta?.writtenChars || 0) >= 4500)) {
      htmlMaxLen = Math.max(htmlMaxLen, Number(mRef.habitFeatures.meta.htmlMaxLen || 0));
      writtenChars = Math.max(writtenChars, Number(mRef.habitFeatures.meta.writtenChars || 0));
      if (!htmlSvgSig && mRef.habitFeatures.meta.htmlSvgSig) htmlSvgSig = mRef.habitFeatures.meta.htmlSvgSig;
      if (!htmlSvgMatch && mRef.habitFeatures.meta.htmlSvgMatch) htmlSvgMatch = mRef.habitFeatures.meta.htmlSvgMatch;
    }
    const codeSpanLen = Math.max(writtenChars || 0, htmlMaxLen || 0);
    const isMicroProbeChat = Boolean(!((turns >= 2 && codeSpanLen > 4500) || codeSpanLen > 7500) && (isMicroProbePrompt || (turns <= 3 && codingTurns >= 1 && codeSpanLen >= 80 && codeSpanLen <= 9500 && (svgRich > 0 || svgSmilNoScript > 0 || cssRoot > 0 || raf > 0 || colorSchemeCss > 0 || prefersReducedMotion > 0 || lowerDoctype > 0 || boxComment > 0 || htmlMaxLen >= 80))));
    const hasCompactMultiTurnSurge = (HAIKU_55_MEDIUM_SIDS.has(sidStr) || (!isEvalChat && wireFam === 'anthropic' && nonCodeMeanChars <= 450 && rPerTurn <= 0.8)) && nonCodeTurns >= 2 && codingTurns === 1 && nonCodeMeanChars <= 850 && rPerTurn <= 1.5 && totalTools <= 3 && bash === 0 && edit === 0 && writeUnderscoreName === 0 && lunaNotSurePhrase === 0 && sandboxLink === 0 && boxComment === 0 && !(prefersReducedMotion > 0 && ariaLabelledby > 0 && cnColon === 0) && (memoDeltaCountEarly === 0 || memoAvgChunkEarly >= 10);
    const effMeanChars = hasCompactMultiTurnSurge ? nonCodeMeanChars : meanChars;
    const revDimsArr = topRevCand?.matchedDims || topRevCand?.dims || [];
    const dimCpsMatch = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(Array.isArray(revDimsArr) ? revDimsArr.join(' | ') : '');
    const cps = Number(streamEv?.cps || streamEv?.textCps || (dimCpsMatch ? parseFloat(dimCpsMatch[1]) : 0)) > 0
      ? Number(streamEv?.cps || streamEv?.textCps || (dimCpsMatch ? parseFloat(dimCpsMatch[1]) : 0))
      : (avgTurnDurMs >= 800 && meanChars >= 40)
        ? Math.round((meanChars / (avgTurnDurMs / 1000)) * 10) / 10
        : 0;

    const hasHidR = (hidR > 0 && !isOpenThink && !isGeminiCoding) ? 1.0 : 0.0;
    const noR = ((hidR === 0 && visR === 0) || isGeminiCoding) ? 1.0 : 0.0;
    const preNarrate = toolTurns > 0 ? Math.min(1, preTextTurns / toolTurns) : 0.06;
    const editReadRatio = totalTools > 0 ? Math.min(1, (edit + read) / totalTools) : 0;
    const writeRatio = totalTools > 0 ? Math.min(1, (write + present * 0.5) / totalTools) : 0;
    const parallelRate = stepStarts > 0 ? Math.min(1, (parallelSteps / Math.max(1, stepStarts)) * 2.2) : 0;
    const pyHeroRate = bash > 0 ? Math.min(1, pyHeredoc / bash) : 0;
    const catHeroRate = bash > 0 ? Math.min(1, catHeredoc / bash) : 0;
    const chainAndRate = bash > 0 ? Math.min(1, chainAnd / bash) : 0;
    const rgSedRate = bash > 0 ? Math.min(1, rgSed / bash) : 0;
    const cssRootScore = hasCompactMultiTurnSurge ? 0.45 : (cssRoot > 0 ? Math.min(1, 0.55 + cssRoot * 0.15) : 0.35);
    const rafScore = hasCompactMultiTurnSurge ? 0.40 : ((raf > 0 || svgSmilNoScript > 0) ? Math.min(1, 0.55 + (raf + svgSmilNoScript) * 0.15) : 0.35);
    const svgRichScore = hasCompactMultiTurnSurge ? 0.45 : ((svgRich > 0 || ariaLabelledby > 0) ? Math.min(1, 0.55 + (svgRich + ariaLabelledby) * 0.15) : 0.35);
    const boxCommentScore = boxComment > 0 ? Math.min(1, 0.60 + boxComment * 0.15) : 0.25;
    const emDashRate = Math.min(1, ((emDash + unspacedEmDash) / turns) / 5);
    const cnColonRate = Math.min(1, (cnColon / turns) / 6);
    const h3Pref = (h2 + h3) > 0 ? (h3 / (h2 + h3)) : 0.5;
    const charScale = isMicroProbeChat
      ? Math.min(1, Math.max(0.32, (effMeanChars + htmlMaxLen * 0.85) / 2600))
      : Math.min(1, Math.max(0.1, (effMeanChars + (hasCompactMultiTurnSurge ? 0 : htmlMaxLen * 0.45)) / 14000));
    const stepScale = Math.min(1, ((hidR + visR + totalTools) / turns) / (isMicroProbeChat ? 6 : 14));
    const meanDurSec = avgTurnDurMs > 0 ? (avgTurnDurMs / 1000) : Math.min(360, 12 + (totalTools / turns) * 14 + (hidR / turns) * 8);
    const durScale = hasCompactMultiTurnSurge ? 0.32 : isMicroProbeChat ? Math.min(1, Math.max(0.28, meanDurSec / 26)) : Math.min(1, meanDurSec / 120);

    const vec = [
      hasHidR, noR, preNarrate, editReadRatio, writeRatio,
      parallelRate, pyHeroRate, catHeroRate, chainAndRate, rgSedRate,
      cssRootScore, rafScore, svgRichScore, boxCommentScore, emDashRate,
      cnColonRate, h3Pref, charScale, stepScale, durScale,
    ];

    // Compute 0-100 Reasoning Score (`推理分`) from behavioral depth so strength is always quantified even without /cost
    const toolsPerTurn = totalTools / turns;
    const htmlLenBonus = isMicroProbeChat ? (Math.max(htmlMaxLen, writtenChars) / 360) : (htmlMaxLen / 2400);
    const rawHtmlDepthBonus = htmlLenBonus + (cssRoot > 0 ? 2.5 : 0) + (raf > 0 || svgSmilNoScript > 0 ? 3.5 : 0) + (colorSchemeCss > 0 ? 2.0 : 0) + (prefersReducedMotion > 0 ? 2.0 : 0) + (ariaLabelledby > 0 ? 1.5 : 0) + (isMicroProbeChat && svgRich > 0 ? 1.5 : 0);
    const htmlDepthBonus = hasCompactMultiTurnSurge ? (rawHtmlDepthBonus * 0.18) : rawHtmlDepthBonus;
    const searchDepthBonus = Math.min(8, searchSourcesCount * 0.8 + citationCount * 0.55 + tableCount * 0.8);
    const proseRigorBonus = Math.min(6, selfCheckCount * 1.1 + codeDefensiveCount * 0.7 - codeOmissionCount * 1.4);
    const rawReasonScore = 38
      + Math.min(25, rPerTurn * 4.2)
      + Math.min(18, toolsPerTurn * 2.2)
      + Math.min(8, parallelSteps * 1.8)
      + Math.min(13, htmlDepthBonus)
      + Math.min(6, effMeanChars / 2200)
      + Math.max(0, searchDepthBonus * 0.45 + proseRigorBonus * 0.45);
    const habitReasoningScore = Math.round(Math.max(22, Math.min(98.5, rawReasonScore)) * 10) / 10;

    // 自动判定当前会话所属的全模态类型（文字 chat / 代码网页 webdev / 搜索 search / 图片 image / 视频 video）
    const explicitMod = String(chat?.evalModality || modelEntry?.evalModality || '').trim().toLowerCase();
    const evalModality = explicitMod && /^(?:chat|webdev|search|image|video|agent)$/.test(explicitMod)
      ? explicitMod
      : (mediaVideoCount > 0)
        ? 'video'
        : (mediaImgCount > 0 || genImg > 0)
          ? 'image'
          : (searchSourcesCount > 0 || search > 0 || citationCount >= 2)
            ? 'search'
            : (codingTurns > 0 || htmlMaxLen >= 200 || codeBlocks >= 2)
              ? 'webdev'
              : 'chat';

    // 多轮上下文持久度（2~3 轮时末轮相对于首轮的信息与工具完整度，区分 High/Max 与 Medium/Low）
    const multiTurnPersistence = turnRichnessArr.length >= 2
      ? Math.max(0.15, Math.min(1.0, (turnRichnessArr.at(-1) || 1) / Math.max(120, turnRichnessArr[0] || 1)))
      : 0.78;

    // 12 维同家族档位微差判别子空间向量 tierVec[0..11]（专用于分离 opus-5.5-medium vs high、sol-medium vs high 等）
    const tierVec = [
      Math.min(1, (rPerTurn * 0.22) + (thinkStepLines / turns) * 0.06 + (visRChars / turns) / 2400),
      Math.min(1, (meanDurSec / Math.max(0.45, promptEntropy * 75))),
      cps > 0 ? Math.max(0, Math.min(1, 1 - (cps - 18) / 165)) : durScale,
      Math.min(1, ((h2 + h3) * 1.5 + tableCount * 2.5 + listLineCount * 0.35 + cnColon * 0.4) / Math.max(1, turns * 14)),
      Math.min(1, (selfCheckCount * 0.26 + emDashRate * 0.34 + (effMeanChars / 4200) * 0.40)),
      (codingTurns > 0 || codeBlocks > 0 || htmlMaxLen > 0)
        ? Math.max(0, Math.min(1, 0.55 + Math.min(0.45, Math.max(htmlMaxLen, writtenChars, totalChars) / 18000) - codeOmissionCount * 0.28))
        : charScale,
      Math.min(1, (codeDefensiveCount * 0.14 + cssRoot * 0.16 + raf * 0.18 + svgRich * 0.16 + prefersReducedMotion * 0.18 + colorSchemeCss * 0.18)),
      totalTools > 0 ? Math.min(1, (toolsPerTurn / 9) * 0.55 + editReadRatio * 0.45) : (stepScale * 0.75),
      totalTools > 0 ? Math.min(1, parallelRate * 0.60 + preNarrate * 0.40) : Math.min(1, rPerTurn / 5),
      (searchSourcesCount > 0 || citationCount > 0 || search > 0)
        ? Math.min(1, (searchSourcesCount * 0.12 + citationCount * 0.09 + search * 0.18 + tableCount * 0.12))
        : Math.min(1, (h2 + h3 + listLineCount * 0.2) / 10),
      Math.round(multiTurnPersistence * 1000) / 1000,
      Math.min(1, Math.max(0.08, ((habitReasoningScore - 20) / 78) / Math.max(0.55, promptEntropy))),
    ].map(v => Math.round((Number(v) || 0) * 1000) / 1000);

    const anomalous = Boolean(
      chat?.status === 'error' ||
      (avgTurnDurMs > 180000 && meanChars < 120 && totalTools === 0) ||
      (meanChars < 12 && totalTools === 0 && mediaImgCount === 0 && mediaVideoCount === 0)
    );
    // Human-readable matched habit tags for UI transparency
    const habitTags = [];
    if (isOpenThink) habitTags.push(`开源可见思考(${visR}段)`);
    else if (isGeminiCoding && hidR > 0 && codingTurnsNoR > 0) habitTags.push(`编码轮零思考块(Gemini特征·${codingTurnsNoR}轮)`);
    else if (hidR === 0) habitTags.push('无显式思考块(快照特征)');
    else habitTags.push(`闭源隐藏思考(${(hidR / turns).toFixed(1)}段/轮)`);

    if (cps > 0) habitTags.push(`流式速度(${Math.round(cps)}字/秒)`);
    else if (avgTurnDurMs > 0) habitTags.push(`单轮耗时(${(avgTurnDurMs / 1000).toFixed(1)}s)`);
    if (geminiPyHelper > 0) habitTags.push('Python几何自检脚本(Gemini特征)');
    if (inlineHtmlEcho > 0) habitTags.push('写文件+正文双发HTML(Gemini特征)');
    if (sandboxLink > 0 || lowerDoctype > 0) {
      habitTags.push(`OpenAI特征(${sandboxLink > 0 ? 'sandbox:/链接' : ''}${sandboxLink > 0 && lowerDoctype > 0 ? '+' : ''}${lowerDoctype > 0 ? '小写<!doctype>' : ''})`);
    }
    if (svgSmilNoScript > 0 || colorSchemeCss > 0 || prefersReducedMotion > 0) {
      habitTags.push(`HTML特征(${svgSmilNoScript > 0 ? 'SMIL动画' : ''}${colorSchemeCss > 0 ? '·color-scheme' : ''}${prefersReducedMotion > 0 ? '·reduced-motion' : ''})`);
    }
    if (askUser > 0) {
      habitTags.push(`ask_user意图澄清(${askUser}次)`);
    }
    if (toolTurns > 0) {
      if (preNarrate >= 0.45) habitTags.push(`工具前先报备(Anthropic特征·${Math.round(preNarrate * 100)}%)`);
      else if (silentToolTurns > 0) habitTags.push(`0字静默直调工具(${Math.round((silentToolTurns / toolTurns) * 100)}%)`);
    }
    if (edit + read >= 3) habitTags.push(`Read/Edit精准改写(${read}/${edit}次)`);
    if (parallelSteps > 0) habitTags.push(`并行工具步(${parallelSteps}步)`);
    if (pyHeredoc > 0) habitTags.push(`Python Heredoc(${pyHeredoc}次)`);
    if (catHeredoc > 0) habitTags.push(`Cat Heredoc(${catHeredoc}次)`);
    if (chainAnd >= 2) habitTags.push(`Bash && 链式(${chainAnd}次)`);
    if (bashReadFiles + bashEditFiles >= 2) habitTags.push(`Bash读写(读${bashReadFiles}/改${bashEditFiles})`);
    if (bashTestRuns > 0) habitTags.push(`跑测试验证(${bashTestRuns}次)`);
    if (edit > 0 && (editAddedLines > 0 || editDeletedLines > 0)) habitTags.push(`行级改写(+${editAddedLines}/−${editDeletedLines})`);
    if (cssRoot > 0 || raf > 0) habitTags.push(`HTML习惯(:root${cssRoot ? '✓' : ''}/rAF${raf ? '✓' : ''})`);
    if (cnColon >= 2 || emDash >= 2) habitTags.push(`行文(**冒号**${cnColon}/破折号${emDash})`);
    else if (curlyApostrophe >= 1 || unspacedEmDash >= 1) habitTags.push(`英文标点(弯撇号${curlyApostrophe}/紧凑破折号${unspacedEmDash})`);
    if (isMicroProbeChat) habitTags.push('微缩探针');

    if (htmlSvgMatch?.best && (htmlSvgMatch.best.ruleScore >= 0.48 || (htmlSvgMatch.code_type === "html_svg" && htmlSvgMatch.features.bytes >= 3800 && htmlSvgMatch.best.protoSim >= 0.80) || (htmlSvgMatch.code_type === "svg32" && htmlSvgMatch.features.viewBox === "0 0 32 32" && htmlSvgMatch.best.protoSim >= 0.82))) {
      const hmBest = htmlSvgMatch.best;
      habitTags.push(`🦩 代码指纹(${hmBest.familyLabel}${hmBest.effort && hmBest.effort !== "standard" ? "·" + hmBest.effortLabel : ""})`);
    }
    if (memoDeltaCountEarly >= 4 && memoAvgChunkEarly > 0) habitTags.push(`流块(${memoAvgChunkEarly}字)`);
    habitTags.push(`推理分 ${habitReasoningScore}`);

    const askOptsAvg = askQCount > 0 ? Math.round((askOptTotal / askQCount) * 10) / 10 : 0;
    const askDescAvg = askDescCount > 0 ? Math.round(askDescChars / askDescCount) : 0;
    const askPeriodRate = askDescCount > 0 ? Math.round((askPeriodCount / askDescCount) * 100) / 100 : 1;
    const memoDeltaCount = memoDeltaCountEarly;
    const memoAvgChunk = memoAvgChunkEarly;
    const fmtRW = msgFmtRWireDeltas > 0 ? msgFmtRWireDeltas : Number(chat?.fmt?.rWireDeltas || chat?.fmt?.rE || chat?.fmt?.rChunks || sseMemoObj?.reasoningDeltaCount || 0);
    const rAvgChunk = (fmtRW >= 2 && visRChars > 0)
      ? Math.round((visRChars / fmtRW) * 100) / 100
      : Number(chat?._streamEvidence?.rAvgChunk || chat?.fmt?.rAvgChunk || 0);

    const featResultObj = {
      turns,
      hidR,
      maxRInTurn,
      visR,
      visRChars,
      rAvgChunk,
      rPerTurn,
      toolsPerTurn,
      avgTurnDurMs,
      cps,
      memoAvgChunk,
      memoDeltaCount,
      codingTurns,
      codingTurnsNoR,
      codingTurnsWithHidR,
      geminiPyHelper,
      inlineHtmlEcho,
      isGeminiCoding,
      totalTools,
      bash,
      write,
      edit,
      read,
      present,
      search,
      genImg,
      askUser,
      askUserIntent,
      askOptsAvg,
      askDescAvg,
      askPeriodRate,
      askIdHasUnderscore,
      askIdBareIntent,
      askFormatOpt,
      askTransformOpt,
      askSolSig,
      askSol56Sig,
      lunaNotSurePhrase,
      solClarifyPhrase,
      astraSelfContainedPhrase,
      terraPhrase,
      straightApostrophe,
      writeUnderscoreName,
      checkmarkEmoji,
      parallelSteps,
      preNarrate,
      preToolTextChars,
      interToolTextChars,
      pyHeredoc,
      catHeredoc,
      chainAnd,
      rgSed,
      cssRoot,
      raf,
      svgRich,
      boxComment,
      claudeWarmPalette,
      htmlMaxLen,
      writtenChars,
      lowerDoctype,
      colorSchemeCss,
      prefersReducedMotion,
      svgSmilNoScript,
      ariaLabelledby,
      sandboxLink,
      emDash,
      cnColon,
      curlyApostrophe,
      unspacedEmDash,
      h2,
      h3,
      totalChars,
      codeBlocks,
      meanChars: Math.round(meanChars),
      nonCodeMeanChars,
      isMicroProbeChat,
      hasCompactMultiTurnSurge,
      knownCwTok,
      isFlash38LowIdentity,
      isOpenThink,
      wireFam,
      evalModality,
      tableCount,
      listLineCount,
      selfCheckCount,
      thinkStepLines,
      avgThinkDurMs,
      codeOmissionCount,
      codeDefensiveCount,
      searchSourcesCount,
      citationCount,
      mediaImgCount,
      mediaVideoCount,
      bashReadFiles,
      bashEditFiles,
      bashSearchOps,
      bashTestRuns,
      bashBuildRuns,
      editAddedLines,
      editDeletedLines,
      multiTurnPersistence: Math.round(multiTurnPersistence * 1000) / 1000,
      promptEntropy: Math.round(promptEntropy * 1000) / 1000,
      anomalous,
      htmlSvgMatch,
      htmlSvgRoutePivot,
      htmlSvgSig: htmlSvgSig || htmlSvgMatch?.features?.sig12 || null,
      tierVec,
      vec,
      habitReasoningScore,
      habitTags,
      fromIncompleteTurn,
      targetMessageId: String(asstMsgs.at(-1)?.id || ''),
    };
    if (featCacheKey) {
      if (_featCache.size > 64) _featCache.delete(_featCache.keys().next().value);
      _featCache.set(sidKey, { key: featCacheKey, val: featResultObj });
    }
    return featResultObj;
  }


  const BASE_VEC_W = [
    2.6, 2.6, 2.0, 2.5, 1.6,
    2.2, 2.2, 1.5, 1.8, 1.6,
    1.2, 1.2, 1.1, 1.4, 1.5,
    1.7, 1.5, 2.1, 2.2, 2.0,
  ];
  function vectorSimilarity(v1, v2, feat, customDimWeights = null) {
    if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length) return 0;
    const W = BASE_VEC_W;
    // Active Subspace Masking: downweight unactivated tool/HTML dimensions while amplifying active prose/streaming/SVG subspaces
    const noTools = feat && feat.totalTools === 0;
    const noHtml = feat && !feat.htmlMaxLen && !feat.writtenChars && !feat.cssRoot && !feat.raf && !feat.svgRich && !feat.boxComment;
    const onlyAskUser = feat && feat.totalTools > 0 && feat.askUser === feat.totalTools;
    const isLightHtmlOrSvg = Boolean(feat && !noHtml && (feat.isMicroProbeChat || (feat.htmlMaxLen > 0 && feat.htmlMaxLen <= 12000)));
    let sumSq = 0, wTot = 0;
    for (let i = 0; i < v1.length; i++) {
      let w = W[i] || 1;
      const zeroTiming = Boolean(feat && (feat.avgTurnDurMs || 0) === 0 && (feat.cps || 0) === 0);
      if (noTools) {
        if (i >= 2 && i <= 9) w *= 0.06;
        if (noHtml && i >= 10 && i <= 13) w *= 0.06;
        if (i === 18) w *= 0.12;
      } else {
        if (onlyAskUser && i >= 3 && i <= 9) w *= 0.08;
        if (noHtml && i >= 10 && i <= 13) w *= 0.06;
      }
      if (zeroTiming && i === 19) w *= 0.15;
      // When no tools or no HTML are used, prose stylometry (14..16) and streaming/thinking dynamics (17..19) are the primary active signals!
      if (noHtml && (noTools || onlyAskUser) && i >= 14 && i <= 19 && !(noTools && i === 18) && !(zeroTiming && i === 19)) {
        w *= 1.55;
      } else if (isLightHtmlOrSvg && ((i >= 10 && i <= 13) || i === 17 || (!noTools && i === 18) || (!zeroTiming && i === 19))) {
        w *= 1.45;
      }
      if (Array.isArray(customDimWeights) && customDimWeights.length === v1.length) {
        const cw = Number(customDimWeights[i]);
        if (Number.isFinite(cw) && cw > 0) w *= cw;
      }
      const d = (Number(v1[i]) || 0) - (Number(v2[i]) || 0);
      sumSq += w * d * d;
      wTot += w;
    }
    const rmse = Math.sqrt(sumSq / Math.max(1e-6, wTot));
    return Math.max(0, Math.min(1, 1 - rmse * 1.22));
  }

  // 12 维同家族档位微差子空间马氏/加权相似度（按模态动态聚焦激活子空间：文字/代码/搜索/图片/视频/Agent）
  function tierVecSimilarity(tv1, tv2, evalModality = 'chat', stdVec = null) {
    if (!Array.isArray(tv1) || !Array.isArray(tv2) || tv1.length !== 12 || tv2.length !== 12) return null;
    const mod = String(evalModality || 'chat').toLowerCase();
    // 0:thinkIntensity, 1:thinkDurNorm, 2:cpsToDepthRatio, 3:proseStructRichness, 4:selfCheckRigor,
    // 5:codeCompleteness, 6:codeDefensiveDepth, 7:toolChainAutonomy, 8:parallelPlanning, 9:searchSynthesisDepth,
    // 10:multiTurnPersistenceNorm, 11:effortToPromptRatio
    const W = [2.4, 2.2, 1.9, 1.8, 2.1, 1.6, 1.6, 1.5, 1.4, 1.3, 1.5, 2.5];
    if (mod === 'webdev') {
      W[5] = 2.8; W[6] = 2.7; W[7] = 2.2; W[8] = 2.0; W[9] = 0.4;
    } else if (mod === 'search') {
      W[9] = 3.0; W[3] = 2.4; W[4] = 2.3; W[5] = 0.5; W[6] = 0.5;
    } else if (mod === 'image' || mod === 'video') {
      W[1] = 2.6; W[2] = 2.2; W[3] = 2.0; W[5] = 0.3; W[6] = 0.3; W[7] = 0.6;
    } else if (mod === 'chat') {
      W[0] = 2.7; W[1] = 2.5; W[3] = 2.3; W[4] = 2.5; W[11] = 2.7; W[7] = 0.6; W[8] = 0.6;
    }
    let sumSq = 0, wTot = 0;
    for (let i = 0; i < 12; i++) {
      const stdScale = Array.isArray(stdVec) && stdVec.length === 12
        ? Math.max(0.55, Math.min(1.65, 0.14 / Math.max(0.05, Number(stdVec[i]) || 0.12)))
        : 1.0;
      const w = (W[i] || 1) * stdScale;
      const d = (Number(tv1[i]) || 0) - (Number(tv2[i]) || 0);
      sumSq += w * d * d;
      wTot += w;
    }
    const rmse = Math.sqrt(sumSq / Math.max(1e-6, wTot));
    return Math.max(0, Math.min(1, 1 - rmse * 1.18));
  }

  // ── 常用纠偏频次统计（驱动三次卡片跳转置顶 + 习惯先验微调）──
  const FREQ_KEY = 'habit:correctionFreq:v1';
  function getUsageStats() {
    if (_cachedUsageStats) return _cachedUsageStats;
    let raw = null;
    try { raw = typeof Store !== 'undefined' && Store.get ? Store.get(FREQ_KEY, null) : null; } catch {}
    const stats = (raw && typeof raw === 'object' && raw.vendors && raw.models)
      ? raw
      : { vendors: {}, families: {}, models: {}, efforts: {}, updatedAt: 0 };
    if (!stats._seeded) {
      stats._seeded = true;
      const seedModel = (name, weight = 1) => {
        const clean = String(name || '').replace(/[?？]+$/, '').trim();
        if (!clean || /^(未知型号|待定|未识别)$/.test(clean)) return;
        const decomp = decomposeModelIdentity(clean);
        const canon = decomp.canon || (clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean));
        const vid = decomp.vendor || 'other';
        const fam = decomp.family || canon;
        const eff = decomp.effort || 'standard';
        stats.vendors[vid] = (stats.vendors[vid] || 0) + weight;
        stats.families[fam.toLowerCase()] = (stats.families[fam.toLowerCase()] || 0) + weight;
        stats.models[canon.toLowerCase()] = (stats.models[canon.toLowerCase()] || 0) + weight;
        stats.efforts[eff] = (stats.efforts[eff] || 0) + weight;
      };
      try {
        for (const s of loadBank()) {
          if (s && s.model && s.userConfirmed) seedModel(s.model, 2);
        }
        if (typeof Models !== 'undefined' && Models.all) {
          for (const m of Object.values(Models.all)) {
            if (m && m.userCorrected && m.name) seedModel(m.rawLabel || m.name, 2);
          }
        }
      } catch {}
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, stats); } catch {}
    }
    _cachedUsageStats = stats;
    return stats;
  }

  function recordModelUse(modelLabel, vendorHint = '', familyHint = '', effortHint = '') {
    try {
      const stats = getUsageStats();
      const clean = String(modelLabel || '').replace(/[?？]+$/, '').trim();
      const decomp = decomposeModelIdentity(clean, { vendor: vendorHint, family: familyHint, effort: effortHint || undefined });
      const canon = decomp.canon || (clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean));
      const s = canon.toLowerCase();
      const vid = decomp.vendor || vendorHint || 'open';
      const fam = (familyHint || decomp.family || canon).trim().toLowerCase();
      const eff = decomp.effort || 'standard';
      stats.vendors[vid] = (stats.vendors[vid] || 0) + 3;
      if (fam) stats.families[fam] = (stats.families[fam] || 0) + 3;
      if (s) stats.models[s] = (stats.models[s] || 0) + 3;
      if (eff) stats.efforts[eff] = (stats.efforts[eff] || 0) + 2;
      stats.updatedAt = Date.now();
      _cachedUsageStats = stats;
      _analyzeCache.clear();
      if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, stats);
    } catch {}
  }

  function extractCompactMeta(feat) {
    if (!feat) return null;
    return {
      turns: feat.turns || 1,
      hidR: feat.hidR || 0,
      maxRInTurn: feat.maxRInTurn || 0,
      totalTools: feat.totalTools || 0,
      bash: feat.bash || 0,
      write: feat.write || 0,
      edit: feat.edit || 0,
      read: feat.read || 0,
      search: feat.search || 0,
      genImg: feat.genImg || 0,
      askUser: feat.askUser || 0,
      askUserIntent: feat.askUserIntent || 0,
      askIdHasUnderscore: feat.askIdHasUnderscore || 0,
      askIdBareIntent: feat.askIdBareIntent || 0,
      askFormatOpt: feat.askFormatOpt || 0,
      askTransformOpt: feat.askTransformOpt || 0,
      askSolSig: feat.askSolSig || 0,
      askSol56Sig: feat.askSol56Sig || 0,
      parallelSteps: feat.parallelSteps || 0,
      preNarrate: feat.preNarrate || 0,
      preToolTextChars: feat.preToolTextChars || 0,
      interToolTextChars: feat.interToolTextChars || 0,
      avgTurnDurMs: feat.avgTurnDurMs || 0,
      cps: feat.cps || 0,
      memoAvgChunk: feat.memoAvgChunk || 0,
      memoDeltaCount: feat.memoDeltaCount || 0,
      writtenChars: feat.writtenChars || 0,
      htmlMaxLen: feat.htmlMaxLen || 0,
      meanChars: feat.meanChars || 0,
      nonCodeMeanChars: feat.nonCodeMeanChars || 0,
      isMicroProbeChat: Boolean(feat.isMicroProbeChat),
      hasCompactMultiTurnSurge: Boolean(feat.hasCompactMultiTurnSurge),
      isFlash38LowIdentity: Boolean(feat.isFlash38LowIdentity),
      pyHeredoc: feat.pyHeredoc || 0,
      catHeredoc: feat.catHeredoc || 0,
      geminiPyHelper: feat.geminiPyHelper || 0,
      inlineHtmlEcho: feat.inlineHtmlEcho || 0,
      sandboxLink: feat.sandboxLink || 0,
      lowerDoctype: feat.lowerDoctype || 0,
      colorSchemeCss: feat.colorSchemeCss || 0,
      prefersReducedMotion: feat.prefersReducedMotion || 0,
      svgSmilNoScript: feat.svgSmilNoScript || 0,
      ariaLabelledby: feat.ariaLabelledby || 0,
      cssRoot: feat.cssRoot || 0,
      raf: feat.raf || 0,
      svgRich: feat.svgRich || 0,
      boxComment: feat.boxComment || 0,
      claudeWarmPalette: feat.claudeWarmPalette || 0,
      cnColon: feat.cnColon || 0,
      emDash: feat.emDash || 0,
      curlyApostrophe: feat.curlyApostrophe || 0,
      straightApostrophe: feat.straightApostrophe || 0,
      unspacedEmDash: feat.unspacedEmDash || 0,
      writeUnderscoreName: feat.writeUnderscoreName || 0,
      checkmarkEmoji: feat.checkmarkEmoji || 0,
      lunaNotSurePhrase: feat.lunaNotSurePhrase || 0,
      solClarifyPhrase: feat.solClarifyPhrase || 0,
      astraSelfContainedPhrase: feat.astraSelfContainedPhrase || 0,
      terraPhrase: feat.terraPhrase || 0,
      evalModality: feat.evalModality || 'chat',
      tableCount: feat.tableCount || 0,
      listLineCount: feat.listLineCount || 0,
      selfCheckCount: feat.selfCheckCount || 0,
      thinkStepLines: feat.thinkStepLines || 0,
      avgThinkDurMs: feat.avgThinkDurMs || 0,
      codeOmissionCount: feat.codeOmissionCount || 0,
      codeDefensiveCount: feat.codeDefensiveCount || 0,
      searchSourcesCount: feat.searchSourcesCount || 0,
      citationCount: feat.citationCount || 0,
      mediaImgCount: feat.mediaImgCount || 0,
      mediaVideoCount: feat.mediaVideoCount || 0,
      bashReadFiles: feat.bashReadFiles || 0,
      bashEditFiles: feat.bashEditFiles || 0,
      bashSearchOps: feat.bashSearchOps || 0,
      bashTestRuns: feat.bashTestRuns || 0,
      bashBuildRuns: feat.bashBuildRuns || 0,
      editAddedLines: feat.editAddedLines || 0,
      editDeletedLines: feat.editDeletedLines || 0,
      multiTurnPersistence: feat.multiTurnPersistence ?? 0.78,
      promptEntropy: feat.promptEntropy ?? 0.45,
      codingTurns: feat.codingTurns || undefined,
      wireFam: feat.wireFam || undefined,
      htmlSvgMatch: feat.htmlSvgMatch?.best ? { code_type: feat.htmlSvgMatch.code_type, best: feat.htmlSvgMatch.best, top_candidates: (feat.htmlSvgMatch.top_candidates || feat.htmlSvgMatch.top3 || [feat.htmlSvgMatch.best]).slice(0, 4), features: feat.htmlSvgMatch.features } : undefined,
      tierVec: Array.isArray(feat.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : undefined,
      htmlSvgSig: Array.isArray(feat.htmlSvgSig) && feat.htmlSvgSig.length === 12 ? feat.htmlSvgSig : undefined,
      isGeminiCoding: Boolean(feat.isGeminiCoding),
      isOpenThink: Boolean(feat.isOpenThink),
    };
  }

  function metaSimilarity(feat, meta) {
    if (!feat || !meta) return null;
    const fTools = feat.totalTools || 0;
    const mTools = meta.totalTools || 0;
    const hasBothTv = Array.isArray(feat.tierVec) && feat.tierVec.length === 12 && Array.isArray(meta.tierVec) && meta.tierVec.length === 12;
    if ((fTools === 0) !== (mTools === 0)) {
      if (!hasBothTv) return 0.25;
      const tvSimCross = tierVecSimilarity(feat.tierVec, meta.tierVec, feat.evalModality || meta.evalModality || 'chat');
      return tvSimCross != null ? Math.max(0.25, Math.min(0.68, 0.22 + tvSimCross * 0.48)) : 0.25;
    }
    const fOnlyAsk = fTools > 0 && feat.askUser === fTools;
    const mOnlyAsk = mTools > 0 && meta.askUser === mTools;
    if (fOnlyAsk !== mOnlyAsk) return 0.30;
    if (Boolean(feat.isGeminiCoding) !== Boolean(meta.isGeminiCoding)) return 0.20;
    const tvSim = hasBothTv
      ? tierVecSimilarity(feat.tierVec, meta.tierVec, feat.evalModality || meta.evalModality || 'chat')
      : null;
    let dSq = 0, wSum = 0;
    const addD = (a, b, scale, w) => {
      const diff = Math.min(1, Math.abs((Number(a) || 0) - (Number(b) || 0)) / Math.max(1e-5, scale));
      dSq += w * diff * diff;
      wSum += w;
    };
    const bothToolless = fTools === 0 && mTools === 0;
    const hasHtmlEither = (feat.htmlMaxLen || 0) > 0 || (meta.htmlMaxLen || 0) > 0 || (feat.writtenChars || 0) > 0 || (meta.writtenChars || 0) > 0;
    addD(feat.hidR / Math.max(1, feat.turns), (meta.hidR || 0) / Math.max(1, meta.turns || 1), 6.0, 2.8);
    addD(feat.maxRInTurn || 0, meta.maxRInTurn || 0, 12.0, 2.6);
    if (!bothToolless) {
      addD(feat.preToolTextChars || 0, meta.preToolTextChars || 0, 280.0, 2.2);
      addD(feat.interToolTextChars || 0, meta.interToolTextChars || 0, 280.0, 1.8);
      addD(feat.askIdHasUnderscore || 0, meta.askIdHasUnderscore || 0, 1.0, fOnlyAsk ? 3.5 : 1.0);
    }
    if ((feat.avgTurnDurMs || 0) > 0 && (meta.avgTurnDurMs || 0) > 0) {
      const fDur = feat.isMicroProbeChat ? feat.avgTurnDurMs * 4.2 : feat.avgTurnDurMs;
      const mDur = meta.isMicroProbeChat ? meta.avgTurnDurMs * 4.2 : meta.avgTurnDurMs;
      addD(fDur, mDur, 90000.0, 2.2);
    }
    if (!bothToolless || hasHtmlEither) {
      if (bothToolless && hasHtmlEither) {
        addD(Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0), Math.max(meta.writtenChars || 0, meta.htmlMaxLen || 0), 16000.0, 2.2);
        addD(feat.ariaLabelledby || 0, meta.ariaLabelledby || 0, 1.0, 1.5);
        addD(feat.svgSmilNoScript || 0, meta.svgSmilNoScript || 0, 1.0, 1.5);
      } else {
        const fWritten = feat.isMicroProbeChat ? Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 8.5 : (feat.writtenChars || 0);
        const mWritten = meta.isMicroProbeChat ? Math.max(meta.writtenChars || 0, meta.htmlMaxLen || 0) * 8.5 : (meta.writtenChars || 0);
        addD(fWritten, mWritten, 45000.0, 1.6);
      }
    }
    addD(feat.meanChars || 0, meta.meanChars || 0, 5000.0, 2.2);
    if (!bothToolless) {
      addD(feat.edit || 0, meta.edit || 0, 4.0, 1.8);
      addD(feat.parallelSteps || 0, meta.parallelSteps || 0, 3.0, 1.6);
    }
    if ((feat.cps || 0) > 0 && (meta.cps || 0) > 0) {
      addD(feat.cps, meta.cps, 90.0, 1.8);
    }
    if ((feat.memoAvgChunk || 0) > 0 && (meta.memoAvgChunk || 0) > 0) {
      addD(feat.memoAvgChunk, meta.memoAvgChunk, feat.isGeminiCoding ? 80.0 : 12.0, 2.0);
    }
    if (!bothToolless || hasHtmlEither) {
      addD(feat.lowerDoctype || 0, meta.lowerDoctype || 0, 2.0, 1.8);
      addD(feat.colorSchemeCss || 0, meta.colorSchemeCss || 0, 2.0, 1.6);
      addD(feat.prefersReducedMotion || 0, meta.prefersReducedMotion || 0, 2.0, 1.6);
    }
    if (!bothToolless) {
      addD(feat.bash || 0, meta.bash || 0, 4.0, 1.5);
      addD(feat.write || 0, meta.write || 0, 2.0, 1.5);
    }
    if (bothToolless) {
      addD(feat.emDash || 0, meta.emDash || 0, 8.0, 1.6);
      addD(feat.cnColon || 0, meta.cnColon || 0, 8.0, 1.6);
      if (meta.h2 !== undefined || meta.h3 !== undefined) {
        addD(feat.h2 || 0, meta.h2 || 0, 5.0, 1.4);
        addD(feat.h3 || 0, meta.h3 || 0, 6.0, 1.4);
      }
      if (meta.codeBlocks !== undefined) {
        addD(feat.codeBlocks || 0, meta.codeBlocks || 0, 4.0, 1.5);
      }
    }
    if ((feat.selfCheckCount || 0) > 0 || (meta.selfCheckCount || 0) > 0) {
      addD(feat.selfCheckCount || 0, meta.selfCheckCount || 0, 4.0, 1.4);
    }
    if ((feat.codeDefensiveCount || 0) > 0 || (meta.codeDefensiveCount || 0) > 0) {
      addD(feat.codeDefensiveCount || 0, meta.codeDefensiveCount || 0, 6.0, 1.5);
    }
    if ((feat.searchSourcesCount || 0) > 0 || (meta.searchSourcesCount || 0) > 0) {
      addD(feat.searchSourcesCount || 0, meta.searchSourcesCount || 0, 8.0, 1.6);
    }
    if ((feat.bash || 0) > 0 && (meta.bash || 0) > 0 && (meta.bashReadFiles !== undefined || meta.bashEditFiles !== undefined || meta.bashSearchOps !== undefined)) {
      addD(feat.bashReadFiles || 0, meta.bashReadFiles || 0, 6.0, 1.2);
      addD(feat.bashEditFiles || 0, meta.bashEditFiles || 0, 4.0, 1.3);
      addD(feat.bashSearchOps || 0, meta.bashSearchOps || 0, 5.0, 1.1);
      addD(feat.bashTestRuns || 0, meta.bashTestRuns || 0, 3.0, 1.2);
    }
    if ((feat.edit || 0) > 0 && (meta.edit || 0) > 0 && (meta.editAddedLines !== undefined || meta.editDeletedLines !== undefined)) {
      addD(feat.editAddedLines || 0, meta.editAddedLines || 0, 120.0, 1.1);
      addD(feat.editDeletedLines || 0, meta.editDeletedLines || 0, 80.0, 1.0);
    }
    if (Array.isArray(feat.htmlSvgSig) && feat.htmlSvgSig.length === 12 && Array.isArray(meta.htmlSvgSig) && meta.htmlSvgSig.length === 12) {
      for (let si = 0; si < 12; si++) {
        addD(feat.htmlSvgSig[si], meta.htmlSvgSig[si], 1.0, 0.45);
      }
    }
    const baseMetaSim = Math.max(0, Math.min(1, 1 - Math.sqrt(dSq / Math.max(1e-6, wSum))));
    return tvSim != null ? (baseMetaSim * 0.72 + tvSim * 0.28) : baseMetaSim;
  }

  // 二阶段同家族相邻档位解耦判别器（Stage-2 Intra-Family Effort-Tier Disentangler）：
  // 在 Stage-1 锁定候选模型家族后，专门使用 12 维档位微差子空间 tierVec、Battle 对偶超平面、多模态画像与厂商因子化档位先验，
  // 精准分离同家族内已存在的多个强度档位候选（绝不向 scoreMap 注入伪造或派生行，强度识别与型号本体识别严格解耦）
  function disentangleIntraFamilyTiers(scoreMap, feat, calib, bankByKey, isEvalAnalyze = false) {
    try {
      if (!scoreMap || !feat || !Array.isArray(feat.tierVec) || feat.tierVec.length !== 12) return;
      const tv = feat.tierVec;
      const mod = String(feat.evalModality || 'chat').toLowerCase();
      const TIER_IDEAL_EFFORT = { low: 0.25, medium: 0.48, high: 0.68, xhigh: 0.81, max: 0.92 };

      // 1. 按 famKey 聚合现有候选家族（不再从 tierCentroids 派生新行进入 scoreMap，防止强度档位与型号习惯冲突或产生双后缀）
      const famGroups = new Map();
      for (const [k, item] of scoreMap.entries()) {
        if (!item) continue;
        item.label = formatDisplayModelLabel(item.label, item.canon);
        const p = parseModelFamilyAndTier(item.canon || item.label);
        if (!p.famKey || !p.tier) continue;
        if (!famGroups.has(p.famKey)) famGroups.set(p.famKey, []);
        famGroups.get(p.famKey).push({ key: k, item, tier: p.tier, famKey: p.famKey, baseLabel: p.baseLabel });
      }

      for (const [famKey, members] of famGroups.entries()) {
        const effInfo = identifyEffortTier(feat, famKey, calib);
        if (effInfo?.tier) {
          for (const m of members) {
            m.item.detectedEffort = (m.tier && m.tier !== 'standard') ? m.tier : effInfo.tier;
            m.item.familyInferredEffort = effInfo.tier;
          }
        }
        if (members.length < 2) continue;
        const maxFamSim = Math.max(...members.map(m => m.item.sim || 0));
        if (maxFamSim < 0.78) continue;

        const hyperMap = calib?.intraFamilyHyperplanes?.[famKey] || null;
        const tierScores = new Map();

        for (const m of members) {
          let ev = 0;
          let wSum = 0;

          // (A) 该档位专属 Battle/Direct 真值质心匹配度（最高优先，高权重锚定）
          const cent = calib?.tierCentroids?.[m.key];
          if (cent && Array.isArray(cent.tierVec) && cent.tierVec.length === 12) {
            const cSim = tierVecSimilarity(tv, cent.tierVec, mod, cent.stdVec);
            if (cSim != null) {
              const truthConf = Math.min(1.0, (Number(cent.truthWeightSum) || (cent.count || 1) * 2) / 9.0);
              const wCent = 3.4 * (0.45 + 0.55 * truthConf);
              ev += (cSim - 0.75) * wCent;
              wSum += wCent;
            }
          }

          // (B) 当前模态（chat / webdev / search / image / video）专属档位画像匹配
          const modProf = calib?.modalityProfiles?.[mod]?.[m.key];
          if (modProf && Array.isArray(modProf.tierVec) && modProf.tierVec.length === 12) {
            const mSim = tierVecSimilarity(tv, modProf.tierVec, mod);
            if (mSim != null) {
              const wMod = 1.85;
              ev += (mSim - 0.75) * wMod;
              wSum += wMod;
            }
          }

          // (C) 厂商级跨家族档位相对先验（当该家族某档位尚缺直接样本时，借用同厂商如 Anthropic/OpenAI 同档位微差特征）
          const vid = detectModelVendorId(m.item.canon || m.item.label);
          const vPrior = calib?.vendorTierDeltas?.[vid]?.[m.tier];
          if (vPrior && Array.isArray(vPrior.tierVec) && vPrior.tierVec.length === 12) {
            const vpSim = tierVecSimilarity(tv, vPrior.tierVec, mod);
            if (vpSim != null) {
              const wVp = cent ? 0.55 : 1.15;
              ev += (vpSim - 0.76) * wVp;
              wSum += wVp;
            }
          }

          // (D) Battle 同题对偶线性超平面 margin 投票（如 high>medium, max>high）：大幅拉开同家族不同强度档位误差
          if (hyperMap && typeof hyperMap === 'object') {
            for (const [pk, hObj] of Object.entries(hyperMap)) {
              if (!hObj || !Array.isArray(hObj.wVec) || hObj.wVec.length !== 12) continue;
              const [hiT, loT] = pk.split('>');
              if (m.tier !== hiT && m.tier !== loT) continue;
              const proj = tv.reduce((acc, val, idx) => acc + (Number(hObj.wVec[idx]) || 0) * (Number(val) || 0), 0);
              const margin = proj - (Number(hObj.threshold) || 0);
              const dir = m.tier === hiT ? 1 : -1;
              const hConf = Math.min(1.0, (Number(hObj.count) || 1) / 3);
              ev += Math.max(-0.24, Math.min(0.24, dir * margin * 1.85)) * (2.4 * hConf);
              wSum += 1.5 * hConf;
            }
          }

          // (E) 内禀 Prompt 复杂度归一化努力度曲线（兜底防漂移）
          const idealE = TIER_IDEAL_EFFORT[m.tier] ?? 0.68;
          const actualE = (Number(tv[11]) || 0.65) * 0.55 + (Number(tv[0]) || 0.5) * 0.25 + (Number(tv[4]) || 0.5) * 0.20;
          const eDist = Math.abs(actualE - idealE);
          ev += (0.18 - eDist) * 1.05;
          wSum += 1.05;

          const normEv = wSum > 0 ? (ev / wSum) : 0;
          tierScores.set(m.key, normEv);
        }

        // 零均值中心化精排：保持该模型家族整体对外竞争力不变，在有 Battle/Direct 真值校准时果断拉开不同强度档位差距
        const hasLearnedFamTier = Boolean(
          (hyperMap && Object.keys(hyperMap).length > 0) ||
          members.some(m => calib?.tierCentroids?.[m.key])
        );
        const vals = [...tierScores.values()];
        const meanEv = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        const sortedBySim = [...members].sort((a, b) => (Number(b.item?.sim) || 0) - (Number(a.item?.sim) || 0));
        const famMaxSim = Number(sortedBySim[0]?.item?.sim) || 0.15;
        const secondSim = Number(sortedBySim[1]?.item?.sim) || 0;
        const hasStrongRuleLeader = Boolean(sortedBySim[0]?.item?.protoRuleLeader) || (famMaxSim >= 0.955 && (famMaxSim - secondSim) >= 0.024) || Boolean(feat?.tagReiTier && sortedBySim[0]?.tier === feat.tagReiTier);
        let bestMember = null, bestRel = -999;
        if (hasStrongRuleLeader) {
          bestMember = sortedBySim[0];
          bestRel = 0.05;
        } else {
          for (const m of members) {
            const rel = (tierScores.get(m.key) || 0) - meanEv;
            if (rel > bestRel) {
              bestRel = rel;
              bestMember = m;
            }
            const delta = hasLearnedFamTier
              ? Math.max(-0.075, Math.min(0.085, rel * 0.52))
              : Math.max(-0.026, Math.min(0.032, rel * 0.22));
            m.item.sim = Math.max(0.12, Math.min(0.994, famMaxSim + 0.004, m.item.sim + delta));
          }
          if (bestMember && bestMember.item.sim < famMaxSim) bestMember.item.sim = famMaxSim;
        }
        if (bestMember && bestRel >= 0.028 && calib?.tierCentroids?.[bestMember.key]) {
          const tag = `🎯 同族档位微差锁定(${bestMember.tier.toUpperCase()})`;
          bestMember.item.tags = [tag, ...(bestMember.item.tags || []).filter(t => t !== tag).slice(0, 4)];
        }
      }
    } catch {}
  }

  function analyze(chat, modelEntry = null, { ignoreExactSid = false, preferLatestTurn = false } = {}) {
    const rawSid = String(chat?.sid || modelEntry?.sid || '');
    const sid = rawSid;
    const cacheSidKey = rawSid || '';
    const allMsgs = Array.isArray(chat?.messages) ? chat.messages : [];
    const lastM = allMsgs.at(-1);
    const lastP = lastM?.parts?.at(-1);
    const lastPLen = typeof lastP?.text === 'string' ? lastP.text.length : (typeof lastP?.inputText === 'string' ? lastP.inputText.length : 0);
    const mRef = ignoreExactSid ? modelEntry : (modelEntry || (sid && typeof Models !== 'undefined' ? Models.get(sid) : null));
    const msgDigest = computeMessagesDigest(allMsgs);
    const anaCacheKey = cacheSidKey ? `${cacheSidKey}:${allMsgs.length}:${lastM?.id || ''}:${lastM?.parts?.length || 0}:${msgDigest}:${chat?.busy ? (lastPLen >> 8) : lastPLen}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}:${ignoreExactSid ? '' : (mRef?.name || '')}:${ignoreExactSid ? 0 : (mRef?.userCorrected ? 1 : 0)}:${ignoreExactSid ? 0 : (mRef?.reverseScore || 0)}:${ignoreExactSid ? 0 : (mRef?.habitTags?.length || 0)}:${bankRev}:${calibRev}:${ignoreExactSid ? 1 : 0}` : '';
    if (anaCacheKey && _analyzeCache.has(cacheSidKey) && _analyzeCache.get(cacheSidKey).key === anaCacheKey) {
      return _analyzeCache.get(cacheSidKey).val;
    }
    const feat = chat?._injectedFeat || extractFeatures(chat, mRef, { ignoreExactSid, preferLatestTurn });
    if (!feat) {
      if (anaCacheKey) {
        if (_analyzeCache.size > 64) _analyzeCache.delete(_analyzeCache.keys().next().value);
        _analyzeCache.set(cacheSidKey, { key: anaCacheKey, val: null });
      }
      return null;
    }
    if (!Array.isArray(feat.habitTags)) feat.habitTags = [];
    const bank = loadBank();
    const calib = loadCalibration();
    const usageStats = getUsageStats();
    const scoreMap = new Map();
    const cpsEarly = Number(feat.cps) || 0;

    const isArgonBehavior = ((feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 50000 && cpsEarly >= 200) || (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) || (feat.write === 2 && (feat.bash || 0) <= 1 && (feat.edit || 0) === 0 && ((feat.memoAvgChunk || 0) >= 200 || cpsEarly >= 210) && (feat.writtenChars || 0) >= 95000) || ((feat.inlineHtmlEcho === 0 || feat.htmlSvgMatch?.best?.model_id === "google/gemini-4-argon" || (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.parallelSteps || 0) >= 2 && feat.avgTurnDurMs >= 220000 && cpsEarly > 0 && cpsEarly < 140) || (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 65000) || (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && feat.avgTurnDurMs >= 300000) || (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 850 && feat.avgTurnDurMs >= 195000)) && (feat.geminiPyHelper === 0 || (feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 15))))) && !(feat.turns >= 3 && (feat.search || 0) >= 25 && (feat.askUser || 0) >= 1) && !(feat.turns >= 5 && (feat.pyHeredoc || 0) >= 20 && (feat.askUser || 0) >= 1) && (
      (feat.htmlSvgMatch?.best?.model_id === "google/gemini-4-argon" && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70) ||
      feat.edit >= 1 ||
      feat.read >= 12 ||
      (feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 15)) ||
      (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
      (feat.parallelSteps >= 1 && feat.avgTurnDurMs >= 60000) ||
      (feat.bash >= 3 && (feat.search || 0) < 10 && feat.avgTurnDurMs >= 80000 && !(feat.turns <= 2 && cpsEarly >= 180 && (feat.memoDeltaCount || 0) >= 200 && (feat.read || 0) === 0) && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36) || (feat.turns === 2 && feat.bash >= 20 && (feat.search || 0) <= 2 && feat.avgTurnDurMs >= 250000))) ||
      (feat.turns === 1 && feat.bash >= 20 && feat.bash <= 32 && (feat.search || 0) >= 10 && (feat.search || 0) <= 25 && feat.write === 0 && feat.edit === 0 && feat.avgTurnDurMs >= 200000 && feat.avgTurnDurMs <= 310000) ||
      (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && feat.avgTurnDurMs >= 400000) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash === 3 && (feat.read || 0) === 1 && feat.edit === 0 && cpsEarly >= 165) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 160) && feat.writtenChars >= 30000 && feat.writtenChars <= 44500 && (feat.writeUnderscoreName || 0) === 0) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash >= 1 && feat.bash <= 2 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 195) && ((feat.writtenChars >= 42000 && feat.writtenChars <= 52000) || (feat.writtenChars >= 34000 && feat.writtenChars <= 62000 && ((feat.boxComment || 0) >= 1 || (feat.cnColon || 0) >= 3)))) ||
      (feat.write === 2 && (feat.bash || 0) <= 1 && (feat.edit || 0) === 0 && ((feat.memoAvgChunk || 0) >= 160 || cpsEarly >= 155) && (feat.writtenChars || 0) >= 75000) ||
      (feat.turns === 3 && feat.bash >= 15 && (feat.search || 0) <= 5 && feat.write <= 1 && feat.edit === 0) ||
      (feat.askUser >= 1 && feat.bash >= 1 && feat.bash <= 8 && (feat.search || 0) <= 2 && feat.write <= 1 && feat.edit === 0) ||
      (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 40000 && cpsEarly >= 150) ||
      (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) ||
      (feat.turns <= 3 && feat.bash >= 5 && (feat.pyHeredoc || 0) <= 10 && (feat.search || 0) === 0 && feat.edit === 0 && (feat.write >= 1 || feat.cnColon >= 4) && (feat.writtenChars > 0 || feat.avgTurnDurMs > 0 || feat.cnColon >= 4)) ||
      (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 850 && feat.avgTurnDurMs >= 195000) ||
      (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && ((feat.avgTurnDurMs >= 33000 && feat.meanChars >= 800) || ((feat.search || 0) === 1 && feat.meanChars >= 2000))) ||
      (feat.totalTools === 0 && feat.meanChars >= 330 && (feat.avgTurnDurMs >= 15000 || (feat.turns >= 2 && (feat.memoAvgChunk || 0) >= 20 && (feat.memoAvgChunk || 0) <= 80) || (feat.turns === 1 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 14000 && (feat.evalModality === 'chat' || (feat.htmlSvgMatch?.best?.canon === 'gemini-4-argon-max' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70)))))
    );
    const isKnownArgon = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
      KNOWN_ARGON_SIDS.has(sid) ||
      Boolean(isArgonBehavior) ||
      bank.some(b => b && b.sid === sid && (b.userConfirmed || b.importedFromDiag) && /argon|barium/i.test(String(b.id || b.model || '')))
    );

    const onlyAskUser = feat.totalTools > 0 && feat.askUser === feat.totalTools;
    const isHaikuPlainMedium = feat.totalTools === 0 && !(feat.turns === 1 && feat.hidR === 0 && (feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) && feat.straightApostrophe >= 1 && feat.curlyApostrophe === 0 && feat.meanChars >= 380 && feat.meanChars <= 1600;
    const wPerWrite = (feat.writtenChars || 0) / Math.max(1, feat.write || 1);
    const isFable51CodingCore = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (((feat.turns === 1 && feat.hidR === 1) || ((feat.codingTurns || 1) === 1 && (feat.nonCodeMeanChars || 0) > 0 && (feat.nonCodeMeanChars || 0) <= 180 && (feat.maxRInTurn || 1) === 1)) &&
        feat.write === 1 && feat.totalTools === 2 &&
        (feat.bash || 0) === 0 && (feat.preToolTextChars || 0) === 0 && (feat.interToolTextChars || 0) === 0 &&
        (((feat.cps || 0) >= 95) || ((feat.cps || 0) === 0 && ((feat.avgTurnDurMs || 0) === 0 || (feat.avgTurnDurMs || 0) >= 3600000) && (feat.memoDeltaCount || 0) >= 40)) && ((feat.memoAvgChunk || 0) >= 10.5 && (feat.memoAvgChunk || 0) <= 15.2) &&
        (feat.writtenChars || 0) >= 11500 && (feat.writtenChars || 0) <= 16500 &&
        (feat.straightApostrophe || 0) >= 2 &&
        (feat.prefersReducedMotion || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.boxComment || 0) === 0) ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (feat.bash || 0) === 0 && (feat.edit || 0) === 0 && (feat.preToolTextChars || 0) === 0 && (feat.interToolTextChars || 0) === 0 && cpsEarly >= 52 && cpsEarly <= 75 && (feat.avgTurnDurMs || 0) >= 165000 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 18000) ||
        (feat.htmlSvgMatch?.best?.id === 'anthropic/claude-fable-5.1' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.65)
      )
    );
    const isLunaHighCodingCore = false;
    const isHaikuMultiTurnMedium = !isFable51CodingCore && feat.wireFam !== 'openai' && (((feat.turns === 3 && feat.write === 2 && feat.bash === 0 && (feat.search || 0) === 1) || (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1)) && cpsEarly >= 220 && feat.writtenChars >= 16000 && feat.writtenChars < 22000 || (feat.turns >= 2 && feat.write >= 1 && feat.write <= 2 && feat.bash === 0 && feat.edit === 0 && feat.askUser === 0 && wPerWrite >= 12000 && wPerWrite < 14000 && ((feat.nonCodeMeanChars || 0) === 0 || (feat.nonCodeMeanChars || 0) <= 500 || (feat.nonCodeMeanChars || 0) === Math.round(feat.meanChars || 0)) && feat.maxRInTurn <= 2 && (feat.memoDeltaCount >= 50 || ((feat.memoDeltaCount || 0) === 0 && ((feat.straightApostrophe || 0) >= 3 || (feat.avgTurnDurMs >= 65000 && feat.avgTurnDurMs <= 90000) || (feat.turns >= 5 && feat.meanChars >= 4000 && feat.meanChars < 7500)))) && feat.sandboxLink === 0 && feat.lowerDoctype === 0 && feat.prefersReducedMotion === 0 && feat.boxComment === 0));
    const isMicroProbe = Boolean(feat.isMicroProbeChat);
    const effWChars = isMicroProbe ? Math.round(Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 8.5) : (feat.writtenChars || 0);
    const avgChunk = Number(feat.memoAvgChunk) || 0;
    const deltaCnt = Number(feat.memoDeltaCount) || 0;
    const isEvalAnalyze = Boolean(chat?.isEvaluation || chat?.evalMode === 'battle' || chat?.evalMode === 'direct' || chat?.battleSide || /#[ab]$/i.test(rawSid) || /#[ab]$/i.test(sid));
    const hasOpenAiIntentMarkers = Boolean((feat.askIdHasUnderscore || 0) > 0 || (feat.askFormatOpt || 0) > 0 || (feat.askTransformOpt || 0) > 0 || feat.hasSys6603Tag || feat.hasZeroCacheWriteTag || feat.isSol61Tag || feat.isLunaFastTag || (feat.totalTools === 0 && (feat.straightApostrophe || 0) === 0 && (feat.htmlMaxLen || 0) === 0 && ((feat.solClarifyPhrase || 0) > 0 || (feat.lunaNotSurePhrase || 0) > 0 || (feat.astraSelfContainedPhrase || 0) > 0 || ((feat.unspacedEmDash || 0) >= 1 && (feat.avgTurnDurMs || 0) > 0 && (feat.avgTurnDurMs || 0) <= 4000 && (feat.meanChars || 0) <= 150) || (feat.turns === 1 && feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && feat.isMicroProbeChat && (feat.meanChars || 0) >= 250 && (feat.meanChars || 0) <= 320 && (feat.cnColon || 0) === 0))) || (feat.turns === 1 && feat.hidR === 0 && (feat.read || 0) >= 4 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && (feat.meanChars || 0) <= 220));
    const isDefiniteOpenAiChunkStream = !isEvalAnalyze && !feat.isGeminiCoding && !isFable51CodingCore && deltaCnt >= 15 && avgChunk >= 1.0 && avgChunk < 4.2 && (feat.claudeWarmPalette || 0) === 0;
    const hasClaudeChunkSig = !isEvalAnalyze && !isDefiniteOpenAiChunkStream && !hasOpenAiIntentMarkers && feat.wireFam !== 'openai' && deltaCnt >= 6 && avgChunk >= 4.0 && avgChunk <= 19.5 && !feat.isGeminiCoding && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0;