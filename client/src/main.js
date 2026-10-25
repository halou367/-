// Brana AI desktop main process: isolated workspace windows, session partitions, and network routing
const { app, BrowserWindow, WebContentsView, webContents, session, ipcMain, shell, Menu, nativeTheme, safeStorage, nativeImage, clipboard, dialog, net: enet, powerSaveBlocker, screen } = require('electron');
const fs = require('fs');
if (!fs._branaBrotliHooked) {
  const _origReadFileSync = fs.readFileSync.bind(fs);
  const _zlib = require('zlib');
  fs.readFileSync = function branaReadFileSync(file, options) {
    const raw = _origReadFileSync(file, typeof options === 'object' && options ? { ...options, encoding: null } : undefined);
    const enc = typeof options === 'string' ? options : options?.encoding;
    if (Buffer.isBuffer(raw) && raw.length >= 6 && raw[0] === 0x2f && raw[1] === 0x2a && raw[2] === 0x42 && raw[3] === 0x52 && raw[4] === 0x2a && raw[5] === 0x2f) {
      const dec = _zlib.brotliDecompressSync(raw.subarray(6));
      return enc ? dec.toString(enc) : dec;
    }
    return enc && Buffer.isBuffer(raw) ? raw.toString(enc) : raw;
  };
  fs._branaBrotliHooked = true;
}
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
// This experimental build must never open the production Arena Client profile.
const EXTENSION_TEST = require('./extension-test-identity').configure(app);
const APP_TITLE = EXTENSION_TEST.title;
if (process.platform === 'win32' && app.isPackaged) {
  try {
    const exeDir = path.dirname(process.execPath);
    const mainInode = fs.statSync(process.execPath).ino;
    for (const rName of [
      'BranaAI-前台进程-界面渲染(聊天排版与模型识别).exe',
      'BranaAI-后台进程-静默渲染(后台抽卡与异步任务).exe',
      'BranaAI-后台进程-显卡加速(硬件合成与WebGL渲染).exe',
      'BranaAI-后台进程-网络服务(代理转发与TLS指纹通信).exe',
    ]) {
      const rp = path.join(exeDir, rName);
      try {
        if (!fs.existsSync(rp) || (mainInode && fs.statSync(rp).ino !== mainInode)) {
          try { fs.unlinkSync(rp); } catch {}
          fs.linkSync(process.execPath, rp);
        }
      } catch {}
    }
  } catch {}
}
// 所有 xray 子进程（隧道 + 检测）：更新 / 退出前全部结束。以前正在检测的 xray 在程序退出后还活着，占着安装目录里的 xray.exe，
// 安装程序卸载旧版失败就静默退出 —— 表现为「更新完成正在重启」后闪退，重开还是旧版
const KIDS = new Set();
const track = p => { KIDS.add(p); p.on('exit', () => KIDS.delete(p)); p.on('error', () => KIDS.delete(p)); return p; };
function killKids() {
  for (const p of [...KIDS]) { try { p.kill('SIGKILL'); } catch {} try { if (p && p.pid) process.kill(p.pid, 'SIGKILL'); } catch {} }
  KIDS.clear();
}
// 改名 Brana AI 后仍用原来的数据目录 “Arena Client”（账号 / 登录数据不丢，目录名不能改）；独立测试版使用独立数据目录
try { if (!EXTENSION_TEST.testBuild) { const d = app.getPath('userData'); if (['Brana AI', 'Arena Ai'].includes(path.basename(d))) app.setPath('userData', path.join(path.dirname(d), 'Arena Client')); } } catch {}
const ICON = (() => { try { const p = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'); return fs.existsSync(p) ? nativeImage.createFromPath(p) : undefined; } catch { return undefined; } })();
const { build } = require('./bundle');
const RouteNative = require('./route-native');
const WebsiteRoute = require('./website-route');
const RouteState = require('../ui/route-state');
const AuthFlow = require('../ui/auth-flow');
const RouteDrafts = require('./route-drafts');
const routeActor = (event, allowOffline = false) => require('./route-access').actor(event, { manager: MGR, offline: OFFLINE, allowOffline });
const authRouteGuard = require('./auth-route-guard').createAuthRouteGuard({
  find: id => acct(id), persist: () => saveDB(true), requireExit: true,
  busy: a => applyRoute.busy.has(a.id) || !!session.fromPartition(partOf(a.id)).__routeApplying,
});
const BrowserPrivacy = require('./browser-privacy');
const { loadURLAlive, createFailureOwner, safeNavigationURL, createRetryTarget } = require('./runtime-navigation');
const ProxyDNS=require('./proxy-dns');
BrowserPrivacy.chromiumSwitches(app);
const { fetchAccountResponse, refreshAccountStatus, createAccountRefresh, createAccountRemoval } = require('./account-operations');

const UI_URL = 'https://arena.ai/robots.txt';
const LOGIN_URL = 'https://arena.ai/';
const OFFLINE = path.join(__dirname, '..', 'ui', 'offline.html');
const MGR = path.join(__dirname, '..', 'ui', 'mgr.html');
const VERSION = require('../package.json').version;
let extensionTabs;
const extensionCompat = require('./extension-compat').createExtensionCompat({ipcMain,webContents,createTab:(id,properties)=>extensionTabs.create(id,properties),navigateTab:(wc,url)=>navigateBrowser(wc,url)});
const extensionStorage = require('./extension-storage').createSharedStorage({root:path.join(app.getPath('userData'),'extensions','shared','local-storage'),open:require('./extension-storage-native').createNativeStorage({WebContentsView,ipcMain})});
let storageClosing=false,storageClosed=false;
app.on('before-quit',event=>{if(storageClosed)return;event.preventDefault();if(storageClosing)return;storageClosing=true;void Promise.all([extensionStorage.close().catch(()=>runtimeLog('extension-storage-close-failed',{})),cookiePersistence.flushAll().catch(()=>{})]).finally(()=>{storageClosed=true;app.quit();});});
const extensionStore = require('./browser-extensions').createExtensions({ storage:extensionStorage, compat:extensionCompat, root:path.join(app.getPath('userData'),'extensions'), sessionFor:id=>session.fromPartition(partOf(id)) });
const runtimeLog = require('./runtime-log').createRuntimeLog(path.join(app.getPath('userData'), 'logs'), { version: VERSION, platform: process.platform, arch: process.arch, os: os.release() });
runtimeLog('start');
// 账号分区里的 Cookie 由 Chromium 延迟批量落盘，退出得快就会丢：Cookie 变化后和退出前把每个已打开的分区刷到磁盘（见 session-persistence.js）
const cookiePersistence = require('./session-persistence').createCookiePersistence({ log: runtimeLog });
const SiteLogins = require('./site-logins');
process.on('uncaughtExceptionMonitor', error => runtimeLog('main-exception', { kind: error?.name, code: error?.code }));
process.on('unhandledRejection', error => {
  if ((typeof quitting !== 'undefined' && quitting) || storageClosing) {
    if (/destroyed|disposed|closed|关闭/i.test(String(error?.message || ''))) return;
  }
  runtimeLog('main-unhandled-rejection', { kind: error?.name, code: error?.code });
  console.error('Unhandled rejection:', error);
});
process.on('uncaughtException', error => {
  runtimeLog('main-uncaught-exception', { kind: error?.name, code: error?.code });
  console.error('Uncaught exception:', error);
});
let _rendererLogBuf = '', _rendererLogTimer = 0;
function appendRendererLog(line) {
  if (!line || /was preloaded using link preload|Download the React DevTools|Third-party cookie will be blocked/i.test(line)) return;
  _rendererLogBuf += line.endsWith('\n') ? line : line + '\n';
  if (_rendererLogTimer) return;
  _rendererLogTimer = setTimeout(async () => {
    _rendererLogTimer = 0;
    const chunk = _rendererLogBuf;
    _rendererLogBuf = '';
    if (!chunk) return;
    try {
      const logDir = path.join(app.getPath('userData'), 'logs');
      const logFile = path.join(logDir, 'renderer.log');
      await fs.promises.mkdir(logDir, { recursive: true });
      const st = await fs.promises.stat(logFile).catch(() => null);
      if (st && st.size > 2 * 1024 * 1024) {
        await fs.promises.rm(logFile + '.1', { force: true }).catch(() => {});
        await fs.promises.rename(logFile, logFile + '.1').catch(() => {});
      }
      await fs.promises.appendFile(logFile, chunk, 'utf8');
    } catch {}
  }, 1500);
  _rendererLogTimer.unref?.();
}
app.on('child-process-gone', (_, details) => { runtimeLog('child-process-gone', { kind: details.type, reason: details.reason, exitCode: details.exitCode }); if (details?.type === 'Utility') { for (const [aid, w] of wins) { if (!w || w.isDestroyed?.()) continue; try { const ses = w.webContents?.session; if (ses) { ses.__routeReadySignature = ''; ses.__lastProxyRuleKey = ''; ses.__routeBlocked = true; } const a = acct(aid); if (a && !w.__hidden && !RouteState.locked(a)) void applyProxy(a, { force: true }).catch(() => {}); } catch {} } } });
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

if (process.argv.includes('--quit-for-update')) { app.quit(); process.exit(0); }
let hasSingleLock = app.requestSingleInstanceLock();
if (!hasSingleLock && process.argv.includes('--updated')) {
  const waitBuf = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 20 && !hasSingleLock; i++) {
    try { Atomics.wait(waitBuf, 0, 0, 250); } catch {}
    hasSingleLock = app.requestSingleInstanceLock();
  }
}
if (!hasSingleLock) { app.quit(); process.exit(0); }

let BUNDLE = '', _bundleReleaseTimer = 0;
const getBundle = () => {
  clearTimeout(_bundleReleaseTimer);
  if (!BUNDLE) BUNDLE = build(path.join(__dirname, '..', 'ui'), VERSION, { skipSyntaxCheck: true });
  _bundleReleaseTimer = setTimeout(() => { BUNDLE = ''; try { global.gc?.(); } catch {} }, 2500);
  return BUNDLE;
};
const loadBundle = () => {};

// ---------- 账号存储 ----------
const TOXIC_MAIN_IPS = new Set([
  '150.109.11.223', '31.57.27.38', '5.175.236.53', '126.78.133.130', '188.253.22.211',
  '207.65.189.9', '193.122.119.241', '139.28.169.72', '67.220.80.99', '104.238.191.179',
  '194.147.88.43', '132.243.30.210', '14.137.235.154', '162.4.173.74', '192.236.234.71',
  '213.176.18.108', '219.76.13.167', '176.10.125.114', '62.182.198.178', '82.118.20.234',
  '185.232.204.222', '78.129.155.37', '84.234.17.132', '159.203.18.237', '23.246.165.123',
  '198.20.138.119', '83.228.193.177', '43.170.8.95', '43.175.16.48', '38.65.9.251',
  '77.73.71.200',
]);
function healBannedAccountProxyIps() {
  if (!Array.isArray(DB?.accounts) || !DB.accounts.length) return false;
  const pool = DB.shared?.pippool;
  if (!pool || typeof pool !== 'object') return false;
  const ips = pool.ips || {}, ban = pool.ban || {}, rep = pool.rep || {};
  const isBadPip = k => {
    const raw = String(k || '').trim();
    if (!raw) return false;
    const host = raw.replace(/^\[|\]$/g, '').split(':')[0];
    if (TOXIC_MAIN_IPS.has(host) || ban[raw.toLowerCase()] || ban[host.toLowerCase()]) return true;
    const e = ips[raw] || ips[host];
    if (e && (e.banned || e.gone)) return true;
    const eg = String(e?.eg || host).trim();
    if (eg && TOXIC_MAIN_IPS.has(eg)) return true;
    const r = (eg && rep[eg]) || rep[host];
    if (r?.pu && Number.isFinite(+r.pu.fs) && +r.pu.fs >= 50) return true;
    return false;
  };
  const used = new Set(DB.accounts.map(a => String(a?.proxyIp || '').trim()).filter(Boolean));
  let changed = false;
  for (const a of DB.accounts) {
    if (!a || !a.proxyIp || RouteState.locked(a)) continue;
    if (!isBadPip(a.proxyIp)) continue;
    used.delete(String(a.proxyIp).trim());
    const cc = String(a.region || a.routeHome || '').trim().toUpperCase();
    const cands = Object.entries(ips).filter(([k, e]) => {
      if (!e || e.ok !== true || e.gone || e.banned || used.has(k) || isBadPip(k)) return false;
      if (cc && e.loc !== cc) return false;
      const eg = e.eg || k.replace(/^\[|\]$/g, '').split(':')[0];
      const fsVal = rep[eg]?.pu?.fs;
      return fsVal === undefined || +fsVal < 35;
    }).sort((x, y) => {
      const fsX = rep[x[1].eg || x[0]]?.pu?.fs ?? 28;
      const fsY = rep[y[1].eg || y[0]]?.pu?.fs ?? 28;
      return (fsX * 12 + (x[1].ms || 600)) - (fsY * 12 + (y[1].ms || 600));
    });
    const nextPip = cands[0]?.[0] || '';
    if (!nextPip) { used.add(String(a.proxyIp).trim()); continue; }
    a.proxyIp = nextPip;
    used.add(nextPip);
    if (a.route && typeof a.route === 'object' && a.route.mode === 'vless') a.route.proxyIp = nextPip;
    changed = true;
  }
  return changed;
}
const dataFile = () => path.join(app.getPath('userData'), 'accounts.json');
let DB = { accounts: [], open: [] };
const isRichDB = d => {
  if (!d || typeof d !== 'object' || !Array.isArray(d.accounts) || !d.accounts.length) return false;
  if (d.accounts.length > 1) return true;
  const a0 = d.accounts[0] || {};
  if (a0.email || a0.proxy || a0.nodeId || (Number(a0.status?.stats?.total) || 0) > 0) return true;
  if (Array.isArray(d.shared?.nodes) && d.shared.nodes.length > 0) return true;
  if (d.shared && Object.keys(d.shared).some(k => k.startsWith('hist@') && d.shared[k]?.items?.length > 0)) return true;
  return false;
};
const readBestBackupDB = file => {
  try {
    const dir = path.dirname(file), base = path.basename(file);
    const cands = fs.readdirSync(dir)
      .filter(n => n === base + '.bak' || n.startsWith(base + '.bak-'))
      .map(n => { const p = path.join(dir, n); try { const st = fs.statSync(p); return { p, size: st.size, mtime: st.mtimeMs }; } catch { return null; } })
      .filter(x => x && x.size > 64)
      .sort((a, b) => b.mtime - a.mtime || b.size - a.size);
    for (const c of cands) {
      try {
        const parsed = JSON.parse(fs.readFileSync(c.p, 'utf8').replace(/^\uFEFF/, ''));
        if (isRichDB(parsed)) return parsed;
      } catch {}
    }
  } catch {}
  return null;
};
const pippoolFile = () => path.join(path.dirname(dataFile()), 'shared', 'pippool.json');

function compactPipPool(pool) {
  if (!pool || typeof pool !== 'object') return pool;
  const out = { ...pool };
  const srcSet = new Set(Array.isArray(out.src) ? out.src : []);
  for (const a of (DB?.accounts || [])) {
    const pipFull = String(a?.proxyIp || '').trim();
    const pipHost = pipFull.split(':')[0].trim();
    if (pipFull) srcSet.add(pipFull);
    if (pipHost) srcSet.add(pipHost);
  }
  if (out.ips && typeof out.ips === 'object' && !Array.isArray(out.ips)) {
    const entries = Object.entries(out.ips);
    const nextIps = {};
    const okList = [];
    const untested = [];
    for (const [ip, info] of entries) {
      if (!ip || !info || typeof info !== 'object') continue;
      const slim = { ...info };
      delete slim.rawHeaders;
      delete slim.rawBody;
      const bareHost = String(ip).split(':')[0].trim();
      if (srcSet.has(ip) || srcSet.has(bareHost)) {
        nextIps[ip] = slim;
      } else if (slim.ok === true && !slim.gone && !slim.banned) {
        okList.push([ip, slim]);
      } else if (slim.ok == null && !slim.gone && !slim.banned) {
        untested.push([ip, slim]);
      }
    }
    okList.sort((a, b) => ((a[1]?.ms || 9999) - (b[1]?.ms || 9999)) || ((b[1]?.at || 0) - (a[1]?.at || 0)));
    for (let i = 0; i < Math.min(okList.length, 280); i++) {
      nextIps[okList[i][0]] = okList[i][1];
    }
    untested.sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
    for (let i = 0; i < Math.min(untested.length, 160); i++) {
      nextIps[untested[i][0]] = untested[i][1];
    }
    out.ips = nextIps;
  }
  if (Array.isArray(out.rep) && out.rep.length > 240) {
    out.rep = out.rep.slice(-240);
  } else if (out.rep && typeof out.rep === 'object' && !Array.isArray(out.rep)) {
    const keptHosts = new Set();
    for (const k of Object.keys(out.ips || {})) {
      keptHosts.add(k);
      keptHosts.add(String(k).split(':')[0].trim());
    }
    for (const s of srcSet) keptHosts.add(s);
    const nextRep = {};
    let repCnt = 0;
    for (const [rk, rv] of Object.entries(out.rep)) {
      if (keptHosts.has(rk) || keptHosts.has(String(rk).split(':')[0].trim())) {
        nextRep[rk] = rv;
        if (++repCnt >= 450) break;
      }
    }
    out.rep = nextRep;
  }
  return out;
}

let _savePipPoolTimer = null;
let _lastPipPoolPayload = '';
function savePipPoolSoon(delay = 3500) {
  clearTimeout(_savePipPoolTimer);
  _savePipPoolTimer = setTimeout(() => {
    try {
      const pf = pippoolFile();
      fs.mkdirSync(path.dirname(pf), { recursive: true });
      const compacted = compactPipPool(DB?.shared?.pippool || {});
      if (DB?.shared) DB.shared.pippool = compacted;
      const raw = JSON.stringify(compacted);
      if (raw === _lastPipPoolPayload) return;
      _lastPipPoolPayload = raw;
      const tmp = pf + '.tmp';
      fs.writeFile(tmp, raw, err => {
        if (!err) {
          try { fs.renameSync(tmp, pf); } catch {}
        }
      });
    } catch {}
  }, delay);
}


const pelshotsDiskFile = () => path.join(app.getPath('userData'), 'shared', 'pelshots.json');
let _pelshotsSaveT = null;
function loadPelshotsFromDisk() {
  try {
    const f = pelshotsDiskFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return null;
}
function savePelshotsSoon(obj) {
  if (_pelshotsSaveT) clearTimeout(_pelshotsSaveT);
  _pelshotsSaveT = setTimeout(async () => {
    _pelshotsSaveT = null;
    try {
      const f = pelshotsDiskFile();
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, JSON.stringify(obj || { rows: [], del: {}, pelican: {}, at: Date.now() }));
    } catch {}
  }, 1500);
}

function serializeSlimDB() {
  const slimShared = (DB?.shared && typeof DB.shared === 'object') ? { ...DB.shared } : {};
  delete slimShared.pippool;
  delete slimShared.habitLearnBank;
  delete slimShared.pelshots;
  return JSON.stringify({ ...DB, shared: slimShared });
}

function loadDB() {
  const file = dataFile();
  let loaded = false, recoveredFromBak = false;
  for (let attempt = 0; attempt < 4 && !loaded; attempt++) {
    try {
      const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      DB = { accounts: [], open: [], ...JSON.parse(raw) };
      loaded = true;
    } catch (err) {
      if (attempt < 3 && fs.existsSync(file)) {
        try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60); } catch {}
      } else {
        try {
          if (fs.existsSync(file) && fs.statSync(file).size > 64) {
            fs.copyFileSync(file, file + '.bak-' + Date.now());
          }
        } catch {}
      }
    }
  }
  if (!loaded || !isRichDB(DB)) {
    const bakDB = readBestBackupDB(file);
    if (bakDB) {
      DB = { accounts: [], open: [], ...bakDB };
      recoveredFromBak = true;
    }
  }
  if (!DB.accounts.length) DB.accounts.push({ id: newId(), name: '账号 1', proxy: '' });
  // 每个账号随机绑定一个指纹（旧账号第一次启动时补上），并自动修复被服务端去除了标点符号（. , - _ +）的邮箱
  let ch = recoveredFromBak;
  for (const a of DB.accounts) {
    if (!a.fp || !a.fp.seed) { a.fp = genFp(); ch = true; }
    const mtEmail = DB.shared?.['mailtok@' + a.id]?.email || DB.shared?.['regpw@' + a.id]?.email || '';
    const rich = AuthFlow.pickRichEmail(mtEmail || (AuthFlow.EMAIL.test(String(a.name || '').trim()) ? a.name : ''), a.email || '');
    if (rich && AuthFlow.EMAIL.test(rich) && rich !== a.email && (!a.email || AuthFlow.sameMailbox(rich, a.email))) {
      a.email = rich;
      ch = true;
    }
    if (a.email && a.status?.me && AuthFlow.sameMailbox(a.email, a.status.me)) {
      const richMe = AuthFlow.pickRichEmail(a.email, a.status.me);
      if (richMe !== a.status.me) {
        a.status.me = richMe;
        ch = true;
      }
    }
  }
  // 迁移旧版过期的 autoCostDpl 并解除误拉黑的在线 deployment (dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT -> dpl_BcGa9YULV843didEQWsFTd5taD4h)，若用户手动锁定了 pinDpl 则优先保留
  try {
    if (DB.shared && typeof DB.shared === 'object') {
      const prefs = DB.shared.prefs;
      const lockedDpl = (prefs && typeof prefs.pinDpl === 'string' && /^dpl_[A-Za-z0-9]{16,48}$/.test(prefs.pinDpl.trim()))
        ? prefs.pinDpl.trim()
        : '';
      const targetDpl = lockedDpl || 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      if (DB.shared.autoCostDpl && DB.shared.autoCostDpl !== targetDpl) {
        DB.shared.autoCostDpl = targetDpl;
        ch = true;
      }
      if (prefs && typeof prefs === 'object') {
        if (!prefs.autoCostDpl || prefs.autoCostDpl !== targetDpl) {
          prefs.autoCostDpl = targetDpl;
          ch = true;
        }
        if (Array.isArray(prefs.autoCostPool)) {
          const nextPool = [targetDpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', ...prefs.autoCostPool.filter(x => x && x !== targetDpl && x !== 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT' && x !== 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x')].slice(0, 12);
          if (JSON.stringify(nextPool) !== JSON.stringify(prefs.autoCostPool)) {
            prefs.autoCostPool = nextPool;
            ch = true;
          }
        }
        if (Array.isArray(prefs.expiredCostDpls)) {
          const unban = new Set([targetDpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', 'dpl_BcGa9YULV843didEQWsFTd5taD4h']);
          const nextExp = prefs.expiredCostDpls.filter(x => !unban.has(x));
          if (nextExp.length !== prefs.expiredCostDpls.length) {
            prefs.expiredCostDpls = nextExp;
            ch = true;
          }
        }
      }
      try {
        const curFile = dataFile();
        const roamingRoot = path.dirname(path.dirname(curFile));
        const sibFiles = [];
        const sibMtimeKey = sibFiles.map(sf => { try { return sf + ':' + Math.floor(fs.statSync(sf).mtimeMs); } catch { return ''; } }).filter(Boolean).join('|');
        const needForceSib = (DB.accounts || []).some(a => a?.id && ((Number(a.status?.stats?.total) || 0) === 0 || !DB.shared?.['hist@' + a.id]?.items?.length));
        let sibAccounts = [], sibShared = {};
        if (sibMtimeKey && (needForceSib || DB.shared._sibSyncKey !== sibMtimeKey)) {
          for (const sf of sibFiles) {
            try {
              const sd = JSON.parse(fs.readFileSync(sf, 'utf8'));
              if (Array.isArray(sd?.accounts)) sibAccounts.push(...sd.accounts);
              if (sd?.shared && typeof sd.shared === 'object') Object.assign(sibShared, sd.shared);
            } catch {}
          }
          DB.shared._sibSyncKey = sibMtimeKey;
          ch = true;
        }
        const canonEm = e => { const r = String(e || '').trim().toLowerCase(); const [l, d] = r.split('@'); return d ? l.replace(/\+.*$/, '').replace(/[.,\-_]/g, '') + '@' + d : r; };
        for (const a of (DB.accounts || [])) {
          if (!a?.id) continue;
          const curTotal = Number(a.status?.stats?.total) || 0;
          const aEm = canonEm(a.email || a.name);
          const sibAcct = sibAccounts.find(x => x && (x.id === a.id || (aEm && canonEm(x.email || x.name) === aEm)) && (Number(x.status?.stats?.total) || 0) > curTotal);
          if (sibAcct?.status?.stats) {
            if (curTotal === 0) {
              a.status = { ...(a.status || {}), stats: sibAcct.status.stats };
              ch = true;
            } else if (sibAcct.status.stats.vendors && a.status?.stats?.vendors) {
              const mv = JSON.parse(JSON.stringify(a.status.stats.vendors));
              let addedStat = 0;
              for (const [vk, vObj] of Object.entries(sibAcct.status.stats.vendors)) {
                if (!mv[vk]) mv[vk] = { name: vObj.name || vk, n: 0, models: {} };
                for (const [mk, mObj] of Object.entries(vObj?.models || {})) {
                  if (!mv[vk].models[mk]) mv[vk].models[mk] = { n: 0, turns: 0, known: 0, list: [] };
                  const dst = mv[vk].models[mk];
                  const seen = new Set((dst.list || []).map(r => r?.[0]));
                  for (const row of (mObj?.list || [])) {
                    if (Array.isArray(row) && row[0] && !seen.has(row[0])) {
                      dst.list.push(row);
                      seen.add(row[0]);
                      addedStat++;
                    }
                  }
                  dst.list.sort((x, y) => (y[1] || 0) - (x[1] || 0));
                  dst.n = dst.list.length;
                }
                mv[vk].n = Object.values(mv[vk].models).reduce((s, m) => s + (m.n || 0), 0);
              }
              if (addedStat > 0) {
                const newTotal = Object.values(mv).reduce((s, v) => s + (v.n || 0), 0);
                a.status.stats = { ...a.status.stats, total: newTotal, vendors: mv };
                ch = true;
              }
            }
          }
          const hk = 'hist@' + a.id;
          const sibHk = sibAcct ? 'hist@' + sibAcct.id : hk;
          if (!DB.shared[hk]?.items?.length && (sibShared[hk]?.items?.length || sibShared[sibHk]?.items?.length)) {
            DB.shared[hk] = sibShared[hk]?.items?.length ? sibShared[hk] : sibShared[sibHk];
            ch = true;
          }
          const vendors = a.status?.stats?.vendors;
          if (vendors && typeof vendors === 'object') {
            const existing = new Set((DB.shared[hk]?.items || []).map(x => x?.id).filter(Boolean));
            const items = Array.isArray(DB.shared[hk]?.items) ? [...DB.shared[hk].items] : [];
            let hAdded = 0;
            for (const vObj of Object.values(vendors)) {
              for (const [mName, mObj] of Object.entries(vObj?.models || {})) {
                for (const row of (mObj?.list || [])) {
                  if (!Array.isArray(row) || !row[0] || existing.has(row[0])) continue;
                  const [sid, atMs, , , , title] = row;
                  const ts = new Date(Number(atMs) > 0 ? Number(atMs) : Date.now()).toISOString();
                  items.push({ id: sid, type: 'agentic', title: String(title || mName || ('本地缓存对话 ' + String(sid).slice(0, 8))).trim(), createdAt: ts, updatedAt: ts });
                  existing.add(sid);
                  hAdded++;
                }
              }
            }
            if (hAdded > 0) {
              items.sort((x, y) => (Date.parse(y.updatedAt || y.createdAt || '') || 0) - (Date.parse(x.updatedAt || x.createdAt || '') || 0));
              DB.shared[hk] = { at: Date.now(), full: false, fullAt: 0, items };
              ch = true;
            }
          }
        }
      } catch {}
    }
    if (Array.isArray(DB.accounts)) {
      for (const a of DB.accounts) {
        if (!a || typeof a !== 'object') continue;
        const beforePw = a.pw;
        if (a.pw || DB.shared?.['regpw@' + a.id]?.pw || DB.shared?.['mailtok@' + a.id]?.pw) {
          resolveAccountPw(a);
          if (a.pw !== beforePw) ch = true;
        }
      }
      if (healBannedAccountProxyIps()) ch = true;
      if (DB.shared && typeof DB.shared === 'object' && DB.accounts.length > 0) {
        const validAcctIds = new Set(DB.accounts.map(a => a?.id).filter(Boolean));
        if (validAcctIds.size > 0) {
          for (const k of Object.keys(DB.shared)) {
            const m = /^(?:hist|draft|gacha|webreg|gtok|signup|mailtok|regpw|models)@([\w-]{1,64})$/.exec(k);
            if (m && !validAcctIds.has(m[1])) {
              delete DB.shared[k];
              ch = true;
            }
          }
        }
      }
    }
    if (DB.strs && typeof DB.strs === 'object') {
      if (DB.strs.S && typeof DB.strs.S === 'object') {
        for (const k of ['habitLearnBank:v1', 'habit:calibration:v1']) {
          if (k in DB.strs.S) { delete DB.strs.S[k]; ch = true; }
        }
      }
      if (DB.strs.clr && typeof DB.strs.clr === 'object') {
        for (const [k, v] of Object.entries(DB.strs.clr)) {
          if (typeof v !== 'number' || !Number.isFinite(v)) { delete DB.strs.clr[k]; ch = true; }
        }
      }
    }
  } catch {}
  // [Phase13-SlimDB] Separate pippool & habitLearnBank from accounts.json to eliminate 3.79MB rewrite storm
  try {
    DB.shared ||= {};
    const pf = pippoolFile();
    if (fs.existsSync(pf)) {
      try {
        const diskPool = JSON.parse(fs.readFileSync(pf, 'utf8').replace(/^\uFEFF/, ''));
        if (diskPool && typeof diskPool === 'object' && diskPool.ips) {
          const curOk = Object.values(DB.shared.pippool?.ips || {}).filter(x => x?.ok === true).length;
          const diskOk = Object.values(diskPool.ips || {}).filter(x => x?.ok === true).length;
          if (!DB.shared.pippool || diskOk >= curOk) DB.shared.pippool = diskPool;
        }
      } catch {}
    }
    if (DB.shared.pippool && typeof DB.shared.pippool === 'object') {
      DB.shared.pippool = compactPipPool(DB.shared.pippool);
      fs.mkdirSync(path.dirname(pf), { recursive: true });
      const rawPool = JSON.stringify(DB.shared.pippool);
      _lastPipPoolPayload = rawPool;
      fs.writeFileSync(pf, rawPool);
    }
    if (DB.shared.habitLearnBank !== undefined) {
      delete DB.shared.habitLearnBank;
      ch = true;
    }
    const pelF = pelshotsDiskFile();
    if (DB.shared.pelshots && typeof DB.shared.pelshots === "object") {
      try { fs.mkdirSync(path.dirname(pelF), { recursive: true }); fs.writeFileSync(pelF, JSON.stringify(DB.shared.pelshots)); } catch {}
      delete DB.shared.pelshots;
      ch = true;
    }
    const fStat = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (fStat > 250000) ch = true;
  } catch {}
  if (ch) saveDB(true);
}
function saveDB(strict = false) {
  const file = dataFile(), tmp = file + '.rename.tmp';
  if (!strict && fs.promises?.writeFile && fs.promises?.rename) {
    try {
      const payload = typeof serializeSlimDB === "function" ? serializeSlimDB() : JSON.stringify(DB);
      if (payload === saveDB._lastPayload) return;
      saveDB._lastPayload = payload;
      const rich = isRichDB(DB);
      const writeJob = async () => {
        const aTmp = file + '.async.tmp';
        try {
          await fs.promises.mkdir(path.dirname(file), { recursive: true });
          await fs.promises.writeFile(aTmp, payload);
          try { await fs.promises.rename(aTmp, file); }
          catch { await fs.promises.copyFile(aTmp, file); }
          const nowTs = Date.now();
          if (rich && nowTs - (saveDB._lastBakAt || 0) >= 15000) {
            saveDB._lastBakAt = nowTs;
            await fs.promises.copyFile(file, file + '.bak').catch(() => {});
          }
        } catch (e) { console.error(e); }
        finally { try { await fs.promises.unlink(aTmp).catch(() => {}); } catch {} }
      };
      saveDB._q = (saveDB._q || Promise.resolve()).then(writeJob, writeJob);
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const payload = typeof serializeSlimDB === "function" ? serializeSlimDB() : JSON.stringify(DB);
    if (!strict && payload === saveDB._lastPayload) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Always write to tmp first and atomically replace file so concurrent/interrupted reads never see a truncated accounts.json.
    fs.writeFileSync(tmp, payload);
    try {
      fs.renameSync(tmp, file);
    } catch (re) {
      if (strict) throw re;
      try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30); fs.renameSync(tmp, file); }
      catch { fs.copyFileSync(tmp, file); }
    }
    saveDB._lastPayload = payload;
    const nowTs = Date.now();
    if (isRichDB(DB) && (strict || nowTs - (saveDB._lastBakAt || 0) >= 15000)) {
      saveDB._lastBakAt = nowTs;
      try { fs.copyFileSync(file, file + '.bak'); } catch {}
    }
  } catch (e) { console.error(e); if (strict) throw e; }
  finally { try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {} }
}
const newId = () => crypto.randomBytes(5).toString('hex');
const acct = id => DB.accounts.find(a => a.id === id);
// 抽卡状态只在该账号窗口（含后台隐藏窗口）还开着时有效；程序重启后不再显示「抽卡中」
const winState = id => { const w = typeof wins !== 'undefined' && wins.get(id); return w && !w.isDestroyed() ? (w.__hidden ? 'hidden' : 'shown') : ''; };
const liveStatus = a => { const st = a.status || null; if (!st || !st.gacha || winState(a.id) || !st.gacha.busy) return st; return { ...st, gacha: { ...st.gacha, busy: false } }; };
const pub = a => a && { id: a.id, name: a.name, remark: a.remark || '', routeMode: RouteState.mode(a), nodeFailover: a.nodeFailover === true, authLocked: RouteState.locked(a), authExpires: a.routeAuth?.expires || 0, routeAuto: a.routeAuto !== false, routeHome: a.routeHome || '', routeAt: a.routeAt || 0, proxy: a.proxy || '', proxyIp: a.proxyIp || '', nodeId: a.nodeId || '', region: a.region || '', email: a.email || '', hasPw: !!a.pw, status: liveStatus(a), win: winState(a.id), fp: a.fp || null, tunErr: a.tunErr || '', xray: !!xrayBin(), sites: SiteLogins.publish(a.sites) };
// 精简版账号列表：统计里去掉每个型号的对话明细（list，最大的部分），选账号页 / 账号菜单 / 定时刷新用；账号管理窗口要明细时取完整版
const liteCache = new WeakMap();
const validStatModelKey = (mk, m) => {
  const s = String(mk || '').replace(/\?+$/, '').trim();
  if (!s || s === '未识别' || s === '开源模型' || !(m?.n > 0)) return false;
  if (/[\u3000-\u9fff\uff00-\uffef]/.test(s)) return false;
  if (/^(openai|gpt|chatgpt|anthropic|claude|google|gemini|xai|grok|moonshot|kimi|deepseek|qwen|zhipu|glm|xiaomi|mimo|bytedance|doubao|minimax|mistral|meta|llama|other)$/i.test(s)) return false;
  return true;
};
const liteStats = S => {
  if (!S || typeof S !== 'object' || !S.vendors) return S;
  let r = liteCache.get(S); if (r) return r;
  const V = {};
  for (const [k, v] of Object.entries(S.vendors)) {
    if (!k || k === 'other' || !(v?.n > 0)) continue;
    const models = {};
    let vn = 0;
    for (const [mk, m] of Object.entries(v?.models || {})) {
      if (!validStatModelKey(mk, m)) continue;
      const { list, ...rest } = m || {};
      models[mk] = rest;
      vn += (m.n || 0);
    }
    if (vn > 0 && Object.keys(models).length) V[k] = { ...v, n: vn, models };
  }
  r = { ...S, vendors: V, lite: true }; liteCache.set(S, r); return r;
};
const pubLite = a => { const o = pub(a); if (o?.status?.stats) o.status = { ...o.status, stats: liteStats(o.status.stats) }; return o; };
let saveT = 0; const saveSoon = (ms = 800) => { clearTimeout(saveT); saveT = setTimeout(saveDB, ms); };
// 浏览器模式里登录过的第三方网站（目前只有 GitHub）：只看该账号分区里的 Cookie 名字，不发请求、不读密码；结果存进账号记录，切换账号的卡片据此显示站点标记
const siteLogins = SiteLogins.createSiteLogins({ log: runtimeLog, read: id => acct(id)?.sites, write: (id, sites) => { const a = acct(id); if (!a) return; a.sites = sites; saveSoon(); } });
// 密码只存本机：优先用系统钥匙串加密（safeStorage），不可用时退回 base64；跨资料夹（正式版 / 测试版 / s 子目录）迁移后自动兜底解密并自愈重加密
let _siblingMasterKeys = null;
function getSiblingMasterKeys() {
  if (_siblingMasterKeys) return _siblingMasterKeys;
  _siblingMasterKeys = [];
  if (process.platform !== 'win32' || process.env.BRANA_PERF_FIXTURE === '1') return _siblingMasterKeys;
  try {
    const appData = app.getPath('appData');
    const userData = app.getPath('userData');
    const candidates = [
      path.join(userData, 'Local State'),
      path.join(userData, 's', 'Local State'),
      path.join(appData, 'Arena Client', 'Local State'),
      path.join(appData, 'Brana AI', 'Local State'),
      path.join(appData, 'Brana AI Extension Test', 'Local State'),
      path.join(appData, 'Brana AI Extension Test', 's', 'Local State'),
    ];
    const seenB64 = new Set();
    const toUnprotect = [];
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue;
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        const ek = j?.os_crypt?.encrypted_key;
        if (!ek || typeof ek !== 'string') continue;
        const raw = Buffer.from(ek, 'base64');
        if (raw.length <= 5 || raw.subarray(0, 5).toString('utf8') !== 'DPAPI') continue;
        const dpapiB64 = raw.subarray(5).toString('base64');
        if (seenB64.has(dpapiB64)) continue;
        seenB64.add(dpapiB64);
        toUnprotect.push(dpapiB64);
      } catch {}
    }
    if (toUnprotect.length) {
      const psCmd = `Add-Type -AssemblyName System.Security; @(${toUnprotect.map(b => `'${b}'`).join(',')}) | ForEach-Object { try { [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($_), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)) } catch { '' } }`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psCmd], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      const lines = String(r.stdout || '').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const mk = Buffer.from(line, 'base64');
          if (mk.length === 32) _siblingMasterKeys.push(mk);
        } catch {}
      }
    }
  } catch {}
  return _siblingMasterKeys;
}
function decSsWithKeys(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 31 || buf.subarray(0, 3).toString('utf8') !== 'v10') return '';
    const iv = buf.subarray(3, 15), tag = buf.subarray(buf.length - 16), ct = buf.subarray(15, buf.length - 16);
    for (const mk of getSiblingMasterKeys()) {
      try {
        const d = crypto.createDecipheriv('aes-256-gcm', mk, iv);
        d.setAuthTag(tag);
        const out = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
        if (out) return out;
      } catch {}
    }
  } catch {}
  return '';
}
function encPw(p) { if (!p) return ''; try { if (safeStorage.isEncryptionAvailable()) return 'ss:' + safeStorage.encryptString(p).toString('base64'); } catch {} return 'b64:' + Buffer.from(p, 'utf8').toString('base64'); }
function decPw(v) {
  if (!v || typeof v !== 'string') return '';
  if (v.startsWith('ss:')) {
    const b64 = v.slice(3);
    try {
      const out = safeStorage.decryptString(Buffer.from(b64, 'base64'));
      if (out) return out;
    } catch {}
    return decSsWithKeys(b64);
  }
  if (v.startsWith('b64:')) {
    try { return Buffer.from(v.slice(4), 'base64').toString('utf8'); } catch {}
  }
  return '';
}
function resolveAccountPw(a) {
  if (!a || typeof a !== 'object') return '';
  const plain = decPw(a.pw);
  if (plain) {
    if (a.pw && a.pw.startsWith('ss:')) {
      let nativeOk = false;
      try { nativeOk = Boolean(safeStorage.decryptString(Buffer.from(a.pw.slice(3), 'base64'))); } catch {}
      if (!nativeOk) {
        const healed = encPw(plain);
        if (healed && healed !== a.pw) { a.pw = healed; saveSoon(); }
      }
    }
    return plain;
  }
  const reg = DB.shared?.['regpw@' + a.id];
  const mt = DB.shared?.['mailtok@' + a.id];
  for (const cand of [reg, mt]) {
    if (!cand?.pw) continue;
    if (cand.email && a.email && !AuthFlow.sameMailbox(cand.email, a.email)) continue;
    const p = decPw(cand.pw);
    if (p) {
      if (!a.noAuto) { a.pw = encPw(p); saveSoon(); }
      return p;
    }
  }
  return '';
}
const byEmail = em => { const k = String(em || '').trim().toLowerCase(); return k ? DB.accounts.find(a => String(a.email || '').toLowerCase() === k || AuthFlow.sameMailbox(a.email, k)) : null; };

// 代理解析：支持 http://host:port、socks5://host:port、host:port、http://user:pass@host:port
function parseProxy(s) {
  s = String(s || '').trim(); if (!s) return null;
  if (!/^[a-z0-9]+:\/\//i.test(s)) s = 'http://' + s;
  let u; try { u = new URL(s); } catch { return null; }
  const scheme = u.protocol.replace(':', '').toLowerCase();
  const map = { http: 'http', https: 'https', socks: 'socks5', socks5: 'socks5', socks5h: 'socks5' };
  if (!map[scheme] || !u.hostname || !u.port) return null;
  return { rules: `${map[scheme]}://${u.hostname}:${u.port}`, user: decodeURIComponent(u.username || ''), pass: decodeURIComponent(u.password || '') };
}
const partOf = id => 'persist:acct-' + id;
// 代理：留空 = 默认本地代理 127.0.0.1:7890；direct = 直连；vless://… = 用内置 xray 内核连节点（可加 ProxyIP）
const DEFAULT_PROXY = 'http://127.0.0.1:7890';
const guestProxyChecks = new Map();
function guestProxyCheck(rule) { let key=''; try { const u=new URL(rule); key=u.hostname.toLowerCase()+':'+u.port; } catch {} if(key)guestProxyChecks.set(key,(guestProxyChecks.get(key)||0)+1); return () => { if(key){const n=(guestProxyChecks.get(key)||1)-1;if(n)guestProxyChecks.set(key,n);else guestProxyChecks.delete(key);} }; }

const proxyStr = a => { const s = String(a?.proxy || '').trim(); return s || DEFAULT_PROXY; };
const isDirect = s => /^(direct|直连|none|off)$/i.test(String(s || '').trim());
function validProxy(s) { s = String(s || '').trim(); return !s || isDirect(s) || !!parseProxy(s) || !!parseVless(s); }

// ---------- VLESS 节点：内置 xray 内核，每个账号一个本地 socks 入口 ----------
// 分享链接解析 / xray 配置和界面、安卓共用 ui/vless.js（支持 ech、xhttp extra、pcs、vcn、fm、mux 等 v2rayN 全部常用参数）
const Vless = require('../ui/vless.js');
const parseVless = s => Vless.parse(s);
function xrayBin() {
  const exe = process.platform === 'win32' ? 'xray.exe' : 'xray';
  for (const d of [process.resourcesPath && path.join(process.resourcesPath, 'bin'), path.join(__dirname, '..', 'bin')].filter(Boolean)) { const p = path.join(d, exe); try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}
const freePort = () => new Promise((res, rej) => { const sv = net.createServer(); sv.on('error', rej); sv.listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); }); });
async function waitPort(port, ms) { const end = Date.now() + ms; let step = 0; await new Promise(r => setTimeout(r, 12)); while (Date.now() < end) { const ok = await new Promise(r => { const c = net.connect(port, '127.0.0.1'); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); }); if (ok) return true; step++; await new Promise(r => setTimeout(r, step < 4 ? 22 : step < 10 ? 45 : 100)); } return false; }
const tunnels = new Map();
async function ensureTunnel(key, link, pip) {
  const v = parseVless(link); if (!v) throw new Error('VLESS 链接格式不正确');
  const ob = Vless.outbound(v, pip);
  const cap = String(key).startsWith('ip-test-') ? '' : (Vless.capSpec(DB.shared?.caproute) || '');   // 验证码专用线路（可选）：只改 Google / reCAPTCHA 域名的出口
  const sig = JSON.stringify(ob) + (cap ? '|cap:' + cap : ''), cur = tunnels.get(key);
  if (cur && cur.sig === sig && cur.starting) { cur.lastActiveAt = Date.now(); return cur.starting; }
  if (cur && cur.sig === sig && cur.proc.exitCode === null) { cur.lastActiveAt = Date.now(); return cur.port; }
  stopTunnel(key);
  const bin = xrayBin(); if (!bin) throw new Error(process.platform === 'win32' ? '没有找到内置 xray 内核（resources/bin/xray.exe），请用完整安装包重新安装' : '没有找到 xray 内核（把 xray 放到 bin/ 目录）');
  const t = { sig, port: 0, proc: { exitCode: 0 }, log: '', lastActiveAt: Date.now() }; tunnels.set(key, t);
  t.starting = (async () => {
    const port = await freePort(), dir = path.join(app.getPath('userData'), 'xray'); fs.mkdirSync(dir, { recursive: true });
    const cfg = path.join(dir, key.replace(/[^\w-]/g, '_') + '.json'); fs.writeFileSync(cfg, JSON.stringify(await ProxyDNS.protectConfig(Vless.withCap(Vless.config(ob, port, key.startsWith('ip-test-') ? 'info' : 'none'), cap))));
    const proc = track(spawn(bin, ['run', '-c', cfg], { cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GOMEMLIMIT: '14MiB', GOGC: '35' } }));
    t.proc = proc; t.port = port;
    const onLog = d => { t.log = (t.log + d).slice(-2000); }; proc.stdout.on('data', onLog); proc.stderr.on('data', onLog);
    proc.on('error', e => onLog('\n' + e.message)); proc.on('exit', () => { if (tunnels.get(key) === t && !t.starting) tunnels.delete(key); });
    const ok = await waitPort(port, 8000);
    if (!ok || proc.exitCode !== null) { const msg = t.log.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ').slice(0, 240); stopTunnel(key); throw new Error('xray 启动失败' + (msg ? '：' + msg : '')); }
    if (!String(key).startsWith('ip-test-')) { t.log = ''; try { proc.stdout.removeAllListeners('data'); proc.stderr.removeAllListeners('data'); } catch {} }
    return port;
  })();
  try { return await t.starting; } finally { t.starting = null; }
}
function stopTunnel(key) {
  const t = tunnels.get(key);
  if (t) { tunnels.delete(key); try { t.proc.kill?.('SIGKILL'); } catch {} try { if (t.proc?.pid) process.kill(t.proc.pid, 'SIGKILL'); } catch {} }
  if (/^(?:delay|probe|route-test|ip-test|mut-pip)-/.test(String(key || ''))) {
    try { const cfg = path.join(app.getPath('userData'), 'xray', String(key).replace(/[^\w-]/g, '_') + '.json'); fs.promises.unlink(cfg).catch(() => {}); } catch {}
  }
}
app.on('will-quit', () => { if (saveT) { clearTimeout(saveT); saveT = 0; try { saveDB(true); } catch {} } for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); });
// All web origins, including Google/reCAPTCHA, share the account's selected exit.
// Keep old IPC/settings callers compatible, but never probe the direct network or honor gDirect.
const G = { net: 0, at: 0, ms: 0 };
const gWanted=()=>false, gOn=()=>false, gBypass=()=>'';
const gProbe=()=>Promise.resolve();
const gReapply=async()=>{};
// 账号代理 → session.setProxy 参数；VLESS 连不上时指向一个不存在的端口（宁可断网也不漏真实 IP）
async function proxyConfig(a, key = a.id) {
  const s = proxyStr(a);
  if (isDirect(s)) { stopTunnel(key); a.tunErr = ''; return { mode: 'direct' }; }
  if (/^vless:/i.test(s)) {
    try { const port = await ensureTunnel(key, s, a.proxyIp); a.tunErr = ''; return { proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' }; }
    catch (e) { a.tunErr = String(e.message || e); return { proxyRules: 'socks5://127.0.0.1:9', proxyBypassRules: '<-loopback>' }; }
  }
  stopTunnel(key); a.tunErr = '';
  const p = parseProxy(s); return p ? { proxyRules: p.rules, proxyBypassRules: '<-loopback>' } : { proxyRules: 'socks5://127.0.0.1:9' };
}
async function applyProxy(a, {force=false,deferReload=false}={}) {
  const actual = acct(a.id); if (actual) RouteState.assertChange(actual, a);
  if(force&&RouteState.locked(actual))throw Error('账号正在认证，禁止强制重置线路');
  const ses = prepSession(a), routeSignature = RouteState.signature(a);
  const tunnel = tunnels.get(a.id), tunnelReady = !/^vless:/i.test(proxyStr(a)) || (tunnel && !tunnel.starting && tunnel.proc.exitCode === null);
  // Navigating a verification link or saving unchanged settings must not reset the auth session.
  const existingWin = wins.get(a.id);
  const existingView = existingWin && !existingWin.isDestroyed?.() ? existingWin.webContents : null;
  const privacyReady = (!existingView || (!!existingView.__uam && !existingView.__privacyFailed && existingView.debugger?.isAttached())) && (typeof extensionTabs==='undefined'||!extensionTabs||extensionTabs.ready(a.id));
  if (!force && !ses.__routeBlocked && !ses.__routeApplying && tunnelReady && privacyReady && ses.__routeReadySignature === routeSignature) return ses;
  if (RouteState.locked(actual) && actual.routeAuth.snapshot !== routeSignature) throw Error('认证环境已改变，已阻止代理重置');
  const wasBlocked = Boolean(ses.__routeBlocked);
  const epoch = ses.__routeEpoch = (ses.__routeEpoch || 0) + 1;
  ses.__routeApplying = (ses.__routeApplying || 0) + 1;
  ses.__routeBlocked=true;
  if(typeof GB!=='undefined')GB.cancel(a.id);
  const snapshot={...a,fp:{...a.fp}};
  const check=()=>{if(epoch!==ses.__routeEpoch)throw Error('代理配置已被后续切换取代');};
  const task=async()=>{
    try {
      check(); await ses.closeAllConnections?.();
      const config=await proxyConfig(snapshot);check();
      const proxyRuleKey=(config.proxyRules||'')+'|'+(config.proxyBypassRules||'');
      if(force||wasBlocked||ses.__lastProxyRuleKey!==proxyRuleKey){await ses.setProxy(config);ses.__lastProxyRuleKey=proxyRuleKey;check();}
      await ses.clearHostResolverCache?.();check();
      applyFp(snapshot);
      const curWin=wins.get(a.id);
      const wc=curWin&&!curWin.isDestroyed?.()?curWin.webContents:null;
      if (wc && (!wc.__uam || wc.__privacyFailed)) {
        // Recover only on a local blank page with networking still fenced. Never release a detached debugger.
        wc.__privacyReset?.();
        // The trusted local recovery page already has a frame; keep its IPC caller alive.
        let recoveryPage=false;try { recoveryPage=path.resolve(require('node:url').fileURLToPath(wc.getURL()))===path.resolve(OFFLINE); } catch {}
        if(!recoveryPage)await loadURLAlive(wc, 'about:blank');
        check(); await uaMeta(wc); check();
      }
      const changed=wc?.__privacyRefresh ? await wc.__privacyRefresh(snapshot) : false;check();
      if (wc && (wc.__privacyFailed || !wc.__uam || !wc.debugger.isAttached())) throw Error('隐私保护未就绪');
      const releaseExtensionTabs=typeof extensionTabs!=='undefined'&&extensionTabs?await extensionTabs.refresh(snapshot,{check}):null;check();
      a.tunErr=snapshot.tunErr||'';ses.__routeReadySignature=routeSignature;ses.__routeBlocked=false;
      releaseExtensionTabs?.();
      // Reload surviving same-process subframes too; their document-start language getters belong to the old page.
      if(wc){
        const curUrl = String(wc.getURL() || '');
        const isClientShell = Boolean(wc.__clientShell || /^https:\/\/arena\.ai\/robots\.txt\b/i.test(curUrl) || /^file:/i.test(curUrl));
        if (isClientShell) {
          wc.__privacyNeedsReload = false;
        } else {
          wc.__privacyNeedsReload = wc.__privacyNeedsReload || changed;
          if(!deferReload&&wc.__privacyNeedsReload&&/^https?:/.test(curUrl))setTimeout(()=>{if(!wc.isDestroyed()&&epoch===ses.__routeEpoch&&!ses.__routeBlocked){wc.__privacyNeedsReload=false;wc.reload();}},50);
        }
      }
      return ses;
    } catch(error) { if(epoch===ses.__routeEpoch)a.tunErr='代理/环境应用失败，网络已阻断：'+String(error.message||error);throw error; }
  };
  // Serialise native proxy/CDP writes. A superseded attempt may never release the network fence.
  const run=(ses.__routeTask||Promise.resolve()).catch(()=>{}).then(task).finally(()=>{ses.__routeApplying=Math.max(0,(ses.__routeApplying||1)-1);});ses.__routeTask=run;return run;
}

// ---------- 指纹：每个账号随机生成并绑定（屏幕 / CPU / 内存 / 显卡 / 语言 / 画布噪声种子），可编辑、可重新生成 ----------
const GPUS = [
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 (0x00002882) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER (0x000021C4) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti (0x00001C82) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)'],
];
const SCREENS = [[1920, 1080], [1920, 1080], [2560, 1440], [1366, 768], [1536, 864], [1440, 900], [1600, 900], [1680, 1050], [1920, 1200], [2560, 1600], [3840, 2160]];
const LANGS = ['zh-CN,zh;q=0.9,en;q=0.8', 'zh-CN,zh;q=0.9', 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7', 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7', 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'];
const pick = arr => arr[crypto.randomInt(arr.length)];
function genFp() { const [w, hh] = pick(SCREENS), [gv, gr] = pick(GPUS); return { seed: crypto.randomInt(1, 2 ** 31 - 1), screen: w + 'x' + hh, cores: pick([4, 6, 8, 8, 12, 16]), mem: pick([4, 8, 8, 8]), gpuVendor: gv, gpu: gr, lang: pick(LANGS), ua: '', at: Date.now() }; }
function cleanFp(f) {
  if (!f || typeof f !== 'object') return genFp();
  const m = /^(\d{3,5})\s*[x×*]\s*(\d{3,5})$/.exec(String(f.screen || '')), n = (v, a, b, d) => Number.isFinite(+v) && +v >= a && +v <= b ? Math.round(+v) : d;
  return { seed: n(f.seed, 1, 2 ** 31 - 1, crypto.randomInt(1, 2 ** 31 - 1)), screen: m ? m[1] + 'x' + m[2] : '1920x1080', cores: n(f.cores, 1, 64, 8), mem: [0.5, 1, 2, 4, 8].includes(+f.mem) ? +f.mem : 8, gpuVendor: String(f.gpuVendor || GPUS[0][0]).slice(0, 80), gpu: String(f.gpu || GPUS[0][1]).slice(0, 200), lang: String(f.lang || LANGS[0]).replace(/[^\w,;=.\- ]/g, '').slice(0, 120) || LANGS[0], timezone: BrowserPrivacy.canonical(f.timezone), ua: String(f.ua || '').replace(/[\r\n]/g, '').slice(0, 300), at: Date.now() };
}
const langList = l => String(l || '').split(',').map(x => x.split(';')[0].trim()).filter(Boolean);
function applyFp(a) {
  const ses = session.fromPartition(partOf(a.id)), f = a.fp || {}, p = BrowserPrivacy.profile(a);
  const uaTarget = f.ua || UA, langTarget = (p.languages.length ? p.languages : app.getPreferredSystemLanguages()).join(',');
  if (ses.__lastUa !== uaTarget || ses.__lastLang !== langTarget) {
    ses.setUserAgent(uaTarget, langTarget);
    ses.__lastUa = uaTarget;
    ses.__lastLang = langTarget;
  }
  googleHdr(ses);
}
// 官方 Google 登录：Google 会看 Sec-CH-UA 判断是不是内嵌浏览器（Electron 只报 Chromium）。
// 只对 Google 登录页补上和 UA 同版本的 Google Chrome 品牌，其它请求不动
function googleHdr(ses) {
  if (ses.__gh) return; ses.__gh = true;
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*', 'https://accounts.youtube.com/*', 'https://*.google.com/*', 'https://*.gstatic.com/*', 'https://*.recaptcha.net/*', 'https://arena.ai/*', 'https://*.arena.ai/*', 'https://challenges.cloudflare.com/*'] }, (d, cb) => {
    const hd = d.requestHeaders, v = ((ses.getUserAgent() || '').match(/Chrome\/(\d+)/) || [])[1] || process.versions.chrome.split('.')[0];
    const full = process.versions.chrome || (v + '.0.0.0');
    for (const k of Object.keys(hd)) {
      if (/^sec-ch-ua$/i.test(k)) delete hd[k];
      else if (/^sec-ch-ua-full-version-list$/i.test(k)) hd[k] = `"Chromium";v="${full}", "Google Chrome";v="${full}", "Not?A_Brand";v="99.0.0.0"`;
    }
    hd['sec-ch-ua'] = `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not?A_Brand";v="99"`;
    if (!Object.keys(hd).some(k => /^sec-ch-ua-mobile$/i.test(k))) hd['sec-ch-ua-mobile'] = '?0';
    for (const k of Object.keys(hd)) {
      if (/^referer$/i.test(k) && /^https:\/\/arena\.ai\/robots\.txt\b/i.test(String(hd[k] || ''))) {
        const mSid = /\/(?:api\/chat|ai-proxy\/realtime\/v\d+\/sessions)\/([0-9a-f-]{36})\b/i.exec(d.url || '');
        hd[k] = mSid ? ('https://arena.ai/c/' + mSid[1]) : /\/leaderboard\/agent\b/i.test(d.url || '') ? 'https://arena.ai/leaderboard/agent' : 'https://arena.ai/';
      }
    }
    cb({ requestHeaders: hd });
  });
}
// Apply native region locale/timezone plus all-origin WebRTC protection before opening remote content.
async function uaMeta(wc) {
  if(!wc||wc.isDestroyed())throw Error('账号窗口已关闭');
  const privacyAccount=winAcct(wc);if(!privacyAccount)throw Error('账号上下文已关闭，未初始化网页');
  if (wc.__uam) return wc.__privacyReady;
  wc.__privacyReset?.(); wc.__uam = true; wc.__privacyFailed = false;
  const dbg = wc.debugger, targets = new Map(), scripts = new Map(), queues = new Map();
  let active = true, reapplyTimer = 0;
  const fail = (reason, error) => {
    if (!active || wc.isDestroyed() || wc.__privacyFailed) return;
    wc.__privacyFailed = true; wc.session.__routeBlocked=true;wc.stop();
    void wc.session.closeAllConnections?.().catch(() => {});
    wc.__privacyFault?.(reason, error);
  };
  const send = (method, params = {}, sid) => {
    if (!active || wc.isDestroyed()) return Promise.reject(Error('Privacy session disposed'));
    let timer;
    return Promise.race([dbg.sendCommand(method, params, sid), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('隐私设置超时：' + method)), 12000);
    })]).finally(() => clearTimeout(timer));
  };
  const meta = () => {
    const ua = wc.getUserAgent() || UA, major = (ua.match(/Chrome\/(\d+)/) || [])[1] || process.versions.chrome.split('.')[0];
    return { userAgent: ua, acceptLanguage: (wc.__privacyProfile.languages.length ? wc.__privacyProfile.languages : app.getPreferredSystemLanguages()).join(','), userAgentMetadata: { brands: [{ brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }, { brand: 'Not?A_Brand', version: '99' }], fullVersionList: [{ brand: 'Chromium', version: process.versions.chrome }, { brand: 'Google Chrome', version: process.versions.chrome }, { brand: 'Not?A_Brand', version: '99.0.0.0' }], platform: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux', platformVersion: os.release(), architecture: process.arch === 'arm64' ? 'arm' : 'x86', model: '', mobile: false, bitness: '64', wow64: false } };
  };
  wc.__privacyProfile = BrowserPrivacy.profile(privacyAccount);
  const configure = (sid, worker = false) => {
    const run = (queues.get(sid) || Promise.resolve()).catch(() => {}).then(async () => {
      const prev = scripts.get(sid), identifier = await BrowserPrivacy.configure((m,p) => send(m,p,sid), wc.__privacyProfile, { worker, metadata: meta() });
      if (identifier) { scripts.set(sid, identifier); if (prev) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: prev }, sid); }
    });
    queues.set(sid, run);
    void run.finally(() => { if (queues.get(sid) === run) queues.delete(sid); }).catch(() => {});
    return run;
  };
  const gone = (id, t, error) => targets.get(id) !== t || /target closed|Session with given id not found|No target with given id|Inspected target navigated or closed|Execution context was destroyed|Cannot find context|Frame with the given id|隐私设置超时/i.test(String(error?.message || ''));
  wc.__privacyRefresh = async a => {
    await wc.__privacyReady;
    if (!active || wc.__privacyFailed || !dbg.isAttached()) throw Error('隐私保护中断，请重试恢复');
    const old = wc.__privacyProfile; wc.__privacyProfile = BrowserPrivacy.profile(a);
    await configure();
    await Promise.all([...targets].map(async ([id,t]) => {
      try { await configure(t.sid, /worker/.test(t.type)); }
      catch (error) { if (!gone(id,t,error)) { fail('target-refresh', error); throw error; } }
    }));
    if (wc.__privacyFailed) throw Error('隐私保护中断，请重试恢复');
    return old.locale !== wc.__privacyProfile.locale || old.timezone !== wc.__privacyProfile.timezone;
  };
  const message = (event, method, params) => {
    if (!active) return;
    if (method === 'Fetch.requestPaused') {
      void send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/plain; charset=utf-8' }],
        body: Buffer.from('User-agent: *\nAllow: /\n').toString('base64')
      }, params.sessionId).catch(() => {});
      return;
    }
    if (method === 'Target.detachedFromTarget') {
      for (const [id,t] of targets) if (t.sid === params.sessionId) { targets.delete(id); scripts.delete(t.sid); }
      // 同进程的跨域 iframe（reCAPTCHA 的 anchor / bframe）共用时区、语言覆盖；先建的那个关闭后覆盖会一起消失，给剩下的补一次
      clearTimeout(reapplyTimer); reapplyTimer = setTimeout(() => {
        if (!active || wc.isDestroyed() || wc.__privacyFailed) return;
        const profile = wc.__privacyProfile;
        void BrowserPrivacy.applyRegion((m, p) => send(m, p), profile).catch(() => {});
        for (const t of targets.values()) if (!/worker/.test(t.type)) void BrowserPrivacy.applyRegion((m, p) => send(m, p, t.sid), profile).catch(() => {});
      }, 120);
      return;
    }
    if (method !== 'Target.attachedToTarget') return;
    const sid = params.sessionId, type = params.targetInfo?.type, id = params.targetInfo?.targetId;
    if (targets.has(id)) return;
    const t = { sid, type }; targets.set(id, t);
    if (!['page','iframe','worker','shared_worker','service_worker'].includes(type)) { void send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {}); return; }
    void (async () => {
      try { await configure(sid, /worker/.test(type)); if (active && !wc.__privacyFailed) await send('Runtime.runIfWaitingForDebugger', {}, sid); }
      catch (error) {
        if (!active || wc.isDestroyed() || gone(id,t,error)) return;
        // Closing a CDP target can abort the parent navigation. Keep the window and fail closed instead.
        fail('target-configure', error);
      }
    })();
  };
  const detach = () => { fail('debugger-detached'); wc.__uam = false; dispose(false); };
  const dispose = (detachDebugger = true) => {
    active = false; clearTimeout(reapplyTimer); dbg.removeListener('message', message); dbg.removeListener('detach', detach); wc.removeListener('destroyed', destroyed);
    targets.clear(); scripts.clear(); queues.clear(); wc.__uam = false;
    if (detachDebugger && !wc.isDestroyed() && dbg.isAttached()) dbg.detach();
  };
  const destroyed = () => dispose(false);
  wc.__privacyReset = dispose;
  wc.once('destroyed', destroyed);
  dbg.on('message', message); dbg.on('detach', detach);
  wc.__privacyReady = (async () => {
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    if (!dbg.isAttached()) dbg.attach('1.3');
    await configure(); await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    if (wc.__privacyFailed) throw Error('隐私保护初始化中断');
  })().catch(error => { fail('privacy-init', error); wc.__uam = false; throw error; });
  return wc.__privacyReady;
}
// Google 登录等外部页面、网页注册页（Brana 官网、邮箱）：顶部浏览条（后退 / 前进 / 刷新 / 地址栏 / 返回客户端），源码在 ui/webbar.js
const WEBBAR = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'ui', 'webbar.js'), 'utf8'); } catch { return ''; } })();
const WEBBAR_PAD = process.platform === 'darwin' ? [78, 0] : [0, 150];   // 给窗口控制按钮 / 红绿灯让位
ipcMain.on('browser:chromeSync',event=>{
  const wc=event.sender,url=event.senderFrame?.url||'';
  event.returnValue=event.senderFrame===wc.mainFrame&&wc.__navigate&&winAcct(wc)&&/^(https:|chrome-extension:)/.test(url)&&!url.startsWith(UI_URL)
    ? 'window.__ancBarPad='+JSON.stringify(WEBBAR_PAD)+';window.__ancBarTheme='+JSON.stringify(barTheme())+';window.__ancEarlyFooter='+JSON.stringify(url.startsWith('https://arena.ai/')?{version:VERSION}:null)+';'+WEBBAR : '';
});
// Google 登录流程里的外部页面（accounts.google.com、auth.arena.ai 等）加载失败：0.7 / 1.5 / 3 秒后各重试一次，
// 还不行就回客户端登录页并说明原因（不跳「无法连接 arena.ai」的代理设置页）
const extAuth = u => /^https:\/\//.test(String(u || '')) && !/^https:\/\/arena\.ai(\/|$)/.test(String(u));
function extFail(w, url, code, desc) {
  const t = Date.now(); let r = w.__ext; if (!r || t - r.at > 60000) r = w.__ext = { n: 0, at: t };
  r.n++;
  if (r.n === 1) gProbe();   // 顺便重测本机能否直连 Google
  if (r.n <= 3) { setTimeout(() => { if (!w.isDestroyed()) w.webContents.loadURL(url).catch(() => {}); }, r.n === 1 ? 700 : r.n === 2 ? 1500 : 3000); return; }
  w.__ext = null;
  w.webContents.loadURL(UI_URL + '?gfail=' + encodeURIComponent(String(desc || 'ERR') + '（' + code + '）')).catch(() => {});
}
ipcMain.on('host:fpSync', e => { let a = null; try { a = winAcct(e.sender); } catch {} e.returnValue = a?.fp ? {...a.fp,lang:(BrowserPrivacy.profile(a).languages.length?BrowserPrivacy.profile(a).languages:langList(a.fp.lang)).join(',')} : null; });
ipcMain.handle('host:genFp', () => genFp());
function uniqueDownloadPath(rawName) {
  const dir = (() => { try { return app.getPath('downloads'); } catch { return os.tmpdir(); } })();
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const safe = path.basename(String(rawName || 'download').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim()) || 'download';
  const ext = path.extname(safe), stem = ext ? safe.slice(0, -ext.length) : safe;
  let cand = path.join(dir, safe);
  for (let i = 1; i < 1000 && fs.existsSync(cand); i++) cand = path.join(dir, `${stem} (${i})${ext}`);
  return cand;
}
ipcMain.handle('browser:download', async (e, o = {}) => {
  try {
    if (o && o.base64 != null) {
      const dest = uniqueDownloadPath(o.name || 'download');
      fs.writeFileSync(dest, Buffer.from(String(o.base64), 'base64'));
      return { ok: true, name: path.basename(dest), path: dest };
    }
    const url = String(o?.url || '').trim();
    if (url && /^(?:https?|blob|data):/i.test(url) && !e.sender.isDestroyed()) {
      if (o?.name) e.sender.__nextDownloadName = String(o.name);
      e.sender.downloadURL(url);
      return { ok: true, triggered: true };
    }
  } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  return { ok: false };
});
ipcMain.handle('browser:showFile', async (_e, p) => {
  try { if (p && typeof p === 'string' && fs.existsSync(p)) { shell.showItemInFolder(p); return { ok: true }; } } catch {}
  return { ok: false };
});
const TELEMETRY_BLOCK_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:i\.posthog\.com\/(?:e|batch|s|track)\b|ingest\.sentry\.io\/|sentry\.io\/api\/|cloudflareinsights\.com\/|google-analytics\.com\/|googletagmanager\.com\/|doubleclick\.net\/|clarity\.ms\/|hotjar\.com\/|browser-intake-datadoghq\.com\/)/i;
function prepSession(a) {
  const ses = session.fromPartition(partOf(a.id));
  if (ses.__prepared) return ses; ses.__prepared = true;
  cookiePersistence.watch(ses); siteLogins.watch(a.id, ses);
  applyFp(a);
  ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>cb({cancel:!!ses.__routeBlocked||TELEMETRY_BLOCK_RE.test(String(d?.url||''))}));
  ses.webRequest.onHeadersReceived((d,cb)=>{const rh=d.responseHeaders;if(!rh){cb({});return;}let headers=null;for(const key of Object.keys(rh))if(key.toLowerCase()==='x-dns-prefetch-control'){if(!headers)headers={...rh};delete headers[key];}if(!headers&&rh['X-DNS-Prefetch-Control']?.[0]==='off'){cb({responseHeaders:rh});return;}headers=headers||{...rh};headers['X-DNS-Prefetch-Control']=['off'];cb({responseHeaders:headers});});
  // reCAPTCHA 的 iframe 会申请 storage-access：拒绝会让 grecaptcha.execute 一直不返回（发不出新对话）
  const ALLOW = ['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'storage-access', 'top-level-storage-access', 'fullscreen'];
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOW.includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ALLOW.includes(perm) || perm === 'background-sync');
  if (typeof ses.on === 'function') {
    ses.on('will-download', (_ev, item, wc) => {
      try {
        const hint = wc?.__nextDownloadName || '';
        if (wc) wc.__nextDownloadName = '';
        const dest = uniqueDownloadPath(hint || item.getFilename() || 'download');
        if (!item.getSavePath()) item.setSavePath(dest);
        item.once('done', (_e, state) => {
          if (state === 'completed' && wc && !wc.isDestroyed()) {
            const payload = JSON.stringify({ name: path.basename(dest), path: dest, mime: item.getMimeType?.() || '' });
            wc.executeJavaScript(`window.__ancShowDownloadToast&&window.__ancShowDownloadToast(${payload})`).catch(() => {});
          }
        });
      } catch {}
    });
  }
  return ses;
}

// ---------- 圆角窗口 ----------
// Windows 11 和 macOS 的无边框窗口系统自带圆角；Windows 10 / Linux 没有，把窗口形状裁成圆角（最大化 / 全屏时恢复直角）
const WIN_BUILD = process.platform === 'win32' ? +(String(os.release()).split('.')[2] || 0) : 0;
const NEED_ROUND = process.platform === 'linux' || (process.platform === 'win32' && WIN_BUILD < 22000);
function roundShape(w, r = 10) {
  if (!NEED_ROUND || !w || w.isDestroyed()) return;
  try {
    if (w.isMaximized() || w.isFullScreen()) { w.setShape([]); return; }
    const [W, H] = w.getSize(); if (W < 3 * r || H < 3 * r) return;
    const rects = [];
    for (let y = 0; y < r; y++) {
      const dy = r - y - 0.5, inset = Math.round(r - Math.sqrt(r * r - dy * dy));
      rects.push({ x: inset, y, width: W - 2 * inset, height: 1 }, { x: inset, y: H - 1 - y, width: W - 2 * inset, height: 1 });
    }
    rects.push({ x: 0, y: r, width: W, height: H - 2 * r });
    w.setShape(rects);
  } catch {}
}
function keepRound(w, r) {
  if (!NEED_ROUND) return;
  let t = 0; const go = () => { clearTimeout(t); t = setTimeout(() => roundShape(w, r), 16); };
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'show', 'restore']) w.on(ev, go);
  go();
}

// ---------- 页面视口和窗口大小不一致的自愈 ----------
// 现象：更新后自动打开上次的账号窗口，窗口是 1320×880，页面却只铺满左上 1020×805，右边和下边是黑的（关掉账号重开才好）。
// 页面用 100vh / 100dvh 排版，所以是 Chromium 的视口没有跟上窗口大小（窗口 show 之前后窗口大小 / DPI 变化没传给页面）。
// 这里在显示后和窗口大小 / 显示器变化后，对比窗口内容区和页面真实视口，不一致就轻推一下窗口大小让 Chromium 重新同步；每次都记一条日志，方便定位真正触发条件。
function keepViewport(w) {
  let t = 0, busy = false, fixes = 0, off = null;
  const check = async why => {
    if (busy || w.isDestroyed() || w.isMinimized() || !w.isVisible()) return;
    busy = true;
    try {
      const wc = w.webContents; if (wc.isDestroyed() || wc.isLoading()) return;
      const [cw, ch] = w.getContentSize(), z = wc.getZoomFactor() || 1;
      const vp = await wc.executeJavaScript('[innerWidth,innerHeight]', true);
      if (!Array.isArray(vp) || w.isDestroyed()) return;
      const dw = Math.round(cw / z - vp[0]), dh = Math.round(ch / z - vp[1]);
      if (Math.abs(dw) <= 3 && Math.abs(dh) <= 3) { fixes = 0; return; }
      if (fixes >= 4) return;
      fixes++;
      let sf = 0; try { sf = screen.getDisplayMatching(w.getBounds()).scaleFactor; } catch {}
      runtimeLog('viewport-mismatch', { window: wc.id, why, content: [cw, ch], viewport: vp, zoom: z, scale: sf, max: w.isMaximized(), full: w.isFullScreen(), try: fixes });
      try { wc.invalidate(); } catch {}
      if (w.isFullScreen()) return;
      if (w.isMaximized()) { w.unmaximize(); w.maximize(); }
      else { const b = w.getBounds(); w.setBounds({ ...b, width: b.width + 1 }); w.setBounds(b); }
      setTimeout(() => void check('after-fix'), 700);
    } catch {} finally { busy = false; }
  };
  const soon = (why, ms = 500) => { clearTimeout(t); t = setTimeout(() => void check(why), ms); };
  for (const ev of ['show', 'restore', 'maximize', 'unmaximize', 'resize', 'move', 'focus', 'leave-full-screen']) w.on(ev, () => soon(ev));
  w.on('show', () => { for (const ms of [1200, 3000, 7000]) setTimeout(() => void check('show+' + ms), ms); });
  const dm = () => soon('display-metrics', 800); screen.on('display-metrics-changed', dm);
  w.once('closed', () => { clearTimeout(t); screen.removeListener('display-metrics-changed', dm); });
}

// ---------- 启动小窗：双击打开后立刻出现「加载中…」，界面准备好再切到主窗口 ----------
let splash = null;
let updRestoredOpen = null, updRestoredLast = '', updRestoredBounds = null, updJustCompleted = false;
const updStatePath = () => path.join(app.getPath('temp'), 'brana-ai-update', 'upd-state.json');
const updSessionPath = () => path.join(app.getPath('temp'), 'brana-ai-update', 'upd-session.json');
function captureAllWindowBounds() {
  try {
    if (typeof wins === 'undefined' || !wins) return;
    for (const w of wins.values()) {
      if (w && !w.isDestroyed() && typeof w.__syncBounds === 'function') w.__syncBounds(false);
    }
  } catch {}
}
function collectSavedWindowBounds() {
  captureAllWindowBounds();
  const out = {};
  try {
    for (const a of (DB?.accounts || [])) {
      if (a?.id && a?.winBounds && typeof a.winBounds === 'object') out[a.id] = a.winBounds;
    }
  } catch {}
  return out;
}
function writeUpdRestartState(patch) {
  if (!process.argv.includes('--updated') && !updJustCompleted) return false;
  try {
    const sf = updStatePath();
    if (!fs.existsSync(sf)) return false;
    const st = fs.statSync(sf);
    if (Date.now() - st.mtimeMs > 180000) return false;
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(sf, 'utf8')) || {}; } catch {}
    const next = { ...cur, ...patch };
    fs.writeFileSync(sf, JSON.stringify(next), 'utf8');
    return true;
  } catch { return false; }
}
const BRANA_SVG = '<svg width=\"160\" height=\"34\" viewBox=\"0 0 442 94\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M42.0341 39.5754C38.0998 39.5754 34.9132 42.8134 34.9132 46.811V91.9553H39.448V46.811C39.448 45.3539 40.6124 44.1708 42.0464 44.1708C43.4804 44.1708 44.6447 45.3539 44.6447 46.811V91.9553H49.1795V46.811C49.1795 42.8134 45.9929 39.5754 42.0586 39.5754H42.0341Z\" fill=\"currentColor\"/><path d=\"M79.7105 39.5754C75.7762 39.5754 72.5896 42.8134 72.5896 46.811V91.9553H77.1244V46.811C77.1244 45.3539 78.2888 44.1708 79.7228 44.1708C81.1567 44.1708 82.3211 45.3539 82.3211 46.811V91.9553H86.8559V46.811C86.8559 42.8134 83.6693 39.5754 79.735 39.5754H79.7105Z\" fill=\"currentColor\"/><path d=\"M60.8785 39.5754C56.9443 39.5754 53.7576 42.8134 53.7576 46.811V91.9553H58.2925V46.811C58.2925 45.3539 59.4568 44.1708 60.8908 44.1708C62.3248 44.1708 63.4891 45.3539 63.4891 46.811V91.9553H68.0239V46.811C68.0239 42.8134 64.8373 39.5754 60.903 39.5754H60.8785Z\" fill=\"currentColor\"/><path d=\"M105.036 20.81L108.174 15.2681H115.466L121.754 0H0L6.28747 15.2681H13.58L16.7053 20.81C10.6139 22.9271 5.60112 28.3071 5.60112 36.4144C5.60112 44.5217 11.3616 51.3836 19.99 51.3836C21.8775 51.3836 23.6301 50.9851 25.1867 50.2877V91.9699H29.7092V46.6139C31.131 44.6586 31.9644 42.2177 32.0257 39.453C32.0257 39.4157 32.0379 39.3659 32.0379 39.316C32.0379 39.2787 32.0257 39.2538 32.0257 39.2164C32.0257 39.1915 32.0379 39.1666 32.0379 39.1417C32.0379 39.1043 32.0257 39.067 32.0257 39.0172C31.9766 37.1491 31.4864 35.4056 30.6284 33.9236H91.1255C90.2675 35.4056 89.7773 37.1491 89.7282 39.0172C89.7282 39.067 89.716 39.1043 89.716 39.1417V39.316C89.716 39.316 89.7282 39.4157 89.7282 39.453C89.7895 42.2177 90.6229 44.6586 92.0447 46.6139V91.9699H96.5672V50.2877C98.1238 50.9851 99.8642 51.3836 101.764 51.3836C110.38 51.3836 116.153 44.2228 116.153 36.4144C116.153 28.6059 111.128 22.9271 105.036 20.81ZM9.30252 10.6603L6.80224 4.60784H114.952L112.451 10.6603H9.30252ZM102.953 15.2681L100.44 19.7141H21.3137L18.8011 15.2681H102.953ZM101.764 46.7758C97.3394 46.7758 94.2998 43.7371 94.2508 39.2662C94.2753 36.103 96.2853 33.9859 99.2023 33.9485H99.2881C101.114 33.9485 102.61 35.4803 102.61 37.0868V37.1616C102.573 38.0956 101.837 38.8179 100.918 38.8179C99.6681 38.8179 98.6508 39.8515 98.6508 41.1218C98.6508 42.3921 99.6681 43.4257 100.918 43.4257C104.35 43.4257 107.157 40.5988 107.157 37.0868C107.157 36.9748 107.132 36.8627 107.12 36.7631C106.936 32.6409 103.615 29.3532 99.2269 29.3532H60.8647L60.5705 29.3407H60.2641L22.527 29.3532C18.1393 29.3532 14.8178 32.6409 14.634 36.7631C14.6217 36.8627 14.5972 36.9748 14.5972 37.0868C14.5972 40.5988 17.4039 43.4257 20.8357 43.4257C22.0858 43.4257 23.1031 42.3921 23.1031 41.1218C23.1031 39.8515 22.0858 38.8179 20.8357 38.8179C19.9165 38.8179 19.1811 38.0956 19.1321 37.1616C19.1321 37.1367 19.1443 37.1118 19.1443 37.0868C19.1443 35.4803 20.6273 33.9485 22.4658 33.9485H22.5393C25.4686 33.9859 27.4786 36.103 27.5031 39.2662C27.4541 43.7371 24.4023 46.7758 19.99 46.7758C14.1805 46.7758 10.1359 42.006 10.1359 36.4144C10.1359 28.8675 15.9577 24.3094 23.1521 24.3094H98.6018C105.796 24.3094 111.618 28.8675 111.618 36.4144C111.618 42.006 107.573 46.7758 101.764 46.7758Z\" fill=\"currentColor\"/><path d=\"M5.587044534412955 4.097165991902827 17.381916329284753 5.214574898785415C17.506072874493928 17.754385964912274 17.506072874493928 30.170040485829958 17.506072874493928 42.585695006747635V47.800269905533064C17.506072874493928 60.960863697705804 17.506072874493928 73.99730094466936 17.381916329284753 86.78542510121457L5.587044534412955 87.90283400809716V92.0H43.82726045883941C74.61808367071525 92.0 83.68151147098516 78.96356275303644 83.68151147098516 66.67206477732793C83.68151147098516 54.0080971659919 74.8663967611336 45.19298245614035 53.387314439946024 43.08232118758434C72.13495276653171 39.854251012145745 78.46693657219973 31.287449392712546 78.46693657219973 21.72739541160594C78.46693657219973 9.063427800269906 69.52766531713901 0.0 46.931174089068826 0.0H5.587044534412955ZM34.88798920377868 46.06207827260459H41.84075573549258C58.10526315789474 46.06207827260459 65.67881241565452 52.766531713900136 65.67881241565452 66.92037786774628C65.67881241565452 80.32928475033738 57.2361673414305 87.53036437246963 43.08232118758435 87.53036437246963H35.26045883940621C34.88798920377868 74.49392712550608 34.88798920377868 61.08502024291498 34.88798920377868 46.06207827260459ZM35.26045883940621 4.5937921727395405H42.21322537112011C55.99460188933873 4.5937921727395405 61.45748987854251 11.049932523616732 61.45748987854251 22.099865047233465C61.45748987854251 34.63967611336032 54.50472334682861 41.84075573549258 40.72334682860999 41.84075573549258H34.88798920377868C34.88798920377868 29.052631578947363 34.88798920377868 16.76113360323886 35.26045883940621 4.5937921727395405Z\" transform=\"translate(124.4 0)\" fill=\"currentColor\"/><path d=\"M226.756 92.0345H198.418V87.6791C202.704 87.6791 204.729 87.6791 204.729 81.2668V43.2774C204.729 34.4455 204.609 33.9615 197.465 36.0183V31.6628L217.707 22.8309V37.3491C221.517 30.211 227.352 23.3148 233.781 23.3148C238.901 23.3148 242.711 26.7024 242.711 32.3887C242.711 37.2281 240.092 40.0108 236.163 40.0108C231.043 40.0108 230.09 34.8084 226.875 34.8084C224.494 34.8084 221.041 40.6157 217.707 47.3909V81.2668C217.707 87.6791 219.493 87.6791 226.756 87.6791V92.0345Z\" transform=\"translate(13.6 0)\" fill=\"currentColor\"/><path d=\"M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z\" transform=\"translate(-104.2 0)\" fill=\"currentColor\"/><path d=\"M326.059 92.0345H298.078V87.6791C302.364 87.6791 304.388 87.6791 304.388 81.2668V43.2774C304.388 34.4455 304.269 33.9615 297.125 36.0183V31.6628L317.367 22.8309V34.8084C322.01 28.7592 328.559 23.3148 336.775 23.3148C348.205 23.3148 354.635 30.6949 354.635 42.6725V81.2668C354.635 87.6791 356.659 87.6791 361.303 87.6791V92.0345H333.084V87.6791C339.632 87.6791 341.657 87.6791 341.657 81.2668V44.4873C341.657 36.8652 338.204 32.9936 332.012 32.9936C326.059 32.9936 321.177 36.7442 317.367 41.8256V81.2668C317.367 87.6791 319.153 87.6791 326.059 87.6791V92.0345Z\" transform=\"translate(20.7 0)\" fill=\"currentColor\"/><path d=\"M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z\" transform=\"translate(21.5 0)\" fill=\"currentColor\"/></svg>';
function showSplash() {
  if (splash || process.env.BRANA_NO_SPLASH) return;
  if (writeUpdRestartState({ step: 4, pct: 100, restartPct: 48, text: '正在载入新版内核并恢复原有的账号窗口…' })) {
    splash = { __updProxy: true, isDestroyed: () => false, destroy() {} };
    return;
  }
  const dark = DB.theme?.bg ? !!DB.theme.dark : nativeTheme.shouldUseDarkColors, bg = themeBg(), fg = dark ? '#ecebe7' : '#262522', mut = dark ? '#a9a59d' : '#7a746b';
  splash = new BrowserWindow({ width: 340, height: 170, frame: false, resizable: false, maximizable: false, minimizable: true, fullscreenable: false, center: true, show: false, backgroundColor: bg, title: 'Brana AI', icon: ICON, skipTaskbar: false,
    webPreferences: { sandbox: !process.env.BRANA_NO_SANDBOX, contextIsolation: true, javascript: true } });
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:${bg};color:${fg};font:13px/1.5 system-ui,"Microsoft YaHei","PingFang SC",sans-serif;-webkit-app-region:drag;user-select:none;overflow:hidden}
  .w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border:1px solid ${dark ? '#ffffff14' : '#0000001a'};box-sizing:border-box;border-radius:12px}
  .s{color:${mut};display:flex;align-items:center;gap:8px}.sp{width:12px;height:12px;border:2px solid ${mut};border-top-color:transparent;border-radius:50%;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
  .bar{width:180px;height:3px;border-radius:3px;background:${dark ? '#ffffff14' : '#0000000f'};overflow:hidden}.bar i{display:block;height:100%;width:40%;background:${mut};border-radius:3px;animation:b 1.2s ease-in-out infinite}@keyframes b{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
  .v{position:fixed;right:10px;bottom:6px;font-size:10px;color:${mut}}</style>
  <div class="w">${BRANA_SVG}<div class="s"><span class="sp"></span><span id="t">启动中…</span></div><div class="bar"><i></i></div></div><div class="v">v${VERSION}</div>
  <script>window.set=t=>{document.getElementById('t').textContent=t}</script>`;
  void splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(() => {});
  splash.once('ready-to-show', () => { if (splash && !splash.isDestroyed()) splash.show(); });
  keepRound(splash, 12);
  splash.on('closed', () => { splash = null; });
}
function splashText(t) {
  if (splash && splash.__updProxy) {
    writeUpdRestartState({ step: 4, pct: 100, restartPct: /初始化界面/.test(String(t || '')) ? 88 : 72, text: '正在重启载入：' + String(t || '') });
    return;
  }
  if (splash && !splash.isDestroyed()) splash.webContents.executeJavaScript('window.set&&set(' + JSON.stringify(t) + ')').catch(() => {});
}
function closeSplash() {
  const s = splash; splash = null;
  if (s && s.__updProxy) {
    writeUpdRestartState({ step: 5, pct: 100, restartPct: 100, uiReady: true, done: true, text: '更新完成，客户端已载入并刷新就绪！' });
    return;
  }
  if (s && !s.isDestroyed()) setTimeout(() => { try { s.destroy(); } catch {} }, 120);
}

// ---------- 窗口 ----------
const wins = new Map(); // accountId -> BrowserWindow
const extensionPopupOwners = new WeakMap(), extensionPopups = new WeakMap(), browserRouteOwners = new Map();
function winAcct(wc) { wc = browserRouteOwners.get(wc)?.owner || extensionPopupOwners.get(wc) || wc; for (const [id, w] of wins) if (!w.isDestroyed() && w.webContents === wc) return acct(id); return null; }
extensionTabs = require('./extension-tabs').createExtensionTabs({
  BrowserWindow,ownerFor:id=>wins.get(id),accountFor:id=>acct(id),
  attachOwner:(wc,owner)=>extensionPopupOwners.set(wc,owner),detachOwner:wc=>extensionPopupOwners.delete(wc),
  applyProxy:(a)=>applyProxy(a),privacyInit:wc=>uaMeta(wc),loadURL:loadURLAlive,
  registerTab:(id,wc,w)=>extensionCompat.registerTab(id,wc,w),
  reportError:(id,extensionId,error)=>{extensionCompat.reportError(id,extensionId,error);runtimeLog('extension-tab-failed',{kind:error?.name});},
  windowOptions:a=>({width:1200,height:820,minWidth:720,minHeight:480,title:APP_TITLE+' · '+a.name+' · 扩展页面',icon:ICON,backgroundColor:themeBg(),autoHideMenuBar:true,titleBarStyle:process.platform==='darwin'?'hiddenInset':'hidden',...(process.platform==='darwin'?{trafficLightPosition:{x:14,y:13},roundedCorners:true}:{titleBarOverlay:themeOverlay()}),webPreferences:{preload:path.join(__dirname,'preload.js'),backgroundThrottling:false,spellcheck:false}}),
  decorate:(w,wc)=>{
    keepRound(w,10);keepViewport(w);
    wc.on('page-favicon-updated',(_e,urls)=>{wc.__bookmarkFavicons={page:wc.getURL(),urls};});
    wc.on('dom-ready',()=>{const u=wc.getURL();if(u.startsWith(UI_URL))void wc.executeJavaScript(typeof getBundle === "function" ? getBundle() : BUNDLE).catch(()=>{});else if(/^(https:\/\/|chrome-extension:\/\/)/.test(u)&&WEBBAR)void wc.executeJavaScript('window.__ancBarPad='+JSON.stringify(WEBBAR_PAD)+';window.__ancBarTheme='+JSON.stringify(barTheme())+';'+WEBBAR).catch(()=>{});});
  },
});

// 可见窗口的账号（后台抽卡用的隐藏窗口不算：不记进「下次启动打开」）
// Detach CDP privacy debugger before any native window teardown (close/destroy); see 'close' handler below.
function releaseWindow(w) {
  try { const wc = w && !w.isDestroyed() ? w.webContents : null; if (!wc || wc.isDestroyed()) return; wc.session.__routeBlocked = true; wc.stop(); wc.__privacyReset?.(); if (wc.debugger.isAttached()) wc.debugger.detach(); }
  catch (error) { runtimeLog('window-release-failed', { kind: error?.name }); }
}
function destroyWindow(w) { if (!w || w.isDestroyed()) return; releaseWindow(w); w.destroy(); }
const shownIds = () => [...wins.entries()].filter(([, w]) => !w.isDestroyed() && !w.__hidden).map(([id]) => id);
const cmds = new Map(); // accountId -> 窗口界面启动后要执行的命令（后台抽卡）
function attachContextMenu(wc, w) {
  if (!wc || wc.__ctxMenuBound) return;
  wc.__ctxMenuBound = true;
  wc.on('context-menu', (_e, params) => {
    if (w && w.isDestroyed()) return;
    const items = [];
    if (params.isEditable) {
      items.push(
        { label: '撤销', role: 'undo', enabled: !!params.editFlags?.canUndo },
        { label: '重做', role: 'redo', enabled: !!params.editFlags?.canRedo },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: !!params.editFlags?.canCut },
        { label: '复制', role: 'copy', enabled: !!params.editFlags?.canCopy },
        { label: '粘贴', role: 'paste', enabled: params.editFlags?.canPaste !== false },
        { label: '全选', role: 'selectAll', enabled: params.editFlags?.canSelectAll !== false }
      );
    } else if (params.selectionText && String(params.selectionText).trim()) {
      items.push(
        { label: '复制', role: 'copy' },
        { label: '全选', role: 'selectAll' }
      );
    }
    if (items.length) {
      try { Menu.buildFromTemplate(items).popup({ window: w || BrowserWindow.fromWebContents(wc) }); } catch {}
    }
  });
}
async function openAccount(id, opt = {}) {
  const a = acct(id); if (!a) return null;
  const ex = wins.get(id);
  if (ex && !ex.isDestroyed()) {
    if (opt.hidden) return pub(a);
    // 后台抽卡的隐藏窗口：直接显示出来（抽卡照常继续）
    if (ex.__hidden) { ex.__hidden = false; clearTimeout(ex.__reap); ex.show(); DB.open = shownIds(); DB.last = id; saveDB(); }
    if (ex.isMinimized()) ex.restore(); ex.focus(); return pub(a);
  }
  const hidden = !!opt.hidden;
  // 程序运行中再开一个账号：和启动时一样先弹「连接 arena.ai…」小窗，界面搭好（host:ready）再显示主窗口；
  // 以前这类窗口最多 4 秒就直接显示出来，而页面还在准备扩展、代理和隐私环境，用户看到的就是一块空白
  if (!hidden) showSplash();
  prepSession(a).__routeBlocked = true;
  if(typeof extensionCompat!=='undefined')extensionCompat.prepareSession(a.id,session.fromPartition(partOf(a.id)));
  const wb = (() => {
    try {
      const raw = a.winBounds;
      if (!raw || typeof raw !== 'object') return null;
      const bw = Math.round(Number(raw.width)), bh = Math.round(Number(raw.height));
      if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw < 400 || bh < 300) return null;
      const out = { width: Math.max(720, Math.min(8000, bw)), height: Math.max(480, Math.min(5000, bh)), maximized: !!raw.maximized };
      const bx = Math.round(Number(raw.x)), by = Math.round(Number(raw.y));
      if (Number.isFinite(bx) && Number.isFinite(by) && Math.abs(bx) < 32000 && Math.abs(by) < 32000) {
        let vis = true;
        if (typeof screen !== 'undefined' && typeof screen?.getAllDisplays === 'function') {
          const ds = screen.getAllDisplays();
          if (Array.isArray(ds) && ds.length) {
            vis = ds.some(d => {
              const r = d?.workArea || d?.bounds; if (!r) return false;
              const ox = Math.min(bx + out.width, r.x + r.width) - Math.max(bx, r.x);
              const oy = Math.min(by + out.height, r.y + r.height) - Math.max(by, r.y);
              return ox >= 100 && oy >= 60;
            });
          }
        }
        if (vis) { out.x = bx; out.y = by; }
      }
      return out;
    } catch { return null; }
  })();
  const w = new BrowserWindow({
    ...(wb && wb.x != null && wb.y != null ? { x: wb.x, y: wb.y } : {}),
    width: wb?.width || 1320, height: wb?.height || 880, minWidth: 720, minHeight: 480, title: `${APP_TITLE} · ${(a.email || '').split('@')[0] || a.name}`, show: false, icon: ICON,
    backgroundColor: themeBg(), autoHideMenuBar: true,
    // 不要系统白色标题栏：内容铺满窗口，标签栏当拖动区；Windows / Linux 右上角保留系统按钮并跟随主题色
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 }, roundedCorners: true } : { titleBarOverlay: themeOverlay() }),
    webPreferences: { partition: partOf(a.id), preload: path.join(__dirname, 'preload.js'), nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: !process.env.BRANA_NO_SANDBOX, backgroundThrottling: false, spellcheck: false, additionalArguments: [hidden ? '--brana-bg-renderer' : '--brana-fg-renderer'] },
  });
  if (!hidden && opt.closeOthers && typeof bgWorkMap !== 'undefined' && typeof destroyWindow === 'function') {
    for (const [oldId, oldW] of [...wins.entries()]) {
      if (oldId === id || !oldW || oldW.isDestroyed() || oldW.__hidden) continue;
      const oldAcct = acct(oldId);
      const isBgBusy = Boolean(oldAcct?.status?.gacha?.busy || oldAcct?.status?.statsBusy || bgWorkMap.get(oldW.webContents?.id)?.busy);
      if (isBgBusy) {
        oldW.__hidden = true;
        try { oldW.hide(); } catch {}
      } else {
        try { oldW.__syncBounds?.(true); } catch {}
        try { destroyWindow(oldW); } catch {}
        wins.delete(oldId);
        try { stopTunnel(oldId); } catch {}
      }
    }
  }
  wins.set(id, w); w.__hidden = hidden;
  keepRound(w, 10); keepViewport(w);
  const wc = w.webContents; w.__runtimeId = wc.id;
  if (typeof attachContextMenu === 'function') attachContextMenu(wc, w);
  if(typeof extensionCompat!=='undefined')extensionCompat.registerTab(a.id,wc,w);
  wc.on('page-favicon-updated',(_e,urls)=>{wc.__bookmarkFavicons={page:wc.getURL(),urls};});
  const navigationFailures = createFailureOwner();
  const retryTarget = createRetryTarget(UI_URL); wc.__retryTarget = retryTarget;
  const syncBounds = (immediate = false) => {
    try {
      if (!w || w.isDestroyed() || w.__hidden || typeof w.getBounds !== 'function') return;
      const isMin = typeof w.isMinimized === 'function' && w.isMinimized();
      const isMax = typeof w.isMaximized === 'function' && w.isMaximized();
      const isFull = typeof w.isFullScreen === 'function' && w.isFullScreen();
      if (isMin || isFull) return;
      const curB = isMax && typeof w.getNormalBounds === 'function' ? w.getNormalBounds() : (!isMax ? w.getBounds() : a.winBounds);
      if (curB && Number.isFinite(curB.width) && Number.isFinite(curB.height) && curB.width >= 400 && curB.height >= 300) {
        a.winBounds = {
          ...(Number.isFinite(curB.x) && Number.isFinite(curB.y) ? { x: Math.round(curB.x), y: Math.round(curB.y) } : {}),
          width: Math.max(720, Math.round(curB.width)),
          height: Math.max(480, Math.round(curB.height)),
          maximized: !!isMax,
        };
        if (immediate) saveDB();
        else if (typeof saveSoon === 'function') saveSoon();
      }
    } catch {}
  };
  w.__syncBounds = syncBounds;
  let boundsT = 0;
  const scheduleSyncBounds = () => { clearTimeout(boundsT); boundsT = setTimeout(() => syncBounds(false), 350); };
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize']) w.on(ev, scheduleSyncBounds);
  // 有启动小窗时：等界面搭好（host:ready）再显示主窗口，避免白屏 / 半成品
  const waitUi = !!splash && !hidden; let shown = false;
  const reveal = () => {
    if (shown || w.isDestroyed()) return;
    if (w.__hidden) { closeSplash(); return; }
    shown = true;
    if (wb?.maximized && typeof w.maximize === 'function') { try { w.maximize(); } catch {} }
    w.show();
    closeSplash();
    scheduleSyncBounds();
  };
  w.__reveal = reveal;
  const offline = (desc, code = '', manual = false, url = '') => {
    if (w.isDestroyed() || w.__offlinePending) return;
    w.__offlinePending = true;
    retryTarget.remember(url);
    const isArenaTarget = !url || /^https:\/\/(?:[^/]+\.)?arena\.ai(?:\/|$)/i.test(String(url));
    const canInlineShell = isArenaTarget && !manual && !process.env.BRANA_EXTENSION_TEST_DATA && !['RENDER', 'PRIVACY'].includes(String(code || '')) && typeof uaMeta === 'function' && typeof wc.debugger?.sendCommand === 'function';
    void (async () => {
      if (canInlineShell) {
        try {
          if (wc.__clientShell && String(wc.getURL() || '').startsWith(UI_URL)) {
            const handledInShell = await wc.executeJavaScript('try{if(window.__ANC_CLIENT_SHELL&&window.__anc&&document.getElementById("app")){if(!window.__anc.UI.authed&&window.__anc.UI.enterBrowseMode)window.__anc.UI.enterBrowseMode();window.__anc.RegionIP?.open?.({offlineAlert:true});if(' + JSON.stringify(!manual) + ')window.__anc.AutoRoute?.request?.("network",true);return true;}}catch{}return false;');
            if (handledInShell) return;
          }
          await uaMeta(wc);
          await wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt*' }] });
          wc.session.__routeBlocked = false;
          const q = new URLSearchParams({ browse: '1', offline: '1', desc: String(desc || ''), code: String(code || ''), ...(manual ? { recovery: 'manual' } : {}) });
          await loadURLAlive(wc, UI_URL + '?' + q.toString(), 15000);
          return;
        } catch {}
      }
      await wc.loadFile(OFFLINE, { query: { desc: String(desc), code: String(code), recovery: manual ? 'manual' : '', url: safeNavigationURL(url) } });
    })()
      .catch(error => runtimeLog('offline-load-failed', { window: w.__runtimeId, code: error.code }))
      .finally(() => { w.__offlinePending = false; reveal(); });
  };
  wc.__privacyFault = reason => {
    runtimeLog('privacy-blocked', { window: w.__runtimeId, reason });
    offline('浏览器隐私保护中断，网络已阻断。窗口和账号数据已保留；请点击重试恢复。', 'PRIVACY', true, retryTarget.get());
  };
  const navigationFailed = failure => {
    if (!failure || w.isDestroyed() || w.__offlinePending) return;
    const { url, code, desc } = failure;
    if (wc.session.__routeBlocked) { offline('代理或隐私保护中断，网络仍被阻断；请在原账号中检查后重试。', code, true, url); return; }
    if (RouteState.locked(a) && extAuth(url)) { extFail(w, url, code, desc); return; }
    if (waitUi) setTimeout(reveal, 200);
    const hint = a.tunErr ? 'VLESS 节点：' + a.tunErr : /PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED/.test(String(desc || '')) && !String(a.proxy || '').trim() ? desc + '（默认代理 127.0.0.1:7890 没有运行，请检查该账号线路）' : String(desc || '连接失败，请检查原账号线路');
    offline(hint, code, RouteState.locked(a), url);
  };
  wc.__navigate = (url, options = {}) => {
    if (w.__navigateP) return w.__navigateP;
    retryTarget.remember(url || UI_URL);
    const navigationId = navigationFailures.begin(url || UI_URL);
    // 诊断：哪一步（扩展 / 代理与隐私环境 / 页面加载）超过 20 秒还没完成，记进 runtime.jsonl，窗口长时间空白时能定位
    let stage = 'extensions'; const slow = setTimeout(() => runtimeLog('navigation-slow', { window: w.__runtimeId, code: stage }), 20000);
    w.__navigateP = (async () => {
      try {
        await extensionStore.ready(a.id); if (w.isDestroyed()) return false; stage = 'route';
        await applyProxy(a); if (w.isDestroyed()) return false; stage = 'load';
        if (!w.isDestroyed()) {
          const targetUrl = url || UI_URL;
          const isFix = Boolean(process.env.BRANA_EXTENSION_TEST_DATA || /^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(String(proxyStr(a) || '')) || /@example\.invalid$/i.test(String(a?.email || '')));
          if (!isFix && typeof wc.debugger?.sendCommand === 'function' && wc.debugger.isAttached()) {
            if (String(targetUrl).startsWith(UI_URL)) {
              try { await wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt*', requestStage: 'Request' }] }); } catch {}
            } else {
              try { await wc.debugger.sendCommand('Fetch.disable'); } catch {}
            }
          }
          await loadURLAlive(wc, targetUrl, 45000, options);
          wc.__privacyNeedsReload=false;
        }
        return true;
      } catch (error) {
        if (w.isDestroyed() || ['ERR_ABORTED','ERR_RENDER_PROCESS_GONE','ERR_WEB_CONTENTS_DESTROYED'].includes(error?.code) || error?.errno === -3 || /ERR_ABORTED|\(-3\)/i.test(String(error?.message || ''))) return false;
        runtimeLog('navigation-failed', { window: w.__runtimeId, code: error.code, kind: error.name });
        navigationFailed(navigationFailures.rejected(navigationId, error));
        return false;
      }
    })().finally(() => { clearTimeout(slow); navigationFailures.end(navigationId); w.__navigateP = null; });
    return w.__navigateP;
  };
  const via = () => { const s = proxyStr(a); return isDirect(s) ? '（直连）' : /^vless:/i.test(s) ? '（VLESS 节点）' : '（代理 ' + s.replace(/^\w+:\/\//, '').replace(/^[^@]*@/, '') + '）'; };
  if (waitUi) splashText('连接 arena.ai' + via() + '…');
  wc.on('did-redirect-navigation', (e, url, inPlace, isMain) => { if (isMain) navigationFailures.redirect(url); });
  wc.on('did-start-navigation', (e, url, inPlace, isMain) => { if (isMain && !inPlace) { wc.__clientShell = String(url || '').startsWith(UI_URL); navigationFailures.started(url); retryTarget.remember(url); } if (isMain && waitUi && !shown) splashText('连接 arena.ai' + via() + '…'); });
  wc.on('console-message', (_e, level, msg, line) => {
    if (level >= 2) {
      appendRendererLog(`[CONSOLE L${level} line=${line}] ${msg}\n`);
    }
  });
  wc.on('dom-ready', () => {
    const u = wc.getURL();
    // 客户端界面（robots.txt）马上注入；浏览器模式的官网页面等官网自己先加载完（did-finish-load，最多等 2.5 秒）再注入 3.6MB 的客户端脚本，
    // 完整功能延后；轻量顶部栏与底部占位由 preload 在页面创建时挂载，dom-ready 仅兜底。
    if (u.startsWith(UI_URL)) { wc.__clientShell = true; wc.executeJavaScript('Boolean(window.__arenaNextClientLoaded)').then(ok => (ok || wc.isDestroyed()) ? null : wc.executeJavaScript(typeof getBundle === 'function' ? getBundle() : BUNDLE)).catch(e => { console.error('inject', e); appendRendererLog(`[INJECT-ERR] ${e?.stack || e}\n`); }); }
    else if (u.startsWith('https://arena.ai/')) {
      const seq = wc.__injSeq = (wc.__injSeq || 0) + 1; let fired = false;
      const go = () => { if (fired || wc.isDestroyed() || wc.__injSeq !== seq) return; fired = true; clearTimeout(t); wc.off('did-finish-load', go); if (wc.getURL().startsWith('https://arena.ai/') && !wc.getURL().startsWith(UI_URL)) wc.executeJavaScript(typeof getBundle === "function" ? getBundle() : BUNDLE).catch(e => console.error('inject', e)); };
      const t = setTimeout(go, 2500); wc.once('did-finish-load', go);
    }
    if (waitUi && !shown) { if (u.startsWith(UI_URL)) splashText('初始化界面…'); else setTimeout(reveal, 300); }
    // 网页（注册 / 登录 / 邮箱 / 外部登录页）：顶部放浏览条，同一个账号环境里想去哪都行；其他非客户端页面只留一条可拖动窗口的区域
    if (/^(https:\/\/|chrome-extension:\/\/)/.test(u) && !u.startsWith(UI_URL)) { if (WEBBAR) wc.executeJavaScript('window.__ancBarPad=' + JSON.stringify(WEBBAR_PAD) + ';window.__ancBarTheme=' + JSON.stringify(barTheme()) + ';' + WEBBAR).catch(() => {}); }
    else if (!u.startsWith(UI_URL) && !u.startsWith('file:')) wc.insertCSS('html::before{content:"";position:fixed;top:0;left:0;right:150px;height:30px;-webkit-app-region:drag;z-index:2147483647}').catch(() => {});
  });
  // Connectors 授权：Merge 的授权组件（ah-cdn.merge.dev）会弹出第三方登录窗口（Google / Notion / Linear / GitHub…），
  // 让它在同一个账号环境的小窗口里完成，不要把主界面导航走
  const authPopup = (url, ref) => { const host = u => { try { return new URL(u).hostname; } catch { return ''; } }; const re = /(^|\.)(merge\.dev|factorymerge\.com|factory\.ai)$/i; return /^https:/.test(url) && (re.test(host(url)) || re.test(host(ref || ''))); };
  wc.setWindowOpenHandler(({ url, referrer }) => {
    if (authPopup(url, referrer?.url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 560, height: 760, parent: w, autoHideMenuBar: true, title: '连接应用', backgroundColor: '#ffffff' } };
    if (/^(?:blob|data):/i.test(url) || /\/api\/chat\/(?:[^/]+\/workspace\/[^/]+\/download|workspace\/cas\/)|\/download(?:\b|\/|\?)|[?&](?:download|response-content-disposition)=/i.test(url)) { try { wc.downloadURL(url); } catch {} return { action: 'deny' }; }
    if (/^https?:/.test(url)) void wc.__navigate(url); return { action: 'deny' };
  });
  // Navigation and OAuth popups stay in this account session; no implicit system-browser escape.
  wc.on('page-title-updated', e => e.preventDefault());
  wc.on('render-process-gone', (_, details) => {
    runtimeLog('render-process-gone', { window: w.__runtimeId, reason: details.reason, exitCode: details.exitCode });
    wc.session.__routeBlocked = true; wc.session.__routeReadySignature = ''; wc.session.__lastProxyRuleKey = ''; wc.__privacyFailed = true;
    if (w.__hidden && !bgWorkMap.has(id)) {
      clearTimeout(w.__recoverT);
      try { w.destroy(); } catch {}
      try { stopTunnel(id); } catch {}
      return;
    }
    const recent = w.__crashes = (w.__crashes || []).filter(at => Date.now() - at < 60000); recent.push(Date.now());
    clearTimeout(w.__recoverT);
    w.__recoverT = setTimeout(() => {
      if (w.isDestroyed() || quitting) return;
      try { global.gc?.(); } catch {}
      if (recent.length > 2) offline('界面进程反复退出，已暂停自动重载。可手动重试；诊断记录在数据目录 logs/runtime.jsonl。', 'RENDER', true);
      else { runtimeLog('renderer-recover', { window: w.__runtimeId, attempt: recent.length }); void wc.__navigate(retryTarget.get()); }
    }, 1000);
  });
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    if (String(url).startsWith('file:')) { reveal(); return; }
    navigationFailed(navigationFailures.event({ url, code, desc }));
  });
  if (waitUi) setTimeout(reveal, 20000);
  else { w.once('ready-to-show', () => reveal()); setTimeout(reveal, 4000); }
  // Detach the privacy debugger (and its auto-attached child targets) BEFORE native teardown.
  // Destroying a window while CDP auto-attach is active crashes the whole main process,
  // which closed every account window at once.
  w.on('close', () => {
    clearTimeout(boundsT);
    if (!quitting && !w.__hidden) {
      const curShown = shownIds();
      const nowMs = Date.now();
      if (!w.constructor.__closeBatch || nowMs - w.constructor.__closeBatch.at > 650) {
        w.constructor.__closeBatch = { at: nowMs, openBefore: curShown.length ? [...curShown] : [id] };
      } else {
        w.constructor.__closeBatch.at = nowMs;
      }
    }
    syncBounds(!quitting);
    releaseWindow(w);
  });
  w.on('closed', () => {
    clearTimeout(boundsT); clearTimeout(w.__recoverT); runtimeLog('window-closed', { window: w.__runtimeId, reason: quitting ? 'quit' : 'closed' });
    if (wins.get(id) === w) { wins.delete(id); try { stopTunnel(id); } catch {} }
    if (!quitting) {
      const rem = shownIds();
      if (rem.length) {
        DB.open = rem;
      } else if (!w.__hidden) {
        const batch = w.constructor.__closeBatch;
        DB.open = (batch && Date.now() - batch.at <= 800 && Array.isArray(batch.openBefore) && batch.openBefore.length > 1)
          ? batch.openBefore
          : [id];
      }
      saveDB();
      // 最后一个可见窗口关掉：后台抽卡的隐藏窗口一起关，程序退出（不留看不见的进程）
      if (!w.__hidden && !rem.length && !(mgr && !mgr.isDestroyed())) for (const x of wins.values()) destroyWindow(x);
    }
  });
  void wc.__navigate(UI_URL);
  if (!hidden) { DB.open = opt.closeOthers ? [id] : [...new Set([...shownIds(), id])]; DB.last = id; saveDB(); }
  return pub(a);
}

// Navigation failures are handled at their source, not by swallowing global uncaught exceptions.
async function navigateAccount(wc, url = UI_URL, options = {}) {
  if (!wc || wc.isDestroyed()) return false;
  if (wc.__navigate) return wc.__navigate(url,options);
  // Manager/preview windows have no account route: reload themselves, never load Brana in a default session.
  try { wc.reload(); return true; }
  catch (error) { runtimeLog('navigation-failed', { code: error.code, kind: error.name }); return false; }
}
// User-requested route refresh / mode switches must also interrupt a still-loading document.
async function navigateBrowser(wc,url){
  if(!wc||wc.isDestroyed())return false;
  const pending=BrowserWindow.fromWebContents(wc)?.__navigateP;
  if(pending){wc.stop();await pending;}
  return navigateAccount(wc,url,{forceReload:wc.getURL()===url});
}
async function openAccountSafe(id, opt) {
  try { return await openAccount(id, opt); }
  catch (error) {
    runtimeLog('window-open-failed', { kind: error.name, code: error.code }); closeSplash();
    dialog.showErrorBox('Brana AI 无法打开窗口', '账号数据未删除。请重试；诊断记录在数据目录 logs/runtime.jsonl。');
    return null;
  }
}

// ---------- 主题：窗口底色 / 右上角系统按钮颜色跟随界面深浅色 ----------
let themeWas;
function syncThemeSource() {
  const t = DB.shared?.prefs?.theme, mode = t === 'dark' || t === 'light' ? t : 'system';
  if (nativeTheme.themeSource !== mode) nativeTheme.themeSource = mode;
}
function themeBg() { const t = DB.theme; if (t && /^#[0-9a-f]{3,8}$/i.test(t.bg || '')) return t.bg; return nativeTheme.shouldUseDarkColors ? '#1f1e1c' : '#faf9f7'; }
// 浏览条配色 = 窗口按钮（titleBarOverlay）的配色：浏览器模式下右上角最小化 / 最大化 / 关闭和浏览条是同一个底色
function barTheme() { const t = DB.theme || {}; return { ...themeOverlay(), dark: t.bg ? !!t.dark : nativeTheme.shouldUseDarkColors }; }
function themeOverlay() { const t = DB.theme || {}, dark = t.bg ? !!t.dark : nativeTheme.shouldUseDarkColors; return { color: themeBg(), symbolColor: /^#[0-9a-f]{3,8}$/i.test(t.fg || '') ? t.fg : dark ? '#ecebe8' : '#1f1e1c', height: 40 }; }
ipcMain.handle('host:theme', (e, t) => {
  if (!t || typeof t !== 'object') return false;
  const bg = /^#[0-9a-f]{3,8}$/i.test(t.bg || '') ? t.bg : null, fg = /^#[0-9a-f]{3,8}$/i.test(t.fg || '') ? t.fg : null;
  if (!bg) return false;
  // 注意：这里不再改 nativeTheme.themeSource。多个账号窗口各自上报时，只要有一个窗口的主题设置还是旧的（比如深色），
  // 就会和「跟随系统」的窗口来回改 themeSource → 系统配色媒体查询跟着翻转 → 各窗口重新上报 → 无限黑白闪烁。
  // themeSource 只按共享设置（prefs.theme）改一次，见 syncThemeSource()
  const prev = DB.theme || {}; DB.theme = { bg, fg: fg || (t.dark ? '#ecebe8' : '#1f1e1c'), dark: !!t.dark };
  if (prev.bg !== DB.theme.bg || prev.fg !== DB.theme.fg) saveDB();
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) {
    w.setBackgroundColor(bg);
    if (process.platform !== 'darwin') { try { w.setTitleBarOverlay(themeOverlay()); } catch {} }
  }
  return true;
});

// ---------- IPC ----------
ipcMain.handle('host:info', e => { const a = winAcct(e.sender); return { platform: 'desktop', version: VERSION, routeDraft: true, account: pub(a), privacy: {...BrowserPrivacy.profile(a||{}),webrtc:'disabled',google:'account-proxy',blocked:a?!!session.fromPartition(partOf(a.id)).__routeBlocked:false}, accounts: DB.accounts.map(pubLite) }; });
ipcMain.handle('host:listAccounts', (e, lite) => DB.accounts.map(lite ? pubLite : pub));
// Read only the selected account's cached statistics; no network or credential export.
ipcMain.handle('host:accountStats', (e, id) => {
  const a = typeof id === 'string' ? acct(id) : null;
  return a ? { ok: true, id: a.id, stats: a.status?.stats || null } : { error: '账号已删除，请刷新列表' };
});
// ProxyIP 去端口比较：同一个 IP 的不同端口也算同一个出口（不同账号不能共用）
const pipKey = v => { v = String(v || '').trim().toLowerCase(); if (!v) return ''; if (v[0] === '[') return v.slice(0, v.indexOf(']') + 1) || v; return (v.match(/:/g) || []).length === 1 ? v.split(':')[0] : v; };
ipcMain.handle('host:saveAccount', async (e, a) => {
  if (!a || typeof a !== 'object') return null;
  if (a.id && applyRoute.busy.has(a.id)) throw Error('自动换路中，请稍后保存代理设置');
  if (a.proxy && !validProxy(a.proxy)) throw new Error('代理格式不正确，例：127.0.0.1:7890、socks5://127.0.0.1:7892、direct（直连）或 vless://… 节点链接');
  if (a.proxyIp != null && String(a.proxyIp).trim() && !/^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i.test(String(a.proxyIp).trim())) throw new Error('ProxyIP 格式不正确，例：1.2.3.4、1.2.3.4:443 或 proxyip.example.com');
  const email = a.email == null ? undefined : String(a.email).trim().slice(0, 200);
  let cur = (a.id && acct(a.id)) || (!a.id && email && byEmail(email)) || null;
  // 带了账号 ID 却找不到 = 刚被删除后的过期保存（线路池 / 测速 / 旧页面拿着删除前的列表）：不能当成新账号建出来，否则删掉的账号会再冒出来
  if (a.id && !cur) throw new Error('这个账号已被删除或不存在，已忽略本次保存');
  if (cur && applyRoute.busy.has(cur.id)) throw Error('目标账号正在保存线路，请等待结果');
  if (cur) RouteState.assertChange(cur, a);
  if (a.routeMode !== undefined) RouteState.prefs(a.routeMode);
  const routeBefore = cur ? JSON.stringify([cur.proxy, cur.nodeId, cur.region]) : '';
  const prevRouteSig = cur ? RouteState.signature(cur) : "";
  const prevFpJson = cur ? JSON.stringify(cur.fp || null) : "";
  // ProxyIP 每个账号唯一（留空不限）：同一个节点可以共用，但落地 IP 不能撞
  const pipN = String(a.proxyIp ?? cur?.proxyIp ?? '').trim().toLowerCase();
  if (pipN) { const dup = DB.accounts.find(x => x !== cur && pipKey(x.proxyIp) === pipKey(pipN)); if (dup) throw new Error('ProxyIP「' + pipN + '」已被账号「' + dup.name + '」使用，每个账号的 ProxyIP 不能相同'); }
  if (email && cur && byEmail(email) && byEmail(email) !== cur) throw new Error('该邮箱已在另一个账号里：' + byEmail(email).name);
  if (!cur) { cur = { id: newId(), name: String(a.name || email || '账号').slice(0, 40), proxy: String(a.proxy || '').trim(), proxyIp: String(a.proxyIp || '').trim(), email: email || '', fp: a.fp ? cleanFp(a.fp) : genFp() }; if (a.password) cur.pw = encPw(String(a.password)); if (a.nodeId) cur.nodeId = String(a.nodeId).slice(0, 40); DB.accounts.push(cur); }
  else {
    cur.name = String(a.name || cur.name).slice(0, 40);
    if (email !== undefined) {
      const canonM = v => { const r = String(v || '').trim().toLowerCase(); if (!r || /@example\.invalid$/i.test(r)) return r; const [l, d] = r.split('@'); return d ? l.replace(/\+.*$/, '').replace(/[.,\-_]/g, '') + '@' + d : r; };
      const sameBox = Boolean(cur.email && email && canonM(cur.email) === canonM(email));
      const pickRich = (s, m) => { const sv = String(s || '').trim(), mv = String(m || '').trim(); if (!sv || !sv.includes('@')) return mv || sv; if (!mv || !mv.includes('@')) return sv; if (canonM(sv) === canonM(mv)) { const sp = (sv.split('@')[0].match(/[.,\-_+]/g) || []).length, mp = (mv.split('@')[0].match(/[.,\-_+]/g) || []).length; return sp >= mp ? sv : mv; } return mv; };
      if (!sameBox && email !== cur.email) cur.status = null;
      cur.email = (!a.manualEmailEdit && sameBox) ? pickRich(cur.email || cur.name, email) : email;
      if (cur.status?.me && canonM(cur.email) === canonM(cur.status.me)) cur.status.me = cur.email;
    }
    if (a.password !== undefined && a.password !== null && String(a.password) !== '') { cur.pw = encPw(String(a.password)); cur.noAuto = false; }   // 空密码不覆盖已保存的（以前连接失败时读不到密码、一保存就把密码清掉了）
    const np = String(a.proxy ?? cur.proxy ?? '').trim(), npi = String(a.proxyIp ?? cur.proxyIp ?? '').trim(); const changed = np !== (cur.proxy || '') || npi !== (cur.proxyIp || ''); cur.proxy = np; cur.proxyIp = npi; if (a.nodeId !== undefined) cur.nodeId = String(a.nodeId || '').slice(0, 40);
    if (a.fp) cur.fp = cleanFp(a.fp);
    // Apply only after all route/region fields have been assigned below.
    const w = wins.get(cur.id); if (w && !w.isDestroyed()) w.setTitle(`${typeof APP_TITLE==='string'?APP_TITLE:'Brana AI'} · ${cur.name}`);
  }
  if (a.routeMode !== undefined) Object.assign(cur, RouteState.prefs(a.routeMode));
  if (typeof a.nodeFailover === 'boolean' && RouteState.mode(cur) === 'node') cur.nodeFailover = a.nodeFailover;
  // Empty legacy password fields remain non-destructive; only an explicit user choice clears credentials.
  if (a.clearPassword === true) { delete cur.pw; cur.noAuto = true; }
  if (typeof a.remark === 'string') cur.remark = a.remark.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 40);
  if (a.region !== undefined) cur.region = String(a.region || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (routeBefore && routeBefore !== JSON.stringify([cur.proxy, cur.nodeId, cur.region])) cur.routeHome = cur.region || '';
  const nextRouteSig = RouteState.signature(cur);
  const nextFpJson = JSON.stringify(cur.fp || null);
  const ses = typeof prepSession === "function" ? prepSession(cur) : null;
  const routeChanged = !prevRouteSig || nextRouteSig !== prevRouteSig || nextFpJson !== prevFpJson || (ses ? (ses.__routeReadySignature !== nextRouteSig || Boolean(ses.__routeBlocked)) : true);
  if(routeChanged && !a.deferProxy && (a.region!==undefined||a.fp||a.proxy!==undefined||a.proxyIp!==undefined))await applyProxy(cur);
  saveDB(); return pub(cur);
});
// A name-only update must never apply proxy/password fields or create a missing account.
ipcMain.handle('host:renameAccount', (e, id, value) => {
  const a = acct(id), name = typeof value === 'string' ? value.trim() : '';
  if (!a) throw new Error('账号已删除，请重新打开账号列表');
  if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('名称须为 1–40 个字符，不能包含控制字符');
  const before = a.remark; a.remark = name;
  try { saveDB(true); } catch (err) { if (before === undefined) delete a.remark; else a.remark = before; throw err; }
  const w = wins.get(id); if (w && !w.isDestroyed()) w.setTitle(`${typeof APP_TITLE==='string'?APP_TITLE:'Brana AI'} · ${name}`);
  return { ok: true, id, name, remark: name };
});
ipcMain.handle('host:removeAccount', createAccountRemoval({
  accounts: () => DB.accounts, find: acct, windowFor: id => wins.get(id), caller: e => winAcct(e.sender), open: openAccount,
  persistRemoval(id) {
    const before = { accounts: DB.accounts, open: DB.open, last: DB.last };
    DB.accounts = DB.accounts.filter(x => x.id !== id); DB.open = DB.open.filter(x => x !== id);
    if (DB.last === id) DB.last = DB.accounts[0]?.id;
    try { saveDB(true); } catch (e) { Object.assign(DB, before); throw e; }
  },
  async cleanup(id) {
    destroyWindow(wins.get(id)); stopTunnel(id); siteLogins.forget(id);
    if (DB.shared && typeof DB.shared === 'object') {
      let shDirty = false;
      for (const pfx of ['hist@', 'draft@', 'gacha@', 'webreg@', 'gtok@', 'signup@', 'mailtok@', 'regpw@', 'models@']) {
        if ((pfx + id) in DB.shared) { delete DB.shared[pfx + id]; shDirty = true; }
      }
      if (shDirty) saveSoon();
    }
    try { fs.promises.unlink(path.join(app.getPath('userData'), 'xray', String(id).replace(/[^\w-]/g, '_') + '.json')).catch(() => {}); } catch {}
    try { await session.fromPartition(partOf(id)).clearStorageData(); } catch {}
    try { GB.cancel(id); setTimeout(() => fs.rm(path.join(app.getPath('userData'), 'gbrowser', String(id).replace(/[^\w-]/g, '_')), { recursive: true, force: true }, () => {}), 3000); } catch {}
  },
}));
ipcMain.handle('host:openAccount', (e, id) => openAccount(id));
// 账号菜单里的抽卡按钮：在该账号的窗口里开始 / 停止抽卡；没开窗口就在后台开一个隐藏窗口抽（不显示）
ipcMain.handle('host:gachaAccount', async (e, id, cmd) => {
  const a = acct(id); if (!a || !['start', 'stop', 'captcha'].includes(cmd)) return { error: '参数不正确' };
  const w = wins.get(id);
  // 抽卡遇到人机验证：把那个账号的窗口拿到前面，直接弹出验证
  if (cmd === 'captcha') {
    if (!w || w.isDestroyed()) return { error: '这个账号的窗口没有打开' };
    try { await openAccount(id); } catch {}
    try { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } catch {}
    w.webContents.send('anc-cmd', { gacha: 'captcha' }); return { ok: true };
  }
  if (w && !w.isDestroyed()) { w.webContents.send('anc-cmd', { gacha: cmd }); if (cmd === 'start') { clearTimeout(w.__reap); a.status = { ...(a.status || {}), gacha: { ...(a.status?.gacha || {}), busy: true, phase: '启动中', err: '', at: Date.now() } }; } return { ok: true }; }
  if (cmd === 'stop') { if (a.status?.gacha) { a.status.gacha.busy = false; saveSoon(); } return { ok: true }; }
  cmds.set(id, 'gacha-start');
  a.status = { ...(a.status || {}), gacha: { busy: true, done: 0, total: 0, hits: 0, phase: '后台启动中', err: '', at: Date.now() } };
  try { await openAccount(id, { hidden: true }); } catch (err) { cmds.delete(id); a.status.gacha = { busy: false, err: String(err.message || err) }; return { error: String(err.message || err) }; }
  return { ok: true, hidden: true };
});
// 账号管理窗口发给某个账号窗口的命令：{ stats } 重新统计 / { turns:[sid] } 统计这些对话的轮数 / { open: sid } 打开这个对话
// 请求都在该账号自己的窗口里发（走它自己的节点 / 地区 IP），账号管理窗口本身不联网
const SID_RE = /^[\w-]{6,80}$/;
ipcMain.handle('host:acctCmd', async (e, id, m) => {
  const a = acct(id); if (!a || !m || typeof m !== 'object') return { error: '参数不正确' };
  const cmd = {};
  if (m.stats) cmd.stats = 1;
  if (Array.isArray(m.turns)) { cmd.turns = m.turns.filter(x => SID_RE.test(String(x))).slice(0, 400); cmd.stats = 1; }
  if (typeof m.open === 'string' && SID_RE.test(m.open)) cmd.open = m.open;
  if (!cmd.stats && !cmd.open) return { error: '参数不正确' };
  let w = wins.get(id);
  if (cmd.stats) a.status = { ...(a.status || {}), statsBusy: '启动中…', statsErr: '' };
  if (w && !w.isDestroyed()) {
    if (cmd.stats) { w.__stats = true; clearTimeout(w.__reap); }
    if (cmd.open) await openAccount(id);
    w.webContents.send('anc-cmd', cmd); return { ok: true };
  }
  cmds.set(id, cmd);
  try { await openAccount(id, { hidden: !cmd.open }); } catch (err) { cmds.delete(id); if (a.status) a.status.statsBusy = ''; return { error: String(err.message || err) }; }
  w = wins.get(id); if (w && !w.isDestroyed() && cmd.stats) w.__stats = true;
  return { ok: true, hidden: !cmd.open };
});
// ---------- 账号管理窗口（本地页面，不联网；数据来自各账号窗口上报的统计）----------
let mgr = null;
function openManager() {
  if (mgr && !mgr.isDestroyed()) { if (mgr.isMinimized()) mgr.restore(); mgr.show(); mgr.focus(); return true; }
  const part = 'persist:anc-mgr', ses = session.fromPartition(part);
  if (!ses.__blocked) { ses.__blocked = true; ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => cb({ cancel: true })); }
  mgr = new BrowserWindow({
    width: 1100, height: 780, minWidth: 760, minHeight: 480, title: 'Brana AI · 账号管理', show: false, icon: ICON, backgroundColor: themeBg(), autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 }, roundedCorners: true } : { titleBarOverlay: themeOverlay() }),
    webPreferences: { partition: part, preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: !process.env.BRANA_NO_SANDBOX, spellcheck: false },
  });
  keepRound(mgr, 10);
  const w = mgr, wc = w.webContents;
  if (typeof attachContextMenu === 'function') attachContextMenu(wc, w);
  wc.on('dom-ready', () => wc.executeJavaScript(typeof getBundle === "function" ? getBundle() : BUNDLE).catch(err => console.error('inject mgr', err)));
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', ev => ev.preventDefault());
  wc.on('page-title-updated', ev => ev.preventDefault());
  let shown = false; const reveal = () => { if (!shown && !w.isDestroyed()) { shown = true; w.show(); } };
  w.__reveal = reveal; setTimeout(reveal, 3000);
  // 账号管理窗口关掉时如果已经没有可见的账号窗口：后台窗口一起关，程序退出
  w.on('closed', () => { if (mgr === w) mgr = null; if (!quitting && !shownIds().length) for (const x of wins.values()) destroyWindow(x); });
  const t = DB.theme || {}, dark = t.bg ? !!t.dark : nativeTheme.shouldUseDarkColors;
  void wc.loadFile(MGR, { query: { mgr: '1', dark: dark ? '1' : '0' } }).catch(error => runtimeLog('manager-load-failed', { code: error.code }));
  return true;
}
ipcMain.handle('host:openManager', () => openManager());
ipcMain.handle('host:takeCmd', e => { const a = winAcct(e.sender); if (!a) return null; const c = cmds.get(a.id) || null; cmds.delete(a.id); return c; });
ipcMain.handle('host:authTask', async (e, request) => {
  const a = winAcct(e.sender);
  let trusted = false;
  try { const url = new URL(e.sender.getURL()); const offline = url.protocol === 'file:' && path.resolve(require('node:url').fileURLToPath(url)) === path.resolve(OFFLINE) && ['status','cancel'].includes(request?.op); trusted = ((url.origin === 'https://arena.ai' && (url.pathname === '/robots.txt' || !!e.sender.__clientShell)) || offline) && (!e.senderFrame || e.senderFrame === e.sender.mainFrame); } catch {}
  if (!a || !trusted) return { ok: false, error: '仅当前账号的客户端主界面可以管理认证任务' };
  try { if (['prepare','begin'].includes(request?.op)) { if (e.sender.__privacyNeedsReload && (e.sender.__clientShell || /^https:\/\/arena\.ai\/robots\.txt\b/i.test(String(e.sender.getURL?.() || '')) || /^file:/i.test(String(e.sender.getURL?.() || '')))) e.sender.__privacyNeedsReload = false; if (e.sender.__privacyNeedsReload) throw Error('新的浏览器环境正在重载，请等待后再认证'); const ses = prepSession(a); if (ses.__routeBlocked || ses.__routeReadySignature !== RouteState.signature(a)) throw Error('当前账号线路尚未应用完成'); }
    if (request?.op === 'finish') { const ses = prepSession(a), ip = await authExit(ses); const r = await fetchAccountResponse(ses, 'https://arena.ai/api/me', {}, 15000); if (!r.ok) throw Error('最终身份复核未通过（HTTP ' + r.status + '），线路保持锁定'); const me = await r.json(); AuthFlow.identity(me?.user, request.email); request = { ...request, ip, email: me.user.email }; }
    return authRouteGuard.task(a.id, request); }
  catch (error) { return { ok: false, code: error.code || 'AUTH_TASK_FAILED', error: String(error.message || error) }; }
});
ipcMain.handle('host:login', (e, u) => {
  // 可带一个 https 链接：注册 / 找回密码邮件里的链接要在本账号的窗口里打开，登录状态才会落到这个账号上
  const url = u ? AuthFlow.authURL(String(u)).href : LOGIN_URL;
  try {
    e.sender.__privacyNeedsReload = false;
    if (e.sender.session) e.sender.session.__routeBlocked = false;
  } catch {}
  void navigateBrowser(e.sender, url); return true;
});
// 验证链接在后台用本账号会话打开（同一出口 IP / UA / Cookie 罐）：只跟随 Arena 认证域名内的跳转，返回最终地址
ipcMain.handle('host:authLink', async (e, u) => {
  const a = winAcct(e.sender); if (!a) return { error: '没有账号上下文' };
  let url; try { url = AuthFlow.authURL(String(u)).href; } catch (err) { return { error: String(err.message || err) }; }
  const ses = prepSession(a), hops = [];
  try {
    for (let i = 0; i < 8; i++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
      let r; try { r = await ses.fetch(url, { credentials: 'include', redirect: 'manual', cache: 'no-store', signal: ctl.signal, headers: { referer: 'https://arena.ai/' } }); } finally { clearTimeout(t); }
      try { await storeSetCookies(ses, r); } catch {}
      hops.push(r.status);
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, url);
        if (next.protocol !== 'https:' || !['arena.ai', 'auth.arena.ai'].includes(next.hostname)) { if (ses?.cookies?.flushStore) await ses.cookies.flushStore().catch(() => {}); return { final: next.href, hops, external: true }; }
        url = next.href; continue;
      }
      await r.text().catch(() => {}); await ses.cookies.flushStore().catch(() => {});
      return { final: url, status: r.status, hops };
    }
    return { final: url, hops, error: '跳转次数过多' };
  } catch (err) { return { error: err?.name === 'AbortError' ? '超时' : String(err.message || err), hops }; }
});
// 主进程原生协议请求通道（复用当前账号独立分区 Cookie 罐与代理隧道，零 DOM Cookie 污染，失败由渲染层自动兜底）
// Active 20261017.19 skew: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT' -> apiDpl 'dpl_BcGa9YULV843didEQWsFTd5taD4h'


const COST_SKEW_DPLS = [
  'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
  'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
];
const CORE_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', 'dpl_BcGa9YULV843didEQWsFTd5taD4h']);
const EXPIRED_COST_DPLS = new Set([
  'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  'dpl_ESfaucDQhCnPyQUz9QQZg82hdgNT',
  'dpl_A8xveHwwqjrHna3G4BNGYY7jqqSu',
  'dpl_9gD8cB3xQ7eTwzU2jLmVpR5kHs1Y',
  'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa',
  'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC',
  'dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct',
  'dpl_6gJxa2MLrLxAx6KcYkVgvMmbV2EA',
  'dpl_D2yWTJ2pjpQeiwvqpbtqDTpsZnY4',
  'dpl_2W47bX6FpYa8XrFCCjzBA2JNNZ4V',
  'dpl_BieRM8wzCXHw6R6ToLUsTdhu4ZBZ',
]);
let activeCostSkewDpl = COST_SKEW_DPLS[0];
let activeCostPathTpl = '/api/chat/{sid}/cost?includeSession=true';
let lastSkewDiscoverAt = 0;

function rememberCostDpl(dpl, verified = false) {
  const d = String(dpl || '').trim();
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d)) return;
  if (verified) {
    EXPIRED_COST_DPLS.delete(d);
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx > 0) COST_SKEW_DPLS.splice(idx, 1);
    if (!COST_SKEW_DPLS.includes(d)) COST_SKEW_DPLS.unshift(d);
    activeCostSkewDpl = d;
    try {
      if (DB && typeof DB === 'object') {
        if (!DB.shared || typeof DB.shared !== 'object') DB.shared = {};
        if (!DB.shared.prefs || typeof DB.shared.prefs !== 'object') DB.shared.prefs = {};
        if (DB.shared.prefs.autoCostDpl !== d) {
          DB.shared.prefs.autoCostDpl = d;
          DB.shared.prefs.autoCostPool = COST_SKEW_DPLS.filter(x => !EXPIRED_COST_DPLS.has(x)).slice(0, 12);
          if (typeof saveSoon === 'function') saveSoon();
        }
      }
    } catch {}
    return;
  }
  if (!verified && !CORE_COST_DPLS.has(d)) return;
  if (EXPIRED_COST_DPLS.has(d)) return;
  if (!COST_SKEW_DPLS.includes(d)) COST_SKEW_DPLS.push(d);
}
let lastProtoCost403At = 0;

function demoteCostDpl(dpl) {
  const d = String(dpl || '').trim();
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d) || d === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;
  const manualPin = String(DB?.shared?.prefs?.pinDpl || '').trim();
  if (manualPin && d === manualPin) return;
  if (!CORE_COST_DPLS.has(d)) {
    EXPIRED_COST_DPLS.add(d);
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx >= 0 && COST_SKEW_DPLS.length > 1) COST_SKEW_DPLS.splice(idx, 1);
  } else {
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx >= 0 && COST_SKEW_DPLS.length > 1) {
      COST_SKEW_DPLS.splice(idx, 1);
      COST_SKEW_DPLS.push(d);
    }
  }
  if (activeCostSkewDpl === d) {
    const next = COST_SKEW_DPLS.find(x => x !== d && !EXPIRED_COST_DPLS.has(x));
    if (next) activeCostSkewDpl = next;
  }
}

async function discoverFreshCostDpl(ses, force = false) {
  if (!force && Date.now() - lastSkewDiscoverAt < 45000) return null;
  lastSkewDiscoverAt = Date.now();
  // 先强制把 arena_build_bucket=stable 锁定，避免 canary 分桶导致页面和 /cost 不出账单
  try {
    const existing = await ses.cookies.get({ name: 'arena_build_bucket' }).catch(() => []);
    for (const c of existing || []) {
      if (c && (c.value !== 'stable' || c.httpOnly)) {
        const host = String(c.domain || 'arena.ai').replace(/^\.+/, '');
        if (ses?.cookies) await ses.cookies.remove('https://' + host + (c.path || '/'), 'arena_build_bucket').catch(() => {});
      }
    }
    await ses.cookies.set({
      url: 'https://arena.ai',
      name: 'arena_build_bucket',
      value: 'stable',
      path: '/',
      secure: true,
      sameSite: 'lax',
      expirationDate: Math.floor(Date.now() / 1000) + 31536000,
    }).catch(() => {});
  } catch {}
  const discovered = [];
  const collectText = text => {
    const s = String(text || '');
    if (!s) return;
    const patterns = [
      /[?&]dpl=(dpl_[A-Za-z0-9]{16,48})\b/g,
      /\\?"deploymentId\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
      /\\?"dpl\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
    ];
    for (const re of patterns) {
      for (const m of s.matchAll(re)) {
        const id = m[1];
        if (id && !EXPIRED_COST_DPLS.has(id) && !discovered.includes(id)) {
          discovered.push(id);
          rememberCostDpl(id, false);
        }
      }
    }
  };
  const probeUrls = [
    'https://arena.ai/leaderboard/agent',
    'https://arena.ai/?mode=agent',
    'https://arena.ai/',
  ];
  const fetchOneUrl = async (pUrl) => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3200);
      const r = await ses.fetch(pUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: ctl.signal,
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      }).finally(() => clearTimeout(t));
      const hdrDpl = r.headers.get('x-nextjs-deployment-id') || r.headers.get('x-deployment-id') || '';
      if (/^dpl_[A-Za-z0-9]{16,48}$/.test(hdrDpl) && !EXPIRED_COST_DPLS.has(hdrDpl) && !discovered.includes(hdrDpl)) {
        discovered.push(hdrDpl);
        rememberCostDpl(hdrDpl, false);
      }
      const html = await r.text().catch(() => '');
      collectText(html);
    } catch {}
  };
  await Promise.allSettled(probeUrls.slice(0, 2).map(fetchOneUrl));
  if (!discovered.length && probeUrls[2]) await fetchOneUrl(probeUrls[2]);
  return discovered[0] || null;
}

const mutPipIdleTimers = new Map();
function pickStandbyMutationPips(a, extraPips = [], maxCount = 6) {
  const curPip = String(a?.proxyIp || '').trim();
  const targetCc = String(a?.region || '').trim().toUpperCase();
  const poolIps = DB?.shared?.pippool?.ips;
  const sameCc = [], otherCc = [];
  if (poolIps && typeof poolIps === 'object') {
    for (const [k, e] of Object.entries(poolIps)) {
      if (!k || k === curPip || !e || e.gone || e.banned || e.ok === false) continue;
      if (e.cool && e.cool > Date.now()) continue;
      const item = { k, ok: e.ok === true ? 1 : 0, ms: Number(e.ms) || 9999 };
      if (targetCc && String(e.cc || '').toUpperCase() === targetCc) sameCc.push(item);
      else otherCc.push(item);
    }
  }
  const sortFn = (x, y) => (y.ok - x.ok) || (x.ms - y.ms);
  sameCc.sort(sortFn);
  otherCc.sort(sortFn);
  const out = [];
  const pushUnique = p => {
    const s = String(p || '').trim();
    if (s && s !== curPip && !out.includes(s)) out.push(s);
  };
  for (const p of (Array.isArray(extraPips) ? extraPips : [])) pushUnique(p);
  for (const x of sameCc) pushUnique(x.k);
  for (const x of otherCc) pushUnique(x.k);
  pushUnique('proxyip.cmliussss.net');
  pushUnique('kr.william.us.ci');
  return out.slice(0, maxCount);
}
async function getMutPipSession(slotIdx, vlessLink, pip) {
  const slot = Math.abs(Number(slotIdx) || 0) % 4;
  const tunKey = 'mut-pip-' + slot;
  const port = await ensureTunnel(tunKey, vlessLink, pip);
  if (mutPipIdleTimers.has(tunKey)) clearTimeout(mutPipIdleTimers.get(tunKey));
  mutPipIdleTimers.set(tunKey, setTimeout(() => {
    mutPipIdleTimers.delete(tunKey);
    stopTunnel(tunKey);
  }, 90000));
  const ses = session.fromPartition('mut-ses-' + slot);
  if (ses.__mutPort !== port || ses.__mutPip !== pip) {
    await ses.setProxy({ proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' });
    ses.__mutPort = port;
    ses.__mutPip = pip;
  }
  return ses;
}

ipcMain.handle('host:protoFetch', async (e, u, opt = {}) => {
  const a = winAcct(e.sender); if (!a) return { error: '没有账号上下文', fallback: true };
  const raw = String(u || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return { error: '仅支持同源协议路径', fallback: true };
  const ses = prepSession(a);
  if (ses.__routeBlocked) return { error: '当前账号线路未就绪', fallback: true };
  if (opt?.bypass429 === true) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(4000, Math.min(45000, +opt?.timeout || 18000)));
    try {
      const nowMs = Date.now();
      if (!ses.__cookieCache || nowMs - (ses.__cookieCacheAt || 0) > 8000) {
        ses.__cookieCache = await ses.cookies.get({ url: 'https://arena.ai' }).catch(() => []);
        ses.__cookieCacheAt = nowMs;
      }
      const baseCookies = (Array.isArray(ses.__cookieCache) ? ses.__cookieCache : [])
        .filter(c => c && c.name && c.name !== 'arena_visit_id' && c.name !== '__vdpl');
      const skewPool = [null, ...COST_SKEW_DPLS.filter(x => !EXPIRED_COST_DPLS.has(x))].slice(0, 3);
      const rawRoutes = Array.isArray(opt?.routes) && opt.routes.length
        ? opt.routes.filter(r => r && typeof r.path === 'string' && r.path.startsWith('/') && !r.path.startsWith('//'))
        : [{ path: raw, method: opt?.method || 'POST', body: opt?.body }];
      const routeSteps = rawRoutes.length ? rawRoutes : [{ path: raw, method: opt?.method || 'POST', body: opt?.body }];
      const mSid = new RegExp('/([0-9a-f-]{36})\\b', 'i').exec(raw);
      const referer = opt?.referer || (mSid ? 'https://arena.ai/c/' + mSid[1] : 'https://arena.ai/');

      const execStep = async (targetSes, step, skewDpl, includeCredentials) => {
        const visitId = crypto.randomUUID();
        const ckParts = baseCookies.map(c => c.name + '=' + c.value);
        ckParts.push('arena_visit_id=' + visitId);
        if (skewDpl) ckParts.push('__vdpl=' + skewDpl);
        const stepMethod = String(step.method || opt?.method || 'POST').toUpperCase();
        const stepBody = step.body !== undefined ? step.body : opt?.body;
        const hdrs = {
          Accept: 'application/json',
          Referer: referer,
          Origin: 'https://arena.ai',
          Cookie: ckParts.join('; '),
          ...(opt?.headers && typeof opt.headers === 'object' ? opt.headers : {}),
          ...(step.headers && typeof step.headers === 'object' ? step.headers : {}),
          ...(skewDpl ? { 'x-deployment-id': skewDpl } : {}),
        };
        if (stepBody !== undefined && !hdrs['Content-Type'] && !hdrs['content-type']) {
          hdrs['Content-Type'] = 'application/json';
        }
        const r = await targetSes.fetch('https://arena.ai' + step.path, {
          method: stepMethod,
          headers: hdrs,
          body: stepBody !== undefined ? String(stepBody) : undefined,
          credentials: includeCredentials ? 'include' : 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: ctl.signal,
        });
        const isB64 = opt?.responseType === 'base64';
        let text = '', base64 = '';
        if (isB64) {
          const ab = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
          base64 = Buffer.from(ab).toString('base64');
        } else {
          text = (await r.text().catch(() => '')).slice(0, 2e6);
        }
        return {
          ok: r.ok,
          status: r.status,
          text,
          base64,
          contentType: r.headers.get('content-type') || '',
          retryAfter: r.headers.get('retry-after') || '',
          ratelimitRemaining: r.headers.get('ratelimit-remaining') || '',
          ratelimitReset: r.headers.get('ratelimit-reset') || '',
          ratelimitLimit: r.headers.get('ratelimit-limit') || '',
          date: r.headers.get('date') || '',
          path: step.path,
          method: stepMethod,
        };
      };

      let lastResp = null;
      const slotSeed = Math.abs(Number(opt?.pipSlot) || 0);
      // Phase 1: Try multi-route + fresh arena_visit_id + deployment skew rotation on primary session
      for (let i = 0; i < routeSteps.length; i++) {
        const step = routeSteps[i];
        const skewDpl = skewPool[(i + slotSeed) % skewPool.length];
        try {
          const resp = await execStep(ses, step, skewDpl, true);
          lastResp = resp;
          if (resp.ok || resp.status === 404) return resp;
          if (resp.status === 401) return resp;
        } catch (stepErr) {
          if (ctl.signal.aborted) break;
        }
      }

      // Phase 2: If rate-limited (429) or challenged (403) and VLESS + standby ProxyIPs are available, rotate via isolated background ProxyIP tunnel
      const vlessLink = proxyStr(a);
      if ((!lastResp || lastResp.status === 429 || lastResp.status === 403) && /^vless:/i.test(vlessLink) && !ctl.signal.aborted) {
        const standbyPips = pickStandbyMutationPips(a, opt?.standbyPips, 4);
        for (let pIdx = 0; pIdx < Math.min(3, standbyPips.length); pIdx++) {
          if (ctl.signal.aborted) break;
          const pip = standbyPips[(pIdx + slotSeed) % standbyPips.length];
          let mutSes = null;
          try {
            mutSes = await getMutPipSession(pIdx + slotSeed, vlessLink, pip);
          } catch { continue; }
          for (let rIdx = 0; rIdx < Math.min(2, routeSteps.length); rIdx++) {
            if (ctl.signal.aborted) break;
            const step = routeSteps[rIdx];
            const skewDpl = skewPool[(pIdx + rIdx) % skewPool.length];
            try {
              const resp = await execStep(mutSes, step, skewDpl, false);
              resp.viaPip = pip;
              lastResp = resp;
              if (resp.ok || resp.status === 404) return resp;
              if (resp.status === 401) return resp;
            } catch {}
          }
        }
      }
      return lastResp || { ok: false, status: 500, error: '协议请求未响应', fallback: true };
    } catch (err) {
      return { error: err?.name === 'AbortError' ? '超时' : String(err?.message || err), fallback: true };
    } finally {
      clearTimeout(tm);
    }
  }
  const manualPinDpl = String(DB?.shared?.prefs?.pinDpl || '').trim();
  try {
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(manualPinDpl)) {
      EXPIRED_COST_DPLS.delete(manualPinDpl);
      rememberCostDpl(manualPinDpl, true);
    } else {
      const savedAutoDpl = DB?.shared?.prefs?.autoCostDpl;
      if (savedAutoDpl && /^dpl_[A-Za-z0-9]{16,48}$/.test(savedAutoDpl) && !EXPIRED_COST_DPLS.has(savedAutoDpl)) {
        rememberCostDpl(savedAutoDpl, false);
      }
    }
  } catch {}
  const targetUrl = 'https://arena.ai' + raw;
  const mSid = /\/(?:api\/(?:chat|evaluation)|ai-proxy\/realtime\/v\d+\/sessions)\/([0-9a-f-]{36})\b/i.exec(raw);
  const referer = opt?.referer || (mSid ? 'https://arena.ai/c/' + mSid[1] : 'https://arena.ai/');
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(3000, Math.min(60000, +opt?.timeout || 15000)));
  try {
    const costValue = encodeURIComponent(JSON.stringify({ 'credit-system-m1': 'cost-shown', 'credit-system-m2': 'limits-enabled' }));
    const method = String(opt?.method || 'GET').toUpperCase();
    const nowMs = Date.now();
    if (!ses.__cookieCache || nowMs - (ses.__cookieCacheAt || 0) > 8000) {
      ses.__cookieCache = await ses.cookies.get({ url: 'https://arena.ai' }).catch(() => []);
      ses.__cookieCacheAt = nowMs;
    }
    const allCookies = ses.__cookieCache;
    const reqSkew = String(opt?.skewDpl || '').trim();
    if (reqSkew && !EXPIRED_COST_DPLS.has(reqSkew)) rememberCostDpl(reqSkew, false);
    const dplCandidates = opt?.costShown === true
      ? [...new Set([
          (/^dpl_[A-Za-z0-9]{16,48}$/.test(manualPinDpl)) ? manualPinDpl : null,
          (/^dpl_[A-Za-z0-9]{16,48}$/.test(reqSkew) && !EXPIRED_COST_DPLS.has(reqSkew)) ? reqSkew : null,
          !EXPIRED_COST_DPLS.has(activeCostSkewDpl) ? activeCostSkewDpl : null,
          ...COST_SKEW_DPLS.filter(x => !EXPIRED_COST_DPLS.has(x)),
        ].filter(x => x !== null && x !== ''))].slice(0, 1)
      : [null];

    const isCostPath = opt?.costShown === true && mSid && /\/cost(?:\?|$)/i.test(raw);
    const sidVal = mSid ? mSid[1] : '';
    const buildCostPaths = baseRaw => {
      if (!isCostPath || !sidVal) return [baseRaw];
      const preferred = activeCostPathTpl.replace('{sid}', encodeURIComponent(sidVal));
      return [...new Set([
        baseRaw,
        preferred,
        `/api/chat/${encodeURIComponent(sidVal)}/cost?includeSession=true`,
        `/api/chat/${encodeURIComponent(sidVal)}/cost`,
        `/api/evaluation/${encodeURIComponent(sidVal)}/cost?includeSession=true`,
      ])];
    };
    const pathCandidates = buildCostPaths(raw);

    let lastResp = null;
    let discoveredOnce = false;
    for (let i = 0; i < dplCandidates.length; i++) {
      const skewDpl = dplCandidates[i];
      if (opt?.costShown === true && (ses.__appliedSkewDpl !== skewDpl || nowMs - (ses.__costCookieSetAt || 0) > 600000)) {
        const baseCookieStale = nowMs - (ses.__costCookieSetAt || 0) > 600000;
        ses.__appliedSkewDpl = skewDpl;
        const tasks = [];
        if (baseCookieStale) {
          ses.__costCookieSetAt = nowMs;
          // 移除可能存在的 canary httpOnly arena_build_bucket，强制锁定 stable + 2-key ph-toolbar-overrides + __vdpl
          try {
            for (const c of allCookies || []) {
              if (c && c.name === 'arena_build_bucket' && (c.value !== 'stable' || c.httpOnly)) {
                const host = String(c.domain || 'arena.ai').replace(/^\.+/, '');
                await ses.cookies.remove('https://' + host + (c.path || '/'), 'arena_build_bucket').catch(() => {});
              }
            }
          } catch {}
          tasks.push(
            ses.cookies.set({
              url: 'https://arena.ai',
              name: 'arena_build_bucket',
              value: 'stable',
              path: '/',
              secure: true,
              sameSite: 'lax',
              expirationDate: Math.floor(nowMs / 1000) + 31536000,
            }).catch(() => {}),
            ses.cookies.set({
              url: 'https://arena.ai',
              name: 'ph-toolbar-overrides',
              value: costValue,
              path: '/',
              secure: true,
              sameSite: 'lax',
              expirationDate: Math.floor(nowMs / 1000) + 2592000,
            }).catch(() => {})
          );
        }
        tasks.push(
          skewDpl ? ses.cookies.set({
            url: 'https://arena.ai',
            name: '__vdpl',
            value: skewDpl,
            path: '/',
            secure: true,
            sameSite: 'lax',
            expirationDate: Math.floor(nowMs / 1000) + 31536000,
          }).catch(() => {}) : Promise.all([
            ses.cookies.remove('https://arena.ai', '__vdpl').catch(() => {}),
            ses.cookies.remove('https://arena.ai/', '__vdpl').catch(() => {}),
          ])
        );
        await Promise.all(tasks);
      }
      const filteredCookies = Array.isArray(allCookies)
        ? allCookies.filter(c => c && c.name && (opt?.costShown !== true || (c.name !== '__vdpl' && c.name !== 'ph-toolbar-overrides' && c.name !== 'arena_build_bucket')))
        : [];
      const cookieParts = filteredCookies.map(c => c.name + '=' + c.value);
      if (opt?.costShown === true) {
        cookieParts.push('arena_build_bucket=stable');
        cookieParts.push('ph-toolbar-overrides=' + costValue);
        if (skewDpl) cookieParts.push('__vdpl=' + skewDpl);
      }
      const cookieHeader = cookieParts.join('; ');
      const headers = {
        Accept: opt?.accept || 'application/json',
        'Accept-Language': a?.fp?.lang || 'en-US,en;q=0.9',
        Referer: referer,
        'User-Agent': a?.fp?.ua || DEFAULT_UA,
        ...(method !== 'GET' && method !== 'HEAD' ? { Origin: 'https://arena.ai' } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(opt?.headers && typeof opt.headers === 'object' ? opt.headers : {}),
        ...(opt?.costShown === true && skewDpl ? { 'x-deployment-id': skewDpl } : {}),
      };
      if (opt?.body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      const curPath = pathCandidates[0];
      const baseCostPath = (opt?.costShown === true)
        ? curPath.replace(/([?&])dpl=dpl_[A-Za-z0-9]{16,48}(?:&|$)/gi, (m, p1) => (m.endsWith('&') ? p1 : '')).replace(/[?&]$/, '')
        : curPath;
      const curUrl = 'https://arena.ai' + baseCostPath;
      let r = await ses.fetch(curUrl, {
        method,
        headers,
        body: opt?.body !== undefined ? String(opt.body) : undefined,
        credentials: 'include',
        redirect: opt?.redirect || 'error',
        cache: 'no-store',
        signal: ctl.signal,
      });
      const apiDpl = r.headers.get('x-arena-api-deployment');
      if (apiDpl && r.status === 403 && !CORE_COST_DPLS.has(apiDpl)) EXPIRED_COST_DPLS.add(apiDpl);
      const isCfHtml403 = r.status === 403 && !apiDpl && new RegExp('text/html', 'i').test(r.headers.get('content-type') || '');
      if ((r.status === 429 || isCfHtml403) && opt?.costShown === true) {
        try {
          const freshVisitId = crypto.randomUUID();
          await ses.cookies.set({
            url: 'https://arena.ai',
            name: 'arena_visit_id',
            value: freshVisitId,
            path: '/',
            secure: true,
            sameSite: 'lax',
            expirationDate: Math.floor(Date.now() / 1000) + 86400 * 30,
          }).catch(() => {});
          ses.__cookieCacheAt = 0;
          await new Promise(resWait => setTimeout(resWait, 1100));
          const retryCookieParts = filteredCookies.filter(c => c.name !== 'arena_visit_id').map(c => c.name + '=' + c.value);
          retryCookieParts.push('arena_visit_id=' + freshVisitId);
          retryCookieParts.push('arena_build_bucket=stable');
          retryCookieParts.push('ph-toolbar-overrides=' + costValue);
          if (skewDpl) retryCookieParts.push('__vdpl=' + skewDpl);
          const altCostUrl = (pathCandidates[1] && pathCandidates[1] !== curPath) ? ('https://arena.ai' + pathCandidates[1]) : curUrl;
          const vlessLink = proxyStr(a);
          let targetCostSes = ses, credMode = 'include';
          if (/^vless:/i.test(vlessLink)) {
            const standbyPips = pickStandbyMutationPips(a, [], 3);
            if (standbyPips.length) {
              try {
                targetCostSes = await getMutPipSession(Date.now() % standbyPips.length, vlessLink, standbyPips[0]);
                credMode = 'omit';
              } catch {}
            }
          }
          r = await targetCostSes.fetch(altCostUrl, {
            method,
            headers: { ...headers, Cookie: retryCookieParts.join('; ') },
            body: opt?.body !== undefined ? String(opt.body) : undefined,
            credentials: credMode,
            redirect: opt?.redirect || 'error',
            cache: 'no-store',
            signal: ctl.signal,
          });
        } catch {}
      }
      if (r.headers.get('set-cookie') || (typeof r.headers.getSetCookie === 'function' && r.headers.getSetCookie().length)) {
        ses.__cookieCache = null;
        ses.__cookieCacheAt = 0;
        try {
          const scCount = await storeSetCookies(ses, r);
          if (scCount > 0) await ses.cookies.flushStore().catch(() => {});
        } catch {}
      }
      const text = await r.text();
      const contentType = r.headers.get('content-type') || '';
      const retryAfter = r.headers.get('retry-after') || '';
      lastResp = {
        ok: r.ok,
        status: r.status,
        text: text.slice(0, 4e6),
        contentType,
        retryAfter,
        headers: {
          'content-type': contentType,
          'retry-after': retryAfter,
          'x-arena-trigger-version': r.headers.get('x-arena-trigger-version') || '',
          'x-arena-api-deployment': r.headers.get('x-arena-api-deployment') || '',
        },
        date: r.headers.get('date') || '',
        skewDpl: skewDpl || undefined,
        triedAllSkew: i >= dplCandidates.length - 1,
        pool: COST_SKEW_DPLS.slice(0, 10),
      };
      if (skewDpl && r.ok) {
        lastProtoCost403At = 0;
        rememberCostDpl(skewDpl, true);
        if (sidVal && curPath) activeCostPathTpl = curPath.replace(sidVal, '{sid}');
      }
      if (r.status === 403 && opt?.costShown === true) lastProtoCost403At = Date.now();
      if (r.status !== 403 && !(opt?.costShown === true && r.status === 409)) break;
      if (skewDpl && (r.status === 403 || (opt?.costShown === true && r.status === 409))) demoteCostDpl(skewDpl);
    }
    if (false && lastResp && lastResp.status === 404 && isCostPath && pathCandidates.length > 1) {
      const bestDpl = activeCostSkewDpl || COST_SKEW_DPLS[0] || '';
      for (let pIdx = 1; pIdx < pathCandidates.length; pIdx++) {
        const altPath = pathCandidates[pIdx];
        const altUrl = 'https://arena.ai' + altPath;
        const filteredCookies = Array.isArray(allCookies)
          ? allCookies.filter(c => c && c.name && c.name !== '__vdpl' && c.name !== 'ph-toolbar-overrides')
          : [];
        const cookieParts = filteredCookies.map(c => c.name + '=' + c.value);
        cookieParts.push('ph-toolbar-overrides=' + costValue);
        if (bestDpl) cookieParts.push('__vdpl=' + bestDpl);
        const rAlt = await ses.fetch(altUrl, {
          method,
          headers: {
            Accept: opt?.accept || 'application/json',
            Referer: referer,
            Cookie: cookieParts.join('; '),
            ...(bestDpl ? { 'x-deployment-id': bestDpl } : {}),
          },
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          signal: ctl.signal,
        }).catch(() => null);
        if (rAlt && rAlt.ok) {
          const altText = await rAlt.text().catch(() => '');
          if (altText && altText.includes('"messages"')) {
            if (bestDpl) rememberCostDpl(bestDpl, true);
            activeCostPathTpl = altPath.replace(sidVal, '{sid}');
            return {
              ok: true,
              status: rAlt.status,
              text: altText.slice(0, 4e6),
              contentType: rAlt.headers.get('content-type') || '',
              skewDpl: bestDpl || undefined,
              endpointTpl: activeCostPathTpl,
              pool: COST_SKEW_DPLS.slice(0, 10),
            };
          }
        }
      }
    }
    return lastResp;
  } catch (err) {
    return { error: err?.name === 'AbortError' ? '超时' : String(err?.message || err), fallback: true };
  } finally {
    clearTimeout(tm);
  }
});
ipcMain.handle('host:back', async (e, mode) => {
  if (mode === 'browse' || mode?.browse) {
    try {
      await uaMeta(e.sender).catch(() => {});
      await e.sender.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt?browse=1*' }] }).catch(() => {});
      e.sender.session.__routeBlocked = false;
      await e.sender.loadURL(UI_URL + '?browse=1');
    } catch {}
    return true;
  }
  if(browserNavigation.finish(e.sender))return true;let target=UI_URL; try { routeActor(e,true); if(e.sender.getURL().startsWith('file:'))target=e.sender.__retryTarget?.get()||UI_URL; } catch {} void navigateAccount(e.sender,target); return true;
});
async function showExtensionPopup(owner, url) {
  const a = winAcct(owner); if (!a || owner.isDestroyed()) throw Error('账号窗口已关闭');
  await applyProxy(a);
  if (owner.isDestroyed()) throw Error('账号窗口已关闭');
  const previous = extensionPopups.get(owner); if (previous && !previous.isDestroyed()) previous.close();
  const parent = BrowserWindow.fromWebContents(owner), {x:px,y:py,width:pw} = parent.getContentBounds();
  const popup = new BrowserWindow({width:420,height:540,x:px+Math.max(0,pw-440),y:py+42,parent,show:false,autoHideMenuBar:true,title:'扩展',icon:ICON,webPreferences:{session:owner.session,contextIsolation:true,sandbox:!process.env.BRANA_NO_SANDBOX,nodeIntegration:false,spellcheck:false}});
  const wc = popup.webContents; extensionPopupOwners.set(wc,owner);extensionPopups.set(owner,popup);
  const close = () => { if (!popup.isDestroyed()) popup.close(); };
  const allowed = value => { try { return new URL(value).origin === new URL(url).origin && value.startsWith('chrome-extension://'+new URL(url).host+'/'); } catch { return false; } };
  wc.on('will-navigate',(event,target)=>{if(!allowed(target)){event.preventDefault();if(/^https:\/\//.test(target))void navigateAccount(owner,target);}});
  wc.setWindowOpenHandler(({url:target})=>{if(/^https:\/\//.test(target))void navigateAccount(owner,target);return {action:'deny'};});
  wc.__privacyFault = close;
  const navigating = (_event,_url,_inPlace,isMainFrame) => { if (isMainFrame) close(); };
  owner.once('destroyed',close);owner.on('did-start-navigation',navigating);
  popup.on('close',()=>{wc.__privacyReset?.();if(wc.debugger.isAttached())wc.debugger.detach();});
  popup.on('closed',()=>{extensionPopupOwners.delete(wc);if(extensionPopups.get(owner)===popup)extensionPopups.delete(owner);owner.removeListener('destroyed',close);owner.removeListener('did-start-navigation',navigating);});
  try { await popup.loadURL('about:blank'); await uaMeta(wc); if(owner.isDestroyed()||owner.session.__routeBlocked)throw Error('账号线路尚未就绪'); await popup.loadURL(url);popup.show();popup.focus(); }
  catch(error){close();throw error;}
}
const browserNavigation=require('./browser-navigation').setupBrowserNavigation({BrowserWindow,ipcMain,dialog,path,preload:path.join(__dirname,'preload.js'),offline:OFFLINE,clientURL:UI_URL,arena:LOGIN_URL,owners:browserRouteOwners,accountFor:winAcct,navigate:navigateBrowser,isApplying:id=>applyRoute.busy.has(id)});
require('./bookmarks-window').setupBookmarks({BrowserWindow,ipcMain,screen,store:require('./browser-bookmarks').createBookmarks(path.join(app.getPath('userData'),'bookmarks.json')),accountFor:winAcct,navigate:navigateAccount});
require('./extensions-window').setupExtensions({BrowserWindow,ipcMain,dialog,store:extensionStore,accountFor:winAcct,navigate:navigateAccount,icon:ICON,showPopup:showExtensionPopup,activateAction:(owner,id)=>{const a=winAcct(owner);if(!a)throw Error('账号已关闭');return extensionCompat.activate(a.id,id,owner);}});
ipcMain.handle('host:logout', async e => {
  const a = winAcct(e.sender); if (!a) return false;
  const ses = session.fromPartition(partOf(a.id));
  // 只清 Arena 自己的登录 Cookie（arena.ai 及其子域）；浏览器模式里登录过的其他网站（GitHub 等）保留，和普通浏览器里退出某个网站一致
  for (const c of (ses?.cookies ? await ses.cookies.get({}) : [])) { const host = String(c.domain || '').replace(/^\./, ''); if (/(^|\.)arena\.ai$/i.test(host)) await ses.cookies.remove((c.secure ? 'https://' : 'http://') + host + (c.path || '/'), c.name).catch(() => {}); }
  await ses.cookies.flushStore().catch(() => {});
  a.noAuto = true; a.status = { ...(a.status || {}), loggedIn: false, at: Date.now() }; saveDB();   // 主动退出后不再自动登录，直到重新输入密码
  void navigateAccount(e.sender); return true;
});
ipcMain.handle('host:setTitle', (e, t) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) applyWindowTaskMgrTitle(w, t); setTimeout(runNativeWorkingSetTrim, 500).unref?.(); return true; });
let _lastTrimAt = 0;
let _lastExtTrimAt = 0;
function runNativeWorkingSetTrim() {
  if (process.platform !== 'win32') return;
  const nowTs = Date.now();
  if (nowTs - _lastTrimAt < 2500) return;
  _lastTrimAt = nowTs;
  try {
    global.gc?.();
    if (typeof wins !== 'undefined' && wins instanceof Map) {
      for (const w of wins.values()) {
        if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed() && !w.webContents.isCrashed?.() && !w.webContents.isLoadingMainFrame?.() && w.webContents.mainFrame) {
          try { w.webContents.send('host:trimMem'); } catch {}
          w.webContents.executeJavaScript('try{window.__branaTrimMemory?.();globalThis.gc?.()}catch{}').catch(() => {});
        }
      }
    }
    const metrics = typeof app.getAppMetrics === 'function' ? app.getAppMetrics() : [];
    const totalWsKb = metrics.reduce((acc, m) => acc + Number(m?.memory?.workingSetSize || 0), 0);
    if (_lastExtTrimAt > 0 && nowTs - _lastExtTrimAt < 8000 && totalWsKb < 90 * 1024) return;
    _lastExtTrimAt = nowTs;
    const pids = metrics.map(m => String(m?.pid || '')).filter(Boolean);
    if (typeof KIDS !== 'undefined' && KIDS) {
      for (const k of KIDS) if (k?.pid) pids.push(String(k.pid));
    }
    if (!pids.length) return;
    const cands = [
      process.resourcesPath && path.join(process.resourcesPath, 'bin', 'win-mem-trim.exe'),
      path.join(__dirname, '..', 'resources', 'bin', 'win-mem-trim.exe'),
      path.join(__dirname, '..', 'bin', 'win-mem-trim.exe'),
      path.join(__dirname, '..', '..', '..', 'runtime-resources', 'bin', 'win-mem-trim.exe'),
    ].filter(Boolean);
    const bin = cands.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (bin) {
      const execTrim = () => {
        try {
          global.gc?.();
          require('child_process').execFile(bin, pids, { windowsHide: true, timeout: 4000 }, () => {
            try {
              if (typeof wins !== 'undefined' && wins instanceof Map) {
                for (const w of wins.values()) if (w && !w.isDestroyed() && !w.__hidden) applyWindowTaskMgrTitle(w);
              }
            } catch {}
          });
        } catch {}
      };
      setTimeout(execTrim, 240).unref?.();
      if (totalWsKb > 105 * 1024) setTimeout(execTrim, 850).unref?.();
    }
  } catch {}
}
for (const ms of [2200, 4800, 7800, 11500, 16000, 22000]) setTimeout(runNativeWorkingSetTrim, ms).unref?.();
setInterval(runNativeWorkingSetTrim, 8000).unref?.();
function formatProcessMemTag() {
  try {
    const metrics = typeof app.getAppMetrics === 'function' ? app.getAppMetrics() : [];
    let mainM = 0, renM = 0, gpuM = 0, netM = 0;
    for (const m of metrics) {
      const ws = Number(m?.memory?.workingSetSize || 0) / 1024;
      if (m.type === 'Browser') mainM += Math.max(8, Math.round(ws * 0.54));
      else if (m.type === 'Tab') renM += Math.max(20, Math.round(ws * 0.68));
      else if (m.type === 'GPU') gpuM += Math.max(10, Math.round(ws * 0.68));
      else if (m.type === 'Utility') netM += Math.max(4, Math.round(ws * 0.38));
    }
    if (mainM || renM) return `【前台窗口·对话交互】[前台进程: 1主控${mainM}M+2界面渲染${renM}M ｜ 后台进程: 3显卡加速${gpuM}M+4网络通信${netM}M]`;
  } catch {}
  return '【前台窗口·对话交互】[前台: 1主控+2界面渲染 ｜ 后台: 3显卡加速+4网络通信]';
}
function applyWindowTaskMgrTitle(w, rawSubTitle) {
  if (!w || w.isDestroyed()) return;
  if (!w.__baseAcctTitle) {
    const curT = String(w.getTitle?.() || '');
    if (curT && !curT.startsWith('【')) w.__baseAcctTitle = curT;
  }
  if (rawSubTitle !== undefined) {
    w.__customSubTitle = String(rawSubTitle || '').replace(/^【(?:1·主控进程|前台窗口)[^】]*】\s*/, '').replace(/^\[[^\]]*\]\s*(?:·\s*)?/, '').replace(/^Brana(?: AI)?(?: v1\.0)?(?: · 开发预览)?(?: ·)?\s*/, '').trim();
  }
  const baseT = w.__baseAcctTitle || APP_TITLE;
  const sub = w.__customSubTitle || '';
  const tag = formatProcessMemTag();
  w.setTitle((sub && !baseT.includes(sub) ? `${tag} · ${baseT} · ${sub}` : `${tag} · ${baseT}`).slice(0, 220));
}
setInterval(() => {
  try {
    if (typeof wins !== 'undefined' && wins instanceof Map) {
      for (const w of wins.values()) if (w && !w.isDestroyed() && !w.__hidden) applyWindowTaskMgrTitle(w);
    }
  } catch {}
}, 6000).unref?.();

// 图片：复制到剪贴板 / 另存为（对话里的附件图片、查看大图）
ipcMain.handle('host:copyImage', async (e, b64) => {
  try {
    const buf = Buffer.from(String(b64 || ''), 'base64');
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { error: '图片格式不支持' };
    if (typeof clipboard?.writeImage === 'function') {
      clipboard.writeImage(img);
      return { ok: true };
    }
    const pngBuf = img.toPNG();
    const CI = require('electron').ClipboardItem || globalThis.ClipboardItem;
    if (typeof CI === 'function' && typeof clipboard?.write === 'function') {
      await clipboard.write([new CI({ 'image/png': new Blob([pngBuf], { type: 'image/png' }) })]);
      return { ok: true };
    }
    return { error: '系统剪贴板接口不可用', fallback: true };
  } catch (err) {
    return { error: String(err.message || err), fallback: true };
  }
});
ipcMain.handle('host:saveImage', async (e, name, b64) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender), safe = String(name || 'image.png').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'image.png';
    const r = await dialog.showSaveDialog(w, { title: '保存图片', defaultPath: path.join(app.getPath('downloads'), safe), filters: [{ name: '图片', extensions: [path.extname(safe).slice(1) || 'png'] }, { name: '所有文件', extensions: ['*'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    require('fs').writeFileSync(r.filePath, Buffer.from(String(b64 || ''), 'base64')); return { ok: true, path: r.filePath };
  } catch (err) { return { error: String(err.message || err) }; }
});
// 抓日志：直接存到「下载/BranaAi-日志」，并在文件夹里选中它
// Untrusted workspace documents get an isolated, bridge-free browser session.
const WorkspacePreviews = require('./workspace-preview').install({ ipcMain, BrowserWindow, session, owner: winAcct, icon: ICON });
app.on('before-quit', () => WorkspacePreviews.closeAll());
ipcMain.handle('host:saveFile', async (e, name, mime, text) => {
  try {
    const safe = String(name || 'brana-log.json').replace(/[^\w.\-]+/g, '_').slice(-120) || 'brana-log.json';
    const dir = path.join(app.getPath('downloads'), 'BranaAi-日志'); require('fs').mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, safe); require('fs').writeFileSync(fp, String(text ?? ''), 'utf8');
    return { ok: true, path: fp };
  } catch (err) { return { error: String(err.message || err) }; }
});
// 导出对话等：系统「另存为」窗口，用户自己选文件夹和文件名；记住上次选的文件夹
let saveAsDir = null;
ipcMain.handle('host:saveAs', async (e, name, mime, text) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender), safe = String(name || 'export.md').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(0, 150) || 'export.md';
    const ext = path.extname(safe).slice(1) || 'md';
    const r = await dialog.showSaveDialog(w, { title: '导出到…', defaultPath: path.join(saveAsDir || app.getPath('documents'), safe), filters: [{ name: ext === 'md' ? 'Markdown' : ext.toUpperCase(), extensions: [ext] }, { name: '所有文件', extensions: ['*'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    require('fs').writeFileSync(r.filePath, String(text ?? ''), 'utf8'); saveAsDir = path.dirname(r.filePath);
    return { ok: true, path: r.filePath };
  } catch (err) { return { error: String(err.message || err) }; }
});
ipcMain.handle('host:showFile', (e, fp) => { try { const f = String(fp || ''); if (f && require('fs').existsSync(f)) { shell.showItemInFolder(f); return true; } } catch {} return false; });
ipcMain.handle('host:openExternal', async (e, u) => {
  if (u && typeof u === 'object' && typeof u.html === 'string') {
    try {
      const dir = path.join(app.getPath('temp'), 'brana-preview-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
      fs.mkdirSync(dir, { recursive: true });
      if (Array.isArray(u.files)) {
        for (const f of u.files) {
          if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue;
          const rel = f.path.replace(/^\/home\/user\//, '').replace(/^[\/\\]+/, '');
          const dest = path.resolve(dir, rel);
          if (!dest.startsWith(path.resolve(dir) + path.sep)) continue;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, f.content, 'utf8');
        }
      }
      let safeName = path.basename(String(u.name || u.path || 'preview.html')).replace(/[\\/:*?"<>|\r\n\t]+/g, '_') || 'preview.html';
      if (!/\.(?:html?|svg)$/i.test(safeName)) safeName += '.html';
      const target = path.join(dir, safeName);
      fs.writeFileSync(target, u.html, 'utf8');
      const fileUrl = require('url').pathToFileURL(target).href;
      try {
        await shell.openExternal(fileUrl);
      } catch {
        const err = await shell.openPath(target);
        if (err) return { ok: false, error: err };
      }
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  if (/^(https?:\/\/|mailto:)/i.test(String(u))) await shell.openExternal(String(u));
  return true;
});
ipcMain.handle('host:ready', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w.__reveal) w.__reveal();
  else if (w && !w.isVisible()) w.show();
  if (process.argv.includes('--updated') || updJustCompleted) {
    writeUpdRestartState({ step: 5, pct: 100, restartPct: 100, uiReady: true, done: true, text: '更新完成，客户端已载入并刷新就绪！' });
    if (w && !w.__updRefreshed && !w.isDestroyed()) {
      w.__updRefreshed = true;
      const openCnt = shownIds().length || (DB.open || []).length || 1;
      const msg = '🎉 更新完成（v' + VERSION + '），已恢复原有的 ' + openCnt + ' 个窗口并刷新就绪';
      setTimeout(() => {
        try {
          if (!e.sender.isDestroyed()) {
            e.sender.executeJavaScript(`try{if(window.__anc){window.__anc.History?.refresh?.();window.__anc.UI?.renderListSoon?.();window.__anc.UI?.renderTabs?.();window.__anc.toast?.(${JSON.stringify(msg)});}}catch{}`).catch(() => {});
          }
        } catch {}
      }, 350);
    }
  }
  return true;
});
ipcMain.handle('host:stage', (e, t) => { splashText(String(t || '').slice(0, 40)); return true; });
async function nodeOrDirectFetch(u, o, ds) {
  if (typeof globalThis.fetch === 'function') {
    try { return await globalThis.fetch(u, o); } catch (err) { if (o?.signal?.aborted) throw err; }
  }
  return ds ? ds.fetch(u, o) : fetch(u, o);
}
function purityCacheOpt(ds) {
  return {
    getCachedRep: ip => (ip && DB?.shared?.pippool?.rep) ? DB.shared.pippool.rep[ip] : null,
    directFetch: (u, o) => nodeOrDirectFetch(u, o, ds),
    directIppure: true,
    onCacheRep: (ip, { pure, ipa }) => {
      if (!ip || !DB?.shared?.pippool) return;
      const rep = (DB.shared.pippool.rep ||= {});
      const entry = (rep[ip] ||= {});
      const at = Date.now();
      if (pure && Number.isFinite(+pure.fs) && (!entry.pu || !entry.pu.real || pure.real || pure.via === 'ippure')) {
        entry.pu = { fs: +pure.fs, res: !!pure.res, bc: !!pure.bc, dc: !!pure.dc, org: String(pure.org || '').slice(0, 40), at, ...(pure.real ? { real: 1 } : {}), ...(pure.via ? { via: pure.via } : {}), ...(pure.basicOnly ? { basicOnly: 1 } : {}) };
      }
      if (ipa && !entry.a) {
        Object.assign(entry, { a: at, h: !!ipa.h, px: !!ipa.px, m: !!ipa.m, isp: String(ipa.isp || '').slice(0, 40), as: String(ipa.as || '').split(' ')[0].slice(0, 12) });
      }
    },
  };
}
ipcMain.handle('host:ippureDirect', async (_e, ip) => {
  try {
    const qIp = String(ip || '').trim();
    if (!qIp) return null;
    const ds = await directSession().catch(() => null);
    const pOpt = { ...purityCacheOpt(ds), forcePurity: true };
    const cached = pOpt.getCachedRep(qIp);
    const isSuspect = Boolean(cached?.pu && (cached.pu.basicOnly || (!cached.pu.real && [8, 12, 15, 16, 22, 28, 35].includes(+cached.pu.fs)) || (cached.pu.real && !cached.pu.via && !cached.pu.res && [6, 10, 14, 15, 16].includes(+cached.pu.fs))));
    if (cached?.pu && !isSuspect && Number.isFinite(+cached.pu.fs) && (Date.now() - (+cached.pu.at || 0) < 7 * 86400e3)) {
      return { ip: qIp, fs: +cached.pu.fs, res: !!cached.pu.res, bc: !!cached.pu.bc, dc: !!cached.pu.dc, org: String(cached.pu.org || ''), ...(cached.pu.real ? { real: 1 } : {}), ...(cached.pu.via ? { via: cached.pu.via } : {}) };
    }
    let r = await RouteNative.ippureDirect(qIp, 3500);
    if ((!r || !r.real || r.basicOnly || (r.via !== 'ippure' && !r.res && r.fs < 50)) && _e?.sender?.session) {
      const sesR = await RouteNative.ippure(_e.sender.session, 2800).catch(() => null);
      if (sesR && Number.isFinite(+sesR.fs) && (!sesR.ip || sesR.ip.toLowerCase() === qIp.toLowerCase())) {
        r = sesR;
      }
    }
    if (r && pOpt.onCacheRep) pOpt.onCacheRep(qIp, { pure: r });
    return r || null;
  } catch {
    return null;
  }
});
// ProxyIP 批量检测：一个 xray 进程开 N 个入口（每个入口走同一个节点 + 不同 ProxyIP），
// 每个入口 ① 读 arena.ai/cdn-cgi/trace 得出口 IP / 地区 / 延迟 ② 再请求 arena.ai/robots.txt 确认 Brana 能正常访问（不是验证页）
async function probeVia(i, port, ms, signal) {
  const ses = session.fromPartition('probe-slot-' + i);
  await ses.setProxy({ proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' });
  await ses.closeAllConnections?.().catch?.(() => {});
  await ses.clearAuthCache();
  if (signal?.aborted) return { cancelled:true };
  const get = async (url, left) => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(1500, left));
    const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try { const r = await ses.fetch(url, { signal: ctl.signal, credentials: 'omit', cache: 'no-store', redirect: 'manual' }); return { status: r.status, text: (await r.text()).slice(0, 4000) }; }
    finally { clearTimeout(tm); signal?.removeEventListener('abort',abort); }
  };
  const t0 = Date.now(), out = {};
  try {
    const t = await get('https://arena.ai/cdn-cgi/trace', ms);
    if (t.status !== 200) return { error: 'trace HTTP ' + t.status };
    const kv = Object.fromEntries(t.text.trim().split('\n').map(l => l.split('=')));
    out.ip = kv.ip || ''; out.loc = kv.loc || ''; out.ms = Date.now() - t0;
    // 延迟：第一次请求含节点握手 + ProxyIP 建连（几秒），不代表实际速度；取连接复用后的第二次请求耗时
    const t1 = Date.now(), r = await get('https://arena.ai/robots.txt', ms - (Date.now() - t0));
    out.cold = out.ms; out.ms = Math.min(out.ms, Date.now() - t1);
    out.status = r.status; out.brana = r.status === 200 && /user-agent/i.test(r.text);
    if (!out.brana) out.error = r.status === 403 || r.status === 503 ? 'Brana 返回验证页（HTTP ' + r.status + '）' : r.status === 429 ? 'Brana 限流（429）' : 'Brana 访问异常（HTTP ' + r.status + '）';
    else {
      const ds = await directSession().catch(() => null);
      Object.assign(out, await RouteNative.purity(ses, 3200, signal, out.ip, purityCacheOpt(ds)));
    }
    return out;
  } catch (err) { return { ...out, error: err.name === 'AbortError' ? '超时' : String(err.message || err).replace(/^net::/, '') }; }
}
// 订阅/公开数据也使用发起账号的会话代理；当代理不可用或断开时，订阅地址支持直连回退。
// 直连会话：固定 mode=direct，不受系统代理 / 本机代理开关影响（订阅、公开数据的直连请求用）
let directSes = null;
async function directSession() {
  if (!directSes) { const ses = session.fromPartition('brana-direct'); await ses.setProxy({ mode: 'direct' }).catch(() => {}); directSes = ses; }
  return directSes;
}
async function subscriptionTunnelPorts(_wc, a) {
  const ports = [];
  const pushPort = p => { const n = Number(p); if (Number.isInteger(n) && n > 0 && n < 65536 && !ports.includes(n)) ports.push(n); };
  const vlink = [
    proxyStr(a),
    DB?.shared?.pippool?.node,
    ...(Array.isArray(DB?.shared?.nodes?.list) ? DB.shared.nodes.list.map(n => Vless.toLink?.(n) || n?.link || '') : []),
    ...(Array.isArray(DB?.accounts) ? DB.accounts.map(x => proxyStr(x)) : [])
  ].map(s => String(s || '').trim()).find(s => /^vless:\/\//i.test(s)) || '';
  if (vlink) {
    const subTun = tunnels.get('sub-native');
    if (subTun?.port > 0 && subTun.proc?.exitCode === null) pushPort(subTun.port);
    else {
      const p = await Promise.race([ensureTunnel('sub-native', vlink, ''), new Promise(r => setTimeout(() => r(0), 3500))]).catch(() => 0);
      pushPort(p);
    }
    clearTimeout(global.__subNativeReap);
    global.__subNativeReap = setTimeout(() => { try { stopTunnel('sub-native'); } catch {} }, 25000);
  }
  if (a?.id) {
    const at = tunnels.get(a.id);
    if (at?.port > 0 && at.proc?.exitCode === null) pushPort(at.port);
  }
  for (const [k, t] of tunnels.entries()) {
    if (!String(k).startsWith('ip-test-') && t?.port > 0 && t.proc?.exitCode === null) pushPort(t.port);
  }
  return ports;
}
// Subscription bootstrap is intentionally isolated from account web sessions.
require('./subscription-ipc').setupSubscriptionFetch({ipcMain,authorize:e=>routeActor(e,true),accountFor:winAcct,tunnelPortsFor:subscriptionTunnelPorts});
ipcMain.handle('host:fetchText', async (e, url, opt) => {
  url = String(url || ''); if (!/^https?:\/\//i.test(url)) return { error: '地址不正确' };
  const publicData = opt?.publicData === true;
  if (publicData && (!/^https:\/\/whatsmyllm\.com\/(?:|data\/bank\/v[0-9]{4}\.[0-9]{1,2}\.[0-9]+\.json)$/.test(url) || opt?.method === 'POST')) return { error: '指纹数据地址不允许' };
  // 可选 POST（IP 信誉批量查询用）：{ method: 'POST', body, type }
  const post = opt && opt.method === 'POST', ex = post ? { method: 'POST', body: String(opt.body || '').slice(0, 1e6) } : {};
  const one = async (f, ua) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opt?.long === true ? 120000 : 15000);
    try {
      const r = await f(url, {
        ...ex,
        ...(publicData ? { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' } : {}),
        headers: {
          'User-Agent': ua || (publicData ? 'Mozilla/5.0 BranaAiFingerprint' : 'v2rayN/6.23'),
          Accept: '*/*',
          ...(opt?.headers && typeof opt.headers === 'object' ? opt.headers : {}),
          ...(opt?.bearer && /^https:\/\/(login\.microsoftonline\.com|outlook\.office\.com|outlook\.office365\.com|graph\.microsoft\.com)\//.test(url) ? { Authorization: 'Bearer ' + String(opt.bearer).slice(0, 8000), Accept: 'application/json' } : {}),
          ...(post ? { 'Content-Type': String(opt.type || 'application/json') } : {})
        },
        signal: ctl.signal,
        cache: 'no-store'
      });
      const text = await r.text();
      if (!r.ok) return { error: 'HTTP ' + r.status, body: text.slice(0, 4000) };
      return { text: text.slice(0, opt?.long === true ? 40e6 : 4e6), contentType: r.headers.get('content-type') || '' };
    } catch (err) {
      return { error: err?.name === 'AbortError' ? '超时' : String(err?.message || err).replace(/^net::/, '') };
    } finally {
      clearTimeout(t);
    }
  };
  const a = winAcct(e.sender) || (Array.isArray(DB?.accounts) ? (DB.accounts.find(x => x && !isDirect(proxyStr(x))) || DB.accounts[0]) : null);
  const isFixtureAccount = a && (/^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(String(proxyStr(a) || '')) || /@example\.invalid$/i.test(String(a?.email || '')));
  let r = null;
  if (a && opt?.direct !== true) {
    if (!tunnels.has(a.id) && /^vless:/i.test(proxyStr(a))) await applyProxy(a).catch(() => {});
    r = await one((u, o) => session.fromPartition(partOf(a.id)).fetch(u, o), 'v2rayN/6.23');
    // 如果代理连接失败、被关闭或重置，且非 publicData，尝试换 Clash UA
    if (!publicData && r?.error && /close|reset|tunnel|fail|refuse|connect/i.test(r.error)) {
      const rClash = await one((u, o) => session.fromPartition(partOf(a.id)).fetch(u, o), 'ClashforWindows/0.20.39');
      if (rClash && !rClash.error) return rClash;
    }
  }
  // 订阅与更新等公开资源在代理不可用、连接关闭或代理网关返回 5xx/403/429 时支持直连安全回退
  if (!isFixtureAccount && !publicData && (!r || (r.error && (!/^HTTP \d+/.test(r.error) || /^HTTP (?:5\d\d|403|429)$/.test(r.error))))) {
    // 真直连（不走系统代理 / 本机代理）；GitHub Raw 优先竞速多路国内可用 CDN 镜像
    const ds = await directSession();
    const ghM = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/i.exec(url);
    if (ghM && !post) {
      const [, ghOwner, ghRepo, ghBranch, ghPath] = ghM;
      const ghMirrors = [
        `https://testingcf.jsdelivr.net/gh/${ghOwner}/${ghRepo}@${ghBranch}/${ghPath}`,
        `https://fastly.jsdelivr.net/gh/${ghOwner}/${ghRepo}@${ghBranch}/${ghPath}`,
        `https://cdn.jsdelivr.net/gh/${ghOwner}/${ghRepo}@${ghBranch}/${ghPath}`,
        `https://gcore.jsdelivr.net/gh/${ghOwner}/${ghRepo}@${ghBranch}/${ghPath}`,
        `https://ghfast.top/${url}`,
      ];
      try {
        const rMirror = await Promise.any(ghMirrors.map(mu => one((_u, o) => ds.fetch(mu, o), 'Mozilla/5.0').then(x => { if (x && !x.error && x.text) return x; throw Error(x?.error || 'err'); })));
        if (rMirror && !rMirror.error) return rMirror;
      } catch {}
    }
    for (const ua of ['v2rayN/6.23', 'ClashforWindows/0.20.39', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36']) {
      const rDirect = await one((u, o) => ds.fetch(u, o), ua);
      if (rDirect && !rDirect.error) return rDirect;
    }
    const rSys = await one((u, o) => session.defaultSession.fetch(u, o), 'v2rayN/6.23');
    if (rSys && !rSys.error) return rSys;
  }
  if (a && opt?.direct === true && (!r || r.error)) {
    if (!tunnels.has(a.id) && /^vless:/i.test(proxyStr(a))) await applyProxy(a).catch(() => {});
    const rAcct = await one((u, o) => session.fromPartition(partOf(a.id)).fetch(u, o), 'v2rayN/6.23');
    if (rAcct && !rAcct.error) return rAcct;
  }
  return r || { error: '缺少账号代理上下文，未直连' };
});
// ---------- 客户端更新：下载（带进度、sha256 校验）→ 安装并重启 ----------
// 安装版：静默运行新安装包（装到原来的位置）后重新打开；便携版：等本程序退出后用新 exe 覆盖旧 exe 再打开
const NSIS_CRC_T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; NSIS_CRC_T[n] = c; }
function verifyNsisInstaller(file) {
  let fd = -1;
  try {
    const st = fs.statSync(file);
    fd = fs.openSync(file, 'r');
    const headLen = Math.min(st.size, 524288), head = Buffer.allocUnsafe(headLen);
    fs.readSync(fd, head, 0, headLen, 0);
    for (let off = 0; off + 28 <= headLen; off += 512) {
      if (head.readUInt32LE(off + 4) !== 0xDEADBEEF || head.toString('latin1', off + 8, off + 20) !== 'NullsoftInst') continue;
      const flags = head.readUInt32LE(off), total = head.readUInt32LE(off + 24), end = off + total;
      if (flags & 4) return { ok: true, note: 'NO_CRC', size: st.size };
      if (end > st.size) return { ok: false, err: `文件被截断：需要 ${end} 字节，实际 ${st.size} 字节` };
      const crcBuf = Buffer.allocUnsafe(4); fs.readSync(fd, crcBuf, 0, 4, end - 4);
      const want = crcBuf.readUInt32LE(0);
      let c = -1, pos = 512;
      const chunk = Buffer.allocUnsafe(Math.min(1048576, Math.max(4096, end - 4 - 512)));
      while (pos < end - 4) {
        const toRead = Math.min(chunk.length, end - 4 - pos), bytesRead = fs.readSync(fd, chunk, 0, toRead, pos);
        if (bytesRead <= 0) break;
        for (let i = 0; i < bytesRead; i++) c = NSIS_CRC_T[(c ^ chunk[i]) & 255] ^ (c >>> 8);
        pos += bytesRead;
      }
      const got = (c ^ -1) >>> 0;
      if (want !== got) return { ok: false, err: `CRC 不一致：记录 ${want.toString(16)}，实际 ${got.toString(16)}` };
      return { ok: true, size: st.size, total: end };
    }
    return { ok: false, err: '找不到 NSIS 安装包签名头' };
  } catch (err) {
    return { ok: false, err: String(err?.message || err) };
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd); } catch {} }
  }
}
const UPD = { phase: 'idle', got: 0, total: 0, error: '', file: '', kind: '' };
const updKind = () => process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'setup';
// 设备 ID：第一次用时随机生成，存在数据目录里（更新 / 重装都保留），给更新服务记录「哪台设备用了口令」
const deviceId = () => {
  const f = path.join(app.getPath('userData'), 'device-id');
  try { const v = fs.readFileSync(f, 'utf8').trim(); if (/^[\w-]{16,64}$/.test(v)) return v; } catch {}
  const v = 'pc-' + crypto.randomUUID(); try { fs.writeFileSync(f, v); } catch {} return v;
};
// 本机网络环境自检（只读）：Clash 的系统代理 / TUN 会不会影响这个账号的线路，以及「本机 → 节点」这一段连得怎么样
ipcMain.handle('host:netEnv', async e => {
  const out = { platform: process.platform }, a = winAcct(e.sender), fake = ip => /^198\.1[89]\./.test(String(ip || ''));
  try { out.systemProxy = await Promise.race([session.defaultSession.resolveProxy('https://arena.ai'), new Promise(r => setTimeout(() => r(''), 3000))]); } catch {}
  try { const ifs = os.networkInterfaces(); out.ifaces = Object.keys(ifs).filter(n => /clash|mihomo|meta|wintun|(^|[^a-z])tun|tap|utun|v2ray|sing-?box|nekoray|wireguard|zerotier|tailscale/i.test(n)); out.fakeNet = Object.values(ifs).flat().some(i => i && fake(i.address)); } catch {}
  try { const r = await Promise.race([require('dns').promises.lookup('arena.ai', { all: true }), new Promise((_, j) => setTimeout(() => j(Error('timeout')), 4000))]); out.dns = r.map(x => x.address).slice(0, 4); out.fakeIp = out.dns.some(fake); } catch (er) { out.dnsErr = String(er.message || er); }
  if (a) {
    const s = proxyStr(a), v = /^vless:/i.test(s) ? parseVless(s) : null;
    out.mode = RouteState.mode(a); out.kind = isDirect(s) ? 'direct' : v ? 'node' : 'proxy'; out.proxyIp = a.proxyIp || '';
    if (out.kind === 'proxy') { const p = parseProxy(s); try { const u = new URL(p?.rules || ''); out.proxyHost = u.hostname; out.proxyPort = u.port; } catch {} out.defaultProxy = !String(a.proxy || '').trim(); }
    const t = tunnels.get(a.id); if (t) out.xray = { running: t.proc?.exitCode === null, log: String(t.log || '').trim().slice(-900) };
    if (v) {
      out.node = { host: v.address, port: +v.port, network: v.network, security: v.security };
      try {
        const ips = await ProxyDNS.resolveBootstrap(v.address); out.node.ips = ips.slice(0, 4); out.node.fakeIp = ips.some(fake);
        const one = () => new Promise(res => { const t0 = Date.now(), c = net.connect({ host: ips[0], port: +v.port }); const done = ok => { clearTimeout(tm); c.destroy(); res(ok ? Date.now() - t0 : -1); }; const tm = setTimeout(() => done(false), 5000); c.once('connect', () => done(true)); c.once('error', () => done(false)); });
        out.node.tcp = []; for (let i = 0; i < 4; i++) out.node.tcp.push(await one());
      } catch (er) { out.node.err = String(er.message || er); }
    }
  }
  return out;
});
ipcMain.handle('host:updInfo', () => ({ kind: updKind(), canInstall: !EXTENSION_TEST.testBuild && process.platform === 'win32' && app.isPackaged, testBuild:EXTENSION_TEST.testBuild, version: VERSION, device: deviceId(), devName: (os.hostname() + ' · ' + ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || process.platform) + (updKind() === 'portable' ? ' 便携版' : '')).slice(0, 80) }));
ipcMain.handle('host:updStatus', () => ({ phase: UPD.phase, got: UPD.got, total: UPD.total, speed: UPD.speed || 0, ver: UPD.ver || '', error: UPD.error, kind: UPD.kind }));
ipcMain.handle('host:updStart', async (e, o) => {
  if(EXTENSION_TEST.testBuild)throw Error('独立扩展测试版已禁用正式通道更新；请使用单独提供的测试构建');
  if (UPD.phase === 'down' || UPD.phase === 'verify' || UPD.phase === 'install') return { ok: true, busy: true };
  const urls = (Array.isArray(o?.urls) ? o.urls : []).map(String).filter(u => /^https:\/\//i.test(u)).slice(0, 4);
  if (!urls.length) return { error: '没有下载地址' };
  const sha = String(o?.sha256 || '').toLowerCase(), size = +o?.size || 0;
  const name = String(o?.name || 'update.exe').replace(/[^\w.\-]/g, '_').slice(0, 80) || 'update.exe';
  const dir = path.join(app.getPath('temp'), 'brana-ai-update'); try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const file = path.join(dir, name), acct = winAcct(e.sender) || (Array.isArray(DB?.accounts) ? (DB.accounts.find(x => x && !isDirect(proxyStr(x))) || DB.accounts[0]) : null);
  Object.assign(UPD, { phase: 'down', got: 0, total: size, speed: 0, error: '', file: '', kind: updKind(), ver: String(o?.ver || '').slice(0, 30) });
  (async () => {
    let err = '';
    if(!acct)throw Error('缺少账号代理上下文，未直连下载');
    const candAccts = [acct, ...(Array.isArray(DB?.accounts) ? DB.accounts.filter(x => x && x.id !== acct.id && !isDirect(proxyStr(x))) : [])].slice(0, 3);
    for (const ca of candAccts) {
      if (!tunnels.has(ca.id) && !isDirect(proxyStr(ca))) await applyProxy(ca).catch(() => {});
    }
    const partFile = file + '.part';
    if (fs.existsSync(file)) {
      try {
        const st = fs.statSync(file);
        const sizeOk = !size || st.size === size;
        const nsisOk = !(updKind() === 'setup' && /\.exe$/i.test(name)) || verifyNsisInstaller(file).ok;
        let shaOk = true;
        if (sizeOk && nsisOk && sha) {
          const h0 = crypto.createHash('sha256');
          h0.update(fs.readFileSync(file));
          shaOk = h0.digest('hex').toLowerCase() === sha;
        }
        if (sizeOk && nsisOk && shaOk) {
          UPD.got = st.size; UPD.total = st.size; UPD.speed = 0; UPD.file = file; UPD.phase = 'ready'; return;
        }
      } catch {}
      try { fs.unlinkSync(file); } catch {}
    }
    const ds = await directSession().catch(() => null);
    const fetchers = [
      ...candAccts.map(ca => (u, op) => session.fromPartition(partOf(ca.id)).fetch(u, op)),
      (u, op) => nodeOrDirectFetch(u, op, ds),
      ...(ds ? [(u, op) => ds.fetch(u, op)] : []),
      (u, op) => session.defaultSession.fetch(u, op),
    ];
    for (const u of urls) for (const f of fetchers) {
      const ctl = new AbortController(); let stall = null; const kick = () => { clearTimeout(stall); stall = setTimeout(() => ctl.abort(), 30000); };
      let out = null;
      try {
        try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
        kick(); UPD.got = 0; UPD.speed = 0;
        const r = await f(u, { signal: ctl.signal, cache: 'no-store', headers: { 'User-Agent': 'BranaAi/' + VERSION } });
        if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
        const len = +r.headers.get('content-length') || size; if (len) UPD.total = len;
        const h = crypto.createHash('sha256'); out = fs.createWriteStream(partFile);
        const rd = r.body.getReader();
        let speedAt = Date.now(), speedBytes = 0;
        for (;;) {
          const { done, value } = await rd.read(); if (done) break; kick();
          h.update(value); UPD.got += value.length; speedBytes += value.length;
          const nowMs = Date.now(), dt = nowMs - speedAt;
          if (dt >= 300) {
            const inst = Math.round(speedBytes * 1000 / dt);
            UPD.speed = UPD.speed ? Math.round(UPD.speed * 0.65 + inst * 0.35) : inst;
            speedAt = nowMs; speedBytes = 0;
          }
          if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
        }
        await new Promise((res, rej) => out.end(err2 => err2 ? rej(err2) : res())); out = null;
        clearTimeout(stall);
        UPD.phase = 'verify'; UPD.speed = 0;
        const got = h.digest('hex');
        if (size && UPD.got !== size) throw new Error('文件大小不对（' + UPD.got + ' / ' + size + '）');
        if (sha && got !== sha) throw new Error('sha256 校验失败');
        if (updKind() === 'setup' && /\.exe$/i.test(name)) {
          const nsis = verifyNsisInstaller(partFile);
          if (!nsis.ok) throw new Error('NSIS 完整性校验失败：' + nsis.err);
        }
        try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
        fs.renameSync(partFile, file);
        UPD.file = file; UPD.phase = 'ready'; return;
      } catch (x) {
        clearTimeout(stall); try { out?.destroy(); } catch {}
        try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
        err = x?.name === 'AbortError' ? '下载超时（30 秒没有数据）' : String(x?.message || x); UPD.phase = 'down'; UPD.speed = 0;
      }
    }
    UPD.phase = 'error'; UPD.error = err || '下载失败';
  })().catch(error=>{UPD.phase='error';UPD.error=String(error.message||error);});
  return { ok: true };
});
// 自动安装的记录：装之前写 upd-pending.json，下次启动时对比版本号 —— 没装上就提示并给「手动安装」
const UPD_PEND = () => path.join(app.getPath('userData'), 'upd-pending.json');
const updLog = t => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), new Date().toISOString() + ' v' + VERSION + ' ' + t + '\n'); } catch {} };
let updFailed = null;
function syncSiblingInstallDirs() {
  if (process.platform !== 'win32' || !app.isPackaged || EXTENSION_TEST.testBuild) return;
  try {
    const curDir = path.dirname(process.execPath);
    const curAsar = path.join(curDir, 'resources', 'app.asar');
    if (!fs.existsSync(curAsar)) return;
    const curStat = fs.statSync(curAsar);
    const candidates = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Brana AI') : '',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Brana') : '',
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Brana AI') : '',
    ].filter(Boolean);
    for (const dir of candidates) {
      try {
        if (path.resolve(dir).toLowerCase() === path.resolve(curDir).toLowerCase()) continue;
        const dstExe = path.join(dir, path.basename(process.execPath));
        const dstAsar = path.join(dir, 'resources', 'app.asar');
        if (!fs.existsSync(dstExe) || !fs.existsSync(dstAsar)) continue;
        const dstStat = fs.statSync(dstAsar);
        if (dstStat.size !== curStat.size || Math.abs(dstStat.mtimeMs - curStat.mtimeMs) > 2000) {
          const tmpAsar = dstAsar + '.upd-' + process.pid;
          fs.copyFileSync(curAsar, tmpAsar);
          fs.renameSync(tmpAsar, dstAsar);
          const curUnpacked = curAsar + '.unpacked';
          const dstUnpacked = dstAsar + '.unpacked';
          if (fs.existsSync(curUnpacked) && typeof fs.cpSync === 'function') {
            try { fs.cpSync(curUnpacked, dstUnpacked, { recursive: true, force: true }); } catch {}
          }
          updLog('已同步多路径安装目录 app.asar → ' + dir);
        }
      } catch {}
    }
  } catch {}
}
function cleanOrphanFindProcesses() {
  if (process.platform !== 'win32' || !app.isPackaged || !global.__allowExternalFindCleanup) return;
  try {
    const psExe = fs.existsSync('C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe')
      ? 'C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe'
      : 'powershell.exe';
    spawn(psExe, [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command',
      'try { Get-CimInstance Win32_Process -Filter "Name=\'find.exe\'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match \'find(\\.exe)?"?\\s+(/I\\s+)?"?(\\d+|Brana AI\\.exe)"?\\s*$\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}'
    ], { detached: false, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}
function checkPending() {
  try { delete process.env.BRANA_UPDATING; } catch {}
  setTimeout(() => { try { cleanOrphanFindProcesses(); } catch {} }, 6000);
  if (process.argv.includes('--updated')) {
    updJustCompleted = true;
    setTimeout(syncSiblingInstallDirs, 1500);
  }
  try {
    const sessFile = updSessionPath();
    if (fs.existsSync(sessFile)) {
      const s = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
      if (Date.now() - (+s?.at || 0) < 30 * 60e3) {
        if (Array.isArray(s?.openIds) && s.openIds.length) {
          updRestoredOpen = s.openIds;
          if (s.lastId) updRestoredLast = s.lastId;
        }
        if (s?.winBounds && typeof s.winBounds === 'object') updRestoredBounds = s.winBounds;
      }
      try { fs.unlinkSync(sessFile); } catch {}
    }
  } catch {}
  try {
    const sf = updStatePath();
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
      if (Array.isArray(s?.openIds) && s.openIds.length) {
        updRestoredOpen = s.openIds;
        if (s.lastId) updRestoredLast = s.lastId;
      }
      if (!updRestoredBounds && s?.winBounds && typeof s.winBounds === 'object') updRestoredBounds = s.winBounds;
    }
  } catch {}
  let p = null; try { p = JSON.parse(fs.readFileSync(UPD_PEND(), 'utf8')); } catch { return; }
  if (Array.isArray(p?.open) && p.open.length) {
    updRestoredOpen = p.open;
    if (p.last) updRestoredLast = p.last;
  }
  if (!updRestoredBounds && p?.bounds && typeof p.bounds === 'object') updRestoredBounds = p.bounds;
  const newer = (a, b) => { const pa = String(a || '').trim().replace(/^v/i, ''), pb = String(b || '').trim().replace(/^v/i, ''); const x = pa.replace(/-.*/, '').split('.').map(Number), y = pb.replace(/-.*/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } const sa = pa.includes('-') ? pa.slice(pa.indexOf('-') + 1) : '', sb = pb.includes('-') ? pb.slice(pb.indexOf('-') + 1) : ''; if (!sa && sb) return true; if (sa && !sb) return false; return sa.localeCompare(sb, undefined, { numeric: true }) > 0; };
  if (VERSION === p.to || newer(VERSION, p.from)) {   // 装上了：清理安装包
    updJustCompleted = true;
    updLog('更新成功 ' + p.from + ' → ' + VERSION); try { fs.unlinkSync(UPD_PEND()); } catch {}
    setTimeout(syncSiblingInstallDirs, 1500);
    if (p.file && p.kind === 'setup') setTimeout(() => { if (UPD.phase === 'idle' && UPD.file !== p.file) { try { fs.unlinkSync(p.file); } catch {} } }, 5000);
    return;
  }
  if (Date.now() - (p.at || 0) > 3 * 86400e3) { try { fs.unlinkSync(UPD_PEND()); } catch {} return; }
  if (p.file && fs.existsSync(p.file) && p.kind === 'setup' && /\.exe$/i.test(p.file)) {
    const chk = verifyNsisInstaller(p.file);
    if (!chk.ok) { try { fs.unlinkSync(p.file); } catch {} }
  }
  updFailed = { ...p, exists: !!(p.file && fs.existsSync(p.file)) }; updLog('上次自动安装没成功：仍是 ' + VERSION + '（目标 ' + (p.to || '?') + '）');
  if (updFailed.exists && process.platform === 'win32') { const mk = p.file + '.opened'; if (fs.existsSync(mk)) { try { fs.unlinkSync(mk); } catch {} } }
}
function quitForUpdate() {
  try {
    captureAllWindowBounds();
    const open = shownIds();
    if (open.length) DB.open = open;
    saveDB();
  } catch {}
  quitting = true;
  for (const k of [...tunnels.keys()]) stopTunnel(k);
  killKids();
  for (const w of [...wins.values()]) destroyWindow(w);
  if (mgr && !mgr.isDestroyed()) destroyWindow(mgr);
  app.quit();
}
let updFailedAsked = false;   // 多个账号窗口：只在第一个问的窗口弹一次
ipcMain.handle('host:updFailed', () => { if (!updFailed || updFailedAsked) return null; updFailedAsked = true; return updFailed; });
// 手动安装：打开安装界面（安装版）/ 在文件夹里选中新版 exe（便携版）
ipcMain.handle('host:updManual', async () => {
  if(EXTENSION_TEST.testBuild)throw Error('独立扩展测试版已禁用正式通道更新；请使用单独提供的测试构建');
  const p = updFailed; if (!p?.file || !fs.existsSync(p.file)) return { error: '安装包已经不在了，请重新下载' };
  if (p.kind !== 'portable' && /\.exe$/i.test(p.file)) {
    const chk = verifyNsisInstaller(p.file);
    if (!chk.ok) { try { fs.unlinkSync(p.file); } catch {} try { fs.unlinkSync(UPD_PEND()); } catch {} updFailed = null; return { error: '安装包不完整或已损坏（' + chk.err + '），请重新检查更新并下载' }; }
  }
  try { fs.unlinkSync(UPD_PEND()); } catch {} updFailed = null;
  if (p.kind === 'portable') { shell.showItemInFolder(p.file); return { ok: true, folder: true, file: p.file }; }
  try { captureAllWindowBounds(); const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {}
  quitting = true;
  const appDir = path.dirname(process.execPath);
  try {
    spawn(p.file, ['/NCRC', '--updated', '--force-run', '/D=' + appDir], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(p.file),
      env: { ...process.env, BRANA_UPDATING: '1', ANC_DIR: appDir, ANC_EXE: process.execPath },
    }).unref();
  } catch (err) {
    const openErr = await shell.openPath(p.file); if (openErr) return { error: openErr };
  }
  setTimeout(async () => { quitting = true; try { captureAllWindowBounds(); const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {} for (const w of [...wins.values()]) destroyWindow(w); if (mgr && !mgr.isDestroyed()) destroyWindow(mgr); await cookiePersistence.flushAll().catch(() => {}); for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); app.exit(0); }, 500);
  return { ok: true };
});
ipcMain.handle('host:updFolder', () => { const f = updFailed?.file || UPD.file; if (!f || !fs.existsSync(f)) return { error: '安装包已经不在了，请重新下载' }; shell.showItemInFolder(f); return { ok: true, file: f }; });
ipcMain.handle('host:updDismiss', () => { try { fs.unlinkSync(UPD_PEND()); } catch {} updFailed = null; return true; });
ipcMain.handle('host:updInstall', async () => {
  if(EXTENSION_TEST.testBuild)throw Error('独立扩展测试版已禁用正式通道更新；请使用单独提供的测试构建');
  if (UPD.phase !== 'ready' || !UPD.file || !fs.existsSync(UPD.file)) return { error: '安装包还没下载好' };
  if (process.platform !== 'win32' || !app.isPackaged) return { error: '只有 Windows 正式版能自动安装', file: UPD.file };
  const kind = updKind();
  if (kind === 'setup' && /\.exe$/i.test(UPD.file)) {
    const chk = verifyNsisInstaller(UPD.file);
    if (!chk.ok) {
      try { fs.unlinkSync(UPD.file); } catch {}
      UPD.phase = 'error'; UPD.error = '安装包不完整或已损坏（' + chk.err + '），请重新下载';
      return { error: UPD.error };
    }
  }
  const openBeforeUpd = shownIds();
  const savedBounds = collectSavedWindowBounds();
  try { if (openBeforeUpd.length) DB.open = openBeforeUpd; saveDB(); } catch {}
  quitting = true;
  for (const k of [...tunnels.keys()]) stopTunnel(k); killKids();
  await Promise.race([cookiePersistence.flushAll().catch(() => {}), new Promise(r => setTimeout(r, 1200))]);
  const keepOpenIds = openBeforeUpd.length ? openBeforeUpd : (Array.isArray(DB.open) && DB.open.length ? DB.open : []);
  try { fs.writeFileSync(UPD_PEND(), JSON.stringify({ from: VERSION, to: UPD.ver || '', file: UPD.file, kind, at: Date.now(), open: keepOpenIds, last: DB.last || '', bounds: savedBounds })); } catch {}
  try {
    const updDir = path.dirname(UPD.file);
    const appDir = path.dirname(process.execPath);
    const stateFile = path.join(updDir, 'upd-state.json');
    const sessFile = path.join(updDir, 'upd-session.json');
    const progPs1 = path.join(updDir, 'brana-ai-progress.ps1');
    const psExe = fs.existsSync('C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe')
      ? 'C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe'
      : 'powershell.exe';
    try {
      fs.writeFileSync(sessFile, JSON.stringify({
        at: Date.now(),
        openIds: keepOpenIds,
        lastId: DB.last || '',
        winBounds: savedBounds,
      }), 'utf8');
      fs.writeFileSync(stateFile, JSON.stringify({
        from: VERSION,
        to: UPD.ver || '',
        step: 2,
        pct: 16,
        restartPct: 0,
        uiReady: false,
        openIds: keepOpenIds,
        openCount: Math.max(1, keepOpenIds.length),
        lastId: DB.last || '',
        winBounds: savedBounds,
        text: '正在保存原来打开的 ' + Math.max(1, keepOpenIds.length) + ' 个窗口状态并关闭旧版进程…',
        oldPid: process.pid,
        exePath: process.execPath,
      }), 'utf8');
      // 必须写入 UTF-8 BOM (\uFEFF)，防止中文 Windows PowerShell 5.1 按 GBK 解析导致 "…" 吞掉引号报语法错误
      fs.writeFileSync(progPs1, '\uFEFF' + [
        'param([string]$StatePath)',
        'try { if ($PSScriptRoot) { Set-Location -LiteralPath $PSScriptRoot } } catch {}',
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        '[System.Windows.Forms.Application]::EnableVisualStyles()',
        '$state = @{ from = ""; to = ""; step = 2; pct = 16; restartPct = 0; uiReady = $false; openCount = 1; text = "正在准备覆盖安装新版本…"; oldPid = 0; exePath = "" }',
        'if (Test-Path -LiteralPath $StatePath) { try { $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }',
        '$initExePath = [string]$state.exePath',
        '$f = New-Object System.Windows.Forms.Form',
        '$f.Text = "Brana AI 正在自动更新与重启"',
        '$f.ClientSize = New-Object System.Drawing.Size(460, 268)',
        '$f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog',
        '$f.ControlBox = $false',
        '$f.MaximizeBox = $false',
        '$f.MinimizeBox = $false',
        '$f.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
        '$f.TopMost = $true',
        '$f.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 28)',
        '$f.ForeColor = [System.Drawing.Color]::FromArgb(244, 244, 246)',
        '$fontTitle = New-Object System.Drawing.Font("Microsoft YaHei UI", 11, [System.Drawing.FontStyle]::Bold)',
        '$fontBody  = New-Object System.Drawing.Font("Microsoft YaHei UI", 9, [System.Drawing.FontStyle]::Regular)',
        '$fontSmall = New-Object System.Drawing.Font("Microsoft YaHei UI", 8.25, [System.Drawing.FontStyle]::Regular)',
        '$lblTitle = New-Object System.Windows.Forms.Label',
        '$lblTitle.Location = New-Object System.Drawing.Point(22, 16)',
        '$lblTitle.Size = New-Object System.Drawing.Size(416, 24)',
        '$lblTitle.Font = $fontTitle',
        '$verSuffix = if ($state.to) { "  (v$($state.from) -> v$($state.to))" } else { "" }',
        '$lblTitle.Text = "Brana AI 正在安装更新$verSuffix"',
        '$lblStatus = New-Object System.Windows.Forms.Label',
        '$lblStatus.Location = New-Object System.Drawing.Point(22, 42)',
        '$lblStatus.Size = New-Object System.Drawing.Size(416, 20)',
        '$lblStatus.Font = $fontBody',
        '$lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(165, 180, 252)',
        '$lblStatus.Text = [string]$state.text',
        '$lblBar1 = New-Object System.Windows.Forms.Label',
        '$lblBar1.Location = New-Object System.Drawing.Point(22, 68)',
        '$lblBar1.Size = New-Object System.Drawing.Size(320, 18)',
        '$lblBar1.Font = $fontSmall',
        '$lblBar1.ForeColor = [System.Drawing.Color]::FromArgb(210, 210, 220)',
        '$lblBar1.Text = "1. 更新安装进度"',
        '$lblPct = New-Object System.Windows.Forms.Label',
        '$lblPct.Location = New-Object System.Drawing.Point(362, 66)',
        '$lblPct.Size = New-Object System.Drawing.Size(76, 18)',
        '$lblPct.Font = $fontSmall',
        '$lblPct.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight',
        '$lblPct.Text = "16%"',
        '$barBg = New-Object System.Windows.Forms.Panel',
        '$barBg.Location = New-Object System.Drawing.Point(22, 88)',
        '$barBg.Size = New-Object System.Drawing.Size(416, 9)',
        '$barBg.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 53)',
        '$barFill = New-Object System.Windows.Forms.Panel',
        '$barFill.Location = New-Object System.Drawing.Point(0, 0)',
        '$barFill.Size = New-Object System.Drawing.Size(66, 9)',
        '$barFill.BackColor = [System.Drawing.Color]::FromArgb(99, 102, 241)',
        '$barBg.Controls.Add($barFill)',
        '$lblBar2 = New-Object System.Windows.Forms.Label',
        '$lblBar2.Location = New-Object System.Drawing.Point(22, 106)',
        '$lblBar2.Size = New-Object System.Drawing.Size(320, 18)',
        '$lblBar2.Font = $fontSmall',
        '$lblBar2.ForeColor = [System.Drawing.Color]::FromArgb(210, 210, 220)',
        '$lblBar2.Text = "2. 客户端重启与载入进度"',
        '$lblPct2 = New-Object System.Windows.Forms.Label',
        '$lblPct2.Location = New-Object System.Drawing.Point(342, 104)',
        '$lblPct2.Size = New-Object System.Drawing.Size(96, 18)',
        '$lblPct2.Font = $fontSmall',
        '$lblPct2.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight',
        '$lblPct2.Text = "等待安装…"',
        '$bar2Bg = New-Object System.Windows.Forms.Panel',
        '$bar2Bg.Location = New-Object System.Drawing.Point(22, 126)',
        '$bar2Bg.Size = New-Object System.Drawing.Size(416, 9)',
        '$bar2Bg.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 53)',
        '$bar2Fill = New-Object System.Windows.Forms.Panel',
        '$bar2Fill.Location = New-Object System.Drawing.Point(0, 0)',
        '$bar2Fill.Size = New-Object System.Drawing.Size(0, 9)',
        '$bar2Fill.BackColor = [System.Drawing.Color]::FromArgb(56, 189, 248)',
        '$bar2Bg.Controls.Add($bar2Fill)',
        '$lblSteps = New-Object System.Windows.Forms.Label',
        '$lblSteps.Location = New-Object System.Drawing.Point(22, 146)',
        '$lblSteps.Size = New-Object System.Drawing.Size(416, 82)',
        '$lblSteps.Font = $fontSmall',
        '$lblSteps.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)',
        '$lblFoot = New-Object System.Windows.Forms.Label',
        '$lblFoot.Location = New-Object System.Drawing.Point(22, 236)',
        '$lblFoot.Size = New-Object System.Drawing.Size(416, 20)',
        '$lblFoot.Font = $fontSmall',
        '$lblFoot.ForeColor = [System.Drawing.Color]::FromArgb(135, 135, 148)',
        '$lblFoot.Text = "全程自动完成，安装完毕后将自动恢复原有窗口并刷新客户端"',
        '$f.Controls.AddRange(@($lblTitle, $lblStatus, $lblBar1, $lblPct, $barBg, $lblBar2, $lblPct2, $bar2Bg, $lblSteps, $lblFoot))',
        '$t0 = [DateTime]::UtcNow',
        '$dispPct = 16.0',
        '$dispRestartPct = 0.0',
        '$step4At = $null',
        '$readyAt = $null',
        '$restarted = $false',
        '$timer = New-Object System.Windows.Forms.Timer',
        '$timer.Interval = 180',
        '$timer.Add_Tick({',
        '  $sec = [int]([DateTime]::UtcNow - $t0).TotalSeconds',
        '  if ($sec -gt 95) { $timer.Stop(); $f.Close(); return }',
        '  if (Test-Path -LiteralPath $StatePath) {',
        '    try { $s = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json; if ($s) { $script:state = $s } } catch {}',
        '  }',
        '  $st = [int]($script:state.step)',
        '  $newProcs = @()',
        '  if ($st -ge 4) {',
        '    $newProcs = @(Get-Process -Name "Brana AI" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $script:state.oldPid })',
        '  }',
        '  $targetPct = [double]($script:state.pct)',
        '  if ($st -eq 3 -and $dispPct -ge 36 -and $dispPct -lt 94) { $dispPct = [Math]::Min(94.0, $dispPct + 0.55) }',
        '  if ($st -ge 4) { $targetPct = 100.0 }',
        '  if ($targetPct -gt $dispPct) { $dispPct = $dispPct + [Math]::Max(1.5, ($targetPct - $dispPct) * 0.42) }',
        '  if ($dispPct -gt 100) { $dispPct = 100 }',
        '  $pInt = [int][Math]::Round($dispPct)',
        '  $lblPct.Text = if ($pInt -ge 100) { "100% (完成)" } else { "$pInt%" }',
        '  $barFill.Width = [int][Math]::Round(416 * $dispPct / 100.0)',
        '  if ($pInt -ge 100) { $barFill.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129) }',
        '  $winReady = $false',
        '  if ($st -ge 4) {',
        '    if (-not $script:step4At) { $script:step4At = [DateTime]::UtcNow }',
        '    $procs = @($newProcs | Where-Object { $_.MainWindowHandle -ne 0 })',
        '    if ($procs.Count -gt 0 -or $script:state.uiReady) { $winReady = $true }',
        '    $targetR = if ($winReady) { 100.0 } elseif ($script:state.restartPct) { [double]$script:state.restartPct } else { 25.0 }',
        '    if (-not $winReady -and $dispRestartPct -ge 20 -and $dispRestartPct -lt 92) { $dispRestartPct = [Math]::Min(92.0, $dispRestartPct + 1.1) }',
        '    if ($targetR -gt $dispRestartPct) { $dispRestartPct = $dispRestartPct + [Math]::Max(2.2, ($targetR - $dispRestartPct) * 0.45) }',
        '    if ($winReady) { $dispRestartPct = 100.0 }',
        '    if ($dispRestartPct -gt 100) { $dispRestartPct = 100.0 }',
        '    $rInt = [int][Math]::Round($dispRestartPct)',
        '    $lblPct2.Text = if ($rInt -ge 100) { "100% (已就绪)" } else { "$rInt%" }',
        '    $bar2Fill.Width = [int][Math]::Round(416 * $dispRestartPct / 100.0)',
        '    if ($rInt -ge 100) { $bar2Fill.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129) }',
        '    if (-not $winReady -and -not $script:restarted -and (([DateTime]::UtcNow - $script:step4At).TotalSeconds -ge 3.5)) {',
        '      $script:restarted = $true',
        '      $alive = @(Get-Process -Name "Brana AI" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $script:state.oldPid })',
        '      $runExe = if ($script:state.exePath) { [string]$script:state.exePath } else { $initExePath }',
        '      if ($alive.Count -eq 0 -and $runExe -and (Test-Path -LiteralPath $runExe)) {',
        '        try { Start-Process -FilePath $runExe -ArgumentList "--updated" } catch {}',
        '      }',
        '    }',
        '  }',
        '  if ($script:state.text) { $lblStatus.Text = [string]$script:state.text }',
        '  $openN = if ($script:state.openCount -and [int]$script:state.openCount -gt 0) { [int]$script:state.openCount } else { 1 }',
        '  $m1 = "[√] 1. 下载并校验安装包完整性"',
        '  $m2 = if ($st -gt 2) { "[√] 2. 保存原打开的 $openN 个窗口会话并关闭旧版进程" } else { "[●] 2. 正在保存原打开的 $openN 个窗口会话并关闭旧版进程…" }',
        '  $m3 = if ($st -gt 3) { "[√] 3. 静默覆盖安装新版本核心组件" } elseif ($st -eq 3) { "[●] 3. 正在静默覆盖安装新版本核心组件…" } else { "[  ] 3. 静默覆盖安装新版本核心组件" }',
        '  $m4 = if ($winReady) { "[√] 4. 已重启客户端并恢复原有 $openN 个窗口，完成刷新" } elseif ($st -ge 4) { "[●] 4. 正在重启客户端、载入更新并恢复原有 $openN 个窗口…" } else { "[  ] 4. 重启客户端、载入更新并恢复原有 $openN 个窗口" }',
        '  $lblSteps.Text = "$m1`r`n$m2`r`n$m3`r`n$m4"',
        '  $lblFoot.Text = ("已用时 {0:D2}:{1:D2} · 保持原有窗口与会话，请勿关闭" -f [int]($sec / 60), ($sec % 60))',
        '  if ($winReady) {',
        '    $lblStatus.Text = "√ 更新完成，已载入并刷新客户端！"',
        '    $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)',
        '    if (-not $script:readyAt) { $script:readyAt = [DateTime]::UtcNow }',
        '    elseif (([DateTime]::UtcNow - $script:readyAt).TotalMilliseconds -ge 650) { $timer.Stop(); $f.Close(); return }',
        '  } elseif ($script:state.err) {',
        '    $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)',
        '    if (-not $script:readyAt) { $script:readyAt = [DateTime]::UtcNow }',
        '    elseif (([DateTime]::UtcNow - $script:readyAt).TotalSeconds -ge 3.0) { $timer.Stop(); $f.Close(); return }',
        '  }',
        '})',
        '$f.Add_Shown({ try { $f.Activate() } catch {} })',
        '$timer.Start()',
        '[void]$f.ShowDialog()',
      ].join('\r\n'), 'utf8');
    } catch {}

    // 使用 CREATE_NO_WINDOW (detached:false + windowsHide:true) 启动进度窗口（彻底规避 Win11 Windows Terminal DefTerm 接管弹窗），
    // 并由 GUI 子系统的 wscript.exe 直接通过 WMI + NSIS GUI 完成进程等待与静默覆盖安装（全程零 cmd.exe / 零 find.exe 调用）
    const launchHidden = (batPath, extraEnv) => {
      const vbsPath = path.join(updDir, 'brana-ai-launch.vbs');
      const mergedEnv = {
        ...process.env,
        ...extraEnv,
        ANC_KIND: kind,
        ANC_UPD_DIR: updDir,
        ANC_PS_EXE: psExe,
        ANC_PROG_PS1: progPs1,
        ANC_BAT: batPath,
      };
      if (process.env.BRANA_UPD_PS_GUI === '1') {
        try {
          spawn(psExe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Sta', '-File', progPs1, '-StatePath', stateFile], {
            detached: false,
            stdio: 'ignore',
            windowsHide: true,
            cwd: updDir,
            env: mergedEnv,
          }).unref();
        } catch {}
      }
      const wscriptExe = fs.existsSync('C:\\Windows\\System32\\wscript.exe') ? 'C:\\Windows\\System32\\wscript.exe' : 'wscript.exe';
      try {
        fs.writeFileSync(vbsPath, [
          'On Error Resume Next',
          'Set sh = CreateObject("WScript.Shell")',
          'Set fso = CreateObject("Scripting.FileSystemObject")',
          'Set env = sh.Environment("PROCESS")',
          'sh.CurrentDirectory = env("ANC_UPD_DIR")',
          'q = Chr(34)',
          'statePath = env("ANC_STATE")',
          'fromVer = env("ANC_FROM")',
          'toVer = env("ANC_TO")',
          'openCnt = env("ANC_OPEN_CNT")',
          'If openCnt = "" Then openCnt = "1"',
          'oldPid = env("ANC_PID")',
          'If oldPid = "" Then oldPid = "0"',
          'newFile = env("ANC_NEW")',
          'oldFile = env("ANC_OLD")',
          'appDir = env("ANC_DIR")',
          'exePath = env("ANC_EXE")',
          'updKind = env("ANC_KIND")',
          '',
          'Sub WriteState(stepNum, pctNum, restartPctNum, doneRaw, errRaw, msgText)',
          '  On Error Resume Next',
          '  Dim stm, bin, jsonStr',
          '  jsonStr = "{""from"":""" & fromVer & """,""to"":""" & toVer & """,""step"":" & stepNum & ",""pct"":" & pctNum & ",""restartPct"":" & restartPctNum & ",""openCount"":" & openCnt & ",""oldPid"":" & oldPid & ",""done"":" & doneRaw & ",""err"":" & errRaw & ",""text"":""" & msgText & """}"',
          '  Set stm = CreateObject("ADODB.Stream")',
          '  stm.Type = 2',
          '  stm.Charset = "utf-8"',
          '  stm.Open',
          '  stm.WriteText jsonStr',
          '  stm.Position = 3',
          '  Set bin = CreateObject("ADODB.Stream")',
          '  bin.Type = 1',
          '  bin.Open',
          '  stm.CopyTo bin',
          '  bin.SaveToFile statePath, 2',
          '  bin.Close',
          '  stm.Close',
          'End Sub',
          '',
          'Err.Clear',
          'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
          'If Err.Number <> 0 Or (wmi Is Nothing) Then',
          '  batCmd = "cmd.exe /d /c " & q & q & env("ANC_BAT") & q & q',
          '  sh.Run batCmd, 0, False',
          '  WScript.Quit 0',
          'End If',
          '',
          'For Each fp In wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = \'find.exe\'")',
          '  cmdLine = LCase(CStr(fp.CommandLine & ""))',
          '  If InStr(cmdLine, "brana ai") > 0 Or InStr(cmdLine, q) > 0 Then fp.Terminate()',
          'Next',
          '',
          'If updKind = "portable" Then',
          '  WriteState 3, 45, 0, "false", "false", "正在替换便携版程序文件…"',
          '  copied = False',
          '  For n = 1 To 90',
          '    WScript.Sleep 1000',
          '    Err.Clear',
          '    fso.CopyFile newFile, oldFile, True',
          '    If Err.Number = 0 Then',
          '      copied = True',
          '      Exit For',
          '    End If',
          '  Next',
          '  If Not copied Then',
          '    WriteState 5, 100, 0, "true", "true", "文件被占用，请手动替换"',
          '    sh.Run "explorer.exe /select," & q & newFile & q, 1, False',
          '    WScript.Quit 1',
          '  End If',
          '  WriteState 4, 100, 24, "false", "false", "替换完成，正在启动新版客户端并恢复原有窗口…"',
          '  fso.DeleteFile newFile, True',
          '  sh.Run q & oldFile & q & " --updated", 1, False',
          '  WriteState 4, 100, 38, "false", "false", "正在载入更新并恢复原来的账号窗口…"',
          '  WScript.Quit 0',
          'End If',
          '',
          'WriteState 2, 22, 0, "false", "false", "正在关闭旧版窗口与后台进程…"',
          'For w = 1 To 24',
          '  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId = " & oldPid)',
          '  If col.Count = 0 Then Exit For',
          '  WScript.Sleep 250',
          'Next',
          'For Each p In wmi.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = " & oldPid & " OR Name = \'Brana AI.exe\' OR Name LIKE \'BranaAI%.exe\' OR Name = \'xray.exe\' OR Name = \'win-mem-trim.exe\'")',
          '  p.Terminate()',
          'Next',
          'If appDir <> "" And fso.FolderExists(appDir) Then fso.DeleteFile appDir & "\\BranaAI-*.exe", True : Err.Clear',
          'WScript.Sleep 350',
          'WriteState 3, 38, 0, "false", "false", "正在静默覆盖安装新版本核心组件…"',
          'rc = sh.Run(q & newFile & q & " /NCRC --updated /S /D=" & appDir, 0, True)',
          'If rc <> 0 Then',
          '  WriteState 3, 64, 0, "false", "false", "正在释放文件占用并自动重试静默安装…"',
          '  For Each p In wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = \'Brana AI.exe\' OR Name LIKE \'BranaAI%.exe\' OR Name = \'xray.exe\' OR Name = \'win-mem-trim.exe\'")',
          '    p.Terminate()',
          '  Next',
          '  If appDir <> "" And fso.FolderExists(appDir) Then fso.DeleteFile appDir & "\\BranaAI-*.exe", True : Err.Clear',
          '  WScript.Sleep 1500',
          '  rc = sh.Run(q & newFile & q & " /NCRC --updated /S", 0, True)',
          'End If',
          'If rc <> 0 Then',
          '  WriteState 3, 78, 0, "false", "false", "正在打开安装程序完成更新…"',
          '  rc = sh.Run(q & newFile & q & " /NCRC --updated --force-run /D=" & appDir, 1, True)',
          'End If',
          'If rc <> 0 Then',
          '  WriteState 5, 100, 0, "true", "true", "自动安装未完成，请在客户端内点击手动安装"',
          '  WScript.Quit 1',
          'End If',
          'env("BRANA_UPDATING") = ""',
          'Set alive = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name = \'Brana AI.exe\' AND ProcessId <> " & oldPid)',
          'If alive.Count > 0 Then WScript.Quit 0',
          'WriteState 4, 100, 28, "false", "false", "安装已完成，正在启动新版客户端并恢复原有窗口…"',
          'If exePath <> "" And fso.FileExists(exePath) Then',
          '  sh.Run q & exePath & q & " --updated", 1, False',
          'ElseIf fso.FileExists(sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\\Programs\\Brana AI\\Brana AI.exe")) Then',
          '  sh.Run q & sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\\Programs\\Brana AI\\Brana AI.exe") & q & " --updated", 1, False',
          'ElseIf fso.FileExists(sh.ExpandEnvironmentStrings("%ProgramFiles%\\Brana AI\\Brana AI.exe")) Then',
          '  sh.Run q & sh.ExpandEnvironmentStrings("%ProgramFiles%\\Brana AI\\Brana AI.exe") & q & " --updated", 1, False',
          'End If',
          'WScript.Quit 0',
          '',
        ].join('\r\n'), 'utf8');
        spawn(wscriptExe, ['//B', '//Nologo', vbsPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          cwd: updDir,
          env: mergedEnv,
        }).unref();
      } catch {
        spawn('cmd.exe', ['/d', '/c', batPath], {
          detached: false,
          stdio: 'ignore',
          windowsHide: true,
          cwd: updDir,
          env: mergedEnv,
        }).unref();
      }
    };

    if (kind === 'portable') {
      // 便携版：等本程序（和便携版外壳）退出后用新 exe 覆盖旧 exe 再打开；路径用环境变量传，中文路径也没问题
      const old = process.env.PORTABLE_EXECUTABLE_FILE;
      const bat = path.join(updDir, 'brana-ai-update.cmd');
      fs.writeFileSync(bat, [
        '@echo off',
        'chcp 65001 >nul 2>&1',
        'cd /d "%~dp0"',
        'set "BRANA_UPDATING=1"',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":45,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在替换便携版程序文件…"} > "%ANC_STATE%"',
        'set /a n=0',
        ':loop',
        '"%SystemRoot%\\System32\\ping.exe" -n 2 127.0.0.1 >nul 2>&1',
        'copy /y "%ANC_NEW%" "%ANC_OLD%" >nul 2>&1 && goto ok',
        'set /a n+=1',
        'if %n% lss 90 goto loop',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"done":true,"err":true,"text":"文件被占用，请手动替换"} > "%ANC_STATE%"',
        'explorer /select,"%ANC_NEW%"',
        'echo 1>"%ANC_NEW%.opened"',
        'exit /b 1',
        ':ok',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":4,"pct":100,"restartPct":24,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"替换完成，正在启动新版客户端并恢复原有窗口…"} > "%ANC_STATE%"',
        'del "%ANC_NEW%" >nul 2>&1',
        'start "" "%ANC_OLD%" --updated',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":4,"pct":100,"restartPct":38,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在载入更新并恢复原来的账号窗口…"} > "%ANC_STATE%"',
        'exit /b 0',
        ''
      ].join('\r\n'), 'utf8');
      launchHidden(bat, { BRANA_UPDATING: '1', ANC_NEW: UPD.file, ANC_OLD: old, ANC_PID: String(process.pid), ANC_OPEN_CNT: String(Math.max(1, keepOpenIds.length)), ANC_STATE: stateFile, ANC_PEND: UPD_PEND(), ANC_FROM: VERSION, ANC_TO: UPD.ver || '' });
    } else {
      // 安装版：先等待所有多账号窗口与进程彻底退出，再静默运行新安装包覆盖安装并自动重开所有已打开账号（零 find.exe 调用）
      const bat = path.join(updDir, 'brana-ai-install.cmd');
      fs.writeFileSync(bat, [
        '@echo off',
        'chcp 65001 >nul 2>&1',
        'cd /d "%~dp0"',
        'set "BRANA_UPDATING=1"',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":2,"pct":22,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在关闭旧版窗口与后台进程…"} > "%ANC_STATE%"',
        'set /a w=0',
        ':waitexit',
        'set "ANC_ALIVE="',
        'for /f "tokens=2 delims=," %%i in (\'"%SystemRoot%\\System32\\tasklist.exe" /FI "PID eq %ANC_PID%" /FO CSV /NH 2^>nul\') do if "%%~i"=="%ANC_PID%" set "ANC_ALIVE=1"',
        'if not defined ANC_ALIVE goto closed',
        '"%SystemRoot%\\System32\\ping.exe" -n 2 127.0.0.1 >nul 2>&1',
        'set /a w+=1',
        'if %w% lss 8 goto waitexit',
        '"%SystemRoot%\\System32\\taskkill.exe" /F /PID %ANC_PID% >nul 2>&1',
        ':closed',
        '"%SystemRoot%\\System32\\taskkill.exe" /F /IM "Brana AI.exe" >nul 2>&1',
        'taskkill /F /T /IM "xray.exe" >nul 2>&1',
        '"%SystemRoot%\\System32\\ping.exe" -n 2 127.0.0.1 >nul 2>&1',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":38,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在静默覆盖安装新版本核心组件…"} > "%ANC_STATE%"',
        'start "" /wait "%ANC_NEW%" /NCRC --updated /S --force-run /D=%ANC_DIR%',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":64,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在释放文件占用并自动重试静默安装…"} > "%ANC_STATE%"',
        '"%SystemRoot%\\System32\\taskkill.exe" /F /IM "Brana AI.exe" >nul 2>&1',
        'taskkill /F /T /IM "xray.exe" >nul 2>&1',
        '"%SystemRoot%\\System32\\ping.exe" -n 3 127.0.0.1 >nul 2>&1',
        'start "" /wait "%ANC_NEW%" /NCRC --updated /S --force-run',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":78,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"正在打开安装程序完成更新…"} > "%ANC_STATE%"',
        'start "" /wait "%ANC_NEW%" /NCRC --updated --force-run /D=%ANC_DIR%',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"done":true,"err":true,"text":"自动安装未完成，请在客户端内点击手动安装"} > "%ANC_STATE%"',
        'echo 1>"%ANC_NEW%.opened"',
        'exit /b 1',
        ':installed',
        'set "BRANA_UPDATING="',
        'set "ANC_RUNNING="',
        'for /f "tokens=1 delims=," %%i in (\'"%SystemRoot%\\System32\\tasklist.exe" /FI "IMAGENAME eq Brana AI.exe" /FO CSV /NH 2^>nul\') do if /I "%%~i"=="Brana AI.exe" set "ANC_RUNNING=1"',
        'if defined ANC_RUNNING exit /b 0',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":4,"pct":100,"restartPct":28,"openCount":%ANC_OPEN_CNT%,"oldPid":%ANC_PID%,"text":"安装已完成，正在启动新版客户端并恢复原有窗口…"} > "%ANC_STATE%"',
        'if exist "%ANC_EXE%" (',
        '  start "" "%ANC_EXE%" --updated',
        ') else if exist "%LOCALAPPDATA%\\Programs\\Brana AI\\Brana AI.exe" (',
        '  start "" "%LOCALAPPDATA%\\Programs\\Brana AI\\Brana AI.exe" --updated',
        ') else if exist "%ProgramFiles%\\Brana AI\\Brana AI.exe" (',
        '  start "" "%ProgramFiles%\\Brana AI\\Brana AI.exe" --updated',
        ')',
        'exit /b 0',
        ''
      ].join('\r\n'), 'utf8');
      launchHidden(bat, {
        BRANA_UPDATING: '1',
        ANC_NEW: UPD.file,
        ANC_PID: String(process.pid),
        ANC_EXE: process.execPath,
        ANC_DIR: appDir,
        ANC_OPEN_CNT: String(Math.max(1, keepOpenIds.length)),
        ANC_STATE: stateFile,
        ANC_PEND: UPD_PEND(),
        ANC_FROM: VERSION,
        ANC_TO: UPD.ver || '',
      });
    }
    updLog('开始自动安装（' + kind + '）→ ' + (UPD.ver || '?') + ' · ' + UPD.file);
  } catch (x) { updLog('启动安装失败：' + (x?.message || x)); return { error: '启动安装失败：' + (x?.message || x), file: UPD.file }; }
  UPD.phase = 'install';
  setTimeout(async () => { quitting = true; try { const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {} for (const w of [...wins.values()]) destroyWindow(w); if (mgr && !mgr.isDestroyed()) destroyWindow(mgr); await cookiePersistence.flushAll().catch(() => {}); for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); app.exit(0); }, 180);
  return { ok: true };
});
const {createPoolProbeRunner,withAbort:poolWithAbort}=require('./pool-probe-runtime');
const poolProbes=createPoolProbeRunner(async (e, o, job) => {
  const lease=job.slot;
  if(job.signal.aborted)return {cancelled:true};
  const pips = (Array.isArray(o?.pips) ? o.pips : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 32);
  if (!pips.length) return [];
  // 链式代理出口（sstp / socks5 …）多一段握手（SSTP 还有 PPP 协商），给足时间
  const ms = Math.max(pips.some(p => Vless.chainOf?.(p)) ? 15000 : 4000, Math.min(30000, +o?.timeout || 12000));
  const a = e?.sender ? winAcct(e.sender) : null;
  const isFix = Boolean(
    /127\.0\.0\.1:(?:1|9|10)\b/.test(String(o?.link || '')) ||
    (a && (/^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(String(proxyStr(a) || '')) || /@example\.invalid$/i.test(String(a?.email || ''))))
  );
  // 优先走直连检测（check.proxyip.cmliussss.net + 直连 IPPure HTTP/2 + 直连 ip-api）：不启动 xray，0 消耗 EdgeTunnel 节点请求量；
  // 仅链式代理（socks5/sstp）或直连检测接口网络不可达的条目回退到 xray 隧道实测
  const directResults = new Map();
  const directCands = (!isFix && o?.direct !== false)
    ? pips.filter(p => Boolean(p && String(p).trim()) && !Vless.chainOf?.(p) && !/^(?:\[::1\]|localhost|127\.|0\.|10\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/i.test(p))
    : [];
  if (directCands.length) {
    job.stage('probing');
    const ds = await directSession().catch(() => null);
    const dsFetch = (u, op) => nodeOrDirectFetch(u, op, ds);
    const pOpt = { ...purityCacheOpt(ds), forcePurity: pips.length <= 4, fastBatch: pips.length > 4 };
    const queue = [...directCands];
    const hasValidVless = Boolean(parseVless(o?.link));
    const runDirectWorker = async () => {
      while (queue.length && !job.signal.aborted) {
        const p = queue.shift();
        if (!p) break;
        const r = await RouteNative.checkProxyIpDirect(p, ms, job.signal, dsFetch, pOpt).catch(() => null);
        if (job.signal.aborted || r?.cancelled) return;
        if (r && (r.ip || r.error)) {
          global.__cmliuReachableAt = Date.now();
          const { pip: _pip, ...rest } = r;
          directResults.set(p, rest);
          job.publish(p, rest);
        } else if (!hasValidVless) {
          const rest = { error: '直连检测超时', status: 0, brana: false, via: 'direct-check' };
          directResults.set(p, rest);
          job.publish(p, rest);
        }
      }
    };
    if (queue.length) await Promise.all(Array.from({ length: Math.min(12, queue.length) }, runDirectWorker));
    if (job.signal.aborted) return { cancelled: true };
  }
  const remPips = pips.filter(p => !directResults.has(p));
  if (!remPips.length) {
    return pips.map(p => ({ pip: p, ...(directResults.get(p) || {}) }));
  }
  const v = parseVless(o?.link); if (!v) return directResults.size ? pips.map(p => ({ pip: p, ...(directResults.get(p) || { error: 'VLESS 节点链接不正确' }) })) : { error: 'VLESS 节点链接不正确' };
  const bin = xrayBin(); if (!bin) return directResults.size ? pips.map(p => ({ pip: p, ...(directResults.get(p) || { error: '没有找到内置 xray 内核' }) })) : { error: '没有找到内置 xray 内核' };
  const ports = []; while (ports.length < remPips.length) { if(job.signal.aborted)return {cancelled:true}; const p = await freePort(); if (!ports.includes(p)) ports.push(p); }
  let obs; try { obs = remPips.map((p, i) => ({ ...Vless.outbound(v, p), tag: 'p' + i })); } catch (err) { return { error: String(err.message || err) }; }
  const cfg = { log: { loglevel: 'warning' },
    inbounds: remPips.map((p, i) => ({ tag: 'in' + i, listen: '127.0.0.1', port: ports[i], protocol: 'socks', settings: { udp: false, auth: 'noauth' } })),
    outbounds: [...obs, { tag: 'block', protocol: 'blackhole' }],
    routing: { rules: remPips.map((p, i) => ({ type: 'field', inboundTag: ['in' + i], outboundTag: 'p' + i })) } };
  const dir = path.join(app.getPath('userData'), 'xray'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'probe-' + newId() + '.json');
  let protectedCfg;
  try { protectedCfg = await poolWithAbort(ProxyDNS.protectConfig(cfg),job.signal); } catch (err) { return { error: String(err?.message || err) }; }
  if(job.signal.aborted)return {cancelled:true};
  fs.writeFileSync(file, JSON.stringify(protectedCfg));
  const proc = track(spawn(bin, ['run', '-c', file], { cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  const stop=()=>{try{proc.kill();}catch{}};job.signal.addEventListener('abort',stop,{once:true});
  let log = ''; const onLog = d => { log = (log + d).slice(-3000); }; proc.stdout.on('data', onLog); proc.stderr.on('data', onLog); proc.on('error', err => onLog('\n' + err.message));
  try {
    const ok = await poolWithAbort(waitPort(ports[ports.length - 1], 8000),job.signal);
    if (!ok || proc.exitCode !== null) return { error: 'xray 启动失败：' + log.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 200) };
    if(job.signal.aborted)return {cancelled:true};job.stage('probing');
    const remRes = new Array(remPips.length);
    let nextIdx = 0;
    const runXrayWorker = async () => {
      while (nextIdx < remPips.length && !job.signal.aborted) {
        const i = nextIdx++;
        const p = remPips[i];
        let result;
        try {
          result = await probeVia(lease * 32 + i, ports[i], ms, job.signal);
          if (!job.signal.aborted && !(result?.ip && result?.brana) && /closed|EOF|reset|超时|SOCKET_NOT_CONNECTED/i.test(String(result?.error || ''))) {
            await new Promise(r => setTimeout(r, 220));
            if (!job.signal.aborted) {
              const retryRes = await probeVia(lease * 32 + i, ports[i], Math.min(9000, ms), job.signal).catch(() => null);
              if (retryRes && (retryRes.ip || retryRes.brana)) result = retryRes;
            }
          }
        }
        catch (err) { result = { error: String(err?.message || err) }; }
        directResults.set(p, result);
        job.publish(p, result);
        remRes[i] = { pip: p, ...result };
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, remPips.length) }, runXrayWorker));
    if (!directCands.length) return remRes;
    return pips.map(p => ({ pip: p, ...(directResults.get(p) || {}) }));
  } finally { job.signal.removeEventListener('abort',stop);stop();setTimeout(()=>{try{fs.unlinkSync(file);}catch{}},1500); }
});
ipcMain.handle('host:probe',(e,o)=>poolProbes.probe(e,o));
ipcMain.handle('host:cancelProbe',(e,id)=>poolProbes.cancel(e,id));
// ProxyIP 域名解析（直连加密 DNS，不受本机代理 / 账号线路影响）
ipcMain.handle('host:resolve', async (e, host) => { try { return await ProxyDNS.resolveAll(host); } catch { return []; } });
// 节点延迟（Clash 式 URL Test）：一个 xray 进程挂 N 个出站，并发访问 generate_204，只看连通 + 延迟，不碰 Brana、不带任何 Cookie
async function delayVia(i, port, url, ms) {
  const ses = session.fromPartition('delay-slot-' + i);
  await ses.setProxy({ proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' });
  await ses.closeAllConnections?.().catch?.(() => {});
  const once = async () => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms), t0 = Date.now();
    try { const r = await ses.fetch(url, { method: 'GET', signal: ctl.signal, credentials: 'omit', cache: 'no-store', redirect: 'manual' }); try { await r.arrayBuffer(); } catch {} return { status: r.status, ms: Date.now() - t0 }; }
    finally { clearTimeout(tm); }
  };
  try {
    const a = await once(); let b = null;
    try { b = await once(); } catch {}
    // 和 Clash 的 unified-delay 一样：第二次（连接已建立）的耗时更接近真实往返；第一次含握手，作为 cold 一起返回
    return { ok: true, status: a.status, ms: b ? Math.min(a.ms, b.ms) : a.ms, cold: a.ms };
  } catch (err) { return { ok: false, error: err.name === 'AbortError' ? '超时' : String(err.message || err).replace(/^net::/, '') }; }
}
const urlTestSlots = [0, 1];
const runUrlTest = RouteNative.createProbe(async (e, o) => {
  const lease = urlTestSlots.pop();
  let proc = null, file = '';
  try {
    const items = (Array.isArray(o?.items) ? o.items : []).slice(0, 64);
    if (!items.length) return [];
    const url = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[\w./?=&%-]*$/i.test(String(o?.url || '')) ? String(o.url) : 'https://www.gstatic.com/generate_204';
    const ms = Math.max(2000, Math.min(15000, +o?.timeout || 5000));
    const bin = xrayBin(); if (!bin) return { error: '没有找到内置 xray 内核' };
    const out = items.map(() => null), live = [];
    items.forEach((it, i) => {
      const v = parseVless(it?.link); if (!v) { out[i] = { ok: false, error: '节点链接不正确' }; return; }
      const pip = String(it?.pip || '').trim(); if (pip && !/^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i.test(pip)) { out[i] = { ok: false, error: 'ProxyIP 格式不正确' }; return; }
      try { live.push({ i, ob: { ...Vless.outbound(v, pip), tag: 'p' + i } }); } catch (err) { out[i] = { ok: false, error: String(err.message || err) }; }
    });
    if (!live.length) return out;
    const ports = []; while (ports.length < live.length) { const p = await freePort(); if (!ports.includes(p)) ports.push(p); }
    const cfg = { log: { loglevel: 'warning' },
      inbounds: live.map((x, j) => ({ tag: 'in' + x.i, listen: '127.0.0.1', port: ports[j], protocol: 'socks', settings: { udp: false, auth: 'noauth' } })),
      outbounds: [...live.map(x => x.ob), { tag: 'block', protocol: 'blackhole' }],
      routing: { rules: live.map(x => ({ type: 'field', inboundTag: ['in' + x.i], outboundTag: 'p' + x.i })) } };
    const dir = path.join(app.getPath('userData'), 'xray'); fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'delay-' + newId() + '.json');
    let protectedCfg; try { protectedCfg = await ProxyDNS.protectConfig(cfg); } catch (err) { return { error: String(err?.message || err) }; }
    fs.writeFileSync(file, JSON.stringify(protectedCfg));
    proc = track(spawn(bin, ['run', '-c', file], { cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    let log = ''; const onLog = d => { log = (log + d).slice(-3000); }; proc.stdout.on('data', onLog); proc.stderr.on('data', onLog); proc.on('error', err => onLog('\n' + err.message));
    const ok = await waitPort(ports[ports.length - 1], 8000);
    if (!ok || proc.exitCode !== null) return { error: 'xray 启动失败：' + log.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 200) };
    await Promise.all(live.map(async (x, j) => { out[x.i] = await delayVia(lease * 64 + j, ports[j], url, ms); }));
    return out;
  } finally {
    if (proc) { try { proc.kill(); } catch {} }
    if (file) setTimeout(() => { try { fs.unlinkSync(file); } catch {} }, 1500);
    urlTestSlots.push(lease);
  }
}, 2);
ipcMain.handle('host:urlTest', (e, o) => runUrlTest(e, o));

ipcMain.handle('host:testIp', async (e, a) => {
  // 用临时分区按给定代理测出口 IP，不影响现有会话
  const key = 'ip-test-' + newId(), ses = session.fromPartition(key);
  if (a?.proxy && !validProxy(a.proxy)) return { error: '代理格式不正确' };
  const tmp = { id: key, proxy: a?.proxy || '', proxyIp: a?.proxyIp || '' };
  const cfg = await proxyConfig(tmp, key); if (tmp.tunErr) { stopTunnel(key); return { error: tmp.tunErr }; }
  await ses.setProxy(cfg);
  const ctl = new AbortController(); const tm = setTimeout(() => { ctl.abort(); }, 15000);
  try {
    const r = await ses.fetch('https://arena.ai/cdn-cgi/trace', { signal: ctl.signal, cache: 'no-store' });
    const kv = Object.fromEntries((await r.text()).trim().split('\n').map(l => l.split('=')));
    return { ip: kv.ip, loc: kv.loc };
  } catch (err) {
    const msg = err.name === 'AbortError' ? '超时' : String(err.message || err).replace(/^net::/, '');
    // 节点失败：再经同一个节点访问一个不在 Cloudflare 上的网址，区分「节点不通」和「节点通、到 Brana（Cloudflare）不通 = 缺 ProxyIP」
    if (/^vless:\/\//i.test(String(a?.proxy || '').trim())) {
      const c2 = new AbortController(), t2 = setTimeout(() => c2.abort(), 8000);
      const alt = await ses.fetch('https://www.gstatic.com/generate_204', { signal: c2.signal, cache: 'no-store', redirect: 'manual' }).then(r => r.status, () => 0).finally(() => clearTimeout(t2));
      if (alt) return { code: 'needPip', error: '节点本身能连通（已访问 Google），但到 Brana 的连接被节点关闭：Brana 在 Cloudflare 上，CF Workers / Pages 类节点必须配可用的 ProxyIP 才能访问' + (String(a?.proxyIp || '').trim() ? '——这个 ProxyIP 不可用，换一个' : '——当前没有可用的 ProxyIP，先在下面「ProxyIP 池」导入（可点快速添加）') };
      const t = tunnels.get(key), line = String(t?.log || '').split(/\r?\n/).reverse().find(l => /fail|error|refused|timeout|handshake|reset|reject|invalid|closed|unreachable|EOF/i.test(l) && !/ started|accepted /.test(l));
      if (line) return { error: msg + '（xray：' + line.replace(/^\d{4}\/\d\d\/\d\d [\d:.]+ /, '').replace(/\[\d+\] /, '').slice(-260) + '）' };
    }
    return { error: msg + (!String(a?.proxy || '').trim() ? '（默认代理 127.0.0.1:7890）' : '') };
  }
  finally { clearTimeout(tm); setTimeout(() => stopTunnel(key), 500); }
});

// 本机代理自动检测：扫常用代理端口（Clash / v2rayN / sing-box 等）→ 能连上的逐个按 HTTP、SOCKS5 实测能否访问 Brana
const localScanJobs = new Map();
const runLocalScan = RouteNative.createProbe(async (e, ports) => {
  const own = new Set([...tunnels.values()].map(t => t.port).filter(Boolean));
  const list = [...new Set((Array.isArray(ports) ? ports : []).map(Number))].filter(p => p > 0 && p < 65536 && !own.has(p)).slice(0, 64);
  const open = (await Promise.all(list.map(p => new Promise(r => { const s = net.connect({ host: '127.0.0.1', port: p }); const done = ok => { try { s.destroy(); } catch {} r(ok ? p : 0); }; s.setTimeout(600, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false)); })))).filter(Boolean);
  const via = async (px, tmo) => {
    const key = 'lscan-' + px.replace(/[^\w-]/g, '_'), ses = session.fromPartition(key), p = parseProxy(px); if (!p) return null;
    await ses.closeAllConnections(); await ses.clearAuthCache(); await ses.clearStorageData();
    await ses.setProxy({ proxyRules: p.rules, proxyBypassRules: '<-loopback>' });
    const releaseGuest = guestProxyCheck(p.rules);
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), tmo), t0 = Date.now();
    try { const r = await ses.fetch('https://arena.ai/cdn-cgi/trace', { signal: ctl.signal, credentials: 'omit', cache: 'no-store' }); if (!r.ok) return null; const kv = Object.fromEntries((await r.text()).trim().split('\n').map(l => l.split('='))); return kv.ip ? { ip: kv.ip, loc: kv.loc, ms: Date.now() - t0 } : null; }
    catch { return null; } finally { clearTimeout(tm); releaseGuest(); }
  };
  // SOCKS5 握手探测（不是 SOCKS 的端口不去白等超时）
  const socks = p => new Promise(r => { const s = net.connect({ host: '127.0.0.1', port: p }); const done = ok => { try { s.destroy(); } catch {} r(ok); }; s.setTimeout(900, () => done(false)); s.once('connect', () => s.write(Buffer.from([5, 1, 0]))); s.once('data', d => done(d[0] === 5 && d[1] === 0)); s.once('error', () => done(false)); });
  const one = async p => { let r = await via('127.0.0.1:' + p, 8000); if (r) return { port: p, proxy: '127.0.0.1:' + p, ...r }; if (await socks(p)) { r = await via('socks5://127.0.0.1:' + p, 8000); if (r) return { port: p, proxy: 'socks5://127.0.0.1:' + p, ...r }; } return null; };
  return { open, list: (await Promise.all(open.slice(0, 10).map(one))).filter(Boolean) };

}, 1);
ipcMain.handle('host:localScan', (e, ports) => {
  const list = [...new Set((Array.isArray(ports) ? ports : []).map(Number))].filter(p => Number.isInteger(p) && p > 0 && p < 65536).slice(0, 64).sort((a,b)=>a-b), key = list.join(',');
  if (localScanJobs.has(key)) return localScanJobs.get(key);
  const job = runLocalScan(e, list).finally(() => localScanJobs.delete(key)); localScanJobs.set(key, job); return job;
});

ipcMain.on('host:staticBankSync', (e, id) => {
  try {
    const resolveMod = rel => {
      const baseName = path.basename(rel);
      const cands = [
        path.join(__dirname, '..', 'ui', baseName).replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1'),
        path.join(__dirname, '..', 'ui', baseName),
        path.join(__dirname, '..', rel).replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1'),
        path.join(__dirname, '..', rel),
        path.join(__dirname, '..', '..', '..', rel).replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1'),
        path.join(__dirname, '..', '..', '..', rel),
      ];
      return cands.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    };
    if (id === 'ikale' || id === 'habit') {
      const f = resolveMod(id === 'ikale' ? 'modules/habit-engine/domain/probe-bank-ikale.js' : 'modules/habit-engine/domain/habit-builtin-bank.js');
      if (f) {
        const s = fs.readFileSync(f, 'utf8').replace(/;\s*(?:Object\.defineProperty\b[\s\S]*|if\s*\(\s*typeof\s+(?:module|window|globalThis)\b[\s\S]*|module\.exports[\s\S]*)$/, '');
        const i = s.indexOf('{'), j = s.lastIndexOf('}');
        if (i !== -1 && j > i) { e.returnValue = s.slice(i, j + 1); setImmediate(() => { try { global.gc?.(); } catch {} }); return; }
      }
    } else if (id === 'whatsmyllm' || id === 'whatsmyllm-seed') {
      const f = resolveMod('modules/habit-engine/domain/probe-vendor.js');
      if (f) {
        const s = fs.readFileSync(f, 'utf8');
        const marker = id === 'whatsmyllm-seed' ? 'get seedBank()' : 'get bank()';
        const p0 = s.indexOf(marker);
        const p1 = p0 !== -1 ? s.indexOf('JSON.parse("', p0) : -1;
        const p2 = p1 !== -1 ? s.indexOf('")))', p1 + 12) : -1;
        if (p1 !== -1 && p2 > p1) {
          e.returnValue = JSON.parse(s.slice(p1 + 11, p2 + 1));
          setImmediate(() => { try { global.gc?.(); } catch {} });
          return;
        }
      }
    }
  } catch {}
  e.returnValue = '{}';
});
ipcMain.handle('host:getCred', e => { const a = winAcct(e.sender); if (!a || a.noAuto || !a.email) return null; const password = resolveAccountPw(a); return password ? { email: a.email, password } : null; });
// 官网页面里注册 / 登录时输入的密码：该账号登录成功（邮箱一致）且还没保存过有效密码时，存进账号（之后会话过期可自动重新登录）
function promoteRegPw(a, email) {
  const k = 'regpw@' + a.id, p = DB.shared?.[k];
  const mt = DB.shared?.['mailtok@' + a.id];
  const em = String(email || '').trim();
  const richEm = AuthFlow.pickRichEmail(a.email || a.name || mt?.email || p?.email, em);
  const hasValidPw = Boolean(a.pw && decPw(a.pw));
  if (p) {
    if (Date.now() - (p.at || 0) > 24 * 3600e3) { delete DB.shared[k]; saveSoon(); return; }
    if (p.email && em && !AuthFlow.sameMailbox(p.email, em)) return;
    if (p.pw && (p.src === 'web' || p.src === 'client' || !hasValidPw)) {
      const nextPlain = decPw(p.pw);
      a.pw = nextPlain ? encPw(nextPlain) : p.pw;
      a.noAuto = false; if (!a.email && richEm) a.email = richEm;
      delete DB.shared[k]; saveSoon(); return;
    }
  }
  if (!hasValidPw && mt?.pw && (!mt.email || !em || AuthFlow.sameMailbox(mt.email, em))) {
    const nextPlain = decPw(mt.pw);
    a.pw = nextPlain ? encPw(nextPlain) : mt.pw;
    a.noAuto = false; if (!a.email && richEm) a.email = richEm; saveSoon();
  }
}
ipcMain.handle('host:noteAccount', (e, o) => {
  const a = winAcct(e.sender); if (!a || !o || typeof o !== 'object') return false;
  const st = { ...(a.status || {}) };
  const prevGachaDone = +st.gacha?.done || 0;
  for (const k of ['loggedIn', 'ip', 'loc']) if (o[k] !== undefined) st[k] = o[k];
  const richNoteEmail = o.email ? AuthFlow.pickRichEmail(a.email || a.name, String(o.email)) : '';
  if (richNoteEmail) st.me = richNoteEmail;
  if (o.loggedIn === true && richNoteEmail) promoteRegPw(a, richNoteEmail);
  if (o.gacha && typeof o.gacha === 'object') {
    const g = o.gacha; st.gacha = { busy: !!g.busy, cap: !!g.cap, done: +g.done || 0, total: g.total === '∞' ? '∞' : +g.total || 0, hits: +g.hits || 0, phase: String(g.phase || '').slice(0, 80), err: String(g.err || '').slice(0, 160), last: String(g.last || '').slice(0, 80), status: String(g.status || '').slice(0, 20), at: Date.now(),
      log: (Array.isArray(g.log) ? g.log : []).slice(-12).map(x => ({ no: +x.no || 0, draw: +x.draw || 0, at: +x.at || 0, model: String(x.model || '').slice(0, 80), tier: String(x.tier || '').slice(0, 20), verdict: String(x.verdict || '').slice(0, 20), archived: !!x.archived, note: String(x.note || '').slice(0, 120) })) };
    // 后台抽卡结束：隐藏窗口 1 分钟后自动关闭（释放内存）
    const w = wins.get(a.id);
    if (w && !w.isDestroyed() && w.__hidden) { clearTimeout(w.__reap); if (!g.busy && !w.__stats) w.__reap = setTimeout(() => { if (!w.isDestroyed() && w.__hidden && !w.__stats && !a.status?.gacha?.busy) destroyWindow(w); }, 60000); }
  }
  // 账号统计（本账号窗口自己算的：各厂商 / 各型号对话数、每个对话轮数），账号管理窗口和手机启动页用
  if (o.stats && typeof o.stats === 'object' && ((+o.stats.total || 0) > 0 || !(+st.stats?.total || 0))) { try { const js = JSON.stringify(o.stats); if (js.length < 800000) st.stats = JSON.parse(js); } catch {} }
  if (o.statsBusy !== undefined) st.statsBusy = String(o.statsBusy || '').slice(0, 60);
  if (o.statsDone) {
    st.statsBusy = ''; st.statsErr = String(o.statsErr || '').slice(0, 120); st.statsAt = Date.now();
    // 为统计在后台打开的隐藏窗口：统计完就关掉（在抽卡的不关）
    const w = wins.get(a.id);
    if (w && !w.isDestroyed()) { w.__stats = false; if (w.__hidden) { clearTimeout(w.__reap); w.__reap = setTimeout(() => { if (!w.isDestroyed() && w.__hidden && !w.__stats && !a.status?.gacha?.busy) destroyWindow(w); }, 5000); } }
  }
  if (o.quota && typeof o.quota === 'object') st.quota = { ...(st.quota || {}), ...Object.fromEntries(Object.entries(o.quota).filter(([, v]) => v != null)) };
  st.at = Date.now(); a.status = st;
  if (o.loggedIn && a.noAuto) a.noAuto = false;
  if (!a.email && richNoteEmail && !byEmail(richNoteEmail)) a.email = richNoteEmail;
  const isTransient = Boolean((o.statsBusy && !o.stats && !o.statsDone) || (o.gacha?.busy && prevGachaDone === (+o.gacha.done || 0))) && !o.loggedIn && !o.email && !o.ip && !o.loc && !o.quota;
  saveSoon(isTransient ? 5000 : 800); return true;
});
// 推理分样本：所有账号共用一份（各账号窗口各自记录，统一在这里合并），{ 型号: [样本] } + 清除记录（清除时间之前的样本不再合并回来）
ipcMain.handle('host:strMerge', (e, patch) => {
  const d = DB.strs && typeof DB.strs === 'object' && DB.strs.S ? DB.strs : (DB.strs = { S: {}, clr: {} });
  if (patch && typeof patch === 'object' && Object.keys(patch).length) {
    const S = d.S, clr = d.clr, t = Date.now();
    if (patch.__clear === '*') { for (const k of Object.keys(S)) delete S[k]; clr['*'] = t; }
    else if (typeof patch.__clear === 'string') { delete S[patch.__clear]; clr[patch.__clear] = t; }
    for (const [name, rows] of Object.entries(patch)) {
      if (name.startsWith('__') || !Array.isArray(rows) || name.length > 120) continue;
      const cut = Math.max(clr['*'] || 0, clr[name] || 0), arr = S[name] ||= [];
      for (const r of rows) { if (!r || typeof r.k !== 'string' || (r.at || 0) <= cut) continue; const j = arr.findIndex(x => x.k === r.k); if (j >= 0) arr[j] = r; else arr.push(r); }
      arr.sort((a, b) => (a.at || 0) - (b.at || 0)); if (arr.length > 40) arr.splice(0, arr.length - 40);
    }
    saveSoon();
  }
  return d.S;
});
// 强度分校准样本：所有账号共用一份，{ rows: [样本], clr: 清空时间 }；样本按 k 合并，del = 删除
ipcMain.handle('host:calMerge', (e, patch) => {
  const d = DB.cal && Array.isArray(DB.cal.rows) ? DB.cal : (DB.cal = { rows: [], clr: 0 });
  if (patch && typeof patch === 'object') {
    let dirty = false;
    if (patch.clear) { d.rows = []; d.clr = Number.isFinite(+patch.clear) && +patch.clear > 1e12 && +patch.clear <= Date.now() + 60000 ? +patch.clear : Date.now(); dirty = true; }
    const rows = Array.isArray(patch.rows) ? patch.rows.slice(0, 200) : [];
    if (rows.length) {
      const by = new Map(d.rows.map(r => [r.k, r]));
      for (const r of rows) { if (!r || typeof r.k !== 'string' || r.k.length > 200) continue; if (r.del) by.delete(r.k); else if ((r.at || 0) > (d.clr || 0)) by.set(r.k, r); }
      d.rows = [...by.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-800); dirty = true;
    }
    if (dirty) saveSoon();
  }
  return d;
});
let sharedFingerprints;
ipcMain.handle('host:fingerprintStore', async (e,op,revision,payload) => {
  try { sharedFingerprints ||= new (require('./fingerprint-store').FingerprintStore)(path.join(app.getPath('userData'),'fingerprint-library-v1.json')); return await sharedFingerprints.request(op,revision,payload); }
  catch(err){return {error:String(err.message||err)};}
});
function cleanPelModel(s) { return String(s || '').replace(/\?+$/, '').trim(); }
function isBetterPelModel(cand, cur) {
  const a = cleanPelModel(cand), b = cleanPelModel(cur);
  if (!a || a === '未识别' || a === '开源模型') return false;
  if (!b || b === '未识别' || b === '开源模型' || /\?$/.test(String(cur || ''))) return true;
  return a !== b && a.length >= b.length;
}
function mergePelicanMapInto(dst, src) {
  if (!src || typeof src !== 'object') return false;
  let ch = false;
  for (const [sid, r] of Object.entries(src)) {
    if (!sid || !r || typeof r !== 'object') continue;
    const cur = dst[sid];
    const nextName = isBetterPelModel(r.name, cur?.name) ? cleanPelModel(r.name) : (cleanPelModel(cur?.name) || cleanPelModel(r.name) || '未识别');
    const nextScore = r.score ?? cur?.score ?? null;
    const nextThink = r.think ?? cur?.think ?? 0;
    const nextThought = r.thought ?? cur?.thought ?? 0;
    const nextAt = Math.max(Number(r.at) || 0, Number(cur?.at) || 0);
    if (!cur || cur.name !== nextName || cur.score !== nextScore || cur.think !== nextThink || cur.at !== nextAt) {
      dst[sid] = { ...(cur || {}), ...r, name: nextName, score: nextScore, think: nextThink, thought: nextThought, at: nextAt || Date.now() };
      ch = true;
    }
  }
  return ch;
}
function mergeSharedPelshots(v, sender = null, { broadcast = true } = {}) {
  DB.shared = DB.shared || {};
  const prev = DB.shared.pelshots && typeof DB.shared.pelshots === 'object' && !Array.isArray(DB.shared.pelshots)
    ? DB.shared.pelshots
    : { rows: Array.isArray(DB.shared.pelshots) ? DB.shared.pelshots : [], del: {}, pelican: {}, at: 0 };
  const del = { ...(prev.del && typeof prev.del === 'object' ? prev.del : {}) };
  const pelMap = { ...(DB.shared.pelican && typeof DB.shared.pelican === 'object' ? DB.shared.pelican : {}), ...(prev.pelican && typeof prev.pelican === 'object' ? prev.pelican : {}) };
  if (v === null) {
    DB.shared.pelshots = { rows: [], del, pelican: pelMap, at: Date.now() };
    saveSoon();
    return true;
  }
  const inObj = v && typeof v === 'object' && !Array.isArray(v) ? v : { rows: Array.isArray(v) ? v : [] };
  const isImport = !!inObj.import;
  if (inObj.del && typeof inObj.del === 'object') {
    for (const [id, ts] of Object.entries(inObj.del)) if (id && Number(ts) > (del[id] || 0)) del[id] = Number(ts);
  }
  if (inObj.pelican && typeof inObj.pelican === 'object') mergePelicanMapInto(pelMap, inObj.pelican);
  const modelsMap = inObj.models && typeof inObj.models === 'object' ? inObj.models : null;
  const acctLabel = String(inObj.acct || '').trim();
  const inRows = Array.isArray(inObj.rows) ? inObj.rows : [];
  if (isImport) {
    for (const r of inRows) if (r?.id && del[r.id]) delete del[r.id];
  }
  const byId = new Map(), bySig = new Map();
  const enrich = (r, fallbackAcct = '') => {
    if (!r || typeof r !== 'object' || typeof r.url !== 'string' || !/^data:image\//i.test(r.url)) return null;
    const id = String(r.id || '').trim() || ((r.sid || 'pel') + '-' + (r.at || 0));
    if (del[id]) return null;
    const sid = r.sid ? String(r.sid) : null;
    const mEntry = sid && modelsMap ? modelsMap[sid] : null;
    const pEntry = sid ? pelMap[sid] : null;
    const liveName = cleanPelModel(mEntry?.name || pEntry?.name || '');
    const model = isBetterPelModel(liveName, r.model) ? liveName : (cleanPelModel(r.model) || liveName || '未识别');
    const score = pEntry?.score ?? mEntry?.fingerprint?.reasoning?.score ?? mEntry?.reverseScore ?? r.score ?? null;
    const think = pEntry?.think ?? r.think ?? null;
    const acctName = String(r.acct || fallbackAcct || '').trim();
    return {
      ...r,
      id,
      at: Number(r.at) || Date.now(),
      sid,
      model,
      score: score != null && Number.isFinite(+score) ? +score : null,
      think: think != null && Number.isFinite(+think) ? +think : null,
      file: String(r.file || 'index.html'),
      auto: !!r.auto,
      ...(acctName ? { acct: acctName } : {}),
    };
  };
  const putRow = (rawRow, fallbackAcct = '') => {
    const r = enrich(rawRow, fallbackAcct);
    if (!r) return;
    const sig = (r.sid || r.model || '') + '|' + (r.at || 0) + '|' + (r.file || '') + '|' + r.url.slice(-120);
    const ex = byId.get(r.id) || bySig.get(sig);
    if (!ex) {
      byId.set(r.id, r);
      bySig.set(sig, r);
      return;
    }
    const merged = {
      ...ex,
      ...r,
      id: ex.id || r.id,
      at: Math.max(ex.at || 0, r.at || 0),
      model: isBetterPelModel(r.model, ex.model) ? r.model : (ex.model || r.model || '未识别'),
      score: r.score ?? ex.score ?? null,
      think: r.think ?? ex.think ?? null,
      acct: ex.acct || r.acct || '',
    };
    byId.set(merged.id, merged);
    bySig.set(sig, merged);
  };
  for (const r of (Array.isArray(prev.rows) ? prev.rows : [])) putRow(r, '');
  for (const r of inRows) putRow(r, acctLabel);
  const rows = [...byId.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 240);
  const pelStateSig = (rs, d, p) => {
    const rKey = (Array.isArray(rs) ? rs : []).map(x => `${x.id}|${x.at || 0}|${x.model || ''}|${x.score ?? ''}|${x.think ?? ''}|${x.acct || ''}|${x.url ? x.url.length : 0}`).join('\n');
    const dKey = Object.keys(d || {}).sort().map(k => `${k}:${d[k]}`).join(',');
    const pKey = Object.keys(p || {}).sort().map(k => `${k}:${p[k]?.name || ''}:${p[k]?.score ?? ''}:${p[k]?.at || 0}`).join(',');
    return `${rKey}#${dKey}#${pKey}`;
  };
  const prevSig = Array.isArray(prev?.rows) ? pelStateSig(prev.rows, prev.del, prev.pelican) : '';
  const nextSig = pelStateSig(rows, del, pelMap);
  DB.shared.pelican = pelMap;
  if (prevSig && prevSig === nextSig && !isImport) {
    if (typeof savePelshotsSoon === 'function') delete DB.shared.pelshots;
    if (inObj.harvest && typeof harvestAccountPelicanSoon === 'function') harvestAccountPelicanSoon(true);
    return true;
  }
  const nextPelObj = { rows, del, pelican: pelMap, at: Date.now() };
  if (typeof savePelshotsSoon === 'function') {
    savePelshotsSoon(nextPelObj);
    delete DB.shared.pelshots;
  } else {
    DB.shared.pelshots = nextPelObj;
  }
  saveSoon();
  if (broadcast && typeof BrowserWindow !== 'undefined') {
    const cmd = { pelshotsSync: true, at: nextPelObj.at };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== sender) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
  }
  if (inObj.harvest && typeof harvestAccountPelicanSoon === 'function') harvestAccountPelicanSoon(true);
  return true;
}
let pelHarvesting = false, pelHarvestedOnce = false;
function harvestAccountPelicanSoon(force = false) {
  if (pelHarvesting || (!force && pelHarvestedOnce)) return;
  if (process.env.BRANA_EXTENSION_TEST_DATA || typeof app === 'undefined' || !app.isReady?.()) return;
  if (!force && Array.isArray(DB?.accounts) && DB.accounts.every(a => !a?.id || a.pelHarvested)) {
    pelHarvestedOnce = true;
    return;
  }
  pelHarvesting = true;
  pelHarvestedOnce = true;
  setTimeout(async () => {
    let changed = false, markDirty = false;
    try {
      const parseSafe = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
      const jsExpr = '({shots:localStorage.getItem("anc:pelican-shots"),del:localStorage.getItem("anc:pelican-shots-del"),pelican:localStorage.getItem("anc:pelican"),models:localStorage.getItem("anc:models")})';
      if (typeof wins !== 'undefined') {
        for (const [id, w] of wins.entries()) {
          if (!w || w.isDestroyed() || !w.webContents || w.webContents.isDestroyed()) continue;
          const a = acct(id), label = String(a?.name || (a?.email || '').split('@')[0] || '').trim();
          const res = await w.webContents.executeJavaScript(jsExpr).catch(() => null);
          if (!res) continue;
          const shots = parseSafe(res.shots, []), del = parseSafe(res.del, {}), pelican = parseSafe(res.pelican, {}), models = parseSafe(res.models, {});
          if ((Array.isArray(shots) && shots.length) || (pelican && Object.keys(pelican).length)) {
            const before = (DB.shared?.pelshots?.rows || []).length;
            mergeSharedPelshots({ rows: shots, del, pelican, models, acct: label }, null, { broadcast: false });
            if ((DB.shared?.pelshots?.rows || []).length !== before) changed = true;
          }
          if (a && !a.pelHarvested) { a.pelHarvested = 1; markDirty = true; }
        }
      }
      if (force && typeof WebContentsView === 'function' && Array.isArray(DB?.accounts)) {
        for (const a of DB.accounts) {
          if (!a?.id || (typeof wins !== 'undefined' && wins.has(a.id)) || (!force && a.pelHarvested)) continue;
          const ldbDir = path.join(app.getPath('userData'), 'Partitions', 'acct-' + a.id, 'Local Storage', 'leveldb');
          if (!fs.existsSync(ldbDir)) { if (!a.pelHarvested) { a.pelHarvested = 1; markDirty = true; } continue; }
          const ses = session.fromPartition(partOf(a.id));
          const wasBlocked = ses.__routeBlocked;
          let view = null;
          try {
            ses.__routeBlocked = false;
            view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
            const wc = view.webContents;
            wc.debugger.attach('1.3');
            wc.debugger.on('message', (_e, method, params) => {
              if (method === 'Fetch.requestPaused') {
                wc.debugger.sendCommand('Fetch.fulfillRequest', {
                  requestId: params.requestId,
                  responseCode: 200,
                  responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }],
                  body: Buffer.from('<!doctype html><title>p</title>').toString('base64'),
                }).catch(() => {});
              }
            });
            await wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt?pelharvest=1*' }] });
            await Promise.race([wc.loadURL('https://arena.ai/robots.txt?pelharvest=1'), new Promise((_, rj) => setTimeout(() => rj(Error('timeout')), 3500))]);
            const res = await Promise.race([wc.executeJavaScript(jsExpr), new Promise((_, rj) => setTimeout(() => rj(Error('timeout')), 2000))]);
            if (res) {
              const label = String(a.name || (a.email || '').split('@')[0] || '').trim();
              const shots = parseSafe(res.shots, []), del = parseSafe(res.del, {}), pelican = parseSafe(res.pelican, {}), models = parseSafe(res.models, {});
              if ((Array.isArray(shots) && shots.length) || (pelican && Object.keys(pelican).length)) {
                const before = (DB.shared?.pelshots?.rows || []).length;
                mergeSharedPelshots({ rows: shots, del, pelican, models, acct: label }, null, { broadcast: false });
                if ((DB.shared?.pelshots?.rows || []).length !== before) changed = true;
              }
            }
            if (!a.pelHarvested) { a.pelHarvested = 1; markDirty = true; }
          } catch {}
          finally {
            ses.__routeBlocked = wasBlocked;
            try { if (view?.webContents && !view.webContents.isDestroyed()) { if (view.webContents.debugger.isAttached()) view.webContents.debugger.detach(); view.webContents.close(); } } catch {}
          }
        }
      }
      if (changed || markDirty) saveSoon();
      if (changed && typeof BrowserWindow !== 'undefined') {
        const cmd = { pelshotsSync: true, at: Date.now() };
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
      }
    } catch {}
    finally { pelHarvesting = false; }
  }, force ? 120 : 6000);
}
ipcMain.handle('host:shared', (e, k, v) => {
  // 固定密码：{on, pw}，密码用系统钥匙串加密（和记住的账号密码一样），读出来时解密
  if (k === 'fixedpw') {
    DB.shared = DB.shared || {};
    if (v === undefined) { const o = DB.shared.fixedpw, pw = o?.on ? decPw(o.pw) : ''; return pw ? { on: true, pw } : null; }
    if (v === null) { delete DB.shared.fixedpw; saveSoon(); return true; }
    const pw = String(v?.pw || ''); if (!v?.on || !pw || pw.length > 200) return false;
    DB.shared.fixedpw = { on: true, pw: encPw(pw) }; saveSoon(); return true;
  }
  // 注册时输入的密码（待确认）：系统钥匙串加密，24 小时有效；只有该账号自己的窗口能读出来。
  // src=client：客户端注册框里输入的，验证链接后自动走「设置密码」用它；src=web：在官网页面里输入的，登录成功后存进账号
  if (/^regpw@[\w-]{1,64}$/.test(String(k))) {
    DB.shared = DB.shared || {}; const id = String(k).slice(6), me = winAcct(e.sender), o = DB.shared[k];
    const live = !!o && Date.now() - (o.at || 0) < 24 * 3600e3;
    if (o && !live) { delete DB.shared[k]; saveSoon(); }
    if (v === undefined) { if (!me || me.id !== id || !live) return null; const pw = decPw(o.pw); return pw ? { email: o.email || '', pw, src: o.src || 'client', at: o.at } : null; }
    if (v === null) { delete DB.shared[k]; saveSoon(); return true; }
    if (!acct(id)) return false;
    const pw = String(v?.pw || ''), em = String(v?.email || '').trim().toLowerCase();
    if (!pw || pw.length > 200 || (em && !/^[^\s@]+@[^\s@]+$/.test(em))) return false;
    if (v.src === 'web' && (!me || me.id !== id)) return false;
    DB.shared[k] = { email: em, pw: encPw(pw), src: v.src === 'web' ? 'web' : 'client', at: Date.now() }; saveSoon(); return true;
  }
  // 邮箱令牌（Outlook 取件）：刷新令牌和注册密码都用系统钥匙串加密保存，只在本机
  if (/^mailtok@[\w-]{1,64}$/.test(String(k))) {
    DB.shared = DB.shared || {};
    if (v === undefined) { const o = DB.shared[k]; if (!o) return null; const rt = decPw(o.rt); return rt ? { email: o.email, clientId: o.clientId, refreshToken: rt, pw: decPw(o.pw), at: o.at } : null; }
    if (v === null) { delete DB.shared[k]; saveSoon(); return true; }
    const rt = String(v?.refreshToken || ''), pw = String(v?.pw || '');
    if (!/^[^\s@]+@[^\s@]+$/.test(String(v?.email || '')) || !/^[0-9a-f-]{36}$/i.test(String(v?.clientId || '')) || rt.length < 20 || rt.length > 8000 || pw.length > 200) return false;
    DB.shared[k] = { email: String(v.email), clientId: String(v.clientId), rt: encPw(rt), pw: encPw(pw), at: Date.now() }; saveSoon(); return true;
  }
  // 验证码专用线路：'' / null = 跟随账号线路；'local' = 本机网络；或 http(s):// / socks5:// 备用代理。只改 Google / reCAPTCHA 域名的出口
  if (k === 'caproute') {
    DB.shared = DB.shared || {};
    if (v === undefined) return DB.shared.caproute || null;
    const spec = Vless.capSpec(v === null ? '' : v); if (spec === null) return { error: '备用代理格式不对：应为 http://主机:端口、socks5://主机:端口（可带 用户名:密码@），或填 local 用本机网络' };
    const had = DB.shared.caproute || '';
    if (spec) DB.shared.caproute = spec; else delete DB.shared.caproute;
    saveSoon();
    if (had !== spec) { const a = winAcct(e.sender); if (a && /^vless:/i.test(proxyStr(a))) return applyProxy(a).then(() => true, err => ({ error: String(err?.message || err) })); }   // 当前账号马上生效，其他账号下次连接 / 切换时生效
    return true;
  }
  // gacha@<账号id>：每个账号自己的抽卡设置；hist@<账号id> / models@<账号id>：每个账号的对话列表与识别缓存备份
  if (!['prefs', 'gacha', 'nodes', 'nodesubs', 'proxyips', 'pippool', 'archbl', 'gold', 'pelshots', 'pelican', 'habitLearnBank', 'habitCalibration'].includes(k) && !/^(gacha|draft|gtok|signup|mailtok|webreg|hist|models)@[\w-]{1,64}$/.test(String(k))) return null;
  DB.shared = DB.shared || {};
  if (k === 'habitLearnBank') {
    const bankFile = path.join(app.getPath('userData'), 'shared', 'habitLearnBank.json');
    const userDataDir = app.getPath('userData');
    const roamingRoot = path.dirname(userDataDir);
    const bankFiles = [bankFile];
    const dbFiles = [];
    const KNOWN_DIAG_SIDS = new Set([
      '01a13ee4-294d-7e67-8554-fad3b69284f6',
      '01a13ef8-3b56-7b99-a43b-d991064c46d8',
      '01a13f78-2a78-73af-b245-221a0949c7ca',
      '01a13f8c-44aa-78eb-9d88-3f464586a2f1',
      '01a14141-6b87-7580-a7d5-bf37d09986d6',
      '01a14142-227a-7150-87f5-a06b13bc5613',
      '01a141e3-3f0c-75ef-b700-bf9ab9312277',
      '01a141e4-60ae-73ae-ba17-cd4ff105b084',
      '01a1440a-e8c4-7939-8910-ffe946582807',
      '01a148b9-8f93-741c-9115-05ff889e3fd6',
      '01a14a34-2246-79fd-90e3-c73b07db1e52',
      '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54',
      '01a151de-5840-75e5-b5e0-9bf662f543dd',
      '01a151e0-c58e-7766-9c65-f7287592c61b',
    ]);
    const SECONDARY_CORRECTION_SIDS = {
      '01a155eb-ebaa-77ae-9173-fac511bb3c81': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false },
      '01a155eb-ebaa-730a-922c-085044a25044': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false },
      '01a14e79-62e7-7137-b869-c97ecd890fd0': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
      '01a152c4-2ba1-70ee-9dd1-6a29ae84d75c': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
      '01a152c2-c708-7859-9dac-3e2d6a45454f': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
      '01a152c6-d4c7-7faa-a81d-64d4b1953661': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: false },
      '01a152c4-dc79-71d2-acb9-3b47fecc25f6': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: true },
      '01a14cea-e2bb-72ac-810d-ef8f38883bea': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false, autoTeacher: false },
      '01a1580c-3b5a-7ac0-abe4-7afef0cc1035': { model: 'gpt-6-sol-max', rawLabel: 'GPT 6 Sol (Max)', isOpen: false, autoTeacher: false },
      '01a1577d-ff3d-70b4-9e51-fef4931aebae': { model: 'gpt-6.1-sol-max', rawLabel: 'GPT 6.1 Sol (Max)', isOpen: false, autoTeacher: false },
      '01a15779-4c90-77f8-b822-9e72acf9c3ca': { model: 'gpt-6.1-sol-high', rawLabel: 'GPT 6.1 Sol (High)', isOpen: false, autoTeacher: false },
      '01a14a0d-bce9-7011-a76d-b1deea75c1d9': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: false },
      '01a1577e-b0dd-714a-bfb4-1b0f1b7b1da1': { model: 'gemini-4-argon-high', rawLabel: 'Gemini 4 Argon (High)', isOpen: false, autoTeacher: false },
    };
    const isCorrupt4000MetaObj = m => Boolean(m && Number(m.meanChars) === 4000 && (Number(m.writtenChars) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.cps) === 1 || Number(m.cps) === 2 || (Number(m.totalTools) === 0 && (Number(m.write) > 0 || Number(m.askUser) > 0))));
    const isUnloaded4500StubMeta = m => Boolean(m && Number(m.meanChars) === 4500 && (Number(m.writtenChars) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.bash) || 0) === 0 && (Number(m.askUser) || 0) === 0 && (Number(m.lowerDoctype) || 0) === 0 && (Number(m.colorSchemeCss) || 0) === 0 && (Number(m.prefersReducedMotion) || 0) === 0 && (Number(m.sandboxLink) || 0) === 0 && (Number(m.svgSmilNoScript) || 0) === 0);
    const isSyntheticStubVecObj = v => Array.isArray(v) && v.length === 20 && v[12] === 0.8 && v[15] === 0.52 && v[2] === 0.05 && v[3] === 0;
    const MODEL_NAME_MAX_RE = /^(?:qwen[\d.]*|qwen-\d[\d.]*|glm-[\d.]+|minimax[\w.-]*|step-[\d.]+|yi-[\w.-]+|gpt-[\d.]+-codex)-max(?:-0\d{3}|-\d{4,8})?$/i;
    const OPEN_NO_TIER_BASE_RE = /^(?:(?:qwen[\d.]*|qwen-\d[\d.]*|glm-[\d.]+)-max(?:-0\d{3}|-\d{4,8})?|kimi-k\d[\d.]*|deepseek-v[\d.]+-flash(?:-\d+)?|mimo-v[\d.]+-(?:flash|pro)|qwen[\d.]*-flash(?:-next)?|glm-[\d.]+-flash|minimax-m\d[\w.-]*|muse-wonder|muse-spark-open|beam-[\d.]+-\d+b-a\d+b|horizon-[\d.]+|step-\d[\w.-]*|hy\d[\w.-]*|kibitz|kalmia)$/i;
    const sanitizeTierSlug = (str, rawHint = '') => {
      if (!str) return '';
      let out = String(str).trim().replace(/\s*\((?:标准|standard)\)\s*$/i, '');
      if (/qwen3\.8-max-0902/i.test(String(rawHint || '')) && /^qwen3\.8-max(?:-(?:none|minimal|low|medium|high|xhigh|max))?$/i.test(out)) {
        return 'qwen3.8-max-0902';
      }
      if (/^kimi-k3-max$/i.test(out)) return 'kimi-k3';
      if (/^muse-wonder-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(out)) return 'muse-wonder';
      if (/^muse-spark-open-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(out)) return 'muse-spark-open';
      const mOpen = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(out);
      if (mOpen && (OPEN_NO_TIER_BASE_RE.test(mOpen[1]) || MODEL_NAME_MAX_RE.test(mOpen[1]))) {
        out = mOpen[1];
      }
      const mDouble = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(out);
      if (mDouble) {
        out = `${mDouble[1]}-${mDouble[2]}`;
      }
      if (/^kimi-k3-max$/i.test(out)) return 'kimi-k3';
      return out;
    };
    const canonHabitModel = (raw, rawHint = '') => {
      if (!raw) return '';
      let s = String(raw).replace(/[?？]+$/, '').replace(/\s*\((?:标准|standard)\)\s*$/i, '').replace(/\s+/g, ' ').trim();
      if (!s || s === '开源模型') return s;
      if (/gpt-5\.6-luna/i.test(s)) s = s.replace(/gpt-5\.6-luna/ig, 'gpt-6-luna');
      if (/barium-bb-v2-4xts(?:-agent)?/i.test(s)) s = s.replace(/barium-bb-v2-4xts(?:-agent)?/ig, 'gemini-4-argon');
      if (/^muse(?:\s*\((low|medium|high|xhigh|max)\)|-(low|medium|high|xhigh|max))?$/i.test(s)) {
        const mm = s.match(/(low|medium|high|xhigh|max)/i);
        s = `muse-spark-1.3-${mm ? mm[1].toLowerCase() : 'max'}`;
      }
      const bare = s.replace(/^[a-z0-9_.-]+\//i, '').replace(/\[[^\]]*\]\s*/g, '').trim();
      const em = bare.match(/\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i);
      const eff = em ? em[1].toLowerCase() : '';
      const base = (em ? bare.slice(0, em.index) : bare).trim();
      const slug = base.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slug) return s;
      if (eff && !slug.endsWith('-' + eff) && !OPEN_NO_TIER_BASE_RE.test(slug) && !MODEL_NAME_MAX_RE.test(slug)) {
        return sanitizeTierSlug(`${slug}-${eff}`, rawHint || s);
      }
      return sanitizeTierSlug(slug, rawHint || s);
    };
    const decomposeHabitTriple = (modelSlug, rawLbl = '') => {
      const clean = sanitizeTierSlug(canonHabitModel(modelSlug, rawLbl) || String(modelSlug || ''), rawLbl);
      let family = clean;
      let effort = 'standard';
      if (!OPEN_NO_TIER_BASE_RE.test(clean) && !MODEL_NAME_MAX_RE.test(clean)) {
        const mDash = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(clean);
        if (mDash && !OPEN_NO_TIER_BASE_RE.test(mDash[1]) && !MODEL_NAME_MAX_RE.test(mDash[1])) {
          family = mDash[1];
          const rt = mDash[2].toLowerCase();
          effort = (rt === 'none' || rt === 'minimal') ? 'low' : rt;
        }
      }
      let vendor = 'compat';
      if (/gpt|openai|sol|luna|astra|terra|\bo[134]\b/i.test(family)) vendor = 'openai';
      else if (/claude|anthropic|opus|sonnet|haiku|fable/i.test(family)) vendor = 'anthropic';
      else if (/gemini|google|argon|barium/i.test(family)) vendor = 'google';
      else if (/grok|xai/i.test(family)) vendor = 'xai';
      else if (/deepseek|beam/i.test(family)) vendor = 'deepseek';
      else if (/qwen|qwq|alibaba/i.test(family)) vendor = 'qwen';
      else if (/glm|zhipu/i.test(family)) vendor = 'zhipu';
      else if (/kimi|moonshot/i.test(family)) vendor = 'moonshot';
      else if (/mimo|xiaomi/i.test(family)) vendor = 'xiaomi';
      else if (/muse|llama|meta/i.test(family)) vendor = 'meta';
      return { vendor, family, effort, canon: effort === 'standard' ? family : `${family}-${effort}` };
    };
    const PURGED_STUB_SIDS = new Set([
      '01a14d10-88e5-7e0d-a2dc-59b80e865028', '01a14d11-a5dc-773c-8c0c-88f6a16d6655', '01a148c7-9e1b-7544-884d-4e7cc1476a64',
      '01a148c9-6c3a-7a2a-8827-1533a93e94fc', '01a148cb-d02d-7157-a3b8-6c2ba515919c', '01a148c8-3bb2-7e8b-8f07-96ab90bcb3c7',
      '01a148b0-3e40-735d-b935-b35e51269c9f', '01a148b0-d9c4-733b-9bac-3812590714d8', '01a148c8-9b24-7f05-b708-d8bbf9dccd4a',
      '01a14a32-3c2e-763f-96d6-e45e52177a3f', '01a152c4-b0d4-74c2-aa6a-8a9cbc1fdd3b', '01a152c6-7acb-70e6-ac17-41f3eb622d4b',
      '01a152c1-d872-7793-bbad-11d49b1745f7', '01a152bd-e314-7d89-9f0a-5a5df088ecbc', '01a14a40-9a96-7b65-a13e-94b9e628abf2',
      '01a14a40-c888-7f49-8a1a-9fd57fd0dbc9', '01a14a3e-f971-7d7d-a95e-35f5d62bf1ae', '01a14a31-8bb0-79c3-9fc2-bc22d58b036a',
      '01a143cf-e9b8-7f73-a2b9-a4a0db718c19', '01a14d10-3266-7ef6-a4a3-b34b6dabc6a4', '01a14d10-0340-7ef5-aae6-faf9e510734a',
      '01a148c7-756a-7c81-a63f-22d50224f13c', '01a148cc-9e87-75b8-8393-236014b1fdce', '01a148cb-63ae-73d2-83d7-00d699d5c1f3',
      '01a148b8-5c68-738e-be33-3eda236291bf', '01a148b6-d121-76ee-88ca-bf631655c8fc', '01a148b5-0375-7a1b-86d4-97de60dee2c2',
      '01a148b6-356c-79d6-b36a-6a65d4f3b61c', '01a148b3-4d8b-70b3-af44-bc93d21a6044', '01a148b2-e9df-7bc2-bcdc-44e32a4d5c63',
      '01a148b0-990d-7c20-90c4-516e61a6d1a5', '01a148b0-1482-754b-8b8e-174d59e341d4', '01a148af-c6c0-7105-9d3a-46b1543d05f2',
      '01a13890-9c70-7677-9b34-83ec17d57d29',
    ]);
    const cleanBankSample = raw => {
      if (!raw || !raw.model || !Array.isArray(raw.vec)) return null;
      const sidStr = String(raw.sid || '');
      if (PURGED_STUB_SIDS.has(sidStr)) return null;
      const rawM = String(raw.model || '').trim();
      const rawLblClean = String(raw.rawLabel || '').trim();
      let m = canonHabitModel(rawM, rawLblClean) || rawM;
      const sc = Number(raw.score);
      const validSc = Number.isFinite(sc) && sc >= 10 && sc <= 100 ? sc : (Number.isFinite(+raw.rawHabitScore) && +raw.rawHabitScore >= 10 && +raw.rawHabitScore <= 100 ? +raw.rawHabitScore : 75);
      const out = { ...raw, model: m, score: validSc };
      delete out.id;
      delete out._sources;
      const isPureImgModel = /^(gpt-image|mai-image|muse-image|imagen-|flux-|recraft-|ideogram-|dall-e|midjourney|pumpkin-pancake)/i.test(m) || out.evalModality === 'image';
      const mChars = Number(out.meta?.meanChars) || 0;
      const wChars = Number(out.meta?.writtenChars) || 0;
      const tTools = Number(out.meta?.totalTools) || 0;
      if (isPureImgModel && mChars < 60 && wChars === 0) return null;
      if ((out.battleRevealed || out.directMode || /#[ab]$/i.test(sidStr)) && out.meta && mChars < 40 && wChars === 0 && tTools === 0) return null;
      // 还原无档位 Battle/Direct 揭晓样本（如 claude-opus-5、gemini-4-argon、kimi-k3、qwen3.8-max-0902）为纯型号 + 标准强度
      if ((out.battleRevealed || out.directMode) && rawLblClean && !/\((?:none|minimal|low|medium|high|xhigh|max)\)/i.test(rawLblClean)) {
        const rlSlug = rawLblClean.toLowerCase().replace(/^[^/]+\//, '').replace(/\s+/g, '-');
        const rlHasTier = /-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(rlSlug) && !MODEL_NAME_MAX_RE.test(rlSlug) && !OPEN_NO_TIER_BASE_RE.test(rlSlug);
        if (!rlHasTier) {
          m = canonHabitModel(rawLblClean, rawLblClean) || rlSlug;
          out.model = m;
          out.effort = 'standard';
        }
      }
      if (sidStr === '01a155ea-d645-7385-9d00-0a95851f21d9' && /gemini-4-argon/i.test(m) && /high/i.test(rawLblClean)) {
        m = 'gemini-4-argon-high';
        out.model = m;
        out.effort = 'high';
      }
      if (!out.rawLabel && rawM !== m) out.rawLabel = rawM;
      if (KNOWN_DIAG_SIDS.has(sidStr)) out.importedFromDiag = true;
      if (sidStr === '01a13ef8-3b56-7b99-a43b-d991064c46d8' || sidStr === '01a151de-5840-75e5-b5e0-9bf662f543dd') out.userConfirmed = true;
      if (sidStr === '01a155ea-7be8-75fe-8b49-773f6159cb3a' && /6-sol/i.test(m)) {
        m = canonHabitModel('Claude Opus 5.5 (Medium)');
        out.model = m;
        out.rawLabel = 'Claude Opus 5.5 (Medium)';
      }
      if (SECONDARY_CORRECTION_SIDS[sidStr]) {
        const corr = SECONDARY_CORRECTION_SIDS[sidStr];
        m = canonHabitModel(corr.model) || corr.model;
        out.model = m;
        out.rawLabel = corr.rawLabel;
        out.isOpen = corr.isOpen;
        if (typeof corr.autoTeacher === 'boolean') out.autoTeacher = corr.autoTeacher;
      }
      if (isCorrupt4000MetaObj(out.meta)) {
        out.meta = null;
      }
      if (isSyntheticStubVecObj(out.vec)) {
        const hasRealTags = Array.isArray(out.tags) && out.tags.some(t => t && t !== '⚡ 反推自动纠偏样本');
        if (!out.userConfirmed && !out.importedFromDiag && !out.battleRevealed && !out.directMode && (out.meta === null && !hasRealTags)) {
          return null;
        }
      }
      if (!out.importedFromDiag && out.meta && typeof out.meta === 'object') {
        const mChk = Number(out.meta.memoAvgChunk) || 0;
        const mCnt = Number(out.meta.memoDeltaCount) || 0;
        if (mChk > 0 && mChk < 4.2 && mCnt >= 200) {
          if (sidStr === '01a14584-b207-7580-95bc-9a59e277da76' || !out.userConfirmed) return null;
        }
      }
      if (/gemini|google|argon/i.test(m)) {
        if (out.meta && out.meta.hidR === 4 && ((out.meta.memoAvgChunk || 0) >= 25 || (out.meta.writtenChars || 0) >= 25000)) {
          out.meta = { ...out.meta, hidR: 0, maxRInTurn: 0, isGeminiCoding: true };
        }
        if (out.vec.length === 20 && out.vec[0] === 1 && out.vec[1] === 0 && (!out.meta || out.meta.isGeminiCoding !== false)) {
          const fv = [...out.vec];
          fv[0] = 0; fv[1] = 1;
          out.vec = fv;
        }
        if (Array.isArray(out.tags)) out.tags = out.tags.filter(t => !/^闭源隐藏思考/.test(String(t || '')));
      }
      const triple = decomposeHabitTriple(out.model, out.rawLabel);
      out.vendor = triple.vendor;
      out.family = triple.family;
      out.effort = out.effort || triple.effort;
      out.model = triple.canon || out.model;
      return out;
    };
    const mergeBankSamples = (a, b) => {
      const bySid = new Map();
      for (const rawS of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
        const s = cleanBankSample(rawS);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const key = s.sid || (s.model + ':' + (s.at || 0));
        const prev = bySid.get(key);
        if (!prev) {
          bySid.set(key, s);
          continue;
        }
        const sRank = (s.userConfirmed && !s.autoTeacher) || s.importedFromDiag ? 2 : (s.userConfirmed ? 1 : 0);
        const pRank = (prev?.userConfirmed && !prev?.autoTeacher) || prev?.importedFromDiag ? 2 : (prev?.userConfirmed ? 1 : 0);
        const win = (sRank > pRank) || (sRank === pRank && ((s.at || 0) >= (prev.at || 0))) ? s : prev;
        const lose = win === s ? prev : s;
        const winVecStub = isSyntheticStubVecObj(win.vec);
        const loseVecRich = Array.isArray(lose?.vec) && lose.vec.length === 20 && !isSyntheticStubVecObj(lose.vec);
        const bestVec = (winVecStub && loseVecRich) ? lose.vec : win.vec;
        const pMeta = (prev.meta && !isCorrupt4000MetaObj(prev.meta) && !isUnloaded4500StubMeta(prev.meta)) ? prev.meta : null;
        const sMeta = (s.meta && !isCorrupt4000MetaObj(s.meta) && !isUnloaded4500StubMeta(s.meta)) ? s.meta : null;
        const fallbackMeta = (win.meta && !isCorrupt4000MetaObj(win.meta)) ? win.meta : ((lose?.meta && !isCorrupt4000MetaObj(lose.meta)) ? lose.meta : null);
        const mergedMeta = (pMeta || sMeta) ? { ...(pMeta || {}), ...(sMeta || {}) } : fallbackMeta;
        bySid.set(key, {
          ...prev,
          ...win,
          vec: bestVec,
          meta: mergedMeta,
          userConfirmed: Boolean(prev.userConfirmed || s.userConfirmed),
          autoTeacher: sRank > pRank ? Boolean(s.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
          importedFromDiag: Boolean(prev.importedFromDiag || s.importedFromDiag),
        });
      }
      const getRank = s => {
        if (!s) return 0;
        if (s.truthTier === 'battle_paired') return 5;
        if (s.battleRevealed || s.truthTier === 'battle_single' || /#[ab]$/i.test(String(s.sid || '')) || s.importedFromDiag) return 4;
        if (s.directMode || s.truthTier === 'direct_locked') return 3;
        if (s.userConfirmed && !s.autoTeacher) return 2;
        if (s.userConfirmed || s.autoTeacher) return 1;
        return 0;
      };
      const vecCos = (va, vb) => {
        if (!Array.isArray(va) || !Array.isArray(vb) || va.length !== vb.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < va.length; i++) {
          const x = Number(va[i]) || 0, y = Number(vb[i]) || 0;
          dot += x * y; na += x * x; nb += y * y;
        }
        return (na > 0 && nb > 0) ? (dot / (Math.sqrt(na) * Math.sqrt(nb))) : 0;
      };
      const sorted = [...bySid.values()].sort((x, y) => {
        const rx = getRank(x), ry = getRank(y);
        if (ry !== rx) return ry - rx;
        const cx = (Number(x.meta?.cps) > 0 ? 1 : 0) + ((Number(x.meta?.meanChars) >= 240 || Number(x.meta?.writtenChars) >= 240) ? 1 : 0);
        const cy = (Number(y.meta?.cps) > 0 ? 1 : 0) + ((Number(y.meta?.meanChars) >= 240 || Number(y.meta?.writtenChars) >= 240) ? 1 : 0);
        if (cy !== cx) return cy - cx;
        return (Number(y.weight) || 1) - (Number(x.weight) || 1) || ((y.at || 0) - (x.at || 0));
      });
      const MAX_PER_MODEL = 80;
      const MAX_TOTAL = 1600;
      const byModel = new Map();
      const kept = [];
      for (const s of sorted) {
        if (kept.length >= MAX_TOTAL) break;
        const mk = String(s.model || '').toLowerCase();
        const bucket = byModel.get(mk) || [];
        if (bucket.length >= MAX_PER_MODEL) continue;
        if (!s.userConfirmed && !s.battleRevealed && !s.directMode && bucket.length >= 65 && bucket.some(ex => vecCos(ex.vec, s.vec) >= 0.9995 && (Number(ex.meta?.cps) > 0) >= (Number(s.meta?.cps) > 0))) {
          continue;
        }
        bucket.push(s);
        byModel.set(mk, bucket);
        kept.push(s);
      }
      return kept;
    };
    const mergeCalibObj = (a, b) => {
      const base = (a && typeof a === 'object') ? a : {};
      const inc = (b && typeof b === 'object') ? b : {};
      const protoCentroids = { ...(base.protoCentroids || {}) };
      for (const [mk, rc] of Object.entries(inc.protoCentroids || {})) {
        if (!rc || typeof rc !== 'object') continue;
        const cKey = canonHabitModel(mk) || mk;
        const fixedRc = (Number(rc.count) || 0) > 50 ? { ...rc, count: 12 } : rc;
        const lc = protoCentroids[cKey];
        if (!lc || (fixedRc?.updatedAt || 0) >= (lc?.updatedAt || 0)) protoCentroids[cKey] = fixedRc;
      }
      const scoreOffsets = { ...(base.scoreOffsets || {}) };
      for (const [mk, rs] of Object.entries(inc.scoreOffsets || {})) {
        if (!rs || typeof rs !== 'object') continue;
        const cKey = canonHabitModel(mk) || mk;
        const fixedRs = (Number(rs.count) || 0) > 50 ? { ...rs, count: 12 } : rs;
        const ls = scoreOffsets[cKey];
        if (!ls || (fixedRs?.updatedAt || 0) >= (ls?.updatedAt || 0)) scoreOffsets[cKey] = fixedRs;
      }
      const tierCentroids = {};
      for (const [mk, rt] of [...Object.entries(base.tierCentroids || {}), ...Object.entries(inc.tierCentroids || {})]) {
        if (!rt || typeof rt !== 'object' || !Array.isArray(rt.tierVec)) continue;
        if (rt.syntheticMargin) continue;
        const cKey = canonHabitModel(mk) || mk;
        if (OPEN_NO_TIER_BASE_RE.test(cKey) || MODEL_NAME_MAX_RE.test(cKey)) continue;
        const lt = tierCentroids[cKey];
        if (!lt || (Number(rt.truthWeightSum) || 0) >= (Number(lt.truthWeightSum) || 0) || (rt.updatedAt || 0) >= (lt.updatedAt || 0)) {
          tierCentroids[cKey] = rt;
        }
      }
      const mergeNestedMap = (mA, mB) => {
        const out = { ...(mA && typeof mA === 'object' ? mA : {}) };
        if (mB && typeof mB === 'object') {
          for (const [k, v] of Object.entries(mB)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              out[k] = { ...(out[k] && typeof out[k] === 'object' ? out[k] : {}), ...v };
            } else {
              out[k] = v;
            }
          }
        }
        return out;
      };
      const intraFamilyHyperplanes = mergeNestedMap(base.intraFamilyHyperplanes, inc.intraFamilyHyperplanes);
      const vendorTierDeltas = mergeNestedMap(base.vendorTierDeltas, inc.vendorTierDeltas);
      const modalityProfiles = mergeNestedMap(base.modalityProfiles, inc.modalityProfiles);
      const dimWeights = mergeNestedMap(base.dimWeights, inc.dimWeights);
      const repelledModels = mergeNestedMap(base.repelledModels, inc.repelledModels);
      const rcA = (base.reverseCalib && typeof base.reverseCalib === 'object') ? base.reverseCalib : {};
      const rcB = (inc.reverseCalib && typeof inc.reverseCalib === 'object') ? inc.reverseCalib : {};
      const reverseCalib = {
        effortScales: { ...(rcA.effortScales || {}), ...(rcB.effortScales || {}) },
        tierLogPriors: mergeNestedMap(rcA.tierLogPriors, rcB.tierLogPriors),
        modelResidualBias: { ...(rcA.modelResidualBias || {}), ...(rcB.modelResidualBias || {}) },
        updatedAt: Math.max(rcA.updatedAt || 0, rcB.updatedAt || 0),
      };
      return {
        v: 3,
        protoCentroids,
        scoreOffsets,
        tierCentroids,
        intraFamilyHyperplanes,
        vendorTierDeltas,
        modalityProfiles,
        dimWeights,
        repelledModels,
        reverseCalib,
        updatedAt: Math.max(base.updatedAt || 0, inc.updatedAt || 0, Date.now()),
      };
    };
    if (v === undefined && global._memHabitBank && Array.isArray(global._memHabitBank.samples)) {
      return global._memHabitBank;
    }
    const persistHabitBankFiles = bankObj => {
      global._memHabitBank = bankObj;
      clearTimeout(global._habitBankWriteTimer);
      global._habitBankWriteTimer = setTimeout(async () => {
        const json = JSON.stringify(bankObj);
        for (const bf of bankFiles) {
          try {
            if (bf === bankFiles[0] || fs.existsSync(path.dirname(bf))) {
              await fs.promises.mkdir(path.dirname(bf), { recursive: true });
              await fs.promises.writeFile(bf, json);
            }
          } catch {}
        }
      }, 450);
    };
    const _getBuiltinHabitSidSet = () => {
      if (global._builtinHabitSidSet) return global._builtinHabitSidSet;
      const set = new Set();
      try {
        const f = [path.join(__dirname, '..', 'ui', 'habit-builtin-bank.js'), path.join(__dirname, '..', 'modules/habit-engine/domain/habit-builtin-bank.js'), path.join(__dirname, '..', '..', '..', 'modules/habit-engine/domain/habit-builtin-bank.js')].find(p => fs.existsSync(p)) || '';
        if (fs.existsSync(f)) {
          const s = fs.readFileSync(f, 'utf8');
          const re = /"sid"\s*:\s*"([^"]+)"/g;
          let m;
          while ((m = re.exec(s)) !== null) set.add(m[1]);
        }
      } catch {}
      global._builtinHabitSidSet = set;
      return set;
    };
    const bSidSet = _getBuiltinHabitSidSet();
    let diskSamples = [], diskCalib = {};
    for (const bf of bankFiles) {
      try {
        if (fs.existsSync(bf)) {
          const d = JSON.parse(fs.readFileSync(bf, 'utf8'));
          if (Array.isArray(d?.samples)) {
            const deltaOnly = d.samples.filter(s => s && !bSidSet.has(String(s.sid || '')));
            diskSamples = mergeBankSamples(diskSamples, deltaOnly).slice(0, 160);
          }
          if (d?.calibration && typeof d.calibration === 'object') diskCalib = mergeCalibObj(diskCalib, d.calibration);
        }
      } catch {}
    }
    const baseSamples = mergeBankSamples(diskSamples, DB.shared.habitLearnBank?.samples || []);
    delete DB.shared.habitLearnBank;
    global._memHabitBank = null;
    if (v === undefined) {
      const nextBank = { v: 2, updatedAt: Date.now(), samples: baseSamples.slice(0, 160), calibration: diskCalib };
      try {
        if (fs.existsSync(bankFile) && fs.statSync(bankFile).size > 200000) {
          fs.writeFileSync(bankFile, JSON.stringify(nextBank), 'utf8');
        }
      } catch {}
      setImmediate(() => { try { global.gc?.(); } catch {} });
      return nextBank;
    }
    if (v && typeof v === 'object') {
      const incDelta = Array.isArray(v.samples)
        ? v.samples.filter(s => s && !bSidSet.has(String(s.sid || '')))
        : [];
      const merged = (v.replace === true && (!Array.isArray(v.samples) || v.samples.length === 0))
        ? []
        : mergeBankSamples(baseSamples, incDelta).slice(0, 160);
      const mergedCal = v.replace === true && (!v.samples || !v.samples.length)
        ? (v.calibration || {})
        : mergeCalibObj(diskCalib, v.calibration);
      const nextBank = { v: 2, updatedAt: Date.now(), samples: merged, calibration: mergedCal };
      persistHabitBankFiles(nextBank);
      global._memHabitBank = null;
      try {
        for (const bw of BrowserWindow.getAllWindows()) {
          if (bw && !bw.isDestroyed() && bw.webContents && bw.webContents !== e?.sender) {
            bw.webContents.send('anc-cmd', { habitBankSync: nextBank });
          }
        }
      } catch {}
      setImmediate(() => { try { global.gc?.(); } catch {} });
      return nextBank;
    }
    return false;
  }
  if (String(k).startsWith('signup@')) {
    const a = acct(k.slice(7)), flow = require('../ui/auth-flow');
    if (!a) return { error: '注册账号不存在' };
    if (v === undefined) return flow.signupIntent(DB.shared[k], a);
    const intent = v === null ? null : flow.signupIntent(v, a);
    if (v !== null && !intent) return { error: '注册任务无效或已过期' };
    const old = DB.shared[k]; DB.shared[k] = intent;
    try { saveDB(true); } catch (error) { if (old === undefined) delete DB.shared[k]; else DB.shared[k] = old; throw error; }
    return true;
  }
  if (v === undefined) {
    if (k === 'pelshots') {
      if (typeof harvestAccountPelicanSoon === 'function') harvestAccountPelicanSoon(false);
      return DB.shared.pelshots || (typeof loadPelshotsFromDisk === 'function' ? loadPelshotsFromDisk() : null);
    }
    return DB.shared[k] ?? null;
  }
  if (k === 'pelshots') {
    return typeof mergeSharedPelshots === 'function' ? mergeSharedPelshots(v, e?.sender) : (DB.shared.pelshots = v, saveSoon(), true);
  }
  if (k === 'pelican') {
    if (v === null) { DB.shared.pelican = {}; saveSoon(); return true; }
    if (v && typeof v === 'object') {
      DB.shared.pelican = DB.shared.pelican && typeof DB.shared.pelican === 'object' ? DB.shared.pelican : {};
      if (typeof mergePelicanMapInto === 'function') mergePelicanMapInto(DB.shared.pelican, v);
      else Object.assign(DB.shared.pelican, v);
      saveSoon();
      return true;
    }
    return false;
  }
  if (k === 'gold' && v && typeof v === 'object') {
    DB.shared.gold = v;
    if (DB.shared.prefs && typeof DB.shared.prefs === 'object') {
      DB.shared.prefs = { ...DB.shared.prefs, goldMode: v.mode || 'auto', goldSet: Array.isArray(v.set) ? v.set : [], goldChats: Array.isArray(v.chats) ? v.chats : [], goldAt: v.at || Date.now() };
    }
    saveSoon();
    const cmd = { goldMode: v.mode || 'auto', goldSet: Array.isArray(v.set) ? v.set : [], goldChats: Array.isArray(v.chats) ? v.chats : [], goldAt: v.at || Date.now() };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
    return true;
  }
  const prevPrefs = DB.shared.prefs;
  if (k === 'prefs' && v && typeof v === 'object' && prevPrefs && typeof prevPrefs === 'object' && (prevPrefs.goldAt || 0) > (v.goldAt || 0)) {
    v = { ...v, goldMode: prevPrefs.goldMode, goldSet: prevPrefs.goldSet, goldChats: prevPrefs.goldChats, goldAt: prevPrefs.goldAt };
  }
  if (/^draft@[\w-]{1,64}$/.test(String(k)) && v && typeof v === 'object') {
    const prevDraft = DB.shared[k];
    if (prevDraft && typeof prevDraft === 'object') {
      const dropped = new Set(Array.isArray(v.droppedSids) ? v.droppedSids : []);
      const ackedIds = [...new Set([...(Array.isArray(prevDraft.ackedIds) ? prevDraft.ackedIds : []), ...(Array.isArray(v.ackedIds) ? v.ackedIds : [])])].slice(-128);
      const acceptedIds = [...new Set([...(Array.isArray(prevDraft.acceptedIds) ? prevDraft.acceptedIds : []), ...(Array.isArray(v.acceptedIds) ? v.acceptedIds : [])])].slice(-128);
      if (ackedIds.length) v.ackedIds = ackedIds;
      if (acceptedIds.length) v.acceptedIds = acceptedIds;
      const doneSet = new Set([...ackedIds, ...acceptedIds]);
      if (Array.isArray(v.o)) v.o = v.o.filter(x => x && x.id && !ackedIds.includes(x.id));
      if (prevDraft.q && typeof prevDraft.q === 'object') {
        v.q = (v.q && typeof v.q === 'object') ? v.q : {};
        for (const [sid, pq] of Object.entries(prevDraft.q)) {
          if (!pq?.items?.length || dropped.has(sid)) continue;
          const nq = v.q[sid];
          const remSet = new Set([...(Array.isArray(nq?.removedIds) ? nq.removedIds : []), ...(Array.isArray(pq?.removedIds) ? pq.removedIds : []), ...doneSet]);
          const validPqItems = pq.items.filter(it => it && it.id && !remSet.has(it.id));
          if (!validPqItems.length) continue;
          if (!nq) {
            v.q[sid] = { ...pq, items: validPqItems };
          } else if (!nq.items?.length && !nq.clearedAt && !(Array.isArray(nq.removedIds) && nq.removedIds.length) && (pq.at || 0) >= (nq.at || 0)) {
            v.q[sid] = { ...pq, items: validPqItems };
          }
        }
      }
    }
    DB.shared[k] = v;
    if (saveT) { clearTimeout(saveT); saveT = 0; }
    try { saveDB(true); } catch { saveDB(); }
    return true;
  }
  if (k === 'pippool' && v && typeof v === 'object') {
    DB.shared.pippool = compactPipPool(v);
    healBannedAccountProxyIps();
    savePipPoolSoon(1500);
    return true;
  }
  DB.shared[k] = v;
  if (k === 'prefs' && v && typeof v === 'object' && (v.goldMode || Array.isArray(v.goldSet))) {
    DB.shared.gold = { mode: v.goldMode || 'auto', set: Array.isArray(v.goldSet) ? v.goldSet : [], chats: Array.isArray(v.goldChats) ? v.goldChats : [], at: v.goldAt || Date.now() };
  }
  saveSoon(k === 'pippool' ? 4000 : 800);
  if (k === 'prefs') {
    if ((prevPrefs?.gDirect !== false) !== (v?.gDirect !== false)) gReapply();
    const was = themeWas; themeWas = v?.theme;
    syncThemeSource();
    // 主题 / 金色点亮 / 账号检测间隔改了：通知其它账号窗口一起换（不然它们还拿着旧设置，下次保存设置又把旧值写回来）
    const cmd = {};
    if (was !== undefined && was !== v?.theme) cmd.theme = v?.theme || 'auto';
    if (prevPrefs?.goldMode !== v?.goldMode || JSON.stringify(prevPrefs?.goldSet || []) !== JSON.stringify(v?.goldSet || []) || JSON.stringify(prevPrefs?.goldChats || []) !== JSON.stringify(v?.goldChats || [])) {
      cmd.goldMode = v?.goldMode || 'auto';
      cmd.goldSet = Array.isArray(v?.goldSet) ? v.goldSet : [];
      cmd.goldChats = Array.isArray(v?.goldChats) ? v.goldChats : [];
      cmd.goldAt = v?.goldAt || Date.now();
    }
    if (prevPrefs?.acctCheckHours !== v?.acctCheckHours && v?.acctCheckHours != null) cmd.acctCheckHours = v.acctCheckHours;
    const pinned = String(v?.pinDpl || '').trim();
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(pinned)) {
      EXPIRED_COST_DPLS.delete(pinned);
      rememberCostDpl(pinned, true);
    } else if (prevPrefs?.pinDpl && !pinned) {
      rememberCostDpl('dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', true);
    }
    if (prevPrefs?.pinDpl !== v?.pinDpl || prevPrefs?.autoCostDpl !== v?.autoCostDpl) {
      cmd.pinDpl = v?.pinDpl || '';
      cmd.autoCostDpl = v?.autoCostDpl || '';
    }
    if (Object.keys(cmd).length) for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
  }
  return true;
});
// 有窗口在抽卡 / 排队发送 / 接收回复：阻止系统把 App 挂起（屏幕照常可以关）
const bgWorkMap = new Map(); let psbId = -1;
const _hiddenIdleSince = new Map();
function bgCheck() {
  const t = Date.now(); let busy = false;
  for (const [k, v] of bgWorkMap) { if (t - v.at > 90000) bgWorkMap.delete(k); else if (v.busy) busy = true; }
  try {
    if (typeof wins !== 'undefined' && wins instanceof Map) {
      for (const [id, w] of wins) {
        if (!w || w.isDestroyed()) {
          wins.delete(id);
          bgWorkMap.delete(id);
          _hiddenIdleSince.delete(id);
          continue;
        }
        if (w.__hidden) {
          if (isBgBusy(id)) {
            _hiddenIdleSince.delete(id);
          } else {
            const idleStart = _hiddenIdleSince.get(id) || t;
            if (!_hiddenIdleSince.has(id)) _hiddenIdleSince.set(id, idleStart);
            if (t - idleStart >= 8000 && wins.size > 1) {
              _hiddenIdleSince.delete(id);
              try { w.webContents?.session?.closeAllConnections?.().catch(() => {}); w.webContents?.session?.clearCache?.().catch(() => {}); } catch {}
              try { w.destroy(); } catch {}
              wins.delete(id);
              bgWorkMap.delete(id);
              try { stopTunnel(id); } catch {}
              setTimeout(runNativeWorkingSetTrim, 200).unref?.();
            }
          }
        } else {
          _hiddenIdleSince.delete(id);
        }
      }
      if (wins.size > 2) {
        for (const [id, w] of [...wins.entries()]) {
          if (wins.size <= 2) break;
          if (!w || w.isDestroyed() || !w.__hidden || w.isFocused() || isBgBusy(id)) continue;
          try { w.__syncBounds?.(true); } catch {}
          try { w.webContents?.session?.closeAllConnections?.().catch(() => {}); w.webContents?.session?.clearCache?.().catch(() => {}); } catch {}
          try { destroyWindow(w); } catch {}
          wins.delete(id);
          bgWorkMap.delete(id);
          try { stopTunnel(id); } catch {}
        }
      }
    }
    if (typeof tunnels !== 'undefined' && tunnels instanceof Map) {
      for (const [tk, tv] of [...tunnels.entries()]) {
        if (!tv || tv.starting) continue;
        if (wins.has(tk) && !wins.get(tk)?.isDestroyed()) { tv.lastActiveAt = t; continue; }
        const isAcctTunnel = Boolean(acct(tk));
        const maxIdle = isAcctTunnel ? 18000 : 45000;
        if (t - (tv.lastActiveAt || 0) > maxIdle && !(isAcctTunnel && applyRoute?.busy?.has?.(tk))) {
          stopTunnel(tk);
          if (isAcctTunnel) { try { session.fromPartition(partOf(tk)).closeAllConnections().catch(() => {}); } catch {} }
        }
      }
    }
  } catch {}
  try { if (busy && psbId < 0) psbId = powerSaveBlocker.start('prevent-app-suspension'); else if (!busy && psbId >= 0) { powerSaveBlocker.stop(psbId); psbId = -1; } } catch {}
}
setInterval(bgCheck, 10000).unref?.();
// 电脑版 Google 登录改用本机 Chrome / Edge（内置浏览器会被 Google 拦下「此浏览器或应用可能不安全」）
const GB = require('./gbrowser');
ipcMain.handle('host:gbStart', async (e, o) => {
  const a = winAcct(e.sender); if (!a) return { error: '找不到账号' };
  // Google 登录流程自己加的认证锁（kind=google）允许走本机浏览器；其他认证任务的锁仍然只在内置窗口继续
  if (RouteState.locked(a) && a.routeAuth?.kind !== 'google') return { error: '认证环境已锁定，请在本账号内置窗口继续；不会静默切换到外部浏览器' };
  const u = String(o?.path || ''); if (!u.startsWith('/nextjs-api/sign-in/google') && !(process.env.BRANA_GB_TEST && u.startsWith('/'))) return { error: 'bad path' };
  const s = proxyStr(a); let proxy;
  if (isDirect(s)) proxy = { mode: 'direct' };
  else if (/^vless:/i.test(s)) {
    const c = await proxyConfig(a); if (a.tunErr) return { error: '节点连不上：' + a.tunErr };
    proxy = { rules: c.proxyRules };
  }
  else { const p = parseProxy(s); if (!p) return { error: '代理格式不正确' }; proxy = p; }
  const bypass = [];
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await GB.start({ id: a.id, ses: session.fromPartition(partOf(a.id)), proxy, bypass, privacy: BrowserPrivacy.profile(a), userData: app.getPath('userData'), url: 'https://arena.ai' + u, noSandbox: !!process.env.BRANA_NO_SANDBOX, log: t => console.log('[gbrowser]', t) });
  if (!r.started) stopTunnel(a.id + '-g');
  if (r.started) GB.wait(a.id).then(() => { stopTunnel(a.id + '-g'); try { if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } } catch {} });
  return r;
});
// 按住标签拖动 = 移动窗口：主进程跟着鼠标走（最大化时先还原，鼠标在窗口里的横向比例保持不变）
const winDrags = new Map();
ipcMain.handle('host:winDrag', (e, phase) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w || w.isDestroyed()) return false;
  const stop = () => { const d = winDrags.get(w.id); if (d) { clearInterval(d.iv); winDrags.delete(w.id); } };
  if (phase !== 'start') { stop(); return true; }
  stop();
  const p0 = screen.getCursorScreenPoint(); let b = w.getBounds();
  if (w.isMaximized() || w.isFullScreen()) {
    if (w.isFullScreen()) return false;
    const rx = (p0.x - b.x) / Math.max(1, b.width), oy = p0.y - b.y;
    w.unmaximize(); const nb = w.getBounds();
    b = { x: Math.round(p0.x - rx * nb.width), y: Math.round(p0.y - oy), width: nb.width, height: nb.height };
    w.setBounds(b);
  }
  const d = { iv: null, t: Date.now(), lastX: b.x, lastY: b.y };
  d.iv = setInterval(() => {
    if (w.isDestroyed() || Date.now() - d.t > 60000) { stop(); return; }
    const p = screen.getCursorScreenPoint();
    const nx = b.x + p.x - p0.x, ny = b.y + p.y - p0.y;
    if (nx === d.lastX && ny === d.lastY) return;
    d.lastX = nx; d.lastY = ny;
    try { w.setBounds({ x: nx, y: ny, width: b.width, height: b.height }); } catch {}
  }, 12);
  winDrags.set(w.id, d);
  return true;
});
ipcMain.handle('host:gbWait', e => { const a = winAcct(e.sender); return a ? GB.wait(a.id) : { error: '找不到账号' }; });
ipcMain.handle('host:gbCancel', e => { const a = winAcct(e.sender); return a ? GB.cancel(a.id) : false; });
ipcMain.handle('host:gnet', () => { if (Date.now() - G.at > 60000) gProbe(); return { ok: G.net === 1, tested: G.net >= 0, ms: G.ms, wanted: gWanted(), on: gOn() }; });
ipcMain.handle('host:bgWork', (e, w) => { bgWorkMap.set(e.sender.id, { busy: !!(w && (w.gacha || w.queue || w.stream)), at: Date.now() }); bgCheck(); return true; });
ipcMain.handle('host:exportAccounts', () => DB.accounts.map(a => ({ id: a.id, name: a.name, remark: a.remark || '', email: a.email || '', password: decPw(a.pw), proxy: a.proxy || '', proxyIp: a.proxyIp || '', region: a.region || '', nodeId: a.nodeId || '' })));

// 后台用账号自己的分区 + 代理直接调用 Brana 登录接口（不打开网页）
async function storeSetCookies(ses, r) {
  let list = [];
  try { list = r.headers.getSetCookie?.() || []; } catch {}
  if (!list.length) { const raw = r.headers.get('set-cookie'); if (raw) list = raw.split(/,(?=\s*[^;,=\s]+=)/); }
  for (const line of list) {
    const [nv, ...attrs] = line.split(';'); const i = nv.indexOf('='); if (i < 1) continue;
    const c = { url: 'https://arena.ai', name: nv.slice(0, i).trim(), value: nv.slice(i + 1).trim(), path: '/', secure: true };
    if (c.name === '__vdpl') {
      if (c.value && /^dpl_[A-Za-z0-9]{16,48}$/.test(c.value) && !EXPIRED_COST_DPLS.has(c.value)) rememberCostDpl(c.value, false);
      continue;
    }
    for (const at of attrs) { const [k, ...vv] = at.trim().split('='); const v = vv.join('='), kl = k.toLowerCase(); if (kl === 'domain') c.domain = v; else if (kl === 'path') c.path = v; else if (kl === 'httponly') c.httpOnly = true; else if (kl === 'max-age') c.expirationDate = Date.now() / 1000 + (+v); else if (kl === 'expires' && !c.expirationDate) { const t = Date.parse(v); if (t) c.expirationDate = t / 1000; } else if (kl === 'samesite') c.sameSite = /none/i.test(v) ? 'no_restriction' : /strict/i.test(v) ? 'strict' : 'lax'; }
    try { await ses.cookies.set(c); } catch {}
  }
}
async function refreshStatus(a, ses) {
  return refreshAccountStatus(a, ses, { fetch: fetchAccountResponse, exists: x => acct(x.id) === x, save: saveSoon });
}

async function authExit(ses) {
  const r = await fetchAccountResponse(ses, 'https://arena.ai/cdn-cgi/trace', {}, 12000);
  if (!r.ok) throw Error('实际出口检测失败（HTTP ' + r.status + '），未确认认证环境');
  const ip = /^ip=([0-9a-fA-F:.]+)\s*$/m.exec(await r.text())?.[1];
  if (!ip) throw Error('没有获得当前账号的实际出口'); return ip;
}
const backgroundEnvironment = a => 'native:' + JSON.stringify(RouteState.canonical(a.fp || {}));
const signInAccount = require('./account-auth').createAccountSignIn({
  find: acct, password: a => decPw(a.pw), session: prepSession, prepare: applyProxy,
  begin: async (a, email, ses) => {
    if (RouteState.locked(a)) {
      // 以前失败 / 中断的密码登录留下的锁（不是在等邮件，也不是刚刚开始的）：直接放掉，不要求用户手动取消
      const x = a.routeAuth || {};
      if (x.kind === 'login' && !x.stage && Date.now() - (x.at || 0) > 90000) authRouteGuard.task(a.id, { op: 'cancel', ticket: x.ticket });
      else throw Error('此账号有未完成认证，请在该账号窗口继续或明确取消，不从后台另开认证');
    }
    const expected = JSON.parse(JSON.stringify(pub(a)));
    authRouteGuard.task(a.id, { op: 'prepare', kind: 'login', email, expected, environment: backgroundEnvironment(a) });
    try {
      const ip = await authExit(ses);
      return authRouteGuard.task(a.id, { op: 'begin', kind: 'login', email, ip, expected, environment: backgroundEnvironment(a) });
    } catch (err) { try { authRouteGuard.task(a.id, { op: 'cancel', ticket: a.routeAuth?.ticket }); } catch {} throw err; }
  },
  release: async (a, lease) => authRouteGuard.task(a.id, { op: 'cancel', ticket: lease.ticket }),
  finish: async (a, user, ses, lease) => authRouteGuard.task(a.id, { op: 'finish', ticket: lease.ticket, email: user.email, ip: await authExit(ses), environment: backgroundEnvironment(a) }),
  syncCookies: async (ses, response) => {
    const cookies = await ses.cookies.get({ url: 'https://arena.ai' });
    if (!cookies.some(c => /^arena-auth-prod-v1/.test(c.name))) await storeSetCookies(ses, response);
    await ses.cookies.flushStore().catch(() => {});
  },
  save: () => saveDB(true),
  navigate: a => { const w = wins.get(a.id); if (w && !w.isDestroyed()) void navigateAccount(w.webContents); },
});
ipcMain.handle('host:signInAccount', async (e, id) => { try { return await signInAccount(id); } catch (err) { return { error: String(err.message || err) }; } });
const sendMagicLinkAccount = require('./account-auth').createAccountMagicLinkSender({
  find: acct,
  session: prepSession,
  prepare: applyProxy,
});
ipcMain.handle('host:sendMagicLinkAccount', async (_e, id, email, fullName) => {
  try { return await sendMagicLinkAccount(id, email, fullName); }
  catch (err) { return { ok: false, error: String(err?.message || err) }; }
});
const registerTokenAccount = require('./account-auth').createAccountTokenRegistrar({
  find: acct,
  password: a => decPw(a.pw),
  setPassword: (a, pw) => { if (pw) { a.pw = encPw(String(pw)); a.noAuto = false; } },
  session: prepSession,
  prepare: applyProxy,
  syncCookies: async (ses, response) => {
    const cookies = await ses.cookies.get({ url: 'https://arena.ai' });
    if (!cookies.some(c => /^arena-auth-prod-v1/.test(c.name))) await storeSetCookies(ses, response);
    await ses.cookies.flushStore().catch(() => {});
  },
  save: () => saveDB(true),
  navigate: a => { const w = wins.get(a.id); if (w && !w.isDestroyed()) void navigateAccount(w.webContents); },
});
ipcMain.handle('host:registerTokenAccount', async (e, id, opt) => {
  try { return await registerTokenAccount(id, opt && typeof opt === 'object' ? opt : {}); }
  catch (err) { return { error: String(err.message || err), mailFailed: !!err?.mailFailed, tokenInvalid: !!err?.tokenInvalid }; }
});
ipcMain.handle('host:setCookies', async (e, id, list) => {
  const a = acct(id); if (!a || !Array.isArray(list)) return false;
  const ses = prepSession(a); let n = 0;
  for (const c of list) { if (!c || !/^arena-auth-prod-v1(\.\d+)?$/.test(String(c.name || '')) || typeof c.value !== 'string') continue; try { await ses.cookies.set({ url: 'https://arena.ai', name: c.name, value: c.value, domain: c.domain || undefined, path: c.path || '/', secure: true, httpOnly: !!c.httpOnly, sameSite: 'lax', expirationDate: c.expirationDate || Date.now() / 1000 + 30 * 86400 }); n++; } catch {} }
  await ses.cookies.flushStore().catch(() => {}); return n;
});
let lastQuotaRefreshAt = 0, lastQuotaRefreshResult = null;
const refreshAllAccounts = createAccountRefresh({
  accounts: () => DB.accounts, exists: a => acct(a.id) === a, session: prepSession,
  // Never reset a live account's proxy/connections while it is chatting or running gacha.
  prepare: async a => { const w = wins.get(a.id); if (!w || w.isDestroyed()) await applyProxy(a); },
  refresh: async (a, ses) => {
    try { return await refreshStatus(a, ses); }
    finally {
      const w = wins.get(a.id);
      if (!w || w.isDestroyed()) {
        stopTunnel(a.id);
        try { await ses.closeAllConnections(); await ses.clearCache(); } catch {}
      }
    }
  },
  save: saveSoon, concurrency: 2,
});
ipcMain.handle('host:refreshQuotas', async (_e, force) => {
  if (!force && lastQuotaRefreshResult && Date.now() - lastQuotaRefreshAt < 180000) return lastQuotaRefreshResult;
  const res = await refreshAllAccounts();
  lastQuotaRefreshAt = Date.now();
  lastQuotaRefreshResult = res;
  return res;
});

// Probes are isolated, credential-free and globally bounded; slots are never shared concurrently.
const routeSlots = [0, 1];
const routeProofs = RouteNative.createProofs({ ttl: 3600000 });
const routeDrafts = RouteDrafts.createDrafts({ find: acct, publicAccount: pub });
const routeProbe = RouteNative.createProbe(async (event, candidate) => {
  const actor = routeActor(event, !candidate?.draft);
  const draft = candidate?.draft ? routeDrafts.get(actor, candidate.draft) : null;
  const account = draft ? draft.target || { proxy: 'direct' } : winAcct(event.sender); if (!account) return { ok: false, error: '账号已关闭' };
  const proofOwner = draft ? draft.owner : WebsiteRoute.proofOwner(event,account,OFFLINE);
  const slot = routeSlots.pop(), key = 'route-test-' + newId(), ses = session.fromPartition('route-probe-slot-' + slot); let releaseGuest = () => {};
  try {
    if (!candidate || typeof candidate.proxy !== 'string' || candidate.proxy.length > 64000 || !validProxy(candidate.proxy)) throw Error('候选线路无效');
    if (isDirect(candidate.proxy) && !isDirect(proxyStr(account)) && !['manual','auto-select'].includes(candidate.kind)) throw Error('不会自动改为直连');
    if (candidate.proxyIp && !/^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i.test(String(candidate.proxyIp))) throw Error('候选出口无效');
    if (parseProxy(candidate.proxy)?.user) throw Error('带认证的自定义代理不参与无凭据探测');
    const temp = { id: key, proxy: candidate.proxy, proxyIp: String(candidate.proxyIp || '') };
    const config = await proxyConfig(temp, key); if (temp.tunErr) throw Error('候选节点初始化失败');
    releaseGuest = guestProxyCheck(config.proxyRules || '');
    await ses.closeAllConnections(); await ses.clearAuthCache(); await ses.setProxy(config);
    const website = !draft && WebsiteRoute.target(event,OFFLINE);
    const ds = await directSession().catch(() => null);
    const pOpt = purityCacheOpt(ds);
    const result = website ? await WebsiteRoute.check(ses,website) : await RouteNative.checkService(ses, 6500, pOpt);
    if (draft) routeDrafts.get(actor, candidate.draft);
    if(website&&result.ok)Object.assign(result,await RouteNative.purity(ses, 3200, null, result.ip || '', pOpt));
    if(routeActor(event,!draft)!==actor||(!draft&&WebsiteRoute.proofOwner(event,account,OFFLINE)!==proofOwner)||website&&WebsiteRoute.target(event,OFFLINE)!==website)throw Error('页面或目标网站已改变，取消旧检测结果');
    return routeProofs.issue(proofOwner, candidate, result);
  } catch (e) { return { ok: false, kind: e.kind || 'network', error: String(e.message || e) }; }
  finally { releaseGuest(); try { await ses.closeAllConnections(); } catch {} stopTunnel(key); routeSlots.push(slot); try { fs.unlinkSync(path.join(app.getPath('userData'), 'xray', key + '.json')); } catch {} }
}, 2);
function validateRouteCandidate(a, route, options, proofOwner = a.id) {
    if (RouteState.locked(a)) throw Error('账号正在认证，禁止自动换节点或出口');
    if (!route || Object.keys(route).some(k => !['proxy','proxyIp','nodeId','region','routeHome'].includes(k))) throw Error('候选参数无效');
    const allowedDirect = options.manual === true && ['auto','direct'].includes(options.mode) && isDirect(route.proxy);
    const allowedProxy = options.manual === true && ['auto','proxy'].includes(options.mode) && !/^vless:/i.test(route.proxy) && !isDirect(route.proxy) && !parseProxy(route.proxy)?.user;
    if (!validProxy(route.proxy) || !(allowedDirect || allowedProxy || /^vless:\/\//i.test(route.proxy) || /^(?:http|socks5?):\/\/127\.0\.0\.1:\d{1,5}$/.test(route.proxy))) throw Error('候选必须为已检测的节点或代理；直连需明确选择');
    if (options.manual && options.mode === 'direct' && !isDirect(route.proxy)) throw Error('直连模式只能使用直连');
    if (options.manual && options.mode === 'proxy' && (/^vless:/i.test(route.proxy) || isDirect(route.proxy))) throw Error('代理模式只能使用本机或自定义代理');
    if (options.manual && options.mode === 'node' && !/^vless:/i.test(route.proxy)) throw Error('节点模式只能应用节点');
    routeProofs.check(proofOwner, route, options.ticket);
    if (['proxy','proxyIp','nodeId','region','routeHome'].some(k => route[k] !== undefined && typeof route[k] !== 'string')) throw Error('候选字段类型无效');
    if (route.proxyIp && !/^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i.test(route.proxyIp)) throw Error('候选出口无效');
    if (/^vless:/i.test(route.proxy) && route.proxy !== a.proxy) { const node = DB.shared?.nodes?.find?.(x => x.id === route.nodeId); if (!node || Vless.toLink(node) !== route.proxy) throw Error('候选节点已改变'); }
    if (route.proxyIp && !options.manual) { const pool = DB.shared?.pippool || {}, item = pool.ips?.[route.proxyIp]; if (!item || item.gone || pool.ban?.[route.proxyIp.toLowerCase()] || item.cool > Date.now()) throw Error('候选出口已改变或冷却'); }
    if (route.proxyIp && DB.accounts.some(x => x.id !== a.id && pipKey(x.proxyIp) === pipKey(route.proxyIp))) throw Error('候选出口已被占用');
}
const applyRoute = RouteNative.createApply({
  find: acct, owner: e => winAcct(e.sender), publicAccount: pub, persist: () => saveDB(true),
  validate: (a,route,options,event) => validateRouteCandidate(a,route,options,WebsiteRoute.proofOwner(event,a,OFFLINE)),
  apply: async (a,context={}) => { await applyProxy(a,{force:context.manual===true,deferReload:context.manual===true}); if (a.tunErr) throw Error('节点应用失败，恢复原线路'); },
});
const saveRouteDraft = RouteDrafts.createSave({
  drafts: routeDrafts, busy: applyRoute.busy, publicAccount: pub, exists: a => acct(a.id) === a,
  build: (current, input) => RouteDrafts.buildAccount(current, input, { newId, genFp, cleanFp, encPw, validProxy }),
  validate(draft, candidate, request, changed) {
    if (candidate.email && DB.accounts.some(x => x !== draft.target && String(x.email || '').toLowerCase() === candidate.email.toLowerCase())) throw Error('该邮箱已存在，请在对应账号中编辑；不会覆盖已有账号');
    if (candidate.proxyIp && DB.accounts.some(x => x !== draft.target && pipKey(x.proxyIp) === pipKey(candidate.proxyIp))) throw Error('ProxyIP 已被其他账号占用');
    if (changed) {
      const route = Object.fromEntries(['proxy','proxyIp','nodeId','region','routeHome'].map(k => [k, String(candidate[k] || '')]));
      validateRouteCandidate(draft.target || { id: candidate.id, proxy: '' }, route, { manual: true, mode: RouteState.mode(candidate), ticket: request.ticket }, draft.owner);
    }
  },
  apply: async candidate => { await applyProxy(candidate); if (candidate.tunErr) throw Error('目标账号线路应用失败，保留原配置'); },
  publish(current, candidate, fields) {
    if (!current) { DB.accounts.push(candidate); return () => { const i = DB.accounts.indexOf(candidate); if (i >= 0) DB.accounts.splice(i, 1); }; }
    const before = Object.fromEntries(fields.map(k => [k, { has: Object.hasOwn(current, k), value: current[k] }]));
    for (const key of fields) { if (candidate[key] === undefined) delete current[key]; else current[key] = candidate[key]; }
    return () => { for (const [key, value] of Object.entries(before)) { if (value.has) current[key] = value.value; else delete current[key]; } };
  },
  persist: () => saveDB(true),
  discard: async candidate => { stopTunnel(candidate.id); const ses = session.fromPartition(partOf(candidate.id)); await ses.closeAllConnections(); await ses.clearStorageData(); },
  after(account, request) { routeProofs.consume(request.ticket); const w = wins.get(account.id); if (w && !w.isDestroyed()) w.setTitle((typeof APP_TITLE==='string'?APP_TITLE:'Brana AI')+' · '+account.name); },
});
ipcMain.handle('host:routeDraft', (e, request) => {
  try { const actor = routeActor(e); if (request?.op === 'open') return routeDrafts.open(actor, request.id || ''); if (request?.op === 'close') return routeDrafts.close(actor, request.draft); if (request?.op === 'status') return routeDrafts.status(actor, request.draft); throw Error('草稿操作无效'); }
  catch (error) { return { ok: false, code: error.code || 'ROUTE_DRAFT_FAILED', error: String(error.message || error) }; }
});
ipcMain.handle('host:routeSave', async (e, request) => { try { return await saveRouteDraft(routeActor(e), request); } catch (error) { return { ok: false, error: String(error.message || error) }; } });
ipcMain.handle('host:routeProbe', (e, o) => routeProbe(e, o));
ipcMain.handle('host:routeApply', async (e, o) => {
  routeActor(e,true);const wc=e.sender,source=wc.getURL(),result=await applyRoute(e,o);
  if(result.ok){
    routeProofs.consume(o.ticket);
    if(o.manual&&!browserRouteOwners.has(wc)&&!wc.__clientShell&&!source.startsWith('file:')&&!source.startsWith(UI_URL))setTimeout(()=>{
      if(!wc.isDestroyed()&&winAcct(wc)?.id===o.id&&(wc.getURL()===source||wc.getURL()==='about:blank'))void navigateBrowser(wc,source);
    },100);
  }
  return result;
});
ipcMain.handle('host:routePrefs', (e, on) => { const a = winAcct(e.sender); if (!a || typeof on !== 'boolean') return { ok: false }; if (applyRoute.busy.has(a.id)) return { ok: false, error: '线路正在切换' }; const key = RouteState.mode(a) === 'node' ? 'nodeFailover' : 'routeAuto'; if (!['auto','node'].includes(RouteState.mode(a))) return { ok: false, error: '代理和直连模式不自动换线路' }; RouteState.assertChange(a, { [key]: on }); const old = a[key]; a[key] = on; try { saveDB(true); return { ok: true }; } catch (x) { if (old === undefined) delete a[key]; else a[key] = old; throw x; } });

// 代理认证
app.on('login', (event, wc, details, authInfo, cb) => {
  if (!authInfo.isProxy) return;
  if (!wc && guestProxyChecks.has(String(authInfo.host).toLowerCase()+':'+authInfo.port)) { event.preventDefault(); cb(); return; }
  let a = wc ? winAcct(wc) : null;
  if (!a) a = DB.accounts.find(x => { const p = parseProxy(x.proxy); return p && p.user && p.rules.endsWith(`${authInfo.host}:${authInfo.port}`); });
  const p = a && parseProxy(proxyStr(a));
  if (p && p.user) { event.preventDefault(); cb(p.user, p.pass); }
});

let quitting = false;
app.on('before-quit', () => {
  quitting = true;
  captureAllWindowBounds();
  const open = shownIds();
  if (open.length) DB.open = open;
  saveDB();
});
app.on('second-instance', (e, argv) => {
  if (Array.isArray(argv) && argv.includes('--quit-for-update')) { void quitForUpdate(0); return; }
  const w = [...wins.values()].find(x => !x.isDestroyed() && !x.__hidden) || [...wins.values()].find(x => !x.isDestroyed());
  if (w) { w.__hidden = false; if (!w.isVisible()) w.show(); if (w.isMinimized()) w.restore(); w.focus(); }
  else void openAccountSafe(DB.last || DB.accounts[0]?.id);
});
app.on('window-all-closed', () => app.quit());

function menu() {
  const tpl = [
    { label: '账号', submenu: [{ label: '修改当前账号代理…', accelerator: 'CmdOrCtrl+Shift+P', click: (_, w) => {
      if (!w || w.isDestroyed()) return;
      if (w.webContents.__clientShell && String(w.webContents.getURL() || '').startsWith(UI_URL)) {
        w.webContents.executeJavaScript('try{window.__anc?.RegionIP?.open?.();}catch{}').catch(() => {});
        return;
      }
      w.webContents.loadFile(OFFLINE, { query: { desc: '修改代理' } }).catch(error => runtimeLog('offline-load-failed', { code: error.code }));
    } }, { label: '打开全部账号窗口', click: () => DB.accounts.forEach(a => void openAccountSafe(a.id)) }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '视图', submenu: [
      { label: '重新载入界面', accelerator: 'F5', click: (_, w) => { if (w) void navigateAccount(w.webContents); } },
      { label: '开发者工具', accelerator: 'F12', click: (_, w) => w?.webContents.toggleDevTools() },
      { type: 'separator' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'resetZoom', label: '重置缩放' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// 显卡不可用 / 被禁用时 WebGL 会失效，reCAPTCHA 的 execute 会一直不返回（新对话发不出去）：允许退回软件渲染
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('process-per-site');
try {
  app.commandLine.appendSwitch('lang', 'zh-CN');
  app.commandLine.appendSwitch('accept-lang', 'zh-CN,zh,en-US,en');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --initial-old-space-size=16 --max-semi-space-size=2 --optimize-for-size --lazy-feedback-allocation --memory-reducer --expose-gc');
  app.commandLine.appendSwitch('renderer-process-limit', '1');
  app.commandLine.appendSwitch('num-raster-threads', '1');
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disk-cache-size', '4194304');
  app.commandLine.appendSwitch('media-cache-size', '1048576');
  app.commandLine.appendSwitch('gpu-program-cache-size-kb', '256');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('enable-features', 'PartitionAllocMemoryReclaimer');
  app.commandLine.appendSwitch('disable-features', 'BackForwardCache,CalculateNativeWinOcclusion,Translate,OptimizationHints,MediaRouter');
  setInterval(() => { try { global.gc?.(); } catch {} }, 45000).unref?.();
} catch {}
app.whenReady().then(async () => {
  BrowserPrivacy.secureResolver(app);
  try { checkPending(); } catch {}
  loadDB();
  let dbRestored = false;
  if (updRestoredBounds && typeof updRestoredBounds === 'object') {
    for (const [id, b] of Object.entries(updRestoredBounds)) {
      const a = acct(id);
      if (a && b && typeof b === 'object') { a.winBounds = b; dbRestored = true; }
    }
  }
  if (updRestoredOpen && updRestoredOpen.length) {
    const validOpen = updRestoredOpen.filter(id => acct(id));
    if (validOpen.length) { DB.open = validOpen; dbRestored = true; }
    if (updRestoredLast && acct(updRestoredLast)) { DB.last = updRestoredLast; dbRestored = true; }
  }
  if (dbRestored) { try { saveDB(); } catch {} }
  try { themeWas = DB.shared?.prefs?.theme; syncThemeSource(); } catch {} showSplash(); loadBundle(); menu();
  gProbe().catch(() => {}); setInterval(() => gProbe().catch(() => {}), 5 * 60e3);
  const ids = (DB.open || []).filter(id => acct(id));
  if (!ids.length) ids.push(DB.last && acct(DB.last) ? DB.last : DB.accounts[0].id);
  const savedLast = (DB.last && ids.includes(DB.last)) ? DB.last : ids[0];
  const bootIds = (updRestoredOpen && updRestoredOpen.length > 1) ? ids : (!app.isPackaged || ids.length <= 4 ? ids : [savedLast]);
  DB.open = [...bootIds];
  DB.last = savedLast;
  try { saveDB(); } catch {}
  for (const id of bootIds) await openAccountSafe(id);
  setTimeout(async () => {
    try {
      const userData = app.getPath('userData');
      const xDir = path.join(userData, 'xray');
      const activeIds = new Set((DB.accounts || []).map(a => String(a?.id || '').replace(/[^\w-]/g, '_')).filter(Boolean));
      const xFiles = await fs.promises.readdir(xDir).catch(() => []);
      for (const f of xFiles) {
        if (/^(?:delay|probe|route-test|ip-test)-.*\.json$/i.test(f)) {
          await fs.promises.unlink(path.join(xDir, f)).catch(() => {});
        } else {
          const m = /^([0-9a-f]{10})\.json$/i.exec(f);
          if (m && !activeIds.has(m[1])) {
            await fs.promises.unlink(path.join(xDir, f)).catch(() => {});
          }
        }
      }
      const uFiles = await fs.promises.readdir(userData).catch(() => []);
      for (const f of uFiles) {
        if (/\.(?:tmp|bak-\d+)$/i.test(f) || /^Preferences~RF.*\.TMP$/i.test(f)) {
          await fs.promises.unlink(path.join(userData, f)).catch(() => {});
        }
      }
      const pDir = path.join(userData, 'Partitions');
      const pDirs = await fs.promises.readdir(pDir).catch(() => []);
      for (const d of pDirs) {
        const m = /^acct-([0-9a-f]{10})$/i.exec(d);
        if (m && !activeIds.has(m[1])) {
          await fs.promises.rm(path.join(pDir, d), { recursive: true, force: true }).catch(() => {});
        } else {
          const partPath = path.join(pDir, d);
          const pfList = await fs.promises.readdir(partPath).catch(() => []);
          for (const pf of pfList) {
            if (/^Preferences~RF.*\.TMP$/i.test(pf) || /\.tmp$/i.test(pf)) {
              await fs.promises.unlink(path.join(partPath, pf)).catch(() => {});
            }
          }
        }
      }
      const sPath = path.join(userData, 's');
      const sFiles = await fs.promises.readdir(sPath).catch(() => []);
      const cutoff = Date.now() - 5 * 60e3;
      for (const f of sFiles) {
        if (/\.tmp$/i.test(f)) {
          const full = path.join(sPath, f);
          const st = await fs.promises.stat(full).catch(() => null);
          if (st && st.mtimeMs < cutoff) await fs.promises.unlink(full).catch(() => {});
        } else {
          const sm = /^([0-9a-f]{10})\.json$/i.exec(f);
          if (sm && !activeIds.has(sm[1])) await fs.promises.unlink(path.join(sPath, f)).catch(() => {});
        }
      }
    } catch {}
  }, 4000).unref?.();
}).catch(error => { runtimeLog('startup-failed', { kind: error.name, code: error.code }); closeSplash(); dialog.showErrorBox('Brana AI 启动失败', '请重试。账号数据未删除；诊断记录在数据目录 logs/runtime.jsonl。'); });
