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
  const authNames = new Set();
  for (const line of list) {
    const [nv] = line.split(';'); const i = nv.indexOf('='); if (i < 1) continue;
    const nm = nv.slice(0, i).trim(), val = nv.slice(i + 1).trim();
    if (val && /^arena-auth-prod-v1/.test(nm)) authNames.add(nm);
  }
  if (authNames.size) {
    try {
      const prev = await ses.cookies.get({ url: 'https://arena.ai' });
      for (const pc of prev) {
        if (/^arena-auth-prod-v1/.test(pc.name) && !authNames.has(pc.name)) {
          await ses.cookies.remove('https://arena.ai', pc.name).catch(() => {});
        }
      }
    } catch {}
  }
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
    if (response) await storeSetCookies(ses, response);
    await ses.cookies.flushStore().catch(() => {});
  },
  save: () => saveDB(true),
  navigate: a => { const w = wins.get(a.id); if (w && !w.isDestroyed()) void navigateAccount(w.webContents); },
});
ipcMain.handle('host:signInAccount', async (e, id) => { try { return await signInAccount(id); } catch (err) { return { error: String(err.message || err) }; } });
const ensureAccountNodeProxy = a => {
  if (!a || typeof a !== 'object') return a;
  if (String(a.proxy || '').trim() || /@example\.invalid$/i.test(String(a.email || ''))) return a;
  if (a.routeMode === 'direct') { a.proxy = 'direct'; return a; }
  if (a.routeMode === 'proxy' || a.routeMode === 'local') return a;
  try {
    const vlessAcct = (DB.accounts || []).find(x => x && x.id !== a.id && /^vless:\/\//i.test(String(x.proxy || '')));
    const nodes = Array.isArray(DB.shared?.nodes) ? DB.shared.nodes : [];
    const prefNodeId = a.nodeId || DB.shared?.pippool?.node || vlessAcct?.nodeId || nodes[0]?.id || '';
    const nodeObj = nodes.find(n => n && n.id === prefNodeId) || nodes[0] || null;
    let link = '';
    if (vlessAcct && (!prefNodeId || vlessAcct.nodeId === prefNodeId)) link = vlessAcct.proxy;
    if (!link && vlessAcct) link = vlessAcct.proxy;
    if (link) {
      a.proxy = link;
      if (!a.nodeId && (nodeObj?.id || vlessAcct?.nodeId)) a.nodeId = nodeObj?.id || vlessAcct?.nodeId || '';
    }
    if (!String(a.proxyIp || '').trim() && DB.shared?.pippool?.ips && typeof DB.shared.pippool.ips === 'object') {
      const usedPips = new Set((DB.accounts || []).filter(x => x && x.id !== a.id).map(x => String(x.proxyIp || '').trim().toLowerCase()).filter(Boolean));
      const cands = Object.entries(DB.shared.pippool.ips)
        .filter(([k, e]) => k && e && e.ok === true && !e.gone && !e.banned && !usedPips.has(String(k).toLowerCase()))
        .sort((x, y) => (Number(x[1]?.ms) || 9999) - (Number(y[1]?.ms) || 9999));
      if (cands[0]) {
        a.proxyIp = cands[0][0];
        if (!a.region && cands[0][1]?.loc) a.region = cands[0][1].loc;
      }
    }
    saveSoon();
  } catch {}
  return a;
};
const sendMagicLinkAccount = require('./account-auth').createAccountMagicLinkSender({
  find: acct,
  session: prepSession,
  prepare: async a => { ensureAccountNodeProxy(a); return applyProxy(a); },
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
  prepare: async a => { ensureAccountNodeProxy(a); return applyProxy(a); },

  syncCookies: async (ses, response) => {
    if (response) await storeSetCookies(ses, response);
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
