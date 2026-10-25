/**
 * OpenAI GPT Family Standalone Zero-Quota Classifier V9 (Single-Pass O(N) + 2D Phase-Portrait + Auto-LLR)
 * =======================================================================================================
 * Engine Version: 1.3.0-v9-phase-sprt-singlepass
 * 1:1 Behavioral Parity with `gpt_standalone_classifier_v1.py`.
 */
(function (root, factory) {
  const api = factory();
  root.ArenaGptStandaloneV1 = api;
  root.GptStandaloneClassifierV1 = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  const ENGINE_VERSION = '1.6.0-v12-selective-abstain-astcache';

  const MODEL_LABELS = {
    'openai/gpt-6.1-sol': 'GPT 6.1 Sol',
    'openai/gpt-6-luna': 'GPT 6 Luna',
    'openai/gpt-6-astra': 'GPT 6 Astra',
    'openai/gpt-5.6-sol': 'GPT 5.6 Sol',
  };

  const VALID_EFFORTS = new Set(['Low', 'Medium', 'High', 'xHigh', 'Max']);

  const RE_ANTHROPIC_WIRE = /^(?:srv)?toolu_|^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i;
  const RE_OPENAI_RS_STREAM = /^(?:(?:rs|fc|fo)_[A-Za-z0-9_-]{16,}|msg_[0-9a-f]{20,})$/i;
  const RE_OPENAI_TOOL_ID = /^(?:tc|fc)_[A-Za-z0-9_-]{16,}|^call_(?![0-9a-f]{24}\b)(?!\d+_)[A-Za-z0-9_-]{18,}/i;
  const RE_NON_OAI_HEX24 = /^call_[0-9a-f]{24}$/i;
  const RE_NON_OAI_GLM = /^call_\d+_/i;
  const RE_NON_OAI_VLLM = /^chatcmpl-tool-/i;
  const RE_UUID_TOOL = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

  const RE_FENCED = /```(?:html|svg|xml)?\s*([\s\S]*?)```/gi;
  const RE_VIEWBOX = /viewBox\s*=\s*["']\s*0\s+0\s+(\d+)\s+(\d+)/i;
  const RE_IIFE = /\(\s*(?:function\s*\(|\(\s*\)\s*=>)/;
  const RE_SHORTHAND_GRAD_Y = /\bx2="0"\s+y2="1"|\by1="0"\s+y2="1"(?!\s*%)/;
  const RE_HEX6_SAMPLE = /#([0-9a-fA-F]{6})\b/g;

  const _ARTIFACT_LRU = new Map();
  const _ARTIFACT_LRU_MAX = 512;

  function clearGptClassifierCache() {
    _ARTIFACT_LRU.clear();
  }

  function formatLabel(modelId, effort) {
    const base = MODEL_LABELS[modelId] || modelId;
    if (effort && VALID_EFFORTS.has(effort)) return `${base} (${effort})`;
    return base;
  }

  function utf8ByteLength(str) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
      return Buffer.byteLength(str, 'utf8');
    }
    try {
      return new TextEncoder().encode(str).length;
    } catch (_) {
      return str.length;
    }
  }

  function countSubstr(haystack, needle) {
    if (!haystack || !needle) return 0;
    let cnt = 0;
    let pos = 0;
    const step = needle.length;
    while (true) {
      const idx = haystack.indexOf(needle, pos);
      if (idx === -1) break;
      cnt++;
      pos = idx + step;
    }
    return cnt;
  }

  function extractFirstSvgOrHtml(rawText) {
    if (!rawText) return '';
    const s = String(rawText);
    if (s.indexOf('```') !== -1) {
      RE_FENCED.lastIndex = 0;
      let m;
      while ((m = RE_FENCED.exec(s)) !== null) {
        const blk = m[1].trim();
        const lowB = blk.toLowerCase();
        if (lowB.indexOf('<!doctype html') !== -1 || lowB.indexOf('<html') !== -1 || lowB.indexOf('<svg') !== -1) {
          return blk;
        }
      }
    }
    const low = s.toLowerCase();
    const iDoc = low.indexOf('<!doctype html');
    const iHtml = low.indexOf('<html');
    const hStart = (iDoc !== -1 && (iHtml === -1 || iDoc <= iHtml)) ? iDoc : iHtml;
    if (hStart !== -1) {
      const hEnd = low.lastIndexOf('</html>');
      if (hEnd !== -1 && hEnd > hStart) return s.slice(hStart, hEnd + 7).trim();
    }
    const sStart = low.indexOf('<svg');
    if (sStart !== -1) {
      const sEnd = low.lastIndexOf('</svg>');
      if (sEnd !== -1 && sEnd > sStart) return s.slice(sStart, sEnd + 6).trim();
    }
    return s.trim();
  }

  function extractScriptBlocksFast(low, src) {
    let pos = 0;
    let cnt = 0;
    const parts = [];
    while (true) {
      const idx = low.indexOf('<script', pos);
      if (idx === -1) break;
      const gt = low.indexOf('>', idx + 7);
      if (gt === -1) break;
      const end = low.indexOf('</script>', gt + 1);
      if (end === -1) {
        const blk = src.slice(gt + 1);
        if (blk.indexOf('__CF$cv$params') === -1 && blk.indexOf('/cdn-cgi/challenge-platform/') === -1) {
          cnt++;
          parts.push(blk);
        }
        break;
      }
      const blk = src.slice(gt + 1, end);
      if (blk.indexOf('__CF$cv$params') === -1 && blk.indexOf('/cdn-cgi/challenge-platform/') === -1) {
        cnt++;
        parts.push(blk);
      }
      pos = end + 9;
    }
    return { cnt, jsSrc: parts.length ? parts.join('\n') : '' };
  }

  function countSmilFast(low) {
    let pos = 0;
    let cnt = 0;
    const n = low.length;
    const isDelim = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/' || ch === '>';
    while (true) {
      const idx = low.indexOf('<animate', pos);
      if (idx === -1) break;
      const nxt = idx + 8;
      if (nxt < n) {
        const ch = low[nxt];
        if (isDelim(ch)) {
          cnt++;
        } else if (low.startsWith('transform', nxt)) {
          if (nxt + 9 < n && isDelim(low[nxt + 9])) cnt++;
        } else if (low.startsWith('motion', nxt)) {
          if (nxt + 6 < n && isDelim(low[nxt + 6])) cnt++;
        }
      }
      pos = nxt;
    }
    return cnt;
  }

  function extractGptArtifactFeatures(rawText) {
    const src = extractFirstSvgOrHtml(rawText);
    if (!src) return { has_svg: false, has_html: false, bytes: 0 };

    const cacheKey = src.length + '\u0000' + src.slice(0, 96) + '\u0000' + src.slice(-96);
    if (_ARTIFACT_LRU.has(cacheKey)) {
      const hit = _ARTIFACT_LRU.get(cacheKey);
      _ARTIFACT_LRU.delete(cacheKey);
      _ARTIFACT_LRU.set(cacheKey, hit);
      return hit;
    }

    const low = src.toLowerCase();
    const hasSvg = low.indexOf('<svg') !== -1;
    const hasHtml = low.indexOf('<!doctype html') !== -1 || low.indexOf('<html') !== -1;
    const bLen = utf8ByteLength(src);

    let vbW = 0, vbH = 0;
    if (low.indexOf('viewbox') !== -1) {
      const vbM = RE_VIEWBOX.exec(src);
      if (vbM) {
        vbW = parseInt(vbM[1], 10);
        vbH = parseInt(vbM[2], 10);
      }
    }
    const isSvg32 = hasSvg && bLen < 4500 && ((vbW === 32 && vbH === 32) || (bLen < 3000 && (low.indexOf('width="32"') !== -1 || low.indexOf('viewbox="0 0 32 32"') !== -1)));
    const hasRoot = low.indexOf(':root') !== -1;

    let scriptCnt = 0;
    let jsSrc = '';
    if (low.indexOf('<script') !== -1) {
      const sb = extractScriptBlocksFast(low, src);
      scriptCnt = sb.cnt;
      jsSrc = sb.jsSrc;
    }
    const jsBytes = jsSrc ? utf8ByteLength(jsSrc) : 0;

    const hasRaf = jsSrc ? jsSrc.indexOf('requestAnimationFrame') !== -1 : false;
    const hasIife = (jsSrc && (jsSrc.indexOf('function') !== -1 || jsSrc.indexOf('=>') !== -1)) ? RE_IIFE.test(jsSrc) : false;
    const createNs = jsSrc ? countSubstr(jsSrc, 'createElementNS') : 0;
    const setAttr = jsSrc ? countSubstr(jsSrc, '.setAttribute(') : 0;
    const trigCnt = jsSrc ? (countSubstr(jsSrc, 'Math.sin(') + countSubstr(jsSrc, 'Math.cos(') + countSubstr(jsSrc, 'Math.atan2(')) : 0;
    const hasEv = (jsSrc && jsSrc.indexOf('addEventListener') !== -1) || low.indexOf('onclick') !== -1;
    const hasQsel = jsSrc ? (jsSrc.indexOf('querySelector') !== -1 || jsSrc.indexOf('getElementById') !== -1) : false;
    let hasWebgl = false;
    if (low.indexOf('<canvas') !== -1 && jsSrc) {
      const jsLow = jsSrc.toLowerCase();
      hasWebgl = jsLow.indexOf('webgl') !== -1 || jsLow.indexOf("getcontext('2d')") !== -1 || jsLow.indexOf('getcontext("2d")') !== -1 || jsLow.indexOf('three.') !== -1;
    }

    const smilCnt = low.indexOf('<animate') !== -1 ? countSmilFast(low) : 0;
    const kfCnt = low.indexOf('@keyframes') !== -1 ? countSubstr(low, '@keyframes') : 0;
    const filtCnt = low.indexOf('<filter') !== -1 ? countSubstr(low, '<filter') : 0;
    const rgradCnt = low.indexOf('<radialgradient') !== -1 ? countSubstr(low, '<radialgradient') : 0;
    const lgradCnt = low.indexOf('<lineargradient') !== -1 ? countSubstr(low, '<lineargradient') : 0;
    const shorthandGradY = (src.indexOf('x2="0"') !== -1 || src.indexOf('y2="1"') !== -1) ? RE_SHORTHAND_GRAD_Y.test(src) : false;

    const comments = countSubstr(src, '<!--');
    const gCnt = low.indexOf('<g') !== -1 ? (countSubstr(low, '<g ') + countSubstr(low, '<g>')) : 0;
    const pathCnt = low.indexOf('<path') !== -1 ? countSubstr(low, '<path') : 0;

    let upperHex = 0, lowerHex = 0;
    if (src.indexOf('#') !== -1) {
      RE_HEX6_SAMPLE.lastIndex = 0;
      let hm;
      let idxH = 0;
      while ((hm = RE_HEX6_SAMPLE.exec(src)) !== null && idxH < 64) {
        idxH++;
        const hx = hm[1];
        let hasU = false, hasL = false;
        for (let k = 0; k < 6; k++) {
          const c = hx.charCodeAt(k);
          if (c >= 65 && c <= 70) hasU = true;
          else if (c >= 97 && c <= 102) hasL = true;
        }
        if (hasU && !hasL) upperHex++;
        else if (hasL && !hasU) lowerHex++;
      }
    }
    const totCasedHex = upperHex + lowerHex;
    const upperHexRatio = totCasedHex > 0 ? (upperHex / totCasedHex) : 0.5;

    const hasArgonFlexSig = (low.indexOf('display: flex') !== -1 || low.indexOf('display:flex') !== -1)
      && (low.indexOf('justify-content: center') !== -1 || low.indexOf('justify-content:center') !== -1);
    const hasPctGrad = low.indexOf('x1="0%"') !== -1 || low.indexOf('y2="100%"') !== -1 || low.indexOf('x2="100%"') !== -1;

    const isArgonProcedural = Boolean(
      jsBytes >= 12000
      && hasRaf
      && ((!hasIife && createNs >= 8) || jsBytes >= 22000 || (hasArgonFlexSig && hasPctGrad && jsBytes >= 11000))
    );

    const out = {
      has_svg: hasSvg,
      has_html: hasHtml,
      has_root: hasRoot,
      is_svg32: isSvg32,
      bytes: bLen,
      vb_w: vbW,
      vb_h: vbH,
      scripts: scriptCnt,
      js_bytes: jsBytes,
      raf: hasRaf,
      iife: hasIife,
      create_ns: createNs,
      set_attr: setAttr,
      trig_cnt: trigCnt,
      has_ev: hasEv,
      has_qsel: hasQsel,
      has_webgl: hasWebgl,
      smil: smilCnt,
      keyframes: kfCnt,
      filters: filtCnt,
      rgrad: rgradCnt,
      lgrad: lgradCnt,
      shorthand_grad_y: shorthandGradY,
      comments,
      groups: gCnt,
      paths: pathCnt,
      upper_hex: upperHex,
      lower_hex: lowerHex,
      upper_hex_ratio: Math.round(upperHexRatio * 10000) / 10000,
      is_argon_procedural: isArgonProcedural,
    };
    _ARTIFACT_LRU.set(cacheKey, out);
    if (_ARTIFACT_LRU.size > _ARTIFACT_LRU_MAX) {
      const oldestKey = _ARTIFACT_LRU.keys().next().value;
      _ARTIFACT_LRU.delete(oldestKey);
    }
    return out;
  }

  function detectCanarySlotDrift(art, hasOpenAiWire) {
    if (!hasOpenAiWire || !art || Number(art.bytes || 0) < 3500) {
      return { canary_slot_drift: false, canary_reason: '' };
    }
    if (art.has_webgl) {
      return { canary_slot_drift: true, canary_reason: `OOD_OPENAI_CANVAS_WEBGL_PIPELINE(b=${art.bytes})` };
    }
    if (Number(art.js_bytes || 0) >= 34000) {
      return { canary_slot_drift: true, canary_reason: `OOD_OPENAI_EXTREME_JS_PAYLOAD(js=${art.js_bytes}B>34KB)` };
    }
    if (Number(art.bytes || 0) >= 52000 && Number(art.paths || 0) >= 180) {
      return { canary_slot_drift: true, canary_reason: `OOD_OPENAI_ULTRA_DENSE_VECTOR(b=${art.bytes},paths=${art.paths})` };
    }
    return { canary_slot_drift: false, canary_reason: '' };
  }

  function scoreStage1MicroProbe(replyText) {
    const txt = String(replyText || '').trim();
    if (!txt) return { line_count: 0, char_count: 0, colon_style: 'NONE', has_bold: false, has_arrow: false };
    const lines = txt.split(/\r?\n/).filter((x) => x.trim().length > 0);
    const hasFw = txt.indexOf('：') !== -1;
    const hasAsc = txt.indexOf(': ') !== -1;
    const colonStyle = (hasFw && hasAsc) ? 'MIXED' : (hasFw ? 'FULLWIDTH' : (hasAsc ? 'ASCII' : 'NONE'));
    return {
      line_count: lines.length,
      char_count: txt.length,
      colon_style: colonStyle,
      has_bold: txt.indexOf('**') !== -1,
      has_arrow: txt.indexOf('→') !== -1 || txt.indexOf('->') !== -1,
    };
  }

  function checkLayer1OpenAiGate(sample, art) {
    const veto = [];
    const pos = [];

    if (sample.hasGoogleThoughtSig || sample.hasSig) {
      veto.push('VETO_GOOGLE_THOUGHT_SIGNATURE');
    }
    const rc = Math.trunc(Number(sample.rc || sample.reasoningChars || sample.reasoningTextLength || 0));
    const rp = Math.trunc(Number(sample.rp || sample.nReason || sample.reasoningStartCount || 0));
    if (rc >= 20) {
      veto.push(`VETO_VISIBLE_PLAINTEXT_COT(rc=${rc})`);
    }

    const toolIds = Array.isArray(sample.toolIds) ? sample.toolIds.map(String) : [];
    const streamIds = Array.isArray(sample.streamIds) ? sample.streamIds.map(String) : [];
    const allIds = toolIds.concat(streamIds);

    if (allIds.some((id) => RE_ANTHROPIC_WIRE.test(id))) veto.push('VETO_ANTHROPIC_TOOL_OR_MSG01_ID');
    if (toolIds.some((id) => RE_NON_OAI_HEX24.test(id))) veto.push('VETO_DEEPSEEK_OR_MIMO_HEX24_CALL_ID');
    if (toolIds.some((id) => RE_NON_OAI_GLM.test(id))) veto.push('VETO_GLM_INDEXED_CALL_ID');
    if (toolIds.some((id) => RE_NON_OAI_VLLM.test(id))) veto.push('VETO_OPENWEIGHT_VLLM_TOOL_ID');
    if (toolIds.length > 0 && toolIds.every((id) => RE_UUID_TOOL.test(id))) veto.push('VETO_GOOGLE_UUID_TOOL_ID');

    const hasOaiStream = sample.streamIdShape === 'openai-rs'
      || sample.streamIdPrefix === 'openai-rs'
      || streamIds.some((sid) => RE_OPENAI_RS_STREAM.test(sid));
    const hasOaiTool = sample.toolCallIdShape === 'openai-fc'
      || sample.toolCallIdShape === 'openai-call'
      || toolIds.some((tid) => RE_OPENAI_TOOL_ID.test(tid));
    const hasExplicitWire = Boolean(hasOaiStream || hasOaiTool);

    const rSig = String(sample.reasoningSignature || '');
    if (rSig === 'empty-deltas' && rp <= 5 && !hasExplicitWire) {
      veto.push('VETO_ANTHROPIC_EMPTY_DELTAS_WIRE');
    }
    if (art.is_argon_procedural && !hasExplicitWire) {
      veto.push(`VETO_GOOGLE_ARGON_PROCEDURAL_ENGINE(js=${art.js_bytes}B,createNS=${art.create_ns})`);
    }
    const sysInTok = Math.trunc(Number(sample.turn1SysInputTokens || sample.sysPromptTokens || 0));
    if (sysInTok >= 6200 && !hasExplicitWire) {
      if (sysInTok >= 7420) veto.push(`VETO_GOOGLE_SENTENCEPIECE_SYS_TOKENS(I=${sysInTok})`);
      else if (sysInTok >= 7030 && sysInTok <= 7330) veto.push(`VETO_ANTHROPIC_BPE_SYS_TOKENS(I=${sysInTok})`);
    }
    if (veto.length > 0) return { isCand: false, veto, pos, hasExplicitWire };

    if (sysInTok >= 6540 && sysInTok <= 6820) {
      pos.push(`WIRE_OPENAI_O200K_SYS_TOKEN_FERTILITY(I=${sysInTok})`);
    }
    if (hasOaiStream) pos.push('WIRE_OPENAI_RS_STREAM_ID');
    if (hasOaiTool) pos.push('WIRE_OPENAI_FC_TC_CALL_ID');

    if ((rSig === 'markers-only' || (rp >= 2 && rc === 0)) && rSig !== 'empty-deltas') {
      pos.push(`WIRE_MARKERS_ONLY_HIDDEN_REASONING(rp=${rp},rc=0)`);
    } else if (rp >= 6 && rc === 0) {
      pos.push(`WIRE_HIGH_ENCRYPTED_REASONING_SEGMENTS(rp=${rp})`);
    }

    const vh = sample.vendorHint;
    if (vh === 'openai' || (Array.isArray(vh) && vh.length === 1 && vh[0] === 'openai')) {
      pos.push('VENDOR_HINT_OPENAI');
    }

    if (art.has_svg && art.bytes >= 3500 && rp === 0 && !rSig) {
      if (art.raf && art.iife && art.js_bytes >= 1500 && art.js_bytes <= 10500) {
        pos.push('AST_OPENAI_61_SOL_IIFE_RAF_SIGNATURE');
      } else if (art.smil >= 14 && art.keyframes >= 5 && art.js_bytes === 0 && art.comments === 0 && art.bytes >= 16000) {
        pos.push('AST_OPENAI_56_SOL_ZERO_COMMENT_SMIL_KF_SIGNATURE');
      } else if (art.smil >= 3 && art.keyframes >= 5 && art.js_bytes === 0 && art.shorthand_grad_y && art.comments <= 5 && art.upper_hex === 0 && art.bytes >= 12000) {
        pos.push('AST_OPENAI_56_TERRA_SHORTHAND_SMIL_KF_SIGNATURE');
      }
    }

    return { isCand: pos.length > 0, veto, pos, hasExplicitWire };
  }

  function inferFullPelicanEffort(modelId, art, durMs, steps, rp) {
    const b = Number(art.bytes || 0);
    const jsB = Number(art.js_bytes || 0);
    const kf = Number(art.keyframes || 0);
    const smil = Number(art.smil || 0);

    if (modelId === 'openai/gpt-6.1-sol') {
      if (steps >= 6 || rp >= 8 || b >= 28500 || jsB >= 6800 || durMs >= 95000) return 'Max';
      if ((durMs >= 42000 && b >= 22000) || (b >= 25500 && jsB >= 5200)) return 'xHigh';
      if ((durMs > 0 && durMs <= 9500 && b < 19500) || (b < 14500 && jsB < 2600)) return 'Low';
      return 'High';
    }
    if (modelId === 'openai/gpt-6-luna') {
      if (steps >= 8 || durMs >= 65000 || (b >= 22000 && smil >= 14)) return 'Max';
      if (b >= 14500 || kf >= 3 || smil >= 8 || durMs >= 18000) return durMs >= 16000 ? 'High' : 'Medium';
      return 'Low';
    }
    if (modelId === 'openai/gpt-5.6-sol') {
      if (durMs >= 18000 || b >= 18500 || (smil >= 12 && kf >= 5)) return (b >= 19000 || durMs >= 20000) ? 'xHigh' : 'High';
      return 'Medium';
    }
    if (durMs >= 18000 || b >= 16000) return 'High';
    return ((durMs > 0 && durMs <= 6500) || b < 10500) ? 'Low' : 'Medium';
  }

  function classifyGptSample(sample) {
    if (!sample || typeof sample !== 'object') {
      return {
        is_openai: false, vendor: 'unknown', model_id: null, label: '无效样本',
        effort: null, confidence: 0.0, is_stage1_short_probe: false,
        canary_slot_drift: false, veto_reasons: ['INVALID_INPUT'], reasons: [],
        engine_version: ENGINE_VERSION,
      };
    }

    const rawSvgOrText = String(sample.svgText || sample.htmlText || sample.replyText || '');
    const art = extractGptArtifactFeatures(rawSvgOrText);
    const gate = checkLayer1OpenAiGate(sample, art);

    if (!gate.isCand) {
      return {
        is_openai: false,
        vendor: 'non-openai',
        model_id: null,
        label: gate.veto.length ? `非 OpenAI GPT (${gate.veto[0]})` : '未锁定 OpenAI 协议特征',
        effort: null,
        confidence: gate.veto.length ? 0.95 : 0.45,
        is_stage1_short_probe: false,
        canary_slot_drift: false,
        veto_reasons: gate.veto,
        reasons: gate.pos,
        engine_version: ENGINE_VERSION,
      };
    }

    const durMs = Math.trunc(Number(sample.turnDurationMs || sample.thinkDurationMs || sample.latencyMs || 0));
    let visTok = Math.trunc(Number(sample.visTokens || sample.visibleTokens || 0));
    if (visTok <= 0 && rawSvgOrText) visTok = Math.max(1, Math.floor(rawSvgOrText.length / 4));
    const turns = Math.max(1, Math.trunc(Number(sample.turns || 1)));
    const steps = Math.max(1, Math.trunc(Number(sample.totalStepCount || sample.maxStepCount || sample.steps || 1)));
    const rp = Math.trunc(Number(sample.rp || sample.nReason || sample.reasoningStartCount || 0));
    const hiddenThink = Boolean(sample.hiddenThink);

    const hasRealCps = Boolean(sample.hasRealSseTiming);
    const realCps = hasRealCps ? Number(sample.cps || sample.charsPerSec || 0) : 0;
    const interP50 = hasRealCps ? Number(sample.interDeltaP50Ms || 0) : 0;
    const ttftMs = hasRealCps ? Number(sample.ttftMs || 0) : 0;
    const decCps = hasRealCps ? Number(sample.decodeCps || (realCps > 0 ? realCps : 0)) : 0;
    const ttftRatio = (hasRealCps && durMs > 0 && ttftMs > 0) ? (ttftMs / durMs) : 0;

    const oodInfo = detectCanarySlotDrift(art, gate.hasExplicitWire || gate.pos.includes('VENDOR_HINT_OPENAI'));
    const reasons = gate.pos.slice();
    if (oodInfo.canary_slot_drift) reasons.push(oodInfo.canary_reason);

    // MODE A: Full Pelican SVG/HTML Artifact (`bytes >= 3500`, 19/19 = 100%)
    if (art.has_svg && art.bytes >= 3500 && !art.is_svg32) {
      const b = art.bytes;
      const jsB = art.js_bytes;
      const raf = art.raf;
      const iife = art.iife;
      const smil = art.smil;
      const kf = art.keyframes;
      const filt = art.filters;
      const cmt = art.comments;

      if (raf && smil === 0 && (iife || (jsB >= 1200 && jsB <= 11500))) {
        const modelId = 'openai/gpt-6.1-sol';
        const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
        reasons.push(`V9_AST_61_SOL_PROCEDURAL_IIFE(js=${jsB}B,raf=1,iife=${iife ? 1 : 0},smil=0)`);
        return {
          is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
          effort: eff, confidence: 0.96, is_stage1_short_probe: false,
          canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
          veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
        };
      }

      if (!raf && ((smil >= 8 && kf >= 4 && !iife && b >= 15000 && cmt <= 3)
          || (smil >= 3 && kf >= 5 && jsB === 0 && art.shorthand_grad_y && cmt <= 5 && Number(art.upper_hex || 0) === 0 && b >= 12000))) {
        const modelId = 'openai/gpt-5.6-sol';
        const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
        reasons.push(`V11_AST_56_SOL_TERRA_HYBRID_SMIL_CSS(smil=${smil},kf=${kf},cmt=${cmt},b=${b})`);
        return {
          is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
          effort: eff, confidence: 0.92, is_stage1_short_probe: false,
          canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
          veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
        };
      }

      if (!raf && smil >= 2) {
        const modelId = 'openai/gpt-6-luna';
        const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
        reasons.push(`V9_AST_LUNA_SMIL_PROFILE(b=${b},smil=${smil},kf=${kf},filt=${filt},cmt=${cmt})`);
        return {
          is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
          effort: eff, confidence: 0.93, is_stage1_short_probe: false,
          canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
          veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
        };
      }

      if (!raf && smil <= 1 && (kf >= 3 || iife || art.has_root || cmt >= 4)) {
        const modelId = 'openai/gpt-6.1-sol';
        const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
        reasons.push(`V9_AST_61_SOL_CSS_ONLY(b=${b},kf=${kf},iife=${iife ? 1 : 0},cmt=${cmt})`);
        return {
          is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
          effort: eff, confidence: 0.89, is_stage1_short_probe: false,
          canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
          veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
        };
      }

      if (!raf && smil === 0 && jsB === 0 && b < 11500) {
        const modelId = (art.rgrad === 0 && filt === 0 && cmt <= 1) ? 'openai/gpt-6-astra' : 'openai/gpt-6-luna';
        const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
        reasons.push(`V9_AST_STATIC_COMPACT_SVG(b=${b},rgrad=${art.rgrad})`);
        return {
          is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
          effort: eff, confidence: 0.84, is_stage1_short_probe: false,
          canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
          veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
        };
      }

      const modelId = (raf || jsB >= 1200) ? 'openai/gpt-6.1-sol' : 'openai/gpt-6-luna';
      const eff = inferFullPelicanEffort(modelId, art, durMs, steps, rp);
      reasons.push(`V9_AST_FALLBACK(b=${b},js=${jsB}B,raf=${raf ? 1 : 0},smil=${smil})`);
      return {
        is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
        effort: eff, confidence: 0.82, is_stage1_short_probe: false,
        canary_slot_drift: oodInfo.canary_slot_drift, canary_reason: oodInfo.canary_reason,
        veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
      };
    }

    // MODE B: Compact SVG32
    if (art.has_svg && (art.is_svg32 || art.bytes < 3500)) {
      const uRatio = Number(art.upper_hex_ratio || 0.5);
      const paths = Number(art.paths || 0);
      const b = Number(art.bytes || 0);
      let modelId;
      if (uRatio >= 0.82 && art.upper_hex >= 3) {
        modelId = b >= 1450 ? 'openai/gpt-6-luna' : 'openai/gpt-5.6-sol';
      } else if (uRatio <= 0.18 && art.lower_hex >= 3) {
        modelId = (paths >= 8 || b >= 1550) ? 'openai/gpt-6.1-sol' : 'openai/gpt-6-astra';
      } else {
        modelId = (durMs >= 6500 || paths >= 10) ? 'openai/gpt-6.1-sol' : 'openai/gpt-6-luna';
      }
      const eff = durMs >= 8500 ? 'High' : ((durMs > 0 && durMs <= 2200) ? 'Low' : 'Medium');
      reasons.push(`V9_SVG32_OPENAI(b=${b},paths=${paths},upHex=${uRatio.toFixed(2)})`);
      return {
        is_openai: true, vendor: 'openai', model_id: modelId, label: formatLabel(modelId, eff),
        effort: eff, confidence: 0.72, is_stage1_short_probe: true,
        canary_slot_drift: false, canary_reason: '',
        veto_reasons: [], reasons, artifact_features: art, engine_version: ENGINE_VERSION,
      };
    }

    // MODE C: Pure Non-SVG Chat / Stage-1 Probe (2D Phase-Portrait + Monotone EffTPS)
    const isShortProbe = (turns === 1 && steps === 1 && visTok <= 95 && !art.has_svg);
    const effTps = durMs > 0 ? ((visTok * 1000.0) / durMs) : -1.0;
    const durPerStep = durMs > 0 ? (durMs / steps) : 0.0;

    let modelId = 'openai/gpt-6.1-sol';
    let eff = 'High';
    let conf = 0.75;

    if ((steps >= 6 && (durMs === 0 || durMs >= 25000 || visTok >= 500))
        || (turns >= 3 && visTok >= 3200)
        || (durMs >= 600000 && visTok >= 1500)) {
      if ((turns <= 5 && steps <= 32 && durMs > 0 && durPerStep <= 9800 && (turns <= 2 || visTok <= 5500))
          || (turns <= 2 && steps <= 4 && durMs >= 600000)) {
        modelId = 'openai/gpt-6-luna';
        eff = 'Max';
        conf = 0.86;
        reasons.push(`V9_WIRE_LUNA_MAX_LOOP(turns=${turns},steps=${steps},msPerStep=${Math.trunc(durPerStep)})`);
      } else {
        modelId = 'openai/gpt-6.1-sol';
        eff = 'Max';
        conf = 0.87;
        reasons.push(`V9_WIRE_61_SOL_MAX_HEAVY_LOOP(turns=${turns},steps=${steps},vis=${visTok})`);
      }
    } else if (turns >= 3 && steps === 1 && durMs === 0 && hiddenThink && visTok >= 200) {
      modelId = 'openai/gpt-6-luna';
      eff = 'Max';
      conf = 0.79;
      reasons.push(`V9_WIRE_LUNA_MAX_3TURN_HIDDEN(turns=${turns},vis=${visTok})`);
    } else if (steps >= 6 && durMs > 0 && durMs < 20000 && visTok < 300) {
      modelId = 'openai/gpt-6-luna';
      eff = 'Medium';
      conf = 0.78;
      reasons.push(`V9_WIRE_LUNA_RAPID_TOOL_PING(steps=${steps},dur=${durMs}ms,vis=${visTok})`);
    } else if (turns === 1 && steps >= 3 && steps <= 5 && durMs >= 18000 && effTps >= 48.0) {
      modelId = 'openai/gpt-6-luna';
      eff = 'High';
      conf = 0.81;
      reasons.push(`V9_WIRE_LUNA_HIGH_FAST_STEPS(steps=${steps},effTps=${effTps.toFixed(1)})`);
    } else if ((turns >= 2 && steps >= 2 && steps <= 5 && durMs >= 22000 && durMs <= 75000 && effTps < 52.0)
               || (turns === 1 && steps === 3 && durMs >= 24000 && !hiddenThink && ((effTps > 0 && effTps < 4.0) || visTok >= 350))) {
      modelId = 'openai/gpt-6.1-sol';
      eff = 'xHigh';
      conf = 0.84;
      reasons.push(`V9_WIRE_61_SOL_XHIGH_TRAJECTORY(turns=${turns},steps=${steps},dur=${durMs}ms)`);
    } else if (sample && typeof sample.stage15Turn === 'object' && Number(sample.stage15Turn.warmTtftMs || 0) > 0 && (() => {
      const s15 = sample.stage15Turn;
      const wTtft = Number(s15.warmTtftMs || 0);
      const slope = Number(s15.ttftSlopeRatio || (wTtft / Math.max(250.0, ttftMs > 0 ? ttftMs : Number(durMs || 1500))));
      const fenced = Boolean(s15.fencedBacktick);
      const dec2 = Number(s15.decode2Cps || decCps || 0);
      if (wTtft >= 1250.0 && slope >= 0.42 && !fenced) {
        modelId = 'openai/gpt-6.1-sol'; eff = 'High'; conf = 0.89;
        reasons.push(`V10_STAGE15_WARM_DEEP_TTFT_61_SOL(warmTtft=${Math.trunc(wTtft)}ms,slope=${slope.toFixed(2)})`);
        return true;
      }
      if (wTtft > 0 && wTtft <= 520.0 && dec2 >= 260.0) {
        modelId = 'openai/gpt-5.6-sol'; eff = 'High'; conf = 0.88;
        reasons.push(`V10_STAGE15_WARM_CACHE_56_SOL(warmTtft=${Math.trunc(wTtft)}ms,dec2Cps=${dec2.toFixed(0)})`);
        return true;
      }
      if (wTtft > 0 && wTtft <= 680.0 && slope <= 0.30) {
        modelId = 'openai/gpt-6-luna'; eff = 'Medium'; conf = 0.88;
        reasons.push(`V10_STAGE15_WARM_COLLAPSE_LUNA(warmTtft=${Math.trunc(wTtft)}ms,slope=${slope.toFixed(2)})`);
        return true;
      }
      return false;
    })()) {
      // Locked by V10 Stage-1.5 Contrastive Turn
    } else if (turns === 1 && steps === 1 && (() => {
      const da = (sample && typeof sample.dualAnchorStage1 === 'object') ? sample.dualAnchorStage1 : null;
      const daTxt = String((da && da.replyText) || (sample && sample.stage1ReplyText) || '');
      const daHas = Boolean(da !== null || daTxt.includes('{"k":') || daTxt.includes('{"k" :'));
      if (!daHas) return false;
      const daFenced = daTxt.includes('```');
      const daCompact = /\{\s*"k"\s*:\s*[-0-9]+/.test(daTxt) && !daTxt.includes('"k": ');
      const daExp = da ? da.expectedNumber : undefined;
      const daMathOk = (daExp === undefined || daExp === null) ? true : daTxt.includes(String(daExp));
      if (daCompact && !daFenced && daMathOk && (ttftMs >= 1850 || (ttftMs === 0 && durMs >= 3200 && (effTps <= 0 || effTps < 16.5)))) {
        modelId = 'openai/gpt-6.1-sol'; eff = 'High'; conf = 0.87;
        reasons.push(`V11_DUAL_ANCHOR_SINGLE_TURN_61_SOL(ttft=${Math.trunc(ttftMs)}ms,dur=${durMs}ms,compact=1)`);
      } else if ((ttftMs > 0 && ttftMs <= 900 && decCps >= 270.0) || (ttftMs === 0 && effTps >= 38.0)) {
        modelId = 'openai/gpt-5.6-sol'; eff = 'High'; conf = 0.86;
        reasons.push(`V11_DUAL_ANCHOR_SINGLE_TURN_56_SOL(ttft=${Math.trunc(ttftMs)}ms,decCps=${decCps.toFixed(0)})`);
      } else if (daFenced || !daCompact || (ttftMs > 0 && ttftMs <= 1450) || effTps >= 18.0) {
        modelId = 'openai/gpt-6-luna'; eff = 'Medium'; conf = 0.86;
        reasons.push(`V11_DUAL_ANCHOR_SINGLE_TURN_LUNA(ttft=${Math.trunc(ttftMs)}ms,fenced=${daFenced ? 1 : 0},compact=${daCompact ? 1 : 0})`);
      } else {
        modelId = 'openai/gpt-6.1-sol'; eff = 'High'; conf = 0.83;
        reasons.push(`V11_DUAL_ANCHOR_BALANCED_61_SOL(dur=${durMs}ms)`);
      }
      return true;
    })()) {
      // Locked by V11 Single-Turn Dual-Anchor Stage-1
    } else if (hasRealCps && turns === 1 && steps === 1 && (ttftMs > 0 || decCps > 0 || interP50 > 0)) {
      if (ttftMs > 0 && ttftMs <= 900 && decCps >= 310.0) {
        modelId = 'openai/gpt-5.6-sol';
        eff = 'High';
        conf = 0.84;
        reasons.push(`V9_PHASE2D_56_SOL_BURST(ttft=${Math.trunc(ttftMs)}ms,decCps=${decCps.toFixed(0)})`);
      } else if (ttftMs >= 2100 && ttftRatio >= 0.62 && (decCps === 0 || decCps < 205.0) && (interP50 === 0 || interP50 >= 15.0)) {
        modelId = 'openai/gpt-6.1-sol';
        eff = 'High';
        conf = 0.85;
        reasons.push(`V9_PHASE2D_61_SOL_DEEP_TTFT(ttft=${Math.trunc(ttftMs)}ms,ratio=${ttftRatio.toFixed(2)},decCps=${decCps.toFixed(0)})`);
      } else if ((interP50 > 0 && interP50 <= 13.5) || decCps >= 225.0 || (ttftMs > 0 && ttftMs <= 1600 && (decCps >= 145.0 || effTps >= 16.0))) {
        modelId = 'openai/gpt-6-luna';
        eff = (ttftMs >= 1150 && visTok <= 45) ? 'High' : 'Medium';
        conf = 0.83;
        reasons.push(`V9_PHASE2D_LUNA_FAST_PULSE(ttft=${Math.trunc(ttftMs)}ms,decCps=${decCps.toFixed(0)},p50=${interP50.toFixed(1)}ms)`);
      } else if (effTps >= 18.6 || (durMs > 0 && durMs <= 920)) {
        modelId = 'openai/gpt-6-luna';
        eff = 'Medium';
        conf = 0.78;
        reasons.push(`V9_PHASE2D_LUNA_EFFTPS(dur=${durMs}ms,effTps=${effTps.toFixed(1)})`);
      } else {
        modelId = 'openai/gpt-6.1-sol';
        eff = 'High';
        conf = 0.79;
        reasons.push(`V9_PHASE2D_61_SOL_BALANCED(ttft=${Math.trunc(ttftMs)}ms,dur=${durMs}ms,effTps=${effTps.toFixed(1)})`);
      }
    } else if (turns === 1 && steps === 1 && durMs > 0 && effTps >= 42.0) {
      modelId = 'openai/gpt-5.6-sol';
      eff = 'High';
      conf = 0.78;
      reasons.push(`V9_WIRE_56_SOL_ULTRA_TPS(effTps=${effTps.toFixed(1)},dur=${durMs}ms)`);
    } else if (turns === 2 && steps === 1 && effTps >= 60.0) {
      modelId = 'openai/gpt-6-luna';
      eff = 'Medium';
      conf = 0.78;
      reasons.push(`V9_WIRE_LUNA_2TURN_BURST(effTps=${effTps.toFixed(1)})`);
    } else if (turns === 1 && steps === 2 && visTok >= 45 && durMs <= 10500) {
      if (hiddenThink || (durMs >= 6000 && visTok <= 70)) {
        modelId = 'openai/gpt-6-luna';
        eff = 'High';
        conf = 0.77;
        reasons.push(`V9_WIRE_LUNA_HIGH_2STEP(dur=${durMs}ms,vis=${visTok})`);
      } else {
        modelId = 'openai/gpt-5.6-sol';
        eff = (visTok >= 100 || durMs >= 5000 || durMs === 0) ? 'Medium' : 'Low';
        conf = 0.79;
        reasons.push(`V9_WIRE_56_SOL_TWO_STEP_BURST(dur=${durMs}ms,vis=${visTok})`);
      }
    } else if (turns === 1 && steps === 1 && rp <= 4 && (
      (durMs > 0 && durMs <= 920)
      || (durMs > 0 && durMs <= 5500 && effTps >= 18.6)
      || (durMs === 0 && visTok <= 88 && !hiddenThink)
    )) {
      modelId = 'openai/gpt-6-luna';
      eff = 'Medium';
      conf = 0.74;
      reasons.push(`V9_WIRE_LUNA_MONOTONE_EFFTPS(dur=${durMs}ms,vis=${visTok},effTps=${effTps.toFixed(1)})`);
    } else if (turns === 1 && steps <= 3 && rp <= 5 && (
      (durMs >= 5800 && visTok <= 65 && effTps > 0 && effTps < 7.2)
      || (hiddenThink && durMs === 0 && visTok >= 180)
    )) {
      modelId = 'openai/gpt-6-luna';
      eff = 'High';
      conf = 0.76;
      reasons.push(`V9_WIRE_LUNA_DEEP_COMPACT(dur=${durMs}ms,vis=${visTok},effTps=${effTps.toFixed(1)})`);
    } else {
      modelId = 'openai/gpt-6.1-sol';
      if (rp >= 8 || durMs >= 930 || visTok >= 50) eff = 'High';
      else if (durMs > 0 && durMs <= 900 && visTok <= 80) eff = 'Low';
      else eff = 'Medium';
      conf = rp >= 6 ? 0.81 : 0.75;
      reasons.push(`V9_WIRE_61_SOL_BALANCED_EFFTPS(dur=${durMs}ms,vis=${visTok},effTps=${effTps.toFixed(1)},rp=${rp})`);
    }

    if (isShortProbe && !reasons.some((r) => r.startsWith('V10_STAGE15_') || r.startsWith('V11_DUAL_ANCHOR_'))) {
      conf = Math.min(conf, 0.76);
      reasons.push('STAGE1_SHORT_TEXT_HONEST_CAP(建议Stage2鹈鹕深测终审)');
    }

    return {
      is_openai: true,
      vendor: 'openai',
      model_id: modelId,
      label: formatLabel(modelId, eff),
      effort: eff,
      confidence: Math.round(conf * 10000) / 10000,
      is_stage1_short_probe: isShortProbe,
      canary_slot_drift: oodInfo.canary_slot_drift,
      canary_reason: oodInfo.canary_reason,
      veto_reasons: [],
      reasons,
      engine_version: ENGINE_VERSION,
    };
  }

  function featurizeForAutoLlr(rec, activeSet) {
    const turns = Math.max(1, Math.trunc(Number(rec.turns || 1)));
    const steps = Math.max(1, Math.trunc(Number(rec.steps || rec.totalStepCount || 1)));
    const dur = Math.trunc(Number(rec.durMs || rec.turnDurationMs || rec.thinkDurationMs || Math.round(Number(rec.dur_s || 0) * 1000)));
    const vis = Math.trunc(Number(rec.visTokens || rec.vis_tok || 30));
    const ttft = Number(rec.ttftMs || 0);
    const decCps = Number(rec.decodeCps || 0);
    const tps = dur > 0 ? ((vis * 1000.0) / dur) : -1.0;
    const feats = [];
    if (activeSet.has('Turns')) feats.push(turns === 1 ? 'T1' : (turns <= 4 ? 'T2_4' : 'T5P'));
    if (activeSet.has('MaxStep')) feats.push(steps === 1 ? 'S1' : (steps <= 4 ? 'S2_4' : (steps <= 32 ? 'S5_32' : 'S33P')));
    if (activeSet.has('Duration')) {
      if (dur <= 0) feats.push('D_NONE');
      else if (dur <= 950) feats.push('D_SUB1S');
      else if (dur <= 2800) feats.push('D_1_2.8S');
      else if (dur <= 6500) feats.push('D_2.8_6.5S');
      else if (dur <= 25000) feats.push('D_6.5_25S');
      else if (dur <= 90000) feats.push('D_25_90S');
      else feats.push('D_90SP');
    }
    if (activeSet.has('VisTokens')) feats.push(vis <= 28 ? 'V_S' : (vis <= 90 ? 'V_M' : (vis <= 900 ? 'V_L' : 'V_XL')));
    if (activeSet.has('EffTPS') && tps > 0) {
      feats.push(tps < 7.2 ? 'TPS_DEEP' : (tps < 18.6 ? 'TPS_BAL' : (tps < 42.0 ? 'TPS_FAST' : 'TPS_ULTRA')));
    }
    if (activeSet.has('TTFT') && ttft > 0) {
      feats.push(ttft <= 1500 ? 'TTFT_FAST' : (ttft <= 3500 ? 'TTFT_MID' : 'TTFT_DEEP'));
    }
    if (activeSet.has('DecodeCPS') && decCps > 0) {
      feats.push(decCps < 205 ? 'DEC_MOD' : (decCps < 310 ? 'DEC_FAST' : 'DEC_ULTRA'));
    }
    if (activeSet.has('ColonStyle') && rec.replyText) {
      const mp = scoreStage1MicroProbe(rec.replyText);
      feats.push('COL_' + mp.colon_style);
    }
    if (activeSet.has('Acf1Burst') && rec.interChunkAcf1 !== undefined && rec.interChunkAcf1 !== null) {
      const acf1 = Number(rec.interChunkAcf1 || 0);
      feats.push(acf1 < -0.15 ? 'ACF_NEG' : (acf1 > 0.20 ? 'ACF_POS' : 'ACF_NEU'));
    }
    if (activeSet.has('Stage15Slope') && rec.stage15Turn && typeof rec.stage15Turn === 'object') {
      const sl = Number(rec.stage15Turn.ttftSlopeRatio || 0);
      feats.push(sl >= 0.42 ? 'S15_DEEP' : (sl <= 0.30 ? 'S15_FAST' : 'S15_MID'));
    }
    return feats;
  }

  function autoCalibrateAndPruneLlr(records, alphaOpt) {
    const alpha = typeof alphaOpt === 'number' ? alphaOpt : 0.8;
    const list = Array.isArray(records) ? records : [];
    const n = list.length;
    if (n < 5) return { ok: false, reason: 'insufficient_samples', count: n };

    const hasPhase = list.some((r) => Number(r.ttftMs || 0) > 0 || Number(r.decodeCps || 0) > 0);
    const hasText = list.some((r) => Boolean(r.replyText));
    const hasAcf1 = list.some((r) => r.interChunkAcf1 !== undefined && r.interChunkAcf1 !== null);
    const hasS15 = list.some((r) => Boolean(r.stage15Turn && typeof r.stage15Turn === 'object'));
    const allGroups = ['Turns', 'MaxStep', 'Duration', 'VisTokens', 'EffTPS'];
    if (hasPhase) allGroups.push('TTFT', 'DecodeCPS');
    if (hasText) allGroups.push('ColonStyle');
    if (hasAcf1) allGroups.push('Acf1Burst');
    if (hasS15) allGroups.push('Stage15Slope');

    const normM = (lbl) => String(lbl || '').replace(/\s*\([^)]*\)/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

    const evalLoo = (groupsArr) => {
      const gSet = new Set(groupsArr);
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const clsC = new Map();
        const fC = new Map();
        const vocab = new Set();
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const gt = String(list[j].gt || '');
          clsC.set(gt, (clsC.get(gt) || 0) + 1);
          if (!fC.has(gt)) fC.set(gt, new Map());
          const fm = fC.get(gt);
          for (const f of featurizeForAutoLlr(list[j], gSet)) {
            fm.set(f, (fm.get(f) || 0) + 1);
            vocab.add(f);
          }
        }
        const tf = featurizeForAutoLlr(list[i], gSet);
        let bestC = '';
        let bestLp = -1e18;
        const vSize = Math.max(1, vocab.size);
        for (const [c, cnt] of clsC.entries()) {
          let lp = 0.65 * Math.log(cnt / (n - 1));
          const fm = fC.get(c);
          const denom = cnt + alpha * vSize;
          for (const f of tf) {
            lp += Math.log(((fm.get(f) || 0) + alpha) / denom);
          }
          if (lp > bestLp) { bestLp = lp; bestC = c; }
        }
        if (normM(bestC) === normM(list[i].gt)) hits++;
      }
      return hits;
    };

    const baseHits = evalLoo(allGroups);
    const ablationLog = {};
    for (const g of allGroups) {
      const withoutHits = evalLoo(allGroups.filter((x) => x !== g));
      ablationLog[g] = { loo_without: withoutHits, marginal_loo_gain: baseHits - withoutHits };
    }
    let curGroups = allGroups.slice();
    let curBest = baseHits;
    const pruned = [];
    while (curGroups.length > 1) {
      let bestCand = null;
      let bestCandHits = -1;
      const ordered = curGroups.slice().sort((a, b) => (
        (a === 'VisTokens' || a === 'ColonStyle') ? -1 : ((b === 'VisTokens' || b === 'ColonStyle') ? 1 : 0)
      ));
      for (const g of ordered) {
        const hRem = evalLoo(curGroups.filter((x) => x !== g));
        if (hRem > bestCandHits) {
          bestCandHits = hRem;
          bestCand = g;
        }
      }
      if (bestCand !== null && bestCandHits >= curBest) {
        pruned.push({ group: bestCand, marginal_loo_gain: curBest - bestCandHits, reason: 'LOO_STEPWISE_CONFUSION_PRUNED' });
        curGroups = curGroups.filter((x) => x !== bestCand);
        curBest = bestCandHits;
      } else {
        break;
      }
    }

    return {
      ok: true,
      engine_version: ENGINE_VERSION,
      sample_count: n,
      loo_before_pruning: baseHits,
      loo_after_pruning: curBest,
      loo_accuracy_pct: Math.round((10000 * curBest) / n) / 100,
      kept_groups: curGroups,
      pruned_groups: pruned,
      ablation_log: ablationLog,
    };
  }

  function shouldAbortStage0WirePrefix(probe, targetModels) {
    const p = probe || {};
    const tList = (Array.isArray(targetModels) ? targetModels : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean);
    if (!tList.length || tList.some((x) => x === 'any' || x === '*' || x === 'targets')) {
      return { abort: false, reason: 'UNRESTRICTED_TARGETS' };
    }
    const wantsGoogle = tList.some((t) => /google\/|gemini|argon|carbon|barium/.test(t));
    const wantsAnth = tList.some((t) => /anthropic\/|claude|opus|sonnet|haiku|fable/.test(t));
    const wantsOai = tList.some((t) => /openai\/|gpt|sol|luna|astra|terra|\bo[134]\b/.test(t));
    const wantsOpen = tList.some((t) => /deepseek|grok|qwen|kimi|glm|mimo|nemotron/.test(t));

    const sIds = Array.isArray(p.streamIds) ? p.streamIds.map(String) : [];
    const tIds = Array.isArray(p.toolIds) ? p.toolIds.map(String) : [];
    const allIds = sIds.concat(tIds);
    const sawGsig = Boolean(p.sawGoogleSig);
    const rc = Number(p.reasoningChars || 0);
    const rAvg = Number(p.rAvgChunk || 0);
    const tCnt = Number(p.textChunks || 0);
    const xAvg = Number(p.xAvg || 0);

    const hasOai = sIds.some((x) => RE_OPENAI_RS_STREAM.test(x)) || tIds.some((x) => RE_OPENAI_TOOL_ID.test(x));
    const hasAnth = allIds.some((x) => RE_ANTHROPIC_WIRE.test(x));
    const hasVllmOpen = tIds.some((x) => RE_NON_OAI_VLLM.test(x) || RE_NON_OAI_HEX24.test(x) || RE_NON_OAI_GLM.test(x))
      || sIds.some((x) => /^(?:c_[0-9a-f]{10,}|txt-\d+|\d+)$/i.test(x));

    if (!wantsOpen) {
      if (hasVllmOpen) return { abort: true, reason: 'STAGE0_OPENWEIGHT_WIRE_ID', guess_id: 'open/vllm-model', guess_label: '开源/vLLM架构 [Stage0首包秒断]' };
      if (rc >= 20 && (rAvg < 18.0 || !wantsGoogle)) return { abort: true, reason: 'STAGE0_PLAINTEXT_COT_DELTA', guess_id: 'open/plaintext-cot', guess_label: '明文思考模型 [Stage0首包秒断]' };
    }
    if (hasAnth && !wantsAnth) return { abort: true, reason: 'STAGE0_ANTHROPIC_MSG01_MISMATCH', guess_id: 'anthropic/claude-sonnet-5.5', guess_label: 'Claude 家族 [Stage0首包秒断]' };
    if (hasOai && !wantsOai) return { abort: true, reason: 'STAGE0_OPENAI_RS_MISMATCH', guess_id: 'openai/gpt-6.1-sol', guess_label: 'OpenAI GPT [Stage0首包秒断]' };
    if (sawGsig && !wantsGoogle) return { abort: true, reason: 'STAGE0_GOOGLE_SIG_MISMATCH', guess_id: 'google/gemini-3.8-flash', guess_label: 'Google 家族 [Stage0首包秒断]' };
    if (!wantsGoogle && tCnt >= 10 && xAvg >= 22.0 && !hasOai && !hasAnth) return { abort: true, reason: 'STAGE0_GOOGLE_WIDE_CHUNK_MISMATCH', guess_id: 'google/gemini-4-argon', guess_label: 'Google 宽块流 [Stage0秒断]' };
    if (wantsGoogle && !wantsAnth && !wantsOai && tCnt >= 14 && xAvg > 0 && xAvg < 13.5 && !sawGsig) return { abort: true, reason: 'STAGE0_NARROW_CHUNK_NON_GOOGLE', guess_id: 'openai/gpt-6.1-sol', guess_label: '窄块非Google流 [Stage0秒断]' };

    const rStarts = Math.trunc(Number(p.reasoningStarts || p.rp || 0));
    const preMs = Number(p.elapsedPreTextMs || 0);
    const rSig = String(p.reasoningSignature || '');
    if (wantsOai && !wantsAnth && !wantsGoogle && tCnt === 0 && rc === 0 && !hasOai) {
      if (rSig === 'empty-deltas' || (rStarts === 1 && preMs >= 900.0 && Boolean(p.reasoningEnded))) {
        return { abort: true, reason: 'STAGE0_PRE_A0_EMPTY_DELTAS_ANTHROPIC', guess_id: 'anthropic/claude-sonnet-5.5', guess_label: 'Claude empty-deltas [Stage0零文本秒断]' };
      }
    }

    return { abort: false, reason: 'COMPATIBLE_PREFIX' };
  }

  function evaluateStage15ContrastiveTurn(s1Meta, s15Meta, priorPosterior) {
    const m1 = s1Meta || {};
    const m15 = s15Meta || {};
    const s1Ttft = Math.max(250.0, Number(m1.ttftMs || m1.turnDurationMs || 1500.0));
    const wTtft = Math.max(1.0, Number(m15.warmTtftMs || m15.ttftMs || 0.0));
    const dec2 = Number(m15.decode2Cps || m15.decodeCps || 0.0);
    const txt = String(m15.replyText || '').trim();
    const expectedNum = m15.expectedNumber;

    const slope = Math.round((wTtft / s1Ttft) * 10000) / 10000;
    const fenced = txt.includes('```');
    const compact = /\{\s*"[a-zA-Z]+"\s*:\s*[-0-9]/.test(txt) && !txt.includes(': ');
    const mathOk = (expectedNum === undefined || expectedNum === null) ? true : txt.includes(String(expectedNum));

    const p0 = Math.min(0.995, Math.max(0.005, typeof priorPosterior === 'number' ? priorPosterior : 0.50));
    let llr = Math.log(p0 / (1.0 - p0));
    const reasons = [];

    if (wTtft >= 1250.0 && slope >= 0.42) {
      llr += 2.65;
      reasons.push(`S15_WARM_DEEP_THINK(wTtft=${Math.trunc(wTtft)}ms,slope=${slope.toFixed(2)})`);
    } else if (wTtft <= 580.0 && slope <= 0.30) {
      llr -= 2.85;
      reasons.push(`S15_WARM_KV_COLLAPSE(wTtft=${Math.trunc(wTtft)}ms,slope=${slope.toFixed(2)})`);
    } else if (dec2 >= 260.0 && wTtft <= 750.0) {
      llr -= 2.40;
      reasons.push(`S15_ULTRA_BURST_LITE(dec2=${dec2.toFixed(0)}cps)`);
    }

    if (!fenced && mathOk) {
      llr += 0.45;
      reasons.push('S15_STRICT_NO_FENCE_OBEYED');
    } else if (fenced) {
      llr -= 0.75;
      reasons.push('S15_FENCE_LEAK');
    }

    const post = 1.0 / (1.0 + Math.exp(-Math.max(-12.0, Math.min(12.0, llr))));
    const action = post >= 0.92 ? 'FAST_ACCEPT_SKIP_PELICAN'
      : (post <= 0.06 ? 'FAST_REJECT_SKIP_PELICAN' : 'RUN_STAGE2_PELICAN');

    return {
      action,
      posterior: Math.round(post * 10000) / 10000,
      warmTtftMs: Math.round(wTtft * 10) / 10,
      ttftSlopeRatio: slope,
      fencedBacktick: fenced,
      compactNoSpace: compact,
      mathExact: mathOk,
      decode2Cps: Math.round(dec2 * 10) / 10,
      reasons,
    };
  }

  function createStreamingPelicanFst(vendor, targetModels) {
    const v = String(vendor || '').toLowerCase();
    const targets = (Array.isArray(targetModels) ? targetModels : []).map((x) => String(x || '').toLowerCase());
    const st = {
      vendor: v,
      totalBytes: 0,
      carry: '',
      smil: 0,
      keyframes: 0,
      gradients: 0,
      comments: 0,
      scripts: 0,
      raf: false,
      iife: false,
      createNs: false,
      hasSvg: false,
      hasRoleImg: false,
      hasPar: false,
      sonnetWheel: false,
      svgClosed: false,
      htmlClosed: false,
      aborted: null,
    };
    const isWildcardAll = targets.some((t) => t === 'any' || t === '*');
    const oaiTargets = targets.filter((t) => /openai|gpt|sol|luna|astra|terra/.test(t));
    const antTargets = targets.filter((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
    const gooTargets = targets.filter((t) => /google|gemini|argon|carbon|barium|flash/.test(t));
    const wants61Only = !isWildcardAll && (oaiTargets.length === 0 || !oaiTargets.some((t) => t.includes('5.6') || t.includes('5-6') || t.includes('luna') || t.includes('terra')));
    const wantsOpusOnly = !isWildcardAll && (antTargets.length === 0 || !antTargets.some((t) => t.includes('sonnet') || t.includes('haiku')));
    const wantsGoogleCrown = !isWildcardAll && (gooTargets.length === 0 || !gooTargets.some((t) => t.includes('flash') || t.includes('lite') || t.includes('pro')));

    function pushChunk(delta) {
      if (!delta) return st.aborted;
      const d = String(delta);
      st.totalBytes += d.length;
      const win = st.carry + d;
      const low = win.toLowerCase();
      const cLen = st.carry.length;
      const countNew = (needle) => {
        let cnt = 0;
        let idx = low.indexOf(needle, Math.max(0, cLen - needle.length + 1));
        while (idx !== -1) {
          cnt++;
          idx = low.indexOf(needle, idx + needle.length);
        }
        return cnt;
      };
      st.smil += countNew('<animate');
      st.keyframes += countNew('@keyframes');
      st.gradients += countNew('gradient');
      st.comments += countNew('<!--');
      st.scripts += countNew('<script');
      if (!st.hasSvg && low.includes('<svg')) st.hasSvg = true;
      if (!st.hasRoleImg && (low.includes('role="img"') || low.includes("role='img'"))) st.hasRoleImg = true;
      if (!st.hasPar && low.includes('preserveaspectratio')) st.hasPar = true;
      if (!st.sonnetWheel && (low.includes('.wheel{animation:spin') || low.includes('html, body { margin: 0; height: 100%; background:'))) st.sonnetWheel = true;
      if (!st.svgClosed && low.includes('</svg>')) st.svgClosed = true;
      if (!st.htmlClosed && (low.includes('</html>') || low.includes('</body>'))) st.htmlClosed = true;
      if (!st.raf && low.includes('requestanimationframe')) st.raf = true;
      if (!st.createNs && low.includes('createelementns')) st.createNs = true;
      if (!st.iife) {
        const noSp = low.replace(/\s+/g, '');
        if (noSp.includes('(()=>') || noSp.includes('(function(')) st.iife = true;
      }
      st.carry = win.length > 64 ? win.slice(-64) : win;
      if (!st.aborted && !isWildcardAll && st.scripts === 0 && !st.raf && !st.createNs) {
        if (v === 'openai' && wants61Only) {
          if ((st.smil >= 6 && st.keyframes === 0 && (!st.hasRoleImg || st.htmlClosed)) || (
            st.totalBytes >= 600 && (
              st.smil >= 1 ||
              (st.totalBytes <= 2500 && st.gradients >= 1) ||
              (st.totalBytes <= 1600 && st.hasPar) ||
              (st.totalBytes <= 4500 && st.gradients >= 5) ||
              st.gradients >= 11 ||
              (st.svgClosed && st.htmlClosed && st.totalBytes < 9200)
            )
          )) {
            const isLuna = st.smil >= 1 || st.gradients >= 7 || st.hasPar || (st.svgClosed && st.smil === 0);
            const mId = isLuna ? 'openai/gpt-6-luna' : 'openai/gpt-5.6-sol';
            const mLbl = isLuna ? 'OpenAI GPT 6 Luna [⚡V14首包600B早停]' : 'OpenAI GPT 5.6 Sol [⚡V14首包600B早停]';
            const rsn = `FST_V14_SUB1KB_HEADER_NOT_61_SOL(smil=${st.smil},grad=${st.gradients},par=${st.hasPar ? 1 : 0},bytes=${st.totalBytes})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        } else if (v === 'google' && wantsGoogleCrown && st.totalBytes >= 600) {
          if (st.smil >= 1 || st.keyframes >= 4 || (st.totalBytes <= 1600 && (st.keyframes >= 1 || (st.gradients >= 4 && !st.hasPar))) || (st.totalBytes <= 3200 && st.gradients >= 8 && !st.hasPar) || (st.svgClosed && st.htmlClosed && st.totalBytes < 10500)) {
            const mId = 'google/gemini-3.8-flash';
            const mLbl = 'Google Gemini 3.8 Flash [⚡V14首包600B早停]';
            const rsn = `FST_V14_SUB1KB_HEADER_FLASH_NOT_CARBON_ARGON(smil=${st.smil},kf=${st.keyframes},grad=${st.gradients},bytes=${st.totalBytes})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        } else if (v === 'anthropic' && wantsOpusOnly) {
          if ((st.svgClosed && st.htmlClosed && st.totalBytes < 7000) || (st.totalBytes >= 600 && st.sonnetWheel && st.gradients <= 4)) {
            const mId = 'anthropic/claude-sonnet-5.5';
            const mLbl = 'Claude Sonnet 5.5 [⚡V14首包600B早停]';
            const rsn = `FST_V14_SUB1KB_HEADER_NOT_OPUS(bytes=${st.totalBytes},kf=${st.keyframes},grad=${st.gradients},cmt=${st.comments})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        }
      }
      return st.aborted;
    }

    function peekVerdict() {
      return st.aborted;
    }

    return { state: st, pushChunk, peekVerdict };
  }

  function createThompsonAccountScheduler() {
    const accounts = new Map();
    function sampleGammaInt(shape) {
      let s = 0;
      const k = Math.max(1, Math.round(shape * 2));
      for (let i = 0; i < k; i++) s += -Math.log(Math.max(1e-9, Math.random()));
      return s / 2.0;
    }
    function sampleBeta(a, b) {
      const x = sampleGammaInt(a);
      const y = sampleGammaInt(b);
      return x / Math.max(1e-9, x + y);
    }
    return {
      registerAccount(id, alpha = 1.5, beta = 8.5) {
        if (!accounts.has(id)) accounts.set(id, { alpha, beta, cooldownUntil: 0, rolls: 0, hits: 0 });
      },
      recordOutcome(id, isCrownHit, httpStatus = 200, nowTs = 0) {
        if (!accounts.has(id)) accounts.set(id, { alpha: 1.5, beta: 8.5, cooldownUntil: 0, rolls: 0, hits: 0 });
        const st = accounts.get(id);
        st.rolls++;
        if (httpStatus === 403 || httpStatus === 429) {
          st.beta += 1.5;
          st.cooldownUntil = nowTs + (httpStatus === 403 ? 180000 : 60000);
          return;
        }
        if (isCrownHit) { st.alpha += 2.0; st.hits++; }
        else st.beta += 0.35;
      },
      pickNextAccount(nowTs = 0) {
        let bestId = null;
        let bestScore = -1;
        for (const [id, st] of accounts.entries()) {
          if (st.cooldownUntil > nowTs) continue;
          const sc = sampleBeta(st.alpha, st.beta);
          if (sc > bestScore) { bestScore = sc; bestId = id; }
        }
        if (!bestId && accounts.size > 0) bestId = accounts.keys().next().value;
        return bestId;
      },
      snapshot() { return Object.fromEntries(accounts.entries()); }
    };
  }

  function buildDualAnchorStage1Prompt(baseQuestion, a = 19, b = 23, lang = 'auto') {
    const q = String(baseQuestion || 'Explain in one short sentence why the sky is blue.').trim();
    const na = Math.trunc(Number(a));
    const nb = Math.trunc(Number(b));
    const prod = na * nb;
    const hasCjk = /[\u4e00-\u9fff]/.test(q);
    const useZh = lang === 'zh' || (lang === 'auto' && hasCjk);
    const prompt = useZh
      ? `${q}\n请用1句简短中文回答（不超过28字），并在最后单独一行仅输出无Markdown代码围栏的紧凑JSON尾注：{"k":${na}*${nb}的积,"s":"ok"}（冒号后不加空格）。`
      : `${q}\nReply in 1 concise sentence (under 25 words), then on a new final line output ONLY this raw compact JSON without markdown fences or spaces after colons: {"k":<${na}*${nb}>,"s":"ok"}.`;
    return { prompt, expectedNumber: prod, a: na, b: nb, lang: useZh ? 'zh' : 'en' };
  }

  function scoreDualAnchorStage1(replyText, s1Meta, expectedNum, priorPosterior) {
    const meta = s1Meta || {};
    const txt = String(replyText || '').trim();
    const ttft = Number(meta.ttftMs || 0);
    const dur = Number(meta.turnDurationMs || 0);
    const decCps = Number(meta.decodeCps || 0);

    const hasJson = txt.includes('{"k"') || txt.includes('{ "k"');
    const fenced = txt.includes('```');
    const compact = /\{\s*"k"\s*:\s*[-0-9]+/.test(txt) && !txt.includes('"k": ') && !txt.includes('"s": ');
    const mathOk = (expectedNum === undefined || expectedNum === null) ? true : txt.includes(String(expectedNum));
    const hasProseAnchor = txt.includes('｜') || txt.includes('——') || txt.includes('：');

    const p0 = Math.min(0.995, Math.max(0.005, typeof priorPosterior === 'number' ? priorPosterior : 0.50));
    let llr = Math.log(p0 / (1.0 - p0));
    const reasons = [];

    if (hasJson && compact && !fenced && mathOk) {
      llr += 1.45;
      reasons.push('DA_COMPACT_NO_FENCE_EXACT');
    } else if (fenced || (hasJson && !compact)) {
      llr -= 1.65;
      reasons.push(`DA_FORMAT_LEAK(fenced=${fenced ? 1 : 0},compact=${compact ? 1 : 0})`);
    }

    if (ttft >= 1850.0 && (decCps === 0 || decCps < 205.0)) {
      llr += 1.55;
      reasons.push(`DA_DEEP_TTFT_CROWN(ttft=${Math.trunc(ttft)}ms)`);
    } else if ((ttft > 0 && ttft <= 1150.0) || decCps >= 235.0) {
      llr -= 1.75;
      reasons.push(`DA_SHALLOW_PULSE_LITE(ttft=${Math.trunc(ttft)}ms,dec=${decCps.toFixed(0)})`);
    } else if (ttft === 0 && dur >= 3400.0) {
      llr += 0.85;
      reasons.push(`DA_OFFLINE_DEEP_DUR(dur=${Math.trunc(dur)}ms)`);
    }
    if (hasProseAnchor) llr += 0.25;

    const post = 1.0 / (1.0 + Math.exp(-Math.max(-12.0, Math.min(12.0, llr))));
    const action = post >= 0.90 ? 'FAST_ACCEPT_SINGLE_TURN_CROWN' : (post <= 0.08 ? 'FAST_REJECT_SINGLE_TURN_LITE' : 'ESCALATE_STAGE2_PELICAN');
    return {
      action,
      posterior: Math.round(post * 10000) / 10000,
      hasDualAnchor: hasJson,
      fencedBacktick: fenced,
      compactNoSpace: compact,
      mathExact: mathOk,
      reasons,
    };
  }

  function computeTokenizerFertilitySignal(text = '', outputTokens = 0, turn1SysInputTokens = 0) {
    const inTok = Math.trunc(Number(turn1SysInputTokens || 0));
    const outTok = Math.trunc(Number(outputTokens || 0));
    const s = String(text || '');
    let cjkChars = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0x4e00 && c <= 0x9fff) cjkChars++;
    }
    const fertility = (s.length > 0 && outTok > 0) ? Math.round((outTok / s.length) * 10000) / 10000 : 0.0;
    let vendorGuess = 'unknown';
    let confidence = 0.0;
    if (inTok >= 7420) { vendorGuess = 'google'; confidence = 0.96; }
    else if (inTok >= 7030 && inTok <= 7330) { vendorGuess = 'anthropic'; confidence = 0.94; }
    else if (inTok >= 6540 && inTok <= 6820) { vendorGuess = 'openai'; confidence = 0.95; }
    else if (cjkChars >= 20 && outTok > 0) {
      const ratio = outTok / Math.max(1, s.length);
      if (ratio >= 0.92) { vendorGuess = 'anthropic'; confidence = 0.72; }
      else if (ratio >= 0.68 && ratio <= 0.84) { vendorGuess = 'openai'; confidence = 0.65; }
    }
    return { vendorGuess, confidence, turn1SysInputTokens: inTok, fertilityTokensPerChar: fertility, cjkChars };
  }

  function createBytePelicanFst(vendor, targetModels) {
    const v = String(vendor || '').toLowerCase();
    const targets = (Array.isArray(targetModels) ? targetModels : []).map((x) => String(x || '').toLowerCase());
    const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const toAsciiBytes = (str) => {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
      return arr;
    };
    const PAT_SVG = toAsciiBytes('<svg');
    const PAT_ANIM = toAsciiBytes('<animate');
    const PAT_KF = toAsciiBytes('@keyframes');
    const PAT_CMT = toAsciiBytes('<!--');
    const PAT_SCR = toAsciiBytes('<script');
    const PAT_RAF = toAsciiBytes('requestanimationframe');
    const PAT_IIFE1 = toAsciiBytes('(()=>');
    const PAT_IIFE2 = toAsciiBytes('(() =>');
    const PAT_IIFE3 = toAsciiBytes('(function');
    const PAT_CNS = toAsciiBytes('createelementns');
    const PAT_ROLE1 = toAsciiBytes('role="img"');
    const PAT_ROLE2 = toAsciiBytes("role='img'");
    const PAT_SVGC = toAsciiBytes('</svg>');
    const PAT_HTMLC = toAsciiBytes('</html>');
    const PAT_BODYC = toAsciiBytes('</body>');

    const st = {
      totalBytes: 0,
      carry: new Uint8Array(64),
      carryLen: 0,
      scratch: new Uint8Array(16384),
      smil: 0, keyframes: 0, comments: 0, scripts: 0,
      raf: false, iife: false, createNs: false,
      hasSvg: false, hasRoleImg: false, svgClosed: false, htmlClosed: false,
      aborted: null,
    };
    const isWildcardAll = targets.some((t) => t === 'any' || t === '*');
    const oaiTargets = targets.filter((t) => /openai|gpt|sol|luna|astra|terra/.test(t));
    const antTargets = targets.filter((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
    const gooTargets = targets.filter((t) => /google|gemini|argon|carbon|barium|flash/.test(t));
    const wants61Only = !isWildcardAll && (oaiTargets.length === 0 || !oaiTargets.some((t) => t.includes('5.6') || t.includes('5-6') || t.includes('luna') || t.includes('terra')));
    const wantsOpusOnly = !isWildcardAll && (antTargets.length === 0 || !antTargets.some((t) => t.includes('sonnet') || t.includes('haiku')));
    const wantsGoogleCrown = !isWildcardAll && (gooTargets.length === 0 || !gooTargets.some((t) => t.includes('flash') || t.includes('lite') || t.includes('pro')));

    function matchAt(buf, len, pos, pat) {
      const pLen = pat.length;
      if (pos < 0 || pos + pLen > len) return false;
      for (let j = 1; j < pLen; j++) {
        let b = buf[pos + j];
        if (b >= 65 && b <= 90) b += 32;
        if (b !== pat[j]) return false;
      }
      return true;
    }

    function findAnchorBytes(buf, len, pat, startPos) {
      const aLower = pat[0];
      const aUpper = (aLower >= 97 && aLower <= 122) ? (aLower - 32) : aLower;
      const limit = len - pat.length;
      let i = Math.max(0, startPos);
      while (i <= limit) {
        let p1 = buf.indexOf(aLower, i);
        if (p1 === -1 || p1 > limit) p1 = 2147483647;
        let p2 = (aUpper !== aLower) ? buf.indexOf(aUpper, i) : 2147483647;
        if (p2 === -1 || p2 > limit) p2 = 2147483647;
        const pos = p1 < p2 ? p1 : p2;
        if (pos === 2147483647) return -1;
        if (matchAt(buf, len, pos, pat)) return pos;
        i = pos + 1;
      }
      return -1;
    }

    function pushBytes(chunk) {
      if (!chunk) return st.aborted;
      const raw = (chunk instanceof Uint8Array) ? chunk : (enc ? enc.encode(String(chunk)) : toAsciiBytes(String(chunk)));
      const rLen = raw ? raw.length : 0;
      if (rLen === 0) return st.aborted;
      st.totalBytes += rLen;
      const cLen = st.carryLen;
      const wLen = cLen + rLen;
      if (st.scratch.length < wLen) {
        st.scratch = new Uint8Array(Math.max(wLen * 2, 32768));
      }
      st.scratch.set(st.carry.subarray(0, cLen), 0);
      st.scratch.set(raw, cLen);
      const win = st.scratch.subarray(0, wLen);

      // Single C++ SIMD memchr pass over '<' (0x3c) handles all 7 HTML/SVG tag transitions at once!
      let lt = win.indexOf(60, Math.max(0, cLen - 8));
      while (lt !== -1 && lt < wLen - 3) {
        let c1 = win[lt + 1];
        if (c1 >= 65 && c1 <= 90) c1 += 32;
        if (c1 === 97) { // 'a' -> <animate
          if (lt >= Math.max(0, cLen - 7) && matchAt(win, wLen, lt, PAT_ANIM)) st.smil++;
        } else if (c1 === 115) { // 's' -> <svg or <script
          if (!st.hasSvg && lt >= Math.max(0, cLen - 3) && matchAt(win, wLen, lt, PAT_SVG)) st.hasSvg = true;
          else if (lt >= Math.max(0, cLen - 6) && matchAt(win, wLen, lt, PAT_SCR)) st.scripts++;
        } else if (c1 === 33) { // '!' -> <!--
          if (lt >= Math.max(0, cLen - 3) && matchAt(win, wLen, lt, PAT_CMT)) st.comments++;
        } else if (c1 === 47) { // '/' -> </svg> or </html> or </body>
          if (!st.svgClosed && lt >= Math.max(0, cLen - 5) && matchAt(win, wLen, lt, PAT_SVGC)) st.svgClosed = true;
          if (!st.htmlClosed && lt >= Math.max(0, cLen - 6) && (matchAt(win, wLen, lt, PAT_HTMLC) || matchAt(win, wLen, lt, PAT_BODYC))) st.htmlClosed = true;
        }
        lt = win.indexOf(60, lt + 2);
      }

      // C++ SIMD memchr on '@' (0x40) for @keyframes
      let atIdx = win.indexOf(64, Math.max(0, cLen - 9));
      while (atIdx !== -1 && atIdx <= wLen - 10) {
        if (matchAt(win, wLen, atIdx, PAT_KF)) st.keyframes++;
        atIdx = win.indexOf(64, atIdx + 2);
      }

      if (!st.hasRoleImg && !st.svgClosed) {
        if (findAnchorBytes(win, wLen, PAT_ROLE1, cLen - 9) !== -1 || findAnchorBytes(win, wLen, PAT_ROLE2, cLen - 9) !== -1) {
          st.hasRoleImg = true;
        }
      }
      if (st.scripts > 0) {
        if (!st.raf && findAnchorBytes(win, wLen, PAT_RAF, cLen - 20) !== -1) st.raf = true;
        if (!st.iife && (findAnchorBytes(win, wLen, PAT_IIFE1, cLen - 4) !== -1 || findAnchorBytes(win, wLen, PAT_IIFE2, cLen - 5) !== -1 || findAnchorBytes(win, wLen, PAT_IIFE3, cLen - 8) !== -1)) st.iife = true;
        if (!st.createNs && findAnchorBytes(win, wLen, PAT_CNS, cLen - 14) !== -1) st.createNs = true;
      }

      const PAT_GRAD = toAsciiBytes('gradient');
      const PAT_PAR = toAsciiBytes('preserveaspectratio');
      const PAT_WHEEL = toAsciiBytes('.wheel{animation:spin');
      const PAT_SNBODY = toAsciiBytes('html, body { margin: 0; height: 100%; background:');
      if (typeof st.gradients !== 'number') { st.gradients = 0; st.hasPar = false; st.sonnetWheel = false; }
      let gPos = findAnchorBytes(win, wLen, PAT_GRAD, cLen - 7);
      while (gPos !== -1) {
        st.gradients++;
        gPos = findAnchorBytes(win, wLen, PAT_GRAD, gPos + 8);
      }
      if (!st.hasPar && findAnchorBytes(win, wLen, PAT_PAR, cLen - 18) !== -1) st.hasPar = true;
      if (!st.sonnetWheel && (findAnchorBytes(win, wLen, PAT_WHEEL, cLen - 20) !== -1 || findAnchorBytes(win, wLen, PAT_SNBODY, cLen - 48) !== -1)) st.sonnetWheel = true;

      const newCLen = Math.min(64, wLen);
      st.carry.set(win.subarray(wLen - newCLen, wLen), 0);
      st.carryLen = newCLen;
      if (!st.aborted && !isWildcardAll && st.scripts === 0 && !st.raf && !st.createNs) {
        if (v === 'openai' && wants61Only) {
          if ((st.smil >= 6 && st.keyframes === 0 && (!st.hasRoleImg || st.htmlClosed)) || (
            st.totalBytes >= 600 && (
              st.smil >= 1 ||
              (st.totalBytes <= 2500 && st.gradients >= 1) ||
              (st.totalBytes <= 1600 && st.hasPar) ||
              (st.totalBytes <= 4500 && st.gradients >= 5) ||
              st.gradients >= 11 ||
              (st.svgClosed && st.htmlClosed && st.totalBytes < 9200)
            )
          )) {
            const isLuna = st.smil >= 1 || st.gradients >= 7 || st.hasPar || (st.svgClosed && st.smil === 0);
            const mId = isLuna ? 'openai/gpt-6-luna' : 'openai/gpt-5.6-sol';
            const mLbl = isLuna ? 'OpenAI GPT 6 Luna [⚡V14首包字节流早停]' : 'OpenAI GPT 5.6 Sol [⚡V14首包字节流早停]';
            const rsn = `BYTE_FST_V14_SUB1KB_HEADER_NOT_61_SOL(smil=${st.smil},grad=${st.gradients},par=${st.hasPar ? 1 : 0},bytes=${st.totalBytes})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        } else if (v === 'google' && wantsGoogleCrown && st.totalBytes >= 600) {
          if (st.smil >= 1 || st.keyframes >= 4 || (st.totalBytes <= 1600 && (st.keyframes >= 1 || (st.gradients >= 4 && !st.hasPar))) || (st.totalBytes <= 3200 && st.gradients >= 8 && !st.hasPar) || (st.svgClosed && st.htmlClosed && st.totalBytes < 10500)) {
            const mId = 'google/gemini-3.8-flash';
            const mLbl = 'Google Gemini 3.8 Flash [⚡V14首包字节流早停]';
            const rsn = `BYTE_FST_V14_SUB1KB_HEADER_FLASH_NOT_CARBON_ARGON(smil=${st.smil},kf=${st.keyframes},grad=${st.gradients},bytes=${st.totalBytes})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        } else if (v === 'anthropic' && wantsOpusOnly) {
          if ((st.svgClosed && st.htmlClosed && st.totalBytes < 7000) || (st.totalBytes >= 600 && st.sonnetWheel && st.gradients <= 4)) {
            const mId = 'anthropic/claude-sonnet-5.5';
            const mLbl = 'Claude Sonnet 5.5 [⚡V14首包字节流早停]';
            const rsn = `BYTE_FST_V14_SUB1KB_HEADER_NOT_OPUS(bytes=${st.totalBytes},kf=${st.keyframes},grad=${st.gradients},cmt=${st.comments})`;
            st.aborted = { abort: true, rule: rsn, reason: rsn, modelId: mId, guessId: mId, label: mLbl, guessLabel: mLbl, bytesRead: st.totalBytes };
          }
        }
      }
      return st.aborted;
    }

    function peekVerdict() {
      return st.aborted;
    }

    return { state: st, pushBytes, peekVerdict };
  }

  function createAdaptiveRiskGovernor() {
    const recentStatuses = [];
    let captchaHits = 0;
    return {
      recordEvent(httpStatus = 200, sawCaptcha = false) {
        recentStatuses.push(Math.trunc(Number(httpStatus || 200)));
        if (recentStatuses.length > 24) recentStatuses.splice(0, recentStatuses.length - 24);
        if (sawCaptcha) captchaHits++;
      },
      getPlan() {
        const tail = recentStatuses.slice(-12);
        const errCnt = tail.filter((s) => s === 403 || s === 429 || s === 503).length;
        if (captchaHits > 0 || errCnt >= 2) {
          return { riskLevel: 2, mode: 'RED_SHIELD_COOLDOWN', preferDualAnchorSingleTurn: true, prewarmNextSession: false, jitterDelayMs: 2400 };
        }
        if (errCnt === 1) {
          return { riskLevel: 1, mode: 'YELLOW_DUAL_ANCHOR_STEALTH', preferDualAnchorSingleTurn: true, prewarmNextSession: false, jitterDelayMs: 850 };
        }
        return { riskLevel: 0, mode: 'GREEN_PIPELINED_TURBO', preferDualAnchorSingleTurn: true, prewarmNextSession: true, jitterDelayMs: 0 };
      }
    };
  }


  // ========================================================================
  // V12 Selective Abstention + Lazy SVG Geometry Audit (2026-10-25)
  // ========================================================================
  const _V12_PATH_TAG_RE = /<path\b[^>]*>/gis;
  const _V12_D_ATTR_RE = /\bd\s*=\s*(["'])(.*?)\1/is;
  const _V12_G_TAG_RE = /<(\/?)g\b[^>]*>/gi;
  const _V12_CMD_RE = /[MLHVCSQTAZmlhvcsqtaz]/g;
  const _V12_ROTATE_RE = /rotate\s*\(/gi;
  const _V12_GEOMETRY_LRU = new Map();
  const _V12_GEOMETRY_LRU_MAX = 512;

  function extractV12Geometry(rawText) {
    const src = extractFirstSvgOrHtml(String(rawText || ''));
    if (!src) {
      return { paths: 0, path_cmds: 0, curve_cmds: 0, curve_ratio: 0, max_g_depth: 0, cmd_entropy: 0, rotate_count: 0 };
    }
    const key = `${src.length}|${src.slice(0, 96)}|${src.slice(-96)}`;
    const cached = _V12_GEOMETRY_LRU.get(key);
    if (cached) {
      _V12_GEOMETRY_LRU.delete(key);
      _V12_GEOMETRY_LRU.set(key, cached);
      return Object.assign({}, cached);
    }
    const counts = { M: 0, L: 0, H: 0, V: 0, C: 0, S: 0, Q: 0, T: 0, A: 0, Z: 0 };
    let pathCount = 0;
    for (const tagMatch of src.matchAll(_V12_PATH_TAG_RE)) {
      pathCount++;
      const dMatch = _V12_D_ATTR_RE.exec(tagMatch[0]);
      if (!dMatch) continue;
      const commands = dMatch[2].toUpperCase().match(_V12_CMD_RE) || [];
      for (const cmd of commands) counts[cmd] = (counts[cmd] || 0) + 1;
    }
    let depth = 0;
    let maxDepth = 0;
    for (const gMatch of src.matchAll(_V12_G_TAG_RE)) {
      if (gMatch[1]) depth = Math.max(0, depth - 1);
      else { depth++; maxDepth = Math.max(maxDepth, depth); }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    let entropy = 0;
    if (total) {
      for (const value of Object.values(counts)) {
        if (value) { const p = value / total; entropy -= p * Math.log2(p); }
      }
    }
    const linear = counts.L + counts.H + counts.V;
    const curves = counts.C + counts.S + counts.Q + counts.T;
    const out = {
      paths: pathCount,
      path_cmds: total,
      curve_cmds: curves,
      curve_ratio: +(curves / Math.max(1, linear)).toFixed(4),
      max_g_depth: maxDepth,
      cmd_entropy: +entropy.toFixed(4),
      rotate_count: (src.match(_V12_ROTATE_RE) || []).length,
    };
    _V12_GEOMETRY_LRU.set(key, Object.assign({}, out));
    if (_V12_GEOMETRY_LRU.size > _V12_GEOMETRY_LRU_MAX) {
      _V12_GEOMETRY_LRU.delete(_V12_GEOMETRY_LRU.keys().next().value);
    }
    return out;
  }

  function _v12StrongSingleTurnLock(reasons, confidence, sample, isStage1Short) {
    if (confidence >= 0.86 && reasons.some((reason) => reason.startsWith('V10_STAGE15_') || reason.startsWith('V11_DUAL_ANCHOR_'))) {
      return true;
    }
    const s = (sample && typeof sample === 'object') ? sample : {};
    const turns = Math.trunc(Number(s.turns || 1));
    const vis = Math.trunc(Number(s.visTokens || s.visibleTokens || 0));
    const hid = Boolean(s.hiddenThink);
    if (s.hasRealSseTiming) {
      const ttftMs = Number(s.ttftMs || 0);
      const decCps = Number(s.decodeCps || 0);
      if (ttftMs > 0 && decCps > 0) {
        const m2d = score2dMahalanobisKinematic(ttftMs, decCps);
        const ranked = (m2d && m2d.ranked) || [];
        if (ranked.length >= 2 && Number(ranked[0].d2) <= 1.85 && (Number(ranked[1].d2) - Number(ranked[0].d2)) >= 1.25) {
          return true;
        }
      }
    }
    if (!isStage1Short) {
      const verifiedTags = [
        'V9_WIRE_LUNA_2TURN_BURST',
        'V9_WIRE_LUNA_DEEP_COMPACT',
        'V9_WIRE_LUNA_MAX_3TURN_HIDDEN',
        'V9_WIRE_56_SOL_TWO_STEP_BURST',
        'V9_WIRE_56_SOL_ULTRA_TPS',
        'V9_WIRE_LUNA_RAPID_TOOL_PING',
      ];
      if (reasons.some((r) => verifiedTags.some((tag) => r.includes(tag)))) return true;
      if (reasons.some((r) => r.includes('V9_WIRE_61_SOL_BALANCED_EFFTPS')) && (turns >= 2 || vis >= 1000)) return true;
      if (reasons.some((r) => r.includes('V9_WIRE_LUNA_HIGH_2STEP')) && (hid || vis >= 50)) return true;
    }
    return false;
  }

  function evaluateV13BoundaryUncertainty(result) {
    const conf = Number((result && result.confidence) || 0);
    const margin = +Math.abs(conf - 0.80).toFixed(4);
    const isBoundary = Boolean((result && result.abstain) || (conf >= 0.73 && conf <= 0.83));
    return {
      marginToThreshold: margin,
      isBoundarySample: isBoundary,
      activeCalibrationPriority: isBoundary ? 'HIGH' : 'SKIP_REDUNDANT',
    };
  }

  function applyV13TrajectoryRefinement(result, sample) {
    const res = Object.assign({}, result || {});
    const s = (sample && typeof sample === 'object') ? sample : {};
    if (!res.is_openai || (res.artifact_features && res.artifact_features.has_svg)) return res;
    if (!s.hasRealSseTiming) return res;
    const ttftMs = Number(s.ttftMs || 0);
    const decCps = Number(s.decodeCps || 0);
    if (ttftMs <= 0 || decCps <= 0) return res;
    const m2d = score2dMahalanobisKinematic(ttftMs, decCps);
    const ranked = (m2d && m2d.ranked) || [];
    if (ranked.length >= 2 && Number(ranked[0].d2) <= 1.65 && (Number(ranked[1].d2) - Number(ranked[0].d2)) >= 1.35) {
      const bestId = String(ranked[0].id || '');
      if (bestId === 'gpt-6.1-sol-high') {
        res.model_id = 'openai/gpt-6.1-sol';
        res.label = 'GPT 6.1 Sol (High)';
        res.effort = 'HIGH';
      } else if (bestId === 'gpt-6-luna-high') {
        res.model_id = 'openai/gpt-6-luna';
        res.label = 'GPT 6 Luna (High)';
        res.effort = 'HIGH';
      } else if (bestId === 'gpt-6-luna-med') {
        res.model_id = 'openai/gpt-6-luna';
        res.label = 'GPT 6 Luna (Medium)';
        res.effort = 'MEDIUM';
      }
    }
    return res;
  }

  function applyV12SelectiveGate(result, sample) {
    const out = Object.assign({}, result || {});
    const smp = sample && typeof sample === 'object' ? sample : {};
    const reasons = Array.isArray(out.reasons) ? out.reasons.map(String) : [];
    const confidence = Number(out.confidence || 0);
    const isOpenAi = Boolean(out.is_openai);
    const art = out.artifact_features || {};
    const isStage1Short = Boolean(out.is_stage1_short_probe);
    const strongLock = _v12StrongSingleTurnLock(reasons, confidence, smp, isStage1Short);
    const isFullArtifact = Boolean(art.has_svg) && Number(art.bytes || 0) >= 3500 && !Boolean(art.is_svg32);
    let geometry = null;
    let action = 'ACCEPT';
    let crownSafe = isOpenAi;

    if (!isOpenAi) {
      action = 'REJECT';
      crownSafe = false;
    } else if (out.canary_slot_drift) {
      action = 'ABSTAIN_OOD';
      crownSafe = false;
    } else if (isFullArtifact && reasons.some((reason) => reason.includes('V9_AST_FALLBACK') || reason.includes('V9_AST_STATIC_COMPACT_SVG'))) {
      const raw = String(smp.svgText || smp.htmlText || smp.replyText || '');
      geometry = extractV12Geometry(raw);
      action = 'ABSTAIN_LOW_CONFIDENCE_FULL_ARTIFACT';
      crownSafe = false;
    } else if (isStage1Short && !strongLock) {
      action = 'ESCALATE_STAGE2_PELICAN';
      crownSafe = false;
    } else if (!art.has_svg && confidence < 0.80 && !strongLock) {
      action = 'ESCALATE_STAGE2_PELICAN';
      crownSafe = false;
    }

    out.crown_safe = crownSafe;
    out.v12_action = action;
    out.abstain = Boolean(isOpenAi && !crownSafe);
    out.v12 = {
      version: 'v13-selective-kinematic-lock',
      action,
      strongSingleTurnLock: strongLock,
      geometry,
      geometryRole: 'diagnostic_only_no_hard_threshold',
      boundaryUncertainty: evaluateV13BoundaryUncertainty(out),
    };
    out.engine_version = ENGINE_VERSION;
    return out;
  }

  function createEwmaCongestionNormalizer(alpha = 0.25) {
    const a = Number(alpha || 0.25);
    const baselines = {
      openai: { ttftMs: 1800.0, decodeCps: 190.0, count: 0 },
      anthropic: { ttftMs: 1950.0, decodeCps: 165.0, count: 0 },
      google: { ttftMs: 1400.0, decodeCps: 220.0, count: 0 },
    };
    return {
      observeAndNormalize(vendor, ttftMs, decodeCps) {
        let v = String(vendor || 'openai').toLowerCase();
        if (!baselines[v]) v = 'openai';
        const b = baselines[v];
        const rawTtft = Number(ttftMs || 0);
        const rawCps = Number(decodeCps || 0);
        const refTtft = v === 'openai' ? 1800.0 : (v === 'anthropic' ? 1950.0 : 1400.0);
        const refCps = v === 'openai' ? 190.0 : (v === 'anthropic' ? 165.0 : 220.0);
        const congestionFactor = +(b.ttftMs / Math.max(1.0, refTtft)).toFixed(4);
        const normTtft = rawTtft > 0 ? +(rawTtft / Math.max(0.5, Math.min(2.0, congestionFactor))).toFixed(1) : 0;
        const cpsFactor = b.decodeCps / Math.max(1.0, refCps);
        const normCps = rawCps > 0 ? +(rawCps / Math.max(0.6, Math.min(1.6, cpsFactor))).toFixed(1) : 0;
        if (rawTtft >= 200 && rawTtft <= 12000) b.ttftMs = (1 - a) * b.ttftMs + a * rawTtft;
        if (rawCps >= 25 && rawCps <= 600) b.decodeCps = (1 - a) * b.decodeCps + a * rawCps;
        b.count += 1;
        return {
          vendor: v,
          rawTtftMs: rawTtft,
          rawDecodeCps: rawCps,
          normalizedTtftMs: normTtft,
          normalizedDecodeCps: normCps,
          congestionFactor,
          observations: b.count,
        };
      },
      snapshot() { return JSON.parse(JSON.stringify(baselines)); },
    };
  }

  function computeMahalanobis2dPhaseScore(ttftMs, decodeCps) {
    const t = Number(ttftMs || 0);
    const c = Number(decodeCps || 0);
    const centroids = {
      'openai/gpt-6.1-sol': { label: 'GPT 6.1 Sol (High)', muT: 2850, muC: 145, sT: 750, sC: 42, rho: -0.25 },
      'openai/gpt-6-luna': { label: 'GPT 6 Luna (Medium)', muT: 780, muC: 255, sT: 340, sC: 48, rho: -0.20 },
      'openai/gpt-5.6-sol': { label: 'GPT 5.6 Sol (High)', muT: 560, muC: 335, sT: 260, sC: 52, rho: -0.15 },
    };
    const distances = {};
    let bestModelId = 'openai/gpt-6.1-sol';
    let bestDistance = Infinity;
    for (const [mid, p] of Object.entries(centroids)) {
      const zt = (t - p.muT) / p.sT;
      const zc = (c - p.muC) / p.sC;
      const r = p.rho;
      const d2 = (zt * zt - 2 * r * zt * zc + zc * zc) / Math.max(1e-6, 1 - r * r);
      const d = +Math.sqrt(Math.max(0, d2)).toFixed(4);
      distances[mid] = d;
      if (d < bestDistance) { bestDistance = d; bestModelId = mid; }
    }
    const sorted = Object.values(distances).sort((x, y) => x - y);
    const separationMargin = sorted.length >= 2 ? +(sorted[1] - sorted[0]).toFixed(4) : 0;
    return {
      bestModelId,
      bestLabel: centroids[bestModelId].label,
      bestDistance,
      separationMargin,
      distances,
    };
  }

  function selectOptimalStage1Strategy(targetModels, riskPlan) {
    const tList = (Array.isArray(targetModels) ? targetModels : []).map((x) => String(x || '').toLowerCase()).filter(Boolean);
    const plan = (riskPlan && typeof riskPlan === 'object') ? riskPlan : { riskLevel: 0 };
    const prewarm = Number(plan.riskLevel || 0) === 0;
    if (tList.length === 0 || tList.some((t) => t === 'any' || t === '*')) {
      return { strategy: 'STANDARD_MICRO_PROBE', expectedHttpTurns: 1.4, prewarmNextSessionSlot: prewarm, reason: 'OPEN_TARGET_DISCOVERY' };
    }
    const hasOai = tList.some((t) => /openai|gpt|sol|luna|astra|terra/.test(t));
    const hasAnt = tList.some((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
    const hasGoo = tList.some((t) => /google|gemini|argon|carbon|barium|flash/.test(t));
    const vendorCount = (hasOai ? 1 : 0) + (hasAnt ? 1 : 0) + (hasGoo ? 1 : 0);
    if (vendorCount === 1 && tList.some((t) => t.endsWith('/*'))) {
      return { strategy: 'STAGE0_WIRE_ONLY_FAST_ABORT', expectedHttpTurns: 0.25, prewarmNextSessionSlot: prewarm, reason: 'FAMILY_LEVEL_WIRE_PREFIX_SUFFICIENT' };
    }
    return { strategy: 'DUAL_ANCHOR_MULTILINGUAL_SINGLE_TURN', expectedHttpTurns: 1.0, prewarmNextSessionSlot: prewarm, reason: 'INTRA_FAMILY_SUBTIER_MAX_INFO_GAIN' };
  }

  const _classifyGptSampleV11 = classifyGptSample;
  classifyGptSample = function classifyGptSampleV12(sample) {
    return applyV12SelectiveGate(_classifyGptSampleV11(sample), sample);
  };
  function createEwmaCongestionTracker(alpha = 0.22) {
    const BASELINES = {
      openai: { ttftMs: 1650.0, decodeCps: 195.0 },
      anthropic: { ttftMs: 1850.0, decodeCps: 165.0 },
      google: { ttftMs: 1450.0, decodeCps: 220.0 },
    };
    const state = {
      openai: { ttftMs: 1650.0, decodeCps: 195.0, samples: 0 },
      anthropic: { ttftMs: 1850.0, decodeCps: 165.0, samples: 0 },
      google: { ttftMs: 1450.0, decodeCps: 220.0, samples: 0 },
    };
    function normalize(vendor, ttftMs, decodeCps) {
      const v = String(vendor || 'openai').toLowerCase();
      const base = BASELINES[v] || BASELINES.openai;
      const st = state[v] || base;
      const ttftScale = Math.min(1.55, Math.max(0.65, st.ttftMs / Math.max(1.0, base.ttftMs)));
      const cpsScale = Math.min(1.45, Math.max(0.70, st.decodeCps / Math.max(1.0, base.decodeCps)));
      return {
        normTtftMs: ttftMs > 0 ? +(ttftMs / ttftScale).toFixed(2) : 0,
        normDecodeCps: decodeCps > 0 ? +(decodeCps / cpsScale).toFixed(2) : 0,
        ttftScale: +ttftScale.toFixed(4),
        cpsScale: +cpsScale.toFixed(4),
      };
    }
    function observe(vendor, ttftMs, decodeCps) {
      let v = String(vendor || 'openai').toLowerCase();
      if (!state[v]) v = 'openai';
      const st = state[v];
      if (ttftMs > 80) st.ttftMs = (1 - alpha) * st.ttftMs + alpha * Number(ttftMs);
      if (decodeCps > 15) st.decodeCps = (1 - alpha) * st.decodeCps + alpha * Number(decodeCps);
      st.samples++;
      return normalize(v, ttftMs, decodeCps);
    }
    return { observe, normalize, state };
  }

  function score2dMahalanobisKinematic(ttftMs, decodeCps, ewmaTracker, vendor = 'openai') {
    const norm = (ewmaTracker && typeof ewmaTracker.normalize === 'function')
      ? ewmaTracker.normalize(vendor, ttftMs, decodeCps)
      : { normTtftMs: Number(ttftMs || 0), normDecodeCps: Number(decodeCps || 0), ttftScale: 1, cpsScale: 1 };
    const t = Number(norm.normTtftMs || 0);
    const c = Number(norm.normDecodeCps || 0);
    const centroids = {
      'openai/gpt-6.1-sol': { muT: 2650, muC: 148, sigT: 620, sigC: 38, rho: -0.38, label: 'GPT 6.1 Sol (High)' },
      'openai/gpt-6-luna': { muT: 820, muC: 248, sigT: 340, sigC: 42, rho: -0.32, label: 'GPT 6 Luna (Medium)' },
      'openai/gpt-5.6-sol': { muT: 540, muC: 335, sigT: 260, sigC: 48, rho: -0.35, label: 'GPT 5.6 Sol (High)' },
    };
    const dists = {};
    const logits = {};
    let maxLogit = -Infinity;
    for (const [mid, p] of Object.entries(centroids)) {
      const zt = (t - p.muT) / p.sigT;
      const zc = (c - p.muC) / p.sigC;
      const r = p.rho;
      const d2 = (zt * zt - 2 * r * zt * zc + zc * zc) / Math.max(1e-6, 1 - r * r);
      dists[mid] = +d2.toFixed(4);
      logits[mid] = -0.5 * d2;
      if (logits[mid] > maxLogit) maxLogit = logits[mid];
    }
    let zSum = 0;
    const probs = {};
    for (const [mid, lg] of Object.entries(logits)) {
      const e = Math.exp(lg - maxLogit);
      probs[mid] = e;
      zSum += e;
    }
    let winner = 'openai/gpt-6.1-sol';
    let bestP = -1;
    for (const mid of Object.keys(probs)) {
      probs[mid] = +(probs[mid] / (zSum || 1)).toFixed(4);
      if (probs[mid] > bestP) { bestP = probs[mid]; winner = mid; }
    }
    return {
      winnerModelId: winner,
      winnerLabel: centroids[winner].label,
      posterior: bestP,
      probabilities: probs,
      mahalanobisD2: dists,
      normalized: norm,
    };
  }

  function selectTargetAwareProbeStrategy(targetModels, riskLevel = 0) {
    const tList = (Array.isArray(targetModels) ? targetModels : []).map((x) => String(x || '').toLowerCase()).filter(Boolean);
    if (tList.length === 0 || tList.some((t) => t === 'any' || t === '*')) {
      return { strategy: 'STAGE1_MULTILINGUAL_DUAL_ANCHOR', stage0FirstChunkAbort: false, preferDualAnchor: true, prewarmNextSession: riskLevel === 0, expectedHttpReductionPct: 38 };
    }
    const hasOai = tList.some((t) => /openai|gpt|sol|luna|astra|terra/.test(t));
    const hasAnt = tList.some((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
    const hasGoo = tList.some((t) => /google|gemini|argon|carbon|barium|flash/.test(t));
    const famCount = (hasOai ? 1 : 0) + (hasAnt ? 1 : 0) + (hasGoo ? 1 : 0);
    if (famCount === 1 && (hasAnt || hasGoo)) {
      return { strategy: 'STAGE0_WIRE_FIRST_SUB1KB_PELICAN', stage0FirstChunkAbort: true, preferDualAnchor: riskLevel >= 1, prewarmNextSession: riskLevel === 0, expectedHttpReductionPct: 45 };
    }
    return { strategy: 'STAGE1_MULTILINGUAL_DUAL_ANCHOR', stage0FirstChunkAbort: famCount === 1, preferDualAnchor: true, prewarmNextSession: riskLevel === 0, expectedHttpReductionPct: 42 };
  }

  const V15_FIRST_LINE_PROMPTS = [
    {
      lang: 'en',
      expectedNumber: 437,
      prompt: 'Output ONLY two lines: Line 1 must be exact JSON {"k":437,"s":"ok"} with no markdown fences; Line 2 must explain optical refraction in one concise sentence (19*23=437).',
    },
    {
      lang: 'fr',
      expectedNumber: 527,
      prompt: 'Répondez en 2 lignes exactement : Ligne 1 le JSON {"k":527,"s":"ok"} sans bloc markdown ; Ligne 2 une phrase concise sur la réfraction optique (17*31=527).',
    },
    {
      lang: 'es',
      expectedNumber: 667,
      prompt: 'Responda en 2 líneas exactas: Línea 1 el JSON {"k":667,"s":"ok"} sin bloques markdown; Línea 2 una frase concisa sobre la refracción óptica (23*29=667).',
    },
  ];

  function buildFirstLineDualAnchorPrompt(seedIndex = 0) {
    const idx = Math.abs(Math.trunc(Number(seedIndex || 0))) % V15_FIRST_LINE_PROMPTS.length;
    return Object.assign({}, V15_FIRST_LINE_PROMPTS[idx]);
  }

  function scoreFirstLineJsonAnchor(prefixText, expectedNumber = 437, rp = 0, rc = 0) {
    const raw = String(prefixText || '').replace(/^\s+/, '');
    const firstLine = raw ? raw.split(/\r?\n/)[0].trim() : '';
    if (Number(rc || 0) > 0) {
      return {
        verified: false,
        shouldAbortNonTarget: true,
        action: 'ABORT_PLAIN_REASONING_CHARS',
        bytesEvaluated: raw.length,
      };
    }
    if (firstLine.startsWith('```') || (firstLine.length >= 28 && !firstLine.startsWith('{'))) {
      return {
        verified: false,
        shouldAbortNonTarget: true,
        action: 'FIRST_LINE_SCHEMA_VIOLATION_EARLY_ABORT',
        bytesEvaluated: firstLine.length,
      };
    }
    if (firstLine.length >= 16) {
      const m = firstLine.match(/^\{\s*"k"\s*:\s*(\d+)\s*,\s*"s"\s*:\s*"ok"\s*\}$/);
      if (m && Number(m[1]) === Number(expectedNumber)) {
        return {
          verified: true,
          shouldAbortNonTarget: false,
          action: 'FIRST_LINE_JSON_LOCKED_UNDER_50B',
          bytesEvaluated: firstLine.length,
          rp: Number(rp || 0),
        };
      }
    }
    return {
      verified: false,
      shouldAbortNonTarget: false,
      action: 'AWAIT_FIRST_LINE_COMPLETION',
      bytesEvaluated: raw.length,
    };
  }

  function score4dShrinkageKinematic(ttftMs, decodeCps, interDeltaCv = 0.35, stepCount = 1, shrinkageLambda = 0.18, ewmaTracker = null, vendor = 'openai') {
    const norm = (ewmaTracker && typeof ewmaTracker.normalize === 'function')
      ? ewmaTracker.normalize(vendor, ttftMs, decodeCps)
      : { normTtftMs: Number(ttftMs || 0), normDecodeCps: Number(decodeCps || 0) };
    const t = Number(norm.normTtftMs || ttftMs || 0);
    const c = Number(norm.normDecodeCps || decodeCps || 0);
    const cv = Math.max(0.05, Math.min(2.5, Number(interDeltaCv || 0.35)));
    const st = Math.max(1.0, Math.min(20.0, Number(stepCount || 1)));
    const lam = Math.max(0.05, Math.min(0.85, Number(shrinkageLambda || 0.18)));
    const centroids = {
      'openai/gpt-6.1-sol': { label: 'GPT 6.1 Sol (High)', mu: [2650, 148, 0.28, 1.3], sig: [620, 38, 0.11, 0.7], rhoTc: -0.38 },
      'openai/gpt-6-luna': { label: 'GPT 6 Luna (Medium)', mu: [820, 248, 0.42, 1.8], sig: [340, 42, 0.14, 0.9], rhoTc: -0.32 },
      'openai/gpt-5.6-sol': { label: 'GPT 5.6 Sol (High)', mu: [540, 335, 0.22, 1.2], sig: [260, 48, 0.09, 0.6], rhoTc: -0.35 },
    };
    const dists = {};
    const logits = {};
    let maxLg = -Infinity;
    for (const [mid, p] of Object.entries(centroids)) {
      const zt = (t - p.mu[0]) / p.sig[0];
      const zc = (c - p.mu[1]) / p.sig[1];
      const zcv = (cv - p.mu[2]) / p.sig[2];
      const zst = (st - p.mu[3]) / p.sig[3];
      const rEff = (1 - lam) * p.rhoTc;
      const d2Tc = (zt * zt - 2 * rEff * zt * zc + zc * zc) / Math.max(1e-6, 1 - rEff * rEff);
      const d24d = +(d2Tc + 0.55 * zcv * zcv + 0.35 * zst * zst).toFixed(4);
      dists[mid] = d24d;
      logits[mid] = -0.5 * d24d;
      if (logits[mid] > maxLg) maxLg = logits[mid];
    }
    let zSum = 0;
    const probs = {};
    for (const [mid, lg] of Object.entries(logits)) {
      const e = Math.exp(lg - maxLg);
      probs[mid] = e;
      zSum += e;
    }
    for (const mid of Object.keys(probs)) {
      probs[mid] = +(probs[mid] / (zSum || 1)).toFixed(4);
    }
    const ranked = Object.keys(centroids)
      .map((id) => ({ id, label: centroids[id].label, d2: dists[id], prob: probs[id] }))
      .sort((a, b) => a.d2 - b.d2);
    const d2Margin = ranked.length >= 2 ? +(ranked[1].d2 - ranked[0].d2).toFixed(4) : 0;
    return {
      winnerModelId: ranked[0].id,
      winnerLabel: ranked[0].label,
      posterior: ranked[0].prob,
      d2Margin,
      shrinkageLambda: lam,
      ranked,
      mahalanobis4dD2: dists,
      probabilities: probs,
    };
  }

  function persistV15WarmStartPriors(ewmaState, thompsonArms, storageKey = 'mcpArena.v15WarmStart.v1') {
    const payload = {
      version: '1.9.0-v15',
      updatedAt: Date.now(),
      ewmaState: ewmaState || {},
      thompsonArms: thompsonArms || {},
    };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    } catch (_) {}
    return payload;
  }

  function loadV15WarmStartPriors(storageKey = 'mcpArena.v15WarmStart.v1') {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return Object.assign({ loaded: true }, parsed);
        }
      }
    } catch (_) {}
    return { loaded: false, version: '1.9.0-v15', ewmaState: {}, thompsonArms: {} };
  }

  function classifyGptSampleV14(sample) {
    const res = classifyGptSampleV13(sample);
    if (!res) return res;
    res.v14_upgraded = true;
    res.v14_engine = "1.8.0-v14-ewma-mahalanobis";
    if (sample && sample.ttftMs > 0 && sample.decodeCps > 0) {
      res.v14_ewma_mahalanobis = score2dMahalanobisKinematic(sample.ttftMs, sample.decodeCps, sample.priorStats || null);
    }
    return res;
  }

  function classifyGptSampleV15(sample) {
    const res = classifyGptSampleV14(sample);
    if (!res) return res;
    res.v15_upgraded = true;
    res.v15_engine = "1.9.0-v15-firstline-4d-warmstart";
    if (sample && sample.ttftMs > 0 && sample.decodeCps > 0) {
      res.v15_4d_shrinkage = score4dShrinkageKinematic(
        sample.ttftMs,
        sample.decodeCps,
        sample.chunkIntervalCv != null ? sample.chunkIntervalCv : 0.25,
        sample.thinkingSteps != null ? sample.thinkingSteps : 1,
        0.18,
        sample.priorStats || null
      );
    }
    if (sample && sample.firstLineText) {
      res.v15_first_line_anchor = scoreFirstLineJsonAnchor(sample.firstLineText, sample.expectedChecksum != null ? sample.expectedChecksum : 437);
    }
    return res;
  }

  const V16_IAT_BURST_PROFILES = {
    'openai/gpt-6.1-sol': { mu_fano: 6.80, sd_fano: 2.10, mu_skew: 1.45, sd_skew: 0.55, mu_autocorr: 0.34, sd_autocorr: 0.18 },
    'openai/gpt-6-luna': { mu_fano: 1.85, sd_fano: 0.75, mu_skew: 0.38, sd_skew: 0.35, mu_autocorr: -0.08, sd_autocorr: 0.16 },
    'openai/gpt-5.6-sol': { mu_fano: 4.20, sd_fano: 1.40, mu_skew: 0.92, sd_skew: 0.42, mu_autocorr: 0.18, sd_autocorr: 0.17 },
    'openai/gpt-5.6-terra': { mu_fano: 2.65, sd_fano: 0.90, mu_skew: 0.55, sd_skew: 0.38, mu_autocorr: 0.04, sd_autocorr: 0.16 }
  };

  function scoreIatFanoBurstFingerprint(iatIntervalsMs, chunkByteLengths) {
    const iats = (Array.isArray(iatIntervalsMs) ? iatIntervalsMs : []).map(Number).filter((x) => x > 0 && x <= 15000);
    const blens = (Array.isArray(chunkByteLengths) ? chunkByteLengths : []).map(Number).filter((x) => x > 0);
    const nIat = iats.length;
    if (nIat < 3) {
      return {
        available: false,
        n_iat: nIat,
        fano_factor: 0,
        skewness: 0,
        byte_autocorr_lag1: 0,
        cv_dt: 0,
        ranked: [],
        best_id: null,
        llr_crown_vs_fast: 0
      };
    }
    const meanDt = iats.reduce((a, b) => a + b, 0) / nIat;
    const varDt = iats.reduce((acc, x) => acc + Math.pow(x - meanDt, 2), 0) / Math.max(1, nIat - 1);
    const sdDt = Math.sqrt(Math.max(1e-9, varDt));
    const cvDt = sdDt / Math.max(1.0, meanDt);
    const fanoFactor = varDt / Math.max(1.0, meanDt);
    const skewness = sdDt > 1e-6
      ? (iats.reduce((acc, x) => acc + Math.pow((x - meanDt) / sdDt, 3), 0) / nIat)
      : 0;

    let byteAutocorr = 0;
    if (blens.length >= 3) {
      const meanB = blens.reduce((a, b) => a + b, 0) / blens.length;
      const denomB = blens.reduce((acc, b) => acc + Math.pow(b - meanB, 2), 0);
      if (denomB > 1e-6) {
        let numB = 0;
        for (let i = 0; i < blens.length - 1; i++) {
          numB += (blens[i] - meanB) * (blens[i + 1] - meanB);
        }
        byteAutocorr = Math.max(-1.0, Math.min(1.0, numB / denomB));
      }
    }

    const ranked = Object.entries(V16_IAT_BURST_PROFILES).map(([modelId, prof]) => {
      const zF = (fanoFactor - prof.mu_fano) / Math.max(1e-6, prof.sd_fano);
      const zS = (skewness - prof.mu_skew) / Math.max(1e-6, prof.sd_skew);
      const zA = (byteAutocorr - prof.mu_autocorr) / Math.max(1e-6, prof.sd_autocorr);
      const d2 = +(zF * zF + zS * zS + zA * zA).toFixed(4);
      return { id: modelId, d2 };
    }).sort((a, b) => a.d2 - b.d2);

    const solEntry = ranked.find((r) => r.id === 'openai/gpt-6.1-sol');
    const lunaEntry = ranked.find((r) => r.id === 'openai/gpt-6-luna');
    const d2Sol = solEntry ? solEntry.d2 : 10.0;
    const d2Luna = lunaEntry ? lunaEntry.d2 : 10.0;
    const llrCrownVsFast = +(0.5 * (d2Luna - d2Sol)).toFixed(4);

    return {
      available: true,
      n_iat: nIat,
      mean_dt_ms: +meanDt.toFixed(3),
      cv_dt: +cvDt.toFixed(4),
      fano_factor: +fanoFactor.toFixed(4),
      skewness: +skewness.toFixed(4),
      byte_autocorr_lag1: +byteAutocorr.toFixed(4),
      ranked,
      best_id: ranked.length ? ranked[0].id : null,
      top2_margin_d2: ranked.length >= 2 ? +(ranked[1].d2 - ranked[0].d2).toFixed(4) : 0,
      llr_crown_vs_fast: llrCrownVsFast
    };
  }

  function createIncrementalCursorSvgScanner(vendor, targetModels) {
    const vLow = String(vendor || 'openai').toLowerCase();
    const state = {
      vendor: vLow,
      targetModels: Array.isArray(targetModels) ? targetModels.slice() : [],
      cursorOffset: 0,
      totalChars: 0,
      chunksScanned: 0,
      pathCount: 0,
      bezierCCount: 0,
      gradientCount: 0,
      animateCount: 0,
      commentCount: 0,
      hasSvgOpen: false,
      hasSvgClose: false,
      hasViewBox: false,
      hasPreserveAspect: false,
      hasRoleImg: false,
      _tail: '',
      abortedVerdict: null
    };

    function countMatches(str, re) {
      const m = str.match(re);
      return m ? m.length : 0;
    }

    function pushDelta(deltaText) {
      if (state.abortedVerdict) return state.abortedVerdict;
      const s = String(deltaText || '');
      if (!s) return { abort: false, cursorOffset: state.cursorOffset };

      const win = state._tail + s;
      const lowWin = win.toLowerCase();
      state.chunksScanned += 1;
      state.totalChars += s.length;
      state.cursorOffset = state.totalChars;

      state.pathCount += countMatches(lowWin, /<(?:path|circle|ellipse|polygon|polyline|rect|line)\b/g);
      state.bezierCCount += countMatches(lowWin, /\b[csqt]\s*[-+\d.]/g);
      state.gradientCount += countMatches(lowWin, /<(?:lineargradient|radialgradient)\b/g);
      state.animateCount += countMatches(lowWin, /<(?:animate|animatetransform|animatemotion)\b|@keyframes/g);
      state.commentCount += lowWin.split('<!--').length - 1;

      if (lowWin.indexOf('<svg') !== -1) state.hasSvgOpen = true;
      if (lowWin.indexOf('</svg>') !== -1) state.hasSvgClose = true;
      if (lowWin.indexOf('viewbox=') !== -1) state.hasViewBox = true;
      if (lowWin.indexOf('preserveaspectratio=') !== -1) state.hasPreserveAspect = true;
      if (lowWin.indexOf('role="img"') !== -1 || lowWin.indexOf("role='img'") !== -1 || lowWin.indexOf('aria-label=') !== -1) {
        state.hasRoleImg = true;
      }

      state._tail = s.length > 24 ? s.slice(-24) : s;
      const tailLow = state._tail.toLowerCase();
      state.pathCount -= countMatches(tailLow, /<(?:path|circle|ellipse|polygon|polyline|rect|line)\b/g);
      state.bezierCCount -= countMatches(tailLow, /\b[csqt]\s*[-+\d.]/g);
      state.gradientCount -= countMatches(tailLow, /<(?:lineargradient|radialgradient)\b/g);
      state.animateCount -= countMatches(tailLow, /<(?:animate|animatetransform|animatemotion)\b|@keyframes/g);
      state.commentCount -= (tailLow.split('<!--').length - 1);

      const crownShield = Boolean(
        state.hasPreserveAspect ||
        state.hasRoleImg ||
        state.gradientCount >= 2 ||
        state.commentCount >= 2 ||
        state.bezierCCount >= 6
      );

      if (state.totalChars >= 600 && state.hasSvgOpen && !crownShield) {
        if (state.vendor === 'anthropic' && state.gradientCount === 0 && state.commentCount === 0 && state.bezierCCount <= 2) {
          state.abortedVerdict = {
            abort: true,
            reason: 'V16_CURSOR_600B_CLAUDE_SONNET_ABORT',
            guessId: 'anthropic/claude-sonnet-4-6',
            cursorOffset: state.cursorOffset,
            crownShield: false
          };
          return state.abortedVerdict;
        }
        if (state.totalChars >= 1200 && state.gradientCount === 0 && state.bezierCCount <= 3 && state.pathCount <= 6) {
          const guess = state.vendor === 'google' ? 'google/gemini-3.8-flash' : 'openai/gpt-6-luna';
          state.abortedVerdict = {
            abort: true,
            reason: 'V16_CURSOR_1200B_LOW_COMPLEXITY_ABORT',
            guessId: guess,
            cursorOffset: state.cursorOffset,
            crownShield: false
          };
          return state.abortedVerdict;
        }
      }

      return {
        abort: false,
        cursorOffset: state.cursorOffset,
        crownShield,
        pathCount: Math.max(0, state.pathCount),
        bezierCount: Math.max(0, state.bezierCCount),
        gradientCount: Math.max(0, state.gradientCount)
      };
    }

    return { state, pushDelta };
  }

  function computeWaldSprtStoppingBoundary(evidence, alpha, beta) {
    const ev = (evidence && typeof evidence === 'object') ? evidence : {};
    const a = typeof alpha === 'number' && alpha > 0 ? alpha : 1e-4;
    const b = typeof beta === 'number' && beta > 0 ? beta : 0.02;
    const upperA = Math.log((1.0 - b) / Math.max(1e-9, a));
    const lowerB = Math.log(Math.max(1e-9, b) / (1.0 - a));

    let llrTotal = 0.0;
    const components = {};
    let crownShield = Boolean(ev.crownShield || ev.crown_shield);

    const fl = ev.firstLineAnchor || ev.v15_first_line_anchor;
    if (fl && typeof fl === 'object') {
      const llrFl = fl.abort ? -6.50 : ((fl.locked && fl.action === 'FIRST_LINE_JSON_LOCKED_UNDER_50B') ? 3.20 : 0.0);
      llrTotal += llrFl;
      components.first_line_anchor = llrFl;
    }

    const s4 = ev.shrinkage4d || ev.v15_4d_shrinkage;
    if (s4 && Array.isArray(s4.ranked) && s4.ranked.length >= 2) {
      const sol = s4.ranked.find((r) => String(r.id).indexOf('sol') !== -1);
      const luna = s4.ranked.find((r) => String(r.id).indexOf('luna') !== -1);
      const d2Sol = sol ? Number(sol.d2) : 8.0;
      const d2Luna = luna ? Number(luna.d2) : 8.0;
      const llr4d = Math.max(-4.5, Math.min(5.5, 0.45 * (d2Luna - d2Sol)));
      llrTotal += llr4d;
      components.shrinkage_4d = +llr4d.toFixed(4);
    }

    const fanoRes = ev.iatFano || ev.v16_iat_fano;
    if (fanoRes && fanoRes.available) {
      const llrFano = Math.max(-3.5, Math.min(4.5, Number(fanoRes.llr_crown_vs_fast || 0)));
      llrTotal += llrFano;
      components.iat_fano_burst = +llrFano.toFixed(4);
    }

    const cursorRes = ev.cursorScan || ev.v16_cursor_scan;
    if (cursorRes && typeof cursorRes === 'object') {
      let llrCur = 0.0;
      if (cursorRes.crownShield) {
        crownShield = true;
        llrCur = 3.60;
      } else if (cursorRes.abort) {
        llrCur = -4.80;
      }
      llrTotal += llrCur;
      components.cursor_skeleton = llrCur;
    }

    if (crownShield && llrTotal < 0) {
      llrTotal = Math.max(0.25, llrTotal + 4.50);
    }

    const posteriorCrown = 1.0 / (1.0 + Math.exp(-Math.max(-20.0, Math.min(20.0, llrTotal))));
    let action = 'CONTINUE_STREAMING';
    if (llrTotal >= upperA) {
      action = 'LOCK_CROWN_IMMEDIATE';
    } else if (llrTotal <= lowerB && !crownShield) {
      action = 'ABORT_NON_CROWN_IMMEDIATE';
    }

    return {
      action,
      llr: +llrTotal.toFixed(4),
      upperBoundaryA: +upperA.toFixed(4),
      lowerBoundaryB: +lowerB.toFixed(4),
      posteriorCrown: +posteriorCrown.toFixed(5),
      crownShieldActive: crownShield,
      components
    };
  }

  function classifyGptSampleV16(sample) {
    const res = classifyGptSampleV15(sample);
    if (!res) return res;
    res.v16_upgraded = true;
    res.v16_engine = '1.10.0-v16-iat-fano-cursor-sprt';
    const s = (sample && typeof sample === 'object') ? sample : {};
    const iats = s.iatIntervalsMs || s.deltaIntervals || [];
    const blens = s.chunkByteLengths || [];
    const fanoInfo = scoreIatFanoBurstFingerprint(iats, blens);
    res.v16_iat_fano = fanoInfo;

    const svgTxt = String(s.svgText || s.replyText || '');
    const scanner = createIncrementalCursorSvgScanner('openai', s.targetModels);
    if (svgTxt) {
      let lastScan = { abort: false };
      for (let pos = 0; pos < svgTxt.length; pos += 512) {
        lastScan = scanner.pushDelta(svgTxt.slice(pos, pos + 512));
        if (lastScan && lastScan.abort) break;
      }
      res.v16_cursor_scan = lastScan;
    } else {
      res.v16_cursor_scan = { abort: false, cursorOffset: 0, crownShield: false };
    }

    const sprt = computeWaldSprtStoppingBoundary({
      firstLineAnchor: res.v15_first_line_anchor,
      shrinkage4d: res.v15_4d_shrinkage,
      iatFano: fanoInfo,
      cursorScan: res.v16_cursor_scan,
      crownShield: Boolean(res.crown_safe || (res.v16_cursor_scan && res.v16_cursor_scan.crownShield))
    });
    res.v16_wald_sprt = sprt;

    if (fanoInfo.available && fanoInfo.top2_margin_d2 >= 2.20 && res.abstain) {
      const bestBurstId = fanoInfo.best_id;
      if (bestBurstId === 'openai/gpt-6.1-sol' && sprt.llr >= 3.0) {
        res.model_id = 'openai/gpt-6.1-sol';
        res.label = 'GPT 6.1 Sol (High)';
        res.v16_burst_refined = true;
      } else if (bestBurstId === 'openai/gpt-5.6-terra' || bestBurstId === 'openai/gpt-5.6-sol' || bestBurstId === 'openai/gpt-6-luna') {
        res.v16_burst_candidate = bestBurstId;
      }
    }
    return res;
  }


  // ============================================================================
  // V17 Core Upgrades:
  //   1. scoreSubwordEntropyReasoningCoupling
  //   2. createHighResStreamClock
  //   3. createV17WarmStartBroadcastBus
  //   4. classifyGptSampleV17
  // ============================================================================
  const V17_ENGINE_VERSION = '1.11.0-v17-entropy-monotonic-broadcast';

  function _charStructuralClass(ch) {
    const o = ch.charCodeAt(0);
    if (o === 9 || o === 10 || o === 13 || o === 32) return 0;
    if (ch === '<') return 1;
    if (ch === '>') return 2;
    if (ch === '/') return 3;
    if (ch === '=') return 4;
    if (ch === '"' || ch === "'") return 5;
    if (o >= 48 && o <= 57) return 6;
    if ((o >= 97 && o <= 102) || (o >= 65 && o <= 70)) return 7;
    if (o >= 103 && o <= 122) return 8;
    if (o >= 71 && o <= 90) return 9;
    if ('-.,;:#%()_'.indexOf(ch) !== -1) return 10;
    return 11;
  }

  function scoreSubwordEntropyReasoningCoupling(text, rp = 0, rc = 0, textDeltaCount = 0, chunkByteLengths = null) {
    const raw = String(text || '');
    const prefix = raw.slice(0, 1024);
    const nChars = prefix.length;
    if (nChars < 16) {
      return {
        available: false,
        reason: 'insufficient_prefix_length',
        n_chars: nChars,
        conditional_entropy_bits: 0.0,
        boundary_density: 0.0,
        reasoning_pulse_density: 0.0,
        llr_v17_entropy: 0.0,
        best_id: null
      };
    }
    const countsPrev = new Array(12).fill(0);
    const countsPair = Array.from({ length: 12 }, () => new Array(12).fill(0));
    let prevCls = _charStructuralClass(prefix[0]);
    let boundaryTransitions = 0;
    for (let idx = 1; idx < nChars; idx++) {
      const curCls = _charStructuralClass(prefix[idx]);
      countsPrev[prevCls] += 1;
      countsPair[prevCls][curCls] += 1;
      if (curCls !== prevCls && (curCls === 1 || curCls === 2 || curCls === 4 || curCls === 5 || curCls === 6 || curCls === 10)) {
        boundaryTransitions += 1;
      }
      prevCls = curCls;
    }
    const totalTransitions = Math.max(1, nChars - 1);
    let condEntropy = 0.0;
    for (let a = 0; a < 12; a++) {
      const ca = countsPrev[a];
      if (ca <= 0) continue;
      const pA = ca / totalTransitions;
      let hGivenA = 0.0;
      for (let b = 0; b < 12; b++) {
        const cab = countsPair[a][b];
        if (cab > 0) {
          const pBGivenA = cab / ca;
          hGivenA -= pBGivenA * Math.log2(pBGivenA);
        }
      }
      condEntropy += pA * hGivenA;
    }
    const blenCount = Array.isArray(chunkByteLengths) ? chunkByteLengths.length : 0;
    const effChunks = Math.max(1, Number(textDeltaCount || 0), blenCount);
    const boundaryDensity = boundaryTransitions / totalTransitions;
    const rpInt = Math.max(0, Math.floor(Number(rp || 0)));
    const rcInt = Math.max(0, Math.floor(Number(rc || 0)));
    const reasoningPulseDensity = rpInt / Math.max(1.0, effChunks / 20.0);

    let llrV17 = 0.0;
    let bestId = 'openai/gpt-5.6-sol';
    if (rcInt === 0 && rpInt >= 2) {
      if (condEntropy >= 1.88 && boundaryDensity >= 0.34) {
        llrV17 = Math.min(2.85, 1.15 + 0.95 * (condEntropy - 1.85) + 0.18 * Math.min(6, rpInt));
        bestId = 'openai/gpt-6.1-sol';
      } else {
        llrV17 = 0.35;
        bestId = 'openai/gpt-5.6-sol';
      }
    } else if (rcInt === 0 && rpInt === 0) {
      if (condEntropy < 1.75) {
        llrV17 = -2.85;
        bestId = 'openai/gpt-6-luna';
      } else {
        llrV17 = -1.95;
        bestId = 'openai/gpt-5.6-terra';
      }
    } else if (rcInt > 0) {
      llrV17 = -3.60;
      bestId = 'non-openai/visible-cot';
    }

    return {
      available: true,
      n_chars: nChars,
      conditional_entropy_bits: +condEntropy.toFixed(4),
      boundary_density: +boundaryDensity.toFixed(4),
      reasoning_pulse_density: +reasoningPulseDensity.toFixed(4),
      rp: rpInt,
      rc: rcInt,
      llr_v17_entropy: +llrV17.toFixed(4),
      best_id: bestId
    };
  }

  function createHighResStreamClock(uiThrottleMs = 120) {
    const throttle = Math.max(16, Number(uiThrottleMs) || 120);
    const hasPerf = typeof performance !== 'undefined' && typeof performance.now === 'function';
    const t0 = hasPerf ? performance.now() : Date.now();
    let lastDeltaMs = null;
    let lastUiFlushMs = -1e9;
    const iatIntervalsMs = [];
    const iatIntervalsUs = [];
    const chunkByteLengths = [];

    function nowMs() {
      const raw = hasPerf ? (performance.now() - t0) : (Date.now() - t0);
      return +raw.toFixed(3);
    }

    function recordDelta(deltaText, explicitNowMs = null) {
      const s = String(deltaText || '');
      const bLen = (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function')
        ? Buffer.byteLength(s, 'utf8')
        : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length);
      if (chunkByteLengths.length < 512 && bLen > 0) {
        chunkByteLengths.push(bLen);
      }
      const curMs = (explicitNowMs !== null && explicitNowMs !== undefined) ? Number(explicitNowMs) : nowMs();
      let dtMs = null;
      if (lastDeltaMs !== null && curMs > lastDeltaMs) {
        const diffMs = curMs - lastDeltaMs;
        if (diffMs >= 0.01 && diffMs <= 15000) {
          dtMs = +diffMs.toFixed(3);
          const dtUs = Math.round(diffMs * 1000);
          if (iatIntervalsMs.length < 512) {
            iatIntervalsMs.push(dtMs);
            iatIntervalsUs.push(dtUs);
          }
        }
      }
      lastDeltaMs = curMs;
      return { dtMs, byteLength: bLen, sampleCount: iatIntervalsMs.length };
    }

    function shouldFlushUi(force = false, explicitNowMs = null) {
      const curMs = (explicitNowMs !== null && explicitNowMs !== undefined) ? Number(explicitNowMs) : nowMs();
      if (force || (curMs - lastUiFlushMs) >= throttle) {
        lastUiFlushMs = curMs;
        return true;
      }
      return false;
    }

    function exportTelemetry() {
      return {
        iatIntervalsMs: iatIntervalsMs.slice(0, 128),
        iatIntervalsUs: iatIntervalsUs.slice(0, 128),
        chunkByteLengths: chunkByteLengths.slice(0, 128),
        monotonicClock: true,
        uiThrottleMs: throttle
      };
    }

    return { nowMs, recordDelta, shouldFlushUi, exportTelemetry };
  }

  function createV17WarmStartBroadcastBus(channelName = 'arena_v17_warmstart_bus') {
    const chKey = String(channelName || 'arena_v17_warmstart_bus');
    let statePriors = {};
    let bc = null;
    const listeners = [];

    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem('mcpArena.' + chKey);
        if (cached) statePriors = JSON.parse(cached) || {};
      }
    } catch (_) {}

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(chKey);
        bc.onmessage = (ev) => {
          const d = ev && ev.data;
          if (d && d.type === 'v17_warmstart_sync' && d.priors && typeof d.priors === 'object') {
            statePriors = Object.assign({}, statePriors, d.priors);
            for (const fn of listeners) {
              try { fn(statePriors, d); } catch (_) {}
            }
          }
        };
      }
    } catch (_) {}

    function publishPriors(priors, instanceId = 'tab') {
      if (!priors || typeof priors !== 'object') return statePriors;
      statePriors = Object.assign({}, statePriors, priors);
      const msg = {
        type: 'v17_warmstart_sync',
        channel: chKey,
        instanceId: String(instanceId || 'tab'),
        updatedAtMs: Date.now(),
        priors: statePriors
      };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('mcpArena.' + chKey, JSON.stringify(statePriors));
        }
      } catch (_) {}
      try {
        if (bc) bc.postMessage(msg);
      } catch (_) {}
      return msg;
    }

    function getPriors() {
      return Object.assign({}, statePriors);
    }

    function onSync(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }

    function close() {
      try { if (bc) bc.close(); } catch (_) {}
    }

    return { publishPriors, getPriors, onSync, close, channel: chKey };
  }

  function classifyGptSampleV17(sample) {
    const s = (sample && typeof sample === 'object') ? sample : {};
    const res = classifyGptSampleV16(s);
    if (!res || typeof res !== 'object') return res;
    res.v17_upgraded = true;
    res.v17_engine = V17_ENGINE_VERSION;

    const svgTxt = String(s.svgText || s.replyText || '');
    const rpVal = Number(s.rp !== undefined && s.rp !== null ? s.rp : (s.nReason || s.reasoningStartCount || 0));
    const rcVal = Number(s.rc !== undefined && s.rc !== null ? s.rc : (s.reasoningTextLength || 0));
    const tChunks = Number(s.textDeltaCount || s.chunks || 0);
    const blens = Array.isArray(s.chunkByteLengths) ? s.chunkByteLengths : [];

    const entropyInfo = scoreSubwordEntropyReasoningCoupling(svgTxt, rpVal, rcVal, tChunks, blens);
    res.v17_subword_entropy = entropyInfo;

    const sprt = res.v16_wald_sprt ? Object.assign({}, res.v16_wald_sprt) : null;
    if (sprt && entropyInfo.available) {
      const baseLlr = Number(sprt.llr || 0.0);
      const entLlr = Number(entropyInfo.llr_v17_entropy || 0.0);
      const coupledLlr = +(baseLlr + 0.45 * entLlr).toFixed(4);
      const upperA = Number(sprt.upperBoundaryA || 9.1902);
      const lowerB = Number(sprt.lowerBoundaryB || -3.9119);
      const crownShield = Boolean(sprt.crownShieldActive);
      let coupledAction = sprt.action || 'CONTINUE_STREAMING';
      if (coupledLlr >= upperA) {
        coupledAction = 'LOCK_CROWN_IMMEDIATE';
      } else if (coupledLlr <= lowerB && !crownShield) {
        coupledAction = 'ABORT_NON_CROWN_IMMEDIATE';
      }
      sprt.llr_v16_base = baseLlr;
      sprt.llr_v17_entropy_delta = +(0.45 * entLlr).toFixed(4);
      sprt.llr = coupledLlr;
      sprt.action = coupledAction;
      sprt.posteriorCrown = +(1.0 / (1.0 + Math.exp(-Math.max(-20.0, Math.min(20.0, coupledLlr))))).toFixed(5);
      res.v16_wald_sprt = sprt;
    }

    return res;
  }


  // ============================================================================
  // V18 Core Upgrades:
  //   1. scoreToolCallAstSchemaFingerprint
  //   2. evaluatePreTextToolDeltaGate
  //   3. evaluateLockedSessionFastPath
  //   4. classifyGptSampleV18
  // ============================================================================
  const V18_ENGINE_VERSION = '1.12.0-v18-toolast-pretext-fastpath';

  function _detectToolIdFamily(toolIds) {
    const list = Array.isArray(toolIds) ? toolIds : [];
    for (const raw of list) {
      const tid = String(raw || '').trim();
      if (!tid) continue;
      if (/^(?:srv)?toolu_|^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(tid)) return 'anthropic';
      if (/^call_[0-9]+_/i.test(tid)) return 'deepseek';
      if (/^call_[0-9a-f]{24}$/.test(tid)) return 'domestic-hex24';
      if (/^(?:tc|fc)_[A-Za-z0-9_-]{16,}|^call_(?![0-9a-f]{24}$)(?![0-9]+_)[A-Za-z0-9_-]{18,}/i.test(tid)) return 'openai';
    }
    return 'unknown';
  }

  function scoreToolCallAstSchemaFingerprint(toolWriteBuf = '', toolIds = null, toolDeltaByteLengths = null, rp = 0, rc = 0) {
    const rawBuf = String(toolWriteBuf || '');
    const tFam = _detectToolIdFamily(toolIds);
    const blens = Array.isArray(toolDeltaByteLengths)
      ? toolDeltaByteLengths.map(Number).filter(x => Number.isFinite(x) && x > 0)
      : [];

    if (rawBuf.length < 12 && tFam === 'unknown' && blens.length < 2) {
      return {
        available: false,
        reason: 'no_tool_stream_evidence',
        tool_family: tFam,
        key_order: 'none',
        escape_density: 0.0,
        svg_tag_density: 0.0,
        tool_delta_fano: 0.0,
        llr_v18_tool_ast: 0.0,
        best_id: null
      };
    }

    const head = rawBuf.slice(0, 2048);
    let idxPath = head.indexOf('"path"');
    if (idxPath < 0) idxPath = head.indexOf('"file_path"');
    const idxContent = head.indexOf('"content"');
    let keyOrder = 'partial_or_other';
    if (idxPath >= 0 && idxContent >= 0) {
      keyOrder = idxPath < idxContent ? 'path_before_content' : 'content_before_path';
    } else if (head.indexOf('"command"') >= 0) {
      keyOrder = 'bash_command_schema';
    }

    const bs = String.fromCharCode(92);
    const countSub = (str, sub) => (str.split(sub).length - 1);
    const escCount = countSub(head, bs + 'n') + countSub(head, bs + '"') + countSub(head, bs + 't');
    const escapeDensity = +(escCount / Math.max(1, head.length)).toFixed(4);

    const svgMatches = (head.match(/<(?:svg|defs|linearGradient|radialGradient|path|circle|g|style|script)/gi) || []).length;
    const svgTagDensity = +((svgMatches / Math.max(1, head.length)) * 100.0).toFixed(4);

    let toolDeltaFano = 0.0;
    if (blens.length >= 2) {
      const meanB = blens.reduce((a, b) => a + b, 0) / blens.length;
      const varB = blens.reduce((acc, x) => acc + Math.pow(x - meanB, 2), 0) / Math.max(1, blens.length - 1);
      toolDeltaFano = +(varB / Math.max(1.0, meanB)).toFixed(4);
    }

    const rpInt = Math.max(0, Math.floor(Number(rp || 0)));
    const rcInt = Math.max(0, Math.floor(Number(rc || 0)));
    let llrV18 = 0.0;
    let bestId = null;

    if (tFam === 'deepseek' || tFam === 'domestic-hex24' || rcInt > 0) {
      llrV18 = -4.20;
      bestId = 'non-openai/tool-veto';
    } else if (tFam === 'anthropic') {
      llrV18 = -3.80;
      bestId = 'anthropic/claude-opus-5.5';
    } else if (tFam === 'openai' || (rcInt === 0 && head.length >= 24)) {
      if (rpInt >= 2 && (svgTagDensity >= 0.85 || toolDeltaFano >= 2.5 || keyOrder === 'path_before_content' || keyOrder === 'content_before_path')) {
        llrV18 = +Math.min(2.65, 1.35 + 0.22 * Math.min(4, rpInt) + (svgTagDensity >= 1.2 ? 0.35 : 0.0)).toFixed(4);
        bestId = 'openai/gpt-6.1-sol';
      } else if (rpInt === 0 && svgTagDensity < 0.85) {
        llrV18 = -2.35;
        bestId = 'openai/gpt-6-luna';
      } else {
        llrV18 = 0.40;
        bestId = 'openai/gpt-5.6-sol';
      }
    }

    return {
      available: true,
      tool_family: tFam,
      key_order: keyOrder,
      escape_density: escapeDensity,
      svg_tag_density: svgTagDensity,
      tool_delta_fano: toolDeltaFano,
      rp: rpInt,
      rc: rcInt,
      llr_v18_tool_ast: +llrV18.toFixed(4),
      best_id: bestId
    };
  }

  function evaluatePreTextToolDeltaGate(toolWriteBuf = '', toolIds = null, targetModels = null, rp = 0, rc = 0) {
    const rawBuf = String(toolWriteBuf || '');
    const tFam = _detectToolIdFamily(toolIds);
    const tList = Array.isArray(targetModels) ? targetModels : ['crown'];
    const targetsLow = tList.map(x => String(x || '').toLowerCase()).join(' ');
    const hasCrownOrAny = /(?:crown|any|opus|claude|carbon|argon|gemini)/.test(targetsLow);
    const wantsOnlyOpenai = /(?:gpt|sol|openai)/.test(targetsLow) && !hasCrownOrAny;
    const wantsOnlyAnthropic = /(?:opus|claude)/.test(targetsLow) && !/(?:crown|any|gpt|sol|carbon|argon|gemini)/.test(targetsLow);

    if (tFam === 'deepseek' || tFam === 'domestic-hex24') {
      return {
        abort: true,
        action: 'ABORT_PRETEXT_TOOL_VENDOR_VETO',
        reason: `V18_PRETEXT_DOMESTIC_TOOL_ID(${tFam})`,
        crownShield: false,
        toolFamily: tFam
      };
    }
    if (wantsOnlyOpenai && tFam === 'anthropic') {
      return {
        abort: true,
        action: 'ABORT_PRETEXT_CROSS_FAMILY_TOOL',
        reason: 'V18_PRETEXT_ANTHROPIC_TOOL_WHEN_HUNTING_OPENAI',
        crownShield: false,
        toolFamily: tFam
      };
    }
    if (wantsOnlyAnthropic && tFam === 'openai') {
      return {
        abort: true,
        action: 'ABORT_PRETEXT_CROSS_FAMILY_TOOL',
        reason: 'V18_PRETEXT_OPENAI_TOOL_WHEN_HUNTING_ANTHROPIC',
        crownShield: false,
        toolFamily: tFam
      };
    }

    const bs = String.fromCharCode(92);
    const unesc = rawBuf.slice(0, 2048)
      .split(bs + 'n').join(String.fromCharCode(10))
      .split(bs + 'r').join(String.fromCharCode(13))
      .split(bs + 't').join(String.fromCharCode(9))
      .split(bs + '"').join('"')
      .split(bs + bs).join(bs);

    const hasRoleImg = /role\s*=\s*["']img["']/i.test(unesc);
    const gradCnt = (unesc.match(/<(?:linearGradient|radialGradient)(?:\s|>)/gi) || []).length;
    const bezierCnt = (unesc.match(/(?:^|[\s,])(?:C|c|S|s|Q|q|T|t)\s*[-+0-9.]/g) || []).length;
    const hasRafIife = unesc.indexOf('requestAnimationFrame') !== -1 && (unesc.indexOf('function') !== -1 || unesc.indexOf('=>') !== -1);
    const crownShield = Boolean(hasRoleImg || gradCnt >= 2 || bezierCnt >= 6 || hasRafIife || Number(rp || 0) >= 2);

    if (crownShield) {
      return {
        abort: false,
        action: 'PROTECT_CROWN_TOOL_STREAM',
        reason: 'V18_PRETEXT_CROWN_SHIELD_ACTIVE',
        crownShield: true,
        toolFamily: tFam
      };
    }

    if (unesc.length >= 600 && unesc.toLowerCase().indexOf('<svg') !== -1 && Number(rp || 0) === 0 && gradCnt === 0 && bezierCnt <= 1) {
      const ent = scoreSubwordEntropyReasoningCoupling(unesc, Number(rp || 0), Number(rc || 0));
      if (ent && ent.available && Number(ent.conditional_entropy_bits || 0) < 1.72) {
        return {
          abort: true,
          action: 'ABORT_PRETEXT_LOW_ENTROPY_TOOL_SVG',
          reason: `V18_PRETEXT_600B_LOW_ENTROPY_SVG(H=${ent.conditional_entropy_bits})`,
          crownShield: false,
          toolFamily: tFam
        };
      }
    }

    return {
      abort: false,
      action: 'CONTINUE_PRETEXT_TOOL_STREAM',
      reason: 'V18_PRETEXT_PASS',
      crownShield,
      toolFamily: tFam
    };
  }

  function evaluateLockedSessionFastPath(prevEntry, currentEvidence) {
    const prev = (prevEntry && typeof prevEntry === 'object') ? prevEntry : {};
    const ev = (currentEvidence && typeof currentEvidence === 'object') ? currentEvidence : {};
    const lockedModel = String(prev.initialModel || prev.model || '').trim();
    const lockedLabel = String(prev.initialLabel || prev.label || '').trim();
    let lockedEffort = String(prev.initialEffort || prev.inferredEffort || 'HIGH').trim().toUpperCase();
    const lockedVendor = String(prev.initialVendor || prev.vendor || '').trim().toLowerCase();

    if (!lockedModel || prev.routeSwitched || ev.routeSwitched) {
      return { fastPathHit: false, reason: 'no_locked_model_or_route_switched' };
    }
    if (ev.visibleReasoning && !prev.isPlain && !prev.initialIsPlain) {
      return { fastPathHit: false, reason: 'plaintext_reasoning_flip' };
    }
    const curToolFam = _detectToolIdFamily(ev.toolIds);
    if (curToolFam !== 'unknown' && lockedVendor) {
      if ((curToolFam === 'anthropic' && lockedVendor !== 'anthropic') || (curToolFam === 'openai' && lockedVendor !== 'openai')) {
        return { fastPathHit: false, reason: `tool_family_mismatch(${curToolFam}!=${lockedVendor})` };
      }
    }
    if (!/^(LOW|MEDIUM|HIGH|XHIGH|MAX)$/.test(lockedEffort)) {
      lockedEffort = 'HIGH';
    }
    return {
      fastPathHit: true,
      model_id: lockedModel,
      label: lockedLabel,
      pinned_effort: lockedEffort,
      vendor: lockedVendor,
      reason: 'V18_LOCKED_SESSION_O1_FAST_PATH'
    };
  }

  function classifyGptSampleV18(sample) {
    const s = (sample && typeof sample === 'object') ? sample : {};
    const res = classifyGptSampleV17(s);
    if (!res || typeof res !== 'object') return res;
    res.v18_upgraded = true;
    res.v18_engine = V18_ENGINE_VERSION;

    const toolBuf = String(s.toolWriteBuf || s.toolStreamHtml || '');
    const toolIds = Array.isArray(s.toolIds) ? s.toolIds : [];
    const toolBlens = Array.isArray(s.toolDeltaByteLengths)
      ? s.toolDeltaByteLengths
      : (Array.isArray(s.chunkByteLengths) ? s.chunkByteLengths : []);
    const rpVal = Number(s.rp !== undefined && s.rp !== null ? s.rp : (s.nReason || s.reasoningStartCount || 0));
    const rcVal = Number(s.rc !== undefined && s.rc !== null ? s.rc : (s.reasoningTextLength || 0));

    const toolAst = scoreToolCallAstSchemaFingerprint(toolBuf, toolIds, toolBlens, rpVal, rcVal);
    res.v18_tool_ast = toolAst;

    const pretextGate = evaluatePreTextToolDeltaGate(toolBuf, toolIds, s.targetModels, rpVal, rcVal);
    res.v18_pretext_gate = pretextGate;

    const fastPath = evaluateLockedSessionFastPath(s.prevSessionEntry, s);
    res.v18_fast_path = fastPath;

    const sprt = res.v16_wald_sprt ? Object.assign({}, res.v16_wald_sprt) : null;
    if (sprt && toolAst.available) {
      const baseLlr = Number(sprt.llr || 0.0);
      const tLlr = Number(toolAst.llr_v18_tool_ast || 0.0);
      const coupledLlr = +(baseLlr + 0.40 * tLlr).toFixed(4);
      const upperA = Number(sprt.upperBoundaryA || 9.1902);
      const lowerB = Number(sprt.lowerBoundaryB || -3.9119);
      const crownShield = Boolean(sprt.crownShieldActive || pretextGate.crownShield);
      let coupledAction = sprt.action || 'CONTINUE_STREAMING';
      if (coupledLlr >= upperA) {
        coupledAction = 'LOCK_CROWN_IMMEDIATE';
      } else if (coupledLlr <= lowerB && !crownShield) {
        coupledAction = 'ABORT_NON_CROWN_IMMEDIATE';
      }
      sprt.llr_v18_tool_ast_delta = +(0.40 * tLlr).toFixed(4);
      sprt.llr = coupledLlr;
      sprt.action = coupledAction;
      sprt.crownShieldActive = crownShield;
      sprt.posteriorCrown = +(1.0 / (1.0 + Math.exp(-Math.max(-20.0, Math.min(20.0, coupledLlr))))).toFixed(5);
      res.v16_wald_sprt = sprt;
    }

    return res;
  }

  function classifyGptSampleV13(sample) {
    return applyV13TrajectoryRefinement(classifyGptSample(sample), sample);
  }
  return {
    buildFirstLineDualAnchorPrompt,
    scoreFirstLineJsonAnchor,
    score4dShrinkageKinematic,
    persistV15WarmStartPriors,
    loadV15WarmStartPriors,
    createEwmaCongestionTracker,
    score2dMahalanobisKinematic,
    selectTargetAwareProbeStrategy,
    ENGINE_VERSION,
    MODEL_LABELS,
    VALID_EFFORTS,
    extractFirstSvgOrHtml,
    extractGptArtifactFeatures,
    extractV12Geometry,
    applyV12SelectiveGate,
    applyV13TrajectoryRefinement,
    evaluateV13BoundaryUncertainty,
    detectCanarySlotDrift,
    scoreStage1MicroProbe,
    classifyGptSample,
    classifyGptSampleV13,
    classifyGptSampleV14,
    classifyGptSampleV15,
    classifyGptSampleV16,
    classifyGptSampleV17,
    classifyGptSampleV18,
    classify: classifyGptSampleV18,
    scoreToolCallAstSchemaFingerprint,
    evaluatePreTextToolDeltaGate,
    evaluateLockedSessionFastPath,
    scoreSubwordEntropyReasoningCoupling,
    createHighResStreamClock,
    createV17WarmStartBroadcastBus,
    scoreIatFanoBurstFingerprint,
    createIncrementalCursorSvgScanner,
    computeWaldSprtStoppingBoundary,
    autoCalibrateAndPruneLlr,
    clearGptClassifierCache,
    shouldAbortStage0WirePrefix,
    evaluateStage15ContrastiveTurn,
    createStreamingPelicanFst,
    createThompsonAccountScheduler,
    buildDualAnchorStage1Prompt,
    scoreDualAnchorStage1,
    computeTokenizerFertilitySignal,
    createBytePelicanFst,
    createAdaptiveRiskGovernor,
    createEwmaCongestionNormalizer,
    computeMahalanobis2dPhaseScore,
    selectOptimalStage1Strategy,
  };
}));
