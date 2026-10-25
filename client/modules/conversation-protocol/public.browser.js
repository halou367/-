(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['conversation-protocol'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['conversation-protocol'] = Object.freeze({
    md: pick(() => (typeof MD !== 'undefined' ? MD : undefined), 'md', 'MD'),
    thinkingStatus: pick(() => (typeof ThinkingStatus !== 'undefined' ? ThinkingStatus : undefined), 'thinkingStatus', 'ThinkingStatus'),
    slashCommands: pick(() => (typeof SlashCommands !== 'undefined' ? SlashCommands : undefined), 'slashCommands', 'SlashCommands'),
    sendQueue: pick(() => (typeof SendQ !== 'undefined' ? SendQ : undefined), 'sendQueue', 'SendQ'),
    modeSwitcher: pick(() => (typeof ModeSwitcher !== 'undefined' ? ModeSwitcher : undefined), 'modeSwitcher', 'ModeSwitcher'),
    connectors: pick(() => (typeof Connectors !== 'undefined' ? Connectors : undefined), 'connectors', 'Connectors'),
    sessionGate: pick(() => (typeof SessionGate !== 'undefined' ? SessionGate : undefined), 'sessionGate', 'SessionGate'),
    capRoute: pick(() => (typeof CapRoute !== 'undefined' ? CapRoute : undefined), 'capRoute', 'CapRoute'),
    fileExport: pick(() => (typeof FileExport !== 'undefined' ? FileExport : undefined), 'fileExport', 'FileExport'),
    chatExport: pick(() => (typeof ChatExport !== 'undefined' ? ChatExport : undefined), 'chatExport', 'ChatExport'),
    fmt: pick(() => (typeof Fmt !== 'undefined' ? Fmt : undefined), 'fmt', 'Fmt'),
    evalCore: pick(() => (typeof EvalEngine !== 'undefined' ? EvalEngine : undefined), 'evalCore', 'EvalEngine'),
    evalView: pick(() => (typeof EvalView !== 'undefined' ? EvalView : undefined), 'evalView', 'EvalView'),
    htmlPreview: pick(() => (typeof HtmlPreview !== 'undefined' ? HtmlPreview : undefined), 'htmlPreview', 'HtmlPreview'),
    keep: pick(() => (typeof KeepAlive !== 'undefined' ? KeepAlive : undefined), 'keep', 'KeepAlive'),
    capture: pick(() => (typeof Cap !== 'undefined' ? Cap : undefined), 'capture', 'Cap'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
