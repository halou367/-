'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const billingProbe = require('./domain/billing-probe.js');

function loadPriceExports() {
  const code = fs.readFileSync(path.join(__dirname, 'domain/price.js'), 'utf8');
  const sandbox = {
    console,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    WeakMap,
    Promise,
    JSON,
    Intl,
    setTimeout,
    clearTimeout,
    Store: { get: (_k, d) => d, set() {}, del() {} },
    Bus: { on() {}, emit() {} },
    ICON: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__exports = { Price, LiveEst, Budget };', sandbox, {
    filename: 'modules/billing/domain/price.js',
  });
  return sandbox.__exports;
}

let cachedPrice = null;
function getPrice() {
  if (!cachedPrice) cachedPrice = loadPriceExports();
  return cachedPrice;
}

const billingCostProbePath = path.join(__dirname, 'domain/billing-cost-probe.js');
const billingProbeUiPath = path.join(__dirname, 'domain/billing-probe-ui.js');

module.exports = Object.freeze({
  billingProbe,
  get price() { return getPrice().Price; },
  get liveEst() { return getPrice().LiveEst; },
  get budget() { return getPrice().Budget; },
  billingProbeUiPath,
  readBillingProbeUiSource() {
    return [fs.readFileSync(billingCostProbePath, 'utf8'), fs.readFileSync(billingProbeUiPath, 'utf8')].join('\n');
  },
});
