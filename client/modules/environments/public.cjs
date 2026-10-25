'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const runtimeDeps = path.resolve(__dirname, '../../runtime-resources/node_modules');
if (!(process.env.NODE_PATH || '').split(path.delimiter).includes(runtimeDeps)) {
  process.env.NODE_PATH = [runtimeDeps, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

const vless = require('./domain/vless.js');
const routeState = require('./domain/route-state.js');
const routePolicy = require('./domain/route-policy.js');
const netPolicy = require('./domain/net-policy.js');
const routeHost = require('./domain/route-host.js');
const authFlow = require('./domain/auth-flow.js');
const mailToken = require('./domain/mail-token.js');
const envRefresh = require('./domain/env-refresh.js');
const nodeSpeed = require('./domain/node-speed.js');
const nodeRoutes = require('./domain/node-routes.js');

const routeAccess = require('./domain/route-access.js');
const authRouteGuard = require('./domain/auth-route-guard.js');
const routeDrafts = require('./domain/route-drafts.js');
const subscriptionFetch = require('./domain/subscription-fetch.js');
const subscriptionIpc = require('./domain/subscription-ipc.js');
const poolProbeRuntime = require('./domain/pool-probe-runtime.js');
const proxyDns = require('./domain/proxy-dns.js');
const routeNative = require('./domain/route-native.js');
const runtimeNavigation = require('./domain/runtime-navigation.js');
const websiteRoute = require('./domain/website-route.js');
const accountOperations = require('./domain/account-operations.js');
const sessionPersistence = require('./domain/session-persistence.js');
const accountAuth = require('./domain/account-auth.js');
const gbrowser = require('./domain/gbrowser.js');
const runtimeLog = require('./domain/runtime-log.js');

const browserWorkspace = require('../browser-workspace/public.cjs');

let cachedUi = null;
function loadUiSlices() {
  if (cachedUi) return cachedUi;
  const storeMem = new Map();
  const ctx = vm.createContext({
    __BRANA_OFFLINE__: true,
    Vless: vless,
    RouteState: routeState,
    RoutePolicy: routePolicy,
    NetPolicy: netPolicy,
    RouteHost: routeHost,
    AuthFlow: authFlow,
    MailToken: mailToken,
    EnvRefresh: envRefresh,
    NodeSpeed: nodeSpeed,
    NodeRoutes: nodeRoutes,
    __REGION_ENVIRONMENTS__: browserWorkspace.readRegionEnvironments(),
    Host: {},
    UI: {},
    Store: {
      get: (k, d) => (storeMem.has(k) ? storeMem.get(k) : d),
      set: (k, v) => { storeMem.set(k, v); return true; },
      del: k => { storeMem.delete(k); },
    },
    Bus: { on() {}, emit() {} },
    AutoRoute: {},
    ccF: cc => String(cc || ''),
    flagOf: cc => String(cc || ''),
    now: Date.now,
    Intl,
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
    URL,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  for (const [file, name] of [
    ['domain/auth-environment.js', 'AuthEnv'],
    ['domain/env-check.js', 'EnvCheck'],
    ['domain/device-info.js', 'DeviceInfo'],
    ['domain/nodes.js', 'Nodes'],
    ['domain/iprep.js', 'IPRep'],
    ['domain/pool.js', 'Pool'],
    ['domain/offline-modes.js', 'OfflineModes'],
  ]) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code + '\n;globalThis.__' + name + ' = ' + name + ';', ctx, { filename: path.basename(file) });
    ctx[name] = ctx['__' + name];
  }
  cachedUi = Object.freeze({
    authEnv: ctx.__AuthEnv,
    envCheck: ctx.__EnvCheck,
    deviceInfo: ctx.__DeviceInfo,
    nodes: ctx.__Nodes,
    iprep: ctx.__IPRep,
    pool: ctx.__Pool,
    offlineModes: ctx.__OfflineModes,
  });
  return cachedUi;
}

module.exports = Object.freeze({
  vless,
  routeState,
  routePolicy,
  netPolicy,
  routeHost,
  authFlow,
  mailToken,
  envRefresh,
  nodeSpeed,
  nodeRoutes,
  get authEnv() { return loadUiSlices().authEnv; },
  get envCheck() { return loadUiSlices().envCheck; },
  get deviceInfo() { return loadUiSlices().deviceInfo; },
  get nodes() { return loadUiSlices().nodes; },
  get iprep() { return loadUiSlices().iprep; },
  get pool() { return loadUiSlices().pool; },
  get offlineModes() { return loadUiSlices().offlineModes; },
  routeAccess,
  authRouteGuard,
  routeDrafts,
  subscriptionFetch,
  subscriptionIpc,
  poolProbeRuntime,
  proxyDns,
  routeNative,
  runtimeNavigation,
  websiteRoute,
  accountOperations,
  sessionPersistence,
  accountAuth,
  gbrowser,
  runtimeLog,
});
