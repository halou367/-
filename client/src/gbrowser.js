// System browser OAuth helper: launches an isolated local Chrome/Edge profile for external OAuth sign-in
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFile } = require('child_process');
const BrowserPrivacy=require('./browser-privacy');
const ProxyDNS=require('./proxy-dns');

// ----- 找浏览器：优先系统默认浏览器（Chrome / Edge / Brave），其次 Chrome → Edge → Brave -----
function winReg(key, val) {
  return new Promise(res => { try { execFile('reg', ['query', key, '/v', val], { windowsHide: true, timeout: 4000 }, (err, out) => { const m = !err && String(out).match(new RegExp(val + '\\s+REG_\\w+\\s+(.+)')); res(m ? m[1].trim() : ''); }); } catch { res(''); } });
}
const exists = p => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };
async function findBrowser() {
  if (process.env.BRANA_GBROWSER) return exists(process.env.BRANA_GBROWSER) ? { exe: process.env.BRANA_GBROWSER, name: 'Chrome' } : null;
  const L = [];
  if (process.platform === 'win32') {
    const E = process.env, roots = [E.PROGRAMFILES, E['PROGRAMFILES(X86)'], E.LOCALAPPDATA].filter(Boolean);
    const add = (name, rel) => { for (const r of roots) L.push({ name, exe: path.join(r, rel) }); };
    add('Chrome', 'Google\\Chrome\\Application\\chrome.exe');
    add('Edge', 'Microsoft\\Edge\\Application\\msedge.exe');
    add('Brave', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe');
    const prog = await winReg('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', 'ProgId');
    const pref = /^ChromeHTML/i.test(prog) ? 'Chrome' : /^MSEdge/i.test(prog) ? 'Edge' : /^Brave/i.test(prog) ? 'Brave' : '';
    if (pref) L.sort((a, b) => (b.name === pref) - (a.name === pref));
  } else if (process.platform === 'darwin') {
    L.push({ name: 'Chrome', exe: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }, { name: 'Edge', exe: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' }, { name: 'Brave', exe: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  } else {
    for (const [name, p] of [['Chrome', '/usr/bin/google-chrome'], ['Chrome', '/usr/bin/google-chrome-stable'], ['Chromium', '/usr/bin/chromium'], ['Chromium', '/usr/bin/chromium-browser'], ['Edge', '/usr/bin/microsoft-edge'], ['Brave', '/usr/bin/brave-browser']]) L.push({ name, exe: p });
  }
  return L.find(x => exists(x.exe)) || null;
}

// ----- 带账号密码的上游代理：浏览器不能在启动参数里带密码，所以在本机开一个无密码的 SOCKS5 转发 -----
// 握手阶段的读取器：一直收着数据，按需取 n 个字节；握手完 stop() 后把剩下的数据交给转发
function reader(sock) {
  const st = { buf: Buffer.alloc(0), wake: null, dead: false };
  const on = d => { st.buf = Buffer.concat([st.buf, d]); st.wake?.(); };
  const cl = () => { st.dead = true; st.wake?.(); };
  sock.on('data', on); sock.on('close', cl);
  st.read = async n => { while (st.buf.length < n) { if (st.dead) throw new Error('closed'); await new Promise(r => { st.wake = r; }); st.wake = null; } const b = st.buf.subarray(0, n); st.buf = st.buf.subarray(n); return b; };
  st.stop = () => { sock.off('data', on); sock.off('close', cl); const rest = st.buf; st.buf = Buffer.alloc(0); return rest; };
  return st;
}
function upstreamConnect(up, host, port) {
  return new Promise((res, rej) => {
    const s = up.kind==='https' ? require('tls').connect({host:up.host,port:up.port,servername:up.serverName}) : net.connect(up.port, up.host); s.setTimeout(20000, () => s.destroy(new Error('timeout')));
    s.once('error', rej);
    s.once(up.kind==='https'?'secureConnect':'connect', async () => {
      try {
        const st = reader(s);
        if (up.kind === 'socks5') {
          const au = up.user ? 2 : 0; s.write(Buffer.from([5, 1, au]));
          const g = await st.read(2); if (g[1] !== au) throw new Error('socks auth method');
          if (au) { const u = Buffer.from(up.user), p = Buffer.from(up.pass || ''); s.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p])); const r = await st.read(2); if (r[1] !== 0) throw new Error('socks auth failed'); }
          const hb = Buffer.from(host); s.write(Buffer.concat([Buffer.from([5, 1, 0, 3, hb.length]), hb, Buffer.from([port >> 8, port & 255])]));
          const h = await st.read(4); if (h[1] !== 0) throw new Error('socks connect ' + h[1]);
          await st.read(h[3] === 1 ? 6 : h[3] === 4 ? 18 : (await st.read(1))[0] + 2);
        } else {
          const auth = up.user ? 'Proxy-Authorization: Basic ' + Buffer.from(up.user + ':' + (up.pass || '')).toString('base64') + '\r\n' : '';
          s.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
          let head = '';
          while (!head.includes('\r\n\r\n')) { head += (await st.read(1)).toString('latin1'); if (head.length > 8192) throw new Error('bad proxy reply'); }
          if (!/^HTTP\/1\.[01] 200/.test(head)) throw new Error(head.split('\r\n')[0]);
        }
        s.setTimeout(0); s.off('error', rej); res({ s, rest: st.stop() });
      } catch (e) { s.destroy(); rej(e); }
    });
  });
}
function socksForwarder(up) {
  return new Promise((res, rej) => {
    const srv = net.createServer(async c => {
      c.on('error', () => {});
      try {
        const st = reader(c);
        const g = await st.read(2); await st.read(g[1]); c.write(Buffer.from([5, 0]));
        const h = await st.read(4); let host;
        if (h[3] === 1) host = [...await st.read(4)].join('.');
        else if (h[3] === 3) host = (await st.read((await st.read(1))[0])).toString();
        else { const b = await st.read(16); host = b.toString('hex').match(/.{4}/g).join(':'); }
        const pb = await st.read(2), port = pb[0] << 8 | pb[1];
        const { s, rest } = await upstreamConnect(up, host, port);
        c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        const pend = st.stop(); if (rest.length) c.write(rest); if (pend.length) s.write(pend);
        s.on('error', () => c.destroy()); c.on('close', () => s.destroy()); s.on('close', () => c.destroy());
        c.pipe(s); s.pipe(c);
      } catch { try { c.end(Buffer.from([5, 1, 0, 1, 0, 0, 0, 0, 0, 0])); } catch {} }
    });
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ----- CDP over WebSocket（最小实现：文本帧、分片、ping/pong、64 位长度）-----
const crypto = require('crypto');
class Cdp {
  static connect(port, wsPath, ms = 15000) {
    return new Promise((res, rej) => {
      const s = net.connect(port, '127.0.0.1'); let head = Buffer.alloc(0), ok = false;
      const tm = setTimeout(() => { s.destroy(); rej(new Error('连接浏览器调试端口超时')); }, ms);
      s.once('error', e => { clearTimeout(tm); if (!ok) rej(e); });
      s.once('connect', () => s.write(`GET ${wsPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      const onHead = d => {
        head = Buffer.concat([head, d]); const i = head.indexOf('\r\n\r\n'); if (i < 0) return;
        s.off('data', onHead); clearTimeout(tm);
        const line = head.subarray(0, i).toString('latin1').split('\r\n')[0];
        if (!/^HTTP\/1\.1 101/.test(line)) { s.destroy(); rej(new Error('浏览器拒绝调试连接：' + line)); return; }
        ok = true; const c = new Cdp(s); const rest = head.subarray(i + 4); if (rest.length) c.feed(rest); res(c);
      };
      s.on('data', onHead);
    });
  }
  constructor(sock) {
    this.s = sock; this.n = 0; this.cb = new Map(); this.buf = Buffer.alloc(0); this.frag = [];
    sock.on('data', d => this.feed(d)); sock.on('error', () => {});
    sock.on('close', () => { for (const [, f] of this.cb) f[1](new Error('浏览器调试连接已断开')); this.cb.clear(); });
  }
  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 15, masked = b[1] & 0x80; let len = b[1] & 127, o = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); o = 10; }
      const mk = masked ? b.subarray(o, o + 4) : null; if (masked) o += 4;
      if (b.length < o + len) return;
      let p = Buffer.from(b.subarray(o, o + len)); this.buf = b.subarray(o + len);
      if (mk) for (let k = 0; k < p.length; k++) p[k] ^= mk[k & 3];
      if (op === 9) { this.frame(10, p); continue; }
      if (op === 8) { try { this.s.end(); } catch {} return; }
      if (op === 10) continue;
      this.frag.push(p); if (!fin) continue;
      const m = Buffer.concat(this.frag).toString('utf8'); this.frag = [];
      try { const j = JSON.parse(m); const f = j.id && this.cb.get(j.id); if (f) { this.cb.delete(j.id); j.error ? f[1](new Error(j.error.message)) : f[0](j.result); } else if(j.method) this.onEvent?.(j); } catch {}
    }
  }
  frame(op, data) {
    const p = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), n = p.length;
    const h = n < 126 ? Buffer.from([0x80 | op, 0x80 | n]) : n < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, n >> 8, n & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x80 | op; x[1] = 0x80 | 127; x.writeBigUInt64BE(BigInt(n), 2); return x; })();
    const mk = crypto.randomBytes(4), out = Buffer.alloc(n); for (let k = 0; k < n; k++) out[k] = p[k] ^ mk[k & 3];
    this.s.write(Buffer.concat([h, mk, out]));
  }
  send(method, params = {}, sessionId, ms = 15000) {
    const id = ++this.n;
    return new Promise((res, rej) => {
      this.cb.set(id, [res, rej]);
      try { this.frame(1, JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch (e) { this.cb.delete(id); rej(e); return; }
      setTimeout(() => { if (this.cb.delete(id)) rej(new Error('浏览器没有响应（' + method + '）')); }, ms);
    });
  }
  close() { try { this.s.destroy(); } catch {} }
}
const freePort = () => new Promise((res, rej) => { const v = net.createServer(); v.on('error', rej); v.listen(0, '127.0.0.1', () => { const p = v.address().port; v.close(() => res(p)); }); });
// 找调试地址：浏览器在 stderr 打印「DevTools listening on ws://127.0.0.1:端口/devtools/browser/<id>」；
// 没看到就问 http://127.0.0.1:端口/json/version（有的版本 / 平台不打印），再看资料夹里的 DevToolsActivePort
const http = require('http');
const jsonVersion = port => new Promise(res => {
  const q = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1500 }, r => { let t = ''; r.on('data', d => { t += d; }); r.on('end', () => { try { const u = new URL(JSON.parse(t).webSocketDebuggerUrl); res({ port: +u.port || port, path: u.pathname }); } catch { res(null); } }); });
  q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); });
});
async function devtoolsAddr(dir, proc, port, peek = () => null, ms = 25000) {
  const f = path.join(dir, 'DevToolsActivePort'), t0 = Date.now();
  for (let n = 0; Date.now() - t0 < ms; n++) {
    if (proc.exitCode !== null) throw new Error('浏览器已退出');
    const x = peek(); if (x) return x;
    try { const [p, w] = fs.readFileSync(f, 'utf8').split(/\r?\n/); if (+p > 0 && /^\/devtools\/browser\//.test(w || '')) return { port: +p, path: w.trim() }; } catch {}
    if (port && n % 3 === 2) { const j = await jsonVersion(port); if (j) return j; }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('浏览器没有打开调试端口');
}

const BRANA = d => /(^|\.)arena\.ai$/i.test(String(d || '').replace(/^\./, ''));
const SS_E2C = { strict: 'Strict', lax: 'Lax', no_restriction: 'None' }, SS_C2E = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' };
const toCdp = c => ({ name: c.name, value: c.value, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly,
  ...(c.hostOnly ? { url: 'https://' + c.domain.replace(/^\./, '') + (c.path || '/') } : { domain: c.domain }),
  ...(SS_E2C[c.sameSite] ? { sameSite: SS_E2C[c.sameSite] } : {}), ...(!c.session && c.expirationDate ? { expires: c.expirationDate } : {}) });
const ckKey = c => c.name + '|' + String(c.domain).replace(/^\./, '') + '|' + (c.path || '/');

// ----- 一次登录 -----
const runs = new Map();   // 账号 id → { proc, cdp, srv, done, result }（进行中）
const last = new Map();   // 账号 id → 最近一次（完成后 wait 仍能拿到结果）
function cancel(id, why = 'cancel') {
  const r = runs.get(id); if (!r) return false;
  r.finish({ [why]: true });
  return true;
}
async function start({ id, ses, proxy, bypass, privacy=BrowserPrivacy.profile(), userData, url, log = () => {}, noSandbox = false }) {
  cancel(id);
  const b = await findBrowser(); if (!b) return { fallback: true, reason: '没有找到 Chrome / Edge' };
  const dir = path.join(userData, 'gbrowser', String(id).replace(/[^\w-]/g, '_'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  // Secure proxy-endpoint DNS in the dedicated browser profile; never an ISP DNS fallback.
  const defaults=path.join(dir,'Default');fs.mkdirSync(defaults,{recursive:true});const prefsFile=path.join(defaults,'Preferences');let prefs={};try{prefs=JSON.parse(fs.readFileSync(prefsFile,'utf8'));}catch{}prefs.dns_over_https={mode:'secure',templates:'https://1.1.1.1/dns-query'};prefs.webrtc={...prefs.webrtc,ip_handling_policy:'disable_non_proxied_udp'};if(privacy.languages.length)prefs.intl={...prefs.intl,accept_languages:privacy.languages.join(',')};else if(prefs.intl){delete prefs.intl.accept_languages;delete prefs.intl.app_locale;}fs.writeFileSync(prefsFile,JSON.stringify(prefs));
  // 上次异常退出留下的锁文件会让新浏览器把任务交给一个不存在的进程
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
  let srv = null, px = [];
  if (proxy?.mode === 'direct') px = ['--no-proxy-server'];
  else if (proxy?.pac) return {error:'已禁用分流 PAC：Google 必须与账号共用出口'};
  else if (proxy?.rules) {
    let rule = proxy.rules;
    if (proxy.user) { const u = new URL(proxy.rules); srv = await socksForwarder({ kind: /^socks/.test(u.protocol) ? 'socks5' : u.protocol==='https:'?'https':'http', host: (await ProxyDNS.resolveBootstrap(u.hostname))[0], serverName:u.hostname, port: +u.port, user: proxy.user, pass: proxy.pass }); rule = 'socks5://127.0.0.1:' + srv.address().port; }
    px = ['--proxy-server=' + rule, '--proxy-bypass-list=' + '<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];
  }
  let privacyArgs;try{privacyArgs=BrowserPrivacy.browserArgs(proxy);}catch(error){srv?.close();return {error:error.message};}
  const title = encodeURIComponent('<!doctype html><meta charset=utf-8><title>Brana AI · Google 登录</title><body style="font:15px system-ui,sans-serif;color:#555;display:grid;place-items:center;height:90vh;margin:0">正在打开 Google 登录…</body>');
  try { fs.unlinkSync(path.join(dir, 'DevToolsActivePort')); } catch {}
  const dport = await freePort();
  const args = ['--user-data-dir=' + dir, '--remote-debugging-port=' + dport, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--hide-crash-restore-bubble', '--window-size=520,720',
    ...px, ...privacyArgs, '--disable-background-networking', ...(privacy.locale?['--lang='+privacy.locale]:[]), ...(noSandbox ? ['--no-sandbox'] : []), '--app=data:text/html;charset=utf-8,' + title];
  let proc;
  try { proc = spawn(b.exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false }); }
  catch (e) { try { srv?.close(); } catch {} return { fallback: true, reason: '无法启动 ' + b.name + '：' + (e.message || e) }; }
  let errTail = '', wsAddr = null, errAll = '';
  proc.stderr.on('data', d => { errTail = (errTail + d).slice(-600); if (!wsAddr) { errAll = (errAll + d).slice(-4000); const m = errAll.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)(\/devtools\/browser\/[\w-]+)/); if (m) wsAddr = { port: +m[1], path: m[2] }; } });
  // 调试连接在浏览器起来后才建立；在那之前 send 先排队等着
  let cdpReal = null, cdpErr = null; const cdpReady = devtoolsAddr(dir, proc, dport, () => wsAddr).then(d => Cdp.connect(d.port, d.path)).then(c => { cdpReal = c; return c; }, e => { cdpErr = e; throw e; });
  cdpReady.catch(() => {});
  const cdp = { send: (m, p, sid, ms) => cdpReal ? cdpReal.send(m, p, sid, ms) : cdpErr ? Promise.reject(cdpErr) : cdpReady.then(c => c.send(m, p, sid, ms)), close: () => cdpReal?.close() };
  let resolveDone; const done = new Promise(r => { resolveDone = r; });
  const run = { proc, cdp, srv, name: b.name, done, result: null };
  run.finish = res => {
    if (run.result) return; run.result = res; runs.delete(id);
    Promise.resolve().then(() => cdpReal ? cdpReal.send('Browser.close', {}, undefined, 3000) : null).catch(() => {}).finally(() => { cdp.close(); setTimeout(() => { try { proc.kill(); } catch {} }, 2500); });
    try { srv?.close(); } catch {}
    resolveDone(res);
  };
  proc.on('exit', () => { if (!run.result) run.finish({ cancel: true, closed: true }); });
  proc.on('error', e => { if (!run.result) run.finish({ fallback: true, reason: '无法启动 ' + b.name + '：' + (e.message || e) }); });
  runs.set(id, run); last.set(id, run);
  try {
    const version=await cdp.send('Browser.getVersion', {}, undefined, 20000);
    await cdp.send('Browser.setPermission',{permission:{name:'geolocation'},setting:'denied'});
    const targets=new Map(),AUTO={autoAttach:true,waitForDebuggerOnStart:true,flatten:true};
    cdpReal.onEvent=event=>{if(event.method!=='Target.attachedToTarget')return;const {sessionId,targetInfo}=event.params;if(targets.has(targetInfo.targetId))return;
      const ready=(async()=>{try{await BrowserPrivacy.configure((m,p)=>cdp.send(m,p,sessionId),privacy,{worker:/worker/.test(targetInfo.type),ua:version.userAgent});if(targetInfo.type==='page'||targetInfo.type==='iframe')await cdp.send('Target.setAutoAttach',AUTO,sessionId);await cdp.send('Runtime.runIfWaitingForDebugger',{},sessionId);return sessionId;}catch(error){await cdp.send('Target.closeTarget',{targetId:targetInfo.targetId}).catch(()=>{});throw error;}})();
      targets.set(targetInfo.targetId,ready);ready.catch(()=>{});
    };
    await cdp.send('Target.setAutoAttach',AUTO);
    const mine = (await ses.cookies.get({})).filter(c => BRANA(c.domain));
    if (mine.length) await cdp.send('Storage.setCookies', { cookies: mine.map(toCdp) });
    let tid = ((await cdp.send('Target.getTargets')).targetInfos || []).find(t => t.type === 'page')?.targetId;
    if (!tid) tid = (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
    let sessionId;if(targets.has(tid))sessionId=await targets.get(tid);else{({sessionId}=await cdp.send('Target.attachToTarget',{targetId:tid,flatten:true}));await BrowserPrivacy.configure((m,p)=>cdp.send(m,p,sessionId),privacy,{ua:version.userAgent});await cdp.send('Target.setAutoAttach',AUTO,sessionId);}
    await cdp.send('Page.navigate', { url }, sessionId);
    // Keep the CDP session attached: detaching would discard native timezone/locale overrides.
    log('opened ' + b.name + ' cookies=' + mine.length);
  } catch (e) {
    const why = String(e.message || e) + (errTail ? '｜' + errTail.trim().split(/\r?\n/).pop().slice(0, 160) : '');
    run.finish({ fallback: true, reason: b.name + ' 启动失败：' + why });
    return run.result;
  }
  // 等登录完成：页面回到 arena.ai 的返回地址（或登录过程中离开过 arena.ai 又回来）
  (async () => {
    const t0 = Date.now(); let away = false, empty = 0;
    while (!run.result) {
      await new Promise(r => setTimeout(r, 700));
      if (run.result) return;
      if (Date.now() - t0 > 15 * 60e3) { run.finish({ error: '15 分钟内没有完成 Google 登录，已关闭浏览器' }); return; }
      let pages;
      try { pages = ((await cdp.send('Target.getTargets', {}, undefined, 5000)).targetInfos || []).filter(t => t.type === 'page'); } catch { continue; }
      // 登录窗口被关掉了（浏览器还在后台）：当作取消
      if (!pages.length) { if (++empty >= 3) { run.finish({ cancel: true, closed: true }); return; } continue; } empty = 0;
      const u = pages.map(t => t.url).find(x => /^https:\/\/(?!arena\.ai\/)/.test(x)); if (u) away = true;
      const back = pages.map(t => t.url).find(x => /^https:\/\/arena\.ai\//.test(x) && !/^https:\/\/arena\.ai\/nextjs-api\//.test(x) && (/[?&]glogin=1/.test(x) || away));
      if (!back) continue;
      try {
        const all = ((await cdp.send('Storage.getCookies')).cookies || []).filter(c => BRANA(c.domain));
        const keep = new Set(all.map(ckKey));
        for (const c of await ses.cookies.get({})) if (BRANA(c.domain) && !keep.has(ckKey(c))) await ses.cookies.remove('https://' + c.domain.replace(/^\./, '') + (c.path || '/'), c.name).catch(() => {});
        for (const c of all) {
          await ses.cookies.set({ url: 'https://' + c.domain.replace(/^\./, '') + (c.path || '/'), name: c.name, value: c.value, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly,
            ...(c.domain.startsWith('.') ? { domain: c.domain } : {}), ...(c.expires > 0 ? { expirationDate: c.expires } : {}), sameSite: SS_C2E[c.sameSite] || 'unspecified' }).catch(() => {});
        }
        await ses.cookies.flushStore?.().catch?.(() => {});
        let p = '/robots.txt?glogin=1'; try { const U = new URL(back); if (/[?&]glogin=1/.test(U.search)) p = U.pathname + U.search; else p = '/robots.txt?glogin=1&from=' + encodeURIComponent(U.pathname + U.search); } catch {}
        log('done cookies=' + all.length + ' back=' + back.slice(0, 80));
        run.finish({ ok: true, back: p, n: all.length });
      } catch (e) { run.finish({ error: '取回登录状态失败：' + (e.message || e) }); }
      return;
    }
  })();
  return { started: true, name: b.name };
}
const wait = id => (runs.get(id) || last.get(id))?.done || Promise.resolve({ cancel: true, none: true });
module.exports = { start, wait, cancel, findBrowser, socksForwarder, Cdp, devtoolsAddr };
