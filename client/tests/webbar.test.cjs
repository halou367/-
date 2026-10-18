const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { norm } = require('../ui/webbar.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('地址栏只接受 https 公网网址，没写协议自动补全', () => {
  assert.equal(norm('outlook.live.com'), 'https://outlook.live.com/');
  assert.equal(norm('  https://arena.ai/x?y=1 '), 'https://arena.ai/x?y=1');
  assert.equal(norm('http://example.com/a'), 'https://example.com/a');
  assert.equal(norm('example.com:8443/x'), 'https://example.com:8443/x');
  for (const bad of ['', 'foo', 'a b.com', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'localhost:3000', '127.0.0.1', '192.168.1.1', '10.0.0.5', '172.16.0.1', 'router.local', 'ftp://a.com']) assert.equal(norm(bad), null, bad);
});

test('浏览条不用 innerHTML / <style> 标签（外部页面的 CSP、Trusted Types 会拦）', () => {
  const src = read('ui/webbar.js');
  assert.ok(!/innerHTML|insertAdjacentHTML|createElement\('style'\)/.test(src));
  assert.match(src, /adoptedStyleSheets/);
});

test('桌面端和安卓都在客户端界面以外的网页注入浏览条', () => {
  const main = read('src/main.js'), java = read('android/app/src/main/java/ai/arena/client/MainActivity.java'), bundle = read('scripts/bundle.js');
  assert.match(main, /WEBBAR\b/); assert.ok(!/BACK_BTN/.test(main));
  assert.match(main, /!u\.startsWith\(UI_URL\)\) \{ if \(WEBBAR\)/);
  assert.match(java, /webbarJs/); assert.ok(!/BACK_BTN/.test(java));
  assert.match(java, /!url\.startsWith\(UI\)/);
  assert.match(bundle, /'webbar\.js'/);
});

test('网页注册：新建账号后用共享任务打开官网，启动时只用一次', async () => {
  const acc = read('ui/accounts.js'), boot = read('ui/boot.js');
  assert.match(acc, /Host\.shared\('webreg@' \+ a\.id, \{ at: now\(\) \}\)/);
  assert.match(acc, /WEBREG_NAME/);
  const start = boot.lastIndexOf('{ const account =', boot.indexOf("'webreg@'"));
  const end = boot.indexOf('// Explicit signup intent', start);
  assert.ok(start >= 0 && end > start && end < boot.indexOf("'signup@' + account.id"));
  const run = new (require('node:vm').Script)('(async () => {' + boot.slice(start, end) + '\nreturn "continue";})()');
  const events = [], stamp = Date.now(); let intent = { at: stamp };
  const context = require('node:vm').createContext({
    UI: { host: { account: { id: 'account-1' } } }, Date: { now: () => stamp },
    Host: { platform: 'desktop', shared: async (key, value) => {
      assert.equal(key, 'webreg@account-1');
      if (value === null) { events.push('clear'); intent = null; return true; }
      return intent;
    }, login: async () => events.push('login') },
    Pin: { hold: value => { assert.equal(value, true); events.push('release-pin'); } },
    toast: message => assert.fail(message), cleanErr: e => e.message
  });
  assert.equal(await run.runInContext(context), undefined);
  assert.deepEqual(events, ['clear', 'release-pin', 'login']);
  events.length = 0;
  assert.equal(await run.runInContext(context), 'continue');
  assert.deepEqual(events, [], 'consumed intent cannot open another login');
  intent = { at: stamp - 10 * 60e3 };
  assert.equal(await run.runInContext(context), 'continue');
  assert.deepEqual(events, [], 'expired intent is ignored');
  intent = { at: stamp }; context.Host.platform = 'web';
  assert.equal(await run.runInContext(context), 'continue');
  assert.deepEqual(events, [], 'web host does not start a native login');
});

test('host:shared（电脑 + 安卓）真的放行 webreg@<账号id>，否则网页注册任务保存不了', () => {
  const main = read('src/main.js'), java = read('android/app/src/main/java/ai/arena/client/MainActivity.java');
  const line = main.split('\n').find(l => l.includes('gacha|draft|gtok|signup|mailtok')), m = /\(([a-z|]+)\)@/.exec(line || '');
  assert.ok(m && /\bwebreg\b/.test(m[1]), '桌面端白名单没有 webreg');
  assert.ok(new RegExp('^(' + m[1] + ')@[\\w-]{1,64}$').test('webreg@ab12-cd34'));
  assert.equal((java.match(/gacha\|draft\|gtok\|signup\|mailtok\|webreg\)@/g) || []).length, 2, '安卓读 / 写白名单都要有 webreg');
});

test('browser mode: Android bar is at the top (below the status bar); Brana pages get client-style cards and composer', () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../ui/webbar.js'), 'utf8');
  const java = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  assert.match(java, /insetJs\(\) \+ "window\.__ancBarPos='top';" \+ webbarJs/);
  assert.match(src, /: 'var\(--sa-top,0px\)';/);
  assert.match(src, /`calc\(\$\{H\}px \+ var\(--sa-top,0px\)\)`/); assert.match(src, /margin-top', 'var\(--anc-bar\)'/);
  assert.match(src, /--anc-fill:calc\(100svh - var\(--anc-bar,0px\) - var\(--anc-foot,0px\)\)/, 'fill = window - top bar - client footer'); assert.match(src, /\.h-svh[^{]*\{height:var\(--anc-fill\)!important\}/, 'one-screen-high layouts subtract the bar and footer (no page scrollbar)');
  assert.match(src, /\/\(\^\|\\\.\)arena\\\.ai\$\/i\.test\(location\.hostname\)/);
  assert.match(src, /a\[href\^="\/agent\/"\]\.anc-on/);
  assert.doesNotMatch(src, /form:has\(textarea\)\{/);
  assert.match(src, /triggerBrowserDownload/);
  assert.match(java, /setDownloadListener/);
  assert.match(src, /pushPage\(\); sync\(\); skin\?\.\(\);/);
});

test('v0.13.143: Browser mode leaves native input box untouched, bridges file downloads, integrates EdgeTunnel ProxyIP pool, and optimizes mobile UX', () => {
  const webbar = read('ui/webbar.js');
  const boot = read('ui/boot.js');
  const main = read('src/main.js');
  const preload = read('src/preload.js');
  const pool = read('ui/pool.js');
  const css = read('ui/app.css');
  // 1. Browser mode no longer modifies native input box
  assert.doesNotMatch(boot.slice(0, boot.indexOf('const WebLayer')), /WebCompose\.start\(\)/);
  assert.doesNotMatch(webbar, /form:has\(textarea\)/);
  // 2. Browser mode file download bridge on Desktop & Android
  assert.match(webbar, /HTMLAnchorElement\.prototype\.click/);
  assert.match(webbar, /URL\.revokeObjectURL/);
  assert.match(preload, /download:\s*opt\s*=>\s*ipcRenderer\.invoke\('browser:download'/);
  assert.match(main, /ipcMain\.handle\('browser:download'/);
  assert.match(main, /ses\.on\('will-download'/);
  // 3. EdgeTunnel ProxyIP pool integration
  assert.match(pool, /EDGETUNNEL_COLO_SRC/);
  assert.match(pool, /EDGETUNNEL_ASN_SRC/);
  assert.match(pool, /EDGETUNNEL_API_SRC/);
  assert.match(pool, /edgeTunnelCountryFeed/);
  // 4. Mobile UX optimization
  assert.match(css, /v0\.13\.143 手机端全面体验优化/);
  assert.match(css, /body\.m \.bp-reconcile-grid/);
  // 5. Client update fixes on Mobile & Desktop
  const upd = read('ui/update.js');
  const closePs = read('scripts/close-installed-app.ps1');
  const instNsh = read('scripts/installer.nsh');
  assert.match(upd, /now\(\) - \(this\.at \|\| 0\) > 15000/);
  assert.match(upd, /actBtn\.textContent = '更新 v' \+ this\.info\.version/);
  assert.match(main, /--quit-for-update/);
  assert.match(main, /function quitForUpdate\(\)/);
  assert.match(closePs, /--quit-for-update/);
  assert.match(closePs, /-IgnoreUnreadable/);
  assert.match(instNsh, /FileWriteUTF16LE/);
  assert.match(instNsh, /nsExec::Exec \/TIMEOUT=60000/);
  // 6. Hot Standby IP/Node Pool (秒切), network-first & auto region adoption, and fast self-check
  const routePolicy = require('../ui/route-policy');
  const autoRoute = read('ui/auto-route.js');
  const envCheck = read('ui/env-check.js');
  const gacha = read('ui/gacha.js');
  assert.match(autoRoute, /const StandbyPool =/);
  assert.match(autoRoute, /adoptWorkingRegion\(/);
  assert.match(autoRoute, /onErrorSwitch\(/);
  assert.match(envCheck, /AutoRoute\.adoptWorkingRegion/);
  assert.match(gacha, /AutoRoute\.ensureStandby\('gacha-start'\)/);
  for (const st of [401, 403, 404, 408, 429, 500, 502, 503, 504]) {
    assert.equal(routePolicy.shouldRotateOnError({ status: st }), true);
  }
  assert.equal(routePolicy.shouldRotateOnError({ routeTimeout: true }), true);
  assert.equal(routePolicy.shouldRotateOnError({ authLocked: true, status: 429 }), false);
});

test('v0.13.143: StandbyPool 0-wait instant switch (秒切) applies pre-verified standby without live probing and falls back to live probe if standby fails', async () => {
  const RoutePolicy = require('../ui/route-policy');
  const a = { id: 'own', proxy: 'vless://node1', proxyIp: 'ip-old', nodeId: 'node1', region: 'IN', routeHome: 'IN' };
  const probes = [], writes = [];
  let standbyQueue = [
    {
      candidate: { proxy: 'vless://node1', proxyIp: 'ip-jp-fast', nodeId: 'node1', region: 'JP', kind: 'node' },
      result: { ok: true, ip: '203.0.113.88', loc: 'JP', ms: 38, service: true, realtime: true, ticket: 'sb-ticket-1' },
    },
  ];
  const engine = new RoutePolicy.Engine({
    retryMs: 0,
    allowCrossRegionEscape: true,
    networkFirst: true,
    batchSize: 4,
    now: () => 100000,
    read: async () => ({
      account: a,
      accounts: [a],
      nodes: [{ id: 'node1', link: 'vless://node1' }],
      pool: {
        rep: { '203.0.113.88': { pu: { fs: 5 } }, '203.0.113.99': { pu: { fs: 5 } } },
        ips: {
          'ip-jp-fast': { ok: true, loc: 'JP', ms: 38, eg: '203.0.113.88' },
          'ip-sg-backup': { ok: true, loc: 'SG', ms: 52, eg: '203.0.113.99' },
        },
      },
      enabled: true,
    }),
    link: n => n.link,
    standby: async () => standbyQueue.shift() || null,
    probe: async c => {
      probes.push(c);
      return { ok: true, ip: '203.0.113.99', loc: c.region || 'SG', ms: 52, service: true, realtime: true, ticket: 'live-ticket-2' };
    },
    local: async () => [],
    apply: async o => {
      if (o.ticket === 'expired-ticket') return { ok: false, error: 'expired' };
      writes.push(o);
      return { ok: true, account: { ...a, ...o.route } };
    },
  });
  // 1) Standby available: 0 probes, instant switch, and auto-adopts JP as region + routeHome
  const r1 = await engine.run('limited', true);
  assert.equal(r1.ok, true);
  assert.equal(r1.changed, true);
  assert.equal(r1.standby, true);
  assert.equal(probes.length, 0);
  assert.equal(writes[0].route.proxyIp, 'ip-jp-fast');
  assert.equal(writes[0].route.region, 'JP');
  assert.equal(writes[0].route.routeHome, 'JP');

  // 2) If first standby fails to apply, falls back to live parallel probe seamlessly
  standbyQueue = [
    {
      candidate: { proxy: 'vless://node1', proxyIp: 'ip-jp-fast', nodeId: 'node1', region: 'JP', kind: 'node' },
      result: { ok: true, ip: '203.0.113.88', loc: 'JP', ms: 38, service: true, realtime: true, ticket: 'expired-ticket' },
    },
  ];
  const r2 = await engine.run('error-switch', true);
  assert.equal(r2.ok, true);
  assert.equal(r2.changed, true);
  assert.equal(r2.standby, undefined);
  assert.ok(probes.length > 0);
});


