'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspacePath = require('./domain/workspace-path.js');
const workspacePreviewHost = require('./domain/workspace-preview-host.js');

let cachedUi = null;
function loadUiSlices() {
  if (cachedUi) return cachedUi;
  const storeMem = new Map();
  const ctx = vm.createContext({
    WorkspacePath: workspacePath,
    Store: {
      get: (k, d) => (storeMem.has(k) ? storeMem.get(k) : d),
      set: (k, v) => { storeMem.set(k, v); return true; },
    },
    Bus: { on() {}, emit() {} },
    Host: {},
    UI: {},
    Models: { all: {}, get: () => null },
    History: { items: [], byId: () => null, full: false },
    Notes: { all: {}, save() {}, rec() {} },
    Titles: { kick() {}, local() {}, capture() {}, tick: async () => {} },
    now: Date.now,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    BigInt,
    Blob: globalThis.Blob,
    AbortController: globalThis.AbortController,
    structuredClone: globalThis.structuredClone,
    btoa: globalThis.btoa || (s => Buffer.from(s, 'binary').toString('base64')),
    atob: globalThis.atob || (s => Buffer.from(s, 'base64').toString('binary')),
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Map,
    Set,
    RegExp,
    Error,
    Boolean,
    Promise,
    JSON,
    setTimeout,
    clearTimeout,
  });
  for (const [file, name] of [
    ['domain/title-compact.js', 'TitleCompact'],
    ['domain/title-flex.js', 'TitleFlex'],
    ['domain/conversation-labels.js', 'ConversationLabels'],
    ['domain/workspace-preview.js', 'WorkspacePreview'],
    ['domain/title-cipher.js', 'TitleCipher'],
    ['domain/title-sync.js', 'TitleSync'],
    ['domain/account-vendor-fold.js', 'AccountVendorFold'],
    ['domain/account-panel-size.js', 'AccountPanelSize'],
    ['domain/panel-work.js', 'PanelWork'],
    ['domain/render-work.js', 'RenderWork'],
  ]) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code + '\n;globalThis.__' + name + ' = ' + name + ';', ctx, { filename: path.basename(file) });
    ctx[name] = ctx['__' + name];
  }
  cachedUi = Object.freeze({
    titleCompact: ctx.__TitleCompact,
    titleFlex: ctx.__TitleFlex,
    conversationLabels: ctx.__ConversationLabels,
    workspacePreview: ctx.__WorkspacePreview,
    titleCipher: ctx.__TitleCipher,
    titleSync: ctx.__TitleSync,
    accountVendorFold: ctx.__AccountVendorFold,
    accountPanelSize: ctx.__AccountPanelSize,
    panelWork: ctx.__PanelWork,
    renderWork: ctx.__RenderWork,
  });
  return cachedUi;
}

module.exports = Object.freeze({
  workspacePath,
  get titleFlex() { return loadUiSlices().titleFlex; },
  get titleCompact() { return loadUiSlices().titleCompact; },
  workspacePreviewHost,
  get conversationLabels() { return loadUiSlices().conversationLabels; },
  get workspacePreview() { return loadUiSlices().workspacePreview; },
  get titleCipher() { return loadUiSlices().titleCipher; },
  get titleSync() { return loadUiSlices().titleSync; },
  get accountVendorFold() { return loadUiSlices().accountVendorFold; },
  get accountPanelSize() { return loadUiSlices().accountPanelSize; },
  get panelWork() { return loadUiSlices().panelWork; },
  get renderWork() { return loadUiSlices().renderWork; },
});
