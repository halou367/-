// 把 ui/ 下的文件拼成一个可注入脚本（Electron 运行时调用，安卓构建前由 scripts/bundle.js 调用）
const fs = require('fs');
const path = require('path');
const ORDER = ['vless.js', 'route-state.js', 'route-policy.js', 'route-host.js', 'workspace-path.js', 'md.js', 'net-policy.js', 'auth-flow.js', 'auth-environment.js', 'core.js', 'cap-route.js', 'eval-core.js', 'mail-token.js', 'gacha-prompts.js', 'title-compact.js', 'title-flex.js', 'title-cipher.js', 'fmt.js', 'cscore.js', 'trace.js', 'workspace-preview.js', 'probe-vendor.js', 'probe-bank-cache.js', 'probe-bank-ikale.js', 'fp-libs.js', 'probe-output-guard.js', 'thinking-status.js', 'personal-fingerprint-math.js', 'personal-fingerprint.js', 'shared-fingerprint-schema.js', 'shared-fingerprint.js', 'fingerprint.js', 'fingerprint-library-ui.js', 'fingerprint-batch.js', 'pelican-test.js', 'fingerprint-review.js', 'conversation-labels.js', 'slash-commands.js', 'panel-work.js', 'render-work.js', 'send-queue.js', 'view.js', 'mode-switcher.js', 'eval-view.js', 'html-preview.js', 'sidebar-tools.js', 'gacha.js', 'gview.js', 'device-info.js', 'arena-trace/preimage.js', 'arena-trace/pricing.js', 'arena-trace/family.js', 'arena-trace/confidence.js', 'arena-trace/catalog-sync.js', 'billing-probe.js', 'habit-builtin-bank.js', 'billing-probe-ui.js', 'dock.js', 'file-export.js', 'chat-export.js', 'connectors.js', 'titles.js', 'title-sync.js', 'probe-archive.js', 'strength.js', 'price.js', 'gpop.js', 'slot.js', 'revolver.js', 'accounts.js', 'account-panel-size.js', 'account-vendor-fold.js', 'account-picker.js', 'account-management.js', 'nodes.js', 'iprep.js', 'pool.js', 'node-speed.js', 'node-routes.js', 'region-ip.js', 'env-refresh.js', 'env-check.js', 'auto-route.js', 'plus.js', 'palette.js', 'keep.js', 'mobile.js', 'astats.js', 'mgr.js', 'update.js', 'capture.js', 'bulk.js', 'session-gate.js', 'boot.js'];
function build(uiDir, version) {
  let css = fs.readFileSync(path.join(uiDir, 'app.css'), 'utf8');
  // 国旗字体（Windows 不带国旗 emoji）：Twemoji Country Flags（CC-BY 4.0，来自 country-flag-emoji-polyfill），内嵌成 data URI
  try { css = css.replace('__FLAGS_WOFF2__', fs.readFileSync(path.join(uiDir, 'flags.woff2')).toString('base64')); } catch {}
  // 国家 → [默认语言, 时区…]（设备信息核对时区 / 语言用）
  let env = '{}'; try { const R = JSON.parse(fs.readFileSync(path.join(uiDir, 'region-environments.json'), 'utf8')); env = JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.locale, ...new Set([v.timezone, ...(v.zones || [])])]]))); } catch {}
  const billingCatalog = fs.readFileSync(path.join(uiDir, 'arena-trace', 'catalog.json'), 'utf8');
  JSON.parse(billingCatalog); // Fail the build rather than ship a silently empty price table.
  const js = ORDER.map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(uiDir, f), 'utf8').replace('/*__REGION_ENV__*/null', env).replace('/*__ARENA_AGENT_CATALOG__*/null', billingCatalog)).join('\n');
  // 内置的更新服务器地址（package.json 的 updateUrl；空 = 用户在设置里自己填）
  let upd = ''; try { upd = String(require(path.join(uiDir, '..', 'package.json')).updateUrl || ''); } catch {}
  if (!/^https:\/\/[\w.\-:]+(\/[\w.\-\/]*)?$/.test(upd)) upd = '';
  const out = `(() => {\n'use strict';\nconst CSS = ${JSON.stringify(css)};\n${js.replace(/__VERSION__/g, version).replace(/__UPD_URL__/g, upd)}\n})();\n`;
  const VM = require('vm'); new VM.Script(out, { filename: 'ui.bundle.js' });
  return out;
}
module.exports = { build };
