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

