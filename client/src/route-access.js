const path = require('node:path');
const { fileURLToPath } = require('node:url');
// A receipt belongs to this renderer main frame, not merely to whichever account is currently visible.
function actor(event, { manager, offline, allowOffline = false } = {}) {
  const wc = event?.sender, frame = event?.senderFrame;
  if (!wc || wc.isDestroyed?.() || (frame && frame !== wc.mainFrame)) throw Error('线路操作只允许客户端主界面或账号管理主框架');
  let trusted = false;
  try {
    const url = new URL(wc.getURL());
    trusted = url.origin === 'https://arena.ai' && (url.pathname === '/robots.txt' || !!wc.__clientShell);
    if (url.protocol === 'file:') {
      const file = path.resolve(fileURLToPath(url));
      trusted = !!manager && file === path.resolve(manager) || allowOffline && !!offline && file === path.resolve(offline);
    }
  } catch {}
  if (!trusted) throw Error('此页面不能检测或修改账号线路');
  return String(wc.id) + ':' + String(wc.mainFrame?.processId ?? '') + ':' + String(wc.mainFrame?.routingId ?? '');
}
module.exports = { actor };
