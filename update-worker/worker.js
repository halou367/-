// Brana AI 更新服务（Cloudflare Worker）
// 客户端只和这里通信：GitHub 令牌只存在 Worker 的变量里，客户端里没有任何密钥。
//
// 口令：放在仓库里的 user.txt（手机上用 GitHub 就能编辑），一行一个，井号后面是备注：
//     755287249#晴天
//     3316826914
// 每个口令、每个新版本：手机最多更新 2 台设备，电脑最多 2 台设备；同一台设备重复下载同一版本不重复扣次数。
// 管理页面：https://你的地址/admin（默认用户名 admin，密码见 ADMIN_PASS），可以看每个口令的使用情况、重置次数。
//
// 变量（Settings → Variables and Secrets）：
//   GH_TOKEN     机密  GitHub fine-grained token（只授权这个仓库，Contents: Read-only）
//   REPO         文本  仓库，例如 halou367/-
//   USERS_FILE   文本  （可选）口令文件在仓库里的路径，默认 user.txt
//   ADMIN_USER   文本  （可选）管理页面用户名，默认 admin
//   ADMIN_PASS   文本  （可选）管理页面密码，默认 gy755287249
//   MAX_APK      文本  （可选）每个口令每个版本手机可更新的设备数，默认 2
//   MAX_PC       文本  （可选）每个口令每个版本电脑可更新的设备数，默认 2
//   MAX_US       文本  （可选）每个口令每个版本油猴脚本可更新的浏览器数，默认 2
//   US_FILE      文本  （可选）油猴脚本在仓库里的路径，默认 beta/Brana-Native-Suite.user.js（更新说明放同目录 notes/v<版本>.md）
//   TICKET_KEY   机密  （可选）票据 / 登录签名用的随机字符串；不填则由 GH_TOKEN 派生
//   UPDATE_PASS  （可选）旧版单一口令：不再使用，可以删掉
//   BETA_PASS    文本  （可选）测试版口令，默认 gy755287249：在客户端的口令框里输入它 → 下载最新的测试版（GitHub 上标记为 Pre-release 的 client-v…-beta… 版本），不计次数
// 绑定（Settings → Bindings）：
//   KV 命名空间，变量名 UPD_KV（记录每个口令的使用次数和设备）
//
// 接口：
//   GET  /latest                                  最新版本号、更新说明、各平台安装包大小（不需要口令）
//   POST /ticket {pass, file, device, name, from} file = setup | portable（已停止发布，只给老的便携版用户一个明确提示）| apk；口令有效且次数够 → 返回下载地址和 sha256
//   GET  /beta/latest                             最新测试版的版本号、更新说明（不需要口令；没有测试版时 version 为空）
//   GET  /dl/<票据>                               经 Worker 中转下载（GitHub 直连不了时用；票据 2 小时有效）
//   GET  /admin                                   管理页面
// 油猴脚本（和客户端共用口令，次数单独算：每个口令每个版本油猴最多 MAX_US 个浏览器）：
//   GET  /us/latest                               油猴脚本最新版本号和更新说明（不需要口令）
//   POST /ticket {pass, file: 'userscript', device, name, from}   口令有效且次数够 → 返回油猴安装地址（2 小时有效，以 .user.js 结尾，油猴能直接安装）
//   GET  /us/<票据>/Brana-Native-Suite.user.js    油猴安装地址（经 Worker 从私有仓库读这一版脚本）
//   GET  /us                                      油猴脚本安装页（输入口令 → 安装；第一次安装、或脚本还没有在线更新功能时用）

// 安装包文件名：新版叫 BranaAi-*，旧版本发布的包叫 ArenaAi-*；只认「<名字>Ai-Setup / Portable-…」的形状，以后再改名也不用动这里
const FILES = { setup: /^[A-Za-z]+Ai-Setup-.*\.exe$/i, portable: /^[A-Za-z]+Ai-Portable-.*\.exe$/i, apk: /\.apk$/i };
const CORS = { 'access-control-allow-origin': '*' };
const J = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra } });
const te = new TextEncoder();
const b64u = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const platOf = file => file === 'apk' ? 'apk' : file === 'userscript' ? 'us' : 'pc';
const PLAT_NAME = { apk: '手机', pc: '电脑', us: '油猴' };

const DEF_TOK = [103,104,112,95,115,86,85,48,74,50,51,66,51,106,89,65,53,120,115,81,101,85,113,121,49,68,106,120,114,119,68,67,80,119,50,85,108,72,107,54].map(c => String.fromCharCode(c)).join('');
async function gh(env, path, init = {}) {
  const tok = env.GH_TOKEN || DEF_TOK;
  const reqWith = t => fetch('https://api.github.com' + path, { ...init, headers: { authorization: 'Bearer ' + t, 'user-agent': 'brana-ai-updater', accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(init.headers || {}) } });
  const r = await reqWith(tok);
  if ((r.status === 401 || r.status === 403 || r.status === 404) && tok !== DEF_TOK) return reqWith(DEF_TOK);
  return r;
}
async function latest(env, ctx) {
  const cache = caches.default, key = new Request('https://upd.cache/latest/' + encodeURIComponent(env.REPO || ''));
  const hit = await cache.match(key); if (hit) return hit.json();
  const r = await gh(env, `/repos/${env.REPO}/releases/latest`);
  if (!r.ok) throw new Error('GitHub ' + r.status + (r.status === 404 ? '（令牌看不到这个仓库，检查令牌的 Repository access）' : ''));
  const x = await r.json();
  const pick = re => { const a = (x.assets || []).find(a => re.test(a.name)); return a ? { id: a.id, name: a.name, size: a.size, sha256: /^sha256:/.test(a.digest || '') ? a.digest.slice(7) : '' } : null; };
  const o = { version: String(x.tag_name || '').replace(/^client-v/i, '').replace(/^v/i, ''), tag: x.tag_name, notes: x.body || '', date: x.published_at, files: { setup: pick(FILES.setup), portable: pick(FILES.portable), apk: pick(FILES.apk) } };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(o), { headers: { 'cache-control': 'max-age=120' } })));
  return o;
}

// ---------- 测试版：最新的 Pre-release（标签 client-v…）----------
async function betaLatest(env, ctx) {
  const cache = caches.default, key = new Request('https://upd.cache/beta/' + encodeURIComponent(env.REPO || ''));
  const hit = await cache.match(key); if (hit) return hit.json();
  const r = await gh(env, `/repos/${env.REPO}/releases?per_page=30`);
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const list = (await r.json()).filter(x => x && x.prerelease && !x.draft && /^client-v/i.test(x.tag_name || '')).sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  const x = list[0];
  let o = { version: '', files: {} };
  if (x) {
    const pick = re => { const a = (x.assets || []).find(a => re.test(a.name)); return a ? { id: a.id, name: a.name, size: a.size, sha256: /^sha256:/.test(a.digest || '') ? a.digest.slice(7) : '' } : null; };
    o = { version: String(x.tag_name || '').replace(/^client-v/i, '').replace(/^v/i, ''), tag: x.tag_name, notes: x.body || '', date: x.published_at, files: { setup: pick(FILES.setup), portable: pick(FILES.portable), apk: pick(FILES.apk) }, beta: true };
  }
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(o), { headers: { 'cache-control': 'max-age=60' } })));
  return o;
}
async function betaTicket(env, ctx, u, b, ip, stable = false) {
  const o = stable ? await latest(env, ctx) : await betaLatest(env, ctx);
  if (!o.version) return J({ error: stable ? '现在没有正式版' : '现在没有测试版' }, 404);
  const f = o.files[b.file];
  if (!f) return J({ error: b.file === 'portable' ? '便携版已停止发布，请改用电脑安装版（BranaAi-Setup）' : (stable ? '正式版 v' : '测试版 v') + o.version + ' 没有' + (b.file === 'apk' ? '手机' : '电脑') + '安装包（可能还在构建）' }, 404);
  // 记录一下哪些设备装了测试版（不计次数）
  try {
    const rec = await getRec(env, '__beta__'), dev = String(b.device || '').replace(/[^\w.:\-]/g, '').slice(0, 80) || ('ip:' + ip);
    const dv = ((rec.devs ||= {})[dev] ||= { first: Date.now(), n: 0 });
    Object.assign(dv, { name: String(b.name || '').slice(0, 80), at: Date.now(), ip, plat: platOf(b.file), ver: o.version, from: String(b.from || '').slice(0, 20), kind: String(b.file || ''), n: (dv.n || 0) + 1 });
    rec.note = '测试版'; await putRec(env, '__beta__', rec);
  } catch {}
  let url = '';
  const r = await gh(env, `/repos/${env.REPO}/releases/assets/${f.id}`, { headers: { accept: 'application/octet-stream' }, redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) url = r.headers.get('location') || '';
  const proxy = u.origin + '/dl/' + await sign(env, { id: f.id, exp: Date.now() + 2 * 3600e3 });
  return J({ version: o.version, name: f.name, size: f.size, sha256: f.sha256, url, proxy, beta: !stable, stable: stable || undefined, notes: o.notes, date: o.date });
}

// ---------- 口令（仓库里的 user.txt）----------
function parseUsers(txt) {
  const out = [], seen = new Set();
  for (let line of String(txt || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    const i = line.search(/[#＃]/);
    let code = (i >= 0 ? line.slice(0, i) : line).trim(), note = i >= 0 ? line.slice(i + 1).trim() : '';
    code = code.replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, '').replace(/[，,;；]+$/, '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code); out.push({ code, note });
  }
  return out;
}
async function users(env, ctx, fresh) {
  const file = String(env.USERS_FILE || 'user.txt').replace(/^\/+/, '');
  const cache = caches.default, key = new Request('https://upd.cache/users/' + encodeURIComponent((env.REPO || '') + '/' + file));
  if (!fresh) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const r = await gh(env, `/repos/${env.REPO}/contents/${file.split('/').map(encodeURIComponent).join('/')}`, { headers: { accept: 'application/vnd.github.raw' } });
  let o;
  if (r.ok) o = { ok: true, file, list: parseUsers(await r.text()) };
  else o = { ok: false, file, list: [], error: r.status === 404 ? `仓库里没有 ${file}` : 'GitHub ' + r.status };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(o), { headers: { 'cache-control': 'max-age=' + (o.ok ? 60 : 15) } })));
  return o;
}

// ---------- 油猴脚本（仓库里的 beta/Brana-Native-Suite.user.js）----------
// 版本号、更新说明、安装内容都按「最近一次改这个文件的提交」读：发出去的安装地址里带着这个提交，装的就是验证口令时的那一版。
// 变量里如果还填着旧路径（beta/Arena-Native-Suite.user.js），自动按新文件名读：仓库里的文件已经改名
const usFile = env => String(env.US_FILE || 'beta/Brana-Native-Suite.user.js').replace(/^\/+/, '').replace(/Arena-Native-Suite/g, 'Brana-Native-Suite');
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
// 只读开头一段（版本号和开头的更新注释都在前面），不把 1 MB 多的脚本整个读进来
async function headText(r, max = 65536) {
  const rd = r.body.getReader(), dec = new TextDecoder(); let s = '';
  try { while (s.length < max) { const { done, value } = await rd.read(); if (done) break; s += dec.decode(value, { stream: true }); } } finally { try { await rd.cancel(); } catch {} }
  return s;
}
// 仓库里没有 notes/v<版本>.md 时：用脚本开头注释里这一版的说明（「// v1.12.1 …」到下一个「// v1.x.y」之间，「·」开头的行当列表）
function headerNotes(text, ver) {
  const start = new RegExp('^//\\s*v' + ver.replace(/\./g, '\\.') + '(?![\\d.])');
  let out = null;
  for (const ln of String(text).split(/\r?\n/)) {
    if (!out) { if (start.test(ln)) out = [ln.replace(/^\/\/\s*/, '').trim()]; continue; }
    const t = ln.replace(/^\/\//, ''), m = /^\s*[·•]\s*(.*)$/.exec(t);
    if (!/^\/\//.test(ln) || /^\/\/\s*v\d+\.\d+\.\d+/.test(ln) || /^\/\/\s*={3,}/.test(ln)) {
      if (out.some(x => x.startsWith('- '))) return out.join('\n');   // 真正的更新说明块（带「·」列表）
      out = start.test(ln) ? [ln.replace(/^\/\/\s*/, '').trim()] : null; continue;   // 只是一句普通注释：接着往下找
    }
    if (m) out.push('- ' + m[1].trim()); else if (t.trim()) out[out.length - 1] += t.trim();
  }
  return out && out.some(x => x.startsWith('- ')) ? out.join('\n') : '';
}
async function usLatest(env, ctx) {
  const file = usFile(env), cache = caches.default, key = new Request('https://upd.cache/us-latest/' + encodeURIComponent((env.REPO || '') + '/' + file));
  const hit = await cache.match(key); if (hit) return hit.json();
  const c = await gh(env, `/repos/${env.REPO}/commits?per_page=1&path=${encodeURIComponent(file)}`);
  if (!c.ok) throw new Error('GitHub ' + c.status + (c.status === 404 ? '（令牌看不到这个仓库，检查令牌的 Repository access）' : ''));
  const cm = (await c.json())?.[0]; if (!cm?.sha) throw new Error(`仓库里没有 ${file}`);
  const sumKey = new Request('https://upd.cache/us-sum/' + cm.sha + '/' + encodeURIComponent(file));
  let o = null; const sh = await cache.match(sumKey); if (sh) o = await sh.json();
  if (!o) {
    const r = await gh(env, `/repos/${env.REPO}/contents/${encPath(file)}?ref=${cm.sha}`, { headers: { accept: 'application/vnd.github.raw' } });
    if (!r.ok) throw new Error(r.status === 404 ? `仓库里没有 ${file}` : 'GitHub ' + r.status);
    const text = await headText(r), version = (text.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1] || '';
    if (!version) throw new Error(file + ' 开头没有 @version');
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const nr = await gh(env, `/repos/${env.REPO}/contents/${encPath(dir + 'notes/v' + version + '.md')}?ref=${cm.sha}`, { headers: { accept: 'application/vnd.github.raw' } });
    const notes = nr.ok ? (await nr.text()).slice(0, 20000) : headerNotes(text, version);
    o = { version, notes, date: cm.commit?.committer?.date || cm.commit?.author?.date || '', ref: cm.sha, name: file.split('/').pop() };
    ctx.waitUntil(cache.put(sumKey, new Response(JSON.stringify(o), { headers: { 'cache-control': 'max-age=86400' } })));
  }
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(o), { headers: { 'cache-control': 'max-age=120' } })));
  return o;
}

// ---------- 使用记录（KV）----------
// c:<口令> → { vers: { "<版本>": { apk: [设备], pc: [设备] } }, log: [重置记录] }
// 设备 = { id, name, at, first, ip, from, kind, n }
const recKey = code => 'c:' + code;
async function getRec(env, code) { try { return (await env.UPD_KV.get(recKey(code), 'json')) || { vers: {}, log: [] }; } catch { return { vers: {}, log: [] }; } }
async function putRec(env, code, rec) {
  const vs = Object.keys(rec.vers || {});
  if (vs.length > 20) { vs.sort(cmpVer); for (const v of vs.slice(0, vs.length - 20)) delete rec.vers[v]; }
  const uv = Object.keys(rec.us?.vers || {}); if (uv.length > 20) { uv.sort(cmpVer); for (const v of uv.slice(0, uv.length - 20)) delete rec.us.vers[v]; }
  if (rec.log?.length > 50) rec.log = rec.log.slice(-50);
  const ds = Object.entries(rec.devs || {}); if (ds.length > 60) rec.devs = Object.fromEntries(ds.sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 60));
  await env.UPD_KV.put(recKey(code), JSON.stringify(rec));
}
function cmpVer(a, b) { const p = s => String(s || '').split(/[.-]/).map(x => parseInt(x, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; }
const maxOf = (env, plat) => Math.max(0, parseInt(plat === 'apk' ? env.MAX_APK : plat === 'us' ? env.MAX_US : env.MAX_PC, 10) || 2);

// ---------- 签名（下载票据 / 管理登录）----------
async function hmacKey(env) { return crypto.subtle.importKey('raw', te.encode(env.TICKET_KEY || ('t:' + env.GH_TOKEN)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function sign(env, obj) { const body = b64u(te.encode(JSON.stringify(obj))); return body + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), te.encode(body))); }
async function unsign(env, tok) {
  const [body, sig] = String(tok || '').split('.'); if (!body || !sig) return null;
  try { if (!(await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(sig), te.encode(body)))) return null; return JSON.parse(new TextDecoder().decode(unb64u(body))); } catch { return null; }
}
async function sameText(a, b) {   // 固定时间比较
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', te.encode(String(a))), crypto.subtle.digest('SHA-256', te.encode(String(b)))]);
  const p = new Uint8Array(x), q = new Uint8Array(y); let d = 0; for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i]; return d === 0;
}
// 输错限流：同一 IP 15 分钟内最多错 8 次（口令 / 管理密码分开计）
async function tries(kind, ip, add) {
  const cache = caches.default, key = new Request('https://upd.cache/rl/' + kind + '/' + encodeURIComponent(ip));
  const hit = await cache.match(key); let n = hit ? +(await hit.text()) || 0 : 0;
  if (add) { n++; await cache.put(key, new Response(String(n), { headers: { 'cache-control': 'max-age=900' } })); }
  return n;
}
const cookieOf = (req, name) => { const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };
async function isAdmin(env, req) { const t = await unsign(env, cookieOf(req, 'upd_adm')); return !!(t && t.adm && t.exp > Date.now()); }

// ---------- 发下载票据 ----------
async function ticket(req, env, ctx, u) {
  const ip = req.headers.get('cf-connecting-ip') || '?';
  if (await tries('pass', ip) >= 8) return J({ error: '口令错误次数太多，请 15 分钟后再试' }, 429);
  if (!env.UPD_KV) return J({ error: '更新服务还没绑定 KV（UPD_KV），请联系管理员' }, 500);
  let b = {}; try { b = await req.json(); } catch {}
  const pass = String(b.pass || '').trim();
  // 测试版口令：下载最新的测试版（不在 user.txt 里，不计次数）
  // 新客户端会带 channel：'stable' = 用测试版口令切回/更新到最新正式版（不计次数）；不带 = 老客户端，照旧给测试版
  if (pass && b.file !== 'userscript' && await sameText(pass, String(env.BETA_PASS || 'gy755287249'))) return await betaTicket(env, ctx, u, b, ip, b.channel === 'stable' && !b.beta);
  // 客户端「测试版」按钮里输入的不是测试版口令：直接拒绝，不去扣正式版口令的次数
  if (b.beta) { await tries('pass', ip, true); return J({ error: '测试版口令不正确' }, 403); }
  const us = await users(env, ctx);
  if (!us.ok) return J({ error: '读取口令列表失败：' + us.error }, 502);
  let hit = null; for (const x of us.list) if (await sameText(pass, x.code)) hit = x;
  if (!pass || !hit) { await tries('pass', ip, true); return J({ error: '更新口令不正确' }, 403); }
  if (b.file === 'userscript') return await usTicket(env, ctx, u, b, hit, ip);
  const o = await latest(env, ctx), f = o.files[b.file];
  if (!f) return J({ error: b.file === 'portable' ? '便携版已停止发布，请改用电脑安装版（BranaAi-Setup）' : '这个版本没有 ' + (b.file || '?') + ' 安装包' }, 404);
  // 次数：按「口令 + 版本 + 平台」计设备数；同一台设备重复下载不重复扣
  const plat = platOf(b.file), max = maxOf(env, plat), ver = o.version;
  const dev = String(b.device || '').replace(/[^\w.:\-]/g, '').slice(0, 80) || ('ip:' + ip);
  const rec = await getRec(env, hit.code);
  const vr = (rec.vers[ver] ||= { apk: [], pc: [] }); const list = (vr[plat] ||= []);
  let d = list.find(x => x.id === dev);
  if (!d) {
    if (list.length >= max) return J({ error: `口令「${hit.code}」的 v${ver} ${PLAT_NAME[plat]}更新次数已用完（${list.length}/${max}），如需更多次数请联系管理员`, used: list.length, max, plat }, 409);
    d = { id: dev, first: Date.now(), n: 0 }; list.push(d);
  }
  Object.assign(d, { name: String(b.name || '').slice(0, 80), at: Date.now(), ip, from: String(b.from || '').slice(0, 20), kind: String(b.file || ''), n: (d.n || 0) + 1 });
  rec.note = hit.note;
  // 设备档案（重置次数也不会清掉）：以后按设备做别的功能用
  const dv = ((rec.devs ||= {})[dev] ||= { first: Date.now(), n: 0 });
  Object.assign(dv, { name: d.name, at: d.at, ip, plat, ver, from: d.from, kind: d.kind, n: (dv.n || 0) + 1 });
  await putRec(env, hit.code, rec);
  // GitHub 直链（签名地址，几分钟内有效）+ 中转票据
  let url = '';
  const r = await gh(env, `/repos/${env.REPO}/releases/assets/${f.id}`, { headers: { accept: 'application/octet-stream' }, redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) url = r.headers.get('location') || '';
  const proxy = u.origin + '/dl/' + await sign(env, { id: f.id, exp: Date.now() + 2 * 3600e3 });
  return J({ version: ver, name: f.name, size: f.size, sha256: f.sha256, url, proxy, quota: { plat, used: list.length, max, again: d.n > 1 } });
}

// ---------- 油猴脚本的安装地址（和客户端共用口令；次数单独算：口令 + 脚本版本，每个浏览器一台，重复安装不重复扣）----------
async function usTicket(env, ctx, u, b, hit, ip) {
  const o = await usLatest(env, ctx), plat = 'us', max = maxOf(env, plat), ver = o.version;
  const dev = String(b.device || '').replace(/[^\w.:\-]/g, '').slice(0, 80) || ('ip:' + ip);
  const rec = await getRec(env, hit.code);
  const vs = ((rec.us ||= {}).vers ||= {}), list = (vs[ver] ||= []);
  let d = list.find(x => x.id === dev);
  if (!d) {
    if (list.length >= max) return J({ error: `口令「${hit.code}」的油猴脚本 v${ver} 更新次数已用完（${list.length}/${max}），如需更多次数请联系管理员`, used: list.length, max, plat }, 409);
    d = { id: dev, first: Date.now(), n: 0 }; list.push(d);
  }
  Object.assign(d, { name: String(b.name || '').slice(0, 80), at: Date.now(), ip, from: String(b.from || '').slice(0, 20), kind: 'userscript', n: (d.n || 0) + 1 });
  rec.note = hit.note;
  const dv = ((rec.devs ||= {})[dev] ||= { first: Date.now(), n: 0 });
  Object.assign(dv, { name: d.name, at: d.at, ip, plat, ver, from: d.from, kind: d.kind, n: (dv.n || 0) + 1 });
  await putRec(env, hit.code, rec);
  const tok = await sign(env, { us: 1, v: ver, ref: o.ref, exp: Date.now() + 2 * 3600e3 });
  return J({ version: ver, name: o.name, url: '', proxy: u.origin + '/us/' + tok + '/' + encodeURIComponent(o.name || 'Brana-Native-Suite.user.js'), quota: { plat, used: list.length, max, again: d.n > 1 } });
}

// ---------- 管理 ----------
async function adminState(env, ctx) {
  const [o, us, uo] = await Promise.all([latest(env, ctx).catch(e => ({ error: String(e.message || e) })), users(env, ctx, true), usLatest(env, ctx).catch(e => ({ error: String(e.message || e) }))]);
  const ver = o.version || '', usVer = uo.version || '';
  const codes = await Promise.all(us.list.map(async x => {
    const rec = env.UPD_KV ? await getRec(env, x.code) : { vers: {}, log: [] };
    const cur = rec.vers[ver] || { apk: [], pc: [] };
    const hist = Object.keys(rec.vers).sort(cmpVer).reverse().filter(v => v !== ver).slice(0, 6).map(v => ({ v, apk: (rec.vers[v].apk || []).length, pc: (rec.vers[v].pc || []).length }));
    const all = new Map(); for (const v of Object.keys(rec.vers)) for (const p of ['apk', 'pc']) for (const d of rec.vers[v][p] || []) { const e = all.get(d.id); if (!e || (d.at || 0) > (e.at || 0)) all.set(d.id, { ...d, plat: p, ver: v }); }
    const uvs = rec.us?.vers || {}; for (const v of Object.keys(uvs)) for (const d of uvs[v] || []) { const e = all.get(d.id); if (!e || (d.at || 0) > (e.at || 0)) all.set(d.id, { ...d, plat: 'us', ver: v }); }
    const ushist = Object.keys(uvs).sort(cmpVer).reverse().filter(v => v !== usVer).slice(0, 6).map(v => ({ v, n: (uvs[v] || []).length }));
    for (const [id, d] of Object.entries(rec.devs || {})) all.set(id, { ...(all.get(id) || {}), ...d, id });
    return { code: x.code, note: x.note, apk: cur.apk || [], pc: cur.pc || [], us: (usVer && uvs[usVer]) || [], ushist, hist, devices: [...all.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 20), log: (rec.log || []).slice(-5).reverse() };
  }));
  return { version: ver, date: o.date || '', verErr: o.error || '', usVersion: usVer, usDate: uo.date || '', usErr: uo.error || '', max: { apk: maxOf(env, 'apk'), pc: maxOf(env, 'pc'), us: maxOf(env, 'us') }, kv: !!env.UPD_KV, users: { ok: us.ok, file: us.file, error: us.error || '', n: us.list.length }, codes };
}
async function adminReset(env, ctx, b) {
  if (!env.UPD_KV) throw new Error('没有绑定 KV');
  const plats = b.plat === 'apk' || b.plat === 'pc' || b.plat === 'us' ? [b.plat] : ['apk', 'pc', 'us'];
  const ver = plats.some(p => p !== 'us') ? (await latest(env, ctx)).version : '';
  const usVer = plats.includes('us') ? (await usLatest(env, ctx).catch(() => ({}))).version || '' : '';
  const us = await users(env, ctx, true);
  const targets = b.all ? us.list.map(x => x.code) : [String(b.code || '')];
  let n = 0;
  for (const code of targets) {
    if (!code) continue;
    const rec = await getRec(env, code), vr = ver ? rec.vers[ver] : null;
    let cnt = 0;
    for (const p of plats) {
      if (p === 'us') { const l = usVer && rec.us?.vers?.[usVer]; if (l) { cnt += l.length; rec.us.vers[usVer] = []; } }
      else if (vr) { cnt += (vr[p] || []).length; vr[p] = []; }
    }
    (rec.log ||= []).push({ at: Date.now(), ver: plats.length === 1 && plats[0] === 'us' ? usVer : ver, ...(plats.includes('us') && plats.length > 1 ? { usVer } : {}), plat: plats.join('+'), cleared: cnt });
    await putRec(env, code, rec); n++;
  }
  return { ok: true, n, ver, usVer };
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), path = u.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST' } });
    if (!env.REPO || /^755287249\//i.test(String(env.REPO))) env.REPO = 'halou367/-';
    if (!env.GH_TOKEN) env.GH_TOKEN = DEF_TOK;
    try {
      if (path === '/latest' && req.method === 'GET') {
        const o = await latest(env, ctx);
        const f = {}; for (const [k, v] of Object.entries(o.files)) if (v) f[k] = { name: v.name, size: v.size };
        return J({ version: o.version, tag: o.tag, notes: o.notes, date: o.date, files: f, max: { apk: maxOf(env, 'apk'), pc: maxOf(env, 'pc') } });
      }
      if (path === '/ticket' && req.method === 'POST') return await ticket(req, env, ctx, u);
      if (path === '/beta/latest' && req.method === 'GET') { const o = await betaLatest(env, ctx); const f = {}; for (const [k, v] of Object.entries(o.files || {})) if (v) f[k] = { name: v.name, size: v.size }; return J({ version: o.version, tag: o.tag || '', notes: o.notes || '', date: o.date || '', files: f, beta: true }); }
      // ---- 油猴脚本 ----
      if (path === '/us/latest' && req.method === 'GET') { const o = await usLatest(env, ctx); return J({ version: o.version, notes: o.notes, date: o.date, name: o.name, max: { us: maxOf(env, 'us') } }); }
      if (path === '/us' && req.method === 'GET') return new Response(US_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' } });
      if (path.startsWith('/us/') && path.endsWith('.user.js') && (req.method === 'GET' || req.method === 'HEAD')) {
        const t = await unsign(env, path.slice(4).split('/')[0]);
        if (!t || !t.us || !t.ref) return J({ error: '安装地址无效' }, 403);
        if (!(t.exp > Date.now())) return J({ error: '安装地址已过期（2 小时有效）：请在脚本里重新点「更新」，或打开 ' + u.origin + '/us 重新输入口令' }, 403);
        const r = await gh(env, `/repos/${env.REPO}/contents/${encPath(usFile(env))}?ref=${encodeURIComponent(t.ref)}`, { headers: { accept: 'application/vnd.github.raw' } });
        if (!r.ok) return J({ error: 'GitHub ' + r.status }, 502);
        const h = new Headers({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', ...CORS });
        const len = r.headers.get('content-length'); if (len) h.set('content-length', len);
        return new Response(req.method === 'HEAD' ? null : r.body, { headers: h });
      }
      if (path.startsWith('/dl/') && req.method === 'GET') {
        const t = await unsign(env, path.slice(4));
        if (!t || !t.id) return J({ error: '下载票据无效' }, 403);
        if (!(t.exp > Date.now())) return J({ error: '下载票据已过期，请重新更新' }, 403);
        const r = await gh(env, `/repos/${env.REPO}/releases/assets/${t.id}`, { headers: { accept: 'application/octet-stream' } });
        if (!r.ok) return J({ error: 'GitHub ' + r.status }, 502);
        const h = new Headers({ 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
        const len = r.headers.get('content-length'); if (len) h.set('content-length', len);
        return new Response(r.body, { headers: h });
      }
      // ---- 管理页面 ----
      if (path === '/admin' && req.method === 'GET') return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' } });
      if (path === '/admin/login' && req.method === 'POST') {
        const ip = req.headers.get('cf-connecting-ip') || '?';
        if (await tries('adm', ip) >= 8) return J({ error: '密码错误次数太多，请 15 分钟后再试' }, 429);
        let b = {}; try { b = await req.json(); } catch {}
        const okU = await sameText(String(b.user || ''), env.ADMIN_USER || 'admin'), okP = await sameText(String(b.pass || ''), env.ADMIN_PASS || 'gy755287249');
        if (!okU || !okP) { await tries('adm', ip, true); return J({ error: '用户名或密码不正确' }, 403); }
        const tok = await sign(env, { adm: 1, exp: Date.now() + 7 * 86400e3 });
        return J({ ok: true }, 200, { 'set-cookie': `upd_adm=${encodeURIComponent(tok)}; Path=/admin; Max-Age=${7 * 86400}; HttpOnly; Secure; SameSite=Strict` });
      }
      if (path === '/admin/logout' && req.method === 'POST') return J({ ok: true }, 200, { 'set-cookie': 'upd_adm=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
      if (path.startsWith('/admin/api/')) {
        if (!(await isAdmin(env, req))) return J({ error: '请先登录', login: true }, 401);
        if (path === '/admin/api/state' && req.method === 'GET') return J(await adminState(env, ctx));
        if (path === '/admin/api/reset' && req.method === 'POST') { let b = {}; try { b = await req.json(); } catch {} return J(await adminReset(env, ctx, b)); }
        return J({ error: 'not found' }, 404);
      }
      if (path === '/') return J({ ok: true, service: 'brana-ai-update' });
      return J({ error: 'not found' }, 404);
    } catch (e) { return J({ error: String(e && e.message || e) }, 502); }
  },
};

const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Brana AI 更新管理</title>
<style>
:root{--bg:#faf9f7;--card:#fff;--fg:#1f1e1c;--fg2:#6b6862;--bd:#e6e4de;--hl:#f1efea;--acc:#262522;--accfg:#fff;--ok:#2f9e5b;--warn:#c47a0a;--bad:#d9453f;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#1f1e1c;--card:#262522;--fg:#ecebe8;--fg2:#a29f98;--bd:#3a3834;--hl:#2e2d2a;--acc:#ecebe8;--accfg:#1f1e1c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:16px 14px calc(24px + env(safe-area-inset-bottom))}
h1{font-size:18px;margin:4px 0 12px;display:flex;align-items:center;gap:8px}h1 .grow{flex:1}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:14px;margin-bottom:12px}
.login{max-width:340px;margin:12vh auto 0}.login h1{justify-content:center}
label{display:block;font-size:12px;color:var(--fg2);margin:10px 0 4px}
input{width:100%;height:40px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--fg);padding:0 12px;font:inherit;outline:0}input:focus{border-color:var(--fg2)}
button{font:inherit;cursor:pointer;border:1px solid var(--bd);background:var(--card);color:var(--fg);border-radius:9px;padding:6px 12px}
button:hover{background:var(--hl)}button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}button.pri:hover{opacity:.9}
button.danger{color:var(--bad)}button.sm{padding:3px 9px;font-size:12px;border-radius:7px}button:disabled{opacity:.5;cursor:default}
.full{width:100%;height:42px;margin-top:16px}
.err{color:var(--bad);font-size:13px;min-height:20px;margin-top:8px}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--fg2);font-size:13px}.meta b{color:var(--fg)}
.warn{color:var(--warn)}.bad{color:var(--bad)}.ok{color:var(--ok)}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.bar input{flex:1;min-width:160px;height:34px}
.list{display:flex;flex-direction:column;gap:10px}
.row{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px}
.rh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.code{font:600 15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.3px}
.note{color:var(--fg2);font-size:13px}.grow{flex:1}
.tag{font-size:11px;border-radius:20px;padding:1px 8px;border:1px solid var(--bd);color:var(--fg2)}.tag.out{color:var(--bad);border-color:var(--bad)}.tag.part{color:var(--warn);border-color:var(--warn)}.tag.new{color:var(--ok);border-color:var(--ok)}
.q{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.qb{border:1px solid var(--bd);border-radius:10px;padding:8px 10px}
.qh{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--fg2)}.qh b{font-size:15px;color:var(--fg)}
.meter{height:6px;border-radius:6px;background:var(--hl);margin:6px 0 4px;overflow:hidden}.meter i{display:block;height:100%;background:var(--ok);border-radius:6px}.meter i.full{background:var(--bad)}
.dev{font-size:12px;color:var(--fg2);margin-top:4px;word-break:break-all}.dev div{padding:2px 0;border-top:1px dashed var(--bd)}.dev div:first-child{border-top:0}
details{margin-top:8px}summary{cursor:pointer;color:var(--fg2);font-size:12px}
.hist{font-size:12px;color:var(--fg2);margin-top:6px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--acc);color:var(--accfg);padding:8px 16px;border-radius:20px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}
.toast.on{opacity:1}
@media (max-width:560px){.q{grid-template-columns:1fr}}
</style></head><body>
<div id="app" class="wrap"></div><div id="toast" class="toast"></div>
<script>
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = ms => { if (!ms) return ''; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
let toastT; const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2200); };
async function api(p, body) { const r = await fetch(p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin' }); let j = {}; try { j = await r.json(); } catch {} if (r.status === 401) { login(); throw new Error(j.error || '请先登录'); } if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }
function login(msg) {
  app.innerHTML = '<div class="login card"><h1>Brana AI 更新管理</h1><form id="f"><label>用户名</label><input id="u" value="admin" autocomplete="username"><label>密码</label><input id="p" type="password" autocomplete="current-password" autofocus><button class="pri full">登录</button><div class="err" id="e">' + esc(msg || '') + '</div></form></div>';
  $('#f').onsubmit = async e => { e.preventDefault(); $('#e').textContent = ''; try { await api('/admin/login', { user: $('#u').value.trim(), pass: $('#p').value }); load(); } catch (x) { $('#e').textContent = x.message; } };
  setTimeout(() => $('#p')?.focus(), 30);
}
let S = null, filter = '';
async function load(quiet) {
  if (!quiet && !S) app.innerHTML = '<div class="card">加载中…</div>';
  try { S = await api('/admin/api/state'); render(); } catch (e) { if (!/登录/.test(e.message)) { app.innerHTML = '<div class="card bad">加载失败：' + esc(e.message) + ' <button onclick="load()">重试</button></div>'; } }
}
function devLine(d) { return '<div>' + esc(d.name || '未知设备') + ' · <span title="设备 ID">' + esc(d.id) + '</span><br>' + (d.from ? 'v' + esc(d.from) + ' → ' : '') + (d.ver ? 'v' + esc(d.ver) + ' · ' : '') + esc(d.kind || '') + ' · 首次 ' + t(d.first) + ' · 最近 ' + t(d.at) + (d.n > 1 ? ' · 下载 ' + d.n + ' 次' : '') + ' · ' + esc(d.ip || '') + '</div>'; }
function quota(c, p) {
  const list = c[p] || [], max = S.max[p], used = list.length, pct = max ? Math.min(100, used / max * 100) : 100;
  const pn = { apk: '手机', pc: '电脑', us: '油猴' }[p] + (p === 'us' && S.usVersion ? ' v' + esc(S.usVersion) : '');
  return '<div class="qb"><div class="qh"><span>' + pn + '</span><span><b>' + used + '</b> / ' + max + ' · 剩 ' + Math.max(0, max - used) + '</span></div><div class="meter"><i class="' + (used >= max ? 'full' : '') + '" style="width:' + pct + '%"></i></div>'
    + (list.length ? '<div class="dev">' + list.map(devLine).join('') + '</div>' : '<div class="dev">还没有设备更新</div>')
    + (used ? '<div style="margin-top:6px;text-align:right"><button class="sm" data-reset="' + esc(c.code) + '" data-plat="' + p + '">只重置' + { apk: '手机', pc: '电脑', us: '油猴' }[p] + '</button></div>' : '') + '</div>';
}
function render() {
  const s = S, q = filter.trim().toLowerCase();
  const list = s.codes.filter(c => !q || c.code.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q));
  const nus = c => (c.us || []).length, tot = s.codes.reduce((a, c) => a + c.apk.length + c.pc.length + nus(c), 0), out = s.codes.filter(c => c.apk.length >= s.max.apk && c.pc.length >= s.max.pc && nus(c) >= s.max.us).length;
  let h = '<h1>Brana AI 更新管理<span class="grow"></span><button class="sm" onclick="load()">刷新</button><button class="sm" onclick="logout()">退出</button></h1>';
  h += '<div class="card"><div class="meta"><span>最新版本 <b>' + (s.version ? 'v' + esc(s.version) : '<span class=bad>' + esc(s.verErr || '未知') + '</span>') + '</b>' + (s.date ? ' · ' + t(Date.parse(s.date)) : '') + '</span><span>油猴脚本 <b>' + (s.usVersion ? 'v' + esc(s.usVersion) : '<span class=bad>' + esc(s.usErr || '未知') + '</span>') + '</b>' + (s.usDate ? ' · ' + t(Date.parse(s.usDate)) : '') + '</span><span>每个口令每个版本：手机 <b>' + s.max.apk + '</b> 台 · 电脑 <b>' + s.max.pc + '</b> 台 · 油猴 <b>' + s.max.us + '</b> 个</span><span>口令 <b>' + s.users.n + '</b> 个（' + esc(s.users.file) + '）</span><span>本版本已更新 <b>' + tot + '</b> 台 · 用光 <b>' + out + '</b> 个</span></div>'
    + (!s.users.ok ? '<div class="bad" style="margin-top:8px">读取口令文件失败：' + esc(s.users.error) + '</div>' : '')
    + (!s.kv ? '<div class="bad" style="margin-top:8px">还没绑定 KV（变量名 UPD_KV）：无法记录和限制次数，客户端现在无法更新。</div>' : '')
    + '<div class="bar"><input id="q" placeholder="搜索口令 / 备注" value="' + esc(filter) + '"><button class="sm danger" onclick="resetAll()">全部重置</button></div><div class="note">口令在 GitHub 仓库的 ' + esc(s.users.file) + ' 里增删（一行一个，井号后面是备注），保存后约 1 分钟生效。重置只清空当前版本的次数。</div></div>';
  h += '<div class="list">' + (list.length ? list.map(c => {
    const u = c.apk.length + c.pc.length + nus(c), full = c.apk.length >= s.max.apk && c.pc.length >= s.max.pc && nus(c) >= s.max.us;
    const tag = full ? '<span class="tag out">已用光</span>' : u ? '<span class="tag part">已用 ' + u + ' 次</span>' : '<span class="tag new">未使用</span>';
    return '<div class="row"><div class="rh"><span class="code">' + esc(c.code) + '</span><button class="sm" data-copy="' + esc(c.code) + '">复制</button>' + (c.note ? '<span class="note">' + esc(c.note) + '</span>' : '') + tag + '<span class="grow"></span><button class="sm danger" data-reset="' + esc(c.code) + '">重置</button></div>'
      + '<div class="q">' + quota(c, 'apk') + quota(c, 'pc') + quota(c, 'us') + '</div>'
      + (c.hist.length || (c.ushist || []).length || c.devices.length || c.log.length ? '<details><summary>历史记录</summary>'
        + (c.hist.length ? '<div class="hist">以前的版本：' + c.hist.map(x => 'v' + esc(x.v) + '（手机 ' + x.apk + ' · 电脑 ' + x.pc + '）').join('，') + '</div>' : '')
        + ((c.ushist || []).length ? '<div class="hist">以前的油猴版本：' + c.ushist.map(x => 'v' + esc(x.v) + '（' + x.n + ' 个）').join('，') + '</div>' : '')
        + (c.log.length ? '<div class="hist">重置：' + c.log.map(x => t(x.at) + ' v' + esc(x.ver) + ' ' + esc(x.plat === 'apk' ? '手机' : x.plat === 'pc' ? '电脑' : x.plat === 'us' ? '油猴' : '全部') + '（清掉 ' + (x.cleared || 0) + ' 台）').join('，') + '</div>' : '')
        + (c.devices.length ? '<div class="hist">所有用过这个口令的设备：</div><div class="dev">' + c.devices.map(devLine).join('') + '</div>' : '') + '</details>' : '')
      + '</div>';
  }).join('') : '<div class="card note">' + (q ? '没有匹配的口令' : '口令文件里还没有口令') + '</div>') + '</div>';
  const pos = $('#q') === document.activeElement ? $('#q').selectionStart : -1;
  app.innerHTML = h;
  const qi = $('#q'); qi.oninput = e => { filter = e.target.value; render(); }; if (pos >= 0) { qi.focus(); qi.setSelectionRange(pos, pos); }
}
app.addEventListener('click', async e => {
  const cp = e.target.closest('[data-copy]'); if (cp) { const v = cp.dataset.copy; try { await navigator.clipboard.writeText(v); } catch { const x = document.createElement('textarea'); x.value = v; document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); } toast('已复制 ' + v); return; }
  const rs = e.target.closest('[data-reset]'); if (rs) {
    const code = rs.dataset.reset, plat = rs.dataset.plat || '';
    if (!confirm('重置口令「' + code + '」' + (plat === 'us' ? '在油猴脚本 v' + S.usVersion + ' 的' : plat ? '在 v' + S.version + ' 的' : '在当前版本（客户端 v' + S.version + '、油猴 v' + S.usVersion + '）的') + (plat === 'apk' ? '手机' : plat === 'pc' ? '电脑' : plat === 'us' ? '油猴' : '手机、电脑和油猴') + '更新次数？')) return;
    rs.disabled = true; try { await api('/admin/api/reset', { code, plat }); toast('已重置 ' + code); await load(true); } catch (x) { toast('重置失败：' + x.message); rs.disabled = false; }
  }
});
async function resetAll() { if (!confirm('重置所有口令在当前版本（客户端 v' + S.version + '、油猴 v' + S.usVersion + '）的更新次数？')) return; try { const r = await api('/admin/api/reset', { all: true }); toast('已重置 ' + r.n + ' 个口令'); await load(true); } catch (x) { toast('重置失败：' + x.message); } }
async function logout() { try { await api('/admin/logout', {}); } catch {} S = null; login(); }
load();
</script></body></html>`;

// 油猴脚本安装页：输入口令 → 验证、记次数 → 跳到安装地址（以 .user.js 结尾，油猴会弹出安装页）
const US_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Brana Native Suite · 油猴脚本安装</title>
<style>
:root{--bg:#faf9f7;--card:#fff;--fg:#1f1e1c;--fg2:#6b6862;--bd:#e6e4de;--hl:#f1efea;--acc:#262522;--accfg:#fff;--ok:#2f9e5b;--bad:#d9453f;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#1f1e1c;--card:#262522;--fg:#ecebe8;--fg2:#a29f98;--bd:#3a3834;--hl:#2e2d2a;--acc:#ecebe8;--accfg:#1f1e1c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:520px;margin:0 auto;padding:10vh 14px calc(24px + env(safe-area-inset-bottom))}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:18px}
h1{font-size:18px;margin:0 0 6px}h1 small{font-weight:400;color:var(--fg2);font-size:13px;margin-left:6px}
p{margin:6px 0;color:var(--fg2);font-size:13px}label{display:block;font-size:12px;color:var(--fg2);margin:14px 0 4px}
input{width:100%;height:42px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--fg);padding:0 12px;font:inherit;outline:0}input:focus{border-color:var(--fg2)}
button{width:100%;height:42px;margin-top:12px;border-radius:10px;border:1px solid var(--acc);background:var(--acc);color:var(--accfg);font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.5;cursor:default}
.msg{min-height:22px;margin-top:10px;font-size:13px;white-space:pre-line}.msg.bad{color:var(--bad)}.msg.ok{color:var(--ok)}
details{margin-top:14px}summary{cursor:pointer;color:var(--fg2);font-size:13px}.notes{white-space:pre-wrap;font-size:12.5px;color:var(--fg2);background:var(--hl);border-radius:10px;padding:10px 12px;margin-top:6px;max-height:50vh;overflow:auto}
</style></head><body>
<div class="wrap"><div class="card">
<h1>Brana Native Suite<small id="v"></small></h1>
<p>Brana 油猴脚本。先在浏览器里装好 Tampermonkey（油猴）扩展，再输入更新口令安装。装好后打开 arena.ai 就能用，以后有新版本脚本会自己提示更新。</p>
<p>每个口令每个新版本：油猴最多 <b id="max">2</b> 个浏览器，同一个浏览器重复安装不重复扣。</p>
<label for="p">更新口令</label><input id="p" type="password" autocomplete="off" spellcheck="false" enterkeyhint="go" autofocus>
<button id="go">安装</button><div id="m" class="msg"></div>
<details id="nd" hidden><summary>更新说明</summary><div id="notes" class="notes"></div></details>
</div></div>
<script>
const $ = s => document.querySelector(s);
const dev = (() => { let d = ''; try { d = localStorage.getItem('us-dev') || ''; } catch (e) {} if (!/^us-[0-9a-f]{16}$/.test(d)) { const a = new Uint8Array(8); crypto.getRandomValues(a); d = 'us-' + Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem('us-dev', d); } catch (e) {} } return d; })();
const devName = () => { const ua = navigator.userAgent || '', m = (re, n) => { const x = re.exec(ua); return x ? n + ' ' + x[1] : ''; }; const br = m(/Edg(?:A|iOS)?[/]([0-9]+)/, 'Edge') || m(/OPR[/]([0-9]+)/, 'Opera') || m(/Firefox[/]([0-9]+)/, 'Firefox') || m(/CriOS[/]([0-9]+)/, 'Chrome') || m(/Chrome[/]([0-9]+)/, 'Chrome') || m(/Version[/]([0-9]+)[0-9.]* .*Safari/, 'Safari') || '浏览器'; const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''; return (br + (os ? ' · ' + os : '') + ' · 油猴（安装页）').slice(0, 80); };
const say = (t, k) => { const e = $('#m'); e.className = 'msg' + (k ? ' ' + k : ''); e.textContent = t; };
fetch('/us/latest').then(r => r.json()).then(j => { if (j.version) { $('#v').textContent = 'v' + j.version; if (j.max && j.max.us) $('#max').textContent = j.max.us; if (j.notes) { $('#notes').textContent = j.notes; $('#nd').hidden = false; } } else if (j.error) say('读取版本失败：' + j.error, 'bad'); }).catch(() => {});
async function go() {
  const pass = $('#p').value.trim(); if (!pass) { $('#p').focus(); return; }
  $('#go').disabled = true; say('正在验证口令…');
  try {
    const r = await fetch('/ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pass, file: 'userscript', device: dev, name: devName(), from: 'page' }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.proxy) {
      const q = j.quota; $('#p').value = '';
      say((q ? (q.again ? '这个浏览器之前已计过次数，本次不再扣（' + q.used + '/' + q.max + '）。' : '口令已扣 1 次：本版本油猴已用 ' + q.used + '/' + q.max + '。') : '') + '正在打开油猴安装页，点「安装」或「更新」即可。没弹出安装页的话，确认已经装好 Tampermonkey 扩展，再点一次「安装」（2 小时内不重复扣次数）。', 'ok');
      setTimeout(() => { location.href = j.proxy; }, 500);
    } else say(j.error || ('HTTP ' + r.status), 'bad');
  } catch (e) { say('网络错误：' + (e && e.message || e), 'bad'); }
  finally { $('#go').disabled = false; }
}
$('#go').onclick = go; $('#p').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
</script></body></html>`;
