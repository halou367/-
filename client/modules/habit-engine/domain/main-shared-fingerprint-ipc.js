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
ipcMain.handle('host:shared', async (e, k, v) => {
  if (k === '__clipboardWrite') {
    try {
      clipboard.writeText(String(v ?? ''));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  if (k === '__localApiGateway') {
    if (!global.__branaLocalApiGateway) {
      const { createLocalApiGateway } = require('./local-api-gateway');
      global.__branaLocalApiGateway = createLocalApiGateway({
        getFallbackWebContents: () => {
          for (const w of wins.values()) {
            if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) return w.webContents;
          }
          return null;
        },
      });
    }
    return global.__branaLocalApiGateway.handleIpc(e.sender, v || {});
  }
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