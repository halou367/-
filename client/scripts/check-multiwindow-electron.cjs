// Closing one account window must never close the other visible account windows.
// xvfb-run -a electron --no-sandbox client/scripts/check-multiwindow-electron.cjs
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-multiwin-'));
app.setPath('userData', root);
const ids = ['mw-a', 'mw-b', 'mw-c'];
const accounts = ids.map(id => ({ id, name: id, proxy: '127.0.0.1:9', region: 'JP', routeAuto: false }));
const prefs = { theme: 'dark', notify: false, autoTitle: false, pinOn: false, ipPoll: 120, keepAlive: false };
fs.writeFileSync(path.join(root, 'accounts.json'), JSON.stringify({ accounts, open: ids, shared: { prefs } }));
const pause = ms => new Promise(r => setTimeout(r, ms));
const watchdog = setTimeout(() => { console.error('TIMEOUT'); app.exit(1); }, 120000);
const json = v => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
let quitSeen = false; app.on('before-quit', () => { quitSeen = true; });
app.whenReady().then(() => {
  for (const id of ids) {
    const ses = session.fromPartition('persist:acct-' + id);
    const handler = req => { const u = new URL(req.url);
      if (u.pathname === '/api/me') return json({ user: { id, email: id + '@example.invalid' } });
      if (u.pathname === '/api/history/unified') return json({ entries: [], pagination: { hasMore: false, cursor: null } });
      if (u.pathname === '/cdn-cgi/trace') return new Response('ip=203.0.113.9\nloc=JP\ncolo=NRT');
      if (u.pathname.startsWith('/api/')) return json({});
      if (u.pathname !== '/robots.txt') return json({ version: require('../package.json').version, files: {} });
      return new Response('<!doctype html><html><body>fixture</body></html>', { headers: { 'content-type': 'text/html' } }); };
    ses.protocol.handle('https', handler); ses.protocol.handle('http', handler);
  }
  void run().catch(e => { console.error('FAIL', e); app.exit(1); });
});
require('../src/main');
async function run() {
  const find = id => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.getTitle().includes(id));
  const end = Date.now() + 60000;
  while (Date.now() < end && !ids.every(id => find(id) && find(id).isVisible())) await pause(200);
  const before = ids.map(id => [id, !!find(id), find(id)?.isVisible()]);
  console.log('BEFORE', JSON.stringify(before));
  await pause(Number(process.env.MW_SETTLE || 8000));
  find('mw-a').close();
  await pause(5000);
  const after = ids.map(id => [id, !!find(id)]);
  console.log('AFTER', JSON.stringify(after), 'quit', quitSeen);
  clearTimeout(watchdog);
  if (quitSeen || find('mw-a') || !find('mw-b') || !find('mw-c')) { console.error('FAIL closing one window affected others'); app.exit(1); return; }
  console.log('PASS closing one account window keeps the others open');
  find('mw-b').close(); await pause(3000);
  if (quitSeen || !find('mw-c')) { console.error('FAIL second close affected the last window'); app.exit(1); return; }
  console.log('PASS closing a second window keeps the last one open'); app.exit(0);
}
