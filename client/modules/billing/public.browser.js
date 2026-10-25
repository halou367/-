(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['billing'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['billing'] = Object.freeze({
    billingProbe: pick(() => (typeof BillingProbeCore !== 'undefined' ? BillingProbeCore : undefined), 'billingProbe', 'BillingProbeCore'),
    billingProbeUi: pick(() => (typeof BillingProbe !== 'undefined' ? BillingProbe : undefined), 'billingProbeUi', 'BillingProbe'),
    price: pick(() => (typeof Price !== 'undefined' ? Price : undefined), 'price', 'Price'),
    liveEst: pick(() => (typeof LiveEst !== 'undefined' ? LiveEst : undefined), 'liveEst', 'LiveEst'),
    budget: pick(() => (typeof Budget !== 'undefined' ? Budget : undefined), 'budget', 'Budget'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
