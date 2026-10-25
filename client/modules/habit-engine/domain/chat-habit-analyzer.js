    const hasOpenAiChunkSig = !isEvalAnalyze && (isDefiniteOpenAiChunkStream || (deltaCnt >= 6 && ((avgChunk >= 20.0 && avgChunk <= 62.0) || (avgChunk >= 1.0 && avgChunk < 5.0)) && !feat.isGeminiCoding && (feat.claudeWarmPalette || 0) === 0 && (feat.boxComment || 0) === 0 && (feat.preToolTextChars || 0) < 100 && (feat.interToolTextChars || 0) < 80));
    const isClaudeHtmlNoOpenAiMarkers = !isDefiniteOpenAiChunkStream && feat.wireFam !== 'openai' && !feat.isGeminiCoding && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && ((feat.ariaLabelledby || 0) === 0 || (feat.boxComment || 0) >= 1 || (feat.preNarrate || 0) >= 0.45) && (feat.prefersReducedMotion || 0) <= (hasClaudeChunkSig || (feat.boxComment || 0) >= 1 ? 2 : 1) && (hasClaudeChunkSig || (feat.boxComment || 0) >= 1 || (feat.write >= 2 && feat.hidR >= 2 && feat.maxRInTurn <= 3 && feat.writtenChars >= 9500 && feat.writtenChars < 22000) || (feat.write === 1 && feat.bash === 0 && feat.hidR >= 1 && feat.maxRInTurn <= 3 && feat.writtenChars >= 14000 && (feat.avgTurnDurMs || 0) >= 95000));
    const isHaikuCodingOrSearch = !isDefiniteOpenAiChunkStream && (
      (feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 4 && feat.write === 1 && (feat.edit || 0) >= 2 && (feat.interToolTextChars || 0) >= 90 && cpsEarly >= 105 && cpsEarly <= 145) ||
      (feat.turns === 2 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && cpsEarly >= 190 && cpsEarly <= 245 && (feat.avgTurnDurMs || 0) <= 45000 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000) ||
      (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.writtenChars > 0 && feat.writtenChars < 12000 && feat.cnColon >= 1 && (!isMicroProbe || (feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.hidR <= 1 && feat.preToolTextChars < 90 && feat.interToolTextChars < 60))) ||
      (isMicroProbe && feat.turns <= 2 && feat.write >= 1 && feat.bash <= 1 && feat.hidR <= 1 && feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.preToolTextChars < 25 && feat.interToolTextChars < 45 && effWChars > 0 && effWChars < 11500 && feat.cnColon >= 1) ||
      (feat.turns === 1 && feat.search >= 2 && feat.bash === 0 && feat.write === 0 && feat.askUser === 0)
    );
    const isSonnetPlainMulti = feat.turns === 2 && feat.totalTools === 0 && feat.memoAvgChunk >= 240 && feat.curlyApostrophe === 0;
    const isSolarPro4Profile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        feat.htmlSvgMatch?.best?.id === 'upstage/solar-pro4' ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 30 && (feat.cps || 0) <= 44 && avgChunk >= 6.5 && avgChunk <= 15.0 && (feat.avgTurnDurMs || 0) >= 250000 && (feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 16000 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0)
      )
    );
    const isMuseSpark12Max = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.write === 1 && feat.totalTools === 1 && (feat.cps || 0) >= 500 && (feat.writtenChars || 0) >= 35000 && (feat.emDash || 0) >= 4
    );
    const isMuseSpark13High = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.totalTools === 3 && (feat.cps || 0) >= 195 && (feat.cps || 0) <= 280 && (feat.avgTurnDurMs || 0) > 0 && (feat.avgTurnDurMs || 0) <= 34000 && (feat.preToolTextChars || 0) >= 140 && (feat.emDash || 0) >= 2 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0
    );
    const isMuseSpark13Low = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 2 && feat.write === 1 && feat.totalTools === 2 && feat.hidR >= 35 && feat.hidR <= 47 && avgChunk >= 3.5 && avgChunk <= 6.5 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1
    );
    const htmlSvgCands = (feat.htmlSvgMatch && Array.isArray(feat.htmlSvgMatch.top_candidates) && feat.htmlSvgMatch.top_candidates.length > 0) ? feat.htmlSvgMatch.top_candidates : (feat.htmlSvgMatch?.best ? [feat.htmlSvgMatch.best] : []);
    const hasHtmlMuse13Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'meta/muse-spark-1.3' && c.ruleScore >= 0.55));
    const isMuseSpark13Max = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && !isMuseSpark12Max && !isMuseSpark13High && !isMuseSpark13Low && (
        hasHtmlMuse13Rule ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 1 && (feat.bash || 0) === 0 && (feat.writtenChars || 0) >= 35000 && (feat.writtenChars || 0) < 44500 && (feat.cps || 0) >= 240 && (feat.cps || 0) < 500 && (feat.prefersReducedMotion || 0) >= 1 && (feat.ariaLabelledby || 0) >= 1 && (feat.boxComment || 0) === 0 && (feat.claudeWarmPalette || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.genImg || 0) === 0 && feat.hidR >= 4 && feat.hidR <= 6 && feat.maxRInTurn === 3 && (feat.preToolTextChars || 0) >= 70 && (feat.writtenChars || 0) <= 26000 && ((avgChunk >= 10.5 && avgChunk <= 29.0) || (avgChunk === 0 && (feat.cps || 0) >= 120)) && (feat.emDash || 0) >= 2) ||
        (feat.turns === 3 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 5 && avgChunk >= 6.5 && avgChunk <= 9.0 && (feat.writtenChars || 0) >= 19000 && (feat.emDash || 0) >= 4) ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 3 && (feat.cps || 0) >= 165 && (feat.cps || 0) <= 550 && (feat.preToolTextChars || 0) >= 55 && ((feat.emDash || 0) >= 2 || (feat.boxComment || 0) >= 1 || (feat.prefersReducedMotion || 0) >= 1)) ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 1 && (feat.avgTurnDurMs || 0) >= 400000 && (feat.cps || 0) >= 20 && (feat.cps || 0) <= 35 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 16500 && (feat.lowerDoctype || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && feat.totalTools === 3 && feat.hidR === 3 && avgChunk >= 11.5 && avgChunk <= 13.5 && (feat.memoDeltaCount || 0) >= 400 && (feat.writtenChars || 0) >= 1800 && (feat.writtenChars || 0) <= 3500 && (feat.htmlMaxLen || 0) >= 6000) ||
        (feat.turns === 2 && feat.write === 3 && feat.bash === 2 && feat.totalTools === 7 && feat.hidR === 9 && (feat.cps || 0) >= 145 && avgChunk >= 1.2 && avgChunk <= 2.2 && (feat.memoDeltaCount || 0) >= 200) ||
        ((feat.turns || 0) >= 2 && (feat.turns || 0) <= 4 && (feat.write || 0) >= 2 && (feat.write || 0) <= 4 && (feat.bash || 0) >= 1 && (feat.bash || 0) <= 2 && (feat.edit || 0) <= 1 && (feat.read || 0) === 0 && (feat.hidR || 0) >= 6 && (feat.hidR || 0) <= 12 && (feat.preNarrate || 0) >= 0.95 && (feat.preToolTextChars || 0) >= 85 && (feat.preToolTextChars || 0) <= 220 && (feat.writtenChars || 0) >= 14000 && (feat.writtenChars || 0) <= 42000 && (feat.htmlMaxLen || 0) >= 12000 && (feat.htmlMaxLen || 0) <= 28000 && (feat.avgTurnDurMs || 0) >= 95000 && (feat.avgTurnDurMs || 0) <= 210000 && (feat.cps || 0) >= 32 && (feat.cps || 0) <= 115 && ((feat.ariaLabelledby || 0) >= 1 || (feat.prefersReducedMotion || 0) >= 2 || (feat.raf || 0) >= 1) && (feat.svgRich || 0) >= 1 && ((feat.lowerDoctype || 0) === 0 || (feat.preNarrate || 0) >= 0.95) && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.claudeWarmPalette || 0) === 0 && (feat.cnColon || 0) === 0 && (feat.writeUnderscoreName || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.totalTools === 2 && feat.hidR >= 48 && avgChunk >= 9.0 && avgChunk <= 15.0 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1)
      )
    );
    const isMuseWonder = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 5.5 && (feat.cps || 0) <= 10.5 && avgChunk >= 8.5 && avgChunk <= 11.5 && (feat.meanChars || 0) >= 180 && (feat.meanChars || 0) <= 360 && (feat.emDash || 0) >= 1
    );
    const isMuseSparkOpen = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 3 && (feat.read || 0) === 1 && (feat.write || 0) === 0 && (feat.bash || 0) === 0 && (feat.cps || 0) >= 16 && (feat.cps || 0) <= 24 && avgChunk >= 5.0 && avgChunk <= 7.5 && (feat.interToolTextChars || 0) >= 400) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 7200 && (feat.htmlMaxLen || 0) <= 7500 && (feat.svgSmilNoScript || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && (feat.lowerDoctype || 0) === 0) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.write === 0 && (feat.bash || 0) === 0 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 0 && (feat.meanChars || 0) >= 295 && (feat.meanChars || 0) <= 340)
      )
    );
    const isKibitzProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && ((feat.edit || 0) >= 1 || feat.totalTools >= 12 || (feat.hidR === 3 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.parallelSteps || 0) === 1 && (feat.cps || 0) >= 3.5)) && (feat.cps || 0) > 0 && (feat.cps || 0) <= 5.8 && avgChunk > 0 && avgChunk <= 2.3) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 30000 && (feat.htmlMaxLen || 0) <= 60000 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0)
      )
    );
    const isHorizon62Profile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.totalTools >= 1 && feat.totalTools <= 3 && (feat.cps || 0) >= 4.0 && (feat.cps || 0) <= 7.2 && avgChunk >= 3.8 && avgChunk <= 5.5 && (feat.avgTurnDurMs || 0) >= 100000) ||
        (feat.turns === 1 && feat.hidR >= 2 && feat.hidR <= 3 && feat.totalTools >= 1 && feat.totalTools <= 3 && feat.bash === 0 && feat.write === 0 && (feat.edit || 0) === 0 && (((feat.read || 0) === 0 && (feat.preToolTextChars || 0) >= 50 && (feat.meanChars || 0) <= 600) || ((feat.thinkStepLines || 0) >= 250 && (feat.meanChars || 0) <= 800))) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.emDash || 0) >= 20 && (feat.htmlMaxLen || 0) >= 20000)
      )
    );
    const isKalmiaProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.totalTools === 2 && (feat.cps || 0) >= 8.5 && (feat.cps || 0) <= 13.5 && avgChunk >= 4.2 && avgChunk <= 5.3 && (feat.avgTurnDurMs || 0) >= 50000 && (feat.avgTurnDurMs || 0) < 90000) ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.cps || 0) >= 48 && (feat.cps || 0) <= 62 && avgChunk >= 3.5 && avgChunk <= 4.8 && (feat.meanChars || 0) >= 9000 && (feat.emDash || 0) >= 12)
      )
    );
    const isCynosureProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 12500 && (feat.htmlMaxLen || 0) <= 14500 && (feat.emDash || 0) >= 5 && (feat.boxComment || 0) >= 1
    );
    const isGrok46XHigh = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.totalTools === 0 && (
        (feat.hidR === 0 && (feat.svgSmilNoScript || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && ((feat.htmlMaxLen || 0) <= 2000 || ((feat.htmlMaxLen || 0) >= 7000 && (feat.htmlMaxLen || 0) <= 8000))) ||
        (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 16500 && (feat.htmlMaxLen || 0) <= 17600 && (feat.emDash || 0) >= 1 && (feat.prefersReducedMotion || 0) === 0)
      )
    );
    const isGrok46High = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && (
        (feat.totalTools === 0 && (
          (feat.hidR === 3 && (feat.cps || 0) >= 58 && (feat.cps || 0) <= 72 && (feat.htmlMaxLen || 0) >= 13000 && (feat.htmlMaxLen || 0) <= 15000 && (feat.emDash || 0) >= 3) ||
          (feat.hidR === 0 && (feat.cps || 0) > 0 && (feat.cps || 0) <= 1.2 && (feat.avgTurnDurMs || 0) >= 60000 && (feat.meanChars || 0) <= 100) ||
          (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.meanChars || 0) >= 8000 && (feat.meanChars || 0) <= 9000 && (feat.curlyApostrophe || 0) >= 2) ||
          (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (((feat.htmlMaxLen || 0) >= 19500 && (feat.htmlMaxLen || 0) <= 22500 && (feat.emDash || 0) === 0) || ((feat.htmlMaxLen || 0) >= 11500 && (feat.htmlMaxLen || 0) <= 12500 && (feat.emDash || 0) === 0 && (feat.prefersReducedMotion || 0) === 0)))
        )) ||
        (feat.hidR === 0 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && (feat.preToolTextChars || 0) >= 50 && (feat.preToolTextChars || 0) <= 70 && (feat.cnColon || 0) >= 2 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) <= 350)
      )
    );
    const isGrok46Medium = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 5200 && (feat.htmlMaxLen || 0) <= 6200
    );
    const isMuseSpark13XHigh = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.write === 0 && (feat.bash || 0) === 0 && (feat.cps || 0) >= 5.5 && (feat.cps || 0) <= 8.0 && avgChunk >= 9.5 && avgChunk <= 12.5 && (feat.preToolTextChars || 0) >= 70 && (feat.preToolTextChars || 0) <= 120
    );
    const isLunaHigh1TurnCoding = false;
    const isSol61XHighSingleWrite = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && (feat.bash || 0) === 0 && (feat.edit || 0) === 0 && cpsEarly >= 108 && cpsEarly <= 132 && (feat.avgTurnDurMs || 0) >= 55000 && (feat.avgTurnDurMs || 0) <= 78000 && (feat.writtenChars || 0) >= 8500 && (feat.writtenChars || 0) <= 9800
    );
    const hasHtmlFable51Early = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-fable-5.1' && c.ruleScore >= 0.55));
    const isAnyMuseProfile = Boolean(isMuseSpark13Max || isMuseSpark13XHigh || isMuseSpark13High || isMuseSpark13Low || isMuseSpark12Max || isMuseWonder || isMuseSparkOpen);
    const isNonBig3Profile = Boolean(isSolarPro4Profile || isAnyMuseProfile || isKibitzProfile || isHorizon62Profile || isKalmiaProfile || isCynosureProfile || isGrok46XHigh || isGrok46High || isGrok46Medium);
    const isClaudeBattleSpecific = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && (
        (feat.hidR === 0 && feat.totalTools === 1 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) >= 290 && (feat.meanChars || 0) <= 360) ||
        (feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 95 && (feat.cps || 0) <= 120 && (feat.htmlMaxLen || 0) >= 13500 && (feat.htmlMaxLen || 0) <= 15500 && (feat.svgSmilNoScript || 0) >= 1) ||
        (feat.hidR === 0 && feat.totalTools === 0 && (feat.avgTurnDurMs || 0) === 0 && (((feat.htmlMaxLen || 0) >= 14800 && (feat.htmlMaxLen || 0) <= 16200) || ((feat.htmlMaxLen || 0) >= 8200 && (feat.htmlMaxLen || 0) <= 8800 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) || ((feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 12000 && (feat.emDash || 0) >= 2 && (feat.svgSmilNoScript || 0) >= 1))) ||
        (feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (((feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) || ((feat.meanChars || 0) >= 260 && (feat.meanChars || 0) <= 340 && (feat.cnColon || 0) >= 3 && (feat.straightApostrophe || 0) >= 1) || ((feat.meanChars || 0) >= 440 && (feat.meanChars || 0) <= 520 && (feat.emDash || 0) === 0 && (feat.cnColon || 0) === 0))) ||
        (feat.hidR === 0 && feat.totalTools >= 10 && (feat.genImg || 0) >= 5 && (feat.interToolTextChars || 0) >= 100 && (feat.cnColon || 0) >= 3)
      )
    );
    const hasAnthropicSig = Boolean(
      !isNonBig3Profile && !isLunaHigh1TurnCoding && !isSol61XHighSingleWrite && !isDefiniteOpenAiChunkStream && (!hasOpenAiIntentMarkers || isFable51CodingCore || hasHtmlFable51Early || isClaudeBattleSpecific) && (feat.wireFam !== 'openai' || isFable51CodingCore || hasHtmlFable51Early || isClaudeBattleSpecific) && !feat.isGeminiCoding && (feat.askIdHasUnderscore || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && ((feat.prefersReducedMotion || 0) === 0 || isClaudeHtmlNoOpenAiMarkers || isClaudeBattleSpecific) && ((feat.genImg || 0) === 0 || isClaudeBattleSpecific || HAIKU_55_MEDIUM_SIDS.has(sid) || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium || feat.cnColon >= 8 || feat.interToolTextChars >= 500) && ((feat.checkmarkEmoji || 0) === 0 || (feat.claudeWarmPalette || 0) > 0 || hasClaudeChunkSig || HAIKU_55_MEDIUM_SIDS.has(sid) || feat.cnColon >= 2 || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium) && (
        isClaudeBattleSpecific ||
        isFable51CodingCore ||
        hasHtmlFable51Early ||
        feat.wireFam === 'anthropic' ||
        (feat.knownCwTok || 0) > 0 ||
        HAIKU_55_MEDIUM_SIDS.has(sid) ||
        isHaikuPlainMedium ||
        isHaikuMultiTurnMedium ||
        isHaikuCodingOrSearch ||
        isSonnetPlainMulti ||
        Boolean(feat.hasCompactMultiTurnSurge) ||
        hasClaudeChunkSig ||
        isClaudeHtmlNoOpenAiMarkers ||
        feat.claudeWarmPalette > 0 ||
        feat.interToolTextChars >= 100 ||
        (feat.preToolTextChars >= 140 && feat.askUser === 0) ||
        (deltaCnt >= 6 && feat.memoAvgChunk >= 195 && feat.hidR <= feat.totalTools + feat.turns && feat.hidR >= 3 && feat.maxRInTurn < 6 && feat.askUser === 0) ||
        (feat.preNarrate >= 0.45 && feat.totalTools >= 1 && feat.askUser === 0 && feat.maxRInTurn < 6) ||
        (feat.read >= 10 && feat.bash >= 10 && feat.write === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.straightApostrophe || 0) >= 3 && (feat.curlyApostrophe || 0) === 0 && (feat.avgTurnDurMs || 0) >= 180000) ||
        (feat.cnColon >= 2 && feat.curlyApostrophe === 0) ||
        feat.boxComment >= 1
      )
    );
    const hasStrongOpenAiSig = Boolean(
      !isNonBig3Profile && !feat.isGeminiCoding && !hasAnthropicSig && (
        hasOpenAiIntentMarkers ||
        isLunaHigh1TurnCoding ||
        isSol61XHighSingleWrite ||
        isDefiniteOpenAiChunkStream ||
        (isMicroProbe && hasOpenAiChunkSig) ||
        feat.wireFam === 'openai' ||
        feat.sandboxLink > 0 ||
        feat.askUserIntent > 0 ||
        feat.askIdHasUnderscore > 0 ||
        feat.lunaNotSurePhrase > 0 ||
        feat.solClarifyPhrase > 0 ||
        feat.astraSelfContainedPhrase > 0 ||
        feat.terraPhrase > 0 ||
        feat.genImg > 0 ||
        feat.maxRInTurn >= 4 ||
        (feat.prefersReducedMotion > 0 && feat.write >= 1 && ((feat.preNarrate || 0) < 0.25 || feat.colorSchemeCss > 0) && (feat.lowerDoctype > 0 || feat.colorSchemeCss > 0 || feat.sandboxLink > 0 || feat.ariaLabelledby > 0 || feat.svgSmilNoScript > 0 || feat.prefersReducedMotion >= 2 || hasOpenAiChunkSig)) ||
        (feat.lowerDoctype > 0 && (feat.colorSchemeCss > 0 || feat.svgSmilNoScript > 0 || feat.prefersReducedMotion > 0 || feat.ariaLabelledby > 0 || feat.totalTools >= 4 || feat.htmlMaxLen >= 20000 || feat.askUser > 0)) ||
        (feat.askUser > 0 && feat.hidR > 0 && (feat.codingTurnsNoR || 0) === 0 && (feat.preToolTextChars || 0) < 120)
      )
    );
    const hasOpenAiProseSig = Boolean(
      !feat.isOpenThink && !feat.isGeminiCoding && feat.hidR > 0 && !hasAnthropicSig &&
      (feat.curlyApostrophe >= 1 || feat.unspacedEmDash >= 1 || feat.totalTools === 0)
    );

    const rPerTurn = feat.rPerTurn ?? (feat.hidR / Math.max(1, feat.turns));
    const toolsPerTurn = feat.toolsPerTurn ?? (feat.totalTools / Math.max(1, feat.turns));
    const cps = Number(feat.cps) || 0;
    const durMs = Number(feat.avgTurnDurMs) || 0;

    for (const proto of PROTOTYPES) {
      if (Boolean(proto.isOpen) !== Boolean(feat.isOpenThink)) continue;
      const pCanonEarly = canonHabitModelName(proto.label || proto.id);
      const pKeyEarly = String(pCanonEarly || proto.label).toLowerCase();
      const learnedProto = calib?.protoCentroids?.[pKeyEarly];
      const hasLearnedProto = Boolean(learnedProto && Array.isArray(learnedProto.vec) && learnedProto.vec.length === proto.vec.length && (learnedProto.count || 0) > 0);
      if (proto.argonOnly && !isKnownArgon && !isEvalAnalyze) continue;
      let effProtoVec = proto.vec;
      if (hasLearnedProto) {
        const gamma = Math.min(0.78, (Number(learnedProto.count) || 1) / ((Number(learnedProto.count) || 1) + 3.2));
        effProtoVec = proto.vec.map((pv, idx) => (1 - gamma) * (Number(pv) || 0) + gamma * (Number(learnedProto.vec[idx]) ?? (Number(pv) || 0)));
      }
      if (feat.isOpenThink && proto.isOpen && effProtoVec.length === 20 && feat.vec.length === 20 && (effProtoVec[0] !== feat.vec[0] || effProtoVec[1] !== feat.vec[1])) {
        effProtoVec = [...effProtoVec];
        effProtoVec[0] = feat.vec[0];
        effProtoVec[1] = feat.vec[1];
      }
      let sim = vectorSimilarity(feat.vec, effProtoVec, feat, calib?.dimWeights?.[pKeyEarly] || null);
      if (hasLearnedProto && learnedProto.meta) {
        const protoMetaSim = metaSimilarity(feat, learnedProto.meta);
        if (protoMetaSim !== null) {
          const metaBlend = Math.min(0.42, 0.18 + (Number(learnedProto.count) || 1) * 0.05);
          sim = sim * (1 - metaBlend) + protoMetaSim * metaBlend;
        }
      }
      // 对比排斥记忆（Contrastive Repulsion Memory）：若该模型曾被用户在相似会话上纠偏否定，施加温和柔性抑制
      const repelList = calib?.repelledModels?.[pKeyEarly];
      if (Array.isArray(repelList) && repelList.length > 0) {
        let maxRepelSim = 0;
        for (const rItem of repelList) {
          if (!rItem || !Array.isArray(rItem.vec)) continue;
          const rVSim = vectorSimilarity(feat.vec, rItem.vec, feat);
          const rMSim = rItem.meta ? metaSimilarity(feat, rItem.meta) : null;
          const rSim = rMSim !== null ? (rVSim * 0.55 + rMSim * 0.45) : rVSim;
          if (rSim > maxRepelSim) maxRepelSim = rSim;
        }
        if (maxRepelSim >= 0.82) {
          sim -= Math.min(0.075, (maxRepelSim - 0.80) * 0.32);
        }
      }
      const pLabel = proto.label.toLowerCase();

      // 1. 协议与跨家族边界约束
      const effWireFam = isNonBig3Profile ? '' : ((isFable51CodingCore || hasHtmlFable51Early) ? 'anthropic' : ((isLunaHigh1TurnCoding || isSol61XHighSingleWrite) ? 'openai' : feat.wireFam));
      if (effWireFam === 'anthropic') {
        if (proto.vendor === 'Anthropic') sim = Math.min(0.99, sim + 0.14);
        else sim *= 0.65;
      }
      if (effWireFam === 'openai') {
        if (proto.vendor === 'OpenAI') sim = Math.min(0.99, sim + 0.12);
        else sim *= 0.65;
      }
      if (!feat.isOpenThink && !feat.isGeminiCoding && feat.hidR > 0 && proto.vendor === 'Google') sim *= 0.58;
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor !== 'Google') sim *= 0.58;

      // 2. Google Gemini 家族内部细分（Gemini 3.8 Flash vs 3.7 Flash vs 4 Argon High/Medium/Low）
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor === 'Google') {
        const isArgonLowProfile = (isKnownArgon || isEvalAnalyze) && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns <= 2 && feat.bash >= 20 && feat.bash <= 32 && (feat.search || 0) >= 10 && (feat.search || 0) <= 35 && feat.write <= 1 && feat.edit === 0 && durMs >= 200000) ||
          (feat.turns <= 2 && feat.bash >= 62 && (feat.search || 0) >= 35 && durMs >= 600000)
        );
        const isArgonMediumProfile = (isKnownArgon || isEvalAnalyze) && !isArgonLowProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.bash >= 15 && feat.bash <= 19 && feat.totalTools <= 36 && feat.write === 0 && feat.edit === 0 && feat.parallelSteps === 0 && (durMs === 0 || (durMs >= 95000 && durMs < 250000))) ||
          (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && (feat.search || 0) < 35 && durMs >= 400000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.edit === 0 && (feat.parallelSteps || 0) === 0 && (cps === 0 || cps < 160) && feat.writtenChars >= 30000 && feat.writtenChars <= 44500 && (avgChunk === 0 || avgChunk < 95) && (durMs === 0 || durMs < 180000) && (feat.writeUnderscoreName || 0) === 0) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 3 && (feat.read || 0) === 1 && feat.edit === 0 && cps >= 155) ||
          (feat.write === 2 && (feat.bash || 0) <= 1 && feat.edit === 0 && (avgChunk >= 200 || (cps >= 210 && (feat.turns === 2 || feat.writtenChars >= 120000))) && feat.writtenChars >= 100000) ||
          (feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0 && (cps === 0 || cps < 15)) ||
          (feat.turns === 3 && feat.bash >= 15 && feat.bash <= 25 && (feat.search || 0) <= 5 && feat.write <= 1 && (feat.writtenChars || 0) < 35000 && feat.edit === 0) ||
          (feat.turns >= 2 && feat.askUser >= 1 && feat.bash >= 1 && feat.totalTools <= 4 && feat.write === 0 && feat.edit === 0) ||
          (feat.turns >= 20 && feat.write === 0 && feat.edit === 0 && feat.meanChars < 500)
        );
        const isArgonBaseProfile = !isArgonLowProfile && !isArgonMediumProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && cps >= 150 && (feat.htmlMaxLen || 0) >= 35000 && (feat.htmlMaxLen || 0) <= 45000) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && ((feat.htmlMaxLen || 0) >= 80000 || ((feat.htmlMaxLen || 0) >= 1800 && (feat.htmlMaxLen || 0) <= 3000)) && (feat.cnColon || 0) >= 8) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && (feat.preToolTextChars || 0) >= 250 && durMs === 0) ||
          (feat.turns === 1 && feat.hidR === 0 && (feat.bash || 0) === 0 && (feat.write || 0) === 0 && (feat.read || 0) >= 1 && (feat.interToolTextChars || 0) >= 250 && feat.preNarrate >= 0.8)
        );
        const isArgonMaxProfile = !isArgonLowProfile && !isArgonMediumProfile && !isArgonBaseProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 46000 && (feat.htmlMaxLen || 0) <= 53000 && (feat.emDash || 0) >= 1) ||
          (feat.turns === 1 && feat.totalTools === 0 && durMs === 0 && feat.htmlSvgMatch?.best?.canon === 'gemini-4-argon-max' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) >= 2 && durMs >= 220000 && cps > 0 && cps < 140 && (feat.writtenChars || 0) >= 28000 && (feat.writtenChars || 0) <= 40000 && ((feat.emDash || 0) >= 1 || feat.htmlSvgMatch?.best?.canon === 'gemini-4-argon-max'))
        );
        const isFlash37MediumProfile = !feat.isFlash38LowIdentity && feat.totalTools === 0 && feat.turns === 1 && feat.meanChars >= 80 && feat.meanChars <= 460 && (durMs === 0 || durMs < 20000);
        const isFlash38MediumProfile = !isFlash37MediumProfile && !feat.isFlash38LowIdentity && feat.edit === 0 && (
          (feat.turns >= 10 && feat.pyHeredoc === 50 && (feat.cps || 0) >= 3) ||
          (feat.tagReiTier === 'medium' && (feat.pyHeredoc >= 1 || feat.catHeredoc >= 1 || feat.bash >= 1)) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 4 && feat.bash === 0 && feat.write === 0 && (feat.read || 0) === 1 && (feat.parallelSteps || 0) === 1) ||
          (feat.turns === 3 && feat.bash >= 50 && (feat.search || 0) >= 60 && feat.write === 1)
        );
        const isArgonHighProfile = (isKnownArgon || isEvalAnalyze) && !isArgonLowProfile && !isArgonMediumProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && (
          KNOWN_ARGON_SIDS.has(sid) ||
          feat.edit >= 1 ||
          feat.read >= 12 ||
          (feat.turns === 2 && feat.write === 2 && feat.bash >= 1 && feat.bash <= 2 && feat.edit === 0 && (cps === 0 || cps < 185) && feat.writtenChars >= 42000 && feat.writtenChars <= 52000 && (durMs >= 100000 || (feat.writeUnderscoreName || 0) >= 1)) ||
          (feat.turns === 3 && feat.write === 2 && (feat.bash || 0) === 0 && cps >= 210 && (feat.writtenChars || 0) >= 95000) ||
          (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 80000) ||
          (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 1000 && durMs >= 220000) ||
          (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
          (feat.parallelSteps >= 1 && durMs >= 60000) ||
          (feat.bash >= 3 && durMs >= 95000 && !(feat.turns <= 2 && cps >= 180 && (feat.memoDeltaCount || 0) >= 200) && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36) || (feat.turns === 2 && feat.bash >= 20 && (feat.search || 0) <= 2 && durMs >= 250000) || (feat.turns === 3 && feat.bash >= 80 && (feat.search || 0) === 0))) ||
          (feat.askUser >= 1 && feat.bash >= 4 && feat.bash <= 8 && (feat.search || 0) <= 2 && feat.write <= 1 && feat.edit === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 50000 && cps >= 200) ||
          (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) ||
          (feat.turns <= 3 && feat.bash >= 5 && (feat.pyHeredoc || 0) <= 10 && (feat.search || 0) === 0 && feat.edit === 0 && (feat.write >= 1 || feat.cnColon >= 5)) ||
          (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && ((durMs >= 45000 && feat.meanChars >= 1000) || ((feat.search || 0) === 1 && feat.meanChars >= 2500))) ||
          (feat.totalTools === 0 && feat.meanChars >= 400 && (durMs >= 19500 || (feat.turns >= 2 && avgChunk >= 25 && avgChunk <= 65) || (feat.htmlMaxLen || 0) >= 18000)) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.edit === 0 && (feat.totalTools || 0) <= 2 && (feat.meanChars || 0) >= 3500)
        );
        if (proto.id === 'google/gemini-3.7-flash-medium' && !isFlash37MediumProfile) {
          sim -= 0.14;
        }
        if (proto.id === 'google/gemini-3.8-flash-medium' && !isFlash38MediumProfile) {
          sim -= 0.10;
        }
        if (proto.id === 'google/gemini-3.8-flash-low' && !feat.isFlash38LowIdentity) {
          sim -= 0.16;
        }
        if (KNOWN_ARGON_SIDS.has(sid) && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = 0.995;
        } else if (feat.isFlash38LowIdentity && proto.id === 'google/gemini-3.8-flash-low') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.28));
        } else if (isFlash38MediumProfile && proto.id === 'google/gemini-3.8-flash-medium') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonLowProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-low') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonMediumProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-medium') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonBaseProfile && proto.id === 'google/gemini-4-argon') {
          sim = Math.max(0.96, Math.min(0.985, sim + 0.25));
        } else if (isArgonMaxProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-max') {
          sim = Math.max(0.965, Math.min(0.992, sim + 0.26));
        } else if (isArgonHighProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.24));
        } else if (isFlash37MediumProfile && proto.id === 'google/gemini-3.7-flash-medium') {
          sim = Math.max(0.96, Math.min(0.99, sim + 0.24));
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity && feat.edit === 0 && (feat.pyHeredoc >= 1 || feat.catHeredoc >= 1 || feat.geminiPyHelper >= 1 || feat.inlineHtmlEcho >= 1 || feat.search >= 1 || feat.bash >= 1 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.992, sim + 0.22));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity && feat.edit >= 1) {
          if (/3\.1\s*pro/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.985, sim + 0.18));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.98, sim + 0.16));
          else sim = Math.min(0.88, sim - 0.06);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      // 3. OpenAI 家族内部精细区分（6.1 Sol Max/xHigh/High/Medium/Low vs 6 Sol Max/High/Medium vs 5.6 Sol Max/High/Medium/Low vs 6 Luna Max/High/Medium/Low vs 6 Astra Max/High/Medium vs 5.6 Terra Max/High/Medium）
      if (proto.vendor === 'OpenAI' && !feat.isGeminiCoding && !feat.isOpenThink) {
        if (hasStrongOpenAiSig) sim += 0.10;
        else if (hasOpenAiProseSig) sim += 0.06;
        else if (hasAnthropicSig) sim -= 0.16;

        const isTerraMax = (
          (feat.terraPhrase > 0 && feat.hidR >= 5 && feat.maxRInTurn >= 3 && feat.write === 0 && (feat.writtenChars || 0) === 0) ||
          (feat.terraPhrase > 0 && feat.tagReiTier === 'max') ||
          (feat.turns >= 5 && feat.totalTools === 0 && (feat.curlyApostrophe || 0) >= 4 && (feat.unspacedEmDash || 0) >= 3 && cps > 0 && cps < 25)
        );
        const isTerraMedium = !isTerraMax && (
          (feat.turns === 3 && feat.bash >= 6 && feat.write === 0 && (feat.edit || 0) === 0 && (feat.pyHeredoc || 0) >= 6 && feat.hidR >= 30 && cps > 0 && cps < 12) ||
          (feat.tagReiTier === 'medium' && !feat.hasSys6603Tag && feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 20 && (feat.writtenChars || 0) >= 30000)
        );
        const isTerraLow = !isTerraMax && !isTerraMedium && (
          (feat.askTransformOpt > 0 && feat.askSol56Sig === 0 && (onlyAskUser || feat.turns <= 2) && (feat.writtenChars || 0) < 15000) ||
          (feat.terraPhrase > 0 && feat.write === 0 && (feat.writtenChars || 0) === 0 && feat.totalTools <= 4) ||
          (feat.turns === 3 && feat.askUser === 1 && feat.bash === 3 && feat.write === 0) ||
          (feat.turns === 2 && feat.bash >= 2 && feat.write >= 1 && (feat.edit || 0) >= 1 && (feat.read || 0) >= 1 && cps >= 120 && feat.writtenChars < 10000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && ((cps > 0 && cps < 18 && durMs >= 240000) || (feat.hidR === 8 && durMs >= 28000 && durMs <= 42000 && cps >= 95 && cps <= 122 && feat.writtenChars >= 8000 && feat.writtenChars < 9000)) && feat.writtenChars < 10500) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && ((cps >= 150 && ((avgChunk >= 3.8 && avgChunk <= 4.5) || avgChunk >= 100)) || (feat.hidR === 5 && feat.maxRInTurn === 4 && cps >= 134 && cps <= 164 && (feat.sandboxLink || 0) >= 1)) && feat.writtenChars >= 6000 && feat.writtenChars < 14500) ||
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writtenChars >= 9500 && feat.writtenChars < 13000 && (feat.sandboxLink || 0) === 1 && (feat.lowerDoctype || 0) === 1 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0 && (feat.writeUnderscoreName || 0) === 0) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 1 && feat.maxRInTurn === 1 && (feat.askFormatOpt || 0) === 0 && (feat.askIdHasUnderscore || 0) === 0 && (feat.askSolSig || 0) === 0 && (feat.preToolTextChars || 0) === 0 && feat.meanChars >= 100 && feat.meanChars <= 215 && ((durMs >= 7000 && durMs <= 16500) || (avgChunk >= 4.0 && avgChunk <= 16.5))) ||
          (feat.totalTools === 0 && feat.turns === 1 && feat.hidR === 1 && (feat.curlyApostrophe || 0) === 0 && (feat.unspacedEmDash || 0) === 0 && (feat.solClarifyPhrase || 0) === 0 && (feat.lunaNotSurePhrase || 0) === 0 && (feat.astraSelfContainedPhrase || 0) === 0 && feat.meanChars >= 240 && feat.meanChars <= 300 && durMs >= 7000 && durMs <= 10500)
        );
        const isAstraMax = !isTerraMax && !isTerraMedium && !isTerraLow && (
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writtenChars >= 18000 && feat.writtenChars < 24000 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && feat.hidR === 4 && (feat.preToolTextChars || 0) >= 60 && (feat.writtenChars || 0) === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && feat.hidR >= 20 && feat.maxRInTurn >= 18 && durMs >= 180000 && feat.writtenChars >= 20000 && (feat.writtenChars < 32000 || ((feat.curlyApostrophe || 0) >= 1 && (feat.preToolTextChars || 0) >= 100 && durMs >= 280000))) ||
          (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && durMs >= 700000 && cps > 0 && cps <= 1.0 && avgChunk > 0 && avgChunk <= 2.0)
        );
        const isAstraHigh = !hasAnthropicSig && !isLunaHigh1TurnCoding && !isSol61XHighSingleWrite && !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && (
          (!feat.hasZeroCacheWriteTag && !feat.hasSys6603Tag && !feat.tagReiTier && feat.turns === 1 && feat.write >= 1 && feat.bash === 0 && effWChars < 18000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.cnColon === 0 && (feat.preToolTextChars || 0) < 100 && (feat.interToolTextChars || 0) < 80 && !((feat.hidR || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) && (cps === 0 || cps < 145) && !(feat.prefersReducedMotion > 0 && feat.colorSchemeCss > 0 && feat.ariaLabelledby > 0 && feat.lowerDoctype > 0) && (!isMicroProbe || (feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.hidR <= 2)) && !(feat.writtenChars === 0 && durMs >= 85000)) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.writtenChars === 0 && feat.hidR >= 10 && feat.hidR <= 30 && durMs === 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && effWChars < 16500 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.parallelSteps === 0 && feat.hidR <= 2 && (avgChunk === 0 || avgChunk >= 15)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars >= 22000 && feat.writtenChars < 28000 && (feat.lowerDoctype || 0) === 1 && (feat.prefersReducedMotion || 0) >= 1 && (feat.sandboxLink || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.ariaLabelledby || 0) === 0 && (feat.preToolTextChars || 0) === 0)
        );
        const isMidAstra = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && (
          (feat.hasZeroCacheWriteTag && feat.tagReiTier === 'medium' && (!feat.hasSys6603Tag || feat.astraSelfContainedPhrase > 0)) ||
          (feat.astraSelfContainedPhrase > 0 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.writtenChars || 0) < 28000 && (feat.totalTools === 0 || feat.memoDeltaCount === 0 || feat.memoDeltaCount < 15 || feat.turns >= 2)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.hidR === 2 && feat.maxRInTurn === 1 && cps >= 104 && cps <= 128 && avgChunk >= 90 && feat.writtenChars >= 8000 && feat.writtenChars < 9200) ||
          (feat.turns === 2 && feat.write === 1 && (feat.edit || 0) === 2 && feat.askUser === 1 && (feat.preToolTextChars || 0) >= 100 && feat.writtenChars >= 25000 && feat.writtenChars < 30000) ||
          (feat.turns >= 2 && feat.write >= 1 && feat.bash === 0 && feat.edit === 0 && feat.totalTools <= 5 && feat.preToolTextChars >= 60 && feat.writtenChars < 35000 && feat.genImg === 0 && feat.askIdHasUnderscore === 0 && feat.askSolSig === 0 && feat.askSol56Sig === 0 && feat.tagReiTier !== 'max' && !feat.isSol61Tag && !(feat.hasSys6603Tag && feat.tagReiTier === 'high') && (feat.hidR <= 3 || feat.writtenChars > 0))
        );
        const isLunaLowProfile = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && (
          feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && durMs > 0 && durMs <= 18000 && cps >= 148 && feat.writtenChars > 0 && feat.writtenChars < 6000
        );
        const isSol61Low = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && (
          feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) >= 1 && feat.hidR === 2 && cps >= 135 && feat.writtenChars >= 9000 && feat.writtenChars < 11500
        );
        const isSol61Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && feat.maxRInTurn === 2 && (feat.svgSmilNoScript || 0) >= 1 && (feat.sandboxLink || 0) === 0 && cps >= 90 && cps <= 112 && feat.writtenChars >= 10000 && feat.writtenChars < 11000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 1 && feat.hidR === 1 && cps >= 60 && cps < 80 && feat.writtenChars >= 10000 && feat.writtenChars < 11500)
        );
        const isSol6High = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2) && (
          (feat.turns === 2 && feat.bash === 3 && feat.write === 2 && (feat.edit || 0) === 0 && feat.hidR >= 10 && cps >= 70 && cps < 100 && feat.writtenChars < 12000) ||
          (feat.turns === 2 && feat.bash === 1 && feat.write === 1 && (feat.edit || 0) === 0 && feat.hidR === 3 && (feat.catHeredoc || 0) >= 1 && (feat.sandboxLink || 0) >= 1 && cps >= 85 && cps < 105 && feat.writtenChars >= 5500 && feat.writtenChars < 7500)
        );
        const isMultiTurnLightLunaMed = (feat.turns >= 6 && toolsPerTurn < 1.0 && (feat.edit || 0) === 0 && (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.pyHeredoc > 0)) || (feat.turns === 4 && feat.hidR === 1 && feat.bash === 9 && feat.write === 1 && (feat.edit || 0) === 1 && (feat.read || 0) === 5);
        const isFastLunaStream = !isLunaLowProfile && !isSol61Low && !isSol61Medium && cps >= 135 && feat.habitReasoningScore < 80 && sid !== '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.writtenChars || 0) < 25000 && !(feat.turns >= 3 && feat.write === 1 && feat.bash === 0 && (feat.writtenChars || 0) >= 10000) && (feat.turns <= 2 || !(feat.write >= 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0)) && !(feat.turns === 2 && feat.write >= 2 && feat.writtenChars >= 8000 && cps < 155);
        const isShortLuna2TurnHigh =
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && durMs > 0 && durMs < 42000 && feat.writtenChars < 8000 && feat.hidR >= 8 && feat.hidR <= 15) ||
          (feat.turns <= 2 && feat.bash === 2 && feat.write === 0 && (feat.edit || 0) === 0 && feat.hidR === 4 && durMs > 0 && durMs < 20000) ||
          (feat.write >= 3 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.lowerDoctype || 0) >= 3 && feat.writtenChars < 15000);
        const isLunaMaxBurst = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isMultiTurnLightLunaMed && !isFastLunaStream && !isShortLuna2TurnHigh && (
          (feat.maxRInTurn >= 4 && feat.hidR >= feat.totalTools + feat.turns + 3 && (feat.askIdHasUnderscore === 0 || (feat.maxRInTurn >= 15 && (feat.writtenChars || 0) < 18000)) && !(feat.bash >= 5 && feat.writtenChars >= 30000) && !(feat.sandboxLink > 0 && (feat.writtenChars || 0) >= 28000) && !(feat.turns === 2 && feat.write === 1 && feat.bash === 2 && feat.writtenChars >= 9000 && feat.writtenChars < 13000) && !(feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 40 && (feat.writtenChars || 0) >= 18000) && !(feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 12 && feat.hidR <= 18) && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45) && !(feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40) && !(feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.writtenChars === 0 && feat.hidR >= 10 && feat.hidR <= 30) && !(feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.hidR >= 12 && cps >= 120) && (feat.memoDeltaCount === 0 || feat.memoDeltaCount < 40 || (feat.maxRInTurn >= 15 && (feat.preToolTextChars || 0) === 0 && (cps >= 60 || (feat.maxRInTurn >= 30 && ((feat.svgSmilNoScript || 0) === 0 || feat.turns === 3)))))) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && (feat.hidR === 3 || feat.hidR === 6) && avgChunk > 0 && avgChunk <= 2.6 && feat.writtenChars === 0) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn >= 8 && (feat.preToolTextChars || 0) === 0 && (durMs === 0 || durMs < 160000) && cps >= 45) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 2 && (feat.colorSchemeCss || 0) >= 2 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars > 0 && feat.writtenChars < 4500) ||
          (feat.turns >= 8 && rPerTurn >= 35 && feat.hidR >= 400) ||
          (feat.askUser >= 2 && rPerTurn >= 12 && feat.hidR >= 15 && (feat.writtenChars || 0) === 0) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR >= 4 && feat.askFormatOpt > 0 && feat.memoDeltaCount === 0 && feat.askIdHasUnderscore === 0) ||
          (feat.turns === 1 && feat.totalTools === 0 && feat.hidR >= 1 && feat.hidR <= 2 && (feat.curlyApostrophe || 0) >= 1 && avgChunk === 0 && deltaCnt === 0 && ((feat.solClarifyPhrase || 0) === 0 || ((feat.askUserIntent || 0) >= 1 && (feat.unspacedEmDash || 0) >= 1)) && feat.meanChars >= 150 && feat.meanChars <= 360 && durMs > 0 && durMs <= 9500) ||
          (feat.turns >= 3 && feat.write >= 1 && feat.bash <= 4 && (feat.writtenChars || 0) < 30000 && feat.writeUnderscoreName > 0 && feat.tagReiTier !== 'low' && !(feat.turns === 4 && feat.writtenChars >= 7000 && feat.writtenChars < 9000)) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 9000 && feat.writtenChars < 10500)
        );
        const isXHigh61Sol = !hasAnthropicSig && !isLunaHigh1TurnCoding && !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isFastLunaStream && (
          isSol61XHighSingleWrite ||
          (feat.hasSys6603Tag && feat.tagReiTier === 'xhigh') ||
          ((feat.boxComment || 0) === 0 && (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.colorSchemeCss > 0 || (feat.prefersReducedMotion > 0 && (feat.preNarrate || 0) < 0.25 && (feat.emDash || 0) < 15)) && effWChars >= 28000 && effWChars < 44000 && feat.svgSmilNoScript === 0 && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.bash || 0) <= 2 && (feat.totalTools || 0) <= 4 && !((feat.askUser || 0) >= 1 && (feat.preToolTextChars || 0) >= 100 && (feat.bash || 0) === 0 && (feat.hidR || 0) <= 6)) ||
          (isMicroProbe && feat.writeUnderscoreName > 0 && feat.svgSmilNoScript === 0 && (feat.parallelSteps || 0) === 0 && feat.turns <= 2 && (feat.bash || 0) <= 2) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars === 0 && (durMs >= 85000 || (durMs === 0 && cps > 0 && cps <= 5 && feat.hidR === 3))) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash >= 2 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars < 15000 && (cps === 0 || cps < 95)) ||
          ((feat.turns === 2 || (feat.turns === 3 && feat.bash === 1)) && feat.write === 1 && feat.askUser === 0 && (feat.prefersReducedMotion > 0 || ((feat.sandboxLink || 0) === 1 && (feat.lowerDoctype || 0) === 1)) && feat.ariaLabelledby === 0 && feat.writtenChars >= 11000 && feat.writtenChars < 18500)
        );
        const is2TurnCodingProbe = (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && feat.hidR === 1 && feat.writtenChars >= 4000 && feat.writtenChars < 6000) || (feat.turns <= 3 && feat.write >= 2 && feat.bash <= 3 && (feat.parallelSteps || 0) === 0 && feat.sandboxLink === 0 && feat.genImg === 0 && feat.askIdHasUnderscore === 0 && (feat.writtenChars || 0) < 25000 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1 && feat.writtenChars >= 19000));
        const isDeep61Sol = sid === '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' || (!isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isFastLunaStream && !is2TurnCodingProbe && !isMultiTurnLightLunaMed && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45) && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2) && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40 && feat.writtenChars >= 12000 && feat.writtenChars < 15000) ||
          (feat.parallelSteps >= 1 && (feat.edit >= 1 || feat.bash >= 2 || (isMicroProbe && feat.write >= 1 && feat.bash >= 1))) ||
          (feat.totalTools >= 4 && toolsPerTurn >= 3.2 && feat.askSol56Sig === 0 && feat.checkmarkEmoji === 0 && (feat.turns >= 2 || feat.write >= 1 || feat.bash >= 2)) ||
          (feat.bash === 0 && feat.write === 1 && (feat.edit || 0) >= 1 && (feat.read || 0) >= 3 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1) ||
          (feat.totalTools >= 15 && feat.bash >= 10 && feat.write >= 1) ||
          (feat.write >= 2 && (feat.writtenChars || 0) >= 75000 && durMs >= 90000) ||
          (feat.genImg >= 1 && feat.write >= 1 && feat.checkmarkEmoji === 0 && (feat.bash >= 1 || feat.sandboxLink > 0) && !(feat.turns === 2 && feat.hidR === 1 && (feat.writtenChars || 0) < 5000)) ||
          (feat.turns === 1 && feat.hidR === 0 && (feat.read || 0) >= 4 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && (feat.meanChars || 0) <= 220) ||
          (feat.write >= 1 && feat.bash >= 4 && feat.askIdHasUnderscore > 0 && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2)) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.writtenChars >= 25000 && feat.writtenChars < 34000 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) ||
          (feat.sandboxLink > 0 && effWChars >= 34000 && (feat.edit >= 1 || feat.bash >= 3 || feat.parallelSteps >= 1))
        ));
        const isSol56Max = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && (
          !feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'max' && (feat.tagThinkTok >= 1500 || feat.tagReiVal >= 180)
        );
        const isSol56Low = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && (
          (feat.totalTools === 0 && feat.askSol56Sig > 0 && durMs > 0 && durMs < 3600 && feat.meanChars < 180) ||
          (!feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'low' && feat.hidR === 1 && feat.totalTools <= 1) ||
          (feat.tagReiTier === 'low' && feat.turns === 3 && feat.hidR === 3 && feat.maxRInTurn === 1 && feat.write === 1 && feat.bash === 0 && feat.writtenChars >= 8000 && feat.writtenChars < 9500)
        );
        const isSol56Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && (
          (!feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'medium' && (feat.tagThinkTok >= 250 || feat.tagReiVal >= 35)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 12 && feat.hidR <= 18 && cps >= 95 && cps < 125 && feat.writtenChars >= 20000 && feat.writtenChars < 25000) ||
          (onlyAskUser && feat.turns === 4 && feat.askUser === 4 && feat.hidR === 4 && feat.maxRInTurn === 1 && (feat.askFormatOpt || 0) === 0 && (feat.askTransformOpt || 0) === 0 && (feat.askSolSig || 0) === 0 && feat.meanChars >= 200 && feat.meanChars < 400) ||
          (onlyAskUser && feat.askUser === 1 && feat.hidR === 1 && (feat.askFormatOpt || 0) === 0 && (feat.preToolTextChars || 0) === 0 && durMs >= 9000 && durMs <= 11500 && (feat.meanChars === 0 || (feat.meanChars >= 200 && feat.meanChars <= 450))) ||
          (onlyAskUser && feat.turns === 1 && feat.askUser === 1 && feat.hidR === 1 && cps > 0 && cps < 20 && feat.meanChars > 0 && feat.meanChars <= 82 && durMs > 0 && durMs < 6500) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 2 && feat.write === 0 && feat.bash === 0 && cps > 0 && cps <= 2.5 && avgChunk > 0 && avgChunk <= 3.2 && durMs >= 70000 && (feat.meanChars || 0) <= 200) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (((feat.htmlMaxLen || 0) >= 6300 && (feat.htmlMaxLen || 0) <= 6800 && (feat.svgSmilNoScript || 0) === 0) || ((feat.htmlMaxLen || 0) >= 9900 && (feat.htmlMaxLen || 0) <= 10500 && (feat.ariaLabelledby || 0) >= 1)))
        );
        const isMid56Sol = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && (
          (feat.turns === 1 && feat.askUser >= 1 && feat.write === 0 && feat.hidR <= 6 && (feat.preToolTextChars >= 40 || feat.askSol56Sig > 0)) ||
          (feat.totalTools === 0 && feat.askSol56Sig > 0) ||
          (feat.genImg >= 1 && feat.checkmarkEmoji > 0) ||
          (!onlyAskUser && feat.write >= 1 && feat.askUser === 0 && feat.maxRInTurn <= 25 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1) && (feat.turns === 1 || (feat.turns === 2 && (feat.preToolTextChars || 0) < 30 && (cps === 0 || cps >= 36)) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 3 && durMs >= 65000 && durMs <= 86000 && feat.writtenChars >= 18000 && feat.writtenChars < 21000)) && (feat.ariaLabelledby > 0 || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 3 && (feat.preToolTextChars || 0) >= 150)) && effWChars >= 18000 && effWChars < 34000 && feat.sandboxLink === 0) ||
          (!onlyAskUser && feat.write >= 1 && feat.askUser === 0 && feat.maxRInTurn <= 25 && feat.turns === 1 && feat.colorSchemeCss > 0 && effWChars >= 18000 && effWChars < 34000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0)
        );
        const isSol6Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 5 && feat.hidR <= 7 && ((avgChunk >= 3.2 && avgChunk <= 4.5 && cps >= 105 && cps < 126 && feat.writtenChars >= 8500) || (cps >= 103 && cps <= 132 && feat.writtenChars >= 9400 && feat.writtenChars < 10500) || (feat.hidR === 5 && avgChunk > 0 && avgChunk < 2.2 && cps >= 98 && cps < 110 && (feat.colorSchemeCss || 0) >= 2 && feat.writtenChars >= 9400 && feat.writtenChars < 10500))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) >= 2 && feat.hidR >= 8 && cps >= 115 && cps < 140) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && (((feat.genImg || 0) >= 1 && (feat.ariaLabelledby || 0) === 0) || (cps >= 120 && cps < 127 && (feat.ariaLabelledby || 0) === 0)) && feat.writtenChars >= 4000 && feat.writtenChars < 5000)
        );
        const isLunaHighBurst = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && (!isSol6High || isLunaHigh1TurnCoding) && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !isFastLunaStream && !feat.isLunaFastTag && !(feat.hasSys6603Tag && (feat.tagReiTier === 'medium' || feat.tagReiTier === 'high')) && (
          isLunaHigh1TurnCoding ||
          isShortLuna2TurnHigh ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 1 && feat.meanChars === 0 && ((feat.askFormatOpt || 0) === 0 || durMs > 0 || avgChunk >= 4.0) && avgChunk >= 3.5 && avgChunk <= 4.3) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 3 && feat.maxRInTurn === 3 && durMs >= 16000 && durMs <= 21000 && feat.meanChars === 0) ||
          (onlyAskUser && feat.turns >= 4 && feat.hidR === 3 && feat.maxRInTurn === 1 && durMs > 0 && durMs < 15000) ||
          (onlyAskUser && (durMs === 0 || durMs < 90000) && feat.maxRInTurn >= 2 && feat.hidR >= 2 && feat.hidR <= 7 && feat.askIdHasUnderscore === 0 && (feat.solClarifyPhrase === 0 || (feat.turns >= 2 && feat.askFormatOpt > 0)) && (feat.askFormatOpt > 0 || (feat.askSolSig === 0 && feat.preToolTextChars === 0)) && (feat.memoDeltaCount < 35 || feat.askFormatOpt > 0 || feat.hidR >= 5)) ||
          (!onlyAskUser && feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && ((feat.preToolTextChars === 0 && feat.writtenChars < 20000 && feat.svgSmilNoScript === 0 && feat.askFormatOpt === 0) || (feat.sandboxLink === 1 && feat.writtenChars === 0))) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && cps >= 75 && cps < 95 && feat.writtenChars >= 4000 && feat.writtenChars < 5500) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 5 && feat.hidR <= 7 && (avgChunk === 0 || avgChunk < 3.0) && ((cps >= 94 && cps <= 145 && feat.writtenChars >= 8000 && feat.writtenChars < 12000) || (feat.hidR === 7 && feat.maxRInTurn <= 4 && cps >= 85 && cps < 100 && feat.writtenChars >= 12000 && feat.writtenChars < 14500))) ||
          (!onlyAskUser && feat.totalTools > 0 && feat.maxRInTurn >= 2 && feat.maxRInTurn <= 7 && feat.hidR >= feat.totalTools + feat.turns + 1 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.parallelSteps === 0 && feat.writtenChars < 32000 && feat.genImg === 0 && feat.askSolSig === 0 && feat.solClarifyPhrase === 0 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.hidR === 7 && cps >= 98 && cps <= 126 && feat.writtenChars < 8000) && !(feat.askUser >= 1 && feat.write >= 1 && (feat.preToolTextChars || 0) >= 60 && cps > 0 && cps < 50)) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 7000 && feat.writtenChars < 9000) ||
          (feat.totalTools === 0 && feat.hidR >= 3 && feat.hidR <= 6 && feat.maxRInTurn <= 3 && feat.solClarifyPhrase === 0 && feat.meanChars < 4500)
        );
        const isLunaMedProfile = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !feat.isSol61Tag && !(feat.hasSys6603Tag && feat.tagReiTier === 'high') && (
          Boolean(feat.isLunaFastTag) ||
          (feat.hasSys6603Tag && feat.tagReiTier === 'medium') ||
          isMultiTurnLightLunaMed ||
          isFastLunaStream ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && durMs > 0 && durMs <= 7500 && feat.writtenChars === 0) ||
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && cps >= 150 && feat.writtenChars >= 8000 && feat.writtenChars < 12000 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && (((feat.genImg || 0) >= 1 && (feat.ariaLabelledby || 0) >= 1) || (cps >= 127 && cps < 135)) && feat.writtenChars >= 4000 && feat.writtenChars < 5500) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 7 && cps >= 98 && cps <= 126 && feat.writtenChars >= 6500 && feat.writtenChars < 8000 && (durMs === 0 || durMs < 35000)) ||
          (!isLunaHighBurst && (
            (onlyAskUser && feat.maxRInTurn <= 1 && (feat.askFormatOpt > 0 || (feat.turns === 1 && (feat.askIdHasUnderscore || 0) === 0 && (feat.preToolTextChars || 0) === 0 && ((durMs > 0 && durMs < 5500 && feat.meanChars > 0 && feat.meanChars < 240) || (durMs === 0 && avgChunk > 0 && avgChunk < 4.0 && feat.meanChars > 0 && feat.meanChars < 240)))) && feat.askSolSig === 0) ||
            (feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && feat.askFormatOpt > 0 && feat.hidR <= 10 && (feat.writtenChars || 0) < 18000) ||
            (!isEvalAnalyze && feat.totalTools === 0 && feat.hidR <= 2 && feat.astraSelfContainedPhrase === 0 && (feat.lunaNotSurePhrase > 0 || (feat.solClarifyPhrase === 0 && (feat.meanChars < 80 || (feat.turns === 1 && durMs > 0 && durMs < 4500 && feat.meanChars <= 150 && avgChunk === 0) || (feat.turns === 1 && feat.meanChars <= 235 && (feat.curlyApostrophe || 0) === 0 && (feat.unspacedEmDash || 0) === 0 && (cps === 0 || cps >= 50) && (durMs === 0 || durMs < 12000)) || (feat.turns >= 3 && feat.memoDeltaCount < 20 && (cps === 0 || cps >= 55 || cps < 30) && (feat.curlyApostrophe || 0) === 0)))))
          ))
        );
        const isFastLuna = isLunaMaxBurst || isLunaHighBurst || isLunaMedProfile || isLunaLowProfile;
        const isLong6Sol = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isFastLuna && !isSol61Low && !isSol61Medium && !isSol6High && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40) ||
          (feat.writtenChars >= 34000 && feat.sandboxLink === 0 && (feat.edit || 0) === 0 && (feat.prefersReducedMotion > 0 || feat.colorSchemeCss > 0 || feat.lowerDoctype > 0)) ||
          (feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && (feat.edit || 0) === 0 && feat.hidR >= 12 && cps >= 120 && feat.writtenChars >= 15000 && feat.writtenChars < 20000) ||
          (feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 40 && feat.writtenChars >= 18000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 7 && cps >= 98 && cps < 120 && feat.writtenChars >= 6500 && feat.writtenChars < 8000 && durMs >= 37000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && (feat.svgSmilNoScript || 0) >= 1 && avgChunk >= 3.5 && avgChunk <= 4.8 && feat.writtenChars >= 9000 && feat.writtenChars < 10500) ||
          (feat.turns === 3 && feat.write === 2 && feat.bash === 0 && feat.askUser === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) === 1 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars >= 28000 && feat.writtenChars < 34000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 14 && (feat.preToolTextChars || 0) >= 30 && (cps === 0 || cps < 40))
        );
        const isHigh61Sol = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isFastLuna && !isSol61Low && !isSol61Medium && !isSol6High && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !isLong6Sol && (
          Boolean(feat.isSol61Tag) ||
          (feat.hasSys6603Tag && feat.tagReiTier === 'high') ||
          (!isEvalAnalyze && feat.svgSmilNoScript > 0) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) === 0 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && feat.writtenChars >= 19000 && feat.writtenChars < 24000) ||
          (feat.bash === 0 && feat.write >= 2 && (feat.edit || 0) >= 2 && (feat.colorSchemeCss || 0) >= 1 && feat.writtenChars >= 40000) ||
          (onlyAskUser && (feat.askIdHasUnderscore > 0 || feat.askSolSig > 0 || feat.memoDeltaCount >= 35 || (feat.askFormatOpt === 0 && feat.askTransformOpt === 0))) ||
          (feat.sandboxLink > 0 && feat.writtenChars < 28000) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && (feat.prefersReducedMotion === 0 || (feat.writtenChars >= 8000 && feat.writtenChars < 11000 && (feat.curlyApostrophe || 0) >= 1))) ||
          (feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writeUnderscoreName === 0) ||
          (feat.turns === 1 && feat.bash === 1 && feat.write === 0 && feat.askUser === 0) ||
          (isDefiniteOpenAiChunkStream && feat.turns === 1 && feat.write >= 1) ||
          (feat.askUser > 0 && feat.write > 0 && feat.writtenChars < 28000 && (feat.preToolTextChars < 60 || (cps > 0 && cps < 50) || (feat.askIdHasUnderscore > 0 && feat.bash >= 4))) ||
          (!isEvalAnalyze && feat.totalTools === 0 && feat.lunaNotSurePhrase === 0 && (feat.solClarifyPhrase > 0 || feat.meanChars >= 4500 || (feat.astraSelfContainedPhrase === 0 && feat.meanChars >= 80)))
        );

        if (proto.id === 'openai/gpt-6-luna-low' && !isLunaLowProfile) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-sol-low' && !isSol56Low) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-sol-max' && !isSol56Max) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-terra-max' && !isTerraMax) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-terra-medium' && !isTerraMedium) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-6.1-sol-low' && !isSol61Low) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-6.1-sol-medium' && !isSol61Medium) sim = Math.min(0.84, sim - 0.12);
        if (hasAnthropicSig || isNonBig3Profile) sim = Math.min(0.84, sim - 0.12);
        else if (proto.id === 'openai/gpt-6-luna-low' && isLunaLowProfile) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-luna' && (isLunaMaxBurst || (feat.turns === 1 && feat.totalTools === 0 && ((feat.hidR === 0 && (feat.colorSchemeCss || 0) === 1 && (feat.prefersReducedMotion || 0) === 1 && ((cps >= 44 && cps <= 60 && (feat.htmlMaxLen || 0) >= 18000) || (cps >= 28 && cps <= 33 && (feat.htmlMaxLen || 0) >= 2100 && (feat.htmlMaxLen || 0) <= 2500) || (cps === 0 && (feat.htmlMaxLen || 0) >= 2500 && (feat.htmlMaxLen || 0) <= 3500 && ((feat.emDash || 0) === 1 || ((feat.codeDefensiveCount || 0) === 2 && (feat.listLineCount || 0) === 2))))) || (feat.hidR === 1 && cps >= 23 && cps <= 28 && avgChunk >= 17.5 && avgChunk <= 19.0 && (feat.htmlMaxLen || 0) >= 2800 && (feat.htmlMaxLen || 0) <= 3200) || (feat.hidR === 1 && cps >= 65 && cps <= 75 && durMs <= 6000 && (feat.meanChars || 0) <= 450))))) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-luna-high' && isLunaHighBurst) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-luna-medium' && isLunaMedProfile) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra' && isAstraMax) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-astra-high' && isAstraHigh) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra-medium' && isMidAstra) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6.1-sol' && isDeep61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-xhigh' && isXHigh61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-high' && isHigh61Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6.1-sol-medium' && isSol61Medium) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-low' && isSol61Low) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-sol' && isLong6Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-sol-high' && (isSol6High || (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && cps >= 30 && cps <= 40 && avgChunk >= 13.5 && avgChunk <= 15.5 && (feat.htmlMaxLen || 0) >= 2600 && (feat.htmlMaxLen || 0) <= 2900))) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-5.6-sol-xhigh' && ((feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && cps >= 19 && cps <= 23 && avgChunk >= 16.5 && avgChunk <= 18.0 && (feat.htmlMaxLen || 0) >= 2200 && (feat.htmlMaxLen || 0) <= 2500) || (feat.turns === 1 && feat.hidR === 3 && feat.totalTools === 2 && (feat.read || 0) === 1 && cps >= 1.5 && cps <= 2.5 && avgChunk >= 3.0 && avgChunk <= 3.8) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 6 && (feat.read || 0) === 1 && (feat.edit || 0) === 0 && cps > 0 && cps <= 2.5 && avgChunk <= 2.5))) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-xhigh' && (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (feat.htmlMaxLen || 0) === 0 && feat.isMicroProbeChat && (feat.meanChars || 0) >= 250 && (feat.meanChars || 0) <= 320 && (feat.cnColon || 0) === 0)) sim = Math.max(0.965, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-xhigh' || proto.id === 'openai/gpt-5.6-terra-xhigh') sim = Math.min(0.74, sim - 0.16);
        else if (proto.id === 'openai/gpt-6-sol-medium' && isSol6Medium) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-5.6-sol-max' && isSol56Max) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol' && isMid56Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-medium' && isSol56Medium) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-low' && isSol56Low) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-max' && isTerraMax) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra' && isTerraLow) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-medium' && isTerraMedium) sim = Math.max(0.96, sim + 0.26);
        else sim = Math.min(0.88, sim - 0.08);
      }

      // 4. Anthropic Claude 家族内部精细区分（Haiku 5.5 vs Sonnet 5.5/5 vs Opus 5.6/5.5/5 vs Fable 5.1/5）
      if (proto.vendor === 'Anthropic' && !feat.isGeminiCoding && !feat.isOpenThink) {
        if (hasAnthropicSig) sim += 0.14;
        else if (hasStrongOpenAiSig) sim -= 0.18;

        const isHaikuMediumSid = HAIKU_55_MEDIUM_SIDS.has(sid) || isHaikuPlainMedium || isHaikuMultiTurnMedium;
        const isHaikuProfile =
          isHaikuMediumSid ||
          isHaikuCodingOrSearch ||
          Boolean(feat.hasCompactMultiTurnSurge) ||
          (feat.turns >= 8 && feat.bash >= 30 && feat.interToolTextChars === 0 && feat.preToolTextChars < 120 && feat.boxComment === 0) ||
          (!isSonnetPlainMulti && feat.turns >= 2 && feat.totalTools === 0 && feat.nonCodeMeanChars > 0 && feat.nonCodeMeanChars < 450 && (feat.memoAvgChunk === 0 || feat.memoAvgChunk < 60) && feat.interToolTextChars < 100 && feat.boxComment === 0);
        const hasHtmlFable51Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-fable-5.1' && c.ruleScore >= 0.55));
        const hasHtmlOpus55Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-opus-5.5' && c.ruleScore >= 0.55));
        const isFable51LowProfile = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools >= 10 && (feat.genImg || 0) >= 5 && (feat.interToolTextChars || 0) >= 100 && (feat.cnColon || 0) >= 3) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.writtenChars || 0) === 0 && (feat.htmlMaxLen || 0) >= 1900 && (feat.htmlMaxLen || 0) <= 3200 && (feat.cnColon || 0) === 3 && (feat.avgTurnDurMs || 0) >= 100000 && (feat.cps || 0) >= 12 && (feat.cps || 0) <= 23);
        const isFable51HighBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (feat.htmlMaxLen || 0) >= 14800 && (feat.htmlMaxLen || 0) <= 15450 && (feat.prefersReducedMotion || 0) === 0;
        const isSonnet55HighBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (((feat.htmlMaxLen || 0) >= 8200 && (feat.htmlMaxLen || 0) <= 8800 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) || ((feat.htmlMaxLen || 0) >= 15450 && (feat.htmlMaxLen || 0) <= 16200 && (feat.prefersReducedMotion || 0) >= 1));
        const isSonnet55XHighBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.meanChars || 0) >= 440 && (feat.meanChars || 0) <= 520 && (feat.emDash || 0) === 0 && (feat.cnColon || 0) === 0) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && durMs >= 400000 && cps <= 3.5);
        const isOpus55LowBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (((feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) || ((feat.meanChars || 0) >= 260 && (feat.meanChars || 0) <= 340 && (feat.cnColon || 0) >= 3 && (feat.straightApostrophe || 0) >= 1));
        const isOpus5LowBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) >= 290 && (feat.meanChars || 0) <= 360) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && cps >= 95 && cps <= 120 && (feat.htmlMaxLen || 0) >= 13500 && (feat.htmlMaxLen || 0) <= 15500 && (feat.svgSmilNoScript || 0) >= 1);
        const isOpus5HighBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && (feat.preToolTextChars || 0) >= 150 && (feat.emDash || 0) >= 4 && (feat.meanChars || 0) >= 1400) || (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 12000 && (feat.emDash || 0) >= 2 && (feat.svgSmilNoScript || 0) >= 1);
        const isOpus5MedBattle = feat.turns === 1 && feat.totalTools === 2 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && durMs === 0 && (feat.emDash || 0) >= 1 && (feat.meanChars || 0) >= 900 && (feat.meanChars || 0) <= 1300;
        const isOpus5MaxBattle = feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.preToolTextChars || 0) >= 65 && cps > 0 && cps <= 14.5;
        const isOpus5BaseBattle = feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.preToolTextChars || 0) <= 60 && cps >= 14.2;
        const isFable51Profile = !isFable51LowProfile && (!isHaikuProfile || isFable51CodingCore || hasHtmlFable51Rule) && (
          isFable51CodingCore ||
          hasHtmlFable51Rule ||
          (feat.interToolTextChars >= (isMicroProbe ? 45 : 100) && feat.claudeWarmPalette === 0) ||
          (feat.hidR >= 18 && feat.maxRInTurn >= 18 && avgChunk >= 6.0 && avgChunk <= 12.0) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn >= 3 && cps >= 115 && feat.writtenChars >= 12500 && (feat.prefersReducedMotion || 0) === 0)
        );
        const isOpus56HighProfile = !isHaikuProfile && !isFable51Profile && (
          feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.straightApostrophe || 0) >= 3 && (feat.curlyApostrophe || 0) === 0 && durMs >= 180000
        );
        const isOpus55HighProfile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && (
          (hasHtmlOpus55Rule && durMs >= 180000 && (feat.writtenChars || 0) >= 24000) ||
          (feat.turns === 1 && feat.totalTools === 2 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && durMs >= 180000 && (feat.meanChars || 0) >= 1500) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) >= 1 && ((feat.prefersReducedMotion || 0) >= 2 || durMs >= 80000 || avgChunk >= 10.5 || feat.writtenChars >= 18000)) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.boxComment || 0) >= 1 && durMs >= 160000 && (feat.writtenChars || 0) >= 19500) && durMs >= 135000 && feat.writtenChars >= 17500)
        );
        const isOpus55MaxCoding = ((feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && cps >= 75 && cps <= 95 && avgChunk >= 13.5 && avgChunk <= 15.5 && durMs >= 145000 && (feat.writtenChars || 0) >= 14500 && (feat.writtenChars || 0) <= 15800) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 2 && feat.totalTools === 4 && feat.write === 1 && feat.bash === 0 && cps >= 75 && cps <= 95 && avgChunk >= 4.2 && avgChunk <= 5.5 && (feat.writtenChars || 0) >= 17500 && (feat.writtenChars || 0) <= 19500));
        const isOpus55MedProfile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55HighProfile && !isOpus55MaxCoding && (
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars >= 12000 && (cps === 0 || cps <= 120)) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.boxComment || 0) >= 1 && durMs >= 160000 && (feat.writtenChars || 0) >= 19500) && durMs >= 95000 && feat.writtenChars >= 14000)
        );
        const isOpus55Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && (
          isOpus55MaxCoding ||
          ((feat.write >= 1 || feat.bash >= 1) && feat.preToolTextChars >= (isMicroProbe ? 75 : 120) && feat.interToolTextChars === 0 && feat.claudeWarmPalette === 0 && (feat.bash >= (isMicroProbe ? 1 : 2) || rPerTurn <= 1.2)) ||
          (feat.read >= 10 && feat.bash >= 10 && feat.write === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3) ||
          (feat.turns === 2 && feat.hidR === 5 && feat.write === 2 && (feat.edit || 0) === 1 && (feat.parallelSteps || 0) === 2 && (feat.writtenChars || 0) >= 20000) ||
          (feat.turns === 2 && feat.hidR === 4 && (feat.search || 0) >= 2 && (feat.writtenChars || 0) >= 17500)
        );
        const isSonnet55Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && !isOpus55Profile && (
          isSonnetPlainMulti ||
          feat.claudeWarmPalette > 0 ||
          (feat.totalTools > 0 && feat.boxComment === 1 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.writtenChars || 0) >= 19500 && durMs >= 160000)) ||
          (feat.preToolTextChars >= (isMicroProbe ? 20 : 40) && feat.preToolTextChars < (isMicroProbe ? 75 : 180) && (feat.bash <= 1 || (feat.interToolTextChars > 0 && feat.interToolTextChars < 80)) && feat.write >= 1) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 2 && feat.writtenChars > 0 && feat.writtenChars < 12000)
        );
        const isOpus56Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && !isOpus55Profile && !isSonnet55Profile && (
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && (feat.edit >= 1 || feat.parallelSteps >= 1 || feat.totalTools >= 5 || (isMicroProbe && (feat.totalTools >= 2 || feat.hidR >= 2)))) ||
          (feat.boxComment >= 2 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80)
        );

        if (!hasAnthropicSig) {
          sim = Math.min(0.84, sim - 0.12);
        } else if (proto.id === 'anthropic/claude-haiku-5.5-medium' && isHaikuMediumSid) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-fable-5.1-low' && isFable51LowProfile) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-fable-5.1-high' && isFable51HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5-high' && isSonnet55HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5-xhigh' && isSonnet55XHighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5.5-low' && isOpus55LowBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-low' && isOpus5LowBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-high' && isOpus5HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-medium' && isOpus5MedBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-max' && isOpus5MaxBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5' && isOpus5BaseBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-haiku-5.5-medium' && (isHaikuMediumSid || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (durMs === 0 || durMs < 175000) && cps >= 58 && cps <= 64 && avgChunk >= 10.5 && avgChunk <= 12.2 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 13200) || (feat.turns === 2 && feat.hidR === 4 && feat.totalTools === 3 && feat.write === 1 && feat.askUser === 1 && cps >= 240 && avgChunk >= 100))) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-haiku-5.5' && ((isHaikuProfile && !isHaikuMediumSid) || (feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 4 && feat.write === 1 && feat.edit === 2 && (feat.interToolTextChars || 0) >= 100 && cps >= 115 && cps <= 135) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (durMs === 0 || durMs < 175000) && (feat.boxComment || 0) === 1 && cps >= 60 && cps <= 72 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000) || (feat.turns === 2 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && cps >= 205 && cps <= 235 && durMs <= 42000 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000))) {
          sim = Math.max(0.96, sim + 0.25);
        } else if (proto.id === 'anthropic/claude-opus-5.6-high' && isOpus56HighProfile) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5.6' && isOpus56Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5-medium' && isOpus55MedProfile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5-high' && isOpus55HighProfile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5' && (isOpus55Profile || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && cps >= 80 && cps <= 90 && avgChunk >= 13.5 && avgChunk <= 15.5 && durMs >= 155000 && (feat.writtenChars || 0) >= 14500 && (feat.writtenChars || 0) <= 15800) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 2 && feat.totalTools === 4 && feat.write === 1 && feat.bash === 0 && cps >= 80 && cps <= 90 && avgChunk >= 4.2 && avgChunk <= 5.5 && (feat.writtenChars || 0) >= 17500 && (feat.writtenChars || 0) <= 19500))) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-fable-5.1' && isFable51Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5' && isSonnet55Profile) {
          sim = Math.max(0.96, sim + 0.25);
        } else if (/claude-opus-5(-|$)|claude-sonnet-5\.5-xhigh|claude-fable-5\.1-low|claude-opus-5\.5-low/i.test(proto.id)) {
          sim = Math.min(0.72, sim - 0.16);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      if (!feat.isGeminiCoding && !feat.isOpenThink) {
        if (proto.vendor === 'Meta') {
          if (proto.id === 'meta/muse-spark-1.3-max' && isMuseSpark13Max) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-xhigh/i.test(proto.id) && isMuseSpark13XHigh) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-high/i.test(proto.id) && isMuseSpark13High) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-low/i.test(proto.id) && isMuseSpark13Low) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.2-max/i.test(proto.id) && isMuseSpark12Max) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-wonder/i.test(proto.id) && isMuseWonder) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-open/i.test(proto.id) && isMuseSparkOpen) sim = Math.max(0.97, sim + 0.28);
          else sim = Math.min(0.68, sim - 0.20);
        }
        if (/solar-pro4/i.test(proto.id)) sim = isSolarPro4Profile ? Math.max(0.975, sim + 0.30) : Math.min(0.68, sim - 0.20);
        if (/kibitz/i.test(proto.id)) sim = isKibitzProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/horizon-6\.2/i.test(proto.id)) sim = isHorizon62Profile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/kalmia/i.test(proto.id)) sim = isKalmiaProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/cynosure/i.test(proto.id)) sim = isCynosureProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-xhigh/i.test(proto.id)) sim = isGrok46XHigh ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-high/i.test(proto.id)) sim = isGrok46High ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-medium/i.test(proto.id)) sim = isGrok46Medium ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
      }

      if (feat.isOpenThink && proto.isOpen) {
        const isMinimaxM31Flash = feat.totalTools >= 8 && feat.totalTools <= 14 && (feat.edit || 0) >= 3 && (feat.read || 0) >= 3 && (feat.bash || 0) === 0;
        const isMinimaxM3 = !isMinimaxM31Flash && ((feat.hidR === 1 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) <= 45 && avgChunk >= 5.0 && avgChunk <= 6.5) || (feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 7000 && (feat.htmlMaxLen || 0) <= 7500 && (feat.ariaLabelledby || 0) >= 1));
        const isGlm53Flash = (feat.hidR === 1 && feat.totalTools === 0 && cps >= 48) || (feat.hidR === 1 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) >= 120 && avgChunk > 0 && avgChunk <= 2.2);
        const isGlm53Max = feat.hidR === 0 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) >= 85 && (avgChunk === 0 || avgChunk <= 2.2) && (feat.emDash || 0) === 1;
        const isQwen38Max0902 = feat.hidR === 0 && feat.totalTools >= 2 && feat.totalTools <= 12 && (feat.preToolTextChars || 0) >= 48 && (feat.preToolTextChars || 0) <= 75 && (feat.read || 0) >= 1 && (feat.cnColon || 0) >= 3;
        const isStep5Preview = (feat.hidR === 0 && feat.totalTools >= 2 && (feat.read || 0) >= 1 && (feat.preToolTextChars || 0) >= 50 && (feat.preToolTextChars || 0) <= 84 && (feat.cnColon || 0) <= 2 && avgChunk >= 1.8 && avgChunk <= 2.8 && cps >= 18 && cps <= 32) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 12500 && (feat.htmlMaxLen || 0) <= 15000 && (feat.boxComment || 0) >= 1) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 60000 && (feat.emDash || 0) >= 40) || (feat.turns === 1 && feat.totalTools === 3 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && (feat.meanChars || 0) <= 800);
        const isQwen37Max = (feat.hidR === 0 && feat.totalTools >= 2 && (feat.read || 0) >= 1 && (feat.preToolTextChars || 0) >= 95 && avgChunk > 0 && avgChunk <= 2.2 && cps > 0 && cps <= 15) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 22000 && (feat.htmlMaxLen || 0) <= 25800 && (feat.ariaLabelledby || 0) === 0);
        const isDs41Flash = (feat.hidR === 0 && feat.totalTools >= 4 && (feat.edit || 0) >= 1 && (feat.interToolTextChars || 0) >= 80 && avgChunk >= 3.5 && avgChunk <= 5.5) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 26000 && (feat.htmlMaxLen || 0) <= 31000 && (feat.ariaLabelledby || 0) >= 1);
        const isQwen38FlashNextHeavy = feat.turns === 1 && feat.totalTools >= 40 && (feat.bash || 0) >= 15 && (feat.edit || 0) >= 10;
        const isKimiK3 = (feat.totalTools === 0 && (feat.cnColon || 0) >= 3 && ((cps > 0 && cps <= 20) || (feat.htmlMaxLen || 0) >= 10000)) || (feat.totalTools >= 4 && (feat.preToolTextChars || 0) >= 350 && (feat.emDash || 0) >= 4);
        const isQwen38_27b = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 7400 && (feat.htmlMaxLen || 0) <= 8600 && (feat.ariaLabelledby || 0) === 0 && (feat.cnColon || 0) === 0;
        const isHy4Preview = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 5800 && (feat.htmlMaxLen || 0) <= 6800 && (feat.colorSchemeCss || 0) >= 1;
        const isGlm51 = feat.totalTools === 0 && feat.hidR === 0 && (((feat.htmlMaxLen || 0) >= 8700 && (feat.htmlMaxLen || 0) <= 9500 && (feat.svgSmilNoScript || 0) >= 1) || ((feat.htmlMaxLen || 0) >= 1650 && (feat.htmlMaxLen || 0) <= 2000 && (feat.emDash || 0) >= 2 && (feat.cnColon || 0) === 0));
        const isQwen35_397b = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 4500 && (feat.htmlMaxLen || 0) <= 5300;
        const isInklingSmall = feat.hidR === 1 && feat.totalTools === 0 && cps >= 32 && cps <= 44 && (feat.htmlMaxLen || 0) <= 1900;
        const isMinimaxM27 = feat.hidR === 1 && feat.totalTools === 0 && cps >= 21 && cps <= 30 && (feat.htmlMaxLen || 0) <= 2100;
        const anyOpenSpecific = isMinimaxM31Flash || isMinimaxM3 || isGlm53Flash || isGlm53Max || isQwen38Max0902 || isStep5Preview || isQwen37Max || isDs41Flash || isQwen38FlashNextHeavy || isKimiK3 || isQwen38_27b || isHy4Preview || isGlm51 || isQwen35_397b || isInklingSmall || isMinimaxM27;
        if (/minimax-m3\.1-flash/i.test(proto.id)) sim = isMinimaxM31Flash ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/minimax-m3(?!\.1)/i.test(proto.id)) sim = isMinimaxM3 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.3-flash/i.test(proto.id)) sim = isGlm53Flash ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.3-max/i.test(proto.id) && isGlm53Max) sim = Math.max(0.97, sim + 0.26);
        else if (/qwen3\.8-max-0902/i.test(proto.id)) sim = isQwen38Max0902 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/step-5-preview/i.test(proto.id)) sim = isStep5Preview ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/qwen-?3\.7-max/i.test(proto.id) && isQwen37Max) sim = Math.max(0.97, sim + 0.26);
        else if (proto.id === 'deepseek/deepseek-v4.1-flash' && isDs41Flash) sim = Math.max(0.97, sim + 0.26);
        else if (proto.id === 'alibaba/qwen3.8-flash-next' && isQwen38FlashNextHeavy) sim = Math.max(0.97, sim + 0.26);
        else if (/kimi-k3/i.test(proto.id) && isKimiK3) sim = Math.max(0.97, sim + 0.26);
        else if (/qwen-?3\.8-27b/i.test(proto.id)) sim = isQwen38_27b ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/hy-?4-preview/i.test(proto.id)) sim = isHy4Preview ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.1/i.test(proto.id)) sim = isGlm51 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/qwen3\.5-397b/i.test(proto.id)) sim = isQwen35_397b ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/inkling-small/i.test(proto.id)) sim = isInklingSmall ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/minimax-m2\.7/i.test(proto.id)) sim = isMinimaxM27 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (anyOpenSpecific) sim = Math.min(0.84, sim - 0.10);
      }

      if (!feat.isOpenThink) {
        if (feat.isGeminiCoding) {
          if (proto.vendor !== 'Google') sim = Math.min(0.62, sim * 0.68);
        } else if (isSolarPro4Profile) {
          if (!/solar-pro4/i.test(proto.id)) sim = Math.min(0.68, sim * 0.72);
        } else if (isAnyMuseProfile) {
          if (proto.vendor !== 'Meta') sim = Math.min(0.68, sim * 0.72);
        } else if (isKibitzProfile || isHorizon62Profile || isKalmiaProfile || isCynosureProfile) {
          if (proto.vendor !== 'Stealth') sim = Math.min(0.68, sim * 0.72);
        } else if (isGrok46XHigh || isGrok46High || isGrok46Medium) {
          if (proto.vendor !== 'xAI') sim = Math.min(0.68, sim * 0.72);
        } else if ((isDefiniteOpenAiChunkStream || feat.wireFam === 'openai' || (hasStrongOpenAiSig && !hasAnthropicSig)) && !isFable51CodingCore && !hasHtmlFable51Early) {
          if (proto.vendor !== 'OpenAI') sim = Math.min(0.68, sim * 0.72);
        } else if (feat.wireFam === 'anthropic' || isFable51CodingCore || hasHtmlFable51Early || (hasAnthropicSig && !hasStrongOpenAiSig)) {
          if (proto.vendor !== 'Anthropic') sim = Math.min(0.68, sim * 0.72);
        }
      }

      // 5. Open-Source 家族内部精细区分（Beam 1.0 501B vs DeepSeek V4.1 Flash vs Qwen 3.8 vs MiMo V2.6 vs GLM 5.3/5.2 vs Kimi K3 vs Nemotron 3 Ultra）
      if (proto.isOpen && feat.isOpenThink) {
        const rAvg = Number(feat.rAvgChunk) || 0;
        const rAvgGuess = rAvg > 0 ? inferPlainModelByRAvg(feat) : null;
        const isBeamCaveman = (feat.turns === 1 && feat.pyHeredoc >= 1 && feat.catHeredoc >= 1 && durMs >= 300000) || rAvg > 85;
        const isDs41Flash0910 = !isBeamCaveman && ((feat.tagReiTier === 'max' && feat.tagReiVal >= 250) || (rAvg > 0 && rAvg <= 3.6));
        const isQwen38FlashNextLow = !isBeamCaveman && feat.tagReiTier === 'low' && Boolean(feat.hasBpeMatchTag);
        const isQwen38MaxLow = !isBeamCaveman && ((feat.tagReiTier === 'low' && !feat.hasBpeMatchTag) || (rAvg > 6.2 && rAvg <= 8.35));
        const isMimo26Med = !isBeamCaveman && (feat.tagReiTier === 'medium' || (rAvg > 8.35 && rAvg <= 10.2));
        if (proto.id === 'contenders/caveman-agent' && isBeamCaveman) {
          sim = Math.max(0.96, sim + 0.28);
        } else if (/^deepseek\/deepseek-v4\.1-flash-20260910/i.test(proto.id) && isDs41Flash0910) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^alibaba\/qwen3\.8-flash-next/i.test(proto.id) && isQwen38FlashNextLow) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^alibaba\/qwen3\.8-max$/i.test(proto.id) && isQwen38MaxLow) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^xiaomi\/mimo-v2\.6-flash/i.test(proto.id) && isMimo26Med) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (rAvgGuess && String(proto.id || '').toLowerCase().includes(String(rAvgGuess.id || '').split('/').pop().toLowerCase())) {
          sim = Math.max(0.955, sim + 0.22);
        } else if (isBeamCaveman || isDs41Flash0910 || isQwen38FlashNextLow || isQwen38MaxLow || isMimo26Med) {
          sim = Math.min(0.86, sim - 0.08);
        }
      }

      const canon = canonHabitModelName(proto.label || proto.id);
      const k = String(canon || proto.label).toLowerCase();
      // 静态启发式规则上限控制在 0.958，为习惯库自学习 k-NN 与弹性纠偏邻域预留 0.962~0.995 的超越空间
      sim = Math.min(0.958, sim);
      // 结合校准质心（calib.protoCentroids）执行后验相似度拉升
      if (hasLearnedProto && sim >= 0.72) {
        const ruleMatched = sim >= 0.92;
        const lVSim = vectorSimilarity(feat.vec, learnedProto.vec, feat, calib?.dimWeights?.[k] || null);
        const lMSim = learnedProto.meta ? metaSimilarity(feat, learnedProto.meta) : null;
        const lSim = lMSim !== null ? (lVSim * 0.50 + lMSim * 0.50) : lVSim;
        if (lSim >= 0.85) {
          const cLift = (lSim - 0.83) * (ruleMatched ? 0.52 : 0.32) + Math.min(0.025, (Number(learnedProto.count) || 1) * 0.005);
          const cap = ruleMatched ? 0.968 : 0.892;
          sim = Math.max(sim, Math.min(cap, sim + cLift));
        }
      }
      // 结合本账号用户历史常用纠偏先验（越用越准，温和加权不喧宾夺主）
      const famKey = parseModelFamilyAndTier(canon).famKey || canon.toLowerCase();
      const freqHits = (usageStats.models?.[k] || 0) + (usageStats.families?.[famKey] || 0) * 0.5;
      if (freqHits > 0) {
        sim += Math.min(0.022, Math.log10(1 + freqHits) * 0.014);
      }
      sim = Math.max(0.1, Math.min(0.978, sim));
      scoreMap.set(k, {
        id: proto.id,
        label: proto.label,
        canon,
        vendor: proto.vendor,
        isOpen: proto.isOpen,
        sim,
        tags: [...feat.habitTags.slice(0, 4), ...(proto.tags || []).slice(0, 2)],
        learnedHits: 0,
        userLearned: false,
      });
    }

    // Blend with self-learned bank (`habitLearnBank:v1`, exact sid match locks 99.6%; cross-session samples apply top-3 k-NN nudge per class)
    const isSyntheticStubSample = s => !s || (
      (s.meta && Number(s.meta.meanChars) === 4500 && (Number(s.meta.writtenChars) || 0) === 0 && (Number(s.meta.totalTools) || 0) === 2 && (Number(s.meta.write) || 0) === 1 && (Number(s.meta.bash) || 0) === 0) ||
      (Array.isArray(s.vec) && s.vec.length === 20 && s.vec[2] === 0.05 && (s.vec[4] === 0.22 || s.vec[4] === 0.25) && s.vec[12] === 0.8 && s.vec[15] === 0.52) ||
      (Array.isArray(s.vec) && s.vec.length === 20 && (s.vec[12] === 0.8 || s.vec[12] === 0.35) && (s.vec[15] === 0.52 || s.vec[15] === 0) && (s.vec[2] === 0.05 || s.vec[2] === 0.06) && s.vec[3] === 0 && (!s.meta || (Number(s.meta.meanChars) === 4500 && (Number(s.meta.writtenChars) || 0) === 0 && (Number(s.meta.avgTurnDurMs) || 0) === 0 && (Number(s.meta.cps) || 0) === 0 && (Number(s.meta.memoAvgChunk) || 0) === 0)))
    );
    const protoFamEntriesByKey = new Map();
    for (const [pk, pit] of scoreMap.entries()) {
      const pfk = parseModelFamilyAndTier(pit.canon || pit.label).famKey;
      if (!pfk) continue;
      if (!protoFamEntriesByKey.has(pfk)) protoFamEntriesByKey.set(pfk, []);
      protoFamEntriesByKey.get(pfk).push([pk, pit]);
    }
    for (const [, entries] of protoFamEntriesByKey.entries()) { if (entries.length >= 2) { const sp = [...entries].sort((a, b) => (b[1].sim || 0) - (a[1].sim || 0)); if ((sp[0][1].sim || 0) >= 0.955 && ((sp[0][1].sim || 0) - (sp[1][1].sim || 0)) >= 0.02) sp[0][1].protoRuleLeader = true; } }
    const effTierMemoByFam = new Map();
    const bankByKey = new Map();
    for (const sample of bank) {
      if (!sample || !sample.model || !Array.isArray(sample.vec)) continue;
      if (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(sample.model || ''))) continue;
      const truthRank = sample._truthRank || (sample._truthRank = getSampleTruthRank(sample));
      const isBattleOrDirectTruth = truthRank >= 3;
      const isConfirmedSample = Boolean(sample.userConfirmed || sample.importedFromDiag || truthRank >= 2 || (sample.autoTeacher && (Number(sample.teacherConf) || 0) >= 85));
      if (ignoreExactSid && sid && sample.sid && (String(sample.sid) === sid || String(sample.sid) === String(chat?._origSid || ""))) continue;
      const isExactSid = Boolean(!ignoreExactSid && sid && sample.sid && String(sample.sid) === sid && (sample.userConfirmed || sample.importedFromDiag || isBattleOrDirectTruth) && !sample.autoTeacher);
      const sampleOpen = sample._isOpen !== undefined ? sample._isOpen : (sample._isOpen = Boolean(sample.model && sample.model !== '开源模型' ? isOpenName(sample.model) : (sample.meta?.isOpenThink ?? sample.isOpen)));
      if (!isExactSid && sampleOpen !== Boolean(feat.isOpenThink)) continue;
      if (!isExactSid && (sample._isStub !== undefined ? sample._isStub : (sample._isStub = isSyntheticStubSample(sample)))) continue;
      const isToollessEvalOnAgent = Boolean(!isExactSid && !isEvalAnalyze && (feat.totalTools || 0) > 0 && (sample.battleRevealed || sample.directMode) && (sample.meta?.totalTools || 0) === 0);
      const isAgentSampleOnToollessEval = Boolean(!isExactSid && isEvalAnalyze && (feat.totalTools || 0) === 0 && (sample.meta?.totalTools || 0) > 0);
      if (!isExactSid && isToollessEvalOnAgent) continue;
      if (!isExactSid && isAgentSampleOnToollessEval) continue;
      const hasTimingMeta = Boolean(sample.meta && ((Number(sample.meta.avgTurnDurMs) || 0) > 0 || (Number(sample.meta.cps) || 0) > 0 || (Number(sample.meta.memoAvgChunk) || 0) > 0));
      const isZeroTimingNoToolStub = Boolean(!hasTimingMeta && sample.meta && (sample.meta.totalTools || 0) === 0 && !Array.isArray(sample.meta.htmlSvgSig));
      if (!isExactSid && isZeroTimingNoToolStub) {
        if ((sample.meta.htmlMaxLen || 0) === 0) {
          if (Math.abs((feat.meanChars || 0) - (sample.meta.meanChars || 0)) > 120 || (feat.cnColon || 0) !== (sample.meta.cnColon || 0) || (feat.emDash || 0) !== (sample.meta.emDash || 0)) continue;
        } else {
          const maxLenTol = isBattleOrDirectTruth ? 8500 : 350;
          if (Math.abs((feat.htmlMaxLen || 0) - (sample.meta.htmlMaxLen || 0)) > maxLenTol || (feat.svgSmilNoScript || 0) !== (sample.meta.svgSmilNoScript || 0) || (feat.prefersReducedMotion || 0) !== (sample.meta.prefersReducedMotion || 0)) continue;
        }
      }
      let label = sample._canonLabel || (sample._canonLabel = canonHabitModelName(sample.model));
      const isManualExactSid = Boolean(isExactSid && sample.userConfirmed && !sample.autoTeacher);
      if (!isManualExactSid) {
        if ((feat.genImg || 0) >= 1 && feat.turns === 2 && feat.hidR === 1 && feat.writtenChars < 5500 && Boolean(feat.ariaLabelledby) !== Boolean(sample.meta?.ariaLabelledby)) continue;
        if (/solar-pro4/i.test(label) && !isSolarPro4Profile) continue;
        if (/kibitz/i.test(label) && !isKibitzProfile) continue;
        if (/horizon-6\.2/i.test(label) && !isHorizon62Profile) continue;
        if (/kalmia/i.test(label) && !isKalmiaProfile) continue;
        if (/cynosure/i.test(label) && !isCynosureProfile) continue;
        if (/grok-4\.6-xhigh/i.test(label) && !isGrok46XHigh) continue;
        if (/grok-4\.6-high/i.test(label) && !isGrok46High) continue;
        if (/grok-4\.6-medium/i.test(label) && !isGrok46Medium) continue;
        if (/muse-wonder/i.test(label) && !isMuseWonder) continue;
        if (/muse-spark-open/i.test(label) && !isMuseSparkOpen) continue;
        if (/muse-spark-1\.2/i.test(label) && !isMuseSpark12Max) continue;
        if (/muse-spark-1\.3-high/i.test(label) && !isMuseSpark13High) continue;
        if (/muse-spark-1\.3-low/i.test(label) && !isMuseSpark13Low) continue;
        if (/muse-spark-1\.3-xhigh/i.test(label) && !isMuseSpark13XHigh) continue;
        if (/muse-spark-1\.3-max/i.test(label) && !isMuseSpark13Max) continue;
        if (isAnyMuseProfile && !/muse/i.test(label)) continue;
      }
      if (!isManualExactSid && !isEvalAnalyze) {
        if (feat.isGeminiCoding && !/gemini|google/i.test(label)) continue;
        if (/argon|barium/i.test(label) && !isKnownArgon) continue;
        if ((feat.solClarifyPhrase || 0) > 0 && (feat.lunaNotSurePhrase || 0) === 0 && (feat.totalTools || 0) === 0 && /luna/i.test(label) && (sample.meta?.solClarifyPhrase || 0) === 0) continue;
        if (!feat.isGeminiCoding && /gemini|google|argon|barium/i.test(label)) continue;
        if ((isDefiniteOpenAiChunkStream || hasStrongOpenAiSig) && !/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/i.test(label)) continue;
        if (((hasClaudeChunkSig && !isNonBig3Profile && !hasStrongOpenAiSig) || hasAnthropicSig) && !/claude|anthropic|haiku|sonnet|opus|fable/i.test(label)) continue;
        if (isMuseSpark13Max && label !== 'muse-spark-1.3-max') continue;
        if (isAnyMuseProfile && !/muse/i.test(label)) continue;
      }
      const crossModalToolless = Boolean(
        (sample.battleRevealed || sample.directMode) && (feat.totalTools || 0) > 0 && (sample.meta?.totalTools || 0) === 0
      );
      if (!isExactSid && !isEvalAnalyze && !crossModalToolless && sample.meta) {
        const fT = feat.totalTools || 0, mT = sample.meta.totalTools || 0;
        if ((fT === 0) !== (mT === 0)) continue;
        if ((fT > 0 && feat.askUser === fT) !== (mT > 0 && sample.meta.askUser === mT)) continue;
        if (Boolean(feat.isGeminiCoding) !== Boolean(sample.meta.isGeminiCoding)) continue;
      }
      let vSim = isExactSid
        ? 0.998
        : crossModalToolless
          ? vectorSimilarity(feat.vec, sample.vec, { ...feat, totalTools: 0, htmlMaxLen: 0, writtenChars: 0, cssRoot: 0, raf: 0, svgRich: 0, boxComment: 0 })
          : vectorSimilarity(feat.vec, sample.vec, feat);
      if (!isExactSid && isConfirmedSample && !feat.isGeminiCoding && !Boolean(sample.meta?.isGeminiCoding) && sample.vec.length === 20 && feat.vec.length === 20 && sample.vec[0] !== feat.vec[0]) {
        const alignedVec = [...sample.vec];
        alignedVec[0] = feat.vec[0];
        alignedVec[1] = feat.vec[1];
        vSim = Math.max(vSim, vectorSimilarity(feat.vec, alignedVec, crossModalToolless ? { ...feat, totalTools: 0, htmlMaxLen: 0, writtenChars: 0 } : feat) * 0.96);
      }
      const minSimReq = isBattleOrDirectTruth ? 0.75 : 0.80;
      if (!isExactSid && !isEvalAnalyze && sample.meta && (vSim * 0.52 + 0.48) < minSimReq - 0.002) continue;
      const mSim = (!isExactSid && sample.meta)
        ? (crossModalToolless
            ? metaSimilarity({ ...feat, totalTools: 0, askUser: 0, meanChars: feat.nonCodeMeanChars || feat.meanChars }, { ...sample.meta, totalTools: 0, askUser: 0 })
            : metaSimilarity(feat, sample.meta))
        : null;
      const sampleTierVec = Array.isArray(sample.tierVec) && sample.tierVec.length === 12
        ? sample.tierVec
        : (Array.isArray(sample.meta?.tierVec) && sample.meta.tierVec.length === 12 ? sample.meta.tierVec : null);
      // 在非评测（Max/Agent）模式下，型号习惯匹配仅比较 20 维 + meta 习惯特征，强度档位交由独立强度识别器处理，避免强度向量干扰型号归属
      const tvSim = (!isExactSid && isEvalAnalyze && sampleTierVec && Array.isArray(feat.tierVec) && feat.tierVec.length === 12)
        ? tierVecSimilarity(feat.tierVec, sampleTierVec, feat.evalModality || sample.evalModality || 'chat')
        : null;
      const basePairSim = mSim !== null ? (vSim * 0.52 + mSim * 0.48) : vSim;
      const sim = isExactSid
        ? 0.998
        : (tvSim !== null
            ? (basePairSim * 0.74 + tvSim * 0.26)
            : basePairSim);
      if (!isExactSid && sim < minSimReq) continue;
      let k = String(label || sample.model).toLowerCase();
      // 强度与型号习惯解耦：在常规对话中，若习惯库样本为同家族其它未在 PROTOTYPES 独立建档的子档位（如 claude-opus-5.5-low）或「标准」无档位揭晓样本（如 gemini-4-argon / claude-opus-5），
      // 将其家族习惯票归并到该家族在 scoreMap 中的原型上，绝不单独分裂出与主原型打架的冲突档位行
      if (!isExactSid && !isEvalAnalyze && !scoreMap.has(k)) {
        const pSample = parseModelFamilyAndTier(label);
        if (pSample.famKey) {
          const famEntries = protoFamEntriesByKey.get(pSample.famKey) || [];
          if (famEntries.length === 1) {
            k = famEntries[0][0];
            label = famEntries[0][1].canon || famEntries[0][1].label;
          } else if (famEntries.length > 1 && !pSample.hasExplicitTier) {
            if (!effTierMemoByFam.has(pSample.famKey)) {
              effTierMemoByFam.set(pSample.famKey, identifyEffortTier(feat, pSample.famKey, calib)?.tier || '');
            }
            const prefTier = effTierMemoByFam.get(pSample.famKey);
            const hitTierEntry = prefTier
              ? famEntries.find(([, it]) => parseModelFamilyAndTier(it.canon || it.label).tier === prefTier)
              : null;
            const chosenEntry = hitTierEntry || famEntries[0];
            k = chosenEntry[0];
            label = chosenEntry[1].canon || chosenEntry[1].label;
          } else if (famEntries.length === 0 && isToollessEvalOnAgent) {
            continue;
          }
        } else if (isToollessEvalOnAgent) {
          continue;
        }
      }
      if (!bankByKey.has(k)) bankByKey.set(k, []);
      bankByKey.get(k).push({ sample, sim, mSim, tvSim, truthRank, isExactSid, isConfirmedSample, label, sampleOpen, softWeight: 1.0 });
      // 弹性方向软邻域扩散（Elastic Soft-Target Neighborhood Pull）：非精确同会话命中时，将相似度向邻近思考档位与折射候选同步扩散
      if (!isExactSid && sample.softTargets && typeof sample.softTargets === 'object' && sim >= 0.82) {
        for (const [softModel, sWeight] of Object.entries(sample.softTargets)) {
          const sw = Number(sWeight) || 0;
          if (sw <= 0 || sw >= 0.55) continue;
          const sCanon = sanitizeCorruptedTierSlug(typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(softModel) : softModel);
          const sk = String(sCanon || softModel).toLowerCase();
          if (!sk || sk === k || (!isEvalAnalyze && !scoreMap.has(sk))) continue;
          const softSim = Math.max(0.80, sim * (0.91 + sw * 0.25));
          if (!bankByKey.has(sk)) bankByKey.set(sk, []);
          bankByKey.get(sk).push({ sample, sim: softSim, mSim, tvSim, truthRank: 2, isExactSid: false, isConfirmedSample, label: sCanon, sampleOpen, softWeight: sw, isElasticNeighbor: true });
        }
      }
      if (!isExactSid && sample.rejectedModel && sim >= 0.84) {
        const rejCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(sample.rejectedModel) : sample.rejectedModel;
        const rk = String(rejCanon || '').toLowerCase();
        const rejEntry = rk ? scoreMap.get(rk) : null;
        if (rejEntry && !rejEntry.userLearned) {
          rejEntry.sim = Math.max(0.15, rejEntry.sim - Math.min(0.055, (sim - 0.82) * 0.28));
        }
      }
    }
    const maxProtoSim = Math.max(0, ...[...scoreMap.values()].map(v => v.sim || 0));
    let winExactKey = null;
    for (const [k, hits] of bankByKey.entries()) {
      hits.sort((a, b) =>
        (Number(Boolean(b.isExactSid)) - Number(Boolean(a.isExactSid))) ||
        ((b.sim + (b.truthRank >= 4 ? 0.018 : b.truthRank === 3 ? 0.010 : 0)) - (a.sim + (a.truthRank >= 4 ? 0.018 : a.truthRank === 3 ? 0.010 : 0)))
      );
      const top = hits[0];
      const top3 = hits.slice(0, 3);
      const meanTopSim = top3.reduce((acc, h) => acc + h.sim, 0) / top3.length;
      const topTruthRank = top.truthRank || getSampleTruthRank(top.sample);
      const isCrossModeToollessEval = Boolean(!top.isExactSid && !isEvalAnalyze && (feat.totalTools || 0) > 0 && (top.sample.battleRevealed || top.sample.directMode) && (top.sample.meta?.totalTools || 0) === 0);
      const isBattleOrDirectTop = topTruthRank >= 3 && !isCrossModeToollessEval;
      const effPullScale = top.isElasticNeighbor
        ? (0.55 + (Number(top.softWeight) || 0.25))
        : isCrossModeToollessEval
          ? 0.65
          : (topTruthRank >= 4 ? 1.32 : topTruthRank === 3 ? 1.18 : 1.0);
      const nudge = top.isExactSid ? 0.45 : Math.max(0, (meanTopSim - 0.79) * (top.isConfirmedSample ? 0.22 : 0.09) * effPullScale);
      const isStrictTwin = !top.isExactSid && top.isConfirmedSample && !top.sample.autoTeacher && !isCrossModeToollessEval && (
        (top.mSim !== null && top.mSim >= 0.92 && top.sim >= 0.92) ||
        (meanTopSim >= 0.90 && hits.length >= 2) ||
        (isBattleOrDirectTop && top.sim >= 0.885 && (top.tvSim ?? 0.88) >= 0.86)
      );
      const isStrongLearnedPull = !top.isExactSid && top.isConfirmedSample && !isCrossModeToollessEval && (meanTopSim >= 0.855 || (isBattleOrDirectTop && meanTopSim >= 0.835));
      if (top.isExactSid) winExactKey = k;
      const existing = scoreMap.get(k);
      const isManualUserSample = Boolean(top.sample.userConfirmed && !top.sample.autoTeacher && !top.sample.importedFromDiag && !top.sample.battleRevealed && !top.sample.directMode);
      const truthMult = isCrossModeToollessEval ? 0.985 : topTruthRank >= 4 ? 1.052 : topTruthRank === 3 ? 1.044 : isManualUserSample ? 1.036 : top.isConfirmedSample ? 1.012 : 0.975;
      if (existing) {
        const kernelTarget = Math.min(0.992, meanTopSim * truthMult + Math.min(0.036, Math.log10(1 + hits.length) * 0.016));
        existing.sim = Math.max(existing.sim, top.isExactSid
          ? 0.996
          : (existing.sim >= 0.90 || (existing.sim >= 0.78 && top.mSim !== null && top.mSim >= 0.95 && top.sim >= 0.94)) && (isManualUserSample || isBattleOrDirectTop) && (isStrictTwin || isStrongLearnedPull)
            ? Math.min(top.isElasticNeighbor ? 0.976 : (topTruthRank >= 4 ? 0.993 : 0.991), Math.max(top.sim + (top.isElasticNeighbor ? 0.018 : (topTruthRank >= 4 ? 0.038 : 0.032)), existing.sim * 0.25 + kernelTarget * 0.75))
            : existing.sim >= 0.94
              ? Math.min(0.985, existing.sim + nudge * 0.35)
              : existing.sim >= 0.90 && isStrictTwin
                ? Math.min(0.966, Math.max(top.sim + 0.006, existing.sim * 0.35 + kernelTarget * 0.65))
                : existing.sim >= 0.90 && isStrongLearnedPull
                  ? Math.min(0.956, Math.max(existing.sim + nudge, existing.sim * 0.45 + kernelTarget * 0.55))
                  : Math.min(0.920, existing.sim + nudge * 0.65));
        existing.learnedHits += hits.length;
        if (top.isExactSid || isStrictTwin || isStrongLearnedPull) {
          existing.userLearned = true;
          const hitTag = top.sample.battleRevealed
            ? '⚔️ 命中Battle真值样本 ✓'
            : top.sample.directMode
              ? '🎯 命中Direct锁定样本 ✓'
              : top.sample.importedFromDiag
                ? '📥 命中习惯库诊断导入 ✓'
                : top.isElasticNeighbor
                  ? '🧭 命中弹性纠偏邻域牵引 ✓'
                  : top.sample.autoTeacher
                    ? '⚡ 已自动拟合反推结果 ✓'
                    : '★ 命中习惯库纠偏样本 ✓';
          existing.tags = [hitTag, ...(existing.tags || []).filter(t => t !== hitTag).slice(0, 5)];
        }
      } else {
        const protoMatch = getProtoByCanon(k);
        const dispLabel = formatDisplayModelLabel(protoMatch?.label || (top.isElasticNeighbor ? top.label : (top.sample.rawLabel || top.sample.model || top.label)), top.sample.rawLabel);
        scoreMap.set(k, {
          id: protoMatch?.id || top.sample.model,
          label: dispLabel,
          canon: top.label,
          vendor: protoMatch?.vendor || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(top.label)] : '') || '自学习',
          isOpen: top.sampleOpen,
          sim: top.isExactSid ? 0.996 : (isManualUserSample || isBattleOrDirectTop) ? Math.min(top.isElasticNeighbor ? 0.974 : (topTruthRank >= 4 ? 0.991 : 0.988), meanTopSim * (topTruthRank >= 4 ? 1.03 : 1.02)) : isStrictTwin ? Math.min(0.965, top.sim + 0.006) : isStrongLearnedPull ? Math.min(0.952, meanTopSim * 0.97) : Math.min(0.910, meanTopSim * 0.92),
          tags: [top.sample.battleRevealed ? '⚔️ 命中Battle真值样本 ✓' : top.sample.directMode ? '🎯 命中Direct锁定样本 ✓' : top.sample.importedFromDiag && top.isExactSid ? '📥 命中习惯库诊断导入 ✓' : top.isElasticNeighbor ? '🧭 命中弹性纠偏邻域牵引 ✓' : top.isExactSid || isStrictTwin || isStrongLearnedPull ? '★ 命中习惯库纠偏样本 ✓' : '命中历史习惯样本', ...feat.habitTags.slice(0, 4)],
          learnedHits: hits.length,
          userLearned: top.isExactSid || isStrictTwin || isStrongLearnedPull,
        });
      }
    }
    // 全局后验排斥抑制（Post-Bank Contrastive Repulsion）：确保被用户纠偏或 Battle 排他校准排除的模型让位于真实目标与正确强度档位
    if (calib?.repelledModels && typeof calib.repelledModels === 'object') {
      for (const [rk, rList] of Object.entries(calib.repelledModels)) {
        const entry = scoreMap.get(rk);
        if (!entry || !Array.isArray(rList) || !rList.length) continue;
        let maxRSim = 0;
        let maxBattleRSim = 0;
        for (const rItem of rList) {
          if (!rItem || !Array.isArray(rItem.vec)) continue;
          const rV = vectorSimilarity(feat.vec, rItem.vec, feat);
          const rM = rItem.meta ? metaSimilarity(feat, rItem.meta) : null;
          const rS = rM !== null ? (rV * 0.50 + rM * 0.50) : rV;
          if (rS > maxRSim) maxRSim = rS;
          if (rItem.battleRepel && rS > maxBattleRSim) maxBattleRSim = rS;
        }
        if (maxBattleRSim >= 0.965 && entry.sim < 0.93) {
          entry.sim = Math.min(entry.sim, 0.885) - Math.min(0.065, (maxBattleRSim - 0.94) * 0.40);
          entry.userLearned = false;
        } else if (maxRSim >= 0.965 && entry.sim < 0.93) {
          entry.sim = Math.min(entry.sim, 0.895) - Math.min(0.045, (maxRSim - 0.94) * 0.30);
          entry.userLearned = false;
        }
      }
    }
    if (winExactKey) {
      for (const [k, item] of scoreMap.entries()) {
        if (k !== winExactKey && !item.userLearned) {
          item.sim = Math.min(item.sim, 0.885);
        }
      }
    } else {
      // 融合 50 维 HTML/SVG 代码结构、运动学与专属 Token 指纹（当回复包含真实 SVG/HTML 动画或绘图代码时）
      const hm = feat.htmlSvgMatch;
      const hf = hm?.features || null;
      const topHtmlCand = htmlSvgCands.length > 0 ? htmlSvgCands[0] : null;
      const hasRichSvgOrHtml = Boolean(hm && topHtmlCand && (
        topHtmlCand.ruleScore >= 0.48
        || (hf && hm.code_type === "html_svg" && hf.bytes >= 3800 && (hf.nPath + hf.nG + hf.nCircle) >= 4 && topHtmlCand.protoSim >= 0.80)
        || (hf && hm.code_type === "svg32" && hf.viewBox === "0 0 32 32" && topHtmlCand.protoSim >= 0.82)
      ));
      if (hasRichSvgOrHtml) {
        if (isEvalAnalyze && topHtmlCand && topHtmlCand.ruleScore >= 0.48 && topHtmlCand.vendorId) {
          const topVid = String(topHtmlCand.vendorId).toLowerCase();
          for (const [, it] of scoreMap.entries()) {
            const iv = String(it.vendor || '').toLowerCase();
            if (!it.userLearned && iv && !iv.includes(topVid) && !topVid.includes(iv)) {
              it.sim = Math.min(it.sim, 0.865);
            }
          }
        }
        for (let hi = 0; hi < Math.min(4, htmlSvgCands.length); hi++) {
          const hc = htmlSvgCands[hi];
          if (!hc || (hc.ruleScore < 0.35 && hc.protoSim < 0.70)) continue;
          if (!isEvalAnalyze && hc.isOpen !== feat.isOpenThink) continue;
          if (!isEvalAnalyze && isAnyMuseProfile && hc.vendorId !== "meta") continue;
          const effHtmlWireFam = isNonBig3Profile ? "" : ((isFable51CodingCore || hasHtmlFable51Early) ? "anthropic" : ((isLunaHigh1TurnCoding || isSol61XHighSingleWrite) ? "openai" : feat.wireFam));
          if (effHtmlWireFam === "anthropic" && hc.vendorId !== "anthropic") continue;
          if (effHtmlWireFam === "openai" && hc.vendorId !== "openai") continue;
          const hk = String(hc.canon || "").toLowerCase();
          let targetEntry = scoreMap.get(hk);
          if (hc.family) {
            let bestFamEntry = null;
            for (const [, it] of scoreMap.entries()) {
              if (parseModelFamilyAndTier(it.canon || it.label).famKey === hc.family) {
                if (!bestFamEntry || (it.sim || 0) > (bestFamEntry.sim || 0)) bestFamEntry = it;
              }
            }
            if (!targetEntry || (!isEvalAnalyze && bestFamEntry && (bestFamEntry.sim || 0) >= 0.94 && (bestFamEntry.sim || 0) > (targetEntry.sim || 0) + 0.10)) {
              targetEntry = bestFamEntry || targetEntry;
            }
          }
          const htmlPull = Math.min(0.14, Math.max(0.02, (hc.score - 0.45) * 0.24));
          const htmlTag = `🦩 ${hc.reasons?.[0] || ("HTML/SVG指纹:" + hc.familyLabel)}`;
          if (targetEntry) {
            if (hi === 0 && (hc.ruleScore >= 0.48 || hc.protoSim >= 0.84)) {
              targetEntry.sim = Math.max(targetEntry.sim, Math.min(isEvalAnalyze ? 0.972 : 0.966, Math.max(targetEntry.sim + htmlPull, (isEvalAnalyze ? 0.86 : 0.84) + hc.score * 0.14)));
            } else {
              targetEntry.sim = Math.min(0.962, targetEntry.sim + htmlPull * (hi === 0 ? 0.85 : 0.45));
            }
            if (hc.effort && hc.effort !== "standard") targetEntry.detectedEffort = hc.effort;
            targetEntry.tags = [htmlTag, ...(targetEntry.tags || []).filter(t => t !== htmlTag).slice(0, 5)];
          } else if (hi === 0 && (hc.ruleScore >= 0.52 || hc.protoSim >= 0.85)) {
            scoreMap.set(hk, {
              id: hc.model_id,
              label: hc.label,
              canon: hc.canon,
              vendor: hc.vendor,
              isOpen: hc.isOpen,
              sim: Math.min(isEvalAnalyze ? 0.968 : 0.958, (isEvalAnalyze ? 0.85 : 0.83) + hc.score * 0.14),
              detectedEffort: hc.effort,
              tags: [htmlTag, ...feat.habitTags.slice(0, 4)],
              learnedHits: 0,
              userLearned: false,
            });
          }
        }
      }
      // Stage-2：在非精确同会话锁定时，执行同家族相邻档位微差解耦精排（Opus 5.5 Medium vs High、Sol Medium vs High 等）
      disentangleIntraFamilyTiers(scoreMap, feat, calib, bankByKey, isEvalAnalyze);
      // Stage-3：多维尺度不变结构同源对齐（对抗真实环境下流式速度 ±25% 与输出长度 ±20% 波动）
      if (!winExactKey && Array.isArray(bank) && bank.length > 0) {
        let bestTwinKey = null, bestTwinSim = 0, bestTwinSample = null, twinCollision = false;
        const logCloseOpt = (a, b, maxD = 0.34) => {
          if (b === undefined || b === null) return true;
          const va = Math.max(0, Number(a) || 0), vb = Math.max(0, Number(b) || 0);
          return (va === 0) === (vb === 0) && (va === 0 || Math.abs(Math.log1p(va) - Math.log1p(vb)) <= maxD);
        };
        const boolOpt = (a, b) => (b === undefined || b === null) ? true : Boolean(a) === Boolean(b);
        const eqKeys = ['turns','hidR','maxRInTurn','totalTools','write','genImg','pyHeredoc','catHeredoc','checkmarkEmoji','solClarifyPhrase','lunaNotSurePhrase','astraSelfContainedPhrase','terraPhrase','askUserIntent','askSolSig','askIdHasUnderscore','askFormatOpt','tableCount','selfCheckCount','codeOmissionCount','thinkStepLines'];
        const optEqKeys = ['bash','edit','read','search','askUser'];
        const softCountKeys = ['cnColon','emDash','curlyApostrophe','straightApostrophe','unspacedEmDash','listLineCount','codeDefensiveCount','memoDeltaCount'];
        const boolKeys = ['lowerDoctype','colorSchemeCss','prefersReducedMotion','svgSmilNoScript','ariaLabelledby','boxComment','claudeWarmPalette','sandboxLink','writeUnderscoreName'];
        const initArch = getInitialBuiltinArchetypes();
        const stage3Pool = (bank.length >= 400 && initArch.length > bank.length) ? initArch : bank;
        for (const sample of stage3Pool) {
          if (!sample || !sample.meta) continue;
          if (!sample.userConfirmed && !sample.battleRevealed && !sample.directMode && !sample.importedFromDiag) continue;
          const m = sample.meta;
          if (m.meanChars === 4500 && (m.writtenChars || 0) === 0 && (m.cps || 0) === 0 && (m.totalTools || 0) === 0 && (m.memoDeltaCount || 0) === 0) continue;
          if (sample.score != null && Number.isFinite(+sample.score) && Math.abs((feat.habitReasoningScore || 72) - (+sample.score)) > 6.5) continue;
          if (Boolean(feat.isOpenThink) !== Boolean(m.isOpenThink) || Boolean(feat.isGeminiCoding) !== Boolean(m.isGeminiCoding)) continue;
          if (eqKeys.some(k => (feat[k] || 0) !== (m[k] || 0))) continue;
          if (optEqKeys.some(k => m[k] !== undefined && (feat[k] || 0) !== (m[k] || 0))) continue;
          if (softCountKeys.some(k => !logCloseOpt(feat[k], m[k], 0.34))) continue;
          if (boolKeys.some(k => !boolOpt(feat[k], m[k]))) continue;
          const rawMChunk = Number(m.memoAvgChunk) || 0;
          const mChunk = (Number(m.memoDeltaCount) > 0 && Number(m.memoDeltaCount) <= Math.max(2, (Number(m.turns) || 1) * 2) && rawMChunk > 220 && (Number(m.writtenChars) || 0) < 80000) ? 0 : rawMChunk;
          const fChunk = Number(feat.memoAvgChunk) || 0;
          const chunkOk = m.memoAvgChunk === undefined || logCloseOpt(fChunk, mChunk, 0.34) || (rawMChunk >= 175 && (fChunk === 0 || mChunk === 0) && Math.max(fChunk, rawMChunk) <= 280);
          if (!chunkOk) continue;
          if (m.promptEntropy !== undefined && feat.promptEntropy !== undefined && Math.abs((feat.promptEntropy || 0) - (m.promptEntropy || 0)) > 0.02) continue;
          if (!logCloseOpt(feat.writtenChars, m.writtenChars, 0.34) || !logCloseOpt(feat.htmlMaxLen, m.htmlMaxLen, 0.34) || !logCloseOpt(feat.meanChars, m.meanChars, 0.34) || !logCloseOpt(feat.nonCodeMeanChars, m.nonCodeMeanChars, 0.34) || !logCloseOpt(feat.preToolTextChars, m.preToolTextChars, 0.34) || !logCloseOpt(feat.cps, m.cps, 0.36) || !logCloseOpt(feat.avgTurnDurMs, m.avgTurnDurMs, 0.36)) continue;
          if (Array.isArray(sample.vec) && Array.isArray(feat.vec) && sample.vec.length === 20 && feat.vec.length === 20) {
            if ([5,6,7,8,9,10,11,12,13,14,15,16].some(vi => Math.abs((feat.vec[vi] || 0) - (sample.vec[vi] || 0)) > 0.035)) continue;
            if ((m.cps || 0) === 0 && (m.avgTurnDurMs || 0) === 0 && !logCloseOpt((feat.vec[19] || 0) * 100, (sample.vec[19] || 0) * 100, 0.40)) continue;
          }
          const sTv = Array.isArray(sample.tierVec) && sample.tierVec.length === 12 ? sample.tierVec : (Array.isArray(m.tierVec) && m.tierVec.length === 12 ? m.tierVec : null);
          if (sTv && Array.isArray(feat.tierVec) && feat.tierVec.length === 12) {
            if ([0,3,6,7,8,9,10,11].some(ti => Math.abs((feat.tierVec[ti] || 0) - (sTv[ti] || 0)) > 0.045)) continue;
          }
          let logSum = 0, logCnt = 0;
          for (const k of ['writtenChars','htmlMaxLen','meanChars','cps','avgTurnDurMs']) {
            const va = Math.max(0, Number(feat[k]) || 0), vb = Math.max(0, Number(m[k]) || 0);
            if (va > 0 && vb > 0) { logSum += Math.abs(Math.log1p(va) - Math.log1p(vb)); logCnt++; }
          }
          const logErr = logCnt > 0 ? (logSum / logCnt) : 0;
          const scoreErr = (sample.score != null && Number.isFinite(+sample.score)) ? Math.abs((feat.habitReasoningScore || 72) - (+sample.score)) / 100 : 0;
          const twinSim = Math.max(0.935, 0.992 - logErr * 0.14 - scoreErr * 0.12);
          const sKey = canonHabitModelName(sample.model || sample.rawLabel || '');
          if (!sKey) continue;
          if (!bestTwinKey) { bestTwinKey = sKey; bestTwinSim = twinSim; bestTwinSample = sample; }
          else if (bestTwinKey === sKey) { if (twinSim > bestTwinSim) { bestTwinSim = twinSim; bestTwinSample = sample; } }
          else if (Math.abs(twinSim - bestTwinSim) < 0.012) twinCollision = true;
          else if (twinSim > bestTwinSim + 0.012) { bestTwinKey = sKey; bestTwinSim = twinSim; bestTwinSample = sample; twinCollision = false; }
        }
        if (bestTwinKey && !twinCollision && bestTwinSim >= 0.935) {
          for (const [k, v] of scoreMap.entries()) { if (k !== bestTwinKey && v.sim > 0.90) v.sim = Math.min(v.sim, 0.905); }
          const twinDecomp = decomposeModelIdentity(bestTwinKey, { rawLabel: bestTwinSample?.rawLabel });
          const cur = scoreMap.get(bestTwinKey);
          if (cur) {
            cur.sim = Math.max(cur.sim, bestTwinSim);
            cur.userLearned = true;
            if (twinDecomp?.hasExplicitTier && twinDecomp.effort) cur.detectedEffort = twinDecomp.effort;
          } else if (bestTwinSample) {
            const pM = getProtoByCanon(bestTwinKey);
            scoreMap.set(bestTwinKey, { id: pM?.id || bestTwinSample.model, label: formatDisplayModelLabel(pM?.label || bestTwinSample.rawLabel || bestTwinSample.model || bestTwinKey, bestTwinSample.rawLabel), canon: bestTwinKey, vendor: pM?.vendor || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(bestTwinKey)] : '') || '自学习', isOpen: Boolean(bestTwinSample.isOpen), sim: bestTwinSim, detectedEffort: twinDecomp?.effort, tags: ['★ 命中多维尺度不变结构同源样本 ✓', ...feat.habitTags.slice(0, 4)], learnedHits: 1, userLearned: true });
          }
        }
      }
    }

    if (!feat.isOpenThink) {
      const m = feat.meta || feat;
      let marginBoostKey = null;
      if (m.turns === 2 && m.hidR === 1 && m.totalTools === 2 && m.write === 1 && (m.writtenChars || 0) >= 9500 && (m.ariaLabelledby || 0) >= 1 && (m.prefersReducedMotion || 0) >= 1 && (m.unspacedEmDash || 0) >= 1) {
        marginBoostKey = 'gpt-6.1-sol-high';
      } else if (m.turns === 2 && m.hidR === 6 && m.maxRInTurn === 5 && m.totalTools === 5 && m.bash === 1 && m.write === 2 && (m.lowerDoctype || 0) >= 2 && (m.prefersReducedMotion || 0) >= 2) {
        marginBoostKey = 'gpt-6-sol-medium';
      } else if (m.turns === 1 && m.totalTools === 0 && (m.avgTurnDurMs || 0) >= 250000 && (m.memoDeltaCount || 0) >= 800 && (m.meanChars || 0) >= 12000 && (m.tableCount || 0) >= 3) {
        marginBoostKey = 'claude-opus-5-high';
      }
      if (marginBoostKey) {
        for (const [k, v] of scoreMap.entries()) { if (k !== marginBoostKey && v.sim > 0.88) v.sim = Math.min(v.sim, 0.88); }
        const cur = scoreMap.get(marginBoostKey);
        if (cur) cur.sim = Math.max(cur.sim, 0.978);
        else {
          const pM = getProtoByCanon(marginBoostKey);
          if (pM) scoreMap.set(marginBoostKey, { id: pM.id, label: formatDisplayModelLabel(pM.label, marginBoostKey), canon: marginBoostKey, vendor: pM.vendor, isOpen: false, sim: 0.978, detectedEffort: parseModelFamilyAndTier(marginBoostKey).tierKey, tags: [...feat.habitTags.slice(0, 4)], learnedHits: 1, userLearned: false });
        }
      }
    }

    const sorted = [...scoreMap.values()].sort((a, b) => (b.sim - a.sim) || ((b.learnedHits || 0) - (a.learnedHits || 0)) || ((b.userLearned ? 1 : 0) - (a.userLearned ? 1 : 0)));
    let calibratedScore = feat.habitReasoningScore;
    const topWinner = sorted[0] || null;
    if (topWinner) {
      const winKey = String(topWinner.canon || topWinner.label || '').toLowerCase();
      const winBankTop = bankByKey.get(winKey)?.[0];
      const bankScore = winBankTop?.sample?.score;
      if (winBankTop?.isExactSid && bankScore != null && bankScore !== '' && Number.isFinite(+bankScore) && +bankScore >= 10 && +bankScore <= 100) {
        calibratedScore = Math.round((+bankScore) * 10) / 10;
      } else if (calib?.scoreOffsets?.[winKey] && calib.scoreOffsets[winKey].count >= 1) {
        calibratedScore = Math.round(Math.max(18, Math.min(98, feat.habitReasoningScore + calib.scoreOffsets[winKey].offset * 0.75)) * 10) / 10;
      }
      feat.habitReasoningScore = calibratedScore;
    }
    const allCandidates = sorted.map((c, idx) => {
      const pct = Math.round(Math.max(35, Math.min(99.2, c.sim * 100)) * 10) / 10;
      const dispLbl = formatDisplayModelLabel(c.label, c.canon);
      const baseDecomp = decomposeModelIdentity(c.canon || dispLbl, { vendor: c.vendor, rawLabel: dispLbl });
      const decomp = baseDecomp.hasExplicitTier
        ? baseDecomp
        : decomposeModelIdentity(c.canon || dispLbl, {
            vendor: c.vendor,
            effort: c.detectedEffort || undefined,
            rawLabel: dispLbl,
          });
      const effOut = (baseDecomp.hasExplicitTier && baseDecomp.effort && baseDecomp.effort !== 'standard')
        ? baseDecomp.effort
        : (c.detectedEffort || decomp.effort);
      return {
        id: c.id,
        label: decomp.displayLabel || dispLbl,
        canon: decomp.canon || sanitizeCorruptedTierSlug(c.canon || dispLbl, dispLbl),
        vendor: c.vendor || decomp.vendorLabel,
        vendorId: decomp.vendor,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        effortLabel: decomp.effortLabel,
        sim: c.sim,
        match: pct,
        habitPct: pct,
        source: 'habit',
        userLearned: c.userLearned,
        learnedHits: c.learnedHits,
        matchedDims: c.tags,
        habitScore: calibratedScore,
        detectedEffort: effOut,
        rank: idx + 1,
      };
    });
    const candidates = allCandidates.slice(0, 6);

    const rawTopDecomp = topWinner ? decomposeModelIdentity(topWinner.canon || topWinner.label) : null;
    const topDecomp = topWinner
      ? (rawTopDecomp?.hasExplicitTier ? rawTopDecomp : decomposeModelIdentity(topWinner.canon || topWinner.label, { effort: topWinner.detectedEffort }))
      : null;
    const topFamKey = topDecomp?.family || (topWinner ? parseModelFamilyAndTier(topWinner.canon || topWinner.label).famKey : '');
    const identifiedEffort = (topDecomp && !topDecomp.hasExplicitTier)
      ? 'standard'
      : ((rawTopDecomp?.hasExplicitTier && rawTopDecomp.effort && rawTopDecomp.effort !== 'standard')
        ? rawTopDecomp.effort
        : (topWinner?.detectedEffort || (topFamKey ? (identifyEffortTier(feat, topFamKey, calib)?.tier || 'standard') : 'standard')));
    const anaOut = {
      features: feat,
      reasoningScore: calibratedScore,
      habitTags: feat.habitTags,
      identifiedEffort,
      candidates,
      allCandidates,
      best: candidates[0] || null,
      learnedTotal: bank.length,
    };
    if (anaCacheKey) {
      if (_analyzeCache.size > 64) _analyzeCache.delete(_analyzeCache.keys().next().value);
      _analyzeCache.set(cacheSidKey, { key: anaCacheKey, val: anaOut });
    }
    return anaOut;
  }

  function inferPlainModelByRAvg(streamProbe) {
    const rAvg = Number(streamProbe && streamProbe.rAvgChunk) ||
      ((streamProbe && streamProbe.reasoningChunks > 0) ? +(streamProbe.rawReasoningChars / streamProbe.reasoningChunks).toFixed(2) : 0);
    const _AP = (typeof ArenaPricing !== 'undefined' && ArenaPricing) || (typeof globalThis !== 'undefined' && globalThis.ArenaPricing) || null;
    const v18Band = (_AP && typeof _AP.classifyOpenThinkingByRAvg === 'function')
      ? _AP.classifyOpenThinkingByRAvg(rAvg, streamProbe)
      : null;
    if (rAvg > 85) return { id: 'contenders/caveman-agent', label: 'Beam 1.0 501B A23B', v18Band };
    if (rAvg > 0 && rAvg <= 3.6) return { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', v18Band };
    if (rAvg > 3.6 && rAvg <= 6.2) return { id: 'moonshotai/kimi-k3', label: 'Kimi K3', v18Band };
    if (rAvg > 6.2 && rAvg <= 8.35) return { id: 'alibaba/qwen3.8-max', label: 'Qwen 3.8 Max', v18Band };
    if (rAvg > 8.35 && rAvg <= 10.2) return { id: 'xiaomi/mimo-v2.6-pro', label: 'MiMo V2.6 Pro', v18Band };
    if (rAvg > 10.2 && rAvg <= 18.0) return { id: 'z-ai/glm-5.3', label: 'GLM 5.3', v18Band };
    if (rAvg > 18.0) return { id: 'nvidia/nemotron-3-ultra', label: 'Nemotron 3 Ultra', v18Band };
    return { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', v18Band };
  }

  // 通过对话记录与工具调用拓扑结构直接反推模型（仅在 /cost 接口 403/关闭/无账单时，作为纯展示兜底）
  function structuralReverse(chat, modelEntry = null) {
    const res = analyze(chat, modelEntry);
    if (!res || !Array.isArray(res.candidates) || !res.candidates.length) return [];
    const feat = res.features;
    return res.candidates.map((c, idx) => {
      let revPct = Number(c.match || 0);
      if (feat) {
        if (feat.isGeminiCoding && /gemini|argon/i.test(c.label)) {
          revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 1.2 : 0.4)).toFixed(1)));
        } else if (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.colorSchemeCss > 0) {
          if (/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/i.test(c.label)) revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 0.8 : 0.3)).toFixed(1)));
        } else if ((feat.wireFam === 'anthropic' || (feat.lowerDoctype === 0 && feat.colorSchemeCss === 0 && !feat.isGeminiCoding)) && /claude|opus|sonnet|haiku|fable/i.test(c.label)) {
          revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 0.9 : 0.3)).toFixed(1)));
        } else {
          revPct = Math.max(32, Number((revPct - (idx === 0 ? 0.3 : 0.6)).toFixed(1)));
        }
      }
      return {
        id: c.id,
        label: c.label,
        dynamicLabel: c.label,
        canon: c.canon || c.label,
        revPct,
        match: revPct,
        structuralRev: true,
        sameOriginAsHabit: true,
        independentEvidence: false,
        originId: 'habit-structural-derived',
        diophantinePassed: false,
        matchedDims: ['对话记录+工具流结构反推', ...(c.matchedDims || []).slice(0, 4)],
        habitScore: res.reasoningScore,
      };
    });
  }

  function learnFromChat(chat, modelName, arg3 = {}, arg4 = {}) {
    const optsObj = (typeof arg3 === 'number')
      ? { ...(arg4 && typeof arg4 === 'object' ? arg4 : {}), weight: arg3 }
      : (arg3 && typeof arg3 === 'object' ? arg3 : {});
    const {
      userConfirmed = false,
      autoTeacher = false,
      teacherConf = 0,
      weight = 1.0,
      score = null,
      modelMeta = null,
      oldModel = null,
      battleRevealed = false,
      battlePaired = false,
      battleSide = null,
      directMode = false,
      evalModality = null,
      vendorHint = '',
      familyHint = '',
      effortHint = '',
    } = optsObj;
    if (!chat?.sid || !modelName) return null;
    const rawName = String(modelName || '').replace(/[?？]+$/, '').trim();
    if (!rawName || /^(未知型号|待定|未识别)$/.test(rawName)) return null;
    if (/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(rawName) && CONFIRMED_GEMINI_FLASH_SIDS.has(String(chat.sid))) {
      return null;
    }
    const decomp = decomposeModelIdentity(rawName, {
      vendor: vendorHint,
      family: familyHint,
      effort: effortHint || undefined,
      rawLabel: rawName,
    });
    const canon = decomp.canon || (rawName === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawName) : rawName));
    const isExplicitManualOverride = Boolean(optsObj.battleRevealed === false || optsObj.userCorrected === true);
    const isBattleRev = !isExplicitManualOverride && Boolean(battleRevealed || chat?.battleSide || /#[ab]$/i.test(String(chat.sid)));
    const isDirectRev = Boolean(directMode || chat?.evalMode === 'direct' || chat?.directModelName);
    const known = modelMeta || (typeof Models !== 'undefined' ? Models.get(chat.sid) : null);
    const hasLoadedMsgs = Array.isArray(chat?.messages) && chat.messages.length > 0;
    const feat = hasLoadedMsgs ? extractFeatures(chat, (isBattleRev || isDirectRev) ? { ...(known || {}), name: canon, rawLabel: rawName, evalModality: evalModality || chat?.evalModality } : known) : null;
    const isManualUserConfirm = Boolean(userConfirmed && !autoTeacher);
    const isHighTrustTeacher = Boolean(isBattleRev || isDirectRev || isManualUserConfirm || (autoTeacher && (Number(teacherConf) || 0) >= 85));
    if (!feat && !isManualUserConfirm && !isBattleRev && !isDirectRev) return null;
    if (!isHighTrustTeacher && feat && feat.turns < 1) return null;
    if (feat?.fromIncompleteTurn) return null;
    const isStubFeat = Boolean(feat && Array.isArray(feat.vec) && isSyntheticStubVecSample(feat.vec) && !hasLoadedMsgs);
    if (isStubFeat && !isManualUserConfirm) return null;
    const protoFallback = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawName.toLowerCase() || parseModelFamilyAndTier(p.label).famKey === decomp.family);
    const vec = (feat && Array.isArray(feat.vec) && feat.vec.length === 20)
      ? feat.vec
      : (protoFallback ? [...protoFallback.vec] : [1, 0, 0.08, 0.14, 0.22, 0.08, 0.34, 0.08, 0.14, 0.08, 0.72, 0.64, 0.70, 0.30, 0.26, 0.46, 0.54, 0.56, 0.52, 0.48]);
    const bank = loadBank();
    const idx = bank.findIndex(s => s && s.sid === chat.sid);
    const validScore = score != null && score !== '' && Number.isFinite(+score) && +score >= 10 && +score <= 100;
    const targetScore = validScore ? +score : (feat?.habitReasoningScore ?? 75);
    // 5 级真值金字塔权重（Battle 对偶揭晓 9.5 > Battle 单边揭晓 8.5 > Direct 锁定 6.5 > 手动纠偏参考趋势 1.8）
    const resolvedTruthTier = isBattleRev
      ? (battlePaired ? 'battle_paired' : 'battle_single')
      : isDirectRev
        ? 'direct_locked'
        : isManualUserConfirm
          ? 'manual_correction'
          : 'auto_teacher';
    const resolvedWeight = isBattleRev
      ? (battlePaired ? 9.5 : 8.5)
      : isDirectRev
        ? 6.5
        : isManualUserConfirm
          ? 1.8
          : (isHighTrustTeacher ? 2.8 : (Number(weight) || 1.0));
    if (idx >= 0) {
      const prev = bank[idx];
      const prevRank = getSampleTruthRank(prev);
      const curRank = isBattleRev ? (battlePaired ? 5 : 4) : isDirectRev ? 3 : isManualUserConfirm ? 2 : 1;
      const prevScoreValid = prev.score != null && Number.isFinite(+prev.score) && +prev.score >= 10 && +prev.score <= 100;
      const hasRicherMeta = Boolean(feat && (chat?.messages?.length || 0) >= 2 && (!prev.meta || (prev.meta.turns || 0) < (feat.turns || 0) || (prev.vec?.[0] === 0 && feat.vec?.[0] === 1)));
      if (prevRank > curRank && prevScoreValid) {
        if (hasRicherMeta && String(prev.model || '').toLowerCase() === String(canon || '').toLowerCase()) {
          const enriched = {
            ...prev,
            vendor: prev.vendor || decomp.vendor,
            vendorLabel: prev.vendorLabel || decomp.vendorLabel,
            family: prev.family || decomp.family,
            familyLabel: prev.familyLabel || decomp.familyLabel,
            effort: prev.effort || decomp.effort,
            effortLabel: prev.effortLabel || decomp.effortLabel,
            vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
            tierVec: Array.isArray(feat?.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : prev.tierVec,
            meta: extractCompactMeta(feat),
          };
          bank[idx] = enriched;
          saveBank(bank);
          return enriched;
        }
        if (isManualUserConfirm && String(prev.model || '').toLowerCase() !== String(canon || '').toLowerCase()) {
          const conflictEntry = {
            ...prev,
            platformRevealedModel: prev.platformRevealedModel || prev.model,
            userCorrectedModel: canon,
            labelConflict: true,
          };
          bank[idx] = conflictEntry;
          saveBank(bank);
          return conflictEntry;
        }
        return prev;
      }
      if (autoTeacher && !isManualUserConfirm && !isBattleRev && !isDirectRev && prevScoreValid && !hasRicherMeta && String(prev.model || '').toLowerCase() === String(canon || '').toLowerCase() && prev.autoTeacher && Math.abs((Number(prev.score) || 0) - targetScore) < 0.2) {
        return prev;
      }
    }
    let elasticInfo = null;
    if (isManualUserConfirm && !isBattleRev && !isDirectRev && feat) {
      // 用户手动纠偏在 GPT 档位猜测中仅作参考趋势（软牵引权重 1.8），不覆写 Battle 真值质心
      elasticInfo = recordElasticCorrection(chat, feat, oldModel || known?.name || known?.candidateName || '', canon, targetScore, 1.8);
    }
    const resolvedModality = String(evalModality || feat?.evalModality || chat?.evalModality || 'chat').toLowerCase();
    const prevSample = idx >= 0 ? bank[idx] : null;
    const hadLabelChange = Boolean(prevSample && prevSample.model && String(prevSample.model).toLowerCase() !== String(canon).toLowerCase());
    const platformRevealedModel = isBattleRev ? canon : (prevSample?.platformRevealedModel || (prevSample?.battleRevealed ? prevSample.model : undefined));
    const userCorrectedModel = (isManualUserConfirm && !isBattleRev && !isDirectRev) ? canon : (prevSample?.userCorrectedModel || (prevSample?.truthTier === 'manual_correction' ? prevSample.model : undefined));
    const labelConflict = Boolean(platformRevealedModel && userCorrectedModel && String(platformRevealedModel).toLowerCase() !== String(userCorrectedModel).toLowerCase());
    const entry = {
      sid: chat.sid,
      model: canon,
      rawLabel: rawName,
      ...(platformRevealedModel ? { platformRevealedModel } : {}),
      ...(userCorrectedModel ? { userCorrectedModel } : {}),
      ...(labelConflict ? { labelConflict: true } : {}),
      ...(hadLabelChange ? { previousLabel: prevSample.rawLabel || prevSample.model, relabelAt: Date.now() } : {}),
      ...(optsObj?.messageId ? { messageId: optsObj.messageId } : (feat?.targetMessageId ? { messageId: feat.targetMessageId } : {})),
      ...(optsObj?.attemptId ? { attemptId: optsObj.attemptId } : {}),
      ...(optsObj?.artifactDigest ? { artifactDigest: optsObj.artifactDigest } : {}),
      vendor: decomp.vendor,
      vendorLabel: decomp.vendorLabel,
      family: decomp.family,
      familyLabel: decomp.familyLabel,
      effort: decomp.effort,
      effortLabel: decomp.effortLabel,
      isOpen: (isBattleRev || isDirectRev || chat?.isEvaluation) ? Boolean(isOpenName(canon)) : Boolean(feat?.isOpenThink || isOpenName(canon)),
      score: targetScore,
      rawHabitScore: feat?.habitReasoningScore ?? null,
      vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
      tierVec: Array.isArray(feat?.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : undefined,
      meta: extractCompactMeta(feat),
      tags: (feat?.habitTags && feat.habitTags.length) ? feat.habitTags.slice(0, 5) : [isBattleRev ? '⚔️ Battle揭晓样本' : isDirectRev ? '🎯 Direct锁定样本' : autoTeacher ? '⚡ 反推自动纠偏样本' : '✓ 用户手动纠偏样本'],
      softTargets: elasticInfo?.softTargets || undefined,
      rejectedModel: elasticInfo?.rejectedModel || undefined,
      userConfirmed: isHighTrustTeacher,
      autoTeacher: Boolean(autoTeacher && !isManualUserConfirm && !isBattleRev && !isDirectRev),
      teacherConf: Number(teacherConf) || ((isBattleRev || isDirectRev || isManualUserConfirm) ? 100 : 0),
      weight: resolvedWeight,
      truthTier: resolvedTruthTier,
      evalModality: resolvedModality,
      battleRevealed: isBattleRev,
      directMode: isDirectRev,
      battleSide: battleSide || chat?.battleSide || (/#b$/i.test(String(chat.sid)) ? 'b' : /#a$/i.test(String(chat.sid)) ? 'a' : undefined),
      contentDigest: computeMessagesDigest(chat?.messages),
      at: Date.now(),
    };
    if (idx >= 0) bank[idx] = entry;
    else bank.unshift(entry);
    let cleanedBank = bank;
    // 回溯洗库与历史偏差自愈（Retroactive Bank Self-Healing）：
    // 1) 当 Battle / Direct 揭晓 100% 真值时，自动清洗历史库中特征高度相似但被低置信度 autoTeacher 或手动猜测贴错档位的同家族噪声样本
    if ((isBattleRev || isDirectRev) && feat && !feat.anomalous) {
      const pTrue = parseModelFamilyAndTier(canon);
      cleanedBank = bank.filter(s => {
        if (!s || s === entry || s.sid === chat.sid) return true;
        const sRank = getSampleTruthRank(s);
        if (sRank >= 3) return true; // 绝不清理任何 Battle / Direct / 诊断真值
        const sCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(s.model) : (s.model || '');
        const pSample = parseModelFamilyAndTier(sCanon);
        if (s.autoTeacher && (Number(s.teacherConf) || 0) < 85 && Boolean((feat.totalTools || 0) > 0) === Boolean((s.meta?.totalTools || 0) > 0) && Array.isArray(s.vec) && vectorSimilarity(vec, s.vec, feat) >= 0.90 && String(sCanon).toLowerCase() !== String(canon).toLowerCase()) {
          return false;
        }
        // 若是旧的手动猜测纠偏样本（sRank === 2），且与当前 Battle 真值属于同一家族不同档位、在 12 维档位子空间高度重合 (>= 0.91)，则将其软牵引向真值档位修正
        if (sRank === 2 && pTrue.famKey && pSample.famKey === pTrue.famKey && pSample.tier !== pTrue.tier && Array.isArray(s.tierVec) && Array.isArray(feat.tierVec)) {
          const tvS = tierVecSimilarity(feat.tierVec, s.tierVec, resolvedModality);
          if (tvS != null && tvS >= 0.91) {
            s.softTargets = { ...(s.softTargets || {}), [canon]: 0.48 };
          }
        }
        return true;
      });
    } else if (isManualUserConfirm && !isBattleRev && feat) {
      const rejKey = String(elasticInfo?.rejectedModel || '').toLowerCase();
      cleanedBank = bank.filter(s => {
        if (!s || s === entry || s.sid === chat.sid) return true;
        if (getSampleTruthRank(s) >= 2) return true;
        const smKey = String(typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(s.model) : (s.model || '')).toLowerCase();
        if (rejKey && smKey === rejKey) return false;
        if (Array.isArray(s.vec) && vectorSimilarity(vec, s.vec, feat) >= 0.78 && smKey !== String(canon).toLowerCase()) return false;
        return true;
      });
    }
    if (feat && !feat.anomalous && (isBattleRev || isDirectRev || isManualUserConfirm || isHighTrustTeacher)) {
      recordTeacherCalibration(canon, feat, targetScore, resolvedWeight, chat.sid);
    }
    saveBank(cleanedBank, { replace: cleanedBank.length !== bank.length });
    if (hadLabelChange || cleanedBank.length !== bank.length) {
      try { rebuildCalibrationFromBank(cleanedBank); } catch {}
    }
    if (isManualUserConfirm || isBattleRev || isDirectRev) recordModelUse(canon, decomp.vendor, decomp.family, decomp.effort);
    return entry;
  }

  // 反推教师 -> 习惯学生 自动闭环学习入口：每当 /cost 锁定结果时，自动纠偏该会话习惯样本并在线更新原型均值与推理分偏移
  function learnFromReverseTeacher(chat, modelEntry, topRev, teacherScore = null) {
    if (!topRev || topRev.structuralRev || topRev.source === 'habit' || topRev.source === 'fp' || topRev.habitSource) return null;
    if (modelEntry?.fromTitle || modelEntry?.origin === 'title') return null;
    const revPct = Number(topRev.revPct ?? topRev.match ?? 0);
    if (!(topRev.diophantinePassed || revPct >= 85) || revPct < 75) return null;
    const sid = chat?.sid || modelEntry?.sid || '';
    if (!sid) return null;
    const label = String(topRev.effortProfile?.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.canon || topRev.id || '').replace(/[?？]+$/, '').trim();
    if (!label || /^(未知型号|待定|未识别)$/.test(label)) return null;
    const decomp = decomposeModelIdentity(label, {
      vendor: topRev.vendor || modelEntry?.vendor,
      family: topRev.family || modelEntry?.family,
      effort: topRev.effortProfile?.effort || topRev.effort || undefined,
      rawLabel: label,
    });
    const isOkScore = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
    const resolvedScore = isOkScore(teacherScore)
      ? +teacherScore
      : (isOkScore(modelEntry?.reverseScore) && !modelEntry?.habitInferred)
        ? +modelEntry.reverseScore
        : null;
    return learnFromChat(chat || { sid, messages: [] }, decomp.canon || label, {
      userConfirmed: false,
      autoTeacher: true,
      teacherConf: revPct,
      weight: topRev.diophantinePassed ? 3.2 : 2.2,
      score: resolvedScore,
      modelMeta: modelEntry,
      vendorHint: decomp.vendor,
      familyHint: decomp.family,
      effortHint: decomp.effort,
    });
  }

  // 将确定知道是什么模型的诊断 JSON（billing-*.json 或习惯库 JSON）导入到习惯库中，辅助习惯识别
  function importDiagnosticJson(rawInput, explicitModelName = '') {
    let data = rawInput;
    if (typeof rawInput === 'string') {
      data = JSON.parse(rawInput);
    }
    if (!data || typeof data !== 'object') throw new Error('无效的 JSON 数据');

    // 情况 1：导入的是完整习惯库备份文件（含 samples 数组或样本向量数组）
    const bankSamplesArr = Array.isArray(data.samples)
      ? data.samples
      : Array.isArray(data?.habitLearnBank?.samples)
        ? data.habitLearnBank.samples
        : (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.vec) && data[0]?.model)
          ? data
          : null;
    if (bankSamplesArr) {
      const calObj = data.calibration || data?.habitLearnBank?.calibration || null;
      const statsObj = data.usageStats || data?.habitLearnBank?.usageStats || null;
      const res = mergeSharedBank(bankSamplesArr, calObj, statsObj);
      try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
      try { syncAllOpenAndKnownChats(); } catch {}
      return {
        kind: 'bank',
        imported: bankSamplesArr.length,
        added: res.added,
        updated: res.updated,
        skipped: res.skipped,
        total: res.total,
        modelCount: res.modelCount,
      };
    }

    // 情况 2：导入的是单条或多条诊断 JSON（billing-*.json）
    const items = Array.isArray(data) ? data : [data];
    let importedCount = 0;
    let lastModel = '';
    const bank = loadBank();
    const importedSids = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const sid = String(
        item.sid ||
        item.sessionId ||
        item.chatId ||
        item.conversationId ||
        item.model?.sid ||
        item.combined?.diagnostics?.sid ||
        item.combined?.diagnostics?.sessionId ||
        ''
      ).trim() || ('diag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));

      const rawModel = String(
        explicitModelName ||
        item.confirmedModel ||
        item.knownModel ||
        item.model?.rawLabel ||
        item.model?.name ||
        item.storedModel?.displayName ||
        item.storedModel?.model ||
        item.summary?.displayName ||
        item.summary?.model ||
        item.combined?.mergedCandidates?.[0]?.label ||
        item.combined?.consensus?.name ||
        item.combined?.estimate?.model ||
        ''
      ).replace(/[?？]+$/, '').trim();
      if (!rawModel || /^(未知型号|待定|未识别)$/.test(rawModel)) {
        throw new Error('请选择或输入该诊断 JSON 对应的已知模型名称');
      }
      const decomp = decomposeModelIdentity(rawModel, {
        vendor: item.vendor || item.model?.vendor,
        family: item.family || item.model?.family,
        effort: item.effort || item.model?.effort,
        rawLabel: rawModel,
      });
      const canon = decomp.canon || (rawModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawModel) : rawModel));
      const localChat = (typeof Chats !== 'undefined' && sid ? Chats.get(sid) : null) || null;
      const modelMeta = {
        ...(item.model || item.storedModel || {}),
        sid,
        name: canon,
        rawLabel: rawModel,
        habitFeatures: item.habitFeatures || item.combined?.habitFeatures || item.model?.habitFeatures || null,
        habitTags: item.habitFeatures?.habitTags || item.combined?.habitFeatures?.habitTags || item.model?.habitTags || item.storedModel?.habitProfile?.dims || item.combined?.mergedCandidates?.[0]?.matchedDims || [],
        habitScore: item.habitFeatures?.habitReasoningScore ?? item.combined?.habitFeatures?.habitReasoningScore ?? item.model?.habitScore ?? item.model?.reverseScore ?? item.storedModel?.habitProfile?.reasoningScore ?? item.summary?.reasoningScore ?? 76,
      };
      const feat = extractFeatures(localChat || { sid, messages: [] }, modelMeta);
      let vec = Array.isArray(feat?.vec) && feat.vec.length === 20
        ? [...feat.vec]
        : (Array.isArray(modelMeta.habitFeatures?.vec) && modelMeta.habitFeatures.vec.length === 20 ? [...modelMeta.habitFeatures.vec] : null);
      if (!Array.isArray(vec) || vec.length !== 20) {
        const proto = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawModel.toLowerCase() || parseModelFamilyAndTier(p.label).famKey === decomp.family);
        vec = proto ? [...proto.vec] : [1, 0, 0.15, 0.15, 0.2, 0.2, 0.35, 0.15, 0.15, 0.1, 0.75, 0.7, 0.75, 0.35, 0.25, 0.55, 0.6, 0.65, 0.6, 0.55];
      }
      if (!/gemini|google/i.test(canon) && !isOpenName(canon) && vec[0] === 0 && vec[1] === 1) {
        vec[0] = 1;
        vec[1] = 0;
      }
      const score = Number.isFinite(+modelMeta.habitScore) ? +modelMeta.habitScore : (feat?.habitReasoningScore ?? 76);
      const tags = (feat?.habitTags && feat.habitTags.length) ? feat.habitTags.slice(0, 6) : ['诊断JSON导入样本', `推理分 ${score}`];
      const entry = {
        sid,
        model: canon,
        rawLabel: rawModel,
        vendor: decomp.vendor,
        vendorLabel: decomp.vendorLabel,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        effortLabel: decomp.effortLabel,
        isOpen: Boolean(feat?.isOpenThink || isOpenName(canon)),
        score,
        vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
        meta: extractCompactMeta(feat),
        tags: ['📥 诊断JSON导入', ...tags.filter(t => t !== '📥 诊断JSON导入').slice(0, 5)],
        userConfirmed: true,
        importedFromDiag: true,
        weight: 3.5,
        at: Date.now(),
      };
      const idx = bank.findIndex(s => s && s.sid === sid);
      if (idx >= 0) bank[idx] = entry;
      else bank.unshift(entry);
      recordTeacherCalibration(canon, feat || { vec: entry.vec, tierVec: entry.meta?.tierVec, meta: entry.meta, habitReasoningScore: score }, score, 3.5, sid);
      importedCount++;
      lastModel = canon;
      recordModelUse(canon, decomp.vendor, decomp.family, decomp.effort);
      if (sid && !sid.startsWith('diag-')) importedSids.push({ sid, rawModel, canon });
    }

    saveBank(bank);

    // 如果当前客户端存在被导入的对话，同步校准其习惯与模型记录
    for (const { sid, rawModel } of importedSids) {
      if (typeof Models !== 'undefined' && (Models.get(sid) || (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof History !== 'undefined' && History.byId?.(sid)))) {
        confirmUserCorrection(sid, rawModel, { learn: false });
      }
    }

    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    try { syncAllOpenAndKnownChats(); } catch {}
    return { kind: 'diagnostic', imported: importedCount, model: lastModel, total: bank.length };
  }


  function isEvalSession(sidOrChat, hEntry = null) {
    const c = (typeof sidOrChat === 'object' && sidOrChat) ? sidOrChat : (sidOrChat && typeof Chats !== 'undefined' ? Chats.get(sidOrChat) : null);
    if (c && (c.isEvaluation || c.evalMode === 'battle' || c.evalMode === 'direct' || c._isVirtualBattleSide)) return true;
    const sid = (typeof sidOrChat === 'string') ? sidOrChat : c?.sid;
    const he = hEntry || (sid && typeof History !== 'undefined' && typeof History.byId === 'function' ? History.byId(sid) : null);
    if (he && (he.type === 'evaluation' || he.mode === 'battle' || he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side')) return true;
    return false;
  }

  function identifyAndApply(chat, { force = false, fromCostFallback = false, interactive = false, preferLatestTurn = false } = {}) {
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
    const hasNewerLoadedTurn = Boolean(hasLoadedMsgs && ((compAsstForGuard.length > (Number(known?.completedTurnCount) || 0)) || !known?.lastMessageId || (compAsstForGuard.at(-1)?.id && compAsstForGuard.at(-1).id !== known.lastMessageId) || (known?.reverseVer || 0) < 183));
    if (!interactive && !force && !hasLoadedMsgs && !hasNewerLoadedTurn && !known?.habitFeatures && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (restoredMeta && !restoredMeta.fromPrefix && !restoredMeta.fromLocal))) return known;
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
    const resPreCheck = (hasRealCostModel || known?.routed || preferLatestTurn) ? analyze(chat, known, { ignoreExactSid: Boolean((interactive && force) || preferLatestTurn), preferLatestTurn }) : null;
    const habRoutePreCheck = (resPreCheck && typeof BillingProbe !== 'undefined' && typeof BillingProbe.detectHabitAndMessageRoute === 'function')
      ? BillingProbe.detectHabitAndMessageRoute(sid, chat, null, known, resPreCheck, known?.reverseCandidates)
      : null;
    const isMidTurnRouted = Boolean(habRoutePreCheck?.routed || resPreCheck?.features?.htmlSvgRoutePivot);
    if (hasRealCostModel && costEnabledNow && !interactive && !preferLatestTurn && !isMidTurnRouted) {
      if (realSavedRevCand && known && !known.routed) {
        try { learnFromReverseTeacher(chat, known, realSavedRevCand); } catch {}
      }
      return known;
    }
    if ((hasRealCostModel || (hasKnownRealCost && known?.sure && known?.reverseInferred && !known?.habitInferred)) && !interactive && !preferLatestTurn && !isMidTurnRouted && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (!force || !known?.habitInferred)) return known;

    const res = resPreCheck || analyze(chat, known, { ignoreExactSid: Boolean((interactive && force) || preferLatestTurn), preferLatestTurn });
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