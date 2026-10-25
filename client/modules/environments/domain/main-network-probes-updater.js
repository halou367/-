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