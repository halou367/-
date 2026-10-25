(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['model-identity'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['model-identity'] = Object.freeze({
    preimage: root.ArenaPreimage || prev.preimage || null,
    pricing: root.ArenaPricing || prev.pricing || null,
    family: root.ArenaFamily || prev.family || null,
    confidence: root.ArenaConfidence || prev.confidence || null,
    catalogSync: root.ArenaCatalogSync || prev.catalogSync || null,
    cscore: pick(() => (typeof CS !== 'undefined' ? CS : undefined), 'cscore', 'ClaudeStrength'),
    astats: pick(() => (typeof AcctStats !== 'undefined' ? AcctStats : undefined), 'astats', 'AcctStats'),
    trace: pick(() => (typeof Trace !== 'undefined' ? Trace : undefined), 'trace', 'Trace'),
    gachaPrompts: pick(() => (typeof GachaPrompts !== 'undefined' ? GachaPrompts : undefined), 'gachaPrompts', 'GachaPrompts'),
    gacha: pick(() => (typeof Gacha !== 'undefined' ? Gacha : undefined), 'gacha', 'Gacha'),
    gview: pick(() => (typeof GView !== 'undefined' ? GView : undefined), 'gview', 'GView'),
    gpop: pick(() => (typeof GP_HTML !== 'undefined' ? GP_HTML : undefined), 'gpop', 'GP_HTML'),
    slot: pick(() => (typeof GSlot !== 'undefined' ? GSlot : undefined), 'slot', 'GSlot'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
