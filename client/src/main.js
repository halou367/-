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
// 改名 Brana AI 后仍用原来的数据目录 “Arena Client”（账号 / 登录数据不丢，目录名不能改）
try { const d = app.getPath('userData'); if (['Brana AI', 'Arena Ai'].includes(path.basename(d))) app.setPath('userData', path.join(path.dirname(d), 'Arena Client')); } catch {}
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
  runtimeLog('main-unhandled-rejection', { kind: error?.name, code: error?.code });
  console.error('Unhandled rejection:', error);
});
process.on('uncaughtException', error => {
  runtimeLog('main-uncaught-exception', { kind: error?.name, code: error?.code });
  console.error('Uncaught exception:', error);
});
app.on('child-process-gone', (_, details) => runtimeLog('child-process-gone', { kind: details.type, reason: details.reason, exitCode: details.exitCode }));
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

if (!app.requestSingleInstanceLock() || process.argv.includes('--quit-for-update')) { app.quit(); process.exit(0); }

let BUNDLE = '';
const loadBundle = () => { BUNDLE = build(path.join(__dirname, '..', 'ui'), VERSION); };

// ---------- 账号存储 ----------
const dataFile = () => path.join(app.getPath('userData'), 'accounts.json');
let DB = { accounts: [], open: [] };
function loadDB() {
  try { DB = { accounts: [], open: [], ...JSON.parse(fs.readFileSync(dataFile(), 'utf8')) }; } catch {}
  if (!DB.accounts.length) DB.accounts.push({ id: newId(), name: '账号 1', proxy: '' });
  // 每个账号随机绑定一个指纹（旧账号第一次启动时补上）
  let ch = false; for (const a of DB.accounts) if (!a.fp || !a.fp.seed) { a.fp = genFp(); ch = true; }
  if (ch) saveDB();
}
function saveDB(strict = false) {
  const file = dataFile(), tmp = file + '.rename.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (strict) {
      // Rename acknowledgement must not succeed after a failed write or truncate the original DB.
      fs.writeFileSync(tmp, JSON.stringify(DB, null, 2)); fs.renameSync(tmp, file);
    } else fs.writeFileSync(file, JSON.stringify(DB, null, 2));
  } catch (e) { console.error(e); if (strict) throw e; }
  finally { if (strict) { try { fs.unlinkSync(tmp); } catch {} } }
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
let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveDB, 800); };
// 浏览器模式里登录过的第三方网站（目前只有 GitHub）：只看该账号分区里的 Cookie 名字，不发请求、不读密码；结果存进账号记录，切换账号的卡片据此显示站点标记
const siteLogins = SiteLogins.createSiteLogins({ log: runtimeLog, read: id => acct(id)?.sites, write: (id, sites) => { const a = acct(id); if (!a) return; a.sites = sites; saveSoon(); } });
// 密码只存本机：优先用系统钥匙串加密（safeStorage），不可用时退回 base64
function encPw(p) { if (!p) return ''; try { if (safeStorage.isEncryptionAvailable()) return 'ss:' + safeStorage.encryptString(p).toString('base64'); } catch {} return 'b64:' + Buffer.from(p, 'utf8').toString('base64'); }
function decPw(v) { if (!v) return ''; try { if (v.startsWith('ss:')) return safeStorage.decryptString(Buffer.from(v.slice(3), 'base64')); if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8'); } catch {} return ''; }
const byEmail = em => { const k = String(em || '').trim().toLowerCase(); return k ? DB.accounts.find(a => String(a.email || '').toLowerCase() === k) : null; };

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
async function waitPort(port, ms) { const end = Date.now() + ms; while (Date.now() < end) { const ok = await new Promise(r => { const c = net.connect(port, '127.0.0.1'); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); }); if (ok) return true; await new Promise(r => setTimeout(r, 150)); } return false; }
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
function stopTunnel(key) { const t = tunnels.get(key); if (!t) return; tunnels.delete(key); try { t.proc.kill?.(); } catch {} }
app.on('will-quit', () => { for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); });
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
  const existingView = wins.get(a.id)?.webContents;
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
      await ses.setProxy(config);check();
      await ses.clearHostResolverCache?.();check();
      applyFp(snapshot);
      const wc=wins.get(a.id)?.webContents;
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
      if(wc){wc.__privacyNeedsReload=wc.__privacyNeedsReload||changed;
        if(!deferReload&&wc.__privacyNeedsReload&&/^https?:/.test(wc.getURL()))setTimeout(()=>{if(!wc.isDestroyed()&&epoch===ses.__routeEpoch&&!ses.__routeBlocked){wc.__privacyNeedsReload=false;wc.reload();}},50);
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
function applyFp(a) { const ses = session.fromPartition(partOf(a.id)), f = a.fp || {}, p=BrowserPrivacy.profile(a); ses.setUserAgent(f.ua || UA, (p.languages.length?p.languages:app.getPreferredSystemLanguages()).join(',')); googleHdr(ses); }
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
function prepSession(a) {
  const ses = session.fromPartition(partOf(a.id));
  if (ses.__prepared) return ses; ses.__prepared = true;
  cookiePersistence.watch(ses); siteLogins.watch(a.id, ses);
  applyFp(a);
  ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>cb({cancel:!!ses.__routeBlocked}));
  ses.webRequest.onHeadersReceived((d,cb)=>{const headers={...d.responseHeaders};for(const key of Object.keys(headers))if(key.toLowerCase()==='x-dns-prefetch-control')delete headers[key];headers['X-DNS-Prefetch-Control']=['off'];cb({responseHeaders:headers});});
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
const BRANA_SVG = '<svg width=\"160\" height=\"34\" viewBox=\"0 0 442 94\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M42.0341 39.5754C38.0998 39.5754 34.9132 42.8134 34.9132 46.811V91.9553H39.448V46.811C39.448 45.3539 40.6124 44.1708 42.0464 44.1708C43.4804 44.1708 44.6447 45.3539 44.6447 46.811V91.9553H49.1795V46.811C49.1795 42.8134 45.9929 39.5754 42.0586 39.5754H42.0341Z\" fill=\"currentColor\"/><path d=\"M79.7105 39.5754C75.7762 39.5754 72.5896 42.8134 72.5896 46.811V91.9553H77.1244V46.811C77.1244 45.3539 78.2888 44.1708 79.7228 44.1708C81.1567 44.1708 82.3211 45.3539 82.3211 46.811V91.9553H86.8559V46.811C86.8559 42.8134 83.6693 39.5754 79.735 39.5754H79.7105Z\" fill=\"currentColor\"/><path d=\"M60.8785 39.5754C56.9443 39.5754 53.7576 42.8134 53.7576 46.811V91.9553H58.2925V46.811C58.2925 45.3539 59.4568 44.1708 60.8908 44.1708C62.3248 44.1708 63.4891 45.3539 63.4891 46.811V91.9553H68.0239V46.811C68.0239 42.8134 64.8373 39.5754 60.903 39.5754H60.8785Z\" fill=\"currentColor\"/><path d=\"M105.036 20.81L108.174 15.2681H115.466L121.754 0H0L6.28747 15.2681H13.58L16.7053 20.81C10.6139 22.9271 5.60112 28.3071 5.60112 36.4144C5.60112 44.5217 11.3616 51.3836 19.99 51.3836C21.8775 51.3836 23.6301 50.9851 25.1867 50.2877V91.9699H29.7092V46.6139C31.131 44.6586 31.9644 42.2177 32.0257 39.453C32.0257 39.4157 32.0379 39.3659 32.0379 39.316C32.0379 39.2787 32.0257 39.2538 32.0257 39.2164C32.0257 39.1915 32.0379 39.1666 32.0379 39.1417C32.0379 39.1043 32.0257 39.067 32.0257 39.0172C31.9766 37.1491 31.4864 35.4056 30.6284 33.9236H91.1255C90.2675 35.4056 89.7773 37.1491 89.7282 39.0172C89.7282 39.067 89.716 39.1043 89.716 39.1417V39.316C89.716 39.316 89.7282 39.4157 89.7282 39.453C89.7895 42.2177 90.6229 44.6586 92.0447 46.6139V91.9699H96.5672V50.2877C98.1238 50.9851 99.8642 51.3836 101.764 51.3836C110.38 51.3836 116.153 44.2228 116.153 36.4144C116.153 28.6059 111.128 22.9271 105.036 20.81ZM9.30252 10.6603L6.80224 4.60784H114.952L112.451 10.6603H9.30252ZM102.953 15.2681L100.44 19.7141H21.3137L18.8011 15.2681H102.953ZM101.764 46.7758C97.3394 46.7758 94.2998 43.7371 94.2508 39.2662C94.2753 36.103 96.2853 33.9859 99.2023 33.9485H99.2881C101.114 33.9485 102.61 35.4803 102.61 37.0868V37.1616C102.573 38.0956 101.837 38.8179 100.918 38.8179C99.6681 38.8179 98.6508 39.8515 98.6508 41.1218C98.6508 42.3921 99.6681 43.4257 100.918 43.4257C104.35 43.4257 107.157 40.5988 107.157 37.0868C107.157 36.9748 107.132 36.8627 107.12 36.7631C106.936 32.6409 103.615 29.3532 99.2269 29.3532H60.8647L60.5705 29.3407H60.2641L22.527 29.3532C18.1393 29.3532 14.8178 32.6409 14.634 36.7631C14.6217 36.8627 14.5972 36.9748 14.5972 37.0868C14.5972 40.5988 17.4039 43.4257 20.8357 43.4257C22.0858 43.4257 23.1031 42.3921 23.1031 41.1218C23.1031 39.8515 22.0858 38.8179 20.8357 38.8179C19.9165 38.8179 19.1811 38.0956 19.1321 37.1616C19.1321 37.1367 19.1443 37.1118 19.1443 37.0868C19.1443 35.4803 20.6273 33.9485 22.4658 33.9485H22.5393C25.4686 33.9859 27.4786 36.103 27.5031 39.2662C27.4541 43.7371 24.4023 46.7758 19.99 46.7758C14.1805 46.7758 10.1359 42.006 10.1359 36.4144C10.1359 28.8675 15.9577 24.3094 23.1521 24.3094H98.6018C105.796 24.3094 111.618 28.8675 111.618 36.4144C111.618 42.006 107.573 46.7758 101.764 46.7758Z\" fill=\"currentColor\"/><path d=\"M5.587044534412955 4.097165991902827 17.381916329284753 5.214574898785415C17.506072874493928 17.754385964912274 17.506072874493928 30.170040485829958 17.506072874493928 42.585695006747635V47.800269905533064C17.506072874493928 60.960863697705804 17.506072874493928 73.99730094466936 17.381916329284753 86.78542510121457L5.587044534412955 87.90283400809716V92.0H43.82726045883941C74.61808367071525 92.0 83.68151147098516 78.96356275303644 83.68151147098516 66.67206477732793C83.68151147098516 54.0080971659919 74.8663967611336 45.19298245614035 53.387314439946024 43.08232118758434C72.13495276653171 39.854251012145745 78.46693657219973 31.287449392712546 78.46693657219973 21.72739541160594C78.46693657219973 9.063427800269906 69.52766531713901 0.0 46.931174089068826 0.0H5.587044534412955ZM34.88798920377868 46.06207827260459H41.84075573549258C58.10526315789474 46.06207827260459 65.67881241565452 52.766531713900136 65.67881241565452 66.92037786774628C65.67881241565452 80.32928475033738 57.2361673414305 87.53036437246963 43.08232118758435 87.53036437246963H35.26045883940621C34.88798920377868 74.49392712550608 34.88798920377868 61.08502024291498 34.88798920377868 46.06207827260459ZM35.26045883940621 4.5937921727395405H42.21322537112011C55.99460188933873 4.5937921727395405 61.45748987854251 11.049932523616732 61.45748987854251 22.099865047233465C61.45748987854251 34.63967611336032 54.50472334682861 41.84075573549258 40.72334682860999 41.84075573549258H34.88798920377868C34.88798920377868 29.052631578947363 34.88798920377868 16.76113360323886 35.26045883940621 4.5937921727395405Z\" transform=\"translate(124.4 0)\" fill=\"currentColor\"/><path d=\"M226.756 92.0345H198.418V87.6791C202.704 87.6791 204.729 87.6791 204.729 81.2668V43.2774C204.729 34.4455 204.609 33.9615 197.465 36.0183V31.6628L217.707 22.8309V37.3491C221.517 30.211 227.352 23.3148 233.781 23.3148C238.901 23.3148 242.711 26.7024 242.711 32.3887C242.711 37.2281 240.092 40.0108 236.163 40.0108C231.043 40.0108 230.09 34.8084 226.875 34.8084C224.494 34.8084 221.041 40.6157 217.707 47.3909V81.2668C217.707 87.6791 219.493 87.6791 226.756 87.6791V92.0345Z\" transform=\"translate(13.6 0)\" fill=\"currentColor\"/><path d=\"M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z\" transform=\"translate(-104.2 0)\" fill=\"currentColor\"/><path d=\"M326.059 92.0345H298.078V87.6791C302.364 87.6791 304.388 87.6791 304.388 81.2668V43.2774C304.388 34.4455 304.269 33.9615 297.125 36.0183V31.6628L317.367 22.8309V34.8084C322.01 28.7592 328.559 23.3148 336.775 23.3148C348.205 23.3148 354.635 30.6949 354.635 42.6725V81.2668C354.635 87.6791 356.659 87.6791 361.303 87.6791V92.0345H333.084V87.6791C339.632 87.6791 341.657 87.6791 341.657 81.2668V44.4873C341.657 36.8652 338.204 32.9936 332.012 32.9936C326.059 32.9936 321.177 36.7442 317.367 41.8256V81.2668C317.367 87.6791 319.153 87.6791 326.059 87.6791V92.0345Z\" transform=\"translate(20.7 0)\" fill=\"currentColor\"/><path d=\"M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z\" transform=\"translate(21.5 0)\" fill=\"currentColor\"/></svg>';
function showSplash() {
  if (splash || process.env.BRANA_NO_SPLASH) return;
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
function splashText(t) { if (splash && !splash.isDestroyed()) splash.webContents.executeJavaScript('window.set&&set(' + JSON.stringify(t) + ')').catch(() => {}); }
function closeSplash() { const s = splash; splash = null; if (s && !s.isDestroyed()) setTimeout(() => { try { s.destroy(); } catch {} }, 120); }

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
    wc.on('dom-ready',()=>{const u=wc.getURL();if(u.startsWith(UI_URL))void wc.executeJavaScript(BUNDLE).catch(()=>{});else if(/^(https:\/\/|chrome-extension:\/\/)/.test(u)&&WEBBAR)void wc.executeJavaScript('window.__ancBarPad='+JSON.stringify(WEBBAR_PAD)+';window.__ancBarTheme='+JSON.stringify(barTheme())+';'+WEBBAR).catch(()=>{});});
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
  const w = new BrowserWindow({
    width: 1320, height: 880, minWidth: 720, minHeight: 480, title: `${APP_TITLE} · ${(a.email || '').split('@')[0] || a.name}`, show: false, icon: ICON,
    backgroundColor: themeBg(), autoHideMenuBar: true,
    // 不要系统白色标题栏：内容铺满窗口，标签栏当拖动区；Windows / Linux 右上角保留系统按钮并跟随主题色
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 }, roundedCorners: true } : { titleBarOverlay: themeOverlay() }),
    webPreferences: { partition: partOf(a.id), preload: path.join(__dirname, 'preload.js'), nodeIntegrationInSubFrames: true, contextIsolation: true, sandbox: !process.env.BRANA_NO_SANDBOX, backgroundThrottling: false, spellcheck: false },
  });
  wins.set(id, w); w.__hidden = hidden;
  keepRound(w, 10); keepViewport(w);
  const wc = w.webContents; w.__runtimeId = wc.id;
  if (typeof attachContextMenu === 'function') attachContextMenu(wc, w);
  if(typeof extensionCompat!=='undefined')extensionCompat.registerTab(a.id,wc,w);
  wc.on('page-favicon-updated',(_e,urls)=>{wc.__bookmarkFavicons={page:wc.getURL(),urls};});
  const navigationFailures = createFailureOwner();
  const retryTarget = createRetryTarget(UI_URL); wc.__retryTarget = retryTarget;
  // 有启动小窗时：等界面搭好（host:ready）再显示主窗口，避免白屏 / 半成品
  const waitUi = !!splash && !hidden; let shown = false;
  const reveal = () => { if (shown || w.isDestroyed()) return; if (w.__hidden) { closeSplash(); return; } shown = true; w.show(); closeSplash(); };
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
            await wc.executeJavaScript('try{if(window.__anc){if(!window.__anc.UI.authed&&window.__anc.UI.enterBrowseMode)window.__anc.UI.enterBrowseMode();window.__anc.RegionIP?.open?.({offlineAlert:true});if(' + JSON.stringify(!manual) + ')window.__anc.AutoRoute?.request?.("network",true);}}catch{}');
            return;
          }
          await uaMeta(wc);
          await wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://arena.ai/robots.txt?browse=1*' }] });
          wc.session.__routeBlocked = false;
          const q = new URLSearchParams({ browse: '1', offline: '1', desc: String(desc || ''), code: String(code || ''), ...(manual ? { recovery: 'manual' } : {}) });
          await loadURLAlive(wc, UI_URL + '?' + q.toString(), 15000);
          return;
        } catch {}
      }
      await wc.loadFile(OFFLINE, { query: { desc: String(desc), code: String(code), recovery: manual ? 'manual' : '', url: safeNavigationURL(url) } });
    })()
      .catch(error => runtimeLog('offline-load-failed', { window: wc.id, code: error.code }))
      .finally(() => { w.__offlinePending = false; reveal(); });
  };
  wc.__privacyFault = reason => {
    runtimeLog('privacy-blocked', { window: wc.id, reason });
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
    let stage = 'extensions'; const slow = setTimeout(() => runtimeLog('navigation-slow', { window: wc.id, code: stage }), 20000);
    w.__navigateP = (async () => {
      try {
        await extensionStore.ready(a.id); stage = 'route';
        await applyProxy(a); stage = 'load';
        if (!w.isDestroyed()) { await loadURLAlive(wc, url || UI_URL, 45000, options); wc.__privacyNeedsReload=false; }
        return true;
      } catch (error) {
        if (w.isDestroyed() || ['ERR_ABORTED','ERR_RENDER_PROCESS_GONE','ERR_WEB_CONTENTS_DESTROYED'].includes(error.code)) return false;
        runtimeLog('navigation-failed', { window: wc.id, code: error.code, kind: error.name });
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
  wc.on('dom-ready', () => {
    const u = wc.getURL();
    // 客户端界面（robots.txt）马上注入；浏览器模式的官网页面等官网自己先加载完（did-finish-load，最多等 2.5 秒）再注入 3.6MB 的客户端脚本，
    // 完整功能延后；轻量顶部栏与底部占位由 preload 在页面创建时挂载，dom-ready 仅兜底。
    if (u.startsWith(UI_URL)) { wc.__clientShell = true; wc.executeJavaScript(BUNDLE).catch(e => console.error('inject', e)); }
    else if (u.startsWith('https://arena.ai/')) {
      const seq = wc.__injSeq = (wc.__injSeq || 0) + 1; let fired = false;
      const go = () => { if (fired || wc.isDestroyed() || wc.__injSeq !== seq) return; fired = true; clearTimeout(t); wc.off('did-finish-load', go); if (wc.getURL().startsWith('https://arena.ai/') && !wc.getURL().startsWith(UI_URL)) wc.executeJavaScript(BUNDLE).catch(e => console.error('inject', e)); };
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
    runtimeLog('render-process-gone', { window: wc.id, reason: details.reason, exitCode: details.exitCode });
    wc.session.__routeBlocked = true; wc.__privacyFailed = true;
    const recent = w.__crashes = (w.__crashes || []).filter(at => Date.now() - at < 60000); recent.push(Date.now());
    clearTimeout(w.__recoverT);
    w.__recoverT = setTimeout(() => {
      if (w.isDestroyed() || quitting) return;
      if (recent.length > 2) offline('界面进程反复退出，已暂停自动重载。可手动重试；诊断记录在数据目录 logs/runtime.jsonl。', 'RENDER', true);
      else { runtimeLog('renderer-recover', { window: wc.id, attempt: recent.length }); void wc.__navigate(retryTarget.get()); }
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
    releaseWindow(w);
  });
  w.on('closed', () => {
    clearTimeout(w.__recoverT); runtimeLog('window-closed', { window: w.__runtimeId, reason: quitting ? 'quit' : 'closed' });
    if (wins.get(id) === w) wins.delete(id);
    if (!quitting) {
      DB.open = shownIds(); saveDB();
      // 最后一个可见窗口关掉：后台抽卡的隐藏窗口一起关，程序退出（不留看不见的进程）
      if (!w.__hidden && !shownIds().length && !(mgr && !mgr.isDestroyed())) for (const x of wins.values()) destroyWindow(x);
    }
  });
  void wc.__navigate(UI_URL);
  if (!hidden) { DB.open = [...new Set([...DB.open, id])]; DB.last = id; saveDB(); }
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
  // ProxyIP 每个账号唯一（留空不限）：同一个节点可以共用，但落地 IP 不能撞
  const pipN = String(a.proxyIp ?? cur?.proxyIp ?? '').trim().toLowerCase();
  if (pipN) { const dup = DB.accounts.find(x => x !== cur && pipKey(x.proxyIp) === pipKey(pipN)); if (dup) throw new Error('ProxyIP「' + pipN + '」已被账号「' + dup.name + '」使用，每个账号的 ProxyIP 不能相同'); }
  if (email && cur && byEmail(email) && byEmail(email) !== cur) throw new Error('该邮箱已在另一个账号里：' + byEmail(email).name);
  if (!cur) { cur = { id: newId(), name: String(a.name || email || '账号').slice(0, 40), proxy: String(a.proxy || '').trim(), proxyIp: String(a.proxyIp || '').trim(), email: email || '', fp: a.fp ? cleanFp(a.fp) : genFp() }; if (a.password) cur.pw = encPw(String(a.password)); if (a.nodeId) cur.nodeId = String(a.nodeId).slice(0, 40); DB.accounts.push(cur); }
  else {
    cur.name = String(a.name || cur.name).slice(0, 40);
    if (email !== undefined) { if (email !== cur.email) cur.status = null; cur.email = email; }
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
  if(a.region!==undefined||a.fp||a.proxy!==undefined||a.proxyIp!==undefined)await applyProxy(cur);
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
  wc.on('dom-ready', () => wc.executeJavaScript(BUNDLE).catch(err => console.error('inject mgr', err)));
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
  try { if (['prepare','begin'].includes(request?.op)) { if (e.sender.__privacyNeedsReload) throw Error('新的浏览器环境正在重载，请等待后再认证'); const ses = prepSession(a); if (ses.__routeBlocked || ses.__routeReadySignature !== RouteState.signature(a)) throw Error('当前账号线路尚未应用完成'); }
    if (request?.op === 'finish') { const ses = prepSession(a), ip = await authExit(ses); const r = await fetchAccountResponse(ses, 'https://arena.ai/api/me', {}, 15000); if (!r.ok) throw Error('最终身份复核未通过（HTTP ' + r.status + '），线路保持锁定'); const me = await r.json(); AuthFlow.identity(me?.user, request.email); request = { ...request, ip, email: me.user.email }; }
    return authRouteGuard.task(a.id, request); }
  catch (error) { return { ok: false, code: error.code || 'AUTH_TASK_FAILED', error: String(error.message || error) }; }
});
ipcMain.handle('host:login', (e, u) => {
  // 可带一个 https 链接：注册 / 找回密码邮件里的链接要在本账号的窗口里打开，登录状态才会落到这个账号上
  const url = u ? AuthFlow.authURL(String(u)).href : LOGIN_URL;
  void navigateAccount(e.sender, url); return true;
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
        if (next.protocol !== 'https:' || !['arena.ai', 'auth.arena.ai'].includes(next.hostname)) { await ses.cookies.flushStore().catch(() => {}); return { final: next.href, hops, external: true }; }
        url = next.href; continue;
      }
      await r.text().catch(() => {}); await ses.cookies.flushStore().catch(() => {});
      return { final: url, status: r.status, hops };
    }
    return { final: url, hops, error: '跳转次数过多' };
  } catch (err) { return { error: err?.name === 'AbortError' ? '超时' : String(err.message || err), hops }; }
});
// 主进程原生协议请求通道（复用当前账号独立分区 Cookie 罐与代理隧道，零 DOM Cookie 污染，失败由渲染层自动兜底）
const COST_SKEW_DPLS = [
  'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa',
  'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC',
];
const CORE_COST_DPLS = new Set(COST_SKEW_DPLS);
const EXPIRED_COST_DPLS = new Set([
  'dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct',
  'dpl_6gJxa2MLrLxAx6KcYkVgvMmbV2EA',
  'dpl_D2yWTJ2pjpQeiwvqpbtqDTpsZnY4',
  'dpl_8c25ZvCYXszwFU4s19PErXPLVCzn',
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
  if (EXPIRED_COST_DPLS.has(d)) return;
  if (!COST_SKEW_DPLS.includes(d)) COST_SKEW_DPLS.push(d);
}

function demoteCostDpl(dpl) {
  const d = String(dpl || '').trim();
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d)) return;
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
  for (const pUrl of probeUrls) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4500);
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
      if (discovered.length >= 2) break;
    } catch {}
  }
  return discovered[0] || null;
}

ipcMain.handle('host:protoFetch', async (e, u, opt = {}) => {
  const a = winAcct(e.sender); if (!a) return { error: '没有账号上下文', fallback: true };
  const raw = String(u || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return { error: '仅支持同源协议路径', fallback: true };
  const ses = prepSession(a);
  if (ses.__routeBlocked) return { error: '当前账号线路未就绪', fallback: true };
  try {
    const savedAutoDpl = DB?.shared?.prefs?.autoCostDpl;
    if (savedAutoDpl && /^dpl_[A-Za-z0-9]{16,48}$/.test(savedAutoDpl) && !EXPIRED_COST_DPLS.has(savedAutoDpl)) {
      rememberCostDpl(savedAutoDpl, false);
    }
  } catch {}
  const targetUrl = 'https://arena.ai' + raw;
  const mSid = /\/(?:api\/(?:chat|evaluation)|ai-proxy\/realtime\/v\d+\/sessions)\/([0-9a-f-]{36})\b/i.exec(raw);
  const referer = opt?.referer || (mSid ? 'https://arena.ai/c/' + mSid[1] : 'https://arena.ai/');
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(3000, Math.min(60000, +opt?.timeout || 15000)));
  try {
    const costValue = encodeURIComponent(JSON.stringify({ 'credit-system-m1': 'cost-shown' }));
    const method = String(opt?.method || 'GET').toUpperCase();
    const nowMs = Date.now();
    if (!ses.__cookieCache || nowMs - (ses.__cookieCacheAt || 0) > 4000) {
      ses.__cookieCache = await ses.cookies.get({ url: 'https://arena.ai' }).catch(() => []);
      ses.__cookieCacheAt = nowMs;
    }
    const allCookies = ses.__cookieCache;
    const reqSkew = String(opt?.skewDpl || '').trim();
    if (reqSkew && !EXPIRED_COST_DPLS.has(reqSkew)) rememberCostDpl(reqSkew, false);
    const dplCandidates = opt?.costShown === true
      ? [...new Set([
          !EXPIRED_COST_DPLS.has(activeCostSkewDpl) ? activeCostSkewDpl : null,
          (/^dpl_[A-Za-z0-9]{16,48}$/.test(reqSkew) && !EXPIRED_COST_DPLS.has(reqSkew)) ? reqSkew : null,
          ...COST_SKEW_DPLS.filter(x => !EXPIRED_COST_DPLS.has(x)),
          '',
        ].filter(x => x !== null))]
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
      if (opt?.costShown === true) {
        ses.__appliedSkewDpl = skewDpl;
        ses.__costCookieSetAt = nowMs;
        await ses.cookies.set({
          url: 'https://arena.ai',
          name: 'ph-toolbar-overrides',
          value: costValue,
          path: '/',
          secure: true,
          sameSite: 'lax',
          expirationDate: Math.floor(nowMs / 1000) + 1800,
        }).catch(() => {});
        await ses.cookies.remove('https://arena.ai', '__vdpl').catch(() => {});
        await ses.cookies.remove('https://arena.ai/', '__vdpl').catch(() => {});
        if (skewDpl) {
          await ses.cookies.set({
            url: 'https://arena.ai',
            name: '__vdpl',
            value: skewDpl,
            path: '/',
            secure: true,
            sameSite: 'lax',
            expirationDate: Math.floor(nowMs / 1000) + 31536000,
          }).catch(() => {});
        }
      }
      const filteredCookies = Array.isArray(allCookies)
        ? allCookies.filter(c => c && c.name && (opt?.costShown !== true || (c.name !== '__vdpl' && c.name !== 'ph-toolbar-overrides')))
        : [];
      const cookieParts = filteredCookies.map(c => c.name + '=' + c.value);
      if (opt?.costShown === true) {
        cookieParts.push('ph-toolbar-overrides=' + costValue);
        if (skewDpl) cookieParts.push('__vdpl=' + skewDpl);
      }
      const cookieHeader = cookieParts.join('; ');
      const headers = {
        Accept: opt?.accept || 'application/json',
        Referer: referer,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(opt?.costShown === true && skewDpl ? { 'x-deployment-id': skewDpl } : {}),
        ...(opt?.headers && typeof opt.headers === 'object' ? opt.headers : {}),
      };
      if (opt?.body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      const curPath = pathCandidates[0];
      const curUrl = (opt?.costShown === true && skewDpl && i > 0)
        ? ('https://arena.ai' + curPath + (curPath.includes('?') ? '&' : '?') + 'dpl=' + encodeURIComponent(skewDpl))
        : ('https://arena.ai' + curPath);
      const r = await ses.fetch(curUrl, {
        method,
        headers,
        body: opt?.body !== undefined ? String(opt.body) : undefined,
        credentials: 'include',
        redirect: opt?.redirect || 'error',
        cache: 'no-store',
        signal: ctl.signal,
      });
      const apiDpl = r.headers.get('x-arena-api-deployment');
      if (apiDpl && !CORE_COST_DPLS.has(apiDpl)) EXPIRED_COST_DPLS.add(apiDpl);
      if (r.headers.get('set-cookie')) {
        ses.__cookieCacheAt = 0;
        try { await storeSetCookies(ses, r); } catch {}
      }
      const text = await r.text();
      lastResp = {
        ok: r.ok,
        status: r.status,
        text: text.slice(0, 4e6),
        contentType: r.headers.get('content-type') || '',
        retryAfter: r.headers.get('retry-after') || '',
        date: r.headers.get('date') || '',
        skewDpl: skewDpl || undefined,
        triedAllSkew: i >= dplCandidates.length - 1,
        pool: COST_SKEW_DPLS.slice(0, 10),
      };
      if (skewDpl && r.ok) {
        rememberCostDpl(skewDpl, true);
        if (sidVal && curPath) activeCostPathTpl = curPath.replace(sidVal, '{sid}');
      }
      if (r.status !== 403 && r.status !== 404) break;
      if (skewDpl && r.status === 403) demoteCostDpl(skewDpl);
      if (i === dplCandidates.length - 1 && opt?.costShown === true && !discoveredOnce) {
        discoveredOnce = true;
        const beforeLen = COST_SKEW_DPLS.length;
        const fresh = await discoverFreshCostDpl(ses, true);
        if (fresh && !dplCandidates.includes(fresh)) dplCandidates.push(fresh);
        for (const cand of COST_SKEW_DPLS) {
          if (cand && !EXPIRED_COST_DPLS.has(cand) && !dplCandidates.includes(cand)) {
            dplCandidates.push(cand);
          }
        }
        if (COST_SKEW_DPLS.length > beforeLen) lastResp.triedAllSkew = false;
      }
    }
    if (lastResp && (lastResp.status === 403 || lastResp.status === 404) && isCostPath && pathCandidates.length > 1) {
      const bestDpl = activeCostSkewDpl || COST_SKEW_DPLS[0] || '';
      for (let pIdx = 1; pIdx < pathCandidates.length; pIdx++) {
        const altPath = pathCandidates[pIdx];
        const altUrl = 'https://arena.ai' + altPath + (bestDpl ? ((altPath.includes('?') ? '&' : '?') + 'dpl=' + encodeURIComponent(bestDpl)) : '');
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
  for (const c of await ses.cookies.get({})) { const host = String(c.domain || '').replace(/^\./, ''); if (/(^|\.)arena\.ai$/i.test(host)) await ses.cookies.remove((c.secure ? 'https://' : 'http://') + host + (c.path || '/'), c.name).catch(() => {}); }
  await ses.cookies.flushStore().catch(() => {});
  a.noAuto = true; a.status = { ...(a.status || {}), loggedIn: false, at: Date.now() }; saveDB();   // 主动退出后不再自动登录，直到重新输入密码
  void navigateAccount(e.sender); return true;
});
ipcMain.handle('host:setTitle', (e, t) => { const w=BrowserWindow.fromWebContents(e.sender);if(w){const title=String(t||'');w.setTitle((title.startsWith(APP_TITLE)?title:APP_TITLE+' · '+title.replace(/^Brana(?: AI)?(?: ·)?\s*/, '')).slice(0,200));}return true; });
// 图片：复制到剪贴板 / 另存为（对话里的附件图片、查看大图）
ipcMain.handle('host:copyImage', (e, b64) => { try { const img = nativeImage.createFromBuffer(Buffer.from(String(b64 || ''), 'base64')); if (img.isEmpty()) return { error: '图片格式不支持' }; clipboard.writeImage(img); return { ok: true }; } catch (err) { return { error: String(err.message || err) }; } });
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
ipcMain.handle('host:openExternal', (e, u) => { if (/^(https?:\/\/|mailto:)/i.test(String(u))) shell.openExternal(String(u)); return true; });
ipcMain.handle('host:ready', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w.__reveal) w.__reveal(); else if (w && !w.isVisible()) w.show(); return true; });
ipcMain.handle('host:stage', (e, t) => { splashText(String(t || '').slice(0, 40)); return true; });
// ProxyIP 批量检测：一个 xray 进程开 N 个入口（每个入口走同一个节点 + 不同 ProxyIP），
// 每个入口 ① 读 arena.ai/cdn-cgi/trace 得出口 IP / 地区 / 延迟 ② 再请求 arena.ai/robots.txt 确认 Brana 能正常访问（不是验证页）
async function probeVia(i, port, ms, signal) {
  const ses = session.fromPartition('probe-slot-' + i);
  await ses.setProxy({ proxyRules: 'socks5://127.0.0.1:' + port, proxyBypassRules: '<-loopback>' });
  await ses.closeAllConnections?.().catch?.(() => {});
  await ses.clearAuthCache(); await ses.clearStorageData();
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
    else Object.assign(out, await RouteNative.purity(ses, 4000, signal));   // 测延迟顺带测纯净度：IPPure + ip-api（经同一条隧道，并行）
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
// Subscription bootstrap is intentionally isolated from account web sessions.
require('./subscription-ipc').setupSubscriptionFetch({ipcMain,authorize:e=>routeActor(e,true),accountFor:winAcct});
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
  if (!publicData && (!r || (r.error && (!/^HTTP \d+/.test(r.error) || /^HTTP (?:5\d\d|403|429)$/.test(r.error))))) {
    // 真直连（不走系统代理 / 本机代理）；都不通才最后试一次系统代理
    const ds = await directSession();
    for (const ua of ['v2rayN/6.23', 'ClashforWindows/0.20.39', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36']) {
      const rDirect = await one((u, o) => ds.fetch(u, o), ua);
      if (rDirect && !rDirect.error) return rDirect;
    }
    const rSys = await one((u, o) => session.defaultSession.fetch(u, o), 'v2rayN/6.23');
    if (rSys && !rSys.error) return rSys;
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
function checkPending() {
  let p = null; try { p = JSON.parse(fs.readFileSync(UPD_PEND(), 'utf8')); } catch { return; }
  const newer = (a, b) => { const x = String(a || '').replace(/-.*/, '').split('.').map(Number), y = String(b || '').replace(/-.*/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  if (VERSION === p.to || newer(VERSION, p.from)) {   // 装上了：清理安装包
    updLog('更新成功 ' + p.from + ' → ' + VERSION); try { fs.unlinkSync(UPD_PEND()); } catch {}
    if (p.file && p.kind === 'setup') setTimeout(() => { try { fs.unlinkSync(p.file); } catch {} }, 5000);
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
  try { const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {}
  quitting = true;
  try {
    spawn(p.file, ['/NCRC', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  } catch (err) {
    const openErr = await shell.openPath(p.file); if (openErr) return { error: openErr };
  }
  setTimeout(async () => { quitting = true; try { const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {} for (const w of [...wins.values()]) destroyWindow(w); if (mgr && !mgr.isDestroyed()) destroyWindow(mgr); await cookiePersistence.flushAll().catch(() => {}); for (const k of [...tunnels.keys()]) stopTunnel(k); killKids(); app.exit(0); }, 500);
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
  try { const open = shownIds(); if (open.length) DB.open = open; saveDB(); } catch {}
  quitting = true;
  for (const k of [...tunnels.keys()]) stopTunnel(k); killKids();
  await Promise.race([cookiePersistence.flushAll().catch(() => {}), new Promise(r => setTimeout(r, 1200))]);
  try { fs.writeFileSync(UPD_PEND(), JSON.stringify({ from: VERSION, to: UPD.ver || '', file: UPD.file, kind, at: Date.now() })); } catch {}
  try {
    const updDir = path.dirname(UPD.file);
    const stateFile = path.join(updDir, 'upd-state.json');
    const progPs1 = path.join(updDir, 'brana-ai-progress.ps1');
    try {
      fs.writeFileSync(stateFile, JSON.stringify({
        from: VERSION,
        to: UPD.ver || '',
        step: 2,
        pct: 16,
        text: '正在保存多账号状态并关闭旧版进程…',
        oldPid: process.pid,
        exePath: process.execPath,
      }), 'utf8');
      fs.writeFileSync(progPs1, [
        'param([string]$StatePath)',
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        '[System.Windows.Forms.Application]::EnableVisualStyles()',
        '$state = @{ from = ""; to = ""; step = 2; pct = 16; text = "正在准备覆盖安装新版本…"; oldPid = 0 }',
        'if (Test-Path -LiteralPath $StatePath) { try { $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }',
        '$f = New-Object System.Windows.Forms.Form',
        '$f.Text = "Brana AI 正在自动更新"',
        '$f.ClientSize = New-Object System.Drawing.Size(440, 215)',
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
        '$lblTitle.Location = New-Object System.Drawing.Point(22, 18)',
        '$lblTitle.Size = New-Object System.Drawing.Size(396, 24)',
        '$lblTitle.Font = $fontTitle',
        '$verSuffix = if ($state.to) { "  (v$($state.from) -> v$($state.to))" } else { "" }',
        '$lblTitle.Text = "Brana AI 正在安装更新$verSuffix"',
        '$lblStatus = New-Object System.Windows.Forms.Label',
        '$lblStatus.Location = New-Object System.Drawing.Point(22, 48)',
        '$lblStatus.Size = New-Object System.Drawing.Size(340, 20)',
        '$lblStatus.Font = $fontBody',
        '$lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(165, 180, 252)',
        '$lblStatus.Text = [string]$state.text',
        '$lblPct = New-Object System.Windows.Forms.Label',
        '$lblPct.Location = New-Object System.Drawing.Point(362, 48)',
        '$lblPct.Size = New-Object System.Drawing.Size(56, 20)',
        '$lblPct.Font = $fontBody',
        '$lblPct.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight',
        '$lblPct.Text = "16%"',
        '$barBg = New-Object System.Windows.Forms.Panel',
        '$barBg.Location = New-Object System.Drawing.Point(22, 74)',
        '$barBg.Size = New-Object System.Drawing.Size(396, 10)',
        '$barBg.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 53)',
        '$barFill = New-Object System.Windows.Forms.Panel',
        '$barFill.Location = New-Object System.Drawing.Point(0, 0)',
        '$barFill.Size = New-Object System.Drawing.Size(64, 10)',
        '$barFill.BackColor = [System.Drawing.Color]::FromArgb(99, 102, 241)',
        '$barBg.Controls.Add($barFill)',
        '$lblSteps = New-Object System.Windows.Forms.Label',
        '$lblSteps.Location = New-Object System.Drawing.Point(22, 96)',
        '$lblSteps.Size = New-Object System.Drawing.Size(396, 80)',
        '$lblSteps.Font = $fontSmall',
        '$lblSteps.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)',
        '$lblFoot = New-Object System.Windows.Forms.Label',
        '$lblFoot.Location = New-Object System.Drawing.Point(22, 182)',
        '$lblFoot.Size = New-Object System.Drawing.Size(396, 20)',
        '$lblFoot.Font = $fontSmall',
        '$lblFoot.ForeColor = [System.Drawing.Color]::FromArgb(135, 135, 148)',
        '$lblFoot.Text = "全程自动完成，安装完毕后将自动重新打开客户端，请勿重复点击图标"',
        '$f.Controls.AddRange(@($lblTitle, $lblStatus, $lblPct, $barBg, $lblSteps, $lblFoot))',
        '$t0 = [DateTime]::UtcNow',
        '$dispPct = 16.0',
        '$doneAt = $null',
        '$timer = New-Object System.Windows.Forms.Timer',
        '$timer.Interval = 200',
        '$timer.Add_Tick({',
        '  $sec = [int]([DateTime]::UtcNow - $t0).TotalSeconds',
        '  if ($sec -gt 95) { $timer.Stop(); $f.Close(); return }',
        '  if (Test-Path -LiteralPath $StatePath) {',
        '    try { $s = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json; if ($s) { $script:state = $s } } catch {}',
        '  }',
        '  $st = [int]($script:state.step)',
        '  $targetPct = [double]($script:state.pct)',
        '  if ($st -eq 3 -and $dispPct -ge 36 -and $dispPct -lt 91) { $dispPct = [Math]::Min(91.0, $dispPct + 0.45) }',
        '  if ($targetPct -gt $dispPct) { $dispPct = $dispPct + [Math]::Max(1.2, ($targetPct - $dispPct) * 0.35) }',
        '  if ($dispPct -gt 100) { $dispPct = 100 }',
        '  $pInt = [int][Math]::Round($dispPct)',
        '  $lblPct.Text = "$pInt%"',
        '  $barFill.Width = [int][Math]::Round(396 * $dispPct / 100.0)',
        '  if ($script:state.text) { $lblStatus.Text = [string]$script:state.text }',
        '  $m1 = "[√] 1. 下载并校验安装包完整性"',
        '  $m2 = if ($st -gt 2) { "[√] 2. 保存多账号会话并关闭旧版进程" } else { "[●] 2. 保存多账号会话并关闭旧版进程…" }',
        '  $m3 = if ($st -gt 3) { "[√] 3. 静默覆盖安装新版本核心组件" } elseif ($st -eq 3) { "[●] 3. 正在静默覆盖安装新版本核心组件…" } else { "[  ] 3. 静默覆盖安装新版本核心组件" }',
        '  $m4 = if ($st -ge 5) { "[√] 4. 启动新版 Brana AI 并恢复窗口" } elseif ($st -eq 4) { "[●] 4. 正在启动新版 Brana AI 并恢复窗口…" } else { "[  ] 4. 启动新版 Brana AI 并恢复窗口" }',
        '  $lblSteps.Text = "$m1`r`n$m2`r`n$m3`r`n$m4"',
        '  $lblFoot.Text = ("已用时 {0:D2}:{1:D2} · 安装完成后自动启动，请勿关闭" -f [int]($sec / 60), ($sec % 60))',
        '  if ($st -ge 4) {',
        '    $procs = @(Get-Process -Name "Brana AI" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $script:state.oldPid -and $_.MainWindowHandle -ne 0 })',
        '    if ($procs.Count -gt 0) { $timer.Stop(); $f.Close(); return }',
        '  }',
        '  if ($script:state.done) {',
        '    if (-not $script:doneAt) { $script:doneAt = [DateTime]::UtcNow }',
        '    elseif (([DateTime]::UtcNow - $script:doneAt).TotalSeconds -ge 2.2) { $timer.Stop(); $f.Close(); return }',
        '  }',
        '})',
        '$timer.Start()',
        '[void]$f.ShowDialog()',
      ].join('\r\n'), 'utf8');
      const psExe = fs.existsSync('C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe')
        ? 'C:\\Windows\\SysNative\\WindowsPowerShell\\v1.0\\powershell.exe'
        : 'powershell.exe';
      spawn(psExe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Sta', '-File', progPs1, '-StatePath', stateFile], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } catch {}

    if (kind === 'portable') {
      // 便携版：等本程序（和便携版外壳）退出后用新 exe 覆盖旧 exe 再打开；路径用环境变量传，中文路径也没问题
      const old = process.env.PORTABLE_EXECUTABLE_FILE;
      const bat = path.join(updDir, 'brana-ai-update.cmd');
      fs.writeFileSync(bat, [
        '@echo off',
        'set "BRANA_UPDATING=1"',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":45,"text":"正在替换便携版程序文件…"} > "%ANC_STATE%"',
        'set /a n=0',
        ':loop',
        'ping -n 2 127.0.0.1 >nul',
        'copy /y "%ANC_NEW%" "%ANC_OLD%" >nul 2>&1 && goto ok',
        'set /a n+=1',
        'if %n% lss 90 goto loop',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"done":true,"err":true,"text":"文件被占用，请手动替换"} > "%ANC_STATE%"',
        'explorer /select,"%ANC_NEW%"',
        'echo 1>"%ANC_NEW%.opened"',
        'exit /b 1',
        ':ok',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":4,"pct":96,"text":"替换完成，正在启动新版 Brana AI…"} > "%ANC_STATE%"',
        'del /f /q "%ANC_PEND%" >nul 2>&1',
        'del "%ANC_NEW%" >nul 2>&1',
        'start "" "%ANC_OLD%"',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"done":true,"text":"更新完成！"} > "%ANC_STATE%"',
        'exit /b 0',
        ''
      ].join('\r\n'));
      spawn('cmd.exe', ['/d', '/c', bat], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, BRANA_UPDATING: '1', ANC_NEW: UPD.file, ANC_OLD: old, ANC_STATE: stateFile, ANC_PEND: UPD_PEND(), ANC_FROM: VERSION, ANC_TO: UPD.ver || '' },
      }).unref();
    } else {
      // 安装版：先等待所有多账号窗口与进程彻底退出，再静默运行新安装包覆盖安装并自动重开所有已打开账号
      const bat = path.join(updDir, 'brana-ai-install.cmd');
      fs.writeFileSync(bat, [
        '@echo off',
        'set "BRANA_UPDATING=1"',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":2,"pct":22,"text":"正在关闭旧版窗口与后台进程…"} > "%ANC_STATE%"',
        'set /a w=0',
        ':waitexit',
        'tasklist /FI "PID eq %ANC_PID%" 2>nul | find "%ANC_PID%" >nul',
        'if errorlevel 1 goto closed',
        'ping -n 2 127.0.0.1 >nul',
        'set /a w+=1',
        'if %w% lss 3 goto waitexit',
        'taskkill /F /T /PID %ANC_PID% >nul 2>&1',
        ':closed',
        'taskkill /F /T /IM "Brana AI.exe" >nul 2>&1',
        'taskkill /F /T /IM "xray.exe" >nul 2>&1',
        'ping -n 2 127.0.0.1 >nul',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":38,"text":"正在静默覆盖安装新版本核心组件…"} > "%ANC_STATE%"',
        'start "" /wait "%ANC_NEW%" /NCRC --updated /S --force-run',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":64,"text":"正在释放文件占用并自动重试静默安装…"} > "%ANC_STATE%"',
        'taskkill /F /T /IM "Brana AI.exe" >nul 2>&1',
        'taskkill /F /T /IM "xray.exe" >nul 2>&1',
        'ping -n 3 127.0.0.1 >nul',
        'start "" /wait "%ANC_NEW%" /NCRC --updated /S --force-run',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":3,"pct":78,"text":"正在打开安装程序完成更新…"} > "%ANC_STATE%"',
        'start "" /wait "%ANC_NEW%" /NCRC --updated --force-run',
        'if not errorlevel 1 goto installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"done":true,"err":true,"text":"自动安装未完成，请在客户端内点击手动安装"} > "%ANC_STATE%"',
        'echo 1>"%ANC_NEW%.opened"',
        'exit /b 1',
        ':installed',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":4,"pct":96,"text":"安装完成，正在启动新版 Brana AI…"} > "%ANC_STATE%"',
        'del /f /q "%ANC_PEND%" >nul 2>&1',
        'ping -n 2 127.0.0.1 >nul',
        'tasklist /FI "IMAGENAME eq Brana AI.exe" 2>nul | find /I "Brana AI.exe" >nul',
        'if errorlevel 1 (',
        '  if exist "%ANC_EXE%" start "" "%ANC_EXE%" --updated',
        ')',
        'echo {"from":"%ANC_FROM%","to":"%ANC_TO%","step":5,"pct":100,"done":true,"text":"更新完成，正在打开窗口…"} > "%ANC_STATE%"',
        'exit /b 0',
        ''
      ].join('\r\n'));
      spawn('cmd.exe', ['/d', '/c', bat], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...process.env,
          BRANA_UPDATING: '1',
          ANC_NEW: UPD.file,
          ANC_PID: String(process.pid),
          ANC_EXE: process.execPath,
          ANC_STATE: stateFile,
          ANC_PEND: UPD_PEND(),
          ANC_FROM: VERSION,
          ANC_TO: UPD.ver || '',
        },
      }).unref();
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
  const v = parseVless(o?.link); if (!v) return { error: 'VLESS 节点链接不正确' };
  const pips = (Array.isArray(o?.pips) ? o.pips : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 32);
  if (!pips.length) return [];
  const bin = xrayBin(); if (!bin) return { error: '没有找到内置 xray 内核' };
  // 链式代理出口（sstp / socks5 …）多一段握手（SSTP 还有 PPP 协商），给足时间
  const ms = Math.max(pips.some(p => Vless.chainOf?.(p)) ? 15000 : 4000, Math.min(30000, +o.timeout || 12000));
  const ports = []; while (ports.length < pips.length) { if(job.signal.aborted)return {cancelled:true}; const p = await freePort(); if (!ports.includes(p)) ports.push(p); }
  let obs; try { obs = pips.map((p, i) => ({ ...Vless.outbound(v, p), tag: 'p' + i })); } catch (err) { return { error: String(err.message || err) }; }
  const cfg = { log: { loglevel: 'warning' },
    inbounds: pips.map((p, i) => ({ tag: 'in' + i, listen: '127.0.0.1', port: ports[i], protocol: 'socks', settings: { udp: false, auth: 'noauth' } })),
    outbounds: [...obs, { tag: 'block', protocol: 'blackhole' }],
    routing: { rules: pips.map((p, i) => ({ type: 'field', inboundTag: ['in' + i], outboundTag: 'p' + i })) } };
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
    return await Promise.all(pips.map(async (p,i)=>{let result;try{result=await probeVia(lease*32+i,ports[i],ms,job.signal);}catch(err){result={error:String(err?.message||err)};}job.publish(p,result);return {pip:p,...result};}));
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

ipcMain.handle('host:getCred', e => { const a = winAcct(e.sender); if (!a || a.noAuto || !a.email || !a.pw) return null; const password = decPw(a.pw); return password ? { email: a.email, password } : null; });
// 官网页面里注册 / 登录时输入的密码：该账号登录成功（邮箱一致）且还没保存过密码时，存进账号（之后会话过期可自动重新登录）
function promoteRegPw(a, email) {
  const k = 'regpw@' + a.id, p = DB.shared?.[k];
  const mt = DB.shared?.['mailtok@' + a.id];
  const em = String(email || '').trim().toLowerCase();
  if (p) {
    if (Date.now() - (p.at || 0) > 24 * 3600e3) { delete DB.shared[k]; saveSoon(); return; }
    if (p.email && em && p.email !== em) return;
    if (p.pw && (p.src === 'web' || !a.pw)) {
      a.pw = p.pw; a.noAuto = false; if (!a.email && em) a.email = em;
      delete DB.shared[k]; saveSoon(); return;
    }
  }
  if (!a.pw && mt?.pw && (!mt.email || !em || String(mt.email).trim().toLowerCase() === em)) {
    a.pw = mt.pw; a.noAuto = false; if (!a.email && em) a.email = em; saveSoon();
  }
}
ipcMain.handle('host:noteAccount', (e, o) => {
  const a = winAcct(e.sender); if (!a || !o || typeof o !== 'object') return false;
  const st = { ...(a.status || {}) };
  for (const k of ['loggedIn', 'ip', 'loc']) if (o[k] !== undefined) st[k] = o[k];
  if (o.email) st.me = String(o.email);
  if (o.loggedIn === true && o.email) promoteRegPw(a, String(o.email));
  if (o.gacha && typeof o.gacha === 'object') {
    const g = o.gacha; st.gacha = { busy: !!g.busy, cap: !!g.cap, done: +g.done || 0, total: g.total === '∞' ? '∞' : +g.total || 0, hits: +g.hits || 0, phase: String(g.phase || '').slice(0, 80), err: String(g.err || '').slice(0, 160), last: String(g.last || '').slice(0, 80), status: String(g.status || '').slice(0, 20), at: Date.now(),
      log: (Array.isArray(g.log) ? g.log : []).slice(-12).map(x => ({ no: +x.no || 0, draw: +x.draw || 0, at: +x.at || 0, model: String(x.model || '').slice(0, 80), tier: String(x.tier || '').slice(0, 20), verdict: String(x.verdict || '').slice(0, 20), archived: !!x.archived, note: String(x.note || '').slice(0, 120) })) };
    // 后台抽卡结束：隐藏窗口 1 分钟后自动关闭（释放内存）
    const w = wins.get(a.id);
    if (w && !w.isDestroyed() && w.__hidden) { clearTimeout(w.__reap); if (!g.busy && !w.__stats) w.__reap = setTimeout(() => { if (!w.isDestroyed() && w.__hidden && !w.__stats && !a.status?.gacha?.busy) destroyWindow(w); }, 60000); }
  }
  // 账号统计（本账号窗口自己算的：各厂商 / 各型号对话数、每个对话轮数），账号管理窗口和手机启动页用
  if (o.stats && typeof o.stats === 'object') { try { const js = JSON.stringify(o.stats); if (js.length < 800000) st.stats = JSON.parse(js); } catch {} }
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
  if (!a.email && o.email && !byEmail(o.email)) a.email = String(o.email);
  saveSoon(); return true;
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
  DB.shared.pelican = pelMap;
  DB.shared.pelshots = { rows, del, pelican: pelMap, at: Date.now() };
  saveSoon();
  if (broadcast && typeof BrowserWindow !== 'undefined') {
    const cmd = { pelshotsSync: true, at: DB.shared.pelshots.at };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== sender) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
  }
  if (inObj.harvest && typeof harvestAccountPelicanSoon === 'function') harvestAccountPelicanSoon(true);
  return true;
}
let pelHarvesting = false, pelHarvestedOnce = false;
function harvestAccountPelicanSoon(force = false) {
  if (pelHarvesting || (!force && pelHarvestedOnce)) return;
  if (process.env.BRANA_EXTENSION_TEST_DATA || typeof app === 'undefined' || !app.isReady?.()) return;
  pelHarvesting = true;
  pelHarvestedOnce = true;
  setTimeout(async () => {
    let changed = false;
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
          if (a) a.pelHarvested = 1;
        }
      }
      if (typeof WebContentsView === 'function' && Array.isArray(DB?.accounts)) {
        for (const a of DB.accounts) {
          if (!a?.id || (typeof wins !== 'undefined' && wins.has(a.id)) || (!force && a.pelHarvested)) continue;
          const ldbDir = path.join(app.getPath('userData'), 'Partitions', 'acct-' + a.id, 'Local Storage', 'leveldb');
          if (!fs.existsSync(ldbDir)) { a.pelHarvested = 1; continue; }
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
            a.pelHarvested = 1;
          } catch {}
          finally {
            ses.__routeBlocked = wasBlocked;
            try { if (view?.webContents && !view.webContents.isDestroyed()) { if (view.webContents.debugger.isAttached()) view.webContents.debugger.detach(); view.webContents.close(); } } catch {}
          }
        }
      }
      if (changed && typeof BrowserWindow !== 'undefined') {
        saveSoon();
        const cmd = { pelshotsSync: true, at: Date.now() };
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
      }
    } catch {}
    finally { pelHarvesting = false; }
  }, 120);
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
  // gacha@<账号id>：每个账号自己的抽卡设置
  if (!['prefs', 'gacha', 'nodes', 'nodesubs', 'proxyips', 'pippool', 'archbl', 'gold', 'pelshots', 'pelican'].includes(k) && !/^(gacha|draft|gtok|signup|mailtok|webreg)@[\w-]{1,64}$/.test(String(k))) return null;
  DB.shared = DB.shared || {};
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
    if (k === 'pelshots' && typeof harvestAccountPelicanSoon === 'function') harvestAccountPelicanSoon(false);
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
  DB.shared[k] = v;
  if (k === 'prefs' && v && typeof v === 'object' && (v.goldMode || Array.isArray(v.goldSet))) {
    DB.shared.gold = { mode: v.goldMode || 'auto', set: Array.isArray(v.goldSet) ? v.goldSet : [], chats: Array.isArray(v.goldChats) ? v.goldChats : [], at: v.goldAt || Date.now() };
  }
  saveSoon();
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
    if (Object.keys(cmd).length) for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) { try { w.webContents.send('anc-cmd', cmd); } catch {} }
  }
  return true;
});
// 有窗口在抽卡 / 排队发送 / 接收回复：阻止系统把 App 挂起（屏幕照常可以关）
const bgWorkMap = new Map(); let psbId = -1;
function bgCheck() {
  const t = Date.now(); let busy = false;
  for (const [k, v] of bgWorkMap) { if (t - v.at > 90000) bgWorkMap.delete(k); else if (v.busy) busy = true; }
  try { if (busy && psbId < 0) psbId = powerSaveBlocker.start('prevent-app-suspension'); else if (!busy && psbId >= 0) { powerSaveBlocker.stop(psbId); psbId = -1; } } catch {}
}
setInterval(bgCheck, 30000);
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
  const d = { iv: null, t: Date.now() };
  d.iv = setInterval(() => {
    if (w.isDestroyed() || Date.now() - d.t > 60000) { stop(); return; }
    const p = screen.getCursorScreenPoint();
    try { w.setBounds({ x: b.x + p.x - p0.x, y: b.y + p.y - p0.y, width: b.width, height: b.height }); } catch {}
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
const refreshAllAccounts = createAccountRefresh({
  accounts: () => DB.accounts, exists: a => acct(a.id) === a, session: prepSession,
  // Never reset a live account's proxy/connections while it is chatting or running gacha.
  prepare: async a => { const w = wins.get(a.id); if (!w || w.isDestroyed()) await applyProxy(a); },
  refresh: refreshStatus, save: saveDB, concurrency: 4,
});
ipcMain.handle('host:refreshQuotas', () => refreshAllAccounts());

// Probes are isolated, credential-free and globally bounded; slots are never shared concurrently.
const routeSlots = [0, 1];
const routeProofs = RouteNative.createProofs({ ttl: 900000 });
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
    await ses.closeAllConnections(); await ses.clearAuthCache(); await ses.clearStorageData(); await ses.setProxy(config);
    const website = !draft && WebsiteRoute.target(event,OFFLINE);
    const result = website ? await WebsiteRoute.check(ses,website) : await RouteNative.checkService(ses);
    if (draft) routeDrafts.get(actor, candidate.draft);
    if(website&&result.ok)Object.assign(result,await RouteNative.purity(ses));
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
    if(o.manual&&!browserRouteOwners.has(wc)&&!source.startsWith('file:'))setTimeout(()=>{
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
app.on('before-quit', () => { quitting = true; const open = shownIds(); if (open.length) DB.open = open; saveDB(); });
app.on('second-instance', (e, argv) => {
  if (Array.isArray(argv) && argv.includes('--quit-for-update')) { void quitForUpdate(0); return; }
  const w = [...wins.values()].find(x => !x.isDestroyed() && !x.__hidden);
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  else void openAccountSafe(DB.last || DB.accounts[0].id);
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
app.whenReady().then(async () => {
  BrowserPrivacy.secureResolver(app);
  try { checkPending(); } catch {}
  loadDB(); try { themeWas = DB.shared?.prefs?.theme; syncThemeSource(); } catch {} showSplash(); loadBundle(); menu();
  gProbe().catch(() => {}); setInterval(() => gProbe().catch(() => {}), 5 * 60e3);
  const ids = (DB.open || []).filter(id => acct(id));
  if (!ids.length) ids.push(DB.last && acct(DB.last) ? DB.last : DB.accounts[0].id);
  for (const id of ids) await openAccountSafe(id);
}).catch(error => { runtimeLog('startup-failed', { kind: error.name, code: error.code }); closeSplash(); dialog.showErrorBox('Brana AI 启动失败', '请重试。账号数据未删除；诊断记录在数据目录 logs/runtime.jsonl。'); });
