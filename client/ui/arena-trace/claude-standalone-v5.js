/*!
 * Claude Standalone Zero-Quota & Multi-Modal Identification Engine (V5.0)
 * =======================================================================
 * Standalone JS/Node/UMD module saved separately to avoid ANY conflict with
 * concurrent `Gemini 4 Carbon` edits in shared Facet/Nexus files.
 *
 * Supports:
 *   1. Node.js module:
 *        const { classifyClaudeSample, composeWithCarbon } = require('./claude_standalone_classifier_v5');
 *   2. Browser / WebView2 UMD global:
 *        window.ClaudeStandaloneClassifierV5.classifyClaudeSample(sample)
 *   3. Drop-in CLI Stdin/Stdout JSON Bridge (100% compatible with `facet_latest_bridge.js`):
 *        node claude_standalone_classifier_v5.js < payload.json
 *        node claude_standalone_classifier_v5.js --selftest
 */
(function (root, factory) {
  const api = factory();
  if (root) root.ClaudeStandaloneClassifierV5 = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGINE_VERSION = '5.1.0-v11-terra-antibleed';

  function extractFirstSvgOrHtml(rawText) {
    if (!rawText) return '';
    const txt = String(rawText).trim();
    const low = txt.toLowerCase();
    const iDoc = low.indexOf('<!doctype html');
    const iHtm = low.indexOf('<html');
    const hSt = (iDoc !== -1 && (iHtm === -1 || iDoc <= iHtm)) ? iDoc : iHtm;
    if (hSt !== -1) {
      const hEd = low.indexOf('</html>', hSt);
      if (hEd !== -1) return txt.slice(hSt, hEd + 7).trim();
    }
    const sSt = low.indexOf('<svg');
    if (sSt !== -1) {
      const sEd = low.indexOf('</svg>', sSt);
      if (sEd !== -1) return txt.slice(sSt, sEd + 6).trim();
    }
    return '';
  }

  function extractWireAndProseDna(detailJson, sseText, extraEvidence, replyText) {
    const ev = Object.assign({}, extraEvidence || {});
    const toolIds = Array.isArray(ev.toolIds) ? ev.toolIds.slice() : [];
    const sseStreamIds = [];

    let sseTextChunks = 0;
    let sseTextChars = 0;
    let sseReasonChars = 0;
    let sseReasonEmpty = 0;
    let hasStepStart = false;
    let hasManifestUuid = Boolean(ev.hasManifestUuid || ev.hasManifestNodeId);

    if (sseText) {
      for (const rawLine of String(sseText).split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payloadStr = trimmed.slice(5).trim();
        if (!payloadStr || payloadStr === '[DONE]') continue;
        let outer = null;
        try { outer = JSON.parse(payloadStr); } catch (_) { continue; }
        const events = [];
        if (outer && Array.isArray(outer.records)) {
          for (const rec of outer.records) {
            if (!rec || rec.body === undefined) continue;
            if (typeof rec.body === 'string') {
              try { events.push(JSON.parse(rec.body)); } catch (_) {}
            } else if (typeof rec.body === 'object' && rec.body) {
              events.push(rec.body);
            }
          }
        } else if (outer && typeof outer === 'object') {
          events.push(outer.data ? outer : { data: outer });
        }
        for (const evt of events) {
          const d = (evt && evt.data && typeof evt.data === 'object') ? evt.data : evt;
          if (!d || typeof d !== 'object') continue;
          const tp = String(d.type || '');
          const itemId = String(d.id || '');
          if (itemId && !sseStreamIds.includes(itemId)) sseStreamIds.push(itemId);
          if (tp === 'step-start') {
            hasStepStart = true;
          } else if (tp === 'reasoning-delta' || tp === 'reasoning') {
            const rd = String(d.delta || d.textDelta || d.text || '');
            if (rd.trim().length > 0) sseReasonChars += rd.length;
            else sseReasonEmpty += 1;
          } else if (tp === 'text-delta') {
            const td = String(d.delta || d.textDelta || '');
            if (td.length > 0) {
              sseTextChunks += 1;
              sseTextChars += td.length;
            }
          } else if (tp.startsWith('tool-')) {
            const tcid = String(d.toolCallId || d.id || '');
            if (tcid && !toolIds.includes(tcid)) toolIds.push(tcid);
          }
        }
      }
    }

    const isSyntheticSse = sseStreamIds.includes('txt_synth') || Boolean(ev.syntheticFallback);

    let maxTurnRpNoTools = 0;
    let maxTurnRpAny = 0;
    let totalVisibleRc = Number(ev.rc || ev.reasoningTextLength || sseReasonChars || 0);
    let lastTurnRp = Number(ev.rp || 0);
    let lastTurnRc = Number(ev.rc || 0);
    const allTexts = [];
    let sawEmptyReasoning = sseReasonEmpty > 0;
    let pinnedModel = '';
    const localTitleModel = String(ev.localTitleModel || '');

    if (detailJson && typeof detailJson === 'object') {
      const pm = String(detailJson.pinnedModel || '').trim();
      if (pm && pm.includes('/') && !pm.includes('(')) pinnedModel = pm;
      const msgs = Array.isArray(detailJson.messages)
        ? detailJson.messages
        : (detailJson.chat && Array.isArray(detailJson.chat.messages) ? detailJson.chat.messages : []);
      const asstMsgs = msgs.filter(m => m && m.role === 'assistant');
      let accRc = 0;
      asstMsgs.forEach((m, idxM) => {
        if (m.manifestNodeId) hasManifestUuid = true;
        const parts = Array.isArray(m.parts) ? m.parts : [];
        let tRp = 0, tRc = 0, tTools = 0;
        for (const p of parts) {
          if (!p || typeof p !== 'object') continue;
          const pt = String(p.type || '');
          if (pt === 'step-start') {
            hasStepStart = true;
          } else if (pt === 'reasoning') {
            tRp += 1;
            const rt = String(p.text || '');
            if (rt.trim().length > 0) tRc += rt.length;
            else sawEmptyReasoning = true;
          } else if (pt === 'text') {
            const tt = String(p.text || '');
            if (tt) allTexts.push(tt);
          } else if (pt.includes('tool')) {
            tTools += 1;
            const tid = String(p.toolCallId || (p.toolInvocation && p.toolInvocation.toolCallId) || '');
            if (tid && !toolIds.includes(tid)) toolIds.push(tid);
            const inp = p.input || p.args || (p.toolInvocation && p.toolInvocation.args) || {};
            if (inp && typeof inp === 'object') {
              for (const k of ['content', 'new_text', 'code']) {
                if (typeof inp[k] === 'string' && inp[k]) allTexts.push(inp[k]);
              }
            }
          }
        }
        accRc += tRc;
        if (tRp > maxTurnRpAny) maxTurnRpAny = tRp;
        if (tTools === 0 && tRp > maxTurnRpNoTools) maxTurnRpNoTools = tRp;
        else if (tTools > 0 && (tRp - tTools) > maxTurnRpNoTools) maxTurnRpNoTools = tRp - tTools;
        if (idxM === asstMsgs.length - 1) {
          lastTurnRp = Math.max(lastTurnRp, tRp);
          lastTurnRc = Math.max(lastTurnRc, tRc);
        }
      });
      totalVisibleRc = Math.max(totalVisibleRc, accRc);
    }

    if (replyText) allTexts.push(String(replyText));
    const joinedText = allTexts.join('\n');
    const hasOpenaiLatex = /\\\([\s\S]{1,160}?\\\)/.test(joinedText) || /\\\[[\s\S]{1,400}?\\\]/.test(joinedText);
    const hasDollarMath = /\$\$?[^$\n]{1,160}\$\$?/.test(joinedText);

    let toolVendor = null;
    if (toolIds.some(t => /^(?:srv)?toolu_|^msg_01/i.test(t))) toolVendor = 'anthropic';
    else if (toolIds.some(t => /^call_\d+_/i.test(t))) toolVendor = 'deepseek';
    else if (toolIds.some(t => /^functions\.[A-Za-z0-9_]+:\d+/.test(t))) toolVendor = 'moonshotai';
    else if (toolIds.some(t => /^call_(?![0-9a-f]{24}\b)[A-Za-z0-9_-]{16,}/.test(t))) toolVendor = 'openai';

    let streamShape = String(ev.streamIdShape || '');
    if (!isSyntheticSse) {
      if (sseStreamIds.some(s => /^rs_/i.test(s))) streamShape = 'openai-rs';
      else if (sseStreamIds.some(s => s === 'txt-0' || s === 'reasoning-0')) streamShape = 'compat-txt';
      else if (sseTextChunks >= 3 && sseStreamIds.some(s => /^\d+$/.test(s))) streamShape = 'numeric-real';
    } else if (streamShape === 'numeric') {
      streamShape = 'synthetic-ignored';
    }

    let realAvgChunk = Number(ev.realSseAvgChunk || ev.avgChunk || ev.tAvg || 0);
    if (!isSyntheticSse && sseTextChunks >= 3) realAvgChunk = sseTextChars / sseTextChunks;
    const cps = Number(ev.cps || ev.textCps || 0);

    const effectiveMaxRp = Math.max(maxTurnRpNoTools, maxTurnRpAny, lastTurnRp, Number(ev.rSeg || 0));
    const effectiveRc = Math.max(totalVisibleRc, lastTurnRc, Number(ev.rCh || 0));

    return {
      pinnedModel,
      localTitleModel,
      toolIds,
      toolVendor,
      streamShape,
      isSyntheticSse,
      effectiveRc,
      effectiveMaxRp,
      maxTurnRpNoTools: maxTurnRpNoTools > 0 ? maxTurnRpNoTools : lastTurnRp,
      sawEmptyReasoning,
      hasStepStart,
      hasManifestUuid,
      realAvgChunk: +realAvgChunk.toFixed(2),
      cps: +cps.toFixed(2),
      hasOpenaiLatex,
      hasDollarMath,
      joinedText,
    };
  }

  function analyzeSvg32MicroPelican(svg) {
    const s = String(svg || '').trim();
    const bLen = typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : new Blob([s]).size;

    const mOpen = s.match(/^<svg\b([^>]*)>/i);
    const svgOpen = mOpen ? mOpen[1] : '';
    const posVb = svgOpen.indexOf('viewBox');
    const posW = svgOpen.indexOf('width=');
    const widthBeforeViewbox = (posW !== -1 && posVb !== -1 && posW < posVb);
    const rootFillNone = /\bfill=["']none["']/.test(svgOpen);
    const rootHasStroke = /\bstroke=["']#[0-9a-fA-F]{3,6}["']/.test(svgOpen);

    const hasFullSkyRect = /<rect\b[^>]*width=["']32["'][^>]*height=["'](?:32|1[6-9]|2[0-6])["']/.test(s)
      && !/<rect\b[^>]*\by=["']1[1-5]["'][^>]*width=["']32["']/.test(s);
    const skyRectHasRx = /<rect\b[^>]*width=["']32["'][^>]*\brx=["'][0-9.]+["']/.test(s)
      || /<rect\b[^>]*\brx=["'][0-9.]+["'][^>]*width=["']32["']/.test(s);
    const skyRectStrokeNone = /<rect\b[^>]*width=["']32["'][^>]*stroke=["']none["']/.test(s);
    const hasCircleCanvas = /<circle\b[^>]*cx=["']16["'][^>]*cy=["']16["'][^>]*r=["']1[2-6]/.test(s);

    const hasHeavyIconGWrapper = /<g\b[^>]*stroke=["']#[0-9a-fA-F]{3,6}["'][^>]*stroke-width=["'](?:1\.[1-9][0-9]*|2(?:\.[0-9]*)?)["'][^>]*stroke-linecap=["']round["'][^>]*stroke-linejoin=["']round["']/.test(s);
    const hasFillNoneGWrapper = /<g\b[^>]*fill=["']none["'][^>]*stroke=["']/.test(s) && !hasFullSkyRect;

    const hasOpus5HvWater = /<path\b[^>]*d=["']M0\s+2[0-6]\s*h32\s*v(?:[6-9]|1[0-2])\s*H0\s*[zZ]["']/.test(s);
    const hasWaterRect = /<rect\b[^>]*\by=["'](?:1[6-9]|2[0-6])["'][^>]*width=["']32["']/.test(s);
    const hasOpus5Shimmer = /<path\b[^>]*d=["']M[0-4]\s+2[4-7]\s*h(?:32|[5-9])M(?:0|1[0-6])\s+2[6-9]\s*h(?:32|[6-9]|1[0-2])/.test(s);
    const hasFilledWater = hasOpus5HvWater
      || hasWaterRect
      || (rootHasStroke && skyRectStrokeNone)
      || /<path\b[^>]*d=["']M\s*0\s+(?:1[89]|2[0-7])[^"']*(?:V\s*32|v\s*(?:[6-9]|1[0-4])|32\s+32)[^"']*[zZ]["']/.test(s);

    const dList = [];
    const reD = /\bd=["']([^"']+)["']/g;
    let mD;
    while ((mD = reD.exec(s)) !== null) dList.push(mD[1]);
    const dJoined = dList.join(' ');
    const upperCmds = (dJoined.match(/[MLHVCSQTA]/g) || []).length;
    const lowerCmds = (dJoined.match(/[mlhvcsqta]/g) || []).length;
    const upperShare = upperCmds / Math.max(1, upperCmds + lowerCmds);
    const spacedEndZ = dList.filter(d => /\d\s+[Zz]\s*$/.test(d)).length;
    const trailZero3Dec = (s.match(/\.\d\d0\b/g) || []).length;

    const radii = [];
    const reR = /<circle\b[^>]*\br=["']([0-9]*\.?[0-9]+)["']/g;
    let mR;
    while ((mR = reR.exec(s)) !== null) radii.push(parseFloat(mR[1]));
    const minR = radii.length ? Math.min(...radii) : 99.0;
    const tinyEye = minR <= 0.42;
    const hasStroke25 = /stroke-width=["']0?\.25["']/.test(s);
    const cubicLower = (dJoined.match(/c\s*-?\d/g) || []).length;
    const lineTags = (s.match(/<line\b/gi) || []).length;
    const strokedFills = (s.match(/<(?:path|circle|ellipse|polygon)\b[^>]*fill=["']#[0-9a-fA-F]{3,6}["'][^>]*stroke=["']#[0-9a-fA-F]{3,6}["']/g) || []).length;
    const thickNeckStroke = /stroke-width=["'](?:1\.[7-9]|2(?:\.[0-6])?|3(?:\.0)?)["']/.test(s);
    const opus46DualSunBeige = /#FFD700.*#FFA500/i.test(s) && /#F5F5DC/i.test(s);

    const reasons = [];
    const vetoes = [];
    let score = 0;

    if (widthBeforeViewbox) { vetoes.push('SVG32_WIDTH_BEFORE_VIEWBOX_NON_CLAUDE'); score -= 70; }
    if (skyRectHasRx) { vetoes.push('SVG32_ROUNDED_CARD_RX_NON_CLAUDE'); score -= 65; }
    if (hasCircleCanvas) { vetoes.push('SVG32_CIRCLE_BADGE_GEMINI'); score -= 65; }
    if (hasHeavyIconGWrapper) { vetoes.push('SVG32_HEAVY_STROKE_GROUP_ICON_WRAPPER'); score -= 65; }
    if ((rootFillNone || hasFillNoneGWrapper) && !hasFullSkyRect) { vetoes.push('SVG32_MONOCHROME_WIREFRAME_NO_SKY'); score -= 80; }
    if (!hasFilledWater && lineTags < 8) { vetoes.push('SVG32_NO_SOLID_WATER_LAYER'); score -= 55; }
    if (upperShare >= 0.95 && (/L\s*32\s+32\s+L\s*0\s+32\s+Z/.test(s) || (spacedEndZ >= 4 && lineTags === 0)) && !rootHasStroke && !opus46DualSunBeige) {
      vetoes.push('SVG32_GOOGLE_OR_MUSE_SPACED_UPPER_CMD'); score -= 60;
    }
    if (upperShare >= 0.98 && bLen <= 840 && dJoined.length <= 255 && !tinyEye && !hasOpus5HvWater) {
      vetoes.push('SVG32_MINIMAL_UPPERCASE_GPT_ASTRA'); score -= 55;
    }

    let subModel = 'anthropic/claude-opus-5.5';
    let subLabel = 'Claude Opus 5.5';
    let effort = 'HIGH';

    if (hasFullSkyRect && !skyRectHasRx && (hasOpus5HvWater || (hasWaterRect && hasOpus5Shimmer)) && cubicLower >= 1 && !widthBeforeViewbox) {
      score += 90;
      reasons.push('SVG32真Opus5签名: 全幅天空rect + 水平水带 + 小写三次贝塞尔有机鹈鹕解剖');
      if (hasOpus5Shimmer) { score += 10; reasons.push('SVG32真Opus5波光纹: 多段M..h水平微光描边'); }
      effort = (bLen >= 820 || strokedFills >= 4) ? 'MAX' : 'HIGH';
      subModel = 'anthropic/claude-opus-5.5';
      subLabel = `Claude Opus 5.5 (${effort === 'MAX' ? 'Max' : 'High'})`;
    } else if (((tinyEye && (lowerCmds >= 3 || strokedFills >= 3)) || (s.includes('fill="url(#') && lowerCmds >= 4)) && hasFullSkyRect && !widthBeforeViewbox && !skyRectHasRx) {
      score += 85;
      reasons.push(`SVG32经典Opus5.5签名: 微缩瞳孔/渐变剪影(minR=${minR.toFixed(2)}) + 精细描边图元(${strokedFills})`);
      effort = (hasStroke25 || cubicLower >= 3 || minR <= 0.30) ? 'HIGH' : ((strokedFills >= 3 || bLen >= 1210) ? 'MEDIUM' : 'LOW');
      subModel = 'anthropic/claude-opus-5.5';
      subLabel = `Claude Opus 5.5 (${effort[0] + effort.slice(1).toLowerCase()})`;
    } else if (rootHasStroke && skyRectStrokeNone && !widthBeforeViewbox && !skyRectHasRx) {
      score += 80;
      reasons.push('SVG32真Claude5家族签名: 根级圆角描边 + 全幅天空rect(stroke=none) + 分层水体');
      if (tinyEye) { subModel = 'anthropic/claude-opus-5.5'; effort = 'LOW'; subLabel = 'Claude Opus 5.5 (Low)'; }
      else { subModel = 'anthropic/claude-sonnet-5.5'; effort = 'HIGH'; subLabel = 'Claude Sonnet 5.5 (High)'; }
    } else if ((trailZero3Dec >= 2 || (thickNeckStroke && lowerCmds >= 3)) && !widthBeforeViewbox && !skyRectHasRx) {
      score += 78;
      reasons.push('SVG32真Sonnet5.5签名: 粗描边脖颈/三位小数语法 + 相对路径');
      subModel = 'anthropic/claude-sonnet-5.5';
      effort = 'HIGH';
      subLabel = 'Claude Sonnet 5.5 (High)';
    } else if ((opus46DualSunBeige || (lineTags >= 8 && /#7EC8E3.*#FFD93D/i.test(s))) && !widthBeforeViewbox) {
      score += 74;
      subModel = 'anthropic/claude-opus-4.6';
      subLabel = 'Claude Opus 4.6';
      effort = 'HIGH';
      reasons.push('SVG32真Opus4.6签名: 双层金橙太阳/天青画布 + 米白分层解剖');
    } else if (lineTags >= 8 && !hasFullSkyRect && s.includes('data-nonce=') && s.includes('d="M ')) {
      score += 70;
      subModel = 'anthropic/claude-haiku-4.5';
      subLabel = 'Claude Haiku 4.5';
      effort = 'MEDIUM';
      reasons.push("SVG32真Haiku4.5签名: 8放射line太阳 + 空格分隔路径语法(d='M ...')");
    } else if (hasFullSkyRect && hasFilledWater && !widthBeforeViewbox && !skyRectHasRx && /#bfe8f0|#E3F2FD/i.test(s) && minR <= 0.55) {
      score += 68;
      subModel = 'anthropic/claude-sonnet-5';
      subLabel = 'Claude Sonnet 5 (High)';
      effort = 'HIGH';
      reasons.push('SVG32真Sonnet5签名: 浅天蓝画布 + 暖金太阳 + 0.5px精细描边鸟体');
    }

    const isClaudeSvg32 = (score >= 55) && (vetoes.length === 0);
    return {
      mode: 'svg32_micro_pelican',
      is_claude_artifact: isClaudeSvg32,
      delegate_to_carbon: false,
      artifact_score: score,
      sub_model: isClaudeSvg32 ? subModel : '',
      sub_label: isClaudeSvg32 ? subLabel : '',
      inferred_effort: effort,
      reasons,
      vetoes,
    };
  }

  function analyzeFullPelicanSvgOrHtml(text) {
    const s = String(text || '').trim();
    const bLen = typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : new Blob([s]).size;
    const isHtmlDoc = /<!DOCTYPE\s+html|<html\b/i.test(s);

    const mVb = s.match(/viewBox=["']\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*["']/);
    const vbW = mVb ? parseFloat(mVb[1]) : 0;
    const vbH = mVb ? parseFloat(mVb[2]) : 0;

    const paths = (s.match(/<path\b/gi) || []).length;
    const smil = (s.match(/<animate(?:Transform|Motion|Color)?\b/gi) || []).length;
    const cssKeyframes = (s.match(/@keyframes\b/gi) || []).length;

    const jsChunks = [];
    const reScript = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let mS;
    while ((mS = reScript.exec(s)) !== null) jsChunks.push(mS[1]);
    const jsCode = jsChunks.join('\n');
    const jsBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(jsCode, 'utf8') : new Blob([jsCode]).size;
    const hasJsAnim = /requestAnimationFrame|setInterval/.test(jsCode);
    const hasMathIk = /Math\.(?:atan2|acos|hypot)/.test(jsCode);

    const xmlComments = [];
    const reCmt = /<!--([\s\S]*?)-->/g;
    let mC;
    while ((mC = reCmt.exec(s)) !== null) xmlComments.push(mC[1]);
    const nComments = xmlComments.length;
    const hasBoxDivider = xmlComments.some(c => /[═━]{4,}/.test(c)) || /\/\/\s*[═━]{4,}/.test(jsCode);

    const pctGrad = /<linearGradient\b[^>]*\b(?:x1|x2|y1|y2)=["'][0-9.]+%["']/.test(s);
    const unitlessGrad = /<linearGradient\b[^>]*\bx1=["']0["']/.test(s);
    const openaiShorthandGrad = /<linearGradient\b(?![^>]*\bx1=)[^>]*\bx2=/.test(s)
      || /<(?:linear|radial)Gradient\b[^>]*\b(?:x1|x2|y1|y2)=["']\.[0-9]/.test(s);
    const hasDoubleBan = /user-select\s*:\s*none/i.test(s) && /pointer-events\s*:\s*none/i.test(s);
    const hasFlexbox = /display\s*:\s*flex/i.test(s);
    const hasRoleAria = s.includes('role="img"') || s.includes('aria-label=');

    if (isHtmlDoc && hasDoubleBan && unitlessGrad && !hasFlexbox && jsBytes >= 15500 && paths >= 30 && !hasBoxDivider) {
      return {
        mode: 'full_pelican_html_svg',
        is_claude_artifact: false,
        delegate_to_carbon: true,
        artifact_score: -50,
        sub_model: '',
        sub_label: '',
        inferred_effort: 'HIGH',
        non_claude_suspect: 'google/gemini-4-carbon',
        reasons: ['命中 Gemini 4 Carbon 正交 HTML 指纹，移交 Carbon 分类器'],
        vetoes: ['DELEGATE_GEMINI_4_CARBON_HTML_SIGNATURE'],
      };
    }

    const vetoes = [];
    const reasons = [];
    const totalAnim = smil + cssKeyframes + (hasJsAnim ? 8 : 0);
    if (totalAnim === 0) vetoes.push('FULL_PELICAN_ZERO_ANIMATION_STATIC');
    if (bLen < 7200) vetoes.push(`FULL_PELICAN_LOW_BYTE_DENSITY(${bLen}B<7200B)`);
    if (paths < 25 && jsBytes < 6000) vetoes.push(`FULL_PELICAN_SPARSE_PATHS(${paths}<25)`);
    if (vbW > 0 && vbW < 560) vetoes.push(`FULL_PELICAN_TINY_VIEWBOX(${Math.round(vbW)}x${Math.round(vbH)})`);
    if (openaiShorthandGrad) vetoes.push('FULL_PELICAN_OPENAI_GRADIENT_SHORTHAND');
    const _terraShY = /\bx2="0"\s+y2="1"|\by1="0"\s+y2="1"(?!\s*%)/.test(s);
    const _hxM = (s.match(/#[0-9a-fA-F]{6}\b/g) || []).slice(0, 64);
    const _upHx = _hxM.filter(h => /[A-F]/.test(h.slice(1)) && !/[a-f]/.test(h.slice(1))).length;
    if (jsBytes === 0 && smil >= 3 && cssKeyframes >= 5 && _terraShY && nComments <= 5 && _upHx === 0 && bLen >= 12000) {
      vetoes.push('FULL_PELICAN_OPENAI_56_TERRA_SHORTHAND_GUARD');
    }
    if (!isHtmlDoc && nComments === 0) vetoes.push('FULL_PELICAN_RAW_SVG_ZERO_LAYER_COMMENTS');

    let score = 0;
    if (!vetoes.length) {
      score += 55;
      reasons.push(`全尺寸动态鹈鹕门控通过 (${bLen}B, paths=${paths}, smil=${smil}, js=${jsBytes}B)`);
      if (pctGrad) { score += 20; reasons.push('Anthropic百分比渐变坐标签名 (x1/y1=%)'); }
      if (hasBoxDivider) { score += 18; reasons.push('Anthropic框线分节注释签名 (═══)'); }
      else if (nComments >= 8) { score += 10; reasons.push(`清晰解剖图层注释 (${nComments}处)`); }
      if (hasMathIk) { score += 15; reasons.push('三角函数逆运动学骨骼驱动 (Math.atan2/acos)'); }
      else if (smil >= 8 || cssKeyframes >= 3) { score += 10; reasons.push(`多通道连续动画编排 (SMIL=${smil})`); }
      if (hasRoleAria && !pctGrad && !hasBoxDivider) score -= 18;
    }

    const isClaudeFull = (score >= 65) && (vetoes.length === 0);
    const effort = (bLen >= 18000 || (hasMathIk && bLen >= 14000)) ? 'MAX' : (bLen >= 11500 ? 'HIGH' : 'MEDIUM');
    const subModel = bLen >= 10500 ? 'anthropic/claude-opus-5.5' : 'anthropic/claude-sonnet-5.5';
    const subLabel = `${subModel.includes('opus') ? 'Claude Opus 5.5' : 'Claude Sonnet 5.5'} (${effort === 'MAX' ? 'Max' : effort[0] + effort.slice(1).toLowerCase()})`;
    const suspect = (openaiShorthandGrad || (!isHtmlDoc && nComments === 0 && smil >= 6)) ? 'openai/gpt-6.1-sol_or_gpt-6-luna' : '';

    return {
      mode: 'full_pelican_html_svg',
      is_claude_artifact: isClaudeFull,
      delegate_to_carbon: false,
      artifact_score: vetoes.length ? -60 : score,
      sub_model: isClaudeFull ? subModel : '',
      sub_label: isClaudeFull ? subLabel : '',
      inferred_effort: effort,
      non_claude_suspect: suspect,
      reasons,
      vetoes,
    };
  }

  const _CV5_JS_LRU = new Map();
  function clearClaudeV5Cache() { _CV5_JS_LRU.clear(); }
  function classifyClaudeSample(sample) {
    if (sample && typeof sample === 'object' && !sample.detailJson) {
      const _st = String(sample.svgText || sample.html || sample.replyText || '');
      const _ck = _st.length + '\u0000' + _st.slice(0, 96) + '\u0000' + _st.slice(-96) + '\u0000'
        + Number(sample.rp || 0) + ':' + Number(sample.rc || 0) + ':' + String(sample.reasoningSignature || '') + ':'
        + (Array.isArray(sample.toolIds) ? sample.toolIds.slice(0, 4).join(',') : '') + ':'
        + (Array.isArray(sample.streamIds) ? sample.streamIds.slice(0, 4).join(',') : '');
      if (_CV5_JS_LRU.has(_ck)) {
        const _h = _CV5_JS_LRU.get(_ck);
        _CV5_JS_LRU.delete(_ck);
        _CV5_JS_LRU.set(_ck, _h);
        return Object.assign({}, _h);
      }
      const _r = _classifyClaudeSampleUncached(sample);
      _CV5_JS_LRU.set(_ck, _r);
      if (_CV5_JS_LRU.size > 512) _CV5_JS_LRU.delete(_CV5_JS_LRU.keys().next().value);
      return Object.assign({}, _r);
    }
    return _classifyClaudeSampleUncached(sample);
  }
  function _classifyClaudeSampleUncached(sample) {
    sample = sample || {};
    let detailJson = sample.detailJson || sample.detail_json || sample.conversation || null;
    let sseText = String(sample.sseText || sample.sse_text || sample.raw_sse_text || '');
    const extraEv = Object.assign({}, sample.extraEvidence || sample.evidence || {});

    for (const cap of (sample.captures || [])) {
      if (!cap || typeof cap !== 'object') continue;
      const u = String(cap.url || '');
      const rb = cap.responseBody !== undefined ? cap.responseBody : cap.body;
      if (u.includes('/api/chat/') && !u.includes('/run-status') && !u.includes('/cost') && !detailJson) {
        if (rb && typeof rb === 'object') detailJson = rb;
        else if (typeof rb === 'string' && rb.trim()) {
          try { detailJson = JSON.parse(rb); } catch (_) {}
        }
      } else if (u.includes('/sessions/') && u.includes('/out') && rb) {
        sseText += '\n' + String(rb);
      }
    }

    for (const k of ['rp', 'rc', 'rSeg', 'rCh', 'avgChunk', 'tAvg', 'cps', 'localTitleModel', 'streamIdShape', 'toolIds']) {
      if (sample[k] !== undefined && sample[k] !== null && extraEv[k] === undefined) extraEv[k] = sample[k];
    }

    const rawArtifact = String(sample.svgText || sample.svg || sample.html || sample.replyText || sample.raw_reply || '');
    const wire = extractWireAndProseDna(detailJson, sseText, extraEv, rawArtifact);
    const artifactSrc = extractFirstSvgOrHtml(rawArtifact) || extractFirstSvgOrHtml(wire.joinedText);

    let artifactRes = null;
    if (artifactSrc) {
      artifactRes = /viewBox=["']\s*0\s+0\s+32\s+32\s*["']/.test(artifactSrc)
        ? analyzeSvg32MicroPelican(artifactSrc)
        : analyzeFullPelicanSvgOrHtml(artifactSrc);
    }

    const matchedDims = [];
    const vetoReasons = [];
    let delegateToCarbon = false;
    let nonClaudeSuspect = '';

    const pinnedLow = wire.pinnedModel.toLowerCase();
    if (pinnedLow && (pinnedLow.includes('claude') || pinnedLow.includes('anthropic'))) {
      return {
        ok: true,
        engine_version: ENGINE_VERSION,
        is_claude: true,
        family: 'claude',
        vendor: 'anthropic',
        model_id: wire.pinnedModel,
        label: wire.pinnedModel,
        inferred_effort: 'HIGH',
        confidence: 1.0,
        score: 100,
        matched_dims: [`平台直连锁定: ${wire.pinnedModel}`],
        veto_reasons: [],
        delegate_to_carbon: false,
        non_claude_suspect: '',
      };
    }

    if (wire.toolVendor && wire.toolVendor !== 'anthropic') {
      vetoReasons.push(`VETO_NON_ANTHROPIC_TOOL_ID(${wire.toolVendor})`);
      nonClaudeSuspect = wire.toolVendor;
    }
    if (wire.streamShape === 'openai-rs') {
      vetoReasons.push('VETO_OPENAI_RS_STREAM_ID');
      nonClaudeSuspect = nonClaudeSuspect || 'openai/gpt-6.1-sol_or_luna';
    } else if (wire.streamShape === 'compat-txt') {
      vetoReasons.push('VETO_COMPAT_TXT0_STREAM_ID');
      nonClaudeSuspect = nonClaudeSuspect || 'domestic_compat_stream';
    }

    const isLegacy46 = Boolean(artifactRes && String(artifactRes.sub_model || '').includes('4.6'));
    if (wire.effectiveRc > 0 && !isLegacy46) {
      vetoReasons.push(`VETO_VISIBLE_REASONING_COT(rc=${wire.effectiveRc}>0)`);
      nonClaudeSuspect = nonClaudeSuspect || 'non_anthropic_visible_cot';
    }
    if (wire.effectiveRc === 0 && wire.maxTurnRpNoTools >= 6 && wire.toolVendor !== 'anthropic') {
      vetoReasons.push(`VETO_OPENAI_MULTI_REASONING_PARTS(rp=${wire.maxTurnRpNoTools}>=6,rc=0)`);
      nonClaudeSuspect = nonClaudeSuspect || 'openai/gpt-6.1-sol_or_gpt-6-luna';
    }

    const ltm = wire.localTitleModel.toLowerCase();
    if (ltm && !(ltm.includes('claude') || ltm.includes('anthropic'))) {
      vetoReasons.push(`VETO_LOCAL_TITLE_MODEL(${wire.localTitleModel})`);
      nonClaudeSuspect = nonClaudeSuspect || wire.localTitleModel;
    }

    if (artifactRes && artifactRes.delegate_to_carbon) {
      delegateToCarbon = true;
      for (const v of (artifactRes.vetoes || [])) vetoReasons.push(v);
      nonClaudeSuspect = 'google/gemini-4-carbon';
    } else if (wire.effectiveRc === 0 && wire.effectiveMaxRp === 0 && !wire.sawEmptyReasoning
      && wire.realAvgChunk >= 38 && wire.cps >= 175 && wire.toolVendor !== 'anthropic') {
      delegateToCarbon = true;
      vetoReasons.push(`DELEGATE_GEMINI_CARBON_WIRE(avgChunk=${wire.realAvgChunk},cps=${wire.cps},rp=0,rc=0)`);
      nonClaudeSuspect = 'google/gemini-4-carbon';
    }

    if (wire.hasOpenaiLatex && wire.toolVendor !== 'anthropic') {
      vetoReasons.push('VETO_OPENAI_LATEX_PAREN_BRACKET_DELIMITERS');
      nonClaudeSuspect = nonClaudeSuspect || 'openai/gpt-6-luna_or_gpt-6.1-sol';
    }

    if (artifactRes && !artifactRes.is_claude_artifact) {
      for (const v of (artifactRes.vetoes && artifactRes.vetoes.length ? artifactRes.vetoes : ['VETO_NON_CLAUDE_PELICAN_ARTIFACT'])) {
        if (!vetoReasons.includes(v)) vetoReasons.push(v);
      }
      if (artifactRes.non_claude_suspect && !nonClaudeSuspect) nonClaudeSuspect = artifactRes.non_claude_suspect;
    }

    let score = 0;
    let modelId = 'anthropic/claude-opus-5.5';
    let label = 'Claude Opus 5.5 (High)';
    let effort = 'HIGH';

    if (wire.toolVendor === 'anthropic') {
      score += 92;
      matchedDims.push(`Anthropic工具ID硬件锁 (${wire.toolIds[0].slice(0, 16)})`);
    }
    if (artifactRes && artifactRes.is_claude_artifact) {
      score += Number(artifactRes.artifact_score || 0);
      for (const r of (artifactRes.reasons || [])) matchedDims.push(r);
      modelId = artifactRes.sub_model || modelId;
      label = artifactRes.sub_label || label;
      effort = artifactRes.inferred_effort || effort;
    }
    if (wire.streamShape === 'numeric-real' && wire.sawEmptyReasoning && wire.effectiveRc === 0) {
      score += 58;
      matchedDims.push('真实S2纯数字流ID + 加密空推理帧 (rc=0)');
    }
    if (wire.hasDollarMath && !wire.hasOpenaiLatex) {
      score += 14;
      matchedDims.push('Anthropic原生 $...$ 数学公式排版习惯');
    }

    if (vetoReasons.length > 0) {
      return {
        ok: true,
        engine_version: ENGINE_VERSION,
        is_claude: false,
        family: delegateToCarbon ? 'carbon_candidate' : 'non_claude',
        vendor: delegateToCarbon ? 'google' : (nonClaudeSuspect.includes('/') ? nonClaudeSuspect.split('/')[0] : 'non_anthropic'),
        model_id: nonClaudeSuspect || 'non_anthropic/rejected_by_claude_v5',
        label: delegateToCarbon ? '移交 Gemini 4 Carbon 分类器' : `非 Claude (${nonClaudeSuspect || vetoReasons[0]})`,
        inferred_effort: effort,
        confidence: (wire.effectiveRc > 0 || delegateToCarbon || wire.maxTurnRpNoTools >= 6) ? 0.96 : 0.91,
        score: Math.min(-20, score - 80),
        matched_dims: matchedDims,
        veto_reasons: vetoReasons,
        delegate_to_carbon: delegateToCarbon,
        non_claude_suspect: nonClaudeSuspect,
      };
    }

    const isClaude = score >= 55;
    const conf = isClaude ? +Math.min(0.995, 0.72 + Math.max(0, score - 55) * 0.0055).toFixed(4) : 0.50;
    return {
      ok: true,
      engine_version: ENGINE_VERSION,
      is_claude: isClaude,
      family: isClaude ? 'claude' : 'undetermined_insufficient_evidence',
      vendor: isClaude ? 'anthropic' : 'unknown',
      model_id: isClaude ? modelId : 'undetermined/need_svg32_or_live_sse',
      label: isClaude ? label : '待补测 (仅凭单轮静态空思考块不足以锁死Claude)',
      inferred_effort: isClaude ? effort : '',
      confidence: conf,
      score,
      matched_dims: matchedDims,
      veto_reasons: [],
      delegate_to_carbon: false,
      non_claude_suspect: '',
    };
  }

  function composeWithCarbon(sample, carbonClassifierFn) {
    const claudeVerdict = classifyClaudeSample(sample);
    if (claudeVerdict.is_claude) {
      claudeVerdict.pipeline_stage = 'claude_v5_positive';
      return claudeVerdict;
    }
    if (typeof carbonClassifierFn === 'function') {
      const carbonRes = carbonClassifierFn(sample);
      if (carbonRes && (carbonRes.is_true_carbon || carbonRes.is_carbon || carbonRes.isTrueCarbon || carbonRes.isCarbon || carbonRes.applicable || carbonRes.modelId)) {
        const stage = (carbonRes.is_true_carbon || carbonRes.isTrueCarbon) ? 'delegated_to_carbon_positive' : 'delegated_to_carbon_vendor';
        return Object.assign({}, carbonRes, {
          is_claude: false,
          claude_v5_vetoes: claudeVerdict.veto_reasons || [],
          pipeline_stage: stage,
        });
      }
    }
    claudeVerdict.pipeline_stage = 'claude_v5_negative';
    return claudeVerdict;
  }

  return {
    ENGINE_VERSION,
    extractFirstSvgOrHtml,
    extractWireAndProseDna,
    analyzeSvg32MicroPelican,
    analyzeFullPelicanSvgOrHtml,
    classifyClaudeSample,
    composeWithCarbon,
  };
});
