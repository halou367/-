(function (global) {
  "use strict";

/**
 * Tihu / PelicanBench Isomorphic Subject-Agnostic Attribution Engine v4
 * Hierarchical 66-Model + 96-D SVD Exemplar Kernel + Claude-vs-Muse Specialist + Model-Calibrated Monotonic Effort Engine
 * Shared 1:1 between Browser UI and Cloudflare Pages Functions (/api/v1/identify).
 */

const TIERS = ["low", "medium", "high", "max"];
const TIER_ORD = { low: 0, medium: 1, high: 2, max: 3 };

const UI_VAR_STEMS = new Set([
  "bg", "ui", "panel", "card", "ink", "paper", "muted", "accent",
  "text", "border", "shadow", "sky", "sun", "sea", "road", "glass",
  "surface", "line", "glow", "fg", "brand", "teal", "orange", "gold"
]);

const CSS_FNS = [
  "rgba(", "hsla(", "hsl(", "oklch(", "clamp(", "calc(", "min(", "max(",
  "cubic-bezier(", "linear-gradient(", "radial-gradient(", "conic-gradient(",
  "var(--", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI",
  "ui-rounded", "SF Pro Rounded", "Georgia", "monospace", "100vh", "100dvh",
  "100vw", "backdrop-filter", "color-scheme", "prefers-reduced-motion",
  "place-items", "aspect-ratio", "pointer-events", "user-select", "will-change",
  "transform-box", "fill-box", "focus-visible", "letter-spacing"
];

const SVG_ATTRS_LIST = [
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "fill-rule", "clip-path", "gradientUnits", "userSpaceOnUse", "objectBoundingBox",
  "preserveAspectRatio", "vector-effect", "paint-order", "aria-label",
  'role="img"', 'xmlns="http://www.w3.org/2000/svg"', "transform-origin",
  "transform-box", "repeatCount", "keySplines", "calcMode", "stop-opacity"
];

const JS_PATS = [
  ["JS:USE_STRICT", /['"]use strict['"]/g],
  ["JS:IIFE_ARROW_SP", /\(\s*\(\s*\)\s*=>\s*\{/g],
  ["JS:IIFE_ARROW_TIGHT", /\(\(\)=>\{/g],
  ["JS:IIFE_FUNC", /\(\s*function\s*\(\s*\)\s*\{/g],
  ["JS:DOM_LOADED", /DOMContentLoaded/g],
  ["JS:MATCH_MEDIA", /matchMedia/g],
  ["JS:REDUCED_MOTION", /prefers-reduced-motion/g],
  ["JS:RAF", /requestAnimationFrame/g],
  ["JS:PERF_NOW", /performance\.now/g],
  ["JS:DATE_NOW", /Date\.now/g],
  ["JS:GET_BY_ID", /getElementById/g],
  ["JS:QUERY_SEL", /querySelector\(/g],
  ["JS:QUERY_ALL", /querySelectorAll\(/g],
  ["JS:SPREAD_NODELIST", /\[\.\.\.document\.querySelectorAll/g],
  ["JS:SET_ATTR", /setAttribute/g],
  ["JS:SET_ATTR_D", /setAttribute\(\s*['"]d['"]/g],
  ["JS:CREATE_NS", /createElementNS/g],
  ["JS:STYLE_TRANSFORM", /\.style\.transform/g],
  ["JS:CLASSLIST_TOGGLE", /\.classList\.toggle/g],
  ["JS:MATH_ATAN2", /Math\.atan2/g],
  ["JS:MATH_ACOS", /Math\.acos/g],
  ["JS:MATH_HYPOT", /Math\.hypot/g],
  ["JS:MATH_SIN", /Math\.sin/g],
  ["JS:MATH_COS", /Math\.cos/g],
  ["JS:MATH_PI", /Math\.PI/g],
  ["JS:CLASS_DECL", /(?:^|[\s;{}])class\s+[A-Z]/g],
  ["JS:AUDIO_CTX", /AudioContext/g],
  ["JS:POINTER_EVT", /pointerdown|pointermove/g],
  ["JS:KEYDOWN", /keydown/g],
  ["JS:TEMPLATE_TRANSFORM", /\x60translate\(|\x60rotate\(/g],
  ["JS:TMPL_PATH_ML", /\x60M\s*\$\{/g],
  ["JS:IK_JOINTS", /\b(?:WHEEL_R|HIP|SHIN|THIGH|CRANK_R|BB)\b/g],
  ["JS:TO_FIXED", /\.toFixed\(/g],
  ["JS:LEADING_DOT_FLOAT", /[^0-9]\.\d+/g]
];

const CF_CHALLENGE_RE = /<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/gi;

function unwrapCodeInput(rawText) {
  let s = String(rawText || "");
  const trimmed = s.trim();
  const fenceMatch = trimmed.match(/^\x60{3}(?:html|htm|svg|xml)?\s*\r?\n([\s\S]*?)\r?\n\x60{3}\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  if (!trimmed.startsWith("<") && trimmed.includes("\x60\x60\x60")) {
    const inner = trimmed.match(/\x60{3}(?:html|htm|svg|xml)?\s*\r?\n([\s\S]*?)\r?\n\x60{3}/i);
    if (inner && /<(?:!doctype|html|svg)\b/i.test(inner[1])) {
      return inner[1];
    }
  }
  return s;
}

function stripCfChallenge(rawHtml) {
  return String(rawHtml || "").replace(CF_CHALLENGE_RE, "");
}

function countMatches(str, regex) {
  const m = str.match(regex);
  return m ? m.length : 0;
}

function countSubstr(str, sub) {
  if (!sub) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = str.indexOf(sub, pos);
    if (idx === -1) break;
    count++;
    pos = idx + sub.length;
  }
  return count;
}

function extractEffortComplexity(rawHtml) {
  const html = stripCfChallenge(rawHtml).replace(/\r\n/g, "\n");
  const nChars = Math.max(html.length, 1);
  const lines = html.split("\n");
  let nonBlank = 0;
  for (const ln of lines) {
    if (ln.trim()) nonBlank++;
  }

  const scrChunks = [];
  const scRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scm;
  while ((scm = scRe.exec(html)) !== null) scrChunks.push(scm[1]);
  const scriptB = scrChunks.join("\n");
  const jsChars = scriptB.trim().length;
  let jsLines = 0;
  if (jsChars > 0) {
    for (const ln of scriptB.split("\n")) {
      if (ln.trim()) jsLines++;
    }
  }
  const jsFuncs = countMatches(scriptB, /\bfunction\b|=>\s*\{/g);

  const nShapes = countMatches(html, /<(?:path|circle|ellipse|rect|line|polygon|polyline)[\s>]/gi);
  const nGroups = countMatches(html, /<g[\s>]/gi);
  const nGradsFx = countMatches(html, /<(?:linearGradient|radialGradient|filter|clipPath|mask)[\s>]/gi);
  const nControls = countMatches(html, /<(?:button|input|select)[\s>]/gi) + countMatches(scriptB, /addEventListener\(/g);
  const hasRaf = scriptB.includes("requestAnimationFrame") ? 1.0 : 0.0;
  const hasIk = (scriptB.includes("Math.atan2") || scriptB.includes("Math.acos") || scriptB.includes("Math.hypot")) ? 1.0 : 0.0;
  const nCmts = countMatches(html, /<!--[\s\S]*?-->/g);

  const effortIdx = (
    0.36 * Math.log(nChars) +
    0.22 * Math.log1p(nonBlank) +
    0.16 * Math.log1p(nShapes + 0.5 * nGroups) +
    0.13 * Math.log1p(jsLines) +
    0.07 * (hasRaf + hasIk + Math.min(nControls, 6) * 0.25) +
    0.06 * Math.log1p(nGradsFx + nCmts * 0.3)
  );

  return {
    effortIdx,
    vec: [
      effortIdx,
      Math.log(nChars),
      Math.log1p(nonBlank),
      Math.log1p(jsChars),
      Math.log1p(jsLines),
      Math.log1p(jsFuncs),
      Math.log1p(nShapes),
      Math.log1p(nGroups),
      Math.log1p(nGradsFx),
      Math.log1p(nControls),
      hasRaf,
      hasIk,
      Math.log1p(nCmts)
    ],
    meta: {
      nonBlankLines: nonBlank,
      jsLines,
      jsFuncs,
      interactiveControls: nControls
    }
  };
}

function extractDenseFeatures(rawHtml) {
  const html = stripCfChallenge(rawHtml).replace(/\r\n/g, "\n");
  const nChars = Math.max(html.length, 1);
  const lines = html.split("\n");
  const nLines = Math.max(lines.length, 1);
  const head80 = html.slice(0, 80);
  const head600 = html.slice(0, 600);
  const head1500 = html.slice(0, 1500);
  const head2000 = html.slice(0, 2000);
  const head4000 = html.slice(0, 4000);

  const doctypeLower = head80.includes("<!doctype html>") ? 1.0 : 0.0;
  const doctypeUpper = head80.includes("<!DOCTYPE html>") ? 1.0 : 0.0;
  const metaSelfClose = /<meta\b[^>]*\/>/.test(head600) ? 1.0 : 0.0;
  const metaThemeColor = /name=["']theme-color["']/i.test(head1500) ? 1.0 : 0.0;
  const metaDesc = /name=["']description["']/i.test(head1500) ? 1.0 : 0.0;
  const headZeroIndent = /<head>\n<meta/i.test(head600) ? 1.0 : 0.0;
  const headTwoIndent = /<head>\n  <meta/i.test(head600) ? 1.0 : 0.0;
  const headFourIndent = /<head>\n    <meta/i.test(head600) ? 1.0 : 0.0;
  const hasTailwindCdn = head2000.includes("tailwindcss") ? 1.0 : 0.0;

  const hasRootVars = countMatches(html, /--[a-zA-Z0-9_-]+\s*:/g);
  const hasColorScheme = html.includes("color-scheme:") ? 1.0 : 0.0;
  const hasPaperInk = (html.includes("--paper") || html.includes("--ink")) ? 1.0 : 0.0;
  const hasUiVars = (
    html.includes("--ui-bg") ||
    html.includes("--panel-bg") ||
    html.includes("--bg-from") ||
    html.includes("--bg-top")
  ) ? 1.0 : 0.0;
  const hasBackdrop = html.includes("backdrop-filter") ? 1.0 : 0.0;
  const hasUserSelect = (html.includes("user-select: none") || html.includes("user-select:none")) ? 1.0 : 0.0;
  const cssColonNospace = countMatches(head4000, /[a-z-]+:[#0-9a-zA-Z]/g);
  const cssColonSpace = countMatches(head4000, /[a-z-]+:\s+[#0-9a-zA-Z]/g);
  const colonNospaceRatio = cssColonNospace / Math.max(cssColonNospace + cssColonSpace, 1);

  const comments = [];
  const cmtRe = /<!--([\s\S]*?)-->/g;
  let cm;
  while ((cm = cmtRe.exec(html)) !== null) comments.push(cm[1]);
  const nComments = comments.length;
  let bannerEq = 0;
  let sentencePeriodComments = 0;
  let cjkComments = 0;
  for (const c of comments) {
    if (c.includes("===") || c.includes("---") || c.includes("\u2500\u2500\u2500")) bannerEq++;
    const cs = c.trim();
    if (cs.endsWith(".") && cs.includes(" ")) sentencePeriodComments++;
    if (/[\u4e00-\u9fff]/.test(c)) cjkComments++;
  }

  const svgCount = countMatches(html, /<svg[\s>]/gi);
  let mainW = 800.0;
  let mainH = 600.0;
  const vbRe = /viewBox=["']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/g;
  let bestArea = -1.0;
  let vm;
  while ((vm = vbRe.exec(html)) !== null) {
    const wf = parseFloat(vm[1]);
    const hf = parseFloat(vm[2]);
    if (wf * hf > bestArea) {
      bestArea = wf * hf;
      mainW = wf;
      mainH = hf;
    }
  }
  const aspect = mainW / Math.max(mainH, 1.0);
  const vbIs800x500 = (Math.abs(mainW - 800.0) < 5.0 && Math.abs(mainH - 500.0) < 5.0) ? 1.0 : 0.0;
  const vbIs900Wide = Math.abs(mainW - 900.0) < 5.0 ? 1.0 : 0.0;
  const vbIs1200Plus = mainW >= 1150.0 ? 1.0 : 0.0;

  const nPath = countMatches(html, /<path[\s>]/gi);
  const nCircle = countMatches(html, /<circle[\s>]/gi);
  const nEllipse = countMatches(html, /<ellipse[\s>]/gi);
  const nRect = countMatches(html, /<rect[\s>]/gi);
  const nLine = countMatches(html, /<line[\s>]/gi);
  const nPoly = countMatches(html, /<(?:polygon|polyline)[\s>]/gi);
  const nG = countMatches(html, /<g[\s>]/gi);
  const nShapes = Math.max(nPath + nCircle + nEllipse + nRect + nLine + nPoly, 1);

  const nLgrad = countMatches(html, /<linearGradient[\s>]/gi);
  const nRgrad = countMatches(html, /<radialGradient[\s>]/gi);
  const nFilter = countMatches(html, /<filter[\s>]/gi);
  const nClip = countMatches(html, /<clipPath[\s>]/gi);
  const hasUserspaceGrad = html.includes("userSpaceOnUse") ? 1.0 : 0.0;

  const dChunks = [];
  const dRe = /\sd=["']([^"']+)["']/g;
  let dm;
  while ((dm = dRe.exec(html)) !== null) dChunks.push(dm[1]);
  const dJoined = dChunks.join(" ");
  const cmdMSpace = countMatches(dJoined, /M\s+[-0-9]/g);
  const cmdMTight = countMatches(dJoined, /M[-0-9]/g);
  const mSpaceRatio = cmdMSpace / Math.max(cmdMSpace + cmdMTight, 1);

  const commaPairs = countMatches(dJoined, /\d,\s*-?\d/g);
  const spacePairs = countMatches(dJoined, /\d\s+-?\d/g);
  const commaRatio = commaPairs / Math.max(commaPairs + spacePairs, 1);

  const nCubic = countMatches(dJoined, /[CcSs]/g);
  const nQuad = countMatches(dJoined, /[QqTt]/g);
  const nArc = countMatches(dJoined, /[Aa]/g);
  const nRelCmd = countMatches(dJoined, /[mcqlsta]/g);
  const nAbsCmd = countMatches(dJoined, /[MCQLSTA]/g);
  const relCmdRatio = nRelCmd / Math.max(nRelCmd + nAbsCmd, 1);

  const hasRaf = html.includes("requestAnimationFrame") ? 1.0 : 0.0;
  const hasSmil = /<animate(?:Transform|Motion)?[\s>]/i.test(html) ? 1.0 : 0.0;
  const nKeyframes = countMatches(html, /@keyframes\s/g);
  const hasIkTrig = (html.includes("Math.atan2") || html.includes("Math.acos")) ? 1.0 : 0.0;
  const hasStrict = (html.includes('"use strict"') || html.includes("'use strict'")) ? 1.0 : 0.0;
  const hasConstArrow = countMatches(html, /=>/g);
  const nButtons = countMatches(html, /<button[\s>]/gi);
  const hasAudio = (html.includes("AudioContext") || html.includes("webkitAudioContext")) ? 1.0 : 0.0;

  const hexUpper = countMatches(html, /#[0-9A-F]{6}(?![0-9A-Za-z])/g);
  const hexLower = countMatches(html, /#[0-9a-f]{6}(?![0-9A-Za-z])/g);
  const hexUpperRatio = hexUpper / Math.max(hexUpper + hexLower, 1);

  const hasH1 = /<h1[\s>]/i.test(html) ? 1.0 : 0.0;
  const hasClampVw = /clamp\([^)]*vw/.test(html) ? 1.0 : 0.0;
  const hasStarM0P0Bb = /\*\s*\{\s*margin:\s*0;\s*padding:\s*0;\s*box-sizing:\s*border-box/.test(head4000) ? 1.0 : 0.0;
  const hasHtmlBodyRule = /html,\s*body\s*\{/.test(head4000) ? 1.0 : 0.0;
  const hasFillBox = html.includes("fill-box") ? 1.0 : 0.0;
  const hasLinearInf = /linear\s+infinite/.test(html) ? 1.0 : 0.0;
  const hasVp10 = head1500.includes("initial-scale=1.0") ? 1.0 : 0.0;
  const hasVp1Int = /initial-scale=1['",\s]/.test(head1500) ? 1.0 : 0.0;
  const hasTmplPathMl = /\x60M\s*\$\{/.test(html) ? 1.0 : 0.0;
  const hasMathHypot = html.includes("Math.hypot") ? 1.0 : 0.0;
  const hasMathAcos = html.includes("Math.acos") ? 1.0 : 0.0;
  const hasIkJointConsts = /\b(?:WHEEL_R|HIP|SHIN|THIGH|CRANK_R|BB)\b/.test(html) ? 1.0 : 0.0;
  const hasStopOpacity = html.includes("stop-opacity=") ? 1.0 : 0.0;
  const hasMuseAmber = /#(?:ff9f1c|f77f00|fcbf49)/i.test(html) ? 1.0 : 0.0;
  const hasSetAttrD = /setAttribute\(\s*['"]d['"]/.test(html) ? 1.0 : 0.0;

  return {
    dense: [
      Math.log(nChars), Math.log(nLines), nChars / nLines,
      doctypeLower, doctypeUpper, metaSelfClose, metaThemeColor, metaDesc,
      headZeroIndent, headTwoIndent, headFourIndent, hasTailwindCdn,
      Math.log1p(hasRootVars), hasColorScheme, hasPaperInk, hasUiVars,
      hasBackdrop, hasUserSelect, colonNospaceRatio,
      Math.log1p(nComments), (nComments / nLines) * 100.0,
      Math.log1p(bannerEq), Math.log1p(sentencePeriodComments), cjkComments / Math.max(nComments, 1),
      Math.min(svgCount, 5) / 5.0, Math.log(Math.max(mainW, 100.0)), Math.log(Math.max(mainH, 100.0)), aspect,
      vbIs800x500, vbIs1200Plus, Math.log1p(nShapes),
      nPath / nShapes, (nCircle + nEllipse) / nShapes, nRect / nShapes, nLine / nShapes,
      Math.log1p(nG), Math.log1p(nLgrad + nRgrad), Math.log1p(nFilter + nClip), hasUserspaceGrad,
      mSpaceRatio, commaRatio, Math.log1p(nCubic), Math.log1p(nQuad),
      nCubic / Math.max(nCubic + nQuad, 1), Math.log1p(nArc), relCmdRatio,
      hasRaf, hasSmil, Math.log1p(nKeyframes), hasIkTrig, hasStrict,
      Math.log1p(hasConstArrow), Math.log1p(nButtons), hasAudio, hexUpperRatio,
      hasH1, hasClampVw, hasStarM0P0Bb, hasHtmlBodyRule,
      Math.log1p(nEllipse), nEllipse / nShapes, vbIs900Wide,
      hasFillBox, hasLinearInf, hasVp10, hasVp1Int,
      hasTmplPathMl, hasMathHypot, hasMathAcos, hasIkJointConsts,
      hasStopOpacity, hasMuseAmber + 0.5 * hasSetAttrD
    ],
    diagnostics: {
      bytes: nChars,
      lines: nLines,
      comments: nComments,
      bannerComments: bannerEq,
      sentenceComments: sentencePeriodComments,
      svgShapes: nShapes,
      nEllipse,
      nPath,
      gradients: nLgrad + nRgrad,
      filters: nFilter + nClip,
      viewBox: `${Math.round(mainW)}×${Math.round(mainH)}`,
      metaSelfClose: !!metaSelfClose,
      headZeroIndent: !!headZeroIndent,
      headTwoIndent: !!headTwoIndent,
      hasTailwindCdn: !!hasTailwindCdn,
      hasThemeColor: !!metaThemeColor,
      hasPaperInk: !!hasPaperInk,
      hasUiVars: !!hasUiVars,
      colonNospaceRatio,
      hexUpper,
      hexLower,
      hexUpperRatio,
      hasH1: !!hasH1,
      hasClampVw: !!hasClampVw,
      hasStarM0P0Bb: !!hasStarM0P0Bb,
      hasHtmlBodyRule: !!hasHtmlBodyRule,
      hasFillBox: !!hasFillBox,
      hasLinearInf: !!hasLinearInf,
      hasVp10: !!hasVp10,
      hasVp1Int: !!hasVp1Int,
      hasTmplPathMl: !!hasTmplPathMl,
      hasMathHypot: !!hasMathHypot,
      hasMathAcos: !!hasMathAcos,
      hasIkJointConsts: !!hasIkJointConsts,
      hasStopOpacity: !!hasStopOpacity,
      hasMuseAmber: !!hasMuseAmber,
      hasRaf: !!hasRaf,
      hasSmil: !!hasSmil,
      keyframes: nKeyframes,
      hasIkTrig: !!hasIkTrig
    }
  };
}

function extractStructuralTokens(rawHtml) {
  const tokens = [];
  const html = stripCfChallenge(rawHtml).replace(/\r\n/g, "\n");
  const lines = html.split("\n");
  const head1200 = html.slice(0, 1200);
  const head4000 = html.slice(0, 4000);

  if (head1200.includes("><meta")) tokens.push("ADJ:TAG_TIGHT_META");
  if (head1200.includes("width=device-width,initial-scale=1")) tokens.push("VP:NO_SPACE_COMMA");
  if (head1200.includes("width=device-width, initial-scale=1.0")) tokens.push("VP:SPACE_1_0");
  if (head1200.includes('width=device-width, initial-scale=1"') || head1200.includes("width=device-width, initial-scale=1'")) {
    tokens.push("VP:SPACE_1_INT");
  }
  if (html.includes("<output")) tokens.push("HTML:HAS_OUTPUT_TAG");
  if (html.includes("<main")) tokens.push("HTML:HAS_MAIN_TAG");
  if (html.includes("<header")) tokens.push("HTML:HAS_HEADER_TAG");
  if (html.includes("<footer")) tokens.push("HTML:HAS_FOOTER_TAG");
  if (html.includes("aria-pressed")) tokens.push("HTML:ARIA_PRESSED");
  if (html.includes('type="range"') || html.includes("type='range'")) tokens.push("HTML:INPUT_RANGE");

  const hexUp = countMatches(html, /#[0-9A-F]{6}(?![0-9A-Za-z])/g);
  const hexLo = countMatches(html, /#[0-9a-f]{6}(?![0-9A-Za-z])/g);
  if (hexUp >= 5 && hexUp > hexLo) tokens.push("HEX:UPPER_DOMINANT");
  if (hexLo >= 5 && hexUp === 0) tokens.push("HEX:LOWER_STRICT");
  if (/<h1[\s>]/i.test(html)) tokens.push("HTML:HAS_H1");
  if (/clamp\([^)]*vw/.test(html)) tokens.push("CSS_FMT:CLAMP_VW");
  if (/\*\s*\{\s*margin:\s*0;\s*padding:\s*0;\s*box-sizing:\s*border-box/.test(head4000)) {
    tokens.push("CSS_RESET:STAR_M0_P0_BB");
  }
  if (/html,\s*body\s*\{/.test(head4000)) tokens.push("CSS_OPEN:HTML_BODY");
  if (head4000.includes("display:flex")) tokens.push("CSS_NOSP:DISPLAY_FLEX");
  if (head4000.includes("min-height:100vh")) tokens.push("CSS_NOSP:MIN_H_100VH");
  if (head4000.includes("box-sizing:border-box")) tokens.push("CSS_NOSP:BOX_SIZING_BB");
  if (head4000.includes("box-shadow:0")) tokens.push("CSS_NOSP:BOX_SHADOW_0");
  if (head4000.includes("height:auto")) tokens.push("CSS_NOSP:HEIGHT_AUTO");
  if (countMatches(html, /<ellipse[\s>]/gi) >= 8) tokens.push("SVG_GEOM:ELLIPSE_HEAVY");
  if (/linear\s+infinite/.test(html)) tokens.push("CSS_ANIM:LINEAR_INFINITE");
  if (html.includes("Math.hypot") && html.includes("Math.acos") && html.includes("Math.atan2")) {
    tokens.push("JS_IK:COSINE_LAW_TRIO");
  }
  if (/#(?:ff9f1c|f77f00|fcbf49)/i.test(html)) tokens.push("PAL:MUSE_WARM_AMBER");

  let prevHtok = "START";
  for (const line of lines.slice(0, 35)) {
    if (!line.trim()) {
      tokens.push("H_BLANK");
      continue;
    }
    const lstripped = line.replace(/^ +/, "");
    const indent = line.length - lstripped.length;
    const indTok = line.slice(0, 4).includes("\t") ? "IND_TAB" : `IND_${Math.min(indent, 12)}`;
    const s = line.trim();
    let htok = null;
    if (s.startsWith("<!DOCTYPE html>")) htok = `${indTok}:DOCTYPE_UP`;
    else if (s.toLowerCase().startsWith("<!doctype html>")) htok = `${indTok}:DOCTYPE_LOW`;
    else if (s.startsWith("<html")) {
      const lm = s.match(/lang=["']([^"']+)["']/);
      htok = `${indTok}:HTML_LANG_${lm ? lm[1] : "NONE"}`;
    } else if (s.startsWith("<head>")) htok = `${indTok}:HEAD`;
    else if (s.startsWith("<meta")) {
      const sc = s.endsWith(" />") ? "SP_SC" : (s.endsWith("/>") ? "SC" : "NOSC");
      const sl = s.toLowerCase();
      if (sl.includes("charset") && sl.includes("viewport")) {
        htok = `${indTok}:META_DOUBLE_INLINE_${sc}`;
      } else if (sl.includes("charset")) {
        const csC = s.includes("UTF-8") ? "UTF8_UP" : "UTF8_LOW";
        htok = `${indTok}:META_CHARSET_${csC}_${sc}`;
      } else if (sl.includes("viewport")) {
        const init10 = s.includes("1.0") ? "1.0" : "1";
        htok = `${indTok}:META_VP_${init10}_${sc}`;
      } else if (sl.includes("theme-color")) {
        htok = `${indTok}:META_THEME_${sc}`;
      } else if (sl.includes("description")) {
        htok = `${indTok}:META_DESC_${sc}`;
      }
    } else if (s.startsWith("<style")) htok = `${indTok}:STYLE_OPEN`;
    else if (s.startsWith(":root")) htok = `${indTok}:CSS_ROOT`;
    else if (s.startsWith("* {") || s.startsWith("*{")) {
      htok = `${indTok}:CSS_STAR_${s.startsWith("*{") ? "TIGHT" : "SP"}`;
    } else if (s.startsWith("html, body") || s.startsWith("html,body")) htok = `${indTok}:CSS_HTML_BODY`;
    else if (s.startsWith("body {") || s.startsWith("body{")) htok = `${indTok}:CSS_BODY_ONLY`;

    if (htok) {
      tokens.push(htok);
      tokens.push(`HBIG:${prevHtok}->${htok}`);
      prevHtok = htok;
    }
  }

  const styleChunks = [];
  const stRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = stRe.exec(html)) !== null) styleChunks.push(sm[1]);
  const styleBlocks = styleChunks.join("\n");

  if (styleBlocks) {
    const styleLines = styleBlocks.trim().split("\n");
    if (styleLines.length <= 5 && styleBlocks.length > 400) tokens.push("CSS_FMT:MINIFIED_LINES");
    else if (styleLines.length > 80) tokens.push("CSS_FMT:EXPANDED_LONG");
    if (/#[0-9a-fA-F]{8}(?![0-9a-zA-Z])/.test(styleBlocks)) tokens.push("CSS_FMT:HEX8_ALPHA");
    if (/#[0-9a-fA-F]{3}(?![0-9a-zA-Z])/.test(styleBlocks)) tokens.push("CSS_FMT:HEX3_SHORT");
    if (/[^0-9]\.\d+(?:em|rem|px|s|%)/.test(styleBlocks)) tokens.push("CSS_FMT:NO_LEADING_ZERO");
    if (styleBlocks.includes("}{")) tokens.push("CSS_FMT:TIGHT_BRACES");
  }

  const propRe = /(?:^|[\s{;])([a-z-]{3,28})\s*:/gm;
  let pm;
  while ((pm = propRe.exec(styleBlocks)) !== null) {
    if (pm[1] !== "content") tokens.push(`CSS_P:${pm[1]}`);
  }

  const varRe = /--([a-zA-Z0-9]+)(?:-[a-zA-Z0-9]+)*\s*:/g;
  let vrm;
  while ((vrm = varRe.exec(styleBlocks)) !== null) {
    const stem = vrm[1].toLowerCase();
    if (UI_VAR_STEMS.has(stem)) tokens.push(`CSS_VAR:${stem}`);
  }

  for (const fnTok of CSS_FNS) {
    if (styleBlocks.includes(fnTok)) tokens.push(`CSS_FN:${fnTok}`);
  }

  const vbRe = /viewBox=["']\s*-?\d+\s+-?\d+\s+(\d+)\s+(\d+)\s*["']/g;
  let vbm;
  while ((vbm = vbRe.exec(html)) !== null) {
    tokens.push(`VB:${vbm[1]}x${vbm[2]}`);
    tokens.push(`VB_RATIO:${(parseInt(vbm[1], 10) / Math.max(parseInt(vbm[2], 10), 1)).toFixed(1)}`);
  }

  const tagRe = /<(svg|defs|linearGradient|radialGradient|stop|filter|feDropShadow|feGaussianBlur|feMerge|feColorMatrix|feTurbulence|clipPath|mask|pattern|g|path|circle|ellipse|rect|line|polyline|polygon|use|text|animate|animateTransform|animateMotion)(?=[\s>/])/g;
  let tm;
  while ((tm = tagRe.exec(html)) !== null) tokens.push(`SVG_T:${tm[1]}`);

  for (const svgAttr of SVG_ATTRS_LIST) {
    const cnt = countSubstr(html, svgAttr);
    if (cnt > 0) {
      tokens.push(`SVG_A:${svgAttr}`);
      if (cnt >= 10) tokens.push(`SVG_A_HI:${svgAttr}`);
    }
  }

  const dList = [];
  const dAttrRe = /\sd=["']([^"']+)["']/g;
  let dam;
  while ((dam = dAttrRe.exec(html)) !== null && dList.length < 50) dList.push(dam[1]);
  for (const d of dList) {
    if (/M\s+\d/.test(d)) tokens.push("PATH:M_SP");
    else if (/M-?\d/.test(d)) tokens.push("PATH:M_TIGHT");
    if (/[a-z]\d/.test(d)) tokens.push("PATH:REL_TIGHT");
    if (d.includes(",")) tokens.push("PATH:COMMA");
    else tokens.push("PATH:SPACE_ONLY");
  }

  const cmtRe = /<!--([\s\S]*?)-->/g;
  let cm;
  while ((cm = cmtRe.exec(html)) !== null) {
    const cs = cm[1].trim();
    if (cs.includes("===")) tokens.push("CMT:EQ_BANNER");
    else if (cs.includes("---")) tokens.push("CMT:DASH_BANNER");
    else if (cs.includes("\u2500\u2500\u2500") || cs.includes("\u2550\u2550\u2550")) tokens.push("CMT:BOX_BANNER");
    if (/^\d+[.)]\s/.test(cs)) tokens.push("CMT:NUMBERED");
    if (cs.endsWith(".") && cs.includes(" ")) tokens.push("CMT:SENTENCE_DOT");
    if (/[\u4e00-\u9fff]/.test(cs)) tokens.push("CMT:HAS_CJK");
    if (/^[A-Z][A-Z0-9\s/&:-]{3,}$/.test(cs)) tokens.push("CMT:ALL_CAPS");
    if (/^[A-Z][a-z]+(?:\s+[A-Z&][a-z]*)+$/.test(cs)) tokens.push("CMT:TITLE_CASE");
  }

  const scrChunks = [];
  const scRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scm;
  while ((scm = scRe.exec(html)) !== null) scrChunks.push(scm[1]);
  const scriptBlocks = scrChunks.join("\n");

  if (scriptBlocks.trim()) {
    tokens.push("HAS_SCRIPT");
    const scLines = scriptBlocks.trim().split("\n");
    if (scLines.length <= 5 && scriptBlocks.length > 300) tokens.push("JS_FMT:MINIFIED_SINGLE_BLOCK");
    for (const [name, pat] of JS_PATS) {
      const cnt = countMatches(scriptBlocks, pat);
      if (cnt > 0) {
        tokens.push(name);
        if (cnt >= 8) tokens.push(`${name}_MANY`);
      }
    }
  } else {
    tokens.push("NO_SCRIPT_PURE_SVG");
  }

  return tokens;
}

function evalLinearClf(clf, x) {
  if (clf.binary) {
    let z = clf.b;
    const w = clf.w;
    for (let i = 0; i < w.length; i++) z += w[i] * x[i];
    const p1 = 1.0 / (1.0 + Math.exp(-Math.max(-40, Math.min(40, z))));
    return { [clf.classes[0]]: 1.0 - p1, [clf.classes[1]]: p1 };
  }
  const logits = clf.b.map((bVal, row) => {
    let s = bVal;
    const wRow = clf.W[row];
    for (let i = 0; i < wRow.length; i++) s += wRow[i] * x[i];
    return s;
  });
  const maxL = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - maxL));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1.0;
  const out = {};
  clf.classes.forEach((cls, idx) => { out[cls] = exps[idx] / sumExp; });
  return out;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256HexSync(text) {
  const bytes = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(String(text || ""))
    : Uint8Array.from(unescape(encodeURIComponent(String(text || ""))), (c) => c.charCodeAt(0));
  const len = bytes.length;
  const bitHi = Math.floor((len * 8) / 0x100000000);
  const bitLo = (len * 8) >>> 0;
  const padLen = ((len + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, bitHi, false);
  dv.setUint32(padLen - 4, bitLo, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x15 = w[i - 15], x2 = w[i - 2];
      const s0 = ((x15 >>> 7) | (x15 << 25)) ^ ((x15 >>> 18) | (x15 << 14)) ^ (x15 >>> 3);
      const s1 = ((x2 >>> 17) | (x2 << 15)) ^ ((x2 >>> 19) | (x2 << 13)) ^ (x2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
}

async function sha256Hex(text) {
  return sha256HexSync(text);
}

function prepareProfileIndex(profiles) {
  if (!profiles._tok2idx) {
    const map = new Map();
    profiles.vocab.forEach((t, idx) => map.set(t, idx));
    profiles._tok2idx = map;
  }
  return profiles._tok2idx;
}

function buildClaudeVsMuseSignals(diag) {
  const signals = [];
  if (diag.hexUpper >= 5 && diag.hexUpperRatio > 0.5) {
    signals.push({
      side: "muse",
      tag: `大写 Hex 色值 (#ABCDEF · ${(diag.hexUpperRatio * 100).toFixed(0)}%)`,
      detail: "Muse Spark 约 65% 样本偏好大写十六进制色值，Claude 5.x 97% 严格使用小写色值"
    });
  } else if (diag.hexLower >= 5 && diag.hexUpper === 0) {
    signals.push({
      side: "claude",
      tag: "全篇严格小写 Hex 色值 (#abcdef)",
      detail: `共 ${diag.hexLower} 处六位色值 100% 为小写（Claude 5.x 稳定词表习惯）`
    });
  }

  if (diag.hasStarM0P0Bb) {
    signals.push({
      side: "muse",
      tag: "* { margin:0; padding:0; box-sizing:border-box }",
      detail: "命中 Muse 标准三联盒模型重置顺序"
    });
  } else if (diag.hasHtmlBodyRule && !diag.hasH1) {
    signals.push({
      side: "claude",
      tag: "html, body 全画幅直出画布（无 <h1> 外框）",
      detail: "Claude 5.x 84% 样本以 html, body 满屏承载 SVG，不包裹标题卡片"
    });
  }

  if (diag.hasH1 || diag.hasClampVw) {
    signals.push({
      side: "muse",
      tag: `${diag.hasH1 ? "<h1> 标题外框" : ""}${diag.hasH1 && diag.hasClampVw ? " + " : ""}${diag.hasClampVw ? "clamp(...vw) 流体字号" : ""}`,
      detail: "Muse 88.5% 样本在 SVG 外层渲染 <h1> 标题与视口流体排版"
    });
  }

  if (diag.colonNospaceRatio >= 0.42) {
    signals.push({
      side: "muse",
      tag: `紧凑无空格 CSS 键值 (${(diag.colonNospaceRatio * 100).toFixed(0)}% prop:val)`,
      detail: "检测到 display:flex / min-height:100vh 等冒号后无空格写法"
    });
  } else if (diag.colonNospaceRatio <= 0.08) {
    signals.push({
      side: "claude",
      tag: "标准单空格 CSS 键值 (prop: val)",
      detail: "全篇 CSS 属性冒号后保持标准单空格排布"
    });
  }

  if (diag.hasTmplPathMl || (diag.hasMathHypot && diag.hasMathAcos && diag.hasIkTrig)) {
    signals.push({
      side: "claude",
      tag: "JS 双骨骼余弦定理 IK + `M${} L${}` 动态路径",
      detail: "使用 Math.hypot / Math.acos / Math.atan2 逐帧解算关节角度并拼接路径"
    });
  } else if (diag.hasLinearInf && diag.hasFillBox) {
    signals.push({
      side: "muse",
      tag: "CSS @keyframes linear infinite + fill-box",
      detail: "依赖 CSS 关键帧与 fill-box 原点驱动车轮/云朵循环运动"
    });
  }

  if (diag.nEllipse >= 8) {
    signals.push({
      side: "muse",
      tag: `高频 <ellipse> 椭圆建模 (${diag.nEllipse} 个椭圆图元)`,
      detail: "Muse 80.8% 样本大量使用 <ellipse> 构建躯干/云朵，Claude 偏好贝塞尔 <path>"
    });
  } else if (diag.hasStopOpacity) {
    signals.push({
      side: "claude",
      tag: "显式 SVG stop-opacity 渐变透明属性",
      detail: "在渐变节点显式声明 stop-opacity 属性（Claude 52.6% vs Muse 7.7%）"
    });
  }

  if (diag.hasMuseAmber) {
    signals.push({
      side: "muse",
      tag: "命中 Muse 暖琥珀色板 (#FF9F1C / #F77F00)",
      detail: "喙部/喉囊采用 Muse 高频暖橙配色"
    });
  }

  return signals.slice(0, 5);
}

function buildEvidenceChain(diag, exactSpecimen, blindTopModel, claudeVsMuse, effortCal) {
  const ev = [];
  if (exactSpecimen) {
    ev.push(`样本库精确匹配：与基准样本 ${exactSpecimen.id} (${exactSpecimen.origName || exactSpecimen.file}) 一致，登记型号 ${exactSpecimen.displayModel} [${exactSpecimen.tier.toUpperCase()}]`);
  }
  if (blindTopModel) {
    ev.push(`独立语法指纹直判：83 款细分模型库最高得分为 ${blindTopModel.label} (${(blindTopModel.probability * 100).toFixed(1)}%)`);
  }
  if (effortCal) {
    ev.push(`模型自适应强度标尺：综合复杂度 ${effortCal.effortIndex.toFixed(2)}，对照 ${effortCal.referenceModel} 四档基准 [LOW ${effortCal.anchors.low.toFixed(2)} · MED ${effortCal.anchors.medium.toFixed(2)} · HIGH ${effortCal.anchors.high.toFixed(2)} · MAX ${effortCal.anchors.max.toFixed(2)}]`);
  }
  if (claudeVsMuse && claudeVsMuse.active) {
    const winLabel = claudeVsMuse.winner === "claude" ? "Anthropic Claude 5.x" : "Meta Muse Spark";
    const winPct = ((claudeVsMuse.winner === "claude" ? claudeVsMuse.claudeProb : claudeVsMuse.museProb) * 100).toFixed(1);
    ev.push(`Claude vs Muse 专项对抗裁决：${winLabel} 胜出 (${winPct}%)`);
  }
  if (diag.metaSelfClose && diag.headTwoIndent) {
    ev.push("检测到 2 空格缩进 + XHTML 自闭合 <meta ... /> 头结构（Gemini 4 Argon / Carbon 标志特征）");
  }
  if (diag.headZeroIndent && !diag.metaSelfClose) {
    ev.push("检测到 <head> 内零缩进且无自闭合斜杠的 <meta charset> 排版（Claude 5.x / OpenAI Codex 高频指纹）");
  }
  if (diag.hasTailwindCdn) {
    ev.push("检测到外部 Tailwind CSS 运行时引用（Gemini 4 Argon 交互面板常见特征）");
  }
  if (diag.hasThemeColor || diag.hasPaperInk) {
    ev.push("检测到 color-scheme 或 --paper/--ink 变量体系（OpenAI GPT-6 Sol / Luna / Astra 典型风格）");
  }
  if (diag.comments >= 55) {
    ev.push(`高密度分节注释（共 ${diag.comments} 条注释，Gemini 4 高强度档显著特征）`);
  } else if (diag.bannerComments >= 4) {
    ev.push(`包含 ${diag.bannerComments} 处对称分隔横幅注释（Claude Opus 5.5 结构化分区习惯）`);
  }
  ev.push(`画布 ${diag.viewBox} · 矢量图元 ${diag.svgShapes} 个（椭圆 ${diag.nEllipse}）· 渐变/滤镜 ${diag.gradients + diag.filters} 组 · 体积 ${(diag.bytes / 1024).toFixed(1)} KB (${diag.lines} 行)`);
  return ev;
}

function isPureSvgText(rawText) {
  const s = String(rawText || "");
  return !/<(?:!doctype|html|body|script)\b/i.test(s) && /<svg[\s>]/i.test(s);
}

const TOP6_META = {
  "claude-opus-5.5": { arenaRank: 1, rarity: "gold" },
  "gpt-6.1-sol": { arenaRank: 2, rarity: "gold" },
  "gemini-4-carbon": { arenaRank: 3, rarity: "gold" },
  "gemini-4-argon": { arenaRank: 4, rarity: "silver" },
  "gpt-6-astra": { arenaRank: 5, rarity: "silver" },
  "claude-fable-5.1": { arenaRank: 6, rarity: "silver" }
};

function computeModelCalibratedEffort(text, profiles, blindSortedModels, refs, sims, maxSim) {
  const eff = extractEffortComplexity(text);
  const em = profiles.effortModel;
  if (!em || !profiles.classifiers.effortRelative4) {
    const fallback = evalLinearClf(profiles.classifiers.effortTier4, new Float64Array(profiles.vocab.length + 72));
    return { tierProbsMap: fallback, calibration: null };
  }

  const inputIsSvg = isPureSvgText(text);
  const smAncMap = inputIsSvg ? (em.svgSubModelAnchors || em.subModelAnchors) : em.subModelAnchors;
  const venAncMap = inputIsSvg ? (em.svgVendorAnchors || em.vendorAnchors) : em.vendorAnchors;
  const glbAnc = inputIsSvg ? (em.svgGlobalAnchors || em.globalAnchors) : em.globalAnchors;

  // 1. Weighted sub-model monotonic anchors across Top-3 candidate sub-models
  const top3 = blindSortedModels.slice(0, 3);
  let wSum = 0.0;
  const blendedAnchors = [0, 0, 0, 0];
  for (const m of top3) {
    const w = Math.max(m.probability, 0.02);
    const anc = smAncMap?.[m.id] || venAncMap?.[m.vendor] || glbAnc;
    for (let k = 0; k < 4; k++) blendedAnchors[k] += w * anc[k];
    wSum += w;
  }
  for (let k = 0; k < 4; k++) blendedAnchors[k] /= (wSum || 1.0);

  // Signal A: Monotonic Thermometer Gaussian Likelihood around sub-model anchors
  const pTherm = [0, 0, 0, 0];
  let thermSum = 0.0;
  for (let k = 0; k < 4; k++) {
    const d = eff.effortIdx - blendedAnchors[k];
    const v = Math.exp(-(d * d) / (2.0 * 0.21 * 0.21));
    pTherm[k] = v;
    thermSum += v;
  }
  for (let k = 0; k < 4; k++) pTherm[k] /= (thermSum || 1.0);

  // Signal B: Same-SubModel / Same-Vendor Complexity + 96-D SVD Exemplar Tier Kernel
  const topSmId = top3[0]?.id || "";
  const topVendor = top3[0]?.vendor || "";
  const knn = [0, 0, 0, 0];
  const eStd = em.eStd || [];
  let minSameD2 = 999.0;
  for (let j = 0; j < refs.length; j++) {
    const sp = refs[j];
    if (Boolean(sp.isSvg) !== inputIsSvg && sims[j] < 0.95) continue;
    if (!sp.tierExplicit && maxSim < 0.95) continue;
    const spEv = sp.effortVec;
    let d2 = 0.0;
    if (spEv && spEv.length === eff.vec.length) {
      for (let d = 0; d < eff.vec.length; d++) {
        const zDiff = (eff.vec[d] - spEv[d]) / (eStd[d] || 0.5);
        d2 += zDiff * zDiff;
      }
      d2 /= eff.vec.length;
    } else {
      const idxDiff = (eff.effortIdx - (sp.effortIdx || 7.5)) / 0.45;
      d2 = idxDiff * idxDiff;
    }

    const cosSim = sims[j];
    const tOrd = TIER_ORD[sp.tier] ?? 2;
    if (cosSim >= 0.95 && d2 < 0.08) {
      if (d2 < minSameD2) minSameD2 = d2;
      knn[tOrd] += Math.exp((cosSim - maxSim) * 55.0 - 4.0 * d2) * (sp.subModelId === topSmId ? 40.0 : 10.0);
    } else if (sp.subModelId === topSmId) {
      knn[tOrd] += Math.exp(-2.2 * d2 + 4.0 * (cosSim - maxSim)) * 4.5;
    } else if (sp.vendor === topVendor) {
      knn[tOrd] += Math.exp(-2.2 * d2 + 2.5 * (cosSim - maxSim)) * 0.7;
    }
  }
  const knnSum = knn[0] + knn[1] + knn[2] + knn[3];
  const pKnn = knnSum > 0 ? knn.map((v) => v / knnSum) : pTherm;

  // Signal C: Relative Complexity Logistic Classifier (`effortRelative4`)
  const relRaw = [];
  for (let k = 0; k < 4; k++) relRaw.push(eff.effortIdx - blendedAnchors[k]);
  for (let k = 0; k < 4; k++) relRaw.push(Math.abs(eff.effortIdx - blendedAnchors[k]));
  for (let d = 0; d < eff.vec.length; d++) {
    relRaw.push(((eff.vec[d] - (em.eMean[d] || 0)) / (eStd[d] || 1.0)) * 0.30);
  }
  const relStd = new Float64Array(relRaw.length);
  for (let i = 0; i < relRaw.length; i++) {
    relStd[i] = (relRaw[i] - (em.relScalerMean[i] || 0)) / (em.relScalerScale[i] || 1.0);
  }
  const lrMap = evalLinearClf(profiles.classifiers.effortRelative4, relStd);

  const isEditedSibling = maxSim >= 0.95 && minSameD2 < 0.08;
  const wKnn = isEditedSibling ? 0.88 : 0.44;
  const wTherm = isEditedSibling ? 0.08 : 0.44;
  const wLr = 1.0 - wKnn - wTherm;

  const tierProbsMap = {};
  let totP = 0.0;
  for (let k = 0; k < 4; k++) {
    const t = TIERS[k];
    const p = wTherm * pTherm[k] + wKnn * pKnn[k] + wLr * (lrMap[t] || 0.0);
    tierProbsMap[t] = p;
    totP += p;
  }
  for (const t of TIERS) tierProbsMap[t] /= (totP || 1.0);

  const bestK = TIERS.reduce((best, t, idx) => (tierProbsMap[t] > tierProbsMap[TIERS[best]] ? idx : best), 0);
  let withinOne = tierProbsMap[TIERS[bestK]];
  if (bestK > 0) withinOne += tierProbsMap[TIERS[bestK - 1]];
  if (bestK < 3) withinOne += tierProbsMap[TIERS[bestK + 1]];

  const primaryAnchors = smAncMap?.[topSmId] || blendedAnchors;

  return {
    tierProbsMap,
    calibration: {
      effortIndex: Number(eff.effortIdx.toFixed(3)),
      isPureSvg: inputIsSvg,
      referenceModel: top3[0]?.label || "当前模型",
      anchors: {
        low: Number(primaryAnchors[0].toFixed(2)),
        medium: Number(primaryAnchors[1].toFixed(2)),
        high: Number(primaryAnchors[2].toFixed(2)),
        max: Number(primaryAnchors[3].toFixed(2))
      },
      nonBlankLines: eff.meta.nonBlankLines,
      jsLines: eff.meta.jsLines,
      interactiveControls: eff.meta.interactiveControls,
      withinOneTierConfidence: Number(Math.min(1, withinOne).toFixed(4))
    }
  };
}

function computeSpecimenEmbeddingSync(rawHtml, profiles) {
  const text = unwrapCodeInput(rawHtml);
  const tok2idx = prepareProfileIndex(profiles);
  const V = profiles.vocab.length;
  const { dense } = extractDenseFeatures(text);
  const tokens = extractStructuralTokens(text);

  const counts = new Map();
  for (const tok of tokens) {
    const idx = tok2idx.get(tok);
    if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  const xTfidf = new Float64Array(V);
  let normSq = 0.0;
  for (const [idx, cnt] of counts.entries()) {
    const val = (1.0 + Math.log(cnt)) * profiles.idf[idx];
    xTfidf[idx] = val;
    normSq += val * val;
  }
  if (normSq > 0) {
    const inv = 1.0 / Math.sqrt(normSq);
    for (let i = 0; i < V; i++) xTfidf[i] *= inv;
  }

  const D = dense.length;
  const x = new Float64Array(V + D);
  x.set(xTfidf, 0);
  const sf = profiles.denseScaleFactor || 0.14;
  for (let d = 0; d < D; d++) {
    x[V + d] = ((dense[d] - profiles.scalerMean[d]) / (profiles.scalerScale[d] || 1.0)) * sf;
  }

  const svdComp = profiles.svdComponents;
  const K = svdComp.length;
  const z = new Float64Array(K);
  let zNormSq = 0.0;
  for (let k = 0; k < K; k++) {
    const row = svdComp[k];
    let s = 0.0;
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    z[k] = s;
    zNormSq += s * s;
  }
  const zInv = zNormSq > 0 ? 1.0 / Math.sqrt(zNormSq) : 1.0;
  for (let k = 0; k < K; k++) z[k] *= zInv;

  const normRaw = text.replace(/\r\n/g, "\n");
  const sha256 = sha256HexSync(normRaw);
  const cleanedNorm = stripCfChallenge(normRaw).trim().replace(/\s+/g, " ");
  const normSha = sha256HexSync(cleanedNorm);
  const eff = extractEffortComplexity(text);

  return {
    sha256,
    sha24: sha256 ? sha256.slice(0, 24) : "",
    normSha24: normSha ? normSha.slice(0, 24) : "",
    isSvg: isPureSvgText(text),
    effortIdx: Number(eff.effortIdx.toFixed(4)),
    effortVec: eff.vec.map((v) => Number(v.toFixed(4))),
    vec: Array.from(z, (v) => Number(v.toFixed(4)))
  };
}

async function computeSpecimenEmbedding(rawHtml, profiles) {
  return computeSpecimenEmbeddingSync(rawHtml, profiles);
}

function identifyHtmlSync(rawHtml, profiles, overrides = null) {
  const t0 = Date.now();
  const text = unwrapCodeInput(rawHtml);
  if (!text.trim() || text.trim().length < 40) {
    return { error: "源码内容过短，请拖入 .html / .svg 文件或粘贴完整的 HTML / SVG 代码。" };
  }

  const tok2idx = prepareProfileIndex(profiles);
  const V = profiles.vocab.length;
  const { dense, diagnostics } = extractDenseFeatures(text);
  const tokens = extractStructuralTokens(text);

  // 1. TF-IDF + Dense vector x
  const counts = new Map();
  for (const tok of tokens) {
    const idx = tok2idx.get(tok);
    if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  const xTfidf = new Float64Array(V);
  let normSq = 0.0;
  for (const [idx, cnt] of counts.entries()) {
    const val = (1.0 + Math.log(cnt)) * profiles.idf[idx];
    xTfidf[idx] = val;
    normSq += val * val;
  }
  if (normSq > 0) {
    const inv = 1.0 / Math.sqrt(normSq);
    for (let i = 0; i < V; i++) xTfidf[i] *= inv;
  }

  const D = dense.length;
  const x = new Float64Array(V + D);
  x.set(xTfidf, 0);
  const sf = profiles.denseScaleFactor || 0.14;
  for (let d = 0; d < D; d++) {
    x[V + d] = ((dense[d] - profiles.scalerMean[d]) / (profiles.scalerScale[d] || 1.0)) * sf;
  }

  // 2. Project onto 96-D SVD space & score all 424 reference specimens
  const svdComp = profiles.svdComponents;
  const K = svdComp.length;
  const z = new Float64Array(K);
  let zNormSq = 0.0;
  for (let k = 0; k < K; k++) {
    const row = svdComp[k];
    let s = 0.0;
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    z[k] = s;
    zNormSq += s * s;
  }
  const zInv = zNormSq > 0 ? 1.0 / Math.sqrt(zNormSq) : 1.0;
  for (let k = 0; k < K; k++) z[k] *= zInv;

  const deletedSet = new Set(overrides?.deletedIds || []);
  const editMap = overrides?.edits || {};
  const addedRefs = (overrides?.addedItems || [])
    .filter((it) => !deletedSet.has(it.id) && Array.isArray(it.vec) && it.vec.length === K)
    .map((it) => {
      const ed = editMap[it.id] || {};
      return { ...it, ...ed, tierExplicit: true };
    });

  const baseRefs = (profiles.refSpecimens || [])
    .filter((sp) => !deletedSet.has(sp.id))
    .map((sp) => {
      const ed = editMap[sp.id];
      return ed ? { ...sp, ...ed, tierExplicit: true } : sp;
    });

  const refs = [...addedRefs, ...baseRefs];
  const sims = new Float64Array(refs.length);
  let maxSim = -1.0;
  for (let j = 0; j < refs.length; j++) {
    const v = refs[j].vec;
    let dot = 0.0;
    for (let k = 0; k < K; k++) dot += z[k] * v[k];
    sims[j] = dot;
    if (dot > maxSim) maxSim = dot;
  }

  // 3. Check exact or normalized-whitespace archive SHA match (honoring deletes, edits & uploads)
  let exactMatchId = null;
  const normRaw = text.replace(/\r\n/g, "\n");
  const fullSha = sha256HexSync(normRaw);
  const fullShaOrig = text !== normRaw ? sha256HexSync(text) : fullSha;
  const cleanedNorm = stripCfChallenge(normRaw).trim().replace(/\s+/g, " ");
  const normSha = sha256HexSync(cleanedNorm);
  const s24a = fullShaOrig ? fullShaOrig.slice(0, 24) : "";
  const s24b = fullSha ? fullSha.slice(0, 24) : "";
  const n24 = normSha ? normSha.slice(0, 24) : "";

  for (const item of overrides?.addedItems || []) {
    if (deletedSet.has(item.id)) continue;
    if ((item.sha24 && (item.sha24 === s24a || item.sha24 === s24b)) || (item.normSha24 && item.normSha24 === n24)) {
      exactMatchId = item.id;
      break;
    }
  }
  if (!exactMatchId) {
    const candA = s24a && profiles.exactSha24?.[s24a];
    const candB = s24b && profiles.exactSha24?.[s24b];
    const candN = n24 && profiles.normSha24?.[n24];
    const cand = candA || candB || candN || null;
    if (cand && !deletedSet.has(cand)) exactMatchId = cand;
  }

  let exactSpecimen = null;
  if (exactMatchId) {
    exactSpecimen = refs.find((s) => s.id === exactMatchId) || null;
    if (!exactSpecimen && overrides?.addedItems) {
      const rawAdded = overrides.addedItems.find((s) => s.id === exactMatchId);
      if (rawAdded && !deletedSet.has(rawAdded.id)) {
        exactSpecimen = { ...rawAdded, ...(editMap[rawAdded.id] || {}) };
      }
    }
  }

  // 4. Hierarchical Multi-Model Posterior
  const pFineLr = evalLinearClf(profiles.classifiers.fine55, x);
  const pKnn = {};
  let sumExpSim = 0.0;
  const knnSharpness = maxSim > 0.95 ? 48.0 : 18.0;
  const simExps = new Float64Array(refs.length);
  for (let j = 0; j < refs.length; j++) {
    const e = Math.exp((sims[j] - maxSim) * knnSharpness);
    simExps[j] = e;
    sumExpSim += e;
  }
  for (let j = 0; j < refs.length; j++) {
    const smId = refs[j].subModelId;
    pKnn[smId] = (pKnn[smId] || 0.0) + simExps[j] / (sumExpSim || 1.0);
  }

  const subMeta = { ...(profiles.subModelMeta || {}) };
  for (const r of refs) {
    if (r.subModelId && !subMeta[r.subModelId]) {
      const t6 = TOP6_META[r.subModelId] || TOP6_META[r.family] || null;
      subMeta[r.subModelId] = {
        label: r.displayModel || r.subModelId,
        vendor: r.vendor || "other",
        family: r.family || "other",
        priorityGroup: r.priorityGroup || "neither",
        arenaRank: t6 ? t6.arenaRank : null,
        rarity: t6 ? t6.rarity : "normal"
      };
    }
  }
  if (exactSpecimen && exactSpecimen.subModelId && !subMeta[exactSpecimen.subModelId]) {
    const t6 = TOP6_META[exactSpecimen.subModelId] || TOP6_META[exactSpecimen.family] || null;
    subMeta[exactSpecimen.subModelId] = {
      label: exactSpecimen.displayModel || exactSpecimen.subModelId,
      vendor: exactSpecimen.vendor || "other",
      family: exactSpecimen.family || "other",
      priorityGroup: exactSpecimen.priorityGroup || "neither",
      arenaRank: t6 ? t6.arenaRank : null,
      rarity: t6 ? t6.rarity : "normal"
    };
  }
  const subIds = Object.keys(subMeta);
  const wKnnModel = maxSim > 0.92 ? Math.min(0.84, 0.45 + (maxSim - 0.92) * 5.2) : 0.45;
  const wLrModel = 1.0 - wKnnModel;
  const blindSubProbs = {};
  for (const smId of subIds) {
    blindSubProbs[smId] = wLrModel * (pFineLr[smId] || 0.0) + wKnnModel * (pKnn[smId] || 0.0);
  }

  // 5. Dedicated Claude 5.x vs Muse Specialist Recalibration
  let claudeMass = 0.0;
  let museMass = 0.0;
  const claude5SubIds = [];
  const museSubIds = [];
  for (const smId of subIds) {
    const ven = subMeta[smId].vendor || "";
    if (ven === "muse" || smId.includes("muse")) {
      museMass += blindSubProbs[smId] || 0.0;
      museSubIds.push(smId);
    } else if ((ven === "anthropic" || smId.startsWith("claude-")) && !smId.includes("4.")) {
      claudeMass += blindSubProbs[smId] || 0.0;
      claude5SubIds.push(smId);
    }
  }
  const cmTotalMass = claudeMass + museMass;
  let blindClaudeDuelProb = claudeMass / Math.max(cmTotalMass, 1e-6);
  let blindMuseDuelProb = museMass / Math.max(cmTotalMass, 1e-6);

  if (profiles.classifiers.claudeVsMuse) {
    const cmLr = evalLinearClf(profiles.classifiers.claudeVsMuse, x);
    blindClaudeDuelProb = 0.65 * (cmLr["anthropic"] || 0.0) + 0.35 * blindClaudeDuelProb;
    blindMuseDuelProb = 0.65 * (cmLr["muse"] || 0.0) + 0.35 * blindMuseDuelProb;
    const normCm = Math.max(blindClaudeDuelProb + blindMuseDuelProb, 1e-6);
    blindClaudeDuelProb /= normCm;
    blindMuseDuelProb /= normCm;

    if (cmTotalMass >= 0.18 && claudeMass > 1e-6 && museMass > 1e-6) {
      const cScale = (cmTotalMass * blindClaudeDuelProb) / claudeMass;
      const mScale = (cmTotalMass * blindMuseDuelProb) / museMass;
      for (const smId of claude5SubIds) blindSubProbs[smId] *= cScale;
      for (const smId of museSubIds) blindSubProbs[smId] *= mScale;
    }

  }

  const blindSortedModels = subIds
    .map((smId) => {
      const t6 = TOP6_META[smId] || TOP6_META[subMeta[smId].family] || null;
      return {
        id: smId,
        label: subMeta[smId].label,
        vendor: subMeta[smId].vendor,
        family: subMeta[smId].family,
        priorityGroup: subMeta[smId].priorityGroup,
        arenaRank: subMeta[smId].arenaRank ?? (t6 ? t6.arenaRank : null),
        rarity: subMeta[smId].rarity || (t6 ? t6.rarity : "normal"),
        probability: Number((blindSubProbs[smId] || 0).toFixed(4))
      };
    })
    .sort((a, b) => b.probability - a.probability);

  const blindTopModel = blindSortedModels[0];

  // 6. V4 Model-Conditioned Effort-Tier Estimation!
  const { tierProbsMap, calibration: effortCalibration } = computeModelCalibratedEffort(
    text, profiles, blindSortedModels, refs, sims, maxSim
  );

  // Roll up blind probabilities to the 8 Matrix Families & 3 Priority Groups
  const ALL_8_FAMILIES = [
    "claude-opus-5.5", "gemini-4-argon", "gemini-4-carbon",
    "gpt-6.1-sol", "gpt-6-astra", "claude-fable-5.1", "muse-spark-1.3", "other"
  ];
  const famProbsMap = {};
  for (const f of ALL_8_FAMILIES) famProbsMap[f] = 0.0;
  const p3Rollup = { "claude-5.5": 0.0, "gemini-4": 0.0, "neither": 0.0 };

  for (const smId of subIds) {
    const pr = blindSubProbs[smId] || 0.0;
    const f = subMeta[smId].family || "other";
    const pg = subMeta[smId].priorityGroup || "neither";
    famProbsMap[f] = (famProbsMap[f] || 0.0) + pr;
    p3Rollup[pg] = (p3Rollup[pg] || 0.0) + pr;
  }

  const p3Dedicated = evalLinearClf(profiles.classifiers.priority3, x);
  let pClaude55 = 0.40 * (p3Dedicated["claude-5.5"] || 0) + 0.60 * p3Rollup["claude-5.5"];
  let pGemini4 = 0.40 * (p3Dedicated["gemini-4"] || 0) + 0.60 * p3Rollup["gemini-4"];
  let pNeither = 0.40 * (p3Dedicated["neither"] || 0) + 0.60 * p3Rollup["neither"];

  if (cmTotalMass >= 0.25 && blindMuseDuelProb > 0.62 && pClaude55 > 0.25) {
    const shift = pClaude55 * (blindMuseDuelProb - 0.35);
    pClaude55 = Math.max(0.01, pClaude55 - shift);
    pNeither = Math.min(0.98, pNeither + shift);
  }

  // Synchronize ALL distributions cleanly when an Exact Archive Specimen matches
  let finalModels = blindSortedModels;
  let finalClaudeDuelProb = blindClaudeDuelProb;
  let finalMuseDuelProb = blindMuseDuelProb;
  let cmActive = cmTotalMass >= 0.18;

  if (exactSpecimen) {
    if (exactSpecimen.priorityGroup === "claude-5.5") { pClaude55 = 0.994; pGemini4 = 0.002; pNeither = 0.004; }
    else if (exactSpecimen.priorityGroup === "gemini-4") { pGemini4 = 0.994; pClaude55 = 0.002; pNeither = 0.004; }
    else { pNeither = 0.994; pClaude55 = 0.003; pGemini4 = 0.003; }

    for (const f of ALL_8_FAMILIES) {
      famProbsMap[f] = f === exactSpecimen.family ? 0.992 : 0.008 / (ALL_8_FAMILIES.length - 1);
    }
    for (const t of TIERS) {
      tierProbsMap[t] = t === exactSpecimen.tier ? 0.985 : 0.005;
    }
    finalModels = subIds
      .map((smId) => {
        const t6 = TOP6_META[smId] || TOP6_META[subMeta[smId].family] || null;
        return {
          id: smId,
          label: subMeta[smId].label,
          vendor: subMeta[smId].vendor,
          family: subMeta[smId].family,
          priorityGroup: subMeta[smId].priorityGroup,
          arenaRank: subMeta[smId].arenaRank ?? (t6 ? t6.arenaRank : null),
          rarity: subMeta[smId].rarity || (t6 ? t6.rarity : "normal"),
          probability: smId === exactSpecimen.subModelId ? 0.992 : Number(((blindSubProbs[smId] || 0) * 0.008).toFixed(4))
        };
      })
      .sort((a, b) => b.probability - a.probability);

    if (exactSpecimen.vendor === "anthropic" || exactSpecimen.subModelId.startsWith("claude-")) {
      cmActive = true;
      finalClaudeDuelProb = 0.994;
      finalMuseDuelProb = 0.006;
    } else if (exactSpecimen.vendor === "muse" || exactSpecimen.subModelId.includes("muse")) {
      cmActive = true;
      finalClaudeDuelProb = 0.006;
      finalMuseDuelProb = 0.994;
    }
  }

  const claudeVsMuse = {
    active: cmActive,
    winner: finalClaudeDuelProb >= finalMuseDuelProb ? "claude" : "muse",
    claudeProb: Number(finalClaudeDuelProb.toFixed(4)),
    museProb: Number(finalMuseDuelProb.toFixed(4)),
    blindClaudeProb: Number(blindClaudeDuelProb.toFixed(4)),
    blindMuseProb: Number(blindMuseDuelProb.toFixed(4)),
    clusterMass: Number(Math.min(1, cmTotalMass).toFixed(4)),
    signals: buildClaudeVsMuseSignals(diagnostics)
  };

  const primaryModel = finalModels[0];
  const sortedFamilies = Object.entries(famProbsMap)
    .map(([family, probability]) => ({ family, probability: Number(probability.toFixed(4)) }))
    .sort((a, b) => b.probability - a.probability);

  const sortedTiers = Object.entries(tierProbsMap)
    .map(([tier, probability]) => ({ tier, probability: Number(probability.toFixed(4)) }))
    .sort((a, b) => b.probability - a.probability);

  const topFamily = sortedFamilies[0].family;
  const effortTier = sortedTiers[0].tier;

  let verdictCode = "NEITHER_OTHER";
  let verdictBadge = "OTHER MODEL";
  let verdictTitle = "";

  const argonProb = blindSubProbs["gemini-4-argon"] || 0.0;
  const carbonProb = blindSubProbs["gemini-4-carbon"] || 0.0;
  const g4Tot = Math.max(argonProb + carbonProb, 1e-6);

  if (pClaude55 >= pGemini4 && pClaude55 >= pNeither) {
    verdictCode = "CLAUDE_5_5";
    verdictBadge = exactSpecimen ? "CLAUDE 5.5 · 原库匹配" : "CLAUDE 5.5";
    const cName = primaryModel.priorityGroup === "claude-5.5" ? primaryModel.label : "Claude Opus 5.5";
    verdictTitle = `命中 Claude 5.5 系列 · ${cName}`;
  } else if (pGemini4 >= pClaude55 && pGemini4 >= pNeither) {
    const isCarbon = exactSpecimen
      ? exactSpecimen.family === "gemini-4-carbon"
      : (carbonProb / g4Tot > 0.55);
    verdictCode = isCarbon ? "GEMINI_4_CARBON" : "GEMINI_4_ARGON";
    verdictBadge = exactSpecimen
      ? `${isCarbon ? "GEMINI 4 CARBON" : "GEMINI 4 ARGON"} · 原库匹配`
      : (isCarbon ? "GEMINI 4 CARBON" : "GEMINI 4 ARGON");
    verdictTitle = `命中 ${isCarbon ? "Gemini 4 Carbon" : "Gemini 4 Argon"}`;
  } else {
    verdictCode = "NEITHER_OTHER";
    verdictBadge = exactSpecimen ? "其他模型 · 原库匹配" : "非 CLAUDE 5.5 / ARGON";
    verdictTitle = `非 Claude 5.5 / Argon · 识别为 ${primaryModel.label}`;
  }

  const nearestSpecimens = refs
    .map((sp, j) => ({
      id: sp.id,
      displayModel: sp.displayModel,
      vendor: sp.vendor,
      family: sp.family,
      tier: sp.tier,
      source: sp.source,
      subject: sp.subject,
      origName: sp.origName,
      file: sp.file,
      similarity: Number(Math.max(0, Math.min(1, sims[j])).toFixed(4))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

  const topOtherModel = finalModels.find((m) => m.family === "other") || primaryModel;

  const primaryRarity = primaryModel.rarity || "normal";
  const primaryRank = primaryModel.arenaRank || null;

  return {
    engineVersion: profiles.version,
    elapsedMs: Date.now() - t0,
    verdictCode,
    verdictBadge,
    verdictTitle,
    rarity: primaryRarity,
    arenaRank: primaryRank,
    isRecommendedTop6: primaryRank !== null && primaryRank <= 6,
    isClaude55: verdictCode === "CLAUDE_5_5",
    isGemini4Argon: verdictCode === "GEMINI_4_ARGON" || verdictCode === "GEMINI_4_CARBON",
    detectedModel: {
      id: primaryModel.id,
      label: primaryModel.label,
      vendor: primaryModel.vendor,
      family: primaryModel.family,
      arenaRank: primaryRank,
      rarity: primaryRarity,
      probability: primaryModel.probability,
      blindProbability: blindTopModel.probability,
      blindLabel: blindTopModel.label
    },
    topModels: finalModels.slice(0, 6),
    claudeVsMuse,
    priorityProbabilities: {
      claude55: Number(pClaude55.toFixed(4)),
      gemini4ArgonCarbon: Number(pGemini4.toFixed(4)),
      neither: Number(pNeither.toFixed(4))
    },
    subModelBreakdown: {
      gemini4: {
        argon: Number((argonProb / g4Tot).toFixed(4)),
        carbon: Number((carbonProb / g4Tot).toFixed(4))
      },
      closestSubModel: primaryModel.label,
      closestOtherSubModel: topOtherModel ? topOtherModel.label : null
    },
    topFamily,
    familyProbabilities: sortedFamilies,
    effortTier,
    effortConfidence: sortedTiers[0].probability,
    effortCalibration,
    tierProbabilities: sortedTiers,
    exactArchiveMatch: exactSpecimen ? {
      matched: true,
      id: exactSpecimen.id,
      origName: exactSpecimen.origName,
      displayModel: exactSpecimen.displayModel,
      family: exactSpecimen.family,
      tier: exactSpecimen.tier,
      source: exactSpecimen.source,
      file: exactSpecimen.file
    } : { matched: false },
    diagnostics,
    evidence: buildEvidenceChain(diagnostics, exactSpecimen, blindTopModel, claudeVsMuse, effortCalibration),
    nearestSpecimens
  };
}


async function identifyHtml(rawHtml, profiles, overrides = null) {
  return identifyHtmlSync(rawHtml, profiles, overrides);
}

  global.PelicanFingerprintEngine = {
    unwrapCodeInput,
    stripCfChallenge,
    extractEffortComplexity,
    extractDenseFeatures,
    extractStructuralTokens,
    sha256HexSync,
    sha256Hex,
    buildClaudeVsMuseSignals,
    buildEvidenceChain,
    computeSpecimenEmbeddingSync,
    computeSpecimenEmbedding,
    identifyHtmlSync,
    identifyHtml
  };
})(typeof window !== "undefined" ? window : globalThis);

const TihuHub = (() => {
  const CFG_KEY = 'tihu-cfg';
  const BUNDLE_KEY = 'tihu-bundle';
  const DEFAULT_URL = 'https://th.629717.cc.cd';
  const DEFAULT_KEY = '1234567890';
  const DAY_MS = 24 * 3600 * 1000;
  const TIER_LIST = ['low', 'medium', 'high', 'max'];
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

  let _cfg = null;
  let _bundle = {
    syncedAt: 0,
    version: '',
    role: '',
    githubConfigured: false,
    catalog: null,
    profiles: null,
    overrides: { edits: {}, deletedIds: [], addedItems: [] },
    engineJs: '',
  };
  let _syncing = null;
  let _lastErr = '';
  const _htmlCache = new Map();
  const _syncListeners = new Set();
  const _cardIdxMap = new Map();

  function normUrl(u) {
    const s = String(u || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function loadLocalCfg() {
    if (_cfg) return _cfg;
    let raw = null;
    try { raw = typeof Store !== 'undefined' && Store.get ? Store.get(CFG_KEY, null) : null; } catch {}
    if (raw && raw.disconnected === true) {
      _cfg = {
        url: '',
        key: '',
        autoDaily: raw.autoDaily !== false,
        disconnected: true,
        updatedAt: Number(raw.updatedAt) || 0,
      };
      return _cfg;
    }
    const initUrl = (raw && typeof raw.url === 'string' && raw.url.trim()) ? raw.url : DEFAULT_URL;
    const initKey = (raw && typeof raw.key === 'string' && raw.key.trim()) ? raw.key.trim() : DEFAULT_KEY;
    _cfg = {
      url: normUrl(initUrl),
      key: initKey,
      autoDaily: raw?.autoDaily !== false,
      disconnected: false,
      updatedAt: Number(raw?.updatedAt) || 0,
    };
    return _cfg;
  }

  async function saveCfg(next) {
    const wantDisconnect = Boolean(next?.disconnected === true || next?.url === '');
    if (wantDisconnect) {
      _cfg = {
        url: '',
        key: '',
        autoDaily: next?.autoDaily !== false,
        disconnected: true,
        updatedAt: Date.now(),
      };
    } else {
      const nextUrl = normUrl(next?.url ?? _cfg?.url ?? DEFAULT_URL) || normUrl(DEFAULT_URL);
      const rawKey = String(next?.key ?? _cfg?.key ?? DEFAULT_KEY).trim();
      _cfg = {
        url: nextUrl,
        key: rawKey || DEFAULT_KEY,
        autoDaily: next?.autoDaily !== false,
        disconnected: false,
        updatedAt: Date.now(),
      };
    }
    try { if (typeof Store !== 'undefined' && Store.set) Store.set(CFG_KEY, _cfg); } catch {}
    try { if (typeof Host !== 'undefined' && Host.shared) await Host.shared(CFG_KEY, _cfg); } catch {}
    emitChange();
    return _cfg;
  }

  let _pullSharedInflight = null;
  async function pullSharedFromHost({ triggerScan = false, triggerSyncIfEmpty = false } = {}) {
    if (_pullSharedInflight) return _pullSharedInflight;
    _pullSharedInflight = (async () => {
      loadLocalCfg();
      let cfgChanged = false;
      let bundleChanged = false;
      try {
        if (typeof Host !== 'undefined' && Host.shared) {
          const sharedCfg = await Host.shared(CFG_KEY).catch(() => null);
          if (sharedCfg && typeof sharedCfg === 'object') {
            const shAt = Number(sharedCfg.updatedAt) || 0;
            const locAt = Number(_cfg?.updatedAt) || 0;
            if (sharedCfg.disconnected === true && shAt >= locAt) {
              if (!_cfg.disconnected || _cfg.url) {
                _cfg = { url: '', key: '', autoDaily: sharedCfg.autoDaily !== false, disconnected: true, updatedAt: shAt };
                cfgChanged = true;
              }
            } else if (sharedCfg.url) {
              const shUrl = normUrl(sharedCfg.url);
              const shKey = String(sharedCfg.key || '').trim() || DEFAULT_KEY;
              const locKey = String(_cfg?.key || '').trim() || DEFAULT_KEY;
              const locHasCustom = Boolean(!_cfg?.disconnected && locKey && locKey !== DEFAULT_KEY);
              const shHasCustom = Boolean(shKey && shKey !== DEFAULT_KEY);
              if (locHasCustom && !shHasCustom && locAt >= shAt) {
                _cfg = { url: _cfg.url || shUrl, key: locKey, autoDaily: _cfg.autoDaily !== false, disconnected: false, updatedAt: locAt || Date.now() };
                await Host.shared(CFG_KEY, _cfg).catch(() => {});
              } else {
                const chosenKey = (shAt >= locAt ? shKey : (shHasCustom ? shKey : locKey)) || DEFAULT_KEY;
                const chosenUrl = shUrl || _cfg.url || normUrl(DEFAULT_URL);
                const chosenAuto = sharedCfg.autoDaily !== false;
                if (_cfg.url !== chosenUrl || _cfg.key !== chosenKey || _cfg.autoDaily !== chosenAuto || _cfg.disconnected) {
                  _cfg = { url: chosenUrl, key: chosenKey, autoDaily: chosenAuto, disconnected: false, updatedAt: Math.max(shAt, locAt) };
                  cfgChanged = true;
                }
              }
              try { if (typeof Store !== 'undefined' && Store.set) Store.set(CFG_KEY, _cfg); } catch {}
            }
          } else if (_cfg && !_cfg.disconnected && _cfg.url) {
            _cfg.updatedAt = _cfg.updatedAt || Date.now();
            try { if (typeof Store !== 'undefined' && Store.set) Store.set(CFG_KEY, _cfg); } catch {}
            await Host.shared(CFG_KEY, _cfg).catch(() => {});
          }

          const savedBundle = await Host.shared(BUNDLE_KEY).catch(() => null);
          if (savedBundle && typeof savedBundle === 'object' && savedBundle.profiles) {
            const svAt = Number(savedBundle.syncedAt) || 0;
            const curAt = Number(_bundle?.syncedAt) || 0;
            if (!isReady() || svAt > curAt || savedBundle.version !== _bundle.version || savedBundle.role !== _bundle.role) {
              _bundle = {
                ..._bundle,
                ...savedBundle,
                overrides: savedBundle.overrides || { edits: {}, deletedIds: [], addedItems: [] },
              };
              if (_bundle.engineJs) applyDynamicEngine(_bundle.engineJs);
              _syncRev++;
              _htmlCache.clear();
              bundleChanged = true;
            }
          } else if (isReady() && _bundle?.profiles) {
            await Host.shared(BUNDLE_KEY, _bundle).catch(() => {});
          }
        }
      } catch {}
      if (cfgChanged || bundleChanged) {
        emitChange();
        try { Dock?.render?.(); UI?.renderListSoon?.(); UI?.renderTabs?.(); } catch {}
      }
      if ((bundleChanged || triggerScan) && isReady()) {
        void scanAndRecognizeAllChats({ forceLoadUncached: true, quiet: true });
      } else if ((cfgChanged || triggerSyncIfEmpty) && !isReady() && _cfg?.url && !_cfg?.disconnected) {
        void sync({ force: false, quiet: true });
      }
      return { cfgChanged, bundleChanged };
    })().finally(() => { _pullSharedInflight = null; });
    return _pullSharedInflight;
  }

  function emitChange() {
    try { _syncAnalyzeCache.clear(); } catch {}
    try { if (typeof Bus !== 'undefined' && Bus.emit) Bus.emit('tihu', status()); } catch {}
    for (const fn of _syncListeners) {
      try { fn(status()); } catch {}
    }
  }

  function onSync(fn) {
    if (typeof fn === 'function') _syncListeners.add(fn);
    return () => _syncListeners.delete(fn);
  }

  function upgradeEngineCodeForConditioning(rawJs) {
    if (!rawJs || typeof rawJs !== 'string') return rawJs;
    if (rawJs.includes('_modelFilter')) return rawJs;
    let code = rawJs;
    const blindTarget = '  for (const smId of subIds) {\n    blindSubProbs[smId] = wLrModel * (pFineLr[smId] || 0.0) + wKnnModel * (pKnn[smId] || 0.0);\n  }';
    const blindInjected = blindTarget + `
  if (overrides && typeof overrides._modelFilter === "function") {
    let _validMass = 0.0;
    let _allowedCnt = 0;
    for (const smId of subIds) {
      const _ok = Boolean(overrides._modelFilter({ id: smId, ...subMeta[smId] }));
      if (_ok) {
        _validMass += blindSubProbs[smId] || 0.0;
        _allowedCnt++;
      } else {
        blindSubProbs[smId] = 0.0;
      }
    }
    if (_allowedCnt > 0 && _validMass > 1e-9) {
      for (const smId of subIds) blindSubProbs[smId] /= _validMass;
    }
    if (exactSpecimen && exactSpecimen.subModelId && subMeta[exactSpecimen.subModelId] && !overrides._modelFilter({ id: exactSpecimen.subModelId, ...subMeta[exactSpecimen.subModelId] })) {
      exactSpecimen = null;
    }
  }`;
    if (code.includes(blindTarget)) {
      code = code.replace(blindTarget, blindInjected);
    }
    code = code.replace(
      '.sort((a, b) => b.similarity - a.similarity)\n    .slice(0, 4);',
      '.filter((sp) => !(overrides && typeof overrides._modelFilter === "function") || overrides._modelFilter({ id: sp.displayModel, label: sp.displayModel, vendor: sp.vendor, family: sp.family }))\n    .sort((a, b) => b.similarity - a.similarity)\n    .slice(0, 8);'
    );
    code = code.replace('topModels: finalModels.slice(0, 6),', 'topModels: finalModels.slice(0, 6), allModels: finalModels,');
    return code;
  }

  function applyDynamicEngine(jsCode) {
    if (!jsCode || typeof jsCode !== 'string' || jsCode.length < 500) return false;
    const patchedJs = upgradeEngineCodeForConditioning(jsCode);
    try {
      if (typeof globalThis !== 'undefined' && globalThis.BranaHost?.evalTihuEngine) {
        globalThis.BranaHost.evalTihuEngine(patchedJs);
        if (globalThis.PelicanFingerprintEngine?.identifyHtmlSync) {
          globalThis.PelicanFingerprintEngine._conditionedV3 = true;
          return true;
        }
      }
    } catch {}
    try {
      const fn = new Function('window', 'globalThis', patchedJs + '; return window.PelicanFingerprintEngine || globalThis.PelicanFingerprintEngine;');
      const scope = {};
      const eng = fn(scope, scope);
      if (eng && (eng.identifyHtmlSync || eng.identifyHtml)) {
        eng._conditionedV3 = true;
        globalThis.PelicanFingerprintEngine = eng;
        return true;
      }
    } catch {}
    return false;
  }

  function isReady() {
    if (!_bundle?.profiles || !Array.isArray(_bundle?.profiles?.vocab)) return false;
    if (!globalThis.PelicanFingerprintEngine?.identifyHtmlSync && _bundle?.engineJs) {
      applyDynamicEngine(_bundle.engineJs);
    }
    return Boolean(globalThis.PelicanFingerprintEngine?.identifyHtmlSync);
  }

  function allSpecimens() {
    const baseItems = Array.isArray(_bundle?.catalog?.items) ? _bundle.catalog.items : [];
    const ov = _bundle?.overrides || {};
    const delSet = new Set(Array.isArray(ov.deletedIds) ? ov.deletedIds : []);
    const edits = (ov.edits && typeof ov.edits === 'object') ? ov.edits : {};
    const added = Array.isArray(ov.addedItems) ? ov.addedItems : [];

    const out = [];
    const seen = new Set();
    for (const it of added) {
      if (!it || !it.id || delSet.has(it.id) || seen.has(it.id)) continue;
      seen.add(it.id);
      const ed = edits[it.id];
      out.push(ed ? { ...it, ...ed } : it);
    }
    for (const it of baseItems) {
      if (!it || !it.id || delSet.has(it.id) || seen.has(it.id)) continue;
      seen.add(it.id);
      const ed = edits[it.id];
      out.push(ed ? { ...it, ...ed } : it);
    }
    return out;
  }

  function status() {
    const c = loadLocalCfg();
    const items = allSpecimens();
    const models = new Set(items.map(x => String(x.displayModel || x.family || '').toLowerCase()).filter(Boolean));
    return {
      configured: Boolean(c.url),
      hasKey: Boolean(c.key),
      url: c.url,
      autoDaily: c.autoDaily !== false,
      ready: isReady(),
      syncing: Boolean(_syncing),
      syncedAt: _bundle.syncedAt || 0,
      version: _bundle.version || '',
      role: _bundle.role || '',
      githubConfigured: Boolean(_bundle.githubConfigured),
      specimenCount: items.length,
      modelCount: models.size,
      addedCount: Array.isArray(_bundle?.overrides?.addedItems) ? _bundle.overrides.addedItems.length : 0,
      lastErr: _lastErr,
    };
  }

  async function httpJson(fullUrl, opts = {}) {
    const c = loadLocalCfg();
    const key = opts.key !== undefined ? String(opts.key || '').trim() : c.key;
    const headers = {
      'User-Agent': CHROME_UA,
      'Accept': 'application/json, text/plain, */*',
      ...(key ? { 'X-API-Key': key, 'Authorization': 'Bearer ' + key } : {}),
      ...(opts.headers || {}),
    };
    if (typeof Host !== 'undefined' && Host.fetchText) {
      const m = opts.method || 'GET';
      const r = await Host.fetchText(fullUrl, {
        method: m,
        ...(m === 'POST' ? { type: opts.type || 'application/json', body: opts.body || '' } : {}),
        headers,
        long: Boolean(opts.long),
        timeout: opts.timeout || 25000,
      });
      if (!r || r.error) {
        let msg = r?.error || '请求失败';
        if (r?.body) {
          try { const ej = JSON.parse(r.body); if (ej?.error) msg = ej.error; } catch {}
        }
        throw new Error(msg);
      }
      return JSON.parse(r.text);
    }
    const resp = await fetch(fullUrl, {
      method: opts.method || 'GET',
      headers: {
        ...headers,
        ...(opts.method === 'POST' ? { 'Content-Type': opts.type || 'application/json' } : {}),
      },
      body: opts.method === 'POST' ? opts.body : undefined,
    });
    const txt = await resp.text();
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const ej = JSON.parse(txt); if (ej?.error) msg = ej.error; } catch {}
      throw new Error(msg);
    }
    return JSON.parse(txt);
  }

  async function httpText(fullUrl, opts = {}) {
    const c = loadLocalCfg();
    const key = opts.key !== undefined ? String(opts.key || '').trim() : c.key;
    const headers = {
      'User-Agent': CHROME_UA,
      'Accept': '*/*',
      ...(key && opts.withAuth ? { 'X-API-Key': key, 'Authorization': 'Bearer ' + key } : {}),
      ...(opts.headers || {}),
    };
    if (typeof Host !== 'undefined' && Host.fetchText) {
      const r = await Host.fetchText(fullUrl, {
        method: 'GET',
        headers,
        long: Boolean(opts.long),
        timeout: opts.timeout || 30000,
      });
      if (!r || r.error) throw new Error(r?.error || '拉取失败');
      return String(r.text || '');
    }
    const resp = await fetch(fullUrl, { headers });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  function withKeyParam(rawUrl, key) {
    if (!key) return rawUrl;
    const sep = rawUrl.includes('?') ? '&' : '?';
    return rawUrl + sep + 'key=' + encodeURIComponent(key);
  }

  let _syncRev = 1;
  let _scanPromise = null;
  let _lastScanSummary = null;
  const _syncAnalyzeCache = new Map();

  // 多语言鹈鹕提示词/标题/注释/文件名特征检测（含希伯来语 שקנאי、印地语、希腊语、波斯语、阿拉伯语、简繁中日韩俄乌法西葡德意荷越泰及 pelican-bike 文件名等）
  const PELICAN_KW_RE = /(?:鹈鹕|鵜鶘|ペリカン|펠리컨|펠리칸|пеликан|пелікан|שקנאים?|पेलिकन|πελεκάν(?:ος|οι)?|پلیکان|\bpelicans?\b|pelican[-_\s]*(?:bike|bicycle|svg|ride|riding|html)|pélicans?|pelícanos?|pelicanos?|pelikane?n?|pellican[oi]|pelikaan|bồ\s*nông|นกกระทุง|بجع|burung\s*undan|骑(?:着)?(?:自行车|单车).*(?:水鸟|大嘴鸟)|(?:水鸟|大嘴鸟).*骑(?:着)?(?:自行车|单车))/i;
  const PELICAN_TITLE_HINT_RE = /(?:鹈鹕|鵜鶘|ペリカン|펠리컨|펠리칸|пеликан|пелікан|שקנאים?|पेलिकन|πελεκάν(?:ος|οι)?|پلیکان|\bpelicans?\b|pelican[-_\s]*(?:bike|bicycle|svg|ride|riding|html)|pélicans?|pelícanos?|pelikane?n?|svg.*(?:bicycle|bike|骑车|单车|自行车|自転車|자전거|אופניים)|(?:bicycle|bike|骑车|单车|自行车|自転車|자전거|אופניים).*svg)/i;

  function isStubHtmlText(s) {
    const str = String(s || '');
    return !str || str.includes('…[cached]') || str.includes('...[cached]');
  }

  function normArtPath(p) {
    return String(p || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/home\/user\//, '')
      .replace(/^~\//, '')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
  }

  function extractMsgPlainText(m) {
    if (!m) return '';
    const chunks = [];
    if (typeof m.text === 'string' && m.text) chunks.push(m.text);
    if (typeof m.content === 'string' && m.content) chunks.push(m.content);
    else if (Array.isArray(m.content)) {
      for (const c of m.content) {
        if (typeof c === 'string') chunks.push(c);
        else if (typeof c?.text === 'string') chunks.push(c.text);
      }
    }
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if (!p) continue;
        if (p.type === 'reasoning' || p.type === 'thinking') continue;
        if (typeof p.text === 'string' && p.text) chunks.push(p.text);
      }
    }
    return chunks.join('\n');
  }

  function extractHtmlBlocksFromString(str) {
    const out = [];
    const txt = String(str || '');
    if (!txt || txt.length < 80) return out;
    const fenceRe = /\x60{3}(?:html|htm|svg|xml)?\s*\r?\n([\s\S]{90,}?)\r?\n\x60{3}/gi;
    let m;
    while ((m = fenceRe.exec(txt)) !== null) {
      const inner = String(m[1] || '').trim();
      if (/<(?:!doctype\s+html|html|svg)\b/i.test(inner)) out.push(inner);
    }
    if (!out.length) {
      const docMatch = /(<!doctype\s+html[\s\S]*?<\/html>|<html[\s>][\s\S]*?<\/html>|<svg[\s>][\s\S]{90,}?<\/svg>)/i.exec(txt);
      if (docMatch && docMatch[1]) out.push(docMatch[1].trim());
    }
    return out;
  }

  function extractAssistantTurnArtifacts(sid, chatObj, asstMsgs) {
    const found = [];
    const stubPaths = [];
    const fileMap = new Map();

    const recordCandidate = (code, slotKey, filePath = '') => {
      const raw = String(code || '').trim();
      if (!raw || raw.length < 90) return;
      if (isStubHtmlText(raw)) {
        if (filePath) stubPaths.push(normArtPath(filePath));
        return;
      }
      const clean = globalThis.PelicanFingerprintEngine?.unwrapCodeInput
        ? globalThis.PelicanFingerprintEngine.unwrapCodeInput(raw)
        : raw;
      if (!clean || clean.length < 90) return;
      if (!/<(?:!doctype|html|svg)\b/i.test(clean)) return;
      if (!/<svg\b/i.test(clean) && clean.length < 1200 && !PELICAN_KW_RE.test(clean)) return;
      found.push({ html: clean, slotKey: slotKey || 'inline', path: filePath ? normArtPath(filePath) : '' });
    };

    const inspectToolCall = (toolName, inp) => {
      if (!inp || typeof inp !== 'object') return;
      const tn = String(toolName || '').replace(/^tool-/, '').toLowerCase();
      const rawPath = String(inp.path || inp.file_path || inp.TargetFile || inp.filename || '');
      const pNorm = normArtPath(rawPath);
      const isHtmlExt = /\.(?:html?|svg|xhtml)$/i.test(pNorm);

      if (/^(?:write_?file|create_?file|write_to_file|overwrite_?file|write)$/.test(tn)) {
        const c = String(inp._healedContent ?? inp.content ?? inp.text ?? inp.code ?? inp.file_text ?? inp.CodeContent ?? '');
        let resolved = '';
        if (sid && pNorm && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedText === 'function') {
          try { resolved = String(HtmlPreview.resolvedText(sid, pNorm) || ''); } catch {}
        }
        const best = (resolved && !isStubHtmlText(resolved) && (isStubHtmlText(c) || resolved.length >= c.length)) ? resolved : c;
        if (isStubHtmlText(best)) {
          if (isHtmlExt && pNorm) stubPaths.push(pNorm);
          return;
        }
        if (pNorm) fileMap.set(pNorm, best);
        if (isHtmlExt || /<(?:!doctype|html|svg)\b/i.test(best)) {
          const baseName = pNorm.split('/').pop() || pNorm || 'artifact.html';
          recordCandidate(best, 'file:' + baseName.toLowerCase(), pNorm);
        }
      } else if (pNorm && fileMap.has(pNorm) && /^(?:edit_?file|str_?replace|replace_in_file|edit)$/.test(tn)) {
        const oldT = inp.old_text ?? inp.old_str;
        const newT = inp.new_text ?? inp.new_str;
        const curTxt = fileMap.get(pNorm) || '';
        if (typeof oldT === 'string' && typeof newT === 'string' && oldT && curTxt.includes(oldT)) {
          const updated = curTxt.replace(oldT, newT);
          fileMap.set(pNorm, updated);
          const baseName = pNorm.split('/').pop() || pNorm;
          recordCandidate(updated, 'file:' + baseName.toLowerCase(), pNorm);
        }
      } else if (/^(?:bash|exec_command|run_command|shell|execute_command)$/.test(tn)) {
        const cmd = String(inp.command || inp.cmd || '');
        if (cmd.length >= 120 && /<(?:!doctype\s+html|html|svg)\b/i.test(cmd)) {
          const blocks = extractHtmlBlocksFromString(cmd);
          for (let bi = 0; bi < blocks.length; bi++) {
            recordCandidate(blocks[bi], 'bash:' + (bi + 1), '');
          }
        }
      }
    };

    for (let mi = 0; mi < asstMsgs.length; mi++) {
      const m = asstMsgs[mi];
      if (!m) continue;
      if (Array.isArray(m.tools)) {
        for (const t of m.tools) {
          if (!t) continue;
          inspectToolCall(t.name || t.toolName || t.type, t.input || t.args);
        }
      }
      if (Array.isArray(m.parts)) {
        for (const p of m.parts) {
          if (!p) continue;
          const pt = String(p.type || '');
          if (pt.startsWith('tool-') || pt === 'dynamic-tool' || pt === 'tool-invocation' || p.toolName || p.toolInvocation) {
            const tName = p.toolName || p.name || p.toolInvocation?.toolName || pt;
            let tInp = (typeof R !== 'undefined' && typeof R.tinput === 'function' ? R.tinput(p) : null) || p.input || p.args || p.toolInvocation?.args || null;
            if (!tInp && typeof p.inputText === 'string' && p.inputText.trim().startsWith('{')) {
              try { tInp = JSON.parse(p.inputText); } catch {}
            }
            inspectToolCall(tName, tInp);
          }
        }
      }
      const plain = extractMsgPlainText(m);
      if (plain && plain.length >= 90) {
        const blocks = extractHtmlBlocksFromString(plain);
        for (let bi = 0; bi < blocks.length; bi++) {
          recordCandidate(blocks[bi], 'msgblock:' + (mi + 1) + '-' + (bi + 1), '');
        }
      }
    }

    return { found, stubPaths: [...new Set(stubPaths.filter(Boolean))] };
  }

  async function healChatHtmlStubs(sid, chatObj) {
    const sKey = String(sid || chatObj?.sid || chatObj?.id || '').trim();
    const msgs = Array.isArray(chatObj?.messages) ? chatObj.messages : [];
    if (!sKey || !msgs.length || typeof HtmlPreview === 'undefined' || typeof HtmlPreview.healFileText !== 'function') {
      return { healedCount: 0, paths: [] };
    }
    const stubEntries = [];
    const seen = new Set();
    const collectInp = (toolName, inp) => {
      if (!inp || typeof inp !== 'object') return;
      const tn = String(toolName || '').replace(/^tool-/, '').toLowerCase();
      if (!/^(?:write_?file|create_?file|write_to_file|overwrite_?file|write)$/.test(tn)) return;
      const rawPath = String(inp.path || inp.file_path || inp.TargetFile || inp.filename || '');
      const pNorm = normArtPath(rawPath);
      if (!pNorm || !/\.(?:html?|svg|xhtml)$/i.test(pNorm)) return;
      const cur = String(inp._healedContent ?? inp.content ?? inp.text ?? inp.code ?? inp.file_text ?? inp.CodeContent ?? '');
      let resolved = '';
      if (typeof HtmlPreview.resolvedText === 'function') {
        try { resolved = String(HtmlPreview.resolvedText(sKey, pNorm) || ''); } catch {}
      }
      if (resolved && !isStubHtmlText(resolved) && resolved.length >= 90) {
        inp._healedContent = resolved;
        return;
      }
      if (isStubHtmlText(cur) || !cur) {
        stubEntries.push({ pNorm, inp });
        seen.add(pNorm);
      }
    };
    /* V15: 从最新一轮往前收集 stub 路径，优先补全最新鹈鹕测试轮次的 HTML/SVG，防止前序旧文件挤占名额 */
    for (let mi = msgs.length - 1; mi >= 0; mi--) {
      const m = msgs[mi];
      if (!m || m.role !== 'assistant') continue;
      if (Array.isArray(m.parts)) {
        for (let pi = m.parts.length - 1; pi >= 0; pi--) {
          const p = m.parts[pi];
          if (!p) continue;
          const pt = String(p.type || '');
          if (pt.startsWith('tool-') || pt === 'dynamic-tool' || pt === 'tool-invocation' || p.toolName || p.toolInvocation) {
            const tName = p.toolName || p.name || p.toolInvocation?.toolName || pt;
            let tInp = (typeof R !== 'undefined' && typeof R.tinput === 'function' ? R.tinput(p) : null) || p.input || p.args || p.toolInvocation?.args || null;
            if (!tInp && typeof p.inputText === 'string' && p.inputText.trim().startsWith('{')) {
              try { tInp = JSON.parse(p.inputText); } catch {}
            }
            collectInp(tName, tInp);
          }
        }
      }
      if (Array.isArray(m.tools)) {
        for (let ti = m.tools.length - 1; ti >= 0; ti--) {
          const t = m.tools[ti];
          collectInp(t?.name || t?.toolName || t?.type, t?.input || t?.args);
        }
      }
    }
    if (!seen.size) return { healedCount: 0, paths: [] };
    const orderedPaths = [...seen].sort((a, b) => Number(/pelican/i.test(b)) - Number(/pelican/i.test(a)));
    let healedCount = 0;
    const healedPaths = [];
    for (const pNorm of orderedPaths.slice(0, 8)) {
      try {
        const healed = await HtmlPreview.healFileText(sKey, pNorm);
        if (healed && !isStubHtmlText(healed) && healed.length >= 90) {
          healedCount++;
          healedPaths.push(pNorm);
          for (const item of stubEntries) {
            if (item.pNorm === pNorm && item.inp) item.inp._healedContent = healed;
          }
        }
      } catch {}
    }
    if (healedCount > 0) _syncAnalyzeCache.clear();
    return { healedCount, paths: healedPaths };
  }

  function extractPelicanTurnHtml(chatObj, histItem = null, sidOverride = '') {
    const sid = String(sidOverride || chatObj?.sid || chatObj?.id || histItem?.id || '').trim();
    const msgs = Array.isArray(chatObj?.messages) ? chatObj.messages : [];
    const titleStr = [
      chatObj?.title,
      chatObj?.localTitle,
      histItem?.title,
      histItem?.localTitle,
    ].filter(Boolean).join(' ');
    const chatLevelPelican = Boolean(chatObj?._isPelicanTest || PELICAN_KW_RE.test(titleStr));

    if (!msgs.length) {
      return { matched: false, chatLevelPelican, stubPaths: [] };
    }

    const turns = [];
    let curTurn = { userTexts: [], asstMsgs: [], startIdx: 0 };
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!m) continue;
      if (m.role === 'user') {
        if (curTurn.userTexts.length || curTurn.asstMsgs.length) turns.push(curTurn);
        curTurn = { userTexts: [extractMsgPlainText(m)], asstMsgs: [], startIdx: i };
      } else if (m.role === 'assistant') {
        curTurn.asstMsgs.push(m);
      }
    }
    if (curTurn.userTexts.length || curTurn.asstMsgs.length) turns.push(curTurn);

    const explicitMatches = [];
    let titleFallbackMatch = null;
    const explicitPelicanStubs = [];
    const explicitPelicanStubTurns = [];
    const allPelicanStubs = [];
    let latestPelicanPromptTurn = -1;

    for (let ti = 0; ti < turns.length; ti++) {
      const t = turns[ti];
      if (!t.asstMsgs.length) continue;
      const promptJoined = t.userTexts.join('\n');
      const promptHasPelican = PELICAN_KW_RE.test(promptJoined);
      if (promptHasPelican) latestPelicanPromptTurn = ti;
      const { found, stubPaths } = extractAssistantTurnArtifacts(sid, chatObj, t.asstMsgs);
      const stubHasPelicanPath = stubPaths.some(sp => /pelican/i.test(sp));

      if (promptHasPelican || stubHasPelicanPath) {
        for (const sp of stubPaths) {
          explicitPelicanStubs.push(sp);
          explicitPelicanStubTurns.push({ path: sp, turnIndex: ti });
          allPelicanStubs.push(sp);
        }
      } else if (chatLevelPelican && stubPaths.length) {
        for (const sp of stubPaths) allPelicanStubs.push(sp);
      }

      if (!found.length) continue;

      const pelicanTaggedArts = found.filter(a => PELICAN_KW_RE.test(a.html) || /pelican/i.test(a.path || ''));
      const isExplicitPelicanTurn = Boolean(promptHasPelican || pelicanTaggedArts.length > 0);
      if (!isExplicitPelicanTurn && !chatLevelPelican) continue;

      const pool = pelicanTaggedArts.length ? pelicanTaggedArts : found;
      let chosen = pool[pool.length - 1];
      for (const art of pool) {
        const chosenHasSvg = /<svg\b/i.test(chosen.html);
        const artHasSvg = /<svg\b/i.test(art.html);
        if (artHasSvg && !chosenHasSvg) chosen = art;
        else if (artHasSvg === chosenHasSvg && art.html.length >= chosen.html.length * 0.85) chosen = art;
      }

      const lastTurnAsst = t.asstMsgs[t.asstMsgs.length - 1];
      const kwMatch = PELICAN_KW_RE.exec(promptJoined) || PELICAN_KW_RE.exec(chosen.html) || PELICAN_KW_RE.exec(titleStr);
      const candObj = {
        matched: true,
        html: chosen.html,
        slotKey: chosen.slotKey || 'pelican:turn-' + (ti + 1),
        path: chosen.path || '',
        turnIndex: ti,
        turnMsgId: lastTurnAsst?.id || '',
        totalTurns: turns.length,
        byPrompt: promptHasPelican,
        byArtifact: pelicanTaggedArts.length > 0,
        matchedKeyword: kwMatch ? kwMatch[0] : 'pelican',
        stubPaths: [...new Set(allPelicanStubs)],
      };

      if (isExplicitPelicanTurn && candObj.html.length >= 120) {
        // V12: 按时间顺序收集全部显式鹈鹕测试轮次，始终以最新一轮为准（修复中途路由后点击「测鹈鹕」因新代码比首轮短而被丢弃的问题）
        explicitMatches.push(candObj);
      } else if (chatLevelPelican) {
        if (!titleFallbackMatch || (/<svg\b/i.test(candObj.html) && !/<svg\b/i.test(titleFallbackMatch.html)) || (/<svg\b/i.test(candObj.html) === /<svg\b/i.test(titleFallbackMatch.html) && candObj.html.length > titleFallbackMatch.html.length)) {
          titleFallbackMatch = candObj;
        }
      }
    }

    if (explicitMatches.length > 0) {
      const latestMatch = explicitMatches[explicitMatches.length - 1];
      const newerStubPaths = [...new Set(
        explicitPelicanStubTurns
          .filter(x => x.turnIndex > latestMatch.turnIndex)
          .reverse()
          .map(x => x.path)
      )];
      if (newerStubPaths.length > 0) {
        return {
          matched: false,
          hasNewerUnhealedStub: true,
          chatLevelPelican: true,
          stubPaths: newerStubPaths,
          latestPelicanPromptTurn,
          fallbackMatch: {
            ...latestMatch,
            pelicanTurnCount: explicitMatches.length,
            earlierPelicanTurn: explicitMatches.length > 1 ? explicitMatches[0] : null,
          },
        };
      }
      return {
        ...latestMatch,
        latestPelicanPromptTurn,
        pelicanTurnCount: explicitMatches.length,
        earlierPelicanTurn: explicitMatches.length > 1 ? explicitMatches[0] : null,
      };
    }
    if (explicitPelicanStubs.length > 0) {
      return {
        matched: false,
        chatLevelPelican: true,
        latestPelicanPromptTurn,
        stubPaths: [...new Set([...explicitPelicanStubs].reverse())],
      };
    }

    if (sid && typeof R !== 'undefined' && typeof R.writes === 'function') {
      try {
        const writes = R.writes(sid) || [];
        let bestExplicitW = null;
        let bestFallbackW = null;
        for (let wi = writes.length - 1; wi >= 0; wi--) {
          const w = writes[wi];
          const pNorm = normArtPath(w?.path || '');
          if (!/\.(?:html?|svg)$/i.test(pNorm)) continue;
          const txt = String(w.get?.() || '');
          if (isStubHtmlText(txt)) {
            if (/pelican/i.test(pNorm)) explicitPelicanStubs.push(pNorm);
            if (chatLevelPelican || /pelican/i.test(pNorm)) allPelicanStubs.push(pNorm);
            continue;
          }
          if (txt.length < 100) continue;
          const baseName = pNorm.split('/').pop() || pNorm;
          const wObj = {
            matched: true,
            html: txt,
            slotKey: 'file:' + baseName.toLowerCase(),
            path: pNorm,
            turnIndex: turns.length - 1,
            totalTurns: turns.length,
            byPrompt: chatLevelPelican,
            byArtifact: PELICAN_KW_RE.test(txt) || /pelican/i.test(pNorm),
            matchedKeyword: 'pelican',
            stubPaths: [...new Set(allPelicanStubs)],
          };
          if (wObj.byArtifact) {
            if (!bestExplicitW || wObj.html.length > bestExplicitW.html.length) bestExplicitW = wObj;
          } else if (chatLevelPelican) {
            if (!bestFallbackW || wObj.html.length > bestFallbackW.html.length) bestFallbackW = wObj;
          }
        }
        if (bestExplicitW) return bestExplicitW;
        if (explicitPelicanStubs.length > 0) {
          return { matched: false, chatLevelPelican: true, stubPaths: [...new Set(explicitPelicanStubs)] };
        }
        if (titleFallbackMatch) return titleFallbackMatch;
        if (bestFallbackW) return bestFallbackW;
      } catch {}
    }

    if (titleFallbackMatch) return titleFallbackMatch;

    return {
      matched: false,
      chatLevelPelican,
      latestPelicanPromptTurn,
      stubPaths: [...new Set([...allPelicanStubs].reverse())],
    };
  }

  /* V15: 若模型通过 Python/Node/Bash 脚本直接在沙盒工作区生成了鹈鹕 HTML（未走 write_file 或已被折叠），直接从工作区快照读取最新 HTML/SVG */
  async function readWorkspacePelicanHtml(sid, chatObj, histItem = null, prePel = null) {
    const sKey = String(sid || chatObj?.sid || '').trim();
    if (!sKey || typeof Workspace === 'undefined' || typeof Workspace.fileBlob !== 'function') return null;
    try {
      let data = (typeof WS !== 'undefined' && WS.sid === sKey && WS.data?.manifest?.root) ? WS.data : null;
      if (!data?.manifest?.root && typeof Workspace.latest === 'function' && !(typeof ReadLimit !== 'undefined' && ReadLimit.active?.())) {
        data = await Workspace.latest(sKey).catch(() => null);
      }
      const root = data?.manifest?.root;
      if (!root?.entries) return null;
      const htmlEntries = [];
      const walkWs = (dir, prefix) => {
        for (const [name, e] of Object.entries(dir.entries || {})) {
          const rel = prefix ? (prefix + '/' + name) : name;
          if (e?.type === 'dir') {
            if (!/^(?:node_modules|.git|dist|build|__pycache__)$/i.test(name)) walkWs(e, rel);
          } else if (/.(?:html?|svg)$/i.test(name) && (+e?.size || 0) >= 120 && (+e?.size || 0) <= 450000) {
            htmlEntries.push({ path: rel, name, e, isPelName: /pelican|鹈鹕|鵜鶘/i.test(rel), mtime: Number(e.mtime || e.updatedAt || 0) });
          }
        }
      };
      walkWs(root, '');
      if (!htmlEntries.length) return null;
      const hasPelPrompt = Boolean((prePel?.latestPelicanPromptTurn ?? -1) >= 0 || prePel?.chatLevelPelican);
      htmlEntries.sort((a, b) => (Number(b.isPelName) - Number(a.isPelName)) || (b.mtime - a.mtime));
      for (const cand of htmlEntries.slice(0, 4)) {
        if (!cand.isPelName && !hasPelPrompt) continue;
        const cachedTxt = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedText === 'function')
          ? HtmlPreview.resolvedText(sKey, cand.path)
          : '';
        let txt = (cachedTxt && !isStubHtmlText(cachedTxt) && cachedTxt.length >= 120) ? cachedTxt : '';
        if (!txt) {
          const blob = await Workspace.fileBlob(cand.e).catch(() => null);
          if (blob) txt = String(await blob.text()).slice(0, 400000);
        }
        if (!txt || isStubHtmlText(txt) || txt.length < 120 || !/<(?:!doctype|html|svg)/i.test(txt)) continue;
        const byArt = PELICAN_KW_RE.test(txt) || cand.isPelName;
        if (!byArt && !hasPelPrompt) continue;
        try { if (typeof HtmlPreview !== 'undefined' && HtmlPreview.cacheResolvedText) HtmlPreview.cacheResolvedText(sKey, cand.path, txt, { authoritative: true }); } catch {}
        return {
          matched: true,
          html: txt,
          slotKey: 'ws:' + cand.name.toLowerCase(),
          path: cand.path,
          turnIndex: (prePel?.latestPelicanPromptTurn ?? -1) >= 0 ? prePel.latestPelicanPromptTurn : Math.max(0, ((chatObj?.messages || []).filter(m => m?.role === 'user').length - 1)),
          totalTurns: Math.max(1, (chatObj?.messages || []).filter(m => m?.role === 'user').length),
          byPrompt: hasPelPrompt,
          byArtifact: byArt,
          matchedKeyword: 'pelican',
          stubPaths: [],
        };
      }
    } catch {}
    return null;
  }

  async function sync({ force = false, quiet = false, customCfg = null, skipRetroScan = false } = {}) {
    if (_syncing) return _syncing;
    _syncing = (async () => {
      try {
        const c = customCfg ? await saveCfg(customCfg) : loadLocalCfg();
        if (!c.url) {
          if (!quiet && typeof toast === 'function') toast('请先设置醍醐识别库网页地址', 'err');
          return { ok: false, error: '未设置地址' };
        }
        _lastErr = '';
        emitChange();

        const base = c.url;
        const key = c.key;

        let syncMeta = null;
        try {
          syncMeta = await httpJson(withKeyParam(base + '/api/v1/sync', key), { key, timeout: 20000 });
        } catch (e1) {
          const msg1 = String(e1?.message || e1);
          if (/401|403|口令|密码|未登录|访问受限/.test(msg1)) {
            if (!quiet) throw e1;
            syncMeta = {
              ok: true,
              version: _bundle.version || '20261027v80',
              role: 'public-static',
              githubConfigured: false,
              overrides: _bundle.overrides || { edits: {}, deletedIds: [], addedItems: [] },
            };
          } else {
            syncMeta = await httpJson(withKeyParam(base + '/api/v1/state', key), { key, timeout: 20000 });
          }
        }

        if (!syncMeta || syncMeta.ok === false) {
          throw new Error(syncMeta?.error || '同步状态返回异常');
        }

        const remoteVer = String(syncMeta.version || 'v8');
        const needStatic = force || !_bundle.catalog || !_bundle.profiles || !_bundle.engineJs || !globalThis.PelicanFingerprintEngine?._conditionedV3 || _bundle.version !== remoteVer;

        let nextCatalog = _bundle.catalog;
        let nextProfiles = _bundle.profiles;
        let nextEngineJs = _bundle.engineJs || '';

        if (needStatic) {
          const catPath = syncMeta?.staticAssets?.catalogUrl || ('/data/catalog.json?v=' + encodeURIComponent(remoteVer));
          const profPath = syncMeta?.staticAssets?.profilesUrl || ('/data/model-profiles.json?v=' + encodeURIComponent(remoteVer));
          const engPath = syncMeta?.staticAssets?.engineUrl || ('/assets/fingerprint-engine.js?v=' + encodeURIComponent(remoteVer));

          const fetchStaticJson = async (rel) => {
            try {
              return JSON.parse(await httpText(base + rel, { long: true, withAuth: false, timeout: 45000 }));
            } catch {
              return await httpJson(withKeyParam(base + rel, key), { key, long: true, timeout: 45000 });
            }
          };

          const [catData, profData, engTxt] = await Promise.all([
            fetchStaticJson(catPath),
            fetchStaticJson(profPath),
            httpText(base + engPath, { withAuth: false, timeout: 25000 }).catch(() =>
              httpText(withKeyParam(base + engPath, key), { key, withAuth: true, timeout: 25000 }).catch(() => '')
            ),
          ]);
          if (catData && Array.isArray(catData.items)) nextCatalog = catData;
          if (profData && Array.isArray(profData.vocab)) nextProfiles = profData;
          if (engTxt && engTxt.includes('PelicanFingerprintEngine')) {
            nextEngineJs = engTxt;
            applyDynamicEngine(engTxt);
          }
        }

        _bundle = {
          syncedAt: Date.now(),
          version: remoteVer,
          role: String(syncMeta.role || ''),
          githubConfigured: Boolean(syncMeta.githubConfigured),
          catalog: nextCatalog,
          profiles: nextProfiles,
          overrides: syncMeta.overrides || { edits: {}, deletedIds: [], addedItems: [] },
          engineJs: nextEngineJs,
        };
        _syncRev++;
        _htmlCache.clear();

        try {
          if (typeof Host !== 'undefined' && Host.shared) {
            await Host.shared(BUNDLE_KEY, _bundle);
          }
        } catch {}

        _syncing = null;
        emitChange();
        try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(); } catch {}
        try { if (typeof PelicanShots !== 'undefined' && typeof PelicanShots.table?.refreshOpen === 'function') PelicanShots.table.refreshOpen(); } catch {}

        const st = status();
        if (!quiet && typeof toast === 'function') {
          toast('已同步醍醐识别库 · ' + st.specimenCount + ' 份样本 / ' + st.modelCount + ' 个型号，正在更新全部鹈鹕对话识别…', 'ok');
        }

        if (!skipRetroScan) {
          void scanAndRecognizeAllChats({ forceLoadUncached: true, quiet });
        }

        return { ok: true, status: st };
      } catch (err) {
        _lastErr = String(err?.message || err || '同步失败');
        emitChange();
        if (!quiet && typeof toast === 'function') {
          toast('醍醐识别库同步失败：' + _lastErr, 'err');
        }
        return { ok: false, error: _lastErr };
      } finally {
        _syncing = null;
        emitChange();
      }
    })();
    return _syncing;
  }

  const NON_ARENA_BENCHMARK_RE = /\b(?:doubao|longcat|union-alpha|ox-alpha|gpt-5\.3-codex|grok-build|grok-4\.2\b|claude-(?:opus|sonnet|haiku)-4\.[567]\b|gemini-3-(?:pro|flash)\b|q4[_-]k[_-]m|iq3[_-]s)\b/i;
  const ARENA_OPEN_MODEL_RE = /\b(?:deepseek|qwen|alibaba|glm|zhipu|zai|kimi|moonshot|minimax|mimo|xiaomi|hunyuan|tencent|hy[34]|step|stepfun|beam|mistral|llama|nemotron|gpt-oss|gemma|inkling|muse-spark-open)\b/i;

  function classifyArenaTihuDomain(m) {
    const s = (String(m?.id || '') + ' ' + String(m?.vendor || '') + ' ' + String(m?.label || '') + ' ' + String(m?.family || '')).toLowerCase();
    const isNonArenaExternal = NON_ARENA_BENCHMARK_RE.test(s);
    const isOpen = ARENA_OPEN_MODEL_RE.test(s);
    const vId = mapTihuVendorId(m?.vendor, m?.id || m?.label);
    return { isNonArenaExternal, isOpen, vendorId: vId };
  }

  function extractChatConstraints(sid, chatObj, known, opts = {}) {
    const msgs = Array.isArray(chatObj?.messages) ? chatObj.messages : [];
    const asstMsgs = msgs.filter(m => m && m.role === 'assistant' && !m.failed && m.status !== 'failed' && m.status !== 'pending');
    let totalVisR = 0;
    let totalHidR = 0;
    let turnVisR = 0;
    let turnHidR = 0;
    let hardVendor = '';

    const inspectParts = (m, isTargetTurn) => {
      const parts = Array.isArray(m?.parts) ? m.parts : [];
      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        if (p.type === 'reasoning' || p.type === 'thinking') {
          const rTxt = String(p.reasoning ?? p.text ?? p.content ?? '').trim();
          if (rTxt.length > 0 && !/^\[?(?:redacted|encrypted|empty)\]?$/i.test(rTxt)) {
            totalVisR++;
            if (isTargetTurn) turnVisR++;
          } else {
            totalHidR++;
            if (isTargetTurn) turnHidR++;
          }
        } else if (p.type === 'tool-invocation' || p.type === 'tool_use' || p.toolInvocation) {
          const ti = p.toolInvocation || p;
          const tcId = String(ti.toolCallId || ti.id || '');
          if (/^(?:toolu|srvtoolu)_01/.test(tcId)) {
            if (isTargetTurn || !hardVendor) hardVendor = 'anthropic';
          } else if (/^call_[A-Za-z0-9]{24}$/.test(tcId) && /[A-Z]/.test(tcId) && /[a-z]/.test(tcId)) {
            if (isTargetTurn || !hardVendor) hardVendor = 'openai';
          }
        }
      }
      if (typeof m?.reasoning === 'string' && m.reasoning.trim().length > 0) {
        totalVisR++;
        if (isTargetTurn) turnVisR++;
      }
    };

    const targetTurnIdx = Number.isInteger(opts.turnIndex) && opts.turnIndex >= 0 ? opts.turnIndex : -1;
    let targetAsstMsgId = '';
    let targetAsstSeen = 0;
    let curTurn = -1;
    let lastRole = '';
    // V12: 当指定了目标轮次（如中途路由后的最新一次「测鹈鹕」轮次），严格隔离该轮次的协议工具 ID 与思考链特征，禁止被首轮特征污染
    hardVendor = '';
    for (const m of msgs) {
      if (!m) continue;
      if (m.role === 'user' && lastRole !== 'user') curTurn++;
      lastRole = m.role;
      if (m.role === 'assistant' && !m.failed && m.status !== 'failed' && m.status !== 'pending') {
        const isTarget = targetTurnIdx >= 0 && curTurn === targetTurnIdx;
        if (targetTurnIdx >= 0) {
          if (isTarget) {
            targetAsstSeen++;
            if (m.id) targetAsstMsgId = m.id;
            inspectParts(m, true);
          }
        } else {
          inspectParts(m, false);
        }
      }
    }

    let isOpenThink = null;
    if (targetTurnIdx >= 0) {
      if (turnVisR > 0 || turnHidR > 0) {
        isOpenThink = turnVisR > 0;
      } else if (targetAsstSeen > 0) {
        isOpenThink = false;
      }
    } else if (totalVisR > 0) {
      isOpenThink = true;
    } else if (totalHidR > 0 || asstMsgs.length > 0) {
      if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && chatObj) {
        try {
          if (BillingProbe.shouldSkipCostForOpenSource(chatObj)) isOpenThink = true;
        } catch {}
      }
      if (isOpenThink === null) isOpenThink = false;
    } else if (known?.habitFeatures && typeof known.habitFeatures.isOpenThink === 'boolean') {
      isOpenThink = Boolean(known.habitFeatures.isOpenThink);
    } else if (known?.openSource === true) {
      isOpenThink = true;
    }

    let billingRouteSwitched = false;
    let billingEffortDowngraded = false;
    let billingRouteFrom = '';
    let billingRouteTo = '';
    let costScoreBySlug = null;

    // V12: 优先从客户端当前 BillingProbe 实时路由分段诊断提取路由后候选池 (routedCandidates) 与路由切换证据
    if (chatObj && typeof BillingProbe !== 'undefined' && typeof BillingProbe.summary === 'function') {
      try {
        const bpSum = BillingProbe.summary(chatObj);
        const diag = bpSum?.diagnostics;
        if (diag) {
          billingRouteSwitched = Boolean(diag.routeSwitched);
          billingEffortDowngraded = Boolean(diag.effortDowngraded);
          billingRouteFrom = String(diag.preRouteModelLabel || diag.preRouteBest?.label || diag.preRouteBest?.id || '').trim();
          billingRouteTo = String(diag.routedModelLabel || diag.routedBest?.label || diag.routedBest?.id || '').trim();
          if (Number(diag?.samples?.observations || 0) > 0) {
            const rawPool = (diag.routeSwitched && Array.isArray(diag.routedCandidates) && diag.routedCandidates.length > 0)
              ? diag.routedCandidates
              : (Array.isArray(diag.candidates) ? diag.candidates : []);
            const realPool = rawPool.filter(rc =>
              rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode &&
              rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && !rc.tihuLocked
            );
            if (realPool.length > 0) {
              const m = new Map();
              for (const rc of realPool) {
                const slug = alnumSlug(rc.stealthModelLabel || rc.dynamicLabel || rc.label || rc.id || '');
                const sc = Number(rc.revPct ?? rc.match ?? rc.probability ?? 0);
                if (slug && sc > (m.get(slug) || 0)) m.set(slug, Math.min(99.5, sc));
              }
              if (m.size > 0) costScoreBySlug = m;
            }
          }
        }
      } catch {}
    }

    const hasRealCost = Boolean(
      (costScoreBySlug && costScoreBySlug.size > 0) ||
      (Number(known?.costUsd) > 0) ||
      (Number(known?.reverseTokens?.total) > 0 && known?.reverseTokens?.source !== 'estimated-stream')
    );

    const knownMatchesTurn = Boolean(targetAsstMsgId && known?.lastMessageId && known.lastMessageId === targetAsstMsgId && (known._tihuEngineFixVer || 0) >= 15);
    if (!costScoreBySlug && hasRealCost && knownMatchesTurn && Array.isArray(known?.reverseCandidates) && known.reverseCandidates.length > 0) {
      const realPool = known.reverseCandidates.filter(rc =>
        rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode &&
        rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && !rc.tihuLocked
      );
      if (realPool.length > 0) {
        const m = new Map();
        for (const rc of realPool) {
          const slug = alnumSlug(rc.stealthModelLabel || rc.dynamicLabel || rc.label || rc.id || '');
          const sc = Number(rc.revPct ?? rc.match ?? rc.probability ?? 0);
          if (slug && sc > (m.get(slug) || 0)) m.set(slug, Math.min(99.5, sc));
        }
        if (m.size > 0) costScoreBySlug = m;
      }
    }

    return {
      isOpenThink,
      strictOpenClosed: isOpenThink !== null,
      hardVendor,
      hasRealCost: Boolean(costScoreBySlug && costScoreBySlug.size > 0),
      costScoreBySlug,
      costFamilySet: null,
      totalVisR,
      totalHidR,
      billingRouteSwitched,
      billingEffortDowngraded,
      billingRouteFrom,
      billingRouteTo,
    };
  }

  function lookupSoftCostScore(costScoreBySlug, modelIdOrLabel) {
    if (!(costScoreBySlug instanceof Map) || costScoreBySlug.size === 0) return null;
    const mSlug = alnumSlug(modelIdOrLabel || '');
    if (!mSlug) return 22;
    if (costScoreBySlug.has(mSlug)) return costScoreBySlug.get(mSlug);
    let best = 0;
    for (const [cSlug, sc] of costScoreBySlug.entries()) {
      if (cSlug.includes(mSlug) || mSlug.includes(cSlug)) {
        if (sc > best) best = sc;
      }
    }
    if (best > 0) return best;
    // Arena 模型重命名或调价时（如 gpt-6-luna 与 gpt-6-sol 价格接近），未在旧目录命中同价档的同厂商模型给予 35 分软兜底而非一票否决
    const mVendor = mapTihuVendorId('', modelIdOrLabel);
    for (const [cSlug, sc] of costScoreBySlug.entries()) {
      if (sc >= 75 && mapTihuVendorId('', cSlug) === mVendor) return 35;
    }
    return 18;
  }

  function buildArenaModelFilter(domainOpts = null) {
    if (!domainOpts || typeof domainOpts !== 'object') return null;
    const strictOC = domainOpts.strictOpenClosed !== false && typeof domainOpts.isOpenThink === 'boolean';
    const wantOpen = Boolean(domainOpts.isOpenThink);
    const hardVendor = String(domainOpts.hardVendor || '').toLowerCase();

    const subMeta = _bundle?.profiles?.subModelMeta || {};
    const subKeys = Object.keys(subMeta);

    let useHardVendor = Boolean(hardVendor);
    if (useHardVendor && subKeys.length > 0) {
      const hasAnyVendor = subKeys.some(k => {
        const meta = { id: k, ...subMeta[k] };
        const d = classifyArenaTihuDomain(meta);
        return !d.isNonArenaExternal && d.vendorId === hardVendor;
      });
      if (!hasAnyVendor) useHardVendor = false;
    }

    return (m) => {
      const d = classifyArenaTihuDomain(m);
      if (d.isNonArenaExternal) return false;
      if (strictOC && d.isOpen !== wantOpen) return false;
      if (useHardVendor && d.vendorId !== hardVendor) return false;
      return true;
    };
  }

  function conditionFallbackPostProcess(res, modelFilter) {
    if (!res || typeof modelFilter !== 'function') return res;
    const fullList = Array.isArray(res.allModels) && res.allModels.length
      ? res.allModels
      : (Array.isArray(res.topModels) ? res.topModels : []);
    const filtered = fullList.filter(m => m && modelFilter(m));
    if (!filtered.length) return res;
    const mass = filtered.reduce((acc, m) => acc + (Number(m.probability) || 0), 0);
    const renorm = filtered.map(m => ({
      ...m,
      probability: mass > 1e-9 ? Number(((Number(m.probability) || 0) / mass).toFixed(4)) : Number((1 / filtered.length).toFixed(4)),
    })).sort((a, b) => b.probability - a.probability);
    const primary = renorm[0];
    let exactMatch = res.exactArchiveMatch || res.exactHashMatch || null;
    if (exactMatch && !modelFilter({ id: exactMatch.subModelId || exactMatch.displayModel, label: exactMatch.displayModel, vendor: exactMatch.vendor, family: exactMatch.family })) {
      exactMatch = null;
    }
    return {
      ...res,
      exactArchiveMatch: exactMatch,
      detectedModel: {
        ...(res.detectedModel || {}),
        id: primary.id,
        label: primary.label,
        vendor: primary.vendor,
        family: primary.family,
        arenaRank: primary.arenaRank ?? null,
        rarity: primary.rarity || 'normal',
        probability: primary.probability,
      },
      topModels: renorm.slice(0, 6),
      allModels: renorm,
      tihuConditioned: true,
    };
  }

  function identifySync(rawCode, domainOpts = null) {
    if (!isReady() || !rawCode || String(rawCode).length < 60) return null;
    const eng = globalThis.PelicanFingerprintEngine;
    if (!eng || typeof eng.identifyHtmlSync !== 'function') return null;
    try {
      const modelFilter = domainOpts ? buildArenaModelFilter(domainOpts) : null;
      const ov = modelFilter
        ? { ...(_bundle.overrides || {}), _modelFilter: modelFilter }
        : _bundle.overrides;
      let res = eng.identifyHtmlSync(String(rawCode), _bundle.profiles, ov);
      if (!res || res.error) return null;
      if (modelFilter && !eng._conditionedV3) {
        res = conditionFallbackPostProcess(res, modelFilter);
      } else if (modelFilter) {
        res.tihuConditioned = true;
      }
      return res;
    } catch {
      return null;
    }
  }

  function mapTihuVendorId(v, idOrLabel) {
    const s = (String(v || '') + ' ' + String(idOrLabel || '')).toLowerCase();
    if (/anthropic|claude|opus|sonnet|haiku|fable/.test(s)) return 'anthropic';
    if (/google|gemini|argon|carbon|gemma/.test(s)) return 'google';
    if (/openai|gpt|\bsol\b|astra|luna|terra|codex/.test(s)) return 'openai';
    if (/meta|muse|llama|maverick/.test(s)) return 'meta';
    if (/deepseek|beam/.test(s)) return 'deepseek';
    if (/qwen|alibaba/.test(s)) return 'qwen';
    if (/zhipu|glm|zai/.test(s)) return 'zhipu';
    if (/xai|x-ai|grok/.test(s)) return 'xai';
    if (/moonshot|kimi/.test(s)) return 'moonshot';
    if (/xiaomi|mimo/.test(s)) return 'xiaomi';
    if (/minimax/.test(s)) return 'minimax';
    if (/tencent|hunyuan|\bhy[34]\b/.test(s)) return 'tencent';
    if (/doubao|bytedance|seed/.test(s)) return 'bytedance';
    if (/mistral/.test(s)) return 'mistral';
    return String(v || 'compat').toLowerCase();
  }

  function normSlug(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/^[a-z0-9_-]+\//, '')
      .replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max|standard)\)\s*$/i, '')
      .replace(/-(?:20\d{6}|latest|exp)$/i, '')
      .replace(/-(?:thinking(?:-\d+k)?|preview(?:-\d{2}-\d{2})?)$/i, '')
      .replace(/-(?:none|minimal|low|medium|high|xhigh|max|standard)$/i, '')
      .replace(/[?？]+$/, '')
      .replace(/[\s_]+/g, '-')
      .replace(/(opus|sonnet|haiku|fable|gpt|gemini|spark|glm|qwen|deepseek|grok|kimi|mimo|minimax|seed)-(\d+)-(\d+)(?=-|$)/g, '$1-$2.$3');
  }

  function alnumSlug(s) {
    return normSlug(s).replace(/[^a-z0-9]/g, '');
  }

  function resolveCanonicalIdentity(rawIdOrLabel, vendorRaw, tierRaw) {
    const vId = mapTihuVendorId(vendorRaw, rawIdOrLabel);
    const baseFam = normSlug(rawIdOrLabel);
    const tier = TIER_LIST.includes(String(tierRaw || '').toLowerCase()) ? String(tierRaw).toLowerCase() : 'high';
    const hasTier = !ARENA_OPEN_MODEL_RE.test(baseFam) && !/^(?:muse-wonder|solar-pro4|kibitz|kalmia|horizon|cynosure)/.test(baseFam) && baseFam !== 'other';
    const eff = hasTier ? tier : 'standard';

    if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.decomposeModelIdentity === 'function') {
      try {
        const fullSlug = eff !== 'standard' ? (baseFam + '-' + eff) : baseFam;
        const d = ChatHabitFingerprint.decomposeModelIdentity(fullSlug, {
          vendor: vId,
          family: baseFam,
          effort: eff,
          rawLabel: String(rawIdOrLabel || baseFam),
        });
        if (d?.canon) return d;
      } catch {}
    }

    const effCap = { low: 'Low', medium: 'Medium', high: 'High', max: 'Max', xhigh: 'xHigh', standard: '' }[eff] || 'High';
    const prettyFam = baseFam
      .split('-')
      .map(w => /^(gpt|glm|mimo|ai)$/i.test(w) ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
    const displayLabel = effCap ? (prettyFam + ' (' + effCap + ')') : prettyFam;
    const canon = eff !== 'standard' ? (baseFam + '-' + eff) : baseFam;
    return {
      vendor: vId,
      vendorLabel: vId.charAt(0).toUpperCase() + vId.slice(1),
      family: baseFam,
      familyLabel: prettyFam,
      effort: eff,
      effortLabel: effCap || '标准',
      hasExplicitTier: eff !== 'standard',
      slugCanon: canon,
      canon,
      displayLabel,
    };
  }

  function resolveBestTihuEffort(tRes, rawCode = '') {
    const exact = tRes?.exactArchiveMatch || tRes?.exactHashMatch;
    if (exact && TIER_LIST.includes(String(exact.tier || '').toLowerCase())) {
      return String(exact.tier).toLowerCase();
    }
    const detSlug = normSlug(tRes?.detectedModel?.id || tRes?.detectedModel?.label || '');
    const effConf = Number(tRes?.effortConfidence) || 0;
    const rawTier = String(tRes?.effortTier || '').toLowerCase();
    const nearList = Array.isArray(tRes?.nearestSpecimens) ? tRes.nearestSpecimens : (Array.isArray(tRes?.nearest) ? tRes.nearest : []);
    if (nearList.length > 0 && (!TIER_LIST.includes(rawTier) || effConf < 0.42)) {
      const sameNeighbors = nearList.filter(n => normSlug(n?.displayModel || n?.model || '') === detSlug && TIER_LIST.includes(String(n?.tier || '').toLowerCase()) && Number(n?.similarity ?? n?.sim ?? 0) >= 0.76);
      if (sameNeighbors.length > 0) {
        return String(sameNeighbors[0].tier).toLowerCase();
      }
    }
    if (detSlug === 'muse-spark-1.3') {
      const codeStr = String(rawCode || '');
      if (!TIER_LIST.includes(rawTier) || (rawTier === 'low' && effConf < 0.55 && codeStr.length >= 11500 && /requestAnimationFrame|@keyframes/i.test(codeStr))) {
        return 'max';
      }
    }
    return TIER_LIST.includes(rawTier) ? rawTier : 'high';
  }

  function fuseScores(scores, targetRaw, helpers = {}) {
    if (!Array.isArray(scores) || !isReady()) return null;
    const {
      decomposeModelIdentity,
      formatDisplayModelLabel,
      isOpenName,
      tieredFamilies,
      strictOpenClosed = true,
      isOpenThink = null,
      hardVendor = '',
      isPelicanLockedTurn = false,
    } = helpers;

    const domainOpts = (typeof isOpenThink === 'boolean' || hardVendor)
      ? { isOpenThink: typeof isOpenThink === 'boolean' ? isOpenThink : undefined, strictOpenClosed: Boolean(strictOpenClosed && typeof isOpenThink === 'boolean'), hardVendor }
      : { strictOpenClosed: false };

    const tRes = identifySync(targetRaw, domainOpts);
    if (!tRes || !tRes.detectedModel) return null;

    let maxPreV24Score = 0;
    for (const s of scores) {
      if (!s) continue;
      const sSlug = normSlug(s.family || s.model_id || s.canon || s.label || "");
      const sIsOpen = typeof isOpenName === 'function' ? Boolean(isOpenName(sSlug || s.label)) : ARENA_OPEN_MODEL_RE.test(sSlug);
      if (NON_ARENA_BENCHMARK_RE.test(sSlug)) {
        s.score = 0.01;
        s.ruleScore = 0;
        s._rule = 0;
        continue;
      }
      if (domainOpts.strictOpenClosed && typeof domainOpts.isOpenThink === 'boolean' && sIsOpen !== domainOpts.isOpenThink) {
        s.score = 0.01;
        s.ruleScore = 0;
        s._rule = 0;
        continue;
      }
      if (domainOpts.hardVendor && s.vendorId && String(s.vendorId).toLowerCase() !== String(domainOpts.hardVendor).toLowerCase()) {
        s.score = Math.min(Number(s.score || 0), 0.12);
        s.ruleScore = Math.min(Number(s.ruleScore || 0), 0.10);
        s._rule = s.ruleScore;
        continue;
      }
      if (Number(s.score || 0) > maxPreV24Score) maxPreV24Score = Number(s.score || 0);
    }

    const tEffort = resolveBestTihuEffort(tRes, targetRaw);
    const effConf = Number(tRes.effortConfidence) || 0;
    const hasTiered = slug => tieredFamilies instanceof Set
      ? tieredFamilies.has(slug)
      : (!ARENA_OPEN_MODEL_RE.test(slug) && !/^(?:muse-wonder|solar-pro4|kibitz|kalmia|horizon|cynosure)/.test(slug) && slug !== 'other');

    const matchScoreEntry = (candId, candLabel) => {
      const cNorm = alnumSlug(candId || candLabel);
      if (!cNorm || cNorm === 'other') return null;
      let hit = scores.find(s => alnumSlug(s.family || s.model_id) === cNorm);
      if (!hit) {
        hit = scores.find(s => {
          const sf = alnumSlug(s.family || s.model_id);
          return sf && (sf.includes(cNorm) || cNorm.includes(sf));
        });
      }
      return hit || null;
    };

    const allRankedForVendor = Array.isArray(tRes.allModels) && tRes.allModels.length ? tRes.allModels : (Array.isArray(tRes.topModels) ? tRes.topModels : []);
    const vendorMassMap = new Map();
    for (const m of allRankedForVendor) {
      if (!m) continue;
      const vid = mapTihuVendorId(m.vendor, m.id || m.label);
      vendorMassMap.set(vid, (vendorMassMap.get(vid) || 0) + (Number(m.probability) || 0));
    }

    const injectOrUpdate = (cand, boost, forceTier, reasonTag, forceExact = false, isPrimaryWinner = false) => {
      if (!cand) return null;
      const prob = Number(cand.probability) || 0;
      const vId = mapTihuVendorId(cand.vendor, cand.id || cand.label);
      const vendorProb = Number((vendorMassMap.get(vId) || prob).toFixed(4));
      const rawSlug = normSlug(cand.id || cand.family || cand.label);
      if (!rawSlug || rawSlug === 'other') return null;
      const hit = matchScoreEntry(cand.id, cand.label);
      const useTier = forceTier || (hasTiered(rawSlug) ? tEffort : (hit?.effort || 'standard'));
      const isAuthoritative = Boolean(
        forceExact ||
        (isPrimaryWinner && (isPelicanLockedTurn ? (prob >= 0.14 || vendorProb >= 0.45) : (prob >= 0.34 || (prob >= 0.24 && vendorProb >= 0.58))))
      );

      if (hit) {
        if (forceExact) {
          hit.score = 0.996;
          hit.protoSim = 1;
          hit.ruleScore = Math.max(Number(hit.ruleScore || 0), 0.99);
          hit._rule = Math.max(Number(hit._rule || 0), 0.99);
          hit._bestSim = 1;
        } else {
          const tihuTargetScore = isPrimaryWinner
            ? Math.max(isAuthoritative ? Math.min(0.99, Math.max(0.86, maxPreV24Score + 0.035)) : 0.76, 0.62 + 0.36 * prob)
            : (Number(hit.score || 0) + boost);
          hit.score = +Math.max(Number(hit.score || 0) + boost, tihuTargetScore).toFixed(4);
          if (isPrimaryWinner || prob >= 0.30) {
            hit.ruleScore = +Math.max(Number(hit.ruleScore || 0), Math.min(0.96, (isAuthoritative ? 0.74 : 0.66) + 0.24 * prob)).toFixed(3);
            hit._rule = hit.ruleScore;
            hit.protoSim = +Math.max(Number(hit.protoSim || 0), Math.min(0.98, 0.88 + 0.10 * prob)).toFixed(3);
            hit._bestSim = hit.protoSim;
          }
        }
        hit.tihuProb = prob;
        hit.tihuVendorProb = vendorProb;
        hit.tihuEffort = useTier;
        hit.tihuEffortConf = effConf;
        hit.tihuExact = Boolean(forceExact);
        hit.tihuAuthoritative = isAuthoritative;

        if (useTier && useTier !== 'standard' && (forceExact || isPrimaryWinner || effConf >= 0.30) && hasTiered(hit.family || rawSlug)) {
          const decomp = typeof decomposeModelIdentity === 'function'
            ? decomposeModelIdentity(normSlug(hit.family || rawSlug) + '-' + useTier, {
                vendor: vId,
                family: normSlug(hit.family || rawSlug),
                effort: useTier,
                rawLabel: cand.label || hit.label,
              })
            : resolveCanonicalIdentity(hit.family || rawSlug, vId, useTier);
          if (decomp?.canon) {
            hit.canon = decomp.canon;
            hit.label = decomp.displayLabel || (typeof formatDisplayModelLabel === 'function' ? formatDisplayModelLabel(decomp.canon, cand.label) : decomp.canon);
            hit.effort = decomp.effort || useTier;
            hit.rawEffort = useTier;
            hit.effortLabel = decomp.effortLabel || useTier;
          }
        }
        if (reasonTag && Array.isArray(hit.reasons) && !hit.reasons.includes(reasonTag)) {
          hit.reasons.unshift(reasonTag);
        }
        return hit;
      }

      if (forceExact || isPrimaryWinner || prob >= 0.12) {
        const d = typeof decomposeModelIdentity === 'function'
          ? decomposeModelIdentity(useTier && useTier !== 'standard' ? (rawSlug + '-' + useTier) : rawSlug, {
              vendor: vId,
              family: rawSlug,
              effort: useTier || 'high',
              rawLabel: cand.label || rawSlug,
            })
          : resolveCanonicalIdentity(rawSlug, vId, useTier);
        const isOpen = typeof isOpenName === 'function' ? Boolean(isOpenName(d.canon || d.family || rawSlug)) : ARENA_OPEN_MODEL_RE.test(rawSlug);
        if (strictOpenClosed && typeof isOpenThink === 'boolean' && isOpen !== isOpenThink && !forceExact) return null;
        const baseScore = forceExact ? 0.996 : +(Math.max(isAuthoritative ? 0.84 : 0.74, 0.62 + 0.36 * prob)).toFixed(4);
        const ruleSc = forceExact ? 0.99 : +(Math.min(0.96, (isAuthoritative ? 0.74 : 0.66) + 0.24 * prob)).toFixed(3);
        const simSc = forceExact ? 1 : +(Math.min(0.98, 0.88 + 0.10 * prob)).toFixed(3);
        const entry = {
          model_id: vId + '/' + rawSlug,
          canon: d.canon || rawSlug,
          label: d.displayLabel || cand.label || rawSlug,
          vendor: d.vendorLabel || cand.vendor || vId,
          vendorId: d.vendor || vId,
          family: d.family || rawSlug,
          familyLabel: d.familyLabel || cand.label || rawSlug,
          effort: d.effort || useTier || 'high',
          rawEffort: useTier || 'high',
          effortLabel: d.effortLabel || useTier || 'high',
          isOpen,
          score: baseScore,
          protoSim: simSc,
          tokenNorm: +Math.max(0.65, prob).toFixed(3),
          ruleScore: ruleSc,
          _bestSim: simSc,
          _rule: ruleSc,
          tihuProb: prob,
          tihuVendorProb: vendorProb,
          tihuEffort: useTier || 'high',
          tihuEffortConf: effConf,
          tihuExact: Boolean(forceExact),
          tihuAuthoritative: isAuthoritative,
          reasons: [reasonTag || ('醍醐指纹:' + (d.displayLabel || cand.label || rawSlug))],
        };
        scores.push(entry);
        return entry;
      }
      return null;
    };

    const exact = tRes.exactArchiveMatch || tRes.exactHashMatch;
    if (exact && (exact.matched || exact.id || exact.subModelId || exact.displayModel)) {
      injectOrUpdate(
        {
          id: exact.subModelId || tRes.detectedModel.id,
          label: exact.displayModel || tRes.detectedModel.label,
          vendor: exact.vendor || tRes.detectedModel.vendor,
          probability: 1,
        },
        0.42,
        TIER_LIST.includes(exact.tier) ? exact.tier : tEffort,
        '🦩 醍醐库精确匹配:' + (exact.displayModel || tRes.detectedModel.label) + ' (' + String(exact.tier || tEffort).toUpperCase() + ')',
        true,
        true
      );
    } else {
      const ranked = Array.isArray(tRes.topModels) && tRes.topModels.length
        ? tRes.topModels
        : [tRes.detectedModel];
      ranked.slice(0, 6).forEach((cand, idx) => {
        if (!cand) return;
        const p = Number(cand.probability) || 0;
        if (idx > 0 && p < 0.05) return;
        const boost = idx === 0 ? Math.max(0.24, 0.34 * p) : Math.min(0.14, 0.16 * p);
        injectOrUpdate(
          cand,
          boost,
          idx === 0 ? tEffort : null,
          idx === 0
            ? ('🦩 醍醐条件后验:' + (cand.label || cand.id) + ' (' + tEffort.toUpperCase() + ') ' + Math.round(p * 100) + '%')
            : (p >= 0.20 ? ('醍醐候选:' + (cand.label || cand.id) + ' ' + Math.round(p * 100) + '%') : ''),
          false,
          idx === 0
        );
      });
    }

    scores.sort((a, b) => b.score - a.score);
    if (scores.length >= 2 && scores[0].tihuAuthoritative && !scores[1].tihuExact && scores[0].score <= scores[1].score + 0.04) {
      scores[0].score = +(scores[1].score + 0.065).toFixed(4);
    }
    return tRes;
  }

  function extractGeneralHtmlFromChat(chatObj) {
    if (!chatObj || typeof chatObj !== 'object') return null;
    if (chatObj.files && typeof chatObj.files === 'object') {
      const entries = Object.entries(chatObj.files);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [rawP, rawV] = entries[i];
        const p = normArtPath(rawP);
        if (!/\.(?:html?|svg)$/i.test(p)) continue;
        const txt = typeof rawV === 'string' ? rawV : String(rawV?.content ?? rawV?.text ?? '');
        if (!isStubHtmlText(txt) && txt.length >= 320 && /(?:<!doctype\s+html|<html\b|<svg\b)/i.test(txt)) {
          return { matched: true, isPelican: false, html: txt, path: p };
        }
      }
    }
    const msgs = Array.isArray(chatObj.messages) ? chatObj.messages : [];
    const sKey0 = String(chatObj.sid || chatObj.id || '').trim();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m || m.role !== 'assistant' || m.failed || m.status === 'failed') continue;
      const art = extractAssistantTurnArtifacts(sKey0, chatObj, [m]);
      for (const c of (art?.found || [])) {
        const htmlTxt = c?.html || c?.code || '';
        if (htmlTxt && !isStubHtmlText(htmlTxt) && htmlTxt.length >= 320 && /(?:<!doctype\s+html|<html\b|<svg\b)/i.test(htmlTxt)) {
          return { matched: true, isPelican: false, html: htmlTxt, path: c.path || '' };
        }
      }
    }
    return null;
  }

  function buildCalibratedHtmlModels(tRes, rawHtml = '') {
    if (!tRes || !tRes.detectedModel) return { isExact: false, chosenTier: 'high', models: [] };
    const exact = tRes.exactArchiveMatch || tRes.exactHashMatch;
    const isExact = Boolean(exact && (exact.matched || exact.id || exact.subModelId || exact.displayModel));
    const chosenTier = isExact && TIER_LIST.includes(String(exact.tier || '').toLowerCase())
      ? String(exact.tier).toLowerCase()
      : resolveBestTihuEffort(tRes, rawHtml);

    const srcList = Array.isArray(tRes.allModels) && tRes.allModels.length
      ? tRes.allModels
      : (Array.isArray(tRes.topModels) && tRes.topModels.length ? tRes.topModels : [tRes.detectedModel]);

    const pMax = Math.max(0.01, ...srcList.map(x => Number(x?.probability) || 0));
    const out = [];
    const seen = new Set();

    if (isExact) {
      const exDecomp = resolveCanonicalIdentity(exact.subModelId || tRes.detectedModel.id, exact.vendor || tRes.detectedModel.vendor, chosenTier);
      seen.add(exDecomp.canon);
      out.push({
        id: exDecomp.canon,
        family: exDecomp.family,
        canon: exDecomp.canon,
        label: exDecomp.displayLabel,
        displayLabel: exDecomp.displayLabel,
        vendor: exDecomp.vendor,
        vendorLabel: exDecomp.vendorLabel,
        tier: chosenTier,
        probability: 1,
        htmlConf: 99.6,
        isExact: true,
      });
    }

    for (let idx = 0; idx < srcList.length && out.length < 10; idx++) {
      const m = srcList[idx];
      if (!m) continue;
      const tierUse = idx === 0 && !isExact ? chosenTier : (TIER_LIST.includes(String(m.tier || '').toLowerCase()) ? String(m.tier).toLowerCase() : chosenTier);
      const decomp = resolveCanonicalIdentity(m.id || m.label, m.vendor, tierUse);
      if (!decomp.canon || decomp.canon === 'other' || seen.has(decomp.canon)) continue;
      seen.add(decomp.canon);
      const p = Math.max(0, Number(m.probability) || 0);
      const r = Math.min(1, p / pMax);
      const htmlConf = isExact
        ? Math.round(Math.min(72, Math.max(24, 28 + 38 * p)) * 10) / 10
        : Math.round(Math.min(98.5, Math.max(24, 36 + 44 * r + 19 * p)) * 10) / 10;
      out.push({
        id: decomp.canon,
        family: decomp.family,
        canon: decomp.canon,
        label: decomp.displayLabel,
        displayLabel: decomp.displayLabel,
        vendor: decomp.vendor,
        vendorLabel: decomp.vendorLabel,
        tier: decomp.effort,
        probability: p,
        htmlConf,
        isExact: false,
      });
    }

    return { isExact, chosenTier, models: out };
  }

  function analyzeChatSync(sid, chatObj = null, known = null) {
    if (!isReady()) {
      if (Array.isArray(known?.tihuTopModels) && known.tihuTopModels.length > 0) {
        return {
          matched: true,
          isPelican: known.tihuIsPelican !== false,
          isExact: Boolean(known.tihuExact),
          chosenTier: String(known.tihuChosenTier || known.effort || known.tier || 'high'),
          models: known.tihuTopModels,
          fromPersisted: true,
        };
      }
      return null;
    }
    const sKey = String(sid || chatObj?.sid || '').trim();
    const mKnown = known || ((sKey && typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null);
    const cObj = chatObj || ((sKey && typeof Chats !== 'undefined' && Chats.get) ? Chats.get(sKey) : null);
    const msgs = Array.isArray(cObj?.messages) ? cObj.messages : [];

    if (!msgs.length && (!cObj?.files || !Object.keys(cObj.files).length)) {
      if (Array.isArray(mKnown?.tihuTopModels) && mKnown.tihuTopModels.length > 0 && (mKnown?._tihuEngineFixVer || 0) >= 15) {
        return {
          matched: true,
          isPelican: mKnown.tihuIsPelican !== false,
          isExact: Boolean(mKnown.tihuExact),
          chosenTier: String(mKnown.tihuChosenTier || mKnown.effort || mKnown.tier || 'high'),
          models: mKnown.tihuTopModels,
          fromPersisted: true,
        };
      }
      return null;
    }

    const lastMsg = msgs.at(-1);
    const fKeys = cObj?.files && typeof cObj.files === 'object' ? Object.keys(cObj.files).length : 0;
    const pvVer = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedVer === 'function') ? HtmlPreview.resolvedVer() : 0;
    const bpAt = (sKey && typeof BillingProbe !== 'undefined' && typeof BillingProbe.getLiveState === 'function') ? (BillingProbe.getLiveState(sKey)?.at || 0) : 0;
    const cacheKey = sKey + '|' + _syncRev + '|' + pvVer + '|' + bpAt + '|' + msgs.length + '|' + (lastMsg?.id || '') + '|' + fKeys + '|' + (mKnown?.openSource ? '1' : '0') + '|' + (mKnown?._tihuEngineFixVer || 0);
    if (sKey && _syncAnalyzeCache.has(cacheKey)) return _syncAnalyzeCache.get(cacheKey);

    const histItem = (sKey && typeof History !== 'undefined' && History.byId) ? History.byId(sKey) : null;
    const pel = extractPelicanTurnHtml(cObj, histItem, sKey);
    let targetHtml = '';
    let isPelican = false;
    let turnIndex = -1;
    let matchedKeyword = '';

    if (pel?.matched && pel.html) {
      targetHtml = pel.html;
      isPelican = true;
      turnIndex = Number.isInteger(pel.turnIndex) ? pel.turnIndex : -1;
      matchedKeyword = pel.matchedKeyword || 'pelican';
    } else {
      const gen = extractGeneralHtmlFromChat(cObj);
      if (gen?.matched && gen.html) {
        targetHtml = gen.html;
        isPelican = false;
      }
    }

    if (!targetHtml) {
      if (sKey && Array.isArray(mKnown?.tihuTopModels) && mKnown.tihuTopModels.length > 0 && (mKnown?._tihuEngineFixVer || 0) >= 15 && !pel?.hasNewerUnhealedStub) {
        return {
          matched: true,
          isPelican: mKnown.tihuIsPelican !== false,
          isExact: Boolean(mKnown.tihuExact),
          chosenTier: String(mKnown.tihuChosenTier || mKnown.effort || mKnown.tier || 'high'),
          models: mKnown.tihuTopModels,
          fromPersisted: true,
        };
      }
      return null;
    }

    const constraints = extractChatConstraints(sKey, cObj, mKnown, { turnIndex });
    const tRes = identifySync(targetHtml, constraints);
    if (!tRes || !tRes.detectedModel) return null;

    const calibrated = buildCalibratedHtmlModels(tRes, targetHtml);
    const out = {
      matched: true,
      isPelican,
      isExact: calibrated.isExact,
      chosenTier: calibrated.chosenTier,
      models: calibrated.models,
      matchedKeyword,
      constraints,
      tRes,
    };

    if (sKey) {
      if (_syncAnalyzeCache.size > 240) {
        const firstK = _syncAnalyzeCache.keys().next().value;
        if (firstK) _syncAnalyzeCache.delete(firstK);
      }
      _syncAnalyzeCache.set(cacheKey, out);
    }
    return out;
  }

  async function recognizePelicanChatAndApply(sid, chatObj, opts = {}) {
    if (!sid) return { matched: false, reason: 'no-sid' };
    if (!isReady() && _syncing) {
      try { await _syncing; } catch {}
    }
    if (!isReady()) return { matched: false, reason: 'not-ready' };
    const sKey = String(sid).trim();
    if (recognizePelicanChatAndApply._emitting?.has(sKey)) return { matched: false, skipped: 'reentrant-model-event' };
    if (!sKey || (typeof History !== 'undefined' && History.isGone?.(sKey))) return { matched: false, reason: 'deleted' };
    const known = (typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null;
    if (known?.userCorrected && !opts.clearUserCorrected) return { matched: false, skipped: 'user-corrected' };

    const histItem = (typeof History !== 'undefined' && History.byId) ? History.byId(sKey) : null;
    const isEval = Boolean(
      chatObj?.isEvaluation ||
      chatObj?.evalMode === 'battle' ||
      chatObj?.evalMode === 'direct' ||
      known?.directMode ||
      known?.battleRevealed ||
      histItem?.type === 'evaluation'
    );
    if (isEval && !opts.allowEval) return { matched: false, skipped: 'evaluation' };

    if (opts.allowHealStub !== false && chatObj?.messages?.length) {
      try { await healChatHtmlStubs(sKey, chatObj); } catch {}
    }

    let pel = extractPelicanTurnHtml(chatObj, histItem, sKey);

    if (!pel.matched && opts.allowHealStub !== false && Array.isArray(pel.stubPaths) && pel.stubPaths.length > 0) {
      if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.healFileText === 'function') {
        for (const sp of pel.stubPaths.slice(0, 6)) {
          try {
            const healed = await HtmlPreview.healFileText(sKey, sp);
            if (healed && !isStubHtmlText(healed) && healed.length >= 100) {
              _syncAnalyzeCache.clear();
              pel = extractPelicanTurnHtml(chatObj, histItem, sKey);
              if (!pel.matched) {
                pel = {
                  matched: true,
                  html: healed,
                  slotKey: 'file:' + (sp.split('/').pop() || sp).toLowerCase(),
                  path: sp,
                  turnIndex: (pel?.latestPelicanPromptTurn ?? -1) >= 0 ? pel.latestPelicanPromptTurn : Math.max(0, ((chatObj?.messages || []).filter(m => m?.role === 'user').length - 1)),
                  totalTurns: Math.max(1, (chatObj?.messages || []).filter(m => m?.role === 'user').length),
                  byPrompt: true,
                  byArtifact: PELICAN_KW_RE.test(healed),
                  matchedKeyword: 'pelican',
                  stubPaths: [],
                };
              }
              break;
            }
          } catch {}
        }
      }
    }

    if ((!pel.matched || !pel.html) && pel?.fallbackMatch?.html) {
      pel = pel.fallbackMatch;
    }

    if ((!pel.matched || !pel.html) && opts.allowHealStub !== false) {
      const wsPel = await readWorkspacePelicanHtml(sKey, chatObj, histItem, pel);
      if (wsPel?.matched && wsPel.html) pel = wsPel;
    }

    if (!pel.matched || !pel.html) return { matched: false };

    const constraints = extractChatConstraints(sKey, chatObj, known, { turnIndex: pel.turnIndex });
    const tRes = identifySync(pel.html, constraints);
    if (!tRes || !tRes.detectedModel) return { matched: false, reason: 'identify-empty' };

    let passiveHabit = null;
    if (chatObj?.messages?.length && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyze === 'function') {
      try {
        if (typeof ChatHabitFingerprint.clearAllCaches === 'function') ChatHabitFingerprint.clearAllCaches();
        passiveHabit = ChatHabitFingerprint.analyze(chatObj, known, { ignoreExactSid: true });
      } catch {}
    }

    const calibrated = buildCalibratedHtmlModels(tRes, pel.html);
    const isExact = calibrated.isExact;
    const htmlModels = calibrated.models;
    if (!htmlModels.length) return { matched: false, reason: 'empty-calibrated' };

    const habitBySlug = new Map();
    if (Array.isArray(passiveHabit?.candidates)) {
      for (const hc of passiveHabit.candidates) {
        const hs = alnumSlug(hc?.family || hc?.canon || hc?.label || hc?.id || '');
        const hv = Number(hc?.habitPct ?? hc?.match ?? 0);
        if (hs && hv > (habitBySlug.get(hs) || 0)) habitBySlug.set(hs, Math.min(86, hv));
      }
    }

    const hasRealCost = Boolean(constraints.hasRealCost && constraints.costScoreBySlug);
    const fusedModels = htmlModels.map(hm => {
      if (hm.isExact) return { ...hm, fusedConf: 99.6, costFused: hasRealCost };
      const mSlug = alnumSlug(hm.canon || hm.id || hm.label);
      let habSc = habitBySlug.get(mSlug) || 0;
      if (!habSc) {
        for (const [k, v] of habitBySlug.entries()) {
          if (k.includes(mSlug) || mSlug.includes(k)) { if (v > habSc) habSc = v; }
        }
      }
      if (!habSc) habSc = 64;
      const costSc = hasRealCost ? lookupSoftCostScore(constraints.costScoreBySlug, hm.canon || hm.id) : null;
      const rawFused = costSc !== null
        ? (0.72 * hm.htmlConf + 0.18 * costSc + 0.10 * habSc)
        : (0.88 * hm.htmlConf + 0.12 * habSc);
      const fusedConf = Math.round(Math.max(25, Math.min(99.2, rawFused + (costSc !== null && costSc >= 80 ? 5.5 : 3.5))) * 10) / 10;
      return { ...hm, costConf: costSc, habitConf: habSc, fusedConf, costFused: hasRealCost };
    }).sort((a, b) => b.fusedConf - a.fusedConf);

    const winner = fusedModels[0];
    const chosenTier = winner.tier || calibrated.chosenTier || 'high';
    const decomp = resolveCanonicalIdentity(winner.canon || winner.id || winner.label, winner.vendor, chosenTier);
    const rawProb = Number(winner.probability) || 0;
    const confPct = isExact ? 99.6 : Math.max(78, Math.min(99.2, winner.fusedConf));

    const famShort = String(decomp.family || '').split('-')[0] || decomp.vendor;
    const tagMain = isExact
      ? ('🦩 醍醐原库精确命中: ' + decomp.displayLabel)
      : ('🦩 醍醐重权识别: ' + decomp.displayLabel + ' (' + Math.round(confPct) + '%' + (hasRealCost ? '·HTML+计费协同' : '') + (constraints.isOpenThink === false ? '·闭源约束' : constraints.isOpenThink === true ? '·开源思考约束' : '') + ')');

    // V12: 规范化生成带强度后缀的客户端标准型号名 (<vendor>-<family>-<tier>)，确保所有对话标题与卡片同时准确显示型号与强度
    const fullCanon = (typeof Strength !== 'undefined' && typeof Strength.canon === 'function')
      ? Strength.canon(decomp.displayLabel)
      : (decomp.effort ? (decomp.canon + '-' + decomp.effort) : decomp.canon);

    // V12: 结合最近一次鹈鹕测试与客户端当前路由识别（早先鹈鹕轮次 + /cost 分段路由诊断 + 测前已确认模型）判定中途路由或降档
    let preRouteDecomp = null;
    if (pel.earlierPelicanTurn && pel.earlierPelicanTurn.html?.length >= 120) {
      try {
        const earlyCons = extractChatConstraints(sKey, chatObj, null, { turnIndex: pel.earlierPelicanTurn.turnIndex ?? 0 });
        const earlyTRes = identifySync(pel.earlierPelicanTurn.html, earlyCons);
        const earlyCal = earlyTRes?.detectedModel ? buildCalibratedHtmlModels(earlyTRes, pel.earlierPelicanTurn.html) : null;
        const earlyWin = earlyCal?.models?.[0];
        if (earlyWin && (earlyCal.isExact || Number(earlyWin.htmlConf || 0) >= 62)) {
          preRouteDecomp = resolveCanonicalIdentity(earlyWin.canon || earlyWin.id || earlyWin.label, earlyWin.vendor, earlyWin.tier || earlyCal.chosenTier || 'high');
        }
      } catch {}
    }
    if (!preRouteDecomp && constraints.billingRouteSwitched && constraints.billingRouteFrom) {
      preRouteDecomp = resolveCanonicalIdentity(constraints.billingRouteFrom, '', '');
    }
    if (!preRouteDecomp && (pel.turnIndex || 0) >= 1) {
      const prevRaw = opts.prevModel
        || (known?.routed && known?.routeFrom ? known.routeFrom : '')
        || (!known?.guess && !known?.fromTitle && (known?.tihuRecognized || known?.reverseInferred || known?.billingProbe) ? (known.rawLabel || known.name || '') : '');
      if (prevRaw) {
        preRouteDecomp = resolveCanonicalIdentity(prevRaw, known?.vendor || '', known?.effort || known?.tier || '');
      }
    }

    let routed = false;
    let effortDowngraded = false;
    let routeType = '';
    let routeFrom = '';
    let routeTo = '';
    let routeReason = '';
    if (preRouteDecomp && preRouteDecomp.canon) {
      const prevBase = alnumSlug(preRouteDecomp.canon);
      const nextBase = alnumSlug(decomp.canon);
      const tierOrder = { none: 0, minimal: 0, low: 1, medium: 2, high: 3, xhigh: 4, max: 4 };
      if (prevBase && nextBase && prevBase !== nextBase) {
        routed = true;
        routeType = 'model';
        routeFrom = preRouteDecomp.displayLabel || preRouteDecomp.canon;
        routeTo = decomp.displayLabel;
        routeReason = '最新鹈鹕测试结合客户端路由识别检出模型切换（' + routeFrom + ' → ' + routeTo + '）';
      } else if (prevBase && prevBase === nextBase && preRouteDecomp.effort && decomp.effort && (tierOrder[decomp.effort] ?? 2) < (tierOrder[preRouteDecomp.effort] ?? 2)) {
        effortDowngraded = true;
        routeType = 'effort';
        routeFrom = preRouteDecomp.displayLabel || preRouteDecomp.canon;
        routeTo = decomp.displayLabel;
        routeReason = '最新鹈鹕测试结合客户端路由识别检出强度降档（' + routeFrom + ' → ' + routeTo + '）';
      }
    } else if (known?.routed && known?.routeFrom && alnumSlug(known.routeFrom) !== alnumSlug(decomp.canon)) {
      routed = true;
      routeType = known.routeType || 'model';
      routeFrom = known.routeFrom;
      routeTo = decomp.displayLabel;
      routeReason = known.routeReason || ('路由切换（' + routeFrom + ' → ' + routeTo + '）');
    }

    const prevFull = normSlug(known?.name || '');
    const nextFull = normSlug(fullCanon);
    const changed = !known
      || prevFull !== nextFull
      || String(known.rawLabel || '') !== decomp.displayLabel
      || Boolean(known.routed) !== routed
      || Boolean(known.effortDowngraded) !== effortDowngraded
      || Boolean(known.fromTitle)
      || Boolean(known.guess)
      || !known.tihuRecognized
      || Boolean(known.fingerprint)
      || (known._tihuEngineFixVer || 0) < 15;

    const compAsst = Array.isArray(chatObj?.messages)
      ? chatObj.messages.filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending')
      : [];
    const latestMsgId = compAsst.at(-1)?.id || pel.turnMsgId || known?.lastMessageId || known?.messageId || null;

    const nextEntry = {
      ...(known || {}),
      sid: sKey,
      name: fullCanon,
      candidateName: fullCanon,
      rawLabel: decomp.displayLabel,
      vendor: decomp.vendor,
      fam: famShort,
      family: decomp.family,
      effort: decomp.effort,
      tier: decomp.effort,
      reverseEffort: decomp.effort,
      reverseLabel: decomp.displayLabel,
      reverseCandidateId: decomp.vendor + '/' + decomp.family,
      confidence: confPct,
      reverseMatch: hasRealCost ? Math.max(confPct, Number(known?.reverseMatch) || 90) : confPct,
      reverseScore: passiveHabit?.reasoningScore ?? known?.reverseScore ?? (decomp.effort === 'max' ? 88 : decomp.effort === 'high' ? 78 : decomp.effort === 'medium' ? 62 : 48),
      habitScore: passiveHabit?.reasoningScore ?? known?.habitScore,
      habitCandidates: passiveHabit?.candidates || known?.habitCandidates,
      habitFeatures: {
        ...(known?.habitFeatures || {}),
        ...(passiveHabit?.features ? {
          vec: passiveHabit.features.vec,
          isOpenThink: Boolean(passiveHabit.features.isOpenThink),
          habitTags: [tagMain, ...(passiveHabit.features.habitTags || []).slice(0, 4)],
          habitReasoningScore: passiveHabit.reasoningScore,
        } : {}),
        htmlSvgMatch: {
          ...(known?.habitFeatures?.htmlSvgMatch || {}),
          best: {
            id: fullCanon,
            canon: fullCanon,
            label: decomp.displayLabel,
            vendor: decomp.vendor,
            effort: decomp.effort,
            match: confPct,
            prob: rawProb || (confPct / 100),
            protoSim: isExact ? 1 : 0.92,
            ruleScore: isExact ? 1 : 0.85,
          },
        },
      },
      provider: routed ? ('醍醐最新鹈鹕 + 路由识别 (' + routeFrom + ' → ' + routeTo + ')') : (hasRealCost ? '醍醐 HTML + 计费协同识别' : '醍醐 Pelican HTML/SVG 识别'),
      openSource: Boolean(constraints.isOpenThink === true || ARENA_OPEN_MODEL_RE.test(decomp.canon)),
      ...(Boolean(constraints.isOpenThink === true || ARENA_OPEN_MODEL_RE.test(decomp.canon)) ? { manualOpenInferred: true } : {}),
      guess: false,
      fromTitle: false,
      pendingConfirm: false,
      uncertain: false,
      sure: true,
      habitInferred: !hasRealCost,
      reverseInferred: true,
      billingProbe: true,
      reverseVer: Math.max(Number(known?.reverseVer || 0), 192),
      tihuRecognized: true,
      tihuAuthoritative: true,
      tihuIsPelican: true,
      tihuChosenTier: chosenTier,
      tihuSlotKey: pel.slotKey || '',
      tihuTopModels: htmlModels.slice(0, 8),
      tihuModel: decomp.family,
      tihuVendorId: decomp.vendor,
      tihuExact: isExact,
      tihuProb: rawProb,
      tihuConfidence: confPct,
      tihuTurnKeyword: pel.matchedKeyword || 'pelican',
      _tihuSyncVer: _syncRev,
      _tihuEngineFixVer: 15,
      routed,
      effortDowngraded,
      ...(routed || effortDowngraded ? {
        routeType,
        routeFrom,
        routeTo,
        routeReason,
      } : {}),
      messageId: latestMsgId,
      lastMessageId: latestMsgId,
      completedTurnCount: compAsst.length || known?.completedTurnCount || 1,
      habitTags: [
        tagMain,
        ...(routed || effortDowngraded ? [routeReason] : []),
        '锁定最新鹈鹕轮次: #' + ((pel.turnIndex ?? 0) + 1) + ' (' + (pel.matchedKeyword || 'pelican') + ')',
        ...(Array.isArray(passiveHabit?.habitTags) ? passiveHabit.habitTags.filter(x => !String(x).includes('醍醐') && !String(x).includes('🦩')) : []).slice(0, 4),
      ],
      at: Date.now(),
    };
    if (!routed && !effortDowngraded) {
      delete nextEntry.routeType;
      delete nextEntry.routeFrom;
      delete nextEntry.routeTo;
      delete nextEntry.routeReason;
    }
    /* V15: 最新鹈鹕测试锁定时清除历史旧指纹字段，避免阻断后续标题与卡片刷新 */
    delete nextEntry.fingerprint;
    if (opts.clearUserCorrected) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }

    if (typeof History !== 'undefined' && History.isGone?.(sKey)) return { matched: false, reason: 'deleted' };
    _syncAnalyzeCache.clear();
    if (typeof Models !== 'undefined' && typeof Models.set === 'function') {
      Models.set(sKey, nextEntry);
    }
    try { if (typeof BillingProbe !== 'undefined' && BillingProbe.clearSummaryCache) BillingProbe.clearSummaryCache(); } catch {}
    try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sKey, nextEntry); } catch {}
    try {
      if (typeof Titles !== 'undefined' && (changed || opts.force)) {
        if (typeof Titles.syncRecognized === 'function') {
          Titles.syncRecognized(sKey, { cloud: !opts.noCloudTitle, sentAt: chatObj?.sentAt });
        } else if (Titles.local) {
          Titles.local(sKey);
        }
      }
    } catch {}
    if (!opts.batchMode) {
      const emitting = recognizePelicanChatAndApply._emitting || (recognizePelicanChatAndApply._emitting = new Set());
      emitting.add(sKey);
      try { if (chatObj && typeof Bus !== 'undefined' && Bus.emit) Bus.emit('model', chatObj, nextEntry); } catch {} finally { emitting.delete(sKey); }
      try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.render?.(); Bar?.render?.(); } catch {}
    }

    return {
      matched: true,
      changed,
      sid: sKey,
      vendor: decomp.vendor,
      vendorLabel: decomp.vendorLabel,
      family: decomp.family,
      effort: decomp.effort,
      canon: decomp.canon,
      displayLabel: decomp.displayLabel,
      confidence: confPct,
      exact: isExact,
    };
  }

  async function recognizeSingleChatUnified(sid, chatObj, { allowHealStub = true, force = false, refreshBilling = false, clearUserCorrected = false } = {}) {
    if (!sid || !chatObj?.messages?.length || (typeof History !== 'undefined' && History.isDeleted?.(sid))) return { scanned: false, matched: false, changed: false };
    const knownBefore = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null;
    if (knownBefore?.userCorrected && !clearUserCorrected) return { scanned: true, matched: false, changed: false };

    const pelRes = await recognizePelicanChatAndApply(sid, chatObj, {
      batchMode: true,
      allowHealStub,
      force: true,
      clearUserCorrected,
      preferLatestTurn: true,
    });
    if (pelRes?.matched) {
      return { scanned: true, matched: true, changed: Boolean(pelRes.changed), tihu: true, entry: pelRes };
    }

    const prevName = String(knownBefore?.name || '');
    const prevTier = String(knownBefore?.tier || knownBefore?.effort || '');
    const prevFixVer = Number(knownBefore?._tihuEngineFixVer || 0);
    const constraints = extractChatConstraints(sid, chatObj, knownBefore, {});
    const knownIsOpen = knownBefore?.name ? ARENA_OPEN_MODEL_RE.test(String(knownBefore.name)) || knownBefore.name === '开源模型' : null;
    const hasOpenClosedConflict = typeof constraints.isOpenThink === 'boolean' && knownIsOpen !== null && constraints.isOpenThink !== knownIsOpen && !knownBefore?.routed;
    const compAsst = chatObj.messages.filter(m => m && m.role === 'assistant' && !m.failed && m.status !== 'failed' && m.status !== 'pending');
    const latestAsstId = compAsst.at(-1)?.id || '';
    const hasNewTurn = Boolean(latestAsstId && (!knownBefore?.lastMessageId || knownBefore.lastMessageId !== latestAsstId));
    const needsAudit = force
      || !knownBefore
      || !knownBefore.name
      || knownBefore.guess
      || knownBefore.fromTitle
      || knownBefore.pendingConfirm
      || hasOpenClosedConflict
      || hasNewTurn
      || prevFixVer < 15;

    if (needsAudit) {
      if (refreshBilling && typeof BillingProbe !== 'undefined' && typeof BillingProbe.refresh === 'function') {
        const skipOpen = typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && BillingProbe.shouldSkipCostForOpenSource(chatObj);
        const costOn = typeof BillingProbe.isCostProbeEnabled === 'function' ? BillingProbe.isCostProbeEnabled() : true;
        if (costOn && !skipOpen) {
          try { await Promise.race([BillingProbe.refresh(chatObj, { interactive: false, force: true, preferLatestTurn: true }), new Promise(r => setTimeout(r, 2800))]); } catch {}
        }
      }
      try { if (typeof BillingProbe !== 'undefined' && BillingProbe.clearSummaryCache) BillingProbe.clearSummaryCache(); } catch {}
      let applied = null;
      if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.applyReverseIdentity === 'function') {
        try {
          applied = BillingProbe.applyReverseIdentity(chatObj, {
            interactive: Boolean(clearUserCorrected),
            force: true,
            forceLock: true,
            preferLatestTurn: true,
          });
        } catch {}
      }
      if (!applied && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.identifyAndApply === 'function') {
        try {
          ChatHabitFingerprint.identifyAndApply(chatObj, {
            force: true,
            fromCostFallback: true,
            interactive: Boolean(clearUserCorrected),
            preferLatestTurn: true,
          });
        } catch {}
      }
      const afterMi = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null;
      if (afterMi && !afterMi.guess && afterMi.name && !/^(未识别|未知型号|待定)$/.test(String(afterMi.name).trim())) {
        if ((afterMi._tihuEngineFixVer || 0) < 15) {
          afterMi._tihuEngineFixVer = 15;
          afterMi._tihuHabitAuditVer = 15;
          Models.set?.(sid, afterMi);
        }
        const changed = String(afterMi.name || '') !== prevName || String(afterMi.tier || afterMi.effort || '') !== prevTier || Boolean(knownBefore?.fromTitle) || Boolean(knownBefore?.guess);
        if ((changed || force) && typeof Titles !== 'undefined' && typeof Titles.syncRecognized === 'function') {
          Titles.syncRecognized(sid, { cloud: true, sentAt: chatObj?.sentAt });
        }
        return { scanned: true, matched: true, changed, tihu: false, entry: afterMi };
      }
    }
    return { scanned: true, matched: false, changed: false };
  }

  /* V15: 切换对话前置时无感极速全自动识别与自动纠错（始终锁定最新鹈鹕测试，自动刷新未覆盖的实时计费并纠正历史误识） */
  const _viewVerifyMemo = new Map();
  const _inFlightViewVerify = new Map();

  function _isLiveCostCoveringLatest(sid, latestAsstId) {
    if (!sid || !latestAsstId || typeof BillingProbe === 'undefined') return false;
    try {
      const st = typeof BillingProbe.getLiveState === 'function' ? BillingProbe.getLiveState(sid) : (typeof BillingProbe.state === 'function' ? BillingProbe.state(sid) : null);
      if (!st || st.error || st.status !== 'ready') return false;
      const used = st.info?.result?.unitPrice?.used || [];
      const covered = st.coveredIds || [];
      return Boolean(used.some(r => r?.messageId === latestAsstId) || covered.includes(latestAsstId));
    } catch {
      return false;
    }
  }

  async function verifyChatOnView(sid, chatObj, opts = {}) {
    const sKey = String(sid || chatObj?.sid || chatObj?.id || '').trim();
    if (!sKey || (typeof History !== 'undefined' && History.isDeleted?.(sKey))) return null;
    if (_inFlightViewVerify.has(sKey) && !opts.force) {
      return _inFlightViewVerify.get(sKey);
    }

    const job = (async () => {
      if (!isReady() && _syncing) {
        try { await _syncing; } catch {}
      }
      let chat = chatObj || ((typeof Chats !== 'undefined' && Chats.get) ? Chats.get(sKey) : null);
      if (!chat && typeof chatOf === 'function') chat = chatOf(sKey);
      if (!chat || chat.busy) return null;

      const histItem = (typeof History !== 'undefined' && History.byId) ? History.byId(sKey) : null;
      if (chat.isEvaluation || chat.evalMode === 'battle' || chat.evalMode === 'direct' || histItem?.type === 'evaluation') {
        return null;
      }

      const mi0 = (typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null;
      if (mi0?.userCorrected && !opts.clearUserCorrected) return { skipped: 'user-corrected', entry: mi0 };

      /* 等待正在进行中的 chat.load() 完成，若仍是残缺热缓存 (_hotOnly) 或未加载则静默补齐完整消息 */
      if (chat.loading) {
        const t0 = Date.now();
        while (chat.loading && Date.now() - t0 < 8000) {
          await new Promise(r => setTimeout(r, 60));
        }
      }
      if ((!chat.loaded || chat._hotOnly || !Array.isArray(chat.messages) || !chat.messages.length) && !chat.loading && typeof chat.load === 'function') {
        if (!(typeof ReadLimit !== 'undefined' && ReadLimit.active?.())) {
          try { await chat.load(); } catch {}
        }
      }

      const curMsgs = Array.isArray(chat.messages) ? chat.messages : [];
      if (!curMsgs.length) return null;

      const compAsst = curMsgs.filter(m => m && m.role === 'assistant' && !m.failed && m.status !== 'failed' && m.status !== 'pending');
      if (!compAsst.length) return null;
      const latestAfterLoad = compAsst.at(-1)?.id || '';

      const mi = (typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null;
      if (mi?.userCorrected && !opts.clearUserCorrected) return { skipped: 'user-corrected', entry: mi };

      const pvVer = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedVer === 'function') ? HtmlPreview.resolvedVer() : 0;
      const wsFiles = (typeof WS !== 'undefined' && WS.sid === sKey && WS.data?.manifest?.root) ? (WS.data.manifest.root.totalFiles || 0) : -1;
      const costOn = typeof BillingProbe !== 'undefined' && typeof BillingProbe.isCostProbeEnabled === 'function' ? BillingProbe.isCostProbeEnabled() : true;
      const skipOpenCost = typeof BillingProbe !== 'undefined' && typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && BillingProbe.shouldSkipCostForOpenSource(chat);
      const liveCostCovered = !costOn || skipOpenCost || _isLiveCostCoveringLatest(sKey, latestAfterLoad);

      const makeStamp = mEntry => [
        latestAfterLoad,
        curMsgs.length,
        _syncRev,
        pvVer,
        wsFiles,
        liveCostCovered ? 1 : 0,
        mEntry?._tihuEngineFixVer || 0,
        mEntry?.name || '',
        mEntry?.routed ? 1 : 0,
        mEntry?.effortDowngraded ? 1 : 0,
      ].join('|');

      const preStamp = makeStamp(mi);
      if (
        !opts.force &&
        _viewVerifyMemo.get(sKey) === preStamp &&
        mi &&
        mi.name &&
        !mi.guess &&
        !mi.fromTitle &&
        !mi.pendingConfirm &&
        (mi._tihuEngineFixVer || 0) >= 15 &&
        (!latestAfterLoad || !mi.lastMessageId || mi.lastMessageId === latestAfterLoad)
      ) {
        return { cached: true, entry: mi };
      }

      /* 第一阶段（毫秒级零感直出）：立即用最新一轮鹈鹕 HTML（含最新轮 stub 补全与工作区兜底）复核并自动纠正旧误判 */
      let pelRes = null;
      if (isReady()) {
        pelRes = await recognizePelicanChatAndApply(sKey, chat, {
          batchMode: false,
          allowHealStub: true,
          preferLatestTurn: true,
          force: true,
          clearUserCorrected: Boolean(opts.clearUserCorrected),
        });
      }

      /* 第二阶段（静默实时计费校对）：若当前对话尚未拿到最新轮次的实时 /cost 观测，静默拉取一次并与最新鹈鹕 HTML / 反推融合锁定 */
      let finalRes = pelRes;
      if (!liveCostCovered && typeof BillingProbe !== 'undefined' && typeof BillingProbe.refresh === 'function') {
        const stillActive = typeof UI === 'undefined' || !UI.active || UI.active === sKey || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === sKey);
        if (stillActive && !chat.busy) {
          try {
            await Promise.race([
              BillingProbe.refresh(chat, { interactive: false, force: true, preferLatestTurn: true }),
              new Promise(r => setTimeout(r, 2800)),
            ]);
          } catch {}
          _syncAnalyzeCache.clear();
          try { BillingProbe.clearSummaryCache?.(); } catch {}
          if (isReady()) {
            const pelAfterCost = await recognizePelicanChatAndApply(sKey, chat, {
              batchMode: false,
              allowHealStub: false,
              preferLatestTurn: true,
              force: true,
              clearUserCorrected: Boolean(opts.clearUserCorrected),
            });
            if (pelAfterCost?.matched) finalRes = pelAfterCost;
          }
        }
      }

      /* 若本对话不含鹈鹕测试，但本地记录版本旧(<15)、缺失、猜测或出现新轮次，自动走计费+协议统一纠偏 */
      if (!finalRes?.matched) {
        const uniRes = await recognizeSingleChatUnified(sKey, chat, {
          allowHealStub: false,
          force: Boolean(opts.force || !mi || !mi.name || mi.guess || mi.fromTitle || mi.pendingConfirm || (mi._tihuEngineFixVer || 0) < 15 || (latestAfterLoad && mi.lastMessageId !== latestAfterLoad)),
          refreshBilling: false,
          clearUserCorrected: Boolean(opts.clearUserCorrected),
        });
        if (uniRes?.matched || uniRes?.changed) {
          try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.render?.(); Bar?.render?.(); } catch {}
        }
        finalRes = uniRes;
      }

      const mUp = (typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null;
      const postCostCovered = !costOn || skipOpenCost || _isLiveCostCoveringLatest(sKey, latestAfterLoad);
      const postWsFiles = (typeof WS !== 'undefined' && WS.sid === sKey && WS.data?.manifest?.root) ? (WS.data.manifest.root.totalFiles || 0) : wsFiles;
      const postPvVer = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedVer === 'function') ? HtmlPreview.resolvedVer() : pvVer;
      _viewVerifyMemo.set(sKey, [
        latestAfterLoad,
        curMsgs.length,
        _syncRev,
        postPvVer,
        postWsFiles,
        postCostCovered ? 1 : 0,
        mUp?._tihuEngineFixVer || 0,
        mUp?.name || '',
        mUp?.routed ? 1 : 0,
        mUp?.effortDowngraded ? 1 : 0,
      ].join('|'));

      return finalRes;
    })();

    _inFlightViewVerify.set(sKey, job);
    try {
      return await job;
    } finally {
      if (_inFlightViewVerify.get(sKey) === job) _inFlightViewVerify.delete(sKey);
    }
  }

  function onWorkspaceLoaded(sid, wsData) {
    const sKey = String(sid || '').trim();
    if (!sKey || !wsData?.manifest?.root?.totalFiles) return;
    const isFg = (typeof UI !== 'undefined' && UI.active === sKey) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === sKey);
    if (!isFg) return;
    const mi = (typeof Models !== 'undefined' && Models.get) ? Models.get(sKey) : null;
    if (mi?.userCorrected) return;
    if (!mi?.tihuRecognized || (mi._tihuEngineFixVer || 0) < 15) {
      const c = (typeof Chats !== 'undefined' && Chats.get) ? Chats.get(sKey) : null;
      void verifyChatOnView(sKey, c);
    }
  }

  let _rescanQueuedOpts = null;
  async function _runSingleScanPass({ forceLoadUncached = true, quiet = true } = {}) {
      let scanned = 0;
      let matched = 0;
      let updated = 0;
      let tihuMatched = 0;
      const visited = new Set();

      const flushUiNow = () => {
        try {
          if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.clearAllCaches) ChatHabitFingerprint.clearAllCaches();
          if (typeof BillingProbe !== 'undefined' && BillingProbe.clearSummaryCache) BillingProbe.clearSummaryCache();
        } catch {}
        try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.render?.(); Bar?.render?.(); } catch {}
      };

      try {
        flushUiNow();

        const allIds = [];
        const pushId = id => {
          const k = String(id || '').trim();
          if (k && !visited.has(k) && !(typeof History !== 'undefined' && History.isGone?.(k))) {
            visited.add(k);
            allIds.push(k);
          }
        };

        try {
          if (typeof Chats !== 'undefined' && Chats.all) {
            const list = typeof Chats.all.values === 'function' ? [...Chats.all.values()] : (Array.isArray(Chats.all) ? Chats.all : Object.values(Chats.all));
            for (const c of list) pushId(c?.sid || c?.id);
          }
        } catch {}
        try {
          if (typeof History !== 'undefined' && Array.isArray(History.items)) {
            for (const it of History.items) {
              if (it?.type === 'evaluation') continue;
              pushId(it?.id);
            }
          }
        } catch {}
        try {
          if (typeof Models !== 'undefined' && Models.all && typeof Models.all === 'object') {
            for (const id of Object.keys(Models.all)) pushId(id);
          }
        } catch {}

        const cachedJobs = [];
        const uncachedPelicanCandidates = [];
        const uncachedPriorityCandidates = [];
        const uncachedOtherCandidates = [];

        const resolveCachedMsgs = async (sid) => {
          let chatObj = (typeof Chats !== 'undefined' && Chats.get) ? Chats.get(sid) : null;
          if (!chatObj?.messages?.length && typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function') {
            try {
              const cachedRaw = await MsgCache.get(sid);
              const cachedMsgs = Array.isArray(cachedRaw) ? cachedRaw : (Array.isArray(cachedRaw?.messages) ? cachedRaw.messages : []);
              if (cachedMsgs.length > 0) {
                if (typeof chatOf === 'function') {
                  chatObj = chatOf(sid);
                  if (!chatObj.messages?.length) chatObj.messages = cachedMsgs;
                } else {
                  chatObj = { sid, messages: cachedMsgs };
                }
              }
            } catch {}
          }
          return chatObj?.messages?.length ? chatObj : null;
        };

        const HYDRATE_BATCH = 12;
        for (let i = 0; i < allIds.length; i += HYDRATE_BATCH) {
          const slice = allIds.slice(i, i + HYDRATE_BATCH);
          const resolved = await Promise.all(slice.map(async sid => ({ sid, chatObj: await resolveCachedMsgs(sid) })));
          for (const { sid, chatObj } of resolved) {
            if (chatObj) {
              cachedJobs.push({ sid, chatObj });
            } else if (forceLoadUncached) {
              const hItem = (typeof History !== 'undefined' && History.byId) ? History.byId(sid) : null;
              if (!hItem || hItem.type === 'evaluation') continue;
              const knownM = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null;
              if (knownM?.userCorrected) continue;
              const tStr = String(hItem.title || '') + ' ' + String(hItem.localTitle || '');
              if (PELICAN_TITLE_HINT_RE.test(tStr) || (knownM?.tihuRecognized && (knownM?._tihuEngineFixVer || 0) < 15)) {
                uncachedPelicanCandidates.push(sid);
              } else if (!knownM || !knownM.name || knownM.guess || knownM.fromTitle || ((knownM._tihuEngineFixVer || 0) < 15 && (knownM._tihuHabitAuditVer || 0) < 15)) {
                uncachedPriorityCandidates.push(sid);
              } else if ((knownM._tihuEngineFixVer || 0) < 15 && uncachedOtherCandidates.length < 220) {
                uncachedOtherCandidates.push(sid);
              }
            }
          }
        }

        const LOCAL_CONCURRENCY = 8;
        for (let i = 0; i < cachedJobs.length; i += LOCAL_CONCURRENCY) {
          const chunk = cachedJobs.slice(i, i + LOCAL_CONCURRENCY);
          const results = await Promise.all(chunk.map(({ sid, chatObj }) => { const km = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null; return recognizeSingleChatUnified(sid, chatObj, { allowHealStub: true, force: (km?._tihuEngineFixVer || 0) < 15 }); }));
          let chunkUpdated = false;
          for (const r of results) {
            if (r.scanned) scanned++;
            if (r.matched) {
              matched++;
              if (r.tihu) tihuMatched++;
              if (r.changed) { updated++; chunkUpdated = true; }
            }
          }
          if (chunkUpdated) flushUiNow();
        }

        if (forceLoadUncached && typeof chatOf === 'function') {
          const loadQueue = [
            ...uncachedPelicanCandidates,
            ...uncachedPriorityCandidates.slice(0, 140),
            ...uncachedOtherCandidates.slice(0, 120),
          ];
          const NET_CONCURRENCY = 6;
          for (let i = 0; i < loadQueue.length; i += NET_CONCURRENCY) {
            if (typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) break;
            const batchSids = loadQueue.slice(i, i + NET_CONCURRENCY);
            const batchRes = await Promise.all(batchSids.map(async sid => {
              if (typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) return null;
              const knownM = (typeof Models !== 'undefined' && Models.get) ? Models.get(sid) : null;
              if (knownM?.userCorrected) return null;
              try {
                const c = chatOf(sid);
                if (!c.messages?.length && typeof c.load === 'function') {
                  await c.load();
                }
                if (c.messages?.length) {
                  return await recognizeSingleChatUnified(sid, c, { allowHealStub: true });
                }
              } catch {}
              return null;
            }));
            let batchChanged = false;
            for (const r of batchRes) {
              if (!r) continue;
              if (r.scanned) scanned++;
              if (r.matched) {
                matched++;
                if (r.tihu) tihuMatched++;
                if (r.changed) { updated++; batchChanged = true; }
              }
            }
            if (batchChanged) flushUiNow();
            if (i + NET_CONCURRENCY < loadQueue.length) {
              await new Promise(res => setTimeout(res, 45));
            }
          }
        }

        _lastScanSummary = { at: Date.now(), scanned, matched, tihuMatched, updated };
        emitChange();
        flushUiNow();

        if (!quiet && typeof toast === 'function') {
          toast(
            matched > 0
              ? ('已完成批量识别 · 扫描 ' + scanned + ' 条对话，命中鹈鹕 ' + tihuMatched + ' 条，共更新 ' + updated + ' 条对话识别')
              : ('已扫描 ' + scanned + ' 条对话，全部识别已是最新状态'),
            'ok'
          );
        }
        return { scanned, matched, tihuMatched, updated };
      } catch {
        return { scanned, matched, tihuMatched, updated };
      }
  }

  async function scanAndRecognizeAllChats({ forceLoadUncached = true, quiet = true } = {}) {
    if (!isReady()) return { scanned: 0, matched: 0, updated: 0 };
    if (_scanPromise) {
      _rescanQueuedOpts = {
        forceLoadUncached: Boolean(_rescanQueuedOpts?.forceLoadUncached || forceLoadUncached),
        quiet: Boolean((_rescanQueuedOpts ? _rescanQueuedOpts.quiet : true) && quiet),
      };
      return _scanPromise;
    }
    const runner = (async () => {
      await Promise.resolve();
      let curOpts = { forceLoadUncached, quiet };
      let lastRes = { scanned: 0, matched: 0, tihuMatched: 0, updated: 0 };
      try {
        while (curOpts) {
          _rescanQueuedOpts = null;
          lastRes = await _runSingleScanPass(curOpts);
          curOpts = _rescanQueuedOpts;
        }
        return lastRes;
      } finally {
        _scanPromise = null;
        _rescanQueuedOpts = null;
      }
    })();
    _scanPromise = runner;
    return runner;
  }

  function toTihuThreeTuple(entry) {
    const rawName = String(entry?.name || entry?.rawLabel || entry?.candidateName || entry?.model || entry?.modelId || entry?.id || '').replace(/[?？]+$/, '').trim();
    const rawVendor = String(entry?.vendor || '').trim();
    const rawFamily = String(entry?.family || '').trim();
    const rawEffort = String(entry?.effort || entry?.tier || entry?.reverseEffort || '').trim().toLowerCase();

    let tier = 'high';
    if (rawEffort === 'max' || rawEffort === 'xhigh') tier = 'max';
    else if (rawEffort === 'high' || rawEffort === 'standard') tier = 'high';
    else if (rawEffort === 'medium') tier = 'medium';
    else if (rawEffort === 'low' || rawEffort === 'minimal' || rawEffort === 'none') tier = 'low';

    const combined = (rawVendor + ' ' + rawFamily + ' ' + rawName).toLowerCase();
    let shortVendor = 'Other';
    if (/anthropic|claude|opus|sonnet|haiku|fable/.test(combined)) shortVendor = 'Claude';
    else if (/openai|gpt|\bsol\b|astra|luna|terra|codex/.test(combined)) shortVendor = 'GPT';
    else if (/google|gemini|argon|carbon|gemma/.test(combined)) shortVendor = 'Gemini';
    else if (/meta|muse|llama|maverick/.test(combined)) shortVendor = 'Muse';
    else if (/deepseek|beam/.test(combined)) shortVendor = 'DeepSeek';
    else if (/qwen|alibaba/.test(combined)) shortVendor = 'Qwen';
    else if (/zhipu|glm/.test(combined)) shortVendor = 'GLM';
    else if (/xai|x-ai|grok/.test(combined)) shortVendor = 'Grok';
    else if (/moonshot|kimi/.test(combined)) shortVendor = 'Kimi';
    else if (/xiaomi|mimo/.test(combined)) shortVendor = 'MiMo';
    else if (/minimax/.test(combined)) shortVendor = 'MiniMax';
    else if (/tencent|hunyuan/.test(combined)) shortVendor = 'Hunyuan';
    else if (/doubao|bytedance|seed/.test(combined)) shortVendor = 'Doubao';
    else if (/mistral/.test(combined)) shortVendor = 'Mistral';
    else if (rawVendor) shortVendor = rawVendor;

    let shortModel = normSlug(rawFamily || rawName);
    const prefixes = {
      Claude: /^claude[-\s]*/i,
      GPT: /^gpt[-\s]*/i,
      Gemini: /^gemini[-\s]*/i,
      Muse: /^muse[-\s]*/i,
      DeepSeek: /^deepseek[-\s]*/i,
      Qwen: /^qwen[-\s]*/i,
      GLM: /^glm[-\s]*/i,
      Grok: /^grok[-\s]*/i,
      Kimi: /^kimi[-\s]*/i,
      MiMo: /^mimo[-\s]*/i,
      MiniMax: /^minimax[-\s]*/i,
      Hunyuan: /^hunyuan[-\s]*/i,
      Doubao: /^doubao[-\s]*/i,
      Mistral: /^mistral[-\s]*/i,
    };
    if (prefixes[shortVendor]) shortModel = shortModel.replace(prefixes[shortVendor], '');
    if (!shortModel) shortModel = rawName || 'unknown';

    return { vendor: shortVendor, model: shortModel, tier };
  }

  function extractChatHtmlArtifacts(sid, chatObj) {
    const pel = extractPelicanTurnHtml(chatObj, null, sid);
    if (pel?.matched && pel.html) {
      return [{ slotKey: pel.slotKey || 'pelican:main', html: pel.html, file: pel.path || 'pelican.html' }];
    }

    const out = [];
    const seenCode = new Set();
    const pushArt = (slotKey, code, fileLabel) => {
      if (isStubHtmlText(code)) return;
      const clean = globalThis.PelicanFingerprintEngine?.unwrapCodeInput
        ? globalThis.PelicanFingerprintEngine.unwrapCodeInput(code)
        : String(code || '').trim();
      if (!clean || clean.length < 100) return;
      if (!/<(?:!doctype|html|svg)\b/i.test(clean)) return;
      const sig = clean.length + ':' + clean.slice(0, 160) + ':' + clean.slice(-160);
      if (seenCode.has(sig)) return;
      seenCode.add(sig);
      out.push({ slotKey, html: clean, file: fileLabel || slotKey });
    };

    try {
      if (typeof R !== 'undefined' && typeof R.writes === 'function') {
        const writes = R.writes(sid) || [];
        const byPath = new Map();
        for (const w of writes) {
          if (!w?.path) continue;
          const isH = (typeof HtmlPreview !== 'undefined' && HtmlPreview.kindOf)
            ? HtmlPreview.kindOf(w.path) === 'html'
            : /\.(?:html?|svg)$/i.test(w.path);
          if (!isH) continue;
          const txt = String(w.get?.() || '');
          if (!isStubHtmlText(txt) && txt.trim().length >= 100) byPath.set(w.path, txt);
        }
        for (const [p, txt] of byPath.entries()) {
          const baseName = p.split('/').pop() || p;
          pushArt('file:' + baseName.toLowerCase(), txt, baseName);
        }
      }
    } catch {}

    if (!out.length && Array.isArray(chatObj?.messages)) {
      const asstOnly = chatObj.messages.filter(m => m && m.role === 'assistant');
      const { found } = extractAssistantTurnArtifacts(sid, chatObj, asstOnly);
      for (const f of found) pushArt(f.slotKey, f.html, f.path || f.slotKey);
    }

    return out.slice(-2);
  }

  async function uploadChatCorrection(sid, chatObj, nextEntry) {
    const c = loadLocalCfg();
    if (!c.url || !sid || !nextEntry?.userCorrected) return null;

    let effChat = chatObj;
    if (!effChat?.messages?.length && typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function') {
      try {
        const cached = await MsgCache.get(sid);
        if (Array.isArray(cached) && cached.length) effChat = { ...(chatObj || {}), sid, messages: cached };
      } catch {}
    }

    let artifacts = extractChatHtmlArtifacts(sid, effChat);
    if (!artifacts.length) {
      const pelStub = extractPelicanTurnHtml(effChat, null, sid);
      if (pelStub?.stubPaths?.length && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.healFileText === 'function') {
        for (const sp of pelStub.stubPaths.slice(0, 2)) {
          const healed = await HtmlPreview.healFileText(sid, sp).catch(() => '');
          if (healed && !isStubHtmlText(healed) && healed.length >= 100) {
            artifacts = [{ slotKey: 'file:' + (sp.split('/').pop() || sp).toLowerCase(), html: healed, file: sp }];
            break;
          }
        }
      }
    }
    if (!artifacts.length) return { skipped: true, reason: 'no-html-svg' };

    const { vendor, model, tier } = toTihuThreeTuple(nextEntry);
    if (vendor === 'Other' && (/开源模型|未识别|未知/.test(model))) return { skipped: true, reason: 'generic-open' };

    let uploaded = 0;
    let replacedAny = false;
    let lastErr = '';

    for (const art of artifacts) {
      const sourceKey = 'chat:' + sid + ':' + art.slotKey;
      try {
        const postUrl = withKeyParam(c.url + '/api/v1/samples', c.key);
        const res = await httpJson(postUrl, {
          method: 'POST',
          key: c.key,
          type: 'application/json',
          timeout: 35000,
          body: JSON.stringify({
            key: c.key,
            vendor,
            model,
            tier,
            html: art.html,
            sourceKey,
            isCorrection: true,
          }),
        });
        if (res?.ok) {
          uploaded++;
          if (res.replaced) replacedAny = true;
          if (res.overrides) {
            _bundle.overrides = res.overrides;
          }
        }
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }

    if (uploaded > 0) {
      try { if (typeof Host !== 'undefined' && Host.shared) await Host.shared(BUNDLE_KEY, _bundle); } catch {}
      emitChange();
      try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(); } catch {}
      if (typeof toast === 'function') {
        toast(
          (replacedAny ? '已删除旧纠错样本并替换上传至醍醐库：' : '已将纠错样本上传至醍醐库：') +
            vendor + ' ' + model + ' (' + tier + ')',
          'ok'
        );
      }
      return { ok: true, uploaded, replaced: replacedAny };
    }
    if (lastErr && typeof toast === 'function') {
      toast('醍醐库纠错样本上传失败：' + lastErr, 'err');
    }
    return { ok: false, error: lastErr };
  }

  function parseQueryModelAndTier(rawModelStr, tierHint = '') {
    const raw = String(rawModelStr || '').replace(/[?？]+$/, '').trim();
    if (!raw || raw === '未识别' || raw === '未知型号' || raw === '待定' || raw === '开源模型') {
      return { baseSlug: '', tier: '' };
    }
    let tier = String(tierHint || '').toLowerCase().trim();
    const parenM = /\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(raw);
    const dashM = /-(none|minimal|low|medium|high|xhigh|max)$/i.exec(raw);
    const rawTier = (parenM?.[1] || dashM?.[1] || tier || '').toLowerCase();
    if (rawTier === 'max' || rawTier === 'xhigh') tier = 'max';
    else if (rawTier === 'high') tier = 'high';
    else if (rawTier === 'medium') tier = 'medium';
    else if (rawTier === 'low' || rawTier === 'minimal' || rawTier === 'none') tier = 'low';
    else tier = '';

    const baseSlug = normSlug(raw);
    return { baseSlug, tier };
  }

  function matchSpecimens(rawModelStr, tierHint = '') {
    const items = allSpecimens();
    const { baseSlug, tier } = parseQueryModelAndTier(rawModelStr, tierHint);
    if (!baseSlug || !items.length) {
      return { baseSlug, tier, exactTierItems: [], allModelItems: [], totalCount: items.length };
    }

    const compactTarget = alnumSlug(baseSlug);
    const allModelItems = items.filter(it => {
      const fSlug = normSlug(it.subModelId || it.family || '');
      const dSlug = normSlug(it.displayModel || '');
      const rSlug = normSlug(it.rawModel || '');
      if (fSlug === baseSlug || dSlug === baseSlug || rSlug === baseSlug) return true;
      const cf = alnumSlug(fSlug);
      const cd = alnumSlug(dSlug);
      const cr = alnumSlug(rSlug);
      return Boolean(
        compactTarget &&
        (cf === compactTarget ||
          cd === compactTarget ||
          cr === compactTarget ||
          (cd && cd.includes(compactTarget)) ||
          (cf && cf !== 'other' && compactTarget.includes(cf)))
      );
    });

    const exactTierItems = tier
      ? allModelItems.filter(it => String(it.tier || '').toLowerCase() === tier)
      : allModelItems;

    return {
      baseSlug,
      tier,
      exactTierItems,
      allModelItems,
      totalCount: items.length,
    };
  }

  function toSrcdoc(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return '<!doctype html><html><body></body></html>';
    const isSvg = !/<(?:!doctype|html|body)\b/i.test(code) && /<svg[\s>]/i.test(code);
    if (isSvg) {
      return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;}svg{width:100% !important;height:100% !important;max-width:100vw;max-height:100vh;object-fit:contain;display:block;}</style></head><body>' + code + '</body></html>';
    }
    return code;
  }

  async function fetchSpecimenCode(item) {
    if (!item) return '';
    if (item.inlineHtml) return item.inlineHtml;
    if (_htmlCache.has(item.id)) return _htmlCache.get(item.id);
    const c = loadLocalCfg();
    if (!c.url || !item.file) return '';
    const rawRel = item.file.startsWith('/') ? item.file : ('/' + item.file);
    const needsKey = rawRel.startsWith('/api/');
    const fullUrl = needsKey ? withKeyParam(c.url + rawRel, c.key) : (c.url + rawRel);
    try {
      const txt = await httpText(fullUrl, { key: c.key, withAuth: needsKey, timeout: 25000 });
      if (txt) _htmlCache.set(item.id, txt);
      return txt;
    } catch {
      const txt2 = await httpText(withKeyParam(c.url + rawRel, c.key), { key: c.key, withAuth: true, timeout: 25000 }).catch(() => '');
      if (txt2) _htmlCache.set(item.id, txt2);
      return txt2;
    }
  }

  function openFullSpecimenPreview(item, code, titlePrefix = '') {
    const title = (titlePrefix ? titlePrefix + ' · ' : '') + (item.displayModel || item.family || item.id) + ' [' + String(item.tier || 'high').toUpperCase() + ']';
    const frameWrap = h('div', {
      style: {
        width: 'min(86vw, 980px)',
        height: 'min(72vh, 640px)',
        background: '#f8fafc',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid var(--line, rgba(120,120,120,.2))',
      },
    });
    const ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts');
    ifr.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff;';
    ifr.srcdoc = toSrcdoc(code);
    frameWrap.append(ifr);
    const m = modal(
      title,
      frameWrap,
      K(
        h('span', { class: 'dim mono', style: { fontSize: '12px' } }, '样本 ID: ' + item.id + ' · 来源: ' + (item.source || 'tihu')),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => m.remove() }, '关闭')
      )
    );
  }

  function mountScaledStage(box, item, heightPx = 186) {
    box.style.cssText = 'position:relative;width:100%;height:' + heightPx + 'px;overflow:hidden;border-radius:8px;background:#f4f6f9;cursor:pointer;border:1px solid rgba(120,130,145,.18);';
    const loading = h('div', { class: 'dim', style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' } }, '正在加载醍醐 HTML/SVG 样本…');
    box.append(loading);

    let loadedCode = '';
    fetchSpecimenCode(item).then(code => {
      loadedCode = code;
      if (!box.isConnected) return;
      loading.remove();
      if (!code) {
        box.append(h('div', { class: 'dim', style: { padding: '16px', textAlign: 'center', fontSize: '12px' } }, '预览加载失败，请检查醍醐识别库地址或密码'));
        return;
      }
      const ifr = document.createElement('iframe');
      ifr.setAttribute('sandbox', 'allow-scripts');
      ifr.setAttribute('scrolling', 'no');
      const applyScale = () => {
        const w = box.clientWidth || 288;
        const sc = (w / 1280).toFixed(4);
        const vh = Math.round(heightPx / Math.max(0.1, w / 1280));
        ifr.style.cssText = 'width:1280px;height:' + vh + 'px;border:0;transform-origin:0 0;transform:scale(' + sc + ');pointer-events:none;background:#fff;display:block;';
      };
      applyScale();
      ifr.srcdoc = toSrcdoc(code);
      box.append(ifr);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => { if (!box.isConnected) ro.disconnect(); else applyScale(); });
        ro.observe(box);
      }
    });

    box.onclick = async () => {
      const code = loadedCode || (await fetchSpecimenCode(item));
      if (code) openFullSpecimenPreview(item, code, '醍醐参考样本');
    };
  }

  function renderModelCardSection(sid, dispModel, tierHint = '', standaloneCard = false) {
    const st = status();
    const openLib = (cmpModel = '') => {
      if (typeof PelicanShots !== 'undefined' && typeof PelicanShots.table === 'function') {
        PelicanShots.table(cmpModel ? { compareModel: cmpModel } : {});
      }
    };

    if (!st.configured) {
      if (!standaloneCard) return null;
      return h('div', { class: 'mc-sec mc-pel' },
        h('div', { class: 'mc-sh' },
          h('span', {}, '醍醐 HTML/SVG 样本库'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'mc-pelb', onclick: () => openSettingsModal(() => { try { Dock.render(); } catch {} }) }, '接入配置')),
        h('div', { class: 'mc-uses sm dim' }, '接入醍醐库后可实时对照各厂商/型号/强度的鹈鹕 HTML/SVG 样本，并自动锁定更新全部对话识别结果。'));
    }

    if (!st.ready) {
      const inner = h('div', { class: 'mc-uses sm dim', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: standaloneCard ? '0' : '6px' } },
        h('span', {}, st.syncing ? '正在同步醍醐 HTML/SVG 样本库…' : ('醍醐库尚未同步' + (st.lastErr ? '：' + st.lastErr : ''))),
        h('button', { type: 'button', class: 'btn xs ghost', disabled: st.syncing || null, onclick: e => { e.stopPropagation(); void sync({ force: true }); } }, '同步'));
      return standaloneCard
        ? h('div', { class: 'mc-sec mc-pel' }, h('div', { class: 'mc-sh' }, h('span', {}, '醍醐 HTML/SVG 样本库')), inner)
        : inner;
    }

    const matched = matchSpecimens(dispModel, tierHint);
    if (!matched.allModelItems.length) {
      if (!standaloneCard) return null;
      return h('div', { class: 'mc-sec mc-pel' },
        h('div', { class: 'mc-sh' },
          h('span', {}, '醍醐 HTML/SVG 样本库'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'mc-pelb', onclick: () => openLib(dispModel) }, '打开醍醐库 (' + st.specimenCount + ')'),
          h('button', { type: 'button', class: 'ib xs tihu-sync-ib' + (st.syncing ? ' spinning' : ''), disabled: st.syncing || null, title: st.syncing ? '正在同步醍醐样本库…' : '同步更新醍醐样本库', 'aria-label': '同步更新醍醐样本库', onclick: e => { e.stopPropagation(); void sync({ force: true }); } }, typeof icon === 'function' ? icon('refresh') : '↻')),
        h('div', { class: 'mc-uses sm dim' },
          dispModel && dispModel !== '未识别'
            ? ('当前型号「' + dispModel + '」暂无同名归档样本，可打开醍醐库浏览全部 ' + st.specimenCount + ' 份 HTML/SVG 样本。')
            : ('已就绪 · 共 ' + st.specimenCount + ' 份 HTML/SVG 样本 / ' + st.modelCount + ' 个型号，自动锁定多语言鹈鹕对话并识别厂商、型号与强度。')));
    }

    const stateKey = (sid || 'g') + '|' + matched.baseSlug + '|' + matched.tier;
    const stateObj = _cardIdxMap.get(stateKey) || { idx: 0, tierFilter: matched.exactTierItems.length ? matched.tier : 'all' };
    _cardIdxMap.set(stateKey, stateObj);

    const wrap = h('div', standaloneCard
      ? { class: 'mc-sec mc-pel' }
      : { class: 'tihu-mc-wrap', style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(128,128,128,.22)' } });

    const paint = () => {
      const list = stateObj.tierFilter === 'all'
        ? matched.allModelItems
        : matched.allModelItems.filter(x => String(x.tier || '').toLowerCase() === stateObj.tierFilter);
      const effList = list.length ? list : matched.allModelItems;
      const curIdx = ((stateObj.idx % effList.length) + effList.length) % effList.length;
      const curItem = effList[curIdx];

      const stNow = status();
      const availTiers = TIER_LIST.filter(t => matched.allModelItems.some(x => String(x.tier || '').toLowerCase() === t));
      const curTierNorm = TIER_LIST.includes(String(curItem.tier || '').toLowerCase()) ? String(curItem.tier).toLowerCase() : 'high';
      const headRow = h('div', { class: standaloneCard ? 'mc-sh' : '', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px', flexWrap: 'nowrap' } },
        h('span', { style: { fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '0', flex: '1', overflow: 'hidden' } },
          typeof vlogo === 'function' ? vlogo(mapTihuVendorId(curItem.vendor, curItem.displayModel || matched.baseSlug), 14) : null,
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '醍醐网页样本 · ' + (curItem.displayModel || matched.baseSlug)),
          h('span', { class: 'pel-score-badge', 'data-tier': curTierNorm, style: { marginLeft: '2px', flexShrink: '0' } }, curTierNorm.toUpperCase())),
        h('button', {
          type: 'button',
          class: 'ib xs tihu-sync-ib' + (stNow.syncing ? ' spinning' : ''),
          disabled: stNow.syncing || null,
          title: stNow.syncing ? '正在同步醍醐样本库…' : '从醍醐网页同步最新模型与样本',
          'aria-label': '同步醍醐样本库',
          onclick: e => { e.stopPropagation(); void sync({ force: true }).then(() => { try { paint(); } catch {} }); },
        }, typeof icon === 'function' ? icon('refresh') : '↻'));

      const navAndTierRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } },
          ...(availTiers.length > 1
            ? [
                ...availTiers.map(t => h('button', {
                  type: 'button',
                  'data-tier': t,
                  class: 'pel-cmp-toggle pel-tier-btn' + (stateObj.tierFilter === t ? ' on' : ''),
                  onclick: e => { e.stopPropagation(); stateObj.tierFilter = t; stateObj.idx = 0; paint(); },
                }, t.toUpperCase())),
                h('button', {
                  type: 'button',
                  class: 'pel-cmp-toggle' + (stateObj.tierFilter === 'all' ? ' on' : ''),
                  onclick: e => { e.stopPropagation(); stateObj.tierFilter = 'all'; stateObj.idx = 0; paint(); },
                }, '全部(' + matched.allModelItems.length + ')'),
              ]
            : [])),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' } },
          effList.length > 1 ? h('button', { type: 'button', class: 'btn xs ghost', onclick: e => { e.stopPropagation(); stateObj.idx = curIdx - 1; paint(); } }, '◀') : null,
          h('span', { class: 'mono dim', style: { fontSize: '11px' } }, (curIdx + 1) + '/' + effList.length),
          effList.length > 1 ? h('button', { type: 'button', class: 'btn xs ghost', onclick: e => { e.stopPropagation(); stateObj.idx = curIdx + 1; paint(); } }, '▶') : null,
          h('button', { type: 'button', class: 'mc-pelb', onclick: e => { e.stopPropagation(); openLib(curItem.displayModel || matched.baseSlug); } }, '醍醐库')));

      const stage = h('div', { title: '点击放大交互预览该 HTML / SVG 样本' });
      mountScaledStage(stage, curItem, 184);

      const kb = (((curItem.bytes || curItem.sizeBytes || 0)) / 1024).toFixed(1);
      const footRow = h('div', { class: 'pel-meta-row', style: { marginTop: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', gap: '6px', flexWrap: 'wrap' } },
        h('span', { class: 'dim mono' }, (curItem.isSvg ? 'SVG' : 'HTML') + (kb > 0 ? ' · ' + kb + ' KB' : '') + ' · 点画面交互预览'));

      wrap.replaceChildren(...[headRow, navAndTierRow, stage, footRow].filter(Boolean));
    };

    paint();
    return wrap;
  }

  function createTihuDropdown({ labelText, value, options, onSelect, compact = false }) {
    const wrap = h('div', { class: 'tihu-fitem' + (compact ? ' is-compact' : '') });
    if (labelText && !compact) wrap.append(h('span', { class: 'tihu-flabel' }, labelText));
    const curOpt = options.find(o => o.value === value) || options[0] || { value: 'all', label: '全部' };
    const menu = h('div', { class: 'tihu-cmenu' });
    const closeMenu = () => menu.classList.remove('open');
    for (const opt of options) {
      const item = h('button', {
        type: 'button',
        class: 'tihu-copt' + (opt.value === curOpt.value ? ' sel' : ''),
        onpointerdown: (e) => { e.stopPropagation(); window.__tihuComboActAt = Date.now(); },
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.__tihuComboActAt = Date.now();
          closeMenu();
          onSelect(opt.value);
        },
      },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          opt.brandKey && typeof vlogo === 'function' ? vlogo(opt.brandKey, 14) : null,
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, opt.label)
        ),
        opt.badge != null ? h('span', { class: 'mono dim', style: { fontSize: '11px', flexShrink: '0' } }, String(opt.badge)) : null
      );
      menu.append(item);
    }
    const toggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.__tihuComboActAt = Date.now();
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.tihu-cmenu.open').forEach(m => m.classList.remove('open'));
      if (!wasOpen) menu.classList.add('open');
    };
    const box = h('div', {
      class: 'tihu-cbox',
      onpointerdown: (e) => { e.stopPropagation(); window.__tihuComboActAt = Date.now(); },
      onclick: (e) => { e.stopPropagation(); },
    },
      curOpt.brandKey && typeof vlogo === 'function' ? vlogo(curOpt.brandKey, 14) : null,
      h('button', { type: 'button', class: 'tihu-cbtn', onclick: toggle }, curOpt.label),
      h('button', { type: 'button', class: 'tihu-ctog', onclick: toggle }, '▾'),
      menu
    );
    wrap.append(box);
    return wrap;
  }

  if (typeof document !== 'undefined' && !window.__tihuDropdownGlobalBound) {
    window.__tihuDropdownGlobalBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.closest && e.target.closest('.tihu-cbox')) return;
      document.querySelectorAll('.tihu-cmenu.open').forEach(m => m.classList.remove('open'));
    }, true);
  }

  function renderLibraryPanel(initialQuery = '', opts = {}) {
    const onClose = typeof opts?.onClose === 'function' ? opts.onClose : null;
    const host = h('div', { class: 'pel-lib-panel' });
    let qRaw = String(initialQuery || '').trim();
    let qStr = qRaw.toLowerCase();
    let vendorFilter = 'all';
    let modelFilter = 'all';
    let tierFilter = 'all';
    let page = 0;
    const ROWS_PER_COL = 8;
    const SINGLE_TIER_PAGE_SIZE = 16;

    const renderSpecimenCard = (it, stageH = 142) => {
      const stg = h('div', {});
      mountScaledStage(stg, it, stageH);
      const kb = (((it.bytes || it.sizeBytes || 0)) / 1024).toFixed(1);
      const itTier = TIER_LIST.includes(String(it.tier || '').toLowerCase()) ? String(it.tier).toLowerCase() : 'high';
      const vId = mapTihuVendorId(it.vendor, it.displayModel || it.family || '');
      return h('div', { class: 'pel-model-card', 'data-tier': itTier },
        h('div', { class: 'pel-card-head' },
          h('span', { class: 'pel-card-brand', style: { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '0', flex: '1' } },
            typeof vlogo === 'function' ? vlogo(vId, 14) : null,
            h('b', { class: 'pel-model-name', title: it.displayModel || it.family }, it.displayModel || it.family)),
          h('span', { class: 'pel-score-badge', 'data-tier': itTier }, itTier.toUpperCase())),
        stg,
        h('div', { class: 'pel-card-foot' },
          h('span', { class: 'mono dim' }, kb > 0 ? kb + ' KB' : (it.id || '')),
          h('span', { class: 'mono dim' }, it.source === 'client-correction' ? '纠错入库' : (it.isSvg ? 'SVG' : 'HTML'))));
    };

    const makeCloseBtn = () => onClose
      ? h('button', { type: 'button', class: 'pel-lib-close-btn', title: '关闭鹈鹕库 (Esc)', 'aria-label': '关闭', onclick: () => onClose() }, '✕')
      : null;

    const paint = () => {
      const st = status();
      if (!st.configured) {
        host.replaceChildren(
          h('div', { class: 'pel-lib-sticky-top' },
            h('div', { class: 'pel-lib-topbar' },
              h('span', { class: 'pel-lib-title' }, '醍醐库'),
              h('span', { class: 'grow' }),
              makeCloseBtn())),
          h('div', { class: 'mc-uses', style: { padding: '24px 18px', textAlign: 'center' } },
            h('p', {}, '尚未配置醍醐 HTML/SVG 识别库网页地址与密码。'),
            h('button', { class: 'btn sm', onclick: () => openSettingsModal(() => paint()) }, '立即配置接入'))
        );
        return;
      }
      if (!st.ready) {
        host.replaceChildren(
          h('div', { class: 'pel-lib-sticky-top' },
            h('div', { class: 'pel-lib-topbar' },
              h('span', { class: 'pel-lib-title' }, '醍醐库'),
              h('span', { class: 'grow' }),
              makeCloseBtn())),
          h('div', { class: 'mc-uses', style: { padding: '24px 18px', textAlign: 'center' } },
            h('p', {}, st.syncing ? '正在从醍醐网页同步完整样本库与识别模型…' : ('尚未拉取样本库' + (st.lastErr ? '（' + st.lastErr + '）' : ''))),
            h('button', { class: 'btn sm', disabled: st.syncing || null, onclick: () => void sync({ force: true }).then(() => paint()) }, '立即拉取'))
        );
        return;
      }

      const allItems = allSpecimens();
      const vendorCounts = new Map();
      for (const it of allItems) {
        const v = String(it.vendor || 'Other');
        vendorCounts.set(v, (vendorCounts.get(v) || 0) + 1);
      }
      const sortedVendors = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]);

      const modelKeyOf = (it) => normSlug(it.family || String(it.displayModel || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '') || it.id || 'unknown');
      const modelLabelOf = (it) => String(it.displayModel || it.family || it.id || 'Unknown').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').trim();

      const vendorScopedItems = vendorFilter === 'all'
        ? allItems
        : allItems.filter(it => String(it.vendor || 'Other') === vendorFilter);

      const modelMap = new Map();
      for (const it of vendorScopedItems) {
        const mk = modelKeyOf(it);
        if (!mk) continue;
        let rec = modelMap.get(mk);
        if (!rec) {
          rec = { key: mk, label: modelLabelOf(it), vendor: String(it.vendor || 'Other'), count: 0, tiers: new Set() };
          modelMap.set(mk, rec);
        }
        rec.count++;
        const tr = String(it.tier || '').toLowerCase();
        if (TIER_LIST.includes(tr)) rec.tiers.add(tr.toUpperCase());
      }
      const sortedModels = [...modelMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      if (modelFilter !== 'all' && !modelMap.has(modelFilter)) {
        modelFilter = 'all';
      }

      const modelScopedItems = modelFilter === 'all'
        ? vendorScopedItems
        : vendorScopedItems.filter(it => modelKeyOf(it) === modelFilter);

      const vendorOpts = [
        { value: 'all', label: '全部厂商', badge: allItems.length, brandKey: '' },
        ...sortedVendors.map(([v, cnt]) => ({
          value: v,
          label: v,
          badge: cnt,
          brandKey: mapTihuVendorId(v, ''),
        })),
      ];

      const modelOpts = [
        { value: 'all', label: '全部型号 (' + sortedModels.length + ' 组)', badge: vendorScopedItems.length, brandKey: vendorFilter !== 'all' ? mapTihuVendorId(vendorFilter, '') : '' },
        ...sortedModels.map(m => ({
          value: m.key,
          label: m.label,
          badge: m.count + '份',
          brandKey: mapTihuVendorId(m.vendor, m.label),
        })),
      ];

      const tierLabelMap = { low: 'LOW · 铁', medium: 'MEDIUM · 铜', high: 'HIGH · 银', max: 'MAX · 金' };
      const tierOpts = [
        { value: 'all', label: '全部强度 · 四列', badge: modelScopedItems.length },
        ...TIER_LIST.map(t => ({
          value: t,
          label: tierLabelMap[t] || (t.toUpperCase() + ' 强度'),
          badge: modelScopedItems.filter(it => (TIER_LIST.includes(String(it.tier || '').toLowerCase()) ? String(it.tier).toLowerCase() : 'high') === t).length,
        })),
      ];

      const hasAnyFilter = () => Boolean(vendorFilter !== 'all' || modelFilter !== 'all' || tierFilter !== 'all' || qStr);
      const searchIcon = h('span', { class: 'pel-lib-search-ico', 'aria-hidden': 'true' });
      searchIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7.5"></circle><line x1="20" y1="20" x2="16.35" y2="16.35"></line></svg>';

      const clearBtn = h('button', {
        type: 'button',
        class: 'pel-lib-search-clear',
        title: '清空搜索词',
        style: { display: qStr ? 'inline-flex' : 'none' },
        onclick: () => {
          qRaw = '';
          qStr = '';
          searchInp.value = '';
          clearBtn.style.display = 'none';
          resetBtn.style.display = hasAnyFilter() ? 'inline-flex' : 'none';
          page = 0;
          paintGridOnly();
          searchInp.focus();
        },
      }, '×');

      const resetBtn = h('button', {
        type: 'button',
        class: 'btn xs ghost pel-lib-reset-btn',
        style: { display: hasAnyFilter() ? 'inline-flex' : 'none' },
        onclick: () => { vendorFilter = 'all'; modelFilter = 'all'; tierFilter = 'all'; qRaw = ''; qStr = ''; page = 0; paint(); },
      }, '重置');

      const searchInp = h('input', {
        type: 'text',
        class: 'pel-lib-search-input',
        value: qRaw,
        placeholder: '搜索型号 / 家族 / 厂商关键词…',
        'aria-label': '搜索型号关键词',
        oninput: e => {
          qRaw = String(e.target.value || '');
          qStr = qRaw.trim().toLowerCase();
          clearBtn.style.display = qStr ? 'inline-flex' : 'none';
          resetBtn.style.display = hasAnyFilter() ? 'inline-flex' : 'none';
          page = 0;
          paintGridOnly();
        },
      });

      const searchBox = h('div', { class: 'pel-lib-search-box' }, searchIcon, searchInp, clearBtn);

      const topbar = h('div', { class: 'pel-lib-topbar' },
        h('span', { class: 'pel-lib-title' }, '醍醐库'),
        searchBox,
        h('div', { class: 'pel-lib-cascades' },
          createTihuDropdown({
            compact: true,
            value: vendorFilter,
            options: vendorOpts,
            onSelect: (v) => { vendorFilter = v; modelFilter = 'all'; page = 0; paint(); },
          }),
          createTihuDropdown({
            compact: true,
            value: modelFilter,
            options: modelOpts,
            onSelect: (m) => { modelFilter = m; page = 0; paint(); },
          }),
          createTihuDropdown({
            compact: true,
            value: tierFilter,
            options: tierOpts,
            onSelect: (t) => { tierFilter = t; page = 0; paint(); },
          })),
        h('div', { class: 'pel-lib-actions' },
          resetBtn,
          h('button', { type: 'button', class: 'btn xs ghost', title: '配置醍醐网页地址与访问密码', onclick: () => openSettingsModal(() => paint()) }, '配置'),
          h('button', {
            type: 'button',
            class: 'btn xs ghost tihu-lib-sync-btn' + (st.syncing ? ' spinning' : ''),
            title: st.syncing ? '正在同步醍醐样本库…' : ('同步更新样本库（当前 ' + allItems.length + ' 份）'),
            disabled: st.syncing || null,
            onclick: () => void sync({ force: true }).then(() => paint()),
          }, typeof icon === 'function' ? icon('refresh') : '↻'),
          makeCloseBtn()));

      const stickyHeader = h('div', { class: 'pel-lib-sticky-top' }, topbar);
      const gridSlot = h('div', { class: 'pel-lib-scroll-body' });
      const paintGridOnly = () => {
        const baseFiltered = allItems.filter(it => {
          if (vendorFilter !== 'all' && String(it.vendor || 'Other') !== vendorFilter) return false;
          if (modelFilter !== 'all' && modelKeyOf(it) !== modelFilter) return false;
          if (qStr) {
            const hay = (String(it.displayModel || '') + ' ' + String(it.family || '') + ' ' + String(it.vendor || '') + ' ' + String(it.id || '')).toLowerCase();
            if (!hay.includes(qStr) && !hay.replace(/[\s_]+/g, '-').includes(qStr) && !alnumSlug(hay).includes(alnumSlug(qStr))) return false;
          }
          return true;
        });

        if (tierFilter === 'all') {
          const buckets = { low: [], medium: [], high: [], max: [] };
          for (const it of baseFiltered) {
            const t = String(it.tier || '').toLowerCase();
            const key = TIER_LIST.includes(t) ? t : 'high';
            buckets[key].push(it);
          }
          const maxLen = Math.max(0, ...TIER_LIST.map(t => buckets[t].length));
          const tp = Math.max(1, Math.ceil(maxLen / ROWS_PER_COL));
          if (page >= tp) page = tp - 1;
          if (page < 0) page = 0;

          const tierTitleZh = { low: 'LOW · 低强度', medium: 'MEDIUM · 中强度', high: 'HIGH · 高强度', max: 'MAX · 满血强度' };
          const columns = h('div', { class: 'pel-tier-columns' },
            ...TIER_LIST.map(t => {
              const colItems = buckets[t];
              const colSlice = colItems.slice(page * ROWS_PER_COL, (page + 1) * ROWS_PER_COL);
              return h('div', { class: 'pel-tier-col', 'data-tier': t },
                h('div', {
                  class: 'pel-tier-col-head',
                  'data-tier': t,
                  title: '点击单独查看 ' + t.toUpperCase() + ' 强度样本',
                  onclick: () => { tierFilter = t; page = 0; paint(); },
                },
                  h('span', { class: 'pel-tier-col-title' }, tierTitleZh[t] || t.toUpperCase()),
                  h('span', { class: 'pel-tier-col-cnt mono' }, colItems.length + ' 份')),
                h('div', { class: 'pel-tier-col-body' },
                  ...(colSlice.length > 0
                    ? colSlice.map(it => renderSpecimenCard(it, 138))
                    : [h('div', { class: 'pel-tier-empty dim mono' }, colItems.length > 0 ? '本页无更多样本' : '暂无该强度样本')])));
            })
          );

          const pager = tp > 1
            ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px' } },
                h('button', { type: 'button', class: 'btn xs ghost', disabled: page <= 0 || null, onclick: () => { page--; paintGridOnly(); } }, '上一页'),
                h('span', { class: 'mono dim', style: { fontSize: '12px' } }, (page + 1) + ' / ' + tp + ' 页（四列共 ' + baseFiltered.length + ' 份样本 · LOW ' + buckets.low.length + ' / MEDIUM ' + buckets.medium.length + ' / HIGH ' + buckets.high.length + ' / MAX ' + buckets.max.length + '）'),
                h('button', { type: 'button', class: 'btn xs ghost', disabled: page >= tp - 1 || null, onclick: () => { page++; paintGridOnly(); } }, '下一页'))
            : h('div', { class: 'dim mono', style: { textAlign: 'center', fontSize: '12px', marginTop: '6px' } }, '四列共 ' + baseFiltered.length + ' 份样本（LOW ' + buckets.low.length + ' · MEDIUM ' + buckets.medium.length + ' · HIGH ' + buckets.high.length + ' · MAX ' + buckets.max.length + '）');

          gridSlot.replaceChildren(...[columns, pager].filter(Boolean));
          return;
        }

        const f2 = baseFiltered.filter(it => (TIER_LIST.includes(String(it.tier || '').toLowerCase()) ? String(it.tier).toLowerCase() : 'high') === tierFilter);
        const tp = Math.max(1, Math.ceil(f2.length / SINGLE_TIER_PAGE_SIZE));
        if (page >= tp) page = tp - 1;
        if (page < 0) page = 0;
        const curSlice = f2.slice(page * SINGLE_TIER_PAGE_SIZE, (page + 1) * SINGLE_TIER_PAGE_SIZE);
        const grid = h('div', { class: 'pel-cards-grid pel-cards-grid-4' },
          ...(curSlice.length > 0
            ? curSlice.map(it => renderSpecimenCard(it, 152))
            : [h('div', { class: 'pel-tier-empty dim mono', style: { gridColumn: '1 / -1' } }, '暂无 ' + tierFilter.toUpperCase() + ' 强度样本')]));
        const pager = tp > 1
          ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px' } },
              h('button', { type: 'button', class: 'btn xs ghost', disabled: page <= 0 || null, onclick: () => { page--; paintGridOnly(); } }, '上一页'),
              h('span', { class: 'mono dim', style: { fontSize: '12px' } }, (page + 1) + ' / ' + tp + ' 页（' + tierFilter.toUpperCase() + ' 共 ' + f2.length + ' 份样本）'),
              h('button', { type: 'button', class: 'btn xs ghost', disabled: page >= tp - 1 || null, onclick: () => { page++; paintGridOnly(); } }, '下一页'))
          : h('div', { class: 'dim mono', style: { textAlign: 'center', fontSize: '12px', marginTop: '6px' } }, tierFilter.toUpperCase() + ' 强度共 ' + f2.length + ' 份样本（再次点击上方强度按钮恢复四列并排）');
        gridSlot.replaceChildren(...[grid, pager].filter(Boolean));
      };

      paintGridOnly();
      host.replaceChildren(stickyHeader, gridSlot);
    };

    paint();
    return host;
  }

  function openSettingsModal(onDone = null) {
    const c = loadLocalCfg();
    const urlInp = h('input', {
      type: 'url',
      value: c.url || DEFAULT_URL,
      placeholder: DEFAULT_URL,
      spellcheck: false,
      autocomplete: 'off',
      style: { width: '100%', fontFamily: 'var(--mono)' },
    });
    const keyInp = h('input', {
      type: 'password',
      value: c.disconnected ? '' : (c.key || DEFAULT_KEY),
      placeholder: '输入访客密码或管理员密码',
      spellcheck: false,
      autocomplete: 'off',
      style: { width: '100%', fontFamily: 'var(--mono)' },
    });
    const autoChk = h('input', { type: 'checkbox', checked: c.autoDaily !== false || null });

    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 'min(82vw, 420px)' } },
      h('p', { class: 'note' }, '接入醍醐 HTML/SVG 模型识别库后，客户端每日自动同步最新模型特征库、推理强度标尺与网页样本，并自动锁定全部对话中的多语言「鹈鹕」HTML/SVG 轮次更新厂商、型号与强度；日常识别零上传，仅在手动点击「纠偏」时上传 HTML/SVG（重复纠偏自动删除旧提交并替换）。'),
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('b', { style: { fontSize: '12.5px' } }, '网页地址（URL）'),
        urlInp),
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('b', { style: { fontSize: '12.5px' } }, '访问密码（访客密码或管理员密码）'),
        keyInp),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' } },
        autoChk,
        h('span', { style: { fontSize: '12.5px' } }, '每日自动从网页更新完整识别库并重识对话')));

    const saveAndSync = async () => {
      const u = normUrl(urlInp.value || DEFAULT_URL);
      if (!u || !/^https?:\/\/[^\s/]+/i.test(u)) {
        if (typeof toast === 'function') toast('请输入有效的 https:// 网页地址', 'err');
        return;
      }
      await saveCfg({ url: u, key: keyInp.value.trim(), autoDaily: Boolean(autoChk.checked) });
      m.remove();
      await sync({ force: true, quiet: false });
      if (typeof onDone === 'function') onDone();
    };

    keyInp.addEventListener('keydown', e => { if (e.key === 'Enter') void saveAndSync(); });
    const m = modal(
      '醍醐 HTML/SVG 识别库设置',
      body,
      K(
        h('button', { class: 'btn ghost', onclick: () => m.remove() }, '取消'),
        c.url ? h('button', { class: 'btn ghost', onclick: async () => { await saveCfg({ url: '', key: '', autoDaily: true, disconnected: true }); m.remove(); if (typeof onDone === 'function') onDone(); } }, '断开') : null,
        h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => void saveAndSync() }, '保存并立即更新')
      )
    );
    setTimeout(() => (c.url ? keyInp : urlInp).focus(), 40);
  }

  function row(cls = 'set') {
    const sm = h('small', {});
    const cfgBtn = h('button', { type: 'button', class: 'btn ghost sm', title: '设置醍醐网页地址与访问密码', onclick: () => openSettingsModal() }, typeof icon === 'function' ? icon('gear') : '配置');
    const syncBtn = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => void sync({ force: true, quiet: false }) }, '立即更新');

    const paint = () => {
      const st = status();
      if (!st.configured) {
        sm.textContent = '未配置 · 填入网页地址与密码后，每日自动同步完整 HTML/SVG 识别库并自动锁定更新全部鹈鹕对话识别';
        syncBtn.disabled = true;
      } else if (st.syncing) {
        sm.textContent = '正在从 ' + st.url.replace(/^https?:\/\//, '') + ' 拉取最新识别库与引擎…';
        syncBtn.disabled = true;
      } else if (st.ready) {
        const dt = st.syncedAt ? new Date(st.syncedAt).toLocaleString('zh-CN', { hour12: false }) : '刚刚';
        const scanTxt = _lastScanSummary ? (' · 已锁定 ' + _lastScanSummary.matched + ' 条鹈鹕对话') : '';
        sm.textContent = '已连接 ' + st.url.replace(/^https?:\/\//, '') + ' · 库内 ' + st.specimenCount + ' 份样本 / ' + st.modelCount + ' 个型号 · 上次更新 ' + dt + scanTxt;
        syncBtn.disabled = false;
      } else {
        sm.textContent = '已配置 ' + st.url.replace(/^https?:\/\//, '') + (st.lastErr ? ' · 上次同步失败：' + st.lastErr : ' · 待首次拉取识别库');
        syncBtn.disabled = false;
      }
    };

    paint();
    const off = onSync(() => { if (!sm.isConnected) off(); else paint(); });
    return h('div', { class: cls },
      h('span', {}, h('b', {}, '醍醐 HTML/SVG 识别库'), sm),
      h('div', { class: 'set-btns' }, cfgBtn, syncBtn));
  }

  async function bootInit() {
    try {
      if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.purgeLegacyHabitDataOnce === 'function') {
        void ChatHabitFingerprint.purgeLegacyHabitDataOnce();
      }
    } catch {}
    await pullSharedFromHost({ triggerScan: false, triggerSyncIfEmpty: false });

    let lastHistCount = 0;
    const triggerAutoBatchScan = (delayMs = 250) => {
      setTimeout(() => {
        if (isReady()) {
          void scanAndRecognizeAllChats({ forceLoadUncached: true, quiet: true });
        }
      }, delayMs);
    };

    try {
      if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
        Bus.on('done', chat => {
          if (chat?.sid && isReady()) {
            setTimeout(() => { void recognizeSingleChatUnified(chat.sid, chat, { allowHealStub: true, refreshBilling: true }).then(() => { try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.render?.(); Bar?.render?.(); } catch {} }); }, 240);
          }
        });
        Bus.on('host', () => {
          _viewVerifyMemo.clear();
          lastHistCount = -1;
          void pullSharedFromHost({ triggerScan: true, triggerSyncIfEmpty: true });
          triggerAutoBatchScan(300);
        });
        Bus.on('me', () => {
          _viewVerifyMemo.clear();
          lastHistCount = -1;
          void pullSharedFromHost({ triggerScan: true, triggerSyncIfEmpty: true });
          triggerAutoBatchScan(350);
        });
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          let lastFocusPull = 0;
          window.addEventListener('focus', () => {
            const ts = Date.now();
            if (ts - lastFocusPull < 5000) return;
            lastFocusPull = ts;
            void pullSharedFromHost({ triggerScan: false, triggerSyncIfEmpty: true });
          });
        }
        Bus.on('history', () => {
          const curCnt = (typeof History !== 'undefined' && Array.isArray(History.items)) ? History.items.length : 0;
          if (curCnt !== lastHistCount || !_lastScanSummary) {
            lastHistCount = curCnt;
            triggerAutoBatchScan(300);
          }
          if (typeof UI !== 'undefined' && UI.active) {
            setTimeout(() => { void verifyChatOnView(UI.active, (typeof Chats !== 'undefined' && Chats.get) ? Chats.get(UI.active) : null); }, 120);
          }
        });
      }
    } catch {}

    const checkDaily = async () => {
      const c = loadLocalCfg();
      if (!c.url) return;
      if (c.autoDaily !== false && (!_bundle.syncedAt || !isReady() || !globalThis.PelicanFingerprintEngine?._conditionedV3 || (Date.now() - _bundle.syncedAt) >= DAY_MS)) {
        await sync({ force: !globalThis.PelicanFingerprintEngine?._conditionedV3, quiet: true });
      } else if (isReady()) {
        void scanAndRecognizeAllChats({ forceLoadUncached: true, quiet: true });
      }
    };
    void checkDaily();
    setTimeout(() => {
      const curCnt = (typeof History !== 'undefined' && Array.isArray(History.items)) ? History.items.length : 0;
      if (isReady() && (curCnt > lastHistCount || (_lastScanSummary && _lastScanSummary.scanned < curCnt))) {
        lastHistCount = curCnt;
        void scanAndRecognizeAllChats({ forceLoadUncached: true, quiet: true });
      }
    }, 4500);
    if (typeof setInterval === 'function') setInterval(() => { void checkDaily(); }, 3600 * 1000);
  }

  if (typeof setTimeout === 'function') {
    setTimeout(() => { void bootInit(); }, 250);
  }

  return {
    cfg: loadLocalCfg,
    saveCfg,
    pullSharedFromHost,
    status,
    syncRevision: () => _syncRev,
    isReady,
    sync,
    onSync,
    identifySync,
    analyzeChatSync,
    extractChatConstraints,
    lookupSoftCostScore,
    resolveCanonicalIdentity,
    mapTihuVendorId,
    fuseScores,
    healChatHtmlStubs,
    extractPelicanTurnHtml,
    recognizePelicanChatAndApply,
    recognizeSingleChatUnified,
    verifyChatOnView,
    onWorkspaceLoaded,
    scanAndRecognizeAllChats,
    toTihuThreeTuple,
    uploadChatCorrection,
    allSpecimens,
    matchSpecimens,
    fetchSpecimenCode,
    toSrcdoc,
    renderModelCardSection,
    renderLibraryPanel,
    openSettingsModal,
    row,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.TihuHub = TihuHub;
