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
    if (globalThis._branaWin32Addon === undefined) {
      globalThis._branaWin32Addon = null;
      for (const np of [
        process.resourcesPath && path.join(process.resourcesPath, 'bin', 'brana-win32.node'),
        path.join(__dirname, '..', 'resources', 'bin', 'brana-win32.node'),
        path.join(__dirname, '..', 'bin', 'brana-win32.node'),
        path.join(__dirname, '..', '..', '..', 'runtime-resources', 'bin', 'brana-win32.node'),
      ].filter(Boolean)) {
        try { if (fs.existsSync(np)) { globalThis._branaWin32Addon = require(np); break; } } catch {}
      }
    }
    const addon = globalThis._branaWin32Addon;
    if (addon && typeof addon.trimPid === 'function') {
      const execInProcTrim = () => {
        try {
          global.gc?.();
          try { addon.trimSelf?.(); } catch {}
          for (const p of pids) { try { addon.trimPid(Number(p)); } catch {} }
          if (typeof wins !== 'undefined' && wins instanceof Map) {
            for (const w of wins.values()) if (w && !w.isDestroyed() && !w.__hidden) applyWindowTaskMgrTitle(w);
          }
        } catch {}
      };
      setTimeout(execInProcTrim, 240).unref?.();
      if (totalWsKb > 105 * 1024) setTimeout(execInProcTrim, 850).unref?.();
      return;
    }
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