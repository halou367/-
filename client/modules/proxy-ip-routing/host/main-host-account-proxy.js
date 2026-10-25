// Brana AI desktop main process: isolated workspace windows, session partitions, and network routing
const { app, BrowserWindow, WebContentsView, webContents, session, ipcMain, shell, Menu, nativeTheme, safeStorage, nativeImage, clipboard, dialog, net: enet, powerSaveBlocker, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
// This experimental build must never open the production Arena Client profile.
const EXTENSION_TEST = require('./extension-test-identity').configure(app);
const APP_TITLE = EXTENSION_TEST.title;
// 所有 xray 子进程（隧道 + 检测）：更新 / 退出前全部结束。以前正在检测的 xray 在程序退出后还活着，占着安装目录里的 xray.exe，
// 安装程序卸载旧版失败就静默退出 —— 表现为「更新完成正在重启」后闪退，重开还是旧版
const KIDS = new Set();
const track = p => { KIDS.add(p); p.on('exit', () => KIDS.delete(p)); p.on('error', () => KIDS.delete(p)); return p; };
function killKids() {
  for (const p of [...KIDS]) { try { p.kill(); } catch {} if (process.platform === 'win32' && p.pid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(p.pid)], { windowsHide: true, timeout: 3000 }); } catch {} } }
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
app.on('child-process-gone', (_, details) => runtimeLog('child-process-gone', { kind: details.type, reason: details.reason, exitCode: details.exitCode }));
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
  if (cur && cur.sig === sig && cur.starting) return cur.starting;
  if (cur && cur.sig === sig && cur.proc.exitCode === null) return cur.port;
  stopTunnel(key);
  const bin = xrayBin(); if (!bin) throw new Error(process.platform === 'win32' ? '没有找到内置 xray 内核（resources/bin/xray.exe），请用完整安装包重新安装' : '没有找到 xray 内核（把 xray 放到 bin/ 目录）');
  const t = { sig, port: 0, proc: { exitCode: 0 }, log: '' }; tunnels.set(key, t);
  t.starting = (async () => {
    const port = await freePort(), dir = path.join(app.getPath('userData'), 'xray'); fs.mkdirSync(dir, { recursive: true });
    const cfg = path.join(dir, key.replace(/[^\w-]/g, '_') + '.json'); fs.writeFileSync(cfg, JSON.stringify(await ProxyDNS.protectConfig(Vless.withCap(Vless.config(ob, port, key.startsWith('ip-test-') ? 'info' : 'warning'), cap)), null, 2));
    const proc = track(spawn(bin, ['run', '-c', cfg], { cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    t.proc = proc; t.port = port;
    const onLog = d => { t.log = (t.log + d).slice(-4000); }; proc.stdout.on('data', onLog); proc.stderr.on('data', onLog);
    proc.on('error', e => onLog('\n' + e.message)); proc.on('exit', () => { if (tunnels.get(key) === t && !t.starting) tunnels.delete(key); });
    const ok = await waitPort(port, 8000);
    if (!ok || proc.exitCode !== null) { const msg = t.log.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ').slice(0, 240); stopTunnel(key); throw new Error('xray 启动失败' + (msg ? '：' + msg : '')); }
    return port;
  })();
  try { return await t.starting; } finally { t.starting = null; }
}
function stopTunnel(key) {
  const t = tunnels.get(key);
  if (t) { tunnels.delete(key); try { t.proc.kill?.(); } catch {} }
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
      if(force||ses.__lastProxyRuleKey!==proxyRuleKey){await ses.setProxy(config);ses.__lastProxyRuleKey=proxyRuleKey;check();}
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
      timer = setTimeout(() => reject(Error('隐私设置超时：' + method)), 6000);
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
  const gone = (id, t, error) => targets.get(id) !== t || /target closed|Session with given id not found|No target with given id/i.test(error.message);
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