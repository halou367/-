'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workspaceLists = require('../workspace-lists/public.cjs');

let cached = null;
function loadDomains() {
  if (cached) return cached;
  const storeMem = new Map();
  const ctx = vm.createContext({
    WorkspacePath: workspaceLists.workspacePath,
    FileLink: {
      looks: raw => workspaceLists.workspacePath.looks(raw),
      norm: raw => workspaceLists.workspacePath.norm(raw),
    },
    Store: {
      get: (k, d) => (storeMem.has(k) ? storeMem.get(k) : d),
      set: (k, v) => { storeMem.set(k, v); return true; },
    },
    Bus: { on() {}, emit() {} },
    UI: {},
    Models: { get: () => null },
    now: Date.now,
    crypto: globalThis.crypto,
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    RegExp,
    Error,
    Boolean,
    Promise,
    JSON,
    parseInt,
    isNaN,
    setTimeout,
    clearTimeout,
  });
  for (const [file, name] of [
    ['domain/md.js', 'MD'],
    ['domain/thinking-status.js', 'ThinkingStatus'],
    ['domain/slash-commands.js', 'SlashCommands'],
    ['domain/send-queue.js', 'SendQ'],
    ['domain/mode-switcher.js', 'ModeSwitcher'],
    ['domain/connectors.js', 'Connectors'],
    ['domain/session-gate.js', 'SessionGate'],
    ['domain/cap-route.js', 'CapRoute'],
    ['domain/file-export.js', 'FileExport'],
    ['domain/chat-export.js', 'ChatExport'],
  ]) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code + '\n;globalThis.__' + name + ' = ' + name + ';', ctx, { filename: path.basename(file) });
    ctx[name] = ctx['__' + name];
  }
  cached = Object.freeze({
    md: ctx.__MD,
    thinkingStatus: ctx.__ThinkingStatus,
    slashCommands: ctx.__SlashCommands,
    sendQueue: ctx.__SendQ,
    modeSwitcher: ctx.__ModeSwitcher,
    connectors: ctx.__Connectors,
    sessionGate: ctx.__SessionGate,
    capRoute: ctx.__CapRoute,
    fileExport: ctx.__FileExport,
    chatExport: ctx.__ChatExport,
  });
  return cached;
}

module.exports = Object.freeze({
  get md() { return loadDomains().md; },
  get thinkingStatus() { return loadDomains().thinkingStatus; },
  get slashCommands() { return loadDomains().slashCommands; },
  get sendQueue() { return loadDomains().sendQueue; },
  get modeSwitcher() { return loadDomains().modeSwitcher; },
  get connectors() { return loadDomains().connectors; },
  get sessionGate() { return loadDomains().sessionGate; },
  get capRoute() { return loadDomains().capRoute; },
  get fileExport() { return loadDomains().fileExport; },
  get chatExport() { return loadDomains().chatExport; },
});
