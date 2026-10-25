'use strict';
const fs = require('node:fs');
const path = require('node:path');
const baseline = require('../../migration/baseline-manifest.json');
const TITLE = 'Brana AI v1.0 · 开发预览';
const APP_NAME = 'Brana AI v1.0 Preview';
const APP_ID = 'ai.brana.desktop.v1.preview';
const configured = new WeakMap();

function canonicalFuture(value) {
  let current = path.resolve(value);
  const parts = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    parts.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(fs.existsSync(current) ? fs.realpathSync(current) : current, ...parts);
}
function within(value, parent) {
  const normalize = s => process.platform === 'win32' ? s.toLowerCase() : s;
  const a = normalize(value), b = normalize(parent);
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
}
function chooseDataRoot({ appData, override }) {
  const candidate = canonicalFuture(override || path.join(appData, APP_NAME));
  const forbidden = [
    path.join(appData, 'Arena Client'),
    path.join(appData, 'Brana AI'),
    path.join(appData, 'Arena Ai'),
    path.join(appData, 'Brana AI Extension Test'),
    ...(baseline.protectedDataRoots || []),
  ];
  for (const item of forbidden) {
    const reserved = canonicalFuture(item);
    if (within(candidate, reserved) || within(reserved, candidate)) {
      throw new Error('Brana v1.0 preview must not reuse or contain a legacy/production data directory.');
    }
  }
  return candidate;
}
function configure(app) {
  if (configured.has(app)) return configured.get(app);
  if (process.env.BRANA_EXTENSION_TEST_DATA || process.env.BRANA_EXTENSION_PACKAGED_SELF_TEST === '1') {
    throw new Error('Legacy test profile overrides are not accepted by Brana v1.0. Use a separate BRANA_V1_DATA_DIR.');
  }
  const root = chooseDataRoot({ appData: app.getPath('appData'), override: process.env.BRANA_V1_DATA_DIR });
  fs.mkdirSync(path.join(root, 's'), { recursive: true });
  app.setName(APP_NAME);
  app.setAppUserModelId?.(APP_ID);
  app.setPath('userData', root);
  app.setPath('sessionData', path.join(root, 's'));
  // true keeps the retained application's production updater/data migration off.
  const identity = Object.freeze({ title: TITLE, dataRoot: root, testBuild: false });
  configured.set(app, identity);
  return identity;
}
module.exports = { configure, chooseDataRoot, canonicalFuture, TITLE };
