'use strict';
const crypto = require('node:crypto');
const Policy = require('../ui/workspace-path');
// WebRTC/STUN bypass URL request interception and do not require media permission.
// Install this in every frame before any untrusted script, never through a host preload.
const LOCKDOWN = "(()=>{for(const n of Object.getOwnPropertyNames(globalThis)){if(/^(?:webkit|moz)?RTC/.test(n)){try{Object.defineProperty(globalThis,n,{value:undefined,writable:false,configurable:false});}catch{throw Error('Cannot isolate real-time network capability');}}}})();";
const VALID_ID = /^[a-zA-Z0-9-]{1,80}$/;
const errorResponse = (code, text = 'Workspace preview request denied') => new Response(text, { status: code, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// Dedicated ephemeral BrowserWindow/session. No preload, no Node, no account cookies,
// no native bridge. Only the authenticated owner can answer resource requests.
function install({ ipcMain, BrowserWindow, session, owner, icon }) {
  const previews = new Map();
  const trusted = e => !!owner(e.sender) && e.senderFrame === e.sender.mainFrame && /^(https:\/\/arena\.ai(?:\/|$)|file:)/.test(e.sender.getURL());
  function close(s, error) {
    if (!s || s.closed) return; s.closed = true; previews.delete(s.id);
    for (const p of s.pending.values()) { clearTimeout(p.timer); p.resolve(errorResponse(410)); } s.pending.clear();
    if (!s.sender.isDestroyed()) { s.sender.send('anc-preview', { id: s.id, closed: true, ...(error ? { error } : {}) }); s.sender.off('destroyed', s.ownerClosed); s.sender.off('did-start-navigation', s.nav); }
    if (!s.win.isDestroyed()) s.win.destroy();
    try { s.session.protocol.unhandle('https'); void s.session.clearStorageData().catch(() => {}); } catch {}
  }
  function closeOwner(sender) { for (const s of [...previews.values()]) if (s.sender === sender) close(s); }
  ipcMain.handle('host:previewOpen', async (e, opt) => {
    if (!trusted(e) || !opt || !VALID_ID.test(opt.id) || typeof opt.path !== 'string' || opt.path.length > 8192) return { ok: false, error: '无效的预览请求' };
    let parsed; try { parsed = Policy.split(opt.path); } catch { return { ok: false, error: '无效的工作区路径' }; }
    closeOwner(e.sender);
    const partition = 'workspace-preview-' + crypto.randomBytes(18).toString('hex');
    const ses = session.fromPartition(partition, { cache: false }), origin = 'https://' + crypto.randomBytes(18).toString('hex') + '.preview.invalid';
    const s = { id: opt.id, sender: e.sender, session: ses, origin, pending: new Map(), closed: false };
    let win;
    try {
      ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false)); ses.setPermissionCheckHandler(() => false);
      ses.on('will-download', event => event.preventDefault());
      ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
        const allowed = details.url.startsWith(origin + '/') && ['GET','HEAD'].includes(details.method) || /^(data:|blob:)/.test(details.url);
        cb({ cancel: !allowed });
      });
      ses.protocol.handle('https', async request => {
        const u = new URL(request.url);
        if (s.closed || u.origin !== origin || !['GET','HEAD'].includes(request.method)) return errorResponse(403);
        if (s.pending.size >= 128) return errorResponse(429, 'Too many workspace resources');
        const rid = crypto.randomBytes(12).toString('hex');
        return new Promise(resolve => {
          const timer = setTimeout(() => { s.pending.delete(rid); resolve(errorResponse(504, 'Workspace owner did not respond')); }, 50000);
          s.pending.set(rid, { resolve, timer, method: request.method });
          if (s.sender.isDestroyed()) { close(s); return; }
          s.sender.send('anc-preview', { id: s.id, request: rid, method: request.method, path: u.pathname + u.search, range: request.headers.get('Range') || '' });
        });
      });
      win = new BrowserWindow({ width: 1100, height: 780, minWidth: 360, minHeight: 280, title: String(opt.title || 'Workspace').slice(0,200) + ' · 隔离预览（外网已禁用）', icon,
        autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, safeDialogs: true, navigateOnDragDrop: false, devTools: false, plugins: false } });
      s.win = win; previews.set(s.id, s);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const guard = (ev, url) => { if (!url.startsWith(origin + '/')) ev.preventDefault(); };
      win.webContents.on('will-navigate', guard); win.webContents.on('will-redirect', guard);
      win.webContents.on('will-frame-navigate', ev => { if (!ev.url.startsWith(origin + '/') && !/^(about:blank|blob:)/.test(ev.url)) ev.preventDefault(); });
      win.webContents.on('will-attach-webview', ev => ev.preventDefault());
      win.webContents.on('page-title-updated', ev => ev.preventDefault());
      s.ownerClosed = () => close(s); s.nav = (_ev, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) close(s); };
      e.sender.once('destroyed', s.ownerClosed); e.sender.on('did-start-navigation', s.nav);
      win.on('closed', () => close(s));
      win.webContents.on('render-process-gone', () => close(s, '预览进程已退出'));
      win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      await win.loadURL('about:blank'); // start the renderer before configuring its document-start guard
      win.webContents.debugger.attach('1.3');
      win.webContents.debugger.on('detach', () => { if (!s.closed) close(s, '预览安全隔离已中断'); });
      await win.webContents.debugger.sendCommand('Page.enable');
      await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: LOCKDOWN });
      void win.loadURL(origin + '/' + Policy.encode(parsed.path) + parsed.suffix).catch(() => {});
      return { ok: true };
    } catch (err) {
      if (s.win) close(s); else { try { ses.protocol.unhandle('https'); } catch {} }
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('host:previewRespond', (e, res) => {
    if (!trusted(e) || !res || !VALID_ID.test(res.id)) return false;
    const s = previews.get(res.id), p = s?.pending.get(res.request);
    if (!p || s.sender !== e.sender || s.closed) return false;
    s.pending.delete(res.request); clearTimeout(p.timer);
    const fail = () => { p.resolve(errorResponse(502, 'Invalid workspace response')); return false; };
    if (![200,206,403,404,405,413,416,429,500,502,504].includes(res.status) || typeof res.body !== 'string' || res.body.length > Math.ceil(Policy.MAX_BODY / 3) * 4 + 8 || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(res.mime || '')) return fail();
    const bytes = Buffer.from(res.body, 'base64'); if (bytes.length > Policy.MAX_BODY) return fail();
    const headers = { 'Content-Type': res.mime + (/(?:^text\/|json|xml|javascript)/.test(res.mime) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-DNS-Prefetch-Control': 'off', 'Content-Security-Policy': Policy.CSP, 'Accept-Ranges': 'bytes' };
    if (res.status === 206) {
      if (![res.start,res.end,res.size].every(Number.isSafeInteger) || res.start < 0 || res.end < res.start || res.end >= res.size || res.size > Policy.MAX_FILE || (p.method !== 'HEAD' && bytes.length !== res.end-res.start+1)) return fail();
      headers['Content-Range'] = `bytes ${res.start}-${res.end}/${res.size}`;
    } else if (res.status === 416 && Number.isSafeInteger(res.size) && res.size >= 0) headers['Content-Range'] = 'bytes */' + res.size;
    if (p.method === 'HEAD' && Number.isSafeInteger(res.length) && res.length >= 0) headers['Content-Length'] = String(res.length);
    else headers['Content-Length'] = String(bytes.length);
    p.resolve(new Response(p.method === 'HEAD' ? null : bytes, { status: res.status, headers })); return true;
  });
  ipcMain.handle('host:previewClose', (e, id) => { const s = previews.get(id); if (trusted(e) && s?.sender === e.sender) close(s); return true; });
  return { closeOwner, closeAll: () => { for (const s of [...previews.values()]) close(s); }, previews };
}
module.exports = { install };
