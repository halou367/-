// Workspace profile, session partition, and configuration export/import manager
ICON.eye = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
ICON.eyeOff = '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
ICON.key = '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>';
ICON.upload = '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>';
ICON.shield = '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>';
ICON['shield-x'] = '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>';
ICON.list = '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>';
ICON.login = '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>';
ICON.download = '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>';

const PACK_PREFIX = 'ARENA-ACCOUNTS-V1:';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 官方 Google 登录：彩色 G 图标；「使用 Google 添加账号」新建的账号先用这个名字占位（登录后换成 Google 邮箱）
const GOOGLE_NAME = 'Google 账号';
const WEBREG_NAME = '网页注册账号';
// 横排表单行：左边名称，右边输入框（压缩竖向空间）
const frow = (label, ...ctl) => h('div', { class: 'frow' }, h('label', {}, label), h('div', { class: 'frow-c' }, ...ctl));
// 一行简短说明 + 「i」图标：点开看详细说明
function infoNote(detail) {
  const t = h('span', { class: 'lnote-t' }), open = h('button', { type: 'button', class: 'lnote-i', title: '查看详细说明', 'aria-label': '查看详细说明', 'aria-expanded': 'false' }, 'i');
  open.onclick = () => { detail.hidden = !detail.hidden; open.setAttribute('aria-expanded', String(!detail.hidden)); };
  return { text: t, row: h('div', { class: 'lnote' }, t, open) };
}
const gIcon = () => { const ic = h('span', { class: 'gsign-ic' }); ic.innerHTML = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'; return ic; };
const PROXY_RE = /^(?:(?:https?|socks[45]?h?):\/\/)?(?:[^\s:@/]+(?::[^\s@/]*)?@)?[\w.-]+:\d{1,5}\/?$/i;
const avColor = t => { let x = 0; for (const c of String(t || '')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${x % 360} 45% 45%)`; };
// 代理：留空 = 默认本地代理 127.0.0.1:7890；direct = 直连；vless://… = 节点链接（桌面版用内置 xray 内核）
const DEFAULT_PROXY = '127.0.0.1:7890';
const isDirectP = p => /^(direct|直连|none|off)$/i.test(String(p || '').trim());
const isVless = p => /^vless:\/\/[^@\s]+@[^\s]+$/i.test(String(p || '').trim());
const vlessName = p => { try { const u = new URL(String(p).trim().replace(/^vless:/i, 'http:')); return decodeURIComponent((u.hash || '').slice(1)) || u.hostname; } catch { return '节点'; } };
// 安卓：设置了全局 VLESS 节点时，账号留空 = 走该节点（不再需要开 Clash）
const gnodeName = () => Host.platform === 'android' && typeof Pool !== 'undefined' && Pool.d ? (n => n ? n.name || n.address : '')(Pool.node()) : '';
const maskProxy = p => { p = String(p || '').trim(); return !p ? (gnodeName() ? 'VLESS · ' + gnodeName() + '（默认）' : DEFAULT_PROXY + '（默认）') : isDirectP(p) ? '直连' : isVless(p) ? 'VLESS · ' + vlessName(p) : p.replace(/\/\/[^@/]*@/, '//***@'); };
const proxyErr = p => { p = String(p || '').trim(); if (!p || isDirectP(p) || PROXY_RE.test(p) || isVless(p)) return ''; return '代理格式不正确（例：127.0.0.1:7890、socks5://host:port、direct 或 vless://…）'; };
const PROXY_PH = Host.platform === 'android' ? '留空 = 默认（设置了 VLESS 节点就走节点，否则 127.0.0.1:7890）；direct = 直连；例 socks5://user:pass@host:port' : '留空 = 默认 127.0.0.1:7890；direct = 直连；也可粘贴 vless:// 节点链接';
// 指纹摘要
const fpLine = f => f ? [f.screen, f.cores + ' 核', f.mem + 'GB', String(f.gpu || '').replace(/^ANGLE \(([^,]+), (.*?)( \(0x[0-9A-F]+\))? Direct3D.*$/i, '$2'), '地区语言/时区'].filter(Boolean).join(' · ') : '未生成';
const fmtClock = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const utf8b64 = s => btoa(unescape(encodeURIComponent(s)));
const b64utf8 = s => decodeURIComponent(escape(atob(s.replace(/\s+/g, ''))));
const cleanErr = e => describe(e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// 解析导入文本：账号合集（ARENA-ACCOUNTS-V1: / JSON）或每行「邮箱 密码 [代理]」
function parseAccounts(text) {
  text = String(text || '').trim(); if (!text) return { error: '请先粘贴账号合集或「邮箱 密码」列表' };
  let j = null; const i = text.indexOf(PACK_PREFIX);
  if (i >= 0) { try { j = JSON.parse(b64utf8(text.slice(i + PACK_PREFIX.length).trim())); } catch { return { error: '账号合集内容不完整或已损坏，请重新复制' }; } }
  else if (/^[[{]/.test(text)) { try { j = JSON.parse(text); } catch { return { error: 'JSON 格式不正确' }; } }
  let list = [];
  if (j) list = (Array.isArray(j) ? j : Array.isArray(j.accounts) ? j.accounts : []).map(a => ({ email: a.email, password: a.password || a.pw || '', proxy: a.proxy || '', proxyIp: a.proxyIp || '', region: a.region || '', nodeId: a.nodeId || '', name: a.name || '', ...(typeof a.remark === 'string' ? { remark: a.remark } : {}), cookies: Array.isArray(a.cookies) ? a.cookies.filter(c => c && /^arena-auth-prod-v1(\.\d+)?$/.test(String(c.name || '')) && typeof c.value === 'string') : [] }));
  else for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/-{4,}/g, ' ').trim(); if (!line) continue;
    const m = /^([^\s@:|;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:\s*[\t :|,;]\s*(.*))?$/.exec(line); if (!m) continue;
    let rest = (m[2] || '').trim(), proxy = '';
    const parts = rest.split(/\s+|\t|\|/); if (parts.length > 1 && (PROXY_RE.test(parts.at(-1)) || isVless(parts.at(-1)) || isDirectP(parts.at(-1)))) { proxy = parts.pop(); rest = rest.slice(0, rest.lastIndexOf(proxy)).trim().replace(/[\s|,;]+$/, ''); }
    list.push({ email: m[1], password: rest, proxy, name: '', cookies: [] });
  }
  const by = new Map();
  for (const a of list) { const k = AuthFlow.canonMailbox ? AuthFlow.canonMailbox(a.email) : String(a.email || '').trim().toLowerCase(); if (!EMAIL_RE.test(String(a.email || '').trim())) continue; const o = by.get(k) || {}; const richEmail = AuthFlow.pickRichEmail ? AuthFlow.pickRichEmail(o.email || a.name, a.email) : String(a.email).trim(); by.set(k, { ...o, ...a, email: richEmail, password: a.password || o.password || '', proxy: a.proxy || o.proxy || '', proxyIp: a.proxyIp || o.proxyIp || '', region: a.region || o.region || '', nodeId: a.nodeId || o.nodeId || '', cookies: a.cookies?.length ? a.cookies : o.cookies || [] }); }
  const out = [...by.values()];
  return out.length ? { list: out } : { error: '没有识别到账号。支持：导出的账号合集，或每行「邮箱 密码 [代理]」' };
}

// 随机称呼：注册时称呼没填就用一个自然的英文名（名 + 姓的首字母），不用邮箱前缀，避免账号之间一眼能关联
function randomNick() {
  const F = ['Emma', 'Olivia', 'Ava', 'Mia', 'Lucas', 'Noah', 'Liam', 'Ethan', 'Grace', 'Chloe', 'Ella', 'Leo', 'Owen', 'Ryan', 'Nora', 'Ivy', 'Jack', 'Henry', 'Zoe', 'Lily', 'Max', 'Sam', 'Ruby', 'Adam', 'Clara', 'Daniel', 'Hannah', 'Isaac', 'Julia', 'Kevin', 'Laura', 'Mason', 'Nina', 'Oscar', 'Paul', 'Sophie', 'Tom', 'Victor', 'Wendy', 'Alex'];
  const r = n => { try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] % n; } catch { return Math.floor(Math.random() * n); } };
  return F[r(F.length)] + ' ' + 'ABCDEFGHJKLMNPRSTW'[r(18)] + '.';
}
// 固定密码：勾选后，所有注册 / 登录都用同一个密码（本机保存，和「记住密码」一样存在客户端本地，窗口间共享）
const FixedPw = {
  key: 'fixedpw',
  async load() { try { const v = await Host.shared(this.key); return v && typeof v === 'object' && v.on && typeof v.pw === 'string' && v.pw ? { on: true, pw: v.pw } : { on: false, pw: '' }; } catch { return { on: false, pw: '' }; } },
  save(on, pw) { try { return Promise.resolve(Host.shared(this.key, on && pw ? { on: true, pw: String(pw) } : null)).catch(() => {}); } catch { return Promise.resolve(); } },
  // 返回 { el, on() }：勾选框 + 说明；密码框 input 改动时自动同步保存；打开时自动填入已固定的密码
  bind(pwInp, draft) {
    const chk = h('input', { type: 'checkbox' });
    const el = h('label', { class: 'lrem fixedpw', title: '勾选后记住这个密码：之后注册、登录、重置密码都自动用它' }, chk, '固定密码（所有账号共用，本机保存）');
    const sync = () => { void this.save(chk.checked, pwInp.value); };
    chk.addEventListener('change', () => { if (chk.checked && !pwInp.value) { toast('先输入要固定的密码', 'err'); chk.checked = false; return; } sync(); });
    pwInp.addEventListener('input', () => { if (chk.checked) sync(); });
    this.load().then(v => { if (!v.on) return; chk.checked = true; if (!pwInp.value) { pwInp.value = v.pw; if (draft) { draft.password = v.pw; draft.passwordSource = 'user'; draft.passwordEmail = draft.email; } } });
    return { el, chk };
  },
};

function modal(title, body, foot, cls = '') {
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back && !back.dataset.busy) back.remove(); } });
  back.append(h('div', { class: 'modal ' + cls }, h('div', { class: 'modal-h' }, title), h('div', { class: 'modal-b' }, body), foot ? h('div', { class: 'modal-f' }, foot) : null));
  document.body.append(back); return back;
}
function pwField(value = '', ph = '密码') {
  const inp = h('input', { type: 'password', value, placeholder: ph, autocomplete: 'current-password' });
  const eye = h('button', { type: 'button', class: 'ib eye', title: '显示 / 隐藏', onclick: () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.replaceChildren(icon(show ? 'eyeOff' : 'eye')); } }, icon('eye'));
  return { inp, el: h('div', { class: 'pwf' }, inp, eye) };
}
// 账号名称/IP helpers are shared; acctCard is the compact desktop card. Phone cards remain unchanged.
const emailUser = a => { const e = String(a?.email || '').trim(); return e.includes('@') ? e.slice(0, e.indexOf('@')) : (e || a?.name || '账号'); };
// 出口 IP 那一行（国旗 + 国家 + IP；地区和实测不一致时标出来）
function acctIpLine(a) {
  const st = a.status || {};
  return st.ip ? K(st.loc ? h('span', { class: 'ac-cc' }, ccF(st.loc)) : null, h('span', { class: 'ac-ip' }, st.ip), a.region && st.loc && a.region.toUpperCase() !== String(st.loc).toUpperCase() ? h('span', { class: 'dim' }, '· 地区 ' + ccF(a.region)) : null)
    : a.region ? K(h('span', { class: 'ac-cc' }, '地区 ' + ccF(a.region)), h('span', { class: 'dim' }, '· 出口 IP 未知')) : K(h('span', { class: 'dim' }, maskProxy(a.proxy) || '直连'));
}
function acctCard(a, { isCur, tags = [], g = null, kbd = null, onclick, title, onrename } = {}) {
  const name = AccountPicker.name(a);
  const st = a?.status || {};
  const isBad = st.loggedIn === false;
  const isBg = !isCur && !!(a?.win || a?.live || st.gacha?.busy || st.statsBusy);
  const tools = h('div', { class: 'acct-card-actions acct-manage' }, g,
    h('button', { class: 'ib acct-sync', title: '同步该账号统计' }, icon('refresh')));
  const c = h('div', { class: 'arow-w acard acct-card acct-compact' + (isCur ? ' cur' : '') + (isBg ? ' is-bg' : '') + (isBad ? ' is-bad' : '') + (g ? ' has-g' : ''), title, tabindex: '0', role: 'group', 'aria-label': '账号 ' + name + '，按回车进入',
    onkeydown: ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); onclick?.(); } },
    onclick: ev => {
      if (ev.defaultPrevented || ev.target.closest('button,input,select,textarea,label,a,[role=button],.acct-manage')) return;
      const selection = getSelection(); if (selection && !selection.isCollapsed && c.contains(selection.anchorNode) && c.contains(selection.focusNode)) return;
      onclick?.();
    } },
    h('div', { class: 'acct-heading' }, h('span', { class: 'an-t', title: [name, ...tags.map(t => t.textContent)].join(' · ') }, name), AccountPicker.editButton(a, onrename), AccountPicker.siteBadges(a), h('span', { class: 'acct-card-tags', title: tags.map(t => t.textContent).join(' · ') }, ...tags),
      h('span', { class: 'acct-quota', title: '新对话剩余 / 上限' }), tools),
    h('div', { class: 'acct-run', hidden: true }, h('i', { class: 'acct-run-fill' }), h('span', { class: 'acct-run-text' })),
    h('div', { class: 'acct-footer' },
      h('small', { class: 'ac-l2 acct-footer-ip', title: [a.status?.ip, a.status?.loc, a.region ? '地区 ' + a.region : ''].filter(Boolean).join(' · ') }, ...acctIpLine(a), kbd),
      h('span', { class: 'acct-footer-right' }, h('span', { class: 'acct-stamp dim' }), h('span', { class: 'acct-money' }), h('span', { class: 'acct-pct' }))));
  c._id = a.id; c._account = a; if (isCur) c.dataset.cur = '1';
  AccountPicker.paintBalance(c, a); AccountPicker.paintRun(c, GPop.acctState(a.id, isCur));
  return c;
}

// 手机切换账号：滚轮式竖向选择（和厂商按钮的左轮一样）—— 上下滑动，中间那张放大高亮、两边的卡片沿圆柱倾斜变小变淡，
// 停下自动吸附到最近的一张；点中间那张 = 切换过去，点别的卡片先把它转到中间
function acctWheel(list) {
  list.classList.add('wheel');
  const desktop = !!list.closest('.acct-menu'); let hovered = null;
  const cards = () => [...list.children].filter(c => c.classList.contains('acard'));
  list._wheelStop?.();
  let raf = 0, center = -1, ready = false, dead=false, readyTimer=0;
  // 卡片位置只在内容 / 尺寸变化时量一次；滚动时每帧只按 scrollTop 算（不在写 transform 的同时读 offsetTop，避免每帧强制重排）
  let geo = null, cs = [], ch = 0;
  let ro=null, mo=null, detach=null; const observed=new Set();
  try { ro=new ResizeObserver(()=>{if(dead)return;const c=cs[center];pad();geo=null;if(c?.isConnected&&list.clientHeight!==ch&&!list.classList.contains('acct-flat')&&!list._wheelInit)toCenter(c,false);soon();});ro.observe(list);mo=new MutationObserver(()=>{geo=null;soon();});mo.observe(list,{childList:true}); } catch {}
  const stop=list._wheelStop=()=>{dead=true;cancelAnimationFrame(raf);clearTimeout(readyTimer);ro?.disconnect();mo?.disconnect();detach?.disconnect();list.removeEventListener('scroll',onScroll);list.removeEventListener('touchstart',onTouch);list.removeEventListener('touchmove',onTouch);list.removeEventListener('click',click,true);list.removeEventListener('pointerover',over);list.removeEventListener('pointerout',out);for(const c of cs)c.classList.remove('acct-hovered');hovered=null;};
  const measure = () => { cs=cards();ch=list.clientHeight;for(const c of observed)if(!cs.includes(c)){ro?.unobserve(c);observed.delete(c);}geo=cs.map(c=>{if(!observed.has(c)){ro?.observe(c);observed.add(c);}return [c.offsetTop,c.offsetHeight,c.offsetWidth];}); };
  const paint = () => {
    raf = 0; if(dead||!list.isConnected){stop();return;}if (!geo) measure();
    const flatMode = list.classList.contains('acct-flat');
    const mid = list.scrollTop + ch / 2; let best = -1, bd = 1e9;
    cs.forEach((c, i) => {
      const [top, hh] = geo[i], cy = top + hh / 2, off = (cy - mid) / (hh + 14), a = Math.abs(off);
      const swiping = Math.abs(c._dx || 0) > 1;
      c.style.transform = (c._dx ? 'translateX(' + c._dx.toFixed(1) + 'px) ' : '') + (swiping ? 'scale(1)' : 'perspective(800px) rotateX(' + Math.max(-55, Math.min(55, -off * 17)).toFixed(2) + 'deg) scale(' + (1 - Math.min(a * 0.07, 0.28)).toFixed(3) + ')');
      c.style.opacity = swiping ? '1' : String(Math.max(0.3, 1 - a * 0.22).toFixed(3));
      if (a < bd) { bd = a; best = i; }
    });
    if (desktop) {
      if (hovered && !cs.includes(hovered)) hovered = null;
      cs.forEach(c => c.classList.toggle('acct-hovered', c === hovered));
      if (hovered) { best = cs.indexOf(hovered); const scale = 1 + Math.min(.018, 6 / Math.max(1, geo[best][2])); hovered.style.transform = 'scale(' + scale.toFixed(4) + ')'; hovered.style.setProperty('--acct-hover-scale', scale.toFixed(4)); hovered.style.opacity = '1'; }
    }
    cs.forEach((c, i) => c.classList.toggle('wc', !flatMode && (desktop ? !!hovered : true) && i === best));
    if (best !== center) {
      if (ready && center >= 0) try { navigator.vibrate?.(6); } catch {}
      center = best;
    }
  };
  const onScroll = () => { if (!dead) list._keepScrollTop = list.scrollTop; soon(); };
  const onTouch = () => { list._touchAt = now(); };
  const soon = () => { if (!dead&&!raf) raf = requestAnimationFrame(paint); };
  const toCenter = (c, smooth) => list.scrollTo({ top: c.offsetTop + c.offsetHeight / 2 - list.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  const pad = () => { geo = null; const cs = cards(); if (!cs.length) return; const p = Math.max(8, (list.clientHeight - cs[0].offsetHeight) / 2), q = Math.max(8, (list.clientHeight - cs.at(-1).offsetHeight) / 2); list.style.paddingTop = p + 'px'; list.style.paddingBottom = q + 'px'; };
  list.addEventListener('scroll', onScroll, { passive: true });
  list.addEventListener('touchstart', onTouch, { passive: true });
  list.addEventListener('touchmove', onTouch, { passive: true });
  // 点不在中间的卡片：先转到中间（不切换）；卡片右边的抽卡按钮照常可点
  const click = e => {
    if (desktop || list.classList.contains('acct-flat')) return;
    if (list.closest('.lpick')) return;
    const c = e.target.closest?.('.acard'); if (!c || e.target.closest('.gacct,.acct-edit') || e.target.closest('.acct-select,.acct-manage')) return;
    if (!c.classList.contains('wc')) { e.stopPropagation(); e.preventDefault(); toCenter(c, true); }
  };list.addEventListener('click',click,true);
  const over = e => { if (!desktop || e.pointerType === 'touch') return; const c = e.target.closest?.('.acard'); if (!c || c.parentNode !== list || c === hovered) return; hovered = c; soon(); };
  const out = e => { if (!hovered || hovered.contains(e.relatedTarget)) return; hovered = null; soon(); };
  if (desktop) { list.addEventListener('pointerover', over); list.addEventListener('pointerout', out); }
  detach=new MutationObserver(()=>{if(!list.isConnected)stop();});detach.observe(document.body,{childList:true,subtree:true});
  raf=requestAnimationFrame(() => { if(dead||!list.isConnected){stop();return;}pad(); if (!list._wheelInit) { list._wheelInit = true; const c = list.querySelector('.acard[data-cur="1"]') || cards()[0]; if (c) toCenter(c, false); list._keepScrollTop = list.scrollTop; } else if (Number.isFinite(list._keepScrollTop)) { list.scrollTop = Math.min(list._keepScrollTop, Math.max(0, list.scrollHeight - list.clientHeight)); } paint(); readyTimer=setTimeout(() => { ready = true; }, 120); });
  return stop;
}
// 选账号页：卡片左滑露出右侧「删除」按钮，点按钮确认后删除（只对转到中间的那张卡片生效，不影响上下滚动选卡）
function swipeDel(list, onDel) {
  const W = 96;
  const del = h('button', { type: 'button', class: 'lp-del', hidden: true }, icon('trash'), h('span', {}, '删除'));
  list.append(del);
  let open = null, s = null, lastSw = 0, hideT = 0;
  const setX = (c, x, anim) => { c._dx = x; if (anim) { c.classList.add('sw-anim'); clearTimeout(c._swT); c._swT = setTimeout(() => c.classList.remove('sw-anim'), 260); } list.dispatchEvent(new Event('scroll')); };
  const place = c => { clearTimeout(hideT); del.style.top = c.offsetTop + 'px'; del.style.height = c.offsetHeight + 'px'; del.hidden = false; del._c = c; };
  const close = () => { const c = open; open = null; if (c) setX(c, 0, true); clearTimeout(hideT); hideT = setTimeout(() => { if (!open && !s) del.hidden = true; }, 260); };
  const openC = c => { open = c; setX(c, -W, true); try { navigator.vibrate?.(8); } catch {} };
  list.addEventListener('touchstart', e => {
    s = null; if (e.touches.length !== 1) return;
    const c = e.target.closest?.('.acard');
    if (e.target.closest?.('.lp-del')) return;
    if (open && c !== open) close();
    if (!c) return;   // 任意账号卡片均可左滑删除（滑完那一下点击会被吞掉，不会误进账号或误开抽卡）
    const t = e.touches[0]; s = { c, x: t.clientX, y: t.clientY, base: c._dx || 0, mode: '' };
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!s) return; const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.mode) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.mode = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'; if (s.mode === 'x') place(s.c); else if (open) close(); }
    if (s.mode !== 'x') return;
    if (e.cancelable) e.preventDefault();
    let x = s.base + dx; if (x > 0) x /= 4; else if (x < -W) x = -W + (x + W) / 4;
    setX(s.c, x, false);
  }, { passive: false });
  const end = () => { if (!s) return; const { c, mode } = s; s = null; if (mode !== 'x') return; lastSw = now(); (c._dx || 0) < -W / 2 ? openC(c) : (open = c, close()); };
  list.addEventListener('touchend', end, { passive: true }); list.addEventListener('touchcancel', end, { passive: true });
  // 滑开时点卡片 = 收回（不进入账号）；刚滑完的那一下点击也不算
  list.addEventListener('click', e => {
    if (e.target.closest?.('.lp-del')) return;
    if (open || now() - lastSw < 350) { e.stopPropagation(); e.preventDefault(); if (open) close(); }
  }, true);
  del.onclick = async e => {
    e.stopPropagation(); const c = del._c; if (!c) return;
    const r = await onDel(c).catch(err => { toast(cleanErr(err), 'err'); return false; });
    if (r) { open = null; del.hidden = true; del._c = null; c.remove(); list.dispatchEvent(new Event('scroll')); } else close();
  };
  return { close };
}
function quotaBits(st) {
  const q = st?.quota || {}, out = [];
  if (Number.isFinite(q.pulse)) out.push(h('span', { class: 'qbar', title: '账号额度（Pulse）剩余 ' + q.pulse + '%' + (q.pulseAt ? ' · ' + fmtTime(new Date(q.pulseAt).toISOString()) : '') }, h('span', { class: 'qt' }, h('i', { style: { width: Math.max(2, Math.min(100, q.pulse)) + '%', background: q.pulse < 15 ? 'var(--bad)' : q.pulse < 40 ? 'var(--warn)' : 'var(--ok)' } })), h('b', {}, q.pulse + '%')));
  // Retired dollar balance is deliberately not displayed.
  if (Number.isFinite(q.chatRemaining)) out.push(h('span', { class: 'dim', title: '新对话额度（本小时）' }, '新对话 ' + q.chatRemaining + (Number.isFinite(q.chatLimit) ? '/' + q.chatLimit : '')));
  // 只有真的卡住才显示限流：这个账号正在抽卡且没在等限流（换了 IP 在继续抽）就不显示，免得误报
  const g = st?.gacha, going = g?.busy && !/限流|冷却|额度/.test(g.phase || '');
  if (q.blockedUntil && q.blockedUntil > now() && !going && !(Number.isFinite(q.chatRemaining) && q.chatRemaining > 0)) out.push(h('span', { class: 'tagb bad' }, '限流至 ' + fmtClock(q.blockedUntil)));
  return out;
}

Object.assign(UI, {
  authDraft(a, opt = {}) { this.authDrafts ||= AuthFlow.createDrafts(); return this.authDrafts.get(a, opt); },
  bindAuthDraft(d, { email, pw, remember, name }) {
    email?.addEventListener('input', () => {
      const stored = d.passwordSource === 'stored'; this.authDrafts.setEmail(d, email.value);
      if (stored && !d.password && pw) pw.inp.value = '';
    });
    pw?.inp.addEventListener('input', () => { d.password = pw.inp.value; d.passwordSource = 'user'; d.passwordEmail = d.email; });
    remember?.addEventListener('change', () => { d.remember = remember.checked; });
    name?.addEventListener('input', () => { d.name = name.value; });
  },
  authControls(form, busy) {
    if (busy) {
      if (form._authDisabled) return;
      form._authDisabled = new Map([...form.querySelectorAll('input,textarea,select,button')].map(el => [el, el.disabled]));
      form._authDisabled.forEach((_, el) => { el.disabled = true; }); form.setAttribute('aria-busy', 'true');
    } else {
      form._authDisabled?.forEach((disabled, el) => { el.disabled = disabled; }); delete form._authDisabled; form.removeAttribute('aria-busy');
    }
  },
  // ----- 独立登录表单（当前账号）-----
  // 界面已经画出来了（主界面 / 登录页）：通知安卓外壳可以切到这个账号了（切换账号时先在后台载入，就绪再切，不白屏）
  shown() { if (this._shown) return; this._shown = true; try { Host.ready?.()?.catch?.(() => {}); } catch {} },
  loginGate(reason) {
    this.authed = true; setTimeout(() => this.shown(), 0);
    if (this.me === null) { const tl = $('#tablist'); if (tl) tl.replaceChildren(); }
    const a = this.host?.account || {}, v = $('#view'), draft = this.authDraft(a);
    if (typeof QrSync !== 'undefined' && QrSync.isFirstTimeNoCache?.() && !this._onboardStep2) {
      QrSync.renderFirstTimeOnboarding(v, a, reason, (syncRes) => {
        this._onboardStep2 = true;
        if (syncRes?.firstEmail && !a.email) { a.email = syncRes.firstEmail; draft.email = syncRes.firstEmail; }
        if (syncRes?.firstPassword && !draft.password) draft.password = syncRes.firstPassword;
        this.loginGate(reason);
        if ((Host.platform === 'android' || (typeof isMob === 'function' && isMob())) && syncRes?.firstEmail && syncRes?.firstPassword) {
          setTimeout(() => { try { document.querySelector('#view form button[type="submit"]')?.click(); } catch {} }, 120);
        }
      });
      return;
    }
    const epoch = this.authEpoch = (this.authEpoch || 0) + 1, current = () => this.authEpoch === epoch && this.host?.account?.id === a.id;
    const email = h('input', { type: 'email', value: draft.email, placeholder: 'name@example.com', autocomplete: 'username', 'aria-label': '邮箱' });
    const pw = pwField(draft.password, '输入密码');
    const pf = proxyField(a, { autoRegion: true, live: true }), proxy = pf.inp;
    const ipRes = h('span', { class: 'dim ipres' }, IP.ip ? '当前 ' + IP.ip + (IP.loc ? ' · ' + ccF(IP.loc) : '') : '');
    const remember = h('input', { type: 'checkbox', checked: draft.remember || null });
    this.bindAuthDraft(draft, { email, pw, remember });
    const msg = h('div', { class: 'lmsg' + (reason ? ' bad' : '') }, reason || '');
    const go = h('button', { class: 'btn big', type: 'submit' }, '登录');
    // 保存过密码就直接填上（连接失败跳到这里时不用重新输入）
    if (a.id && a.hasPw) Promise.resolve(Host.getCred?.()).then(x => {
      if (!current() || !email.isConnected || !x?.password || pw.inp.value || draft.password || !AuthFlow.sameEmail(x.email, draft.email)) return;
      draft.password = pw.inp.value = x.password; draft.passwordSource = 'stored'; draft.passwordEmail = x.email;
    }).catch(() => {});
    // 刷新：重新测出口 IP + 核对登录状态；其实已登录（刚才只是没连上）就直接进入
    const ref = h('button', { type: 'button', class: 'btn big ghost lref', title: '刷新登录状态和 IP', onclick: async () => {
      if (ref.disabled) return;
      const expected = email.value.trim();
      if (!EMAIL_RE.test(expected)) { msg.textContent = '请先填写预期登录的邮箱，再刷新核对'; msg.className = 'lmsg bad'; return; }
      this.authControls(form, true); ref.replaceChildren(h('i', { class: 'spin' }), '刷新中');
      msg.textContent = '正在刷新登录状态和 IP…'; msg.className = 'lmsg';
      ipRes.textContent = '测试中…';
      const ipP = Promise.resolve(IP.poll?.()).catch(() => {}).then(() => { ipRes.textContent = IP.ip ? '当前 ' + IP.ip + (IP.loc ? ' · ' + ccF(IP.loc) : '') : (IP.err ? '出口 IP 测试失败：' + IP.err : ''); });
      let me = null, err = null;
      try { me = await api('/api/me', { noRelogin: true }); } catch (e) { err = AuthFlow.sessionError(e); }
      await ipP;
      if (!current()) return;
      if (Auth.real(me?.user)) try { AuthFlow.loginIdentity(me.user); } catch (e) { err = e; me = null; }
      if (Auth.real(me?.user)) {
        try {
          const richEmail = AuthFlow.pickRichEmail(email.value || draft.email || a.email || a.name, me.user.email);
          me.user.email = richEmail;
          await AuthEnv.finish(me.user);
          const saved = await Host.saveAccount({ id: a.id, email: richEmail,
            ...(!AuthFlow.sameMailbox(a.email, me.user.email) ? { clearPassword: true } : {}) });
          if (!saved?.id || saved.error) throw new Error(saved?.error || '保存未确认');
          if (!current()) return;
          this.authDrafts.clear(a);
          try { localStorage.removeItem('anc-auth'); localStorage.removeItem('anc-auth-email'); } catch {}
          msg.textContent = '已登录（' + richEmail + '），正在进入…'; msg.className = 'lmsg ok';
          setTimeout(() => { if (current()) location.reload(); }, 300); return;
        } catch (e) { err = new Error('身份已核对，但本地账号信息保存失败：' + cleanErr(e)); }
      }
      if (!current()) return;
      this.authControls(form, false); ref.replaceChildren(icon('refresh'), '刷新');
      if (err) { msg.textContent = cleanErr(err); msg.className = 'lmsg bad'; return; }
      msg.textContent = '网络正常，账号未登录' + (pw.inp.value ? '：密码已填好，点「登录」即可' : '：请输入密码登录'); msg.className = 'lmsg';
    } }, icon('refresh'), '刷新');
    const form = h('form', { class: 'lform auth-form', 'data-auth-mode': 'login', onsubmit: async e => {
      e.preventDefault(); if (go.disabled) return;
      const em = email.value.trim(), p = pw.inp.value, px = pf.proxy, pxi = pf.proxyIp, keepPassword = remember.checked;
      if (!(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch)) && typeof QrSync !== 'undefined' && typeof QrSync.hasNodeConfigured === 'function' && !QrSync.hasNodeConfigured(a) && !pf.nodeId && !/^vless:\/\//i.test(String(px || '').trim())) {
        msg.textContent = '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'; msg.className = 'lmsg bad';
        this.loginGate('请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号');
        return;
      }
      if (!EMAIL_RE.test(em)) { msg.textContent = '邮箱格式不正确'; msg.className = 'lmsg bad'; email.focus(); return; }
      if (!p) { msg.textContent = '请输入密码'; msg.className = 'lmsg bad'; pw.inp.focus(); return; }
      if (pf.err()) { msg.textContent = pf.err(); msg.className = 'lmsg bad'; return; }
      this.authControls(form, true); go.replaceChildren(h('i', { class: 'spin' }), '登录中…'); msg.className = 'lmsg';
      try {
        if (pf.dirty || px !== (a.proxy || '') || pxi !== (a.proxyIp || '') || (pf.nodeId || '') !== (a.nodeId || '') || pf.region !== (a.region || '')) {
          msg.textContent = '正在切换代理…';
          await this.switchProxy(a, pf, msg);
        }
        if (!current()) return;
        msg.textContent = '正在登录 ' + em + ' …';
        const user = await Auth.signIn(em, p);
        if (!current()) return;
        const c = this.host?.account || {};
        const saved = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : em, email: em, ...(keepPassword ? { password: p } : { clearPassword: true }), proxy: c.proxy ?? px, proxyIp: c.proxyIp ?? pxi, nodeId: c.nodeId ?? pf.nodeId, region: c.region ?? pf.region });
        if (!saved?.id || saved.error) throw new Error(saved?.error || '登录已核对，但本地账号信息保存未确认');
        if (!current()) return;
        this.authDrafts.clear(a);
        try { localStorage.removeItem('anc-auth'); localStorage.removeItem('anc-auth-email'); } catch {}
        msg.textContent = '登录成功（' + user.email + '），正在进入…'; msg.className = 'lmsg ok';
        setTimeout(() => {
          if (!current()) return;
          if (typeof this.activateAuthedSession === 'function' && !(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch))) {
            void this.activateAuthedSession(user);
          } else {
            location.reload();
          }
        }, 180);
      } catch (err) {
        if (!current()) return; this.authControls(form, false);
        msg.textContent = cleanErr(err); msg.className = 'lmsg bad'; go.replaceChildren('登录');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    } },
      this.authSeg('login'),
      frow('邮箱', email),
      frow('密码', pw.el),
      h('div', { class: 'lforgot' }, h('button', { type: 'button', class: 'link', onclick: () => this.authGate('forgot', { email: email.value.trim() }) }, '忘记密码？')),
      pf.testedRoute ? pf.block() : frow('连接', pf.block()),
      h('label', { class: 'lrem', title: '会话过期时自动重新登录，导出合集时带上' }, remember, '记住密码（过期自动重登）'),
      msg, h('div', { class: 'lgo' }, go, ref, h('button', { type: 'button', class: 'btn big ghost lbrowse', title: '免登录进入查阅模式，直接浏览和导出本账号缓存在本地的所有历史对话', onclick: () => this.enterBrowseMode('已进入查阅模式（免登录浏览本地缓存记录）') }, icon('folder'), '查阅模式')),
      ...this.googleBtn(a, pf, msg),
      h('div', { class: 'lfoot' }, h('button', { type: 'button', class: 'link danger', title: '删除当前账号（需要二次确认）', onclick: () => this.deleteCurrent() }, icon('trash'), '删除账号')));
    v.replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate full' }, form)));
    setTimeout(() => (email.value ? pw.inp : email).focus(), 50);
  },

  // ----- 官方 Google 登录 / 注册按钮（登录页、注册页共用）：表单里改了连接先应用，再在本账号窗口里跳到 Google -----
  googleBtn(a, pf, msg, label = '使用 Google 登录') {
    const ic = gIcon();
    const lab = h('span', {}, label);
    const b = h('button', { type: 'button', class: 'btn big gsign', title: '和 arena.ai 登录页的「Continue with Google」同一个入口；在这个账号的窗口里完成，走这个账号的 IP', onclick: async () => {
      if (b.disabled) return;
      if (!(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch)) && typeof QrSync !== 'undefined' && typeof QrSync.hasNodeConfigured === 'function' && !QrSync.hasNodeConfigured(a) && !pf.nodeId && !/^vless:\/\//i.test(String(pf.proxy || '').trim())) {
        msg.textContent = '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'; msg.className = 'lmsg bad';
        this.loginGate('请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号');
        return;
      }
      b.disabled = true; lab.textContent = '正在打开 Google…'; msg.className = 'lmsg';
      try {
        if (pf.err()) throw new Error(pf.err());
        await this.applyFormProxy(a, pf, msg);
        msg.textContent = '正在准备 Google 登录（走当前账号的 IP）…';
        await Auth.google();
        msg.textContent = '正在跳转到 Google…';
      } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; b.disabled = false; lab.textContent = label; }
    } }, ic, lab);
    return K(h('div', { class: 'lor' }, h('span', {}, '或')), b);
  },
  // ----- 注册 / 找回密码 / 设置新密码（全部在客户端里完成，走本账号的 IP）-----
  enterBrowseMode(reason = '') {
    window.__BRANA_BROWSE_MODE = true;
    this.authed = true;
    const a = this.host?.account || {};
    const cm = Store.get('me:u', null);
    this.me = (cm && cm.id) ? { ...cm, browseOnly: true } : { id: a.id || 'browse', email: a.email || a.name || '本地查阅模式', name: (a.name || a.email || '查阅模式').split('@')[0], browseOnly: true };
    try { document.querySelectorAll('.connbar, .route-recovery-note, .modal-back.auth-back').forEach(el => el.remove()); } catch {}
    try { History.warm(a.id || 'web'); void History.restoreFromLocalCache?.(); } catch {}
    try {
      Tabs.list = (Tabs.list || []).filter(t => t && t.key);
      if (!Tabs.list.length && History.items?.length) Tabs.open(History.items[0].id);
      else if (!Tabs.list.length) Tabs.newChat();
      else { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; this.renderTabs(); this.showTab(); }
      this.renderList();
      this.renderAcct();
      this.shown();
      if (reason) toast(reason);
    } catch (e) { console.warn(e); }
  },
  async recoverFromBrowseMode() {
    if (!window.__BRANA_BROWSE_MODE && !/[?&](?:browse|offline)=1\b/.test(location.search)) return;
    window.__BRANA_BROWSE_MODE = false;
    try { if (location.pathname === '/robots.txt' && location.search) history.replaceState(null, '', '/robots.txt'); } catch {}
    try { if (typeof RegionIP !== 'undefined' && RegionIP.view?.offlineAlert) RegionIP.close(); } catch {}
    try {
      const me = await api('/api/me', { noRelogin: false, timeout: 12000 }).catch(() => null);
      if (me?.user?.id) {
        this.me = me.user;
        this.authed = true;
        Store.set('me:u', me.user);
        try { if (typeof Acct !== 'undefined') Acct.report?.(); } catch {}
      }
      this.renderAcct?.();
      void History.refresh?.();
      void Pulse.poll?.();
      try { KeepAlive.start?.(); } catch {}
    } catch {}
  },
  authSeg(mode) {
    // 「网页」：直接用当前账号的环境（线路 / 出口 / 指纹）打开 Brana 官网，在网页里登录或注册；「查阅模式」：免登录浏览本机缓存对话
    const items = [['login', '登录'], ['signup', '注册']]; if (Host.platform !== 'web' && typeof Host.login === 'function') items.push(['web', '网页']); items.push(['browse', '查阅模式']);
    return h('div', { class: 'lseg', role: 'tablist' }, ...items.map(([m, t]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m || (mode === 'link' && m === this.authKind)), class: mode === m || (mode === 'link' && m === this.authKind) ? 'on' : '', onclick: () => m === 'login' ? this.loginGate() : m === 'web' ? this.browserMode() : m === 'browse' ? this.enterBrowseMode('已进入查阅模式（免登录浏览本地缓存记录）') : this.authGate(m) }, t)));
  },
  // 浏览器模式：当前窗口直接换成 Brana 官网原生页面（同一账号的线路 / 出口 IP / 指纹 / WebRTC 保护），顶部有浏览条，点「客户端」回来
  /* 当前停在哪个对话，就直接打开官网的这个对话（https://arena.ai/agent/<id>）；新对话 / 没有对话时才打开首页 */
  browserTarget() {
    let sid = ''; try { sid = String(Tabs.cur?.sid || ''); } catch {}
    if (/^[\w-]{8,64}$/.test(sid)) {
      const ch = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      const hRow = typeof History !== 'undefined' ? History.byId?.(sid) : null;
      const isEval = Boolean(
        ch?.isEvaluation ||
        ch?.evalMode === 'battle' ||
        ch?.evalMode === 'direct' ||
        hRow?.type === 'evaluation' ||
        hRow?.mode === 'battle' ||
        hRow?.mode === 'direct' ||
        hRow?.mode === 'direct-battle' ||
        hRow?.mode === 'side-by-side'
      );
      return 'https://arena.ai/' + (isEval ? 'c/' : 'agent/') + sid;
    }
    const curMode = typeof ModeState !== 'undefined' && ModeState.getMode ? ModeState.getMode() : 'agent';
    return curMode === 'battle' || curMode === 'direct' ? 'https://arena.ai/text' : '';
  },
  async browserMode() {
    const mask = this.showModeSwitchMask('正在切换至浏览器模式…', '正在保存会话缓存并等待网页完整渲染');
    const safetyT = setTimeout(() => this.hideModeSwitchMask(), 12000);
    try {
      try {
        const curSid = String(Tabs.cur?.sid || '');
        const tgt = this.browserTarget() || 'https://arena.ai/';
        const isEval = /\/c\/|\/text\b/.test(tgt);
        const curMode = (typeof Chats !== 'undefined' && curSid && Chats.get(curSid)?.evalMode) || (typeof ModeState !== 'undefined' && ModeState.getMode ? ModeState.getMode() : null);
        sessionStorage.setItem('anc:fast-return', JSON.stringify({ at: Date.now(), sid: curSid, evalUrl: isEval, evalMode: isEval ? (curMode === 'direct' ? 'direct' : 'battle') : null }));
        sessionStorage.setItem('anc:mode-switching', JSON.stringify({ at: Date.now(), sid: curSid, target: tgt }));
        if (typeof Chats !== 'undefined') {
          for (const c of Chats.values()) {
            try { c.ctl?.abort?.(); c.esCtl?.abort?.(); } catch {}
          }
          if (typeof MsgCache !== 'undefined' && MsgCache.putNow) {
            await Promise.all([...Chats.values()].filter(c => c?.loaded).slice(0, 6).map(c => MsgCache.putNow(c).catch(() => {})));
          }
        }
      } catch {}
      try { if (window.__ANC_CLIENT_SHELL && location.pathname !== '/robots.txt') history.replaceState(null, '', '/robots.txt'); } catch {}
      const r = await (Host.browserMode||Host.login)(this.browserTarget() || undefined);
      if (r?.cancelled) { clearTimeout(safetyT); this.hideModeSwitchMask(); return; }
      if (r === false || r?.error) throw new Error(r?.error || '宿主没有打开网页');
    }
    catch (e) { clearTimeout(safetyT); this.hideModeSwitchMask(); toast('打开网页失败：' + cleanErr(e), 'err'); }
  },
  showModeSwitchMask(title = '正在切换至浏览器模式…', sub = '正在同步会话并等待浏览器页面完整加载') {
    document.getElementById('anc-mode-mask')?.remove();
    const mask = h('div', { id: 'anc-mode-mask', class: 'mode-switch-mask', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'msm-card' },
        h('div', { class: 'msm-spin' }),
        h('div', { class: 'msm-title' }, title),
        h('div', { class: 'msm-sub' }, sub),
        h('div', { class: 'msm-bar' }, h('div', { class: 'msm-bar-in' }))));
    document.body.append(mask);
    return mask;
  },
  hideModeSwitchMask() {
    document.getElementById('anc-mode-mask')?.remove();
    try { sessionStorage.removeItem('anc:mode-switching'); } catch {}
  },
  async browserModeAsk() {
    if (Host.platform === 'web' || typeof Host.login !== 'function') { toast('网页版本来就是浏览器，不需要切换'); return; }
    // 点标志来回切换：没有进行中的发送 / 抽卡时直接切，不再每次确认；有进行中的才提醒一下（会中断）
    const busy = (typeof Gacha !== 'undefined' && Gacha.busy()) || [...Chats.values()].some(c => c.busy);
    if (busy && !await Dialog.confirm({ title: '切换为浏览器模式', text: '用当前账号的网络环境（线路、出口 IP、指纹、WebRTC 保护）直接打开 Brana 官网原生页面，不经过客户端界面；当前在哪个对话，就直接打开官网上的这个对话。\n方便判断问题出在客户端还是官方网站。\n正在进行的发送 / 抽卡会中断；顶部浏览条里点「客户端」随时切回。', ok: '切换' })) return;
    await this.browserMode();
  },
  // 删除当前账号（登录页底部）：二次确认；先切到另一个账号再删除，至少保留一个账号
  async deleteCurrent() {
    const a = this.host?.account || {};
    if (!a.id) return;
    let accts = []; try { accts = (await Host.listAccounts(true)) || []; } catch {}
    if (accts.length <= 1) { toast('至少保留一个账号，请先添加其他账号', 'err'); return; }
    const nm = a.email || emailUser(a) || a.name || '账号';
    if (!await Dialog.confirm({ title: '删除账号', text: '删除账号「' + nm + '」？\n这个账号在本机的登录状态、缓存和保存的密码会一并清除，不能恢复（Brana 上的账号本身不受影响）。\n删除后自动切换到其他账号。', ok: '删除', danger: true })) return;
    const o = accts.find(x => x.id !== a.id);
    try {
      if (Host.platform !== 'android') await Host.openAccount(o.id);
      removeCheck(await Host.removeAccount(a.id));
      toast('已删除「' + nm + '」，切换到 ' + emailUser(o));
    } catch (e) { toast('删除失败：' + describe(e), 'err'); }
  },
  authPost(path, body) { return Auth.post(path, body); },
  // 自动完成验证要用的密码：令牌注册时选的密码 > 固定密码
  async regPassword(a, email) {
    try { const t = await MailToken.load(a?.id); const tpw = t?.password || t?.pw || ''; if (tpw && (!t?.email || !email || AuthFlow.sameEmail(t.email, email))) return tpw; } catch {}
    // 注册时在客户端 / 官网输入的密码（加密暂存 24 小时，只有本账号窗口读得到）
    try { const r = await Host.shared('regpw@' + a?.id); if (r?.pw && (!r.email || !email || AuthFlow.sameEmail(r.email, email))) return r.pw; } catch {}
    const f = await FixedPw.load(); return f.on ? f.pw : '';
  },
  // 注册时发现邮箱已注册：有固定 / 令牌密码就自动改走登录；密码不对再让用户选——改成固定密码（走找回密码）或自己登录
  async existingAccount(a, em, form, msg, current) {
    const fail = (box, err) => { const m = box?.querySelector?.('.lmsg') || msg; if (m) { m.className = 'lmsg bad'; m.textContent = typeof cleanErr === 'function' ? cleanErr(err) : String(err?.message || err || ''); } };
    const pv = await this.regPassword(a, em);
    if (!current()) return;
    if (pv) {
      msg.className = 'lmsg'; msg.textContent = '这个邮箱已经注册过，正在用固定密码自动登录…';
      this.authControls(form, true);
      try {
        await Auth.signIn(em, pv);
        if (!current()) return;
        const c = this.host?.account || a;
        const saved = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : em, email: em, password: pv, proxy: c.proxy || '', proxyIp: c.proxyIp || '', nodeId: c.nodeId || '', region: c.region || '' });
        if (!saved?.id || saved.error) throw new Error(saved?.error || '登录成功，但本地账号信息保存未确认');
        this.authDrafts.clear(a);
        msg.textContent = '已用固定密码登录，正在进入…'; msg.className = 'lmsg ok';
        setTimeout(() => { if (current()) location.reload(); }, 500);
        return;
      } catch (e) {
        if (!current()) return; this.authControls(form, false);
        if (e?.code !== 'AUTH_CREDENTIALS') { fail(form, e); return; }
      }
    }
    const reset = h('button', { type: 'button', class: 'btn', onclick: async () => {
      if (reset.disabled) return; reset.disabled = login.disabled = true; this.authControls(form, true);
      msg.className = 'lmsg'; msg.textContent = '正在发送重置密码邮件…';
      try {
        const sentAt = Date.now();
        await this.authPost('/nextjs-api/reset-password/request', { email: em, shouldLinkHistory: false });
        if (!current()) return;
        try { localStorage.setItem('anc-auth-email', em); } catch {}
        this.authGate('link', { kind: 'forgot', email: em, sentAt });
      } catch (e) { if (!current()) return; reset.disabled = login.disabled = false; this.authControls(form, false); fail(form, e); }
    } }, pv ? '把密码改成固定密码' : '找回 / 设置密码');
    const login = h('button', { type: 'button', class: 'btn ghost', onclick: () => { const d = this.authDraft(a); this.authDrafts.setEmail(d, em); this.loginGate(); } }, '我自己输入密码登录');
    msg.className = 'lmsg bad';
    msg.replaceChildren(h('div', {}, pv ? '这个邮箱已经注册过，但固定密码登录不上（可能当初用邮件链接 / Google 注册，没设过密码，或密码不同）。' : '这个邮箱已经注册过。'),
      h('div', { class: 'lchoice', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } }, reset, login),
      h('div', { class: 'dim', style: { marginTop: '6px' } }, pv ? '改成固定密码：发一封重置邮件，令牌账号会自动收信并把密码改成固定密码，然后登录。' : '找回密码：发一封重置邮件，把邮件里的链接粘贴回来设置密码。'));
  },
  // 在本账号会话里跟随邮件验证链接（同一会话 / 指纹 / 出口）。返回 true = 已接手（跳到下一步或完成），false = 交回网页打开
  async autoLink(a, u, opt, pwAuto, form, msg) {
    const live = () => this.host?.account?.id === a.id && form.isConnected;
    msg.className = 'lmsg'; msg.textContent = '正在本账号环境中验证链接…';
    const r = await Host.authLink(u.href).catch(e => ({ error: cleanErr(e) }));
    if (!live()) return true;
    let f = null; try { f = r?.final ? new URL(r.final) : null; } catch {}
    if (f && f.origin === 'https://arena.ai') u._finalHref = f.href;
    const code = f?.searchParams.get('code');
    if (f && f.searchParams.get('auth') === 'reset-password' && code) { this.authGate('reset', { code, email: opt.email, auto: !!pwAuto }); return true; }
    const setPwTok = (f && /\/auth\/set-password/i.test(f.pathname) && f.searchParams.get('token')) || (/\/auth\/set-password/i.test(u.pathname) && u.searchParams.get('token')) || '';
    if (setPwTok && pwAuto) {
      msg.textContent = '已验证邮箱链接，正在自动设置固定密码…';
      try {
        const spRes = await rawFetch('/nextjs-api/auth/set-password', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ password: pwAuto, token: setPwTok }),
        });
        if (spRes.ok) {
          let me0 = null; try { me0 = (await api('/api/me', { noRelogin: true }))?.user; } catch {}
          if (!me0?.email) { try { me0 = await Auth.signIn(opt.email, pwAuto); } catch {} }
          if (me0?.email) {
            AuthFlow.identity(me0, opt.email);
            if (AuthEnv.state?.locked) await AuthEnv.finish(me0, AuthEnv.state);
            const c0 = this.host?.account || a;
            const saved0 = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : opt.email, email: opt.email, password: pwAuto, proxy: c0.proxy || '', proxyIp: c0.proxyIp || '', nodeId: c0.nodeId || '', region: c0.region || '' });
            if (saved0?.id && !saved0.error) {
              this.authDrafts.clear(a);
              try { localStorage.removeItem('anc-auth'); } catch {}
              msg.textContent = '邮箱已验证并直接设密完成，正在进入…'; msg.className = 'lmsg ok';
              setTimeout(() => { if (live()) location.reload(); }, 500);
              return true;
            }
          }
        }
      } catch {}
    }
    if (!r || r.error || r.external || r.status >= 400) return false;
    let me = null; try { me = (await api('/api/me', { noRelogin: true }))?.user; } catch {}
    if (!live()) return true;
    try { AuthFlow.identity(me, opt.email); } catch { return false; }
    if (pwAuto && opt.kind !== 'forgot') {
      // 优先尝试在已认证会话内直接通过协议设置密码（免二次发信），若接口要求重置码则自动回退邮件重置流程
      try {
        const directRes = await rawFetch('/nextjs-api/account/password', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ password: pwAuto, newPassword: pwAuto }),
        });
        if (directRes.ok) {
          if (AuthEnv.state?.locked) await AuthEnv.finish(me, AuthEnv.state);
          const c0 = this.host?.account || a;
          const saved0 = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : opt.email, email: opt.email, password: pwAuto, proxy: c0.proxy || '', proxyIp: c0.proxyIp || '', nodeId: c0.nodeId || '', region: c0.region || '' });
          if (saved0?.id && !saved0.error) {
            this.authDrafts.clear(a);
            try { localStorage.removeItem('anc-auth'); } catch {}
            msg.textContent = '邮箱已验证并直接设密完成，正在进入…'; msg.className = 'lmsg ok';
            setTimeout(() => { if (live()) location.reload(); }, 500);
            return true;
          }
        }
      } catch {}
      // 链接已登录但还没有密码：同一环境里再走一次「设置密码」，令牌账号会自动收信并填入密码
      msg.textContent = '邮箱已验证并登录，正在发送设置密码邮件…';
      const sentAt = Date.now();
      await this.authPost('/nextjs-api/reset-password/request', { email: opt.email, shouldLinkHistory: false });
      if (!live()) return true;
      try { localStorage.setItem('anc-auth-email', opt.email); } catch {}
      toast('已登录；正在设置固定密码，之后会话过期也能自动重新登录');
      this.authGate('link', { kind: 'forgot', email: opt.email, sentAt });
      return true;
    }
    if (AuthEnv.state?.locked) await AuthEnv.finish(me, AuthEnv.state);
    const c = this.host?.account || a;
    const saved = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : opt.email, email: opt.email, proxy: c.proxy || '', proxyIp: c.proxyIp || '', nodeId: c.nodeId || '', region: c.region || '' });
    if (!saved?.id || saved.error) throw new Error(saved?.error || '登录已核对，但本地账号信息保存未确认');
    this.authDrafts.clear(a);
    try { localStorage.removeItem('anc-auth'); } catch {}
    msg.textContent = '验证完成，已登录，正在进入…'; msg.className = 'lmsg ok';
    setTimeout(() => { if (live()) location.reload(); }, 500);
    return true;
  },
  // 表单里改了 IP / 代理：先测试再保存到账号（注册 / 登录请求都要走这个账号自己的出口）
  async applyFormProxy(a, pf, msg) {
    if (!pf.dirty && pf.proxy === (a.proxy || '') && pf.proxyIp === (a.proxyIp || '') && (pf.nodeId || '') === (a.nodeId || '') && pf.region === (a.region || '')) return a;
    msg.textContent = '正在切换 IP / 代理…'; msg.className = 'lmsg';
    await this.switchProxy(a, pf, msg);
    return this.host?.account || a;
  },
  // 切换当前账号的出口：按地区 → 从池里自动挑一个能用的 ProxyIP（不通自动换下一个，节点坏了自动换节点）；其它方式 → 测试后保存
  async switchProxy(a, pf, msg) {
    if (pf.testedRoute) { await pf.commit(); if (pf.err()) throw Error(pf.err()); this.host = await Host.info(); return; }
    if (pf.mode === 'region' && pf.region && a.id) {
      const r = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: s => { msg.textContent = s; } });
      if (!r.ok) throw new Error(regionLabel(pf.region) + '：' + r.error);
      msg.textContent = '已分配 ' + regionLabel(pf.region) + ' 的 ProxyIP ' + r.to + (r.ms ? '（' + r.ms + 'ms）' : '');
    } else {
      const t = await Host.testIp({ ...a, proxy: pf.proxy, proxyIp: pf.proxyIp, nodeId: pf.nodeId, region: pf.region, ...(pf.routeMode ? RouteState.prefs(pf.routeMode) : {}) }).catch(() => null);
      if (t && t.error) throw new Error('代理不可用：' + t.error);
      await Host.saveAccount({ ...a, proxy: pf.proxy, proxyIp: pf.proxyIp, nodeId: pf.nodeId, region: pf.region, ...(pf.routeMode ? RouteState.prefs(pf.routeMode) : {}) });
    }
    this.host = await Host.info(); if (Host.platform === 'android') await sleep(1500);
  },
  authGate(mode, opt = {}) {
    setTimeout(() => this.shown(), 0);
    const a = this.host?.account || {}, v = $('#view'), draft = this.authDraft(a, opt);
    if (v && (mode === 'signup' || mode === 'forgot') && typeof QrSync !== 'undefined' && QrSync.isFirstTimeNoCache && QrSync.isFirstTimeNoCache(a)) {
      QrSync.renderFirstTimeOnboarding(v, a, opt.err || '请先配置 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号', (res) => {
        this.authGate(mode, { ...opt, email: res?.email || opt.email });
      });
      return;
    }
    const epoch = this.authEpoch = (this.authEpoch || 0) + 1, current = () => this.authEpoch === epoch && this.host?.account?.id === a.id;
    if (mode === 'signup' || mode === 'forgot') this.authKind = mode;
    const msg = h('div', { class: 'lmsg' + (opt.err ? ' bad' : '') }, opt.err || '');
    const fail = (form, err) => { msg.textContent = cleanErr(err); msg.className = 'lmsg bad'; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); };
    const busy = (btn, on, label) => { btn.disabled = on; btn.replaceChildren(...(on ? [h('i', { class: 'spin' }), label + '…'] : [label])); };
    const back = h('div', { class: 'lfoot' }, h('button', { type: 'button', class: 'link', onclick: () => this.loginGate() }, '返回登录'), h('button', { type: 'button', class: 'link danger', title: '删除当前账号（需要二次确认）', onclick: () => this.deleteCurrent() }, icon('trash'), '删除账号'));
    let form;
    if (mode === 'signup' || mode === 'forgot') {
      const signup = mode === 'signup';
      const email = h('input', { type: 'email', value: draft.email, placeholder: 'name@example.com', autocomplete: 'username', 'aria-label': '邮箱' });
      if (signup && !String(draft.name || '').trim()) draft.name = randomNick();   // 称呼：没填就随机生成一个自然的英文名
      const name = h('input', { type: 'text', value: draft.name, placeholder: '可不填', autocomplete: 'name', 'aria-label': '称呼' });
      this.bindAuthDraft(draft, { email, name });
      const pf = proxyField(a, { live: true });
      const go = h('button', { class: 'btn big', type: 'submit' }, signup ? '发送注册邮件' : '发送重置邮件');
      form = h('form', { class: 'lform auth-form', 'data-auth-mode': mode, onsubmit: async e => {
        e.preventDefault(); if (go.disabled) return;
        const em = email.value.trim();
        if (!(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch)) && typeof QrSync !== 'undefined' && typeof QrSync.hasNodeConfigured === 'function' && !QrSync.hasNodeConfigured(a) && !pf.nodeId && !/^vless:\/\//i.test(String(pf.proxy || '').trim())) {
          fail(form, '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号');
          this.authGate(mode, { ...opt, err: '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号' });
          return;
        }
        if (!EMAIL_RE.test(em)) { fail(form, '邮箱格式不正确'); email.focus(); return; }
        if (pf.err()) { fail(form, pf.err()); return; }
        const fullName = name.value.trim() || em.split('@')[0];
        this.authControls(form, true); busy(go, true, '发送中');
        try {
          await this.applyFormProxy(a, pf, msg);
          if (!current()) return;
          msg.textContent = '正在发送…';
          const sentAt = Date.now();
          if (signup) {
            const cc = /^[A-Z]{2}$/.test(IP.loc || '') ? IP.loc : undefined;
            if (typeof Auth.sendMagicLink === 'function') await Auth.sendMagicLink(em, fullName, cc);
            else await this.authPost('/nextjs-api/sign-up/magic-link', { email: em, fullName, shouldLinkHistory: false, marketingConsent: false, ...(cc ? { registeredCountryCode: cc } : {}) });
          } else await this.authPost('/nextjs-api/reset-password/request', { email: em, shouldLinkHistory: false });
          if (!current()) return;
          try { localStorage.setItem('anc-auth-email', em); } catch {}
          this.authGate('link', { kind: mode, email: em, sentAt });
        } catch (err) {
          if (!current()) return; this.authControls(form, false); busy(go, false, signup ? '发送注册邮件' : '发送重置邮件');
          if (signup && err?.code === 'AUTH_ACCOUNT_EXISTS') { await this.existingAccount(a, em, form, msg, current); return; }
          fail(form, err);
        }
      } },
        this.authSeg(mode),
        h('div', { class: 'lsub' }, signup ? '填邮箱 → 收邮件 → 把邮件里的链接粘贴回来打开，再设置密码。' : h('b', {}, '找回密码'), signup ? null : '：发送重置邮件 → 把邮件里的链接粘贴回来打开 → 设置新密码。'),
        frow('邮箱', email),
        signup ? frow('称呼', name) : null,
        pf.testedRoute ? pf.block() : frow('连接', pf.block()),
        msg, go, ...(signup ? this.googleBtn(a, pf, msg, '使用 Google 注册 / 登录') : []), back);
      v.replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate full' }, form)));
      setTimeout(() => email.focus(), 50);
      // 令牌注册：新窗口里自动发送注册邮件（同一账号的指纹 / IP / 语言环境）
      if (opt.auto) setTimeout(() => { if (current() && form.isConnected && !go.disabled && EMAIL_RE.test(email.value.trim())) { msg.textContent = '令牌注册：正在自动发送注册邮件…'; form.requestSubmit(); } }, 400);
      return;
    }
    if (mode === 'link') {
      const signup = opt.kind === 'signup';
      const url = h('textarea', { class: 'llink', rows: 3, placeholder: '粘贴邮件里的链接（https://…）', spellcheck: 'false' });
      const go = h('button', { class: 'btn big', type: 'submit' }, '在客户端中打开链接');
      const resend = h('button', { type: 'button', class: 'link', onclick: () => this.authGate(opt.kind, { email: opt.email }) }, '没收到？重新发送');
      // 注册：页面要求设置密码时，用事先选好的（固定）密码——这里显示出来，一键复制
      const pwHint = h('div', { class: 'lpwhint', hidden: true });
      if (signup) (async () => {
        let pwv = draft.password || '';
        if (!pwv) pwv = await this.regPassword(a, opt.email);
        if (!pwv) pwv = (await FixedPw.load()).pw;
        if (!pwv) { try { const c = await Host.getCred?.(); if (c?.password && AuthFlow.sameEmail(c.email, opt.email)) pwv = c.password; } catch {} }
        if (!pwv || !current()) return;
        let shown = false; const val = h('code', {}, '••••••••'), eye = h('button', { type: 'button', class: 'link', onclick: () => { shown = !shown; val.textContent = shown ? pwv : '••••••••'; eye.textContent = shown ? '隐藏' : '显示'; } }, '显示');
        const copy = h('button', { type: 'button', class: 'link', onclick: async () => { try { await navigator.clipboard.writeText(pwv); toast('密码已复制，到页面里粘贴即可'); } catch { shown = true; val.textContent = pwv; toast('无法写入剪贴板，请手动复制', 'err'); } } }, '复制');
        pwHint.replaceChildren('页面要求设置密码时，用你选好的密码：', val, eye, copy); pwHint.hidden = false;
      })();

      form = h('form', { class: 'lform auth-form', 'data-auth-mode': mode, onsubmit: async e => {
        e.preventDefault(); if (go.disabled) return;
        const raw = (url.value.match(/https:\/\/\S+/) || [''])[0].replace(/[)\]>"'，。]+$/, '');
        let u; try { u = AuthFlow.authURL(raw); } catch (err) { fail(form, err); url.focus(); return; }
        const code = u.searchParams.get('code');
        const pwAuto = await this.regPassword(a, opt.email);
        if (!current()) return;
        if (u.searchParams.get('auth') === 'reset-password' && code) { this.authGate('reset', { code, email: opt.email, auto: !!pwAuto }); return; }
        try { localStorage.setItem('anc-auth', JSON.stringify({ accountId: a.id, kind: opt.kind, email: opt.email, at: Date.now() })); } catch {}
        if (pwAuto) {
          try { localStorage.setItem('anc-regpw', pwAuto); } catch {}
          void Promise.resolve(Host.shared('regpw@' + a.id, { email: opt.email, pw: pwAuto, src: 'client' })).catch(() => {});
        }
        this.authControls(form, true); busy(go, true, '正在验证');
        try {
          await AuthEnv.begin('verify', opt.email); try { Pin.hold(true); } catch {}
          // 桌面端：在本账号会话里直接跟随验证链接（同一指纹 / IP / Cookie），拿到结果后自动设置密码；失败再退回网页打开
          if (Host.authLink && await this.autoLink(a, u, opt, pwAuto, form, msg)) return;
          if (!current()) return;
          await Host.login(u._finalHref || u.href);
        }
        catch (err) { if (!current()) return; this.authControls(form, false); busy(go, false, '在客户端中打开链接'); fail(form, err); }   // 打开的是 Brana 网页（最新版）：先去掉旧版固定 cookie，免得网页和接口版本不一致；回到客户端后自动写回
      } },
        this.authSeg('link'),
        h('div', { class: 'lic ok' }, icon('check')),
        h('div', { class: 'hero-t' }, '邮件已发送'),
        h('div', { class: 'lsub' }, '已发到 ', h('b', {}, opt.email || ''), '。', signup ? '打开邮件，长按（或右键）邮件里的按钮「复制链接」，粘贴到下面。链接必须在客户端里打开，登录状态才会落到这个账号上；打开后如果页面要求设置密码就在页面上完成，然后点「返回客户端」。' : '打开邮件，复制邮件里的重置链接，粘贴到下面，客户端会接着让你设置新密码。'),
        pwHint, url, msg, go,
        h('div', { class: 'lfoot' }, resend, h('button', { type: 'button', class: 'link', onclick: () => this.loginGate() }, '返回登录')));
      v.replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate' }, form)));
      setTimeout(() => url.focus(), 50);
      // 令牌账号：客户端自己收信（Outlook），拿到验证链接后自动打开
      MailToken.load(a.id).then(async tok => {
        if (!tok || !AuthFlow.sameEmail(tok.email, opt.email) || !current()) return;
        msg.className = 'lmsg'; msg.textContent = '令牌取件：正在收取验证邮件…';
        try {
          const r = await MailToken.waitLink(tok, { since: opt.sentAt || Date.now() - 120e3, kind: opt.kind === 'forgot' ? 'reset' : '', log: t => { if (current()) msg.textContent = t; }, cancelled: () => !current() || !!url.value.trim(), onToken: t => MailToken.save(a.id, t) });
          if (!current() || url.value.trim()) return;
          url.value = r.link; msg.textContent = '已收到「' + (r.subject || '验证邮件') + '」，正在自动验证…'; msg.className = 'lmsg ok';
          form.requestSubmit();
        } catch (err) { if (current() && !url.value.trim()) fail(form, '令牌取件：' + cleanErr(err) + '；也可以手动粘贴邮件里的链接'); }
      });
      return;
    }
    if (mode === 'reset') {
      let em = opt.email || ''; try { em ||= localStorage.getItem('anc-auth-email') || ''; } catch {}
      em ||= draft.email;
      this.authDrafts.setEmail(draft, em);
      const email = h('input', { type: 'email', value: draft.email, placeholder: 'name@example.com', autocomplete: 'username', 'aria-label': '邮箱' });
      this.bindAuthDraft(draft, { email });
      const p1 = pwField('', '新密码'), p2 = pwField('', '再输一次');
      const rules = h('div', { class: 'lrules' });
      const chk = () => { const p = p1.inp.value; const r = [[p.length >= 8, '8 位以上'], [/[A-Z]/.test(p), '大写'], [/[a-z]/.test(p), '小写'], [/[^A-Za-z0-9]/.test(p), '符号']]; rules.replaceChildren(...r.map(([ok, t]) => h('span', { class: ok ? 'ok' : '' }, (ok ? '✓ ' : '· ') + t))); return r.every(x => x[0]); };
      p1.inp.addEventListener('input', chk); chk();
      // 固定密码 / 令牌注册密码：重置 / 设置密码时自动填好；从验证链接自动跳来的直接提交
      this.regPassword(a, draft.email || em).then(pv => {
        if (!pv || p1.inp.value || p2.inp.value || !current()) return;
        p1.inp.value = p2.inp.value = pv;
        if (chk() && opt.auto && opt.code) setTimeout(() => { if (current() && form?.isConnected && !go.disabled) { msg.textContent = '已自动填入密码，正在设置…'; form.requestSubmit(); } }, 300);
      });
      const go = h('button', { class: 'btn big', type: 'submit' }, '设置新密码并登录');
      form = h('form', { class: 'lform auth-form', 'data-auth-mode': mode, onsubmit: async e => {
        e.preventDefault(); if (go.disabled) return;
        const p = p1.inp.value, mail = email.value.trim();
        if (!EMAIL_RE.test(mail)) { fail(form, '邮箱格式不正确'); email.focus(); return; }
        if (!opt.code) { fail(form, '缺少验证代码，请重新打开邮件原始链接'); return; }
        if (!chk()) { fail(form, '密码至少 8 位，并包含大写、小写字母和符号'); p1.inp.focus(); return; }
        if (p !== p2.inp.value) { fail(form, '两次输入的密码不一致'); p2.inp.focus(); return; }
        this.authControls(form, true); busy(go, true, '提交中');
        let confirmed = false;
        try {
          const authEnvironment = await AuthEnv.begin('reset', mail);
          await this.authPost('/nextjs-api/reset-password/confirm', { password: p, code: opt.code, shouldLinkHistory: false });
          confirmed = true;
          if (!current()) return;
          let result;
          try { result = await api('/api/me', { noRelogin: true }); }
          catch (err) { if (err.status === 401) result = { user: null }; else throw AuthFlow.sessionError(err); }
          if (!current()) return;
          let user = result?.user;
          if (user?.email) AuthFlow.identity(user, mail); // Never substitute another session's email.
          else { msg.textContent = '密码设置请求已接受，正在核对登录…'; user = await Auth.signIn(mail, p); }
          AuthFlow.identity(user, mail);
          if (AuthEnv.state?.locked) await AuthEnv.finish(user, authEnvironment);
          if (!current()) return;
          const c = this.host?.account || a;
          const saved = await Host.saveAccount({ id: a.id, name: a.name && !/^账号 ?\d*$/.test(a.name) ? a.name : mail, email: mail, password: p, proxy: c.proxy || '', proxyIp: c.proxyIp || '', nodeId: c.nodeId || '', region: c.region || '' });
          if (!saved?.id || saved.error) throw new Error(saved?.error || '登录已核对，但本地账号信息保存未确认');
          void Promise.resolve(Host.shared('regpw@' + a.id, null)).catch(() => {});
          if (!current()) return;
          this.authDrafts.clear(a);
          try { localStorage.removeItem('anc-auth'); localStorage.removeItem('anc-auth-email'); } catch {}
          msg.textContent = '密码已设置，账号身份已确认，正在进入…'; msg.className = 'lmsg ok';
          setTimeout(() => { if (current()) location.reload(); }, 500);
        } catch (err) {
          if (!current()) return; this.authControls(form, false); busy(go, false, '设置新密码并登录');
          if (confirmed) { go.disabled = true; go.replaceChildren('密码请求已提交，请返回登录核对'); }
          fail(form, (confirmed ? '密码设置请求已接受，但未确认登录；不要重复提交设置。' : '') + cleanErr(err));
        }
      } },
        h('div', { class: 'lic' }, icon('key')),
        h('div', { class: 'hero-t' }, '设置新密码'),
        h('div', { class: 'lsub' }, '已读取邮件链接，提交时由服务器验证是否有效。身份核对成功后才会在本机保存密码，用于会话过期时重新登录。'),
        h('label', {}, '邮箱'), email,
        h('label', {}, '新密码'), p1.el, rules,
        h('label', {}, '确认密码'), p2.el,
        msg, go, back);
      v.replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate' }, form)));
      setTimeout(() => p1.inp.focus(), 50);
    }
  },

  // ----- 账号切换面板 -----
  async acctMenu(e, page=0) {
    if (e?.target?.closest?.('.acct-quota-ring, .acct-refresh, .acct-qr-link, .acct-qrsync')) return;
    e?.stopPropagation?.();
    // 再点一次底部当前账号 = 收起面板
    if (e && !isMob() && document.querySelector('.amenu:not(.anc-gh)')) { document.querySelectorAll('.menu:not(.anc-gh)').forEach(m => m.remove()); return; }
    document.querySelectorAll('.menu:not(.anc-gh)').forEach(m => m.remove());
    if (isMob()) {
      // 先盖上账号页，再在它后面把侧栏直接收起（不播收起动画）：两件事不再同时抢一帧
      const p = LaunchPick.show({ back: true });
      setTimeout(() => { const sb = $('#sb'); if (sb) sb.style.transition = 'none'; document.body.classList.remove('drawer'); requestAnimationFrame(() => requestAnimationFrame(() => { if (sb) sb.style.transition = ''; })); }, document.querySelector('.lpick') ? 220 : 0);
      return p;
    }   // 手机：和打开 App 时的选账号页是同一个页面
    return AccountPicker.open(e, page);
  },
  // Legacy entry shares the same bounded, cancellable picker; no second polling implementation.
  acctSheet() { return LaunchPick.show({back:true}); },
  async switchNth(n) { const accts = await Host.listAccounts(true).catch(() => []) || []; const a = accts[n - 1]; if (a && a.id !== this.host?.account?.id) Host.openAccount(a.id); },

  // ----- 添加账号 -----
  addAccount(preset = {}) {
    const email = h('input', { type: 'email', value: preset.email || '', placeholder: 'name@example.com' });
    const pw = pwField(preset.password || '', '密码');
    // 新账号：自动分配一个没人绑定的随机地区；还没节点时节点下拉第一项就是「导入节点」
    const pf = proxyField({ ...preset, id: undefined }, { autoRegion: true, draft: true }), proxy = pf.inp;
    const saveConnection = fields => pf.save ? pf.save(fields) : Host.saveAccount({ ...fields, proxy: pf.proxy, proxyIp: pf.proxyIp, nodeId: pf.nodeId, region: pf.region, ...(pf.routeMode ? RouteState.prefs(pf.routeMode) : {}) });
    const ipRes = h('span', { class: 'dim ipres' }), msg = h('div', { class: 'lmsg' });
    const go = h('button', { class: 'btn' }, '登录并打开');
    const test = h('button', { type: 'button', class: 'ib', title: '测试出口 IP', onclick: async () => { ipRes.textContent = '测试中…'; const r = await Host.testIp({ proxy: pf.proxy, proxyIp: pf.proxyIp }).catch(e => ({ error: e.message })); ipRes.textContent = r?.ip ? '实测 ' + r.ip + (r.loc ? ' · ' + ccF(r.loc) : '') : r === null ? '' : '不可用：' + (r?.error || '失败'); devExit = r?.ip ? r.loc || '' : ''; devPaint(); } }, icon('pulse'));
    // 设备信息小字：新账号将使用的出口 / 时区 / 语言 / WebRTC / 指纹；时区或语言与实测出口国家对不上时标红
    let devExit = ''; const devLine = typeof DeviceInfo !== 'undefined' ? DeviceInfo.line({ region: pf.region || '', exit: '' }) : null;
    const devPaint = () => { try { devLine?.paint({ region: pf.region || '', exit: pf.exit || devExit }); } catch {} };
    // 用 Google 添加：按上面选的地区 / 节点先建好账号，切过去后在这个账号自己的窗口里自动打开官方 Google 登录（邮箱、密码不用填）
    const gLab = h('span', {}, '使用 Google 添加账号');
    const gGo = h('button', { type: 'button', class: 'btn big gsign', title: '不用填邮箱和密码：新建账号后切过去，在它自己的窗口里用官方 Google 登录（走这个账号的 IP）', onclick: async () => {
      if (gGo.disabled) return;
      if (typeof needEdgeTunnelGuard === 'function' && needEdgeTunnelGuard()) { msg.textContent = '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'; msg.className = 'lmsg bad'; return; }
      if (pf.err()) { msg.textContent = pf.err(); msg.className = 'lmsg bad'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      gGo.disabled = true; go.disabled = true; back.dataset.busy = '1'; msg.className = 'lmsg'; msg.textContent = '正在新建账号…';
      // CAPTCHA starts only in the new account's own session, after its tested route is ready.
      try {
        const a = await saveConnection({ name: GOOGLE_NAME, email: '' });
        if (!a) throw new Error('保存失败');
        if (pf.mode === 'region' && pf.region) {
          if (pf.proxyIp && Pool.fresh(pf.proxyIp, pf.region, a.id)) await Pool.mutate(d => { if (d.ips[pf.proxyIp]) d.ips[pf.proxyIp].used = now(); }).catch(() => {});
          else { const q = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: t => { msg.textContent = t; } }); if (!q.ok) throw new Error(regionLabel(pf.region) + '：' + q.error); }
        }
        msg.textContent = '已新建，正在打开 Google 登录…'; msg.className = 'lmsg ok';
        back.remove(); Host.openAccount(a.id);
      } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); gGo.disabled = false; go.disabled = false; delete back.dataset.busy; }
    } }, gIcon(), gLab);
    // 注册新账号：按上面选的节点 / ProxyIP 先建好账号，切到它自己的窗口（独立指纹环境 + 该账号出口）里打开注册页，邮箱已填好
    const reg = h('button', { type: 'button', hidden: true, title: '用这里选的节点、ProxyIP 和该账号自己的指纹环境注册新的 Brana 账号（填邮箱即可，密码在注册邮件链接里设置）', onclick: async () => {
      if (reg.disabled) return;
      if (typeof needEdgeTunnelGuard === 'function' && needEdgeTunnelGuard()) { msg.textContent = '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'; msg.className = 'lmsg bad'; return; }
      let tok = null;
      if (mode === 'token') {
        const rawLines = String(tokInp.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (rawLines.length > 1) { back.remove(); this.batchTokenRegister(tokInp.value, pw.inp.value); return; }
        try { tok = MailToken.parse(tokInp.value); } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; tokInp.focus(); return; }
        email.value = tok.email;
        if (!pw.inp.value && tok.password) pw.inp.value = tok.password;
        if (!pw.inp.value) {
          try { const fxLoaded = await FixedPw.load(); if (fxLoaded?.pw) pw.inp.value = fxLoaded.pw; } catch {}
        }
        const p = pw.inp.value;
        if (!(p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[^A-Za-z0-9]/.test(p))) { msg.textContent = '令牌注册要自动设置密码：密码至少 8 位，并包含大写、小写字母和符号'; msg.className = 'lmsg bad'; pw.inp.focus(); return; }
        tok.pw = p;
        tok.password = p;
        void FixedPw.save(true, p);
      }
      const em = email.value.trim();
      if (!EMAIL_RE.test(em)) { msg.textContent = '注册：请先填写要注册的邮箱'; msg.className = 'lmsg bad'; email.focus(); return; }
      if (!tok && pf.err()) { msg.textContent = pf.err(); msg.className = 'lmsg bad'; return; }
      reg.disabled = go.disabled = gGo.disabled = true; back.dataset.busy = '1'; msg.className = 'lmsg'; msg.textContent = '正在新建账号…';
      try {
        if (tok) {
          // 先确认令牌能用（微软会轮换刷新令牌，用新的那个保存）
          msg.textContent = '正在验证邮箱令牌…';
          await MailToken.access(tok);
        }
        let a = null;
        if (tok) {
          const allAccts = (await Host.listAccounts(true).catch(() => [])) || [];
          const existingAcct = allAccts.find(x => x && String(x.email || '').toLowerCase() === em.toLowerCase());
          let ipAlloc = null;
          const isExplicitDirectOrProxy = pf.routeMode ? (pf.routeMode === 'direct' || pf.routeMode === 'proxy') : (pf.mode === 'direct' || pf.mode === 'local');
          if (!isExplicitDirectOrProxy && typeof Pool !== 'undefined' && typeof Pool.acquireForRegistration === 'function') {
            msg.textContent = '正在分配 30 分钟内未使用的独立 ProxyIP…';
            ipAlloc = await Pool.acquireForRegistration(existingAcct, { log: t => { msg.textContent = t; } }).catch(e => ({ ok: false, error: cleanErr(e) }));
          }
          const usedFpSigs = new Set(allAccts.map(x => x?.fp ? [x.fp.screen, x.fp.cores, x.fp.mem, x.fp.gpu, x.fp.canvasSalt].join('|') : '').filter(Boolean));
          const fp = existingAcct?.fp || (typeof BatchTokenReg !== 'undefined' && BatchTokenReg.uniqueFp ? await BatchTokenReg.uniqueFp(usedFpSigs) : undefined);
          let fallbackProxy = ipAlloc?.proxy || pf.proxy || (existingAcct?.proxy && String(existingAcct.proxy).trim() ? existingAcct.proxy : '') || '';
          let fallbackNodeId = ipAlloc?.nodeId || pf.nodeId || existingAcct?.nodeId || '';
          let fallbackProxyIp = ipAlloc?.proxyIp || pf.proxyIp || existingAcct?.proxyIp || '';
          let fallbackRegion = ipAlloc?.region || pf.region || existingAcct?.region || 'US';
          if (!fallbackProxy && !isExplicitDirectOrProxy) {
            try {
              const savedViaPf = await saveConnection({
                ...(existingAcct?.id ? { id: existingAcct.id } : {}),
                name: existingAcct?.name && !/^账号 ?\d*$/.test(existingAcct.name) ? existingAcct.name : em,
                email: em,
                ...(fp ? { fp } : {}),
              });
              if (savedViaPf?.id && savedViaPf.proxy) a = savedViaPf;
            } catch {}
          }
          if (!a && !fallbackProxy && !isExplicitDirectOrProxy) {
            try {
              if (typeof Nodes !== 'undefined' && Nodes.load) await Nodes.load();
              if (typeof Pool !== 'undefined' && Pool.load) await Pool.load();
              const poolLink = (typeof Pool !== 'undefined' && typeof Pool.link === 'function' ? Pool.link() : '') || '';
              const firstNode = (typeof Pool !== 'undefined' && typeof Pool.node === 'function' && Pool.node()) || (typeof Nodes !== 'undefined' && Array.isArray(Nodes.list) ? Nodes.list[0] : null);
              const existingVlessAcct = allAccts.find(x => /^vless:\/\//i.test(x?.proxy || ''));
              const nodeLink = poolLink || (firstNode && typeof Vless !== 'undefined' && Vless.toLink ? Vless.toLink(firstNode) : '') || (existingVlessAcct?.proxy || '');
              if (nodeLink) {
                fallbackProxy = nodeLink;
                fallbackNodeId = fallbackNodeId || firstNode?.id || existingVlessAcct?.nodeId || '';
              }
              if (!fallbackProxyIp && typeof Pool !== 'undefined' && Pool.entries) {
                const usedPips = new Set(allAccts.filter(x => x?.id !== existingAcct?.id).map(x => String(x?.proxyIp || '').toLowerCase()).filter(Boolean));
                const candEntry = Pool.entries().find(([k, e]) => e?.ok === true && !e.gone && !e.banned && !usedPips.has(String(k).toLowerCase()));
                if (candEntry) {
                  fallbackProxyIp = candEntry[0];
                  fallbackRegion = candEntry[1]?.loc || fallbackRegion;
                }
              }
            } catch {}
          }
          if (!a) {
            if (!ipAlloc?.ok && !fallbackProxy && !isExplicitDirectOrProxy) throw new Error(ipAlloc?.error || '暂无可用未冷却 ProxyIP');
            a = await Host.saveAccount({
              id: existingAcct?.id,
              name: existingAcct?.name && !/^账号 ?\d*$/.test(existingAcct.name) ? existingAcct.name : em,
              email: em,
              proxy: fallbackProxy || (pf.routeMode === 'direct' || pf.mode === 'direct' ? 'direct' : ''),
              proxyIp: fallbackProxyIp,
              nodeId: fallbackNodeId,
              region: fallbackRegion,
              ...(fp ? { fp } : {}),
            });
          }
        } else {
          a = await saveConnection({ name: em, email: em });   // 未验证的密码不直接存进账号：先加密暂存（regpw），验证后「设置密码」成功才存
        }
        if (pw.inp.value || tok?.pw) await Promise.resolve(Host.shared('regpw@' + a?.id, { email: em, pw: pw.inp.value || tok.pw, src: 'client' })).catch(() => {});
        if (!a?.id || a.error) throw new Error(a?.error || '保存失败');
        if (!tok && pf.mode === 'region' && pf.region) {
          const q = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: t => { msg.textContent = t; } });
          if (!q.ok) throw new Error(regionLabel(pf.region) + '：' + q.error);
        }
        if (tok && await MailToken.save(a.id, tok) !== true) throw new Error('邮箱令牌没有保存成功，请更新客户端后重试');
        const regFn = Host.registerTokenAccount || Host.registerAccountByToken;
        if (tok && typeof regFn === 'function') {
          if (typeof Host.setCookies === 'function') {
            const staleNames = ['arena-auth-prod-v1', 'arena-auth-prod-v1.0', 'arena-auth-prod-v1.1'];
            try {
              await Host.setCookies(a.id, staleNames.map(name => ({
                url: 'https://arena.ai', name, value: '', domain: '.arena.ai', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 1,
              })));
            } catch {}
          }
          let pr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            msg.textContent = attempt === 0
              ? '正在执行纯协议令牌注册（预热 → 纯协议 reCAPTCHA → 收件验证 → 设置固定密码）…'
              : '正在继续执行纯协议令牌验证与设置固定密码…';
            pr = await regFn.call(Host, a.id, {
              email: em,
              tokenLine: tokInp.value,
              password: tok.pw,
              token: tok,
              tok,
            }).catch(e => ({ error: cleanErr(e), mailFailed: !!e?.mailFailed, tokenInvalid: !!e?.tokenInvalid, cooldownWaitSec: e?.cooldownWaitSec || 0 }));
            const waitSec = Number(pr?.cooldownWaitSec) || (() => {
              const m = /after\s+(\d+)\s*seconds?|等待\s*(\d+)\s*秒/i.exec(String(pr?.error || ''));
              return m ? Math.min(75, Math.max(1, Number(m[1] || m[2]))) + 2 : 0;
            })();
            if (!pr?.ok && waitSec > 0 && attempt < 2) {
              for (let rem = waitSec; rem > 0; rem--) {
                if (!back.isConnected) return;
                msg.textContent = '官方发信安全冷却中（' + rem + 's），冷却后自动继续注册与设密…';
                await new Promise(r => setTimeout(r, 1000));
              }
              continue;
            }
            break;
          }
          if (pr && pr.ok) {
            try {
              const btrSt = typeof BatchTokenReg !== 'undefined' ? BatchTokenReg.loadState() : null;
              if (btrSt) {
                const fIdx = btrSt.failed.findIndex(x => String(x.email || '').toLowerCase() === em.toLowerCase());
                if (fIdx >= 0) { btrSt.failed.splice(fIdx, 1); BatchTokenReg.saveState(); }
              }
            } catch {}
            try { await Nodes.refreshAccts(); } catch {}
            if (typeof LaunchPick !== 'undefined') { LaunchPick.cache = null; LaunchPick.cacheAt = 0; }
            msg.textContent = '纯协议注册并设置固定密码完成（' + (pr.email || em) + '），已添加到登录卡片，正在打开…';
            msg.className = 'lmsg ok';
            setTimeout(() => { back.remove(); Host.openAccount(a.id); }, 400);
            return;
          }
          if (pr?.error) throw new Error(pr.error);
        }
        const accepted = await Host.shared('signup@' + a.id, { email: em, at: now() });
        if (accepted !== true) throw new Error(accepted?.error || '注册任务没有保存，未打开新窗口；请重试或更新客户端');
        msg.textContent = '已新建，正在该账号窗口打开注册…'; msg.className = 'lmsg ok';
        setTimeout(async () => {
          if (!back.isConnected) return;
          try {
            const opened = await Host.openAccount(a.id);
            if (opened === false || opened === null || opened?.error) throw new Error(opened?.error || '宿主没有确认打开账号窗口');
            back.remove();
          } catch (e) {
            if (!back.isConnected) return;
            msg.textContent = '注册任务已保存，但账号窗口打开失败：' + cleanErr(e); msg.className = 'lmsg bad';
            reg.disabled = go.disabled = gGo.disabled = false; delete back.dataset.busy;
          }
        }, 300);
      } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; reg.disabled = go.disabled = gGo.disabled = false; delete back.dataset.busy; }
    } }, '注册新账号');
    // 网页注册：按上面选的节点 / ProxyIP 建好账号，切到它自己的窗口（独立指纹 + 该账号出口）后直接打开 Brana 官网，顶部有地址栏浏览条；注册、收信、点验证链接全部自己在网页里手动完成
    const web = h('button', { type: 'button', class: 'btn ghost webreg', style: { marginRight: 'auto' }, hidden: true, title: '新建账号后，在它自己的窗口（独立指纹 / 该账号出口 / WebRTC 保护）里直接打开 Brana 官网，顶部有地址栏，注册和收信验证都自己手动操作', onclick: async () => {
      if (web.disabled || back.dataset.busy) return;
      const em = email.value.trim();
      if (em && !EMAIL_RE.test(em)) { msg.textContent = '邮箱格式不正确（网页注册可以不填，之后注册成功会自动记到账号上）'; msg.className = 'lmsg bad'; email.focus(); return; }
      if (pf.err()) { msg.textContent = pf.err(); msg.className = 'lmsg bad'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      web.disabled = reg.disabled = go.disabled = gGo.disabled = true; back.dataset.busy = '1'; msg.className = 'lmsg'; msg.textContent = '正在新建账号…';
      try {
        const a = await saveConnection(em ? { name: em, email: em } : { name: WEBREG_NAME, email: '' });
        if (!a?.id || a.error) throw new Error(a?.error || '保存失败');
        if (pw.inp.value) await Promise.resolve(Host.shared('regpw@' + a.id, { email: em, pw: pw.inp.value, src: 'client' })).catch(() => {});   // 官网的密码框会自动填入它
        if (pf.mode === 'region' && pf.region) {
          if (pf.proxyIp && Pool.fresh(pf.proxyIp, pf.region, a.id)) await Pool.mutate(d => { if (d.ips[pf.proxyIp]) d.ips[pf.proxyIp].used = now(); }).catch(() => {});
          else { const q = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: t => { msg.textContent = t; } }); if (!q.ok) throw new Error(regionLabel(pf.region) + '：' + q.error); }
        }
        const accepted = await Host.shared('webreg@' + a.id, { at: now() });
        if (accepted !== true) throw new Error(accepted?.error || '网页注册任务没有保存，未打开新窗口；请重试或更新客户端');
        msg.textContent = '已新建，正在该账号窗口打开 Brana 官网…'; msg.className = 'lmsg ok';
        const opened = await Host.openAccount(a.id);
        if (opened === false || opened === null || opened?.error) throw new Error(opened?.error || '宿主没有确认打开账号窗口');
        back.remove();
      } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); web.disabled = reg.disabled = go.disabled = gGo.disabled = false; delete back.dataset.busy; }
    } }, icon('globe'), '网页注册');
    // 顶部三段切换（登录 / 注册）共用同一个邮箱和密码输入框：切换模式不会丢内容，登录和注册用的永远是同一个邮箱
    let mode = ['signup', 'token'].includes(preset.mode) ? preset.mode : 'login';
    const fx = FixedPw.bind(pw.inp, null);
    const desc = h('p', { class: 'muted' });
    const pwLab = h('label', {}, '密码');
    const detail = h('div', { class: 'lnote-detail', hidden: true }), note = infoNote(detail);
    const MODES = ['login', 'signup', 'token'];
    const gOr = h('div', { class: 'lor' }, h('span', {}, '或'));
    // 令牌：单行输入框，邮箱从令牌里自动识别（令牌页不再单独显示邮箱行，布局和登录 / 注册页等高）
    const tokInp = h('input', { type: 'text', class: 'llink', spellcheck: 'false', autocomplete: 'off', placeholder: '邮箱----收件地址(https://…) 或 邮箱----密码----clientId----刷新令牌' });
    tokInp.addEventListener('input', () => { try { const t = MailToken.parse(tokInp.value); if (email.value.trim().toLowerCase() !== t.email) { email.value = t.email; email.dispatchEvent(new Event('input')); } if (t.password && !pw.inp.value) pw.inp.value = t.password; if (mode === 'token') note.text.textContent = '已识别邮箱：' + t.email + (t.kind === 'url' ? '（URL 收件接口）' : '（OAuth 令牌）'); } catch { if (mode === 'token') note.text.textContent = '支持：邮箱----https://收件API地址 或 邮箱----密码----clientId----刷新令牌'; } });
    const batchTokBtn = h('button', { type: 'button', class: 'btn ghost sm token-batch-open', title: '打开一行一个号批量令牌协议注册（独立指纹 + 30 分钟 ProxyIP 冷却队列 + 待注册/注册失败分列）', onclick: () => { back.remove(); this.batchTokenRegister(tokInp.value, pw.inp.value); } }, icon('list'), '批量令牌协议注册');
    const tokWrap = frow('令牌', h('div', { class: 'tok-inp-row', style: { display: 'flex', gap: '6px', width: '100%', alignItems: 'center' } }, tokInp, batchTokBtn)); tokWrap.classList.add('token-only'); tokWrap.hidden = true;
    const emailRow = frow('邮箱', email);
    const segBtns = [['login', '登录'], ['signup', '注册'], ['token', '令牌']].map(([m, t]) => h('button', { type: 'button', role: 'tab', onclick: () => { if (!back.dataset.busy) setMode(m); } }, t));
    const seg = h('div', { class: 'lseg', role: 'tablist' }, ...segBtns);
    const tokGuide = h('div', { class: 'lsub', hidden: true }, '令牌注册：粘贴令牌、填要设置的密码 → 新窗口（该账号自己的指纹 / IP / 语言）自动发送注册邮件 → 客户端自动收信、打开验证链接、设置密码并保持登录，全程不用手动操作。在客户端里直接用微软接口收信，不经过第三方；令牌和密码用本机钥匙串加密保存。');
    const guide = h('div', { class: 'lsub signup-only' }, '注册：填邮箱和要设置的密码 → 新窗口里发送注册邮件 → 把邮件里的链接粘贴回来，在页面设置同一个密码。也可以点下面的按钮：直接在这个账号的环境里打开 Brana 官网，顶部有地址栏，全部自己手动操作（邮箱邮件也能在地址栏里打开）。');
    detail.append(desc, guide, tokGuide);
    function setMode(m) {
      mode = m; msg.textContent = ''; msg.className = 'lmsg';
      segBtns.forEach((b, i) => { const on = MODES[i] === m; b.className = on ? 'on' : ''; b.setAttribute('aria-selected', String(on)); });
      const reg_ = m !== 'login';
      go.replaceChildren(m === 'token' ? '令牌注册并打开' : m === 'signup' ? '注册并打开' : '登录并打开');
      note.text.textContent = m === 'token' ? '令牌注册：自动收信验证并设置密码' : m === 'signup' ? '注册：独立指纹和线路，验证全程同一出口' : '新账号使用独立的指纹和线路';
      pw.inp.placeholder = m === 'token' ? '要设置的密码（验证后自动设置）' : m === 'signup' ? '要设置的密码（验证页设置同一个）' : '密码';
      pw.inp.autocomplete = reg_ ? 'new-password' : 'current-password';
      guide.hidden = m !== 'signup'; web.hidden = m !== 'signup'; imp.hidden = m === 'signup'; tokWrap.hidden = m !== 'token'; emailRow.hidden = m === 'token'; tokGuide.hidden = m !== 'token';
      email.readOnly = m === 'token';
      gGo.hidden = gOr.hidden = m === 'token';
      desc.textContent = pf.draftRoute ? '先选择节点并检测，通过后保存到新账号；不会修改当前账号的线路。验证码和登录在新账号自己的会话中进行。'
        : m === 'token' ? '地区自动分配（可在下拉里改）；注册、收信验证、设置密码全程使用这里选的节点和出口，不会中途变动。'
        : m === 'signup' ? '地区自动分配（可在下拉里改）；注册、验证全程使用这里选的节点和出口，不会中途变动。'
        : Host.platform === 'desktop' ? '用 Google 一键添加，或填邮箱和密码；地区自动分配（可在下拉里改），节点不通自动换。在后台用该账号自己的出口直接登录，成功后在新窗口打开；密码保存在本机，用于会话过期时自动重新登录。' : '用 Google 一键添加，或填邮箱和密码；地区自动分配（可在下拉里改）。保存后切换过去，自动用该账号的代理登录。';
    }
    const imp = h('button', { class: 'btn ghost', style: { marginRight: 'auto' }, title: '粘贴账号合集 / 每行「邮箱 密码 [代理]」，或选择文本文件，一次导入多个账号', onclick: () => { back.remove(); this.importAccounts(); } }, icon('download'), '导入账号');
    const back = modal('添加账号', h('div', { class: 'lform plain auth-form' },
      seg, note.row, detail, tokWrap,
      emailRow, h('div', { class: 'frow' }, pwLab, h('div', { class: 'frow-c' }, pw.el)), fx.el,
      pf.testedRoute ? pf.block() : frow('连接', pf.block({ test, res: ipRes })), devLine, msg,
      gOr, gGo),
      K(web, imp, go), 'small auth-add');
    if (devLine) { const dv = setInterval(() => { if (!devLine.isConnected) { clearInterval(dv); return; } devPaint(); }, 1000); }
    // 取消 → 右上角 X
    { const hd = back.querySelector('.modal-h'), head = h('div', { class: 'rip-head' }), x = h('button', { type: 'button', class: 'rip-x', title: '关闭', 'aria-label': '关闭', onclick: () => { if (!back.dataset.busy) back.remove(); } }, icon('x')); hd.replaceWith(head); head.append(hd, x); }
    setMode(mode);
    const needEdgeTunnelGuard = () => !(typeof window !== 'undefined' && (window.__fixture || window.__routeFixture || window.__capFetch)) && typeof QrSync !== 'undefined' && typeof QrSync.hasNodeConfigured === 'function' && !QrSync.hasNodeConfigured() && !pf.nodeId && !/^vless:\/\//i.test(String(pf.proxy || '').trim());
    if (needEdgeTunnelGuard()) {
      const subRowInp = h('input', { type: 'text', class: 'inp', placeholder: '请先粘贴 EdgeTunnel 订阅地址 (https://...) 配置节点', style: 'flex:1;font-size:12px' });
      const subRowBtn = h('button', { type: 'button', class: 'btn sm p', onclick: async () => {
        const u = subRowInp.value.trim();
        if (!u) { msg.textContent = '请先填写 EdgeTunnel 订阅地址，配置好节点后才能登录或注册账号'; msg.className = 'lmsg bad'; subRowInp.focus(); return; }
        msg.textContent = '正在配置 EdgeTunnel 订阅节点…'; msg.className = 'lmsg';
        try {
          await QrSync.applySyncPayload(u, m => { msg.textContent = m; });
          msg.textContent = '✓ EdgeTunnel 节点配置成功，现在可以继续登录或注册账号'; msg.className = 'lmsg ok';
          subBanner.remove();
        } catch (e) {
          msg.textContent = cleanErr(e); msg.className = 'lmsg bad';
        }
      } }, '配置订阅');
      const subBanner = h('div', { class: 'edgetunnel-req-banner', style: 'display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-bottom:8px;border:1px solid var(--wn);border-radius:8px;background:var(--bg2)' },
        h('div', { style: 'font-size:12px;font-weight:600;color:var(--wn)' }, '⚠ 当前尚未配置节点，请先填写 EdgeTunnel 订阅地址后再登录或注册'),
        h('div', { style: 'display:flex;gap:6px;align-items:center' }, subRowInp, subRowBtn)
      );
      seg.before(subBanner);
    }
    go.onclick = async () => {
      if (needEdgeTunnelGuard()) { msg.textContent = '请先填写 EdgeTunnel 订阅地址完成节点配置，配置好后才能登录或注册账号'; msg.className = 'lmsg bad'; return; }
      if (mode !== 'login') return reg.click();
      const em = email.value.trim(), p = pw.inp.value, px = pf.proxy;
      if (!EMAIL_RE.test(em)) { msg.textContent = '邮箱格式不正确'; msg.className = 'lmsg bad'; return; }
      if (!p) { msg.textContent = '请输入密码'; msg.className = 'lmsg bad'; return; }
      if (pf.err()) { msg.textContent = pf.err(); msg.className = 'lmsg bad'; return; }
      go.disabled = true; back.dataset.busy = '1'; msg.className = 'lmsg'; msg.textContent = '正在保存…';
      try {
        const a = await saveConnection({ name: em, email: em, password: p });
        if (!a) throw new Error('保存失败');
        // 按地区：若 saveConnection 已完成实测选路，则不再重复调用 Pool.acquire
        if (!pf.testedRoute && pf.mode === 'region' && pf.region) { const q = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: s => { msg.textContent = s; } }); if (!q.ok) throw new Error(regionLabel(pf.region) + '：' + q.error); }
        msg.textContent = '正在用 ' + (pf.region ? regionLabel(pf.region) : maskProxy(px)) + ' 登录…';
        const r = await Host.signInAccount(a.id).catch(e => ({ error: cleanErr(e) }));
        if (r?.error) throw new Error(r.error);
        msg.textContent = r?.deferred ? '已保存，正在切换…' : '登录成功' + (r?.ip ? '（出口 ' + r.ip + '）' : '') + '，正在打开…'; msg.className = 'lmsg ok';
        setTimeout(() => { back.remove(); Host.openAccount(a.id); }, 500);
      } catch (e) { msg.textContent = cleanErr(e) + '（账号已保存，可在账号管理里修改后重试）'; msg.className = 'lmsg bad'; go.disabled = false; delete back.dataset.busy; }
    };
    setTimeout(() => email.focus(), 30);
  },

  // ----- 账号管理（邮箱 / 密码备忘 / 代理 / 额度）-----
  async accounts() {
    if(document.querySelector('.modal-back:not(.anc-gh).amgr'))return;
    const rows=h('div',{class:'acct-rows'},h('p',{role:'status'},'正在读取账号…'));
    const info=h('div',{class:'am-top dim'},'账号管理 · 点开后才读取密码及加载连接编辑器');
    const back=modal('账号管理',K(info,rows),K(
      h('button',{class:'btn ghost',onclick:()=>{back.remove();this.importAccounts();}},icon('download'),'导入'),
      ...((Host.platform === 'android' || (typeof isMob === 'function' && isMob())) ? [] : [h('button',{class:'btn ghost',onclick:()=>{back.remove();this.exportAccounts();}},icon('upload'),'导出')]),
      h('button',{class:'btn ghost',onclick:()=>ProxySet.open()},icon('globe'),'ProxyIP'),
      h('button',{class:'btn ghost',onclick:()=>{back.remove();this.batchTokenRegister();}},icon('key'),'批量令牌注册'),
      h('button',{class:'btn ghost',onclick:()=>{back.remove();this.addAccount();}},icon('plus'),'添加账号'),
      h('span',{class:'grow'}),h('button',{class:'btn',onclick:()=>back.remove()},'完成')),'wide');back.classList.add('amgr');
    const cleanups=[];const detach=new MutationObserver(()=>{if(!back.isConnected){detach.disconnect();for(const stop of cleanups)stop();}});detach.observe(document.body,{childList:true});
    await PanelWork.frame();if(!back.isConnected)return;
    let list;try{list=await PanelWork.wait(()=>Host.listAccounts(true));if(!Array.isArray(list))throw Error('账号列表不可用');}
    catch(e){if(back.isConnected)rows.replaceChildren(h('p',{role:'status'},'读取失败：'+describe(e)),h('button',{class:'btn',onclick:()=>{back.remove();this.accounts();}},'重试'));return;}
    if(!back.isConnected)return;
    const secrets=new Map();let secretJob=null;
    const readSecrets=()=>secretJob||(secretJob=PanelWork.wait(()=>Host.exportAccounts()).then(L=>{if(!Array.isArray(L))throw Error('密码读取失败，未打开编辑器');for(const x of L)secrets.set(x.id,x.password||'');}).catch(e=>{secretJob=null;throw e;}));
    const row = a => {
      const isCur = a.id === this.host?.account?.id, st = a.status || {};
      const email = h('input', { value: a.email || '', placeholder: '邮箱' });
      const pw = pwField(secrets.get(a.id) || '', a.hasPw ? '已保存' : '密码（可选）');
      const pf = proxyField(a, { live: false, draft: true }), proxy = pf.inp;
      let initialPassword = pw.inp.value;
      // 右下角：实时出口 IP（当前账号跟着底栏的出口检测刷新；测试 / 应用时显示进度和结果）
      const ipTxt = () => { const ip = isCur ? (IP.ip || st.ip) : st.ip, loc = isCur ? (IP.loc || st.loc) : st.loc; return ip ? (loc ? ccF(loc) + ' ' : '') + ip : (isCur && IP.err ? IP.err : a.tunErr || '出口未知'); };
      const ipEl = h('span', { class: 'ar-ipv' }, ipTxt());
      let ipMsgAt=0;const ipObserver=new MutationObserver(()=>{if(!ipEl._set)ipMsgAt=now();});ipObserver.observe(ipEl,{childList:true,characterData:true,subtree:true});cleanups.push(()=>ipObserver.disconnect());
      if (isCur) { const off = Bus.on('ip', () => { if (!ipEl.isConnected) { off(); return; } if (now() - ipMsgAt < 10000) return; ipEl._set = 1; ipEl.textContent = ipTxt(); ipObserver.takeRecords();ipEl._set = 0; });cleanups.push(off); }
      // 指纹（桌面版）：随机生成并绑定到账号，可编辑、可重新生成
      let fp = a.fp ? { ...a.fp } : null, fpDirty = false;
      const fpSum = h('span', { class: 'fp-sum' }, fpLine(fp)), fpEd = h('div', { class: 'fp-ed', hidden: true });
      const fpInputs = () => {
        const f = fp || {}, mk = (k, ph, w) => h('input', { value: f[k] ?? '', placeholder: ph, style: w ? { maxWidth: w } : null, oninput: e => { fp = { ...(fp || {}), [k]: e.target.value }; fpDirty = true; fpSum.textContent = fpLine(fp); } });
        fpEd.replaceChildren(h('label', {}, '屏幕', mk('screen', '1920x1080', '110px')), h('label', {}, 'CPU 核心', mk('cores', '8', '60px')), h('label', {}, '内存 GB', mk('mem', '8', '60px')), h('label', {}, '时区（可选，须属于绑定地区）', mk('timezone', '例如 America/Los_Angeles')), h('label', { class: 'w2' }, '显卡', mk('gpu', 'ANGLE (NVIDIA, …)')), h('label', { class: 'w2' }, 'UA（留空 = 跟随内核）', mk('ua', '')));
      };
      const fpRow = Host.platform === 'desktop' ? h('div', { class: 'fp-row' }, h('span', { class: 'fp-k' }, icon('shield'), '指纹'), fpSum,
        tipI('每个账号随机生成一套浏览器指纹（屏幕、CPU 核心、内存、显卡、画布噪声种子；语言和时区由绑定地区优先统一，未绑定时沿用系统环境）并绑定，不会因此保证无法被识别。改动在保存后、下次载入页面时生效。'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost xs', onclick: async () => { const g = await Host.genFp?.().catch(() => null); if (!g) return; fp = g; fpDirty = true; fpSum.textContent = fpLine(fp); if (!fpEd.hidden) fpInputs(); } }, '重新生成'),
        h('button', { class: 'btn ghost xs', onclick: () => { fpEd.hidden = !fpEd.hidden; if (!fpEd.hidden) fpInputs(); } }, '编辑')) : null;
      const save = async () => {
        const np = pf.proxy, npi = pf.proxyIp;
        if (pf.err()) { toast(pf.err(), 'err'); return false; }
        if (!pf.draftRoute && isCur && (np !== (a.proxy || '') || npi !== (a.proxyIp || ''))) {
          ipEl.textContent = '测试新代理…';
          const t = await Host.testIp({ ...a, proxy: np, proxyIp: npi }).catch(e => ({ error: e.message }));
          if (t && t.ip) ipEl.textContent = t.ip + (t.loc ? ' ' + ccF(t.loc) : '');
          else if (t !== null) { ipEl.textContent = t?.error || '不可用'; if (!await Dialog.confirm({ title: '新代理测试失败', text: `${t?.error || '不可用'}\n保存后当前窗口会断开连接，确定仍然保存？`, ok: '仍然保存', danger: true })) return false; }
        }
        const fpCh = fpDirty && fp;
        try { const fields = { id: a.id, name: email.value.trim() || a.name || '账号', email: email.value.trim(), manualEmailEdit: true, ...(pw.inp.value !== initialPassword ? { password: pw.inp.value } : {}), ...(fpCh ? { fp } : {}) }; const saved = pf.save ? await pf.save(fields) : await Host.saveAccount({ ...fields, proxy: np, proxyIp: npi, nodeId: pf.nodeId, region: pf.region, ...(pf.routeMode ? RouteState.prefs(pf.routeMode) : {}) }); if (!saved?.id || saved.error) throw Error(saved?.error || '保存未确认'); initialPassword = pw.inp.value; Object.assign(a, saved || {}); if (saved?.fp) { fp = { ...saved.fp }; fpSum.textContent = fpLine(fp); } fpDirty = false; }
        catch (e) { toast(cleanErr(e), 'err'); return false; }
        if (isCur) { this.host = await Host.info(); this.renderAcct(); IP.poll(); }
        if (isCur && fpCh && await Dialog.confirm({ title: '指纹已更新', text: '新指纹在重新载入页面后生效。现在重新载入？', ok: '重新载入' })) setTimeout(() => location.reload(), 200);
        return true;
      };
      // 收起时一行：头像（绿点 = 已登录）· 邮箱前缀 · 当前；第二行 出口 IP + 额度。点开才显示编辑项
      // 测试成功就直接应用（不用再点保存）：按地区 = 并发测同地区的候选，最快、且出口国家一致的那个直接保存；无效 / 超时立刻测下一批
      const autoApply = async () => {
        if (pf.draftRoute) { await pf.check(); if (pf.err()) { ipEl.textContent = pf.err(); return; } if (await save()) ipEl.textContent = '检测通过，已保存到该账号；其他账号线路未更改'; return; }
        if (pf.err()) { ipEl.textContent = pf.err(); return; }
        if (pf.mode === 'region') {
          ipEl.textContent = '测试并应用中…';
          const r = await Pool.acquire(a, pf.region, { prefer: pf.proxyIp, log: t => { ipEl.textContent = t; } }).catch(e => ({ ok: false, error: cleanErr(e) }));
          if (r.ok) { ipEl.textContent = '✓ 已应用 ' + r.to + ' · ' + ccF(r.loc) + ' ' + r.loc + (r.ms ? ' · ' + r.ms + 'ms' : ''); if (isCur) { this.host = await Host.info(); this.renderAcct(); setTimeout(() => IP.poll(), 600); } }
          else ipEl.textContent = '✗ ' + r.error;
          return;
        }
        ipEl.textContent = '测试中…';
        const r2 = await Host.testIp({ ...a, proxy: pf.proxy, proxyIp: pf.proxyIp }).catch(e => ({ error: e.message }));
        if (r2?.ip) { ipEl.textContent = '✓ ' + r2.ip + (r2.loc ? ' ' + ccF(r2.loc) + ' ' + r2.loc : ''); if (pf.proxy !== (a.proxy || '') || pf.proxyIp !== (a.proxyIp || '')) { if (await save()) { Object.assign(a, { proxy: pf.proxy, proxyIp: pf.proxyIp }); ipEl.textContent += ' · 已应用'; } } }
        else ipEl.textContent = r2 === null ? '保存后看底栏' : '✗ ' + (r2?.error || '失败');
      };
      const r = h('details', { class: 'arow2 am' + (isCur ? ' cur' : '') },
        h('summary', { class: 'ar-h' },
          h('span', { class: 'av sm am-av' + (st.loggedIn === false ? ' out' : st.loggedIn ? ' in' : ''), title: st.loggedIn === false ? '未登录' : st.loggedIn ? '已登录' : '', style: { background: avColor(a.email || a.name) } }, (a.email || a.name || '?')[0].toUpperCase()),
          h('span', { class: 'am-c' },
            h('span', { class: 'am-n' }, h('b', { title: a.email || '' }, emailUser(a)), isCur ? h('span', { class: 'tagb' }, '当前') : null, st.loggedIn === false ? h('span', { class: 'tagb warn' }, '未登录') : null),
            h('span', { class: 'am-s' }, st.ip ? h('span', { class: 'am-ip mono' }, (st.loc ? ccF(st.loc) + ' ' : '') + st.ip) : null, h('span', { class: 'aq' }, ...quotaBits(st)))),
          icon('chev', 'am-chev')),
        h('div', { class: 'ar-g' },
          h('label', {}, '邮箱', email), h('label', {}, '密码', pw.el), h('div', { class: 'ar-px' }, h('span', { class: 'ar-pl' }, '连接'), pf.block({ test: h('button', { class: 'ib', title: '测试出口 IP（成功直接应用）', onclick: () => autoApply() }, icon('pulse')) }))),
        fpRow, fpEd,
        // 按钮一行等宽（三个按钮：导出 / 登录 / 确认）；最下面一行：左边删除账号，右边实时出口 IP
        h('div', { class: 'ar-f ar-f3' },
          h('button', { class: 'btn ghost sm', title: '导出该账号（复制邮箱与密码）', onclick: () => {
            const em = email.value.trim() || a.email || '';
            const p = pw.inp.value || '';
            if (!em && !p) { toast('这个账号没有可导出的账号或密码', 'err'); return; }
            copyText(em && p ? `${em}----${p}` : (em || p));
            toast(em && p ? '已导出账号与密码' : (p ? '已导出密码' : '已导出账号（未保存密码）'));
          } }, icon('upload'), '导出'),
          h('button', { class: 'btn ghost sm', title: isCur ? '用保存的邮箱和密码重新登录' : '登录这个账号', onclick: async () => {
            if (!(await save())) return;
            if (isCur) { if (!pw.inp.value) { toast('请先填写密码', 'err'); return; } try { await Auth.signIn(email.value.trim(), pw.inp.value); toast('登录成功'); setTimeout(() => location.reload(), 300); } catch (e) { toast(cleanErr(e), 'err'); } return; }
            const res = await Host.signInAccount(a.id).catch(e => ({ error: cleanErr(e) }));
            if (res?.error) toast('登录失败：' + res.error, 'err'); else { toast(res?.deferred ? '切换后自动登录' : '登录成功' + (res?.ip ? '（出口 ' + res.ip + '）' : '')); if (res?.deferred) Host.openAccount(a.id); }
          } }, icon('login'), '登录'),
          h('button', { class: 'btn sm', title: '确认并保存修改（含连接设置）', onclick: async () => { if (await save()) toast('已确认并保存' + (isCur ? '，代理已生效' : '')); } }, icon('check'), '保存')),
        h('div', { class: 'ar-f2' },
          !isCur ? h('button', { class: 'ar-del', title: '删除这个账号', onclick: async () => { if (!await Dialog.confirm({ title: '删除账号', text: `删除账号「${a.email || emailUser(a)}」？其登录数据和保存的密码会一并清除。`, ok: '删除', danger: true })) return; try { removeCheck(await Host.removeAccount(a.id)); r.remove(); } catch (e) { toast('删除失败：' + describe(e), 'err'); } } }, icon('trash'), '删除账号') : null,
          h('span', { class: 'grow' }),
          h('span', { class: 'ar-ip', title: isCur ? '当前出口 IP（实时）' : '上次检测到的出口 IP' }, h('span', { class: 'ar-ipk' }, isCur ? '出口' : '上次出口'), ipEl)));
      return r;
    };
    rows.replaceChildren();info.textContent=list.length+' 个账号 · 点开编辑（按需加载）';
    let shown=0;const more=h('button',{class:'btn ghost',onclick:()=>appendPage()},'加载更多');
    const appendPage=()=>{
      more.remove();const batch=list.slice(shown,shown+20);shown+=batch.length;
      for(const a of batch){
        const shell=h('details',{class:'arow2 am'},h('summary',{class:'ar-h'},h('b',{},emailUser(a)),a.id===this.host?.account?.id?h('span',{class:'tagb'},'当前'):null,h('span',{class:'grow'}),icon('chev')));
        let loading=false;
        shell.ontoggle=async()=>{
          if(!shell.open||loading)return;loading=true;shell.querySelector('[role=status]')?.remove();
          const hint=h('p',{class:'dim',role:'status'},'正在加载编辑器…');shell.append(hint);
          await PanelWork.frame();if(!back.isConnected||!shell.open){hint.remove();loading=false;return;}
          try{await readSecrets();if(a.hasPw&&!secrets.has(a.id)){secretJob=null;throw Error('保存的密码未能读取，未打开编辑器以避免覆盖');}if(!back.isConnected||!shell.isConnected)return;if(!shell.open){hint.remove();return;}const full=row(a);full.open=true;shell.replaceWith(full);}
          catch(e){hint.textContent=describe(e)+'；收起后可重试。';}
          finally{loading=false;}
        };rows.append(shell);
      }
      if(shown<list.length){more.textContent='加载更多（剩余 '+(list.length-shown)+' 个）';rows.append(more);}
    };appendPage();

  },

  // ----- 导出账号合集（与油猴「账号切换」脚本互通：ARENA-ACCOUNTS-V1）-----
  async exportAccounts() {
    const isMobile = Host.platform === 'android' || (typeof isMob === 'function' && isMob());
    if (isMobile) {
      this.importAccounts();
      return;
    }
    const all = (await Host.exportAccounts().catch(() => []) || []).filter(a => a.email);
    const pack = all.length ? (PACK_PREFIX + utf8b64(JSON.stringify({ v: 1, from: 'brana-client', at: now(), accounts: all.map(a => ({ email: a.email, pw: a.password || undefined, name: a.name && a.name !== a.email ? a.name : undefined, remark: a.remark || undefined, proxy: a.proxy || undefined, proxyIp: a.proxyIp || undefined, region: a.region || undefined, nodeId: a.nodeId || undefined })) }))) : '';
    const np = all.filter(a => a.password).length;
    const ta = h('textarea', { class: 'packbox', readonly: true, rows: 6, placeholder: '暂无带邮箱的账号可导出文本合集，可点击右上角二维码图标导出配置' }, pack);
    const openQrSync = () => {
      if (typeof QrSync !== 'undefined' && QrSync.openModal) {
        QrSync.openModal('export');
      }
    };
    const qrIconBtn = h('button', {
      type: 'button',
      class: 'ib export-qr-sync-btn',
      title: '二维码导出',
      'aria-label': '二维码导出',
      onclick: openQrSync,
    }, icon('qr'));
    const hdr = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;width:100%' },
      h('span', {}, '导出账号合集'),
      qrIconBtn
    );
    const back = modal(hdr, K(
      h('p', { class: 'muted' }, all.length ? `共 ${all.length} 个账号（${np} 个带密码）${all.length - np ? '，没有密码的账号导入后需要手动登录' : ''}。内含密码，请勿发给他人。可粘贴到本客户端或油猴「账号切换」脚本的「导入账号」。` : '当前暂无已保存邮箱的账号，可点击右上角二维码图标导出节点订阅配置。'),
      ta
    ),
      K(
        h('button', { class: 'btn ghost', onclick: () => back.remove() }, '关闭'),
        h('button', { class: 'btn', onclick: () => pack ? copyText(pack) : openQrSync() }, '复制')
      ), 'small');
    if (pack) { copyText(pack); ta.select?.(); }
  },

  // ----- 导入账号 -----
  importAccounts(prefill = '') {
    const ta = h('textarea', { class: 'packbox', rows: 7, placeholder: '粘贴「导出账号合集」的内容，或每行一个：\nname@example.com 密码\nname2@example.com----密码----socks5://127.0.0.1:7892' }, prefill);
    const skip = h('input', { type: 'checkbox', checked: true }), dproxy = h('input', { placeholder: '没有代理的账号使用（可选）' });
    const out = h('div', { class: 'irows' });
    const go = h('button', { class: 'btn' }, Host.platform === 'desktop' ? '导入并登录' : '导入');
    // 从文件导入（导出的合集 / txt / csv）、从剪贴板粘贴
    const fin = h('input', { type: 'file', accept: '.txt,.csv,.json,text/plain,application/json', style: 'display:none', onchange: async () => {
      const f = fin.files?.[0]; fin.value = ''; if (!f) return;
      if (f.size > 2e6) { toast('文件太大（超过 2 MB）', 'err'); return; }
      try { const t = (await f.text()).trim(); ta.value = ta.value.trim() ? ta.value.trim() + '\n' + t : t; const r = parseAccounts(ta.value); toast(r.error ? r.error : '已读取 ' + r.list.length + ' 个账号，确认后点「导入」', r.error ? 'err' : ''); }
      catch (e) { toast('读取文件失败：' + describe(e), 'err'); }
    } });
    const openQrImport = () => {
      if (typeof QrSync !== 'undefined' && QrSync.openModal) {
        QrSync.openModal('import', async () => {
          try { back.remove(); } catch {}
          try {
            if (typeof LaunchPick !== 'undefined' && document.querySelector('.lpick')) {
              LaunchPick.cache = null;
              document.querySelectorAll('.lpick').forEach(el => el.remove());
              void LaunchPick.show();
            } else {
              this.loginGate?.();
            }
          } catch {}
        });
      }
    };
    const pick = h('div', { class: 'lrow' },
      h('button', { class: 'ib import-qr-sync-btn', type: 'button', title: '扫码导入电脑端二维码', 'aria-label': '扫码导入电脑端二维码', onclick: openQrImport }, icon('qr')),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => fin.click() }, icon('file'), '从文件导入'),
      h('button', { class: 'btn ghost sm', type: 'button', title: '切换到一行一个号批量令牌协议注册', onclick: () => { back.remove(); this.batchTokenRegister(ta.value); } }, icon('key'), '批量令牌协议注册'),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => { try { const t = (await navigator.clipboard.readText()).trim(); if (!t) { toast('剪贴板是空的', 'err'); return; } ta.value = ta.value.trim() ? ta.value.trim() + '\n' + t : t; } catch { toast('无法读取剪贴板，请长按输入框粘贴', 'err'); ta.focus(); } } }, icon('copy'), '粘贴'),
      h('span', { class: 'grow' }), h('span', { class: 'dim', style: { fontSize: '12px' } }, '支持二维码 / 账号合集 / txt'), fin);
    const importHdr = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;width:100%' },
      h('span', {}, '导入账号'),
      h('button', { type: 'button', class: 'ib', title: '扫码导入电脑端二维码', 'aria-label': '扫码导入电脑端二维码', onclick: openQrImport }, icon('qr'))
    );
    const back = modal(importHdr, K(h('p', { class: 'muted' }, '支持右上角二维码扫码同步，或粘贴导出的账号合集（ARENA-ACCOUNTS-V1）、每行「邮箱 密码 [代理]」。同邮箱的账号会合并更新。'), pick, ta,
      h('div', { class: 'lrow' }, h('label', { class: 'lrem' }, skip, '跳过已存在且已登录的账号'), dproxy), out),
      K(h('button', { class: 'btn ghost', onclick: () => back.remove() }, '关闭'), go), 'small');
    go.onclick = async () => {
      const rawTrim = ta.value.trim();
      if (/^brana-sync:\/\//i.test(rawTrim) && typeof QrSync !== 'undefined' && QrSync.applySyncPayload) {
        go.disabled = true; back.dataset.busy = '1';
        try {
          const res = await QrSync.applySyncPayload(rawTrim, msg => { go.textContent = msg; });
          toast(`已同步导入 ${res.accountCount || 0} 个账号 · ${res.nodeCount || 0} 个节点`);
          back.remove();
          this.loginGate?.();
        } catch (e) {
          toast('导入失败：' + describe(e), 'err');
          go.disabled = false; delete back.dataset.busy; go.textContent = Host.platform === 'desktop' ? '导入并登录' : '导入';
        }
        return;
      }
      const tb = typeof MailToken !== 'undefined' && MailToken.parseBatch ? MailToken.parseBatch(ta.value) : null;
      if (tb && tb.items.length > 0 && tb.items.every(x => x.kind === 'url' || x.kind === 'oauth')) {
        back.remove();
        this.batchTokenRegister(ta.value);
        return;
      }
      const r = parseAccounts(ta.value); if (r.error) { toast(r.error, 'err'); return; }
      const dp = dproxy.value.trim(); if (dp && proxyErr(dp)) { toast(proxyErr(dp), 'err'); return; }
      go.disabled = true; back.dataset.busy = '1'; out.replaceChildren();
      const exist = new Map((await Host.listAccounts(true).catch(() => []) || []).map(a => [String(a.email || '').toLowerCase(), a]));
      let ok = 0, fail = 0; const regUsed = new Set(), pipUsed = new Set();
      try {
        await Nodes.load();
        if (!Nodes.list.length && typeof Nodes.loadSubs === 'function') await Nodes.loadSubs().catch(() => {});
        await Pool.load(true);
        await Nodes.refreshAccts();
        if (Nodes.list.length) {
          go.textContent = '正在挑选最优共享 VLESS 节点…';
          const an = await Pool.autoNode(Nodes.list).catch(() => null);
          const bestN = an?.node || (typeof NodeSpeed !== 'undefined' && NodeSpeed.best(Nodes.list)) || Pool.node() || Nodes.list[0];
          if (bestN?.id && Pool.d?.node !== bestN.id) await Pool.setNode(bestN.id).catch(() => {});
        }
        if (Pool.node() && !Pool.entries().length && typeof Pool.seed === 'function') {
          go.textContent = '正在初始化地区 IP 池…';
          await Pool.seed().catch(() => {});
        }
      } catch {}
      for (const [i, a] of r.list.entries()) {
        const st = h('span', { class: 'dim' }, '等待…'); out.append(h('div', { class: 'irow' }, h('b', {}, a.email), maskProxy(a.proxy || dp), st));
        go.textContent = `正在导入 ${i + 1} / ${r.list.length} …`;
        const old = exist.get(a.email.toLowerCase());
        if (skip.checked && old && old.status?.loggedIn && (!a.password || old.hasPw)) { st.textContent = '已存在，跳过'; ok++; continue; }
        try {
          // 共用最优 VLESS 节点 + 每个账号独立且互不相同的 ProxyIP（不选空 ProxyIP）
          let px = a.proxy || old?.proxy || dp, pip = a.proxyIp || old?.proxyIp || '', reg = a.region || old?.region || (pip && Pool.d?.ips?.[pip]?.loc) || '';
          let nid = Pool.node()?.id || (a.nodeId && Nodes.get(a.nodeId) ? a.nodeId : '') || (old?.nodeId && Nodes.get(old.nodeId) ? old.nodeId : '') || '';
          if (Pool.node() && (!px || isVless(px))) {
            px = Pool.link();
            nid = Pool.node().id;
            if (pip && (pipUsed.has(pip.toLowerCase()) || Pool.owner(pip, old?.id))) pip = '';
            let cc = reg || Pool.bestFree(old?.id, regUsed) || Pool.randomFree(old?.id, regUsed);
            if (!cc) {
              const domCcs = [...new Set((Pool.domains?.() || []).map(l => Pool.domLoc(l)).filter(Boolean))];
              const freeDomCcs = domCcs.filter(c => !regUsed.has(c) && !Pool.regionOwner(c, old?.id));
              const poolCcs = Pool.regions(old?.id).filter(x => Pool.avail(x.cc, old?.id, pipUsed).length > 0).map(x => x.cc);
              const pickList = freeDomCcs.length ? freeDomCcs : poolCcs.length ? poolCcs : domCcs;
              if (pickList.length) cc = pickList[i % pickList.length];
            }
            if (!cc) cc = 'JP';
            reg = cc;
            regUsed.add(cc);
            if (!pip) {
              let k = Pool.avail(cc, old?.id, pipUsed)[0];
              if (!k) {
                const anyAvail = Object.entries(Pool.d?.ips || {}).find(([ cand, e ]) => e && !e.gone && !Pool.banned(cand) && (e.loc === cc || !e.loc) && !pipUsed.has(cand.toLowerCase()) && !Pool.owner(cand, old?.id));
                if (anyAvail) k = anyAvail[0];
              }
              if (k) { pip = k; pipUsed.add(k); pipUsed.add(k.toLowerCase()); }
            } else {
              pipUsed.add(pip); pipUsed.add(pip.toLowerCase());
            }
          }
          const saved = await Host.saveAccount({ id: old?.id, name: a.name || old?.name || a.email, ...(typeof a.remark === 'string' ? { remark: a.remark } : {}), email: a.email, password: a.password || undefined, proxy: px, proxyIp: pip, ...(reg ? { region: reg } : {}), ...(nid ? { nodeId: nid } : {}) });
          if (!saved) throw new Error('保存失败');
          if (reg && (!pip || !Pool.keeps(saved, reg)) && Pool.link() && Host.probe) {
            st.textContent = '正在匹配 ' + regionLabel(reg) + ' 地区 IP…';
            const q = await Pool.acquire(saved, reg, { prefer: pip, noScreen: true, log: s => { st.textContent = s; } }).catch(e => ({ ok: false, error: cleanErr(e) }));
            if (q?.ok) { pip = q.to || saved.proxyIp || pip; px = saved.proxy || px; if (pip) pipUsed.add(pip); }
          }
          if (reg) st.textContent = '地区 ' + regionLabel(reg) + (pip ? ' (' + pip + ') · ' : ' · ');
          if (a.cookies?.length && !a.password) { await Host.setCookies(saved.id, a.cookies); st.textContent = '已写入登录凭据'; ok++; continue; }
          if (!a.password) { st.textContent = '已保存（没有密码，打开后手动登录）'; ok++; continue; }
          st.textContent = '登录中…';
          let res = await Host.signInAccount(saved.id).catch(e => ({ error: cleanErr(e) }));
          if (res?.error && /频繁|429/.test(res.error)) { st.textContent = '请求过于频繁，10 秒后重试…'; await sleep(10000); res = await Host.signInAccount(saved.id).catch(e => ({ error: cleanErr(e) })); }
          if (res?.error) { st.textContent = '失败：' + res.error; st.className = 'bad'; fail++; }
          else { st.textContent = res?.deferred ? '已保存，切换后自动登录' : '登录成功' + (res?.ip ? ' · ' + res.ip : ''); st.className = 'ok'; ok++; }
          if (!res?.deferred) await sleep(1200);
        } catch (e) { st.textContent = '失败：' + cleanErr(e); st.className = 'bad'; fail++; }
      }
      try { await Nodes.refreshAccts(); } catch {}
      if (typeof LaunchPick !== 'undefined') {
        LaunchPick.cache = null;
        LaunchPick.cacheAt = 0;
        const lp = document.querySelector('.lpick:not(.out)');
        if (lp) { lp.remove(); void LaunchPick.show({ back: true }); }
      }
      go.textContent = `完成：${ok} 个成功${fail ? '，' + fail + ' 个失败' : ''}`; delete back.dataset.busy;
      toast(`导入完成：${ok} 个成功${fail ? '，' + fail + ' 个失败' : ''}`, fail ? 'err' : '');
    };
  },
});


// ---------- 一行一个号批量令牌协议注册（独立指纹 + 30 分钟 ProxyIP 冷却队列 + 待注册列表 / 注册失败列表分列）----------
const BatchTokenReg = {
  STORE_KEY: 'batchTokenReg:v1',
  running: false,
  paused: false,
  abortCtl: null,
  timer: 0,
  uiHooks: null,
  state: null,

  loadState() {
    if (this.state) return this.state;
    const raw = Store.get(this.STORE_KEY, null);
    this.state = {
      pending: Array.isArray(raw?.pending) ? raw.pending.map(x => ({ ...x, status: x.status === 'running' ? 'queued' : (x.status || 'queued') })) : [],
      failed: Array.isArray(raw?.failed) ? raw.failed : [],
      succeeded: Array.isArray(raw?.succeeded) ? raw.succeeded.slice(-200) : [],
    };
    return this.state;
  },

  saveState() {
    if (!this.state) return;
    Store.set(this.STORE_KEY, {
      pending: this.state.pending,
      failed: this.state.failed,
      succeeded: this.state.succeeded.slice(-200),
    });
    this.paint();
  },

  paint() {
    try { this.uiHooks?.paint?.(); } catch {}
  },

  fmtCool(ms) {
    const sec = Math.max(0, Math.ceil((ms || 0) / 1000));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  },

  validFixedPw(pw) {
    const p = String(pw || '');
    return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[^A-Za-z0-9]/.test(p);
  },

  // 生成与现有所有账号均不重复的独立浏览器指纹
  async uniqueFp(usedSigs = new Set()) {
    const screens = ['1920x1080', '2560x1440', '1680x1050', '1536x864', '1440x900', '1600x900', '1366x768', '2560x1600', '3840x2160'];
    const gpus = [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ];
    const coresList = [8, 12, 16, 6, 10, 14, 20, 24];
    const memList = [8, 16, 32, 64];
    for (let i = 0; i < 16; i++) {
      let g = null;
      try { g = await Host.genFp?.(); } catch {}
      const randHex = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      const chromeMinor = 132 + Math.floor(Math.random() * 5);
      const buildNum = 6700 + Math.floor(Math.random() * 400);
      const patchNum = 40 + Math.floor(Math.random() * 150);
      const fp = {
        ...(g && typeof g === 'object' ? g : {}),
        screen: g?.screen || screens[Math.floor(Math.random() * screens.length)],
        cores: g?.cores || coresList[Math.floor(Math.random() * coresList.length)],
        mem: g?.mem || memList[Math.floor(Math.random() * memList.length)],
        gpu: g?.gpu || gpus[Math.floor(Math.random() * gpus.length)],
        canvasSalt: (g?.canvasSalt || '') + '_' + randHex(),
        audioSalt: (g?.audioSalt || '') + '_' + randHex(),
        ua: g?.ua || `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMinor}.0.${buildNum}.${patchNum} Safari/537.36`,
      };
      const sig = [fp.screen, fp.cores, fp.mem, fp.gpu, fp.canvasSalt].join('|');
      if (!usedSigs.has(sig)) {
        usedSigs.add(sig);
        return fp;
      }
    }
    return { screen: '1920x1080', cores: 8, mem: 16, gpu: gpus[0], canvasSalt: String(Date.now() + Math.random()) };
  },

  enqueueText(text) {
    const st = this.loadState();
    const { items, errors } = MailToken.parseBatch(text);
    const existingEmails = new Set(st.pending.map(x => x.email));
    let added = 0, bad = 0;
    for (const it of items) {
      if (existingEmails.has(it.email)) continue;
      existingEmails.add(it.email);
      const prevFailIdx = st.failed.findIndex(x => x.email === it.email);
      const prevFail = prevFailIdx >= 0 ? st.failed.splice(prevFailIdx, 1)[0] : null;
      st.pending.push({
        ...(prevFail?.acctId ? { acctId: prevFail.acctId } : {}),
        id: 'btr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        email: it.email,
        raw: it.raw,
        kind: it.kind,
        apiUrl: it.apiUrl || '',
        password: it.password || '',
        status: 'queued',
        step: '排队等待分配独立指纹与未冷却 ProxyIP',
        proxyIp: '',
        readyAt: 0,
        addedAt: now(),
      });
      added++;
    }
    for (const err of errors) {
      const em = (String(err.raw || '').split('----')[0].match(/([^\s@]+@[^\s@]+\.[^\s@]+)/) || [])[1]?.toLowerCase() || ('未识别邮箱');
      st.failed.unshift({
        id: 'btrf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        email: em,
        raw: err.raw,
        reason: '令牌格式错误：' + err.error,
        failedAt: now(),
        tokenInvalid: true,
      });
      bad++;
    }
    this.saveState();
    return { added, bad };
  },

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const st = this.loadState();
      if (this.paused) {
        clearInterval(this.timer);
        this.timer = 0;
        return;
      }
      const hasCooling = st.pending.some(x => x.status === 'cooling');
      if (hasCooling) {
        const nowMs = now();
        let ready = false;
        for (const item of st.pending) {
          if (item.status === 'cooling' && item.readyAt && nowMs >= item.readyAt) {
            item.status = 'queued';
            item.step = 'ProxyIP 冷却已结束，正在自动继续注册…';
            item.readyAt = 0;
            ready = true;
          }
        }
        this.paint();
        if (ready && !this.running && !this.paused) {
          void this.start();
        }
      } else if (!this.running) {
        clearInterval(this.timer);
        this.timer = 0;
      }
    }, 1000);
  },

  async start(customFixedPw = '') {
    const st = this.loadState();
    if (this.running) return;
    let fxPw = String(customFixedPw || '').trim();
    if (!fxPw) {
      const loaded = await FixedPw.load();
      fxPw = loaded.pw || '';
    }
    if (!this.validFixedPw(fxPw)) {
      toast('请先在上方填写合规的固定密码（至少 8 位，含大写、小写字母和符号）', 'err');
      return;
    }
    await FixedPw.save(true, fxPw);
    this.paused = false;
    this.running = true;
    const ctl = new AbortController();
    this.abortCtl = ctl;
    const isAborted = () => this.paused || ctl.signal.aborted;
    this.ensureTimer();
    this.paint();

    try {
      const accts = (await Host.listAccounts(true).catch(() => [])) || [];
      const byEmail = new Map(accts.map(a => [String(a.email || '').toLowerCase(), a]));
      const usedFpSigs = new Set(accts.map(a => a.fp ? [a.fp.screen, a.fp.cores, a.fp.mem, a.fp.gpu, a.fp.canvasSalt].join('|') : '').filter(Boolean));
      const sessionUsedIps = new Set();

      while (!isAborted()) {
        const nextItem = st.pending.find(x => x.status === 'queued' || (x.status === 'cooling' && (!x.readyAt || now() >= x.readyAt)));
        if (!nextItem) {
          const coolingItems = st.pending.filter(x => x.status === 'cooling');
          if (coolingItems.length && !isAborted()) {
            this.ensureTimer();
          }
          break;
        }

        nextItem.status = 'running';
        nextItem.readyAt = 0;
        nextItem.step = '正在验证邮箱令牌收件通道…';
        this.saveState();

        let tok;
        try {
          tok = MailToken.parse(nextItem.raw);
          const curPw = nextItem.password || fxPw;
          tok.pw = curPw;
          tok.password = curPw;
          await MailToken.access(tok);
        } catch (tokErr) {
          if (isAborted()) { nextItem.status = 'queued'; nextItem.step = '已暂停'; this.saveState(); break; }
          const idx = st.pending.indexOf(nextItem);
          if (idx >= 0) st.pending.splice(idx, 1);
          st.failed.unshift({
            id: nextItem.id,
            email: nextItem.email,
            raw: nextItem.raw,
            acctId: nextItem.acctId || '',
            reason: '令牌失效（收件接口无法访问）：' + cleanErr(tokErr),
            failedAt: now(),
            tokenInvalid: true,
          });
          this.saveState();
          continue;
        }
        if (isAborted() || !st.pending.includes(nextItem)) {
          if (st.pending.includes(nextItem)) { nextItem.status = 'queued'; nextItem.step = '已暂停'; this.saveState(); }
          break;
        }

        // 2. 分配 30 分钟内未用于注册的独立 ProxyIP
        const existingAcct = byEmail.get(nextItem.email.toLowerCase());
        nextItem.step = '正在分配 30 分钟内未使用的独立 ProxyIP…';
        this.saveState();

        let ipAlloc = null;
        if (typeof Pool !== 'undefined' && typeof Pool.acquireForRegistration === 'function') {
          ipAlloc = await Pool.acquireForRegistration(existingAcct, {
            exclude: sessionUsedIps,
            log: s => { if (!isAborted()) { nextItem.step = s; this.paint(); } },
          }).catch(e => ({ ok: false, cooling: false, error: cleanErr(e) }));
        } else {
          ipAlloc = { ok: true, proxy: existingAcct?.proxy || '', proxyIp: existingAcct?.proxyIp || '127.0.0.1', ip: '', region: existingAcct?.region || 'US' };
        }
        if (isAborted() || !st.pending.includes(nextItem)) {
          if (st.pending.includes(nextItem)) { nextItem.status = 'queued'; nextItem.step = '已暂停'; this.saveState(); }
          break;
        }

        if (!ipAlloc || !ipAlloc.ok) {
          if (ipAlloc?.cooling && ipAlloc?.waitMs > 0) {
            const waitMs = Math.max(5000, ipAlloc.waitMs);
            const readyAt = now() + waitMs;
            for (const pItem of st.pending) {
              if (pItem.status === 'running' || pItem.status === 'queued') {
                pItem.status = 'cooling';
                pItem.readyAt = readyAt;
                pItem.step = (ipAlloc.error || '可用 ProxyIP 均在 30 分钟注册冷却中') + ' · 冷却结束后自动继续';
              }
            }
            this.saveState();
            this.ensureTimer();
            break;
          }
          // 节点或线路分配出错（非单纯 IP 冷却）-> 归入注册失败列表，避免无限重复冷却
          const idx = st.pending.indexOf(nextItem);
          if (idx >= 0) st.pending.splice(idx, 1);
          st.failed.unshift({
            id: nextItem.id,
            email: nextItem.email,
            raw: nextItem.raw,
            acctId: nextItem.acctId || existingAcct?.id || '',
            reason: ipAlloc?.error || '未找到可用 ProxyIP，请检查节点或 ProxyIP 池',
            failedAt: now(),
            tokenInvalid: false,
          });
          this.saveState();
          continue;
        }

        const pip = ipAlloc.proxyIp || '';
        if (pip) {
          sessionUsedIps.add(pip);
          sessionUsedIps.add(pip.toLowerCase());
          if (ipAlloc.ip) sessionUsedIps.add(String(ipAlloc.ip).toLowerCase());
        }
        nextItem.proxyIp = pip || ipAlloc.ip || '';

        // 3. 生成该账号专属独立指纹并保存账号
        nextItem.step = '正在生成独立浏览器指纹并绑定 ProxyIP（' + (nextItem.proxyIp || '独立出口') + '）…';
        this.saveState();
        const fp = await this.uniqueFp(usedFpSigs);
        const targetPw = nextItem.password || fxPw;

        try {
          const savedAcct = await Host.saveAccount({
            id: existingAcct?.id,
            name: existingAcct?.name && !/^账号 ?\d*$/.test(existingAcct.name) ? existingAcct.name : tok.email,
            email: tok.email,
            password: targetPw,
            proxy: ipAlloc.proxy || existingAcct?.proxy || '',
            proxyIp: pip,
            nodeId: ipAlloc.nodeId || existingAcct?.nodeId || '',
            region: ipAlloc.region || existingAcct?.region || 'US',
            fp,
          });
          if (!savedAcct?.id || savedAcct.error) throw new Error(savedAcct?.error || '保存账号失败');
          nextItem.acctId = savedAcct.id;
          byEmail.set(tok.email.toLowerCase(), savedAcct);
          await MailToken.save(savedAcct.id, { ...tok, pw: targetPw, password: targetPw });
          void Promise.resolve(Host.shared('regpw@' + savedAcct.id, { email: tok.email, pw: targetPw, src: 'batch' })).catch(() => {});

          if (isAborted() || !st.pending.includes(nextItem)) {
            if (st.pending.includes(nextItem)) { nextItem.status = 'queued'; nextItem.step = '已暂停'; this.saveState(); }
            break;
          }

          // 4. 纯协议执行：预热会话 -> 纯协议 reCAPTCHA Enterprise -> 发送验证邮件 -> 轮询收件地址取码/链接 -> 验证并设置固定密码 -> 写入登录卡片
          nextItem.step = '正在执行纯协议注册、收件验证并设置固定密码…';
          this.saveState();

          const clearStaleProvisionalCookies = async id => {
            if (typeof Host.setCookies !== 'function') return;
            const staleNames = ['arena-auth-prod-v1', 'arena-auth-prod-v1.0', 'arena-auth-prod-v1.1'];
            try {
              await Host.setCookies(id, staleNames.map(name => ({
                url: 'https://arena.ai',
                name,
                value: '',
                domain: '.arena.ai',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'lax',
                expirationDate: 1,
              })));
            } catch {}
          };

          let regRes = null;
          if (typeof Host.registerTokenAccount === 'function') {
            for (let regTry = 0; regTry < 3; regTry++) {
              await clearStaleProvisionalCookies(savedAcct.id);
              regRes = await Promise.race([
                Host.registerTokenAccount(savedAcct.id, {
                  tokenLine: nextItem.raw,
                  password: targetPw,
                  mailTimeoutMs: regTry > 0 ? 180000 : 120000,
                  pollMs: regTry > 0 ? 42000 : 3500,
                }),
                new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(Object.assign(new Error('已暂停或取消'), { aborted: true })), { once: true })),
              ]);
              if (isAborted() || !st.pending.includes(nextItem)) break;
              const errStr = String(regRes?.error || '');
              if (errStr && /尚未确认登录会话|AUTH_SESSION_MISSING/i.test(errStr) && typeof Host.signInAccount === 'function') {
                nextItem.step = '已设置密码，正在完成协议会话登录确认…';
                this.saveState();
                await clearStaleProvisionalCookies(savedAcct.id);
                const signRes = await Host.signInAccount(savedAcct.id).catch(e => ({ error: String(e?.message || e) }));
                if (signRes && !signRes.error && (signRes.ok || signRes.email)) {
                  regRes = { ok: true, email: signRes.email || tok.email, ip: signRes.ip || ipAlloc.ip || '', loc: signRes.loc || ipAlloc.region || '' };
                  break;
                }
              }
              const cdMatch = errStr && /after\s+(\d+)\s*seconds?|等待\s*(\d+)\s*秒/i.exec(errStr);
              if (cdMatch && regTry < 2) {
                const waitSec = Math.min(75, Math.max(2, Number(cdMatch[1] || cdMatch[2]) + 2));
                for (let rem = waitSec; rem > 0; rem--) {
                  if (isAborted() || !st.pending.includes(nextItem)) break;
                  nextItem.step = '官方发信安全冷却中（' + rem + 's），冷却后自动继续注册与设密…';
                  this.paint();
                  await new Promise(r => setTimeout(r, 1000));
                }
                if (isAborted() || !st.pending.includes(nextItem)) break;
                nextItem.step = '冷却结束，正在继续执行纯协议验证与设置密码…';
                this.saveState();
                continue;
              }
              break;
            }
          } else {
            throw Object.assign(new Error('当前环境需要宿主协议注册通道'), { routeRetry: false });
          }

          if (isAborted() || !st.pending.includes(nextItem)) {
            if (st.pending.includes(nextItem)) { nextItem.status = 'queued'; nextItem.step = '已暂停'; this.saveState(); }
            break;
          }

          if (regRes?.error) {
            const isMailFail = !!(regRes.mailFailed || regRes.tokenInvalid || /令牌|收件|邮件|取码|验证码|超时|invalid_api_key|not_found|401|403|404/i.test(regRes.error));
            throw Object.assign(new Error(regRes.error), { mailFailed: isMailFail, tokenInvalid: isMailFail });
          }

          // 5. 注册成功：移出待注册列表，记入成功列表，并立即刷新登录卡片
          const idx = st.pending.indexOf(nextItem);
          if (idx >= 0) st.pending.splice(idx, 1);
          st.succeeded.unshift({
            id: savedAcct.id,
            email: regRes?.email || tok.email,
            proxyIp: pip,
            ip: regRes?.ip || ipAlloc.ip || '',
            loc: regRes?.loc || ipAlloc.region || '',
            at: now(),
          });
          this.saveState();

          try { await Nodes.refreshAccts(); } catch {}
          if (typeof LaunchPick !== 'undefined') {
            LaunchPick.cache = null;
            LaunchPick.cacheAt = 0;
            const lp = document.querySelector('.lpick:not(.out)');
            if (lp) { lp.remove(); void LaunchPick.show({ back: true }); }
          }
          toast('✓ 已协议注册并加入登录卡片：' + (regRes?.email || tok.email));
        } catch (regErr) {
          if (regErr?.aborted || isAborted()) {
            if (st.pending.includes(nextItem)) {
              nextItem.status = 'queued';
              nextItem.readyAt = 0;
              nextItem.step = '已暂停';
              this.saveState();
            }
            break;
          }
          const errMsg = cleanErr(regErr);
          const isMailErr = !!(regErr?.mailFailed || regErr?.tokenInvalid || /令牌|收件|邮件|取码|验证码|超时|invalid_api_key|not_found|401|403|404/i.test(errMsg));
          // 注册出错不再无限进入冷却循环，统一移入「注册失败列表」，由用户一键重试、移除或删除
          const idx = st.pending.indexOf(nextItem);
          if (idx >= 0) st.pending.splice(idx, 1);
          st.failed.unshift({
            id: nextItem.id,
            email: nextItem.email,
            raw: nextItem.raw,
            acctId: nextItem.acctId || '',
            reason: errMsg,
            failedAt: now(),
            tokenInvalid: isMailErr,
          });
          this.saveState();
        }
      }
    } finally {
      if (this.abortCtl === ctl) this.abortCtl = null;
      this.running = false;
      this.paint();
    }
  },

  pause() {
    this.paused = true;
    try { this.abortCtl?.abort(); } catch {}
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    const st = this.loadState();
    for (const it of st.pending) {
      if (it.status === 'cooling' || it.status === 'running') {
        it.status = 'queued';
        it.readyAt = 0;
        it.step = '已暂停';
      }
    }
    this.running = false;
    this.saveState();
  },

  cancelAll() {
    this.paused = true;
    try { this.abortCtl?.abort(); } catch {}
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    const st = this.loadState();
    for (const it of st.pending) {
      it.status = 'queued';
      it.readyAt = 0;
      it.step = '已取消运行';
    }
    this.running = false;
    this.saveState();
  },

  removeItem(listName, item) {
    const st = this.loadState();
    const arr = listName === 'failed' ? st.failed : st.pending;
    const isRun = item?.status === 'running';
    const idx = arr.indexOf(item);
    if (idx >= 0) arr.splice(idx, 1);
    if (isRun) {
      try { this.abortCtl?.abort(); } catch {}
    }
    this.saveState();
  },

  async deleteItem(listName, item) {
    this.removeItem(listName, item);
    try {
      let acctId = item?.acctId || '';
      if (!acctId && item?.email && typeof Host.listAccounts === 'function') {
        const accts = (await Host.listAccounts(true).catch(() => [])) || [];
        const found = accts.find(a => String(a.email || '').toLowerCase() === String(item.email || '').toLowerCase());
        if (found?.id) acctId = found.id;
      }
      if (acctId && typeof Host.removeAccount === 'function') {
        await Host.removeAccount(acctId).catch(() => {});
        try { await Nodes.refreshAccts(); } catch {}
        if (typeof LaunchPick !== 'undefined') { LaunchPick.cache = null; LaunchPick.cacheAt = 0; }
      }
    } catch {}
  },
};

Object.assign(UI, {
  async batchTokenRegister(prefill = '', presetPw = '') {
    const st = BatchTokenReg.loadState();
    const fxLoaded = await FixedPw.load();
    const initPw = presetPw || fxLoaded.pw || '';

    const ta = h('textarea', {
      class: 'packbox btr-ta',
      rows: 4,
      spellcheck: 'false',
      placeholder: '一行一个号（邮箱----收件地址 或 邮箱----密码----clientId----刷新令牌）：\ndecals.vise-2q@icloud.com----https://ic-mail.tibosb.cloud/api/v1/access/.../mailboxes/decals.vise-2q@icloud.com/code\ntab.prelate_7e@icloud.com----https://www.yunapi.pro/api/key=...',
    }, prefill || '');

    const pw = pwField(initPw, '固定密码（至少8位，含大小写字母与符号）');
    const pwSaveBtn = h('button', {
      type: 'button',
      class: 'btn ghost sm',
      title: '保存固定密码',
      onclick: async () => {
        const v = pw.inp.value.trim();
        if (!BatchTokenReg.validFixedPw(v)) {
          toast('固定密码需至少 8 位，且包含大写字母、小写字母和符号', 'err');
          pw.inp.focus();
          return;
        }
        await FixedPw.save(true, v);
        toast('固定密码已保存');
      },
    }, icon('check'), '保存');

    // 圆形 i 图标按钮：点击展开/收起注意事项，不使用卡片背景常驻大段文字
    const btrHelpPop = h('div', { class: 'lnote-detail btr-help-pop', hidden: true },
      '• 每个账号自动生成独立浏览器指纹 + 分配 30 分钟内未注册过的独立 ProxyIP。\n' +
      '• 纯协议完成 Google reCAPTCHA Enterprise 验证、发送注册邮件、轮询收件接口取验证码/链接并设置固定密码。\n' +
      '• 注册失败或收件异常将直接移入右侧「注册失败列表」，不会重复进入冷却死循环；可随时暂停、取消、移除或删除。');
    const btrHelpBtn = h('button', {
      type: 'button',
      class: 'lnote-i',
      title: '查看批量注册注意事项',
      'aria-label': '查看批量注册注意事项',
      'aria-expanded': 'false',
      onclick: () => {
        btrHelpPop.hidden = !btrHelpPop.hidden;
        btrHelpBtn.setAttribute('aria-expanded', String(!btrHelpPop.hidden));
      },
    }, 'i');

    const fin = h('input', {
      type: 'file',
      accept: '.txt,.csv,text/plain',
      style: 'display:none',
      onchange: async () => {
        const f = fin.files?.[0];
        fin.value = '';
        if (!f) return;
        try {
          const t = (await f.text()).trim();
          ta.value = ta.value.trim() ? ta.value.trim() + '\n' + t : t;
          toast('已读取文件内容，点「加入队列并开始注册」即可');
        } catch (e) {
          toast('读取文件失败：' + describe(e), 'err');
        }
      },
    });

    const addAndStartBtn = h('button', {
      type: 'button',
      class: 'btn',
      onclick: async () => {
        const v = pw.inp.value.trim();
        if (!BatchTokenReg.validFixedPw(v)) {
          toast('请先填写合规的固定密码（至少 8 位，含大写、小写字母和符号）', 'err');
          pw.inp.focus();
          return;
        }
        await FixedPw.save(true, v);
        if (ta.value.trim()) {
          const { added, bad } = BatchTokenReg.enqueueText(ta.value);
          ta.value = '';
          if (added || bad) toast(`已加入待注册列表 ${added} 个${bad ? '，格式错误归入失败列表 ' + bad + ' 个' : ''}`);
        } else if (!st.pending.length && st.failed.some(x => x.raw && !x.tokenInvalid)) {
          const retryable = st.failed.filter(x => x.raw && !x.tokenInvalid);
          st.failed = st.failed.filter(x => !x.raw || x.tokenInvalid);
          for (const fItem of retryable) {
            st.pending.push({
              id: fItem.id || ('btr_' + Date.now().toString(36)),
              email: fItem.email,
              raw: fItem.raw,
              acctId: fItem.acctId || '',
              status: 'queued',
              step: '手动重新加入待注册队列',
              proxyIp: '',
              readyAt: 0,
              addedAt: now(),
            });
          }
          BatchTokenReg.saveState();
          toast(`已将失败列表中的 ${retryable.length} 个账号移回待注册队列`);
        }
        void BatchTokenReg.start(v);
      },
    }, icon('login'), '加入队列并开始注册');

    const pauseBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs',
      title: '暂停或继续注册队列',
      onclick: () => {
        if (BatchTokenReg.running || st.pending.some(x => x.status === 'cooling')) {
          BatchTokenReg.pause();
          toast('已暂停批量注册队列');
        } else {
          void BatchTokenReg.start(pw.inp.value.trim());
        }
      },
    }, icon('stop'), '暂停');

    const cancelBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs',
      title: '取消当前正在执行的注册与冷却等待',
      onclick: () => {
        BatchTokenReg.cancelAll();
        toast('已取消当前批量注册任务');
      },
    }, icon('x'), '取消');

    const pendingCountEl = h('span', { class: 'tagb' }, '0');
    const failedCountEl = h('span', { class: 'tagb bad' }, '0');
    const okCountEl = h('span', { class: 'tagb ok' }, '✓ 0');
    const poolCoolSumEl = h('span', { class: 'dim btr-cool-sum' }, '');

    const pendingBox = h('div', { class: 'btr-list btr-pending-list' });
    const failedBox = h('div', { class: 'btr-list btr-failed-list' });

    const paintLists = () => {
      const nowMs = now();
      const isActive = BatchTokenReg.running || st.pending.some(x => x.status === 'cooling');
      pauseBtn.replaceChildren(icon(isActive ? 'stop' : 'send'), isActive ? '暂停' : '继续');
      pendingCountEl.textContent = String(st.pending.length);
      failedCountEl.textContent = String(st.failed.length);
      okCountEl.textContent = '✓ 已成功 ' + st.succeeded.length;

      const availCount = typeof Pool !== 'undefined' && Pool.regAvail ? Pool.regAvail().length : 0;
      const minCool = typeof Pool !== 'undefined' && Pool.earliestRegCoolWait ? Pool.earliestRegCoolWait() : 0;
      poolCoolSumEl.textContent = `可用 IP ${availCount}` + (minCool > 0 ? ` · 冷却 ${BatchTokenReg.fmtCool(minCool)}` : ' · 冷却 30m');

      if (!st.pending.length) {
        pendingBox.replaceChildren(h('div', { class: 'btr-empty dim' }, '暂无待注册账号'));
      } else {
        pendingBox.replaceChildren(...st.pending.map(item => {
          const isCooling = item.status === 'cooling';
          const isRun = item.status === 'running';
          const remMs = isCooling && item.readyAt ? Math.max(0, item.readyAt - nowMs) : 0;
          const badge = isRun
            ? h('span', { class: 'tagb ok' }, h('i', { class: 'spin' }), '注册中')
            : isCooling
              ? h('span', { class: 'tagb warn' }, '冷却 ' + BatchTokenReg.fmtCool(remMs))
              : h('span', { class: 'tagb dim' }, '待注册');
          return h('div', { class: 'btr-row' + (isRun ? ' is-run' : isCooling ? ' is-cool' : '') },
            h('div', { class: 'btr-row-main' },
              h('b', { class: 'btr-email', title: item.email }, item.email),
              badge,
              item.proxyIp ? h('span', { class: 'btr-pip mono dim' }, item.proxyIp) : null,
              h('span', { class: 'grow' }),
              (isRun || isCooling) ? h('button', {
                type: 'button',
                class: 'ib btr-ib',
                title: '暂停此任务',
                onclick: () => { BatchTokenReg.pause(); toast('已暂停'); },
              }, icon('stop')) : null,
              h('button', {
                type: 'button',
                class: 'ib btr-ib',
                title: '移除（从待注册列表移除）',
                onclick: () => BatchTokenReg.removeItem('pending', item),
              }, icon('x')),
              h('button', {
                type: 'button',
                class: 'ib btr-ib danger',
                title: '删除（移除并删除已创建的同名账号）',
                onclick: () => void BatchTokenReg.deleteItem('pending', item),
              }, icon('trash'))),
            h('div', { class: 'btr-row-sub dim' },
              isCooling && remMs > 0
                ? `等待 ProxyIP 冷却（${BatchTokenReg.fmtCool(remMs)}）`
                : (item.step || '排队等待中')));
        }));
      }

      if (!st.failed.length) {
        failedBox.replaceChildren(h('div', { class: 'btr-empty dim' }, '暂无注册失败账号'));
      } else {
        failedBox.replaceChildren(...st.failed.map(fItem => h('div', { class: 'btr-row is-fail' },
          h('div', { class: 'btr-row-main' },
            h('b', { class: 'btr-email', title: fItem.email }, fItem.email),
            h('span', { class: 'tagb bad' }, fItem.tokenInvalid ? '令牌失效' : '注册失败'),
            h('span', { class: 'grow' }),
            h('button', {
              type: 'button',
              class: 'ib btr-ib',
              title: '重试（移回待注册列表）',
              onclick: () => {
                const idx = st.failed.indexOf(fItem);
                if (idx >= 0) st.failed.splice(idx, 1);
                st.pending.push({
                  id: fItem.id || ('btr_' + Date.now().toString(36)),
                  email: fItem.email,
                  raw: fItem.raw,
                  acctId: fItem.acctId || '',
                  status: 'queued',
                  step: '手动重新加入待注册队列',
                  proxyIp: '',
                  readyAt: 0,
                  addedAt: now(),
                });
                BatchTokenReg.saveState();
                if (!BatchTokenReg.running) void BatchTokenReg.start(pw.inp.value.trim());
              },
            }, icon('refresh')),
            h('button', {
              type: 'button',
              class: 'ib btr-ib',
              title: '移除此条记录',
              onclick: () => BatchTokenReg.removeItem('failed', fItem),
            }, icon('x')),
            h('button', {
              type: 'button',
              class: 'ib btr-ib danger',
              title: '删除此条记录及本地账号',
              onclick: () => void BatchTokenReg.deleteItem('failed', fItem),
            }, icon('trash'))),
          h('div', { class: 'btr-row-sub bad' }, fItem.reason || '无法收取验证邮件，令牌可能已失效'))));
      }
    };

    BatchTokenReg.uiHooks = { paint: paintLists };
    paintLists();

    const body = h('div', { class: 'btr-wrap' },
      h('div', { class: 'btr-pw-bar' },
        h('label', { class: 'btr-pw-lab' }, icon('key'), '固定密码'),
        pw.el,
        pwSaveBtn,
        btrHelpBtn,
        h('span', { class: 'grow' }),
        poolCoolSumEl,
        okCountEl),
      btrHelpPop,
      h('div', { class: 'lrow btr-tool-bar' },
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => fin.click() }, icon('file'), '导入文件'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => { try { const t = (await navigator.clipboard.readText()).trim(); if (t) ta.value = ta.value.trim() ? ta.value.trim() + '\n' + t : t; } catch { ta.focus(); } } }, icon('copy'), '粘贴令牌'),
        h('span', { class: 'grow' }),
        fin),
      ta,
      h('div', { class: 'btr-cols' },
        h('section', { class: 'btr-col btr-col-pending' },
          h('div', { class: 'btr-col-h' },
            h('b', { title: '待注册列表（含等待 IP 冷却自动继续）' }, '待注册列表（含等待 IP 冷却自动继续）'),
            pendingCountEl,
            h('span', { class: 'grow' }),
            pauseBtn,
            cancelBtn,
            h('button', {
              type: 'button',
              class: 'btn ghost xs',
              title: '清空待注册列表',
              onclick: () => { BatchTokenReg.cancelAll(); st.pending.length = 0; BatchTokenReg.saveState(); },
            }, icon('trash'), '清空')),
          pendingBox),
        h('section', { class: 'btr-col btr-col-failed' },
          h('div', { class: 'btr-col-h' },
            h('b', { title: '注册失败列表（收不到邮件 / 令牌失效）' }, '注册失败列表（收不到邮件 / 令牌失效）'),
            failedCountEl,
            h('span', { class: 'grow' }),
            h('button', {
              type: 'button',
              class: 'btn ghost xs',
              title: '复制所有失败的原始令牌行',
              onclick: () => {
                if (!st.failed.length) { toast('失败列表为空'); return; }
                copyText(st.failed.map(x => x.raw).filter(Boolean).join('\n'));
                toast('已复制 ' + st.failed.length + ' 条失败令牌');
              },
            }, icon('copy'), '复制'),
            h('button', {
              type: 'button',
              class: 'btn ghost xs',
              title: '全部移回待注册队列重试',
              onclick: () => {
                if (!st.failed.length) return;
                for (const fItem of st.failed.splice(0)) {
                  st.pending.push({
                    id: fItem.id || ('btr_' + Date.now().toString(36)),
                    email: fItem.email,
                    raw: fItem.raw,
                    acctId: fItem.acctId || '',
                    status: 'queued',
                    step: '批量重新加入待注册队列',
                    proxyIp: '',
                    readyAt: 0,
                    addedAt: now(),
                  });
                }
                BatchTokenReg.saveState();
                if (!BatchTokenReg.running && !BatchTokenReg.paused) void BatchTokenReg.start(pw.inp.value.trim());
              },
            }, icon('refresh'), '重试'),
            h('button', {
              type: 'button',
              class: 'btn ghost xs',
              title: '清空失败列表',
              onclick: () => { st.failed.length = 0; BatchTokenReg.saveState(); },
            }, icon('trash'), '清空')),
          failedBox)));

    const back = modal('批量令牌协议注册', body, K(
      h('button', { class: 'btn ghost', onclick: () => ProxySet.open() }, icon('globe'), 'ProxyIP 池'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', onclick: () => { BatchTokenReg.uiHooks = null; back.remove(); } }, '关闭'),
      addAndStartBtn
    ), 'wide btr-modal');
    return back;
  },
});
