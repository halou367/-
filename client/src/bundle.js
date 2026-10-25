// 把 ui/ 下的文件拼成一个可注入脚本（Electron 运行时调用，安卓构建前由 scripts/bundle.js 调用）
const fs = require('fs');
if (!fs._branaBrotliHooked) {
  const _origReadFileSync = fs.readFileSync.bind(fs);
  const _zlib = require('zlib');
  fs.readFileSync = function branaReadFileSync(file, options) {
    const raw = _origReadFileSync(file, typeof options === 'object' && options ? { ...options, encoding: null } : undefined);
    const enc = typeof options === 'string' ? options : options?.encoding;
    if (Buffer.isBuffer(raw) && raw.length >= 6 && raw[0] === 0x2f && raw[1] === 0x2a && raw[2] === 0x42 && raw[3] === 0x52 && raw[4] === 0x2a && raw[5] === 0x2f) {
      const dec = _zlib.brotliDecompressSync(raw.subarray(6));
      return enc ? dec.toString(enc) : dec;
    }
    return enc && Buffer.isBuffer(raw) ? raw.toString(enc) : raw;
  };
  fs._branaBrotliHooked = true;
}
const path = require('path');
const ORDER = ['vless.js', 'route-state.js', 'route-policy.js', 'route-host.js', 'workspace-path.js', 'md.js', 'net-policy.js', 'auth-flow.js', 'auth-environment.js', 'core.js', 'cap-route.js', 'eval-core.js', 'mail-token.js', 'gacha-prompts.js', 'title-compact.js', 'title-flex.js', 'title-cipher.js', 'fmt.js', 'cscore.js', 'trace.js', 'workspace-preview.js', 'probe-vendor.js', 'probe-bank-cache.js', 'probe-bank-ikale.js', 'fp-libs.js', 'probe-output-guard.js', 'thinking-status.js', 'personal-fingerprint-math.js', 'personal-fingerprint.js', 'shared-fingerprint-schema.js', 'shared-fingerprint.js', 'fingerprint.js', 'fingerprint-library-ui.js', 'fingerprint-batch.js', 'pelican-test.js', 'fingerprint-review.js', 'conversation-labels.js', 'slash-commands.js', 'panel-work.js', 'render-work.js', 'send-queue.js', 'view.js', 'mode-switcher.js', 'eval-view.js', 'html-preview.js', 'sidebar-tools.js', 'gacha.js', 'gview.js', 'device-info.js', 'arena-trace/probe-context.js', 'arena-trace/preimage.js', 'arena-trace/claude-standalone-v5.js', 'arena-trace/gpt-standalone-v1.js', 'arena-trace/pricing.js', 'arena-trace/family.js', 'arena-trace/confidence.js', 'arena-trace/catalog-sync.js', 'billing-probe.js', 'habit-builtin-bank.js', 'billing-probe-ui.js', 'dock.js', 'file-export.js', 'chat-export.js', 'connectors.js', 'titles.js', 'title-sync.js', 'probe-archive.js', 'strength.js', 'price.js', 'gpop.js', 'slot.js', 'revolver.js', 'accounts.js', 'account-panel-size.js', 'account-vendor-fold.js', 'account-picker.js', 'account-management.js', 'nodes.js', 'iprep.js', 'pool.js', 'node-speed.js', 'node-routes.js', 'region-ip.js', 'env-refresh.js', 'env-check.js', 'auto-route.js', 'plus.js', 'palette.js', 'keep.js', 'mobile.js', 'astats.js', 'mgr.js', 'update.js', 'capture.js', 'bulk.js', 'session-gate.js', 'boot.js'];
function build(uiDir, version, opt = {}) {
  if (process.versions?.electron && !opt?.forceRebuild) {
    for (const cand of [
      path.join(uiDir, '..', 'gen', 'ui.desktop.bundle.js').replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1'),
      path.join(uiDir, '..', 'gen', 'ui.desktop.bundle.js'),
      path.join(uiDir, '..', 'gen', 'ui.bundle.js').replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1'),
      path.join(uiDir, '..', 'gen', 'ui.bundle.js'),
    ]) {
      try { if (fs.existsSync(cand)) return fs.readFileSync(cand, 'utf8'); } catch {}
    }
  }
  let css = fs.readFileSync(path.join(uiDir, 'app.css'), 'utf8');
  // 国旗字体（Windows 不带国旗 emoji）：Twemoji Country Flags（CC-BY 4.0，来自 country-flag-emoji-polyfill），内嵌成 data URI
  try { css = css.replace('__FLAGS_WOFF2__', fs.readFileSync(path.join(uiDir, 'flags.woff2')).toString('base64')); } catch {}
  try { css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>~])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}'); } catch {}
  // 国家 → [默认语言, 时区…]（设备信息核对时区 / 语言用）
  let env = '{}'; try { const R = JSON.parse(fs.readFileSync(path.join(uiDir, 'region-environments.json'), 'utf8')); env = JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.locale, ...new Set([v.timezone, ...(v.zones || [])])]]))); } catch {}
  const billingCatalog = JSON.stringify(JSON.parse(fs.readFileSync(path.join(uiDir, 'arena-trace', 'catalog.json'), 'utf8')));
  let pelicanClassifierModel = 'null'; try { pelicanClassifierModel = JSON.stringify(JSON.parse(fs.readFileSync(path.join(uiDir, 'arena-trace', 'pelican-classifier-model.json'), 'utf8'))); } catch {} // Fail the build rather than ship a silently empty price table.
  const js = ORDER.map(f => {
    const compactBundleSlice = (fname, raw) => {
      try {
        if (fname === 'probe-bank-ikale.js' && raw.includes('const IkaleBank =')) {
          if (opt?.slimDesktopBundle) {
            return 'let _ikaleParsed = null, _ikaleTimer = 0;\nconst _getIkale = () => { clearTimeout(_ikaleTimer); if (!_ikaleParsed) { let r = (typeof window !== "undefined" && window.BranaHost?.staticBankSync) ? window.BranaHost.staticBankSync("ikale") : "{}"; if (typeof r === "string") r = r.replace(/;\\s*(?:if\\s*\\(\\s*typeof\\s+(?:module|window|globalThis)\\b[\\s\\S]*|module\\.exports[\\s\\S]*)$/, ""); _ikaleParsed = JSON.parse(r || "{}"); } _ikaleTimer = setTimeout(() => { _ikaleParsed = null; }, 3500); return _ikaleParsed; };\nconst IkaleBank = new Proxy({}, { get(_, k) { return _getIkale()[k]; }, ownKeys() { return Reflect.ownKeys(_getIkale()); }, getOwnPropertyDescriptor(_, k) { return Object.getOwnPropertyDescriptor(_getIkale(), k); }, has(_, k) { return k in _getIkale(); } });\n';
          }
          const cleanRaw = raw.replace(/;\s*(?:if\s*\(\s*typeof\s+(?:module|window|globalThis)\b[\s\S]*|module\.exports[\s\S]*)$/, '');
          const i = cleanRaw.indexOf('{'), j = cleanRaw.lastIndexOf('}');
          if (i !== -1 && j > i) {
            const minJson = JSON.stringify(JSON.parse(cleanRaw.slice(i, j + 1)));
            return 'let _ikaleRaw = ' + JSON.stringify(minJson) + ', _ikaleParsed = null;\nconst _getIkale = () => { if (!_ikaleParsed) { _ikaleParsed = JSON.parse(_ikaleRaw); _ikaleRaw = ""; } return _ikaleParsed; };\nconst IkaleBank = new Proxy({}, { get(_, k) { return _getIkale()[k]; }, ownKeys() { return Reflect.ownKeys(_getIkale()); }, getOwnPropertyDescriptor(_, k) { return Object.getOwnPropertyDescriptor(_getIkale(), k); }, has(_, k) { return k in _getIkale(); } });\n';
          }
        }
        if (fname === 'habit-builtin-bank.js' && raw.includes('const BUILTIN_HABIT_BANK =')) {
          if (opt?.slimDesktopBundle) {
            return 'let _hbParsed = null, _hbTimer = 0;\nconst _getHb = () => { clearTimeout(_hbTimer); if (!_hbParsed) { let r = (typeof window !== "undefined" && window.BranaHost?.staticBankSync) ? window.BranaHost.staticBankSync("habit") : "{}"; if (typeof r === "string") r = r.replace(/;\\s*(?:if\\s*\\(\\s*typeof\\s+(?:module|window|globalThis)\\b[\\s\\S]*|module\\.exports[\\s\\S]*)$/, ""); _hbParsed = JSON.parse(r || "{}"); } _hbTimer = setTimeout(() => { _hbParsed = null; }, 3500); return _hbParsed; };\nconst BUILTIN_HABIT_BANK = new Proxy({}, { get(_, k) { if (k === "__releaseSamples") return () => { _hbParsed = null; }; return _getHb()[k]; }, ownKeys() { return Reflect.ownKeys(_getHb()); }, getOwnPropertyDescriptor(_, k) { return Object.getOwnPropertyDescriptor(_getHb(), k); }, has(_, k) { return k in _getHb(); } });\nif (typeof globalThis !== "undefined") globalThis.BUILTIN_HABIT_BANK = BUILTIN_HABIT_BANK;\n';
          }
          const cleanRaw = raw.replace(/;\s*(?:if\s*\(\s*typeof\s+(?:module|window|globalThis)\b[\s\S]*|module\.exports[\s\S]*)$/, '');
          const i = cleanRaw.indexOf('{'), j = cleanRaw.lastIndexOf('}');
          if (i !== -1 && j > i) {
            const minJson = JSON.stringify(JSON.parse(cleanRaw.slice(i, j + 1)));
            return 'let _hbRaw = ' + JSON.stringify(minJson) + ', _hbParsed = null;\nconst _getHb = () => { if (!_hbParsed) { _hbParsed = JSON.parse(_hbRaw); _hbRaw = ""; } return _hbParsed; };\nconst BUILTIN_HABIT_BANK = new Proxy({}, { get(_, k) { if (k === "__releaseSamples") return () => { if (_hbParsed) delete _hbParsed.samples; }; return _getHb()[k]; }, ownKeys() { return Reflect.ownKeys(_getHb()); }, getOwnPropertyDescriptor(_, k) { return Object.getOwnPropertyDescriptor(_getHb(), k); }, has(_, k) { return k in _getHb(); } });\nif (typeof globalThis !== "undefined") globalThis.BUILTIN_HABIT_BANK = BUILTIN_HABIT_BANK;\n';
          }
        }
        if (fname === 'probe-vendor.js') {
          const iBank = raw.indexOf('get bank() {');
          const iSeed = raw.indexOf('get seedBank() {', iBank);
          const iEnd = raw.indexOf('});', iSeed);
          if (iBank !== -1 && iSeed > iBank && iEnd > iSeed) {
            if (opt?.slimDesktopBundle) {
              raw = raw.slice(0, iBank)
                + 'get bank() { clearTimeout(_bt); if (!_bank) { _bank = engine.validateBank(JSON.parse((typeof window !== "undefined" && window.BranaHost?.staticBankSync && window.BranaHost.staticBankSync("whatsmyllm")) || "{}")); } _bt = setTimeout(() => { _bank = null; }, 3500); return _bank; }, '
                + 'get seedBank() { clearTimeout(_sbt); if (!_seedBank) { _seedBank = engine.validateBank(JSON.parse((typeof window !== "undefined" && window.BranaHost?.staticBankSync && window.BranaHost.staticBankSync("whatsmyllm-seed")) || "{}")); } _sbt = setTimeout(() => { _seedBank = null; }, 3500); return _seedBank; }'
                + raw.slice(iEnd);
              raw = raw.replace('let _bank, _seedBank;', 'let _bank, _seedBank, _bt = 0, _sbt = 0;');
            } else {
              const bStart = raw.indexOf('JSON.parse(', iBank) + 11;
              const bEnd = raw.lastIndexOf(')))', iSeed);
              const sStart = raw.indexOf('JSON.parse(', iSeed) + 11;
              const sEnd = raw.lastIndexOf(')))', iEnd);
              if (bStart > 11 && bEnd > bStart && sStart > iSeed && sEnd > sStart) {
                const bObj = JSON.parse(JSON.parse(raw.slice(bStart, bEnd)));
                const sObj = JSON.parse(JSON.parse(raw.slice(sStart, sEnd)));
                const bById = new Map((bObj.models || []).map(m => [m.id, JSON.stringify(m)]));
                const slimModels = (sObj.models || []).map(m => bById.get(m.id) === JSON.stringify(m) ? { _ref: m.id } : m);
                const sSlimLit = JSON.stringify(JSON.stringify({ ...sObj, models: slimModels }));
                raw = raw.slice(0, iSeed)
                  + 'get seedBank() { if (_seedBank) return _seedBank; const b = this.bank, bm = new Map((b?.models || []).map(x => [x.id, x])), d = JSON.parse(' + sSlimLit + '); d.models = (d.models || []).map(x => x._ref ? (bm.get(x._ref) || x) : x); return (_seedBank = engine.validateBank(d)); }'
                  + raw.slice(iEnd);
              }
            }
          }
        }
      } catch {}
      let inTpl = 0, inBlk = false;
      const outLines = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = (inTpl > 0 || inBlk) ? line : line.trim();
        if (!inTpl && !inBlk && (!trimmed || trimmed.startsWith('//'))) continue;
        outLines.push(trimmed);
        for (let i = 0; i < trimmed.length; i++) {
          const ch = trimmed[i], nx = trimmed[i + 1];
          if (inBlk) { if (ch === '*' && nx === '/') { inBlk = false; i++; } continue; }
          if (!inTpl && ch === '/' && nx === '*') { inBlk = true; i++; continue; }
          if (!inTpl && ch === '/' && nx === '/') break;
          if (ch === '\\') { i++; continue; }
          if (!inTpl && (ch === "'" || ch === '"')) {
            const q = ch; i++;
            while (i < trimmed.length && trimmed[i] !== q) { if (trimmed[i] === '\\') i++; i++; }
            continue;
          }
          if (ch === '`') { inTpl = inTpl ? 0 : 1; }
        }
      }
      return outLines.join('\n');
    };
    let s = compactBundleSlice(f, fs.readFileSync(path.join(uiDir, f), 'utf8'));
    if (s.includes('/*__REGION_ENV__*/null')) s = s.replace('/*__REGION_ENV__*/null', env);
    if (s.includes('/*__ARENA_AGENT_CATALOG__*/null')) s = s.replace('/*__ARENA_AGENT_CATALOG__*/null', billingCatalog);
    if (s.includes('/*__PELICAN_CLASSIFIER_MODEL__*/null')) s = s.replace('/*__PELICAN_CLASSIFIER_MODEL__*/null', pelicanClassifierModel);
    return `// ---- ${f} ----\n` + s;
  }).join('\n');
  // 内置的更新服务器地址（package.json 的 updateUrl；空 = 用户在设置里自己填）
  let upd = ''; try { upd = String(require(path.join(uiDir, '..', 'package.json')).updateUrl || ''); } catch {}
  if (!/^https:\/\/[\w.\-:]+(\/[\w.\-\/]*)?$/.test(upd)) upd = '';
  let out = `(() => {\n'use strict';\nlet CSS = ${JSON.stringify(css)};\n${js.replace(/__VERSION__/g, version).replace(/__UPD_URL__/g, upd)}\n})();\n`;
  if (!opt?.skipSyntaxCheck && !process.versions?.electron) { const VM = require('vm'); new VM.Script(out, { filename: 'ui.bundle.js' }); }
  return out;
}
module.exports = { build, ORDER };
