(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['environments'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['environments'] = Object.freeze({
    vless: pick(() => (typeof Vless !== 'undefined' ? Vless : undefined), 'vless', 'Vless'),
    routeState: pick(() => (typeof RouteState !== 'undefined' ? RouteState : undefined), 'routeState', 'RouteState'),
    routePolicy: pick(() => (typeof RoutePolicy !== 'undefined' ? RoutePolicy : undefined), 'routePolicy', 'RoutePolicy'),
    netPolicy: pick(() => (typeof NetPolicy !== 'undefined' ? NetPolicy : undefined), 'netPolicy', 'NetPolicy'),
    routeHost: pick(() => (typeof RouteHost !== 'undefined' ? RouteHost : undefined), 'routeHost', 'RouteHost'),
    authFlow: pick(() => (typeof AuthFlow !== 'undefined' ? AuthFlow : undefined), 'authFlow', 'AuthFlow'),
    authEnv: pick(() => (typeof AuthEnv !== 'undefined' ? AuthEnv : undefined), 'authEnv', 'AuthEnv'),
    mailToken: pick(() => (typeof MailToken !== 'undefined' ? MailToken : undefined), 'mailToken', 'MailToken'),
    envCheck: pick(() => (typeof EnvCheck !== 'undefined' ? EnvCheck : undefined), 'envCheck', 'EnvCheck'),
    envRefresh: pick(() => (typeof EnvRefresh !== 'undefined' ? EnvRefresh : undefined), 'envRefresh', 'EnvRefresh'),
    nodeSpeed: pick(() => (typeof NodeSpeed !== 'undefined' ? NodeSpeed : undefined), 'nodeSpeed', 'NodeSpeed'),
    deviceInfo: pick(() => (typeof DeviceInfo !== 'undefined' ? DeviceInfo : undefined), 'deviceInfo', 'DeviceInfo'),
    nodes: pick(() => (typeof Nodes !== 'undefined' ? Nodes : undefined), 'nodes', 'Nodes'),
    iprep: pick(() => (typeof IPRep !== 'undefined' ? IPRep : undefined), 'iprep', 'IPRep'),
    pool: pick(() => (typeof Pool !== 'undefined' ? Pool : undefined), 'pool', 'Pool'),
    nodeRoutes: pick(() => (typeof NodeRoutes !== 'undefined' ? NodeRoutes : undefined), 'nodeRoutes', 'NodeRoutes'),
    accounts: pick(() => (typeof BatchTokenReg !== 'undefined' ? BatchTokenReg : undefined), 'accounts', 'BatchTokenReg'),
    accountPicker: pick(() => (typeof AccountPicker !== 'undefined' ? AccountPicker : undefined), 'accountPicker', 'AccountPicker'),
    accountManagement: pick(() => (typeof AccountManagement !== 'undefined' ? AccountManagement : undefined), 'accountManagement', 'AccountManagement'),
    regionIp: pick(() => (typeof RegionIP !== 'undefined' ? RegionIP : undefined), 'regionIp', 'RegionIP'),
    autoRoute: pick(() => (typeof AutoRoute !== 'undefined' ? AutoRoute : undefined), 'autoRoute', 'AutoRoute'),
    mgr: pick(() => (typeof MgrWin !== 'undefined' ? MgrWin : undefined), 'mgr', 'MgrWin'),
    update: pick(() => (typeof Update !== 'undefined' ? Update : undefined), 'update', 'Update'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
