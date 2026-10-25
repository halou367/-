'use strict';
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');

function resolveModuleFile(relPath) {
  return path.join(projectRoot, ...relPath.split('/'));
}

// Single-file slots in ORDER (90 slots)
const MIGRATED_SLOTS = Object.freeze({
  // model-identity (12 slots)
  'arena-trace/preimage.js': { moduleFile: 'modules/model-identity/domain/preimage.js' },
  'arena-trace/claude-standalone-v5.js': { moduleFile: 'modules/model-identity/domain/claude-standalone-v5.js' },
  'arena-trace/gpt-standalone-v1.js': { moduleFile: 'modules/model-identity/domain/gpt-standalone-v1.js' },
  'arena-trace/probe-context.js': {
    moduleFile: 'modules/model-identity/domain/probe-context.js',
  },
  'arena-trace/pricing.js': { moduleFile: 'modules/model-identity/domain/pricing.js' },
  'arena-trace/family.js': { moduleFile: 'modules/model-identity/domain/family.js' },
  'arena-trace/confidence.js': { moduleFile: 'modules/model-identity/domain/confidence.js' },
  'arena-trace/catalog-sync.js': { moduleFile: 'modules/model-identity/domain/catalog-sync.js', appendBrowserBridge: 'modules/model-identity/public.browser.js' },
  'cscore.js': { moduleFile: 'modules/model-identity/domain/cscore.js' },
  'trace.js': { moduleFile: 'modules/model-identity/domain/trace.js' },
  'gacha-prompts.js': { moduleFile: 'modules/model-identity/domain/gacha-prompts.js' },
  'gacha.js': { moduleFile: 'modules/model-identity/domain/gacha.js' },
  'gview.js': { moduleFile: 'modules/model-identity/domain/gview.js' },
  'gpop.js': { moduleFile: 'modules/model-identity/domain/gpop.js' },
  'slot.js': { moduleFile: 'modules/model-identity/domain/slot.js' },
  'astats.js': { moduleFile: 'modules/model-identity/domain/astats.js', appendBrowserBridge: 'modules/model-identity/public.browser.js' },

  // workspace-lists (17 slots)
  'workspace-path.js': { moduleFile: 'modules/workspace-lists/domain/workspace-path.js' },
  'title-compact.js': { moduleFile: 'modules/workspace-lists/domain/title-compact.js' },
  'title-flex.js': { moduleFile: 'modules/workspace-lists/domain/title-flex.js' },
  'title-cipher.js': { moduleFile: 'modules/workspace-lists/domain/title-cipher.js' },
  'workspace-preview.js': { moduleFile: 'modules/workspace-lists/domain/workspace-preview.js' },
  'conversation-labels.js': { moduleFile: 'modules/workspace-lists/domain/conversation-labels.js' },
  'panel-work.js': { moduleFile: 'modules/workspace-lists/domain/panel-work.js' },
  'render-work.js': { moduleFile: 'modules/workspace-lists/domain/render-work.js' },
  'sidebar-tools.js': { moduleFile: 'modules/workspace-lists/domain/sidebar-tools.js' },
  'dock.js': { moduleFile: 'modules/workspace-lists/domain/dock.js' },
  'titles.js': { moduleFile: 'modules/workspace-lists/domain/titles.js' },
  'title-sync.js': { moduleFile: 'modules/workspace-lists/domain/title-sync.js' },
  'account-panel-size.js': { moduleFile: 'modules/workspace-lists/domain/account-panel-size.js' },
  'account-vendor-fold.js': { moduleFile: 'modules/workspace-lists/domain/account-vendor-fold.js' },
  'plus.js': { moduleFile: 'modules/workspace-lists/domain/plus.js' },
  'palette.js': { moduleFile: 'modules/workspace-lists/domain/palette.js' },
  'mobile.js': { moduleFile: 'modules/workspace-lists/domain/mobile.js' },
  'bulk.js': { moduleFile: 'modules/workspace-lists/domain/bulk.js', appendBrowserBridge: 'modules/workspace-lists/public.browser.js' },

  // environments (25 slots)
  'vless.js': { moduleFile: 'modules/environments/domain/vless.js' },
  'route-state.js': { moduleFile: 'modules/environments/domain/route-state.js' },
  'route-policy.js': { moduleFile: 'modules/environments/domain/route-policy.js' },
  'route-host.js': { moduleFile: 'modules/environments/domain/route-host.js' },
  'net-policy.js': { moduleFile: 'modules/environments/domain/net-policy.js' },
  'auth-flow.js': { moduleFile: 'modules/environments/domain/auth-flow.js' },
  'auth-environment.js': { moduleFile: 'modules/environments/domain/auth-environment.js' },
  'mail-token.js': { moduleFile: 'modules/environments/domain/mail-token.js' },
  'device-info.js': { moduleFile: 'modules/environments/domain/device-info.js' },
  'accounts.js': { moduleFile: 'modules/environments/domain/accounts.js' },
  'account-picker.js': { moduleFile: 'modules/environments/domain/account-picker.js' },
  'account-management.js': { moduleFile: 'modules/environments/domain/account-management.js' },
  'nodes.js': { moduleFile: 'modules/environments/domain/nodes.js' },
  'iprep.js': { moduleFile: 'modules/environments/domain/iprep.js' },
  'pool.js': { moduleFile: 'modules/environments/domain/pool.js' },
  'node-speed.js': { moduleFile: 'modules/environments/domain/node-speed.js' },
  'node-routes.js': { moduleFile: 'modules/environments/domain/node-routes.js' },
  'region-ip.js': { moduleFile: 'modules/environments/domain/region-ip.js' },
  'env-refresh.js': { moduleFile: 'modules/environments/domain/env-refresh.js' },
  'env-check.js': { moduleFile: 'modules/environments/domain/env-check.js' },
  'auto-route.js': { moduleFile: 'modules/environments/domain/auto-route.js' },
  'mgr.js': { moduleFile: 'modules/environments/domain/mgr.js' },
  'update.js': { moduleFile: 'modules/environments/domain/update.js', appendBrowserBridge: 'modules/environments/public.browser.js' },

  // habit-engine (18 slots)
  'probe-vendor.js': { moduleFile: 'modules/habit-engine/domain/probe-vendor.js' },
  'probe-bank-cache.js': { moduleFile: 'modules/habit-engine/domain/probe-bank-cache.js' },
  'probe-bank-ikale.js': { moduleFile: 'modules/habit-engine/domain/probe-bank-ikale.js' },
  'fp-libs.js': { moduleFile: 'modules/habit-engine/domain/fp-libs.js' },
  'probe-output-guard.js': { moduleFile: 'modules/habit-engine/domain/probe-output-guard.js' },
  'personal-fingerprint-math.js': { moduleFile: 'modules/habit-engine/domain/personal-fingerprint-math.js' },
  'personal-fingerprint.js': { moduleFile: 'modules/habit-engine/domain/personal-fingerprint.js' },
  'shared-fingerprint-schema.js': { moduleFile: 'modules/habit-engine/domain/shared-fingerprint-schema.js' },
  'shared-fingerprint.js': { moduleFile: 'modules/habit-engine/domain/shared-fingerprint.js' },
  'fingerprint.js': { moduleFile: 'modules/habit-engine/domain/fingerprint.js' },
  'fingerprint-library-ui.js': { moduleFile: 'modules/habit-engine/domain/fingerprint-library-ui.js' },
  'fingerprint-batch.js': { moduleFile: 'modules/habit-engine/domain/fingerprint-batch.js' },
  'pelican-test.js': { moduleFile: 'modules/habit-engine/domain/pelican-test.js' },
  'fingerprint-review.js': { moduleFile: 'modules/habit-engine/domain/fingerprint-review.js' },
  'habit-builtin-bank.js': { moduleFile: 'modules/habit-engine/domain/habit-builtin-bank.js' },
  'probe-archive.js': { moduleFile: 'modules/habit-engine/domain/probe-archive.js' },
  'strength.js': { moduleFile: 'modules/habit-engine/domain/strength.js' },
  'revolver.js': { moduleFile: 'modules/habit-engine/domain/revolver.js', appendBrowserBridge: 'modules/habit-engine/public.browser.js' },

  // conversation-protocol (16 slots)
  'md.js': { moduleFile: 'modules/conversation-protocol/domain/md.js' },
  'cap-route.js': { moduleFile: 'modules/conversation-protocol/domain/cap-route.js' },
  'eval-core.js': { moduleFile: 'modules/conversation-protocol/domain/eval-core.js' },
  'fmt.js': { moduleFile: 'modules/conversation-protocol/domain/fmt.js' },
  'thinking-status.js': { moduleFile: 'modules/conversation-protocol/domain/thinking-status.js' },
  'slash-commands.js': { moduleFile: 'modules/conversation-protocol/domain/slash-commands.js' },
  'send-queue.js': { moduleFile: 'modules/conversation-protocol/domain/send-queue.js' },
  'mode-switcher.js': { moduleFile: 'modules/conversation-protocol/domain/mode-switcher.js' },
  'eval-view.js': { moduleFile: 'modules/conversation-protocol/domain/eval-view.js' },
  'html-preview.js': { moduleFile: 'modules/conversation-protocol/domain/html-preview.js' },
  'file-export.js': { moduleFile: 'modules/conversation-protocol/domain/file-export.js' },
  'chat-export.js': { moduleFile: 'modules/conversation-protocol/domain/chat-export.js' },
  'connectors.js': { moduleFile: 'modules/conversation-protocol/domain/connectors.js' },
  'keep.js': { moduleFile: 'modules/conversation-protocol/domain/keep.js' },
  'capture.js': { moduleFile: 'modules/conversation-protocol/domain/capture.js' },
  'session-gate.js': { moduleFile: 'modules/conversation-protocol/domain/session-gate.js', appendBrowserBridge: 'modules/conversation-protocol/public.browser.js' },

  // billing (2 single-file slots)
  'billing-probe.js': { moduleFile: 'modules/billing/domain/billing-probe.js' },
  'price.js': { moduleFile: 'modules/billing/domain/price.js', appendBrowserBridge: 'modules/billing/public.browser.js' },
});

// Composite ORDER slots decomposed into domain-aligned module slices (4 slots -> 19 slices)
const COMPOSITE_SLOTS = Object.freeze({
  'billing-probe-ui.js': {
    moduleSlices: [
      'modules/model-identity/domain/habit-model-prototypes.js',
      'modules/habit-engine/domain/habit-bank-calibration.js',
      'modules/habit-engine/domain/habit-feature-extractor.js',
      'modules/habit-engine/domain/chat-habit-analyzer.js',
      'modules/habit-engine/domain/chat-habit-fingerprint.js',
      'modules/billing/domain/billing-cost-probe.js',
      'modules/billing/domain/billing-probe-ui.js',
    ],
    appendBrowserBridges: [
      'modules/habit-engine/public.browser.js',
      'modules/billing/public.browser.js',
    ],
  },
  'core.js': {
    moduleSlices: [
      'modules/environments/domain/core-host-bridge.js',
      'modules/environments/domain/core-host-auth.js',
      'modules/conversation-protocol/domain/chat-protocol-cache.js',
      'modules/conversation-protocol/domain/chat-stream-state.js',
      'modules/conversation-protocol/domain/core-chat-protocol.js',
      'modules/conversation-protocol/domain/chat-session-lifecycle.js',
      'modules/workspace-lists/domain/core-history-archive.js',
    ],
  },
  'view.js': {
    moduleSlices: [
      'modules/workspace-lists/domain/view-primitives-tabs.js',
      'modules/conversation-protocol/domain/view-message-renderer.js',
      'modules/workspace-lists/domain/view-workspace-ui.js',
    ],
  },
  'boot.js': {
    moduleSlices: [
      'modules/browser-workspace/domain/boot-web-overlay.js',
      'modules/workspace-lists/domain/boot-app-init.js',
    ],
  },
});

function readCompositeRaw(relUiPath) {
  const spec = COMPOSITE_SLOTS[relUiPath];
  if (!spec) return null;
  return spec.moduleSlices.map(s => fs.readFileSync(resolveModuleFile(s), 'utf8')).join('\n');
}

function readSource(uiDir, relUiPath) {
  const normalized = String(relUiPath || '').replace(/\\/g, '/');
  if (Object.prototype.hasOwnProperty.call(COMPOSITE_SLOTS, normalized)) {
    const spec = COMPOSITE_SLOTS[normalized];
    let code = readCompositeRaw(normalized);
    if (Array.isArray(spec.appendBrowserBridges) && spec.appendBrowserBridges.length) {
      const bridges = spec.appendBrowserBridges.map(b => fs.readFileSync(resolveModuleFile(b), 'utf8')).join('\n');
      code += '\n' + bridges;
    }
    return code;
  }
  const spec = MIGRATED_SLOTS[normalized];
  if (!spec) {
    return fs.readFileSync(path.join(uiDir, normalized), 'utf8');
  }
  let code = fs.readFileSync(resolveModuleFile(spec.moduleFile), 'utf8');
  if (spec.appendBrowserBridge) {
    code += '\n' + fs.readFileSync(resolveModuleFile(spec.appendBrowserBridge), 'utf8');
  }
  return code;
}

function readModelCatalog(_uiDir) {
  return fs.readFileSync(resolveModuleFile('modules/model-identity/data/catalog.json'), 'utf8');
}

function readRegionEnvironments(_uiDir) {
  return JSON.parse(fs.readFileSync(resolveModuleFile('modules/browser-workspace/ui/region-environments.json'), 'utf8'));
}

function readAppCss(_uiDir) {
  return fs.readFileSync(resolveModuleFile('modules/workspace-lists/ui/app.css'), 'utf8');
}

function readFlagsFont(_uiDir) {
  return fs.readFileSync(resolveModuleFile('modules/environments/ui/flags.woff2'));
}

module.exports = Object.freeze({
  MIGRATED_SLOTS,
  COMPOSITE_SLOTS,
  readCompositeRaw,
  readSource,
  readModelCatalog,
  readRegionEnvironments,
  readAppCss,
  readFlagsFont,
});
