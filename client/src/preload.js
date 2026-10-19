// Context-isolated preload bridge for workspace window IPC and hardware profile consistency
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Hardware & environment profile consistency layer
function spoof(fp) {
  if (window.__fpDone) return; Object.defineProperty(window, '__fpDone', { value: 1 });
  const natives = new WeakSet(), ts = Function.prototype.toString;
  const nat = f => { natives.add(f); return f; };
  Function.prototype.toString = nat(function toString() { return natives.has(this) ? 'function ' + (this.name || '') + '() { [native code] }' : ts.call(this); });
  const def = (o, k, v) => { try { const d = Object.getOwnPropertyDescriptor(o, k) || {}; Object.defineProperty(o, k, { get: nat(Object.defineProperty(function () { return v; }, 'name', { value: 'get ' + k })), set: d.set, enumerable: d.enumerable !== false, configurable: true }); } catch {} };
  const N = Navigator.prototype, S = Screen.prototype;
  def(N, 'hardwareConcurrency', fp.cores); def(N, 'deviceMemory', fp.mem);
  // Language is controlled natively with request headers, including after region changes.
  const m = /^(\d+)x(\d+)$/.exec(fp.screen || '');
  if (m) { const w = +m[1], hh = +m[2]; def(S, 'width', w); def(S, 'height', hh); def(S, 'availWidth', w); def(S, 'availHeight', hh - 40); def(S, 'availLeft', 0); def(S, 'availTop', 0); def(S, 'colorDepth', 24); def(S, 'pixelDepth', 24); }
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = nat(function getParameter(p) { if (p === 37445) return fp.gpuVendor; if (p === 37446) return fp.gpu; return g.apply(this, arguments); });
  }
  // 画布：按种子给像素加极小的确定性噪声（同一账号每次一致，不同账号不同）
  let seed = fp.seed >>> 0 || 1;
  const noise = d => { let x = seed; for (let i = 0; i < d.length; i += 4) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; if ((x & 31) === 0) d[i + (x >>> 8) % 3] ^= 1; } };
  const C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, gid = C2 && C2.getImageData;
  if (gid) C2.getImageData = nat(function getImageData() { const r = gid.apply(this, arguments); try { noise(r.data); } catch {} return r; });
  const H = HTMLCanvasElement.prototype, tdu = H.toDataURL, tb = H.toBlob;
  const noisy = c => { try { if (!c.width || !c.height || c.width * c.height > 4e6) return c; const x = c.getContext('2d'); if (!x) return c; const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const tx = t.getContext('2d'); tx.drawImage(c, 0, 0); tx.putImageData(tx.getImageData(0, 0, t.width, t.height), 0, 0); return t; } catch { return c; } };
  H.toDataURL = nat(function toDataURL() { return tdu.apply(noisy(this), arguments); });
  if (tb) H.toBlob = nat(function toBlob() { return tb.apply(noisy(this), arguments); });
}
// Use the same saved hardware profile on all HTTPS origins; native locale/timezone is managed by CDP.
if (/^https:$/.test(location.protocol)) {
  try { const fp = ipcRenderer.sendSync('host:fpSync'); if (fp && fp.seed) webFrame.executeJavaScript('(' + spoof.toString() + ')(' + JSON.stringify(fp) + ')'); } catch {}
}
if (window.top === window && ['https:', 'chrome-extension:'].includes(location.protocol)) {
  const extensionGesture = (channel,...args) => {
    if (!navigator.userActivation.isActive) return Promise.reject(new Error('请点击扩展工具栏操作'));
    return ipcRenderer.invoke(channel,...args);
  };
  contextBridge.exposeInMainWorld('BranaBrowser', Object.freeze({
    extensions: () => ipcRenderer.invoke('browser:extensions:open'),
    bookmarkPins: () => ipcRenderer.invoke('browser:bookmarks:pinned'),
    bookmarkVisit: id => extensionGesture('browser:bookmarks:visit',id),
    bookmarks: () => extensionGesture('browser:bookmarks:open'),
    back: () => extensionGesture('browser:return-client'),
    route: () => extensionGesture('browser:route-open'),
    extensionList: () => ipcRenderer.invoke('browser:extensions:toolbar'),
    extensionPin: (key,pinned) => extensionGesture('browser:extensions:pin',key,pinned),
    extensionActivate: key => extensionGesture('browser:extensions:activate',key),
    download: opt => ipcRenderer.invoke('browser:download', opt),
    showFile: p => ipcRenderer.invoke('browser:showFile', p),
  }));
}
// Start the small browser chrome before page scripts and load-blocking resources finish.
if(window.top===window&&['https:','chrome-extension:'].includes(location.protocol)){
  try{const source=ipcRenderer.sendSync('browser:chromeSync');if(source)void webFrame.executeJavaScript(source).catch(()=>{});}catch{}
}
if ((location.origin === 'https://arena.ai' || location.protocol === 'file:') && window.top === window) {
  const call = (ch, ...a) => ipcRenderer.invoke('host:' + ch, ...a);
  contextBridge.exposeInMainWorld('BranaHost', {
    platform: 'desktop', extensionCompatibilityTest: (() => { try { const p = require('../package.json'); return Boolean(p.extensionCompatibilityTest || p.name === 'brana-ai-extension-test' || /-beta\b/i.test(String(p.version || ''))); } catch { return false; } })(),
    info: () => call('info'),
    listAccounts: lite => call('listAccounts', !!lite),
    saveAccount: a => call('saveAccount', a),
    routeDraft: request => call('routeDraft', request),
    routeSave: request => call('routeSave', request),
    renameAccount: (id, name) => call('renameAccount', id, name),
    removeAccount: id => call('removeAccount', id),
    openAccount: id => call('openAccount', id),
    login: u => call('login', u),
    browserMode: u => call('browserMode', u),
    authTask: request => call('authTask', request),
    authLink: u => call('authLink', String(u || '').slice(0, 4000)),
    protoFetch: (u, o) => call('protoFetch', String(u || '').slice(0, 4000), o && typeof o === 'object' ? o : {}),
    back: mode => call('back', mode),
    logout: () => call('logout'),
    setTitle: t => call('setTitle', t),
    openExternal: u => call('openExternal', u),
    copyImage: b64 => call('copyImage', b64),
    saveImage: (name, b64) => call('saveImage', name, b64),
    saveFile: (name, mime, text) => call('saveFile', name, mime, text),
    saveAs: (name, mime, text) => call('saveAs', name, mime, text),
    previewOpen: o => call('previewOpen', o), previewRespond: o => call('previewRespond', o), previewClose: id => call('previewClose', id),
    onPreview: cb => { ipcRenderer.on('anc-preview', (_e, data) => { try { cb(data); } catch {} }); },
    showFile: p => call('showFile', p),
    testIp: a => call('testIp', a),
    localScan: p => call('localScan', p),
    probe: o => call('probe', o),
    cancelProbe: requestId => call('cancelProbe',String(requestId||'')),
    onProbeProgress: cb => { const fn=(_e,data)=>{try{cb(data);}catch{}};ipcRenderer.on('host:pool-probe-progress',fn);return ()=>ipcRenderer.removeListener('host:pool-probe-progress',fn); },
    resolve: host => call('resolve', host),
    urlTest: o => call('urlTest', o),
    routeProbe: o => call('routeProbe', o), routeApply: o => call('routeApply', o), routePrefs: on => call('routePrefs', on),
    netEnv: () => call('netEnv'),
    updInfo: () => call('updInfo'), updStart: o => call('updStart', o), updStatus: () => call('updStatus'), updInstall: () => call('updInstall'), updFailed: () => call('updFailed'), updManual: () => call('updManual'), updFolder: () => call('updFolder'), updDismiss: () => call('updDismiss'),
    fetchSubscription: u => call('fetchSubscription',String(u||'').slice(0,16000)),
    fetchText: (u, o) => call('fetchText', u, o && typeof o === 'object' ? { publicData: o.publicData === true, direct: o.direct === true, long: o.long === true, bearer: typeof o.bearer === 'string' ? o.bearer.slice(0, 8000) : '', method: o.method === 'POST' ? 'POST' : 'GET', body: String(o.body || ''), type: String(o.type || '') } : undefined),
    genFp: () => call('genFp'),
    getCred: () => call('getCred'),
    noteAccount: o => call('noteAccount', o),
    fingerprintStore: (op, revision, payload) => call('fingerprintStore', op, revision, payload),
    shared: (k, v) => v === undefined ? call('shared', k) : call('shared', k, v),
    setShared: (k, v) => call('shared', k, v),
    strMerge: p => call('strMerge', p),
    calMerge: p => call('calMerge', p),
    exportAccounts: () => call('exportAccounts'),
    bgWork: w => call('bgWork', w),
    gnet: () => call('gnet'),
    gbStart: o => call('gbStart', o),
    gbWait: () => call('gbWait'),
    gbCancel: () => call('gbCancel'),
    winDrag: phase => call('winDrag', phase),
    signInAccount: id => call('signInAccount', id),
    registerTokenAccount: (id, opt) => call('registerTokenAccount', id, opt),
    setCookies: (id, list) => call('setCookies', id, list),
    refreshQuotas: () => call('refreshQuotas'),
    setTheme: t => call('theme', t),
    ready: () => call('ready'),
    stage: t => call('stage', t),
    gachaAccount: (id, cmd) => call('gachaAccount', id, cmd),
    takeCmd: () => call('takeCmd'),
    openManager: () => call('openManager'),
    acctCmd: (id, m) => call('acctCmd', id, m),
    accountStats: id => call('accountStats', id),
    onCmd: cb => { ipcRenderer.on('anc-cmd', (e, m) => { try { cb(m); } catch {} }); },
  });
}
