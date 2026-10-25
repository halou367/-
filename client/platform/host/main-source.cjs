'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const projectRoot = path.resolve(__dirname, '../..');
const DEFAULT_EXTERNAL_BIN = path.join(projectRoot, 'resources', 'bin');

// Ensure runtime-resources/node_modules and resources/node_modules are always in module search paths
const extraNodeModules = [
  path.join(projectRoot, 'runtime-resources', 'node_modules'),
  path.join(projectRoot, 'node_modules'),
  process.resourcesPath ? path.join(process.resourcesPath, 'node_modules') : '',
].filter(p => p && fs.existsSync(p));
if (extraNodeModules.length) {
  const cur = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
  for (const p of extraNodeModules) {
    if (!cur.includes(p)) cur.unshift(p);
  }
  process.env.NODE_PATH = cur.join(path.delimiter);
  Module._initPaths();
}

function resolveProjectFile(relPath) {
  return path.join(projectRoot, ...relPath.split('/'));
}

function preferUnpackedPath(absPath) {
  const unpacked = absPath.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
  if (unpacked !== absPath && fs.existsSync(unpacked)) return unpacked;
  return absPath;
}

const MAIN_SLICES = Object.freeze([
  'modules/environments/domain/main-host-account-proxy.js',
  'modules/browser-workspace/domain/main-windows-accounts-ipc.js',
  'modules/billing/domain/main-cost-proto-export-ipc.js',
  'modules/environments/domain/main-rate-limit-proto-pip.js',
  'modules/environments/domain/main-network-probes-updater.js',
  'modules/habit-engine/domain/main-shared-fingerprint-ipc.js',
  'modules/environments/domain/main-auth-routes-startup.js',
]);

const MAIN_PRELOAD_FILE = 'modules/browser-workspace/domain/main-window-preload.js';
const PACKAGED_SELF_TEST_FILE = 'modules/browser-workspace/domain/extension-packaged-self-test.js';

const MAIN_REQUIRE_MAP = Object.freeze({
  '../package.json': 'package.json',
  '../ui/auth-flow': 'modules/environments/domain/auth-flow.js',
  '../ui/habit-builtin-bank.js': 'modules/habit-engine/domain/habit-builtin-bank.js',
  '../ui/route-state': 'modules/environments/domain/route-state.js',
  '../ui/vless.js': 'modules/environments/domain/vless.js',
  './account-auth': 'modules/environments/domain/account-auth.js',
  './account-operations': 'modules/environments/domain/account-operations.js',
  './auth-route-guard': 'modules/environments/domain/auth-route-guard.js',
  './bookmarks-window': 'modules/browser-workspace/domain/bookmarks-window.js',
  './browser-bookmarks': 'modules/browser-workspace/domain/browser-bookmarks.js',
  './browser-extensions': 'modules/browser-workspace/domain/browser-extensions.js',
  './browser-navigation': 'modules/browser-workspace/domain/browser-navigation.js',
  './browser-privacy': 'modules/browser-workspace/domain/browser-privacy.js',
  './bundle': 'legacy/client/src/bundle.js',
  './extension-compat': 'modules/browser-workspace/domain/extension-compat.js',
  './extension-storage': 'modules/browser-workspace/domain/extension-storage.js',
  './extension-storage-native': 'modules/browser-workspace/domain/extension-storage-native.js',
  './extension-tabs': 'modules/browser-workspace/domain/extension-tabs.js',
  './extension-test-identity': 'platform/host/project-identity.cjs',
  './extensions-window': 'modules/browser-workspace/domain/extensions-window.js',
  './fingerprint-store': 'modules/habit-engine/domain/fingerprint-store.js',
  './gbrowser': 'modules/environments/domain/gbrowser.js',
  './pool-probe-runtime': 'modules/environments/domain/pool-probe-runtime.js',
  './proxy-dns': 'modules/environments/domain/proxy-dns.js',
  './route-access': 'modules/environments/domain/route-access.js',
  './route-drafts': 'modules/environments/domain/route-drafts.js',
  './route-native': 'modules/environments/domain/route-native.js',
  './runtime-log': 'modules/environments/domain/runtime-log.js',
  './runtime-navigation': 'modules/environments/domain/runtime-navigation.js',
  './session-persistence': 'modules/environments/domain/session-persistence.js',
  './site-logins': 'modules/browser-workspace/domain/site-logins.js',
  './subscription-ipc': 'modules/environments/domain/subscription-ipc.js',
  './website-route': 'modules/environments/domain/website-route.js',
  './workspace-preview': 'modules/workspace-lists/domain/workspace-preview-host.js',
});

function readMainSource() {
  return MAIN_SLICES.map(rel => fs.readFileSync(resolveProjectFile(rel), 'utf8')).join('\n');
}

function verifyMainSyntax() {
  const code = readMainSource();
  new vm.Script(code, { filename: 'src/main.js' });
  return Buffer.byteLength(code, 'utf8');
}

function compileMainModule(targetModule) {
  const legacyMainPath = resolveProjectFile('legacy/client/src/main.js');
  const preloadAbs = JSON.stringify(preferUnpackedPath(resolveProjectFile(MAIN_PRELOAD_FILE)));
  const assetsAbs = JSON.stringify(preferUnpackedPath(resolveProjectFile('modules/workspace-lists/ui/assets')));
  const webbarAbs = JSON.stringify(resolveProjectFile('modules/browser-workspace/ui/webbar.js'));
  const mgrAbs = JSON.stringify(resolveProjectFile('modules/environments/ui/mgr.html'));
  const runtimeBinAbs = JSON.stringify(resolveProjectFile('runtime-resources/bin'));
  const externalBinAbs = JSON.stringify(process.env.BRANA_BIN_DIR || DEFAULT_EXTERNAL_BIN);

  const code = readMainSource()
    .replace(/path\.join\(__dirname,\s*'preload\.js'\)/g, preloadAbs)
    .replace(/path\.join\(__dirname,\s*'\.\.',\s*'assets'/g, `path.join(${assetsAbs}`)
    .replace(/path\.join\(__dirname,\s*'\.\.',\s*'ui',\s*'webbar\.js'\)/g, webbarAbs)
    .replace(/path\.join\(__dirname,\s*'\.\.',\s*'ui',\s*'mgr\.html'\)/g, mgrAbs)
    .replace(
      /\[process\.resourcesPath && path\.join\(process\.resourcesPath, 'bin'\), path\.join\(__dirname, '\.\.', 'bin'\)\]/g,
      `[process.resourcesPath && path.join(process.resourcesPath, 'bin'), ${runtimeBinAbs}, ${externalBinAbs}, path.join(__dirname, '..', 'bin')]`
    )
    .replace(
      'for (const bf of bankFiles) {',
      'for (const bf of [bankFiles[0]]) {'
    )
    .replace(
      'function cleanOrphanFindProcesses() {\n  if (process.platform !== \'win32\' || !app.isPackaged) return;',
      'function cleanOrphanFindProcesses() {\n  if (process.platform !== \'win32\' || !app.isPackaged || EXTENSION_TEST.testBuild) return;'
    );

  targetModule.filename = legacyMainPath;
  targetModule.paths = [
    ...extraNodeModules,
    ...Module._nodeModulePaths(path.dirname(legacyMainPath)),
  ];
  const origRequire = targetModule.require.bind(targetModule);
  targetModule.require = function mappedMainRequire(specifier) {
    const mapped = MAIN_REQUIRE_MAP[specifier];
    if (mapped) {
      return origRequire(resolveProjectFile(mapped));
    }
    return origRequire(specifier);
  };
  return targetModule._compile(code, legacyMainPath);
}

module.exports = Object.freeze({
  MAIN_SLICES,
  MAIN_PRELOAD_FILE,
  PACKAGED_SELF_TEST_FILE,
  MAIN_REQUIRE_MAP,
  resolveProjectFile,
  readMainSource,
  verifyMainSyntax,
  compileMainModule,
});
